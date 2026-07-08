export interface NotificationTemplate {
  id: string;
  name: string;
  subject_tr: string;
  body_tr: string;
  recipient: 'merchant' | 'customer';
}

export interface OperationalContact {
  role: string;
  name: string;
  email: string;
  whatsapp: string;
}

export interface PilotProviderConfig {
  name: string;
  type: 'email' | 'whatsapp' | 'sms';
  status: 'pending' | 'configured';
  hint: string;
}

class CustomerPilotReadinessService {
  public getProviders(): PilotProviderConfig[] {
    return [
      {
        name: 'SMTP Transactional Email',
        type: 'email',
        status: 'pending',
        hint: 'Use AWS SES, SendGrid, or Custom Postfix SMTP in production.'
      },
      {
        name: 'WhatsApp Business API',
        type: 'whatsapp',
        status: 'pending',
        hint: 'Meta Cloud API or 3rd party providers (e.g., Netgsm, InfoIP) for automated notifications.'
      },
      {
        name: 'SMS Gateway provider',
        type: 'sms',
        status: 'pending',
        hint: 'Alternative backup gateway for reminder notification delivery.'
      }
    ];
  }

  public getOperationalContacts(): OperationalContact[] {
    return [
      {
        role: 'Lansman / Pilot Sorumlusu',
        name: 'Lari Super Admin Team',
        email: 'support@lari.app',
        whatsapp: '+90 850 LARI'
      }
    ];
  }

  public getNotificationTemplates(): NotificationTemplate[] {
    return [
      {
        id: 'trial_started',
        name: 'Abonelik Denemesi Başladı (Trial Started)',
        subject_tr: 'LARİ - 14 Günlük Deneme Süreniz Başladı 🚀',
        body_tr: 'Merhaba, {business_name}! LARİ platformuna hoş geldiniz. 14 günlük deneme süreniz başarıyla başlatılmıştır. Bu süreçte kartınızdan herhangi bir ödeme alınmaz.',
        recipient: 'merchant'
      },
      {
        id: 'checkout_pending',
        name: 'Ödeme Bekliyor / Provizyon Alma',
        subject_tr: 'LARİ - Üyelik Provizyon ve Doğrulama Bekliyor',
        body_tr: 'Merhaba! Denemenizi başlatmak ve salonunuzu aktifleştirmek için iyzico üzerinden güvenli kart doğrulamasını tamamlamanız gerekmektedir.',
        recipient: 'merchant'
      },
      {
        id: 'appointment_confirmation',
        name: 'Randevu Onay Bildirimi',
        subject_tr: 'Randevunuz Onaylandı - {business_name} ✅',
        body_tr: 'Sayın {customer_name}, {service_name} işleminiz için {date} günü {time} saatinde randevunuz onaylanmıştır. Teşekkür ederiz!',
        recipient: 'customer'
      },
      {
        id: 'appointment_reminder',
        name: 'Randevu Hatırlatıcı (Appointment Reminder)',
        subject_tr: 'Yarınki Randevunuzu Hatırlatmak İsteriz ⏰',
        body_tr: 'Merhaba {customer_name}, yarın {time} saatindeki {service_name} randevunuzu hatırlatmak isteriz.',
        recipient: 'customer'
      },
      {
        id: 'booking_cancelled',
        name: 'Randevu İptal Bildirimi (Booking Cancelled)',
        subject_tr: 'Randevunuz İptal Edildi - {business_name} ❌',
        body_tr: 'Sayın {customer_name}, {date} saat {time} randevunuz iptal edilmiştir.',
        recipient: 'customer'
      },
      {
        id: 'publish_approved',
        name: 'Yayın Onayı Verildi (Publish Approved)',
        subject_tr: 'Tebrikler! İşletme Siteniz Yayında 🎉',
        body_tr: 'Harika haber! İşletmeniz onaylandı ve public site yayın kapısı açıldı. Artık online randevu kabulüne hazırsınız.',
        recipient: 'merchant'
      },
      {
        id: 'publish_rejected',
        name: 'Yayın Onay Talebi Reddedildi (Publish Rejected / Request Changes)',
        subject_tr: 'LARİ - İşletme Yayını Ek Düzenleme Talebi',
        body_tr: 'Merhaba, salon profiliniz incelenmiş olup, bazı kurumsal verilerinizin (örneğin hizmet fiyatları veya adresiniz) güncellenmesi rica edilmiştir.',
        recipient: 'merchant'
      },
      {
        id: 'payment_failed',
        name: 'Doğrulama / Ödeme Alınamadı',
        subject_tr: 'Abonelik Yenileme Başarısız ⚠️',
        body_tr: 'Kartınız güvenli ödeme sağlayıcısı tarafından doğrulanamadı veya ödeme başarısız oldu. Lütfen ödeme bilgilerinizi güncelleyiniz.',
        recipient: 'merchant'
      },
      {
        id: 'trial_ending_reminder',
        name: 'Deneme Süresi Sona Eriyor (Trial Ending)',
        subject_tr: 'Deneme Sürenizin Sona Ermesine Az Kaldı ⏳',
        body_tr: 'Merhaba, 14 günlük deneme sürenizin sonuna gelmektesiniz. 14 gün boyunca kartınızdan ücret çekilmemiştir. İptal etmezseniz, seçtiğiniz üyelik planı otomatik olarak başlayacaktır.',
        recipient: 'merchant'
      }
    ];
  }
}

export const customerPilotReadinessService = new CustomerPilotReadinessService();
