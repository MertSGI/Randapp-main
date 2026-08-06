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

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// Strip single-line comments for strict SQL statement assertion
const activeSqlContent = sqlContent
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

// Helper to validate Postgres UUID syntax
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// 1. Extract UUID literals from SQL
const uuidMatches = activeSqlContent.match(/'([0-9a-zA-Z\-]{36})'/g) || [];
const extractedUuids = uuidMatches.map(m => m.replace(/'/g, ''));

check('1. Every hard-coded fixture UUID literal in SQL parses as PostgreSQL-compatible hex UUID', () => {
  if (extractedUuids.length === 0) throw new Error('No UUID literals found in fixture SQL');
  for (const uuid of extractedUuids) {
    if (!UUID_REGEX.test(uuid)) {
      throw new Error(`Invalid UUID literal containing non-hex characters: "${uuid}"`);
    }
  }
});

check('2. Fixture SQL does not reference public.staff.role column', () => {
  const staffInsertMatch = activeSqlContent.match(/INSERT\s+INTO\s+public\.staff\s*\(([^)]+)\)/i);
  if (staffInsertMatch) {
    const cols = staffInsertMatch[1].split(',').map(c => c.trim().toLowerCase());
    if (cols.includes('role')) {
      throw new Error('Fixture SQL inserts into non-existent column public.staff.role');
    }
  }
});

check('3. Fixture SQL uses canonical plan code premium', () => {
  if (!activeSqlContent.includes("'premium'")) {
    throw new Error("Fixture SQL does not use canonical plan code 'premium'");
  }
  if (activeSqlContent.includes("'premium_monthly'")) {
    throw new Error("Fixture SQL uses invalid noncanonical plan code 'premium_monthly'");
  }
});

check('4. Fixture SQL dynamically resolves published plan_version_id for premium v1', () => {
  const resolvesPlanVersion = activeSqlContent.includes('public.plan_versions') &&
    activeSqlContent.includes("code = 'premium'") &&
    activeSqlContent.includes('version_number = 1') &&
    activeSqlContent.includes("lifecycle_status = 'published'");
  if (!resolvesPlanVersion) {
    throw new Error('Fixture SQL does not dynamically resolve published premium v1 plan_version_id');
  }
});

check('5. Fixture SQL sets subscription billing_mode = manual', () => {
  if (!activeSqlContent.includes("'manual'")) {
    throw new Error("Fixture SQL does not set billing_mode to 'manual'");
  }
});

check('6. Fixture SQL does not modify global release control', () => {
  if (activeSqlContent.includes('platform_global_release_control')) {
    throw new Error('Fixture SQL must not reference or modify platform_global_release_control');
  }
});

check('7. Fixture SQL does not modify pilot authorizations', () => {
  if (activeSqlContent.includes('tenant_pilot_authorizations')) {
    throw new Error('Fixture SQL must not reference or modify tenant_pilot_authorizations');
  }
});

check('8. Fixture SQL does not touch the canonical tenant aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', () => {
  if (activeSqlContent.includes('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa')) {
    throw new Error('Fixture SQL contains canonical tenant ID aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa!');
  }
});

check('9. Fixture SQL includes an idempotent subscription event with stable key', () => {
  const hasSubEvent = activeSqlContent.includes('public.subscription_events') &&
    activeSqlContent.includes("'h1e_c_dedicated_tenant_fixture_sub_event'") &&
    activeSqlContent.includes('ON CONFLICT (idempotency_key) DO NOTHING');
  if (!hasSubEvent) {
    throw new Error('Fixture SQL missing idempotent subscription event insertion');
  }
});

check('10. Fixture SQL targets strictly dedicated tenant dddd1111-d1d1-d1d1-d1d1-dddddddddddd', () => {
  if (!activeSqlContent.includes('dddd1111-d1d1-d1d1-d1d1-dddddddddddd')) {
    throw new Error('Fixture SQL does not target dedicated tenant dddd1111-d1d1-d1d1-d1d1-dddddddddddd');
  }
});

console.log(`\nDefined tests: ${defined}`);
console.log(`Executed tests: ${executed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exitCode = 1;
