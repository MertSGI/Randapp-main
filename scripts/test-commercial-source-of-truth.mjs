#!/usr/bin/env node

/**
 * QA: Commercial Source-of-Truth Alignment
 * 
 * Static source-code analysis test that verifies the Commercial Source-of-Truth
 * alignment contract: in supabase mode, commercial plan catalog and entitlements
 * MUST be projected from the canonical Supabase RPCs via commercialCatalogService,
 * NOT from DEFAULT_PLANS, ENTITLEMENTS_MAP, or localStorage.
 * 
 * This is a STATIC test — it reads source files and checks for the presence of
 * required patterns. It does NOT require a running server or database.
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
// T1: planService.ts — Async server-backed methods exist
// =========================================================================
console.log('\nT1: planService.ts — Async server-backed methods');

const planServiceSrc = readFile('services/planService.ts');

assert(
  'planService imports getDataSourceMode',
  planServiceSrc.includes("import { getDataSourceMode }") || planServiceSrc.includes("from './dataSourceConfig'"),
  'planService.ts must import getDataSourceMode from dataSourceConfig'
);

assert(
  'planService imports commercialCatalogService',
  planServiceSrc.includes("commercialCatalogService"),
  'planService.ts must import commercialCatalogService'
);

assert(
  'planService has getActivePlansAsync method',
  planServiceSrc.includes('getActivePlansAsync'),
  'planService.ts must have an async getActivePlansAsync method'
);

assert(
  'planService has getPublicSelfServicePlansAsync method',
  planServiceSrc.includes('getPublicSelfServicePlansAsync'),
  'planService.ts must have an async getPublicSelfServicePlansAsync method'
);

assert(
  'planService has getPlanAsync method',
  planServiceSrc.includes('getPlanAsync'),
  'planService.ts must have an async getPlanAsync method'
);

assert(
  'planService has isPublicSelfServicePlanAsync method',
  planServiceSrc.includes('isPublicSelfServicePlanAsync'),
  'planService.ts must have an async isPublicSelfServicePlanAsync method'
);

assert(
  'planService async methods check supabase mode',
  (planServiceSrc.match(/getDataSourceMode\(\) === 'supabase'/g) || []).length >= 4,
  'planService.ts async methods must check getDataSourceMode() for supabase routing (minimum 4 checks)'
);

assert(
  'planService async methods call getPublicCatalog',
  (planServiceSrc.match(/commercialCatalogService\.getPublicCatalog\(\)/g) || []).length >= 3,
  'planService.ts must call commercialCatalogService.getPublicCatalog() in supabase mode (minimum 3 calls)'
);

// =========================================================================
// T2: entitlementService.ts — Async server-backed methods exist
// =========================================================================
console.log('\nT2: entitlementService.ts — Async server-backed methods');

const entitlementServiceSrc = readFile('services/entitlementService.ts');

assert(
  'entitlementService imports getDataSourceMode',
  entitlementServiceSrc.includes("getDataSourceMode"),
  'entitlementService.ts must import getDataSourceMode'
);

assert(
  'entitlementService imports commercialCatalogService',
  entitlementServiceSrc.includes("commercialCatalogService"),
  'entitlementService.ts must import commercialCatalogService'
);

assert(
  'entitlementService has getPlanEntitlementsAsync method',
  entitlementServiceSrc.includes('getPlanEntitlementsAsync'),
  'entitlementService.ts must have an async getPlanEntitlementsAsync method'
);

assert(
  'entitlementService has canUseFeatureAsync method',
  entitlementServiceSrc.includes('canUseFeatureAsync'),
  'entitlementService.ts must have an async canUseFeatureAsync method'
);

assert(
  'entitlementService has getLimitAsync method',
  entitlementServiceSrc.includes('getLimitAsync'),
  'entitlementService.ts must have an async getLimitAsync method'
);

assert(
  'entitlementService has _mapServerEntitlementsToPlanEntitlements helper',
  entitlementServiceSrc.includes('_mapServerEntitlementsToPlanEntitlements'),
  'entitlementService.ts must have a server entitlement mapping helper'
);

assert(
  'entitlementService async methods call getMyCommercialSubscriptionSnapshot',
  entitlementServiceSrc.includes('getMyCommercialSubscriptionSnapshot'),
  'entitlementService.ts must call getMyCommercialSubscriptionSnapshot in supabase mode'
);

// =========================================================================
// T3: PricingPage.tsx — Uses async catalog loading
// =========================================================================
console.log('\nT3: PricingPage.tsx — Async catalog loading');

const pricingPageSrc = readFile('pages/PricingPage.tsx');

assert(
  'PricingPage calls getActivePlansAsync',
  pricingPageSrc.includes('getActivePlansAsync'),
  'PricingPage.tsx must call planService.getActivePlansAsync() for server-backed catalog'
);

assert(
  'PricingPage does NOT call getActivePlans() synchronously in useEffect',
  !pricingPageSrc.includes('planService.getActivePlans()'),
  'PricingPage.tsx must NOT call planService.getActivePlans() synchronously — use getActivePlansAsync instead'
);

// =========================================================================
// T4: RegistrationPage.tsx — Async plan validation
// =========================================================================
console.log('\nT4: RegistrationPage.tsx — Async plan validation');

const registrationPageSrc = readFile('pages/RegistrationPage.tsx');

assert(
  'RegistrationPage calls getPublicSelfServicePlansAsync',
  registrationPageSrc.includes('getPublicSelfServicePlansAsync'),
  'RegistrationPage.tsx must call planService.getPublicSelfServicePlansAsync() for plan validation'
);

assert(
  'RegistrationPage does NOT call getPublicSelfServicePlans() synchronously',
  !registrationPageSrc.includes('planService.getPublicSelfServicePlans()'),
  'RegistrationPage.tsx must NOT use sync planService.getPublicSelfServicePlans()'
);

// =========================================================================
// T5: tenantRegistrationService.ts — Server-backed eligibility
// =========================================================================
console.log('\nT5: tenantRegistrationService.ts — Server-backed eligibility');

const tenantRegSrc = readFile('services/tenantRegistrationService.ts');

assert(
  'tenantRegistrationService calls isPublicSelfServicePlanAsync',
  tenantRegSrc.includes('isPublicSelfServicePlanAsync'),
  'tenantRegistrationService.ts must call planService.isPublicSelfServicePlanAsync() for plan eligibility'
);

assert(
  'tenantRegistrationService does NOT call isPublicSelfServicePlan synchronously for authorization',
  !tenantRegSrc.includes('planService.isPublicSelfServicePlan(data.planId)'),
  'tenantRegistrationService.ts must NOT use sync isPublicSelfServicePlan() for authorization gate'
);

// =========================================================================
// T6: subscriptionService.ts — Server-backed getEffectiveEntitlements
// =========================================================================
console.log('\nT6: subscriptionService.ts — Server-backed plan/entitlement resolution');

const subscriptionServiceSrc = readFile('services/subscriptionService.ts');

assert(
  'subscriptionService imports getDataSourceMode',
  subscriptionServiceSrc.includes('getDataSourceMode'),
  'subscriptionService.ts must import getDataSourceMode'
);

assert(
  'subscriptionService imports commercialCatalogService',
  subscriptionServiceSrc.includes('commercialCatalogService'),
  'subscriptionService.ts must import commercialCatalogService'
);

assert(
  'subscriptionService getEffectiveEntitlements checks supabase mode',
  subscriptionServiceSrc.includes("getDataSourceMode() === 'supabase'"),
  'subscriptionService.ts getEffectiveEntitlements must check data source mode'
);

assert(
  'subscriptionService calls getMyCommercialSubscriptionSnapshot',
  subscriptionServiceSrc.includes('getMyCommercialSubscriptionSnapshot'),
  'subscriptionService.ts must call getMyCommercialSubscriptionSnapshot in supabase mode'
);

assert(
  'subscriptionService getPlanForTenant has supabase mode branch',
  (() => {
    // Verify getPlanForTenant references supabase mode
    const fnStart = subscriptionServiceSrc.indexOf('getPlanForTenant');
    const fnSlice = subscriptionServiceSrc.slice(fnStart, fnStart + 2000);
    return fnSlice.includes("getDataSourceMode() === 'supabase'");
  })(),
  'subscriptionService.ts getPlanForTenant must have a supabase mode branch'
);

// =========================================================================
// T7: SuperAdminPlansPage.tsx — Supabase mode redirect
// =========================================================================
console.log('\nT7: SuperAdminPlansPage.tsx — Supabase mode redirect');

const superAdminPlansSrc = readFile('pages/super-admin/SuperAdminPlansPage.tsx');

assert(
  'SuperAdminPlansPage imports getDataSourceMode',
  superAdminPlansSrc.includes('getDataSourceMode'),
  'SuperAdminPlansPage.tsx must import getDataSourceMode'
);

assert(
  'SuperAdminPlansPage has supabase mode redirect',
  superAdminPlansSrc.includes("getDataSourceMode() === 'supabase'") && superAdminPlansSrc.includes("navigate('/super-admin/commercial'"),
  'SuperAdminPlansPage.tsx must redirect to /super-admin/commercial in supabase mode'
);

// =========================================================================
// T8: Isolation verification — DEFAULT_PLANS and ENTITLEMENTS_MAP not used in supabase paths
// =========================================================================
console.log('\nT8: Isolation verification — no duplicate authority in supabase-aware consumers');

assert(
  'PricingPage does NOT reference DEFAULT_PLANS',
  !pricingPageSrc.includes('DEFAULT_PLANS'),
  'PricingPage.tsx must NOT reference DEFAULT_PLANS directly'
);

assert(
  'RegistrationPage does NOT reference DEFAULT_PLANS',
  !registrationPageSrc.includes('DEFAULT_PLANS'),
  'RegistrationPage.tsx must NOT reference DEFAULT_PLANS directly'
);

assert(
  'RegistrationPage does NOT reference ENTITLEMENTS_MAP',
  !registrationPageSrc.includes('ENTITLEMENTS_MAP'),
  'RegistrationPage.tsx must NOT reference ENTITLEMENTS_MAP directly'
);

// =========================================================================
// SUMMARY
// =========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`Commercial Source-of-Truth Alignment: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error('\n❌ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('\n✅ COMMERCIAL SOURCE-OF-TRUTH ALIGNMENT VERIFIED');
  process.exit(0);
}
