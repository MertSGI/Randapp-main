# LARİ V1-B `SOURCE_READY` Paketi & `EXTERNAL_HOLD` Kayıt Raporu

**Belge Kimliği:** `LARI-DOC-V1B-SOURCE-READY-20261116`  
**Referans Adım:** `ADIM-030` (`Faz B4: V1-B SOURCE_READY Paketi & Canlı Ödeme/Sağlayıcı EXTERNAL_HOLD Kaydı`)  
**Çalışma Dalı:** `ci/lari-independent-acceptance-gate`  
**Temel (Base) Commit SHA:** `474a28c7790dd0aebab0e9dc74637280ae430e05` (`ADIM-029` kabul edilmiş sürüm)  
**V1-B Kaynak Durumu:** `SOURCE_READY` (Çevrimdışı / Deterministik Sağlayıcı Sözleşmeleri & Fail-Closed Güvenlik Tamamlandı)  
**Canlı Yayın Kararı (Release Decision):** `PRODUCTION = NO_GO`  
**Tarih:** 16 Kasım 2026

---

## 1. Yönetici Özeti ve Karar Beyanı

Bu belge, **LARİ (`randevulari.com`)** platformunun **Faz B (V1-B Ticari ve Abonelik Kaynak Hazırlığı)** kapsamındaki `ADIM-027..030` çalışmalarının kaynak kodu düzeyinde `SOURCE_READY` seviyesine ulaştığını; buna karşılık tüm canlı ödeme ağ geçitleri, webhook sırları, e-Fatura adaptörleri ve canlı iletişim sağlayıcı kimlik bilgilerinin **0 TL harcama**, **sıfır gizli anahtar sızıntısı** ve **fail-closed güvenlik** ilkeleri uyarınca `EXTERNAL_HOLD` statüsünde tutulduğunu resmen kayıt altına alır.

### Korunan Değişmez Kırmızı Çizgiler
* `PRODUCTION = NO_GO` — Canlı üretime çıkış kesinlikle blokelidir.
* `PAID_FALLBACK = DISABLED` — Ödemesiz/yerel modlarda veya istemci durumunda otomatik ücretli abonelik/tahsilat yetkisi açılamaz.
* `AUTO_MERGE = DISABLED` — Ana dallara (`main` / `staging`) otomatik birleştirme yasaktır.
* `NO_REMOTE_DB_WRITE = TRUE` — Uzak Supabase/Postgres veritabanına hiçbir yazma veya şema değişikliği yapılmaz.
* **GitHub Issue #10:** Bağımsız uzak PostgreSQL 17 felaket kurtarma ve geri yükleme doğrulaması tamamlanana kadar açık üretim blokeri olarak korunur.
* **Sıfır Bütçe & Sıfır Sızıntı:** Gerçek ödeme tahsilatı, canlı SMS/WhatsApp/E-posta gönderimi ve ücretli dış API çağrısı yapılmaz; hiçbir özel anahtar (`IYZICO_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, iletişim sırları) ön yüz koduna veya sürüm kontrolüne yazılmaz.

---

## 2. Canlı Anahtarlar ve Dış Sağlayıcılar Neden `EXTERNAL_HOLD` Durumundadır?

Canlı ödeme ve iletişim entegrasyonlarının kod sözleşmeleri (`SOURCE_READY`) tamamlanmış olsa da gerçek sağlayıcı anahtarlarının repo içinde tanımlanmaması ve canlı çağrıların kilitli tutulması dört zorunlu güvenlik ve yönetişim ilkesine dayanır:

1. **Sıfır Bütçe (0 TL Harcama) & Dış Ağ İzolasyonu:** Otonom geliştirme ve kabul kapıları gerçek kart çekimi, ücretli SMS/WhatsApp gönderimi, canlı SMTP/Resend trafiği veya ücretli API harcaması üretmeden deterministik yerel/offline doğrulamalarla çalışır.
2. **İstemci-Tarafı Güvenlik Sınırı (Zero Client Secret Exposure):** `services/paymentProvider.ts`, `services/paymentRunModeService.ts` ve `services/communicationProviderConfigService.ts` istemci kodunun hiçbir gizli anahtarı barındırmamasını ve `localStorage` / URL parametreleriyle (`?checkout=success`, `?checkout_simulate=true`, `internal_run_mode`) ödeme veya teslimat yetkisi üretememesini garanti eder.
3. **Üye İşyeri & Yasal Sağlayıcı Onayı Gereksinimi:** Canlı `iyzico` Abonelik API'si (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, plan referans kodları), e-Fatura/e-Arşiv entegratörü, Netgsm/Twilio SMS başlığı, Meta WhatsApp Cloud API şablonları ve `randevulari.com` SPF/DKIM/DMARC DNS kayıtları insan operatör ve üye işyeri sözleşme onaylarına bağlıdır.
4. **Üretim Blokeri (GitHub Issue #10):** Uzak PG17 geri yükleme ve fiziksel cloud staging kabulü tamamlanmadan canlı finansal işlem yetkilendirilemez (`PRODUCTION = NO_GO`).

---

## 3. `EXTERNAL_HOLD` Dış Bağımlılık ve Anahtar Envanteri

Aşağıdaki tüm dış kimlik bilgileri ve canlı sağlayıcı uçları `EXTERNAL_HOLD` olarak dondurulmuştur; yalnızca insan operatör tarafından Supabase Edge Function Secrets / altyapı katmanında sağlanabilir:

| Kalem / Sağlayıcı | Gerekli Ortam Değişkenleri / Sırlar | Mevcut Durum | Kod İçi Fail-Closed Davranış |
| :--- | :--- | :---: | :--- |
| **iyzico Canlı Sanal POS & Abonelik API** | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, `IYZICO_BASE_URL=https://api.iyzipay.com`, `IYZICO_PLAN_*_REF` | `EXTERNAL_HOLD` | `paymentProvider.ts` `PAYMENT_PROVIDER_NOT_CONFIGURED` döner; `paymentRunModeService` tarayıcıda `production_live` tahsilatını reddeder (`PRODUCTION_PAYMENT_UNAUTHORIZED`). |
| **iyzico Sandbox Canlı Ağ Provizyonu** | Sandbox `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com` | `EXTERNAL_HOLD` | `iyzicoClient.createSubscriptionCheckoutSession` dış ağ çağrılarını `IYZICO_CRYPTO_NOT_IMPLEMENTED` ile kilitler; `create-checkout-session` eksik ortamda `SANDBOX_NOT_CONFIGURED` döner. |
| **iyzico Webhook İmza Sırrı & Portal Kaydı** | `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, Edge URL `/functions/v1/payment-webhook` | `EXTERNAL_HOLD` | `verifyIyzicoSignatureV3` `x-iyz-signature-v3` HMAC-SHA256 doğrulamasını zorunlu kılar (`sandbox_bypass` kalıcı olarak silinmiştir). |
| **Canlı E-posta Sağlayıcısı (Resend / SMTP)** | `EMAIL_PROVIDER_MODE=disabled`, `RESEND_API_KEY` veya `SMTP_HOST/USER/PASSWORD`, DNS SPF/DKIM/DMARC | `EXTERNAL_HOLD` | `communicationProviderConfigService.isProviderActive` `false` döner; iletiler canlıya çıkmadan outbox katmanında kalır. |
| **Canlı SMS Sağlayıcısı (Netgsm / Twilio)** | `SMS_PROVIDER_MODE=disabled`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_USERNAME`, `SMS_PROVIDER_PASSWORD` | `EXTERNAL_HOLD` | `notificationService.sendBookingSms` yapılandırma olmadan `false` döner; sahte `sent` durumu üretilmez. |
| **Canlı WhatsApp Business Cloud API** | `WHATSAPP_PROVIDER_MODE=disabled`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `EXTERNAL_HOLD` | `communicationProviderConfigService` `NOT_CONFIGURED` bildirir; onaylı Meta şablonları dışında gönderim yapılmaz. |
| **Otomatik e-Fatura / e-Arşiv Adaptörü** | Entegratör API anahtarları (`efatura_adapter_unconfigured`) | `EXTERNAL_HOLD` | `businessProfileService.getInvoiceAdapterStatus` ve `issueInvoiceFailClosed` `SERVER_INVOICE_ADAPTER_REQUIRED` ile reddeder. |
| **Canlı Supabase Staging/Prod & PG17 Kurtarma** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (yalnız Edge/sunucu) | `EXTERNAL_HOLD` | `NO_REMOTE_DB_WRITE = TRUE`; **GitHub Issue #10** açık üretim blokeri olarak korunur. |
| **Canlı Gemini AI & Wildcard DNS/SSL** | `GEMINI_API_KEY` (sunucu tarafı), `*.randevulari.com` DNS/TLS | `EXTERNAL_HOLD` | `VITE_GEMINI_API_KEY` yasaklıdır; `.env.example` içinde yalnızca istemci-güvenli varsayılanlar tanımlıdır. |

---

## 4. V1-B `SOURCE_READY` Kapsam Envanteri (Faz B1–B4)

V1-B kaynak hazırlığı dört ardışık adım halinde mevcut V1 çekirdeğinin (`ADIM-001..026`) üzerine inşa edilmiştir:

| Faz / Adım | Kapsam ve Sorumluluk | Kanonik Modüller ve Semboller | Durum |
| :--- | :--- | :--- | :---: |
| **Faz B1 (`ADIM-027`)**<br>Commit: `59a5b854` | Sağlayıcı-bağımsız ödeme sözleşmeleri, deterministik çevrimdışı test sağlayıcısı, atomik webhook/iade durum makinesi, upgrade/downgrade/grace/mutabakat | `services/paymentProviderContract.ts`, `services/deterministicTestPaymentProvider.ts`, `services/paymentProvider.ts`, `services/subscriptionLifecycleService.ts` (`processVerifiedWebhook`, `processRefundWebhookEvent`, `reconcileSubscription`, `calculatePlanChange`, `applyDueScheduledPlanChange`, `evaluateGracePeriod`), `services/subscriptionService.ts`, `components/BillingTab.tsx` | `PASS` (Tamamlandı) |
| **Faz B2 (`ADIM-028`)**<br>Commit: `746fb3fa` | Ticari katalog & abonelik snapshot uygunluğu, fail-closed entitlement kapıları, TR VKN/TCKN vergi doğrulama & fatura adaptörü, ödeme modu güvenlik sözleşmeleri | `services/commercialCatalogService.ts` (`isCommercialSubscriptionSnapshotEligible`, `getMyCommercialEnforcementSnapshot`), `services/entitlementService.ts` (`createDenyAllEntitlements`, `_mapServerEntitlementsToPlanEntitlements`), `services/businessProfileService.ts` (`isValidTurkishVkn`, `isValidTurkishTckn`, `getInvoiceAdapterStatus`, `issueInvoiceFailClosed`), `services/paymentRunModeService.ts`, `services/paymentProviderConfigService.ts`, `services/superAdminCommercialAdapter.ts`, `components/BillingTab.tsx` (`verifyCheckoutWithServerSnapshot`) | `PASS` (Tamamlandı) |
| **Faz B3 (`ADIM-029`)**<br>Commit: `474a28c7` | V1-A `manual_active` işletmelerden çevrimiçi aboneliğe kayıpsız geçiş, rollback koruması, checkout-correlated `targetPlanId`/tutar/para birimi bağı, sentetik iptal webhook reddi | `services/manualProvisioningService.ts` (`initiateOnlineSubscriptionTransition`, `rollbackPendingCheckoutToManualActive`), `services/subscriptionLifecycleService.ts` (`prepareManualToOnlineCheckoutTransition`, `rollbackManualCheckoutToManualActive`), `services/commercialCatalogService.ts` | `PASS` (Tamamlandı) |
| **Faz B4 (`ADIM-030`)**<br>Aktif Adım | V1-B `SOURCE_READY` & `EXTERNAL_HOLD` paketinin belgelenmesi, `IYZICO_SANDBOX_SETUP.md` güvenlik hizalaması (`sandbox_bypass` kaldırılma uyumu), `.env*` gizli anahtar ve ticari paketleme denetimlerinin sertleştirilmesi | `docs/V1B_SOURCE_READY_REPORT.md`, `docs/IYZICO_SANDBOX_SETUP.md`, `scripts/check-payment-env.mjs`, `scripts/test-check-payment-env.mjs`, `scripts/verify-iyzico-sandbox-readiness.mjs`, `scripts/verify-commercial-packaging-readiness.mjs` | `SOURCE_READY` (Doğrulama Kapısında) |

### 4.1. Temel Güvenlik Değişmezleri (V1-B Kaynak Kodunda Doğrulanmış)
* **Webhook Güvenliği:** `supabase/functions/_shared/iyzicoClient.ts` içindeki `verifyIyzicoSignatureV3` yalnız `x-iyz-signature-v3` HMAC-SHA256 imzasını kabul eder; `sandbox_bypass` arka kapısı kalıcı olarak silinmiştir. `subscription.cancelled` ve `subscription.expired` gibi resmî sözleşmede olmayan sentetik public webhook olayları `PROVIDER_STATE_RECONCILIATION_REQUIRED` ile mutasyonsuz reddedilir.
* **İstemci Yönlendirme Bağışıklığı:** URL parametreleri (`?checkout=success`, `?checkout_simulate=true`) veya `localStorage` anahtarları (`internal_run_mode`) tek başına ücretli abonelik veya deneme süresi doğrulaması üretemez.
* **Sözleşmeli Plan & Deneme Modeli:** `services/planService.ts` ve `services/trialConfigService.ts` 5 planı (`baslangic`, `standart` [miras], `professional`, `premium`, `kurumsal`) ve kart doğrulamalı **14 günlük deneme süresi** (`trialDayCount: 14`, `requiresPaymentMethod: true`, `startsAfterCheckoutAuthorization: true`) modelini korur; Kurumsal paket self-servis checkout yerine satış görüşmesine (`talk_to_sales`) yönlendirilir.

---

## 5. Doğrulama Sınırı ve Test Kanıtları

Bu raporda **önceki tamamlanmış Faz B1–B3 adımlarının kabul kanıtları** ile **ADIM-030 (`loop.py` `TESTING` evresi) canlı doğrulama kapısı** birbirinden dürüstçe ayrılmıştır:

### 5.1. Önceki Faz B1–B3 Tamamlanmış Doğrulama Paketleri (Tarihsel Kabul Kanıtları — `ADIM-027..029`)
Aşağıdaki test paketleri `ADIM-027`, `ADIM-028` ve `ADIM-029` adımlarında `PASS` olarak mühürlenmiş olup `ADIM-030` `loop.py` kapısı tarafından yeniden koşulmamaktadır:
* `ADIM-027` (`59a5b854`): `node scripts/verify-subscription-lifecycle-integrity.mjs`, `node scripts/test-webhook-idempotency.mjs`
* `ADIM-028` (`746fb3fa`): `node scripts/test-commercial-eligibility-enforcement.mjs`, `node scripts/test-iyzico-webhook-signature.mjs`, `node scripts/verify-payment-mode-safety.mjs`
* `ADIM-029` (`474a28c7`): `node scripts/test-commercial-legacy-compatibility.mjs`, `node scripts/test-manual-to-subscription-transition.mjs`, `npm run qa:subscription-lifecycle-integrity`

### 5.2. `ADIM-030` Doğrulama Kapısı Komutları (`loop.py` `TESTING` Evresi)
`ADIM-030` kapsamında çalıştırılacak kanonik doğrulamalar (`loop.py` tarafından senkron olarak yürütülür ve sonuçları adım kaydına işlenir):
1. `npx tsc --noEmit` — TypeScript statik tip kontrolü.
2. `node scripts/check-payment-env.mjs` — `.env*` / `.env.example` dosyaları ile çalışma zamanı ortamında canlı ödeme/iletişim/Supabase `service_role` sırrı ve `VITE_` ön ekli gizli anahtar bulunmadığının doğrulanması.
3. `node scripts/scan-frontend-secrets.mjs` — İstemci kaynak kodunda (`components/`, `pages/`, `services/`, `src/`) yasaklı sunucu sırlarının (`IYZICO_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_IYZICO_SECRET_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_GEMINI_API_KEY`) sıfır olduğunun doğrulanması.
4. `node scripts/verify-commercial-packaging-readiness.mjs` — 5 ticari plan, özellik kapıları, Kurumsal satış yönlendirmesi, manuel/çevrimdışı lisans görünürlüğü, 14 günlük deneme, `V1B_SOURCE_READY_REPORT.md` varlık/karar kontrolleri ile birlikte `node scripts/test-check-payment-env.mjs` (`.env`, `.env.test`, `.env.development.local` negatif sızıntı testleri) ve `node scripts/verify-iyzico-sandbox-readiness.mjs` alt-kapılarının yürütülmesi.
5. Bağımsız alt-kapı komutları: `node scripts/test-check-payment-env.mjs` ve `node scripts/verify-iyzico-sandbox-readiness.mjs`.

---

## 6. Canlıya Geçiş Öncesi Operatör Önkoşulları (`EXTERNAL_HOLD` Kaldırma Kontrol Listesi)

İnsan operatör canlı veya gerçek sandbox testine geçmek istediğinde aşağıdaki adımlar sırayla tamamlanmalıdır (kod içindeki fail-closed sınırları gevşetilmeden):

1. **PostgreSQL 17 & Cloud Staging Onayı:** **GitHub Issue #10** kapatılmalı ve uzak staging/restorasyon kabulü `PASS` olmalıdır.
2. **Supabase Edge Secrets Ataması:** `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, `IYZICO_BASE_URL`, `IYZICO_PLAN_*_REF`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` yalnız `supabase secrets set` ile sunucu ortamına girilmelidir (`docs/IYZICO_SANDBOX_SETUP.md`).
3. **Webhook & Edge Dağıtımı:** `payment-webhook`, `create-checkout-session`, `subscription-sync`, `payment-health` Edge Function'ları dağıtılmalı ve iyzico panelinde `/functions/v1/payment-webhook` HMAC-SHA256 (`x-iyz-signature-v3`) doğrulanmalıdır.
4. **İletişim ve e-Fatura Sağlayıcıları:** `RESEND_API_KEY` / SMTP, Netgsm/Twilio, Meta WhatsApp Cloud API ve e-Fatura entegratör sırları yalnız sunucu tarafında tanımlanmalı, `randevulari.com` DNS kayıtları (SPF/DKIM/DMARC, wildcard TLS) aktif edilmelidir.
5. **Açık İnsan Onayı:** `PRODUCTION = NO_GO` kararı yalnız operatörün açık yayın onayı ile kaldırılabilir.
