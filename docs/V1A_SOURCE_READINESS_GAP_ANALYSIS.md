# LARİ V1-A Kaynak Hazırlığı ve Eksiklik Analizi Raporu
(V1-A Source Readiness Gap Analysis & Prioritized Zero-Cost Action Plan)

**Belge Kimliği:** `LARI-DOC-V1A-SOURCE-READINESS-GAP-ANALYSIS-20261111`  
**Referans Adım:** `ADIM-011` (`[LARI-PILOT5-001] V1-A Kaynak Hazırlığı ve Eksiklik Analizi`)  
**Temel Dal / Base SHA:** `a0e064dc778e5ab57c42a730687b79b273dc2939` (ADIM-010 Kabul Commit'i)  
**Tarih:** 11 Kasım 2026  
**Hedef Kapsam:** LARİ V1-A (Ödemesiz Kısıtlı Canlı Üretim / `paymentless_limited_production`)  
**Durum:** RESMİ KANONİK EKSİKLİK VE KAYNAK HAZIRLIK ANALİZİ  

---

## 1. Yönetici Özeti ve Belgenin Amacı

Bu belge; bağlayıcı **LARİ V1/V2 Master Planı**, kanonik **`docs/V1_PRODUCT_ROADMAP_RECONCILIATION.md`** uzlaştırma raporu, operasyonel **`docs/LARI_NEXT_PHASE_ROADMAP.md`** yol haritası, açık **GitHub Issue #18 ve #19**, **Draft PR #9** ve yerel **Pilot 1–4 kabul kayıtları** (`ADIM-001` - `ADIM-010`) ile diskteki gerçek kaynak kod ve testleri karşılaştırarak **V1-A (Ödemesiz Kısıtlı Canlı Üretim)** için eksiksiz bir kaynak hazırlığı ve eksiklik (gap) analizi sunmak amacıyla hazırlanmıştır.

### 1.1. V1-A Temel Stratejisi: "Ödemesiz Canlı Üretim" (`paymentless_limited_production`)
Türkiye güzellik salonu ve kuaför sektöründe ilk pilot salonlarla (örn. Melis Güzellik, Aura Nişantaşı vb.) sahada yerinde kurulum yapılırken; şirket evrak onayları, vergi levhası kayıtları, sanal POS (İyzico vb.) sözleşmeleri ve banka komisyon protokollerinin tamamlanması haftalar veya aylar sürebilmektedir.

V1-A stratejisi, platformun internet (`randevulari.com`) üzerinde gerçek bir salon operasyonunu **online kredi kartı tahsilatına ihtiyaç duymadan**, güvenli, kalıcı ve hatasız biçimde yönetmesini sağlayan çekirdek katmandır:
1. **Mali Akış ve Lisanslama:** Platform kullanım bedeli elden, nakit veya banka havalesi/EFT ile Super Admin (LARİ kurucuları) tarafından tahsil edilir. Super Admin arayüzü üzerinden kiracı kaydı `manual_active` statüsüne geçirilir, `paidThroughDate` (Son Geçerlilik Tarihi) ve havale dekont referansı atanır.
2. **Kalıcı Veri & Güvenlik:** Salon profilleri, hizmet katalogları, çalışan takvimleri ve müşteri randevuları asla uçucu `localStorage`'da bırakılmaz; doğrudan Supabase PostgreSQL veritabanında Row Level Security (RLS) izolasyonu altında saklanır.
3. **Ödeme İzolasyonu:** İstemci tarafındaki ödeme sağlayıcıları (`services/paymentProvider.ts`) sahte sandbox yönlendirmeleri yapmak yerine `PAYMENT_PROVIDER_NOT_CONFIGURED` fail-closed hatası vererek güvenli kilitlenir; UI üzerinde kredi kartı formu açılmaz.
4. **Sentetik İletişim:** Canlı SMS/WhatsApp operatör entegrasyonu (Netgsm/Twilio) devreye alınana kadar bildirimler `communication_outbox` tablosuna `synthetic_outbox_only` bayrağı ve PII maskelemesiyle kuyruğa yazılır.

### 1.2. Bu Analizin Amacı
ADIM-010 sonrası oluşan güncel kaynak kod temelinde:
- V1-A kapsamındaki tüm fonksiyonları somut dosya ve test kanıtlarıyla denetlemek.
- Açık GitHub Issue #18, Issue #19 ve Draft PR #9 gereksinimlerini tek tek ayrıştırarak completed/missing/blocked/duplicate sınıflandırmasına bağlamak.
- Veritabanı ve migrasyon envanterini diskteki gerçek 56 kanonik ve 3 aday (toplam 59 dosya) doğrulamasıyla tam pariteye oturtmak.
- Canlı altyapı, alan adı veya ücretli üçüncü parti servis gerektirmeyen **sıfır harcamalı (zero-cost)** ve bağımsız iş paketlerinden oluşan bir V1-A iş kuyruğu tanımlamak.
- V1-B (Online Ödeme) ve V2 (Keşif Pazaryeri, AI, Çift Yönlü Takvim) sınırlarını koruyarak yetkisiz kapsam genişletmelerini (`scope creep`) engellemek.

---

## 2. Kanonik Belgeler, Temel Hat ve GitHub Parite Uzlaştırması

### 2.1. Referans Alınan Belgeler
- **`docs/V1_PRODUCT_ROADMAP_RECONCILIATION.md`:** Pilot 3 (`ADIM-007`) kapsamında üretilen ve V1-A/V1-B ayrımını kanonikleştiren temel uzlaştırma belgesi.
- **`docs/LARI_NEXT_PHASE_ROADMAP.md`:** Phase A'dan Phase H'ye operasyonel geçiş playbook'u.
- **`docs/SUPABASE_PAYMENTLESS_PRODUCTION_IMPLEMENTATION_MATRIX.md`:** Veri katmanı hazırlık matrisi.
- **`docs/SUPABASE_AUTH_PAYMENTLESS_PRODUCTION_READINESS.md`:** Auth ve RLS kimlik haritası (`users_profile`).
- **`docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md`:** Self-servis randevu yönetimi ve kötüye kullanım filtreleri mimarisi.
- **`docs/FIRST_PILOT_ISSUE_TRIAGE_BOARD.md`:** İlk pilot salon operasyonel biletleri ve triyaj panosu.
- **`docs/V1_PILOT3_FINAL_ACCEPTANCE_REPORT.md`:** Pilot 3 Section 7 kabul bileti ve regresyon raporu.

### 2.2. Pilot 1 – Pilot 4 Kabul Edilen Adımlar ve Kazanım Envanteri

| Adım No | Başlık ve Kapsam | Durum | Commit SHA | Doğrulanan Güvenlik & Mimari Kilit |
| :--- | :--- | :---: | :---: | :--- |
| **ADIM-001** | Pilot 2 Bağımsız Kaynak Kabulü | `PASS` | `7772bf26` | Teslim makbuzu HMAC imza denetimi, mandatory tenant bağlamı kilitleri. |
| **ADIM-002** | Abonelik Oluşturma Durum Güvenliği | `PASS` | `6774678b` | `subscription.created` fail-closed pending eşlemesi, sahte ödeme kanıtı decoupling. |
| **ADIM-003** | Webhook Idempotency & Replay Güvenliği | `PASS` | `817ec85a` | V3 HMAC SHA256 imza motoru, `execute_payment_webhook_transaction` RPC, kısmi tekil indeks replay koruması (145/145 test). |
| **ADIM-004** | Veritabanı Hata Yönetimi & Güvenli Loglar | `PASS` | `ba3e794f` | SQL hata maskelemesi (`DATABASE_ERROR`), müşteri PII temizliği (`safeLogger`), atomik rollback. |
| **ADIM-005** | Subscription Sync Fail-Closed Güvenliği | `PASS` | `44a6d843` | `execute_subscription_sync_transaction` atomik senkronizasyon RPC'si, canlı ortamda sahte sync kilitleri (56/56 test). |
| **ADIM-006** | Phase F Sentetik Tarayıcı Regresyonu | `PASS` | `21d79a14` | Playwright Chromium ile izole 7 aşamalı uçtan uca sentetik salon onboarding ve çift randevu akışı (sıfır dış ağ). |
| **ADIM-007** | V1 Ürün ve Yol Haritası Uzlaştırması | `PASS` | `a730b981` | Kanonik yol haritası uzlaştırması, GitHub Issue #18/#19 ve PR #9 parite matrisi. |
| **ADIM-008** | Pilot 3 Genel Regresyon & Nihai Kabul | `PASS` | `acaf0fcf` | Sekiz adımlı Pilot 3 kapanışı, 9 QA paketinin senkron doğrulanması, Section 7 kabul bileti. |
| **ADIM-009** | V1-WQ-06: Tailwind Harici CDN Bağımlılığının Taşınması | `PASS` | `07346114` | `index.html` harici CDN kaldırıldı, yerel PostCSS/Vite derlemesi (`src/index.css`), tam offline/izole UI garantisi. |
| **ADIM-010** | V1-WQ-07: Public Booking Rate-Limit, Spam Koruması & OTP | `PASS` | `a0e064dc` | Sunucu tarafı rate limit, bot spam filtresi, telefon/fingerprint normalizasyonu, fail-closed policy denetimi, 20260903 SQL (3700 satır QA). |

### 2.3. Açık GitHub Issue #18, Issue #19 ve Draft PR #9 Parite Uzlaştırma Matrisi

Açık GitHub kayıtları ile yerel depodaki kaynak kod ve testler somut gereksinim düzeyinde karşılaştırılmış; her maddenin güncel durumu, kanıtı, sınıflandırması ve sonuç eylemi aşağıda belirlenmiştir:

| Kayıt / Madde Kimliği | Gereksinim / Problem Tanımı | Açık/Taslak Durumu | Diskteki Kesin Kaynak ve Test Kanıtı | Kapsam Sınıflandırması | Sonuç İş Paketi veya Hariç Tutma Gerekçesi |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **Issue #18 — Madde 1** | **Sahte Bildirim ID'lerinin Engellenmesi:** İstemci tarafında sahte `prov_*` ID üretiminin kaldırılması, outbox kuyruğuna gerçek veya tanımsız id yazılması. | `OPEN` | `services/communicationEventService.ts:createCommunicationEvent`<br>Test: `scripts/verify-v1-truthful-client-contracts.mjs` (8/8 PASS) | **COMPLETED** | Depoda tamamlandı (`622976c`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #18 — Madde 2** | **Müşteri PII Sanitizasyonu:** Konsol loglarında ve hata yanıtlarında telefon/e-posta bilgilerinin maskelenmesi. | `OPEN` | `services/notificationService.ts:sendNotification`<br>`supabase/functions/payment-webhook/index.ts:safeErrorResponse`<br>Test: `scripts/test-webhook-db-errors-and-logs.mjs` (PASS, Commit `ba3e794f`) | **COMPLETED** | Depoda tamamlandı (`ba3e794f`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #18 — Madde 3** | **Fail-Closed Sağlayıcı Doğruluğu:** Gerçek yapılandırılmış sağlayıcı olmadan `isProviderActive()=true` dönülmemesi, `PAYMENT_PROVIDER_NOT_CONFIGURED` fail-closed dönülmesi. | `OPEN` | `services/communicationProviderConfigService.ts:isProviderActive`<br>`services/paymentProvider.ts`<br>Test: `scripts/verify-v1-truthful-client-contracts.mjs` (PASS) | **COMPLETED** | Depoda tamamlandı (`622976c`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #18 — Madde 4** | **Güvenli Veritabanı Hata Yönetimi:** SQL hata detaylarının, şema isimlerinin veya stack trace'lerin UI katmanına sızmaması, genel hata kodları (`DATABASE_ERROR`, `TENANT_NOT_FOUND`) dönülmesi. | `OPEN` | `supabase/functions/payment-webhook/index.ts:safeErrorResponse`<br>`services/repositories/supabaseClient.ts`<br>Test: `scripts/test-webhook-db-errors-and-logs.mjs` (PASS, Commit `ba3e794f`) | **COMPLETED** | Depoda tamamlandı (`ba3e794f`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #18 — Madde 5** | **Canlı SMS/WhatsApp Gateway API Entegrasyonu:** Canlı SMS başlığı tahsisi ve SMS API anahtarı ile gerçek telefonlara fiziksel SMS gönderimi. | `OPEN` | Yerel outbox simülasyonu ve testleri tamdır (`scripts/verify-communication-provider-rehearsal.mjs` 19 senaryo PASS); ancak canlı sağlayıcı anahtarları repoda yer alamaz. | **BLOCKED** | **Dış Altyapı Engeli (`V1-WQ-05`):** Canlı SMS operatör sözleşmesi ve bakiye gerektirdiğinden V1-A sıfır maliyetli kuyruğuna ALINMAZ; Phase E/G canlı lansmanına ertelenmiştir. |
| **Issue #19 — Madde 1** | **subscription.created Durumunda Sahte Active/Paid Engeli:** Ödeme kanıtı (tahsilat dekontu veya kart çekimi) olmadan kiracının `active` veya `paid` statüsüne geçirilmesinin engellenmesi, `pending` olarak işaretlenmesi. | `OPEN` | `supabase/functions/payment-webhook/index.ts`<br>Test: `scripts/test-subscription-creation-security.mjs` (PASS, Commit `6774678b`) | **COMPLETED** | Depoda tamamlandı (`6774678b`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #19 — Madde 2** | **İyzico V3 HMAC İmza Doğrulaması:** Webhook çağrılarında gelen `x-iyz-signature-v3` HMAC-SHA256 imzasının doğrulanması, yetkisiz veya imzasız isteklerin reddedilmesi. | `OPEN` | `supabase/functions/_shared/iyzicoClient.ts:buildSubscriptionWebhookSignaturePayload`<br>Test: `scripts/test-webhook-idempotency.mjs` (143/143 PASS, Commit `817ec85a`) | **COMPLETED** | Depoda tamamlandı (`817ec85a`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #19 — Madde 3** | **Replay Koruması ve Sıralama:** Webhook çağrılarında imzasız `eventTime` yetkisizleştirilmesi ve partial unique index (`idx_subscriptions_provider_token`, `idx_subscriptions_provider_session_id`) ile çift kayıt engeli. | `OPEN` | `supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql`<br>Test: `scripts/test-webhook-idempotency.mjs` (143/143 PASS, Commit `817ec85a`) | **COMPLETED** | Depoda tamamlandı (`817ec85a`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #19 — Madde 4** | **Atomik Subscription Sync RPC:** Abonelik durumunun sağlayıcı ile senkronizasyonunun atomik veritabanı işlemi olarak yürütülmesi, hata anında fail-closed kilitlenmesi. | `OPEN` | `supabase/migrations/20260902_subscription_sync_transaction.sql`<br>`supabase/functions/subscription-sync/index.ts`<br>Test: `scripts/test-subscription-sync-security.mjs` (56/56 PASS, Commit `44a6d843`) | **COMPLETED** | Depoda tamamlandı (`44a6d843`); mükerrer iş açılmamalıdır (Kapsam dışı / Çözülmüş). |
| **Issue #19 — Madde 5** | **Canlı İyzico Tüccar API ve Webhook Secret Anahtarları:** Canlı tüccar hesabı (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`) ve canlı webhook URL tanımı. | `OPEN` | Sentetik V3 HMAC motoru doğrulanmıştır; canlı anahtar bulunmamaktadır. | **BLOCKED** | **V1-B Kapsamı Engeli (`V1-WQ-08`):** Online ödeme gerektirdiği ve V1-A ödemesiz kapsamının dışında olduğu için otomatik kuyruğa ALINMAZ. |
| **Issue #19 — Madde 6** | **Otomatik Senkronizasyon Daemon'ı (pg_cron / Cloud Scheduler):** Canlıda periyodik olarak `sync_subscription_state_transaction` tetikleyecek cron scheduler. | `OPEN` | RPC yerel olarak hazır (`20260902`); canlı cron altyapısı bulunmamaktadır. | **BLOCKED** | **V1-B Kapsamı Engeli (`V1-WQ-09`):** Canlı altyapı gerektirir, V1-A sıfır maliyetli kuyruğuna ALINMAZ. |
| **Draft PR #9 — Madde 1** | **İstemci Doğruluğu & Sözleşme Dosyaları (14 Dosya):** `components/CommunicationOutboxPanel.tsx`, `pages/BookingPage.tsx`, `services/communicationEventService.ts`, `services/notificationService.ts`, `services/paymentProvider.ts`, vb. | `DRAFT` | Yerel repoda tüm 14 dosya incelenmiş ve üzerine ADIM-002..006 güvenlik kilitleri eklenmiştir.<br>Test: `scripts/verify-v1-truthful-client-contracts.mjs` (8/8 PASS) | **COMPLETED** | Kod yerel repoda mevcuttur; mükerrer iş açılamaz. |
| **Draft PR #9 — Madde 2** | **GitHub Uzak Merge / Close Eylemi:** PR #9'un GitHub web arayüzünde ana dala squash-merge yapılması veya kapatılması. | `DRAFT` | Depo yöneticisi yetkisindedir; yerel otonom yazıcının uzak GitHub API veya admin yetkisi yoktur. | **BLOCKED** | **Depo Yöneticisi İncelemesi Bekliyor:** Otonom yazıcı tarafından PR kapatılamaz veya merge edilemez. |

---

## 3. V1-A Kapsam Sınırları ve Mimari Koruma (V1-A vs V1-B vs V2)

LARİ ürün sınırları kesin biçimde 3 katmana ayrılmıştır:

```
+---------------------------------------------------------------------------------------------------+
|                                      LARİ MİMARİ KAPSAM SINIRLARI                                 |
+-------------------------------------------------+-------------------------------------------------+
|                       V1 KAPSAMI                |                   V2 KAPSAMI                    |
|          (Salon Operasyonu ve Saha Kabulü)      |             (Ekosistem ve Büyüme)               |
+------------------------+------------------------+-------------------------------------------------+
| V1-A: Ödemesiz Canlı   | V1-B: Online Ağ Geçidi | • B2C Salon Keşif Pazaryeri (V1-WQ-12)          |
| • Salon & Şube Yönetim | • İyzico HPP & Sub API | • İki Yönlü Google Calendar Sync (V1-WQ-10)     |
| • Hizmet Kataloğu      | • V3 HMAC Webhook      | • Yapay Zeka Kuaför Formül Asistanı (V1-WQ-11)  |
| • Personel & Takvim    | • Idempotency & Replay | • Mobil Uygulama (Capacitor/React Native)       |
| • Kamu Rezervasyon     | • Otomatik Sync Cron   | • Çoklu Dil & Çoklu Para Birimi                 |
| • Self-Servis Token    | • 3D Secure / Kart Çek |                                                 |
| • RLS Tenant İzolasyon | • Grace & Dondurma     |                                                 |
| • Fail-Closed Outbox   |                        |                                                 |
| • Manuel Lisanslama    |                        |                                                 |
+------------------------+------------------------+-------------------------------------------------+
```

### 3.1. V1-A Kapsamı (Ödemesiz Canlı Üretim)
- **Hedef:** İnternette `randevulari.com` adresinde bir salonun günlük randevu ve personel operasyonunu kredi kartı posu olmadan eksiksiz yönetmesi.
- **Kapsanan Bileşenler:** Salon profili, şubeler, hizmet kategorileri/fiyatları, personel çalışma saatleri/molaları, kamu randevu alma formu, slot çakışma kilitleri, bot/spam ve telefon rate limitleri, randevu self-servis token ve iptal/erteleme akışı, müşteri defteri, fail-closed outbox, Super Admin `manual_active` lisanslama.
- **Tasarım İlkesi:** Canlı harcama veya dış servis ücreti gerektirmez; yerel olarak tamamen geliştirilebilir ve test edilebilir.

### 3.2. V1-B Korunan Kapsamı (Online Gateway & Otomasyon)
- **Hedef:** Salonların kredi kartıyla otomatik aylık/yıllık yenilenen aboneliklere geçmesi.
- **Kapsanan Bileşenler:** İyzico HPP checkout yönlendirmesi, V3 abonelik API'si, canlı webhook endpoint'i, otomatik arka plan senkronizasyonu cron daemon'ı (`sync_subscription_state_transaction`).
- **Koruma Kuralı:** V1-A kapsamında online ödeme ekranları açılmaz, sahte sandbox tahsilat yapılmaz. Ancak V1-A veritabanı şeması ve kod sözleşmeleri V1-B'ye geçişte veri kaybı yaratmayacak şekilde hazır tutulmuştur.

### 3.3. V2 Korunan Kapsamı (Ekosistem ve Büyüme)
- **Kapsanan Bileşenler:** Tüketiciye yönelik B2C pazaryeri portalı (`V1-WQ-12`), Google Calendar iki yönlü senkronizasyonu (`V1-WQ-10`), Gemini AI saç boya formülü ve stil asistanı (`V1-WQ-11`), native mobil uygulamalar, çoklu dil ve döviz.
- **Koruma Kuralı:** V1-A ve V1-B döngülerinde bu özellikler kesinlikle kapsam dışıdır; kod tabanında plansız genişletme (`scope creep`) yapılmaz.

---

## 4. V1-A Modül Bazlı Kaynak ve Test Parite Matrisi (Gerçek Kod & Test Kanıtları)

Aşağıdaki tablo, V1-A kapsamındaki tüm çekirdek işlevlerin diskteki gerçek dosya, fonksiyon ve test karşılıklarını belgeler:

| No | Modül / İşlev | Kaynak Dosya(lar) ve Fonksiyonlar | Veritabanı / Şema Karşılığı | Yerel Test & Doğrulama Kanıtı | Durum |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | **Salon & Şube Yönetimi** | `services/businessProfileService.ts`<br>`services/repositories/supabaseBusinessProfileRepository.ts`<br>`services/repositories/localBusinessProfileRepository.ts` | `tenants`, `branches`, `business_profiles` tabloları; RLS `tenant_id` filtresi | `scripts/test-phase-f-browser-regression.mjs` (Aşama 2-3 PASS)<br>`scripts/smoke-supabase-paymentless-staging.mjs` | **TAMAMLANDI** |
| **2** | **Hizmet Kataloğu & Fiyatlandırma** | `services/catalogService.ts`<br>`services/repositories/supabaseCatalogRepository.ts`<br>`services/repositories/localCatalogRepository.ts` | `services` tablosu (`price_amount`, `duration_minutes`, `is_active`) | `scripts/test-phase-f-browser-regression.mjs` (Aşama 4 PASS)<br>`scripts/verify-supabase-priority1-core-flows.mjs` | **TAMAMLANDI** |
| **3** | **Personel & Takvim Yönetimi** | `services/staffService.ts`<br>`services/catalogService.ts`<br>`supabaseCatalogRepository.ts` | `staff`, `working_hours`, `staff_breaks` tabloları | `scripts/test-phase-f-browser-regression.mjs` (Aşama 4 PASS)<br>`scripts/verify-synthetic-salon-onboarding.mjs` | **TAMAMLANDI** |
| **4** | **Kamusal Müşteri Rezervasyonu** | `pages/BookingPage.tsx`<br>`services/repositories/supabaseBookingRepository.ts:createPublicBooking`<br>`services/repositories/localBookingRepository.ts` | `create_public_booking` SECURITY DEFINER RPC, `appointments` tablosu | `scripts/test-phase-f-browser-regression.mjs` (Aşama 5-6 PASS)<br>`scripts/verify-public-booking-flow.mjs` | **TAMAMLANDI** |
| **5** | **Kamu Randevu Abuse & Rate Limit** | `services/bookingAbuseProtectionService.ts`<br>`services/publicBookingOtpService.ts`<br>`localBookingRepository.ts:readStrictStoredBookingPolicy` | `public_booking_rate_limit_events`, `public_booking_otp_challenges` (20260903 SQL) | `scripts/test-public-booking-ratelimit-and-otp.mjs` (ADIM-010 PASS, 3700 satır kapsamlı suite) | **TAMAMLANDI** |
| **6** | **Randevu Self-Servis & Token Yönetimi** | `services/appointmentSelfServiceService.ts`<br>`supabaseSelfServiceRepository.ts`<br>`localSelfServiceRepository.ts` | `appointment_access_tokens`, `appointment_change_requests` tabloları, SHA256 token hash | `scripts/execute-e1-token-cancellation-matrix.mjs`<br>`scripts/test-customer-token-cancellation-rpc.mjs` | **KODDA VAR (Eksik İnceleme Var: Brute-Force Rate Limit & Crypto Entropy)** |
| **7** | **Müşteri Kayıtları & KVKK Onay Defteri** | `services/customerService.ts`<br>`services/consentLedgerService.ts`<br>`supabasePolicyAndConsentRepository.ts` | `customers`, `consent_ledgers`, `policy_acceptances` tabloları | `scripts/verify-supabase-priority1-core-flows.mjs`<br>`scripts/verify-v1-truthful-client-contracts.mjs` | **TAMAMLANDI** |
| **8** | **İletişim Outbox (Fail-Closed)** | `services/communicationEventService.ts`<br>`services/notificationService.ts`<br>`components/CommunicationOutboxPanel.tsx` | `communication_outbox` tablosu (`delivery_mode: synthetic_outbox_only`), `safeLogger` | `scripts/verify-communication-provider-rehearsal.mjs` (19 senaryo PASS)<br>`scripts/test-webhook-db-errors-and-logs.mjs` | **TAMAMLANDI** |
| **9** | **Super Admin Manuel Lisanslama** | `services/superAdminService.ts`<br>`supabaseManualProvisioningRepository.ts`<br>`localManualProvisioningRepository.ts` | `super_admin_assign_commercial_plan` RPC, `subscriptions` (`manual_active`, `paid_through_date`) | `scripts/test-commercial-super-admin-mutations.mjs`<br>`scripts/verify-site-provisioning-and-manual-sales.mjs` | **TAMAMLANDI** |
| **10** | **Ön Yüz Yerel Derleme & İzolasyon** | `src/index.css`<br>`tailwind.config.js`<br>`postcss.config.js`<br>`index.html` (sıfır CDN) | N/A (Build pipeline) | `scripts/test-v1-wq06-tailwind-local-build.mjs` (ADIM-009 PASS)<br>`vite build` çıktısı `dist/assets/*.css` | **TAMAMLANDI** |
| **11** | **Veritabanı Şeması & RLS İzolasyonu** | `supabase/migrations/` (56 kanonik SQL + 3 candidate SQL; toplam 59 dosya)<br>`supabaseClient.ts` | 56 canonical migration (`001` .. `20260831`), 3 candidate migration (`20260901`, `20260902`, `20260903`), `users_profile` RLS haritası, tenant isolation | `scripts/verify-supabase-migration-integrity.mjs` (59 dosya tam uyumlu)<br>`scripts/verify-supabase-staging-consistency.mjs` (56 kanonik + 3 candidate PASS)<br>`supabase/tests/paymentless_production_rls_smoke.sql` | **KAYNAKTA TAMAMLANDI (Canlı Dağıtım Bekliyor)** |
| **12** | **Ödeme Sağlayıcı İzolasyonu (Decoupling)** | `services/paymentProvider.ts`<br>`supabase/functions/payment-webhook/index.ts` | `PAYMENT_PROVIDER_NOT_CONFIGURED` fail-closed error, UI kilitleri | `scripts/verify-v1-truthful-client-contracts.mjs`<br>`scripts/test-subscription-creation-security.mjs` | **TAMAMLANDI** |

> [!IMPORTANT]
> **Migrasyon Durum Ayrımı:** Diskteki şema envanteri 56 kanonik ve 3 candidate olmak üzere toplam 59 SQL dosyasından oluşur. Candidate migrasyonlar (`20260901`, `20260902`, `20260903`) 'CANDIDATE ONLY' koruma başlığıyla depoda yer almakta ve yerel/embedded testlerde doğrulanmaktadır. Ancak henüz canlı/staging Supabase veritabanına uygulanmamıştır; canlı dağıtım Phase G / `V1-WQ-01` kapsamında gerçekleştirilecektir.

---

## 5. Kapsam Sınıflandırması (Classification Matrix)

### 5.1. Tamamlanmış İşler (Completed in Source & Verified Locally)
1. **Mobil Uyumlu Pilot Onboarding ve İşletme Profili (Phase A):** Salon adı, adres, harita, logo, şube yönetimi ve mobil arayüzler eksiksiz kodlanmış ve doğrulanmıştır.
2. **Katalog ve Personel Yönetimi (Phase A/B):** Hizmetler, süreler, fiyatlar, çalışan atamaları ve takvim slot çakışma kilitleri tamamlanmıştır.
3. **Kamusal Rezervasyon Akışı (Phase B/F):** `/:slug` rotasından anonim randevu alma, müşteri oluşturma ve onay kaydı tamamlanmıştır.
4. **V1-WQ-06 (Tailwind Yerel Build):** Harici Tailwind CDN kaldırılmış, `postcss` ve `vite` yerel derleme boru hattına entegre edilmiştir (`07346114`).
5. **V1-WQ-07 (Spam & Abuse Koruması):** Günlük telefon randevu limiti, bot parmak izi koruması, no-show filtreleri ve sentetik OTP sözleşmesi kodlanmış ve doğrulanmıştır (`a0e064dc`).
6. **Phase F Sentetik Tarayıcı Provası:** 7 aşamalı uçtan uca sentetik salon yolculuğu (onboarding, katalog, profil, 2 randevu) izole Chromium tarayıcısında başarıyla geçmiştir (`21d79a14`).
7. **İletişim Outbox & PII Güvenliği:** Bildirimler outbox kuyruğuna güvenle yazılmakta, konsol ve yanıtlardan telefon/eposta bilgileri `safeLogger` ile maskelenmektedir (`ba3e794f`).
8. **Super Admin Manuel Aktivasyon:** Salonların kredi kartsız elden/havale ile `manual_active` olarak lisanslanması tamamlanmıştır.

### 5.2. Eksik İşler (Missing / Gaps — Yerel Olarak Tamamlanabilecek)
Canlı altyapı veya dış maliyet gerektirmeyen, tamamen yerel kod ve testlerle çözülebilecek işlevsel ve güvenlik eksikleri:
1. **Self-Service Token Brute-Force Koruması, Zaman Aşımı ve Kriptografik Rastgelelik Güvenliği (`V1A-SEC-01`):** `services/appointmentSelfServiceService.ts` içinde `Math.random()` tabanlı zayıf token üretiminin Web Crypto / Node crypto güvenli rastgelelik ile değiştirilmesi, token sorgulama uç noktasında ardışık geçersiz denemelere karşı sunucu/servis tarafında fail-closed rate limit uygulanması (`TOKEN_LOOKUP_RATE_LIMITED`) ve süresi dolmuş tokenlarda PII veri sızdırma riskinin engellenmesi.
2. **Reschedule (Erteleme) Taleplerinin Salon Sahibi Onay Akışı Paritesi (`V1A-FUNC-01`):** Müşteri erteleme talebinin (`AppointmentChangeRequest`) salon sahibi tarafından onaylandığında hedef personelin randevu çakışmalarının denetlenmesi, atomik olarak `appointments` tablosuna yansıması ve takvimde slotun güncellenmesi.
3. **No-Show Sinyallerinin Takvim Görünümünde Rozet/Uyarı Olarak İşaretlenmesi (`V1A-FUNC-02`):** ADIM-010 ile eklenen no-show geçmişinin günlük randevu takvim kartlarında personeli uyaran görsel bir risk rozeti (`⚠️ No-Show Riski`) olarak gösterilmesi.
4. **Data Mode Çift Yönlü State Geçiş Regresyon Paketi (`V1A-REG-01`):** `local` veri modu ile `supabase` veri modu arasında geçiş yapıldığında salon profili, katalog ve randevuların arayüz sözleşmelerinin izole testle sürekli denetlenmesi.
5. **İstemci Depolama Anahtarlarının (`lari_*`) Tip Güvenli Registry Altında Toplanması (`V1A-TECH-01`):** Farklı servislerde hardcoded string olarak dağınık duran `localStorage` anahtarlarının merkezi bir const registry altında toplanıp testler arası temizliğin (`purgeAllLariStorage`) standardize edilmesi.

### 5.3. Engellenmiş İşler (Blocked by External Infrastructure / Live Credentials)
Yerel geliştirme ortamında tamamlanamayacak, gerçek canlı sunucu, alan adı veya ücretli üçüncü parti hizmet gerektiren unsurlar:
1. **`V1-WQ-01` Canlı Supabase Veritabanı Dağıtımı:** Canlı Supabase URL ve Service Role Key gerektirir (56 kanonik + 3 candidate migrasyon diskte hazır durumdadır).
2. **`V1-WQ-02` Wildcard DNS ve SSL Konfigürasyonu:** `*.randevulari.com` Cloudflare CNAME kaydı ve SSL provizyonlama gerektirir.
3. **`V1-WQ-03` İlk Gerçek Salon Saha Kurulumu:** Fiziksel kuaför salonunda tablet/PC kurulumu ve gerçek kuaför personeliyle ilk 5 randevunun alınması gerektirir.
4. **`V1-WQ-04` Canlı Mantıksal Yedekleme Rutini:** Canlı Supabase veritabanı bağlantısı ve GitHub Secrets anahtarı gerektirir.
5. **`V1-WQ-05` Gerçek SMS Ağ Geçidi (Netgsm / Twilio):** Resmi SMS operatör sözleşmesi ve canlı SMS API anahtarı gerektirir (ücretli servis).
6. **`V1-WQ-08` Canlı İyzico Tüccar Aktivasyonu (V1-B):** Canlı İyzico tüccar hesabı ve API anahtarları gerektirir.
7. **`V1-WQ-09` Otomatik Abonelik Senkronizasyon Daemon'ı (V1-B):** Canlı Cloud Scheduler veya Supabase pg_cron gerektirir.

### 5.4. Mükerrer / Tekrarlanan İşler (Duplicates to Avoid)
Daha önceki adımlarda veya mevcut depoda zaten çözülmüş olup yeniden iş paketi açılmaması gereken konular:
1. **Tailwind CSS Paketleme:** ADIM-009 (`07346114`) ile zaten yerel derlemeye alınmıştır; yeniden ele alınamaz.
2. **Public Booking Rate Limit & Bot Spam Koruması:** ADIM-010 (`a0e064dc`) ile zaten 3700 satırlık kapsamlı test paketi ve servisleriyle tamamlanmıştır; sıfırdan servis yazılamaz.
3. **Webhook Idempotency ve HMAC İmza Motoru:** ADIM-003 (`817ec85a`) ile 145/145 testle zaten çözülmüştür; mükerrer iş açılamaz.
4. **Phase F Sentetik Tarayıcı Provası:** ADIM-006 (`21d79a14`) ile 7 aşamalı Playwright testiyle zaten doğrulanmıştır; baştan yazılamaz.
5. **İstemci Tarafı Sahte CSRF / Anti-Tamper Token İcadı:** Script kullanan saldırganın istemci ortamında kendisinin de üretebileceği sahte istemci-üretimli hash sözleşmeleri P0 güvenlik koruması sayılamaz ve iş kuyruğuna alınamaz (Finding FINDING-ADIM011-004 doğrultusunda reddedilmiştir).

---

## 6. Dış Bağımlılıklar, Maliyet Sınırları ve Engel Analizi

LARİ Otonom Geliştirme ilkelerine göre: **Otonom yazıcı ve asistan modeller canlı ortamı bozamayacakları gibi şirket adına ücretli işlem veya harcama da yapamazlar.**

| İş Kalemi / Dış Bağımlılık | Neden Engellenmiş (Blocker)? | Gerekli Dış Kaynak / Maliyet | Yerel Geliştirmedeki Sentetik Karşılığı | Otonom Kuyruktaki Statüsü |
| :--- | :--- | :--- | :--- | :---: |
| **Canlı Supabase DB Dağıtımı** (`V1-WQ-01`) | Uzak veritabanına erişim yetkisi ve canlı secret gerektirir. | Supabase Pro / Free Projesi, Master Key | 56 kanonik ve 3 candidate (toplam 59) test edilmiş SQL dosyası, Embedded PostgreSQL testleri | **ENGELLENMİŞ (Beklemede)** |
| **Wildcard DNS / SSL** (`V1-WQ-02`) | Cloudflare DNS ayarı ve domain satın alımı gerektirir. | `randevulari.com` domain tescili, DNS yetkisi | Hash router ve subdomain-aware client routing simülatörü | **ENGELLENMİŞ (Beklemede)** |
| **Gerçek Salon Saha Kabulü** (`V1-WQ-03`) | Sahada fiziksel kuaför salonunda tablet kurulumu gerektirir. | Saha personeli, kuaför salonu randevusu | Playwright Chromium E2E Sentetik Salon Onboarding Provası (ADIM-006) | **ENGELLENMİŞ (Beklemede)** |
| **Canlı SMS Gönderimi** (`V1-WQ-05`) | SMS başlığı tahsisi ve SMS paketi satın alımı gerektirir. | Netgsm / Twilio SMS bakiye ücreti | `communication_outbox` tablosu, `synthetic_outbox_only` bayrağı | **ENGELLENMİŞ (Beklemede)** |
| **Canlı İyzico Tahsilatı** (`V1-WQ-08`) | Canlı POS komisyonu ve tüccar sözleşmesi gerektirir. | Şirket banka hesabı, İyzico aktivasyonu | V3 HMAC imza simülatörü ve 145 adet testlik embedded webhook paketi | **V1-B KAPSAMINDA ENGELLENMİŞ** |

Bu engeller doğrultusunda, V1-A geliştirme döngüsü **%100 sıfır maliyetli ve yerel kaynaklarla doğrulanabilir** iş paketlerine odaklanmalıdır.

---

## 7. Önceliklendirilmiş Sıfır Maliyetli V1-A İş Kuyruğu (Actionable Work Queue)

Bu iş kuyruğu, **P0 Güvenlik -> V1-A İşlevsel Eksikler -> Regresyon -> Teknik Borç** sıralama kuralına göre düzenlenmiş, her biri bağımsız kabul kriterlerine ve somut negatif test kanıtlarına sahip paketlerden oluşur:

```
+---------------------------------------------------------------------------------------------------+
|                            ÖNCELİKLENDİRİLMİŞ SIFIR MALİYETLİ V1-A İŞ KUYRUĞU                      |
+---------------------------------------------------------------------------------------------------+
| [1. P0 GÜVENLİK]                                                                                  |
| • V1A-SEC-01: Self-Service Token Brute-Force Koruması, Zaman Aşımı ve Kriptografik Rastgelelik    |
+---------------------------------------------------------------------------------------------------+
| [2. V1-A İŞLEVSEL EKSİKLER]                                                                       |
| • V1A-FUNC-01: Randevu Saat Değişikliği (Reschedule) İnceleme ve Takvim Yansıtma Paritesi         |
| • V1A-FUNC-02: Müşteri No-Show ve Risk Rozetlerinin Salon Takviminde Görselleştirilmesi           |
+---------------------------------------------------------------------------------------------------+
| [3. REGRESYON TESTLERİ]                                                                           |
| • V1A-REG-01: Local Data Mode vs. Supabase Staging Çift Yönlü State Geçiş Regresyon Paketi        |
+---------------------------------------------------------------------------------------------------+
| [4. TEKNİK BORÇ VE MERKEZİLEŞTİRME]                                                               |
| • V1A-TECH-01: İstemci Depolama Anahtarlarının (lari_*) Tip Güvenli Registry Altında Toplanması   |
+---------------------------------------------------------------------------------------------------+
```

---

### 🔴 P0 — Güvenlik Paketi

#### Paket 1: `V1A-SEC-01` — Self-Service Token Brute-Force Koruması, Zaman Aşımı ve Kriptografik Rastgelelik Güvenliği
- **Öncelik:** `P0 (Güvenlik Blocker)`
- **Hedef Dosyalar:** `services/appointmentSelfServiceService.ts`, `services/repositories/localSelfServiceRepository.ts`, `services/repositories/supabaseSelfServiceRepository.ts`
- **Kanonik Kaynak & Gerekçe:** `docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md` Bölüm 1.3 ve `services/appointmentSelfServiceService.ts:createAppointmentAccessToken` ile `getAppointmentByManageToken`.
- **Mevcut Açık ve Somut Problem:**
  1. `appointmentSelfServiceService.ts:111` satırında `const token = 'apt_tok_' + Math.random().toString(36)...` şeklinde `Math.random()` kullanılmaktadır; bu rastgelelik kriptografik açıdan zayıftır ve tahmin edilebilir.
  2. `getAppointmentByManageToken(token)` çağrısında istemci tarafı veya servis tarafında geçersiz token sorgularına karşı hız kısıtlaması (rate limiting) bulunmamaktadır. Saldırgan otomatik script ile binlerce rastgele token deneyerek geçerli randevuları ve müşteri PII bilgilerini brute-force ile keşfedebilir.
  3. Süresi dolmuş (`expiresAt < now`) veya daha önce kullanılmış (`usedAt != null`) token sorgularında müşteri adı, telefonu veya randevu ayrıntılarının dönülmemesini garanti eden fail-closed sözleşme eksiktir.
- **Çözüm Tasarımı (Sunucu / Servis Katmanı):**
  1. Token üretiminde `crypto.getRandomValues` (Web Crypto) veya `crypto.randomBytes` (Node.js) kullanılarak en az 128-bit yüksek entropili güvenli token ve SHA-256 hash üretilmesi.
  2. Servis katmanında istemci parmak izi / IP bağlamı bazında başarısız token sorgu sayacının tutulması; ardışık 5 geçersiz denemede sorguların 15 dakika süreyle `TOKEN_LOOKUP_RATE_LIMITED` koduyla fail-closed kilitlenmesi.
  3. Süresi dolmuş veya kullanılmış token sorgularının randevu detaylarını sızdırmadan doğrudan `invalid_token` / `TOKEN_EXPIRED` reason code ile dönülmesi.
- **Kabul Kriterleri & Gereken Negatif Test:**
  - `scripts/test-self-service-token-security.mjs` test paketi yazılmalı:
    - 5 kez ardışık geçersiz token sorgusu yapan istemci 6. sorguda `TOKEN_LOOKUP_RATE_LIMITED` ile reddedilmeli.
    - Süresi dolmuş token ile yapılan sorguda randevu sahibinin adı, telefonu veya e-postası asla dönmemeli (`success: false`).
    - Kriptografik rastgelelik entropisi doğrulanmalı.
  - Dış servis/maliyet: **0 TL**.

---

### 🟡 V1-A İşlevsel Eksikler

#### Paket 2: `V1A-FUNC-01` — Randevu Saat Değişikliği (Reschedule) İnceleme ve Takvim Yansıtma Paritesi
- **Öncelik:** `V1-A İşlevsel (P1)`
- **Hedef Dosyalar:** `services/appointmentSelfServiceService.ts`, `services/repositories/localSelfServiceRepository.ts`, `services/repositories/supabaseSelfServiceRepository.ts`, `components/AdminAppointmentsCalendar.tsx`
- **Kanonik Kaynak & Gerekçe:** `docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md` Bölüm 2.2 ve 2.3 (`AppointmentChangeRequest`).
- **Mevcut Açık ve Somut Problem:** Müşterinin self-servis linkten açtığı erteleme talebi (`AppointmentChangeRequest`), salon sahibi tarafından admin panelinde incelenip onaylandığında, `appointments` tablosundaki randevu tarihi ve saatinin atomik güncellenmesi ve eski slotun boşa çıkması akışında çakışma ve hata kontrolleri eksiktir.
- **Çözüm Tasarımı:**
  1. Salon sahibi erteleme talebini "Onayla" dediğinde hedef personelin o saatte başka randevusu olup olmadığının kontrol edilmesi.
  2. Çakışma yoksa `appointment.date` ve `appointment.time` güncellenerek randevu durumunun `confirmed` kalması, `AppointmentChangeRequest.status`'un `applied` olması.
  3. Çakışma varsa salon sahibine uyarı verilmesi, işlemin atomik olarak rollback edilmesi.
- **Kabul Kriterleri:**
  - Onaylanan talep takvimdeki randevuyu yeni saate taşır, eski saati serbest bırakır.
  - Çakışma durumunda salon sahibi uyarılır ve işlem atomik olarak rollback edilir.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: `scripts/test-reschedule-approval-workflow.mjs` deterministik testi.

#### Paket 3: `V1A-FUNC-02` — Müşteri No-Show ve Risk Rozetlerinin Salon Takviminde Görselleştirilmesi
- **Öncelik:** `V1-A İşlevsel (P1)`
- **Hedef Dosyalar:** `components/AppointmentCard.tsx` (veya ilgili takvim randevu kartı), `services/bookingAbuseProtectionService.ts`
- **Kanonik Kaynak & Gerekçe:** `docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md` Bölüm 3.1 (`No-Show Risk Sweeper`) ve ADIM-010 kabul kayıtları.
- **Mevcut Açık ve Somut Problem:** ADIM-010 ile eklenen `noShowSignals` ve telefon bazlı risk kayıtları veritabanında tutulmakta ancak salon çalışanının günlük takvim ekranında randevu üzerinde görsel bir uyarı rozeti olarak gösterilmemektedir. Kuaför personeli randevunun yüksek riskli olduğunu fark edememektedir.
- **Çözüm Tasarımı:**
  1. Randevu listeleme ve takvim kartı bileşenine müşterinin no-show geçmişini sorgulayan hafif `getNoShowBadge(phone)` yardımcı metodunun bağlanması.
  2. Eğer müşteri telefonunun 1 veya daha fazla no-show kaydı varsa kart üzerinde sarı/kırmızı "⚠️ No-Show Riski (N kez)" rozetinin belirmesi.
  3. Butona tıklandığında salon personeline müşteriyi arama ve teyit alma hatırlatması sunulması.
- **Kabul Kriterleri:**
  - No-show geçmişi olan müşterinin randevusunda görsel uyarı rozeti çıkar.
  - No-show geçmişi temiz müşterilerde takvim kartı sade kalır.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: React/Vitest birim testi ve fixture doğrulaması.

---

### 🟢 Regresyon Testleri

#### Paket 4: `V1A-REG-01` — Local Data Mode vs. Supabase Staging Çift Yönlü State Geçiş Regresyon Paketi
- **Öncelik:** `Regresyon (P2)`
- **Hedef Dosyalar:** `scripts/test-v1a-data-mode-switching-regression.mjs`, `services/repositoryFactory.ts`
- **Kanonik Kaynak & Gerekçe:** `docs/V1_PRODUCT_ROADMAP_RECONCILIATION.md` Bölüm 3 ve 4.
- **Mevcut Açık ve Somut Problem:** LARİ hem çevrimdışı salon sunumu/pilot gösterimi (`local` data mode) hem de internet üzerindeki staging (`supabase` data mode) ortamlarında çalışmaktadır. `VITE_DATA_MODE` değiştiğinde servislerin aynı arayüz sözleşmelerini sağladığı ve veri kaybı olmadığı düzenli bir regresyon testiyle denetlenmelidir.
- **Çözüm Tasarımı:**
  1. İzole bir test harness'ı içinde aynı standart sentetik salon ve randevu senaryosunu önce `local` modda, ardından embedded PostgreSQL üzerinde `supabase` modunda koşturmak.
  2. Profil, katalog, kamu rezervasyonu ve outbox yanıtlarının tip ve değer uyumluluğunu doğrulamak.
- **Kabul Kriterleri:**
  - İki mod arasında aynı operasyonların döndürdüğü sözleşmeler 100% eşleşir.
  - Sıfır dış ağ erişimi ile koşar.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: `node scripts/test-v1a-data-mode-switching-regression.mjs` komutunun PASS vermesi.

---

### ⚪ Teknik Borç ve Merkezileştirme

#### Paket 5: `V1A-TECH-01` — İstemci Depolama Anahtarlarının (`lari_*`) Tip Güvenli Registry Altında Merkezileştirilmesi
- **Öncelik:** `Teknik Borç (P3)`
- **Hedef Dosyalar:** `services/storageKeys.ts`, `services/bookingAbuseProtectionService.ts`, `services/appointmentSelfServiceService.ts`, `services/tenantService.ts`
- **Kanonik Kaynak & Gerekçe:** Depo içi kod kalitesi ve test izolasyonu prensipleri.
- **Mevcut Açık ve Somut Problem:** Farklı servislerde `lari_booking_attempts`, `lari_noshow_signals`, `lari_tenant_booking_policies` gibi anahtarlar hardcoded string olarak tekrarlanmaktadır. Testler arasında bellek temizliği (purge/reset) ve namespace izolasyonu merkezi değildir.
- **Çözüm Tasarımı:**
  1. `services/storageKeys.ts` dosyası oluşturularak tüm anahtarların `STORAGE_KEYS` const enum/object altında toplanması.
  2. Test ortamları için güvenli `purgeAllLariStorage()` metodunun tanımlanması.
  3. İlgili servislerdeki hardcoded string'lerin bu registry'ye bağlanması.
- **Kabul Kriterleri:**
  - Proje genelinde dağınık `lari_*` string referansları registry'den çağrılır.
  - `purgeAllLariStorage()` çağrısı tüm geçici mock state'leri sıfırlar, testler arası kirlilik kalmaz.
  - `tsc --noEmit` sıfır hata ile tamamlanır.
  - Dış servis/maliyet: **0 TL**.

---

## 8. V1-B ve V2 Sınır Güvencesi ve Kapsam Koruması (Scope Guard Statement)

Bu analiz ve oluşturulan iş kuyruğu, **LARİ V1/V2 Master Planı** sınırlarını katı biçimde korur:

1. **V1-B Kapsamına Saygı:** İyzico sanal POS tahsilatı, HPP yönlendirmeleri, 3D secure formları, canlı webhook dinleyicileri veya otomatik kart borçlandırma rutinleri bu otonom kuyruğa ALINAMAZ. V1-B, kurucuların canlı tüccar anahtarlarını temin etmesiyle bağımsız bir faz olarak devreye alınacaktır.
2. **V2 Kapsamına Saygı:** Tüketici keşif pazaryeri (B2C portalı), kuaför formül AI asistanı, iki yönlü Google Calendar senkronizasyonu veya mobil uygulama geliştirmeleri bu aşamada kesinlikle başlatılamaz.
3. **Maliyet ve Zarar Sınırı:** Hiçbir iş paketi ücretli SMS gateway, ücretli hosting veya harici faturalandırılabilir API çağrısı gerektirmez.

---

## 9. Doğrulama ve Kabul Kanıtı Matrisi

Bu raporun hazırlanması ve ADIM-011 adımının teslimi sırasında aşağıdaki doğrulama standartları esas alınmıştır:

| Doğrulama Komutu | Kapsam ve Amaç | Beklenen Sonuç |
| :--- | :--- | :---: |
| `node scripts/scan-frontend-secrets.mjs` | İstemci tarafında ve repo genelinde hardcoded secret/key bulunmadığının denetimi | **SIFIR BULGU (PASS)** |
| `node scripts/verify-supabase-migration-integrity.mjs` | 56 kanonik ve 3 aday (toplam 59 dosya) migrasyonun sözdizimsel ve yapısal bütünlüğü | **BÜTÜNLÜK TAM (PASS)** |
| `node scripts/verify-supabase-staging-consistency.mjs` | 56 kanonik + 3 candidate (59 toplam) exact-SHA ve MIGRATION_APPLY_MANIFEST tutarlılığı | **TUTARLILIK TAM (PASS)** |
| `node node_modules/typescript/bin/tsc --noEmit` | Tüm TypeScript dosya ve tiplerinin derleme uyumluluğu | **SIFIR HATA (PASS)** |
| `node node_modules/vite/bin/vite.js build` | Optimize edilmiş üretim paketinin (production bundle) oluşturulabilmesi | **BAŞARILI DERLEME (PASS)** |

> [!NOTE]
> `--print` çalışma disiplini ve Arka Plan Görevi yasağı gereğince, yukarıdaki doğrulama komutları `loop.py` (`TESTING` evresi) tarafından senkron ve deterministik biçimde çalıştırılacaktır. Bu raporda geçmiş adımlardan (ADIM-001..010) devralınan doğrulanmış test kanıtları ile ADIM-011'in dokümantasyon teslim kapısı dürüstçe ayrılmıştır.

---

## 10. Sonuç ve Devir Beyanı

Bu rapor (`docs/V1A_SOURCE_READINESS_GAP_ANALYSIS.md`);
- Kanonik belgelere, açık GitHub Issue #18, Issue #19, Draft PR #9 kayıtlarına ve diskteki gerçek kaynak kodlara tam uyumludur.
- Veritabanı ve migrasyon envanterini 56 kanonik ve 3 candidate (toplam 59 dosya) olarak doğrulamış; aday migrasyonların yerel hazırlık durumu ile canlı/staging dağıtım durumunu açıkça ayrıştırmıştır (FINDING-ADIM011-002 çözüldü).
- Açık GitHub issue'ları ve PR'ları için madde bazlı gereksinim, mevcut durum, kaynak/test kanıtı, sınıflandırma ve sonuç eylemini içeren eksiksiz bir parite matrisi eklemiştir (FINDING-ADIM011-003 çözüldü).
- Desteksiz istemci taraflı anti-tamper paketini kaldırarak yerine `services/appointmentSelfServiceService.ts` odaklı, somut sunucu/servis açığına ve negatif teste dayalı `V1A-SEC-01` P0 güvenlik paketini tanımlamıştır (FINDING-ADIM011-004 çözüldü).
- P0 Güvenlik -> V1-A İşlevsel Eksikler -> Regresyon -> Teknik Borç hiyerarşisine dayalı, sıfır harcamalı 5 somut iş paketini tanımlamıştır.
- V1-B ve V2 sınırlarını korumuş, gereksiz kapsam genişletmelerini reddetmiştir.

Rapor bağımsız denetçinin (`Codex`) onayına sunulmuştur.
