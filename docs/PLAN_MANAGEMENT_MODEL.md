# Plan Management Model

## Overview
LARİ pricing and subscription plans are centrally managed by the Super Admin, moving away from fully hardcoded client-side limits. Plans have dynamic pricing, limits, and feature toggles, along with rules for Monthly and Annual billing periods.

## Data Structures

**Plans**
- `planId`: string (e.g., starter, professional, premium)
- `name`: string
- `monthlyPrice`: number
- `annualPrice`: number
- `annualDiscountPercent`: number
- `setupFee`: number
- `currency`: string
- `trialEnabled`: boolean
- `trialDays`: number
- `providerProductReferenceCode`: string (iyzico product reference)
- `providerPlanReferenceCodeMonthly`: string (iyzico plan reference)
- `providerPlanReferenceCodeAnnual`: string (iyzico plan reference)
- `maxStaff`: number
- `maxServices`: number
- `maxMonthlyAppointments`: number
- `customDomainEnabled`: boolean
- `includedSubdomain`: boolean
- `customComDomainIncluded`: boolean
- `aiRecommendationsEnabled`: boolean
- `reportsEnabled`: boolean
- `campaignsEnabled`: boolean
- `whatsappAutomationEnabled`: boolean
- `googleCalendarEnabled`: boolean
- `supportLevel`: string (e.g., 'standard', 'priority')
- `referralEligible`: boolean

## Super Admin Flow
Super Admins can:
- Modify `monthlyPrice` and `annualPrice` variables.
- Toggle feature flags or increase limits on specific plans.
- Control whether custom `.com` domains are bundled for free in the Annual plans.
- Toggle `trialEnabled` to route checkout flows securely.

## Billing Periods
Users on the `PricingPage` and `BillingTab` can toggle between Monthly and Annual payments.
Annual payments apply the `annualDiscountPercent` and often unlock extra features (like a custom `.com` domain).

## Dynamic CTAs and Trial Routing (Phase 5)
- When payment environments are active (`sandbox`/`production`), CTA buttons dynamically resolve from demo/sales workflows to trial/secure payment requests.
- Plans where `trialEnabled = true` will route via Iyzico trial pipelines securely (frontend never signs/charges itself).
- Mock modes safely intercept requests to avoid unintended card collection.

## AI and Storage Edge Rules (Phase 4 Updates)
- AI features (`aiRecommendationsEnabled`, `aiVisualizationEnabled`) are checked entirely server-side in Edge Functions before invoking external APIs.
- Media buckets (`tenant-public-media`, `customer-private-reference-photos`) map to strict RLS policies, bypassing generic mock constraints.
