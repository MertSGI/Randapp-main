# Communication Provider Contract Matrix

This matrix defines the distribution expectations, consent boundaries, delivery channels, and server vs. client runtime obligations for all LARİ system communications.

| Flow | Local outbox behavior | Email provider expectation | SMS provider expectation | WhatsApp provider expectation | frontend allowed? | edge/server required? | consent required? | delivery status source | notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **owner welcome** | queued & rendered | Resend / SMTP transaction email with welcome packet | - | - | Yes (Registration) | Yes (Edge) | No | Provider webhook (Resend email.sent) | Legally critical contract fulfillment, bypasses marketing consent |
| **onboarding completed** | queued & rendered | SMTP progress confirmation | - | - | Yes (Wizard) | Yes (Edge) | No | Provider webhook | Strategic onboarding retention loop |
| **public site preview ready** | queued & rendered | - | - | - | Yes | No | No | Local status set to rendered | Simulated on-the-fly dashboard link |
| **public site published** | queued & rendered | Strategic publish welcome email | Key feature notification text (fallbacks) | Interactive template message | Yes | Yes (Edge) | No | Provider webhook | Core merchant milestone notification |
| **booking created customer** | queued & rendered | HTML confirmation rich message | Text alert (fallback if option checked) | Interactive templates with digital reservation card | Yes | Yes (Edge) | Yes | Webhook from WhatsApp/Netgsm | Transactional: requires `bookingContactConsent` |
| **booking created owner** | queued & rendered | HTML notification copy | SMS notification warning | Instant template message | Yes | Yes (Edge) | No | Local / Webhook | Core notification flow for merchant planning |
| **booking reminder** | queued & rendered | Optional reminder mail | Core SMS reminder scheduled | WhatsApp interactable reminder prompt | Yes | Yes (Edge system scheduler) | Yes | Webhook status from carrier | Checked against `appointmentReminderConsent` 24h prior |
| **booking cancelled** | queued & rendered | Immediate HTML text copy | Immediate automated cancel SMS | Interactive template push | Yes | Yes (Edge) | Yes | Webhook from API | Verified template; status maps to cancelled if success |
| **booking completed** | queued & rendered | - | - | Post-care follow-up/feedback card | Yes | Yes (Edge) | Yes | Webhook | Consent check applies; gates customer reviews |
| **no-show** | queued & rendered | Transaction notice | Text check-in | Automated template prompt | Yes | Yes (Edge) | Yes | Webhook | Triggers on manual status shift in panel |
| **trial started** | queued & rendered | HTML invoice-compliant welcome message | - | - | Yes (Checkout) | Yes (Edge/DB webhook) | No | Provider webhook | Emphasizes 14-day trial duration, bypasses consent |
| **trial ending** | queued & rendered | 14-day duration warning (3 days remaining alert) | - | - | Yes (Scheduler) | Yes (Edge) | No | Provider webhook | Critical billing notification; warns of future payment |
| **past due** | queued & rendered | Urgent dunning template email | - | - | Yes (Webhook parser) | Yes (Edge) | No | Provider webhook | Dunning attempt alert; bypasses consumer consent |
| **manual subscription active** | queued & rendered | Custom manual receipt notification | - | - | Yes (Super Admin click) | Yes (Edge) | No | Provider webhook | Handles manual_invoice / offline_payment / pilot_exception |
| **plan upgraded** | queued & rendered | Premium invoice tier alert | - | - | Yes (Panel action) | Yes (Edge) | No | Provider webhook | Confirms instant limit increases, bypasses consent |
| **downgrade scheduled** | queued & rendered | Informational receipt | - | - | Yes (Panel action) | Yes (Edge) | No | Provider webhook | Confirms tier swap on current period end |
| **cancellation scheduled** | queued & rendered | Status notification | - | - | Yes (Panel action) | Yes (Edge) | No | Provider webhook | Confirms access remains active until current term end |
| **custom domain requested** | queued & rendered | DNS details & zone CNAME values mail | - | - | Yes (Panel click) | Yes (Edge) | No | Local status rendered | Support details sent; states custom domains take 24-48h |
| **custom domain active** | queued & rendered | Launch success banner email | - | - | Yes (Cron check) | Yes (Edge) | No | Provider webhook | Confirms dynamic routing & Let's Encrypt lease completed |
| **referral credit awarded** | queued & rendered | Free extension notice | - | - | Yes | Yes (Edge) | No | Provider webhook | System credit transaction confirmation |
| **support request created** | queued & rendered | Ticket registration & SLA pledge email | - | - | Yes (Help screen) | Yes (Edge) | No | Provider webhook | Serves transaction audit logs |

---

## Key Rules & Framework Compliance:

1. **Frontend Isolation Guardrail**: The client browser (frontend spa) is **never** permitted to execute direct API dispatch calls to carrier providers (Resend, SMTP hosts, Twilio, WhatsApp Cloud API, Netgsm). All notifications must trigger via server-side databases or isolated backend Edge Functions.
2. **Consent Gating**: Booking confirmations, reminders, cancellations, and completed follow-up surveys must fail-safe if `bookingContactConsent` or `appointmentReminderConsent` (transactional) or `marketingConsent` (campaigns/referrals) are absent. These transitions are safely marked as `skipped` in our simulation layer.
3. **Legal Compliance**: Strategic notifications (security requests, subscription billing, and manual activation receipts) are categorized under direct operational contracts and bypass opt-in consumer gates since they're required to fulfill owner agreements.
