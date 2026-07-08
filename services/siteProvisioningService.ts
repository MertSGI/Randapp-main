import { publicLinkService } from './publicLinkService';
import { marketConfigService } from './marketConfigService';
import { tenantService } from './tenantService';
import { Tenant } from '../types';
import { communicationEventService } from './communicationEventService';

export type ProvisioningStepStatus = 
  | 'not_started'
  | 'slug_reserved'
  | 'profile_ready'
  | 'catalog_ready'
  | 'preview_ready'
  | 'submitted_for_review'
  | 'published';

export type CustomDomainStatus = 'requested' | 'dns_instructions_sent' | 'verifying' | 'active' | 'rejected' | 'paused';

export interface CustomDomainRequest {
  id: string;
  tenantId: string;
  domain: string;
  desiredType: 'root_domain' | 'subdomain';
  status: CustomDomainStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export const siteProvisioningService = {
  generateTenantSlugFromBusinessName(name: string): string {
    return publicLinkService.generateTenantSlug(name);
  },

  async validateTenantSlug(slug: string, tenantId?: string): Promise<{ isValid: boolean; error?: string }> {
    return publicLinkService.validateSlug(slug, tenantId);
  },

  async reserveTenantSlug(tenantId: string, desiredSlug: string): Promise<boolean> {
    const val = await this.validateTenantSlug(desiredSlug, tenantId);
    if (!val.isValid) return false;
    
    // In mock mode, simply update the tenant object
    const tenant = await tenantService.getTenantById(tenantId);
    if (tenant) {
      await tenantService.updateTenant(tenantId, { slug: desiredSlug });
      
      // Queue preview ready event
      try {
        const previewUrl = `https://${desiredSlug}.randevulari.com/preview`;
        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'business_owner',
          channel: 'in_app',
          type: 'public_site_preview_ready',
          contextArgs: {
            businessName: tenant.branding?.businessName || tenant.name,
            previewUrl
          }
        });
      } catch (err) {
        console.error('Slug preview outbox event fail:', err);
      }
      return true;
    }
    return false;
  },

  getProvisioningStatus(tenantId: string): ProvisioningStepStatus {
    // In a real DB, this would be a field. For now, derive mock status:
    return 'preview_ready'; // Fallback for local
  },

  async provisionTenantPublicSite(tenantId: string): Promise<void> {
    const tenant = await tenantService.getTenantById(tenantId);
    if (tenant) {
       await tenantService.updateTenant(tenantId, { isPublished: true });
       
       const publicUrl = this.getPublicSiteUrl(tenant);
       
       try {
         communicationEventService.queueCommunicationEvent({
           tenantId,
           audience: 'business_owner',
           channel: 'email',
           type: 'public_site_published',
           contextArgs: {
             businessName: tenant.branding?.businessName || tenant.name,
             publicUrl
           }
         });
       } catch (err) {
         console.error('Site published outbox event hook error:', err);
       }
    }
  },

  async updateTenantPublicSiteStatus(tenantId: string, status: boolean): Promise<void> {
    await tenantService.updateTenant(tenantId, { isPublished: status });
  },

  getPublicSiteUrl(tenant: Tenant): string {
    if (tenant.customDomain) {
      return tenant.customDomain.startsWith('http') ? tenant.customDomain : `https://${tenant.customDomain}`;
    }

    // Use subdomain if market config supports it, otherwise fallback to hash routing
    const market = marketConfigService.getCurrentMarketConfig();
    const slug = tenant.slug || tenant.id;
    
    if (slug) {
       return `https://${slug}.${market.localizedDomainLabel}`; 
    }

    const baseUrl = window.location.origin;
    return `${baseUrl}/#/book?tenant=${slug}`;
  },

  getBranchPublicSiteUrl(tenant: Tenant, branchSlugOrId: string): string {
    const baseUrl = this.getPublicSiteUrl(tenant);
    // Standard URL format for branch
    if (baseUrl.includes('#')) {
      return `${baseUrl}&branch=${branchSlugOrId}`;
    }
    return `${baseUrl}/${branchSlugOrId}`;
  },
  
  // Custom domains dummy state just for reference right now
  async requestCustomDomain(tenantId: string, domain: string): Promise<boolean> {
    console.log(`Requested custom domain ${domain} for tenant ${tenantId}`);
    
    try {
      const tenant = await tenantService.getTenantById(tenantId);
      
      communicationEventService.queueCommunicationEvent({
        tenantId,
        audience: 'business_owner',
        channel: 'email',
        type: 'custom_domain_requested',
        contextArgs: {
          ownerName: 'İşletme Yetkilisi',
          businessName: tenant?.branding?.businessName || tenant?.name || tenantId,
          domainName: domain
        }
      });

      // Simulate automated deployment success in local database mode in 1.5 seconds
      setTimeout(async () => {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'business_owner',
          channel: 'email',
          type: 'custom_domain_active',
          contextArgs: {
            domainName: domain
          }
        });
      }, 1500);

    } catch (e) {
      console.error('Custom domain outbox hook error:', e);
    }
    return true;
  },

  validateCustomDomainFormat(domain: string): boolean {
    const regex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    return regex.test(domain.toLowerCase());
  }
};
