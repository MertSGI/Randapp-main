# Payment Readiness Checklist

This document tracks the readiness state of the LARİ platform for processing real production payments.

**Current State: Sandbox Deployment Handoff (Phase 10)**
*Production payment flows and live Iyzico connections are **DISABLED**, but dynamic CTAs and diagnostic harnesses are ready. Environment templates, guides, and runbooks are set up for final deployment.*

## Sandbox Setup Steps
1. Read `docs/SUPABASE_DEPLOYMENT_GUIDE.md` and `docs/IYZICO_SANDBOX_SETUP_GUIDE.md`.
2. Apply Supabase migrations.
3. Deploy Edge Functions.
   - `create-checkout-session`
   - `payment-webhook`
   - `subscription-sync`
3. Set Supabase secrets:
   - `IYZICO_API_KEY`
   - `IYZICO_SECRET_KEY`
   - `IYZICO_BASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Configure iyzico sandbox product and plan reference codes in provider dashboard.
5. Configure plan provider reference codes in Super Admin.
6. Run Super Admin Payment Diagnostics (`/super-admin/payment-test`) to verify functions.
7. Test checkout session local harness.
8. Test trial start.
9. Test webhook via diagnostic curl.
10. Verify subscriptions table update.

## Phase 9 & 10 Status: Security & Handoff Readiness
- [x] Edge Function contracts documented.
- [x] Diagnostic `diagnostic: true` parameter implemented for safe secret verification.
- [x] Super Admin Payment Test harness created.
- [x] Plan provider reference codes logic mapped to Pricing and Checkout pages.
- [x] Webhook state matrix (`trialing`, `active`, `past_due`, `payment_failed`, `cancelled`, `expired`) documented.
- [x] Frontend checks for `VITE_PAYMENT_PROVIDER` and alerts users if not configured.
- [x] Super Admin UI warns what's next via Runbook banner.
- [x] Env templates isolated (frontend vs server-side).
- [x] Safety scripts configured (`npm run check:secrets`, `npm run check:edge-contracts`).

**No card details are collected live. The frontend contains no Iyzico secrets.**

## 1. Frontend UI State
- [x] Payment UI safely defaults to mock/bypassed logic when `VITE_PAYMENT_PROVIDER=mock`.
- [x] Pricing Page dynamically triggers safe "Integration not configured" alert if payment mode is active but reference codes are missing.
- [x] Billing Tab accurately represents mock trial status (`trialing`), shows remaining days.
- [x] Super Admin has dynamic diagnostic tools for backend payment health.

## 2. Infrastructure & Edge Functions (Diagnostic Models Done)
- [x] Edge functions for Iyzico integration (e.g. `create-checkout-session`, `payment-webhook`) scaffolded and support diagnostic endpoints.
- [ ] Supabase environment secrets required for Iyzico must be manually configured in the cloud environment.
- [ ] Native Sandbox checkout must collect cards securely to initiate trials.

## 3. Webhook & Background Processes
- [x] Webhook payload signature mock parsing supported for diagnostics.
- [ ] Trial cancellation and subscription termination must carefully align with webhook states.
- [ ] Full webhook endpoint E2E testing from real iyzico sandbox payloads.

## 4. Production Criteria (Future Phase)
Production Live Card Payments will NOT be activated until:
1. All Edge Functions log successful E2E sandbox events without bypassing signature validation.
2. The Database Subscription tracking completely aligns with Iyzico callback states.
3. Super Admins pilot the webhook flow from start to finish.
