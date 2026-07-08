# Sandbox Run Evidence Template

**Instructions:** 
Copy this template to a new file (e.g., `qa-reports/SANDBOX_RUN_YYYY_MM_DD.md`) and fill it out after executing a real Iyzico sandbox transaction via Supabase Edge Functions. Let this serve as the official record of the sandbox QA pass.

## 1. Run Metadata
- **Date/Time:** YYYY-MM-DD HH:MM
- **Branch/Commit:** [e.g., main / abc1234]
- **Supabase Project Ref:** [e.g., xyz123]
- **App URL:** [e.g., localhost:3000 or staging url]
- **Payment Run Mode:** `sandbox_live`
- **Tested Plan:** [e.g., Professional]
- **Tenant/Business Test Name:** [e.g., QA Test Salon]
- **Owner Email Used:** [e.g., tester@example.com]
- **Tester:** [Name / Handle]

## 2. Pre-Run Verification
- [ ] `npm run build` succeeds
- [ ] `npm run qa:all` passes
- [ ] `qa:first-sandbox-run` passes
- [ ] `qa:sandbox-readiness` passes
- [ ] `qa:payment-security` passes
- [ ] Edge Functions deployed (`create-checkout-session`, `payment-webhook`, `subscription-sync`)
- [ ] Supabase secrets set (without exposing frontend)
- [ ] Iyzico product/payment plans created with 14-day trials
- [ ] Callback URL configured in Iyzico / Environment
- [ ] Webhook URL configured in Iyzico
- [ ] Signature V3 status confirmed

## 3. Checkout Evidence
- [ ] `/pricing` route opened
- [ ] Plan selected
- [ ] `/register` completed successfully
- [ ] `tenantId` generated correctly
- [ ] `planId` preserved correctly
- [ ] Checkout handoff opened successfully
- [ ] Iyzico checkout page/form rendered
- [ ] Sandbox card/payment completed
- [ ] Callback returned to app (`/admin/billing` or similar)

## 4. Backend Evidence
- [ ] `create-checkout-session` logs reviewed (no errors)
- [ ] `payment-webhook` logs reviewed (received payload)
- [ ] `subscription-sync` logs reviewed
- [ ] Callback logs reviewed
- [ ] Signature verification result: PASS
- [ ] Idempotency result: PASS (processed once)
- [ ] Duplicate webhook behavior: Handled gracefully (ignored/skipped)

## 5. App State Evidence
- [ ] Admin Billing status displays correctly (e.g., `trialing` or active)
- [ ] Trial start date matches today
- [ ] Trial end date is exactly 14 days later
- [ ] Payment method/card authorization status is correct
- [ ] Super Admin Payments shows the new payment row/event
- [ ] Super Admin Subscriptions shows tenant subscription updated
- [ ] Webhook event stored in database
- [ ] Audit log stored (if supported)

## 6. Negative Tests
- [ ] Cancelled checkout behavior handled correctly
- [ ] Failed payment (simulate rejection) handled correctly
- [ ] Invalid webhook signature returns 401 Unauthorized
- [ ] Duplicate webhook processed idempotently
- [ ] Missing signature header returns 401 Unauthorized
- [ ] Retry checkout from billing page succeeds

## 7. Final Result
- **Result:** [PASS / FAIL]
- **Blockers Found:** [List any blockers]
- **Fixes Required:** [List any fixes]
- **Safe to repeat sandbox test?:** [YES / NO]
- **Safe to prepare production credentials?:** [YES / NO]
