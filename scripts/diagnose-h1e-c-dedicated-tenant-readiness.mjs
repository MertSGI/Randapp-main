// scripts/diagnose-h1e-c-dedicated-tenant-readiness.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, DEDICATED_H1D_TENANT_ID, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';

export function buildDedicatedTenantBlockerRegister(snapshotData, publicBookingData) {
  const register = [];

  const snap = snapshotData || {};
  const pub = publicBookingData || {};
  const read = snap.readiness_facts || {};
  const rel = snap.relationship_verification || {};
  const sub = snap.subscription_facts || {};
  const ent = snap.entitlement_facts || {};
  const rest = snap.platform_restriction_facts || {};
  const glob = snap.global_release_control || {};

  // 1. Tenant existence and active status
  const tenantExists = snap.tenant_id ? true : false;
  const tenantStatus = snap.tenant_status || 'missing';
  register.push({
    field: '1. Tenant existence & active status',
    databaseFact: `tenant_id=${snap.tenant_id || 'NULL'}, status=${tenantStatus}`,
    evaluatingRpc: 'super_admin_get_tenant_pilot_eligibility_snapshot',
    expectedValue: 'exists=true, status=active',
    actualValue: `exists=${tenantExists}, status=${tenantStatus}`,
    isBlocker: !tenantExists || (tenantStatus !== 'active' && tenantStatus !== 'manual_active'),
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 2. Tenant slug
  const tenantSlug = snap.tenant_slug || 'missing';
  register.push({
    field: '2. Tenant slug',
    databaseFact: `slug=${tenantSlug}`,
    evaluatingRpc: 'super_admin_get_tenant_pilot_eligibility_snapshot / can_accept_public_booking',
    expectedValue: 'dedicated-h1d-tenant',
    actualValue: tenantSlug,
    isBlocker: !tenantSlug || tenantSlug === 'missing',
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 3. public_site_status
  const siteStatus = snap.public_site_status || read.public_site_status || 'missing';
  register.push({
    field: '3. public_site_status',
    databaseFact: `public_site_status=${siteStatus}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 6)',
    expectedValue: 'published',
    actualValue: siteStatus,
    isBlocker: siteStatus !== 'published',
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 4. Primary active branch count
  const primaryBranchCount = read.primary_branch_count ?? 0;
  register.push({
    field: '4. Primary active branch count',
    databaseFact: `primary_branch_count=${primaryBranchCount}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 11)',
    expectedValue: '>= 1',
    actualValue: String(primaryBranchCount),
    isBlocker: primaryBranchCount < 1,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 5. Active service count
  const activeServiceCount = read.active_service_count ?? 0;
  register.push({
    field: '5. Active service count',
    databaseFact: `active_service_count=${activeServiceCount}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 11)',
    expectedValue: '>= 1',
    actualValue: String(activeServiceCount),
    isBlocker: activeServiceCount < 1,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 6. Active staff count
  const activeStaffCount = read.active_staff_count ?? 0;
  register.push({
    field: '6. Active staff count',
    databaseFact: `active_staff_count=${activeStaffCount}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 11)',
    expectedValue: '>= 1',
    actualValue: String(activeStaffCount),
    isBlocker: activeStaffCount < 1,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 7. Branch/service/staff relationship validity
  const relVerified = rel.relationship_status === 'VERIFIED' || read.staff_can_perform_service === true;
  register.push({
    field: '7. Relationship validity',
    databaseFact: `relationship_status=${rel.relationship_status || 'NOT_VERIFIED'}, staff_can_perform_service=${read.staff_can_perform_service ?? false}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 11)',
    expectedValue: 'VERIFIED (staff_can_perform_service=true)',
    actualValue: `status=${rel.relationship_status || 'NOT_VERIFIED'}, can_perform=${read.staff_can_perform_service ?? false}`,
    isBlocker: !relVerified,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 8. Subscription row existence
  const subExists = sub.subscription_exists ?? false;
  register.push({
    field: '8. Subscription row existence',
    databaseFact: `subscription_exists=${subExists}`,
    evaluatingRpc: 'resolve_tenant_commercial_eligibility / Rule 9',
    expectedValue: 'true',
    actualValue: String(subExists),
    isBlocker: !subExists,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 9. Subscription status
  const subStatus = sub.subscription_status || 'missing';
  register.push({
    field: '9. Subscription status',
    databaseFact: `status=${subStatus}`,
    evaluatingRpc: 'resolve_tenant_commercial_eligibility / Rule 9',
    expectedValue: 'active',
    actualValue: subStatus,
    isBlocker: subStatus !== 'active' && subStatus !== 'trialing',
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 10. Billing mode
  const billingMode = sub.billing_mode || 'unknown';
  register.push({
    field: '10. Billing mode',
    databaseFact: `billing_mode=${billingMode}`,
    evaluatingRpc: 'resolve_tenant_commercial_eligibility',
    expectedValue: 'paymentless_limited_production / manual_active',
    actualValue: billingMode,
    isBlocker: false,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 11. Assigned plan and plan version
  const planId = sub.plan_id || 'none';
  const planVersion = sub.plan_version || '1';
  register.push({
    field: '11. Assigned plan & version',
    databaseFact: `plan_id=${planId}, plan_version=${planVersion}`,
    evaluatingRpc: 'resolve_tenant_commercial_eligibility',
    expectedValue: 'assigned plan with core_booking enabled',
    actualValue: `plan=${planId}, version=${planVersion}`,
    isBlocker: planId === 'none',
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 12. Required core_booking entitlement
  const hasCoreEntitlement = ent.core_booking_entitlement_found ?? false;
  const coreEntValue = ent.core_booking_boolean_value ?? false;
  register.push({
    field: '12. Required core_booking entitlement',
    databaseFact: `entitlement_found=${hasCoreEntitlement}, boolean_value=${coreEntValue}`,
    evaluatingRpc: 'resolve_effective_tenant_entitlements / Rule 10',
    expectedValue: 'found=true, boolean_value=true',
    actualValue: `found=${hasCoreEntitlement}, value=${coreEntValue}`,
    isBlocker: !hasCoreEntitlement || !coreEntValue,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 13. Effective entitlement result
  const effectiveEntOk = snap.blocking_reason_codes ? !snap.blocking_reason_codes.includes('REQUIRED_ENTITLEMENT_BLOCKED') : true;
  register.push({
    field: '13. Effective entitlement result',
    databaseFact: `REQUIRED_ENTITLEMENT_BLOCKED present=${!effectiveEntOk}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 10)',
    expectedValue: 'UNBLOCKED',
    actualValue: effectiveEntOk ? 'UNBLOCKED' : 'BLOCKED',
    isBlocker: !effectiveEntOk,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 14. Active platform or tenant restrictions
  const restrictedCount = rest.active_restrictions_count ?? 0;
  const isRestricted = rest.core_booking_restricted ?? false;
  register.push({
    field: '14. Platform / tenant restrictions',
    databaseFact: `active_restrictions_count=${restrictedCount}, core_booking_restricted=${isRestricted}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 5)',
    expectedValue: 'restrictions=0, core_booking_restricted=false',
    actualValue: `restrictions=${restrictedCount}, restricted=${isRestricted}`,
    isBlocker: restrictedCount > 0 || isRestricted,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 15. Operational-readiness facts
  const opReady = read.primary_branch_id && read.primary_branch_has_services && read.primary_branch_has_staff && read.staff_can_perform_service;
  register.push({
    field: '15. Operational-readiness facts',
    databaseFact: `branch_id=${read.primary_branch_id || 'NULL'}, services=${read.primary_branch_has_services ?? false}, staff=${read.primary_branch_has_staff ?? false}, link=${read.staff_can_perform_service ?? false}`,
    evaluatingRpc: 'evaluate_public_booking_eligibility_internal (Rule 11)',
    expectedValue: 'branch=ready, services=true, staff=true, linkage=true',
    actualValue: opReady ? 'READY' : 'FAILED',
    isBlocker: !opReady,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 16. Pilot eligibility snapshot result
  const blockers = snap.blocking_reason_codes || [];
  register.push({
    field: '16. Pilot eligibility snapshot result',
    databaseFact: `primary_reason_code=${snap.primary_reason_code || 'UNKNOWN'}, blocking_reasons=${blockers.join(', ')}`,
    evaluatingRpc: 'super_admin_get_tenant_pilot_eligibility_snapshot',
    expectedValue: 'only GLOBAL_RELEASE_PHASE_BLOCKED',
    actualValue: `primary=${snap.primary_reason_code}, blockers=[${blockers.join(', ')}]`,
    isBlocker: blockers.filter(b => b !== 'GLOBAL_RELEASE_PHASE_BLOCKED').length > 0,
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 17. can_accept_public_booking result
  const pubAllowed = pub.allowed ?? false;
  const pubPrimary = pub.primary_reason_code || 'UNKNOWN';
  register.push({
    field: '17. can_accept_public_booking result',
    databaseFact: `found=${pub.found ?? false}, allowed=${pubAllowed}, primary=${pubPrimary}`,
    evaluatingRpc: 'can_accept_public_booking',
    expectedValue: 'found=true, allowed=false, primary=GLOBAL_RELEASE_PHASE_BLOCKED',
    actualValue: `found=${pub.found ?? false}, allowed=${pubAllowed}, primary=${pubPrimary}`,
    isBlocker: (pub.found === false) || (pubAllowed !== false) || (pubPrimary !== 'GLOBAL_RELEASE_PHASE_BLOCKED' && pubPrimary !== 'TENANT_NOT_FOUND'),
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  // 18. Exact blocking_reason_codes returned by server
  register.push({
    field: '18. Exact server blocking_reason_codes',
    databaseFact: `blocking_reason_codes=[${blockers.join(', ')}]`,
    evaluatingRpc: 'super_admin_get_tenant_pilot_eligibility_snapshot',
    expectedValue: '["GLOBAL_RELEASE_PHASE_BLOCKED"]',
    actualValue: `[${blockers.join(', ')}]`,
    isBlocker: blockers.length !== 1 || blockers[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED',
    classification: 'STAGING_FIXTURE_DEFECT'
  });

  const unexpectedBlockers = blockers.filter(b => b !== 'GLOBAL_RELEASE_PHASE_BLOCKED');

  return {
    register,
    blockingReasonCodes: blockers,
    unexpectedBlockers,
    isPreflightReady: unexpectedBlockers.length === 0 && blockers.length === 1 && blockers[0] === 'GLOBAL_RELEASE_PHASE_BLOCKED'
  };
}

export async function runDedicatedTenantReadinessDiagnostic({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const print = (msg = '') => logger.log(msg);
  print('=== STAGE H1E-C DEDICATED TENANT READINESS DIAGNOSTIC ===');

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    print('⚠️ CONFIGURATION_REQUIRED: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    return { ok: false, reason: 'CONFIGURATION_REQUIRED' };
  }

  const superEmail = env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL;
  const superPass = env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD;

  if (!superEmail || !superPass) {
    print('⚠️ CREDENTIALS_REQUIRED: Missing super admin credentials for diagnostic query');
    return { ok: false, reason: 'CREDENTIALS_REQUIRED' };
  }

  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superEmail, superPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ AUTHENTICATION_FAILED: Super admin login failed');
    return { ok: false, reason: 'AUTHENTICATION_FAILED' };
  }

  const snapRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, authRes.token, fetchImpl);
  const snapData = snapRes ? snapRes.data : null;

  const slug = snapData ? snapData.tenant_slug : 'dedicated-h1d-tenant';
  const pubRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: slug }, null, fetchImpl);
  const pubData = pubRes ? pubRes.data : null;

  const result = buildDedicatedTenantBlockerRegister(snapData, pubData);

  print('\n--- FIELD-BY-FIELD BLOCKER REGISTER ---');
  for (const item of result.register) {
    const icon = item.isBlocker ? '❌ [BLOCKER]' : '✅ [OK]';
    print(`${icon} ${item.field}`);
    print(`     Fact: ${item.databaseFact}`);
    print(`     Evaluating Function: ${item.evaluatingRpc}`);
    print(`     Expected: ${item.expectedValue}`);
    print(`     Actual: ${item.actualValue}`);
    print(`     Classification: ${item.classification}\n`);
  }

  if (result.isPreflightReady) {
    print('✅ PRE-MUTATION READINESS GATE PASSED: Dedicated tenant is fully ready.');
    print('   Only GLOBAL_RELEASE_PHASE_BLOCKED remains as expected under pre_pilot.');
    return { ok: true, isPreflightReady: true, ...result };
  } else {
    print('❌ PRE-MUTATION READINESS GATE BLOCKED: Dedicated tenant has unexpected staging blockers:');
    print(`   Unexpected Blockers: ${result.unexpectedBlockers.join(', ')}`);
    print('   Safe pre-mutation invariant NOT satisfied. Controlled orchestrator must NOT run on this state.');
    return { ok: false, isPreflightReady: false, ...result };
  }
}

if (process.argv[1] && process.argv[1].endsWith('diagnose-h1e-c-dedicated-tenant-readiness.mjs')) {
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  runDedicatedTenantReadinessDiagnostic().then(res => {
    process.exitCode = res.ok ? 0 : 1;
  });
}
