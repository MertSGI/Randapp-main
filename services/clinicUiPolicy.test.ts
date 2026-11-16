import assert from 'node:assert/strict';
import {
  resolveClinicContextState,
  deriveClinicWorkspaceMode,
  deriveClinicStaffSetupSelectionState,
  canLoadClinicPatientHistory,
  canManageClinicPatientProfile,
  canStartClinicEncounter,
  canWriteClinicEncounterNote,
  canCompleteClinicEncounter,
  canUseClinicAiAssist,
} from './clinicUiPolicy.ts';
import type { ClinicStaffContext, ClinicStaffSetupProfile } from '../types/clinic.ts';

const PRACTITIONER_CTX: ClinicStaffContext = {
  tenant_id: 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa',
  staff_id: 'bbbb2222-b2b2-42b2-82b2-bbbbbbbbbbbb',
  staff_name: 'Dr. Sentetik',
  practitioner_type: 'physician',
  specialty: 'Dermatoloji',
  can_manage_patient_profiles: true,
  can_view_clinical_records: true,
  can_write_clinical_notes: true,
  permitted_branch_ids: ['cccc3333-c3c3-43c3-83c3-cccccccccccc'],
};

const OTHER_STAFF_ID = 'dddd4444-d4d4-44d4-84d4-dddddddddddd';

export async function runClinicUiPolicyTests(): Promise<void> {
  // 1. Fail-closed context resolution across roles & non-Supabase modes
  assert.equal(resolveClinicContextState('staff', null), 'loading');
  assert.equal(
    resolveClinicContextState('tenant_owner', { success: false, error: { code: 'UNAVAILABLE', message: 'local' } }),
    'unavailable'
  );
  assert.equal(
    resolveClinicContextState('staff', { success: false, error: { code: 'UNAUTHENTICATED', message: 'no auth' } }),
    'unauthenticated'
  );
  assert.equal(
    resolveClinicContextState('tenant_owner', {
      success: false,
      reason_code: 'no_clinic_profile',
      error: { code: 'FORBIDDEN', message: 'setup' },
    }),
    'setup_only'
  );
  assert.equal(
    resolveClinicContextState('staff', {
      success: false,
      reason_code: 'no_clinic_profile',
      error: { code: 'FORBIDDEN', message: 'not configured' },
    }),
    'not_configured'
  );
  // Super admin must NEVER access clinical PHI workspace even if context has a staff_id
  assert.equal(resolveClinicContextState('super_admin', { success: true, data: PRACTITIONER_CTX }), 'forbidden');
  assert.equal(deriveClinicWorkspaceMode('super_admin', PRACTITIONER_CTX), 'unauthorized');

  // 2. Staff setup selection fails closed on read failures or missing staff
  const profilesMap: Record<string, ClinicStaffSetupProfile> = {
    [PRACTITIONER_CTX.staff_id]: {
      staff_id: PRACTITIONER_CTX.staff_id,
      staff_name: 'Dr. Sentetik',
      staff_active: true,
      clinic_profile_exists: true,
      practitioner_type: 'physician',
      specialty: 'Dermatoloji',
      medical_license_number: 'SYNTH-01',
      can_manage_patient_profiles: true,
      can_view_clinical_records: true,
      can_write_clinical_notes: true,
    },
    [OTHER_STAFF_ID]: {
      staff_id: OTHER_STAFF_ID,
      staff_name: 'Yeni Personel',
      staff_active: true,
      clinic_profile_exists: false,
      practitioner_type: null,
      specialty: null,
      medical_license_number: null,
      can_manage_patient_profiles: false,
      can_view_clinical_records: false,
      can_write_clinical_notes: false,
    },
  };
  assert.equal(deriveClinicStaffSetupSelectionState(PRACTITIONER_CTX.staff_id, false, profilesMap), 'setup_read_failed');
  assert.equal(deriveClinicStaffSetupSelectionState(PRACTITIONER_CTX.staff_id, true, null), 'setup_read_failed');
  assert.equal(deriveClinicStaffSetupSelectionState('missing-staff', true, profilesMap), 'staff_missing_from_authority_result');
  assert.equal(deriveClinicStaffSetupSelectionState(PRACTITIONER_CTX.staff_id, true, profilesMap), 'existing_profile');
  assert.equal(deriveClinicStaffSetupSelectionState(OTHER_STAFF_ID, true, profilesMap), 'confirmed_unconfigured');

  // 3. PHI & clinical encounter permission gates
  const readOnlyCtx: ClinicStaffContext = {
    ...PRACTITIONER_CTX,
    can_manage_patient_profiles: false,
    can_view_clinical_records: false,
    can_write_clinical_notes: false,
  };
  assert.equal(canLoadClinicPatientHistory(null), false);
  assert.equal(canLoadClinicPatientHistory(readOnlyCtx), false);
  assert.equal(canLoadClinicPatientHistory(PRACTITIONER_CTX), true);
  assert.equal(canManageClinicPatientProfile(readOnlyCtx), false);
  assert.equal(canManageClinicPatientProfile(PRACTITIONER_CTX), true);

  // Encounter start: requires confirmed + matching assignedStaffId + no existing encounter + write perm
  assert.equal(canStartClinicEncounter(PRACTITIONER_CTX, 'pending', PRACTITIONER_CTX.staff_id, null), false);
  assert.equal(canStartClinicEncounter(PRACTITIONER_CTX, 'confirmed', OTHER_STAFF_ID, null), false);
  assert.equal(canStartClinicEncounter(PRACTITIONER_CTX, 'confirmed', PRACTITIONER_CTX.staff_id, 'enc-1'), false);
  assert.equal(canStartClinicEncounter(readOnlyCtx, 'confirmed', PRACTITIONER_CTX.staff_id, null), false);
  assert.equal(canStartClinicEncounter(PRACTITIONER_CTX, 'confirmed', PRACTITIONER_CTX.staff_id, null), true);

  // Note writing / completion / AI assist: requires open encounter + matching practitioner + write perm
  assert.equal(canWriteClinicEncounterNote(PRACTITIONER_CTX, 'completed', PRACTITIONER_CTX.staff_id), false);
  assert.equal(canWriteClinicEncounterNote(PRACTITIONER_CTX, 'open', OTHER_STAFF_ID), false);
  assert.equal(canWriteClinicEncounterNote(readOnlyCtx, 'open', PRACTITIONER_CTX.staff_id), false);
  assert.equal(canWriteClinicEncounterNote(PRACTITIONER_CTX, 'open', PRACTITIONER_CTX.staff_id), true);

  assert.equal(canCompleteClinicEncounter(PRACTITIONER_CTX, 'completed', PRACTITIONER_CTX.staff_id), false);
  assert.equal(canCompleteClinicEncounter(PRACTITIONER_CTX, 'open', PRACTITIONER_CTX.staff_id), true);
  assert.equal(canUseClinicAiAssist(PRACTITIONER_CTX, 'open', OTHER_STAFF_ID), false);
  assert.equal(canUseClinicAiAssist(PRACTITIONER_CTX, 'open', PRACTITIONER_CTX.staff_id), true);

  console.log('[PASS] clinicUiPolicy tests verified');
}

await runClinicUiPolicyTests();
