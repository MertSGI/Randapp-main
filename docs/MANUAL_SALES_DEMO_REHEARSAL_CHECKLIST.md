# LARİ Manuel Satış Demosu Rehearsal Checklist

Bu doküman, bir salon sahibine LARİ'yi canlı tanıtırken sunucunun hatasız, profesyonel ve etkileyici bir deneyim yaşatmasını sağlamak amacıyla hazırlanmıştır. Demoya başlamadan önce bu checklistteki adımları sırasıyla uygulayın.

---

## 1. Demo Öncesi Teknik Kontroller (Pre-Demo Technical Check)

- [ ] **Uygulamayı Derleyin:** Terminalde `npm run build` komutunun sorunsuz tamamlandığından emin olun.
- [ ] **QA Testlerini Çalıştırın:** `npm run qa:all` komutunu çalıştırarak tüm sistem ve veri bütünlüğü testlerinin yeşil yandığını teyit edin.
- [ ] **Rotaları Doğrulayın:**
  - `/pilot` sayfasının hatasız yüklendiğini doğrulayın.
  - `/pilot/customer` rotasının Lumina Güzellik salonunun rezervasyon sayfasını getirdiğini doğrulayın. (Herhangi bir aktif sahibi oturumu olmaksızın çalışmalıdır).
  - `/pilot/admin` rotasının salt okunur denetleme panelini (Lumina Güzellik verileriyle) yüklediğini doğrulayın.
  - `/demo` kurgusal önizleme sayfasının çalıştığını doğrulayın.
  - `/pricing` fiyatlandırma sayfasını kontrol edin.
  - `/register` yeni üye kayıt sayfasını kontrol edin.
- [ ] **Mobil Cihaz / Görünüm Uyumu:** Mobil arayüz performansını sunum yapacağınız cihazda (veya tarayıcı geliştirici konsolundaki mobil emülatörde) test edin. Alt kısımdaki yapışkan (sticky) "Rezervasyon Al" butonunun sorunsuz göründüğünü teyit edin.
- [ ] **Tarayıcı Temizliği:** Tarayıcınızda demo verilerinizi bozmayacak şekilde, ilgisiz diğer sekmeleri kapatın ve eğer gerekiyorsa temiz bir gizli sekme açın.

---

## 2. Sunum Cihazı ve Tarayıcı Hazırlığı

- [ ] **Tarayıcı:** Tercihen masaüstü Chrome, Safari veya en son sürüm bir mobil tarayıcı kullanın.
- [ ] **İnternet Bağlantısı:** Kesintisiz ve stabil bir internet bağlantınız olduğundan emin olun.
- [ ] **Ekran Parlaklığı ve Bildirimler:** Sunum yapacağınız ekranın parlaklığını optimize edin; tüm kişisel bildirimleri, mesajlaşma uygulamalarını ve pop-up'ları sessize alın.
- [ ] **Sadelik:** Tarayıcı geliştirici araçları (Chrome DevTools) ve teknik dökümanlar müşteri görüşmesi esnasında kesinlikle kapalı olmalıdır. Sadece müşteri arayüzü açık görünmelidir.

---

## 3. Önerilen Demo Akışı (Recommended Route Order)

Sunumu her zaman şu sıra ile gerçekleştirin:

1. **Giriş (Marketing Homepage):** Değer önerisi ve dijital dönüşüm ihtiyacı.
2. **Tanıtım Giriş Sayfası (`/pilot`):** "İşletmenizin her iki yüzünü de şimdi canlı deneyimleyelim" geçişi.
3. **Müşteri Rezervasyon Ekranı (`/pilot/customer`):** Lumina salonu üzerinden müşteri gözüyle randevu oluşturma.
4. **Yapay Zeka Destekli Randevu:** AI Style Assistant'ın kullanımı ve sihirli öneriler.
5. **Onaylama ve Özet Ekranı:** Anında onay bildirimi ve SMS/WhatsApp şablonları görünümü.
6. **Yönetici Paneli (`/pilot/admin`):** Salon sahibinin paneli. Randevular, müşteri veri tabanı (CRM, KVKK onayları ve notlar), finansal ciro raporları ve kanal analizleri.
7. **Kampanyalar ve Paylaşım Araçları:** Tavsiye ve arkadaşını getir kampanyalarının ciroya etkisi.
8. **Kendi İşletmeni Yarat (`/demo`):** Müşterinin kendi salon adını yazıp sonucu simüle etmesi.
9. **Kayıt ve Üyelik (`/pricing` & `/register`):** 14 günlük kredi kartı gerektiren deneme süresi ve gerçek onboarding geçişi.

---

## 4. Konuşma Notları (What to Say on Each Route)

### Giriş Sayfası (Homepage)
> *"Merhaba, bugün size salonunuzun tüm yönetimini tek bir noktaya toplayan, müşterilerinize 7/24 rezervasyon imkanı sunan ve yapay zeka ile işinizi büyüten yeni nesil asistanınız LARİ'yi tanıtacağım. LARİ, telefon trafiğinizi sıfıra indirirken gelirinizi artırmak için tasarlandı."*

### Tanıtım Sayfası (`/pilot`)
> *"Şimdi örnek bir salon olan Lumina Güzellik & Kuaför üzerinden sistemin hem müşterilerinize sunduğu kolaylığı, hem de sizin arkanızda çalışan devasa yönetim panelini yan yana inceleyelim."*

### Müşteri Rezervasyon Sayfası (`/pilot/customer`)
> *"Müşteriniz Instagram biyografinizden veya WhatsApp'tan linke tıkladığında bu harika, tamamen şık ve mobil uyumlu sayfayla karşılaşıyor. Markanıza özel renkler ve görsellerle süslü bu alanda hizmetleri, çalışanlarınızı inceleyip doğrudan saate karar verebiliyorlar."*

### Yapay Zeka Görsel Asistanı
> *"Tereddüt yaşayan müşterileriniz için sayfamızda bulunan Yapay Zeka Görsel Asistanı devreye giriyor. Müşteriniz istediği stili yazıyor ve yapay zeka ona en uygun hizmetlerimizi analiz edip sepetine ekletiyor. Bu sayede müşteriye karar vermede rehberlik ediyoruz."*

### Rezervasyon Tamamlama Sayfası
> *"Randevu tamamlandığında müşteri bilgilerini KVKK ve pazarlama onay kutularıyla güvenle alıyoruz. Rezervasyon bittiğinde sistem müşteriye rezervasyon özetini sunuyor; anında hazır şablonlarla WhatsApp veya SMS ile paylaşma kolaylığı sağlıyor."*

### Yönetim Paneli (`/pilot/admin`)
> *"Şimdi işin mutfağına, yani yönetici paneline geçelim. Burada bugün kaç randevunuz olduğunu, iptal durumlarını ve hangi uzmanınızın ne kadar yoğun olduğunu canlı grafiklerle görebiliyorsunuz. Müşteri Hafızası (CRM) kısmında her müşterinizin kişisel tercihlerini, alerjilerini, kahve alışkanlıklarını kaydedebilir; KVKK izinlerini takip edebilirsiniz. Raporlar kısmında ise Instagram, WhatsApp veya Google Maps'ten gelen rezervasyonların ciroya oranını tek tıkla görebilirsiniz."*

### Kendi İşletmeni Önizle (`/demo`)
> *"LARİ'nin sizin salonunuzda nasıl duracağını merak ediyorsanız, hemen adınızı yazıp kurgusal bir rezervasyon sayfasını saniyeler içinde simüle edelim. Beğendiğiniz takdirde doğrudan sistem kurulumuna geçebiliriz."*

### Ücretsiz Deneme Başlangıcı (`/pricing` & `/register`)
> *"14 günlük tam özellikli deneme sürümümüzle başlayabilirsiniz. Kurulum sürecinde kredi kartı onayı alınır, ancak 14 gün boyunca hiçbir ücret tahsil edilmez. Memnun kalırsanız üyeliğiniz kesintisiz devam eder."*

---

## 5. Kesinlikle Söylenmeyecek Sözler (What NOT to Say)

Sunum sırasında profesyonelliği korumak için aşağıdaki ifadelerden kaçının:

- ❌ *"Her şey canlı ödeme altyapısıyla çalışıyor ve kartınızdan şu an para çekiyoruz."* (Henüz canlı entegrasyon aktif edilmemiştir, korumalı sandbox modundadır).
- ❌ *"Sistem müşteri kaydolduğu an otomatik WhatsApp gönderiyor."* (Şablon hazır, paylaşım aracı manuel tetiklenmektedir veya entegrasyon aşamasındadır).
- ❌ *"Kendi özel alan adınız (domain) hemen bir saniyede aktif olur."* (DNS yönlendirmesi gerektiği ve arka planda manuel onay süreci olduğu dürüstçe belirtilmelidir).
- ❌ *"Kart bilgisi vermeden de 14 gün deneyebilirsiniz."* (LARİ, 14 günlük trial için kesinlikle kredi kartı aktivasyon şartını aramaktadır).
- ❌ *"7 günlük ücretsiz denememiz var."* (Deneme süresi standart olarak 14 gündür).
- ❌ *"Bunlar gerçek müşterilerin gizli kart bilgileri."* (Tümüyle kurumsal kurgusal test verileridir).

---

## 6. Demo Esnasında Tıklanacak Butonlar

- [ ] `/pilot` sayfasında yer alan **"Müşteri Deneyimini İncele"** butonu.
- [ ] `/pilot/customer` tıklandığında sol taraftaki **"Randevu Al"** butonu ve akabindeki adımlar.
- [ ] Rezervasyon onay adımında yer alan örnek paylaşımlar.
- [ ] `/pilot` sayfasında yer alan **"İşletme Panelini İncele"** butonu.
- [ ] `/pilot/admin` yönetiminde soldaki menü sekmeleri (Genel Bakış, Randevular, Müşteriler, Hizmetler, Paylaşım Araçları, Raporlar).
- [ ] `/pilot/admin` sayfasında sağ üstte duran **"Kendi İşletmeni Önizle"** butonu.

---

## 7. Demo Sırasında Kesinlikle Uzak Durulması Gereken Butonlar

- [ ] `/admin` gerçek yönetici rotası (Müşterinin önünde yetkilendirme hatası almamak için).
- [ ] Süper Yönetici (`/super-admin/*`) yönetim arayüzleri.
- [ ] Geliştirme aşamasındaki veya şirket içi dökümantasyon içeren sayfalar.
- [ ] Gerçek ödeme yapıp paket satın almaya çalışmak (Handoff linki haricindeki ödeme akışları).

---

## 8. Hata ve Kriz Yönetimi Senaryosu (Demo Recovery Plan)

Eğer sunum sırasında beklenmeyen bir hata, sayfa donması veya internet yavaşlığı yaşarsanız:

1. **Sayfayı Yenileyin (F5):** LARİ verileri yerel hafızada (localStorage) yüksek kurtarma yeteneği ile (instant recovery) saklanmaktadır. Yenileme sonrasında veriler kaybolmaz.
2. **Tanıtım Sayfasına Dönün:** Doğrudan `/pilot` anasayfasına gidip "Müşteri Deneyimi" veya "İşletme Paneli" seçimiyle akışı sıfırlayın.
3. **Direkt Linkleri Kullanın:** Panelin donması durumunda direkt `/pilot/customer` veya `/pilot/admin` linklerini elinizle adrese girerek ilgili ekranı açın.
4. **DevTools'u Açmayın:** Müşterinin yanında konsolu açıp kod incelemeyin, sakin kalarak sistemi statik dökümanlar veya kurgusal anlatımla aktarın.
