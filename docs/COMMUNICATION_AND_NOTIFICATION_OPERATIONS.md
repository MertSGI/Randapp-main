# Communication Event, Message Template & Notification Outbox Architecture

LARİ utilizes a provider-agnostic, localized, and consent-aware communications architecture. This system manages, persists, templates, and logs all transactional customer alerts (WhatsApp, SMS, Email, In-App) and owner-facing operational reminders.

## 1. System Components

```
                      +-----------------------------+
                      |       Product Flows         |
                      |   (Booking, Subscription,   |
                      |    Site Setup, Admin)       |
                      +--------------+--------------+
                                     |
                                     v
                      +--------------+--------------+
                      |  communicationEventService  <-----+ evaluates consent flags via
                      +--------------+--------------+       consentService
                                     |
                                     +-----------------------+
                                     |                       |
                                     v                       v
                      +--------------+--------------+ +------+----------------------+
                      |    messageTemplateService   | |  communicationProvider      |
                      |   (TR/EN localized copy,     | |     ConfigService          |
                      |    token formatting env)    | | (local outbox vs gateways)  |
                      +--------------+--------------+ +------+----------------------+
                                     |
                                     v
                      +--------------+--------------+
                      |    Local storage Database   |
                      |   (lari_communication_events)|
                      +--------------+--------------+
                                     |
                                     v
                      +--------------+--------------+
                      |  CommunicationOutboxPanel    |
                      |  (Owner / Super Admin UI)   |
                      +-----------------------------+
```

### A. Message Template Service (`messageTemplateService.ts`)
Houses the static localized strings for both **Turkish (TR)** and **English (EN)** audiences. It replaces tokens securely (e.g. `{customerName}`, `{businessName}`, `{date}`) and formats clean subject lines and bodies.

### B. Communication Event Service (`communicationEventService.ts`)
Manages event queue creation. Generates unique identifier strings (`comm_...`), reads customer consent preferences, determines if an event should be marked as `skipped`, renders the final email/SMS message, and logs standard metadata into the persistent database.

### C. Provider Configuration Service (`communicationProviderConfigService.ts`)
Dictates execution environment constraints. Operating fully in `local_outbox_only` mode during staging ensures **no real external messages** are fired. This decouples local simulation and prevents accidental delivery.

---

## 2. Event Types & Life Cycle Schema

Events mapped across LARİ's core SaaS layers:

| Target Domain | Event Code | Channel | Recipient |
|---|---|---|---|
| **Booking** | `booking_created` | WhatsApp / In-App | Customer & Owner |
| | `booking_confirmed` | WhatsApp | Customer |
| | `booking_cancelled` | WhatsApp | Customer |
| | `booking_completed`| WhatsApp | Customer |
| | `booking_no_show` | WhatsApp | Customer |
| | `appointment_manage_link_created` | WhatsApp | Customer |
| | `cancellation_request_created` | WhatsApp | Customer |
| | `cancellation_request_approved` | WhatsApp | Customer |
| | `cancellation_request_rejected` | WhatsApp | Customer |
| | `reschedule_request_created` | WhatsApp | Customer |
| | `reschedule_request_approved` | WhatsApp | Customer |
| | `reschedule_request_rejected` | WhatsApp | Customer |
| | `appointment_confirmed_by_customer` | WhatsApp | Customer |
| **Subscription** | `trial_started` | Email | Owner |
| | `trial_ending` | Email | Owner |
| | `subscription_active`| Email | Owner |
| | `subscription_past_due`| Email | Owner |
| | `subscription_paused`| Email | Owner |
| | `subscription_cancelled_period_end`| Email | Owner |
| | `subscription_cancelled_immediate` | Email | Owner |
| | `plan_upgraded` | Email | Owner |
| | `plan_downgrade_scheduled` | In-App | Owner |
| | `manual_subscription_activated` | Email | Owner |
| | `referral_credit_awarded` | In-App | Owner |
| **Publishing**| `public_site_preview_ready`| In-App | Owner |
| | `public_site_published` | Email | Owner |
| | `custom_domain_requested` | Email | Owner |
| | `custom_domain_active` | Email | Owner |
| **Support** | `support_request_created` | Email | Owner |
| **Admin** | `super_admin_manual_provisioning_completed` | Internal Note | Super Admin |

---

## 3. Communication Delivery Lifecycle States

Each outbox item cycles through the following statuses to ensure deterministic staging logs:

1. **`queued`** (Initial State): The event is successfully declared.
2. **`rendered`** (Staged): Tokens are mapped, translation formatting succeeded, and the entity is stored in the local outbox.
3. **`skipped`**: The event execution was aborted because the targeted recipient withdrew or lacked appropriate **Consent**.
4. **`sent`**: Delivery has been acknowledged by the virtual gateway (simulated locally).
5. **`failed`**: The messaging gateway reported issues (e.g. invalid phone structure, empty email, network timeouts).
6. **`cancelled`**: Scheduled notification or reminder was manually discarded by the merchant before delivery.

---

## 4. Consent Compliance & Safety Rules

LARİ enforces local regulations strictly, ensuring data protection and customer sovereignty:

* **Transactional Messages (`booking_...`)**:
  * Generated with `bookingContactConsent` or `appointmentReminderConsent` validation.
  * If a client explicitly drops both consents, the outbox immediately moves the item into `skipped` status, recording `Müşteri işlem onay/iletişim izni vermemiştir.` as diagnostic metadata.
* **Marketing Campaigns & Referrals**:
  * Non-transactional, promotional channels enforce `marketingConsent`.
  * If the client turns marketing indicators off, campaign messages are silently `skipped`.
* **Business Owner Communications**:
  * Strategic notifications (billing, package shifts, publish validations, or security requests) bypass optional consumer consent checks because they are legally vital to active contract fulfillment.

---

## 5. Super Admin Interventions

Super Admins can inspect and audit the complete outbound communication lifecycle and execute pre-live overrides inside the control panel:
- Apply manual delivery simulation hooks directly.
- Mark queued or failed notifications as `sent` to bypass virtual gateway lockups.
- Track audit trails for internal-only operator comments (`internalOnly: true`), ensuring secure logging.
