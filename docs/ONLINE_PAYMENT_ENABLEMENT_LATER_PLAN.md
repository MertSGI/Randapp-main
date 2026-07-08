# Çevrimiçi Ödemeye (Sanal POS) Geçiş Yol Haritası (Online Payment Enablement Later Plan)

Bu döküman, LARİ platformunun `limited_live_manual_billing` (manuel/çevrimdışı fatura) modundan `full_live_online_payment` (tam otomatik kredi kartı ödemeli canlı SaaS) moduna sorunsuz, veriler kaybolmadan ve müşteri memnuniyeti zedelenmeden geçebilmesi için izlenecek teknik ve operasyonel yol haritasıdır.

---

## 1. Dışsal Kurumsal ve Mali Gereksinimler (External Prerequisites)

Sanal POS entegrasyonuna başlamadan önce, hukuki ve mali olarak şu adımların tamamlanmış olması gerekir:
*   [ ] **Şirket Kuruluşu:** Ltd. veya A.Ş. tescili tamamlanmış, vergi levhası ve imza sirküleri alınmış olmalı.
*   [ ] **Banka Ticari Hesabı:** Şirket adına ticari banka hesabı (TL/USD/EUR) açılmış olmalı.
*   [ ] **iyzico Ticari Üyelik:** Şirket evrakları ile iyzico üzerinden kurumsal satıcı başvurusu yapılmış ve onaylanmış olmalı.
*   [ ] **Hukuki Sözleşmeler:** Mesafeli Satış Sözleşmesi (MSS) ve Ön Bilgilendirme Formu (ÖBF) avukat tarafından şirkete özel hazırlanmalı.

---

## 2. Teknik Entegrasyon ve Test Süreci (Technical Integration)

Sanal POS canlıya alınırken uygulanacak teknik adımlar sırasıyla şunlardır:

### 1. iyzico Sandbox Ortamında Prova
*   iyzico kontrol panelinden alınan sandbox API anahtarları ile `/services/paymentProviderConfigService.ts` ve backend servisleri yapılandırılır.
*   Sanal kartlar ile abonelik başlatma, başarılı tahsilat, hatalı limit yetersiz kart, abonelik iptali ve iade akışları bizzat test edilir.

### 2. Edge Functions ve Webhook Doğrulama
*   iyzico'dan gelecek ödeme onay (callback) bildirimleri için güvenli Webhook endpointi (`/api/webhooks/iyzico`) hazırlanır.
*   Aynı webhook isteğinin birden fazla kez gelmesine karşı "idempotency" (mükerrer kayıt önleme) mekanizması kontrol edilir.

### 3. Plan Referans Eşlemeleri (Plan Mapping)
*   Sistemdeki "Basic", "Professional" ve "Premium" paketleri iyzico paneli üzerinde abonelik ürünleri olarak tanımlanır ve alınan ürün ID'leri kod tabanındaki plan yapılandırma dosyalarıyla eşleştirilir.

---

## 3. Manuelden Çevrimiçi Ödemeye Geçiş Stratejisi (Migration Strategy)

Canlıdaki manuel abonelerin sistem içi kredi kartı modeline geçirilmesi şu şekilde yönetilir:

```
[Adım 1: Bildirim] ➔ [Adım 2: Geçiş Dönemi] ➔ [Adım 3: Kart Tanımlama] ➔ [Adım 4: Tam Aktivasyon]
```

### Adım 1: Salon Sahiplerine Bildirim Gönderimi
*   Manuel ödeme yapan mevcut salon sahiplerine 15 gün önceden dürüst ve heyecan verici bir e-posta/WhatsApp bilgilendirmesi gönderilir:
    > "Değerli İş Ortağımız, LARİ platformumuzu daha güvenli ve otomatik yönetebilmeniz için online kredi kartı ödeme altyapımız aktifleşiyor! Gelecek ay ödemelerinizi takviminiz kapanmadan, kartınızı güvenle kaydederek otomatik gerçekleştirebilirsiniz."

### Adım 2: Geçiş Dönemi (Paid Through Date Korunması)
*   Mevcut manuel abonelerin `paidThroughDate` (Ödenen son gün) tarihine kadar takvimleri açık tutulur. 
*   Bu tarihten sonra panelde karşılarına "Aboneliğinizi Güvenle Başlatın" kredi kartı tanımlama ekranı otomatik olarak gelir.

### Adım 3: İlk Otomatik Kart Çekimi
*   Salon sahibi kartını tanımladığında, iyzico API'leri üzerinden ilk periyodik çekim gerçekleşir ve veritabanındaki abonelik tipi `credit_card` olarak güncellenir.

---

## 4. Go/No-Go Karar Listesi (Launch Decision Checklist)

Abonelik sistemini tamamen otomatiğe geçirmek için şu 4 onay kutusunun yeşil olması zorunludur:
*   [ ] iyzico ticari başvurusu onaylandı ve API Live anahtarları teslim alındı.
*   [ ] Sandbox provasında 10 başarılı ve 5 hatalı ödeme senaryosu sorunsuz simüle edildi.
*   [ ] Mevcut tüm aktif salon sahipleri geçiş süreci hakkında bizzat bilgilendirildi.
*   [ ] Şirket muhasebecisi, otomatik iyzico faturalandırılması süreçlerini onayladı.
