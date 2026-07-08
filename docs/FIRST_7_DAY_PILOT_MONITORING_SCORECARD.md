# LARİ İlk 7 Günlük Pilot İzleme Karnesi (First 7-Day Pilot Monitoring Scorecard)

Bu döküman, kurucuların pilot salondaki test sürecini ölçülebilir kılmak, karşılaşılan sorunları objektif analiz etmek ve "Devam / Tamam" (Go/No-Go) kararı alabilmek amacıyla kullanacağı haftalık değerlendirme karnesidir.

---

## 1. Haftalık Ölçülebilir Metrikler ve Hedefler

Her pilot haftasının sonunda aşağıdaki tabloya gerçek veriler girilir ve başarı skoru hesaplanır:

| Ölçülen Metrik (Metric) | Gerçekleşen Değer | Hedef Değer | Durum (Green / Yellow / Red) |
| :--- | :--- | :--- | :--- |
| **Oluşturulan Randevu Sayısı** (Bookings Created) | | > 15 | |
| **Hatalı Randevu Girişimi** (Failed Bookings) | | 0 | |
| **Yönetici Giriş Sayısı** (Admin Logins) | | > 5 | |
| **Kurulum Tamamlanma Oranı** (Setup Completion %) | | 100% | |
| **İptal Talebi Sayısı** (Cancellations) | | < 3 | |
| **Tarih Değiştirme Talebi** (Reschedules) | | < 3 | |
| **Randevuya Gelmeme Oranı** (No-Show Count) | | < 2 | |
| **Oluşan Outbox Bildirim Sayısı** | | > 15 | |
| **Açılan Destek Bileti** (Support Tickets) | | < 2 | |
| **Güvenlik / Denetim Uyarısı** (Audit Warnings) | | 0 | |
| **Zamanlayıcı Çalıştırma Sayısı** (Scheduler Runs) | | > 7 | |

---

## 2. Niteliksel Değerlendirme ve Kullanıcı Deneyimi (UX)

Sayısal verilerin ötesinde, salon sahibi ve müşterileriyle yapılan görüşmelerden elde edilen nitel bulgular kaydedilir:

*   **Salon Sahibi Memnuniyet Skoru (1-10):** _____ / 10
*   **Müşteri Randevu Kolaylığı Skoru (1-10):** _____ / 10
*   **En Sık Karşılaşılan İtirazlar (Objection List):**
    1.  *Örn: "Müşteriler SMS onayı alamadığını söyledi, gerçek SMS ne zaman gelecek?"*
    2.  *Örn: "Kendi internet sitemizi ne zaman bağlayabiliriz?"*
    3.  *Örn: "Çalışanların mola saatlerini girerken biraz kafam karıştı."*
*   **Acil Çözülmesi Gereken Hatalar (Must-Fix Bugs):**
    *   ...
    *   ...
*   **Satın Alma / Ücretliye Dönüşüm İhtimali:** [ ] Yüksek  [ ] Orta  [ ] Düşük
*   **Fiyat Kabul Seviyesi (Pricing Acceptance):** [ ] Hazır  [ ] Pahalı Buldu  [ ] Pazarlık İstiyor
*   **Paket Uyumluluğu (Package Fit):** [ ] Basic  [ ] Professional  [ ] Premium

---

## 3. Durum Renk Tanımları (Scoring Guide)

### 🟢 Yeşil (Green) - GO
*   **Şartlar:** Oluşturulan randevu sayısı > 15, Hatalı randevu girişimi = 0, Salon sahibi memnuniyet skoru >= 8.
*   **Aksiyon:** Pilot son derece başarılıdır. Salon sahibine ücretli modele geçiş için teklif sunulabilir ve referans mektubu talep edilebilir.

### 🟡 Sarı (Yellow) - RE-ITERATE / CONDITIONAL GO
*   **Şartlar:** Oluşturulan randevu sayısı 5-15 arası, veya bazı küçük UX/tasarım kafa karışıklıkları yaşanmış.
*   **Aksiyon:** Tespit edilen kafa karıştırıcı alanlar (Çalışma saatleri, hizmet ekleme vb.) kurucular tarafından salona bizzat yeniden anlatılır veya ufak kod güncellemeleri yapılır. Pilot süresi 1 hafta daha uzatılır.

### 🔴 Kırmızı (Red) - STOP / NO-GO
*   **Şartlar:** Rota veya veri tabanında kritik çökme (white screen) yaşandıysa, hatalı randevu girişimi > 2 ise, salon yöneticisi paneli kullanmayı tamamen bıraktıysa.
*   **Aksiyon:** Pilot derhal durdurulur. Hatalar geliştirme ortamında temizlenene ve duman testleri tamamen düzelene kadar yeni bir salona teklif götürülmez.

---

## 4. 7. Gün Sonu Nihai Karar Matrisi

Haftanın sonunda kurucular bir araya gelerek şu kararlardan birini verir:

1.  **Karar A:** Pilot başarılı oldu, salonu ücretli/offline modele geçiş için ikna et.
2.  **Karar B:** Salon sistemi sevdi ancak online ödeme ve gerçek SMS bekliyor. Şirket kuruluşu ve iyzico entegrasyonu tamamlanana kadar ücretsiz kullanımını uzat.
3.  **Karar C:** Sistem bu salon için uygun değil (veya çok büyük/küçük). Pilotu sonlandır, verileri KVKK'ya uygun sil ve daha butik bir salon ile sıfırdan Aşama 2'yi başlat.
