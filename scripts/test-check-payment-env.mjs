import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auditPaymentEnvContent,
  auditRuntimeEnv,
  runPaymentEnvCheck
} from './check-payment-env.mjs';

console.log('=== Running check-payment-env Fail-Closed Unit Tests ===');

// 1. Clean .env.example passes
const cleanExample = [
  'VITE_PAYMENT_MODE=disabled',
  'VITE_PAYMENT_RUN_MODE=local_dry_run',
  'VITE_PAYMENT_PROVIDER=disabled',
  'VITE_COMMUNICATION_MODE=local_outbox_only',
  '# IYZICO_SECRET_KEY=',
  '# SUPABASE_SERVICE_ROLE_KEY='
].join('\n');
const cleanExampleRes = auditPaymentEnvContent('.env.example', cleanExample);
assert.equal(cleanExampleRes.ok, true, 'Clean .env.example with disabled defaults must pass');

// 2. Negative: VITE_ prefixed secret in .env fails closed
const viteSecretRes = auditPaymentEnvContent('.env', 'VITE_IYZICO_SECRET_KEY=live_secret_abc12345');
assert.equal(viteSecretRes.ok, false, 'VITE_IYZICO_SECRET_KEY in .env must be rejected');
assert.ok(viteSecretRes.errors.some((e) => e.includes('VITE_IYZICO_SECRET_KEY')));

// 3. Negative: Real server secret assigned in .env.local fails closed
const serverSecretRes = auditPaymentEnvContent('.env.local', 'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.realkey');
assert.equal(serverSecretRes.ok, false, 'Real SUPABASE_SERVICE_ROLE_KEY in .env.local must be rejected');

// 4. Negative: Live production iyzico endpoint rejected while EXTERNAL_HOLD/NO_GO is active
const liveUrlRes = auditPaymentEnvContent('.env.production', 'IYZICO_BASE_URL=https://api.iyzipay.com');
assert.equal(liveUrlRes.ok, false, 'Live api.iyzipay.com endpoint must be rejected under EXTERNAL_HOLD');

// 5. Negative: production_live or iyzico_live rejected while PRODUCTION=NO_GO
const prodModeRes = auditPaymentEnvContent('.env', 'VITE_PAYMENT_RUN_MODE=production_live\nVITE_PAYMENT_MODE=iyzico_live');
assert.equal(prodModeRes.ok, false, 'production_live and iyzico_live flags must be rejected');
assert.equal(prodModeRes.errors.length, 2);

// 6. Negative: .env.example with modified safe default fails closed
const badExample = cleanExample.replace('VITE_PAYMENT_MODE=disabled', 'VITE_PAYMENT_MODE=iyzico_live');
const badExampleRes = auditPaymentEnvContent('.env.example', badExample);
assert.equal(badExampleRes.ok, false, 'Tampered .env.example safe default must fail closed');

// 7. Negative: Runtime env check rejects VITE_SUPABASE_SERVICE_ROLE_KEY and live IYZICO_BASE_URL
const badRuntime = auditRuntimeEnv({
  VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret_value',
  IYZICO_BASE_URL: 'https://api.iyzipay.com'
});
assert.equal(badRuntime.ok, false, 'Runtime env exposing VITE_SUPABASE_SERVICE_ROLE_KEY or live URL must fail');
assert.equal(badRuntime.errors.length, 2);

const goodRuntime = auditRuntimeEnv({
  VITE_DATA_MODE: 'local',
  IYZICO_BASE_URL: 'https://sandbox-api.iyzipay.com'
});
assert.equal(goodRuntime.ok, true, 'Safe local runtime env must pass');

// 8. End-to-end temp directory check: clean passes (0), secret leaks across .env* fail (1)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-check-payenv-'));
try {
  fs.writeFileSync(path.join(tempDir, '.env.example'), cleanExample, 'utf8');
  assert.equal(runPaymentEnvCheck(tempDir, {}), 0, 'Clean temp workspace must exit 0');

  const envPath = path.join(tempDir, '.env');
  fs.writeFileSync(envPath, 'IYZICO_SECRET_KEY=sk_live_real_key_123456\n', 'utf8');
  assert.equal(runPaymentEnvCheck(tempDir, {}), 1, 'Workspace with live IYZICO_SECRET_KEY in .env must exit 1');
  fs.rmSync(envPath, { force: true });

  const envTestPath = path.join(tempDir, '.env.test');
  fs.writeFileSync(envTestPath, 'IYZICO_SECRET_KEY=real_secret\n', 'utf8');
  assert.equal(runPaymentEnvCheck(tempDir, {}), 1, 'Workspace with real IYZICO_SECRET_KEY in .env.test must exit 1');
  fs.rmSync(envTestPath, { force: true });

  const envDevLocalPath = path.join(tempDir, '.env.development.local');
  fs.writeFileSync(envDevLocalPath, 'IYZICO_SECRET_KEY=real_secret\n', 'utf8');
  assert.equal(
    runPaymentEnvCheck(tempDir, {}),
    1,
    'Workspace with real IYZICO_SECRET_KEY in .env.development.local must exit 1'
  );
  fs.rmSync(envDevLocalPath, { force: true });

  assert.equal(runPaymentEnvCheck(tempDir, {}), 0, 'Workspace returns to exit 0 after removing leaked .env* files');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('✅ All check-payment-env unit tests PASSED.');
