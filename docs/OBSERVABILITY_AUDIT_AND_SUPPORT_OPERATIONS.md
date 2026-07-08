# LARİ Observability, Audit, and Support Operations Guide

This document describes the design, mechanics, and processes of LARİ's pre-live observability and support ticketing architecture. 

## 1. Local / Pre-Live Audit Model

LARİ operates on an offline-first and simulation-friendly observability model during its pilot phases. Rather than pushing events to heavy external SaaS providers, all system-wide, tenant-scoped, and customer-triggered actions write to a local persistent outbox.

### Key Characteristics:
* **Storage Provider:** Structured `localStorage` keying (`lari_audit_events_v1`).
* **Performance Impact:** Zero network overhead. Events are captured synchronously on important status transitions.
* **Console Sync:** In development, every audit event is printed to the developer console under `[AUDIT_LOG_SIMULATION]` for real-time validation.

---

## 2. Safe Redaction Rules (Anti-Leak Safeguards)

To prepare for future HIPAA and KVKK/GDPR compliance, the audit logging engine passes all payloads through a strict recursive redaction filter (`auditLogService.redactAuditPayload`).

### Redacted Patterns and Keys:
* **Authentication Fields:** `password`, `pass`, `passwordConfirm`, `pin`, `otp`, `accessToken`, `refreshToken`, `tokenHash`
* **Financial Assets:** `cardNumber`, `card_number`, `cvv`, `cvc`, `expiry`, `cc`
* **API Secrets & Webhooks:** `secret`, `providerSecret`, `apiKey`, `api_key`, `dsn`, `sentry_dsn`, `webhookUrl`, `webhook_url`
* **Sensitive Private Text:** `privateNote`, `customer_memory`, `customerMemory`, `staff_notes`, `internal_notes`
* **Large Media/Payloads:** Any string beginning with `data:image/` containing `;base64,` is stripped and replaced with `[REDACTED_BASE64_IMAGE_DATA]` to prevent memory leaks and database bloat.
* **Tokens:** URL parameters and text streams containing `apt_tok_` are sanitized to `[REDACTED_TOKEN]`.

---

## 3. Correlation ID Strategy

To trace transactions across multiple services (e.g., from a customer self-service link to a background status sweep, and finally to a ticket creation), LARİ generates unique correlation IDs.

* **Prefixing Format:** `corr_[prefix]_[randomHex]` (e.g., `corr_appt_f5a89b02`).
* **Service Propagation:** Once generated, the `correlationId` is attached to all subsequent audit events, communication outbox messages, and escalation tickets.
* **Troubleshooting Utility:** Super Admins can search by a `correlationId` in the Observability page to filter the exact sequential timeline of the transaction.

---

## 4. Audit Categories & Severity Levels

Every logged event belongs to a designated category and severity level to enable precise filtering.

### Categories:
* `booking` — Appointment lifecycle transitions (create, reschedule, approve, cancel).
* `customer_self_service` — Link creation, access tokens, customer-initiated reschedule/cancel requests.
* `anti_abuse` — Dynamic risk evaluation blockages, no-show counts, rate-limiting triggers.
* `payment` — Subscriptions, transaction sweeps, webhook responses.
* `subscription` — Tenant tier changes, subscription billing, past-due states.
* `media` — Logo uploads, portfolio image validation, SVG security checks.
* `migration` — Pilot snapshots, database validation, dry-run reports.
* `support` — Ticket creation, eskalasyon, resolution logs.
* `security` — Authentication failures, role violations, suspicious IP/rate anomalies.
* `system` — Background job runs, scheduler ticks, app initialization.

### Severity Levels:
* `info` — General informational logs (routine operations).
* `notice` — Important milestones (e.g., new registration, self-service request).
* `warning` — Recoverable errors or suspicious activity (e.g., blocked rate-limit, SVG validation failure).
* `error` — Action-blocking failures (e.g., outbox delivery failed).
* `critical` — Service-impairing events (e.g., security breach, multiple failed background runs, blacklisted no-show block).

---

## 5. Tenant-Scoped vs. System-Wide Events

LARİ distinguishes between **Tenant-scoped** events (specific to a single beauty salon/business) and **System-wide** events (concerning the entire platform).

* **Tenant-Scoped (`tenantId` present):** Filtered directly on the business owner's dashboards. Contains salon-specific actions like `appointment_cancelled` or `customer_no_show_recorded`.
* **System-Wide (`tenantId` null):** Concerns global operations (e.g., subscription sweeps, custom domain routing, or Super Admin settings modifications). These are only visible in the Super Admin Observability Panel.

---

## 6. Support Ticket & Incident Escalation Rules

```
[ Audit Event (Warning/Critical) ]
               │
               ▼ (Manual or Automated Trigger)
[ Support Ticket (Open/Escalated) ]
               │
               ▼ (Kritik/Genel Etki / Major Outage)
[ Incident (Detected/Mitigated/Resolved) ]
```

### Ticket Creation Rules:
1. **Automated Protection:** Blocked abuse attempts (rate limits, no-shows) automatically generate support tickets in the system category `abuse_spam`.
2. **Outbox Failures:** Any background communication delivery failure (SMS/Email provider error) triggers a ticket under `communication`.
3. **Manual Creation:** Super Admins can file support tickets on behalf of tenants directly from the panel.

### Incident Escalation Criteria:
* An event affects multiple tenants (SaaS-wide issue).
* Critical core features (booking engine, payment gateway) are entirely down.
* Security anomalies or unauthorized access detections.

---

## 7. Future Production Provider Mapping

When LARİ is ready for public deployment, these interfaces will map directly to production SaaS providers:

| LARİ Concept | Future Live Provider | Implementation Action |
|---|---|---|
| `auditLogService.logAuditEvent` | **Datadog / OpenTelemetry** | Route JSON payloads to standard console output under JSON format for Cloud Logging or Datadog agent pick-up. |
| `SafeErrorBoundary` / Render Errors | **Sentry** | Initialize Sentry SDK on startup and send uncaught React stack traces securely, keeping PII redacted. |
| Support Ticket Queue | **Zendesk / Intercom / Jira** | Implement API proxy in `/api/support` to create tickets directly inside Zendesk. |
| Incident Escalation | **PagerDuty / Slack Webhooks** | Critical severity events will trigger standard webhook alerts to the on-call Slack channel or PagerDuty. |

---

## 8. Current Pre-Live Capability vs. Production Setup

### What Works Now:
* Real-time localized audit log capturing.
* Recursive safe PII redaction filter.
* Manual and automatic ticketing triggers.
* Inter-connected escalation pathways (Audit -> Ticket -> Incident).
* Strict separation of Super Admin views (unexposed to tenant owners).

### What Requires Provider Setup:
* Real Slack/SMS alerting on Critical issues.
* External dashboard sync (Datadog/Sentry).
* Automatic ticket router assignment to live customer service staff.
