# LARİ Ödemesiz Kısıtlı Canlı Sürüm Yayılım Planı (Paymentless Limited Live Launch Plan)

Bu döküman, LARİ platformunun online ödeme (sanal POS) altyapısı devreye girmeden önce, kurucuların manuel satış ve tahsilat süreçleriyle sistemi nasıl canlıya alacağını (limited_live_manual_billing modu) açıklayan stratejik ve operasyonel yayılım planıdır.

---

## 1. Amacı ve Felsefesi (Purpose)
LARİ'nin pazara hızlı girmesi ve ilk gerçek gelir akışını başlatması için tam entegre bir e-ticaret altyapısı (iyzico sanal POS) veya otomatik kart çekim entegrasyonu teknik bir engel oluşturmamalıdır. 
*   **Aşama 1 (Kısıtlı Canlı Sürüm):** Kurucular sahaya çıkar, salon sahipleriyle yüz yüze görüşür, elden veya banka havalesiyle ödemeyi alır ve hesabı Süper Admin panelinden anında aktifleştirir.
*   **Sonuç:** Yazılım geliştirme süreçleri tıkanmadan, nakit akışı başlar ve ürün pazarda bizzat test edilir.

---

## 2. "limited_live_manual_billing" Modunun Teknik Sınırları

Bu yayılım modunda sistemin hangi özellikleri çalışır ve hangileri kapalıdır:

| Özellik (Feature) | Canlılık Durumu (Status) | Nasıl Yönetilir? |
| :--- | :--- | :--- |
| **Online Ödeme (Kart ile satın alma)** | ❌ **Pasif** | Satın alma butonları kapatılır veya doğrudan kayıt/iletişim formuna yönlendirir. |
| **Manuel Hesap Aktivasyonu** | ✅ **Aktif** | Süper Admin, aldığı ödeme referansını girerek salonun takvimini manuel olarak açar. |
| **Müşteri Randevu Portalı** | ✅ **Aktif** | Canlı sunucu/veritabanı üzerinde müşteriler gerçek randevu oluşturabilir. |
| **Salon Sahibi Paneli (`/admin`)** | ✅ **Aktif** | Salon yöneticisi çalışanları, takvimi, hizmetleri ve saatleri gerçek zamanlı yönetir. |
| **Bildirimler (SMS/Email/WhatsApp)** | ⏳ **Simüle (Outbox-only)** | Pre-live giden kutusunda birikir, maliyet üretmez, operasyonel olarak manuel gönderilir veya lansman beklenir. |
| **Özel Alan Adı (Custom Domain)** | ⏳ **Kısmi Canlı** | Salonlar `randevulari.com/salon-slug` üzerinden anında yayına girer. Özel `.com` yönlendirmesi lansman sonrasına bırakılır. |

---

## 3. Sahada Satış ve Taahhüt Sınırları

Kurucular, salon sahiplerine bu modeli satarken şu dürüst beyanlarda bulunmalıdır:

### 🟢 Neler Taahhüt Edilebilir?
*   Müşterilerin 24 saat kesintisiz ve pratik şekilde randevu alabileceği şık bir web sayfası.
*   Her çalışanın kendi çalışma ve mola saatlerini yönetebileceği gelişmiş bir dijital takvim.
*   Randevu iptal ve erteleme süreçlerini müşterinin self-servis yapabilmesi.
*   Hiçbir veri kaybı olmadan sistemin her gün otomatik yedeklenmesi.

### 🔴 Neler Taahhüt Edilemez ve Vaat Edilemez?
*   ❌ **Otomatik Kart Tahsilatı:** "Aylık ödemeniz kredi kartınızdan otomatik çekilecek" denilemez. Ödemelerin her ay havale ile yapılması gerektiği belirtilmelidir.
*   ❌ **Anlık SMS Bildirimi:** "Müşterinin cep telefonuna anında onay SMS'i gidecek" denilemez. Bildirim onaylarının sistem içi veya WhatsApp simülasyonu ile yönetildiği belirtilmelidir.
*   ❌ **Entegre e-Fatura:** "Sistem saniyesinde faturanızı kesip size iletecek" denilemez. Faturanın kurucuların muhasebecisi tarafından elle kesilip 7 gün içinde e-posta ile gönderileceği söylenmelidir.

---

## 4. Manuel Onboarding ve Aktivasyon Akışı (Onboarding & Activation)

1.  **Görüşme ve Satış:** Salon sahibi ile görüşülür, elden nakit veya banka havalesi ile ücret tahsil edilir.
2.  **Sözleşme:** Fiziksel veya PDF ortamında manuel Pilot/Abonelik protokolü imzalanır.
3.  **Kayıt:** Salon sahibi `/register` sayfasından kaydolur. Sistem ona ödemesinin beklemede olduğunu ve LARİ ekibi tarafından onaylanacağını söyler.
4.  **Aktivasyon:** Süper Admin `/super-admin/provisioning` sayfasına girer, havale dekontunu veya nakit referansını sisteme ekleyerek aboneliği aktifleştirir. Bu durumda kiracının abonelik durumu `manual_active` olarak set edilir.
5.  **Kullanım:** Salon yöneticisine giriş bilgileri ve `/booking/salon-slug` randevu adresi teslim edilir.

---

## 5. Acil Durum Durdurma ve Geri Dönüş Şartları (Stop Conditions)

Kısıtlı canlı kullanım aşamasında, aşağıdaki durumlardan biri gerçekleşirse sistem dondurulur ve düzeltici önlemler alınır:
*   Veritabanı veya sunucu üzerinde kritik veri tutarsızlıkları oluşması (Örn: Çakışan randevular).
*   Salon sahiplerinin manuel ödemeyi geciktirmesi durumunda askıya alma süreçlerinin aksaması.
*   Yasal KVKK silme veya bilgi edinme taleplerinin manuel outbox'tan silinememesi.
