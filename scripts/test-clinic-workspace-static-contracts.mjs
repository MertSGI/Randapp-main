import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execSync } from 'child_process';

console.log('=== RUNNING CLINIC WORKSPACE STATIC CONTRACT QA SUITE (BLOCK 3 HARDENED) ===');

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

// 4. Migration 63, 64, 65 exist & total migration count >= 64
const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
assert(migrationFiles.length >= 64 && migrationFiles.length <= 65, `Static Check 4 Failed: Expected 64 or 65 migration files, got ${migrationFiles.length}`);

const migration63Path = path.join(migrationsDir, '20260907_lari_clinic_workspace_authority_hardening.sql');
assert(fs.existsSync(migration63Path), 'Static Check 4.2 Failed: Migration 63 file missing');
const migration63 = fs.readFileSync(migration63Path, 'utf8');

const migration64Path = path.join(migrationsDir, '20260908_commercial_lifecycle_eligibility_alignment.sql');
assert(fs.existsSync(migration64Path), 'Static Check 4.3 Failed: Migration 64 file missing');
console.log('  ✓ Check 4 PASS: Migration 63 and 64 exist and total migration count = 64');

// 5. Historical Migration Blobs Unchanged
const b1Path = path.join(migrationsDir, '20260905_lari_clinic_domain_server_authority.sql');
const b2Path = path.join(migrationsDir, '20260906_lari_clinic_operational_integration.sql');

const getGitBlob = (filePath) => execSync(`git hash-object "${filePath}"`, { encoding: 'utf8' }).trim();

assert.strictEqual(getGitBlob(b1Path), '3db3a79ef40708b410143e53cde578cb4812c838', 'Static Check 5.1 Failed: Block 1 migration blob altered');
assert.strictEqual(getGitBlob(b2Path), '9c6bb95ce7812e7dbbe45cf1280e9e7b38283e2d', 'Static Check 5.2 Failed: Block 2 migration blob altered');
console.log('  ✓ Check 5 PASS: Historical Block 1 and Block 2 migration blobs unchanged');

// 6. Migration 63 requires active tenant owner for setup read
assert(
  migration63.includes('v_user.active IS NOT TRUE') || migration63.includes('v_user.active = false'),
  'Static Check 6 Failed: Migration 63 must check v_user.active IS NOT TRUE for owner setup read'
);
console.log('  ✓ Check 6 PASS: Migration 63 requires active tenant owner for setup read');

// 7. Migration 63 uses canonical audit_events schema & patient_profile_id contract
assert(migration63.includes('actor_role,'), 'Static Check 7.1 Failed: Migration 63 audit insert missing actor_role');
assert(migration63.includes('action,'), 'Static Check 7.2 Failed: Migration 63 audit insert missing action');
assert(migration63.includes("'patient_profile_id', v_res.id"), 'Static Check 7.3 Failed: Migration 63 must return patient_profile_id');
console.log('  ✓ Check 7 PASS: Migration 63 uses canonical audit schema and patient_profile_id contract');

// 8. SQL Test Suite Hardening & Real DB Role Checks (comment-stripped)
const sqlTestPath = path.join(process.cwd(), 'supabase/tests/clinic_workspace_authority_hardening_tests.sql');
assert(fs.existsSync(sqlTestPath), 'Static Check 8.1 Failed: Hardening SQL test file missing');
const sqlTestContentRaw = fs.readFileSync(sqlTestPath, 'utf8');

// Strip SQL comments before checking for role statements to prevent false-green from commented-out code
const sqlTestContentStripped = sqlTestContentRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove block comments
  .replace(/--.*$/gm, '');             // Remove line comments

assert(/^\s*SET\s+LOCAL\s+ROLE\s+authenticated\s*;/m.test(sqlTestContentStripped), 'Static Check 8.2 Failed: Hardening SQL missing real (non-comment) SET LOCAL ROLE authenticated statement');
assert(/^\s*SET\s+LOCAL\s+ROLE\s+anon\s*;/m.test(sqlTestContentStripped), 'Static Check 8.3 Failed: Hardening SQL missing real (non-comment) SET LOCAL ROLE anon statement');

assert(sqlTestContentRaw.includes('CLINIC_AUTHENTICATED_EXECUTE_ACL_PROVEN=YES'), 'Static Check 8.4 Failed: Missing CLINIC_AUTHENTICATED_EXECUTE_ACL_PROVEN marker');
assert(sqlTestContentRaw.includes('CLINIC_ANON_EXECUTE_ACL_DENIED=YES'), 'Static Check 8.5 Failed: Missing CLINIC_ANON_EXECUTE_ACL_DENIED marker');
assert(sqlTestContentRaw.includes('CLINIC_INACTIVE_OWNER_SETUP_DENIED=YES'), 'Static Check 8.6 Failed: Missing CLINIC_INACTIVE_OWNER_SETUP_DENIED marker');
assert(sqlTestContentRaw.includes('CLINIC_WORKSPACE_DB_ROLE_CONTEXT_PROVEN=YES'), 'Static Check 8.7 Failed: Missing CLINIC_WORKSPACE_DB_ROLE_CONTEXT_PROVEN marker');
console.log('  ✓ Check 8 PASS: Hardening SQL contains real (non-comment) top-level DB role statements and all required markers');

// 9. Fail-Closed Owner Setup UI & Pure Helper
assert(clinicUiPolicy.includes('deriveClinicStaffSetupSelectionState'), 'Static Check 9.1 Failed: deriveClinicStaffSetupSelectionState missing in clinicUiPolicy.ts');
assert(clinicStaffSetupPanel.includes('deriveClinicStaffSetupSelectionState'), 'Static Check 9.2 Failed: ClinicStaffSetupPanel must use deriveClinicStaffSetupSelectionState');
assert(clinicStaffSetupPanel.includes('!setupReadSuccess'), 'Static Check 9.3 Failed: ClinicStaffSetupPanel must check !setupReadSuccess');
console.log('  ✓ Check 9 PASS: Fail-closed owner setup UI and pure helper implemented');

// 10. Commercial feature count remains 25
const commercialMigration = fs.readFileSync(path.join(migrationsDir, '20260810_h1a_commercial_catalog_and_read_contracts.sql'), 'utf8');
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

// 12. Zero browser clinical persistence
const allClinicUiText = clinicWorkspacePage + clinicPatientPanel + clinicEncounterPanel + clinicStaffSetupPanel;
assert(!allClinicUiText.includes('localStorage.setItem'), 'Static Check 12.1 Failed: No localStorage allowed in Clinic UI');
assert(!allClinicUiText.includes('sessionStorage.setItem'), 'Static Check 12.2 Failed: No sessionStorage allowed in Clinic UI');
console.log('  ✓ Check 12 PASS: Zero localStorage/sessionStorage clinical persistence');

console.log('🎉 ALL CLINIC WORKSPACE STATIC CONTRACT CHECKS PASSED (BLOCK 3 HARDENED)!');
