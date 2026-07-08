# Edge Function Contracts

The following documents the planned Supabase Edge Functions for LARİ production. 
All functions are isolated and securely hold secrets like `GEMINI_API_KEY` and `IYZICO_API_KEY`.

## 1. create-checkout-session
* **Path**: `/functions/v1/create-checkout-session`
* **Input Payload**: `tenantId`, `planId`, `billingCycle`, `successUrl`, `cancelUrl`, `diagnostic?`
* **Output Payload**: `{ checkoutUrl: string }` or `{ mode: 'diagnostic', requiredEnvPresent: {} }`
* **Auth Requirement**: Authenticated Salon Admin
* **Secrets Required**: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* **Side Effects**: Reads server-side plan configs (price, Iyzico provider codes). Creates an iyzico subscription checkout request in sandbox/production. Logs to `audit_logs`.
* **Important Guidelines**: 
  - Supports `diagnostic: true` parameter for safe integration readiness checks (Phase 9 test harness).
  - Price and reference codes must be evaluated server-side.
  - In a real iyzico subscription flow, trial plans are configured directly in provider via product/plan endpoints.
  - Randapp frontend NEVER signs iyzico requests directly or stores checkout keys.

## 2. payment-webhook
* **Path**: `/functions/v1/payment-webhook`
* **Input Payload**: Iyzico generic event payload or `{"diagnostic": true}`.
* **Output Payload**: HTTP 200 or diagnostic JSON.
* **Auth Requirement**: Iyzico Signature Verification (`x-iyzico-signature`)
* **Secrets Required**: `IYZICO_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
* **Side Effects**: Inserts into `payments`, safely updates `subscriptions` status natively (idempotent).
* **Webhook State Mapping (Phase 9)**:
  - `subscription.trial.created` -> `trialing`
  - `subscription.activated` -> `active`
  - `subscription.payment.success` -> `active`
  - `subscription.payment.failed` -> `payment_failed`
  - `subscription.canceled` -> `cancelled`
  - `subscription.expired` -> `expired`

## 3. subscription-sync
* **Path**: `/functions/v1/subscription-sync`
* **Input Payload**: `tenantId` (optional for bulk job) or `{"diagnostic": true}`
* **Output Payload**: `{ status: "synced" }` or diagnostic JSON.
* **Auth Requirement**: System cron or diagnostic flag matching.
* **Secrets Required**: `IYZICO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
* **Side Effects**: Polls iyzico API to reconcile out-of-sync subscriptions.

## 4. ai-recommendation
* **Path**: `/functions/v1/ai-recommendation`
* **Input Payload**: `tenantId`, `prompt`, `imageBase64` (Optional)
* **Output Payload**: `{ text: "..." }`
* **Auth Requirement**: Valid tenant constraints, validated `aiMonthlyQuota`.
* **Secrets Required**: `GEMINI_API_KEY`
* **Side Effects**: Triggers `ai_usage` increment, logs to `audit_logs`.
* **Mock Fallback**: Safe mock string if no API key is set.

## 4. ai-visualization
* **Path**: `/functions/v1/ai-visualization`
* **Input Payload**: `tenantId`, `prompt`, `imageBase64`
* **Output Payload**: `{ image: "..." }`
* **Auth Requirement**: Valid tenant constraints, validated `aiVisualizationEnabled`.
* **Secrets Required**: `GEMINI_API_KEY` (or AI Provider Key)
* **Side Effects**: Triggers `ai_usage` increment, logs to `audit_logs`.

## 5. cancel-appointment
* **Path**: `/functions/v1/cancel-appointment`
* **Input Payload**: `appointmentId`, `cancelReason`
* **Auth Requirement**: Valid customer session or valid salon admin token.
* **Side Effects**: Updates `appointments` status, verifies cancellation window rules.

## 6. customer-portal-auth
* **Path**: `/functions/v1/customer-portal-auth`
* **Input Payload**: `phone` or `email`, OTP
* **Side Effects**: Mints a session JWT for customer profile access mapping to Supabase Auth.
