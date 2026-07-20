import { tenantService } from './tenantService';
import { supabase } from './supabaseClient';
import { dataProvider } from './dataProvider';
import { subscriptionService } from './subscriptionService';
import { provisioningService } from './provisioningService';
import { getServices } from './serviceCatalogService';
import { getStaffList } from './staffService';
import { businessVerificationService } from './businessVerificationService';

export interface GoLiveReadiness {
  canGoLive: boolean;
  canAcceptBookings: boolean;
  blockingReasons: string[];
  checklist: {
    salonInfoCompleted: boolean;
    brandingCompleted: boolean;
    whatsappCompleted: boolean;
    servicesCompleted: boolean;
    staffCompleted: boolean;
    testAppointmentCompleted: boolean;
    verificationApproved: boolean;
    riskStatusNormal: boolean;
  };
}

export const goLiveService = {
  async getGoLiveReadiness(tenantId: string): Promise<GoLiveReadiness> {
    if (tenantId === 'tenant_pilot_demo') {
      return {
        canGoLive: true,
        canAcceptBookings: true,
        blockingReasons: [],
        checklist: {
          salonInfoCompleted: true,
          brandingCompleted: true,
          whatsappCompleted: true,
          servicesCompleted: true,
          staffCompleted: true,
          testAppointmentCompleted: true,
          verificationApproved: true,
          riskStatusNormal: true
        }
      };
    }

    const sub = await subscriptionService.getCurrentSubscription(tenantId);
    const provStatus = await provisioningService.getProvisioningStatus(tenantId);
    const services = await getServices(tenantId, { activeOnly: true });
    const staff = await getStaffList(tenantId, { activeOnly: true });
    const tenant = await tenantService.getCurrentTenant();

    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    let publicSiteStatus = 'draft';
    
    // Fallbacks
    if (tenant) {
       publicSiteStatus = tenant.publicSiteStatus || 'draft';
    }

    const checklist = {
      salonInfoCompleted: true, // simplified for now, should ideally check tenant fields
      brandingCompleted: true,
      whatsappCompleted: true,
      servicesCompleted: services.length > 0,
      staffCompleted: staff.length > 0,
      testAppointmentCompleted: true, // mock assumption
      verificationApproved: tenant?.verificationStatus === 'approved' || tenant?.verificationStatus === 'not_submitted',
      riskStatusNormal: tenant?.businessRiskStatus !== 'prohibited'
    };

    const blockingReasons: string[] = [];
    const isServiceActive = sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'manual_active' || sub?.status === 'comped';
    if (!isServiceActive) {
      blockingReasons.push('Abonelik aktif değil. Lütfen yöneticinizle iletişime geçin veya aktivasyon işlemini tamamlayın.');
    }
    if (!checklist.servicesCompleted) {
      blockingReasons.push('En az 1 aktif hizmet eklenmesi gerekiyor.');
    }
    if (!checklist.staffCompleted) {
      blockingReasons.push('En az 1 aktif çalışan eklenmesi gerekiyor.');
    }
    if (tenant?.businessRiskStatus === 'prohibited') {
      blockingReasons.push('Kullanım koşullarına uymayan işletme türü (Yayın engellendi).');
    }

    const canGoLive = blockingReasons.length === 0;
    const canAcceptBookings = canGoLive && publicSiteStatus === 'published';

    return {
      canGoLive,
      canAcceptBookings,
      blockingReasons,
      checklist
    };
  },

  async canTenantAcceptBookings(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    if (tenantId === 'tenant_pilot_demo') {
      return { allowed: true };
    }

    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      const tenant = await tenantService.getCurrentTenant();
      if (!tenant || !tenant.slug) {
        return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
      }
      try {
        const { data, error } = await supabase.rpc('can_accept_public_booking', { p_slug: tenant.slug });
        if (error || !data) {
          console.error('Error invoking can_accept_public_booking RPC:', error);
          return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
        }
        if (data.allowed) {
          return { allowed: true };
        }
        
        // Map reason codes to public wording
        const reasonCode = data.reason_code;
        if (reasonCode === 'tenant_not_found' || reasonCode === 'tenant_inactive' || reasonCode === 'entitlement_inactive') {
          return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
        }
        if (tenant.publicSiteStatus === 'suspended') {
          return { allowed: false, reason: 'Bu işletmenin online randevu sayfası şu anda aktif değil.' };
        }
        if (tenant.publicSiteStatus === 'paused') {
          return { allowed: false, reason: 'Bu salon şu anda online randevu kabul etmiyor. Lütfen işletme ile iletişime geçin.' };
        }
        if (tenant.publicSiteStatus === 'pending_review' || tenant.publicSiteStatus === 'draft' || tenant.publicSiteStatus === 'preview_ready') {
          return { allowed: false, reason: 'Online randevu sistemi henüz aktif değil.' };
        }
        if (reasonCode === 'onboarding_incomplete') {
          return { allowed: false, reason: 'Salon hazırlık aşamasında.' };
        }
        return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
      } catch (err) {
        console.error('Exception resolving public eligibility:', err);
        return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
      }
    }

    const sub = await subscriptionService.getCurrentSubscription(tenantId);
    const isServiceActive = sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'manual_active' || sub?.status === 'comped';
    if (!sub || !isServiceActive) {
      return { allowed: false, reason: 'Online randevu şu anda kullanılamıyor. Lütfen işletmeyle iletişime geçin.' };
    }

    const tenant = await tenantService.getCurrentTenant();
    if (tenant?.publicSiteStatus === 'suspended') {
      return { allowed: false, reason: 'Bu işletmenin online randevu sayfası şu anda aktif değil.' };
    }
    if (tenant?.publicSiteStatus === 'paused') {
      return { allowed: false, reason: 'Bu salon şu anda online randevu kabul etmiyor. Lütfen işletme ile iletişime geçin.' };
    }
    if (tenant?.publicSiteStatus === 'pending_review' || tenant?.publicSiteStatus === 'draft' || tenant?.publicSiteStatus === 'preview_ready') {
      return { allowed: false, reason: 'Online randevu sistemi henüz aktif değil.' };
    }

    const readiness = await this.getGoLiveReadiness(tenantId);

    if (!readiness.canAcceptBookings) {
      if (readiness.blockingReasons.length > 0) {
        return { allowed: false, reason: 'Salon hazırlık aşamasında.' };
      }
      return { allowed: false, reason: 'Online randevu sistemi henüz aktif değil.' };
    }

    return { allowed: true };
  },

  async markReadyForReview(tenantId: string): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      await supabase.from('tenants').update({ public_site_status: 'pending_review' }).eq('id', tenantId);
      await provisioningService.markTenantProvisioningStatus(tenantId, 'ready_for_review');
    } else {
      const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
      const index = registeredArr.findIndex((t: any) => t.id === tenantId);
      if (index !== -1) {
         registeredArr[index].publicSiteStatus = 'pending_review';
         localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
      }
      await provisioningService.markTenantProvisioningStatus(tenantId, 'ready_for_review');
    }
  },

  async markTenantLive(tenantId: string): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      await supabase.from('tenants').update({ public_site_status: 'published' }).eq('id', tenantId);
      await provisioningService.markTenantProvisioningStatus(tenantId, 'live');
    } else {
      const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
      const index = registeredArr.findIndex((t: any) => t.id === tenantId);
      if (index !== -1) {
         registeredArr[index].publicSiteStatus = 'published';
         registeredArr[index].verificationStatus = 'approved';
         localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
      }
      await provisioningService.markTenantProvisioningStatus(tenantId, 'live');
    }
  },

  async markTenantPaused(tenantId: string): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      await supabase.from('tenants').update({ public_site_status: 'paused' }).eq('id', tenantId);
    } else {
      const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
      const index = registeredArr.findIndex((t: any) => t.id === tenantId);
      if (index !== -1) {
         registeredArr[index].publicSiteStatus = 'paused';
         localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
      }
    }
  },

  async markTenantNeedsChanges(tenantId: string): Promise<void> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode.startsWith('supabase')) {
      await supabase.from('tenants').update({ public_site_status: 'preview_ready', verification_status: 'rejected' }).eq('id', tenantId);
      await provisioningService.markTenantProvisioningStatus(tenantId, 'setup_in_progress');
    } else {
      const registeredArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
      const index = registeredArr.findIndex((t: any) => t.id === tenantId);
      if (index !== -1) {
         registeredArr[index].publicSiteStatus = 'preview_ready';
         registeredArr[index].verificationStatus = 'rejected';
         localStorage.setItem('lari_registered_tenants', JSON.stringify(registeredArr));
      }
      await provisioningService.markTenantProvisioningStatus(tenantId, 'setup_in_progress');
    }
  },

  async getGoLiveBlockingReasons(tenantId: string): Promise<string[]> {
    const readiness = await this.getGoLiveReadiness(tenantId);
    return readiness.blockingReasons;
  }
};
