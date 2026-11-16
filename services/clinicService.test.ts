import assert from 'node:assert/strict';
import {
  clinicService,
  createClinicUnavailableResult,
  normalizeClinicError,
  mapClinicEncounterStartResponse,
  mapClinicEncounterNoteWriteResponse,
  mapClinicPatientHistoryResponse,
} from './clinicService.ts';

const SYNTH_TENANT_ID = 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa';
const SYNTH_STAFF_ID = 'bbbb2222-b2b2-42b2-82b2-bbbbbbbbbbbb';
const SYNTH_CUSTOMER_ID = 'cccc3333-c3c3-43c3-83c3-cccccccccccc';
const SYNTH_APPT_ID = 'dddd4444-d4d4-44d4-84d4-dddddddddddd';
const SYNTH_ENCOUNTER_ID = 'eeee5555-e5e5-45e5-85e5-eeeeeeeeeeee';

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function runClinicServiceTests(): Promise<void> {
  // 1. Regulatory EXTERNAL_HOLD & NO_GO classification
  const hold = clinicService.getRegulatoryHoldStatus();
  assert.equal(hold.classification, 'EXTERNAL_HOLD');
  assert.equal(hold.kvkkSpecialCategoryHealthDataApproval, 'EXTERNAL_HOLD');
  assert.equal(hold.medicalDeviceAndAiSoapApproval, 'EXTERNAL_HOLD');
  assert.equal(hold.healthRegulationApproval, 'EXTERNAL_HOLD');
  assert.equal(hold.liveMessagingDispatch, 'EXTERNAL_HOLD');
  assert.equal(hold.productionGoLive, 'NO_GO');

  // 2. Negative: non-Supabase mode fails closed without calling fetcher
  let fetcherCalled = false;
  const neverCalledFetcher = async () => {
    fetcherCalled = true;
    return makeJsonResponse(200, {});
  };

  const localCalls = await Promise.all([
    clinicService.getMyClinicContext({ mode: 'local', fetcher: neverCalledFetcher }),
    clinicService.getClinicPatientProfile(SYNTH_CUSTOMER_ID, { mode: 'local', fetcher: neverCalledFetcher }),
    clinicService.getClinicPatientHistory(SYNTH_CUSTOMER_ID, { mode: 'local', fetcher: neverCalledFetcher }),
    clinicService.upsertClinicPatientProfile(
      { customer_id: SYNTH_CUSTOMER_ID, blood_type: 'A+' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    clinicService.startClinicEncounter(
      { appointment_id: SYNTH_APPT_ID },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    clinicService.saveClinicEncounterNote(
      { encounter_id: SYNTH_ENCOUNTER_ID, subjective: 'Synth', note_status: 'draft' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
  ]);
  for (const res of localCalls) {
    assert.equal(res.success, false);
    assert.equal(res.error?.code, 'UNAVAILABLE');
  }
  assert.equal(fetcherCalled, false);
  assert.equal(createClinicUnavailableResult().error?.code, 'UNAVAILABLE');

  // 3. Negative: error normalization for auth, PHI/cross-tenant, and booking invariants
  assert.equal(normalizeClinicError(401, 'UNAUTHENTICATED').code, 'UNAUTHENTICATED');
  assert.equal(normalizeClinicError(403, 'FORBIDDEN: Staff lacks can_view_clinical_records').code, 'FORBIDDEN');
  assert.equal(normalizeClinicError(400, 'TENANT MISMATCH on customer').code, 'TENANT_MISMATCH');
  assert.equal(normalizeClinicError(400, 'APPOINTMENT_NOT_CONFIRMED').code, 'APPOINTMENT_NOT_CONFIRMED');
  assert.equal(normalizeClinicError(409, 'ALREADY_EXISTS').code, 'ALREADY_EXISTS');
  assert.equal(normalizeClinicError(409, 'ALREADY_CONVERTED').code, 'ALREADY_EXISTS');
  const slotErr = normalizeClinicError(400, 'INVALID_APPOINTMENT_SLOT: resource_unavailable');
  assert.equal(slotErr.code, 'INVALID_STATE');
  assert.equal(slotErr.reason_code, 'resource_unavailable');

  // 4. Negative: malformed PHI/clinical payloads throw instead of synthesizing defaults
  assert.throws(() => mapClinicEncounterStartResponse({}), /missing encounter_id/);
  assert.throws(() => mapClinicEncounterNoteWriteResponse({}), /missing note_id/);
  assert.throws(() => mapClinicPatientHistoryResponse({ customer: {} }), /missing encounters array/);

  // 5. Negative: clinic_get_my_context returns FORBIDDEN when reason_code is not_clinic_staff
  const notStaffRes = await clinicService.getMyClinicContext({
    mode: 'supabase',
    fetcher: async () => makeJsonResponse(200, { success: false, reason_code: 'no_clinic_profile' }),
  });
  assert.equal(notStaffRes.success, false);
  assert.equal(notStaffRes.reason_code, 'no_clinic_profile');
  assert.equal(notStaffRes.error?.code, 'FORBIDDEN');

  // 6. Positive: synthetic clinic context + encounter start + SOAP note + completion + patient history
  const rpcCalls: string[] = [];
  const synthFetcher = async (path: string) => {
    rpcCalls.push(path);
    if (path.endsWith('/clinic_get_my_context')) {
      return makeJsonResponse(200, {
        success: true,
        tenant_id: SYNTH_TENANT_ID,
        staff_id: SYNTH_STAFF_ID,
        staff_name: 'Dr. Sentetik Test',
        practitioner_type: 'physician',
        specialty: 'Dermatoloji',
        can_manage_patient_profiles: true,
        can_view_clinical_records: true,
        can_write_clinical_notes: true,
        permitted_branch_ids: ['11111111-1111-4111-8111-111111111111'],
      });
    }
    if (path.endsWith('/clinic_start_encounter')) {
      return makeJsonResponse(200, {
        encounter_id: SYNTH_ENCOUNTER_ID,
        appointment_id: SYNTH_APPT_ID,
        status: 'open',
        started_at: '2026-11-16T10:00:00Z',
      });
    }
    if (path.endsWith('/clinic_save_encounter_note')) {
      return makeJsonResponse(200, {
        note_id: 'ffff6666-f6f6-46f6-86f6-ffffffffffff',
        encounter_id: SYNTH_ENCOUNTER_ID,
        version: 1,
        note_status: 'final',
        created_at: '2026-11-16T10:05:00Z',
      });
    }
    if (path.endsWith('/clinic_complete_encounter_and_appointment')) {
      return makeJsonResponse(200, {
        encounter_id: SYNTH_ENCOUNTER_ID,
        encounter_status: 'completed',
        appointment_status: 'completed',
        completed_at: '2026-11-16T10:30:00Z',
      });
    }
    if (path.endsWith('/clinic_get_patient_history')) {
      return makeJsonResponse(200, {
        patient_profile: {
          id: '11111111-2222-4333-8444-555555555555',
          date_of_birth: '1992-03-14',
          sex_at_birth: 'female',
          emergency_contact_name: 'Sentetik Yakın',
          emergency_contact_phone: '+905550000002',
          emergency_contact_relationship: 'sibling',
          blood_type: 'A+',
          allergies: 'Yok',
          chronic_conditions: 'Yok',
          updated_at: '2026-11-16T10:00:00Z',
        },
        encounters: [],
      });
    }
    return makeJsonResponse(404, 'NOT_FOUND');
  };

  const ctxRes = await clinicService.getMyClinicContext({ mode: 'supabase', fetcher: synthFetcher });
  assert.equal(ctxRes.success, true);
  assert.equal(ctxRes.data?.can_write_clinical_notes, true);

  const encStart = await clinicService.startClinicEncounter(
    { appointment_id: SYNTH_APPT_ID, reason_for_visit: 'Sentetik kontrol' },
    { mode: 'supabase', fetcher: synthFetcher }
  );
  assert.equal(encStart.success, true);
  assert.equal(encStart.data?.encounter_id, SYNTH_ENCOUNTER_ID);

  const noteSave = await clinicService.saveClinicEncounterNote(
    { encounter_id: SYNTH_ENCOUNTER_ID, subjective: 'Synth S', note_status: 'final' },
    { mode: 'supabase', fetcher: synthFetcher }
  );
  assert.equal(noteSave.success, true);
  assert.equal(noteSave.data?.version, 1);

  const encDone = await clinicService.completeClinicEncounter(
    { encounter_id: SYNTH_ENCOUNTER_ID },
    { mode: 'supabase', fetcher: synthFetcher }
  );
  assert.equal(encDone.success, true);
  assert.equal(encDone.data?.appointment_status, 'completed');

  const histRes = await clinicService.getClinicPatientHistory(SYNTH_CUSTOMER_ID, {
    mode: 'supabase',
    fetcher: synthFetcher,
  });
  assert.equal(histRes.success, true);
  assert.equal(histRes.data?.patient_profile?.blood_type, 'A+');
  assert.equal(histRes.data?.encounters.length, 0);
  assert.equal(rpcCalls.length, 5);

  console.log('[PASS] clinicService tests verified');
}

await runClinicServiceTests();
