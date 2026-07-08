# LARI - PAYMENTLESS PRODUCTION DATA CUTOVER MATRIX

This document outlines the current data persistence readiness and cutover roadmap for each functional domain of the LARİ system when transitioning to the **paymentless_limited_production** mode.

In this mode, all transaction-critical domains (such as Tenant registration, Staff, Catalog, Public Booking, and Manual Billing) **must run on the persistent Supabase database**. Transient/sandbox domains can temporarily remain in simulated mode with warnings.

---

## PRODUCTION DATA CUTOVER STATUS MATRIX

| Domain | Local Mode Status | Supabase Implementation Status | Required for Paymentless Production? | Current Blocker | Required Fix / Migration Steps | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tenant Registration** | Offline (`localStorage`) | Fully Mapped / Active | **YES** | None | Ensure `VITE_DATA_MODE` is set to staging/production on launch. | **CRITICAL** |
| **Super Admin Provisioning** | Offline UI panel | Fully Mapped / Active | **YES** | None | Verify that provisioning creates a real row in `tenants` and `subscriptions` with `manual_active` status. | **CRITICAL** |
| **Owner Auth/Login** | Simulates auth | Fully Mapped via Supabase Auth | **YES** | None | Configure Supabase Auth redirect URLs to target `randevulari.com`. | **CRITICAL** |
| **Business Profile** | `localBusinessProfileRepository` | `supabaseBusinessProfileRepository` | **YES** | None | Ensure `VITE_DATA_MODE` starts with `supabase`. | **HIGH** |
| **Services / Catalog** | `localCatalogRepository` | `supabaseCatalogRepository` | **YES** | None | Ready to pull services from Supabase. | **HIGH** |
| **Staff** | Local JSON Store | Supabase mapped | **YES** | None | Verify RLS policies on `staff` table. | **HIGH** |
| **Working Hours & Availability** | Simulates slots | Supabase mapped | **YES** | None | Map business working hours and personnel calendars. | **HIGH** |
| **Branches** | Multi-branch in local storage | Supabase branches table | **YES** | None | Ensure multi-branch records are properly assigned to the logged-in `tenant_id`. | **HIGH** |
| **Public Booking** | `localBookingRepository` | `supabaseBookingRepository` | **YES** | None | Ensure the booking page reads live staff and catalog slots and writes appointments directly to Supabase. | **CRITICAL** |
| **Appointment Self-Service Tokens** | Stored in local JSON | Mapped to Supabase self-service tokens | **YES** | None | Verify that cancellation/reschedule tokens cannot be modified or forged by customers. | **HIGH** |
| **Cancellation / Reschedule Requests** | Local simulation | Supabase mapped | **YES** | None | Verify email/SMS notifications of customer changes. | **MEDIUM** |
| **Customers** | Local customer list | Supabase `customers` table | **YES** | None | Customer lists must be strictly isolated via RLS. | **HIGH** |
| **Customer Notes / Memory** | Local notes | Supabase customer notes | **YES** | None | Ensure memory logs are encrypted or securely stored under RLS. | **MEDIUM** |
| **Subscriptions & Manual Billing** | Local list on BillingTab | Supabase `subscriptions` table | **YES** | None | Make sure `BillingTab.tsx` loads the `manual_active` status from the DB. | **CRITICAL** |
| **Communication Outbox** | Simulates send queue | Database outbox queue | **YES** | None | The communication outbox resides in Supabase for queuing and manual delivery (local outbox strategy). | **HIGH** |
| **Audit Logs** | Local memory logs | Supabase `audit_logs` table | NO (Optional) | None | Logs are preferred in DB but can be local-only with a warning during limited launch. | **LOW** |
| **Support Tickets** | Local store | Supabase `support_tickets` table | NO (Optional) | None | Tickets can fallback to manual email support if database is not fully mapped. | **LOW** |
| **Background Job Runs** | Local cron simulation | Cron logs on Supabase | NO (Optional) | None | Scheduler can run on local loop or edge cron without blocking basic bookings. | **LOW** |
| **Media Asset Metadata** | Local assets | Supabase Storage bucket | NO (Optional) | None | Media upload can use a local/media placeholder strategy if storage bucket is pending. | **MEDIUM** |
| **Legal Document Versions** | `legalDocumentService` local | Supabase `legal_documents` table | **YES** | None | Ensure the 12 mandatory documents and versions are loaded correctly. | **HIGH** |
| **Policy Acceptance Records** | `policyAcceptanceService` | Supabase `policy_acceptances` table | **YES** | None | Must store consent status persistently to survive browser cache clearings. | **HIGH** |
| **Consent Ledger** | `consentLedgerService` | Supabase `consent_ledger` table | **YES** | None | Immutable consent records must reside in the persistent DB. | **HIGH** |
| **Data Rights Requests** | `dataRightsRequestService` | Supabase `data_rights_requests` | **YES** | None | GDPR/KVKK requests must be persisted to allow auditing and response tracking. | **HIGH** |
| **Data Export** | `dataExportService` | Active for both local and Supabase | **YES** | None | Export feature allows Super Admin to export the complete state in JSON/CSV. | **HIGH** |
| **Migration Dry-Run** | `migrationDryRunService` | Simulated dry-run | NO (Optional) | None | Migration rehearsal checks parity before database writes. | **LOW** |

---

## CRITICAL RISK MITIGATION SUMMARY

1.  **LocalStorage Bypass Guard:**
    *   To prevent silent data-loss, a hard guard must block any attempt to read or write transaction data from/to `localStorage` when running in `paymentless_limited_production` mode.
2.  **Auth Persistence:**
    *   Authentication is strictly handled by Supabase Auth (`supabase.auth.onAuthStateChange`). Local session mocks must be completely locked in production.
3.  **RLS Hardening:**
    *   Row Level Security policies on Supabase tables (especially `tenants`, `appointments`, `customers`, and `consent_ledger`) must be activated and verified before the first pilot client goes live.
4.  **Staging Environment Validation Gate:**
    *   Passing local pre-live checks is beneficial, but does not equal a physical database success. A **successful real staging smoke test** is a hard block before proceeding to production. Note that **iyzico is not required** for staging verification.

- **Staging Execution Runbook**: [Runbook](./SUPABASE_STAGING_EXECUTION_RUNBOOK.md)
- **Staging Environment Preflight Script**: [Preflight](../scripts/verify-supabase-staging-env.mjs)
- **Migration Integrity Script**: [Migration Check](../scripts/verify-supabase-migration-integrity.mjs)
- **RLS Tenant Isolation Smoke Test Plan**: [RLS Test Plan](./SUPABASE_RLS_TENANT_ISOLATION_SMOKE_TEST.md) and SQL-level assertions [paymentless_production_rls_smoke.sql](../supabase/tests/paymentless_production_rls_smoke.sql)
- **App-Level Staging Smoke Test**: [smoke-supabase-paymentless-staging.mjs](../scripts/smoke-supabase-paymentless-staging.mjs)
- **Staging Seed Data Plan**: [Staging Seed Data Plan](./SUPABASE_STAGING_SEED_DATA_PLAN.md)

