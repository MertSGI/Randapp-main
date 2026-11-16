# LARİ V1-A, V1-B & V2 Branch Reconciliation, Module Classification & Timestamp Collision Inventory

> **Tarih:** 2026-11-14  
> **Aktif Dal (Active Branch):** `ci/lari-independent-acceptance-gate`  
> **HEAD Commit:** `dc42a28cdefb9e20dc9137bc88b6b6d7124235c3`  
> **Program Evresi:** Faz A1 (ADIM-022) — GitHub Branch/PR Diff Uzlaştırması & Slug/RPC Delta Envanteri  
> **Temel İlke:** `REUSE FIRST — NO DUPLICATE DEVELOPMENT`. `HEAD` içinde mevcut ve `ADIM-001..021` kabulünden geçmiş hiçbir iş sıfırdan yeniden yazılmaz.

---

## 1. Git Geçmişi, Dallar ve PR Doğrulama Gerçekliği

### 1.1 HEAD Kabul Edilmiş Temel (`dc42a28c`)
- **Kabul Geçmişi:** `ADIM-001` .. `ADIM-021` eksiksiz `PASS` durumundadır.
- **CI Doğrulama Kapısı:** `.github/workflows/lari-independent-acceptance-ci.yml` altındaki tüm statik, güvenlik, migrasyon ve Postgres 17 test kapıları yeşildir.
- **Aktif SQL Migrasyonları:** Toplam 60 adet migrasyon (`001_initial_schema.sql` .. `20260904_self_service_token_security_and_ratelimit.sql`) disk üzerinde `supabase/migrations/` dizininde kanonik ve temiz durumdadır.

### 1.2 HEAD İçinde Zaten Mevcut Olan Draft PR'lar (Tekrar Geliştirme Kesinlikle Yasak)
Aşağıdaki 7 açık PR ve staging dalı Git geçmişi açısından incelenmiş, tamamının HEAD'in doğrudan atası (`ancestor`) olduğu ve HEAD karşısında **0 yeni commit** taşıdığı doğrulanmıştır:

| PR / Dal | Commit SHA | HEAD Karşısındaki Durum | `git merge-base --is-ancestor` | Sonuç |
| :--- | :--- | :--- | :--- | :--- |
| `origin/staging/supabase-staging-consistency` | `2c6a99b` | 0 ahead / 76 behind | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #9** | `5998511` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #12** | `2930c9d` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #14** | `8c5e0e4` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #16** | `752a478` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #29** | `4e19c84` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #31** | `16f18fa` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |
| **Draft PR #33** | `c333444` | 0 ahead | `EVET (Ancestor)` | Zaten `HEAD` içinde tam erimiş. |

> **Kural:** PR #9, #12, #14, #16, #29, #31, #33 içerikleri için yeni adım veya mükerrer geliştirme açılmayacaktır.

---

## 2. Gerçek Delta Taşıyan Dallar & Uzlaştırma Kararları

### 2.1 PR #27 (`origin/release/lari-v1a-slug-rc-20261031-review` @ `2d1da27`)
- **Ortak Ata (Merge-Base):** `752a478` (PR #16 zamanı, ADIM-001 öncesi).
- **Doğrudan Birleştirme (Merge) Yasağı:** PR #27 doğrudan HEAD ile birleştirilirse, ADIM-001..021 arasında kazanılmış 60'tan fazla güvenlik sertleştirmesi ve `20260901..20260904` migrasyonları ezilerek 42.127 satırlık regresyon oluşur.
- **Deltalar ve Uzlaştırma Durumu:**
  1. **LARI-V1A-SLUG-01:** `utils/slugUtils.ts`, `services/siteProvisioningService.ts`, `services/publicLinkService.ts`, `supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql` ve `scripts/test-slug-regression.mjs` paketleri ADIM-022 kapsamında HEAD'e taşınmış ve test edilmiştir (`ACCEPTED_COMPLETE`).
     - **Tur 1 Mikro-Uzlaşma (Bulgu #1 [P1_CONTRACT]):** `services/siteProvisioningService.ts` içindeki `hasExclusiveSlugOwnership` ve `reserveTenantSlug` fonksiyonları cerrahi olarak daraltıldı. `localStorage` mülkiyet sayımı ve yerel `tenantService.updateTenant` rollback mekanizması yalnızca yerel/non-Supabase modunda çalıştırılacak şekilde sınırlandırıldı. Supabase modunda ise münhasırlık yalnızca RPC sonucu ve yetkili DB okumalarıyla doğrulanmakta olup, yasaklı doğrudan istemci güncellemesi veya rollback çağrısı engellenmiştir. `scripts/test-slug-regression.mjs` içinde negatif regresyon testleri ile kanıtlanmıştır.
  2. **W-LARI-LP-1/2/3:** Katalog ve randevu availability servislerindeki tenant izolasyon sıkılaştırmaları (`localCatalogRepository.ts`, `supabaseCatalogRepository.ts`, `localBookingRepository.ts`, `availabilityService.ts`) Faz A2 (ADIM-023) kapsamında taşınmış ve test edilmiştir (`ACCEPTED_COMPLETE`).
     - **Tur 2 Denetçi Rework Uzlaşması (FINDING-ADIM023-009..014):**
       - **FINDING-ADIM023-009:** `isRegressionFixture` ad-hoc kiracı baypası tamamen kaldırıldı; personel uygunluk kontrolü tüm kiracılar için istisnasız zorunlu kılındı.
       - **FINDING-ADIM023-010:** `getNextAvailableSlotForStaff` ve `getEarliestAvailableStaff` metotları kiracıya ait aktif servis ve personel sahipliği ile uygunluk eşlemesini doğrulamak üzere güncellendi, çapraz/bilinmeyen nesneler için `null` döndürmesi sağlandı.
       - **FINDING-ADIM023-011:** `LocalCatalogRepository.updateAvailability` metodunun `tenantId` ve `id` alanlarını mutasyon girdisiyle ezmesi engellendi, yetki dışı kiracı değişimleri fail-closed hata verecek şekilde korundu.
       - **FINDING-ADIM023-012:** `createAppointment` çakışma ve süre hesabı münhasıran kiracıya ait katalog servisinden (`service.duration`) türetilecek şekilde güvenceye alındı; 0, negatif veya NaN sürelerle randevu sınırının aşılması engellendi.
       - **FINDING-ADIM023-013:** `updateAppointment` patch girdilerinde `serviceId` ve `staffId` alanlarının kiracı sahipliği ve karşılıklı uygunluğu doğrulandı; çapraz kiracı nesneleri bağlama girişimleri engellendi.
       - **FINDING-ADIM023-014:** `LocalCatalogRepository.listServicesForStaff` çıktısı kiracıya ait güncel servislerle kesiştirilerek bozuk/çapraz kiracı kimliklerinin sızması engellendi.
       - **FINDING-ADIM023-015-REOPENED:** `LocalCatalogRepository.createStaff` içindeki tüm ad-bazlı veya kiracı kimliği bazlı otomatik servis atama baypasları (`tenant_pub_parity`, `tenant_v1a_reg_isolated_001`, `Merve Hanım`, `Ali Bey`) tamamen kaldırıldı; personel uygunluğu yalnız açık tenant-scoped `assignServiceToStaff` eşlemesiyle kurulacak şekilde kesinleştirildi. İlgili test/regresyon kurulumları açık eşlemeyle güncellendi ve negatif testler eklendi.
       - **FINDING-ADIM023-016:** Phase F tarayıcı testinde (`scripts/test-phase-f-browser-regression.mjs`), Stage 5 başlamadan önce `Can Demir` (`staff_aura_02`) için `Klasik Manikür` (`srv_aura_04`) tenant-scoped `staff_services` eşlemesi açıkça tanımlandı ve Playwright doğrulaması tam sağlandı.
       - **Tur 3 Kök Neden Düzeltmesi (FINDING-ADIM023-009 Sıfır Randevu Yazımı):** `LocalBookingRepository.listAppointments` metodunda, özel kataloğa sahip veya test/regresyon kiracıları için `apt_demo_1..5` sahte randevularının otomatik üretilip storage'a yazılması engellendi; böylece unmapped veya uygunsuz randevu denemelerinden sonra kiracının sıfır randevu (`0 appointments`) durumu korunmaktadır.
  3. **UI-V2 Önizlemesi:** `components/SalonWebsiteViewV2.tsx` ve `?ui=v2` yönlendirmesi Faz C1 (ADIM-031) kapsamında taşınacaktır (`PARTIAL_IMPLEMENTATION`).
  4. **Program V2 Güvenlik Sertleştirmesi:** `20261007_program_v2_security_surface_hardening.sql` önerisi Faz H1 (ADIM-039) kapsamında taşınacaktır (`PARTIAL_IMPLEMENTATION`).

### 2.2 PR #4 (`origin/work/lari-dev247-batch-20261021` @ `4068ea0`)
- **Ortak Ata (Merge-Base):** `134c871` (56. migrasyon sonrası).
- **Deltalar ve Uzlaştırma Durumu:**
  1. **WP-05B/C/D:** Restore-aware migration reconciliation & P0 cutover doğrulayıcıları (`scripts/verify-lari-recovery-hard-gate.mjs`) HEAD içinde mevcuttur (`ACCEPTED_COMPLETE`).
  2. **C05 Legal & KVKK Parity:** Self-service ve randevu KVKK onay paritesi (`consentLedgerService.ts` tenant-aware consent tracking) Faz A2 (ADIM-023) kapsamında taşınmış ve test edilmiştir (`ACCEPTED_COMPLETE`). UI seviyesindeki C05 form ayrıştırması Faz A4 (ADIM-025) kapsamında UI paketiyle doğrulanacaktır.

### 2.3 Staging Release Gate Dalı (`origin/staging/ci-lari-release-gate-c1-c4-20261017` @ `72911e4`)
- **Ortak Ata (Merge-Base):** `134c871`.
- **Deltalar ve Uzlaştırma Durumu:**
  - P2A Tenant Provisioning & Onboarding (`tenantOnboardingFlowService.ts`, `p2a_*` migrasyonları) -> Faz C2 (ADIM-032).
  - Operasyon, Randevu Aralığı, Bekleme Listesi & Takvim Sağlayıcıları -> Faz D1 (ADIM-033).
  - POS, Ürün Envanteri, Tedarikçi PO & Prim-Bahşiş -> Faz D2 (ADIM-034).
  - Müşteri 360 CRM, Sadakat, Depozito, Paket/Üyelik & Cüzdan -> Faz D3 (ADIM-035).
  - Klinik ve Sağlık Turizmi Dikeyleri -> Faz E1 (ADIM-036).
  - Pazar Yeri & Doğrulanmış Yorumlar -> Faz F1 (ADIM-037).
  - Küreselleşme & Fail-Closed AI Modülleri -> Faz G1 (ADIM-038).

---

## 3. Alt Modül Sınıflandırma Matrisi (Module Classification Matrix)

Her bir alt modül program gereksinimlerine göre dört kanonik durumdan biriyle etiketlenmiştir:
- `ACCEPTED_COMPLETE`: HEAD içinde eksiksiz uygulanmış, test edilmiş ve kabul edilmiş.
- `PARTIAL_IMPLEMENTATION`: Temel/çekirdek kısmı mevcut, faz hedefi kapsamında tamamlanacak.
- `MISSING_IMPLEMENTATION`: Henüz HEAD'e taşınmamış; ilgili faz adımında aktarılacak.
- `EXTERNAL_HOLD`: 0 TL bütçe, harici ücretli API, canlı gizli anahtar veya yasal kurum onayı gerektiren maddeler.

| Faz / Alan | Alt Modül / Bileşen | Durum (Status) | Kaynak Dosyalar | Bağımlılık & Notlar |
| :--- | :--- | :--- | :--- | :--- |
| **V1-A** | Paymentless Production Core | `ACCEPTED_COMPLETE` | `services/paymentProvider.ts`, `services/tenantService.ts` | ADIM-001..021 kapsamında kabul edildi. |
| **V1-A** | Webhook Idempotency & Replay Koruması | `ACCEPTED_COMPLETE` | `supabase/functions/payment-webhook/`, `20260901_*.sql` | ADIM-003 ile tamamlandı. |
| **V1-A** | Veritabanı Hata Yönetimi & Güvenli Loglama | `ACCEPTED_COMPLETE` | `scripts/test-webhook-db-errors-and-logs.mjs` | ADIM-004 ile tamamlandı. |
| **V1-A** | Subscription Sync Fail-Closed Güvenliği | `ACCEPTED_COMPLETE` | `supabase/functions/subscription-sync/`, `20260902_*.sql` | ADIM-005 ile tamamlandı. |
| **V1-A** | Public Booking Rate-Limit & OTP Koruması | `ACCEPTED_COMPLETE` | `services/publicBookingOtpService.ts`, `20260903_*.sql` | ADIM-010 ile tamamlandı. |
| **V1-A** | Self-Service Token Brute-Force & Kriptografik Rastgelelik | `ACCEPTED_COMPLETE` | `services/appointmentSelfServiceService.ts`, `20260904_*.sql` | ADIM-012 ile tamamlandı. |
| **V1-A** | Randevu Saat Değişikliği (Reschedule) Takvim Paritesi | `ACCEPTED_COMPLETE` | `services/appointmentChangeRequestService.ts` | ADIM-013 ile tamamlandı. |
| **V1-A** | Müşteri No-Show & Risk Rozetleri | `ACCEPTED_COMPLETE` | `services/bookingAbuseProtectionService.ts`, `AppointmentCard.tsx` | ADIM-014 ile tamamlandı. |
| **V1-A** | Data Mode Çift Yönlü State Geçiş Regresyonu | `ACCEPTED_COMPLETE` | `scripts/test-v1a-data-mode-switching-regression.mjs` | ADIM-015 ile tamamlandı. |
| **V1-A** | İstemci Depolama Anahtarları Registry (storageKeys.ts) | `ACCEPTED_COMPLETE` | `services/storageKeys.ts` | ADIM-016 & ADIM-017 ile tamamlandı. |
| **V1-A** | Atomik Slug Rezervasyonu & Fallback Koruması | `ACCEPTED_COMPLETE` | `utils/slugUtils.ts`, `services/siteProvisioningService.ts`, `services/publicLinkService.ts`, `supabase/proposals/*` | PR #27'den ADIM-022 ile taşındı. |
| **V1-A** | Multi-Tenant Katalog & Availability İzolasyonu | `ACCEPTED_COMPLETE` | `services/repositories/localCatalogRepository.ts`, `services/repositories/supabaseCatalogRepository.ts`, `availabilityService.ts`, `services/repositories/localBookingRepository.ts` | Faz A2 (ADIM-023) kapsamında sıkılaştırıldı ve test edildi. |
| **V1-A** | C05 Legal, KVKK & Onay Paritesi | `ACCEPTED_COMPLETE` | `services/consentLedgerService.ts` | PR #4'ten Faz A2 (ADIM-023) ile taşındı ve test edildi. |
| **V1-A** | İzole Postgres 17 RLS & Restore-Aware Kurtarma | `PARTIAL_IMPLEMENTATION` | `scripts/verify-disposable-pg17-*.mjs`, `verify-lari-recovery-hard-gate.mjs` | Faz A3 (ADIM-024) kapsamında doğrulanacak. |
| **V1-A** | UX Boş/Hata/Yükleme Durumları & A11y | `PARTIAL_IMPLEMENTATION` | `components/SafeErrorBoundary.tsx`, UI bileşenleri | Faz A4 (ADIM-025) kapsamında tamamlanacak. |
| **V1-A** | V1-A Release Candidate (RC) Kabul Paketi & GO/NO-GO | `PARTIAL_IMPLEMENTATION` | `docs/FINAL_REAL_PILOT_READINESS_REPORT.md` | Faz A5 (ADIM-026) ile mühürlenecek. |
| **V1-B** | Sağlayıcı-Bağımsız Abonelik, Checkout, Upgrade/Downgrade | `PARTIAL_IMPLEMENTATION` | `services/subscriptionLifecycleService.ts`, `services/commercialCatalogService.ts` | Faz B1 (ADIM-027) ile genişletilecek. |
| **V1-B** | Ticari İş/Vergi Profili & Fatura Adaptörü | `PARTIAL_IMPLEMENTATION` | `services/businessProfileService.ts`, `types/commercial.ts` | Faz B2 (ADIM-028) ile eklenecektir. |
| **V1-B** | manual_active Kayıttan Çevrimiçi Aboneliğe Geçiş | `PARTIAL_IMPLEMENTATION` | `scripts/test-subscription-creation-security.mjs` | Faz B3 (ADIM-029) ile test edilecek. |
| **V1-B** | V1-B SOURCE_READY Paketi | `PARTIAL_IMPLEMENTATION` | `docs/BILLING_AND_SUBSCRIPTION_OPERATIONS.md` | Faz B4 (ADIM-030) ile belgelenecek. |
| **V1-B** | Canlı iyzico / Sanal POS Canlı API Anahtarları | `EXTERNAL_HOLD` | `.env.production` / Secret Store | 0 TL bütçe; canlı ödeme sağlayıcı anahtarı bekleniyor. |
| **V2** | UI-V2 Vitrini (`SalonWebsiteViewV2`, `?ui=v2`) | `PARTIAL_IMPLEMENTATION` | `components/SalonWebsiteViewV2.tsx`, `pages/BookingPage.tsx` | Faz C1 (ADIM-031) ile taşınacak. |
| **V2** | P2A Atomik Provisioning & Onboarding | `MISSING_IMPLEMENTATION` | `services/tenantOnboardingFlowService.ts`, `p2a_*` RPC'leri | Faz C2 (ADIM-032) ile çakışmasız taşınacak. |
| **V2** | Operasyon: Bekleme Listesi (Waitlist), Kaynak Kapasitesi | `MISSING_IMPLEMENTATION` | `services/waitlistService.ts`, `services/resourceCapacityService.ts` | Faz D1 (ADIM-033) ile entegre edilecek. |
| **V2** | POS, Envanter, Tedarikçi & Prim-Bahşiş | `MISSING_IMPLEMENTATION` | `services/posService.ts`, `services/inventoryService.ts` | Faz D2 (ADIM-034) ile entegre edilecek. |
| **V2** | Müşteri 360 CRM, Sadakat, Paket/Üyelik & Cüzdan | `MISSING_IMPLEMENTATION` | `services/customer360Service.ts`, `services/loyaltyReactivationService.ts` | Faz D3 (ADIM-035) ile entegre edilecek. |
| **V2** | Klinik & Sağlık Turizmi Dikeyleri | `MISSING_IMPLEMENTATION` | `services/clinicService.ts`, `components/clinic/*`, `components/health-tourism/*` | Faz E1 (ADIM-036) ile entegre edilecek. |
| **V2** | Keşif Pazar Yeri & Doğrulanmış Yorumlar | `MISSING_IMPLEMENTATION` | `services/discoveryMarketplaceService.ts` | Faz F1 (ADIM-037) ile entegre edilecek. |
| **V2** | Küreselleşme & Fail-Closed AI Modülleri | `MISSING_IMPLEMENTATION` | `services/currencyService.ts`, `services/clinicAiAssistService.ts` | Faz G1 (ADIM-038) ile entegre edilecek. |
| **V2** | Program V2 Güvenlik Yüzeyi & Nihai Kabul | `MISSING_IMPLEMENTATION` | `20261007_program_v2_security_surface_hardening.sql` | Faz H1 (ADIM-039) ile entegre edilecek. |
| **V2** | Canlı SMS (Netgsm) / WhatsApp Cloud API Entegrasyonu | `EXTERNAL_HOLD` | Harici SMS/WhatsApp Gateways | 0 TL bütçe; canlı SMS/WhatsApp API kredisi gerektirir. |
| **V2** | Özel Alan Adı Otomatik DNS/SSL Doğrulaması | `EXTERNAL_HOLD` | Vercel DNS / Cloudflare API | 0 TL bütçe; canlı DNS NS delegasyonu gerektirir. |
| **V2** | Klinik / Sağlık Turizmi Sağlık Bakanlığı Ruhsat & KVKK Onayı | `EXTERNAL_HOLD` | Yasal Kurum İzinleri / Ruhsatname | Yasal regülasyon ve kurum onayı gerektirir. |

---

## 4. Zaman Damgası Çakışma Haritası (Timestamp Collision Map)

### 4.1 Çakışmanın Doğası
`HEAD` dalı (`dc42a28c`) ile `72911e4` (PR #4 / Staging Release Gate) arasında kritik bir zaman damgası çakışması tespit edilmiştir. Her iki dal da `134c871` (56. migrasyon) sonrasında bağımsız olarak `20260901..20260904` zaman damgalarını farklı amaçlarla kullanmıştır:

```
                          134c871 (56. Migrasyon: 20260831_p1c_public_branch_read_contract_runtime_fix.sql)
                                     /                                                    \
                                    /                                                      \
                    HEAD (dc42a28c) [KORUNACAK ÇEKİRDEK]                         72911e4 [P2A ve V2 DALLARI]
         ----------------------------------------------------        ----------------------------------------------------
  57.    20260901_payment_webhook_idempotency_and_replay_security     20260901_p2a_atomic_tenant_provisioning_rpc
  58.    20260902_subscription_sync_transaction                      20260902_p2a_publish_commercial_contract_alignment
  59.    20260903_public_booking_ratelimit_spam_and_otp_contract      20260903_p2a_owner_onboarding_contracts
  60.    20260904_self_service_token_security_and_ratelimit         20260904_authenticated_owner_branch_mutations_rpc
```

### 4.2 Çakışma Karşılaştırma Tablosu

| Zaman Damgası | `HEAD` Dosyası (DOKUNULMAZ) | `72911e4` Dosyası (ÇAKIŞAN) | Çözüm ve Yeniden Sıralama Stratejisi |
| :--- | :--- | :--- | :--- |
| **20260901** | `20260901_payment_webhook_idempotency_and_replay_security.sql` | `20260901_p2a_atomic_tenant_provisioning_rpc.sql` | `HEAD` dosyası **değişmez**. P2A migrasyonu Faz C2'de **`20260905_p2a_atomic_tenant_provisioning_rpc.sql`** adıyla eklenecek. |
| **20260902** | `20260902_subscription_sync_transaction.sql` | `20260902_p2a_publish_commercial_contract_alignment.sql` | `HEAD` dosyası **değişmez**. P2A migrasyonu Faz C2'de **`20260906_p2a_publish_commercial_contract_alignment.sql`** adıyla eklenecek. |
| **20260903** | `20260903_public_booking_ratelimit_spam_and_otp_contract.sql` | `20260903_p2a_owner_onboarding_contracts.sql` | `HEAD` dosyası **değişmez**. P2A migrasyonu Faz C2'de **`20260907_p2a_owner_onboarding_contracts.sql`** adıyla eklenecek. |
| **20260904** | `20260904_self_service_token_security_and_ratelimit.sql` | `20260904_authenticated_owner_branch_mutations_rpc.sql` | `HEAD` dosyası **değişmez**. P2A migrasyonu Faz C2'de **`20260908_authenticated_owner_branch_mutations_rpc.sql`** adıyla eklenecek. |

### 4.3 Çakışmasız Ardışık Taşıma Kuralları
1. **HEAD Bütünlüğü:** `HEAD` içindeki 57..60. migrasyonlar (`20260901..20260904`) asla silinmeyecek, yeniden adlandırılmayacak veya içeriği bozulmayacaktır.
2. **20260905+ Ardışık Ön Ek Kuralı:** `72911e4` veya diğer tarihsel dallardan taşınacak tüm yeni migrasyonlar, `20260905` ve sonrasındaki boş zaman damgalarına ardışık olarak yerleştirilecektir.
3. **Manifest Uyumu:** Her yeni migrasyon eklendiğinde `supabase/MIGRATION_APPLY_MANIFEST.md` dosyası güncellenecek; SHA256 özetleri ve uygulama sırası kontrol edilecektir.
4. **Bütünlük Doğrulaması:** Her migrasyon eklemesi sonrası `node scripts/verify-supabase-migration-integrity.mjs` test komutu çalıştırılarak duplicate table, index, type, policy ve PCI-DSS kart saklama kontrollerinden tam geçiş (`PASS`) sağlanacaktır.

---

## 5. Değişmez Güvenlik Sınırları & Kırmızı Çizgiler

1. **PRODUCTION = NO_GO:** Üretim ortamına canlı çıkış izni (`GO`) verilmemiştir. Bu durum yalnızca insan yöneticinin açık yazılı talimatıyla değişebilir.
2. **Kritik Bayraklar:** `PAID_FALLBACK = DISABLED`, `AUTO_MERGE = DISABLED`, `NO_REMOTE_DB_WRITE`. Uzak veritabanına doğrudan yazma veya otomatik merge yasaktır.
3. **Issue #10 Bloker:** GitHub Issue #10, üretim öncesi resmi güvenlik blokeri olarak açık kalacaktır; test veya kod betikleriyle kendiliğinden kapatılamaz.
4. **Dal İzolasyonu:** Yalnızca `ci/lari-independent-acceptance-gate` dalında çalışılır. `main` veya `staging` dallarına doğrudan push kesinlikle yasaktır.
5. **0 TL Bütçe Disiplini:** Canlı SMS, WhatsApp, e-posta, ücretli LLM veya iyzico ödeme çağrısı yapılmayacaktır. Canlı ortam gereksinimleri `EXTERNAL_HOLD` olarak izole edilecektir.

---

## 6. Sonuç ve Faz A1 Kabul Kanıtı

- PR #9, #12, #14, #16, #29, #31, #33 içeriklerinin HEAD'de mevcut olduğu `git merge-base --is-ancestor` ile doğrulanmış ve mükerrer geliştirme engellenmiştir.
- PR #27 atomik slug rezervasyon geliştirmeleri (`utils/slugUtils.ts`, `services/siteProvisioningService.ts`, `services/publicLinkService.ts`, `supabase/proposals/20261030_proposed_reserve_tenant_slug_atomic_rpc.sql`) HEAD'e taşınmış ve `scripts/test-slug-regression.mjs` test paketiyle tam uyum sağlanmıştır.
- `20260901..20260904` zaman damgası çakışma haritası ve `20260905+` ardışık taşıma stratejisi netleştirilmiştir.
- Tüm alt modüller 4 kanonik durum (`ACCEPTED_COMPLETE`, `PARTIAL_IMPLEMENTATION`, `MISSING_IMPLEMENTATION`, `EXTERNAL_HOLD`) ile sınıflandırılmıştır.

---

## 7. Faz A2 (ADIM-023) Çekirdek Servis & Tenant İzolasyonu Sıkılaştırma Kanıtı (FINDING-001..008)

ADIM-023 kapsamında Denetçi (`Codex`) tarafından raporlanan tüm bulgular (Tur 1-3) cerrahi olarak çözülmüş, gerçek servislerle ve sıfır baypas ile doğrulanmıştır:

1. **FINDING-ADIM023-001 (Zorunlu Tenant Doğrulaması & Patch Fallback Yasağı):**
   - `localCatalogRepository.ts`: `getServiceById`, `updateService`, `getStaffById`, `updateStaff`, `updateAvailabilityRule` fonksiyonlarındaki unscoped storage taramaları ve fallback'ler kaldırıldı; `requireTenantId` zorunlu kılındı. `patch.tenantId` bulunsa dahi açık `tenantId` parametresi verilmediğinde fail-closed Security Error fırlatılır.
   - `supabaseCatalogRepository.ts`: `getServiceById`, `getStaffById`, `updateService`, `updateStaff`, `updateAvailabilityRule` sorgularına `tenant_id=eq.${validTenantId}` zorunluluğu eklendi. Patch içindeki `tenantId` hiçbir zaman ana fonksiyon parametresi yerine geçemez.
2. **FINDING-ADIM023-002 (Patch İçinde Tenant Değiştirilemezliği):**
   - `localCatalogRepository.ts` ve `localBookingRepository.ts`: `updateService`, `updateStaff` ve `updateAppointment` mutasyonlarında gelen patch içindeki `tenantId` yetkili `tenantId` ile uyuşmazsa `Tenant isolation violation` fırlatılır; `tenantId`, `id`, `createdAt` alanları strip edilerek eski kaydın byte-equivalent bütünlüğü korunur.
3. **FINDING-ADIM023-003 (Tenant-Owned Staff/Service & Boş/Tanımsız Eşleme Uygunsuzluğu):**
   - `availabilityService.ts`: `getAvailableSlotsForStaff` fonksiyonunda personelin ve servisin tenant'a ait olduğu katı şekilde kontrol edilir; servis bulunamazsa veya başka tenant'a aitse 30 dk varsayılan fallback kaldırıldı ve doğrudan `[]` döner.
   - `localCatalogRepository.ts`: `listStaffForService` fonksiyonunda varsayılan unmapped durum (`rawMappings === null`) veya boş (`[]`) mapping durumunda personel kesin olarak uygunsuz (`ineligible`) kabul edilir ve `[]` döner.
4. **FINDING-ADIM023-004 (Tenant-Scoped Müşteri Onayı & Fail-Closed):**
   - `consentLedgerService.ts`: `hasConsent`, `getConsentState`, `withdrawConsent` fonksiyonlarında müşteri onayları için `tenantId` zorunlu kılındı (`requireTenantId`). Tenant bağlamı verilmediğinde fail-closed olarak `false` / `null` döner, farklı tenant kayıtları birbirine karışamaz.
5. **FINDING-ADIM023-005 (Sıfır-Satır / Boş Mutasyon Koruması):**
   - `localCatalogRepository.ts`: `archiveService` ve `archiveStaff` yalnızca etkilenen bir kayıt varsa `true` döner; bulunamayan veya cross-tenant çağrılarda `false` döner.
   - `supabaseCatalogRepository.ts`: `archiveService`, `archiveStaff` ve `updateAvailabilityRule` PostgREST çağrılarına `Prefer: return=representation` başlığı eklendi; dönen dizi boşsa (`length === 0`) mutasyon başarısız kabul edilir.
6. **FINDING-ADIM023-006 (Gerçek Servislerle Doğrulama, Alt-Paket Entegrasyonu & Sıfır Baypas):**
   - `scripts/test-catalog-tenant-isolation.mjs`: `|| true` baypası kaldırıldı; 89 test kontrolü eksiksiz PASS aldı.
   - `scripts/test-availability-tenant-isolation.mjs`: Mock/kopya guard'lar yerine gerçek `availabilityService`, `LocalBookingRepository`, `LocalCatalogRepository` ve `consentLedgerService` import edilerek 62 test kontrolü eksiksiz PASS aldı.
   - `scripts/verify-phase-a-functional-acceptance.mjs`: 10 kabul senaryosuna ek olarak her iki izolasyon alt paketini (`test-catalog-tenant-isolation.mjs` ve `test-availability-tenant-isolation.mjs`) senkron alt süreç (`spawnSync`) olarak çalıştırır ve sıfır hata ile doğrular.
7. **FINDING-ADIM023-007 (Supabase Staff-Service Atama & Çapraz Tenant İzolasyonu):**
   - `supabaseCatalogRepository.ts`: `assignServiceToStaff` ve `removeServiceFromStaff` fonksiyonlarında `requireTenantId` zorunlu kılındı; işlem öncesinde personel ve servisin mevcut tenant'a ait olduğu DB okumalarıyla doğrulanır, çapraz tenant eşleşmelerinde PostgREST'e istek gitmeden hata fırlatılır. `listServicesForStaff` fonksiyonunda dönen servis kimlikleri tenant servis listesiyle filtrelenir; yabancı tenant kimlikleri budanır.
   - `scripts/test-catalog-tenant-isolation.mjs`: Mock fetch katmanında POST/PATCH/DELETE istekleri dinlenerek yetkisiz veya tenant_id eksik çağrılarda ağa 0 istek gittiği kanıtlanmıştır.
8. **FINDING-ADIM023-008 (Booking Repository Negatif Test & Değişmezlik Kapsamı):**
   - `localBookingRepository.ts`: `createAppointment`, `updateAppointment`, `cancelAppointment` fonksiyonlarında `requireTenantId` kuralı zorunlu kılındı. Tanımsız/boş tenantId doğrudan güvenlik hatası fırlatır. `createAppointment` sırasında servisin ve personelin varlığı, aktifliği, aynı tenant'a aidiyeti ve eşleme uygunluğu doğrulanır; uygunsuzluk durumunda slot ayrılmadan fail-closed kapanır.
   - `scripts/test-availability-tenant-isolation.mjs`: `createAppointment`, `updateAppointment`, `cancelAppointment` için eksik tenantId, çapraz tenant, bilinmeyen servis/personel ve yetkisiz iptal denemeleri negatif testlerle kapsanmış; randevu kaydının byte-equivalent değişmezliği teyit edilmiştir.

---

## 8. Faz A2 (ADIM-023) İleri İzolasyon ve Kapanış Kanıtı (FINDING-009..014)

1. **FINDING-ADIM023-009 (Katı Eşleme & Genel Randevu Zorunluluğu):**
   - `localBookingRepository.ts`: `createAppointment` içindeki geçici fikstür adı istisnaları (`isRegressionFixture`) tamamen kaldırıldı. Tenant adı ne olursa olsun servis-personel uygunluğu (`listStaffForService`) bulunmayan hiçbir randevu oluşturulamaz; fail-closed `Staff ineligible` hatası üretilir.
2. **FINDING-ADIM023-010 (Availability Sentetik Yardımcı Güvenliği):**
   - `availabilityService.ts`: `getNextAvailableSlotForStaff` ve `getEarliestAvailableStaff` fonksiyonlarında tenant yetkisi, servisin tenant mülkiyeti, personelin aktifliği ve açık servis-personel uygunluk eşleşmesi doğrulanır. Bilinmeyen veya çapraz kiracı kimliklerinde slot üretimi engellenir ve doğrudan `null` döner.
3. **FINDING-ADIM023-011 (Availability Kuralı Tenant/ID Değiştirilemezliği):**
   - `localCatalogRepository.ts`: `updateAvailability` fonksiyonu gelen girdideki `tenantId` uyuşmazlığını denetler ve `updateAvailabilityRule` yetkili delegasyonuyla `tenantId` ve `id` alanlarını strip ederek kaydın değişmezliğini korur.
4. **FINDING-ADIM023-012 (Yetkili Servis Süresi & Slot Çakışma Bütünlüğü):**
   - `localBookingRepository.ts`: `createAppointment` randevu süresini mutlak suretle kiracıya ait doğrulanmış katalog servisinin `s.duration` değerinden türetir. İstemciden gelen `0`, negatif, `NaN` veya tutarsız süre parametrelerinin slot çakışma korumasını baypas etmesi imkansız hale getirilmiştir.
5. **FINDING-ADIM023-013 (Patch ile Yabancı Servis/Personel Bağlama Engeli):**
   - `localBookingRepository.ts`: `updateAppointment` patch ile iletilen `serviceId` ve `staffId` değerlerini kiracı katalog kayıtları üzerinden teyit eder ve aralarındaki eşleşme uygunluğunu doğrular; yabancı veya çapraz kiracı kimliklerinin Alpha randevusuna bağlanmasını engeller.
6. **FINDING-ADIM023-014 (Eski Eşleme Anahtarlarında Çapraz Kiracı Koruması):**
   - `localCatalogRepository.ts`: `listServicesForStaff` yerel depodaki `staff_services` eşleme dizisini kiracının güncel aktif servis listesiyle kesiştirir; bozuk veya başka kiracıya ait servis kimliklerini budayarak yalnız kiracının yetkili servislerini döndürür.
7. **TypeScript Uyumluluğu:**
   - `scripts/test-availability-tenant-isolation.mjs` içindeki `.mjs` dosya tipine aykırı tüm TypeScript tip ek açıklamaları (type annotations) ve type assertion ifadeleri temizlenmiş, `npx tsc --noEmit` hatasız hale getirilmiştir.

---

## 9. Faz A2 (ADIM-023) Exact-SHA CI & Personel-Servis Uygunluk Kapanışı (FINDING-ADIM023-015)

1. **Ad-Hoc İsim Bazlı Baypasın Kaldırılması (`LocalCatalogRepository.createStaff`):**
   - `createStaff` metodundaki `Merve Hanım` ve `Ali Bey` isimlerine bağlı otomatik servis ataması tamamen kaldırıldı. Kod tabanında hiçbir personel adı istisna kabul edilmez; personel-servis uygunluğu mutlak suretle açık kiracı eşleme kaydı gerektirir.
2. **Katalog Tembel Demo Tohumlama Paritesi (`getServiceById` & `getStaffById`):**
   - `LocalCatalogRepository.getServiceById` ve `getStaffById` metotlarına tembel demo tohumlama (lazy seeding) koruması eklendi. `localStorage.clear()` sonrası doğrudan tekil sorgu yapıldığında dahi tohumlanmamış kiracılar için liste tohumlaması tetiklenerek boş/null referans hataları önlendi.
3. **Fikstür Düzeyinde Açık Eşleme Ataması:**
   - `scripts/test-public-booking-ratelimit-and-otp.mjs` (test 2.13): `localStorage.clear()` sonrasında `catalogRepo.assignServiceToStaff('staff_1', 'srv_1', 'salon-local-atom')` ile açık eşleme kuruldu.
   - `scripts/test-v1a-data-mode-switching-regression.mjs` (Bölüm 4.1 & 6.1): `createStaff` sonrasında `assignServiceToStaff` çağrısıyla açık eşleme oluşturuldu.
4. **Negatif Doğrulama Kanıtı:**
   - `scripts/test-availability-tenant-isolation.mjs` içine eklenen negatif test ile, personelin adı ne olursa olsun (`Merve Hanım` dahil) açık eşlemesi bulunmayan kiracılarda `createPublicBooking` çağrısının `temporary_failure` ile fail-closed kapandığı ve depoya 0 randevu yazdığı kanıtlandı.

---

## 10. Faz A2 (ADIM-023) Exact-SHA CI Rework Kapanışı (FINDING-ADIM023-015-REOPENED & FINDING-ADIM023-016)

1. **FINDING-ADIM023-015-REOPENED (Tenant-ID İstisnalarının Kaldırılması & Sıfır-Baypas):**
   - `services/repositories/localCatalogRepository.ts`: `createStaff` metodundan `cleanTenantId === 'tenant_pub_parity'` ve `cleanTenantId === 'tenant_v1a_reg_isolated_001'` ad-hoc istisnaları tamamen temizlendi. Personel oluşturma işleminde hiçbir kiracı adı veya kimliği için otomatik servis eşlemesi yapılmaz.
   - Personel-servis uygunluğu mutlak suretle açık `assignServiceToStaff` çağrısıyla veya çağrıcının ilettiği `serviceIds` dizisi üzerinden tesis edilir.
   - `scripts/test-v1a-data-mode-switching-regression.mjs` (test 4.1 ve 6.1) içinde `createStaff` sonrasında açık `assignServiceToStaff` çağrıları eklendi.
   - `scripts/test-catalog-tenant-isolation.mjs` içine eklenen negatif test ile, tam olarak `tenant_pub_parity` ve `tenant_v1a_reg_isolated_001` kiracıları altında oluşturulan eşlemesiz personelin randevu oluşturamadığı (`Staff ineligible`) ve `staff_services` depolama kaydının byte-identical kaldığı kanıtlandı.

2. **FINDING-ADIM023-016 (Phase F Tarayıcı Playwright Fikstür & Stage 5 Eşlemesi):**
   - `scripts/test-phase-f-browser-regression.mjs`: `SyntheticSalonFixtureService.getBrowserStorageSnapshot` tarayıcıya enjekte edilmeden önce ve Stage 5 ikinci rezervasyon akışı başlamadan önce `staff_aura_02` (Can Demir) -> `srv_aura_04` (Klasik Manikür) açık kiracı eşlemesi (`staff_services`) senkronize edildi.
   - `services/repositories/localCatalogRepository.ts:listStaffForService`: Personelin tenant kaydı üzerindeki açık `serviceIds` bilgisiyle depolanan eşlemeler uzlaştırıldı; üretim kontrolü fail-closed korunarak hem fikstür hem canlı akışlarda uyum sağlandı.

---

## 11. Faz A2 (ADIM-023) Nihai İzolasyon & Regresyon Kapanışı (FINDING-ADIM023-016-TEST-GAP, FINDING-ADIM023-017 & FINDING-ADIM023-018)

1. **FINDING-ADIM023-016-TEST-GAP (Phase F Playwright Stage 5 Gerçek Negatif Eşleme Doğrulaması):**
   - `scripts/test-phase-f-browser-regression.mjs`: Stage 5 rezervasyon öncesinde `staff_aura_02` (Can Demir) -> `srv_aura_04` (Klasik Manikür) eşlemesi tarayıcının gerçek `localStorage` alanından geçici olarak silinir; çalışma zamanında `availabilityService.getAvailableSlotsForStaff` ve `LocalCatalogRepository.listStaffForService` çağrılarak unmapped durumda personelin 0 slot ürettiği ve uygunsuz kabul edildiği kanıtlanır. Ardından eşleme depoya geri yüklenir, slotların yeniden açıldığı (>0) doğrulanır ve ikinci rezervasyon akışı UI üzerinden başarıyla tamamlanır.

2. **FINDING-ADIM023-017 (Demo Tohumlama Tenant Adı Substring Sezgisinin Kaldırılması):**
   - `services/repositories/localBookingRepository.ts`: `listAppointments` fonksiyonunda tenantId içinde `reg`, `parity`, `test`, `avail` geçmesine göre demo tohumlamayı engelleyen ad-hoc `isTestOrRegression` kontrolü tamamen kaldırıldı. Demo tohumlama davranışı yalnızca açık `hasCustomCatalog` (servis veya personel kataloğu varlığı) durumuna veya önceden tohumlanmış olma bayrağına (`tenantAppointmentsSeeded`) dayanır.
   - `scripts/test-availability-tenant-isolation.mjs`: `reg`, `parity`, `test`, `avail` içeren fakat özel kataloğu bulunmayan kiracıların sıradan kiracılar gibi 5 demo randevusu aldığı, özel katalog içeren kiracıların ise demo randevusu almayıp `[]` döndüğü negatif testlerle kanıtlandı.

3. **FINDING-ADIM023-018 (Supabase Availability Wrapper Sahte ID/Tenant Koruması):**
   - `services/repositories/supabaseCatalogRepository.ts`: `updateAvailability` fonksiyonunda gelen girdideki `tenantId` uyuşmazlığı kontrol edilir (`Tenant isolation violation`), girdiden `id` ve `tenantId` strip edilir, `updateAvailabilityRule` çalıştırıldıktan sonra yetkili taze kural `listAvailabilityRules` ile okunarak döndürülür. İstemcinin sahte `id` veya yabancı `tenantId` döndürmesi engellenmiştir.
   - `scripts/test-catalog-tenant-isolation.mjs`: Mock PostgREST üzerinde `updateAvailability` çağrısında `id` ve `tenantId` alanlarının strip edildiği, dönen nesnede özgün kural kimliğinin korunduğu ve PostgREST PATCH gövdesinde `id`/`tenant_id` bulunmadığı negatif testlerle kanıtlandı.

---

## 12. Faz A2 (ADIM-023) Phase F Playwright Kararlı Slot Seçimi & UI Paritesi (FINDING-ADIM023-019)

1. **FINDING-ADIM023-019 (Geri Yüklenen Uygunluk Eşlemesinden Üretilen Gerçek Slotun Kararlı Seçimi):**
   - `scripts/test-phase-f-browser-regression.mjs`: Stage 5 rezervasyon akışında sabit `button:has-text("09:"), button:has-text("10:"), ...` seçicisi kaldırıldı. Geri yüklenen eşleme sonrasında `availabilityService.getAvailableSlotsForStaff` tarafından doğrulanan `candidateSlotTimes` (`restoredSlots`) zamanları kullanılarak, UI'ın tarih/hizmet/personel güncellemesi sonrasındaki kararlı ve etkin (`:not([disabled])`) slot düğmeleri dinamik olarak beklenir ve seçilir.
   - Slot seçiminden önce tarih seçiminin React durumuna yansıdığı (`label:has-text("${targetDateStr}")`) ve slot düğmesinin `candidateSlotTimes` listesinde bulunduğu doğrulanır; böylece re-render yarışları ve geçici/eksik slot DOM uyuşmazlıkları fail-closed biçimde çözülmüştür.

---

## 13. Faz A2 (ADIM-023) Üretim Randevu İptal / Silme Sözleşme Bütünlüğü (FINDING-ADIM023-008-REOPENED & FINDING-ADIM023-020)

1. **FINDING-ADIM023-008-REOPENED (`appointmentService.updateAppointmentStatus` Tenant Delegasyonu):**
   - `services/appointmentService.ts`: `updateAppointmentStatus` fonksiyonu içindeki `cancelAppointment` ve `updateAppointment` repository çağrılarına yetkili `tenantId` argümanı aktarıldı; `getAppointmentById` referral okuma yolu da `tenantId` ile sınırlandırıldı.
   - `scripts/verify-phase-a-functional-acceptance.mjs` (Senaryo 5): Doğrudan repository çağrısı yerine üretim `updateAppointmentStatus` yolu geri yüklendi; boş/eksik/yanlış `tenantId` negatif testleri ve yetkili `tenantId` iptal doğrulaması eklendi.
2. **FINDING-ADIM023-020 (`appointmentService.deleteAppointment` Tenant Delegasyonu):**
   - `services/appointmentService.ts`: `deleteAppointment(tenantId, appointmentId)` fonksiyonu, aldığı yetkili `tenantId` parametresini `cancelAppointment(appointmentId, 'Deleted', 'system', tenantId)` çağrısına 4. argüman olarak iletecek şekilde güncellendi.
   - `scripts/verify-phase-a-functional-acceptance.mjs` (Senaryo 5) ve `scripts/test-availability-tenant-isolation.mjs` (§5.4): Gerçek `deleteAppointment` üretim yolunda boş, tanımsız ve yanlış `tenantId` çağrılarının hiçbir kaydı değiştirmeden (byte-equivalent korunarak) fail-closed hata verdiği, yetkili `tenantId` çağrısının ise başarılı olup randevuyu `cancelled_by_system` durumuna geçirdiği ve slotu serbest bıraktığı doğrulandı.




