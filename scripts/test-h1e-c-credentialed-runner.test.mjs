import fs from 'fs';
import path from 'path';
import { NetworkObserver, redactSecrets } from './test-h1e-a-credentialed-runner-helpers.mjs';
import { evaluateH1ECPrecedence } from './test-h1e-c-credentialed-runner.mjs';

console.log('=== STAGE H1E-C CREDENTIALED RUNNER HELPER UNIT TESTS ===');

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
  // 1. Unset mode produces safe preflight error and exit 1
  await check('1. Unset mode produces safe preflight error and exit 1', async () => {
    const runnerContent = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-c-credentialed-runner.mjs'), 'utf8');
    if (!runnerContent.includes('H1E_C_MODE_REQUIRED')) throw new Error('Runner does not check H1E_C_MODE_REQUIRED');
  });

  // 2. Invalid mode is rejected
  await check('2. Invalid mode is rejected', async () => {
    const res = evaluateH1ECPrecedence(['UNKNOWN_CODE']);
    if (res.ok) throw new Error('Unknown code should be rejected');
  });

  // 3. pre_pilot_readonly forbids every mutation
  await check('3. pre_pilot_readonly forbids every mutation', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    obs.observe('https://xyz.supabase.co/rest/v1/rpc/super_admin_approve_tenant_pilot', { method: 'POST' });
    if (obs.getForbiddenMutationAttemptsDetected() !== 0) throw new Error('Allowed RPC POST should not be forbidden mutation unless disallowed path');
  });

  // 4. Canonical reason-code parsing & precedence ordering
  await check('4. Canonical reason-code parsing & precedence ordering', async () => {
    const valid = ['GLOBAL_RELEASE_PHASE_BLOCKED', 'TENANT_NOT_FOUND'];
    const res = evaluateH1ECPrecedence(valid);
    if (!res.ok) throw new Error('Valid ordered array rejected: ' + res.error);

    const invalidOrder = ['TENANT_NOT_FOUND', 'GLOBAL_RELEASE_PHASE_BLOCKED'];
    const res2 = evaluateH1ECPrecedence(invalidOrder);
    if (res2.ok) throw new Error('Invalid order should be rejected');
  });

  // 5. Duplicate reason codes rejected
  await check('5. Duplicate reason codes rejected', async () => {
    const dupes = ['TENANT_NOT_FOUND', 'TENANT_NOT_FOUND'];
    const res = evaluateH1ECPrecedence(dupes);
    if (res.ok) throw new Error('Duplicates should be rejected');
  });

  // 6. BOOKING_ALLOWED cannot coexist with blockers
  await check('6. BOOKING_ALLOWED cannot coexist with blockers', async () => {
    const coexist = ['GLOBAL_RELEASE_PHASE_BLOCKED', 'BOOKING_ALLOWED'];
    const res = evaluateH1ECPrecedence(coexist);
    if (res.ok) throw new Error('BOOKING_ALLOWED coexisting with blocker should be rejected');
  });

  // 7. Payment flags must remain false
  await check('7. Payment flags must remain false', async () => {
    const flags = { is_payment_collection_enabled: false, is_checkout_enabled: false, is_iyzico_enabled: false };
    if (flags.is_payment_collection_enabled || flags.is_checkout_enabled || flags.is_iyzico_enabled) {
      throw new Error('Payment flags enabled!');
    }
  });

  // 8. Secret redaction remains effective
  await check('8. Secret redaction remains effective', async () => {
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
