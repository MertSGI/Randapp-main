# Payment Partner & Provider Contract Matrix

This technical contract documents the data payloads, currency regulations, plan-to-provider routing, and authorization mechanics between the LARI core client application, Supabase database, Edge Functions, and external payment providers.

---

## 1. Provider Routing by Market

LARI supports selective routing based on localized markets, protecting Turkey compliance standards while preparing international pathways:

| Market (Region) | Default Provider Backend | Default Currency | Active Regulations | Trial Settings |
| :--- | :---: | :---: | :---: | :---: |
| **Turkey (`tr`)** | `iyzico` | `TRY` | KVKK Compliance Required, No-Exposure of API Secrets | 14-Day Free Period, Card Required |
| **Global (`global`)** | `provider_agnostic` (Stripe) | `USD` | GDPR Compliance, No-Exposure of Secret Keys | 14-Day Free Period, Card Required |

---

## 2. Plan Mappings & Reference Code Contracts

To maintain consistent state transitions, all local plans mapping uses unique Iyzico reference codes setup inside the Iyzico Sandbox or Production administrative console:

| Plan ID | Display Name | Billing Cycle | Trial Period | Sandbox Reference Code (`tr`) | Monthly/Annual Price |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **baslangic** | Başlangıç | Monthly | 14 Days | `plan_baslangic_monthly` | ₺1,490 |
| **baslangic** | Başlangıç | Annual | 14 Days | `plan_baslangic_annual` | ₺14,304 (₺1,192/mo) |
| **standart** | Standart | Monthly | 14 Days | `plan_standart_monthly` | ₺2,490 |
| **standart** | Standart | Annual | 14 Days | `plan_standart_annual` | ₺23,904 (₺1,992/mo) |
| **professional** | Profesyonel | Monthly | 14 Days | `plan_professional_monthly` | ₺3,490 |
| **professional** | Profesyonel | Annual | 14 Days | `plan_professional_annual` | ₺33,504 (₺2,792/mo) |
| **premium** | Premium | Monthly | 14 Days | `plan_premium_monthly` | ₺4,990 |
| **premium** | Premium | Annual | 14 Days | `plan_premium_annual` | ₺47,904 (₺3,992/mo) |
| **kurumsal** | Kurumsal | Dynamic | 0 Days | *Custom Contract / Offline Manual* | Talk to Sales / Custom Proposal |

---

## 3. Transaction Data Payloads (create-checkout-session)

The backend Edge Function `create-checkout-session` transforms the client inputs into secure schema-compliant provider parameters.

### 3.1. Sandbox/Production Customer Metadata Checklist
To prevent sandbox rejects, ensure all payloads pass validation:
*   **Identification Number (`identityNumber`)**: For Turkey billing clients, must be a valid 11-digit string. For sandbox testing, `"11111111111"` is strictly used.
*   **GSM Number (`gsmNumber`)**: Format must begin with country code, e.g. `+905555555555`.
*   **City & Zip Code**: Valid city name and standard 5-digit zip string. Minimum fallback defaults inside `_shared/iyzicoClient.ts` ensure no missing fields trigger API validation failures.
*   **Billing/Shipping Contacts**: Maps dynamic name + surname fields securely from client input.

### 3.2. Outbox JSON Structure Contract
```json
{
  "locale": "tr",
  "conversationId": "lari_tenantId_timestamp",
  "pricingPlanReferenceCode": "plan_professional_monthly",
  "subscriptionInitialStatus": "ACTIVE",
  "callbackUrl": "https://your-public-site.com/#/admin?tab=kurulum&checkout=success",
  "customer": {
    "id": "tenant-uuid-here",
    "name": "OwnerName",
    "surname": "OwnerSurname",
    "email": "owner@brand.com",
    "gsmNumber": "+905001234567",
    "identityNumber": "11111111111",
    "billingAddress": {
      "contactName": "OwnerName OwnerSurname",
      "city": "Istanbul",
      "country": "Turkey",
      "address": "Fatura Adresi",
      "zipCode": "34000"
    },
    "shippingAddress": {
      "contactName": "OwnerName OwnerSurname",
      "city": "Istanbul",
      "country": "Turkey",
      "address": "Fatura Adresi",
      "zipCode": "34000"
    }
  }
}
```

---

## 4. Webhook Security & Signature Verification Contracts

Verification occurs server-side in Deno Edge Functions via high-performance, Constant-Time signature comparison.

### Signature Mechanics (Algorithm V3 HMAC-SHA256)
*   **Header Name**: `x-iyz-signature-v3`
*   **Secret Key Storage**: `IYZICO_SECRET_KEY` (Always isolated dynamically inside Edge Env).
*   **String Matching Generation**:
    *   **Subscription Webhooks (Events like `subscription.created` or `subscription.active`)**:
        Concatenate the fields in strict sequence prior to encryption:
        `secretKey + merchantId + eventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode`
    *   **HPP Webhooks (One-off / Upgrade payments)**:
        `secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status`

---

## 5. Security Guardrails

1.  **Strict Token Exchange Only**: The client never sees or queries the API key. It initiates session workflows using standard JWT handles and references a public page redirect token.
2.  **Explicit Sandbox Bypass**: Local tests can execute simulated flows natively (`local_dry_run`), completely isolating integration steps without communicating outside local sandbox bounds.
