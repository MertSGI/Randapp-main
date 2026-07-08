import fs from 'fs';
import path from 'path';

console.log('=== RUNNING PAYMENTLESS PRODUCTION TECHNICAL CUTOVER QA VERIFICATION ===\n');

let passCount = 0;
let failCount = 0;

function assertFileExists(filePath) {
  if (fs.existsSync(filePath)) {
    console.log(`[PASS] File exists: ${filePath}`);
    passCount++;
  } else {
    console.log(`[FAIL] File missing: ${filePath}`);
    failCount++;
  }
}

function assertFileContains(filePath, phrase) {
  if (!fs.existsSync(filePath)) {
    console.log(`[FAIL] Cannot inspect missing file: ${filePath}`);
    failCount++;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(phrase)) {
    console.log(`[PASS] File [${filePath}] contains phrase: "${phrase}"`);
    passCount++;
  } else {
    console.log(`[FAIL] File [${filePath}] is missing phrase: "${phrase}"`);
    failCount++;
  }
}

function assertFileNotContains(filePath, phrase) {
  if (!fs.existsSync(filePath)) {
    console.log(`[FAIL] Cannot inspect missing file: ${filePath}`);
    failCount++;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(phrase)) {
    console.log(`[PASS] File [${filePath}] does not contain prohibited phrase: "${phrase}"`);
    passCount++;
  } else {
    console.log(`[FAIL] File [${filePath}] contains prohibited phrase: "${phrase}"`);
    failCount++;
  }
}

// 1. Service files existence
assertFileExists('services/productionStorageGuardService.ts');
assertFileExists('services/environmentPreflightService.ts');
assertFileExists('services/productionReadinessGateService.ts');

// 2. Documentation files existence
assertFileExists('docs/PAYMENTLESS_PRODUCTION_DATA_CUTOVER_MATRIX.md');
assertFileExists('docs/PAYMENTLESS_PRODUCTION_HOSTING_DOMAIN_SSL_PREFLIGHT.md');
assertFileExists('docs/PAYMENTLESS_PRODUCTION_BACKUP_RESTORE_RUNBOOK.md');
assertFileExists('docs/MANUAL_BILLING_LIVE_SMOKE_TEST.md');

// 3. Persistent database blockers in readiness gate
assertFileContains('services/productionReadinessGateService.ts', 'hasPersistentDb');
assertFileContains('services/productionReadinessGateService.ts', 'rlsVerified');
assertFileContains('services/productionReadinessGateService.ts', 'authConfigured');

// 4. storage guard rules
assertFileContains('services/productionStorageGuardService.ts', 'isLocalStorageAllowedForDomain');
assertFileContains('services/productionStorageGuardService.ts', 'assertLiveDataSourceAllowed');

// 5. Paymentless mode assertions
assertFileContains('services/productionStorageGuardService.ts', 'paymentless_limited_production');
assertFileContains('services/launchModeService.ts', 'paymentless_limited_production');

// 6. Manual billing states
assertFileContains('services/productionReadinessGateService.ts', 'paymentless_limited_production');
assertFileContains('services/productionReadinessGateService.ts', 'offline_payment');

// 7. Security constraints (no raw card / service-role key)
assertFileNotContains('services/supabaseClient.ts', 'service-role-key');
assertFileNotContains('services/supabaseClient.ts', 'secret-key');

// 8. Copy constraints on Pricing & Registration pages
assertFileNotContains('pages/PricingPage.tsx', 'kredi kartı gerekmez');
assertFileNotContains('pages/PricingPage.tsx', 'kart gerekmez');
assertFileNotContains('pages/PricingPage.tsx', 'no credit card');
assertFileNotContains('pages/PricingPage.tsx', 'no card');
assertFileNotContains('pages/PricingPage.tsx', '7 gün');
assertFileNotContains('pages/PricingPage.tsx', '7-day');

assertFileNotContains('pages/RegistrationPage.tsx', 'kredi kartı gerekmez');
assertFileNotContains('pages/RegistrationPage.tsx', 'kart gerekmez');
assertFileNotContains('pages/RegistrationPage.tsx', 'no credit card');
assertFileNotContains('pages/RegistrationPage.tsx', 'no card');
assertFileNotContains('pages/RegistrationPage.tsx', '7 gün');
assertFileNotContains('pages/RegistrationPage.tsx', '7-day');

// 9. Brand & Domain consistency
assertFileContains('services/marketConfigService.ts', "brandName: 'LARİ'");
assertFileContains('services/marketConfigService.ts', "primaryDomain: 'randevulari.com'");

// 10. Manual billing smoke test checks
assertFileContains('docs/MANUAL_BILLING_LIVE_SMOKE_TEST.md', 'offline_payment');
assertFileContains('docs/MANUAL_BILLING_LIVE_SMOKE_TEST.md', 'manual_active');
assertFileContains('docs/MANUAL_BILLING_LIVE_SMOKE_TEST.md', 'Vogue Erkek Kuaförü');

// Summarize
console.log(`\n=== QA VERIFICATION RESULTS ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.log(`\n[ERROR] One or more QA assertions failed. Fix issues before production deployment!`);
  process.exit(1);
} else {
  console.log(`\n[SUCCESS] All paymentless production technical cutover assertions passed!`);
  process.exit(0);
}
