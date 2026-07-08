# Supabase Edge Function Deployment

This document explains how to deploy the payment and subscription Edge Functions to your Supabase project.

## Prerequisites

1.  Supabase CLI installed (`npm install -g supabase` or via Brew/Scoop).
2.  Authenticated session (`supabase login`).
3.  Linked project:
    ```bash
    supabase link --project-ref <your-project-ref>
    ```

## 1. Deploy Functions

Deploy the three necessary functions for the payment flow:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy payment-webhook
supabase functions deploy subscription-sync
```

*(You can also use `supabase functions deploy` without arguments to deploy all functions in the `supabase/functions` directory).*

## 2. Set Secrets

The Edge Functions require environment variables (secrets) to operate securely. 
**NEVER commit these to your repository.** 
Run the following commands using your actual credentials:

```bash
supabase secrets set IYZICO_API_KEY="your-iyzico-api-key"
supabase secrets set IYZICO_SECRET_KEY="your-iyzico-secret-key"
supabase secrets set IYZICO_BASE_URL="https://sandbox-api.iyzipay.com"
supabase secrets set PUBLIC_APP_URL="https://your-frontend-domain.com"
supabase secrets set IYZICO_WEBHOOK_VERIFY_MODE="" # Leave empty for strict production verification
```

*Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected into Edge Functions by Supabase.*

## 3. Verify Deployment

1.  Go to the Supabase Dashboard -> Edge Functions.
2.  Verify that `create-checkout-session`, `payment-webhook`, and `subscription-sync` are active.
3.  Note the URL for `payment-webhook` (e.g., `https://<your-project-ref>.supabase.co/functions/v1/payment-webhook`).

## 4. Iyzico Configuration

1.  In your Iyzico Merchant Panel, navigate to settings.
2.  Set the **Webhook URL** to the `payment-webhook` function URL noted above.
3.  Ensure the **Callback URL** passed from `create-checkout-session` matches your application's routing (it is constructed using `PUBLIC_APP_URL` in the Edge Function).

## Maintenance

- **Inspecting logs**: You can view invocation logs on the Supabase Dashboard under the Edge Functions section.
- **Rollback**: If a deployment fails, you can redeploy the previous commit's functions.
- **Rotating secrets**: If a key is compromised, generate a new one, update the Supabase secret (`supabase secrets set IYZICO_API_KEY="..."`), and restart the Edge Functions if necessary.
