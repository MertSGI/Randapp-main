import path from 'path';
import { loadEnvFile } from './test-h1e-a-credentialed-runner-helpers.mjs';
import { runH1ECredentialedAcceptance } from './test-h1e-c-credentialed-runner.mjs';

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

async function main() {
  const mode = process.env.LARI_H1E_C_ACCEPTANCE_MODE || 'pre_pilot_readonly';
  const result = await runH1ECredentialedAcceptance({ mode });
  if (!result.ok && result.reason && result.reason.startsWith('H1E_C_CREDENTIALS_REQUIRED')) {
    console.log('\n⚠️ H1E_C_CREDENTIALS_REQUIRED');
  }
  process.exitCode = result.exitCode;
}

main();
