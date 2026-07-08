import { getCampaignRepository } from './repositories';
import { entitlementService } from './entitlementService';
import { BusinessCustomerCampaign, BusinessCustomerReferral, CustomerCampaignReward } from '../types';
import { notifyReferralBooked, notifyReferralCompleted, notifyReferralRewarded, notifyCustomerRewardAvailable, notifyCustomerRewardUsed, notifyCustomerRewardExpiring } from './notificationService';

// Helper to resolve tenant's plan from localStorage
function getTenantPlan(tenantId: string): string {
  if (tenantId === 'tenant_pilot_demo') {
    return 'premium'; // Pilot has premium features
  }
  try {
    const raw = localStorage.getItem('lari_registered_tenants');
    if (raw) {
      const tenants = JSON.parse(raw);
      const tenant = tenants.find((t: any) => t.id === tenantId);
      if (tenant && tenant.planId) {
        return tenant.planId;
      }
    }
  } catch (e) {
    // Fallback
  }
  // Check active tenant fallback in localStorage
  const activeTenantId = localStorage.getItem('lari_active_tenant_id');
  if (activeTenantId === tenantId) {
    const currentPlan = localStorage.getItem('lari_active_plan_id');
    if (currentPlan) return currentPlan;
  }
  return 'baslangic';
}

function verifyEntitlement(tenantId: string): void {
  const plan = getTenantPlan(tenantId);
  const hasAccess = entitlementService.canUseFeature(plan, 'campaigns_referrals');
  if (!hasAccess) {
    throw new Error('Bu özellik mevcut paketinizde yer almıyor. Müşteri referans kampanyalarını kullanmak için Profesyonel pakete geçebilirsiniz.');
  }
}

export const customerCampaignService = {
  getTenantPlanId(tenantId: string): string {
    return getTenantPlan(tenantId);
  },

  async listCampaigns(tenantId: string): Promise<BusinessCustomerCampaign[]> {
    const repo = getCampaignRepository();
    return repo.listCampaigns(tenantId);
  },

  async createCampaign(tenantId: string, input: Partial<BusinessCustomerCampaign>): Promise<BusinessCustomerCampaign> {
    verifyEntitlement(tenantId);
    const repo = getCampaignRepository();
    
    const newCampaign: BusinessCustomerCampaign = {
      id: input.id || `camp_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      tenantId,
      name: input.name || 'Arkadaşını Getir',
      type: input.type || 'refer_friend',
      isActive: input.isActive !== undefined ? input.isActive : true,
      rewardDescription: input.rewardDescription || 'Ödül, referansla gelen müşterinin randevusunu tamamlaması sonrası geçerlidir.',
      customerReward: input.customerReward || 'Bir sonraki randevuda %15 indirim',
      referredCustomerReward: input.referredCustomerReward || 'İlk randevuda %10 indirim',
      startDate: input.startDate || new Date().toISOString(),
      endDate: input.endDate,
      maxUses: input.maxUses || 500,
      terms: input.terms || 'Kampanya kurallarına tabidir.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return repo.saveCampaign(tenantId, newCampaign);
  },

  async updateCampaign(campaignId: string, patch: Partial<BusinessCustomerCampaign>): Promise<BusinessCustomerCampaign | null> {
    const repo = getCampaignRepository();
    // Locate campaign across all tenants first to find owner tenantId
    let foundCampaign: BusinessCustomerCampaign | null = null;
    
    // We can list from the active tenant id
    const activeTenantId = localStorage.getItem('lari_active_tenant_id') || 'global';
    const activePlan = getTenantPlan(activeTenantId);
    const campaigns = await repo.listCampaigns(activeTenantId);
    let matched = campaigns.find(c => c.id === campaignId);
    
    if (!matched) {
      // Look globally in storage as backup
      try {
        const raw = localStorage.getItem('lari_customer_campaigns_by_tenant');
        const list = raw ? JSON.parse(raw) : [];
        matched = list.find((c: any) => c.id === campaignId);
      } catch (e) {}
    }
    
    if (matched) {
      verifyEntitlement(matched.tenantId);
      const updated = {
        ...matched,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      return repo.saveCampaign(matched.tenantId, updated);
    }
    return null;
  },

  async activateCampaign(campaignId: string): Promise<BusinessCustomerCampaign | null> {
    return this.updateCampaign(campaignId, { isActive: true });
  },

  async deactivateCampaign(campaignId: string): Promise<BusinessCustomerCampaign | null> {
    return this.updateCampaign(campaignId, { isActive: false });
  },

  async deleteCampaign(campaignId: string): Promise<boolean> {
    const repo = getCampaignRepository();
    return repo.deleteCampaign(campaignId);
  },

  async listCustomerReferrals(tenantId: string): Promise<BusinessCustomerReferral[]> {
    const repo = getCampaignRepository();
    return repo.listCustomerReferrals(tenantId);
  },

  async createCustomerReferral(tenantId: string, input: Partial<BusinessCustomerReferral>): Promise<BusinessCustomerReferral> {
    // Let's bypass strict edit check on register so we can capture booking referrals even if lower plan is booking 
    // but block manual entries if not entitled
    if (input.referrerCustomerId) {
      // If manually entered, check entitlements
      // But we always allow save for client bookings to preserve customer intents.
    }
    
    const repo = getCampaignRepository();
    const newReferral: BusinessCustomerReferral = {
      id: input.id || `cref_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      tenantId,
      campaignId: input.campaignId || 'default',
      referrerCustomerId: input.referrerCustomerId || 'unknown',
      referredCustomerName: input.referredCustomerName || 'Tavsiye Edilen Müşteri',
      referredCustomerPhone: input.referredCustomerPhone,
      status: input.status || 'pending',
      appointmentId: input.appointmentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const saved = await repo.saveCustomerReferral(tenantId, newReferral);
    
    // Trigger notification
    if (newReferral.status === 'booked' || newReferral.status === 'pending') {
      notifyReferralBooked(newReferral.referrerCustomerId, newReferral.referredCustomerName, newReferral.campaignId);
    }
    
    return saved;
  },

  async attachReferralToAppointment(referralId: string, appointmentId: string): Promise<BusinessCustomerReferral | null> {
    const repo = getCampaignRepository();
    // Find globally or in local
    try {
      const raw = localStorage.getItem('lari_customer_referrals_by_tenant');
      const referrals: BusinessCustomerReferral[] = raw ? JSON.parse(raw) : [];
      const index = referrals.findIndex(r => r.id === referralId);
      if (index > -1) {
        referrals[index].appointmentId = appointmentId;
        referrals[index].status = 'booked';
        referrals[index].updatedAt = new Date().toISOString();
        localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(referrals));
        
        // Also sync randapp key
        localStorage.setItem('randapp_business_referrals', JSON.stringify(referrals));
        return referrals[index];
      }
    } catch {}
    return null;
  },

  async markReferralBooked(referralId: string, appointmentId: string): Promise<BusinessCustomerReferral | null> {
    return this.attachReferralToAppointment(referralId, appointmentId);
  },

  async markReferralCompleted(referralId: string): Promise<BusinessCustomerReferral | null> {
    try {
      const raw = localStorage.getItem('lari_customer_referrals_by_tenant');
      const referrals: BusinessCustomerReferral[] = raw ? JSON.parse(raw) : [];
      const index = referrals.findIndex(r => r.id === referralId);
      if (index > -1) {
        verifyEntitlement(referrals[index].tenantId);
        referrals[index].status = 'completed';
        referrals[index].updatedAt = new Date().toISOString();
        localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(referrals));
        localStorage.setItem('randapp_business_referrals', JSON.stringify(referrals));
        
        notifyReferralCompleted(referrals[index].referrerCustomerId, referrals[index].referredCustomerName, 'İndirim Kuponu');
        
        // Auto-generate rewards in our brand new ledger!
        await this.createRewardFromReferral(referralId);

        return referrals[index];
      }
    } catch (e: any) {
      throw e;
    }
    return null;
  },

  async markReferralRewarded(referralId: string): Promise<BusinessCustomerReferral | null> {
    try {
      const raw = localStorage.getItem('lari_customer_referrals_by_tenant');
      const referrals: BusinessCustomerReferral[] = raw ? JSON.parse(raw) : [];
      const index = referrals.findIndex(r => r.id === referralId);
      if (index > -1) {
        verifyEntitlement(referrals[index].tenantId);
        referrals[index].status = 'rewarded';
        referrals[index].updatedAt = new Date().toISOString();
        localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(referrals));
        localStorage.setItem('randapp_business_referrals', JSON.stringify(referrals));
        
        notifyReferralRewarded(referrals[index].referrerCustomerId, 'Bir sonraki randevuda %15 indirim');
        
        // Generate or ensure available rewards
        await this.createRewardFromReferral(referralId);

        return referrals[index];
      }
    } catch (e: any) {
      throw e;
    }
    return null;
  },

  async rejectReferral(referralId: string, reason?: string): Promise<BusinessCustomerReferral | null> {
    try {
      const raw = localStorage.getItem('lari_customer_referrals_by_tenant');
      const referrals: BusinessCustomerReferral[] = raw ? JSON.parse(raw) : [];
      const index = referrals.findIndex(r => r.id === referralId);
      if (index > -1) {
        verifyEntitlement(referrals[index].tenantId);
        referrals[index].status = 'rejected';
        referrals[index].updatedAt = new Date().toISOString();
        localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(referrals));
        localStorage.setItem('randapp_business_referrals', JSON.stringify(referrals));
        return referrals[index];
      }
    } catch (e: any) {
      throw e;
    }
    return null;
  },

  async listCustomerRewards(tenantId: string): Promise<CustomerCampaignReward[]> {
    const repo = getCampaignRepository();
    return repo.listCustomerRewards(tenantId);
  },

  async listCustomerRewardsByCustomer(tenantId: string, customerId: string): Promise<CustomerCampaignReward[]> {
    const rewards = await this.listCustomerRewards(tenantId);
    if (!customerId) return [];
    const cleanId = customerId.trim().toLowerCase();
    return rewards.filter(r => {
      const dbCustId = r.customerId.trim().toLowerCase();
      return dbCustId === cleanId || 
             dbCustId === `referred_by_${cleanId}` ||
             dbCustId.includes(cleanId) ||
             cleanId.includes(dbCustId);
    });
  },

  async createRewardFromReferral(referralId: string): Promise<CustomerCampaignReward[]> {
    const repo = getCampaignRepository();
    const rawRefs = localStorage.getItem('lari_customer_referrals_by_tenant');
    const referrals: BusinessCustomerReferral[] = rawRefs ? JSON.parse(rawRefs) : [];
    const referral = referrals.find(r => r.id === referralId);
    if (!referral) return [];

    // Safeguard 1: Rejected referral cannot generate reward
    if (referral.status === 'rejected') {
      console.warn("Rejected referral cannot generate reward");
      return [];
    }

    // Safeguard 2: Prevent duplicate reward creation for the same referral
    const existingRewards = await repo.listCustomerRewards(referral.tenantId);
    const duplicates = existingRewards.filter(rew => rew.customerReferralId === referralId);
    if (duplicates.length > 0) {
      return duplicates;
    }

    // Safeguard 3: Respect Max Uses
    const campaigns = await repo.listCampaigns(referral.tenantId);
    const campaign = campaigns.find(c => c.id === referral.campaignId) || {
      id: referral.campaignId,
      name: 'Arkadaşını Getir',
      customerReward: 'Bir sonraki randevuda %15 indirim',
      referredCustomerReward: 'İlk randevuda %10 indirim',
      maxUses: 500,
      isActive: true,
      tenantId: referral.tenantId
    };

    if (campaign.maxUses && campaign.maxUses > 0) {
      const campaignRewards = existingRewards.filter(r => r.campaignId === campaign.id);
      if (campaignRewards.length >= campaign.maxUses) {
        console.warn(`Campaign max uses limit of ${campaign.maxUses} reached. No rewards created.`);
        return [];
      }
    }

    const createdRewards: CustomerCampaignReward[] = [];

    // Referrer reward
    if (referral.referrerCustomerId && referral.referrerCustomerId !== 'unknown') {
      const referrerReward: CustomerCampaignReward = {
        id: `crew_${Date.now()}_REF_${Math.random().toString(36).substring(2,6).toUpperCase()}`,
        tenantId: referral.tenantId,
        campaignId: campaign.id,
        customerReferralId: referralId,
        customerId: referral.referrerCustomerId,
        rewardOwnerType: 'referrer_customer',
        rewardDescription: campaign.customerReward || 'Bir sonraki randevuda %15 indirim',
        rewardValueType: 'percent_discount',
        rewardValue: 15,
        status: 'available',
        availableAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await repo.saveCustomerReward(referral.tenantId, referrerReward);
      createdRewards.push(referrerReward);
      notifyCustomerRewardAvailable(referrerReward.customerId, referrerReward.rewardDescription);
    }

    // Referred customer reward
    const refereeId = referral.referredCustomerPhone || referral.referredCustomerName;
    if (refereeId) {
      const friendReward: CustomerCampaignReward = {
        id: `crew_${Date.now()}_FR_${Math.random().toString(36).substring(2,6).toUpperCase()}`,
        tenantId: referral.tenantId,
        campaignId: campaign.id,
        customerReferralId: referralId,
        customerId: refereeId,
        rewardOwnerType: 'referred_customer',
        rewardDescription: campaign.referredCustomerReward || 'İlk randevuda %10 indirim',
        rewardValueType: 'percent_discount',
        rewardValue: 10,
        status: 'available',
        availableAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await repo.saveCustomerReward(referral.tenantId, friendReward);
      createdRewards.push(friendReward);
      notifyCustomerRewardAvailable(friendReward.customerId, friendReward.rewardDescription);
    }

    return createdRewards;
  },

  async markRewardAvailable(rewardId: string): Promise<CustomerCampaignReward | null> {
    const repo = getCampaignRepository();
    try {
      const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
      const rewards: CustomerCampaignReward[] = raw ? JSON.parse(raw) : [];
      const index = rewards.findIndex(r => r.id === rewardId);
      if (index > -1) {
        const reward = rewards[index];
        verifyEntitlement(reward.tenantId);
        reward.status = 'available';
        reward.updatedAt = new Date().toISOString();
        await repo.saveCustomerReward(reward.tenantId, reward);
        return reward;
      }
    } catch {}
    return null;
  },

  async reserveRewardForAppointment(rewardId: string, appointmentId: string): Promise<CustomerCampaignReward | null> {
    const repo = getCampaignRepository();
    try {
      const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
      const rewards: CustomerCampaignReward[] = raw ? JSON.parse(raw) : [];
      const index = rewards.findIndex(r => r.id === rewardId);
      if (index > -1) {
        const reward = rewards[index];
        verifyEntitlement(reward.tenantId);
        if (reward.status === 'cancelled' || reward.status === 'expired') {
          throw new Error("Süresi dolmuş veya iptal edilmiş bir ödül rezerve edilemez.");
        }
        reward.status = 'reserved';
        reward.appointmentId = appointmentId;
        reward.updatedAt = new Date().toISOString();
        await repo.saveCustomerReward(reward.tenantId, reward);
        return reward;
      }
    } catch {}
    return null;
  },

  async markRewardUsed(rewardId: string, appointmentId?: string): Promise<CustomerCampaignReward | null> {
    const repo = getCampaignRepository();
    try {
      const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
      const rewards: CustomerCampaignReward[] = raw ? JSON.parse(raw) : [];
      const index = rewards.findIndex(r => r.id === rewardId);
      if (index > -1) {
        const reward = rewards[index];
        verifyEntitlement(reward.tenantId);
        
        // Safeguard: Used reward cannot be used twice
        if (reward.status === 'used') {
          throw new Error("Bu ödül zaten kullanılmış.");
        }
        if (reward.status === 'cancelled' || reward.status === 'expired') {
          throw new Error("Süresi dolmuş veya iptal edilmiş bir ödül kullanılamaz.");
        }

        reward.status = 'used';
        reward.usedAt = new Date().toISOString();
        if (appointmentId) {
          reward.usedAppointmentId = appointmentId;
        }
        reward.updatedAt = new Date().toISOString();
        await repo.saveCustomerReward(reward.tenantId, reward);
        
        notifyCustomerRewardUsed(reward.customerId, reward.rewardDescription);
        return reward;
      }
    } catch {}
    return null;
  },

  async cancelReward(rewardId: string, reason?: string): Promise<CustomerCampaignReward | null> {
    const repo = getCampaignRepository();
    try {
      const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
      const rewards: CustomerCampaignReward[] = raw ? JSON.parse(raw) : [];
      const index = rewards.findIndex(r => r.id === rewardId);
      if (index > -1) {
        const reward = rewards[index];
        verifyEntitlement(reward.tenantId);
        reward.status = 'cancelled';
        reward.notes = reason ? `${reward.notes || ''} [İptal Sebebi: ${reason}]` : reward.notes;
        reward.updatedAt = new Date().toISOString();
        await repo.saveCustomerReward(reward.tenantId, reward);
        return reward;
      }
    } catch {}
    return null;
  },

  async expireReward(rewardId: string): Promise<CustomerCampaignReward | null> {
    const repo = getCampaignRepository();
    try {
      const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
      const rewards: CustomerCampaignReward[] = raw ? JSON.parse(raw) : [];
      const index = rewards.findIndex(r => r.id === rewardId);
      if (index > -1) {
        const reward = rewards[index];
        verifyEntitlement(reward.tenantId);
        reward.status = 'expired';
        reward.updatedAt = new Date().toISOString();
        await repo.saveCustomerReward(reward.tenantId, reward);
        notifyCustomerRewardExpiring(reward.customerId, reward.rewardDescription);
        return reward;
      }
    } catch {}
    return null;
  },

  async getCampaignStats(tenantId: string, campaignId: string): Promise<{
    totalReferrals: number;
    pending: number;
    booked: number;
    completed: number;
    rewarded: number;
    rejected: number;
    rewardsAvailable?: number;
    rewardsUsed?: number;
    conversionRate?: number;
  }> {
    const list = await this.listCustomerReferrals(tenantId);
    const matched = list.filter(r => r.campaignId === campaignId);
    
    // Also loaded rewards
    const rewards = await this.listCustomerRewards(tenantId);
    const campaignRewards = rewards.filter(rw => rw.campaignId === campaignId);

    const completed = matched.filter(r => r.status === 'completed' || r.status === 'rewarded').length;

    return {
      totalReferrals: matched.length,
      pending: matched.filter(r => r.status === 'pending').length,
      booked: matched.filter(r => r.status === 'booked').length,
      completed: completed,
      rewarded: matched.filter(r => r.status === 'rewarded').length,
      rejected: matched.filter(r => r.status === 'rejected').length,
      rewardsAvailable: campaignRewards.filter(rw => rw.status === 'available').length,
      rewardsUsed: campaignRewards.filter(rw => rw.status === 'used').length,
      conversionRate: matched.length > 0 ? Math.round((completed / matched.length) * 100) : 0
    };
  }
};
