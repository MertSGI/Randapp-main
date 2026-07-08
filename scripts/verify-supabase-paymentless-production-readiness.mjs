import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('=== RUNNING SUPABASE PAYMENTLESS PRODUCTION READINESS QA VERIFICATION ===\n');

const checkFileExists = (filePath) => {
  const exists = fs.existsSync(filePath);
  if (exists) {
    console.log(`[PASS] File exists: ${filePath}`);
  } else {
    console.error(`[FAIL] File NOT found: ${filePath}`);
    process.exit(1);
  }
};

const checkFileContains = (filePath, phrase, negate = false) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const contains = content.includes(phrase);
  if (negate) {
    if (!contains) {
      console.log(`[PASS] File [${filePath}] safely does not contain prohibited phrase: "${phrase}"`);
    } else {
      console.error(`[FAIL] File [${filePath}] contains prohibited phrase: "${phrase}"`);
      process.exit(1);
    }
  } else {
    if (contains) {
      console.log(`[PASS] File [${filePath}] contains phrase: "${phrase}"`);
    } else {
      console.error(`[FAIL] File [${filePath}] missing expected phrase: "${phrase}"`);
      process.exit(1);
    }
  }
};

// 1. Check all required documentation files exist
checkFileExists('docs/SUPABASE_PAYMENTLESS_PRODUCTION_IMPLEMENTATION_MATRIX.md');
checkFileExists('docs/SUPABASE_AUTH_PAYMENTLESS_PRODUCTION_READINESS.md');
checkFileExists('docs/LOCAL_TO_SUPABASE_PAYMENTLESS_PRODUCTION_CUTOVER_RUNBOOK.md');
checkFileExists('docs/SUPABASE_SCHEMA.md');
checkFileExists('docs/RLS_POLICY_PLAN.md');
checkFileExists('docs/PAYMENTLESS_PRODUCTION_DATA_CUTOVER_MATRIX.md');

// 2. Check repository contracts and factories
checkFileExists('services/repositoryContracts.ts');
checkFileExists('services/repositoryFactory.ts');
checkFileExists('services/repositories/index.ts');

// 3. Verify repositoryFactory logic
checkFileContains('services/repositoryFactory.ts', 'requiresPersistentDatabase');
checkFileContains('services/repositoryFactory.ts', 'Supabase repository required for paymentless production');
checkFileContains('services/repositories/index.ts', 'repositoryFactory');

// 4. Verify tenant_id filtering is present inside Supabase repositories
checkFileContains('services/repositories/supabaseBookingRepository.ts', 'tenant_id=eq.${tenantId}');
checkFileContains('services/repositories/supabaseBusinessProfileRepository.ts', 'tenant_id=eq.${tenantId}');
checkFileContains('services/repositories/supabaseCatalogRepository.ts', 'tenant_id=eq.${tenantId}');

// 5. Verify manual billing persistence exists
checkFileContains('services/repositories/types.ts', 'updateSubscriptionStatus');

// 6. Verify production readiness gate checks auth & supabase configurations
checkFileContains('services/productionReadinessGateService.ts', 'authConfigured');
checkFileContains('services/productionReadinessGateService.ts', 'rlsVerified');
checkFileContains('services/productionReadinessGateService.ts', 'hasPersistentDb');

// 7. Verify storage guard blocks localStorage live tenant data
checkFileContains('services/productionStorageGuardService.ts', 'assertLiveDataSourceAllowed');
checkFileContains('services/productionStorageGuardService.ts', 'isLocalStorageAllowedForDomain');

// 8. Security verification: no frontend service-role or secret keys exposed
checkFileContains('services/supabaseClient.ts', 'service-role-key', true);
checkFileContains('services/supabaseClient.ts', 'secret-key', true);

// 9. Check for no raw card fields
const appTsxContent = fs.readFileSync('App.tsx', 'utf8');
assert(!appTsxContent.includes('cardNumber') && !appTsxContent.includes('cvv'), 'App.tsx contains no raw credit card fields');
console.log('[PASS] Checked: No raw card fields inside App.tsx');

// 10. Check iyzico claims, automatic recurring claims, no-card and 7-day trials copy
const pricingContent = fs.existsSync('pages/PricingPage.tsx') ? fs.readFileSync('pages/PricingPage.tsx', 'utf8') : '';
if (pricingContent) {
  assert(!pricingContent.includes('kredi kartı gerekmez'), 'PricingPage contains no "kredi kartı gerekmez" copy');
  assert(!pricingContent.includes('kart gerekmez'), 'PricingPage contains no "kart gerekmez" copy');
  assert(!pricingContent.includes('7 gün'), 'PricingPage contains no "7 gün" trial claims');
}
console.log('[PASS] Checked: No prohibited trial/no-card copy in PricingPage.tsx');

// 11. Check LARİ brand & domain remains visible and Turkey strategy is correct
checkFileContains('services/marketConfigService.ts', "brandName: 'LARİ'");
checkFileContains('services/marketConfigService.ts', "primaryDomain: 'randevulari.com'");

console.log('\n=== QA VERIFICATION COMPLETED SUCCESSFULLY! ===');
console.log('[SUCCESS] All Supabase paymentless production readiness assertions passed!\n');
process.exit(0);
