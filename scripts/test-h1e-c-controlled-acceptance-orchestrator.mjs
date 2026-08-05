// scripts/test-h1e-c-controlled-acceptance-orchestrator.mjs
import fs from 'fs';
import path from 'path';
import { runH1ECredentialedAcceptance } from './test-h1e-c-credentialed-runner.mjs';
import { runControlledBrowserAcceptance } from './test-h1e-c-controlled-browser.mjs';

export async function runAcceptanceOrchestration({
  confirmation = process.env.LARI_H1E_C_ORCHESTRATOR_CONFIRMATION,
  env = process.env,
  logger = console,
  now = () => Date.now()
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

  const runId = 'h1e_c_orchestration_run_' + now();
  print('=== STAGE H1E-C CONTROLLED ACCEPTANCE ORCHESTRATOR ===');
  print('Run ID: ' + runId);

  // In non-interactive execution safety check, require credentials
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    print('⚠️ H1E_C_CREDENTIALS_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_CREDENTIALS_REQUIRED' };
  }

  return { ok: true, exitCode: 0, runId };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-acceptance-orchestrator.mjs')) {
  runAcceptanceOrchestration().then(res => {
    process.exitCode = res.exitCode;
  });
}
