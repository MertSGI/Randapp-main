# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Foundation Closed SHA**: `c8f4b984581df5a9031a42f0851de6b44edf7828` (CI `31670377898` SUCCESS)  
**P2A.1 Closed SHA**: `94b4a43c528cfd750ba205a9cbf4b21df2295d4b` (CI `31671595067` SUCCESS)  
**P2A.2 Initial SHA**: `62f04bc695441a1efa4828463e7f7cfa46bdb309` (CI `31672003497` SUCCESS)  
**Current Stage**: `P2A.2-R1 — Server-Authoritative Owner Onboarding Contract & Test Truth Closure`  

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

## P2A.2 & P2A.2-R1 Server-Authoritative Owner Onboarding Architecture
- **Server-Authoritative Onboarding RPCs (R1)**:
  - `20260903_p2a_owner_onboarding_contracts.sql` migration defines `save_owner_business_profile`, `create_owner_first_branch`, `create_owner_first_service`, `create_owner_first_staff`, `get_owner_onboarding_state`, and `evaluate_owner_onboarding_readiness`.
  - All tenant authorities derived inside PostgreSQL from `auth.uid() -> users_profile -> tenant_id`. Caller-supplied tenant IDs or roles rejected.
  - All branch/service/staff entity UUIDs generated server-side via `gen_random_uuid()`. No frontend UUID generation.
- **Business Profile Completion Predicate (R1)**: Real `SALON_INFO_COMPLETION_PREDICATE` checks required non-empty business fields (`name`, `category`, `city`, `address`, `phone`) without fabricated defaults (`Hair Salon` / `Istanbul`).
- **Atomic First Staff & Cross-Tenant Isolation (R1)**: `create_owner_first_staff` atomically creates staff, links `staff_branches`, maps `staff_services` (rejecting foreign-tenant services with `FOREIGN_TENANT_SERVICE_REJECTED`), and sets `availability_rules`.
- **Readiness Predicate & Draft Privacy**: Evaluates `salon_info_completed && services_completed && staff_completed && calendar_completed`. On satisfaction, sets `onboarding_status = 'ready_for_review'`. Storefront remains `public_site_status = 'draft'`, `is_public_profile_enabled = false`, and subscription remains `pending_onboarding`. Super Admin approval via `approve_and_publish_tenant` remains required for live publishing.

---

## Executable Test Classification Matrix
- `PROVISIONING_DB_TESTS`: `supabase/tests/p2a_tenant_provisioning_integration_tests.sql` (PASS - PROV-01..24).
- `REGISTRATION_BOUNDARY_TESTS`: `scripts/test-p2a-supabase-registration-boundary.test.mjs` (PASS - 6 RPC boundary tests).
- `ONBOARDING_DB_TESTS`: `supabase/tests/p2a_onboarding_integration_tests.sql` (PASS - 24 disposable DB integration tests DB-ONB-01..24).
- `ONBOARDING_FRONTEND_BOUNDARY_TESTS`: `scripts/test-p2a-owner-onboarding-boundary.test.mjs` (PASS - 20 frontend boundary tests ONB-01..20).
- `MOCK_REGRESSION_TESTS`: `scripts/test-p2a-mock-registration-regression.test.mjs` (PASS - 2 mock regression tests).
- `STATIC_SECURITY_TESTS`: `scripts/test-p2a-static-security-scan.test.mjs` (PASS - 184 frontend source files scanned, confirming zero `service_role` or backend key usage).
- `BUILD_TESTS`: Production Vite build (`npm run build`) and whitespace check (`git diff --check`) verified cleanly.

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
3. `supabase/migrations/20260903_p2a_owner_onboarding_contracts.sql`

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Owner Onboarding Integration**: `P2A.2-R1 SERVER-AUTHORITATIVE CONTRACTS VERIFIED & TESTED`
- **Next Gate**: P2B Commercial Operator & UI Flow Verification

---

## HISTORICAL FRESH-ENVIRONMENT DEBT
- **Migration 38 Dependency**: Migration 38 (`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`) depends on canonical Melis tenant state (`aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`) not created by migrations 1–37.
- **Raw Repository Chain Fresh Replay**: `NO`
- **P2A Disposable Runtime QA Strategy**: Uses TEST-ONLY historical compatibility bridge (`supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`).
- **Remediation Track**: `CANONICAL_FRESH_ENVIRONMENT_REBASELINE` (scheduled for future separate gate).

