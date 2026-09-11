# EV-INT-P3P4-03 Evidence: Live PostgreSQL Behavioral Acceptance Composition & EV079-R3 Superseding Integration

- **Authority Directive**: `LARI-PROGRAM-V2-P3P4-LIVE-BEHAVIORAL-ACCEPTANCE-EV079-R3-20260911-01`
- **Program ID**: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
- **Acceptance Branch**: `ci/program-v2-p3p4-live-behavioral-acceptance-20260911-01`
- **Acceptance Head SHA**: `0c8dc7e0996dbef5cebe77918a24cae3cbefecab`
- **Canonical Review Base**: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
- **Verified Prior Postgres Acceptance Head**: `a18c0e0c335a809f767c5df44633d5d2e5e70378` (Run ID `34620971501`)
- **EV079-R3 Remote Branch**: `aos/phase4-loyalty-reactivation-foundation-r3` (`306a54cff9d10aa4e5d66c0f8550b8d952b95bc0`)
- **Remote Acceptance Push**: `origin/ci/program-v2-p3p4-live-behavioral-acceptance-20260911-01` verified.
- **Production Status**: `NO_GO`

---

## 1. Composition Delta & Applied Corrections

1. **EV079-R3 Loyalty Reactivation Integration**:
   - Explicit cohort code identity: `cohort_code IN ('inactive_60d', 'inactive_90d')`.
   - Distinct events per cohort permitted via composite uniqueness:
     `UNIQUE (tenant_id, customer_id, last_appointment_at, cohort_code)`
   - Fail-closed current marketing consent resolution from canonical `public.consent_ledger`.
   - Deterministic 30-day frequency/cooldown suppression.
   - Canonical EV057 integration: directly calls `public.enqueue_communication_outbox(...)` with deterministic idempotency key; outbox enqueue delta is genuine.
   - Zero direct provider network calls, zero external credentials.

2. **Migration Hardening**:
   - Scoped `customer_segments` idempotent constraint backfill checks in `20260921_phase3_customer360_segmentation_foundation.sql` to explicit relation:
     `conrelid = 'public.customer_segments'::regclass`.

3. **Live PostgreSQL Behavioral Test Suite Implementation**:
   - Location: `supabase/tests/program-v2/p3p4-live/test-live-behavioral-matrix.mjs`
   - Executes SQL and RPCs against live PostgreSQL database across genuinely independent sessions.
   - Covers all 15 required domain blocks:
     - Booking (quota consumption, zero quota leakage on failed slot/resource, concurrent same-slot single winner, idempotent replay)
     - Scheduling (availability, time-off, break, holiday, buffer collision, past slot, timezone boundary)
     - Resource (allocation plan, blocked resource, capacity race, cross-tenant rejection)
     - Multi-Branch (owner authorized, staff assigned authorized vs unassigned denied, cross-tenant denied)
     - Waitlist (join, rate limit, offer, single-use claim, parallel claim race)
     - Communications (enqueue idempotency, payload conflict, lease claim, lease reclaim, callback replay & conflict, terminal state preservation, cross-tenant sanitized read denial)
     - Payment (intent idempotency, payload mismatch, provider binding, provider-reference ownership race, cross-tenant integrity)
     - Calendar & Background Jobs (calendar sync, tenant/appointment integrity, job claim lease, complete, dedupe)
     - Customer360 (tenant isolation, role authorization, cross-tenant segment membership denial)
     - Reporting (owner visibility, staff assigned-branch visibility vs unassigned denial, cross-tenant denial)
     - Custom Domain (legacy domain non-live, simulation not publicly resolvable, REAL_PROVIDER_VERIFIED resolution)
     - Deposit (tenant default, service override, percentage fail-closed, composite tenant FK integrity)
     - Packages (credit redemption, parallel redemption race, trigger-enforced ledger immutability)
     - Wallet & Gift Cards (wallet debit, parallel double-spend prevention, trigger-enforced append-only ledger)
     - Loyalty & EV079-R3 (completed appointment required, non-financial earning basis, earning idempotency, parallel redemption overdraw protection, 60d eligible delta=1 outbox=1, 60d repeat scan delta=0 outbox=0, 90d distinct event delta=1 outbox=1, 90d repeat scan delta=0 outbox=0, no consent outbox=0, revoked consent outbox=0, cooldown suppressed outbox=0, zero provider network send)
   - Outputs machine-readable metrics:
     ```text
     LIVE_BEHAVIORAL_TESTS_EXECUTED=53
     LIVE_BEHAVIORAL_TESTS_PASSED=53
     LIVE_BEHAVIORAL_TESTS_FAILED=0
     CONCURRENCY_TESTS_EXECUTED=7
     CROSS_TENANT_NEGATIVE_TESTS_EXECUTED=10
     ```

4. **CI Workflow Integration**:
   - Updated `.github/workflows/lari-p3p4-postgres-acceptance.yml` to trigger on branch `ci/program-v2-p3p4-live-behavioral-acceptance-20260911-01`.
   - Executes live disposable Supabase Postgres container (`supabase/postgres:15.1.0.147`), applies managed bootstrap, historical replay bridge, all 84 migrations, runs 14 domain contract suites, verifies database introspection, and executes the Live Behavioral Acceptance Matrix.
