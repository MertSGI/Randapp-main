import { tenantService } from './tenantService';
import { entitlementService } from './entitlementService';
import { Tenant } from '../types';

export const RESERVED_SLUGS = [
  'admin', 'login', 'register', 'pricing', 'demo', 'pilot', 'book', 'api',
  'super-admin', 'settings', 'checkout', 'payment', 'help', 'support',
  'randevu', 'lari', 'app', 'www', 'mail', 'ftp'
];

export const publicLinkService = {
  normalizeSlug(input: string): string {
    const trMap: { [key: string]: string } = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    let slug = input.replace(/[çğıöşüÇĞİÖŞÜ]/g, match => trMap[match] || match);
    slug = slug.toLowerCase();
    slug = slug.replace(/[^a-z0-9-]/g, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/^-|-$/g, '');
    return slug;
  },

  isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.includes(slug.toLowerCase());
  },

  async validateSlug(slug: string, currentTenantId?: string): Promise<{ isValid: boolean; error?: string }> {
    const normalized = this.normalizeSlug(slug);
    
    if (!normalized || normalized.length < 3) {
      return { isValid: false, error: 'Link en az 3 karakter olmalıdır.' };
    }
    
    if (this.isReservedSlug(normalized)) {
      return { isValid: false, error: 'Bu bağlantı adı sistem tarafından rezerve edilmiştir.' };
    }
    
    // Check uniqueness
    const tenantBySlug = await tenantService.getTenantBySlug(normalized);
    if (tenantBySlug && tenantBySlug.id !== currentTenantId) {
      return { isValid: false, error: 'Bu bağlantı adı başka bir işletme tarafından kullanılıyor.' };
    }
    
    return { isValid: true };
  },

  generateTenantSlug(inputName: string): string {
    const baseSlug = this.normalizeSlug(inputName) || 'randevu';
    if (this.isReservedSlug(baseSlug)) {
       return `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
    }
    return baseSlug;
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
