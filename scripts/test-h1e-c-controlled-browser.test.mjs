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

function createMockChromium(options = {}) {
  const isReadyVisible = options.isReadyVisible !== false;
  const isBlockedVisible = options.isBlockedVisible === true;
  const isStartVisible = options.isStartVisible !== false;
  const isStartEnabled = options.isStartEnabled !== false;
  const formRevealsOnStart = options.formRevealsOnStart !== false;
  const hasActionableControl = options.hasActionableControl !== false;
  const bodyText = options.bodyText || 'Standard page text';
  const consoleErrors = options.consoleErrors || 0;
  const networkFailures = options.networkFailures || 0;
  const mockSubmissions = options.mockSubmissions || 0;
  const mockPayments = options.mockPayments || 0;
  const mockCheckouts = options.mockCheckouts || 0;

  return {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => {
          let formVisibleState = false;

          return {
            on: (event, cb) => {
              if (event === 'console' && consoleErrors > 0) {
                for (let i = 0; i < consoleErrors; i++) cb({ type: () => 'error' });
              }
              if (event === 'requestfailed' && networkFailures > 0) {
                for (let i = 0; i < networkFailures; i++) cb();
              }
              if (event === 'request') {
                if (mockSubmissions > 0) {
                  for (let i = 0; i < mockSubmissions; i++) cb({ url: () => '/create_public_booking', method: () => 'POST' });
                }
                if (mockPayments > 0) {
                  for (let i = 0; i < mockPayments; i++) cb({ url: () => '/payment', method: () => 'POST' });
                }
                if (mockCheckouts > 0) {
                  for (let i = 0; i < mockCheckouts; i++) cb({ url: () => '/checkout', method: () => 'POST' });
                }
              }
            },
            goto: async () => {},
            isVisible: async (selector) => {
              if (selector.includes('ready')) return isReadyVisible;
              if (selector.includes('blocked')) return isBlockedVisible;
              if (selector.includes('start')) return isStartVisible;
              if (selector.includes('form')) return formVisibleState;
              return false;
            },
            isEnabled: async (selector) => {
              if (selector.includes('start')) return isStartEnabled;
              return true;
            },
            click: async (selector) => {
              if (selector.includes('start') && formRevealsOnStart) {
                formVisibleState = true;
              }
            },
            waitForSelector: async (selector) => {
              if (selector.includes('form') && formRevealsOnStart) {
                formVisibleState = true;
              } else if (!formRevealsOnStart) {
                throw new Error('Timeout waiting for form');
              }
            },
            evaluate: async (fn) => {
              if (!formVisibleState) return false;
              return hasActionableControl;
            },
            innerText: async () => bodyText
          };
        },
        close: async () => {}
      }),
      close: async () => {}
    })
  };
}

async function runTests() {
  // Self-test for async rejection detection
  await check('Self-Test: Async rejection detection', async () => {
    let innerCaught = false;
    try {
      await (async () => { throw new Error('Expected test error'); })();
    } catch (e) {
      innerCaught = true;
    }
    if (!innerCaught) throw new Error('Async rejection was not caught');
  });

  // 1. Authorized checkpoint starts with ready visible and form absent
  await check('1. Authorized checkpoint starts with ready visible and form absent', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Authorized checkpoint initial state failed');
  });

  // 2. Visible enabled public-booking-start is clicked
  await check('2. Visible enabled public-booking-start is clicked', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, isStartEnabled: true, formRevealsOnStart: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Start button click sequence failed');
  });

  // 3. Form appearing after safe start click passes
  await check('3. Form appearing after safe start click passes', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true, hasActionableControl: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Form revelation failed');
  });

  // 4. Missing public-booking-start fails
  await check('4. Missing public-booking-start fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: false, formRevealsOnStart: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Missing start button did not fail');
  });

  // 5. Disabled public-booking-start fails
  await check('5. Disabled public-booking-start fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, isStartEnabled: false, formRevealsOnStart: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Disabled start button did not fail');
  });

  // 6. Start click that does not reveal form fails
  await check('6. Start click that does not reveal form fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: false });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Start click without form revelation did not fail');
  });

  // 7. Start click that causes an appointment request fails
  await check('7. Start click that causes an appointment request fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true, mockSubmissions: 1 });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Appointment submission attempt did not fail');
  });

  // 8. Start click that causes a payment request fails
  await check('8. Start click that causes a payment request fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true, mockPayments: 1 });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Payment request attempt did not fail');
  });

  // 9. Start click that causes a checkout request fails
  await check('9. Start click that causes a checkout request fails', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true, mockCheckouts: 1 });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Checkout request attempt did not fail');
  });

  // 10. Revoked checkpoint fails when public-booking-start is visible
  await check('10. Revoked checkpoint fails when public-booking-start is visible', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: false, isBlockedVisible: true, isStartVisible: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'revoked_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Revoked checkpoint with visible start button did not fail');
  });

  // 11. Restored checkpoint fails when public-booking-start is visible
  await check('11. Restored checkpoint fails when public-booking-start is visible', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: false, isBlockedVisible: true, isStartVisible: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'restored_pre_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Restored checkpoint with visible start button did not fail');
  });

  // 12. Blocked checkpoint passes when start and form are both absent
  await check('12. Blocked checkpoint passes when start and form are both absent', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: false, isBlockedVisible: true, isStartVisible: false, formRevealsOnStart: false });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'revoked_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 0) throw new Error('Blocked checkpoint without start or form failed');
  });

  // 13. Desktop and mobile independently execute start-boundary sequence
  await check('13. Desktop and mobile independently execute start-boundary sequence', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (!res.viewportResults || res.viewportResults.desktop.defined !== 8 || res.viewportResults.mobile.defined !== 8) {
      throw new Error('Per-viewport test plan total mismatch (expected 8 per viewport)');
    }
  });

  // 14. Sensitive internal reason exposure fails checkpoint
  await check('14. Sensitive internal reason exposure fails checkpoint', async () => {
    const mockChromium = createMockChromium({ isReadyVisible: true, isBlockedVisible: false, isStartVisible: true, formRevealsOnStart: true, bodyText: 'Internal code: PILOT_AUTHORIZATION_REVOKED' });
    const res = await runControlledBrowserAcceptance({
      confirmation: 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY',
      runId: 'run_123',
      baseUrl: 'http://localhost:3000',
      dedicatedSlug: 'test-slug',
      checkpoint: 'authorized_paymentless_pilot',
      chromiumImpl: mockChromium,
      logger: { log: () => {} }
    });
    if (res.exitCode !== 1) throw new Error('Sensitive text exposure did not fail');
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
