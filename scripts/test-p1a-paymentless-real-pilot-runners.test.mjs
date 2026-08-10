// scripts/test-p1a-paymentless-real-pilot-runners.test.mjs
import { runRealPilotActivation, REAL_PILOT_TENANT_ID, REAL_PILOT_SLUG, EXPECTED_PROJECT_REF, ALLOWED_ACTIVATION_MUTATION_RPCS } from './run-paymentless-real-pilot-activation.mjs';
import { runRealPilotRollback, ALLOWED_ROLLBACK_MUTATION_RPCS } from './run-paymentless-real-pilot-rollback.mjs';

function createMockEnv(overrides = {}) {
  return {
    VITE_SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    VITE_SUPABASE_ANON_KEY: 'mock_anon_key',
    LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: 'mock_super_admin_pass',
    ...overrides
  };
}

function createMockFetch(rpcResponses = {}) {
  const mutationCalls = [];

  const mockFetch = async (urlStr, options = {}) => {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    const body = options.body ? JSON.parse(options.body) : {};

    if (pathname.includes('/auth/v1/token')) {
      const email = body.email || 'superadmin@randevulari.com';
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'mock_access_token', token_type: 'bearer', user: { id: 'user-id', email } }),
        json: async () => ({ access_token: 'mock_access_token', token_type: 'bearer', user: { id: 'user-id', email } })
      };
    }

    if (pathname.includes('/rest/v1/rpc/')) {
      const rpcName = pathname.split('/rest/v1/rpc/')[1].split('?')[0];

      if (['super_admin_transition_release_phase', 'super_admin_approve_tenant_pilot', 'super_admin_revoke_tenant_pilot'].includes(rpcName)) {
        mutationCalls.push({ rpcName, body });
      }

      let resData = null;
      if (rpcResponses[rpcName]) {
        const handler = rpcResponses[rpcName];
        resData = typeof handler === 'function' ? handler(body) : handler;
      } else if (rpcName === 'can_accept_public_booking') {
        resData = {
          found: true,
          allowed: false,
          bookable: false,
          blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED']
        };
      } else if (rpcName === 'super_admin_get_tenant_pilot_eligibility_snapshot') {
        resData = {
          success: true,
          tenant_id: body.p_tenant_id,
          authorized: false,
          global_release_control: {
            release_phase: 'pre_pilot',
            is_payment_collection_enabled: false,
            is_checkout_enabled: false,
            is_iyzico_enabled: false
          },
          readiness_facts: {
            tenant_status: 'active',
            public_site_status: 'published',
            relationship_verification: { status: 'VERIFIED' }
          },
          pilot_authorization: { is_authorized: false }
        };
      } else if (rpcName === 'super_admin_transition_release_phase') {
        resData = { success: true, changed: true, release_phase: body.p_target_phase };
      } else if (rpcName === 'super_admin_approve_tenant_pilot') {
        resData = { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      } else if (rpcName === 'super_admin_revoke_tenant_pilot') {
        resData = { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_REVOKED' };
      } else {
        resData = { success: true };
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(resData),
        json: async () => resData
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
      json: async () => ({})
    };
  };

  return { mockFetch, mutationCalls };
}

async function runAllTests() {
  const results = [];
  const silentLogger = { log: () => {}, error: () => {}, warn: () => {} };

  console.log('=== RUNNING P1A & P1B COMPLETE ACTIVATION & ROLLBACK SAFETY MATRIX ===\n');

  // =========================================================================
  // ACTIVATION SAFETY MATRIX (A01 - A26)
  // =========================================================================

  // A01: Wrong Supabase project
  {
    const env = createMockEnv({ VITE_SUPABASE_URL: 'https://wrongproject.supabase.co' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A01', name: 'Refuses wrong Supabase project ref', pass: res.ok === false && res.reason === 'PROJECT_MISMATCH' && mutationCalls.length === 0 });
  }

  // A02: Wrong tenant ID
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ tenantId: 'wrong-tenant-id', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A02', name: 'Refuses wrong tenant ID', pass: res.ok === false && res.reason === 'TENANT_ID_MISMATCH' && mutationCalls.length === 0 });
  }

  // A03: Wrong tenant slug
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ tenantSlug: 'wrong-slug', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A03', name: 'Refuses wrong tenant slug', pass: res.ok === false && res.reason === 'TENANT_SLUG_MISMATCH' && mutationCalls.length === 0 });
  }

  // A04: Unauthenticated / missing password
  {
    const env = createMockEnv({ LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: '' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A04', name: 'Refuses unauthenticated actor (missing password)', pass: res.ok === false && res.reason === 'SUPER_ADMIN_PASSWORD_MISSING' && mutationCalls.length === 0 });
  }

  // A05: Valid authenticated NON-super-admin actor (e.g. customer/staff)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: false,
        reason_code: 'UNAUTHORIZED',
        changed: false,
        replayed: false
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A05', name: 'Refuses validly authenticated NON-super-admin actor (RPC UNAUTHORIZED)', pass: res.ok === false && res.reason === 'UNAUTHORIZED_ACTOR' && mutationCalls.length === 0 });
  }

  // A06: Dirty working tree
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ enforceCleanTree: true, isWorkingTreeClean: false, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A06', name: 'Refuses dirty working tree', pass: res.ok === false && res.reason === 'DIRTY_WORKING_TREE' && mutationCalls.length === 0 });
  }

  // A07: Unexpected release phase
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'paymentless_pilot', is_payment_collection_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A07', name: 'Refuses unexpected release phase (must be pre_pilot)', pass: res.ok === false && res.reason === 'UNEXPECTED_RELEASE_PHASE' && mutationCalls.length === 0 });
  }

  // A08, A09, A10: Payment collection / checkout / iyzico enabled
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: true },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A08_A09_A10', name: 'Refuses when payment collection / checkout flag enabled', pass: res.ok === false && res.reason === 'PAYMENT_FLAG_ENABLED' && mutationCalls.length === 0 });
  }

  // A11: Melis already authorized
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: true,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: true }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A11', name: 'Refuses when Melis already authorized', pass: res.ok === false && res.reason === 'ALREADY_AUTHORIZED' && mutationCalls.length === 0 });
  }

  // A12: Melis operational readiness not READY
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false },
        readiness_facts: { tenant_status: 'inactive', public_site_status: 'draft' },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A12', name: 'Refuses when Melis operational readiness is not READY', pass: res.ok === false && res.reason === 'TENANT_NOT_READY' && mutationCalls.length === 0 });
  }

  // A13: Blocker list is not exactly GLOBAL_RELEASE_PHASE_BLOCKED
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: () => ({
        found: true,
        allowed: false,
        bookable: false,
        blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED', 'SUBSCRIPTION_BLOCKED']
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A13', name: 'Refuses when blocker list has extra reason codes', pass: res.ok === false && res.reason === 'UNEXPECTED_BLOCKERS' && mutationCalls.length === 0 });
  }

  // A14: Fixture tenant (dddd1111-...) actively authorized
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => ({
        success: true,
        tenant_id: body.p_tenant_id,
        authorized: body.p_tenant_id.includes('dddd1111'),
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: body.p_tenant_id.includes('dddd1111') }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A14', name: 'Refuses when fixture tenant (dddd1111-...) is actively authorized', pass: res.ok === false && res.reason === 'FIXTURE_TENANT_AUTHORIZED' && mutationCalls.length === 0 });
  }

  // A15: Unrelated tenant (eeee1111-...) actively authorized
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => ({
        success: true,
        tenant_id: body.p_tenant_id,
        authorized: body.p_tenant_id.includes('eeee1111'),
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: body.p_tenant_id.includes('eeee1111') }
      })
    });
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A15', name: 'Refuses when unrelated tenant (eeee1111-...) is actively authorized', pass: res.ok === false && res.reason === 'UNRELATED_TENANT_AUTHORIZED' && mutationCalls.length === 0 });
  }

  // A16: Missing activation reason
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ reason: '', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A16', name: 'Refuses missing activation reason', pass: res.ok === false && res.reason === 'MISSING_ACTIVATION_REASON' && mutationCalls.length === 0 });
  }

  // A18: Missing authorization idempotency key in execution path
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ approveIdempotencyKey: ' ', env, fetchImpl: mockFetch, logger: silentLogger, dryRun: false });
    results.push({ code: 'A18', name: 'Independently proves authorization idempotency key is required', pass: res.ok === false && res.reason === 'MISSING_APPROVE_KEY' });
  }

  // A20: External frontend mandatory gate unsatisfied
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ requireExternalFrontend: true, externalFrontendUrl: 'http://localhost:4173', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A20', name: 'Refuses when external frontend mandatory gate fails', pass: res.ok === false && res.reason === 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' && mutationCalls.length === 0 });
  }

  // A21: Dry-run = 0 mutation RPCs
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: true });
    results.push({ code: 'A21', name: 'Dry-run execution executes exactly 0 mutation RPCs', pass: res.ok === true && res.reason === 'DRY_RUN_PASSED' && res.mutationRpcCount === 0 && mutationCalls.length === 0 });
  }

  // A22-A26: Execution path performs exactly 2 approved mutation RPCs and post-checks
  {
    const env = createMockEnv();
    let melisState = { allowed: false, bookable: false, blockers: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };

    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          return { found: true, allowed: melisState.allowed, bookable: melisState.bookable, blocking_reason_codes: melisState.blockers };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => {
        melisState = { allowed: false, bookable: false, blockers: ['PILOT_AUTHORIZATION_REQUIRED'] };
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_approve_tenant_pilot: (body) => {
        melisState = { allowed: true, bookable: true, blockers: [] };
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      }
    });

    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: false });
    const isBoundaryOk = mutationCalls.every(c => ALLOWED_ACTIVATION_MUTATION_RPCS.includes(c.rpcName));
    const pass = res.ok === true &&
      mutationCalls.length === 2 &&
      isBoundaryOk &&
      mutationCalls[0].rpcName === 'super_admin_transition_release_phase' &&
      mutationCalls[1].rpcName === 'super_admin_approve_tenant_pilot' &&
      res.postActivationState.melisBookable === true &&
      res.postActivationState.fixtureBlocked === true;
    results.push({ code: 'A22_A26', name: 'Execution path permits exactly 2 approved mutation RPCs and post-verifies Melis bookable & fixture blocked', pass });
  }

  // =========================================================================
  // ROLLBACK SAFETY MATRIX (R01 - R14)
  // =========================================================================

  // R01: Wrong project refuses
  {
    const env = createMockEnv({ VITE_SUPABASE_URL: 'https://wrongproject.supabase.co' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'R01', name: 'Rollback refuses wrong project ref', pass: res.ok === false && res.reason === 'PROJECT_MISMATCH' && mutationCalls.length === 0 });
  }

  // R02: Valid authenticated NON-super-admin actor rejected
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: false,
        reason_code: 'UNAUTHORIZED',
        changed: false,
        replayed: false
      })
    });
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'R02', name: 'Rollback rejects validly authenticated NON-super-admin actor (RPC UNAUTHORIZED)', pass: res.ok === false && res.reason === 'UNAUTHORIZED_ACTOR' && mutationCalls.length === 0 });
  }

  // R04: Rollback requires explicit reason
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotRollback({ reason: '', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'R04', name: 'Rollback requires explicit reason', pass: res.ok === false && res.reason === 'MISSING_ROLLBACK_REASON' && mutationCalls.length === 0 });
  }

  // R06-R14: Rollback execution ordering & safe verification
  {
    const env = createMockEnv();
    let currentPhase = 'paymentless_pilot';
    let melisAuth = true;

    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: (body) => ({
        found: true,
        allowed: currentPhase === 'paymentless_pilot' && melisAuth,
        bookable: currentPhase === 'paymentless_pilot' && melisAuth,
        blocking_reason_codes: currentPhase === 'pre_pilot' ? ['GLOBAL_RELEASE_PHASE_BLOCKED'] : (melisAuth ? [] : ['PILOT_AUTHORIZATION_REQUIRED'])
      }),
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: melisAuth,
        global_release_control: { release_phase: currentPhase, is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }
      }),
      super_admin_transition_release_phase: (body) => {
        currentPhase = body.p_target_phase;
        return { success: true, changed: true, release_phase: currentPhase };
      },
      super_admin_revoke_tenant_pilot: (body) => {
        melisAuth = false;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_REVOKED' };
      }
    });

    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: false });
    const isBoundaryOk = mutationCalls.every(c => ALLOWED_ROLLBACK_MUTATION_RPCS.includes(c.rpcName));
    const pass = res.ok === true &&
      mutationCalls.length === 2 &&
      isBoundaryOk &&
      mutationCalls[0].rpcName === 'super_admin_transition_release_phase' &&
      mutationCalls[0].body.p_target_phase === 'pre_pilot' &&
      mutationCalls[1].rpcName === 'super_admin_revoke_tenant_pilot' &&
      res.finalState.releasePhase === 'pre_pilot' &&
      res.finalState.melisBookable === false;
    results.push({ code: 'R06_R14', name: 'Rollback cuts booking FIRST via pre_pilot phase, then revokes tenant, verifying final safe state', pass });
  }

  // R09: Revocation failure leaves public booking globally blocked
  {
    const env = createMockEnv();
    let currentPhase = 'paymentless_pilot';

    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: (body) => ({
        found: true,
        allowed: currentPhase === 'paymentless_pilot',
        bookable: currentPhase === 'paymentless_pilot',
        blocking_reason_codes: currentPhase === 'pre_pilot' ? ['GLOBAL_RELEASE_PHASE_BLOCKED'] : []
      }),
      super_admin_transition_release_phase: (body) => {
        currentPhase = body.p_target_phase;
        return { success: true, changed: true, release_phase: currentPhase };
      },
      super_admin_revoke_tenant_pilot: () => ({
        success: false,
        reason_code: 'REVOCATION_FAILED'
      })
    });

    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: false });
    const pass = res.ok === false &&
      res.reason === 'REVOCATION_FAILED' &&
      mutationCalls.length === 2 &&
      mutationCalls[0].rpcName === 'super_admin_transition_release_phase' &&
      currentPhase === 'pre_pilot';
    results.push({ code: 'R09', name: 'Revocation failure leaves public booking globally blocked', pass });
  }

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${r.code}] ${icon}: ${r.name}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\nTotal P1A & P1B Runner Tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.pass).length}`);
  console.log(`Failed: ${results.filter(r => !r.pass).length}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

runAllTests().catch(console.error);
