import fs from 'fs';
import path from 'path';
import {
  NetworkObserver,
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized
} from './test-h1e-a-credentialed-runner-helpers.mjs';

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
  await check('1. H1E-B credentialed runner file exists with exact filename', async () => {
    const runnerPath = path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs');
    if (!fs.existsSync(runnerPath)) throw new Error('H1E-B credentialed runner missing!');
  });

  await check('2. H1E-B credentialed runner requires credentials and does not execute mutations without environment variables', async () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs'), 'utf8');
    if (!content.includes('H1E_B_CREDENTIALS_REQUIRED') || !content.includes('process.exit(1)')) {
      throw new Error('H1E-B credentialed runner missing uncredentialed guard!');
    }
  });

  await check('3. Dedicated staging test tenant ID is documented in runner', async () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs'), 'utf8');
    if (!content.includes('DEDICATED_H1D_TENANT_ID')) {
      throw new Error('H1E-B runner missing dedicated test tenant ID binding!');
    }
  });

  await check('4. NetworkObserver allows approved mutation RPCs and forbids table PATCH/DELETE', async () => {
    const obs = new NetworkObserver('https://xyz.supabase.co');
    if (!obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_approve_tenant_pilot', 'POST')) {
      throw new Error('super_admin_approve_tenant_pilot should be allowed');
    }
    if (!obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_revoke_tenant_pilot', 'POST')) {
      throw new Error('super_admin_revoke_tenant_pilot should be allowed');
    }
    if (!obs.isAllowedPath('https://xyz.supabase.co/rest/v1/rpc/super_admin_get_tenant_pilot_mutation_evidence', 'POST')) {
      throw new Error('super_admin_get_tenant_pilot_mutation_evidence should be allowed');
    }
    if (obs.isAllowedPath('https://xyz.supabase.co/rest/v1/tenant_pilot_authorizations', 'PATCH')) {
      throw new Error('Table PATCH must be forbidden');
    }
  });

  await check('5. Anon ACL denial helper validates 401/403 and PG 42501', async () => {
    const res = { ok: false, status: 401, data: { code: '42501', message: 'permission denied' } };
    assertAnonAclDenied(res);
  });

  await check('6. Authenticated UNAUTHORIZED helper validates structured reason_code UNAUTHORIZED', async () => {
    const res = { ok: true, status: 200, data: { success: false, reason_code: 'UNAUTHORIZED' } };
    assertAuthenticatedUnauthorized(res, 'test_role');
  });

  await check('7. Secrets remain redacted in error outputs', async () => {
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
