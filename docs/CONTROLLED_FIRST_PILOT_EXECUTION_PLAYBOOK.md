# LARİ Birinci Pilot Kontrollü Saha Uygulama El Kitabı (Controlled First Pilot Execution Playbook)

Bu kılavuz, LARİ platformunun ilk gerçek güzellik salonu pilot testini sıfır hata ve maksimum veri odaklılıkla yürütmek üzere kurucu ortaklar için hazırlanmış pratik bir saha uygulama el kitabıdır.

---

## 1. Pilot Salon Profil Kriterleri

### İdeal İlk Pilot Profili (Kimi Seçmeliyiz?)
*   **Salon Tipi:** Butik güzellik salonu, tırnak/manikür stüdyosu veya 2-4 çalışanlı butik bir kadın/erkek kuaförü.
*   **Teknoloji Yatkınlığı:** Salon sahibi veya yöneticisi akıllı telefon kullanmaya alışkın, Instagram DM üzerinden randevu yöneten, teknolojiye sıcak bakan genç/orta yaş profil.
*   **İlişki Seviyesi:** Kurucuların doğrudan tanıdığı, dürüst geri bildirim verebilecek, sistemdeki ufak tefek aksaklıkları olgunlukla karşılayacak dost bir salon.
*   **Randevu Hacmi:** Günlük ortalama 5 ila 20 randevu alan, manuel defter veya Excel kullanan bir salon.

### Kaçınılması Gereken Profiller (Kimi Seçmemeliyiz?)
*   ❌ **Çok Şubeli Büyük Zincirler:** İlk aşamada karmaşık operasyonel yetki süreçleri ve yüksek randevu trafiği sistemi ve kurucuları aşırı yorabilir.
*   ❌ **Teknolojiden Tamamen Uzak Salonlar:** Akıllı telefon veya bilgisayar kullanmakta zorlanan sahipler, üründen bağımsız olarak onboarding sürecini tıkayacaktır.
*   ❌ **Sıkı Ticari Entegrasyon İsteyenler:** "Anında yazar kasa postuma bağlansın", "Gelir İdaresi Başkanlığı'na otomatik fatura atsın" gibi canlı mali entegrasyonlar talep eden büyük ticari işletmeler.

---

## 2. İlk Temas ve Kalifikasyon (Outreach & Qualification)

### İletişim Kanalları
1.  **Sıcak Çevre / WhatsApp:** Doğrudan tanıdığınız salon sahiplerine kurucu dilinde samimi bir teklif.
2.  **Instagram DM:** Salonun aktif paylaşımlarına ve hikayelerine yanıt vererek, "Instagram randevularını düzene sokma" odağıyla yaklaşım.
3.  **Yüz Yüze Ziyaret (Saha):** Yakındaki butik salonlara bizzat kahve içmeye giderek fikir alma bahnesiyle başlayan diyalog.

### Kalifikasyon Soruları
Aday salonun ilk pilota uygunluğunu ölçmek için şu 4 kritik soru sorulmalıdır:
1.  *Şu an randevularınızı nasıl takip ediyorsunuz? Defter mi kullanıyorsunuz, yoksa telefon rehberi ve WhatsApp karışık mı gidiyor?*
2.  *Günde ortalama kaç müşteri randevusu oluşturuyorsunuz? Günün hangi saatleri en yoğun geçiyor?*
3.  *Müşterileriniz size en çok hangi kanallardan ulaşıyor? Instagram DM mi, telefon araması mı yoksa WhatsApp mı?*
4.  *Instagram profilinize şık bir "24 Saat Randevu Al" linki koyarak müşterilerinizin boş saatleri görüp randevu oluşturmasını ister misiniz?*

---

## 3. Demo ve Kurulum Akışı (Demo & Setup Flow)

### Birebir Demo Görüşmesi
*   **Yer:** Mümkünse salonun sakin olduğu bir saatte yüz yüze, değilse akşam saatlerinde görüntülü arama ile.
*   **Süre:** Maksimum 15-20 dakika.
*   **Akış:**
    1.  Telefon üzerinden `/pilot/customer` rotasını açarak salon sahibine bir müşterinin 30 saniyede nasıl randevu alabileceğini gösterin.
    2.  Ardından `/pilot/admin` veya `/admin` paneline geçerek randevunun takvime nasıl düştüğünü, çalışanların doluluk durumunu gösterin.
    3.  Abonelik ve online ödeme kısımlarına girmeden, sadece operasyonel verimliliği vurgulayın.

### Kontrollü Kurulum (Setup) Adımları
Salon onay verdiğinde kurulumu bizzat siz (Kurucu) yapın:
1.  Süper Admin panelinden `/super-admin/provisioning` sayfasına gidin.
2.  Salonun bilgilerine göre (Örn: `Melis Güzellik Stüdyosu`) yeni bir kiracı (`melis-guzellik`) oluşturun.
3.  Salonun sunduğu en popüler 3 hizmeti (Fiyat ve süreleriyle) sisteme ekleyin.
4.  Salon bünyesindeki çalışanları (Uzmanlık alanları ile) tanımlayın.
5.  Çalışma saatlerini salonun gerçek mesai saatlerine göre ayarlayın.
6.  Sistem tarafından oluşturulan `/booking/melis-guzellik` randevu linkini test edin.

---

## 4. Duman ve Test Rezervasyonları (Smoke Testing)

Salon sahibi sistemi kullanmaya başlamadan önce, yanındayken şu uçtan uca testleri elinizle gerçekleştirin:

1.  **İlk Randevu Testi:** Kendi telefonunuzdan müşteri gibi girip, `/booking/melis-guzellik` üzerinden bir randevu oluşturun.
    *   *Kontrol:* Randevu oluşturma ekranında KVKK Aydınlatma Metni checkbox'ının zorunlu olduğunu doğrulayın.
2.  **Yönetici Takvimi Kontrolü:** Salon sahibinin cep telefonundan veya tabletinden `/admin` paneline girip Randevular sekmesini açın.
    *   *Kontrol:* Az önce oluşturduğunuz test randevusunun takvimde doğru çalışanda ve saatte göründüğünden emin olun.
3.  **Outbox Bildirim Kontrolü:** Süper Admin paneline girerek `/super-admin/scheduler` sayfasını açın ve "Zamanlayıcıyı Çalıştır" butonuna basın.
    *   *Kontrol:* Müşteri bildirim kaydının "Outbox" (Giden Kutusu) tablosuna başarıyla düştüğünü ve statüsünün güncellendiğini doğrulayın (Gerçek SMS gitmez, simüle edilir).
4.  **Müşteri Self-Servis İptal Testi:** Kendi telefonunuza düşen simüle linke tıklayarak randevu yönetim portalını (`/appointment/manage/:token`) açın.
    *   *Kontrol:* "Randevumu İptal Etmek İstiyorum" butonuna basarak iptal işlemini tamamlayın ve salon yöneticisi panelinde bu randevunun "İptal Edildi" statüsüne geçtiğini bizzat görün.

---

## 5. İlk 7 Günlük İzleme ve Takip (First 7-Day Monitoring)

Pilotun başarısı ve kararlılığı için ilk 7 gün boyunca çok sıkı bir izleme takvimi uygulanmalıdır:

### İlk 24 Saat: "Sıcak Destek"
*   **Aksiyon:** Kurucu günde 2 kez (öğle ve akşam) salon yöneticisini arar veya ziyaret eder.
*   **Kontrol:** Sistemde herhangi bir hata aldılar mı? Randevu oluştururken zorlanan bir müşteri oldu mu? Takvim ekranı düzgün yükleniyor mu?
*   **Süper Admin Takibi:** `/super-admin/observability` sayfasından salonun loglarını filtreleyerek yetkisiz erişim denemesi (unauthorized) veya sayfa yüklenme hatası (white screen) olup olmadığını denetleyin.

### 3. Gün: "Alışkanlık Kontrolü"
*   **Aksiyon:** Instagram profil linkinin bizzat eklenip eklenmediği kontrol edilir. Defter yerine takvimin düzenli kullanılıp kullanılmadığı denetlenir.
*   **Müşteri Deneyimi:** Salon sahibine, randevu alan gerçek müşterilerden nasıl yorumlar aldıklarını sorun. "Kullanımı kolay mıydı?", "Sms onayı simülasyonunu beğendiler mi?" sorularını yöneltin.

### 7. Gün: "Haftalık Değerlendirme & Dönüşüm Kararı"
*   **Aksiyon:** Birebir yüz yüze kapanış görüşmesi yapılır.
*   **Değerlendirme:**
    *   Haftalık oluşturulan toplam randevu sayısı.
    *   Sistem kullanımında karşılaşılan tüm kullanıcı deneyimi (UX) engelleri ve bug listesi.
    *   **Go/No-Go Kararı:** Salonun sistemi kullanmaya devam edip etmeyeceği, ücretsiz pilotun uzatılıp uzatılmayacağı veya yasal/şirketleşme şartları tamamlandığında ücretli pakete geçmeye hazır olup olmadıkları netleştirilir.

---

## 6. Sınırları Dürüstçe Açıklama (Honest Transparency Guide)

Müşteri güvenini sarsmamak için, pre-live aşamasındaki teknik sınırlılıkları salon sahibine dürüstçe açıklayın:

*   **SMS/WhatsApp Durumu:** *"Sistem şu an kapalı pilot aşamasındadır. Randevu onay bildirimleri ve hatırlatıcılar yasal mevzuat uyumluluğu gereği arka planda giden kutusunda birikmekte ve simüle edilmektedir. Ticari açılışımızdan hemen sonra gerçek SMS gönderimleri aktif olacaktır."*
*   **Kredi Kartı / Ödeme Durumu:** *"Online ödeme ve kredi kartı altyapımız, şirket kuruluş işlemleri ve BDDK onaylı sanal POS başvurularımızın ardından aktifleşecektir. Şu an tüm aboneliklerimizi elden veya banka havalesi ile manuel olarak aktifleştiriyoruz."*
*   **Özel Alan Adı (Custom Domain):** *"Salonunuza özel `salonadi.randevulari.com` uzantılı web siteniz pre-live sistemimizde hemen aktifleşir. Kendi aldığınız `.com` alan adını bağlamak için sunucu yönlendirmelerimizi lansman sonrasında devreye alacağız."*

---

## 7. Operasyonel Denetim Listeleri (Operational Checklists)

### Kurucu Günlük Rutin Kontrol Listesi
*   [ ] Süper Admin `/super-admin/pilots` paneline girerek pilot salonların güncel durumlarını (setup_completed, booking_created vb.) kontrol et.
*   [ ] `/super-admin/observability` loglarında kırmızı (Hata/Error) kayıt olup olmadığını tara.
*   [ ] Bekleyen destek biletlerini ve müşteri KVKK silme taleplerini cevaplandır.
*   [ ] Pilot salona gün içinde telefon açarak "Bugün bir sıkıntı var mı?" sorusuyla sıcak desteğini hissettir.

### Salon Sahibi Onboarding Kontrol Listesi
*   [ ] `/register` sayfası üzerinden Kullanım Şartları ve Gizlilik sözleşmelerini işaretleterek kaydı tamamla.
*   [ ] Çalışanların çalışma ve mola saatlerini gir.
*   [ ] Popüler en az 3 hizmeti fiyat ve süreleriyle ekle.
*   [ ] Randevu sayfasının linkini salon yöneticisinin telefonuna kısayol olarak ekle.
*   [ ] Salonun Instagram biyografisine `randevulari.com/salon-adi` linkini eklet.
