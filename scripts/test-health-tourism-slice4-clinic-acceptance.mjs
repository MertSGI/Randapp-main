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

console.log('🏁 Running Health Tourism Slice 4 Block 1 Hardened Static QA Suite...\n');

// 1. Migration 68 Existence & Authority Checks
const migrationPath = path.join(rootDir, 'supabase/migrations/20260912_lari_health_tourism_clinic_acceptance.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260912_lari_health_tourism_clinic_acceptance.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');

  assert(migContent.includes('converted_customer_id'), 'Migration adds converted_customer_id column');
  assert(migContent.includes('converted_patient_profile_id'), 'Migration adds converted_patient_profile_id column');
  assert(migContent.includes('converted_appointment_id'), 'Migration adds converted_appointment_id column');
  assert(migContent.includes('converted_at'), 'Migration adds converted_at column');
  assert(migContent.includes('converted_by_staff_id'), 'Migration adds converted_by_staff_id column');
  assert(migContent.includes('preferred_language'), 'Migration extends clinic_patient_profiles with preferred_language');

  // Verify RPCs
  assert(migContent.includes('FUNCTION public.ht_accept_lead_into_clinic'), 'Contains ht_accept_lead_into_clinic RPC');
  assert(migContent.includes('FUNCTION public.ht_list_pending_clinic_acceptance'), 'Contains ht_list_pending_clinic_acceptance RPC');

  // Verify Security & Locking
  assert(migContent.includes('SECURITY DEFINER'), 'RPCs are SECURITY DEFINER');
  assert(migContent.includes('SET search_path = pg_catalog, public'), 'RPCs set search_path');
  assert(migContent.includes('FOR UPDATE'), 'ht_accept_lead_into_clinic locks lead row using FOR UPDATE');
  assert(migContent.includes('can_manage_patient_profiles'), 'ht_accept_lead_into_clinic checks can_manage_patient_profiles');

  // Verify ACLs
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_accept_lead_into_clinic'), 'REVOKE ALL on ht_accept_lead_into_clinic');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_accept_lead_into_clinic'), 'GRANT EXECUTE on ht_accept_lead_into_clinic TO authenticated');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.ht_list_pending_clinic_acceptance'), 'REVOKE ALL on ht_list_pending_clinic_acceptance');
  assert(migContent.includes('GRANT EXECUTE ON FUNCTION public.ht_list_pending_clinic_acceptance'), 'GRANT EXECUTE on ht_list_pending_clinic_acceptance TO authenticated');

  // Verify Idempotency & Audit
  assert(migContent.includes('already_converted'), 'ht_accept_lead_into_clinic returns already_converted flag');
  assert(migContent.includes('ALREADY_CONVERTED'), 'ht_accept_lead_into_clinic raises ALREADY_CONVERTED on mismatch');
  assert(migContent.includes('ht_lead_clinic_accepted'), 'ht_accept_lead_into_clinic writes ht_lead_clinic_accepted audit event');
}

// 2. Test File Existence & Assertions Check
const testPath = path.join(rootDir, 'supabase/tests/health_tourism_clinic_acceptance_tests.sql');
assert(fs.existsSync(testPath), 'Test file health_tourism_clinic_acceptance_tests.sql exists');

if (fs.existsSync(testPath)) {
  const testContent = fs.readFileSync(testPath, 'utf8');
  assert(testContent.includes('plan(30)'), 'Test suite plans 30 pgTAP assertions');
  assert(testContent.includes('01 unauthenticated conversion denied'), 'Contains Assertion 01');
  assert(testContent.includes('13 successful conversion creates exactly 1 customer, 1 patient profile, 1 appointment'), 'Contains Assertion 13');
  assert(testContent.includes('15 preferred_language copied exactly to clinic_patient_profiles'), 'Contains Assertion 15');
  assert(testContent.includes('16 passport_number NOT copied into Clinic domain'), 'Contains Assertion 16');
  assert(testContent.includes('21 exact second call is idempotent'), 'Contains Assertion 21');
  assert(testContent.includes('28 communication_outbox delta = 0'), 'Contains Assertion 28');
}

console.log('\n--- Summary ---');
if (failures > 0) {
  console.error(`❌ Total failures: ${failures}`);
  process.exit(1);
} else {
  console.log('✅ All Slice 4 Block 1 static QA assertions passed successfully!');
  process.exit(0);
}
