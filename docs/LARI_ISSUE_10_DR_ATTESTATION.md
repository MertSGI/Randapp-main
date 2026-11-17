# LARİ — GitHub Issue #10 Felaket Kurtarma (DR Restore) Ara Kanıt Paketi & Açık Kontrat Matrisi

**Belge Kimliği:** `LARI-DOC-ISSUE-10-DR-ATTESTATION-20261117`  
**Referans Adımlar:** `ADIM-041` (`ADIM-041C` Staging Reconciliation & P0 Hardening @ `e9c2da1b`) → `ADIM-042` (`Faz I3: GitHub Issue #10 DR Restore Kanıtı & Kapanış Kontratı`)  
**Hedef Supabase Staging Projesi:** `lari-staging` (`PROJECT_REF: rwedeejhjazwjthdjzrt`)  
**Post-Cutover Migrasyon Kimliği:** `20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql` (`SHA-256: 7ced58f32a3cdf759bd35292f00cc0bc745d64778e59e1e30813275b647f313e`)  
**GitHub Issue #10 Durumu:** **`OPEN / RED / BLOCKED — HOLD KORUNUYOR`** *(`issue_10_auto_closed: false` — Teknik PG 17.12 mantıksal geri yükleme tamamlanmıştır; ancak Issue #10'daki 8 maddelik kapanış kontrol listesinin tamamı karşılanmadan Issue #10 KAPATILAMAZ ve kapatma onayı talep edilmez)*  
**Resmi Canlı Kesim Kararı:** **`PRODUCTION = NO_GO`**  
**Tarih:** 17 Kasım 2026

---

## 1. Yönetici Özeti ve Kapsam Sınırları

Bu belge, **GitHub Issue #10 (`[P0][PRODUCTION RELEASE BLOCKER] Verify independent PostgreSQL recovery before any production go-live`)** kapsamında yürütülen teknik PG 17.12 mantıksal yedek/geri yükleme tatbikatının gerçek kapsamını ve **Issue #10'un kapatılabilmesi için hâlâ açık olan zorunlu maddeleri** dürüstçe ve dar kapsamda kayıt altına alır:

1. Canlı `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde `ADIM-041C` ileri yönlü şema uzlaştırması ve P0 güvenlik sertleştirmesinin (`20261117033457`, kaynak commit `e9c2da1be91f7c3a6888bd53ce089889cafcfa54`) uygulanması sonrası alınan 7 parçalı salt-okunur SQL yedeği,
2. Alınan 7 parçalı yedeğin Git deposu dışında saklanarak sıfırdan izole **PostgreSQL 17.12** kümesine geri yüklenmesi (`restore_elapsed_ms = 10,063 ms` / `10.063 sn`) ve **yalnızca ölçülen kapsamda** (`80/80` `schema_migrations`, `120` public tablo sayısı, `236` public fonksiyon sayısı, **18 seçili tabloda satır sayısı eşitliği** ve `5/5` `DENIED_42501` negatif RLS probu) doğrulanması,
3. Yerel tek-kullanımlık PG17 pristine restore (`scripts/verify-disposable-pg17-pristine-restore.mjs`) ve hard-gate (`scripts/verify-lari-recovery-hard-gate.mjs`) doğrulama sınırları,
4. **GitHub Issue #10 Tam Kapanış Kontrol Listesi (8 Madde) Boşluk Analizi:** Şifreli özgün capture (`38b5dbfd...`) deşifre/bütünlük makbuzu, 7 kategorili tam katalog eşitliği, PG-dışı platform varlıklarının (Supabase Storage object bytes, offsite backup, platform secrets, Edge Functions, Vault) kurtarma kanıtı ve sunucu/CI tarafı production release-enforcement (bypass-reddi) kanıtları tamamlanmadan **Issue #10 kapatılamaz (`HOLD` korunur)**.

### Değişmez Yönetişim ve Güvenlik Kuralları

| Kontrol | Durum | Açıklama |
| :--- | :---: | :--- |
| **GitHub Issue #10** | `OPEN / RED / BLOCKED` (`HOLD`) | Teknik PG 17.12 mantıksal SQL restore kanıtı üretilmiştir; ancak Issue #10'un 8 maddelik kapanış şartları henüz eksiksiz tamamlanmadığı için **Issue #10 kapatılmaz ve kullanıcıdan erken kapatma onayı istenmez**. |
| **Canlı Kesim Kararı** | `PRODUCTION = NO_GO` | Issue #10'un tüm 8 maddesi bağımsızca doğrulanıp kapatılmadan ve Faz I4–I6 (`ADIM-043..045`) tamamlanmadan canlı kesim yasaktır. |
| **Kimlik & Sır Güvenliği** | `0 Secret / 0 PII` | Service Role Key, DB parolası, `age` private key, JWT veya müşteri PII verisi bu belgeye, Git reposuna veya kanıt JSON'larına yazılmamıştır. |
| **Yedek Konumu** | `Git Dışı (Scratch)` | 7 parçalı SQL yedeği hiçbir Git çalışma ağacı içinde değil, yalnızca yerel çalışma dışı `scratch/` dizininde tutulmuştur. |
| **Genel Uzak Yazma** | `NO_REMOTE_DB_WRITE = TRUE` *(Yeniden Kilitli)* | Yalnız `ADIM-041C` için `2026-11-16T19:46:33+03:00` tarihli tek seferlik kullanıcı yetkisi kullanılmış ve işlem sonunda genel `NO_REMOTE_DB_WRITE` kilidi yeniden devreye alınmıştır; `ADIM-042` DR tatbikatı `lari-staging` üzerinde tamamen salt-okunur (`READ-ONLY`) yürütülmüştür. |

---

## 2. Post-Cutover `ADIM-041C` Canlı Staging Başlangıç Durumu

DR tatbikatından hemen önce `lari-staging` (`rwedeejhjazwjthdjzrt`) üzerinde `ADIM-041C` (`20261117033457_adim041c_forward_reconciliation_and_p0_hardening.sql`, repo commit `e9c2da1b`) tek transaction (`lock_timeout = '5s'`, `statement_timeout = '120s'`) içinde uygulanmış ve `adim041c_staging_execution_receipt.json` (`status: APPLIED_AND_VERIFIED`) ile doğrulanmıştır:

* **Repo vs Canlı Migrasyon Sayısı Ayrımı:**
  * **Kanonik Repo (`supabase/migrations/`):** `99` aktif SQL migrasyon dosyası (`001..005`, `20260601..20261012` ve `20261117033457`). Tarihsel olarak birleştirilmiş/arşivlenmiş `22` dosya `supabase/archive/` altındadır.
  * **Canlı `lari-staging` (`supabase_migrations.schema_migrations`):** `80` kayıt (`75` ortak geçmiş + uzaktaki 4 adet `20261008*` remote-only kaydı `20261008063020`, `20261008063027`, `20261008063031`, `20261008063041` + ileri yönlü uzlaştırma migrasyonu `20261117033457`).
* **Katalog Sayımları:** `120` tablo (`public`), `236` uygulama fonksiyonu (`public`), `provider_token` sütunu mevcut (`true`), `payments.amount` tipi `numeric`, `idx_subscriptions_unique_tenant` mevcut (`true`), `clinic_ai_func_count = 1`, eski bypass overload'ları (`legacy_create_public_booking_13arg = 0`, `legacy_manage_token_1arg = 0`).
* **P0 Güvenlik & PostgREST Probları:**
  * `appointment_access_tokens`, `consent_ledger`, `policy_acceptances`: `anon` için `SELECT`/`INSERT`/mutasyon yetkileri kapalı (`false`), legacy açık politika yok (`open_policy_present: false`).
  * Canlı PostgREST `anon` doğrudan tablo istekleri: `GET appointment_access_tokens` → `401`, `POST consent_ledger` → `401`, `POST policy_acceptances` → `401`.
  * Canlı PostgREST `anon` güvenli RPC istekleri: `get_public_commercial_plan_catalog` → `200`, `can_accept_public_booking` → `200`, kısa token kontrolü → `200 (invalid_token)`, geçersiz slug kontrolü → `200 (allowed: false)`.

---

## 3. Gerçek `lari-staging` Snapshot Yedek & Sıfır-Hedefe Mantıksal DR Restore Tatbikatı (`ADIM-042`)

**Kanıt Kaynağı:** `hafiza/reconciliation_ADIM041/pg17_post041c_dr_proof.json` & `hafiza/reconciliation_ADIM041/pg17_post_cutover_dr_drill.py`  
**Tatbikat Zaman Damgası (UTC):** `2026-11-17T03:56:05.946639+00:00`  
**Hedef DR Motoru:** `PostgreSQL 17.12 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit`  
**Git Dışı Yedek Dizin Yolu:** `C:\Users\ataberktadm\.gemini\antigravity\scratch\lari_pg17_post041c_dr_backup_rwedeejhjazwjthdjzrt`

### 3.1. 7 Parçalı Salt-Okunur Yedek Envanteri ve Ölçülen Süre Metrikleri

Yedekleme `pg_dumpall.exe` / `pg_dump.exe` (`17.12`) ile salt-okunur yakalanıp temiz `initdb` ile sıfırdan başlatılan izole `127.0.0.1:55440` PG 17.12 kümesine geri yüklenmiştir:

| Yedek Parçası / Metrik | Değer / Kapsam |
| :--- | :--- |
| **Yedek Parçaları (7 Dosya)** | `roles_globals.sql`, `public_full_schema.sql`, `public_data.sql`, `migrations_history.sql`, `extensions_schema.sql`, `auth_schema_and_data.sql`, `storage_schema_and_data.sql` |
| **Yedek Alma Süresi (`dump_elapsed_ms`)** | `92,796 ms` (`92.796 sn`) |
| **Sıfırdan Restore Süresi (`restore_elapsed_ms` / Ölçülen RTO)** | **`10,063 ms` (`10.063 sn`)** *(Not: `10.063 sn > 10.000 sn` olduğu için `< 10s` olarak iddia edilmez; tam ölçülen değer `10.063 sn`dir)* |
| **Seçili Tablo Satır Eşitliği Kapsamı** | **18 seçili tabloda** (`table_row_counts`) anlık snapshot satır sayısı eşitliği (`18/18` — tüm 120 tablo için tam satır/veri sağlama toplamı veya sürekli RPO=0 iddiası değildir) |

### 3.2. Post-Restore Ölçülen Katalog Özeti ve 18 Seçili Tablo Satır Eşitliği

`pg17_post_cutover_dr_drill.py:212-215` tarafından doğrudan karşılaştırılan alanlar şunlardır (tam 7 kategorili katalog/grant/policy/index/trigger/constraint diff paritesi henüz bu betik kapsamında değildir):

| Doğrulama Kalemi | Canlı `lari-staging` | Restore Edilen PG 17.12 | Durum |
| :--- | :---: | :---: | :---: |
| **`schema_migrations` Sayısı** | `80` (`20261117033457` dahil) | `80` (`20261117033457` dahil) | `EŞİT` |
| **Korunan `20261008*` Remote-Only Kayıtları** | `4` (`20261008063020`, `20261008063027`, `20261008063031`, `20261008063041`) | `4` | `EŞİT` |
| **`public` Tablo Sayısı (`table_count`)** | `120` | `120` | `EŞİT` |
| **`public` Uygulama Fonksiyon Sayısı (`app_func_count`)** | `236` | `236` | `EŞİT` |
| **`subscriptions.provider_token` & `payments.amount` Tipi** | `true` / `numeric` | `true` / `numeric` | `EŞİT` |
| **18 Seçili Tablo Satır Sayısı (`table_row_counts`)** | `tenants=3`, `branches=2`, `services=6`, `staff=4`, `customers=53`, `appointments=1`, `appointment_access_tokens=1`, `consent_ledger=354`, `policy_acceptances=0`, `customer_segments=0`, `plans=9`, `plan_versions=9`, `plan_entitlements=249`, `subscriptions=2`, `payments=0`, `reviews=0`, `customer_favorites=0`, `auth_users=5` | Birebir aynı (`18/18` seçili tablo) | `PASS` |

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

---

## 4. Yerel PG17 Pristine Restore ve Hard-Gate Doğrulama Sınırı

* **Yerel Doğrulama Komutları (`Randapp-LARI-PILOT3`):**
  * `node scripts/verify-disposable-pg17-pristine-restore.mjs` (`LARI_REQUIRE_REAL_PG17=1`) → `PASS` (`PG17(170011)`, `Tables=120`, `Policies=163`, `Routines=281`, `5/5` negatif fail-closed kontrolü, `99` migrasyon dahil).
  * `node scripts/verify-lari-recovery-hard-gate.mjs` → `PASS` (`19/19`).
  * `node scripts/verify-supabase-migration-integrity.mjs` → `PASS` (`0`).

---

## 5. GitHub Issue #10 Kapanış Sözleşmesi Hizalama Matrisi (`HOLD` Korunuyor)

GitHub [`Issue #10`](https://github.com/MertSGI/Randapp-main/issues/10) (`Release-blocking checklist — all required before closing`) maddelerinin güncel tamamlanma durumu aşağıdadır:

| # | Issue #10 Zorunlu Kapanış Kriteri | Mevcut Durum | Açıklama / Eksik Kanıt |
| :-: | :--- | :---: | :--- |
| 1 | **Şifreli Capture Korunması & `age` Alıcı Doğrulaması** (`UNVERIFIED_ENCRYPTED_CAPTURE`, ID `12504131775`, Run `39959869290`, SHA-256 `38b5dbfd3c87a51160c7f5f4cda6368d5ac941e0e3e0ac47342d3cba47f212ea`) | `BEKLİYOR (UNVERIFIED)` | Yalnızca sahip makinesinde bulunan şifreli capture ve `age` alıcı eşleşmesi bağımsız Controller makinesinde henüz doğrulanmamıştır. |
| 2 | **Sahip Tarafı Yerel Deşifre & Kriptografik Bütünlük Makbuzu** (`Sanitized Receipt`) | `BEKLİYOR (UNVERIFIED)` | `age` kimlik dosyasının varlığı deşifre kanıtı sayılmaz; private key paylaşılmadan gerçek deşifre ve bütünlük makbuzu üretilmelidir. |
| 3 | **İzole Üretim-Dışı PostgreSQL 17 Mantıksal Geri Yükleme** | `TAMAMLANDI (PG 17.12 SQL)` | Post-`ADIM-041C` 7 parçalı mantıksal SQL yedeği izole PG 17.12 kümesine `10.063 sn` (`10,063 ms`) sürede geri yüklenmiş ve `5/5` negatif RLS probu doğrulanmıştır. |
| 4 | **7 Kategorili Kaynak/Hedef Şema, Rol, Grant ve Katalog Eşitliği** | `KISMİ (EKSİK)` | Şu ana kadar `80/80` migrasyon, `120` tablo sayısı, `236` fonksiyon sayısı ve **18 seçili tablo satır sayısı** karşılaştırılmıştır; 7 kategorili tam şema/rol/grant/policy/index/trigger/routine diff eşitliği henüz üretilmemiştir. |
| 5 | **Bağımsız Controller İncelemesi (Kapsam ve Sınırlamalar)** | `DEVAM EDİYOR (HOLD)` | Codex/Controller denetimi bu belgedeki kapsam sınırlarını doğrulamış ve eksik maddeler tamamlanana kadar `HOLD` kararını mühürlemiştir. |
| 6 | **PG-Dışı Platform Kurtarma Kapsamı** (`Supabase Storage object bytes`, `offsite backup`, `platform secrets`, `Edge Functions`, `Vault`) | `BEKLİYOR (EKSİK)` | PG mantıksal SQL geri yüklemesi tek başına tam platform kurtarma kanıtı değildir; Storage nesne baytları, offsite yedek, sırlar, Edge Functions ve Vault kurtarma prosedürü/kanıtı ayrı üretilmelidir. |
| 7 | **Sunucu / CI Tarafı Production Release Enforcement & Başarısız Bypass Kanıtı** | `BEKLİYOR (EKSİK)` | Tarayıcı/env boolean bayraklarına dayanmayan sunucu/CI yayın kilidi ve kasıtlı bypass denemesinin reddedildiğine dair kanıt henüz üretilmemiştir. |
| 8 | **Sahip + Bağımsız Controller Nihai Canlı Kesim İmzası, Exact Hedef SHA & Rollback Planı** | `BLOKELİ (NO_GO)` | Yukarıdaki 1–7 maddeleri eksiksiz tamamlanmadan canlı kesim onayı veya Issue #10 kapatma onayı talep edilemez. |

### Bağlayıcı Karar (`RET -> HOLD KORUNMALI`)

* **GitHub Issue #10 (`MertSGI/Randapp-main#10`) KESİNLİKLE KAPATILMAYACAKTIR.**
* Yedi kategorili katalog eşitliği, şifreli capture (`38b5dbfd...`) deşifre/bütünlük makbuzu, PG-dışı platform kurtarma kapsamı (Storage object bytes, offsite backup, secrets, Edge Functions, Vault) ve sunucu/CI release-enforcement kanıtı üretilmeden **kullanıcıdan Issue #10 kapatma onayı istenmez**.
* `ADIM-042` adımı **`HOLD`** durumunda ve resmi yayın kararı **`PRODUCTION = NO_GO`** olarak korunur.
