export type PilotStage =
  | 'lead_identified'
  | 'demo_scheduled'
  | 'demo_completed'
  | 'setup_info_collected'
  | 'account_created'
  | 'payment_verified'
  | 'onboarding_in_progress'
  | 'public_preview_ready'
  | 'submitted_for_review'
  | 'published'
  | 'launch_shared'
  | 'first_booking_received'
  | 'first_week_reviewed'
  | 'pilot_successful'
  | 'paused';

export interface PilotCustomer {
  tenantId: string;
  businessName: string;
  stage: PilotStage;
  setupTasksCompleted: string[];
  metrics: PilotSuccessMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface PilotSuccessMetrics {
  setupCompleted: boolean;
  publicLinkShared: boolean;
  firstBookingCreated: boolean;
  appointmentCompleted: boolean;
  customerMemoryRecordCreated: boolean;
  sourceTrackingUsed: boolean;
  campaignActivated: boolean;
  ownerLoggedInTwice: boolean;
  linkPlacedInSocials: boolean;
  feedbackCollected: boolean;
}

export const pilotCustomerOnboardingService = {
  getPilotStages(): PilotStage[] {
    return [
      'lead_identified',
      'demo_scheduled',
      'demo_completed',
      'setup_info_collected',
      'account_created',
      'payment_verified',
      'onboarding_in_progress',
      'public_preview_ready',
      'submitted_for_review',
      'published',
      'launch_shared',
      'first_booking_received',
      'first_week_reviewed',
      'pilot_successful',
      'paused'
    ];
  },

  getAllPilots(): PilotCustomer[] {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lari_pilot_customer_tracker_by_tenant');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {}
      }
    }
    return [];
  },

  getPilot(tenantId: string): PilotCustomer | null {
    const pilots = this.getAllPilots();
    return pilots.find(p => p.tenantId === tenantId) || null;
  },

  registerPilotActivity(tenantId: string, businessName: string): PilotCustomer {
    const pilots = this.getAllPilots();
    let pilot = pilots.find(p => p.tenantId === tenantId);
    
    if (!pilot) {
      pilot = {
        tenantId,
        businessName,
        stage: 'account_created',
        setupTasksCompleted: [],
        metrics: this.getInitialMetrics(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      pilots.push(pilot);
      this.savePilots(pilots);
    }
    return pilot;
  },

  updatePilotStage(tenantId: string, stage: PilotStage): PilotCustomer | null {
    const pilots = this.getAllPilots();
    const pilotIndex = pilots.findIndex(p => p.tenantId === tenantId);
    if (pilotIndex >= 0) {
      pilots[pilotIndex].stage = stage;
      pilots[pilotIndex].updatedAt = new Date().toISOString();
      this.savePilots(pilots);
      return pilots[pilotIndex];
    }
    return null;
  },

  markPilotTaskComplete(tenantId: string, taskId: string): PilotCustomer | null {
    const pilots = this.getAllPilots();
    const pilotIndex = pilots.findIndex(p => p.tenantId === tenantId);
    if (pilotIndex >= 0) {
      if (!pilots[pilotIndex].setupTasksCompleted.includes(taskId)) {
        pilots[pilotIndex].setupTasksCompleted.push(taskId);
        pilots[pilotIndex].updatedAt = new Date().toISOString();
        this.savePilots(pilots);
      }
      return pilots[pilotIndex];
    }
    return null;
  },

  updatePilotMetrics(tenantId: string, patch: Partial<PilotSuccessMetrics>): PilotCustomer | null {
    const pilots = this.getAllPilots();
    const pilotIndex = pilots.findIndex(p => p.tenantId === tenantId);
    if (pilotIndex >= 0) {
      pilots[pilotIndex].metrics = { ...pilots[pilotIndex].metrics, ...patch };
      pilots[pilotIndex].updatedAt = new Date().toISOString();
      this.savePilots(pilots);
      return pilots[pilotIndex];
    }
    return null;
  },

  savePilots(pilots: PilotCustomer[]) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lari_pilot_customer_tracker_by_tenant', JSON.stringify(pilots));
    }
  },

  getInitialMetrics(): PilotSuccessMetrics {
    return {
      setupCompleted: false,
      publicLinkShared: false,
      firstBookingCreated: false,
      appointmentCompleted: false,
      customerMemoryRecordCreated: false,
      sourceTrackingUsed: false,
      campaignActivated: false,
      ownerLoggedInTwice: false,
      linkPlacedInSocials: false,
      feedbackCollected: false
    };
  },

  getPilotChecklist(tenantId: string) {
    return [
      { id: 'business_info', name: 'İşletme Bilgileri' },
      { id: 'services', name: 'Hizmetler' },
      { id: 'staff', name: 'Personel' },
      { id: 'working_hours', name: 'Çalışma Saatleri' }
    ];
  },

  getOwnerTrainingChecklist(tenantId: string) {
    return [
      { id: 'dashboard_overview', name: 'Panel Kullanımı' },
      { id: 'add_appointment', name: 'Manuel Randevu Ekleme' },
      { id: 'manage_appointment', name: 'Randevu Onay/İptal İşlemleri' },
      { id: 'customer_memory', name: 'Müşteri Hafızası Notları' },
      { id: 'share_links', name: 'Bağlantı Paylaşımı (Instagram/WhatsApp)' }
    ];
  },

  getPilotSuccessMetrics(tenantId: string) {
    return this.getPilot(tenantId)?.metrics || this.getInitialMetrics();
  },

  getFirstWeekFollowUpTasks(tenantId: string) {
    return [
      { id: 'check_link_in_bio', name: 'Instagram biona link eklendi mi?' },
      { id: 'check_first_booking', name: 'İlk online randevu geldi mi?' },
      { id: 'check_customer_memory', name: 'Müşteri notu eklendi mi?' },
      { id: 'collect_feedback', name: 'Sahip geribildirimi alındı mı?' }
    ];
  },

  getSupportTemplates() {
    return [
      { 
        id: 'login_issue', 
        name: 'Giriş Sorunu', 
        text: 'Giriş yapmakta sorun yaşadığınızı görüyorum. Lütfen https://lari.app/login adresinden kayıt olduğunuz e-posta adresi ile giriş yapmayı deneyin. Şifrenizi unuttuysanız "Şifremi Unuttum" bağlantısını kullanabilirsiniz.' 
      },
      { 
        id: 'booking_link_not_opening', 
        name: 'Randevu Linki Açılmıyor', 
        text: 'Randevu bağlantınızın aktif olması için panelden "Yayınla" adımını tamamlamanız gerekmektedir. Admin panelinize girip sağ üstteki yayınla butonuna basabilir misiniz?' 
      },
      { 
        id: 'changing_service_price', 
        name: 'Hizmet Fiyatı Değiştirme', 
        text: 'Fiyatları güncellemek için: Menü > Hizmetler ve Menü adımına gidin. Düzenlemek istediğiniz hizmetin yanındaki "Düzenle" butonuna tıklayıp yeni fiyatı kaydedebilirsiniz.' 
      },
      { 
        id: 'adding_staff', 
        name: 'Personel Ekleme', 
        text: 'Yeni personel eklemek için: Menü > Personel Yönetimi adımına gidin. "Yeni Personel Ekle" butonuna tıklayarak isim ve unvan bilgilerini girip kaydedebilirsiniz.' 
      },
      { 
        id: 'editing_working_hours', 
        name: 'Çalışma Saatleri', 
        text: 'Çalışma saatlerinizi Menü > İşletme Ayarları > Çalışma Saatleri bölümünden düzenleyebilirsiniz. Kapalı olduğunuz günleri buradan belirtebilirsiniz.' 
      },
      { 
        id: 'publishing_site', 
        name: 'Siteyi Yayınlama', 
        text: 'Tüm kurulum adımlarını tamamladıysanız, panelin üst kısmında yer alan "Profilinizi Yayınlayın" bannerına veya sağ üstteki Yayın Durumu menüsüne tıklayarak sitenizi aktif edebilirsiniz.' 
      },
      { 
        id: 'card_verification', 
        name: 'Kart Doğrulama Sorusu', 
        text: 'Kayıt sırasında istenen kart bilgileri, güvenli ödeme altyapımız İyzico tarafından hesabınızı doğrulamak ve spam hesapları engellemek için alınmaktadır. 14 günlük deneme süresi boyunca kartınızdan çekim yapılmaz.' 
      },
      { 
        id: 'cancelling_subscription', 
        name: 'Abonelik İptali', 
        text: 'Aboneliğinizi iptal etmek isterseniz, Menü > Ayarlar > Faturalandırma sekmesinden "Aboneliği İptal Et" seçeneği ile işleminizi gerçekleştirebilirsiniz.' 
      },
      { 
        id: 'referral_reward', 
        name: 'Referans Kampanyası', 
        text: 'Referans puanlarınızı veya kampanyalarınızı Menü > Kampanyalar ve Referanslar altından takip edebilir ve ödülleri onaylayabilirsiniz.' 
      },
      { 
        id: 'customer_data_delete', 
        name: 'Müşteri Verisi Silme', 
        text: 'Bir müşteriniz verisinin silinmesini talep ettiyse, Müşteriler listesinden müşteriyi bulup "Müşteri Hafızası" sekmesinde yer alan Veri Portabilitesi bölümünden talebi işleme alabilirsiniz.' 
      },
      { 
        id: 'multi_branch_question', 
        name: 'Çoklu Şube Sorusu', 
        text: 'Şube eklemek için Enterprise/Kurumsal pakette olmanız gerekmektedir. Eğer paketiniz uygunsa Menü > İşletme Ayarları > Şubeler adımından yeni şube oluşturabilirsiniz.' 
      }
    ];
  }
};
