import { onboardingChecklistService } from './onboardingChecklistService';
import { subscriptionService } from './subscriptionService';

export interface AdminFeatureAvailability {
  isAccessible: boolean;
  lockReason: string | null;
  recommendedAction: string | null;
}

export const adminFeatureAvailabilityService = {
  async getAvailability(tenantId: string, tabId: string): Promise<AdminFeatureAvailability> {
    const report = await onboardingChecklistService.getOnboardingReport(tenantId);
    
    // Always accessible tabs
    if (['dashboard', 'setup', 'billing', 'settings'].includes(tabId)) {
      return { isAccessible: true, lockReason: null, recommendedAction: null };
    }

    if (tabId === 'services' || tabId === 'staff' || tabId === 'profile') {
      // These are required for onboarding, so they must be accessible
      return { isAccessible: true, lockReason: null, recommendedAction: null };
    }
    
    if (tabId === 'appointments' || tabId === 'customers') {
      return { isAccessible: true, lockReason: null, recommendedAction: null };
    }

    if (tabId === 'referrals') {
      const plan = await subscriptionService.getPlanForTenant(tenantId);
      // Wait, let's assume 'starter' and above have some referrals, or specifically 'premium'. Let's say all paid plans have basic referrals.
      // E.g. 'free' is not allowed. 
      if (plan && plan.id === 'free') {
        return { 
          isAccessible: false, 
          lockReason: 'Müşteri Kampanyaları özelliği mevcut paketinizde yer almıyor.', 
          recommendedAction: 'upgrade' 
        };
      }
      return { isAccessible: true, lockReason: null, recommendedAction: null };
    }

    if (tabId === 'reports') {
      // Basic reports are available to all, but let's check if they want to lock advanced.
      return { isAccessible: true, lockReason: null, recommendedAction: null };
    }

    return { isAccessible: true, lockReason: null, recommendedAction: null };
  },

  async getAdminHomeNextActions(tenantId: string): Promise<{
    message: string;
    ctaText: string;
    targetTab: string;
    isBlocked: boolean;
  } | null> {
    const report = await onboardingChecklistService.getOnboardingReport(tenantId);
    
    if (report.pendingCheckout) {
      return {
        message: 'Deneme süresini başlatmak veya yayına geçmek için ödeme doğrulaması tamamlanmalıdır.',
        ctaText: 'Güvenli Ödeme Doğrulaması',
        targetTab: 'billing',
        isBlocked: true
      };
    }
    if (report.progressPercent < 100) {
      return {
         message: `Sitenizin eksiksiz olması için ${report.nextStep?.title} eksik.`,
         ctaText: 'Kuruluma Devam Et',
         targetTab: 'setup',
         isBlocked: false
      };
    }
    if (report.isPublished) {
      return {
         message: 'Randevu bağlantınızı paylaşın.',
         ctaText: 'Paylaşım Araçlarını Aç',
         targetTab: 'settings',
         isBlocked: false
      };
    }
    if (report.canSubmitForReview && !report.isPendingReview) {
      return {
         message: 'Tüm zorunlu adımlar tamamlandı. Yayın incelemesine gönderebilirsiniz!',
         ctaText: 'Yayına Al',
         targetTab: 'setup',
         isBlocked: false
      };
    }
    if (report.isPendingReview) {
       return {
         message: 'Siteniz incelemede. Kısa süre içinde yayında olacaktır!',
         ctaText: 'Kurulum Sihirbazı',
         targetTab: 'setup',
         isBlocked: false
       };
    }
    return null; // All good
  }
};
