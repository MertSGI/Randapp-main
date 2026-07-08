import fs from 'fs';
import path from 'path';

console.log('🔍 Starting Paymentless Production Go/No-Go Readiness Verification...\n');

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
    if (content.toLowerCase().includes(sub.toLowerCase())) {
      console.log(`✅ [${relativePath}] contains expected: "${sub.substring(0, 50)}..."`);
    } else {
      console.error(`❌ [${relativePath}] missing expected: "${sub}"`);
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
    if (content.toLowerCase().includes(sub.toLowerCase())) {
      console.error(`❌ [${relativePath}] contains forbidden content: "${sub}"`);
      pass = false;
    } else {
      console.log(`✅ [${relativePath}] does NOT contain forbidden content: "${sub}"`);
    }
  }
}

// 1. Verify existence of Go/No-Go report and Result Log
verifyFileExists('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md');
verifyFileExists('docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md');

// 2. Verify Go/No-Go report does not declare a premature GO and contains required terms (case-insensitive checks)
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md', [
  'DECISION',
  'NO-GO FOR PAYMENTLESS PRODUCTION',
  'REASON',
  'Real Supabase staging execution result is not yet PASS',
  'STATUS',
  'READY TO START REAL SUPABASE STAGING EXECUTION',
  'Real Supabase Staging Execution',
  'NOT RUN',
  'Migration Push to Real Supabase',
  'Auth User Creation',
  'users_profile Mapping',
  'Seed SQL Execution',
  'RLS SQL Smoke Test',
  'App-Level Read-Only Smoke',
  'App-Level Write Smoke',
  'Browser Smoke',
  'Paymentless Production Decision',
  'NO-GO UNTIL ALL ABOVE PASS',
  'GO only after real staging result log is PASS',
  'CONDITIONAL GO only if no security/data isolation issues exist',
  'NO-GO if staging is not run or result log is incomplete'
]);

// 3. Verify cutover plan says staging PASS is required
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_CUTOVER_PLAN.md', [
  'STAGING RUN PASS IS MANDATORY',
  'paymentless production cutover strictly requires a successful real staging smoke test'
]);

// 4. Scan files for forbidden billing claims, mock indicators, or raw card UI elements
const documentsToScan = [
  'docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md',
  'docs/REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md',
  'docs/SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md'
];

for (const doc of documentsToScan) {
  verifyFileDoesNotContain(doc, [
    'auto-checkout',
    'recurring automated billing',
    '7-day trial',
    'no-card required',
    'card_number',
    'cvv',
    'card-number-input'
  ]);
}

// 5. Ensure NO real credentials or secrets are committed
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  if (envExample.includes('VITE_SUPABASE_URL=https') && !envExample.includes('VITE_SUPABASE_URL=\n') && !envExample.includes('VITE_SUPABASE_URL= ')) {
    console.error('❌ .env.example appears to contain live credentials!');
    pass = false;
  } else {
    console.log('✅ .env.example contains no real live credentials.');
  }
}

// 6. Ensure LARİ remains the visible brand & randevulari.com is Turkey domain strategy
verifyFileContains('docs/PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md', [
  'LARİ',
  'randevulari.com'
]);

// Report overall result
console.log('\n=============================================');
if (pass) {
  console.log('🏆 STATUS: PASS - Go/No-Go Verification Succeeded!');
  process.exit(0);
} else {
  console.error('🛑 STATUS: FAIL - Go/No-Go verification failed or contains misleading claims!');
  process.exit(1);
}
