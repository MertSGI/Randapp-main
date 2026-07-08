# LARI - MANUAL TO ONLINE PAYMENT MIGRATION RUNBOOK (MANUELDEN ONLINE ÖDEMEYE GEÇİŞ KILAVUZU)

Bu kılavuz, **paymentless_limited_production** (çevrimdışı ve manuel) modunda çalışan mevcut salonların (kiracıların), gelecekte şirketleşme tamamlanıp iyzico sanal POS altyapısı kurulduğunda **full_live_online_payment** (tam otomatik kredi kartlı) moduna nasıl güvenle, sıfır veri kaybıyla ve mükerrer tahsilat olmadan taşınacağını açıklar.

---

## 1. MEVCUT MANUEL KİRACILARIN TESPİT EDİLMESİ (IDENTIFY TENANTS)

Geçiş işlemine başlamadan önce, veritabanında aktif olan tüm çevrimdışı abonelikler listelenir:

```sql
-- Aktif manuel abonelikleri listeleme sorgusu
SELECT tenant_id, plan_id, status, "paidThroughDate", "paymentReferenceNote" 
FROM subscriptions 
WHERE status = 'manual_active' OR "paymentProvider" = 'manual_billing';
```

Bu kiracıların:
*   **Tenant ID** (Kiracı benzersiz kodları)
*   **Hizmet Paketi** (Plan ID - örn. `standard`, `professional`)
*   **Ödenen Son Tarih** (`paidThroughDate`)
*   **E-Posta ve İletişim Bilgileri**
not edilerek bir geçiş envanteri (Migration Manifest) oluşturulur.

---

## 2. GEÇİŞ SÜRECİNDE DEĞİŞMEYECEK PARAMETRELER (PRESERVE DATA)

Taşıma işlemi sırasında aşağıdaki alanlar kesinlikle değiştirilmez, silinmez veya sıfırlanmaz:

1.  **Tenant ID & UUID:** Kiracının tüm veritabanı ilişkileri (personeller, randevular, şubeler) bu ID'ye bağlıdır. Kesinlikle yeni bir kiracı hesabı oluşturulmaz, mevcut kayıt güncellenir.
2.  **Müşteri Randevu Sayfası URL'i (Slug):** `randevulari.com/booking/salon-slug` adresi değişmeden kalır. Müşteriler randevu alırken herhangi bir kesinti hissetmezler.
3.  **Hizmet ve Personel Kataloğu:** Salona ait personeller, hizmetler ve çalışma saatleri aynen korunur.
4.  **Mevcut Hak Edilmiş Süre (`paidThroughDate`):** Salon sahibinin elden ödediği süre (örn. 15 Ekim 2026'ya kadar geçerli abonelik) sisteme korunarak aktarılır. Bu tarihten önce kredi kartından çekim yapılmaz.

---

## 3. İYLESİTİRİLMİŞ İYZİCO ENTEGRASYONU VE KART TANIMLAMA (KART KAYDETME)

Sanal POS aktif hale getirildiğinde, manuel üyeler için izlenecek süreç şudur:

1.  **Önceden iyzico Müşterisi Yaratma:** Arka planda, salon sahibinin e-posta adresi ile iyzico üzerinde bir `CardUser` nesnesi oluşturulur.
2.  **Ödeme Günü Uyarısı:** Salon sahibinin elden ödediği sürenin bitimine **3 gün kala** sisteme giriş yaptığında ona özel bir bilgilendirme penceresi (modal) gösterilir:
    *   *TR:* "Elden ödeme döneminiz 3 gün sonra sona eriyor. Hizmetinizin kesintisiz devam etmesi ve randevu almaya devam edebilmeniz için lütfen aşağıdaki güvenli alandan kredi kartınızı tanımlayın. İlk çekiminiz sürenizin dolacağı [Tarih] gününde yapılacaktır."
3.  **Güvenli Kart Doğrulama (iyzico Form):** Salon sahibi, kart bilgilerini doğrudan iyzico iFrame arayüzüne girer. LARİ veritabanına kredi kartı numarası kesinlikle kaydedilmez. iyzico kartı doğrular ve sisteme bir `cardToken` döner.

---

## 4. MANUELDEN ONLİNE ÖDEMEYE GEÇİŞ (THE CUTOVER MECHANISM)

Kart doğrulandıktan sonra, ilgili abonelik kaydı güncellenir:

```sql
-- Aboneliği otomatik iyzico çekim modeline geçirme
UPDATE subscriptions 
SET 
  status = 'active', 
  "paymentProvider" = 'iyzico',
  "paymentProviderReference" = '[iyzico_subscription_id]',
  "trialEnd" = NULL, -- Varsa deneme süresi temizlenir
  "updatedAt" = NOW()
WHERE tenant_id = '[kiraci_id]';
```

### Mükerrer Çekimin Önlenmesi (Avoid Duplicate Charge)
*   **Kural:** iyzico aboneliği başlatılırken, başlangıç tarihi (billing_period_start) tam olarak mevcut `paidThroughDate` gününe kurulur. Böylece salon sahibinin elden ödediği günler yanmaz, mükerrer tahsilat yapılmaz.

---

## 5. SORUN YAŞANIRSA GERİ DÖNÜŞ PLANI (ROLLBACK RUNBOOK)

iyzico kart tanımlama adımında veya API entegrasyonunda teknik bir hata oluşursa:

1.  **Abonelik Koruma:** Kiracının abonelik durumu anında güvenli `manual_active` statüsüne geri çekilir.
2.  **Manuel İzin:** Salonun randevu almaya devam edebilmesi için Süper Admin panelden geçici olarak 7 gün ek süre tanımlar.
3.  **Log İnceleme:** Entegrasyon hataları veritabanı loglarından (Supabase Edge Function Logs veya sunucu logları) incelenerek çözülür. Tekrar deneme talep edilir.
