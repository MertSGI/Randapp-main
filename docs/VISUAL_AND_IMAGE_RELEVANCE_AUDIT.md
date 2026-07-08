# LARİ Visual and Image Relevance Audit

Bu döküman, LARİ SaaS platformunun ziyaretçi ve yönetim arayüzlerinde kullanılan görsellerin yerindeliğini, marka değerini, güzellik/salon sektörüyle olan sektörel uyumunu ve canlıya geçiş öncesindeki görsel hazırlık seviyesini değerlendirir.

---

## ⚠️ Önemli Görsel ve Lisans Politikası (Disclaimer)
LARİ platformu şu an pre-live hazırlık ve kapalı pilot simülasyonu aşamasındadır.
*   **Telif Hakkı Kısıtlaması:** Sisteme kesinlikle telif hakkı netleşmemiş harici internet görselleri eklenmemiştir.
*   **Gerçek Varlık İndirmeme İlkesi:** Sunucuyu yormamak ve yasal riskleri önlemek adına internetten otomatik görsel indirme işlemi yapılmamıştır.
*   **Görsel Tamamlanma Durumu:** Mevcut tüm görseller yerel SVG şablonları, güvenli CSS degrade dolguları veya minimalist vektör ikonlarıdır (`lucide-react`). Profesyonel marka çekimleri ve nihai pazarlama görselleri, pilot aşamasından ticari canlıya geçiş aşamasında sisteme yüklenecektir.

---

## Görsel Kullanım Alanları ve Sektörel Uyumluluk Analizi

| Görselin Bulunduğu Alan | Mevcut Durum / Tasarım Türü | Sektörel Uyumluluk Seviyesi | Öneri ve Canlıya Geçiş Planı | Risk Seviyesi |
| :--- | :--- | :--- | :--- | :--- |
| **Ana Sayfa Kahraman Görseli** (Hero Banner) | CSS degrade zemin üzerine yerleştirilmiş soyut, minimalist arayüz mockup'ı. | **Orta** (Tüm SaaS'lar için genel) | Canlı satış öncesinde modern, şık bir güzellik salonu iç tasarımı ve aktif tablet randevu ekranını gösteren kompozit bir görsel ile değiştirilmeli. | Düşük |
| **Özellik Kartları İkonları** (Feature Cards) | `lucide-react` kütüphanesinden seçilmiş özelleştirilmiş vektörler (makas, takvim, kullanıcı, cüzdan). | **Yüksek** (Güzellik ve yönetim sektörüyle birebir uyumlu) | İkonlar son derece temiz ve modern. Değişikliğe gerek yoktur. | Yok |
| **Fiyatlandırma Bölümü** | Temiz tipografi ve zemin degradeleri ile desteklenmiş sade paket kartları. | **Yüksek** (Karmaşadan uzak, profesyonel) | Canlı sürümde en popüler paketin (Professional) arkasına hafif bir neon/gold çerçeve efekti eklenebilir. | Yok |
| **Müşteri Randevu Sayfası Galeri / Cover** | `mediaAssetService` tarafından sağlanan pre-live placeholder şablonları. | **Orta** (Test verisi) | Gerçek kuaför, saç kesimi, tırnak tasarımı ve makyaj uygulamalarını yansıtan yüksek kaliteli telifsiz yerel fotoğraflar eklenmeli. | Orta (Müşteri algısı) |
| **Personel Profil Avatarları** | Cinsiyetsiz, şık SVG çizgi ikonları ve pastel renkli harf avatarları. | **Yüksek** (Yükleme hatası riski taşımayan güvenli yapı) | Salon sahibinin kendi çalışanlarının gerçek fotoğraflarını kolayca yükleyebileceği bir kırpma (crop) arayüzü sunulmalı. | Düşük |
| **Hizmet Kategori Görselleri** | Hizmet tipine göre dinamik değişen renkli tematik ikonlar. | **Yüksek** (Pre-live için kırılma riski sıfır) | Saç tasarım için makas/fön, tırnak için oje, cilt bakımı için maske ikonları canlandırılmalıdır. | Yok |

---

## Canlı Satış Öncesi Önerilen Görsel Kategorileri

Salon sahiplerine yapılacak satış sunumlarında ve demo gösterimlerinde sistemin inandırıcılığını artırmak için sisteme kazandırılması planlanan nihai görsel paketleri:

1.  **Şık Salon İç Mekanı:** Lüks, minimalist ve aydınlık bir kuaför/güzellik merkezi salonu genel görünümü (Homepage Hero için).
2.  **Randevu Takvimi Ekran Görüntüsü:** Salon sahibinin işini nasıl kolaylaştırdığını gösteren, renkli bloklarla dolu şık bir haftalık takvim görünümü arayüzü mockup'ı.
3.  **Mobil Rezervasyon Arayüzü:** Müşterinin akıllı telefondan 3 adımda nasıl kolayca randevu alabildiğini tasvir eden telefon çerçeveli (mobile frame mockup) modern bir illüstrasyon.
4.  **Uygulama Görselleri (Treatments):** Saç kesimi, manikür, cilt bakımı ve makyaj gibi popüler hizmetleri temsil eden, yüksek kaliteli, soft tonlarda profesyonel stok fotoğraflar.
5.  **İş Analitiği Paneli (Business Dashboard):** Gelir takibini, doluluk oranlarını ve şube performans grafiklerini gösteren modern bir rapor ekranı görseli.

---

## Kırık Görsel (Broken Image) ve Mobil Duyarlılık Risk Analizi

*   **Dinamik Fallback Yapısı:** Arayüzde yer alan tüm resim etiketleri (`<img>`) için `onError` olay yöneticileri ve fallback SVG şablonları tanımlanmıştır. İnternet kesintisinde veya yanlış bir dosya yolunda arayüzde asla kırık resim simgesi (`[X]`) görünmez; sistem otomatik olarak şık bir harf avatarı veya placeholder zemin çizer.
*   **Güvenli Referrer Policy:** Harici resim yüklemelerinde tarayıcı güvenlik politikalarına takılmamak ve iFrame kısıtlamalarını aşmak için tüm resimlerde `referrerPolicy="no-referrer"` standardı uygulanmıştır.
*   **Mobil Duyarlılık (Responsive):** Tüm görsel alanları `object-cover` ve responsive Tailwind sınıfları (örneğin mobil ekranlarda gizlenen, masaüstünde genişleyen `md:block w-full h-auto` yapıları) ile koruma altına alınmıştır. Resimler hiçbir ekran boyutunda taşma yapmaz ve en-boy oranını bozmaz.
