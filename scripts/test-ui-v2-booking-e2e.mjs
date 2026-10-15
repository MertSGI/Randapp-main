import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.UI_V2_E2E_PORT || 4175);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RESULTS_DIR = path.resolve('test-results', 'ui-v2-booking-e2e');
const APPOINTMENTS_KEY = 'lari:tenant_pilot_demo:appointments';
const CONFIRMATION_KEY = 'randapp_booking_confirmation_tenant_pilot_demo';
const TEST_EMAIL = 'ui-v2-booking-e2e@example.test';

function readSourceSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // The local built preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Built preview did not become ready at ${BASE_URL} within ${timeoutMs}ms`);
}

function readAppointments() {
  return JSON.parse(localStorage.getItem('lari:tenant_pilot_demo:appointments') || '[]');
}

async function run() {
  assert.ok(fs.existsSync(path.resolve('dist', 'index.html')), 'dist/index.html must exist; run npm run build first');
  assert.equal(process.env.VITE_DATA_MODE, 'local', 'VITE_DATA_MODE must be local');
  assert.equal(process.env.VITE_PAYMENT_MODE, 'disabled', 'VITE_PAYMENT_MODE must be disabled');
  assert.equal(process.env.VITE_PAYMENT_PROVIDER, 'disabled', 'VITE_PAYMENT_PROVIDER must be disabled');

  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const sourceSha = readSourceSha();
  const viteCli = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit', shell: false },
  );

  let browser;
  let context;
  let page;
  let traceStarted = false;
  let traceStopped = false;
  const assertions = [];
  const browserErrors = [];
  const forbiddenRequests = [];
  const report = {
    status: 'running',
    sourceSha,
    baseUrl: BASE_URL,
    dataMode: process.env.VITE_DATA_MODE,
    paymentMode: process.env.VITE_PAYMENT_MODE,
    journey: [],
    assertions,
    browserErrors,
    forbiddenRequests,
    persistenceScope: 'localStorage record in the active disposable browser session; the pilot fixture route reseeds demo data on reload',
    evidence: [],
  };

  const check = (name, condition, evidence) => {
    assertions.push({ name, pass: Boolean(condition), evidence });
    assert.ok(condition, `${name}: ${evidence}`);
  };

  const screenshot = async (name) => {
    const target = path.join(RESULTS_DIR, name);
    await page.screenshot({ path: target, fullPage: true });
    report.evidence.push(path.relative(process.cwd(), target).replaceAll('\\', '/'));
  };

  try {
    await waitForServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem('lari_selected_language', 'en');
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;

    page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push({ type: 'pageerror', text: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('dialog', async (dialog) => {
      browserErrors.push({ type: 'unexpected-dialog', text: dialog.message() });
      await dialog.dismiss();
    });
    page.on('request', (request) => {
      const url = request.url();
      if (/\.supabase\.co\//i.test(url) || /iyzico|payment\/checkout/i.test(url)) {
        forbiddenRequests.push({ method: request.method(), url });
      }
    });

    await page.goto(`${BASE_URL}/#/pilot/customer`, { waitUntil: 'networkidle' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    const defaultV2MarkerCount = await page.getByRole('heading', { name: 'Service Offerings' }).count();
    check('V1 remains the default pilot customer view', defaultV2MarkerCount === 0, `V2 marker count: ${defaultV2MarkerCount}`);
    report.journey.push('Opened default /#/pilot/customer and verified V1 remains the default');
    await screenshot('00-v1-default.png');

    await page.goto(`${BASE_URL}/#/pilot/customer?ui=v2`, { waitUntil: 'networkidle' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 15_000 });
    report.journey.push('Opened UI-V2 through the supported ui=v2 hash query flag');
    await screenshot('01-v2-storefront.png');

    const serviceButtons = page.getByRole('button', { name: 'Select', exact: true });
    const serviceCount = await serviceButtons.count();
    check('V2 exposes selectable pilot services', serviceCount > 0, `Selectable service count: ${serviceCount}`);
    const firstServiceButton = serviceButtons.first();
    const selectedServiceName = (await firstServiceButton.locator('xpath=../..').locator('h4').innerText()).trim();
    await firstServiceButton.click();

    const bookingForm = page.getByTestId('public-booking-form');
    await bookingForm.waitFor({ timeout: 15_000 });
    check('V2 service selection opens the shared booking form', await bookingForm.isVisible(), `Selected service: ${selectedServiceName}`);
    report.journey.push(`Selected rendered service "${selectedServiceName}" and opened the shared public booking form`);
    await screenshot('02-shared-booking-form.png');

    const noPreference = bookingForm.getByRole('button', { name: /No Preference/ });
    await noPreference.waitFor({ timeout: 10_000 });
    await noPreference.click();
    await page.locator('input[name="name"]').waitFor({ timeout: 10_000 });
    const detailsText = await bookingForm.innerText();
    const selectedDateTime = detailsText.match(/\d{4}-\d{2}-\d{2}\s*@\s*\d{2}:\d{2}/)?.[0] || '';
    check('UI control selects supported earliest staff and time', Boolean(selectedDateTime), `Rendered selection: ${selectedDateTime || 'missing'}`);
    report.journey.push(`Used the rendered No Preference control; application selected ${selectedDateTime}`);

    await page.locator('input[name="name"]').fill('UI V2 Booking E2E Customer');
    await page.locator('input[name="email"]').fill('invalid-email');
    await page.locator('input[name="tel"]').fill('05550001122');
    await page.locator('input[type="checkbox"][required]').check();

    const appointmentsBeforeInvalid = await page.evaluate(readAppointments);
    await page.getByRole('button', { name: 'Confirm Appointment' }).click();
    const invalidEmailState = await page.locator('input[name="email"]').evaluate((element) => ({
      valid: element.validity.valid,
      validationMessage: element.validationMessage,
    }));
    const appointmentsAfterInvalid = await page.evaluate(readAppointments);
    check('Invalid email is rejected by the real form', !invalidEmailState.valid && Boolean(invalidEmailState.validationMessage), invalidEmailState.validationMessage);
    check('Invalid submission creates no booking', appointmentsAfterInvalid.length === appointmentsBeforeInvalid.length, `Record count remained ${appointmentsAfterInvalid.length}`);
    report.journey.push('Submitted an invalid email and verified native validation plus zero record mutation');
    await screenshot('03-invalid-email-rejected.png');

    await page.locator('input[name="email"]').fill(TEST_EMAIL);
    const appointmentsBeforeSuccess = await page.evaluate(readAppointments);
    await page.getByRole('button', { name: 'Confirm Appointment' }).click();
    await page.getByRole('heading', { name: 'Booking Confirmed!' }).waitFor({ timeout: 20_000 });

    const appointmentsAfterSuccess = await page.evaluate(readAppointments);
    const persistedMatches = appointmentsAfterSuccess.filter((appointment) => appointment.user_email === TEST_EMAIL);
    check('Successful submission creates exactly one local booking', appointmentsAfterSuccess.length === appointmentsBeforeSuccess.length + 1, `Record count ${appointmentsBeforeSuccess.length} -> ${appointmentsAfterSuccess.length}`);
    check('Created booking is persisted under the pilot tenant key', persistedMatches.length === 1, `Matching local records: ${persistedMatches.length}`);

    const persistedBooking = persistedMatches[0];
    check('Persisted booking is confirmed and tenant-isolated', persistedBooking.status === 'confirmed' && persistedBooking.tenantId === 'tenant_pilot_demo', `status=${persistedBooking.status}; tenantId=${persistedBooking.tenantId}`);
    const confirmation = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || 'null'), CONFIRMATION_KEY);
    check('Rendered success state is bound to the persisted booking', confirmation?.appointmentId === persistedBooking.id, `confirmation=${confirmation?.appointmentId}; booking=${persistedBooking.id}`);
    report.journey.push(`Submitted the valid booking and verified persisted appointment ${persistedBooking.id}`);
    report.booking = {
      id: persistedBooking.id,
      tenantId: persistedBooking.tenantId,
      serviceId: persistedBooking.serviceId,
      staffId: persistedBooking.staffId,
      date: persistedBooking.date,
      time: persistedBooking.time,
      status: persistedBooking.status,
    };
    await screenshot('04-booking-confirmed.png');

    check('No remote Supabase or payment request was attempted', forbiddenRequests.length === 0, JSON.stringify(forbiddenRequests));
    check('No page exception, console error, or unexpected dialog occurred', browserErrors.length === 0, JSON.stringify(browserErrors));

    report.status = 'pass';
    const reportPath = path.join(RESULTS_DIR, 'assertions.json');
    report.evidence.push(path.relative(process.cwd(), reportPath).replaceAll('\\', '/'));
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await context.tracing.stop({ path: path.join(RESULTS_DIR, 'trace.zip') });
    traceStopped = true;
    report.evidence.push('test-results/ui-v2-booking-e2e/trace.zip');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`UI-V2 booking E2E: PASS (${sourceSha})`);
    console.log(`Booking: ${persistedBooking.id} ${persistedBooking.date} ${persistedBooking.time}`);
    console.log(`Evidence: ${RESULTS_DIR}`);
  } catch (error) {
    report.status = 'fail';
    report.error = error instanceof Error ? error.stack || error.message : String(error);
    if (page) {
      try {
        await page.screenshot({ path: path.join(RESULTS_DIR, 'failure.png'), fullPage: true });
        report.evidence.push('test-results/ui-v2-booking-e2e/failure.png');
      } catch {
        // Preserve the original failure.
      }
    }
    fs.writeFileSync(path.join(RESULTS_DIR, 'assertions.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw error;
  } finally {
    if (traceStarted && !traceStopped && context) {
      try {
        await context.tracing.stop({ path: path.join(RESULTS_DIR, 'trace.zip') });
      } catch {
        // Preserve the primary test outcome.
      }
    }
    if (browser) await browser.close();
    server.kill();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
