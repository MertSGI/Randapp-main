# Sandbox Payment Test Plan (Phase 9 Readiness)

This document outlines the test cases and harnesses used to validate iyzico sandbox checkout before full deployment.

## Test Cases
1. **Mock mode**: `checkout` does not call Edge Function and starts mock trial only. No card collected.
2. **Sandbox mode without secrets**: `checkout` returns `sandbox_not_configured`. Safe error is displayed.
3. **Sandbox mode with diagnostic response**: Super Admin UI connects to `diagnostic: true` endpoints and dynamically displays readiness status.
4. **Missing plan reference code**: Plan validations block user-friendly error before Edge Function is even called.
5. **Trial-enabled plan (Backend Responsibility)**: `trialDays` and `trialEnabled` are read by Edge Function to dictate iyzico parameters.
6. **Billing cycle selection**: Checkout endpoint uses `monthly` / `annual` code conditionally based on input params mapped to `providerPlanReferenceCodeMonthly` / `Annual`.
7. **No frontend secret exposure**: Verified manually and programmatically. Frontend checks only public VITE vars.

## Webhook State Matrix
| Iyzico Event | Internal Status Mapping | Notes |
| ------------ | ----------------------- | ----- |
| `subscription.trial.created` | `trialing` | Validates initial sign up |
| `subscription.activated` | `active` | Active billing started |
| `subscription.payment.success` | `active` | Recurring payment OK |
| `subscription.payment.failed` | `payment_failed` | Recurring payment failed |
| `subscription.canceled` | `cancelled` | Plan cancelled |
| `subscription.expired` | `expired` | Hard expiration or lack of retry |

## Executing the Test Harness
Navigate to Super Admin -> Payment Test (`/super-admin/payment-test`) and click the diagnostic test buttons to run these scenarios against the configured Edge Function URLs.


---

## Phase C Qualification Status (Controller Update 20261024)

| Test Item | Status | Verification Suite |
| :--- | :--- | :--- |
| Mock Mode Non-Paying Checkout | `SOURCE_READY` / `MOCK_TESTED` | `qa:payment-mode-safety` |
| Sandbox Live Credential Guard | `SOURCE_READY` / `MOCK_TESTED` | `qa:payment-mode-safety` |
| Production Live Tamper Rejection | `SOURCE_READY` / `MOCK_TESTED` | `qa:payment-mode-safety` |
| Client Payment Adapters Disabled | `SOURCE_READY` / `MOCK_TESTED` | `qa:payment-mode-safety` |
| HMAC-SHA256 Signature Verification | `SOURCE_READY` / `MOCK_TESTED` | `qa:payment-security`, `qa:iyzico-webhook-cryptography` |
| Webhook Payload Tamper Rejection | `SOURCE_READY` / `MOCK_TESTED` | `qa:iyzico-webhook-cryptography` |
| Webhook Idempotency Check | `SOURCE_READY` / `MOCK_TESTED` | `qa:subscription-lifecycle-integrity` |
| Out-of-Order Lifecycle Guard | `SOURCE_READY` / `MOCK_TESTED` | `qa:subscription-lifecycle-integrity` |
| Customer / Tenant Mismatch Guard | `SOURCE_READY` / `MOCK_TESTED` | `qa:subscription-lifecycle-integrity` |
| Diagnostic Auth Protection | `SOURCE_READY` / `MOCK_TESTED` | `qa:subscription-lifecycle-integrity` |
| Live External Merchant Interop | `PROVIDER_INTEGRATION_PENDING` | Pending iyzico Sandbox Account Provisioning |
| Production Card Charges | `NOT_TESTED` | Blocked by Issue #10 |
