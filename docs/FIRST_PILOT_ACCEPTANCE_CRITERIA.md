# LARİ İlk Pilot Kabul Kriterleri (First Pilot Acceptance Criteria)

Bu döküman, LARİ platformunun canlı sahaya çıkışı ve pilot salonlarda kullanılmaya başlanması için gereken minimum performans, kullanılabilirlik, hukuki ve teknik kabul kriterlerini tanımlar.

---

## 1. Önem Derecesi Sınıflandırması (Issue Severity Levels)

Hatalar ve eksiklikler, operasyonel etki derecelerine göre dört sınıfa ayrılır:

*   **Engelleyici (Blocker):** Pilot kullanımın durmasına neden olan, veri kaybı yaratan, multi-tenant izolasyon sınırlarını ihlal eden veya randevu akışını tamamen kilitleyen kritik sorunlar. (Derhal düzeltilmelidir, saha denemesi başlatılamaz).
*   **Majör Hata (Major Issue):** Temel bir özelliğin (iptal, erteleme, outbox loglama) çalışmaması ancak geçici bir manuel iş akışı veya workaround bulunması durumu.
*   **Minör Hata (Minor Issue):** Kullanıcı deneyimini olumsuz etkileyen ancak iş akışını bozmayan kozmetik ve arayüz hataları.
*   **İyileştirme (Improvement):** Gelecek fazlarda sisteme eklenmesi planlanan, kolaylık sağlayan yeni özellik önerileri veya performans optimizasyonları.

---

## 2. Kabul Kriterleri Matrisi (Acceptance Criteria Matrix)

Aşağıdaki tablo, sistemin her bir alt bileşeni için beklenen başarılı davranışı ve başarısızlık (kalma) durumunu tanımlar.

| Alt Sistem / Modül | Kabul Kriteri (Başarılı Durum) | Başarısızlık Senaryosu (Kalan Durum) | Önem Derecesi |
| :--- | :--- | :--- | :--- |
| **Sales Explanation (Satış Sunumu)** | Kurucunun sistemi 3 dakika içinde salon sahibine anlatabilmesi ve değer önerisini net aktarabilmesi. | Salon sahibinin sistemin ne işe yaradığını veya WhatsApp'tan farkını anlamaması. | Majör Hata |
| **Onboarding Speed (Kurulum Hızı)** | Form toplandıktan sonra salon sahibine ait tüm hizmet ve personel tanımlamalarının 15 dakikadan kısa sürmesi. | Kurulum sürecinin 30 dakikayı aşması, arayüzde donma/tıkanma olması. | Minör Hata |
| **Tenant Provisioning (Tenant Açma)** | `/super-admin/provisioning` üzerinden tenant ID girilince veri tabanının ve izole ortamın anında sorunsuz oluşması. | Tenant açılırken çakışma oluşması, hata vermesi veya veri tabanı hatası fırlatması. | **Engelleyici** |
| **Public Site Preview (Müşteri Sitesi)** | `randevulari.com/melis-guzellik` adresinin salonun logosu, hizmetleri ve personeliyle doğru ve kusursuz yüklenmesi. | Sitenin bozuk yüklenmesi, hizmetlerin listelenmemesi veya başka bir salonun verisini göstermesi. | **Engelleyici** |
| **Booking Flow (Randevu Akışı)** | Müşterinin 30 saniyede randevu oluşturabilmesi ve takvime gerçek zamanlı yansıması. | Saat seçilememesi, çakışan randevulara izin verilmesi veya randevunun kaybolması. | **Engelleyici** |
| **Owner Admin Usability (Yönetici Paneli)** | Salon sahibinin randevuları görebilmesi, durum değiştirebilmesi ve uzman çalışma saatlerini kolayca güncelleyebilmesi. | Takvim ekranının yüklenememesi, işlem yaparken sayfa beyaz ekran hatası (white screen) vermesi. | **Engelleyici** |
| **Customer Self-Service (Müşteri Linki)** | Müşterinin onay SMS'indeki bağlantıdan kendi randevusuna izole şekilde erişebilmesi. | Linke tıklayınca admin paneline sızılması veya sayfanın 404 vermesi. | **Engelleyici** |
| **Cancel & Reschedule Handling** | Müşterinin iptal/erteleme talebi oluşturması ve bu talebin salon sahibine anlık düşüp onaylanabilmesi. | Erteleme talebi onaylandığında takvimde eski saatin silinmemesi (çift rezervasyon). | Majör Hata |
| **Anti-Abuse / No-Show Handling** | Üst üste gelmeyen (no-show) müşterilerin kara listeye alınması ve sonraki randevularının kilitlenmesi. | Gelmeyen müşterinin engellenememesi veya yanlışlıkla dürüst müşterilerin bloklanması. | Majör Hata |
| **Outbox Visibility (İletişim Kaydı)** | Gönderilen bildirim şablonlarının, alıcı telefonun ve simülasyon durumunun outbox'ta net izlenebilmesi. | Outbox'ta kayıt görünmemesi, kime ne mesaj gittiğinin takip edilememesi. | Majör Hata |
| **Scheduler Simulation (Zamanlayıcı)** | Arka plan sweeps ve cron işlerinin yerelde tek tuşla simüle edilebilmesi, hata loglarının düzgün yazılması. | Scheduler'ın hata fırlatıp tüm admin oturumunu kilitlemesi. | Majör Hata |
| **Audit & Support Visibility (Gözlem)** | Tüm sistem aksiyonlarının KVKK redaction filtresinden geçip, arama panelinde korelasyon ID ile bulunabilmesi. | Loglarda açık şifre veya kart verisi kalması, aramanın çalışmaması. | **Engelleyici** |
| **Media Readiness (Medya Güvenliği)** | Salon logolarının yüklenmesi, SVG script enjeksiyonlarının engellenmesi ve base64 loglarının kısaltılması. | SVG ile XSS güvenlik açığı sızması veya devasa base64 verilerinin sistemi yavaşlatması. | **Engelleyici** |
| **Export / Migration Readiness** | Salon verilerinin anında şifreli JSON olarak dışa aktarılabilmesi ve dry-run göç testinin uyarı fırlatmaması. | Export dosyasının bozuk veya boş inmesi, dry-run testinin patlaması. | Majör Hata |
| **Pricing / Package Clarity** | 14 günlük deneme süresinin ve Professional/Premium paket sınırlarının arayüzde şeffaf gösterilmesi. | Arayüzde yanlışlıkla "7 günlük deneme" veya "Kredi kartı gerekmez" gibi çelişkili ifadelerin kalması. | Minör Hata |
| **Legal / KVKK Consent Awareness** | Müşterinin randevu alırken, salonun da kayıt olurken KVKK izin onay kutularını işaretlemek zorunda olması. | Onay kutusu olmadan veri kaydedilmesi (Hukuki risk). | **Engelleyici** |

---

## 3. Geçiş Sınırları ve Karar Eşikleri (Pass Thresholds)

SaaS projemizin pilot aşamasında ticari riskleri yönetmek için şu karar eşikleri uygulanır:

### A. İlk Manuel Unpaid (Ücretsiz) Pilot İçin Minimum Geçiş Eşiği
İlk tanıdık/referanslı salon testine çıkmak için gereken koşul:
*   Sıfır (0) **Engelleyici (Blocker)** hata bulunmalıdır.
*   En fazla 3 adet **Majör Hata** kabul edilebilir (bu hataların sahada kurucu tarafından manuel çözüleceği taahhüt edilmelidir).
*   En az **%85 oranında** kabul kriteri başarımı aranır.

### B. Ücretli Pilot (Paid Pilot) Engelleri
Müşteriden ücret talep edilebilmesi için şu maddelerin tamamı çözülmelidir:
*   Tüm **Engelleyici (Blocker)** ve **Majör Hata** seviyesindeki bulgular sıfırlanmalıdır.
*   Kullanıcı sözleşmeleri ve yerel KVKK rıza metinleri hukuki onay almış olmalıdır.
*   Banka Havalesi/EFT bildirim takibi sorunsuz çalışmalıdır.

### C. Genel Kamusal Yayına Çıkış (Public Go-Live) Şartları
Uygulamanın internet üzerinden herkese açık reklama çıkabilmesi için:
*   Tüm yerel simülasyonların yerini gerçek servis sağlayıcılar almalıdır:
    *   **Veritabanı:** Supabase staging / production canlı bağlantısı ve RLS politikalarının aktifleşmesi.
    *   **Ödeme:** Canlı iyzico API anahtarları ve webhook koruma entegrasyonu.
    *   **İletişim:** Netgsm veya Twilio SMS/WhatsApp canlı entegrasyonunun tamamlanması.
    *   **İzleme:** Canlı Sentry ve Datadog izleme bağlantısı.
*   Sistem QA denetimlerinden `%100 başarı` ile geçmelidir.

---

## 4. İlgili Belgeler
*   [Uçtan Uca Pilot Prova Kılavuzu](./FIRST_REAL_SALON_END_TO_END_REHEARSAL.md)
*   [Kurucu Saha Operasyon Kılavuzu](./FOUNDER_PILOT_REHEARSAL_CHECKLIST.md)
*   [Pilot Test Veri Seti Planı](./FIRST_PILOT_FIXTURE_DATA_PLAN.md)
