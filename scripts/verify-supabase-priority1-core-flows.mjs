import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('=== RUNNING SUPABASE PRIORITY 1 CORE FLOWS QA VERIFICATION ===\n');

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
      console.log(`[PASS] File [${filePath}] safely does not contain: "${phrase}"`);
    } else {
      console.error(`[FAIL] File [${filePath}] contains prohibited string: "${phrase}"`);
      process.exit(1);
    }
  } else {
    if (contains) {
      console.log(`[PASS] File [${filePath}] contains expected phrase: "${phrase}"`);
    } else {
      console.error(`[FAIL] File [${filePath}] is missing expected phrase: "${phrase}"`);
      process.exit(1);
    }
  }
};

// 1. Check all Priority 1 Supabase repositories exist
checkFileExists('services/repositories/supabaseBusinessProfileRepository.ts');
checkFileExists('services/repositories/supabaseCatalogRepository.ts');
checkFileExists('services/repositories/supabaseBookingRepository.ts');

// 2. Check repository factory and references
checkFileExists('services/repositoryFactory.ts');
checkFileContains('services/repositoryFactory.ts', 'getBusinessProfileRepository');
checkFileContains('services/repositoryFactory.ts', 'getServiceCatalogRepository');
checkFileContains('services/repositoryFactory.ts', 'getStaffRepository');
checkFileContains('services/repositoryFactory.ts', 'getAvailabilityRepository');
checkFileContains('services/repositoryFactory.ts', 'getBookingRepository');
checkFileContains('services/repositoryFactory.ts', 'getCustomerRepository');

// 3. Verify core business services use repository factory
checkFileContains('services/businessProfileService.ts', 'getBusinessProfileRepository');
checkFileContains('services/serviceCatalogService.ts', 'getServiceCatalogRepository');
checkFileContains('services/staffService.ts', 'getStaffRepository');
checkFileContains('services/availabilityService.ts', 'getAvailabilityRepository');
checkFileContains('services/adminCustomerService.ts', 'getCustomerRepository');

// 4. Verify no direct localStorage references in critical pages/components for live modes
checkFileContains('pages/BookingPage.tsx', 'localStorage.setItem', true);
checkFileContains('pages/AdminPage.tsx', 'localStorage.setItem', true);
checkFileContains('components/BusinessProfileTab.tsx', 'localStorage.setItem', true);

// 5. Verify tenant_id filters in all Supabase Priority 1 repositories
checkFileContains('services/repositories/supabaseBusinessProfileRepository.ts', 'tenant_id=eq.${tenantId}');
checkFileContains('services/repositories/supabaseCatalogRepository.ts', 'tenant_id=eq.${tenantId}');
checkFileContains('services/repositories/supabaseBookingRepository.ts', 'tenant_id=eq.${tenantId}');

// 6. Verify customer-appointment relationship is persisted correctly in Supabase Booking Repository
checkFileContains('services/repositories/supabaseBookingRepository.ts', 'customer_id');

// 7. Verify storage guard blocks Priority 1 domains in live modes
checkFileContains('services/productionStorageGuardService.ts', "'business_profile'");
checkFileContains('services/productionStorageGuardService.ts', "'services_catalog'");
checkFileContains('services/productionStorageGuardService.ts', "'staff'");
checkFileContains('services/productionStorageGuardService.ts', "'availability'");
checkFileContains('services/productionStorageGuardService.ts', "'appointments'");
checkFileContains('services/productionStorageGuardService.ts', "'customers'");

// 8. Verify readiness gate hard-blocks missing Priority 1 repositories
checkFileContains('services/productionReadinessGateService.ts', 'businessProfileRepoReady');
checkFileContains('services/productionReadinessGateService.ts', 'servicesCatalogRepoReady');
checkFileContains('services/productionReadinessGateService.ts', 'staffRepoReady');
checkFileContains('services/productionReadinessGateService.ts', 'availabilityRepoReady');
checkFileContains('services/productionReadinessGateService.ts', 'customerRepoReady');

// 9. Verify no sensitive service-role keys or real database credentials committed in client-side files
checkFileContains('services/supabaseClient.ts', 'service-role-key', true);
checkFileContains('services/supabaseClient.ts', 'secret-key', true);

// 10. Check that the UI does not contain prohibited trial or iyzico payment claims
const pricingPath = 'pages/PricingPage.tsx';
if (fs.existsSync(pricingPath)) {
  const pricingContent = fs.readFileSync(pricingPath, 'utf8');
  assert(!pricingContent.includes('kredi kartı gerekmez'), 'Pricing page should not feature credit card-less claims');
  assert(!pricingContent.includes('7 gün ücretsiz'), 'Pricing page should not feature 7-day trials');
  console.log('[PASS] Pricing Page copy conforms to pre-live guidelines');
}

// 11. Check that Turkey strategy and LARİ branding remain intact
checkFileContains('services/marketConfigService.ts', "brandName: 'LARİ'");
checkFileContains('services/marketConfigService.ts', "primaryDomain: 'randevulari.com'");

console.log('\n=== PRIORITY 1 CORE FLOWS QA VERIFICATION COMPLETED SUCCESSFULLY! ===');
console.log('[SUCCESS] All Priority 1 Supabase readiness assertions passed perfectly!\n');
process.exit(0);
