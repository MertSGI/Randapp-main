# LARİ Nihai V1 -> V1-B -> V2 Kaynak Kabul Paketi (Final Acceptance Package)

**Belge Kimliği:** `LARI-DOC-FINAL-V1-V2-ACCEPTANCE-20261116`  
**Referans Adımlar:** `ADIM-039` (`Faz H1`), `ADIM-040` (`Faz I1`), `ADIM-041` (`Faz I2: ADIM-041C Staging Aktivasyonu`) & `ADIM-042` (`Faz I3: Issue #10 DR Kanıtı`)  
**Kaynak Aday Dalı & Kabul SHA (`ADIM-039`):** `ci/lari-independent-acceptance-gate` @ `66371ce230b0136c5e86f3f9f33aeefe6ea49bb8` *(Base: `d7f1f5fdfeb942b699ba937bdc3b769804c73d09`)*  
**Kanonik Staging Dalı & PR #34 Merge SHA (`ADIM-040`):** `staging/supabase-staging-consistency` @ `29c75164313114f306f49fcf05682aeb83eb1532` *(Önceki hedef: `2c6a99b0b92ecea4f324c7195b3222f92688f294`; [`PR #34`](https://github.com/MertSGI/Randapp-main/pull/34) insan onayıyla `2026-11-16T14:06:22Z` tarihinde manuel birleştirildi)*  
**Kanonik Uzlaştırma Kaydı:** [`docs/LARI_CANONICAL_BRANCH_RELEASE_RECORD.md`](LARI_CANONICAL_BRANCH_RELEASE_RECORD.md) *(Salt-dokümantasyon PR #2 mühürlemesi; döngüsel SHA referansı içermez)*  
**Issue #10 DR Kanıt Paketi (`ADIM-042`):** [`docs/LARI_ISSUE_10_DR_ATTESTATION.md`](LARI_ISSUE_10_DR_ATTESTATION.md)  
**Nihai Kaynak Durumu:** **`SOURCE_CANDIDATE_COMPLETE`** *(Kesinlikle `PRODUCTION_READY` değildir)*  
**Resmi Canlı Kesim Kararı:** **`PRODUCTION = NO_GO`**  
**Açık Üretim Blokeri:** **GitHub Issue #10 (`OPEN / RED / BLOCKED` — `HOLD_PRESERVED / CHECKLIST_INCOMPLETE`)**  
**Güncelleme Tarihi:** 19 Kasım 2026

---

## 1. Yönetici Özeti ve Resmi Mühür Beyanı

Bu belge, **LARİ (`randevulari.com`)** platformunun **V1-A (Ödemesiz Çekirdek) -> V1-B (Ticari & Sağlayıcı-Bağımsız Abonelik Hazırlığı) -> V2 (UI-V2, P2A Onboarding, Operasyon, POS/Envanter, CRM360/Sadakat/Cüzdan, Klinik & Sağlık Turizmi, Keşif Pazar Yeri, Küreselleşme & Fail-Closed AI)** uzun soluklu programının **Faz A–H** geliştirme ve güvenlik sertleştirme döngüsünün nihai kaynak bütünleştirme paketidir.

### 1.1. Değişmez Güvenlik ve Yönetişim Sınırları

| Kontrol / Kırmızı Çizgi | Durum | Bağlayıcı Açıklama |
| :--- | :---: | :--- |
| **Nihai Kaynak Durumu** | `SOURCE_CANDIDATE_COMPLETE` | Tüm kaynak kod, 99 SQL migrasyonu (`20261117033457` dahil), tip güvenliği, birim/entegrasyon testleri ve yerel PG17 doğrulamaları tamamlanmıştır; canlı altyapı ve dış sağlayıcı geçişi Faz I insan kapısına devredilmiştir. |
| **Canlı Kesim Kararı** | `PRODUCTION = NO_GO` | GitHub Issue #10 insan onayıyla kapatılmadan ve Faz I4–I6 (`ADIM-043..045`) dış sağlayıcı/UAT kapıları tamamlanmadan canlı üretim yasaktır. |
| **`PAID_FALLBACK`** | `DISABLED` | Ödemesiz/yerel modlarda veya istemci durumunda otomatik ücretli abonelik, AI sağlayıcı fallback'i veya tahsilat açılamaz. |
| **`AUTO_MERGE`** | `DISABLED` | `main` veya `staging` dallarına otomatik birleştirme yapılmaz (`ADIM-040` insan onaylı PR uzlaştırması gerekir). |
| **`NO_REMOTE_DB_WRITE`** | `TRUE (RE-LOCKED)` | Genel otonom uzak yazma yasaktır (`ADIM-041C` yalnızca `2026-11-16T19:46:33+03:00` tarihli tek seferlik kullanıcı yetkisiyle `lari-staging` ref `rwedeejhjazwjthdjzrt` üzerinde uygulanmış ve işlem sonunda `NO_REMOTE_DB_WRITE` kilidi yeniden devreye alınmıştır; `ADIM-042` DR tatbikatı `READ-ONLY` yürütülmüştür). |
| **GitHub Issue #10** | `OPEN / RED / BLOCKED` (`HOLD_PRESERVED`) | İzole PG 17.12 mantıksal SQL geri yükleme (`10.063 sn`, `18/18` seçili tablo satır paritesi; ek tam tablo denetimiyle `120/120` `public` tablo/grant paritesi), sahip tarafı `age` deşifre makbuzu (`HOLD-042-01 KAPALI` — `39959869290-local-recovery-receipt.json`, `38b5dbfd...`, `11` dosya SHA-256 doğrulandı), canlı staging Docker (`supabase/postgres:17.6.1.141`) üzerinde `7/7` katalog eşleşmesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02` teknik kanıtı tamam — Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) @ `cea570eb`, Artifact `14468557307`), izole PG17 7/7 katalog parity kapısı, PG-dışı kurtarma kapsamı, release-enforcement bypass reddi ve rollback planı tamamlanmıştır; ancak `HOLD-042-03` (exact aday SHA CI'ı, yeni artifact offsite muhafazası ve sahip + Controller nihai imzaları) henüz tamamlanmadığı için Issue #10 kapatılmaz ve `HOLD` korunur (`docs/LARI_ISSUE_10_DR_ATTESTATION.md`). |
| **Bütçe & Harcama Sınırı** | `0 TL` | Canlı iyzico tahsilatı, canlı SMS/WhatsApp/e-posta gönderimi ve ücretli LLM/Gemini API çağrısı yapılmamıştır. |
| **Marka & Alan Adı** | `LARİ` / `randevulari.com` | Görünür marka **LARİ** ve Türkiye alan adı stratejisi **`randevulari.com`** korunmuştur. |

---

## 2. Faz A–H Program Tamamlanma Matrisi

| Faz / Adım | Kapsam ve Sorumluluk | Durum | Kabul Commit SHA | Öne Çıkan Mimari ve Güvenlik Çıktıları |
| :--- | :--- | :---: | :---: | :--- |
| **Pilot 3 (`ADIM-001..008`)** | V1 Kaynak Kabulü & Çekirdek Güvenlik | `PASS` | `acaf0fcf` | iyzico webhook idempotency (`20260901`), atomik subscription sync (`20260902`), PII log temizliği, fail-closed sınırlar. |
| **Pilot 4 (`ADIM-009..010`)** | Tailwind Yerel Build & Public OTP/Rate-Limit | `PASS` | `a0e064dc` | Harici Tailwind CDN kaldırıldı (`postcss`/Vite); public booking rate-limit ve tek kullanımlık OTP sözleşmesi (`20260903`). |
| **Pilot 5 (`ADIM-011..021`)** | V1-A Kaynak Hazırlığı & Preflight Chaos | `PASS` | `dc42a28c` | Self-service token brute-force koruması (`20260904`), `storageKeys.ts` merkezileştirmesi, cross-tenant izolasyon, 50-paralel yarış testi, kaos outbox. |
| **Faz A (`ADIM-022..026`)** | V1-A Release Candidate (RC) Mühürleme | `PASS` | `3b8ee1fa` | PR #27/#4 uzlaştırma envanteri (`c3383616`), tenant izolasyonu (`31c5d15d`), PG17 restore-aware hard-gate (`b1279d80`), UX/a11y (`fd453ed8`), `V1A_RELEASE_CANDIDATE_ACCEPTANCE.md` (`3b8ee1fa`). |
| **Faz B (`ADIM-027..030`)** | V1-B `SOURCE_READY` & `EXTERNAL_HOLD` | `PASS` | `b4b8d1c4` | Sağlayıcı-bağımsız checkout/iade/mutabakat (`59a5b854`), VKN/TCKN & fatura adaptörü fail-closed (`746fb3fa`), `manual_active` -> online geçiş (`474a28c7`), `V1B_SOURCE_READY_REPORT.md` (`b4b8d1c4`). |
| **Faz C1 (`ADIM-031`)** | UI-V2 Vitrini & `?ui=v2` Yönlendirme | `PASS` | `dbff595e` | `SalonWebsiteViewV2.tsx`, V1 varsayılan rotalarını bozmadan `?ui=v2` seçimi ve izole Chromium E2E (`test-ui-v2-booking-e2e.mjs`). |
| **Faz C2 (`ADIM-032`)** | P2A Atomik Onboarding & Çakışmasız Port | `PASS` | `93362811` | `tenantOnboardingFlowService.ts` ve `20260905..20260908` çakışmasız P2A RPC migrasyonları (`tenant_owner` + `active=true` yetki denetimi). |
| **Faz D1 (`ADIM-033`)** | V2 Takvim, Waitlist, Kaynak Kapasitesi & Analitik | `PASS` | `ed996149` | `bookingInterval`, `DeterministicTestCalendarProvider`, `20260909..20260915` (kaynak kilidi, fenced background job, rol/şube kapsamlı analitik, `custom_domains` `EXTERNAL_HOLD`). |
| **Faz D2 (`ADIM-034`)** | V2 POS, Envanter, Tedarikçi/PO & Prim-Bahşiş | `PASS` | `e46c104d` | `20260916..20260919`, `posInventoryService.ts`, `/admin/pos`, order advisory lock, payload-verified idempotency, DB seviyesinde `card_terminal_adapter`/`customer_wallet` `EXTERNAL_HOLD` reddi. |
| **Faz D3 (`ADIM-035`)** | V2 Müşteri 360 CRM, Sadakat, Paket & Cüzdan | `PASS` | `443ce491` | `20260920..20260926`, `customer360Service`, `loyaltyReactivationService`, append-only defterler, `service_role`-only puan mutasyonu, sıfır `localStorage` bakiye yazımı. |
| **Faz E1 (`ADIM-036`)** | Dikey Çekirdek, Klinik & Sağlık Turizmi | `PASS` | `6824aa81` | `20260927..20261007`, `verticalCommercialService`, `clinicService`, `healthTourismService`, PHI koruması, `ht_leads` pasaport izolasyonu, KVKK/sağlık mevzuatı `EXTERNAL_HOLD`. |
| **Faz F1 (`ADIM-037`)** | Keşif Pazar Yeri, Doğrulanmış Yorumlar & Favoriler | `PASS` | `46c8562f` | `20261008..20261010`, `discoveryMarketplaceService`, V1 `/#/s/:slug` vitrin bağımsızlığı, tamamlanmış-randevu/token doğrulamalı yorum yazımı. |
| **Faz G1 (`ADIM-038`)** | Küreselleşme, Fail-Closed AI & 3-Kademeli Durum | `PASS` | `d7f1f5fd` | `marketConfigService`, `currencyService` (desteklenmeyen kur fallback'i), `adminFeatureAvailabilityService` (3 kademe), `clinic-ai-*` ve `ht-ai-chat` sunucu `LIVE_ENABLED` kapıları (`DISABLED_EXTERNAL_HOLD`). |
| **Faz H1 (`ADIM-039`)** | Program V2 Güvenlik Yüzeyi & Nihai Kabul Paketi | `PASS` | `66371ce2` | `20261011_program_v2_security_surface_hardening.sql` & `20261012_appointment_access_tokens_table_access_hardening.sql` (`72911e4:20261007/20261011` eşdeğeri), 98-migrasyon PG17 replay & pristine restore doğrulaması (`10/10 PASS`) ve bu kabul paketi. |
| **Faz I1 (`ADIM-040`)** | Kanonik Branch & Staging PR Uzlaştırması | `PR #1 MERGED` *(PR #2 doc-only mühürleme)* | `29c75164` *(PR #34 merge)* | `ci/lari-independent-acceptance-gate@66371ce2` → `staging/supabase-staging-consistency@2c6a99b0` [`PR #34`](https://github.com/MertSGI/Randapp-main/pull/34) insan incelemesi ve `AUTO_MERGE = DISABLED` ile birleştirildi (`2026-11-16T14:06:22Z`); CI run'lar `43870002466`, `43872084503`, `43872084917` doğrulandı ve `docs/LARI_CANONICAL_BRANCH_RELEASE_RECORD.md` mühürlendi. |
| **Faz I2 (`ADIM-041`)** | Gerçek `lari-staging` (`ADIM-041C`) Uzlaştırması | `PASS` *(Koşullu Tek Sefer)* | `e9c2da1b` | Kullanıcı onaylı `ADIM-041C` (`20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql`, SHA-256 `7ced58f3...`) `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde tek transaction'da uygulandı (`80` `schema_migrations`, 4 remote-only korundu, `120` tablo, `236` app func, P0 PostgREST `401`). |
| **Faz I3 (`ADIM-042`)** | GitHub Issue #10 DR Restore Kanıtı & Kontrat Hizalaması | `HOLD` *(HOLD-042-01 Kapalı; HOLD-042-02 Bulut 7/7 & HOLD-042-03 İmza Bekliyor)* | `—` *(ayrı doküman teslimi)* | `lari-staging` post-`041C` salt-okunur 7 parçalı yedek (`92,796 ms`) Git dışı saklanıp izole PG 17.12'ye geri yüklendi (`10.063 sn` / `10,063 ms`, `18/18` seçili tablo + `120/120` `public` tablo satır/grant/rutin paritesi, `80/80` migrasyon, `5/5` `DENIED_42501`); sahip tarafı `age` deşifre makbuzu (`HOLD-042-01 KAPALI`, `39959869290-local-recovery-receipt.json`) Controller tarafından kabul edildi. Yerel PG17 7/7 katalog parity (`6/6` negatif) + release-enforcement bypass reddi (`22/22`), PG-dışı kapsam ve rollback planı eklendi. Staging üzerinde `7/7` bulut paritesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02`, düzeltme PR #35'te Linux CI'dan geçti) ve imzalar (`HOLD-042-03`) eksik olduğundan Issue #10 kapatılmaz (`HOLD_PRESERVED`). |

---

## 3. Program V2 Güvenlik Yüzeyi Sertleştirmesi (`ADIM-039` / `20261011..20261012`)

Tarihsel V2 dalındaki (`72911e4`) `20261007_program_v2_security_surface_hardening.sql` ve `20261011155623_appointment_access_tokens_table_access_hardening.sql` sertleştirmeleri, `HEAD` içindeki `20260901..20261010` zinciriyle çakışmayan ardışık ön eklerle sisteme dahil edilmiştir:

1. **`20261011_program_v2_security_surface_hardening.sql` (`72911e4:20261007` eşdeğeri):**
   * **Finding S-01 (`public.ht_rate_limit_buckets`):** `PUBLIC`, `anon` ve `authenticated` rollerinin tüm doğrudan tablo yetkileri geri alınmış (`REVOKE ALL`), RLS etkinleştirilmiş, yalnızca `service_role` ve `postgres` yetkili bırakılmıştır.
   * **Finding S-02 (`public.get_user_role(uuid)`, `public.get_user_tenant_id(uuid)`):** `SET search_path = pg_catalog, public` sabitlenmiş; `PUBLIC` ve `anon` `EXECUTE` yetkileri kaldırılmış; yalnızca `authenticated` ve `service_role` rollerine `EXECUTE` verilmiştir.
   * **Finding S-03 (`public.is_super_admin(uuid)`):** `SET search_path = pg_catalog, public` sabitlenmiş, `active = true` koşulu eklenerek pasif profillerin süper yönetici yetkisi alması engellenmiş, `PUBLIC` ve `anon` `EXECUTE` yetkileri kaldırılmıştır.
   * **Finding S-04 (Tetikleyici Yardımcıları):** `public.update_updated_at_column()` ve `public.update_tenant_business_profiles_updated_at_column()` fonksiyonları `SET search_path = pg_catalog, public` ile sertleştirilmiştir.
2. **`20261012_appointment_access_tokens_table_access_hardening.sql` (`72911e4:20261011155623` eşdeğeri):**
   * `public.appointment_access_tokens` tablo kimliği (`postgres` sahipliği, RLS açık, 7 kanonik sütun) ön-denetimle doğrulanır.
   * Legacy açık politika `"Allow public select by token hash"` (`USING (true)`) kaldırılır ve `PUBLIC` / `anon` rollerinin tüm doğrudan tablo yetkileri (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) geri alınır.
   * Müşteri self-servis akışları yalnızca `SECURITY DEFINER` token RPC'leri (`get_public_appointment_by_manage_token`, `cancel_public_appointment_by_manage_token`, `request_public_appointment_reschedule_by_manage_token`, `get_public_pending_reschedule_request_by_manage_token`, `create_verified_review_by_manage_token`, `get_fast_rebooking_seed_by_manage_token`) üzerinden çalışmaya devam eder.
   * **Not (Issue #10 Ayrımı):** `ADIM-041C` (`20261117033457`) ile bu P0 sertleştirmesi tek seferlik kullanıcı yetkisi altında `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde uygulanmış; `ADIM-042` kapsamında izole PG 17.12 mantıksal geri yüklemesi, `HOLD-042-01` sahip `age` deşifre makbuzu (`38b5dbfd...` — `KAPALI`), izole PG17 7/7 katalog parity ve release-enforcement bypass reddi doğrulanmıştır. Ancak canlı staging üzerinde bulut `7/7` katalog eşleşmesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02`) ve sahip + Controller imzaları (`HOLD-042-03`) tamamlanmadığı için **GitHub Issue #10 açık üretim blokeri (`OPEN / RED / BLOCKED — HOLD`) olarak kalır**.

---

## 4. Tam Kanonik Veritabanı Migrasyon Haritası (99 Adet SQL Migration)

`supabase/migrations/` dizinindeki tüm aktif migrasyonlar kronolojik sıradadır. `20260526_initial_schema.sql` dosyası `/supabase/archive/` altında arşivli tutulmaktadır.

### 4.1. V1-A Çekirdek ve Güvenlik Zinciri (1–56 Kanonik + 57–60 Aday — Değiştirilmez)

| Sıra | Dosya Adı | Sorumluluk / Kapsam |
| :---: | :--- | :--- |
| 1–5 | `001_initial_schema.sql` .. `005_salon_business_profile.sql` | Çekirdek tablolar (`tenants`, `users_profile`, `staff`, `services`, `customers`, `appointments`, `subscriptions`, `payments`), onboarding ve işletme profili. |
| 6–10 | `20260601` .. `20260622` | Çekirdek şema hizalaması, konsolide RLS, ödemesiz üretim çekirdek tabloları (`appointment_access_tokens`, `communication_outbox`, `audit_events`, `consent_ledger`, `policy_acceptances`, `data_rights_requests`) ve `users_profile` RLS kimlik modeli. |
| 11–16 | `20260713` .. `20260722` | `communication_outbox` & `tenants` RLS sertleştirmesi, `approve_and_publish_tenant`, `can_accept_public_booking` / `create_public_booking` ve `search_path` düzeltmesi. |
| 17–23 | `20260723` .. `20260729` | `branches`, `staff_branches`, `service_branches`, `evaluate_booking_slot`, `get_my_admin_bootstrap`, `get_my_tenant_appointments`, ACL ve şema kontrat onarımları. |
| 24–34 | `20260730` .. `20260809` | Self-servis token okuma/iptal/erteleme RPC'leri, `appointments` doğrudan `UPDATE` kilidi (`20260804`), yönetici durum & erteleme karar RPC'leri. |
| 35–46 | `20260810` .. `20260821` | Stage H1A–H1D ticari katalog, versiyonlanmış planlar, kota denetimi (`usage_counters` değişmezi), kısıtlamalar ve idempotency/audit hizalaması. |
| 47–56 | `20260822` .. `20260831` | Stage H1E yayın kontrolü (`platform_global_release_control`), pilot yetkilendirme geçmişi, yayın fazı geçiş kilidi ve `get_public_branches`. |
| 57 | `20260901_payment_webhook_idempotency_and_replay_security.sql` | `CANDIDATE ONLY` — Ödeme webhook idempotency ve replay koruması. |
| 58 | `20260902_subscription_sync_transaction.sql` | `CANDIDATE ONLY` — Atomik abonelik eşitleme (`fail-closed`). |
| 59 | `20260903_public_booking_ratelimit_spam_and_otp_contract.sql` | `CANDIDATE ONLY` — Public booking sunucu rate-limit, spam koruması ve tek kullanımlık OTP sözleşmesi. |
| 60 | `20260904_self_service_token_security_and_ratelimit.sql` | `CANDIDATE ONLY` — Self-servis token brute-force kilidi (5 deneme / 15 dk), SHA-256 eşleme ve sıfır PII sızıntısı. |

### 4.2. V2 Çakışmasız Uzlaştırma & Staging İleri Eşitleme Zinciri (61–99: `20260905..20261117033457`)

| Sıra | Dosya Adı | Kaynak (`72911e4`) | Faz / Kapsam |
| :---: | :--- | :--- | :--- |
| 61–64 | `20260905_p2a_atomic_tenant_provisioning_rpc.sql` .. `20260908_authenticated_owner_branch_mutations_rpc.sql` | `20260901..20260904` | **Faz C2 (P2A):** Atomik tenant provizyonu, yayın ticari sözleşme hizalaması, owner onboarding RPC'leri ve şube mutasyon RPC'leri. |
| 65–71 | `20260909_phase2_staff_scheduling_foundation.sql` .. `20260915_phase5_scheduling_buffer_parity_hardening.sql` | `20260916,17,20,22,23,29` | **Faz D1:** Mola/izin/tatil/tampon kuralları, bekleme listesi (`ht_rate_limit_buckets`, `booking_waitlist`), arka plan iş kuyruğu (`FOR UPDATE SKIP LOCKED`), kaynak kapasitesi (`create_public_booking` 15-arg korunarak), analitik ve `custom_domains` (`EXTERNAL_HOLD`). |
| 72–75 | `20260916_phase6_product_inventory_foundation.sql` .. `20260919_phase6_node4_staff_commissions_tips.sql` | `20260930..20261003` | **Faz D2:** Ürün kataloğu, şube envanter defteri, tedarikçi/PO mal kabulü, karma sepet POS checkout ve personel prim/bahşiş defteri. |
| 76–82 | `20260920_phase3_communications_foundation.sql` .. `20260926_phase4_giftcards_wallet_foundation.sql` | `20260918,19,21,24,25,26` | **Faz D3:** İletişim outbox/callback (`NO_NETWORK_SEND`), sağlayıcı-bağımsız `payment_intents`, Customer 360 segmentasyonu, depozito/no-show, sadakat/reaktivasyon, paket/üyelik, hediye kartı ve cüzdan defterleri. |
| 83–93 | `20260927_commercial_lifecycle_eligibility_alignment.sql` .. `20261007_phase5_ht_treatment_journey_quote_itinerary.sql` | `20260905..20260928` | **Faz E1:** Ticari yaşam döngüsü hizalaması, Klinik alan otoritesi & append-only notlar, Sağlık Turizmi lead/AI/klinik kabulü, dikey SKU'lar (`clinic_*`, `ht_*`) ve tedavi yolculuğu/teklif/itinerary RPC'leri. |
| 94–96 | `20261008_phase7_node1_verified_reviews_foundation.sql` .. `20261010_phase7_node3_favorites_fast_rebooking.sql` | `20261004..20261006` | **Faz F1:** Doğrulanmış yorumlar (`reviews`), Keşif Pazar Yeri projeksiyonları, müşteri favorileri ve hızlı yeniden randevu tohumu. |
| 97 | `20261011_program_v2_security_surface_hardening.sql` | `20261007` | **Faz H1 (`ADIM-039`):** `ht_rate_limit_buckets` kilidi ve `get_user_role` / `get_user_tenant_id` / `is_super_admin` / trigger `search_path = pg_catalog, public` sertleştirmesi. |
| 98 | `20261012_appointment_access_tokens_table_access_hardening.sql` | `20261011155623` | **Faz H1 (`ADIM-039`):** `appointment_access_tokens` doğrudan `PUBLIC`/`anon` erişiminin ve açık `"Allow public select by token hash"` politikasının kaldırılması. |
| 99 | `20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql` | `ADIM-041C` | **Faz I2 (`ADIM-041`):** Uzaktaki 4 `20261008*` kaydını ve legacy runtime nesnelerini koruyarak `lari-staging` şemasını `local_98` + `consent_ledger`/`policy_acceptances` P0 RLS sertleştirmesiyle ileri yönde eşitler. |

Tam liste ve tablo sahiplik haritası `supabase/MIGRATION_APPLY_MANIFEST.md` dosyasında güncel olarak tutulmaktadır.

---

## 5. 3-Kademeli Özellik Durumu ve `EXTERNAL_HOLD` Envanteri

`services/adminFeatureAvailabilityService.ts` üzerindeki 3 kademeli dürüst durum modeli ve sıfır bütçe sınırları korunmaktadır:

| Kademe | Özellik / Modül Grubu | Durum ve Sınır |
| :--- | :--- | :--- |
| **`LIVE_ACTIVE`** | Çekirdek Randevu, Çoklu Şube, Self-Servis Token (İptal/Erteleme), Ticari Plan/Kota Kapıları, UI-V2 (`?ui=v2`), P2A Onboarding, Takvim/Waitlist/Kaynak Kapasitesi, Analitik, POS/Envanter/PO/Prim (Nakit/Harici), CRM 360/Sadakat/Paket/Cüzdan (Dahili Defter), Klinik & Sağlık Turizmi Çekirdek İş Akışları, Keşif Pazar Yeri & Doğrulanmış Yorumlar, TR/Global Pazar & Kur Biçimlendirme | Kaynak kod ve izole PG17 sözleşmeleri tamdır; canlı yayın kararı `PRODUCTION = NO_GO` nedeniyle operatör fazına tabidir. |
| **`LOCAL_OR_SANDBOX_ONLY`** | Yerel Demo Modu (`VITE_DATA_MODE=local`), Deterministik Test Sağlayıcıları (`DeterministicTestPaymentProvider`, `DeterministicTestCalendarProvider`, `DeterministicTestCommunicationProvider`), Sentetik Salon ve İletişim Outbox (`synthetic_outbox_only`) | Sıfır ağ çıkışı ve sıfır maliyetle yerel/CI/staging provasında çalışır; canlı üretim yetkisi üretmez. |
| **`DISABLED_EXTERNAL_HOLD`** | Canlı iyzico Ödeme & Abonelik Tahsilatı, Fiziksel POS Kart Terminali (`card_terminal_adapter`), Müşteri Cüzdanından POS Tahsilatı (`customer_wallet`), Canlı SMS (Netgsm/Twilio), Canlı WhatsApp Cloud API, Canlı E-posta (Resend/SMTP), Otomatik e-Fatura/e-Arşiv Adaptörü, Canlı Gemini/OpenAI/Groq AI (`CLINIC_AI_LIVE_ENABLED`, `HT_AI_CHAT_LIVE_ENABLED`, `PAID_FALLBACK=DISABLED`), Canlı Harici Takvim OAuth (Google/Apple/Microsoft), Özel Alan Adı Canlı DNS/SSL Doğrulaması (`DOMAIN_PROVIDER_READY_NOT_CONNECTED`), KVKK Özel Nitelikli Veri / Sağlık Bakanlığı / TÜRSAB Ruhsat Onayları, Uzak Cloud Supabase & PG17 DR Restore | İlgili sunucu aktivasyon bayrakları, canlı sırlar ve yasal/operasyonel onaylar sağlanana kadar `fail-closed` kilitlidir. |

### 5.1. `EXTERNAL_HOLD` Anahtar ve Kurumsal Gereksinim Listesi

1. **Veritabanı & Felaket Kurtarma (GitHub Issue #10):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (yalnız sunucu/Edge) ve uzak PG17 yedek/geri yükleme yeterlilik raporu.
2. **Ödeme & e-Fatura:** `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, `IYZICO_PLAN_*_REF`, webhook HMAC doğrulaması (`/functions/v1/payment-webhook`), e-Fatura/e-Arşiv entegratör API anahtarları ve şirket/vergi mükellefiyeti.
3. **Kurumsal İletişim:** Netgsm/Twilio SMS API kimliği ve onaylı başlık; Meta WhatsApp Business Cloud API WABA/token ve onaylı şablonlar; Resend/SMTP kimlik bilgileri ile `randevulari.com` SPF/DKIM/DMARC DNS kayıtları.
4. **Yapay Zeka (0 TL & `PAID_FALLBACK=DISABLED`):** Sunucu tarafı `GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` ve açık aktivasyon bayrakları (`CLINIC_AI_LIVE_ENABLED=true`, `HT_AI_CHAT_LIVE_ENABLED=true`). İstemci tarafında `VITE_GEMINI_API_KEY` veya gizli anahtar bulunması yasaktır.
5. **Alan Adı & Altyapı:** `randevulari.com` + `*.randevulari.com` wildcard DNS/TLS, custom domain CNAME/TXT doğrulama sağlayıcısı ve Vercel üretim dağıtım ortam değişkenleri.
6. **Mevzuat & Dikey Ruhsatlar:** KVKK aydınlatma/açık rıza metinlerinin hukuk onayı, klinik özel nitelikli sağlık verisi (ÖNSV) mevzuat uyumu ve sağlık turizmi aracı kuruluş yetki/ruhsat doğrulaması.

---

## 6. Doğrulama Sınırı ve Test Kanıtları

Bu raporda **önceki kabul edilmiş Faz A–G adımlarının tarihsel kanıtları**, **`ADIM-039` (`66371ce2`) 10/10 kabul kapısı ile `ADIM-040` PR #34 CI kanıtları** ve **teslim sonrası `loop.py` `TESTING` evresinde senkron koşulacak salt-dokümantasyon doğrulama kapısı** birbirinden dürüstçe ayrılmıştır.

### 6.1. Önceki Kabul Edilmiş Adımların Kanıt Özeti (`ADIM-001..038` — Tarihsel Kabul)

* `ADIM-026` (`3b8ee1fa`): `V1A_RELEASE_CANDIDATE_ACCEPTANCE.md` mühürlendi; `tsc`, `build`, `verify-paymentless-production-go-no-go-readiness.mjs` ve `verify-supabase-migration-integrity.mjs` PASS.
* `ADIM-030` (`b4b8d1c4`): `V1B_SOURCE_READY_REPORT.md` mühürlendi; `check-payment-env.mjs`, `test-check-payment-env.mjs`, `scan-frontend-secrets.mjs`, `verify-iyzico-sandbox-readiness.mjs` ve `verify-commercial-packaging-readiness.mjs` PASS.
* `ADIM-031..037` (`dbff595e..46c8562f`): UI-V2 Playwright E2E, P2A onboarding, Faz D1/D2/D3/E1/F1 disposable PG17 replay ve davranışsal `.test.ts`/`.test.tsx` paketleri PASS.
* `ADIM-038` (`d7f1f5fd`): `verify-market-global-readiness.mjs` + `.test.mjs`, `currencyService.test.ts`, `marketConfigService.test.ts`, `adminFeatureAvailabilityService.test.ts`, `geminiService.test.ts`, `clinicAiAssistService.test.ts`, `healthTourismAiService.test.ts` ve `ht-ai-chat/provider-policy.test.ts` PASS.

### 6.2. `ADIM-039` (`66371ce2`) Oturumunda Doğrudan Gözlenen Tarihsel Çıktılar (`ADIM-041C` 99. Migrasyon Öncesi 98 Repo Migrasyonu & PG17)

1. **`node scripts/verify-supabase-migration-integrity.mjs` (`Exit Code: 0`):** 98 aktif migrasyon, arşiv dışı `20260526`, `communication_outbox` RLS sertleştirmesi, Program V2 (`20261011`/`20261012`) güvenlik yüzeyi ve PCI-DSS/secret taramaları PASS.
2. **`node scripts/verify-supabase-staging-consistency.mjs` (`Exit Code: 0`):** `56 canonical + 4 candidate + 38 V2 = 98` migrasyon envanteri, `MIGRATION_APPLY_MANIFEST.md` tam eşleşmesi, tenant UUID, `super_admin` (`NULL` tenant), `tenant_owner` rol tutarlılığı ve güvenlik denetimleri (`43/43` check) PASS.
3. **`node scripts/verify-disposable-pg17-pristine-restore.mjs` (`LARI_REQUIRE_REAL_PG17=1`, `Exit Code: 0`):**
   * Gerçek yerel **`PostgreSQL 17.11 (PG17(170011))`** üzerinde `template0` temiz veritabanları açılarak **5/5 Fail-Closed Negatif Senaryo** (`PG16/PG18` sürüm reddi, boş schema dump, bozuk schema dump -> `SCHEMA_DUMP_FAILED`, bozuk data dump -> `DATA_DUMP_FAILED`, bozuk forward migration -> `FORWARD_MIGRATION_FAILED`, eksik P0 token sertleştirmesi -> `POSTCONDITION_FAILED / P0_NOT_APPLIED`) kanıtlandı.
   * Pozitif uçtan uca restore (`001..20260803` + `paymentless_staging_seed.sql` + `70` ileri migrasyon `20260804..20261012` + `20261011` P0 teklifi) PASS: `Verdict=LOCAL_DISPOSABLE_CLONE_VERIFIED | Engine=PG17(170011) | Tables=120 | Policies=163 | Routines=281 | RLS Disabled=0 | Issue #10 = OPEN_PRODUCTION_BLOCKER | PRODUCTION = NO_GO | NO_REMOTE_DB_WRITE = TRUE`.
4. **`node scripts/verify-supabase-staging-consistency.test.mjs` (`Exit Code: 0`):** Tüm 98 migrasyon gerçek `PG17(170011)` üzerinde yeniden oynatıldı; Faz D1/D2/D3/E1/F1 matrisleri, **ADIM-039 Program V2 Security Surface & Token Hardening PG17 Matrisi** (`ht_rate_limit_buckets` erişim reddi, `get_user_role`/`get_user_tenant_id`/`is_super_admin`/trigger `search_path=pg_catalog, public` & `PUBLIC/anon` `EXECUTE` reddi, pasif `super_admin` reddi, `appointment_access_tokens` doğrudan `anon` erişim reddi + `SECURITY DEFINER` RPC sürekliliği), 6 adet ADIM-036 davranış testi ve 3 adet ADIM-037 davranış testi PASS.
5. **`node scripts/test-v1a-data-mode-switching-regression.mjs` (`Exit Code: 0`):** Çift yönlü `local <-> supabase_staging` depo geçişi, sıfır veri kaybı ve sözleşme paritesi (`31/31`) PASS.

### 6.3. `ADIM-039` Nihai Kabul Kapısı (`66371ce2` — `10/10 PASS`) ve `ADIM-040` Uzlaştırma Kanıtları

* **`ADIM-039` (`66371ce230b0136c5e86f3f9f33aeefe6ea49bb8`) Yerel Kabul Çıktıları (`10/10 PASS` + `Codex PASS`):**
  1. `npx tsc --noEmit` → `PASS (28.4s)`
  2. `npm run build` → `PASS (10.1s)`
  3. `node scripts/scan-frontend-secrets.mjs` → `PASS (0.6s)`
  4. `node scripts/verify-supabase-migration-integrity.mjs` → `PASS (0.6s)`
  5. `node scripts/test-v1a-data-mode-switching-regression.mjs` → `PASS (1.4s)`
  6. `node scripts/verify-disposable-pg17-pristine-restore.mjs` → `PASS (12.2s)`
  7. `node scripts/verify-supabase-staging-consistency.mjs` → `PASS (0.7s)`
  8. `node scripts/verify-supabase-staging-consistency.test.mjs` → `PASS (14.7s)`
  9. `node scripts/test-ui-v2-booking-e2e.mjs` → `PASS (19.5s)`
  10. `node scripts/test-phase-f-browser-regression.mjs` → `PASS (21.6s)`
* **`ADIM-040` GitHub CI & PR #34 Birleştirme Kanıtları:**
  * **Push CI (`ADIM-039` @ `66371ce2`):** Run [`43870002466`](https://github.com/MertSGI/Randapp-main/actions/runs/43870002466) → `SUCCESS`.
  * **PR #1 (`MertSGI/Randapp-main#34`):** [`https://github.com/MertSGI/Randapp-main/pull/34`](https://github.com/MertSGI/Randapp-main/pull/34) (`ci/lari-independent-acceptance-gate@66371ce2` → `staging/supabase-staging-consistency@2c6a99b0`) — `LARI Independent Acceptance CI` Run [`43872084503`](https://github.com/MertSGI/Randapp-main/actions/runs/43872084503) (`4/4 SUCCESS`) ve `LARI PG17 Role Restore Qualification` Run [`43872084917`](https://github.com/MertSGI/Randapp-main/actions/runs/43872084917) (`gh run rerun 43872084917 --failed` sonrası `SUCCESS`) yeşil olduktan sonra insan incelemesiyle `2026-11-16T14:06:22Z` tarihinde manuel birleştirildi (`mergeCommit`: `29c75164313114f306f49fcf05682aeb83eb1532`, `AUTO_MERGE = DISABLED`).
* **`ADIM-040` Salt-Dokümantasyon Mühürleme Kapısı (`loop.py` `TESTING` Evresi):**
  Bu salt-dokümantasyon güncellemesi (`docs/LARI_CANONICAL_BRANCH_RELEASE_RECORD.md` + `docs/LARI_FINAL_V1_V2_ACCEPTANCE_PACKAGE.md`) teslim edildikten sonra `npx tsc --noEmit`, `npm run build`, `node scripts/scan-frontend-secrets.mjs` ve `node scripts/verify-supabase-migration-integrity.mjs` komutları `loop.py` tarafından senkron koşulur; mühürleme PR #2 commit SHA'sı döngüsel referans yasağı gereği bu dosyaya önceden yazılmamıştır.
* **`ADIM-041` (`ADIM-041C`) & `ADIM-042` (`DR Restore`) Teknik Kanıt Özeti (17 Kasım 2026):**
  * **`ADIM-041C` Staging Uygulaması (`adim041c_staging_execution_receipt.json`):** `20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql` (`SHA-256: 7ced58f32a3cdf759bd35292f00cc0bc745d64778e59e1e30813275b647f313e`) `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde tek transaction içinde uygulandı (`APPLIED_AND_VERIFIED`; `80` `schema_migrations`, `120` tablo, `236` app func, P0 PostgREST `401` probları).
  * **`ADIM-042` Post-Cutover PG 17.12 Mantıksal DR Restore & 7-Kategori Denetimi:** Git dışı 7 parçalı yedek (`92,796 ms`) alınıp izole PostgreSQL 17.12 kümesine geri yüklendi (`10.063 sn` / `10,063 ms` RTO, `pg17_post041c_dr_proof.json` içinde `18/18` seçili tablo + ek salt-okunur denetimde `120/120` tüm `public` tablo satır sayısı/grant/rutin eşitliği, `80/80` `schema_migrations`, `5/5` `DENIED_42501`); PG-dışı kurtarma kapsamı (Storage bytes/offsite/secrets/11 Edge Function/Vault), sunucu/CI release-enforcement (`CLIENT_OR_ENV_BYPASS_REJECTED`) ve rollback planı belgelendi. Sahip tarafı `age` deşifre makbuzu (`HOLD-042-01 KAPALI` — `39959869290-local-recovery-receipt.json`, `38b5dbfd...`) kabul edilmiş ve canlı staging Docker (`supabase/postgres:17.6.1.141`) üzerinde `PR #38` (`cea570eb`) sonrası Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) ile `7/7` katalog paritesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02` teknik kanıtı, Artifact `14468557307`) elde edilmiştir; exact aday SHA CI'ı, yeni artifact offsite muhafazası ve sahip + Controller imzaları (`HOLD-042-03`) tamamlanana kadar Issue #10 `HOLD` durumunda korunmaktadır ([`docs/LARI_ISSUE_10_DR_ATTESTATION.md`](LARI_ISSUE_10_DR_ATTESTATION.md)).
  * **`ADIM-042` Yerel Doğrulamalar & `TESTING` Sınırı:** `9400477c` (`4/4 SUCCESS` CI Run `44018570590`) baseline'ı üzerine `verify-lari-recovery-hard-gate.mjs` (`26` kontrol: 7-kategori tekil sapma + `PUBLIC`/`anon`/`authenticated`/`WITH GRANT OPTION`/quoted identifier/platform ACL regresyonları + `evaluateProductionReleaseEnforcement` bypass reddi) ve `verify-disposable-pg17-pristine-restore.mjs` (`7`-kategori parite + Negative 1.6 `CATALOG_PARITY_MISMATCH` + release-enforcement bypass reddi) eklemeleri yapılmıştır; güncel teslimin tüm doğrulama komutları teslim sonrası `loop.py` `TESTING` evresinde senkron olarak çalıştırılacaktır.

---

## 7. Faz I (`ADIM-040..044` Release Closure & `ADIM-045` Canlı Kesim) Ön Koşulları

`SOURCE_CANDIDATE_COMPLETE` mühründen sonra canlı `PRODUCTION = GO` kararına ulaşmak için insan yetkisiyle sırayla tamamlanması gereken Faz I adımları:

1. **`ADIM-040` (Faz I1 — Branch & Staging PR Uzlaştırması):** `PR #1` ([`PR #34`](https://github.com/MertSGI/Randapp-main/pull/34)) `2026-11-16T14:06:22Z` tarihinde insan incelemesiyle `staging/supabase-staging-consistency` dalına birleştirildi (`mergeCommit`: `29c75164313114f306f49fcf05682aeb83eb1532`, `AUTO_MERGE = DISABLED`); `PR #2` salt-dokümantasyon mühürlemesi [`docs/LARI_CANONICAL_BRANCH_RELEASE_RECORD.md`](LARI_CANONICAL_BRANCH_RELEASE_RECORD.md) ve bu belge ile tamamlanmaktadır (`PRODUCTION = NO_GO`, **GitHub Issue #10 `OPEN / RED / BLOCKED`**).
2. **`ADIM-041` (Faz I2 — Gerçek Supabase `lari-staging` Aktivasyonu):** Kullanıcı yetkisiyle `ADIM-041C` (`20261117033457`) gerçek `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde uygulanıp doğrulandı (`APPLIED_AND_VERIFIED`; `docs/SUPABASE_STAGING_EXECUTION_RESULT_LOG.md` şablonu ayrıca tam operatör koşumu için korunmaktadır).
3. **`ADIM-042` (Faz I3 — GitHub Issue #10 Bağımsız DR Restore Kanıtı & Kapanış Kontratı):** Canlı `lari-staging` yedeğinin izole PG 17.12 örneğine mantıksal geri yüklenmesi (`10.063 sn`, `18/18` seçili tablo ve ek denetimle `120/120` `public` tablo/grant paritesi, `80/80` migrasyon, `5/5` `DENIED_42501`), sahip tarafı `age` deşifre makbuzu (`HOLD-042-01 KAPALI`, `38b5dbfd...`), canlı staging Docker (`supabase/postgres:17.6.1.141`) üzerinde `7/7` katalog paritesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02`, Run `44391665320` @ `cea570eb`, Artifact `14468557307`), izole PG17 7/7 parity + release-enforcement bypass reddi (`26/26`), PG-dışı kurtarma kapsamı ve rollback planı tamamlandı; `HOLD-042-03` (exact aday SHA CI'ı, yeni artifact offsite muhafazası ve sahip + Controller nihai imzaları) tamamlanana kadar **Issue #10 kapatılmaz ve `HOLD` korunur (`OPEN / RED / BLOCKED`)**.
4. **`ADIM-043` (Faz I4 — Teknik & Altyapı Açılışı):** `randevulari.com` / `*.randevulari.com` DNS & TLS sertifikalarının bağlanması, Vercel staging/prod ortam değişkenlerinin atanması ve `paymentless` güvenlik kilidinin canlı altyapıda doğrulanması.
5. **`ADIM-044` (Faz I5 — Dış Sağlayıcı Sözleşmeleri & Mevzuat Kapıları — `EXTERNAL_HOLD` Çözümü):** Canlı iyzico merchant/webhook sırları, e-Fatura adaptörü, Netgsm/Twilio, Meta WABA, Resend/SMTP, sunucu AI anahtarları ve KVKK/Klinik/Sağlık Turizmi mevzuat onaylarının tamamlanması.
6. **`ADIM-045` (Faz I6 — Gerçek Pilot Salon UAT & `PRODUCTION = GO` Kesimi):** Pilot salonda canlı tarayıcı UAT kabulü sonrası operatör tarafından `PRODUCTION = GO` kesim kararının verilmesi.

---

**Nihai Program Kararı:** `SOURCE_CANDIDATE_COMPLETE` | `PRODUCTION = NO_GO` | `ISSUE #10 = OPEN / RED / BLOCKED (HOLD_PRESERVED)` | `NO_REMOTE_DB_WRITE = TRUE (RE-LOCKED AFTER ONE-TIME ADIM-041C STAGING EXCEPTION)` | `PAID_FALLBACK = DISABLED` | `AUTO_MERGE = DISABLED` | `CANONICAL_STAGING_MERGE_SHA = 29c75164313114f306f49fcf05682aeb83eb1532` | `ADIM_041C_SHA = e9c2da1be91f7c3a6888bd53ce089889cafcfa54`
