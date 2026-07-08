# Payment Integration Runbook

This runbook is an execution checklist for integrating and testing the real iyzico sandbox environment with LARİ.

## Phase 1: Pre-requisites & Environment
- [ ] Read `SUPABASE_DEPLOYMENT_GUIDE.md` and `IYZICO_SANDBOX_SETUP_GUIDE.md`.
- [ ] Confirm no real secrets exist in the frontend workspace.
- [ ] Set `VITE_PAYMENT_PROVIDER=sandbox` (local/preview) to activate non-mock flows.

## Phase 2: Database & Functions
- [ ] Apply Supabase migrations (`npx supabase db push`).
- [ ] Deploy Edge Functions (`create-checkout-session`, `payment-webhook`, `subscription-sync`).
- [ ] Set external secrets securely in Supabase (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] Confirm Edge Function readiness via Super Admin `/super-admin/payment-test` diagnostics (Run Health Check). **Expected:** `Missing Env: None`, `Status: diagnostic`, `canProceed: true`.

## Phase 3: Configuration
- [ ] Retrieve Provider Reference Codes from iyzico sandbox dashboard.
- [ ] Add Reference Codes via Randapp Super Admin Plans page.
- [ ] Add the webhook URL to iyzico dashboard (`https://<project-ref>.supabase.co/functions/v1/payment-webhook`).

## Phase 4: UI Behavior Tests
- [ ] Navigate to `/#/pricing`. **Expected:** Trial and Checkout CTAs are visible and active (no alert blocks if sandbox + reference codes are present).
- [ ] Verify CTAs on Billing Tab in Admin Panel.

## Phase 5: Functional Sandboxing
- [ ] Test real Trial Checkout start. **Expected:** Redirects to iyzico payment screen.
- [ ] Test successful payment completion / checkout. **Expected:** Returns to success URL.
- [ ] Simulate Webhook event (`subscription.trial.created` or `subscription.activated`) via Postman/cURL or real provider action. **Expected:** HTTP 200 from Edge Function, idempotency validation, local DB is updated.
- [ ] Verify `subscriptions` table. **Expected:** `status` -> `trialing` or `active`.
- [ ] Verify `payments` table. **Expected:** Initial record inserted on success.
- [ ] Verify `audit_logs` table. **Expected:** Edge function logic trace is documented.

## Phase 6: Rollback & Troubleshooting
- **If missing config alert blocks checkout**: Check that `providerPlanReferenceCodeMonthly` / `Annual` are populated for the selected plan in Super Admin.
- **If Edge Function timeout**: Verify Supabase project status or network constraints.
- **If Webhook fails signature**: Ensure `IYZICO_SECRET_KEY` matches environment exactly.
- **To rollback to mock**: Change `VITE_PAYMENT_PROVIDER=mock`, redeploy frontend. Nothing on backend needs rollback.
