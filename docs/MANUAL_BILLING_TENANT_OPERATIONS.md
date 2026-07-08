# LARİ Manuel Faturalandırma ve Kiracı Yönetim Rehberi (Manual Billing Tenant Operations)

Bu kılavuz, `limited_live_manual_billing` modunda Süper Adminlerin kiracı (tenant) müşteri hesaplarını nasıl kuracağını, abonelik sürelerini nasıl yöneteceğini, manuel fatura kayıtlarını nasıl tutacağını ve askıya alma işlemlerini nasıl yapacağını adım adım açıklar.

**YETKİ VE SAHİPLİK SINIRLARI:**
*   **Sistem Mülkiyeti:** Tüm altyapı, sunucular, veritabanı kontrolü ve kaynak kodları LARİ'ye aittir. Salonlar platform sahibi değil, sadece birer kiracı müşteridir.
*   **Super Admin Koruması:** Super Admin yetkileri ve yönetim paneli yalnızca LARİ kurucularına özeldir, salon sahipleriyle asla paylaşılmaz.
*   **Kalıcı Veritabanı:** Canlı ortamdaki salonların randevularının kalıcı veritabanında (Supabase Postgres) saklanması zorunludur. `localStorage` kullanımı sadece local/demo ortamlar için geçici bir seçenek olup canlıda kesinlikle kabul edilemez.

---

## 1. Manuel Faturalandırma ve Abonelik Statüleri

Aboneliklerin takibi ve raporlaması için sistem üzerinde kullanılan 5 temel statü mevcuttur:

### 1. `manual_active` (Manuel Aktif)
*   **Açıklama:** Ödemesi banka havalesi, EFT veya elden nakit olarak tahsil edilmiş ve Süper Admin tarafından doğrulanmış hesap.
*   **Yönetim:** Sistem içinde randevu alma ve yönetim özellikleri tamamen açıktır.

### 2. `offline_payment` (Çevrimdışı Ödeme Sürecinde)
*   **Açıklama:** Salon sahibine fatura kesilmiş veya ödeme talep edilmiş, ancak transferin henüz banka hesabına ulaşmadığı ara durum.
*   **Yönetim:** Belirlenen vade süresince (en fazla 5 iş günü) takvim açık tutulabilir.

### 3. `manual_invoice` (Manuel Faturalı)
*   **Açıklama:** Muhasebe programı veya GİB portalı üzerinden kesilen faturanın numarasının sistemde elle işlendiği statü.
*   **Yönetim:** Mali denetim ve vergi uyumluluğu için dekontlarla fatura eşleştirmesi bu aşamada tamamlanır.

### 4. `complimentary` (Tamamlayıcı / Ücretsiz Hesap)
*   **Açıklama:** Influencer salonlar, iş ortakları veya test amaçlı kurulan, ücret talep edilmeyen hesap türü.
*   **Yönetim:** Süresi süresiz veya uzun dönemli (Örn: 12 ay) set edilebilir.

### 5. `pilot_exception` (Pilot İstisnası)
*   **Açıklama:** Pilot denemeleri sırasında teknik aksaklıklardan ötürü süresi geçici olarak esnetilen, ücret tahsil edilmeyen ayrıcalıklı hesap.

---

## 2. Adım Adım Manuel Kiracı Yönetim Operasyonları

### Yeni Salon Kurulumu ve Onboarding
1.  **Talep Alımı:** `/register` üzerinden salon kaydı gelir veya kurucu `/super-admin/provisioning` üzerinden doğrudan kiracı açar.
2.  **Ödeme Tanımlama:** Ödeme tipi `bank_transfer` olarak seçilir.
3.  **Süre Sınırı Girişi:** `paidThroughDate` alanına ödemenin kapsadığı son gün (Örn: 29.06.2027) girilir.
4.  **Aktivasyon Notu:** `manualActivationReason` alanına havale gönderen isim ve banka adı girilir (Örn: "Ahmet Yılmaz - İş Bankası Havalesi ile 12 Aylık Ücret Alındı").

### Abonelik Uzatma (Extension)
*   Süresi biten salon havale gerçekleştirdiğinde, Süper Admin ilgili salonun kaydını bulup `paidThroughDate` tarihini 1 ay veya 1 yıl ileriye günceller ve yeni ödeme dekont numarasını `paymentReferenceNote` alanına kaydeder.

### Hesap Askıya Alma ve Engelleme (Suspension)
*   Ödemesini geciktiren veya yenilemeyen salonun abonelik durumu `suspended` (Askıda) olarak güncellenir.
*   **Sonuç:** Salon sahibi `/admin` paneline girmeye çalıştığında "Aboneliğiniz askıya alınmıştır, lütfen ödeme yapınız" uyarısı alır. Müşteri randevu sayfası geçici olarak "Rezervasyon alımına kapalıdır" ibaresiyle pasifleşir.

---

## 3. Süper Admin Haftalık Rutin Denetimleri

Her Pazartesi günü Süper Admin şu kontrolleri gerçekleştirmekle yükümlüdür:
*   [ ] **Süresi Yaklaşanlar:** `paidThroughDate` tarihine 7 günden az kalan kiracılar listelenir ve sahipleriyle WhatsApp üzerinden dürüst iletişim kurulur.
*   [ ] **Fatura Kontrolü:** `manual_invoice` statüsündeki tüm kayıtların e-Arşiv faturalarının kesilip kesilmediği e-Devlet ve muhasebe programından sorgulanır.
*   [ ] **Log İnceleme:** Kiracıların `/super-admin/observability` üzerindeki hata logları incelenerek teknik tıkanıklık yaşayıp yaşamadıkları denetlenir.
