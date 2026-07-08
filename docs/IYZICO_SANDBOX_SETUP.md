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

- `IYZICO_API_KEY`: Your iyzico Sandbox API Key
- `IYZICO_SECRET_KEY`: Your iyzico Sandbox Secret Key
- `IYZICO_BASE_URL=https://sandbox-api.iyzipay.com`
- `IYZICO_PLAN_STARTER_REF`
- `IYZICO_PLAN_PROFESSIONAL_REF`
- `IYZICO_PLAN_PREMIUM_REF`
- `IYZICO_WEBHOOK_VERIFY_MODE=sandbox_bypass` (only for sandbox testing)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> **Important:**
> `SUPABASE_SERVICE_ROLE_KEY` must only be used inside Edge Functions.
> iyzico keys must never appear in VITE frontend env variables.

## 3. Deploying Edge Functions
Use the Supabase CLI to deploy:
```bash
supabase functions deploy payment-health
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal-session
supabase functions deploy payment-webhook
```

## 4. Webhook Configuration
In the iyzico Sandbox Panel, configure your **Subscription Webhook URL** to point to your deployed Edge Function:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`

Ensure webhook events are enabled.

## 5. Local App Configuration
Ensure your `.env` contains:
```env
VITE_DATA_MODE=supabase
VITE_PAYMENT_PROVIDER=iyzico
```

## 6. Testing the Flow
1. Run the app locally.
2. Go to the **Admin > Abonelik (Billing)** tab.
3. Click "Bu Plana Geç" / Upgrade for a plan.
4. Verify the `create-checkout-session` Edge Function returns a valid, sandbox-linked Checkout URL.
5. In the mock/sandbox checkout window, enter test card details provided by iyzico.
6. Submit the payment.
7. Verify that iyzico posts a Webhook event to `payment-webhook`.
8. Verify that `payment-webhook` correctly parses the payload, validates the signature, and updates the `subscriptions` and `payments` tables via the Service Role key.
9. Verify that a successful subscription triggers the tenant onboarding/provisioning state transition.
