# EV-091 — Phase 6 Node 2: Procurement & Receiving Disposable PostgreSQL Acceptance

## Metadata

| Field | Value |
|---|---|
| **Evidence ID** | EV-091 |
| **Phase** | PHASE_6 |
| **Lane** | PHASE_6_NODE2_PROCUREMENT_RECEIVING_ACCEPTANCE |
| **Status** | PROVEN |
| **Authority** | LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01 |
| **Standing Authority** | LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 |
| **Canonical Decision** | DECISION-020 |
| **Timestamp** | 2026-09-14T10:54:00.000Z |

## CI Execution

| Field | Value |
|---|---|
| **GitHub Actions Run ID** | [34835325826](https://github.com/MertSGI/Randapp-main/actions/runs/34835325826) |
| **GitHub Actions Job ID** | 103947730275 |
| **Branch** | `ci/phase6-node2-procurement-receiving-acceptance-r1` |
| **SHA** | `80ee72dbaa93d95a742995770c7bd80f69f0aaf2` |
| **Product Branch** | `aos/phase6-node2-suppliers-po-receiving` |
| **Upstream Node 1 SHA** | `6ea3d04d59a5ee8a80602f2c0c4fa4772d37bf09` |
| **CI Steps** | 23/23 PASS |

## Schema Additions

### Tables
- `public.suppliers` — Supplier registry with tenant-scoped RLS, active/inactive lifecycle
- `public.purchase_orders` — Purchase order headers with state machine (`draft` → `approved` → `received`/`cancelled`)
- `public.purchase_order_items` — PO line items referencing `public.products`
- `public.purchase_order_receiving_events` — Immutable receiving event log with composite idempotency

### Server-Authoritative RPCs
- `pos_create_supplier` — Create supplier within tenant scope
- `pos_create_purchase_order` — Create draft PO with line items
- `pos_approve_purchase_order` — Transition PO from draft to approved
- `pos_cancel_purchase_order` — Transition PO from draft to cancelled
- `pos_receive_purchase_order_items` — Receive items against an approved PO, creating inventory movements and updating balances

## Proven Invariants

### Contract Suites
- **22 domain contract suites tested**: 22/22 PASS
- Covers Phase 2, 3, 4, Phase 5 Nodes 1-6, Phase 6 Nodes 1-2

### Behavioral Matrix
- Live behavioral acceptance matrix: **PASS**
- Phase 5 live security & concurrency matrix: **PASS**
- Phase 6 Node 1 inventory behavioral matrix: **PASS**
- Phase 6 Node 2 procurement & receiving behavioral matrix: **PASS**

### Security
- RLS tenant isolation: ENFORCED on all 4 tables
- Direct DML: REVOKED (server-authoritative RPCs only)
- Cross-tenant read/write: BLOCKED
- Inactive supplier creation guard: ENFORCED (pos_create_purchase_order rejects inactive suppliers)

### Concurrency
- `pg_advisory_xact_lock` with `hashtextextended` serialization:
  - PO-level state transitions: locks PO header row
  - Branch-product stock increments: locks specific inventory balance row
- Composite idempotency constraint: `uq_pore_tenant_item_idempotency (tenant_id, idempotency_key, po_item_id)`
- Prevents duplicate receiving events and phantom stock increments

### Inventory Integration
- Procurement receiving creates `inventory_movements` (type: `purchase_receipt`)
- Atomic `inventory_balances` UPSERT via `ON CONFLICT DO UPDATE`
- Full integration with Phase 6 Node 1 ledger (zero separate inventory logic)

### PO State Machine
- `draft` → `approved`: valid transition
- `draft` → `cancelled`: valid transition
- `approved` → `received`: automatic on full receipt
- Invalid transitions: REJECTED with error
- Approved/received/cancelled POs: immutable (no further modifications)

### Application Integrity
- Vite application build: **PASS**
- TypeScript typecheck & lint: **PASS**
- Dependency security audit: classified (no blockers for non-production)

## Failure Recovery

### Initial Run Failure (34834828086)
- **Root Cause**: CI workflow YAML referenced incorrect constraint name `uq_pore_tenant_idempotency` instead of the actual `uq_pore_tenant_item_idempotency` (composite constraint including `po_item_id`)
- **Resolution**: Corrected constraint name in CI workflow introspection step; no product code changes required
- **Retry Run**: 34835325826 — SUCCESS (all 23 steps green)
