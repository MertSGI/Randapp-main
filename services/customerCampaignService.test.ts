import assert from 'node:assert/strict';
import { customerCampaignService } from './customerCampaignService.ts';
import { entitlementService } from './entitlementService.ts';
import { STORAGE_KEYS } from './storageKeys.ts';

function installLocalStorageShim(): Map<string, string> {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  (globalThis as any).localStorage = mockStorage;
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = { localStorage: mockStorage };
  } else {
    (globalThis as any).window.localStorage = mockStorage;
  }
  return store;
}

export async function runCustomerCampaignServiceTests(): Promise<void> {
  const store = installLocalStorageShim();
  const prevDataMode = process.env.VITE_DATA_MODE;
  const origCanTenantUseFeature = entitlementService.canTenantUseFeature.bind(entitlementService);

  try {
    // 1. Local mode enforces tenant plan entitlements (baslangic fails closed, professional passes)
    process.env.VITE_DATA_MODE = 'local';
    const tenantBaslangic = 't-baslangic-001';
    const tenantPro = 't-professional-001';

    store.set(
      STORAGE_KEYS.REGISTERED_TENANTS,
      JSON.stringify([
        { id: tenantBaslangic, slug: 'baslangic', name: 'Baslangic Salon', planId: 'baslangic', status: 'active' },
        { id: tenantPro, slug: 'pro', name: 'Pro Salon', planId: 'professional', status: 'active' },
      ])
    );

    await assert.rejects(
      () =>
        customerCampaignService.createCampaign(tenantBaslangic, {
          name: 'Blocked Starter Campaign',
          type: 'discount',
          customerReward: '%15 indirim',
          referredCustomerReward: '%10 indirim',
        }),
      /Bu özellik mevcut paketinizde yer almıyor/
    );

    const proCampaign = await customerCampaignService.createCampaign(tenantPro, {
      name: 'Pro VIP Campaign',
      type: 'refer_friend',
      customerReward: '%15 indirim',
      referredCustomerReward: '%10 indirim',
    });
    assert.equal(proCampaign.tenantId, tenantPro);
    assert.equal(proCampaign.isActive, true);

    const proCampaigns = await customerCampaignService.listCampaigns(tenantPro);
    assert.equal(proCampaigns.length, 1);
    assert.equal(proCampaigns[0].id, proCampaign.id);

    // 2. Referral completion & reward lifecycle verify entitlement asynchronously before mutating state
    const starterReferral = await customerCampaignService.createCustomerReferral(tenantBaslangic, {
      id: 'ref-starter-001',
      campaignId: 'default',
      referrerCustomerId: 'cust-starter-1',
      referredCustomerName: 'Deneme Müşteri',
      status: 'pending',
    });
    await assert.rejects(
      () => customerCampaignService.markReferralCompleted(starterReferral.id),
      /Bu özellik mevcut paketinizde yer almıyor/
    );

    const proReferral = await customerCampaignService.createCustomerReferral(tenantPro, {
      id: 'ref-pro-001',
      campaignId: proCampaign.id,
      referrerCustomerId: 'cust-pro-1',
      referredCustomerName: 'Ayşe Demir',
      referredCustomerPhone: '+905551112233',
      status: 'booked',
    });
    const completedRef = await customerCampaignService.markReferralCompleted(proReferral.id);
    assert.equal(completedRef?.status, 'completed');

    const proRewards = await customerCampaignService.listCustomerRewardsByCustomer(tenantPro, 'cust-pro-1');
    assert.equal(proRewards.length, 1);
    assert.equal(proRewards[0].status, 'available');

    const usedReward = await customerCampaignService.markRewardUsed(proRewards[0].id, 'appt-pro-1');
    assert.equal(usedReward?.status, 'used');
    assert.equal(usedReward?.usedAppointmentId, 'appt-pro-1');

    const missingReward = await customerCampaignService.markRewardUsed('non-existent-reward');
    assert.equal(missingReward, null);

    // 3. Async server-authoritative entitlement check is awaited before mutations
    let awaitedAsyncCheck = false;
    entitlementService.canTenantUseFeature = async (tid, featureId) => {
      await new Promise((r) => setTimeout(r, 15));
      awaitedAsyncCheck = true;
      return tid === tenantPro && featureId === 'campaigns_referrals';
    };

    await assert.rejects(
      () =>
        customerCampaignService.createCampaign('t-unentitled-server', {
          name: 'Async Denied',
          type: 'discount',
          customerReward: '100 TL indirim',
        }),
      /Bu özellik mevcut paketinizde yer almıyor/
    );
    assert.equal(awaitedAsyncCheck, true);

    await customerCampaignService.createCustomerReferral('t-unentitled-server', {
      id: 'ref-unentitled-1',
      campaignId: 'default',
      referrerCustomerId: 'cust-unentitled-1',
      referredCustomerName: 'Engelli Müşteri',
      status: 'booked',
    });

    awaitedAsyncCheck = false;
    await assert.rejects(
      () => customerCampaignService.markReferralCompleted('ref-unentitled-1'),
      /Bu özellik mevcut paketinizde yer almıyor/
    );
    assert.equal(awaitedAsyncCheck, true);

    console.log('[PASS] customerCampaignService async entitlement tests verified');
  } finally {
    entitlementService.canTenantUseFeature = origCanTenantUseFeature;
    if (prevDataMode === undefined) {
      delete process.env.VITE_DATA_MODE;
    } else {
      process.env.VITE_DATA_MODE = prevDataMode;
    }
  }
}

await runCustomerCampaignServiceTests();
