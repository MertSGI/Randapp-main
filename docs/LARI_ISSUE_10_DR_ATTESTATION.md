# LARİ — GitHub Issue #10 Felaket Kurtarma (DR Restore) Ara Kanıt Paketi & Açık Kontrat Matrisi

**Belge Kimliği:** `LARI-DOC-ISSUE-10-DR-ATTESTATION-20261117`  
**Referans Adımlar:** `ADIM-041` (`ADIM-041C` Staging Reconciliation & P0 Hardening @ `e9c2da1b`) → `ADIM-042` (`Faz I3: GitHub Issue #10 DR Restore Kanıtı & Kapanış Kontratı`)  
**Hedef Supabase Staging Projesi:** `lari-staging` (`PROJECT_REF: rwedeejhjazwjthdjzrt`)  
**Post-Cutover Migrasyon Kimliği:** `20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql` (`SHA-256: 7ced58f32a3cdf759bd35292f00cc0bc745d64778e59e1e30813275b647f313e`)  
**GitHub Issue #10 Durumu:** **`OPEN / RED / BLOCKED — HOLD KORUNUYOR`** *(`issue_10_auto_closed: false` — Teknik PG 17.12 mantıksal geri yükleme, 18/18 seçili tablo satır sayısı eşitliği, `HOLD-042-01` sahip `age` deşifre & alıcı makbuzu (`38b5dbfd...`), Docker `supabase/postgres:17.6.1.141` üzerinde canlı `7/7` katalog fingerprint paritesi + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02` — Run `44391665320` @ `cea570eb`, Artifact `14468557307`) ve yeni artifact için sahip offsite + `age` deşifre & 25 dosyalık SHA-256 makbuzu (`REC-44391665320-OWNER-DECRYPT`) tamamlanmıştır; exact hedef SHA üzerinde `Independent Acceptance CI` + `PG17 Role Restore Qualification` ve Bağımsız Controller final imzası (`HOLD-042-03`) tamamlanmadan Issue #10 KAPATILAMAZ)*  
**Resmi Canlı Kesim Kararı:** **`PRODUCTION = NO_GO`**  
**Tarih:** 19 Kasım 2026

---

## 1. Yönetici Özeti ve Kapsam Sınırları

Bu belge, **GitHub Issue #10 (`[P0][PRODUCTION RELEASE BLOCKER] Verify independent PostgreSQL recovery before any production go-live`)** kapsamında yürütülen teknik PG 17.12 mantıksal yedek/geri yükleme tatbikatının gerçek kapsamını, izole PG17 7-kategorili parite ve release-enforcement kontrollerini, PG-dışı kurtarma kapsamını, geri alma (rollback) planını ve **Issue #10'un kapatılabilmesi için hâlâ açık olan sahip-bağımlı maddeleri** dürüstçe kayıt altına alır:

1. Canlı `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde `ADIM-041C` ileri yönlü şema uzlaştırması ve P0 güvenlik sertleştirmesinin (`20261117033457`, kaynak commit `e9c2da1be91f7c3a6888bd53ce089889cafcfa54`) uygulanması sonrası alınan 7 parçalı salt-okunur SQL yedeği,
2. Alınan 7 parçalı yedeğin Git deposu dışında saklanarak sıfırdan izole **PostgreSQL 17.12** kümesine geri yüklenmesi (`restore_elapsed_ms = 10,063 ms` / `10.063 sn`) ve:
   - `pg17_post041c_dr_proof.json` kanıtında `80/80` `schema_migrations`, `120` `public` tablo sayısı, `236` `public` uygulama fonksiyonu, `18/18` seçili tablo satır sayısı eşitliği ve `5/5` `DENIED_42501` negatif RLS probu (ölçülen kapsam `18` seçili tabloyla sınırlıdır),
   - Tam 7 kategorili (`schemas`, `tables`, `policies`, `routines`, `roles`, `role_memberships`, `extensions`) bulut-vs-Windows-PG17.12 karşılaştırmasındaki platform farklarının dürüstçe raporlanması (§3.4),
3. Yerel tek-kullanımlık PG17 pristine restore (`scripts/verify-disposable-pg17-pristine-restore.mjs`: izole fixture üzerinde `7/7` 7-kategorili katalog paritesi + `6/6` fail-closed negatif kontrol) ve hard-gate (`scripts/verify-lari-recovery-hard-gate.mjs`: `26/26` kontrol, 7-kategori tekil sapma + platform ACL + server/CI release-enforcement bypass değerlendiricisi),
4. PG-dışı platform kurtarma kapsamı (Storage object bytes, offsite yedek, platform sırları, 11 Edge Function, Vault), sunucu/CI release-enforcement dokümantasyonu ve rollback planı.
5. **Kapı Durumu (`HOLD-042-01` ve `HOLD-042-02` Tamam, `HOLD-042-03` Açık):** Şifreli özgün capture (`38b5dbfd...`) için sahip tarafı `age` deşifre/bütünlük/alıcı makbuzu (`39959869290-local-recovery-receipt.json`) tamamlanıp Controller tarafından kabul edilmiştir (`HOLD-042-01 = KAPALI`). Ardından Docker `supabase/postgres:17.6.1.141` üzerinde `lari-zero-cost-logical-backup.yml` (Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) @ `cea570eb`) ile tam **`7/7` bulut katalog eşitliği + `VERIFIED_LOGICAL_RESTORE`** elde edilmiş, şifreli backup artifact'i (`lari-staging-encrypted-logical-backup-44391665320-1`, ID `14468557307`) yayımlanmış ve sahip tarafından hem yerel `age` deşifresi (`REC-44391665320-OWNER-DECRYPT`, 25 dosya SHA-256) hem de `GOOGLE_DRIVE_PRIVATE_RESTRICTED` offsite kopyası (`2026-11-19T11:52:50Z`, `.age` SHA-256 `5347f291...` + `manifest.json`) doğrulanmıştır (`HOLD-042-02 = TAMAM`). Ancak `HOLD-042-03` (nihai aday SHA üzerindeki dual CI ve bağımsız Controller final imzası) tamamlanmadan **Issue #10 kapatılamaz (`HOLD` korunur)**.

### Değişmez Yönetişim ve Güvenlik Kuralları

| Kontrol | Durum | Açıklama |
| :--- | :---: | :--- |
| **GitHub Issue #10** | `OPEN / RED / BLOCKED` (`HOLD`) | Teknik PG 17.12 DR tatbikatı (`18/18` seçili tablo), `HOLD-042-01` sahip deşifre makbuzu ve Docker `7/7` katalog parity + `VERIFIED_LOGICAL_RESTORE` (`HOLD-042-02`, Run `44391665320`) doğrulanmıştır; ancak offsite arşiv muhafazası, exact aday SHA CI ve sahip + Controller nihai imzaları (`HOLD-042-03`) tamamlanmadan **Issue #10 kapatılmaz ve erken kapatma onayı istenmez**. |
| **Canlı Kesim Kararı** | `PRODUCTION = NO_GO` | Issue #10'un tüm 8 maddesi bağımsızca doğrulanıp kapatılmadan ve Faz I4–I6 (`ADIM-043..045`) tamamlanmadan canlı kesim yasaktır. |
| **Kimlik & Sır Güvenliği** | `0 Secret / 0 PII` | Service Role Key, DB parolası, `age` private key, JWT veya müşteri PII verisi bu belgeye, Git reposuna veya kanıt JSON'larına yazılmamıştır. |
| **Deşifre Egemenliği (`Decryption Sovereignty`)** | `OWNER_ONLY_CUSTODY` | Otonom ajan `%LOCALAPPDATA%\LARI\backup-keys\lari-staging-backup.agekey` dosyasını aramaz, okumaz, kopyalamaz veya deşifre çalıştırmaz. |
| **Yedek Konumu** | `Git Dışı (Scratch)` | 7 parçalı SQL yedeği hiçbir Git çalışma ağacı içinde değil, yalnızca yerel çalışma dışı `scratch/` dizininde tutulmuştur. |
| **Genel Uzak Yazma** | `NO_REMOTE_DB_WRITE = TRUE` *(Yeniden Kilitli)* | Yalnız `ADIM-041C` için `2026-11-16T19:46:33+03:00` tarihli tek seferlik kullanıcı yetkisi kullanılmış ve işlem sonunda genel `NO_REMOTE_DB_WRITE` kilidi yeniden devreye alınmıştır; `ADIM-042` tüm uzaktan kontrolleri tamamen salt-okunur (`BEGIN READ ONLY`) yürütmüştür. |

---

## 2. Post-Cutover `ADIM-041C` Canlı Staging Başlangıç Durumu

DR tatbikatından hemen önce `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde `ADIM-041C` (`20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql`, repo commit `e9c2da1b`) tek transaction (`lock_timeout = '5s'`, `statement_timeout = '120s'`) içinde uygulanmış ve `adim041c_staging_execution_receipt.json` (`status: APPLIED_AND_VERIFIED`) ile doğrulanmıştır:

* **Repo vs Canlı Migrasyon Sayısı Ayrımı:**
  * **Kanonik Repo (`supabase/migrations/`):** `99` aktif SQL migrasyon dosyası (`001..005`, `20260601..20261012` ve `20261117033457`). Arşivlenmiş `1` dosya (`20260526_initial_schema.sql`) `supabase/archive/` altındadır.
  * **Canlı `lari-staging` (`supabase_migrations.schema_migrations`):** `80` kayıt (`75` ortak geçmiş + uzaktaki 4 adet `20261008*` remote-only kaydı `20261008063020`, `20261008063027`, `20261008063031`, `20261008063041` + ileri yönlü uzlaştırma migrasyonu `20261117033457`).
* **Katalog Sayımları:** `120` tablo (`public`), `236` uygulama fonksiyonu (`public`), `provider_token` sütunu mevcut (`true`), `payments.amount` tipi `numeric`, `idx_subscriptions_unique_tenant_id` mevcut (`idx_subs_unique_tenant: true`), `clinic_ai_func_count = 1`, eski bypass overload'ları (`legacy_create_public_booking_13arg = 0`, `legacy_manage_token_1arg = 0`).
* **P0 Güvenlik & PostgREST Probları:**
  * `appointment_access_tokens`, `consent_ledger`, `policy_acceptances`: `anon` için `SELECT`/`INSERT`/mutasyon yetkileri kapalı (`false`), legacy açık politika yok (`open_policy_present: false`).
  * Canlı PostgREST `anon` doğrudan tablo istekleri: `GET appointment_access_tokens` → `401`, `POST consent_ledger` → `401`, `POST policy_acceptances` → `401`.
  * Canlı PostgREST `anon` güvenli RPC istekleri: `get_public_commercial_plan_catalog` → `200`, `can_accept_public_booking` → `200`, kısa token kontrolü → `200 (invalid_token)`, geçersiz slug kontrolü → `200 (allowed: false)`.

---

## 3. Gerçek `lari-staging` Snapshot Yedek & Sıfır-Hedefe Mantıksal DR Restore Tatbikatı (`ADIM-042`)

**Kanıt Kaynağı:** `hafiza/reconciliation_ADIM041/pg17_post041c_dr_proof.json` & `hafiza/reconciliation_ADIM041/pg17_post_cutover_dr_drill.py`  
**Tatbikat Zaman Damgası (UTC):** `2026-11-17T03:56:05.946639+00:00`  
**Hedef DR Motoru:** `PostgreSQL 17.12 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit`  
**Git Dışı Yedek Dizin Yolu:** `%ANTIGRAVITY_SCRATCH%/lari_pg17_post041c_dr_backup_rwedeejhjazwjthdjzrt` *(yerel kullanıcı yolu gizlenmiştir — 0 PII)*

### 3.1. 7 Parçalı Salt-Okunur Yedek Envanteri ve Ölçülen Süre Metrikleri

Yedekleme `pg_dumpall.exe` / `pg_dump.exe` (`17.12`) ile salt-okunur yakalanıp temiz `initdb` ile sıfırdan başlatılan izole PG 17.12 kümesine geri yüklenmiştir:

| Yedek Parçası / Metrik | Değer / Kapsam |
| :--- | :--- |
| **Yedek Parçaları (7 Dosya)** | `roles_globals.sql`, `public_full_schema.sql`, `public_data.sql`, `migrations_history.sql`, `extensions_schema.sql`, `auth_schema_and_data.sql`, `storage_schema_and_data.sql` |
| **Yedek Alma Süresi (`dump_elapsed_ms`)** | `92,796 ms` (`92.796 sn`) |
| **Sıfırdan Restore Süresi (`restore_elapsed_ms` / Ölçülen RTO)** | **`10,063 ms` (`10.063 sn`)** *(Not: `10.063 sn > 10.000 sn` olduğu için `< 10s` olarak iddia edilmez; tam ölçülen değer `10.063 sn`dir)* |
| **Zaman Damgalı RPO Ölçümü & Sınırı** | **Kanıtla Sınırlandırılmış Snapshot Penceresi & RPO Süre Aralığı (`2026-11-17T03:56:05.946639Z` yerel PG17.12 · `S ∈ [2026-11-18T20:32:31.6619202Z, 2026-11-18T20:34:14.6321185Z]` Run `44391665320`):** `pg_dump` tek `REPEATABLE READ` snapshot anında tutarlıdır. Run `44391665320` için `manifest.json` içindeki `created_at_utc = 2026-11-18T20:32:31Z` değeri `scripts/run-zero-cost-logical-backup.sh:1459` satırında yedekleme başlamadan önce üretilen betik başlangıç zamanıdır (`Creating the bounded logical dump without emitting database output.` adımı `2026-11-18T20:32:31.6619202Z` ve `Restoring the exact dump into disposable PostgreSQL 17.` adımı `2026-11-18T20:34:14.6321185Z`); betik ayrıca bir `pg_export_snapshot()` zamanı basmadığından canlı snapshot anı `S` kanıta dayalı olarak **`[2026-11-18T20:32:31.6619202Z, 2026-11-18T20:34:14.6321185Z]`** (~103 sn belirsizlik penceresi; tam saniyeye dışa yuvarlı dış sınır `[2026-11-18T20:32:31Z, 2026-11-18T20:34:15Z]`) içine sıkıştırılmıştır. Ücretsiz/manuel `workflow_dispatch` mantıksal yedeğinde herhangi bir `T` felaket anı için gerçekleşen **RPO süresi `RPO = T - S`** olup **`[T - 2026-11-18T20:34:14.6321185Z, T - 2026-11-18T20:32:31.6619202Z]`** aralığındadır (en kısa/iyimser kayıp penceresi `T - 2026-11-18T20:34:14.6321185Z`, en uzun/muhafazakâr kayıp penceresi `T - 2026-11-18T20:32:31.6619202Z`; sürekli `RPO = 0` / PITR iddia edilmez, `0`-yakın RPO yalnızca ayrı Supabase PITR ile mümkündür). |
| **Tablo Satır Eşitliği Kapsamı** | `pg17_post041c_dr_proof.json` içinde **18 seçili tablo**, ek salt-okunur 7-kategori denetiminde ise **tüm `120/120` `public` tabloda (`diffs = []`)** anlık snapshot satır sayısı eşitliği doğrulanmıştır (sürekli RPO=0 iddiası değildir) |

### 3.2. Post-Restore Uygulama (`public`) Katalog & Grant Eşitliği (`120/120` Tablo)

| Doğrulama Kalemi | Canlı `lari-staging` | Restore Edilen PG 17.12 | Durum |
| :--- | :---: | :---: | :---: |
| **`schema_migrations` Sayısı** | `80` (`20261117033457` dahil) | `80` (`20261117033457` dahil) | `EŞİT` |
| **Korunan `20261008*` Remote-Only Kayıtları** | `4` (`20261008063020`, `20261008063027`, `20261008063031`, `20261008063041`) | `4` | `EŞİT` |
| **`public` Tablo Sayısı & Metadata/RLS/ACL** | `120` | `120` | `120/120 EŞİT` |
| **`public` Tüm Tablolar Satır Sayısı** | `120` tablo | `120` tablo (`diffs = []`) | `120/120 EŞİT` |
| **`public` Tablo Grant Matrisi (`role_table_grants`)** | `1,442` yetki satırı | `1,442` yetki satırı | `1,442/1,442 EŞİT` |
| **`public` Rutin Grant Matrisi (`role_routine_grants`)** | `498` yetki satırı | `498` yetki satırı | `498/498 EŞİT` |
| **`public` Uygulama Fonksiyonları (`app_func_count`)** | `236` (`prosecdef` + `owner` dahil) | `236` | `236/236 EŞİT` |
| **`subscriptions.provider_token` & `payments.amount` Tipi** | `true` / `numeric` | `true` / `numeric` | `EŞİT` |
| **18 Seçili Tablo Snapshot Satır Sayısı (`pg17_post041c_dr_proof.json`)** | `tenants=3`, `branches=2`, `services=6`, `staff=4`, `customers=53`, `appointments=1`, `appointment_access_tokens=1`, `consent_ledger=354`, `policy_acceptances=0`, `customer_segments=0`, `plans=9`, `plan_versions=9`, `plan_entitlements=249`, `subscriptions=2`, `payments=0`, `reviews=0`, `customer_favorites=0`, `auth_users=5` | Birebir aynı (`18/18`) | `PASS` |

### 3.3. Post-Restore Negatif RLS (`42501`) ve Pozitif RPC Probları

Restore edilen izole PG 17.12 veritabanında `SET LOCAL ROLE anon` altında yürütülen doğrulamalar:

| Probe | Beklenen Davranış | Gözlenen Sonuç |
| :--- | :--- | :---: |
| `anon_tok_select` (`SELECT` `public.appointment_access_tokens`) | Doğrudan `anon` okuma reddi | `DENIED_42501` |
| `anon_consent_insert` (`INSERT` `public.consent_ledger`) | Doğrudan `anon` yazma reddi | `DENIED_42501` |
| `anon_policy_insert` (`INSERT` `public.policy_acceptances`) | Doğrudan `anon` yazma reddi | `DENIED_42501` |
| `anon_save_owner` (`public.save_owner_business_profile(...)`) | Yetkisiz `anon` owner RPC reddi | `DENIED_42501` |
| `anon_rate_limit` (`SELECT` `public.ht_rate_limit_buckets`) | Doğrudan `anon` rate-limit tablosu okuma reddi | `DENIED_42501` |
| `get_public_commercial_plan_catalog()` (`anon`) | Yalnız yayınlı ticari plan kataloğu okunur | `PASS` (`plan_catalog_count = 6`) |
| `can_accept_public_booking('melis-guzellik')` (`anon`) | Kanonik 6 anahtarlı uygunluk yanıtı döner | `PASS` (`allowed`, `blocking_reason_codes`, `bookable`, `found`, `primary_reason_code`, `reason_code`) |

### 3.4. 7 Kategorili Tam Katalog Karşılaştırması (`catalog-fingerprint.sql`: Canlı `lari-staging` vs Stok Windows PG 17.12)

`scripts/backup/catalog-fingerprint.sql` sorgusu canlı `lari-staging` (`BEGIN READ ONLY`) ve post-`ADIM-041C` yedeğinin geri yüklendiği stok Windows PostgreSQL 17.12 örneği üzerinde çalıştırılmıştır. Yerel Windows makinesinde Docker (`supabase/postgres:17.6.1.141`) bulunmadığı için Supabase platformuna özgü yönetilen şemalar, eklentiler ve `supabase_admin` OID 10 sahipliği nedeniyle ortaya çıkan gerçek farklar gizlenmeden aşağıda belgelenmiştir (`docs/LARI_ZERO_COST_BACKUP_RESTORE.md` § Completeness limitations ile uyumlu):

| # | Katalog Kategorisi | Canlı `lari-staging` (Sayı / MD5) | Restore Edilen Stok PG 17.12 (Sayı / MD5) | Durum & Teknik Fark Nedeni |
| :-: | :--- | :---: | :---: | :--- |
| 1 | `schemas` | `10` / `0d71699bcdc824e90e2f235c86480f13` | `6` / `b42f0fef47c3d159652ce36e8e5939ec` | Bulutta Supabase-yönetimli `vault`, `realtime`, `graphql`, `pgbouncer` şemaları ve `supabase_admin` sahipliği vardır; stok PG 17.12'de yalnız `public`, `auth`, `storage`, `extensions`, `graphql_public`, `supabase_migrations` bulunur. |
| 2 | `tables` | `162` / `72425fca0949b5ee60e77522a6209556` | `158` / `ecc67936eb319efb20056730d471343f` | **`120/120` `public` tablo birebir eşittir.** 4 tablo farkı buluttaki `vault`/`realtime` tabloları ve `auth`/`storage` yönetilen sahiplikleridir. |
| 3 | `policies` | `163` / `755171c273a03a9f4eec8b59918ad1e0` | `163` / `72c05fcc35a51e57fba18775ba668ebd` | Politika sayısı birebir **`163/163`** eşittir. MD5 farkı 43 politikada PG 17.6 → PG 17.12 `pg_get_expr` `ARRAY['...']::text[]` vs `ARRAY[('...')::text]` sözdizimi normalizasyonundan kaynaklanır (anlamsal fark yoktur). |
| 4 | `routines` | `345` / `82d5c39210b9a54f825d39daf2f2778a` | `310` / `44e734ce0f9fa3ee1fe3b6f60833f84b` | **`236/236` `public` uygulama fonksiyonu birebir eşittir.** 35 rutin farkı buluttaki `vault`, `pg_stat_statements` ve `extensions`/`auth` ACL'leridir. |
| 5 | `roles` | `16` / `902e57587c6d6a11948f591eec20ebb4` | `16` / `8351d43d86aa56fd843a35675cbddcf6` | **`16/16` rol mevcuttur.** Tek fark bulutta `postgres` rolünün `rolsuper=f` ve özel `search_path` taşımasıdır. |
| 6 | `role_memberships` | `22` / `1edb71346d8a451937ad7d5b698bfd17` | `22` / `23fc5b495cf31df6c6575167a419d9ea` | **`22/22` üyelik kenarı mevcuttur.** Fark OID 10 grantor'unun bulutta `supabase_admin`, yerel Windows PG17'de `postgres` olmasıdır. |
| 7 | `extensions` | `5` / `3e846ce1971ed2d8a306fdfb8fdfa561` | `3` / `a4f29f95ef913bf5da82542546c095d7` | Buluttaki `pg_stat_statements (1.11)` ve `supabase_vault (0.3.1)` stok Windows PG17 ikilisinde bulunmaz (`supabase/postgres:17.6.1.141` Docker imajı gerekir). |

> **Dürüst Sonuç:** Uygulama alanı (`public` şeması) %100 eşittir (`120/120` tablo, `120/120` satır sayısı, `1,442/1,442` tablo grant, `498/498` rutin grant, `236/236` uygulama rutini). Tam platform 7/7 paritenin (`match=true` + `supabase_admin` OID 10 + `supabase_vault`) canlıdan kanıtlanması için sahibinin Docker destekli `lari-zero-cost-logical-backup.yml` (`supabase/postgres:17.6.1.141`) iş akışını tetiklemesi gereklidir.

---

## 4. Yerel PG17 Pristine Restore ve Hard-Gate Doğrulama Sınırı

* **Önceki Onaylı Baseline (`9400477c` / CI Run `44018570590`):** `verify-disposable-pg17-pristine-restore.mjs` (`PG17(170011)`, `Tables=120`, `Policies=163`, `Routines=281`, `5/5` negatif), `verify-lari-recovery-hard-gate.mjs` (`19/19`) ve `verify-supabase-migration-integrity.mjs` (`0`) doğrulanmıştır.
* **Bu Teslimde Eklenen `ADIM-042` Kapıları (`loop.py` `TESTING` Kapısına Tabi):**
  * `scripts/verify-disposable-pg17-pristine-restore.mjs`: `querySevenCategoryCatalogFingerprint` + `compareSevenCategoryCatalogParity` (`7/7` kategori paritesi), Negative 1.6 (`CATALOG_PARITY_MISMATCH` drift reddi -> `6/6` pristine negatif kontrolü) ve `evaluateProductionReleaseEnforcement` (`CLIENT_OR_ENV_BYPASS_REJECTED` / `ISSUE_10_NOT_CLOSED`) kontrolleri eklendi (`99` migrasyon dahil).
  * `scripts/verify-lari-recovery-hard-gate.mjs`: `22` `check()` doğrulamasına çıkarıldı (`PGlite` üzerinde 7-kategorinin her birindeki tekil sapmaya karşı fail-closed red + `evaluateProductionReleaseEnforcement` bypass/karantina/Issue #10 reddi).
  * *Doğrulama Sınırı:* Bu yeni kontrollerin canlı çalışma zamanı sonucu teslim sonrası `loop.py` `TESTING` evresinde senkron olarak çalıştırılarak kanıtlanır.

---

## 5. GitHub Issue #10 Kapanış Sözleşmesi Hizalama Matrisi (`HOLD` Korunuyor)

GitHub [`Issue #10`](https://github.com/MertSGI/Randapp-main/issues/10) (`Release-blocking checklist — all required before closing`) maddelerinin güncel tamamlanma durumu aşağıdadır:

| # | Issue #10 Zorunlu Kapanış Kriteri | Mevcut Durum | Açıklama / Kanıt ve Kalan Sahip Gereksinimi |
| :-: | :--- | :---: | :--- |
| 1 | **Şifreli Capture Korunması & `age` Alıcı Doğrulaması** (`UNVERIFIED_ENCRYPTED_CAPTURE`, ID `12504131775`, Run `39959869290`, SHA-256 `38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea`) | `TAMAMLANDI / KABUL EDİLDİ (HOLD-042-01 KAPALI)` | Sahip kendi terminalinde şifreli arşivi (`38b5dbfd...`) doğrulayıp `age-keygen -y` ile public X25519 alıcıyı (`age1hwtzrhlahj7qqqv0c8mpfypmz5tzjnnfsd9tv7avl4h2zj5fysgsgjxn5r`) teyit etmiştir; bağımsız Controller (`Codex`) sanitize makbuzu kabul etmiştir. |
| 2 | **Sahip Tarafı Yerel Deşifre & Kriptografik Bütünlük Makbuzu** (`Sanitized Receipt`) | `TAMAMLANDI / KABUL EDİLDİ (HOLD-042-01 KAPALI)` | Sahip yerel deşifre ve açma (`11` dosyalık envanter, 6 hata günlüğü 0 bayt `e3b0c442...`) tamamlanmış; private key ve 0 PII içermeyen `39959869290-local-recovery-receipt.json` Controller tarafından kabul edilmiştir. |
| 3 | **İzole Üretim-Dışı PostgreSQL 17 Mantıksal Geri Yükleme** | `TAMAMLANDI (PG 17.12 SQL)` | Post-`ADIM-041C` 7 parçalı mantıksal SQL yedeği izole PG 17.12 kümesine `10.063 sn` (`10,063 ms`) sürede geri yüklenmiş, `18/18` seçili tablo satır sayısı eşitliği ve `5/5` `DENIED_42501` RLS probu doğrulanmıştır. |
| 4 | **7 Kategorili Kaynak/Hedef Şema, Rol, Grant ve Katalog Eşitliği** | `TAMAMLANDI — 7/7 + VERIFIED_LOGICAL_RESTORE (HOLD-042-02 KANITI ALINDI)` | Önceki tanı koşumlarındaki (`44262335638`, `44319789185`, `44377112855`, `44388009143`) kök nedenler (PR #35..#38) çözüldü: `graphql`/`graphql_public` `pg_init_privs` (`e:`) izole hedefte yeniden üretildi ve `pgcrypto`/`pg_stat_statements`/`uuid-ossp` installer rol temsili daraltılarak korundu (`PUBLIC`/`anon`/`authenticated`/`WITH GRANT OPTION` fail-closed). Canlı staging Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) (`supabase/postgres:17.6.1.141` @ `cea570eb`, manifest `created_at_utc: 2026-11-18T20:32:31Z` pre-dump başlangıcı, kanıtla sınırlı snapshot penceresi `[2026-11-18T20:32:31.6619202Z, 2026-11-18T20:34:14.6321185Z]`) üzerinde **`VERIFIED_LOGICAL_RESTORE` (`status: completed`, `conclusion: success`)** ve Artifact `lari-staging-encrypted-logical-backup-44391665320-1` (ID `14468557307`, ZIP `600605 bytes` `SHA-256: b8ae851c4ed5cbc5b1770f7b4ff0c32aaf26838bb8ecffd61c30a2ed6f5c88b2`, içerideki `.age` `lari-rwedeejhjazwjthdjzrt-44391665320-1.tar.gz.age` `598888 bytes` `SHA-256: 5347f291a664b4084d929df2496eb9475de9e5845fab52a95b5bfa77e1480f95`) üretildi. |
| 5 | **Bağımsız Controller İncelemesi (Kapsam ve Sınırlamalar)** | `DEVAM EDİYOR (HOLD)` | Kapsam sınırları ve platform farkları bu belgede dürüstçe raporlanmıştır; Codex bağımsız denetimi bu teslim sonrası yürütülecektir. |
| 6 | **PG-Dışı Platform Kurtarma Kapsamı** (`Storage bytes`, `offsite backup`, `secrets`, `Edge Functions`, `Vault`) | `KAPSAM BELGELENDİ + OFFSITE KANITI DOĞRULANDI` | Tüm 5 PG-dışı varlık için teknik envanter ve kurtarma prosedürü §6'da tamamlanmıştır; canlı Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) `.age` arşivi (`5347f291...`) ve `manifest.json` dosyası sahip tarafından GitHub/Supabase dışı kilitli/özel buluta (`GOOGLE_DRIVE_PRIVATE_RESTRICTED`) kopyalanmış, hedef bütünlüğü `2026-11-19T11:52:50Z` tarihinde SHA-256 eşleşmesiyle (`5347f291...`) doğrulanmıştır. |
| 7 | **Sunucu / CI Tarafı Production Release Enforcement & Başarısız Bypass Kanıtı** | `UYGULAMA TAM (TESTING KAPISINDA)` | DB `platform_global_release_control`, `PaymentRunModeService`, `capture_release_policy.py`, `lari-independent-acceptance-ci.yml` ve `evaluateProductionReleaseEnforcement` (`CLIENT_OR_ENV_BYPASS_REJECTED`) §7'de belgelenmiştir (yeni gate testleri `TESTING` evresine tabidir). |
| 8 | **Sahip + Bağımsız Controller Nihai Canlı Kesim İmzası, Exact Hedef SHA & Rollback Planı** | `PLAN HAZIR — İMZA BEKLİYOR (NO_GO)` | Exact SHA zinciri ve geri alma planı §8'de tamamlanmıştır; sahip + Controller imzaları Issue #10 maddeleri 1–7 tamamlanana kadar `UNSIGNED / PENDING` kalır. |

---

### 5.1. Sahip Tarafı `age` Deşifre ve Bütünlük Makbuzu (`HOLD-042-01` — `KAPALI / KABUL EDİLDİ`)

`UNVERIFIED_ENCRYPTED_CAPTURE` (Artifact ID `12504131775`, Workflow Run `39959869290`, dosya `lari-quarantine-rwedeejhjazwjthdjzrt-39959869290-1.tar.gz.age`, SHA-256 `38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea`) için deşifre egemenliği gereği özel anahtar (`%LOCALAPPDATA%\LARI\backup-keys\lari-staging-backup.agekey`) yalnızca proje sahibinin fiziksel gözetiminde tutulmuş; sahip 18 Kasım 2026'da kendi yerel terminalinde deşifreyi, public alıcı doğrulamasını (`age-keygen -y` → `age1hwtzrhlahj7qqqv0c8mpfypmz5tzjnnfsd9tv7avl4h2zj5fysgsgjxn5r`) ve geçici açık dosya temizliğini yürütmüştür.

Özgün `scripts/run-zero-cost-quarantine-capture.sh` arşiv envanteriyle birebir eşleşen **11 dosyalık** doğrulanmış sahip makbuzu (`39959869290-local-recovery-receipt.json`, `0 Secret / 0 PII`):
```json
{
  "receipt_id": "REC-39959869290-OWNER-DECRYPT",
  "workflow_run_id": "39959869290",
  "artifact_id": "12504131775",
  "encrypted_archive_file": "lari-quarantine-rwedeejhjazwjthdjzrt-39959869290-1.tar.gz.age",
  "encrypted_archive_sha256": "38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea",
  "decryption_status": "OWNER_LOCAL_DECRYPT_AND_UNTAR_SUCCEEDED",
  "decryption_timestamp_utc": "2026-11-18T07:39:51Z",
  "age_recipient_verification": "VERIFIED_PUBLIC_RECIPIENT_MATCH",
  "age_public_recipient": "age1hwtzrhlahj7qqqv0c8mpfypmz5tzjnnfsd9tv7avl4h2zj5fysgsgjxn5r",
  "plaintext_temp_cleanup": "COMPLETED_BY_OWNER",
  "hold_042_01_status": "ACCEPTED",
  "extracted_files_sha256": {
    "archive.list": "5f27b550e4158ad85e1cfb8825fb9c509230cae994ec09fccafd24e966301c5e",
    "database.dump": "91843564450cf4a94c010f5d19a7d69e536a9751bb992ad32d8c603f8cef4c12",
    "roles.sql": "200715690c21f02c5b1c68abb68039469bd075950acc37856d21698e654c975f",
    "source-catalog-fingerprint.json": "371cfebabfa6e83b3f1a02a512e92b3f28a284c7c64e6309e153873ea4068ce7",
    "source-dependencies.json": "3b59ab2c37a07e9e24c4c1fcb63cb5928025054797eb7999f0cac93db4e53658",
    "archive-list.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-catalog-fingerprint.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dependencies.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dump.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dump.stdout": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-roles.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "stderr_zero_error_verified": true,
  "verified_by": "PROJECT_OWNER",
  "custody_attestation": "Private key retained exclusively in owner custody; zero secret and zero PII leaked."
}
```
*Bu sanitize sahip makbuzu bağımsız Controller (`Codex`) tarafından incelenip kabul edilmiştir (`HOLD-042-01 = KAPALI`).*

---

### 5.2. Docker `supabase/postgres:17.6.1.141` Bulut Katalog Paritesi Sonucu (`HOLD-042-02` — `TEKNİK KANIT TAMAMLANDI`)

Canlı `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinden `PR #35` (`53778b3b`), `PR #36` (`1a953bc9`), `PR #37` (`02ed1f15` `acl_probe` tanı koşumu [`44388009143`](https://github.com/MertSGI/Randapp-main/actions/runs/44388009143)) ve `PR #38` (`cea570eb9e9bef8c3a97a12e32e109d1dd30c877`) ile yürütülen teşhis ve dar düzeltmelerin ardından resmi `supabase/postgres:17.6.1.141` konteynerinde çalıştırılan canlı koşum:
* **Yetkili Staging Koşumu & Kanıtla Sınırlandırılmış RPO Penceresi:** Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) (`staging/supabase-staging-consistency` @ `cea570eb9e9bef8c3a97a12e32e109d1dd30c877`, `status: completed`, `conclusion: success`): `manifest.json` içindeki `created_at_utc: 2026-11-18T20:32:31Z` damgası `run-zero-cost-logical-backup.sh:1459` tarafından dump öncesi atanmış başlangıç zamanıdır. İş akışı loglarında `Creating the bounded logical dump` `2026-11-18T20:32:31.6619202Z` ve `Restoring the exact dump into disposable PostgreSQL 17.` `2026-11-18T20:34:14.6321185Z` anında gerçekleştiği için canlı `pg_dump` snapshot anı `S` ayrı `pg_export_snapshot()` çıktısı olmadan `[2026-11-18T20:32:31.6619202Z, 2026-11-18T20:34:14.6321185Z]` (~103 sn) aralığıyla sınırlıdır; dolayısıyla herhangi bir `T` felaket anı için gerçekleşen RPO süresi `RPO = T - S ∈ [T - 20:34:14.6321185Z, T - 20:32:31.6619202Z]` aralığındadır. (`10.063 sn` ölçümü yalnızca yerel PG 17.12 geri yükleme RTO süresidir.)
* **Çözülen 51-Nesne Kök Nedenleri:**
  1. `schemas` (`graphql`, `graphql_public`): Kaynakta `raw_acl == pg_init_privs` (`e:` `anon`/`authenticated`/`service_role` `USAGE`, `postgres` `USAGE WITH GRANT OPTION`, `supabase_admin` `CREATE, USAGE`) olduğu için `pg_dump` atlamıştı; `scripts/run-zero-cost-logical-backup.sh` (`replay_source_platform_init_schema_acls`) izole `RESTORE_TARGET_DATABASE_NAME` içinde bu yetkileri birebir yeniden üretti (`catalog-fingerprint.sql` `PUBLIC`/`anon`/`authenticated`/`WITH GRANT OPTION` kontrolünü gizlemez).
  2. `routines` (`49` adet non-`SECURITY DEFINER` `extensions.*` rutini: `pgcrypto`, `pg_stat_statements`, `uuid-ossp`): Kaynakta installer `postgres`, konteynerde `supabase_admin` olduğu için yalnızca installer `grantor`/`grantee` temsili `bool_or(is_grantable)` ile normalize edildi (`PUBLIC`, `anon`, `authenticated`, `dashboard_user` ve `WITH GRANT OPTION` sapmaları fail-closed korunur).
* **Terminal Karar & Artifact:** `ROLE_PREPARATION_OK: original_sql_preserved=true extra_grants=0`, `Restore Stage: VERIFIED_LOGICAL_RESTORE`, `Detail: All restore gates passed. Full catalog equivalence verified.` Yayımlanan artifact: `lari-staging-encrypted-logical-backup-44391665320-1` (Artifact ID `14468557307`, ZIP `600605 bytes` `SHA-256: b8ae851c4ed5cbc5b1770f7b4ff0c32aaf26838bb8ecffd61c30a2ed6f5c88b2`); içindeki şifreli arşiv `lari-rwedeejhjazwjthdjzrt-44391665320-1.tar.gz.age` (`598888 bytes`, **manifest ve dosya `SHA-256: 5347f291a664b4084d929df2496eb9475de9e5845fab52a95b5bfa77e1480f95`**).

Özgün Artifact `14468557307` için sahip tarafından doğrulanan **bağımsız offsite bulut transferi (`GOOGLE_DRIVE_PRIVATE_RESTRICTED`, `2026-11-19T11:52:50Z`, `manifest.json` dahil ve hedef `.age` dosyasının `SHA-256` eşleşmesi `5347f291...`) + `age` deşifre + 25 dosyalık bütünlük makbuzu (`REC-44391665320-OWNER-DECRYPT`, `0 Secret / 0 PII`)**:
```json
{
  "receipt_id": "REC-44391665320-OWNER-DECRYPT",
  "workflow_run_id": "44391665320",
  "artifact_id": "14468557307",
  "source_revision": "cea570eb9e9bef8c3a97a12e32e109d1dd30c877",
  "created_at_utc": "2026-11-18T20:32:31Z",
  "encrypted_archive_file": "lari-rwedeejhjazwjthdjzrt-44391665320-1.tar.gz.age",
  "encrypted_archive_sha256": "5347f291a664b4084d929df2496eb9475de9e5845fab52a95b5bfa77e1480f95",
  "manifest_sha256_match": true,
  "offsite_custody_status": "VERIFIED_INDEPENDENT_CLOUD_GOOGLE_DRIVE_PRIVATE_RESTRICTED",
  "offsite_media_type": "GOOGLE_DRIVE_PRIVATE_RESTRICTED",
  "offsite_copy_timestamp_utc": "2026-11-19T11:52:50Z",
  "offsite_target_age_sha256": "5347f291a664b4084d929df2496eb9475de9e5845fab52a95b5bfa77e1480f95",
  "offsite_manifest_included": true,
  "decryption_status": "OWNER_LOCAL_DECRYPT_AND_UNTAR_SUCCEEDED",
  "decryption_timestamp_utc": "2026-11-19T06:38:14Z",
  "age_recipient_verification": "VERIFIED_PUBLIC_RECIPIENT_MATCH",
  "age_public_recipient": "age1hwtzrhlahj7qqqv0c8mpfypmz5tzjnnfsd9tv7avl4h2zj5fysgsgjxn5r",
  "plaintext_temp_cleanup": "COMPLETED_BY_OWNER",
  "restore_report_summary": {
    "verdict": "VERIFIED_LOGICAL_RESTORE",
    "catalog_fingerprint_match": true,
    "pristine_target_exit_code": 0,
    "roles_restore_exit_code": 0,
    "database_restore_exit_code": 0
  },
  "extracted_file_count": 25,
  "extracted_files_sha256": {
    "archive.list": "6bdc61922776bdac98da19ee0ed2303d36bcad60028b46074f1e01922cedc3b9",
    "archive-list.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "database.dump": "397e98722f867c6da317f721dc1031ff4014fd0cacc1197ed2b7f41241cecf18",
    "dependency-report.json": "845b43cabb9328d8018d2391dc9f87b681eb3eaaabe07f3590581ddfffe3f182",
    "pristine-target-receipt.json": "57dd8dcbdf9d4625f7341cc141a7e0990e541d500af6f078cd240c934ced4202",
    "restore-available-extensions.json": "eb01cd0f0a65f53edd6903a3067b1cb3c9de3db9d78d3d8507c0e47d15e5b3f1",
    "restore-available-extensions.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-catalog-fingerprint.json": "8b88298dfff8c4772c6bcb82ecaacd5c3d2f3888330dcd07ffd868dbe4a00a14",
    "restore-catalog-fingerprint.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-database.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-database.stdout": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-pristine-target.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-pristine-target.stdout": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-report.json": "dbe918838c5431bd5ad4d86cdfeaa9430ab8f06c9680e0d2e84f630e6c6fc9ad",
    "restore-roles.stderr": "a65bf00c96e358db67414ce3f3dbcce1cf91d40d45f7777a71ea2b3ad5f4f133",
    "restore-roles.stdout": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "restore-version.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "roles.sql": "25f51334654278b57956cf446e7fe8bb603acac700bcbfe28112aa780cd1898f",
    "source-catalog-fingerprint.json": "4be8d692232e9046975802e39909853e992e3344e0721de9d4302f147dc05620",
    "source-catalog-fingerprint.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dependencies.json": "3b59ab2c37a07e9e24c4c1fcb63cb5928025054797eb7999f0cac93db4e53658",
    "source-dependencies.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dump.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-dump.stdout": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source-roles.stderr": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "verified_by": "PROJECT_OWNER"
}
```

---

### 5.3. İmza Matrisi Ön Koşulları ve Kapatma Sıralaması (`HOLD-042-03` — `CONTROLLER İMZASI BEKLİYOR`)

§8.3'teki imza matrisinin `SIGNED` duruma geçirilmesi katı bağımlılık sırasına bağlanmıştır:
1. **Ön Koşul 1:** `HOLD-042-01` (Sahip sanitize deşifre makbuzu — `39959869290-local-recovery-receipt.json`) tamamlandı.
2. **Ön Koşul 2:** `HOLD-042-02` (Docker `supabase/postgres:17.6.1.141` üzerinde Run `44391665320` @ `cea570eb` `7/7` + `VERIFIED_LOGICAL_RESTORE` + sahip makbuzu `REC-44391665320-OWNER-DECRYPT`) tamamlandı.
3. **Ön Koşul 3:** Terminal commit exact-SHA'sı (`HEAD`) belirlenmiş ve Git `HEAD` & CI Run URL'i üzerinden bağlanmış olmalıdır.
4. **Ön Koşul 4:** GitHub Actions CI (`LARI Independent Acceptance CI` ve `LARI PG17 Role Restore Qualification`) bu exact-SHA üzerinde `SUCCESS` vermelidir.
5. **Nihai İmza:** Yalnızca yukarıdaki 4 şart sağlandıktan sonra Bağımsız Controller (`Codex`) §8.3 imza tablosunu onaylar. Controller final imzası verilene kadar **`HOLD_PRESERVED`**, **`ISSUE #10 = OPEN`** ve **`PRODUCTION = NO_GO`** değişmez yönetim kararıdır.

---

## 6. PG-Dışı Platform Kurtarma Kapsamı (Non-PG Platform Assets — Issue #10 Madde 6)

PostgreSQL mantıksal SQL yedeği (`pg_dump` / `pg_dumpall`) tek başına tüm Supabase platformunu kurtarmaz. Aşağıdaki 5 PG-dışı varlık sınıfı için ayrıştırılmış kurtarma kapsamı tanımlanmıştır:

| PG-Dışı Varlık | `lari-staging` Gözlenen Durum | Mantıksal Dump Kapsamı | Ayrıştırılmış Kurtarma Prosedürü & Doğrulama Kapısı |
| :--- | :--- | :---: | :--- |
| **1. Supabase Storage Object Bytes** | `storage.buckets = 0`, `storage.objects = 0` (`lari-staging` üzerinde henüz ikili medya nesnesi yoktur; şema/politikalar mevcuttur). | Metadata (`storage` tabloları) dahil; **nesne baytları HARİÇ** | `lari-public-media` / `lari-private-secure` kovaları dolduğunda, S3-uyumlu/Storage API üzerinden şifreli nesne senkronizasyonu + SHA-256 manifesti ayrı alınır; geri yüklemede `storage.objects` kayıtlarıyla nesne anahtarı/boyut paritesi doğrulanır (`docs/MEDIA_STORAGE_AND_ASSET_OPERATIONS.md`). |
| **2. Offsite Backup Custody** | Canlı Run `44391665320` `.age` arşivi (`5347f291...`) + `manifest.json` sahip tarafından `2026-11-19T11:52:50Z` tarihinde GitHub/Supabase dışı özel/kısıtlı Google Drive hedefine (`GOOGLE_DRIVE_PRIVATE_RESTRICTED`) yüklenip hedef SHA-256 doğrulaması yapıldı; ek yerel Git-dışı scratch kopya `lari_pg17_post041c_dr_backup_rwedeejhjazwjthdjzrt` mevcuttur. | **KAPSAR — BAĞIMSIZ BULUT OFFSITE DOĞRULANDI** | Sahip, `lari-zero-cost-logical-backup.yml` çıktısı olan `.age` şifreli arşivi + `manifest.json` dosyasını 7 günlük GH saklama süresi dolmadan indirip SHA-256 doğrulamasıyla GitHub/Supabase dışı ayrı/kısıtlı bulut veya çevrimdışı medyaya arşivler (`2026-11-19T11:52:50Z` itibarıyla `GOOGLE_DRIVE_PRIVATE_RESTRICTED` üzerinde hedef `.age` SHA-256 `5347f291a664b4084d929df2496eb9475de9e5845fab52a95b5bfa77e1480f95` doğrulandı; kurtarma anahtarı ayrıca passphrase-şifreli & kısıtlı tutulur). |
| **3. Platform Secrets & Auth Provider Keys** | `.env` / Git içinde canlı sır yoktur (`0 Secret`). | **HARİÇ** | İsim-bazlı envanter: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DB_PASSWORD`, `LARI_STAGING_POOLER_HOST`, `LARI_BACKUP_AGE_RECIPIENT`, off-platform `lari-staging-backup.agekey`, Vercel env vars ve `EXTERNAL_HOLD` anahtarları (`IYZICO_*`, `GEMINI_API_KEY`, SMS/WABA/SMTP). Kurtarmada sahip parola kasasından yeniden enjekte edilir ve `npm run check:secrets` + `npm run check:payment-env` ile doğrulanır. |
| **4. Edge Functions (`supabase/functions/`)** | `11` Edge Function + `6` `_shared/` modülü Git kaynak kontrolünde kanonik durumdadır. | **HARİÇ** (platform dağıtımı) | `ai-quota-check`, `ai-recommendation`, `ai-visualization`, `clinic-ai-draft`, `clinic-ai-transcribe`, `create-billing-portal-session`, `create-checkout-session`, `ht-ai-chat`, `payment-health`, `payment-webhook`, `subscription-sync` fonksiyonları exact commit SHA'dan `supabase functions deploy` ile yeniden dağıtılır, Edge secret'ları atanır ve `npm run check:edge-contracts` koşulur. |
| **5. Supabase Vault (`vault` şeması / `supabase_vault`)** | `vault_schema_exists = true`, `supabase_vault 0.3.1` kurulu. | Kök şifreleme anahtarları **HARİÇ** | Vault kök anahtarları Supabase platformu tarafından yönetilir. Kurtarmada hedef projede `supabase_vault` etkinleştirilir, uygulama sırları düz metin yedeğe dökülmeden yetkili operatör/Dashboard üzerinden yeniden tanımlanır. |

---

## 7. Sunucu / CI Tarafı Production Release-Enforcement & Başarısız Bypass Kanıtı (Issue #10 Madde 7)

Üretim geçişi (`PRODUCTION = GO`) yalnızca tarayıcı bayraklarına veya `.env` boolean değerlerine bırakılamaz. Çok katmanlı kilitleme ve başarısız bypass kanıtları şunlardır:

1. **Veritabanı Otoritesi (`public.platform_global_release_control` — `20260822` / `20260829`):**
   - Tekil satır (`id = 1`) varsayılan olarak `release_phase = 'pre_pilot'`, `is_payment_collection_enabled = false`, `is_checkout_enabled = false`, `is_iyzico_enabled = false` durumundadır.
   - `PUBLIC`, `anon` ve `authenticated` rollerinin tüm doğrudan tablo yetkileri geri alınmıştır (`REVOKE ALL`).
   - `super_admin_transition_release_phase(...)` yalnızca `pre_pilot <-> paymentless_pilot` geçişine izin verir; `full_production` gibi yetkisiz faz taleplerini `INVALID_RELEASE_PHASE` ile, ödeme bayrakları açıkken geçişi `PAYMENT_SAFETY_VIOLATION` ile reddeder.
2. **İstemci Tarafı Bypass Reddi (`services/paymentRunModeService.ts`):**
   - `setInternalDiagnosticsMode('production_live')` çağrısı veya tarayıcı `localStorage.internal_run_mode` müdahalesi güvenlik uyarısıyla reddedilir; `production_live` modunda `canRunCheckout` ve `isPaymentCollectionAuthorized` daima `false` döner ve `Issue #10 Prodüksiyon Yayın Engeli henüz çözülmedi` blokerini korur.
3. **CI / Politika & Hard-Gate Bypass Reddi (`capture_release_policy.py` & `verify-lari-recovery-hard-gate.mjs`):**
   - `scripts/backup/capture_release_policy.py`, `UNVERIFIED_ENCRYPTED_CAPTURE` çıktısında `p0_eligible: false` sabitler; eksik/bozuk/uyumsuz kanıtta `NO_ARTIFACT_ELIGIBLE` (exit `1`) üretir.
   - `.github/workflows/lari-independent-acceptance-ci.yml`, `expected_sha` ile `git rev-parse HEAD` eşleşmezse veya çalışma ağacı kirliyse (`git status --porcelain`) işi fail-closed durdurur.
   - `evaluateProductionReleaseEnforcement` (`scripts/verify-lari-recovery-hard-gate.mjs` ve `scripts/verify-disposable-pg17-pristine-restore.mjs`): `clientLocalStorageOverride: true`, `envForceGoBypass: true` veya `unverifiedCapturePromoted: true` geçirildiğinde diğer tüm alanlar `true` olsa bile **`allowed: false`, `verdict: RELEASE_BLOCKED_FAIL_CLOSED`, `productionStatus: NO_GO`, `bypassRejected: true` (`CLIENT_OR_ENV_BYPASS_REJECTED` / `UNVERIFIED_CAPTURE_PROMOTION_REJECTED`)** döndürür (otomatik kapı doğrulaması teslim sonrası `loop.py` `TESTING` evresinde senkron olarak çalıştırılır).

---

## 8. Exact Hedef SHA Zinciri, Geri Alma (Rollback) Planı & İmza Matrisi (Issue #10 Madde 8)

### 8.1. Exact Hedef SHA Referansları

| Aşama | Exact Commit SHA / Referans | Durum |
| :--- | :--- | :--- |
| **Kanonik Staging Merge (`ADIM-040` PR #34)** | `29c75164313114f306f49fcf05682aeb83eb1532` (`staging/supabase-staging-consistency`) | Birleştirildi (`AUTO_MERGE = DISABLED`) |
| **Canlı Staging Uzlaştırma (`ADIM-041C`)** | `e9c2da1be91f7c3a6888bd53ce089889cafcfa54` (`20261117033457`, SHA-256 `7ced58f3...`) | `lari-staging` üzerinde `APPLIED_AND_VERIFIED` |
| **Önceki ADIM-042 Dokümantasyon Hizalaması** | `9400477ca309fe0ce556e59ef0d2ed2016c74419` (CI Run [`44018570590`](https://github.com/MertSGI/Randapp-main/actions/runs/44018570590) `4/4 SUCCESS`) | Doğrulandı |
| **Staging `HOLD-042-02` `VERIFIED_LOGICAL_RESTORE` (PR #38)** | `cea570eb9e9bef8c3a97a12e32e109d1dd30c877` (Backup Run [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320), Artifact `14468557307`) | `VERIFIED_LOGICAL_RESTORE` |
| **Bu Teslimin Hedef Commit SHA'sı** | *Döngüsel referans yasağı gereği bu dosyaya gömülmez; commit sonrası Git `HEAD` & CI Run URL'i üzerinden bağlanır.* | `PENDING_CI_AND_AUDIT` |

### 8.2. Felaket & Hatalı Yayın Geri Alma (Rollback) Planı

1. **Uygulama / Hosting Katmanı (Vercel):**
   - Herhangi bir bozuk yayında Vercel Dashboard veya `vercel rollback` üzerinden bir önceki doğrulanmış exact-SHA deployment'a (`29c75164` / stabil staging SHA) anında geri dönülür; `VITE_DATA_MODE` ve `VITE_PAYMENT_RUN_MODE=local_dry_run` korunur.
2. **Yayın Fazı Katmanı (`platform_global_release_control`):**
   - `paymentless_pilot` geçişi sonrası anomali görülürse `super_admin_transition_release_phase('paymentless_pilot', 'pre_pilot', '<rollback_reason>', '<new_idempotency_key>')` çağrısı ile `pre_pilot` kilidine tek adımda dönülür (`scripts/run-paymentless-real-pilot-rollback.mjs` ile uyumlu).
3. **Veritabanı Şema & Veri Katmanı (`lari-staging` / Hedef PG17):**
   - **İleri-Yönlü Şema Düzeltmesi:** Mevcut `schema_migrations` geçmişi silinmeden düzeltici forward SQL hazırlanır, önce izole PG17 klonunda 2-geçişli test edilir (`verify-disposable-pg17-pristine-restore.mjs`).
   - **Tam Snapshot Kurtarma:** Kritik veri kaybında Supabase Dashboard PITR / Daily Backup veya sahip onaylı `age` deşifreli yedek + `lari_pg17_post041c_dr_backup_rwedeejhjazwjthdjzrt` 7 parçalı yedeği (`roles_globals.sql` → `extensions_schema.sql` → `migrations_history.sql` → `auth_schema_and_data.sql` → `storage_schema_and_data.sql` → `public_full_schema.sql` → `public_data.sql`) temiz hedefe yüklenir ve `5/5` `42501` RLS probları + Edge Functions (`supabase functions deploy`) + Storage/Vault yeniden doğrulaması koşulur.

### 8.3. Sahip & Bağımsız Controller İmza Matrisi (`UNSIGNED / HOLD`)

| Rol | Yetki Kapsamı | Durum | Tarih / Kanıt |
| :--- | :--- | :---: | :--- |
| **Proje Sahibi (Owner)** | `age` deşifre makbuzları (`REC-39959869290-OWNER-DECRYPT` & `REC-44391665320-OWNER-DECRYPT`, `5347f291...` `.age` SHA-256 + 25 dosya doğrulaması), bağımsız offsite bulut muhafazası (`GOOGLE_DRIVE_PRIVATE_RESTRICTED`, `2026-11-19T11:52:50Z`, hedef SHA-256 `5347f291...` + `manifest.json`), Docker `44391665320` `VERIFIED_LOGICAL_RESTORE` onayı | **`SIGNED_BY_OWNER (`01–03` SAHİP TAMAM)`** | `39959869290-local-recovery-receipt.json` · `REC-44391665320-OWNER-DECRYPT` · `GOOGLE_DRIVE_PRIVATE_RESTRICTED` (`2026-11-19T11:52:50Z`) · [`44391665320`](https://github.com/MertSGI/Randapp-main/actions/runs/44391665320) |
| **Bağımsız Controller (Codex)** | `HOLD-042-01` & `HOLD-042-02` kabul edildi; `HOLD-042-03` exact-SHA (`Independent Acceptance CI` + `PG17 Role Restore Qualification`) & `REC-44391665320-OWNER-DECRYPT` son imzası bekliyor | **`PARTIAL (`01–02` ACCEPTED / `03` PENDING)`** | `e315394a` denetimi |

### Bağlayıcı Karar (`HOLD KORUNUYOR`)

* **GitHub Issue #10 (`MertSGI/Randapp-main#10`) KESİNLİKLE KAPATILMAYACAKTIR.**
* `HOLD-042-01` (`age` deşifre makbuzu), `HOLD-042-02` (Docker `supabase/postgres:17.6.1.141` üzerinde Run `44391665320` `VERIFIED_LOGICAL_RESTORE`) ve yeni artifact için sahip offsite + `age` deşifre makbuzu (`REC-44391665320-OWNER-DECRYPT`) tamamlanmış olsa da `HOLD-042-03` (exact hedef SHA üzerinde her iki CI ve Bağımsız Controller nihai imzası) tamamlanmadan **kullanıcıdan Issue #10 kapatma onayı istenmez**.
* `ISSUE #10 = OPEN / RED / BLOCKED (HOLD_PRESERVED)` ve **`PRODUCTION = NO_GO`** olarak korunur.
