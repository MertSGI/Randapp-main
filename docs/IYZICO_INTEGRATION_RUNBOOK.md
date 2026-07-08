# Iyzico Integration Runbook

## Overview
This runbook covers the integration of Iyzico subscription and payment APIs with LARİ. The architecture relies on Supabase Edge Functions to ensure that all sensitive credentials (like Iyzico API Keys and Supabase Service Role keys) remain absolutely hidden from the browser. The frontend never touches these keys.

## Architecture
1. **Frontend**: Collects the user intent to subscribe or checkout (using mock UI or a safe redirect).
2. **Edge Function (`create-checkout-session`)**: Initializes the checkout session with Iyzico using Sandbox endpoints.
3. **Iyzico Checkout**: Returns a checkout token or a URL to the frontend for the payment page.
4. **Edge Function (`payment-webhook`)**: Listens to server-to-server callbacks from Iyzico. Verifies signatures and updates subscription/payment status securely in the database using the Service Role Key.
5. **Subscription Sync**: Keeps `subscriptions` table aligned with Iyzico states (active, past_due, canceled).

## Sandbox Setup
1. Create a Sandbox account on: `https://sandbox-api.iyzipay.com`
2. Obtain `IYZICO_API_KEY` and `IYZICO_SECRET_KEY`.
3. Put those in your Supabase Edge Function environment variables. DO NOT put them in the `.env` for Vite.

## Product / Plan Reference Codes
Iyzico uses "Product Reference Code" and "Plan Reference Code" to identify subscriptions.
Currently configured with placeholders in `planService.ts`. Once real Sandbox test codes are created, replace them.

**Mappings:**
- `Starter`: Product => `test_product_1`, Monthly => `test_plan_monthly_1`, Annual => `test_plan_annual_1`
- `Professional`: Product => `test_product_2`, Monthly => `test_plan_monthly_2`, Annual => `test_plan_annual_2`
- `Premium`: Product => `test_product_3`, Monthly => `test_plan_monthly_3`, Annual => `test_plan_annual_3`

These placeholders ensure the customer-facing UI doesn't break, while preparing for secure replacement.

## Security Constraints
- **NO RAW CARDS**: Never ask for raw card data directly. Use Iyzico Checkout Form or Subscription UI.
- **NO SECRETS IN FRONTEND**: `VITE_` should never prefix Iyzico keys.

## Going to Production
When ready to go live, replace the Sandbox URLs with Production URLs and swap the API/Secret Keys on the edge.

## Post-Registration Checkout Handoff

The self-service registration flow now explicitly hands off users to the Iyzico initialization phase.

**Flow:**
1. User completes `/register`.
2. A temporary local database context is assembled.
3. `subscriptionService.startCheckout(tenantId, planId)` is invoked (or a mock preview is shown).
4. If in production, `create-checkout-session` Edge Function initializes a session via payload (owner email, business name, plan config, customer parameters like identityNumber and addresses required by iyzico sandbox).
5. Frontend launches redirect to returned Iyzico PayPage URL or falls back safely in mock mode.
6. Upon webhook success, user returns to `/#/admin?tab=kurulum&checkout=success` which is parsed by `BillingTab` for success banners.
