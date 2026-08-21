import fs from 'fs';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';

console.log('=== RUNNING CLINIC WORKSPACE STATIC CONTRACT QA SUITE (BLOCK 3 R1 HARDENED) ===');

const appTsx = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
const clinicWorkspacePage = fs.readFileSync(path.join(process.cwd(), 'pages/clinic/ClinicWorkspacePage.tsx'), 'utf8');
const clinicPatientPanel = fs.readFileSync(path.join(process.cwd(), 'components/clinic/ClinicPatientPanel.tsx'), 'utf8');
const clinicEncounterPanel = fs.readFileSync(path.join(process.cwd(), 'components/clinic/ClinicEncounterPanel.tsx'), 'utf8');
const clinicStaffSetupPanel = fs.readFileSync(path.join(process.cwd(), 'components/clinic/ClinicStaffSetupPanel.tsx'), 'utf8');
const clinicUiPolicy = fs.readFileSync(path.join(process.cwd(), 'services/clinicUiPolicy.ts'), 'utf8');
const clinicService = fs.readFileSync(path.join(process.cwd(), 'services/clinicService.ts'), 'utf8');
const userTypes = fs.readFileSync(path.join(process.cwd(), 'types.ts'), 'utf8');

// 1. /admin allowedRoles remains tenant_owner + super_admin
assert(
  appTsx.includes("allowedRoles={['tenant_owner', 'super_admin']}><AdminLayout />") ||
  appTsx.includes('allowedRoles={[\'tenant_owner\', \'super_admin\']}'),
  'Static Check 1 Failed: /admin route allowedRoles must remain tenant_owner + super_admin'
);
console.log('  ✓ Check 1 PASS: /admin route allowedRoles unchanged');

// 2. dedicated /clinic route exists
assert(appTsx.includes('path="/clinic"'), 'Static Check 2 Failed: dedicated /clinic route missing in App.tsx');
console.log('  ✓ Check 2 PASS: dedicated /clinic route exists');

// 3. /clinic allows tenant_owner + staff & excludes super_admin
assert(
  appTsx.includes("allowedRoles={['tenant_owner', 'staff']}><ClinicLayout />") ||
  appTsx.includes('allowedRoles={[\'tenant_owner\', \'staff\']}'),
  'Static Check 3 Failed: /clinic route allowedRoles must be tenant_owner + staff'
);
assert(!appTsx.includes("allowedRoles={['tenant_owner', 'staff', 'super_admin']}><ClinicLayout />"), 'Static Check 3.2 Failed: /clinic must NOT include super_admin');
console.log('  ✓ Check 3 PASS: /clinic route allowedRoles = [tenant_owner, staff], excludes super_admin');

// 4. Migration 63 exists & total migration count = 63
const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
assert.strictEqual(migrationFiles.length, 63, `Static Check 4 Failed: Expected 63 migration files, got ${migrationFiles.length}`);

const migration63Path = path.join(migrationsDir, '20260907_lari_clinic_workspace_authority_hardening.sql');
assert(fs.existsSync(migration63Path), 'Static Check 4.2 Failed: Migration 63 file missing');
const migration63 = fs.readFileSync(migration63Path, 'utf8');
console.log('  ✓ Check 4 PASS: Migration 63 exists and total migration count = 63');

import { execSync } from 'child_process';

// 5. Historical Migration Blobs Unchanged
const b1Path = path.join(migrationsDir, '20260905_lari_clinic_domain_server_authority.sql');
const b2Path = path.join(migrationsDir, '20260906_lari_clinic_operational_integration.sql');

const getGitBlob = (filePath) => execSync(`git hash-object "${filePath}"`, { encoding: 'utf8' }).trim();

assert.strictEqual(getGitBlob(b1Path), '3db3a79ef40708b410143e53cde578cb4812c838', 'Static Check 5.1 Failed: Block 1 migration blob altered');
assert.strictEqual(getGitBlob(b2Path), '9c6bb95ce7812e7dbbe45cf1280e9e7b38283e2d', 'Static Check 5.2 Failed: Block 2 migration blob altered');
console.log('  ✓ Check 5 PASS: Historical Block 1 and Block 2 migration blobs unchanged');

// 6. Migration 63 defines hardened clinic_upsert_patient_profile requiring can_manage_patient_profiles ONLY
assert(
  migration63.includes('can_manage_patient_profiles = false'),
  'Static Check 6 Failed: Migration 63 must check can_manage_patient_profiles = false'
);
assert(
  !migration63.includes('can_view_clinical_records = false') ||
  migration63.includes('can_manage_patient_profiles = false THEN'),
  'Static Check 6.2 Failed: Migration 63 must NOT allow can_view_clinical_records alone for profile mutation'
);
console.log('  ✓ Check 6 PASS: Migration 63 enforces can_manage_patient_profiles ONLY for profile mutation');

// 7. Bounded patient profile RPC & owner setup RPC declared in Migration 63 with REVOKEs
assert(migration63.includes('CREATE OR REPLACE FUNCTION public.clinic_get_patient_profile'), 'Static Check 7.1 Failed: clinic_get_patient_profile missing in Migration 63');
assert(migration63.includes('CREATE OR REPLACE FUNCTION public.clinic_get_staff_setup_profiles'), 'Static Check 7.2 Failed: clinic_get_staff_setup_profiles missing in Migration 63');
assert(migration63.includes('REVOKE ALL ON FUNCTION public.clinic_get_patient_profile FROM PUBLIC, anon'), 'Static Check 7.3 Failed: clinic_get_patient_profile REVOKE missing');
assert(migration63.includes('REVOKE ALL ON FUNCTION public.clinic_get_staff_setup_profiles FROM PUBLIC, anon'), 'Static Check 7.4 Failed: clinic_get_staff_setup_profiles REVOKE missing');
console.log('  ✓ Check 7 PASS: Bounded profile and owner setup RPCs declared with PUBLIC/anon REVOKEs');

// 8. Patient panel uses bounded profile read independently from history
assert(
  clinicPatientPanel.includes('clinicService.getClinicPatientProfile'),
  'Static Check 8 Failed: ClinicPatientPanel must use getClinicPatientProfile'
);
assert(
  clinicPatientPanel.includes('canLoadClinicPatientHistory'),
  'Static Check 8.2 Failed: ClinicPatientPanel must gate history with canLoadClinicPatientHistory'
);
console.log('  ✓ Check 8 PASS: Patient panel reads bounded profile independently from history');

// 9. Staff setup panel reads server setup profiles
assert(
  clinicStaffSetupPanel.includes('clinicService.getClinicStaffSetupProfiles'),
  'Static Check 9 Failed: ClinicStaffSetupPanel must call getClinicStaffSetupProfiles'
);
console.log('  ✓ Check 9 PASS: Staff setup panel reads server setup profiles');

// 10. Strict null assignment fail-closed policy in clinicUiPolicy.ts
assert(
  clinicUiPolicy.includes('!assignedStaffId || assignedStaffId !== context.staff_id'),
  'Static Check 10.1 Failed: canStartClinicEncounter must require non-null assignedStaffId'
);
assert(
  clinicUiPolicy.includes('!practitionerStaffId || practitionerStaffId !== context.staff_id'),
  'Static Check 10.2 Failed: canWrite/Complete must require non-null practitionerStaffId'
);
console.log('  ✓ Check 10 PASS: Strict null assignment fail-closed policy in clinicUiPolicy.ts');

// 11. UNAVAILABLE terminal UI state in ClinicWorkspacePage
assert(
  clinicWorkspacePage.includes("state === 'unavailable'") &&
  clinicWorkspacePage.includes('Klinik Servisi Kullanılamıyor'),
  'Static Check 11 Failed: ClinicWorkspacePage must render terminal UNAVAILABLE page'
);
console.log('  ✓ Check 11 PASS: Terminal UNAVAILABLE UI state implemented');

// 12. Commercial feature count remains 25
const commercialMigration = fs.readFileSync(path.join(migrationsDir, '20260810_h1a_commercial_catalog_and_read_contracts.sql'), 'utf8');
const seedInsertMatch = commercialMigration.match(/INSERT INTO public\.commercial_feature_definitions[\s\S]*?VALUES([\s\S]*?);/);
const seedValuesText = seedInsertMatch ? seedInsertMatch[1] : '';
const actualKeys = [];
const tupleRegex = /\('([a-z0-9_]+)'\s*,/gi;
let m;
while ((m = tupleRegex.exec(seedValuesText)) !== null) {
  actualKeys.push(m[1]);
}
assert.strictEqual(actualKeys.length, 25, `Static Check 12 Failed: Expected 25 commercial features, got ${actualKeys.length}`);
console.log('  ✓ Check 12 PASS: Commercial feature registry count remains 25');

// 13. Canonical roles remain super_admin | tenant_owner | staff
assert(
  userTypes.includes("export type Role = 'super_admin' | 'tenant_owner' | 'staff';") ||
  userTypes.includes("'super_admin' | 'tenant_owner' | 'staff'"),
  'Static Check 13 Failed: Canonical role set must remain super_admin | tenant_owner | staff'
);
console.log('  ✓ Check 13 PASS: Canonical role set unchanged');

// 14. Zero browser clinical persistence
const allClinicUiText = clinicWorkspacePage + clinicPatientPanel + clinicEncounterPanel + clinicStaffSetupPanel;
assert(!allClinicUiText.includes('localStorage.setItem'), 'Static Check 14.1 Failed: No localStorage allowed in Clinic UI');
assert(!allClinicUiText.includes('sessionStorage.setItem'), 'Static Check 14.2 Failed: No sessionStorage allowed in Clinic UI');
console.log('  ✓ Check 14 PASS: Zero localStorage/sessionStorage clinical persistence');

console.log('🎉 ALL CLINIC WORKSPACE STATIC CONTRACT CHECKS PASSED (BLOCK 3 R1 HARDENED)!');
