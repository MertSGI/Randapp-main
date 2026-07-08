# LARI - MANUAL BILLING LIVE SMOKE TEST RUNBOOK

Bu kılavuz, **ödemesiz kısıtlı canlı üretim** (`paymentless_limited_production`) modunda platformun ödemesiz ancak tamamen kalıcı veritabanıyla çalıştığını doğrulamak için manuel olarak gerçekleştirilecek uçtan uca duman testini (smoke test) tanımlar.

---

## ADIM ADIM DUMAN TESTİ PROSEDÜRÜ

### Adım 1: Süper Admin Paneli ile Manuel Kiracı Oluşturma (Create Tenant)
1.  Süper Admin hesabıyla sisteme giriş yapın.
2.  Süper Admin Yönetim Paneli'nde **"Yeni Kiracı Ekle"** butonuna tıklayın.
3.  Aşağıdaki alanları doldurun:
    *   **İşletme Adı:** `Vogue Erkek Kuaförü`
    *   **Slug:** `vogue`
    *   **Sahip E-posta:** `owner@vogue.com`
4.  **"Oluştur"** butonuna basarak veritabanına kaydolmasını sağlayın.

### Adım 2: Abonelik ve Profesyonel Plan Atama (Assign Plan & Status)
1.  Kiracının abonelik detaylarına gidin.
2.  **Plan:** `Professional` (Profesyonel Plan) seçin.
3.  **Ödeme Türü (billingSource):** `offline_payment` (Havale/Elden) olarak güncelleyin.
4.  **Abonelik Durumu (subscriptionStatus):** `manual_active` olarak set edin.
5.  **Son Ödeme Tarihi (paidThroughDate):** Bugünden itibaren 30 gün sonrası (`YYYY-MM-DD`).
6.  **Harici Referans No (externalPaymentReference):** Banka dekont numarası veya makbuz no girin (Örn: `EFT-99238491`).
7.  Değişiklikleri kaydedin.

### Adım 3: İşletme Profili, Hizmet Katoloğu ve Personel Kurulumu (Tenant Setup)
1.  `owner@vogue.com` hesabı ile salon yönetim panelinde oturum açın.
2.  **Çalışma Saatleri:** Pazartesi - Cumartesi `09:00 - 19:00` olacak şekilde ayarlayın.
3.  **Hizmet Kataloğu:** "Saç Kesimi & Yıkama" (Fiyat: `150 TL`, Süre: `30 dk`) hizmeti ekleyin.
4.  **Personel:** "Ahmet Yılmaz" isimli bir uzman ekleyin ve eklediğiniz hizmetle ilişkilendirin.

### Adım 4: Kamu Rezervasyon Sayfasını Yayınlama (Publish Booking Page)
1.  Salon Ayarları -> Görünüm kısmına gidin.
2.  Sitenin yayın durumunu **"Yayınlandı" (Published)** olarak güncelleyin.
3.  `https://vogue.randevulari.com` adresindeki rezervasyon sayfasının açıldığını doğrulayın.

### Adım 5: Müşteri Randevusu Oluşturma (Create Customer Booking)
1.  Ziyaretçi olarak `https://vogue.randevulari.com` adresine gidin.
2.  Hizmet olarak "Saç Kesimi & Yıkama", personel olarak "Ahmet Yılmaz" seçin.
3.  Müsait bir gün ve saat seçin.
4.  Müşteri iletişim bilgilerini girin: `Kemal Kaya`, `05551234567`.
5.  Randevuyu onaylayın. Randevunun başarılı bir şekilde oluşturulduğunu ve Supabase `appointments` tablosuna yazıldığını teyit edin.

### Adım 6: İptal/Değişiklik Yönetim Linki Oluşturma (Manage Link)
1.  Oluşturulan randevunun detaylarından müşteri için yönetim linkini alın: `/appointment/manage/[token]`.
2.  Bu linki yeni bir gizli sekmede açın.
3.  Randevu detaylarının doğru geldiğini, erteleme ve iptal butonlarının aktif olduğunu doğrulayın.

### Adım 7: Salon Sahibi Paneli Kontrolü (Verify Owner Dashboard)
1.  `owner@vogue.com` olarak yönetim paneline tekrar girin.
2.  Ana sayfada yeni oluşturulan randevunun göründüğünü kontrol edin.
3.  Müşteriler sekmesinde "Kemal Kaya" kaydının otomatik oluştuğunu doğrulayın.

### Adım 8: BillingTab Doğrulaması (Verify BillingTab)
1.  Ayarlar -> Faturalandırma (Billing) sekmesine gidin.
2.  Abonelik planının `Profesyonel`, durumun `Aktif (Manuel)`, ödeme yönteminin `Havale / Elden` olduğunu teyit edin.
3.  Hiçbir kredi kartı ekleme formu veya iyzico entegrasyon uyarısı olmadığını doğrulayın.

### Adım 9: Kiracıyı Askıya Alma ve Yeniden Aktifleştirme (Suspend & Reactivate)
1.  Süper Admin olarak sisteme girin.
2.  `vogue` kiracısının abonelik durumunu `suspended` yapın.
3.  `owner@vogue.com` olarak girildiğinde veya rezervasyon sayfasında "Abonelik Askıya Alındı" uyarısı çıktığını görün.
4.  Süper Admin olarak abonelik durumunu tekrar `manual_active` yapın ve sistemin anında eski haline döndüğünü doğrulayın.

### Adım 10: Veritabanı Yedeğini ve Durumunu Doğrulama (Verification)
1.  Süper Admin paneli Veri Yönetimi kısmından sistem anlık durum yedeğini (JSON) dışarı aktarın.
2.  İndirilen JSON içerisinde `vogue` kiracısının, `Kemal Kaya` müşterisinin ve oluşturulan randevunun eksiksiz bulunduğunu teyit edin.
3.  Tüm akış boyunca hiçbir adımda **kredi kartı girişi istenmediğini** veya **online ödemeye zorlanmadığını** garanti edin.
