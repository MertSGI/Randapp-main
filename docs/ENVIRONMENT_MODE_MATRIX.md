# LARİ Çevresel Modlar Matrisi (Environment Mode Matrix)

Sistem geliştirme aşamasından nihai üretim aşamasına kadar 3 asenkron moda ayrılmıştır.
Bu modların ne zaman tetikleneceği, nelere sahip olabileceği ve sistemin nasıl tepki vereceği `ENV` (Çevresel Değişkenler) vasıtasıyla kontrol edilir. 

Frontend tabanlı çevresel değişkenlerde (örn: `VITE_` ön eki taşıyanlar) KESİNLİKLE güvenlik sorunu içeren token sızdırması YAPILMAMALIDIR (Örn Iyzico Anahtarları, Supabase Service Role). Ayrıca LARİ frontend'inde **Asla ham (raw) kart datası alınmamaktadır**, süreç tamamen güvenli provider (örn Iyzico Checkout Page / API) üzerinden yürütülür.

### Mod Tablosu

| Özellik / Aksiyon | 1. Local Dry Run Modu | 2. Sandbox Live Modu | 3. Production Live Modu |
| :--- | :--- | :--- | :--- |
| **Açıklama** | Tamamen yerel, geçici korumalı ön-üretim ortamı. | API'lerin test edildiği yarı-canlı korumalı (parasal olmayan) ortam. | Nihai Ciro sağlanan Canlı ve Gerçek Üretim platformu. |
| **`VITE_DATA_MODE`** | `local` | `supabase` (Test Tenant verileriyle) | `supabase` (Gerçek Müşteriler) |
| **Örnek Çalışma** | Data `localStorage`'da JSON bazlı simüle edilir, asla veri ihlali taşımaz. | Data Supabase staging/test tablosuna yazılır. | Gerçek Supabase üretim tabloları ve RLS kullanılır. |
| **`VITE_PAYMENT_RUN_MODE`** | `mock` veya `local` | `sandbox_live` | `production_live` |
| **Ödeme Davranışı** | Ödeme simülasyonu 14 günlük form mocklar ve admin panel pass verir. Kredi kartı istenmez. | Iyzico Sandbox çağırılır, Test kartları (4111..) çalışır. Gerçek para asla çekilmez. | Iyzico Live API çağırılır, Gerçek kullanıcı kartı kullanılarak limit testinden geçer, paralı abonelik başlar. |
| **Notification Behavior** | Console veya Alert basımı üzerinden mock loglama yapar. | Mail/Bildirim test adreslerine ve geliştirici konsoluna yönlenir. | Müşteri veritabanındaki onaylı listeye Webhook bazlı şablon iletilir. |
| **Supabase URL / ANON** | Sahte değerler veya çalışmayan env kullanılabilir. | Staging/Test Supabase ENV Key (VITE_XXX_) | Üretim/Gerçek Supabase ENV Key (VITE_XXX_) |

---

### Backend (Edge) Ortamları ve Gizli Sırlar (Secrets)

Edge Functions ve sadece sunucu taraflı iletişim kuran `process.env` katmanı için ortam değişkenleri.
**Uygulama Frontend'i bu değişkenleri GÖREMEZ, BİLEMEZ:**

*   `SUPABASE_SERVICE_ROLE_KEY`: Supabase üzerindeki bypass edilmiş büyük yetki sertifikası. (Test ve Prod ayrı)
*   `IYZICO_API_KEY`: Iyzico satıcı doğrulayıcı. (Test ve Prod ayrı)
*   `IYZICO_SECRET_KEY`: Iyzico asıl güvenlik kilidi. (Test ve Prod ayrı)
*   `WEBHOOK_SIGNATURE_SECRET`: Dış sistemlerin (Iyzico gibi) LARİ fonksiyonlarına atacağı webhook'un doğruluğunu kanıtlayan güvenlik şifresi.
*   `EMAIL_PROVIDER_KEY` / `WHATSAPP_PROVIDER_KEY`: Resmi mesajlaşma şubelerine ait entegratör API secretleri. 

> LARİ'nin tüm ödeme ve müşteri onay yapıları (14-günlük deneme zorunluluğu vb.), ilgili mod ve ödeme entegratörüne rağmen mimarinin kalbinde yer alır. Fronted tarafı ASLA güvensiz API anahtarı barındırmaz ve ASLA 7-gün veya kart istenmez yalan ibarelerini arayüzde sunmaz.
