const fs = require('fs');

// Fix SuperAdminDashboard.tsx
let sd = fs.readFileSync('pages/SuperAdminDashboard.tsx', 'utf8');
sd = sd.replace(/window\.confirm\("Bu salonu yayına almak istiyor musunuz\? Müşteri randevu alabilecek\."\)/g, "window.confirm(t.super_admin?.approve_prompt || 'Approve this salon for live bookings?')");
sd = sd.replace(/alert\("Salon başarıyla yayına alındı\."\)/g, "alert(t.super_admin?.approve_success || 'Salon is live.')");
sd = sd.replace(/window\.prompt\("Eksiklikleri belirtmek için bir not girin \(opsiyonel\):"\)/g, "window.prompt(t.super_admin?.send_back_prompt || 'Enter note (optional):')");
sd = sd.replace(/alert\("Salon kuruluma geri gönderildi\."\)/g, "alert(t.super_admin?.send_back_success || 'Salon sent back.')");
sd = sd.replace(/window\.confirm\("Bu salonun randevu alımını durdurmak istiyor musunuz\?"\)/g, "window.confirm(t.super_admin?.pause_prompt || 'Pause bookings for this salon?')");
sd = sd.replace(/alert\("Aksiyon tamamlandı\."\)/g, "alert(t.super_admin?.pause_success || 'Action completed.')");
sd = sd.replace(/>Siteyi Önizle</g, ">{t.super_admin?.view_details || 'Preview Site'}<");
sd = sd.replace(/>Site Önizle</g, ">{t.super_admin?.view_details || 'Preview Site'}<");
sd = sd.replace(/>Approve Go-Live</g, ">{t.super_admin?.approve || 'Approve Go-Live'}<");
sd = sd.replace(/>Send Back</g, ">{t.super_admin?.send_back || 'Send Back'}<");
sd = sd.replace(/>İletişime Geç</g, ">{t.super_admin?.contact || 'Contact'}<");
sd = sd.replace(/>Kapat</g, ">{t.admin?.cancel || 'Close'}<");
fs.writeFileSync('pages/SuperAdminDashboard.tsx', sd);

// Fix SuperAdminTenantPreviewPage.tsx
let stp = fs.readFileSync('pages/super-admin/SuperAdminTenantPreviewPage.tsx', 'utf8');
stp = stp.replace(/Tenant ID eksik/g, 'Missing Tenant ID');
stp = stp.replace(/Yetkisiz erişim/g, 'Unauthorized Access');
stp = stp.replace(/Super Admin Önizleme Modu: Bu sayfa müşterilere açık değildir\./g, 'Super Admin Preview Mode: This page is not public.');
fs.writeFileSync('pages/super-admin/SuperAdminTenantPreviewPage.tsx', stp);

// Fix SitePreviewPage
let spp = fs.readFileSync('pages/admin/SitePreviewPage.tsx', 'utf8');
spp = spp.replace(/Yükleniyor\.\.\./g, "{language === 'tr' ? 'Yükleniyor...' : 'Loading...'}");
spp = spp.replace(/Yetkisiz erişim/g, "{language === 'tr' ? 'Yetkisiz erişim' : 'Unauthorized Access'}");
spp = spp.replace(/Önizleme Modu: Bu sayfa henüz müşterilere açık değildir\./g, "{language === 'tr' ? 'Önizleme Modu: Bu sayfa henüz müşterilere açık değildir.' : 'Preview Mode: This page is not yet public.'}");
fs.writeFileSync('pages/admin/SitePreviewPage.tsx', spp);

// Also verify AdminPage.tsx strings and SitePreviewPage
let ap = fs.readFileSync('pages/AdminPage.tsx', 'utf8');
ap = ap.replace(/Site Önizlemesini Aç/g, "{language === 'tr' ? 'Site Önizlemesini Aç' : 'Open Site Preview'}");
fs.writeFileSync('pages/AdminPage.tsx', ap);
