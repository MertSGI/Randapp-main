# LARİ Manuel Pilot Ticari Operasyon Kontrol Listesi (Manual Pilot Commercial Operations Checklist)

Bu döküman, LARİ platformunda gerçekleştirilen ücretsiz ve ücretli pilot uygulamaların mali, yasal ve operasyonel adımlarını içeren, kuruculara özel ticari kontrol listesidir.

---

## ⚠️ Kritik Mali ve Hukuki Sorumluluk Uyarısı (Disclaimer)
Bu kontrol listesindeki yönlendirmeler operasyonel birer rehber niteliğindedir ve **asla resmi mali/hukuki tavsiye yerine geçmez**. Gerçek para tahsil etmeye başlamadan önce, yetkili bir **Mali Müşavir (CPA)** ve **Hukuk Danışmanı** ile görüşülmeli, vergi levhası tescili yaptırılmalı ve resmi fatura süreçleri tasarlanmalıdır.

---

## 1. Ücretsiz Pilot Kontrol Listesi (Unpaid Pilot Checklist)
Sistemin ticari bir taahhüt olmadan, dost bir salonda ücretsiz denetimi için gereken adımlar:

*   [ ] **Açık İletişim:** Salon sahibine bunun bir "Pre-live test ve geliştirme sürümü" olduğu açıkça iletildi mi?
*   [ ] **Yazılı Mutabakat:** Salon sahibinin sistemi denerken gerçek kişisel veriler (isim, telefon vb.) kaydedeceğini bildiğine ve rıza loglarının yerel Değiştirilemez Rıza Defteri'nde saklanacağına dair basit bir "Pilot Deneme Protokolü" imzalandı mı?
*   [ ] **Ücretsiz Aktivasyon:** Süper Admin panelinden kiracı kurulurken, abonelik türü ücretsiz veya deneme olarak işaretlendi mi?
*   [ ] **Maliyet Koruması:** SMS ve bildirimlerin pre-live modunda giden kutusunda birikmesi sağlanarak sunucu maliyetleri kontrol altına alındı mı?

---

## 2. Ücretli Çevrimdışı/Manuel Pilot Kontrol Listesi (Paid Manual/Offline Pilot)
Salon sahibinden elden veya banka havalesiyle ücret alınarak sisteme dahil edildiğinde yapılması gereken mali hazırlıklar:

### Şirket ve Vergi Hazırlığı
*   [ ] **Vergi Levhası:** Şirket kuruluşu (Şahıs, Ltd. veya A.Ş.) tamamlandı ve vergi numarası alındı mı?
*   [ ] **e-Fatura Entegrasyonu:** Alınan havale/EFT tutarları için resmi e-Arşiv Fatura düzenleyecek altyapı (örn: GİB Portal veya özel entegratör) hazırlandı mı?
*   [ ] **Hukuki Metin Onayı:** Kullanım Koşulları ve Mesafeli Hizmet Sözleşmesi metinleri resmi bir şirket avukatı tarafından gözden geçirildi mi?

### Manuel Tahsilat ve Kayıt Süreci
*   [ ] **Havale Doğrulaması:** Banka hesabına ödemenin ulaştığı bizzat teyit edildi mi?
*   [ ] **Süper Admin Girişi:** `/super-admin/provisioning` sayfasından ödeme yöntemi `bank_transfer` veya `cash` olarak kaydedildi mi?
*   [ ] **Abonelik Süresi:** Kurulumda belirlenen kullanım periyodu (örn: 12 ay) ve fiyat verisi girildi mi?
*   [ ] **Fatura İletimi:** Kesilen resmi e-Arşiv faturası en geç 7 gün içinde salon sahibine e-posta ile gönderildi mi?

---

## 3. Çevrimdışı Abonelik Statüleri Eşlemesi (Offline Billing Status Mapping)

Süreçlerin net takibi için sistemdeki ödeme ve abonelik durumları şu kodlarla eşlenir ve takip edilir:

| Sistemdeki Statü | Anlamı ve Amacı | Operasyonel Karşılığı |
| :--- | :--- | :--- |
| **`manual_active`** | Süper admin tarafından ödemesi doğrulanarak aktif edilmiş salon. | Havale hesaba geçtiğinde bu statüye alınır. |
| **`offline_payment`** | Kredi kartı yerine elden veya havale ile tahsilat yapılan abonelik modeli. | Kullanıcının ödemeyi fiziksel veya banka üzerinden yaptığını belgeler. |
| **`manual_invoice`** | Resmi faturası el ile kesilecek ve takibi dışarıdan yapılacak fatura türü. | e-Arşiv Fatura portalından kesilen fatura numarası ile eşleştirilir. |
| **`complimentary`** | Tanıtım, reklam veya dostluk amaçlı ücretsiz sunulan hesap statüsü. | Ücret alınmaz, sistem içinde statüsü aktiftir. |
| **`pilot_exception`** | Sistemdeki pre-live testlerin aksamaması için süresi süper admin tarafından esnetilmiş hesap. | Pilot aşamasında sürenin bitmesini engeller. |

---

## 4. Sistem İçi ve Sistem Dışı Veri Ayrımı (Data Separation)

### Süper Admin Tarafından Sistemde Kaydedilenler (Inside App)
*   Kiracının ID'si, unvanı, e-postası ve telefon numarası.
*   Abonelik başlangıç ve bitiş tarihleri.
*   Ödeme yöntemi (`bank_transfer`, `cash`, `complimentary`).
*   Ödeme onay logu ve onaylayan Süper Admin bilgisi.

### Sistem Dışında (E-Devlet, Excel veya Muhasebe) Tutulması Zorunlu Olanlar (Outside App)
*   ❌ **Banka dekontları, hesap dökümleri ve makbuzlar.**
*   ❌ **GİB portalı veya e-Arşiv e-fatura XML/PDF dökümanları.**
*   ❌ **Salon sahipleriyle ıslak imzayla yapılan fiziksel sözleşmeler.**
*   ❌ **Kişisel Verilerin Korunması Kanunu (KVKK) gereği fiziki imza içeren aydınlatma formları.**

---

## 5. Kesinlikle Taahhüt Edilmeyecekler Listesi (Must Not Promise List)

Online ödeme kapısı tam bağlanmadan önce salon sahiplerine şu konuların **asla vaat edilmemesi gerekir**:

1.  ❌ **Otomatik Kart Çekimi:** *"Gelecek ay ücret kartınızdan otomatik çekilir."* (Her ay manuel havale istemek zorundasınız).
2.  ❌ **Anlık Otomatik Fatura:** *"Sistem size saniyesinde fatura keser."* (Faturayı muhasebe programınızdan elle kesmek zorundasınız).
3.  ❌ **Canlı iyzico / Sanal POS:** *"Kredi kartıyla müşterilerinizden anında ödeme toplayabilirsiniz."* (Sanal POS aktif olana kadar müşterilerden sadece elden veya kapıda ödeme alınabilir).
4.  ❌ **Gerçek SMS/WhatsApp Gönderimi:** *"Müşterilerinize doğrudan gerçek SMS/WhatsApp gider."* (Pre-live aşamasında tüm iletiler outbox'ta birikir, gerçek gönderim yapılmaz).
5.  ❌ **Otomatik Özel Domain:** *"Kendi `.com` adresiniz anında sisteme yönlenir."* (DNS ve SSL sunucu tanımlamaları manuel veya lansman sonrası yapılacaktır).
