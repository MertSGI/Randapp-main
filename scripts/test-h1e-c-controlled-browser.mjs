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

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 375, height: 667 }
  ];

  const viewportResults = {};

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
      let defined = 8;
      let executed = 0;
      let passed = 0;
      let failed = 0;

      let consoleErrors = 0;
      let failedRequests = 0;
      let appointmentSubmissionsAttempted = 0;
      let paymentRequestsAttempted = 0;
      let checkoutRequestsAttempted = 0;

      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

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
        failedRequests++;
      });

      await page.goto(targetUrl, { waitUntil: 'networkidle' });

      // 1. Initial State Assertion
      executed++;
      const isReadyVisible = await page.isVisible('[data-testid="public-booking-ready"]').catch(() => false);
      const isBlockedVisible = await page.isVisible('[data-testid="public-booking-blocked"]').catch(() => false);
      const isStartVisible = await page.isVisible('[data-testid="public-booking-start"]').catch(() => false);
      const isFormVisibleInitial = await page.isVisible('[data-testid="public-booking-form"]').catch(() => false);

      let stateOk = false;
      if (checkpoint === 'authorized_paymentless_pilot') {
        stateOk = isReadyVisible && !isBlockedVisible && isStartVisible && !isFormVisibleInitial;
      } else {
        stateOk = isBlockedVisible && !isReadyVisible && !isStartVisible && !isFormVisibleInitial;
      }

      if (stateOk) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Initial selector state matches checkpoint '${checkpoint}'`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Initial state mismatch (ready=${isReadyVisible}, blocked=${isBlockedVisible}, start=${isStartVisible}, form=${isFormVisibleInitial})`);
      }

      // 2. Start-Booking Boundary & Form Actionability Contract
      executed++;
      let boundaryOk = false;

      if (checkpoint === 'authorized_paymentless_pilot') {
        // Must click public-booking-start and reveal public-booking-form with enabled interaction control
        if (isStartVisible) {
          const isStartEnabled = await page.isEnabled('[data-testid="public-booking-start"]').catch(() => false);
          if (isStartEnabled) {
            await page.click('[data-testid="public-booking-start"]').catch(() => {});
            await page.waitForSelector('[data-testid="public-booking-form"]', { state: 'visible', timeout: 5000 }).catch(() => {});
            const isFormVisiblePostClick = await page.isVisible('[data-testid="public-booking-form"]').catch(() => false);

            if (isFormVisiblePostClick) {
              const hasInteractiveControl = await page.evaluate(() => {
                const formEl = document.querySelector('[data-testid="public-booking-form"]');
                if (!formEl) return false;
                const controls = Array.from(formEl.querySelectorAll('button, select, input, [role="button"], a[href]'));
                return controls.some(c => !c.disabled && c.getAttribute('aria-disabled') !== 'true');
              }).catch(() => false);
              boundaryOk = hasInteractiveControl;
            }
          }
        }
      } else {
        // Blocked checkpoints require start absent AND form absent
        boundaryOk = !isStartVisible && !isFormVisibleInitial;
      }

      if (boundaryOk) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Booking boundary actionability contract verified`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Booking boundary actionability contract failed`);
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

      // 5. Failed Requests
      executed++;
      if (failedRequests === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero failed application requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] ${failedRequests} failed network requests`);
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

      // 7. Forbidden Payment Requests
      executed++;
      if (paymentRequestsAttempted === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero payment requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Forbidden payment request detected`);
      }

      // 8. Forbidden Checkout Requests
      executed++;
      if (checkoutRequestsAttempted === 0) {
        passed++;
        print(`  ✅ PASS: [${vp.name}] Zero checkout requests`);
      } else {
        failed++;
        print(`  ❌ FAIL: [${vp.name}] Forbidden checkout request detected`);
      }

      await context.close();

      viewportResults[vp.name] = {
        defined, executed, passed, failed,
        consoleErrors, failedRequests,
        appointmentSubmissionsAttempted, paymentRequestsAttempted, checkoutRequestsAttempted
      };
    }
  } finally {
    await browser.close();
  }

  const desktop = viewportResults.desktop || {};
  const mobile = viewportResults.mobile || {};

  const totalDefined = (desktop.defined || 0) + (mobile.defined || 0);
  const totalExecuted = (desktop.executed || 0) + (mobile.executed || 0);
  const totalPassed = (desktop.passed || 0) + (mobile.passed || 0);
  const totalFailed = (desktop.failed || 0) + (mobile.failed || 0);

  const totalAppointment = (desktop.appointmentSubmissionsAttempted || 0) + (mobile.appointmentSubmissionsAttempted || 0);
  const totalPayment = (desktop.paymentRequestsAttempted || 0) + (mobile.paymentRequestsAttempted || 0);
  const totalCheckout = (desktop.checkoutRequestsAttempted || 0) + (mobile.checkoutRequestsAttempted || 0);

  const isOk = totalDefined > 0 &&
    totalExecuted === totalDefined &&
    totalPassed === totalDefined &&
    totalFailed === 0 &&
    desktop.passed === desktop.defined &&
    mobile.passed === mobile.defined &&
    totalAppointment === 0 &&
    totalPayment === 0 &&
    totalCheckout === 0;

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
      defined: totalDefined, executed: totalExecuted, passed: totalPassed, failed: totalFailed,
      appointmentSubmissionsAttempted: totalAppointment,
      paymentRequestsAttempted: totalPayment,
      checkoutRequestsAttempted: totalCheckout
    },
    viewportResults
  };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-browser.mjs')) {
  runControlledBrowserAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
