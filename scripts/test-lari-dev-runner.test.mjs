import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TASK_STATES,
  validateQueueAndDag,
  computeTaskDigest,
  runOnce,
  getStatusNonMutating,
  acknowledgeReconciliation,
} from './lari-dev-runner/core.mjs';
import {
  acquireExclusiveLock,
  readState,
  writeStateAtomic,
  readEventReceipts,
  getRuntimePaths,
} from './lari-dev-runner/checkpoint.mjs';
import {
  validateCommandRequest,
  maskSensitiveOutput,
} from './lari-dev-runner/adapters.mjs';

const TEST_BASE_SHA = '72911e4fb68dd4f85f7fafef575089104102064e';

function createTempFixtureRepo(customTasks = null, baseSha = TEST_BASE_SHA) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-dev247-fixture-'));
  const docsDir = path.join(tmpRoot, 'docs', 'lari-program');
  fs.mkdirSync(docsDir, { recursive: true });

  fs.writeFileSync(
    path.join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'lari', private: true, version: '0.0.0', type: 'module' }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(docsDir, 'MASTER_DECISIONS.md'), '# Master Decisions\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'ACCEPTANCE_MATRIX.md'), '# Acceptance Matrix\n', 'utf8');

  const defaultTasks = [
    {
      task_id: 'DEV247-A',
      kind: 'documentation',
      dependency_ids: [],
      base_sha: baseSha,
      target_paths: ['docs/lari-program/*'],
      acceptance_checks: ['three_files_present'],
      risk_class: 'low',
      authority: 'autonomous',
      model_preference: 'flash',
      state: 'READY',
    },
  ];

  const queueObj = {
    schema_version: 1,
    program_id: 'LARI-TEST-QUEUE',
    base_sha: baseSha,
    tasks: customTasks || defaultTasks,
  };

  fs.writeFileSync(
    path.join(docsDir, 'DEVELOPMENT_QUEUE.json'),
    JSON.stringify(queueObj, null, 2),
    'utf8'
  );

  return {
    repoRoot: tmpRoot,
    cleanup() {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors on Windows file locks
      }
    },
  };
}

test('Case 1: Parse queue, validate schema_version 1, and detect cyclic vs acyclic dependencies', () => {
  const acyclicQueue = {
    schema_version: 1,
    base_sha: TEST_BASE_SHA,
    tasks: [
      { task_id: 'T1', kind: 'native_qa', dependency_ids: [] },
      { task_id: 'T2', kind: 'native_qa', dependency_ids: ['T1'] },
      { task_id: 'T3', kind: 'native_qa', dependency_ids: ['T1', 'T2'] },
    ],
  };
  const validRes = validateQueueAndDag(acyclicQueue);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.tasks.length, 3);

  const cyclicQueue = {
    schema_version: 1,
    base_sha: TEST_BASE_SHA,
    tasks: [
      { task_id: 'T1', kind: 'native_qa', dependency_ids: ['T3'] },
      { task_id: 'T2', kind: 'native_qa', dependency_ids: ['T1'] },
      { task_id: 'T3', kind: 'native_qa', dependency_ids: ['T2'] },
    ],
  };
  const cycleRes = validateQueueAndDag(cyclicQueue);
  assert.equal(cycleRes.valid, false);
  assert.match(cycleRes.reason, /CYCLIC_DEPENDENCY_DETECTED/);

  const unknownDepQueue = {
    schema_version: 1,
    base_sha: TEST_BASE_SHA,
    tasks: [{ task_id: 'T1', kind: 'native_qa', dependency_ids: ['NON_EXISTENT'] }],
  };
  const missingDepRes = validateQueueAndDag(unknownDepQueue);
  assert.equal(missingDepRes.valid, false);
  assert.match(missingDepRes.reason, /UNKNOWN_DEPENDENCY/);
});

test('Case 2: Deterministic FIFO + Priority ordering and dependency gate resolution', async () => {
  const fixture = createTempFixtureRepo([
    {
      task_id: 'TASK-FIFO-1',
      kind: 'native_qa',
      priority: 1,
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/a.mjs'],
      acceptance_checks: ['check_a'],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
    {
      task_id: 'TASK-HIGH-PRIO',
      kind: 'native_qa',
      priority: 10,
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/b.mjs'],
      acceptance_checks: ['check_b'],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
    {
      task_id: 'TASK-FIFO-2',
      kind: 'native_qa',
      priority: 1,
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/c.mjs'],
      acceptance_checks: ['check_c'],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
    {
      task_id: 'TASK-DEPENDENT',
      kind: 'native_qa',
      priority: 100,
      dependency_ids: ['TASK-FIFO-2'],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/d.mjs'],
      acceptance_checks: ['check_d'],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
  ]);

  try {
    // 1st run: TASK-DEPENDENT is priority 100 but blocked by TASK-FIFO-2; TASK-HIGH-PRIO (prio 10) wins
    const r1 = await runOnce(fixture.repoRoot);
    assert.equal(r1.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(r1.task_id, 'TASK-HIGH-PRIO');

    // 2nd run: Tie between TASK-FIFO-1 (prio 1, index 0) and TASK-FIFO-2 (prio 1, index 2) -> TASK-FIFO-1 wins
    const r2 = await runOnce(fixture.repoRoot);
    assert.equal(r2.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(r2.task_id, 'TASK-FIFO-1');

    // 3rd run: TASK-FIFO-2 runs
    const r3 = await runOnce(fixture.repoRoot);
    assert.equal(r3.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(r3.task_id, 'TASK-FIFO-2');

    // 4th run: TASK-DEPENDENT now has dependency satisfied and runs
    const r4 = await runOnce(fixture.repoRoot);
    assert.equal(r4.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(r4.task_id, 'TASK-DEPENDENT');
  } finally {
    fixture.cleanup();
  }
});

test('Case 3: Two-instance exclusive claim via open(wx) prevents concurrent claim', async () => {
  const fixture = createTempFixtureRepo();
  try {
    const lock1 = acquireExclusiveLock(fixture.repoRoot, { instanceId: 'instance-alpha' });
    assert.equal(lock1.acquired, true);

    // Second lock attempt while lock1 is held must fail with LOCK_HELD
    const lock2 = acquireExclusiveLock(fixture.repoRoot, { instanceId: 'instance-beta' });
    assert.equal(lock2.acquired, false);
    assert.equal(lock2.code, 'LOCK_HELD');

    // Second runner instance calling runOnce while lock1 is held cannot claim
    const concurrentRun = await runOnce(fixture.repoRoot, { instanceId: 'instance-beta' });
    assert.equal(concurrentRun.status, 'LOCK_HELD');
    assert.equal(concurrentRun.claimed, false);

    // Release lock1 and verify runner can now claim and execute
    const released = lock1.release();
    assert.equal(released, true);

    const afterReleaseRun = await runOnce(fixture.repoRoot, { instanceId: 'instance-beta' });
    assert.equal(afterReleaseRun.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(afterReleaseRun.claimed, true);
  } finally {
    fixture.cleanup();
  }
});

test('Case 4: Duplicate task_id suppression and stable task digest calculation', async () => {
  const taskDef = {
    task_id: 'DUP-TASK-1',
    kind: 'native_qa',
    dependency_ids: [],
    base_sha: TEST_BASE_SHA,
    target_paths: ['scripts/dup.mjs'],
    acceptance_checks: ['check_1'],
    risk_class: 'low',
    authority: 'autonomous',
    state: 'READY',
  };

  const digest1 = computeTaskDigest(taskDef);
  const digest2 = computeTaskDigest({ ...taskDef, extra_runtime_field: 'ignored' });
  assert.equal(digest1, digest2);
  assert.equal(digest1.length, 64);

  const fixture = createTempFixtureRepo([
    taskDef,
    { ...taskDef, acceptance_checks: ['duplicate_should_be_suppressed'] },
  ]);

  try {
    const res = await runOnce(fixture.repoRoot);
    assert.equal(res.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(res.task_id, 'DUP-TASK-1');

    const persisted = readState(fixture.repoRoot);
    assert.equal(persisted.tasks.length, 1);
    assert.equal(persisted.suppressed_duplicates.length, 1);
    assert.equal(persisted.suppressed_duplicates[0].task_id, 'DUP-TASK-1');

    const events = readEventReceipts(fixture.repoRoot);
    assert.ok(events.some((e) => e.type === 'DUPLICATE_TASK_SUPPRESSED' && e.task_id === 'DUP-TASK-1'));
  } finally {
    fixture.cleanup();
  }
});

test('Case 5: Accepted task restart replay prevention across runner restarts', async () => {
  const fixture = createTempFixtureRepo();
  try {
    const firstRun = await runOnce(fixture.repoRoot);
    assert.equal(firstRun.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(firstRun.task_id, 'DEV247-A');

    const stateAfterFirst = readState(fixture.repoRoot);
    const acceptedTimestamp = stateAfterFirst.tasks[0].accepted_at;
    assert.ok(acceptedTimestamp);

    // Second run (simulating runner restart) must not replay or overwrite ACCEPTED_SOURCE
    const secondRun = await runOnce(fixture.repoRoot);
    assert.equal(secondRun.status, 'NO_ELIGIBLE_TASKS');
    assert.equal(secondRun.claimed, false);

    const stateAfterSecond = readState(fixture.repoRoot);
    assert.equal(stateAfterSecond.tasks[0].state, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(stateAfterSecond.tasks[0].accepted_at, acceptedTimestamp);
  } finally {
    fixture.cleanup();
  }
});

test('Case 6: Interrupted in-flight work transitions to NEEDS_RECONCILIATION and requires operator ACK', async () => {
  const fixture = createTempFixtureRepo([
    {
      task_id: 'CRASH-TASK-1',
      kind: 'native_qa',
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/crash.mjs'],
      acceptance_checks: ['crash_check'],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
  ]);

  try {
    // Simulate a previous process crash that left CRASH-TASK-1 in IMPLEMENTING state on disk
    writeStateAtomic(fixture.repoRoot, {
      schema_version: 1,
      base_sha: TEST_BASE_SHA,
      tasks: [
        {
          task_id: 'CRASH-TASK-1',
          kind: 'native_qa',
          dependency_ids: [],
          base_sha: TEST_BASE_SHA,
          target_paths: ['scripts/crash.mjs'],
          acceptance_checks: ['crash_check'],
          risk_class: 'low',
          authority: 'autonomous',
          state: TASK_STATES.IMPLEMENTING,
          updated_at: new Date().toISOString(),
        },
      ],
    });

    // Running once must NOT re-execute the crashed task; it must mark it NEEDS_RECONCILIATION
    const runAfterCrash = await runOnce(fixture.repoRoot);
    assert.equal(runAfterCrash.status, 'NO_ELIGIBLE_TASKS');
    assert.equal(runAfterCrash.claimed, false);
    assert.equal(runAfterCrash.reconciled_count, 1);

    const stateAfterReconcile = readState(fixture.repoRoot);
    assert.equal(stateAfterReconcile.tasks[0].state, TASK_STATES.NEEDS_RECONCILIATION);

    // Operator explicitly acknowledges reconciliation -> transitions to READY -> can then execute
    const acked = acknowledgeReconciliation(fixture.repoRoot, 'CRASH-TASK-1', 'VERIFIED_SAFE_BY_OPERATOR');
    assert.equal(acked.state, TASK_STATES.READY);

    const runAfterAck = await runOnce(fixture.repoRoot);
    assert.equal(runAfterAck.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(runAfterAck.task_id, 'CRASH-TASK-1');
  } finally {
    fixture.cleanup();
  }
});

test('Case 7: Quota pause marker (PAUSED_QUOTA / not_before) skips execution without calling provider', async () => {
  const futureIso = new Date(Date.now() + 3600_000).toISOString();
  const fixture = createTempFixtureRepo([
    {
      task_id: 'QUOTA-PAUSED-TASK',
      kind: 'agent',
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['services/someService.ts'],
      acceptance_checks: ['check_quota'],
      risk_class: 'low',
      authority: 'autonomous',
      state: TASK_STATES.PAUSED_QUOTA,
      not_before: futureIso,
    },
  ]);

  let providerCalled = false;
  const mockAgentAdapter = {
    verified: true,
    async invoke() {
      providerCalled = true;
      return { status: 'PASSED', exit_code: 0 };
    },
  };

  try {
    const res = await runOnce(fixture.repoRoot, { agentAdapter: mockAgentAdapter });
    assert.equal(res.status, TASK_STATES.PAUSED_QUOTA);
    assert.equal(res.claimed, false);
    assert.equal(res.quota_skipped_count, 1);
    assert.equal(providerCalled, false);

    const events = readEventReceipts(fixture.repoRoot);
    assert.ok(events.some((e) => e.type === 'QUOTA_PAUSE_SKIPPED' && e.provider_called === false));
  } finally {
    fixture.cleanup();
  }
});

test('Case 8: Arbitrary command, shell metacharacters, external URL, and high-risk authority denial', async () => {
  // Direct unit checks on allowlist guard
  assert.equal(validateCommandRequest({ command: 'powershell', args: ['-Command', 'Get-Process'] }).allowed, false);
  assert.equal(validateCommandRequest({ command: 'curl', args: ['https://example.com'] }).allowed, false);
  assert.equal(validateCommandRequest({ command: 'git', args: ['push', 'origin', 'main'] }).allowed, false);
  assert.equal(validateCommandRequest({ command: 'psql', args: ['postgresql://user:pass@host/db'] }).allowed, false);
  assert.equal(validateCommandRequest({ command: 'npm', args: ['run', 'lint; rm -rf /'] }).allowed, false);
  assert.equal(validateCommandRequest({ command: 'node', args: ['--version'] }).allowed, true);

  // Runner denial of autonomous task with critical risk or forbidden command
  const fixture = createTempFixtureRepo([
    {
      task_id: 'HIGH-RISK-ROGUE-TASK',
      kind: 'native_qa',
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['supabase/migrations/2026_drop.sql'],
      acceptance_checks: ['rogue_check'],
      risk_class: 'critical',
      authority: 'autonomous',
      state: 'READY',
    },
  ]);

  try {
    const res = await runOnce(fixture.repoRoot);
    assert.equal(res.status, TASK_STATES.FAILED_STOP);
    assert.equal(res.task_id, 'HIGH-RISK-ROGUE-TASK');
    assert.match(res.reason, /CRITICAL_RISK_AUTONOMOUS_DENIED|PROTECTED_TARGET_PATH_DENIED/);
    assert.equal(res.remote_effects, 0);
  } finally {
    fixture.cleanup();
  }
});

test('Case 9: Receipts persistence, secret masking, bounded retry, and zero network/SQL side effects', async () => {
  const masked = maskSensitiveOutput(
    'Authorization: Bearer secret_token_123456 key=sk_live_9988776655 db=postgresql://admin:pass@db.supabase.co:5432/postgres'
  );
  assert.ok(!masked.includes('secret_token_123456'));
  assert.ok(!masked.includes('sk_live_9988776655'));
  assert.ok(!masked.includes('admin:pass'));
  assert.ok(masked.includes('[REDACTED'));

  // Test bounded 1 retry (2 total attempts max) on transient failure then PASS
  let callCount = 0;
  const fixture = createTempFixtureRepo([
    {
      task_id: 'RETRY-QA-TASK',
      kind: 'native_qa',
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['scripts/test-lari-dev-runner.test.mjs'],
      acceptance_checks: ['node_test_runner_pass'],
      commands: [{ command: 'node', args: ['--version'] }],
      risk_class: 'low',
      authority: 'autonomous',
      state: 'READY',
    },
  ]);

  try {
    const res = await runOnce(fixture.repoRoot, {
      spawnOverride: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            allowed: true,
            executed: true,
            exit_code: 1,
            timed_out: false,
            duration_ms: 5,
            command: 'node --version',
            args: ['--version'],
            stdout_masked: '',
            stderr_masked: 'Transient failure on attempt 1',
            reason: 'NON_ZERO_EXIT',
            remote_effects: 0,
          };
        }
        return {
          allowed: true,
          executed: true,
          exit_code: 0,
          timed_out: false,
          duration_ms: 5,
          command: 'node --version',
          args: ['--version'],
          stdout_masked: 'v20.0.0',
          stderr_masked: '',
          reason: 'OK',
          remote_effects: 0,
        };
      },
    });

    assert.equal(res.status, TASK_STATES.ACCEPTED_SOURCE);
    assert.equal(res.attempts, 2);
    assert.equal(res.remote_effects, 0);

    const paths = getRuntimePaths(fixture.repoRoot);
    assert.equal(fs.existsSync(paths.stateFile), true);
    assert.equal(fs.existsSync(paths.eventsFile), true);
    assert.equal(fs.existsSync(paths.lockFile), false);

    const events = readEventReceipts(fixture.repoRoot);
    assert.ok(events.length >= 5);
    assert.ok(events.every((e) => (e.remote_effects ?? 0) === 0));
  } finally {
    fixture.cleanup();
  }
});

test('Case 10: Source drift hold, agent adapter safe-off hold, and non-mutating status check', async () => {
  const fixture = createTempFixtureRepo([
    {
      task_id: 'AGENT-TASK-1',
      kind: 'agent',
      dependency_ids: [],
      base_sha: TEST_BASE_SHA,
      target_paths: ['services/paymentRunModeService.ts'],
      acceptance_checks: ['agent_check'],
      risk_class: 'medium',
      authority: 'autonomous',
      state: 'READY',
    },
  ]);

  try {
    // 1. Non-mutating status check BEFORE any run must not create .lari-dev-runtime
    const paths = getRuntimePaths(fixture.repoRoot);
    assert.equal(fs.existsSync(paths.runtimeDir), false);

    const statusBefore = getStatusNonMutating(fixture.repoRoot);
    assert.equal(statusBefore.ok, true);
    assert.equal(statusBefore.runner_mode, 'OFFLINE_CANARY');
    assert.equal(statusBefore.agent_adapter, 'UNVERIFIED_SAFE_OFF');
    assert.equal(statusBefore.runtime_initialized, false);
    assert.equal(fs.existsSync(paths.runtimeDir), false);

    // 2. Source drift check when expectedBaseSha mismatches
    const driftRes = await runOnce(fixture.repoRoot, {
      expectedBaseSha: '0000000000000000000000000000000000000000',
      recordDriftReceipt: false,
    });
    assert.equal(driftRes.status, 'HOLD_SOURCE_DRIFT');
    assert.equal(driftRes.claimed, false);

    // 3. Agent task without verified adapter must hold with HOLD_AGENT_ADAPTER_UNVERIFIED
    const agentHoldRes = await runOnce(fixture.repoRoot);
    assert.equal(agentHoldRes.status, 'HOLD_AGENT_ADAPTER_UNVERIFIED');
    assert.equal(agentHoldRes.task_id, 'AGENT-TASK-1');
    assert.equal(agentHoldRes.claimed, false);
    assert.equal(agentHoldRes.remote_effects, 0);

    const events = readEventReceipts(fixture.repoRoot);
    assert.ok(events.some((e) => e.status === 'HOLD_AGENT_ADAPTER_UNVERIFIED'));
  } finally {
    fixture.cleanup();
  }
});
