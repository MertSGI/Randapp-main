# LARİ Pilot Salonu Öncesi Hukuki İnceleme Kontrol Listesi (Legal Review Checklist)

> **⚠️ ÖNEMLİ HUKUKİ UYARI / DISCLAIMER:**
> Bu döküman, LARİ platformunun pre-live hazırlık süreci için hazırlanmış bir taslaktır ve kesinlikle **profesyonel hukuki tavsiye (legal advice) niteliği taşımaz**. İçeriklerin tamamı canlı kullanıma geçilmeden önce nitelikli ve yetkili bir **hukuk danışmanı / şirket avukatı** tarafından incelenmeli, yerel mevzuata göre özelleştirilmeli ve onaylanmalıdır. Yasal uyumluluk sorumluluğu tamamen platformu işleten kuruluşa aittir.

Bu kontrol listesi, LARİ platformunun ilk gerçek pilot salonunda (Pilot Rehearsal) ve sonrasında ticari canlı kullanıma geçmesinden önce şirket avukatları ve uyumluluk danışmanları tarafından tamamlanması gereken yasal ve idari adımları içerir.

---

## 1. Sözleşme ve Aydınlatma Metinleri Uyumluluk Kontrolleri

* [ ] **Kullanım Koşulları (Terms of Service)**:
  * Randevulari.com üzerinden sunulan bulut altyapısının sorumluluk sınırları avukat tarafından incelendi mi?
  * Mücbir sebepler ve kesinti tazminat limitleri belirlendi mi?
* [ ] **Gizlilik ve KVKK Aydınlatma Metni**:
  * Salon müşterilerinin rezervasyon sayfasında onayladığı aydınlatma metninde veri sorumlusu olarak ilgili salonun unvanı ve iletişim bilgileri dinamik olarak dolduruluyor mu?
  * Veri işleme amaçları ve saklama süreleri salonun gerçek fiziksel operasyonu ile eşleşiyor mu?
* [ ] **İptal ve Randevu İade Koşulları**:
  * Randevunun son kaç saate kadar iptal edilebileceğine dair salon kuralları (cancellation_policy) yasal tüketici hakları sınırlarına uygun mu?
  * Depozitolu veya ön ödemeli rezervasyonlarda iade şartları Mesafeli Sözleşmeler Yönetmeliği ile uyumlu mu?

---

## 2. İletişim ve Ticari Elektronik İleti Uyumluluğu (ETK & İYS)

* [ ] **Operasyonel vs Ticari İleti Ayrımı**:
  * Sadece randevu teyidi, erteleme ve iptal bildirimlerinin "İşlemsel (Transactional)" olarak gönderilmesi; hiçbir pazarlama veya kampanya içeriği barındırmaması sağlandı mı?
  * Kampanya, kutlama, sadakat puanı ve indirim içerikli tüm SMS/WhatsApp mesajlarının gönderilmesinden önce müşterinin güncel `marketingConsent` izninin aktif olduğu doğrulandı mı?
* [ ] **İYS (İleti Yönetim Sistemi) Entegrasyonu**:
  * Canlı SMS gateway sağlayıcısı üzerinden gönderilecek pazarlama iletileri öncesinde İYS onay sorgulaması API seviyesinde aktif edildi mi?
  * Müşterinin reddetme (opt-out) hakkını ücretsiz kullanabilmesi için her pazarlama SMS'inin sonuna Mersis numarası ve çıkış linki (red bildirim kanalı) eklendi mi?

---

## 3. Veri Güvenliği ve İzolasyon Kontrolleri (Security & Privacy)

* [ ] **Row-Level Security (RLS) ve Tenant İzolasyonu**:
  * Bir salonun (Tenant A) müşterilerine, personellerine veya rıza kayıtlarına, başka bir salonun (Tenant B) hiçbir şekilde erişemeyeceği veritabanı seviyesinde test edilip onaylandı mı?
* [ ] **Medya ve Personel Fotoğraf Rızaları**:
  * Salonda çalışan personellerin fotoğraf ve isimlerinin kamuya açık rezervasyon sayfasında yayımlanması için yazılı muvafakatnameleri alındı mı?
* [ ] **Maskeleme ve Log Güvenliği**:
  * `auditLogService` bünyesindeki maskeleme motorunun şifreleri, kredi kartı numaralarını ve özel nitelikli kişisel verileri (müşteri tarz notları vb.) log dosyalarında maskelediği doğrulandı mı?

---

## 4. Veri Sahibi Hakları ve Başvuru Süreçleri

* [ ] **Veri Silme (Unutulma Hakkı) Prosedürü**:
  * Silme talebi onaylanan bir müşterinin verilerinin veritabanından kalıcı olarak silinmesi veya istatistik bütünlüğü için geri döndürülemez şekilde anonimleştirilmesi süreci simüle edildi mi?
* [ ] **Yasal Yanıt Süresi (30 Gün)**:
  * KVKK başvurularının en geç 30 gün içinde sonuçlandırılmasını sağlamak üzere bilet takip sistemi Süper Admin bildirim ekranları ile entegre edildi mi?

---

## 5. Hukukçu Onay Beyanı

LARİ platformu üzerinde pre-live hazırlık amacıyla oluşturulan dökümanların `1.0-TASLAK` statüsünden `active` (Yayında) statüsüne geçirilebilmesi için, incelemeyi yapan avukatın Süper Admin panelindeki döküman yayına alma ekranında ismini/imzasını girerek **"Hukuken İncelendi ve Uygundur"** beyanını vermesi zorunludur. Bu beyan değiştirilemez denetim defterine kaydedilir.
