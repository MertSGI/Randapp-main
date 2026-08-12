# P2A Commercial Core Foundation Ledger

**Base Pilot SHA**: `134c8716c2511c909cd400aee0496ebd70f63bf6`  
**Starting SHA**: `4dd250fb7f9e7d702b62acbfb0ad709ee091724a`  
**Current Stage**: `P2A.0-R3c — Direct Supabase Postgres Container & Runtime QA Closure`  

---

## Direct Database Container Strategy (P2A.0-R3c)

### 1. Stack Simplification & Container Pinning
- **Bypassed CLI Orchestration**: `supabase start` and `supabase db start` (which invoke full local stack health checks) are bypassed.
- **Direct Pinned Postgres Image**: Workflow pulls and launches `supabase/postgres:15.1.0.147` directly on port `54322`.
- **Pinned Supabase CLI Version**: `1.145.0` used exclusively as a migration client via `supabase db push --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### 2. Managed Prerequisites & DB Health
- **Custom Health Polling**: `pg_isready -h 127.0.0.1 -p 54322 -U postgres -d postgres` loop verifies DB readiness before migration push.
- **Prerequisites Verification**: Direct SQL script verifies `uuid-ossp`, `pgcrypto`, `anon`, `authenticated`, `service_role`, `auth.users`, and `auth.uid()`.

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
- **Next Gate**: Pushed direct container workflow to GitHub; waiting for automated CI execution.
