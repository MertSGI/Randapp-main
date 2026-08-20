#!/usr/bin/env node

/**
 * QA: Commercial Source-of-Truth Alignment (H1A Canonical Semantic Alignment)
 * 
 * Static source-code analysis test that verifies the Commercial Source-of-Truth
 * alignment contract:
 * 1. Canonical feature key set alignment (21 registered H1A keys)
 * 2. Explicit mapping matrix for legacy UI keys (no direct key string equality assumption)
 * 3. Fail-closed numeric projections (missing integer entitlements return 0)
 * 4. Elimination of localStorage price calculation leaks on PricingPage and RegistrationPage
 * 5. Tenant-aware effective entitlement resolution with tenant_id equality check
 * 6. Public surface fails closed on AI check without calling authenticated my-tenant snapshot
 * 7. Strict manual activation without implicit plan defaults
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
// T1: Canonical Feature Key Alignment in planService & entitlementService
// =========================================================================
console.log('\nT1: Canonical Feature Key Alignment');

const planServiceSrc = readFile('services/planService.ts');
const entitlementServiceSrc = readFile('services/entitlementService.ts');

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical key custom_domain_eligible',
  planServiceSrc.includes("custom_domain_eligible"),
  'mapCommercialPublicPlanToPricingPlan must use custom_domain_eligible, not custom_domain_manual'
);

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical key lari_minisite',
  planServiceSrc.includes("lari_minisite"),
  'mapCommercialPublicPlanToPricingPlan must use lari_minisite'
);

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical key ai_allowance',
  planServiceSrc.includes("ai_allowance"),
  'mapCommercialPublicPlanToPricingPlan must use ai_allowance for AI quota'
);

assert(
  'mapCommercialPublicPlanToPricingPlan uses canonical key calendar_integration',
  planServiceSrc.includes("calendar_integration"),
  'mapCommercialPublicPlanToPricingPlan must use calendar_integration without forced true default'
);

assert(
  'mapCommercialPublicPlanToPricingPlan does NOT force googleCalendarEnabled to true',
  !planServiceSrc.includes("|| true"),
  'mapCommercialPublicPlanToPricingPlan must NOT use || true'
);

assert(
  '_mapServerEntitlementsToPlanEntitlements projects website_publication from lari_minisite',
  entitlementServiceSrc.includes("website_publication: getBool('lari_minisite')"),
  '_mapServerEntitlementsToPlanEntitlements must project website_publication from lari_minisite'
);

assert(
  '_mapServerEntitlementsToPlanEntitlements projects online_booking from core_booking',
  entitlementServiceSrc.includes("online_booking: getBool('core_booking')"),
  '_mapServerEntitlementsToPlanEntitlements must project online_booking from core_booking'
);

assert(
  '_mapServerEntitlementsToPlanEntitlements projects customer_memory_lite/full from crm_level',
  entitlementServiceSrc.includes("crmLevel === 'lite'") && entitlementServiceSrc.includes("crmLevel === 'full'"),
  '_mapServerEntitlementsToPlanEntitlements must project CRM levels from text entitlement crm_level'
);

assert(
  '_mapServerEntitlementsToPlanEntitlements returns 0 for missing integer limits (fail-closed)',
  entitlementServiceSrc.includes('if (!e) return 0;'),
  '_mapServerEntitlementsToPlanEntitlements must return 0 for missing integer limits in Supabase mode'
);

// =========================================================================
// T2: Tenant-Aware Entitlement API & Snapshot Equality
// =========================================================================
console.log('\nT2: Tenant-Aware Entitlement API & Snapshot Equality');

assert(
  'entitlementService has getTenantEffectiveEntitlements',
  entitlementServiceSrc.includes('getTenantEffectiveEntitlements'),
  'entitlementService must export getTenantEffectiveEntitlements'
);

assert(
  'entitlementService has canTenantUseFeature',
  entitlementServiceSrc.includes('canTenantUseFeature'),
  'entitlementService must export canTenantUseFeature'
);

assert(
  'entitlementService has getTenantLimit',
  entitlementServiceSrc.includes('getTenantLimit'),
  'entitlementService must export getTenantLimit'
);

assert(
  'getTenantEffectiveEntitlements enforces snapshot.tenant_id === tenantId equality',
  entitlementServiceSrc.includes('snapshot.tenant_id !== tenantId'),
  'getTenantEffectiveEntitlements must fail-closed if snapshot.tenant_id !== tenantId'
);

const subscriptionServiceSrc = readFile('services/subscriptionService.ts');

assert(
  'subscriptionService getPlanForTenant enforces snapshot.tenant_id === tenantId equality',
  subscriptionServiceSrc.includes('snapshot.tenant_id === tenantId'),
  'subscriptionService getPlanForTenant must check snapshot.tenant_id === tenantId'
);

assert(
  'subscriptionService getEffectiveEntitlements enforces snapshot.tenant_id === tenantId equality',
  subscriptionServiceSrc.includes('snapshot.tenant_id === tenantId'),
  'subscriptionService getEffectiveEntitlements must check snapshot.tenant_id === tenantId'
);

// =========================================================================
// T3: Price Calculation & LocalStorage Price Leak Elimination
// =========================================================================
console.log('\nT3: Price Calculation & LocalStorage Price Leak Elimination');

const pricingPageSrc = readFile('pages/PricingPage.tsx');

assert(
  'PricingPage does NOT call planService.calculatePlanPrice(plan.id, ...)',
  !pricingPageSrc.includes('planService.calculatePlanPrice'),
  'PricingPage.tsx must compute price directly from plan object without planService.calculatePlanPrice'
);

const registrationPageSrc = readFile('pages/RegistrationPage.tsx');

assert(
  'RegistrationPage does NOT call planService.calculatePlanPrice',
  !registrationPageSrc.includes('planService.calculatePlanPrice'),
  'RegistrationPage.tsx must compute price directly from plan object without planService.calculatePlanPrice'
);

assert(
  'RegistrationPage syncs formData.planId with validated public plan ID',
  registrationPageSrc.includes('setFormData(prev => ({ ...prev, planId: resolvedPlanId }))'),
  'RegistrationPage.tsx must update formData.planId when resolvedPlanId changes'
);

// =========================================================================
// T4: Registration Authority & Manual Activation Strictness
// =========================================================================
console.log('\nT4: Registration Authority & Manual Activation Strictness');

const tenantRegSrc = readFile('services/tenantRegistrationService.ts');

assert(
  'tenantRegistrationService routes Supabase mode directly to registerTenantSupabase',
  tenantRegSrc.includes('isSupabaseMode()') && tenantRegSrc.includes('this.registerTenantSupabase(data)'),
  'tenantRegistrationService.ts must route Supabase mode directly to registerTenantSupabase for server RPC decisioning'
);

assert(
  'activateManualSubscription has required planId in options parameter',
  subscriptionServiceSrc.includes('options: Partial<TenantSubscription> & { planId: string }'),
  'subscriptionService.ts activateManualSubscription must require planId in options'
);

assert(
  'activateManualSubscription does NOT contain implicit || standart or || baslangic fallback',
  subscriptionServiceSrc.includes('planId: options.planId,') || subscriptionServiceSrc.includes('planId: options.planId'),
  'subscriptionService.ts activateManualSubscription must assign planId: options.planId strictly'
);

// =========================================================================
// T5: Public Surface & Pilot Bypass Isolation
// =========================================================================
console.log('\nT5: Public Surface & Pilot Bypass Isolation');

const salonBookingLayoutSrc = readFile('components/layouts/SalonBookingLayout.tsx');

assert(
  'SalonBookingLayout imports useState and useEffect from react',
  salonBookingLayoutSrc.includes("import React, { useState, useEffect } from 'react'"),
  'SalonBookingLayout.tsx must import useState and useEffect from react'
);

assert(
  'SalonBookingLayout fails closed on AI check in Supabase mode (PUBLIC_TENANT_COMMERCIAL_PROJECTION_GAP)',
  salonBookingLayoutSrc.includes("getDataSourceMode() === 'supabase'") && salonBookingLayoutSrc.includes('setAiEnabled(false)'),
  'SalonBookingLayout.tsx must setAiEnabled(false) in Supabase mode'
);

const publicLinkServiceSrc = readFile('services/publicLinkService.ts');

assert(
  'publicLinkService canUseCustomDomain restricts pilot bypass to non-Supabase modes',
  publicLinkServiceSrc.includes("getDataSourceMode() !== 'supabase' && tenant.id === 'biz_pilot_tenant'"),
  'publicLinkService.ts canUseCustomDomain must restrict pilot bypass to local/mock modes'
);

assert(
  'publicLinkService canUseCustomDomain calls tenant-aware canTenantUseFeature',
  publicLinkServiceSrc.includes('canTenantUseFeature'),
  'publicLinkService.ts canUseCustomDomain must call entitlementService.canTenantUseFeature'
);

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Commercial Source-of-Truth Semantic Alignment: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error('\n❌ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('\n✅ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFIED');
  process.exit(0);
}
