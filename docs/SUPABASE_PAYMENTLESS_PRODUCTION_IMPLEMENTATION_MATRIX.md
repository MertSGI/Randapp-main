# LARI - Supabase Paymentless Production Implementation Matrix

This matrix tracks the data layer readiness of core live flows for the **paymentless_limited_production** launch mode. 

| Flow | Required for paymentless production? | Current local implementation | Current Supabase implementation | RLS ready? | Auth required? | Current status | Blocker? | Required next action |
|---|---|---|---|---|---|---|---|---|
| **Tenant registration** | Yes | `localTenantRepository` | `SupabaseTenantRepository` | Yes | No (Public signup) | Completed / Production Ready | No | Ready for live Auth deployment |
| **Manual tenant provisioning** | Yes | `localManualProvisioningRepository` | `SupabaseManualProvisioningRepository` | Yes (Super Admin) | Yes (Super Admin) | Completed / Production Ready | No | Ready for live Super Admin activation |
| **Owner auth / login** | Yes | `authService` mock owner session | Supabase Auth via email/password | Yes | Yes | Completed / Production Ready | No | Ready for live credentials |
| **Business profile** | Yes | `LocalBusinessProfileRepository` | `SupabaseBusinessProfileRepository` | Yes | Yes (Writes) | Completed / Production Ready | No | Unified via `repositoryFactory.ts` |
| **Services / catalog** | Yes | `LocalCatalogRepository` | `SupabaseCatalogRepository` | Yes | Yes (Writes) | Completed / Production Ready | No | Fully tested and mapped |
| **Staff** | Yes | `LocalCatalogRepository` | `SupabaseCatalogRepository` | Yes | Yes (Writes) | Completed / Production Ready | No | Mapped via `CatalogRepository` |
| **Working hours / availability** | Yes | `LocalCatalogRepository` | `SupabaseCatalogRepository` | Yes | Yes (Writes) | Completed / Production Ready | No | Query filters enforced |
| **Public booking** | Yes | `LocalBookingRepository` | `SupabaseBookingRepository` | Yes (Public inserts) | No (Anonymous / Public guest) | Completed / Production Ready | No | Safe anonymous inserts |
| **Appointment self-service token** | Yes | `localSelfServiceRepository` | `SupabaseSelfServiceRepository` | Yes | No (Secure hash-token) | Completed / Production Ready | No | Resolved - fully persistent token storage |
| **Cancellation / reschedule requests** | Yes | `localSelfServiceRepository` | `SupabaseSelfServiceRepository` | Yes | Yes (Approval) / No (Request) | Completed / Production Ready | No | Resolved - change request approvals persist in db |
| **Customers** | Yes | `LocalBookingRepository` | `SupabaseBookingRepository` | Yes | Yes (Writes) | Completed / Production Ready | No | Scope filtering enforced |
| **Subscriptions / manual billing** | Yes | `localSubscriptionRepository` | `SupabaseSubscriptionRepository` | Yes | Yes (Owner reads) | Completed / Production Ready | No | Manual subscription attributes mapped |
| **Communication outbox** | Yes | `localCommunicationOutboxRepository` | `SupabaseCommunicationOutboxRepository` | Yes | Yes | Completed / Production Ready | No | Outbox events persist in db |
| **Audit logs** | Yes | `localAuditEventRepository` | `SupabaseAuditEventRepository` | Yes | Yes | Completed / Production Ready | No | Critical events persist in db |
| **Support tickets** | Yes | `localSupportTicketRepository` | `SupabaseSupportTicketRepository` | Yes | Yes | Completed / Production Ready | No | Support tickets persist in db |
| **Legal document versions** | Yes | `localPolicyAndConsentRepository` | `SupabasePolicyAndConsentRepository` | Yes (Public reads) | No (Reads) / Yes (Writes) | Completed / Production Ready | No | Policy and versioning mapped |
| **Policy acceptance records** | Yes | `localPolicyAndConsentRepository` | `SupabasePolicyAndConsentRepository` | Yes | Yes | Completed / Production Ready | No | Resolved - acceptance tracking is persistent |
| **Consent ledger** | Yes | `localPolicyAndConsentRepository` | `SupabasePolicyAndConsentRepository` | Yes | Yes | Completed / Production Ready | No | Resolved - digital signature consent tracked |
| **Data export** | Yes | `dataExportService` | Enforced through `repositoryFactory` | Yes | Yes | Completed / Production Ready | No | Enforces active dataMode |
| **Migration dry-run** | Yes | `migrationDryRunService` | Enforced through `repositoryFactory` | Yes | Yes | Completed / Production Ready | No | Verification completed |

---

## Technical Feasibility & Completed Tasks

1. **Self-Service Token Security**: Completed. Appointment tokens are stored securely in the `appointment_access_tokens` table in Supabase. Checked dynamically with secure expiry and status updates.
2. **Cancellation Approvals**: Completed. Change request workflows (both cancellations and reschedules) are persisted in the `appointment_change_requests` table with full history and reviewed-by logs.
3. **Legal Compliance**: Completed. Policy and consent records are safely tracked and logged in the `policy_acceptances` and `consent_ledgers` tables.
4. **Clean Decoupling**: Enforced. `repositoryFactory.ts` manages proxying for all services, ensuring that the application cleanly and non-destructively falls back to local data modes during pre-live staging (`pilot_demo` / `local_pre_live`).
5. **Readiness Gate Hard Blockers**: Added. Core Priority 1 repositories (Business Profile, Services Catalog, Staff, Working Hours/Availability, Customers) are hard-blocked inside `productionReadinessGateService.ts` if their respective production-ready environment flags (`VITE_BUSINESS_PROFILE_REPO_READY`, `VITE_SERVICES_CATALOG_REPO_READY`, `VITE_STAFF_REPO_READY`, `VITE_AVAILABILITY_REPO_READY`, `VITE_CUSTOMER_REPO_READY`) are not explicitly set to `"true"`.
6. **No-Fallback Storage Guard**: Verified. Core salon and client databases are added to the prohibited list in `productionStorageGuardService.ts`, ensuring that `localStorage` is strictly rejected for active production/live modes.
7. **Staging Readiness Pipelines**: Integrated. Real staging smoke testing must pass before live cuts are allowed. Fictional seed data, preflight validations, and migration check scripts are established.

- **Staging Execution Runbook**: [Runbook](./SUPABASE_STAGING_EXECUTION_RUNBOOK.md)
- **Staging Environment Preflight Script**: [Preflight](../scripts/verify-supabase-staging-env.mjs)
- **Migration Integrity Script**: [Migration Check](../scripts/verify-supabase-migration-integrity.mjs)
- **RLS Tenant Isolation Smoke Test Plan**: [RLS Test Plan](./SUPABASE_RLS_TENANT_ISOLATION_SMOKE_TEST.md) and SQL-level assertions [paymentless_production_rls_smoke.sql](../supabase/tests/paymentless_production_rls_smoke.sql)
- **App-Level Staging Smoke Test**: [smoke-supabase-paymentless-staging.mjs](../scripts/smoke-supabase-paymentless-staging.mjs)
- **Staging Seed Data Plan**: [Staging Seed Data Plan](./SUPABASE_STAGING_SEED_DATA_PLAN.md)


