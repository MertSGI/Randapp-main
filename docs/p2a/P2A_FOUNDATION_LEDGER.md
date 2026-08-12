# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Previous P2A SHA**: `c69c454496c3548819f2649d0834bf35450fec4f`  
**Current Stage**: `P2A.0-R1 — Atomic Tenant Provisioning Contract Hardening & Safeguards`  

---

## Operator Review Correction Summary (P2A.0-R1)

The initial P2A.0 provisioning migration (`20260901_p2a_atomic_tenant_provisioning_rpc.sql`) was reviewed and rejected for production readiness due to key contract weaknesses. Since migration `20260901` was **never applied to live staging or any shared remote database**, it has been corrected in-place on this isolated feature branch.

### Corrected Hardening Items:
1. **Schema Column Realignment**: `tenant_business_profiles` insert corrected to use proven canonical columns (`short_description`, `about_text`, `business_category`, `address`, `city`, `phone`, `email`, `is_public_profile_enabled`). Non-existent fields (`display_name`, `category`) removed.
2. **Profile Role Protection**: Added explicit fail-closed guard (`PROFILE_NOT_PROVISIONABLE`). Profiles with roles `super_admin`, `staff`, or existing `tenant_owner` can NEVER self-provision or be rewritten.
3. **Owner Concurrency Lock**: Added owner-level advisory transaction lock (`pg_advisory_xact_lock(hashtextextended(v_caller_id::text, 9283741))`) to serialize concurrent registration requests from the same user.
4. **Idempotency Scope**: `tenant_provisioning_idempotency` key constraint updated to `PRIMARY KEY (owner_user_id, idempotency_key)`. Requires non-empty idempotency key (`MISSING_IDEMPOTENCY_KEY`).
5. **Plan Authorization**: Added validation filter (`is_active = true AND is_assignable = true AND is_public = true`). Rejects unknown, legacy/non-assignable (`standart`), or non-public (`kurumsal`) plans with `PLAN_NOT_ASSIGNABLE`.
6. **Effective Plan Version Resolution**: Removed hard-coded `version_number = 1`. Resolves currently active published version (`lifecycle_status = 'published' AND effective_from <= now() AND (effective_to IS NULL OR > now())`). Fails closed on 0 or multiple active versions.
7. **Pre-Commercial Subscription Status**: Subscription assigned `status = 'pending_onboarding'` (billing_mode = `manual`). Requested plan code is recorded without granting active paid commercial access prior to onboarding completion.
8. **Initial Checklist & Non-Public State**: Onboarding progress checklist initialized to `false` for steps requiring operator/owner setup. `public_site_status` and `go_live_status` set to `'draft'`.
9. **Audit Trail**: Adds canonical audit event insertion (`public.audit_events`) on successful provisioning.

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Test & Local DB Integration Classification
- **`P2A_LOCAL_DB_INTEGRATION_BLOCKED`**: Local Docker/Postgres daemon environment is unavailable in this execution context.
- **`FULL_CHAIN_MIGRATION_APPLY`**: `BLOCKED` (Local Postgres engine unavailable; static and executable integration test files provided).
- **Executable Integration Matrix Test File**: `supabase/tests/p2a_tenant_provisioning_integration_tests.sql` (Covers P2A-PROV-01 through P2A-PROV-18).
- **Static Test File**: `supabase/tests/p2a_tenant_provisioning_static_test.sql`.

---

## Migrations Corrected (FILES ONLY - NOT APPLIED)
1. `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql` (Corrected in place)

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Frontend Integration**: `NOT STARTED`
- **Next Gate**: Operator review of hardened P2A.0-R1 RPC contracts.
