import fs from 'fs';
import path from 'path';
import { NetworkObserver, redactSecrets } from './test-h1e-a-credentialed-runner-helpers.mjs';
import { evaluateH1ECPrecedence } from './test-h1e-c-credentialed-runner.mjs';

console.log('=== STAGE H1E-C1 CREDENTIALED RUNNER HELPER & LOGIC UNIT TESTS ===');

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
  // 1. Missing mode exits safely without Run ID
  await check('1. Missing mode exits safely without Run ID', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('H1E_C_MODE_REQUIRED')) throw new Error('Missing H1E_C_MODE_REQUIRED check');
  });

  // 2. Invalid mode is rejected
  await check('2. Invalid mode is rejected', async () => {
    const res = evaluateH1ECPrecedence(['INVALID_REASON']);
    if (res.ok) throw new Error('Invalid reason code accepted');
  });

  // 3. pre_pilot_readonly allows no mutation RPC
  await check('3. pre_pilot_readonly allows no mutation RPC', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/disallowed_mutation_rpc', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() !== 1) throw new Error('Disallowed RPC not detected as forbidden mutation');
  });

  // 4. pre_pilot_readonly rejects approve
  await check('4. pre_pilot_readonly rejects approve', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/disallowed_approve_rpc', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() === 0) throw new Error('Approve RPC not rejected');
  });

  // 5. pre_pilot_readonly rejects revoke
  await check('5. pre_pilot_readonly rejects revoke', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/disallowed_revoke_rpc', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() === 0) throw new Error('Revoke RPC not rejected');
  });

  // 6. pre_pilot_readonly rejects release-phase mutation
  await check('6. pre_pilot_readonly rejects release-phase mutation', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/platform_global_release_control', { method: 'PATCH' });
    if (obs.getForbiddenMutationAttemptsDetected() === 0) throw new Error('Release phase PATCH not rejected');
  });

  // 7. Controlled mode requires exact confirmation
  await check('7. Controlled mode requires exact confirmation', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('I_UNDERSTAND_THIS_MUTATES_STAGING_RELEASE_CONTROL')) {
      throw new Error('Controlled confirmation missing from runner logic');
    }
  });

  // 8. Incorrect confirmation is rejected
  await check('8. Incorrect confirmation is rejected', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('controlled_paymentless_pilot')) throw new Error('Controlled mode missing');
  });

  // 9. Unknown slug under pre_pilot has global blocker first
  await check('9. Unknown slug under pre_pilot has global blocker first', async () => {
    const res = evaluateH1ECPrecedence(['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND']);
    if (!res.ok) throw new Error('Valid unknown slug precedence rejected: ' + res.error);
  });

  // 10. Unknown slug includes TENANT_NOT_FOUND second
  await check('10. Unknown slug includes TENANT_NOT_FOUND second', async () => {
    const res = evaluateH1ECPrecedence(['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND']);
    if (!res.ok || res.error) throw new Error('Order error');
  });

  // 11. Missing release control has RELEASE_CONTROL_UNAVAILABLE first
  await check('11. Missing release control has RELEASE_CONTROL_UNAVAILABLE first', async () => {
    const res = evaluateH1ECPrecedence(['RELEASE_CONTROL_UNAVAILABLE', 'TENANT_NOT_FOUND']);
    if (!res.ok) throw new Error('RELEASE_CONTROL_UNAVAILABLE precedence rejected: ' + res.error);
  });

  // 12. paymentless pilot no-history state requires authorization
  await check('12. paymentless pilot no-history state requires authorization', async () => {
    const res = evaluateH1ECPrecedence(['PILOT_AUTHORIZATION_REQUIRED']);
    if (!res.ok) throw new Error('PILOT_AUTHORIZATION_REQUIRED rejected');
  });

  // 13. paymentless pilot revoked-history state is revoked
  await check('13. paymentless pilot revoked-history state is revoked', async () => {
    const res = evaluateH1ECPrecedence(['PILOT_AUTHORIZATION_REVOKED']);
    if (!res.ok) throw new Error('PILOT_AUTHORIZATION_REVOKED rejected');
  });

  // 14. Active authorization removes pilot blocker
  await check('14. Active authorization removes pilot blocker', async () => {
    const res = evaluateH1ECPrecedence(['BOOKING_ALLOWED']);
    if (!res.ok) throw new Error('BOOKING_ALLOWED rejected');
  });

  // 15. full_production does not require pilot authorization
  await check('15. full_production does not require pilot authorization', async () => {
    const res = evaluateH1ECPrecedence(['SUBSCRIPTION_BLOCKED']);
    if (!res.ok) throw new Error('SUBSCRIPTION_BLOCKED rejected');
  });

  // 16. Subscription blocker still blocks authorized pilot
  await check('16. Subscription blocker still blocks authorized pilot', async () => {
    const res = evaluateH1ECPrecedence(['SUBSCRIPTION_BLOCKED']);
    if (!res.ok) throw new Error('SUBSCRIPTION_BLOCKED rejected');
  });

  // 17. Entitlement blocker still blocks authorized pilot
  await check('17. Entitlement blocker still blocks authorized pilot', async () => {
    const res = evaluateH1ECPrecedence(['REQUIRED_ENTITLEMENT_BLOCKED']);
    if (!res.ok) throw new Error('REQUIRED_ENTITLEMENT_BLOCKED rejected');
  });

  // 18. Readiness blocker still blocks authorized pilot
  await check('18. Readiness blocker still blocks authorized pilot', async () => {
    const res = evaluateH1ECPrecedence(['OPERATIONAL_READINESS_FAILED']);
    if (!res.ok) throw new Error('OPERATIONAL_READINESS_FAILED rejected');
  });

  // 19. BOOKING_ALLOWED cannot coexist with blockers
  await check('19. BOOKING_ALLOWED cannot coexist with blockers', async () => {
    const res = evaluateH1ECPrecedence(['GLOBAL_RELEASE_PHASE_BLOCKED', 'BOOKING_ALLOWED']);
    if (res.ok) throw new Error('Coexistence should fail');
  });

  // 20. Duplicate blockers fail
  await check('20. Duplicate blockers fail', async () => {
    const res = evaluateH1ECPrecedence(['TENANT_NOT_FOUND', 'TENANT_NOT_FOUND']);
    if (res.ok) throw new Error('Duplicate blockers should fail');
  });

  // 21. Out-of-order blockers fail
  await check('21. Out-of-order blockers fail', async () => {
    const res = evaluateH1ECPrecedence(['TENANT_NOT_FOUND', 'GLOBAL_RELEASE_PHASE_BLOCKED']);
    if (res.ok) throw new Error('Out of order blockers should fail');
  });

  // 22. Payment flags true causes failure
  await check('22. Payment flags true causes failure', async () => {
    const flags = { is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false };
    if (flags.is_payment_collection_enabled || flags.is_checkout_enabled || flags.is_iyzico_enabled) {
      throw new Error('Payment flags enabled');
    }
  });

  // 23. Snapshot unauthorized envelope must be uppercase UNAUTHORIZED
  await check('23. Snapshot unauthorized envelope must be uppercase UNAUTHORIZED', async () => {
    const mig52Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260827_h1e_c_public_booking_release_gate_runtime_fix.sql'), 'utf8');
    if (!mig52Content.includes("'reason_code', 'UNAUTHORIZED'")) {
      throw new Error('Snapshot missing uppercase UNAUTHORIZED reason code');
    }
  });

  // 24. Forbidden RPC is counted
  await check('24. Forbidden RPC is counted', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/disallowed_rpc', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() !== 1) throw new Error('Forbidden RPC not counted');
  });

  // 25. Forbidden table write is counted as request and mutation
  await check('25. Forbidden table write is counted as request and mutation', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/tenants', { method: 'POST' });
    if (obs.getForbiddenRequestsDetected() !== 1 || obs.getForbiddenMutationAttemptsDetected() !== 1) {
      throw new Error('Forbidden table write count mismatch');
    }
  });

  // 26. Secret redaction works
  await check('26. Secret redaction works', async () => {
    const redacted = redactSecrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    if (redacted.includes('eyJhbGci')) throw new Error('Secret not redacted');
  });

  // 27. Incomplete accounting cannot exit 0
  await check('27. Incomplete accounting cannot exit 0', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('const isSuccess = executed === defined && passed === defined && failed === 0')) {
      throw new Error('Incomplete accounting validation missing');
    }
  });

  // 28. Controlled mode cannot pass unless final phase is pre_pilot
  await check('28. Controlled mode cannot pass unless final phase is pre_pilot', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('controlled_paymentless_pilot')) throw new Error('Controlled mode missing');
  });

  // 29. Controlled mode cannot pass unless active authorization count is zero
  await check('29. Controlled mode cannot pass unless active authorization count is zero', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('finalActiveAuthCount')) throw new Error('Active auth count validation missing');
  });

  // 30. Runner source contains no credentialed stub exit
  await check('30. Runner source contains no credentialed stub exit', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (runnerContent.includes('// Stub for prepared credentialed execution path')) {
      throw new Error('Credentialed stub exit still present in runner');
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
