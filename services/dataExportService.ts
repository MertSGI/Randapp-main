import { SalonBusinessProfile, Appointment, BusinessBranch, CustomerConsentFlags, CustomerDataRequest } from '../types';
import { mediaAssetService } from './mediaAssetService';

export interface TenantSnapshot {
  snapshotVersion: string;
  sourceMode: string;
  appBrand: string;
  exportedAt: string;
  tenantId: string;
  
  tenantAccount?: any;
  businessProfile?: SalonBusinessProfile | null;
  branches?: BusinessBranch[];
  catalog?: {
    services: any[];
    staff: any[];
    mappings: any;
    availability: any;
  };
  appointments?: Appointment[];
  customers?: any[];
  consents?: Record<string, CustomerConsentFlags>;
  dataRequests?: CustomerDataRequest[];
  shareChecklist?: Record<string, boolean>;
  campaigns?: any[];
  campaignRewards?: any[];
  referrals?: any[];
  onboardingState?: any;
  mediaAssets?: any[];
}

export const dataExportService = {
  getTenantStorageKeys(tenantId: string) {
    return {
      profile: `mock_business_profile_${tenantId}`,
      services: `randapp:${tenantId}:services`,
      staff: `randapp:${tenantId}:staff`,
      mappings: `randapp:${tenantId}:service_staff_mapping`,
      availability: `randapp:${tenantId}:availability_rules`,
      appointments: `randapp:${tenantId}:appointments`,
      customers: `randapp:${tenantId}:customers`, // if handled separately
      branches: `lari_branches_${tenantId}`,
      consents: `lari_customer_consents_by_tenant_${tenantId}`,
      dataRequests: `lari_customer_data_requests_by_tenant_${tenantId}`,
      shareChecklist: `lari_share_checklist_${tenantId}`,
    };
  },

  getAllLocalTenants(): any[] {
    try {
      const raw = localStorage.getItem('lari_registered_tenants') || localStorage.getItem('randapp_registered_tenants');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  getGlobalCampaignRecords(tenantId: string) {
    // Filter globally tracked collections by tenantId
    const safeParse = (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch {
        return [];
      }
    };
    
    const campaigns = safeParse('lari_customer_campaigns_by_tenant').filter((x: any) => x.tenantId === tenantId);
    const rewards = safeParse('lari_customer_campaign_rewards_by_tenant').filter((x: any) => x.tenantId === tenantId);
    const referrals = safeParse('lari_customer_referrals_by_tenant').filter((x: any) => x.tenantId === tenantId);
    
    return { campaigns, rewards, referrals };
  },

  exportTenantSnapshot(tenantId: string): TenantSnapshot | null {
    if (typeof window === 'undefined') return null;
    
    const tenants = this.getAllLocalTenants();
    const account = tenants.find(t => t.id === tenantId);
    if (!account) return null;

    const keys = this.getTenantStorageKeys(tenantId);
    const safeParse = (key: string, defaultVal: any) => {
       try {
         const val = localStorage.getItem(key);
         return val ? JSON.parse(val) : defaultVal;
       } catch {
         return defaultVal;
       }
    };

    const globals = this.getGlobalCampaignRecords(tenantId);

    // Filter out secrets or sensitive items from account object (like password hashes if they existed - though we don't store them here directly)
    // We safely clone the account object
    const safeAccount = { ...account };
    delete safeAccount.paymentMethod; // if raw card data ever accidentally slipped in, exclude it.

    return {
      snapshotVersion: 'lari-local-v1',
      sourceMode: 'local',
      appBrand: 'LARİ',
      exportedAt: new Date().toISOString(),
      tenantId,
      
      tenantAccount: safeAccount,
      businessProfile: safeParse(keys.profile, null),
      branches: safeParse(keys.branches, []),
      catalog: {
        services: safeParse(keys.services, []),
        staff: safeParse(keys.staff, []),
        mappings: safeParse(keys.mappings, {}),
        availability: safeParse(keys.availability, null)
      },
      appointments: safeParse(keys.appointments, []),
      customers: safeParse(keys.customers, []),
      consents: safeParse(keys.consents, {}), // Consent Service stores this as { [customerId]: Consent }
      dataRequests: safeParse(keys.dataRequests, []),
      shareChecklist: safeParse(keys.shareChecklist, {}),
      
      campaigns: globals.campaigns,
      campaignRewards: globals.rewards,
      referrals: globals.referrals,
      mediaAssets: mediaAssetService.listMediaAssetsForTenant(tenantId).map(a => mediaAssetService.mapMediaAssetForExport(a))
    };
  },

  validateTenantSnapshot(snapshot: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!snapshot) errors.push('Snapshot is null or undefined.');
    if (snapshot?.snapshotVersion !== 'lari-local-v1') errors.push('Unsupported snapshot version.');
    if (!snapshot?.tenantId) errors.push('Missing tenantId field.');
    if (!snapshot?.tenantAccount) errors.push('Missing tenantAccount data.');
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  importTenantSnapshot(snapshot: TenantSnapshot, overrideTenantId?: string): boolean {
    if (typeof window === 'undefined') return false;
    
    const { valid } = this.validateTenantSnapshot(snapshot);
    if (!valid) return false;
    
    const targetTenantId = overrideTenantId || snapshot.tenantId;

    // 1. Update/Add registered tenant array
    const tenants = this.getAllLocalTenants();
    const tIndex = tenants.findIndex(t => t.id === targetTenantId);
    
    const importedAccount = { ...snapshot.tenantAccount, id: targetTenantId };
    if (tIndex >= 0) {
      tenants[tIndex] = { ...tenants[tIndex], ...importedAccount };
    } else {
      tenants.push(importedAccount);
    }
    localStorage.setItem('lari_registered_tenants', JSON.stringify(tenants));

    // 2. Set tenant specific keys
    const keys = this.getTenantStorageKeys(targetTenantId);
    
    if (snapshot.businessProfile) localStorage.setItem(keys.profile, JSON.stringify(snapshot.businessProfile));
    if (snapshot.branches) localStorage.setItem(keys.branches, JSON.stringify(snapshot.branches));
    if (snapshot.catalog) {
      if (snapshot.catalog.services) localStorage.setItem(keys.services, JSON.stringify(snapshot.catalog.services));
      if (snapshot.catalog.staff) localStorage.setItem(keys.staff, JSON.stringify(snapshot.catalog.staff));
      if (snapshot.catalog.mappings) localStorage.setItem(keys.mappings, JSON.stringify(snapshot.catalog.mappings));
      if (snapshot.catalog.availability) localStorage.setItem(keys.availability, JSON.stringify(snapshot.catalog.availability));
    }
    
    if (snapshot.appointments) localStorage.setItem(keys.appointments, JSON.stringify(snapshot.appointments));
    if (snapshot.customers) localStorage.setItem(keys.customers, JSON.stringify(snapshot.customers));
    if (snapshot.consents) localStorage.setItem(keys.consents, JSON.stringify(snapshot.consents));
    if (snapshot.dataRequests) localStorage.setItem(keys.dataRequests, JSON.stringify(snapshot.dataRequests));
    if (snapshot.shareChecklist) localStorage.setItem(keys.shareChecklist, JSON.stringify(snapshot.shareChecklist));
    
    // 3. Merge Global Campaign/Referral Data
    const saveGlobal = (key: string, newItems: any[] = []) => {
      if (!newItems || newItems.length === 0) return;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      
      newItems.forEach(item => {
        // Change tenantId if imported to a new tenantID
        item.tenantId = targetTenantId; 
        
        const i = existing.findIndex((e:any) => e.id === item.id);
        if (i >= 0) existing[i] = item;
        else existing.push(item);
      });
      localStorage.setItem(key, JSON.stringify(existing));
    };

    saveGlobal('lari_customer_campaigns_by_tenant', snapshot.campaigns);
    saveGlobal('lari_customer_campaign_rewards_by_tenant', snapshot.campaignRewards);
    saveGlobal('lari_customer_referrals_by_tenant', snapshot.referrals);

    // 4. Restore Media Asset Records (Safe metadata references, excluding large base64 data payloads)
    if (snapshot.mediaAssets && snapshot.mediaAssets.length > 0) {
      const existingMedia = JSON.parse(localStorage.getItem('lari_media_assets') || '[]');
      snapshot.mediaAssets.forEach((asset: any) => {
        asset.tenantId = targetTenantId; 
        const mIdx = existingMedia.findIndex((m: any) => m.id === asset.id);
        if (mIdx >= 0) {
          existingMedia[mIdx] = asset;
        } else {
          existingMedia.push(asset);
        }
      });
      localStorage.setItem('lari_media_assets', JSON.stringify(existingMedia));
    }

    return true;
  },
  
  createBackupFileName(tenantId: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0,19);
    return `lari_backup_${tenantId}_${timestamp}.json`;
  },
  
  getSnapshotSummary(snapshot: TenantSnapshot) {
    return {
       tenantId: snapshot.tenantId,
       servicesCount: snapshot.catalog?.services?.length || 0,
       staffCount: snapshot.catalog?.staff?.length || 0,
       appointmentsCount: snapshot.appointments?.length || 0,
       branchesCount: snapshot.branches?.length || (snapshot.tenantId ? 1 : 0),
       hasBusinessProfile: !!snapshot.businessProfile,
       exportedAt: snapshot.exportedAt
    };
  }
};
