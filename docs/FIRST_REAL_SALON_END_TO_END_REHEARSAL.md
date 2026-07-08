# LARİ Güzellik Salonu Uçtan Uca Pilot Provaya Kılavuzu (First Real Salon End-to-End Rehearsal)

Bu kılavuz, LARİ platformunun ilk gerçek saha pilotu öncesinde, kurucu ekibin kendi bünyesinde gerçekleştireceği uçtan uca simülasyon ve prova planını tanımlar. Hiçbir harici canlı API veya servis (iyzico, Netgsm, Supabase, Twilio vb.) çağrılmadan, tüm adımların yerel pre-live simülasyon ortamında doğrulanması hedeflenir.

---

## 1. Gerçekçi Pilot Salon Senaryosu (Pilot Salon Blueprint)

Provanın gerçekçi ve tutarlı olması için aşağıdaki kurgusal ama birebir saha verilerine dayanan salon profili ve senaryosu kullanılacaktır.

### A. İşletme Kimliği & Markalama
*   **Salon Adı:** Melis Güzellik & Nail Art
*   **Kurucu/Sahibi Persona:** Melis Yılmaz (Yoğun, pratik, randevuları şu an WhatsApp ve defterle yönetiyor, dijitalleşmeye istekli).
*   **Tek Şube:** Caddebostan Şubesi (Bağdat Caddesi No: 124, Kadıköy, İstanbul).
*   **Tercih Edilen İnternet Adresi (Slug):** `randevulari.com/melis-guzellik`
*   **Görseller:** 
    *   Logo: `melis_logo_placeholder.png`
    *   Kapak Fotoğrafı: `melis_cover_placeholder.jpg`
    *   Galeri: 4 adet tırnak tasarımı ve salon içi dekorasyon görseli.

### B. Hizmet Envanteri (6 Hizmet)
1.  **Protez Tırnak (Gel Extension):** 90 dk — 1200 ₺
2.  **Kalıcı Oje (Gel Polish):** 45 dk — 500 ₺
3.  **Manikür (Manicure):** 30 dk — 350 ₺
4.  **Klasik Cilt Bakımı (Classic Skincare):** 60 dk — 900 ₺
5.  **Hydrafacial:** 45 dk — 1500 ₺
6.  **Kaş Tasarım (Brow Design):** 30 dk — 400 ₺

### C. Uzman Kadro (2 Personel)
*   **Selin Can (Nail Expert):** Uzmanlık alanları: Protez Tırnak, Kalıcı Oje, Manikür. Haftalık izin günü: Pazartesi.
*   **Elif Aksoy (Skincare Expert):** Uzmanlık alanları: Klasik Cilt Bakımı, Hydrafacial, Kaş Tasarım. Haftalık izin günü: Salı.

### D. Çalışma Saatleri & Rezervasyon Kuralları
*   **Çalışma Günleri ve Saatleri:** Pazartesi - Cumartesi: 09:00 - 20:00. Pazar: Kapalı.
*   **Zaman Aralığı (Slot Interval):** 30 dakika.
*   **Rezervasyon Politikası:** Son 24 saate kadar ücretsiz iptal/erteleme imkanı.
*   **Kampanya Tercihi:** Davet edilen her yeni müşteri için hem davet edene hem gelene %10 (50 ₺) indirim hakkı.

### E. Ticari ve Altyapı Yapılandırması
*   **Paket Seviyesi:** Profesyonel Plan (Trial aşamasında, 14 gün ücretsiz).
*   **Faturalandırma Durumu:** Manuel / Offline Havale Yöntemi seçili (Banka Havalesi/EFT).
*   **Mevcut Aşama:** `Trial` (Local simulation).

---

## 2. Uçtan Uca Prova Adımları (E2E Rehearsal Steps)

Aşağıdaki 19 adım, kurucunun pilot sahaya inmeden önce sistemi test ederken izleyeceği tam kronolojik sıradır.

```
[1. Hazırlık] ──> [4. Manuel Kurulum] ──> [8. Rezervasyon Provası] ──> [12. Self-Servis İptal] ──> [15. Zamanlayıcı] ──> [17. Audit/Destek]
```

### ADIM 1: Kurucu Pitch Hazırlığı ve Vizyon Açıklaması
*   **Aksiyon:** Kurucu, Melis Hanım'a sistemi tanıtırken kullanacağı argümanları prova eder.
*   **Örnek Konuşma:** *"Melis Hanım, müşterileriniz Instagram profilinizdeki linke tıklayacak, hangi uzmanı ve hangi saati istediklerini seçip 30 saniyede randevularını alacaklar. Size WhatsApp'tan yazıp saatlerce uyuşmaya çalışmak zorunda kalmayacaklar. Hem sizin defter karmaşanız bitecek hem de müşteriniz anında onay alacak."*

### ADIM 2: Salon Kalifikasyon Kontrolü
*   **Aksiyon:** Salonun ilk pilot için uygunluğu test edilir (Tek şube, 1-3 personel, butik tırnak/cilt odaklı -> Kriterlere tam uyuyor).

### ADIM 3: Veri Giriş ve Katılım Formunun (Intake Form) Tamamlanması
*   **Aksiyon:** `PILOT_SALON_INTAKE_FORM.md` dosyasındaki alanlar Melis Güzellik bilgileriyle (hizmetler, personel, saatler) kurgusal olarak doldurulur ve kontrol edilir.

### ADIM 4: Manuel Tenant Tanımlama ve Aktivasyon (Provisioning)
*   **Aksiyon:** Süper Admin paneline (`/super-admin/provisioning`) girilir.
    *   **Tenant ID:** `melis-guzellik`
    *   **İşletme Adı:** Melis Güzellik & Nail Art
    *   **E-posta:** `melis@randevulari.com` (Sistem içi kurgusal)
    *   **Plan:** Profesyonel (Trial)
    *   **Ödeme Metodu:** Havale/EFT - Pilot Kampanyası
*   **Doğrulama:** Kayıt tamamlandığında `melis-guzellik` için veri tabanı şeması ve izolasyon ortamı başarıyla oluşturulur.

### ADIM 5: Yönetici Profil Yapılandırması (Business Profile)
*   **Aksiyon:** `/admin` salon sahibi paneline giriş yapılır (Simülasyon şifresi ile). İşletme profil bilgileri, şube adresi (Caddebostan), Instagram linki güncellenir.

### ADIM 6: Hizmet, Personel ve Çalışma Saatleri Tanımlamaları
*   **Aksiyon:** 
    *   6 Hizmet tek tek süreleri ve fiyatlarıyla girilir.
    *   Selin Can ve Elif Aksoy personeli oluşturularak uzmanlıkları ve izin günleri bağlanır.
    *   Haftalık çalışma saatleri şablonu (09:00 - 20:00) sisteme tanımlanır.

### ADIM 7: Görsel ve Medya Assetlerinin Yüklenmesi
*   **Aksiyon:** Salon logosu ve kapak fotoğrafı placeholder olarak yüklenir. 
*   **Güvenlik Filtresi:** Audit günlüğünde base64 görselin `[REDACTED_BASE64_IMAGE_DATA]` olarak kesildiğini ve SQL veritabanını şişirmesinin engellendiğini gözlemleyin.

### ADIM 8: Kamu Ön İzleme ve Müşteri Rezervasyon Provası
*   **Aksiyon:** `/pilot/customer` rotası açılır (Müşteri Derya Demir gözünden).
    *   Müşteri adı: **Derya Demir**
    *   Telefon: **0532 999 88 77** (Kurgusal)
    *   Hizmet: **Kalıcı Oje (Gel Polish)**
    *   Uzman: **Selin Can**
    *   Zaman: Yarın saat **14:00**.
    *   **Korelasyon ID:** `corr_appt_f5a89b02` otomatik olarak bu işlem akışına iliştirilir.
*   **Doğrulama:** Randevu oluşturma butonu tetiklenir, onay ekranı başarıyla gelir.

### ADIM 9: Randevu ve İletişim Outbox Kontrolü
*   **Aksiyon:** Süper Admin İletişim Outbox paneline gidilir.
*   **Doğrulama:** Derya Demir'e ve Melis Hanım'a gidecek SMS/WhatsApp bildirim şablonlarının outbox'a düştüğü, durumunun `local_outbox_only` sebebiyle **"Simüle Gönderildi (Dry Run)"** olarak işaretlendiği doğrulanır. Hiçbir gerçek SMS gitmemiştir.

### ADIM 10: Müşteri Self-Servis Yönetim Sayfası Erişimi
*   **Aksiyon:** Outbox'ta oluşan randevu onay SMS'indeki `randevulari.com/appointment/manage/apt_tok_derya123` linki simüle edilerek tarayıcıda açılır.
*   **Doğrulama:** Müşteri paneli tamamen izole açılır, Melis Güzellik logosunu, randevu saatini gösterir. Salon içi CRM notları veya diğer müşterilerin verileri asla sızmaz.

### ADIM 11: Randevu Erteleme (Reschedule) Talebi Provası
*   **Aksiyon:** Müşteri self-servis panelinden randevuyu yarın saat 16:00'ya erteleme talebi oluşturulur. `corr_appt_f5a89b02` korelasyon ID'si bu işlemde de korunur.

### ADIM 12: Erteleme Talebinin Yönetici Tarafından İncelenmesi ve Onayı
*   **Aksiyon:** Salon Sahibi Paneline (`/admin/site-preview` veya ilgili onay paneli) geri dönülür. Bekleyen erteleme talebi görülür. Melis Hanım gözüyle "Onayla" tıklanır.
*   **Doğrulama:** Randevu saati sistemde 16:00 olarak güncellenir. İletişim outbox'ında yeni güncellenmiş SMS şablonu oluşturulur.

### ADIM 13: Müşteri Rezervasyon İptal (Cancel) Talebi Provası
*   **Aksiyon:** Derya Demir acil işi çıktığı gerekçesiyle self-servis panelinden "İptal Etmek İstiyorum" butonuna basar.
*   **Doğrulama:** Talep, Salon Sahibi Bildirim Paneline düşer. Yönetici Melis Hanım iptal talebini onaylar. Randevu durumu `cancelled` olur.

### ADIM 14: Randevuya Gelmeme (No-Show) ve Anti-Abuse Spam Engelleme Simülasyonu
*   **Aksiyon:** Başka bir kurgusal müşteri olan **Gizem Kaya** (0543 111 22 33) için randevu açılır. Gizem Kaya randevuya gelmez. Salon sahibi panelden Gizem için "GELMEDİ (No-Show)" olarak işaretleme yapar.
*   **Doğrulama:** Müşteri profiline 1 adet "No-Show Skoru" eklenir. Gizem Kaya aynı telefonla tekrar randevu almaya çalıştığında, anti-abuse koruma motoru (`bookingAbuseProtectionService`) no-show riski uyarısı vererek randevuyu kilitler. Sistem otomatik olarak Süper Admin destek paneline `abuse_spam` kategorisinde bir bilet açar.

### ADIM 15: Zamanlayıcı ve Arka Plan İşleri (Scheduler) Provası
*   **Aksiyon:** Süper Admin Scheduler paneline (`/super-admin/scheduler`) girilir.
    *   `subscription_past_due_sweep` (Süresi geçen ödemelerin taranması)
    *   `communication_outbox_retry_sweep` (Başarısız SMS'lerin tekrar denenmesi)
    *   `subscription_trial_expiration_sweep` (Trial süresi bitenlerin taranması)
*   **Aksiyon:** İşler "Şimdi Çalıştır" denilerek yerelde tetiklenir.
*   **Doğrulama:** İşlerin başarıyla sonlandığı ve geçmişe başarıyla yeşil log bıraktığı doğrulanır.

### ADIM 16: Gözlemlenebilirlik (Observability) ve Korelasyon ID Takibi
*   **Aksiyon:** Süper Admin Gözlemlenebilirlik sayfasına (`/super-admin/observability`) girilir.
*   **Arama:** Arama çubuğuna `corr_appt_f5a89b02` yazılır.
*   **Doğrulama:** Sistem, Derya Demir'in ilk randevu açışından, outbox onay kaydına, erteleme talebine ve en son iptal işlemine kadar olan tüm kronolojik akışı tek bir arama altında kusursuz listeler. Paylaşılan hassas PII bilgileri KVKK gereği otomatik olarak maskelenmiştir.

### ADIM 17: Veri Dışa Aktarma (GDPR / KVKK Data Export) Provası
*   **Aksiyon:** `/admin` panelinden Melis Güzellik için "Müşteri Bilgileri ve Ayarlarımı Dışarı Aktar" butonuna basılır.
*   **Doğrulama:** Şifreli ve temiz bir yedekleme JSON dosyası iner. Güvenlik audit kayıtlarına `data_export_created` olayı info seviyesinde düşer.

### ADIM 18: Geri Bildirim Skor Kartının (Feedback Scorecard) Doldurulması
*   **Aksiyon:** Kurucu, demo sonrasında `FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md` belgesindeki kriterleri Melis Güzellik'in verdiği reaksiyonlara göre 1 ile 10 arasında puanlar.

### ADIM 19: Git/Gitme (Go/No-Go) Kararı
*   **Aksiyon:** Tüm simülasyon ve puanlar doğrultusunda, ilk pilot salona "Canlı Hizmet Verilmeye Hazırdır" veya "Geliştirilmesi gereken kritik bir engel (Blocker) vardır" kararı Super Admin tarafından nihai olarak verilir.

---

## 3. Prova Sonrası Kurucu Değerlendirme Özeti

Bu uçtan uca simülasyon, LARİ'nin tüm alt modüllerinin birbiriyle uyum içinde, sıfır ağ gecikmesiyle ve en yüksek güvenlik standartlarında (redacted PII, local sandbox) çalıştığını kurucuya kanıtlamaktadır. Gerçek bir salona kurulum yapmadan önce bu adımların yerelde bir kez koşulması zorunludur.

---

## 4. İlgili Belgeler
*   [İlk Pilot Kabul Kriterleri](./FIRST_PILOT_ACCEPTANCE_CRITERIA.md)
*   [Kurucu Saha Operasyon Kılavuzu](./FOUNDER_PILOT_REHEARSAL_CHECKLIST.md)
*   [Pilot Test Veri Seti Planı](./FIRST_PILOT_FIXTURE_DATA_PLAN.md)
*   [Zamanlayıcı ve Arka Plan Operasyonları](./BACKGROUND_JOBS_AND_SCHEDULER_OPERATIONS.md)
*   [Gözlemlenebilirlik ve Destek Operasyonları](./OBSERVABILITY_AUDIT_AND_SUPPORT_OPERATIONS.md)
