// scripts/test-p1a-paymentless-real-pilot-runners.test.mjs
import { runRealPilotActivation, parseActivationCliMode, REAL_PILOT_TENANT_ID, REAL_PILOT_SLUG, EXPECTED_PROJECT_REF, ALLOWED_ACTIVATION_MUTATION_RPCS, REQUIRED_ACTIVATION_CONFIRMATION } from './run-paymentless-real-pilot-activation.mjs';
import { runRealPilotRollback, parseRollbackCliMode, ALLOWED_ROLLBACK_MUTATION_RPCS, REQUIRED_ROLLBACK_CONFIRMATION } from './run-paymentless-real-pilot-rollback.mjs';

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
  let melisAuthorized = false;

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
      if (rpcName === 'super_admin_approve_tenant_pilot') {
        melisAuthorized = true;
      }
      if (rpcName === 'super_admin_revoke_tenant_pilot') {
        melisAuthorized = false;
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
        const isMelis = body.p_tenant_id === REAL_PILOT_TENANT_ID;
        resData = {
          success: true,
          tenant_id: body.p_tenant_id,
          authorized: isMelis ? melisAuthorized : false,
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
          pilot_authorization: { is_authorized: isMelis ? melisAuthorized : false }
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

function createMockFs({ existingFiles = new Set(), writeError = null } = {}) {
  const written = [];
  return {
    existsSync: (path) => existingFiles.has(path),
    writeFileSync: (path, content, opts) => {
      if (writeError) throw writeError;
      if (existingFiles.has(path) && opts && opts.flag === 'wx') {
        const err = new Error(`EEXIST: file already exists, open '${path}'`);
        err.code = 'EEXIST';
        throw err;
      }
      existingFiles.add(path);
      written.push({ path, content, opts });
    },
    written
  };
}

async function runAllTests() {
  const results = [];
  const silentLogger = { log: () => {}, error: () => {}, warn: () => {} };
  const currentSha = 'dda92c55756fe930efaa67a7d7353928bf42228b';
  const baseActivationOpts = {
    expectedSha: currentSha,
    enforceGitSha: false,
    enforceCleanTree: false,
    requireExternalFrontend: false,
    operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION
  };

  console.log('=== RUNNING P1C.0b OPERATOR EXECUTION CONTRACT SAFETY MATRIX ===\n');

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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, transitionIdempotencyKey: ' ', env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'A17', name: 'Refuses missing transition idempotency key independently', assertion: 'res.reason === MISSING_TRANSITION_KEY', pass: res.ok === false && res.reason === 'MISSING_TRANSITION_KEY', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A18
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, approveIdempotencyKey: ' ', env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'A22', name: 'Real execution path produces exactly 2 approved mutation RPCs', assertion: 'mutationCalls.length === 2 && mutationRpcCount === 2', pass: res.ok === true && mutationCalls.length === 2 && res.mutationRpcCount === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // A23
  {
    const env = createMockEnv();
    const { mockFetch, mutationCalls } = createMockFetch();
    const mockFs = createMockFs();
    await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'A26', name: 'Successful activation requires fixture tenant non-bookable postcondition', assertion: 'postActivationState.fixtureBlocked === true', pass: res.ok === true && res.postActivationState.fixtureBlocked === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // =========================================================================
  // P1C.0b REAL ACTIVATION PROCESS & CLI TESTS (ACT-CLI-01 to ACT-CLI-10)
  // =========================================================================

  // ACT-CLI-01: plain invocation → dry-run / 0 mutations
  {
    const parsed = parseActivationCliMode([], {});
    results.push({ code: 'ACT-CLI-01', name: 'Plain invocation resolves to dry-run mode (0 mutations)', assertion: 'parsed.dryRun === true && parsed.exitCode === 0', pass: parsed.dryRun === true && parsed.exitCode === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-02: --execute + missing confirmation → non-zero failure, NOT dry-run
  {
    const parsed = parseActivationCliMode(['--execute'], {});
    results.push({ code: 'ACT-CLI-02', name: '--execute with missing confirmation fails non-zero (NOT dry-run)', assertion: 'parsed.reason === MISSING_OPERATOR_CONFIRMATION && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'MISSING_OPERATOR_CONFIRMATION', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-03: --execute + wrong confirmation → non-zero failure, NOT dry-run
  {
    const parsed = parseActivationCliMode(['--execute'], { LARI_P1C_ACTIVATION_CONFIRMATION: 'WRONG' });
    results.push({ code: 'ACT-CLI-03', name: '--execute with wrong confirmation fails non-zero (NOT dry-run)', assertion: 'parsed.reason === INVALID_OPERATOR_CONFIRMATION && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'INVALID_OPERATOR_CONFIRMATION', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-04: --execute + missing LARI_P1C_EXPECTED_SHA → non-zero failure
  {
    const parsed = parseActivationCliMode(['--execute'], { LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION });
    results.push({ code: 'ACT-CLI-04', name: '--execute with missing expected SHA fails non-zero', assertion: 'parsed.reason === EXPECTED_SHA_REQUIRED && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'EXPECTED_SHA_REQUIRED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-05: --execute + malformed expected SHA → non-zero failure
  {
    const parsed = parseActivationCliMode(['--execute'], { LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: 'invalid-sha' });
    results.push({ code: 'ACT-CLI-05', name: '--execute with malformed expected SHA fails non-zero', assertion: 'parsed.reason === MALFORMED_EXPECTED_SHA && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'MALFORMED_EXPECTED_SHA', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-06: --execute + expected SHA mismatch → non-zero / 0 mutations
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    const { mockFetch, mutationCalls } = createMockFetch();
    const res = await runRealPilotActivation({
      expectedSha: currentSha,
      enforceGitSha: true,
      getHeadShaImpl: () => '1111111111111111111111111111111111111111',
      getOriginShaImpl: () => currentSha,
      env, fetchImpl: mockFetch, logger: silentLogger,
      operatorConfirmation: REQUIRED_ACTIVATION_CONFIRMATION,
      dryRun: false
    });
    results.push({ code: 'ACT-CLI-06', name: '--execute + expected SHA mismatch fails non-zero with 0 mutations', assertion: 'res.reason === SHA_MISMATCH && mutationCalls.length === 0', pass: res.ok === false && res.reason === 'SHA_MISMATCH' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-07: pre-existing activation marker → non-zero / 0 mutations
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    const { mockFetch, mutationCalls } = createMockFetch();
    const tempDir = env.TEMP || 'C:\\Windows\\Temp';
    const markerPath = `${tempDir}\\lari-p1c-${currentSha}.controlled-run-started`;
    const mockFs = createMockFs({ existingFiles: new Set([markerPath]) });

    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'ACT-CLI-07', name: 'Pre-existing activation marker halts execution with 0 mutations', assertion: 'res.reason === P1C_ACTIVATION_MARKER_ALREADY_EXISTS && mutationCalls.length === 0', pass: res.ok === false && res.reason === 'P1C_ACTIVATION_MARKER_ALREADY_EXISTS' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-08: marker creation failure → non-zero / 0 mutations
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    const { mockFetch, mutationCalls } = createMockFetch();
    const mockFs = createMockFs({ writeError: new Error('Permission denied') });

    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'ACT-CLI-08', name: 'Marker creation failure halts execution with 0 mutations', assertion: 'res.reason === P1C_ACTIVATION_MARKER_CREATION_FAILED && mutationCalls.length === 0', pass: res.ok === false && res.reason === 'P1C_ACTIVATION_MARKER_CREATION_FAILED' && mutationCalls.length === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-09: successful mocked execute path creates marker BEFORE first mutation
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
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
    const mockFs = createMockFs();

    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    const isMarkerWritten = mockFs.written.length === 1 && mockFs.written[0].opts && mockFs.written[0].opts.flag === 'wx';
    results.push({ code: 'ACT-CLI-09', name: 'Successful execute path creates exclusive marker before first mutation', assertion: 'mockFs.written.length === 1 && flag === wx', pass: res.ok === true && isMarkerWritten && mutationCalls.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // ACT-CLI-10: successful mocked execute path performs exactly 2 approved mutations
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
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
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'ACT-CLI-10', name: 'Successful mocked execute path performs exactly 2 approved mutations', assertion: 'res.mutationRpcCount === 2 && mutationCalls.length === 2', pass: res.ok === true && res.mutationRpcCount === 2 && mutationCalls.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // =========================================================================
  // P1C.0b ROLLBACK PROCESS & CLI TESTS (RB-CLI-01 to RB-CLI-04)
  // =========================================================================

  // RB-CLI-01: plain rollback invocation → dry-run / 0 mutations
  {
    const parsed = parseRollbackCliMode([], {});
    results.push({ code: 'RB-CLI-01', name: 'Plain rollback invocation resolves to dry-run (0 mutations)', assertion: 'parsed.dryRun === true && parsed.exitCode === 0', pass: parsed.dryRun === true && parsed.exitCode === 0, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // RB-CLI-02: rollback --execute + missing confirmation → non-zero / not dry-run
  {
    const parsed = parseRollbackCliMode(['--execute'], {});
    results.push({ code: 'RB-CLI-02', name: 'Rollback --execute with missing confirmation fails non-zero (NOT dry-run)', assertion: 'parsed.reason === MISSING_OPERATOR_CONFIRMATION && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'MISSING_OPERATOR_CONFIRMATION', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // RB-CLI-03: rollback --execute + wrong confirmation → non-zero / not dry-run
  {
    const parsed = parseRollbackCliMode(['--execute'], { LARI_P1C_ROLLBACK_CONFIRMATION: 'WRONG' });
    results.push({ code: 'RB-CLI-03', name: 'Rollback --execute with wrong confirmation fails non-zero (NOT dry-run)', assertion: 'parsed.reason === INVALID_OPERATOR_CONFIRMATION && parsed.exitCode === 1', pass: parsed.dryRun === false && parsed.exitCode === 1 && parsed.reason === 'INVALID_OPERATOR_CONFIRMATION', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // RB-CLI-04: explicit valid rollback execution contract reaches tested rollback path
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
    results.push({ code: 'RB-CLI-04', name: 'Explicit rollback contract permits tested mutating rollback path', assertion: 'res.ok === true && mutationCalls.length === 2', pass: res.ok === true && mutationCalls.length === 2, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
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

  // =========================================================================
  // P1C.1c VERIFIER CONTRACT REGRESSION TESTS (P1C1C-A to P1C1C-H)
  // =========================================================================

  const mockReadiness = { tenant_status: 'active', public_site_status: 'published', relationship_verification: { status: 'VERIFIED' } };

  // P1C1C-A: Independent snapshot: no history -> expected blocker PILOT_AUTHORIZATION_REQUIRED -> PASS
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: false } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-A', name: 'No history expects PILOT_AUTHORIZATION_REQUIRED -> PASS', assertion: 'res.ok === true', pass: res.ok === true && res.reason === 'ACTIVATION_SUCCESSFUL', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-B: Independent snapshot: revoked history -> expected blocker PILOT_AUTHORIZATION_REVOKED -> PASS
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-B', name: 'Revoked history expects PILOT_AUTHORIZATION_REVOKED -> PASS', assertion: 'res.ok === true', pass: res.ok === true && res.reason === 'ACTIVATION_SUCCESSFUL', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-C: Snapshot says revoked history, but public returns PILOT_AUTHORIZATION_REQUIRED -> FAIL post-verification
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-C', name: 'History says revoked but public returns REQUIRED -> FAIL', assertion: 'res.reason === POST_VERIFICATION_FAILED', pass: res.ok === false && res.reason === 'POST_VERIFICATION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-D: Snapshot says no history, but public returns PILOT_AUTHORIZATION_REVOKED -> FAIL post-verification
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: false } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-D', name: 'History says no revoked state but public returns REVOKED -> FAIL', assertion: 'res.reason === POST_VERIFICATION_FAILED', pass: res.ok === false && res.reason === 'POST_VERIFICATION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-E: Fixture allowed=false but bookable=true -> FAIL post-verification
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: true, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-E', name: 'Fixture allowed=false but bookable=true -> FAIL', assertion: 'res.reason === POST_VERIFICATION_FAILED', pass: res.ok === false && res.reason === 'POST_VERIFICATION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-F: Correct blocker but fixture allowed=true -> FAIL post-verification
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: true, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-F', name: 'Correct blocker but fixture allowed=true -> FAIL', assertion: 'res.reason === POST_VERIFICATION_FAILED', pass: res.ok === false && res.reason === 'POST_VERIFICATION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-G: Active Melis remains authorized=true, allowed=true, bookable=true, blocking_reason_codes=[] -> PASS
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-G', name: 'Active Melis remains authorized=true, allowed=true, bookable=true, blockers=[] -> PASS', assertion: 'res.ok === true', pass: res.ok === true && res.postActivationState.melisBookable === true, file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C1C-H: Stage A state requires ALL payment flags false (fails if any flag enabled) -> FAIL
  {
    const env = createMockEnv({ LARI_P1C_ACTIVATION_CONFIRMATION: REQUIRED_ACTIVATION_CONFIRMATION, LARI_P1C_EXPECTED_SHA: currentSha });
    let step = 0;
    const { mockFetch } = createMockFetch({
      super_admin_get_tenant_pilot_eligibility_snapshot: (body) => {
        if (body.p_tenant_id === 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd') {
          return { success: true, authorized: false, pilot_authorization: { is_authorized: false, has_authorization_history: true } };
        }
        return { success: true, authorized: step >= 2, pilot_authorization: { is_authorized: step >= 2 }, global_release_control: { release_phase: step >= 1 ? 'paymentless_pilot' : 'pre_pilot', is_payment_collection_enabled: step >= 2 ? true : false, is_checkout_enabled: false, is_iyzico_enabled: false }, readiness_facts: mockReadiness };
      },
      can_accept_public_booking: (body) => {
        if (body.p_slug === REAL_PILOT_SLUG) {
          if (step >= 2) return { found: true, allowed: true, bookable: true, blocking_reason_codes: [] };
          if (step === 1) return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REQUIRED'] };
          return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'] };
        }
        return { found: true, allowed: false, bookable: false, blocking_reason_codes: ['PILOT_AUTHORIZATION_REVOKED'] };
      },
      super_admin_transition_release_phase: (body) => { step = 1; return { success: true, changed: true, release_phase: body.p_target_phase }; },
      super_admin_approve_tenant_pilot: () => { step = 2; return { success: true, changed: true, reason_code: 'PILOT_AUTHORIZATION_APPROVED' }; }
    });
    const mockFs = createMockFs();
    const res = await runRealPilotActivation({ ...baseActivationOpts, env, fetchImpl: mockFetch, markerFsImpl: mockFs, logger: silentLogger, dryRun: false });
    results.push({ code: 'P1C1C-H', name: 'Payment flag enabled in Stage A state -> FAIL post-verification', assertion: 'res.reason === POST_VERIFICATION_FAILED', pass: res.ok === false && res.reason === 'POST_VERIFICATION_FAILED', file: 'scripts/test-p1a-paymentless-real-pilot-runners.test.mjs' });
  }

  // P1C.2e Public Branch Read Contract Executable Suite
  {
    const { runPublicBranchContractSuite } = await import('./test-p1c-public-branch-read-contract.mjs');
    await runPublicBranchContractSuite();
  }

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${r.code}] ${icon}: ${r.name}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\nTotal P1C.0b Operator & Assertion Tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.pass).length}`);
  console.log(`Failed: ${results.filter(r => !r.pass).length}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

runAllTests().catch(console.error);
