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
- Tamamlanmış, eksik, dış altyapıya bağlı (engellenmiş) ve mükerrer işleri net biçimde ayrıştırmak.
- Canlı altyapı, alan adı veya ücretli üçüncü parti servis gerektirmeyen **sıfır harcamalı (zero-cost)** ve bağımsız iş paketlerinden oluşan bir V1-A iş kuyruğu tanımlamak.
- V1-B (Online Ödeme) ve V2 (Keşif Pazaryeri, AI, Çift Yönlü Takvim) sınırlarını koruyarak yetkisiz kapsam genişletmelerini engellemek.

---

## 2. Kanonik Belgeler ve Mevcut Temel Hat Özeti (Baseline)

### 2.1. Referans Alınan Belgeler ve Parite Kaynakları
- **`docs/V1_PRODUCT_ROADMAP_RECONCILIATION.md`:** Pilot 3 (`ADIM-007`) kapsamında üretilen ve V1-A/V1-B ayrımını kanonikleştiren temel uzlaştırma belgesi.
- **`docs/LARI_NEXT_PHASE_ROADMAP.md`:** Phase A'dan Phase H'ye operasyonel geçiş playbook'u.
- **`docs/SUPABASE_PAYMENTLESS_PRODUCTION_IMPLEMENTATION_MATRIX.md`:** Veri katmanı hazırlık matrisi.
- **`docs/SUPABASE_AUTH_PAYMENTLESS_PRODUCTION_READINESS.md`:** Auth ve RLS kimlik haritası (`users_profile`).
- **`docs/BOOKING_SELF_SERVICE_AND_ABUSE_PREVENTION.md`:** Self-servis randevu yönetimi ve kötüye kullanım filtreleri.
- **`docs/FIRST_PILOT_ISSUE_TRIAGE_BOARD.md`:** İlk pilot salon operasyonel biletleri ve triyaj panosu.
- **`docs/V1_PILOT3_FINAL_ACCEPTANCE_REPORT.md`:** Pilot 3 Section 7 kabul bileti ve regresyon raporu.

### 2.2. Pilot 1 – Pilot 4 Kabul Edilen Adımlar ve Kazanım Envanteri
Diskteki git geçmişi ve kabul raporları ile doğrulanan tamamlanmış adımlar:

| Adım No | Başlık ve Kapsam | Durum | Commit SHA | Doğrulanan Güvenlik & Mimari Kilit |
| :--- | :--- | :---: | :---: | :--- |
| **ADIM-001** | Pilot 2 Bağımsız Kaynak Kabulü | `PASS` | `7772bf26` | Teslim makbuzu HMAC imza denetimi, mandatory tenant bağlamı kilitleri. |
| **ADIM-002** | Abonelik Oluşturma Durum Güvenliği | `PASS` | `6774678b` | `subscription.created` fail-closed pending eşlemesi, sahte ödeme kanıtı decoupling. |
| **ADIM-003** | Webhook Idempotency & Replay Güvenliği | `PASS` | `817ec85a` | V3 HMAC SHA256 imza motoru, `execute_payment_webhook_transaction` RPC, kısmi indeks replay koruması (145/145 test). |
| **ADIM-004** | Veritabanı Hata Yönetimi & Güvenli Loglar | `PASS` | `ba3e794f` | SQL hata maskelemesi (`DATABASE_ERROR`), müşteri PII temizliği (`safeLogger`), atomik rollback. |
| **ADIM-005** | Subscription Sync Fail-Closed Güvenliği | `PASS` | `44a6d843` | `execute_subscription_sync_transaction` atomik senkronizasyon RPC'si, canlı ortamda sahte sync kilitleri (56/56 test). |
| **ADIM-006** | Phase F Sentetik Tarayıcı Regresyonu | `PASS` | `21d79a14` | Playwright Chromium ile izole 7 aşamalı uçtan uca sentetik salon onboarding ve çift randevu akışı (sıfır dış ağ). |
| **ADIM-007** | V1 Ürün ve Yol Haritası Uzlaştırması | `PASS` | `a730b981` | Kanonik yol haritası uzlaştırması, GitHub Issue #18/#19 ve PR #9 parite matrisi. |
| **ADIM-008** | Pilot 3 Genel Regresyon & Nihai Kabul | `PASS` | `acaf0fcf` | Sekiz adımlı Pilot 3 kapanışı, 9 QA paketinin senkron doğrulanması, Section 7 kabul bileti. |
| **ADIM-009** | V1-WQ-06: Tailwind Harici CDN Bağımlılığının Taşınması | `PASS` | `07346114` | `index.html` harici CDN kaldırıldı, yerel PostCSS/Vite derlemesi (`src/index.css`), tam offline/izole UI garantisi. |
| **ADIM-010** | V1-WQ-07: Public Booking Rate-Limit, Spam Koruması & OTP | `PASS` | `a0e064dc` | Sunucu tarafı rate limit, bot spam filtresi, telefon/fingerprint normalizasyonu, fail-closed policy denetimi, 20260903 SQL (3700 satır QA). |

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
| **6** | **Randevu Self-Servis & Token Yönetimi** | `services/appointmentSelfServiceService.ts`<br>`supabaseSelfServiceRepository.ts`<br>`localSelfServiceRepository.ts` | `appointment_access_tokens`, `appointment_change_requests` tabloları, SHA256 token hash | `scripts/execute-e1-token-cancellation-matrix.mjs`<br>`scripts/test-customer-token-cancellation-rpc.mjs` | **KODDA VAR (Eksik İnceleme Var)** |
| **7** | **Müşteri Kayıtları & KVKK Onay Defteri** | `services/customerService.ts`<br>`services/consentLedgerService.ts`<br>`supabasePolicyAndConsentRepository.ts` | `customers`, `consent_ledgers`, `policy_acceptances` tabloları | `scripts/verify-supabase-priority1-core-flows.mjs`<br>`scripts/verify-v1-truthful-client-contracts.mjs` | **TAMAMLANDI** |
| **8** | **İletişim Outbox (Fail-Closed)** | `services/communicationEventService.ts`<br>`services/notificationService.ts`<br>`components/CommunicationOutboxPanel.tsx` | `communication_outbox` tablosu (`delivery_mode: synthetic_outbox_only`), `safeLogger` | `scripts/verify-communication-provider-rehearsal.mjs` (19 senaryo PASS)<br>`scripts/test-webhook-db-errors-and-logs.mjs` | **TAMAMLANDI** |
| **9** | **Super Admin Manuel Lisanslama** | `services/superAdminService.ts`<br>`supabaseManualProvisioningRepository.ts`<br>`localManualProvisioningRepository.ts` | `super_admin_assign_commercial_plan` RPC, `subscriptions` (`manual_active`, `paid_through_date`) | `scripts/test-commercial-super-admin-mutations.mjs`<br>`scripts/verify-site-provisioning-and-manual-sales.mjs` | **TAMAMLANDI** |
| **10** | **Ön Yüz Yerel Derleme & İzolasyon** | `src/index.css`<br>`tailwind.config.js`<br>`postcss.config.js`<br>`index.html` (sıfır CDN) | N/A (Build pipeline) | `scripts/test-v1-wq06-tailwind-local-build.mjs` (ADIM-009 PASS)<br>`vite build` çıktısı `dist/assets/*.css` | **TAMAMLANDI** |
| **11** | **Veritabanı Şeması & RLS İzolasyonu** | `supabase/migrations/` (50 kanonik SQL + 20260901, 20260902, 20260903)<br>`supabaseClient.ts` | 50 canonical migration, `users_profile` RLS haritası, tenant isolation | `scripts/verify-supabase-migration-integrity.mjs`<br>`scripts/verify-supabase-staging-consistency.mjs`<br>`supabase/tests/paymentless_production_rls_smoke.sql` | **TAMAMLANDI** |
| **12** | **Ödeme Sağlayıcı İzolasyonu (Decoupling)** | `services/paymentProvider.ts`<br>`supabase/functions/payment-webhook/index.ts` | `PAYMENT_PROVIDER_NOT_CONFIGURED` fail-closed error, UI kilitleri | `scripts/verify-v1-truthful-client-contracts.mjs`<br>`scripts/test-subscription-creation-security.mjs` | **TAMAMLANDI** |

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
Canlı altyapı gerektirmeyen, tamamen yerel kod ve testlerle çözülebilecek işlevsel ve güvenlik eksikleri:
1. **Public Booking Anti-Tamper / Request Header Sözleşmesi:** Kamu randevu POST çağrılarında zaman damgası manipülasyonu ve sahte fingerprint ataklarına karşı istemci-sunucu katı anti-tamper doğrulama katmanının sıkılaştırılması.
2. **Self-Service Token Brute-Force Koruması:** `appointment_access_tokens` sorgulamalarında geçersiz token deneme limitinin uygulanması (ardışık 5 başarısız denemede kilit).
3. **Reschedule (Erteleme) Taleplerinin Salon Sahibi Onay Akışı Paritesi:** Müşteri erteleme talebinin (`AppointmentChangeRequest`) salon sahibi tarafından onaylandığında `appointments` tablosuna atomik yansıması ve takvimde güncellenmesi.
4. **No-Show Sinyallerinin Takvim Görünümünde Rozet/Uyarı Olarak İşaretlenmesi:** 2 kez no-show olmuş telefonlardan gelen rezervasyonlarda takvim kartında personeli uyaran görsel rozet gösterimi.
5. **Data Mode Çift Yönlü State Geçiş Regresyon Paketi:** `local` veri modu ile `supabase` veri modu arasında geçiş yapıldığında salon profili ve randevuların sözleşme uyumluluğunun izole testle kanıtlanması.
6. **İstemci Depolama Anahtarlarının (`lari_*`) Tip Güvenli Registry Altında Toplanması:** Farklı servislerde dağınık duran `localStorage` anahtarlarının merkezi bir registry altında toplanıp bellek sızıntılarının önlenmesi.

### 5.3. Engellenmiş İşler (Blocked by External Infrastructure / Live Credentials)
Yerel geliştirme ortamında tamamlanamayacak, gerçek canlı sunucu, alan adı veya ücretli üçüncü parti hizmet gerektiren unsurlar:
1. **`V1-WQ-01` Canlı Supabase Veritabanı Dağıtımı:** Canlı Supabase URL ve Service Role Key gerektirir.
2. **`V1-WQ-02` Wildcard DNS ve SSL Konfigürasyonu:** `*.randevulari.com` Cloudflare CNAME kaydı ve SSL provizyonlama gerektirir.
3. **`V1-WQ-03` İlk Gerçek Salon Saha Kurulumu:** Fiziksel kuaför salonunda tablet/PC kurulumu ve gerçek kuaför personeliyle ilk 5 randevunun alınması gerektirir.
4. **`V1-WQ-04` Canlı Mantıksal Yedekleme Rutini:** Canlı Supabase veritabanı bağlantısı ve GitHub Secrets anahtarı gerektirir.
5. **`V1-WQ-05` Gerçek SMS Ağ Geçidi (Netgsm / Vatansms):** Resmi SMS operatör sözleşmesi ve canlı SMS API anahtarı gerektirir (ücretli servis).
6. **`V1-WQ-08` Canlı İyzico Tüccar Aktivasyonu (V1-B):** Canlı İyzico tüccar hesabı ve API anahtarları gerektirir.
7. **`V1-WQ-09` Otomatik Abonelik Senkronizasyon Daemon'ı (V1-B):** Canlı Cloud Scheduler veya Supabase pg_cron gerektirir.

### 5.4. Mükerrer / Tekrarlanan İşler (Duplicates to Avoid)
Daha önceki adımlarda veya mevcut depoda zaten çözülmüş olup yeniden iş paketi açılmaması gereken konular:
1. **Tailwind CSS Paketleme:** ADIM-009 (`07346114`) ile zaten yerel derlemeye alınmıştır; yeniden ele alınamaz.
2. **Public Booking Rate Limit & Bot Spam Koruması:** ADIM-010 (`a0e064dc`) ile zaten 3700 satırlık kapsamlı test paketi ve servisleriyle tamamlanmıştır; sıfırdan servis yazılamaz.
3. **Webhook Idempotency ve HMAC İmza Motoru:** ADIM-003 (`817ec85a`) ile 145/145 testle zaten çözülmüştür; mükerrer iş açılamaz.
4. **Phase F Sentetik Tarayıcı Provası:** ADIM-006 (`21d79a14`) ile 7 aşamalı Playwright testiyle zaten doğrulanmıştır; baştan yazılamaz.

---

## 6. Dış Bağımlılıklar, Maliyet Sınırları ve Engel Analizi

LARİ Otonom Geliştirme ilkelerine göre: **Otonom yazıcı ve asistan modeller canlı ortamı bozamayacakları gibi şirket adına ücretli işlem veya harcama da yapamazlar.**

| İş Kalemi / Dış Bağımlılık | Neden Engellenmiş (Blocker)? | Gerekli Dış Kaynak / Maliyet | Yerel Geliştirmedeki Sentetik Karşılığı | Otonom Kuyruktaki Statüsü |
| :--- | :--- | :--- | :--- | :---: |
| **Canlı Supabase DB Dağıtımı** (`V1-WQ-01`) | Uzak veritabanına erişim yetkisi ve canlı secret gerektirir. | Supabase Pro / Free Projesi, Master Key | 50 adet test edilmiş kanonik SQL dosyası, Embedded PostgreSQL testleri | **ENGELLEMİŞ (Beklemede)** |
| **Wildcard DNS / SSL** (`V1-WQ-02`) | Cloudflare DNS ayarı ve domain satın alımı gerektirir. | `randevulari.com` domain tescili, DNS yetkisi | Hash router ve subdomain-aware client routing simülatörü | **ENGELLEMİŞ (Beklemede)** |
| **Gerçek Salon Saha Kabulü** (`V1-WQ-03`) | Sahada fiziksel kuaför salonunda tablet kurulumu gerektirir. | Saha personeli, kuaför salonu randevusu | Playwright Chromium E2E Sentetik Salon Onboarding Provası (ADIM-006) | **ENGELLEMİŞ (Beklemede)** |
| **Canlı SMS Gönderimi** (`V1-WQ-05`) | SMS başlığı tahsisi ve SMS paketi satın alımı gerektirir. | Netgsm / Vatansms SMS bakiye ücreti | `communication_outbox` tablosu, `synthetic_outbox_only` bayrağı | **ENGELLEMİŞ (Beklemede)** |
| **Canlı İyzico Tahsilatı** (`V1-WQ-08`) | Canlı POS komisyonu ve tüccar sözleşmesi gerektirir. | Şirket banka hesabı, İyzico aktivasyonu | V3 HMAC imza simülatörü ve 145 adet testlik embedded webhook paketi | **V1-B KAPSAMINDA ENGELLEMİŞ** |

Bu engeller doğrultusunda, V1-A geliştirme döngüsü **%100 sıfır maliyetli ve yerel kaynaklarla doğrulanabilir** iş paketlerine odaklanmalıdır.

---

## 7. Önceliklendirilmiş Sıfır Maliyetli V1-A İş Kuyruğu (Actionable Work Queue)

Bu iş kuyruğu, **P0 Güvenlik -> V1-A İşlevsel Eksikler -> Regresyon -> Teknik Borç** sıralama kuralına göre düzenlenmiş, her biri bağımsız kabul kriterlerine ve test kanıtlarına sahip somut paketlerden oluşur:

```
+---------------------------------------------------------------------------------------------------+
|                            ÖNCELİKLENDİRİLMİŞ SIFIR MALİYETLİ V1-A İŞ KUYRUĞU                      |
+---------------------------------------------------------------------------------------------------+
| [1. P0 GÜVENLİK]                                                                                  |
| • V1A-SEC-01: Public Booking Client-Side CSRF ve Anti-Tamper Header Sözleşmesi                   |
| • V1A-SEC-02: Self-Service Token Expiry ve Brute-Force Rate Limiter                             |
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

### 🔴 P0 — Güvenlik Paketleri

#### Paket 1: `V1A-SEC-01` — Public Booking Client-Side CSRF ve Anti-Tamper Header Sözleşmesi
- **Öncelik:** `P0 (Güvenlik Blocker)`
- **Hedef Dosyalar:** `services/bookingAbuseProtectionService.ts`, `services/publicBookingOtpService.ts`, `services/repositories/localBookingRepository.ts`
- **Gerekçe & Problem:** Kamu randevu alımında istemci tarafından gönderilen isteklerin zaman damgası ve parmak izi verileri ağ manipülasyonuna veya basit script tekrarlarına açıktır. İstek gövdesinde anti-tamper hash doğrulaması yapılmalıdır.
- **Çözüm Tasarımı:**
  1. `requestOtp` ve `createPublicBooking` çağrılarına istek zaman damgası (`requestTimestamp`) ve istemci anti-tamper hash'i (`antiTamperToken = sha256(slug + phone + timestamp + salt)`) eklenmesi.
  2. Saat farkı > 300 saniye (5 dakika) olan veya manipüle edilmiş hash içeren isteklerin fail-closed olarak `TAMPER_DETECTED` koduyla reddedilmesi.
- **Kabul Kriterleri:**
  - Geçerli anti-tamper token'a sahip istekler başarıyla geçer.
  - 5 dakikadan eski veya bozuk token içeren istekler sessizce reddedilir ve abuse tablosuna işlenir.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: `scripts/test-public-booking-anti-tamper.mjs` birim testi ile kanıtlanması.

#### Paket 2: `V1A-SEC-02` — Self-Service Token Expiry ve Brute-Force Rate Limiter
- **Öncelik:** `P0 (Güvenlik Blocker)`
- **Hedef Dosyalar:** `services/appointmentSelfServiceService.ts`, `services/repositories/localSelfServiceRepository.ts`, `services/repositories/supabaseSelfServiceRepository.ts`
- **Gerekçe & Problem:** Müşteri randevu yönetim linkleri (`/#/appointment/manage/:token`) rastgele tahmin saldırılarına (brute-force) karşı sorgulama tarafında hız kısıtına sahip değildir.
- **Çözüm Tasarımı:**
  1. Token sorgulama uç noktasında istemci parmak izi bazında başarısız sorgu sayacı tutulması.
  2. Aynı parmak izinden ardışık 5 geçersiz token sorgusu yapıldığında 15 dakika boyunca sorgulamaların `TOKEN_LOOKUP_RATE_LIMITED` ile kilitlenmesi.
  3. Süresi dolmuş (`expires_at < now`) veya `used` durumundaki token'ların detay bilgisi sızdırmadan doğrudan `TOKEN_EXPIRED` dönmesi.
- **Kabul Kriterleri:**
  - 5 kez hatalı token denemesi yapan istemci 6. denemede fail-closed kilitlenir.
  - Süresi dolmuş token randevu sahibinin PII verilerini açığa çıkarmaz.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: `scripts/test-self-service-token-security.mjs` negatif testi ile kanıtlanması.

---

### 🟡 V1-A İşlevsel Eksikler

#### Paket 3: `V1A-FUNC-01` — Randevu Saat Değişikliği (Reschedule) İnceleme ve Takvim Yansıtma Paritesi
- **Öncelik:** `V1-A İşlevsel (P1)`
- **Hedef Dosyalar:** `services/appointmentSelfServiceService.ts`, `services/repositories/localSelfServiceRepository.ts`, `services/repositories/supabaseSelfServiceRepository.ts`, `components/AdminAppointmentsCalendar.tsx` (veya ilgili admin paneli)
- **Gerekçe & Problem:** Müşterinin self-servis linkten açtığı erteleme talebi (`AppointmentChangeRequest`), salon sahibi tarafından admin panelinde incelenip onaylandığında, `appointments` tablosundaki randevu tarihi ve saatinin atomik güncellenmesi ve eski slotun boşa çıkması akışında uç senaryo (çakışma ve red) yönetimi eksiktir.
- **Çözüm Tasarımı:**
  1. Salon sahibi erteleme talebini "Onayla" dediğinde hedef personelin o saatte başka randevusu olup olmadığının kontrol edilmesi.
  2. Çakışma yoksa `appointment.date` ve `appointment.time` güncellenerek randevu durumunun `confirmed` kalması, `AppointmentChangeRequest.status`'un `applied` olması.
  3. Çakışma varsa salon sahibine uyarı verilmesi, talep sahibine gerekçe iletilmesi.
- **Kabul Kriterleri:**
  - Onaylanan talep takvimdeki randevuyu yeni saate taşır, eski saati serbest bırakır.
  - Çakışma durumunda salon sahibi uyarılır ve işlem atomik olarak rollback edilir.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: `scripts/test-reschedule-approval-workflow.mjs` deterministik testi.

#### Paket 4: `V1A-FUNC-02` — Müşteri No-Show ve Risk Rozetlerinin Salon Takviminde Görselleştirilmesi
- **Öncelik:** `V1-A İşlevsel (P1)`
- **Hedef Dosyalar:** `components/AppointmentCard.tsx` (veya ilgili randevu kartı), `services/bookingAbuseProtectionService.ts`
- **Gerekçe & Problem:** ADIM-010 ile eklenen `noShowSignals` ve telefon bazlı risk kayıtları veritabanında tutulmakta ancak salon çalışanının günlük takvim ekranında randevu üzerinde görsel bir uyarı rozeti olarak gösterilmemektedir. Kuaför personeli randevunun yüksek riskli olduğunu fark edememektedir.
- **Çözüm Tasarımı:**
  1. Randevu listeleme ve takvim kartı bileşenine müşterinin no-show geçmişini sorgulayan hafif `getNoShowBadge(phone)` yardımcı metodunun bağlanması.
  2. Eğer müşteri telefonunun 1 veya daha fazla no-show kaydı varsa kart üzerinde sarı/kırmızı "⚠️ No-Show Riski (N kez)" rozetinin belirmesi.
  3. Butona tıklandığında salon sahibine "Müşteriyi Ara ve Teyit Al" modalının açılması.
- **Kabul Kriterleri:**
  - No-show geçmişi olan müşterinin randevusunda görsel uyarı rozeti çıkar.
  - No-show geçmişi temiz müşterilerde takvim kartı sade kalır.
  - Dış servis/maliyet: **0 TL**.
  - Doğrulama: Vitest / React birim testi ve fixture doğrulaması.

---

### 🟢 Regresyon Testleri

#### Paket 5: `V1A-REG-01` — Local Data Mode vs. Supabase Staging Çift Yönlü State Geçiş Regresyon Paketi
- **Öncelik:** `Regresyon (P2)`
- **Hedef Dosyalar:** `scripts/test-v1a-data-mode-switching-regression.mjs`, `services/repositoryFactory.ts`
- **Gerekçe & Problem:** LARİ hem çevrimdışı salon sunumu/pilot gösterimi (`local` data mode) hem de internet üzerindeki staging (`supabase` data mode) ortamlarında çalışmaktadır. `VITE_DATA_MODE` değiştiğinde servislerin aynı arayüz sözleşmelerini sağladığı ve veri kaybı olmadığı düzenli bir regresyon testiyle denetlenmelidir.
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

#### Paket 6: `V1A-TECH-01` — İstemci Depolama Anahtarlarının (`lari_*`) Tip Güvenli Registry Altında Merkezileştirilmesi
- **Öncelik:** `Teknik Borç (P3)`
- **Hedef Dosyalar:** `services/storageKeys.ts`, `services/bookingAbuseProtectionService.ts`, `services/appointmentSelfServiceService.ts`, `services/tenantService.ts`
- **Gerekçe & Problem:** Farklı servislerde `lari_booking_attempts`, `lari_noshow_signals`, `lari_tenant_booking_policies` gibi anahtarlar hardcoded string olarak tekrarlanmaktadır. Testler arasında bellek temizliği (purge/reset) ve namespace izolasyonu merkezi değildir.
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
| `node scripts/verify-supabase-migration-integrity.mjs` | 50 kanonik migrasyonun ve aday migrasyonların sözdizimsel ve yapısal bütünlüğü | **BÜTÜNLÜK TAM (PASS)** |
| `node node_modules/typescript/bin/tsc --noEmit` | Tüm TypeScript dosya ve tiplerinin derleme uyumluluğu | **SIFIR HATA (PASS)** |
| `node node_modules/vite/bin/vite.js build` | Optimize edilmiş üretim paketinin (production bundle) oluşturulabilmesi | **BAŞARILI DERLEME (PASS)** |

> [!NOTE]
> `--print` çalışma disiplini ve Arka Plan Görevi yasağı gereğince, yukarıdaki doğrulama komutları `loop.py` (`TESTING` evresi) tarafından senkron ve deterministik biçimde çalıştırılacaktır. Bu raporda geçmiş adımlardan (ADIM-001..010) devralınan doğrulanmış test kanıtları ile ADIM-011'in dokümantasyon teslim kapısı dürüstçe ayrılmıştır.

---

## 10. Sonuç ve Devir Beyanı

Bu rapor (`docs/V1A_SOURCE_READINESS_GAP_ANALYSIS.md`);
- Kanonik belgelere, açık GitHub issue'larına ve diskteki gerçek kaynak kodlara tam uyumludur.
- V1-A ödemesiz canlı üretim kapsamını modül bazında ve test kanıtlarıyla ortaya koymuştur.
- Tamamlanmış, eksik, engellenmiş ve mükerrer işleri netleştirmiştir.
- P0 Güvenlik -> V1-A İşlevsel Eksikler -> Regresyon -> Teknik Borç hiyerarşisine dayalı, sıfır harcamalı 6 somut iş paketini tanımlamıştır.
- V1-B ve V2 sınırlarını korumuş, gereksiz kapsam genişletmelerini reddetmiştir.

Rapor bağımsız denetçinin (`Codex`) onayına sunulmuştur.
