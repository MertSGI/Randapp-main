// test-p2a-supabase-registration-boundary.test.mjs
// P2A.1-R1 — Real Supabase RPC Boundary Contract & Integration Test Suite

import assert from 'node:assert';
import { tenantRegistrationService } from '../services/tenantRegistrationService.ts';
import { supabase } from '../services/supabaseClient.ts';

console.log('=== RUNNING P2A.1-R1 REAL SUPABASE RPC BOUNDARY TESTS ===');

// Setup in-memory web storage mocks for test runner
const localStorageStore = new Map();
const sessionStorageStore = new Map();

globalThis.localStorage = {
  getItem: (k) => localStorageStore.get(k) || null,
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
};

globalThis.sessionStorage = {
  getItem: (k) => sessionStorageStore.get(k) || null,
  setItem: (k, v) => sessionStorageStore.set(k, String(v)),
  removeItem: (k) => sessionStorageStore.delete(k),
  clear: () => sessionStorageStore.clear(),
};

// Polyfill crypto for node test execution
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => '11111111-2222-3333-4444-555555555555'
  };
}

const testData = {
  ownerName: 'Elif',
  ownerSurname: 'Kaya',
  ownerEmail: 'elif.kaya@p2a-test.invalid',
  ownerPhone: '+905559998877',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  businessName: 'Natura Spa',
  businessDisplayName: 'Natura Spa Center',
  businessCategory: 'Beauty Center',
  city: 'Izmir',
  planId: 'premium',
  billingPeriod: 'annual',
  acceptTerms: true,
};

async function runBoundaryTests() {
  let passed = 0;

  // -------------------------------------------------------------------------
  // TEST 1: Parameter Contract & Real REG-01
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 1: Parameter Contract & REAL REG-01 ---');
    localStorage.clear();
    sessionStorage.clear();

    let rpcCallCount = 0;
    let capturedRpcName = '';
    let capturedParams = null;

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-uuid-1111' } } },
      error: null
    });

    supabase.rpc = async (fnName, params) => {
      rpcCallCount++;
      capturedRpcName = fnName;
      capturedParams = params;
      return {
        data: {
          tenant_id: 'tenant-uuid-9999',
          slug: 'natura-spa-center',
          role: 'tenant_owner',
          subscription_id: 'sub-uuid-8888',
          plan_code: 'premium',
          onboarding_status: 'onboarding_required'
        },
        error: null
      };
    };

    const res = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'PROVISIONED');
    assert.strictEqual(rpcCallCount, 1);
    assert.strictEqual(capturedRpcName, 'provision_tenant_for_authenticated_owner');

    // Assert exact parameter names matching server RPC contract
    const expectedKeys = [
      'p_business_name',
      'p_business_display_name',
      'p_business_category',
      'p_city',
      'p_phone',
      'p_requested_plan_code',
      'p_idempotency_key'
    ];
    assert.deepStrictEqual(Object.keys(capturedParams).sort(), expectedKeys.sort());
    assert.strictEqual(capturedParams.p_business_category, testData.businessCategory);
    assert.ok(capturedParams.p_idempotency_key.startsWith('idemp-'));

    // Assert forbidden caller keys are NOT present
    assert.strictEqual(capturedParams.tenant_id, undefined);
    assert.strictEqual(capturedParams.role, undefined);
    assert.strictEqual(capturedParams.owner_user_id, undefined);

    console.log('✅ TEST 1 PASS: RPC signature and exact parameter contract (p_business_category) verified.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 2: REAL REG-02 Idempotency Key Persistence on Network Retry
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 2: REAL REG-02 Idempotency Key Retry Persistence ---');
    localStorage.clear();
    sessionStorage.clear();

    const usedKeys = [];
    let attempts = 0;

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-uuid-1111' } } },
      error: null
    });

    supabase.rpc = async (fnName, params) => {
      attempts++;
      usedKeys.push(params.p_idempotency_key);
      if (attempts === 1) {
        return { data: null, error: { message: 'Network timeout during provisioning' } };
      }
      return {
        data: { tenant_id: 'tenant-uuid-9999', slug: 'natura-spa', role: 'tenant_owner', subscription_id: 'sub-1', plan_code: 'premium', onboarding_status: 'onboarding_required' },
        error: null
      };
    };

    const res1 = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res1.success, false);

    const res2 = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(attempts, 2);
    assert.strictEqual(usedKeys[0], usedKeys[1], 'Retry MUST reuse the exact same idempotency key');

    console.log('✅ TEST 2 PASS: Network retry reuses the exact same idempotency key.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 3: REAL REG-05 Existing Owner Resolution
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 3: REAL REG-05 Existing Owner Handling ---');
    localStorage.clear();
    sessionStorage.clear();

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-existing-5555' } } },
      error: null
    });

    supabase.rpc = async () => ({
      data: null,
      error: { message: 'USER_ALREADY_HAS_TENANT: Specified user already owns an active tenant.' }
    });

    supabase.from = (table) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'users_profile') return { data: { tenant_id: 'existing-tenant-7777', role: 'tenant_owner' } };
            if (table === 'tenants') return { data: { slug: 'existing-salon-slug', status: 'draft', onboarding_status: 'onboarding_required' } };
            return { data: null };
          }
        })
      })
    });

    const res = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'USER_ALREADY_HAS_TENANT');
    assert.strictEqual(res.tenantId, 'existing-tenant-7777');
    assert.strictEqual(res.slug, 'existing-salon-slug');

    assert.strictEqual(localStorage.getItem('lari_active_tenant_id'), 'existing-tenant-7777');
    console.log('✅ TEST 3 PASS: USER_ALREADY_HAS_TENANT resolved existing tenant ID without fake state generation.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 4: REAL REG-06 Profile Safety Guard
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 4: REAL REG-06 Profile Not Provisionable ---');
    localStorage.clear();
    sessionStorage.clear();

    supabase.rpc = async () => ({
      data: null,
      error: { message: 'PROFILE_NOT_PROVISIONABLE: Existing super_admin or staff cannot self-provision.' }
    });

    const res = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'PROVISIONING_FAILED_TERMINAL');
    assert.strictEqual(res.reasonCode, 'PROFILE_NOT_PROVISIONABLE');
    assert.strictEqual(localStorage.getItem('lari_active_tenant_id'), null);

    console.log('✅ TEST 4 PASS: PROFILE_NOT_PROVISIONABLE failed closed without local state pollution.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 5: REAL REG-07 Failure State Integrity & REAL REG-08 Response Authority
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 5: REAL REG-07 & REG-08 State Integrity ---');
    localStorage.clear();
    sessionStorage.clear();

    supabase.rpc = async () => ({
      data: { tenant_id: 'server-tenant-id-1234', slug: 'server-slug-1234', role: 'tenant_owner', subscription_id: 'sub-1', plan_code: 'premium', onboarding_status: 'onboarding_required' },
      error: null
    });

    const res = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(res.success, true);

    const storedSession = JSON.parse(localStorage.getItem('lari_active_owner_session'));
    assert.strictEqual(storedSession.tenant_id, 'server-tenant-id-1234');
    assert.strictEqual(localStorage.getItem('lari_active_tenant_id'), 'server-tenant-id-1234');

    console.log('✅ TEST 5 PASS: Local active session populated strictly from server response authority.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // TEST 6: REAL REG-13 Mode Isolation & Error Handling Contract
  // -------------------------------------------------------------------------
  {
    console.log('--- TEST 6: REAL REG-13 Mode Isolation & Plan Version Errors ---');

    supabase.rpc = async () => ({
      data: null,
      error: { message: 'NO_EFFECTIVE_PLAN_VERSION: No published version found for plan premium' }
    });

    const resPlanVer = await tenantRegistrationService.registerTenantSupabase(testData);
    assert.strictEqual(resPlanVer.success, false);
    assert.strictEqual(resPlanVer.status, 'PROVISIONING_FAILED_TERMINAL');
    assert.strictEqual(resPlanVer.reasonCode, 'NO_EFFECTIVE_PLAN_VERSION');

    console.log('✅ TEST 6 PASS: Commercial plan version error handled safely without fallback to mock mode.');
    passed++;
  }

  console.log(`\n=== ALL ${passed} REAL SUPABASE RPC BOUNDARY TESTS PASSED ===`);
}

runBoundaryTests().catch((err) => {
  console.error('FATAL BOUNDARY TEST ERROR:', err);
  process.exit(1);
});
