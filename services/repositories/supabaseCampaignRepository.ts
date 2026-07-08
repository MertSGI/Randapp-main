import { CampaignRepository } from './types';
import { BusinessCustomerCampaign, BusinessCustomerReferral, CustomerCampaignReward } from '../../types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseCampaignRepository implements CampaignRepository {

  async listCampaigns(tenantId: string): Promise<BusinessCustomerCampaign[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/business_customer_campaigns?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        name: d.name,
        type: d.type,
        isActive: d.is_active,
        rewardDescription: d.reward_description,
        customerReward: d.customer_reward,
        referredCustomerReward: d.referred_customer_reward,
        startDate: d.start_date,
        endDate: d.end_date,
        maxUses: d.max_uses,
        terms: d.terms,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
    } catch {
      return [];
    }
  }

  async saveCampaign(tenantId: string, campaign: BusinessCustomerCampaign): Promise<BusinessCustomerCampaign> {
    try {
      const dbRow = {
        id: campaign.id,
        tenant_id: tenantId,
        name: campaign.name,
        type: campaign.type,
        is_active: campaign.isActive,
        reward_description: campaign.rewardDescription,
        customer_reward: campaign.customerReward,
        referred_customer_reward: campaign.referredCustomerReward,
        start_date: campaign.startDate,
        end_date: campaign.endDate,
        max_uses: campaign.maxUses,
        terms: campaign.terms,
        updated_at: new Date().toISOString()
      };
      
      const res = await fetchSupabase(`/rest/v1/business_customer_campaigns?id=eq.${campaign.id}`, {
        method: 'POST', // or UPSERT behavior
        headers: { 
          'Content-Type': 'application/json', 
          'Prefer': 'resolution=merge-duplicates,return=representation' 
        },
        body: JSON.stringify(dbRow)
      });
      
      if (!res.ok) {
        // Fallback or retry with PATCH if POST doesn't upsert directly
        await fetchSupabase(`/rest/v1/business_customer_campaigns?id=eq.${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbRow)
        });
      }
      return campaign;
    } catch {
      return campaign;
    }
  }

  async deleteCampaign(campaignId: string): Promise<boolean> {
    try {
      const res = await fetchSupabase(`/rest/v1/business_customer_campaigns?id=eq.${campaignId}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listCustomerReferrals(tenantId: string): Promise<BusinessCustomerReferral[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/business_customer_referrals?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        campaignId: d.campaign_id,
        referrerCustomerId: d.referrer_customer_id,
        referredCustomerName: d.referred_customer_name,
        referredCustomerPhone: d.referred_customer_phone,
        status: d.status,
        appointmentId: d.appointment_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
    } catch {
      return [];
    }
  }

  async saveCustomerReferral(tenantId: string, referral: BusinessCustomerReferral): Promise<BusinessCustomerReferral> {
    try {
      const dbRow = {
        id: referral.id,
        tenant_id: tenantId,
        campaign_id: referral.campaignId,
        referrer_customer_id: referral.referrerCustomerId,
        referred_customer_name: referral.referredCustomerName,
        referred_customer_phone: referral.referredCustomerPhone,
        status: referral.status,
        appointment_id: referral.appointmentId,
        updated_at: new Date().toISOString()
      };
      
      const res = await fetchSupabase(`/rest/v1/business_customer_referrals?id=eq.${referral.id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Prefer': 'resolution=merge-duplicates,return=representation' 
        },
        body: JSON.stringify(dbRow)
      });
      
      if (!res.ok) {
        await fetchSupabase(`/rest/v1/business_customer_referrals?id=eq.${referral.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbRow)
        });
      }
      return referral;
    } catch {
      return referral;
    }
  }

  async listCustomerRewards(tenantId: string): Promise<CustomerCampaignReward[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/business_customer_campaign_rewards?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        tenantId: d.tenant_id,
        campaignId: d.campaign_id,
        customerReferralId: d.customer_referral_id,
        customerId: d.customer_id,
        appointmentId: d.appointment_id,
        rewardOwnerType: d.reward_owner_type,
        rewardDescription: d.reward_description,
        rewardValueType: d.reward_value_type,
        rewardValue: d.reward_value,
        status: d.status,
        availableAt: d.available_at,
        expiresAt: d.expires_at,
        usedAt: d.used_at,
        usedAppointmentId: d.used_appointment_id,
        notes: d.notes,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
    } catch {
      return [];
    }
  }

  async saveCustomerReward(tenantId: string, reward: CustomerCampaignReward): Promise<CustomerCampaignReward> {
    try {
      const dbRow = {
        id: reward.id,
        tenant_id: tenantId,
        campaign_id: reward.campaignId,
        customer_referral_id: reward.customerReferralId,
        customer_id: reward.customerId,
        appointment_id: reward.appointmentId,
        reward_owner_type: reward.rewardOwnerType,
        reward_description: reward.rewardDescription,
        reward_value_type: reward.rewardValueType,
        reward_value: reward.rewardValue,
        status: reward.status,
        available_at: reward.availableAt,
        expires_at: reward.expiresAt,
        used_at: reward.usedAt,
        used_appointment_id: reward.usedAppointmentId,
        notes: reward.notes,
        updated_at: new Date().toISOString()
      };

      const res = await fetchSupabase(`/rest/v1/business_customer_campaign_rewards?id=eq.${reward.id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Prefer': 'resolution=merge-duplicates,return=representation' 
        },
        body: JSON.stringify(dbRow)
      });

      if (!res.ok) {
        await fetchSupabase(`/rest/v1/business_customer_campaign_rewards?id=eq.${reward.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbRow)
        });
      }
      return reward;
    } catch {
      return reward;
    }
  }
}
