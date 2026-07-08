# Communication Consent and Compliance Checklist

This regulatory checklist ensures that LARİ's transactional, promotional, and operational notifications conform to Turkey's KVKK (Personal Data Protection Authority), ETK (Electronic Commerce Law), and İYS (Message Management System) structures, as well as global GDPR guidelines.

---

## 1. Mapped Notification Categories & Consent Policies

To prevent regulatory claims and preserve user privacy, communications are organized into different legal classifications:

```text
Message Type          Purpose                        Required Consent           Regulations Mapped
──────────────────────────────────────────────────────────────────────────────────────────────────
Booking Transaction   Booking confirmations &        bookingContactConsent /    KVKK (Implicit performance
                      immediate updates              reminderConsent            of contract exception)
Marketing / Campaign  Promotional offers, rewards    marketingConsent           KVKK (Explicit opt-in) &
                      & beauty trend newsletters                                ETK (İYS approval required)
Referral Campaign     Invites, referral code alerts, referralCampaignConsent   KVKK & ETK (Promotional)
                      and friend discount shares
Owner Account Status  Billing, password resets,      None (Contractual basis)   Standard SaaS TOS
                      active dunning alerts
Super Admin Notes     Internal system logs           None (Internal metadata)   Security & ISO Auditor
```

---

## 2. Key Regulatory Checkpoints for Turkey (İYS & KVKK)

Prior to shifting the platform run mode to `production_live`, the legal team must verify the following items:

*   [ ] **İYS (İleti Yönetim Sistemi - Turkey)**:
    *   Promotional emails and SMS messages must be cross-checked against Turkey's İYS database.
    *   No marketing message may be sent to an individual who has opted out of commercial message permissions on İYS.
    *   *System Action*: Sync İYS opt-out flags every 24 hours with local customer lists.
*   [ ] **Unsubscribe / Opt-out Options**:
    *   Every commercial email must contains a clear, one-click unsubscribe URL.
    *   Marketing SMS alerts must include opt-out text instructions (e.g., `LARI RED yaz 4616ya gonder`, etc.) or link options.
*   [ ] **WhatsApp Template & Opt-in Approval**:
    *   Meta WhatsApp templates must describe exact transactional flows and strictly avoid promotional clickbait language during approval.
    *   Customer active opt-in confirmation (checkbox on booking widgets) must be captured and logged.
*   [ ] **No-Card / Trial Wording Guardrails**:
    *   All user-facing screens must remain compliant with the 14-day trial standard, stating clearly that trials require a payment method setup but processing occurs only after the trial wraps up. All marketing files must not contain "no card required" variations.

---

## 3. Data Governance, Retentions, and Audit Logs

*   **Audit Trails**: Every customer consent state change (e.g. checkbox state shift or explicit unsubscribe click) must be written to a read-only audit log database containing:
    1.  Timestamp
    2.  IP Address / Source
    3.  Captured consent flags and version
*   **Message Retention**: Communication history logs must be purged or anonymized after two (2) years of contract completion, unless legal retention mandates apply due to invoice or tax requirements.
*   **Customer Deletion Action (KVKK Right to Erasure)**:
    *   When a customer submits a correction or deletion request via our `consentService.createCustomerDataRequest()` panel:
    *   All historical communications related to the customer must be deleted or completely anonymized, except financial/invoice transaction fields where records must be archived securely.

---

## 4. Operational Gaps Checklist (Before Real Provider Connection)

Execute these checks before setting the environment variable configurations:

1.  [ ] **Legal Sign-Off**: Confirm the KVKK disclosure texts and processing policies are prominently displayed in the booking widget footer.
2.  [ ] **SMS Provider SLA Agreement**: Confirm the SMS gateway API ensures 99.9% delivery within 10 seconds for transactional booking OTPs.
3.  [ ] **DSH Turkey Registration**: Verify the company holds official commercial registry documents for sending SMS with high corporate alpha headers.
4.  [ ] **Resend TLS**: Ensure SMTP and Resend configurations enforce strict TLS/SSL delivery handshakes, preventing cleartext transport.
