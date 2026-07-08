# LARİ - ÖDEMESİZ KISITLI CANLI ÜRETİM KAPSAM VE YETKİ NETLEŞTİRME BELGESİ
(PAYMENTLESS PRODUCTION SCOPE CLARIFICATION)

Bu döküman, LARİ platformunun **ödemesiz kısıtlı canlı üretim** (`paymentless_limited_production`) lansman modunda, platform sahipleri (kurucular/kurucu ortaklar) ile sisteme dahil edilen salonlar (kiracılar/tenants) arasındaki yasal, teknik, mali ve operasyonel sınırları net bir şekilde çizmek amacıyla hazırlanmıştır.

---

## 1. STRATEJİK ANLAM VE MOD TANIMI (LAUNCH MODE DEFINITION)

`paymentless_limited_production` modu, LARİ SaaS altyapısının **gerçek ve kalıcı veritabanıyla**, canlı internet ortamında (`randevulari.com` alan adı altında), ancak **online kredi kartı tahsilat kanalları tamamen devre dışı bırakılarak** çalıştırıldığı üretim ortamıdır.

*   **Platformun Sahibi:** Platformun tek sahibi ve yöneticisi LARİ kurucu ortaklarıdır.
*   **Salonun Rolü:** Salonlar sisteme yalnızca birer **kiracı müşteri (tenant customer)** olarak dahil olurlar. Sistem mülkiyeti, kaynak kodu, sunucu altyapısı veya veritabanı kontrolü kesinlikle salonlara devredilmez.
*   **Abonelik ve Lisans Yönetimi:** Süper Admin arayüzü üzerinden tamamen kurucular tarafından manuel olarak yürütülür.

---

## 2. SALONLAR NE ALIR? (WHAT SALONS RECEIVE)

Sisteme kayıt olan ve aboneliği aktive edilen pilot salonlar, sadece kendilerine özel yalıtılmış bir yazılım alanı (SaaS workspace) kullanma hakkı kazanırlar:

1.  **İşletme Sahibi/Yönetici Paneli (Owner/Admin Workspace):**
    *   Sadece kendi salonlarına ait şubeleri, çalışanları (uzmanları), hizmet kataloglarını ve çalışma saatlerini yönetebilecekleri web tabanlı arayüz.
    *   Bu panel, salon sahibine ve onun davet ettiği çalışanlara özeldir.
2.  **Kamu Rezervasyon Sayfası (Public Customer Booking Link):**
    *   Salonun müşterilerinin tarayıcı üzerinden kolayca randevu alabileceği kamuya açık rezervasyon arayüzü (`https://[salon-slug].randevulari.com`).
3.  **Müşteri Randevu Yönetim Sayfası (Self-Service Appointment Page):**
    *   Randevu alan son kullanıcıların randevularını takip edebileceği, erteleme veya iptal talebi iletebileceği güvenli self-servis linkleri.
4.  **Manuel Lisanslama Yetkisi:**
    *   Ödedikleri döneme ait hakların (entitlements) ve plan özelliklerinin (örneğin hizmet ve personel sınırları) tanımlanması.

---

## 3. SALONLAR NE ALMAZLAR? (WHAT SALONS DO NOT RECEIVE)

Salon sahiplerinin satın aldığı hizmet bir "yazılım lisansı kiralama" (SaaS) hizmetidir. Aşağıdaki unsurlar kesinlikle salonlarla **paylaşılmaz, devredilmez ve taahhüt edilmez**:

*   ❌ **Sistem Sahipliği veya Ortaklık:** Salon sahipleri LARİ şirketinin, markasının veya platformunun ortağı ya da sahibi değildir.
*   ❌ **Super Admin Erişimi:** `/super-admin/*` rotaları altındaki sistem yönetim paneli, diğer salonların takibi, finansal veriler ve log izleme alanları sadece LARİ ekibine aittir. Salonlara asla Super Admin yetkisi verilmez.
*   ❌ **Kaynak Kodu (Source Code):** LARİ'nin kaynak kodları, veri modelleri, algoritmaları ve fikri mülkiyeti tamamen LARİ'ye aittir. Hiçbir salona kaynak kod teslimi, beyaz etiket (white-label) mülkiyeti veya yazılım kurulum paketi verilmez.
*   ❌ **Altyapı ve Veritabanı Kontrolü:** Sunucular (Google Cloud Run), veritabanı (Supabase Postgres) ve DNS/SSL yönetimi tamamen LARİ ekibinin kontrolündedir. Salonlar kendi veritabanlarını barındırma veya sunucu yapılandırması talep edemezler.
*   ❌ **Özel Altyapı Barındırma (On-Premises):** Hizmet yalnızca LARİ'nin bulut altyapısı üzerinden sunulur. Salonun kendi fiziksel sunucusuna kurulum yapılmaz.

---

## 4. KURUCULARIN (SUPER ADMIN) SORUMLULUKLARI

LARİ kurucu ortakları, sistemin "Süper Yöneticisi" olarak aşağıdaki operasyonel görevleri yürütür:

1.  **Abonelik ve Ödeme Yönetimi (Manual Billing & Activation):**
    *   Salonlardan ödemeyi uygulama dışında (nakit veya banka havalesi/EFT) tahsil etmek.
    *   Süper Admin panelinden kiracı kaydını bulup statüsünü `manual_active` yapmak.
    *   Ödenen döneme göre `paidThroughDate` (Son Geçerlilik Tarihi) ve ödeme dekont numarasını sisteme manuel işlemek.
    *   Süresi dolan ve ödeme yapmayan salonları `suspended` durumuna alarak takvimlerini dondurmak.
2.  **Sistem Ayakta Tutma ve Bakım (Infrastructure Maintenance):**
    *   Cloud Run konteynerinin stabil çalışmasını sağlamak.
    *   Supabase veritabanını günlük olarak yedeklemek ve yedeklerin çalışabilirliğini test etmek (Backup Runbook).
3.  **Güvenlik ve Veri Yalıtımı (Security & Isolation):**
    *   Supabase RLS (Row Level Security) politikalarının kesintisiz çalışmasını sağlayarak, salonların birbirlerinin müşteri veya randevu verilerini görmelerini kesin olarak engellemek.
4.  **Hata Takibi ve Destek (Incident & Bug Tracking):**
    *   Observability panelini izleyerek sistem genelindeki hataları gidermek.

---

## 5. REZERVASYON VE ÖDEME AKIŞI GÜVENLİK SINIRLARI

*   **Ödeme Tamamen Dışarıdadır (Offline Payment Only):** Uygulama içinde kesinlikle kredi kartı numarası toplayan formlar, "kredi kartı gerekmez" gibi yanıltıcı ibareler veya canlı iyzico API bağlantıları yer almaz. Ödeme duman testi ve gerçek tahsilat adımları elden/havale ile gerçekleşir.
*   **Müşteri Randevu Kayıtları:** Müşterilerin public sayfadan aldığı randevular, tarayıcının yerel hafızasında (`localStorage`) değil, **güvenli ve kalıcı canlı veritabanında (Supabase)** saklanır. Canlıda yerel depolama (`localStorage`) kullanımı kesinlikle yasaktır; bu sadece demo veya local-dry-run modları için bir B planıdır.

---

## 6. GELECEKTEKİ ONLINE ÖDEME GÖÇÜ (ONLINE PAYMENT MIGRATION PARITY)

Sanal POS (iyzico vb.) kurulumu yasal olarak tamamlandığında, manuel çalışan salonlar şu kurallarla kesintisiz bir şekilde online sisteme aktarılır:

1.  **Veri Koruma Garantisi:** Salonun personelleri, hizmetleri, çalışma saatleri ve tüm randevu geçmişleri eksiksiz korunur. Herhangi bir veri transferi veya yeniden kurulum gerekmez.
2.  **Kalan Hakların Korunması:** Salonun elden peşin ödediği sürenin sonuna kadar (`paidThroughDate`) hiçbir kredi kartı çekimi yapılmaz, mevcut hakları aynen korunur.
3.  **Kademeli Kart Tanımlama:** Elden ödeme süresi dolmaya yakın salon sahibine panel üzerinden kart tanımlama uyarısı gösterilir ve iyzico güvenli arayüzü ile kartını girmesi istenir. Kart girildiğinde statü sorunsuz şekilde online `active` moduna güncellenir.

---

## 7. KESİNLİKLE VERİLMEMESİ GEREKEN TAAHHÜTLER (DO NOT PROMISE)

Salon sahipleriyle yapılan satış ve saha görüşmelerinde **kesinlikle kurulmaması gereken cümleler**:

*   ❌ *"Bu yazılımın mülkiyetini size devrediyoruz."* (Doğrusu: "Sadece kullanım lisansı kiralıyorsunuz.")
*   ❌ *"Sizin için ayrı bir sunucu kurup yazılımı oraya yükleyeceğiz."* (Doğrusu: "Güvenli, ortak bulut altyapımızda size özel bir alan açıyoruz.")
*   ❌ *"Size sistemin yönetim panelini (Super Admin) de veriyoruz, her şeyi görebilirsiniz."* (Doğrusu: "Super Admin sadece LARİ yönetim ekibine aittir, siz sadece kendi salonunuzun panelini görürsünüz.")
*   ❌ *"Yazılımın kaynak kodlarını isterseniz teslim ederiz."* (Doğrusu: "Kaynak kodları tamamen LARİ'nin fikri mülkiyetidir ve dışarı verilmez.")

Bu sınırlar, platformun hem teknik bütünlüğünü hem de kurucuların mülkiyet haklarını korumak için hayati önem taşımaktadır.
