# LARİ Supabase Migration Apply Manifest
47. **20260822_h1e_release_control_and_eligibility_read_contracts.sql** — Stage H1E-A Global Release Control Singleton Table with Safe Default Row & Super Admin Eligibility Snapshot Read RPC.

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
35. **`20260810_h1a_commercial_catalog_and_read_contracts.sql`** — Stage H1A Canonical Commercial Schema, Immutable Catalog Versioning, and Read Contracts: Provisions commercial_feature_definitions, plans, plan_versions, plan_entitlements, subscriptions schema alignment, tenant_entitlement_overrides, append-only subscription_events, append-only billing_transactions, and usage_counters tables. Provisions resolve_effective_tenant_entitlements, get_public_commercial_plan_catalog, get_my_commercial_subscription_snapshot, super_admin_get_commercial_catalog, and super_admin_get_tenant_commercial_snapshot SECURITY DEFINER read contracts. REVOKE FROM PUBLIC, GRANT EXECUTE to anon and authenticated according to read boundary rules.
36. **`20260811_h1b_super_admin_commercial_mutations.sql`** — Stage H1B Secure Super Admin Commercial Mutation Backend: Extends subscriptions table, provisions super_admin_commercial_mutation_idempotency table, and provisions super_admin_assign_commercial_plan, super_admin_change_subscription_status, super_admin_schedule_plan_change, super_admin_cancel_scheduled_plan_change, super_admin_record_billing_transaction, and super_admin_manage_tenant_entitlement_override SECURITY DEFINER mutation contracts. REVOKE FROM PUBLIC/anon, GRANT EXECUTE to authenticated (Super Admin server-side authorized).
37. **`20260812_h1b_apply_due_scheduled_plan_change_rpc.sql`** — Stage H1B Due Scheduled Plan Change Executor RPC: Provisions super_admin_apply_due_scheduled_plan_change SECURITY DEFINER RPC with server-side target plan version re-validation, status update, row-locking, idempotency replay, and audit logging. REVOKE FROM PUBLIC/anon, GRANT EXECUTE to authenticated (Super Admin server-side authorized).
38. **`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`** — Stage H1C Server-Authoritative Commercial Eligibility & Quota Enforcement: Bootstraps canonical staging tenant subscription. Provisions resolve_tenant_commercial_eligibility, assert_tenant_commercial_action_allowed, resolve_commercial_quota, resolve_quota_period_key, consume_commercial_usage internal helpers (REVOKE FROM PUBLIC/anon/authenticated). Provisions enforce_staff_quota, enforce_service_quota, enforce_branch_quota BEFORE INSERT/UPDATE triggers. Updates create_public_booking, can_accept_public_booking, cancel_public_appointment_by_manage_token with commercial gates. Provisions get_my_commercial_enforcement_snapshot and super_admin_get_tenant_commercial_enforcement_snapshot diagnostic RPCs.
39. **`20260814_h1c_feature_gate_reason_code_fix.sql`** — Stage H1C Feature Gate Reason Code & Trigger Hardening Fix: Updates enforce_staff_quota and enforce_service_quota triggers to explicitly evaluate staff_management and service_management feature gates, raising commercial_feature_disabled when management features are disabled.
40. **`20260815_h1c_usage_counters_invariant.sql`** — Stage H1C Counter Invariant Fix: Adds strict database-level CHECK constraint (chk_usage_counters_mirror_equality) requiring usage_count = used_count on public.usage_counters. Establishes used_count as canonical consumed counter and usage_count as compatibility read mirror.
41. **`20260816_h1d_missing_commercial_admin_contracts.sql`** — Stage H1D Provisions missing super_admin commercial management contracts for fine-grained tenant plan adjustments and feature gate overrides.
42. **`20260817_h1d_contract_truth_and_idempotency_fix.sql`** — Stage H1D Migration 42 redefines super_admin_create_platform_restriction, super_admin_end_platform_restriction, and super_admin_list_tenant_commercial_directory to enforce mandatory idempotency key, structured conflict/replay envelopes, and Boolean OR directory plan filter.
43. **`20260818_h1d_idempotency_concurrency_and_filter_fix.sql`** — Stage H1D Migration 43 redefines super_admin_create_platform_restriction, super_admin_end_platform_restriction, and super_admin_list_tenant_commercial_directory to add transaction advisory locks, complete create fingerprints, and explicit 'none' directory filter semantics.
44. **`20260819_h1d_idempotency_helper_record_fix.sql`** — Stage H1D Migration 44 fixes the check_super_admin_idempotency runtime record-shape defect by selecting the complete idempotency ledger record and handling the no-row case explicitly.
45. **`20260820_h1d_audit_events_schema_alignment_fix.sql`** — Stage H1D Migration 45 aligns platform restriction create/end audit writes with canonical audit_events columns: actor_id, actor_role, and action.
46. **`20260821_h1d_future_restriction_end_fix.sql`** — Stage H1D Migration 46 allows future scheduled restrictions to be safely ended without violating the starts_at/expires_at date-range constraint.
47. **`20260822_h1e_release_control_and_eligibility_read_contracts.sql`** — Stage H1E-A Global Release Control & Eligibility Read Contracts: Provisions platform_global_release_control singleton table and super_admin_get_tenant_pilot_eligibility_snapshot read contract.
48. **`20260823_h1e_a_eligibility_runtime_contract_fix.sql`** — Stage H1E-A Eligibility Read Contract Runtime Forward Fix: Provides a forward-only CREATE OR REPLACE correction for super_admin_get_tenant_pilot_eligibility_snapshot, aligning live column names (services.active, staff.active) and eliminating unassigned RECORD dereferences.
49. **`20260824_h1e_b_pilot_authorization_history.sql`** — Stage H1E-B Pilot Authorization History & Management Contracts: Provisions tenant_pilot_authorizations table with partial unique index, super_admin_get_tenant_pilot_authorization, super_admin_approve_tenant_pilot, super_admin_revoke_tenant_pilot RPCs, and updates eligibility snapshot for H1E-B.
50. **`20260825_h1e_b_authorization_contract_hardening.sql`** — Stage H1E-B1 Authorization Contract Hardening: Revokes all direct table client access on tenant_pilot_authorizations, normalizes reason codes to uppercase, hashes raw idempotency keys in audit payloads, and provisions super_admin_get_tenant_pilot_mutation_evidence read RPC.
51. **`20260826_h1e_c_public_booking_release_gate.sql`** — Stage H1E-C Public Booking Release & Pilot Enforcement Gate: Provisions internal eligibility evaluator, integrates release control & pilot authorization into can_accept_public_booking RPC and super_admin_get_tenant_pilot_eligibility_snapshot RPC.
52. **`20260827_h1e_c_public_booking_release_gate_runtime_fix.sql`** — Stage H1E-C1 Public Booking Release Gate Runtime Forward Fix: Provisions single slug-aware 2-argument internal evaluator, drops obsolete 1-argument evaluator, corrects snapshot pilot authorization columns to approved_*, aligns restrictions query with platform_system_restrictions schema, and enforces pre_pilot unknown slug precedence without early return.
53. **`20260828_h1e_c_controlled_release_phase_transition.sql`** — Stage H1E-C3 Controlled Release Phase Transition Contract: Provisions platform_release_phase_transition_history and super_admin_release_transition_idempotency tables, super_admin_transition_release_phase mutation RPC with advisory/row locks and payment safety interlocks, and super_admin_get_release_transition_evidence read RPC.
54. **`20260829_h1e_c_controlled_transition_runtime_fix.sql`** — Stage H1E-C4 Controlled Release Transition Runtime Forward Fix: Aligns transition audit_events INSERT with canonical schema (tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload), enforces actor_user_id match on idempotency replay, and updates evidence read RPC to query canonical action column.
55. **`20260830_p1c_public_branch_read_contract.sql`** — Server-authoritative public branch read RPC get_public_branches for active tenant storefront branch discovery.
56. **`20260831_p1c_public_branch_read_contract_runtime_fix.sql`** — Aligns get_public_branches RPC eligibility predicate with canonical can_accept_public_booking contract (status, onboarding_status, public_site_status).
57. **`20260901_p2a_atomic_tenant_provisioning_rpc.sql`** — Atomic tenant provisioning authority.
58. **`20260902_p2a_publish_commercial_contract_alignment.sql`** — Published commercial contract alignment.
59. **`20260903_p2a_owner_onboarding_contracts.sql`** — Owner onboarding contracts.
60. **`20260904_authenticated_owner_branch_mutations_rpc.sql`** — Authenticated owner branch mutation RPCs.
61. **`20260905_lari_clinic_domain_server_authority.sql`** — LARI clinic domain server authority.
62. **`20260906_lari_clinic_operational_integration.sql`** — LARI clinic operational integration.
63. **`20260907_lari_clinic_workspace_authority_hardening.sql`** — Clinic workspace authority hardening.
64. **`20260908_commercial_lifecycle_eligibility_alignment.sql`** — Commercial lifecycle eligibility alignment.
65. **`20260909_clinic_ai_assist_commercial_authority.sql`** — Clinic AI-assist commercial authority.
66. **`20260910_lari_health_tourism_foundation.sql`** — Health-tourism foundation.
67. **`20260911_lari_health_tourism_lead_ops_ai_assist.sql`** — Health-tourism lead operations and AI assist.
68. **`20260912_lari_health_tourism_clinic_acceptance.sql`** — Health-tourism clinic acceptance contracts.
69. **`20260913_lari_health_tourism_clinic_acceptance_workspace.sql`** — Health-tourism clinic acceptance workspace.
70. **`20260914_public_booking_branch_id_response_contract_fix.sql`** — Public-booking branch response contract fix.
71. **`20260916_phase2_staff_scheduling_foundation.sql`** — Phase 2 staff scheduling foundation.
72. **`20260917_phase3_waitlist_foundation.sql`** — Phase 3 waitlist foundation.
73. **`20260918_phase3_communications_foundation.sql`** — Phase 3 communications foundation.
74. **`20260919_phase3_provider_neutral_payment_foundation.sql`** — Provider-neutral payment foundation.
75. **`20260920_phase3_background_job_calendar_foundation.sql`** — Background-job calendar foundation.
76. **`20260920_phase3_resource_capacity_foundation.sql`** — Resource-capacity foundation.
77. **`20260921_phase3_customer360_segmentation_foundation.sql`** — Customer 360 segmentation foundation.
78. **`20260921_phase3_package_limits_multibranch_completeness.sql`** — Package limits and multi-branch completeness.
79. **`20260922_phase3_reporting_analytics_foundation.sql`** — Reporting and analytics foundation.
80. **`20260923_phase3_custom_domain_verification_foundation.sql`** — Custom-domain verification foundation.
81. **`20260924_phase4_deposit_noshow_policy_foundation.sql`** — Deposit and no-show policy foundation.
82. **`20260925_phase4_loyalty_reactivation_foundation.sql`** — Loyalty and reactivation foundation.
83. **`20260925_phase4_packages_memberships_foundation.sql`** — Packages and memberships foundation.
84. **`20260926_phase4_giftcards_wallet_foundation.sql`** — Gift cards and wallet foundation.
85. **`20260927_phase5_vertical_skus_commercial_packaging.sql`** — Vertical SKU commercial packaging.
86. **`20260928_phase5_clinic_practitioners_workspace_hardening.sql`** — Clinic practitioner workspace hardening.
87. **`20260928_phase5_ht_treatment_journey_quote_itinerary.sql`** — Health-tourism journey, quote, and itinerary contracts.
88. **`20260929_phase5_scheduling_buffer_parity_hardening.sql`** — Scheduling buffer parity hardening.
89. **`20260930_phase6_product_inventory_foundation.sql`** — Product inventory foundation.
90. **`20261001_phase6_node2_suppliers_po_receiving.sql`** — Supplier, purchase-order, and receiving authority.
91. **`20261002_phase6_node3_pos_mixed_cart_checkout.sql`** — POS mixed-cart checkout authority.
92. **`20261003_phase6_node4_staff_commissions_tips.sql`** — Staff commissions and tips authority.
93. **`20261004_phase7_node1_verified_reviews_foundation.sql`** — Verified reviews foundation.
94. **`20261005_phase7_node2_discovery_marketplace_projection.sql`** — Discovery Marketplace server-authoritative projection.
95. **`20261006_phase7_node3_favorites_fast_rebooking.sql`** — Customer favorites and fast-rebooking seed authority.
96. **`20261007_program_v2_security_surface_hardening.sql`** — Program V2 security surface hardening.

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
