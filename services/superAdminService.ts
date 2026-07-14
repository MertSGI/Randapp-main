import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';

export interface TenantInfo {
  id: string;
  slug?: string;
  businessName: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  domain: string | null;
  created_at: string;
  status?: string;
  onboardingStatus?: string;
  publicSiteStatus?: string;
  businessContactEmail?: string | null;
}

export interface TenantFullData {
  tenant: TenantInfo;
  subscriptionStatus: string;
  planId: string;
  setupStatus: string;
  monthlyAppointments: number;
  estimatedRevenue: number;
  hasProfile?: boolean;
  businessProfile?: any;
}

export const superAdminService = {
  async getDashboardData(): Promise<{
    stats: {
      totalSalons: number;
      activeSalons: number;
      trialSalons: number;
      pastDueSalons: number;
      suspendedSalons: number;
      monthlyRecurringRevenue: number;
      setupFees: number;
      awaitingSetup: number;
      liveSalons: number;
    },
    tenants: TenantFullData[]
  }> {
    
    const mode = getDataSourceMode();

    if (mode !== 'supabase') {
      const { dataProvider } = await import('./dataProvider');
      const provStatus1 = await dataProvider.get<string>(`lari:mock_tenant_1:provisioning_status`) || 'live';
      const provStatus2 = await dataProvider.get<string>(`lari:tenant_demo:provisioning_status`) || 'setup_in_progress';
      
      const tenants = [
          {
            tenant: {
              id: 'mock_tenant_1',
              businessName: 'Vibes Hair Studio',
              ownerUserId: 'mock-uid-1',
              ownerEmail: 'owner@vibes.com',
              domain: 'vibes.randevulari.com',
              created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'active',
              onboardingStatus: 'completed',
              publicSiteStatus: 'published'
            },
            subscriptionStatus: 'active',
            planId: 'pro',
            setupStatus: provStatus1,
            monthlyAppointments: 145,
            estimatedRevenue: 45000,
            hasProfile: true
          },
          {
            tenant: {
              id: 'tenant_demo',
              businessName: 'Nexus Studio',
              ownerUserId: 'mock-uid-2',
              ownerEmail: 'admin@nexus.com',
              domain: 'nexus.randevulari.com',
              created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'active',
              onboardingStatus: 'pending',
              publicSiteStatus: 'preview_ready'
            },
            subscriptionStatus: 'trialing',
            planId: 'pro',
            setupStatus: provStatus2,
            monthlyAppointments: 12,
            estimatedRevenue: 3000,
            hasProfile: true
          }
      ];

      const registeredRaw = localStorage.getItem('lari_registered_tenants');
      const dynamicTenants: TenantFullData[] = !registeredRaw ? [] : JSON.parse(registeredRaw).map((t: any) => ({
        tenant: {
          id: t.id,
          slug: t.slug,
          businessName: t.name,
          ownerUserId: 'mock-owner',
          ownerEmail: 'owner@' + t.slug + '.com',
          domain: `${t.slug}.randevulari.com`,
          created_at: t.createdAt || new Date().toISOString(),
          status: t.status,
          onboardingStatus: t.onboardingStatus || 'pending',
          publicSiteStatus: t.publicSiteStatus || 'draft'
        },
        subscriptionStatus: 'none',
        planId: 'none',
        setupStatus: t.onboardingStatus || 'pending',
        monthlyAppointments: 0,
        estimatedRevenue: 0,
        hasProfile: true
      }));

      const allTenants = [...tenants, ...dynamicTenants];

      return {
        stats: {
          totalSalons: 15 + dynamicTenants.length,
          activeSalons: 10 + dynamicTenants.length,
          trialSalons: 3 + dynamicTenants.length,
          pastDueSalons: 1,
          suspendedSalons: 1,
          monthlyRecurringRevenue: 18500,
          setupFees: 4500,
          awaitingSetup: allTenants.filter(t => t.setupStatus !== 'live').length,
          liveSalons: 10
        },
        tenants: allTenants
      };
    }

    // In 'supabase' mode, pull real data
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
    const { data: subs, error: sErr } = await supabase.from('subscriptions').select('*');
    const { data: profiles, error: pErr } = await supabase.from('tenant_business_profiles').select('*');
    const { data: userProfiles, error: upErr } = await supabase.from('users_profile').select('*');
    
    if (tErr || sErr) {
      console.error("Error fetching super admin data", tErr, sErr);
      throw new Error("Veri çekilemedi.");
    }

    const getOwnerEmail = (ownerUserId: string) => {
      const matchedProfile = userProfiles?.find(up => up.id === ownerUserId);
      if (matchedProfile && matchedProfile.email) {
        return matchedProfile.email;
      }
      return null;
    };

    const tenantList: TenantFullData[] = (tenants || []).map(t => {
      const sub = subs?.find(s => s.tenant_id === t.id);
      const prof = profiles?.find((p: any) => p.tenant_id === t.id);
      
      const resolvedBusinessName = (prof && prof.public_display_name) || 
                                    t.name || 
                                    t.official_business_name || 
                                    'İsimsiz';

      return {
        tenant: {
          id: t.id,
          slug: t.slug,
          businessName: resolvedBusinessName,
          ownerUserId: t.owner_user_id || null,
          ownerEmail: t.owner_user_id ? getOwnerEmail(t.owner_user_id) : null,
          domain: t.custom_domain || `${t.slug}.randevulari.com`,
          created_at: t.created_at,
          status: t.status,
          onboardingStatus: t.onboarding_status,
          publicSiteStatus: t.public_site_status,
          businessContactEmail: prof?.email || null
        },
        subscriptionStatus: t.subscription_status || sub?.status || 'none',
        planId: sub?.plan_id || 'none',
        setupStatus: t.onboarding_status || t.provisioning_status || 'unknown',
        monthlyAppointments: 0,
        estimatedRevenue: 0,
        hasProfile: !!prof
      }
    });

    return {
      stats: {
         totalSalons: tenantList.length,
         activeSalons: tenantList.filter(t => t.subscriptionStatus === 'active' || t.subscriptionStatus === 'manual_active').length,
         trialSalons: tenantList.filter(t => t.subscriptionStatus === 'trialing').length,
         pastDueSalons: tenantList.filter(t => t.subscriptionStatus === 'past_due').length,
         suspendedSalons: tenantList.filter(t => t.subscriptionStatus === 'suspended').length,
         monthlyRecurringRevenue: tenantList.filter(t => t.subscriptionStatus === 'active' || t.subscriptionStatus === 'manual_active').length * 499,
         setupFees: 0,
         awaitingSetup: tenantList.filter(t => t.setupStatus !== 'live' && t.setupStatus !== 'completed').length,
         liveSalons: tenantList.filter(t => t.setupStatus === 'live' || t.setupStatus === 'completed').length
      },
      tenants: tenantList
    };
  },

  async approveGoLive(tenantId: string): Promise<boolean> {
    const mode = getDataSourceMode();
    if (mode !== 'supabase') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`lari:${tenantId}:go_live_status`, 'live');
       await dataProvider.set(`lari:${tenantId}:provisioning_status`, 'live');
       
       const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
       const index = registeredArr.findIndex((t: any) => t.id === tenantId);
       if (index !== -1) {
          registeredArr[index].publicSiteStatus = 'published';
          registeredArr[index].verificationStatus = 'approved';
          localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
       }
       return new Promise(resolve => setTimeout(() => resolve(true), 500));
    }

    const { data, error } = await supabase.rpc('approve_and_publish_tenant', {
      p_tenant_id: tenantId
    });

    if (error) {
       console.error("Super admin live approval failed", error);
       throw new Error(error.message || "Yayına alma işlemi başarısız oldu.");
    }

    // Validate that the returned persisted state is fully complete.
    if (!data || !data.tenant || !data.subscription) {
      throw new Error("Persisted state validation failed: Incomplete payload returned from server.");
    }

    const { tenant, subscription } = data;
    if (tenant.status !== 'active' || tenant.onboarding_status !== 'completed' || tenant.public_site_status !== 'published') {
      throw new Error("Persisted tenant fields do not match expected published state.");
    }

    if (subscription.status !== 'manual_active' || subscription.plan_id !== 'premium_monthly') {
      throw new Error("Persisted subscription entitlement does not match manual_active premium plan.");
    }

    return true;
  },

  async sendBackToSetup(tenantId: string, internalNote: string): Promise<boolean> {
     const mode = getDataSourceMode();
     if (mode !== 'supabase') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`lari:${tenantId}:go_live_status`, 'needs_changes');
       await dataProvider.set(`lari:${tenantId}:provisioning_status`, 'setup_in_progress');
       
       const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
       const index = registeredArr.findIndex((t: any) => t.id === tenantId);
       if (index !== -1) {
          registeredArr[index].publicSiteStatus = 'preview_ready';
          registeredArr[index].verificationStatus = 'rejected';
          localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
       }
       return new Promise(resolve => setTimeout(() => resolve(true), 500));
     }
     const { error } = await supabase.from('tenants').update({ 
       provisioning_status: 'setup_in_progress',
       go_live_status: 'needs_changes',
       public_site_status: 'preview_ready',
       verification_status: 'rejected'
     }).eq('id', tenantId);
     if (error) throw error;
     return true;
  },

  async pauseBookings(tenantId: string): Promise<boolean> {
     const mode = getDataSourceMode();
     if (mode !== 'supabase') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`lari:${tenantId}:go_live_status`, 'paused');
       return new Promise(resolve => setTimeout(() => resolve(true), 500));
     }
     const { error } = await supabase.from('tenants').update({ 
       go_live_status: 'paused'
     }).eq('id', tenantId);
     if (error) throw error;
     return true;
  },

  async forceSubscriptionStatus(tenantId: string, status: string): Promise<boolean> {
     const mode = getDataSourceMode();
     if (mode !== 'supabase') {
        const { dataProvider } = await import('./dataProvider');
        let mockSubscription = await dataProvider.get<any>(`subscription_${tenantId}`);
        if (!mockSubscription) {
            mockSubscription = {
                id: 'sub_mock',
                tenantId: tenantId,
                planId: 'professional',
                status: status,
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString()
            };
        } else {
            mockSubscription.status = status;
        }
        await dataProvider.set(`subscription_${tenantId}`, mockSubscription);
        return new Promise(resolve => setTimeout(() => resolve(true), 300));
     }
     
     const { error } = await supabase.from('subscriptions').update({ status }).eq('tenant_id', tenantId);
     if (error) throw error;
     return true;
  }
};
