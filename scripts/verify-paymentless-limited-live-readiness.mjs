import fs from 'fs';
import path from 'path';

console.log('=== RUNNING PAYMENTLESS LIMITED LIVE READINESS QA VERIFICATION ===\n');

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

// 1. Verify files exist
assertFileExists('services/launchModeService.ts');
assertFileExists('docs/PAYMENTLESS_LIMITED_LIVE_LAUNCH_PLAN.md');
assertFileExists('docs/MANUAL_BILLING_TENANT_OPERATIONS.md');
assertFileExists('docs/LIMITED_LIVE_MINIMUM_INFRASTRUCTURE_CHECKLIST.md');
assertFileExists('docs/ONLINE_PAYMENT_ENABLEMENT_LATER_PLAN.md');

// 2. Verify launchModeService implementation
assertFileContains('services/launchModeService.ts', 'limited_live_manual_billing');
assertFileContains('services/launchModeService.ts', 'isOnlinePaymentEnabled');
assertFileContains('services/launchModeService.ts', 'isManualBillingEnabled');
assertFileContains('services/launchModeService.ts', 'isLiveProviderRequired');

// 3. Verify page updates
assertFileContains('pages/PricingPage.tsx', 'launchModeService.isOnlinePaymentEnabled()');
assertFileContains('pages/RegistrationPage.tsx', 'launchModeService.isOnlinePaymentEnabled()');
assertFileContains('components/BillingTab.tsx', 'launchModeService.isOnlinePaymentEnabled()');
assertFileContains('pages/super-admin/SuperAdminPilotTrackerPage.tsx', 'launchModeService.getLaunchModeReadinessSummary()');

// 4. Verify Turkish terminology and brand strategies in documents
assertFileContains('docs/PAYMENTLESS_LIMITED_LIVE_LAUNCH_PLAN.md', 'randevulari.com');
assertFileContains('docs/PAYMENTLESS_LIMITED_LIVE_LAUNCH_PLAN.md', 'LARİ');
assertFileContains('docs/PAYMENTLESS_LIMITED_LIVE_LAUNCH_PLAN.md', 'manual_active');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'manual_active');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'offline_payment');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'manual_invoice');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'complimentary');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'pilot_exception');

// 5. Verify strict negative prohibitions (No false claims)
const prohibitedPhrases = [
  'automatic recurring card billing',
  'live iyzico',
  'active custom DNS'
];

for (const phrase of prohibitedPhrases) {
  assertFileDoesNotContain('docs/PAYMENTLESS_LIMITED_LIVE_LAUNCH_PLAN.md', phrase);
  assertFileDoesNotContain('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', phrase);
}

// 6. Verify avoid forbidden claims in customer messaging
const marketingFiles = [
  'pages/PricingPage.tsx',
  'pages/RegistrationPage.tsx'
];

const forbiddenClaims = [
  'kredi kartı gerekmez',
  'kart gerekmez',
  'no credit card',
  'no card'
];

for (const file of marketingFiles) {
  for (const claim of forbiddenClaims) {
    assertFileDoesNotContain(file, claim);
  }
}

console.log('\n=== PAYMENTLESS LIMITED LIVE READINESS QA COMPLETE ===\n');

if (failed) {
  console.error('[FAIL] QA completed with failures.');
  process.exit(1);
} else {
  console.log('[SUCCESS] All assertions passed!');
  process.exit(0);
}
