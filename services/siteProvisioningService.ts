import { publicLinkService } from './publicLinkService';
import { marketConfigService } from './marketConfigService';
import { tenantService } from './tenantService';
import type { Tenant } from '../types';
import { communicationEventService } from './communicationEventService';
import {
  SLUG_VALIDATION_REASONS,
  type SlugValidationResult,
  generateSlugFromName,
  getSlugAlternatives,
  isValidSlug,
} from '../utils/slugUtils';

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
    return generateSlugFromName(name);
  },

  async validateTenantSlug(slug: string, tenantId?: string): Promise<SlugValidationResult> {
    return publicLinkService.validateSlug(slug, tenantId);
  },

  async reserveTenantSlug(tenantId: string, desiredSlug: string): Promise<boolean> {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      return false;
    }
    if (typeof desiredSlug !== 'string' || !desiredSlug.trim()) {
      return false;
    }

    const normalizedTenantId = tenantId.trim();
    const tenant = await tenantService.getTenantById(normalizedTenantId);
    if (!tenant || tenant.id !== normalizedTenantId) {
      return false;
    }

    let val = await this.validateTenantSlug(desiredSlug, normalizedTenantId);
    let targetSlug = val.normalizedSlug;

    if (!val.isValid) {
      // Policy gate: deterministic suffix fallback is permitted ONLY when a
      // valid, non-reserved canonical slug is occupied by another tenant.
      if (val.reason !== SLUG_VALIDATION_REASONS.SLUG_TAKEN || !isValidSlug(targetSlug)) {
        return false;
      }

      const alternatives = getSlugAlternatives(targetSlug);
      for (const alt of alternatives) {
        if (!isValidSlug(alt)) {
          continue;
        }
        const altVal = await this.validateTenantSlug(alt, normalizedTenantId);
        if (
          altVal.isValid &&
          altVal.reason === SLUG_VALIDATION_REASONS.VALID &&
          altVal.normalizedSlug === alt
        ) {
          targetSlug = alt;
          val = altVal;
          break;
        }
      }
    }

    if (
      !val.isValid ||
      val.reason !== SLUG_VALIDATION_REASONS.VALID ||
      !isValidSlug(targetSlug)
    ) {
      return false;
    }

    // Pre-write ownership re-check against cross-tenant collision
    const preWriteOwner = await tenantService.getTenantBySlug(targetSlug);
    if (preWriteOwner && preWriteOwner.id !== normalizedTenantId) {
      return false;
    }

    const previousSlug = tenant.slug;
    await tenantService.updateTenant(normalizedTenantId, { slug: targetSlug });

    // Post-write verification against concurrent duplicate race or unverified write
    const updatedTenant = await tenantService.getTenantById(normalizedTenantId);
    const postWriteOwner = await tenantService.getTenantBySlug(targetSlug);
    if (
      !updatedTenant ||
      updatedTenant.slug !== targetSlug ||
      !postWriteOwner ||
      postWriteOwner.id !== normalizedTenantId
    ) {
      if (updatedTenant && updatedTenant.slug !== previousSlug) {
        await tenantService.updateTenant(normalizedTenantId, { slug: previousSlug });
      }
      return false;
    }

    // Queue preview ready event
    try {
      const previewUrl = `https://${targetSlug}.randevulari.com/preview`;
      communicationEventService.queueCommunicationEvent({
        tenantId: normalizedTenantId,
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
