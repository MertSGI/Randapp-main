import { tenantService } from './tenantService';
import { entitlementService } from './entitlementService';
import type { Tenant } from '../types';
import {
  RESERVED_SLUGS_LIST,
  SLUG_VALIDATION_REASONS,
  type SlugValidationResult,
  generateSlugFromName,
  isReservedSlugWord,
  normalizeCanonicalSlug,
  validateSlugFormat,
} from '../utils/slugUtils';

export const RESERVED_SLUGS: string[] = [...RESERVED_SLUGS_LIST];

export const publicLinkService = {
  normalizeSlug(input: string): string {
    return normalizeCanonicalSlug(input);
  },

  isReservedSlug(slug: string): boolean {
    return isReservedSlugWord(slug);
  },

  async validateSlug(slug: string, currentTenantId?: string): Promise<SlugValidationResult> {
    const formatCheck = validateSlugFormat(slug);
    if (!formatCheck.isValid) {
      return formatCheck;
    }

    const normalized = formatCheck.normalizedSlug;

    try {
      const tenantBySlug = await tenantService.getTenantBySlug(normalized);
      if (tenantBySlug && tenantBySlug.id !== currentTenantId) {
        return {
          isValid: false,
          reason: SLUG_VALIDATION_REASONS.SLUG_TAKEN,
          normalizedSlug: normalized,
          error: 'Bu bağlantı adı başka bir işletme tarafından kullanılıyor.',
        };
      }
    } catch {
      return {
        isValid: false,
        reason: SLUG_VALIDATION_REASONS.UNKNOWN_ERROR,
        normalizedSlug: normalized,
        error: 'Bağlantı adı doğrulanırken beklenmeyen bir hata oluştu.',
      };
    }

    return {
      isValid: true,
      reason: SLUG_VALIDATION_REASONS.VALID,
      normalizedSlug: normalized,
    };
  },

  generateTenantSlug(inputName: string): string {
    const baseSlug = generateSlugFromName(inputName);
    if (baseSlug) {
      return baseSlug;
    }
    return 'isletme-randevu';
  },

  getTenantPublicUrl(tenant: Tenant): string {
    const baseUrl = window.location.origin;
    if (tenant.customDomain) {
      return tenant.customDomain.startsWith('http') ? tenant.customDomain : `https://${tenant.customDomain}`;
    }
    return `${baseUrl}/#/book?tenant=${tenant.slug || tenant.id}`;
  },

  getTenantBookingUrl(tenant: Tenant): string {
    return this.getTenantPublicUrl(tenant);
  },

  getBranchBookingUrl(tenant: Tenant, branchSlugOrId: string): string {
    const base = this.getTenantBookingUrl(tenant);
    return `${base}&branch=${branchSlugOrId}`;
  },

  getAdminPreviewUrl(tenant: Tenant): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/#/book?tenant=${tenant.id}&preview=true`;
  },

  getShareText(tenant: Tenant, context: 'whatsapp' | 'instagram' | 'general' = 'general', branchSlugOrId?: string): string {
    const url = branchSlugOrId ? this.getBranchBookingUrl(tenant, branchSlugOrId) : this.getTenantBookingUrl(tenant);
    if (context === 'whatsapp') {
      return `Merhaba! ${tenant.name} randevunuzu hızlıca oluşturmak için linke tıklayın:\n\n${url}`;
    } else if (context === 'instagram') {
      return `Hemen randevu al:\n${url}`;
    }
    return `Randevu oluşturmak için tıklayın: ${url}`;
  },

  getQrPayload(url: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  },

  canUseCustomDomain(tenant: Tenant): boolean {
    if (tenant.id === 'biz_pilot_tenant') return true;
    return entitlementService.canUseFeature(tenant.planId || 'free', 'custom_domain_manual');
  },

  getCustomDomainStatus(tenant: Tenant): 'locked' | 'not_requested' | 'under_review' | 'active' | 'rejected' {
    if (!this.canUseCustomDomain(tenant)) {
      return 'locked';
    }
    if (tenant.customDomain) {
      return 'active';
    }
    return 'not_requested';
  }
};
