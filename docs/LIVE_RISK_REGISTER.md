# LARİ Canlı Sunucu Operasyonları Risk Kayıtları (Live Risk Register)

Bu envanter, LARİ projesinin canlıya geçme operasyonunda karşılaşılabilecek potansiyel sorunları (riskleri), etkilerini (severity), gerçekleşme olasılıklarını (likelihood) ve düşürücü aksiyon planlarını listeler. 

---

### 1. RLS (Row Level Security) Yapılandırma Hatası
*   **Açıklama:** Supabase üzerindeki kısıtlayıcı güvenlik ilkeleri (RLS) hatalı ayarlanarak işletmelerin (tenant) birbirlerinin müşteri/randevu datalarını okuması.
*   **Olasılık (Likelihood):** Düşük (Kapsamlı RLS Audit nedeniyle korumada)
*   **Etki (Severity):** Kritik (Veri ihlali ihtimali)
*   **Tespit (Detection):** Penetrasyon testleri, QA Supabase Schema Audit.
*   **Müdahale (Mitigation/Rollback):** Data Migration yapılmadan önce tablolar kesin RLS testi ile izole edilir. İhlal tespit edilirse sistem acil olarak Supabase modundan `local` test moduna gerileme yapar.

### 2. Ödeme Webkancası Çiftleme veya Yarıda Kalması (Webhook Failure/Duplication)
*   **Açıklama:** Müşteri 14 günlük trial'a katılır, para/kart tahsil edilir ancak internet gitmesi/kopukluk yüzünden webhook zamanında işlenmez veya iki kere geldiğinde abonelik çift işlenir.
*   **Olasılık:** Orta
*   **Etki:** Yüksek
*   **Tespit:** Supabase Edge Logları, Iyzico kontrol paneli bildirimleri.
*   **Müdahale:** `payment-webhook` Edge Function, Idempotent (tekrarsız kayıt) koruyucu tasarım mimarisiyle revize edilmiştir (aynı ID bir kez tutulur). Hata olursa callback sistemi admin panelde "Payment Pending" durumunu gösterir, elle tetikleme olanağı tanınır.

### 3. Ön Yüzde Bilgi Sızdırması (Accidental Frontend Secret Exposure)
*   **Açıklama:** Iyzico API veya Supabase Service Role verilerinin kazayla VITE_ vb öneki alıp istemci (tarayıcı) tarafına atılması.
*   **Olasılık:** Çok Düşük (Sürekli check:secrets çalışmakta)
*   **Etki:** Kritik (Sistem Anahtarı Ele Geçirilmesi)
*   **Tespit:** CI/CD esnasında `npm run check:secrets` komutunun hata fırlatması ve Network (Tarayıcı F12) üzerinden paket trafiği denetimi.
*   **Müdahale:** Tespit anında tüm Secret ve API anahtarları provider (Iyzico/Supabase vb.) paneli üzerinden ACİL olarak iptal (revoke/rotate) edilir, yeni anahtarla Backend (Edge) update edilir.

### 4. Kamu URL'lerine Yarı Çalışır Sistemin Çıkması (Public Tenant Not Published Effect)
*   **Açıklama:** `pending_checkout` durumda duran bir işletmenin yayınlama butonuna yetkisiz / hatalı şekilde ulaşıp rezervasyon almaya başlaması.
*   **Olasılık:** Çok Düşük
*   **Etki:** Orta (Gelir Modeli Baypası)
*   **Tespit:** Korumalı Dashboard kontrolleri ve yayın denetimi (Publish Gate Validator).
*   **Müdahale:** Güvenliği test edildi, izinsiz erişimde "Publishing blocked" dönüyor. Yanlışlıkla yayına alınan tenant, DB update ile "draft" a indirgenir.

### 5. DNS / Mobil Yönlendirme Hatası (Custom Domain DNS Failure)
*   **Açıklama:** Kurumsal/Premium üyelerin Vercel/CloudRun veya NameServer kayıtlarındaki asenkron sorun yüzünden Public Linklerinin (Salon linkleri) `Not Found` sayfasına gitmesi, Hash (/#/) routerın tarayıcı refresh esansında bozulması.
*   **Olasılık:** Orta
*   **Etki:** Orta-Yüksek (Müşteri itibar kaybı)
*   **Tespit:** Uptime Monitoring, ilk kurulumda Manuel Link testi, `/pilot/customer` rotası denetimi.
*   **Müdahale:** CNAME veya Rewrite altyapısı tekrar tanımlanana kadar müşteriye stabil ana barındırıcı linki (örn lari.com/booking/isletme) kullanım imkanı açık kalır.

### 6. Veri Aktarımı / Dışa Aktarımında Güvenlik Gediği (Insecure Data Export)
*   **Açıklama:** Canlı tenant'ların (Müşteri listelerinin) aktarımı test edilirken CSV vb dosyaların korunmasız sunucularda / S3 bucket'larda açık kalması.
*   **Olasılık:** Düşük
*   **Etki:** Yüksek
*   **Tespit:** Dışa Aktarım (Export) simülasyonu kodları.
*   **Müdahale:** Data Export mekanizması SADECE cihazda asenkron JS Blob oluşturulması yöntemiyle yerel taraflı yapılır; backend tarafına uzun süreli arşiv/yedek tablo bırakılmaz. Cihaz belleğinde doğar ve indirilir.

### 7. Sahte Veri ile Üretim Verisi Karışması (Demo Data Contamination)
*   **Açıklama:** `/pilot/admin` veya `/demo` için kullanılan mock "Lumina Güzellik" verilerinin, canlı sisteme abone olmuş başka dükkan verisine ID çakışması veya dikkatsizlik sonucu sızması.
*   **Olasılık:** Düşük
*   **Etki:** Yüksek (Müşteri Memnuniyetsizliği)
*   **Tespit:** Supabase Migration Dry-Run testi.
*   **Müdahale:** Demolarda sabit Tenant_ID kullanılır. Gerçek tenant kayıt ve oluşumlarında kesin GUID atamaları sağlanarak kesişim önlenir. Hata durumunda tenant snapshot'a restore edilir.

### 8. Hukuki Metinlerin Güncel Olmaması (Stale Legal Wording)
*   **Açıklama:** Çıktık ama Sözleşme / Gizlilik Politikası / Stripe-Iyzico Tüketici Sözleşmesi güncellenmemiş, bu sebeple POS kapanıyor.
*   **Olasılık:** Orta
*   **Etki:** Yüksek (Hukuki ve Finansal)
*   **Tespit:** Canlı yayın onayı ve Go/No-Go Checklist toplantısı.
*   **Müdahale:** Hukuk Müşaviri onayından geçmeden veya Tüketici Onay kutusu olmadan Payment modüllerine (Checkout) girişe geçit verilmez.
