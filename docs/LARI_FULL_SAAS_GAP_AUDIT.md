# LARİ Full SaaS Gap Audit

An exhaustive, multi-dimensional, zero-assumption SaaS readiness audit. This register analyzes the exact path from LARİ's current high-fidelity local execution environment to a robust, legally-secure, multi-tenant global production platform on the public internet.

---

## Part 1 — Key Constraints & Current State Summary

Currently, LARİ leverages a robust, simulated **Local Sandbox Mode** backed by active `localStorage` buffers and localized services. 
*   **The Brand is 100% Intact**: No raw mock placeholders are presented to users. Visual headings are premium, human, and professional.
*   **Safety Level is Absolute**: There are zero raw credit card fields, zero exposed credentials, and zero direct integrations with live payment APIs, SMS gateways, or mail systems.
*   **Domain Strategy is Defined**: Turkey market strategy centers on `randevulari.com`.

---

## Part 2 — Comprehensive Audit by Category

### 1. Product Completeness

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Booking & Multi-Branch** | Supported via unified state. `/booking` can dynamically swap branches for `Kurumsal` tiers. | Needs direct geo-distance calculations on public lists to sort branches by coordinates. | **P2** — Medium. |
| **Rescheduling & Canceling** | Handled in `appointmentService.ts` with instant outbox queue hook triggers. | Needs public tokenised link generation (e.g., `/booking/cancel/[token]`) so end users can self-cancel without logging into the merchant dashboard. | **P1** — High. |
| **No-Show Tracking** | Operators can flag states (`completed`, `no_show`). | Needs automated penalty rating inside `customerCampaignService.ts` to flag "serial" no-show callers during live booking. | **P2** — Medium. |
| **Staff & Service Buffer Slots** | Service duration mapped properly. Availability planner calculates matching slots. | Needs custom setup for staff-specific resting times, shift shifts, and holiday calendars (currently uses flat 09:00 - 18:00 defaults). | **P1** — High. |
| **Overlapping Bookings** | Staff slots are locked instantly upon appointment confirmation. | Staff allocation concurrency locks. Needs transaction-level isolation during API database writes. | **P1** — Deep DB concurrency. |

---

### 2. Public Site & Domain Readiness

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Subdomain Routing & Wildcard SSL** | `siteProvisioningService.ts` reserves slugs and returns subdomains. | Requires wildcard DNS record (`*.randevulari.com`) at Cloudflare/Route53, matching Reverse Proxy (Nginx/Envoy) rewrite rules, and a Wildcard Let's Encrypt SSL certificate. | **P0** — Absolute Launch Blocker. |
| **SPA Single-Page Redirects** | Works inside Vite development fallback routes. | Nginx or router configuration must catch wildcard requests and route them to dynamic tenant components without 404ing static directories. | **P0** — Admin Infra Task. |
| **Custom Domains Gating** | Custom domains requested are stored in state. UI gates this to Premium/Kurumsal tiers. | Needs a dynamic domain mapper (e.g., CNAME pointer verify script) checking TXT DNS records to map `sacvemakyaj.com` to `sacvemakyaj.randevulari.com`. | **P1** — High operational overhead. |
| **SEO & Sitemap Readiness** | Structured metadata is configured statically on the public viewport. | Needs dynamic SSR headers (Next.js, Remix, or Vite SSR with Express middleware) to inject salon descriptions, keywords, and structural Open Graph tags into the raw HTML before rendering in client. | **P2** — SEO-critical. |

---

### 3. Self-Service Onboarding

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Profile & Media Upload** | Simulated base profiles. Dummy logo paths. | Requires active Cloud Storage (S3, Cloud Storage, or Supabase Storage) bucket integration with secure signed upload policies. | **P0** — Launch Blocker. |
| **Incomplete Setup Recovery** | The Admin dashboard guides setup steps. | Missing outbox "recovery emails" triggered 24-48-72 hours after registration if the salon has registered but added no services or staff. | **P2** — Growth Funnel. |
| **Share Toolkit Generator** | Creates localized booking link boxes. | Missing QR Code generation (exportable PNG) directly inside the browser for salons to print and stick on their mirrors. | **P1** — Crucial marketing benefit. |

---

### 4. Manual/Offline Sales Operations

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Super Admin Interface** | `/admin/super-admin` lets team provision accounts manually, choose plans, grant free referral periods, and write legal notes. | Needs detailed role privilege mapping so sales representatives can issue demo licenses but only managers can approve billing overrides. | **P2** — Operational control. |
| **Support Handoff** | System auto-triggers internal notes upon provisioning. | Missing integration linking Super Admin handoff alerts to Jira, Slack, or Trello to alert onboarding support operators. | **P3** — Nice-to-have. |

---

### 5. Billing & Subscription Lifecycle

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Subscription Transitions** | `subscriptionService.ts` parses states perfectly. Downgrades are scheduled; upgrades are immediate. | Needs cron jobs or background server workers checking current times against `currentPeriodEnd` daily to cycle states. | **P0** — Core billing scheduler. |
| **Grace Periods & Past Due** | Alerts are queued upon entering `past_due`. | Needs automated grace period rules (e.g., lock dashboard after 7 days, but allow customers to book for 3 more days). | **P1** — Operational policy. |
| **Corporate Taxation & Billing Ledger** | Flat fees recorded. Info fields exist. | Turkey market requires dynamic invoice generation calculating 20% KDV (VAT) and generating electronic SMMM financial outputs. | **P1** — Crucial for Turkey local sales. |

---

### 6. Payments Gateway (Iyzico Integration)

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Card Fields & Staging** | Simulated with secure external forms. No card data saved in local system. | Crucial live Iyzico API script deployment. Integration with 3D Secure redirect logic. | **P0** — Critical Payment Route. |
| **Webhook Idempotency & Signatures** | Mock validation exists. | Live webhooks must verify payload MD5 signatures from Iyzico, check database transaction ledger logs, and skip duplicate events to prevent double-crediting. | **P1** — Financial security. |
| **Refunds & Retries** | Manual support workflows only. | Automatic payment retries (smart retry scheduling) in Iyzico when card collection fails on recurring billing anniversaries. | **P1** — Churn prevention. |

---

### 7. Notifications & Communication

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Outbox Queue Layout** | Multi-channel communication events logged securely in outbox database. | Missing live external routing handlers connecting `queued`/`rendered` events to Twilio, NetbGSM, InfoBip, WhatsApp Business API, or Resend SMTP. | **P0** — SMS/Email Delivery. |
| **Delivery Status & Retries** | Status flags exist (`queued`, `sent`, `failed`). | Real webhook endpoints from SMS/Email providers must update status trackers to handle temporary delivery blocks. | **P2** — Operational visibility. |
| **Localized Communication Guard**| Dynamic Turkish-to-English translation mapping is fully established. | Missing granular frequency control (e.g., ensure no customer gets more than 2 SMS notifications per hour to prevent spam). | **P2** — Abuse prevention. |

---

### 8. Security & Access Control

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Owner Session Security** | Gated on routes. Auth contexts exist. | Replace state auth tokens with HTTP-Only secure cookies containing expiring JWT signatures, protecting sessions against potential local-storage XSS leaks. | **P1** — Core security standard. |
| **Multi-Tenant Isolation** | Evaluated via dynamic `tenantId` parameters. | Needs database-level policies (Supabase RLS or PostgreSQL Tenant-isolation schemas) ensuring no SQL query can accidentally cross-read another tenant's rows. | **P0** — Tenant privacy blocker. |
| **Sensitive Data Exposure** | Support snapshot tool isolates private notes. | Needs dynamic visual obfuscation (masking email characters and phone arrays) when Super Admins view operational dashboards. | **P2** — Privacy. |

---

### 9. Data, Persistence & Disaster Recovery

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **LocalStorage Database Fallback** | Perfectly robust client-side storage for demonstration. | Dynamic production cutover to Postgres on Supabase with migrations activated. | **P0** — Persistence blocker. |
| **Database Backups** | Local JSON data downloads are configured. | Automated daily Cloud Postgres backup cron tasks, system recovery tests, point-in-time recovery configurations. | **P1** — DR Readiness. |
| **Disaster Recovery SLA** | Offsite staging manual protocols documented. | Infrastructure provisioning scripts (Terraform/Ansible) to rebuild complete web/API nodes automatically in minutes. | **P2** — Ops stability. |

---

### 10. Legal, Privacy & Compliance (KVKK / GDPR)

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Explicit Consent Engine** | Built into booking sheets with granular check parameters. | System must permanently log timestamped, cryptographically hashed consent records (ETK/KVKK) to show audit trails during customer audits. | **P1** — Turkey Legal compliance. |
| **Anonymization Scripts** | Structured data export and client anonymizers mapped. | Missing automated self-service account deletion for end-customers wishing to invoke their "Right to be Forgotten." | **P2** — Privacy control. |

---

### 11. Multi-Market & Localization

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Multi-Lingual Infrastructure** | Localized TR and EN structures exist in templates and static headings. | Missing full translations for static legal policies and terms of service (ToS). | **P2** — Editorial. |
| **Currency & Format Standardization** | Uses local variables (TRY/₺) dynamically. | Missing localized business hours formatting checks (e.g., matching AM/PM toggles for global sites vs. absolute 24-hour systems for TR). | **P2** — Format safety. |

---

### 12. Commercial Packaging & Entitlements

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Entitlements Gating** | Active checks verify tier logic (e.g., branch caps, custom domain flags). | Frontend blocks work, but backend APIs must enforce absolute rate and payload volume checks to prevent advanced users from circumventing UI. | **P1** — Payload security. |

---

### 13. Analytics & Funnel Tracking

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Conversion Mechanics** | Simulated locally with secure event tracking. | Needs lightweight, privacy-compliant server-side tracking (e.g., server-side Google Analytics or self-hosted Plausible) to track registration drop-offs. | **P2** — Funnel marketing. |

---

### 14. Support Operations

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Ticket-like Workspace** | Admin can file requests; logs are generated locally. | Dynamic automated forwarding email routing admin tickets to live Zendesk, Freshdesk, or support email buffers. | **P1** — Immediate help funnel. |

---

### 15. Observability & Reliability

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **App Error Boundaries** | Global error catchers display helpful retry sheets. | Live logging alerts to Sentry, Highlight, or log collectors to catch unexpected runtime errors. | **P1** — Quality control. |

---

### 16. Abuse & Fraud Prevention

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Spam Booking Mitigation** | OTP logic outline in communication steps. | Missing active phone SMS verification (OTP code check) for anonymous customers completing bookings. | **P0** — Protection against salon spam attacks. |
| **Reserved Slugs Safeguard** | Local blacklists exist. | Hardened list must intercept trademarked identifiers (e.g., `admin`, `lari`, `randevulari`, `google`, `facebook`, `instagram`, `pricing`, `demo`). | **P1** — Branding protection. |

---

### 17. Performance & Frontend Quality

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Bundle Sizes & Asset Loads** | Vite optimizations exist. | Asset optimization chain to resize, compress, and cache salon logo uploads automatically before serving. | **P2** — Core performance ranking. |

---

### 18. Launch Operations & Cutover Runbook

| Vector | Current State | Live Production Gap | Severity / Action |
|:---|:---|:---|:---|
| **Release Management** | Clear instructions listed in operational guides. | Scripted blue-green deploy commands to replace running containers with zero down time. | **P1** — Stability. |
