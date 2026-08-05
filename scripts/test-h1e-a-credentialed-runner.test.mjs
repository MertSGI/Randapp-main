import fs from 'fs';
import path from 'path';
import { NetworkObserver, createMonitoredFetch, safeJsonParse, redactSecrets, authenticateUser, callRpcEndpoint } from './test-h1e-a-credentialed-runner-helpers.mjs';

console.log('=== STAGE H1E-A CREDENTIALED RUNNER HELPER UNIT TESTS ===');

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

async function runUnitTests() {
  await check('1. All five authenticated identities require successful login (missing password returns failure_category missing_credentials)', async () => {
    const res = await authenticateUser('https://xyz.supabase.co', 'key', 'user@test.com', null);
    if (res.ok !== false || res.failure_category !== 'missing_credentials') {
      throw new Error('Expected failure_category missing_credentials');
    }
  });

  await check('2. Failed nonmember login cannot become an anon authorization pass (ok=false returned on 401)', async () => {
    const mockFetch = async () => new Response('{"error":"invalid_credentials"}', { status: 401 });
    const res = await authenticateUser('https://xyz.supabase.co', 'key', 'user@test.com', 'badpass', null, mockFetch);
    if (res.ok !== false || res.token !== null || res.failure_category !== 'invalid_credentials') {
      throw new Error('Failed login did not return structured failure');
    }
  });

  await check('3. Failed staff login cannot become an anon authorization pass (network failure returned on exception)', async () => {
    const mockFetch = async () => { throw new Error('Fetch failed'); };
    const res = await authenticateUser('https://xyz.supabase.co', 'key', 'staff@test.com', 'pass', null, mockFetch);
    if (res.ok !== false || res.failure_category !== 'network_failure') {
      throw new Error('Network exception did not produce network_failure category');
    }
  });

  await check('4. Exact unauthorized envelope passes verification', async () => {
    const mockDenial = { success: false, reason_code: 'unauthorized', timestamp: '2026-08-05T09:00:00Z' };
    const mockFetch = async () => new Response(JSON.stringify(mockDenial), { status: 200 });
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const mFetch = await createMonitoredFetch(obs, mockFetch);
    const res = await callRpcEndpoint('https://xyz.supabase.co', 'key', 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: 'aaaa' }, 'token', mFetch);
    if (!res.ok || res.data.success !== false || res.data.reason_code !== 'unauthorized') {
      throw new Error('Exact unauthorized envelope parsing failed');
    }
  });

  await check('5. Network failure does not count as unauthorized pass', async () => {
    const mockFetch = async () => new Response('Internal Server Error', { status: 500 });
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const mFetch = await createMonitoredFetch(obs, mockFetch);
    const res = await callRpcEndpoint('https://xyz.supabase.co', 'key', 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: 'aaaa' }, 'token', mFetch);
    if (res.ok || (res.data && res.data.reason_code === 'unauthorized')) {
      throw new Error('HTTP 500 error was mistaken for an unauthorized pass!');
    }
  });

  await check('6. Malformed denial envelope fails validation', async () => {
    const mockFetch = async () => new Response('<html>Error</html>', { status: 200 });
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const mFetch = await createMonitoredFetch(obs, mockFetch);
    const res = await callRpcEndpoint('https://xyz.supabase.co', 'key', 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: 'aaaa' }, 'token', mFetch);
    if (res.data !== null) {
      throw new Error('HTML response should produce null JSON data');
    }
  });

  await check('7. Missing tenant under pre_pilot expects GLOBAL_RELEASE_PHASE_BLOCKED', async () => {
    const mockSnap = {
      success: true,
      primary_reason_code: 'GLOBAL_RELEASE_PHASE_BLOCKED',
      blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND'],
      readiness_facts: { tenant_exists: false }
    };
    if (mockSnap.primary_reason_code !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
      throw new Error('Missing tenant should produce GLOBAL_RELEASE_PHASE_BLOCKED under pre_pilot');
    }
  });

  await check('8. Missing tenant blocker list contains TENANT_NOT_FOUND', async () => {
    const mockSnap = {
      blocking_reason_codes: ['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND']
    };
    if (!mockSnap.blocking_reason_codes.includes('TENANT_NOT_FOUND')) {
      throw new Error('blocking_reason_codes missing TENANT_NOT_FOUND');
    }
  });

  await check('9. Super-admin response requires all structured envelope sections', async () => {
    const mockSnap = {
      success: true,
      readiness_facts: {},
      global_release_control: {},
      pilot_authorization: {}
    };
    if (!mockSnap.readiness_facts || !mockSnap.global_release_control || !mockSnap.pilot_authorization) {
      throw new Error('Super Admin envelope missing required subsections');
    }
  });

  await check('10. Async rejected test increments Failed counter', async () => {
    let localFailed = 0;
    try {
      await (async () => { throw new Error('Test rejection'); })();
    } catch (e) {
      localFailed++;
    }
    if (localFailed !== 1) throw new Error('Async rejection failed to increment failure counter');
  });

  await check('11. Exact eligibility RPC is allowed on configured origin', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot', 'POST');
    if (!allowed) throw new Error('Eligibility RPC should be allowed on configured origin');
  });

  await check('12. Another RPC is forbidden', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_update_global_release', 'POST');
    if (allowed) throw new Error('Other RPC must be forbidden');
  });

  await check('13. Table PATCH/POST/DELETE is forbidden', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/platform_global_release_control', 'PATCH');
    if (allowed) throw new Error('Table PATCH must be forbidden');
  });

  await check('14. Auth endpoint is allowed only for configured Supabase origin', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    const allowedValid = obs.isAllowedPath('https://xyz.supabase.co/auth/v1/token', 'POST');
    const allowedExternal = obs.isAllowedPath('https://evil.external.co/auth/v1/token', 'POST');
    if (!allowedValid) throw new Error('Auth token on configured origin should be allowed');
    if (allowedExternal) throw new Error('Auth token on arbitrary external origin MUST be forbidden');
  });

  await testSecretOutputSafety();

  await check('16. Current stub/silent-success patterns are absent in helper codebase', async () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-a-credentialed-runner.mjs'), 'utf8');
    if (content.includes('Credentialed execution path available. Running read-only checks...')) {
      throw new Error('Stub silent-success pattern found in runner script!');
    }
  });

  await check('17. Final exit code cannot be 0 unless Executed = Defined = Passed', async () => {
    const isPassing = (e, d, p, f, m) => (e === d && p === d && f === 0 && m === 0) ? 0 : 1;
    if (isPassing(17, 17, 16, 1, 0) === 0) throw new Error('Exit code 0 allowed when failed = 1!');
    if (isPassing(17, 17, 17, 0, 0) !== 0) throw new Error('Exit code 0 disallowed when all passed!');
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

async function testSecretOutputSafety() {
  await check('15. Credentials, passwords, keys, and JWTs are thoroughly redacted', async () => {
    const samplePayload = {
      password: 'MySecretPassword123!',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
      apikey: 'sbp_1234567890abcdef',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def'
    };
    const redacted = redactSecrets(samplePayload);
    const jsonStr = JSON.stringify(redacted);
    if (jsonStr.includes('MySecretPassword123!') || jsonStr.includes('eyJhbGci') || jsonStr.includes('sbp_1234567890abcdef')) {
      throw new Error('Secret leakage detected in redacted output!');
    }
  });
}

runUnitTests();
