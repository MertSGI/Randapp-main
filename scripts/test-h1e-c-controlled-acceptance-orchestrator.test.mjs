// scripts/test-h1e-c-controlled-acceptance-orchestrator.test.mjs
import { runAcceptanceOrchestration } from './test-h1e-c-controlled-acceptance-orchestrator.mjs';

console.log('=== STAGE H1E-C ORCHESTRATOR EXECUTABLE UNIT TESTS ===\n');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

async function check(title, fn) {
  defined++;
  executed++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${title}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ FAIL: ${title} - ${err.message}`);
  }
}

const validEnv = {
  VITE_SUPABASE_URL: 'http://test.co',
  VITE_SUPABASE_ANON_KEY: 'anon',
  LARI_H1E_C_UI_BASE_URL: 'http://localhost:3000'
};

const validConfirmations = {
  confirmation: 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE',
  controlledConfirmation: 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL',
  browserConfirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
  expectedInitialPhase: 'pre_pilot'
};

function createValidBrowserResult(runId, checkpoint, dedicatedSlug = 's1') {
  return {
    ok: true, exitCode: 0, runId, checkpoint, dedicatedSlug,
    viewportResults: {
      desktop: { defined: 7, executed: 7, passed: 7, failed: 0, appointmentSubmissionsAttempted: 0, paymentRequestsAttempted: 0, checkoutRequestsAttempted: 0, consoleErrors: 0, failedRequests: 0 },
      mobile: { defined: 7, executed: 7, passed: 7, failed: 0, appointmentSubmissionsAttempted: 0, paymentRequestsAttempted: 0, checkoutRequestsAttempted: 0, consoleErrors: 0, failedRequests: 0 }
    }
  };
}

function createValidRunnerResult(runId) {
  return {
    ok: true, exitCode: 0, runId,
    accounting: {
      finalReleasePhase: 'pre_pilot', finalActiveAuthCount: 0, cleanupRequired: false,
      forbiddenRequestsDetected: 0, forbiddenMutationAttempts: 0,
      browserCheckpointsAttempted: 3, browserCheckpointsPassed: 3, browserCheckpointsFailed: 0
    },
    finalTransitionEvidence: { success: true, release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false },
    finalPilotEvidence: { success: true, active_authorization_count: 0 }
  };
}

async function runTests() {
  // Self-Test
  await check('Self-Test: Async rejection detection', async () => {
    let innerCaught = false;
    try { await (async () => { throw new Error('Expected test error'); })(); } catch (e) { innerCaught = true; }
    if (!innerCaught) throw new Error('Async rejection was not caught');
  });

  // 1. Missing main confirmation fails closed
  await check('1. Missing main confirmation fails closed', async () => {
    const res = await runAcceptanceOrchestration({ ...validConfirmations, confirmation: null, logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_ORCHESTRATOR_CONFIRMATION_REQUIRED') throw new Error('Failed');
  });

  // 2. Missing controlled confirmation fails closed
  await check('2. Missing controlled confirmation fails closed', async () => {
    const res = await runAcceptanceOrchestration({ ...validConfirmations, controlledConfirmation: null, logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CONTROLLED_CONFIRMATION_REQUIRED') throw new Error('Failed');
  });

  // 3. Missing browser confirmation fails closed
  await check('3. Missing browser confirmation fails closed', async () => {
    const res = await runAcceptanceOrchestration({ ...validConfirmations, browserConfirmation: null, logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_CONFIRMATION_REQUIRED') throw new Error('Failed');
  });

  // 4. Invalid initial phase fails closed
  await check('4. Invalid initial phase fails closed', async () => {
    const res = await runAcceptanceOrchestration({ ...validConfirmations, expectedInitialPhase: 'paymentless_pilot', logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_EXPECTED_INITIAL_PHASE_INVALID') throw new Error('Failed');
  });

  // 5. Shared Run ID mismatch fails orchestration
  await check('5. Shared Run ID mismatch fails orchestration', async () => {
    const mockRunner = async ({ checkpointHandler }) => {
      try {
        await checkpointHandler({ runId: 'wrong_run_id', checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      } catch (e) {
        return { ok: false, exitCode: 1, reason: 'RUN_ID_MISMATCH' };
      }
      return createValidRunnerResult('wrong_run_id');
    };
    const mockBrowser = async () => createValidBrowserResult('wrong_run_id', 'authorized_paymentless_pilot');

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Run ID mismatch passed');
  });

  // 6. Browser res.checkpoint mismatch fails
  await check('6. Browser res.checkpoint mismatch fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      try {
        await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      } catch (e) {
        return { ok: false, exitCode: 1, reason: 'CHECKPOINT_MISMATCH' };
      }
      return createValidRunnerResult(injectedRunId);
    };
    const mockBrowser = async ({ runId }) => createValidBrowserResult(runId, 'wrong_checkpoint');

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Checkpoint mismatch passed');
  });

  // 7. Browser res.dedicatedSlug mismatch fails
  await check('7. Browser res.dedicatedSlug mismatch fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      try {
        await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      } catch (e) {
        return { ok: false, exitCode: 1, reason: 'SLUG_MISMATCH' };
      }
      return createValidRunnerResult(injectedRunId);
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint, 'wrong_slug');

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Slug mismatch passed');
  });

  // 8. Missing viewportResults fails
  await check('8. Missing viewportResults fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      try {
        await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      } catch (e) {
        return { ok: false, exitCode: 1, reason: 'NO_VIEWPORTS' };
      }
      return createValidRunnerResult(injectedRunId);
    };
    const mockBrowser = async ({ runId, checkpoint }) => ({ ok: true, exitCode: 0, runId, checkpoint, dedicatedSlug: 's1' });

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Missing viewports passed');
  });

  // 9. Runner finalTransitionEvidence missing fails
  await check('9. Runner finalTransitionEvidence missing fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      const r = createValidRunnerResult(injectedRunId);
      r.finalTransitionEvidence = null;
      return r;
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint);

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Missing finalTransitionEvidence passed');
  });

  // 10. Runner payment flag true fails
  await check('10. Runner payment flag true fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      const r = createValidRunnerResult(injectedRunId);
      r.finalTransitionEvidence.is_payment_collection_enabled = true;
      return r;
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint);

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Payment flag true passed');
  });

  // 11. Runner finalPilotEvidence missing fails
  await check('11. Runner finalPilotEvidence missing fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      const r = createValidRunnerResult(injectedRunId);
      r.finalPilotEvidence = null;
      return r;
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint);

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Missing finalPilotEvidence passed');
  });

  // 12. Runner active authorization count greater than zero fails
  await check('12. Runner active authorization count greater than zero fails', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      const r = createValidRunnerResult(injectedRunId);
      r.finalPilotEvidence.active_authorization_count = 1;
      return r;
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint);

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 1 || res.reason !== 'ORCHESTRATION_FAILED') throw new Error('Active authorization count > 0 passed');
  });

  // 13. Valid complete orchestration passes
  await check('13. Valid complete orchestration passes', async () => {
    const mockRunner = async ({ injectedRunId, checkpointHandler }) => {
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: injectedRunId, checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      return createValidRunnerResult(injectedRunId);
    };
    const mockBrowser = async ({ runId, checkpoint }) => createValidBrowserResult(runId, checkpoint);

    const res = await runAcceptanceOrchestration({
      ...validConfirmations, env: validEnv, logger: { log: () => {} }, runnerImpl: mockRunner, browserImpl: mockBrowser
    });
    if (res.exitCode !== 0 || res.checkpointsExecuted.length !== 3 || res.browserResults.length !== 3) {
      throw new Error('Valid orchestration failed');
    }
  });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Defined tests: ${defined}`);
  console.log(`Executed tests: ${executed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  const exitCode = (executed === defined && passed === defined && failed === 0) ? 0 : 1;
  console.log(`Final exit code: ${exitCode}`);
  if (exitCode !== 0) process.exit(exitCode);
}

runTests();
