import { Tenant, TenantBranding } from '../types';
import { dataProvider } from './dataProvider';
import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';
import { shouldUsePilotLocalBypass } from './pilotBypassPolicy';
import { STORAGE_KEYS, DYNAMIC_STORAGE_KEYS } from './storageKeys';

export interface TenantAccessValidationResult {
  allowed: boolean;
  status: number;
  reason: 'same_tenant_authorized' | 'super_admin_authorized' | 'cross_tenant_access_forbidden' | 'unauthenticated_or_missing_tenant';
  message: string;
}

export class CrossTenantAccessError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly callerTenantId?: string | null;
  readonly targetTenantId?: string | null;

  constructor(reason: string, status = 403, callerTenantId?: string | null, targetTenantId?: string | null) {
    super(`[CrossTenantAccessError] 403 Forbidden: Caller tenant '${callerTenantId || 'none'}' attempted unauthorized cross-tenant access to target tenant '${targetTenantId || 'none'}' (${reason})`);
    this.name = 'CrossTenantAccessError';
    this.status = status;
    this.reason = reason;
    this.callerTenantId = callerTenantId;
    this.targetTenantId = targetTenantId;
  }
}

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
  /**
   * Kiracılar arası (cross-tenant) erişim girişimini denetler.
   * Farklı iki kiracı arasındaki erişim taleplerini HTTP 403 ile engeller.
   */
  validateCrossTenantAccess(
    callerTenantId: string | null | undefined,
    targetTenantId: string | null | undefined,
    role?: string
  ): TenantAccessValidationResult {
    if (role === 'super_admin') {
      return {
        allowed: true,
        status: 200,
        reason: 'super_admin_authorized',
        message: 'Super Admin platform çapında yetkilidir.',
      };
    }

    if (!callerTenantId || !targetTenantId) {
      return {
        allowed: false,
        status: 401,
        reason: 'unauthenticated_or_missing_tenant',
        message: 'Kimlik doğrulama bağlamı veya hedef kiracı kimliği eksik.',
      };
    }

    if (callerTenantId !== targetTenantId) {
      return {
        allowed: false,
        status: 403,
        reason: 'cross_tenant_access_forbidden',
        message: `Çapraz kiracı erişimi engellendi: '${callerTenantId}' kiracısı '${targetTenantId}' kiracısının verilerine erişemez.`,
      };
    }

    return {
      allowed: true,
      status: 200,
      reason: 'same_tenant_authorized',
      message: 'Aynı kiracı bağlamı doğrulandı.',
    };
  },

  /**
   * Kiracılar arası yetkisiz erişimi doğrular; ihlal durumunda CrossTenantAccessError (HTTP 403) fırlatır.
   */
  assertTenantAccess(
    callerTenantId: string | null | undefined,
    targetTenantId: string | null | undefined,
    role?: string
  ): void {
    const res = this.validateCrossTenantAccess(callerTenantId, targetTenantId, role);
    if (!res.allowed) {
      throw new CrossTenantAccessError(res.reason, res.status, callerTenantId, targetTenantId);
    }
  },

  async resolveTenantFromHost(hostname: string): Promise<Tenant | null> {
    if (!hostname) return null;

    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    const baseDomain = (import.meta.env?.VITE_APP_BASE_DOMAIN || 'randevulari.com').trim().toLowerCase();
    
    // Port stripping and normalization (e.g., 'salon-a.randevulari.com:3000' -> 'salon-a.randevulari.com')
    const cleanHost = hostname.split(':')[0].trim().toLowerCase();
    if (!cleanHost) return null;

    const isLoopback = cleanHost === 'localhost' || cleanHost.startsWith('127.') || cleanHost === '0.0.0.0';
    const isRootDomain = cleanHost === baseDomain || cleanHost === `www.${baseDomain}`;

    let isTenantSubdomain = false;
    let querySlug = '';

    // Only hosts strictly ending in .<baseDomain> are candidate subdomains (FINDING-ADIM018-005)
    if (baseDomain && cleanHost.endsWith(`.${baseDomain}`)) {
      const candidateSlug = cleanHost.slice(0, -(baseDomain.length + 1)).trim();
      if (candidateSlug && candidateSlug !== 'www') {
        isTenantSubdomain = true;
        querySlug = candidateSlug;
      }
    }

    // Other dotted hosts that are not loopback and not root domain are exact custom domains
    const isCustomDomain = !isLoopback && !isRootDomain && !isTenantSubdomain && cleanHost.includes('.');

    if (mode.startsWith('supabase')) {
      if (isTenantSubdomain && querySlug) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', querySlug)
          .maybeSingle();

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

        console.warn('Supabase tenant resolution failed for subdomain:', cleanHost);
        return null;
      }

      if (isCustomDomain) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('*')
          .eq('custom_domain', cleanHost)
          .maybeSingle();

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

        console.warn('Supabase tenant resolution failed for custom domain:', cleanHost);
        return null;
      }

      if (isLoopback || isRootDomain) {
        return DEMO_TENANT;
      }

      return null;
    }

    // In mock or local mode:
    if (isTenantSubdomain && querySlug) {
      const resolved = await this.getTenantBySlug(querySlug);
      if (resolved) return resolved;
      return null; // Fail-closed for unknown subdomain
    }

    if (isCustomDomain) {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS) : null;
      if (raw) {
        try {
          const tenants = JSON.parse(raw);
          const matched = tenants.find((t: any) => 
            (t.customDomain && String(t.customDomain).trim().toLowerCase() === cleanHost) ||
            (t.custom_domain && String(t.custom_domain).trim().toLowerCase() === cleanHost)
          );
          if (matched) {
            return {
              id: matched.id,
              slug: matched.slug || matched.id,
              name: matched.businessName || matched.name,
              status: matched.status || 'active',
              createdAt: matched.created_at || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              verificationStatus: matched.verificationStatus || 'approved',
              publicSiteStatus: matched.publicSiteStatus || 'published',
              businessRiskStatus: matched.businessRiskStatus || 'normal',
            } as Tenant;
          }
        } catch (e) {}
      }
      return null; // Fail-closed for unknown custom domain
    }

    if (isLoopback || isRootDomain) {
      return DEMO_TENANT;
    }

    return null;
  },

  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS) : null;
    if (raw) {
      try {
        const tenants = JSON.parse(raw);
        const t = tenants.find((x: any) => x.id === tenantId);
        if (t) return t as Tenant;
      } catch (e) {}
    }
    const isLocalMode = getDataSourceMode() === 'local';
    if (tenantId === 'synthetic_salon_aura_001' && isLocalMode) {
      const { SYNTHETIC_SALON_AURA } = await import('./syntheticSalonFixtureService');
      return {
        id: SYNTHETIC_SALON_AURA.tenantId,
        slug: SYNTHETIC_SALON_AURA.slug,
        name: SYNTHETIC_SALON_AURA.businessName,
        status: 'active',
        publicSiteStatus: 'published',
        verificationStatus: 'approved',
        businessRiskStatus: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Tenant;
    }
    return null;
  },

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const mode = (import.meta as any)?.env?.VITE_DATA_MODE || 'mock';
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
    const raw = localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS);
    if (raw) {
      try {
        const tenants = JSON.parse(raw);
        const tenant = tenants.find((t: any) => t.slug === slug);
        if (tenant) return tenant;
      } catch(e) {}
    }
    const isLocalMode = getDataSourceMode() === 'local';
    if (slug === 'aura-nisantasi' && isLocalMode) {
      const { SYNTHETIC_SALON_AURA } = await import('./syntheticSalonFixtureService');
      return {
        id: SYNTHETIC_SALON_AURA.tenantId,
        slug: SYNTHETIC_SALON_AURA.slug,
        name: SYNTHETIC_SALON_AURA.businessName,
        status: 'active',
        publicSiteStatus: 'published',
        verificationStatus: 'approved',
        businessRiskStatus: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Tenant;
    }
    if (slug === 'tenant_pilot_demo') {
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
    return null;
  },

  async getCurrentTenant(): Promise<Tenant | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    const hash = window.location.hash || '';
    const path = window.location.pathname || '';

    if (hash.includes('/appointment/manage') || path.includes('/appointment/manage')) {
      return null;
    }

    const hostname = window.location.hostname;
    
    // Check if slug is present in URL hash or path (e.g. /booking/:slug or /:slug)
    let urlSlug = '';
    
    // Parse Hash Routing e.g. #/booking/melis-guzellik or #/melis-guzellik
    if (hash) {
      const parts = hash.split('/');
      // hash usually starts with #/
      // e.g. #, booking, melis-guzellik
      if (parts.length >= 3 && parts[1] === 'booking') {
        urlSlug = parts[2].split('?')[0];
      } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'booking' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer' && parts[1] !== 'appointment' && parts[1] !== 'ai-visualizer' && parts[1] !== 'admin-preview') {
        urlSlug = parts[1].split('?')[0];
      }
    }
    
    // Parse Path routing if not found in hash
    if (!urlSlug && path && path !== '/') {
      const parts = path.split('/');
      if (parts.length >= 3 && parts[1] === 'booking') {
        urlSlug = parts[2];
      } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'booking' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer' && parts[1] !== 'appointment' && parts[1] !== 'ai-visualizer' && parts[1] !== 'admin-preview') {
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
      return null;
    }

    // In all modes, if we are specifically previewing pilot demo, return it.
    // This allows /pilot -> /#/tenant_pilot_demo flow to work even in production/supabase mode without breaking the publish gate.
    const activeTenantId = localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID);
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
    if (mode === 'mock' || mode === 'local') {
       if (activeTenantId && activeTenantId !== 'tenant_pilot_demo') {
          const registeredArr = JSON.parse(localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS) || '[]');
          const tenantRecord = registeredArr.find((t: any) => t.id === activeTenantId);
          if (tenantRecord) {
             const isAdminRoute = hash.includes('/admin') || path.includes('/admin');
             if (hostname && hostname !== 'localhost' && !hostname.startsWith('127.')) {
               const hostTenant = await this.resolveTenantFromHost(hostname);
               if (isAdminRoute) {
                 // In admin route, require every non-local host to resolve successfully AND equal authenticated tenant (FINDING-ADIM018-004)
                 if (!hostTenant || hostTenant.id !== tenantRecord.id) {
                   console.warn(`[SECURITY] Cross-tenant or unresolved admin access blocked: User belongs to ${tenantRecord.id} but host resolved to ${hostTenant?.id || 'null'}`);
                   return null;
                 }
               } else if (hostTenant && hostTenant.id !== tenantRecord.id) {
                 return hostTenant;
               }
             }

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
              const isAdminRoute = hash.includes('/admin') || path.includes('/admin');
              if (hostname && hostname !== 'localhost' && !hostname.startsWith('127.')) {
                const hostTenant = await this.resolveTenantFromHost(hostname);
                if (isAdminRoute) {
                  // In admin route, require every non-local host to resolve successfully AND equal authenticated tenant (FINDING-ADIM018-004)
                  if (!hostTenant || hostTenant.id !== tenantRow.id) {
                    console.warn(`[SECURITY] Cross-tenant or unresolved admin access blocked: User belongs to ${tenantRow.id} but host resolved to ${hostTenant?.id || 'null'}`);
                    return null;
                  }
                } else if (hostTenant && hostTenant.id !== tenantRow.id) {
                  return hostTenant;
                }
              }

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

    const isLocalMode = getDataSourceMode() === 'local';
    if (tenantId === 'synthetic_salon_aura_001' && isLocalMode) {
      return {
        tenantId: 'synthetic_salon_aura_001',
        businessName: 'Aura Kuaför & Güzellik',
        tagline: 'Aura Kuaför ve Güzellik',
        footerText: 'Aura Kuaför & Güzellik. Tüm hakları saklıdır.',
        primaryColor: '#3b82f6',
      } as TenantBranding;
    }
    
    const mode = import.meta.env?.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      const { data: branding, error } = await supabase
        .from('tenant_branding')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
        
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
        .maybeSingle();
      
      return {
        tenantId,
        businessName: tenantRow?.name || 'Güzellik Salonu',
        tagline: '',
        footerText: `${tenantRow?.name || 'Güzellik Salonu'}. Tüm hakları saklıdır.`,
        primaryColor: '#8b5cf6',
      } as TenantBranding;
    }
    
    const key = DYNAMIC_STORAGE_KEYS.tenantBrandingColon(tenantId);
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

    let raw = localStorage.getItem(STORAGE_KEYS.REGISTERED_TENANTS);
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
      localStorage.setItem(STORAGE_KEYS.REGISTERED_TENANTS, JSON.stringify(tenants));
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

    const key = DYNAMIC_STORAGE_KEYS.tenantBrandingColon(tenantId);
    await dataProvider.set(key, next);
    return next;
  }
};

