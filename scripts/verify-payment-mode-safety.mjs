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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// Setup headless mock environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.window.location = {
  protocol: 'https:',
  host: 'staging.lari.app',
  hostname: 'staging.lari.app',
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
// Test 6: Persistent Supabase Mode & Provider Operational Fail-Closed Contracts
// ----------------------------------------------------------------------------
console.log('\n[Case 6] Testing persistent Supabase mode blockers & provider server authority contract...');
process.env.VITE_DATA_SOURCE = 'supabase';
delete process.env.VITE_PAYMENT_RUN_MODE;
localStorage.removeItem('internal_run_mode');

const persistentDryRun = paymentRunModeService.getStatus();
assert.equal(persistentDryRun.isPersistentDatabaseMode, true, 'Must report persistent Supabase mode');
assert.equal(persistentDryRun.serverAuthorityRequired, true, 'Persistent mode must require server authority');
assert.equal(persistentDryRun.isPaymentCollectionAuthorized, false, 'Persistent mode cannot authorize client collection');
assert.ok(persistentDryRun.missingBlockers.length > 0, 'Persistent mode must expose honest blocker notice');
delete process.env.VITE_DATA_SOURCE;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-paycfg-'));
const tempBundle = path.join(tempDir, 'paycfg.mjs');
try {
  const buildRes = esbuild.buildSync({
    entryPoints: [path.join(process.cwd(), 'services', 'paymentProviderConfigService.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node'
  });
  fs.writeFileSync(tempBundle, buildRes.outputFiles[0].text, 'utf8');
  const { paymentProviderConfigService } = await import(pathToFileURL(tempBundle).href);

  const authority = paymentProviderConfigService.getServerAuthorityContract('iyzico');
  assert.equal(authority.webhookSignatureHeader, 'x-iyz-signature-v3');
  assert.equal(authority.isServerWebhookVerificationRequired, true);
  assert.equal(authority.clientAuthorizationAllowed, false);

  const contract = paymentProviderConfigService.getProviderOperationalContract(persistentDryRun);
  assert.equal(contract.isLiveAuthorized, false);
  assert.equal(contract.canCollectRealPayments, false);
  assert.equal(contract.providerInteroperability, 'EXTERNAL_PROVIDER_VERIFICATION_PENDING');
  assert.ok(contract.blockers.length >= 2, 'Operational contract must list fail-closed blockers');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log('✅ Case 6 PASS: Persistent mode & provider operational contracts enforce server authority fail-closed.');

// ----------------------------------------------------------------------------
// Test 7: BillingTab Payment Run Mode & Tax/Invoice Adapter Integration Check
// ----------------------------------------------------------------------------
console.log('\n[Case 7] Verifying BillingTab uses paymentRunModeService, provider contract & invoice fail-closed status...');
const billingTabSrc = fs.readFileSync(path.join(process.cwd(), 'components', 'BillingTab.tsx'), 'utf8');
assert.ok(
  billingTabSrc.includes('paymentRunModeService.getStatus()') &&
    billingTabSrc.includes('paymentProviderConfigService.getProviderOperationalContract') &&
    billingTabSrc.includes('businessProfileService.getInvoiceAdapterStatus'),
  'BillingTab must consume paymentRunModeService, paymentProviderConfigService, and businessProfileService'
);
assert.ok(
  !billingTabSrc.includes('Kart doğrulama adımı başarıyla tamamlandı'),
  'BillingTab mock simulation must not emit fake card verification success copy'
);
assert.ok(
  !billingTabSrc.includes('Ödeme başarıyla doğrulandı.'),
  'BillingTab checkout_simulate must not emit fake payment verification success copy'
);
const checkoutSimMatch = billingTabSrc.match(/if \(urlParams\.get\('checkout_simulate'\) === 'true'\) \{([\s\S]*?)\n  \}/);
assert.ok(checkoutSimMatch, 'BillingTab must handle checkout_simulate branch explicitly');
const checkoutSimBlock = checkoutSimMatch[1];
assert.ok(
  checkoutSimBlock.includes('paymentRunModeService.getStatus()') &&
    checkoutSimBlock.includes('isPersistentDatabaseMode') &&
    checkoutSimBlock.includes("mode !== 'local_dry_run'"),
  'BillingTab checkout_simulate branch must re-check paymentRunModeService.getStatus() and reject persistent/live modes'
);
assert.ok(
  !billingTabSrc.includes('markReferralTrialStarted'),
  'BillingTab must never trigger client-side markReferralTrialStarted from URL/checkout callbacks'
);
const checkoutSuccessMatch = billingTabSrc.match(/if \(urlParams\.get\('checkout'\) === 'success'\) \{([\s\S]*?)\n  \}/);
assert.ok(checkoutSuccessMatch, 'BillingTab must handle checkout=success branch explicitly');
const checkoutSuccessBlock = checkoutSuccessMatch[1];
assert.ok(
  checkoutSuccessBlock.includes("outcome: 'verification_pending'") &&
    checkoutSuccessBlock.includes('checkoutMessage: null') &&
    !checkoutSuccessBlock.includes('checkout_success_msg') &&
    !checkoutSuccessBlock.includes('markReferralTrialStarted'),
  'BillingTab checkout=success URL branch must fail closed into verification_pending without success assertion or referral mutation'
);
console.log('✅ Case 7 PASS: BillingTab payment mode, invoice status, and checkout URL fail-closed bindings verified.');

// ----------------------------------------------------------------------------
// Test 8: BillingTab checkout=success Runtime Verification (Supabase/Persistent vs Verified Snapshot)
// ----------------------------------------------------------------------------
console.log('\n[Case 8] Testing BillingTab checkout=success fail-closed behavior in persistent/Supabase mode...');

globalThis.__LARI_BILLING_TEST__ = {
  dataMode: 'supabase',
  markReferralCalls: 0,
  rpcCalls: [],
  rpcHandler: async () => ({ data: null, error: null }),
  replaceStateCalls: [],
  hookStates: [],
  pendingEffects: []
};

const billingTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-billingtab-'));
const billingTempBundle = path.join(billingTempDir, 'billingtab.mjs');

const prevWindowLocation = globalThis.window.location;
const prevWindowHistory = globalThis.window.history;

try {
  const billingMockPlugin = {
    name: 'mock-billingtab-deps',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'mock-react', namespace: 'lari-billing' }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'mock-jsx', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])LanguageContext(?:\.tsx)?$/ }, () => ({ path: 'mock-lang', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])TenantContext(?:\.tsx)?$/ }, () => ({ path: 'mock-tenant', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])CheckoutPreviewModal(?:\.tsx)?$/ }, () => ({ path: 'mock-modal', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])supabaseClient(?:\.ts)?$/ }, () => ({ path: 'mock-supa', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])dataSourceConfig(?:\.ts)?$/ }, () => ({ path: 'mock-dsc', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])referralProgramService(?:\.ts)?$/ }, () => ({ path: 'mock-ref', namespace: 'lari-billing' }));
      build.onResolve({ filter: /(?:^|[\\/])repositories(?:\.ts)?$/ }, () => ({ path: 'mock-repo', namespace: 'lari-billing' }));

      build.onLoad({ filter: /^mock-react$/, namespace: 'lari-billing' }, () => ({
        contents: `
          const reactMock = {
            useState(initial) {
              const s = globalThis.__LARI_BILLING_TEST__;
              const idx = s.hookStates.length;
              s.hookStates.push(initial);
              const setter = (val) => {
                s.hookStates[idx] = typeof val === 'function' ? val(s.hookStates[idx]) : val;
              };
              return [s.hookStates[idx], setter];
            },
            useRef(initial) {
              return { current: initial };
            },
            useEffect(fn) {
              globalThis.__LARI_BILLING_TEST__.pendingEffects.push(fn);
            }
          };
          export const useState = reactMock.useState;
          export const useRef = reactMock.useRef;
          export const useEffect = reactMock.useEffect;
          export default reactMock;
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-jsx$/, namespace: 'lari-billing' }, () => ({
        contents: `
          export const jsx = () => ({});
          export const jsxs = () => ({});
          export const Fragment = 'Fragment';
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-lang$/, namespace: 'lari-billing' }, () => ({
        contents: `export const useLanguage = () => ({ language: 'tr' });`,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-tenant$/, namespace: 'lari-billing' }, () => ({
        contents: `export const useTenant = () => ({ tenant: { id: 'tenant-1', name: 'Test Salon' } });`,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-modal$/, namespace: 'lari-billing' }, () => ({
        contents: `export const CheckoutPreviewModal = () => null;`,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-supa$/, namespace: 'lari-billing' }, () => ({
        contents: `
          const queryChain = () => ({
            select: () => queryChain(),
            eq: () => queryChain(),
            maybeSingle: async () => ({ data: null, error: null }),
            count: 0
          });
          export const supabase = {
            rpc: async (name, args) => {
              globalThis.__LARI_BILLING_TEST__.rpcCalls.push({ name, args });
              return globalThis.__LARI_BILLING_TEST__.rpcHandler(name, args);
            },
            from: () => queryChain()
          };
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-dsc$/, namespace: 'lari-billing' }, () => ({
        contents: `
          export function getDataSourceMode() {
            return globalThis.__LARI_BILLING_TEST__.dataMode;
          }
          export const dataSourceConfig = { get mode() { return getDataSourceMode(); } };
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-ref$/, namespace: 'lari-billing' }, () => ({
        contents: `
          export const referralProgramService = {
            markReferralTrialStarted: () => { globalThis.__LARI_BILLING_TEST__.markReferralCalls += 1; },
            listReferralRewards: () => []
          };
        `,
        loader: 'js'
      }));
      build.onLoad({ filter: /^mock-repo$/, namespace: 'lari-billing' }, () => ({
        contents: `
          export function getBusinessProfileRepository() {
            return {
              getBusinessProfile: async () => null,
              updateBusinessProfile: async () => null,
              getPublicBusinessProfile: async () => null,
              getPublicBusinessProfileBySlug: async () => null
            };
          }
        `,
        loader: 'js'
      }));
    }
  };

  const billingBuild = await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'components', 'BillingTab.tsx')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [billingMockPlugin]
  });
  fs.writeFileSync(billingTempBundle, billingBuild.outputFiles[0].text, 'utf8');
  const billingMod = await import(pathToFileURL(billingTempBundle).href);

  const waitForBillingReady = async (timeoutMs = 1500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const hasRpc = globalThis.__LARI_BILLING_TEST__.rpcCalls.some(
        (c) => c.name === 'get_my_commercial_subscription_snapshot'
      );
      const loadingDone = globalThis.__LARI_BILLING_TEST__.hookStates[4] === false;
      if (hasRpc && loadingDone) {
        return;
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('Timed out waiting for BillingTab loadBillingData to finish');
  };

  // 8A. Persistent Supabase mode with checkout=success & NO verified server snapshot -> pending notice ONLY, zero success, zero referral mutation
  process.env.VITE_DATA_SOURCE = 'supabase';
  globalThis.__LARI_BILLING_TEST__.dataMode = 'supabase';
  globalThis.__LARI_BILLING_TEST__.markReferralCalls = 0;
  globalThis.__LARI_BILLING_TEST__.rpcCalls = [];
  globalThis.__LARI_BILLING_TEST__.rpcHandler = async () => ({ data: null, error: null });
  globalThis.__LARI_BILLING_TEST__.replaceStateCalls = [];
  globalThis.__LARI_BILLING_TEST__.hookStates = [];
  globalThis.__LARI_BILLING_TEST__.pendingEffects = [];

  globalThis.window.location = {
    ...prevWindowLocation,
    pathname: '/',
    search: '',
    hash: '#/admin?tab=abonelik&checkout=success'
  };
  globalThis.window.history = {
    replaceState: (_s, _t, url) => {
      globalThis.__LARI_BILLING_TEST__.replaceStateCalls.push(url);
      if (typeof url === 'string' && url.includes('#')) {
        globalThis.window.location.hash = '#' + url.split('#')[1];
      }
    }
  };

  billingMod.BillingTab({});
  for (const eff of globalThis.__LARI_BILLING_TEST__.pendingEffects) {
    eff();
  }
  await waitForBillingReady();

  assert.equal(
    globalThis.__LARI_BILLING_TEST__.markReferralCalls,
    0,
    'checkout=success in persistent Supabase mode MUST NOT call markReferralTrialStarted'
  );
  assert.ok(
    globalThis.__LARI_BILLING_TEST__.rpcCalls.some((c) => c.name === 'get_my_commercial_subscription_snapshot'),
    'checkout=success in persistent Supabase mode must query server commercial snapshot via loadBillingData'
  );
  const stateStringsUnverified = globalThis.__LARI_BILLING_TEST__.hookStates.filter((v) => typeof v === 'string');
  assert.ok(
    !stateStringsUnverified.some((s) => s.includes('Ödeme başarıyla tamamlandı') || s.includes('Aboneliğiniz güncellendi')),
    'checkout=success without verified server snapshot must NOT emit payment success message'
  );
  assert.ok(
    stateStringsUnverified.some((s) => s.includes('sunucu doğrulaması bekleniyor')),
    'checkout=success without verified server snapshot must display server-verification-pending notice'
  );

  // 8B. Negative test: pending_checkout or tenant mismatch snapshot fails closed
  globalThis.__LARI_BILLING_TEST__.rpcHandler = async () => ({
    data: {
      success: true,
      tenant_id: 'tenant-1',
      status: 'pending_checkout'
    },
    error: null
  });
  const pendingRes = await billingMod.verifyCheckoutWithServerSnapshot({ tenantId: 'tenant-1', language: 'tr' });
  assert.equal(pendingRes.verified, false, 'pending_checkout snapshot must fail closed');
  assert.equal(pendingRes.checkoutMessage, null);
  assert.ok(pendingRes.checkoutPendingNotice?.includes('sunucu doğrulaması bekleniyor'));

  globalThis.__LARI_BILLING_TEST__.rpcHandler = async () => ({
    data: {
      success: true,
      tenant_id: 'tenant-other',
      status: 'active',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString()
    },
    error: null
  });
  const mismatchRes = await billingMod.verifyCheckoutWithServerSnapshot({ tenantId: 'tenant-1', language: 'tr' });
  assert.equal(mismatchRes.verified, false, 'Mismatched tenant_id snapshot must fail closed');
  assert.equal(mismatchRes.checkoutMessage, null);

  // 8C. Regression test: eligible generic subscription snapshots (without checkout-correlated server attestation)
  // MUST remain pending/neutral, NEVER set verified=true, and NEVER emit payment-verified copy
  const futureIso = new Date(Date.now() + 86_400_000).toISOString();
  for (const genericStatus of ['active', 'manual_active', 'comped', 'trialing']) {
    globalThis.__LARI_BILLING_TEST__.rpcHandler = async () => ({
      data: {
        success: true,
        tenant_id: 'tenant-1',
        status: genericStatus,
        ...(genericStatus === 'trialing' ? { trial_end: futureIso } : { current_period_end: futureIso })
      },
      error: null
    });
    const genericRes = await billingMod.verifyCheckoutWithServerSnapshot({ tenantId: 'tenant-1', language: 'tr' });
    assert.equal(
      genericRes.verified,
      false,
      `Eligible generic snapshot (${genericStatus}) must NEVER set verified=true without checkout-correlated server attestation`
    );
    assert.equal(
      genericRes.checkoutMessage,
      null,
      `Eligible generic snapshot (${genericStatus}) must NEVER emit payment-verified copy`
    );
    assert.ok(
      genericRes.checkoutPendingNotice?.includes('sunucu doğrulaması bekleniyor'),
      `Eligible generic snapshot (${genericStatus}) must remain pending/neutral`
    );
  }

  globalThis.__LARI_BILLING_TEST__.rpcHandler = async () => ({
    data: {
      success: true,
      tenant_id: 'tenant-1',
      status: 'active',
      current_period_end: futureIso
    },
    error: null
  });
  globalThis.__LARI_BILLING_TEST__.markReferralCalls = 0;
  globalThis.__LARI_BILLING_TEST__.rpcCalls = [];
  globalThis.__LARI_BILLING_TEST__.hookStates = [];
  globalThis.__LARI_BILLING_TEST__.pendingEffects = [];
  globalThis.window.location.hash = '#/admin?tab=abonelik&checkout=success';

  billingMod.BillingTab({});
  for (const eff of globalThis.__LARI_BILLING_TEST__.pendingEffects) {
    eff();
  }
  await waitForBillingReady();

  assert.equal(
    globalThis.__LARI_BILLING_TEST__.markReferralCalls,
    0,
    'BillingTab must never mutate client-side referral ledger from checkout=success'
  );
  const stateStringsGenericActive = globalThis.__LARI_BILLING_TEST__.hookStates.filter((v) => typeof v === 'string');
  assert.ok(
    !stateStringsGenericActive.some(
      (s) =>
        s.includes('Ödeme sunucu tarafından doğrulandı') ||
        s.includes('Aboneliğiniz güncellendi') ||
        s.includes('Ödeme başarıyla tamamlandı')
    ),
    'BillingTab must NOT emit payment-verified copy for an eligible generic subscription snapshot'
  );
  assert.ok(
    stateStringsGenericActive.some((s) => s.includes('sunucu doğrulaması bekleniyor')),
    'BillingTab must remain in pending/neutral verification state without checkout-correlated server attestation'
  );
} finally {
  delete process.env.VITE_DATA_SOURCE;
  globalThis.window.location = prevWindowLocation;
  globalThis.window.history = prevWindowHistory;
  fs.rmSync(billingTempDir, { recursive: true, force: true });
}
console.log('✅ Case 8 PASS: BillingTab checkout=success fail-closed and server-verified resolution verified.');

// ----------------------------------------------------------------------------
// Final Summary
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('ALL 8 PAYMENT RUN-MODE SAFETY PROPERTIES PASSED (8/8)');
console.log('='.repeat(80));
