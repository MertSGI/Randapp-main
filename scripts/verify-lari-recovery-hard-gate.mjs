#!/usr/bin/env node
/**
 * LARI P0 Recovery Hard-Gate & Restore-Aware Clone/Cutover Verification (ADIM-024 / WP-05B/C/D)
 *
 * Enforces:
 *   1. P0 Recovery Hard-Gate invariants (evaluateP0RecoveryGate) — fail-closed unless all 8
 *      restore-aware prerequisites pass.
 *   2. WP-05B/C/D + B1/B2/B3/B4 Restore-Aware Clone Connection Boundary & Credential Sanitization:
 *      - Canonical loopback-only host verification (localhost, 127.0.0.1, ::1)
 *      - Rejection of octal (0177.0.0.1), hex (0x7f.0.0.1), decimal integer (2130706433),
 *        IPv6 zone IDs (::1%eth0), nip.io, and LAN hosts
 *      - Rejection of live Supabase hosts (supabase.co, pooler.supabase.com) anywhere in URL,
 *        query parameters, or userinfo
 *      - Disposable clone DB naming convention (lari_restore_[a-zA-Z0-9_]+) and SQLi/comment rejection
 *      - Explicit clone confirmation requirement (LARI_RESTORE_CLONE_CONFIRMED=1)
 *      - Single-pass decodeURIComponent credential decoding with MALFORMED_CREDENTIALS guard
 *      - Regex-metacharacter-safe literal .split().join('***') error message & URI sanitization
 *        with empty-secret no-op guard
 *   3. Worktree-Aware Git HEAD Resolution & Migration Ledger Reconciliation:
 *      - 40-char SHA resolution across standard .git directories and linked git worktrees
 *      - Explicit distinction between MIGRATION_LEDGER_ABSENT (missing schema_migrations table)
 *        and MIGRATION_LEDGER_PRESENT with 0 rows (NEEDS_CLONE_DIFF)
 *      - STAGING_RESTORE_NOT_ATTESTED & baseline fingerprint reconciliation
 *   4. P0 Cutover Catalog Postcondition Verification (queryP0CatalogPostconditions / verifyP0Cutover):
 *      - Verifies public.appointment_access_tokens 7-column schema, postgres owner, rls_enabled,
 *        removal of pre-hardening open policy "Allow public select by token hash",
 *        zero permissive policies for public/anon, zero direct anon table privileges
 *        (SELECT, INSERT, UPDATE, DELETE), and 5 SECURITY DEFINER token RPCs with anon EXECUTE
 *      - Strictly preserves live_p0_accepted: false, live_status: 'LIVE_P0_NOT_APPLIED',
 *        Issue #10 as OPEN_PRODUCTION_BLOCKER, and NO_REMOTE_DB_WRITE = true.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// =============================================================================
// 0. ZERO-REMOTE-EGRESS GUARD (NO_REMOTE_DB_WRITE)
// =============================================================================

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
  if (/supabase\.co|pooler\.supabase\.com/i.test(urlStr)) {
    throw new Error(`NO_REMOTE_DB_WRITE_VIOLATION: Blocked remote network call to ${urlStr}`);
  }
  const parsed = new URL(urlStr, 'http://127.0.0.1');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`NO_REMOTE_DB_WRITE_VIOLATION: Non-loopback fetch blocked (${parsed.hostname})`);
  }
  return originalFetch(input, init);
};

// =============================================================================
// 1. P0 RECOVERY HARD-GATE EVALUATOR (Baseline Contract)
// =============================================================================

export function evaluateP0RecoveryGate(state = {}) {
  const requiredChecks = [
    {
      key: 'loopbackOnlyTarget',
      code: 'NON_LOOPBACK_TARGET_PROHIBITED',
      pass: state.targetHost === '127.0.0.1' || state.targetHost === 'localhost' || state.targetHost === '::1',
    },
    {
      key: 'remoteSupabaseBlocked',
      code: 'LIVE_SUPABASE_PROHIBITED',
      pass: !String(state.targetUrl || '').includes('supabase.co') && !String(state.targetUrl || '').includes('pooler.supabase.com'),
    },
    {
      key: 'cloneConfirmed',
      code: 'CLONE_CONFIRMATION_REQUIRED',
      pass: state.cloneConfirmed === true,
    },
    {
      key: 'cloneNamingValid',
      code: 'INVALID_CLONE_DATABASE_NAME',
      pass: /^lari_restore_[a-zA-Z0-9_]+$/.test(String(state.databaseName || '')),
    },
    {
      key: 'pg17PristineVerified',
      code: 'PG17_PRISTINE_NOT_VERIFIED',
      pass: state.pg17PristineVerified === true,
    },
    {
      key: 'rlsEnablementVerified',
      code: 'RLS_ENABLEMENT_INCOMPLETE',
      pass: state.rlsDisabledTableCount === 0,
    },
    {
      key: 'directWriteRevoked',
      code: 'APPOINTMENTS_DIRECT_UPDATE_NOT_REVOKED',
      pass: state.appointmentsDirectUpdateRevoked === true,
    },
    {
      key: 'tokenTableHardened',
      code: 'TOKEN_TABLE_PUBLIC_SELECT_PRESENT',
      pass: state.tokenTableAnonSelectAllowed === false,
    },
  ];

  const failedReasons = requiredChecks.filter((c) => !c.pass).map((c) => c.code);
  return {
    allowed: failedReasons.length === 0,
    verdict: failedReasons.length === 0 ? 'LOCAL_DISPOSABLE_CLONE_VERIFIED' : 'BLOCKED_FAIL_CLOSED',
    failedReasons,
    productionStatus: 'NO_GO',
    issue10Status: 'OPEN_PRODUCTION_BLOCKER',
  };
}

// =============================================================================
// 2. CLONE CONNECTION BOUNDARY & CREDENTIAL SANITIZATION (WP-05B / B1 / B2)
// =============================================================================

const ALLOWED_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DISALLOWED_DB_NAMES = new Set([
  'postgres',
  'template0',
  'template1',
  'restore_verification',
  'supabase_admin',
  'defaultdb',
  'production',
  'staging',
  'lari_staging',
  'lari_prod',
]);
const CLONE_DB_PATTERN = /^lari_restore_[a-zA-Z0-9_]+$/;

/**
 * Redacts credentials from a PostgreSQL connection URL before logging or emitting.
 * Never returns raw user/password segments even if URL parsing fails.
 */
export function redactDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '<missing>';
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\/[^@/]+@/, '//***:***@').replace(/:[^:@/]+@/, ':***@');
  }
}

/**
 * Scrubs any known secret strings or embedded connection URIs from an error message.
 * Uses literal string .split().join('***') so regex metacharacters in passwords never
 * throw SyntaxError or fail to match. Ignores empty strings as a safe no-op.
 */
export function sanitizeErrorMessage(errOrMessage, secrets = []) {
  let msg = typeof errOrMessage === 'string'
    ? errOrMessage
    : (errOrMessage && typeof errOrMessage.message === 'string' ? errOrMessage.message : 'Unknown database error');

  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      msg = msg.split(secret).join('***');
    }
  }

  msg = msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, (match) => redactDatabaseUrl(match));
  return msg;
}

/**
 * Validates that a connection URL points strictly to a local loopback disposable clone DB
 * and that explicit clone confirmation is present.
 */
export function validateAndParseCloneDatabaseUrl(rawUrl, options = {}) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      reason_code: 'MISSING_DATABASE_URL',
      verdict: 'RESTORED_CLONE_REQUIRED',
      detail: 'No clone database connection URL provided (LARI_RESTORE_CLONE_DB_URL is unset).',
    };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      reason_code: 'MALFORMED_DATABASE_URL',
      verdict: 'VERIFICATION_BLOCKED',
      detail: `Database URL could not be parsed: ${redactDatabaseUrl(trimmed)}`,
    };
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return {
      valid: false,
      reason_code: 'INVALID_PROTOCOL',
      verdict: 'VERIFICATION_BLOCKED',
      detail: `Expected postgres:// or postgresql:// protocol, got '${parsed.protocol}'.`,
    };
  }

  const rawHost = parsed.hostname.toLowerCase();

  // Reject any Supabase remote host or pooler first
  if (
    rawHost.includes('supabase.co') ||
    rawHost.includes('pooler.supabase.com') ||
    trimmed.toLowerCase().includes('supabase.co') ||
    trimmed.toLowerCase().includes('pooler.supabase.com')
  ) {
    return {
      valid: false,
      reason_code: 'LIVE_SUPABASE_PROHIBITED',
      verdict: 'VERIFICATION_BLOCKED',
      detail: 'Direct connection to *.supabase.co or *.pooler.supabase.com is strictly prohibited in WP-05.',
    };
  }

  // Reject non-canonical loopback representations (octal 0177.0.0.1, hex 0x7f.0.0.1, decimal integer 2130706433, IPv6 zone IDs)
  const rawAuthorityMatch = trimmed.match(/^postgres(?:ql)?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)/i);
  const rawHostToken = rawAuthorityMatch ? rawAuthorityMatch[1].toLowerCase() : rawHost;
  const canonicalLoopbackRawTokens = new Set(['localhost', '127.0.0.1', '[::1]']);

  if (!ALLOWED_LOOPBACK_HOSTS.has(rawHost) || !canonicalLoopbackRawTokens.has(rawHostToken)) {
    return {
      valid: false,
      reason_code: 'NON_LOOPBACK_HOST',
      verdict: 'VERIFICATION_BLOCKED',
      detail: `Host '${rawHostToken}' is not an allowed canonical loopback address (localhost, 127.0.0.1, ::1).`,
    };
  }

  let dbName = '';
  try {
    dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return {
      valid: false,
      reason_code: 'INVALID_CLONE_DATABASE_NAME',
      verdict: 'VERIFICATION_BLOCKED',
      detail: 'Database name contains malformed percent-encoding.',
    };
  }

  if (
    !dbName ||
    DISALLOWED_DB_NAMES.has(dbName.toLowerCase()) ||
    !CLONE_DB_PATTERN.test(dbName) ||
    dbName.includes('--')
  ) {
    return {
      valid: false,
      reason_code: 'INVALID_CLONE_DATABASE_NAME',
      verdict: 'VERIFICATION_BLOCKED',
      detail: `Database name '${dbName || '<empty>'}' is rejected. Must match '${CLONE_DB_PATTERN}' (e.g., 'lari_restore_clone') and must not be a generic/default database.`,
    };
  }

  const cloneConfirmed =
    options.cloneConfirmed === true ||
    process.env.LARI_RESTORE_CLONE_CONFIRMED === '1';

  if (!cloneConfirmed) {
    return {
      valid: false,
      reason_code: 'CLONE_CONFIRMATION_REQUIRED',
      verdict: 'VERIFICATION_BLOCKED',
      detail: 'Explicit disposable clone confirmation is required (pass --confirm-disposable-clone or set LARI_RESTORE_CLONE_CONFIRMED=1).',
    };
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      valid: false,
      reason_code: 'INVALID_PORT',
      verdict: 'VERIFICATION_BLOCKED',
      detail: `Invalid TCP port '${parsed.port}'.`,
    };
  }

  let decodedUser = 'postgres';
  let decodedPassword = '';
  try {
    if (parsed.username) {
      decodedUser = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      decodedPassword = decodeURIComponent(parsed.password);
    }
  } catch {
    return {
      valid: false,
      reason_code: 'MALFORMED_CREDENTIALS',
      verdict: 'VERIFICATION_BLOCKED',
      detail: 'Connection URL credentials contain malformed percent-encoding.',
    };
  }

  const normalizedHost = rawHost === '[::1]' ? '::1' : rawHost;

  return {
    valid: true,
    reason_code: 'VALID_DISPOSABLE_CLONE_TARGET',
    verdict: 'READY_TO_CONNECT',
    redacted_url: redactDatabaseUrl(trimmed),
    connectionConfig: {
      host: normalizedHost,
      port,
      database: dbName,
      user: decodedUser,
      password: decodedPassword,
      ssl: false,
      connectionTimeoutMillis: 5000,
    },
    rawSecrets: [parsed.password, decodedPassword, parsed.username, decodedUser].filter(Boolean),
  };
}

// =============================================================================
// 3. WORKTREE-AWARE GIT HEAD & MIGRATION LEDGER RECONCILIATION (WP-05C / B3)
// =============================================================================

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Resolves the 40-char git HEAD SHA from `.git` (handling both standard `.git` directories
 * and linked worktrees where `.git` is a pointer file with `gitdir:` and `commondir`).
 * Returns `'UNKNOWN'` when git metadata cannot be resolved.
 */
export function resolveGitHeadSha(repoRoot = REPO_ROOT) {
  try {
    const dotGitPath = path.join(repoRoot, '.git');
    if (!fs.existsSync(dotGitPath)) return 'UNKNOWN';

    let gitDir = dotGitPath;
    let commonDir = dotGitPath;

    const stat = fs.statSync(dotGitPath);
    if (stat.isFile()) {
      const pointer = fs.readFileSync(dotGitPath, 'utf8').trim();
      const match = pointer.match(/^gitdir:\s*(.+)$/i);
      if (!match) return 'UNKNOWN';
      gitDir = path.resolve(repoRoot, match[1].trim());
      commonDir = gitDir;

      const commondirFile = path.join(gitDir, 'commondir');
      if (fs.existsSync(commondirFile)) {
        const relCommon = fs.readFileSync(commondirFile, 'utf8').trim();
        if (relCommon) {
          commonDir = path.resolve(gitDir, relCommon);
        }
      }
    }

    const headFile = path.join(gitDir, 'HEAD');
    if (!fs.existsSync(headFile)) return 'UNKNOWN';
    const headContent = fs.readFileSync(headFile, 'utf8').trim();

    if (/^[0-9a-f]{40}$/i.test(headContent)) {
      return headContent.toLowerCase();
    }

    const refMatch = headContent.match(/^ref:\s*(.+)$/i);
    if (refMatch) {
      const refName = refMatch[1].trim();
      for (const baseDir of [gitDir, commonDir]) {
        const looseRefPath = path.join(baseDir, refName);
        if (fs.existsSync(looseRefPath)) {
          const sha = fs.readFileSync(looseRefPath, 'utf8').trim();
          if (/^[0-9a-f]{40}$/i.test(sha)) return sha.toLowerCase();
        }
      }
      for (const baseDir of [commonDir, gitDir]) {
        const packedRefsPath = path.join(baseDir, 'packed-refs');
        if (fs.existsSync(packedRefsPath)) {
          const lines = fs.readFileSync(packedRefsPath, 'utf8').split(/\r?\n/);
          for (const line of lines) {
            if (!line || line.startsWith('#') || line.startsWith('^')) continue;
            const [sha, ref] = line.trim().split(/\s+/);
            if (ref === refName && /^[0-9a-f]{40}$/i.test(sha)) {
              return sha.toLowerCase();
            }
          }
        }
      }
    }
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

export async function queryCloneCatalog(client) {
  const dbInfoRes = await client.query(`
    SELECT current_database() AS db_name, current_user AS db_user, version() AS pg_version
  `);
  const dbInfo = dbInfoRes.rows[0] || {};

  const tablesRes = await client.query(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname ASC
  `);

  const policiesRes = await client.query(`
    SELECT tablename, policyname, permissive, roles::text AS roles, cmd,
           COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename ASC, policyname ASC
  `);

  const routinesRes = await client.query(`
    SELECT p.proname AS routine_name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           p.prosecdef AS security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname ASC, identity_args ASC
  `);

  const tablePrivsRes = await client.query(`
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ORDER BY table_name ASC, grantee ASC, privilege_type ASC
  `);

  const routinePrivsRes = await client.query(`
    SELECT routine_name, specific_name, grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ORDER BY routine_name ASC, grantee ASC, privilege_type ASC
  `);

  let appliedMigrations = null;
  let migrationLedgerStatus = 'MIGRATION_LEDGER_ABSENT';
  try {
    const ledgerExistsRes = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'supabase_migrations'
          AND c.relname = 'schema_migrations'
          AND c.relkind IN ('r', 'v', 'm', 'p')
      ) AS ledger_exists
    `);
    const ledgerExists = Boolean(ledgerExistsRes.rows[0]?.ledger_exists);
    if (ledgerExists) {
      const migRes = await client.query(`
        SELECT version::text AS version
        FROM supabase_migrations.schema_migrations
        ORDER BY version ASC
      `);
      appliedMigrations = migRes.rows.map((r) => r.version);
      migrationLedgerStatus = 'MIGRATION_LEDGER_PRESENT';
    }
  } catch {
    appliedMigrations = null;
    migrationLedgerStatus = 'MIGRATION_LEDGER_ABSENT';
  }

  const tablesJson = JSON.stringify(tablesRes.rows);
  const policiesJson = JSON.stringify(policiesRes.rows);
  const routinesJson = JSON.stringify(routinesRes.rows);
  const privsJson = JSON.stringify({
    tables: tablePrivsRes.rows,
    routines: routinePrivsRes.rows,
  });

  const fingerprints = {
    table_inventory_sha256: sha256Hex(tablesJson),
    policy_inventory_sha256: sha256Hex(policiesJson),
    routine_inventory_sha256: sha256Hex(routinesJson),
    privilege_inventory_sha256: sha256Hex(privsJson),
  };
  fingerprints.composite_catalog_sha256 = sha256Hex(JSON.stringify(fingerprints));

  return {
    db_name: dbInfo.db_name || 'unknown',
    db_user: dbInfo.db_user || 'unknown',
    pg_version: dbInfo.pg_version || 'unknown',
    table_count: tablesRes.rows.length,
    policy_count: policiesRes.rows.length,
    routine_count: routinesRes.rows.length,
    applied_migrations: appliedMigrations,
    migration_ledger_status: migrationLedgerStatus,
    fingerprints,
    tables: tablesRes.rows,
    policies: policiesRes.rows,
    routines: routinesRes.rows,
    table_privileges: tablePrivsRes.rows,
    routine_privileges: routinePrivsRes.rows,
  };
}

export function parseExpectedBaselineFingerprints(matrixContent) {
  if (!matrixContent || typeof matrixContent !== 'string') {
    return null;
  }
  const extract = (key) => {
    const match = matrixContent.match(new RegExp(`${key}:\\s*\`?([0-9a-f]{64})\`?`, 'i'));
    return match ? match[1].toLowerCase() : null;
  };
  const table = extract('table_inventory_sha256');
  const policy = extract('policy_inventory_sha256');
  const routine = extract('routine_inventory_sha256');
  const privilege = extract('privilege_inventory_sha256');
  const composite = extract('composite_catalog_sha256');

  if (!table || !policy || !routine || !privilege || !composite) {
    return null;
  }
  return {
    table_inventory_sha256: table,
    policy_inventory_sha256: policy,
    routine_inventory_sha256: routine,
    privilege_inventory_sha256: privilege,
    composite_catalog_sha256: composite,
  };
}

export function reconcileCatalogWithMatrix(catalog, matrixContent, repoRoot = REPO_ROOT) {
  const sourceHeadSha = resolveGitHeadSha(repoRoot);
  const sourceHeadVerified = /^[0-9a-f]{40}$/.test(sourceHeadSha);

  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
  const repoMigrations = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];

  const expectedFingerprints = parseExpectedBaselineFingerprints(matrixContent);

  const ledgerStatus =
    catalog.migration_ledger_status ||
    (Array.isArray(catalog.applied_migrations) ? 'MIGRATION_LEDGER_PRESENT' : 'MIGRATION_LEDGER_ABSENT');

  let migrationReconciliationStatus = 'MIGRATION_LEDGER_ABSENT';
  if (ledgerStatus === 'MIGRATION_LEDGER_PRESENT' && Array.isArray(catalog.applied_migrations)) {
    if (catalog.applied_migrations.length === 0) {
      migrationReconciliationStatus = 'NEEDS_CLONE_DIFF';
    } else {
      migrationReconciliationStatus = 'LEDGER_COMPARED';
    }
  }

  let catalogReconciliationStatus = 'CATALOG_BASELINE_MISSING';
  const fingerprintDiffs = [];

  if (expectedFingerprints) {
    for (const key of Object.keys(expectedFingerprints)) {
      if (catalog.fingerprints[key] !== expectedFingerprints[key]) {
        fingerprintDiffs.push({
          key,
          expected: expectedFingerprints[key],
          actual: catalog.fingerprints[key],
        });
      }
    }
    catalogReconciliationStatus =
      fingerprintDiffs.length === 0 ? 'BASELINE_FINGERPRINTS_MATCH' : 'BASELINE_FINGERPRINTS_DIVERGED';
  }

  return {
    source_head_sha: sourceHeadSha,
    source_head_status: sourceHeadVerified ? 'SOURCE_HEAD_VERIFIED' : 'SOURCE_HEAD_UNVERIFIED',
    staging_restore_status: 'STAGING_RESTORE_NOT_ATTESTED',
    repo_migration_count: repoMigrations.length,
    clone_applied_migration_count: Array.isArray(catalog.applied_migrations)
      ? catalog.applied_migrations.length
      : null,
    migration_ledger_status: ledgerStatus,
    migration_reconciliation_status: migrationReconciliationStatus,
    catalog_reconciliation_status: catalogReconciliationStatus,
    fingerprint_diffs: fingerprintDiffs,
    reconciliation_verdict:
      sourceHeadVerified &&
      catalogReconciliationStatus === 'BASELINE_FINGERPRINTS_MATCH' &&
      migrationReconciliationStatus === 'LEDGER_COMPARED'
        ? 'RECONCILED_WITH_BASELINE'
        : migrationReconciliationStatus === 'MIGRATION_LEDGER_ABSENT'
          ? 'MIGRATION_LEDGER_ABSENT'
          : 'NEEDS_CLONE_DIFF',
  };
}

// =============================================================================
// 4. P0 CUTOVER CATALOG POSTCONDITIONS (WP-05D / B4)
// =============================================================================

export const REQUIRED_TOKEN_COLUMNS = [
  { column_name: 'id', data_type: 'uuid' },
  { column_name: 'tenant_id', data_type: 'text' },
  { column_name: 'appointment_id', data_type: 'uuid' },
  { column_name: 'token_hash', data_type: 'text' },
  { column_name: 'expires_at', data_type: 'timestamp with time zone' },
  { column_name: 'created_at', data_type: 'timestamp with time zone' },
  { column_name: 'used_at', data_type: 'timestamp with time zone' },
];

export const REQUIRED_TOKEN_RPCS = [
  'create_public_booking',
  'get_public_appointment_by_manage_token',
  'cancel_public_appointment_by_manage_token',
  'request_public_appointment_reschedule_by_manage_token',
  'get_public_pending_reschedule_request_by_manage_token',
];

export async function queryP0CatalogPostconditions(client) {
  const checks = [];
  const record = (id, passed, reason_code, detail) => {
    checks.push({ id, passed: Boolean(passed), reason_code, detail });
  };

  // 1. Table existence, relkind='r', owner='postgres', rls_enabled=true
  const relRes = await client.query(`
    SELECT c.relkind::text AS relkind,
           pg_get_userbyid(c.relowner)::text AS owner,
           c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'appointment_access_tokens'
  `);

  if (relRes.rows.length === 0) {
    record(
      'table_exists_and_rls_enabled',
      false,
      'TABLE_MISSING',
      'public.appointment_access_tokens does not exist in target catalog.'
    );
    return {
      all_passed: false,
      verdict: 'P0_NOT_APPLIED',
      checks,
    };
  }

  const rel = relRes.rows[0];
  record(
    'table_relkind_regular',
    rel.relkind === 'r',
    rel.relkind === 'r' ? 'OK' : 'NOT_A_TABLE',
    `relkind='${rel.relkind}' (expected 'r')`
  );
  record(
    'table_owner_postgres',
    rel.owner === 'postgres',
    rel.owner === 'postgres' ? 'OK' : 'UNEXPECTED_OWNER',
    `owner='${rel.owner}' (expected 'postgres')`
  );
  record(
    'table_rls_enabled',
    rel.rls_enabled === true,
    rel.rls_enabled === true ? 'OK' : 'RLS_NOT_ENABLED',
    `relrowsecurity=${rel.rls_enabled}`
  );

  // 2. Column schema check
  const colRes = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointment_access_tokens'
    ORDER BY ordinal_position ASC
  `);
  const colMap = new Map(colRes.rows.map((r) => [r.column_name, r.data_type]));
  const missingOrMismatchedCols = [];
  for (const reqCol of REQUIRED_TOKEN_COLUMNS) {
    const actualType = colMap.get(reqCol.column_name);
    if (actualType !== reqCol.data_type) {
      missingOrMismatchedCols.push(
        `${reqCol.column_name} (expected '${reqCol.data_type}', got '${actualType || 'MISSING'}')`
      );
    }
  }
  if (colRes.rows.length !== REQUIRED_TOKEN_COLUMNS.length) {
    missingOrMismatchedCols.push(
      `column_count=${colRes.rows.length} (expected ${REQUIRED_TOKEN_COLUMNS.length})`
    );
  }
  record(
    'table_column_schema',
    missingOrMismatchedCols.length === 0,
    missingOrMismatchedCols.length === 0 ? 'OK' : 'COLUMN_SCHEMA_MISMATCH',
    missingOrMismatchedCols.length === 0
      ? 'All 7 expected columns and types verified.'
      : `Column mismatch: ${missingOrMismatchedCols.join(', ')}`
  );

  // 3. Policy checks: "Allow public select by token hash" MUST be absent, and no public/anon true policy may exist
  const polRes = await client.query(`
    SELECT policyname, roles::text AS roles, cmd, COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointment_access_tokens'
  `);

  const hasLegacyOpenPolicy = polRes.rows.some(
    (p) => p.policyname === 'Allow public select by token hash'
  );
  record(
    'legacy_open_policy_absent',
    !hasLegacyOpenPolicy,
    !hasLegacyOpenPolicy ? 'OK' : 'PRE_HARDENING_OPEN_POLICY_PRESENT',
    !hasLegacyOpenPolicy
      ? 'Policy "Allow public select by token hash" is absent.'
      : 'Pre-hardening open policy "Allow public select by token hash" is STILL PRESENT.'
  );

  const permissivePublicPolicies = polRes.rows.filter((p) => {
    const rolesStr = (p.roles || '').toLowerCase();
    const targetsPublicOrAnon = rolesStr.includes('public') || rolesStr.includes('anon');
    const isUnrestrictedTrue =
      p.qual.trim().toLowerCase() === 'true' ||
      p.qual.trim().toLowerCase() === '(true)' ||
      p.with_check.trim().toLowerCase() === 'true' ||
      p.with_check.trim().toLowerCase() === '(true)';
    return targetsPublicOrAnon && isUnrestrictedTrue;
  });

  record(
    'no_permissive_public_or_anon_policy',
    permissivePublicPolicies.length === 0,
    permissivePublicPolicies.length === 0 ? 'OK' : 'PERMISSIVE_POLICY_EXISTS',
    permissivePublicPolicies.length === 0
      ? 'Zero permissive USING(true)/WITH CHECK(true) policies for PUBLIC or anon.'
      : `Permissive policies found: ${permissivePublicPolicies.map((p) => p.policyname).join(', ')}`
  );

  // 4. Direct table privilege checks for anon
  const privRes = await client.query(`
    SELECT
      has_table_privilege('anon', 'public.appointment_access_tokens', 'SELECT') AS anon_select,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'INSERT') AS anon_insert,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'UPDATE') AS anon_update,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'DELETE') AS anon_delete
  `);
  const priv = privRes.rows[0] || {};
  const retainedAnonPrivs = ['select', 'insert', 'update', 'delete'].filter(
    (k) => priv[`anon_${k}`] === true
  );

  record(
    'anon_table_privileges_revoked',
    retainedAnonPrivs.length === 0,
    retainedAnonPrivs.length === 0 ? 'OK' : 'ANON_PRIVILEGES_RETAINED',
    retainedAnonPrivs.length === 0
      ? 'anon has 0 direct table privileges (SELECT/INSERT/UPDATE/DELETE) on public.appointment_access_tokens.'
      : `anon still retains direct table privileges: ${retainedAnonPrivs.join(', ').toUpperCase()}`
  );

  // 5. Required token RPCs exist, are SECURITY DEFINER, and grant EXECUTE to anon
  const rpcRes = await client.query(`
    SELECT p.proname AS routine_name,
           p.prosecdef AS security_definer,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY($1::text[])
  `, [REQUIRED_TOKEN_RPCS]);

  const rpcByName = new Map();
  for (const row of rpcRes.rows) {
    const existing = rpcByName.get(row.routine_name) || [];
    existing.push(row);
    rpcByName.set(row.routine_name, existing);
  }

  const failedRpcs = [];
  for (const rpcName of REQUIRED_TOKEN_RPCS) {
    const candidates = rpcByName.get(rpcName) || [];
    const validOverload = candidates.some(
      (c) => c.security_definer === true && c.anon_execute === true
    );
    if (!validOverload) {
      failedRpcs.push(rpcName);
    }
  }

  record(
    'required_token_rpcs_intact',
    failedRpcs.length === 0,
    failedRpcs.length === 0 ? 'OK' : 'TOKEN_RPC_POSTCONDITION_FAILED',
    failedRpcs.length === 0
      ? `All ${REQUIRED_TOKEN_RPCS.length} required token RPCs are SECURITY DEFINER and executable by anon.`
      : `Missing or non-executable token RPCs: ${failedRpcs.join(', ')}`
  );

  const allPassed = checks.every((c) => c.passed);
  const isUnapplied =
    hasLegacyOpenPolicy || retainedAnonPrivs.includes('select');

  return {
    all_passed: allPassed,
    verdict: allPassed
      ? 'P0_CUTOVER_POSTCONDITIONS_VERIFIED'
      : isUnapplied
        ? 'P0_NOT_APPLIED'
        : 'P0_VERIFICATION_FAILED',
    checks,
  };
}

export async function verifyP0Cutover(options = {}) {
  const rawUrl = options.databaseUrl ?? process.env.LARI_RESTORE_CLONE_DB_URL ?? '';
  const targetClassification = options.targetClassification || 'RESTORED_CLONE';

  const boundary = validateAndParseCloneDatabaseUrl(rawUrl, {
    cloneConfirmed: options.cloneConfirmed,
  });

  if (!boundary.valid) {
    const isMissingUrl = boundary.reason_code === 'MISSING_DATABASE_URL';
    return {
      status: isMissingUrl ? 'RESTORED_CLONE_REQUIRED' : 'VERIFICATION_BLOCKED',
      reason_code: boundary.reason_code,
      detail: boundary.detail,
      target_classification: targetClassification,
      live_p0_accepted: false,
      live_status: 'LIVE_P0_NOT_APPLIED',
      issue_10_status: 'OPEN_PRODUCTION_BLOCKER',
    };
  }

  const pgModule = await import('pg');
  const Client = pgModule.default?.Client || pgModule.Client;
  const client = new Client(boundary.connectionConfig);

  try {
    await client.connect();
    const postconditions = await queryP0CatalogPostconditions(client);

    return {
      status: postconditions.all_passed
        ? 'CLONE_P0_CUTOVER_VERIFIED'
        : postconditions.verdict,
      reason_code: postconditions.all_passed
        ? 'ALL_P0_POSTCONDITIONS_MET'
        : postconditions.checks.find((c) => !c.passed)?.reason_code || 'POSTCONDITION_FAILED',
      redacted_url: boundary.redacted_url,
      target_classification: targetClassification,
      live_p0_accepted: false,
      live_status: 'LIVE_P0_NOT_APPLIED',
      issue_10_status: 'OPEN_PRODUCTION_BLOCKER',
      postconditions,
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err, boundary.rawSecrets);
    return {
      status: 'CLONE_CONNECTION_FAILED',
      reason_code: 'PG_CONNECTION_ERROR',
      detail: `Failed to connect or query disposable clone at ${boundary.redacted_url}: ${safeMsg}`,
      target_classification: targetClassification,
      live_p0_accepted: false,
      live_status: 'LIVE_P0_NOT_APPLIED',
      issue_10_status: 'OPEN_PRODUCTION_BLOCKER',
    };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore close errors
    }
  }
}

// =============================================================================
// 5. COMPREHENSIVE SELF-TEST SUITE (RUNS WHEN EXECUTED DIRECTLY)
// =============================================================================

async function runSelfTests() {
  console.log('=== LARI P0 RECOVERY HARD-GATE & RESTORE-AWARE VERIFICATION (ADIM-024) ===\n');
  let passed = 0;

  function check(label, fn) {
    fn();
    passed++;
    console.log(`  [PASS] ${label}`);
  }

  // ---------------------------------------------------------------------------
  // A. Baseline evaluateP0RecoveryGate Checks
  // ---------------------------------------------------------------------------
  console.log('--- §1. Baseline P0 Recovery Hard-Gate Invariants ---');

  check('Rejects remote *.supabase.co URLs and unconfirmed clones (BLOCKED_FAIL_CLOSED)', () => {
    const remoteAttempt = evaluateP0RecoveryGate({
      targetHost: 'db.rwedeejhjazwjthdjzrt.supabase.co',
      targetUrl: 'postgresql://postgres:secret@db.rwedeejhjazwjthdjzrt.supabase.co:5432/postgres',
      cloneConfirmed: false,
      databaseName: 'postgres',
      pg17PristineVerified: true,
      rlsDisabledTableCount: 0,
      appointmentsDirectUpdateRevoked: true,
      tokenTableAnonSelectAllowed: false,
    });
    assert.equal(remoteAttempt.allowed, false);
    assert.equal(remoteAttempt.verdict, 'BLOCKED_FAIL_CLOSED');
    assert.ok(remoteAttempt.failedReasons.includes('NON_LOOPBACK_TARGET_PROHIBITED'));
    assert.ok(remoteAttempt.failedReasons.includes('LIVE_SUPABASE_PROHIBITED'));
    assert.ok(remoteAttempt.failedReasons.includes('CLONE_CONFIRMATION_REQUIRED'));
    assert.ok(remoteAttempt.failedReasons.includes('INVALID_CLONE_DATABASE_NAME'));
  });

  check('Rejects clone when RLS is disabled on any table or appointments direct update is not revoked', () => {
    const unhardenedAttempt = evaluateP0RecoveryGate({
      targetHost: '127.0.0.1',
      targetUrl: 'postgresql://postgres@127.0.0.1:54339/lari_restore_clone',
      cloneConfirmed: true,
      databaseName: 'lari_restore_clone',
      pg17PristineVerified: true,
      rlsDisabledTableCount: 1,
      appointmentsDirectUpdateRevoked: false,
      tokenTableAnonSelectAllowed: true,
    });
    assert.equal(unhardenedAttempt.allowed, false);
    assert.ok(unhardenedAttempt.failedReasons.includes('RLS_ENABLEMENT_INCOMPLETE'));
    assert.ok(unhardenedAttempt.failedReasons.includes('APPOINTMENTS_DIRECT_UPDATE_NOT_REVOKED'));
    assert.ok(unhardenedAttempt.failedReasons.includes('TOKEN_TABLE_PUBLIC_SELECT_PRESENT'));
  });

  check('Accepts local disposable PG17 clone when all 8 hard-gate checks pass while keeping PRODUCTION = NO_GO', () => {
    const validLocalClone = evaluateP0RecoveryGate({
      targetHost: '127.0.0.1',
      targetUrl: 'postgresql://postgres@127.0.0.1:54339/lari_restore_verify_01',
      cloneConfirmed: true,
      databaseName: 'lari_restore_verify_01',
      pg17PristineVerified: true,
      rlsDisabledTableCount: 0,
      appointmentsDirectUpdateRevoked: true,
      tokenTableAnonSelectAllowed: false,
    });
    assert.equal(validLocalClone.allowed, true);
    assert.equal(validLocalClone.verdict, 'LOCAL_DISPOSABLE_CLONE_VERIFIED');
    assert.equal(validLocalClone.productionStatus, 'NO_GO');
    assert.equal(validLocalClone.issue10Status, 'OPEN_PRODUCTION_BLOCKER');
  });

  // ---------------------------------------------------------------------------
  // B. WP-05B/C/D + B1/B2/B3/B4 Restore-Aware Clone Boundary & Sanitization
  // ---------------------------------------------------------------------------
  console.log('\n--- §2. WP-05B/C/D Restore-Aware Clone Connection Boundary & Sanitization ---');

  check('Missing DB URL returns RESTORED_CLONE_REQUIRED cleanly', () => {
    const res = validateAndParseCloneDatabaseUrl('', { cloneConfirmed: true });
    assert.equal(res.valid, false);
    assert.equal(res.reason_code, 'MISSING_DATABASE_URL');
    assert.equal(res.verdict, 'RESTORED_CLONE_REQUIRED');
  });

  check('Non-Postgres protocol (https:// / mysql://) is rejected with INVALID_PROTOCOL', () => {
    const res = validateAndParseCloneDatabaseUrl('https://127.0.0.1:5432/lari_restore_clone', { cloneConfirmed: true });
    assert.equal(res.valid, false);
    assert.equal(res.reason_code, 'INVALID_PROTOCOL');
    assert.equal(res.verdict, 'VERIFICATION_BLOCKED');
  });

  check('Remote Supabase and non-loopback hosts (including nip.io, LAN, query/userinfo tricks) are rejected', () => {
    const badUrls = [
      'postgresql://postgres:secret@db.rwedeejhjazwjthdjzrt.supabase.co:5432/lari_restore_clone',
      'postgresql://postgres:secret@aws-0-eu-central-1.pooler.supabase.com:6543/lari_restore_clone',
      'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_clone?options=db.supabase.co',
      'postgresql://postgres:secret@192.168.1.50:5432/lari_restore_clone',
      'postgresql://postgres:secret@127.0.0.1.nip.io:5432/lari_restore_clone',
    ];
    for (const url of badUrls) {
      const res = validateAndParseCloneDatabaseUrl(url, { cloneConfirmed: true });
      assert.equal(res.valid, false, `Expected URL to be rejected: ${url}`);
      assert.ok(['LIVE_SUPABASE_PROHIBITED', 'NON_LOOPBACK_HOST'].includes(res.reason_code));
    }
  });

  check('Canonical IPv6 loopback [::1] URL is accepted cleanly and normalizes host to ::1', () => {
    const ipv6Url = 'postgresql://user:pass@[::1]:5432/lari_restore_clone';
    const res = validateAndParseCloneDatabaseUrl(ipv6Url, { cloneConfirmed: true });
    assert.equal(res.valid, true, `Expected [::1] loopback to be accepted, got: ${res.reason_code} (${res.detail})`);
    assert.equal(res.reason_code, 'VALID_DISPOSABLE_CLONE_TARGET');
    assert.equal(res.verdict, 'READY_TO_CONNECT');
    assert.equal(res.connectionConfig.host, '::1');
    assert.equal(res.connectionConfig.port, 5432);
    assert.equal(res.connectionConfig.database, 'lari_restore_clone');
  });

  check('Non-canonical loopback representations (octal 0177.0.0.1, hex 0x7f.0.0.1, dword 2130706433, IPv6 zone IDs) are rejected', () => {
    const nonCanonicalLoopbacks = [
      'postgresql://postgres:secret@0177.0.0.1:5432/lari_restore_clone',
      'postgresql://postgres:secret@0x7f.0.0.1:5432/lari_restore_clone',
      'postgresql://postgres:secret@2130706433:5432/lari_restore_clone',
      'postgresql://postgres:secret@[::1%25eth0]:5432/lari_restore_clone',
    ];
    for (const url of nonCanonicalLoopbacks) {
      const res = validateAndParseCloneDatabaseUrl(url, { cloneConfirmed: true });
      assert.equal(res.valid, false, `Expected non-canonical loopback to be rejected: ${url}`);
      assert.ok(['NON_LOOPBACK_HOST', 'MALFORMED_DATABASE_URL'].includes(res.reason_code));
    }
  });

  check('Generic/default database names and SQL comment/injection patterns are rejected with INVALID_CLONE_DATABASE_NAME', () => {
    const badNames = [
      'postgres',
      'template1',
      'restore_verification',
      'lari_staging',
      'production',
      'lari_restore_',
      'lari_restore_bad--name',
      'lari_restore_clone;DROP TABLE users',
    ];
    for (const dbName of badNames) {
      const res = validateAndParseCloneDatabaseUrl(
        `postgresql://postgres:secret@127.0.0.1:5432/${dbName}`,
        { cloneConfirmed: true }
      );
      assert.equal(res.valid, false, `Expected DB name '${dbName}' to be rejected`);
      assert.equal(res.reason_code, 'INVALID_CLONE_DATABASE_NAME');
    }
  });

  check('Unconfirmed disposable clone is rejected with CLONE_CONFIRMATION_REQUIRED', () => {
    const prev = process.env.LARI_RESTORE_CLONE_CONFIRMED;
    delete process.env.LARI_RESTORE_CLONE_CONFIRMED;
    try {
      const res = validateAndParseCloneDatabaseUrl(
        'postgresql://postgres:secret@127.0.0.1:54322/lari_restore_20261011',
        { cloneConfirmed: false }
      );
      assert.equal(res.valid, false);
      assert.equal(res.reason_code, 'CLONE_CONFIRMATION_REQUIRED');
    } finally {
      if (prev !== undefined) process.env.LARI_RESTORE_CLONE_CONFIRMED = prev;
    }
  });

  check('Valid loopback clone URL decodes percent-encoded credentials once and redacts secrets', () => {
    const res = validateAndParseCloneDatabaseUrl(
      'postgresql://lari_admin:my%40secret%3Apass%231@127.0.0.1:54329/lari_restore_20261011',
      { cloneConfirmed: true }
    );
    assert.equal(res.valid, true);
    assert.equal(res.reason_code, 'VALID_DISPOSABLE_CLONE_TARGET');
    assert.equal(res.connectionConfig.host, '127.0.0.1');
    assert.equal(res.connectionConfig.port, 54329);
    assert.equal(res.connectionConfig.database, 'lari_restore_20261011');
    assert.equal(res.connectionConfig.user, 'lari_admin');
    assert.equal(res.connectionConfig.password, 'my@secret:pass#1');
    assert.ok(!res.redacted_url.includes('my%40secret'));
    assert.ok(!res.redacted_url.includes('my@secret'));
  });

  check('Malformed percent-encoded credentials (%ZZ) fail closed with MALFORMED_CREDENTIALS', () => {
    const res = validateAndParseCloneDatabaseUrl(
      'postgresql://postgres:bad%ZZpass@127.0.0.1:54329/lari_restore_20261011',
      { cloneConfirmed: true }
    );
    assert.equal(res.valid, false);
    assert.equal(res.reason_code, 'MALFORMED_CREDENTIALS');
  });

  check('sanitizeErrorMessage redacts regex-metacharacter passwords and embedded URIs without throwing, and treats empty secret as no-op', () => {
    const trickySecret = 'p+a[s]*w(o)rd\\123.*[a-z]?$';
    const rawErr = new Error(
      `Connection failed for ${trickySecret} on postgresql://admin:topSecret99@127.0.0.1:5432/lari_restore_1`
    );
    const sanitized = sanitizeErrorMessage(rawErr, [trickySecret, 'topSecret99', '']);
    assert.ok(!sanitized.includes(trickySecret));
    assert.ok(!sanitized.includes('topSecret99'));
    assert.ok(sanitized.includes('***'));

    const plainMsg = 'Connection refused on 127.0.0.1:54329';
    assert.equal(sanitizeErrorMessage(plainMsg, ['', '']), plainMsg);
  });

  // ---------------------------------------------------------------------------
  // C. Worktree-Aware Git HEAD Resolution & Migration Ledger Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- §3. Worktree-Aware Git HEAD & Migration Ledger Reconciliation ---');

  check('resolveGitHeadSha resolves 40-char hex SHA in repository and linked git worktree, and returns UNKNOWN when .git is absent', () => {
    const repoSha = resolveGitHeadSha(REPO_ROOT);
    assert.match(repoSha, /^[0-9a-f]{40}$/);

    const tmpNonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-nongit-'));
    const tmpMainGit = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-maingit-'));
    const tmpWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-worktree-'));
    const fakeSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
    try {
      assert.equal(resolveGitHeadSha(tmpNonGit), 'UNKNOWN');

      const mainDotGit = path.join(tmpMainGit, '.git');
      const wtGitDir = path.join(mainDotGit, 'worktrees', 'wt1');
      const refsHeadsDir = path.join(mainDotGit, 'refs', 'heads');
      fs.mkdirSync(wtGitDir, { recursive: true });
      fs.mkdirSync(refsHeadsDir, { recursive: true });

      fs.writeFileSync(path.join(refsHeadsDir, 'feature-branch'), `${fakeSha}\n`, 'utf8');
      fs.writeFileSync(path.join(wtGitDir, 'HEAD'), 'ref: refs/heads/feature-branch\n', 'utf8');
      fs.writeFileSync(path.join(wtGitDir, 'commondir'), '../..\n', 'utf8');
      fs.writeFileSync(path.join(tmpWorktree, '.git'), `gitdir: ${wtGitDir}\n`, 'utf8');

      assert.equal(resolveGitHeadSha(tmpWorktree), fakeSha);
    } finally {
      fs.rmSync(tmpNonGit, { recursive: true, force: true });
      fs.rmSync(tmpMainGit, { recursive: true, force: true });
      fs.rmSync(tmpWorktree, { recursive: true, force: true });
    }
  });

  check('reconcileCatalogWithMatrix distinguishes MIGRATION_LEDGER_ABSENT from empty MIGRATION_LEDGER_PRESENT and enforces STAGING_RESTORE_NOT_ATTESTED', () => {
    const fakeFingerprints = {
      table_inventory_sha256: 'a'.repeat(64),
      policy_inventory_sha256: 'b'.repeat(64),
      routine_inventory_sha256: 'c'.repeat(64),
      privilege_inventory_sha256: 'd'.repeat(64),
      composite_catalog_sha256: 'e'.repeat(64),
    };

    const absentRec = reconcileCatalogWithMatrix(
      {
        applied_migrations: null,
        migration_ledger_status: 'MIGRATION_LEDGER_ABSENT',
        fingerprints: fakeFingerprints,
      },
      '# Matrix without baseline hashes',
      REPO_ROOT
    );
    assert.equal(absentRec.staging_restore_status, 'STAGING_RESTORE_NOT_ATTESTED');
    assert.equal(absentRec.migration_ledger_status, 'MIGRATION_LEDGER_ABSENT');
    assert.equal(absentRec.migration_reconciliation_status, 'MIGRATION_LEDGER_ABSENT');
    assert.equal(absentRec.reconciliation_verdict, 'MIGRATION_LEDGER_ABSENT');

    const emptyPresentRec = reconcileCatalogWithMatrix(
      {
        applied_migrations: [],
        migration_ledger_status: 'MIGRATION_LEDGER_PRESENT',
        fingerprints: fakeFingerprints,
      },
      '# Matrix without baseline hashes',
      REPO_ROOT
    );
    assert.equal(emptyPresentRec.migration_ledger_status, 'MIGRATION_LEDGER_PRESENT');
    assert.equal(emptyPresentRec.migration_reconciliation_status, 'NEEDS_CLONE_DIFF');
    assert.equal(emptyPresentRec.reconciliation_verdict, 'NEEDS_CLONE_DIFF');
  });

  // ---------------------------------------------------------------------------
  // D. P0 Cutover Postconditions — Unit Mock + Isolated PGlite Database Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- §4. P0 Cutover Postconditions (Unit + Isolated PGlite DB Verification) ---');

  const resolveP0ProposalSqlPath = () =>
    path.join(
      REPO_ROOT,
      'supabase',
      'tests',
      '20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql'
    );

  check('Proposal SQL 20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql exists and preserves 20260901..20260904 untouched', () => {
    const proposalPath = resolveP0ProposalSqlPath();
    assert.ok(fs.existsSync(proposalPath), 'Missing 20261011 proposal SQL file');
    const sql = fs.readFileSync(proposalPath, 'utf8');
    assert.ok(sql.includes('DROP POLICY IF EXISTS "Allow public select by token hash" ON public.appointment_access_tokens;'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.appointment_access_tokens FROM PUBLIC;'));
    assert.ok(sql.includes('REVOKE ALL ON TABLE public.appointment_access_tokens FROM anon;'));
    assert.ok(sql.includes('CREATE POLICY "consent_ledger_tenant_select"'));
    assert.ok(sql.includes('CREATE POLICY "policy_acceptances_tenant_select"'));

    const candidateMigrations = [
      '20260901_payment_webhook_idempotency_and_replay_security.sql',
      '20260902_subscription_sync_transaction.sql',
      '20260903_public_booking_ratelimit_spam_and_otp_contract.sql',
      '20260904_self_service_token_security_and_ratelimit.sql',
    ];
    for (const mig of candidateMigrations) {
      const migPath = path.join(REPO_ROOT, 'supabase', 'migrations', mig);
      assert.ok(fs.existsSync(migPath), `Missing candidate migration ${mig}`);
      const migSql = fs.readFileSync(migPath, 'utf8');
      assert.ok(migSql.includes('CANDIDATE ONLY'), `${mig} must retain CANDIDATE ONLY guard`);
    }
  });

  // Run isolated PGlite verification of queryP0CatalogPostconditions before and after applying P0 hardening
  const [{ PGlite }, { uuid_ossp }, { pgcrypto }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/uuid_ossp'),
    import('@electric-sql/pglite/contrib/pgcrypto'),
  ]);
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.waitReady;
  try {
    await db.exec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN SUPERUSER; END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      CREATE OR REPLACE FUNCTION public.current_user_can_access_tenant(p_tenant_id uuid)
      RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true; $$;

      CREATE TABLE public.appointment_access_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        appointment_id uuid NOT NULL,
        token_hash text NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        used_at timestamp with time zone
      );
      ALTER TABLE public.appointment_access_tokens OWNER TO postgres;
      ALTER TABLE public.appointment_access_tokens ENABLE ROW LEVEL SECURITY;

      -- Pre-hardening state: open policy + anon SELECT privilege
      CREATE POLICY "Allow public select by token hash" ON public.appointment_access_tokens FOR SELECT USING (true);
      GRANT SELECT ON TABLE public.appointment_access_tokens TO anon;

      CREATE TABLE public.consent_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        customer_id text NOT NULL,
        consent_type text NOT NULL,
        is_granted boolean NOT NULL DEFAULT true,
        ip_address text,
        digital_signature text,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE TABLE public.policy_acceptances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text,
        user_id text,
        policy_type text NOT NULL,
        version text NOT NULL,
        ip_address text,
        user_agent text,
        accepted_at timestamp with time zone NOT NULL DEFAULT now()
      );

      -- Create the 5 required token RPCs with SECURITY DEFINER and anon EXECUTE
      CREATE OR REPLACE FUNCTION public.create_public_booking() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb; $$;
      CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb; $$;
      CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb; $$;
      CREATE OR REPLACE FUNCTION public.request_public_appointment_reschedule_by_manage_token() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb; $$;
      CREATE OR REPLACE FUNCTION public.get_public_pending_reschedule_request_by_manage_token() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb; $$;

      GRANT EXECUTE ON FUNCTION public.create_public_booking() TO anon;
      GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token() TO anon;
      GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token() TO anon;
      GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token() TO anon;
      GRANT EXECUTE ON FUNCTION public.get_public_pending_reschedule_request_by_manage_token() TO anon;
    `);

    // 1. Pre-hardening check must return P0_NOT_APPLIED
    const preHardeningResult = await queryP0CatalogPostconditions(db);
    check('Pre-hardening catalog state returns P0_NOT_APPLIED (detects open policy and anon SELECT)', () => {
      assert.equal(preHardeningResult.all_passed, false);
      assert.equal(preHardeningResult.verdict, 'P0_NOT_APPLIED');
      const legacyCheck = preHardeningResult.checks.find((c) => c.id === 'legacy_open_policy_absent');
      assert.equal(legacyCheck?.passed, false);
      assert.equal(legacyCheck?.reason_code, 'PRE_HARDENING_OPEN_POLICY_PRESENT');
    });

    // 2. Apply 20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql in isolated PGlite
    const proposalSql = fs.readFileSync(resolveP0ProposalSqlPath(), 'utf8');
    await db.exec(proposalSql);

    // 3. Post-hardening check must return P0_CUTOVER_POSTCONDITIONS_VERIFIED
    const postHardeningResult = await queryP0CatalogPostconditions(db);
    check('Post-hardening isolated PGlite catalog returns P0_CUTOVER_POSTCONDITIONS_VERIFIED', () => {
      assert.equal(postHardeningResult.all_passed, true);
      assert.equal(postHardeningResult.verdict, 'P0_CUTOVER_POSTCONDITIONS_VERIFIED');
      for (const c of postHardeningResult.checks) {
        assert.equal(c.passed, true, `Check ${c.id} failed: ${c.detail}`);
      }
    });

    // 4. Verify verifyP0Cutover preserves live_p0_accepted=false & Issue #10 open blocker when called without clone URL
    const cutoverNoUrl = await verifyP0Cutover({ databaseUrl: '', cloneConfirmed: true });
    check('verifyP0Cutover preserves live_p0_accepted=false, LIVE_P0_NOT_APPLIED, and Issue #10 OPEN_PRODUCTION_BLOCKER', () => {
      assert.equal(cutoverNoUrl.status, 'RESTORED_CLONE_REQUIRED');
      assert.equal(cutoverNoUrl.live_p0_accepted, false);
      assert.equal(cutoverNoUrl.live_status, 'LIVE_P0_NOT_APPLIED');
      assert.equal(cutoverNoUrl.issue_10_status, 'OPEN_PRODUCTION_BLOCKER');
    });
  } finally {
    await db.close();
  }

  console.log(`\n=== ALL ${passed} RECOVERY HARD-GATE & RESTORE-AWARE CHECKS PASSED (NO_REMOTE_DB_WRITE = TRUE, PRODUCTION = NO_GO) ===`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runSelfTests().catch((err) => {
    console.error('[FATAL] verify-lari-recovery-hard-gate failed:', err);
    process.exit(1);
  });
}
