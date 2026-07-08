# LARİ Observability Provider Contract Matrix

This table lists every primary telemetry signal, alert event, and audit log type implemented across LARİ, defining its local simulation behavior and future SaaS provider mappings.

| Signal/Event | Local behavior | Future Sentry expectation | Future OpenTelemetry expectation | Future backend log expectation | Contains PII? | Redaction required? | Super Admin visible? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **frontend render error** | Caught by `SafeErrorBoundary`, logged to local audit outbox. | Yes (Full React stack trace). | No | Yes (Web browser console / trace telemetry). | No | No (Only stack traces). | Yes | Catches client render bugs. |
| **route error** | Triggers SPA 404 fallback page. | No | No | Yes (Routing logs in ingress proxy). | No | No | Yes | Used to trace broken links. |
| **appointment create failure** | Displays localized error in the booking panel. Logs audit. | Only if unexpected code crash. | Yes (Increment failure metric). | Yes (Internal SQL / validation state logs). | Yes (Customer Name, Phone). | Yes (Filter name and redact phone). | Yes | High business impact. |
| **self-service token failure** | Access denied, warning logged. | Only on cryptographic failures. | Yes (Metric count). | Yes (Auth failure event logs). | Yes (IP Address, token string). | Yes (Tokens completely redacted). | Yes | Critical for secure client links. |
| **booking abuse block** | Block user, create support ticket automatically. | No | Yes (Metric for spam count). | Yes (Abuse database record and telemetry trace). | Yes (Phone, IP). | Yes (Phone masked in summaries). | Yes | Triggers self-defensive firewall. |
| **payment webhook mismatch** | Discrepancy logged. Ticket opened in `payment_billing`. | Yes (Alerts financial ops). | Yes (Metric). | Yes (Detailed payment state payload). | Yes (Merchant ID, Tx ID). | Yes (Redact raw token/payload). | Yes | Critical for SaaS billing integrity. |
| **subscription sweep failure** | Log error event. Re-run scheduled in background. | Yes (If database locks). | Yes (Failure rate). | Yes (Cron scheduler logs). | No | No | Yes | Monitored by Super Admin Scheduler. |
| **outbox delivery failure** | Ticket created under `communication` category. | No | Yes (Metric for retry counts). | Yes (Netgsm/Twilio delivery receipt failure logs). | Yes (Receiver phone/email). | Yes (Mask phone, redact message body). | Yes | Crucial for notification tracing. |
| **custom domain verification stuck** | warning event under `domain` category. | No | No | Yes (DNS resolver/Caddy proxy log alerts). | No | No | Yes | Handled by Onboarding & Verification team. |
| **media validation failure** | Block file upload, log event under `media`. | No | Yes (Security metrics). | Yes (WAF / file scanning logs). | No | Yes (Redact base64 script segments). | Yes | SVG and scripting are fully blocked. |
| **migration dry-run warning** | Warnings displayed in UI report, logged in `migration`. | No | No | Yes (Migration console reports). | No | No | Yes | Flags non-blocking base64 logos. |
| **data export created** | Log security audit under `data_export`. | No | Yes (Access tracking). | Yes (SecOps audit stream). | Yes (Requesting customer ID). | Yes (Redact internal notes). | Yes | Part of KVKK / GDPR compliance. |
| **support ticket created** | Open record in local queue, audit logged. | No | No | Yes (CRM database sync state). | Yes (Requester details). | Yes (Details redacted in audit log). | Yes | Manual or system generated. |
| **incident created** | Critical audit event logged. Alerts in dashboard. | Yes (If system-wide). | Yes (SLA counters). | Yes (SysOps command logs). | No | No | Yes | Initiates the Incident Playbook. |
| **security warning** | Log high-severity audit, trigger ticket if needed. | Yes | Yes (SecOps SIEM). | Yes (WAF / Authentication server logs). | Yes (IP address, usernames). | Yes (Redact password attempts). | Yes | Tracks brute force / brute checks. |

---

## Redaction Mandate
All production log pipelines **MUST** run the recursive redaction filter at the earliest edge before data leaves the LARİ network boundaries, ensuring compliance with Turkish KVKK (Personal Data Protection Authority) standards.
