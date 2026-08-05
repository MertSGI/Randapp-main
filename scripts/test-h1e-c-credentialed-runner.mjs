import {
  DEDICATED_H1D_TENANT_ID,
  CANONICAL_TENANT_ID,
  authenticateUser,
  callRpcEndpoint,
  assertAnonAclDenied
} from './test-h1e-a-credentialed-runner-helpers.mjs';

import {
  H1ECNetworkObserver,
  createH1ECMonitoredFetch,
  validateH1ECReasonEnvelope,
  validatePaymentFlagsFalse,
  validatePrePilotPublicResponse,
  validateSnapshotEnvelope,
  validateCompleteAccounting,
  redactH1ECSecrets
} from './test-h1e-c-credentialed-runner-helpers.mjs';

export async function runH1ECredentialedAcceptance({
  mode = process.env.LARI_H1E_C_ACCEPTANCE_MODE,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now()
} = {}) {
  const print = (msg = '') => logger.log(msg);

  if (!mode) {
    print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
    print('⚠️ H1E_C_MODE_REQUIRED');
    print('⚠️ STAGE_H1E_C_NOT_YET_GO');
    print('⚠️ PRODUCTION_NO_GO\n');
    print('Environment variable LARI_H1E_C_ACCEPTANCE_MODE must be explicitly set to either:');
    print('  - pre_pilot_readonly');
    print('  - controlled_paymentless_pilot');
    print('\nNo login attempt, network request or database mutation executed.');
    print('Final exit code: 1');
    return { ok: false, mode: null, exitCode: 1, reason: 'H1E_C_MODE_REQUIRED' };
  }

  if (mode !== 'pre_pilot_readonly' && mode !== 'controlled_paymentless_pilot') {
    print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
    print('⚠️ H1E_C_MODE_INVALID');
    print('⚠️ STAGE_H1E_C_NOT_YET_GO');
    print('⚠️ PRODUCTION_NO_GO\n');
    print('Final exit code: 1');
    return { ok: false, mode, exitCode: 1, reason: 'H1E_C_MODE_INVALID' };
  }

  if (mode === 'controlled_paymentless_pilot') {
    const confirmation = env.LARI_H1E_C_CONTROLLED_CONFIRMATION;
    const initialPhase = env.LARI_H1E_C_EXPECTED_INITIAL_PHASE;

    if (confirmation !== 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL' || initialPhase !== 'pre_pilot') {
      print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
      print('⚠️ H1E_C_CONTROLLED_CONFIRMATION_INVALID');
      print('Final exit code: 1');
      return { ok: false, mode, exitCode: 1, reason: 'H1E_C_CONTROLLED_CONFIRMATION_INVALID' };
    }

    print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
    print('⚠️ H1E_C_CONTROLLED_RELEASE_TRANSITION_CONTRACT_REQUIRED');
    print('⚠️ STAGE_H1E_C_NOT_YET_GO');
    print('⚠️ PRODUCTION_NO_GO\n');
    print('No release-phase transition contract currently available.');
    print('Final exit code: 1');
    return { ok: false, mode, exitCode: 1, reason: 'H1E_C_CONTROLLED_RELEASE_TRANSITION_CONTRACT_REQUIRED' };
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
    print('⚠️ H1E_C_CONFIGURATION_REQUIRED: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    print('Final exit code: 1');
    return { ok: false, mode, exitCode: 1, reason: 'H1E_C_CONFIGURATION_REQUIRED' };
  }

  const creds = {
    nonmember: { label: 'nonmember', email: env.LARI_STAGE_H1D_NONMEMBER_EMAIL, password: env.LARI_STAGE_H1D_NONMEMBER_PASSWORD },
    staff: { label: 'staff', email: env.LARI_STAGE_H1D_STAFF_EMAIL, password: env.LARI_STAGE_H1D_STAFF_PASSWORD },
    owner: { label: 'canonical owner', email: env.LARI_STAGE_D1_OWNER_EMAIL, password: env.LARI_STAGE_D1_OWNER_PASSWORD },
    otherOwner: { label: 'other owner', email: env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL, password: env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD },
    superAdmin: { label: 'super admin', email: env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL, password: env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD }
  };

  for (const [role, c] of Object.entries(creds)) {
    if (!c.email || !c.password) {
      print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
      print(`⚠️ H1E_C_CREDENTIALS_REQUIRED: Missing credentials for ${c.label}`);
      print('Final exit code: 1');
      return { ok: false, mode, exitCode: 1, reason: `H1E_C_CREDENTIALS_REQUIRED_${role.toUpperCase()}` };
    }
  }

  const runId = 'h1e_c_run_' + now();
  print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===');
  print('Run ID: ' + runId);
  print('Mode: ' + mode);

  let defined = 20;
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

  const observer = new H1ECNetworkObserver(supabaseUrl);
  const monitoredFetch = createH1ECMonitoredFetch(observer, fetchImpl);

  function recordFailure(stage, detail) {
    failed++;
    const msg = `${stage}: ${detail}`;
    if (!firstSafeFailure) firstSafeFailure = msg;
    print(`  ❌ FAIL: ${msg}`);
  }

  function recordPass(stage) {
    passed++;
    print(`  ✅ PASS: ${stage}`);
  }

  try {
    // 1. Authenticate 5 identities
    const tokens = {};
    for (const [role, c] of Object.entries(creds)) {
      authAttempted++;
      executed++;
      const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, c.email, c.password, role, monitoredFetch);
      if (authRes && authRes.ok === true && typeof authRes.token === 'string' && authRes.token.length > 0 && authRes.user) {
        authPassed++;
        tokens[role] = authRes.token;
        recordPass(`Auth 1.${authAttempted}: ${c.label} login`);
      } else {
        authFailed++;
        recordFailure(`Auth 1.${authAttempted}`, `${c.label} authentication failed`);
        throw new Error(`Authentication failed for ${c.label}`);
      }
    }

    // 2. Snapshot authorization matrix (Anon 42501, 4 Non-super-admins UNAUTHORIZED, 1 Super-admin success) across 2 tenants
    const targetTenants = [
      { label: 'Canonical Tenant', id: CANONICAL_TENANT_ID },
      { label: 'Dedicated H1D Tenant', id: DEDICATED_H1D_TENANT_ID }
    ];

    const slugMap = {};

    for (const tenant of targetTenants) {
      // Anon call
      authorizationAttempted++;
      executed++;
      const anonRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenant.id }, null, monitoredFetch);
      let anonOk = false;
      let anonErr = '';
      try {
        anonOk = assertAnonAclDenied(anonRes);
      } catch (e) {
        anonOk = false;
        anonErr = e.message;
      }
      if (anonOk) {
        authorizationPassed++;
        recordPass(`Authorization 2.Anon.${tenant.label}: Anon ACL 42501 denied`);
      } else {
        authorizationFailed++;
        recordFailure(`Authorization 2.Anon.${tenant.label}`, `Anon call did not return expected 401/403 with 42501 (${anonErr || 'status ' + anonRes.status})`);
      }

      // 4 Non-super-admin authenticated calls
      const nonSuperRoles = ['nonmember', 'staff', 'owner', 'otherOwner'];
      for (const role of nonSuperRoles) {
        authorizationAttempted++;
        executed++;
        const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenant.id }, tokens[role], monitoredFetch);
        if (res && res.status === 200 && res.data && res.data.success === false && res.data.reason_code === 'UNAUTHORIZED') {
          authorizationPassed++;
          recordPass(`Authorization 2.${role}.${tenant.label}: UNAUTHORIZED envelope returned`);
        } else {
          authorizationFailed++;
          recordFailure(`Authorization 2.${role}.${tenant.label}`, `Expected UNAUTHORIZED envelope, got status ${res ? res.status : 'null'}`);
        }
      }

      // Super-admin call
      authorizationAttempted++;
      executed++;
      const saRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenant.id }, tokens.superAdmin, monitoredFetch);
      const valSnap = validateSnapshotEnvelope(saRes ? saRes.data : null);
      if (saRes && saRes.status === 200 && valSnap.ok) {
        authorizationPassed++;
        slugMap[tenant.id] = saRes.data.tenant_slug;
        initialReleasePhase = saRes.data.global_release_control ? saRes.data.global_release_control.release_phase : 'unknown';
        finalReleasePhase = initialReleasePhase;
        if (tenant.id === DEDICATED_H1D_TENANT_ID) {
          finalActiveAuthCount = saRes.data.pilot_authorization && saRes.data.pilot_authorization.is_authorized ? 1 : 0;
        }
        recordPass(`Authorization 2.SuperAdmin.${tenant.label}: Valid structured snapshot returned`);
      } else {
        authorizationFailed++;
        recordFailure(`Authorization 2.SuperAdmin.${tenant.label}`, `Super-admin snapshot failed: ${valSnap.error || 'unexpected envelope'}`);
      }
    }

    // 3. Behavioral Public Booking RPC checks as Anon
    const canonicalSlug = slugMap[CANONICAL_TENANT_ID];
    const dedicatedSlug = slugMap[DEDICATED_H1D_TENANT_ID];
    const nonexistentSlug = 'nonexistent-slug-' + runId;

    const publicTargets = [
      { label: 'Canonical Tenant Slug', slug: canonicalSlug, expectedFound: true },
      { label: 'Dedicated H1D Tenant Slug', slug: dedicatedSlug, expectedFound: true },
      { label: 'Nonexistent Slug', slug: nonexistentSlug, expectedFound: false }
    ];

    for (const target of publicTargets) {
      behavioralAttempted++;
      executed++;
      if (!target.slug) {
        behavioralFailed++;
        recordFailure(`Behavioral 3.${target.label}`, 'Missing slug for target');
        continue;
      }
      const pubRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: target.slug }, null, monitoredFetch);
      const valPub = validatePrePilotPublicResponse(pubRes ? pubRes.data : null, target.expectedFound);
      if (pubRes && pubRes.status === 200 && valPub.ok) {
        behavioralPassed++;
        recordPass(`Behavioral 3.${target.label}: Correct pre_pilot public response`);
      } else {
        behavioralFailed++;
        recordFailure(`Behavioral 3.${target.label}`, `Public booking check failed: ${valPub.error || 'unexpected envelope'}`);
      }
    }

  } catch (err) {
    print(`\n⚠️ RUN ERROR: ${err.message}`);
  }

  forbiddenMutationAttempts = observer.getForbiddenMutationAttemptsDetected();
  forbiddenRequestsDetected = observer.getForbiddenRequestsDetected();

  const accounting = {
    defined,
    executed,
    passed,
    failed,
    blocked,
    authAttempted,
    authPassed,
    authFailed,
    authorizationAttempted,
    authorizationPassed,
    authorizationFailed,
    behavioralAttempted,
    behavioralPassed,
    behavioralFailed,
    approvedMutations,
    forbiddenMutationAttempts,
    forbiddenRequestsDetected,
    cleanupRequired,
    initialReleasePhase,
    finalReleasePhase,
    finalActiveAuthCount,
    firstSafeFailure,
    exitCode: (executed === defined && passed === defined && failed === 0 && !firstSafeFailure) ? 0 : 1
  };

  print('\n══════════════════════════════════════════════════════════');
  print('Run ID: ' + runId);
  print('Mode: ' + mode);
  print(`Defined tests: ${accounting.defined}`);
  print(`Executed tests: ${accounting.executed}`);
  print(`Passed: ${accounting.passed}`);
  print(`Failed: ${accounting.failed}`);
  print(`Blocked: ${accounting.blocked}`);
  print(`Total: ${accounting.defined}`);
  print('');
  print(`Authentication attempted: ${accounting.authAttempted}`);
  print(`Authentication passed: ${accounting.authPassed}`);
  print(`Authentication failed: ${accounting.authFailed}`);
  print('');
  print(`Authorization attempted: ${accounting.authorizationAttempted}`);
  print(`Authorization passed: ${accounting.authorizationPassed}`);
  print(`Authorization failed: ${accounting.authorizationFailed}`);
  print('');
  print(`Behavioral attempted: ${accounting.behavioralAttempted}`);
  print(`Behavioral passed: ${accounting.behavioralPassed}`);
  print(`Behavioral failed: ${accounting.behavioralFailed}`);
  print('');
  print(`Approved mutation RPC calls: ${accounting.approvedMutations}`);
  print(`Forbidden mutation attempts: ${accounting.forbiddenMutationAttempts}`);
  print(`Forbidden requests detected: ${accounting.forbiddenRequestsDetected}`);
  print(`Cleanup required: ${accounting.cleanupRequired}`);
  print(`Initial release phase: ${accounting.initialReleasePhase}`);
  print(`Final release phase: ${accounting.finalReleasePhase}`);
  print(`Final active authorization count: ${accounting.finalActiveAuthCount}`);
  print(`First safe failure: ${accounting.firstSafeFailure ? accounting.firstSafeFailure : 'none'}`);
  print(`Final exit code: ${accounting.exitCode}`);

  return { ok: accounting.exitCode === 0, mode, exitCode: accounting.exitCode, accounting };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
  runH1ECredentialedAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
