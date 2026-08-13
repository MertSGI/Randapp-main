# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Foundation Closed SHA**: `c8f4b984581df5a9031a42f0851de6b44edf7828` (CI `31670377898` SUCCESS)  
**Current Stage**: `P2A.1 — Isolated Real /register + Onboarding Frontend Integration`  

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
- **Server Authority**: `/register` flow invokes `public.provision_tenant_for_authenticated_owner` RPC as sole authority for tenant creation. No client-side tenant UUID generation or local subscription writing in Supabase mode.
- **Client Idempotency Key**: Cryptographically random attempt idempotency key generated per logical registration attempt and persisted in `sessionStorage` for logical retries.
- **State Machine**: Tracks `AUTH_SIGNUP_PENDING`, `EMAIL_CONFIRMATION_REQUIRED`, `AUTHENTICATED_READY_FOR_PROVISIONING`, `PROVISIONING_IN_PROGRESS`, `PROVISIONED`, `PROVISIONING_FAILED_RETRYABLE`, `PROVISIONING_FAILED_TERMINAL`, `USER_ALREADY_HAS_TENANT`.
- **Public Plan Contract**: Public self-service UI exposes assignable public plans (`baslangic`, `premium`) and rejects non-public (`kurumsal`) / legacy (`standart`) plans.
- **Onboarding Entry & Resumable Handoff**: Successful provisioning stores canonical tenant state (`lari_active_tenant_id`, `lari_active_tenant_slug`, `lari_active_owner_session`) and routes to `/admin?tab=kurulum`. Existing owners landing on `/register` are safely routed to existing tenant onboarding.

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
- **Frontend Integration**: `P2A.1 IMPLEMENTED & TESTED`
- **Next Gate**: P2B Commercial Operator & UI Flow Verification

---

## HISTORICAL FRESH-ENVIRONMENT DEBT
- **Migration 38 Dependency**: Migration 38 (`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`) depends on canonical Melis tenant state (`aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`) not created by migrations 1–37.
- **Raw Repository Chain Fresh Replay**: `NO`
- **P2A Disposable Runtime QA Strategy**: Uses TEST-ONLY historical compatibility bridge (`supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`).
- **Remediation Track**: `CANONICAL_FRESH_ENVIRONMENT_REBASELINE` (scheduled for future separate gate).

