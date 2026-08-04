// scripts/test-super-admin-commercial-browser.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage H1D-C2 — Operator Local Playwright Browser Acceptance Runner
// Scenarios:
//   1. Super-admin login & navigation to /super-admin/commercial
//   2. Search canonical slug melis-guzellik
//   3. Search canonical tenant UUID
//   4. Search dedicated H1D test tenant UUID
//   5. Filter status=none & plan=all
//   6. Filter status=all & plan=none
//   7. Filter status=none & plan=none
//   8. Select dedicated test tenant & verify snapshot
//   9. Verify zero-amount TRY comped billing row
//  10. Restrictions section load assertion
//  11. Create restriction modal validation without mutation
//  12. Isolated tenant-owner access denial test
//  13. Safety & desktop/mobile screenshot capture (No secrets exposed)
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export async function runBrowserAcceptance() {
  const REQUIRED_ENV_VARS = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'LARI_STAGE_H1D_SUPER_ADMIN_EMAIL',
    'LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD',
    'LARI_STAGE_D1_OWNER_EMAIL',
    'LARI_STAGE_D1_OWNER_PASSWORD',
    'LARI_STAGE_H1D_TEST_TENANT_ID',
    'LARI_STAGE_H1D_TEST_FEATURE_KEY'
  ];

  loadEnvFile(path.join(process.cwd(), '.env.local'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  console.log('=== Stage H1D-C2 — Operator Playwright Browser Acceptance Runner ===\n');

  const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v] || !process.env[v].trim());

  if (missingVars.length > 0) {
    console.log('⚠️ H1D_UI_BROWSER_CREDENTIALS_REQUIRED');
    console.log('⚠️ STAGE_H1E_NOT_STARTED');
    console.log('⚠️ PRODUCTION_NO_GO');
    console.log('\nMissing environment variables required for browser acceptance:');
    missingVars.forEach(v => console.log(`  - ${v}`));
    console.log('\nNo login attempt, network mutation, or run ID generated.');
    process.exit(1);
  }

  const runId = `h1d_ui_browser_run_${Date.now()}`;
  const baseUrl = process.env.H1D_UI_BASE_URL || 'http://127.0.0.1:3000';
  console.log(`Run ID: ${runId}`);
  console.log(`Target Base URL: ${baseUrl}`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  const scenarioRegistry = [];
  let executedScenarios = 0;
  let passedScenarios = 0;
  let failedScenarios = 0;
  const screenshotPaths = [];

  async function runScenario(name, fn) {
    executedScenarios++;
    try {
      await fn();
      passedScenarios++;
      console.log(`  ✅ SCENARIO PASS: ${name}`);
      scenarioRegistry.push({ name, status: 'PASSED' });
    } catch (err) {
      failedScenarios++;
      console.error(`  ❌ SCENARIO FAIL: ${name} — ${err.message}`);
      scenarioRegistry.push({ name, status: 'FAILED', error: err.message });
    }
  }

  // Primary Super Admin Context
  const saContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const saPage = await saContext.newPage();

  // Attach Request Observer to catch forbidden mutations
  saPage.on('request', req => {
    const url = req.url();
    if (url.includes('super_admin_create_platform_restriction') || url.includes('super_admin_end_platform_restriction')) {
      throw new Error(`FORBIDDEN_LIVE_MUTATION_REQUEST_DETECTED: ${url}`);
    }
  });

  try {
    // 1. Super admin login & navigation
    await runScenario('1. Super-admin login & navigate to /super-admin/commercial', async () => {
      await saPage.goto(`${baseUrl}/login`);
      await saPage.fill('input[type="email"]', process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL);
      await saPage.fill('input[type="password"]', process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD);
      await saPage.click('button[type="submit"]');

      // Wait for /super-admin redirect
      await saPage.waitForURL(url => url.pathname.startsWith('/super-admin'), { timeout: 10000 });

      // Navigate explicitly to /super-admin/commercial
      await saPage.goto(`${baseUrl}/super-admin/commercial`);
      await saPage.waitForSelector('[data-testid="commercial-page-title"]', { timeout: 10000 });
      const title = await saPage.textContent('[data-testid="commercial-page-title"]');
      if (!title.includes('Ticari Yönetim & Abonelik Paneli')) {
        throw new Error('Commercial page title not matched');
      }
    });

    // 2. Search canonical slug melis-guzellik
    await runScenario('2. Search canonical slug melis-guzellik', async () => {
      await saPage.fill('[data-testid="commercial-directory-search"]', 'melis-guzellik');
      await saPage.waitForSelector('[data-testid="commercial-directory-results"]', { timeout: 5000 });
      const content = await saPage.textContent('[data-testid="commercial-directory-results"]');
      if (!content.includes('Melis Güzellik') && !content.includes('melis-guzellik')) {
        throw new Error('Canonical slug melis-guzellik not found in directory results');
      }
    });

    // 3. Search canonical tenant UUID
    await runScenario('3. Search canonical tenant UUID', async () => {
      await saPage.fill('[data-testid="commercial-directory-search"]', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
      await saPage.waitForSelector('[data-testid="commercial-directory-results"]', { timeout: 5000 });
      const card = await saPage.locator('[data-testid="commercial-tenant-card-aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa"]');
      if (await card.count() === 0) {
        throw new Error('Canonical tenant UUID card not found in directory');
      }
    });

    // 4. Search dedicated H1D test tenant UUID
    await runScenario('4. Search dedicated H1D test tenant UUID', async () => {
      const testTenantId = process.env.LARI_STAGE_H1D_TEST_TENANT_ID;
      await saPage.fill('[data-testid="commercial-directory-search"]', testTenantId);
      await saPage.waitForSelector(`[data-testid="commercial-tenant-card-${testTenantId}"]`, { timeout: 5000 });
      const card = await saPage.locator(`[data-testid="commercial-tenant-card-${testTenantId}"]`);
      if (await card.count() === 0) {
        throw new Error(`Dedicated H1D test tenant card [data-testid="commercial-tenant-card-${testTenantId}"] not found`);
      }
    });

    // 5. Filter status=none & plan=all
    await runScenario('5. Filter status=none & plan=all', async () => {
      await saPage.fill('[data-testid="commercial-directory-search"]', '');
      await saPage.selectOption('[data-testid="commercial-status-filter"]', 'none');
      await saPage.selectOption('[data-testid="commercial-plan-filter"]', 'all');
      await saPage.waitForSelector('[data-testid="commercial-directory-results"]', { timeout: 5000 });
    });

    // 6. Filter status=all & plan=none
    await runScenario('6. Filter status=all & plan=none', async () => {
      await saPage.selectOption('[data-testid="commercial-status-filter"]', 'all');
      await saPage.selectOption('[data-testid="commercial-plan-filter"]', 'none');
      await saPage.waitForSelector('[data-testid="commercial-directory-results"]', { timeout: 5000 });
    });

    // 7. Filter status=none & plan=none
    await runScenario('7. Filter status=none & plan=none', async () => {
      await saPage.selectOption('[data-testid="commercial-status-filter"]', 'none');
      await saPage.selectOption('[data-testid="commercial-plan-filter"]', 'none');
      await saPage.waitForSelector('[data-testid="commercial-directory-results"]', { timeout: 5000 });
    });

    // 8. Select dedicated test tenant & verify snapshot
    await runScenario('8. Select dedicated test tenant & verify snapshot', async () => {
      const testTenantId = process.env.LARI_STAGE_H1D_TEST_TENANT_ID;
      await saPage.fill('[data-testid="commercial-directory-search"]', testTenantId);
      await saPage.waitForSelector(`[data-testid="commercial-tenant-card-${testTenantId}"]`, { timeout: 5000 });
      await saPage.click(`[data-testid="commercial-tenant-card-${testTenantId}"]`);

      await saPage.waitForSelector('[data-testid="commercial-snapshot"]', { timeout: 10000 });
      const selTenantId = await saPage.getAttribute('[data-testid="commercial-selected-tenant"]', 'data-tenant-id');
      if (selTenantId !== testTenantId) {
        throw new Error(`Expected selected tenant ${testTenantId}, got ${selTenantId}`);
      }
    });

    // 9. Verify zero-amount TRY comped billing row
    await runScenario('9. Verify zero-amount TRY comped billing row', async () => {
      await saPage.waitForSelector('[data-testid="commercial-billing-table"]', { timeout: 10000 });
      const tableText = await saPage.textContent('[data-testid="commercial-billing-table"]');
      if (!tableText.includes('0.00 TRY')) {
        throw new Error('Billing table missing 0.00 TRY text');
      }
      if (!tableText.includes('comped')) {
        throw new Error('Billing table missing comped billing_mode text');
      }
      if (!tableText.includes('h1d_safe_billing_fixture_v1') && !tableText.includes('H1D Staging Fixture') && !tableText.includes('Permanent zero-amount H1D staging read fixture') && !tableText.includes('H1D commercial billing read acceptance fixture')) {
        throw new Error('Billing table missing fixture internal_reason/reference_note text');
      }
    });

    // 10. Restrictions section load assertion
    await runScenario('10. Restrictions section load assertion', async () => {
      await saPage.waitForSelector('[data-testid="commercial-restrictions-section"]', { timeout: 10000 });
      const errorCount = await saPage.locator('[data-testid="commercial-restrictions-error"]').count();
      if (errorCount > 0) {
        throw new Error('Platform restrictions section returned RPC error');
      }
      const loadedCount = await saPage.locator('[data-testid="commercial-restrictions-loaded"]').count();
      if (loadedCount === 0) {
        throw new Error('Platform restrictions section failed to present loaded content/table');
      }
    });


    // 11. Create restriction modal validation without mutation
    await runScenario(
      '11. Create restriction modal validation without mutation',
      async () => {
        await saPage.click(
          '[data-testid="commercial-create-restriction"]'
        );

        await saPage.waitForSelector(
          '[data-testid="commercial-create-modal"]',
          { timeout: 5000 }
        );

        const optionValue =
          await saPage
            .locator(
              'option:has-text("Seçili / Belirli İşletme")'
            )
            .getAttribute('value');

        if (optionValue !== 'tenant') {
          throw new Error(
            `Expected option value="tenant", got ${optionValue}`
          );
        }

        const reasonValue =
          await saPage.inputValue(
            '[data-testid="commercial-create-reason"]'
          );

        if (reasonValue.trim() !== '') {
          throw new Error(
            'Expected restriction reason textarea to be empty'
          );
        }

        await saPage.click(
          '[data-testid="commercial-submit"]'
        );

        const validationMessage =
          saPage.getByText(
            'Lütfen kısıtlama koyma nedenini belirtiniz.',
            { exact: true }
          );

        await validationMessage.waitFor({
          state: 'visible',
          timeout: 5000
        });

        const modalCount =
          await saPage
            .locator(
              '[data-testid="commercial-create-modal"]'
            )
            .count();

        if (modalCount === 0) {
          throw new Error(
            'Commercial modal closed during validation'
          );
        }

        // DialogContext alert is above the commercial modal.
        await saPage
          .getByRole('button', {
            name: 'Tamam',
            exact: true
          })
          .click();

        await validationMessage.waitFor({
          state: 'hidden',
          timeout: 5000
        });

        await saPage.click(
          '[data-testid="commercial-cancel"]'
        );

        await saPage.waitForSelector(
          '[data-testid="commercial-create-modal"]',
          {
            state: 'detached',
            timeout: 5000
          }
        );
      }
    );
    // 12. Safety & desktop/mobile screenshot capture
    await runScenario('12. Safety & desktop/mobile screenshot capture', async () => {
      // Assert forbidden payment strings
      const bodyText = await saPage.textContent('body');
      const forbidden = ['Pay now', 'Checkout', 'Charge card', 'iyzico', 'Refund through iyzico'];
      for (const f of forbidden) {
        if (bodyText.includes(f)) {
          throw new Error(`Forbidden payment control string detected: ${f}`);
        }
      }

      const desktopPath = path.join(process.cwd(), `h1d_browser_desktop_${runId}.png`);
      await saPage.screenshot({ path: desktopPath, fullPage: true });
      screenshotPaths.push(desktopPath);

      await saPage.setViewportSize({ width: 375, height: 812 });
      const mobilePath = path.join(process.cwd(), `h1d_browser_mobile_${runId}.png`);
      await saPage.screenshot({ path: mobilePath, fullPage: true });
      screenshotPaths.push(mobilePath);
    });

    // Close super-admin context before isolated tenant owner test
    await saContext.close();


    // 13. Isolated tenant-owner access denial test
    await runScenario(
      '13. Isolated tenant-owner access denial test',
      async () => {
        const ownerContext =
          await browser.newContext({
            viewport: {
              width: 1280,
              height: 800
            }
          });

        try {
          const ownerPage =
            await ownerContext.newPage();

          const ownerCommercialRpcRequests = [];

          ownerPage.on('request', request => {
            if (
              request.url().includes('super_admin_')
            ) {
              ownerCommercialRpcRequests.push(
                request.url()
              );
            }
          });

          await ownerPage.goto(
            `${baseUrl}/login`
          );

          await ownerPage.fill(
            'input[type="email"]',
            process.env.LARI_STAGE_D1_OWNER_EMAIL
          );

          await ownerPage.fill(
            'input[type="password"]',
            process.env.LARI_STAGE_D1_OWNER_PASSWORD
          );

          await ownerPage.click(
            'button[type="submit"]'
          );

          await ownerPage.waitForURL(
            url =>
              url.pathname.startsWith('/admin'),
            { timeout: 10000 }
          );

          await ownerPage.goto(
            `${baseUrl}/super-admin/commercial`
          );

          await ownerPage.waitForFunction(
            () =>
              window.location.pathname !==
                '/super-admin/commercial' ||
              document.body.innerText.includes(
                'Bu alana erişim yetkiniz yok.'
              ),
            null,
            { timeout: 5000 }
          );

          const ownerPath =
            new URL(ownerPage.url()).pathname;

          const denialVisible =
            await ownerPage
              .getByRole('heading', {
                name:
                  'Bu alana erişim yetkiniz yok.',
                exact: true
              })
              .isVisible()
              .catch(() => false);

          const commercialTitleCount =
            await ownerPage
              .locator(
                '[data-testid="commercial-page-title"]'
              )
              .count();

          if (commercialTitleCount > 0) {
            throw new Error(
              'Protected commercial page rendered for tenant owner'
            );
          }

          if (
            ownerPath ===
              '/super-admin/commercial' &&
            !denialVisible
          ) {
            throw new Error(
              'Tenant owner received neither redirect nor access-denied screen'
            );
          }

          if (
            ownerCommercialRpcRequests.length > 0
          ) {
            throw new Error(
              `Tenant owner executed ${ownerCommercialRpcRequests.length} forbidden commercial RPC request(s)`
            );
          }
        }
        finally {
          await ownerContext.close();
        }
      }
    );
  } catch (err) {
    console.error('Unhandled acceptance runner error:', err);
  } finally {
    await browser.close();
  }

  const definedScenarios = 13;
  const exitCode = (executedScenarios === definedScenarios && passedScenarios === definedScenarios && failedScenarios === 0) ? 0 : 1;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Run ID: ${runId}`);
  console.log(`Defined scenarios: ${definedScenarios}`);
  console.log(`Executed scenarios: ${executedScenarios}`);
  console.log(`Passed: ${passedScenarios}`);
  console.log(`Failed: ${failedScenarios}`);
  console.log(`Total: ${passedScenarios + failedScenarios}`);
  console.log(`Screenshot paths: ${screenshotPaths.join(', ')}`);
  console.log(`Final exit code: ${exitCode}`);

  process.exit(exitCode);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('test-super-admin-commercial-browser.mjs')) {
  runBrowserAcceptance().catch(err => {
    console.error('Unhandled execution error:', err);
    process.exit(1);
  });
}
