# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Foundation Closed SHA**: `c8f4b984581df5a9031a42f0851de6b44edf7828` (CI `31670377898` SUCCESS)  
**P2A.1 Initial SHA**: `5abeb46641f27678aa6a8401da3af77f03d7f105` (CI `31670934114` SUCCESS)  
**Current Stage**: `P2A.1-R1 — Real Supabase RPC Boundary Contract & Test Truth Closure`  

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

## P2A.1 & P2A.1-R1 /register Frontend Integration Architecture
- **Server Authority**: `/register` flow invokes `public.provision_tenant_for_authenticated_owner` RPC as sole authority for tenant creation. No client-side tenant UUID generation or local subscription writing in Supabase mode.
- **RPC Parameter Contract Realignment (R1)**: Realigned frontend RPC parameter dictionary to match canonical database RPC signature (`p_business_name`, `p_business_display_name`, `p_business_category`, `p_city`, `p_phone`, `p_requested_plan_code`, `p_idempotency_key`), correcting `p_category` parameter drift.
- **Cryptographic Idempotency Contract (R1)**: Attempt-level idempotency key generated via secure Web Crypto (`crypto.randomUUID()` / `crypto.getRandomValues()`) in Supabase mode without `Math.random()` fallback.
- **State Machine & Complete Error Contract**: Tracks `AUTH_SIGNUP_PENDING`, `EMAIL_CONFIRMATION_REQUIRED`, `AUTHENTICATED_READY_FOR_PROVISIONING`, `PROVISIONING_IN_PROGRESS`, `PROVISIONED`, `PROVISIONING_FAILED_RETRYABLE`, `PROVISIONING_FAILED_TERMINAL`, `USER_ALREADY_HAS_TENANT`. Commercial configuration errors (`NO_EFFECTIVE_PLAN_VERSION`, `MULTIPLE_EFFECTIVE_PLAN_VERSIONS`) handled safely without raw SQL leakage.
- **Public Plan Allowlist Contract (R1)**: Public self-service UI exposes assignable public plans via explicit allowlist (`baslangic`, `professional`, `premium`) and rejects non-public (`kurumsal`) / legacy (`standart`) plans.
- **Onboarding Entry & Resumable Handoff**: Successful provisioning stores canonical tenant state (`lari_active_tenant_id`, `lari_active_tenant_slug`, `lari_active_owner_session`) and routes to `/admin?tab=kurulum`. Existing owners landing on `/register` are safely routed to existing tenant onboarding.

---

## Executable Test Classification Matrix (R1)
- `SUPABASE_BOUNDARY_TESTS`: `scripts/test-p2a-supabase-registration-boundary.test.mjs` (PASS - 6 tests validating RPC parameters, idempotency retry, existing owner resolution, profile safety, server authority, and plan version errors).
- `MOCK_REGRESSION_TESTS`: `scripts/test-p2a-mock-registration-regression.test.mjs` (PASS - 2 tests validating local mock fallback execution and error isolation).
- `STATIC_SECURITY_TESTS`: `scripts/test-p2a-static-security-scan.test.mjs` (PASS - 183 frontend source files scanned, confirming zero `service_role` or backend key usage).

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase staging mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Migrations Created (FILES ONLY - NOT APPLIED TO STAGING)
1. `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql`
2. `supabase/migrations/20260902_p2a_publish_commercial_contract_alignment.sql`

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Frontend Integration**: `P2A.1-R1 REAL RPC CONTRACT VERIFIED & TESTED`
- **Next Gate**: P2B Commercial Operator & UI Flow Verification

---

## HISTORICAL FRESH-ENVIRONMENT DEBT
- **Migration 38 Dependency**: Migration 38 (`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`) depends on canonical Melis tenant state (`aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`) not created by migrations 1–37.
- **Raw Repository Chain Fresh Replay**: `NO`
- **P2A Disposable Runtime QA Strategy**: Uses TEST-ONLY historical compatibility bridge (`supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`).
- **Remediation Track**: `CANONICAL_FRESH_ENVIRONMENT_REBASELINE` (scheduled for future separate gate).

