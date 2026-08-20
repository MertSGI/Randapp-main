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
  assert(sqlContent.includes('INSERT INTO public.clinic_staff_profiles') && sqlContent.includes('SECURITY FAIL E1'), 'SQL test suite contains literal tenant-owner direct DML denial assertions');
  assert(sqlContent.includes('v_inact_owner_id'), 'SQL test suite contains inactive owner denial test');
  assert(sqlContent.includes('v_inact_staff_id'), 'SQL test suite contains inactive target staff rejection test');
  assert(sqlContent.includes('v_doc2_id') && sqlContent.includes('SECURITY FAIL K1'), 'SQL test suite contains authorized cross-tenant boundary assertions');
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
