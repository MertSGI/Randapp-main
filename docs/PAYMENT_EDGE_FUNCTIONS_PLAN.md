# Payment Edge Functions Plan

To ensure security and proper data handling, **NO payment logic, secret keys, or raw calculations should run in the frontend SPA.**

We plan to implement the following Supabase Edge Functions:

## 1. `POST /functions/v1/create-checkout-session`
**Purpose:** Initialize a new checkout session (hosted payment page or widget token) for a given plan and tenant.
**Input:**
```json
{
  "tenantId": "uuid",
  "planId": "professional",
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
```
**Output:**
```json
{
  "checkoutUrl": "https://...",
  "provider": "iyzico",
  "sessionId": "xyz_123"
}
```
**Flow:**
- Validate user's auth token (is admin of tenant).
- Read plan details from server config (price, setup fee).
- Call Payment Provider API with secret key.
- Return Checkout URL or Token to frontend.

## 2. `POST /functions/v1/create-billing-portal-session`
**Purpose:** Allow users to manage their subscription, download invoices, or update credit cards.
**Input:**
```json
{
  "tenantId": "uuid",
  "returnUrl": "https://..."
}
```
**Output:**
```json
{
  "portalUrl": "https://..."
}
```
**Flow:**
- Validate user auth.
- Retrieve provider `customer_id` from database.
- Call provider's createPortal API.
- Return Portal URL to frontend.

## 3. `POST /functions/v1/payment-webhook`
**Purpose:** Receive async notifications from the payment provider (e.g. successful charge, subscription canceled, trial ended).
**Input:**
provider webhook payload

**Security & Behavior:** 
- **verify webhook signature server-side** Cannot be bypassed.
- map provider event to subscription status
- update subscriptions table
- insert payment record
- **never trust frontend callbacks to activate subscription**
- **After verified payment webhook:**
  1. Create tenant.
  2. Create subscription record.
  3. Create salon owner profile.
  4. Create onboarding progress record.
  5. Send user notification or allow frontend to redirect user to `/admin?tab=kurulum`.

**CRITICAL NOTE:** Subscription table updates must ONLY be based on these verified webhooks, NOT on frontend callbacks or redirects, which can be easily spoofed.

## Sandbox Activation Checklist
Before migrating to production, ensure the iyzico sandbox flow is fully tested:
- [ ] iyzico Edge Function credentials set in Supabase Secrets (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`)
- [ ] Subscription Plan references set in Secrets (`IYZICO_PLAN_STARTER_REF`, etc.)
- [ ] Webhook URL configured in iyzico Sandbox Panel
- [ ] Webhook signature verification planned or temporarily bypassed for sandbox only
- [ ] Provider events correctly mapped to internal subscription status
- [ ] Failed payment behavior tested via sandbox test cards
- [ ] Canceled subscription behavior tested via sandbox webhooks