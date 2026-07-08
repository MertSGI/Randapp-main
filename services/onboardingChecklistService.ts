import { tenantService } from './tenantService';
import { subscriptionService } from './subscriptionService';
import { getServices } from './serviceCatalogService';
import { getStaffList } from './staffService';
import { businessProfileService } from './businessProfileService';

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  requiredForPublish: boolean;
  blockingReason?: string;
  targetTab?: 'setup' | 'appointments' | 'staff' | 'services' | 'reports' | 'billing' | 'settings';
  targetRoute?: string;
}

export interface OnboardingReport {
  steps: ChecklistStep[];
  progressPercent: number;
  canSubmitForReview: boolean;
  isPendingReview: boolean;
  isPublished: boolean;
  nextStep?: ChecklistStep;
  pendingCheckout: boolean;
}

export const onboardingChecklistService = {
  async getOnboardingReport(tenantId: string): Promise<OnboardingReport> {
    // 1. If pilot demo, bypass checks
    if (tenantId === 'tenant_pilot_demo') {
      const steps: ChecklistStep[] = [
        { id: 'business_profile', title: 'İşletme Bilgileri', description: 'İşletme ismi, kategorisi ve yer bilgileri.', status: 'completed', requiredForPublish: true, targetTab: 'setup' },
        { id: 'contact_location', title: 'İletişim & Konum', description: 'Telefon, WhatsApp ve adres bilgileri.', status: 'completed', requiredForPublish: true, targetTab: 'setup' },
        { id: 'services', title: 'Hizmetler', description: 'Hizmet yelpazesi ve fiyatlandırma.', status: 'completed', requiredForPublish: true, targetTab: 'services' },
        { id: 'staff', title: 'Çalışanlar', description: 'Ekip üyeleri ve uzmanlık alanları.', status: 'completed', requiredForPublish: true, targetTab: 'staff' },
        { id: 'availability', title: 'Çalışma Saatleri', description: 'Haftalık ve günlük çalışma takvimi.', status: 'completed', requiredForPublish: true, targetTab: 'settings' },
        { id: 'gallery_branding', title: 'Görseller & Logo', description: 'Kapak fotoğrafları ve marka logosu.', status: 'completed', requiredForPublish: false, targetTab: 'setup' },
        { id: 'booking_rules', title: 'Randevu Kuralları', description: 'Randevu onay ve iptal politikaları.', status: 'completed', requiredForPublish: false, targetTab: 'settings' },
        { id: 'payment_verification', title: 'Ödeme Doğrulaması', description: 'Deneme süresi veya abonelik aktivasyonu.', status: 'completed', requiredForPublish: true, targetTab: 'billing' },
        { id: 'preview_review', title: 'Önizleme & Kontrol', description: 'Müşteri gözünden sayfa görünümü.', status: 'completed', requiredForPublish: true, targetRoute: '/admin-preview' },
        { id: 'publish_review', title: 'Yayın İncelemesi', description: 'Sitenizi onay ve yayına gönderme.', status: 'completed', requiredForPublish: true, targetTab: 'setup' }
      ];
      return {
        steps,
        progressPercent: 100,
        canSubmitForReview: true,
        isPendingReview: false,
        isPublished: true,
        pendingCheckout: false
      };
    }

    // 2. Load dynamic data
    const tenant = await tenantService.getCurrentTenant();
    const profile = await businessProfileService.getBusinessProfile(tenantId);
    const services = await getServices(tenantId, { activeOnly: true });
    const staff = await getStaffList(tenantId, { activeOnly: true });
    const sub = await subscriptionService.getCurrentSubscription(tenantId);

    const isPendingCheckout = sub?.status === 'pending_checkout' || !sub;
    const isTrialingOrActive = sub?.status === 'trialing' || sub?.status === 'active';

    // 3. Define Criteria checks
    const hasBusinessProfile = !!tenant?.name && !!profile?.business_category && !!profile?.city && !!profile?.district;
    const hasContactLocation = !!(profile?.phone || profile?.whatsapp_number || tenant?.branding?.whatsappNumber) && !!(profile?.address || tenant?.branding?.address);
    const hasServices = services.length > 0;
    const hasStaff = staff.length > 0;
    
    // Check if availability configured (either default hour has been agreed or staff exists and is active)
    const isAvailabilityConfigured = localStorage.getItem(`lari_availability_${tenantId}_configured`) === 'true' || hasStaff;

    const hasLogo = !!(tenant?.branding?.logoUrl || profile?.logo_url);
    const hasGalleryOrCover = !!(profile?.cover_image_url || (profile?.cover_images && profile.cover_images.length > 0) || (profile?.gallery_images && profile.gallery_images.length > 0));
    const isGalleryBrandingConfigured = hasLogo || hasGalleryOrCover;

    // Booking rules is default satisfied or if checked
    const isBookingRulesEnabled = profile?.is_public_profile_enabled !== false;

    // Preview has been viewed or is available
    const isPreviewReady = hasBusinessProfile && hasServices && hasStaff;

    const isSubmitted = tenant?.publicSiteStatus === 'pending_review' || tenant?.publicSiteStatus === 'published';
    const isApproved = tenant?.publicSiteStatus === 'published' && tenant?.verificationStatus === 'approved';

    // Steps list
    const steps: ChecklistStep[] = [];

    // Step 1: business_profile
    let profileStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started';
    if (hasBusinessProfile) {
      profileStatus = 'completed';
    } else if (tenant?.name || profile?.business_category || profile?.city) {
      profileStatus = 'in_progress';
    }
    steps.push({
      id: 'business_profile',
      title: 'İşletme Bilgileri',
      description: 'İşletme adı, kategorisi ve yer bilgileri (İl, İlçe).',
      status: profileStatus,
      requiredForPublish: true,
      blockingReason: hasBusinessProfile ? undefined : 'Lütfen işletme adını, kategorisini ve bulunduğu il/ilçeyi tamamlayın.',
      targetTab: 'setup'
    });

    // Step 2: contact_location
    let contactStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started';
    if (hasContactLocation) {
      contactStatus = 'completed';
    } else if (profile?.phone || profile?.address || tenant?.branding?.whatsappNumber) {
      contactStatus = 'in_progress';
    }
    steps.push({
      id: 'contact_location',
      title: 'İletişim & Konum',
      description: 'Telefon numarası ve tam açık işletme adresi.',
      status: contactStatus,
      requiredForPublish: true,
      blockingReason: hasContactLocation ? undefined : 'İşletme telefon/WhatsApp numarası ve adresi girmelisiniz.',
      targetTab: 'setup'
    });

    // Step 3: services
    const servicesStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = hasServices ? 'completed' : 'not_started';
    steps.push({
      id: 'services',
      title: 'Hizmet Kataloğu',
      description: 'Müşterilerin seçebilmesi için en az 1 aktif hizmet.',
      status: servicesStatus,
      requiredForPublish: true,
      blockingReason: hasServices ? undefined : 'Müşterilerinizin randevu seçebilmesi için en az 1 aktif hizmet eklemelisiniz.',
      targetTab: 'services'
    });

    // Step 4: staff
    const staffStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = hasStaff ? 'completed' : 'not_started';
    steps.push({
      id: 'staff',
      title: 'Çalışan Tanımlama',
      description: 'Randevu takvimi oluşturulabilmesi için en az 1 uzman.',
      status: staffStatus,
      requiredForPublish: true,
      blockingReason: hasStaff ? undefined : 'Randevu oluşturulabilmesi için en az 1 uzman/çalışan eklemelisiniz.',
      targetTab: 'staff'
    });

    // Step 5: availability
    const availabilityStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = isAvailabilityConfigured ? 'completed' : 'not_started';
    steps.push({
      id: 'availability',
      title: 'Çalışma Saatleri',
      description: 'Uzmanların haftalık çalışma ve dinlenme gün/saatleri.',
      status: availabilityStatus,
      requiredForPublish: true,
      blockingReason: isAvailabilityConfigured ? undefined : 'Haftalık çalışma gün ve saatlerini belirlemelisiniz.',
      targetTab: 'settings'
    });

    // Step 6: gallery_branding (Optional but recommended)
    const galleryStatus = isGalleryBrandingConfigured ? 'completed' : 'in_progress';
    steps.push({
      id: 'gallery_branding',
      title: 'Görseller & Logo',
      description: 'Sitenizin kapak görseli, logosu ve salon galerisi (Önerilir).',
      status: galleryStatus,
      requiredForPublish: false,
      targetTab: 'setup'
    });

    // Step 7: booking_rules
    const rulesStatus = isBookingRulesEnabled ? 'completed' : 'not_started';
    steps.push({
      id: 'booking_rules',
      title: 'Randevu Kuralları',
      description: 'Randevu onaylama türü ve online rezervasyon kuralları.',
      status: rulesStatus,
      requiredForPublish: false,
      targetTab: 'settings'
    });

    // Step 8: payment_verification
    let paymentStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started';
    if (isTrialingOrActive) {
      paymentStatus = 'completed';
    } else if (isPendingCheckout) {
      paymentStatus = 'blocked';
    }
    steps.push({
      id: 'payment_verification',
      title: 'Ödeme & Güvenli Doğrulama',
      description: 'Deneme süresini başlatmak için ödeme doğrulaması tamamlanmalı.',
      status: paymentStatus,
      requiredForPublish: true,
      blockingReason: isTrialingOrActive ? undefined : 'Aboneliğiniz askıda veya ödeme doğrulaması bekliyor. Lütfen Ödeme sekmesinden tamamlayın.',
      targetTab: 'billing'
    });

    // Step 9: preview_review
    let previewStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started';
    if (isPreviewReady) {
      previewStatus = 'completed';
    } else {
      previewStatus = 'blocked';
    }
    steps.push({
      id: 'preview_review',
      title: 'Önizleme & Test',
      description: 'Yayına çıkmadan önce oluşturduğunuz sitenin önizleme kontrolü.',
      status: previewStatus,
      requiredForPublish: true,
      blockingReason: isPreviewReady ? undefined : 'Önizleme yapabilmek için önce temel işletme bilgileri, hizmet ve uzman eklemelisiniz.',
      targetRoute: '/admin-preview'
    });

    // Step 10: publish_review
    let publishStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked' = 'not_started';
    if (isApproved) {
      publishStatus = 'completed';
    } else if (isSubmitted) {
      publishStatus = 'in_progress';
    } else {
      // Check if blocked by any required steps beforehand
      const hasBlockers = steps.some(s => s.id !== 'publish_review' && s.requiredForPublish && s.status !== 'completed');
      publishStatus = hasBlockers ? 'blocked' : 'not_started';
    }
    steps.push({
      id: 'publish_review',
      title: 'Yayın İncelemesi',
      description: 'Sitenizin incelenmek üzere LARİ ekibine iletilmesi.',
      status: publishStatus,
      requiredForPublish: true,
      blockingReason: isApproved ? undefined : 'İncelemeye göndermek için tüm zorunlu adımları tamamlamanız gerekir.',
      targetTab: 'setup'
    });

    // 4. Calculate progress percentage
    // Calculate progress as number of completed required steps
    const requiredSteps = steps.filter(s => s.requiredForPublish);
    const completedRequired = requiredSteps.filter(s => s.status === 'completed').length;
    const progressPercent = Math.round((completedRequired / requiredSteps.length) * 100);

    // 5. Determine eligibility
    // Can submit for review if all required steps except publish_review are completed, and we aren't already submitted
    const requiredBeforePublishSatisfied = steps
      .filter(s => s.id !== 'publish_review' && s.requiredForPublish)
      .every(s => s.status === 'completed');

    const canSubmitForReview = requiredBeforePublishSatisfied && tenant?.publicSiteStatus !== 'pending_review' && tenant?.publicSiteStatus !== 'published';

    // Next actionable step
    const nextStep = steps.find(s => s.requiredForPublish && s.status !== 'completed');

    return {
      steps,
      progressPercent,
      canSubmitForReview,
      isPendingReview: tenant?.publicSiteStatus === 'pending_review',
      isPublished: tenant?.publicSiteStatus === 'published',
      nextStep,
      pendingCheckout: isPendingCheckout
    };
  }
};
