# LARI - PERSISTENT DATABASE REQUIRED FOR LIVE (CANLI İÇİN KALICI VERİTABANI ZORUNLULUĞU)

LARİ platformu canlı üretime alındığında, **paymentless_limited_production** modunda dahi olsa, tüm aktif kiracı (salon) ve müşteri randevu verileri **kesinlikle kalıcı ve güvenli bir veritabanında** tutulmalıdır. 

Bu doküman, canlı sistemlerde tarayıcı tabanlı `localStorage` kullanımının neden kesinlikle kabul edilemeyeceğini ve üretim veritabanı (Supabase Postgres) gereksinimlerini teknik ve operasyonel olarak detaylandırmaktadır.

---

## 1. NEDEN LOCALSTORAGE CANLI SALONLAR İÇİN KABUL EDİLEMEZ?

Prototip aşamasında veya `local_pre_live` hazırlık modunda `localStorage` kullanımı pratik olsa da, gerçek dünyada canlıya geçildiğinde şu kritik sorunlara yol açar:

1.  **Tarayıcı Önbelleği ve Silinme Riski:** Kullanıcı tarayıcı geçmişini temizlediğinde, gizli sekme kullandığında veya tarayıcı güncellendiğinde tüm salon tanımları, personeller, fiyatlar ve alınan randevular **anında kalıcı olarak silinir**. Bu durum salon işletmeleri için telafi edilemez bir veri felaketidir.
2.  **Cihaz Bağımsızlığı Eksikliği (No Sync):** Veriler yalnızca o anki tarayıcının yerel diskinde saklandığı için, salon sahibi cep telefonundan girdiği verileri bilgisayarında veya bir diğer çalışan tabletinde göremez. Canlı bir salon her zaman çoklu cihaz erişimine ihtiyaç duyar.
3.  **Müşteri Rezervasyon Sayfası Kopukluğu:** Salon müşterileri kendi evlerindeki cihazlardan salonun rezervasyon sayfasına (`randevulari.com/booking/salon-slug`) girdiklerinde, salonun personellerini veya boş saatlerini göremezler. Çünkü o veriler salon sahibinin tarayıcısının yerel belleğindedir ve internete açık değildir.
4.  **Güvenlik ve İzolasyon Yoksunluğu:** Tarayıcı tarafındaki veriler her türlü istemci (client-side) müdahalesine açıktır. Kötü niyetli kişiler tarayıcı konsolu üzerinden verileri manipüle edebilir veya silebilir.

Bu nedenle, **canlı yayına alınmış tüm salonlar gerçek bir ilişkisel veritabanına (Supabase Postgres) bağlanmak zorundadır.**

---

## 2. SUPABASE POSTGRES VE SATIR SEVİYESİ GÜVENLİK (RLS)

Canlı ortamda veritabanı güvenliği ve kiracı izolasyonu için **Supabase Postgres** tercih edilmiştir:

### Kiracı İzolasyonu (Tenant Isolation)
Tüm tablolar (şubeler, çalışanlar, hizmetler, randevular, abonelikler) bir `tenant_id` sütununa sahiptir. Bir salon yöneticisi sisteme giriş yaptığında, arka planda çalışan sorgular her zaman bu `tenant_id` ile filtrelenir.

### Row Level Security (RLS)
Supabase üzerinde her tablo için Satır Seviyesi Güvenlik (RLS) politikaları zorunlu kılınmıştır:
*   Bir salon sahibi yalnızca kendisine ait `tenant_id` verilerini okuyabilir ve yazabilir.
*   Genel rezervasyon müşterileri yalnızca randevu almak istedikleri salonun çalışma saatleri, personelleri ve aktif hizmet kataloğu verilerini okuyabilir, diğer kiracıların hassas finansal veya müşteri listesi bilgilerine asla erişemezler.

---

## 3. VERİTABANI YEDEKLERİ VE GERİ YÜKLEME (BACKUP & RESTORE)

*   **Günlük Yedekleme (Automated Backups):** Supabase Production veritabanı üzerinde günlük otomatik yedekleme (backup) politikası tanımlanmıştır. Her gece saat 03:00'te veritabanının tam bir kopyası (snapshot) alınır.
*   **Manuel Dışa Aktarma (Super Admin Export):** Süper Admin paneli üzerinden tüm kiracı tablosu ve randevu kayıtları Excel/JSON formatında tek tuşla indirilerek kurucuların bilgisayarlarında lokal olarak da yedeklenir.
*   **Geri Yükleme (Restore):** Veri bozulması durumunda, en son stabil yedek dosyası Supabase CLI veya pgAdmin arayüzü kullanılarak canlı veritabanına geri yüklenir.

---

## 4. PRE-LIVE MODUNDAN CANLIYA VERİ TAŞIMA (MIGRATION)

Eğer bir pilot salon yerel hazırlık modunda (`local_pre_live`) kendi personel ve hizmet verilerini girmiş ve bunları kaybetmek istemiyorsa, izlenecek taşıma adımları:

1.  Salon sahibinin tarayıcı önbelleğindeki `localStorage` verileri "Dışa Aktar" (JSON Export) butonuyla indirilir.
2.  Süper Admin canlı veritabanında salon için `tenant_id` oluşturur ve hesabı `manual_active` yapar.
3.  Lokal JSON dosyası, canlı admin panelindeki "Verileri İçeri Aktar" arayüzü üzerinden Supabase veritabanına topluca yüklenir (bulk insert).

---

## 5. MİNİMUM VERİTABANI DUMAN TESTİ (SMOKE TEST)

Canlı veritabanı entegrasyonunun sorunsuz çalıştığını doğrulamak için yapılacak minimum test adımları:

1.  **Bağlantı Testi:** `/api/health` veya admin giriş sayfasında Supabase sunucusuna başarılı ping atıldığı doğrulanmalıdır.
2.  **Yazma Testi:** Yeni bir hizmet veya personel eklendiğinde, verinin sayfayı yeniledikten sonra da ekranda kaldığı ve Supabase konsolunda ilgili satırın oluştuğu görülmelidir.
3.  **İzolasyon Testi:** Tarayıcıda A salonu açıkken, gizli sekmede B salonu açılmalı ve B salonunun A salonuna ait personelleri veya randevuları kesinlikle göremediği teyit edilmelidir.

---

## 6. SUPABASE STAGING READINESS VERIFICATION PIPELINE

Static code quality and QA checks are important, but do not fully guarantee live database compatibility. A successful **real staging smoke test** is a strict prerequisite for any production live cutover. iyzico credit card processing is not required for these staging procedures.

### Core Database Safety Guidelines:
* **Static QA is not enough**: Code compiling and passing local unit tests does not prove that schema migrations or row-level security policy statements are correct. Active migrations must be verified conflict-free before pushing to real staging.
* **Never manually skip migrations**: Always execute the active migrations in alphabetical/chronological sequence. No file should be manually skipped unless detailed in `/supabase/MIGRATION_APPLY_MANIFEST.md`.
* **Integrity First**: Always run the migration integrity suite (`npm run qa:supabase-migration-integrity`) prior to running staging smoke tests to capture schema, policy, and compliance leaks.
* **RLS Assertions**: Row Level Security smoke tests (`supabase/tests/paymentless_production_rls_smoke.sql`) must be run directly on the database after applying migrations to verify multi-tenant isolation.
* **App-Level Verification**: Run the app-level staging smoke test (`npm run smoke:supabase-paymentless-staging`) only after the staging credentials are fully configured in the `.env` file.

### Execution Resources:
- **Real Staging Operator Guide**: [Real Staging Operator Guide](./REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md)
- **Staging Execution Result Log**: [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md)
- **Staging Browser Smoke Checklist**: [Staging Browser Smoke Checklist](./SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md)
- **Staging Command Sheet**: [Staging Command Sheet](./SUPABASE_STAGING_COMMAND_SHEET.md)
- **Canonical Apply Manifest**: [Migration Apply Manifest](../supabase/MIGRATION_APPLY_MANIFEST.md)
- **Execution Runbook**: [Supabase Staging Execution Runbook](./SUPABASE_STAGING_EXECUTION_RUNBOOK.md)
- **Staging Env Preflight Script**: `npm run qa:supabase-staging-env` ([preflight script](../scripts/verify-supabase-staging-env.mjs))
- **Migration Integrity Script**: `npm run qa:supabase-migration-integrity` ([migration script](../scripts/verify-supabase-migration-integrity.mjs))
- **RLS Tenant Isolation Smoke Test Plan**: [RLS Tenant Isolation Smoke Test](./SUPABASE_RLS_TENANT_ISOLATION_SMOKE_TEST.md) and SQL-level assertions [paymentless_production_rls_smoke.sql](../supabase/tests/paymentless_production_rls_smoke.sql)
- **App-Level Staging Smoke Test**: [smoke-supabase-paymentless-staging.mjs](../scripts/smoke-supabase-paymentless-staging.mjs)
- **Staging Seed Data Plan**: [Supabase Staging Seed Data Plan](./SUPABASE_STAGING_SEED_DATA_PLAN.md)

---

## 7. MANDATORY STAGING GATE WARNINGS
* **STAGING SUCCESS REQUIRED**: Paymentless production cannot proceed under any circumstances before a real physical Supabase Staging smoke test passes. This pass must be officially documented in the [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md).
* **ONLINE PAYMENT EXEMPT**: Real online payment via iyzico, SMS integrations, or real message gateway providers is NOT required for staging or launching.
* **NO LOCALSTORAGE**: Using `localStorage` is strictly forbidden for live operational tenant data. Real persistent databases (Supabase Postgres) are mandatory.


