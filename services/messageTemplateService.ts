import { CommunicationEventType } from '../types';

export interface TemplateDefinition {
  type: CommunicationEventType;
  language: 'tr' | 'en';
  subject?: string;
  body: string;
}

const TEMPLATES: Record<string, TemplateDefinition[]> = {
  // 1. Booking Created (Customer)
  booking_created_customer: [
    {
      type: 'booking_created',
      language: 'tr',
      subject: 'Randevunuz Alındı 📅',
      body: 'Merhaba {customerName}, {businessName} işletmesinden {serviceName} için {date} tarihinde saat {time} randevunuz başarıyla alınmıştır. Rezervasyon onaylandığında veya değişiklik olduğunda bilgilendirileceksiniz.'
    },
    {
      type: 'booking_created',
      language: 'en',
      subject: 'Appointment Requested 📅',
      body: 'Hello {customerName}, your appointment for {serviceName} at {businessName} on {date} at {time} has been received. You will be notified when it is confirmed or updated.'
    }
  ],
  // 2. Booking Created (Owner)
  booking_created_owner: [
    {
      type: 'booking_created',
      language: 'tr',
      subject: 'Yeni Rezervasyon Talebi Alındı',
      body: 'Merhaba, salonunuza yeni bir randevu talebi ulaştı. Müşteri: {customerName}, Hizmet: {serviceName}, Tarih: {date} saat: {time}. Lütfey paneli kontrol edin.'
    },
    {
      type: 'booking_created',
      language: 'en',
      subject: 'New Appointment Booking Received',
      body: 'Hello, a new appointment has been booked. Customer: {customerName}, Service: {serviceName}, Date: {date} at {time}. Please inspect your panel.'
    }
  ],
  // 3. Booking Confirmed
  booking_confirmed: [
    {
      type: 'booking_confirmed',
      language: 'tr',
      subject: 'Randevunuz Onaylandı! ✅',
      body: 'Harika haber {customerName}! {businessName} salonundaki {serviceName} randevunuz onaylanmıştır. Tarih: {date} Saat: {time}. Sizi bekliyoruz!'
    },
    {
      type: 'booking_confirmed',
      language: 'en',
      subject: 'Appointment Confirmed! ✅',
      body: 'Great news {customerName}! Your appointment for {serviceName} at {businessName} is confirmed. Date: {date} at {time}. See you there!'
    }
  ],
  // 4. Booking Cancelled
  booking_cancelled: [
    {
      type: 'booking_cancelled',
      language: 'tr',
      subject: 'Randevunuz İptal Edildi ❌',
      body: 'Sayın {customerName}, {businessName} salonundaki {date} saat {time} tarihli {serviceName} randevunuz iptal edilmiştir. Yeni randevu oluşturmak için sitemizi ziyaret edebilirsiniz.'
    },
    {
      type: 'booking_cancelled',
      language: 'en',
      subject: 'Appointment Cancelled ❌',
      body: 'Hello {customerName}, your appointment at {businessName} on {date} at {time} for {serviceName} has been cancelled. Please visit our website to reschedule.'
    }
  ],
  // 5. Booking Completed
  booking_completed: [
    {
      type: 'booking_completed',
      language: 'tr',
      subject: 'Bizi Tercih Ettiğiniz İçin Teşekkürler! 🌸',
      body: 'Merhaba {customerName}, {businessName} salonundaki hizmetinizi tamamladığınız için teşekkür ederiz. Görüşleriniz bizim için çok değerlidir.'
    },
    {
      type: 'booking_completed',
      language: 'en',
      subject: 'Thank You for Choosing Us! 🌸',
      body: 'Hello {customerName}, thank you for completing your appointment at {businessName}. We look forward to seeing you again!'
    }
  ],
  // 6. Booking No Show
  booking_no_show: [
    {
      type: 'booking_no_show',
      language: 'tr',
      subject: 'Randevuya Katılmama Durumu',
      body: 'Merhaba {customerName}, {date} saat {time} tarihindeki randevunuza katılamadığınız tescil edilmiştir. Sorun yaşadıysanız bizimle iletişime geçebilirsiniz.'
    },
    {
      type: 'booking_no_show',
      language: 'en',
      subject: 'Nonscheduled Appointment No Show',
      body: 'Hello {customerName}, your appointment on {date} at {time} was marked as a no-show. Feel free to reach out if you have any questions.'
    }
  ],
  // 7. Booking Reminder
  booking_reminder: [
    {
      type: 'booking_reminder',
      language: 'tr',
      subject: 'Randevu Hatırlatıcı ⏰',
      body: 'Merhaba {customerName}, yarın saat {time}\'deki {serviceName} randevunuzu hatırlatmak isteriz. Adres: {address}. Herhangi bir değişiklik için salonla iletişime geçebilirsiniz.'
    },
    {
      type: 'booking_reminder',
      language: 'en',
      subject: 'Appointment Reminder ⏰',
      body: 'Hello {customerName}, this is a reminder for your {serviceName} appointment tomorrow at {time}. Address: {address}. Contact us if you need adjustments.'
    }
  ],
  // 8. Owner Registered Welcome
  owner_registered: [
    {
      type: 'owner_registered',
      language: 'tr',
      subject: 'LARİ Platformuna Hoş Geldiniz! 🎉',
      body: 'Merhaba {ownerName}, {businessName} kaydı başarıyla oluşturulmuştur. Dijital rezervasyon altyapınız kurulurken her adımda yanınızdayız.'
    },
    {
      type: 'owner_registered',
      language: 'en',
      subject: 'Welcome to LARİ! 🎉',
      body: 'Hello {ownerName}, your registration for {businessName} is complete. We are here to support you at every stage of your digitisation journey.'
    }
  ],
  // 9. Onboarding Started
  onboarding_started: [
    {
      type: 'onboarding_started',
      language: 'tr',
      subject: 'Dijital Kuruluma Başladınız 🛠️',
      body: 'Merhaba {ownerName}, işletmeniz için dijital sihirbaz kurulum aşaması başarıyla başlatılmıştır. Hizmetlerinizi, çalışanlarınızı ve şube ayarlarınızı girerek devam edin.'
    },
    {
      type: 'onboarding_started',
      language: 'en',
      subject: 'Digital Setup Initiated 🛠️',
      body: 'Hello {ownerName}, setup wizard has been initiated. Continue configuring services, staff, and branch information to proceed.'
    }
  ],
  // 10. Onboarding Completion
  onboarding_completed: [
    {
      type: 'onboarding_completed',
      language: 'tr',
      subject: 'Kurulum Sihirbazı Tamamlandı! ✨',
      body: 'Tebrikler {ownerName}! {businessName} kurulumunu tamamladınız. Artık işletme detaylarınızı kontrol edip sitenizi yayına alma adımına geçebilirsiniz.'
    },
    {
      type: 'onboarding_completed',
      language: 'en',
      subject: 'Setup Wizard Completed! ✨',
      body: 'Congratulations {ownerName}! You have completed setup for {businessName}. You can now review your workspace details and move to publish your site.'
    }
  ],
  // 11. Public Site Preview Ready
  public_site_preview_ready: [
    {
      type: 'public_site_preview_ready',
      language: 'tr',
      subject: 'Önizleme Bağlantınız Hazır 🌐',
      body: 'Merhaba, {businessName} için hazırlanan web sitesi önizleme adresi başarıyla oluşturuldu: {previewUrl}. LARİ bağlantınız yayına alma süreci tamamlandığında kullanılabilir.'
    },
    {
      type: 'public_site_preview_ready',
      language: 'en',
      subject: 'Your Preview URL is Ready 🌐',
      body: 'Hello, your web site preview has been created: {previewUrl}. Your LARİ connection will be accessible once the publish validation completes.'
    }
  ],
  // 12. Public Site Published
  public_site_published: [
    {
      type: 'public_site_published',
      language: 'tr',
      subject: 'Tebrikler! Siteniz Yayında 🚀',
      body: 'Mükemmel haber! {businessName} web siteniz internet dünyasında yayına girdi. Müşterileriniz artık {publicUrl} üzerinden anında randevu oluşturabilir!'
    },
    {
      type: 'public_site_published',
      language: 'en',
      subject: 'Congratulations! Your Site is Live 🚀',
      body: 'Excellent news! Your {businessName} public site is online. Customers can now book instantly via {publicUrl}!'
    }
  ],
  // 13. Trial Started
  trial_started: [
    {
      type: 'trial_started',
      language: 'tr',
      subject: '14 Günlük Deneme Süreniz Başladı 📈',
      body: 'Merhaba {ownerName}, {businessName} işletmesi için seçtiğiniz {planName} planına uygun 14 günlük deneme süreniz başarıyla başladı. Güvenli ödeme sağlayıcısı üzerinden doğrulama yapılmıştır. Deneme süresi boyunca kartınızdan herhangi bir tahsilat yapılmaz.'
    },
    {
      type: 'trial_started',
      language: 'en',
      subject: 'Your 14-Day Trial Started 📈',
      body: 'Hello {ownerName}, your 14-day trial for the {planName} plan is now active for {businessName}. Verification has been conducted securely via our checkout gateway. No charges are processed during the trial phase.'
    }
  ],
  // 14. Trial Ending
  trial_ending: [
    {
      type: 'trial_ending',
      language: 'tr',
      subject: 'Abonelik Deneme Döneminiz Sona Eriyor ⏳',
      body: 'Sayın {ownerName}, {businessName} için aktif olan deneme dönemi {endDate} tarihinde sona erecektir. Süre bittiğinde, seçmiş olduğunuz {planName} üyeliği otomatik olarak süreklilik kazanacaktır.'
    },
    {
      type: 'trial_ending',
      language: 'en',
      subject: 'Your Subscription Trial Period is Ending ⏳',
      body: 'Hello {ownerName}, your trial period for {businessName} will end on {endDate}. After this date, your {planName} subscription will resume automatically.'
    }
  ],
  // 15. Subscription Past Due
  subscription_past_due: [
    {
      type: 'subscription_past_due',
      language: 'tr',
      subject: 'Önemli: Abonelik Ödeme İşlemi Gerçekleştirilemedi ⚠️',
      body: 'Merhaba {ownerName}, {businessName} hesabınız için tahakkuk eden son fatura ödemesi kart hatası sebebiyle tamamlanamadı. Randevu engelini önlemek için lütfen kart bilgilerinizi güncelleyin.'
    },
    {
      type: 'subscription_past_due',
      language: 'en',
      subject: 'Important: Subscription Renewal Failed ⚠️',
      body: 'Hello {ownerName}, the payment for your {businessName} subscription has failed. Please update your card details to prevent booking service blocks.'
    }
  ],
  // 16. Subscription Paused
  subscription_paused: [
    {
      type: 'subscription_paused',
      language: 'tr',
      subject: 'Rezervasyon Kabulü Geçici Olarak Durduruldu ⏸️',
      body: 'Merhaba, talebiniz doğrultusunda {businessName} online randevu kabulü geçici olarak dondurulmuştur. Dilediğiniz zaman panonuzdan tekrar yayına alabilirsiniz.'
    },
    {
      type: 'subscription_paused',
      language: 'en',
      subject: 'Online Booking System Paused ⏸️',
      body: 'Hello, according to your request, {businessName} booking acceptances have been paused temporarily. You can resume operations anytime in your admin console.'
    }
  ],
  // 17. Subscription Suspended
  subscription_suspended: [
    {
      type: 'subscription_suspended',
      language: 'tr',
      subject: 'Hesap Hizmet Bilgisi: Askıya Alındı 🔒',
      body: 'Sayın Yetkili, {businessName} hesabı doğrulama veya idari sebeplerden ötürü geçici olarak değerlendirme aşamasına alınmış ve hizmet askıya alınmıştır.'
    },
    {
      type: 'subscription_suspended',
      language: 'en',
      subject: 'Account Notice: Subscription Suspended 🔒',
      body: 'Hello, the subscription for {businessName} has been suspended due to validation or administrative process evaluations.'
    }
  ],
  // 18. Plan Upgraded
  plan_upgraded: [
    {
      type: 'plan_upgraded',
      language: 'tr',
      subject: 'Planınız Başarıyla Yükseltildi 🚀',
      body: 'Tebrikler! {businessName} planınız {newPlanName} düzeyine upgraded edilmiştir. Yeni limitleriniz ve geliştirilmiş kurumsal özellikleriniz hemen aktif edilmiştir.'
    },
    {
      type: 'plan_upgraded',
      language: 'en',
      subject: 'Plan Upgraded Successfully 🚀',
      body: 'Congratulations! Your subscription layout for {businessName} has been upgraded to {newPlanName}. New limits and premium features are initialized instantly.'
    }
  ],
  // 19. Plan Downgrade Scheduled
  plan_downgrade_scheduled: [
    {
      type: 'plan_downgrade_scheduled',
      language: 'tr',
      subject: 'Plan Değişikliği Dönem Sona Programlandı 🧾',
      body: 'Hesap aboneliğiniz mevcut dönem sonunda {newPlanName} planına geçiş yapacak şekilde programlanmıştır. Dönem bitiş tarihine kadar yüksek paket haklarınız devam eder.'
    },
    {
      type: 'plan_downgrade_scheduled',
      language: 'en',
      subject: 'Plan Downgrade Programmed for Term End 🧾',
      body: 'Your subscription is scheduled to transition to the {newPlanName} package at the end of the billing period, preserving your current privileges until then.'
    }
  ],
  // 20. Subscription Cancelled Period End
  subscription_cancelled_period_end: [
    {
      type: 'subscription_cancelled_period_end',
      language: 'tr',
      subject: 'Abonelik Dönem Sona İptal Edildi ⏳',
      body: 'Aboneliğiniz dönem sonunda sonlanacak şekilde iptal edilmiştir. Gelecek fatura döneminde tahsilat yapılmayacaktır.'
    },
    {
      type: 'subscription_cancelled_period_end',
      language: 'en',
      subject: 'Subscription Set to Terminate at Term End ⏳',
      body: 'Your subscription will remain functional until the end of the term. No further recurring charges will be processed.'
    }
  ],
  // 21. Subscription Cancelled Immediate
  subscription_cancelled_immediate: [
    {
      type: 'subscription_cancelled_immediate',
      language: 'tr',
      subject: 'Aboneliğiniz Hemen Sonlandırıldı ❌',
      body: 'Abonelik paketiniz ve online randevu hizmetleriniz anında devre dışı bırakılmıştır. Profiliniz pasif konuma alınmıştır.'
    },
    {
      type: 'subscription_cancelled_immediate',
      language: 'en',
      subject: 'Subscription Terminated Instantly ❌',
      body: 'Your active subscription has been cancelled immediately, and public site online booking has been deactivated.'
    }
  ],
  // 22. Manual Subscription Activated
  manual_subscription_activated: [
    {
      type: 'manual_subscription_activated',
      language: 'tr',
      subject: 'Kurumsal Paket Aktifleştirildi 🔑',
      body: 'Merhaba {ownerName}, {businessName} için {planName} üyeliğiniz ve offline fatura kurallarınız Super Admin tarafından manuel olarak aktifleştirilmiştir.'
    },
    {
      type: 'manual_subscription_activated',
      language: 'en',
      subject: 'Subscription Activated Manually 🔑',
      body: 'Hello {ownerName}, your {planName} active package for {businessName} has been initialized manually via our off-grid ledger.'
    }
  ],
  // 23. Referral Credit Awarded
  referral_credit_awarded: [
    {
      type: 'referral_credit_awarded',
      language: 'tr',
      subject: 'Referans Ödülü Hesabınıza Eklendi! 🎁',
      body: 'Harika! Önerdiğiniz salon üyelik adımını tamamladı. Hesabınıza {months} aylık ücretsiz kullanım hediyesi başarıyla tanımlanmıştır.'
    },
    {
      type: 'referral_credit_awarded',
      language: 'en',
      subject: 'Referral Reward Awarded! 🎁',
      body: 'Excellent! Your referred salon finished onboarding and billing setup. We have granted {months} free month(s) of plan extension to your ledger.'
    }
  ],
  // 24. Custom Domain Requested
  custom_domain_requested: [
    {
      type: 'custom_domain_requested',
      language: 'tr',
      subject: 'Özel Alan Adı (Custom Domain) Talebi Alındı 🌐',
      body: 'Merhaba {ownerName}, {businessName} için talep ettiğiniz "{domainName}" alan adı kayda alınmıştır. Sunucularımızın yönlendirme tescilleri sırayla tamamlanarak yayına aktarılacaktır.'
    },
    {
      type: 'custom_domain_requested',
      language: 'en',
      subject: 'Custom Domain Setup Requested 🌐',
      body: 'Hello {ownerName}, your request to map the custom domain "{domainName}" to {businessName} is received. DNS mapping configuration is queued for routing.'
    }
  ],
  // 25. Custom Domain Active
  custom_domain_active: [
    {
      type: 'custom_domain_active',
      language: 'tr',
      subject: 'Özel Alan Adınız Aktif! 🚀',
      body: 'Tebrikler! "{domainName}" alan adı yönlendirme işlemleri tamamlandı. Kurumsal sayfanız artık yeni web adresinizden anında ulaşılabilir durumdadır.'
    },
    {
      type: 'custom_domain_active',
      language: 'en',
      subject: 'Your Custom Domain is Live! 🚀',
      body: 'Congratulations! Your domain "{domainName}" routing is completed, and your public booking brand page is now reachable via this link.'
    }
  ],
  // 26. Support Request Created
  support_request_created: [
    {
      type: 'support_request_created',
      language: 'tr',
      subject: 'Destek Talebiniz Alındı 📩',
      body: 'Merhaba, talebiniz incelemeye alındı. Operatörlerimiz veya destek ekibimiz sizinle en kısa zamanda iletişime geçecektir.'
    },
    {
      type: 'support_request_created',
      language: 'en',
      subject: 'Support Request Received 📩',
      body: 'Hello, your support ticket has been registered. Our operator will reach back as soon as possible.'
    }
  ],
  // 27. Super Admin Manual Provisioning Completed
  super_admin_manual_provisioning_completed: [
    {
      type: 'super_admin_manual_provisioning_completed',
      language: 'tr',
      subject: 'Sistem Bilgisi: Manuel Salon Kurulumu Tamamlandı',
      body: 'Super Admin: {ownerName} için {businessName} salonu, subdomain `{slug}` ve faturalama tipi {billingType} olarak başarıyla sistemde oluşturulmuştur.'
    },
    {
      type: 'super_admin_manual_provisioning_completed',
      language: 'en',
      subject: 'System Notice: Manual Salon Provisioning Complete',
      body: 'Super Admin: Salon {businessName} with owner {ownerName}, subdomain `{slug}` and billing mode {billingType} was created manually.'
    }
  ],
  // 28. Subscription Active
  subscription_active: [
    {
      type: 'subscription_active',
      language: 'tr',
      subject: 'Aboneliğiniz Güvende Sürdürülüyor 💳',
      body: 'Merhaba, {businessName} aboneliğiniz başarıyla yenilenmiş ve ödeme mutabakatı tescil edilmiştir.'
    },
    {
      type: 'subscription_active',
      language: 'en',
      subject: 'Subscription Renewed Successfully 💳',
      body: 'Hello, your subscription for {businessName} is healthy and active. Renewed invoice successfully verified.'
    }
  ],
  appointment_manage_link_created: [
    {
      type: 'appointment_manage_link_created',
      language: 'tr',
      subject: 'Randevunuz Alındı - Randevu Bağlantısı 🔗',
      body: 'Merhaba {customerName}, {businessName} adresindeki randevunuz oluşturuldu! Randevunuzu onaylamak, ertelemek veya iptal etmek için şu bağlantıyı kullanabilirsiniz: {appointmentManageUrl}'
    },
    {
      type: 'appointment_manage_link_created',
      language: 'en',
      subject: 'Appointment Management Link 🔗',
      body: 'Hello {customerName}, your appointment at {businessName} was created! You can use this link to confirm, reschedule, or cancel your booking: {appointmentManageUrl}'
    }
  ],
  cancellation_request_created: [
    {
      type: 'cancellation_request_created',
      language: 'tr',
      subject: 'İptal Talebiniz Alındı 📩',
      body: 'Merhaba {customerName}, {businessName} randevunuzu iptal etme talebiniz başarıyla alınmıştır. Talebiniz salon onayından geçtikten sonra sizi bilgilendireceğiz.'
    }
  ],
  cancellation_request_approved: [
    {
      type: 'cancellation_request_approved',
      language: 'tr',
      subject: 'İptal Talebiniz Onaylandı ❌',
      body: 'Merhaba {customerName}, {businessName} randevu iptal talebiniz onaylanmıştır. Randevunuz iptal edilmiştir. Açıklama: {notes}'
    }
  ],
  cancellation_request_rejected: [
    {
      type: 'cancellation_request_rejected',
      language: 'tr',
      subject: 'İptal Talebiniz Reddedildi ⚠️',
      body: 'Merhaba {customerName}, {businessName} randevunuzu iptal etme talebiniz maalesef onaylanamadı. Randevunuz güncel zamanında aktiftir: {date} - {time}. Açıklama: {notes}'
    }
  ],
  reschedule_request_created: [
    {
      type: 'reschedule_request_created',
      language: 'tr',
      subject: 'Erteleme Talebi Alındı 📅',
      body: 'Merhaba {customerName}, {businessName} randevunuzu {newDate} - {newTime} tarihine erteleme talebiniz alınmıştır. Salon onayı sonrası bilgilendirileceksiniz.'
    }
  ],
  reschedule_request_approved: [
    {
      type: 'reschedule_request_approved',
      language: 'tr',
      subject: 'Erteleme Talebiniz Onaylandı! 🎉',
      body: 'Merhaba {customerName}, {businessName} randevunuz başarıyla ertelenmiştir. Yeni Randevu Zamanı: {date} saat {time}. Görüşmek üzere!'
    }
  ],
  reschedule_request_rejected: [
    {
      type: 'reschedule_request_rejected',
      language: 'tr',
      subject: 'Erteleme Talebiniz Reddedildi ⚠️',
      body: 'Merhaba {customerName}, {businessName} randevu erteleme talebiniz yer durumuna bağlı olarak onaylanamadı. Randevunuz orijinal tarihinde aktif kalmıştır: {date} {time}. Açıklama: {notes}'
    }
  ],
  appointment_confirmed_by_customer: [
    {
      type: 'appointment_confirmed_by_customer',
      language: 'tr',
      subject: 'Randevu Onay Bildirimi 👍',
      body: 'Merhaba {customerName}, {businessName} randevunuzu onayladığınız için teşekkür ederiz! {date} günü saat {time} görüşmek üzere.'
    }
  ]
};

export const messageTemplateService = {
  getTemplate(type: CommunicationEventType, audience: 'business_owner' | 'customer' | 'super_admin', language: 'tr' | 'en' = 'tr'): TemplateDefinition {
    // Determine the map key (some events have sender/recipient variance like booking_created)
    let searchKey = type as string;
    if (type === 'booking_created') {
      searchKey = audience === 'customer' ? 'booking_created_customer' : 'booking_created_owner';
    }

    const tBatch = TEMPLATES[searchKey] || TEMPLATES[type];
    if (!tBatch) {
      return {
        type,
        language,
        subject: 'Sistem Bildirimi',
        body: `Event: ${type}`
      };
    }

    const match = tBatch.find(t => t.language === language) || tBatch[0];
    return match;
  },

  renderTemplate(
    type: CommunicationEventType,
    audience: 'business_owner' | 'customer' | 'super_admin',
    context: Record<string, string | number>,
    language: 'tr' | 'en' = 'tr'
  ): { subject?: string; body: string } {
    const template = this.getTemplate(type, audience, language);
    let subject = template.subject ? template.subject : '';
    let body = template.body;

    // Token replacement
    Object.entries(context).forEach(([key, val]) => {
      const token = `{${key}}`;
      const strVal = String(val);
      subject = subject.replace(new RegExp(token, 'g'), strVal);
      body = body.replace(new RegExp(token, 'g'), strVal);
    });

    return { subject, body };
  }
};
