# Iyzico Sandbox Product & Plan Setup

To test the end-to-end subscription payment flow with Iyzico Sandbox, you must mirror the LARİ subscription plans in the Iyzico dashboard.

## 1. Create a Product
1. Log in to the Iyzico Sandbox merchant panel.
2. Navigate to Subscriptions > Products.
3. Create a new Product (e.g., "LARİ Platform SaaS").
4. Note the generated **Product Reference Code**.

## 2. Create Pricing Plans
Within your new product, create the corresponding pricing plans. Currently, we recommend using a monthly billing cycle.

Where supported by the sandbox, configure a 14-day trial period to test the `trialing` -> `active` lifecycle.

### Mapping Table

| LARİ Plan ID | Plan Name | Monthly Price | Iyzico Product Ref Code | Iyzico Pricing Plan Ref Code | Trial Days | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `starter` | Başlangıç | 1,250 TL | *(Set in config)* | *(Set in config)* | 14 | Pending Setup |
| `professional` | Profesyonel | 2,750 TL | *(Set in config)* | *(Set in config)* | 14 | Pending Setup |
| `premium` | Premium | 4,500 TL | *(Set in config)* | *(Set in config)* | 14 | Pending Setup |

## 3. Apply References to Code
Update your local `services/planService.ts` or Edge Function configuration mapping to ensure that when a user selects a LARİ plan, the correct `pricingPlanReferenceCode` is passed to the Iyzico initialization endpoint.

```tsx
// Example in planService.ts
{
   id: 'professional',
   // ...
   iyzicoPricingPlanReferenceCode: process.env.VITE_IYZICO_PLAN_PRO || 'c4ca4238-...',
}
```
*(In a later iteration, these mappings can be moved purely server-side for enhanced security).*

## 4. Verification Check
1. Start the app.
2. Select a plan and complete `/register`.
3. Ensure the Iyzico UI loads with the correct plan price visible.
4. Complete the mock payment using a test card.
5. Verify that webhook delivery updates the subscription state in LARİ's Database.
