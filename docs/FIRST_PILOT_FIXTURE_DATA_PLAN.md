# LARİ İlk Pilot Test Veri Seti Planı (First Pilot Fixture Data Plan)

Bu döküman, LARİ'nin ilk pilot sahaya iniş provasından önce yerel veritabanında test amaçlı kullanılacak tamamen kurgusal, güvenli ve gerçekçi test veri setini (fixtures) tanımlar.

---

## 1. Güvenlik ve Gizlilik Taahhüdü (Security & Privacy Directive)

> [!CRITICAL]
> **KESİNLİKLE GERÇEK KİŞİSEL VERİ KULLANMAYIN!**
> Testler sırasında gerçek müşterilerin isimlerini, şahsi telefon numaralarını, kişisel e-posta adreslerini veya kredi kartı detaylarını sisteme girmeyiniz. Tüm veriler kurgusal olmalı ve telefon numaraları `0532 999`, `0543 111` gibi belirgin kurgusal serilerle başlamalıdır.

---

## 2. Kurgusal Salon Tanım Verileri (Salon Blueprint)

| Veri Alanı | Değer / Detay | Açıklama |
| :--- | :--- | :--- |
| **Tenant ID** | `melis-guzellik` | Sistem içi benzersiz tekil kimlik. |
| **İşletme Adı** | Melis Güzellik & Nail Art | Görünür marka adı. |
| **Yetkili/Sahibi** | Melis Yılmaz | Kurgusal yönetici adı. |
| **İletişim Telefonu** | `0532 999 88 77` | Kurgusal test telefon hattı. |
| **İletişim E-Posta** | `melis@randevulari.com` | Kurgusal test e-posta adresi. |
| **Şube Adresi** | Caddebostan Mh. Bağdat Cd. No:124 Kadıköy, İstanbul | İstanbul pilot bölgesi kurgusu. |
| **Instagram Kullanıcı**| `melisguzelliknailart` | Kurgusal sosyal medya linki. |

---

## 3. Hizmet Envanteri Verileri (Service Fixtures)

Sisteme tanımlanacak 6 temel hizmetin parametreleri:

```
Hizmet Tanımları:
[Protez Tırnak] ──> 90 dk / 1200 ₺
[Kalıcı Oje]    ──> 45 dk / 500 ₺
[Manikür]       ──> 30 dk / 350 ₺
[Cilt Bakımı]   ──> 60 dk / 900 ₺
[Hydrafacial]   ──> 45 dk / 1500 ₺
[Kaş Tasarım]   ──> 30 dk / 400 ₺
```

1.  **Hizmet ID:** `svc_nail_extension`
    *   Adı: Protez Tırnak (Gel Extension)
    *   Kategori: Nail Art
    *   Süre: 90 dakika
    *   Fiyat: 1200 ₺
2.  **Hizmet ID:** `svc_gel_polish`
    *   Adı: Kalıcı Oje (Gel Polish)
    *   Kategori: Nail Art
    *   Süre: 45 dakika
    *   Fiyat: 500 ₺
3.  **Hizmet ID:** `svc_manicure`
    *   Adı: Manikür (Manicure)
    *   Kategori: Nail Art
    *   Süre: 30 dakika
    *   Fiyat: 350 ₺
4.  **Hizmet ID:** `svc_classic_skincare`
    *   Adı: Klasik Cilt Bakımı
    *   Kategori: Cilt Bakımı
    *   Süre: 60 dakika
    *   Fiyat: 900 ₺
5.  **Hizmet ID:** `svc_hydrafacial`
    *   Adı: Hydrafacial Cihazlı Bakım
    *   Kategori: Cilt Bakımı
    *   Süre: 45 dakika
    *   Fiyat: 1500 ₺
6.  **Hizmet ID:** `svc_brow_design`
    *   Adı: Kaş Tasarım (Brow Design)
    *   Kategori: Güzellik / Kaş
    *   Süre: 30 dakika
    *   Fiyat: 400 ₺

---

## 4. Uzman Personel Verileri (Staff Fixtures)

1.  **Personel ID:** `staff_selin`
    *   Adı: Selin Can
    *   Unvan: Nail Art Uzmanı (Nail Expert)
    *   Uzmanlık Alanları: Protez Tırnak, Kalıcı Oje, Manikür
    *   Haftalık İzin Günü: Pazartesi (Mondays)
2.  **Personel ID:** `staff_elif`
    *   Adı: Elif Aksoy
    *   Unvan: Estetisyen (Skincare Expert)
    *   Uzmanlık Alanları: Klasik Cilt Bakımı, Hydrafacial, Kaş Tasarım
    *   Haftalık İzin Günü: Salı (Tuesdays)

---

## 5. Çalışma Saatleri Şablonu (Working Hours Schema)

*   **Pazartesi - Cumartesi:** 09:00 - 20:00 (Öğle Molası: Yok, vardiyalı sistem).
*   **Pazar:** Kapalı (Closed).

---

## 6. Kurgusal Müşteri Personaları (Customer Personas)

1.  **Persona A: Düzenli Müşteri (The Loyal Customer)**
    *   İsim: Derya Demir
    *   Telefon: `0532 999 11 22`
    *   E-Posta: `derya@testmail.com`
    *   Davranış: Haftalık manikür ve kalıcı oje randevusu alır, saatlerine tam uyar.
2.  **Persona B: Erteleme Eğilimli Müşteri (The Busy Professional)**
    *   İsim: Aylin Kaya
    *   Telefon: `0543 111 22 33`
    *   E-Posta: `aylin@testmail.com`
    *   Davranış: Randevularını sık sık son dakikada self-servis linkinden erteler veya iptal eder.
3.  **Persona C: Gelmeyen / Güvenilmez Müşteri (The No-Show Risk)**
    *   İsim: Gizem Çelik
    *   Telefon: `0555 222 33 44`
    *   E-Posta: `gizem@testmail.com`
    *   Davranış: Üst üste iki kez randevuya gelmemiştir. Anti-Abuse koruma motoru tarafından takibe alınmıştır.

---

## 7. Örnek Randevu Akış Senaryoları (Booking Scenarios)

### Senaryo A: Başarılı Kalıcı Oje Rezervasyonu
*   **Müşteri:** Derya Demir
*   **Seçilen Hizmet:** Kalıcı Oje
*   **Seçilen Personel:** Selin Can
*   **Tarih/Saat:** Yarın saat 14:00
*   **Korelasyon ID:** `corr_appt_f5a89b02`
*   **Outbox Logu:** "Derya Demir, Melis Güzellik salonunda 14:00 randevunuz onaylanmıştır. Randevunuzu yönetmek için: `randevulari.com/appointment/manage/apt_tok_derya123`"

### Senaryo B: Self-Servis Erteleme Talebi
*   **Müşteri:** Aylin Kaya
*   **Eski Tarih:** Bugün saat 11:00 (Protez Tırnak - Selin Can)
*   **Yeni Talep Edilen Tarih:** Yarın saat 16:30
*   **İşlem Akışı:** Aylin self-servis sayfasından saati değiştirir. Melis Hanım paneline bildirim düşer. Melis Hanım "Onayla" tıklar. Randevu saati güncellenir.
*   **Korelasyon ID:** `corr_appt_aylin987`

### Senaryo C: No-Show ve Anti-Abuse Kilitlemesi
*   **Müşteri:** Gizem Çelik
*   **Aksiyon:** Gizem saat 10:00'daki Hydrafacial randevusuna gelmez. Yönetici "GELMEDİ (No-Show)" işaretler.
*   **Takip Eden Aksiyon:** Gizem aynı telefon numarasıyla akşam 18:00'e tekrar Protez Tırnak randevusu almaya çalışır.
*   **Sistem Tepkisi:** `bookingAbuseProtectionService` talebi engeller: *"Üst üste randevuya gelmediğiniz tespit edilmiştir. Lütfen salonla doğrudan iletişime geçiniz."* Süper Admin panelinde `abuse_spam` bilet kaydı açılır.

---

## 8. Örnek Destek Biletleri & Olaylar (Support & Incident Fixtures)

1.  **Bilet ID:** `ticket_communication_netgsm_failure`
    *   Kategori: `communication`
    *   Öncelik: `high`
    *   Açıklama: Netgsm API entegrasyonu simülasyonunda hata döndü. İletişim outbox SMS gönderimi askıda kaldı.
    *   Durum: `Open`
2.  **Olay (Incident) ID:** `inc_trial_expiration_sweep_error`
    *   Önem Derecesi: `Sev2` (Major)
    *   Açıklama: Günlük trial süresi dolan salonların otomatik taranması işleminde veri tabanı kilitleme uyarısı alındı.
    *   Durum: `Investigating`

---

## 9. Medya Dosyası Gereksinimleri (Media Asset Guidelines)

Yerel testlerde kullanılacak görseller için şu kurgusal gereksinimler uygulanır:
*   **Salon Logosu:** Maksimum `500 KB`, PNG formatında kurgusal transparan şablon.
*   **Kapak Resmi:** Maksimum `1.5 MB`, JPEG formatında optimize edilmiş Caddebostan şubesi dış görsel taslağı.
*   **Galeri Resimleri:** Maksimum 4 adet, her biri `1 MB` altında, webp formatında sıkıştırılmış tırnak tasarım resimleri.

---

## 10. İlgili Belgeler
*   [Uçtan Uca Pilot Prova Kılavuzu](./FIRST_REAL_SALON_END_TO_END_REHEARSAL.md)
*   [İlk Pilot Kabul Kriterleri](./FIRST_PILOT_ACCEPTANCE_CRITERIA.md)
*   [Kurucu Saha Operasyon Kılavuzu](./FOUNDER_PILOT_REHEARSAL_CHECKLIST.md)
