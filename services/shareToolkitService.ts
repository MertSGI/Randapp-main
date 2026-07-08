import { tenantService } from './tenantService';
import { publicLinkService } from './publicLinkService';
import { Tenant, BusinessBranch } from '../types';

export const shareToolkitService = {
  getShareTrackingUrl(tenant: Tenant, source: string, branchId?: string): string {
    const base = branchId 
      ? publicLinkService.getBranchBookingUrl(tenant, branchId)
      : publicLinkService.getTenantBookingUrl(tenant);
      
    // Because base already has a ? due to hash routing like `/#/book?tenant=xyz`, 
    // we should just append `&source=${source}` if it already contains `?`, 
    // or `?source=${source}` if not. The current implementation of publicLinkService 
    // always returns a URL with `?` for standard cases but custom domains might not.
    if (base.includes('?')) {
       return `${base}&source=${source}`;
    } else {
       return `${base}?source=${source}`;
    }
  },

  getWhatsAppShareText(tenant: Tenant, branchId?: string): string {
    const url = this.getShareTrackingUrl(tenant, 'whatsapp', branchId);
    return `Merhaba, artık randevularımızı online alabilirsiniz. Size uygun hizmeti, çalışanı ve saati buradan seçebilirsiniz:\n\n${url}`;
  },

  getInstagramBioText(tenant: Tenant, branchId?: string): string {
    const url = this.getShareTrackingUrl(tenant, 'instagram', branchId);
    return `Online randevu için bağlantıya dokunun: 👇\n${url}`;
  },

  getInstagramStoryText(tenant: Tenant, branchId?: string): string {
    const url = this.getShareTrackingUrl(tenant, 'instagram_story', branchId);
    return `Hemen randevunuzu oluşturun! ✨\nBağlantıya tıklayın: ${url}`;
  },

  getGoogleBusinessText(tenant: Tenant, branchId?: string): string {
    const url = this.getShareTrackingUrl(tenant, 'google_business', branchId);
    return `Randevu almak için online randevu sayfamızı kullanabilirsiniz:\n${url}`;
  },

  getQrPosterCopy(tenant: Tenant, branchId?: string): string {
    return `Telefonunuzla QR kodu okutun, randevunuzu kolayca oluşturun.`;
  },

  getLaunchAnnouncementText(tenant: Tenant): string {
    const url = this.getShareTrackingUrl(tenant, 'launch');
    return `Online randevu sistemimiz yayında! 🎉 Size uygun saati seçip randevunuzu birkaç adımda oluşturabilirsiniz:\n${url}`;
  },

  getCustomerReminderText(tenant: Tenant, appointmentContext?: any): string {
    const url = this.getShareTrackingUrl(tenant, 'reminder');
    return `Bir sonraki randevunuzu online olarak kolayca planlayabilirsiniz:\n${url}`;
  },
  
  getShareChecklist(tenantId: string): Record<string, boolean> {
    const key = `lari_share_checklist_${tenantId}`;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    if (raw) {
      try {
         return JSON.parse(raw);
      } catch (e) {}
    }
    return {
       instagram_bio: false,
       whatsapp_quick_reply: false,
       google_business: false,
       qr_printed: false,
       announced_to_old_customers: false,
       shared_with_staff: false
    };
  },
  
  updateShareChecklist(tenantId: string, updates: Record<string, boolean>): Record<string, boolean> {
    const current = this.getShareChecklist(tenantId);
    const updated = { ...current, ...updates };
    if (typeof window !== 'undefined') {
       localStorage.setItem(`lari_share_checklist_${tenantId}`, JSON.stringify(updated));
    }
    return updated;
  }
};
