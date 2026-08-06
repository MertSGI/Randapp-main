// scripts/prepare-h1e-c-dedicated-tenant-fixture.mjs
import path from 'path';
import { loadEnvFile, callRpcEndpoint, authenticateUser, DEDICATED_H1D_TENANT_ID, CANONICAL_TENANT_ID } from './test-h1e-a-credentialed-runner-helpers.mjs';
import { buildDedicatedTenantBlockerRegister } from './diagnose-h1e-c-dedicated-tenant-readiness.mjs';

export function validateFixturePreparationPreconditions({
  targetTenantId = DEDICATED_H1D_TENANT_ID,
  confirmation = process.env.LARI_H1E_C_PREPARE_FIXTURE_CONFIRMATION
} = {}) {
  if (targetTenantId !== DEDICATED_H1D_TENANT_ID) {
    return { ok: false, reason: 'INVALID_TARGET_TENANT_ID', error: `Target tenant ID must strictly be ${DEDICATED_H1D_TENANT_ID}` };
  }

  if (targetTenantId === CANONICAL_TENANT_ID) {
    return { ok: false, reason: 'FORBIDDEN_CANONICAL_TENANT_MUTATION', error: 'Target tenant ID matches canonical tenant ID!' };
  }

  if (confirmation !== 'I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT') {
    return { ok: false, reason: 'FIXTURE_PREPARATION_CONFIRMATION_REQUIRED', error: 'LARI_H1E_C_PREPARE_FIXTURE_CONFIRMATION must be set to I_UNDERSTAND_THIS_PREPARES_STAGING_FIXTURE_FOR_DEDICATED_TENANT' };
  }

  return { ok: true, reason: null, error: null };
}

export async function prepareDedicatedTenantStagingFixture({
  targetTenantId = DEDICATED_H1D_TENANT_ID,
  confirmation = process.env.LARI_H1E_C_PREPARE_FIXTURE_CONFIRMATION,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const print = (msg = '') => logger.log(msg);
  print('=== STAGE H1E-C DEDICATED TENANT STAGING FIXTURE VERIFIER (OPTION B) ===');

  const check = validateFixturePreparationPreconditions({ targetTenantId, confirmation });
  if (!check.ok) {
    print(`\n⚠️ FIXTURE_PREPARATION_ABORTED: ${check.reason}`);
    print(`   Error: ${check.error}`);
    print('\nNo mutation executed.');
    return { ok: false, exitCode: 1, reason: check.reason, error: check.error };
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    print('⚠️ CONFIGURATION_REQUIRED: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    return { ok: false, exitCode: 1, reason: 'CONFIGURATION_REQUIRED' };
  }

  const superEmail = env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL;
  const superPass = env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD;

  if (!superEmail || !superPass) {
    print('⚠️ CREDENTIALS_REQUIRED: Missing super admin credentials');
    return { ok: false, exitCode: 1, reason: 'CREDENTIALS_REQUIRED' };
  }

  const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, superEmail, superPass, 'superAdmin', fetchImpl);
  if (!authRes || !authRes.ok || !authRes.token) {
    print('⚠️ AUTHENTICATION_FAILED: Super admin login failed');
    return { ok: false, exitCode: 1, reason: 'AUTHENTICATION_FAILED' };
  }

  // 1. Fetch current dedicated tenant snapshot
  const snapRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: targetTenantId }, authRes.token, fetchImpl);
  const snapData = snapRes ? snapRes.data : null;
  const slug = snapData ? snapData.tenant_slug : 'dedicated-h1d-tenant';

  const pubRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: slug }, null, fetchImpl);
  const pubData = pubRes ? pubRes.data : null;

  const audit = buildDedicatedTenantBlockerRegister(snapData, pubData);

  print('\n--- STAGING FIXTURE EXECUTION INSTRUCTIONS ---');
  print('⚠️ FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION');
  print('   SQL Seed file path: supabase/seed/h1e_c_dedicated_tenant_fixture.sql');
  print('   Please execute this SQL seed file in the Supabase SQL Editor for target tenant: ' + targetTenantId);

  print('\n--- CURRENT STAGING READINESS FACTS ---');
  print(`  Tenant Exists: ${snapData ? snapData.tenant_id : 'false'}`);
  print(`  Public Site Status: ${snapData ? (snapData.public_site_status || 'missing') : 'missing'}`);
  print(`  Primary Reason: ${snapData ? snapData.primary_reason_code : 'UNKNOWN'}`);
  print(`  Blocking Reasons: [${audit.blockingReasonCodes.join(', ')}]`);
  print(`  Unexpected Blockers Count: ${audit.unexpectedBlockers.length}`);

  // Safety Invariant Verification
  const relControl = snapData ? snapData.global_release_control : null;
  const isPaymentDisabled = relControl && relControl.is_payment_collection_enabled === false && relControl.is_checkout_enabled === false && relControl.is_iyzico_enabled === false;
  const isReleasePrePilot = relControl && relControl.release_phase === 'pre_pilot';
  const isPilotAuthCountZero = snapData && snapData.pilot_authorization && snapData.pilot_authorization.is_authorized === false;

  print('\n--- SAFETY INVARIANT VERIFICATION ---');
  print(`  [SAFETY] Release Phase Is pre_pilot: ${isReleasePrePilot}`);
  print(`  [SAFETY] Payments Disabled: ${isPaymentDisabled}`);
  print(`  [SAFETY] Pilot Authorization Count 0: ${isPilotAuthCountZero}`);
  print(`  [SAFETY] Canonical Tenant Untouched: true`);

  if (!isReleasePrePilot || !isPaymentDisabled || !isPilotAuthCountZero) {
    print('\n❌ SAFETY VIOLATION DETECTED: Staging state violates safety invariants!');
    return { ok: false, exitCode: 1, reason: 'SAFETY_INVARIANT_VIOLATION' };
  }

  if (audit.isPreflightReady) {
    print('\n✅ FIXTURE VERIFIED READY: Fixture SQL has been executed and verified.');
    print('   Dedicated tenant is fully ready. Only GLOBAL_RELEASE_PHASE_BLOCKED remains.');
    return {
      ok: true,
      exitCode: 0,
      targetTenantId,
      reason: 'FIXTURE_VERIFIED_READY',
      blockers: audit.blockingReasonCodes,
      unexpectedBlockersRemaining: 0
    };
  } else {
    print('\n⚠️ FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION');
    print(`   Unexpected Staging Blockers Remaining: ${audit.unexpectedBlockers.join(', ')}`);
    print('   Please execute supabase/seed/h1e_c_dedicated_tenant_fixture.sql in Supabase SQL Editor and rerun this script.');
    return {
      ok: false,
      exitCode: 1,
      reason: 'FIXTURE_SQL_REQUIRES_EXPLICIT_OPERATOR_EXECUTION',
      blockers: audit.blockingReasonCodes,
      unexpectedBlockersRemaining: audit.unexpectedBlockers.length
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('prepare-h1e-c-dedicated-tenant-fixture.mjs')) {
  loadEnvFile(path.join(process.cwd(), '.env'));
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  prepareDedicatedTenantStagingFixture().then(res => {
    process.exitCode = res.exitCode;
  });
}
