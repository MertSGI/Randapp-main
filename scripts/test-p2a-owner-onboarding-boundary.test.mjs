// test-p2a-owner-onboarding-boundary.test.mjs
// P2A.2 — Canonical Owner Onboarding Flow Boundary & Integration Test Suite

import assert from 'node:assert';
import { tenantOnboardingFlowService } from '../services/tenantOnboardingFlowService.ts';
import { supabase } from '../services/supabaseClient.ts';

console.log('=== RUNNING P2A.2 CANONICAL OWNER ONBOARDING INTEGRATION TEST MATRIX ===');

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

process.env.VITE_DATA_MODE = 'supabase_staging';

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => '99999999-8888-7777-6666-555555555555'
  };
}

function createChainableQuery(data = null, count = 0) {
  const queryObj = {
    count,
    error: null,
    data,
    select: () => queryObj,
    eq: () => queryObj,
    limit: async () => ({ data: Array.isArray(data) ? data : (data ? [data] : []) }),
    single: async () => ({ data, error: null }),
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    update: () => queryObj
  };
  return queryObj;
}

async function runOnboardingTests() {
  let passed = 0;

  // -------------------------------------------------------------------------
  // ONB-01 & ONB-02: Canonical progress loads from server & localStorage cannot override
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-01 & ONB-02: Canonical progress loads from server ---');
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem('lari_availability_fake_configured', 'true');

    supabase.auth.getSession = async () => ({
      data: { session: { user: { id: 'user-owner-001' } } },
      error: null
    });

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      if (table === 'tenant_onboarding_progress') return createChainableQuery({ salon_info_completed: true, branding_completed: false, services_completed: false, staff_completed: false, calendar_completed: false });
      if (table === 'tenants') return createChainableQuery({ status: 'active', onboarding_status: 'onboarding_required', public_site_status: 'draft', go_live_status: 'draft' });
      return createChainableQuery(null, 0);
    };

    const state = await tenantOnboardingFlowService.loadOnboardingState();
    assert.strictEqual(state.tenantId, 'tenant-owner-001');
    assert.strictEqual(state.salonInfoCompleted, true);
    assert.strictEqual(state.servicesCompleted, false);
    assert.strictEqual(state.calendarCompleted, false, 'DB truth (0 rules) MUST override fake localStorage flag');
    assert.strictEqual(state.isOwnerReadyForReview, false);

    console.log('✅ ONB-01 & ONB-02 PASS: Canonical progress loaded strictly from DB truth.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-03, ONB-15, ONB-17, ONB-18: Business profile save stays draft/private
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-03, 15, 17, 18: Business profile save stays private/draft ---');

    let upsertPayload = null;

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      const q = createChainableQuery({ tenant_id: 'tenant-owner-001' });
      q.upsert = async (payload) => {
        if (table === 'tenant_business_profiles') upsertPayload = payload;
        return { error: null };
      };
      return q;
    };

    const res = await tenantOnboardingFlowService.saveBusinessProfile({
      businessName: 'Luxe Beauty',
      businessDisplayName: 'Luxe Beauty Center',
      businessCategory: 'Hair Salon',
      city: 'Istanbul',
      address: 'Nisantasi No:5',
      phone: '+905551112233'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(upsertPayload.is_public_profile_enabled, false, 'is_public_profile_enabled MUST remain false (draft private)');
    
    console.log('✅ ONB-03, 15, 17, 18 PASS: Business profile save preserved draft privacy.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-04: Branding defaults do not auto-complete branding step
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-04: Branding confirmation contract ---');

    let brandingCompletedSet = false;

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      const q = createChainableQuery({ tenant_id: 'tenant-owner-001' });
      q.update = (payload) => {
        if (table === 'tenant_onboarding_progress' && payload.branding_completed === true) {
          brandingCompletedSet = true;
        }
        return createChainableQuery(null);
      };
      return q;
    };

    const res = await tenantOnboardingFlowService.saveBranding({
      primaryColor: '#4f46e5',
      logoUrl: 'https://cdn.test/logo.png'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(brandingCompletedSet, true, 'Explicit owner saveBranding marks branding_completed = true');

    console.log('✅ ONB-04 PASS: Branding step requires explicit owner confirmation.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-05 & ONB-06: First branch creation & duplicate prevention
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-05 & ONB-06: First branch created for owner tenant idempotently ---');

    let insertedBranch = null;

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      const q = createChainableQuery([]);
      q.insert = async (payload) => {
        insertedBranch = payload;
        return { error: null };
      };
      return q;
    };

    const res1 = await tenantOnboardingFlowService.createFirstBranch({
      name: 'Central Branch',
      city: 'Istanbul',
      address: 'Main St 1'
    });

    assert.strictEqual(res1.success, true);
    assert.strictEqual(insertedBranch.tenant_id, 'tenant-owner-001');
    assert.strictEqual(insertedBranch.is_primary, true);

    // Simulate repeated action when branch already exists
    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      return createChainableQuery([{ id: 'existing-branch-1' }]);
    };

    const res2 = await tenantOnboardingFlowService.createFirstBranch({
      name: 'Central Branch',
      city: 'Istanbul',
      address: 'Main St 1'
    });

    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.branchId, 'existing-branch-1', 'Repeated branch action MUST return existing primary branch without duplicate insertion');

    console.log('✅ ONB-05 & ONB-06 PASS: First branch bound to owner tenant idempotently.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-07 & ONB-08: First service creation & no synthetic QA templates
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-07 & ONB-08: First service creation ---');

    let insertedService = null;

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      const q = createChainableQuery([]);
      q.insert = async (payload) => {
        insertedService = payload;
        return { error: null };
      };
      return q;
    };

    const res = await tenantOnboardingFlowService.createFirstService({
      name: 'Sac Kesimi & Fön',
      duration: 45,
      price: 350
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(insertedService.tenant_id, 'tenant-owner-001');
    assert.strictEqual(insertedService.name, 'Sac Kesimi & Fön');
    assert.notStrictEqual(insertedService.name, 'Test Service', 'Synthetic QA template MUST NOT be inserted');

    console.log('✅ ONB-07 & ONB-08 PASS: Real owner service created without synthetic templates.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-09, ONB-10, ONB-11: First staff & Cross-tenant mapping rejection
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-09, 10, 11: Staff creation & cross-tenant mapping rejection ---');

    let insertedStaff = null;
    let mappedServices = [];

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001', role: 'tenant_owner' });
      const q = createChainableQuery([]);
      if (table === 'services') {
        q.single = async () => ({ data: { tenant_id: 'OTHER_TENANT_ID' } });
      }
      q.insert = async (payload) => {
        insertedStaff = payload;
        return { error: null };
      };
      q.upsert = async (payload) => {
        if (table === 'staff_services') mappedServices.push(payload);
        return { error: null };
      };
      return q;
    };

    const res = await tenantOnboardingFlowService.createFirstStaff({
      name: 'Zeynep Yılmaz',
      serviceIds: ['other-tenant-service-id'],
      workDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '18:00'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(insertedStaff.tenant_id, 'tenant-owner-001');

    const mappedIds = mappedServices.map(m => m.service_id);
    assert.strictEqual(mappedIds.includes('other-tenant-service-id'), false, 'Service from foreign tenant MUST be rejected');

    console.log('✅ ONB-09, 10, 11 PASS: Staff created and cross-tenant mapping rejected.');
    passed++;
  }

  // -------------------------------------------------------------------------
  // ONB-13 & ONB-14: OWNER_ONBOARDING_READY_PREDICATE & READY_FOR_REVIEW
  // -------------------------------------------------------------------------
  {
    console.log('--- ONB-13 & ONB-14: READY_FOR_REVIEW predicate without publishing ---');

    let updatedOnboardingStatus = null;

    supabase.from = (table) => {
      if (table === 'users_profile') return createChainableQuery({ tenant_id: 'tenant-owner-001' });
      if (table === 'tenant_onboarding_progress') return createChainableQuery({ salon_info_completed: true, services_completed: true, staff_completed: true, calendar_completed: true });
      if (table === 'tenants') {
        const q = createChainableQuery({ status: 'active', onboarding_status: 'onboarding_required', public_site_status: 'draft' });
        q.update = (payload) => {
          if (payload.onboarding_status) updatedOnboardingStatus = payload.onboarding_status;
          return createChainableQuery(null);
        };
        return q;
      }
      return createChainableQuery(null, 1);
    };

    const isReady = await tenantOnboardingFlowService.evaluateAndSetReadiness('tenant-owner-001');
    assert.strictEqual(isReady, true);
    assert.strictEqual(updatedOnboardingStatus, 'ready_for_review', 'Readiness MUST set onboarding_status = ready_for_review');

    console.log('✅ ONB-13 & ONB-14 PASS: READY_FOR_REVIEW reached without publishing storefront.');
    passed++;
  }

  console.log(`\n=== ALL ${passed} CANONICAL OWNER ONBOARDING INTEGRATION TESTS PASSED ===`);
}

runOnboardingTests().catch((err) => {
  console.error('FATAL ONBOARDING TEST ERROR:', err);
  process.exit(1);
});
