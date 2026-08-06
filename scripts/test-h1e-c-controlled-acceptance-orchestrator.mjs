// scripts/test-h1e-c-controlled-acceptance-orchestrator.mjs
import { runH1ECredentialedAcceptance } from './test-h1e-c-credentialed-runner.mjs';
import { runControlledBrowserAcceptance } from './test-h1e-c-controlled-browser.mjs';

export async function runAcceptanceOrchestration({
  confirmation = process.env.LARI_H1E_C_ORCHESTRATOR_CONFIRMATION,
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

  print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===');
  const checkpointsExecuted = [];

  const checkpointHandler = async ({ runId, checkpoint, dedicatedSlug }) => {
    checkpointsExecuted.push(checkpoint);
    print(`\n🌐 [Orchestrator] Triggering Browser Harness Checkpoint '${checkpoint}' for Run ID ${runId}...`);
    const res = await browserImpl({
      confirmation: env.LARI_H1E_C_BROWSER_CONFIRMATION || 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      checkpoint,
      runId,
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
    env: {
      ...env,
      LARI_H1E_C_CONTROLLED_CONFIRMATION: env.LARI_H1E_C_CONTROLLED_CONFIRMATION || 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL',
      LARI_H1E_C_EXPECTED_INITIAL_PHASE: env.LARI_H1E_C_EXPECTED_INITIAL_PHASE || 'pre_pilot'
    },
    fetchImpl,
    logger,
    now,
    checkpointHandler
  });

  const expectedSequence = ['authorized_paymentless_pilot', 'revoked_paymentless_pilot', 'restored_pre_pilot'];
  const sequenceOk = checkpointsExecuted.length === 3 && checkpointsExecuted.every((cp, i) => cp === expectedSequence[i]);

  if (!runnerRes || !runnerRes.ok || !sequenceOk) {
    print('\n⚠️ STAGE H1E-C ORCHESTRATION FAILED');
    print(`Sequence Verified: ${sequenceOk}`);
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'ORCHESTRATION_FAILED', runnerRes, checkpointsExecuted };
  }

  print('\n✅ STAGE H1E-C CONTROLLED ORCHESTRATION COMPLETE');
  print('Final exit code: 0');
  return { ok: true, exitCode: 0, runnerRes, checkpointsExecuted };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-acceptance-orchestrator.mjs')) {
  runAcceptanceOrchestration().then(res => {
    process.exitCode = res.exitCode;
  });
}
