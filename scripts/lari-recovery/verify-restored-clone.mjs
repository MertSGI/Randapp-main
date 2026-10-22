import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateAndParseCloneDatabaseUrl,
  withReadOnlyCloneClient,
} from './clone-connection-boundary.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');

export const TOOL_VERSION = '1.0.0';

export const EXPECTED_COUNTS = {
  total_entries: 26,
  total_differences_count: 25,
  local_only: 21,
  remote_only: 4,
  collision_groups: 4,
  p0_cutover: 1,
};

export const EXPECTED_COLLISION_GROUPS = [
  'COLLISION_20260920',
  'COLLISION_20260921',
  'COLLISION_20260925',
  'COLLISION_20260928',
];

export const REMOTE_ONLY_VERSIONS = [
  '20261008063020',
  '20261008063027',
  '20261008063031',
  '20261008063041',
];

/**
 * Validates the local repository's migration reconciliation matrix and source files.
 */
export function validateLocalMigrationMatrix(repoRoot = DEFAULT_REPO_ROOT) {
  const matrixPath = path.join(repoRoot, 'docs', 'lari-program', 'MIGRATION_RECONCILIATION_MATRIX.json');
  const evidencePath = path.join(repoRoot, 'docs', 'evidence', 'migration-reconciliation-20261011.json');

  if (!fs.existsSync(matrixPath)) {
    throw new Error(`MISSING_MATRIX_FILE: ${matrixPath} not found`);
  }
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`MISSING_EVIDENCE_FILE: ${evidencePath} not found`);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  const items = Array.isArray(matrix.items) ? matrix.items : [];
  let localCount = 0;
  let remoteCount = 0;
  let p0Count = 0;
  const collisionGroupsFound = new Set();
  const fileDigests = {};

  for (const item of items) {
    if (item.side === 'LOCAL_ONLY') {
      localCount++;
      if (item.collision_group) collisionGroupsFound.add(item.collision_group);

      const filePath = path.join(repoRoot, 'supabase', 'migrations', item.local_filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`LOCAL_MIGRATION_FILE_NOT_FOUND: ${item.local_filename}`);
      }
      const raw = fs.readFileSync(filePath);
      const lfText = raw.toString('utf8').replace(/\r\n/g, '\n');
      const digest = crypto.createHash('sha256').update(lfText, 'utf8').digest('hex').toLowerCase();
      fileDigests[item.local_filename] = digest;
    } else if (item.side === 'REMOTE_ONLY') {
      remoteCount++;
    } else if (item.side === 'SECURITY_CUTOVER_ONLY') {
      p0Count++;
      const filePath = path.join(repoRoot, 'supabase', 'migrations', item.local_filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`P0_MIGRATION_FILE_NOT_FOUND: ${item.local_filename}`);
      }
      const raw = fs.readFileSync(filePath);
      const lfText = raw.toString('utf8').replace(/\r\n/g, '\n');
      const digest = crypto.createHash('sha256').update(lfText, 'utf8').digest('hex').toLowerCase();
      fileDigests[item.local_filename] = digest;
    }
  }

  if (items.length !== EXPECTED_COUNTS.total_entries) {
    throw new Error(`MATRIX_ITEM_COUNT_MISMATCH: Expected ${EXPECTED_COUNTS.total_entries}, found ${items.length}`);
  }
  if (localCount !== EXPECTED_COUNTS.local_only) {
    throw new Error(`LOCAL_COUNT_MISMATCH: Expected ${EXPECTED_COUNTS.local_only}, found ${localCount}`);
  }
  if (remoteCount !== EXPECTED_COUNTS.remote_only) {
    throw new Error(`REMOTE_COUNT_MISMATCH: Expected ${EXPECTED_COUNTS.remote_only}, found ${remoteCount}`);
  }
  if (p0Count !== EXPECTED_COUNTS.p0_cutover) {
    throw new Error(`P0_COUNT_MISMATCH: Expected ${EXPECTED_COUNTS.p0_cutover}, found ${p0Count}`);
  }

  return {
    valid: true,
    total_entries: items.length,
    local_count: localCount,
    remote_count: remoteCount,
    p0_count: p0Count,
    collision_groups: Array.from(collisionGroupsFound).sort(),
    items,
    file_digests: fileDigests,
    evidence_differences_count: Array.isArray(evidence.differences) ? evidence.differences.length : 0,
  };
}

/**
 * Executes catalog queries against the restored clone database to extract schema metadata.
 */
export async function queryCloneCatalog(client) {
  // 1. Applied migrations in clone
  let appliedMigrations = [];
  const migrationsTableCheck = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations'
    ) as exists;
  `);

  if (migrationsTableCheck.rows[0]?.exists) {
    const res = await client.query(`
      SELECT version FROM supabase_migrations.schema_migrations 
      ORDER BY version ASC;
    `);
    appliedMigrations = res.rows.map((r) => String(r.version));
  }

  // 2. Tables and columns in public
  const tablesRes = await client.query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name ASC;
  `);

  const columnsRes = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name ASC, ordinal_position ASC;
  `);

  // 3. Views in public
  const viewsRes = await client.query(`
    SELECT table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name ASC;
  `);

  // 4. Functions in public (signatures and security definer status)
  const functionsRes = await client.query(`
    SELECT 
      p.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
      pg_catalog.format_type(p.prorettype, NULL) as return_type,
      p.prosecdef as is_security_definer
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname ASC, arguments ASC;
  `);

  // 5. RLS policies on public tables
  const rlsRes = await client.query(`
    SELECT 
      tablename,
      policyname,
      cmd,
      roles,
      qual,
      with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename ASC, policyname ASC;
  `);

  // 6. Table privileges on public tables
  const privsRes = await client.query(`
    SELECT 
      table_name,
      grantee,
      privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
    ORDER BY table_name ASC, grantee ASC, privilege_type ASC;
  `);

  // Compute deterministic hashes of metadata objects
  const serializeAndHash = (obj) =>
    crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

  const catalogSummary = {
    applied_migrations: appliedMigrations,
    applied_migrations_count: appliedMigrations.length,
    tables_count: tablesRes.rows.length,
    columns_count: columnsRes.rows.length,
    views_count: viewsRes.rows.length,
    functions_count: functionsRes.rows.length,
    policies_count: rlsRes.rows.length,
    privileges_count: privsRes.rows.length,
    fingerprints: {
      tables: serializeAndHash(tablesRes.rows),
      columns: serializeAndHash(columnsRes.rows),
      functions: serializeAndHash(functionsRes.rows),
      policies: serializeAndHash(rlsRes.rows),
      privileges: serializeAndHash(privsRes.rows),
      migrations: serializeAndHash(appliedMigrations),
    },
    tables: tablesRes.rows,
    views: viewsRes.rows,
    policies: rlsRes.rows,
  };

  return catalogSummary;
}

/**
 * Reconciles clone catalog state with local migration matrix and unproven semantic matches.
 */
export function reconcileCatalogWithMatrix(matrixResult, catalogSummary) {
  const appliedSet = new Set(catalogSummary.applied_migrations);

  const unresolvedItems = [];
  let unappliedLocalCount = 0;
  let remoteAppliedCount = 0;

  for (const item of matrixResult.items) {
    if (item.side === 'LOCAL_ONLY') {
      const isApplied = appliedSet.has(item.version);
      if (!isApplied) {
        unappliedLocalCount++;
        unresolvedItems.push({
          item_id: item.item_id,
          version: item.version,
          side: item.side,
          collision_group: item.collision_group || null,
          local_filename: item.local_filename,
          status: 'NEEDS_CLONE_DIFF',
          reconciliation_action: 'HOLD_AWAITING_RESTORE_DIFF',
        });
      }
    } else if (item.side === 'REMOTE_ONLY') {
      const isApplied = appliedSet.has(item.version);
      if (isApplied) remoteAppliedCount++;
      unresolvedItems.push({
        item_id: item.item_id,
        version: item.version,
        side: item.side,
        remote_counterpart: item.remote_counterpart || null,
        status: 'NEEDS_CLONE_DIFF',
        clone_applied: isApplied,
        reconciliation_action: 'HOLD_AWAITING_RESTORE_DIFF',
      });
    } else if (item.side === 'SECURITY_CUTOVER_ONLY') {
      const isApplied = appliedSet.has(item.version);
      unresolvedItems.push({
        item_id: item.item_id,
        version: item.version,
        side: item.side,
        status: isApplied ? 'P0_ALREADY_APPLIED' : 'P0_NOT_APPLIED',
        reconciliation_action: 'HOLD_AWAITING_P0_CUTOVER',
      });
    }
  }

  return {
    reconciliation_verdict: 'NEEDS_CLONE_DIFF',
    unresolved_items: unresolvedItems,
    unapplied_local_count: unappliedLocalCount,
    remote_applied_count: remoteAppliedCount,
    p0_applied: appliedSet.has('20261011155623'),
  };
}

/**
 * Main entry point for restored clone verification.
 */
export async function verifyRestoredClone(options = {}) {
  const rawUrl = options.dbUrl || process.env.LARI_RESTORE_DATABASE_URL;
  const cloneConfirmed =
    options.cloneConfirmed ??
    (process.env.LARI_RESTORE_CLONE_CONFIRMED === '1' || process.env.LARI_RESTORE_CLONE_CONFIRMED === 'true');
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const baselineManifestPath = options.baselineManifestPath || process.env.LARI_CATALOG_BASELINE_MANIFEST;
  const receiptOutputPath =
    options.receiptOutputPath ||
    path.join(repoRoot, 'test-results', 'lari-recovery', 'reconciliation-clone-receipt.json');

  // 1. Static validation of local matrix
  const matrixResult = validateLocalMigrationMatrix(repoRoot);

  // 2. Validate URL and connect to clone in read-only transaction
  let parsedDbConfig;
  try {
    parsedDbConfig = validateAndParseCloneDatabaseUrl(rawUrl, cloneConfirmed);
  } catch (validationErr) {
    return {
      status: 'RESTORED_CLONE_REQUIRED',
      error: validationErr.message,
      code: validationErr.code || 'RESTORED_CLONE_REQUIRED',
      matrix_valid: true,
      matrix_summary: {
        local_count: matrixResult.local_count,
        remote_count: matrixResult.remote_count,
        collision_groups: matrixResult.collision_groups,
      },
      staging_restore_status: 'STAGING_RESTORE_NOT_ATTESTED',
    };
  }

  let catalogSummary;
  try {
    catalogSummary = await withReadOnlyCloneClient(rawUrl, cloneConfirmed, async (client) => {
      return await queryCloneCatalog(client);
    });
  } catch (connErr) {
    return {
      status: 'RESTORED_CLONE_REQUIRED',
      error: connErr.message,
      code: connErr.code || 'RESTORED_CLONE_REQUIRED',
      database_name: parsedDbConfig.dbName,
      staging_restore_status: 'STAGING_RESTORE_NOT_ATTESTED',
    };
  }

  // 3. Reconcile clone catalog with matrix
  const reconciliation = reconcileCatalogWithMatrix(matrixResult, catalogSummary);

  // 4. Baseline manifest comparison
  let baselineComparison = 'CATALOG_BASELINE_MISSING';
  if (baselineManifestPath && fs.existsSync(baselineManifestPath)) {
    try {
      const baselineData = JSON.parse(fs.readFileSync(baselineManifestPath, 'utf8'));
      if (baselineData.fingerprints) {
        const matches =
          baselineData.fingerprints.tables === catalogSummary.fingerprints.tables &&
          baselineData.fingerprints.columns === catalogSummary.fingerprints.columns &&
          baselineData.fingerprints.functions === catalogSummary.fingerprints.functions &&
          baselineData.fingerprints.policies === catalogSummary.fingerprints.policies;
        baselineComparison = matches ? 'BASELINE_FINGERPRINTS_MATCH' : 'BASELINE_FINGERPRINTS_DIVERGED';
      }
    } catch {
      baselineComparison = 'CATALOG_BASELINE_CORRUPT';
    }
  }

  // Fetch current git commit SHA if possible
  let currentHeadSha = 'UNKNOWN';
  try {
    const headPath = path.join(repoRoot, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const headRef = fs.readFileSync(headPath, 'utf8').trim();
      if (headRef.startsWith('ref: ')) {
        const refFile = path.join(repoRoot, '.git', headRef.slice(5));
        if (fs.existsSync(refFile)) {
          currentHeadSha = fs.readFileSync(refFile, 'utf8').trim();
        }
      } else {
        currentHeadSha = headRef;
      }
    }
  } catch {
    // Keep UNKNOWN
  }

  // 5. Emit sanitized JSON acceptance receipt
  const receipt = {
    schema_version: 1,
    tool_version: TOOL_VERSION,
    status: 'CLONE_INSPECTED_NEEDS_DIFF',
    source_head: currentHeadSha,
    database_name: parsedDbConfig.dbName,
    clone_confirmed: true,
    snapshot_time: new Date().toISOString(),
    expected_counts: {
      local_only: EXPECTED_COUNTS.local_only,
      remote_only: EXPECTED_COUNTS.remote_only,
      collision_groups: EXPECTED_COUNTS.collision_groups,
      p0_cutover: EXPECTED_COUNTS.p0_cutover,
    },
    catalog_summary: {
      applied_migrations_count: catalogSummary.applied_migrations_count,
      tables_count: catalogSummary.tables_count,
      views_count: catalogSummary.views_count,
      functions_count: catalogSummary.functions_count,
      policies_count: catalogSummary.policies_count,
      privileges_count: catalogSummary.privileges_count,
      fingerprints: catalogSummary.fingerprints,
    },
    catalog_comparison: baselineComparison,
    reconciliation: {
      verdict: reconciliation.reconciliation_verdict,
      unapplied_local_count: reconciliation.unapplied_local_count,
      remote_applied_count: reconciliation.remote_applied_count,
      p0_applied: reconciliation.p0_applied,
      unresolved_items_count: reconciliation.unresolved_items.length,
      unresolved_items: reconciliation.unresolved_items,
    },
    staging_restore_status: 'STAGING_RESTORE_NOT_ATTESTED',
  };

  try {
    fs.mkdirSync(path.dirname(receiptOutputPath), { recursive: true });
    fs.writeFileSync(receiptOutputPath, JSON.stringify(receipt, null, 2), 'utf8');
  } catch (fsErr) {
    console.error(`Warning: Could not write receipt to ${receiptOutputPath}: ${fsErr.message}`);
  }

  return receipt;
}

// CLI runner if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let dbUrl = process.env.LARI_RESTORE_DATABASE_URL;
  let cloneConfirmed = process.env.LARI_RESTORE_CLONE_CONFIRMED === '1';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-url' && args[i + 1]) {
      dbUrl = args[++i];
    } else if (args[i] === '--confirm-clone') {
      cloneConfirmed = true;
    } else if (args[i] === '--help') {
      console.log('Usage: node scripts/lari-recovery/verify-restored-clone.mjs [--db-url <url>] [--confirm-clone]');
      process.exit(0);
    }
  }

  verifyRestoredClone({ dbUrl, cloneConfirmed })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'RESTORED_CLONE_REQUIRED') {
        console.log('\n[LARI-RECOVERY] Status: RESTORED_CLONE_REQUIRED');
        process.exit(0); // Exit 0 with explicit report when clone not present, per contract
      } else {
        console.log(`\n[LARI-RECOVERY] Status: ${result.status}`);
      }
    })
    .catch((err) => {
      console.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
