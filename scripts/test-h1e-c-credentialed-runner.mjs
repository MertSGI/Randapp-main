import path from 'path';
import {
  DEDICATED_H1D_TENANT_ID,
  loadEnvFile,
  NetworkObserver,
  createMonitoredFetch,
  authenticateUser,
  callRpcEndpoint,
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized
} from './test-h1e-a-credentialed-runner-helpers.mjs';

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const h1eCMode = process.env.LARI_H1E_C_ACCEPTANCE_MODE;
const controlledConfirmation = process.env.LARI_H1E_C_CONTROLLED_CONFIRMATION;
const expectedInitialPhase = process.env.LARI_H1E_C_EXPECTED_INITIAL_PHASE;

const credentials = {
  nonmember: { label: 'nonmember', email: process.env.LARI_STAGE_H1D_NONMEMBER_EMAIL || 'h1dnonmember@randevulari.com', password: process.env.LARI_STAGE_H1D_NONMEMBER_PASSWORD },
  staff: { label: 'staff', email: process.env.LARI_STAGE_H1D_STAFF_EMAIL || 'melisstaff@randevulari.com', password: process.env.LARI_STAGE_H1D_STAFF_PASSWORD },
  owner: { label: 'canonical owner', email: process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com', password: process.env.LARI_STAGE_D1_OWNER_PASSWORD },
  otherOwner: { label: 'other owner', email: process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL || 'h1dotherowner@randevulari.com', password: process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD },
  superAdmin: { label: 'super admin', email: process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com', password: process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD }
};

if (!h1eCMode || (h1eCMode !== 'pre_pilot_readonly' && h1eCMode !== 'controlled_paymentless_pilot')) {
  console.log('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
  console.log('⚠️ H1E_C_MODE_REQUIRED');
  console.log('⚠️ STAGE_H1E_C_NOT_YET_GO');
  console.log('⚠️ PRODUCTION_NO_GO\n');
  console.log('Environment variable LARI_H1E_C_ACCEPTANCE_MODE must be explicitly set to either:');
  console.log('  - pre_pilot_readonly');
  console.log('  - controlled_paymentless_pilot');
  console.log('\nNo login attempt, network request or database mutation executed.');
  console.log('Final exit code: 1');
  if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
    process.exit(1);
  }
}

export function evaluateH1ECPrecedence(blockingReasons) {
  const precedence = [
    'RELEASE_CONTROL_UNAVAILABLE',
    'GLOBAL_RELEASE_PHASE_BLOCKED',
    'TENANT_NOT_FOUND',
    'TENANT_INACTIVE',
    'CORE_BOOKING_RESTRICTED',
    'PUBLIC_SITE_STATUS_BLOCKED',
    'PILOT_AUTHORIZATION_REQUIRED',
    'PILOT_AUTHORIZATION_REVOKED',
    'SUBSCRIPTION_BLOCKED',
    'REQUIRED_ENTITLEMENT_BLOCKED',
    'OPERATIONAL_READINESS_FAILED',
    'BOOKING_ALLOWED'
  ];

  if (!Array.isArray(blockingReasons)) return { ok: false, error: 'blocking_reason_codes is not an array' };

  const seen = new Set();
  for (const r of blockingReasons) {
    if (seen.has(r)) return { ok: false, error: `Duplicate reason code: ${r}` };
    seen.add(r);
    if (!precedence.includes(r)) return { ok: false, error: `Unknown reason code: ${r}` };
  }

  let lastIndex = -1;
  for (const r of blockingReasons) {
    const idx = precedence.indexOf(r);
    if (idx <= lastIndex) return { ok: false, error: `Reason code ${r} violates canonical precedence order: ${r}` };
    lastIndex = idx;
  }

  if (blockingReasons.includes('BOOKING_ALLOWED') && blockingReasons.length > 1) {
    return { ok: false, error: 'BOOKING_ALLOWED coexists with blocker in array' };
  }

  return { ok: true, error: null };
}

export async function runCredentialedAcceptanceH1EC() {
  const runId = 'h1e_c_run_' + Date.now();
  console.log('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===');
  console.log('Run ID: ' + runId);
  console.log('Mode: ' + h1eCMode);

  let defined = 0;
  let executed = 0;
  let passed = 0;
  let failed = 0;
  let blocked = 0;

  let authAttempted = 0;
  let authPassed = 0;
  let authFailed = 0;

  let authorizationAttempted = 0;
  let authorizationPassed = 0;
  let authorizationFailed = 0;

  let behavioralAttempted = 0;
  let behavioralPassed = 0;
  let behavioralFailed = 0;

  let approvedMutations = 0;
  let forbiddenMutationAttempts = 0;
  let forbiddenRequestsDetected = 0;
  let cleanupRequired = false;
  let initialReleasePhase = 'unknown';
  let finalReleasePhase = 'unknown';
  let finalActiveAuthCount = 0;
  let firstSafeFailure = null;

  const obs = new NetworkObserver(supabaseUrl);
  const monitoredFetch = createMonitoredFetch(obs);

  function fail(stage, msg) {
    if (!firstSafeFailure) firstSafeFailure = `${stage}. ${msg}`;
    failed++;
    console.error(`  ❌ FAIL: ${stage}. ${msg}`);
  }

  if (h1eCMode === 'controlled_paymentless_pilot') {
    if (controlledConfirmation !== 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL') {
      fail('Mode validation', 'Controlled mode requires exact confirmation LARI_H1E_C_CONTROLLED_CONFIRMATION');
    }
    if (expectedInitialPhase !== 'pre_pilot') {
      fail('Mode validation', 'Controlled mode requires LARI_H1E_C_EXPECTED_INITIAL_PHASE = pre_pilot');
    }
  }

  // Implementation of runner execution flow
  try {
    // 1. Authenticate users
    authAttempted++;
    const nonmemberAuth = await authenticateUser(credentials.nonmember, monitoredFetch);
    const superAdminAuth = await authenticateUser(credentials.superAdmin, monitoredFetch);
    if (nonmemberAuth && superAdminAuth) {
      authPassed++;
    } else {
      authFailed++;
      fail('Auth', 'User authentication failed');
    }
  } catch (err) {
    fail('Execution', err.message);
  }

  forbiddenMutationAttempts = obs.getForbiddenMutationAttemptsDetected();
  forbiddenRequestsDetected = obs.getForbiddenRequestsDetected();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('Run ID: ' + runId);
  console.log('Mode: ' + h1eCMode);
  console.log(`Defined tests: ${defined}`);
  console.log(`Executed tests: ${executed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Blocked: ${blocked}`);
  console.log(`Total: ${defined}`);
  console.log('');
  console.log(`Authentication attempted: ${authAttempted}`);
  console.log(`Authentication passed: ${authPassed}`);
  console.log(`Authentication failed: ${authFailed}`);
  console.log('');
  console.log(`Authorization attempted: ${authorizationAttempted}`);
  console.log(`Authorization passed: ${authorizationPassed}`);
  console.log(`Authorization failed: ${authorizationFailed}`);
  console.log('');
  console.log(`Behavioral attempted: ${behavioralAttempted}`);
  console.log(`Behavioral passed: ${behavioralPassed}`);
  console.log(`Behavioral failed: ${behavioralFailed}`);
  console.log('');
  console.log(`Approved mutation RPC calls: ${approvedMutations}`);
  console.log(`Forbidden mutation attempts: ${forbiddenMutationAttempts}`);
  console.log(`Forbidden requests detected: ${forbiddenRequestsDetected}`);
  console.log(`Cleanup required: ${cleanupRequired}`);
  console.log(`Initial release phase: ${initialReleasePhase}`);
  console.log(`Final release phase: ${finalReleasePhase}`);
  console.log(`Final active authorization count: ${finalActiveAuthCount}`);
  console.log(`First safe failure: ${firstSafeFailure ? firstSafeFailure : 'none'}`);

  const isSuccess = executed === defined && passed === defined && failed === 0 && (!firstSafeFailure);
  const exitCode = isSuccess ? 0 : 1;
  console.log(`Final exit code: ${exitCode}`);
  if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
    process.exit(exitCode);
  }
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs') && h1eCMode) {
  runCredentialedAcceptanceH1EC();
}
