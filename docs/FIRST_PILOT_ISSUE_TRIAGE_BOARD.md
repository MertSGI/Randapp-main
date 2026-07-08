# LARİ İlk Pilot Hata ve Geri Bildirim Takip Tablosu (First Pilot Issue Triage Board)

Bu döküman, pilot uygulamalar sırasında salon sahipleri veya müşteriler tarafından bildirilen hataların (bug), kafa karışıklıklarının ve iyileştirme taleplerinin önceliklendirilerek çözüme kavuşturulmasını sağlayan **Hata Triyaj Tablosudur**.

---

## 1. Sorun Kategorileri (Severity Levels)

*   🔥 **Blocker (Engelleyici):** Sistemin tamamen durmasına, randevu alınamamasına veya veri kaybına yol açan, anında çözülmesi gereken kritik hatalar.
*   ⚠️ **Major (Yüksek):** Temel bir fonksiyonun (örn: iptal talebi oluşturma) çalışmadığı veya aşırı zor çalıştığı ama geçici bir çözümün (workaround) olduğu durumlar.
*   ⚡ **Minor (Düşük):** Görsel bozukluklar, yazım hataları, yanlış yönlendirme ikonları gibi sistemi kilitlemeyen estetik kusurlar.
*   💡 **Improvement (Geliştirme):** Kullanıcı deneyimini iyileştirecek, salon sahibinin işini kolaylaştıracak yeni özellik veya arayüz talepleri.

---

## 2. Hata ve Geri Bildirim Takip Tablosu (Triage Board)

| ID | Kiracı (Tenant) | Etkilenen Akış | Önem Seviyesi (Severity) | Yöneticiye Etkisi (Owner Impact) | Müşteriye Etkisi (Customer Impact) | Yeniden Üretim Adımları (Reproduction) | Bağlı Audit Logu / Bilet ID | Durum (Status) | Alınan Karar ve Aksiyon (Decision) | Çözüm Sürümü / Tarihi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **#01** | `melis-guzellik` | Randevu Alma | 🔥 **Blocker** | Yeni randevuları göremiyor, müşteri kazanamıyor. | Randevu tamamla butonuna basınca sayfa hata veriyor. | 1. `/booking/melis-guzellik` aç.<br>2. Hizmet seç.<br>3. Tamamla butonuna bas. | Audit Event: `BOOKING_ERROR_09`<br>Ticket: `#1002` | **Çözüldü** | Eksik veritabanı parametresi giderildi, duman testi başarıyla çalıştırıldı. | v1.0.2 / 29.06.2026 |
| **#02** | `test-salon` | Self-Servis Link | ⚠️ **Major** | İptal taleplerini göremiyor, manuel arama gerekiyor. | Randevu onayındaki yönetim linki tıklandığında açılmıyor. | 1. Onay e-postasındaki self-servis linkine tıkla.<br>2. Token doğrulamasının başarısız olduğunu gör. | Ticket: `#1005` | **Çözüldü** | Token doğrulama servisindeki rota ve şifreleme parametreleri güncellendi. | v1.0.3 / 29.06.2026 |
| **#03** | `melis-guzellik` | Çalışma Saatleri | ⚠️ **Major** | Mola saatlerini yanlış tanımlıyor, çakışma oluyor. | Seçilebilen saatlerde kafa karışıklığı yaşıyor. | 1. `/admin` -> Saatler sekmesine git.<br>2. Aynı güne iki mola girmeye çalış. | Audit Event: `HOURS_OVERLAP` | **Çözüldü** | Arayüze mola saatlerinin çakışmasını önleyen otomatik engelleyici eklendi. | v1.0.3 / 29.06.2026 |
| **#04** | `test-salon` | Hizmet Fiyatı | ⚠️ **Major** | Hizmet fiyatı güncellendiğinde müşteriye eski fiyat görünüyor. | Kasada farklı fiyatla karşılaşma riski var. | 1. `/admin` -> Hizmetler sekmesinden fiyatı güncelle.<br>2. Kaydet ve çık.<br>3. Randevu sayfasında fiyatın değişmediğini gör. | Audit: `CATALOG_SAVE_DELAY` | **Çözüldü** | Lokal önbellek (cache) temizleme algoritması düzeltildi, anlık güncelleme sağlandı. | v1.0.4 / 29.06.2026 |
| **#05** | `melis-guzellik` | Görsel Alanı | ⚡ **Minor** | Salon görseli boş veya alakasız görünüyor. | Salonun prestiji için profesyonel durmuyor. | 1. `/booking/melis-guzellik` sayfasını aç.<br>2. Varsayılan pre-live kapağını gör. | N/A | **Açık** | Salonun gerçek salon içi görseli çekildiğinde `mediaAssetService` ile bizzat güncellenecek. | Planlanan: 05.07.2026 |
| **#06** | `test-salon` | Randevu İptali | ⚡ **Minor** | İptal edilen randevular takvimde hâlâ koyu renk görünüyor. | Dolu/boş saatleri karıştırıyor. | 1. Bir randevuyu iptal et.<br>2. Takvim sekmesindeki rengine bak. | N/A | **Çözüldü** | İptal edilen randevuların takvimdeki rengi gri/silik hale getirildi. | v1.0.5 / 29.06.2026 |
| **#07** | `melis-guzellik` | Giden Kutusu | ⚡ **Minor** | SMS metnindeki "simüle edilmiştir" uyarısı kafa karıştırıyor. | Müşteri mesajın gidip gitmediğini anlayamıyor. | 1. `/super-admin/scheduler` çalıştır.<br>2. Outbox metnini incele. | N/A | **Çözüldü** | Pre-live ibareleri ve uyarıları müşteri tarafında gizlendi, sadece admin logunda görünür yapıldı. | v1.0.6 / 29.06.2026 |
| **#08** | `test-salon` | KVKK Onayı | ⚡ **Minor** | Onay kutusu yazısı çok uzun ve karmaşık duruyor. | Müşteri onaylarken çekiniyor. | 1. Randevu oluşturma ekranındaki KVKK checkbox'ını oku. | N/A | **Yeniden Değerlendiriliyor** | Avukat onayı bekliyor. Pre-live aşamasında hukuki riskleri önlemek adına metnin tam kalması kararlaştırıldı. | - |
| **#09** | `test-salon` | Fatura Statüsü | 💡 **Improvement** | Süper Admin faturayı "Ödenmedi"den "Ödendi"ye çekerken not ekleyemiyor. | Muhasebe takibi zorlaşıyor. | 1. `/super-admin/provisioning` sayfasına git.<br>2. Tahsilat notu alanının olmadığını gör. | N/A | **Çözüldü** | Süper Admin manuel faturalandırma formuna "Tahsilat / Havale Notu" alanı eklendi. | v1.1.0 / 29.06.2026 |

---

## 3. Triyaj Toplantısı Rutini

Kurucular, her pilot gününün sonunda (akşam saat 19:00'da) bu panoyu açarak şu 3 adımı uygular:
1.  **Giriş:** Gün boyu gelen tüm destek biletlerini ve gözlem loglarını bu panoya yeni satır olarak ekleyin.
2.  **Önceliklendirme:** Blocker ve Major olanları belirleyin ve o gece düzeltmek üzere görev paylaşımı yapın.
3.  **Doğrulama:** Çözülen hataları ertesi gün salondan önce bizzat duman testleri (`verify-live-readiness-smoke.mjs`) ile test edin, çalıştığından emin olduktan sonra salona "Düzelttik, kontrol edebilirsiniz" bilgilendirmesi yapın.
