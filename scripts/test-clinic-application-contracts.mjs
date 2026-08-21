import {
  normalizeClinicError,
  mapClinicStaffProfileWriteResponse,
  mapClinicEncounterStartResponse,
  mapClinicEncounterNoteWriteResponse,
  mapClinicEncounterCompletionResponse,
  mapClinicPatientHistoryResponse,
  mapClinicOperationalDayResponse
} from '../services/repositories/supabaseClinicRepository.ts';
import { createClinicUnavailableResult } from '../services/clinicService.ts';

console.log('🏁 Running Clinic Application Contracts Executable QA Suite (R2)...\n');

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

// B2. clinic_start_encounter
const startResult = mapClinicEncounterStartResponse({
  success: true,
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  status: 'open',
  started_at: '2026-08-20T20:00:00Z'
});
assertCheck('mapClinicEncounterStartResponse: encounter_id mapped', startResult.encounter_id === 'e1111111-1111-4111-8111-111111111111');
assertCheck('mapClinicEncounterStartResponse: status is open', startResult.status === 'open');

// B3. clinic_save_encounter_note
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

// B4. clinic_complete_encounter_and_appointment
const completionResult = mapClinicEncounterCompletionResponse({
  success: true,
  reason_code: 'ok',
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  encounter_status: 'completed',
  appointment_status: 'completed',
  completed_at: '2026-08-20T20:30:00Z'
});
assertCheck('mapClinicEncounterCompletionResponse: encounter_id mapped', completionResult.encounter_id === 'e1111111-1111-4111-8111-111111111111');
assertCheck('mapClinicEncounterCompletionResponse: encounter_status completed', completionResult.encounter_status === 'completed');
assertCheck('mapClinicEncounterCompletionResponse: appointment_status completed', completionResult.appointment_status === 'completed');

// B5. clinic_get_patient_history — exact server projection WITHOUT tenant_id/customer_id/created_at
const patientHistoryResult = mapClinicPatientHistoryResponse({
  success: true,
  customer_id: 'c1111111-1111-4111-8111-111111111111',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  patient_profile: {
    id: 'aa111111-1111-4111-8111-111111111111',
    date_of_birth: '1985-03-15',
    sex_at_birth: 'male',
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '5551119999',
    emergency_contact_relationship: 'Spouse',
    blood_type: 'A+',
    allergies: 'Penicillin',
    chronic_conditions: 'Hypertension',
    updated_at: '2026-08-20T20:00:00Z'
  },
  encounters: [
    {
      id: 'e1111111-1111-4111-8111-111111111111',
      appointment_id: 'f1111111-1111-4111-8111-111111111111',
      branch_id: 'b1111111-1111-4111-8111-111111111111',
      practitioner_staff_id: '31111111-1111-4111-8111-111111111111',
      status: 'completed',
      reason_for_visit: 'Checkup',
      started_at: '2026-08-20T20:00:00Z',
      completed_at: '2026-08-20T20:30:00Z',
      notes: [
        {
          id: 'dd111111-1111-4111-8111-111111111111',
          version: 1,
          author_staff_id: '31111111-1111-4111-8111-111111111111',
          subjective: 'Chest pain',
          objective: 'Normal EKG',
          assessment: 'Stable',
          plan: 'Discharge',
          note_status: 'final',
          supersedes_note_id: null,
          created_at: '2026-08-20T20:00:00Z'
        }
      ]
    }
  ]
});
assertCheck('mapClinicPatientHistoryResponse: patient_profile mapped with id', patientHistoryResult.patient_profile?.id === 'aa111111-1111-4111-8111-111111111111');
assertCheck('mapClinicPatientHistoryResponse: profile has blood_type', patientHistoryResult.patient_profile?.blood_type === 'A+');
assertCheck('mapClinicPatientHistoryResponse: encounters array populated', patientHistoryResult.encounters.length === 1);
assertCheck('mapClinicPatientHistoryResponse: encounter note uses author_staff_id', patientHistoryResult.encounters[0].notes[0].author_staff_id === '31111111-1111-4111-8111-111111111111');

// B6. clinic_get_operational_day
const opDayResult = mapClinicOperationalDayResponse({
  success: true,
  date: '2026-09-15',
  branch_id: 'b1111111-1111-4111-8111-111111111111',
  appointments: [
    {
      appointment_id: 'f1111111-1111-4111-8111-111111111111',
      appointment_date: '2026-09-15',
      appointment_time: '09:00:00',
      duration_minutes: 45,
      appointment_status: 'confirmed',
      branch_id: 'b1111111-1111-4111-8111-111111111111',
      branch_name: 'Main Branch',
      staff_id: '31111111-1111-4111-8111-111111111111',
      staff_name: 'Dr. Charlie',
      practitioner_type: 'physician',
      specialty: 'Cardiology',
      service_id: 'e1111111-1111-4111-8111-111111111111',
      service_name: 'Consultation',
      customer_id: 'c1111111-1111-4111-8111-111111111111',
      customer_name: 'John Doe',
      customer_phone: '5551112233',
      encounter_id: null,
      encounter_status: null,
      encounter_started_at: null,
      encounter_completed_at: null
    }
  ]
});
assertCheck('mapClinicOperationalDayResponse: date mapped', opDayResult.date === '2026-09-15');
assertCheck('mapClinicOperationalDayResponse: appointments array mapped', opDayResult.appointments.length === 1);
assertCheck('mapClinicOperationalDayResponse: appointment_id mapped', opDayResult.appointments[0].appointment_id === 'f1111111-1111-4111-8111-111111111111');

// =====================================================================
// C. Malformed Payload Negative Controls
// =====================================================================
console.log('\n--- C. Malformed Payload Negative Controls ---');

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

let malformedHistoryCaught = false;
try { mapClinicPatientHistoryResponse({ patient_profile: null }); } catch { malformedHistoryCaught = true; }
assertCheck('Malformed patient history response (no encounters) throws', malformedHistoryCaught);

let malformedOpDayCaught = false;
try { mapClinicOperationalDayResponse({ date: '2026-09-15' }); } catch { malformedOpDayCaught = true; }
assertCheck('Malformed operational day response (no appointments) throws', malformedOpDayCaught);

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
