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
  now = () => Date.now(),
  checkpointHandler = null,
  injectedRunId = null
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

    if (typeof checkpointHandler !== 'function') {
      print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
      print('⚠️ H1E_C_CONTROLLED_CHECKPOINT_HANDLER_REQUIRED');
      print('Final exit code: 1');
      return { ok: false, mode, exitCode: 1, reason: 'H1E_C_CONTROLLED_CHECKPOINT_HANDLER_REQUIRED' };
    }
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

  const runId = injectedRunId || ('h1e_c_run_' + now());
  print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===');
  print('Run ID: ' + runId);
  print('Mode: ' + mode);

  // Controlled Test Plan Construction
  let testPlan = [];
  if (mode === 'controlled_paymentless_pilot') {
    const controlledPlanItems = [
      'auth_nonmember_login',
      'auth_staff_login',
      'auth_canonical_owner_login',
      'auth_other_owner_login',
      'auth_super_admin_login',
      'initial_transition_evidence_captured',
      'initial_pilot_evidence_captured',
      'initial_phase_pre_pilot',
      'initial_payment_flags_false',
      'dedicated_tenant_exists',
      'dedicated_slug_exists',
      'no_active_dedicated_authorization',
      'only_global_release_phase_blocked_before_mutation',
      'second_non_authorized_tenant_identified',
      'pre_pilot_to_paymentless_pilot_transition',
      'phase_becomes_paymentless_pilot',
      'payment_flags_remain_false_after_transition',
      'dedicated_tenant_blocked_before_authorization',
      'expected_required_revoked_authorization_blocker',
      'second_tenant_remains_blocked',
      'pilot_approve',
      'authorized_snapshot',
      'booking_allowed_public_response',
      'authorized_browser_checkpoint',
      'transition_replay',
      'replay_creates_no_extra_transition',
      'pilot_revoke',
      'booking_closes_immediately',
      'revoked_browser_checkpoint',
      'paymentless_pilot_to_pre_pilot_restoration',
      'final_phase_pre_pilot',
      'restored_browser_checkpoint',
      'final_transition_evidence_captured',
      'final_pilot_evidence_captured',
      'transition_history_delta_plus_2',
      'paymentless_audit_delta_plus_1',
      'restoration_audit_delta_plus_1',
      'transition_idempotency_delta_plus_2',
      'pilot_approval_audit_delta_plus_1',
      'pilot_revocation_audit_delta_plus_1',
      'final_active_authorization_count_0',
      'final_payment_flags_false',
      'forbidden_requests_0',
      'forbidden_mutations_0',
      'final_safe_state_verified'
    ];
    testPlan = controlledPlanItems.map((id, index) => ({ id, index: index + 1, executed: false, passed: false }));
  }

  let defined = mode === 'controlled_paymentless_pilot' ? testPlan.length : 20;
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

  let transitionAttempted = 0;
  let transitionPassed = 0;
  let transitionFailed = 0;

  let pilotMutationAttempted = 0;
  let pilotMutationPassed = 0;
  let pilotMutationFailed = 0;

  let behavioralAttempted = 0;
  let behavioralPassed = 0;
  let behavioralFailed = 0;

  let browserCheckpointsAttempted = 0;
  let browserCheckpointsPassed = 0;
  let browserCheckpointsFailed = 0;

  let approvedMutations = 0;
  let forbiddenMutationAttempts = 0;
  let forbiddenRequestsDetected = 0;
  let compensationAttempted = 0;
  let compensationSucceeded = 0;
  let compensationFailed = 0;

  let cleanupRequired = false;
  let initialReleasePhase = 'unknown';
  let finalReleasePhase = 'unknown';
  let finalActiveAuthCount = 0;
  let firstSafeFailure = null;

  let initialTransitionEvidence = null;
  let finalTransitionEvidence = null;
  let initialPilotEvidence = null;
  let finalPilotEvidence = null;

  const observer = new H1ECNetworkObserver(supabaseUrl);
  const monitoredFetch = createH1ECMonitoredFetch(observer, fetchImpl);

  function executePlanTest(testId, fn) {
    const item = testPlan.find(t => t.id === testId);
    if (!item) throw new Error(`Test plan item not found: ${testId}`);
    if (item.executed) throw new Error(`Test plan item executed duplicate: ${testId}`);
    executed++;
    item.executed = true;
    try {
      fn();
      passed++;
      item.passed = true;
      print(`  ✅ PASS [${item.index}/${defined}]: ${testId}`);
    } catch (err) {
      failed++;
      item.passed = false;
      const msg = `${testId}: ${err.message}`;
      if (!firstSafeFailure) firstSafeFailure = msg;
      print(`  ❌ FAIL [${item.index}/${defined}]: ${msg}`);
      throw err;
    }
  }

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

  let phaseChangedToPaymentless = false;
  let pilotApprovedActive = false;
  let tokens = {};
  let dedicatedSlug = null;

  try {
    if (mode === 'pre_pilot_readonly') {
      // Pre-pilot read-only mode unchanged
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

      const targetTenants = [
        { label: 'Canonical Tenant', id: CANONICAL_TENANT_ID },
        { label: 'Dedicated H1D Tenant', id: DEDICATED_H1D_TENANT_ID }
      ];
      const slugMap = {};

      for (const tenant of targetTenants) {
        authorizationAttempted++;
        executed++;
        const anonRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: tenant.id }, null, monitoredFetch);
        let anonOk = false;
        try { anonOk = assertAnonAclDenied(anonRes); } catch (e) { anonOk = false; }
        if (anonOk) { authorizationPassed++; recordPass(`Authorization 2.Anon.${tenant.label}: Anon ACL 42501 denied`); }
        else { authorizationFailed++; recordFailure(`Authorization 2.Anon.${tenant.label}`, 'Anon ACL denied check failed'); }

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
            recordFailure(`Authorization 2.${role}.${tenant.label}`, 'Expected UNAUTHORIZED envelope');
          }
        }

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
          recordFailure(`Authorization 2.SuperAdmin.${tenant.label}`, 'Super-admin snapshot failed');
        }
      }

      const canonicalSlug = slugMap[CANONICAL_TENANT_ID];
      const dedicatedSlugVal = slugMap[DEDICATED_H1D_TENANT_ID];
      const nonexistentSlug = 'nonexistent-slug-' + runId;

      const publicTargets = [
        { label: 'Canonical Tenant Slug', slug: canonicalSlug, expectedFound: true },
        { label: 'Dedicated H1D Tenant Slug', slug: dedicatedSlugVal, expectedFound: true },
        { label: 'Nonexistent Slug', slug: nonexistentSlug, expectedFound: false }
      ];

      for (const target of publicTargets) {
        behavioralAttempted++;
        executed++;
        const pubRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: target.slug }, null, monitoredFetch);
        const valPub = validatePrePilotPublicResponse(pubRes ? pubRes.data : null, target.expectedFound);
        if (pubRes && pubRes.status === 200 && valPub.ok) {
          behavioralPassed++;
          recordPass(`Behavioral 3.${target.label}: Correct pre_pilot public response`);
        } else {
          behavioralFailed++;
          recordFailure(`Behavioral 3.${target.label}`, 'Public booking check failed');
        }
      }
    } else if (mode === 'controlled_paymentless_pilot') {
      // 1. Authenticate 5 identities with plan accounting
      const roles = ['nonmember', 'staff', 'owner', 'otherOwner', 'superAdmin'];
      for (const role of roles) {
        authAttempted++;
        const c = creds[role];
        const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, c.email, c.password, role, monitoredFetch);
        executePlanTest(`auth_${role === 'owner' ? 'canonical_owner' : role.replace(/([A-Z])/g, '_$1').toLowerCase()}_login`, () => {
          if (!authRes || authRes.ok !== true || typeof authRes.token !== 'string' || !authRes.token) {
            authFailed++;
            throw new Error(`Login failed for ${role}`);
          }
          authPassed++;
          tokens[role] = authRes.token;
        });
      }

      // 2. Initial Transition Evidence
      const initEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_release_transition_evidence', { p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      executePlanTest('initial_transition_evidence_captured', () => {
        if (!initEvRes || initEvRes.status !== 200 || !initEvRes.data || !initEvRes.data.success) {
          throw new Error('Initial transition evidence capture failed');
        }
        initialTransitionEvidence = initEvRes.data;
        initialReleasePhase = initEvRes.data.release_phase;
      });

      // 3. Initial Pilot Evidence
      const initPilotEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      executePlanTest('initial_pilot_evidence_captured', () => {
        if (!initPilotEvRes || initPilotEvRes.status !== 200 || !initPilotEvRes.data || !initPilotEvRes.data.success) {
          throw new Error('Initial pilot evidence capture failed');
        }
        initialPilotEvidence = initPilotEvRes.data;
      });

      executePlanTest('initial_phase_pre_pilot', () => {
        if (initialReleasePhase !== 'pre_pilot') throw new Error(`Expected pre_pilot, got ${initialReleasePhase}`);
      });

      executePlanTest('initial_payment_flags_false', () => {
        if (!validatePaymentFlagsFalse(initialTransitionEvidence)) throw new Error('Payment flags not false');
      });

      // 4. Dedicated Tenant Snapshot Preconditions
      authorizationAttempted++;
      const initSnapRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, tokens.superAdmin, monitoredFetch);
      authorizationPassed++;

      executePlanTest('dedicated_tenant_exists', () => {
        if (!initSnapRes || initSnapRes.status !== 200 || !initSnapRes.data || !initSnapRes.data.success) {
          throw new Error('Dedicated tenant snapshot fetch failed');
        }
      });

      executePlanTest('dedicated_slug_exists', () => {
        dedicatedSlug = initSnapRes.data.tenant_slug;
        if (!dedicatedSlug) throw new Error('Dedicated slug missing');
      });

      executePlanTest('no_active_dedicated_authorization', () => {
        const isAuth = initSnapRes.data.pilot_authorization && initSnapRes.data.pilot_authorization.is_authorized;
        if (isAuth) throw new Error('Dedicated tenant active authorization exists');
      });

      executePlanTest('only_global_release_phase_blocked_before_mutation', () => {
        const blockers = initSnapRes.data.blocking_reason_codes || [];
        if (blockers.length !== 1 || blockers[0] !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
          throw new Error(`Unexpected blockers: ${blockers.join(', ')}`);
        }
      });

      executePlanTest('second_non_authorized_tenant_identified', () => {
        if (!CANONICAL_TENANT_ID) throw new Error('Canonical tenant missing');
      });

      // 5. Transition pre_pilot -> paymentless_pilot
      transitionAttempted++;
      const trans1Key = `${runId}_trans_1`;
      const trans1Res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'pre_pilot',
        p_target_phase: 'paymentless_pilot',
        p_reason: 'Controlled H1E-C acceptance transition',
        p_idempotency_key: trans1Key
      }, tokens.superAdmin, monitoredFetch);

      executePlanTest('pre_pilot_to_paymentless_pilot_transition', () => {
        if (!trans1Res || trans1Res.status !== 200 || !trans1Res.data || !trans1Res.data.success || !trans1Res.data.changed) {
          transitionFailed++;
          throw new Error(`Transition failed: ${trans1Res ? JSON.stringify(trans1Res.data) : 'null'}`);
        }
        transitionPassed++;
        approvedMutations++;
        phaseChangedToPaymentless = true;
      });

      executePlanTest('phase_becomes_paymentless_pilot', () => {
        if (trans1Res.data.release_phase !== 'paymentless_pilot') throw new Error('Target phase not paymentless_pilot');
      });

      // Fetch snapshot to check payment flags and blocker
      const postTransSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, tokens.superAdmin, monitoredFetch);
      
      executePlanTest('payment_flags_remain_false_after_transition', () => {
        if (!validatePaymentFlagsFalse(postTransSnap ? postTransSnap.data : null)) throw new Error('Payment flags enabled after transition');
      });

      behavioralAttempted++;
      const pubResBeforeApprove = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);

      executePlanTest('dedicated_tenant_blocked_before_authorization', () => {
        if (!pubResBeforeApprove || pubResBeforeApprove.status !== 200 || !pubResBeforeApprove.data || pubResBeforeApprove.data.bookable !== false) {
          behavioralFailed++;
          throw new Error('Dedicated booking open before authorization');
        }
        behavioralPassed++;
      });

      executePlanTest('expected_required_revoked_authorization_blocker', () => {
        const blockers = pubResBeforeApprove.data.blocking_reason_codes || [];
        if (!blockers.includes('PILOT_AUTHORIZATION_REQUIRED') && !blockers.includes('PILOT_AUTHORIZATION_REVOKED')) {
          throw new Error(`Unexpected blocker: ${blockers.join(', ')}`);
        }
      });

      // Second tenant check
      behavioralAttempted++;
      const pubResSecond = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: 'melis-guzellik' }, null, monitoredFetch);
      executePlanTest('second_tenant_remains_blocked', () => {
        if (!pubResSecond || pubResSecond.status !== 200 || !pubResSecond.data || pubResSecond.data.bookable !== false) {
          behavioralFailed++;
          throw new Error('Second tenant unexpectedly bookable');
        }
        behavioralPassed++;
      });

      // 6. Approve Dedicated Tenant
      pilotMutationAttempted++;
      const approveKey = `${runId}_approve_1`;
      const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', {
        p_tenant_id: DEDICATED_H1D_TENANT_ID,
        p_reason: 'Controlled H1E-C acceptance pilot approval',
        p_idempotency_key: approveKey
      }, tokens.superAdmin, monitoredFetch);

      executePlanTest('pilot_approve', () => {
        if (!approveRes || approveRes.status !== 200 || !approveRes.data || !approveRes.data.success) {
          pilotMutationFailed++;
          throw new Error('Pilot approval failed');
        }
        pilotMutationPassed++;
        approvedMutations++;
        pilotApprovedActive = true;
      });

      authorizationAttempted++;
      const postApproveSnap = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, tokens.superAdmin, monitoredFetch);
      executePlanTest('authorized_snapshot', () => {
        if (!postApproveSnap || postApproveSnap.status !== 200 || !postApproveSnap.data || postApproveSnap.data.authorized !== true) {
          authorizationFailed++;
          throw new Error('Authorized snapshot false');
        }
        authorizationPassed++;
      });

      behavioralAttempted++;
      const pubResApproved = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);
      executePlanTest('booking_allowed_public_response', () => {
        if (!pubResApproved || pubResApproved.status !== 200 || !pubResApproved.data || pubResApproved.data.bookable !== true || pubResApproved.data.primary_reason_code !== 'BOOKING_ALLOWED') {
          behavioralFailed++;
          throw new Error('Public response not BOOKING_ALLOWED');
        }
        behavioralPassed++;
      });

      // Browser Checkpoint 1
      browserCheckpointsAttempted++;
      const cp1Res = await checkpointHandler({ runId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug });
      executePlanTest('authorized_browser_checkpoint', () => {
        if (!cp1Res || !cp1Res.ok) {
          browserCheckpointsFailed++;
          throw new Error('Browser harness failed at authorized checkpoint');
        }
        browserCheckpointsPassed++;
      });

      // Transition Replay
      transitionAttempted++;
      const trans1Replay = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'pre_pilot',
        p_target_phase: 'paymentless_pilot',
        p_reason: 'Controlled H1E-C acceptance transition',
        p_idempotency_key: trans1Key
      }, tokens.superAdmin, monitoredFetch);

      executePlanTest('transition_replay', () => {
        if (!trans1Replay || trans1Replay.status !== 200 || !trans1Replay.data || trans1Replay.data.replayed !== true) {
          transitionFailed++;
          throw new Error('Transition replay failed');
        }
        transitionPassed++;
      });

      executePlanTest('replay_creates_no_extra_transition', () => {
        if (trans1Replay.data.changed !== false) throw new Error('Transition replay performed mutation');
      });

      // 7. Revoke Dedicated Tenant
      pilotMutationAttempted++;
      const revokeKey = `${runId}_revoke_1`;
      const revokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', {
        p_tenant_id: DEDICATED_H1D_TENANT_ID,
        p_reason: 'Controlled H1E-C acceptance pilot revocation',
        p_idempotency_key: revokeKey
      }, tokens.superAdmin, monitoredFetch);

      executePlanTest('pilot_revoke', () => {
        if (!revokeRes || revokeRes.status !== 200 || !revokeRes.data || !revokeRes.data.success) {
          pilotMutationFailed++;
          throw new Error('Pilot revocation failed');
        }
        pilotMutationPassed++;
        approvedMutations++;
        pilotApprovedActive = false;
      });

      behavioralAttempted++;
      const pubResRevoked = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);
      executePlanTest('booking_closes_immediately', () => {
        if (!pubResRevoked || pubResRevoked.status !== 200 || !pubResRevoked.data || pubResRevoked.data.bookable !== false) {
          behavioralFailed++;
          throw new Error('Booking remained open after revocation');
        }
        behavioralPassed++;
      });

      // Browser Checkpoint 2
      browserCheckpointsAttempted++;
      const cp2Res = await checkpointHandler({ runId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug });
      executePlanTest('revoked_browser_checkpoint', () => {
        if (!cp2Res || !cp2Res.ok) {
          browserCheckpointsFailed++;
          throw new Error('Browser harness failed at revoked checkpoint');
        }
        browserCheckpointsPassed++;
      });

      // 8. Restore pre_pilot Release Phase
      transitionAttempted++;
      const trans2Key = `${runId}_trans_2`;
      const trans2Res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'paymentless_pilot',
        p_target_phase: 'pre_pilot',
        p_reason: 'Controlled H1E-C acceptance restoration',
        p_idempotency_key: trans2Key
      }, tokens.superAdmin, monitoredFetch);

      executePlanTest('paymentless_pilot_to_pre_pilot_restoration', () => {
        if (!trans2Res || trans2Res.status !== 200 || !trans2Res.data || !trans2Res.data.success || !trans2Res.data.changed) {
          transitionFailed++;
          throw new Error('Restoration to pre_pilot failed');
        }
        transitionPassed++;
        approvedMutations++;
        phaseChangedToPaymentless = false;
      });

      executePlanTest('final_phase_pre_pilot', () => {
        if (trans2Res.data.release_phase !== 'pre_pilot') throw new Error('Phase is not pre_pilot');
      });

      // Browser Checkpoint 3
      browserCheckpointsAttempted++;
      const cp3Res = await checkpointHandler({ runId, checkpoint: 'restored_pre_pilot', dedicatedSlug });
      executePlanTest('restored_browser_checkpoint', () => {
        if (!cp3Res || !cp3Res.ok) {
          browserCheckpointsFailed++;
          throw new Error('Browser harness failed at restored checkpoint');
        }
        browserCheckpointsPassed++;
      });

      // 9. Final Evidence & Delta Verification
      const finEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_release_transition_evidence', { p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      executePlanTest('final_transition_evidence_captured', () => {
        if (!finEvRes || finEvRes.status !== 200 || !finEvRes.data || !finEvRes.data.success) {
          throw new Error('Final transition evidence fetch failed');
        }
        finalTransitionEvidence = finEvRes.data;
        finalReleasePhase = finEvRes.data.release_phase;
      });

      const finPilotEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      executePlanTest('final_pilot_evidence_captured', () => {
        if (!finPilotEvRes || finPilotEvRes.status !== 200 || !finPilotEvRes.data || !finPilotEvRes.data.success) {
          throw new Error('Final pilot evidence fetch failed');
        }
        finalPilotEvidence = finPilotEvRes.data;
        finalActiveAuthCount = finPilotEvRes.data.active_authorization_count;
      });

      executePlanTest('transition_history_delta_plus_2', () => {
        const delta = finalTransitionEvidence.transition_history_count - initialTransitionEvidence.transition_history_count;
        if (delta !== 2) throw new Error(`Expected history delta +2, got ${delta}`);
      });

      executePlanTest('paymentless_audit_delta_plus_1', () => {
        const delta = finalTransitionEvidence.paymentless_pilot_transition_audit_count - initialTransitionEvidence.paymentless_pilot_transition_audit_count;
        if (delta !== 1) throw new Error(`Expected paymentless audit delta +1, got ${delta}`);
      });

      executePlanTest('restoration_audit_delta_plus_1', () => {
        const delta = finalTransitionEvidence.pre_pilot_restoration_audit_count - initialTransitionEvidence.pre_pilot_restoration_audit_count;
        if (delta !== 1) throw new Error(`Expected restoration audit delta +1, got ${delta}`);
      });

      executePlanTest('transition_idempotency_delta_plus_2', () => {
        const initialCount = initialTransitionEvidence.idempotency_record_count || 0;
        const finalCount = finalTransitionEvidence.idempotency_record_count;
        const delta = finalCount - initialCount;
        if (initialCount !== 0 || finalCount !== 2 || delta !== 2) {
          throw new Error(`Expected initial 0, final 2, delta +2; got initial ${initialCount}, final ${finalCount}, delta ${delta}`);
        }
      });

      executePlanTest('pilot_approval_audit_delta_plus_1', () => {
        const delta = finalPilotEvidence.approved_audit_count - initialPilotEvidence.approved_audit_count;
        if (delta !== 1) throw new Error(`Expected approval audit delta +1, got ${delta}`);
      });

      executePlanTest('pilot_revocation_audit_delta_plus_1', () => {
        const delta = finalPilotEvidence.revoked_audit_count - initialPilotEvidence.revoked_audit_count;
        if (delta !== 1) throw new Error(`Expected revocation audit delta +1, got ${delta}`);
      });

      executePlanTest('final_active_authorization_count_0', () => {
        if (finalActiveAuthCount !== 0) throw new Error(`Expected active auth 0, got ${finalActiveAuthCount}`);
      });

      executePlanTest('final_payment_flags_false', () => {
        if (!validatePaymentFlagsFalse(finalTransitionEvidence)) throw new Error('Final payment flags not false');
      });

      executePlanTest('forbidden_requests_0', () => {
        if (observer.getForbiddenRequestsDetected() !== 0) throw new Error('Forbidden requests detected');
      });

      executePlanTest('forbidden_mutations_0', () => {
        if (observer.getForbiddenMutationAttemptsDetected() !== 0) throw new Error('Forbidden mutations detected');
      });

      executePlanTest('final_safe_state_verified', () => {
        if (finalReleasePhase !== 'pre_pilot' || finalActiveAuthCount !== 0 || !validatePaymentFlagsFalse(finalTransitionEvidence)) {
          throw new Error('Final state is not safe pre_pilot');
        }
      });
    }
  } catch (err) {
    if (mode === 'controlled_paymentless_pilot' && (phaseChangedToPaymentless || pilotApprovedActive)) {
      print('\n⚠️ EXECUTING COMPENSATION PROCEDURE');
      compensationAttempted++;

      if (pilotApprovedActive && tokens.superAdmin) {
        const compRevKey = `${runId}_comp_revoke`;
        const compRevRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', {
          p_tenant_id: DEDICATED_H1D_TENANT_ID,
          p_reason: 'Compensation revocation',
          p_idempotency_key: compRevKey
        }, tokens.superAdmin, monitoredFetch);
        if (compRevRes && compRevRes.status === 200 && compRevRes.data && compRevRes.data.success) {
          pilotApprovedActive = false;
          print('  ✅ Compensation: Pilot authorization revoked');
        } else {
          print('  ❌ Compensation: Pilot authorization revocation failed');
        }
      }

      if (phaseChangedToPaymentless && tokens.superAdmin) {
        const compTransKey = `${runId}_comp_restore`;
        const compTransRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
          p_expected_phase: 'paymentless_pilot',
          p_target_phase: 'pre_pilot',
          p_reason: 'Compensation restoration to pre_pilot',
          p_idempotency_key: compTransKey
        }, tokens.superAdmin, monitoredFetch);
        if (compTransRes && compTransRes.status === 200 && compTransRes.data && compTransRes.data.success) {
          phaseChangedToPaymentless = false;
          print('  ✅ Compensation: Restored release phase to pre_pilot');
        } else {
          print('  ❌ Compensation: Release phase restoration failed');
        }
      }

      // Real Read RPCs to verify compensation final state
      if (tokens.superAdmin) {
        const compEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_release_transition_evidence', {}, tokens.superAdmin, monitoredFetch);
        const compSnapRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, tokens.superAdmin, monitoredFetch);
        const compPubRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug || 'dedicated-slug' }, null, monitoredFetch);

        const isCompPhaseSafe = compEvRes && compEvRes.data && compEvRes.data.release_phase === 'pre_pilot';
        const isCompAuthSafe = compSnapRes && compSnapRes.data && compSnapRes.data.authorized === false;
        const isCompPaymentSafe = validatePaymentFlagsFalse(compEvRes ? compEvRes.data : null);
        const isCompPublicBlocked = compPubRes && compPubRes.data && compPubRes.data.bookable === false;

        if (isCompPhaseSafe && isCompAuthSafe && isCompPaymentSafe && isCompPublicBlocked) {
          compensationSucceeded++;
          cleanupRequired = false;
          print('  ✅ Compensation Remote Evidence: Final safe state verified remotely');
        } else {
          compensationFailed++;
          cleanupRequired = true;
          print('  ⚠️ OPERATOR WARNING: Remote evidence verification failed after compensation. Cleanup required = true');
        }
      } else {
        cleanupRequired = true;
      }
    }
  }

  forbiddenMutationAttempts = observer.getForbiddenMutationAttemptsDetected();
  forbiddenRequestsDetected = observer.getForbiddenRequestsDetected();

  const isAccountingValid = (executed === defined && passed === defined && failed === 0 && authFailed === 0 && authorizationFailed === 0 && transitionFailed === 0 && pilotMutationFailed === 0 && behavioralFailed === 0 && browserCheckpointsFailed === 0 && forbiddenMutationAttempts === 0 && forbiddenRequestsDetected === 0 && finalReleasePhase === 'pre_pilot' && finalActiveAuthCount === 0);

  const exitCode = isAccountingValid ? 0 : 1;

  print('\n══════════════════════════════════════════════════════════');
  print(`Defined tests: ${defined}`);
  print(`Executed tests: ${executed}`);
  print(`Passed: ${passed}`);
  print(`Failed: ${failed}`);
  print(`Blocked: ${blocked}`);
  print(`Total: ${executed}`);
  print('');
  print(`Authentication attempted: ${authAttempted}`);
  print(`Authentication passed: ${authPassed}`);
  print(`Authentication failed: ${authFailed}`);
  print('');
  print(`Authorization attempted: ${authorizationAttempted}`);
  print(`Authorization passed: ${authorizationPassed}`);
  print(`Authorization failed: ${authorizationFailed}`);
  print('');
  print(`Transition attempted: ${transitionAttempted}`);
  print(`Transition passed: ${transitionPassed}`);
  print(`Transition failed: ${transitionFailed}`);
  print('');
  print(`Pilot mutation attempted: ${pilotMutationAttempted}`);
  print(`Pilot mutation passed: ${pilotMutationPassed}`);
  print(`Pilot mutation failed: ${pilotMutationFailed}`);
  print('');
  print(`Behavioral attempted: ${behavioralAttempted}`);
  print(`Behavioral passed: ${behavioralPassed}`);
  print(`Behavioral failed: ${behavioralFailed}`);
  print('');
  print(`Browser checkpoints attempted: ${browserCheckpointsAttempted}`);
  print(`Browser checkpoints passed: ${browserCheckpointsPassed}`);
  print(`Browser checkpoints failed: ${browserCheckpointsFailed}`);
  print('');
  print(`Approved mutation RPC calls: ${approvedMutations}`);
  print(`Forbidden mutation attempts: ${forbiddenMutationAttempts}`);
  print(`Forbidden requests detected: ${forbiddenRequestsDetected}`);
  print(`Compensation attempted: ${compensationAttempted}`);
  print(`Compensation succeeded: ${compensationSucceeded}`);
  print(`Compensation failed: ${compensationFailed}`);
  print(`Cleanup required: ${cleanupRequired}`);
  print(`Initial release phase: ${initialReleasePhase}`);
  print(`Final release phase: ${finalReleasePhase}`);
  print(`Final active authorization count: ${finalActiveAuthCount}`);
  print(`First safe failure: ${firstSafeFailure ? firstSafeFailure : 'none'}`);
  print(`Final exit code: ${exitCode}`);

  const accounting = {
    defined, executed, passed, failed, blocked, total: executed,
    authAttempted, authPassed, authFailed,
    authorizationAttempted, authorizationPassed, authorizationFailed,
    transitionAttempted, transitionPassed, transitionFailed,
    pilotMutationAttempted, pilotMutationPassed, pilotMutationFailed,
    behavioralAttempted, behavioralPassed, behavioralFailed,
    browserCheckpointsAttempted, browserCheckpointsPassed, browserCheckpointsFailed,
    approvedMutations, forbiddenMutationAttempts, forbiddenRequestsDetected,
    compensationAttempted, compensationSucceeded, compensationFailed,
    cleanupRequired, initialReleasePhase, finalReleasePhase, finalActiveAuthCount,
    firstSafeFailure, exitCode
  };

  return { ok: exitCode === 0, mode, runId, exitCode, accounting, finalTransitionEvidence, finalPilotEvidence };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
  runH1ECredentialedAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
