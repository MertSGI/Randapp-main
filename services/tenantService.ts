import { Tenant, TenantBranding } from '../types';
import { dataProvider } from './dataProvider';
import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';
import { shouldUsePilotLocalBypass } from './pilotBypassPolicy';

const DEMO_TENANT: Tenant = {
  id: 'tenant_demo',
  slug: 'demo',
  name: 'Nexus Studio',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  branding: {
    tenantId: 'tenant_demo',
    businessName: 'Nexus Studio',
    tagline: 'Premium Wellness & Style',
    footerText: 'Nexus Studio. All rights reserved.',
    primaryColor: '#000000',
  }
};

export const tenantService = {
  async resolveTenantFromHost(hostname: string): Promise<Tenant | null> {
    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      // In supabase mode (including staging), always resolve from DB regardless of hostname.
      // Localhost is a valid dev environment for real supabase testing.
      if (hostname === 'localhost' || hostname.startsWith('127.0.0.1')) {
        console.info('Supabase staging mode on localhost — resolving tenant from authenticated user profile.');
        // Fall through to DB resolution
      }

      const baseDomain = import.meta.env?.VITE_APP_BASE_DOMAIN;
      let querySlug = '';
      let isSubdomain = false;
      
      if (baseDomain && hostname.endsWith(`.${baseDomain}`)) {
        querySlug = hostname.replace(`.${baseDomain}`, '');
        isSubdomain = true;
      }

      const queryParams = isSubdomain 
        ? `slug.eq.${querySlug}` 
        : `custom_domain.eq.${hostname},slug.eq.${hostname.split('.')[0]}`; // Fallback to splitting host if no base domain logic matched

      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .or(queryParams)
        .single();
        
      if (tenant) {
        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          createdAt: tenant.created_at || new Date().toISOString(),
          updatedAt: tenant.updated_at || new Date().toISOString(),
        } as Tenant;
      }
      
      console.warn('Supabase tenant resolution failed. Tenant not found for host:', hostname);
      return null;
    }
    
    // Fallback or mock behavior
    return DEMO_TENANT;
  },

  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('lari_registered_tenants') : null;
    if (raw) {
      try {
        const tenants = JSON.parse(raw);
        const t = tenants.find((x: any) => x.id === tenantId);
        if (t) return t as Tenant;
      } catch (e) {}
    }
    return null;
  },

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .single();
      if (data) {
        return {
          id: data.id,
          slug: data.slug,
          name: data.name,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        } as Tenant;
      }
      return null;
    }
    
    // local mock
    const raw = localStorage.getItem('lari_registered_tenants');
    if (raw) {
      try {
        const tenants = JSON.parse(raw);
        const tenant = tenants.find((t: any) => t.slug === slug);
        if (tenant) return tenant;
      } catch(e) {}
    }
    return null;
  },

  async getCurrentTenant(): Promise<Tenant | null> {
    const hostname = window.location.hostname;
    
    // Check if slug is present in URL hash or path (e.g. /booking/:slug or /:slug)
    let urlSlug = '';
    const hash = window.location.hash || '';
    const path = window.location.pathname || '';
    
    // Parse Hash Routing e.g. #/booking/melis-guzellik or #/melis-guzellik
    if (hash) {
      const parts = hash.split('/');
      // hash usually starts with #/
      // e.g. #, booking, melis-guzellik
      if (parts.length >= 3 && parts[1] === 'booking') {
        urlSlug = parts[2].split('?')[0];
      } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer') {
        urlSlug = parts[1].split('?')[0];
      }
    }
    
    // Parse Path routing if not found in hash
    if (!urlSlug && path && path !== '/') {
      const parts = path.split('/');
      if (parts.length >= 3 && parts[1] === 'booking') {
        urlSlug = parts[2];
      } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer') {
        urlSlug = parts[1];
      }
    }
    
    if (urlSlug) {
      const resolved = await this.getTenantBySlug(urlSlug);
      if (resolved) {
        if ((resolved as any).status !== undefined) {
          resolved.status = (resolved as any).status;
        }
        return resolved;
      }
    }

    // In all modes, if we are specifically previewing pilot demo, return it.
    // This allows /pilot -> /#/tenant_pilot_demo flow to work even in production/supabase mode without breaking the publish gate.
    const activeTenantId = localStorage.getItem('lari_active_tenant_id');
    const isPilotDemoRoute = window.location.hash.includes('#/tenant_pilot_demo') || 
                             window.location.pathname.includes('/tenant_pilot_demo') ||
                             window.location.hash.includes('/pilot/customer') ||
                             window.location.pathname.includes('/pilot/customer');
    
    const allowPilotDemoTenant = shouldUsePilotLocalBypass(getDataSourceMode(), {
      activeTenantId,
      hash: window.location.hash,
      pathname: window.location.pathname,
    });

    if (allowPilotDemoTenant && (isPilotDemoRoute || activeTenantId === 'tenant_pilot_demo')) {
        try {
          // Dynamically import and seed data only, without establishing an owner session
          import('./pilotDemoService').then(({ pilotDemoService }) => {
            pilotDemoService.seedDemoDataOnly();
          });
        } catch (e) {
          console.error("Dynamic seed failed", e);
        }

        return {
             id: 'tenant_pilot_demo',
             slug: 'tenant_pilot_demo',
             name: 'Lumina Güzellik & Kuaför',
             status: 'active',
             createdAt: new Date().toISOString(),
             updatedAt: new Date().toISOString(),
             verificationStatus: 'approved',
             publicSiteStatus: 'published',
             businessRiskStatus: 'normal',
        } as Tenant;
    }

    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    if (mode === 'mock') {
       if (activeTenantId && activeTenantId !== 'tenant_pilot_demo') {
          const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || localStorage.getItem('lari_registered_tenants') || '[]');
          const tenantRecord = registeredArr.find((t: any) => t.id === activeTenantId);
          if (tenantRecord) {
             return {
                id: tenantRecord.id,
                slug: tenantRecord.slug || tenantRecord.id,
                name: tenantRecord.businessName,
                status: 'active',
                createdAt: tenantRecord.created_at || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                verificationStatus: tenantRecord.verificationStatus || 'not_submitted',
                publicSiteStatus: tenantRecord.publicSiteStatus || 'draft',
                businessRiskStatus: tenantRecord.businessRiskStatus || 'normal',
             } as Tenant;
          }
       }
    }
    
    if (mode.startsWith('supabase')) {
      // In supabase mode, resolve tenant from the authenticated user's profile.
      // This is the correct approach for admin panels where user is already signed in.
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log('getCurrentTenant: auth.getUser() result:', { userEmail: user?.email, userId: user?.id, userError });
        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('users_profile')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
          
          console.log('getCurrentTenant: users_profile result:', { profile, profileError });
          if (profile?.tenant_id) {
            const { data: tenantRow, error: tenantError } = await supabase
              .from('tenants')
              .select('*')
              .eq('id', profile.tenant_id)
              .single();
            
            console.log('getCurrentTenant: tenants result:', { tenantRow, tenantError });
            if (tenantRow) {
              return {
                id: tenantRow.id,
                slug: tenantRow.slug,
                name: tenantRow.name,
                status: tenantRow.status,
                createdAt: tenantRow.created_at || new Date().toISOString(),
                updatedAt: tenantRow.updated_at || new Date().toISOString(),
                verificationStatus: tenantRow.verification_status || 'approved',
                publicSiteStatus: tenantRow.public_site_status || 'draft',
                businessRiskStatus: tenantRow.business_risk_status || 'normal',
              } as Tenant;
            }
          }
        }
      } catch (e) {
        console.warn('Could not resolve tenant from user profile:', e);
      }
      // Fallback to host-based resolution for public/booking pages
      console.log('getCurrentTenant: falling back to resolveTenantFromHost for hostname:', hostname);
      return this.resolveTenantFromHost(hostname);
    }
    
    return this.resolveTenantFromHost(hostname);
  },

  async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    if (tenantId === 'tenant_pilot_demo') {
      return {
        tenantId: 'tenant_pilot_demo',
        businessName: 'Lumina Güzellik & Kuaför',
        tagline: 'Kendinizi özel hissedeceğiniz o yer',
        footerText: 'Lumina Güzellik. Tüm hakları saklıdır.',
        primaryColor: '#8b5cf6',
      } as TenantBranding;
    }
    
    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      const { data: branding, error } = await supabase
        .from('tenant_branding')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();
        
      if (branding) {
        return {
          tenantId: branding.tenant_id,
          businessName: branding.business_name || '',
          tagline: branding.tagline || '',
          footerText: branding.footer_text || '',
          logoUrl: branding.logo_url,
          primaryColor: branding.primary_color,
          secondaryColor: branding.accent_color,
          instagramUrl: branding.instagram_url,
          whatsappNumber: branding.whatsapp_number,
          address: branding.address,
        } as TenantBranding;
      }
      
      // Fallback: If no branding row exists in supabase, construct a default branding object using tenant info
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single();
      
      return {
        tenantId,
        businessName: tenantRow?.name || 'Güzellik Salonu',
        tagline: '',
        footerText: `${tenantRow?.name || 'Güzellik Salonu'}. Tüm hakları saklıdır.`,
        primaryColor: '#8b5cf6',
      } as TenantBranding;
    }
    
    const key = `lari:${tenantId}:branding`;
    return dataProvider.get<TenantBranding>(key);
  },

  async updateTenant(tenantId: string, updates: Partial<Tenant>): Promise<void> {
    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      const { error } = await supabase
        .from('tenants')
        .update({
          slug: updates.slug,
          name: updates.name,
          plan_id: updates.planId,
          custom_domain: updates.customDomain,
          status: updates.status,
          public_site_status: updates.publicSiteStatus,
          is_published: updates.isPublished
        })
        .eq('id', tenantId);
        
      if (error) {
        console.error("Error updating tenant in Supabase:", error);
      }
      return;
    }

    let raw = localStorage.getItem('lari_registered_tenants') || localStorage.getItem('lari_registered_tenants');
    if (!raw) {
      raw = '[]';
    }
    try {
      const tenants = JSON.parse(raw);
      const idx = tenants.findIndex((t: any) => t.id === tenantId);
      if (idx >= 0) {
        tenants[idx] = { ...tenants[idx], ...updates };
        
        // Sync exact fields
        if (updates.slug !== undefined) tenants[idx].slug = updates.slug;
        if (updates.isPublished !== undefined) tenants[idx].isPublished = updates.isPublished;
        if (updates.publicSiteStatus !== undefined) tenants[idx].publicSiteStatus = updates.publicSiteStatus;
      } else {
        const item = {
          id: tenantId,
          businessName: updates.name || 'Yeni İşletme',
          ownerEmail: 'manual@test.com',
          created_at: new Date().toISOString(),
          planId: updates.planId || 'free',
          verificationStatus: 'approved',
          publicSiteStatus: updates.publicSiteStatus || (updates.isPublished ? 'published' : 'draft'),
          status: 'active',
          ...updates
        };
        tenants.push(item);
      }
      localStorage.setItem('lari_registered_tenants', JSON.stringify(tenants));
      localStorage.setItem('lari_registered_tenants', JSON.stringify(tenants));
    } catch (e) {}
  },

  async updateTenantBranding(tenantId: string, updates: Partial<TenantBranding>): Promise<TenantBranding | null> {
    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    
    // Get existing to merge
    const current = await this.getTenantBranding(tenantId) || { tenantId } as TenantBranding;
    const next = { ...current, ...updates };

    if (mode.startsWith('supabase')) {
      const { data, error } = await supabase
        .from('tenant_branding')
        .upsert({
          tenant_id: tenantId,
          business_name: next.businessName,
          tagline: next.tagline,
          footer_text: next.footerText,
          logo_url: next.logoUrl,
          primary_color: next.primaryColor,
          accent_color: next.secondaryColor,
          instagram_url: next.instagramUrl,
          whatsapp_number: next.whatsappNumber,
          address: next.address
        }, { onConflict: 'tenant_id' });
        
      if (error) {
        console.error("Error updating branding:", error);
        return null;
      }
      return next;
    }

    const key = `lari:${tenantId}:branding`;
    await dataProvider.set(key, next);
    return next;
  }
};

