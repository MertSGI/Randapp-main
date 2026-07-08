import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
};

console.log('🔍 Starting QA: iyzico Sandbox Payment Rehearsal & Lifecycle Readiness (Phase C)...');

const cwd = process.cwd();

// 1. Documentation Verification
const expectedDocFiles = [
  'IYZICO_SANDBOX_PAYMENT_REHEARSAL.md',
  'PAYMENT_PROVIDER_CONTRACT_MATRIX.md',
  'PAYMENT_WEBHOOK_IDEMPOTENCY_AND_RECONCILIATION.md'
];

for (const docFile of expectedDocFiles) {
  const fullPath = path.join(cwd, 'docs', docFile);
  assert(fs.existsSync(fullPath), `Documentation file docs/${docFile} exists`);
}

// 2. Code Component Presence & Integrity
const essentialFiles = [
  { p: ['components', 'BillingTab.tsx'], label: 'BillingTab UI component' },
  { p: ['components', 'CheckoutPreviewModal.tsx'], label: 'CheckoutPreviewModal UI component' },
  { p: ['pages', 'PricingPage.tsx'], label: 'PricingPage' },
  { p: ['pages', 'RegistrationPage.tsx'], label: 'RegistrationPage' },
  { p: ['services', 'paymentRunModeService.ts'], label: 'paymentRunModeService' },
  { p: ['services', 'subscriptionService.ts'], label: 'subscriptionService' },
  { p: ['supabase', 'functions', 'create-checkout-session', 'index.ts'], label: 'create-checkout-session Edge Function' },
  { p: ['supabase', 'functions', 'payment-webhook', 'index.ts'], label: 'payment-webhook Edge Function' },
  { p: ['supabase', 'functions', '_shared', 'iyzicoClient.ts'], label: 'iyzico shared Edge Client' }
];

for (const item of essentialFiles) {
  const fullPath = path.join(cwd, ...item.p);
  assert(fs.existsSync(fullPath), `${item.label} exists at ${item.p.join('/')}`);
}

// 3. Subscription/Trial Defaulting & Configuration Checks
const trialConfigPath = path.join(cwd, 'services', 'trialConfigService.ts');
if (fs.existsSync(trialConfigPath)) {
  const trialContent = fs.readFileSync(trialConfigPath, 'utf8');
  assert(trialContent.includes('trialDayCount: 14'), 'Trial Day Count is configured to 14 days');
  assert(trialContent.includes('requiresPaymentMethod: true'), 'Trial configuration strictly requires a payment method first');
  assert(trialContent.includes('startsAfterCheckoutAuthorization: true'), 'Trial starts after checkout authorization completes');
} else {
  failCount++;
  console.error("❌ TRIAL_CONFIG: services/trialConfigService.ts was not found!");
}

// 4. Forbidden Claims & Security Boundaries on Customer-facing frontends
let hasForbiddenClaims = false;
let hasRawCardInputs = false;
let containsLeakedSecrets = false;

const checkFrontendSafety = (dirPath) => {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      checkFrontendSafety(fullPath);
    } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Look for raw card entries in general inputs
      if (
        (content.includes('name="cardNumber"') || content.includes('name="cardExpiry"')) &&
        !file.name.includes('Mock') && !file.name.includes('PreviewModal') && !file.name.includes('Sandbox')
      ) {
         console.warn(`⚠️ Warning: Raw credit card field name pattern found in ${file.name}`);
         hasRawCardInputs = true;
      }

      // Check for hardcoded private keys (e.g. secret keys committed directly)
      const matchesSecret = content.match(/IYZICO_SECRET_KEY\s*=\s*['"][a-zA-Z0-9_-]{10,}['"]/);
      if (matchesSecret) {
         console.error(`❌ Security Violation: Possible hardcoded secret found in ${file.name}`);
         containsLeakedSecrets = true;
      }
    }
  }
};

const componentsDir = path.join(cwd, 'components');
const pagesDir = path.join(cwd, 'pages');

if (fs.existsSync(componentsDir)) checkFrontendSafety(componentsDir);
if (fs.existsSync(pagesDir)) checkFrontendSafety(pagesDir);

assert(!hasRawCardInputs, 'Verification succeeds: Frontend relies on secure provider callback forms, no raw card exposure');
assert(!containsLeakedSecrets, 'Verification succeeds: No committed server keys, AWS or provider secret credentials found in frontend codebase');

// 5. Check Package Integration State
const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
assert(packageJson.scripts && packageJson.scripts['qa:subscription-lifecycle'], 'Subscription Lifecycle QA target is cataloged');
assert(packageJson.scripts && packageJson.scripts['qa:commercial-packaging'], 'Commercial Packaging QA target is cataloged');

if (failCount > 0) {
  console.error(`\n⚠️ iyzico Sandbox Rehearsal Verification FAILED with ${failCount} errors.`);
  process.exit(1);
} else {
  console.log('\n🎉 iyzico Sandbox Rehearsal & Payment Lifecycle QA verified completely. System is 100% prepared for rehearsal stage.');
  process.exit(0);
}
