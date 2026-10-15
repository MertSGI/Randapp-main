import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.UI_V2_INTEGRITY_PORT || 4176);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RESULTS_DIR = path.resolve('test-results', 'ui-v2-booking-integrity');
const APPOINTMENTS_KEY = 'lari:tenant_pilot_demo:appointments';
const TENANT_ID = 'tenant_pilot_demo';

function sourceSha() {
  return process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // Built preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Built preview did not become ready at ${BASE_URL}`);
}

function readAppointments() {
  return JSON.parse(localStorage.getItem('lari:tenant_pilot_demo:appointments') || '[]');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function run() {
  assert.ok(fs.existsSync(path.resolve('dist', 'index.html')), 'dist/index.html must exist; run npm run build first');
  assert.equal(process.env.VITE_DATA_MODE, 'local', 'VITE_DATA_MODE must be local');
  assert.equal(process.env.VITE_LAUNCH_MODE, 'local_pre_live', 'VITE_LAUNCH_MODE must be local_pre_live');
  assert.equal(process.env.VITE_PAYMENT_MODE, 'disabled', 'VITE_PAYMENT_MODE must be disabled');
  assert.equal(process.env.VITE_PAYMENT_RUN_MODE, 'local_dry_run', 'VITE_PAYMENT_RUN_MODE must be local_dry_run');
  assert.equal(process.env.VITE_PAYMENT_PROVIDER, 'disabled', 'VITE_PAYMENT_PROVIDER must be disabled');

  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const report = {
    status: 'running',
    sourceSha: sourceSha(),
    baseUrl: BASE_URL,
    environment: {
      VITE_DATA_MODE: process.env.VITE_DATA_MODE,
      VITE_LAUNCH_MODE: process.env.VITE_LAUNCH_MODE,
      VITE_PAYMENT_MODE: process.env.VITE_PAYMENT_MODE,
      VITE_PAYMENT_RUN_MODE: process.env.VITE_PAYMENT_RUN_MODE,
      VITE_PAYMENT_PROVIDER: process.env.VITE_PAYMENT_PROVIDER,
    },
    persistenceScope: 'Disposable browser-context localStorage only; no cross-reload durability claim',
    assertions: [],
    scenarios: [],
    browserErrors: [],
    forbiddenRequests: [],
    expectedDialogs: [],
    bookings: {},
    evidence: [],
  };

  const check = (scenario, name, condition, evidence) => {
    const result = { scenario, name, pass: Boolean(condition), evidence };
    report.assertions.push(result);
    assert.ok(condition, `[${scenario}] ${name}: ${evidence}`);
  };

  const writeReport = () => {
    const reportPath = path.join(RESULTS_DIR, 'assertions.json');
    if (!report.evidence.includes('test-results/ui-v2-booking-integrity/assertions.json')) {
      report.evidence.push('test-results/ui-v2-booking-integrity/assertions.json');
    }
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  };

  const viteCli = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit', shell: false },
  );

  let browser;
  const contexts = [];
  const expectedDialogPatterns = new WeakMap();

  const attachPageObservers = (page, scenario) => {
    page.on('pageerror', (error) => report.browserErrors.push({ scenario, type: 'pageerror', text: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.browserErrors.push({ scenario, type: 'console', text: message.text() });
    });
    page.on('request', (request) => {
      const url = request.url();
      if (/\.supabase\.co\//i.test(url) || /iyzico|payment\/checkout/i.test(url)) {
        report.forbiddenRequests.push({ scenario, method: request.method(), url });
      }
    });
    page.on('dialog', async (dialog) => {
      const pattern = expectedDialogPatterns.get(page);
      if (pattern?.test(dialog.message())) {
        report.expectedDialogs.push({ scenario, type: dialog.type(), text: dialog.message() });
        expectedDialogPatterns.delete(page);
      } else {
        report.browserErrors.push({ scenario, type: 'unexpected-dialog', text: dialog.message() });
      }
      await dialog.dismiss();
    });
  };

  const newContext = async (traceName) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('lari_selected_language', 'en'));
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    contexts.push({ context, traceName, stopped: false });
    return context;
  };

  const screenshot = async (page, name) => {
    const target = path.join(RESULTS_DIR, name);
    await page.screenshot({ path: target, fullPage: true });
    report.evidence.push(path.relative(process.cwd(), target).replaceAll('\\', '/'));
  };

  const openV2Form = async (page, scenario) => {
    await page.goto(`${BASE_URL}/#/pilot/customer?ui=v2`, { waitUntil: 'networkidle' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 15_000 });
    const serviceButtons = page.getByRole('button', { name: 'Select', exact: true });
    check(scenario, 'V2 exposes a selectable pilot service', await serviceButtons.count() > 0, `count=${await serviceButtons.count()}`);
    const selectedServiceName = (await serviceButtons.first().locator('xpath=../..').locator('h4').innerText()).trim();
    await serviceButtons.first().click();
    const form = page.getByTestId('public-booking-form');
    await form.waitFor({ timeout: 15_000 });
    check(scenario, 'V2 service opens the accepted shared booking form', await form.isVisible(), selectedServiceName);
    await form.getByRole('button', { name: /No Preference/ }).click();
    await form.locator('input[name="name"]').waitFor({ timeout: 10_000 });
    const details = await form.innerText();
    const selectedDateTime = details.match(/(\d{4}-\d{2}-\d{2})\s*@\s*(\d{2}:\d{2})/);
    assert.ok(selectedDateTime, `[${scenario}] application did not select a date/time through No Preference`);
    return {
      form,
      selectedServiceName,
      date: selectedDateTime[1],
      time: selectedDateTime[2],
    };
  };

  const fillDetails = async (page, { name, email, phone = '05550001122', requiredConsent = true }) => {
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="tel"]').fill(phone);
    if (requiredConsent) await page.locator('input[type="checkbox"][required]').check();
  };

  try {
    await waitForServer();
    browser = await chromium.launch();

    // Scenarios A, B, E and cross-cutting route/tenant/network assertions.
    const primary = await newContext('primary-trace.zip');
    const page = await primary.newPage();
    attachPageObservers(page, 'primary');

    await page.goto(`${BASE_URL}/#/pilot/customer`, { waitUntil: 'networkidle' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 15_000 });
    check('F', 'V1 remains the default pilot customer route', await page.getByRole('heading', { name: 'Service Offerings' }).count() === 0, page.url());
    await screenshot(page, '01-v1-default.png');

    const primarySelection = await openV2Form(page, 'A/E/F');
    await fillDetails(page, { name: 'Integrity Primary', email: 'invalid-email', requiredConsent: false });
    const submit = page.getByRole('button', { name: 'Confirm Appointment' });
    const beforeValidation = await page.evaluate(readAppointments);

    await submit.click();
    const requiredState = await page.locator('input[type="checkbox"][required]').evaluate((input) => ({
      checked: input.checked,
      valid: input.validity.valid,
      message: input.validationMessage,
    }));
    check('E', 'Required booking consent is enforced by the real form', !requiredState.checked && !requiredState.valid && Boolean(requiredState.message), JSON.stringify(requiredState));
    check('E', 'Missing required consent creates no booking', (await page.evaluate(readAppointments)).length === beforeValidation.length, `count=${beforeValidation.length}`);

    await page.locator('input[type="checkbox"][required]').check();
    await submit.click();
    const emailState = await page.locator('input[name="email"]').evaluate((input) => ({ valid: input.validity.valid, message: input.validationMessage }));
    check('E', 'Invalid email is blocked by the real form', !emailState.valid && Boolean(emailState.message), JSON.stringify(emailState));
    check('E', 'Invalid email creates no booking', (await page.evaluate(readAppointments)).length === beforeValidation.length, `count=${beforeValidation.length}`);

    const optionalConsents = page.locator('input[type="checkbox"]:not([required])');
    const optionalStates = await optionalConsents.evaluateAll((inputs) => inputs.map((input) => input.checked));
    check('E', 'Optional reminder and marketing consents remain optional', optionalStates.every((checked) => !checked), JSON.stringify(optionalStates));

    const primaryEmail = 'booking-integrity-primary@example.test';
    await page.locator('input[name="email"]').fill(primaryEmail);
    const beforeRapidSubmit = await page.evaluate(readAppointments);
    await submit.dblclick({ delay: 5 });
    await page.getByRole('heading', { name: 'Booking Confirmed!' }).waitFor({ timeout: 20_000 });
    const afterRapidSubmit = await page.evaluate(readAppointments);
    const primaryBookings = afterRapidSubmit.filter((appointment) => appointment.user_email === primaryEmail);
    check('A', 'Rapid repeat submit creates exactly one appointment', afterRapidSubmit.length === beforeRapidSubmit.length + 1 && primaryBookings.length === 1, `${beforeRapidSubmit.length} -> ${afterRapidSubmit.length}; matches=${primaryBookings.length}`);
    check('E', 'Valid booking succeeds with optional consents unchecked', primaryBookings.length === 1, primaryEmail);
    const primaryBooking = primaryBookings[0];
    check('F', 'Primary booking remains tenant-isolated', primaryBooking.tenantId === TENANT_ID, `tenantId=${primaryBooking.tenantId}`);
    const primaryConfirmation = await page.evaluate(() => JSON.parse(sessionStorage.getItem('randapp_booking_confirmation_tenant_pilot_demo') || 'null'));
    check('A', 'The sole success confirmation references the stored appointment', primaryConfirmation?.appointmentId === primaryBooking.id, `confirmation=${primaryConfirmation?.appointmentId}; stored=${primaryBooking.id}`);
    check('B', 'Completed booking exposes its staff for ordinary UI replay', Boolean(primaryConfirmation?.selectedStaffName), primaryConfirmation?.selectedStaffName || 'missing');
    report.bookings.primary = {
      id: primaryBooking.id,
      tenantId: primaryBooking.tenantId,
      staffId: primaryBooking.staffId,
      date: primaryBooking.date,
      time: primaryBooking.time,
      initialCount: beforeRapidSubmit.length,
      finalCount: afterRapidSubmit.length,
    };
    await screenshot(page, '02-rapid-submit-single-confirmation.png');

    await page.getByRole('button', { name: 'Book Another Appointment' }).click();
    const clearedConfirmation = await page.evaluate(() => sessionStorage.getItem('randapp_booking_confirmation_tenant_pilot_demo'));
    check('B', 'Ordinary Book Another navigation clears the completed session confirmation', clearedConfirmation === null, `session confirmation=${clearedConfirmation}`);
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Select', exact: true }).first().click();
    await page.getByTestId('public-booking-form').getByRole('button', {
      name: new RegExp(escapeRegExp(primaryConfirmation.selectedStaffName), 'i'),
    }).click();
    const dateInput = page.locator('input[type="date"]');
    await dateInput.waitFor({ timeout: 10_000 });
    await dateInput.fill(primaryBooking.date);
    const replaySlot = page.getByRole('button', { name: primaryBooking.time, exact: true });
    await page.waitForTimeout(750);
    const replaySlotCount = await replaySlot.count();
    const replayBlocked = replaySlotCount === 0 || await replaySlot.isDisabled();
    check('B', 'Completed booking replay is blocked through ordinary UI controls', replayBlocked, `${primaryBooking.date} ${primaryBooking.time} ${replaySlotCount === 0 ? 'absent' : 'disabled'}`);
    check('B', 'Replay attempt creates no duplicate record', (await page.evaluate(readAppointments)).filter((appointment) => appointment.user_email === primaryEmail).length === 1, primaryEmail);
    await screenshot(page, '03-completed-booking-replay-blocked.png');
    report.scenarios.push({ id: 'A', result: 'pass' }, { id: 'B', result: 'pass' }, { id: 'E', result: 'pass' });

    // Scenarios C and D use two pages in one fresh context. They share the local
    // repository like two tabs, while retaining independent form/session state.
    const staleContext = await newContext('stale-slot-trace.zip');
    const winnerPage = await staleContext.newPage();
    const stalePage = await staleContext.newPage();
    attachPageObservers(winnerPage, 'C-winner');
    attachPageObservers(stalePage, 'C-stale');
    const winnerSelection = await openV2Form(winnerPage, 'C-winner');
    const staleSelection = await openV2Form(stalePage, 'C-stale');
    check('C', 'Two ordinary UI sessions selected the same initially available slot', winnerSelection.date === staleSelection.date && winnerSelection.time === staleSelection.time, `winner=${winnerSelection.date} ${winnerSelection.time}; stale=${staleSelection.date} ${staleSelection.time}`);
    await fillDetails(winnerPage, { name: 'Integrity Winner', email: 'booking-integrity-winner@example.test', phone: '05550001123' });
    await fillDetails(stalePage, { name: 'Integrity Recovery', email: 'booking-integrity-recovery@example.test', phone: '05550001124' });

    const beforeConflict = await winnerPage.evaluate(readAppointments);
    await winnerPage.getByRole('button', { name: 'Confirm Appointment' }).click();
    await winnerPage.getByRole('heading', { name: 'Booking Confirmed!' }).waitFor({ timeout: 20_000 });
    const afterWinner = await winnerPage.evaluate(readAppointments);
    check('C', 'Rival booking is created through the authorized local application path', afterWinner.length === beforeConflict.length + 1, `${beforeConflict.length} -> ${afterWinner.length}`);

    expectedDialogPatterns.set(stalePage, /selected slot may no longer be available/i);
    await stalePage.getByRole('button', { name: 'Confirm Appointment' }).click();
    await stalePage.waitForTimeout(750);
    const conflictDialog = report.expectedDialogs.find((entry) => entry.scenario === 'C-stale');
    check('C', 'Stale occupied-slot submission returns an actionable failure', Boolean(conflictDialog), conflictDialog?.text || 'no dialog');
    const afterRejectedStale = await stalePage.evaluate(readAppointments);
    check('C', 'Stale occupied-slot submission creates no second appointment', afterRejectedStale.length === afterWinner.length, `${afterWinner.length} -> ${afterRejectedStale.length}`);
    const staleSubmit = stalePage.getByRole('button', { name: 'Confirm Appointment' });
    check('D', 'Booking control is usable after the supported failure', await staleSubmit.isEnabled(), 'submit enabled after dismissed conflict');
    await screenshot(stalePage, '04-stale-slot-actionable-error-recovered-control.png');

    await stalePage.getByRole('button', { name: 'Change Time' }).click();
    const availableTimes = stalePage.locator('button:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
    await availableTimes.first().waitFor({ timeout: 10_000 });
    const availableTimeLabels = (await availableTimes.allTextContents()).map((label) => label.trim());
    const recoveryTime = availableTimeLabels.find((label) => label !== staleSelection.time);
    check('D', 'Recovery offers another valid UI slot', Boolean(recoveryTime), `stale=${staleSelection.time}; available=${availableTimeLabels.join(',')}`);
    await stalePage.getByRole('button', { name: recoveryTime, exact: true }).click();
    await stalePage.getByRole('button', { name: 'Confirm Appointment' }).click();
    await stalePage.getByRole('heading', { name: 'Booking Confirmed!' }).waitFor({ timeout: 20_000 });
    const afterRecovery = await stalePage.evaluate(readAppointments);
    const recovered = afterRecovery.filter((appointment) => appointment.user_email === 'booking-integrity-recovery@example.test');
    check('D', 'Later valid attempt succeeds after the failed booking', recovered.length === 1 && recovered[0].time === recoveryTime, `matches=${recovered.length}; time=${recovered[0]?.time}`);
    const winner = afterRecovery.find((appointment) => appointment.user_email === 'booking-integrity-winner@example.test');
    report.bookings.staleSlot = {
      winnerId: winner?.id,
      recoveredId: recovered[0]?.id,
      tenantId: recovered[0]?.tenantId,
      staffId: recovered[0]?.staffId,
      occupiedDate: staleSelection.date,
      occupiedTime: staleSelection.time,
      recoveryTime,
      initialCount: beforeConflict.length,
      afterWinnerCount: afterWinner.length,
      afterRejectedCount: afterRejectedStale.length,
      finalCount: afterRecovery.length,
    };
    await screenshot(stalePage, '05-failed-booking-recovery-success.png');
    report.scenarios.push({ id: 'C', result: 'pass' }, { id: 'D', result: 'pass' });

    const tenantLeak = await stalePage.evaluate(() => {
      const matches = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.endsWith(':appointments')) continue;
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        for (const row of rows) {
          if (String(row.user_email || '').startsWith('booking-integrity-')) matches.push({ key, tenantId: row.tenantId });
        }
      }
      return matches;
    });
    check('F', 'Integrity bookings do not leak to another tenant key', tenantLeak.every((row) => row.key === 'lari:tenant_pilot_demo:appointments' && row.tenantId === 'tenant_pilot_demo'), JSON.stringify(tenantLeak));
    check('F', 'No remote Supabase or payment request is attempted', report.forbiddenRequests.length === 0, JSON.stringify(report.forbiddenRequests));
    check('F', 'No page exception, console error, or unexpected dialog occurs', report.browserErrors.length === 0, JSON.stringify(report.browserErrors));

    for (const trace of contexts) {
      const tracePath = path.join(RESULTS_DIR, trace.traceName);
      await trace.context.tracing.stop({ path: tracePath });
      trace.stopped = true;
      report.evidence.push(path.relative(process.cwd(), tracePath).replaceAll('\\', '/'));
    }
    report.status = 'pass';
    writeReport();
    console.log(`UI-V2 booking integrity: PASS (${report.sourceSha})`);
    console.log(`Evidence: ${RESULTS_DIR}`);
  } catch (error) {
    report.status = 'fail';
    report.error = error instanceof Error ? error.stack || error.message : String(error);
    for (const trace of contexts) {
      if (!trace.stopped) {
        try {
          const tracePath = path.join(RESULTS_DIR, trace.traceName);
          await trace.context.tracing.stop({ path: tracePath });
          trace.stopped = true;
          report.evidence.push(path.relative(process.cwd(), tracePath).replaceAll('\\', '/'));
        } catch {
          // Preserve the primary failure.
        }
      }
    }
    writeReport();
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
