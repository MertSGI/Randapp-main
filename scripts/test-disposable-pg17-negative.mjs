import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

console.log('='.repeat(72));
console.log('LARI — DISPOSABLE PG 17.6 NEGATIVE SECURITY & FAIL-CLOSED TEST SUITE');
console.log('='.repeat(72));

const targetScript = 'scripts/verify-disposable-pg17-role-restore.mjs';

const endpoint = process.platform === 'win32'
  ? 'npipe:////./pipe/docker_engine'
  : 'unix:///var/run/docker.sock';

const dockerBin = process.env.LARI_DOCKER_BIN || 'docker';
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_HOST;
delete dockerEnv.DOCKER_CONTEXT;
delete dockerEnv.DOCKER_TLS_VERIFY;
delete dockerEnv.DOCKER_CERT_PATH;

const dockerCmd = (args, options = {}) => spawnSync(dockerBin, ['-H', endpoint, ...args], {
  encoding: 'utf8',
  ...options,
  env: dockerEnv,
});

const runTargetWithEnv = (envOverrides = {}) => {
  return spawnSync(process.execPath, [targetScript], {
    cwd: process.cwd(),
    env: { ...process.env, ...envOverrides },
    encoding: 'utf8',
  });
};

// ---------------------------------------------------------------------------
// Negative Test 1: Docker Unavailable Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 1: Docker Unavailable ---');
const test1Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_DOCKER_BIN: 'nonexistent-docker-binary-xyz',
});
assert.notEqual(test1Res.status, 0, 'Must exit nonzero when Docker is unavailable');
assert.ok(
  (test1Res.stderr + test1Res.stdout).includes('Docker is not available'),
  'Must state Docker is not available'
);
assert.ok(!test1Res.stdout.includes('[QUALIFICATION REPORT]'), 'Must not emit qualification report');
console.log('PASS: Class 1 — Missing Docker fails closed.\n');

// ---------------------------------------------------------------------------
// Negative Test 2: Unapproved Docker Endpoint & Context Rejection
// ---------------------------------------------------------------------------
console.log('--- Negative Test 2: Unapproved Docker Endpoint & Context Rejection ---');
const altSocket = process.platform === 'win32'
  ? 'npipe:////./pipe/custom_docker'
  : 'unix:///tmp/custom-docker.sock';

const test2AltSockRes = runTargetWithEnv({ DOCKER_HOST: altSocket });
assert.notEqual(test2AltSockRes.status, 0, 'Must exit nonzero on alternative socket path');
assert.ok(
  (test2AltSockRes.stderr + test2AltSockRes.stdout).includes('UNAPPROVED_DOCKER_ENDPOINT'),
  'Must reject alternative socket with UNAPPROVED_DOCKER_ENDPOINT'
);

const test2TcpRes = runTargetWithEnv({ DOCKER_HOST: 'tcp://127.0.0.1:2375' });
assert.notEqual(test2TcpRes.status, 0, 'Must exit nonzero on TCP endpoint');
assert.ok(
  (test2TcpRes.stderr + test2TcpRes.stdout).includes('UNAPPROVED_DOCKER_ENDPOINT'),
  'Must reject TCP endpoint with UNAPPROVED_DOCKER_ENDPOINT'
);

const test2SshRes = runTargetWithEnv({ DOCKER_HOST: 'ssh://operator@remote.server' });
assert.notEqual(test2SshRes.status, 0, 'Must exit nonzero on SSH endpoint');
assert.ok(
  (test2SshRes.stderr + test2SshRes.stdout).includes('UNAPPROVED_DOCKER_ENDPOINT'),
  'Must reject SSH endpoint with UNAPPROVED_DOCKER_ENDPOINT'
);

const test2ContextRes = runTargetWithEnv({ DOCKER_CONTEXT: 'remote-engine' });
assert.notEqual(test2ContextRes.status, 0, 'Must exit nonzero on non-default Docker context');
assert.ok(
  (test2ContextRes.stderr + test2ContextRes.stdout).includes('UNAPPROVED_DOCKER_CONTEXT'),
  'Must reject non-default context with UNAPPROVED_DOCKER_CONTEXT'
);
console.log('PASS: Class 2 — Pinned endpoint enforced; alternative sockets, TCP, SSH, and remote contexts rejected.\n');

// ---------------------------------------------------------------------------
// Independent Docker Verification Before Tests 3-6
// ---------------------------------------------------------------------------
console.log('--- Independent Docker Probe Before Negative Tests 3–6 ---');
const dockerProbe = dockerCmd(['info', '--format', '{{.OperatingSystem}}'], { timeout: 10000 });
if (dockerProbe.error || dockerProbe.status !== 0) {
  console.error('FATAL: Real Docker daemon is not available on pinned endpoint.');
  console.error(`Details: ${dockerProbe.error?.message || dockerProbe.stderr}`);
  console.error('Cannot proceed with negative tests 3-6: missing Docker must not cause false PASS.');
  process.exit(1);
}
console.log(`Docker daemon independently verified on ${endpoint} (${dockerProbe.stdout.trim()}). Proceeding with tests 3–6.\n`);

// ---------------------------------------------------------------------------
// Negative Test 3: Container Nonce Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 3: Nonce Mismatch Rejection ---');
const test3Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_NONCE_MISMATCH: '1',
});
assert.notEqual(test3Res.status, 0, 'Must exit nonzero on nonce mismatch');
assert.ok(
  (test3Res.stderr + test3Res.stdout).includes('Nonce mismatch'),
  `Must output exact nonce-mismatch rejection, got: ${test3Res.stderr}`
);
assert.ok(
  !test3Res.stdout.includes('Pre-flight container & database verification: PASS'),
  'Must NOT emit preflight PASS on nonce mismatch'
);
assert.ok(!test3Res.stdout.includes('[QUALIFICATION REPORT]'), 'Must NOT emit qualification report on nonce mismatch');
assert.ok(test3Res.stdout.includes('CLEANUP_VERIFIED'), 'Must perform verified cleanup of test container');
console.log('PASS: Class 3 — Nonce mismatch rejected with no preflight PASS and verified cleanup.\n');

// ---------------------------------------------------------------------------
// Negative Test 4: PostgreSQL Version Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 4: PostgreSQL Version Mismatch ---');
const test4Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_VERSION_MISMATCH: '1',
});
assert.notEqual(test4Res.status, 0, 'Must exit nonzero on version mismatch');
assert.ok(
  (test4Res.stderr + test4Res.stdout).includes('PostgreSQL version rejection') &&
  (test4Res.stderr + test4Res.stdout).includes('170006'),
  `Must output exact version rejection, got: ${test4Res.stderr}`
);
assert.ok(
  !test4Res.stdout.includes('Pre-flight container & database verification: PASS'),
  'Must NOT emit preflight PASS on version mismatch'
);
assert.ok(!test4Res.stdout.includes('[QUALIFICATION REPORT]'), 'Must NOT emit qualification report on version mismatch');
assert.ok(test4Res.stdout.includes('CLEANUP_VERIFIED'), 'Must perform verified cleanup of test container');
console.log('PASS: Class 4 — PostgreSQL version mismatch rejected with no preflight PASS and verified cleanup.\n');

// ---------------------------------------------------------------------------
// Negative Test 5: Role Catalog Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 5: Role Catalog Mismatch ---');
const test5Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_CATALOG_MISMATCH: '1',
});
assert.notEqual(test5Res.status, 0, 'Must exit nonzero on catalog mismatch');
assert.ok(
  (test5Res.stderr + test5Res.stdout).includes('Catalog mismatch'),
  `Must output exact catalog-mismatch rejection, got: ${test5Res.stderr}`
);
assert.ok(!test5Res.stdout.includes('STATUS: PASS'), 'Must NOT emit STATUS: PASS on catalog mismatch');
assert.ok(test5Res.stdout.includes('CLEANUP_VERIFIED'), 'Must perform verified cleanup of test container');
console.log('PASS: Class 5 — Role catalog mismatch rejected and verified cleanup.\n');

// ---------------------------------------------------------------------------
// Negative Test 6: Foreign Container Removal Refusal & Parent Cleanup
// ---------------------------------------------------------------------------
console.log('--- Negative Test 6: Foreign Container Removal Refusal & Parent Cleanup ---');
const test6Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_CLEANUP_MISMATCH: '1',
});
assert.notEqual(test6Res.status, 0, 'Must exit nonzero on foreign container cleanup mismatch');
assert.ok(
  (test6Res.stderr + test6Res.stdout).includes('SECURITY REFUSAL'),
  `Must emit explicit SECURITY REFUSAL, got: ${test6Res.stderr}`
);
assert.ok(
  !test6Res.stdout.includes('CLEANUP_VERIFIED'),
  'Tested process must NOT emit CLEANUP_VERIFIED or delete the container'
);

// Capture child run's exact ID and nonce
const idMatch = test6Res.stdout.match(/Verified Container ID:\s*([a-f0-9]{64})/i);
assert.ok(idMatch, 'Parent must capture child run exact 64-character container ID');
const childContainerId = idMatch[1];

const nonceMatch = test6Res.stdout.match(/Run Unique ID:\s*([a-f0-9]{32})/i);
assert.ok(nonceMatch, 'Parent must capture child run exact 32-character nonce');
const childNonce = nonceMatch[1];

console.log(`Parent captured child container: ${childContainerId.slice(0, 12)} (nonce: ${childNonce})`);

// Independently verify container presence and label through pinned Docker endpoint
const psCheck = dockerCmd(['ps', '-aq', '--no-trunc', '--filter', `id=${childContainerId}`]);
assert.equal(psCheck.status, 0, 'Parent: docker ps check failed');
assert.equal(psCheck.stdout.trim(), childContainerId, 'Parent: Container must still be present (not deleted by child)');

const inspectRes = dockerCmd(['inspect', '--format', '{{json .Config.Labels}}', childContainerId]);
assert.equal(inspectRes.status, 0, 'Parent: docker inspect on owned test container must succeed');
const childLabels = JSON.parse(inspectRes.stdout.trim() || '{}');
assert.equal(childLabels['lari.qa.nonce'], childNonce, 'Parent: Container nonce label must match captured child nonce');
console.log('Parent verified: Child container remained untouched with valid matching nonce label.');

// Parent safely removes only that owned test container
const rmRes = dockerCmd(['rm', '-f', childContainerId]);
assert.equal(rmRes.status, 0, `Parent: Failed to remove owned test container ${childContainerId}: ${rmRes.stderr}`);

// Verify its absence
const psAfter = dockerCmd(['ps', '-aq', '--no-trunc', '--filter', `id=${childContainerId}`]);
assert.equal(psAfter.status, 0, 'Parent: docker ps verification after removal failed');
assert.equal(psAfter.stdout.trim(), '', 'Parent: Container must be absent after parent removal');
console.log(`Parent safely removed test container ${childContainerId.slice(0, 12)} and verified absence.`);

console.log('PASS: Class 6 — Cleanup mismatch triggered explicit SECURITY REFUSAL; parent harness verified and cleaned test container.\n');

console.log('='.repeat(72));
console.log('ALL 6/6 NEGATIVE SECURITY TESTS PASSED FAIL-CLOSED AS EXPECTED');
console.log('='.repeat(72));
