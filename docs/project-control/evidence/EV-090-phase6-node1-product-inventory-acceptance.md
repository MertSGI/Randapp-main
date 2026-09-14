# EV-090 — Phase 6 Node 1: Product & Inventory Disposable PostgreSQL Acceptance

## Metadata

| Field | Value |
|---|---|
| **Evidence ID** | EV-090 |
| **Phase** | PHASE_6 |
| **Lane** | PHASE_6_NODE1_PRODUCT_INVENTORY_ACCEPTANCE |
| **Status** | PROVEN |
| **Authority** | LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01 |
| **Standing Authority** | LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 |
| **Canonical Decision** | DECISION-020 |
| **Timestamp** | 2026-09-14T10:35:00.000Z |

## CI Execution

| Field | Value |
|---|---|
| **GitHub Actions Run ID** | [34833362409](https://github.com/MertSGI/Randapp-main/actions/runs/34833362409) |
| **GitHub Actions Job ID** | 103941569150 |
| **Branch** | `ci/phase6-node1-product-inventory-acceptance-r1` |
| **SHA** | `6ea3d04d59a5ee8a80602f2c0c4fa4772d37bf09` |
| **Product Branch** | `aos/phase6-product-inventory-foundation-node1` |
| **CI Steps** | 22/22 PASS |

## Schema Additions

### Tables
- `public.products` — Product catalog with tenant-scoped RLS
- `public.inventory_movements` — Immutable inventory event ledger
- `public.inventory_balances` — Materialized per-branch-product stock balances

### Server-Authoritative RPCs
- `pos_create_product` — Create new product within tenant scope
- `pos_update_product` — Update product metadata (name, price, active status)
- `pos_adjust_inventory` — Atomic inventory adjustment with pg_advisory_xact_lock on branch-product balance row

## Proven Invariants

### Contract Suites
- **21 domain contract suites tested**: 21/21 PASS
- Covers Phase 2, 3, 4, Phase 5 Nodes 1-6, and Phase 6 Node 1

### Behavioral Matrix
- Live behavioral acceptance matrix: **PASS**
- Phase 5 live security & concurrency matrix: **PASS**
- Phase 6 Node 1 inventory behavioral matrix: **PASS**

### Security
- RLS tenant isolation: ENFORCED
- Direct DML on inventory tables: REVOKED (server-authoritative RPCs only)
- Cross-tenant read/write: BLOCKED

### Concurrency
- `pg_advisory_xact_lock` with `hashtextextended` serialization on branch-product balance rows
- Prevents phantom stock increments under concurrent adjustment

### Application Integrity
- Vite application build: **PASS**
- TypeScript typecheck & lint: **PASS**
- Dependency security audit: classified (no blockers for non-production)
