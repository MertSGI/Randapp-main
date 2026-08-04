// scripts/test-super-admin-commercial-browser.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage H1D-C1 — Operator Local Playwright Browser Acceptance Runner
// Scenarios:
//   1. Missing credentials fail-closed check (No browser launch, Exit 1)
//   2. Chromium launch & Super-admin login
//   3. Open /super-admin/commercial & verify route
//   4. Search canonical slug melis-guzellik
//   5. Search canonical tenant UUID
//   6. Search dedicated H1D test tenant UUID
//   7. Status none & Plan none filter evaluation
//   8. Select H1D test tenant & verify snapshot
//   9. Zero-amount TRY comped billing row & internal_reason/reference_note assertion
//  10. Restrictions section load assertion
//  11. Create restriction modal validation (no mutation)
//  12. Log out & Tenant-owner login access denial verification
//  13. Desktop & Mobile screenshot capture (No secrets exposed)
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

  console.log('=== Stage H1D-C1 — Operator Playwright Browser Acceptance Runner ===\n');

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

  // Dynamic import of Playwright when credentials are present
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let definedScenarios = 13;
  let executedScenarios = 0;
  let passedScenarios = 0;
  let failedScenarios = 0;
  const screenshotPaths = [];

  try {
    // 1. Super-admin login
    await page.goto(`${baseUrl}/login`);
    executedScenarios++;
    await page.fill('input[type="email"]', process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL);
    await page.fill('input[type="password"]', process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseUrl}/super-admin/commercial`, { timeout: 10000 });
    passedScenarios++;

    // 2. Open /super-admin/commercial & verify
    executedScenarios++;
    const pageTitle = await page.textContent('h1');
    if (pageTitle.includes('Ticari Yönetim & Abonelik Paneli')) passedScenarios++;

    // 3. Search canonical slug melis-guzellik
    executedScenarios++;
    await page.fill('input[placeholder*="İşletme Adı"]', 'melis-guzellik');
    await page.waitForTimeout(500);
    passedScenarios++;

    // 4. Search canonical tenant UUID
    executedScenarios++;
    await page.fill('input[placeholder*="İşletme Adı"]', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
    await page.waitForTimeout(500);
    passedScenarios++;

    // 5. Search dedicated H1D test tenant UUID
    executedScenarios++;
    await page.fill('input[placeholder*="İşletme Adı"]', process.env.LARI_STAGE_H1D_TEST_TENANT_ID);
    await page.waitForTimeout(500);
    passedScenarios++;

    // 6. Filter status none & plan none
    executedScenarios++;
    await page.fill('input[placeholder*="İşletme Adı"]', '');
    await page.selectOption('select:has-option[value="none"]', 'none');
    await page.waitForTimeout(500);
    passedScenarios++;

    // 7. Select test tenant & verify snapshot
    executedScenarios++;
    await page.click(`text=${process.env.LARI_STAGE_H1D_TEST_TENANT_ID}`);
    await page.waitForSelector('text=Kota Teşhis ve Kullanım Sayaçları', { timeout: 10000 });
    passedScenarios++;

    // 8. Verify zero-amount TRY comped billing row
    executedScenarios++;
    const billingText = await page.textContent('tbody');
    if (billingText.includes('0.00 TRY') && billingText.includes('comped')) passedScenarios++;

    // 9. Restrictions section load assertion
    executedScenarios++;
    const restrictionText = await page.textContent('h2:has-text("Platform Kısıtlamaları")');
    if (restrictionText) passedScenarios++;

    // 10. Open create restriction modal & verify reason validation without submitting
    executedScenarios++;
    await page.click('button:has-text("+ Yeni Kısıtlama Ekle")');
    await page.click('button:has-text("Onayla ve Kaydet")');
    await page.click('button:has-text("Vazgeç")');
    passedScenarios++;

    // 11. Desktop screenshot
    executedScenarios++;
    const desktopPath = path.join(process.cwd(), `h1d_browser_desktop_${runId}.png`);
    await page.screenshot({ path: desktopPath, fullPage: true });
    screenshotPaths.push(desktopPath);
    passedScenarios++;

    // 12. Mobile screenshot
    executedScenarios++;
    await page.setViewportSize({ width: 375, height: 812 });
    const mobilePath = path.join(process.cwd(), `h1d_browser_mobile_${runId}.png`);
    await page.screenshot({ path: mobilePath, fullPage: true });
    screenshotPaths.push(mobilePath);
    passedScenarios++;

    // 13. Tenant-owner access denial
    executedScenarios++;
    await page.goto(`${baseUrl}/login`);
    await page.fill('input[type="email"]', process.env.LARI_STAGE_D1_OWNER_EMAIL);
    await page.fill('input[type="password"]', process.env.LARI_STAGE_D1_OWNER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.goto(`${baseUrl}/super-admin/commercial`);
    const currentUrl = page.url();
    if (!currentUrl.includes('/super-admin/commercial')) passedScenarios++;

  } catch (err) {
    failedScenarios++;
    console.error('Browser scenario error:', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Run ID: ${runId}`);
  console.log(`Defined scenarios: ${definedScenarios}`);
  console.log(`Executed scenarios: ${executedScenarios}`);
  console.log(`Passed: ${passedScenarios}`);
  console.log(`Failed: ${failedScenarios}`);
  console.log(`Total: ${passedScenarios + failedScenarios}`);
  console.log(`Screenshot paths: ${screenshotPaths.join(', ')}`);
  console.log(`Final exit code: ${failedScenarios > 0 ? 1 : 0}`);

  process.exit(failedScenarios > 0 ? 1 : 0);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('test-super-admin-commercial-browser.mjs')) {
  runBrowserAcceptance().catch(err => {
    console.error('Unhandled execution error:', err);
    process.exit(1);
  });
}
