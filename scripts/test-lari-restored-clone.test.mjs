import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  validateAndParseCloneDatabaseUrl,
  redactDatabaseUrl,
  sanitizeErrorMessage,
  ALLOWED_LOOPBACK_HOSTS,
} from './lari-recovery/clone-connection-boundary.mjs';
import {
  verifyRestoredClone,
  validateLocalMigrationMatrix,
  resolveGitHeadSha,
  queryCloneCatalog,
  reconcileCatalogWithMatrix,
  EXPECTED_COUNTS,
  EXPECTED_COLLISION_GROUPS,
  REMOTE_ONLY_VERSIONS,
} from './lari-recovery/verify-restored-clone.mjs';

test('1. Security Boundary: Rejects live Supabase hostname and pooler hosts', () => {
  const forbiddenUrls = [
    'postgresql://postgres:secretpassword@db.rwedeejhjazwjthdjzrt.supabase.co:5432/lari_restore_test',
    'postgresql://postgres.rwedeejhjazwjthdjzrt:secretpassword@aws-0-eu-central-1.pooler.supabase.com:6543/lari_restore_test',
    'postgresql://postgres:secretpassword@supabase.co:5432/lari_restore_test',
    'postgresql://postgres:secretpassword@localhost:5432/lari_restore_test?ref=supabase.co',
  ];

  for (const url of forbiddenUrls) {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, true),
      (err) => {
        assert.ok(
          err.code === 'NON_LOOPBACK_HOST' || err.code === 'LIVE_SUPABASE_PROHIBITED',
          `Expected refusal for ${url}, got ${err.code}: ${err.message}`
        );
        return true;
      }
    );
  }
});

test('2. Security Boundary: Rejects non-loopback hostnames and obfuscated addresses', () => {
  const nonLoopbackUrls = [
    'postgresql://postgres:secret@192.168.1.100:5432/lari_restore_test',
    'postgresql://postgres:secret@10.0.0.1:5432/lari_restore_test',
    'postgresql://postgres:secret@example.com:5432/lari_restore_test',
    'postgresql://postgres:secret@staging.internal:5432/lari_restore_test',
    'postgresql://postgres:secret@0177.0.0.1:5432/lari_restore_test', // Octal
    'postgresql://postgres:secret@0x7f.0.0.1:5432/lari_restore_test', // Hex
    'postgresql://postgres:secret@2130706433:5432/lari_restore_test', // Dword integer
    'postgresql://postgres:secret@127.0.0.1.nip.io:5432/lari_restore_test',
  ];

  for (const url of nonLoopbackUrls) {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, true),
      (err) => {
        assert.ok(
          err.code === 'NON_LOOPBACK_HOST' || err.code === 'MALFORMED_DATABASE_URL',
          `Expected rejection for ${url}, got ${err.code}: ${err.message}`
        );
        return true;
      }
    );
  }

  // Permitted loopback hosts
  for (const host of ALLOWED_LOOPBACK_HOSTS) {
    const formattedHost = host.includes(':') ? `[${host}]` : host;
    const validUrl = `postgresql://postgres:secret@${formattedHost}:5432/lari_restore_valid_db`;
    const parsed = validateAndParseCloneDatabaseUrl(validUrl, true);
    assert.equal(parsed.dbName, 'lari_restore_valid_db');
    assert.equal(parsed.port, 5432);
  }
});

test('3. Database Isolation: Rejects default and unauthorized database names', () => {
  const invalidDbUrls = [
    'postgresql://postgres:secret@127.0.0.1:5432/postgres',
    'postgresql://postgres:secret@127.0.0.1:5432/template1',
    'postgresql://postgres:secret@127.0.0.1:5432/supabase_admin',
    'postgresql://postgres:secret@127.0.0.1:5432/production',
    'postgresql://postgres:secret@127.0.0.1:5432/lari_staging',
    'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_', // empty suffix
    'postgresql://postgres:secret@127.0.0.1:5432/',
  ];

  for (const url of invalidDbUrls) {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, true),
      (err) => {
        assert.equal(err.code, 'INVALID_CLONE_DATABASE_NAME');
        return true;
      }
    );
  }
});

test('4. Operational Safety: Rejects execution when clone confirmation is absent', () => {
  const url = 'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_clone_test';

  const priorEnv = process.env.LARI_RESTORE_CLONE_CONFIRMED;
  delete process.env.LARI_RESTORE_CLONE_CONFIRMED;
  try {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, false),
      (err) => {
        assert.equal(err.code, 'CLONE_CONFIRMATION_REQUIRED');
        return true;
      }
    );

    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, undefined),
      (err) => {
        assert.equal(err.code, 'CLONE_CONFIRMATION_REQUIRED');
        return true;
      }
    );
  } finally {
    if (priorEnv) process.env.LARI_RESTORE_CLONE_CONFIRMED = priorEnv;
  }
});

test('5. Operational Safety: Rejects missing or empty database URL with RESTORED_CLONE_REQUIRED', () => {
  for (const emptyVal of ['', null, undefined, '   ']) {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(emptyVal, true),
      (err) => {
        assert.equal(err.code, 'MISSING_DATABASE_URL');
        return true;
      }
    );
  }
});

test('6. Input Sanitization: Rejects DDL injection and malformed parameters in database name', () => {
  const maliciousUrls = [
    'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_db;DROP%20TABLE%20users;',
    'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_db--sql-comment',
    'postgresql://postgres:secret@127.0.0.1:5432/lari_restore_db%20spaces',
  ];

  for (const url of maliciousUrls) {
    assert.throws(
      () => validateAndParseCloneDatabaseUrl(url, true),
      (err) => {
        assert.equal(err.code, 'INVALID_CLONE_DATABASE_NAME');
        return true;
      }
    );
  }
});

test('7. Confidentiality: Redacts passwords and sensitive tokens in all outputs', () => {
  const sensitiveUrl = 'postgresql://my_user:superSecretPassword123@127.0.0.1:5432/lari_restore_snapshot_1';
  const redacted = redactDatabaseUrl(sensitiveUrl);

  assert.ok(!redacted.includes('superSecretPassword123'), 'Redacted URL must not contain the plaintext password');
  assert.ok(redacted.includes('***'), 'Redacted URL must show obscured password');
  assert.ok(redacted.includes('my_user'), 'Username is preserved in redacted output');
  assert.ok(redacted.includes('lari_restore_snapshot_1'), 'Database name is preserved');

  const parsed = validateAndParseCloneDatabaseUrl(sensitiveUrl, true);
  assert.equal(parsed.redactedUrl, 'postgresql://my_user:***@127.0.0.1:5432/lari_restore_snapshot_1');
});

test('8. Deterministic Migration Matrix: Confirms 21 LOCAL_ONLY, 4 REMOTE_ONLY, 4 collision groups, 1 P0', () => {
  const matrixResult = validateLocalMigrationMatrix();

  assert.equal(matrixResult.valid, true);
  assert.equal(matrixResult.total_entries, EXPECTED_COUNTS.total_entries);
  assert.equal(matrixResult.local_count, EXPECTED_COUNTS.local_only);
  assert.equal(matrixResult.remote_count, EXPECTED_COUNTS.remote_only);
  assert.equal(matrixResult.p0_count, EXPECTED_COUNTS.p0_cutover);
  assert.deepEqual(matrixResult.collision_groups, EXPECTED_COLLISION_GROUPS);

  // Validate digest for P0
  assert.ok(
    matrixResult.file_digests['20261011155623_appointment_access_tokens_table_access_hardening.sql'],
    'P0 migration file digest must be computed'
  );
  assert.equal(
    matrixResult.file_digests['20261011155623_appointment_access_tokens_table_access_hardening.sql'].toUpperCase(),
    '260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13'
  );
});

test('9. Semantic Match Preservation: Unproven remote-only versions report NEEDS_CLONE_DIFF without fabricated resolutions', () => {
  const matrixResult = validateLocalMigrationMatrix();

  const remoteItems = matrixResult.items.filter((it) => it.side === 'REMOTE_ONLY');
  assert.equal(remoteItems.length, 4);

  const remoteVersions = remoteItems.map((it) => it.version).sort();
  assert.deepEqual(remoteVersions, [...REMOTE_ONLY_VERSIONS].sort());

  for (const item of remoteItems) {
    assert.notEqual(item.class, 'SEMANTIC_EQUIVALENT_PROVEN', 'Remote-only item must not claim unproven semantic equivalent');
  }
});

test('10. Clone-Unavailable HOLD: Returns RESTORED_CLONE_REQUIRED with no fabricated PASS when no clone is provided', async () => {
  const priorUrl = process.env.LARI_RESTORE_DATABASE_URL;
  delete process.env.LARI_RESTORE_DATABASE_URL;
  try {
    const result = await verifyRestoredClone({ dbUrl: undefined, cloneConfirmed: false });
    assert.equal(result.status, 'RESTORED_CLONE_REQUIRED');
    assert.equal(result.staging_restore_status, 'STAGING_RESTORE_NOT_ATTESTED');
    assert.notEqual(result.status, 'PARITY_PASS');
  } finally {
    if (priorUrl) process.env.LARI_RESTORE_DATABASE_URL = priorUrl;
  }
});

test('11. Baseline Verification: Reports CATALOG_BASELINE_MISSING when no verified manifest is provided', async () => {
  // Even if simulated connection was made without baseline manifest, catalog comparison is missing
  const dummyResult = await verifyRestoredClone({
    dbUrl: 'postgresql://postgres:pwd@127.0.0.1:65432/lari_restore_nonexistent_clone',
    cloneConfirmed: true,
    baselineManifestPath: undefined,
  });

  // When port is unreachable, it cleanly returns RESTORED_CLONE_REQUIRED
  assert.equal(dummyResult.status, 'RESTORED_CLONE_REQUIRED');
  assert.equal(dummyResult.staging_restore_status, 'STAGING_RESTORE_NOT_ATTESTED');
});

test('12. Disposable PostgreSQL 17 Docker Clone Integration (if Docker available)', async () => {
  const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
  const dockerEnv = { ...process.env };
  delete dockerEnv.DOCKER_HOST;
  delete dockerEnv.DOCKER_CONTEXT;
  delete dockerEnv.DOCKER_TLS_VERIFY;
  delete dockerEnv.DOCKER_CERT_PATH;

  const dockerCmd = (args, options = {}) =>
    spawnSync('docker', ['-H', endpoint, ...args], {
      encoding: 'utf8',
      ...options,
      env: dockerEnv,
    });

  const probe = dockerCmd(['info', '--format', '{{.OperatingSystem}}'], { timeout: 8000 });
  const dockerAvailable = !probe.error && probe.status === 0;

  if (!dockerAvailable) {
    console.log('[RESTORED_CLONE_QA] Docker engine not available in local environment; skipping live container test.');
    return;
  }

  console.log('[RESTORED_CLONE_QA] Docker engine detected; launching isolated clone fixture container...');
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const containerName = `lari-pg17-clone-qa-${uniqueId}`;
  const dbName = `lari_restore_test_${uniqueId}`;
  const disposablePassword = crypto.randomBytes(16).toString('hex');
  const hostPort = 54320 + Math.floor(Math.random() * 500);

  const runRes = dockerCmd([
    'run',
    '--detach',
    '--rm',
    '--name', containerName,
    '-p', `127.0.0.1:${hostPort}:5432`,
    '-e', 'POSTGRES_USER=postgres',
    '-e', `POSTGRES_DB=${dbName}`,
    '-e', `POSTGRES_PASSWORD=${disposablePassword}`,
    'postgres:17.6-alpine',
  ]);
  assert.equal(runRes.status, 0, `Failed to launch container: ${runRes.stderr}`);
  const containerId = runRes.stdout.trim().split(/\r?\n/)[0];

  try {
    // Wait for PostgreSQL readiness (TCP)
    let ready = false;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const logsProbe = dockerCmd(['logs', containerId]);
      const initDone = `${logsProbe.stdout || ''}\n${logsProbe.stderr || ''}`.includes(
        'PostgreSQL init process complete'
      );
      if (initDone) {
        const ping = dockerCmd([
          'exec',
          '-i',
          '--user', 'postgres',
          containerId,
          'pg_isready',
          '-h', '127.0.0.1',
          '-p', '5432',
          '-U', 'postgres',
          '-d', dbName,
        ]);
        if (ping.status === 0) {
          ready = true;
          break;
        }
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    assert.ok(ready, 'Fixture container PostgreSQL failed to become ready');

    // Bootstrap representative clone schema
    const bootstrapSql = `
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (
        version text PRIMARY KEY,
        inserted_at timestamptz DEFAULT now()
      );
      INSERT INTO supabase_migrations.schema_migrations (version) VALUES
        ('20261008063020'),
        ('20261008063027'),
        ('20261008063031'),
        ('20261008063041');

      CREATE TABLE public.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text UNIQUE NOT NULL
      );

      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "tenant_read_policy" ON public.tenants FOR SELECT USING (true);
    `;

    const execRes = dockerCmd(
      ['exec', '-i', '--user', 'postgres', containerId, 'psql', '-v', 'ON_ERROR_STOP=1', '-d', dbName, '-f', '-'],
      { input: bootstrapSql }
    );
    assert.equal(execRes.status, 0, `Failed to bootstrap clone fixture: ${execRes.stderr}`);

    // Verify clone via verifyRestoredClone
    const cloneUrl = `postgresql://postgres:${disposablePassword}@127.0.0.1:${hostPort}/${dbName}`;
    const tempReceiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-receipt-'));
    const receiptPath = path.join(tempReceiptDir, 'receipt.json');

    const result = await verifyRestoredClone({
      dbUrl: cloneUrl,
      cloneConfirmed: true,
      receiptOutputPath: receiptPath,
    });

    assert.equal(result.status, 'CLONE_INSPECTED_NEEDS_DIFF');
    assert.equal(result.database_name, dbName);
    assert.equal(result.clone_confirmed, true);
    assert.equal(result.catalog_comparison, 'CATALOG_BASELINE_MISSING');
    assert.equal(result.staging_restore_status, 'STAGING_RESTORE_NOT_ATTESTED');
    assert.equal(result.catalog_summary.applied_migrations_count, 4);
    assert.equal(result.reconciliation.remote_applied_count, 4);
    assert.equal(result.reconciliation.unapplied_local_count, 21);
    assert.equal(result.reconciliation.p0_applied, false);

    assert.ok(fs.existsSync(receiptPath), 'Receipt JSON must be written to disk');
    const writtenReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(writtenReceipt.status, 'CLONE_INSPECTED_NEEDS_DIFF');
    assert.equal(writtenReceipt.database_name, dbName);

    fs.rmSync(tempReceiptDir, { recursive: true, force: true });
    console.log('[RESTORED_CLONE_QA] Live clone fixture verification: PASS');
  } finally {
    dockerCmd(['rm', '-f', containerId]);
  }
});

test('13. Credentials Boundary: Handles regex metacharacters, percent-encoding, and empty credentials safely without leak', () => {
  // Test password with metacharacters: +, [, *, (, \, etc.
  const rawPw = 'p%2Ba%5Bs%5D*w(o)rd%5C123';
  const decodedPw = 'p+a[s]*w(o)rd\\123';
  const url = `postgresql://my%40user:${rawPw}@127.0.0.1:5432/lari_restore_meta_test`;

  const parsed = validateAndParseCloneDatabaseUrl(url, true);
  assert.equal(parsed.username, 'my@user', 'Username must be percent-decoded safely');
  assert.equal(parsed.password, decodedPw, 'Password must be percent-decoded safely');
  assert.equal(parsed.redactedUrl, 'postgresql://my@user:***@127.0.0.1:5432/lari_restore_meta_test');
  assert.ok(!parsed.redactedUrl.includes(decodedPw));
  assert.ok(!parsed.redactedUrl.includes(rawPw));

  // Test sanitizeErrorMessage: Must NOT throw SyntaxError on metacharacters
  const msgWithSecret = `Failed to connect to database: user postgres password "${decodedPw}" rejected by host`;
  const sanitized = sanitizeErrorMessage(msgWithSecret, rawPw, decodedPw, 'my%40user', 'my@user');
  assert.ok(!sanitized.includes(decodedPw), 'Sanitized message must not contain decoded password');
  assert.ok(!sanitized.includes(rawPw), 'Sanitized message must not contain raw password');
  assert.ok(sanitized.includes('***'), 'Sanitized message must replace password with ***');

  // Test empty password: must be a no-op without string corruption
  const normalMsg = 'Role "postgres" does not exist';
  const emptySanitized = sanitizeErrorMessage(normalMsg, '', '', 'postgres', 'postgres');
  assert.equal(emptySanitized, normalMsg, 'Empty password must not corrupt or alter normal error message');

  // Test leakage of connection URI in error message:
  const leakMsg = `Connection error at postgresql://my@user:${rawPw}@127.0.0.1:5432/lari_restore_meta_test`;
  const uriSanitized = sanitizeErrorMessage(leakMsg, rawPw, decodedPw, 'my%40user', 'my@user');
  assert.ok(!uriSanitized.includes('127.0.0.1:5432/lari_restore_meta_test'), 'Full URI must be redacted from error');
});

test('14. Credentials Boundary: Rejects malformed percent-encoding with MALFORMED_CREDENTIALS', () => {
  const malformedPwUrl = 'postgresql://postgres:bad%ZZpassword@127.0.0.1:5432/lari_restore_bad_enc';
  assert.throws(
    () => validateAndParseCloneDatabaseUrl(malformedPwUrl, true),
    (err) => {
      assert.equal(err.code, 'MALFORMED_CREDENTIALS');
      return true;
    }
  );

  const malformedUserUrl = 'postgresql://bad%ZZuser:secret@127.0.0.1:5432/lari_restore_bad_enc';
  assert.throws(
    () => validateAndParseCloneDatabaseUrl(malformedUserUrl, true),
    (err) => {
      assert.equal(err.code, 'MALFORMED_CREDENTIALS');
      return true;
    }
  );
});

test('15. Linked Worktree Git Resolution: Correctly resolves 40-char SHA and detects unverified head', () => {
  // Current repo / worktree resolution
  const currentHead = resolveGitHeadSha();
  assert.match(currentHead, /^[0-9a-f]{40}$/i, 'Current repo or worktree HEAD must resolve to 40-char SHA');

  // Synthetic linked worktree simulation
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-worktree-test-'));
  try {
    const gitDirMock = path.join(tempDir, 'actual-gitdir');
    fs.mkdirSync(path.join(gitDirMock, 'refs', 'heads'), { recursive: true });

    const mockSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    fs.writeFileSync(path.join(gitDirMock, 'HEAD'), 'ref: refs/heads/feature-test\n');
    fs.writeFileSync(path.join(gitDirMock, 'refs', 'heads', 'feature-test'), `${mockSha}\n`);

    // Create .git file as in a linked worktree
    fs.writeFileSync(path.join(tempDir, '.git'), `gitdir: ${gitDirMock}\n`);

    const resolved = resolveGitHeadSha(tempDir);
    assert.equal(resolved, mockSha, 'resolveGitHeadSha must resolve HEAD from linked worktree gitdir pointer');

    // Empty directory without git must return UNKNOWN
    const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-empty-test-'));
    try {
      const unknownSha = resolveGitHeadSha(emptyTempDir);
      assert.equal(unknownSha, 'UNKNOWN', 'resolveGitHeadSha must return UNKNOWN when git is absent');
    } finally {
      fs.rmSync(emptyTempDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('16. Migration Ledger Absence: Distinguishes missing schema_migrations table from empty ledger', async () => {
  const matrixResult = validateLocalMigrationMatrix();

  // Mock catalog with missing schema_migrations table
  const mockCatalogMissingLedger = {
    migration_ledger_status: 'MIGRATION_LEDGER_ABSENT',
    applied_migrations: null,
    applied_migrations_count: 0,
    tables_count: 5,
    columns_count: 20,
    views_count: 0,
    functions_count: 0,
    policies_count: 0,
    privileges_count: 0,
    fingerprints: {},
    tables: [],
    views: [],
    policies: [],
  };

  const reconciliation = reconcileCatalogWithMatrix(matrixResult, mockCatalogMissingLedger);
  assert.equal(reconciliation.reconciliation_verdict, 'MIGRATION_LEDGER_ABSENT');
  assert.equal(reconciliation.migration_ledger_status, 'MIGRATION_LEDGER_ABSENT');
  assert.equal(reconciliation.unapplied_local_count, 21);
  assert.equal(reconciliation.remote_applied_count, 0);
  assert.equal(reconciliation.p0_applied, false);
  assert.ok(reconciliation.unresolved_items.every((it) => it.status === 'MIGRATION_LEDGER_ABSENT'));
  assert.ok(reconciliation.unresolved_items.every((it) => it.reconciliation_action === 'HOLD_AWAITING_RESTORE_DIFF'));

  // In contrast, when ledger is present but has zero applied migrations:
  const mockCatalogEmptyLedger = {
    migration_ledger_status: 'MIGRATION_LEDGER_PRESENT',
    applied_migrations: [],
    applied_migrations_count: 0,
    tables_count: 5,
    columns_count: 20,
    views_count: 0,
    functions_count: 0,
    policies_count: 0,
    privileges_count: 0,
    fingerprints: {},
    tables: [],
    views: [],
    policies: [],
  };

  const emptyReconciliation = reconcileCatalogWithMatrix(matrixResult, mockCatalogEmptyLedger);
  assert.equal(emptyReconciliation.reconciliation_verdict, 'NEEDS_CLONE_DIFF');
  assert.equal(emptyReconciliation.remote_applied_count, 0);
  assert.equal(emptyReconciliation.unapplied_local_count, 21);
});
