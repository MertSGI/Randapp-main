# iyzico Integration Plan

## Why iyzico-first for Turkey launch
For a Turkey-first local salon SaaS, iyzico is the most recognized and accessible provider for local merchants. It supports Subscription API (Abonelik) and Payment Plans natively, making it a reliable choice for charging local debit/credit cards effectively and handling local regulatory requirements out-of-the-box compared to Stripe.

## Required Merchant Account Setup
- Must apply for a corporate/individual merchant account at iyzico.
- Must request activation of the Subscription API (Abonelik API), which might require additional review.
- Must obtain API Key and Secret Key from the merchant panel.

## Subscription Product/Payment Plan Mapping
iyzico uses `PricingPlanReferenceCode` to identity subscription products.
We map our internal `planId` to their codes:
- Starter -> `plan_starter_reference`
- Professional -> `plan_professional_reference`
- Premium -> `plan_premium_reference`
These products and plans must be pre-created in the iyzico dashboard.

## Expected Checkout Flow
1. **Frontend**: User clicks "Geliştir". `subscriptionService` calls `create-checkout-session` Edge Function.
2. **Backend**: Edge Function calls iyzico to initialize a Subscription Checkout Form with the selected plan's reference code.
3. **Frontend**: Receives the checkout token/URL and redirects the user to iyzico's hosted payment page.
4. **Checkout**: User completes payment on iyzico.
5. **Webhook**: iyzico posts to our `payment-webhook`.

## Webhook Verification Requirement
- iyzico sends `x-iyzico-signature`.
- The webhook Edge Function MUST securely parse the payload and verify the signature using our `IYZICO_SECRET_KEY` before acting upon it. This ensures nobody can fake a subscription success event.
- NEVER rely on the frontend redirect/callback to provision the tenant.

## Subscription Status Mapping
- iyzico: `ACTIVE` -> internal: `active`
- iyzico: `PAST_DUE` or `UNPAID` -> internal: `past_due`
- iyzico: `CANCELED` -> internal: `canceled`
- iyzico: `SUSPENDED` -> internal: `suspended`

## Cancellation/Payment Failure Behavior
- If past due, public bookings might remain active briefly or suspend immediately based on grace period.
- If canceled, public bookings are suspended immediately.
- The merchant typically needs to resolve failed payments via a link provided by iyzico or by updating their card through a secure form initialized again via API.

## What is manual at first
- Billing portal / modifying cards might be done manually through customer support generating update links via merchant dashboard until a full self-service flow is coded.
- Setup Fee collecting might be done via separate standard payment links for the MVP before automating composite subscriptions.

## What becomes automated later
- Full self-service plan upgrades/downgrades.
- Self-service card updates.

## Setup Fee Strategy
Option A (Recommended MVP):
- Charge the setup fee manually via bank transfer or a separate direct payment link (iyzico Link) during onboarding.
- The subscription starts as a monthly recurring plan.

Option B (Future):
- Include the setup fee in the first payment cycle via API if the provider supports mixed billing.
