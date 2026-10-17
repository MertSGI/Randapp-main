import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const manifest = read('docs/LARI_PRODUCT_CONVERGENCE_L1_L4_MANIFEST.md');
const evidence = read('docs/LARI_RELEASE_GATE_C1_C4_ACCEPTANCE_EVIDENCE.md');
const ownerCard = read('docs/LARI_RELEASE_GATE_OWNER_OPERATIONS_CARD.md');
const cutover = read('docs/APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md');
const e2ePlan = read('docs/LARI_STAGING_SYNTHETIC_E2E_PLAN.md');
const workflow = read('.github/workflows/lari-product-convergence.yml');
const sqlWrapper = read('scripts/sql/apply-appointment-token-hardening-staging.sql');
const powerShellWrapper = read('scripts/Invoke-LariAppointmentTokenHardening.ps1');
const fixture = read('supabase/tests/fixtures/appointment_access_tokens_security_fixture.sql');
const securityTest = read('supabase/tests/appointment_access_tokens_security.test.mjs');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const migration = fs.readFileSync(
  'supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql',
);

assert.ok(manifest.includes('Status: SOURCE_SCOPE_COMPLETE'));
assert.ok(!manifest.includes('QUALIFICATION_IN_PROGRESS'));
assert.ok(!manifest.includes('pending final commit'));
assert.ok(manifest.includes('b0abd72536d665aaed334c48f69b68e1d8806942'));
assert.ok(manifest.includes('38951741143, 38951741181'));
assert.ok(manifest.includes('dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA'));

assert.equal(packageJson.dependencies['react-router-dom'], '7.18.4');
assert.equal(packageLock.packages['node_modules/react-router-dom'].version, '7.18.4');
assert.equal(packageLock.packages['node_modules/react-router'].version, '7.18.4');
for (const packageName of [
  '@babel/core',
  '@tailwindcss/typography',
  'baseline-browser-mapping',
  'browserslist',
  'nanoid',
  'postcss',
  'postcss-selector-parser',
  'react-router',
  'react-router-dom',
  'source-map-js',
  'vite',
]) {
  assert.ok(evidence.includes('| ' + packageName + ' '), 'Missing dependency classification: ' + packageName);
}

for (const section of [
  '## A. Backup PR 1 merge approval',
  '## B. Environment and secrets readiness',
  '## C. One guarded backup dispatch',
  '## D. External encrypted retention',
  '## E. Actual restore verification',
  '## F. Separate P0 migration approval',
]) {
  assert.ok(ownerCard.includes(section), 'Missing owner operation: ' + section);
}
assert.ok(ownerCard.includes('single-owner Option A'));
assert.ok(ownerCard.includes('BACKUP rwedeejhjazwjthdjzrt'));

const migrationText = migration.toString('utf8');
const canonicalLfMigration = migrationText.replace(/\r\n/g, '\n');
const windowsCrlfMigration = canonicalLfMigration.replace(/\n/g, '\r\n');
const canonicalLfHash = crypto.createHash('sha256').update(canonicalLfMigration, 'utf8').digest('hex').toUpperCase();
const windowsCrlfHash = crypto.createHash('sha256').update(windowsCrlfMigration, 'utf8').digest('hex').toUpperCase();
assert.equal(canonicalLfHash, '260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13');
assert.equal(windowsCrlfHash, '5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970');
assert.ok(cutover.includes('Canonical Git LF SHA-256: 260F727516CFF4CF0754295206A10E56505A9CA9E22AEC099BB7F21099BD5E13'));
assert.ok(cutover.includes('Windows CRLF SHA-256: 5FCE2EEE8D21A29C68D7685A744234EAC779FB7BB4D92B6E59CBCBD109826970'));
assert.ok(cutover.includes('Status: PREPARED_NOT_AUTHORIZED'));
assert.ok(sqlWrapper.includes("SET LOCAL lock_timeout = '5s'"));
assert.ok(sqlWrapper.includes("SET LOCAL statement_timeout = '60s'"));
assert.ok(sqlWrapper.includes('BEGIN;'));
assert.ok(sqlWrapper.includes('COMMIT;'));
assert.ok(sqlWrapper.includes('\\ir ../../supabase/migrations/20261011155623_appointment_access_tokens_table_access_hardening.sql'));
assert.ok(powerShellWrapper.includes('LARI_P0_CONFIRMATION'));
assert.ok(powerShellWrapper.includes('PGSSLMODE'));

assert.ok(fixture.includes('get_public_pending_reschedule_request_by_manage_token'));
assert.ok(securityTest.includes('pending reschedule read'));
assert.ok(securityTest.includes('pendingRescheduleRpc'));

assert.ok(e2ePlan.includes('Status: NOT_EXECUTED'));
assert.ok(e2ePlan.includes('create_public_booking'));
assert.ok(e2ePlan.includes('Cleanup is restricted to the exact UUID allowlist'));
assert.ok(e2ePlan.includes('dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA'));
assert.ok(e2ePlan.includes('rwedeejhjazwjthdjzrt'));

assert.ok(workflow.includes('staging/ci-lari-release-gate-c1-c4-*'));
assert.ok(workflow.includes('npm audit --omit=dev --audit-level=high'));
assert.ok(workflow.includes('qa:release-gate-c1-c4'));
assert.ok(workflow.includes('generate-release-gate-evidence.mjs'));
assert.ok(workflow.includes('needs: [product-journey, token-security-postgres17]'));

console.log('LARI release gate C1-C4 static qualification: PASS');
