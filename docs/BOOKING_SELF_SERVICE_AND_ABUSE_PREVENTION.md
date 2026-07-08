# LARİ Customer Booking Self-Service & Anti-Abuse Prevention Architecture

This document describes the design, pre-live local execution, and production roadmap for LARİ's tokenized customer self-service links, cancellation/reschedule request pipelines, and anti-abuse booking filters.

---

## 1. Tokenized Customer Manage Links Architecture

Online appointments are followed by automated communications (WhatsApp, SMS, Email). Rather than requiring customers to log in or create password-protected profiles for minor adjustments, LARİ uses secure single-use tokenized links.

### 1.1 Link Format
The link layout maps directly as:
```text
https://[tenant].randevulari.com/#/appointment/manage/[TOKEN_HASH]
```
For local testing and pilot environment demo simulation:
```text
http://localhost:3000/#/appointment/manage/apt_tok_[random_suffix]
```

### 1.2 Data Model (`AppointmentAccessToken`)
Located in `types.ts`:
```typescript
export interface AppointmentAccessToken {
  id: string;
  tenantId: string;
  appointmentId: string;
  customerId?: string;
  tokenHash: string; // Used in routing parameter
  purpose: 'view' | 'cancel' | 'reschedule' | 'confirm';
  status: 'active' | 'used' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  usedAt?: string;
  metadata?: any;
}
```

### 1.3 Local Pre-Live vs. Production Backend Behavior

| Feature / Detail | Pre-Live Local Simulation | Production Cloud Ingress (Supabase/Postgres) |
| :--- | :--- | :--- |
| **Token Generation** | Generated as a random string client-side and saved to local state (`localStorage`). | Cryptographically secure random bytes generated server-side. |
| **Token Verification** | Verified by direct key matching in localStorage. | Token query matches hashed index in DB. Hashed tokens ensure no credentials leakage if read-only databases are compromised. |
| **Outbox Integration** | Placed in simulated outbox array with `{appointmentManageUrl}` placeholder parsed. | High-throughput background workers pick up queued notifications and dispatch physically via Iyzico/Twilio/Local SMS gateways. |
| **Expiry Bounds** | Automatically expires after a defaulted 7-day period. | Expiry checks run at DB level or during API check with custom index sweeps. |

---

## 2. Cancellation & Reschedule Request Pipelines

A central challenge in salon management is late cancellations and no-shows. LARİ supports distinct policies and status lifecycle transitions.

### 2.1 The Rules (Tenant Booking Policy)
Every salon tenant maintains an individual configuration schema block (`BookingPolicy`):
*   `cancellationWindowHours` (Default: `24`): The window in hours before the scheduled appointment where a customer is allowed to cancel instantly.
*   `allowCustomerCancellation` (Default: `true` / boolean): Toggle to lock self-service customer cancellations.
*   `allowCustomerRescheduleRequest` (Default: `true` / boolean): Toggle for erteleme/change requests.
*   `requireOwnerApprovalForReschedule` (Default: `true` / boolean): Forces manual owner audit before shifting calendars.

### 2.2 Functional Flow Chart
1.  **Customer triggers action**: Accesses link and requests item.
2.  **Timing evaluated**:
    *   **Within Free Window (Time remaining > `cancellationWindowHours`)**: Cancellation auto-applies immediately. Status transitions to `cancelled_by_customer`. Token status transitions to `used`.
    *   **Late / Outside Window (Time remaining < `cancellationWindowHours`)**: Held in **Pending Approval** state (`AppointmentChangeRequest`). Owner receives toast alert or control banner in their panel.
    *   **Reschedule request**: Always held as pending in `AppointmentChangeRequest` for calendar conflict audit by the salon owner.

### 2.3 Change Request Schema (`AppointmentChangeRequest`)
```typescript
export type AppointmentChangeRequestType = 'cancellation' | 'reschedule';
export type AppointmentChangeRequestStatus = 'requested' | 'approved' | 'rejected' | 'expired' | 'cancelled_by_customer' | 'applied';

export interface AppointmentChangeRequest {
  id: string;
  tenantId: string;
  appointmentId: string;
  customerId?: string;
  type: AppointmentChangeRequestType;
  status: AppointmentChangeRequestStatus;
  requestedDateTime?: string; // Target target "YYYY-MM-DD HH:mm"
  reason?: string;
  customerNote?: string;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}
```

---

## 3. Anti-Abuse Booking Prevention Rules

Fake, spam, or competitive block-booking is a business-killer for salons. LARİ integrates built-in checks directly into the customer booking interface.

### 3.1 Protection Filters
1.  **Daily Velocity Lock**: Limits total bookings created from any single phone number per day (Defined in `maxBookingsPerPhonePerDay`, default `3`).
2.  **No-Show Risk Sweeper**: If a phone number has been designated with `no_show` status {threshold} times (Defaults to `2`), the online booking route intercepts, returns an error block, and prompts direct line calling.
3.  **Duplicate Block**: Prevents scheduling multiple appointments on the same date for the same service with the same phone number.

---

## 4. Current Pre-Live Capability Verification

How the features behave under the simulated workspace:
*   **Customer Manage Page** (`/appointment/manage/:token`): Completely decoupled from owner sessions. Shows a layout displaying the salon name, customer name, date/time, and actions (Confirm, Request Cancel, Reschedule) without exposing staff internal files or CRM notes.
*   **Admin review UI**: Shows any active pending cancellation or reschedule request. The owner can click "Approve" or "Reject", include comments (`ownerNote`), and watch calendar/outbox logs shift in real-time.
*   **Safety Isolation**: No raw credit cards, real credentials, or API secret tokens are exposed in client bundles. Local and pre-live mode remains the default, ensuring existing verification scripts continue to run as expected.

---

## 5. Related Documents
* [Gözlemlenebilirlik, Audit ve Destek Operasyonları Kılavuzu](./OBSERVABILITY_AUDIT_AND_SUPPORT_OPERATIONS.md)
* [Destek Biletleri ve Incident Response Playbook](./SUPPORT_TICKET_AND_INCIDENT_RESPONSE.md)
* [Gözlemlenebilirlik Sağlayıcı Sözleşme Matrisi](./OBSERVABILITY_PROVIDER_CONTRACT_MATRIX.md)

