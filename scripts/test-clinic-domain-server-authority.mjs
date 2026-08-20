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

  // Verify Audit Events payloads do not leak clinical narrative
  assert(!migContent.includes("'subjective', p_subjective") && !migContent.includes("'allergies', p_allergies"), 'Audit events payloads DO NOT leak clinical narrative content');
}

// 2. Verify SQL Test & Concurrency Harness Files
const sqlTestPath = path.join(rootDir, 'supabase/tests/clinic_domain_server_authority_tests.sql');
assert(fs.existsSync(sqlTestPath), 'SQL test suite clinic_domain_server_authority_tests.sql exists');

const harnessPath = path.join(rootDir, 'supabase/tests/clinic_domain_concurrency_harness.ts');
assert(fs.existsSync(harnessPath), 'Real concurrency harness clinic_domain_concurrency_harness.ts exists');

if (fs.existsSync(harnessPath)) {
  const hContent = fs.readFileSync(harnessPath, 'utf8');
  assert(hContent.includes("from 'pg'"), 'Harness uses real pg client');
  assert(hContent.includes('HARNESS_DB_EXECUTION_OCCURRED = YES'), 'Harness contains HARNESS_DB_EXECUTION_OCCURRED marker');
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
