// test-p2a-mock-registration-regression.test.mjs
// P2A.1-R1 — Mock Registration Mode Regression Suite

import assert from 'node:assert';
import { tenantRegistrationService } from '../services/tenantRegistrationService.ts';
import { planService } from '../services/planService.ts';

console.log('=== RUNNING P2A.1 MOCK REGISTRATION REGRESSION SUITE ===');

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

const validData = {
  ownerName: 'Deniz',
  ownerSurname: 'Demir',
  ownerEmail: 'deniz.demir@p2a-test.invalid',
  ownerPhone: '+905553332211',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  businessName: 'Deniz Kuaför',
  businessDisplayName: 'Deniz Kuaför Salonu',
  businessCategory: 'Hair Salon',
  city: 'Ankara',
  planId: 'baslangic',
  billingPeriod: 'monthly',
  acceptTerms: true,
};

async function runMockRegressionTests() {
  let passed = 0;

  // -------------------------------------------------------------------------
  // MOCK TEST 1: Mock Registration Execution
  // -------------------------------------------------------------------------
  {
    console.log('--- MOCK TEST 1: Mock Mode Execution & Local Handoff ---');
    localStorage.clear();
    sessionStorage.clear();

    const result = await tenantRegistrationService.registerTenantMock(validData);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'PROVISIONED');
    assert.ok(result.tenantId);
    assert.strictEqual(result.role, 'tenant_owner');
    assert.strictEqual(result.onboardingStatus, 'onboarding_required');

    const storedActiveTenantId = localStorage.getItem('lari_active_tenant_id');
    assert.strictEqual(storedActiveTenantId, result.tenantId);

    console.log('✅ MOCK TEST 1 PASS: Mock mode registration succeeded and stored local owner session.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // MOCK TEST 2: Mock Error Isolation
  // -------------------------------------------------------------------------
  {
    console.log('--- MOCK TEST 2: Invalid Plan Error Isolation ---');
    localStorage.clear();
    sessionStorage.clear();

    const invalidResult = await tenantRegistrationService.registerTenant({ ...validData, planId: 'invalid_code' });
    assert.strictEqual(invalidResult.success, false);
    assert.strictEqual(invalidResult.reasonCode, 'PLAN_NOT_ASSIGNABLE');
    assert.strictEqual(localStorage.getItem('lari_active_tenant_id'), null);

    console.log('✅ MOCK TEST 2 PASS: Invalid plan code blocked without local storage state pollution.');
    passed++;
  }

  console.log(`\n=== ALL ${passed} MOCK REGISTRATION REGRESSION TESTS PASSED ===`);
}

runMockRegressionTests().catch((err) => {
  console.error('FATAL MOCK TEST ERROR:', err);
  process.exit(1);
});
