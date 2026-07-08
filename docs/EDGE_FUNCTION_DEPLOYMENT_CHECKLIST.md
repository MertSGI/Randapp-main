# Edge Function Deployment Checklist

Follow this checklist to deploy the Supabase Edge Functions for handling iyzico subscripton payments securely.

## Prerequisites

1. Ensure the Supabase CLI is installed and configured.
2. Ensure you have linked your project:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

## 1. Set Secrets

Set the required secrets in Supabase before deploying the functions so they have the proper runtime environment.

```bash
supabase secrets set IYZICO_API_KEY=your_sandbox_api_key
supabase secrets set IYZICO_SECRET_KEY=your_sandbox_secret_key
supabase secrets set IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
supabase secrets set IYZICO_PLAN_STARTER_REF=your_starter_ref_code
supabase secrets set IYZICO_PLAN_PROFESSIONAL_REF=your_professional_ref_code
supabase secrets set IYZICO_PLAN_PREMIUM_REF=your_premium_ref_code
supabase secrets set IYZICO_WEBHOOK_VERIFY_MODE=sandbox_bypass
```

*Note:* `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected into Edge Functions by Supabase.

## 2. Deploy Functions

Deploy the three payment handling edge functions:

```bash
supabase functions deploy payment-health
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal-session
supabase functions deploy payment-webhook
```

## 3. Verify Configuration

1. Open `/#/super-admin/payment-test` in the browser as a `super_admin`.
2. Click **Run Health Check**.
3. Verify that all secret-related properties (e.g. `apiKeyConfigured`, `secretKeyConfigured`) return `true`. *No actual secret values should be displayed.*
4. Ensure `IYZICO_WEBHOOK_VERIFY_MODE=sandbox_bypass` is ONLY used for sandbox environments, and never in production.

## 4. Function Responsibilities

- **`create-checkout-session`**: Receives a `planId` and `tenantId` from an authenticated user. Generates an iyzico checkout/subscription session URL, and returns `checkoutUrl` to the frontend.
- **`payment-webhook`**: Receives an event payload directly from iyzico servers whenever a payment layout completes. **This is the only source of truth.** It updates the `subscriptions` and `payments` tables only after verifying the iyzico signature.
- **`create-billing-portal-session`**: Used for management (cancellation, updates) using iyzico APIs directly.

> **CRITICAL FLOW GUIDANCE:** The frontend success callback (reached after the user completes payment and is redirected) **must not** activate the subscription locally or trust the URL parameters. Provisioning must start only after the verified webhook updates the database!
