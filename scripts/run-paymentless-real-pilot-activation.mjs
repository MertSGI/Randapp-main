// scripts/run-paymentless-real-pilot-activation.mjs
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { loadEnvFile, callRpcEndpoint, authenticateUser, CANONICAL_TENANT_ID, DEDICATED_H1D_TENANT_ID, DEDICATED_H1D_TENANT_SLUG } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const REAL_PILOT_TENANT_ID = CANONICAL_TENANT_ID;
export const REAL_PILOT_SLUG = 'melis-guzellik';
export const REAL_PILOT_BUSINESS_NAME = 'Melis Güzellik & Nail Art';
export const REAL_PILOT_EXPECTED_SHA = '69837e78fb6d261259263d2d23c6424fd0565d7c';
export const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';
export const EXPECTED_EXTERNAL_FRONTEND_URL = 'https://lari-staging.vercel.app/';
export const REQUIRED_ACTIVATION_CONFIRMATION = 'I_UNDERSTAND_THIS_ACTIVATES_THE_REAL_MELIS_PAYMENTLESS_PILOT';

export const ALLOWED_ACTIVATION_MUTATION_RPCS = [
  'super_admin_transition_release_phase',
  'super_admin_approve_tenant_pilot'
];

export function getGitSha(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function getGitOriginSha(branch = 'staging/supabase-staging-consistency', cwd = process.cwd()) {
  try {
    return execSync(`git rev-parse origin/${branch}`, { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function checkWorkingTreeClean(cwd = process.cwd()) {
  try {
    const status = execSync('git status --short', { cwd, encoding: 'utf8' }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

export async function runRealPilotActivation({
  expectedSha = REAL_PILOT_EXPECTED_SHA,
  expectedProjectRef = EXPECTED_PROJECT_REF,
  tenantId = REAL_PILOT_TENANT_ID,
  tenantSlug = REAL_PILOT_SLUG,
  reason = 'Operator authorized P1C real paymentless pilot launch for Melis Güzellik',
  transitionIdempotencyKey = null,
  approveIdempotencyKey = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  randomSuffix = () => Math.random().toString(36).substring(2, 10),
  enforceCleanTree = true,
  isWorkingTreeClean = null,
  requireExternalFrontend = true,
  externalFrontendUrl = EXPECTED_EXTERNAL_FRONTEND_URL,
  enforceGitSha = true,
  getHeadShaImpl = getGitSha,
  getOriginShaImpl = getGitOriginSha,
  checkCleanTreeImpl = checkWorkingTreeClean,
  operatorConfirmation = null,
  dryRun = true
} = {}) {
  const print = (msg = '') => logger.log(msg);

  print('=== P1C PAYMENTLESS REAL PILOT ACTIVATION RUNNER ===');
  print(`Target Tenant: ${REAL_PILOT_BUSINESS_NAME} (${tenantId})`);
  print(`Target Slug: ${tenantSlug}`);
  print(`Mode: ${dryRun ? 'DRY-RUN (READ-ONLY)' : 'REAL EXECUTION (MUTATING)'}`);

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const superAdminEmail = env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com';
  const superAdminPass = env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD;

  // Real execution mode safety confirmation check
  if (!dryRun) {
    if (operatorConfirmation !== REQUIRED_ACTIVATION_CONFIRMATION && env.LARI_P1C_ACTIVATION_CONFIRMATION !== REQUIRED_ACTIVATION_CONFIRMATION) {
      print('⚠️ MISSING_OPERATOR_CONFIRMATION: Real activation requires explicit operator confirmation contract.');
      return { ok: false, exitCode: 1, reason: 'MISSING_OPERATOR_CONFIRMATION' };
    }
  }

  // Working tree clean check
  const isClean = isWorkingTreeClean !== null ? isWorkingTreeClean : checkCleanTreeImpl();
  if (enforceCleanTree && !isClean) {
    print('⚠️ A06_DIRTY_WORKING_TREE: Working tree must be clean before activation.');
    return { ok: false, exitCode: 1, reason: 'DIRTY_WORKING_TREE' };
  }

  // Exact Git SHA enforcement
  if (enforceGitSha) {
    const headSha = getHeadShaImpl();
    const originSha = getOriginShaImpl();
    if (!headSha || !originSha || headSha !== expectedSha || originSha !== expectedSha) {
      print(`⚠️ SHA_MISMATCH: Expected SHA '${expectedSha}', got HEAD='${headSha}', origin='${originSha}'`);
      return { ok: false, exitCode: 1, reason: 'SHA_MISMATCH', headSha, originSha, expectedSha };
    }
  }

  // Supabase Project Ref check
  if (!supabaseUrl || !supabaseUrl.includes(expectedProjectRef)) {
    print(`⚠️ A01_PROJECT_MISMATCH: Expected project ref '${expectedProjectRef}', got '${supabaseUrl}'`);
    return { ok: false, exitCode: 1, reason: 'PROJECT_MISMATCH' };
  }

  // Tenant ID and Slug check
  if (tenantId !== REAL_PILOT_TENANT_ID) {
    print(`⚠️ A02_TENANT_ID_MISMATCH: Expected '${REAL_PILOT_TENANT_ID}', got '${tenantId}'`);
    return { ok: false, exitCode: 1, reason: 'TENANT_ID_MISMATCH' };
  }

  if (tenantSlug !== REAL_PILOT_SLUG) {
    print(`⚠️ A03_TENANT_SLUG_MISMATCH: Expected '${REAL_PILOT_SLUG}', got '${tenantSlug}'`);
    return { ok: false, exitCode: 1, reason: 'TENANT_SLUG_MISMATCH' };
  }

  // Missing activation reason
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    print('⚠️ A16_MISSING_ACTIVATION_REASON: Reason string required for activation audit.');
    return { ok: false, exitCode: 1, reason: 'MISSING_ACTIVATION_REASON' };
  }

  // Super admin password check
  if (!superAdminPass || superAdminPass.trim() === '') {
    print('⚠️ A04_A05_SUPER_ADMIN_PASS_MISSING: LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD required.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_PASSWORD_MISSING' };
  }

  // External frontend mandatory gate check
  if (requireExternalFrontend) {
    if (!externalFrontendUrl || typeof externalFrontendUrl !== 'string' || externalFrontendUrl.includes('localhost') || externalFrontendUrl.includes('127.0.0.1')) {
      print('⚠️ A20_EXTERNAL_FRONTEND_GATE_FAILED: Real external frontend deployment required.');
      return { ok: false, exitCode: 1, reason: 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' };
    }
    print(`🌐 Verifying external frontend reachability: ${externalFrontendUrl}...`);
    try {
      const melisExtUrl = `${externalFrontendUrl.replace(/\/$/, '')}/#/melis-guzellik`;
      const extRes = await fetchImpl(melisExtUrl, { method: 'HEAD' }).catch(() => fetchImpl(melisExtUrl));
      if (!extRes || (extRes.status !== 200 && extRes.status !== 304)) {
        print(`⚠️ A20_EXTERNAL_FRONTEND_UNREACHABLE: Failed to verify ${melisExtUrl} (Status: ${extRes ? extRes.status : 'no response'})`);
        return { ok: false, exitCode: 1, reason: 'REAL_PILOT_EXTERNAL_FRONTEND_UNREACHABLE' };
      }
      print(`  ✅ External frontend reachable (${melisExtUrl}). Status: ${extRes.status}`);
    } catch (err) {
      print(`⚠️ A20_EXTERNAL_FRONTEND_FETCH_ERROR: ${err.message}`);
      return { ok: false, exitCode: 1, reason: 'REAL_PILOT_EXTERNAL_FRONTEND_UNREACHABLE' };
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

  // Verify authenticated actor is super_admin in profile/snapshot
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

  const melisBlockers = melisElig.data.blocking_reason_codes || [];
  if (melisBlockers.length !== 1 || melisBlockers[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
    print(`⚠️ A13_UNEXPECTED_BLOCKERS: Expected ONLY ['GLOBAL_RELEASE_PHASE_BLOCKED'], got ${JSON.stringify(melisBlockers)}`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_BLOCKERS', blockers: melisBlockers };
  }

  const melisSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  if (!melisSnap.data || melisSnap.data.success !== true) {
    print('⚠️ A12_SNAPSHOT_FAILED: Could not retrieve eligibility snapshot for Melis Güzellik.');
    return { ok: false, exitCode: 1, reason: 'SNAPSHOT_FAILED' };
  }

  const snapData = melisSnap.data;

  if (snapData.global_release_control.release_phase !== 'pre_pilot') {
    print(`⚠️ A07_UNEXPECTED_RELEASE_PHASE: Expected 'pre_pilot', got '${snapData.global_release_control.release_phase}'`);
    return { ok: false, exitCode: 1, reason: 'UNEXPECTED_RELEASE_PHASE' };
  }

  if (snapData.global_release_control.is_payment_collection_enabled || snapData.global_release_control.is_checkout_enabled || snapData.global_release_control.is_iyzico_enabled) {
    print('⚠️ A08_A09_A10_PAYMENT_FLAG_ENABLED: Payment collection flags must be false.');
    return { ok: false, exitCode: 1, reason: 'PAYMENT_FLAG_ENABLED' };
  }

  if (snapData.authorized === true || snapData.pilot_authorization.is_authorized === true) {
    print('⚠️ A11_ALREADY_AUTHORIZED: Melis Güzellik already has active pilot authorization.');
    return { ok: false, exitCode: 1, reason: 'ALREADY_AUTHORIZED' };
  }

  const readiness = snapData.readiness_facts || {};
  if (readiness.tenant_status !== 'active' || readiness.public_site_status !== 'published' || !readiness.relationship_verification || readiness.relationship_verification.status !== 'VERIFIED') {
    print('⚠️ A12_TENANT_NOT_READY: Readiness facts validation failed.');
    return { ok: false, exitCode: 1, reason: 'TENANT_NOT_READY', readiness };
  }

  const fixtureSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, token, fetchImpl);
  if (fixtureSnap.data && fixtureSnap.data.authorized === true) {
    print('⚠️ A14_FIXTURE_TENANT_AUTHORIZED: Dedicated acceptance fixture tenant is unexpectedly authorized.');
    return { ok: false, exitCode: 1, reason: 'FIXTURE_TENANT_AUTHORIZED' };
  }

  const unrelatedTenantId = 'eeee1111-e1e1-e1e1-e1e1-eeeeeeeeeeee';
  const unrelatedSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: unrelatedTenantId }, token, fetchImpl);
  if (unrelatedSnap.data && unrelatedSnap.data.authorized === true) {
    print('⚠️ A15_UNRELATED_TENANT_AUTHORIZED: Unrelated tenant is unexpectedly authorized.');
    return { ok: false, exitCode: 1, reason: 'UNRELATED_TENANT_AUTHORIZED' };
  }

  // Dry Run check
  if (dryRun) {
    print('\n🛑 DRY-RUN COMPLETE: All activation preconditions passed (A01-A20). 0 mutation RPCs executed.');
    return { ok: true, exitCode: 0, reason: 'DRY_RUN_PASSED', dryRun: true, mutationRpcCount: 0 };
  }

  // Idempotency keys check for execution path
  const currentTs = now();
  const transKey = transitionIdempotencyKey || `p1c_real_pilot_activation_phase_${currentTs}_${randomSuffix()}`;
  const appKey = approveIdempotencyKey || `p1c_real_pilot_activation_tenant_${currentTs}_${randomSuffix()}`;

  if (!transKey || transKey.trim() === '') {
    print('⚠️ A17_MISSING_TRANSITION_KEY: Idempotency key required for Step 1 transition.');
    return { ok: false, exitCode: 1, reason: 'MISSING_TRANSITION_KEY' };
  }

  if (!appKey || appKey.trim() === '') {
    print('⚠️ A18_MISSING_APPROVE_KEY: Idempotency key required for Step 2 authorization.');
    return { ok: false, exitCode: 1, reason: 'MISSING_APPROVE_KEY' };
  }

  // Create P1C Operator Marker Record immediately before first mutation
  const markerPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `lari-p1c-${expectedSha}.controlled-run-started`);
  const markerRecord = {
    sha: expectedSha,
    timestamp: new Date(currentTs).toISOString(),
    projectRef: expectedProjectRef,
    tenantId,
    externalFrontendUrl,
    reason,
    transitionKey: transKey,
    approveKey: appKey,
    expectedMutationCount: 2
  };

  try {
    fs.writeFileSync(markerPath, JSON.stringify(markerRecord, null, 2));
    print(`\n📝 Operator marker created: ${markerPath}`);
  } catch (mErr) {
    print(`⚠️ MARKER_CREATION_FAILED: ${mErr.message}`);
  }

  // Step 1 Mutation - Release Phase Transition
  print(`\n🚀 STEP 1: Transitioning release phase to 'paymentless_pilot' (Key: ${transKey})...`);
  const transRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
    p_expected_phase: 'pre_pilot',
    p_target_phase: 'paymentless_pilot',
    p_reason: reason,
    p_idempotency_key: transKey
  }, token, fetchImpl);

  if (!transRes.data || transRes.data.success !== true || (transRes.data.changed !== true && transRes.data.replayed !== true)) {
    print(`⚠️ P1C_ACTIVATION_TRANSITION_FAILED: Step 1 transition failed: ${JSON.stringify(transRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'TRANSITION_FAILED', res: transRes.data };
  }
  print('  ✅ Step 1 Success: Release phase transitioned to paymentless_pilot.');

  // A24: Direct post-transition payment safety revalidation
  print('\n🔍 STEP 2 REVALIDATION (A24): Auditing post-transition payment flags & PILOT_AUTHORIZATION_REQUIRED blocker before tenant approval...');
  const postTransSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  const midCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);

  const postTransControl = (postTransSnap.data && postTransSnap.data.global_release_control) || {};
  const midBlockers = (midCheck.data && midCheck.data.blocking_reason_codes) || [];

  const isPhaseCorrect = postTransControl.release_phase === 'paymentless_pilot';
  const isPaymentCollectionDisabled = postTransControl.is_payment_collection_enabled === false;
  const isCheckoutDisabled = postTransControl.is_checkout_enabled === false;
  const isIyzicoDisabled = postTransControl.is_iyzico_enabled === false;
  const isAuthBlockerPresent = midBlockers.includes('PILOT_AUTHORIZATION_REQUIRED');

  if (!isPhaseCorrect || !isPaymentCollectionDisabled || !isCheckoutDisabled || !isIyzicoDisabled || !isAuthBlockerPresent) {
    print('⚠️ A24_POST_TRANSITION_PAYMENT_SAFETY_FAILED: Mid-transition payment revalidation failed:');
    print(`  - release_phase: ${postTransControl.release_phase} (Expected: paymentless_pilot)`);
    print(`  - is_payment_collection_enabled: ${postTransControl.is_payment_collection_enabled} (Expected: false)`);
    print(`  - is_checkout_enabled: ${postTransControl.is_checkout_enabled} (Expected: false)`);
    print(`  - is_iyzico_enabled: ${postTransControl.is_iyzico_enabled} (Expected: false)`);
    print(`  - Melis blockers: ${JSON.stringify(midBlockers)} (Expected: ['PILOT_AUTHORIZATION_REQUIRED'])`);
    return { ok: false, exitCode: 1, reason: 'POST_TRANSITION_PAYMENT_SAFETY_FAILED' };
  }
  print('  ✅ Step 2 Revalidation: Payment flags confirmed false and Melis confirmed blocked by PILOT_AUTHORIZATION_REQUIRED.');

  // Step 2 Mutation - Approve Tenant Pilot Authorization
  print(`\n🚀 STEP 3: Approving pilot authorization for Melis Güzellik (Key: ${appKey})...`);
  const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', {
    p_tenant_id: tenantId,
    p_reason: reason,
    p_idempotency_key: appKey
  }, token, fetchImpl);

  if (!approveRes.data || approveRes.data.success !== true) {
    print(`⚠️ P1C_ACTIVATION_APPROVAL_FAILED: Authorization approval failed: ${JSON.stringify(approveRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'APPROVAL_FAILED', res: approveRes.data };
  }
  print('  ✅ Step 3 Success: Pilot authorization approved for Melis Güzellik.');

  // Post-Activation Acceptance Verification
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

  print('\n🎉 P1C PAYMENTLESS REAL PILOT ACTIVATION COMPLETE (Exactly 2 approved mutation RPCs executed):');
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

  const isExecuteFlag = process.argv.includes('--execute');
  const confirmationEnv = process.env.LARI_P1C_ACTIVATION_CONFIRMATION;

  const shouldExecute = isExecuteFlag && confirmationEnv === REQUIRED_ACTIVATION_CONFIRMATION;

  runRealPilotActivation({
    dryRun: !shouldExecute,
    enforceCleanTree: true,
    requireExternalFrontend: true,
    enforceGitSha: true,
    operatorConfirmation: confirmationEnv
  }).then(res => {
    process.exitCode = res.exitCode;
  });
}
