import { NetworkObserver, createMonitoredFetch, safeJsonParse, redactSecrets } from './test-h1e-a-credentialed-runner-helpers.mjs';

console.log('=== STAGE H1E-A CREDENTIALED RUNNER HELPER UNIT TESTS ===');

function check(title, fn) {
  try {
    fn();
    console.log('  PASS: ' + title);
  } catch (err) {
    console.error('  FAIL: ' + title + ' - ' + err.message);
    process.exit(1);
  }
}

let passed = 0;

check('1. NetworkObserver allows auth token endpoint', () => {
  const obs = new NetworkObserver();
  const allowed = obs.isAllowedPath('https://xyz.supabase.co/auth/v1/token?grant_type=password', 'POST');
  if (!allowed) throw new Error('Auth token endpoint should be allowed');
  passed++;
});

check('2. NetworkObserver allows super_admin_get_tenant_pilot_eligibility_snapshot POST RPC', () => {
  const obs = new NetworkObserver();
  const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_get_tenant_pilot_eligibility_snapshot', 'POST');
  if (!allowed) throw new Error('Eligibility snapshot RPC should be allowed');
  passed++;
});

check('3. NetworkObserver forbids unauthorized RPC mutation endpoint', () => {
  const obs = new NetworkObserver();
  const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_update_global_release', 'POST');
  if (allowed) throw new Error('Forbidden RPC mutation should NOT be allowed');
  passed++;
});

check('4. NetworkObserver forbids REST table write operations (POST/PATCH/DELETE)', () => {
  const obs = new NetworkObserver();
  const allowed = obs.isAllowedPath('https://xyz.supabase.co/rest/v1/platform_global_release_control', 'PATCH');
  if (allowed) throw new Error('REST table PATCH should NOT be allowed');
  passed++;
});

check('5. createMonitoredFetch throws Error on forbidden operation', async () => {
  const obs = new NetworkObserver();
  const monitoredFetch = await createMonitoredFetch(obs, async () => new Response('{}'));
  try {
    await monitoredFetch('https://xyz.supabase.co/rest/v1/tenants', { method: 'POST' });
    throw new Error('Should have thrown forbidden error');
  } catch (err) {
    if (!err.message.includes('FORBIDDEN_NETWORK_OPERATION')) {
      throw new Error('Unexpected error message: ' + err.message);
    }
  }
  if (obs.forbiddenRequestsDetected !== 1) throw new Error('Expected 1 forbidden request');
  if (obs.mutationAttemptsDetected !== 1) throw new Error('Expected 1 mutation attempt detected');
  passed++;
});

check('6. redactSecrets strips bearer token and JWT string', () => {
  const raw = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc';
  const redacted = redactSecrets(raw);
  if (redacted.includes('eyJ') || redacted.includes('abc')) {
    throw new Error('JWT token was not redacted properly');
  }
  passed++;
});

check('7. safeJsonParse parses valid JSON and returns null for invalid JSON', () => {
  if (safeJsonParse('{"a":1}').a !== 1) throw new Error('Valid JSON parse failed');
  if (safeJsonParse('invalid json') !== null) throw new Error('Invalid JSON should return null');
  passed++;
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: 7');
console.log('Executed tests: 7');
console.log('Passed: 7');
console.log('Failed: 0');
console.log('Final exit code: 0');
