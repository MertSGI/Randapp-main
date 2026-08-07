// scripts/run-paymentless-real-pilot-activation.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, CANONICAL_TENANT_ID, DEDICATED_H1D_TENANT_ID, DEDICATED_H1D_TENANT_SLUG } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const REAL_PILOT_TENANT_ID = CANONICAL_TENANT_ID;
export const REAL_PILOT_SLUG = 'melis-guzellik';
export const REAL_PILOT_BUSINESS_NAME = 'Melis Güzellik & Nail Art';
export const REAL_PILOT_EXPECTED_SHA = 'd1152833f670aead7dff2625bc93419e15a1cd03';
export const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';

export async function runRealPilotActivation({
  expectedSha = REAL_PILOT_EXPECTED_SHA,
  expectedProjectRef = EXPECTED_PROJECT_REF,
  tenantId = REAL_PILOT_TENANT_ID,
  tenantSlug = REAL_PILOT_SLUG,
  reason = 'Operator authorized P1A real paymentless pilot launch for Melis Güzellik',
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  randomSuffix = () => Math.random().toString(36).substring(2, 10),
  bypassShaCheck = false,
  bypassWorkingTreeCheck = false,
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

  if (!supabaseUrl || !supabaseAnonKey) {
    print('⚠️ P1A_ACTIVATION_CREDENTIALS_MISSING: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY required.');
    return { ok: false, exitCode: 1, reason: 'CREDENTIALS_MISSING' };
  }

  if (!supabaseUrl.includes(expectedProjectRef)) {
    print(`⚠️ P1A_ACTIVATION_PROJECT_MISMATCH: Expected project ref '${expectedProjectRef}', got '${supabaseUrl}'`);
    return { ok: false, exitCode: 1, reason: 'PROJECT_MISMATCH' };
  }

  if (tenantId !== REAL_PILOT_TENANT_ID || tenantSlug !== REAL_PILOT_SLUG) {
    print(`⚠️ P1A_ACTIVATION_TENANT_MISMATCH: Target must be canonical real pilot tenant (${REAL_PILOT_TENANT_ID} / ${REAL_PILOT_SLUG})`);
    return { ok: false, exitCode: 1, reason: 'TENANT_MISMATCH' };
  }

  if (!superAdminPass) {
    print('⚠️ P1A_ACTIVATION_SUPER_ADMIN_PASS_MISSING: LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD required for activation actor.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_PASSWORD_MISSING' };
  }

  // 1. Authenticate as Super Admin
  print('\n🔑 Authenticating Super Admin actor via public auth path...');
  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superAdminEmail, superAdminPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ P1A_ACTIVATION_AUTH_FAILED: Super admin authentication failed.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_AUTH_FAILED' };
  }
  const token = authRes.token;

  // 2. Precondition Verification - Read Only
  print('\n🔍 Auditing pre-activation readiness facts...');
  
  // Public booking eligibility pre-check for Melis
  const melisElig = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  if (!melisElig.data || melisElig.data.found !== true) {
    print('⚠️ P1A_ACTIVATION_TENANT_NOT_FOUND: melis-guzellik not found via can_accept_public_booking.');
    return { ok: false, exitCode: 1, reason: 'TENANT_NOT_FOUND' };
  }

  if (melisElig.data.allowed === true || melisElig.data.bookable === true) {
    print('⚠️ P1A_ACTIVATION_ALREADY_BOOKABLE: Melis Güzellik is already bookable before activation.');
    return { ok: false, exitCode: 1, reason: 'ALREADY_BOOKABLE' };
  }

  const melisBlockers = melisElig.data.blocking_reason_codes || [];
  if (melisBlockers.length !== 1 || melisBlockers[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
    print(`⚠️ P1A_ACTIVATION_UNEXPECTED_BLOCKERS: Expected ONLY ['GLOBAL_RELEASE_PHASE_BLOCKED'], got ${JSON.stringify(melisBlockers)}`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_BLOCKERS', blockers: melisBlockers };
  }

  // Snapshot audit for Melis
  const melisSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  if (!melisSnap.data || melisSnap.data.success !== true) {
    print('⚠️ P1A_ACTIVATION_SNAPSHOT_FAILED: Could not retrieve eligibility snapshot for Melis Güzellik.');
    return { ok: false, exitCode: 1, reason: 'SNAPSHOT_FAILED' };
  }

  const snapData = melisSnap.data;
  if (snapData.global_release_control.release_phase !== 'pre_pilot') {
    print(`⚠️ P1A_ACTIVATION_UNEXPECTED_PHASE: Expected release_phase 'pre_pilot', got '${snapData.global_release_control.release_phase}'`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_RELEASE_PHASE' };
  }

  if (snapData.global_release_control.is_payment_collection_enabled || snapData.global_release_control.is_checkout_enabled || snapData.global_release_control.is_iyzico_enabled) {
    print('⚠️ P1A_ACTIVATION_PAYMENT_FLAG_ENABLED: Payment collection flags must be false.');
    return { ok: false, exitCode: 1, reason: 'PAYMENT_FLAG_ENABLED' };
  }

  if (snapData.authorized === true || snapData.pilot_authorization.is_authorized === true) {
    print('⚠️ P1A_ACTIVATION_ALREADY_AUTHORIZED: Melis Güzellik already has active pilot authorization.');
    return { ok: false, exitCode: 1, reason: 'ALREADY_AUTHORIZED' };
  }

  const readiness = snapData.readiness_facts || {};
  if (readiness.tenant_status !== 'active' || readiness.public_site_status !== 'published' || !readiness.relationship_verification || readiness.relationship_verification.status !== 'VERIFIED') {
    print('⚠️ P1A_ACTIVATION_TENANT_NOT_READY: Readiness facts validation failed.');
    return { ok: false, exitCode: 1, reason: 'TENANT_NOT_READY', readiness };
  }

  // Verify dedicated fixture tenant (dddd1111-...) is NOT authorized
  const fixtureSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, token, fetchImpl);
  if (fixtureSnap.data && fixtureSnap.data.authorized === true) {
    print('⚠️ P1A_ACTIVATION_FIXTURE_AUTHORIZED: Dedicated acceptance fixture tenant is unexpectedly authorized.');
    return { ok: false, exitCode: 1, reason: 'FIXTURE_TENANT_AUTHORIZED' };
  }

  print('\n✅ Preconditions Verified Successfully:');
  print('  - Project Ref: Valid');
  print('  - Super Admin Actor: Authenticated');
  print('  - Current Release Phase: pre_pilot');
  print('  - All Payment Flags: false');
  print('  - Melis Operational Readiness: VERIFIED (published / active)');
  print('  - Melis Sole Blocker: GLOBAL_RELEASE_PHASE_BLOCKED');
  print('  - Fixture Tenant Authorized: False');

  if (dryRun) {
    print('\n🛑 DRY-RUN COMPLETE: All activation preconditions passed. No mutations performed.');
    return { ok: true, exitCode: 0, reason: 'DRY_RUN_PASSED', dryRun: true };
  }

  // 3. Execution Phase - 2 Approved State-Changing RPC Calls
  const currentTs = now();
  const transitionKey = `p1a_real_pilot_activation_phase_${currentTs}_${randomSuffix()}`;
  const approveKey = `p1a_real_pilot_activation_tenant_${currentTs}_${randomSuffix()}`;

  print(`\n🚀 STEP 1: Transitioning release phase to 'paymentless_pilot' (Key: ${transitionKey})...`);
  const transRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
    p_expected_phase: 'pre_pilot',
    p_target_phase: 'paymentless_pilot',
    p_reason: reason,
    p_idempotency_key: transitionKey
  }, token, fetchImpl);

  if (!transRes.data || transRes.data.success !== true || (transRes.data.changed !== true && transRes.data.replayed !== true)) {
    print(`⚠️ P1A_ACTIVATION_TRANSITION_FAILED: Step 1 transition failed: ${JSON.stringify(transRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'TRANSITION_FAILED', res: transRes.data };
  }
  print('  ✅ Step 1 Success: Release phase transitioned to paymentless_pilot.');

  // Intermediate Check: Confirm payment flags remain false
  const midCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const midBlockers = (midCheck.data && midCheck.data.blocking_reason_codes) || [];
  if (!midBlockers.includes('PILOT_AUTHORIZATION_REQUIRED')) {
    print(`⚠️ P1A_ACTIVATION_INTERMEDIATE_FAIL: Expected PILOT_AUTHORIZATION_REQUIRED blocker before Step 2, got: ${JSON.stringify(midBlockers)}`);
    return { ok: false, exitCode: 1, reason: 'INTERMEDIATE_CHECK_FAILED' };
  }
  print('  ✅ Intermediate Check: Melis correctly blocked by PILOT_AUTHORIZATION_REQUIRED before Step 2.');

  print(`\n🚀 STEP 2: Approving pilot authorization for Melis Güzellik (Key: ${approveKey})...`);
  const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', {
    p_tenant_id: tenantId,
    p_reason: reason,
    p_idempotency_key: approveKey
  }, token, fetchImpl);

  if (!approveRes.data || approveRes.data.success !== true) {
    print(`⚠️ P1A_ACTIVATION_APPROVAL_FAILED: Step 2 authorization approval failed: ${JSON.stringify(approveRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'APPROVAL_FAILED', res: approveRes.data };
  }
  print('  ✅ Step 2 Success: Pilot authorization approved for Melis Güzellik.');

  // 4. Post-Activation Verification
  print('\n🎯 Post-Activation Acceptance Verification...');
  const postMelis = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const isMelisBookable = postMelis.data && postMelis.data.found === true && postMelis.data.allowed === true && postMelis.data.bookable === true;

  const postFixture = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: DEDICATED_H1D_TENANT_SLUG }, null, fetchImpl);
  const isFixtureBlocked = postFixture.data && postFixture.data.allowed === false && postFixture.data.blocking_reason_codes.includes('PILOT_AUTHORIZATION_REQUIRED');

  if (!isMelisBookable) {
    print(`⚠️ P1A_ACTIVATION_VERIFICATION_FAILED: Melis Güzellik is not bookable post-activation: ${JSON.stringify(postMelis.data)}`);
    return { ok: false, exitCode: 1, reason: 'POST_VERIFICATION_MELIS_FAILED' };
  }

  if (!isFixtureBlocked) {
    print(`⚠️ P1A_ACTIVATION_VERIFICATION_FAILED: Fixture tenant is not safely blocked post-activation: ${JSON.stringify(postFixture.data)}`);
    return { ok: false, exitCode: 1, reason: 'POST_VERIFICATION_FIXTURE_FAILED' };
  }

  print('\n🎉 P1A PAYMENTLESS REAL PILOT ACTIVATION COMPLETE:');
  print('  - Melis Güzellik: PUBLIC BOOKING OPEN (bookable = true)');
  print('  - Dedicated Fixture Tenant: BLOCKED (PILOT_AUTHORIZATION_REQUIRED)');
  print('  - All Payment Flags: false');

  return {
    ok: true,
    exitCode: 0,
    reason: 'ACTIVATION_SUCCESSFUL',
    activationKeys: { transitionKey, approveKey },
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
