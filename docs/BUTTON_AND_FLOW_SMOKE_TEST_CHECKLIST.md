# LARİ Button and Flow Smoke Test Checklist

Bu döküman, LARİ platformundaki temel kullanıcı akışlarının (onboarding, rezervasyon, yönetim, arka plan işleri, hukuki onaylar vb.) buton bazında nasıl test edileceğini ve beklenen sistem davranışlarını içeren pre-live denetim listesidir.

---

## 1. Ziyaretçi ve Pazarlama Akışları (Visitor & Marketing Flows)

### [ ] Ana Sayfa (Homepage) CTA Testi
*   **İşlem:** Ana sayfadaki **"Ücretsiz Deneyin"** butonuna tıklanması.
*   **Beklenen Sonuç:** Kullanıcının `/register` (Salon Kayıt) sayfasına sorunsuz yönlendirilmesi.
*   **Doğrulama:** Rota çubuğunda `/register` görülmeli, sayfa başlığı yüklenmeli.

### [ ] Fiyatlandırma Planı (Pricing) CTA Testi
*   **İşlem:** Fiyatlandırma sayfasındaki **"Hemen Başla"** butonuna tıklanması.
*   **Beklenen Sonuç:** Kayıt sayfasına (`/register`) yönlendirme ve URL parametresinde seçilen planın (örn: `?plan=premium`) yer alması.
*   **Doğrulama:** Kayıt formunda ilgili paketin varsayılan seçili gelmesi.

### [ ] İnteraktif Demo Akışı
*   **İşlem:** `/demo` sayfasında **"Hızlı Demo Başlat"** butonuna tıklanması.
*   **Beklenen Sonuç:** Simüle edilmiş salon arayüzünün yüklenmesi.
*   **Doğrulama:** Gerçek bir veritabanı kaydı oluşturulmadan, yerel bellek (state) üzerinden randevu alma simülasyonunun başarıyla tamamlanması.

### [ ] Pilot Giriş Akışı
*   **İşlem:** `/pilot` sayfasında **"Yönetici Paneli Deneyimi"** veya **"Müşteri Rezervasyon Deneyimi"** butonuna tıklanması.
*   **Beklenen Sonuç:** İlgili `/pilot/admin` veya `/pilot/customer` rotalarının açılması.
*   **Doğrulama:** Şifre sormadan salt okunur test verilerinin gösterilmesi.

---

## 2. Salon Sahibi Kayıt ve Yönetim Akışları (Salon Owner Flows)

### [ ] Yeni Salon Kayıt (Register) Flow
*   **İşlem:** Kayıt formundaki gerekli alanların doldurulması, **Hizmet Sözleşmesi** ve **Gizlilik Politikası** onay kutularının işaretlenmesi ve **"Salonumu Kaydet"** butonuna tıklanması.
*   **Beklenen Sonuç:** Yeni tenant (salon) nesnesinin yerel veritabanında oluşturulması ve `/admin` paneline yönlendirme.
*   **Doğrulama:**
    *   Hukuki metin kutuları işaretlenmeden butonun aktif olmaması veya hata vermesi.
    *   Kayıt tamamlandığında yeni tenant için Değiştirilemez Rıza Defteri'ne (Consent Ledger) "terms_of_service" ve "privacy_policy" kabul logunun başarıyla düşmesi.

### [ ] Salon Sahibi Giriş (Login) Flow
*   **İşlem:** E-posta ve şifrenin girilerek **"Giriş Yap"** butonuna tıklanması.
*   **Beklenen Sonuç:** Kimlik doğrulama işleminin tamamlanması ve `/admin` paneline erişim sağlanması.
*   **Doğrulama:** Sayfada salon sahibine özel yönetim sekmelerinin (Randevular, Hizmetler, Çalışanlar, Çalışma Saatleri, Medya, Faturalandırma) görüntülenmesi.

### [ ] Salon Profili Güncelleme
*   **İşlem:** Profil sekmesinde değişiklik yapılıp **"Değişiklikleri Kaydet"** butonuna tıklanması.
*   **Beklenen Sonuç:** Salon bilgilerinin (telefon, adres, şube vb.) güncellenmesi.
*   **Doğrulama:** Sayfa yenilendiğinde güncellenmiş bilgilerin kalıcı olarak listelenmesi.

### [ ] Yeni Hizmet (Service) ve Personel (Staff) Oluşturma
*   **İşlem:** Hizmetler ve Çalışanlar sekmelerinde sırasıyla **"Yeni Hizmet Ekle"** ve **"Yeni Çalışan Ekle"** butonlarına basılarak formların doldurulması ve kaydedilmesi.
*   **Beklenen Sonuç:** Yeni hizmetlerin ve çalışanların listeye eklenmesi.
*   **Doğrulama:** Eklenen verilerin müşteri rezervasyon sayfasındaki seçenekler arasında dinamik olarak belirmesi.

---

## 3. Müşteri Rezervasyon ve Self-Servis Akışları (Customer Booking Flows)

### [ ] Kamu Randevu Sayfası (Public Booking Flow)
*   **İşlem:** Salonun kamuya açık rezervasyon sayfasında (`/booking/salon-slug`) hizmet, çalışan, tarih ve saat seçildikten sonra müşteri bilgilerinin girilmesi ve **"Randevuyu Tamamla"** butonuna basılması.
*   **Beklenen Sonuç:** Rezervasyonun başarıyla kaydedilmesi ve teşekkür/onay ekranının gelmesi.
*   **Doğrulama:**
    *   KVKK Aydınlatma Metni onay kutusunun zorunlu tutulması.
    *   İsteğe bağlı Pazarlama/İletişim İzni onay kutusunun seçilmesi durumunda, rıza loglarının Değiştirilemez Rıza Defteri'ne (Consent Ledger) yazılması.
    *   Randevu oluşturulduğunda e-posta/SMS bildiriminin arka plan "Outbox" tablosuna kaydedilmesi.

### [ ] Randevu Yönetim Portalı (Self-Service)
*   **İşlem:** Müşterinin e-posta/SMS ile aldığı özel yönetim linkine (`/appointment/manage/:token`) tıklaması.
*   **Beklenen Sonuç:** Randevu bilgilerinin, İptal Talebi ve Tarih Değişikliği seçenekleriyle birlikte listelenmesi.
*   **Doğrulama:**
    *   **"Randevuyu İptal Et"** butonuna tıklandığında iptal talebinin salon sahibine destek bileti/talep olarak düşmesi.
    *   **"Kişisel Verilerimin Silinmesini İstiyorum (KVKK Başvurusu)"** butonuna basıp form doldurulduğunda, Super Admin panelindeki "KVKK Başvuruları" kısmına yeni bir hak talebi kaydının eklenmesi.

---

## 4. Süper Admin ve Sistem Denetim Akışları (Super Admin Flows)

### [ ] Manuel Kiracı Kurulumu (Manual Provisioning)
*   **İşlem:** Süper Admin panelinde `/super-admin/provisioning` sayfasına gidip, salon bilgilerini girip **"Salon Kurulumunu Tamamla"** butonuna basılması.
*   **Beklenen Sonuç:** Salonun tüm tabloları, varsayılan hizmetleri ve çalışma saatleri ile birlikte sıfırdan oluşturulması.
*   **Doğrulama:** Yeni salonun "Deneme/Pilot" veya "Offline Paid" statüsünde aktifleşmesi ve anında rezervasyon alabilir duruma gelmesi.

### [ ] Arka Plan İşleri Çalıştırıcısı (Scheduler Simulation)
*   **İşlem:** `/super-admin/scheduler` sayfasında **"Simüle Edilen Arka Plan İşlerini Şimdi Çalıştır"** butonuna basılması.
*   **Beklenen Sonuç:** Bekleyen bildirimlerin, hatırlatıcıların ve sistem temizlik görevlerinin işlenmesi.
*   **Doğrulama:** İletişim kuyruğundaki (Outbox) statülerin "Sent" durumuna geçmesi, log paneline başarı kayıtlarının düşmesi.

### [ ] Hukuk ve Taslak Metin Yönetimi (Super Admin Legal Panel)
*   **İşlem:** `/super-admin/legal` sayfasında taslak dökümanın yanındaki **"İncele ve Yayına Al"** butonuna basılması.
*   **Beklenen Sonuç:** Gözden geçirme notlarının girilebileceği pre-live onay penceresinin açılması ve dökümanın sürümünün aktif edilmesi.
*   **Doğrulama:**
    *   Canlı hukuk uyumluluk garantisi verilmediğine dair kırmızı pre-live uyarı yazısının görülmesi.
    *   İşlem tamamlandığında döküman durumunun `active` durumuna geçmesi ve rıza loglarında bu yeni sürümün referans alınması.

### [ ] Sistem Gözlemlenebilirlik ve Log Denetimi (Observability Panel)
*   **İşlem:** `/super-admin/observability` sayfasında filtrelerin uygulanması ve logların incelenmesi.
*   **Beklenen Sonuç:** Sistem genelinde oluşan tüm kritik olayların, hata kayıtlarının, API simülasyonlarının ve veri ihlali koruma tetiklemelerinin anlık izlenmesi.
*   **Doğrulama:** Güvenlik loglarında rıza defteri yazımlarının ve yetki sınırı denetimlerinin düzgün listelenmesi.
