# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Starting SHA**: `3a9073ca635e4c92d53bfdb7837268f13afb5069`  
**Current Stage**: `P2A.0-R3d — Deterministic SQL Migration Chain & Runtime QA`  

---

## Deterministic SQL Migration Strategy & Correction (P2A.0-R3d)

### 1. Correction of Prior Managed Prerequisite Labels
- **Ledger Correction**: Previous `NATIVE_PASS` labels for `anon`, `authenticated`, `auth.schema`, and `auth.uid()` are corrected to `TEST_RUNTIME_PREREQUISITES_READY`. These primitives are initialized strictly by the explicit test compatibility fixture `supabase/tests/fixtures/p2a_managed_runtime_bootstrap.sql` prior to applying application migrations against the direct Docker container.
- **Supabase CLI Removed**: Removed `setup-cli` and `supabase db push` from workflow. All application migrations are applied directly in filename-sorted order via `psql -v ON_ERROR_STOP=1`.

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
- **Next Gate**: Pushed deterministic psql migration workflow to GitHub; waiting for automated CI run execution.
