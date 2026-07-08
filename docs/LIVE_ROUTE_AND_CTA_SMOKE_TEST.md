# LARİ Live Route and CTA Smoke Test Audit

Bu döküman, LARİ platformundaki tüm kritik rotaların, ziyaretçi yetkilendirme sınırlarının, çağrı butonlarının (CTA) ve yönlendirmelerin mevcut durumunu ve canlıya geçiş hazırlık seviyesini detaylandırır.

---

## Rota ve CTA Envanteri ve Sağlık Durumu

Aşağıdaki tablo, platformun tüm ana rotalarını, hedef kitlesini, birincil aksiyon butonlarını, yönlendirme doğruluğunu ve pre-live aşamasındaki yetkilendirme (Auth) gereksinimlerini gösterir:

| Sayfa/Rota | Ziyaretçi Tipi | Birincil Butonlar / CTA’lar | Beklenen Hedef | Yetki (Auth) Gerekli mi? | Durum | Potansiyel Risk / Bulgu | Önem Derecesi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`/`** (Ana Sayfa) | Herkes | "Ücretsiz Deneyin", "Özellikleri Keşfet" | `/register`, `/features` | Hayır | **Hazır** | Bulgu yok. Görseller yerel placeholder formatındadır. | Yok |
| **`/features`** (Özellikler) | Herkes | "Hemen Kaydol", "Planları Gör" | `/register`, `/pricing` | Hayır | **Hazır** | Bulgu yok. | Yok |
| **`/mobile-app`** (Mobil Uygulama) | Herkes | "QR Kodu Tara", "İndir" | Simüle mobil indirme | Hayır | **Hazır** | Gerçek App Store/Google Play linkleri bağlı değildir. | Bilgi |
| **`/pricing`** (Fiyatlandırma) | Herkes | "Hemen Başla" (Salon Sahibi) | `/register?plan=...` | Hayır | **Hazır** | Çevrimiçi ödeme kapısı bağlı değil, sadece havale/offline. | Orta |
| **`/contact`** / `/support` | Herkes | "Destek Talebi Gönder" | Destek bileti oluşturma | Hayır | **Hazır** | Gerçek bir e-posta / Zendesk entegrasyonu yoktur. | Yok |
| **`/pilot`** (Pilot Portalı) | Herkes | "Müşteri Deneyimi", "Yönetici Paneli" | `/pilot/customer`, `/pilot/admin` | Hayır | **Hazır** | Giriş yapmadan pilot simülasyonu sunar. | Yok |
| **`/pilot/customer`** | Herkes | "Randevu Al" (Ziyaretçi) | `/book` (Pilot şubesi) | Hayır | **Hazır** | Herkes tarafından şifresiz test edilebilir. | Yok |
| **`/pilot/admin`** | Herkes | "Hizmetleri Yönet", "Ayarlar" | `/admin` (Sınırlı salt okunur) | Hayır | **Hazır** | Şifresiz salt okunur salon yöneticisi görünümü sunar. | Yok |
| **`/demo`** (İnteraktif Demo) | Herkes | "Hızlı Demo Başlat" | `/demo` içi simülatör | Hayır | **Hazır** | Gerçek bir veritabanı kiracısı oluşturmaz, yerel durumdadır. | Yok |
| **`/register`** (Yeni Kayıt) | Herkes | "Salonumu Kaydet" | `/admin` (Kayıt sonrası otomatik) | Hayır | **Hazır** | Hukuki metinlerin pre-live onay kutuları zorunludur. | Yok |
| **`/login`** (Üye Girişi) | Herkes | "Giriş Yap" | `/admin` veya `/super-admin` | Hayır | **Hazır** | Rol bazlı yönlendirme düzgündür. | Yok |
| **`/admin`** (Salon Paneli) | Salon Sahibi | "Randevu Ekle", "Profil Kaydet" | Panel içi sekmeler | **Evet** (tenant_owner / super_admin) | **Hazır** | Yetkisiz erişimde `/login` sayfasına yönlendirir. | Yok |
| **`/book`** (Genel Randevu) | Herkes | "Saat Seç", "Randevu Onayla" | Özet / Teşekkür sayfası | Hayır | **Hazır** | URL kiracı parametresi yoksa varsayılan test salonu yüklenir. | Bilgi |
| **`/:tenantSlug`** | Herkes | "Hizmet Seç", "Randevu Tamamla" | `/book` içi kiracı yükleme | Hayır | **Hazır** | Geçersiz slug girilirse 404 sayfasına yönlendirir. | Yok |
| **`/booking/:tenantSlug`** | Herkes | "Hizmet ve Personel Seç" | `/book` içi kiracı yükleme | Hayır | **Hazır** | Slug ile tam entegre çalışır. | Yok |
| **`/appointment/manage/:token`** | Herkes (Müşteri) | "Randevu İptal", "Tarih Değiştir" | Müşteri self-servis işlemi | Hayır (Güvenli token tabanlı) | **Hazır** | KVKK hak talebi panelinde destek bileti oluşturulur. | Yok |
| **`/super-admin/pilots`** | Süper Admin | "Pilot Durumu Güncelle" | Pilot izleme paneli | **Evet** (super_admin) | **Hazır** | Sadece süper admin rolüyle erişilebilir. | Yok |
| **`/super-admin/provisioning`** | Süper Admin | "Kiracı Oluştur & Aktif Et" | Manuel kurulum formu | **Evet** (super_admin) | **Hazır** | Çevrimdışı ödeme yapan salonları manuel aktif etmeye yarar. | Yok |
| **`/super-admin/scheduler`** | Süper Admin | "Şimdi Çalıştır" | Arka plan iş simülasyonu | **Evet** (super_admin) | **Hazır** | E-posta/SMS gönderimleri outbox kuyruğuna yazılır, iletilmez. | Bilgi |
| **`/super-admin/observability`** | Süper Admin | "Logları İncele", "Hata İzle" | Sistem denetim günlüğü | **Evet** (super_admin) | **Hazır** | Gerçek Datadog / Sentry entegrasyonu yoktur, yerel loglardır. | Bilgi |
| **`/super-admin/legal`** | Süper Admin | "Gözden Geçir & Taslak Yayınla" | Hukuki döküman yönetimi | **Evet** (super_admin) | **Hazır** | "Canlı kullanım öncesi profesyonel hukuk incelemesi gerekir." | Yok |

---

## Kritik Güvenlik ve Rota Bulguları

1. **Rota Sızması Kontrolü (Route Leakage)**:
   * `/admin` ve `/super-admin` altındaki tüm rotalar `ProtectedRoute` bileşeni ile sarmalanmıştır. Yetkisiz bir ziyaretçi bu rotalara doğrudan gitmeye çalıştığında, uygulama güvenli bir şekilde `/login` sayfasına yönlendirir.
   * `/pilot/admin` rotası ise bilinçli olarak tasarlanmış, veritabanına doğrudan yazma yetkisi olmayan **salt okunur bir pre-live simülasyonudur**. Gerçek salon yöneticisi paneli olan `/admin` rotasından tamamen yalıtılmıştır.

2. **Döngüsel Yönlendirmeler (CTA Loops)**:
   * "Kaydol" -> "Plan Seç" -> "Kaydol" gibi sonsuz döngüye yol açabilecek CTA zincirleri bulunmamaktadır.
   * Fiyatlandırma sayfasındaki plan butonları doğrudan `/register?plan=plan_id` şeklinde hedefe yönlenmekte ve kayıt formunda seçili planı otomatik olarak doldurmaktadır.

3. **Görsel/Bağlantı Uyumluluğu**:
   * Ziyaretçi arayüzünde kırık rota bağlantısı bulunmamaktadır. Tüm footer linkleri (`/privacy`, `/terms`, `/support`, `/contact`) aktif rotalara karşılık gelmektedir.
   * `randevulari.com` Türkiye pazarına yönelik alan adı stratejisi, pazarlama ve yasal metinlerdeki tüm açıklamalarda tutarlı bir şekilde korunmuştur.
