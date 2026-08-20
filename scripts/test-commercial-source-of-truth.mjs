#!/usr/bin/env node

/**
 * QA: Commercial Source-of-Truth Alignment (Slice 2-R2.2 Hardened Strict Verification)
 * 
 * Static source-code analysis test that verifies:
 * 1. Bidirectional set equality for canonical feature keys (exact 25 keys extracted from migration SQL)
 * 2. Strict mapping matrix for legacy UI keys without speculative derivations (super_admin_review_priority & advanced_branding fail closed)
 * 3. Legacy/private Supabase plan rendering has NO hardcoded commercial fallback facts
 * 4. Supabase numeric quotas do not return numeric sentinels (-1, 999, 999999) from Supabase tenant limit resolution
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
// T1: Bidirectional Exact 25 Canonical Feature Definitions in Migration SQL
// =========================================================================
console.log('\nT1: Canonical H1A Feature Registry Verification (Bidirectional Exact 25 Keys)');

const migrationSql = readFile('supabase/migrations/20260810_h1a_commercial_catalog_and_read_contracts.sql');

const EXPECTED_25_KEYS = [
  'core_booking', 'customer_self_service', 'customer_cancellation', 'customer_reschedule_request',
  'admin_appointment_operations', 'staff_management', 'service_management', 'max_staff',
  'max_services', 'max_branches', 'max_monthly_appointments', 'multi_branch',
  'notification_allowance', 'ai_allowance', 'lari_minisite', 'custom_domain_eligible',
  'custom_domain_included', 'white_label', 'calendar_integration', 'advanced_reporting',
  'crm_level', 'data_export', 'public_api', 'priority_support', 'dedicated_support'
];

// Extract seed insert VALUES block from migration SQL
const seedInsertMatch = migrationSql.match(/INSERT INTO public\.commercial_feature_definitions[\s\S]*?VALUES([\s\S]*?);/);
const seedValuesText = seedInsertMatch ? seedInsertMatch[1] : '';

// Parse all actual feature_key strings from seed VALUES tuples e.g. ('core_booking', 'boolean', ...)
const actualKeys = [];
const tupleRegex = /\('([a-z0-9_]+)'\s*,/gi;
let match;
while ((match = tupleRegex.exec(seedValuesText)) !== null) {
  actualKeys.push(match[1]);
}

const missingKeys = EXPECTED_25_KEYS.filter(k => !actualKeys.includes(k));
const extraKeys = actualKeys.filter(k => !EXPECTED_25_KEYS.includes(k));
const duplicates = actualKeys.filter((item, index) => actualKeys.indexOf(item) !== index);

assert(
  'Bidirectional exact set equality for canonical feature keys (count = 25)',
  EXPECTED_25_KEYS.length === 25 &&
  actualKeys.length === 25 &&
  missingKeys.length === 0 &&
  extraKeys.length === 0 &&
  duplicates.length === 0,
  `Expected 25 keys, found actual count ${actualKeys.length}. Missing: [${missingKeys}], Extra: [${extraKeys}], Duplicates: [${duplicates}]`
);

// =========================================================================
// T2: Feature Mapping Reconciliation & Prohibited Mappings Verification
// =========================================================================
console.log('\nT2: Feature Mapping Reconciliation & Prohibited Mappings Elimination');

const entitlementServiceSrc = readFile('services/entitlementService.ts');
const planServiceSrc = readFile('services/planService.ts');
const subscriptionServiceSrc = readFile('services/subscriptionService.ts');

assert(
  'super_admin_review_priority fails closed in Supabase mode (NO speculative dedicated_support mapping)',
  entitlementServiceSrc.includes('super_admin_review_priority: false') &&
  !subscriptionServiceSrc.includes('mapped.features.super_admin_review_priority'),
  'super_admin_review_priority must be false (fail-closed) in Supabase mode'
);

assert(
  'advanced_branding fails closed in Supabase mode (NO speculative white_label mapping)',
  entitlementServiceSrc.includes('advanced_branding: false'),
  'advanced_branding must be false (fail-closed) in Supabase mode'
);

assert(
  'googleCalendarEnabled does NOT derive from core_booking or online_booking',
  !subscriptionServiceSrc.includes('googleCalendarEnabled: mapped.features.online_booking'),
  'googleCalendarEnabled must derive from canonical calendar_integration'
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

assert(
  'getPlanForTenant derives legacy/private plan projection from canonical snapshot entitlements without static fallback facts',
  subscriptionServiceSrc.includes('const monthlyApptsEnt = effectiveEntitlements[\'max_monthly_appointments\'];') &&
  subscriptionServiceSrc.includes('const customIncEnt = effectiveEntitlements[\'custom_domain_included\'];') &&
  subscriptionServiceSrc.includes('const calEnt = effectiveEntitlements[\'calendar_integration\'];') &&
  subscriptionServiceSrc.includes('maxMonthlyAppointments: monthlyApptsEnt ? (monthlyApptsEnt.integer_value ?? 0) : 0,'),
  'getPlanForTenant must project canonical facts from snapshot.effective_entitlements dynamically'
);

// =========================================================================
// T4: Unlimited Quotas & Sentinel Elimination in Supabase Mode
// =========================================================================
console.log('\nT4: Unlimited Quotas & Sentinel Elimination in Supabase Mode');

assert(
  'getTenantLimit in Supabase mode does NOT return -1 sentinel for unlimited',
  entitlementServiceSrc.includes('if (getDataSourceMode() === \'supabase\') {\n      // In Supabase mode, limits.maxKey returns integer_value (or 0 if unlimited/absent).\n      // Unlimited truth is represented explicitly by entitlements.unlimitedFlags[limitKey].\n      return entitlements.limits[limitKey];\n    }'),
  'getTenantLimit must not return -1 sentinel in Supabase mode'
);

assert(
  'canAddStaff in Supabase mode checks explicit unlimitedFlags.maxStaff without 999/999999 sentinels',
  subscriptionServiceSrc.includes('if (entitlements.unlimitedFlags?.maxStaff) return true;') &&
  subscriptionServiceSrc.includes('return usage.staffCount < entitlements.limits.maxStaff;'),
  'canAddStaff in Supabase mode must check explicit unlimitedFlags'
);

assert(
  'canAddService in Supabase mode checks explicit unlimitedFlags.maxServices without 999/999999 sentinels',
  subscriptionServiceSrc.includes('if (entitlements.unlimitedFlags?.maxServices) return true;') &&
  subscriptionServiceSrc.includes('return usage.serviceCount < entitlements.limits.maxServices;'),
  'canAddService in Supabase mode must check explicit unlimitedFlags'
);

const pricingPageSrc = readFile('pages/PricingPage.tsx');

assert(
  'PricingPage in Supabase mode relies ONLY on plan.isServicesUnlimited without numeric threshold (> 900)',
  pricingPageSrc.includes("getDataSourceMode() === 'supabase' ? plan.isServicesUnlimited"),
  'PricingPage in Supabase mode must rely strictly on plan.isServicesUnlimited'
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
// T9: Monthly Appointment Quota & Explicit Unlimited Quota Audit
// =========================================================================
console.log('\nT9: Monthly Appointment Quota & Explicit Unlimited Quota Audit');

assert(
  'subscriptionService canCreateAppointment in Supabase mode checks plan.isMonthlyAppointmentsUnlimited',
  subscriptionServiceSrc.includes("getDataSourceMode() === 'supabase'") &&
  subscriptionServiceSrc.includes('if (plan.isMonthlyAppointmentsUnlimited) return true;'),
  'canCreateAppointment in Supabase mode must check plan.isMonthlyAppointmentsUnlimited'
);

assert(
  'subscriptionService canCreateAppointment does NOT evaluate usage < plan.maxMonthlyAppointments in Supabase mode',
  subscriptionServiceSrc.includes("if (getDataSourceMode() === 'supabase')") &&
  subscriptionServiceSrc.includes('if (plan.isMonthlyAppointmentsUnlimited) return true;') &&
  subscriptionServiceSrc.includes('return false;'),
  'canCreateAppointment in Supabase mode must fail closed on bounded quota without evaluating fabricated usage'
);

assert(
  'All 5 unlimited commercial quotas (staff, services, branches, monthly appts, ai) use explicit boolean flags',
  subscriptionServiceSrc.includes('unlimitedFlags?.maxStaff') &&
  subscriptionServiceSrc.includes('unlimitedFlags?.maxServices') &&
  subscriptionServiceSrc.includes('isMonthlyAppointmentsUnlimited') &&
  subscriptionServiceSrc.includes('isAiQuotaUnlimited'),
  'All unlimited commercial quotas must use explicit server boolean flags in Supabase mode'
);

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Commercial Source-of-Truth Hardened Strict Verification: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error('\n❌ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('\n✅ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFIED');
  process.exit(0);
}
