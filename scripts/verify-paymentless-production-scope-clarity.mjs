import fs from 'fs';
import path from 'path';

console.log('=== RUNNING PAYMENTLESS PRODUCTION SCOPE CLARITY QA VERIFICATION ===\n');

let passCount = 0;
let failCount = 0;

function safeLower(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/ı/g, 'i')
    .toLowerCase();
}

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
  if (safeLower(content).includes(safeLower(phrase))) {
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
  if (!safeLower(content).includes(safeLower(phrase))) {
    console.log(`[PASS] File [${filePath}] does not contain prohibited phrase: "${phrase}"`);
    passCount++;
  } else {
    console.log(`[FAIL] File [${filePath}] contains prohibited phrase: "${phrase}"`);
    failCount++;
  }
}

// 1. Verify existence of PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md
assertFileExists('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md');

// 2. Verify distinction between tenant access and system handover
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'kiracı');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'devredilmez');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'SaaS');

// 3. Verify that Super Admin remains LARI-only
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'Super Admin');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'yalnızca LARİ');

// 4. Verify that source code / infrastructure remains LARI-only
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'Kaynak kodu');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'altyapı ve veritabanı kontrolü');

// 5. Verify salons receive owner/admin workspace access only
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'İşletme Sahibi/Yönetici Paneli (Owner/Admin Workspace)');

// 6. Verify online payment remains disabled
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'online kredi kartı tahsilat kanalları tamamen devre dışı bırakılarak');

// 7. Verify manual activation is subscription activation, not system transfer
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'aktive');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'teslim');

// 8. Verify persistent database requirement is documented
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'localStorage');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'Supabase');

// 9. Verify brand and domain strategy
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'LARİ');
assertFileContains('docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md', 'randevulari.com');

// 10. Verify runbook modifications
assertFileContains('docs/MANUAL_TENANT_ACTIVATION_LIVE_RUNBOOK.md', 'kaynak kodu veya sahiplik devredilmemektedir');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'kaynak kodları');
assertFileContains('docs/MANUAL_BILLING_TENANT_OPERATIONS.md', 'LARİ\'ye aittir');
assertFileContains('docs/OFFLINE_PAYMENT_LAUNCH_READINESS.md', 'sistem kurulumu veya kaynak kodu devri söz konusu değildir');

// 11. No live iyzico claim or automatic recurring billing claim in main copy
assertFileNotContains('pages/PricingPage.tsx', 'kredi kartı gerekmez');
assertFileNotContains('pages/PricingPage.tsx', 'kart gerekmez');
assertFileNotContains('pages/RegistrationPage.tsx', 'kredi kartı gerekmez');
assertFileNotContains('pages/RegistrationPage.tsx', 'kart gerekmez');

// 12. No 7-day copy (LARI uses 14-day free trials if trial is shown)
assertFileNotContains('pages/PricingPage.tsx', '7 gün');
assertFileNotContains('pages/PricingPage.tsx', '7-day');
assertFileNotContains('pages/RegistrationPage.tsx', '7 gün');
assertFileNotContains('pages/RegistrationPage.tsx', '7-day');

console.log(`\n=== QA SUMMARY ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\n[FAIL] Scope clarity QA checks failed.');
  process.exit(1);
} else {
  console.log('\n[PASS] All scope clarity QA checks passed successfully.');
  process.exit(0);
}
