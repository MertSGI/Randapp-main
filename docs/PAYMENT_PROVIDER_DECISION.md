# Payment Provider Decision

This document compares payment providers for handling recurring subscriptions in LARİ.

## Providers Evaluated

### 1. Stripe
- **Recurring Subscription Support:** Best in class. Global standard for subscriptions, prorations, and automated dunning.
- **Turkey Suitability:** Generally not available for locally incorporated businesses in Turkey without special company setups (e.g. Stripe Atlas in the US). If the company is Turkish, it is mostly unsupported natively.
- **Webhook Support:** Excellent and standard.
- **Customer Portal:** Fully hosted billing portal for customers to upgrade/downgrade/cancel and download invoices.
- **Integration Complexity:** Low. Has official robust Node.js SDKs.
- **Recommendation:** Perfect if operating outside Turkey or using an international corporate structure.

### 2. iyzico
- **Recurring Subscription Support:** Offers a subscription API but less robust than Stripe. Sometimes lacks advanced proration logic or hosted billing portals.
- **Turkey Suitability:** Very high. Standard payment provider for Turkish merchants.
- **Webhook Support:** Good webhook system for subscription events.
- **Customer Portal:** Usually requires building a custom billing portal utilizing their API to manage cards and plans.
- **Integration Complexity:** Medium. Has Node.js SDK, but documentation can sometimes be outdated.
- **Recommendation:** Best practical choice for a Turkey-based merchant. Requires some custom work for customer portals.

### 3. Param
- **Recurring Subscription Support:** Basic tokenization and recurring payment capability, might require custom recurring billing cron jobs or rely on their specific subscription module.
- **Turkey Suitability:** High.
- **Webhook Support:** Webhook support exists.
- **Customer Portal:** No built-in hosted customer portal. Requires building custom billing forms.
- **Integration Complexity:** High. Sometimes SOAP-based or legacy REST APIs.
- **Recommendation:** Use only if special rates or specific integrations are necessary. Not recommended for modern fast-shipping SaaS subscriptions compared to iyzico.

## Conclusion
For a Turkey-first launch, **iyzico** is the recommended initial provider (and currently the active integration target in Edge Functions) because it fully supports subscription/payment plans locally and has the widest acceptance in the Turkish ecosystem.

For a global SaaS routing through a US company, **Stripe Billing** remains the strongest future technical option due to Stripe Checkout, Customer Portal, excellent invoice handling, and webhooks.

For alternative local POS routes, **Param** can remain an evaluated option but should not be the first implementation unless merchant terms are significantly better than iyzico.
