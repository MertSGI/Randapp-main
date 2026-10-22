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

export const REQUIRED_TOKEN_RPCS = [
  'create_public_booking',
  'get_public_appointment_by_manage_token',
  'cancel_public_appointment_by_manage_token',
  'request_public_appointment_reschedule_by_manage_token',
  'get_public_pending_reschedule_request_by_manage_token',
];

export const REQUIRED_COLUMNS = [
  { attname: 'id', type_name: 'uuid' },
  { attname: 'tenant_id', type_name: 'text' },
  { attname: 'appointment_id', type_name: 'uuid' },
  { attname: 'token_hash', type_name: 'text' },
  { attname: 'expires_at', type_name: 'timestamp with time zone' },
  { attname: 'created_at', type_name: 'timestamp with time zone' },
  { attname: 'used_at', type_name: 'timestamp with time zone' },
];

/**
 * Evaluates P0 cutover postconditions by executing catalog queries against a restored clone database.
 */
export async function queryP0CatalogPostconditions(client) {
  // 1. Table existence, relkind, owner, RLS
  const tableRes = await client.query(`
    SELECT 
      c.oid,
      c.relkind,
      pg_catalog.pg_get_userbyid(c.relowner) as owner,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as force_rls
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'appointment_access_tokens';
  `);

  if (tableRes.rows.length === 0) {
    return {
      status: 'P0_NOT_APPLIED',
      reason: 'TABLE_MISSING',
      message: 'public.appointment_access_tokens does not exist',
    };
  }

  const tableMeta = tableRes.rows[0];

  if (tableMeta.relkind !== 'r') {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'NOT_A_TABLE',
      message: `public.appointment_access_tokens is relkind "${tableMeta.relkind}", expected "r"`,
    };
  }

  if (tableMeta.owner !== 'postgres') {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'UNEXPECTED_OWNER',
      message: `public.appointment_access_tokens owner is "${tableMeta.owner}", expected "postgres"`,
    };
  }

  if (!tableMeta.rls_enabled) {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'RLS_NOT_ENABLED',
      message: 'Row Level Security is not enabled on public.appointment_access_tokens',
    };
  }

  // 2. Columns verification
  const colsRes = await client.query(`
    SELECT 
      attname,
      pg_catalog.format_type(atttypid, atttypmod) as type_name
    FROM pg_catalog.pg_attribute
    WHERE attrelid = $1
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY attname ASC;
  `, [tableMeta.oid]);

  const columnMap = new Map(colsRes.rows.map((c) => [c.attname, c.type_name]));
  const missingOrChangedCols = [];

  for (const expected of REQUIRED_COLUMNS) {
    const actualType = columnMap.get(expected.attname);
    if (!actualType || actualType !== expected.type_name) {
      missingOrChangedCols.push({
        column: expected.attname,
        expected: expected.type_name,
        actual: actualType || 'MISSING',
      });
    }
  }

  if (missingOrChangedCols.length > 0) {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'COLUMN_SCHEMA_MISMATCH',
      details: missingOrChangedCols,
    };
  }

  // 3. Check for pre-hardening open policy: "Allow public select by token hash"
  const openPolicyRes = await client.query(`
    SELECT policyname, cmd, roles, qual
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointment_access_tokens'
      AND policyname = 'Allow public select by token hash';
  `);

  if (openPolicyRes.rows.length > 0) {
    return {
      status: 'P0_NOT_APPLIED',
      reason: 'PRE_HARDENING_OPEN_POLICY_PRESENT',
      message: 'Policy "Allow public select by token hash" is still present on public.appointment_access_tokens',
      policy: openPolicyRes.rows[0],
    };
  }

  // Check for any other permissive policy granting unrestricted true access to public or anon
  const permissivePolicyRes = await client.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointment_access_tokens'
      AND (
        'public' = ANY(roles)
        OR 'anon' = ANY(roles)
      )
      AND (
        qual IN ('true', '(true)')
        OR with_check IN ('true', '(true)')
      );
  `);

  if (permissivePolicyRes.rows.length > 0) {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'PERMISSIVE_POLICY_EXISTS',
      message: 'Permissive unrestricted policy found on public.appointment_access_tokens for public/anon',
      policies: permissivePolicyRes.rows,
    };
  }

  // 4. Effective Table Grants verification for anon role
  const privsRes = await client.query(`
    SELECT 
      has_table_privilege('anon', 'public.appointment_access_tokens', 'SELECT') as anon_select,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'INSERT') as anon_insert,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'UPDATE') as anon_update,
      has_table_privilege('anon', 'public.appointment_access_tokens', 'DELETE') as anon_delete;
  `);

  const privs = privsRes.rows[0] || {};
  const retainedPrivs = [];
  if (privs.anon_select) retainedPrivs.push('SELECT');
  if (privs.anon_insert) retainedPrivs.push('INSERT');
  if (privs.anon_update) retainedPrivs.push('UPDATE');
  if (privs.anon_delete) retainedPrivs.push('DELETE');

  if (retainedPrivs.length > 0) {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'ANON_PRIVILEGES_RETAINED',
      message: `Role "anon" retains direct table privileges on public.appointment_access_tokens: ${retainedPrivs.join(', ')}`,
      retained_privileges: retainedPrivs,
    };
  }

  // 5. Token-Manage RPC checks (existence, security definer, anon execution grant)
  const rpcQuery = await client.query(`
    SELECT 
      p.proname,
      p.prosecdef as is_security_definer,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_has_execute
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY($1::text[]);
  `, [REQUIRED_TOKEN_RPCS]);

  const foundRpcs = new Map(rpcQuery.rows.map((r) => [r.proname, r]));
  const rpcErrors = [];

  for (const rpcName of REQUIRED_TOKEN_RPCS) {
    const rpcInfo = foundRpcs.get(rpcName);
    if (!rpcInfo) {
      rpcErrors.push({ rpc: rpcName, error: 'FUNCTION_MISSING' });
    } else if (!rpcInfo.is_security_definer) {
      rpcErrors.push({ rpc: rpcName, error: 'NOT_SECURITY_DEFINER' });
    } else if (!rpcInfo.anon_has_execute) {
      rpcErrors.push({ rpc: rpcName, error: 'ANON_EXECUTE_REVOKED' });
    }
  }

  if (rpcErrors.length > 0) {
    return {
      status: 'P0_POSTCONDITION_FAILED',
      reason: 'TOKEN_RPC_POSTCONDITION_FAILED',
      details: rpcErrors,
    };
  }

  // All catalog postconditions passed on the clone
  return {
    status: 'P0_CLONE_POSTCONDITION_PASS',
    live_status: 'LIVE_P0_NOT_APPLIED',
    live_p0_accepted: false,
    table_checks: {
      oid: tableMeta.oid,
      relkind: tableMeta.relkind,
      owner: tableMeta.owner,
      rls_enabled: tableMeta.rls_enabled,
      columns_verified: REQUIRED_COLUMNS.length,
    },
    privileges_checks: {
      anon_select: false,
      anon_insert: false,
      anon_update: false,
      anon_delete: false,
    },
    policy_checks: {
      open_policy_absent: true,
      permissive_policies_absent: true,
    },
    rpc_checks: {
      rpcs_verified_count: REQUIRED_TOKEN_RPCS.length,
      rpcs: REQUIRED_TOKEN_RPCS,
    },
  };
}

/**
 * Main entry point for verifying P0 cutover postconditions on a restored clone.
 */
export async function verifyP0Cutover(options = {}) {
  const rawUrl = options.dbUrl || process.env.LARI_RESTORE_DATABASE_URL;
  const cloneConfirmed =
    options.cloneConfirmed ??
    (process.env.LARI_RESTORE_CLONE_CONFIRMED === '1' || process.env.LARI_RESTORE_CLONE_CONFIRMED === 'true');
  const receiptOutputPath =
    options.receiptOutputPath ||
    path.join(options.repoRoot || DEFAULT_REPO_ROOT, 'test-results', 'lari-recovery', 'p0-cutover-receipt.json');

  let parsedDbConfig;
  try {
    parsedDbConfig = validateAndParseCloneDatabaseUrl(rawUrl, cloneConfirmed);
  } catch (err) {
    return {
      status: 'RESTORED_CLONE_REQUIRED',
      error: err.message,
      code: err.code || 'RESTORED_CLONE_REQUIRED',
      live_p0_accepted: false,
    };
  }

  let catalogResult;
  try {
    catalogResult = await withReadOnlyCloneClient(rawUrl, cloneConfirmed, async (client) => {
      return await queryP0CatalogPostconditions(client);
    });
  } catch (connErr) {
    return {
      status: 'RESTORED_CLONE_REQUIRED',
      error: connErr.message,
      code: connErr.code || 'RESTORED_CLONE_REQUIRED',
      database_name: parsedDbConfig.dbName,
      live_p0_accepted: false,
    };
  }

  const receipt = {
    schema_version: 1,
    tool: 'verify-p0-cutover',
    database_name: parsedDbConfig.dbName,
    checked_at: new Date().toISOString(),
    evaluation_target: 'RESTORED_CLONE',
    live_p0_accepted: false,
    ...catalogResult,
  };

  try {
    fs.mkdirSync(path.dirname(receiptOutputPath), { recursive: true });
    fs.writeFileSync(receiptOutputPath, JSON.stringify(receipt, null, 2), 'utf8');
  } catch {
    // Non-fatal if test output dir not writable
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
    }
  }

  verifyP0Cutover({ dbUrl, cloneConfirmed })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'RESTORED_CLONE_REQUIRED') {
        console.log('\n[LARI-P0] Status: RESTORED_CLONE_REQUIRED');
        process.exit(0);
      } else {
        console.log(`\n[LARI-P0] Status: ${result.status}`);
      }
    })
    .catch((err) => {
      console.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
