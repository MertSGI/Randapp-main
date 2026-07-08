# LARI - MANUAL TENANT ACTIVATION LIVE RUNBOOK (MANUEL KİRACI AKTİVASYONU CANLI OPERASYON KILAVUZU)

Bu el kitabı, LARİ kurucu ortaklarının (Super Admin) elden veya havale ile tahsilat yaptıktan sonra, yeni salon kiracılarını (müşterilerini) sisteme nasıl tanımlayacağını, aboneliklerini (hesaplarını) nasıl başlatacağını ve operasyonel süreçleri nasıl yöneteceğini adım adım açıklar.

**ÖNEMLİ KAPSAM SINIRI:**
Bu süreçte salon sahiplerine herhangi bir altyapı, sunucu, kaynak kodu veya sahiplik devredilmemektedir. Salon sahipleri sadece kendilerine ait kiracı hesabına (tenant workspace) ve kendi müşterileri için rezervasyon bağlantısına erişim hakkı elde eder. Tüm platform kontrolü, kaynak kod mülkiyeti, sunucu yönetimi ve Super Admin paneli strictly (kesin olarak) yalnızca LARİ'ye aittir.

---

## 1. ADIM 1: SAHA SATIŞI VE SÖZLEŞME SÜRECİ

1.  **Müşteri Görüşmesi:** Salon sahibiyle birebir görüşülerek LARİ'nin özellikleri (randevu yönetimi, personel paneli, müşteri rezervasyon sayfası) anlatılır.
2.  **Fiyatlama ve Paket Seçimi:** Salonun şube ve personel sayısına göre uygun bir paket (Standart, Profesyonel veya Premium) seçilir.
3.  **Tahsilat:** Aylık veya yıllık abonelik bedeli elden nakit veya belirtilen şirket/şahıs banka hesabına havale/EFT yoluyla tahsil edilir.
4.  **Manuel Protokol:** Salon sahibiyle basit bir hizmet ve veri işleme (KVKK) mutabakat protokolü fiziksel veya PDF olarak imzalanır.

---

## 2. ADIM 2: KİRACI HESABININ OLUŞTURULMASI VE AKTİVASYONU

Ödemesiz Canlı üretim modunda (`paymentless_limited_production`), kiracı aktivasyonu iki yöntemle yapılabilir:

### Yöntem A: Salon Sahibinin Kendisinin Kaydolması (Tercih Edilen)
1.  Salon sahibi `randevulari.com/register` adresine gider.
2.  İşletme adı, kendi adı, e-posta adresi ve şifresini girerek kaydolur.
3.  Kayıt sonunda sistem online ödemenin devredışı olduğunu ve "Manuel Aktivasyon Süreci" kapsamında LARİ ekibiyle iletişime geçmesi gerektiğini belirten bir ekran gösterir. Salon sahibinin kiracı kaydı veritabanında `pending_checkout` durumunda oluşur.
4.  Süper Admin, kendi yönetim panelinden salonun kaydını görür, tahsilatı kontrol eder ve hesabı onaylar.

### Yöntem B: Süper Admin Tarafından Doğrudan Kurulum (Hızlı Kurulum)
1.  Süper Admin, `/super-admin/provisioning` sayfasına girer.
2.  **Resmi Salon Adı**, **Özel Web Adresi (URL Slug)**, **Sahibi E-Posta Adresi** bilgilerini doldurur.
3.  **Hizmet Paketi** (Plan Level) alanından anlaşılan paketi seçer.
4.  **Sözleşme Modeli** (Billing Source) alanından aşağıdaki uygun seçeneği belirler:
    *   `offline_payment`: Banka havalesi veya nakit ödeme yapıldıysa.
    *   `complimentary`: Hediye veya barter üyelik ise.
    *   `pilot_exception`: İlk saha testleri kapsamında ücretsiz bir pilot salon ise.
5.  **"İşletmeyi Kur ve Lisansı Aktifleştir"** butonuna tıklar. Sistem anında kiracıyı, sahibini ve aboneliği `manual_active` statüsünde oluşturur. Giriş bilgileri salon sahibine iletilir.

---

## 3. ADIM 3: LİSANS DETAYLARININ VE ÖDEME TARİHLERİNİN KAYDEDİLMESİ

Manuel aktivasyon tamamlandığında, abonelik kaydına şu parametreler mutlaka girilmelidir (Süper Admin veya arka plan scripti aracılığıyla):

1.  **Abonelik Durumu (Status):** `manual_active`
2.  **Ödenen Son Gün (Paid-Through Date):** Tahsil edilen döneme göre hesaplanan son aktif gün (örn. 30 gün sonrası). Bu tarihe kadar salon kesintisiz hizmet alır.
3.  **Ödeme / Dekont Referansı (Payment Reference):** Banka dekont numarası (örn. "FT-2026-09281") veya elden makbuz referansı girilerek muhasebe kaydı oluşturulur.
4.  **Aktivasyon Gerekçesi (Manual Activation Reason):** "1 Aylık Standart Paket Havale Tahsilatı" vb.
5.  **Sonraki Kontrol Tarihi (Next Manual Review Date):** Ödemenin biteceği günden 3 gün öncesine kurulur. Kurucular bu tarihte yeni dönem ödemesini istemek için salonu arayacaktır.

---

## 4. ADIM 4: ABONELİK DURAKLATMA, ASKIYA ALMA VE İPTAL OPERASYONLARI

Eğer salon ödemesini geciktirirse veya hizmeti durdurmak isterse, Süper Admin panelden şu aksiyonları alır:

*   **Geçici Duraklatma (Pause):** Salon sahibi geçici olarak kapalıysa veya tadilattaysa abonelik `paused` yapılır. Randevu alımı dondurulur ama veriler korunur.
*   **Askıya Alma (Suspend):** Ödeme süresi geçtiği halde yeni dönem ödemesi yapılmadıysa, hesap `suspended` durumuna alınır. Salon sahibinin yönetim paneline erişimi engellenir, müşterilere randevu sayfası kapatılır.
*   **Tam İptal (Cancel):** Salon işi bırakırsa veya sistemden çıkmak isterse abonelik `cancelled` yapılır.

---

## 5. ADIM 5: GELECEKTE ONLINE ÖDEMEYE SORUNSUZ GEÇİŞ (MIGRATION PARITY)

Aylarca manuel aktivasyonla yönetilen bir salon, gelecekte şirket kurulup iyzico canlı sanal POS sistemi aktif edildiğinde **veri kaybı yaşamadan** online ödemeli SaaS modeline geçecektir.

### Kesintisiz Geçiş Garantisi
1.  **Veriler Korunur:** Salonun tüm çalışanları, randevu geçmişleri ve müşteri rehberi aynen kalır.
2.  **Ödeme Dönemi Korunur:** Salonun elden peşin ödediği sürenin sonuna kadar (`paidThroughDate`) kartından herhangi bir çekim yapılmaz.
3.  **Kart Tanımlama:** Ödeme dönemi bittiğinde salon sahibine bir bildirim gönderilir: *"Elden ödeme döneminiz sona eriyor. Hizmetinizin kesintisiz devam etmesi için lütfen güvenli iyzico arayüzünden kredi kartınızı tanımlayın."*
4.  **Otomatik Geçiş:** Kredi kartı tanımlandığında abonelik durumu `manual_active` statüsünden otomatik olarak iyzico tabanlı `active` statüsüne yükseltilir.
