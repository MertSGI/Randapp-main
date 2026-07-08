# Sandbox Payment Test Checklist

This checklist acts as the final verification script before launching the real payment flow in production.

## 1. Environment & Setup

- [ ] Edge Functions deployed to Supabase (`create-checkout-session`, `payment-webhook`, `subscription-sync`).
- [ ] Supabase secrets set (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `PUBLIC_APP_URL`).
- [ ] Iyzico Sandbox Product & Pricing Plans created.
- [ ] Mapping Reference Codes updated in `planService.ts` (or mapped via Edge Function secrets).
- [ ] Supabase Edge function URL registered as the `Webhook URL` in Iyzico Sandbox Panel.

## 2. End-to-End Test Run

1. [ ] **Start app**: Load the homepage locally or using the shared preview URL.
2. [ ] **View Pricing**: Go to `/#/pricing`.
3. [ ] **Select Plan**: Click `Professional`.
4. [ ] **Register**: Complete the `/register` form.
5. [ ] **Handoff**: Verify that after registration, the app attempts to handoff the flow to `create-checkout-session` (if missing secrets or in mock mode, verify it safely falls back without exposing secrets).
6. [ ] **Complete Sandbox Payment**: Use an Iyzico Sandbox test card to complete the purchase on the PayPage.
7. [ ] **Callback Success**: Verify the user returns to `/#/admin?tab=abonelik` and a success copy is displayed.
8. [ ] **Check Admin Billing State**: Verify the Billing Tab now shows `trialing`, `pending`, or `active` correctly.
9. [ ] **Check Webhook**: Review Edge Function logs. Ensure `X-IYZ-SIGNATURE-V3` was verified or safely bypassed purely through internal sandbox flags, and idempotency logic triggered.
10. [ ] **Super Admin Verification**: Go to System Administration -> Payments. Verify the checkout event was logged properly for the correct tenant.

## 3. Threat Matrix & Security Checks

- [ ] **No Card Fields**: The React frontend must have absolutely `0` inputs collecting `cardNumber`, `cvv`, or `expiry`.
- [ ] **No Frontend Secrets**: Check `Vite` environment variables. Ensure `IYZICO_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not bundled into the JS.
- [ ] **Duplicate Webhook Payload**: Fire the same webhook JSON payload twice using Postman. Ensure the database doesn't create duplicate records.
- [ ] **Signature Tampering**: Modify the payload signature. Ensure the edge function returns `401 Unauthorized`.
- [ ] **Copy Check**: Ensure no buttons or text say "mock", "sandbox", "test" to the end business owner.
