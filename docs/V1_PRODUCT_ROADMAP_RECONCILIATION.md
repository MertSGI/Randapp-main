# LARİ V1 Ürün ve Yol Haritası Uzlaştırma Raporu
(V1 Product Roadmap Reconciliation & Operational Alignment)

**Belge Kimliği:** `LARI-DOC-V1-ROADMAP-RECONCILIATION-20261110`  
**Referans Adım:** `ADIM-007` (`[LARI-PILOT3-007] V1 Ürün ve Yol Haritası Uzlaştırması`)  
**Temel Dal / SHA:** `review/lari-pilot3-delivery` / `21d79a14969aefc4a5662171493f3af331d87191`  
**Durum:** RESMİ KANONİK UZLAŞTIRMA (CANLIYA HAZIRLIK VE ENTEGRASYON KILAVUZU)  
**Tarih:** 10 Kasım 2026  

---

## 1. Yönetici Özeti ve Belgenin Amacı

Bu belge; bağlayıcı **LARİ V1/V2 Master Planı**, mevcut **GitHub Issue #18 ve #19**, açık **Draft PR'lar** (özellikle PR #9 ve izolasyon paketleri) ile yerel **Pilot 2 ve Pilot 3** kaynak geliştirme çıktılarını sistematik olarak karşılaştırmak ve uzlaştırmak amacıyla hazırlanmıştır.

Pilot 3 süresince tamamlanan 6 çekirdek kaynak adımı (`ADIM-001` - `ADIM-006`):
1. **ADIM-001:** Pilot 2 bağımsız kaynak kabulü ve temel hat doğrulaması (`7772bf26`).
2. **ADIM-002:** Abonelik oluşturma durum güvenliği ve fail-closed veri akışı (`6774678b`).
3. **ADIM-003:** İyzico webhook idempotency, V3 HMAC imza motoru ve replay güvenliği (`817ec85a`).
4. **ADIM-004:** Veritabanı hata yönetimi, PII log sanitizasyonu ve güvenli hata dönüşleri (`ba3e794f`).
5. **ADIM-005:** Subscription sync fail-closed güvenliği ve periyodik mutabakat mimarisi (`44a6d843`).
6. **ADIM-006:** Phase F sentetik tarayıcı regresyon provası (Playwright E2E sentetik salon onboarding ve çift randevu akışı) (`21d79a14`).

Bu kazanımlar ışığında, LARİ platformunun canlıya çıkış stratejisi **iki aşamalı bir V1 mimarisi (V1-A ve V1-B)** olarak yapılandırılmıştır.

```
+---------------------------------------------------------------------------------------------------+
|                                     LARİ PLATFORM MİMARİSİ                                        |
+-------------------------------------------------+-------------------------------------------------+
|                    V1 KAPSAMI                   |                    V2 VİZYONU                   |
|   (Salon Operasyonu ve Saha Kabulü)             |   (Ekosistem ve Büyüme)                         |
+------------------------+------------------------+-------------------------------------------------+
| V1-A: Ödemesiz Canlı   | V1-B: Online Ağ Geçidi | • B2C Salon Keşif Pazaryeri                     |
| • Gerçek Supabase RLS  | • İyzico HPP & Sub API | • İki Yönlü Google Calendar Entegrasyonu        |
| • Salon & Şube Yönetim | • V3 HMAC Webhook      | • Yapay Zeka Kuaför Formül/Stil Asistanı        |
| • Kamu Rezervasyon     | • Idempotency & Replay | • Mobil Uygulama (Capacitor/React Native)       |
| • Self-Servis Randevu  | • Otomatik Senkron     | • Çoklu Dil/Para Birimi Küresel Genişleme       |
| • Manuel Lisanslama    | • Grace & Dondurma     |                                                 |
+------------------------+------------------------+-------------------------------------------------+
```

---

## 2. V1-A ve V1-B Öncelikleri ve Stratejik Ayrımı

### 2.1. V1-A: Ödemesiz Kısıtlı Canlı Üretim Önceliği (`paymentless_limited_production` — P0)

V1-A; internet ortamında (`randevulari.com`) gerçek bir güzellik salonunun günlük randevu, personel ve müşteri operasyonunu **online kredi kartı tahsilatına ihtiyaç duymadan**, güvenli, kalıcı ve hatasız biçimde yönetmesini sağlayan çekirdek ürün katmanıdır.

* **Neden Zorunlu?** Türkiye pazarında ilk pilot salonlarla sahada el sıkışırken ve yerinde kurulum yaparken POS aktivasyonu, şirket evrak onayları veya sanal POS komisyon mutabakatları aylarca sürebilmektedir. V1-A, teknik olarak platformu hemen canlıya açıp gerçek müşteri randevusu toplamayı mümkün kılar.
* **Mali Akış:** Platform abonelik ücreti elden, nakit veya banka havalesi/EFT ile Super Admin (LARİ kurucuları) tarafından tahsil edilir.
* **Lisanslama:** Süper Admin arayüzü üzerinden kiracı kaydı `manual_active` statüsüne geçirilir, `paidThroughDate` (Son Geçerlilik Tarihi) ve banka dekont numarası veritabanına işlenir.
* **Veri Kalıcılığı:** Salon verileri ve müşteri randevuları asla tarayıcı `localStorage`'ında tutulmaz; doğrudan Supabase PostgreSQL veritabanında Row Level Security (RLS) koruması altında saklanır (`productionStorageGuardService` tarafından denetlenir).
* **Güvenlik Sınırı:** İstemci tarafındaki ödeme sağlayıcıları (`services/paymentProvider.ts`) sahte sandbox yönlendirmeleri yapmak yerine typed `PAYMENT_PROVIDER_NOT_CONFIGURED` hatası fırlatarak fail-closed davranır.

### 2.2. V1-B: Online Ödeme ve Gateway Aktivasyonu Önceliği (P1)

V1-B; İyzico sanal POS ve abonelik altyapısının devreye alınarak, salonların kredi kartıyla otomatik aylık/yıllık yenilenen aboneliklere geçmesini sağlayan katmandır.

* **Çekirdek Bileşenler:**
  * Supabase Edge Functions (`create-checkout-session` ve `payment-webhook`).
  * İyzico HPP (Checkout Form) ve V3 Abonelik API entegrasyonu.
  * Webhook V3 HMAC imza doğrulama algoritması (`buildSubscriptionWebhookSignaturePayload` ve fail-closed merchantId kontrolü).
  * 143/143 embedded Postgres testiyle kanıtlanan `execute_payment_webhook_transaction` idempotency ve replay güvenliği.
  * Veritabanı kısmi tekil indeksleri (`idx_subscriptions_provider_token`, `idx_subscriptions_provider_session_id`).
  * Periyodik arka plan senkronizasyonu (`sync_subscription_state_transaction`).
* **Korumalı Geçiş Garantisi:** V1-A modunda çalışan salonlar V1-B devreye girdiğinde hiçbir veri kaybı yaşamaz. Hizmetleri, personelleri, çalışma saatleri ve randevuları olduğu gibi korunur. Peşin ödenen süre (`paidThroughDate`) dolana kadar kart çekimi yapılmaz; süre sonunda kademeli kart tanımlama daveti gösterilir.

---

## 3. Ödemesiz Çalışan Salon Fonksiyonları Kapsamı

`docs/PAYMENTLESS_PRODUCTION_SCOPE_CLARIFICATION.md` ve `docs/SUPABASE_PAYMENTLESS_PRODUCTION_IMPLEMENTATION_MATRIX.md` referans alınarak, ödemesiz canlı modda aktif olan ve kısıtlanan fonksiyonlar aşağıda netleştirilmiştir:

| Modül / Fonksiyon | Ödemesiz Modda Durum | Uygulama Katmanı / Güvenlik Kanıtı | Salon ve Müşteri Deneyimi |
| :--- | :---: | :--- | :--- |
| **Salon & Şube Yönetimi** | **AKTİF** | `SupabaseBusinessProfileRepository`, `branches` tablosu, RLS tenant izolasyonu | Salon adı, logosu, adresi, harita konumu ve iletişim bilgileri eksiksiz yönetilir. |
| **Hizmet Kataloğu & Fiyatlandırma** | **AKTİF** | `SupabaseCatalogRepository`, `services` tablosu, branch ilişkileri | Kategori, süre, fiyat ve açıklama tanımlanır. Fiyatlar müşteriye bilgi amaçlı gösterilir. |
| **Personel & Takvim Yönetimi** | **AKTİF** | `SupabaseCatalogRepository`, `staff`, `working_hours` tabloları | Uzman personeller eklenir, çalışma saatleri, mola ve haftalık izin günleri ayarlanır. |
| **Kamusal Müşteri Rezervasyonu** | **AKTİF** | `create_public_booking` SECURITY DEFINER RPC, slot çakışma kilitleri | Müşteriler `randevulari.com/:slug` adresinden hizmet ve personel seçerek canlı randevu alır. |
| **Randevu Self-Servis Yönetimi** | **AKTİF** | `appointment_access_tokens`, `cancel_public_appointment_by_manage_token` RPC | Müşteriler randevu detay bağlantısından randevuyu iptal edebilir veya saat değişikliği talep edebilir. |
| **Müşteri Kayıtları & Notları** | **AKTİF** | `customers` tablosu, `consent_ledgers` dijital onay defteri | Müşteri geçmişi, geçmiş randevuları ve formül/tercih notları KVKK uyumlu olarak tutulur. |
| **İletişim Kuyruğu (Outbox)** | **AKTİF (Fail-Closed)** | `communication_outbox` tablosu, `communicationEventService.ts` | SMS/WhatsApp bildirimleri veritabanında kuyruğa alınır, PII maskelenir, operatöre gösterilir. |
| **Süper Admin Provizyonlama** | **AKTİF** | `super_admin_assign_commercial_plan` RPC, `manual_active` lisanslama | Kurucular salonu inceler, sözleşmeyi imzalar ve sistemi tek tıkla aktif eder. |
| **Online Kredi Kartı Tahsilatı** | **DEVRE DIŞI** | `paymentProvider.ts` fail-closed error, UI checkout kilitli | Arayüzde kredi kartı formu açılmaz, yanıltıcı sanal POS linkleri engellenir. |
| **Otomatik Kart Yenileme** | **DEVRE DIŞI** | Background scheduler canlıda tetiklenmez, `manual_active` tarihine bakar | Otomatik borçlandırma veya kart çekimi yapılmaz; elden/havale takibi uygulanır. |

---

## 4. Phase A–G Yol Haritası Uzlaştırması ve Mevcut Durum

`docs/LARI_NEXT_PHASE_ROADMAP.md` ile diskteki güncel kod durumu karşılaştırılmış ve her fazın gerçekleşme seviyesi kanıtlarla tespit edilmiştir:

```
[Phase A: Pilot Hazırlık] -------> TAMAMLANDI (Mobil UI, intake formları, demo personası hazır)
[Phase B: Supabase Staging] ------> TAMAMLANDI (Canonical SQL 001-050, RLS smoke, seed planı hazır)
[Phase C: İyzico Sandbox] --------> KOD TAMAMLANDI / CANLI AĞ GEÇİDİ BEKLEMEDE (143/143 test PASS)
[Phase D: Wildcard DNS/SSL] ------> ROUTING HAZIR / CLOUDFLARE KAYDI BEKLEMEDE (Nginx kuralları hazır)
[Phase E: İletişim & Taşıyıcı] ---> FAİL-CLOSED HAZIR / OPERATÖR API BEKLEMEDE (Outbox & KVKK hazır)
[Phase F: Sentetik Salon Provası] -> TAMAMLANDI (ADIM-006 İzole Local-Data-Mode Tarayıcı Regresyonu PASS; İlk Gerçek Salon Saha Kabulü Phase G / İş Kuyruğunda)
[Phase G: Canlı Üretim Lansmanı] --> HAZIRLIK AŞAMASINDA (Canlı Supabase & DNS aktivasyonu bekliyor)
```

### Detaylı Faz İncelemesi:

1. **Phase A — First Manual Pilot Readiness: `TAMAMLANDI`**
   * *Kanıt:* `docs/FIRST_MANUAL_PILOT_OPERATING_PACK.md`, `docs/PILOT_SALON_INTAKE_FORM.md`, Nexus Studio demo personası ve mobil viewport uyumluluğu doğrulanmıştır.
2. **Phase B — Supabase Staging Cutover: `TAMAMLANDI`**
   * *Kanıt:* 50 adet kanonik SQL migrasyonu (`supabase/migrations/`), `users_profile` RLS kimlik haritası, `repositoryFactory.ts` üzerinden dinamik dataMode yönetimi ve `supabase/tests/paymentless_production_rls_smoke.sql` testleri mevcuttur.
3. **Phase C — İyzico Sandbox Payment Rehearsal: `KOD DÜZEYİNDE TAMAMLANDI (CANLI GATEWAY BEKLEMEDE)`**
   * *Kanıt:* `supabase/functions/payment-webhook/index.ts`, `_shared/iyzicoClient.ts` V3 HMAC doğrulaması, `20260901_payment_webhook_idempotency_and_replay_security.sql` içindeki `execute_payment_webhook_transaction` ve 143 testlik `scripts/test-webhook-idempotency.mjs` paketi 100% yeşildir. Canlı Iyzico tüccar anahtarları sisteme verildiğinde anında devreye alınabilir.
4. **Phase D — DNS / Wildcard Subdomain Rehearsal: `YAZILIMSAL OLARAK HAZIR (ALTYAPI BEKLEMEDE)`**
   * *Kanıt:* `services/siteProvisioningService.ts`, `docs/HOSTING_REWRITE_REQUIREMENTS.md` ve subdomain tabanlı tenant çözümleme mantığı kodlanmıştır. Canlıda Cloudflare/Cloud Run üzerinde `*.randevulari.com` wildcard DNS CNAME kaydı açılması beklenmektedir.
5. **Phase E — Transactional Communication Provider Rehearsal: `FAİL-CLOSED GÜVENLİ (SAĞLAYICI BAĞLANTISI BEKLEMEDE)`**
   * *Kanıt:* `services/communicationEventService.ts` ve `services/notificationService.ts` fail-closed olarak çalışmakta, PII sızıntısı yapmamakta ve sahte başarı üretmemektedir. Türkiye içi SMS gateway (Netgsm / Vatansms) API bilgileri tanımlandığında mesaj iletimi başlayacaktır.
6. **Phase F — First Real Salon Onboarding & Browser Rehearsal: `SENTETİK PROVA TAMAMLANDI (GERÇEK SAHA KABULÜ BEKLEMEDE)`**
   * *Doğrulanan Kanıt:* `ADIM-006` (`21d79a14969aefc4a5662171493f3af331d87191`) kapsamında üretilen ve bağımsız denetimden PASS alan `scripts/test-phase-f-browser-regression.mjs` Playwright tarayıcı testi; sentetik bir salonun onboarding sürecini, profil güncellemesini (`Aura Nişantaşı`), personel ve hizmet kataloğunu ve kamu rezervasyon sayfasından iki ardışık sentetik randevu akışını **yerel veri modu (local data mode / localStorage) altında izole Chromium tarayıcı motorunda** başarıyla doğrulamıştır (7/7 aşama PASS, 16.3s).
   * *Açık Kalan Saha Sınırı:* Bu test gerçek salon personeliyle sahada yapılan fiziksel operasyonu veya canlı Supabase veritabanı yazımını içermez. İlk gerçek salon kurulumu ve canlı veritabanı kabulü P0 blocker olarak iş kuyruğunda (`V1-WQ-03`) yer almaktadır; bu nedenle Phase F'nin yazılımsal sentetik provası tamamlanmış, ancak canlı saha kabulü faz statüsünü aşmayacak şekilde Phase G / saha lansmanı kapsamına bağlanmıştır.
7. **Phase G — Production Launch (Canlı Üretim): `SONRAKİ HEDEF (HAZIRLIK AŞAMASINDA)`**
   * *Gereksinimler:* Canlı Supabase URL/Key girişi, canlı DNS/SSL sertifikası, canlı veritabanı yedekleme cron'u ve ilk salonun canlıya alınması.

---

## 5. GitHub Issue #18, Issue #19 ve Açık Draft PR Uzlaştırma Matrisi

Yerel Pilot 3 depomuzdaki kaynak kodlar, GitHub (`MertSGI/Randapp-main`) üzerindeki ilgili issue ve açık draft pull request'lerle izlenebilir ve doğrulanabilir kanıtlar temelinde uzlaştırılmıştır.

> [!NOTE]
> Pilot 3 otonom geliştirme döngüsü depo yöneticisi yetkilerini (`push`, `merge`, `issue close`) kapsamaz. Canlı GitHub API veya uzak PR diff kanıtı bulunmayan hiçbir satır için otomatik issue kapatma, squash-merge veya supersede önerisi VERİLMEZ. İlgili tüm kararlar "parite doğrulanmadı, maintainer incelemesi bekliyor" statüsünde depo yöneticisine (`MertSGI`) devredilmiştir.

### 5.1. Dış Kaynak ve Parite Karşılaştırma Matrisi

| Kaynak Kimliği / URL | Durum / Snapshot Zamanı | Temel / Hedef Dal (Base & Head SHA) | Değişen / İlgili Dosya Envanteri | Yerel Pilot 3 Karşılığı & Commit / Test Kanıtı | Kalan Eylem / Depo Yöneticisi Parite Notu |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GitHub Issue #18**<br>`https://github.com/MertSGI/Randapp-main/issues/18`<br>*(V1 Client Truthfulness, Güvenli Hata Yönetimi & PII)* | `OPEN`<br>Gözlem: `2026-11-10T08:15:00Z` | Referans Ana Dal: `staging/supabase-staging-consistency` (`2c6a99b0b92ecea4f324c7195b3222f92688f294`)<br>*(Dış Issue kaydı Git diff nesnesi içermez)* | • `services/communicationEventService.ts`<br>• `services/notificationService.ts`<br>• `services/paymentProvider.ts`<br>• `services/communicationProviderConfigService.ts`<br>• `supabase/functions/payment-webhook/index.ts` | • `ADIM-004` (`ba3e794f`): DB hata mesajları sanitize edildi (`DATABASE_ERROR`, `TENANT_NOT_FOUND`).<br>• `scripts/test-webhook-db-errors-and-logs.mjs`: Loglardan PII temizlendi (PASS).<br>• `scripts/verify-v1-truthful-client-contracts.mjs`: 8/8 test PASS. | **Dış kanıt yok; kapatma önerilmez.**<br>Parite doğrulanmadı, maintainer incelemesi bekliyor. |
| **GitHub Issue #19**<br>`https://github.com/MertSGI/Randapp-main/issues/19`<br>*(Canonical Handoff / Webhook Idempotency & Sync)* | `OPEN`<br>Gözlem: `2026-11-10T08:15:00Z` | Referans Ana Dal: `staging/supabase-staging-consistency` (`2c6a99b0b92ecea4f324c7195b3222f92688f294`)<br>*(Dış Issue kaydı Git diff nesnesi içermez)* | • `supabase/functions/payment-webhook/index.ts`<br>• `supabase/functions/_shared/iyzicoClient.ts`<br>• `supabase/functions/subscription-sync/index.ts`<br>• `supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql`<br>• `supabase/migrations/20260902_subscription_sync_transaction.sql` | • `ADIM-002` (`6774678b`): `subscription.created` fail-closed.<br>• `ADIM-003` (`817ec85a`): HMAC V3 & idempotency RPC.<br>• `ADIM-005` (`44a6d843`): `sync_subscription_state_transaction` transactional sync RPC.<br>• `scripts/test-webhook-idempotency.mjs`: 143/143 test PASS.<br>• `scripts/test-subscription-sync-security.mjs`: 56/56 test PASS. | **Dış kanıt yok; kapatma önerilmez.**<br>Parite doğrulanmadı, maintainer incelemesi bekliyor. |
| **Draft PR #9**<br>`https://github.com/MertSGI/Randapp-main/pull/9`<br>*(V1 Source Truthfulness & Client Contracts)* | `DRAFT`<br>Gözlem: `2026-11-10T08:15:00Z` | Base Ref SHA: `2c6a99b0b92ecea4f324c7195b3222f92688f294`<br>Head Ref SHA: `622976cac618b5bf5fe1d17e266defd62dd852b6`<br>Ek Yerel Düzeltme SHA: `c880455f1c47163333c91ba18812f9d104761232` | 14 Dosya Envanteri (+814/-164, Diff Kaynağı: `git diff-tree -r 622976c`):<br>• `components/CommunicationOutboxPanel.tsx`<br>• `package.json`<br>• `pages/BookingPage.tsx`<br>• `scripts/verify-lari-recovery-hard-gate.mjs`<br>• `scripts/verify-v1-truthful-client-contracts.mjs`<br>• `services/communicationEventService.ts`<br>• `services/communicationProviderConfigService.ts`<br>• `services/messageTemplateService.ts`<br>• `services/notificationService.ts`<br>• `services/notificationTemplateService.ts`<br>• `services/paymentProvider.ts`<br>• `docs/LARI_CONTROLLER_EXECUTOR_RESULT_20261024.md`<br>• `docs/LARI_RECOVERY_GATE_AND_PARALLEL_WORK_20261024.md`<br>• `docs/LARI_V1_CLIENT_TRUTHFULNESS_ACCEPTANCE_20261024.md` | • PR #9 kapsamındaki dosyalar yerel repoda incelenmiş, üzerine ADIM-002..006 güvenlik kilitleri eklenmiştir.<br>• CI Run `40069185288` (Job `120798725101` PostgreSQL 17.6) yeşil tamamlanmıştır. | **Canlı PR diff/merge kanıtı yok; squash-merge/supersede önerilmez.**<br>Parite doğrulanmadı, maintainer incelemesi bekliyor. |
| **Karantina Yakalama Politikası**<br>`LARI_UNVERIFIED_ENCRYPTED_CAPTURE_POLICY.md` | `PROPOSED POLICY`<br>Gözlem: `2026-11-10T08:15:00Z` | Hedef Repo: `MertSGI/Randapp-main`<br>Dal: `review/lari-b15-encrypted-quarantine-source-20261023` | • `.github/workflows/lari-zero-cost-logical-backup.yml`<br>• Blob SHA: `d0c48d60be9144606551c04e2b89a4dde031f8b6` | • Yedekleme ve kurtarma kodu uygulama kod tabanından tamamen izole edilmiştir.<br>• Durum: `OWNER_KEY_PENDING`. Canlı capture yetkilendirmesi verilmemiştir. | **Canlı restore kanıtı yok; merge önerilmez.**<br>Parite doğrulanmadı, maintainer incelemesi bekliyor. |

### 5.2. Madde Bazlı Gereksinim-Commit Eşleme ve Ayrışma Analizi

#### A. GitHub Issue #18 Madde Bazlı Eşleme:
| Issue #18 Gereksinimi / Bildirilen Problem | Yerel Dosya ve Fonksiyon | Yerel Commit SHA | Doğrulama Testi ve Sonucu | Eşleşme / Ayrışma Durumu |
| :--- | :--- | :--- | :--- | :--- |
| **1. Sahte Bildirim ID'lerinin Engellenmesi:** İstemci tarafında sahte `prov_*` ID üretiminin kaldırılması | `services/communicationEventService.ts:createCommunicationEvent` | `622976c` | `node scripts/verify-v1-truthful-client-contracts.mjs` (8/8 PASS) | **Yerel Olarak Doğrulandı** |
| **2. Müşteri PII Sanitizasyonu:** Konsol ve yanıtlardan telefon/eposta maskelemesi | `services/notificationService.ts:sendNotification`<br>`supabase/functions/payment-webhook/index.ts` | `622976c`<br>`ba3e794f` | `node scripts/test-webhook-db-errors-and-logs.mjs` (PASS) | **Yerel Olarak Doğrulandı** |
| **3. Fail-Closed Sağlayıcı Doğruluğu:** Gerçek sağlayıcı olmadan `isProviderActive()=true` dönülmemesi | `services/communicationProviderConfigService.ts:isProviderActive` | `622976c` | `node scripts/verify-v1-truthful-client-contracts.mjs` (PASS) | **Yerel Olarak Doğrulandı** |
| **4. Güvenli Veritabanı Hata Dönüşü:** SQL/şema ayrıntılarının UI katmanına sızmaması | `supabase/functions/payment-webhook/index.ts:safeErrorResponse` | `ba3e794f` | `node scripts/test-webhook-db-errors-and-logs.mjs` (PASS) | **Yerel Olarak Doğrulandı** |
| **Eşleşmeyen Kalem (Açık Madde):** Gerçek SMS Gateway (Netgsm/Twilio) API Entegrasyonu | Canlı Ortam Değişkenleri (`SMS_API_KEY`) | Canlı Altyapı | Canlı ortam gerektirir; yerel test bulunmamaktadır | **EŞLEŞMEDİ** (İş Kuyruğunda `V1-WQ-05`) |

#### B. GitHub Issue #19 Madde Bazlı Eşleme:
| Issue #19 Gereksinimi / Bildirilen Problem | Yerel Dosya ve Fonksiyon | Yerel Commit SHA | Doğrulama Testi ve Sonucu | Eşleşme / Ayrışma Durumu |
| :--- | :--- | :--- | :--- | :--- |
| **1. subscription.created Durumunda Sahte Active/Paid Engeli:** Ödeme kanıtı olmadan tenant açılmaması | `supabase/functions/payment-webhook/index.ts` | `6774678b` | `node scripts/test-subscription-creation-security.mjs` (PASS) | **Yerel Olarak Doğrulandı** |
| **2. İyzico V3 HMAC İmza Doğrulaması:** Yetkisiz webhook bildirimlerinin reddedilmesi | `supabase/functions/_shared/iyzicoClient.ts:buildSubscriptionWebhookSignaturePayload` | `817ec85a` | `node scripts/test-webhook-idempotency.mjs` (PASS) | **Yerel Olarak Doğrulandı** |
| **3. Replay Koruması ve Sıralama:** İmzasız `eventTime` yetkisizleştirilmesi ve partial unique index | `supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql` | `817ec85a` | `node scripts/test-webhook-idempotency.mjs` (143/143 PASS) | **Yerel Olarak Doğrulandı** |
| **4. Atomik Subscription Sync RPC:** Periyodik senkronizasyonun atomik ve fail-closed çalışması | `supabase/migrations/20260902_subscription_sync_transaction.sql` | `44a6d843` | `node scripts/test-subscription-sync-security.mjs` (56/56 PASS) | **Yerel Olarak Doğrulandı** |
| **Eşleşmeyen Kalem (Açık Madde):** Canlı İyzico Tüccar API ve Webhook Secret Anahtarları | Supabase Vault (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`) | Canlı Altyapı | Canlı ortam gerektirir; yerel test bulunmamaktadır | **EŞLEŞMEDİ** (İş Kuyruğunda `V1-WQ-08`) |

#### C. Draft PR #9 Dosya Bazlı Envanter ve Parite Eşlemesi:
*(Exact Karşılaştırma Ref'leri: Base `2c6a99b0` -> Head `622976c`; Diff Kaynağı: `git diff-tree -r 622976c` & `docs/LARI_CONTROLLER_EXECUTOR_RESULT_20261024.md`)*

| PR #9 Dosya Yolu | PR Değişim Boyutu | PR Head Blob SHA (`622976c`) | Yerel Karşılık Commit'i | Parite Durumu |
| :--- | :--- | :--- | :--- | :--- |
| `components/CommunicationOutboxPanel.tsx` | +9 / -1 satır | `bb6678ce` | `622976c` (revize: `c880455`) | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `package.json` | +4 / -1 satır | `ed59ae0b` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `pages/BookingPage.tsx` | +4 / -1 satır | `89486ed2` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `scripts/verify-lari-recovery-hard-gate.mjs` | +217 / -0 satır | `7d88c227` | `622976c` (revize: `c880455`) | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `scripts/verify-v1-truthful-client-contracts.mjs` | +305 / -0 satır | `69d9cacf` | `622976c` (revize: `c880455`) | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/communicationEventService.ts` | +23 / -6 satır | `f41a3080` | `622976c` (revize: `c880455`) | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/communicationProviderConfigService.ts` | +13 / -1 satır | `d2e90e4c` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/messageTemplateService.ts` | +10 / -1 satır | `c7b3a035` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/notificationService.ts` | +164 / -82 satır | `295b1ca0` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/notificationTemplateService.ts` | +4 / -1 satır | `6d2aeb70` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `services/paymentProvider.ts` | +51 / -22 satır | `d39b2e41` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `docs/LARI_CONTROLLER_EXECUTOR_RESULT_20261024.md` | +75 / -0 satır | `2fffb7bf` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `docs/LARI_RECOVERY_GATE_AND_PARALLEL_WORK_20261024.md` | +54 / -0 satır | `0afb59f2` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| `docs/LARI_V1_CLIENT_TRUTHFULNESS_ACCEPTANCE_20261024.md` | +50 / -0 satır | `15c56ab7` | `622976c` | Parite doğrulanmadı, maintainer incelemesi bekliyor |
| **Eşleşmeyen Kalem (Açık Madde):** GitHub Hosted PR Squash-Merge / Close | PR #9 -> `staging` dalı | - | Canlı GitHub yetkilendirmesi gerektirir | **Parite doğrulanmadı, maintainer incelemesi bekliyor** |

---

## 6. Mevcut Durum Parite Matrisi (Tamamlanan vs. Kalan)

| Fonksiyon Alanı | Pilot 3 Yerel Durumu | Canlı Öncesi Kalan Eylem | Blocker Seviyesi | Hedef Faz |
| :--- | :--- | :--- | :---: | :---: |
| **Veritabanı Şeması ve RLS** | 50 SQL dosyası hazır, testler yeşil | Canlı Supabase'e migrasyonların uygulanması | **P0** | Phase G |
| **Salon Yönetim Arayüzü** | Tam işlevsel, mock/local/supabase uyumlu | Canlı ortamda ilk salon hesabı açılışı | **P0** | Phase G |
| **Kamu Randevu Alma** | E2E Playwright ile kanıtlandı, slot kilitleri aktif | Wildcard DNS ve domain yönlendirmesi | **P0** | Phase G |
| **Randevu Self-Servis Token** | Token hashing, iptal ve erteleme RPC hazır | Müşteriye SMS ile token linki iletimi | **P1** | Phase E/G |
| **Ödeme Altyapısı (HPP/Sub)** | Edge Function, HMAC V3, Idempotency hazır | Canlı İyzico API anahtarları girişi | **P1** | Phase C/G |
| **Abonelik Senkronizasyonu** | Fail-closed RPC ve sync service hazır | Supabase pg_cron veya Cloud Scheduler tick | **P1** | Phase G |
| **İletişim Taşıyıcısı** | Fail-closed outbox, log PII temizlendi | Netgsm / Twilio SMS gateway aktivasyonu | **P1** | Phase E |
| **Ön Yüz CSS Paketleme** | Tailwind CDN ile çalışıyor (ADIM-006 kanıtı) | Tailwind'in yerel build pipeline'ına alınması | **P2** | Phase G |
| **Gözlemlenebilirlik (Logging)** | Güvenli yerel loglar ve audit_events tablosu | Sentry / Highlight merkezi hata takip | **P2** | Phase G |
| **Pazaryeri ve Keşif (B2C)** | Tasarım aşamasında | V2 kapsamına ertelendi | **P3** | V2 |
| **AI Stilist Asistanı** | Mock servisleri hazır | V2 kapsamına ertelendi (Edge Gemini) | **P3** | V2 |

---

## 7. Önceliklendirilmiş V1 İş Kuyruğu (Actionable Work Queue)

Bu iş kuyruğu, ADIM-008 (Genel Regresyon ve Nihai Kabul) sonrasında platformun canlıya alınması için gereken adımları kesin öncelik sırasına göre listeler:

### 🔴 P0 — Canlı Lansman İçin Olmazsa Olmazlar (Launch Blockers)

*   **`V1-WQ-01` — Canlı Supabase Veritabanı Dağıtımı:**
    *   *Açıklama:* `supabase/MIGRATION_APPLY_MANIFEST.md` sırasına göre 50 migrasyon dosyasının canlı Supabase projesine uygulanması.
    *   *Doğrulama:* `npm run qa:supabase-schema` ve `npm run qa:auth-isolation` komutlarının canlı DB üzerinde yeşil vermesi.
*   **`V1-WQ-02` — Wildcard DNS ve SSL Konfigürasyonu:**
    *   *Açıklama:* `*.randevulari.com` CNAME kaydının Google Cloud Run / hosting IP'sine yönlendirilmesi ve otomatik SSL sertifikasının doğrulanması.
    *   *Doğrulama:* `https://test-salon.randevulari.com` adresinin SSL hatası vermeden rezervasyon sayfasını açması.
*   **`V1-WQ-03` — İlk Gerçek Salonun Super Admin ile Manuel Provizyonlanması:**
    *   *Açıklama:* Saha anlaşması yapılan ilk gerçek salonun Super Admin panelinden `manual_active` olarak aktive edilmesi, `paidThroughDate` tarihinin atanması.
    *   *Doğrulama:* Salon panelinde durumun aktif görünmesi ve randevu alımının kilitlenmemesi.
*   **`V1-WQ-04` — Sıfır Maliyetli Mantıksal Yedekleme Rutininin Kurulması:**
    *   *Açıklama:* `lari-zero-cost-logical-backup.yml` GitHub Actions iş akışının canlı DB için aktif edilmesi.
    *   *Doğrulama:* İlk otomatik SQL yedeğinin GitHub Secrets/Artifacts üzerinde başarıyla oluşturulması.

### 🟡 P1 — Erken Operasyonel Güvenlik ve İletişim (Operational Excellence)

*   **`V1-WQ-05` — Gerçek SMS Ağ Geçidi (Netgsm / Vatansms) Bağlantısı:**
    *   *Açıklama:* `services/communicationEventService.ts` arkasına resmi SMS sağlayıcı kütüphanesinin eklenmesi ve API anahtarlarının Edge Function ortamına verilmesi.
    *   *Doğrulama:* Alınan randevu sonrasında test telefonuna anlık SMS teyit mesajının ulaşması.
*   **`V1-WQ-06` — Tailwind CSS'in Yerel Bundle'a Dahil Edilmesi:**
    *   *Açıklama:* ADIM-006 denetçi notunda belirtilen harici CDN bağımlılığının kaldırılarak Tailwind'in `postcss`/`vite` derleme sürecine yerel olarak dahil edilmesi.
    *   *Doğrulama:* İnternet bağlantısı kesildiğinde veya harici CDN engellendiğinde yerel stillerin eksiksiz yüklenmesi.
*   **`V1-WQ-07` — Spam Randevu Koruması (Public Booking OTP / Rate Limit):**
    *   *Açıklama:* Kamusal randevu alımında kötü niyetli botları engellemek için müşteri telefonuna SMS OTP onay adımı eklenmesi.
    *   *Doğrulama:* OTP kodu girilmeden randevunun `confirmed` statüsüne geçmemesi.

### 🟢 P2 — V1-B Online Ödeme ve Gateway Aktivasyonu (Billing Automation)

*   **`V1-WQ-08` — Canlı İyzico Tüccar Hesabı Aktivasyonu:**
    *   *Açıklama:* İyzico canlı API ve Webhook Secret anahtarlarının Supabase Edge Functions ortamına tanımlanması.
    *   *Doğrulama:* Gerçek 1 TL'lik test işlemi ile 3D Secure akışının ve abonelik başlangıcının onaylanması.
*   **`V1-WQ-09` — Otomatik Abonelik Senkronizasyon Cron Daemon'ı:**
    *   *Açıklama:* Günlük olarak `sync_subscription_state_transaction` fonksiyonunu tetikleyecek Cloud Scheduler veya Supabase `pg_cron` kurgusunun yapılması.
    *   *Doğrulama:* Vadesi geçen aboneliklerin otomatik olarak `past_due` durumuna çekilmesi.

### ⚪ P3 — V2 Gelecek Genişleme Kuyruğu (Future Enhancements)

*   **`V1-WQ-10` — Google Calendar İki Yönlü Takvim Senkronizasyonu:**
    *   *Açıklama:* Salon çalışanlarının kişisel Google Takvimleri ile LARİ randevularının çift yönlü senkronize edilmesi.
*   **`V1-WQ-11` — Gemini AI Salon Asistanı:**
    *   *Açıklama:* Saç boya formülleri ve müşteri geçmişi özetlerini çıkaran güvenli Edge Function asistanı.
*   **`V1-WQ-12` — B2C Randevu Keşif Pazaryeri:**
    *   *Açıklama:* Müşterilerin konuma göre yakındaki salonları arayıp puanlarını görebileceği portal.

---

## 8. Sonuç ve ADIM-008'e Devir Notu

Bu uzlaştırma raporu, LARİ platformunun teknik borçlarını, yasal gereksinimlerini, ödemesiz pilot hazırlığını ve online ödeme geçiş güzergahını hiçbir varsayıma yer bırakmaksızın somut kod kanıtlarıyla belgelemiştir.

* **Kod Bütünlüğü:** Tüm tip tanımları (`tsc --noEmit`) ve üretim derlemesi (`vite build`) temiz durumdadır.
* **Pilot 3 Kazanımları:** ADIM-001'den ADIM-006'ya kadar elde edilen tüm güvenlik kilitleri, webhook idempotency mekanizmaları ve izole tarayıcı regresyon provası eksiksiz korunmaktadır.
* **Sonraki Adım:** `ADIM-008` (Genel Regresyon, Tüm QA Paketleri ve Nihai Kabul) adımı bu rapor doğrultusunda başlatılacak ve Pilot 3 döngüsü başarıyla tamamlanacaktır.
