# LARİ Çevrimdışı (Offline/Manual) Ödeme ile Canlıya Geçiş Kılavuzu

Bu döküman, LARİ SaaS platformunun online ödeme entegrasyonu (iyzico vb.) tamamen aktif edilmeden önce, salonlara (kiracı müşterilere) **manuel/çevrimdışı (offline)** yöntemlerle nasıl satılabileceğini, faturalandırılabileceğini ve Süper Admin tarafından nasıl yönetileceğini açıklayan operasyonel kılavuzdur.

**KRİTİK HUSUS:**
Salonlara yapılan satışlarda sistem kurulumu veya kaynak kodu devri söz konusu değildir; salonlar sadece müşteri sıfatıyla kendi kiracı hesaplarına (workspace) erişirler. Tüm sistem kontrolü, veritabanı altyapısı ve Super Admin yetkileri kesin olarak LARİ ekibindedir.

---

## ⚠️ Yasal ve Mali Sorumluluk Uyarısı (Disclaimer)
Bu kılavuzda yer alan bilgiler ticari ve operasyonel birer öneri olup, kesinlikle **mali, muhasebesel veya yasal bir tavsiye niteliği taşımaz**. Çevrimdışı veya çevrimiçi yöntemlerle gerçek para tahsilatı yapmadan önce yetkili bir **mali müşavir, yeminli mali müşavir veya hukuk danışmanı** ile görüşülmeli; vergilendirme, fatura kesim süreçleri ve mesafeli satış sözleşmeleri mevzuata uygun hale getirilmelidir.

---

## 1. Çevrimdışı Ödeme ile Satış Yapılabilir mi?
**Evet, kesinlikle.** LARİ, teknik olarak çevrimdışı ve manuel ödeme akışlarını tam uyumlu bir şekilde desteklemektedir. 

Girişimlerin ilk aşamasında, online sanal POS komisyonlarından kaçınmak veya şirketleşme sürecini tamamlayana kadar vakit kazanmak amacıyla, pilot salonlar manuel ödeme yöntemleriyle sisteme dahil edilebilir.

### Desteklenen Manuel Billing Durumları
Sistem, kiracının (tenant) durumunu takip etmek için `subscriptionService` bünyesinde şu abonelik statülerini kullanır:
*   `active` (Aktif abonelik)
*   `trial` (Ücretsiz deneme süresi)
*   `payment_pending` (Ödeme bekliyor - kullanım askıda değil)
*   `suspended` (Ödeme yapılmadığı için askıya alınmış)

---

## 2. Süper Admin Tarafından Manuel Kiracı Aktivasyonu
Bir salon sahibiyle el sıkışılıp ödeme çevrimdışı olarak alındığında, Süper Admin şu adımlarla salonu aktif hale getirir:

1.  **Süper Admin Paneline Giriş:** `/super-admin/provisioning` sayfasına gidilir.
2.  **Salon Bilgilerini Girme:** Salon sahibinin unvanı, e-postası, şube sayısı ve dilediği `tenantSlug` girilir.
3.  **Abonelik Ayarlarını Seçme:**
    *   Ödeme Tipi: **Offline / Manual Billing** seçilir.
    *   Ödeme Türü Detayı belirlenir (Nakit, EFT/Havale, Fiziki POS, Ücretsiz Pilot).
    *   Abonelik Süresi (örn: 12 Ay) ve Fiyat girilir.
4.  **Kurulumu Tamamlama:** Butona basıldığında, sistem arka planda salon veritabanını oluşturur, varsayılan servisleri/saatleri kurar ve aboneliği doğrudan `active` durumuna getirir.

---

## 3. Çevrimdışı Ödeme Türleri ve Sistemde Takibi
Süper Admin panelindeki Ödemeler (`/super-admin/payments`) sekmesi üzerinden şu manuel tahsilat türleri kayıt ve takip altına alınır:

| Tahsilat Türü | Açıklama | Sistemdeki Kayıt Şekli | Operasyonel Süreç |
| :--- | :--- | :--- | :--- |
| **EFT / Havale** | Müşterinin banka hesabımıza doğrudan yaptığı transfer. | `payment_method: "bank_transfer"` | Banka hesabı günlük kontrol edilir, para ulaştığında Süper Admin faturayı "Paid" işaretler. |
| **Nakit (Cash)** | Elden yapılan tahsilat. | `payment_method: "cash"` | Süper Admin tahsilat makbuzunu keser ve sisteme nakit girişi kaydeder. |
| **Fikihi POS** | Salon ziyareti sırasında şirket POS cihazından çekilen tutar. | `payment_method: "physical_pos"` | POS çıktısı muhasebeye iletilir, sistemde ödeme onaylanır. |
| **Ücretsiz Pilot İstisnası** | Lansman öncesi geri bildirim toplamak amacıyla ücretsiz sunum. | `payment_method: "complimentary"` | Ücret sıfır olarak kaydedilir, statü sınırsız aktif veya 3 ay deneme olarak girilir. |

---

## 4. Uygulama Dışında Yapılması Gereken Operasyonel Hazırlıklar

Sistem içinde online ödeme bulunmadığı için, aşağıdaki yasal ve mali süreçlerin **uygulama dışında (offline)** tamamlanması şarttır:

*   **Şirket ve Vergi Levhası Kurulumu:** Gerçek kişilerden veya salonlardan para tahsil edebilmek için şahıs şirketi veya limitet/anonim şirket kurulmuş olmalıdır.
*   **Fatura/Makbuz Süreci:** Alınan her çevrimdışı ödeme için (EFT, Nakit, POS) en geç 7 gün içinde e-Arşiv Fatura veya Serbest Meslek Makbuzu düzenlenerek salon sahibine e-posta ile ulaştırılmalıdır.
*   **Islak İmzalı Sözleşme:** Online onaylı Mesafeli Satış Sözleşmesi yerine, salon sahibiyle pre-live veya pilot kullanım şartlarını içeren **ıslak imzalı bir fiziki sözleşme** yapılması yasal güvenliği artırır.

---

## 5. Kesinlikle Taahhüt Edilmemesi Gereken Hususlar
Salon sahiplerine satış yapılırken, henüz devrede olmayan aşağıdaki özelliklerin **kesinlikle taahhüt edilmemesi** operasyonel güvenilirlik açısından çok önemlidir:

*   ❌ **"Kredi kartınızdan her ay otomatik çekim yapılacak"** (Çevrimdışı modelde her dönem manuel havale/EFT talep edilmelidir).
*   ❌ **"Sistem size otomatik fatura oluşturup maliyeye iletecek"** (Fatura kesim süreci tamamen muhasebe tarafınızdan manuel yürütülmektedir).
*   ❌ **"iyzico panelinizden randevu bazlı komisyonları anlık göreceksiniz"** (Sanal POS aktif olana kadar randevular ücretsiz/offline ödeme şeklindedir).

---

## 6. Gelecekte Online Ödemeye Geçiş Planı

Çevrimdışı başlayan sistem, şirket kurulumu ve sanal POS entegrasyonu tamamlandığında şu adımlarla online ödemeye yükseltilir:

1.  **iyzico Başvurusu:** Şirket evrakları ile iyzico'ya sanal POS başvurusu yapılır.
2.  **API Anahtarlarının Temini:** iyzico üye işyeri panelinden sandbox ve canlı (production) API anahtarları alınır.
3.  **Çevre Değişkenlerinin Tanımlanması:** `.env` dosyasına `IYZICO_API_KEY` ve `IYZICO_SECRET_KEY` güvenli bir şekilde eklenir (asla istemci koduna sızdırılmaz).
4.  **Edge Functions Canlıya Alma:** Supabase Edge Functions üzerinde webhook imza doğrulaması aktif edilir.
5.  **Abonelik Planı Eşleme:** Sistemdeki fiyat kartları iyzico tarafındaki abonelik planı ID'leri ile birebir eşleştirilir.
6.  **Canlıya Geçiş Onayı:** Test işlemleri tamamlandıktan sonra, Süper Admin panelinden `paymentRunMode` "live" konumuna getirilerek kartla ödeme kanalları tüm kullanıcılara açılır.
