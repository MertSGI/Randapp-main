# iyzico Sandbox Setup & Edge Function Testing

This guide details how to configure the iyzico sandbox environment and test the subscription flow safely via Supabase Edge Functions without exposing secrets to the frontend.

## 1. Required iyzico Sandbox Setup

- [ ] Sandbox merchant account
- [ ] Subscription product created
- [ ] Starter payment plan created
- [ ] Professional payment plan created
- [ ] Premium payment plan created
- [ ] Plan reference codes copied
- [ ] Webhook HTTPS URL configured in iyzico merchant portal

## 2. Required Supabase Secrets

The frontend must never contain payment provider secret keys. All of these credentials must be added to your Supabase project as Edge Function secrets.

- `IYZICO_API_KEY`: Your iyzico Sandbox API Key (`EXTERNAL_HOLD` until operator provisioning)
- `IYZICO_SECRET_KEY`: Your iyzico Sandbox Secret Key (`EXTERNAL_HOLD` until operator provisioning)
- `IYZICO_MERCHANT_ID`: Your iyzico Merchant ID (required by `payment-webhook` HMAC-SHA256 verification)
- `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com`
- `IYZICO_PLAN_STARTER_REF`
- `IYZICO_PLAN_PROFESSIONAL_REF`
- `IYZICO_PLAN_PREMIUM_REF`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> **Important Security Boundaries:**
> `SUPABASE_SERVICE_ROLE_KEY` and `IYZICO_SECRET_KEY` must only be used inside Edge Functions.
> iyzico secret keys must never appear in `VITE_*` frontend env variables or committed `.env*` files.
> `sandbox_bypass` has been **permanently removed** from `supabase/functions/_shared/iyzicoClient.ts`: `payment-webhook` always enforces fail-closed `x-iyz-signature-v3` HMAC-SHA256 verification.

## 3. Deploying Edge Functions
Use the Supabase CLI to deploy:
```bash
supabase functions deploy payment-health
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal-session
supabase functions deploy payment-webhook
supabase functions deploy subscription-sync
```

## 4. Webhook Configuration
In the iyzico Sandbox Panel, configure your **Subscription Webhook URL** to point to your deployed Edge Function:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`

Ensure webhook events are enabled and signed with `x-iyz-signature-v3`.

## 5. Local App Configuration
In default V1-B `SOURCE_READY` pre-live state (zero spend, `EXTERNAL_HOLD`), `.env.example` keeps `VITE_PAYMENT_RUN_MODE=local_dry_run` and `VITE_PAYMENT_MODE=disabled`.
When an operator explicitly prepares a sandbox staging rehearsal (after setting Supabase Edge Function secrets):
```env
VITE_DATA_MODE=supabase_staging
VITE_PAYMENT_MODE=iyzico_sandbox
VITE_PAYMENT_RUN_MODE=sandbox_live
VITE_PAYMENT_PROVIDER=iyzico
```

## 6. Testing the Flow
> Note: By default (`0 TL` / `EXTERNAL_HOLD` policy), `iyzicoClient.createSubscriptionCheckoutSession` fails closed with `IYZICO_CRYPTO_NOT_IMPLEMENTED` and `create-checkout-session` returns `SANDBOX_NOT_CONFIGURED` until live sandbox credentials and operator authorization are provided. Use `services/deterministicTestPaymentProvider.ts` and `npm run qa:payment-mode-safety` for zero-cost offline rehearsal.

1. Run the app locally.
2. Go to the **Admin > Abonelik (Billing)** tab.
3. Click "Bu Plana Geç" / Upgrade for a plan.
4. Verify the `create-checkout-session` Edge Function returns a valid, sandbox-linked Checkout URL (or `SANDBOX_NOT_CONFIGURED` while `EXTERNAL_HOLD`).
5. In the sandbox checkout window, enter official test card details provided by iyzico.
6. Submit the payment.
7. Verify that iyzico posts a signed (`x-iyz-signature-v3`) Webhook event to `payment-webhook`.
8. Verify that `payment-webhook` validates the HMAC-SHA256 signature, checks idempotency (`payment_webhook_idempotency`), and updates `subscriptions` / `payments` atomically via Service Role RPC.
9. Verify that a successful subscription triggers the tenant onboarding/provisioning state transition only after server-verified payment proof.
