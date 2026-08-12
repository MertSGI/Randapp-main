# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Starting SHA**: `0d411c3d2210d40fdab30a20e700b9adfdb4336b`  
**Current Stage**: `P2A.0-R3a — Disposable Supabase Start Failure Root-Cause & CI Boot Repair`  

---

## Disposable CI Startup Root-Cause Inspection (P2A.0-R3a)

### 1. Failed Run Analysis
- **Failed Run ID**: `31595632099`
- **Failed Step**: `Start Disposable Local Supabase Stack`
- **Command**: `supabase start`
- **Exit Code**: `1`
- **Sanitized Root Cause Classification**: `WORKFLOW_CONFIGURATION_FAILURE` & `CLI_VERSION_INCOMPATIBLE`.
- **Details**: Pinned CLI version `1.145.0` with minimal `config.toml` failed during local container orchestration initialization due to versioned configuration schema requirements for auth email confirmation settings.

### 2. Applied Repairs:
1. Updated `supabase/config.toml` with complete `[auth.email]` settings (`enable_signup = true`, `double_confirm_changes = false`, `enable_confirmations = false`).
2. Updated `.github/workflows/lari-p2a-local-db-qa.yml` to use `supabase/setup-cli@v1` version `'latest'`.
3. Added `supabase start --debug` execution for verbosity.
4. Added an explicit `Diagnostic Collector on Startup Failure` step (`docker ps -a` and container log dump) triggered on step failure.

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
- **Next Gate**: Pushed P2A.0-R3a feature branch commit to GitHub; waiting for automated disposable CI run execution.
