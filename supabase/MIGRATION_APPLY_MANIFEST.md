# LARİ Supabase Migration Apply Manifest

This manifest documents the active canonical migration graph, database schema ownership, and execution procedures for LARİ.

---

## 1. Active Migrations Sequence (Chronological)

All migrations in `supabase/migrations/` must be applied in the exact alphabetical/chronological order:

1. **`001_initial_schema.sql`** — Database initialization and primary core tables.
2. **`002_subscription_alignment.sql`** — Adds references between payments and subscriptions.
3. **`003_provisioning_onboarding.sql`** — Provisions onboarding tracking schemas.
4. **`004_iyzico_provider_alignment.sql`** — Adds sandbox subscription alignment structures.
5. **`005_salon_business_profile.sql`** — Provisions tenant public marketing profile tables.
6. **`20260601_lari_core_schema_alignment.sql`** — Aligns appointments, staff mapping, and templates.
7. **`20260619_lari_rls_policy_draft.sql`** — Consolidated unified RLS security rules.
8. **`20260620_paymentless_production_core_tables.sql`** — Self-service and paymentless tracking tables.
9. **`20260621_paymentless_production_repository_columns.sql`** — Manual/offline billing support columns.
10. **`20260622_paymentless_production_rls_identity_alignment.sql`** — Aligns core tables with users_profile lookup canonical RLS identity model.
11. **`20260713_communication_outbox_rls_hardening.sql`** — Drops unsafe communication_outbox broad write policy and installs scoped RLS policies.
12. **`20260714_tenants_update_rls_hardening.sql`** — Drops broad tenant UPDATE policy and legacy owner_user_id authorization on tenants.
13. **`20260715_super_admin_provisioning_rpc.sql`** — Adds atomic approve_and_publish_tenant RPC function for Super Admin.
14. **`20260716_public_booking_eligibility_rpc.sql`** — Adds public eligibility checker RPC function by slug.
15. **`20260720_public_booking_rpc.sql`** — Hardened transactional public booking RPC migration.
16. **`20260722_public_booking_search_path_fix.sql`** — Fixes search_path for SECURITY DEFINER functions to include extensions schema.
17. **`20260723_booking_lifecycle_foundation.sql`** — Stage A Database Scheduling Foundation, branches model, staff/service branch junction tables, appointments contract fields (branch_id, duration_minutes), shared evaluate_booking_slot engine, updated get_public_available_slots and create_public_booking RPCs.
18. **`20260724_admin_rls_and_read_model_fix.sql`** — Stage B.1 Fix, drops direct auth.users RLS dependency, adds current_user_owns_customer and current_user_can_access_tenant helpers, and installs server-scoped RPCs get_my_tenant_appointments and get_my_tenant_dashboard_summary.
19. **`20260725_admin_bootstrap_and_runtime_consistency.sql`** — Stage B.2 authenticated server-scoped admin bootstrap RPC. Adds get_my_admin_bootstrap() which derives tenant from auth.uid() server-side and returns tenant profile, business profile, active services, active staff, branches, and subscription summary in a single SECURITY DEFINER call. Eliminates per-tab availability fanout. REVOKE/GRANT scoped to authenticated role only.
20. **`20260726_admin_rpc_execute_acl_hardening.sql`** — Minimal forward-only EXECUTE ACL hardening for Stage B.1/B.2 admin RPCs (`get_my_admin_bootstrap`, `get_my_tenant_appointments`, `get_my_tenant_dashboard_summary`) and authorization helpers (`current_user_owns_customer`, `current_user_can_access_tenant`). Revokes EXECUTE privileges from PUBLIC and anon roles, granting EXECUTE strictly to authenticated.
21. **`20260727_admin_runtime_schema_contract_fix.sql`** — Forward-only Stage B.2 runtime repair fixing PostgreSQL 42703 errors (`website` -> `website_url` in `get_my_admin_bootstrap` and `a.user_id` -> `a.customer_id` in `get_my_tenant_appointments`). Reasserts strict SECURITY DEFINER and EXECUTE ACL contracts.
22. **`20260728_admin_rpc_live_schema_reconstruction.sql`** — Complete live-schema reconstruction of admin RPCs (`get_my_admin_bootstrap`, `get_my_tenant_appointments`, `get_my_tenant_dashboard_summary`) constructed strictly from verified database columns. Reasserts SECURITY DEFINER, search_path, and EXECUTE ACLs.
23. **`20260729_admin_bootstrap_subscription_contract_fix.sql`** — Stage B.2 Correction - Fixes PostgreSQL 42703 column reference in get_my_admin_bootstrap(): replaces non-existent sub.trial_end with canonical sub.trial_ends_at from public.subscriptions table, mapping both 'trial_end' and 'trial_ends_at' in returned JSON payload.
24. **`20260730_self_service_token_read_rpc.sql`** — Stage C1 Secure Read-Only Appointment Self-Service Contract: Provides public.get_public_appointment_by_manage_token(p_token text) RETURNS jsonb. Hashes raw token server-side, matches token_hash, checks expiration, and returns sanitized appointment, service, staff, and branch details. Returns neutral invalid_token error response for invalid/expired tokens. Preserves SECURITY DEFINER, search_path, and EXECUTE ACLs for anon and authenticated roles.
25. **`20260731_admin_appointment_status_mutation_rpc.sql`** — Stage D1 Server-Scoped Admin Appointment Mutation RPC: Creates admin_mutation_idempotency table and public.admin_update_appointment_status(UUID, TEXT, TEXT, TEXT) SECURITY DEFINER RPC. Resolves auth.uid() → users_profile for authorization, row-locks appointment FOR UPDATE, validates canonical status transitions (terminal states are immutable), writes audit_events within the same transaction, and supports 24h idempotency replay via p_idempotency_key. REVOKE FROM PUBLIC/anon, GRANT TO authenticated.
26. **`20260801_cancel_public_appointment_by_manage_token_rpc.sql`** — Stage E1 Secure Customer Appointment Cancellation via Manage Token: Provides public.cancel_public_appointment_by_manage_token(p_token text, p_reason text DEFAULT NULL) RETURNS jsonb. Hashes raw token server-side, row-locks appointment FOR UPDATE, transitions confirmed -> cancelled_by_customer, replays cancelled_by_customer -> cancelled_by_customer as no_change, returns invalid_transition for terminal states, and inserts audit_events and communication_outbox records transactionally on real mutations. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
27. **`20260802_cancel_public_appointment_by_manage_token_schema_fix.sql`** — Stage E1 Schema Correction: Updates cancel_public_appointment_by_manage_token RPC to set status = 'cancelled_by_customer' and updated_at = now() on public.appointments without referencing non-existent columns (cancel_reason, cancelled_at, cancelled_by). Preserves full transactional logging of cancel_reason in audit_events and communication_outbox records. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
28. **`20260803_cancel_public_appointment_by_manage_token_audit_outbox_fix.sql`** — Stage E1 Audit & Outbox Schema Correction: Aligns audit_events and communication_outbox column names with canonical database schema in cancel_public_appointment_by_manage_token RPC. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
29. **`20260804_appointments_direct_update_hardening.sql`** — Stage D2B Appointment Direct-Write Database Hardening: Revokes table and column UPDATE privileges on public.appointments from PUBLIC, anon, and authenticated roles. Removes obsolete UPDATE RLS policies. Requires all status mutations to route through SECURITY DEFINER RPCs (admin_update_appointment_status, cancel_public_appointment_by_manage_token).
30. **`20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql`** — Stage F1 Secure Customer Appointment Rescheduling Request via Manage Token: Provides public.request_public_appointment_reschedule_by_manage_token(p_token text, p_requested_date date, p_requested_time text, p_reason text DEFAULT NULL, p_idempotency_key text DEFAULT NULL) RETURNS jsonb. Hashes raw token server-side, row-locks appointment FOR UPDATE, validates confirmed status eligibility, checks slot availability, and inserts a pending change-request into public.appointment_change_requests, with audit_events and communication_outbox records transactionally. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
31. **`20260806_request_public_appointment_reschedule_outbox_fix.sql`** — Stage F1 Outbox & Single Pending Request Correction: Updates communication_outbox metadata event_type to 'reschedule_request_created' and adds partial unique index idx_appointment_change_requests_pending_reschedule enforcing at most one active pending reschedule request per appointment at the database engine layer. Returns reason_code = 'request_already_pending' when a pending request already exists. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
32. **`20260807_get_public_pending_reschedule_request_by_manage_token_rpc.sql`** — Stage F2 Secure Pending Reschedule Request Read RPC: Provides public.get_public_pending_reschedule_request_by_manage_token(p_token text) RETURNS jsonb. Server-side token validation and pending reschedule request lookup for Stage F2 UI. Hashes raw token using SHA-256 against public.appointment_access_tokens, resolves appointment server-side, and returns active pending reschedule request if present. REVOKE FROM PUBLIC, GRANT EXECUTE TO anon and authenticated.
33. **`20260808_admin_reschedule_request_decision_rpc.sql`** — Stage F3 Admin Reschedule Request Decision Backend: Provides public.admin_list_pending_reschedule_requests and public.admin_decide_reschedule_request SECURITY DEFINER RPCs. Creates admin_reschedule_decision_idempotency table. Supports tenant_owner / super_admin approval and rejection of customer reschedule requests with server-side slot revalidation, atomic schedule updates, and transactional audit/outbox logging. REVOKE FROM PUBLIC, REVOKE FROM anon, GRANT EXECUTE TO authenticated.
34. **`20260809_admin_reschedule_decision_lock_and_reason_fix.sql`** — Stage F3 Advisory Lock Alignment & Customer Reason Preservation Correction: Adds resolution_reason column to public.appointment_change_requests to preserve original customer reason during admin rejection/approval. Aligns admin_decide_reschedule_request concurrency lock with create_public_booking by acquiring pg_advisory_xact_lock(hashtextextended(tenant_id:staff_id:proposed_date, 0)). REVOKE FROM PUBLIC, REVOKE FROM anon, GRANT EXECUTE TO authenticated.

---

## 2. Archived / Excluded Migrations

* **`20260526_initial_schema.sql`**: Archived to `/supabase/archive/20260526_initial_schema.sql`.
  * *Reason for exclusion*: Redundant draft initial schema that conflicts with `001_initial_schema.sql` on core table definitions.

---

## 3. Canonical Table Ownership Map

| Table Name | Created In | Altered In | RLS Policy File |
| :--- | :--- | :--- | :--- |
| `tenants` | `001_initial_schema.sql` | `003`, `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `tenant_branding` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `users_profile` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `staff` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `services` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `customers` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `appointments` | `001_initial_schema.sql` | `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `campaigns` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `reminders` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `whatsapp_logs` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `calendar_integrations` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `ai_recommendations` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `customer_segments` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `subscriptions` | `001_initial_schema.sql` | `002`, `004`, `20260601`, `20260621` | `20260619_lari_rls_policy_draft.sql` |
| `payments` | `001_initial_schema.sql` | `002`, `004`, `20260601` | `20260619_lari_rls_policy_draft.sql` |
| `audit_logs` | `001_initial_schema.sql` | — | `20260619_lari_rls_policy_draft.sql` |
| `tenant_onboarding_progress` | `003_provisioning_onboarding.sql` | — | `003_provisioning_onboarding.sql` |
| `tenant_business_profiles` | `005_salon_business_profile.sql` | — | `005_salon_business_profile.sql`, `20260619` |
| `staff_services` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `availability_rules` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `customer_memory` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `payment_events` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `business_verification_reviews`| `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `notification_templates` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `notification_logs` | `20260601_lari_core_schema_alignment.sql` | — | `20260601`, `20260619` |
| `appointment_access_tokens` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `appointment_change_requests` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `communication_outbox` | `20260620_paymentless_production_core_tables.sql`| `20260713` | `20260713_communication_outbox_rls_hardening.sql` |
| `audit_events` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `support_tickets` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `policy_acceptances` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `consent_ledger` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `data_rights_requests` | `20260620_paymentless_production_core_tables.sql`| — | `20260622_paymentless_production_rls_identity_alignment.sql` |
| `admin_mutation_idempotency` | `20260731_admin_appointment_status_mutation_rpc.sql`| — | `20260731_admin_appointment_status_mutation_rpc.sql` |

---

## 4. Staging Commands Execution Sequence

Execute the following commands sequentially to apply this manifest onto a fresh staging project:

```bash
# 1. Initialize link with remote staging project
supabase link --project-ref <staging-supabase-project-id>

# 2. Run dry-run validation using CLI to ensure parsing passes
supabase db diff --local

# 3. Apply the canonical active migration path
supabase db push
```

---

## 5. Post-Migration Verification Sequence

After the migrations have successfully been applied:

1. **Verify Static Integrity**: Run `npm run qa:supabase-migration-integrity` to ensure zero table/index/policy duplications.
2. **Verify Repository Schema Hookup**: Run `npm run qa:supabase-priority1-core` to verify that active repositories can cleanly read/write to the database.
3. **Execute SQL Assertions**: Run the SQL-level assertions detailed in `supabase/tests/paymentless_production_rls_smoke.sql` using Supabase CLI test command or SQL editor:
   ```bash
   supabase test db
   ```
4. **App-Level Staging Smoke Test**: Run `npm run smoke:supabase-paymentless-staging` (requires valid staging credentials in `.env`).

---

## 6. Rollback and Reset Notes

* **Local Reset**: To wipe changes locally and rebuild from scratch:
  ```bash
  supabase db reset
  ```
* **Remote Wipe Warning**: Never run `db reset` on shared remote staging databases without explicit confirmation from team members.

---

## 7. DO NOT CONTINUE IF:

1. **Unsafe duplicate tables remain active**: If `20260526_initial_schema.sql` was accidentally restored to the migrations folder, **STOP**.
2. **Missing Env variables**: Staging env vars are unconfigured. The app will boot safely in demo/local fallback mode, but do not push updates until credentials are set.
3. **PCI-DSS storage violations occur**: If any column definition logs credit card fields (`card_number`, `card_cvv`), immediately abort migration and correct definitions.
