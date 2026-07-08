# PRE-LIVE HARDENING AND CUTOVER BLOCKERS

## 1. What is Now Complete Before Live
* **Product Scope:** The LARİ multi-tenant platform is structurally complete (Admin, Booker, Multi-branch, Referrals, Customer Memory, Go-Live constraints, Privacy/Consent).
* **Data Safety:** We have the Data Export/Import and Migration Dry-Run mechanisms in place to allow safe backups of early pilot setup data prior to transitioning to Supabase persistence.
* **Pre-live Polish:** The application handles "local_dry_run" effectively, ensuring we don't expose mock text or dummy data hints to the end-users. Error boundaries, empty states, and UX are polished for the target mobile devices.
* **Security & Governance:** No backend secrets, Iyzico API keys, or raw CVV/PAN data ever enter the frontend configuration.

## 2. What is Still Intentionally Local/Pre-Live
* **Persistence (`VITE_DATA_MODE=mock`)**: We intentionally remain on `localStorage` backed repositories for the frontend.
* **Payment (`VITE_PAYMENT_RUN_MODE=local_dry_run`)**: Payments bypass the actual Iyzico gateway API to let owners finish onboarding without actual sandbox transactions, avoiding deployment complexity during frontend dev.
* **Notifications**: SMS/Emails are routed to `console.log` rather than actual WhatsApp or SMTP endpoints.

## 3. What Must Happen For Supabase Cutover
* Supabase project must be provisioned.
* The SQL definitions documented in `SUPABASE_SCHEMA.md` must be deployed (tables and RLS).
* `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be populated in the production UI environment.
* `VITE_DATA_MODE` must be changed to `supabase`.
* Any existing pre-live pilot JSON snapshot must be safely manually injected into the Supabase database.

## 4. What Must Happen For Iyzico Sandbox Test
* The Supabase Edge Functions (`create-checkout-session` and `payment-webhook`) must be deployed.
* The `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, and `IYZICO_WEBHOOK_SECRET` must be assigned to the Edge Functions.
* `VITE_PAYMENT_RUN_MODE` changed to `sandbox_live`.
* A real End-to-End test must be conducted using a test credit card.

## 5. What Must Happen For Production Payment
* A live Iyzico merchant account must be fully verified and approved.
* The production Iyzico keys must replace the Sandbox keys in Supabase Edge Functions.
* `VITE_PAYMENT_RUN_MODE` must be changed to `production_live`.

## 6. What Must Happen For Email Provider
* Configure an SMTP service like Resend or Sendgrid.
* Link the email trigger functions to Supabase Auth or Webhooks.

## 7. What Must Happen For WhatsApp Provider
* Purchase and verify a WhatsApp Business API connection (e.g., via Twilio or Gupshup).
* Implement the WhatsApp endpoint in Edge Functions for reminders.

## 8. What Must Happen For DNS/Custom Domain
* A wildcard DNS record (`*.lari.com.tr` or similar) must point to the NGINX or Cloud Run entry point.
* The reverse proxy must accurately map `Host` headers to the `tenantId`.

## 9. What Must Happen For Legal Review
* Legal counsel must read and approve `/privacy` and `/terms` for PDPL (KVKK) compliance.

## 10. What Must Happen For First Real Pilot Backup
* Before we give a real salon owner access, we must train the sales rep to download the `.json` snapshot (from Super Admin) after their core configuration is done, just in case they lose their local cache.

## 11. Exact Go / No-Go Checklist
- [ ] Supabase Provisioned & schema deployed?
- [ ] VITE_DATA_MODE = supabase?
- [ ] Edge Functions active?
- [ ] IYZICO keys injected in Edge Functions?
- [ ] First Sandbox run successful?
- [ ] PDPL/KVKK text approved?
- [ ] DNS reverse proxy active?

## 12. "Do Not Launch If..." List
* DO NOT LAUNCH a real salon if `VITE_DATA_MODE` is still `mock` unless you explicitly intend for them to lose data when they clear their browser.
* DO NOT LAUNCH if `local_dry_run` is enabled for a commercial tenant (they will get free subscriptions without paying).
* DO NOT LAUNCH if Edge Functions are returning 500 errors.
