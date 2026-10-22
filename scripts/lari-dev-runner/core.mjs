import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  getRuntimePaths,
  acquireExclusiveLock,
  writeStateAtomic,
  readState,
  appendEventReceipt,
  readEventReceipts,
} from './checkpoint.mjs';
import {
  runNativeQaAdapter,
  runAgentAdapter,
  validateCommandRequest,
} from './adapters.mjs';

export const TASK_STATES = Object.freeze({
  READY: 'READY',
  CLAIMED: 'CLAIMED',
  IMPLEMENTING: 'IMPLEMENTING',
  TESTING: 'TESTING',
  ACCEPTED_SOURCE: 'ACCEPTED_SOURCE',
  HOLD_OWNER: 'HOLD_OWNER',
  PAUSED_QUOTA: 'PAUSED_QUOTA',
  NEEDS_RECONCILIATION: 'NEEDS_RECONCILIATION',
  FAILED_STOP: 'FAILED_STOP',
});

export const IN_FLIGHT_STATES = new Set([
  TASK_STATES.CLAIMED,
  TASK_STATES.IMPLEMENTING,
  TASK_STATES.TESTING,
]);

export const NATIVE_QA_KINDS = new Set([
  'native_qa',
  'documentation',
  'qa',
]);

export function computeTaskDigest(task) {
  const canonical = {
    task_id: task.task_id,
    kind: task.kind,
    dependency_ids: Array.isArray(task.dependency_ids) ? [...task.dependency_ids] : [],
    base_sha: task.base_sha || '',
    target_paths: Array.isArray(task.target_paths) ? [...task.target_paths] : [],
    acceptance_checks: Array.isArray(task.acceptance_checks) ? [...task.acceptance_checks] : [],
    risk_class: task.risk_class || 'low',
    authority: task.authority || 'autonomous',
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function validateQueueAndDag(queueData, options = {}) {
  if (!queueData || typeof queueData !== 'object') {
    return { valid: false, reason: 'QUEUE_NOT_OBJECT' };
  }
  if (queueData.schema_version !== 1) {
    return { valid: false, reason: `UNSUPPORTED_SCHEMA_VERSION:${queueData.schema_version}` };
  }
  if (!Array.isArray(queueData.tasks)) {
    return { valid: false, reason: 'TASKS_NOT_ARRAY' };
  }

  const seenIds = new Set();
  const dedupedTasks = [];
  const suppressedDuplicates = [];

  for (let i = 0; i < queueData.tasks.length; i++) {
    const t = queueData.tasks[i];
    if (!t || typeof t.task_id !== 'string' || !t.task_id.trim()) {
      return { valid: false, reason: `INVALID_TASK_ID_AT_INDEX:${i}` };
    }
    if (seenIds.has(t.task_id)) {
      if (options.rejectDuplicatesStrict) {
        return { valid: false, reason: `DUPLICATE_TASK_ID:${t.task_id}` };
      }
      suppressedDuplicates.push({
        task_id: t.task_id,
        duplicate_index: i,
      });
      continue;
    }
    seenIds.add(t.task_id);
    dedupedTasks.push({
      ...t,
      queue_index: dedupedTasks.length,
      task_digest: computeTaskDigest(t),
    });
  }

  const adj = new Map();
  for (const t of dedupedTasks) {
    const deps = Array.isArray(t.dependency_ids) ? t.dependency_ids : [];
    for (const dep of deps) {
      if (!seenIds.has(dep)) {
        return {
          valid: false,
          reason: `UNKNOWN_DEPENDENCY:${t.task_id}->${dep}`,
        };
      }
    }
    adj.set(t.task_id, deps);
  }

  // DFS cycle detection
  const visited = new Set();
  const inStack = new Set();

  function detectCycle(nodeId) {
    visited.add(nodeId);
    inStack.add(nodeId);
    const deps = adj.get(nodeId) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (detectCycle(dep)) return true;
      } else if (inStack.has(dep)) {
        return true;
      }
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const id of seenIds) {
    if (!visited.has(id) && detectCycle(id)) {
      return { valid: false, reason: `CYCLIC_DEPENDENCY_DETECTED:${id}` };
    }
  }

  return {
    valid: true,
    reason: 'OK',
    tasks: dedupedTasks,
    suppressedDuplicates,
  };
}

export function verifySourceDrift(repoRoot, options = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const pkgPath = path.join(resolvedRoot, 'package.json');
  const queuePath = path.join(resolvedRoot, 'docs', 'lari-program', 'DEVELOPMENT_QUEUE.json');

  if (!fs.existsSync(pkgPath) || !fs.existsSync(queuePath)) {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: 'MISSING_REPO_ROOT_OR_QUEUE_FILE',
    };
  }

  let pkg;
  let queue;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: `CORRUPT_JSON:${err.message}`,
    };
  }

  if (pkg.name !== 'lari') {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: `UNEXPECTED_PACKAGE_NAME:${pkg.name}`,
    };
  }

  if (!queue.base_sha || typeof queue.base_sha !== 'string') {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: 'MISSING_QUEUE_BASE_SHA',
    };
  }

  if (options.expectedBaseSha && queue.base_sha !== options.expectedBaseSha) {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: `BASE_SHA_DRIFT:expected=${options.expectedBaseSha},actual=${queue.base_sha}`,
    };
  }

  for (const task of queue.tasks || []) {
    if (task.base_sha && task.base_sha !== queue.base_sha) {
      return {
        ok: false,
        status: 'HOLD_SOURCE_DRIFT',
        reason: `TASK_BASE_SHA_DRIFT:${task.task_id}`,
      };
    }
  }

  return {
    ok: true,
    status: 'SOURCE_ALIGNED',
    queue,
    base_sha: queue.base_sha,
  };
}

export function evaluateTaskAuthority(task) {
  if (task.authority === 'owner_approval_required' || task.kind === 'owner_gate' || task.state === TASK_STATES.HOLD_OWNER) {
    return {
      allowed: false,
      terminalState: TASK_STATES.HOLD_OWNER,
      reason: 'OWNER_GATE_REQUIRED',
    };
  }

  if (task.authority !== 'autonomous') {
    return {
      allowed: false,
      terminalState: TASK_STATES.FAILED_STOP,
      reason: `UNAUTHORIZED_AUTHORITY_LEVEL:${task.authority}`,
    };
  }

  if (task.risk_class === 'critical') {
    return {
      allowed: false,
      terminalState: TASK_STATES.FAILED_STOP,
      reason: 'CRITICAL_RISK_AUTONOMOUS_DENIED',
    };
  }

  const targetPaths = Array.isArray(task.target_paths) ? task.target_paths : [];
  for (const tp of targetPaths) {
    if (tp.startsWith('.github/workflows') || tp.startsWith('supabase/migrations')) {
      return {
        allowed: false,
        terminalState: TASK_STATES.FAILED_STOP,
        reason: `PROTECTED_TARGET_PATH_DENIED:${tp}`,
      };
    }
  }

  if (Array.isArray(task.commands)) {
    for (const cmd of task.commands) {
      const check = validateCommandRequest(cmd);
      if (!check.allowed) {
        return {
          allowed: false,
          terminalState: TASK_STATES.FAILED_STOP,
          reason: `DISALLOWED_TASK_COMMAND:${check.reason}`,
        };
      }
    }
  }

  return {
    allowed: true,
    reason: 'AUTHORIZED',
  };
}

export function selectEligibleTasks(taskRecords, nowMs = Date.now()) {
  const byId = new Map(taskRecords.map((t) => [t.task_id, t]));
  const eligible = [];
  const quotaSkipped = [];

  for (const task of taskRecords) {
    // Check dependencies first
    const deps = Array.isArray(task.dependency_ids) ? task.dependency_ids : [];
    const depsMet = deps.every((depId) => {
      const depTask = byId.get(depId);
      return depTask && depTask.state === TASK_STATES.ACCEPTED_SOURCE;
    });

    if (!depsMet) {
      continue;
    }

    if (task.state === TASK_STATES.PAUSED_QUOTA) {
      const notBeforeMs = task.not_before ? Date.parse(task.not_before) : Infinity;
      if (Number.isNaN(notBeforeMs) || notBeforeMs > nowMs) {
        quotaSkipped.push(task);
        continue;
      }
    }

    if (task.not_before && Date.parse(task.not_before) > nowMs) {
      quotaSkipped.push(task);
      continue;
    }

    if (task.state !== TASK_STATES.READY) {
      continue;
    }

    if (task.authority === 'owner_approval_required' || task.kind === 'owner_gate') {
      continue;
    }

    eligible.push(task);
  }

  // Sort by priority DESC (default 0), then FIFO queue_index ASC
  eligible.sort((a, b) => {
    const prioA = Number.isFinite(a.priority) ? a.priority : 0;
    const prioB = Number.isFinite(b.priority) ? b.priority : 0;
    if (prioB !== prioA) {
      return prioB - prioA;
    }
    return (a.queue_index ?? 0) - (b.queue_index ?? 0);
  });

  return { eligible, quotaSkipped };
}

export function initializeOrReconcileState(repoRoot, normalizedQueue, nowIso = new Date().toISOString()) {
  const existing = readState(repoRoot);
  const existingTasksById = new Map();

  if (existing && Array.isArray(existing.tasks)) {
    for (const t of existing.tasks) {
      existingTasksById.set(t.task_id, t);
    }
  }

  const reconciledEvents = [];
  const mergedTasks = [];

  for (const qTask of normalizedQueue.tasks) {
    const prev = existingTasksById.get(qTask.task_id);
    if (!prev) {
      const initialState =
        qTask.authority === 'owner_approval_required' || qTask.kind === 'owner_gate'
          ? TASK_STATES.HOLD_OWNER
          : qTask.state || TASK_STATES.READY;
      mergedTasks.push({
        ...qTask,
        state: initialState,
        attempts: 0,
        updated_at: nowIso,
      });
      continue;
    }

    // Preserve ACCEPTED_SOURCE across restarts (replay prevention)
    if (prev.state === TASK_STATES.ACCEPTED_SOURCE) {
      mergedTasks.push({
        ...qTask,
        state: TASK_STATES.ACCEPTED_SOURCE,
        accepted_at: prev.accepted_at || prev.updated_at,
        accepted_digest: prev.accepted_digest || qTask.task_digest,
        attempts: prev.attempts || 1,
        updated_at: prev.updated_at,
      });
      continue;
    }

    // Reconcile interrupted in-flight work (CLAIMED / IMPLEMENTING / TESTING -> NEEDS_RECONCILIATION)
    if (IN_FLIGHT_STATES.has(prev.state)) {
      const reconciledTask = {
        ...qTask,
        ...prev,
        state: TASK_STATES.NEEDS_RECONCILIATION,
        reconciliation_reason: `CRASH_INTERRUPTED_FROM_${prev.state}`,
        updated_at: nowIso,
      };
      mergedTasks.push(reconciledTask);
      reconciledEvents.push({
        type: 'TASK_INTERRUPTED_RECONCILIATION',
        task_id: qTask.task_id,
        from_state: prev.state,
        to_state: TASK_STATES.NEEDS_RECONCILIATION,
        reason: `Process interrupted while in ${prev.state}; operator ACK required.`,
      });
      continue;
    }

    // Preserve other persisted states (NEEDS_RECONCILIATION, FAILED_STOP, PAUSED_QUOTA, HOLD_OWNER, READY)
    mergedTasks.push({
      ...qTask,
      ...prev,
      queue_index: qTask.queue_index,
      task_digest: qTask.task_digest,
    });
  }

  const nextState = {
    schema_version: 1,
    program_id: normalizedQueue.program_id || 'LARI-PROGRAM-20261021',
    base_sha: normalizedQueue.base_sha,
    runner_mode: 'OFFLINE_CANARY',
    agent_adapter_status: 'UNVERIFIED_SAFE_OFF',
    updated_at: nowIso,
    suppressed_duplicates: normalizedQueue.suppressedDuplicates || [],
    tasks: mergedTasks,
  };

  writeStateAtomic(repoRoot, nextState);

  if (!existing) {
    appendEventReceipt(repoRoot, {
      type: 'RUNTIME_INITIALIZED',
      base_sha: normalizedQueue.base_sha,
      task_count: mergedTasks.length,
    });
  }

  for (const dup of normalizedQueue.suppressedDuplicates || []) {
    appendEventReceipt(repoRoot, {
      type: 'DUPLICATE_TASK_SUPPRESSED',
      task_id: dup.task_id,
      duplicate_index: dup.duplicate_index,
    });
  }

  for (const evt of reconciledEvents) {
    appendEventReceipt(repoRoot, evt);
  }

  return { state: nextState, reconciledEvents };
}

function transitionTaskState(repoRoot, stateObj, taskId, toState, extra = {}) {
  const nowIso = new Date().toISOString();
  const idx = stateObj.tasks.findIndex((t) => t.task_id === taskId);
  if (idx === -1) {
    throw new Error(`Task not found for transition: ${taskId}`);
  }
  const prev = stateObj.tasks[idx];
  const fromState = prev.state;

  const updatedTask = {
    ...prev,
    ...extra,
    state: toState,
    updated_at: nowIso,
  };
  stateObj.tasks[idx] = updatedTask;
  stateObj.updated_at = nowIso;

  writeStateAtomic(repoRoot, stateObj);
  appendEventReceipt(repoRoot, {
    type: 'TASK_STATE_TRANSITION',
    task_id: taskId,
    from_state: fromState,
    to_state: toState,
    task_digest: updatedTask.task_digest,
    ...extra,
  });

  return updatedTask;
}

export async function runOnce(repoRoot, options = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();

  const driftCheck = verifySourceDrift(resolvedRoot, options);
  if (!driftCheck.ok) {
    if (options.recordDriftReceipt !== false && fs.existsSync(resolvedRoot)) {
      appendEventReceipt(resolvedRoot, {
        type: 'SOURCE_DRIFT_HOLD',
        status: 'HOLD_SOURCE_DRIFT',
        reason: driftCheck.reason,
      });
    }
    return {
      status: 'HOLD_SOURCE_DRIFT',
      reason: driftCheck.reason,
      claimed: false,
      remote_effects: 0,
    };
  }

  const dagCheck = validateQueueAndDag(driftCheck.queue, {
    rejectDuplicatesStrict: Boolean(options.rejectDuplicatesStrict),
  });
  if (!dagCheck.valid) {
    appendEventReceipt(resolvedRoot, {
      type: 'QUEUE_VALIDATION_FAILED',
      reason: dagCheck.reason,
    });
    return {
      status: 'FAILED_STOP',
      reason: dagCheck.reason,
      claimed: false,
      remote_effects: 0,
    };
  }

  const lock = acquireExclusiveLock(resolvedRoot, {
    instanceId: options.instanceId,
  });
  if (!lock.acquired) {
    return {
      status: 'LOCK_HELD',
      code: lock.code,
      claimed: false,
      remote_effects: 0,
    };
  }

  try {
    const { state, reconciledEvents } = initializeOrReconcileState(resolvedRoot, {
      ...driftCheck.queue,
      tasks: dagCheck.tasks,
      suppressedDuplicates: dagCheck.suppressedDuplicates,
    });

    const { eligible, quotaSkipped } = selectEligibleTasks(state.tasks, nowMs);

    for (const qTask of quotaSkipped) {
      appendEventReceipt(resolvedRoot, {
        type: 'QUOTA_PAUSE_SKIPPED',
        task_id: qTask.task_id,
        state: TASK_STATES.PAUSED_QUOTA,
        not_before: qTask.not_before || null,
        provider_called: false,
      });
    }

    if (eligible.length === 0) {
      return {
        status: quotaSkipped.length > 0 ? TASK_STATES.PAUSED_QUOTA : 'NO_ELIGIBLE_TASKS',
        claimed: false,
        reconciled_count: reconciledEvents.length,
        quota_skipped_count: quotaSkipped.length,
        remote_effects: 0,
      };
    }

    const candidate = eligible[0];

    // Evaluate authority & risk guards before executing
    const authEval = evaluateTaskAuthority(candidate);
    if (!authEval.allowed) {
      transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.CLAIMED, {
        claimed_by: lock.instanceId,
      });
      transitionTaskState(resolvedRoot, state, candidate.task_id, authEval.terminalState, {
        failure_reason: authEval.reason,
      });
      return {
        status: authEval.terminalState,
        task_id: candidate.task_id,
        reason: authEval.reason,
        claimed: true,
        remote_effects: 0,
      };
    }

    // Check if task is native QA or requires agent adapter
    if (!NATIVE_QA_KINDS.has(candidate.kind)) {
      const agentRes = await runAgentAdapter(candidate, {
        agentAdapter: options.agentAdapter,
        env: options.env,
      });

      if (agentRes.status === 'HOLD_AGENT_ADAPTER_UNVERIFIED') {
        appendEventReceipt(resolvedRoot, {
          type: 'AGENT_ADAPTER_HOLD',
          task_id: candidate.task_id,
          kind: candidate.kind,
          status: 'HOLD_AGENT_ADAPTER_UNVERIFIED',
          reason: agentRes.reason,
          remote_effects: 0,
        });
        return {
          status: 'HOLD_AGENT_ADAPTER_UNVERIFIED',
          task_id: candidate.task_id,
          reason: agentRes.reason,
          claimed: false,
          remote_effects: 0,
        };
      }

      if (agentRes.status === 'FAILED_STOP') {
        transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.CLAIMED, {
          claimed_by: lock.instanceId,
        });
        transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.FAILED_STOP, {
          failure_reason: agentRes.reason,
        });
        return {
          status: TASK_STATES.FAILED_STOP,
          task_id: candidate.task_id,
          reason: agentRes.reason,
          claimed: true,
          remote_effects: 0,
        };
      }
    }

    // Execute Native QA flow: READY -> CLAIMED -> IMPLEMENTING -> TESTING
    transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.CLAIMED, {
      claimed_by: lock.instanceId,
    });

    if (typeof options.onAfterClaim === 'function') {
      await options.onAfterClaim(candidate, state);
    }

    transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.IMPLEMENTING, {
      claimed_by: lock.instanceId,
    });

    transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.TESTING, {
      claimed_by: lock.instanceId,
    });

    // At most 1 automatic retry attempt on transient failure
    const maxAttempts = 2;
    let attempts = 0;
    let lastResult = null;

    while (attempts < maxAttempts) {
      attempts += 1;
      lastResult = await runNativeQaAdapter(candidate, {
        repoRoot: resolvedRoot,
        timeoutMs: options.timeoutMs,
        spawnOverride: options.spawnOverride,
      });

      appendEventReceipt(resolvedRoot, {
        type: 'TASK_TEST_ATTEMPT',
        task_id: candidate.task_id,
        attempt: attempts,
        status: lastResult.status,
        exit_code: lastResult.exit_code,
        reason: lastResult.reason,
        remote_effects: 0,
      });

      if (lastResult.status === 'PASSED') {
        break;
      }
      if (lastResult.status === 'FAILED_STOP') {
        break;
      }
    }

    if (lastResult && lastResult.status === 'PASSED') {
      transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.ACCEPTED_SOURCE, {
        attempts,
        exit_code: 0,
        accepted_at: new Date().toISOString(),
        accepted_digest: candidate.task_digest,
        remote_effects: 0,
      });
      return {
        status: TASK_STATES.ACCEPTED_SOURCE,
        task_id: candidate.task_id,
        exit_code: 0,
        attempts,
        claimed: true,
        remote_effects: 0,
      };
    }

    transitionTaskState(resolvedRoot, state, candidate.task_id, TASK_STATES.FAILED_STOP, {
      attempts,
      exit_code: lastResult?.exit_code ?? 1,
      failure_reason: lastResult?.reason || 'TEST_FAILED_AFTER_RETRY',
      remote_effects: 0,
    });

    return {
      status: TASK_STATES.FAILED_STOP,
      task_id: candidate.task_id,
      exit_code: lastResult?.exit_code ?? 1,
      reason: lastResult?.reason || 'TEST_FAILED_AFTER_RETRY',
      attempts,
      claimed: true,
      remote_effects: 0,
    };
  } finally {
    lock.release();
  }
}

export function getStatusNonMutating(repoRoot, options = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const paths = getRuntimePaths(resolvedRoot);
  const driftCheck = verifySourceDrift(resolvedRoot, options);

  if (!driftCheck.ok) {
    return {
      ok: false,
      status: 'HOLD_SOURCE_DRIFT',
      reason: driftCheck.reason,
      runner_mode: 'OFFLINE_CANARY',
      agent_adapter: 'UNVERIFIED_SAFE_OFF',
      runtime_initialized: fs.existsSync(paths.stateFile),
    };
  }

  const dagCheck = validateQueueAndDag(driftCheck.queue);
  const persistedState = readState(resolvedRoot);
  const events = readEventReceipts(resolvedRoot);

  const tasksView = (persistedState?.tasks || dagCheck.tasks || []).map((t) => ({
    task_id: t.task_id,
    kind: t.kind,
    state: t.state,
    authority: t.authority,
    risk_class: t.risk_class,
    dependency_ids: t.dependency_ids,
  }));

  const summaryCounts = {};
  for (const t of tasksView) {
    summaryCounts[t.state] = (summaryCounts[t.state] || 0) + 1;
  }

  return {
    ok: dagCheck.valid,
    status: dagCheck.valid ? 'OFFLINE_CANARY_STATUS' : 'QUEUE_INVALID',
    runner_mode: 'OFFLINE_CANARY',
    agent_adapter: 'UNVERIFIED_SAFE_OFF',
    base_sha: driftCheck.base_sha,
    runtime_initialized: Boolean(persistedState),
    lock_active: fs.existsSync(paths.lockFile),
    event_receipt_count: events.length,
    summary_counts: summaryCounts,
    tasks: tasksView,
  };
}

export function acknowledgeReconciliation(repoRoot, taskId, operatorNote = 'OPERATOR_ACK') {
  const resolvedRoot = path.resolve(repoRoot);
  const state = readState(resolvedRoot);
  if (!state || !Array.isArray(state.tasks)) {
    throw new Error('Runtime state not initialized.');
  }
  const task = state.tasks.find((t) => t.task_id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  if (task.state !== TASK_STATES.NEEDS_RECONCILIATION) {
    throw new Error(`Task ${taskId} is not in NEEDS_RECONCILIATION (current: ${task.state})`);
  }
  return transitionTaskState(resolvedRoot, state, taskId, TASK_STATES.READY, {
    reconciled_ack: operatorNote,
    reconciliation_reason: null,
  });
}
