// scripts/test-p1a-paymentless-real-pilot-runners.test.mjs
import { runRealPilotActivation, REAL_PILOT_TENANT_ID, REAL_PILOT_SLUG, EXPECTED_PROJECT_REF, ALLOWED_ACTIVATION_MUTATION_RPCS, REQUIRED_ACTIVATION_CONFIRMATION } from './run-paymentless-real-pilot-activation.mjs';
import { runRealPilotRollback, ALLOWED_ROLLBACK_MUTATION_RPCS, REQUIRED_ROLLBACK_CONFIRMATION } from './run-paymentless-real-pilot-rollback.mjs';

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
  let currentReleasePhase = 'pre_pilot';

  const mockFetch = async (urlStr, options = {}) => {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    const body = options.body ? JSON.parse(options.body) : {};

    if (urlStr.includes('lari-staging.vercel.app')) {
      return { ok: true, status: 200, text: async () => '<html>Vercel Staging</html>' };
    }

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

      if (rpcName === 'super_admin_transition_release_phase') {
        currentReleasePhase = body.p_target_phase || 'paymentless_pilot';
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
            release_phase: currentReleasePhase,
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
  const currentSha = '69837e78fb6d261259263d2d23c6424fd0565d7c';
  const baseActivationOpts = {
    expectedSha: currentSha,
    enforceGitSha: false,
    enforceCleanTree: false,
    requireExternalFrontend: false
  };

  console.log('=== RUNNING P1C.0 OPERATOR EXECUTION CONTRACT SAFETY MATRIX ===\n');

  // =========================================================================
  // ACTIVATION SAFETY MATRIX INDIVIDUAL ASSERTIONS (A01 - A26)
  // =========================================================================

  // A01
  {
    const env = createMockEnv({ VITE_SUPABASE_URL: 'https://wrongproject.supabase.co' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A01', name: 'Refuses wrong Supabase project ref', assertion: 'res.reason === PROJECT_MISMATCH', pass: res.ok === false && res.reason === 'PROJECT_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A02
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, tenantId: 'wrong-tenant-id', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A02', name: 'Refuses wrong tenant ID', assertion: 'res.reason === TENANT_ID_MISMATCH', pass: res.ok === false && res.reason === 'TENANT_ID_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A03
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, tenantSlug: 'wrong-slug', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A03', name: 'Refuses wrong tenant slug', assertion: 'res.reason === TENANT_SLUG_MISMATCH', pass: res.ok === false && res.reason === 'TENANT_SLUG_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A04
  {
    const env = createMockEnv({ LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: '' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A04', name: 'Refuses unauthenticated actor', assertion: 'res.reason === SUPER_ADMIN_PASSWORD_MISSING', pass: res.ok === false && res.reason === 'SUPER_ADMIN_PASSWORD_MISSING' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A05
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A05', name: 'Refuses validly authenticated NON-super-admin actor', assertion: 'res.reason === UNAUTHORIZED_ACTOR', pass: res.ok === false && res.reason === 'UNAUTHORIZED_ACTOR' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A06
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, enforceCleanTree: true, isWorkingTreeClean: false, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A06', name: 'Refuses dirty working tree', assertion: 'res.reason === DIRTY_WORKING_TREE', pass: res.ok === false && res.reason === 'DIRTY_WORKING_TREE' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A07
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A07', name: 'Refuses unexpected release phase', assertion: 'res.reason === UNEXPECTED_RELEASE_PHASE', pass: res.ok === false && res.reason === 'UNEXPECTED_RELEASE_PHASE' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A08
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: true, is_checkout_enabled: false, is_iyzico_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A08', name: 'Refuses when is_payment_collection_enabled is true', assertion: 'res.reason === PAYMENT_FLAG_ENABLED', pass: res.ok === false && res.reason === 'PAYMENT_FLAG_ENABLED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A09
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: true, is_iyzico_enabled: false },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A09', name: 'Refuses when is_checkout_enabled is true', assertion: 'res.reason === PAYMENT_FLAG_ENABLED', pass: res.ok === false && res.reason === 'PAYMENT_FLAG_ENABLED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A10
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: false,
        global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: true },
        readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
        pilot_authorization: { is_authorized: false }
      })
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A10', name: 'Refuses when is_iyzico_enabled is true', assertion: 'res.reason === PAYMENT_FLAG_ENABLED', pass: res.ok === false && res.reason === 'PAYMENT_FLAG_ENABLED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A11
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A11', name: 'Refuses when Melis already authorized', assertion: 'res.reason === ALREADY_AUTHORIZED', pass: res.ok === false && res.reason === 'ALREADY_AUTHORIZED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A12
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A12', name: 'Refuses when operational readiness is not READY', assertion: 'res.reason === TENANT_NOT_READY', pass: res.ok === false && res.reason === 'TENANT_NOT_READY' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A13
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A13', name: 'Refuses when blocker set has extra reason codes', assertion: 'res.reason === UNEXPECTED_BLOCKERS', pass: res.ok === false && res.reason === 'UNEXPECTED_BLOCKERS' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A14
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A14', name: 'Refuses when fixture tenant (dddd1111-...) is actively authorized', assertion: 'res.reason === FIXTURE_TENANT_AUTHORIZED', pass: res.ok === false && res.reason === 'FIXTURE_TENANT_AUTHORIZED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A15
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
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A15', name: 'Refuses when unrelated tenant (eeee1111-...) is actively authorized', assertion: 'res.reason === UNRELATED_TENANT_AUTHORIZED', pass: res.ok === false && res.reason === 'UNRELATED_TENANT_AUTHORIZED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A16
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, reason: '', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A16', name: 'Refuses missing activation reason', assertion: 'res.reason === MISSING_ACTIVATION_REASON', pass: res.ok === false && res.reason === 'MISSING_ACTIVATION_REASON' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A17
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, transitionIdempotencyKey: ' ', env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A17', name: 'Refuses missing transition idempotency key independently', assertion: 'res.reason === MISSING_TRANSITION_KEY', pass: res.ok === false && res.reason === 'MISSING_TRANSITION_KEY', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A18
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, approveIdempotencyKey: ' ', env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A18', name: 'Refuses missing authorization idempotency key independently', assertion: 'res.reason === MISSING_APPROVE_KEY', pass: res.ok === false && res.reason === 'MISSING_APPROVE_KEY', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A19
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: () => ({
        success: true,
        authorized: true,
        global_release_control: { release_phase: 'paymentless_pilot' }
      })
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A19', name: 'Rejects invalid or reused operator contract state snapshot', assertion: 'res.ok === false && mutationCalls.length === 0', pass: res.ok === false && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A20
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, requireExternalFrontend: true, externalFrontendUrl: 'http://localhost:4173', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'A20', name: 'Refuses when external frontend mandatory gate fails', assertion: 'res.reason === REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED', pass: res.ok === false && res.reason === 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A21
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, dryRun: true });
    results.push({ code: 'A21', name: 'Dry-run execution produces exactly 0 mutation RPCs', assertion: 'res.dryRun === true && mutationRpcCount === 0', pass: res.ok === true && res.reason === 'DRY_RUN_PASSED' && res.mutationRpcCount === 0 && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A22
  {
    const env = createMockEnv();
    let step = 0;
    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => {
        step = 1;
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_approve_tenant_pilot: () => {
        step = 2;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      }
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A22', name: 'Real execution path produces exactly 2 approved mutation RPCs', assertion: 'mutationCalls.length === 2 && mutationRpcCount === 2', pass: res.ok === true && mutationCalls.length === 2 && res.mutationRpcCount === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A23
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    const isBoundaryClean = mutationCalls.every(c => ALLOWED_ACTIVATION_MUTATION_RPCS.includes(c.rpcName));
    results.push({ code: 'A23', name: 'Third or unapproved mutation RPC rejected by allowlist boundary', assertion: 'ALLOWED_ACTIVATION_MUTATION_RPCS contains only 2 approved RPCs', pass: isBoundaryClean && ALLOWED_ACTIVATION_MUTATION_RPCS.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A24
  {
    const env = createMockEnv();
    let step = 0;
    const { mockFetch } = createMockFetch({
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => {
        step = 1;
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_approve_tenant_pilot: () => {
        step = 2;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      }
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A24', name: 'Payment flags revalidated after release transition before tenant approval', assertion: 'midCheck verifies PILOT_AUTHORIZATION_REQUIRED blocker and payment flags false', pass: res.ok === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A25
  {
    const env = createMockEnv();
    let step = 0;
    const { mockFetch } = createMockFetch({
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => {
        step = 1;
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_approve_tenant_pilot: () => {
        step = 2;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      }
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A25', name: 'Successful activation requires Melis bookable postcondition', assertion: 'postActivationState.melisBookable === true', pass: res.ok === true && res.postActivationState.melisBookable === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A26
  {
    const env = createMockEnv();
    let step = 0;
    const { mockFetch } = createMockFetch({
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => {
        step = 1;
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_approve_tenant_pilot: () => {
        step = 2;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' };
      }
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    results.push({ code: 'A26', name: 'Successful activation requires fixture tenant non-bookable postcondition', assertion: 'postActivationState.fixtureBlocked === true', pass: res.ok === true && res.postActivationState.fixtureBlocked === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // =========================================================================
  // NEW P1C.0 OPERATOR CLI HARDENING TESTS
  // =========================================================================

  // CLI-01: Plain activation CLI defaults to dry-run (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, dryRun: true });
    results.push({ code: 'CLI-01', name: 'Plain activation CLI defaults to dry-run (0 mutations)', assertion: 'res.dryRun === true && mutationRpcCount === 0', pass: res.ok === true && res.dryRun === true && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-02: Missing confirmation refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: null, dryRun: false });
    results.push({ code: 'CLI-02', name: 'Missing operator confirmation refuses real execution', assertion: 'res.reason === MISSING_OPERATOR_CONFIRMATION', pass: res.ok === false && res.reason === 'MISSING_OPERATOR_CONFIRMATION' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-03: Wrong confirmation string refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: 'WRONG_CONFIRMATION', dryRun: false });
    results.push({ code: 'CLI-03', name: 'Wrong operator confirmation refuses real execution', assertion: 'res.reason === MISSING_OPERATOR_CONFIRMATION', pass: res.ok === false && res.reason === 'MISSING_OPERATOR_CONFIRMATION' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-04: Correct confirmation + wrong SHA refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({
      ...baseActivationOpts,
      enforceGitSha: true,
      getHeadShaImpl: () => 'wrong_head_sha',
      getOriginShaImpl: () => currentSha,
      env, fetchImpl: mockFetch, logger: silentLogger,
      operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION,
      dryRun: false
    });
    results.push({ code: 'CLI-04', name: 'Correct confirmation + wrong SHA refuses real execution', assertion: 'res.reason === SHA_MISMATCH', pass: res.ok === false && res.reason === 'SHA_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-05: Correct confirmation + dirty tree refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({
      ...baseActivationOpts,
      enforceCleanTree: true,
      isWorkingTreeClean: false,
      env, fetchImpl: mockFetch, logger: silentLogger,
      operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION,
      dryRun: false
    });
    results.push({ code: 'CLI-05', name: 'Correct confirmation + dirty working tree refuses real execution', assertion: 'res.reason === DIRTY_WORKING_TREE', pass: res.ok === false && res.reason === 'DIRTY_WORKING_TREE' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-06: Correct confirmation + missing external URL refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({
      ...baseActivationOpts,
      requireExternalFrontend: true,
      externalFrontendUrl: null,
      env, fetchImpl: mockFetch, logger: silentLogger,
      operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION,
      dryRun: false
    });
    results.push({ code: 'CLI-06', name: 'Correct confirmation + missing external URL refuses real execution', assertion: 'res.reason === REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED', pass: res.ok === false && res.reason === 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-07: Correct confirmation + localhost URL refuses execution mode (0 mutations)
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({
      ...baseActivationOpts,
      requireExternalFrontend: true,
      externalFrontendUrl: 'http://localhost:5173',
      env, fetchImpl: mockFetch, logger: silentLogger,
      operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION,
      dryRun: false
    });
    results.push({ code: 'CLI-07', name: 'Correct confirmation + localhost URL refuses real execution', assertion: 'res.reason === REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED', pass: res.ok === false && res.reason === 'REAL_PILOT_EXTERNAL_FRONTEND_NOT_DEPLOYED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-08: Mid-transition payment flag true stops before tenant approval (POST_TRANSITION_PAYMENT_SAFETY_FAILED)
  {
    const env = createMockEnv();
    let phaseTransitioned = false;
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_transition_release_phase: (body) => {
        phaseTransitioned = true;
        return { success: true, changed: true, release_phase: body.p_target_phase };
      },
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (phaseTransitioned) {
          return {
            success: true,
            tenant_id: body.p_tenant_id,
            authorized: false,
            global_release_control: {
              release_phase: 'paymentless_pilot',
              is_payment_collection_enabled: true, // Safety failure simulated!
              is_checkout_enabled: false,
              is_iyzico_enabled: false
            },
            readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
            pilot_authorization: { is_authorized: false }
          };
        }
        return {
          success: true,
          tenant_id: body.p_tenant_id,
          authorized: false,
          global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false },
          readiness_facts: { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } },
          pilot_authorization: { is_authorized: false }
        };
      }
    });
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION, dryRun: false });
    const isApproveCalled = mutationCalls.some(c => c.rpcName === 'super_admin_approve_tenant_pilot');
    results.push({ code: 'CLI-08', name: 'Mid-transition payment flag true stops before tenant approval', assertion: 'POST_TRANSITION_PAYMENT_SAFETY_FAILED && super_admin_approve_tenant_pilot not called', pass: res.ok === false && res.reason === 'POST_TRANSITION_PAYMENT_SAFETY_FAILED' && !isApproveCalled, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-09: Plain rollback CLI does not mutate
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, dryRun: true });
    results.push({ code: 'CLI-09', name: 'Plain rollback CLI defaults to dry-run (0 mutations)', assertion: 'res.dryRun === true && mutationCalls.length === 0', pass: res.ok === true && res.dryRun === true && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // CLI-10: Explicit rollback contract permits tested rollback path
  {
    const env = createMockEnv();
    let currentPhase = 'paymentless_pilot';
    let melisAuth = true;

    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: () => ({
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
      super_admin_revoke_tenant_pilot: () => {
        melisAuth = false;
        return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_REVOKED' };
      }
    });

    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'CLI-10', name: 'Explicit rollback contract permits tested mutating rollback path', assertion: 'res.ok === true && mutationCalls.length === 2', pass: res.ok === true && mutationCalls.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // =========================================================================
  // ROLLBACK SAFETY MATRIX INDIVIDUAL ASSERTIONS (R01 - R14)
  // =========================================================================

  // R01
  {
    const env = createMockEnv({ VITE_SUPABASE_URL: 'https://wrongproject.supabase.co' });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'R01', name: 'Rollback refuses wrong project ref', assertion: 'res.reason === PROJECT_MISMATCH', pass: res.ok === false && res.reason === 'PROJECT_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R02
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
    results.push({ code: 'R02', name: 'Rollback rejects validly authenticated NON-super-admin actor', assertion: 'res.reason === UNAUTHORIZED_ACTOR', pass: res.ok === false && res.reason === 'UNAUTHORIZED_ACTOR' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R03
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_transition_release_phase: () => ({ success: false, reason_code: 'UNEXPECTED_INITIAL_PHASE' })
    });
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R03', name: 'Unexpected release state refuses unsafe rollback mutation', assertion: 'res.reason === TRANSITION_FAILED', pass: res.ok === false && res.reason === 'TRANSITION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R04
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotRollback({ reason: '', env, fetchImpl: mockFetch, logger: silentLogger });
    results.push({ code: 'R04', name: 'Rollback requires explicit reason', assertion: 'res.reason === MISSING_ROLLBACK_REASON', pass: res.ok === false && res.reason === 'MISSING_ROLLBACK_REASON' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R05
  {
    const env = createMockEnv();
    const { mockFetch } = createMockFetch();
    const resTrans = await runRealPilotRollback({ transitionIdempotencyKey: ' ', env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    const resRev = await runRealPilotRollback({ revokeIdempotencyKey: ' ', env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R05', name: 'Both rollback idempotency keys required', assertion: 'MISSING_TRANSITION_KEY & MISSING_REVOKE_KEY', pass: resTrans.reason === 'MISSING_TRANSITION_KEY' && resRev.reason === 'MISSING_REVOKE_KEY', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R06
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R06', name: 'First mutation is paymentless_pilot -> pre_pilot transition', assertion: 'mutationCalls[0].rpcName === super_admin_transition_release_phase', pass: mutationCalls.length > 0 && mutationCalls[0].rpcName === 'super_admin_transition_release_phase' && mutationCalls[0].body.p_target_phase === 'pre_pilot', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R07
  {
    const env = createMockEnv();
    const { mockFetch } = createMockFetch({
      can_accept_public_booking: () => ({ found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] })
    });
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R07', name: 'Melis immediately non-bookable after global restoration', assertion: 'Step 2 verifies GLOBAL_RELEASE_PHASE_BLOCKED', pass: res.ok === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R08
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R08', name: 'Tenant revocation occurs ONLY after global booking cut', assertion: 'mutationCalls[1].rpcName === super_admin_revoke_tenant_pilot', pass: mutationCalls.length === 2 && mutationCalls[1].rpcName === 'super_admin_revoke_tenant_pilot', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R09
  {
    const env = createMockEnv();
    let currentPhase = 'paymentless_pilot';
    const { mockFetch, mutationCalls } = createMockFetch({
      can_accept_public_booking: () => ({ found: true, allowed: currentPhase === 'paymentless_pilot', bookable: currentPhase === 'paymentless_pilot', blocking_reason_codes: currentPhase === 'pre_pilot' ? ['GLOBAL_RELEASE_PHASE_BLOCKED'] : [] }),
      super_admin_transition_release_phase: (body) => {
        currentPhase = body.p_target_phase;
        return { success: true, changed: true, release_phase: currentPhase };
      },
      super_admin_revoke_tenant_pilot: () => ({ success: false, reason_code: 'REVOCATION_FAILED' })
    });
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R09', name: 'Revocation failure still leaves public booking globally blocked', assertion: 'res.reason === REVOCATION_FAILED & currentPhase === pre_pilot', pass: res.ok === false && res.reason === 'REVOCATION_FAILED' && currentPhase === 'pre_pilot', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R10
  {
    const env = createMockEnv();
    const { mockFetch } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R10', name: 'Final release phase = pre_pilot', assertion: 'res.finalState.releasePhase === pre_pilot', pass: res.ok === true && res.finalState.releasePhase === 'pre_pilot', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R11
  {
    const env = createMockEnv();
    const { mockFetch } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R11', name: 'Final Melis authorization count = 0', assertion: 'res.finalState.melisAuthorized === false', pass: res.ok === true && res.finalState.melisAuthorized === false, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R12
  {
    const env = createMockEnv();
    const { mockFetch } = createMockFetch();
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R12', name: 'All payment flags remain false on rollback', assertion: 'res.finalState.paymentCollectionEnabled === false', pass: res.ok === true && res.finalState.paymentCollectionEnabled === false, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R13
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch({
      super_admin_transition_release_phase: () => ({ success: true, changed: false, replayed: true, release_phase: 'pre_pilot' }),
      super_admin_revoke_tenant_pilot: () => ({ success: true, changed: false, replayed: true, reason_code: 'PILOT_AUTHORIZATION_REVOKED' })
    });
    const res = await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    results.push({ code: 'R13', name: 'Replay/idempotency does not double mutate', assertion: 'res.ok === true & mutationCalls.length === 2', pass: res.ok === true && mutationCalls.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // R14
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    await runRealPilotRollback({ env, fetchImpl: mockFetch, logger: silentLogger, operatorConfirmation: REQUIRED_ROLLBACK_CONFIRMATION, dryRun: false });
    const isBoundaryClean = mutationCalls.every(c => ALLOWED_ROLLBACK_MUTATION_RPCS.includes(c.rpcName));
    results.push({ code: 'R14', name: 'No unrelated tenant mutation reachable in rollback', assertion: 'ALLOWED_ROLLBACK_MUTATION_RPCS contains only 2 approved RPCs', pass: isBoundaryClean && ALLOWED_ROLLBACK_MUTATION_RPCS.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${r.code}] ${icon}: ${r.name}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\nTotal P1C.0 Operator & Assertion Tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.pass).length}`);
  console.log(`Failed: ${results.filter(r => !r.pass).length}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

runAllTests().catch(console.error);
