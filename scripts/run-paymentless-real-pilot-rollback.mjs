// scripts/run-paymentless-real-pilot-rollback.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const REAL_PILOT_TENANT_ID = CANONICAL_TENANT_ID;
export const REAL_PILOT_SLUG = 'melis-guzellik';
export const REAL_PILOT_BUSINESS_NAME = 'Melis Güzellik & Nail Art';
export const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';

export const ALLOWED_ROLLBACK_MUTATION_RPCS = [
  'super_admin_transition_release_phase',
  'super_admin_revoke_tenant_pilot'
];

export async function runRealPilotRollback({
  expectedProjectRef = EXPECTED_PROJECT_REF,
  tenantId = REAL_PILOT_TENANT_ID,
  tenantSlug = REAL_PILOT_SLUG,
  reason = 'Operator executed emergency P1A real paymentless pilot rollback',
  transitionIdempotencyKey = null,
  revokeIdempotencyKey = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  randomSuffix = () => Math.random().toString(36).substring(2, 10),
  dryRun = false
} = {}) {
  const print = (msg = '') => logger.log(msg);

  print('=== P1A PAYMENTLESS REAL PILOT EMERGENCY ROLLBACK RUNNER ===');
  print(`Target Tenant: ${REAL_PILOT_BUSINESS_NAME} (${tenantId})`);
  print(`Target Slug: ${tenantSlug}`);
  print(`Dry Run Mode: ${dryRun}`);

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  const superAdminEmail = env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com';
  const superAdminPass = env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD;

  // R01: Wrong project ref
  if (!supabaseUrl || !supabaseUrl.includes(expectedProjectRef)) {
    print(`⚠️ R01_PROJECT_MISMATCH: Expected project ref '${expectedProjectRef}', got '${supabaseUrl}'`);
    return { ok: false, exitCode: 1, reason: 'PROJECT_MISMATCH' };
  }

  // R04: Missing explicit reason
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    print('⚠️ R04_MISSING_ROLLBACK_REASON: Explicit rollback reason string required.');
    return { ok: false, exitCode: 1, reason: 'MISSING_ROLLBACK_REASON' };
  }

  // R02: Unauthenticated / missing password
  if (!superAdminPass || superAdminPass.trim() === '') {
    print('⚠️ R02_SUPER_ADMIN_PASS_MISSING: LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD required for rollback actor.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_PASSWORD_MISSING' };
  }

  // 1. Authenticate as Super Admin
  print('\n🔑 Authenticating Super Admin actor via public auth path...');
  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superAdminEmail, superAdminPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ R02_AUTH_FAILED: Super admin authentication failed or actor is unauthorized.');
    return { ok: false, exitCode: 1, reason: 'UNAUTHORIZED' };
  }
  const token = authRes.token;

  // R02: Verify authenticated actor is a super_admin (RPC returns UNAUTHORIZED for non-super-admin)
  const roleCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);
  if (roleCheck.data && roleCheck.data.reason_code === 'UNAUTHORIZED') {
    print('⚠️ R02_UNAUTHORIZED_ACTOR: Authenticated actor is valid but not a super_admin.');
    return { ok: false, exitCode: 1, reason: 'UNAUTHORIZED_ACTOR' };
  }

  if (dryRun) {
    print('\n🛑 DRY-RUN ROLLBACK COMPLETE: No mutations executed.');
    return { ok: true, exitCode: 0, reason: 'DRY_RUN_PASSED', dryRun: true, mutationRpcCount: 0 };
  }

  // R05: Idempotency keys check
  const currentTs = now();
  const transKey = transitionIdempotencyKey || `p1a_real_pilot_rollback_phase_${currentTs}_${randomSuffix()}`;
  const revKey = revokeIdempotencyKey || `p1a_real_pilot_rollback_tenant_${currentTs}_${randomSuffix()}`;

  if (!transKey || transKey.trim() === '') {
    print('⚠️ R05_MISSING_TRANSITION_KEY: Idempotency key required for rollback transition.');
    return { ok: false, exitCode: 1, reason: 'MISSING_TRANSITION_KEY' };
  }

  if (!revKey || revKey.trim() === '') {
    print('⚠️ R05_MISSING_REVOKE_KEY: Idempotency key required for rollback revocation.');
    return { ok: false, exitCode: 1, reason: 'MISSING_REVOKE_KEY' };
  }

  // R06: STEP 1 - CUT PUBLIC BOOKING GLOBALLY FIRST BY RESTORING pre_pilot PHASE
  print(`\n🛡️ STEP 1 (R06): Restoring release phase to 'pre_pilot' (Key: ${transKey})...`);
  const transRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
    p_expected_phase: 'paymentless_pilot',
    p_target_phase: 'pre_pilot',
    p_reason: reason,
    p_idempotency_key: transKey
  }, token, fetchImpl);

  if (!transRes.data || transRes.data.success !== true) {
    print(`⚠️ R03_R06_TRANSITION_FAILED: Release phase transition failed: ${JSON.stringify(transRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'TRANSITION_FAILED', res: transRes.data };
  }
  print('  ✅ Step 1 Success: Release phase restored to pre_pilot.');

  // R07 & R08: STEP 2 - VERIFY IMMEDIATE NON-BOOKABLE STATE FOR MELIS BEFORE REVOCATION
  print('\n🔍 STEP 2 (R07): Verifying public booking is immediately blocked globally before tenant revocation...');
  const postTransCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const isMelisBlockedByPhase = postTransCheck.data && postTransCheck.data.allowed === false && postTransCheck.data.blocking_reason_codes.includes('GLOBAL_RELEASE_PHASE_BLOCKED');

  if (isMelisBlockedByPhase) {
    print('  ✅ Step 2 Success: Melis Güzellik is immediately blocked by GLOBAL_RELEASE_PHASE_BLOCKED.');
  } else {
    print(`⚠️ R07_IMMEDIATE_BLOCK_CHECK_FAILED: Phase block check result: ${JSON.stringify(postTransCheck.data)}`);
    return { ok: false, exitCode: 1, reason: 'IMMEDIATE_BLOCK_CHECK_FAILED' };
  }

  // R08: STEP 3 - REVOKE MELIS PILOT AUTHORIZATION AFTER BOOKING IS GLOBALLY CUT
  print(`\n🛡️ STEP 3 (R08): Revoking pilot authorization for Melis Güzellik (Key: ${revKey})...`);
  const revokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', {
    p_tenant_id: tenantId,
    p_reason: reason,
    p_idempotency_key: revKey
  }, token, fetchImpl);

  if (!revokeRes.data || revokeRes.data.success !== true) {
    print(`⚠️ R09_REVOCATION_FAILED: Tenant pilot revocation failed (Public booking remains globally cut): ${JSON.stringify(revokeRes.data)}`);
    return { ok: false, exitCode: 1, reason: 'REVOCATION_FAILED', res: revokeRes.data };
  }
  print('  ✅ Step 3 Success: Pilot authorization revoked for Melis Güzellik.');

  // R10, R11, R12, R14: STEP 4 - FINAL INDEPENDENT SAFE-STATE PROOF
  print('\n🎯 STEP 4 (R10-R14): Final Independent Read-Only Safe State Audit...');
  const finalCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const finalSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);

  const isFinalSafe = finalCheck.data &&
    finalCheck.data.allowed === false &&
    finalCheck.data.bookable === false &&
    finalCheck.data.blocking_reason_codes.includes('GLOBAL_RELEASE_PHASE_BLOCKED') &&
    finalSnap.data &&
    finalSnap.data.global_release_control.release_phase === 'pre_pilot' &&
    finalSnap.data.global_release_control.is_payment_collection_enabled === false &&
    finalSnap.data.global_release_control.is_checkout_enabled === false &&
    finalSnap.data.global_release_control.is_iyzico_enabled === false &&
    finalSnap.data.authorized === false;

  if (!isFinalSafe) {
    print(`⚠️ R10_R11_R12_FINAL_CHECK_FAILED: Final state audit failed: ${JSON.stringify(finalSnap.data)}`);
    return { ok: false, exitCode: 1, reason: 'FINAL_SAFE_CHECK_FAILED' };
  }

  print('\n🚨 P1A EMERGENCY ROLLBACK COMPLETE AND VERIFIED:');
  print('  - Release Phase: pre_pilot');
  print('  - Melis Pilot Authorization: Revoked (authorized = false)');
  print('  - Public Booking: GLOBALLY BLOCKED (bookable = false)');
  print('  - All Payment Flags: false');

  return {
    ok: true,
    exitCode: 0,
    reason: 'ROLLBACK_SUCCESSFUL',
    mutationRpcCount: 2,
    rollbackKeys: { transitionKey: transKey, revokeKey: revKey },
    finalState: {
      releasePhase: 'pre_pilot',
      melisAuthorized: false,
      melisBookable: false,
      paymentCollectionEnabled: false
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith('run-paymentless-real-pilot-rollback.mjs')) {
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  runRealPilotRollback({ dryRun: true }).then(res => {
    process.exitCode = res.exitCode;
  });
}
