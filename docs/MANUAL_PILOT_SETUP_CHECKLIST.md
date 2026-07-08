# LARİ - Manuel Pilot Kurulum Kontrol Listesi (Manual Pilot Setup Checklist)

Bu kontrol listesi, sisteme yeni dahil edilen gerçek bir salonun kurulum, yapılandırma ve test süreçlerini hatasız tamamlamak için adım adım takip edilecek rehberdir.

---

## Kurulum ve Yapılandırma Adımları

- [ ] **1. Süper Admin Panelinden İşletmeyi Oluşturun**
  *   `/admin/super-admin` panelini açın.
  *   "Manuel Kayıt ve Kurulum" sayfasına giderek yeni salon için `Yeni Kayıt Başlat` butonuna basın.

- [ ] **2. Üyelik Planını Atayın**
  *   Salonun büyüklüğüne ve mutabık kalınan özelliklere göre (Başlangıç, Profesyonel, Kurumsal) bir plan seçin.

- [ ] **3. Faturalandırma Türünü Belirleyin**
  *   Ödeme kaynağı (billing source) olarak aşağıdaki seçeneklerden birini işaretleyin:
      *   `offline_payment` (Banka transferi taahhütlü kurulumları için)
      *   `complimentary` (İkram üyelik)
      *   `pilot_exception` (Pilot kampanya istisnası)

- [ ] **4. Üyelik Durumunu Güncelleyin**
  *   Aktif üyelik durumunu `manual_active` veya `comped` (ikram) olarak seçip kaydedin.

- [ ] **5. Özel Slug Kodunu Rezerve Edin**
  *   Salonun talebine uygun, benzersiz arama uzantısını (slug) belirleyin (örn: `luna-guzellik`). Bu slug'ın rezerve edildiğini ve başka salon tarafından alınamayacağını doğrulayın.

- [ ] **6. İşletme Profil Bilgilerini Girin**
  *   İşletme logolarını, arka plan rengini, açıklama yazılarını ve iletişim bilgilerini profil ayarlarından tanımlayın.

- [ ] **7. Hizmetleri Ekleyin**
  *   Hizmet katalog sayfasına giderek her bir işlem adını (örneğin Saç Tasarım, Manikür, Protez Tırnak), işlem sürelerini ve fiyat listelerini girin.

- [ ] **8. Personelleri Tanımlayın**
  *   Uzman ekibin adlarını ekleyerek her birinin hangi işlemlerden sorumlu olduğunu (hizmet yetkinlik matrisini) kaydedin.

- [ ] **9. Çalışma Saatlerini Girin**
  *   Salona ait açılış/kapanış saatlerini, öğle aralarını ve her bir uzmana ait izin günlerini takvime işleyin.

- [ ] **10. Gerekliyse Şube Bilgisini Düzenleyin (Kurumsal Plan)**
  *   Salon Kurumsal paket kullanıyorsa, şubelerin adreslerini, iletişim bilgilerini ve çalışan atamalarını organize edin.

- [ ] **11. Ön İzleme (Preview) Ekranını Doğrulayın**
  *   Müşteri paneline girmeden önce, admin panelinde yer alan "Ön İzleme" butonuna basarak kart tasarımlarının ve renk düzeninin şıklığını test edin.

- [ ] **12. Genel Erişim Adresini (Public URL) İnceleyin**
  *   Sistem tarafından oluşturulan `randevulari.com/rezervasyon/[slug]` adresinin doğruluğunu ve linkin erişilebilir duruşunu teyit edin.

- [ ] **13. Rezervasyon Akışını Baştan Sona Deneyin**
  *   Genel rezervasyon linkini kullanarak bir uzman ve bir saat seçip test randevusu oluşturun. Adımların kolay ilerlediğini görün.

- [ ] **14. Yönetim Panelinde Randevuyu Doğrulayın**
  *   Salonun admin sayfasına geri dönün. "Takvim" ve "Randevular" sayfalarına test randevusunun anında düşüp düşmediğini kontrol edin.

- [ ] **15. Fatura ve Üyelik Sekmesini (BillingTab) Teyit Edin**
  *   Salonun profilindeki Billing sekmesine giderek plan bilgilerinin, seçilen pilot muafiyet günlerinin ve yaklaşan yenileme tarihlerinin sistemde doğru kurgulandığını onaylayın.

- [ ] **16. Outbox İletişim Kayıtlarını İnceleyin**
  *   `Outbox / İletişim Kayıtları` panelini sıfırlayarak, test boyunca üretilen rezervasyon oluşturma şablonlarının ve sistem uyarılarının doğru dille kuyruğa düştüğünü teyit edin.

- [ ] **17. İlk Veri Kopyasını (Snapshot) Dışa Aktarın**
  *   Veri koruma ve yedekleme rutinimiz kapsamında, kurulumu sıfırdan tamamlanmış salon veritabanının JSON yedeğini "Yönetici Panelinden" dışa aktararak arşive kaydedin.

- [ ] **18. Pilot Kurulum Notlarını Kaydedin**
  *   İşletmeye ait özel destek taleplerini, saha kurulum sırasındaki gözlemleri ve pilot anlaşma şartlarını Super Admin notları alanına ekleyin.

- [ ] **19. Takip Randevusunu Takvimlendirin**
  *   Kurulumdan 24 saat sonra, 3 gün sonra ve 1 hafta sonra yapılacak geri bildirim aramalarını kişisel takviminize birer iş planı olarak kaydedin.
