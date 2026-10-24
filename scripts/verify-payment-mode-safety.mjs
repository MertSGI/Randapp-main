/**
 * LARI — Phase C: Payment Mode Safety Verification Suite (WP-2)
 * ============================================================================
 * Verifies strict distinction between:
 * 1. local_dry_run — synthetic non-paying UI rehearsal.
 * 2. sandbox_live — externally configured sandbox, NOT authorized by browser state.
 * 3. production_live — requires separately verified backend activation and explicit release authorization.
 * 
 * Invariants:
 * - Browser localStorage, URL parameters, VITE flags and mock state MUST NOT
 *   independently authorize payment collection.
 * - Where a trusted backend authorization path does not exist, return disabled/not-configured.
 * - Payment adapters fail closed with PAYMENT_PROVIDER_NOT_CONFIGURED.
 * - Zero fabricated checkout URLs, paid subscription records, or provider session IDs.
 */

import assert from 'node:assert/strict';

// Setup headless mock environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.window.location = {
  protocol: 'https:',
  host: 'staging.lari.app',
  origin: 'https://staging.lari.app'
};

const storageMap = new Map();
globalThis.localStorage = {
  get length() { return storageMap.size; },
  key: (index) => Array.from(storageMap.keys())[index] || null,
  getItem: (key) => storageMap.has(key) ? storageMap.get(key) : null,
  setItem: (key, value) => { storageMap.set(key, String(value)); },
  removeItem: (key) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); }
};

if (!globalThis.import) {
  globalThis.import = { meta: { env: {} } };
}

// Setup headless WebSocket mock for Node.js < 22 runtime
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

console.log('='.repeat(80));
console.log('LARI — PHASE C PAYMENT RUN-MODE SAFETY VERIFICATION (WP-2)');
console.log('='.repeat(80));

// Import services dynamically
const { paymentRunModeService } = await import('../services/paymentRunModeService.ts');
const { stripeProvider, iyzicoProvider, paramProvider, PAYMENT_DISABLED_ERROR } = await import('../services/paymentProvider.ts');
const { subscriptionService } = await import('../services/subscriptionService.ts');

// ----------------------------------------------------------------------------
// Test 1: LocalStorage Tampering Attack (production_live injection)
// ----------------------------------------------------------------------------
console.log('\n[Case 1] Negative test: LocalStorage tampering with internal_run_mode=production_live...');
localStorage.setItem('internal_run_mode', 'production_live');

// The service must reject production_live from localStorage and fall back to local_dry_run
const currentMode = paymentRunModeService.getCurrentMode();
assert.notEqual(currentMode, 'production_live', 'localStorage tampering MUST NOT activate production_live');
assert.equal(currentMode, 'local_dry_run', 'Tampered localStorage must fall back safely to local_dry_run');

paymentRunModeService.setInternalDiagnosticsMode('production_live');
const cleanedMode = localStorage.getItem('internal_run_mode');
assert.notEqual(cleanedMode, 'production_live', 'setInternalDiagnosticsMode must prohibit storing production_live in browser localStorage');
console.log('✅ Case 1 PASS: LocalStorage tampering cannot activate production_live mode.');

// ----------------------------------------------------------------------------
// Test 2: LocalStorage Sandbox Mode Cannot Independently Authorize Payment
// ----------------------------------------------------------------------------
console.log('\n[Case 2] Testing sandbox_live requires verified backend credentials...');
paymentRunModeService.setInternalDiagnosticsMode('sandbox_live');
assert.equal(paymentRunModeService.getCurrentMode(), 'sandbox_live', 'Diagnostics mode allows sandbox view rehearsal');

// Without verified backend configuration, sandbox status must report canRunCheckout: false
const unverifiedSandboxStatus = paymentRunModeService.getStatus({ hasVerifiedBackendConfig: false });
assert.equal(unverifiedSandboxStatus.canRunCheckout, false, 'Sandbox WITHOUT verified backend config cannot run checkout');
assert.equal(unverifiedSandboxStatus.isPaymentCollectionAuthorized, false, 'Sandbox cannot authorize real payment collection');
assert.ok(unverifiedSandboxStatus.missingBlockers.length > 0, 'Missing blockers must be explicitly listed');

// With verified backend configuration, sandbox can test, but cannot authorize real payment collection
const verifiedSandboxStatus = paymentRunModeService.getStatus({ hasVerifiedBackendConfig: true, blockers: [] });
assert.equal(verifiedSandboxStatus.canRunCheckout, true, 'Verified sandbox allows checkout test execution');
assert.equal(verifiedSandboxStatus.isPaymentCollectionAuthorized, false, 'Sandbox is NEVER authorized for real money collection');
console.log('✅ Case 2 PASS: Sandbox mode cannot authorize payment collection without verified backend.');

// ----------------------------------------------------------------------------
// Test 3: Production Live Status is STRICTLY Disabled in Browser Client
// ----------------------------------------------------------------------------
console.log('\n[Case 3] Testing production_live fail-closed rules and blocker disclosure...');
// Force env mode to production_live for simulation
process.env.VITE_PAYMENT_RUN_MODE = 'production_live';

const prodStatus = paymentRunModeService.getStatus();
assert.equal(prodStatus.mode, 'production_live');
assert.equal(prodStatus.canRunCheckout, false, 'Browser client CANNOT run live production checkout');
assert.equal(prodStatus.isPaymentCollectionAuthorized, false, 'Production payment collection is prohibited from browser state');
assert.ok(
  prodStatus.missingBlockers.some(b => b.includes('Issue #10') || b.includes('Prodüksiyon')),
  'Missing blockers must disclose production release gate and server-side attestation'
);

// startCheckout must throw PRODUCTION_PAYMENT_UNAUTHORIZED
let thrownError = null;
try {
  await subscriptionService.startCheckout('tenant_test', 'professional');
} catch (err) {
  thrownError = err;
}
assert.ok(thrownError, 'startCheckout in production_live must throw');
assert.equal(thrownError.errorCode, 'PRODUCTION_PAYMENT_UNAUTHORIZED', `Expected PRODUCTION_PAYMENT_UNAUTHORIZED, got: ${thrownError.errorCode}`);
console.log('✅ Case 3 PASS: Production live status fails closed and rejects checkout in frontend.');

// Cleanup env
delete process.env.VITE_PAYMENT_RUN_MODE;
localStorage.removeItem('internal_run_mode');

// ----------------------------------------------------------------------------
// Test 4: Local Dry Run Mode Safety & Rehearsal Invariants
// ----------------------------------------------------------------------------
console.log('\n[Case 4] Testing local_dry_run is purely synthetic simulation...');
const dryRunStatus = paymentRunModeService.getStatus();
assert.equal(dryRunStatus.mode, 'local_dry_run');
assert.equal(dryRunStatus.canRunCheckout, false, 'local_dry_run cannot execute real monetary checkout');
assert.equal(dryRunStatus.isPaymentCollectionAuthorized, false, 'local_dry_run cannot collect payments');
assert.equal(dryRunStatus.isMockSimulation, true, 'local_dry_run is explicitly marked as mock simulation');

const simulatedUrl = paymentRunModeService.simulateCheckoutHandoff('tenant_dry', 'starter');
assert.ok(simulatedUrl.includes('checkout_simulate=true'), 'Simulation URL must indicate internal simulation');
assert.ok(!simulatedUrl.includes('iyzico.com'), 'Simulation must NEVER point to real external provider');
assert.ok(!simulatedUrl.includes('stripe.com'), 'Simulation must NEVER point to stripe');
console.log('✅ Case 4 PASS: Local dry run is cleanly isolated as a non-paying simulation.');

// ----------------------------------------------------------------------------
// Test 5: Client-Side Payment Adapters Fail Closed Without URLs or Session IDs
// ----------------------------------------------------------------------------
console.log('\n[Case 5] Testing all client payment adapters fail closed with typed error...');
const providers = [
  { name: 'stripe', provider: stripeProvider },
  { name: 'iyzico', provider: iyzicoProvider },
  { name: 'param', provider: paramProvider }
];

for (const { name, provider } of providers) {
  const checkoutRes = await provider.createCheckoutSession('tenant_x', 'plan_x');
  assert.equal(checkoutRes.error, PAYMENT_DISABLED_ERROR, `${name} must return PAYMENT_PROVIDER_NOT_CONFIGURED`);
  assert.equal(checkoutRes.url, undefined, `${name} must NOT fabricate checkout URL`);
  assert.equal(checkoutRes.sessionId, undefined, `${name} must NOT fabricate session ID`);

  const portalRes = await provider.createBillingPortalSession('tenant_x');
  assert.equal(portalRes.error, PAYMENT_DISABLED_ERROR, `${name} portal must return PAYMENT_PROVIDER_NOT_CONFIGURED`);
  assert.equal(portalRes.url, undefined, `${name} portal must NOT fabricate portal URL`);
}
console.log('✅ Case 5 PASS: All client-side payment adapters return typed disabled errors with zero URLs/IDs.');

// ----------------------------------------------------------------------------
// Final Summary
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('ALL 5 PAYMENT RUN-MODE SAFETY PROPERTIES PASSED (5/5)');
console.log('='.repeat(80));
