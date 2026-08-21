import assert from 'assert';
import {
  deriveClinicWorkspaceMode,
  canLoadClinicPatientHistory,
  canManageClinicPatientProfile,
  canStartClinicEncounter,
  canWriteClinicEncounterNote,
  canCompleteClinicEncounter
} from '../services/clinicUiPolicy.ts';

console.log('=== RUNNING EXECUTABLE CLINIC WORKSPACE UI POLICY SUITE (BLOCK 3) ===');

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

// 6. receptionist-like context => operational day YES (can enter workspace)
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
const noProfContext = { ...mockStaffContext, can_manage_patient_profiles: false };
const prof13 = canManageClinicPatientProfile(noProfContext);
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

console.log('🎉 ALL 15 EXECUTABLE CLINIC WORKSPACE UI POLICY TESTS PASSED (BLOCK 3)!');
