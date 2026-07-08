# Subscription QA Checklist

LARİ's fully aligned subscription model supports eight canonical states, verified through this thorough, human-tested QA checklist.

---

## 1. Owner Admin Panel (Billing Tab)

- [x] **Active Status Rendering**: Select `active`. Verify a green badge labeled "Aktif Abonelik (Güvende)" is rendered.
- [x] **Trialing Status Rendering**: Select `trialing`. Verify a blue badge labeled "14 Günlük Deneme Aktif" with its expiration date rendered.
- [x] **Card Verification Pending (`pending_checkout`)**: Verify an amber card stating "Kart Doğrulaması Bekleniyor" renders, containing a "Kart Doğrulama Adımına Git" button.
- [x] **Super Admin Overrides (`manual_active` & `comped`)**:
  - `manual_active`: Verify indigo badge labeled "Manuel Olarak Aktif Edildi" with lock prefix.
  - `comped`: Verify purple badge labeled "Hediye / Pilot İstisnası" with gift prefix.
- [x] **Past Due Enforcements**: Select `past_due`. Verify a rose badge warning. Ensure the owner can still configure their billing, but booking locks are active.
- [x] **Interactive Action Handlers**:
  - **Freeze Booking (`handlePause`)**: Clicking "Rezervasyonu Geçici Durdur" immediately sets the local status to `paused` with clear alert feedback.
  - **Resume Booking (`handleResume`)**: Clicking "Sayfayı Yayına Al" immediately sets the status to `active` with success notification.
  - **Schedule Cancellation (`handleCancelAtPeriodEnd`)**: Clicking "Dönem Sonunda İptal Et" schedules graceful termination, displaying the cancel-at-period-end orange banner.
  - **Immediate Deactivation (`handleCancelImmediately`)**: Clicking "Hemen Sonlandır" immediately deactivates the package features.
- [x] **Mock Checkout & Portal**: Verify confirming in the `CheckoutPreviewModal` starts the 14-day trial and moves the merchant’s plan instantly.

---

## 2. Public Booking Component (`goLiveService.ts` and `BookingPage`)

- [x] **Active Page Delivery**: Ensure standard Active, Trialing, Manual Active, and Comped subscription records load the step views flawlessly.
- [x] **Owner Temporary Freeze (`paused`)**: Change status to `paused`. Accessing the booking URL must block layout with: "İşletme sahibi online randevu kabulünü geçici olarak durdurmuştur."
- [x] **Administrative Suspension (`suspended`)**: Change status to `suspended`. Accessing the booking page must block layout with: "Bu salonun üyeliği geçici olarak askıya alınmıştır."
- [x] **Fallback Block (`expired`, `cancelled`, `pending_checkout`)**: Ensure any non-operational status shows a clean block notice: "Bu salonun online randevu sistemi geçici olarak kullanılamıyor. Lütfen ödeme veya deneme adımını tamamlayın."

---

## 3. Backend & Operations

- [x] **Incentives and Discounts Ledger**: Verify that `referralCredits` and discount values (e.g. `%15 İndirim`) display detailed cards in the billing UI when populated.
- [x] **No-Secrets Compliance**: No production client credentials or iyzico private API keys are processed on frontend code. All actions proxy safe parameters.
- [x] **Automation Test Script**: Run `npm run qa:subscription-lifecycle` and ensure it logs successful verifications.
