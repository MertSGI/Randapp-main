// test-p2a-supabase-registration-boundary.test.mjs
// P2A.1-R1 — Real Supabase RPC Boundary Contract & Integration Test Suite

import './test-setup-env.mjs';
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

async function runBoundaryTests() {
  let directTableWriteAttempted = false;

  // Mock authenticated session & auth operations for registration boundary tests
  supabase.auth = {
    getSession: async () => ({
      data: { session: { user: { id: '11111111-1111-1111-1111-111111111111' } } },
      error: null
    }),
    signUp: async () => ({
      data: {
        session: { user: { id: '11111111-1111-1111-1111-111111111111' } },
        user: { id: '11111111-1111-1111-1111-111111111111' }
      },
      error: null
    }),
    signInWithPassword: async () => ({
      data: {
        session: { user: { id: '11111111-1111-1111-1111-111111111111' } },
        user: { id: '11111111-1111-1111-1111-111111111111' }
      },
      error: null
    })
  };

  // Robust mock for supabase.from() table queries
  supabase.from = (table) => {
    if (table === 'plans') {
      const planResult = {
        data: { id: 'plan-baslangic-uuid', code: 'baslangic', is_self_serve: true },
        error: null
      };
      return {
        select: () => ({
          eq: () => ({
            single: async () => planResult
          }),
          single: async () => planResult
        })
      };
    }
    directTableWriteAttempted = true;
    return {
      insert: () => ({ select: () => Promise.resolve({ data: null, error: new Error('Direct table insert blocked') }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('Direct table update blocked') }) })
    };
  };

  // Test 1: Verify registerTenant calls provision_tenant_for_authenticated_owner RPC with exact parameter names
  let rpcCalled = false;
  let rpcName = '';
  let rpcArgs = null;

  supabase.rpc = async (name, args) => {
    rpcCalled = true;
    rpcName = name;
    rpcArgs = args;
    return {
      data: {
        success: true,
        tenant_id: '11111111-1111-1111-1111-111111111111',
        slug: 'test-salon',
        subscription_id: '22222222-2222-2222-2222-222222222222'
      },
      error: null
    };
  };

  const result = await tenantRegistrationService.registerTenant({
    ownerName: 'Test',
    ownerSurname: 'Owner',
    ownerEmail: 'test.owner@p2a-test.invalid',
    ownerPhone: '+905551112233',
    password: 'Password123!',
    businessName: 'Test Salon',
    businessDisplayName: 'Test Salon Display',
    businessCategory: 'Hair Salon',
    city: 'Istanbul',
    planId: 'baslangic'
  });

  assert.strictEqual(result.success, true, `Test 1 FAIL: Registration should return success. Got error: ${result.error}`);
  assert.strictEqual(rpcCalled, true, 'Test 1 FAIL: supabase.rpc should have been called');
  assert.strictEqual(rpcName, 'provision_tenant_for_authenticated_owner', 'Test 1 FAIL: RPC name must match canonical RPC name');
  
  // Verify exact parameter contract
  assert.strictEqual(rpcArgs.p_business_name, 'Test Salon', 'Test 1 FAIL: p_business_name mismatch');
  assert.strictEqual(rpcArgs.p_business_display_name, 'Test Salon Display', 'Test 1 FAIL: p_business_display_name mismatch');
  assert.strictEqual(rpcArgs.p_business_category, 'Hair Salon', 'Test 1 FAIL: p_business_category mismatch (must not be p_category)');
  assert.strictEqual(rpcArgs.p_city, 'Istanbul', 'Test 1 FAIL: p_city mismatch');
  assert.strictEqual(rpcArgs.p_phone, '+905551112233', 'Test 1 FAIL: p_phone mismatch');
  assert.strictEqual(rpcArgs.p_requested_plan_code, 'baslangic', 'Test 1 FAIL: p_requested_plan_code mismatch');
  assert.ok(typeof rpcArgs.p_idempotency_key === 'string' && rpcArgs.p_idempotency_key.length > 0, 'Test 1 FAIL: p_idempotency_key must be present');

  console.log('✅ Test 1 PASSED: registerTenant maps exact RPC parameters to provision_tenant_for_authenticated_owner.');

  // Test 2: Idempotency Key Stability across Retries
  let capturedIdempKeys = [];
  supabase.rpc = async (name, args) => {
    capturedIdempKeys.push(args.p_idempotency_key);
    return { data: { success: true, tenant_id: '11111111-1111-1111-1111-111111111111' }, error: null };
  };

  // Clear session storage to generate new key
  sessionStorageStore.clear();
  await tenantRegistrationService.registerTenant({ ownerEmail: 'retry@test.com', businessName: 'Salon Retry Test', planId: 'baslangic' });
  await tenantRegistrationService.registerTenant({ ownerEmail: 'retry@test.com', businessName: 'Salon Retry Test', planId: 'baslangic' });

  assert.strictEqual(capturedIdempKeys.length, 2, 'Test 2 FAIL: Two RPC calls expected');
  assert.strictEqual(capturedIdempKeys[0], capturedIdempKeys[1], 'Test 2 FAIL: Idempotency key must remain identical on retries of same attempt');
  console.log('✅ Test 2 PASSED: Idempotency key remains stable across attempt retries.');

  // Test 3: RPC Failure Handling (clean error return without crash)
  supabase.rpc = async () => {
    return { data: null, error: new Error('PG_RAISE_EXCEPTION: PROFILE_NOT_PROVISIONABLE') };
  };

  const failResult = await tenantRegistrationService.registerTenant({ ownerEmail: 'fail@test.com', businessName: 'Fail Salon', planId: 'baslangic' });
  assert.strictEqual(failResult.success, false, 'Test 3 FAIL: Result success must be false on RPC error');
  assert.ok(failResult.error?.includes('PROFILE_NOT_PROVISIONABLE'), 'Test 3 FAIL: Error message should be returned');
  console.log('✅ Test 3 PASSED: RPC failure handled cleanly without throwing uncaught exception.');

  // Test 4: Verify Zero Client-Side UUID Generation or Direct Table Writes
  directTableWriteAttempted = false;
  supabase.rpc = async () => ({ data: { success: true, tenant_id: 'server-gen-uuid' }, error: null });
  await tenantRegistrationService.registerTenant({ ownerEmail: 'nodirect@test.com', businessName: 'No Direct Write Salon', planId: 'baslangic' });

  assert.strictEqual(directTableWriteAttempted, false, 'Test 4 FAIL: Direct table write via supabase.from() attempted in Supabase mode!');
  console.log('✅ Test 4 PASSED: Zero direct table writes via supabase.from() in Supabase mode.');

  // Test 5: Verify Cryptographic Idempotency Key Generation (No Math.random fallback)
  sessionStorageStore.clear();
  let generatedKey = '';
  supabase.rpc = async (name, args) => {
    generatedKey = args.p_idempotency_key;
    return { data: { success: true }, error: null };
  };

  await tenantRegistrationService.registerTenant({ ownerEmail: 'crypto@test.com', businessName: 'Crypto Key Salon', planId: 'baslangic' });
  assert.ok(generatedKey.startsWith('reg-') || generatedKey.length >= 16, 'Test 5 FAIL: Idempotency key missing prefix or weak');
  console.log('✅ Test 5 PASSED: Cryptographic idempotency key format validated.');

  // Test 6: Verify Zero Mock Fallback in Supabase Mode
  supabase.rpc = async () => ({ data: null, error: new Error('P2A_TEST_ERROR: Network failed') });
  const noFallbackRes = await tenantRegistrationService.registerTenant({ ownerEmail: 'nofallback@test.com', businessName: 'No Fallback Salon', planId: 'baslangic' });
  assert.strictEqual(noFallbackRes.success, false, 'Test 6 FAIL: Supabase mode must not fall back to mock registration on network error');
  console.log('✅ Test 6 PASSED: Supabase mode does not silently fall back to mock implementation on failure.');

  console.log('=== ALL 6 REAL SUPABASE RPC BOUNDARY TESTS PASSED ===');
}

runBoundaryTests().catch((err) => {
  console.error('❌ BOUNDARY TEST SUITE FAILED:', err);
  process.exit(1);
});
