# EV-092 Evidence Register: Phase 6 Node 1 Product Catalog & Ledger-Safe Inventory Foundation Accepted

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Controller Authority: `LARI-PHASE5-RETENTION-VISUAL-CLOSEOUT-PHASE6-FOUNDATION-20260914-01`
  - Controller Ruling: `PHASE6_NODE1=INDEPENDENTLY_ACCEPTED_WITH_EVIDENCE_METADATA_CORRECTIONS`
  - Evidence Class: `REAL_POSTGRES_RUNTIME_PROOF_CI`
- **Production Status**: `NO_GO`

---

## 1. Executive Summary & Authoritative CI Verification Proof

Phase 6 Node 1 (*Product / SKU / Inventory Foundation*) has completed **100% green across all 19 executed steps** on an unprivileged, isolated runner in remote GitHub Actions with clean disposable Supabase PostgreSQL container execution.

- **Authoritative Product Branch**: `aos/phase6-product-inventory-foundation-node1`
- **Authoritative Product SHA**: `6ea3d04d59a5ee8a80602f2c0c4fa4772d37bf09`
- **Authoritative CI Branch**: `ci/phase6-node1-product-inventory-acceptance-r1`
- **Authoritative CI SHA**: `6ea3d04d59a5ee8a80602f2c0c4fa4772d37bf09`
- **Authoritative GitHub Actions Run ID**: `34833362409`
- **Authoritative GitHub Actions Job ID**: `103941569150`
- **GitHub Actions Job Name**: `Clean Disposable Supabase Postgres Replay & Live Behavioral Acceptance`
- **Workflow Run Conclusion**: `success`
- **Overall Status**: `COMPLETED` (0 failures, all 19 active steps passed cleanly)

---

## 2. Machine-Readable Step Execution & Verification Metrics

| Step # | Step Description | Status | Conclusion | Verification Notes |
|:---|:---|:---|:---|:---|
| 1 | Set up job | Completed | `success` | Runner environment initialized |
| 2 | Checkout Evidence Composition | Completed | `success` | Fetched `ci/phase6-node1-product-inventory-acceptance-r1` (`6ea3d04`) |
| 3 | Setup Node.js | Completed | `success` | Node.js runtime established (`20.20.2`) |
| 4 | Setup Database Tools (postgresql-client) | Completed | `success` | `psql`, `pg_isready` tools installed |
| 5 | Start Disposable Pinned Supabase Postgres Container | Completed | `success` | `supabase/postgres:15.1.0.147` container launched (PostgreSQL 15.1) |
| 6 | Wait for Postgres Readiness | Completed | `success` | Port 54322 healthcheck verified ready |
| 7 | Execute Managed Runtime Compatibility Bootstrap | Completed | `success` | Auth schema, `auth.jwt()`, `auth.uid()`, roles (`anon`, `authenticated`, `service_role`, `public`) initialized |
| 8 | Apply Full Ordered SQL Migration Chain | Completed | `success` | **All 89 migrations** applied in exact sequence with 0 errors (including buffer parity hardening and Phase 6 Node 1 product inventory foundation) |
| 9 | Install Node Dependencies | Completed | `success` | Clean `npm ci` resolution (npm `10.8.2`) |
| 10 | Execute 21 Domain Contract Suites | Completed | `success` | **All 21/21 domain contract test suites** (Phase 2, 3, 4, Phase 5 Nodes 1-6 + Phase 6 Node 1) passed |
| 11 | Execute Live Database Introspection & Integrity Verification | Completed | `success` | Schema foreign keys, unique constraints, check constraints verified live |
| 12 | Execute Live PostgreSQL Behavioral Acceptance Matrix | Completed | `success` | 146/146 live behavioral tests passed cleanly (7 concurrency races, 11 cross-tenant negative assertions) |
| 13 | Execute Phase 5 Live PostgreSQL Security & Concurrency Matrix | Completed | `success` | 13 scenarios / 23 assertions passed cleanly, 0 failures (Node 2 branch scoping, Node 3 treatment journeys, quotes, and itineraries) |
| 14 | Execute Phase 6 Node 1 Live PostgreSQL Inventory Behavioral Matrix | Completed | `success` | **21/21 assertions passed cleanly** (1 serialized concurrency race, 2 cross-tenant negative assertions) |
| 15 | Application Build | Completed | `success` | Vite production client bundle compiled with 0 errors |
| 16 | Typecheck & Lint | Completed | `success` | TypeScript compiler (`tsc --noEmit`) completed with 0 errors (`npm run lint` executes `tsc --noEmit`; ESLint not independently proven) |
| 17 | Dependency Security Audit Classification | Completed | `success` | Security vulnerabilities audited and classified into pre-production debt registry |
| 18 | Upload Failure Artifacts | Completed | `success` | Completed cleanly (no failure artifacts generated) |
| 19 | Destroy Container | Completed | `success` | Disposable Postgres container torn down cleanly |

---

## 3. Verified Runtime & Test Counters

```text
MIGRATIONS_APPLIED=89/89
POSTGRES_IMAGE=supabase/postgres:15.1.0.147
POSTGRES_RUNTIME=PostgreSQL 15.1
PROJECT_NODE_RUNTIME=20.20.2
PROJECT_NPM_RUNTIME=10.8.2

DOMAIN_CONTRACT_SUITES=21/21 PASS
P3P4_BEHAVIORAL_MATRIX=146/146 PASS
P3P4_CONCURRENCY_TESTS=7
P3P4_CROSS_TENANT_NEGATIVE_TESTS=11

PHASE5_SECURITY_MATRIX=13 SCENARIOS / 23 ASSERTIONS PASS / 0 FAIL
PHASE6_NODE1_INVENTORY_MATRIX=21/21 PASS
PHASE6_NODE1_CONCURRENCY_TESTS=1
PHASE6_NODE1_CROSS_TENANT_NEGATIVE_TESTS=2

BUILD=PASS
TYPECHECK=PASS
ESLINT=NOT_INDEPENDENTLY_PROVEN_BY_THIS_RUN
```

---

## 4. Phase 5 Scheduling Boundary Re-Proof Truth

This run independently re-proves the repaired scheduling buffer boundary under live disposable PostgreSQL replay with migration `20260929_phase5_scheduling_buffer_parity_hardening.sql`:
- Existing appointment `buffer_after` collision
- Existing appointment `buffer_before` collision
- Requested `buffer_before` collision
- Requested `buffer_after` collision
- Exact adjacent boundary behavior
- Different-service asymmetric buffer collision
- Tenant-default buffer fallback

**Disposition**: Prior scheduling regression is **`CLOSED_BY_REAL_POSTGRES_RUNTIME_PROOF`**.

---

## 5. Phase 6 Node 1 Accepted Capabilities & Proven Invariants

1. **Product Catalog**:
   - Product creation and uppercase SKU normalization (`upper(trim(p_sku))`)
   - Tenant-scoped SKU uniqueness (`uq_products_tenant_sku`)
   - Integer minor-unit price and cost handling (`price_minor_units >= 0`, `cost_minor_units >= 0`)
   - ISO currency check (`currency ~ '^[A-Z]{3}$'`)
   - Category, brand, barcode, unit-of-measure support
2. **Branch Inventory Balances**:
   - Branch-scoped inventory projection (`public.inventory_balances`)
   - Invariant: `allocated_quantity <= on_hand_quantity`
   - Invariant: `on_hand_quantity >= 0` (negative available stock forbidden)
3. **Append-Only Movement Ledger**:
   - Immutable stock movement ledger (`public.inventory_movements`)
   - Movement types: `receipt`, `sale`, `adjustment_gain`, `adjustment_loss`, `return_restock`, `transfer_in`, `transfer_out`
   - Zero mutable historical rows; adjustments/returns create compensating ledger entries
   - Idempotent stock receipt and sale decrement handling (`uq_inventory_movements_idempotency`)
4. **Concurrency & Security**:
   - Transactional advisory locking (`pg_advisory_xact_lock`) on branch + product ID
   - Insufficient stock fail-closed validation (`INSUFFICIENT_STOCK`)
   - Parallel concurrent stock consumption race verified (exactly 1 winner, 1 fail-closed rejection)
   - Cross-tenant and cross-branch mutation rejection (`CROSS_TENANT_VIOLATION`)
   - Mathematical consistency: ledger movement sum strictly equals projected on-hand balance
   - Direct browser table DML (`INSERT`, `UPDATE`, `DELETE`) strictly revoked
   - RLS defense-in-depth read policies enabled for authenticated tenant staff

---

## 6. Dependency Security Debt Registry

```text
TOTAL_ADVISORIES=8
DIRECT=2
TRANSITIVE=6
DEV=0
RUNTIME=8
FIX_AVAILABLE=8
STATUS=PRE_PRODUCTION_SECURITY_DEBT
```
Remediation is tracked in an independent triage lane without breaking non-production Program V2 progress.

---

## 7. Gate Progression

- **`PHASE5_UNIFIED_TECHNICAL_GATE`**: `ACCEPTED`
- **`PHASE5_VISUAL_GATE`**: `PENDING_DI_RUN` (`REQ-AOS-DI-V1-1-UIV2-C0B3A95-FINAL-VISUAL-EVIDENCE-20260911-01`)
- **`PHASE6_NODE1_GATE`**: **`ACCEPTED`**
- **Production Status**: `NO_GO`
