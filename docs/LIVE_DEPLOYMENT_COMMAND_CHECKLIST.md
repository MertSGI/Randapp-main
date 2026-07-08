# LARİ Canlı Yönetim Komut Kontrol Listesi (Live Deployment Command Checklist)

Bu liste, canlı ortama çıkış, kurulum ve Supabase/Edge süreçlerini uygularken terminal/komut satırı üzerinde yazılacak **Temsili (Placeholder)** komutları listeler.

**DİKKAT:** Aşağıdaki köşeli parantez içindeki `<>` veya genel büyük harfli isimlerin yerine hiçbir zaman GERÇEK gizli anahtarlarınızı, şifrelerinizi ve production sırlarınızı kopyalayıp bu dosyaya yazmayın veya taahhüt etmeyin (commit). Anahtarları sadece yerel terminal ortamınızda bellek üzerinden çalıştırın!

---

## 1. Local / QA Derleme (Build & Quality)

Güvenlik kalitesinden ve build adımından emin olunması:

```bash
# Tüm sistemin denetimi (Tüm test komutlarının birleşik çalışması)
npm run qa:all

# Production ortamı için paketlerin statik olarak optimize edilmesi ve kırılmaların tespiti
npm run build
```

---

## 2. Supabase Bağlantısı ve Güvenlik Alanı (Supabase Setup & Link)

Projenizin terminal üzerinden geliştirici Supabase paneline kimliklenmesi:

```bash
# Supabase Command Line Interface giriş yetkisi (Tarayıcı açılır ve yetkilendirirsiniz)
supabase login

# Yerel kod havuzunuzu canlı projenizle ilişkilendirin (Reference ID Supabase ayarlarınızdadır)
supabase link --project-ref <SUPABASE_PROJECT_REF>

# Yerleşik PostgreSQL veri modelinizi ve migrations içeriğinizi sunucuya yazın
supabase db push
# VEYA geliştirme modelinize bağlıysanız (alternatif)
# supabase migration up
```

---

## 3. Serverless (Edge Functions) Yayını

Geliştirilmiş Node/Deno uyumlu fonksiyonların (örn ödeme ve webhook doğrulayıcılarının) sunucuya aktarımı:

```bash
# Ödeme oturumu (Checkout Session) sağlama komutu
supabase functions deploy create-checkout-session

# Iyzico veya Provider ödeme uyarıcısı (Webhook)
supabase functions deploy payment-webhook

# İptal/Aktivasyon Senkronizasyonu (Subscription Sync)
supabase functions deploy subscription-sync
```

---

## 4. Edge Environment (Sunucu Taraflı Sırlar ve Değişkenler)

Güvenlik anahtarlarının kod dosyaları yerine sadece fonksiyonların çalışacağı güvenlik kasasına (vault/secrets) atılması. Bu işlemi *sadece terminalden* veya *Supabase arayüzünden* güvenliği tecrit edilmiş bilgisayarlarda yapın:

```bash
# Frontend alan adınızı (domain) sunucuya iletme
supabase secrets set PUBLIC_APP_URL="https://www.lari.com"

# Iyzico (veya Payment) Production / Sandbox anahtarlarının sunucu bazlı gizlenmesi
supabase secrets set IYZICO_API_KEY="<IYZICO_API_KEY>"
supabase secrets set IYZICO_SECRET_KEY="<IYZICO_SECRET_KEY>"

# Supabase üzerinden Bypass işlemler ve Administrative yetkiler için Service Role ataması
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"

# Mail/Sms anahtarı ataması (Örn: Resend / SendGrid API)
supabase secrets set RESEND_API_KEY="<MAIL_API_KEY>"

# Değerleri kontrol etmek isterseniz (Gizli değerleriyle birlikte listelemez, anahtar isimlerini verir)
supabase secrets list
```

---

## 5. Uygulama Deployment (Frontend Barındırma)

NodeJS veya Statik hosting ortamınızdaki (Vercel/Cloud Run vb.) derlenmiş uygulamanın komutu:

```bash
# (Proje altyapınıza göre Vercel, Netlify veya Docker deployment adımları uygulanır)
# Örn Vercel:
vercel --prod
```

---

## 6. Local ve Doğrulayıcı Komutlar (Smoke Test & Checking)

```bash
# Üzerinde çalışılan gizli sözleşmeler veya .env değişkenlerini analiz eden güvenlik kontrol scripti
npm run check:secrets

# Tüm operasyon sonrası Canlı Smoke Test (Dumanlanmış testi) adımlarını ve simülatörleri başlatma senaryosu
npm run qa:live-smoke
```
