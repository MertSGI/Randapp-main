# LARİ İletişim ve Bildirim Teslimat Sözleşmesi (Communication Delivery Contract)

**Document ID:** `LARI-DOC-COMMUNICATION-DELIVERY-CONTRACT-20261021`  
**Program:** LARİ Platform İletişim Güvenliği ve Fail-Closed Bildirim Standardı  
**Durum:** `SOURCE_READY_FOR_REVIEW`  

---

## 1. Mimari Güvenlik İlkeleri ve Fail-Closed Tasarım

1. **İstemci Tarafında Sahte Teslimat Yasağı:**
   - İstemci (browser), yerel `localStorage` konfigürasyonunu veya `VITE_COMMUNICATION_MODE` ortam değişkenini gerekçe göstererek hiçbir bildirim etkinliğini otomatik olarak `sent` durumuna yükseltemez.
   - İstemci tarafından sentetik sağlayıcı kimlikleri (`prov_...`) üretilemez.
   - Bildirimler istemcide ancak `rendered` (taslak hazırlandı) veya `skipped` (KVKK / rıza izni yok) durumunda kalabilir.

2. **Veritabanı Erişim Kısıtlamaları (20260918_phase3 Temeli):**
   - Ürün veritabanında `communication_outbox` tablosuna doğrudan `INSERT`, `UPDATE` veya `DELETE` yetkisi anon/authenticated/PUBLIC rollerinden geri alınmıştır (`REVOKE`).
   - İstemciden doğrudan `/rest/v1/communication_outbox` tablosuna POST veya PATCH istekleri `COMMUNICATION_SERVER_ENQUEUE_REQUIRED` ve `COMMUNICATION_PROVIDER_CALLBACK_REQUIRED` ile reddedilir.
   - İstemci, kiracıya özel bildirimleri yalnızca güvenli projeksiyon RPC'si olan `get_tenant_communication_outbox` üzerinden salt-okunur olarak listeleyebilir.

3. **Kanal Bütünlüğü:**
   - `in_app` bildirimleri sessizce `sms` kanalına dönüştürülemez. Desteklenmeyen veya tanımlanmamış kanallar açıkça `UNSUPPORTED_COMMUNICATION_CHANNEL` ile reddedilir.
   - Alıcı bilgisi eksik olan iletiler `unknown_recipient` yazılarak geçiştirilemez; `INVALID_COMMUNICATION_RECIPIENT` hatası üretilir.

---

## 2. Dış Sağlayıcı Aktivasyon Kapısı (Future Later Gate)

Gerçek SMS (NetGSM, Twilio vb.) veya E-posta (SendGrid, SES vb.) sağlayıcı entegrasyonu, sunucu tarafında (Supabase Edge Functions / DB Trigger) güvenli ortam değişkenleri ve webhook imza doğrulayıcıları ile aktif edilecektir. Bu pakette harici ağ bağlantısı veya üçüncü taraf API anahtarı kullanılmamıştır.
