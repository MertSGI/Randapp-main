// scripts/test-h1e-c-controlled-acceptance-orchestrator.mjs
import { runH1ECredentialedAcceptance } from './test-h1e-c-credentialed-runner.mjs';
import { runControlledBrowserAcceptance } from './test-h1e-c-controlled-browser.mjs';

export async function runAcceptanceOrchestration({
  confirmation = process.env.LARI_H1E_C_ORCHESTRATOR_CONFIRMATION,
  controlledConfirmation = process.env.LARI_H1E_C_CONTROLLED_CONFIRMATION,
  browserConfirmation = process.env.LARI_H1E_C_BROWSER_CONFIRMATION,
  expectedInitialPhase = process.env.LARI_H1E_C_EXPECTED_INITIAL_PHASE,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  runnerImpl = runH1ECredentialedAcceptance,
  browserImpl = runControlledBrowserAcceptance
} = {}) {
  const print = (msg = '') => logger.log(msg);

  if (confirmation !== 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE') {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_ORCHESTRATOR_CONFIRMATION_REQUIRED');
    print('⚠️ STAGE_H1E_C_NOT_YET_GO');
    print('⚠️ PRODUCTION_NO_GO\n');
    print('Environment variable LARI_H1E_C_ORCHESTRATOR_CONFIRMATION must be explicitly set to:');
    print('  I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE');
    print('\nNo mutation executed, no browser launched.');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_ORCHESTRATOR_CONFIRMATION_REQUIRED' };
  }

  if (controlledConfirmation !== 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL') {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_CONTROLLED_CONFIRMATION_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_CONTROLLED_CONFIRMATION_REQUIRED' };
  }

  if (browserConfirmation !== 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY') {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_BROWSER_CONFIRMATION_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_CONFIRMATION_REQUIRED' };
  }

  if (expectedInitialPhase !== 'pre_pilot') {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_EXPECTED_INITIAL_PHASE_INVALID');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_EXPECTED_INITIAL_PHASE_INVALID' };
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const uiBaseUrl = env.LARI_H1E_C_UI_BASE_URL;

  if (!supabaseUrl || !supabaseAnonKey) {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_CREDENTIALS_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_CREDENTIALS_REQUIRED' };
  }

  if (!uiBaseUrl || uiBaseUrl.trim() === '') {
    print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===\n');
    print('⚠️ H1E_C_UI_BASE_URL_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_UI_BASE_URL_REQUIRED' };
  }

  const sharedRunId = 'h1e_c_orchestration_run_' + now();
  print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===');
  print('Shared Run ID: ' + sharedRunId);

  const checkpointsExecuted = [];

  const checkpointHandler = async ({ runId, checkpoint, dedicatedSlug }) => {
    if (runId !== sharedRunId) {
      throw new Error(`Run ID mismatch: expected ${sharedRunId}, got ${runId}`);
    }
    checkpointsExecuted.push(checkpoint);
    print(`\n🌐 [Orchestrator] Triggering Browser Harness Checkpoint '${checkpoint}' for Shared Run ID ${sharedRunId}...`);
    const res = await browserImpl({
      confirmation: browserConfirmation,
      checkpoint,
      runId: sharedRunId,
      baseUrl: uiBaseUrl,
      dedicatedSlug,
      logger
    });
    if (!res || !res.ok) {
      throw new Error(`Browser harness failed at checkpoint '${checkpoint}'`);
    }
    return res;
  };

  const runnerRes = await runnerImpl({
    mode: 'controlled_paymentless_pilot',
    injectedRunId: sharedRunId,
    env: {
      ...env,
      LARI_H1E_C_CONTROLLED_CONFIRMATION: controlledConfirmation,
      LARI_H1E_C_EXPECTED_INITIAL_PHASE: expectedInitialPhase
    },
    fetchImpl,
    logger,
    now,
    checkpointHandler
  });

  const expectedSequence = ['authorized_paymentless_pilot', 'revoked_paymentless_pilot', 'restored_pre_pilot'];
  const sequenceOk = checkpointsExecuted.length === 3 && checkpointsExecuted.every((cp, i) => cp === expectedSequence[i]);
  const runIdMatches = runnerRes && runnerRes.runId === sharedRunId;

  // FINAL ORCHESTRATOR SAFE-STATE GATE
  const safeStateOk = runnerRes &&
    runnerRes.ok &&
    runnerRes.accounting &&
    runnerRes.accounting.finalReleasePhase === 'pre_pilot' &&
    runnerRes.accounting.finalActiveAuthCount === 0 &&
    runnerRes.accounting.cleanupRequired === false &&
    runnerRes.accounting.forbiddenRequestsDetected === 0 &&
    runnerRes.accounting.forbiddenMutationAttempts === 0;

  if (!runnerRes || !runnerRes.ok || !sequenceOk || !runIdMatches || !safeStateOk) {
    print('\n⚠️ STAGE H1E-C ORCHESTRATION FAILED');
    print(`Sequence Verified: ${sequenceOk}`);
    print(`Run ID Matched: ${runIdMatches}`);
    print(`Safe State Verified: ${safeStateOk}`);
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'ORCHESTRATION_FAILED', runnerRes, checkpointsExecuted };
  }

  print('\n✅ STAGE H1E-C CONTROLLED ORCHESTRATION COMPLETE');
  print('Final exit code: 0');
  return { ok: true, exitCode: 0, sharedRunId, runnerRes, checkpointsExecuted };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-acceptance-orchestrator.mjs')) {
  runAcceptanceOrchestration().then(res => {
    process.exitCode = res.exitCode;
  });
}
