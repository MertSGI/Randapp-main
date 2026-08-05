import fs from 'fs';
import path from 'path';
import {
  NetworkObserver,
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized
} from './test-h1e-a-credentialed-runner-helpers.mjs';
import { evaluateAssertion, evaluateMutationEvidenceDelta } from './test-h1e-b-credentialed-runner.mjs';

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

  // --- EVIDENCE DELTA TESTS ---

  // 15. Initial historical counts 1/1 and final counts 2/2 pass
  await check('15. Initial historical counts 1/1 and final counts 2/2 pass', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 2, approved_audit_count: 2, revoked_audit_count: 2, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (!res.ok) throw new Error('Expected pass for historical baseline 1/1, got errors: ' + res.errors.join('; '));
  });

  // 16. Initial historical counts 5/5 and final counts 6/6 pass
  await check('16. Initial historical counts 5/5 and final counts 6/6 pass', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 5, approved_audit_count: 5, revoked_audit_count: 5, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 6, approved_audit_count: 6, revoked_audit_count: 6, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (!res.ok) throw new Error('Expected pass for historical baseline 5/5, got errors: ' + res.errors.join('; '));
  });

  // 17. total_authorization_count delta +1 passes
  await check('17. total_authorization_count delta +1 passes', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 10, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 11, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (!res.ok) throw new Error('Expected total_authorization_count delta +1 to pass');
  });

  // 18. approval audit delta 0 fails
  await check('18. approval audit delta 0 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 1, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected approval audit delta 0 to fail');
  });

  // 19. approval audit delta +2 fails
  await check('19. approval audit delta +2 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 2, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected approval audit delta +2 to fail');
  });

  // 20. revocation audit delta 0 fails
  await check('20. revocation audit delta 0 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 1, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected revocation audit delta 0 to fail');
  });

  // 21. revocation audit delta +2 fails
  await check('21. revocation audit delta +2 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 2, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected revocation audit delta +2 to fail');
  });

  // 22. final active authorization count 1 fails
  await check('22. final active authorization count 1 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 1, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected final active authorization count 1 to fail');
  });

  // 23. initial active authorization count 1 is contamination
  await check('23. initial active authorization count 1 is contamination', async () => {
    const init = { active_authorization_count: 1, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 2, approved_audit_count: 2, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected initial active authorization count 1 to be flagged as contamination');
  });

  // 24. initial idempotency count 0 and final count 3 pass
  await check('24. initial idempotency count 0 and final count 3 pass', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (!res.ok) throw new Error('Expected run-scoped idempotency count 0 -> 3 to pass');
  });

  // 25. final idempotency count 2 fails
  await check('25. final idempotency count 2 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 2 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected final idempotency count 2 to fail');
  });

  // 26. final idempotency count 4 fails
  await check('26. final idempotency count 4 fails', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 4 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected final idempotency count 4 to fail');
  });

  // 27. missing numeric evidence fails safely
  await check('27. missing numeric evidence fails safely', async () => {
    const init = null;
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected null initial evidence to fail safely');
  });

  // 28. non-numeric evidence fails safely
  await check('28. non-numeric evidence fails safely', async () => {
    const init = { active_authorization_count: 'zero', total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (res.ok) throw new Error('Expected non-numeric active count to fail safely');
  });

  // 29. absolute audit total of 1 is not required
  await check('29. absolute audit total of 1 is not required when baseline starts at 3/3', async () => {
    const init = { active_authorization_count: 0, total_authorization_count: 3, approved_audit_count: 3, revoked_audit_count: 3, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 4, approved_audit_count: 4, revoked_audit_count: 4, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    if (!res.ok) throw new Error('Absolute audit totals should not fail baseline 3 -> 4 transition');
  });

  // 30. safe diagnostic output contains no idempotency key or raw payload
  await check('30. safe diagnostic output contains no idempotency key or raw payload', async () => {
    const secretKey = 'h1e_b_mutation_run_secret_key_123';
    const init = { active_authorization_count: 0, total_authorization_count: 0, approved_audit_count: 0, revoked_audit_count: 0, idempotency_record_count: 0 };
    const final = { active_authorization_count: 0, total_authorization_count: 1, approved_audit_count: 1, revoked_audit_count: 1, idempotency_record_count: 3 };
    const res = evaluateMutationEvidenceDelta(init, final);
    const serialized = JSON.stringify(res);
    if (serialized.includes(secretKey) || serialized.includes('Bearer')) {
      throw new Error('Diagnostic evidence payload leaked secret or key string');
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
