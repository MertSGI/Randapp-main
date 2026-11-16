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
    const baseUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://randevulari.com';
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
    const baseUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://randevulari.com';
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
  },

  /**
   * Builds a V1 direct storefront URL (`/#/s/:slug`, `/#/booking/:slug`, `/#/book?tenant=:slug`,
   * `/#/:slug`, or subdomain) independent of Discovery Marketplace activation.
   */
  getDirectStorefrontUrl(
    tenant: Pick<Tenant, 'id' | 'slug' | 'customDomain'>,
    options?: {
      origin?: string;
      baseDomain?: string;
      preferSubdomain?: boolean;
      style?: 'legacy_s' | 'booking' | 'query' | 'root';
      branchSlugOrId?: string;
      uiV2?: boolean;
    }
  ): string {
    const cleanCustomDomain = tenant.customDomain?.trim();
    if (cleanCustomDomain) {
      const base = cleanCustomDomain.startsWith('http') ? cleanCustomDomain : `https://${cleanCustomDomain}`;
      const params = new URLSearchParams();
      if (options?.branchSlugOrId) params.set('branch', options.branchSlugOrId);
      if (options?.uiV2) params.set('ui', 'v2');
      const qs = params.toString();
      return qs ? `${base}/#/book?${qs}` : base;
    }

    const slug = normalizeCanonicalSlug(tenant.slug || tenant.id) || tenant.id;
    if (options?.preferSubdomain) {
      const subdomainUrl = this.getTenantSubdomainUrl({ ...tenant, slug }, options.baseDomain);
      const params = new URLSearchParams();
      if (options.branchSlugOrId) params.set('branch', options.branchSlugOrId);
      if (options.uiV2) params.set('ui', 'v2');
      const qs = params.toString();
      return qs ? `${subdomainUrl}/#/?${qs}` : subdomainUrl;
    }

    const origin =
      options?.origin ??
      (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://randevulari.com');
    const style = options?.style ?? 'legacy_s';
    const params = new URLSearchParams();
    if (style === 'query') {
      params.set('tenant', slug);
    }
    if (options?.branchSlugOrId) params.set('branch', options.branchSlugOrId);
    if (options?.uiV2) params.set('ui', 'v2');
    const qs = params.toString();
    const suffix = qs ? `?${qs}` : '';

    switch (style) {
      case 'booking':
        return `${origin}/#/booking/${encodeURIComponent(slug)}${suffix}`;
      case 'query':
        return `${origin}/#/book${suffix}`;
      case 'root':
        return `${origin}/#/${encodeURIComponent(slug)}${suffix}`;
      case 'legacy_s':
      default:
        return `${origin}/#/s/${encodeURIComponent(slug)}${suffix}`;
    }
  },

  getTenantSubdomainUrl(
    tenant: Pick<Tenant, 'id' | 'slug' | 'customDomain'>,
    baseDomain = 'randevulari.com'
  ): string {
    if (tenant.customDomain?.trim()) {
      const d = tenant.customDomain.trim();
      return d.startsWith('http') ? d : `https://${d}`;
    }
    const slug = normalizeCanonicalSlug(tenant.slug || tenant.id) || tenant.id;
    const cleanBase = baseDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${slug}.${cleanBase}`;
  },

  getDiscoveryMarketplaceUrl(slug?: string, origin?: string): string {
    const resolvedOrigin =
      origin ??
      (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://randevulari.com');
    const cleanSlug = slug ? normalizeCanonicalSlug(slug) : '';
    return cleanSlug
      ? `${resolvedOrigin}/#/discovery/${encodeURIComponent(cleanSlug)}`
      : `${resolvedOrigin}/#/discovery`;
  },

  /**
   * Resolves direct V1 storefront URLs and guarantees that disabling Discovery Marketplace
   * never blocks direct V1 storefront access (`/#/s/:slug`, `/#/book?tenant=:slug`, or subdomain).
   */
  resolveDirectStorefrontIndependence(
    tenant: Pick<Tenant, 'id' | 'slug' | 'customDomain'>,
    options?: { marketplaceEnabled?: boolean; origin?: string; baseDomain?: string }
  ): {
    marketplaceEnabled: boolean;
    marketplaceRequired: false;
    storefrontAccessibleWhenMarketplaceDisabled: true;
    legacySUrl: string;
    directBookingUrl: string;
    subdomainUrl: string;
    discoveryUrl: string | null;
  } {
    const marketplaceEnabled = Boolean(options?.marketplaceEnabled);
    const slug = normalizeCanonicalSlug(tenant.slug || tenant.id) || tenant.id;
    return {
      marketplaceEnabled,
      marketplaceRequired: false,
      storefrontAccessibleWhenMarketplaceDisabled: true,
      legacySUrl: this.getDirectStorefrontUrl(tenant, { origin: options?.origin, style: 'legacy_s' }),
      directBookingUrl: this.getDirectStorefrontUrl(tenant, { origin: options?.origin, style: 'query' }),
      subdomainUrl: this.getTenantSubdomainUrl(tenant, options?.baseDomain),
      discoveryUrl: marketplaceEnabled ? this.getDiscoveryMarketplaceUrl(slug, options?.origin) : null,
    };
  },
};
