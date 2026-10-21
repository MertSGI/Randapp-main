import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verifyMigrationPlan, P0_EXPECTED_LF_HASH } from './verify-lari-migration-plan.mjs';

const MATRIX_PATH = path.resolve(process.cwd(), 'docs', 'lari-program', 'MIGRATION_RECONCILIATION_MATRIX.json');

function getBaseMatrix() {
  return JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
}

test('1. Valid migration plan passes full verification', () => {
  const matrix = getBaseMatrix();
  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, true, `Verification failed with errors: ${res.errors.join(', ')}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.total_entries, 26);
  assert.equal(res.summary.local_only, 21);
  assert.equal(res.summary.remote_only, 4);
  assert.equal(res.summary.p0_cutover, 1);
});

test('2. Duplicate source_sha256 is strictly rejected', () => {
  const matrix = getBaseMatrix();
  // Duplicate hash of DIFF-01 into DIFF-04
  const diff1 = matrix.items.find((i) => i.item_id === 'DIFF-01');
  const diff4 = matrix.items.find((i) => i.item_id === 'DIFF-04');
  assert.ok(diff1 && diff4);
  diff4.source_sha256 = diff1.source_sha256;

  // Simulate hash collision by pointing to the same file or modifying disk expectation
  const res = verifyMigrationPlan(matrix, process.cwd());
  // When files on disk are verified, if duplicate hashes exist across items pointing to same file or differing files
  // Let's make diff4 point to diff1's filename to test duplicate hash detection on disk
  diff4.local_filename = diff1.local_filename;
  const resDuplicate = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(resDuplicate.valid, false);
  assert.ok(resDuplicate.errors.some((e) => e.startsWith('DUPLICATE_SOURCE_SHA256')));
});

test('3. Missing difference detection fails verification', () => {
  const matrix = getBaseMatrix();
  matrix.items = matrix.items.filter((i) => i.item_id !== 'DIFF-05');
  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('EXPECTED_26_ITEMS_FOUND_25') || e.includes('EXPECTED_21_LOCAL_ONLY_FOUND_20')));
});

test('4. Alias SEMANTIC_EQUIVALENT_PROVEN on remote-only is strictly rejected', () => {
  const matrix = getBaseMatrix();
  const remoteItem = matrix.items.find((i) => i.side === 'REMOTE_ONLY');
  assert.ok(remoteItem);
  remoteItem.class = 'SEMANTIC_EQUIVALENT_PROVEN';

  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('REMOTE_ONLY_CANNOT_BE_SEMANTIC_EQUIVALENT_PROVEN')));
});

test('5. Missing collision group is strictly detected and rejected', () => {
  const matrix = getBaseMatrix();
  for (const item of matrix.items) {
    if (item.collision_group === 'COLLISION_20260920') {
      item.collision_group = null;
    }
  }

  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('MISSING_COLLISION_GROUP:COLLISION_20260920')));
});

test('6. P0 security cutover gate is enforced', () => {
  const matrix = getBaseMatrix();
  const p0 = matrix.items.find((i) => i.item_id === 'P0-SECURITY-MIGRATION');
  assert.ok(p0);

  // Subtest A: invalid operation
  p0.target_forward_operation = 'BATCH_RUNNER_AUTO_APPLY';
  let res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('P0_TARGET_OP_INVALID')));

  // Subtest B: missing entirely
  const matrixNoP0 = getBaseMatrix();
  matrixNoP0.items = matrixNoP0.items.filter((i) => i.item_id !== 'P0-SECURITY-MIGRATION');
  matrixNoP0.p0_cutover_count = 0;
  res = verifyMigrationPlan(matrixNoP0, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('P0_SECURITY_MIGRATION_NOT_FOUND') || e.includes('EXPECTED_1_P0_CUTOVER_FOUND_0')));
});

test('7. Hash mismatch is strictly rejected', () => {
  const matrix = getBaseMatrix();
  const diff1 = matrix.items.find((i) => i.item_id === 'DIFF-01');
  assert.ok(diff1);
  diff1.source_sha256 = '0000000000000000000000000000000000000000000000000000000000000000';

  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('HASH_MISMATCH:20260920_phase3_resource_capacity_foundation.sql')));
});

test('8. Circular dependency / DAG cycle in blocked_by is rejected', () => {
  const matrix = getBaseMatrix();
  const diff1 = matrix.items.find((i) => i.item_id === 'DIFF-01');
  const diff2 = matrix.items.find((i) => i.item_id === 'DIFF-02');
  assert.ok(diff1 && diff2);

  // Introduce cycle DIFF-01 -> DIFF-02 -> DIFF-01
  diff1.blocked_by = ['DIFF-02'];
  diff2.blocked_by = ['DIFF-01'];

  const res = verifyMigrationPlan(matrix, process.cwd());
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('CIRCULAR_DEPENDENCY_DETECTED')));
});
