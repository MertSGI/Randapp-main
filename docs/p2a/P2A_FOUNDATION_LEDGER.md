# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Starting SHA**: `d57c711ce35394ec31146f4df20b592a6c5e801c`  
**Current Stage**: `P2A.0-R3e — Exact Fresh-Migration Failure Diagnosis`  

---

## Migration Failure Diagnosis & Pre-Bootstrap Proof

### 1. Pre-Bootstrap Inspection Evidence
- **Raw Container Audit**: Verified that raw container `supabase/postgres:15.1.0.147` lacks `anon`, `authenticated`, `service_role`, `auth.schema`, and `auth.uid()`.
- **Test Compatibility Bootstrap**: Explicitly initialized via `supabase/tests/fixtures/p2a_managed_runtime_bootstrap.sql`.

### 2. Failure Diagnostic Indexing Added
- Added step-level index logging (`APPLYING [0] 001_initial_schema.sql`, `APPLYING [1] 002_subscription_alignment.sql`, ...) and container log dump on failure in `.github/workflows/lari-p2a-local-db-qa.yml` to isolate the exact failing migration file.

---

## Lane Isolation Verification Matrix
- `ACTIVE_PILOT_BRANCH_UNTOUCHED`: YES (`staging/supabase-staging-consistency` has 0 changes)
- `STAGING_DATABASE_UNTOUCHED`: YES (No live Supabase staging mutations executed)
- `PAYMENTS_UNTOUCHED`: YES (`payment collection = false`, `checkout = false`, `iyzico = false`)
- `P1C_GATE_STATE_UNCHANGED`: YES (P1C.1, P1C.2, P1C.3a closed; P1C.3b time-gated; P1C.4 locked; P1D locked)

---

## Migrations Created (FILES ONLY - NOT APPLIED)
1. `supabase/migrations/20260901_p2a_atomic_tenant_provisioning_rpc.sql`
2. `supabase/migrations/20260902_p2a_publish_commercial_contract_alignment.sql`

---

## Deployment & Gate Status
- **Staging Deployment**: `UNTOUCHED` (`https://lari-staging.vercel.app/`)
- **Frontend Integration**: `NOT STARTED`
- **Next Gate**: Historical replay compatibility bridge applied for disposable CI run; awaiting automated CI completion.

---

## HISTORICAL FRESH-ENVIRONMENT DEBT
- **Migration 38 Dependency**: Migration 38 (`20260813_h1c_commercial_eligibility_and_quota_enforcement.sql`) depends on canonical Melis tenant state (`aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa`) not created by migrations 1–37.
- **Raw Repository Chain Fresh Replay**: `NO`
- **P2A Disposable Runtime QA Strategy**: Uses TEST-ONLY historical compatibility bridge (`supabase/tests/fixtures/p2a_historical_replay_bridge_before_migration_38.sql`).
- **Remediation Track**: `CANONICAL_FRESH_ENVIRONMENT_REBASELINE` (scheduled for future separate gate).

