import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Ensure isolated local-only test defaults unless explicitly overridden by caller.
process.env.VITE_DATA_MODE = process.env.VITE_DATA_MODE || 'local';
process.env.VITE_PAYMENT_MODE = process.env.VITE_PAYMENT_MODE || 'disabled';
process.env.VITE_PAYMENT_PROVIDER = process.env.VITE_PAYMENT_PROVIDER || 'disabled';
process.env.VITE_LARI_DATA_SOURCE = '';

const RESULTS_DIR = path.resolve('test-results', 'ui-v2-booking-e2e');
const APPOINTMENTS_KEY = 'lari:tenant_pilot_demo:appointments';
const CONFIRMATION_KEY = 'randapp_booking_confirmation_tenant_pilot_demo';
const TEST_EMAIL = 'ui-v2-booking-e2e@example.test';

function readSourceSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local-head';
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 4175;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function readAppointments() {
  return JSON.parse(localStorage.getItem('lari:tenant_pilot_demo:appointments') || '[]');
}

async function run() {
  assert.equal(process.env.VITE_DATA_MODE, 'local', 'VITE_DATA_MODE must be local');
  assert.equal(process.env.VITE_PAYMENT_MODE, 'disabled', 'VITE_PAYMENT_MODE must be disabled');
  assert.equal(process.env.VITE_PAYMENT_PROVIDER, 'disabled', 'VITE_PAYMENT_PROVIDER must be disabled');

  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const sourceSha = readSourceSha();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const viteServer = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.ts'),
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error',
  });
  await viteServer.listen();

  try {
    await fetch(`${baseUrl}/`).then((r) => r.text()).catch(() => '');
    await Promise.allSettled([
      viteServer.transformRequest('/index.css'),
      viteServer.transformRequest('/index.tsx'),
      viteServer.transformRequest('/App.tsx'),
      viteServer.transformRequest('/pages/BookingPage.tsx'),
      viteServer.transformRequest('/components/SalonWebsiteViewV2.tsx'),
    ]);
  } catch {
    // Non-fatal cache warmup.
  }

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
    baseUrl,
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
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem('lari_selected_language', 'en');
      if (!localStorage.getItem('lari:tenant_pilot_demo:staff_services')) {
        localStorage.setItem('lari:tenant_pilot_demo:staff_services', JSON.stringify({
          stf_1: ['srv_1', 'srv_2', 'srv_3'],
          stf_2: ['srv_4', 'srv_5'],
          stf_3: ['srv_1', 'srv_2', 'srv_3'],
          stf_4: ['srv_6', 'srv_7'],
          staff_1: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
          staff_2: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
          staff_3: ['srv_1', 'srv_2', 'srv_3', 'srv_4', 'srv_5'],
        }));
      }
      if (!localStorage.getItem('lari:tenant_pilot_demo:availability_rules')) {
        const staffIds = ['stf_1', 'stf_2', 'stf_3', 'stf_4', 'staff_1', 'staff_2', 'staff_3'];
        const rules = [];
        for (const sid of staffIds) {
          for (let d = 1; d <= 7; d += 1) {
            rules.push({
              id: `rule_seeded_${sid}_${d}`,
              tenantId: 'tenant_pilot_demo',
              staffId: sid,
              weekday: d,
              is_active: true,
              start_time: '09:00:00',
              end_time: '18:00:00',
            });
          }
        }
        localStorage.setItem('lari:tenant_pilot_demo:availability_rules', JSON.stringify(rules));
      }
    });

    // Enforce zero external network dependency during isolated E2E verification.
    await context.route('**/*', (route) => {
      const rawUrl = route.request().url();
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return route.fulfill({ status: 204, body: '' });
      }
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
        return route.continue();
      }
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
        return route.continue();
      }
      if (/\.supabase\.co$/i.test(parsed.hostname) || /iyzico|payment\/checkout/i.test(rawUrl)) {
        forbiddenRequests.push({ method: route.request().method(), url: rawUrl });
        return route.abort();
      }
      if (parsed.hostname === 'fonts.googleapis.com' || parsed.hostname === 'fonts.gstatic.com') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      });
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

    // 1. Default V1 route must remain intact when ?ui=v2 is absent.
    await page.goto(`${baseUrl}/#/pilot/customer`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Popular Services' }).waitFor({ timeout: 15_000 });
    const defaultV2MarkerCount = await page.getByRole('heading', { name: 'Service Offerings' }).count();
    check('V1 remains the default pilot customer view', defaultV2MarkerCount === 0, `V2 marker count: ${defaultV2MarkerCount}`);
    report.journey.push('Opened default /#/pilot/customer and verified V1 remains the default');
    await screenshot('00-v1-default.png');

    // 2. ?ui=v2 in HashRouter activates SalonWebsiteViewV2.
    await page.goto(`${baseUrl}/#/pilot/customer?ui=v2`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 15_000 });
    const serviceButtons = page.getByRole('button', { name: 'Select', exact: true });
    await serviceButtons.first().waitFor({ timeout: 15_000 });
    report.journey.push('Opened UI-V2 through the supported ui=v2 hash query flag');
    await screenshot('01-v2-storefront.png');

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

    // 3. Also verify ?ui=v2 in top-level search string works alongside HashRouter.
    await page.goto(`${baseUrl}/?ui=v2#/pilot/customer`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 15_000 });
    check('Top-level ?ui=v2 query param activates V2 with HashRouter', true, 'Rendered Service Offerings on /?ui=v2#/pilot/customer');
    report.journey.push('Verified /?ui=v2#/pilot/customer also activates UI-V2');

    // 4. Verify direct V1 tenant storefront routes remain intact and independent of Discovery Marketplace.
    await page.goto(`${baseUrl}/#/s/tenant_pilot_demo`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Popular Services' }).waitFor({ timeout: 15_000 });
    const legacySV2Count = await page.getByRole('heading', { name: 'Service Offerings' }).count();
    check(
      'V1 canonical /#/s/:slug storefront (/#/s/tenant_pilot_demo) renders V1 Popular Services with zero V2 leak',
      legacySV2Count === 0,
      `Service Offerings heading count=${legacySV2Count}`
    );
    report.journey.push('Verified canonical /#/s/tenant_pilot_demo V1 storefront and zero Service Offerings leakage');

    await page.goto(`${baseUrl}/#/tenant_pilot_demo`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Popular Services' }).waitFor({ timeout: 15_000 });
    check('V1 direct slug storefront (/#/tenant_pilot_demo) works independently of Discovery Marketplace', true, 'Rendered V1 Popular Services on /#/tenant_pilot_demo');
    report.journey.push('Verified direct /#/tenant_pilot_demo V1 storefront independence');

    await page.goto(`${baseUrl}/#/booking/tenant_pilot_demo?ui=v2`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('public-booking-ready').waitFor({ timeout: 20_000 });
    await page.getByRole('heading', { name: 'Service Offerings' }).waitFor({ timeout: 15_000 });
    check('Direct tenant booking slug with ?ui=v2 (/#/booking/tenant_pilot_demo?ui=v2) renders V2', true, 'Rendered Service Offerings on /#/booking/tenant_pilot_demo?ui=v2');
    report.journey.push('Verified /#/booking/tenant_pilot_demo?ui=v2 renders UI-V2 independently');

    await page.goto(`${baseUrl}/#/discovery/tenant_pilot_demo`, { waitUntil: 'domcontentloaded' });
    const discoveryNode = page.getByTestId('discovery-marketplace-view');
    await discoveryNode.waitFor({ timeout: 15_000 });
    const routeSlugAttr = await discoveryNode.getAttribute('data-discovery-route-slug');
    const failClosedAlert = await page.getByRole('alert').textContent();
    check(
      'Discovery deep-link route (/#/discovery/:tenantSlug) binds tenantSlug via useParams and fails closed in local mode',
      routeSlugAttr === 'tenant_pilot_demo' && Boolean(failClosedAlert?.includes('Supabase')),
      `routeSlug=${routeSlugAttr}; alert=${failClosedAlert?.trim()}`
    );
    report.journey.push('Verified /#/discovery/tenant_pilot_demo route param binding and fail-closed local detail state');

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
    await viteServer.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
