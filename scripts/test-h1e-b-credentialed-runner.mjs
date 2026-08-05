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

const credentials = {
  nonmember: {
    label: 'nonmember',
    email: process.env.LARI_STAGE_H1D_NONMEMBER_EMAIL || 'h1dnonmember@randevulari.com',
    password: process.env.LARI_STAGE_H1D_NONMEMBER_PASSWORD
  },
  staff: {
    label: 'staff',
    email: process.env.LARI_STAGE_H1D_STAFF_EMAIL || 'melisstaff@randevulari.com',
    password: process.env.LARI_STAGE_H1D_STAFF_PASSWORD
  },
  owner: {
    label: 'canonical owner',
    email: process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com',
    password: process.env.LARI_STAGE_D1_OWNER_PASSWORD
  },
  otherOwner: {
    label: 'other owner',
    email: process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL || 'h1dotherowner@randevulari.com',
    password: process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD
  },
  superAdmin: {
    label: 'super admin',
    email: process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com',
    password: process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD
  }
};

const missingVars = [];
if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL');
if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');
if (!credentials.nonmember.password) missingVars.push('LARI_STAGE_H1D_NONMEMBER_PASSWORD');
if (!credentials.staff.password) missingVars.push('LARI_STAGE_H1D_STAFF_PASSWORD');
if (!credentials.owner.password) missingVars.push('LARI_STAGE_D1_OWNER_PASSWORD');
if (!credentials.otherOwner.password) missingVars.push('LARI_STAGE_H1D_OTHER_OWNER_PASSWORD');
if (!credentials.superAdmin.password) missingVars.push('LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD');

export function checkCredentials() {
  if (missingVars.length > 0) {
    console.log('=== STAGE H1E-B REAL SIX-IDENTITY MUTATION ACCEPTANCE RUNNER ===\n');
    console.log('⚠️ H1E_B_CREDENTIALS_REQUIRED');
    console.log('⚠️ STAGE_H1E_B_NOT_YET_GO');
    console.log('⚠️ PRODUCTION_NO_GO\n');
    console.log('Missing environment variables required for H1E-B credentialed mutation acceptance:');
    missingVars.forEach(v => console.log('  - ' + v));
    console.log('\nNo login attempt, network mutation or database write executed.');
    console.log('Final exit code: 1');
    return false;
  }
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-b-credentialed-runner.mjs') && !checkCredentials()) {
  process.exit(1);
}

export function evaluateAssertion(assertion) {
  try {
    const res = assertion();
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: redactSecrets(error.message || String(error))
    };
  }
}

export async function runCredentialedMutationAcceptanceH1EB() {
  const runId = 'h1e_b_mutation_run_' + Date.now();
  const approveIdempotencyKey = runId + '_approve_key';
  const approveConflictKey = approveIdempotencyKey;
  const revokeIdempotencyKey = runId + '_revoke_key';
  const revokeConflictKey = revokeIdempotencyKey;

  console.log('=== STAGE H1E-B REAL SIX-IDENTITY MUTATION ACCEPTANCE RUNNER ===');
  console.log('Run ID: ' + runId);
  console.log('Targeting: ' + supabaseUrl);
  console.log('Dedicated Staging Test Tenant: ' + DEDICATED_H1D_TENANT_ID);

  const observer = new NetworkObserver(supabaseUrl);
  const monitoredFetch = createMonitoredFetch(observer);

  let defined = 0;
  let executed = 0;
  let passed = 0;
  let failed = 0;
  let blocked = 0;

  let authAttempted = 0;
  let authPassed = 0;
  let authFailed = 0;

  let mutationAttempted = 0;
  let mutationPassed = 0;
  let mutationFailed = 0;

  let behavioralAttempted = 0;
  let behavioralPassed = 0;
  let behavioralFailed = 0;

  let approvedMutationRpcCalls = 0;
  let forbiddenMutationAttempts = 0;
  let forbiddenRequestsDetected = 0;

  let cleanupRequired = false;
  let finalActiveAuthCount = -1;
  let firstError = null;

  function trackResult(category, ok, name, errDetail) {
    defined++;
    executed++;
    if (category === 'auth') authAttempted++;
    else if (category === 'mutation') mutationAttempted++;
    else if (category === 'behavioral') behavioralAttempted++;

    if (ok) {
      passed++;
      if (category === 'auth') authPassed++;
      else if (category === 'mutation') mutationPassed++;
      else if (category === 'behavioral') behavioralPassed++;
      console.log('  ✅ PASS: ' + name);
    } else {
      failed++;
      if (category === 'auth') authFailed++;
      else if (category === 'mutation') mutationFailed++;
      else if (category === 'behavioral') behavioralFailed++;
      const msg = redactSecrets(errDetail || 'Failed');
      if (!firstError) firstError = { name, error: msg };
      console.error('  ❌ FAIL: ' + name + ' — ' + msg);
    }
  }

  try {
    // 1. Authenticate all 5 non-anon roles
    const roles = ['nonmember', 'staff', 'owner', 'otherOwner', 'superAdmin'];
    const sessions = {};
    let loginFailed = false;

    for (const roleKey of roles) {
      const cred = credentials[roleKey];
      const authRes = await authenticateUser(supabaseUrl, supabaseAnonKey, cred.email, cred.password, cred.label, monitoredFetch);
      if (!authRes.ok || !authRes.token) {
        loginFailed = true;
        trackResult('auth', false, `Login for role ${cred.label}`, `Auth failure category: ${authRes.failure_category}`);
        break;
      }
      sessions[roleKey] = authRes.token;
    }

    if (!loginFailed) {
      // 2. Precondition check: Tenant must exist and have 0 active authorizations
      const initialEvidenceRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
      if (!initialEvidenceRes.ok || initialEvidenceRes.data.active_authorization_count > 0) {
        cleanupRequired = true;
        trackResult('behavioral', false, 'Precondition: Dedicated tenant must have 0 active authorizations', 'Dedicated tenant contaminated with active authorization count ' + (initialEvidenceRes.data?.active_authorization_count ?? 'unknown'));
      } else {
        // 3. Five-role Authorization Matrix
        // Anon ACL denial check on read RPC
        const anonReadRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, null, monitoredFetch);
        const anonEval = evaluateAssertion(() => assertAnonAclDenied(anonReadRes));
        trackResult('auth', anonEval.ok, 'Anon call denied at RPC ACL boundary', anonEval.error);

        // 4 Unauthorized roles check
        const unauthorizedRoles = ['nonmember', 'staff', 'owner', 'otherOwner'];
        for (const uRole of unauthorizedRoles) {
          const uRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions[uRole], monitoredFetch);
          const uEval = evaluateAssertion(() => assertAuthenticatedUnauthorized(uRes, uRole));
          trackResult('auth', uEval.ok, `Role ${uRole} receives UNAUTHORIZED on read RPC`, uEval.error);

          const uApproveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'unauthorized attempt', p_idempotency_key: runId + '_unauth_' + uRole }, sessions[uRole], monitoredFetch);
          const uApproveEval = evaluateAssertion(() => assertAuthenticatedUnauthorized(uApproveRes, uRole));
          trackResult('auth', uApproveEval.ok, `Role ${uRole} receives UNAUTHORIZED on approve RPC`, uApproveEval.error);
        }

        // 4. Exact Mutation Acceptance Lifecycle (Super Admin)

        // Stage 1: Read Initial State
        const readInitialRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
        const readInitialOk = readInitialRes.ok && readInitialRes.data.success && readInitialRes.data.is_authorized === false;
        trackResult('behavioral', readInitialOk, 'Stage 1: Read initial state shows is_authorized = false');

        // Stage 2: Approve
        approvedMutationRpcCalls++;
        const approveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'H1E-B mutation acceptance test approval', p_idempotency_key: approveIdempotencyKey }, sessions.superAdmin, monitoredFetch);
        const approveOk = approveRes.ok && approveRes.data.success && approveRes.data.reason_code === 'PILOT_AUTHORIZATION_APPROVED' && approveRes.data.changed === true && approveRes.data.replayed === false;
        trackResult('mutation', approveOk, 'Stage 2: Super Admin approve returns PILOT_AUTHORIZATION_APPROVED with changed=true');

        // Stage 3: Read after Approve
        const readApproveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
        const readApproveOk = readApproveRes.ok && readApproveRes.data.success && readApproveRes.data.is_authorized === true && readApproveRes.data.status === 'PILOT_AUTHORIZED';
        trackResult('behavioral', readApproveOk, 'Stage 3: Read after approve shows PILOT_AUTHORIZED with active authorization');

        // Stage 4: Eligibility Snapshot after Approve
        const snapApproveRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
        const snapApproveOk = snapApproveRes.ok && snapApproveRes.data.success && snapApproveRes.data.authorized === true && snapApproveRes.data.bookable === false && snapApproveRes.data.pilot_authorization?.implementation_state === 'implemented';
        trackResult('behavioral', snapApproveOk, 'Stage 4: Eligibility snapshot after approve shows authorized=true, bookable=false');

        // Stage 5: Replay same approval key + fingerprint
        approvedMutationRpcCalls++;
        const approveReplayRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'H1E-B mutation acceptance test approval', p_idempotency_key: approveIdempotencyKey }, sessions.superAdmin, monitoredFetch);
        const approveReplayOk = approveReplayRes.ok && approveReplayRes.data.success && approveReplayRes.data.reason_code === 'PILOT_AUTHORIZATION_APPROVED' && approveReplayRes.data.changed === false && approveReplayRes.data.replayed === true;
        trackResult('mutation', approveReplayOk, 'Stage 5: Approve replay returns original response with changed=false, replayed=true');

        // Stage 6: Approve Conflict (same key, different fingerprint)
        approvedMutationRpcCalls++;
        const approveConflictRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'different approval reason', p_idempotency_key: approveConflictKey }, sessions.superAdmin, monitoredFetch);
        const approveConflictOk = approveConflictRes.ok && approveConflictRes.data.success === false && approveConflictRes.data.reason_code === 'IDEMPOTENCY_CONFLICT';
        trackResult('mutation', approveConflictOk, 'Stage 6: Approve conflict returns IDEMPOTENCY_CONFLICT');

        // Stage 7: Approve when already authorized (new key)
        approvedMutationRpcCalls++;
        const approveAlreadyRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_approve_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'new approval key while active', p_idempotency_key: runId + '_approve_new_key' }, sessions.superAdmin, monitoredFetch);
        const approveAlreadyOk = approveAlreadyRes.ok && approveAlreadyRes.data.success && approveAlreadyRes.data.reason_code === 'PILOT_ALREADY_AUTHORIZED' && approveAlreadyRes.data.changed === false;
        trackResult('mutation', approveAlreadyOk, 'Stage 7: Approve when already active returns PILOT_ALREADY_AUTHORIZED with changed=false');

        // Stage 8: Revoke
        approvedMutationRpcCalls++;
        const revokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'H1E-B mutation acceptance test revocation', p_idempotency_key: revokeIdempotencyKey }, sessions.superAdmin, monitoredFetch);
        const revokeOk = revokeRes.ok && revokeRes.data.success && revokeRes.data.reason_code === 'PILOT_AUTHORIZATION_REVOKED' && revokeRes.data.changed === true && revokeRes.data.replayed === false;
        trackResult('mutation', revokeOk, 'Stage 8: Super Admin revoke returns PILOT_AUTHORIZATION_REVOKED with changed=true');

        // Stage 9: Read after Revoke
        const readRevokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
        const readRevokeOk = readRevokeRes.ok && readRevokeRes.data.success && readRevokeRes.data.is_authorized === false && readRevokeRes.data.status === 'PILOT_AUTHORIZATION_REVOKED';
        trackResult('behavioral', readRevokeOk, 'Stage 9: Read after revoke shows status PILOT_AUTHORIZATION_REVOKED and no active authorization');

        // Stage 10: Eligibility Snapshot after Revoke
        const snapRevokeRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, sessions.superAdmin, monitoredFetch);
        const snapRevokeOk = snapRevokeRes.ok && snapRevokeRes.data.success && snapRevokeRes.data.authorized === false && snapRevokeRes.data.bookable === false;
        trackResult('behavioral', snapRevokeOk, 'Stage 10: Eligibility snapshot after revoke shows authorized=false, bookable=false');

        // Stage 11: Replay same revoke key + fingerprint
        approvedMutationRpcCalls++;
        const revokeReplayRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'H1E-B mutation acceptance test revocation', p_idempotency_key: revokeIdempotencyKey }, sessions.superAdmin, monitoredFetch);
        const revokeReplayOk = revokeReplayRes.ok && revokeReplayRes.data.success && revokeReplayRes.data.reason_code === 'PILOT_AUTHORIZATION_REVOKED' && revokeReplayRes.data.changed === false && revokeReplayRes.data.replayed === true;
        trackResult('mutation', revokeReplayOk, 'Stage 11: Revoke replay returns original response with changed=false, replayed=true');

        // Stage 12: Revoke Conflict (same key, different fingerprint)
        approvedMutationRpcCalls++;
        const revokeConflictRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_revoke_tenant_pilot', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_reason: 'different revocation reason', p_idempotency_key: revokeConflictKey }, sessions.superAdmin, monitoredFetch);
        const revokeConflictOk = revokeConflictRes.ok && revokeConflictRes.data.success === false && revokeConflictRes.data.reason_code === 'IDEMPOTENCY_CONFLICT';
        trackResult('mutation', revokeConflictOk, 'Stage 12: Revoke conflict returns IDEMPOTENCY_CONFLICT');

        // Stage 13: Mutation Evidence Verification
        const finalEvidenceRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_mutation_evidence', { p_tenant_id: DEDICATED_H1D_TENANT_ID, p_run_prefix: runId }, sessions.superAdmin, monitoredFetch);
        finalActiveAuthCount = finalEvidenceRes.data?.active_authorization_count ?? -1;

        const evidenceOk = finalEvidenceRes.ok && finalEvidenceRes.data.success &&
          finalEvidenceRes.data.active_authorization_count === 0 &&
          finalEvidenceRes.data.approved_audit_count === 1 &&
          finalEvidenceRes.data.revoked_audit_count === 1;

        trackResult('behavioral', evidenceOk, 'Stage 13: Mutation evidence confirms exactly 1 approval audit, 1 revoke audit, and 0 active authorizations');
      }
    }
  } catch (topErr) {
    const msg = redactSecrets(topErr.message || String(topErr));
    if (!firstError) firstError = { name: 'Top-Level Execution', error: msg };
  }

  forbiddenRequestsDetected = observer.getForbiddenRequestsDetected();
  forbiddenMutationAttempts = observer.getForbiddenMutationAttemptsDetected();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('Run ID: ' + runId);
  console.log('Defined tests: ' + defined);
  console.log('Executed tests: ' + executed);
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('Blocked: ' + blocked);
  console.log('Total: ' + defined);

  console.log('\nAuthorization attempted: ' + authAttempted);
  console.log('Authorization passed: ' + authPassed);
  console.log('Authorization failed: ' + authFailed);

  console.log('\nMutation attempted: ' + mutationAttempted);
  console.log('Mutation passed: ' + mutationPassed);
  console.log('Mutation failed: ' + mutationFailed);

  console.log('\nBehavioral attempted: ' + behavioralAttempted);
  console.log('Behavioral passed: ' + behavioralPassed);
  console.log('Behavioral failed: ' + behavioralFailed);

  console.log('\nApproved mutation RPC calls: ' + approvedMutationRpcCalls);
  console.log('Forbidden mutation attempts: ' + forbiddenMutationAttempts);
  console.log('Forbidden requests detected: ' + forbiddenRequestsDetected);
  console.log('Cleanup required: ' + cleanupRequired);
  console.log('Final active authorization count: ' + finalActiveAuthCount);
  console.log('First safe failure: ' + (firstError ? `${firstError.name} — ${firstError.error}` : 'None'));

  const isSuccess = (executed === defined && passed === defined && failed === 0 && blocked === 0 &&
    authFailed === 0 && mutationFailed === 0 && behavioralFailed === 0 &&
    forbiddenMutationAttempts === 0 && forbiddenRequestsDetected === 0 &&
    !cleanupRequired && finalActiveAuthCount === 0);

  const finalExitCode = isSuccess ? 0 : 1;
  console.log('Final exit code: ' + finalExitCode);
  process.exit(finalExitCode);
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-b-credentialed-runner.mjs')) {
  runCredentialedMutationAcceptanceH1EB();
}
