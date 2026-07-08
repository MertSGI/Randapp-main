import { PlatformReferralProgram, PlatformReferral, ReferralRewardLedger, BusinessCustomerCampaign, BusinessCustomerReferral } from '../types';

// In-memory mock storage (simulate database)
const STORAGE_KEYS = {
  PROGRAMS: 'randapp_platform_programs',
  REFERRALS: 'randapp_platform_referrals',
  LEDGERS: 'randapp_referral_ledgers',
  BUSINESS_CAMPAIGNS: 'randapp_business_campaigns',
  BUSINESS_REFERRALS: 'randapp_business_referrals'
};

const defaultProgram: PlatformReferralProgram = {
  id: 'prog_default',
  name: 'LARİ Founders Program',
  isActive: true,
  rewardPerQualifiedReferralMonths: 1,
  milestoneRewardThreshold: 6,
  milestoneRewardMonths: 12, // 1 year free
  qualificationRule: 'card_verified_trial_started',
  appliesToPlanIds: ['professional', 'premium', 'kurumsal'], // Usually higher plans
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const getStorage = <T>(key: string, defaultValue: T[]): T[] => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const setStorage = <T>(key: string, value: T[]) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const referralProgramService = {
  
  // -- Platform Programs --

  getActivePlatformReferralProgram(): PlatformReferralProgram {
    const programs = getStorage<PlatformReferralProgram>(STORAGE_KEYS.PROGRAMS, [defaultProgram]);
    return programs.find(p => p.isActive) || defaultProgram;
  },

  updatePlatformReferralProgram(input: Partial<PlatformReferralProgram>): PlatformReferralProgram {
    const programs = getStorage<PlatformReferralProgram>(STORAGE_KEYS.PROGRAMS, [defaultProgram]);
    let active = programs.find(p => p.isActive) || defaultProgram;
    
    active = { ...active, ...input, updatedAt: new Date().toISOString() };
    
    // update array
    const updatedPrograms = programs.map(p => p.id === active.id ? active : p);
    setStorage(STORAGE_KEYS.PROGRAMS, updatedPrograms);
    return active;
  },

  createReferralCode(tenantId: string): string {
    // Basic deterministic code for local: TENANT-1234
    const prefix = tenantId.substring(0, 6).toUpperCase();
    return `${prefix}-REF`;
  },

  getReferralByCode(referralCode: string): PlatformReferral | undefined {
    // Note: one code normally maps to many potential referrals, but here 'referralCode' 
    // is what the *referred* user inputs, so it matches the *referrerTenantId*.
    // Wait, a referral code identifies the *referrer*.
    // We should return the referrer tenant ID from the code.
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    // Actually, finding the tenant id from the code in local mock is just parsing if we used TENANT-1234
    // Better yet: we just query the tenant, but code isn't stored on tenant. 
    // Let's store referrer codes somewhere or dynamically resolve.
    return undefined; // Not used directly this way
  },

  resolveReferrerIdFromCode(referralCode: string): string | null {
     // If code is "TENANT-REF"
     if (referralCode.endsWith('-REF')) {
         const prefix = referralCode.replace('-REF', '').toLowerCase();
         // find tenant with this prefix?
         // Let's just mock it: if someone provides a code, just parse it.
         // In real DB we'd have a table `tenant_referral_codes` or similar.
         // we will store them implicitly.
     }
     
     // Quick lookup from any existing referrals
     const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
     const found = refs.find(r => r.referralCode === referralCode);
     if (found) return found.referrerTenantId;
     
     return null;
  },

  registerPlatformReferral(referrerTenantId: string, referredOwnerEmail: string): PlatformReferral {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    const referralCode = this.createReferralCode(referrerTenantId);
    
    const newRef: PlatformReferral = {
      id: `pref_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      referrerTenantId,
      referredOwnerEmail,
      referralCode,
      status: 'invited',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    refs.push(newRef);
    setStorage(STORAGE_KEYS.REFERRALS, refs);
    return newRef;
  },

  markReferralRegistered(referralCode: string, referredTenantId: string, referredEmail: string) {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    // Find the invitation or create if it was an open link registration
    let ref = refs.find(r => r.referralCode === referralCode && (r.status === 'invited' && r.referredOwnerEmail === referredEmail));
    
    if (!ref) {
      // Find what tenant owns this code
      let referrerTenantId = "unknown";
      const existingRef = refs.find(r => r.referralCode === referralCode);
      if (existingRef) {
         referrerTenantId = existingRef.referrerTenantId;
      } else if (referralCode) {
         // Create a blind referral attachment
         referrerTenantId = `tenant_${referralCode.replace('-REF', '').toLowerCase()}`; 
      }
      
      ref = {
          id: `pref_${Date.now()}`,
          referrerTenantId,
          referredOwnerEmail: referredEmail,
          referralCode,
          status: 'registered',
          referredTenantId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
      };
      refs.push(ref);
    } else {
      ref.status = 'registered';
      ref.referredTenantId = referredTenantId;
      ref.updatedAt = new Date().toISOString();
    }
    
    setStorage(STORAGE_KEYS.REFERRALS, refs);
  },

  markReferralTrialStarted(referredTenantId: string) {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    const ref = refs.find(r => r.referredTenantId === referredTenantId && r.status === 'registered');
    
    if (ref) {
      ref.status = 'trial_started';
      ref.updatedAt = new Date().toISOString();
      setStorage(STORAGE_KEYS.REFERRALS, refs);
      
      const program = this.getActivePlatformReferralProgram();
      if (program.qualificationRule === 'card_verified_trial_started') {
        this.qualifyReferral(ref.id);
      }
    }
  },

  qualifyReferral(referralId: string) {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    const ref = refs.find(r => r.id === referralId);
    if (!ref) return;
    
    ref.status = 'qualified';
    ref.qualifiedAt = new Date().toISOString();
    ref.updatedAt = new Date().toISOString();
    
    setStorage(STORAGE_KEYS.REFERRALS, refs);
    
    // Evaluate rewards
    this.evaluateRewardsForReferrer(ref.referrerTenantId);
  },

  evaluateRewardsForReferrer(referrerTenantId: string) {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    const program = this.getActivePlatformReferralProgram();
    
    // Sort all qualified/rewarded referrals by creation date for stable order
    const tenantQualifiedRefs = refs
      .filter(r => r.referrerTenantId === referrerTenantId && (r.status === 'qualified' || r.status === 'rewarded'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let count = 0;
    for (const ref of tenantQualifiedRefs) {
      count++;
      if (ref.status === 'qualified' && !ref.rewardedAt) {
        // Ordinal position `count` determines the exact reward
        if (count % program.milestoneRewardThreshold === 0) {
           const milestoneReward = program.milestoneRewardMonths - (program.milestoneRewardThreshold - 1) * program.rewardPerQualifiedReferralMonths;
           this.applyReferralReward(referrerTenantId, ref.id, milestoneReward, 'milestone');
        } else {
           this.applyReferralReward(referrerTenantId, ref.id, program.rewardPerQualifiedReferralMonths, 'base');
        }
      }
    }
  },

  applyReferralReward(tenantId: string, referralId: string | undefined, rewardMonths: number, type: 'base' | 'milestone') {
    const ledgers = getStorage<ReferralRewardLedger>(STORAGE_KEYS.LEDGERS, []);
    
    const newLedger: ReferralRewardLedger = {
      id: `ledg_${Date.now()}`,
      tenantId,
      referralId,
      rewardType: type === 'base' ? 'free_months' : 'manual_credit',
      monthsGranted: rewardMonths,
      status: 'pending', // Pending provider sync
      createdAt: new Date().toISOString()
    };
    
    ledgers.push(newLedger);
    setStorage(STORAGE_KEYS.LEDGERS, ledgers);
    
    if (referralId) {
       const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
       const refIndex = refs.findIndex(r => r.id === referralId);
       if (refIndex > -1) {
          refs[refIndex].status = 'rewarded';
          refs[refIndex].rewardedAt = new Date().toISOString();
          refs[refIndex].rewardMonths = rewardMonths;
          setStorage(STORAGE_KEYS.REFERRALS, refs);
       }
    }
  },

  listAllPlatformReferrals(): PlatformReferral[] {
    return getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
  },

  listAllRewardLedgers(): ReferralRewardLedger[] {
    return getStorage<ReferralRewardLedger>(STORAGE_KEYS.LEDGERS, []);
  },

  updateReferralStatus(referralId: string, status: PlatformReferral['status'], notes?: string): PlatformReferral | null {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    const index = refs.findIndex(r => r.id === referralId);
    if (index > -1) {
       refs[index].status = status;
       if (notes !== undefined) refs[index].notes = notes;
       refs[index].updatedAt = new Date().toISOString();
       if (status === 'qualified') {
         refs[index].qualifiedAt = new Date().toISOString();
       }
       setStorage(STORAGE_KEYS.REFERRALS, refs);
       
       if (status === 'qualified') {
         this.evaluateRewardsForReferrer(refs[index].referrerTenantId);
       }
       return refs[index];
    }
    return null;
  },

  updateLedgerStatus(ledgerId: string, status: ReferralRewardLedger['status']): ReferralRewardLedger | null {
    const ledgers = getStorage<ReferralRewardLedger>(STORAGE_KEYS.LEDGERS, []);
    const index = ledgers.findIndex(l => l.id === ledgerId);
    if (index > -1) {
       ledgers[index].status = status;
       if (status === 'applied') {
         ledgers[index].appliedAt = new Date().toISOString();
       }
       setStorage(STORAGE_KEYS.LEDGERS, ledgers);
       return ledgers[index];
    }
    return null;
  },

  manuallyCreateRewardLedger(tenantId: string, months: number, type: 'free_months' | 'manual_credit'): ReferralRewardLedger {
    const ledgers = getStorage<ReferralRewardLedger>(STORAGE_KEYS.LEDGERS, []);
    const newLedger: ReferralRewardLedger = {
       id: `ledg_${Date.now()}`,
       tenantId,
       rewardType: type,
       monthsGranted: months,
       status: 'applied',
       appliedAt: new Date().toISOString(),
       createdAt: new Date().toISOString()
    };
    ledgers.push(newLedger);
    setStorage(STORAGE_KEYS.LEDGERS, ledgers);
    return newLedger;
  },

  listTenantReferrals(tenantId: string): PlatformReferral[] {
    const refs = getStorage<PlatformReferral>(STORAGE_KEYS.REFERRALS, []);
    return refs.filter(r => r.referrerTenantId === tenantId);
  },

  listReferralRewards(tenantId: string): ReferralRewardLedger[] {
    const ledgers = getStorage<ReferralRewardLedger>(STORAGE_KEYS.LEDGERS, []);
    return ledgers.filter(r => r.tenantId === tenantId);
  },
  
  
  // -- Business Customer Campaigns --
  
  listBusinessCampaigns(tenantId: string): BusinessCustomerCampaign[] {
      return getStorage<BusinessCustomerCampaign>(STORAGE_KEYS.BUSINESS_CAMPAIGNS, []).filter(c => c.tenantId === tenantId);
  },
  
  saveBusinessCampaign(campaign: BusinessCustomerCampaign): BusinessCustomerCampaign {
      const camps = getStorage<BusinessCustomerCampaign>(STORAGE_KEYS.BUSINESS_CAMPAIGNS, []);
      const index = camps.findIndex(c => c.id === campaign.id);
      if (index > -1) {
          camps[index] = { ...campaign, updatedAt: new Date().toISOString() };
      } else {
          camps.push(campaign);
      }
      setStorage(STORAGE_KEYS.BUSINESS_CAMPAIGNS, camps);
      return campaign;
  },
  
  deleteBusinessCampaign(campaignId: string) {
      const camps = getStorage<BusinessCustomerCampaign>(STORAGE_KEYS.BUSINESS_CAMPAIGNS, []);
      setStorage(STORAGE_KEYS.BUSINESS_CAMPAIGNS, camps.filter(c => c.id !== campaignId));
  },
  
  listBusinessReferrals(tenantId: string): BusinessCustomerReferral[] {
      return getStorage<BusinessCustomerReferral>(STORAGE_KEYS.BUSINESS_REFERRALS, []).filter(r => r.tenantId === tenantId);
  },
  
  saveBusinessReferral(referral: BusinessCustomerReferral): BusinessCustomerReferral {
      const refs = getStorage<BusinessCustomerReferral>(STORAGE_KEYS.BUSINESS_REFERRALS, []);
      const index = refs.findIndex(r => r.id === referral.id);
      if (index > -1) {
          refs[index] = { ...referral, updatedAt: new Date().toISOString() };
      } else {
          refs.push(referral);
      }
      setStorage(STORAGE_KEYS.BUSINESS_REFERRALS, refs);
      return referral;
  }
};
