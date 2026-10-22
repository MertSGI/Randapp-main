# LARİ Program Master Decisions

**Document ID:** LARI-DOC-MASTER-DECISIONS-20261021  
**Program:** LARİ (Güzellik ve Hizmet Sektörü Çok Kiracılı Rezervasyon & İşletme Yönetim Platformu)  
**Product Base SHA:** `72911e4fb68dd4f85f7fafef575089104102064e`  
**Default Operational Branch (Protected):** `staging/supabase-staging-consistency` @ `c8dfd3d247c8669b3e21f883451c777a376133ed`  
**Accepted Open PR #3:** `2b238ed66c5ef4f47fd35b613f8dda405c85f60d` (Kapsam dışı; owner onayı gerektirir)  
**Canonical Program Reference:** https://docs.google.com/document/d/17yOmpnq41W5v1Rcgk4CS9PRLZkUlnPVJZVIbtJ7GpLI/edit  

---

## 1. Ürün Fazları ve Kapsam Sınırları

### 1.1. LARİ V1-A (Çekirdek Operasyonel Temel - Doğrudan Canlıya Açılacak Faz)
Aşağıdaki yetenekler V1-A kapsamındadır ve üretim öncesi staging üzerinde doğrulanır:
- Çok kiracılı (multi-tenant) kayıt, kimlik doğrulama ve rol yönetimi (Super Admin, Salon Sahibi/İşletmeci, Personel, Müşteri).
- İşletme onboarding akışı: salon profili, çalışma saatleri, tatil günleri, şube tanımları.
- Şube, personel ve hizmet konfigürasyonu (süre, mola, kapasite, uzmanlık eşleştirmeleri).
- Gerçek booking motoru ve müşteri self-service randevu oluşturma/iptal/değişiklik akışları.
- Müşteri portalı ve randevu takip arayüzü.
- Super Admin konsolu ve manuel faturalama/abonelik takibi (manuel tier ve kota yönetimi).
- Hukuki veri kalıcılığı (KVKK metinleri, rıza kayıtları, denetim logları).
- Yedekleme (P0) doğrulaması ve veri kurtarma tatbikatı.
- Gerçek staging ortamında E2E test geçişi ve kontrollü pilot müşteri kabulü.

### 1.2. LARİ V1-B (Finansal & Sağlayıcı Aktivasyon Fazı - Dış Onay Sonrası)
Aşağıdaki modüller dış kurumsal/banka onayları tamamlanana kadar **KAPALI (FAIL-CLOSED)** kalacaktır:
- Çevrimiçi ödeme geçidi (Iyzico, Stripe vb.) entegrasyonu ve kartlı ödeme alma.
- Şirket, vergi ve resmi merchant hesap tanımlamaları.
- Otomatik e-fatura / e-arşiv entegrasyonları.
- Canlı üçüncü taraf SMS/iletişim sağlayıcı abonelikleri (yerel simülasyon ve webhook sözleşmesi hariç).

### 1.3. LARİ V2 (Gelişmiş İşletme ve Ekosistem Fazı - Mevcut Kod Korunur)
Hazırda bulunan ileri seviye kod blokları silinmez, V1 kararlılığını bozmayacak şekilde muhafaza edilir:
- Gelişmiş UI bileşenleri ve yeni tema motoru (`components/ui-v2/*`).
- Stok takip, ürün satışı ve POS sepet entegrasyonu.
- İleri düzey CRM, sadakat puanları, müşteri segmentasyonu.
- Sağlık turizmi ve medikal estetik klinik iş akışları.
- Yapay zeka destekli randevu optimizasyonu ve akıllı asistan.
- Pazar yeri (marketplace) ve platform çapında salon arama/keşif.

---

## 2. "7/24" İfadesinin Kanonik Tanımı

- **Kanonik Anlam:** LARİ deposunda "7/24" terimi, **LARİ kaynak kodunu sürekli, deterministik ve gözetimli olarak geliştiren, test eden ve kuyruktan iş tüketen dayanıklı bir yerel agent kontrol döngüsünü (dev runner)** ifade eder.
- **Ayrım:** Uygulamanın son kullanıcıya yönelik randevu zamanlayıcısı, SMS hatırlatıcı cron'u veya bildirim işleyicisi ayrı bir operasyonel sistem gerekliliğidir ve harici AOS WP2 kabulüne bağımlı değildir.
- **Güvenlik Sınırı:** Dev runner bir arka plan işletim sistemi servisi olarak yetkisiz çalıştırılamaz; sadece deterministik komut allowlist'i ve açık kullanıcı denetimi ile çalışır.

---

## 3. Çalışma Alanı ve Yetki İlkeleri

- **İzole Çalışma:** Tüm geliştirme `work/` önekli izole dallarda ve bağımsız Git worktree'lerinde yürütülür. `staging/**` dalları otomatik QA/dağıtım tetikleyebileceğinden geliştirme dalı olarak kullanılamaz.
- **Dokunulmaz Varlıklar:**
  1. `staging/supabase-staging-consistency` korumalı operasyonel dalı.
  2. Açık ve kabul edilmiş PR #3 (`2b238ed66c5ef4f47fd35b613f8dda405c85f60d`).
  3. Üretim (Production) veritabanı, Supabase staging SQL şeması doğrudan müdahalesi, ödeme geçidi canlı anahtarları.
  4. Mevcut kirli/korunan worktree'ler.
- **Fail-Closed İlkesi:** Sunucu doğrulaması (server attestation) bulunmayan hiçbir istemci akışı (localStorage, browser devtools vb.) üzerinden canlı ödeme modu (`production_live`) aktif edilemez.

---

## 4. Model Rolleri ve Kota Disiplini

- **Gemini 3.8 Flash:** WP-A (Program Dokümantasyonu) ve WP-C (İstemci Ödeme Güvenliği Fail-Closed Düzeltmesi).
- **Argon:** WP-B (Kalıcı Dev Runner State Machine ve Testleri).
- **Kota Yaklaşımı:** Kota sınırına ulaşıldığında tamamlanmış commit ve checkpoint'ler saklanır; paket sınırlarında durularak gereksiz tekrar tüketim engellenir.
