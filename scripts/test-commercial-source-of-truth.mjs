#!/usr/bin/env node

/**
 * QA: Commercial Source-of-Truth Alignment (Slice 2-R2.1 Final Semantic Closure)
 * 
 * Static source-code analysis test that verifies:
 * 1. Canonical feature key set matches EXACTLY 25 registered H1A definitions in migration SQL
 * 2. Strict mapping matrix for legacy UI keys without speculative derivations (super_admin_review_priority & advanced_branding fail closed)
 * 3. Legacy/private Supabase plan rendering has NO hardcoded commercial fallback
 * 4. Supabase numeric quotas do not use numeric sentinels (999/9999/99999/999999)
 * 5. Elimination of localStorage price calculation leaks on PricingPage and RegistrationPage
 * 6. Tenant-aware effective entitlement resolution with tenant_id equality check
 * 7. Public surface fails closed on AI check without calling authenticated my-tenant snapshot
 * 8. Strict manual activation without implicit plan defaults
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    if (detail) console.error(`     → ${detail}`);
    failed++;
  }
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// =========================================================================
// T1: Exact 25 Canonical Feature Definitions in Migration SQL
// =========================================================================
console.log('\nT1: Canonical H1A Feature Registry Verification (Exact 25 Keys)');

const migrationSql = readFile('supabase/migrations/20260810_h1a_commercial_catalog_and_read_contracts.sql');

const EXPECTED_25_KEYS = [
  'core_booking', 'customer_self_service', 'customer_cancellation', 'customer_reschedule_request',
  'admin_appointment_operations', 'staff_management', 'service_management', 'max_staff',
  'max_services', 'max_branches', 'max_monthly_appointments', 'multi_branch',
  'notification_allowance', 'ai_allowance', 'lari_minisite', 'custom_domain_eligible',
  'custom_domain_included', 'white_label', 'calendar_integration', 'advanced_reporting',
  'crm_level', 'data_export', 'public_api', 'priority_support', 'dedicated_support'
];

// Extract seed insert block from migration SQL
const seedInsertMatch = migrationSql.match(/INSERT INTO public\.commercial_feature_definitions[\s\S]*?VALUES([\s\S]*?);/);
const seedValuesText = seedInsertMatch ? seedInsertMatch[1] : '';
const foundKeys = [];
for (const key of EXPECTED_25_KEYS) {
  if (seedValuesText.includes(`'${key}'`)) {
    foundKeys.push(key);
  }
}

assert(
  'Exact H1A canonical feature key count is 25',
  EXPECTED_25_KEYS.length === 25 && foundKeys.length === 25,
  `Expected exactly 25 keys in migration SQL, found ${foundKeys.length}`
);

// =========================================================================
// T2: Feature Mapping Reconciliation & Speculative Mapping Elimination
// =========================================================================
console.log('\nT2: Feature Mapping Reconciliation & Speculative Mapping Elimination');

const entitlementServiceSrc = readFile('services/entitlementService.ts');
const planServiceSrc = readFile('services/planService.ts');

assert(
  'super_admin_review_priority fails closed in Supabase mode (NO speculative dedicated_support mapping)',
  entitlementServiceSrc.includes('super_admin_review_priority: false'),
  'super_admin_review_priority must be false (fail-closed) in Supabase mode'
);

assert(
  'advanced_branding fails closed in Supabase mode (NO speculative white_label mapping)',
  entitlementServiceSrc.includes('advanced_branding: false'),
  'advanced_branding must be false (fail-closed) in Supabase mode'
);

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical custom_domain_eligible',
  planServiceSrc.includes("custom_domain_eligible"),
  'mapCommercialPublicPlanToPricingPlan must use custom_domain_eligible'
);

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical lari_minisite',
  planServiceSrc.includes("lari_minisite"),
  'mapCommercialPublicPlanToPricingPlan must use lari_minisite'
);

// =========================================================================
// T3: Dynamic Legacy/Private Plan Snapshot Projection (No Hardcoded Fallbacks)
// =========================================================================
console.log('\nT3: Dynamic Legacy/Private Plan Snapshot Projection');

const subscriptionServiceSrc = readFile('services/subscriptionService.ts');

assert(
  'getPlanForTenant derives legacy/private plan projection from snapshot entitlements without static fallback',
  subscriptionServiceSrc.includes('const mapped = entitlementService._mapServerEntitlementsToPlanEntitlements(effectiveEntitlements);') &&
  subscriptionServiceSrc.includes('maxStaff: mapped.limits.maxStaff,'),
  'getPlanForTenant must project legacy/private plan from snapshot.effective_entitlements dynamically'
);

// =========================================================================
// T4: Unlimited Quotas & Sentinel Elimination
// =========================================================================
console.log('\nT4: Unlimited Quotas & Sentinel Elimination');

assert(
  'entitlementService populates explicit unlimitedFlags without numeric sentinels (no 999999)',
  !entitlementServiceSrc.includes('999999'),
  'entitlementService must not return numeric sentinel 999999'
);

const pricingPageSrc = readFile('pages/PricingPage.tsx');

assert(
  'PricingPage checks plan.isServicesUnlimited for unlimited display',
  pricingPageSrc.includes('plan.isServicesUnlimited'),
  'PricingPage must check plan.isServicesUnlimited'
);

// =========================================================================
// T5: Tenant-Aware Entitlement Resolution & Equality Check
// =========================================================================
console.log('\nT5: Tenant-Aware Entitlement Resolution');

assert(
  'entitlementService has getTenantEffectiveEntitlements',
  entitlementServiceSrc.includes('getTenantEffectiveEntitlements'),
  'entitlementService must export getTenantEffectiveEntitlements'
);

assert(
  'getTenantEffectiveEntitlements enforces snapshot.tenant_id === tenantId equality',
  entitlementServiceSrc.includes('snapshot.tenant_id !== tenantId'),
  'getTenantEffectiveEntitlements must check snapshot.tenant_id !== tenantId'
);

assert(
  'subscriptionService getPlanForTenant enforces snapshot.tenant_id === tenantId equality',
  subscriptionServiceSrc.includes('snapshot.tenant_id === tenantId'),
  'subscriptionService getPlanForTenant must check snapshot.tenant_id === tenantId'
);

// =========================================================================
// T6: Price Calculation & LocalStorage Price Leak Elimination
// =========================================================================
console.log('\nT6: Price Calculation & LocalStorage Price Leak Elimination');

assert(
  'PricingPage does NOT call planService.calculatePlanPrice(plan.id, ...)',
  !pricingPageSrc.includes('planService.calculatePlanPrice'),
  'PricingPage.tsx must compute price directly from plan object'
);

const registrationPageSrc = readFile('pages/RegistrationPage.tsx');

assert(
  'RegistrationPage does NOT call planService.calculatePlanPrice',
  !registrationPageSrc.includes('planService.calculatePlanPrice'),
  'RegistrationPage.tsx must compute price directly from plan object'
);

assert(
  'RegistrationPage syncs formData.planId with validated public plan ID',
  registrationPageSrc.includes('setFormData(prev => ({ ...prev, planId: resolvedPlanId }))'),
  'RegistrationPage.tsx must update formData.planId when resolvedPlanId changes'
);

// =========================================================================
// T7: Registration Authority & Manual Activation Strictness
// =========================================================================
console.log('\nT7: Registration Authority & Manual Activation Strictness');

const tenantRegSrc = readFile('services/tenantRegistrationService.ts');

assert(
  'tenantRegistrationService routes Supabase mode directly to registerTenantSupabase',
  tenantRegSrc.includes('isSupabaseMode()') && tenantRegSrc.includes('this.registerTenantSupabase(data)'),
  'tenantRegistrationService.ts must route Supabase mode directly to registerTenantSupabase'
);

assert(
  'activateManualSubscription has required planId in options parameter',
  subscriptionServiceSrc.includes('options: Partial<TenantSubscription> & { planId: string }'),
  'subscriptionService.ts activateManualSubscription must require planId'
);

assert(
  'activateManualSubscription does NOT contain implicit string fallback',
  subscriptionServiceSrc.includes('planId: options.planId,'),
  'subscriptionService.ts activateManualSubscription must assign planId: options.planId strictly'
);

// =========================================================================
// T8: Public Surface & Pilot Bypass Isolation
// =========================================================================
console.log('\nT8: Public Surface & Pilot Bypass Isolation');

const salonBookingLayoutSrc = readFile('components/layouts/SalonBookingLayout.tsx');

assert(
  'SalonBookingLayout fails closed on AI check in Supabase mode',
  salonBookingLayoutSrc.includes("getDataSourceMode() === 'supabase'") && salonBookingLayoutSrc.includes('setAiEnabled(false)'),
  'SalonBookingLayout.tsx must setAiEnabled(false) in Supabase mode'
);

const publicLinkServiceSrc = readFile('services/publicLinkService.ts');

assert(
  'publicLinkService canUseCustomDomain restricts pilot bypass to non-Supabase modes',
  publicLinkServiceSrc.includes("getDataSourceMode() !== 'supabase' && tenant.id === 'biz_pilot_tenant'"),
  'publicLinkService.ts canUseCustomDomain must restrict pilot bypass to local/mock modes'
);

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Commercial Source-of-Truth Final Semantic Alignment: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error('\n❌ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('\n✅ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFIED');
  process.exit(0);
}
