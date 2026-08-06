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
  checkpointHandler = null
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

  const runId = 'h1e_c_run_' + now();
  print('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===');
  print('Run ID: ' + runId);
  print('Mode: ' + mode);

  let defined = mode === 'controlled_paymentless_pilot' ? 36 : 20;
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
    // 1. Authenticate 5 identities
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

    if (mode === 'pre_pilot_readonly') {
      // 2. Snapshot authorization matrix
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
          recordFailure(`Behavioral 3.${target.label}`, `Public booking check failed: ${valPub.error || 'unexpected response'}`);
        }
      }
    } else if (mode === 'controlled_paymentless_pilot') {
      // CONTROLLED PAYMENTLESS PILOT FULL LIFECYCLE
      // 1. Initial Evidence Read
      executed++;
      const initEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_release_transition_evidence', { p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      if (initEvRes && initEvRes.status === 200 && initEvRes.data && initEvRes.data.success) {
        initialTransitionEvidence = initEvRes.data;
        initialReleasePhase = initEvRes.data.release_phase;
        recordPass('Controlled 1.InitialEvidence: Baseline captured');
      } else {
        recordFailure('Controlled 1.InitialEvidence', 'Failed to fetch initial transition evidence');
        throw new Error('Initial transition evidence fetch failed');
      }

      executed++;
      const initPilotEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      if (initPilotEvRes && initPilotEvRes.status === 200 && initPilotEvRes.data && initPilotEvRes.data.success) {
        initialPilotEvidence = initPilotEvRes.data;
        recordPass('Controlled 1.InitialPilotEvidence: Pilot baseline captured');
      } else {
        recordFailure('Controlled 1.InitialPilotEvidence', 'Failed to fetch initial pilot evidence');
        throw new Error('Initial pilot evidence fetch failed');
      }

      // Precondition Check on Dedicated Tenant Snapshot
      executed++;
      const initSnapRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, tokens.superAdmin, monitoredFetch);
      if (initSnapRes && initSnapRes.status === 200 && initSnapRes.data && initSnapRes.data.success) {
        dedicatedSlug = initSnapRes.data.tenant_slug;
        const isAuth = initSnapRes.data.pilot_authorization && initSnapRes.data.pilot_authorization.is_authorized;
        const blockers = initSnapRes.data.blocking_reason_codes || [];
        if (initialReleasePhase === 'pre_pilot' && !isAuth && validatePaymentFlagsFalse(initSnapRes.data) && (blockers.length === 1 && blockers[0] === 'GLOBAL_RELEASE_PHASE_BLOCKED')) {
          recordPass('Controlled 2.PreconditionCheck: Dedicated tenant ready for pilot');
        } else {
          recordFailure('Controlled 2.PreconditionCheck', 'Dedicated tenant precondition failed (active auth or extra blockers exist)');
          throw new Error('Precondition check failed for dedicated tenant');
        }
      } else {
        recordFailure('Controlled 2.PreconditionCheck', 'Failed to fetch initial snapshot');
        throw new Error('Initial snapshot fetch failed');
      }

      // 2. Transition pre_pilot -> paymentless_pilot
      transitionAttempted++;
      executed++;
      const trans1Key = `${runId}_trans_1`;
      const trans1Res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'pre_pilot',
        p_target_phase: 'paymentless_pilot',
        p_reason: 'Controlled H1E-C acceptance transition',
        p_idempotency_key: trans1Key
      }, tokens.superAdmin, monitoredFetch);

      if (trans1Res && trans1Res.status === 200 && trans1Res.data && trans1Res.data.success && trans1Res.data.changed === true) {
        transitionPassed++;
        approvedMutations++;
        phaseChangedToPaymentless = true;
        recordPass('Transition 3.PrePilotToPaymentless: Successfully transitioned to paymentless_pilot');
      } else {
        transitionFailed++;
        recordFailure('Transition 3.PrePilotToPaymentless', `Transition failed: ${trans1Res ? JSON.stringify(trans1Res.data) : 'null'}`);
        throw new Error('Transition to paymentless_pilot failed');
      }

      // 3. Verify Dedicated Tenant Blocked under paymentless_pilot before pilot authorization
      behavioralAttempted++;
      executed++;
      const pubResBeforeApprove = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);
      if (pubResBeforeApprove && pubResBeforeApprove.status === 200 && pubResBeforeApprove.data && pubResBeforeApprove.data.bookable === false) {
        behavioralPassed++;
        recordPass('Controlled 4.PreApprovePublicCheck: Dedicated public booking safely blocked before authorization');
      } else {
        behavioralFailed++;
        recordFailure('Controlled 4.PreApprovePublicCheck', 'Public booking unexpectedly allowed before authorization');
        throw new Error('Dedicated booking allowed before authorization');
      }

      // 4. Approve Dedicated Tenant Pilot Authorization
      pilotMutationAttempted++;
      executed++;
      const approveKey = `${runId}_approve_1`;
      const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', {
        p_tenant_id: DEDICATED_H1D_TENANT_ID,
        p_reason: 'Controlled H1E-C acceptance pilot approval',
        p_idempotency_key: approveKey
      }, tokens.superAdmin, monitoredFetch);

      if (approveRes && approveRes.status === 200 && approveRes.data && approveRes.data.success) {
        pilotMutationPassed++;
        approvedMutations++;
        pilotApprovedActive = true;
        recordPass('PilotMutation 5.ApproveDedicatedTenant: Pilot authorization approved');
      } else {
        pilotMutationFailed++;
        recordFailure('PilotMutation 5.ApproveDedicatedTenant', `Pilot approval failed: ${approveRes ? JSON.stringify(approveRes.data) : 'null'}`);
        throw new Error('Pilot approval failed');
      }

      // 5. Verify Dedicated Tenant becomes BOOKING_ALLOWED
      behavioralAttempted++;
      executed++;
      const pubResApproved = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);
      if (pubResApproved && pubResApproved.status === 200 && pubResApproved.data && pubResApproved.data.bookable === true && pubResApproved.data.primary_reason_code === 'BOOKING_ALLOWED') {
        behavioralPassed++;
        recordPass('Controlled 6.ApprovedPublicCheck: Dedicated public booking is BOOKING_ALLOWED');
      } else {
        behavioralFailed++;
        recordFailure('Controlled 6.ApprovedPublicCheck', 'Public booking check failed after approval');
        throw new Error('Public booking not allowed after pilot approval');
      }

      // 6. Invoke Checkpoint 1 (authorized_paymentless_pilot) Browser Harness
      browserCheckpointsAttempted++;
      executed++;
      const cp1Res = await checkpointHandler({ runId, checkpoint: 'authorized_paymentless_pilot', dedicatedSlug });
      if (cp1Res && cp1Res.ok) {
        browserCheckpointsPassed++;
        recordPass('BrowserCheckpoint 7.AuthorizedPaymentlessPilot: Browser verified active UI');
      } else {
        browserCheckpointsFailed++;
        recordFailure('BrowserCheckpoint 7.AuthorizedPaymentlessPilot', 'Browser harness failed at authorized checkpoint');
        throw new Error('Browser harness failed at authorized checkpoint');
      }

      // 7. Replay Transition 1 Idempotency Key
      transitionAttempted++;
      executed++;
      const trans1Replay = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'pre_pilot',
        p_target_phase: 'paymentless_pilot',
        p_reason: 'Controlled H1E-C acceptance transition',
        p_idempotency_key: trans1Key
      }, tokens.superAdmin, monitoredFetch);

      if (trans1Replay && trans1Replay.status === 200 && trans1Replay.data && trans1Replay.data.replayed === true && trans1Replay.data.changed === false) {
        transitionPassed++;
        recordPass('Transition 8.ReplayTrans1: Idempotent replay verified without duplicate mutation');
      } else {
        transitionFailed++;
        recordFailure('Transition 8.ReplayTrans1', 'Idempotent transition replay failed');
        throw new Error('Transition replay failed');
      }

      // 8. Revoke Dedicated Tenant Pilot Authorization
      pilotMutationAttempted++;
      executed++;
      const revokeKey = `${runId}_revoke_1`;
      const revokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', {
        p_tenant_id: DEDICATED_H1D_TENANT_ID,
        p_reason: 'Controlled H1E-C acceptance pilot revocation',
        p_idempotency_key: revokeKey
      }, tokens.superAdmin, monitoredFetch);

      if (revokeRes && revokeRes.status === 200 && revokeRes.data && revokeRes.data.success) {
        pilotMutationPassed++;
        approvedMutations++;
        pilotApprovedActive = false;
        recordPass('PilotMutation 9.RevokeDedicatedTenant: Pilot authorization revoked');
      } else {
        pilotMutationFailed++;
        recordFailure('PilotMutation 9.RevokeDedicatedTenant', 'Pilot revocation failed');
        throw new Error('Pilot revocation failed');
      }

      // 9. Verify Public Booking Closes Immediately
      behavioralAttempted++;
      executed++;
      const pubResRevoked = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'can_accept_public_booking', { p_slug: dedicatedSlug }, null, monitoredFetch);
      if (pubResRevoked && pubResRevoked.status === 200 && pubResRevoked.data && pubResRevoked.data.bookable === false && pubResRevoked.data.blocking_reason_codes.includes('PILOT_AUTHORIZATION_REVOKED')) {
        behavioralPassed++;
        recordPass('Controlled 10.RevokedPublicCheck: Public booking closed with PILOT_AUTHORIZATION_REVOKED');
      } else {
        behavioralFailed++;
        recordFailure('Controlled 10.RevokedPublicCheck', 'Public booking failed to close after revocation');
        throw new Error('Public booking remained open after revocation');
      }

      // 10. Invoke Checkpoint 2 (revoked_paymentless_pilot) Browser Harness
      browserCheckpointsAttempted++;
      executed++;
      const cp2Res = await checkpointHandler({ runId, checkpoint: 'revoked_paymentless_pilot', dedicatedSlug });
      if (cp2Res && cp2Res.ok) {
        browserCheckpointsPassed++;
        recordPass('BrowserCheckpoint 11.RevokedPaymentlessPilot: Browser verified revoked UI');
      } else {
        browserCheckpointsFailed++;
        recordFailure('BrowserCheckpoint 11.RevokedPaymentlessPilot', 'Browser harness failed at revoked checkpoint');
        throw new Error('Browser harness failed at revoked checkpoint');
      }

      // 11. Restore pre_pilot Release Phase
      transitionAttempted++;
      executed++;
      const trans2Key = `${runId}_trans_2`;
      const trans2Res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_transition_release_phase', {
        p_expected_phase: 'paymentless_pilot',
        p_target_phase: 'pre_pilot',
        p_reason: 'Controlled H1E-C acceptance restoration',
        p_idempotency_key: trans2Key
      }, tokens.superAdmin, monitoredFetch);

      if (trans2Res && trans2Res.status === 200 && trans2Res.data && trans2Res.data.success && trans2Res.data.changed === true) {
        transitionPassed++;
        approvedMutations++;
        phaseChangedToPaymentless = false;
        recordPass('Transition 12.RestorePrePilot: Successfully restored pre_pilot phase');
      } else {
        transitionFailed++;
        recordFailure('Transition 12.RestorePrePilot', 'Failed to restore pre_pilot phase');
        throw new Error('Restoration to pre_pilot failed');
      }

      // 12. Invoke Checkpoint 3 (restored_pre_pilot) Browser Harness
      browserCheckpointsAttempted++;
      executed++;
      const cp3Res = await checkpointHandler({ runId, checkpoint: 'restored_pre_pilot', dedicatedSlug });
      if (cp3Res && cp3Res.ok) {
        browserCheckpointsPassed++;
        recordPass('BrowserCheckpoint 13.RestoredPrePilot: Browser verified restored pre-pilot UI');
      } else {
        browserCheckpointsFailed++;
        recordFailure('BrowserCheckpoint 13.RestoredPrePilot', 'Browser harness failed at restored checkpoint');
        throw new Error('Browser harness failed at restored checkpoint');
      }

      // 13. Final Evidence & Safe State Verification
      executed++;
      const finEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_release_transition_evidence', { p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      if (finEvRes && finEvRes.status === 200 && finEvRes.data && finEvRes.data.success) {
        finalTransitionEvidence = finEvRes.data;
        finalReleasePhase = finEvRes.data.release_phase;
      } else {
        recordFailure('Controlled 14.FinalEvidence', 'Failed to fetch final transition evidence');
        throw new Error('Final transition evidence fetch failed');
      }

      executed++;
      const finPilotEvRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_run_prefix: runId }, tokens.superAdmin, monitoredFetch);
      if (finPilotEvRes && finPilotEvRes.status === 200 && finPilotEvRes.data && finPilotEvRes.data.success) {
        finalPilotEvidence = finPilotEvRes.data;
        finalActiveAuthCount = finPilotEvRes.data.active_authorization_count;
      } else {
        recordFailure('Controlled 14.FinalPilotEvidence', 'Failed to fetch final pilot evidence');
        throw new Error('Final pilot evidence fetch failed');
      }

      // Verify Deltas
      const transHistDelta = finalTransitionEvidence.transition_history_count - initialTransitionEvidence.transition_history_count;
      const paymentlessAuditDelta = finalTransitionEvidence.paymentless_pilot_transition_audit_count - initialTransitionEvidence.paymentless_pilot_transition_audit_count;
      const prepilotAuditDelta = finalTransitionEvidence.pre_pilot_restoration_audit_count - initialTransitionEvidence.pre_pilot_restoration_audit_count;

      if (transHistDelta === 2 && paymentlessAuditDelta === 1 && prepilotAuditDelta === 1 && finalReleasePhase === 'pre_pilot' && finalActiveAuthCount === 0 && validatePaymentFlagsFalse(finalTransitionEvidence)) {
        recordPass('Controlled 15.EvidenceDeltas: Required transition deltas and final safe state verified');
      } else {
        recordFailure('Controlled 15.EvidenceDeltas', `Evidence delta check failed: histDelta=${transHistDelta}, pAuditDelta=${paymentlessAuditDelta}, rAuditDelta=${prepilotAuditDelta}, finalPhase=${finalReleasePhase}, activeAuth=${finalActiveAuthCount}`);
        throw new Error('Evidence delta verification failed');
      }
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

      if (!phaseChangedToPaymentless && !pilotApprovedActive) {
        compensationSucceeded++;
        cleanupRequired = false;
      } else {
        compensationFailed++;
        cleanupRequired = true;
        print('  ⚠️ OPERATOR WARNING: Automatic cleanup incomplete. Manual staging intervention required.');
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

  return { ok: exitCode === 0, mode, exitCode, accounting };
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
  runH1ECredentialedAcceptance().then(res => {
    process.exitCode = res.exitCode;
  });
}
