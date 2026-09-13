# EV-085 Evidence Register: Phase 5 Node 3 R2 Migration Integrity & Live PostgreSQL CI Acceptance

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Canonical Product Base: `09bb1f8d8ce070c33d09099a6d0ae20c93787d11`
  - Upstream Base (Node 1): `0368c9d17eba52049fe3e78a203282656b27af14`
- **Production Status**: `NO_GO`

---

## 1. Candidate Specification & CI Evidence

- **Candidate Branch**: `aos/phase5-ht-journey-domain-r2`
- **Candidate Commit SHA**: `58cc2363c958ea52d335793945de16c36b210eed`
- **Superseded SHA (Node 3 R1)**: `44c9be621c97a8cadecc23081f1b09d6a1c04e97`
- **Acceptance Harness Branch**: `ci/phase5-disposable-postgres-acceptance-r2`
- **Acceptance Harness Commit SHA**: `a0a3b74ca9eb4cc7d2a27bd2cc68f12679ee56bf`
- **GitHub Actions Workflow**: `Clean Disposable Supabase Postgres Replay & Live Behavioral Acceptance`
- **GitHub Actions Run ID**: `34740974168`
- **GitHub Actions Job ID**: `103680508425`
- **Workflow Status**: `completed / success` (15/15 stages clean)

---

## 2. Integrity Corrections Verified in Remote PostgreSQL CI

1. **Section 0 Migration Integrity Fix**:
   - Resolved migration failure observed in GitHub run `34717307321` by establishing composite uniqueness:
     `CONSTRAINT uq_ht_leads_id_tenant UNIQUE (id, tenant_id)` on `public.ht_leads`.
   - Enabled all subsequent composite foreign key constraints on `public.ht_treatment_journeys` referencing `(lead_id, tenant_id)` to succeed without error.
2. **Comprehensive Composite FK Audit on Node 3 Tables**:
   - `public.ht_leads`: verified composite uniqueness `(id, tenant_id)`.
   - `public.customers`: verified composite uniqueness `(id, tenant_id)`.
   - `public.staff`: verified composite uniqueness `(id, tenant_id)`.
   - `public.appointments`: verified composite uniqueness `(id, tenant_id)`.
   - All 4 references properly bound to journey and itinerary models.
3. **Helper Privilege Hardening**:
   - `public.ht_assert_caller_ht_authority`: execution strictly revoked from `PUBLIC, anon, authenticated` and granted exclusively to `service_role`.
4. **Full 87 SQL Migration Chain Replay**:
   - Replayed all 87 migrations from empty database to current head with 0 errors.
5. **Contract Test Execution**:
   - 17 domain contract suites (Phase 2, Phase 3, Phase 4, Phase 5 Nodes 1, 2, 3) executed: all 17 PASS.
6. **Live Database Schema Introspection**:
   - Column types, foreign keys, triggers, RLS policies verified against live database: PASS.
7. **Live PostgreSQL Behavioral Acceptance Matrix**:
   - 15 business domains tested against live PostgreSQL instance: PASS.
8. **Phase 5 Live Security & Concurrency Matrix**:
   - 13/13 live adversarial tests PASS (cross-tenant isolation, branch scoping, unauthenticated fail-closed, deterministic quote version concurrency under `FOR UPDATE`).

---

## 3. Node 3 R2 Gate Ruling & Downstream Unblocking

- **Node 3 Gate Status**: `AOS_STANDING_AUTHORITY_ACCEPTED` (Gate formally closed under `DECISION-020`).
- **Downstream Dispatch Authorization**:
  - **Node 5 (`aos/phase5-ht-funnel-multilingual`)**: UNBLOCKED.
  - **Node 6 (`aos/phase5-ht-lead-ops-workspace`)**: UNBLOCKED.
