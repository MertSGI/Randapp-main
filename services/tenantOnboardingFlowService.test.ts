import assert from 'node:assert/strict';
import { tenantOnboardingFlowService } from './tenantOnboardingFlowService.ts';
import { supabase } from './supabaseClient.ts';
import { STORAGE_KEYS, DYNAMIC_STORAGE_KEYS } from './storageKeys.ts';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

export async function runTenantOnboardingFlowServiceTests() {
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalMode = process.env.VITE_DATA_MODE;
  const originalRpc = supabase.rpc;
  const originalFrom = supabase.from;
  const originalAuth = supabase.auth;

  const memStorage = createMemoryStorage();
  (globalThis as any).localStorage = memStorage;

  try {
    // 1. Local/Mock Mode + storageKeys alignment
    process.env.VITE_DATA_MODE = 'local';
    memStorage.setItem(STORAGE_KEYS.ACTIVE_TENANT_ID, 'tenant_p2a_local_01');

    const localTenantId = await tenantOnboardingFlowService.resolveOwnerTenantId();
    assert.equal(localTenantId, 'tenant_p2a_local_01', 'Local mode resolves ACTIVE_TENANT_ID via STORAGE_KEYS');

    const localState = await tenantOnboardingFlowService.loadOnboardingState();
    assert.ok(localState !== null, 'Local mode loadOnboardingState returns baseline state');
    assert.equal(localState?.tenantId, 'tenant_p2a_local_01');
    assert.equal(localState?.publicSiteStatus, 'draft');

    const localProfileRes = await tenantOnboardingFlowService.saveBusinessProfile({
      businessName: 'P2A Local Salon',
      businessDisplayName: 'P2A Local Salon Display',
    });
    assert.equal(localProfileRes.success, true, 'Local mode saveBusinessProfile succeeds');
    const storedBrandingRaw = memStorage.getItem(DYNAMIC_STORAGE_KEYS.tenantBrandingColon('tenant_p2a_local_01'));
    assert.ok(storedBrandingRaw !== null, 'Local mode writes branding under DYNAMIC_STORAGE_KEYS');

    // 2. Supabase Mode RPC Routing & Zero Fabricated Defaults
    process.env.VITE_DATA_MODE = 'supabase_staging';

    let capturedRpcName = '';
    let capturedRpcArgs: Record<string, any> = {};
    let directTableWriteAttempted = false;

    (supabase as any).rpc = async (name: string, args?: Record<string, any>) => {
      capturedRpcName = name;
      capturedRpcArgs = args || {};
      if (name === 'save_owner_business_profile') {
        return { data: { success: true, salon_info_completed: true }, error: null };
      }
      if (name === 'create_owner_first_branch') {
        return { data: { success: true, branch_id: '11111111-1111-1111-1111-111111111111' }, error: null };
      }
      if (name === 'create_owner_first_service') {
        return { data: { success: true, service_id: '22222222-2222-2222-2222-222222222222' }, error: null };
      }
      if (name === 'create_owner_first_staff') {
        return { data: { success: true, staff_id: '33333333-3333-3333-3333-333333333333' }, error: null };
      }
      if (name === 'get_owner_onboarding_state') {
        return {
          data: {
            tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            onboarding_status: 'ready_for_review',
            public_site_status: 'draft',
            salon_info_completed: true,
            branding_completed: false,
            services_completed: true,
            staff_completed: true,
            calendar_completed: true,
            is_owner_ready_for_review: true,
            next_step_id: null,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `Unknown RPC ${name}` } };
    };

    (supabase as any).from = (table: string) => {
      if (table === 'users_profile') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { tenant_id: 'canonical-tenant-uuid', role: 'tenant_owner' }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: async () => {
          directTableWriteAttempted = true;
          return { error: null };
        },
        update: () => ({
          eq: async () => {
            directTableWriteAttempted = true;
            return { error: null };
          },
        }),
        upsert: async () => {
          directTableWriteAttempted = true;
          return { error: null };
        },
      };
    };

    (supabase as any).auth = {
      getSession: async () => ({ data: { session: { user: { id: 'owner-user-uuid' } } }, error: null }),
    };

    const resolvedSupabaseTenant = await tenantOnboardingFlowService.resolveOwnerTenantId();
    assert.equal(resolvedSupabaseTenant, 'canonical-tenant-uuid', 'Supabase mode resolves tenant from users_profile');

    const profileRes = await tenantOnboardingFlowService.saveBusinessProfile({});
    assert.equal(profileRes.success, true);
    assert.equal(capturedRpcName, 'save_owner_business_profile');
    assert.equal(capturedRpcArgs.p_business_name, null, 'Missing businessName sent as null');
    assert.equal(capturedRpcArgs.p_city, null, 'Missing city sent as null');
    assert.equal(capturedRpcArgs.p_address, null, 'Missing address sent as null');

    const branchRes = await tenantOnboardingFlowService.createFirstBranch({ name: 'Merkez Şube' });
    assert.equal(branchRes.success, true);
    assert.equal(branchRes.branchId, '11111111-1111-1111-1111-111111111111');
    assert.equal(capturedRpcName, 'create_owner_first_branch');
    assert.equal('p_city' in capturedRpcArgs, false, 'createFirstBranch must not fabricate p_city');
    assert.equal('p_address' in capturedRpcArgs, false, 'createFirstBranch must not fabricate p_address');

    const serviceRes = await tenantOnboardingFlowService.createFirstService({ name: 'Kesim', duration: 0, price: 0 });
    assert.equal(serviceRes.success, true);
    assert.equal(capturedRpcName, 'create_owner_first_service');
    assert.equal(capturedRpcArgs.p_duration, 30, 'Duration defaults to 30 when 0');

    const staffRes = await tenantOnboardingFlowService.createFirstStaff({ name: 'Ayşe' });
    assert.equal(staffRes.success, true);
    assert.equal(capturedRpcName, 'create_owner_first_staff');
    assert.deepEqual(capturedRpcArgs.p_work_days, [1, 2, 3, 4, 5, 6]);
    assert.equal(capturedRpcArgs.p_start_time, '09:00:00');
    assert.equal(capturedRpcArgs.p_end_time, '18:00:00');
    assert.equal(directTableWriteAttempted, false, 'Core onboarding mutations must not write directly to tables');

    const readyState = await tenantOnboardingFlowService.loadOnboardingState();
    assert.equal(readyState?.onboardingStatus, 'ready_for_review');
    assert.equal(readyState?.publicSiteStatus, 'draft', 'Storefront remains draft until admin publish');

    // 3. Fail-Closed Behavior on RPC Error & Unauthenticated Session
    (supabase as any).rpc = async () => ({ data: null, error: { message: 'P2A_RPC_FAILURE' } });
    const failedProfile = await tenantOnboardingFlowService.saveBusinessProfile({ businessName: 'Test' });
    assert.equal(failedProfile.success, false, 'Supabase mode fails closed on RPC error');
    assert.equal(failedProfile.error, 'P2A_RPC_FAILURE');

    (supabase as any).auth = {
      getSession: async () => ({ data: { session: null }, error: null }),
    };
    const unauthTenant = await tenantOnboardingFlowService.resolveOwnerTenantId();
    assert.equal(unauthTenant, null, 'Unauthenticated session returns null tenantId');
  } finally {
    process.env.VITE_DATA_MODE = originalMode;
    (globalThis as any).localStorage = originalLocalStorage;
    (supabase as any).rpc = originalRpc;
    (supabase as any).from = originalFrom;
    (supabase as any).auth = originalAuth;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tenantOnboardingFlowService.test.ts')) {
  runTenantOnboardingFlowServiceTests()
    .then(() => {
      console.log('ALL tenantOnboardingFlowService TESTS PASSED');
    })
    .catch((err) => {
      console.error('tenantOnboardingFlowService TESTS FAILED:', err);
      process.exit(1);
    });
}
