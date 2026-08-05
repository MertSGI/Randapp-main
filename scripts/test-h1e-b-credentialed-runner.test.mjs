import fs from 'fs';
import path from 'path';
import {
  NetworkObserver,
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized
} from './test-h1e-a-credentialed-runner-helpers.mjs';
import { evaluateAssertion } from './test-h1e-b-credentialed-runner.mjs';

console.log('=== STAGE H1E-B CREDENTIALED RUNNER HELPER UNIT TESTS ===');

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
  // 1. assertAnonAclDenied returns true for valid 401/403 + 42501
  await check('1. assertAnonAclDenied returns true for valid 401/403 + 42501', async () => {
    const res = { ok: false, status: 401, data: { code: '42501', message: 'permission denied' } };
    const val = assertAnonAclDenied(res);
    if (val !== true) throw new Error('Expected assertAnonAclDenied to return true, got ' + val);
  });

  // 2. assertAnonAclDenied throws for an invalid ACL response
  await check('2. assertAnonAclDenied throws for an invalid ACL response', async () => {
    const res = { ok: true, status: 200, data: { success: true } };
    let threw = false;
    try {
      assertAnonAclDenied(res);
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('Expected assertAnonAclDenied to throw for HTTP 200 success');
  });

  // 3. assertAuthenticatedUnauthorized returns true for a valid envelope
  await check('3. assertAuthenticatedUnauthorized returns true for a valid envelope', async () => {
    const res = { ok: true, status: 200, data: { success: false, reason_code: 'UNAUTHORIZED' } };
    const val = assertAuthenticatedUnauthorized(res, 'test_role');
    if (val !== true) throw new Error('Expected assertAuthenticatedUnauthorized to return true, got ' + val);
  });

  // 4. assertAuthenticatedUnauthorized throws for success=true
  await check('4. assertAuthenticatedUnauthorized throws for success=true', async () => {
    const res = { ok: true, status: 200, data: { success: true, reason_code: 'UNAUTHORIZED' } };
    let threw = false;
    try {
      assertAuthenticatedUnauthorized(res, 'test_role');
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('Expected assertAuthenticatedUnauthorized to throw for success=true');
  });

  // 5. assertAuthenticatedUnauthorized throws for a non-UNAUTHORIZED code
  await check('5. assertAuthenticatedUnauthorized throws for a non-UNAUTHORIZED code', async () => {
    const res = { ok: true, status: 200, data: { success: false, reason_code: 'INVALID_REASON' } };
    let threw = false;
    try {
      assertAuthenticatedUnauthorized(res, 'test_role');
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('Expected assertAuthenticatedUnauthorized to throw for reason_code=INVALID_REASON');
  });

  // 6. NetworkObserver forbidden-request getter returns the request counter
  await check('6. NetworkObserver forbidden-request getter returns the request counter', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/forbidden_table', { method: 'GET' });
    if (obs.getForbiddenRequestsDetected() !== 1) throw new Error('Expected forbidden request count 1, got ' + obs.getForbiddenRequestsDetected());
  });

  // 7. NetworkObserver forbidden-mutation getter returns the mutation counter
  await check('7. NetworkObserver forbidden-mutation getter returns the mutation counter', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/forbidden_table', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() !== 1) throw new Error('Expected forbidden mutation count 1, got ' + obs.getForbiddenMutationAttemptsDetected());
  });

  // 8. Allowed RPC POST increments neither forbidden counter
  await check('8. Allowed RPC POST increments neither forbidden counter', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/super_admin_approve_tenant_pilot', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 0 || obs.getForbiddenMutationAttemptsDetected() !== 0) {
      throw new Error('Allowed RPC POST incremented forbidden counters');
    }
  });

  // 9. Forbidden GET increments only forbidden-request count
  await check('9. Forbidden GET increments only forbidden-request count', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/unknown_table', { method: 'GET' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 0) {
      throw new Error('Forbidden GET should increment requests but not mutations');
    }
  });

  // 10. Forbidden POST increments both forbidden-request and forbidden-mutation counts
  await check('10. Forbidden POST increments both forbidden-request and forbidden-mutation counts', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/unknown_table', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 1) {
      throw new Error('Forbidden POST should increment both request and mutation counters');
    }
  });

  // 11. The H1E-B runner contains no getForbiddenAttempts call
  await check('11. The H1E-B runner contains no getForbiddenAttempts call', async () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs'), 'utf8');
    if (content.includes('getForbiddenAttempts()')) {
      throw new Error('H1E-B runner still contains deprecated getForbiddenAttempts call!');
    }
  });

  // 12. Authorization assertion success cannot be recorded as false because of an undefined return
  await check('12. Authorization assertion success cannot be recorded as false because of an undefined return', async () => {
    const res = { ok: true, status: 200, data: { success: false, reason_code: 'UNAUTHORIZED' } };
    const evalRes = evaluateAssertion(() => assertAuthenticatedUnauthorized(res, 'test_role'));
    if (evalRes.ok !== true) throw new Error('Valid assertion evaluated to ok=false due to undefined return');
  });

  // 13. Failure accounting still reaches the final summary model
  await check('13. Failure accounting still reaches the final summary model', async () => {
    const evalRes = evaluateAssertion(() => { throw new Error('Simulated assertion failure'); });
    if (evalRes.ok !== false || !evalRes.error.includes('Simulated assertion failure')) {
      throw new Error('Failed assertion evaluation did not return safe error detail');
    }
  });

  // 14. Secret redaction remains effective
  await check('14. Secret redaction remains effective', async () => {
    const secret = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const redacted = redactSecrets(secret);
    if (redacted.includes('eyJhbGci')) throw new Error('Secret leakage in redacted output');
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
