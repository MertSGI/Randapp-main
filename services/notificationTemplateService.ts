export interface NotificationTemplate {
  id: string;
  channel: 'email' | 'whatsapp' | 'in_app';
  audience: 'business_owner' | 'customer' | 'super_admin';
  title: string;
  subject?: string;
  body: string;
  variables: string[];
  enabled: boolean;
  providerRequired: boolean;
  internalOnly?: boolean;
}

class NotificationTemplateService {
  public getTemplates(): NotificationTemplate[] {
    return [
      {
        id: 'onboarding_welcome',
        channel: 'email',
        audience: 'business_owner',
        title: 'Hoşgeldin Mesajı',
        subject: 'LARİ\'ye Hoş Geldiniz! 🎉',
        body: 'Merhaba {business_name}, LARİ platformuna hoş geldiniz. Randevularınızı yönetmek ve dijitalleşme yolculuğunuzda yanınızda olmaktan mutluluk duyuyoruz.',
        variables: ['business_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'trial_started',
        channel: 'email',
        audience: 'business_owner',
        title: 'Abonelik Denemesi Başladı (Trial Started)',
        subject: 'LARİ - 14 Günlük Deneme Süreniz Başladı 🚀',
        body: '14 günlük ücretsiz denemeniz başladı. Deneme süresi boyunca ödeme alınmaz. 14 gün içinde iptal etmezseniz seçtiğiniz plan otomatik olarak başlar.',
        variables: ['business_name', 'plan_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'checkout_pending',
        channel: 'in_app',
        audience: 'business_owner',
        title: 'Ödeme Bekliyor / Provizyon Alma',
        subject: 'LARİ - Üyelik Provizyon ve Doğrulama Bekliyor',
        body: 'Denemenizi başlatmak için güvenli ödeme doğrulama adımını tamamlayın. Kart bilgileriniz LARİ tarafından alınmaz.',
        variables: [],
        enabled: true,
        providerRequired: false
      },
      {
        id: 'trial_ending_reminder',
        channel: 'email',
        audience: 'business_owner',
        title: 'Deneme Süresi Sona Eriyor (Trial Ending)',
        subject: 'Deneme Sürenizin Sona Ermesine Az Kaldı ⏳',
        body: 'Merhaba, 14 günlük deneme sürenizin sonuna gelmektesiniz. 14 gün boyunca ödeme alınmamıştır. İptal etmezseniz, seçtiğiniz üyelik planı otomatik olarak başlayacak.',
        variables: ['business_name', 'end_date'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'payment_failed',
        channel: 'email',
        audience: 'business_owner',
        title: 'Doğrulama / Ödeme Alınamadı',
        subject: 'Abonelik Yenileme Başarısız ⚠️',
        body: 'Kartınız güvenli ödeme sağlayıcısı tarafından doğrulanamadı veya ödeme başarısız oldu. Lütfen ödeme bilgilerinizi güncelleyiniz.',
        variables: ['business_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'appointment_confirmation',
        channel: 'whatsapp',
        audience: 'customer',
        title: 'Randevu Onay Bildirimi',
        body: 'Randevunuz oluşturuldu. İşletme, hizmet ve saat bilgilerinizi aşağıda görebilirsiniz: {business_name} - {service_name} - {date} {time}. Bizi tercih ettiğiniz için teşekkür ederiz!',
        variables: ['customer_name', 'business_name', 'service_name', 'date', 'time'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'appointment_reminder',
        channel: 'whatsapp',
        audience: 'customer',
        title: 'Randevu Hatırlatıcı (Appointment Reminder)',
        body: 'Merhaba {customer_name}, yarın {time} saatindeki {service_name} randevunuzu hatırlatmak isteriz. Görüşmek üzere!',
        variables: ['customer_name', 'time', 'service_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'booking_cancelled',
        channel: 'whatsapp',
        audience: 'customer',
        title: 'Randevu İptal Bildirimi (Booking Cancelled)',
        body: 'Sayın {customer_name}, {date} saat {time} randevunuz iptal edilmiştir.',
        variables: ['customer_name', 'date', 'time'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'publish_review_submitted',
        channel: 'in_app',
        audience: 'business_owner',
        title: 'Yayın Onay Talebi Alındı',
        body: 'Başvurunuz alındı. İşletme profiliniz incelenecek ve en kısa sürede yayına alınacaktır.',
        variables: [],
        enabled: true,
        providerRequired: false
      },
      {
        id: 'publish_approved',
        channel: 'email',
        audience: 'business_owner',
        title: 'Yayın Onayı Verildi (Publish Approved)',
        subject: 'Tebrikler! İşletme Siteniz Yayında 🎉',
        body: 'İşletme sayfanız yayına hazır. Artık müşterileriniz online randevu alabilir. Sistemimizin keyfini çıkarın!',
        variables: ['business_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'publish_rejected',
        channel: 'email',
        audience: 'business_owner',
        title: 'Yayın Onay Talebi Reddedildi (Publish Rejected / Request Changes)',
        subject: 'LARİ - İşletme Yayını Ek Düzenleme Talebi',
        body: 'Merhaba, salon profiliniz incelenmiş olup, bazı kurumsal verilerinizin güncellenmesi rica edilmiştir. Lütfen yönetici panelinden eksikleri tamamlayarak tekrar onaya gönderiniz.',
        variables: ['business_name', 'reasons'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'platform_referral_reward_earned',
        channel: 'email',
        audience: 'business_owner',
        title: 'Referans Ödülü Kazanıldı',
        subject: 'Tebrikler! Ücretsiz Kullanım Ayı Kazandınız 🎉',
        body: 'Merhaba {business_name}, önermiş olduğunuz işletme aboneliğini başlattığı için LARİ platform referans programı kapsamında 1 ay ücretsiz kullanım kazandınız! Ödülünüz, ilk uygun faturanızda indirim olarak yansıtılacaktır.',
        variables: ['business_name'],
        enabled: true,
        providerRequired: true
      },
      {
        id: 'support_followup',
        channel: 'email',
        audience: 'customer',
        title: 'Destek/İletişim Geri Dönüşü',
        subject: 'LARİ Müşteri Destek',
        body: 'Talebinizle ilgili en kısa sürede size destek vereceğiz. Geri bildiriminiz için teşekkürler.',
        variables: [],
        enabled: true,
        providerRequired: true,
        internalOnly: true
      }
    ];
  }
}

export const notificationTemplateService = new NotificationTemplateService();
