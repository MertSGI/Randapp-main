import { ReferralCampaign, ReferralCode, ReferralLead } from '../types';
import { createSuccess, createError, MutationResult } from '../utils/mutationResult';

// Mock storage keys
const CAMPAIGNS_KEY = 'randapp_referral_campaigns';
const CODES_KEY = 'randapp_referral_codes';
const LEADS_KEY = 'randapp_referral_leads';

const defaultPlatformCampaigns: ReferralCampaign[] = [
  {
    id: 'campaign_b2p_1',
    tenantId: 'global',
    campaignType: 'business_referral',
    title: 'Platform Growth: Refer a Business',
    description: 'Refer another salon to LARİ and earn a free month!',
    rewardType: 'free_month',
    rewardValue: '1', // 1 month
    active: true,
    createdBy: 'super_admin',
    startDate: new Date().toISOString(),
  }
];

export const referralService = {
  // Campaigns
  getCampaigns: (tenantId: string): ReferralCampaign[] => {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    const campaigns: ReferralCampaign[] = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultPlatformCampaigns));
    return campaigns.filter(c => c.tenantId === tenantId);
  },

  getAllCampaignsForSuperAdmin: (): ReferralCampaign[] => {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultPlatformCampaigns));
  },

  saveCampaign: (campaign: ReferralCampaign) => {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    const campaigns: ReferralCampaign[] = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultPlatformCampaigns));
    
    // Deep clone campaign
    const newCamp = JSON.parse(JSON.stringify(campaign));
    const existingIndex = campaigns.findIndex(c => c.id === newCamp.id);
    if (existingIndex > -1) {
      campaigns[existingIndex] = newCamp;
    } else {
      campaigns.push(newCamp);
    }
    
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
  },

  deleteCampaign: (campaignId: string): MutationResult<void> => {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    let campaigns: ReferralCampaign[] = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaultPlatformCampaigns));
    
    const cmpg = campaigns.find(c => c.id === campaignId);
    if (!cmpg) return createError('deleted', 'action_failed');

    // Check if codes generated for campaign 
    const rawCodes = localStorage.getItem(CODES_KEY);
    const codes: ReferralCode[] = rawCodes ? JSON.parse(rawCodes) : [];
    const hasCodes = codes.some(c => c.campaignId === campaignId);

    if (hasCodes) {
       // deactivate
       const newList = campaigns.map(c => c.id === campaignId ? { ...c, active: false } : c);
       localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(newList));
       return createSuccess('deactivated');
    }

    campaigns = campaigns.filter(c => c.id !== campaignId);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    return createSuccess('deleted');
  },

  // Codes
  getCodesForCampaign: (campaignId: string): ReferralCode[] => {
    const raw = localStorage.getItem(CODES_KEY);
    const codes: ReferralCode[] = raw ? JSON.parse(raw) : [];
    return codes.filter(c => c.campaignId === campaignId);
  },

  getCodesByReferrer: (referrerId: string): ReferralCode[] => {
    const raw = localStorage.getItem(CODES_KEY);
    const codes: ReferralCode[] = raw ? JSON.parse(raw) : [];
    return codes.filter(c => c.referrerId === referrerId);
  },

  generateCode: (campaignId: string, referrerType: 'customer' | 'tenant', referrerId: string): ReferralCode => {
    const raw = localStorage.getItem(CODES_KEY);
    const codes: ReferralCode[] = raw ? JSON.parse(raw) : [];
    
    const newCode: ReferralCode = {
      id: `code_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      campaignId,
      referrerType,
      referrerId,
      code: `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      usageCount: 0,
      status: 'active'
    };
    
    codes.push(newCode);
    localStorage.setItem(CODES_KEY, JSON.stringify(codes));
    return newCode;
  },

  // Leads
  getLeadsForCode: (referralCode: string): ReferralLead[] => {
    const raw = localStorage.getItem(LEADS_KEY);
    const leads: ReferralLead[] = raw ? JSON.parse(raw) : [];
    return leads.filter(l => l.referralCode === referralCode);
  },

  getLeadsForCampaign: (campaignId: string): ReferralLead[] => {
     const raw = localStorage.getItem(LEADS_KEY);
     const allLeads: ReferralLead[] = raw ? JSON.parse(raw) : [];
     
     return allLeads.filter(l => l.campaignId === campaignId);
  },

  trackLead: (code: string, leadName: string, leadEmail?: string): ReferralLead | null => {
     const rawCodes = localStorage.getItem(CODES_KEY);
     const codes: ReferralCode[] = rawCodes ? JSON.parse(rawCodes) : [];
     
     const foundCode = codes.find(c => c.code === code && c.status === 'active');
     if (!foundCode) return null;
     
     const rawLeads = localStorage.getItem(LEADS_KEY);
     const leads: ReferralLead[] = rawLeads ? JSON.parse(rawLeads) : [];
     
     const newLead: ReferralLead = {
         id: `lead_${Date.now()}`,
         campaignId: foundCode.campaignId,
         referralCode: foundCode.code,
         leadName,
         leadEmail,
         status: 'pending',
         createdAt: new Date().toISOString()
     };
     
     leads.push(newLead);
     localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
     return newLead;
  },

  convertLead: (leadId: string) => {
     const rawLeads = localStorage.getItem(LEADS_KEY);
     const leads: ReferralLead[] = rawLeads ? JSON.parse(rawLeads) : [];
     
     const existingIndex = leads.findIndex(l => l.id === leadId);
     if (existingIndex > -1 && leads[existingIndex].status === 'pending') {
         leads[existingIndex].status = 'converted';
         localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
         
         // Update usage count
         const rawCodes = localStorage.getItem(CODES_KEY);
         const codes: ReferralCode[] = rawCodes ? JSON.parse(rawCodes) : [];
         const codeIndex = codes.findIndex(c => c.code === leads[existingIndex].referralCode);
         if (codeIndex > -1) {
             codes[codeIndex].usageCount++;
             localStorage.setItem(CODES_KEY, JSON.stringify(codes));
         }
     }
  }
};
