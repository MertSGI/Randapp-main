# LARİ Founder Readiness Scorecard

Dear Founder: The LARİ core SaaS layer is structurally robust. This document tracks the status of the platform from a pre-live business perspectives.

---

## 1. Quick Executive Answers (True Staging Capabilities)

| Critical Founder Question | Live Answer | Operational Status |
|:---|:---|:---|
| **Can I demo it today?** | **YES**. Core visual flows (booking, schedule calendars, pricing tables, super admin panels) are fully responsive, performant, and premium. | **Ready for Staging Demo** |
| **Can I sell it manually today?** | **YES**. Use the Super Admin portal (`/admin/super-admin`) to immediately provision new salons, assign customized premium plans, record manual offline billing types, and add internal notes. | **Structurally Ready** |
| **Can I onboard a pilot manually today?** | **YES**. Salons can use their local system console to set branches, create catalogues, and manage client lists. Follow the operational guide: `docs/FIRST_MANUAL_PILOT_OPERATING_PACK.md`. | **Staging Ready** |
| **Can a customer self-register today?** | **YES**. The self-service `/register` page runs perfectly, instantly creating tenant profiles and directing owners to the setup console. | **Structurally Ready**|
| **Can real payments be charged today?** | **NO**. Live Iyzico API keys are isolated to prevent unsafe card exposure. Staging checkouts use secure mock environments. | **Needs External Setup** |
| **Can subdomains open on the public internet?** | **NO**. Dynamic subdomains are calculated correctly in code, but require a Wildcard DNS (`*.randevulari.com`) record to resolve dynamically. | **Needs External Setup** |
| **Can custom domains go live today?** | **NO**. Domains requested are tracked, but DNS pointers require real server-side proxy config. | **Needs Implementation** |
| **Can real emails/WhatsApp/SMS go out?** | **NO**. To prevent stray charges and spam during pre-live staging, all notifications are stored in LARİ's local communication outbox panel. | **Needs External Setup** |
| **Can we migrate to Supabase today?** | **YES**. Connect custom environment strings to transition data storage to your external Postgres DB securely. | **Structurally Ready** |

---

## 2. Readiness Scorecard by Domain

*   **Product Readiness**: **Ready**
    *   *Status*: Booking engines, multi-branch, services catalog, and staff management operate natively.
*   **Sales Readiness**: **Ready**
    *   *Status*: Manual sales, discount overlays, and offline custom plans are fully integrated into the management dashboard.
*   **Provisioning Readiness**: **Structurally Ready**
    *   *Status*: Slug reservations, public URL calculations, and automated tenant workspace setups compile perfectly.
*   **Billing Readiness**: **Structurally Ready**
    *   *Status*: Trials, past_due grace cycles, upgrades, downgrades, and referral month credits function reliably.
*   **Payment Readiness**: **Needs External Setup**
    *   *Status*: Ready to swap live Iyzico credentials and complete 3D Secure redirections.
*   **Domain Readiness**: **Needs External Setup**
    *   *Status*: Wildcard SSL and DNS structures are fully mapped in the operations runbooks.
*   **Data Readiness**: **Structurally Ready**
    *   *Status*: Multi-tenant tables exist; database connections support PostgreSQL.
*   **Security Readiness**: **Structurally Ready**
    *   *Status*: Sensitive info is obfuscated in export tools; route guards prevent unauthenticated dashboard access.
*   **Legal Readiness**: **Structurally Ready**
    *   *Status*: KVKK and client consent options are fully visible in public booking checkouts.
*   **Support Readiness**: **Structurally Ready**
    *   *Status*: In-app support tickets work locally; Super Admins can audit tenant event issues instantly.
*   **Global Readiness**: **Structurally Ready**
    *   *Status*: Standard layout utilizes Turkish localization while supports easily scale for global currency configurations.
*   **QA Readiness**: **Ready**
    *   *Status*: Core product behavior is defended by comprehensive, automated validation suites.
*   **Launch Readiness**: **Needs Implementation** (Pending infrastructure setup)

---

## 3. Core Pre-Launch Action Plans

### What must be done before first real paid pilot?
1.  **Deploy dynamic staging DB on Supabase**: Transition the data model into real persistent postgres storage.
2.  **Establish Wildcard DNS entry**: Point `*.randevulari.com` to the gateway IP.
3.  **Map SMS and SMTP Providers**: Swap the communication switch from local outbox simulation to Twilio/NetbGSM/Resend SMTP APIs.
4.  **Connect Iyzico Test Sandbox**: Run card trials with test credit card numbers.

### What must be done before full public launch?
1.  **Switch Iyzico to Production mode**: Undergo local banking card checks and accept regular card processing fees.
2.  **Enable Row Level Security (RLS)**: Audit db queries.
3.  **Conduct Legal Document Review**: Confirm the Turkish terms (Kullanım Koşulları) and Cookie preferences are finalized by counsel.
4.  **Setup Automated Billing Worker**: Run a nightly Cron scheduler to process recurring payments and suspends automatically.
