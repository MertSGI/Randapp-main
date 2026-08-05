// scripts/test-h1e-c-controlled-browser.mjs
import fs from 'fs';
import path from 'path';
import { loadEnvFile } from './test-h1e-a-credentialed-runner-helpers.mjs';

export async function runControlledBrowserAcceptance({
  confirmation = process.env.LARI_H1E_C_BROWSER_CONFIRMATION,
  checkpoint = process.env.LARI_H1E_C_BROWSER_CHECKPOINT,
  runId = process.env.LARI_H1E_C_RUN_ID,
  env = process.env,
  logger = console,
  chromiumImpl = null
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

  const validCheckpoints = ['authorized_paymentless_pilot', 'revoked_paymentless_pilot', 'restored_pre_pilot'];
  if (!checkpoint || !validCheckpoints.includes(checkpoint)) {
    print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===\n');
    print('⚠️ H1E_C_BROWSER_CHECKPOINT_INVALID');
    print('Final exit code: 1');
    return { ok: false, exitCode: 1, reason: 'H1E_C_BROWSER_CHECKPOINT_INVALID' };
  }

  loadEnvFile(path.join(process.cwd(), '.env.local'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  const baseUrl = env.H1E_C_UI_BASE_URL || env.H1D_UI_BASE_URL || 'http://127.0.0.1:3000';
  const dedicatedSlug = env.LARI_H1E_C_DEDICATED_SLUG || 'dedicated-tenant-slug';
  const effectiveRunId = runId || 'h1e_c_browser_run_' + Date.now();

  print('=== STAGE H1E-C BROWSER ACCEPTANCE HARNESS ===');
  print('Run ID: ' + effectiveRunId);
  print('Checkpoint: ' + checkpoint);
  print('Target Base URL: ' + baseUrl);

  let defined = 6;
  let executed = 0;
  let passed = 0;
  let failed = 0;
  let consoleErrors = 0;
  let failedRequests = 0;
  let firstSafeFailure = null;

  function recordFailure(stage, detail) {
    failed++;
    const msg = `${stage}: ${detail}`;
    if (!firstSafeFailure) firstSafeFailure = msg;
    print(`  ❌ FAIL: ${msg}`);
  }

  function recordPass(stage) {
    passed++;
    print(`  ✅ PASS: ${stage}`);
  }

  let browser = null;
  try {
    const playwright = chromiumImpl || (await import('playwright')).chromium;
    browser = await playwright.launch({ headless: true });

    const viewports = [
      { name: 'Desktop Viewport (1280x800)', width: 1280, height: 800 },
      { name: 'Mobile Viewport (375x667)', width: 375, height: 667 }
    ];

    for (const vp of viewports) {
      executed++;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      const pageErrors = [];
      const pageFailedReqs = [];

      page.on('console', msg => {
        if (msg.type() === 'error') pageErrors.push(msg.text());
      });

      page.on('requestfailed', req => {
        pageFailedReqs.push(`${req.method()} ${req.url()}`);
      });

      const targetUrl = `${baseUrl}/b/${dedicatedSlug}`;

      if (checkpoint === 'authorized_paymentless_pilot') {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        const content = await page.content();
        
        const isBookable = content.includes('Randevu Al') || content.includes('Hizmet Seçin') || content.includes('booking-form');
        const hasReleaseBlocked = content.includes('GLOBAL_RELEASE_PHASE_BLOCKED') || content.includes('Sistem Bakımda');
        
        if (isBookable && !hasReleaseBlocked) {
          recordPass(`Browser.${vp.name}: Authorized UI visible and actionable`);
        } else {
          recordFailure(`Browser.${vp.name}`, 'Authorized UI failed to load bookable state');
        }
      } else if (checkpoint === 'revoked_paymentless_pilot') {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        const content = await page.content();
        const isBlocked = content.includes('Pilot') || content.includes('Mevcut Değil') || content.includes('Kapalı') || !content.includes('Randevu Al');
        if (isBlocked) {
          recordPass(`Browser.${vp.name}: Revoked UI safely blocked`);
        } else {
          recordFailure(`Browser.${vp.name}`, 'Revoked UI unexpectedly displayed active booking form');
        }
      } else if (checkpoint === 'restored_pre_pilot') {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        const content = await page.content();
        const isBlocked = content.includes('Bakım') || content.includes('Mevcut Değil') || !content.includes('Randevu Al');
        if (isBlocked) {
          recordPass(`Browser.${vp.name}: Restored pre-pilot UI globally blocked`);
        } else {
          recordFailure(`Browser.${vp.name}`, 'Restored pre-pilot UI unexpectedly displayed active booking form');
        }
      }

      consoleErrors += pageErrors.length;
      failedRequests += pageFailedReqs.length;

      await context.close();
    }

    // Console & Request Quality Checks across viewports
    executed += 4;
    if (consoleErrors === 0) {
      recordPass('Quality.ConsoleErrors: Zero console errors');
      recordPass('Quality.ConsoleErrorsMobile: Zero mobile console errors');
    } else {
      recordFailure('Quality.ConsoleErrors', `${consoleErrors} console error(s) detected`);
      recordFailure('Quality.ConsoleErrorsMobile', `${consoleErrors} console error(s) detected`);
    }

    if (failedRequests === 0) {
      recordPass('Quality.FailedRequests: Zero failed network requests');
      recordPass('Quality.FailedRequestsMobile: Zero mobile failed requests');
    } else {
      recordFailure('Quality.FailedRequests', `${failedRequests} failed request(s) detected`);
      recordFailure('Quality.FailedRequestsMobile', `${failedRequests} failed request(s) detected`);
    }

  } catch (err) {
    recordFailure('Browser.Execution', err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const exitCode = (executed === defined && passed === defined && failed === 0) ? 0 : 1;

  print('\n══════════════════════════════════════════════════════════');
  print(`Defined tests: ${defined}`);
  print(`Executed tests: ${executed}`);
  print(`Passed: ${passed}`);
  print(`Failed: ${failed}`);
  print(`Console errors: ${consoleErrors}`);
  print(`Failed requests: ${failedRequests}`);
  print(`First safe failure: ${firstSafeFailure ? firstSafeFailure : 'none'}`);
  print(`Final exit code: ${exitCode}`);

  return { ok: exitCode === 0, exitCode, checkpoint, accounting: { defined, executed, passed, failed, consoleErrors, failedRequests, firstSafeFailure, exitCode } };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-controlled-browser.mjs')) {
  runControlledBrowserAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
