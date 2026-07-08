# Transactional Communication Provider Rehearsal Runbook

This document describes the validation routines, step-by-step rehearsals, and fallback maneuvers required to map external communication channels (Resend/SMTP, Turkey SMS Carrier Netgsm, and Meta WhatsApp Business Cloud API) into LARİ's production communication layer.

---

## 1. Prerequisites and Baseline Checks

Before conducting rehearsals, ensure that local parameters conform to the safe sandbox baseline:

*   **Mode Check**: `VITE_COMMUNICATION_MODE` must equal `local_outbox_only`.
*   **Safety Audit**: No real API keys, passwords, or sender identifiers are hardcoded into components or committed to VCS.
*   **Fallback Isolation**: All emails, SMS, and WhatsApp messages must stay completely within the local browser storage outbox schema. No bytes are sent over SMTP or HTTP channels.

---

## 2. Mock & Sandbox Provider Placement Schema

To configure the communication layer for pre-live testing, placeholders are mapped via target environment configurations:

```text
Provider Service     Environment Parameter Name                 Sandbox Value / Placeholder
─────────────────────────────────────────────────────────────────────────────────────────────
Email                resend                     RESEND_API_KEY              re_sandbox_key_12345
                     smtp                       SMTP_HOST                   smtp.sandbox.example.com
                                                SMTP_USER                   sandbox-user@example.com
                                                SMTP_PASSWORD               ••••••••••••••••••••••••
SMS (Turkey)         netgsm                     SMS_PROVIDER_API_KEY        netgsm_sandbox_api_abcde
                                                SMS_PROVIDER_USERNAME       532XXXXXXX
                                                SMS_PROVIDER_PASSWORD       ••••••••••••••••••••••••
WhatsApp (Meta)      cloud_api                  WHATSAPP_ACCESS_TOKEN       wa_sandbox_token_999999
                                                WHATSAPP_PHONE_NUMBER_ID    109876543210123
                                                WHATSAPP_WEBHOOK_SECRET     wh_sandbox_secret_abcde
```

### Sender & Domain Registrations:
*   **Email Domain Authorization**: DNS records must have SPF, DKIM, and MX pointers configured for `randevulari.com` with the respective email gateway.
*   **Turkey SMS Alpha Header**: Carrier registration for SMS sender titles (e.g. `LARI`, `RNDVULARI`) must be verified against official regulatory credentials.
*   **WhatsApp Approved Templates**: Dynamic strings for notifications must be pre-approved by Meta using exact match formatting tokens.

---

## 3. Webhook Enpoints & Delivery Rehearsals

During live routing, webhook URLs must capture asynchronous event callbacks:

*   **Target URI Email**: `https://api.randevulari.com/api/webhooks/email`
*   **Target URI WhatsApp**: `https://api.randevulari.com/api/webhooks/whatsapp`
*   **Target URI SMS**: `https://api.randevulari.com/api/webhooks/sms`

### Webhook Signature Verification Placeholder:
```typescript
// Proposed verification signature process during live setup:
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  // To be implemented using cryptographic hmac hashing when real provider is connected.
  // Currently, in rehearsal/sandbox, we perform validation checks based on mock identifiers.
  return signature === `simulated_hmac_${payload.length}`;
}
```

---

## 4. Specific Rehearsal Testing Scenarios

Use the following step-by-step procedures to rehearse the communication pipeline without executing live dispatches.

### A. Booking Confirmation Test
1.  **Preparation**: Create a test customer with `bookingContactConsent: true`.
2.  **Trigger**: Complete a reservation on `randevulari.com` under the local demo suite.
3.  **Result Verification**:
    *   Verify a new `booking_created` event gets queued in the Outbox Panel.
    *   Confirm the rendered body displays correct localization (TR) and contains appropriate token substitutions (`{customerName}`, `{serviceName}`).
    *   Verify the status is marked as `rendered` (or `sent` if provider simulation is active).

### B. WhatsApp Template Compliance / Staff Warning
1.  **Trigger**: Complete a reservation as a buyer.
2.  **Assertion Check**:
    *   Check whether an internal event for the salon owner (`booking_created_owner`) is successfully formed.
    *   Confirm the copy meets pre-approved Meta guidelines for transactional triggers.

### C. Booking Appointment Reminder (Scheduled cron)
1.  **Trigger**: Initialize standard reminder task run simulation.
2.  **Assertion Check**:
    *   Confirm a `booking_reminder` item enters the outbox schema with tomorrow's address details.
    *   If `appointmentReminderConsent: false` is recorded, verify the outbox immediately tags the row as `skipped` with diagnostic reasoning.

### D. 14-Day Trial Verification & Ending Alert
1.  **Trigger**: Trigger customer registration / manual subscription activation.
2.  **Result Verification**:
    *   Confirm `trial_started` fires, explicitly mentioning a **14-day duration**.
    *   Simulate subscription date nearing term end; confirm `trial_ending` fires with exact date placeholders, reminding the owner that payment will transition.

### E. Failed Delivery & Email Bouncing Simulation
1.  **Trigger**: Force a manual "mark failed" event via the Super Admin Outbox Panel.
2.  **Actions**:
    *   Enter diagnostic text (e.g. `Address bounced/complained`).
    *   Verify the row's status changes to `failed` and logs are written securely.

---

## 5. Failure Recovery, Resiliency, & Rollback Playbook

When live integrations encounter errors, the operations team will execute the following resilience guidelines:

### 5.1. Gateway API Outages & Backoff
*   *Fail-safe Strategy*: If Resend or Meta Cloud API responds with `500 Server Error` or `429 Too Many Requests`, the Edge Function must immediately queue the item back to the database with a progressive backoff multiplier ($2^n \times 2$ minutes).
*   *Rate Limits*: SMS carriers must not be queued with more than 50 requests per second.

### 5.2. Rollback Instructions
If a live SMTP host or WhatsApp gateway experience sustained degradation, execute immediate rollback:
1.  Access the platform environment configuration console.
2.  Redeem communication mode down to safe baseline:
    ```bash
    VITE_COMMUNICATION_MODE="local_outbox_only"
    ```
3.  All subsequent operational dispatches will immediately buffer safely inside the local storage, bypassing external gateways while preserving operational continuity.
