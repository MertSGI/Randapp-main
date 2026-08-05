// scripts/test-h1e-c-controlled-acceptance-orchestrator.test.mjs
import { runAcceptanceOrchestration } from './test-h1e-c-controlled-acceptance-orchestrator.mjs';

console.log('=== STAGE H1E-C ORCHESTRATOR EXECUTABLE UNIT TESTS ===\n');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, fn) {
  defined++;
  executed++;
  try {
    fn();
    passed++;
    console.log(`  ✅ PASS: ${title}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ FAIL: ${title} - ${err.message}`);
  }
}

async function runTests() {
  // 1. Missing confirmation fails closed
  await check('1. Missing confirmation fails closed', async () => {
    const res = await runAcceptanceOrchestration({ confirmation: null, logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_ORCHESTRATOR_CONFIRMATION_REQUIRED') {
      throw new Error('Unexpected result for missing confirmation');
    }
  });

  // 2. Missing credentials fails closed
  await check('2. Missing credentials fails closed', async () => {
    const res = await runAcceptanceOrchestration({
      confirmation: 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE',
      env: {},
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CREDENTIALS_REQUIRED') {
      throw new Error('Unexpected result for missing credentials');
    }
  });

  // 3. Valid preflight passes
  await check('3. Valid preflight passes', async () => {
    const res = await runAcceptanceOrchestration({
      confirmation: 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE',
      env: { VITE_SUPABASE_URL: 'http://test.co', VITE_SUPABASE_ANON_KEY: 'anon' },
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0 || !res.runId.startsWith('h1e_c_orchestration_run_')) {
      throw new Error('Valid orchestrator preflight failed');
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
