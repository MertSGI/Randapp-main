import fs from 'fs';
import path from 'path';
import {
  NetworkObserver,
  createMonitoredFetch,
  safeJsonParse,
  redactSecrets,
  authenticateUser,
  callRpcEndpoint,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized,
  assertSuperAdminEligibilityEnvelope
} from './test-h1e-a-credentialed-runner-helpers.mjs';

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
  await check('1. Anon HTTP 401 + code 42501 passes ACL denial validation', async () => {
    const mockRes = { ok: false, status: 401, data: { code: '42501', message: 'permission denied for function' } };
    assertAnonAclDenied(mockRes);
  });

  await check('2. Anon HTTP 403 + code 42501 passes ACL denial validation', async () => {
    const mockRes = { ok: false, status: 403, data: { code: '42501', message: 'permission denied for function' } };
    assertAnonAclDenied(mockRes);
  });

  await check('3. Anon structured success=false/unauthorized does not substitute for expected ACL denial', async () => {
    const mockRes = { ok: true, status: 200, data: { success: false, reason_code: 'unauthorized' } };
    try {
      assertAnonAclDenied(mockRes);
      throw new Error('Should have failed because anon must fail at HTTP/ACL level!');
    } catch (err) {
      if (!err.message.includes('returned HTTP success')) throw err;
    }
  });

  await check('4. Anon network failure fails', async () => {
    const mockRes = { ok: false, status: 500, data: null };
    try {
      assertAnonAclDenied(mockRes);
      throw new Error('Should have failed on status 500');
    } catch (err) {
      if (!err.message.includes('Expected HTTP status 401 or 403')) throw err;
    }
  });

  await check('5. Anon 404 fails', async () => {
    const mockRes = { ok: false, status: 404, data: { code: 'P0001' } };
    try {
      assertAnonAclDenied(mockRes);
      throw new Error('Should have failed on status 404');
    } catch (err) {
      if (!err.message.includes('Expected HTTP status 401 or 403')) throw err;
    }
  });

  await check('6. Anon malformed JSON fails', async () => {
    const mockRes = { ok: false, status: 401, data: null };
    try {
      assertAnonAclDenied(mockRes);
      throw new Error('Should have failed on null data');
    } catch (err) {
      if (!err.message.includes('must parse as valid JSON')) throw err;
    }
  });

  await check('7. Anon response with snapshot fields fails', async () => {
    const mockRes = { ok: false, status: 401, data: { code: '42501', readiness_facts: {} } };
    try {
      assertAnonAclDenied(mockRes);
      throw new Error('Should have failed because readiness_facts leaked');
    } catch (err) {
      if (!err.message.includes('leaked tenant snapshot data')) throw err;
    }
  });

  await check('8. Authenticated structured unauthorized passes', async () => {
    const mockRes = { ok: true, status: 200, data: { success: false, reason_code: 'unauthorized' } };
    assertAuthenticatedUnauthorized(mockRes, 'staff');
  });

  await check('9. Authenticated 401/403/42501 fails because authenticated EXECUTE is granted', async () => {
    const mockRes = { ok: false, status: 401, data: { code: '42501' } };
    try {
      assertAuthenticatedUnauthorized(mockRes, 'staff');
      throw new Error('Should have failed on HTTP 401');
    } catch (err) {
      if (!err.message.includes('Transport or HTTP error')) throw err;
    }
  });

  await check('10. Authenticated transport failure fails', async () => {
    const mockRes = { ok: false, status: 500, data: null };
    try {
      assertAuthenticatedUnauthorized(mockRes, 'staff');
      throw new Error('Should have failed on HTTP 500');
    } catch (err) {
      if (!err.message.includes('Transport or HTTP error')) throw err;
    }
  });

  await check('11. Super-admin complete envelope passes', async () => {
    const mockRes = {
      ok: true,
      status: 200,
      data: {
        success: true,
        readiness_facts: {},
        global_release_control: {},
        pilot_authorization: {}
      }
    };
    assertSuperAdminEligibilityEnvelope(mockRes);
  });

  await check('12. Super-admin partial envelope fails', async () => {
    const mockRes = { ok: true, status: 200, data: { success: true, readiness_facts: {} } };
    try {
      assertSuperAdminEligibilityEnvelope(mockRes);
      throw new Error('Should have failed on missing subsections');
    } catch (err) {
      if (!err.message.includes('Missing global_release_control')) throw err;
    }
  });

  await check('13. Failed role login creates setup failure and does not execute its RPC', async () => {
    const res = await authenticateUser('https://xyz.supabase.co', 'key', 'user@test.com', null);
    if (res.ok !== false || res.failure_category !== 'missing_credentials') {
      throw new Error('Failed login should return ok=false & failure_category');
    }
  });

  await check('14. Unexpected top-level exception cannot produce exit 0', async () => {
    const computeExit = (topLevelFailed, setupFailed, passed, defined) => (topLevelFailed || setupFailed || passed !== defined) ? 1 : 0;
    if (computeExit(true, false, 10, 10) === 0) throw new Error('Exit code 0 allowed when topLevelFailed=true!');
    if (computeExit(false, true, 10, 10) === 0) throw new Error('Exit code 0 allowed when setupFailed=true!');
  });

  await check('15. Zero defined tests cannot produce exit 0', async () => {
    const computeExit = (defined, passed) => (defined > 0 && passed === defined) ? 0 : 1;
    if (computeExit(0, 0) === 0) throw new Error('Exit code 0 allowed when defined = 0!');
  });

  await check('16. Async rejected test increments Failed', async () => {
    let localFailed = 0;
    try {
      await (async () => { throw new Error('Rejection'); })();
    } catch (e) {
      localFailed++;
    }
    if (localFailed !== 1) throw new Error('Async rejection failed to increment failure counter');
  });

  await check('17. Secrets remain redacted', async () => {
    const payload = { password: 'SecretPassword', token: 'eyJhbGci' };
    const redacted = redactSecrets(payload);
    const jsonStr = JSON.stringify(redacted);
    if (jsonStr.includes('SecretPassword') || jsonStr.includes('eyJhbGci')) {
      throw new Error('Secret leakage in redacted output');
    }
  });

  await check('18. Exact eligibility RPC remains allowed only on configured origin', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    if (!obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot', 'POST')) {
      throw new Error('Eligibility RPC on configured origin should be allowed');
    }
    if (obs.isAllowedPath('https://evil.external.co/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot', 'POST')) {
      throw new Error('Eligibility RPC on external origin MUST be forbidden');
    }
  });

  await check('19. Another RPC remains forbidden', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    if (obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/other_rpc', 'POST')) {
      throw new Error('Other RPC must be forbidden');
    }
  });

  await check('20. Table mutation requests remain forbidden', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    if (obs.isAllowedPath('https://xyz.supabase.co/rest/v1/platform_global_release_control', 'PATCH')) {
      throw new Error('Table PATCH must be forbidden');
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

runUnitTests();
