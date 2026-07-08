# LARI - PAYMENTLESS PRODUCTION CUTOVER PLAN (ÖDEMESİZ CANLIYA GEÇİŞ PLANI)

Bu doküman, LARİ platformunun online sanal POS entegrasyonu (iyzico) olmadan, gerçek sunucu, gerçek alan adı/SSL ve kalıcı veritabanı altyapısıyla canlı üretime (production) alınması için hazırlanan stratejik geçiş planıdır.

---

## 1. STRATEJİK HEDEF VE KAPSAM

Şirketleşme süreci henüz tamamlanmadığı için sanal POS (iyzico) canlı hesabı şu aşamada açılamamaktadır. Ancak LARİ kurucuları, sahada anlaştıkları ilk salonları sisteme dahil etmek, onlardan elden/havale ile ödeme almak ve bu geliri şirketleşme sürecini fonlamak için kullanmak istemektedir.

Bu doğrultuda, platform **paymentless_limited_production** (Ödemesiz Kısıtlı Canlı Üretim) modunda çalıştırılacaktır.

### Canlıda Aktif Olan Sistemler (What is Live)
*   **Gerçek Web Sunucusu:** Google Cloud Run üzerinde çalışan gerçek sunucu katmanı.
*   **Canlı Alan Adı ve SSL:** `randevulari.com` ana alan adı ve wildcard (`*.randevulari.com`) SSL sertifikası (HTTPS).
*   **Kalıcı Veritabanı:** Supabase Postgres canlı veritabanı. **ÖNEMLİ:** Canlı salon hesapları için kalıcı bir veritabanı (Supabase) kullanımı zorunludur. Tarayıcının yerel depolama (`localStorage`) alanı gerçek işletme verileri için kesinlikle kabul edilemez ve kullanılamaz.
*   **Gerçek Kiracı/Salon Verileri:** Gerçek salonların tanımları, şube bilgileri ve hizmet katalogları.
*   **Gerçek Müşteri Rezervasyon Akışı:** Salon müşterilerinin `randevulari.com/booking/[salon-slug]` adresinden gerçek zamanlı randevu oluşturabilmesi.
*   **Fiziksel / Elden Tahsilat Modeli:** Kurucuların salon sahiplerinden ödemeyi banka havalesi veya nakit alarak uygulama dışında (offline) takip etmesi. Uygulama içinde gerçek para çekimi yapılmaz.
*   **Süper Admin Manuel Aktivasyonu:** `/super-admin/provisioning` arayüzü ile Süper Admin'in kiracı hesaplarının abonelik durumunu doğrudan `manual_active` statüsüne geçirmesi. Bu işlem yalnızca bir üyelik/lisans aktivasyonudur, herhangi bir kaynak kod veya sunucu altyapısı teslimi anlamına gelmez. Salonlar yalnızca kendi işletme panellerine erişebilirler, platform mülkiyeti ve Super Admin yetkileri tamamen LARİ'dedir.

### Devre Dışı / Simüle Edilen Sistemler (What is Disabled / Simulated)
*   **iyzico Sanal POS Canlı Modeli:** Canlı kredi kartı çekimi ve otomatik tekrarlanan abonelik ödemeleri kapalıdır (`VITE_PAYMENT_MODE=disabled`).
*   **Doğrudan Kart Bilgisi Toplama:** Güvenlik ve PCI-DSS gereği, kullanıcıdan kredi kartı bilgisi toplayan form veya girdi kesinlikle bulunmaz.
*   **Otomatik Bildirim Gönderimi (SMS/WhatsApp):** Maliyet ve entegrasyon süreçleri nedeniyle SMS/WhatsApp sağlayıcıları canlıya bağlanana kadar giden kutusu simüle edilir (`VITE_COMMUNICATION_MODE=local_outbox_only`).
*   **Harici Sentry/Datadog Takibi:** Yerel tarayıcı konsolu ve sunucu logları üzerinden izleme yapılır.

---

## 2. GEREKLİ ALTYAPI GEREKSİNİMLERİ (REQUIRED INFRASTRUCTURE)

| Altyapı Bileşeni | Üretim Standartı | Açıklama |
| :--- | :--- | :--- |
| **Hosting** | Cloud Run / Production VPS | 0.0.0.0:3000 portuna yönlendirilmiş Docker Container altyapısı. |
| **Domain** | `randevulari.com` | DNS üzerinde A ve CNAME kayıtları tamamlanmış, Wildcard DNS SSL tanımlı. |
| **Veritabanı** | Supabase Postgres (Production) | Kalıcı veri saklama için en az 1 ana replica ve günlük yedekleme planı. |
| **Erişim Kontrolü** | Supabase RLS (Row Level Security) | Farklı kiracıların (tenant) verilerinin birbirine sızmasını engelleyen aktif RLS politikaları. |
| **Admin Arayüzü** | Süper Admin Provisioning | Manuel lisanslama, ödeme referansı kaydetme ve askıya alma yetenekleri. |

---

## 3. İLK 3 MÜŞTERİ ONBOARDING AKIŞI (FIRST 3 CUSTOMER ONBOARDING FLOW)

Sisteme ilk dahil edilecek 3 pilot salon için izlenecek operasyonel adımlar şunlardır:

1.  **Saha Satış Görüşmesi:** Kurucular salon sahiplerini (potansiyel müşterileri) ziyaret eder. LARİ sistemi tanıtılır. Salon sahiplerine, sistem sahipliği veya kaynak kodu verilmeyeceği, sadece kendi işletmelerine özel bir admin paneli ve kamuya açık rezervasyon sayfası (tenant hesabı) açılacağı net olarak söylenir. Elden nakit veya banka havalesi ile 1 veya 3 aylık abonelik bedeli tahsil edilir ve ödemeler uygulama dışında (offline) takip edilir.
2.  **Kayıt İşlemi:** Salon sahibi `randevulari.com/register` adresinden kendi e-postası ve belirleyeceği şifre ile kaydolur. Sistem ona ödeme adımını atlayıp onay sürecini beklediğini belirten bir uyarı gösterir.
3.  **Süper Admin Aktivasyonu (Abonelik Aktivasyonu):** Süper Admin, aldığı çevrimdışı ödeme referansını (banka dekont numarası veya makbuz kodu) sisteme işleyerek salonun kiracı hesabının aboneliğini `manual_active` olarak onaylar. Bu işlem sadece bir hesap lisanslama/aktivasyon işlemidir, sistem satışı veya kod teslimatı değildir.
4.  **İçerik Girişi:** Salon yöneticisi panele giriş yaparak şubelerini, personellerini ve hizmetlerini tanımlar.
5.  **Müşteri Rezervasyonu:** Salonun müşterilerine özel `randevulari.com` alt alan adı adresi verilir ve rezervasyon akışı anında başlatılır.
6.  **Gelecekteki Entegrasyon Geçişi:** İleride online kredi kartı ile ödeme entegrasyonu (iyzico) aktif edildiğinde, salonun girdiği tüm personeller, şubeler, ayarlar ve randevu geçmişi **veri kaybı olmadan aynen korunacaktır**. Sadece ödeme yöntemi online karta geçecektir.

---

## 4. ACİL DURUM GERİ DÖNÜŞ PLANI (ROLLBACK PLAN)

Canlı ortamda beklenmeyen bir hata veya veritabanı çökmesi durumunda izlenecek adımlar:

1.  **Dinamik Yedek Alma:** Herhangi bir kritik müdahaleden önce veritabanının anlık SQL dökümü (pg_dump) alınır.
2.  **Sürüm Geri Çekme:** Eğer sunucuda yayınlanan kod hatalı ise, Cloud Run paneli üzerinden bir önceki çalışan revizyona (stable revision) tek tuşla geri dönülür.
3.  **Local Mode B planı:** Supabase erişimi tamamen kesilirse, salonların veri kaybetmeden hizmete devam edebilmesi için local-storage tabanlı geçici duman test modu veya statik bilgilendirme sayfasına yönlendirme aktif edilir.

---

## 5. GO/NO-GO KONTROL LİSTESİ (GO/NO-GO CHECKLIST)

Canlı yayına geçiş düğmesine basılmadan önce tüm maddelerin **PASSED** olması zorunludur:

- [ ] **Kalıcı Veritabanı Bağlantısı:** Supabase canlı şeması oluşturuldu mu ve erişilebiliyor mu? (**ZORUNLU**)
- [ ] **RLS Güvenlik Politikaları:** Kiracı verileri izole edildi mi? (**ZORUNLU**)
- [ ] **SSL Sertifikası (HTTPS):** randevulari.com adresi güvenli bağlantı kuruyor mu? (**ZORUNLU**)
- [ ] **Ödeme Alanları Temizliği:** Kredi kartı formları ve yanıltıcı "hemen kartla başla" yazıları temizlendi mi? (**ZORUNLU**)
- [ ] **Süper Admin Paneli:** Manuel aktivasyon ve dekont kaydetme butonu çalışıyor mu? (**ZORUNLU**)
- [ ] **Yedekleme Altyapısı:** Günlük otomatik veritabanı yedeklemesi aktif edildi mi? (**ZORUNLU**)

---

## 6. SÜREKLİ DESTEK PLANI (SUPPORT PLAN)

*   **Destek Kanalı:** Salon sahipleriyle doğrudan kurulan WhatsApp Destek Grubu.
*   **Yanıt Süresi SLA:** Kritik bloklayan randevu hataları için maksimum 15 dakika, diğer sorular için en geç 2 saat içinde yanıt verilecektir.
*   **Haftalık Kontrol:** Her Pazar günü, tüm salonların rezervasyon sayıları ve veritabanı bütünlüğü manuel olarak denetlenecektir.

---

## 7. SUPABASE STAGING SMOKE TEST & READINESS INTEGRATION

Static QA passing is highly beneficial, but does not equal a successful physical database execution. Paymentless production cutover strictly requires a successful real staging smoke test before deploying live. Note that **iyzico is not required** for paymentless production staging.

- **Go/No-Go Decision Report**: [Paymentless Go/No-Go Decision Report](./PAYMENTLESS_PRODUCTION_GO_NO_GO_REPORT.md) *(Note: This report currently records static pre-staging readiness. Paymentless production launch is strictly **NO-GO** and blocked until a physical staging project is provisioned, executed, and the staging result log is verified as a complete PASS).*
- **Real Staging Operator Guide**: [Real Staging Operator Guide](./REAL_SUPABASE_STAGING_EXECUTION_OPERATOR_GUIDE.md)
- **Staging Execution Result Log**: [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md)
- **Staging Browser Smoke Checklist**: [Staging Browser Smoke Checklist](./SUPABASE_STAGING_BROWSER_SMOKE_CHECKLIST.md)
- **Staging Command Sheet**: [Staging Command Sheet](./SUPABASE_STAGING_COMMAND_SHEET.md)
- **Execution Runbook**: [Supabase Staging Execution Runbook](./SUPABASE_STAGING_EXECUTION_RUNBOOK.md)
- **Staging Env Preflight QA**: Verified via `npm run qa:supabase-staging-env` ([Preflight Script](../scripts/verify-supabase-staging-env.mjs))
- **Migration Integrity QA**: Verified via `npm run qa:supabase-migration-integrity` ([Migration Script](../scripts/verify-supabase-migration-integrity.mjs))
- **RLS Tenant Isolation Smoke Test Plan**: Detailed in [RLS Tenant Isolation Smoke Test](./SUPABASE_RLS_TENANT_ISOLATION_SMOKE_TEST.md) and SQL-level assertions [paymentless_production_rls_smoke.sql](../supabase/tests/paymentless_production_rls_smoke.sql)
- **App-Level Staging Smoke Test**: [smoke-supabase-paymentless-staging.mjs](../scripts/smoke-supabase-paymentless-staging.mjs)
- **Staging Seed Data Plan**: [Supabase Staging Seed Data Plan](./SUPABASE_STAGING_SEED_DATA_PLAN.md)

---

## 8. MANDATORY STAGING GATE WARNINGS
* **STAGING RUN PASS IS MANDATORY**: You cannot run paymentless production cutover until a real physical Supabase Staging smoke test passes and is officially recorded in the [Staging Execution Result Log](./SUPABASE_STAGING_EXECUTION_RESULT_LOG.md) with a clear `PASS`.
* **ONLINE PAYMENT IS EXEMPT**: Online payment via iyzico, SMS gateway connections, or real communication providers is NOT required for staging or cutover launch.
* **NO LOCALSTORAGE FOR PRODUCTION**: Under no circumstances can client-side `localStorage` be used for live operational salon data. Persistent databases (Supabase Postgres) are strictly required.


