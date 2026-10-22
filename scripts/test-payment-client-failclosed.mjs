import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory mock localStorage for deterministic node runtime testing
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

const mockLs = new MockLocalStorage();
globalThis.localStorage = mockLs;
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    localStorage: mockLs,
  };
}

// Global Vite-style env shim for testing
function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Initialize with safe default mock mode
setTestEnv({
  VITE_DATA_MODE: 'mock',
  VITE_PAYMENT_RUN_MODE: 'local_dry_run',
});

// Import public services under test
const { paymentRunModeService, PaymentRunModeService } = await import('../services/paymentRunModeService.ts');
const { subscriptionService } = await import('../services/subscriptionService.ts');
const { supabase } = await import('../services/supabaseClient.ts');

test('Case 1: localStorage containing production_live is ignored and cannot grant checkout authority', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock' });
  mockLs.setItem('internal_run_mode', 'production_live');

  const svc = new PaymentRunModeService();
  const mode = svc.getCurrentMode();
  assert.notEqual(mode, 'production_live', 'localStorage=production_live must be ignored on client');
  assert.equal(mode, 'local_dry_run', 'Client must safely fall back to local_dry_run');
});

test('Case 2: VITE_PAYMENT_RUN_MODE=production_live cannot grant production live checkout authority', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock', VITE_PAYMENT_RUN_MODE: 'production_live' });
  const svc = new PaymentRunModeService();

  const status = svc.getStatus();
  assert.notEqual(status.mode, 'production_live', 'Client cannot activate production_live mode from env alone');
  assert.equal(status.canRunCheckout, true); // Safe local dry run fallback in mock mode
  assert.equal(status.mode, 'local_dry_run');
});

test('Case 3: Setter attempt to set production_live is strictly rejected', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock' });
  const svc = new PaymentRunModeService();

  assert.throws(
    () => {
      svc.setInternalDiagnosticsMode('production_live');
    },
    /PRODUCTION_PAYMENT_MODE_DISALLOWED_ON_CLIENT/,
    'Setting production_live mode from client must throw an explicit security error'
  );

  assert.notEqual(mockLs.getItem('internal_run_mode'), 'production_live', 'Must not write production_live to storage');
});

test('Case 4: Persistent DB mode (supabase) is fail-closed in payment status', () => {
  mockLs.clear();
  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  });

  const svc = new PaymentRunModeService();
  const status = svc.getStatus();

  assert.equal(status.canRunCheckout, false, 'canRunCheckout must be false in persistent supabase mode');
  assert.ok(
    status.missingBlockers.includes('SERVER_PAYMENT_ACTIVATION_REQUIRED'),
    'missingBlockers must include SERVER_PAYMENT_ACTIVATION_REQUIRED'
  );
});

test('Case 5: subscriptionService.startCheckout() in persistent mode fails closed without mock writes', async () => {
  mockLs.clear();
  const testTenantId = 'tenant-persistent-negative-99';

  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  });

  let thrownError = null;
  try {
    await subscriptionService.startCheckout(testTenantId, 'baslangic');
  } catch (err) {
    thrownError = err;
  }

  assert.ok(thrownError, 'startCheckout must throw in supabase mode');
  assert.equal(
    thrownError.errorCode,
    'PAYMENT_SERVER_ACTIVATION_REQUIRED',
    'Must throw typed error PAYMENT_SERVER_ACTIVATION_REQUIRED'
  );
  assert.equal(
    mockLs.getItem(`mock_subscription_${testTenantId}`),
    null,
    'No mock subscription write should occur when fail-closed in supabase mode'
  );
});

test('Case 6: Local demo existing success path works in mock mode', async () => {
  mockLs.clear();
  const testTenantId = 'tenant-demo-local-01';

  setTestEnv({
    VITE_DATA_MODE: 'mock',
    VITE_PAYMENT_RUN_MODE: 'local_dry_run',
  });

  const simUrl = await subscriptionService.startCheckout(testTenantId, 'baslangic');
  assert.ok(typeof simUrl === 'string' && simUrl.includes('checkout_simulate=true'));

  const saved = mockLs.getItem(`mock_subscription_${testTenantId}`);
  assert.ok(saved !== null, 'Local demo must seed mock subscription for existing local QA flow');
  const parsed = JSON.parse(saved);
  assert.equal(parsed.tenantId, testTenantId);
  assert.equal(parsed.paymentProvider, 'local_dry_run');
});

test('Case 7: Tampered browser storage cannot elevate run mode or bypass security', () => {
  mockLs.clear();
  setTestEnv({ VITE_DATA_MODE: 'mock' });
  const svc = new PaymentRunModeService();

  const payloads = [
    '{"mode":"production_live","bypass":true}',
    '__proto__',
    'undefined',
    'null',
    'ADMIN_ELEVATED',
    'true',
  ];

  for (const payload of payloads) {
    mockLs.setItem('internal_run_mode', payload);
    const mode = svc.getCurrentMode();
    assert.equal(mode, 'local_dry_run', `Payload "${payload}" must fall back to local_dry_run`);
  }
});

test('Case 8: Cannot call Supabase Edge function create-checkout-session from client', async () => {
  mockLs.clear();
  let invokeCalls = 0;
  const originalInvoke = supabase.functions.invoke;

  supabase.functions.invoke = async (...args) => {
    invokeCalls += 1;
    return originalInvoke.apply(supabase.functions, args);
  };

  try {
    setTestEnv({
      VITE_DATA_MODE: 'supabase_staging',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    });

    try {
      await subscriptionService.startCheckout('tenant-edge-check', 'baslangic');
    } catch {
      // Expected fail-closed throw
    }
    assert.equal(invokeCalls, 0, 'supabase.functions.invoke must never be called by client checkout');
  } finally {
    supabase.functions.invoke = originalInvoke;
  }
});

test('Case 9: Explicit UNTESTED designation for real external gateway network calls', () => {
  console.log('  [UNTESTED] Real production Iyzico gateway direct network transmission is UNTESTED by design (safe fail-closed on client; server activation required).');
  assert.ok(true);
});
