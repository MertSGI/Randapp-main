# GO/NO-GO LIVE CHECKLIST

This checklist must act as the absolute final gate before transitioning LARİ from pre-live sandbox to production. If an item fails, the release is a **NO-GO**.

## Readiness Overview
- [ ] **Product Readiness**: Core modules (Booking, Admin, Memory, Branch, Analytics) working exactly as required. No mock/incomplete text remains.
- [ ] **QA Readiness**: Current build passes `npm run qa:all` cleanly without failures.
- [ ] **Supabase Readiness**: Database mapped, RLS activated, zero keys stored insecurely in frontend. VITE_DATA_MODE set to supabase.
- [ ] **Payment Readiness**: Iyzico Sandbox testing passing. Webhooks verified. Ready for `production_live` deployment.
- [ ] **Notification Readiness**: SMTP working for system messages. Manual sharing tools operational.
- [ ] **Legal/Privacy Readiness**: Real PDPL (KVKK) content approved by counsel and accessible on `/privacy` and `/terms`.
- [ ] **DNS Readiness**: Primary domains pointing to live infrastructure with active HTTPS certificates.
- [ ] **Support Readiness**: Inbox/helpdesk configured to accept system failure messages or user issues.
- [ ] **Backup Readiness**: Existing tenant `.json` snapshots captured via `dataExportService`.
- [ ] **Rollback Readiness**: Incident instructions exist to safely revert data boundaries or payment contexts.

---

## 🚫 DO NOT GO LIVE IF:
- `npm run qa:all` emits errors or fails.
- `npm run build` fails or chunk limits prevent deployment.
- Supabase migrations or RLS verify steps are not complete.
- Edge functions are undeployed or silently failing.
- Iyzico Sandbox payment or webhook simulations are failing.
- Webhook signature validation logic is bypassed or broken in production Edge Functions.
- Any raw Card (PAN/CVV) inputs appear in the frontend application directly.
- Frontend exposes sensitive secret environment variables (e.g., `sk_live`, Service Role key).
- The Public `/demo` triggers, exposes, or overwrites an actual owner session.
- The Admin dashboard (`/admin`) allows access without an authenticated owner session.
- Legal `/privacy` and `/terms` pages are missing or incomplete.
- A pre-live backup snapshot of crucial pilot tenants was not exported.
