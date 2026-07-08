# LARİ Support Ticket and Incident Response Playbook

This document defines the lifecycle, escalation workflows, severity standards, and operational playbooks for LARİ's customer support and system incident teams.

---

## 1. Ticket Lifecycle

Support tickets are managed through seven standard status transitions:

```
[Open] ──> [In Review] ──> [Waiting on Customer/Owner] ──> [Resolved] ──> [Closed]
  │
  └───> (Escalated to Incident)
```

1. **Open:** Ticket is created automatically (from anti-abuse filters, webhook failure, outbox errors) or manually by a Super Admin.
2. **In Review:** An agent has claimed the ticket and is actively diagnosing.
3. **Waiting on Customer:** Replied with feedback requested from the customer/salon owner.
4. **Waiting on Owner:** Salon owner action needed (e.g., subscription renewal or profile update).
5. **Escalated:** Marked for senior technical review or linked to a system incident.
6. **Resolved:** Solution provided and tested.
7. **Closed:** Locked after 7 days of inactivity (not active in local pre-live mode).

---

## 2. Incident Lifecycle

Critical alerts follow a rapid response lifecycle to minimize tenant downtime:

```
[Detected] ──> [Investigating] ──> [Mitigated] ──> [Resolved] ──> [Closed]
```

1. **Detected:** Automatically detected via high-severity audit logs or manual escalations.
2. **Investigating:** Owner assigned; root cause analysis (RCA) underway.
3. **Mitigated:** Temporary bypass applied (e.g., routing traffic around a broken SMS provider).
4. **Resolved:** Permanent fix deployed and verified.
5. **Closed:** Postmortem reports logged; action items scheduled.

---

## 3. Severity & Incident Definitions

We classify tickets and incidents based on operational impact:

| Severity Level | Definition | Response Target | Example |
|---|---|---|---|
| **Sev1 (Critical)** | Entire service down. Core booking engine or database inaccessible. Multi-tenant impact. | **Immediate (< 15 mins)** | Payment gateway webhook signature validator failing globally. |
| **Sev2 (Major)** | Major functionality broken with no workaround. Single large tenant fully impaired. | **< 1 hour** | Outbox service unable to send SMS/Email due to account suspension. |
| **Sev3 (Moderate)** | Recoverable issue or minor feature broken with workaround available. | **< 4 hours** | Custom domain SSL certificate verification stuck for a new tenant. |
| **Sev4 (Minor)** | UI cosmetic bugs, pricing plan question, feature requests. | **< 24 hours** | Media upload warning due to high base64 inline image optimization alert. |

---

## 4. Playbooks for Common Scenarios

### Scenario A: Booking Failed (Booking Engine Exception)
* **Indication:** Audit log category `booking` with action `booking_failed`.
* **Playbook:**
  1. Locate the `correlationId` of the failed attempt in the Super Admin Observability dashboard.
  2. Inspect `safeDetails` for error stack or validation failure.
  3. If it is an input error (missing consent/fields), notify the tenant owner to adjust the booking form.
  4. If it is a storage lock exception, escalate to database maintenance.

### Scenario B: Payment Webhook Mismatch
* **Indication:** Audit log category `payment` with warning/error status.
* **Playbook:**
  1. Access the ticket generated automatically under `payment_billing`.
  2. Inspect the webhook metadata payload (sensitive keys are redacted in audit, inspect the raw Stripe/Iyzico logs if necessary).
  3. Run the "Background Subscription Sweep" on the Scheduler Page to force-align the local database status with the provider's subscription records.

### Scenario C: Custom Domain Verification Stuck
* **Indication:** Warning event in the `domain` category.
* **Playbook:**
  1. Check the Cloudflare/DNS provider records for the tenant's slug/custom CNAME.
  2. Ask the salon owner to verify their DNS target points exactly to `giris.randevulari.com`.
  3. Once DNS propagation is confirmed, trigger manual SSL verification via the Onboarding page.

### Scenario D: Outbox (SMS / Email) Delivery Failed
* **Indication:** Critical alert or ticket with source `communication_outbox`.
* **Playbook:**
  1. Review the outbox history. Identify if the failure is provider-specific (e.g., Netgsm API error).
  2. Switch the active communication channel provider to the secondary backup provider in settings.
  3. Retry sending pending messages in the Outbox Queue.

### Scenario E: Background Job Failed
* **Indication:** Warning or Error audit logs in `system` category.
* **Playbook:**
  1. Open the **Zamanlayıcı & Arka Plan (Scheduler)** page.
  2. Find the failed job type (e.g., `subscription_past_due_sweep`).
  3. Click **Şimdi Çalıştır** to manually re-run in pre-live simulation and verify if it completes without exceptions.

### Scenario F: Abuse / Spam Booking Blocked
* **Indication:** Category `anti_abuse` with action `booking_blocked_no_show` or `booking_blocked_rate_limit`.
* **Playbook:**
  1. System blocks the client's phone number automatically. A support ticket is logged.
  2. Contact the salon owner to confirm if they wish to whitelist the customer.
  3. To override blockages, the salon owner can manually book the customer from their administrative panel.

### Scenario G: Media Upload Rejected (SVG / Script Injection Security Block)
* **Indication:** Audit event `media_validation_failed` under category `media`.
* **Playbook:**
  1. Locate the file metadata in the audit log details.
  2. Confirm the block reason: LARİ forbids SVG XML code or executable extensions in logos/cover images to prevent cross-site scripting (XSS) attacks.
  3. Advise the user to convert their logo to a standard web format (PNG or JPEG) and re-upload.

---

## 5. Founder / Super Admin Daily Review Checklist

The following tasks are recommended for the founder/Super Admin to execute daily to maintain maximum SaaS hygiene and operational readiness:

- [ ] **Review New Audit Logs:** Filter for `critical` and `error` severities from the past 24 hours. Ensure all flagged issues have been reviewed.
- [ ] **Sweep Support Queue:** Address any open tickets. Move resolved items to closed.
- [ ] **Inspect Background Jobs:** Verify that the daily subscription and outbox cron jobs are running successfully.
- [ ] **Check Pilot Client Status:** Inspect the active list of pilot salons for verification roadblocks or custom domain requests.
- [ ] **Ensure Data Sanitization:** Verify that audit logs contain no raw card numbers, passwords, or secrets.
- [ ] **Confirm Local Mode:** Re-verify that no live API keys or alerts are accidentally pushing to production SaaS accounts during the pre-live pilot.
