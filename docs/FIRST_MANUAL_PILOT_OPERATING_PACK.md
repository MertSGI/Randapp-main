# LARİ - İlk Manuel Pilot Müşteri Operasyon Paketi (First Manual Pilot Operating Pack)

Bu rehber, LARİ kurucusunun veya saha operatörünün, ilk gerçek güzellik salonu/güzellik merkezi pilotunu sahada ziyaret ederken veya uzaktan iletişime geçerken izleyeceği pratik operasyonel adımları içerir. Bu aşamada amacımız, kurumsal ve teknik süreçlerin sahada birebir gözlemlenmesi ve sisteme ilk gerçek verilerin girilerek geri bildirim toplanmasıdır.

---

## 1. İlk Pilot İçin İdeal Salon Profili Kimdir?

Saha denemelerinin pürüzsüz geçmesi için ilk pilot salonun şu kriterlere sahip olması önerilir:
*   **Teknolojik Yakınlık**: Rezervasyonları hali hazırda WhatsApp listeleri, Excel veya kişisel ajandalar üzerinden yöneten ancak dijitalleşmeye istekli, genç/dinamik bir salona sahip işletme sahibi.
*   **İlişki Seviyesi**: Kurucu ekiple doğrudan iletişime ve samimi geri bildirime açık olan, tanıdık veya referanslı işletmeler.
*   **Hizmet ve Personel Sayısı**: Yönetimi kolaylaştırmak adına **1-3 personel** ve **yüksek sürüm içeren 5-10 ana hizmet** sunan bir salon yapısı.
*   **Tek Şube Tercihi**: İlk deneyimde karmaşıklığı azaltmak için ilk olarak tek şubeli işletmeler seçilmelidir.

---

## 2. İlk Pilot İçin Uygun Olmayan Salon Profili Kimdir?

Aşağıdaki özelliklere sahip işletmeler ilk saha aşamasında elenmelidir:
*   **Çok Şubeli Kompleks Yapılar**: Personel geçişleri, ortak envanterler ve yoğun şube trafiği ilk aşamada operasyonu zorlaştırabilir.
*   **Aşırı Yoğun ve Dijital Karşıtı Ekipler**: Teknolojiye kesin olarak karşı duran, sahada anlatıma vakit ayıramayacak kadar kontrolsüz yoğunluğa sahip işletmeler.
*   **Karmaşık Tıbbi Operasyonlar Sunan Medikal Klinikler**: KVKK süreçleri, özel hekim onayları ve entegrasyon zorlukları barındıran klinik ortamları.

---

## 3. Ziyaret / Görüşme Öncesi Hazırlık Listesi

Saha ziyaretine gitmeden önce mutlaka şunları hazırlayın:
1.  **Demo Cihazı**: Tercihen salon sahibine sistemi gösterebileceğiniz temiz, şık tasarımlı bir tablet veya dizüstü bilgisayar.
2.  **Örnek Hizmet ve Fiyat Çalışması**: Salonun Instagram profiline bakarak en popüler 5-6 hizmetini, sürelerini ve fiyatlarını önceden çıkarın.
3.  **Hizmet Katalog Şablonu**: Hızlıca ekleyebileceğimiz salon logosu ve profil fotoğrafı taslakları.
4.  **İnternet Bağlantısı**: Sahada kesintisiz erişim sağlamak için kişisel hotspot/erişim noktası bağlantınızın aktif olması.

---

## 4. Saha Canlı Demo Akışı

Salon sahibiyle bir araya geldiğinizde izleyeceğiniz akış:
1.  **Müşteri Gözünden Başlama**: Önce `/pilot/customer` veya önceden hazırlanmış bir rezervasyon linki üzerinden, müşterinin sade bir arayüzle nasıl 30 saniyede randevu aldığını telefondan gösterin.
2.  **Yönetici Panelinin Gücü**: Rezervasyon bittiği anda, telefonunuza düşen yönetici paneli bildirimini ve takvime otomatik yerleşen kaydı gösterin.
3.  **Kolaylık Vurgusu**: "Hizmetler", "Personel Çalışma Saatleri" ve "Müşteri Kayıtları" ekranlarında düzenleme yapmanın ne kadar hızlı olduğunu canlı olarak gösterin.
4.  **Mini Web Sitesi Gösterimi**: Kendilerine özel tanımlanacak olan `salonadi.randevulari.com` web sitesinin ve profilin Google ve Instagram uyumlu yapısını gösterin.

---

## 5. Manuel Kayıt ve Tahsis Süreci

İşletme sahibi onay verdiğinde:
1.  Sistemimizin `/admin/super-admin` panelini açın.
2.  **Manuel Kayıt (Manual Provisioning)** butonuna tıklayarak işletme detaylarını girin.
3.  İşletmeye en uygun planı (örneğin Kurumsal veya Premium seviyesini) seçin.
4.  Ödeme yöntemi olarak kurumsal stratejimize uygun şekilde **Banka Havalesi / Pilot Kampanyası** seçerek üyeliği başlatın.
5.  Oluşan özel kullanıcı bilgilerini salon sahibine teslim edin.

---

## 6. Sınırlar Hakkında Dürüst Bilgilendirme

Pilot salona platformumuzun güncel durumu hakkında dürüst açıklamalar yapın:
*   **Subdomain ve Web Linki**: Kendilerine özel subdomain'lerinin (`[salon-slug].randevulari.com`) hazırlandığını ancak alan adı sunucularının tescil onay işlemlerinin bu ön izleme aşamasında lokal bir kopyada çalıştığını belirtin. Bir sonraki teknik kesintide genel yayın linklerinin internete açılacağını söyleyin.
*   **Ödeme Sistemleri**: Online kartlı ödeme altyapımızın (Iyzico ortaklığı) teknik entegrasyonunun tamamlandığını ve önümüzdeki dönemde aktif edilerek kartla tahsilatın salon adına sistem üzerinden başlatılacağını paylaşın.
*   **WhatsApp / SMS Gönderimleri**: İletişim outbox modelimizin şu an aktif çalıştığını, bu ön aşamada salon sahibinin gelen onayları yönetim panelindeki Outbox ekranından görsel olarak kontrol edebileceğini, bir sonraki aşamada ise operatör entegrasyonlarının devreye girerek müşteriye doğrudan SMS/Push bildirim olarak iletileceğini anlatın.

---

## 7. Salondan Toplanacak Zorunlu Bilgiler

Pilot katılım formunu doldurması için salondan şu detayları alın:
*   **İşletme Künyesi**: Resmi Adı, Sahibi, e-Postası, Telefonu, Instagram Adresi.
*   **Hizmet Detayları**: Hizmet Adları, Süreleri, Ücretleri, Hangi personellerin bu hizmeti verebileceği.
*   **Personel Bilgileri**: Personel Adları ve haftalık çalışma saatleri/izin günleri.
*   **Slug Tercihi**: Kullanmak istedikleri internet adresi uzantısı (örneğin `luna-guzellik`).

---

## 8. Kurulum Sırasında Yapılacak Yapılandırmalar

Salon için sistemi ayağa kaldırırken şu adımları takip edin:
*   Profil bilgilerini ve çalışma saatlerini sisteme tanımlayın.
*   Tüm personel ve hizmet eşleşmelerini gerçekleştirin.
*   Randevu sürelerinin ve çakışma kurallarının doğruluğunu onaylayın.
*   Özgün marka rengi ve tanıtım metnini sisteme girin.

---

## 9. Salondan Ayrılmadan Önce Yapılacak Testler

Kurulumu bitirdikten sonra salondan ayrılmadan önce şu 4 testi mutlaka çalıştırın:
1.  **Web Rezervasyon Testi**: Müşteri arayüzünden yeni bir randevu oluşturun ve takvime anında yansıdığını doğrulayın.
2.  **Outbox Bildirim Doğrulaması**: Yönetim panelindeki outbox ekranına düşen şablonun salon adı, müşteri adı ve hizmet adı detaylarını doğru içerdiğini teyit edin.
3.  **Çakışma Kontrolü**: Dolu olan bir saate başka bir müşteri randevusu alınamadığını doğrulayın.
4.  **Profil Düzenleme**: Salon sahibinin kendi telefonundan panele girerek bir personel saatini değiştirebildiğini gözleri önünde deneyin.

---

## 10. Geri Bildirim ve Takip Süreci

Pilot sürecini dinamik takip etmek için üç aşamalı kontrol uygulayın:
*   **24 Saat Sonra Telefon Araması**: "Dün kurduğumuz sistem size ve çalışanlarınıza nasıl geldi? Takvimi inceleme fırsatınız oldu mu?" sorusuyla ilk izlenimi alın.
*   **3 Gün Sonra Saha Ziyareti**: Salonu kahve içmeye ziyaret edin. Ekranı nasıl kullandıklarını uzaktan izleyin; yaşadıkları küçük zorlukları ve takıldıkları butonları not alın.
*   **7 Gün Sonra Değerlendirme**: Haftalık randevu sayılarını inceleyin. Sisteme geçiş kolaylığını, müşterilerinden aldıkları geri bildirimleri puanlayarak kayıt altına alın.
