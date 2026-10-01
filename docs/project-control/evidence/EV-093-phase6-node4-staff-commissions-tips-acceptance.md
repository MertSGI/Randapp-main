# EV-093 — Phase 6 Node 4: Staff Commissions & Tips Disposable PostgreSQL Acceptance

## Metadata

| Field | Value |
|---|---|
| **Evidence ID** | EV-093 |
| **Phase** | PHASE_6 |
| **Lane** | PHASE_6_NODE4_STAFF_COMMISSIONS_TIPS_ACCEPTANCE |
| **Status** | PROVEN |
| **Acceptance Status** | AOS_STANDING_AUTHORITY_ACCEPTED |
| **Authority** | LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01 |
| **Standing Authority** | LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 |
| **Canonical Decision** | DECISION-020_PROGRAM_V2_REAL_PRODUCT_ACTIVATION_AND_AOS_STANDING_AUTONOMY_AUTHORITY |
| **Timestamp** | 2026-10-01T22:30:00.000Z |

## CI Execution

| Field | Value |
|---|---|
| **GitHub Actions Run ID** | [36913749244](https://github.com/MertSGI/Randapp-main/actions/runs/36913749244) |
| **GitHub Actions Job ID** | 110542526890 |
| **Branch** | `aos/phase6-node4-staff-commissions-tips` |
| **SHA** | `39e61bb76e32d4b83f8fe9f60efff91de2a5b049` |
| **Product Branch** | `aos/phase6-node4-staff-commissions-tips` |
| **Upstream Node 3 SHA** | `2c7543ff81875b1b04ffafdd94f2da940362d05c` |
| **Workflow Run Conclusion** | SUCCESS |

## Proven Scope

- **Full ordered SQL migration chain**: PASS (all 92 migrations applied sequentially with 0 errors)
- **24 domain contract suites**: PASS (24/24 suites passed cleanly)
- **Live DB introspection**: PASS (routine existence, constraints, RLS, grants, and table structures verified live)
- **General live PostgreSQL behavioral matrix**: PASS
- **Phase 5 security & concurrency matrix**: PASS
- **Phase 6 Node 1 inventory behavioral matrix**: PASS
- **Phase 6 Node 2 procurement & receiving behavioral matrix**: PASS
- **Phase 6 Node 3 POS cart & checkout behavioral matrix**: PASS
- **Phase 6 Node 4 staff commissions & tips behavioral matrix**: PASS
- **Application build**: PASS (Vite production build compiled with 0 errors)
- **Typecheck & lint**: PASS (`tsc --noEmit` and linter passed cleanly)
- **Dependency audit classification**: PASS

## Schema Additions

### Tables
- `public.staff_commission_rules` — Commission rule registry per tenant, staff, and item type (`service`, `product`, `package`, `custom`) with integer basis points (0..10000)
- `public.pos_tip_allocations` — Multi-staff tip split allocation table per order with positive minor unit constraint (`amount_minor_units > 0`)
- `public.staff_earnings_ledger` — Immutable staff earnings ledger (`commission` and `tip`) with unique composite tenant idempotency keys

### Server-Authoritative RPCs
- `pos_set_staff_commission_rule` — Rule upsert restricted strictly to active `tenant_owner` with cross-tenant and inactive staff validation
- `pos_set_tip_allocation` — Server-authoritative tip split mutation on open orders, updating `pos_orders.tip_minor_units` and `pos_orders.total_minor_units` under advisory transaction lock
- `pos_get_staff_earnings` — Read staff earnings summary and breakdown, restricted strictly to the staff member themselves or same-tenant `tenant_owner` (no implicit `super_admin` access)

### Hardened Existing RPCs
- `pos_add_cart_item` — Hardened performing staff attribution: non-null `p_performing_staff_id` must resolve to an active staff member in the caller/order tenant (foreign-tenant staff fails closed), preserving exact existing function signature
- `pos_checkout_order` — Augmented with atomic staff commission and tip materialization into `public.staff_earnings_ledger` within the checkout transaction, preserving exact existing function signature

## Proven Invariants

### Commission & Tip Invariants
- Integer minor-unit money and integer basis-point rates (0..10000)
- Zero floating-point commission mathematics
- Commissionable base: `GREATEST(unit_price_minor_units * quantity - discount_minor_units, 0)`
- Explicitly excludes taxes and tips from commission base calculation
- Commission amount: `(commissionable_base * commission_basis_points) / 10000`
- Tips included in `pos_orders.total_minor_units` and validated during checkout payment capture

### Tenant & Security Boundary
- Direct mutations (`INSERT`, `UPDATE`, `DELETE`) on all three new tables strictly revoked from `PUBLIC`, `anon`, and `authenticated` browser roles
- Row Level Security (RLS) enabled on all three new tables
- Cross-tenant commission rule management, tip allocation, performing staff attribution, and earnings reading strictly rejected fail closed
- Tenant owner authority enforced: only `tenant_owner` can manage commission rules
- Staff privacy preserved: ordinary staff can read only their own earnings; `tenant_owner` can read earnings for staff in their tenant; no implicit `super_admin` access

### Transaction & Idempotency Proof
- All earnings entries created atomically within checkout transaction
- Failed checkout (e.g. insufficient payment or insufficient stock) produces zero earnings ledger rows
- Idempotent checkout replay produces zero duplicate commission or tip entries (`uq_staff_earnings_tenant_idempotency` with keys `commission:<order_id>:<order_item_id>` and `tip:<order_id>:<staff_id>`)

### Scope Boundary
- Pure internal earnings accounting only
- Zero payroll, external bank payouts, provider disbursement (Stripe Connect / Iyzico payout), or tax withholding flows implemented
