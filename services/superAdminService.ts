import { supabase } from './supabaseClient';

export interface TenantInfo {
  id: string;
  businessName: string | null;
  ownerEmail: string | null;
  domain: string | null;
  created_at: string;
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
    
    // In a real environment with RLS, the super_admin user must have permissions
    // Here we assume service role or RLS policies permit super_admin to read all.
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';

    if (mode === 'mock') {
      const { dataProvider } = await import('./dataProvider');
      const provStatus1 = await dataProvider.get<string>(`randapp:mock_tenant_1:provisioning_status`) || 'live';
      const provStatus2 = await dataProvider.get<string>(`randapp:tenant_demo:provisioning_status`) || 'setup_in_progress';
      
      const tenants = [
          {
            tenant: {
              id: 'mock_tenant_1',
              businessName: 'Vibes Hair Studio',
              ownerEmail: 'owner@vibes.com',
              domain: 'vibes.randapp.com',
              created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
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
              ownerEmail: 'admin@nexus.com',
              domain: 'nexus.randapp.com',
              created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            subscriptionStatus: 'trialing',
            planId: 'premium',
            setupStatus: provStatus2,
            monthlyAppointments: 12,
            estimatedRevenue: 1200,
            hasProfile: true
          },
          {
            tenant: {
              id: 'mock_tenant_3',
              businessName: 'Luxe Beauty Clinic',
              ownerEmail: 'contact@luxe.com',
              domain: 'luxe.randapp.com',
              created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
            },
            subscriptionStatus: 'active',
            planId: 'premium',
            setupStatus: 'live',
            monthlyAppointments: 320,
            estimatedRevenue: 120000,
            hasProfile: true
          },
          {
            tenant: {
              id: 'mock_tenant_4',
              businessName: 'Barber Bros',
              ownerEmail: 'hi@barberbros.com',
              domain: 'barberbros.randapp.com',
              created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            subscriptionStatus: 'past_due',
            planId: 'starter',
            setupStatus: 'live',
            monthlyAppointments: 45,
            estimatedRevenue: 4500,
            hasProfile: true
          }
        ];
        
      const localTenantsRaw = localStorage.getItem('lari_registered_tenants') || localStorage.getItem('randapp_registered_tenants');
      const localTenants = localTenantsRaw ? JSON.parse(localTenantsRaw) : [];
      
      const dynamicTenants = localTenants.map((rt: any) => ({
        tenant: {
          id: rt.id,
          businessName: rt.businessName,
          ownerEmail: rt.ownerEmail,
          domain: `${rt.id}.lari.com`,
          created_at: rt.created_at
        },
        subscriptionStatus: 'trialing',
        planId: rt.planId || 'professional',
        setupStatus: 'setup_in_progress',
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

    // In 'supabase' mode, pull real data (Simplified for MVP, would normally be an Edge Function or complex View)
    // 1. Get tenants
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
    // 2. Get subscriptions
    const { data: subs, error: sErr } = await supabase.from('subscriptions').select('*');
    const { data: profiles, error: pErr } = await supabase.from('tenant_business_profiles').select('tenant_id');
    
    if (tErr || sErr) {
      console.error("Error fetching super admin data", tErr, sErr);
      throw new Error("Veri çekilemedi.");
    }

    const tenantList: TenantFullData[] = (tenants || []).map(t => {
      const sub = subs?.find(s => s.tenant_id === t.id);
      const prof = profiles?.find((p: any) => p.tenant_id === t.id);
      return {
        tenant: {
          id: t.id,
          businessName: t.business_name,
          ownerEmail: t.user_id, // we might need to join auth.users locally or via function
          domain: t.custom_domain,
          created_at: t.created_at
        },
        subscriptionStatus: sub?.status || 'none',
        planId: sub?.plan_id || 'none',
        setupStatus: t.provisioning_status || 'unknown',
        monthlyAppointments: 0, // Requires appointment count aggregation
        estimatedRevenue: 0,     // Requires appointment price aggregation
        hasProfile: !!prof
      }
    });

    return {
      stats: {
         totalSalons: tenantList.length,
         activeSalons: tenantList.filter(t => t.subscriptionStatus === 'active').length,
         trialSalons: tenantList.filter(t => t.subscriptionStatus === 'trialing').length,
         pastDueSalons: tenantList.filter(t => t.subscriptionStatus === 'past_due').length,
         suspendedSalons: tenantList.filter(t => t.subscriptionStatus === 'suspended').length,
         monthlyRecurringRevenue: tenantList.filter(t => t.subscriptionStatus === 'active').length * 499, // naive
         setupFees: 0,
         awaitingSetup: tenantList.filter(t => t.setupStatus !== 'live').length,
         liveSalons: tenantList.filter(t => t.setupStatus === 'live').length
      },
      tenants: tenantList
    };
  },

  async approveGoLive(tenantId: string): Promise<boolean> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'mock') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`randapp:${tenantId}:go_live_status`, 'live');
       await dataProvider.set(`randapp:${tenantId}:provisioning_status`, 'live');
       
       const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
       const index = registeredArr.findIndex((t: any) => t.id === tenantId);
       if (index !== -1) {
          registeredArr[index].publicSiteStatus = 'published';
          registeredArr[index].verificationStatus = 'approved';
          localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
       }
       return new Promise(resolve => setTimeout(() => resolve(true), 500));
    }
    const { error } = await supabase.from('tenants').update({ 
      provisioning_status: 'live',
      go_live_status: 'live', // if column exists
      public_site_status: 'published',
      verification_status: 'approved'
    }).eq('id', tenantId);
    if (error) {
       console.error("Super admin live approval failed", error);
       throw error;
    }
    return true;
  },

  async sendBackToSetup(tenantId: string, internalNote: string): Promise<boolean> {
     const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
     if (mode === 'mock') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`randapp:${tenantId}:go_live_status`, 'needs_changes');
       await dataProvider.set(`randapp:${tenantId}:provisioning_status`, 'setup_in_progress');
       
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
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
     if (mode === 'mock') {
       const { dataProvider } = await import('./dataProvider');
       await dataProvider.set(`randapp:${tenantId}:go_live_status`, 'paused');
       return new Promise(resolve => setTimeout(() => resolve(true), 500));
     }
     const { error } = await supabase.from('tenants').update({ 
       go_live_status: 'paused'
     }).eq('id', tenantId);
     if (error) throw error;
     return true;
  },

  async forceSubscriptionStatus(tenantId: string, status: string): Promise<boolean> {
     const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
     if (mode === 'mock') {
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
