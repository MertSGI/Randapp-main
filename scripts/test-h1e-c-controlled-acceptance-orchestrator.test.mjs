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

async function runTests() {
  // Harness self-test for async rejection detection
  await check('Self-Test: Async rejection detection', async () => {
    let innerCaught = false;
    try {
      await (async () => { throw new Error('Expected test error'); })();
    } catch (e) {
      innerCaught = true;
    }
    if (!innerCaught) throw new Error('Async rejection was not caught');
  });

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

  // 3. Missing UI base URL fails closed
  await check('3. Missing UI base URL fails closed', async () => {
    const res = await runAcceptanceOrchestration({
      confirmation: 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE',
      env: { VITE_SUPABASE_URL: 'http://test.co', VITE_SUPABASE_ANON_KEY: 'anon' },
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_UI_BASE_URL_REQUIRED') {
      throw new Error('Unexpected result for missing UI base URL');
    }
  });

  // 4. Valid preflight and mocked orchestration passes
  await check('4. Valid preflight and mocked orchestration passes', async () => {
    const mockRunner = async ({ checkpointHandler }) => {
      await checkpointHandler({ runId: 'run_1', checkpoint: 'authorized_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: 'run_1', checkpoint: 'revoked_paymentless_pilot', dedicatedSlug: 's1' });
      await checkpointHandler({ runId: 'run_1', checkpoint: 'restored_pre_pilot', dedicatedSlug: 's1' });
      return { ok: true, exitCode: 0 };
    };
    const mockBrowser = async () => ({ ok: true, exitCode: 0 });

    const res = await runAcceptanceOrchestration({
      confirmation: 'I_UNDERSTAND_THIS_ORCHESTRATES_STAGING_MUTATION_AND_BROWSER_ACCEPTANCE',
      env: { VITE_SUPABASE_URL: 'http://test.co', VITE_SUPABASE_ANON_KEY: 'anon', LARI_H1E_C_UI_BASE_URL: 'http://localhost:3000' },
      logger: { log: () => {} },
      runnerImpl: mockRunner,
      browserImpl: mockBrowser
    });
    if (res.exitCode !== 0 || res.checkpointsExecuted.length !== 3) {
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
