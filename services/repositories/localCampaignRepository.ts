import { CampaignRepository } from './types';
import { BusinessCustomerCampaign, BusinessCustomerReferral, CustomerCampaignReward } from '../../types';

export class LocalCampaignRepository implements CampaignRepository {
  private getCampaigns(): BusinessCustomerCampaign[] {
    const raw = localStorage.getItem('lari_customer_campaigns_by_tenant');
    return raw ? JSON.parse(raw) : [];
  }

  private setCampaigns(campaigns: BusinessCustomerCampaign[]) {
    localStorage.setItem('lari_customer_campaigns_by_tenant', JSON.stringify(campaigns));
    // Also sync to randapp_business_campaigns for compatibility
    localStorage.setItem('randapp_business_campaigns', JSON.stringify(campaigns));
  }

  private getReferrals(): BusinessCustomerReferral[] {
    const raw = localStorage.getItem('lari_customer_referrals_by_tenant');
    return raw ? JSON.parse(raw) : [];
  }

  private setReferrals(referrals: BusinessCustomerReferral[]) {
    localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(referrals));
    // Also sync to randapp_business_referrals
    localStorage.setItem('randapp_business_referrals', JSON.stringify(referrals));
  }

  private getRewards(): CustomerCampaignReward[] {
    const raw = localStorage.getItem('lari_customer_campaign_rewards_by_tenant');
    return raw ? JSON.parse(raw) : [];
  }

  private setRewards(rewards: CustomerCampaignReward[]) {
    localStorage.setItem('lari_customer_campaign_rewards_by_tenant', JSON.stringify(rewards));
    // Also sync for compatibility if needed
    localStorage.setItem('randapp_customer_rewards', JSON.stringify(rewards));
  }

  async listCampaigns(tenantId: string): Promise<BusinessCustomerCampaign[]> {
    return this.getCampaigns().filter(c => c.tenantId === tenantId);
  }

  async saveCampaign(tenantId: string, campaign: BusinessCustomerCampaign): Promise<BusinessCustomerCampaign> {
    const camps = this.getCampaigns();
    const index = camps.findIndex(c => c.id === campaign.id);
    const updatedCampaign = { ...campaign, tenantId, updatedAt: new Date().toISOString() };
    if (index > -1) {
      camps[index] = updatedCampaign;
    } else {
      camps.push(updatedCampaign);
    }
    this.setCampaigns(camps);
    return updatedCampaign;
  }

  async deleteCampaign(campaignId: string): Promise<boolean> {
    const camps = this.getCampaigns();
    const filtered = camps.filter(c => c.id !== campaignId);
    this.setCampaigns(filtered);
    return true;
  }

  async listCustomerReferrals(tenantId: string): Promise<BusinessCustomerReferral[]> {
    return this.getReferrals().filter(r => r.tenantId === tenantId);
  }

  async saveCustomerReferral(tenantId: string, referral: BusinessCustomerReferral): Promise<BusinessCustomerReferral> {
    const refs = this.getReferrals();
    const index = refs.findIndex(r => r.id === referral.id);
    const updatedReferral = { ...referral, tenantId, updatedAt: new Date().toISOString() };
    if (index > -1) {
      refs[index] = updatedReferral;
    } else {
      refs.push(updatedReferral);
    }
    this.setReferrals(refs);
    return updatedReferral;
  }

  async listCustomerRewards(tenantId: string): Promise<CustomerCampaignReward[]> {
    return this.getRewards().filter(r => r.tenantId === tenantId);
  }

  async saveCustomerReward(tenantId: string, reward: CustomerCampaignReward): Promise<CustomerCampaignReward> {
    const rewards = this.getRewards();
    const index = rewards.findIndex(r => r.id === reward.id);
    const updatedReward = { ...reward, tenantId, updatedAt: new Date().toISOString() };
    if (index > -1) {
      rewards[index] = updatedReward;
    } else {
      rewards.push(updatedReward);
    }
    this.setRewards(rewards);
    return updatedReward;
  }
}
