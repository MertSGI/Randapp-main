# EV-092 — Phase 6 Node 3: POS Mixed Cart & Checkout Disposable PostgreSQL Acceptance

## Metadata

| Field | Value |
|---|---|
| **Evidence ID** | EV-092 |
| **Phase** | PHASE_6 |
| **Lane** | PHASE_6_NODE3_POS_CART_CHECKOUT_ACCEPTANCE |
| **Status** | PROVEN |
| **Acceptance Status** | AOS_STANDING_AUTHORITY_ACCEPTED |
| **Authority** | LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01 |
| **Standing Authority** | LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 |
| **Canonical Decision** | DECISION-020_PROGRAM_V2_REAL_PRODUCT_ACTIVATION_AND_AOS_STANDING_AUTONOMY_AUTHORITY |
| **Timestamp** | 2026-10-01T22:00:00.000Z |

## CI Execution

| Field | Value |
|---|---|
| **GitHub Actions Run ID** | [36910447089](https://github.com/MertSGI/Randapp-main/actions/runs/36910447089) |
| **GitHub Actions Job ID** | 110531482685 |
| **Branch** | `aos/phase6-node3-pos-cart-checkout` |
| **SHA** | `2c7543ff81875b1b04ffafdd94f2da940362d05c` |
| **Product Branch** | `aos/phase6-node3-pos-cart-checkout` |
| **Upstream Node 2 SHA** | `80ee72dbaa93d95a742995770c7bd80f69f0aaf2` |
| **Workflow Run Conclusion** | SUCCESS |

## Proven Scope

- **Full ordered SQL migration chain**: PASS (all migrations applied in exact sequence with 0 errors)
- **23 domain contract suites**: PASS (23/23 suites passed cleanly)
- **Live DB introspection**: PASS (FK, check constraints, RLS, grants, and table structures verified live)
- **General live PostgreSQL behavioral matrix**: PASS
- **Phase 5 security & concurrency matrix**: PASS
- **Phase 6 Node 1 inventory behavioral matrix**: PASS
- **Phase 6 Node 2 procurement & receiving behavioral matrix**: PASS
- **Phase 6 Node 3 POS mixed cart & checkout behavioral matrix**: PASS
- **Application build**: PASS (Vite production build compiled with 0 errors)
- **Typecheck & lint**: PASS (`tsc --noEmit` and linter passed cleanly)
- **Dependency audit classification**: PASS

## Schema Additions

### Tables
- `public.pos_orders` — POS orders with tenant/branch scoping, status machine (`open`, `completed`, `cancelled`), ISO currency validation, and unique tenant-scoped order numbers
- `public.pos_order_items` — POS line items supporting mixed cart types (`service`, `product`, `package`, `custom`)
- `public.pos_order_payments` — POS payments table recording payment methods and positive minor unit amounts

### Server-Authoritative RPCs
- `pos_create_order` — Server-authoritative order creation within tenant and branch scope
- `pos_add_cart_item` — Server-authoritative line item addition supporting mixed cart types (services, products, packages, custom items)
- `pos_checkout_order` — Server-authoritative atomic checkout transaction executing payment capture and canonical inventory movement decrements
- `pos_get_order` — Tenant-isolated order and line-item retrieval

## Proven Invariants

### Mixed Cart Composition
- Supported cart line types: `service`, `product`, `package`, and `custom`
- Line total reconciliation and total order amount verification

### Tenant & Security Boundary
- Direct table mutations (`INSERT`, `UPDATE`, `DELETE`) on `pos_orders`, `pos_order_items`, and `pos_order_payments` strictly revoked from `PUBLIC`, `anon`, and `authenticated` browser roles
- Row Level Security (RLS) enabled with defense-in-depth staff `SELECT` policies across all 3 tables
- Server-authoritative RPC boundary: all state modifications require authenticated staff identity and execute under `SECURITY DEFINER` with fixed `search_path`
- Cross-tenant negative assertions verified: orders created by Staff A are completely inaccessible to Staff B

### Inventory Integration
- Atomic checkout automatically decrements stock via canonical Phase 6 Node 1 inventory movements (`inventory_movements`) and updates materialized branch-product balances (`inventory_balances`)
- Append-only audit trail preserved for all inventory deductions

### Checkout Idempotency & Concurrency Race Proof
- Concurrency serialization using `pg_advisory_xact_lock` on order header and branch-product balance rows
- Last-stock checkout race: two cashiers competing for the last unit of stock resolves deterministically where one cashier succeeds and the second fails closed with insufficient stock
- Idempotent checkout replay returns existing completed order without duplicate stock consumption (zero duplicate stock burn on replay)
- Insufficient payment and insufficient stock conditions fail closed

### Application Integrity
- Vite production build compiles with 0 errors
- TypeScript strict checking (`tsc --noEmit`) passes cleanly

## Historical Test Harness Iterations & Resolution

- **Run 34923144477 (R1)**: Failed at Section 2 of `test-phase6-node3-pos-cart-checkout-behavioral-matrix.mjs` due to test harness resetting auth (`await setAuth(mainClient, null)`). `pos_create_product` is server-authoritative and requires an authenticated staff identity (`auth.uid()`).
- **Run 36905287843 (R2)**: Failed at Section 8 of the same behavioral matrix due to the remaining `await setAuth(mainClient, null)` before scarce-product seeding.
- **Run 36910447089 (R3 — SUCCESS)**: Both test-harness seeding sections updated to preserve authenticated Tenant A staff identity (`userStaffA`). Production RPC contracts remained strictly server-authoritative and unchanged. Full pipeline green across all steps.
