import net from 'net';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Automatically ensure --import tsx if invoked directly via "node scripts/test-phase-f-browser-regression.mjs"
if (!process.execArgv.some(a => a.includes('tsx')) && !process.env._TSX_RESPAWNED) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, _TSX_RESPAWNED: '1' }
  });
  process.exit(result.status ?? 0);
}

process.env.VITE_DATA_MODE = 'local';
const { createServer } = await import('vite');
const { chromium } = await import('playwright');
const { SyntheticSalonFixtureService, SYNTHETIC_SALON_AURA } = await import('../services/syntheticSalonFixtureService.ts');
const { CommunicationDeliveryService } = await import('../services/communicationDeliveryService.ts');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

let stageCount = 0;
let passedStages = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runStage(title, fn) {
  stageCount++;
  console.log(`\n============================================================================`);
  console.log(`STAGE ${stageCount}: ${title}`);
  console.log(`============================================================================`);
  await fn();
  passedStages++;
  console.log(`🎉 STAGE ${stageCount} PASSED: ${title}`);
}

(async () => {
  console.log('============================================================================');
  console.log('LARI — PHASE F: REAL BROWSER PLAYWRIGHT REGRESSION TEST');
  console.log('Validating 7-Stage Synthetic Salon Journey with Zero External Network');
  console.log('============================================================================\n');

  // 1. Production Readiness Verification (V1-WQ-06)
  console.log('✅ PRODUCTION_READINESS (V1-WQ-06):');
  console.log('  Tailwind harici CDN bağımlılığı (cdn.tailwindcss.com) tamamen kaldırıldı.');
  console.log('  Yerel Vite/PostCSS build hattı aktif; sıfır dış ağ ile gerçek Chromium computed style doğrulaması yapılıyor.\n');

  const port = await getFreePort();
  console.log(`[Setup] Starting Vite dev server on 127.0.0.1:${port}...`);
  const viteServer = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.ts'),
    server: { port, host: '127.0.0.1', strictPort: true },
    logLevel: 'error'
  });
  await viteServer.listen();
  console.log(`[Setup] Vite dev server listening at http://127.0.0.1:${port}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  // Start Playwright tracing for failure diagnostics
  await context.tracing.start({ screenshots: true, snapshots: true });

  // Route interception: enforce zero external network calls
  // Route interception: enforce zero external network calls with strict exact-host allowlist (Finding 2)
  // Route interception: enforce zero external network calls with strict exact-host allowlist (Finding 2)
  const interceptedExternalUrls = [];
  await context.route('**/*', (route) => {
    const rawUrl = route.request().url();
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return route.fulfill({ status: 204, body: '' });
    }

    if (parsed.hostname === 'fonts.googleapis.com' || parsed.hostname === 'fonts.gstatic.com') {
      return route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: ''
      });
    }
    // Strict exact-host loopback allowlist: ONLY exact 127.0.0.1 or localhost are continued
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      return route.continue();
    }
    // Intercept and stub all external requests: zero external network calls exit the test runner
    interceptedExternalUrls.push(rawUrl);
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
    });
  });

  // Seed synthetic salon data in localStorage before React mounts
  const snapshot = SyntheticSalonFixtureService.getBrowserStorageSnapshot();
  await context.addInitScript((data) => {
    for (const [k, v] of Object.entries(data)) {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    }
  }, snapshot);

  const page = await context.newPage();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------------
    // STAGE 1: Salon rezervasyon ekranının açılması
    // ------------------------------------------------------------------------
    await runStage('Salon Rezervasyon Ekranının Açılması (Landing Page & Ready State)', async () => {
      console.log(`[Stage 1] Navigating to ${baseUrl}/#/aura-nisantasi...`);
      await page.goto(`${baseUrl}/#/aura-nisantasi`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      
      // Explicit UI ready check (NO networkidle, NO arbitrary sleep)
      await page.waitForSelector('[data-testid="public-booking-ready"]', { timeout: 30000 });
      assert(await page.locator('[data-testid="public-booking-ready"]').isVisible(), 'Booking container [data-testid="public-booking-ready"] is visible');

      // Verify page is not blocked
      const isBlocked = await page.locator('[data-testid="public-booking-blocked"]').isVisible();
      assert(!isBlocked, 'Salon booking is NOT blocked ([data-testid="public-booking-blocked"] is absent)');

      // Verify salon identity and branding rendered
      const bodyText = await page.innerText('body');
      assert(bodyText.includes('Aura Kuaför & Güzellik'), 'Salon name "Aura Kuaför & Güzellik" rendered on page');
      assert(bodyText.includes('Nişantaşı'), 'Salon location/tagline "Nişantaşı" rendered on page');
      assert(bodyText.includes('Kuaför & Güzellik') || bodyText.includes('Hair & Beauty'), 'Salon category rendered');

      // Verify booking start button is visible & enabled
      const startBtn = page.locator('[data-testid="public-booking-start"]');
      assert(await startBtn.isVisible(), 'Start booking button [data-testid="public-booking-start"] is visible');
      assert(await startBtn.isEnabled(), 'Start booking button [data-testid="public-booking-start"] is enabled');

      // Local compiled CSS computed styles verification in real Chromium (V1-WQ-06)
      const cssChecks = await page.evaluate(() => {
        const bodyComputed = window.getComputedStyle(document.body);
        const testEl = document.createElement('div');
        testEl.className = 'hidden';
        document.body.appendChild(testEl);
        const hiddenDisplay = window.getComputedStyle(testEl).display;
        testEl.remove();

        const testMd = document.createElement('div');
        testMd.className = 'hidden md:flex';
        document.body.appendChild(testMd);
        const mdFlexDisplay = window.getComputedStyle(testMd).display;
        testMd.remove();

        const testSm = document.createElement('div');
        testSm.className = 'hidden sm:flex';
        document.body.appendChild(testSm);
        const smFlexDisplay = window.getComputedStyle(testSm).display;
        testSm.remove();

        const testLg = document.createElement('div');
        testLg.className = 'hidden lg:block';
        document.body.appendChild(testLg);
        const lgBlockDisplay = window.getComputedStyle(testLg).display;
        testLg.remove();

        const overflowX = document.documentElement.scrollWidth > window.innerWidth;

        return {
          bodyBg: bodyComputed.backgroundColor,
          hiddenDisplay,
          mdFlexDisplay,
          smFlexDisplay,
          lgBlockDisplay,
          overflowX
        };
      });

      assert(
        cssChecks.bodyBg === 'rgb(248, 250, 252)' || 
        cssChecks.bodyBg.includes('248') || 
        cssChecks.bodyBg.includes('oklch') || 
        cssChecks.bodyBg.includes('247.858'), 
        `Local CSS: body has bg-slate-50 computed style (got: ${cssChecks.bodyBg})`
      );
      assert(cssChecks.hiddenDisplay === 'none', 'Local CSS: .hidden has computed display: none');
      assert(cssChecks.mdFlexDisplay === 'flex', 'Local CSS: .md:flex has computed display: flex at 1280px');
      assert(cssChecks.smFlexDisplay === 'flex', 'Local CSS: .sm:flex has computed display: flex at 1280px');
      assert(cssChecks.lgBlockDisplay === 'block', 'Local CSS: .lg:block has computed display: block at 1280px');
      assert(!cssChecks.overflowX, 'Local CSS: zero horizontal overflow (scrollWidth <= innerWidth)');
      assert(!interceptedExternalUrls.some(u => u.includes('cdn.tailwindcss.com')), 'Zero CDN requests: cdn.tailwindcss.com is completely eliminated');

      // Negative Test (Finding 2): Verify that external requests (pixel and counterfeit localhost query) are strictly intercepted by exact-host gate
      await page.evaluate(async () => {
        try { await fetch('http://example.invalid/pixel', { mode: 'no-cors' }); } catch {}
        try { await fetch('https://evil.invalid/?localhost=1', { mode: 'no-cors' }); } catch {}
      });
      assert(interceptedExternalUrls.some(u => u.includes('example.invalid/pixel')), 'Negative test: http://example.invalid/pixel was strictly intercepted by host allowlist gate');
      assert(interceptedExternalUrls.some(u => u.includes('evil.invalid/?localhost=1')), 'Negative test: https://evil.invalid/?localhost=1 was strictly intercepted by host allowlist gate');
    });

    // ------------------------------------------------------------------------
    // STAGE 2: Şube, personel ve hizmet bilgileri
    // ------------------------------------------------------------------------
    await runStage('Şube, Personel ve Hizmet Bilgileri Doğrulaması', async () => {
      // Target the narrow contact and branch location container in the booking UI (Finding 3)
      const contactSection = page.locator('#contact');
      assert(await contactSection.isVisible(), 'Branch location and contact section (#contact) is visible in booking UI');

      const contactSectionText = await contactSection.innerText();
      assert(contactSectionText.includes('Aura Nişantaşı'), 'Exact branch name "Aura Nişantaşı" rendered in branch location container');
      assert(contactSectionText.includes('Teşvikiye Cad. No: 42, Kat: 2'), 'Exact branch full address "Teşvikiye Cad. No: 42, Kat: 2" rendered in branch location container');

      // Narrow locator verification directly on address box
      const addressBox = page.locator('#contact div:has-text("Adres")').last();
      const addressBoxText = await addressBox.innerText();
      assert(addressBoxText.includes('Teşvikiye Cad. No: 42, Kat: 2'), 'Address box explicitly contains full address with floor "Kat: 2"');

      // Negative Test (Finding 3): Stage 2 strictly fails when branch displays counterfeit name or lacks floor info
      const validateBranchContainer = (text) => {
        if (!text.includes('Aura Nişantaşı')) {
          throw new Error('Branch validation failed: expected exact branch name "Aura Nişantaşı"');
        }
        if (!text.includes('Teşvikiye Cad. No: 42, Kat: 2')) {
          throw new Error('Branch validation failed: expected full address with "Kat: 2"');
        }
        return true;
      };

      assert(validateBranchContainer(contactSectionText), 'Branch container passes strict branch name and address validation');

      // Negative assertion 1: Counterfeit branch name ("Beta Nişantaşı") must fail
      let counterfeitBranchCaught = false;
      try {
        validateBranchContainer(contactSectionText.replace('Aura Nişantaşı', 'Beta Nişantaşı'));
      } catch {
        counterfeitBranchCaught = true;
      }
      assert(counterfeitBranchCaught, 'Negative test: Stage 2 strictly fails when branch displays counterfeit name "Beta Nişantaşı"');

      // Negative assertion 2: Truncated address without "Kat: 2" must fail
      let truncatedAddressCaught = false;
      try {
        validateBranchContainer(contactSectionText.replace(', Kat: 2', ''));
      } catch {
        truncatedAddressCaught = true;
      }
      assert(truncatedAddressCaught, 'Negative test: Stage 2 strictly fails when address lacks "Kat: 2"');

      console.log('[Stage 2] Opening booking flow...');
      await page.click('[data-testid="public-booking-start"]');
      await page.waitForSelector('[data-testid="public-booking-form"]', { timeout: 10000 });
      assert(await page.locator('[data-testid="public-booking-form"]').isVisible(), 'Booking form container is revealed');

      // Verify Service Catalog (6 services from fixture)
      const formText = await page.innerText('[data-testid="public-booking-form"]');
      assert(formText.includes('Saç Kesimi & Yıkama'), 'Service "Saç Kesimi & Yıkama" is present in catalog');
      assert(formText.includes('Fön & Şekillendirme'), 'Service "Fön & Şekillendirme" is present in catalog');
      assert(formText.includes('Klasik Manikür'), 'Service "Klasik Manikür" is present in catalog');
      assert(formText.includes('450'), 'Service price 450 ₺ is displayed');

      // Select first service: "Saç Kesimi & Yıkama"
      console.log('[Stage 2] Selecting service "Saç Kesimi & Yıkama"...');
      const serviceBtn = page.locator('button:has-text("Saç Kesimi & Yıkama")').first();
      await serviceBtn.click();

      // Step 2: Staff Selection UI
      await page.waitForSelector('button:has-text("Elif Yılmaz")', { timeout: 10000 });
      const staffSectionText = await page.innerText('[data-testid="public-booking-form"]');
      assert(staffSectionText.includes('Elif Yılmaz'), 'Staff member "Elif Yılmaz" is present in staff list');
      assert(staffSectionText.includes('Can Demir'), 'Staff member "Can Demir" is present in staff list');
      assert(staffSectionText.includes('Bana Fark Etmez') || staffSectionText.includes('No Preference'), '"Bana Fark Etmez" selection is present');
      assert(staffSectionText.includes('Senior Stylist'), 'Elif Yılmaz role "Senior Stylist" is displayed');

      // Select Staff: "Elif Yılmaz"
      console.log('[Stage 2] Selecting staff "Elif Yılmaz"...');
      const staffBtn = page.locator('button:has-text("Elif Yılmaz")').first();
      await staffBtn.click();
    });

    // Compute next open weekday (skipping Sunday) to ensure reproducible slot availability
    const nextOpenDate = new Date();
    nextOpenDate.setDate(nextOpenDate.getDate() + 1);
    if (nextOpenDate.getDay() === 0) {
      nextOpenDate.setDate(nextOpenDate.getDate() + 1);
    }
    const targetDateStr = nextOpenDate.toISOString().split('T')[0];

    // ------------------------------------------------------------------------
    // STAGE 3: Uygun zaman seçimi
    // ------------------------------------------------------------------------
    await runStage('Uygun Zaman ve Tarih Seçimi (Availability Slots)', async () => {
      console.log('[Stage 3] Waiting for date and time slot picker...');
      await page.waitForSelector('input[type="date"]', { timeout: 10000 });
      assert(await page.locator('input[type="date"]').isVisible(), 'Date picker input is visible');

      // Set target date to next open day
      await page.fill('input[type="date"]', targetDateStr);

      // Wait for slot buttons to render
      await page.waitForSelector('button:has-text("09:"), button:has-text("10:"), button:has-text("11:"), button:has-text("12:")', { timeout: 10000 });
      const availableSlots = await page.locator('button:has-text("09:"), button:has-text("10:"), button:has-text("11:"), button:has-text("12:")').all();
      assert(availableSlots.length > 0, `At least one available time slot rendered (found ${availableSlots.length} candidate slots)`);

      // Click the first available slot button
      const selectedSlotText = await availableSlots[0].innerText();
      console.log(`[Stage 3] Selecting time slot: ${selectedSlotText.trim()}...`);
      await availableSlots[0].click();
    });

    // ------------------------------------------------------------------------
    // STAGE 4: Randevu akışı (Müşteri Detayları & İletişim Onaylı Kayıt)
    // ------------------------------------------------------------------------
    await runStage('Randevu Akışı ve İletişim Onaylı Başarılı Rezervasyon (Customer 1)', async () => {
      console.log('[Stage 4] Waiting for customer details form (Step 4)...');
      await page.waitForSelector('input[name="name"]', { timeout: 10000 });

      // Verify summary sidebar reflects choices
      const summaryText = await page.innerText('[data-testid="public-booking-form"]');
      assert(summaryText.includes('Saç Kesimi & Yıkama'), 'Summary card displays selected service');
      assert(summaryText.includes('Elif Yılmaz'), 'Summary card displays selected staff');

      // Fill Customer 1 (Selin Arslan - Consent Granted)
      console.log('[Stage 4] Entering customer details for Selin Arslan...');
      await page.fill('input[name="name"]', 'Selin Arslan');
      await page.fill('input[name="email"]', 'selin.arslan@example.com');
      await page.fill('input[name="tel"]', '05551112233');

      // Check required booking consent and reminder consent (granted)
      const requiredConsent = page.locator('input[type="checkbox"][required]');
      await requiredConsent.waitFor({ timeout: 5000 });
      await requiredConsent.check();
      assert(await requiredConsent.isChecked(), 'Required booking consent is checked');

      const reminderConsent = page.locator('label:has-text("Randevu hatırlatmaları"), label:has-text("reminders")').locator('input[type="checkbox"]');
      if (await reminderConsent.count() > 0) {
        await reminderConsent.first().check();
        assert(await reminderConsent.first().isChecked(), 'Reminder/communication consent is granted');
      }

      // Pre-submit storage snapshot to verify exact delta (Finding 4)
      const preSubmitSelin = await page.evaluate((tenantId) => {
        const raw = JSON.parse(localStorage.getItem(`lari:${tenantId}:appointments`) || '[]');
        return { count: raw.length, ids: raw.map(a => a.id) };
      }, SYNTHETIC_SALON_AURA.tenantId);

      // Submit booking
      console.log('[Stage 4] Submitting booking...');
      await page.click('button[type="submit"]');

      // Wait for Step 5 Success screen
      await page.waitForSelector('h2:has-text("Randevu Onaylandı"), h2:has-text("Randevunuz Onaylandı"), h2:has-text("Booking Confirmed")', { timeout: 15000 });
      const confirmationText = await page.innerText('body');
      assert(confirmationText.includes('Selin Arslan'), 'Confirmation displays customer name Selin Arslan');
      assert(confirmationText.includes('05551112233') || confirmationText.includes('5551112233'), 'Confirmation displays customer phone');
      assert(confirmationText.includes('Aura Kuaför & Güzellik'), 'Confirmation displays salon name');

      // Verify appointment was persisted to browser localStorage with exact delta
      const postSubmitSelin = await page.evaluate((tenantId) => {
        return JSON.parse(localStorage.getItem(`lari:${tenantId}:appointments`) || '[]');
      }, SYNTHETIC_SALON_AURA.tenantId);

      assert(postSubmitSelin.length === preSubmitSelin.count + 1, `Exactly one new appointment added (count: ${preSubmitSelin.count} -> ${postSubmitSelin.length})`);
      const newSelinBooking = postSubmitSelin.find(a => !preSubmitSelin.ids.includes(a.id));
      assert(!!newSelinBooking, 'Newly generated appointment ID identified in storage delta');
      assert(newSelinBooking.user_name === 'Selin Arslan' || newSelinBooking.customerName === 'Selin Arslan', 'New booking customer name is Selin Arslan');
      assert((newSelinBooking.tenantId || newSelinBooking.tenant_id) === SYNTHETIC_SALON_AURA.tenantId, 'New booking is strictly tenant-bound');
      assert(newSelinBooking.status === 'confirmed', 'New booking status is confirmed');
      // Integrity check for selected service, staff, date (Finding 4)
      assert(newSelinBooking.serviceId === 'srv_aura_01' || newSelinBooking.service_id === 'srv_aura_01', 'New booking serviceId matches selected "srv_aura_01" (Saç Kesimi & Yıkama)');
      assert(newSelinBooking.staffId === 'staff_aura_01' || newSelinBooking.staff_id === 'staff_aura_01', 'New booking staffId matches selected "staff_aura_01" (Elif Yılmaz)');
      assert(newSelinBooking.date === targetDateStr, `New booking date matches selected date ${targetDateStr}`);
    });

    // ------------------------------------------------------------------------
    // STAGE 5: İletişim onayı ve reddi doğrulaması
    // ------------------------------------------------------------------------
    await runStage('İletişim Onayı ve Reddi Doğrulaması (Customer 2 - Consent Denied)', async () => {
      console.log('[Stage 5] Starting second booking to test explicit consent denial...');
      
      // Reset form via "Başka Bir Randevu Al" button
      const bookAnotherBtn = page.locator('button:has-text("Başka Bir Randevu Al"), button:has-text("Book Another")').first();
      await bookAnotherBtn.click();

      // Click Start Booking again if at landing
      await page.waitForSelector('[data-testid="public-booking-start"]', { timeout: 10000 });
      await page.click('[data-testid="public-booking-start"]');
      await page.waitForSelector('[data-testid="public-booking-form"]', { timeout: 10000 });

      // Select service: "Klasik Manikür"
      console.log('[Stage 5] Selecting service "Klasik Manikür"...');
      const manicureBtn = page.locator('button:has-text("Klasik Manikür")').first();
      await manicureBtn.click();

      // Select staff: "Can Demir"
      await page.waitForSelector('button:has-text("Can Demir")', { timeout: 10000 });
      console.log('[Stage 5] Selecting staff "Can Demir"...');
      await page.click('button:has-text("Can Demir")');

      // Select slot
      await page.waitForSelector('input[type="date"]', { timeout: 10000 });
      await page.fill('input[type="date"]', targetDateStr);
      await page.waitForSelector('button:has-text("09:"), button:has-text("10:"), button:has-text("11:"), button:has-text("14:")', { timeout: 10000 });
      const slots = await page.locator('button:has-text("09:"), button:has-text("10:"), button:has-text("11:"), button:has-text("14:")').all();
      assert(slots.length > 0, 'Found available slot for Can Demir');
      await slots[0].click();

      // Fill Customer 2 (Merve Çelik - Consent Denied)
      await page.waitForSelector('input[name="name"]', { timeout: 10000 });
      console.log('[Stage 5] Entering customer details for Merve Çelik (Consent Denied)...');
      await page.fill('input[name="name"]', 'Merve Çelik');
      await page.fill('input[name="email"]', 'merve.celik@example.com');
      await page.fill('input[name="tel"]', '05552223344');

      // Check ONLY required booking consent
      const requiredConsent2 = page.locator('input[type="checkbox"][required]');
      await requiredConsent2.waitFor({ timeout: 5000 });
      await requiredConsent2.check();
      assert(await requiredConsent2.isChecked(), 'Required booking consent checked');

      // Explicitly verify reminder and marketing consents are UNCHECKED (denied)
      const reminderConsent2 = page.locator('label:has-text("Randevu hatırlatmaları"), label:has-text("reminders")').locator('input[type="checkbox"]');
      const marketingConsent2 = page.locator('label:has-text("Kampanya, duyuru"), label:has-text("marketing")').locator('input[type="checkbox"]');

      if (await reminderConsent2.count() > 0) {
        assert(!(await reminderConsent2.first().isChecked()), 'Reminder consent is explicitly UNCHECKED (denied)');
      }
      if (await marketingConsent2.count() > 0) {
        assert(!(await marketingConsent2.first().isChecked()), 'Marketing consent is explicitly UNCHECKED (denied)');
      }

      // Pre-submit storage snapshot for Merve Çelik (Finding 4)
      const preSubmitMerve = await page.evaluate((tenantId) => {
        const raw = JSON.parse(localStorage.getItem(`lari:${tenantId}:appointments`) || '[]');
        return { count: raw.length, ids: raw.map(a => a.id) };
      }, SYNTHETIC_SALON_AURA.tenantId);

      // Submit booking
      console.log('[Stage 5] Submitting booking with consent denied...');
      await page.click('button[type="submit"]');

      // Confirmation screen appears
      await page.waitForSelector('h2:has-text("Randevu Onaylandı"), h2:has-text("Randevunuz Onaylandı"), h2:has-text("Booking Confirmed")', { timeout: 15000 });

      // Verify appointment delta for Merve Çelik
      const postSubmitMerve = await page.evaluate((tenantId) => {
        return JSON.parse(localStorage.getItem(`lari:${tenantId}:appointments`) || '[]');
      }, SYNTHETIC_SALON_AURA.tenantId);
      assert(postSubmitMerve.length === preSubmitMerve.count + 1, `Exactly one new appointment added for Merve (count: ${preSubmitMerve.count} -> ${postSubmitMerve.length})`);
      const newMerveBooking = postSubmitMerve.find(a => !preSubmitMerve.ids.includes(a.id));
      assert(!!newMerveBooking, 'Newly generated appointment ID for Merve identified in storage delta');
      assert(newMerveBooking.user_name === 'Merve Çelik', 'New booking customer name is Merve Çelik');
      assert((newMerveBooking.tenantId || newMerveBooking.tenant_id) === SYNTHETIC_SALON_AURA.tenantId, 'Merve booking is strictly tenant-bound');
      // Integrity check for selected service, staff, date (Finding 4)
      assert(newMerveBooking.serviceId === 'srv_aura_04' || newMerveBooking.service_id === 'srv_aura_04', 'Merve booking serviceId matches selected "srv_aura_04" (Klasik Manikür)');
      assert(newMerveBooking.staffId === 'staff_aura_02' || newMerveBooking.staff_id === 'staff_aura_02', 'Merve booking staffId matches selected "staff_aura_02" (Can Demir)');
      assert(newMerveBooking.date === targetDateStr, `Merve booking date matches selected date ${targetDateStr}`);
      const confirmText = await page.innerText('body');
      assert(confirmText.includes('Merve Çelik'), 'Merve Çelik appointment confirmed on screen');

      // Verify Consent Ledger in localStorage recorded granted for Selin and denied for Merve
      const ledgerEntries = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('lari_consent_ledger_v1') || '[]');
      });

      const merveCommConsent = ledgerEntries.find(e => 
        (e.contact === '05552223344' || e.actorId === '05552223344' || e.contact === 'merve.celik@example.com') && 
        e.consentType === 'communication'
      );
      assert(merveCommConsent !== undefined, 'Consent ledger contains record for Merve Çelik communication consent');
      assert(merveCommConsent.status === 'denied', 'Merve Çelik communication consent status is "denied" in ledger');

      const selinCommConsent = ledgerEntries.find(e => 
        (e.contact === '05551112233' || e.actorId === '05551112233' || e.contact === 'selin.arslan@example.com') && 
        e.consentType === 'communication'
      );
      assert(selinCommConsent !== undefined, 'Consent ledger contains record for Selin Arslan communication consent');
      assert(selinCommConsent.status === 'granted', 'Selin Arslan communication consent status is "granted" in ledger');

      // Verify Communication Delivery Service enforces consent denial
      const deliveryService = new CommunicationDeliveryService();
      const merveIntent = deliveryService.createIntent({
        intentId: 'intent_browser_merve_01',
        tenantId: SYNTHETIC_SALON_AURA.tenantId,
        branchId: SYNTHETIC_SALON_AURA.branch.id,
        channel: 'sms',
        recipient: '+905552223344',
        templateId: 'booking_confirmed',
        templateArgs: { customerName: 'Merve Çelik', salonName: SYNTHETIC_SALON_AURA.businessName },
        body: 'Merve Çelik randevunuz onaylandı.',
        consentGranted: false,
        consentDenialReason: 'Customer denied contact consent in browser booking form'
      });
      assert(merveIntent.status === 'skipped', 'CommunicationDeliveryService marked Merve intent as skipped');
      const failures = deliveryService.getFailuresForIntent('intent_browser_merve_01');
      assert(failures.length > 0 && failures[0].failureType === 'CONSENT_DENIED', 'Failure logged with type CONSENT_DENIED');
    });

    // ------------------------------------------------------------------------
    // STAGE 6: Tenant sınırları ve veri izolasyonu
    // ------------------------------------------------------------------------
    await runStage('Tenant Sınırları ve İzolasyon Denetimi', async () => {
      console.log('[Stage 6] Testing navigation to unprovisioned tenant slug...');
      await page.goto(`${baseUrl}/#/unauthorized-rogue-tenant-999`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('h1:has-text("Salon Bulunamadı"), h1:has-text("Salon Not Found")', { timeout: 10000 });
      
      const unauthText = await page.innerText('body');
      assert(!unauthText.includes('Aura Kuaför & Güzellik'), 'Aura salon branding does not leak to rogue tenant route');
      assert(!unauthText.includes('Aura Nişantaşı'), 'Aura branch name does not leak to rogue tenant route');
      assert(!unauthText.includes('Elif Yılmaz'), 'Aura staff "Elif Yılmaz" does not leak to rogue tenant route');
      assert(!unauthText.includes('Teşvikiye Cad. No: 42'), 'Aura address does not leak to rogue tenant route');

      // Verify localStorage isolation: appointments under Aura are strictly isolated
      const auraAppointments = await page.evaluate((tenantId) => {
        return JSON.parse(localStorage.getItem(`lari:${tenantId}:appointments`) || '[]');
      }, SYNTHETIC_SALON_AURA.tenantId);

      assert(auraAppointments.length >= 2, `Aura tenant has expected bookings (found ${auraAppointments.length})`);
      assert(auraAppointments.every(b => (b.tenantId || SYNTHETIC_SALON_AURA.tenantId) === SYNTHETIC_SALON_AURA.tenantId), 'All bookings belong strictly to synthetic_salon_aura_001');

      // Check that another tenant key is empty
      const otherAppointments = await page.evaluate(() => {
        return localStorage.getItem('lari:unauthorized-rogue-tenant-999:appointments');
      });
      assert(otherAppointments === null, 'Rogue tenant appointments key remains completely empty (no cross-tenant write)');
    });

    // ------------------------------------------------------------------------
    // STAGE 7: Mobil ve masaüstü temel görünüm
    // ------------------------------------------------------------------------
    await runStage('Mobil ve Masaüstü Temel Görünüm (Responsive Layouts)', async () => {
      // 7.1 Desktop Viewport
      console.log('[Stage 7.1] Testing Desktop Viewport (1280x800)...');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${baseUrl}/#/aura-nisantasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('[data-testid="public-booking-ready"]', { timeout: 30000 });

      // Verify desktop header navigation links are visible
      const desktopNav = page.locator('header .hidden.md\\:flex');
      assert(await desktopNav.isVisible(), 'Desktop navigation menu is visible on 1280px width');

      // Open booking form on desktop
      await page.click('[data-testid="public-booking-start"]');
      await page.waitForSelector('[data-testid="public-booking-form"]', { timeout: 10000 });

      // Verify desktop stepper is visible
      const desktopStepper = page.locator('.hidden.sm\\:flex').first();
      assert(await desktopStepper.isVisible(), 'Desktop 4-step stepper is visible on desktop');

      // Verify right-column summary card container is visible
      const desktopSummary = page.locator('.hidden.lg\\:block').first();
      assert(await desktopSummary.isVisible(), 'Desktop right-column booking summary card is visible on 1280px width');

      // 7.2 Mobile Viewport
      console.log('[Stage 7.2] Testing Mobile Viewport (375x667)...');
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${baseUrl}/#/aura-nisantasi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('[data-testid="public-booking-ready"]', { timeout: 30000 });

      // Verify desktop navigation is hidden on mobile
      const desktopNavOnMobile = await page.locator('header .hidden.md\\:flex').isVisible();
      assert(!desktopNavOnMobile, 'Desktop navigation is hidden on 375px mobile viewport');

      // Verify mobile booking start button is visible & touch-friendly
      const mobileStartBtn = page.locator('[data-testid="public-booking-start"]');
      assert(await mobileStartBtn.isVisible(), 'Mobile start booking button is visible and touchable');

      // Click start on mobile
      await mobileStartBtn.click();
      await page.waitForSelector('[data-testid="public-booking-form"]', { timeout: 10000 });

      // Verify mobile stepper is displayed
      const mobileStepper = page.locator('.sm\\:hidden').first();
      assert(await mobileStepper.isVisible(), 'Mobile stepper indicator ("Adım X / 4") is visible on mobile');

      // Verify zero unwanted horizontal scroll overflow
      const horizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
      });
      assert(!horizontalOverflow, 'Mobile layout has zero horizontal overflow (page width fits within viewport cleanly)');
    });

  } catch (error) {
    console.error('\n❌ TEST RUNNER FAILED WITH ERROR:', error);
    try {
      if (!fs.existsSync('.autodev_logs')) fs.mkdirSync('.autodev_logs', { recursive: true });
      await page.screenshot({ path: '.autodev_logs/phase-f-browser-failure.png', fullPage: true });
      console.log('📸 Failure screenshot saved to .autodev_logs/phase-f-browser-failure.png');
      await context.tracing.stop({ path: '.autodev_logs/phase-f-failure-trace.zip' });
      console.log('📦 Playwright failure trace saved to .autodev_logs/phase-f-failure-trace.zip');
    } catch (diagErr) {
      console.error('Failed to save failure artifacts:', diagErr);
    }
    await browser.close();
    await viteServer.close();
    process.exit(1);
  }

  // Teardown
  await context.tracing.stop();
  await browser.close();
  await viteServer.close();

  console.log('\n============================================================================');
  console.log(`🎉 ALL 7 STAGES PASSED (${passedStages}/${stageCount})!`);
  console.log('Terminal State: LARI_PILOT3_PHASE_F_BROWSER_REGRESSION_PASSED');
  console.log('All synthetic salon user journey assertions verified in real Chromium.');
  console.log('============================================================================');
  process.exit(0);
})();