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

  // 2. Extract UUID literals
  const uuidMatches = activeSql.match(/'([0-9a-zA-Z\-]{36})'/g) || [];
  const extractedUuids = uuidMatches.map(m => m.replace(/'/g, ''));
  if (extractedUuids.length === 0) throw new Error('No UUID literals found in fixture SQL');
  for (const uuid of extractedUuids) {
    if (!UUID_REGEX.test(uuid)) {
      throw new Error(`Invalid UUID literal containing non-hex characters: "${uuid}"`);
    }
  }

  // 3. Check public.staff inserts
  const staffInsertMatch = activeSql.match(/INSERT\s+INTO\s+public\.staff\s*\(([^)]+)\)/i);
  if (staffInsertMatch) {
    const cols = staffInsertMatch[1].split(',').map(c => c.trim().toLowerCase());
    if (cols.includes('role')) {
      throw new Error('Fixture SQL inserts into non-existent column public.staff.role');
    }
  }

  // 4. Canonical plan code & billing_mode
  if (!activeSql.includes("'premium'")) throw new Error("Fixture SQL missing canonical plan code 'premium'");
  if (activeSql.includes("'premium_monthly'")) throw new Error("Fixture SQL contains non-canonical code 'premium_monthly'");
  if (!activeSql.includes("'manual'")) throw new Error("Fixture SQL missing billing_mode 'manual'");

  // 5. Hardened Ownership Exception Codes Assertion
  const requiredExceptionCodes = [
    'H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION',
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

  // 6. Pre/Post Safety Invariant Checks
  if (!activeSql.includes("release_phase != 'pre_pilot'")) {
    throw new Error('Fixture SQL missing release_phase pre_pilot safety invariant assertion');
  }

  // 7. Canonical tenant isolation assertion
  if (activeSql.includes('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa')) {
    throw new Error('Fixture SQL contains canonical tenant ID aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa!');
  }

  // 8. Target dedicated tenant assertion
  if (!activeSql.includes('dddd1111-d1d1-d1d1-d1d1-dddddddddddd')) {
    throw new Error('Fixture SQL does not target dedicated tenant dddd1111-d1d1-d1d1-d1d1-dddddddddddd');
  }

  return true;
}

// -----------------------------------------------------------------------------
// POSITIVE CONTRACT TESTS
// -----------------------------------------------------------------------------

check('1. Actual h1e_c_dedicated_tenant_fixture.sql passes complete contract validation', () => {
  verifySqlContentGuards(rawSqlContent);
});

check('2. Every hard-coded fixture UUID literal in active SQL parses as PostgreSQL-compatible hex UUID', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const uuidMatches = activeSql.match(/'([0-9a-zA-Z\-]{36})'/g) || [];
  for (const uuid of uuidMatches.map(m => m.replace(/'/g, ''))) {
    if (!UUID_REGEX.test(uuid)) throw new Error(`Non-hex UUID: ${uuid}`);
  }
});

check('3. Fixture SQL includes all 11 explicit machine-testable exception codes', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const codes = [
    'H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION',
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
  for (const code of codes) {
    if (!activeSql.includes(code)) throw new Error(`Missing code: ${code}`);
  }
});

check('4. Fixture SQL includes pre and post global safety invariant checks', () => {
  const activeSql = getActiveSql(rawSqlContent);
  const occurrences = (activeSql.match(/H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION/g) || []).length;
  if (occurrences < 2) {
    throw new Error(`Expected both pre and post safety invariant checks (found ${occurrences})`);
  }
});

check('5. Fixture SQL executes within a single BEGIN; ... COMMIT; transaction boundary', () => {
  const activeSql = getActiveSql(rawSqlContent);
  if (!activeSql.trim().startsWith('BEGIN;') || !activeSql.trim().endsWith('COMMIT;')) {
    throw new Error('Transaction boundary missing or malformed');
  }
});

// -----------------------------------------------------------------------------
// NEGATIVE FIXTURE TESTS (PROVING VALIDATOR FAILS IF GUARDS ARE REMOVED)
// -----------------------------------------------------------------------------

check('6. Negative test: Removing H1E_C_FIXTURE_TENANT_SLUG_CONFLICT causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('H1E_C_FIXTURE_TENANT_SLUG_CONFLICT', 'REMOVED_GUARD');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('H1E_C_FIXTURE_TENANT_SLUG_CONFLICT')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch missing tenant slug conflict guard');
});

check('7. Negative test: Removing H1E_C_FIXTURE_BRANCH_OWNERSHIP_CONFLICT causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('H1E_C_FIXTURE_BRANCH_OWNERSHIP_CONFLICT', 'REMOVED_GUARD');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('H1E_C_FIXTURE_BRANCH_OWNERSHIP_CONFLICT')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch missing branch ownership guard');
});

check('8. Negative test: Removing H1E_C_FIXTURE_PREMIUM_V1_CARDINALITY_INVALID causes validator failure', () => {
  const modified = rawSqlContent.replaceAll('H1E_C_FIXTURE_PREMIUM_V1_CARDINALITY_INVALID', 'REMOVED_GUARD');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
    if (!err.message.includes('H1E_C_FIXTURE_PREMIUM_V1_CARDINALITY_INVALID')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
  if (!threw) throw new Error('Validator failed to catch missing premium v1 cardinality guard');
});

check('9. Negative test: Removing BEGIN; transaction boundary causes validator failure', () => {
  const modified = rawSqlContent.replace('BEGIN;', '-- REMOVED');
  let threw = false;
  try {
    verifySqlContentGuards(modified);
  } catch (err) {
    threw = true;
  }
  if (!threw) throw new Error('Validator failed to catch missing BEGIN; boundary');
});

check('10. Negative test: Adding canonical tenant UUID causes validator failure', () => {
  const modified = rawSqlContent + "\n-- 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa'";
  const activeModified = getActiveSql(modified) + "\nSELECT 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';";
  let threw = false;
  try {
    verifySqlContentGuards(activeModified);
  } catch (err) {
    threw = true;
  }
  if (!threw) throw new Error('Validator failed to catch canonical tenant UUID reference');
});

console.log(`\nDefined tests: ${defined}`);
console.log(`Executed tests: ${executed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
