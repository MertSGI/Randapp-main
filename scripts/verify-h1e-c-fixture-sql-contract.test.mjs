// scripts/verify-h1e-c-fixture-sql-contract.test.mjs
import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-C FIXTURE SQL CONTRACT & STATIC VALIDATION TESTS ===');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, fn) {
  defined++;
  executed++;
  try {
    fn();
    passed++;
    console.log('  ✅ PASS: ' + title);
  } catch (err) {
    failed++;
    console.error('  ❌ FAIL: ' + title + ' - ' + err.message);
  }
}

const sqlPath = path.join(process.cwd(), 'supabase', 'seed', 'h1e_c_dedicated_tenant_fixture.sql');
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ CRITICAL: Fixture SQL file missing at ${sqlPath}`);
  process.exit(1);
}

const rawSqlContent = fs.readFileSync(sqlPath, 'utf8');

// Helper to strip single-line comments for active SQL analysis
export function getActiveSql(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// =========================================================================
// CANONICAL SCHEMA MAP — derived from active migrations
// =========================================================================
export const CANONICAL_SCHEMA_MAP = {
  'tenants': ['id', 'slug', 'name', 'status', 'public_site_status', 'tenant_id', 'created_at', 'updated_at', 'email', 'phone'],
  'branches': ['id', 'tenant_id', 'name', 'slug', 'is_active', 'is_primary', 'timezone', 'created_at', 'updated_at'],
  'services': ['id', 'tenant_id', 'name', 'duration', 'price', 'active', 'category', 'created_at', 'updated_at', 'description'],
  'staff': ['id', 'tenant_id', 'name', 'active', 'is_owner', 'created_at', 'updated_at', 'email', 'phone'],
  'staff_services': ['staff_id', 'service_id'],
  'service_branches': ['tenant_id', 'service_id', 'branch_id', 'created_at'],
  'staff_branches': ['tenant_id', 'staff_id', 'branch_id', 'created_at'],
  'subscriptions': ['id', 'tenant_id', 'plan_id', 'plan_version_id', 'status', 'billing_mode', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'cancelled_at', 'past_due_at', 'provider', 'provider_subscription_reference_code', 'provider_customer_reference_code', 'trial_starts_at', 'trial_ends_at', 'grace_until', 'commercial_version', 'created_at', 'updated_at'],
  'subscription_events': ['id', 'subscription_id', 'tenant_id', 'event_type', 'previous_state', 'new_state', 'internal_reason', 'idempotency_key', 'metadata', 'created_at'],
  'plans': ['id', 'code', 'name', 'description', 'is_active', 'created_at'],
  'plan_versions': ['id', 'plan_id', 'version_number', 'lifecycle_status', 'created_at'],
  'platform_global_release_control': ['id', 'release_phase', 'is_payment_collection_enabled', 'is_checkout_enabled', 'is_iyzico_enabled', 'updated_at'],
  'tenant_pilot_authorizations': ['id', 'tenant_id', 'authorized_at', 'authorized_by', 'revoked_at', 'revoked_by', 'revocation_reason', 'created_at'],
  'tenant_business_profiles': ['tenant_id', 'short_description', 'is_public_profile_enabled', 'created_at', 'updated_at']
};

// =========================================================================
// FIXTURE COLUMN-LINT VALIDATOR
// =========================================================================
// Extracts alias.column references and INSERT column lists from fixture SQL,
// then validates every referenced column against the canonical schema map.
export function verifyFixtureColumnReferences(sqlContent) {
  const activeSql = getActiveSql(sqlContent);
  const errors = [];

  // 1. Validate INSERT INTO columns
  const insertMatches = [...activeSql.matchAll(/INSERT\s+INTO\s+public\.(\w+)\s*\(([^)]+)\)/gi)];
  for (const m of insertMatches) {
    const table = m[1].toLowerCase();
    const cols = m[2].split(',').map(c => c.trim().toLowerCase());
    const schema = CANONICAL_SCHEMA_MAP[table];
    if (!schema) {
      errors.push({ table, column: '*', issue: `Table public.${table} not in canonical schema map` });
      continue;
    }
    for (const col of cols) {
      if (!schema.includes(col)) {
        errors.push({ table, column: col, issue: `Column '${col}' does not exist on public.${table}` });
      }
    }
  }

  // 2. Validate alias.column references in WHERE/AND/ON/SET clauses
  // Build alias-to-table mappings from FROM/JOIN clauses
  const aliasMap = {};
  const fromJoinMatches = [...activeSql.matchAll(/(?:FROM|JOIN)\s+public\.(\w+)\s+(\w+)/gi)];
  for (const m of fromJoinMatches) {
    aliasMap[m[2].toLowerCase()] = m[1].toLowerCase();
  }

  // Find all alias.column references (format: alias.column_name)
  const aliasColMatches = [...activeSql.matchAll(/\b(\w+)\.(\w+)\b/g)];
  for (const m of aliasColMatches) {
    const alias = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    // Skip non-alias prefixes (public, excluded, etc.)
    if (['public', 'excluded', 'pg_catalog', 'information_schema'].includes(alias)) continue;
    // Skip function calls and keywords
    if (['id', 'now', 'gen_random_uuid', 'jsonb_build_object', 'count'].includes(col)) continue;
    
    const table = aliasMap[alias];
    if (!table) continue; // Not a known alias
    
    const schema = CANONICAL_SCHEMA_MAP[table];
    if (!schema) continue; // Table not in map
    
    if (!schema.includes(col)) {
      errors.push({ table, alias, column: col, issue: `Alias '${alias}' references non-existent column '${col}' on public.${table}` });
    }
  }

  return { valid: errors.length === 0, errors };
}

// =========================================================================
// DETERMINISTIC SQL CONTRACT VALIDATOR ENGINE
// =========================================================================
export function verifySqlContentGuards(sqlContent) {
  const activeSql = getActiveSql(sqlContent);

  // 1. Transaction boundary check
  if (!activeSql.trim().startsWith('BEGIN;') || !activeSql.trim().endsWith('COMMIT;')) {
    throw new Error('Fixture SQL must be wrapped in a single BEGIN; ... COMMIT; transaction block');
  }

  // 2. Schema alignment: tenant_pilot_authorizations must NOT use status = 'active'
  if (activeSql.includes('status = \'active\'') || activeSql.includes('status=\'active\'')) {
    throw new Error('Schema defect: tenant_pilot_authorizations does not define status column; must use revoked_at IS NULL');
  }

  // 3. Must use canonical active authorization condition: revoked_at IS NULL
  const revokedAtMatches = (activeSql.match(/revoked_at\s+IS\s+NULL/gi) || []).length;
  if (revokedAtMatches < 2) {
    throw new Error(`Fixture SQL must use revoked_at IS NULL for both preflight and postflight active-authorization checks (found ${revokedAtMatches})`);
  }

  // 4. Release-control singleton cardinality & WHERE id = 1
  if (!activeSql.includes('WHERE id = 1') && !activeSql.includes('WHERE id=1')) {
    throw new Error('Fixture SQL must query release control with WHERE id = 1 (no LIMIT 1)');
  }
  if (!activeSql.includes('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID')) {
    throw new Error('Fixture SQL missing H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID guard');
  }

  // 5. Null-safe IS DISTINCT FROM checks
  const distinctMatches = (activeSql.match(/IS\s+DISTINCT\s+FROM/gi) || []).length;
  if (distinctMatches < 5) {
    throw new Error(`Fixture SQL must use IS DISTINCT FROM for null-safe safety and slug checks (found ${distinctMatches})`);
  }

  // 6. Extract UUID literals
  const uuidMatches = activeSql.match(/'([0-9a-zA-Z\-]{36})'/g) || [];
  const extractedUuids = uuidMatches.map(m => m.replace(/'/g, ''));
  if (extractedUuids.length === 0) throw new Error('No UUID literals found in fixture SQL');
  for (const uuid of extractedUuids) {
    if (!UUID_REGEX.test(uuid)) {
      throw new Error(`Invalid UUID literal containing non-hex characters: "${uuid}"`);
    }
  }

  // 7. Check public.staff inserts — no 'role' column
  const staffInsertMatch = activeSql.match(/INSERT\s+INTO\s+public\.staff\s*\(([^)]+)\)/i);
  if (staffInsertMatch) {
    const cols = staffInsertMatch[1].split(',').map(c => c.trim().toLowerCase());
    if (cols.includes('role')) {
      throw new Error('Fixture SQL inserts into non-existent column public.staff.role');
    }
  }

  // 8. Canonical plan code & billing_mode
  if (!activeSql.includes("'premium'")) throw new Error("Fixture SQL missing canonical plan code 'premium'");
  if (activeSql.includes("'premium_monthly'")) throw new Error("Fixture SQL contains non-canonical code 'premium_monthly'");
  if (!activeSql.includes("'manual'")) throw new Error("Fixture SQL missing billing_mode 'manual'");

  // 9. Hardened Ownership Exception Codes Assertion
  const requiredExceptionCodes = [
    'H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION',
    'H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID',
    'H1E_C_FIXTURE_TENANT_SLUG_CONFLICT',
    'H1E_C_FIXTURE_BRANCH_OWNERSHIP_CONFLICT',
    'H1E_C_FIXTURE_UNEXPECTED_PRIMARY_BRANCH',
    'H1E_C_FIXTURE_SERVICE_OWNERSHIP_CONFLICT',
    'H1E_C_FIXTURE_STAFF_OWNERSHIP_CONFLICT',
    'H1E_C_FIXTURE_SUBSCRIPTION_OWNERSHIP_CONFLICT',
    'H1E_C_FIXTURE_UNEXPECTED_SUBSCRIPTION',
    'H1E_C_FIXTURE_PREMIUM_V1_CARDINALITY_INVALID',
    'H1E_C_FIXTURE_SUBSCRIPTION_EVENT_CONFLICT',
    'H1E_C_FIXTURE_SERVICE_BRANCH_RELATIONSHIP_CONFLICT',
    'H1E_C_FIXTURE_STAFF_BRANCH_RELATIONSHIP_CONFLICT',
    'H1E_C_FIXTURE_STAFF_SERVICE_RELATIONSHIP_CONFLICT'
  ];

  for (const code of requiredExceptionCodes) {
    if (!activeSql.includes(code)) {
      throw new Error(`Fixture SQL missing required exception guard: ${code}`);
    }
  }

  // 10. Subscription Event Semantic Guard Check
  const hasSemanticGuard = activeSql.includes("'subscription_created'") &&
    activeSql.includes("'Stage H1E-C dedicated tenant manual subscription fixture creation'") &&
    activeSql.includes("metadata->>'source'");
  if (!hasSemanticGuard) {
    throw new Error('Fixture SQL missing subscription-event semantic payload fields in conflict guard');
  }

  // 11. Canonical tenant isolation assertion
  if (activeSql.includes('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa')) {
    throw new Error('Fixture SQL contains canonical tenant ID aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa!');
  }

  // 12. Target dedicated tenant assertion
  if (!activeSql.includes('dddd1111-d1d1-d1d1-d1d1-dddddddddddd')) {
    throw new Error('Fixture SQL does not target dedicated tenant dddd1111-d1d1-d1d1-d1d1-dddddddddddd');
  }

  // 13. Reconciled slug assertion
  if (!activeSql.includes("'h1d-contract-test'")) {
    throw new Error("Fixture SQL must target reconciled dedicated slug 'h1d-contract-test'");
  }

  // 14. staff_services must NOT reference tenant_id (schema defect guard)
  const staffServicesInsertMatch = activeSql.match(/INSERT\s+INTO\s+public\.staff_services\s*\(([^)]+)\)/i);
  if (staffServicesInsertMatch) {
    const cols = staffServicesInsertMatch[1].split(',').map(c => c.trim().toLowerCase());
    if (cols.includes('tenant_id')) {
      throw new Error('Schema defect: public.staff_services does not have a tenant_id column');
    }
  }

  // 15. No ss.tenant_id alias reference anywhere
  if (/\bss\.tenant_id\b/i.test(activeSql)) {
    throw new Error('Schema defect: alias ss.tenant_id references non-existent column on staff_services');
  }

  // 16. Full column-lint validation
  const colLint = verifyFixtureColumnReferences(sqlContent);
  if (!colLint.valid) {
    const errDetails = colLint.errors.map(e => `${e.table}.${e.column}: ${e.issue}`).join('; ');
    throw new Error(`Column-lint failures: ${errDetails}`);
  }

  return true;
}

// -----------------------------------------------------------------------------
// POSITIVE CONTRACT TESTS
// -----------------------------------------------------------------------------

check('1. Active Migration 49/50 schema does not define a status column on public.tenant_pilot_authorizations', () => {
  const mig49Path = path.join(process.cwd(), 'supabase', 'migrations', '20260824_h1e_b_pilot_authorization_history.sql');
  const mig50Path = path.join(process.cwd(), 'supabase', 'migrations', '20260825_h1e_b_authorization_contract_hardening.sql');
  const content49 = fs.existsSync(mig49Path) ? fs.readFileSync(mig49Path, 'utf8') : '';
  const content50 = fs.existsSync(mig50Path) ? fs.readFileSync(mig50Path, 'utf8') : '';
  const fullContent = content49 + '\n' + content50;

  if (fullContent.includes('status VARCHAR') || fullContent.includes('status TEXT')) {
    throw new Error('Migration defines a status column on tenant_pilot_authorizations!');
  }
  if (!fullContent.includes('revoked_at TIMESTAMPTZ')) {
    throw new Error('Migration missing canonical revoked_at TIMESTAMPTZ column definition!');
  }
});

check('2. Actual h1e_c_dedicated_tenant_fixture.sql passes complete contract validation', () => {
  verifySqlContentGuards(rawSqlContent);
});

check('3. Fixture SQL uses revoked_at IS NULL for both preflight and postflight active authorization checks', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const count = (activeSql.match(/revoked_at\s+IS\s+NULL/gi) || []).length;
  if (count < 2) throw new Error(`Expected >=2 revoked_at IS NULL checks, found ${count}`);
});

check('4. Release control is queried with WHERE id = 1 and exact singleton cardinality check', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.includes('WHERE id = 1')) throw new Error('Missing WHERE id = 1');
  if (!activeSql.includes('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID')) {
    throw new Error('Missing H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID');
  }
});

check('5. Fixture SQL uses null-safe IS DISTINCT FROM for safety and slug checks', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const count = (activeSql.match(/IS\s+DISTINCT\s+FROM/gi) || []).length;
  if (count < 5) throw new Error(`Expected >=5 IS DISTINCT FROM checks, found ${count}`);
});

check('6. Subscription-event semantic fields are validated in conflict guard', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.includes("metadata->>'source'")) throw new Error("Missing metadata->>'source' check");
  if (!activeSql.includes('H1E_C_FIXTURE_SUBSCRIPTION_EVENT_CONFLICT')) {
    throw new Error('Missing H1E_C_FIXTURE_SUBSCRIPTION_EVENT_CONFLICT');
  }
});

check('7. Fixture SQL executes within a single BEGIN; ... COMMIT; transaction boundary', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.trim().startsWith('BEGIN;') || !activeSql.trim().endsWith('COMMIT;')) {
    throw new Error('Transaction boundary missing or malformed');
  }
});

check('8. Fixture SQL uses reconciled dedicated slug h1d-contract-test and does not overwrite existing slug', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.includes("'h1d-contract-test'")) {
    throw new Error('Fixture SQL must use canonical dedicated slug h1d-contract-test');
  }
  const tenantUpdateMatch = activeSql.match(/INSERT\s+INTO\s+public\.tenants[\s\S]+?ON\s+CONFLICT\s*\(id\)\s*DO\s*UPDATE\s+SET\s+([^;]+);/i);
  if (tenantUpdateMatch) {
    const updateClause = tenantUpdateMatch[1].toLowerCase();
    if (updateClause.includes('slug =')) {
      throw new Error('Fixture SQL must not overwrite or rename existing tenant slug!');
    }
  }
});

// -----------------------------------------------------------------------------
// SCHEMA COLUMN-LINT TESTS
// -----------------------------------------------------------------------------

check('9. staff_services schema: only (staff_id, service_id) — no tenant_id', () => {
  const schemaMap = CANONICAL_SCHEMA_MAP;
  if (!schemaMap['staff_services']) throw new Error('staff_services missing from schema map');
  if (schemaMap['staff_services'].includes('tenant_id')) {
    throw new Error('staff_services must NOT have tenant_id in canonical schema');
  }
  if (!schemaMap['staff_services'].includes('staff_id') || !schemaMap['staff_services'].includes('service_id')) {
    throw new Error('staff_services missing required columns');
  }
});

check('10. Fixture SQL INSERT into staff_services does not include tenant_id', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const m = activeSql.match(/INSERT\s+INTO\s+public\.staff_services\s*\(([^)]+)\)/i);
  if (!m) throw new Error('No INSERT INTO public.staff_services found');
  const cols = m[1].split(',').map(c => c.trim().toLowerCase());
  if (cols.includes('tenant_id')) {
    throw new Error('staff_services INSERT must not include tenant_id column');
  }
});

check('11. No ss.tenant_id alias reference in active fixture SQL', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (/\bss\.tenant_id\b/i.test(activeSql)) {
    throw new Error('Found ss.tenant_id reference — staff_services has no tenant_id column');
  }
});

check('12. Full column-lint passes for all fixture table references', () => {
  const result = verifyFixtureColumnReferences(rawSqlContent);
  if (!result.valid) {
    const errStr = result.errors.map(e => `${e.table}.${e.column}`).join(', ');
    throw new Error(`Column-lint found invalid references: ${errStr}`);
  }
});

check('13. Per-relationship exception codes are present: SERVICE_BRANCH, STAFF_BRANCH, STAFF_SERVICE', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.includes('H1E_C_FIXTURE_SERVICE_BRANCH_RELATIONSHIP_CONFLICT')) {
    throw new Error('Missing H1E_C_FIXTURE_SERVICE_BRANCH_RELATIONSHIP_CONFLICT');
  }
  if (!activeSql.includes('H1E_C_FIXTURE_STAFF_BRANCH_RELATIONSHIP_CONFLICT')) {
    throw new Error('Missing H1E_C_FIXTURE_STAFF_BRANCH_RELATIONSHIP_CONFLICT');
  }
  if (!activeSql.includes('H1E_C_FIXTURE_STAFF_SERVICE_RELATIONSHIP_CONFLICT')) {
    throw new Error('Missing H1E_C_FIXTURE_STAFF_SERVICE_RELATIONSHIP_CONFLICT');
  }
});

// -----------------------------------------------------------------------------
// NEGATIVE FIXTURE TESTS
// -----------------------------------------------------------------------------

check('14. Negative: Adding ss.tenant_id to staff_services ownership guard causes validator failure', () => {
  const modified = rawSqlContent.replace(
    /AND \(s\.tenant_id IS DISTINCT FROM.*?OR st\.tenant_id IS DISTINCT FROM.*?\)/s,
    "AND (ss.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR s.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR st.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd')"
  );
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) {
    threw = true;
    if (!err.message.includes('ss.tenant_id')) throw new Error(`Unexpected error: ${err.message}`);
  }
  if (!threw) throw new Error('Validator failed to catch ss.tenant_id schema defect');
});

check('15. Negative: Adding tenant_id to staff_services INSERT causes validator failure', () => {
  const modified = rawSqlContent.replace(
    'INSERT INTO public.staff_services (staff_id, service_id)',
    'INSERT INTO public.staff_services (tenant_id, staff_id, service_id)'
  );
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) { threw = true; }
  if (!threw) throw new Error('Validator failed to catch tenant_id in staff_services INSERT');
});

check('16. Negative: Replacing revoked_at IS NULL with status = active causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('revoked_at IS NULL', "status = 'active'");
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) {
    threw = true;
    if (!err.message.includes('status column')) throw new Error(`Unexpected error: ${err.message}`);
  }
  if (!threw) throw new Error('Validator failed to catch status = active schema defect');
});

check('17. Negative: Removing release-control cardinality guard causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID', 'REMOVED_GUARD');
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) {
    threw = true;
    if (!err.message.includes('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID')) throw new Error(`Unexpected error: ${err.message}`);
  }
  if (!threw) throw new Error('Validator failed to catch missing release-control cardinality guard');
});

check('18. Negative: Replacing IS DISTINCT FROM with != causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('IS DISTINCT FROM', '!=');
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) {
    threw = true;
    if (!err.message.includes('IS DISTINCT FROM')) throw new Error(`Unexpected error: ${err.message}`);
  }
  if (!threw) throw new Error('Validator failed to catch non-null-safe != check');
});

check('19. Negative: Removing subscription-event semantic fields causes validator failure', () => {
  const modified = rawSqlContent.replaceAll("metadata->>'source'", 'REMOVED_FIELD');
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) { threw = true; }
  if (!threw) throw new Error('Validator failed to catch missing subscription-event semantic guard');
});

check('20. Negative: Removing postflight active-authorization check causes validator failure', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const firstPos = activeSql.indexOf('revoked_at IS NULL');
  const secondPos = activeSql.indexOf('revoked_at IS NULL', firstPos + 1);
  const modified = activeSql.slice(0, secondPos) + activeSql.slice(secondPos).replace('revoked_at IS NULL', '1 = 1');
  let threw = false;
  try { verifySqlContentGuards(modified); } catch (err) { threw = true; }
  if (!threw) throw new Error('Validator failed to catch missing postflight active-authorization check');
});

console.log(`\nDefined tests: ${defined}`);
console.log(`Executed tests: ${executed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
