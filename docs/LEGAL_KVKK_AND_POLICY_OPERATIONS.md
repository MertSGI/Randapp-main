# LARİ Hukuki Metin ve Politika Sürüm Yönetimi Kılavuzu

> **⚠️ ÖNEMLİ HUKUKİ UYARI / DISCLAIMER:**
> Bu döküman, LARİ platformunun pre-live hazırlık süreci için hazırlanmış bir kılavuzdur ve kesinlikle **profesyonel hukuki tavsiye (legal advice) niteliği taşımaz**. İçeriklerin tamamı canlı kullanıma geçilmeden önce nitelikli ve yetkili bir **hukuk danışmanı / şirket avukatı** tarafından incelenmeli, yerel mevzuata göre özelleştirilmeli ve onaylanmalıdır. Yasal uyumluluk sorumluluğu tamamen platformu işleten kuruluşa aittir.

Bu kılavuz, LARİ platformu bünyesindeki hukuki metinlerin (Kullanım Şartları, Gizlilik Politikası, KVKK Aydınlatma Metni vb.) çoklu sürüm (multi-version) yönetimi, hukuk onay süreçleri ve yayına alma aşamalarını detaylandırır.

---

## 1. Hukuki Metin Kategorileri

LARİ bünyesinde 12 temel hukuki ve rıza ilişkili döküman kategorisi tanımlanmıştır:

1. **terms_of_service**: Genel Platform Kullanım Koşulları (Salon sahipleri için).
2. **privacy_policy**: Gizlilik Sözleşmesi (Platform geneli).
3. **kvkk_clarification_text**: KVKK Aydınlatma Metni (Müşteriler için).
4. **cookie_policy**: Çerez Politikası.
5. **data_processing_terms**: Veri İşleme Sözleşmesi (DPA - Salon & Platform arası).
6. **acceptable_use_policy**: Kabul Edilebilir Kullanım Politikası.
7. **subscription_terms**: Abonelik ve Ödeme Şartları.
8. **booking_terms**: Rezervasyon ve Randevu Koşulları.
9. **cancellation_policy**: Randevu İptal ve Değişiklik Politikası.
10. **communication_consent_text**: Operasyonel İletişim İzni Metni.
11. **marketing_consent_text**: Pazarlama ve Kampanya İletişim İzni Metni (ETK Onayı).
12. **media_consent_text**: Personel ve Müşteri Görsel Rıza Metni.

---

## 2. Döküman Durum Geçişleri (Status Lifecycle)

Hukuki dökümanlar aşağıdaki durumlardan geçerek yayına alınır:

```
[ draft ] ────(İncelemeye Gönder)────> [ review_required ] ────(Avukat Onayı)────> [ active ] ────(Yeni Sürüm)────> [ archived ]
```

* **draft (Taslak)**: Sistem yöneticisi veya yazar tarafından düzenlenen, henüz hukukçu incelemesine girmemiş ham metindir.
* **review_required (İnceleme Bekliyor)**: Hukuk danışmanının (avukatın) incelemesi, düzeltmesi ve onayı için hazır hale getirilmiş durumdur.
* **active (Aktif/Yayında)**: Hukukçu tarafından onaylanmış, kullanıcılara gösterilen ve onay kutuları ile imzalanan güncel canlı versiyondur. Bir kategori ve dil için yalnızca **bir** aktif döküman bulunabilir. Yeni bir döküman aktif edildiğinde, önceki aktif döküman otomatik olarak `archived` statüsüne alınır.
* **archived (Arşivlendi)**: Geçmişte yürürlükte olan ancak yerini yeni bir sürüme bırakmış eski politikalardır. Değiştirilemez kabul kayıtları için referans olarak saklanır.

---

## 3. Süreç Adımları (Adım Adım Operasyon)

### Adım A: Yeni Sürüm Taslağı Hazırlama
Süper Admin paneli üzerinden "Yeni Taslak" butonu ile ilgili kategori, dil ve yeni versiyon kodu (örn: `1.1-TASLAK`) belirtilerek döküman oluşturulur.

### Adım B: Hukuki Değerlendirmeye Sunma
Oluşturulan taslak döküman "İncelemeye Gönder" butonuyla `review_required` statüsüne geçirilir. Bu işlem merkezi denetim günlüğüne (audit log) kaydedilir.

### Adım C: Hukukçu Onayı & Yayına Alma (Publishing)
Hukuk danışmanı metni inceledikten sonra "Onayla & Yayınla" butonuna tıklar. Sistem, onaylayan avukatın ismini ve onay imzasını kayıt altına alır, ilgili kategorideki eski aktif sürümü otomatik olarak arşivler ve yeni sürümü anında devreye alır.

---

## 4. Pre-Live Güvenlik Sınırları

* **Lawyer-Review-Required**: Platform içerisindeki tüm seed veriler `1.0-TASLAK` olarak işaretlenmiştir ve profesyonel hukuk incelemesi yapılmadan canlı rezervasyonlarda resmi KVKK beyanı olarak kullanılmamalıdır.
* **Local Sandboxing**: Tüm sürüm değişiklikleri yerel depolama (localStorage) simülasyonunda çalışmaktadır; harici bir resmi sisteme veya e-imza sağlayıcısına canlı bağlantı yapılmaz.
