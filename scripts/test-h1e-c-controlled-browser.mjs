// scripts/test-h1e-c-controlled-browser.mjs
export async function runControlledBrowserAcceptance({
  confirmation = process.env.LARI_H1E_C_BROWSER_CONFIRMATION,
  checkpoint = process.env.LARI_H1E_C_BROWSER_CHECKPOINT,
  runId = process.env.LARI_H1E_C_RUN_ID,
  baseUrl = process.env.LARI_H1E_C_UI_BASE_URL,
  dedicatedSlug = process.env.LARI_H1E_C_DEDICATED_SLUG,
  chromiumImpl = null,
  logger = console
} = {}) {
  const print = (msg = '') => logger.log(msg);

  if (confirmation !== 'I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY') {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_CONFIRMATION_REQUIRED');
    print('⚠️ STAGE_H1E_C_NOT_YET_GO');
    print('⚠️ PRODUCTION_NO_GO\n');
    print('Environment variable LARI_H1E_C_BROWSER_CONFIRMATION must be explicitly set to:');
    print('  I_UNDERSTAND_THE_RELEASE_PHASE_IS_CONTROLLED_EXTERNALLY');
    print('\nNo browser instance launched, no network request executed.');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_CONFIRMATION_REQUIRED' };
  }

  if (!runId || runId.trim() === '') {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_RUN_ID_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_RUN_ID_REQUIRED' };
  }

  if (!baseUrl || baseUrl.trim() === '') {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_BASE_URL_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_BASE_URL_REQUIRED' };
  }

  if (!dedicatedSlug || dedicatedSlug.trim() === '') {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_DEDICATED_SLUG_REQUIRED');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_DEDICATED_SLUG_REQUIRED' };
  }

  const validCheckpoints = ['authorized_paymentless_pilot', 'revoked_paymentless_pilot', 'restored_pre_pilot'];
  if (!checkpoint || !validCheckpoints.includes(checkpoint)) {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_CHECKPOINT_INVALID');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_CHECKPOINT_INVALID' };
  }

  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const targetUrl = `${cleanBase}/#/${dedicatedSlug}`;

  print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===');
  print('Run ID: ' + runId);
  print('Checkpoint: ' + checkpoint);
  print('Dedicated Slug: ' + dedicatedSlug);
  print('Target URL: ' + targetUrl);

  let defined = 14; // 7 per viewport (desktop & mobile)
  let executed = 0;
  let passed = 0;
  let failed = 0;

  let appointmentSubmissionsAttempted = 0;
  let paymentRequestsAttempted = 0;
  let checkoutRequestsAttempted = 0;

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 375, height: 667 }
  ];

  let playwright;
  try {
    playwright = chromiumImpl || (await import('playwright')).chromium;
  } catch (e) {
    print('⚠️ Playwright not available for browser execution');
    return { ok: false, exitCode: 1, reason: 'PLAYWRIGHT_UNAVAILABLE' };
  }

  const browser = await playwright.launch({ headless: true });

  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      let consoleErrors = 0;
      let networkFailures = 0;

      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors++;
      });

      page.on('request', req => {
        const url = req.url();
        const method = req.method();

        if (url.includes('create_public_booking') || (url.includes('/appointments') && method === 'POST')) {
          appointmentSubmissionsAttempted++;
        }
        if (url.includes('/payment') || url.includes('/iyzico')) {
          paymentRequestsAttempted++;
        }
        if (url.includes('/checkout')) {
          checkoutRequestsAttempted++;
        }
      });

      page.on('requestfailed', () => {
        networkFailures++;
      });

      await page.goto(targetUrl, { waitUntil: 'networkidle' });

      // 1. State Assertion using stable testids
      executed++;
      const isReadyVisible = await page.isVisible('[data-testid="public-booking-ready"]').catch(() => false);
      const isBlockedVisible = await page.isVisible('[data-testid="public-booking-blocked"]').catch(() => false);

      let stateOk = false;
      if (checkpoint === 'authorized_paymentless_pilot') {
        stateOk = isReadyVisible && !isBlockedVisible;
      } else {
        stateOk = isBlockedVisible && !isReadyVisible;
      }

      if (stateOk) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] UI boundary state matches checkpoint '${checkpoint}'`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] UI boundary state mismatch (ready=${isReadyVisible}, blocked=${isBlockedVisible})`);
      }

      // 2. Form Actionability Assertion
      executed++;
      let actionabilityOk = false;
      if (checkpoint === 'authorized_paymentless_pilot') {
        // Must contain visible booking boundary
        const hasForm = await page.isVisible('form, button, select, [data-testid="public-booking-ready"]').catch(() => false);
        actionabilityOk = hasForm;
      } else {
        // Must be absent or disabled
        const isFormPresent = await page.isVisible('form').catch(() => false);
        actionabilityOk = !isFormPresent || isBlockedVisible;
      }

      if (actionabilityOk) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Form actionability assertion verified`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Form actionability assertion failed`);
      }

      // 3. Sensitive Internal Reason Code Exposure Assertion
      executed++;
      const bodyText = await page.innerText('body').catch(() => '');
      const sensitiveExposed = bodyText.includes('PILOT_AUTHORIZATION') || bodyText.includes('GLOBAL_RELEASE_PHASE');
      if (!sensitiveExposed) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero sensitive internal reason codes exposed`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Sensitive internal reason codes exposed in UI`);
      }

      // 4. Console Errors
      executed++;
      if (consoleErrors === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero console errors detected`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] ${consoleErrors} console errors detected`);
      }

      // 5. Network Failures
      executed++;
      if (networkFailures === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero failed application requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] ${networkFailures} failed network requests`);
      }

      // 6. Forbidden Appointment Submissions
      executed++;
      if (appointmentSubmissionsAttempted === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero appointment submission requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Forbidden appointment submission request detected`);
      }

      // 7. Forbidden Payment/Checkout Requests
      executed++;
      if (paymentRequestsAttempted === 0 && checkoutRequestsAttempted === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero payment/checkout requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Forbidden payment/checkout request detected`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const isOk = executed === defined && passed === defined && failed === 0 && appointmentSubmissionsAttempted === 0 && paymentRequestsAttempted === 0 && checkoutRequestsAttempted === 0;
  const exitCode = isOk ? 0 : 1;

  print(`Final exit code: ${exitCode}`);
  return {
    ok: isOk,
    exitCode,
    runId,
    checkpoint,
    dedicatedSlug,
    targetUrl,
    accounting: {
      defined, executed, passed, failed,
      appointmentSubmissionsAttempted, paymentRequestsAttempted, checkoutRequestsAttempted
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-browser.mjs')) {
  runControlledBrowserAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
