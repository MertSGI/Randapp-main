# LARİ Kurucu Pilot Saha Operasyon Kılavuzu (Founder Pilot Rehearsal Checklist)

Bu kılavuz, LARİ kurucusunun sahada veya uzaktan ilk pilot salonla etkileşime geçerken adım adım uygulayacağı pratik saha kontrol listesini, takip planını ve hassas konularda dürüst iletişim şablonlarını içerir.

---

## 1. Saha Operasyonel Adımları Kontrol Listesi

### A. Görüşme/Arama Öncesi (Before Call / Visit)
*   [ ] **Salon Analizi:** Salonun Instagram hesabını ve Google yorumlarını inceleyin. En popüler 5-10 hizmetini ve fiyatlarını not edin.
*   [ ] **Cihaz Kontrolü:** Demo yapacağınız tableti veya bilgisayarı şarj edin. Ekran parlaklığını ayarlayın ve tarayıcı çerezlerini temizleyin.
*   [ ] **Lokal Simülasyon Aktivasyonu:** Cihazda internet hotspot bağlantısını açın ve test edin. LARİ yerel simülasyon sunucusunun çalışır durumda olduğundan emin olun.
*   [ ] **Markalama Teyidi:** Tüm arayüzde markanın net olarak **LARİ** olarak göründüğünü ve Türkiye alan adı stratejisinin (`randevulari.com`) taslak adreslerde doğru yerleştiğini doğrulayın.

### B. Canlı Tanıtım Sırasında (During Demo)
*   [ ] **Müşteri Gözüyle Başlama:** Salon sahibine önce kendi telefonundan `/pilot/customer` rezervasyon sayfasını açtırın. Kendisi için 30 saniyede kurgusal bir randevu almasını isteyin.
*   [ ] **Yönetici Panelini Gösterme:** Randevu alınır alınmaz, yönetici takvim ekranına randevunun nasıl düştüğünü ve uzman personelin takviminin nasıl dolduğunu gösterin.
*   [ ] **Geri Bildirim Toplama:** Her adımda salon sahibinin heyecanlandığı veya kafasının karıştığı noktaları not edin.

### C. Kurulum Aşamasında (During Setup)
*   [ ] **Tenant Provisioning:** `/super-admin/provisioning` sayfasından salon sahibi için anında yeni tenant açın (Örn: `melis-guzellik`).
*   [ ] **Bilgileri Girme:** Salon sahibinin nezaretinde hizmetleri (süre/fiyat), personeli ve çalışma saatlerini panele tanımlayın.
*   [ ] **Görsel Yükleme:** İşletme logosu ve kapak fotoğrafını yükleyin. Görsel güvenlik taramasının (`[REDACTED_BASE64_IMAGE_DATA]`) arka planda sessizce çalıştığından emin olun.
*   [ ] **Kullanıcı Girişi:** Salon sahibinin kendi telefonundan veya bilgisayarından yönetici paneline ilk kez giriş yapmasını sağlayın.

### D. İlk Randevu Testinde (During First Booking Test)
*   [ ] **Gerçekçi Randevu:** Sistemden salon sahibinin kendi numarasıyla ilk test randevusunu oluşturun.
*   [ ] **İletişim Outbox Kontrolü:** Süper Admin panelinden iletişim outbox'ını açarak randevu onay SMS şablonunun oluştuğunu gösterin.
*   [ ] **Self-Servis Linki Testi:** Oluşan onay mesajındaki `randevulari.com/appointment/manage/:token` bağlantısını açtırarak müşterinin kendi randevusunu nasıl iptal edebileceğini veya erteleyebileceğini uygulamalı gösterin.

### E. Demo Sonrasında (After Demo)
*   [ ] **Yedek Alma:** `/admin` panelinden salonun yeni oluşturulan tüm verilerini güvence altına almak için "Verileri Dışarı Aktar" butonuyla JSON yedeği alın.
*   [ ] **Puanlama:** Görüşme biter bitmez araca dönüp `FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md` belgesindeki puanları doldurun.

---

## 2. Zaman Bazlı Takip Planı (Follow-up Schedule)

İlk heyecan geçtikten sonra salonun adaptasyonunu sürdürmek için şu takip takvimi uygulanmalıdır:

### 24 Saat Sonra (24-Hour Follow-up)
*   **İletişim Kanalı:** Telefon Araması veya WhatsApp.
*   **Amaç:** Sisteme girmede veya kullanmada bir problem yaşayıp yaşamadığını kontrol etmek.
*   **Sorulacak Soru:** *"Melis Hanım selamlar, dün kurulumunu yaptığımız randevu panelini inceleme fırsatınız oldu mu? Giriş yaparken veya takvime bakarken bir takılma yaşadınız mı?"*

### 3 Gün Sonra (3-Day Follow-up)
*   **İletişim Kanalı:** WhatsApp ve Sistem İnceleme.
*   **Amaç:** Müşterilerine linki paylaşıp paylaşmadığını sormak, ilk gerçek randevu denemesini teşvik etmek.
*   **Sorulacak Soru:** *"Melis Hanım selamlar, instagram profilinize randevu linkinizi ekleyebildiniz mi? Gelen müşterilerinizden linkle ilgili hiç geri bildirim aldınız mı?"*

### 7 Gün Sonra (7-Day Follow-up)
*   **İletişim Kanalı:** Yüz Yüze Ziyaret (Tercihen).
*   **Amaç:** İlk haftanın genel değerlendirmesi, takvim doluluğu ve sistemdeki no-show/iptal hareketlerinin incelenmesi.
*   **Aksiyon:** `/super-admin/observability` sayfasından salonun tüm haftalık hareket günlüğünü analiz edip ziyaret öncesi hazırlanın.

---

## 3. Veri ve Güvenlik Güvenceleri (Data & Export Safety)

Saha denemelerinde salon sahiplerine verilerinin güvenliği konusunda şu garantileri verin:
*   **Yerel İzolasyon:** *"Verileriniz şu an lokal pilot havuzumuzda tamamen izole şekilde saklanıyor. Başka hiçbir salon veya üçüncü şahıs sizin müşteri listenize veya ciro bilgilerinize erişemez."*
*   **Anında Taşınabilirlik (Lock-in Yok):** *"İstediğiniz zaman panelinizden tek tıkla tüm müşterilerinizi ve randevu geçmişinizi şifreli JSON formatında bilgisayarınıza indirebilirsiniz. Bizde hiçbir veriniz kilitli kalmaz."*
*   **Sıfır Kart Depolama:** *"Sistemimizde kesinlikle müşterilerinizin veya sizin kredi kartı bilgileriniz kaydedilmez ve depolanmaz. Tüm ödeme altyapısı yerel sandbox kuralları çerçevesinde korunur."*

---

## 4. Kırmızı Bayraklar (Red Flags - Tehlike Sinyalleri)

Saha çalışmasında şu durumlarla karşılaşırsanız pilotu durdurmayı veya yavaşlatmayı düşünün:
*   **Sürekli Şifre Unutma / Giriş Zorluğu:** Salon sahibi panele girmekte her gün zorlanıyorsa arayüz karmaşık geliyordur. Eğitim süresini uzatın.
*   **Müşterileri Manuel Deftere Yazmaya Devam Etme:** Salon sahibi randevuları takvime girmeyip hala kağıt ajandada tutuyorsa dijitalleşme direncini henüz kıramamışsınız demektir. Değer önerisini (WhatsApp onay mesajı kolaylığı vb.) tekrar hatırlatın.
*   **Hassas Veri Sızdırma Girişimleri:** Salon sahibinin başkasına ait müşteri verilerini sisteme girmeye çalışması veya KVKK kurallarına aykırı davranması.

---

## 5. Dürüst İletişim Rehberi (What to Say Honestly)

Canlı ortam özellikleri henüz yerelde simüle edilirken, pilot salon sahiplerinin teknik sorularına verilecek dürüst ve güven veren yanıtlar:

| Konu Başlığı | Salon Sahibinin Sorusu | Kurucunun Vereceği Dürüst Cevap |
| :--- | :--- | :--- |
| **Ödeme (Payment)** | *"Müşterilerden online ödeme alabiliyor muyum veya ben size nasıl ödeme yapacağım?"* | *"Şu an pilot aşamasında olduğumuz için sizden hiçbir ücret almıyoruz (14 gün ücretsiz deneme + manuel pilot uzatması). Online ödeme altyapımız (iyzico) teknik olarak tamamen hazır ve test edildi. Canlı yayına geçtiğimizde tek tıkla online ödeme almaya başlayabileceksiniz."* |
| **Alan Adı (Domain)** | *"Sitem randevulari.com/melis-guzellik yerine melisguzellik.com olabilir mi?"* | *"Evet, altyapımız özel alan adlarını tamamen destekliyor. Şu an pilot aşamasında size özel `randevulari.com/melis-guzellik` adresini tanımlıyoruz. Staging testlerimiz bittiğinde kendi özel alan adınızı da sisteme tanımlayabileceksiniz."* |
| **SMS / WhatsApp** | *"Müşteriye gerçekten SMS gidiyor mu?"* | *"Şu an pilot aşamasında sunucu maliyetlerini optimize etmek ve gereksiz mesaj gönderimini engellemek için mesaj gönderimlerini 'Simülasyon' modunda tutuyoruz. Siz outbox panelinizden giden tüm şablonları anlık görebiliyorsunuz. Canlı yayına geçiş onayımızla birlikte tüm SMS ve WhatsApp mesajları müşterilerinizin telefonlarına anında ulaşacak."* |
| **Resim/Medya (Storage)** | *"Buraya salonumun tüm resimlerini yükleyebilir miyim?"* | *"Evet, logolarınız ve kapak resimleriniz için optimize edilmiş bir depolama alanımız var. Sistem güvenliği ve hızı için resimleri yüklerken otomatik sıkıştırıyoruz. Sınırsız galeri özelliğimiz canlı sunucu geçişinde tam kapasite aktif olacaktır."* |
| **Self-Servis Linki** | *"Müşterim randevusunu gerçekten kendi iptal edebilir mi?"* | *"Kesinlikle. Müşteriniz randevu onay linkine tıkladığında sadece kendi randevusunu yönetebileceği güvenli bir sayfa açılır. Oradan iptal veya erteleme talebi gönderdiğinde onay ekranı anında sizin panelinize düşer. Siz onay vermeden takviminiz bozulmaz."* |
| **KVKK ve Gizlilik** | *"Müşteri bilgilerini buraya girerken yasal bir sorun yaşar mıyım?"* | *"LARİ en başından itibaren Türkiye KVKK standartlarına tam uyumlu geliştirildi. Randevu onay ekranlarında müşterilerden onay kutusu alıyoruz. Ayrıca tüm verilerinizi dilediğiniz an dışa aktarıp sistemden kalıcı olarak silebilme hakkına sahipsiniz."* |
| **Pilot Sınırları** | *"Sistemde bir hata çıkarsa ne olacak?"* | *"Tüm platformu yerel testlerden başarıyla geçirdik. Yine de pilot aşamasında olası aksaklıklar için takvim ekranımızda bir acil durum hata koruması aktif. Bir sorun yaşarsanız sistem otomatik olarak bize destek bileti açıyor ve teknik ekibimiz anında müdahale ediyor."* |

---

## 6. İlgili Belgeler
*   [Uçtan Uca Pilot Prova Kılavuzu](./FIRST_REAL_SALON_END_TO_END_REHEARSAL.md)
*   [İlk Pilot Kabul Kriterleri](./FIRST_PILOT_ACCEPTANCE_CRITERIA.md)
*   [Pilot Test Veri Seti Planı](./FIRST_PILOT_FIXTURE_DATA_PLAN.md)
