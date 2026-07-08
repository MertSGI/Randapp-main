# iyzico Sandbox Payment Rehearsal Guide

This runbook defines the procedural boundaries, execution steps, and testing mechanics for performing a **safe sandbox payment rehearsal** for LARİ, verifying checkout session handoff, 14-day trials, webhook callbacks, and subscription provisioning without activating live payments.

---

## 1. Safety Boundaries & Guardrails

To prevent accidental public launches or sensitive leakage of real cards/keys:
*   **Default Fallback**: The LARİ platform defaults to `local_dry_run` mode in `/services/paymentRunModeService.ts` whenever live keys or sandbox environments are missing.
*   **Exclusion of Secrets**: Do NOT commit any real iyzico sandbox API keys or webhook secrets to the version control repository. Set secrets securely in Supabase using the CLI: `supabase secrets set --env-file supabase/functions/.env.production`.
*   **Frontend Isolation**: All API calls that require authorization headers or the `IYZICO_SECRET_KEY` are strictly isolated inside **Supabase Edge Functions** (server-side). The React frontend communicates strictly with edge functions via authenticated user tokens or public checkout URLs.
*   **Trial Period Safeguards**: Ensure customer plans are mapped to a **14-day trial period** where card validation is performed but zero TRY is collected immediately, adhering strictly to LARİ's standardized SaaS model.

---

## 2. Sandbox Setup & Prerequisites

Before initiating a rehearsal, ensure the following parameters are mapped in the sandbox environment:

1.  **Iyzico Merchant Portal (Sandbox)**
    *   Log in to the iyzico sandbox dashboard (`https://sandbox-merchant.iyzipay.com`).
    *   Navigate to **Product/Service Management** -> **Subscription Management** and ensure the product and pricing plan mapping matching LARI plans are created:
        *   `baslangic` (TRY 1,490 / month)
        *   `standart` (TRY 2,490 / month)
        *   `professional` (TRY 3,490 / month)
        *   `premium` (TRY 4,990 / month)
    *   Note the generated subscription pricing plan reference codes (e.g. `ref_baslangic_m`).

2.  **Supabase Edge Functions Configuration**
    Use the Supabase CLI to configure secrets inside your Edge Functions container:
    ```bash
    supabase secrets set \
      IYZICO_API_KEY="sandbox-api-key-here" \
      IYZICO_SECRET_KEY="sandbox-secret-key-here" \
      IYZICO_BASE_URL="https://sandbox-api.iyzipay.com" \
      SUPABASE_URL="https://your-project.supabase.co" \
      SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
      IYZICO_WEBHOOK_VERIFY_MODE="sandbox"
    ```

3.  **Local Testing Backdoor (Bypass Mode for Local Host)**
    During early local dev stages where the webhook cannot reach localhost directly, you can enable `IYZICO_WEBHOOK_VERIFY_MODE="sandbox_bypass"`. This permits simulating verified events via standard tools (e.g. Thunder Client or cURL) without failing the `x-iyz-signature-v3` HMAC-SHA256 health check.

---

## 3. Step-by-Step Payment Checkout Rehearsal

### Step 3.1: Start Checkout Session
1. Log in to the LARİ Admin Console.
2. Navigate to **Abonelik ve Fatura (Billing)**.
3. Select a plans tier, e.g. **Profesyonel**, and click **14 Gün Ücretsiz Başla (Start Trial)**.
4. The system triggers `startCheckout()` and invokes the backend Edge Function `create-checkout-session`.
5. If in `sandbox_live` run mode, you are securely redirected to the external iyzico sandbox hosting checkout checkout form page (`https://sandbox-api.iyzipay.com/v2/subscription/checkoutform/...`).

### Step 3.2: Enter Test Card Information
During the rehearsal stage, **ONLY** use official iyzico test cards. Never enter real credit cards.

**Official Test Card Numbers (Turkey Mock Merchant Profile):**
*   **3D Secure Success (Bypass PIN `123456`)**:
    *   Card Number: `4355 0800 0000 0001`
    *   Expiration: `12 / 2030`
    *   CVC: `123`
*   **Direct Success (No 3D)**:
    *   Card Number: `4355 0800 0000 0002`
    *   Expiration: `12 / 2030`
    *   CVC: `123`
*   **Insufficient Funds Failure**:
    *   Card Number: `4355 0800 0000 0003` (Simulates failure during checkout or trial renewal).

### Step 3.3: Complete iyzico 3D Secure Screen
If using the 3D secure test card, you will be redirected to the mock bank security authorization screen. Enter `123456` as the SMS validation code and confirm.

### Step 3.4: Parse Callback Handshake
Upon successful registration of the subscription plan into the iyzico database, the user is redirected back to LARI:
*   `successUrl`: `/#/admin?tab=kurulum&checkout=success`
*   The `BillingTab` catches the URL status parameters and displays a notification: *"Ödemeniz başarıyla doğrulanıyor... Hesabınız aktive ediliyor."*

---

## 4. Webhook and Sync Verification

Because clients might close their browser window before the callback triggers, the ultimate source of truth is the **iyzico Webhook listener** (`payment-webhook` Edge Function).

1.  **Deliver Event Ping**
    *   Iyzico sandbox triggers a `POST` request to LARI's HTTPS Edge Function endpoint `/functions/v1/payment-webhook` with the header `x-iyz-signature-v3`.
2.  **Signature Parsing Logic**
    *   The webhook endpoint parses the payload to determine subscription metadata.
    *   If signature verification passes, it updates the `subscriptions` table.
3.  **Audit Log Logging**
    *   The endpoint logs the raw transaction with an idempotency key `providerEventId` inside the `audit_logs` table to guarantee zero double-charging or duplicate provisioning actions.

---

## 5. Summary Dashboard Verification

Verify that the following indicators are checked in the Admin console:
*   Subscription status displays `trialing`.
*   The billing period accurately highlights the 14-day trial end date.
*   Feature gates are unlocked according to the plan entitlement matrix (e.g. Website Publication, AI quota metrics, or Branch options).
*   Any manual bypass operations can still override subscription locks cleanly in local development.
