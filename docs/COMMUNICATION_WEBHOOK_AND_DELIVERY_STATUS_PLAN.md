# Communication Webhook & Delivery Status Mapping Plan

This technical document outlines the schema structures, data mappings, signature checking protocols, and error retry strategies for handling asynchronous delivery feedback webhooks from mail, SMS, and WhatsApp providers.

---

## 1. Webhook Payload Data Mapping Schema

To link external carrier events back to LARİ's core system records, incoming payloads must map identifiers onto our internal data fields:

| Incoming Carrier Field | Target LARİ Entity | Purpose |
| :--- | :--- | :--- |
| `event_id` | `providerMessageId` | Unique carrier reference |
| `metadata.lari_event_id` | `communicationEventId` | Direct match to our Outbox ID |
| `metadata.tenant_id` | `tenantId` | Identifies the tenant |
| `metadata.customer_id` | `customerId` | Identifies the recipient customer |
| `metadata.appointment_id` | `appointmentId` | Links transactional booking updates |

---

## 2. Integrated Delivery Status State Machine

To represent the complete delivery lifecycle from staging to callback completion, the application state maps carrier feedbacks onto downstream statuses:

```
  [ queued ] ───► [ rendered ] ───► [ sent ] ───► [ delivered ]
                          │             │
                          ▼             ▼
                     [ skipped ]    [ failed ] ───► [ bounced / complained ]
```

### Downstream Status Mapping Rules:

| External Webhook Event | LARİ Delivery Status | Internal Meaning |
| :--- | :--- | :--- |
| `email.sent` / `message.sent` | **`sent`** | Provider accepted payload |
| `email.delivered` / `whatsapp.read` | **`delivered`** | Arrived on target recipient device |
| `email.bounced` | **`bounced`** | Hard/soft bounce (invalid address or full inbox) |
| `email.complained` | **`complained`** | User marked system email as SPAM |
| `sms.undelivered` / `whatsapp.failed` | **`failed`** | Carrier routing failure (dead line, out of network) |
| `manual.cancel` | **`cancelled`** | Manually aborted in outbox console |

---

## 3. Webhook Delivery Resilience Protocols

### 3.1. Idempotency & Duplicate Webhook Behavior
*   **Behavior**: Carriers may send identical webhooks multiple times due to delivery handshake network losses.
*   **Resolution**: Before processing, the webhook handler must acquire a distributed lock on the `providerMessageId` or verify if the event action has already been written to the event audit ledger. If already processed, the system returns a `200 OK` instantly to acknowledge receipt without updating values.

### 3.2. Out-of-Order Webhook Resolution
*   **Symptom**: `email.delivered` arrives *before* the corresponding `email.sent` signal.
*   **Strategy**: Event timestamps on incoming payloads must be strictly evaluated. A status update must never downgrade an event (e.g. going from `delivered` back to `sent` or `queued`).

### 3.3. Unknown Event or Missing ID Handling
*   **Strategy**: If an incoming webhook does not contain a recognizable `communicationEventId`, or if lookup in our systems fails:
    1.  Write the raw payload to an isolated `system_unmapped_webhooks` dead-letter queue.
    2.  Return a `200 OK` to prevent the carrier from aggressively retrying the payload.
    3.  Trigger highly sanitized telemetry warning notifications for Super Admin manual inspection.

---

## 4. Webhook Security & Verification Rules

```text
Incoming Webhook Request
         │
         ▼
[Signature Verification Header] 
         │
         ├── Missing / Invalid Secret -> [401 / 403 Forbidden] (Do NOT process)
         │
         └── Valid -> [Proceed to Idempotency Parser]
```

### Signature Verification Guidelines:
*   *Verification Protocol*: Requires verification against developer documentation of the respective provider.
*   *Rehearsal State*: Signature verification is marked as **provider-doc verification required** under active rehearsals and skipped safely in local mode.

---

## 5. Failed Delivery & Retries Strategy

If delivery status webhooks indicate failures, the system applies the following operational recovery protocols:

1.  **Hard Bounce / Spam Complaint (`complained` / `bounced`)**:
    *   The system immediately locks the customer's communication channels.
    *   Subsequent booking notifications are forced to fallback on in-app panels or alternative text lines.
    *   Saves the diagnostic details in the database.
2.  **Temporary Out-of-Service (`failed`)**:
    *   Apples standard retry queue rules: retry after 15 minutes, maximum 3 times.
    *   If still unsuccessful, marks the communication event as `failed` and alerts the merchant dashboard.
3.  **Super Admin Manual Review Queue (DLQ)**:
    *   Failures related to template approvals, invalid authorization headers, or billing limits trigger warnings inside the Super Admin interface, allowing manual queue reprocessing.
