import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🏁 Running Clinic Domain Server-Authority Static QA Verification Suite (Block 1)...\n');

// 1. Verify Migration File Existence & Canonical Contracts
const migrationPath = path.join(rootDir, 'supabase/migrations/20260905_lari_clinic_domain_server_authority.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260905_lari_clinic_domain_server_authority.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');

  // Verify DB Identity Role Model remains unchanged
  assert(!migContent.includes('ALTER TYPE user_role ADD VALUE') && !migContent.includes("role IN ('doctor'"), 'Canonical DB role model is NOT altered (no doctor/practitioner/receptionist added to roles)');

  // Verify Commercial Source of Truth is NOT modified
  assert(!migContent.includes('clinic_records_enabled') && !migContent.includes('max_practitioners'), 'Commercial feature registry is NOT modified with clinic keys in Block 1');

  // Verify Appointments table is NOT mutated with in_consultation status or encounter_id
  assert(!migContent.includes("ADD COLUMN encounter_id") && !migContent.includes("in_consultation"), 'Appointments table is NOT mutated with in_consultation or encounter_id in Block 1');

  // Verify Created Clinic Tables
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.clinic_staff_profiles'), 'Creates public.clinic_staff_profiles table');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.clinic_patient_profiles'), 'Creates public.clinic_patient_profiles table');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.clinic_encounters'), 'Creates public.clinic_encounters table');
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.clinic_encounter_notes'), 'Creates public.clinic_encounter_notes table');

  // Verify RLS Enablement on all new tables
  assert(migContent.includes('ALTER TABLE public.clinic_staff_profiles ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on clinic_staff_profiles');
  assert(migContent.includes('ALTER TABLE public.clinic_patient_profiles ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on clinic_patient_profiles');
  assert(migContent.includes('ALTER TABLE public.clinic_encounters ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on clinic_encounters');
  assert(migContent.includes('ALTER TABLE public.clinic_encounter_notes ENABLE ROW LEVEL SECURITY;'), 'RLS enabled on clinic_encounter_notes');

  // Verify Server-Authoritative RPCs exist, SECURITY DEFINER & hardened search_path
  const rpcs = [
    'clinic_set_staff_profile',
    'clinic_upsert_patient_profile',
    'clinic_start_encounter',
    'clinic_save_encounter_note',
    'clinic_complete_encounter',
    'clinic_get_patient_history'
  ];

  rpcs.forEach(rpc => {
    assert(migContent.includes(`FUNCTION public.${rpc}`), `RPC public.${rpc} declared`);
    assert(migContent.includes(`REVOKE ALL ON FUNCTION public.${rpc} FROM PUBLIC, anon;`), `EXECUTE revoked from PUBLIC, anon for ${rpc}`);
  });

  assert(migContent.includes('SECURITY DEFINER'), 'RPCs use SECURITY DEFINER');
  assert(migContent.includes('SET search_path = pg_catalog, public'), 'RPCs have hardened search_path = pg_catalog, public');

  // Verify Append-Only Notes & Advisory Locking
  assert(migContent.includes('version INTEGER NOT NULL'), 'Clinical notes are versioned');
  assert(migContent.includes('hashtextextended'), 'Uses 64-bit advisory locking for version concurrency');

  // Verify RLS policy hardening: NO direct DML policies on clinic_staff_profiles
  assert(!migContent.includes('FOR ALL') && !migContent.includes('FOR INSERT') && !migContent.includes('FOR UPDATE') && !migContent.includes('FOR DELETE'), 'NO direct DML policies exist on clinic_staff_profiles (RPC server authority enforced)');

  // Verify clinic_set_staff_profile requires active tenant owner and active target staff
  assert(migContent.includes('AND active = true'), 'clinic_set_staff_profile requires active = true for tenant_owner');
  assert(migContent.includes('v_target_staff.active IS NOT TRUE'), 'clinic_set_staff_profile rejects inactive target staff');

  // Verify Audit Events payloads do not leak clinical narrative
  assert(!migContent.includes("'subjective', p_subjective") && !migContent.includes("'allergies', p_allergies"), 'Audit events payloads DO NOT leak clinical narrative content');
}

// 2. Verify SQL Test & Concurrency Harness Files
const sqlTestPath = path.join(rootDir, 'supabase/tests/clinic_domain_server_authority_tests.sql');
assert(fs.existsSync(sqlTestPath), 'SQL test suite clinic_domain_server_authority_tests.sql exists');

if (fs.existsSync(sqlTestPath)) {
  const sqlContent = fs.readFileSync(sqlTestPath, 'utf8');
  assert(sqlContent.includes('SET LOCAL ROLE anon;'), 'SQL test suite contains literal anon security test section');
  assert(!sqlContent.includes('EXCEPTION WHEN OTHERS THEN NULL;'), 'SQL test suite contains ZERO false-green exception-swallowing patterns (EXCEPTION WHEN OTHERS THEN NULL;)');
  assert(sqlContent.includes('v_priv_count'), 'SQL test suite asserts pre-existing protected rows before anon / no-profile checks');
  assert(sqlContent.includes('GET DIAGNOSTICS v_row_count = ROW_COUNT;'), 'SQL test suite uses ROW_COUNT diagnostics for direct DML denial verification');
  assert(sqlContent.includes('v_owner2_id') && sqlContent.includes('Dr. Active Owner 2'), 'SQL test suite creates real Tenant 2 Owner authority');
  assert(sqlContent.includes("v_audit_check.payload ? 'subjective'"), 'SQL test suite inspects audit JSON payload keys for forbidden clinical field names');
  assert(sqlContent.includes('PUBLIC / SELF-SERVICE CLINICAL ISOLATION PROOF'), 'SQL test suite contains literal public booking function clinical table isolation checks');
}

const harnessPath = path.join(rootDir, 'supabase/tests/clinic_domain_concurrency_harness.ts');
assert(fs.existsSync(harnessPath), 'Real concurrency harness clinic_domain_concurrency_harness.ts exists');

if (fs.existsSync(harnessPath)) {
  const hContent = fs.readFileSync(harnessPath, 'utf8');
  assert(hContent.includes("from 'pg'"), 'Harness uses real pg client');
  assert(hContent.includes("query('BEGIN;')") || hContent.includes('BEGIN;'), 'Harness uses explicit transaction blocks per concurrent RPC call');
  assert(!hContent.includes("await client1.query(`SET LOCAL request.jwt.claim.sub"), 'Harness avoids transactionless standalone SET LOCAL auth context');
  assert(hContent.includes('HARNESS_AUTH_CONTEXT_PROVEN = YES'), 'Harness contains HARNESS_AUTH_CONTEXT_PROVEN marker');
  assert(hContent.includes('HARNESS_DB_EXECUTION_OCCURRED = YES'), 'Harness contains HARNESS_DB_EXECUTION_OCCURRED marker');
  assert(hContent.includes('HARNESS_REAL_MULTI_SESSION_CONCURRENCY = YES'), 'Harness contains HARNESS_REAL_MULTI_SESSION_CONCURRENCY marker');
}

// 3. Static UUID Syntax & Historical Invalid Literal Validation
console.log('\n🔒 Checking UUID Literal Syntax Integrity in Test Fixtures...');
const targetTestFiles = [sqlTestPath, harnessPath];
const validUuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
let invalidUuidCount = 0;

for (const tfPath of targetTestFiles) {
  if (!fs.existsSync(tfPath)) continue;
  const fileText = fs.readFileSync(tfPath, 'utf8');
  assert(!fileText.includes('n1111111-1111-4111-8111-111111111111'), `Historical invalid UUID 'n1111111-1111-4111-8111-111111111111' is absent from ${path.basename(tfPath)}`);

  // Extract all single-quoted or double-quoted UUID-shaped strings (8-4-4-4-12)
  const matches = fileText.match(/['"]([a-zA-Z0-9-]{36})['"]/g) || [];
  for (const match of matches) {
    const rawUuid = match.slice(1, -1);
    // Ignore known non-UUID placeholders if any, but validate all UUID-shaped strings
    if (rawUuid.split('-').length === 5 && rawUuid.length === 36) {
      if (!validUuidRegex.test(rawUuid)) {
        console.error(`❌ INVALID UUID SYNTAX FOUND: '${rawUuid}' in ${path.basename(tfPath)}`);
        invalidUuidCount++;
      }
    }
  }
}

assert(invalidUuidCount === 0, 'All test fixture UUID literals satisfy strict hexadecimal PostgreSQL UUID syntax ([0-9a-fA-F])');

// 3. Verify Codebase for prohibited client-side storage or raw public booking leaks
const srcDir = path.join(rootDir, 'src');
if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir, { recursive: true });
  files.forEach(file => {
    if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      const fullPath = path.join(srcDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(!content.includes('localStorage.setItem("clinic_') && !content.includes('sessionStorage.setItem("clinic_'), `No clinical data stored in localStorage/sessionStorage in ${file}`);
    }
  });
}

if (failures > 0) {
  console.error(`\n❌ Static QA Failed with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log('\n🎉 Clinic Domain Server-Authority Static QA Verification Passed Successfully!');
}
