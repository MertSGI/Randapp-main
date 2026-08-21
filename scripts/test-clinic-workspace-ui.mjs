import assert from 'assert';
import {
  deriveClinicWorkspaceMode,
  resolveClinicContextState,
  deriveClinicStaffSetupSelectionState,
  canLoadClinicPatientHistory,
  canManageClinicPatientProfile,
  canStartClinicEncounter,
  canWriteClinicEncounterNote,
  canCompleteClinicEncounter
} from '../services/clinicUiPolicy.ts';

console.log('=== RUNNING EXECUTABLE CLINIC WORKSPACE UI POLICY SUITE (BLOCK 3 R1.1 HARDENED) ===');

// Fixtures
const mockStaffContext = {
  tenant_id: '11111111-1111-4111-8111-111111111111',
  staff_id: '31111111-1111-4111-8111-111111111111',
  staff_name: 'Dr. Charlie',
  practitioner_type: 'physician',
  specialty: 'Cardiology',
  can_manage_patient_profiles: true,
  can_view_clinical_records: true,
  can_write_clinical_notes: true,
  permitted_branch_ids: ['b1111111-1111-4111-8111-111111111111']
};

const mockReceptionistContext = {
  tenant_id: '11111111-1111-4111-8111-111111111111',
  staff_id: '32222222-2222-4222-8222-222222222222',
  staff_name: 'Receptionist Dave',
  practitioner_type: null,
  specialty: null,
  can_manage_patient_profiles: true,
  can_view_clinical_records: false,
  can_write_clinical_notes: false,
  permitted_branch_ids: ['b1111111-1111-4111-8111-111111111111']
};

const mockViewOnlyContext = {
  tenant_id: '11111111-1111-4111-8111-111111111111',
  staff_id: '33333333-3333-4333-8333-333333333333',
  staff_name: 'Observer Eve',
  practitioner_type: 'other',
  specialty: null,
  can_manage_patient_profiles: false,
  can_view_clinical_records: true,
  can_write_clinical_notes: false,
  permitted_branch_ids: ['b1111111-1111-4111-8111-111111111111']
};

const mockNoCapContext = {
  tenant_id: '11111111-1111-4111-8111-111111111111',
  staff_id: '34444444-4444-4444-8444-444444444444',
  staff_name: 'NoCap Frank',
  practitioner_type: null,
  specialty: null,
  can_manage_patient_profiles: false,
  can_view_clinical_records: false,
  can_write_clinical_notes: false,
  permitted_branch_ids: []
};

// 1. staff + valid Clinic context => workspace
const mode1 = deriveClinicWorkspaceMode('staff', mockStaffContext);
assert.strictEqual(mode1, 'workspace', 'Case 1 Failed: staff + valid context should yield workspace');
console.log('  ✓ Case 1 PASS: staff + valid context => workspace');

// 2. staff + no Clinic context => access_not_configured
const mode2 = deriveClinicWorkspaceMode('staff', null);
assert.strictEqual(mode2, 'access_not_configured', 'Case 2 Failed: staff + no context should yield access_not_configured');
console.log('  ✓ Case 2 PASS: staff + no context => access_not_configured');

// 3. tenant_owner + no Clinic context => setup_only
const mode3 = deriveClinicWorkspaceMode('tenant_owner', null);
assert.strictEqual(mode3, 'setup_only', 'Case 3 Failed: tenant_owner + no context should yield setup_only');
console.log('  ✓ Case 3 PASS: tenant_owner + no context => setup_only');

// 4. tenant_owner + valid Clinic staff context => workspace
const mode4 = deriveClinicWorkspaceMode('tenant_owner', mockStaffContext);
assert.strictEqual(mode4, 'workspace', 'Case 4 Failed: tenant_owner + valid staff context should yield workspace');
console.log('  ✓ Case 4 PASS: tenant_owner + valid staff context => workspace');

// 5. super_admin => denied / unauthorized
const mode5 = deriveClinicWorkspaceMode('super_admin', mockStaffContext);
assert.strictEqual(mode5, 'unauthorized', 'Case 5 Failed: super_admin must yield unauthorized regardless of context');
console.log('  ✓ Case 5 PASS: super_admin => unauthorized');

// 6. receptionist-like context => operational day YES
const mode6 = deriveClinicWorkspaceMode('staff', mockReceptionistContext);
assert.strictEqual(mode6, 'workspace', 'Case 6 Failed: receptionist staff should enter workspace for schedule viewing');
console.log('  ✓ Case 6 PASS: receptionist-like context => operational day YES');

// 7. receptionist-like context => patient history NO
const hist7 = canLoadClinicPatientHistory(mockReceptionistContext);
assert.strictEqual(hist7, false, 'Case 7 Failed: receptionist must NOT load patient history');
console.log('  ✓ Case 7 PASS: receptionist-like context => patient history NO');

// 8. receptionist-like context => note write NO
const note8 = canWriteClinicEncounterNote(mockReceptionistContext, 'open', mockReceptionistContext.staff_id);
assert.strictEqual(note8, false, 'Case 8 Failed: receptionist must NOT write notes');
console.log('  ✓ Case 8 PASS: receptionist-like context => note write NO');

// 9. practitioner view/write context => history YES, start YES, note write YES, completion YES
const hist9 = canLoadClinicPatientHistory(mockStaffContext);
const start9 = canStartClinicEncounter(mockStaffContext, 'confirmed', mockStaffContext.staff_id, null);
const note9 = canWriteClinicEncounterNote(mockStaffContext, 'open', mockStaffContext.staff_id);
const comp9 = canCompleteClinicEncounter(mockStaffContext, 'open', mockStaffContext.staff_id);

assert.strictEqual(hist9, true, 'Case 9.1 Failed: practitioner should load history');
assert.strictEqual(start9, true, 'Case 9.2 Failed: practitioner should start encounter for confirmed assigned appt');
assert.strictEqual(note9, true, 'Case 9.3 Failed: practitioner should write notes for open encounter');
assert.strictEqual(comp9, true, 'Case 9.4 Failed: practitioner should complete open encounter');
console.log('  ✓ Case 9 PASS: practitioner view/write capabilities verified');

// 10. confirmed false => start disabled
const start10 = canStartClinicEncounter(mockStaffContext, 'pending', mockStaffContext.staff_id, null);
assert.strictEqual(start10, false, 'Case 10 Failed: unconfirmed appointment start must be disabled');
console.log('  ✓ Case 10 PASS: confirmed false => start disabled');

// 11. assignment mismatch => start/completion disabled
const start11 = canStartClinicEncounter(mockStaffContext, 'confirmed', 'other_staff_999', null);
const comp11 = canCompleteClinicEncounter(mockStaffContext, 'open', 'other_staff_999');
assert.strictEqual(start11, false, 'Case 11.1 Failed: assignment mismatch must disable start');
assert.strictEqual(comp11, false, 'Case 11.2 Failed: assignment mismatch must disable completion');
console.log('  ✓ Case 11 PASS: assignment mismatch => start/completion disabled');

// 12. no write capability => note/complete disabled
const note12 = canWriteClinicEncounterNote(mockReceptionistContext, 'open', mockReceptionistContext.staff_id);
const comp12 = canCompleteClinicEncounter(mockReceptionistContext, 'open', mockReceptionistContext.staff_id);
assert.strictEqual(note12, false, 'Case 12.1 Failed: no write capability must disable note write');
assert.strictEqual(comp12, false, 'Case 12.2 Failed: no write capability must disable completion');
console.log('  ✓ Case 12 PASS: no write capability => note/complete disabled');

// 13. no patient-profile capability => patient profile edit disabled
const prof13 = canManageClinicPatientProfile(mockNoCapContext);
assert.strictEqual(prof13, false, 'Case 13 Failed: no manage profile capability must disable profile edit');
console.log('  ✓ Case 13 PASS: no patient-profile capability => patient profile edit disabled');

// 14. UI policy cannot grant clinical access solely from tenant_owner role
const hist14 = canLoadClinicPatientHistory(null);
assert.strictEqual(hist14, false, 'Case 14 Failed: tenant_owner role without staff context cannot load clinical history');
console.log('  ✓ Case 14 PASS: UI policy cannot grant clinical access solely from tenant_owner role');

// 15. UI policy cannot grant any Clinic surface to super_admin
const mode15 = deriveClinicWorkspaceMode('super_admin', mockStaffContext);
assert.strictEqual(mode15, 'unauthorized', 'Case 15 Failed: UI policy cannot grant any Clinic surface to super_admin');
console.log('  ✓ Case 15 PASS: UI policy cannot grant any Clinic surface to super_admin');

// 16. assignedStaffId = null => Start false (Defect A Fail Closed)
const start16 = canStartClinicEncounter(mockStaffContext, 'confirmed', null, null);
assert.strictEqual(start16, false, 'Case 16 Failed: null assignedStaffId MUST return false for Start Encounter');
console.log('  ✓ Case 16 PASS: assignedStaffId = null => Start false (Fail Closed)');

// 17. assignedStaffId = null => note write false
const note17 = canWriteClinicEncounterNote(mockStaffContext, 'open', null);
assert.strictEqual(note17, false, 'Case 17 Failed: null practitionerStaffId MUST return false for note write');
console.log('  ✓ Case 17 PASS: practitionerStaffId = null => note write false');

// 18. assignedStaffId = null => completion false
const comp18 = canCompleteClinicEncounter(mockStaffContext, 'open', null);
assert.strictEqual(comp18, false, 'Case 18 Failed: null practitionerStaffId MUST return false for completion');
console.log('  ✓ Case 18 PASS: practitionerStaffId = null => completion false');

// 19. existing encounter_id + confirmed appointment => Start false regardless lifecycle state
const start19a = canStartClinicEncounter(mockStaffContext, 'confirmed', mockStaffContext.staff_id, 'enc_open_111');
const start19b = canStartClinicEncounter(mockStaffContext, 'confirmed', mockStaffContext.staff_id, 'enc_completed_222');
assert.strictEqual(start19a, false, 'Case 19.1 Failed: existing open encounter MUST disable start');
assert.strictEqual(start19b, false, 'Case 19.2 Failed: existing completed encounter MUST disable start');
console.log('  ✓ Case 19 PASS: existing encounter_id (open or completed) => Start false');

// 20. encounterStatus = null => note false
const note20 = canWriteClinicEncounterNote(mockStaffContext, null, mockStaffContext.staff_id);
assert.strictEqual(note20, false, 'Case 20 Failed: null encounterStatus MUST return false for note write');
console.log('  ✓ Case 20 PASS: encounterStatus = null => note false');

// 21. exact assigned practitioner + open => note/complete true
const note21 = canWriteClinicEncounterNote(mockStaffContext, 'open', mockStaffContext.staff_id);
const comp21 = canCompleteClinicEncounter(mockStaffContext, 'open', mockStaffContext.staff_id);
assert.strictEqual(note21, true, 'Case 21.1 Failed: exact assigned practitioner + open must allow note write');
assert.strictEqual(comp21, true, 'Case 21.2 Failed: exact assigned practitioner + open must allow completion');
console.log('  ✓ Case 21 PASS: exact assigned practitioner + open => note/complete true');

// 22. UNAVAILABLE + tenant_owner => unavailable, NOT setup_only
const state22 = resolveClinicContextState('tenant_owner', {
  success: false,
  error: { code: 'UNAVAILABLE', message: 'Backend unavailable' }
});
assert.strictEqual(state22, 'unavailable', 'Case 22 Failed: UNAVAILABLE + tenant_owner MUST resolve to unavailable, not setup_only');
console.log('  ✓ Case 22 PASS: UNAVAILABLE + tenant_owner => unavailable (NOT setup_only)');

// 23. UNAVAILABLE + staff => unavailable, NOT access_not_configured
const state23 = resolveClinicContextState('staff', {
  success: false,
  error: { code: 'UNAVAILABLE', message: 'Backend unavailable' }
});
assert.strictEqual(state23, 'unavailable', 'Case 23 Failed: UNAVAILABLE + staff MUST resolve to unavailable, not access_not_configured');
console.log('  ✓ Case 23 PASS: UNAVAILABLE + staff => unavailable (NOT access_not_configured)');

// 24. unknown FORBIDDEN => forbidden, NOT setup_only
const state24 = resolveClinicContextState('tenant_owner', {
  success: false,
  error: { code: 'FORBIDDEN', message: 'Unknown forbidden error' }
});
assert.strictEqual(state24, 'forbidden', 'Case 24 Failed: FORBIDDEN error MUST resolve to forbidden, not setup_only');
console.log('  ✓ Case 24 PASS: unknown FORBIDDEN => forbidden (NOT setup_only)');

// 25. manage-only receptionist => bounded profile read allowed, history denied, profile edit allowed
const loadHist25 = canLoadClinicPatientHistory(mockReceptionistContext);
const manageProf25 = canManageClinicPatientProfile(mockReceptionistContext);
assert.strictEqual(loadHist25, false, 'Case 25.1 Failed: Receptionist history MUST be false');
assert.strictEqual(manageProf25, true, 'Case 25.2 Failed: Receptionist manage profile MUST be true');
console.log('  ✓ Case 25 PASS: manage-only receptionist => profile manage YES, history NO');

// 26. view-only staff => bounded profile read allowed, history allowed, profile edit denied
const loadHist26 = canLoadClinicPatientHistory(mockViewOnlyContext);
const manageProf26 = canManageClinicPatientProfile(mockViewOnlyContext);
assert.strictEqual(loadHist26, true, 'Case 26.1 Failed: View-only history MUST be true');
assert.strictEqual(manageProf26, false, 'Case 26.2 Failed: View-only manage profile MUST be false');
console.log('  ✓ Case 26 PASS: view-only staff => history YES, profile edit NO');

// 27. no manage / no view => no bounded profile read, no history, no edit
const loadHist27 = canLoadClinicPatientHistory(mockNoCapContext);
const manageProf27 = canManageClinicPatientProfile(mockNoCapContext);
assert.strictEqual(loadHist27, false, 'Case 27.1 Failed: No-cap history MUST be false');
assert.strictEqual(manageProf27, false, 'Case 27.2 Failed: No-cap manage profile MUST be false');
console.log('  ✓ Case 27 PASS: no manage / no view => history NO, profile edit NO');

// 28. deriveClinicStaffSetupSelectionState: setup_read_failed MUST return setup_read_failed (fail closed)
const setupState28 = deriveClinicStaffSetupSelectionState('staff_1', false, null);
assert.strictEqual(setupState28, 'setup_read_failed', 'Case 28 Failed: setup read failure MUST fail closed');
console.log('  ✓ Case 28 PASS: deriveClinicStaffSetupSelectionState setup read failure => setup_read_failed (fail closed)');

// 29. deriveClinicStaffSetupSelectionState: staff missing from result => staff_missing_from_authority_result
const setupState29 = deriveClinicStaffSetupSelectionState('staff_99', true, { staff_1: { staff_id: 'staff_1', staff_name: 'Dr A', staff_active: true, practitioner_type: 'physician', specialty: '', medical_license_number: '', can_manage_patient_profiles: true, can_view_clinical_records: true, can_write_clinical_notes: true, clinic_profile_exists: true } });
assert.strictEqual(setupState29, 'staff_missing_from_authority_result', 'Case 29 Failed: staff missing from setup map MUST fail closed');
console.log('  ✓ Case 29 PASS: deriveClinicStaffSetupSelectionState staff missing => staff_missing_from_authority_result');

console.log('🎉 ALL 29 EXECUTABLE CLINIC WORKSPACE UI POLICY TESTS PASSED (BLOCK 3 R1.1 HARDENED)!');
