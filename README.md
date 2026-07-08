# 💈 LARİ - Akıllı Randevu ve Yapay Zeka SaaS Platformu

Bu proje, bir kuaför, güzellik salonu veya herhangi bir randevulu sistem için geliştirilmiş, Google Gemini yapay zeka altyapısına hazır, modern, duyarlı (responsive) ve karanlık/aydınlık (dark/light) mod destekli bir SPA (Tek Sayfalı Web Uygulaması) projesidir. Proje Multi-Tenant (SaaS) yapısında tasarlanmış olup, tek bir kod tabanıyla birden fazla işletmeye hizmet verebilir.

---

## 🌟 Öne Çıkan Özellikler

- **Multi-Tenant SaaS Altyapısı:** İşletmeler, kendi alt alan adlarıyla veya URL yapılarıyla platforma erişebilirler. Tüm uygulama `TenantContext` aracılığıyla sınırlandırılmış işletme kimliğine (`tenant_id`) bağlı olarak şekillenir.
- **Satış ve Önizleme Portalı (Demo Generator) & Özelleştirilebilir Web Sitesi:** Kuaförler, platforma katılmadan önce `/demo` rotası üzerinden anında kendi salon isimleri, renkleri ve logolarıyla kişiselleştirilmiş bir demo oluşturabilirler. Kurulumdan sonra ise, sadece bir randevu sistemi değil, tam teşekküllü profesyonel bir web sitesi (Cover = Gallery, Hizmet ve Uzman tanıtımı) sahibi olurlar.
- **İki Modlu Veri Akışı (Data Providers):** Mimari, esnek bir `dataProvider` katmanı (Strategy Pattern) üzerine kurulmuştur:
  - `mock`: Tamamen yerel, tarayıcıda çalışan, offline ve sunucuya ihtiyaç duymayan simüle yerel depolama modu (Pilot Aşamasında Varsayılan).
  - `supabase`: Gelecek aşamada uzak veritabanlarına (PostgreSQL/Supabase) doğrudan okuma ve yazma yapabilen üretim modu.
- **Müşteri Hafızası (Customer Memory Lite):** Salon sahipleri randevuyu tamamladıktan sonra müşteri alışkanlıklarını, teknik bilgilerini (boya formülü vb.), ve notları kaydedebilirler. Referans fotoğraflar mock modunda gizlilik prensibi gereği sadece yerel tarayıcıda tutulur ve tamamen stil referansı içindir. (Yüz tanıma, yapay zeka işlemesi veya umumi paylaşım kesinlikle yoktur).
- **Hafif Müşteri Hesabı (Account Lite):** Müşteriler, şifre belirlemeden veya ağır kayıt süreçlerinden geçmeden sadece isim, telefon ve email bilgilerini aynı tarayıcıda kaydederek hızlı randevu avantajından faydalanabilirler.
- **AI Stil Görselleştirici (AI Visualizer) & Uzman Tavsiyesi [Faz 3]:** Uygulamaya güvenli yapay zeka özellikleri eklenmiştir. Yapay zeka tavsiyeleri (AI Recommendations) ve görselleştirme (AI Visualization) abonelik paketlerine bağlı olarak aktifleştirilir. Frontend tarafında hiçbir gerçek model anahtarı bulunmaz; üretim ortamı için yapılandırılan tüm AI istekleri Deno tabanlı `supabase/functions/` klasöründeki Edge Function iskeletlerine yönlendirilecektir.
- **Güvenlilik ve KVKK Asistani:** Müşteri fotoğrafları, izinsiz bir şekilde ve varsayılan olarak yapay zekaya gönderilmez. Sadece `ai-visualizer` üzerinden müşterinin kendi rızası ile yüklediği anlık fotoğraflar kısa ömürlü analiz için kullanılır ve saklanmaz. Yüz tanıma yoktur.
- **Üretim Hazırlığı (Sandbox Mimarisi) [Faz 4]:** Iyzico ödeme sistemleri ve tam gerçek Supabase veri modeli şema iskeletleri halinde hazırlanmıştır. Uygulamanın içerisinde canlı Iyzico testleri veya gizli üretim anahtarları yoktur. Tüm hassas işlemler "Edge Functions" ve "RLS" üzerinden planlanmıştır.
- **Dinamik Ödeme CTA Mimari [Faz 5]:** Pricing ve demo sayfaları CTA butonları mevcut ödeme ortamına göre dinamik çalışır. (Demo/Satış Talebi -> Ücretsiz Deneme / Güvenli Ödemeye Geçiş).
- **Uygulama İçi Ön Bellekleme (Service Worker Yönetimi):** Geliştirme kolaylığı ve tutarsız önbelleği engellemek için Service Worker, cache stratejisi sonlandırılana kadar devre dışı bırakılmıştır. Lütfen manuel olarak aktif etmeyiniz.

## Payment & Trial Architecture Notes
- Current MVP/mock mode **does not charge cards**. Mock trial start creates a local flag state.
- When `VITE_PAYMENT_PROVIDER` is enabled to `sandbox` or `production`, pricing CTAs shift automatically to "Start 7-Day Free Trial" or "Secure Checkout".
- In production, trial starts with secure payment provider card collection. If not cancelled, it continues into the selected subscription.
- Trial/subscription lifecycle (cancel/sync) relies entirely on backend state and Iyzico webhook handling. 
- All real Iyzico calls must happen through Supabase Edge Functions. Iyzico secrets (like Gemini keys) are **never** exposed in the frontend.

---

## 🎯 Hedef Kitle (Target Market)
Randapp öncelikli olarak randevu bazlı hizmet veren yerel işletmelere odaklanmaktadır:
- **Kuaförler ve Berberler**
- **Güzellik ve Bakım Salonları**
- **Nail Art ve Tırnak Stüdyoları**

## 💳 Abonelik ve Ödeme Modeli Altyapısı (Subscription Scaffold)
Sisteme ücretli planlar, limit kontrolleri ve abonelik portalı eklenmiştir. **Belirtmek gerekir ki şuan tamamen mock tabanlı simülasyon geçerlidir.** Hiçbir gerçek ödeme veya kart işlemi gerçekleşmez (Canlı ödeme henüz aktif değildir). Iyzico sandbox altyapısı ve backend entegrasyonu gelecek aşama (next phase) takviminde bulunmaktadır.

---

## 🚀 Geliştirme Ortamı Kurulumu

### 1️⃣ Çevre Değişkenleri (Environment Variables)

Proje ana dizininde bulunan `.env.example` dosyasını kopyalayıp `.env` dosyası oluşturun. Şu anki geliştirme sürümü tamamen veritabanına ihtiyaç duymayan `mock` versiyonunda gelir.

```env
# MOCK Veri Akış Modu
VITE_DATA_MODE=mock

# SPA Routing Tipi
VITE_ROUTER_MODE=hash
```

🚨 **ÖNEMLİ YAPAY ZEKA VE GÜVENLİK NOTU:**  
Projenin frontend kodu hiçbir canlı (live) Google Gemini API anahtarı veya servis anahtarı içermemektedir. Gerçek API modelleri entegre edildiğinde, tüm işlem güvenli modüler Edge Functions veya harici Node.js servisi üzerinden geçecektir.

### 2️⃣ Demoya Başlangıç
Satış sunumları için uygulamaya hızlıca geçiş yapıp veri ekleten demo yardımcı araçları Footer'a sınırlandırılmış şekilde mock modunda bırakılmıştır.

### 3️⃣ Automated QA & Screenshots
We have a GitHub Actions based screenshot automation workflow. This captures full-page scenarios (Desktop & Mobile) across the entire product.
- **Using GitHub Actions:** Go to the **Actions** tab in GitHub, select **QA Screenshots Capture**, run it manually via `workflow_dispatch`, and download the generated `randapp-qa-screenshots` artifact.
- **Locally:** You can run `npm run qa:screenshots` locally after starting Vite. See `docs/SCREENSHOT_QA_CHECKLIST.md` for more details. 

## Feature Status: Current MVP vs Sandbox vs Roadmap

**Current MVP/Mock Demo:**
- Mini Website & Profile Page
- Online Booking Logic (Staff & Service matching)
- Plan Selection GUI
- Super Admin Dashboard (UI)
- Customer Profile & Memory (UI)
- Referral Campaign Settings (UI)

**Sandbox/Backend-Ready (Awaiting Supabase Edge Functions):**
- Iyzico Payment & Live Trial Checkout
- Real Auth (Phone/OTP)
- Reference Photo Storage
- AI Inference Context Saving

**Future Roadmap:**
- Custom Domain Support
- Mobile App / Customer Discovery Directory
- Ratings and Reviews
- AI Visualizations
- Multi-venue mapping

---

## 🔐 Geliştirici Rolleri ve Yönetici (Admin) Erişimi

Yerel (Mock) Mod (`VITE_DATA_MODE=mock`) ile çalışırken, tüm özellik testlerini yapabilmek için aşağıdaki **geliştirmeye özel (development-only)** hesapları kullanabilirsiniz:

**1. Salon Sahibi (Tenant Admin):**
- **Sorumluluk:** Kendi salonunu yönetme, kurulum yapma, Müşteri Hafızası (Customer Memory) kontrolleri. Sadece `/admin` rotasına erişebilir.
- **E-posta:** `admin@randapp.com` / **Şifre:** `admin123`

**2. Süper Yönetici (Super Admin):**
- **Sorumluluk:** Tüm tenant'ları listeleme, metrikleri görüntüleme, mock abonelik durumunu tetikleme ve onboarding süreçleri.
- **E-posta:** `superadmin@randapp.com` / **Şifre:** `superadmin123`

Eğer gelecekte VITE_DATA_MODE `supabase` olarak değiştirilirse, kimlik doğrulama devrede olacaktır ve mock şifreler çalışmayacaktır.

---

_Akıllı Randevu Sistemleri için Sevgiyle <3 hazırlanmıştır._
