# LARİ Pilot ve Canlı Sürüm Karar Kapısı (Pilot Launch Decision Gate)

Bu döküman; kurucu ortaklar ve teknik liderler için LARİ platformunun hangi aşamada hangi yetki seviyesiyle açılması gerektiğini belirleyen nesnel, veriye dayalı bir **Go/No-Go Karar Matrisidir**.

Sistem yersiz taahhütlerden, hukuki açıklar vermekten ve teknik kesintilerden kaçınmak üzere 4 kademeli bir yayılım (deployment) stratejisine bölünmüştür.

---

## 1. Dört Aşamalı Canlılık Matrisi

### Aşama 1: Sadece Dahili Demo (Internal Demo Only)
*   **Açıklama:** Sistemin sadece kurucular ve yakın çevre tarafından test edildiği, gerçek salon kaydı alınmayan kapalı simülasyon ortamı.
*   **Durum:** 🟢 **GO (Hazır)**
*   **Şartlar:**
    *   Tüm yerel servisler (`local/pre-live` modunda) ve test verileri yüklü olmalıdır.
    *   Fiziksel ödeme altyapıları simüle edilmelidir.
*   **Kesinlikle İddia Edilmeyecekler (Must Not Claim):** "Sistem şu an gerçek salonlarda aktif kullanılıyor."

---

### Aşama 2: Ücretsiz Manuel Pilot (Unpaid Manual Pilot)
*   **Açıklama:** Güvenilen 1 veya 2 dost salona (örneğin kurucuların kuaförleri) sistemin ücretsiz sunulması, salonun randevuları manuel veya yerel olarak girmesi.
*   **Durum:** 🟢 **GO (Teknik Rota & Buton Testleri Geçtiğinde Hazır)**
*   **Şartlar:**
    *   Rota ve CTA duman testinin (Smoke Test) başarıyla tamamlanmış olması.
    *   Süper Admin panelinden `/super-admin/provisioning` kullanılarak salonun manuel kurulması.
    *   Salon sahibine bunun bir **pre-live/pilot deneme sürümü** olduğunun açıkça bildirilmesi.
*   **Gerekli Teknik Kontroller:**
    *   `verify-live-readiness-smoke.mjs` betiğinin tamamen yeşil olması.
    *   `verify-legal-consent-readiness.mjs` betiğinin tamamen yeşil olması.
*   **Hukuki ve Mali Kontroller:**
    *   Salon sahibinin "Pilot Sözleşmesi" veya "Geçici Kullanım Şartları" belgesini ıslak imzayla onaylamış olması.
*   **Kesinlikle İddia Edilmeyecekler (Must Not Claim):** "Sistem resmi olarak KVKK onaylıdır", "Verileriniz bulutta kalıcı olarak yedeklenmektedir."

---

### Aşama 3: Ücretli Çevrimdışı/Manuel Pilot (Paid Manual/Offline Pilot)
*   **Açıklama:** Salonlardan elden, banka havalesi veya fiziki POS yoluyla aylık/yıllık ödeme alınarak sisteme dahil edilmeleri. Online ödeme kapısı (iyzico) henüz aktif değildir.
*   **Durum:** 🟡 **CONDITIONAL GO (Şartlı Onay - Şirketleşme ve Mali Hazırlık Sonrası)**
*   **Şartlar:**
    *   Fatura kesebilecek bir şahıs veya limited şirketin kurulmuş olması.
    *   Muhasebe / e-fatura entegrasyonunun elle yürütüleceğinin organize edilmesi.
    *   Süper Admin tarafından ödemelerin manuel işlenmesi.
*   **Hukuki ve Mali Kontroller:**
    *   Hukuk müşaviri tarafından Kullanıcı Sözleşmesi ve KVKK Aydınlatma Metinlerinin nihai incelemesinin tamamlanmış olması.
    *   Vergi dairesi kaydının bulunması ve vergilendirme planının netleştirilmesi.
*   **Kesinlikle İddia Edilmeyecekler (Must Not Claim):** "Kredi kartınızdan her ay otomatik çekim yapılır", "iyzico güvencesiyle 3D secure ödeme aktiftir."

---

### Aşama 4: Tam Sürüm Bulut SaaS (Full Production SaaS)
*   **Açıklama:** Herhangi bir salonun web sitesine girip kredi kartıyla saniyeler içinde kaydolduğu, otomatik online ödeme, otomatik DNS/SSL yönlendirmeli tam ölçekli canlı hizmet.
*   **Durum:** 🔴 **NO-GO (Şu An İçin Yasak - Canlı Altyapı Entegrasyonları Sonrası)**
*   **Engeller (Blocks):**
    *   Gerçek Supabase veritabanı ve production RLS (Row Level Security) politikalarının bağlanmamış olması.
    *   Gerçek iyzico sanal POS ve otomatik abonelik (recurring payment) Edge Function webhook'larının bulunmaması.
    *   Gerçek SMS / WhatsApp (İYS uyumlu) sağlayıcı bağlantılarının olmaması (Şu an simüle edilmektedir).
    *   Profesyonel bağımsız avukat onayının henüz alınmamış olması.
    *   Wildcard DNS ve SSL sunucu yönlendirmelerinin tamamlanmamış olması.

---

## 2. Kurucunun "GO / NO-GO" Karar Denetim Listesi

Bir sonraki aşamaya geçmeden önce kurucu ortakların ve teknik liderlerin vermesi gereken onayların özeti:

```
[ ] Adım 1: Teknik Hazırlık Testi
    - Tüm rotalar ve butonlar çalışıyor mu? (Evet, Smoke Test belgeleri hazır)
    - Yerel/pre-live simülatörler kararlı çalışıyor mu? (Evet)
    - Kırık görsel veya yönlendirme döngüsü var mı? (Hayır)

[ ] Adım 2: Hukuki ve Mevzuat Uyumluluğu
    - Şirket avukatı Kullanım Şartları ve Gizlilik sözleşmelerini inceledi mi?
    - KVKK Değiştirilemez Rıza Defteri entegrasyonu onaylandı mı?
    - Islak imzalı pilot sözleşmeleri hazırlandı mı?

[ ] Adım 3: Mali ve Muhasebesel Altyapı
    - Para tahsilatı durumunda faturalandırma nasıl yapılacak belirlendi mi?
    - Şirket hesapları ve vergi numarası hazır mı?

[ ] Adım 4: Canlı Altyapı Tedarikçileri
    - Gerçek SMS/WhatsApp API'leri için abonelikler başlatıldı mı?
    - Sanal POS başvurusuna onay alındı mı?
```

## Önerilen Stratejik Karar ve Yol Haritası

1.  **Bugün:** LARİ platformu **Aşama 1 (Dahili Demo)** için %100 hazırdır. Kurucular bu sürümü yatırımcılara ve potansiyel müşterilere sunum (sales demo) yapmak için güvenle kullanabilirler.
2.  **Önümüzdeki Hafta:** Dost salonlar ile **Aşama 2 (Ücretsiz Manuel Pilot)** başlatılabilir. Bu sayede sahada gerçek kullanıcı geri bildirimleri toplanırken hiçbir mali ve hukuki risk alınmamış olur.
3.  **Önümüzdeki Ay:** Şirketleşme tamamlandığında **Aşama 3 (Ücretli Çevrimdışı Pilot)** devreye alınarak ilk gelir modeli (revenue) test edilir.
4.  **Son Aşama:** Tüm entegrasyonlar, sözleşmeler ve API'ler tamamlandığında **Aşama 4 (Tam Bulut SaaS)** kapısı aralanır.
