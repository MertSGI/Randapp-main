# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**P2A Branch**: `feature/p2a-commercial-core-foundation`  
**Current Stage**: `P2A.0 — Isolated Signup / Onboarding / Commercial Core Foundation`  

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Repository Reality & Source-of-Truth Audit

### 1. Canonical Schema & Tables
- **`plans`**: Codes `baslangic`, `professional`, `premium`, `kurumsal`, `standart` (seeded in migration `20260810_h1a_commercial_catalog_and_read_contracts.sql`).
- **`plan_versions`**: Immutable versioning (`version_number = 1` published).
- **`subscriptions`**: Linked to `tenant_id`, `plan_id`, `plan_version_id`, `billing_mode` (`manual`/`provider`), and `status`.
- **`plan_entitlements`** & **`tenant_entitlement_overrides`**: Controlled via `resolve_effective_tenant_entitlements` 4-level precedence RPC.
- **`tenant_onboarding_progress`**: Tracks `salon_info_completed`, `branding_completed`, `whatsapp_completed`, `services_completed`, `staff_completed`, `calendar_completed`, `test_appointment_completed`, `reviewed_by_admin`, `live_enabled`.

### 2. Signup Flow & Provisioning Gaps
- **Current /register**: Uses local state/mock storage in frontend. In DB mode, auth signup creates an `auth.users` row but lacks an atomic DB-level signup RPC that provisions `tenants`, `users_profile` (`tenant_owner`), `tenant_business_profiles`, `tenant_branding`, and `subscriptions` in a single atomic transaction without client `service_role` keys.

---

## First Safe Implementation Slice

### Implemented Artifact
- **Migration File**: `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql`
- **Contract Function**: `public.provision_tenant_for_authenticated_owner`
- **Semantics**:
  - `auth.uid()` identity binding.
  - Role forced to `tenant_owner` (never `salon_owner`).
  - Atomic creation of `tenants`, `users_profile`, `tenant_business_profiles`, `tenant_branding`, default `baslangic` Version 1 `subscriptions`, and `tenant_onboarding_progress`.
  - Concurrency & retry idempotency via `p_idempotency_key` and `tenant_provisioning_idempotency`.
  - Hardened with `SECURITY DEFINER SET search_path = pg_catalog, public`.

### Static Security & Behavioral Test File
- **Test File**: `supabase/tests/p2a_tenant_provisioning_static_test.sql`

---

## Migrations Created (FILES ONLY - NOT APPLIED)
1. `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql`

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Next Gate**: Operator review of P2A foundation contracts before UI integration.
