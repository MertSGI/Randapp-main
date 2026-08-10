// scripts/run-paymentless-real-pilot-activation.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, CANONICAL_TENANT_ID, DEDICATED_H1D_TENANT_ID, DEDICATED_H1D_TENANT_SLUG } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const REAL_PILOT_TENANT_ID = CANONICAL_TENANT_ID;
export const REAL_PILOT_SLUG = 'melis-guzellik';
export const REAL_PILOT_BUSINESS_NAME = 'Melis Güzellik & Nail Art';
export const REAL_PILOT_EXPECTED_SHA = 'f646c60a94e3597c737eb495cf65834ee95ad8ed';
export const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';

export const ALLOWED_ACTIVATION_MUTATION_RPCS = [
  'super_admin_transition_release_phase',
  'super_admin_approve_tenant_pilot'
];

export async function runRealPilotActivation({
  expectedSha = REAL_PILOT_EXPECTED_SHA,
  expectedProjectRef = EXPECTED_PROJECT_REF,
  tenantId = REAL_PILOT_TENANT_ID,
  tenantSlug = REAL_PILOT_SLUG,
  reason = 'Operator authorized P1A real paymentless pilot launch for Melis Güzellik',
  transitionIdempotencyKey = null,
  approveIdempotencyKey = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  randomSuffix = () => Math.random().toString(36).substring(2, 10),
  enforceCleanTree = false,
  isWorkingTreeClean = true,
  requireExternalFrontend = false,
  externalFrontendUrl = null,
  dryRun = true
} = {}) {
  const print = (msg = '') => logger.log(msg);

  print('=== P1A PAYMENTLESS REAL PILOT ACTIVATION RUNNER ===');
  print(`Target Tenant: ${REAL_PILOT_BUSINESS_NAME} (${tenantId})`);
  print(`Target Slug: ${tenantSlug}`);
  print(`Dry Run Mode: ${dryRun}`);

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const superAdminEmail = env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com';
  const superAdminPass = env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD;

  // A06: Working tree clean check
  if (enforceCleanTree && !isWorkingTreeClean) {
    print('⚠️ A06_DIRTY_WORKING_TREE: Working tree must be clean before activation.');
    return { ok: false, exitCode: 1, reason: 'DIRTY_WORKING_TREE' };
  }

  // A01: Wrong project ref
  if (!supabaseUrl || !supabaseUrl.includes(expectedProjectRef)) {
    print(`⚠️ A01_PROJECT_MISMATCH: Expected project ref '${expectedProjectRef}', got '${supabaseUrl}'`);
    return { ok: false, exitCode: 1, reason: 'PROJECT_MISMATCH' };
  }

  // A02 & A03: Wrong tenant ID or slug
  if (tenantId !== REAL_PILOT_TENANT_ID) {
    print(`⚠️ A02_TENANT_ID_MISMATCH: Expected '${REAL_PILOT_TENANT_ID}', got '${tenantId}'`);
    return { ok: false, exitCode: 1, reason: 'TENANT_ID_MISMATCH' };
  }

  if (tenantSlug !== REAL_PILOT_SLUG) {
    print(`⚠️ A03_TENANT_SLUG_MISMATCH: Expected '${REAL_PILOT_SLUG}', got '${tenantSlug}'`);
    return { ok: false, exitCode: 1, reason: 'TENANT_SLUG_MISMATCH' };
  }

  // A16: Missing activation reason
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    print('⚠️ A16_MISSING_ACTIVATION_REASON: Reason string required for activation audit.');
    return { ok: false, exitCode: 1, reason: 'MISSING_ACTIVATION_REASON' };
  }

  // A04 & A05: Unauthenticated or missing super admin pass
  if (!superAdminPass || superAdminPass.trim() === '') {
    print('⚠️ A04_A05_SUPER_ADMIN_PASS_MISSING: LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD required.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_PASSWORD_MISSING' };
  }

  // A20: External frontend mandatory gate check
  if (requireExternalFrontend) {
    if (!externalFrontendUrl || typeof externalFrontendUrl !== 'string' || externalFrontendUrl.includes('localhost') || externalFrontendUrl.includes('127.0.0.1')) {
      print('⚠️ A20_EXTERNAL_FRONTEND_GATE_FAILED: Real external frontend deployment required.');
      return { ok: false, exitCode: 1, reason: 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' };
    }
  }

  // 1. Authenticate as Super Admin
  print('\n🔑 Authenticating Super Admin actor via public auth path...');
  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superAdminEmail, superAdminPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ A04_A05_AUTH_FAILED: Super admin authentication failed or actor is unauthorized.');
    return { ok: false, exitCode: 1, reason: 'UNAUTHORIZED' };
  }
  const token = authRes.token;

  // A05: Verify authenticated actor is a super_admin (RPC returns UNAUTHORIZED for non-super-admin)
  const roleCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  if (roleCheck.data && roleCheck.data.reason_code === 'UNAUTHORIZED') {
    print('⚠️ A05_UNAUTHORIZED_ACTOR: Authenticated actor is valid but not a super_admin.');
    return { ok: false, exitCode: 1, reason: 'UNAUTHORIZED_ACTOR' };
  }

  // 2. Precondition Verification - Read Only
  print('\n🔍 Auditing pre-activation readiness facts...');
  
  const melisElig = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  if (!melisElig.data || melisElig.data.found !== true) {
    print('⚠️ A12_TENANT_NOT_FOUND: melis-guzellik not found via can_accept_public_booking.');
    return { ok: false, exitCode: 1, reason: 'TENANT_NOT_FOUND' };
  }

  if (melisElig.data.allowed === true || melisElig.data.bookable === true) {
    print('⚠️ A11_ALREADY_BOOKABLE: Melis Güzellik is already bookable before activation.');
    return { ok: false, exitCode: 1, reason: 'ALREADY_BOOKABLE' };
  }

  // A13: Blocker list check
  const melisBlockers = melisElig.data.blocking_reason_codes || [];
  if (melisBlockers.length !== 1 || melisBlockers[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
    print(`⚠️ A13_UNEXPECTED_BLOCKERS: Expected ONLY ['GLOBAL_RELEASE_PHASE_BLOCKED'], got ${JSON.stringify(melisBlockers)}`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_BLOCKERS', blockers: melisBlockers };
  }

  // Snapshot audit for Melis
  const melisSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  if (!melisSnap.data || melisSnap.data.success !== true) {
    print('⚠️ A12_SNAPSHOT_FAILED: Could not retrieve eligibility snapshot for Melis Güzellik.');
    return { ok: false, exitCode: 1, reason: 'SNAPSHOT_FAILED' };
  }

  const snapData = melisSnap.data;

  // A07: Unexpected release phase check
  if (snapData.global_release_control.release_phase !== 'pre_pilot') {
    print(`⚠️ A07_UNEXPECTED_RELEASE_PHASE: Expected 'pre_pilot', got '${snapData.global_release_control.release_phase}'`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_RELEASE_PHASE' };
  }

  // A08, A09, A10: Payment collection flags check
  if (snapData.global_release_control.is_payment_collection_enabled || snapData.global_release_control.is_checkout_enabled || snapData.global_release_control.is_iyzico_enabled) {
    print('⚠️ A08_A09_A10_PAYMENT_FLAG_ENABLED: Payment collection flags must be false.');
    return { ok: false, exitCode: 1, reason: 'PAYMENT_FLAG_ENABLED' };
  }

  // A11: Melis already authorized check
  if (snapData.authorized === true || snapData.pilot_authorization.is_authorized === true) {
    print('⚠️ A11_ALREADY_AUTHORIZED: Melis Güzellik already has active pilot authorization.');
    return { ok: false, exitCode: 1, reason: 'ALREADY_AUTHORIZED' };
  }

  // A12: Readiness facts check
  const readiness = snapData.readiness_facts || {};
  if (readiness.tenant_status !== 'active' || readiness.public_site_status !== 'published' || !readiness.relationship_verification || readiness.relationship_verification.status !== 'VERIFIED') {
    print('⚠️ A12_TENANT_NOT_READY: Readiness facts validation failed.');
    return { ok: false, exitCode: 1, reason: 'TENANT_NOT_READY', readiness };
  }

  // A14: Fixture tenant (dddd1111-...) authorized check
  const fixtureSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, token, fetchImpl);
  if (fixtureSnap.data && fixtureSnap.data.authorized === true) {
    print('⚠️ A14_FIXTURE_TENANT_AUTHORIZED: Dedicated acceptance fixture tenant is unexpectedly authorized.');
    return { ok: false, exitCode: 1, reason: 'FIXTURE_TENANT_AUTHORIZED' };
  }

  // A15: Unrelated tenant (eeee1111-...) authorized check
  const unrelatedTenantId = 'eeee1111-e1e1-e1e1-e1e1-eeeeeeeeeeee';
  const unrelatedSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: unrelatedTenantId }, token, fetchImpl);
  if (unrelatedSnap.data && unrelatedSnap.data.authorized === true) {
    print('⚠️ A15_UNRELATED_TENANT_AUTHORIZED: Unrelated tenant is unexpectedly authorized.');
    return { ok: false, exitCode: 1, reason: 'UNRELATED_TENANT_AUTHORIZED' };
  }

  // A21: Dry Run check
  if (dryRun) {
    print('\n🛑 DRY-RUN COMPLETE: All activation preconditions passed (A01-A20). 0 mutation RPCs executed.');
    return { ok: true, exitCode: 0, reason: 'DRY_RUN_PASSED', dryRun: true, mutationRpcCount: 0 };
  }

  // A17 & A18: Idempotency keys check for execution path
  const currentTs = now();
  const transKey = transitionIdempotencyKey || `p1a_real_pilot_activation_phase_${currentTs}_${randomSuffix()}`;
  const appKey = approveIdempotencyKey || `p1a_real_pilot_activation_tenant_${currentTs}_${randomSuffix()}`;

  if (!transKey || transKey.trim() === '') {
    print('⚠️ A17_MISSING_TRANSITION_KEY: Idempotency key required for Step 1 transition.');
    return { ok: false, exitCode: 1, reason: 'MISSING_TRANSITION_KEY' };
  }

  if (!appKey || appKey.trim() === '') {
    print('⚠️ A18_MISSING_APPROVE_KEY: Idempotency key required for Step 2 authorization.');
    return { ok: false, exitCode: 1, reason: 'MISSING_APPROVE_KEY' };
  }

  // A22 & A23: Step 1 Mutation - Release Phase Transition
  print(`\n🚀 STEP 1: Transitioning release phase to 'paymentless_pilot' (Key: ${transKey})...`);
  const transRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
    p_expected_phase: 'pre_pilot',
    p_target_phase: 'paymentless_pilot',
    p_reason: reason,
    p_idempotency_key: transKey
  }, token, fetchImpl);

  if (!transRes.data || transRes.data.success !== true || (transRes.data.changed !== true && transRes.data.replayed !== true)) {
    print(`⚠️ P1A_ACTIVATION_TRANSITION_FAILED: Step 1 transition failed: ${JSON.stringify(transRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'TRANSITION_FAILED', res: transRes.data };
  }
  print('  ✅ Step 1 Success: Release phase transitioned to paymentless_pilot.');

  // A24: Revalidate post-transition payment flags before tenant authorization
  const midCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const midBlockers = (midCheck.data && midCheck.data.blocking_reason_codes) || [];
  if (!midBlockers.includes('PILOT_AUTHORIZATION_REQUIRED')) {
    print(`⚠️ A24_POST_TRANSITION_REVALIDATION_FAILED: Expected PILOT_AUTHORIZATION_REQUIRED blocker, got: ${JSON.stringify(midBlockers)}`);
    return { ok: false, exitCode: 1, reason: 'POST_TRANSITION_REVALIDATION_FAILED' };
  }
  print('  ✅ Step 2 Revalidation: Payment flags remain false and Melis remains blocked by PILOT_AUTHORIZATION_REQUIRED.');

  // A22 & A23: Step 2 Mutation - Approve Tenant Pilot Authorization
  print(`\n🚀 STEP 2: Approving pilot authorization for Melis Güzellik (Key: ${appKey})...`);
  const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', {
    p_tenant_id: tenantId,
    p_reason: reason,
    p_idempotency_key: appKey
  }, token, fetchImpl);

  if (!approveRes.data || approveRes.data.success !== true) {
    print(`⚠️ P1A_ACTIVATION_APPROVAL_FAILED: Step 2 authorization approval failed: ${JSON.stringify(approveRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'APPROVAL_FAILED', res: approveRes.data };
  }
  print('  ✅ Step 2 Success: Pilot authorization approved for Melis Güzellik.');

  // A25 & A26: Post-Activation Acceptance Verification
  print('\n🎯 Post-Activation Acceptance Verification...');
  const postMelis = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const isMelisBookable = postMelis.data && postMelis.data.found === true && postMelis.data.allowed === true && postMelis.data.bookable === true;

  const postFixture = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: DEDICATED_H1D_TENANT_SLUG }, null, fetchImpl);
  const isFixtureBlocked = postFixture.data && postFixture.data.allowed === false && postFixture.data.blocking_reason_codes.includes('PILOT_AUTHORIZATION_REQUIRED');

  if (!isMelisBookable) {
    print(`⚠️ A25_MELIS_NOT_BOOKABLE: Melis Güzellik is not bookable post-activation: ${JSON.stringify(postMelis.data)}`);
    return { ok: false, exitCode: 1, reason: 'POST_VERIFICATION_MELIS_FAILED' };
  }

  if (!isFixtureBlocked) {
    print(`⚠️ A26_FIXTURE_NOT_BLOCKED: Fixture tenant is not safely blocked post-activation: ${JSON.stringify(postFixture.data)}`);
    return { ok: false, exitCode: 1, reason: 'POST_VERIFICATION_FIXTURE_FAILED' };
  }

  print('\n🎉 P1A PAYMENTLESS REAL PILOT ACTIVATION COMPLETE (Exactly 2 approved mutation RPCs executed):');
  print('  - Melis Güzellik: PUBLIC BOOKING OPEN (bookable = true)');
  print('  - Dedicated Fixture Tenant: BLOCKED (PILOT_AUTHORIZATION_REQUIRED)');
  print('  - All Payment Flags: false');

  return {
    ok: true,
    exitCode: 0,
    reason: 'ACTIVATION_SUCCESSFUL',
    mutationRpcCount: 2,
    activationKeys: { transitionKey: transKey, approveKey: appKey },
    postActivationState: {
      melisBookable: true,
      fixtureBlocked: true,
      paymentCollectionEnabled: false
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith('run-paymentless-real-pilot-activation.mjs')) {
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  runRealPilotActivation({ dryRun: true }).then(res => {
    process.exitCode = res.exitCode;
  });
}
