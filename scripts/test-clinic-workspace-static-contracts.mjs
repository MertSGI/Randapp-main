import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('=== RUNNING CLINIC WORKSPACE STATIC CONTRACT QA SUITE (BLOCK 3) ===');

const appTsx = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
const clinicWorkspacePage = fs.readFileSync(path.join(process.cwd(), 'pages/clinic/ClinicWorkspacePage.tsx'), 'utf8');
const clinicPatientPanel = fs.readFileSync(path.join(process.cwd(), 'components/clinic/ClinicPatientPanel.tsx'), 'utf8');
const clinicEncounterPanel = fs.readFileSync(path.join(process.cwd(), 'components/clinic/ClinicEncounterPanel.tsx'), 'utf8');
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

// 4. Clinic page calls getMyClinicContext before clinical data loads
assert(
  clinicWorkspacePage.includes('clinicService.getMyClinicContext()'),
  'Static Check 4 Failed: ClinicWorkspacePage must call getMyClinicContext()'
);
console.log('  ✓ Check 4 PASS: ClinicWorkspacePage invokes getMyClinicContext() on mount');

// 5. Patient history call is capability-gated
assert(
  clinicPatientPanel.includes('canLoadClinicPatientHistory'),
  'Static Check 5 Failed: ClinicPatientPanel must gate history calls with canLoadClinicPatientHistory'
);
console.log('  ✓ Check 5 PASS: Patient history call is capability-gated');

// 6. Note UI is write-capability-gated
assert(
  clinicEncounterPanel.includes('canWriteClinicEncounterNote'),
  'Static Check 6 Failed: ClinicEncounterPanel must gate note UI with canWriteClinicEncounterNote'
);
console.log('  ✓ Check 6 PASS: Note UI is write-capability-gated');

// 7. Patient profile editor is manage-profile-capability-gated
assert(
  clinicPatientPanel.includes('canManageClinicPatientProfile'),
  'Static Check 7 Failed: ClinicPatientPanel must gate profile editor with canManageClinicPatientProfile'
);
console.log('  ✓ Check 7 PASS: Patient profile editor is capability-gated');

// 8. Completion calls completeClinicEncounter
assert(
  clinicEncounterPanel.includes('clinicService.completeClinicEncounter'),
  'Static Check 8 Failed: Encounter completion must call completeClinicEncounter'
);
console.log('  ✓ Check 8 PASS: Completion calls completeClinicEncounter');

// 9. No browser localStorage / sessionStorage clinical persistence
const allClinicUiText = clinicWorkspacePage + clinicPatientPanel + clinicEncounterPanel;
assert(!allClinicUiText.includes('localStorage.setItem'), 'Static Check 9.1 Failed: No localStorage allowed in Clinic UI');
assert(!allClinicUiText.includes('sessionStorage.setItem'), 'Static Check 9.2 Failed: No sessionStorage allowed in Clinic UI');
console.log('  ✓ Check 9 PASS: Zero localStorage/sessionStorage clinical persistence');

// 10. Commercial feature count remains 25
const commercialMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260810_h1a_commercial_catalog_and_read_contracts.sql'), 'utf8');
const seedInsertMatch = commercialMigration.match(/INSERT INTO public\.commercial_feature_definitions[\s\S]*?VALUES([\s\S]*?);/);
const seedValuesText = seedInsertMatch ? seedInsertMatch[1] : '';
const actualKeys = [];
const tupleRegex = /\('([a-z0-9_]+)'\s*,/gi;
let m;
while ((m = tupleRegex.exec(seedValuesText)) !== null) {
  actualKeys.push(m[1]);
}
assert.strictEqual(actualKeys.length, 25, `Static Check 10 Failed: Expected 25 commercial features, got ${actualKeys.length}`);
console.log('  ✓ Check 10 PASS: Commercial feature registry count remains 25');

// 11. Canonical roles remain super_admin | tenant_owner | staff
assert(
  userTypes.includes("export type Role = 'super_admin' | 'tenant_owner' | 'staff';") ||
  userTypes.includes("'super_admin' | 'tenant_owner' | 'staff'"),
  'Static Check 11 Failed: Canonical role set must remain super_admin | tenant_owner | staff'
);
console.log('  ✓ Check 11 PASS: Canonical role set unchanged');

// 12. Migration count remains 62
const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
assert.strictEqual(migrationFiles.length, 62, `Static Check 12 Failed: Expected 62 migration files, got ${migrationFiles.length}`);
console.log('  ✓ Check 12 PASS: Migration count remains exactly 62');

console.log('🎉 ALL CLINIC WORKSPACE STATIC CONTRACT CHECKS PASSED (BLOCK 3)!');
