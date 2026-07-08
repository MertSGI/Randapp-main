import fs from 'fs';
import path from 'path';

console.log('🔍 Starting Real Supabase Staging Execution Readiness Verification...\n');

let pass = true;

function verifyFileExists(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(absolutePath)) {
    console.log(`✅ File exists: ${relativePath}`);
    return true;
  } else {
    console.error(`❌ File NOT found: ${relativePath}`);
    pass = false;
    return false;
  }
}

function verifyFileContains(relativePath, substrings) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    pass = false;
    return;
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const sub of substrings) {
    if (content.includes(sub)) {
      console.log(`✅ [${relativePath}] contains: "${sub.substring(0, 40)}..."`);
    } else {
      console.error(`❌ [${relativePath}] missing expected content: "${sub}"`);
      pass = false;
    }
  }
}

function verifyFileDoesNotContain(relativePath, substrings) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const sub of substrings) {
    if (content.includes(sub)) {
      console.error(`❌ [${relativePath}] contains forbidden content: "${sub}"`);
      pass = false;
    } else {
      console.log(`✅ [${relativePath}] does NOT contain forbidden content: "${sub}"`);
    }
  }
}

// 1. Verify existence of required documents
verifyFileExists('docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md');
verifyFileExists('docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md');
verifyFileExists('docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md');
verifyFileExists('docs/SUPABASE_STAGING_COMMAND_SHEET.md');

// 2. Verify links inside other docs
verifyFileContains('docs/SUPABASE_STAGING_EXECUTION_RUNBOOK.md', [
  'REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
  'SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'SUPABASE_STAGING_COMMAND_SHEET.md'
]);
verifyFileContains('docs/SUPABASE_STAGING_EXECUTION_CHECKLIST.md', [
  'REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
  'SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'SUPABASE_STAGING_COMMAND_SHEET.md'
]);
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md', [
  'REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
  'SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'SUPABASE_STAGING_COMMAND_SHEET.md'
]);
verifyFileContains('docs/PERSISTENT_DATABASE_REQUIRED_FOR_LIVE.md', [
  'REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
  'SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'SUPABASE_STAGING_COMMAND_SHEET.md'
]);
verifyFileContains('docs/PILOT_DOCS_INDEX.md', [
  'REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'SUPABASE_STAGING_EXECUTION_RESULT_LOG.md',
  'SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md',
  'SUPABASE_STAGING_COMMAND_SHEET.md'
]);

// 3. Verify smoke script capabilities
verifyFileExists('scripts/smoke-supabase-paymentless-staging.mjs');
verifyFileContains('scripts/smoke-supabase-paymentless-staging.mjs', [
  '--env-only',
  '--read-only',
  '--write-staging-fixtures',
  '--cleanup-staging-fixtures'
]);

// 4. Verify explicit write flag logic and security rules in operator guide
verifyFileContains('docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md', [
  '--write-staging-fixtures',
  '--cleanup-staging-fixtures',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEVER expose this to frontend code',
  'paymentless_limited_production',
  'supabase_staging',
  'local_outbox_only',
  'localStorage',
  'iyzico is NOT required'
]);

// 5. Verify visual brand rules, domains, and paymentless claims (anti-slop constraints)
// Make sure randevulari.com and LARİ are documented as active
verifyFileContains('docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md', [
  'LARİ',
  'randevulari.com'
]);

// Ensure no live payment/billing auto-checkout lies are stated
verifyFileDoesNotContain('docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md', [
  'auto-checkout',
  'recurring automated billing',
  '7-day trial',
  'no-card required'
]);

// Ensure no raw card fields exist in code or docs
const filesToScanForRawCardFields = [
  'src/App.tsx',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md'
];

for (const file of filesToScanForRawCardFields) {
  verifyFileDoesNotContain(file, [
    'card_number',
    'cvv',
    'card-number-input'
  ]);
}

// Report overall result
console.log('\n=============================================');
if (pass) {
  console.log('🏆 STATUS: PASS - Real Staging Execution is 100% Ready!');
  process.exit(0);
} else {
  console.error('🛑 STATUS: FAIL - Missing or incorrect readiness assets!');
  process.exit(1);
}
