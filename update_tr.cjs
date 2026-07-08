const fs = require('fs');

let t = fs.readFileSync('utils/translations.ts', 'utf8');

const enAdminAdd = `
      // Additional Customers translations
      tab_customers: 'Customers',
      customers_title: 'Customers',
      customers_subtitle: 'View and manage customer profiles.',
      customer_profile: 'Customer Profile',
      view_profile: 'View Customer Profile',
      no_customer_history: 'No customer history yet.',
      no_notes_yet: 'No notes yet.',
      first_visit: 'First Visit',
      last_visit: 'Last Visit',
      total_appointments: 'Total Appointments',
      preferred_staff: 'Preferred Staff',
      last_service: 'Last Service',
      appointment_history: 'Appointment History',
      salon_notes: 'Salon Notes',
      internal_notes: 'Internal Notes',
      add_note: 'Add Note',
      edit_note: 'Edit Note',
      delete_note: 'Delete Note',
      style_preferences: 'Style Preferences',
      hair_style_pref: 'Hair/style preference',
      color_formula_pref: 'Color/formula preference',
      avoid_dislike_notes: 'Avoid/dislike notes',
      special_care_notes: 'Special care notes',
      reference_photos: 'Reference Photos',
      reference_photos_notice: 'These images are stored only for salon service history and style reference.',`;

const trAdminAdd = `
      // Additional Customers translations
      tab_customers: 'Müşteriler',
      customers_title: 'Müşteriler',
      customers_subtitle: 'Müşteri profillerini görün ve yönetin.',
      customer_profile: 'Müşteri Profili',
      view_profile: 'Müşteri Profilini Görüntüle',
      no_customer_history: 'Henüz müşteri geçmişi yok.',
      no_notes_yet: 'Henüz not yok.',
      first_visit: 'İlk Ziyaret',
      last_visit: 'Son Ziyaret',
      total_appointments: 'Toplam Randevu',
      preferred_staff: 'Tercih Edilen Uzman',
      last_service: 'Son Hizmet',
      appointment_history: 'Randevu Geçmişi',
      salon_notes: 'Salon Notları',
      internal_notes: 'İç Notlar',
      add_note: 'Not Ekle',
      edit_note: 'Notu Düzenle',
      delete_note: 'Notu Sil',
      style_preferences: 'Stil Tercihleri',
      hair_style_pref: 'Saç/stil tercihi',
      color_formula_pref: 'Boya/formül tercihi',
      avoid_dislike_notes: 'Kaçınılacak/istenmeyen notlar',
      special_care_notes: 'Özel bakım mock notları',
      reference_photos: 'Referans Fotoğraflar',
      reference_photos_notice: 'Bu görseller yalnızca salon içi hizmet geçmişi ve stil referansı amacıyla saklanır.',`;

t = t.replace(/(admin:\s*\{[^]*?delete_service: 'Delete Service',)/, "$1" + enAdminAdd);
t = t.replace(/(admin:\s*\{[^]*?delete_service: 'Hizmeti Sil',)/, "$1" + trAdminAdd);

fs.writeFileSync('utils/translations.ts', t);
console.log('done');
