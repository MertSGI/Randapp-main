# LARİ Canlıya Alma ve Operasyon Rehberi (Live Deployment Operations Guide)

Bu rehber, geçici/mock verilerle çalışan yerel (dry run) LARİ sistemini; ölçeklenebilir, güvenli ve tüm servisleriyle canlı çalışan gerçek bir üretim (production) ortamına dönüştürmek için gereken her adımı detaylandırır.

**ÖNEMLİ UYARI:** 
Bu belge bir planlama ve referans dokümanıdır. Henüz üretim ortamı canlıya alınmamış olup sistem "local_dry_run" modunda ve "local_storage" üzerinde izolasyonlu deneme modundadır. Verilen tüm komutlar ve konfigürasyonlar placeholders (yer tutucular) içermektedir. Asla gerçek sırları veya API anahtarlarını dökümanlara veya frontend kodlarına (git repository'sine) taahhüt etmeyin (commit).

---

## Phase 0: Dondurma ve Yedekleme (Freeze and Backup)

Canlı ortama geçiş öncesinde herhangi bir felaket senaryosuna karşın mevcut sistemin durumu güvence altına alınmalıdır.

*   **Yeni Özellik Geliştirmeyi Durdurma:** Tüm "yeni özellik" (feature) kodlamaları durdurulmalıdır.
*   **Release Dalı (Branch/Tag) Oluşturma:** Mevcut kararlı sürüm etiketlenmelidir (örn. `git tag -a v1.0.0-rc1 -m "Pre-live hardened state"`).
*   **Kalite Kontrol:** `npm run qa:all` komutu çalıştırılmalı ve geçmelidir.
*   **Derleme Testi:** `npm run build` komutu başarıyla tamamlanmalıdır.
*   **Veri Yedekleme:** Geliştirme aşamasında lokal veritabanında (`localStorage`) yer alan kritik tenant, müşteri, iş veya ciro verileri json olarak dışa aktarılmalı ve kod deposu dışında güvenli bir diskte arşivlenmelidir.
*   **Kişisel Veri (KVKK) Doğrulaması:** Frontend veya local depoda yanlışlıkla commit edilmiş kişisel nitelikli hiçbir verinin kaynak kodlarında bulunmadığı doğrulanmalıdır.
*   **Geri Dönüş (Rollback) Sorumlusunun Atanması:** Hata durumunda sistemi anında eski haline alacak tek yetkili karar verici ve teknisyen belirlenmelidir.

---

## Phase 1: Sunucu ve Barındırma Stratejisi (Hosting Decision)

Aşağıdaki yapı için kararlar alınmalı ve çevresel değişkenler (Environment Variables) hazırlanmalıdır:

*   **Frontend Barındırma:** Vercel, Netlify veya Cloud Run üzerinden statik (SPA) barındırma uygulanacak.
*   **Backend & Kimlik & Veritabanı:** Supabase (PostgreSQL, Auth ve Edge Functions) kullanılacak.
*   **Özel Alan Adı (Custom Domain):** Müşteri web sitesi rotaları DNS üzerinden HTTPS ayarları ile bağlanacak.

**Frontend İçin Güvenli (Public) Çevresel Değişkenler:**
Sadece `VITE_` veya `PUBLIC_` gibi önekler içeren ve tarayıcıya gitmesi GÜVENLİ olan değişkenler:
*   `VITE_LARI_MARKET` (Pazar ve Marka hedeflemesi: `tr` veya `global`)
*   `VITE_SUPABASE_URL` (Supabase proje adresi)
*   `VITE_SUPABASE_ANON_KEY` (Sadece API iletişim haklarına sahip public anahtar)
*   `VITE_PUBLIC_APP_URL` (LARİ'nin üretim ortamı alan adı)
*   `VITE_PAYMENT_RUN_MODE` (İlk etapta `sandbox_live`, sonrasında `production_live`)
*   `VITE_DATA_MODE` / `VITE_LARI_DATA_SOURCE` (İlk etapta `local`, sonrasında `supabase`)

**ASLA FRONTEND'E KONMAMASI GEREKENLER:**
*   Supabase Service Role Key
*   Iyzico Secret Key, API Key (ya da Master Keys)
*   Mail/WhatsApp sağlayıcılarına ait Token ve Secret'ler.

---

## Phase 2: Supabase Proje Kurulumu (Supabase Project Setup)

*   **Proje Oluşturma:** Supabase paneli üzerinden PostgreSQL sunucusu oluşturun.
*   **Bağlantı Anahtarlarının Kaydı:** URL ve ANON_KEY değerini frontend ENV doyasına koyun. Service Role Key değerini sadece Backend (Edge Functions) secrets alanında saklayın.
*   **Auth (Kimlik Doğrulama):** 
    *   E-posta bazlı doğrulamayı aktif edin.
    *   Gerekliyse `Site URL` ve `Redirect URIs` alanlarına canlı alan adlarını (`https://www.lari.com`, `https://admin.lari.com` gibi) ekleyin.
*   **Schema (Şema) Yayınlama:** Veritabanına ait tablolar `supabase/migrations/` komutlarıyla veya SQL editörü ile yansıtılmalıdır.
*   **İzolasyon (RLS):** Tüm tablolarda "Row Level Security" (RLS) aktif edilmiş olmalı ve her işletme sahibinin SADECE kendi `tenant_id` verilerini okuyup yazabileceği ispatlanmalıdır.
*   **Index ve Kısıtlamalar:** Rezerve edilebilir tablo alanlarında benzersiz numaralar ve performans amaçlı yabancı anahtar (FK) indexlemeleri test edilmelidir.
*   **Super Admin:** Eğer gerekliyse, sistem içi özel roller için internal süper yönetici kayıtları güvenli şekilde (`seed.sql` veya manuel) yaratılmalıdır.

---

## Phase 3: Yerel Veriden Supabase'e Geçiş (Migration Dry-Run & Run)

1.  **Dışa Aktar (Export):** Mevcut yerel veriler JS/JSON yedeği olarak alınır.
2.  **Dry-Run (Kuru Çalıştırma):** Geçiş scripti (`npm run qa:data-export` veya özel bir taşıyıcı komut) veritabanı yansıtmadan simüle edilir.
3.  **Sorun Giderme:** Bloke edici durumlar (eksik yetkiler, tip uyuşmazlığı) düzeltilir.
4.  **Göç Adımları (Migration):**
    *   Tenants (İşletmeler)
    *   Owner Users / Auth eşleştirmeleri
    *   Business Profile (İşletme Profili)
    *   Branches (Şubeler)
    *   Services & Staff (Hizmetler ve Çalışanlar)
    *   Availability (Çalışma Saatleri)
    *   Appointments (Gerçek Randevular)
    *   Customers & Customer Memory
    *   Müşteri Rızaları (Consents, KVKK)
    *   Kampanyalar, Ödüller, Referanslar
    *   Abonelik durumları
5.  **Temizlik:** Demo/Pilot rotaları için kullanılan sahte veriler kesinlikle gerçek üretim işletme kayıtlarına karışmamalıdır.
6.  **Doğrulama (Verification):** Veriler gönderildikten sonra kayıt sayıları ve referans bütünlüğü kontrol edilmelidir.

---

## Phase 4: Data Source Cutover (Veri Kaynağını Çevirme)

LARİ, yerel veriden üretim sistemine geçerken özel bir geçiş bayrağı (Environment Variable) dinler.
Supabase şeması kusursuz kurulmadan veri kaynağı değiştirilmemelidir.

*   `VITE_LARI_DATA_SOURCE` (Veya projede anlaşılan ilgili DATA_MODE key'i) `supabase` olarak değiştirilir.
*   **Çalışma Doğrulaması:** 
    *   Profilin Supabase'den başarıyla okunduğu.
    *   Randevunun başarıyla Supabase'e yazıldığı.
    *   Admin panelde verilerin güncel akışla göründüğü teyit edilmelidir.
*   **Geri Alabilirlik:** Sistemin herhangi bir çöküşünde veri kaynağı 5 saniye içerisinde tekrar `local` yapılarak, işlerin tamamen durması önlenir.

*Not: ENV değerlerindeki isimlendirme (`VITE_DATA_MODE` vs `VITE_LARI_DATA_SOURCE`) kod tutarlılığı için README dosyasında standartlaştırılmıştır.*

---

## Phase 5: Auth ve Yetki Kontrolleri (Auth and Role Guards)

Tam Supabase modeline geçildiğinde Session verileri sahte (mock) localStorage değerlerinden gerçek `supabase.auth.getSession()` akışına geçirilir.

*   **Koruma Kontrolü:** `/admin` sayfasına tıklanıldığında sistem gerçekten giriş yapılmasını dikte etmelidir. (Anonim olarak girilememelidir.)
*   **İzolasyon Kontrolü:** Müşteri/Çalışan verilerine yetki dahilinde ulaşıldığından rls politikaları yardımıyla emin olunmalıdır.
*   **Hareketsiz Rotalar:**
    *   `/super-admin` gizli kalmalı veya yetkili kimlik istemelidir.
    *   `/pilot/customer` herkese açık kalmalıdır.
    *   `/pilot/admin` salt okunur tanıtım verisi sunmalı, asla sahip oluşturmamalıdır.
    *   `/demo` public olmaya devam etmelidir.
    *   `/register` gerçek tenant kaydı almalıdır.
*   **Çıkış:** Logout (Çıkış) komutu tüm tarayıcı sessionlarını (local, cookie) silmeli ve giriş sayfasına yönlendirmelidir.

---

## Phase 6: Supabase Edge Functions (Sunucusuz Fonksiyonlar)

Güvenli arka plan işlemleri ve ödeme web kancaları (webhooks) Edge Functions üzerinde çalışacaktır. Kod deposundaki `supabase/functions/` dizini referanstır.

*   **Yayınlanacaklar:** `create-checkout-session`, `payment-webhook`, `subscription-sync` (iş planına göre projedeki yansıyan yetenekler).
*   **Gizli Tutma:** API değerleri (Supabase üzerinden gizli birim yöneticisi ile - secrets set) ile saklanmalıdır. Koda yazılmamalıdır.
*   **Ayarlanacak Değerler:** 
    *   `PUBLIC_APP_URL`
    *   Callback ve Webhook URL yolları (örn: `https://.../functions/v1/payment-webhook`)
*   **Kalite ve Loglama:** Fonksiyonlarda dönen başarı, red, güvenlik reddi durumları log incelenerek test edilmelidir.
*   **CORS & Bütünlük:** CORS başlıkları, ödeme şirketinden gelen isteklerin onaylı İmzaları (Signature Verification) denetlenmelidir. Tekrarlı web kancaları çifte abone oluşturmamalıdır (Idempotency).

---

## Phase 6.5: Görsel ve Belge Depolama Entegrasyonu (Media Storage Integration)

Canlı ortamda salon logoları, kapak fotoğrafları, çalışan portreleri ve yasal beyannameler için depolama kovaları (buckets) kullanılır.

*   **Bucket Tanımlamaları**: `/docs/MEDIA_STORAGE_AND_ASSET_OPERATIONS.md` dokümanına uygun şekilde `lari-public-media` ve `lari-private-secure` kovaları oluşturulmalıdır.
*   **Güvenlik (RLS)**: Storage RLS politikaları yazılmalı, her salonun yalnızca kendi folders (`tenants/${tenant_id}/*`) altındaki nesneleri değiştirebilmesi sağlanmalıdır.
*   **Uygulama Kılavuzu & Matris**: İnceleme ve detaylar için mutlaka [Görsel Depolama ve Medya Operasyonları Rehberi](MEDIA_STORAGE_AND_ASSET_OPERATIONS.md) ve [Sözleşme Matrisi](MEDIA_STORAGE_PROVIDER_CONTRACT_MATRIX.md) incelenmelidir.

---

## Phase 7: Iyzico Korumalı (Sandbox) Ücretlendirmesi Planı

Henüz canlı para tahsilatı YAPILMAMALIDIR! 

*   **Hesap:** Iyzico Sandbox (Ön üretim) Merchant (Satıcı) ve API/Secret anahtarları oluşturulur.
*   **Abonelik Paketleri:** Başlangıç, Standart, Profesyonel, Premium (Opsiyonel Kurumsal-B2B) olarak kodlanan planların tam plan referans ve ID kodları Iyzico tarafında oluşturulmalıdır.
*   **Trial Konfigürasyonu:** Iyzico tarafında veya LARİ sistemi içinde 14 günlük kredi kartlı üyelik planı doğrulanmalıdır.
*   **Uç Noktalar:** Callback ve Webhook bağlantıları test ortamı için girilir.
*   **Anahtarlar:** Iyzico Key & Secret yalnızca Edge Function secret havuzuna dökülür.
*   **Risk Tespiti & Testler:**
    *   İstemli/Başarılı deneme kartıyla abonelik yaratın.
    *   LİMİTSİZ veya RET veren sahte kartla test yapıp "Kabul edilmedi" arayüzünü görün.
    *   Hatalı (False) Webhook yollayıp sistemin reddettiğini görün.
*   Ödeme bekleyen / reddeden kullanıcı "Yayın Durumunu" Müşteri alım moduna GEÇİREMEMELİDİR. (pending_checkout published kontrolü).

---

## Phase 8: Canlı Üretim Ödeme Durumuna Geçiş (Production Payment Readiness)

Ancak 7. adımdaki denemeler kusursuz test edilirse canlı paralı ortama geçilebilir.

1.  **Şartlar:** Sandbox başarılı olmalı, yetkili onaylamalı, iade/iptal (refund/cancel) prosedürleri ve yasal ibareler (Tüketici Sözleşmesi) sitede net durmalıdır.
2.  **Operasyon:** 
    *   CLI ile Production (Canlı) API & Secret Key değerleri Edge function secrets alanına atılır.
    *   VITE_PAYMENT_RUN_MODE `production_live` yapılır (Frontend veya Çevre ayarı).
    *   Düşük limitli (örn 1 TL) bir canlı hesap çekim ve iade testi yapılır.
    *   Aboneliğin Supabase/Lari panelinde "active" (Aktif) düştüğü teyit edilir.

---

## Phase 9: E-Posta / Bildirim Sağlayıcısı (Email/Notification Provider)

Mail bildirim altyapısı (örn: Resend, Sendgrid, vb.)

1.  **Entegrasyon:** Sadece Backend Edge alanında sır (secret) olacak şekilde kurulmalıdır.
2.  **Şablonlar:** 
    *   Randevu oluşturuldu/Onaylandı.
    *   Hatırlatcı (Reminder).
    *   İptal.
    *   Abonelik/Ödeme durumu, Referral ödülü.
3.  **Güvenlik:** Frontend ortamından e-posta atma işlemi KESİNLİKLE yapılmamalı (İlgili endpoint çağrılmalıdır). Sahte WhatsApp entegrasyonu iddiaları bildirim ekranından temizlenmelidir.

---

## Phase 10: WhatsApp Business Provider (Gelecek Aşama / Opsiyonel)

WhatsApp bildirimleri doğrudan işletme onayı isteyen kritik ve masraflı süreçlerdir. 

1.  **Seçim:** Meta Developer veya anlaşmalı entegratör onayı alınmalıdır.
2.  **Hazırlık:** Şablonlar (Templates) Meta tarafından incelenmelidir. 
3.  **Test:** Manuel WhatsApp paylaşım butonu ("Paylaşım Araçları" / Share Toolkit) WhatsApp tam API aşamasına geçene kadar canlı sunucularda aktif kalmalı, müşteriye "Tamamen API üzerinden otomatik Whatsapp" sahte sözü verilmemelidir.

---

## Phase 11: Alan Adı ve Yönlendirme (Domain and DNS)

*   **Kurulum:** `https://lari.com` (veya ilgili domain) adresine SSL aktif edilerek Vercel/Netlify kayıtları girilir. (CNAME / A Records).
*   **Public Linkler:** Hash (`/#/`) veya Browser router mantığının üretim sunucusunda (özellikle yenileme / F5 yapıldığında kırılmaması) kontrol edilmelidir.
*   **Özel Alan Adı (Custom Domain):** Premium paket üstü müşteriler için salon isimlerine ait Name Server veya A kaydı süreçlerinin manuel DNS doğrulamaları planlanmalıdır. Onay alınmadan "aktifleşti" gibi durumları arayüze yansıtmayın.

---

## Phase 12: Hukuki ve Gizlilik Onayları (Legal/Privacy Review)

Canlıya çıkış bir sözleşmedir; hukuk zırhı tamamlanmalıdır.

*   `Gizlilik Politikası (Privacy Policy)` sayfası yayınlanmalı.
*   `Kullanım Şartları (Terms of Service)` sözleşmesi yayınlanmalı.
*   Destek (Support) kontakt/iade adımları erişilebilir olmalı.
*   KVKK metinlerinde VERİ İŞLEYEN olarak LARİ sisteminin sınırları (Data Controller rütbesinde olan tarafın salon olduğu) çok net belirlenmelidir.
*   Son kullanıcının unutulma/silinme hakları belgelendirilmelidir.

---

## Phase 13: Üretim Duman Testi (Production Smoke Test)

`LIVE_SMOKE_TEST_SCRIPT.md` izlenerek Production sunucuda gerçekleştirilir.
*Ana rotalar, demo yolları, pilot ve register geçişleri kontrol edilir.*

Hata vermemesi gereken ve kilitlenen operasyonlar:
1. Üyelik açma
2. Checkout'a gitme ve iptal ederek geri dönme
3. Pilot rotalarından sızıntı yapmama (Auth)
4. Onboarding sihirbazını hatasız tamamlayıp Dashboard açma
5. Şubeye özel randevu testlerini müşteriye açık linkten başarıyla sipariş etme.

---

## Phase 14: Randımanlık ve İlk Gerçek Pilot Başvurusu (First Pilot Customer Launch)

Her şey üretimde çalıştığında ilk gerçek salona demo yapılır ve hesabı kurulur.

*   Salon seçilir (Karmaşıklığı düşük-orta seviyeli).
*   İstek formu (Intake Form) alınır ve sistem manuel kurulur.
*   Hesap canlı (Published) hale getirilir. Çalışma saatleri ve randevular teyit edilir.
*   Share Toolkit eğitim linki müşteriye gönderilir. 
*   Performans ve veriler izlenerek ilk hafta görüşmesi senaryosu (`FIRST_WEEK_FOLLOW_UP_SCRIPT.md`) devreye alınır. İlk kararlar alınır (Devam, İyileştirme).

---

## Phase 15: Felaket Kurtarma ve Geri Dönüş (Rollback and Incident Plan)

Beklenmedik felaket/hata (Incident) durumlarında LARİ Acil Durum Planı:

1.  **Kanama Durdurma:** Kayıt alımını kapatın. (Geçici yönlendirme panosu)
2.  **Ödeme Dondurma:** VITE_PAYMENT_RUN_MODE üzerinden paralı işlemler `local` moduna atılır veya Edge Function dondurulur. Randevu tarafı açık kalır, sadece satın alma engellenir.
3.  **Geri Yansıtma:** Supabase veritabanı kilitlendiyse son kararlı `localStorage` JSON exportu üzerinden kurtarılan veri snapshot ile entegre edilir.
4.  **İletişim:** Olay esnasında etkilenen pilot müşterilere güven tazeleyici teknik iletişim dilinde mailler yollanır. Tüm süreçlerde KVKK verileri ihlal edilmediği garanti altına alınır.
5.  Olay sonrası kesinlikle hiçbir kanıtlanabilir kayıt veya log silinmemelidir. Root-cause (kök neden) incelenmelidir.

---
_Lari Operations Documentation - Confidential Property of The Lari Platform._
