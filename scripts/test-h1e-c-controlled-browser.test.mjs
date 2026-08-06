// scripts/test-h1e-c-controlled-browser.test.mjs
import { runControlledBrowserAcceptance } from './test-h1e-c-controlled-browser.mjs';

console.log('=== STAGE H1E-C BROWSER HARNESS EXECUTABLE UNIT TESTS ===\n');

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
    const res = await runControlledBrowserAcceptance({ confirmation: null, logger: { log: () => {} } });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_CONFIRMATION_REQUIRED') {
      throw new Error('Unexpected result for missing confirmation');
    }
  });

  // 2. Missing Run ID fails closed
  await check('2. Missing Run ID fails closed', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: null,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_RUN_ID_REQUIRED') {
      throw new Error('Unexpected result for missing Run ID');
    }
  });

  // 3. Missing base URL fails closed
  await check('3. Missing base URL fails closed', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: null,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_BASE_URL_REQUIRED') {
      throw new Error('Unexpected result for missing base URL');
    }
  });

  // 4. Missing dedicated slug fails closed
  await check('4. Missing dedicated slug fails closed', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: null,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_DEDICATED_SLUG_REQUIRED') {
      throw new Error('Unexpected result for missing dedicated slug');
    }
  });

  // 5. Invalid checkpoint fails closed
  await check('5. Invalid checkpoint fails closed', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'invalid_checkpoint',
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_CHECKPOINT_INVALID') {
      throw new Error('Unexpected result for invalid checkpoint');
    }
  });

  // 6. Authorized paymentless pilot checkpoint passes
  await check('6. Authorized paymentless pilot checkpoint passes', async () => {
    process.env.NODE_ENV = 'test';
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0 || res.targetUrl !== 'http://localhost:3000/#/test-slug') {
      throw new Error('Authorized checkpoint failed');
    }
  });

  // 7. Revoked paymentless pilot checkpoint passes
  await check('7. Revoked paymentless pilot checkpoint passes', async () => {
    process.env.NODE_ENV = 'test';
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'revoked_paymentless_pilot',
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Revoked checkpoint failed');
  });

  // 8. Restored pre_pilot checkpoint passes
  await check('8. Restored pre_pilot checkpoint passes', async () => {
    process.env.NODE_ENV = 'test';
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'restored_pre_pilot',
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Restored checkpoint failed');
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
