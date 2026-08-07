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

// Deterministic SQL contract validator engine
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

  // 7. Check public.staff inserts
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
    'H1E_C_FIXTURE_RELATIONSHIP_OWNERSHIP_CONFLICT'
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

// -----------------------------------------------------------------------------
// REGRESSION & RECONCILIATION TESTS
// -----------------------------------------------------------------------------

check('8. Regression test: Fixture SQL accepts existing dedicated tenant ID dddd1111-d1d1-d1d1-d1d1-dddddddddddd with canonical slug h1d-contract-test without renaming live data', () => {
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
// NEGATIVE FIXTURE TESTS (PROVING VALIDATOR FAILS IF GUARDS ARE REMOVED)
// -----------------------------------------------------------------------------

check('9. Negative test: Replacing revoked_at IS NULL with status = active causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('revoked_at IS NULL', "status = 'active'");
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('status column')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch status = active schema defect');
});

check('10. Negative test: Removing release-control id = 1 cardinality guard causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID', 'REMOVED_GUARD');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch missing release-control cardinality guard');
});

check('11. Negative test: Replacing IS DISTINCT FROM with != causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('IS DISTINCT FROM', '!=');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('IS DISTINCT FROM')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch non-null-safe != check');
});

check('12. Negative test: Removing subscription-event semantic payload fields causes validator failure', () => {
  const modified = rawSqlContent.replaceAll("metadata->>'source'", 'REMOVED_FIELD');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
  }
  if (!threw) throw new Error('Validator failed to catch missing subscription-event semantic guard');
});

check('13. Negative test: Removing postflight active-authorization check causes validator failure', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const firstPos = activeSql.indexOf('revoked_at IS NULL');
  const secondPos = activeSql.indexOf('revoked_at IS NULL', firstPos + 1);
  const modified = activeSql.slice(0, secondPos) + activeSql.slice(secondPos).replace('revoked_at IS NULL', '1 = 1');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
  }
  if (!threw) throw new Error('Validator failed to catch missing postflight active-authorization check');
});

console.log(`\nDefined tests: ${defined}`);
console.log(`Executed tests: ${executed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
