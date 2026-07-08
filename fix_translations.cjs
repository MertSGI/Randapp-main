const fs = require('fs');

let c = fs.readFileSync('utils/translations.ts', 'utf8');
c = c.replace(/    admin: \{\n      title: 'Dashboard',\n      subtitle: 'Manage appointments, staff and view schedule\.',[\s\S]*?ai_insights: 'Gemini Insights',\n    \},\n/, '');
c = c.replace(/    super_admin: \{\n      title: 'Super Admin',\n      overview: 'Overview',[\s\S]*?ai_settings: 'AI Settings'\n    \},\n/, '');

c = c.replace(/    admin: \{\n      panel_title: 'Salon Admin Paneli',\n      logout: 'Çıkış Yap',[\s\S]*?ai_insights: 'Gemini Analizleri',\n    \},\n/, `    admin: {
      panel_title: 'Salon Admin Paneli',
      logout: 'Çıkış Yap',
      title: 'Panel',
      subtitle: 'Randevuları, uzmanları yönetin ve programı görüntüleyin.',
      btn_analysis: 'Yapay Zeka Program Analizi',
      btn_analyzing: 'Analiz Ediliyor...',
      btn_logout: 'Çıkış Yap',
      tab_setup: 'Kurulum',
      tab_appointments: 'Randevular',
      tab_staff: 'Uzman Yönetimi',
      tab_services: 'Hizmetler',
      tab_reports: 'Raporlar',
      tab_subscription: 'Abonelik',
      tab_business: 'İşletme Profili',
      stats_total: 'Toplam Randevu',
      stats_confirmed: 'Bugün Onaylanan',
      stats_pending: 'Senkronizasyon Bekleyen',
      recent_title: 'Son Randevular',
      empty: 'Randevu bulunamadı.',
      cancel: 'İptal Et',
      synced: 'Senkronize',
      ai_insights: 'Gemini Analizleri',
      delete_staff: 'Çalışanı Sil',
      edit_service: 'Hizmeti Düzenle',
      add_service: 'Yeni Hizmet Ekle',
      service_name_en: 'İsim (İngilizce)',
      service_name_tr: 'İsim (Türkçe)',
      price: 'Fiyat (₺)',
      duration: 'Süre (dk)',
      image_url: 'Resim URL',
      active_booking: 'Aktif (Randevuya Açık)',
      update: 'Güncelle',
      add: 'Ekle',
      inactive: 'İnaktif',
      edit: 'Düzenle',
      delete: 'Sil',
      make_active: 'Aktif Yap',
      make_inactive: 'İnaktif Yap',
    },
`);

c = c.replace(/    super_admin: \{\n      title: 'Super Admin',\n      overview: 'Genel Bakış',[\s\S]*?ai_settings: 'Yapay Zeka Ayarları'\n    \},\n/, `    super_admin_nav: {
      title: 'Super Admin',
      overview: 'Genel Bakış',
      tenants: 'İşletmeler',
      subscriptions: 'Abonelikler',
      payments: 'Ödemeler',
      onboarding: 'Kurulum',
      reports: 'Raporlar',
      settings: 'Ayarlar',
      payment_test: 'Ödeme Testi',
      plans: 'Paketler ve Fiyatlar',
      ai_settings: 'Yapay Zeka Ayarları'
    },
`);

fs.writeFileSync('utils/translations.ts', c);
