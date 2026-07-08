# Super Admin Go-Live Readiness Console

The "Sandbox ve Yayın Hazırlığı" (Go-Live Readiness) console is an internal diagnostics dashboard for Super Admins. It visualizes the current deployment status, QA checklist completeness, and required configurations necessary for processing payments.

## Features & Purpose

### 1. Centralized Security Feedback
Before testing the integration with real or sandbox cards, you must verify the infrastructure is ready. The console brings static file indicators and runtime config to a single UI so developers don't have to repeatedly run scripts. 

### 2. Required Fields Checklist
The dashboard specifically verifies:
- `IYZICO_API_KEY`
- `IYZICO_SECRET_KEY`
- `IYZICO_BASE_URL`
- `PUBLIC_APP_URL`
- Supabase Edge Functions deployment targets

### 3. Plan Reference Readiness
LARİ plans (`Starter`, `Professional`, `Premium`) need corresponding references mapped to the Iyzico Sandbox environment to successfully negotiate checkout sessions through edge functions. The console asserts whether these mappings are defined in the environment.

### 4. Pilot Notification Previews
The console displays the complete set of notification templates (email, WhatsApp, in-app) loaded directly from the `NotificationTemplateService`. It verifies that the required copy for trial states and sandbox limitations are present.

## What it DOES NOT do
- **It does not collect or store credentials in the browser.** There are no input fields. Real keys and secrets must be set through Supabase secrets / backend deployment process only. The Super Admin Console only visualizes readiness status and setup instructions.
- **It does not expose real API keys.** It only checks for variable presence or shows placeholders.
- **It does not fix the issues automatically.** You must still use the `supabase secrets set` command line tools to deploy values.
- **It does not perform real test purchases.** Human verification using test cards is still necessary.

## Güvenlik Prensipleri
- **Canlı ve Sandbox Değerleri:** Gerçek iyzico anahtarları yalnızca Supabase Edge Function secret ortamında (`supabase secrets set` ile) kullanılmalıdır.
- **Sıfır İletim:** Bu ekran yalnızca kurulum durumunu ve eksikleri gösterir; gizli anahtar değerlerini almaz, saklamaz veya internete iletmez.
- **Supabase secrets üzerinden tanımlanmalı:** Güvenlik gereği her ortam değişkeni doğrudan veritabanı / container katmanından beslenir.

## Internal Routing
The console is located at `/super-admin/go-live` and is strictly isolated from customer routes.

## Corresponding Scripts
This visual console is backed by local checks which are also available programmatically through:
- `npm run qa:all`
- `npm run qa:sandbox-readiness`
- `npm run qa:product-flow`
