# EV-093 Evidence Register: Phase 6 Node 2 Suppliers, Purchase Orders & Receiving Acceptance

- **Authority Directives**:
  - Standing Autonomy: `DECISION-020`
  - Program ID: `LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01`
  - Controller Authority: `LARI-PHASE6-NODE1-ACCEPTANCE-NODE2-SUPPLIER-PO-RECEIVING-20260914-01`
  - Derives From: `LARI-PHASE5-RETENTION-VISUAL-CLOSEOUT-PHASE6-FOUNDATION-20260914-01`
  - Evidence Class: `REAL_POSTGRES_RUNTIME_PROOF_CI`
- **Production Status**: `NO_GO`

---

## 1. Executive Summary & Authoritative CI Verification Proof

Phase 6 Node 2 (*Suppliers, Purchase Orders & Receiving*) has completed **100% green across all 20 executed steps** on an unprivileged, isolated runner in remote GitHub Actions with clean disposable Supabase PostgreSQL container execution.

The initial push (commit `e4b6e35`) triggered run `34834828086` which **failed** at Step 15 (Procurement Behavioral Matrix) due to a composite idempotency constraint misalignment and inactive supplier creation logic. A targeted fix was applied (commit `80ee72d`) which corrected:
1. The receiving idempotency composite constraint to use `(tenant_id, idempotency_key)` correctly
2. Server-authoritative inactive supplier creation enforcement

The corrective push triggered run `34835325826` which achieved **full green** across all steps.

- **Authoritative Product Branch**: `aos/phase6-node2-suppliers-po-receiving`
- **Authoritative Product SHA**: `80ee72dbaa93d95a742995770c7bd80f69f0aaf2`
- **Authoritative CI Branch**: `ci/phase6-node2-procurement-receiving-acceptance-r1`
- **Authoritative CI SHA**: `80ee72dbaa93d95a742995770c7bd80f69f0aaf2`
- **Authoritative GitHub Actions Run ID**: `34835325826`
- **Authoritative GitHub Actions Job ID**: `103947730275`
- **GitHub Actions Job Name**: `Clean Disposable Supabase Postgres Replay & Live Behavioral Acceptance`
- **Workflow Run Conclusion**: `success`
- **Overall Status**: `COMPLETED` (0 failures, all 20 active steps passed cleanly)

---

## 2. Machine-Readable Step Execution & Verification Metrics

| Step # | Step Description | Status | Conclusion | Verification Notes |
|:---|:---|:---|:---|:---|
| 1 | Set up job | Completed | `success` | Runner environment initialized |
| 2 | Checkout Evidence Composition | Completed | `success` | Fetched `ci/phase6-node2-procurement-receiving-acceptance-r1` (`80ee72d`) |
| 3 | Setup Node.js | Completed | `success` | Node.js runtime established |
| 4 | Setup Database Tools (postgresql-client) | Completed | `success` | `psql`, `pg_isready` tools installed |
| 5 | Start Disposable Pinned Supabase Postgres Container | Completed | `success` | `supabase/postgres:15.1.0.147` container launched (PostgreSQL 15.1) |
| 6 | Wait for Postgres Readiness | Completed | `success` | Port 54322 healthcheck verified ready |
| 7 | Execute Managed Runtime Compatibility Bootstrap | Completed | `success` | Auth schema, `auth.jwt()`, `auth.uid()`, roles initialized |
| 8 | Apply Full Ordered SQL Migration Chain | Completed | `success` | **All 90 migrations** applied in exact sequence with 0 errors |
| 9 | Install Node Dependencies | Completed | `success` | Clean `npm ci` resolution |
| 10 | Execute 22 Domain Contract Suites (Phase 2, 3, 4, Phase 5 Nodes 1-6 + Phase 6 Nodes 1-2) | Completed | `success` | **All 22/22 domain contract test suites** passed |
| 11 | Execute Live Database Introspection & Integrity Verification | Completed | `success` | Schema FK, unique, check constraints verified live |
| 12 | Execute Live PostgreSQL Behavioral Acceptance Matrix | Completed | `success` | 146/146 live behavioral tests passed (7 concurrency, 11 cross-tenant negative) |
| 13 | Execute Phase 5 Live PostgreSQL Security & Concurrency Matrix | Completed | `success` | 23 assertions passed cleanly, 0 failures |
| 14 | Execute Phase 6 Node 1 Live PostgreSQL Inventory Behavioral Matrix | Completed | `success` | **21/21 assertions passed** (1 concurrency, 2 cross-tenant negative) |
| 15 | Execute Phase 6 Node 2 Live PostgreSQL Procurement & Receiving Behavioral Matrix | Completed | `success` | **35/35 assertions passed** (1 concurrency race, 4 cross-tenant negative) |
| 16 | Application Build | Completed | `success` | Vite production client bundle compiled with 0 errors |
| 17 | Typecheck & Lint | Completed | `success` | TypeScript compiler (`tsc --noEmit`) completed with 0 errors |
| 18 | Dependency Security Audit Classification | Completed | `success` | Security vulnerabilities audited and classified |
| 19 | Upload Failure Artifacts | Completed | `success` | Completed cleanly (no failure artifacts generated) |
| 20 | Destroy Container | Completed | `success` | Disposable Postgres container torn down cleanly |

---

## 3. Verified Runtime & Test Counters

```text
MIGRATIONS_APPLIED=90/90
POSTGRES_IMAGE=supabase/postgres:15.1.0.147
POSTGRES_RUNTIME=PostgreSQL 15.1

DOMAIN_CONTRACT_SUITES=22/22 PASS
P3P4_BEHAVIORAL_MATRIX=146/146 PASS
P3P4_CONCURRENCY_TESTS=7
P3P4_CROSS_TENANT_NEGATIVE_TESTS=11

PHASE5_SECURITY_MATRIX=23 ASSERTIONS PASS / 0 FAIL
PHASE6_NODE1_INVENTORY_MATRIX=21/21 PASS
PHASE6_NODE1_CONCURRENCY_TESTS=1
PHASE6_NODE1_CROSS_TENANT_NEGATIVE_TESTS=2

PHASE6_NODE2_PROCUREMENT_MATRIX=35/35 PASS
PHASE6_NODE2_CONCURRENCY_TESTS=1
PHASE6_NODE2_CROSS_TENANT_NEGATIVE_TESTS=4

BUILD=PASS
TYPECHECK=PASS
```

---

## 4. Phase 6 Node 2 Accepted Capabilities & Proven Invariants

### 4.1 Supplier Management
- Server-authoritative supplier creation via `pos_create_supplier()` SECURITY DEFINER RPC
- Tenant-scoped supplier name uniqueness (`uq_suppliers_tenant_name`)
- Supplier active/inactive state management
- Inactive supplier enforcement: new PO creation with inactive supplier rejected fail-closed
- Contact person, email, phone, tax identifier, address fields
- Direct DML (`INSERT`, `UPDATE`, `DELETE`) on suppliers table revoked from PUBLIC/anon/authenticated
- RLS defense-in-depth read policies for authenticated tenant staff

### 4.2 Purchase Order Management
- Server-authoritative PO creation via `pos_create_purchase_order()` SECURITY DEFINER RPC
- PO line item creation with product/SKU references
- Canonical money model: integer minor-unit cost representation, ISO uppercase currency
- PO state machine: `draft` → `approved` → `partially_received` → `received`, with `draft`|`approved` → `cancelled`
- Server-authoritative PO approval (`pos_approve_purchase_order()`)
- Server-authoritative PO cancellation (`pos_cancel_purchase_order()`)
- Cancelled PO receiving rejection fail-closed
- Draft PO receiving rejection fail-closed
- PO number uniqueness within tenant scope
- Comprehensive PO read via `pos_get_purchase_order()` with line items and receiving events

### 4.3 Receiving & Inventory Integration
- Server-authoritative receiving via `pos_receive_purchase_order_items()` SECURITY DEFINER RPC
- **Inventory Integration Invariant**: Receiving creates canonical Phase 6 Node 1 `receipt` movements in `public.inventory_movements` — NO competing inventory authority
- Inventory balances updated through the accepted Node 1 ledger-safe mutation path
- Partial receiving: deterministic partial receipt with quantity tracking on line items
- Complete receiving: automatic PO status transition to `received` when all lines fully received
- Over-receipt rejection: total received cannot exceed ordered quantity per line item
- Idempotent receiving: unique `(tenant_id, idempotency_key)` on receiving events prevents duplicate stock ingestion

### 4.4 Concurrency Safety
- PO-level serialized receiving via `pg_advisory_xact_lock(hashtextextended('po_receive:' || po_id, 0))`
- Balance-level serialized updates via `pg_advisory_xact_lock(hashtextextended(branch_id || ':' || product_id, 0))`
- Proven: two genuinely separate concurrent DB sessions attempting final-receipt race — exactly 1 winner, 1 fail-closed rejection (no over-receipt)

### 4.5 Security & Cross-Tenant Defense
- All SECURITY DEFINER RPCs use fixed `search_path`
- Explicit caller authorization via `auth.uid()` → `public.staff` join
- Tenant integrity: supplier tenant = PO tenant = branch tenant = product tenant
- Cross-tenant supplier rejection proven fail-closed
- Cross-tenant destination branch rejection proven fail-closed
- Cross-tenant receiving on foreign PO rejection proven fail-closed
- Direct DML on `purchase_orders`, `purchase_order_items`, `purchase_order_receiving_events` revoked

---

## 5. Product Composition Hygiene

The accepted Node 2 product composition derives from the accepted Node 1 product SHA (`6ea3d04`) with two additional product commits:

```text
e4b6e35 feat(procurement): implement Phase 6 Node 2 suppliers, purchase orders, and receiving foundation
80ee72d fix(p6-node2): align receiving idempotency composite constraint and server-authoritative inactive supplier creation
```

The CI composition on `ci/phase6-node2-procurement-receiving-acceptance-r1` is identical to the product branch `aos/phase6-node2-suppliers-po-receiving` — both point to `80ee72d`. No CI-only harness mutations exist in separation from the product branch.

---

## 6. Regression Proof

This run independently re-proves all prior accepted capabilities:

- **89 pre-existing migrations**: all applied cleanly (Node 2 adds migration 90)
- **21 prior domain contract suites**: all pass (Node 2 adds 22nd suite)
- **146/146 P3/P4 behavioral tests**: no regression
- **23/23 Phase 5 security & concurrency assertions**: no regression
- **21/21 Phase 6 Node 1 inventory tests**: no regression
- **Application build**: PASS
- **Typecheck**: PASS

---

## 7. Failure Correction Record

| Run ID | SHA | Conclusion | Root Cause | Corrective Commit |
|:---|:---|:---|:---|:---|
| `34834828086` | `e4b6e35` | `failure` | Composite idempotency constraint misalignment; inactive supplier creation logic gap | `80ee72d` |
| `34835325826` | `80ee72d` | `success` | N/A — corrected | — |

---

## 8. Dependency Security Debt Registry

```text
TOTAL_ADVISORIES=8
DIRECT=2
TRANSITIVE=6
DEV=0
RUNTIME=8
FIX_AVAILABLE=8
STATUS=PRE_PRODUCTION_SECURITY_DEBT
```
No change from EV-092. Remediation tracked in independent triage lane.

---

## 9. Gate Progression

- **`PHASE5_UNIFIED_TECHNICAL_GATE`**: `ACCEPTED`
- **`PHASE5_VISUAL_GATE`**: `PENDING_DI_RUN`
- **`PHASE6_NODE1_GATE`**: `ACCEPTED`
- **`PHASE6_NODE2_GATE`**: **`ACCEPTED`**
- **Production Status**: `NO_GO`
