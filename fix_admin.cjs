const fs = require('fs');
let c = fs.readFileSync('pages/AdminPage.tsx', 'utf8');

c = c.replace(/language === 'tr' \? 'Bu hizmeti silmek istediğinize emin misiniz\?' : 'Are you sure you want to delete this service\?'/g, "t.admin.confirm_delete_service || 'Are you sure you want to delete this service?'");
c = c.replace(/language === 'tr' \? 'Bu çalışanı silemezsiniz\.' : 'You cannot delete the master owner\.'/g, "t.admin.cannot_delete_owner || 'You cannot delete the master owner.'");
c = c.replace(/language === 'tr' \? 'Bu çalışanı silmek istediğinize emin misiniz\?' : 'Are you sure you want to delete this staff member\?'/g, "t.admin.confirm_delete_staff || 'Are you sure you want to delete this staff member?'");

c = c.replace(/\{language === 'tr' \? 'Uzman Yönetimi' : t\.admin\.tab_staff\}/g, "{t.admin.tab_staff}");
c = c.replace(/\{language === 'tr' \? 'Hizmetler' : 'Services'\}/g, "{t.admin.tab_services}");
c = c.replace(/\{language === 'tr' \? 'Raporlar' : 'Reports'\}/g, "{t.admin.tab_reports}");
c = c.replace(/\{language === 'tr' \? 'Ayarlar' : 'Settings'\}/g, "{t.admin.tab_setup}");

c = c.replace(/\{editingStaffId \? \(language === 'tr' \? 'Çalışanı Düzenle' : 'Edit Staff'\) : \(language === 'tr' \? 'Yeni Uzman Ekle' : 'Add New Staff \/ Specialist'\)\}/g, "{editingStaffId ? t.admin.edit_staff : t.admin.add_staff}");

c = c.replace(/\{language === 'tr' \? 'Aktif \(Randevuya Açık\)' : 'Active \(Available for booking\)'\}/g, "{t.admin.active_booking}");
c = c.replace(/\{editingStaffId \? \(language === 'tr' \? 'Güncelle' : 'Update'\) : \(language === 'tr' \? 'Ekle' : 'Add Staff'\)\}/g, "{editingStaffId ? t.admin.update : t.admin.add_staff_btn}");
c = c.replace(/\{language === 'tr' \? 'İptal' : 'Cancel'\}/g, "{t.admin.cancel}");
c = c.replace(/\{language === 'tr' \? 'İnaktif' : 'Inactive'\}/g, "{t.admin.inactive}");

c = c.replace(/title=\{language === 'tr' \? \(staff\.active \? 'Devre Dışı Bırak' : 'Aktif Et'\) : \(staff\.active \? 'Deactivate' : 'Activate'\)\}/g, "title={staff.active ? t.admin.make_inactive : t.admin.make_active}");

c = c.replace(/title=\{language === 'tr' \? 'Düzenle' : 'Edit'\}/g, "title={t.admin.edit}");
c = c.replace(/title=\{language === 'tr' \? 'Çalışanı Sil' : 'Delete Staff'\}/g, "title={t.admin.delete_staff}");

c = c.replace(/title=\{language === 'tr' \? \(service\.active \? 'Devre Dışı Bırak' : 'Aktif Et'\) : \(service\.active \? 'Deactivate' : 'Activate'\)\}/g, "title={service.active ? t.admin.make_inactive : t.admin.make_active}");
c = c.replace(/title=\{language === 'tr' \? 'Hizmeti Sil' : 'Delete Service'\}/g, "title={t.admin.delete_service || 'Delete Service'}");

c = c.replace(/\{language === 'tr' \? service\.name_tr \|\| service\.name : service\.name\}/g, "{language === 'tr' ? service.name_tr || service.name : service.name}");
c = c.replace(/\{language === 'tr' \? 'dk' : 'min'\}/g, "{language === 'tr' ? 'dk' : 'min'}");

fs.writeFileSync('pages/AdminPage.tsx', c);
