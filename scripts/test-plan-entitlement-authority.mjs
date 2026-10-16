import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const superAdminPlans = read('pages/super-admin/SuperAdminPlansPage.tsx');
const registrationPage = read('pages/RegistrationPage.tsx');
const pricingPage = read('pages/PricingPage.tsx');
const billingTab = read('components/BillingTab.tsx');
const registrationService = read('services/tenantRegistrationService.ts');
const subscriptionService = read('services/subscriptionService.ts');

assert.match(
  superAdminPlans,
  /if \(isSupabaseMode\) \{\s*return <Navigate to="\/super-admin\/commercial" replace \/>;/,
  'Supabase plan administration must synchronously redirect to the canonical commercial surface',
);
assert.match(
  superAdminPlans,
  /if \(isSupabaseMode\) return;\s*setPlans\(planService\.getAllPlans\(\)\);/,
  'legacy plan loading must be unreachable in Supabase mode',
);
assert.match(registrationPage, /getPublicSelfServicePlansAsync\(\)/);
assert.match(pricingPage, /getActivePlansAsync\(\)/);
assert.match(billingTab, /getActivePlansAsync\(\)/);

const supabaseRegistrationBranch = registrationService.indexOf('return this.registerTenantSupabase(data)');
const localEligibilityGuard = registrationService.indexOf('planService.isPublicSelfServicePlan(data.planId)');
assert(supabaseRegistrationBranch >= 0 && localEligibilityGuard > supabaseRegistrationBranch);

const supabaseEntitlementBranch = subscriptionService.indexOf("if (getDataSourceMode() === 'supabase')", subscriptionService.indexOf('async getEffectiveEntitlements'));
const localEntitlementMapCall = subscriptionService.indexOf('entitlementService.getPlanEntitlements(planId)', supabaseEntitlementBranch);
const failClosedReturn = subscriptionService.indexOf("return { features: {}, limits: {} };", supabaseEntitlementBranch);
assert(supabaseEntitlementBranch >= 0 && failClosedReturn > supabaseEntitlementBranch);
assert(localEntitlementMapCall > failClosedReturn, 'static entitlement map must remain local-only');

console.log('plan and entitlement authority regression: PASS');
