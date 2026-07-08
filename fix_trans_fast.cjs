const fs = require('fs');
let content = fs.readFileSync('utils/translations.ts', 'utf8');

// The multi-edit above put customer_portal inside login: { for TR. Let's fix that.
// Let's just rewrite the entire file's login blocks cleanly.

content = content.replace(`    login: {
      customer_portal: {`, `    customer_portal: {`);
      
const fixTr = `    customer_portal: {
      title: 'Müşteri Paneli',
      login_title: 'Randevu Panelinize Giriş Yapın',
      login_subtitle: 'Randevularınızı görüntülemek için telefon veya e-posta girin.',
      phone_or_email: 'Telefon numarası veya E-posta',
      login_btn: 'Giriş Yap',
      appointments_title: 'Randevularım',
      my_appointments: 'Randevularım',
      my_profile: 'Profilim',
      upcoming: 'Yaklaşan',
      past: 'Geçmiş',
      status_confirmed: 'Onaylandı',
      status_cancelled: 'İptal Edildi',
      status_cancelled_by_customer: 'Sizin tarafınızdan iptal edildi',
      status_cancelled_by_salon: 'Salon tarafından iptal edildi',
      status_completed: 'Tamamlandı',
      status_no_show: 'Gelinmedi',
      no_upcoming: 'Yaklaşan randevunuz bulunmuyor.',
      no_past: 'Geçmiş randevunuz bulunmuyor.',
      cancel_appointment: 'Randevuyu İptal Et',
      cancel_reason: 'İptal nedeni (isteğe bağlı)',
      cancel_confirm_msg: 'Bu randevuyu iptal etmek istediğinize emin misiniz?',
      cancel_error_window: 'Bu randevu online iptal süresi dışında. Lütfen salonla iletişime geçin.',
      logout: 'Çıkış Yap',
      privacy_note: 'Bilgileriniz randevularınızı yönetmek için güvenle saklanmaktadır.',
      salon_notes: 'Salon Notları',
      error_not_found: 'Bu iletişim bilgisiyle müşteri bulunamadı.',
      portal_prompt: 'Randevularınızı görüntülemek ve iptal etmek için telefon veya e-posta bilginizle müşteri panelinize giriş yapabilirsiniz.'
    },
    login: {`;
content = content.replace( `    customer_portal: {
      title: 'Müşteri Paneli',
      login_title: 'Randevu Panelinize Giriş Yapın',
      login_subtitle: 'Randevularınızı görüntülemek için telefon veya e-posta girin.',
      phone_or_email: 'Telefon numarası veya E-posta',
      login_btn: 'Giriş Yap',
      appointments_title: 'Randevularım',
      my_appointments: 'Randevularım',
      my_profile: 'Profilim',
      upcoming: 'Yaklaşan',
      past: 'Geçmiş',
      status_confirmed: 'Onaylandı',
      status_cancelled: 'İptal Edildi',
      status_cancelled_by_customer: 'Sizin tarafınızdan iptal edildi',
      status_cancelled_by_salon: 'Salon tarafından iptal edildi',
      status_completed: 'Tamamlandı',
      status_no_show: 'Gelinmedi',
      no_upcoming: 'Yaklaşan randevunuz bulunmuyor.',
      no_past: 'Geçmiş randevunuz bulunmuyor.',
      cancel_appointment: 'Randevuyu İptal Et',
      cancel_reason: 'İptal nedeni (isteğe bağlı)',
      cancel_confirm_msg: 'Bu randevuyu iptal etmek istediğinize emin misiniz?',
      cancel_error_window: 'Bu randevu online iptal süresi dışında. Lütfen salonla iletişime geçin.',
      logout: 'Çıkış Yap',
      privacy_note: 'Bilgileriniz randevularınızı yönetmek için güvenle saklanmaktadır.',
      salon_notes: 'Salon Notları',
      error_not_found: 'Bu iletişim bilgisiyle müşteri bulunamadı.',
      portal_prompt: 'Randevularınızı görüntülemek ve iptal etmek için telefon veya e-posta bilginizle müşteri panelinize giriş yapabilirsiniz.'
    },
    title: 'Yönetici Girişi',`, fixTr + `\n      title: 'Yönetici Girişi',`);

// Now for English
const enChunk = `    customer_portal: {
      title: 'Customer Portal',
      login_title: 'Login to Your Appointment Panel',
      login_subtitle: 'Enter your phone or email to view your appointments.',
      phone_or_email: 'Phone number or Email',
      login_btn: 'Login',
      appointments_title: 'My Appointments',
      my_appointments: 'My Appointments',
      my_profile: 'My Profile',
      upcoming: 'Upcoming',
      past: 'Past',
      status_confirmed: 'Confirmed',
      status_cancelled: 'Cancelled',
      status_cancelled_by_customer: 'Cancelled by you',
      status_cancelled_by_salon: 'Cancelled by salon',
      status_completed: 'Completed',
      status_no_show: 'No Show',
      no_upcoming: 'You have no upcoming appointments.',
      no_past: 'You have no past appointments.',
      cancel_appointment: 'Cancel Appointment',
      cancel_reason: 'Reason for cancellation (optional)',
      cancel_confirm_msg: 'Are you sure you want to cancel this appointment?',
      cancel_error_window: 'This appointment is outside the online cancellation window. Please contact the salon.',
      logout: 'Logout',
      privacy_note: 'Your information is stored securely to manage your appointments.',
      salon_notes: 'Salon Notes',
      error_not_found: 'Customer not found with this contact info.',
      portal_prompt: 'You can access your customer portal with your phone or email to view or cancel your appointments.'
    },
    login: {`;

// Replace the FIRST occurance of "login: {" using regex
content = content.replace(/    login: \{/, enChunk);

fs.writeFileSync('utils/translations.ts', content);
