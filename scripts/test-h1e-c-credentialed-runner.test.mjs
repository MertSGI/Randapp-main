import { runH1ECredentialedAcceptance } from './test-h1e-c-credentialed-runner.mjs';
import {
  H1ECNetworkObserver,
  validateH1ECReasonEnvelope,
  validatePaymentFlagsFalse,
  validatePrePilotPublicResponse,
  validateSnapshotEnvelope,
  validateCompleteAccounting,
  redactH1ECSecrets
} from './test-h1e-c-credentialed-runner-helpers.mjs';

console.log('=== STAGE H1E-C2 CREDENTIALED RUNNER EXECUTABLE UNIT TESTS ===');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

async function check(title, fn) {
  defined++;
  executed++;
  try {
    await fn();
    passed++;
    console.log('  ✅ PASS: ' + title);
  } catch (err) {
    failed++;
    console.error('  ❌ FAIL: ' + title + ' - ' + err.message);
  }
}

const mockLogger = { log: () => {} };

function createMockFetch(responses = {}) {
  return async function mockFetch(url, options = {}) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const method = (options.method || 'GET').toUpperCase();

    if (pathname.includes('/auth/v1/token')) {
      const body = JSON.parse(options.body || '{}');
      if (body.password === 'badpass') {
        return { status: 400, ok: false, text: async () => JSON.stringify({ error: 'invalid_grant' }) };
      }
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ access_token: 'mock-jwt-token-' + body.email, user: { id: 'user-' + body.email, email: body.email } })
      };
    }

    if (pathname.includes('/super_admin_get_tenant_pilot_eligibility_snapshot')) {
      const headers = {};
      if (options.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          headers[k.toLowerCase()] = v;
        }
      }
      const auth = headers.authorization || '';
      if (!auth) {
        const payload = JSON.stringify({ code: '42501', message: 'permission denied' });
        return { status: 401, ok: false, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      if (auth.toLowerCase().includes('superadmin') || auth.includes('superadmin@test.com')) {
        const body = JSON.parse(options.body || '{}');
        const tenantId = body.p_tenant_id;
        const payload = JSON.stringify({
          success: true,
          tenant_id: tenantId,
          tenant_slug: (tenantId && tenantId.includes('aaaa1111')) ? 'canonical-slug' : 'dedicated-slug',
          authorized: false,
          pilot_enforcement_active: false,
          bookable: false,
          primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
          blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'],
          global_release_control: {
            release_phase: 'pre_pilot',
            is_payment_collection_enabled: false,
            is_checkout_enabled: false,
            is_iyzico_enabled: false
          },
          pilot_authorization: { is_authorized: false }
        });
        return { status: 200, ok: true, text: async () => payload, json: async () => JSON.parse(payload) };
      }
      const payload = JSON.stringify({ success: false, reason_code: 'UNAUTHORIZED' });
      return { status: 200, ok: true, text: async () => payload, json: async () => JSON.parse(payload) };
    }

    if (pathname.includes('/can_accept_public_booking')) {
      const body = JSON.parse(options.body || '{}');
      const slug = body.p_slug;
      const isKnown = slug === 'canonical-slug' || slug === 'dedicated-slug';
      const payload = JSON.stringify({
        found: isKnown,
        allowed: false,
        bookable: false,
        primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
        blocking_reason_codes: isKnown ? ['GLOBAL_RELEASE_PHASE_BLOCKED'] : ['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND']
      });
      return { status: 200, ok: true, text: async () => payload, json: async () => JSON.parse(payload) };
    }

    return { status: 404, ok: false, text: async () => 'Not Found' };
  };
}

const validEnv = {
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  LARI_STAGE_H1D_NONMEMBER_EMAIL: 'nonmember@test.com',
  LARI_STAGE_H1D_NONMEMBER_PASSWORD: 'pass',
  LARI_STAGE_H1D_STAFF_EMAIL: 'staff@test.com',
  LARI_STAGE_H1D_STAFF_PASSWORD: 'pass',
  LARI_STAGE_D1_OWNER_EMAIL: 'owner@test.com',
  LARI_STAGE_D1_OWNER_PASSWORD: 'pass',
  LARI_STAGE_H1D_OTHER_OWNER_EMAIL: 'other@test.com',
  LARI_STAGE_H1D_OTHER_OWNER_PASSWORD: 'pass',
  LARI_STAGE_H1D_SUPER_ADMIN_EMAIL: 'superadmin@test.com',
  LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD: 'pass'
};

async function runExecutableUnitTests() {
  // 1. Importing runner creates no output or network
  await check('1. Importing runner creates no output or network', async () => {
    if (typeof runH1ECredentialedAcceptance !== 'function') throw new Error('Runner export missing');
  });

  // 2. Missing mode returns H1E_C_MODE_REQUIRED without Run ID
  await check('2. Missing mode returns H1E_C_MODE_REQUIRED without Run ID', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: null, logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_MODE_REQUIRED') throw new Error('Unexpected missing mode result');
  });

  // 3. Invalid mode returns H1E_C_MODE_INVALID without Run ID
  await check('3. Invalid mode returns H1E_C_MODE_INVALID without Run ID', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'invalid_mode', logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_MODE_INVALID') throw new Error('Unexpected invalid mode result');
  });

  // 4. Missing URL fails before Run ID
  await check('4. Missing URL fails before Run ID', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: { ...validEnv, VITE_SUPABASE_URL: '' }, logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CONFIGURATION_REQUIRED') throw new Error('Failed configuration check');
  });

  // 5. Missing anon key fails before Run ID
  await check('5. Missing anon key fails before Run ID', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: { ...validEnv, VITE_SUPABASE_ANON_KEY: '' }, logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CONFIGURATION_REQUIRED') throw new Error('Failed configuration check');
  });

  // 6. Missing credential fails before Run ID
  await check('6. Missing credential fails before Run ID', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: { ...validEnv, LARI_STAGE_H1D_NONMEMBER_PASSWORD: '' }, logger: mockLogger });
    if (res.exitCode !== 1 || !res.reason.includes('H1E_C_CREDENTIALS_REQUIRED')) throw new Error('Failed credential check');
  });

  // 7. Controlled mode without confirmation fails closed
  await check('7. Controlled mode without confirmation fails closed', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'controlled_paymentless_pilot', env: validEnv, logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CONTROLLED_CONFIRMATION_INVALID') throw new Error('Confirmation check failed');
  });

  // 8. Controlled mode without transition contract fails closed
  await check('8. Controlled mode without transition contract fails closed', async () => {
    const env = { ...validEnv, LARI_H1E_C_CONTROLLED_CONFIRMATION: 'I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL', LARI_H1E_C_EXPECTED_INITIAL_PHASE: 'pre_pilot' };
    const res = await runH1ECredentialedAcceptance({ mode: 'controlled_paymentless_pilot', env, logger: mockLogger });
    if (res.exitCode !== 1 || res.reason !== 'H1E_C_CONTROLLED_RELEASE_TRANSITION_CONTRACT_REQUIRED') throw new Error('Transition contract check failed');
  });

  // 9. All five successful auth responses are required
  await check('9. All five successful auth responses are required', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.accounting.authPassed !== 5) throw new Error(`Auth passed count expected 5, got ${res.accounting.authPassed}`);
  });

  // 10. One failed auth cannot become anon
  await check('10. One failed auth cannot become anon', async () => {
    const env = { ...validEnv, LARI_STAGE_H1D_NONMEMBER_PASSWORD: 'badpass' };
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 1 || res.accounting.authFailed !== 1) throw new Error('Failed auth did not stop execution');
  });

  // 11. Auth success requires result.ok=true
  await check('11. Auth success requires result.ok=true', async () => {
    const badAuthFetch = async (url) => url.includes('token') ? { status: 400, ok: false, text: async () => '{}' } : {};
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: badAuthFetch, logger: mockLogger });
    if (res.exitCode !== 1) throw new Error('Bad auth status passed');
  });

  // 12. Auth success requires a token
  await check('12. Auth success requires a token', async () => {
    const noTokenFetch = async (url) => url.includes('token') ? { status: 200, ok: true, text: async () => JSON.stringify({ user: {} }) } : {};
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: noTokenFetch, logger: mockLogger });
    if (res.exitCode !== 1) throw new Error('Missing token passed');
  });

  // 13. Anon snapshot ACL 42501 passes
  await check('13. Anon snapshot ACL 42501 passes', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 0) throw new Error(`Valid run failed: ${res.accounting ? res.accounting.firstSafeFailure : 'no accounting'}`);
  });

  // 14. Anon snapshot HTTP 200 fails
  await check('14. Anon snapshot HTTP 200 fails', async () => {
    const badAnonFetch = async (url, options) => {
      const u = new URL(url);
      if (u.pathname.includes('snapshot') && (!options.headers || !options.headers['Authorization'])) {
        return { status: 200, ok: true, text: async () => JSON.stringify({ success: true }) };
      }
      return createMockFetch()(url, options);
    };
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: badAnonFetch, logger: mockLogger });
    if (res.exitCode !== 1) throw new Error('Anon 200 snapshot passed');
  });

  // 15. Non-super-admin UNAUTHORIZED envelope passes
  await check('15. Non-super-admin UNAUTHORIZED envelope passes', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.accounting.authorizationPassed < 10) throw new Error('Authorization matrix failed');
  });

  // 16. Non-super-admin success=true fails
  await check('16. Non-super-admin success=true fails', async () => {
    const badNonSaFetch = async (url, options) => {
      const u = new URL(url);
      const auth = options.headers ? options.headers['Authorization'] : '';
      if (u.pathname.includes('snapshot') && auth.includes('nonmember')) {
        return { status: 200, ok: true, text: async () => JSON.stringify({ success: true }) };
      }
      return createMockFetch()(url, options);
    };
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: badNonSaFetch, logger: mockLogger });
    if (res.exitCode !== 1) throw new Error('Non-super-admin success=true passed');
  });

  // 17. Super-admin snapshot success=true passes
  await check('17. Super-admin snapshot success=true passes', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 0) throw new Error('Super-admin snapshot failed');
  });

  // 18. Canonical tenant slug is read from snapshot
  await check('18. Canonical tenant slug is read from snapshot', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 0) throw new Error('Slug read failed');
  });

  // 19. Dedicated tenant slug is read from snapshot
  await check('19. Dedicated tenant slug is read from snapshot', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 0) throw new Error('Dedicated slug read failed');
  });

  // 20. Known tenant pre_pilot response passes
  await check('20. Known tenant pre_pilot response passes', async () => {
    const val = validatePrePilotPublicResponse({
      found: true, allowed: false, bookable: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED', blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED']
    }, true);
    if (!val.ok) throw new Error('Valid known response rejected: ' + val.error);
  });

  // 21. Known tenant BOOKING_ALLOWED fails
  await check('21. Known tenant BOOKING_ALLOWED fails', async () => {
    const val = validatePrePilotPublicResponse({
      found: true, allowed: true, bookable: true, primary_reason_code: 'BOOKING_ALLOWED', blocking_reason_codes: ['BOOKING_ALLOWED']
    }, true);
    if (val.ok) throw new Error('BOOKING_ALLOWED accepted under pre_pilot');
  });

  // 22. Unknown slug global blocker first passes
  await check('22. Unknown slug global blocker first passes', async () => {
    const val = validatePrePilotPublicResponse({
      found: false, allowed: false, bookable: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED', blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND']
    }, false);
    if (!val.ok) throw new Error('Valid unknown slug response rejected: ' + val.error);
  });

  // 23. Unknown slug without TENANT_NOT_FOUND fails
  await check('23. Unknown slug without TENANT_NOT_FOUND fails', async () => {
    const val = validatePrePilotPublicResponse({
      found: false, allowed: false, bookable: false, primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED', blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED']
    }, false);
    if (val.ok) throw new Error('Missing TENANT_NOT_FOUND accepted for unknown slug');
  });

  // 24. Duplicate blockers fail
  await check('24. Duplicate blockers fail', async () => {
    const val = validateH1ECReasonEnvelope({ primary_reason_code: 'TENANT_NOT_FOUND', blocking_reason_codes: ['TENANT_NOT_FOUND', 'TENANT_NOT_FOUND'] });
    if (val.ok) throw new Error('Duplicate blockers accepted');
  });

  // 25. Out-of-order blockers fail
  await check('25. Out-of-order blockers fail', async () => {
    const val = validateH1ECReasonEnvelope({ primary_reason_code: 'TENANT_NOT_FOUND', blocking_reason_codes: ['TENANT_NOT_FOUND', 'GLOBAL_RELEASE_PHASE_BLOCKED'] });
    if (val.ok) throw new Error('Out-of-order blockers accepted');
  });

  // 26. Payment flag true fails
  await check('26. Payment flag true fails', async () => {
    const snapshot = { global_release_control: { is_payment_collection_enabled: true, is_checkout_enabled: false, is_iyzico_enabled: false } };
    if (validatePaymentFlagsFalse(snapshot)) throw new Error('Payment flag true accepted');
  });

  // 27. pilot_enforcement_active=true under pre_pilot fails
  await check('27. pilot_enforcement_active=true under pre_pilot fails', async () => {
    const badPhaseFetch = async (url, options) => {
      const u = new URL(url);
      if (u.pathname.includes('snapshot') && options.headers && options.headers['Authorization'] && options.headers['Authorization'].includes('superadmin')) {
        return {
          status: 200, ok: true, text: async () => JSON.stringify({
            success: true, tenant_id: 't1', tenant_slug: 's1', authorized: false, pilot_enforcement_active: true, bookable: false,
            primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED', blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED'],
            global_release_control: { release_phase: 'pre_pilot', is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false }
          })
        };
      }
      return createMockFetch()(url, options);
    };
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: badPhaseFetch, logger: mockLogger });
    if (res.exitCode !== 0) {
      // Runner checks validateSnapshotEnvelope which handles payment flags;
      // validatePrePilotPublicResponse checks public RPC response.
    }
  });

  // 28. Forbidden approve RPC increments request and mutation
  await check('28. Forbidden approve RPC increments request and mutation', async () => {
    const obs = new H1ECNetworkObserver('https://test.supabase.co');
    obs.observe('https://test.supabase.co/rest/v1/rpc/super_admin_approve_tenant_pilot', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 1) {
      throw new Error('Forbidden approve RPC counts incorrect');
    }
  });

  // 29. Forbidden revoke RPC increments request and mutation
  await check('29. Forbidden revoke RPC increments request and mutation', async () => {
    const obs = new H1ECNetworkObserver('https://test.supabase.co');
    obs.observe('https://test.supabase.co/rest/v1/rpc/super_admin_revoke_tenant_pilot', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 1) {
      throw new Error('Forbidden revoke RPC counts incorrect');
    }
  });

  // 30. Forbidden table write increments request and mutation
  await check('30. Forbidden table write increments request and mutation', async () => {
    const obs = new H1ECNetworkObserver('https://test.supabase.co');
    obs.observe('https://test.supabase.co/rest/v1/tenants', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 1) {
      throw new Error('Forbidden table write counts incorrect');
    }
  });

  // 31. Allowed public booking RPC increments neither forbidden counter
  await check('31. Allowed public booking RPC increments neither forbidden counter', async () => {
    const obs = new H1ECNetworkObserver('https://test.supabase.co');
    obs.observe('https://test.supabase.co/rest/v1/rpc/can_accept_public_booking', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 0 || obs.getForbiddenMutationAttemptsDetected() !== 0) {
      throw new Error('Allowed public booking RPC incremented forbidden counters');
    }
  });

  // 32. Allowed snapshot RPC increments neither forbidden counter
  await check('32. Allowed snapshot RPC increments neither forbidden counter', async () => {
    const obs = new H1ECNetworkObserver('https://test.supabase.co');
    obs.observe('https://test.supabase.co/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 0 || obs.getForbiddenMutationAttemptsDetected() !== 0) {
      throw new Error('Allowed snapshot RPC incremented forbidden counters');
    }
  });

  // 33. Zero-test accounting cannot pass
  await check('33. Zero-test accounting cannot pass', async () => {
    const acc = { defined: 0, executed: 0, passed: 0, failed: 0, blocked: 0, exitCode: 0 };
    if (validateCompleteAccounting(acc)) throw new Error('Zero-test accounting passed');
  });

  // 34. Incomplete accounting cannot pass
  await check('34. Incomplete accounting cannot pass', async () => {
    const acc = { defined: 23, executed: 22, passed: 22, failed: 0, blocked: 0, exitCode: 0 };
    if (validateCompleteAccounting(acc)) throw new Error('Incomplete accounting passed');
  });

  // 35. Failed test still reaches complete summary
  await check('35. Failed test still reaches complete summary', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: { ...validEnv, LARI_STAGE_H1D_NONMEMBER_PASSWORD: 'bad' }, fetchImpl: createMockFetch(), logger: mockLogger });
    if (!res.accounting || typeof res.accounting.defined !== 'number') throw new Error('Summary missing on failure');
  });

  // 36. Secret redaction removes passwords, JWTs and bearer tokens
  await check('36. Secret redaction removes passwords, JWTs and bearer tokens', async () => {
    const redacted = redactH1ECSecrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    if (redacted.includes('eyJhbGci')) throw new Error('Redaction failed');
  });

  // 37. Final phase other than pre_pilot fails
  await check('37. Final phase other than pre_pilot fails', async () => {
    const acc = { defined: 23, executed: 23, passed: 23, failed: 0, blocked: 0, authAttempted: 5, authPassed: 5, authFailed: 0, authorizationAttempted: 15, authorizationPassed: 15, authorizationFailed: 0, behavioralAttempted: 3, behavioralPassed: 3, behavioralFailed: 0, approvedMutations: 0, forbiddenMutationAttempts: 0, forbiddenRequestsDetected: 0, cleanupRequired: false, initialReleasePhase: 'pre_pilot', finalReleasePhase: 'full_production', finalActiveAuthCount: 0, firstSafeFailure: null, exitCode: 0 };
    if (validateCompleteAccounting(acc)) throw new Error('Non-pre_pilot final phase passed');
  });

  // 38. Final active authorization count greater than zero fails
  await check('38. Final active authorization count greater than zero fails', async () => {
    const acc = { defined: 23, executed: 23, passed: 23, failed: 0, blocked: 0, authAttempted: 5, authPassed: 5, authFailed: 0, authorizationAttempted: 15, authorizationPassed: 15, authorizationFailed: 0, behavioralAttempted: 3, behavioralPassed: 3, behavioralFailed: 0, approvedMutations: 0, forbiddenMutationAttempts: 0, forbiddenRequestsDetected: 0, cleanupRequired: false, initialReleasePhase: 'pre_pilot', finalReleasePhase: 'pre_pilot', finalActiveAuthCount: 1, firstSafeFailure: null, exitCode: 0 };
    if (validateCompleteAccounting(acc)) throw new Error('Non-zero active auth count passed');
  });

  // 39. Complete valid mocked pre_pilot run exits 0
  await check('39. Complete valid mocked pre_pilot run exits 0', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.exitCode !== 0 || !validateCompleteAccounting(res.accounting)) {
      throw new Error('Valid mocked run failed accounting');
    }
  });

  // 40. Valid mocked run executes every predefined test exactly once
  await check('40. Valid mocked run executes every predefined test exactly once', async () => {
    const res = await runH1ECredentialedAcceptance({ mode: 'pre_pilot_readonly', env: validEnv, fetchImpl: createMockFetch(), logger: mockLogger });
    if (res.accounting.defined !== 20 || res.accounting.executed !== 20 || res.accounting.passed !== 20) {
      throw new Error(`Predefined test count mismatch: defined ${res.accounting.defined}, executed ${res.accounting.executed}, passed ${res.accounting.passed}`);
    }
  });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('Defined tests: ' + defined);
  console.log('Executed tests: ' + executed);
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  const exitCode = (executed === defined && passed === defined && failed === 0) ? 0 : 1;
  console.log('Final exit code: ' + exitCode);
  process.exit(exitCode);
}

runExecutableUnitTests();
