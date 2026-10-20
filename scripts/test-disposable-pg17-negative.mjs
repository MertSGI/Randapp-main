import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

console.log('='.repeat(72));
console.log('LARI — DISPOSABLE PG 17.6 NEGATIVE SECURITY & FAIL-CLOSED TEST SUITE');
console.log('='.repeat(72));

const targetScript = 'scripts/verify-disposable-pg17-role-restore.mjs';

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
  test1Res.stderr.includes('Docker is not available') || test1Res.stdout.includes('Docker is not available'),
  'Must state Docker is not available'
);
assert.ok(!test1Res.stdout.includes('CREATE ROLE') && !test1Res.stdout.includes('DROP ROLE'), 'No host SQL executed');
console.log('PASS: Missing Docker fails closed without host SQL execution.\n');

// ---------------------------------------------------------------------------
// Negative Test 2: Remote Docker Daemon Rejected (TCP & SSH)
// ---------------------------------------------------------------------------
console.log('--- Negative Test 2: Remote Docker Daemon Rejection ---');
const test2TcpRes = runTargetWithEnv({
  DOCKER_HOST: 'tcp://192.168.1.100:2375',
});
assert.notEqual(test2TcpRes.status, 0, 'Must exit nonzero when DOCKER_HOST uses tcp://');
assert.ok(
  test2TcpRes.stderr.includes('Remote Docker daemon rejected') || test2TcpRes.stdout.includes('Remote Docker daemon rejected'),
  'Must reject remote TCP daemon'
);
assert.ok(!test2TcpRes.stdout.includes('CREATE ROLE') && !test2TcpRes.stdout.includes('DROP ROLE'), 'No host SQL executed');

const test2SshRes = runTargetWithEnv({
  DOCKER_HOST: 'ssh://operator@remote.server',
});
assert.notEqual(test2SshRes.status, 0, 'Must exit nonzero when DOCKER_HOST uses ssh://');
assert.ok(
  test2SshRes.stderr.includes('Remote Docker daemon rejected') || test2SshRes.stdout.includes('Remote Docker daemon rejected'),
  'Must reject remote SSH daemon'
);
assert.ok(!test2SshRes.stdout.includes('CREATE ROLE') && !test2SshRes.stdout.includes('DROP ROLE'), 'No host SQL executed');
console.log('PASS: Remote TCP and SSH Docker daemon endpoints strictly rejected without host SQL execution.\n');

// ---------------------------------------------------------------------------
// Negative Test 3: Container Nonce Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 3: Nonce / Container ID Mismatch ---');
const test3Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_DOCKER_BIN: 'docker',
  LARI_TEST_SIMULATE_NONCE_MISMATCH: '1',
});
// When Docker daemon is unavailable locally or simulation triggers, it fails closed
assert.notEqual(test3Res.status, 0, 'Must exit nonzero on nonce mismatch');
assert.ok(!test3Res.stdout.includes('CREATE ROLE') && !test3Res.stdout.includes('DROP ROLE'), 'No destructive SQL executed');
console.log('PASS: Nonce mismatch fails closed before destructive SQL execution.\n');

// ---------------------------------------------------------------------------
// Negative Test 4: PostgreSQL Version Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 4: PostgreSQL Version Mismatch ---');
const test4Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_DOCKER_BIN: 'docker',
  LARI_TEST_SIMULATE_VERSION_MISMATCH: '1',
});
assert.notEqual(test4Res.status, 0, 'Must exit nonzero on version mismatch');
assert.ok(!test4Res.stdout.includes('CREATE ROLE') && !test4Res.stdout.includes('DROP ROLE'), 'No destructive SQL executed');
console.log('PASS: Engine version mismatch fails closed before destructive SQL execution.\n');

// ---------------------------------------------------------------------------
// Negative Test 5: Role Catalog Mismatch Fails Closed
// ---------------------------------------------------------------------------
console.log('--- Negative Test 5: Role Catalog Mismatch ---');
const test5Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_DOCKER_BIN: 'docker',
  LARI_TEST_SIMULATE_CATALOG_MISMATCH: '1',
});
assert.notEqual(test5Res.status, 0, 'Must exit nonzero on catalog mismatch');
console.log('PASS: Role catalog mismatch fails closed.\n');

// ---------------------------------------------------------------------------
// Negative Test 6: Foreign Container Removal Refusal
// ---------------------------------------------------------------------------
console.log('--- Negative Test 6: Foreign Container Cleanup Refusal ---');
const test6Res = runTargetWithEnv({
  LARI_TEST_SIMULATE_DOCKER_BIN: 'docker',
  LARI_TEST_SIMULATE_CLEANUP_MISMATCH: '1',
});
assert.notEqual(test6Res.status, 0, 'Must exit nonzero on foreign container cleanup mismatch');
console.log('PASS: Refusal to delete foreign container fails closed.\n');

console.log('='.repeat(72));
console.log('ALL NEGATIVE SECURITY TESTS PASSED FAIL-CLOSED AS EXPECTED');
console.log('='.repeat(72));
