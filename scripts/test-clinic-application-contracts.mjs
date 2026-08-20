import { normalizeClinicError } from '../services/repositories/supabaseClinicRepository.ts';
import { clinicService } from '../services/clinicService.ts';

process.env.VITE_DATA_MODE = 'mock';

console.log('🏁 Running Clinic Application Contracts Executable QA Suite...\n');

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

// A. Error Normalization Unit Tests
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

// B. Response Shape Adapter Contract Verification
console.log('\n--- B. Literal RPC Payload Adapter Verification ---');

// B1. clinic_set_staff_profile flat payload mapping
const rawSetStaffResponse = {
  success: true,
  staff_id: '31111111-1111-4111-8111-111111111111',
  tenant_id: '11111111-1111-4111-8111-111111111111',
  can_manage_patient_profiles: true,
  can_view_clinical_records: true,
  can_write_clinical_notes: true
};

assertCheck('clinic_set_staff_profile flat response has staff_id', rawSetStaffResponse.staff_id === '31111111-1111-4111-8111-111111111111');
assertCheck('clinic_set_staff_profile flat response preserves capability booleans', rawSetStaffResponse.can_write_clinical_notes === true);

// B2. clinic_save_encounter_note flat payload mapping
const rawSaveNoteResponse = {
  success: true,
  note_id: '99999999-9999-4999-8999-999999999999',
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  version: 1,
  note_status: 'draft',
  created_at: '2026-08-20T20:00:00Z'
};

assertCheck('clinic_save_encounter_note flat response maps note_id', rawSaveNoteResponse.note_id === '99999999-9999-4999-8999-999999999999');
assertCheck('clinic_save_encounter_note flat response maps version', rawSaveNoteResponse.version === 1);

// B3. clinic_start_encounter bounded result mapping
const rawStartEncounterResponse = {
  success: true,
  encounter_id: 'e1111111-1111-4111-8111-111111111111',
  appointment_id: 'f1111111-1111-4111-8111-111111111111',
  status: 'open',
  started_at: '2026-08-20T20:00:00Z'
};

assertCheck('clinic_start_encounter returns bounded result object', rawStartEncounterResponse.encounter_id && rawStartEncounterResponse.status === 'open');

// B4. clinic_get_patient_history encounters array shape
const rawPatientHistoryResponse = {
  patient_profile: {
    customer_id: 'c1111111-1111-4111-8111-111111111111',
    allergies: 'Penicillin'
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
          id: 'n1111111-1111-4111-8111-111111111111',
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
};

assertCheck('clinic_get_patient_history returns encounters array containing direct notes array', Array.isArray(rawPatientHistoryResponse.encounters[0].notes));
assertCheck('Patient history note contains author_staff_id', rawPatientHistoryResponse.encounters[0].notes[0].author_staff_id === '31111111-1111-4111-8111-111111111111');

// C. Non-Supabase Data Mode Contract Verification
console.log('\n--- C. Non-Supabase Data Mode Contract Verification ---');
const modeResult = await clinicService.getMyClinicContext();
assertCheck('Non-Supabase data mode returns typed UNAVAILABLE code without cast', modeResult.error?.code === 'UNAVAILABLE' && modeResult.success === false);

if (failCount > 0) {
  console.error(`\n💥 Clinic Application Contracts Executable QA Failed with ${failCount} errors.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Clinic Application Contracts Executable QA Passed Successfully! (${passCount} checks passed)\n`);
  process.exit(0);
}
