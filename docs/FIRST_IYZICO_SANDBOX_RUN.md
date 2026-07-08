# First Iyzico Sandbox Run

This document is the precise, step-by-step “First Real Sandbox Payment Run” execution package. It guides you through the process from setting up the environment to verifying the first successful sandbox checkout.

## A. Prerequisites
- **Supabase Project:** Created and linked to the LARİ repository.
- **Supabase CLI:** Installed and logged in (`supabase login`).
- **Edge Functions:** Ready in `supabase/functions` (create-checkout-session, payment-webhook, subscription-sync).
- **Iyzico Sandbox Account:** Created and accessible (`sandbox-api.iyzipay.com`).
- **Iyzico Subscription Products:** Created in the Sandbox interface.
- **Payment Plans:** Starter, Professional, and Premium plans are created with **14-day trials**.
- **Callback / Webhook URLs:** You know the public URLs of your deployed Edge Functions.
- **Signature V3:** Enable Signature V3 for webhooks in the Iyzico developer settings, if required.

## B. Deploy Edge Functions
Use the Supabase CLI to deploy the requisite functions. Do not execute these with live keys; simply deploy the endpoints.

```bash
supabase functions deploy create-checkout-session
supabase functions deploy payment-webhook
supabase functions deploy subscription-sync
```

## C. Set Supabase Secrets
Store the API keys securely in Supabase. **WARNING: Never paste these secrets into the frontend UI or commit them to the repository.**

```bash
supabase secrets set IYZICO_API_KEY="..."
supabase secrets set IYZICO_SECRET_KEY="..."
supabase secrets set IYZICO_BASE_URL="https://sandbox-api.iyzipay.com"
supabase secrets set IYZICO_CALLBACK_URL="https://<project-ref>.supabase.co/functions/v1/payment-webhook?type=callback"
supabase secrets set PUBLIC_APP_URL="https://<your-frontend-deployment-url>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

## D. Map Plan Reference Codes
Map the Iyzico Sandbox product and plan reference codes in your `.env` (excluding secrets) or within the `create-checkout-session` edge function's managed config.

- Starter Product Ref Code: (e.g. `prod_sandbox_starter`)
- Starter Pricing Plan Ref Code: (e.g. `plan_sandbox_starter`)
- Professional Product Ref Code: (e.g. `prod_sandbox_pro`)
- Professional Pricing Plan Ref Code: (e.g. `plan_sandbox_pro`)
- Premium Product Ref Code: (e.g. `prod_sandbox_premium`)
- Premium Pricing Plan Ref Code: (e.g. `plan_sandbox_premium`)

## E. Configure Callback / Webhook
- **Expected Callback Function URL:** `https://<project-ref>.supabase.co/functions/v1/payment-webhook?type=callback`
- **Expected Webhook Function URL:** `https://<project-ref>.supabase.co/functions/v1/payment-webhook?type=webhook`
- HTTPS is strictly required. 
- Ensure that you expect the `x-iyzi-signature` header for signature verification.

## F. Switch to Sandbox Live Mode
The platform requires a specific flag to ensure real sandbox API calls are made rather than local mocks.
To enable Sandbox Live mode:
- Set `VITE_PAYMENT_RUN_MODE=sandbox_live` in your `.env` and rebuild the frontend, OR
- Via internal UI state logic (Super Admin Go-Live Console) if local configuration overrides are permitted. (Current safe control path depends on environment initialization).

## G. Run Checkout
1. Navigate to `/pricing`.
2. Select the **Professional** plan (starts 14-day trial).
3. Complete the `/register` onboarding flow.
4. Verify that the checkout handoff correctly maps your `tenantId` and `planId`.
5. Enter test card details on the internal/redirected Iyzico sandbox checkout page.
6. Return to the `/admin/billing` portal via callback.

## H. Verify State
- **Admin Billing:** Shows `trialing` or the correct subscription state.
- **Trial Length:** Verified to be exactly 14 days.
- **Super Admin Payments:** Shows a recorded payment event.
- **Super Admin Subscriptions:** Displays the active tenant subscription.
- **Webhooks:** Ensure the initial webhook event is logged and processed.
- **Idempotency:** Re-triggering the identical webhook signature correctly skips duplicate processing.

## I. Failure Tests
Validate edge cases:
- Cancelled checkout flow.
- Failed payment (e.g., using Iyzico reject test cards).
- Invalid webhook signature (should reject with standard 401).
- Missing signature header.

## J. Rollback & Reset
If needed to test again cleanly:
1. Switch back to your `local_dry_run` configuration.
2. Clear frontend state strings / mock records.
3. Review Supabase Function execution logs.
4. Rotate `IYZICO` API secrets if accidental exposure occurred.
