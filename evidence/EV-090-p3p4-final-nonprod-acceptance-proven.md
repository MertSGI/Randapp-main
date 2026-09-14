# EV-090 Evidence Register: P3/P4 Final Non-Production Behavioral Acceptance Proven & Hold Closed

- **Authority Directives**:
  - Controller Authority ID: `LARI-P3P4-FINAL-NONPROD-ACCEPTANCE-PHASE5-CLOSEOUT-FORWARD-EXECUTION-20260914-01`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Controller Ruling: `PHASE3_FINAL_NON_PRODUCTION_ACCEPTANCE=ACCEPTED`, `PHASE4_FINAL_NON_PRODUCTION_ACCEPTANCE=ACCEPTED`, `P3P4_BEHAVIORAL_HOLD=CLOSED`
  - Superseded Evidence: `EV-INT-P3P4-03` / Prior P3/P4 HOLD state
- **Production Status**: `NO_GO`

---

## 1. Executive Summary & Authoritative Verification Proof

The P3/P4 Live Behavioral Acceptance workflow on GitHub Actions has completed **100% green across all steps** on an unprivileged, isolated runner with a clean disposable Supabase Postgres container. All 15 domains, edge cases, concurrency races, and negative cross-tenant isolation boundaries passed without failure or regression.

- **Authoritative Branch**: `ci/program-v2-p3p4-live-behavioral-acceptance-r1-20260911-01`
- **Authoritative Head SHA**: `b3c1f10a3924dcad599bf35f30282b99c3718c7a`
- **Authoritative GitHub Actions Run ID**: `34814424476`
- **GitHub Actions Job Name**: `Clean Disposable Supabase Postgres Replay & Live Behavioral Acceptance`
- **Workflow Run Conclusion**: `success`
- **Overall Status**: `COMPLETED` (0 failures, 0 skipped, all steps passed cleanly)

---

## 2. Machine-Readable Step Execution & Verification Metrics

| Step # | Step Description | Status | Conclusion | Verification Notes |
|:---|:---|:---|:---|:---|
| 1 | Set up job | Completed | `success` | Runner environment initialized |
| 2 | Checkout Evidence Composition | Completed | `success` | Fetched `ci/program-v2-p3p4-live-behavioral-acceptance-r1-20260911-01` (`b3c1f10`) |
| 3 | Setup Node.js | Completed | `success` | Node.js 20.x runtime established |
| 4 | Setup Database Tools (postgresql-client) | Completed | `success` | `psql`, `pg_isready` tools installed |
| 5 | Start Disposable Pinned Supabase Postgres Container | Completed | `success` | `supabase/postgres:15.1.0.147` container launched |
| 6 | Wait for Postgres Readiness | Completed | `success` | Port 54322 healthcheck verified ready |
| 7 | Execute Managed Runtime Compatibility Bootstrap | Completed | `success` | Bootstrap functions & role hierarchy applied |
| 8 | Apply Full Ordered SQL Migration Chain | Completed | `success` | **All 84 migrations** applied in exact sequence with 0 errors |
| 9 | Install Node Dependencies | Completed | `success` | Clean `npm ci` resolution |
| 10 | Execute 14 Domain Contract Suites | Completed | `success` | **All 14/14 domain contract test suites** passed |
| 11 | Execute Live Database Introspection & Integrity Verification | Completed | `success` | Schema foreign keys, unique constraints, check constraints verified live |
| 12 | Execute Live PostgreSQL Behavioral Acceptance Matrix | Completed | `success` | All 15 domains + EV079-R4 live behavioral tests passed cleanly |
| 13 | Application Build | Completed | `success` | Production client build compiled with 0 errors (`npm run build`) |
| 14 | Typecheck & Lint | Completed | `success` | TypeScript compiler (`tsc --noEmit`) and ESLint completed with 0 errors |
| 15 | Dependency Security Audit Classification | Completed | `success` | Security audit classification step passed cleanly |
| 16 | Destroy Container | Completed | `success` | Disposable Postgres container torn down cleanly |

---

## 3. Independently Verified Runtime Metrics

```text
LIVE_BEHAVIORAL_TESTS_EXECUTED=146
LIVE_BEHAVIORAL_TESTS_PASSED=146
LIVE_BEHAVIORAL_TESTS_FAILED=0

CONCURRENCY_TESTS_EXECUTED=7
CROSS_TENANT_NEGATIVE_TESTS_EXECUTED=11

84_OF_84_MIGRATIONS=PASS
14_DOMAIN_CONTRACT_SUITES=PASS
LIVE_SCHEMA_INTROSPECTION=PASS
APPLICATION_BUILD=PASS
TYPECHECK=PASS
LINT_GATE=PASS
DEPENDENCY_AUDIT_CLASSIFICATION=PASS
```

---

## 4. Key Corrections Bound in Authority Head (`b3c1f10`)

1. **EV071-R3 Multi-Branch Return Signature Alignment**:
   - Explicit casting `user_name::TEXT` and `status::VARCHAR(50)` in `public.get_branch_calendar_appointments` (`20260920_phase3_resource_capacity_foundation.sql`), matching the SQL function return signature exactly.
2. **Domain 5 Waitlist Horizon Boundary**:
   - Bounded waitlist appointment queries within 90-day active window.
3. **Domain 6 Outbox Cross-Tenant Isolation**:
   - Verified cross-tenant outbox queries fail-closed with `FORBIDDEN` exception instead of empty array return.
4. **Domain 10 Calendar Query Window**:
   - Bounded appointment calendar range queries within 366-day limit (`CURRENT_DATE - 30` to `CURRENT_DATE + 30`).
5. **Domain 15 Loyalty Concurrency Threshold**:
   - Configured `minimum_points_redemption = 10` in `tenant_loyalty_configs` to accommodate concurrent parallel redemptions.
6. **EV079-R3 Reactivation Test Suite Isolation**:
   - Explicitly cleaned stale consent records, past appointments, and prior reactivation events for `tenantA` before running the reactivation test suite, preventing cross-test interference from earlier domain scenarios.

---

## 5. Controller Gate Disposition & Forward Mandate

- **PHASE3_FINAL_NON_PRODUCTION_ACCEPTANCE**: `ACCEPTED`
- **PHASE4_FINAL_NON_PRODUCTION_ACCEPTANCE**: `ACCEPTED`
- **P3P4_BEHAVIORAL_HOLD**: `CLOSED`
- **Standing Guardrails**:
  - `PRODUCTION=NO_GO`.
  - Zero mutation to production DB, Vercel, or `main` branch.
  - Forward focus directed to Phase 5 commercial exit criteria and Phase 6 POS/Inventory/Retail planning.
