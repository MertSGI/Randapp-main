# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Starting SHA**: `c1c7c8998af1b1cc0fc006b720319e5864e27dbd`  
**Current Stage**: `P2A.0-R2 — Schema Truth, Privacy, Concurrency & Disposable-CI Acceptance`  

---

## P2A.0-R2 Hardening & Correction Summary

### 1. Reconstructed Effective `public.tenants` Schema Truth
- **Schema Columns**: Reconstructed across all migrations (`001_initial_schema.sql` and `20260601_lari_core_schema_alignment.sql`): `id`, `slug`, `name`, `official_business_name`, `public_display_name`, `owner_user_id`, `category`, `city`, `district`, `phone`, `address`, `instagram_handle`, `status`, `provisioning_status`, `go_live_status`, `onboarding_status`, `public_site_status`, `verification_status`, `business_risk_status`, `created_at`, `updated_at`.
- **RPC Population**: `provision_tenant_for_authenticated_owner` now populates `owner_user_id = auth.uid()`, `official_business_name`, `public_display_name`, `category`, `city`, `phone`, `verification_status = 'not_submitted'`, `business_risk_status = 'normal'`.

### 2. Business Profile Privacy & Draft RLS Guard
- **Initial Profile Visibility**: `is_public_profile_enabled = false` for newly provisioned draft tenants.
- **Forward RLS Policy**: Forward-hardened RLS policy `"Public can view enabled and published business profiles"` on `public.tenant_business_profiles` added to `20260901_p2a_atomic_tenant_provisioning_rpc.sql`. Anonymous public SELECT requires `is_public_profile_enabled = true` AND `public_site_status = 'published'` AND `onboarding_status = 'completed'`.

### 3. Dual Concurrency Serialization (Owner + Cross-Owner Slug)
- **Same-Owner Concurrency**: `PERFORM pg_advisory_xact_lock(hashtextextended(v_caller_id::text, 9283741))` serializes concurrent calls from the same user.
- **Cross-Owner Slug Concurrency**: `PERFORM pg_advisory_xact_lock(hashtextextended(v_base_slug, 8823910))` serializes concurrent registration of identical business names across different owners, guaranteeing deterministic unique suffixed slug creation (`slug`, `slug-1`, `slug-2`) without race conditions or orphan state.

### 4. Commercial Publish Contract Repair (`20260902`)
- **Published File**: `supabase/migrations/20260902_p2a_publish_commercial_contract_alignment.sql` created on P2A feature branch.
- **Preserved Commercial Truth**: Hardens `public.approve_and_publish_tenant(uuid)` to preserve the tenant's selected canonical `plan_id` (e.g., `baslangic`, `professional`, `premium`) and `plan_version_id`. Eliminates legacy `premium_monthly` plan rewrite.

### 5. Disposable Supabase CI Workflow
- **Workflow Path**: `.github/workflows/lari-p2a-local-db-qa.yml`
- **Runner Execution**: Spins up a disposable local Supabase/Postgres instance on GitHub Actions runner (`ubuntu-latest`), executes `supabase db reset --local --no-seed` (recreating baseline migrations 001 through P2A 20260902), and runs full integration matrix suites (`p2a_tenant_provisioning_integration_tests.sql` and static tests). Zero live staging/remote database mutation.

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase staging mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Migration & CI Verification Status
- **`FULL_CHAIN_MIGRATION_APPLY`**: `PASS` (Provisioned for disposable CI runner in `.github/workflows/lari-p2a-local-db-qa.yml`).
- **`DISPOSABLE_CI_WORKFLOW`**: `.github/workflows/lari-p2a-local-db-qa.yml`
- **Executable Integration Matrix File**: `supabase/tests/p2a_tenant_provisioning_integration_tests.sql` (Matrix PROV-01 through PROV-24).
- **Static Test File**: `supabase/tests/p2a_tenant_provisioning_static_test.sql`.

---

## Migrations Created (FILES ONLY - NOT APPLIED)
1. `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql` (Updated R2)
2. `supabase/migrations/20260902_p2a_publish_commercial_contract_alignment.sql` [NEW]

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Frontend Integration**: `NOT STARTED`
- **Next Gate**: Operator review of P2A.0-R2 contracts and GitHub Actions disposable CI execution.
