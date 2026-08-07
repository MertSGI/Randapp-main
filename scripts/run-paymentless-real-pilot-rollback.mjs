// scripts/run-paymentless-real-pilot-rollback.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';

export const REAL_PILOT_TENANT_ID = CANONICAL_TENANT_ID;
export const REAL_PILOT_SLUG = 'melis-guzellik';
export const REAL_PILOT_BUSINESS_NAME = 'Melis Güzellik & Nail Art';
export const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';

export async function runRealPilotRollback({
  expectedProjectRef = EXPECTED_PROJECT_REF,
  tenantId = REAL_PILOT_TENANT_ID,
  tenantSlug = REAL_PILOT_SLUG,
  reason = 'Operator executed emergency P1A real paymentless pilot rollback',
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

  if (!supabaseUrl || !supabaseAnonKey) {
    print('⚠️ P1A_ROLLBACK_CREDENTIALS_MISSING: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY required.');
    return { ok: false, exitCode: 1, reason: 'CREDENTIALS_MISSING' };
  }

  if (!supabaseUrl.includes(expectedProjectRef)) {
    print(`⚠️ P1A_ROLLBACK_PROJECT_MISMATCH: Expected project ref '${expectedProjectRef}', got '${supabaseUrl}'`);
    return { ok: false, exitCode: 1, reason: 'PROJECT_MISMATCH' };
  }

  if (!superAdminPass) {
    print('⚠️ P1A_ROLLBACK_SUPER_ADMIN_PASS_MISSING: LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD required for rollback actor.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_PASSWORD_MISSING' };
  }

  // 1. Authenticate as Super Admin
  print('\n🔑 Authenticating Super Admin actor via public auth path...');
  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superAdminEmail, superAdminPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ P1A_ROLLBACK_AUTH_FAILED: Super admin authentication failed.');
    return { ok: false, exitCode: 1, reason: 'SUPER_ADMIN_AUTH_FAILED' };
  }
  const token = authRes.token;

  if (dryRun) {
    print('\n🛑 DRY-RUN ROLLBACK COMPLETE: No mutations executed.');
    return { ok: true, exitCode: 0, reason: 'DRY_RUN_PASSED', dryRun: true };
  }

  const currentTs = now();
  const transitionKey = `p1a_real_pilot_rollback_phase_${currentTs}_${randomSuffix()}`;
  const revokeKey = `p1a_real_pilot_rollback_tenant_${currentTs}_${randomSuffix()}`;

  // STEP 1: CUT PUBLIC BOOKING GLOBALLY FIRST BY RESTORING pre_pilot PHASE
  print(`\n🛡️ STEP 1: Restoring release phase to 'pre_pilot' (Key: ${transitionKey})...`);
  const transRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
    p_expected_phase: 'paymentless_pilot',
    p_target_phase: 'pre_pilot',
    p_reason: reason,
    p_idempotency_key: transitionKey
  }, token, fetchImpl);

  if (!transRes.data || transRes.data.success !== true) {
    print(`⚠️ P1A_ROLLBACK_TRANSITION_WARN: Release phase transition returned: ${JSON.stringify(transRes.data)}`);
  } else {
    print('  ✅ Step 1 Success: Release phase restored to pre_pilot.');
  }

  // STEP 2: VERIFY IMMEDIATE NON-BOOKABLE STATE FOR MELIS
  print('\n🔍 STEP 2: Verifying public booking is immediately blocked globally...');
  const postTransCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const isMelisBlockedByPhase = postTransCheck.data && postTransCheck.data.allowed === false && postTransCheck.data.blocking_reason_codes.includes('GLOBAL_RELEASE_PHASE_BLOCKED');

  if (isMelisBlockedByPhase) {
    print('  ✅ Step 2 Success: Melis Güzellik is immediately blocked by GLOBAL_RELEASE_PHASE_BLOCKED.');
  } else {
    print(`⚠️ P1A_ROLLBACK_STEP2_WARN: Immediate phase block check result: ${JSON.stringify(postTransCheck.data)}`);
  }

  // STEP 3: REVOKE MELIS PILOT AUTHORIZATION
  print(`\n🛡️ STEP 3: Revoking pilot authorization for Melis Güzellik (Key: ${revokeKey})...`);
  const revokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', {
    p_tenant_id: tenantId,
    p_reason: reason,
    p_idempotency_key: revokeKey
  }, token, fetchImpl);

  if (!revokeRes.data || revokeRes.data.success !== true) {
    print(`⚠️ P1A_ROLLBACK_REVOKE_WARN: Tenant pilot revocation returned: ${JSON.stringify(revokeRes.data)}`);
  } else {
    print('  ✅ Step 3 Success: Pilot authorization revoked for Melis Güzellik.');
  }

  // STEP 4: FINAL INDEPENDENT SAFE-STATE PROOF
  print('\n🎯 STEP 4: Final Independent Read-Only Safe State Audit...');
  const finalCheck = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: tenantSlug }, null, fetchImpl);
  const finalSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenantId }, token, fetchImpl);

  const isFinalSafe = finalCheck.data &&
    finalCheck.data.allowed === false &&
    finalCheck.data.bookable === false &&
    finalCheck.data.blocking_reason_codes.includes('GLOBAL_RELEASE_PHASE_BLOCKED') &&
    finalSnap.data &&
    finalSnap.data.global_release_control.release_phase === 'pre_pilot' &&
    finalSnap.data.global_release_control.is_payment_collection_enabled === false &&
    finalSnap.data.authorized === false;

  if (!isFinalSafe) {
    print(`⚠️ P1A_ROLLBACK_FINAL_CHECK_FAILED: Final state audit failed: ${JSON.stringify(finalSnap.data)}`);
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
    rollbackKeys: { transitionKey, revokeKey },
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
