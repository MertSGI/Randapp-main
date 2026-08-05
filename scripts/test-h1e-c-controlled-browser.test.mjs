// scripts/test-h1e-c-controlled-browser.test.mjs
import { runControlledBrowserAcceptance } from './test-h1e-c-controlled-browser.mjs';

console.log('=== STAGE H1E-C BROWSER HARNESS EXECUTABLE UNIT TESTS ===\n');

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
    const res = await runControlledBrowserAcceptance({ confirmation: null });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_CONFIRMATION_REQUIRED') {
      throw new Error('Unexpected result for missing confirmation');
    }
  });

  // 2. Invalid checkpoint fails closed
  await check('2. Invalid checkpoint fails closed', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      checkpoint: 'invalid_checkpoint'
    });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_BROWSER_CHECKPOINT_INVALID') {
      throw new Error('Unexpected result for invalid checkpoint');
    }
  });

  // Mock Chromium Implementation for Unit Tests
  function createMockChromium(mockContent = 'Randevu Al') {
    return {
      launch: async () => ({
        newContext: async () => ({
          newPage: async () => ({
            on: () => {},
            goto: async () => {},
            content: async () => mockContent
          }),
          close: async () => {}
        }),
        close: async () => {}
      })
    };
  }

  // 3. Authorized paymentless pilot checkpoint passes
  await check('3. Authorized paymentless pilot checkpoint passes', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: createMockChromium('Randevu Al Hizmet Seçin'),
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0 || res.accounting.passed !== 6) {
      throw new Error(`Authorized checkpoint failed: passed ${res.accounting.passed}`);
    }
  });

  // 4. Revoked paymentless pilot checkpoint passes
  await check('4. Revoked paymentless pilot checkpoint passes', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      checkpoint: 'revoked_paymentless_pilot',
      chromiumImpl: createMockChromium('Pilot Izni Gerekli Kapalı'),
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0 || res.accounting.passed !== 6) {
      throw new Error(`Revoked checkpoint failed: passed ${res.accounting.passed}`);
    }
  });

  // 5. Restored pre_pilot checkpoint passes
  await check('5. Restored pre_pilot checkpoint passes', async () => {
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      checkpoint: 'restored_pre_pilot',
      chromiumImpl: createMockChromium('Sistem Bakımda'),
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0 || res.accounting.passed !== 6) {
      throw new Error(`Restored checkpoint failed: passed ${res.accounting.passed}`);
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
