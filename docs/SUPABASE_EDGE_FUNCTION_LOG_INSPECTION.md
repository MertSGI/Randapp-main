# Supabase Edge Function Log Inspection

This guide details how to inspect and analyze Supabase Edge Function logs during sandbox and production payment tests.

## How to Inspect Logs

1. Navigate to your Supabase Project Dashboard.
2. Go to **Edge Functions** in the left sidebar.
3. Select the specific function (e.g., `create-checkout-session`, `payment-webhook`, `subscription-sync`).
4. Click on the **Logs** tab.

Alternatively, use the Supabase CLI to tail logs locally:
```bash
supabase functions serve --env-file .env.local
```
Or view remote logs:
```bash
supabase functions logs payment-webhook
```

## What to Look For

### 1. `create-checkout-session`
- **Expected:** Log entries showing successful session generation, mapping of `tenantId` and `planId`.
- **Validation:** Check that product reference codes exist.
- **Failures:** Look for `API Error`, missing secrets, or missing payload fields.

### 2. `payment-webhook`
- **Expected:** Log indicating webhook received, signature validated, and event successfully routed.
- **Identify Invalid Signature:** Look for `Signature mismatch` or `401 Unauthorized` logs. This means `x-iyzi-signature` did not match the computed HMAC.
- **Identify Duplicate Webhook:** Look for logs stating `Event already processed` or `Idempotency key exists`.
- **Identify Callback:** Logs specifying `type=callback` if your endpoint handles both, noting successful redirection.

### 3. `subscription-sync`
- **Expected:** Log indicating successful table updates for `tenants` and `subscriptions`.
- **Validation:** Look for `Status updated to trialing` or correct trial date calculations.
- **Failures:** Look for `Record not found` or `Database constraint violation`.

## Security Rules for Logging

**Never log these fields:**
- `IYZICO_API_KEY`
- `IYZICO_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Raw credit card PANs, CVV, or Expiry.
- Full Authorization headers.

**Safe metadata to log:**
- `tenantId`
- `planId`
- `referenceCode` (from Iyzico)
- `conversationId`
- `token` (checkout session token)
- `status` (e.g., 'success', 'failure')
- Calculated HMAC signature string (for debugging mismatch against the header).
