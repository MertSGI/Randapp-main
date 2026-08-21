import {
  normalizeClinicError,
  mapClinicStaffProfileWriteResponse,
  mapClinicPatientProfileWriteResponse,
  mapClinicEncounterStartResponse,
  mapClinicEncounterNoteWriteResponse,
  mapClinicEncounterCompletionResponse,
  mapClinicPatientHistoryResponse,
  mapClinicOperationalDayResponse,
  mapClinicPatientProfileReadResponse,
  mapClinicStaffSetupProfilesResponse
} from '../services/repositories/supabaseClinicRepository.ts';
import { createClinicUnavailableResult } from '../services/clinicService.ts';

console.log('🏁 Running Clinic Application Contracts Executable QA Suite (R1.1 REPAIRED)...\n');

let passCount = 0;
let failCount = 0;

function assertCheck(description, condition, failMessage) {
  if (condition) {
    console.log(`✅ PASSED: ${description}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${description}`);
    if (failMessage) console.error(`   Details: ${failMessage}`);
    failCount++;
  }
}

// =====================================================================
// A. Error Normalization Unit Tests
// =====================================================================
console.log('--- A. Error Normalization Unit Tests ---');
const e1 = normalizeClinicError(401, 'unauthenticated');
assertCheck('HTTP 401 maps to UNAUTHENTICATED', e1.code === 'UNAUTHENTICATED' && e1.message === 'Authentication required to access clinic services.');

const e2 = normalizeClinicError(400, 'APPOINTMENT_NOT_CONFIRMED: appointment status must be confirmed');
assertCheck('APPOINTMENT_NOT_CONFIRMED message maps correctly', e2.code === 'APPOINTMENT_NOT_CONFIRMED' && e2.message === 'Only confirmed appointments can be started.');

const e3 = normalizeClinicError(400, 'ALREADY_EXISTS: encounter already exists');
assertCheck('ALREADY_EXISTS message maps correctly', e3.code === 'ALREADY_EXISTS' && e3.message === 'A clinic encounter already exists for this appointment.');

const e4 = normalizeClinicError(400, 'INVARIANT_VIOLATION: encounter state mismatched');
assertCheck('INVARIANT_VIOLATION message maps correctly', e4.code === 'INVARIANT_VIOLATION' && e4.message === 'Operational invariant violation encountered during completion.');

const e5 = normalizeClinicError(403, 'FORBIDDEN: Caller has no active staff identity');
assertCheck('HTTP 403 maps to FORBIDDEN with safe message', e5.code === 'FORBIDDEN' && e5.message === 'Insufficient clinic permissions to perform this operation.');

const e6 = normalizeClinicError(404, 'NOT_FOUND: Encounter not found');
assertCheck('HTTP 404 maps to NOT_FOUND with safe message', e6.code === 'NOT_FOUND' && e6.message === 'Requested clinic resource was not found.');

const e7 = normalizeClinicError(500, 'Internal Postgres error: relation "foo" does not exist at character 12');
assertCheck('Raw Postgres DB error becomes UNKNOWN with safe message (no SQL text leak)', e7.code === 'UNKNOWN' && e7.message === 'An unexpected clinic operational error occurred.');

// =====================================================================
// B. Real Mapper Function Tests — using SAME exported functions as production
// =====================================================================
console.log('\n--- B. Real Mapper Function Tests (Literal RPC Payloads) ---');

// B1. clinic_set_staff_profile
const staffWriteResult = mapClinicStaffProfileWriteResponse({
  success: true,
  staff_id: '31111111-1111-4111-8111-111111111111',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  can_manage_patient_profiles: true,
  can_view_clinical_records: true,
  can_write_clinical_notes: true
});
assertCheck('mapClinicStaffProfileWriteResponse: staff_id mapped', staffWriteResult.staff_id === '31111111-1111-4111-8111-111111111111');
assertCheck('mapClinicStaffProfileWriteResponse: capabilities preserved', staffWriteResult.can_write_clinical_notes === true);

// B2. clinic_upsert_patient_profile (returns patient_profile_id)
const profileWriteResult = mapClinicPatientProfileWriteResponse({
  success: true,
  patient_profile_id: '71111111-1111-4111-8111-111111111111',
  customer_id: 'c1111111-1111-4111-8111-111111111111',
  tenant_id: '11111111-1111-4111-8111-111111111111'
});
assertCheck('mapClinicPatientProfileWriteResponse: patient_profile_id mapped', profileWriteResult.patient_profile_id === '71111111-1111-4111-8111-111111111111');

// B3. clinic_start_encounter
const startResult = mapClinicEncounterStartResponse({
  success: true,
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  status: 'open',
  started_at: '2026-08-20T20:00:00Z'
});
assertCheck('mapClinicEncounterStartResponse: encounter_id mapped', startResult.encounter_id === 'e1111111-1111-4111-8111-111111111111');
assertCheck('mapClinicEncounterStartResponse: status is open', startResult.status === 'open');

// B4. clinic_save_encounter_note
const noteResult = mapClinicEncounterNoteWriteResponse({
  success: true,
  note_id: '99999999-9999-4999-8999-999999999999',
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  version: 1,
  note_status: 'draft',
  created_at: '2026-08-20T20:00:00Z'
});
assertCheck('mapClinicEncounterNoteWriteResponse: note_id mapped', noteResult.note_id === '99999999-9999-4999-8999-999999999999');
assertCheck('mapClinicEncounterNoteWriteResponse: version mapped', noteResult.version === 1);
assertCheck('mapClinicEncounterNoteWriteResponse: note_status is draft', noteResult.note_status === 'draft');

// B5. clinic_complete_encounter_and_appointment
const completionResult = mapClinicEncounterCompletionResponse({
  success: true,
  reason_code: 'ok',
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  encounter_status: 'completed',
  appointment_status: 'completed',
  completed_at: '2026-08-20T20:30:00Z'
});
assertCheck('mapClinicEncounterCompletionResponse: encounter_id mapped', completionResult.encounter_id === 'e1111111-1111-4111-8111-111111111111');

// B6. clinic_get_patient_history
const historyResult = mapClinicPatientHistoryResponse({
  customer_id: 'c1111111-1111-4111-8111-111111111111',
  patient_profile: {
    id: '71111111-1111-4111-8111-111111111111',
    date_of_birth: '1985-05-12',
    sex_at_birth: 'female',
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    blood_type: 'A Rh+',
    allergies: 'Penicillin',
    chronic_conditions: null,
    updated_at: '2026-08-20T20:00:00Z'
  },
  encounters: [
    {
      id: 'e1111111-1111-4111-8111-111111111111',
      appointment_id: 'a1111111-1111-4111-8111-111111111111',
      status: 'completed',
      reason_for_visit: 'Checkup',
      started_at: '2026-08-20T20:00:00Z',
      completed_at: '2026-08-20T20:30:00Z',
      notes: [
        {
          id: '51111111-1111-4111-8111-111111111111',
          encounter_id: 'e1111111-1111-4111-8111-111111111111',
          version: 1,
          note_status: 'final',
          subjective: 'Patient reports mild fatigue',
          objective: 'BP 120/80',
          assessment: 'Normal checkup',
          plan: 'Followup in 6 months',
          author_staff_id: '61111111-1111-4111-8111-111111111111',
          created_at: '2026-08-20T20:25:00Z'
        }
      ]
    }
  ]
});
assertCheck('mapClinicPatientHistoryResponse: patient_profile mapped with id', historyResult.patient_profile?.id === '71111111-1111-4111-8111-111111111111');
assertCheck('mapClinicPatientHistoryResponse: profile has blood_type', historyResult.patient_profile?.blood_type === 'A Rh+');
assertCheck('mapClinicPatientHistoryResponse: encounters array populated', historyResult.encounters.length === 1);

// B7. clinic_get_patient_profile (bounded profile)
const boundedProfileResult = mapClinicPatientProfileReadResponse({
  success: true,
  customer_id: 'c1111111-1111-4111-8111-111111111111',
  patient_profile: {
    id: '71111111-1111-4111-8111-111111111111',
    date_of_birth: '1990-01-01',
    blood_type: 'O Rh+',
    updated_at: '2026-08-21T08:00:00Z'
  }
});
assertCheck('mapClinicPatientProfileReadResponse: customer_id mapped', boundedProfileResult.customer_id === 'c1111111-1111-4111-8111-111111111111');
assertCheck('mapClinicPatientProfileReadResponse: blood_type mapped', boundedProfileResult.patient_profile?.blood_type === 'O Rh+');

// B8. clinic_get_staff_setup_profiles
const setupProfilesResult = mapClinicStaffSetupProfilesResponse({
  success: true,
  tenant_id: '11111111-1111-4111-8111-111111111111',
  profiles: [
    {
      staff_id: '31111111-1111-4111-8111-111111111111',
      staff_name: 'Dr. Charlie',
      staff_active: true,
      practitioner_type: 'physician',
      specialty: 'Cardiology',
      medical_license_number: '12345',
      can_manage_patient_profiles: true,
      can_view_clinical_records: true,
      can_write_clinical_notes: true,
      clinic_profile_exists: true
    }
  ]
});
assertCheck('mapClinicStaffSetupProfilesResponse: staff_id mapped', setupProfilesResult.profiles[0].staff_id === '31111111-1111-4111-8111-111111111111');

// =====================================================================
// C. Malformed Payload Negative Controls
// =====================================================================
console.log('\n--- C. Malformed Payload Negative Controls ---');

let malformedProfileWriteCaught = false;
try { mapClinicPatientProfileWriteResponse({ profile_id: '71111111-1111-4111-8111-111111111111' }); } catch { malformedProfileWriteCaught = true; }
assertCheck('Malformed profile write response (profile_id instead of patient_profile_id) throws', malformedProfileWriteCaught);

let malformedStaffCaught = false;
try { mapClinicStaffProfileWriteResponse({ tenant_id: 'abc' }); } catch { malformedStaffCaught = true; }
assertCheck('Malformed staff profile response throws', malformedStaffCaught);

let malformedStartCaught = false;
try { mapClinicEncounterStartResponse({ status: 'open' }); } catch { malformedStartCaught = true; }
assertCheck('Malformed start encounter response throws', malformedStartCaught);

let malformedNoteCaught = false;
try { mapClinicEncounterNoteWriteResponse({}); } catch { malformedNoteCaught = true; }
assertCheck('Malformed note write response throws', malformedNoteCaught);

let malformedCompletionCaught = false;
try { mapClinicEncounterCompletionResponse({ appointment_status: 'completed' }); } catch { malformedCompletionCaught = true; }
assertCheck('Malformed completion response throws', malformedCompletionCaught);

// =====================================================================
// D. Non-Supabase Data Mode Typed Helper
// =====================================================================
console.log('\n--- D. Non-Supabase Data Mode Contract Verification ---');
const unavailResult = createClinicUnavailableResult();
assertCheck('createClinicUnavailableResult returns success=false', unavailResult.success === false);
assertCheck('createClinicUnavailableResult returns UNAVAILABLE code', unavailResult.error?.code === 'UNAVAILABLE');
assertCheck('createClinicUnavailableResult returns typed safe message', typeof unavailResult.error?.message === 'string' && unavailResult.error.message.length > 0);

if (failCount > 0) {
  console.error(`\n💥 Clinic Application Contracts Executable QA Failed with ${failCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Clinic Application Contracts Executable QA Passed Successfully! (${passCount} checks passed)\n`);
  process.exit(0);
}
