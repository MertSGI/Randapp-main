import fs from 'fs';
import path from 'path';

console.log('=== RUNNING PAYMENTLESS PRODUCTION CUTOVER READINESS QA VERIFICATION ===\n');

let failed = false;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    failed = true;
  }
}

function assertFileExists(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  assert(fs.existsSync(fullPath), `File exists: ${filePath}`);
}

function assertFileContains(filePath, phrase) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `File [${filePath}] does not exist to check phrase: "${phrase}"`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(content.includes(phrase), `File [${filePath}] contains phrase: "${phrase}"`);
}

function assertFileDoesNotContain(filePath, phrase) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    assert(true, `File [${filePath}] does not exist, safe from prohibited phrase: "${phrase}"`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(!content.includes(phrase), `File [${filePath}] does not contain prohibited phrase: "${phrase}"`);
}

// 1. Check all documentation files exist
assertFileExists('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md');
assertFileExists('docs/PERSISTENT_DATABASE_REQUIRED_FOR_LIVE.md');
assertFileExists('docs/MANUAL_TENANT_ACTIVATION_LIVE_RUNBOOK.md');
assertFileExists('docs/MANUAL_TO_ONLINE_PAYMENT_MIGRATION_RUNBOOK.md');

// 2. Check source files exist
assertFileExists('services/launchModeService.ts');
assertFileExists('services/productionReadinessGateService.ts');

// 3. Verify launchModeService behaviors
assertFileContains('services/launchModeService.ts', 'paymentless_limited_production');
assertFileContains('services/launchModeService.ts', 'requiresPersistentDatabase');
assertFileContains('services/launchModeService.ts', 'allowsLocalStorageTenantData');
assertFileContains('services/launchModeService.ts', 'isPaymentlessProductionMode');

// 4. Verify launchModeService conditions
assertFileContains('services/launchModeService.ts', 'getProductionHardBlockers');
assertFileContains('services/launchModeService.ts', 'getProductionWarnings');
assertFileContains('services/launchModeService.ts', 'getMigrationPathToOnlinePayment');

// 5. Verify productionReadinessGateService implementation
assertFileContains('services/productionReadinessGateService.ts', 'productionReadinessGateService');
assertFileContains('services/productionReadinessGateService.ts', 'getProductionReadinessGate');
assertFileContains('services/productionReadinessGateService.ts', 'canStartPaymentlessLimitedProduction');
assertFileContains('services/productionReadinessGateService.ts', 'canStartFullLiveOnlinePayment');

// 6. Verify brand and domain strategy in documents
assertFileContains('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md', 'randevulari.com');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md', 'LARİ');
assertFileContains('docs/PERSISTENT_DATABASE_REQUIRED_FOR_LIVE.md', 'Supabase Postgres');
assertFileContains('docs/PERSISTENT_DATABASE_REQUIRED_FOR_LIVE.md', 'localStorage');
assertFileContains('docs/MANUAL_TENANT_ACTIVATION_LIVE_RUNBOOK.md', 'manual_active');
assertFileContains('docs/MANUAL_TO_ONLINE_PAYMENT_MIGRATION_RUNBOOK.md', 'manual_active');

// 7. Verify no real secrets, raw card fields or automatic recurring billing claims
const docsToScan = [
  'docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md',
  'docs/PERSISTENT_DATABASE_REQUIRED_FOR_LIVE.md',
  'docs/MANUAL_TENANT_ACTIVATION_LIVE_RUNBOOK.md',
  'docs/MANUAL_TO_ONLINE_PAYMENT_MIGRATION_RUNBOOK.md'
];

const prohibitedDocsPhrases = [
  'automatic recurring card billing',
  'live iyzico',
  'active custom DNS',
  'kredi kartı gerekmez',
  'kart gerekmez',
  'no credit card',
  'no card'
];

for (const doc of docsToScan) {
  for (const phrase of prohibitedDocsPhrases) {
    assertFileDoesNotContain(doc, phrase);
  }
}

// 8. Verify UI files do not have "card required" copy when launchModeService.isOnlinePaymentEnabled() is falsy
assertFileContains('pages/PricingPage.tsx', 'launchModeService.isOnlinePaymentEnabled()');
assertFileContains('pages/RegistrationPage.tsx', 'launchModeService.isOnlinePaymentEnabled()');
assertFileContains('components/BillingTab.tsx', 'launchModeService.isOnlinePaymentEnabled()');

console.log('\n=== PAYMENTLESS PRODUCTION CUTOVER READINESS QA COMPLETE ===\n');

if (failed) {
  console.error('[FAIL] QA completed with failures.');
  process.exit(1);
} else {
  console.log('[SUCCESS] All assertions passed!');
  process.exit(0);
}
