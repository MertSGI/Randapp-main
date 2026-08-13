# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Foundation Closed SHA**: `c8f4b984581df5a9031a42f0851de6b44edf7828` (CI `31670377898` SUCCESS)  
**P2A.1 Closed SHA**: `94b4a43c528cfd750ba205a9cbf4b21df2295d4b` (CI `31671595067` SUCCESS)  
**Current Stage**: `P2A.2 — Canonical Owner Onboarding Flow Integration`  

---

## P2A.0 Provisioning Foundation Closure
- **State**: `CLOSED / GO`
- **Validated Artifacts**:
  - Atomic authenticated tenant provisioning (`public.provision_tenant_for_authenticated_owner`)
  - Owner-scoped idempotency and multi-session concurrency safety (CONC-01, CONC-02)
  - Canonical plan/version selection (`baslangic`, `premium`)
  - `pending_onboarding` entitlement default-deny & draft profile RLS privacy
  - Atomic rollback safety & operator publish plan/version preservation
  - Zero payment/provider artifact delta

---

## P2A.1 /register Frontend Integration Architecture
- **State**: `CLOSED / GO`
- **Server Authority**: `/register` flow invokes `public.provision_tenant_for_authenticated_owner` RPC as sole authority for tenant creation. No client-side tenant UUID generation or local subscription writing in Supabase mode.
- **RPC Parameter Contract Realignment**: Realigned frontend RPC parameter dictionary to match canonical database RPC signature (`p_business_name`, `p_business_display_name`, `p_business_category`, `p_city`, `p_phone`, `p_requested_plan_code`, `p_idempotency_key`), correcting `p_category` parameter drift.
- **Cryptographic Idempotency Contract**: Attempt-level idempotency key generated via secure Web Crypto (`crypto.randomUUID()` / `crypto.getRandomValues()`) in Supabase mode without `Math.random()` fallback.

---

## P2A.2 Canonical Owner Onboarding Flow Architecture
- **Canonical Server State**: Onboarding progress driven by `public.tenant_onboarding_progress` and DB truth (`tenants`, `tenant_business_profiles`, `branches`, `services`, `staff`, `staff_services`, `availability_rules`). LocalStorage booleans overridden by DB truth in Supabase mode.
- **Server-Authoritative Tenant Resolution**: Tenant resolved via `auth.uid() -> users_profile -> tenant_id`. No caller-supplied `tenant_id` trusted for owner mutations.
- **Onboarding Step Contracts**:
  - `FIRST_BRANCH_CONTRACT`: Primary branch created/confirmed for owner tenant idempotently.
  - `FIRST_SERVICE_CONTRACT`: First service created without synthetic QA templates.
  - `FIRST_STAFF_CONTRACT`: First staff member created with staff/service mappings and availability rules. Cross-tenant service mapping rejected.
- **Readiness Predicate & Draft Privacy**: Evaluates `salon_info_completed && services_completed && staff_completed && calendar_completed`. On satisfaction, sets `onboarding_status = 'ready_for_review'`. Storefront remains `public_site_status = 'draft'`, `is_public_profile_enabled = false`, and subscription remains `pending_onboarding`. Super Admin approval remains required for live publishing.

---

## Executable Test Classification Matrix
- `ONBOARDING_BOUNDARY_TESTS`: `scripts/test-p2a-owner-onboarding-boundary.test.mjs` (PASS - 7 tests ONB-01..20 validating canonical progress loading, draft privacy, branch/service/staff tenant binding, idempotency, cross-tenant isolation, and `READY_FOR_REVIEW` predicate).
- `SUPABASE_BOUNDARY_TESTS`: `scripts/test-p2a-supabase-registration-boundary.test.mjs` (PASS - 6 tests validating RPC parameters, idempotency retry, existing owner resolution, profile safety, server authority, and plan version errors).
- `MOCK_REGRESSION_TESTS`: `scripts/test-p2a-mock-registration-regression.test.mjs` (PASS - 2 tests validating local mock fallback execution and error isolation).
- `STATIC_SECURITY_TESTS`: `scripts/test-p2a-static-security-scan.test.mjs` (PASS - 184 frontend source files scanned, confirming zero `service_role` or backend key usage).

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase staging mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Owner Onboarding Integration**: `P2A.2 CANONICAL FLOW IMPLEMENTED & VERIFIED`
- **Next Gate**: P2B Commercial Operator & UI Flow Verification

---

## HISTORICAL FRESH-ENVIRONMENT DEBT
- **Migration 38 Dependency**: Migration 38 (`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`) depends on canonical Melis tenant state (`aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`) not created by migrations 1–37.
- **Raw Repository Chain Fresh Replay**: `NO`
- **P2A Disposable Runtime QA Strategy**: Uses TEST-ONLY historical compatibility bridge (`supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`).
- **Remediation Track**: `CANONICAL_FRESH_ENVIRONMENT_REBASELINE` (scheduled for future separate gate).

