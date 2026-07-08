# Kişisel Veri Sahibi Hak Talepleri (KVKK Başvuru Süreçleri)

> **⚠️ ÖNEMLİ HUKUKİ UYARI / DISCLAIMER:**
> Bu döküman, LARİ platformunun pre-live hazırlık süreci için hazırlanmış bir taslaktır ve kesinlikle **profesyonel hukuki tavsiye (legal advice) niteliği taşımaz**. İçeriklerin tamamı canlı kullanıma geçilmeden önce nitelikli ve yetkili bir **hukuk danışmanı / şirket avukatı** tarafından incelenmeli, yerel mevzuata göre özelleştirilmeli ve onaylanmalıdır. Yasal uyumluluk sorumluluğu tamamen platformu işleten kuruluşa aittir.

6698 sayılı KVKK m.11 uyarınca kişisel veri sahipleri, veri sorumlularına başvurarak kendileriyle ilgili bilgilerin işlenip işlenmediğini öğrenme, erişim, düzeltme, silinmesini isteme (unutulma hakkı) ve verilerin kopyasını talep etme haklarına sahiptir. Bu döküman, LARİ platformunda veri hakkı taleplerinin nasıl işlendiğini ve operasyonel akışını tarif eder.

---

## 1. Talep Türleri (Data Rights Request Types)

LARİ sistemi üzerinde 5 temel veri hakkı başvuru türü işlenebilmektedir:

1. **access (Erişim)**: Müşterinin, sistemde hangi verilerinin (randevular, notlar, ödeme geçmişi vb.) tutulduğunu sorguladığı talep.
2. **export (Veri Taşınabilirliği)**: Müşterinin tutulan verilerinin tamamını makine tarafından okunabilir bir formatta (JSON/CSV) talep ettiği başvuru.
3. **deletion (Unutulma Hakkı / Silme)**: Müşterinin profilinin, geçmiş randevularının ve rızalarının veritabanından kalıcı olarak temizlenmesini talep ettiği başvuru.
4. **correction (Düzeltme)**: Yanlış veya eksik girilmiş kimlik/iletişim bilgilerinin güncellenmesi talebi.
5. **consent_withdrawal (Rıza İptali)**: Verilmiş olan rızaların toplu olarak iptal edilmesi başvurusu.

---

## 2. Operasyonel İş Akışı (The Workflow)

Bir veri hakkı talebi, veritabanı bütünlüğü ve yasal doğrulama zorunlulukları nedeniyle **asla otomatik olarak gerçekleştirilmez**; mutlaka insan kontrolü ve doğrulama süreçlerinden geçer:

```
[ Müşteri Talebi ] ──> [ Otomatik Destek Bileti (Yüksek Öncelik) ] ──> [ Yönetici Kimlik Doğrulaması ] ──> [ Manuel İşlem ve Onay ] ──> [ Sonuçlandırma ]
```

### Adım 1: Talebin Oluşturulması
Müşteri, kendisine özel randevu self-servis sayfasındaki KVKK bölümünden veya salon yöneticisi admin panelinden bir hak talebi oluşturur. Talep `dataRightsRequestService.createDataRightsRequest()` ile sisteme işlenir.

### Adım 2: Otomatik Destek Bileti (Support Ticket) Entegrasyonu
Veri güvenliği ihlallerini ve gecikmeleri önlemek adına, oluşturulan her KVKK talebi için arka planda otomatik olarak **YÜKSEK ÖNCELİKLİ (High Priority)** bir destek bileti açılır. Bu bilet, sistem yöneticisinin iş kuyruğuna düşer.

### Adım 3: Manuel Kimlik Doğrulama (Identity Verification)
Yönetici, talepte bulunan kişinin gerçekten o verinin sahibi olup olmadığını doğrulamakla yükümlüdür (örneğin telefon araması ile onay alarak veya SMS kodu teyidi ile). Doğrulama yapılmadan veri ifşa edilemez veya silinemez.

### Adım 4: İşlem ve Onay
* **Veri Silme (Deletion) Talepleri**: Salon sahibi, müşterinin geçmiş randevu finansallarını arşivledikten sonra müşterinin kişisel alanlarını (isim, telefon, e-posta) kalıcı olarak anonimleştirir (örneğin `Müşteri 1048` olarak değiştirilir).
* **Veri İhracı (Export) Talepleri**: `dataExportService` kullanılarak müşteriye ait tüm randevu ve profil geçmişi güvenli bir JSON olarak dışarı aktarılır ve veri sahibine iletilir.

### Adım 5: Durumun Güncellenmesi ve KVKK Defter Kaydı
Talep tamamlandığında, Süper Admin "Tamamlandı" olarak işaretler. Bu işlem sırasında girilen "İşlem Notları" rıza günlüğüne ve destek biletine kalıcı olarak işlenerek bilet otomatik olarak kapatılır.

---

## 3. Pre-Live Simülasyon Koşulları

* **Güvenli Redaksiyon**: Talep formlarına girilen tüm e-posta ve telefon numaraları, denetim loglarında sızıntıyı önlemek amacıyla `auditLogService.redactAuditPayload` ile otomatik olarak maskelenmektedir.
* **Kanuni Süre Takibi**: Sistem, taleplerin KVKK'da belirtilen **30 günlük yasal yanıt süresi** aşılmadan çözülmesi için bilet sürelerini izler.
