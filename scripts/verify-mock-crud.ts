import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Implement a minimal headless mock for localStorage
const _mockStorage = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => _mockStorage.get(key) || null,
  setItem: (key: string, value: string) => _mockStorage.set(key, value),
  removeItem: (key: string) => _mockStorage.delete(key),
  get length() { return _mockStorage.size; },
  key: (i: number) => Array.from(_mockStorage.keys())[i],
  clear: () => _mockStorage.clear()
};

// Polyfill fetch and import.meta.env
(global as any).import = { meta: { env: { VITE_DATA_MODE: 'mock' } } };

import { createStaff, deleteStaff, getStaffList } from '../services/staffService';
import { createService, deleteService, getServices } from '../services/serviceCatalogService';
import { referralService } from '../services/referralService';
import { planService } from '../services/planService';

async function runTests() {
  console.log('--- Mock CRUD Verification Harness ---');
  let exitCode = 0;
  
  const tenantId = 'demo-tenant-1';

  // Make sure it doesn't try to mock seed automatically
  localStorage.setItem(`randapp:${tenantId}:is_seeded`, 'true');

  // TEST 1: Staff
  try {
    console.log('\nTesting Staff CRUD...');
    const initialStaff = await getStaffList(tenantId);
    const beforeCount = initialStaff.length;
    
    await createStaff(tenantId, {
      name: 'Test Staff',
      title: 'Tester',
      active: true,
      image: ''
    } as any);
    
    let currentStaff = await getStaffList(tenantId);
    if (currentStaff.length !== beforeCount + 1) throw new Error('Staff count did not increment after add');
    
    const newStaff = currentStaff.find(s => s.name === 'Test Staff');
    if (!newStaff) throw new Error('Could not find newly added staff');
    
    const res = await deleteStaff(tenantId, newStaff.id);
    if (!res.ok) throw new Error('Staff deletion returned not ok');
    
    currentStaff = await getStaffList(tenantId);
    if (currentStaff.length !== beforeCount) throw new Error(`Staff count did not decrement. Expected ${beforeCount}, got ${currentStaff.length}`);
    
    console.log('✅ Staff CRUD OK');
  } catch(e: any) {
    console.error('❌ Staff CRUD failed:', e.message);
    exitCode = 1;
  }
  
  // TEST 2: Services
  try {
    console.log('\nTesting Service CRUD...');
    const initialServices = await getServices(tenantId);
    const beforeCount = initialServices.length;
    
    await createService(tenantId, {
      name: 'Test srv',
      duration: 30,
      price: 100,
      active: true
    } as any);
    
    let currentServices = await getServices(tenantId);
    if (currentServices.length !== beforeCount + 1) throw new Error('Service did not add');
    
    const newSrv = currentServices.find(s => s.name === 'Test srv');
    if (!newSrv) throw new Error('Could not find new service');
    
    const res = await deleteService(tenantId, newSrv.id);
    if (!res.ok) throw new Error('Service deletion failed');
    
    currentServices = await getServices(tenantId);
    if (currentServices.length !== beforeCount) {
        throw new Error('Service did not delete. Expected ' + beforeCount + ', got ' + currentServices.length);
    }
    
    console.log('✅ Service CRUD OK');
  } catch(e: any) {
    console.error('❌ Service CRUD failed:', e.message);
    exitCode = 1;
  }

  // TEST 3: Admin Referral Campaign
  try {
    console.log('\nTesting Admin Referral Campaign...');
    const campaigns = referralService.getCampaigns(tenantId);
    const beforeCount = campaigns.length;
    
    await referralService.saveCampaign({
      id: 'test_camp_999',
      tenantId,
      campaignType: 'customer_referral',
      title: 'Tester Camp',
      description: '',
      rewardType: 'discount',
      rewardValue: '10',
      active: true,
      createdBy: 'tenant_owner'
    });
    
    let currentCamps = referralService.getCampaigns(tenantId);
    if (currentCamps.length !== beforeCount + 1) throw new Error('Camp count did not increment');
    
    const res = await referralService.deleteCampaign('test_camp_999');
    if (!res.ok) throw new Error('Deletion failed');
    
    currentCamps = referralService.getCampaigns(tenantId);
    if (currentCamps.length !== beforeCount) throw new Error('Camp did not delete');
    console.log('✅ Admin Referral CRUD OK');
  } catch(e: any) {
    console.error('❌ Admin Referral CRUD failed:', e.message);
    exitCode = 1;
  }

  // TEST 4: Plans
  try {
    console.log('\nTesting Plans CRUD...');
    const plans = planService.getAllPlans();
    const beforeCount = plans.length;
    
    await planService.addPlan({
      id: 'test_plan_999',
      name: 'Tester Plan',
      annualPrice: 100,
      monthlyPrice: 10,
      maxStaff: 1,
      maxServices: 1,
      isRecommended: false,
      trialDays: 0
    } as any);
    
    let currentPlans = planService.getAllPlans();
    if (currentPlans.length !== beforeCount + 1) throw new Error('Plan did not add');
    
    const res = await planService.deletePlan('test_plan_999');
    if (!res.ok) throw new Error('Plan delete failed');
    
    currentPlans = planService.getAllPlans();
    if (currentPlans.length !== beforeCount) throw new Error('Plan did not delete');
    
    console.log('✅ Plan CRUD OK');
  } catch(e: any) {
    console.error('❌ Plan CRUD failed:', e.message);
    exitCode = 1;
  }

  process.exit(exitCode);
}
runTests();
