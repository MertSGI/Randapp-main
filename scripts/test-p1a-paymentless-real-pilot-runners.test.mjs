// scripts/test-p1a-paymentless-real-pilot-runners.test.mjs
import { runRealPilotActivation, REAL_PILOT_TENANT_ID, REAL_PILOT_SLUG, EXPECTED_PROJECT_REF } from './run-paymentless-real-pilot-activation.mjs';
import { runRealPilotRollback } from './run-paymentless-real-pilot-rollback.mjs';

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
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'mock_access_token', token_type: 'bearer', user: { id: 'superadmin-id', email: 'superadmin@randevulari.com' } }),
        json: async () => ({ access_token: 'mock_access_token', token_type: 'bearer', user: { id: 'superadmin-id', email: 'superadmin@randevulari.com' } })
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

  console.log('=== RUNNING P1A ACTIVATION & ROLLBACK SAFETY TESTS ===\n');

  // Test 1: Activation fails on project mismatch
  {
    const env = createMockEnv({ VITE_SUPABASE_URL: 'https://wrongproject.supabase.co' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger });
    const pass = res.ok === false && res.reason === 'PROJECT_MISMATCH' && mutationCalls.length === 0;
    results.push({ name: 'Activation refuses wrong project ref', pass });
  }

  // Test 2: Activation fails on tenant mismatch
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ tenantId: 'invalid-id', env, fetchImpl: mockFetch, logger: silentLogger });
    const pass = res.ok === false && res.reason === 'TENANT_MISMATCH' && mutationCalls.length === 0;
    results.push({ name: 'Activation refuses tenant mismatch', pass });
  }

  // Test 3: Activation fails when release phase is not pre_pilot
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
    const pass = res.ok === false && res.reason === 'UNEXPECTED_RELEASE_PHASE' && mutationCalls.length === 0;
    results.push({ name: 'Activation refuses unexpected release_phase', pass });
  }

  // Test 4: Activation fails when payment flag is true
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
    const pass = res.ok === false && res.reason === 'PAYMENT_FLAG_ENABLED' && mutationCalls.length === 0;
    results.push({ name: 'Activation refuses enabled payment collection flag', pass });
  }

  // Test 5: Activation fails when Melis is already authorized
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
    const pass = res.ok === false && res.reason === 'ALREADY_AUTHORIZED' && mutationCalls.length === 0;
    results.push({ name: 'Activation refuses already-authorized Melis tenant', pass });
  }

  // Test 6: Dry-run activation passes without performing mutations
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: true });
    const pass = res.ok === true && res.reason === 'DRY_RUN_PASSED' && mutationCalls.length === 0;
    results.push({ name: 'Dry-run activation passes with 0 mutations', pass });
  }

  // Test 7: Live activation performs exactly two approved mutation RPC calls in sequence
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
    const pass = res.ok === true &&
      mutationCalls.length === 2 &&
      mutationCalls[0].rpcName === 'super_admin_transition_release_phase' &&
      mutationCalls[1].rpcName === 'super_admin_approve_tenant_pilot' &&
      res.postActivationState.melisBookable === true &&
      res.postActivationState.fixtureBlocked === true;
    results.push({ name: 'Execution activation performs exactly 2 approved mutation RPCs', pass });
  }

  // Test 8: Rollback restores pre_pilot phase FIRST before revoking authorization
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
      super_admin_revoke_tenant_pilot: (body) => ({
        success: true,
        changed: true,
        reason_code: 'PILOT_AUTHORIZATION_REVOKED'
      })
    });

    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: false });
    const pass = res.ok === true &&
      mutationCalls.length === 2 &&
      mutationCalls[0].rpcName === 'super_admin_transition_release_phase' &&
      mutationCalls[0].body.p_target_phase === 'pre_pilot' &&
      mutationCalls[1].rpcName === 'super_admin_revoke_tenant_pilot' &&
      res.finalState.releasePhase === 'pre_pilot' &&
      res.finalState.melisBookable === false;
    results.push({ name: 'Rollback cuts public booking FIRST via release_phase pre_pilot', pass });
  }

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon}: ${r.name}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\nTotal P1A Runner Tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.pass).length}`);
  console.log(`Failed: ${results.filter(r => !r.pass).length}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

runAllTests().catch(console.error);
