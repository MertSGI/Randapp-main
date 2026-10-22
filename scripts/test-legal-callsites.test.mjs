import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT_DIR = process.cwd();
const REGISTRATION_PATH = path.resolve(ROOT_DIR, 'pages', 'RegistrationPage.tsx');
const SELF_SERVICE_PATH = path.resolve(ROOT_DIR, 'pages', 'AppointmentSelfServicePage.tsx');
const BOOKING_PATH = path.resolve(ROOT_DIR, 'pages', 'BookingPage.tsx');

// Environment setup helper for Node test runner
function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  }
}

function setSupabaseMode() {
  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://fake-staging.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'fake-anon-key-for-test'
  });
}

function setLocalMode() {
  setTestEnv({
    VITE_DATA_MODE: 'local',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: ''
  });
}

setLocalMode();

// Dynamic imports for runtime fail-closed verifications
const { policyAcceptanceService } = await import('../services/policyAcceptanceService.ts');
const { consentLedgerService } = await import('../services/consentLedgerService.ts');
const { dataRightsRequestService } = await import('../services/dataRightsRequestService.ts');

async function buildBrowserHarnessBundle() {
  const entryCode = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
    import AppointmentSelfServicePage from './pages/AppointmentSelfServicePage.tsx';
    import RegistrationPage from './pages/RegistrationPage.tsx';
    import { appointmentSelfServiceService } from './services/appointmentSelfServiceService.ts';
    import { dataRightsRequestService } from './services/dataRightsRequestService.ts';
    import { planService } from './services/planService.ts';
    import { tenantRegistrationService } from './services/tenantRegistrationService.ts';
    import { policyAcceptanceService } from './services/policyAcceptanceService.ts';
    import { consentLedgerService } from './services/consentLedgerService.ts';
    import { LanguageProvider } from './contexts/LanguageContext.tsx';

    function RouterProbe() {
      const location = useLocation();
      return (
        <div
          id="router-location-probe"
          data-pathname={location.pathname}
          data-search={location.search}
          data-state={JSON.stringify(location.state || null)}
        >
          {location.pathname}{location.search}
        </div>
      );
    }

    const originalCreateDataRights = dataRightsRequestService.createDataRightsRequest.bind(dataRightsRequestService);
    const originalRecordPolicy = policyAcceptanceService.recordPolicyAcceptance.bind(policyAcceptanceService);
    const originalRecordConsent = consentLedgerService.recordConsent.bind(consentLedgerService);

    let activeRoot = null;

    window.__TEST_HARNESS__ = {
      calls: {
        dataRights: [],
        policyAcceptances: [],
        consents: [],
        registerTenant: []
      },
      resetCalls() {
        this.calls.dataRights = [];
        this.calls.policyAcceptances = [];
        this.calls.consents = [];
        this.calls.registerTenant = [];
      },
      setEnv(envObj) {
        window.__TEST_IMPORT_META_ENV__ = envObj;
      },
      mountSelfService({ mode = 'supabase_staging', delayMs = 0 } = {}) {
        this.resetCalls();
        if (mode === 'supabase_staging') {
          this.setEnv({
            VITE_DATA_MODE: 'supabase_staging',
            VITE_SUPABASE_URL: 'https://fake-staging.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'fake-anon-key'
          });
        } else {
          this.setEnv({
            VITE_DATA_MODE: 'local',
            VITE_SUPABASE_URL: '',
            VITE_SUPABASE_ANON_KEY: ''
          });
        }

        appointmentSelfServiceService.getAppointmentByManageToken = async (tok) => ({
          kind: 'success',
          tokenObj: {
            id: 'tok-1',
            tenantId: 'tenant_test_1',
            appointmentId: 'apt-101',
            tokenHash: 'hash_1',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString()
          },
          appointment: {
            id: 'apt-101',
            tenantId: 'tenant_test_1',
            customerId: 'cust-101',
            serviceId: 'srv-1',
            staffId: 'stf-1',
            user_name: 'Ayşe Yılmaz',
            user_email: 'ayse@example.test',
            phone: '05551112233',
            date: '2026-11-15',
            time: '14:30',
            durationMinutes: 45,
            status: 'confirmed'
          },
          rawData: {
            service: { id: 'srv-1', name: 'Saç Kesimi', name_tr: 'Saç Kesimi', price: 500 },
            staff: { id: 'stf-1', name: 'Zeynep Uzman', title: 'Kıdemli Stilist' },
            branch: { id: 'br-1', name: 'Merkez Şube' }
          }
        });

        appointmentSelfServiceService.getPendingRescheduleRequestByManageToken = async () => ({
          hasPendingRequest: false
        });

        dataRightsRequestService.createDataRightsRequest = (payload) => {
          this.calls.dataRights.push(payload);
          if (delayMs > 0) {
            return new Promise((resolve, reject) => {
              setTimeout(() => {
                try {
                  resolve(originalCreateDataRights(payload));
                } catch (err) {
                  reject(err);
                }
              }, delayMs);
            });
          }
          return originalCreateDataRights(payload);
        };

        const container = document.getElementById('root');
        if (activeRoot) {
          activeRoot.unmount();
        }
        container.innerHTML = '';
        activeRoot = createRoot(container);
        activeRoot.render(
          <MemoryRouter initialEntries={['/appointment/manage/valid-test-token-101']}>
            <Routes>
              <Route path="/appointment/manage/:token" element={<AppointmentSelfServicePage />} />
              <Route path="/book" element={<RouterProbe />} />
            </Routes>
          </MemoryRouter>
        );
      },
      mountRegistration({ mode = 'supabase_staging', registerStatus = 'PROVISIONED' } = {}) {
        this.resetCalls();
        if (mode === 'supabase_staging') {
          this.setEnv({
            VITE_DATA_MODE: 'supabase_staging',
            VITE_SUPABASE_URL: 'https://fake-staging.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'fake-anon-key'
          });
        } else {
          this.setEnv({
            VITE_DATA_MODE: 'local',
            VITE_SUPABASE_URL: '',
            VITE_SUPABASE_ANON_KEY: ''
          });
        }

        planService.getPublicSelfServicePlansAsync = async () => ([
          {
            id: 'baslangic',
            name: 'Başlangıç Paketi',
            monthlyPrice: 499,
            annualPrice: 4990,
            maxStaff: 3,
            maxServices: 25,
            aiRecommendationsEnabled: false
          }
        ]);

        tenantRegistrationService.registerTenant = async (formData) => {
          this.calls.registerTenant.push(formData);
          return {
            success: true,
            status: registerStatus,
            tenantId: 'tenant-provisioned-999',
            slug: 'test-salon-999'
          };
        };

        policyAcceptanceService.recordPolicyAcceptance = (payload) => {
          this.calls.policyAcceptances.push(payload);
          return originalRecordPolicy(payload);
        };

        consentLedgerService.recordConsent = (payload) => {
          this.calls.consents.push(payload);
          return originalRecordConsent(payload);
        };

        const container = document.getElementById('root');
        if (activeRoot) {
          activeRoot.unmount();
        }
        container.innerHTML = '';
        activeRoot = createRoot(container);
        activeRoot.render(
          <LanguageProvider>
            <MemoryRouter initialEntries={['/register?planId=baslangic']}>
              <Routes>
                <Route path="/register" element={<RegistrationPage />} />
                <Route path="/admin" element={<RouterProbe />} />
              </Routes>
            </MemoryRouter>
          </LanguageProvider>
        );
      }
    };
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: ROOT_DIR,
      sourcefile: 'callsites-test-harness.tsx',
      loader: 'tsx'
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    define: {
      'import.meta.env': 'window.__TEST_IMPORT_META_ENV__',
      'process.env.NODE_ENV': '"test"'
    }
  });

  return result.outputFiles[0].text;
}

test('1. RegistrationPage: Integrates policyAcceptanceService and recordPolicyAcceptance', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes('policyAcceptanceService'), 'RegistrationPage must import and reference policyAcceptanceService');
  assert.ok(code.includes('recordPolicyAcceptance'), 'RegistrationPage must call recordPolicyAcceptance');
});

test('2. RegistrationPage: Integrates consentLedgerService and recordConsent', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes('consentLedgerService'), 'RegistrationPage must import and reference consentLedgerService');
  assert.ok(code.includes('recordConsent'), 'RegistrationPage must call recordConsent');
});

test('3. RegistrationPage: Formally binds terms_of_service and privacy_policy document types', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(code.includes("'terms_of_service'"), 'RegistrationPage must reference terms_of_service');
  assert.ok(code.includes("'privacy_policy'"), 'RegistrationPage must reference privacy_policy');
});

test('4. RegistrationPage: Visibly displays pending server attestation in persistent mode', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(
    code.includes('LEGAL_ACCEPTANCE_RECORD_PENDING') && code.includes('SERVER_LEGAL_WRITE_NOT_READY'),
    'RegistrationPage must visibly indicate pending server attestation tokens'
  );
  assert.ok(code.includes('isPersistentMode'), 'RegistrationPage must resolve persistent mode state');
});

test('5. RegistrationPage: Retains idempotent tenant provisioning without rolling back tenant on legal record omission', () => {
  const code = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  assert.ok(
    code.includes('Retain idempotent tenant provisioning without rolling back tenant on legal record omission'),
    'RegistrationPage must explicitly document and enforce tenant provisioning preservation'
  );
  assert.ok(!code.includes("catch (legalErr) {\n          setSubmissionState('PROVISIONING_FAILED_TERMINAL')"), 'Legal record error must not fail tenant provisioning');
});

test('6. AppointmentSelfServicePage: Renders literal header "Kişisel Verilerin Korunması"', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(
    code.includes('Kişisel Verilerin Korunması'),
    'AppointmentSelfServicePage must contain literal Turkish header "Kişisel Verilerin Korunması"'
  );
});

test('7. AppointmentSelfServicePage: Exposes "Talep Türü" with deletion, export, correction, and consent_withdrawal', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('Talep Türü'), 'Must have Talep Türü selector label');
  assert.ok(code.includes('deletion'), 'Must support deletion request type');
  assert.ok(code.includes('export'), 'Must support export request type');
  assert.ok(code.includes('correction'), 'Must support correction request type');
  assert.ok(code.includes('consent_withdrawal'), 'Must support consent_withdrawal request type');
});

test('8. AppointmentSelfServicePage: Integrates dataRightsRequestService.createDataRightsRequest without obsolete inline dynamic import', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('dataRightsRequestService'), 'Must import dataRightsRequestService');
  assert.ok(code.includes('createDataRightsRequest'), 'Must invoke createDataRightsRequest');
  assert.ok(
    !code.includes("import('../services/dataRightsRequestService').then"),
    'Must NOT contain obsolete inline dynamic import(.then) KVKK submission path'
  );
});

test('9. AppointmentSelfServicePage: Displays fail-closed error and retains user description when LEGAL_PERSISTENCE_REQUIRED occurs', () => {
  const code = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('LEGAL_PERSISTENCE_REQUIRED'), 'Must explicitly guard against LEGAL_PERSISTENCE_REQUIRED');
  assert.ok(code.includes('kvkkError'), 'Must set error state for user feedback');
  assert.ok(!code.includes("catch (err: any) {\n      setKvkkDesc('')"), 'Must retain user description on error');
});

test('10. BookingPage: Preserves atomic booking RPC without fake fallback localStorage consent in Supabase mode', () => {
  const code = fs.readFileSync(BOOKING_PATH, 'utf8');
  assert.ok(code.includes('if (!isSupabaseMode)'), 'BookingPage must gate client-side consent writes behind !isSupabaseMode');
  assert.ok(code.includes('policyAcceptanceService'), 'BookingPage must integrate policyAcceptanceService for local mode');
  assert.ok(code.includes('consentLedgerService'), 'BookingPage must integrate consentLedgerService for local mode');
  assert.ok(code.includes('booking_terms'), 'BookingPage must reference booking_terms');
  assert.ok(code.includes('communication_consent_text'), 'BookingPage must reference communication_consent_text');
  assert.ok(code.includes('marketing_consent_text'), 'BookingPage must reference marketing_consent_text');
});

test('11. Security Audit: Customer call sites do not leak forbidden test words', () => {
  const regCode = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  const selfServiceCode = fs.readFileSync(SELF_SERVICE_PATH, 'utf8');
  const bookingCode = fs.readFileSync(BOOKING_PATH, 'utf8');

  for (const [name, code] of [
    ['RegistrationPage', regCode],
    ['AppointmentSelfServicePage', selfServiceCode],
    ['BookingPage', bookingCode]
  ]) {
    assert.ok(!code.includes('dummy'), `${name} contains forbidden word: dummy`);
    assert.ok(!code.includes('mock_legal'), `${name} contains forbidden word: mock_legal`);
    assert.ok(!code.includes('sandbox_data'), `${name} contains forbidden word: sandbox_data`);
  }
});

test('12. Runtime Call Site Contract: Services fail closed in persistent mode when invoked', async () => {
  setSupabaseMode();

  assert.throws(
    () => {
      policyAcceptanceService.recordPolicyAcceptance({
        actorType: 'tenant_owner',
        documentType: 'terms_of_service',
        acceptanceSource: 'registration'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => {
      consentLedgerService.recordConsent({
        actorType: 'tenant_owner',
        consentType: 'booking_transactional',
        status: 'granted',
        source: 'registration'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => {
      dataRightsRequestService.createDataRightsRequest({
        tenantId: 'tenant-123',
        requesterType: 'customer',
        type: 'export',
        description: 'Customer test request'
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );
});

test('13. Mounted DOM Behavioral Test: AppointmentSelfServicePage renders strictly ONE KVKK form, shows role="alert" in persistent mode, and preserves user input', async () => {
  const bundleCode = await buildBrowserHarnessBundle();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const networkRequests = [];
    page.on('request', (req) => {
      if (/supabase\.co/i.test(req.url())) {
        networkRequests.push(req.url());
      }
    });

    await page.route('http://127.0.0.1:43210/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><div id="root"></div></body></html>'
      })
    );
    await page.goto('http://127.0.0.1:43210/');
    await page.addScriptTag({ content: bundleCode });

    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_HARNESS__.mountSelfService({ mode: 'supabase_staging' });
    });

    await page.getByRole('heading', { name: 'Randevu Detayı' }).waitFor({ timeout: 10000 });

    // Verify existing reschedule and navigation actions remain present
    assert.equal(await page.getByRole('button', { name: /Randevu Değişikliği Talep Et/i }).count(), 1, 'Reschedule trigger must remain intact');
    assert.equal(await page.getByRole('button', { name: /Randevu Sistemine Dön/i }).count(), 1, 'Return to booking button must remain intact');

    // Open KVKK form
    const kvkkToggleBtn = page.getByRole('button', { name: /KVKK Talebi Oluştur|Talep Oluştur/i });
    assert.equal(await kvkkToggleBtn.count(), 1, 'Must render exactly ONE KVKK form toggle button (no duplicated KVKK section)');
    await kvkkToggleBtn.click();

    // Must render strictly ONE form in the DOM
    const renderedForms = page.locator('form');
    const formCount = await renderedForms.count();
    assert.equal(formCount, 1, `Expected strictly 1 rendered KVKK <form> when showKvkkForm is open, found ${formCount}`);

    // Fill out the sole KVKK form and submit in persistent mode
    const descriptionText = 'Randevu geçmişimin ve kişisel verilerimin silinmesini talep ediyorum.';
    await page.locator('#kvkk-type-select').selectOption('deletion');
    await page.locator('#kvkk-desc-input').fill(descriptionText);
    await renderedForms.first().locator('button[type="submit"]').click();

    // Expect visible role="alert" error containing LEGAL_PERSISTENCE_REQUIRED
    const alertBox = page.locator('form [role="alert"]');
    await alertBox.waitFor({ state: 'visible', timeout: 5000 });
    const alertText = await alertBox.innerText();
    assert.ok(alertText.includes('LEGAL_PERSISTENCE_REQUIRED'), `Alert must mention LEGAL_PERSISTENCE_REQUIRED, got: ${alertText}`);

    // Expect typed description to be preserved on failure
    const preservedValue = await page.locator('#kvkk-desc-input').inputValue();
    assert.equal(preservedValue, descriptionText, 'Typed description must be preserved when submission fails in persistent mode');

    // Expect no success message and no synthetic localStorage writes or network DB writes
    const bodyText = await page.locator('#root').innerText();
    assert.ok(!bodyText.includes('başarıyla kaydedildi') && !bodyText.includes('Başvurunuz kaydedilmiştir'), 'Must not render any success message on failure');
    assert.equal(networkRequests.length, 0, 'Must not perform any network DB writes');

    const storageKeys = await page.evaluate(() => Object.keys(localStorage));
    assert.equal(storageKeys.length, 0, `Must not write synthetic tickets or local requests in persistent mode, found keys: ${storageKeys.join(', ')}`);
  } finally {
    await browser.close();
  }
});

test('14. Mounted DOM Behavioral Test: AppointmentSelfServicePage local demo mode succeeds once, blocks double-submit, and resets input only after success', async () => {
  const bundleCode = await buildBrowserHarnessBundle();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://127.0.0.1:43210/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><div id="root"></div></body></html>'
      })
    );
    await page.goto('http://127.0.0.1:43210/');
    await page.addScriptTag({ content: bundleCode });

    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_HARNESS__.mountSelfService({ mode: 'local', delayMs: 80 });
    });

    await page.getByRole('heading', { name: 'Randevu Detayı' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /KVKK Talebi Oluştur/i }).click();

    assert.equal(await page.locator('form').count(), 1, 'Strictly 1 KVKK form must be mounted');

    const demoDesc = 'Verilerimin bir kopyasını talep ediyorum (Demo test).';
    await page.locator('#kvkk-type-select').selectOption('export');
    await page.locator('#kvkk-desc-input').fill(demoDesc);

    // Trigger two rapid form submit events synchronously to test double-click / in-flight guard
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // While in-flight (before 80ms resolves), input must NOT be cleared yet
    const inFlightValue = await page.locator('#kvkk-desc-input').inputValue();
    assert.equal(inFlightValue, demoDesc, 'Input must not reset before completion');

    // Wait for completion and success message
    await page.waitForSelector('[data-testid="kvkk-success-banner"]', { timeout: 5000 });
    const callCount = await page.evaluate(() => window.__TEST_HARNESS__.calls.dataRights.length);
    assert.equal(callCount, 1, `Double submit while processing must not create duplicates; expected 1 call, got ${callCount}`);

    // Input reset happens after success
    const postSuccessValue = await page.locator('#kvkk-desc-input').inputValue();
    assert.equal(postSuccessValue, '', 'Input must be reset to empty string after successful local submission');
  } finally {
    await browser.close();
  }
});

test('15. Mounted DOM Behavioral Test: RegistrationPage distinguishes TENANT_PROVISIONED from LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT in persistent mode', async () => {
  const bundleCode = await buildBrowserHarnessBundle();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://127.0.0.1:43210/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><div id="root"></div></body></html>'
      })
    );
    await page.goto('http://127.0.0.1:43210/');
    await page.addScriptTag({ content: bundleCode });

    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_HARNESS__.mountRegistration({ mode: 'supabase_staging', registerStatus: 'PROVISIONED' });
    });

    await page.locator('input[name="ownerName"]').waitFor({ timeout: 10000 });

    await page.locator('input[name="ownerName"]').fill('Mert');
    await page.locator('input[name="ownerSurname"]').fill('Özçelikbaş');
    await page.locator('input[name="ownerEmail"]').fill('mert@example.test');
    await page.locator('input[name="ownerPhone"]').fill('05551234567');
    await page.locator('input[name="password"]').fill('StrongPass!123');
    await page.locator('input[name="confirmPassword"]').fill('StrongPass!123');
    await page.locator('input[name="businessName"]').fill('Mert Güzellik A.Ş.');
    await page.locator('input[name="businessDisplayName"]').fill('Mert Studio');
    await page.locator('input[name="city"]').fill('İstanbul');
    await page.locator('input[name="acceptTerms"]').check();

    await page.locator('button[type="submit"]').click();

    const probe = page.locator('#router-location-probe');
    await probe.waitFor({ timeout: 10000 });

    const navSearch = await probe.getAttribute('data-search');
    const navStateRaw = await probe.getAttribute('data-state');
    const navState = JSON.parse(navStateRaw || 'null');
    const calls = await page.evaluate(() => window.__TEST_HARNESS__.calls);

    assert.equal(calls.registerTenant.length, 1, 'tenantRegistrationService.registerTenant must be called once');
    assert.equal(calls.policyAcceptances.length, 0, 'Must not call client-side recordPolicyAcceptance in persistent mode');
    assert.equal(calls.consents.length, 0, 'Must not call client-side recordConsent in persistent mode');

    assert.ok(
      navSearch.includes('provisioningState=TENANT_PROVISIONED') &&
      navSearch.includes('legalReceipt=LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT'),
      `Downstream onboarding route query must explicitly distinguish provisioningState=TENANT_PROVISIONED and legalReceipt=LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT, got: ${navSearch}`
    );

    assert.ok(navState, 'Router navigation state must be populated');
    assert.equal(navState.provisioningState, 'TENANT_PROVISIONED', 'navigationState.provisioningState must be TENANT_PROVISIONED');
    assert.equal(
      navState.legalReceiptState,
      'LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT',
      'navigationState.legalReceiptState must be LEGAL_ACCEPTANCE_PENDING_SERVER_RECEIPT'
    );
    assert.equal(navState.legalComplianceSatisfied, false, 'navigationState.legalComplianceSatisfied must fail closed (false)');
  } finally {
    await browser.close();
  }
});
