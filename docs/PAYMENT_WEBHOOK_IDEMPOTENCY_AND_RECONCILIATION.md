# Webhook Idempotency, Event Sequencing, and Billing Ledger Reconciliation

This technical framework describes the strategies used within the LARİ subscription lifecycle platform to ensure secure webhook processing, event idempotency, safe state transitions, and manual billing reconciliation.

---

## 1. Webhook Idempotency Framework (Double-Charge Mitigation)

Due to network retries, iyzico or Stripe may deliver the same webhook event multiple times. To prevent double provisioning, duplicate receipts, or corrupted transaction histories, LARI utilizes a **database-backed idempotency filter**.

### 1.1. Constructing the Idempotency Key (`providerEventId`)
Every incoming payload is parsed to locate unique event attributes. In `payment-webhook/index.ts`, a unified identifier is compiled:
```typescript
const providerEventId = payload.iyziPaymentId || payload.token || `${payload.eventType}_${payload.subscriptionReferenceCode || payload.orderReferenceCode || payload.conversationId}`;
```

### 1.2. Idempotency Check Sequence Flow
```
Incoming Webhook Request
         │
         ▼
Extract Signature Header
         │
         ▼
Signature Validation Passes
         │
         ▼
Query Unique providerEventId in audit_logs
         │
         ├───────────────── Yes ─────────────────► [Return HTTP 200 OK Early]
         │ (Do not run billing database queries)       (Event already handled)
         │
         ├───────────────── No ──────────────────► [Insert providerEventId in audit_logs]
         ▼                                             (Lock transaction record)
Execute DB Updates & Provisioning
         │
         ▼
Return HTTP 200 OK Success
```

---

## 2. Status Mapping Protocol

The system maps external provider notifications to LARİ’s subscription statuses using secure, state-machine transitions:

| External Provider Status | Mapped Internal Status | Provisioning Unlock Status | User Experience Action |
| :--- | :---: | :---: | :--- |
| `ACTIVE`, `subscription.created` | `active` | **Unlocked** | Clear billing limits, extend period end date. |
| `subscription.active` | `active` | **Unlocked** | Standard active state dashboard. No warning flags. |
| `PAST_DUE`, `UNPAID` | `past_due` | **Grace Period / Locked** | Alert banner in admin, prompt for credit card update. |
| `CANCELED`, `subscription.cancelled` | `cancelled` | **Locked** | Lock publishing privileges. Show plan upgrade buttons. |
| *Unknown / Suspended* | `suspended` | **Locked** | Direct to customer support helpdesk. |

---

## 3. Webhook Sequencing & Out-of-Order Mitigations

Occasionally, network delays cause webhooks to arrive out of chronological order (e.g. a `subscription.cancelled` packet landing *prior* to a delayed retry of `subscription.created`).

### 3.1. Sequencing Logic Rules:
1.  **Timestamp Check**: Before applying any status update, query the existing subscription table. If the database record contains a `updated_at` timestamp newer than the incoming event timestamp, discard the status change.
2.  **State-Preservation**: A subscription marked as `cancelled` can only be altered by an explicit, brand new initialization session (`pending_checkout` or new checkout form submission), preventing stale event retries from reviving terminated subscriptions.

---

## 4. Manual / Offline Billing Bypass

To accommodate special pilot operations, corporate agreements, or manual beta activations that do not go through iyzico checkout, LARİ supports a secure manual billing mechanism.

### 4.1. Manual License Upgrades (`manual_active` / `comped`)
Super Admins can trigger manual overrides via the admin dashboard:
*   These actions bypass external checks.
*   The `subscriptions` record status is set to `manual_active` or `comped`.
*   Billing gates automatically honor manual active licenses without querying provider subscriptions or requiring valid checkout session handoffs.

### 4.2. Safe Override Database Structure:
```json
{
  "tenant_id": "manual-pilot-uuid",
  "plan_id": "professional",
  "status": "manual_active",
  "payment_provider": "offline_payment",
  "cancel_at_period_end": false,
  "current_period_end": "2030-12-31T23:59:59Z"
}
```

---

## 5. Billing Ledger Reconciliation (Cron Task Plan)

To catch edge cases where neither callback nor webhook successfully synchronized the state (e.g., severe internet outages), a **nightly reconciliation sweep** is scheduled:

1.  **Retrieve Standby Records**: Find all accounts with status `trialing`, `active`, or `past_due` where `current_period_end` is past due by more than 24 hours.
2.  **Provider Verification Sweep**: Query the active provider APIs (iyzico `/v2/subscription/subscriptions/{referenceCode}`) directly using secure server credentials.
3.  **Repair DB State**: Update the local database to match the host platform's truth, sending notification communications (such as dunning emails) as required.
