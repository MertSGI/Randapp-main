# Final Pilot Readiness Checklist

When moving from Sandbox to Production for the Pilot release, ensure the following steps are audited precisely:

## 1. Secrets & Architecture
- [ ] Ensure `.env` contains NO Iyzico secret keys.
- [ ] Ensure `.env` contains NO Supabase Service Role Key.
- [ ] Enable `VITE_PAYMENT_PROVIDER=production` natively.
- [ ] Push Iyzico API Key and Secret Key securely to Edge Function (`supabase secrets set IYZICO_API_KEY="..."`).

## 2. Infrastructure Testing
- [ ] Execute an End-to-End Test transaction using a real (but small amount) card in production environment.
- [ ] Verify `payment-webhook` Edge function receives webhook.
- [ ] Verify `payment-webhook` verifies signature properly.
- [ ] Verify Supabase `subscriptions` table shifts status to `active`.
- [ ] Verify RLS logic restricts visibility of Payments and Subscriptions strictly to the Tenant.

## 3. UI
- [ ] The customer-facing UI hides 'Mock' warnings, error flags, or test card info.
- [ ] Edge functions have clean error catching for failures, providing generic feedback to the client rather than exposing deep internal traces.

## 4. Rollback Plan
- [ ] In the event of a catastrophic payment failure system, provide a quick script or process to switch back to `VITE_PAYMENT_PROVIDER=sandbox` or display a 'Maintenance' banner without exposing developer logs to customers.

## 5. Audit Logging
- [ ] Ensure any status changes made by `payment-webhook` log an entry in the `AuditLog` table.
