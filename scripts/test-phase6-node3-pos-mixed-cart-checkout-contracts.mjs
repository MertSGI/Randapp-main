// scripts/test-phase6-node3-pos-mixed-cart-checkout-contracts.mjs
// Phase 6 Node 3: POS Mixed Cart, Multi-Branch Stock Allocation & Checkout Static Contracts

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20261002_phase6_node3_pos_mixed_cart_checkout.sql');

console.log('--- Checking Phase 6 Node 3: POS Mixed Cart & Checkout Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. POS orders table defined with branch FK, order status machine, ISO currency check, and unique tenant order number',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.pos_orders') &&
                 sql.includes('REFERENCES public.branches(id)') &&
                 sql.includes("status IN ('open', 'completed', 'voided', 'refunded')") &&
                 sql.includes("CHECK (currency ~ '^[A-Z]{3}$'") &&
                 sql.includes('CONSTRAINT uq_pos_orders_tenant_order_number UNIQUE (tenant_id, order_number)')
  },
  {
    name: '2. POS order items table supports mixed cart types: service, product, package, custom',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.pos_order_items') &&
                 sql.includes("item_type IN ('service', 'product', 'package', 'custom')") &&
                 sql.includes('CONSTRAINT fk_pos_order_items_product FOREIGN KEY (product_id, tenant_id)') &&
                 sql.includes('CONSTRAINT chk_pos_items_product_ref CHECK')
  },
  {
    name: '3. POS order payments table defined with supported tender types and positive minor unit amounts',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.pos_order_payments') &&
                 sql.includes("payment_method IN ('cash', 'card_present', 'card_terminal_adapter', 'customer_wallet', 'external')") &&
                 sql.includes('amount_minor_units      INTEGER NOT NULL CHECK (amount_minor_units > 0)')
  },
  {
    name: '4. Direct table mutations strictly revoked from PUBLIC, anon, and authenticated on all 3 tables',
    check: () => sql.includes('REVOKE ALL ON TABLE public.pos_orders FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.pos_order_items FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.pos_order_payments FROM PUBLIC, anon, authenticated;')
  },
  {
    name: '5. Row Level Security enabled with defense-in-depth staff SELECT policies on all 3 tables',
    check: () => sql.includes('ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.pos_order_payments ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view pos orders"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view pos order items"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view pos order payments"')
  },
  {
    name: '6. Server-authoritative RPCs defined with SECURITY DEFINER and search_path set',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_create_order') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_add_cart_item') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_checkout_order') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_get_order') &&
                 sql.includes('SECURITY DEFINER') &&
                 sql.includes('SET search_path = pg_catalog, public')
  },
  {
    name: '7. Checkout automatically decrements stock through canonical inventory movements and balances',
    check: () => sql.includes('UPDATE public.inventory_balances') &&
                 sql.includes('INSERT INTO public.inventory_movements') &&
                 sql.includes("'sale'") &&
                 sql.includes("'pos_checkout'")
  },
  {
    name: '8. Concurrency serialization using pg_advisory_xact_lock on order and branch-product during checkout',
    check: () => sql.includes("pg_advisory_xact_lock(") &&
                 sql.includes("hashtextextended('pos_order:' || p_order_id::text, 0)") &&
                 sql.includes("hashtextextended(v_order.branch_id::text || ':' || v_item.product_id::text, 0)")
  },
  {
    name: '9. Insufficient stock and insufficient payment validation fails closed',
    check: () => sql.includes('INSUFFICIENT_STOCK') &&
                 sql.includes('INSUFFICIENT_PAYMENT') &&
                 sql.includes('p_amount_paid_minor_units < v_order.total_minor_units')
  },
  {
    name: '10. Idempotent checkout handling returns existing completed order without duplicate stock consumption',
    check: () => sql.includes('uq_pos_orders_tenant_idempotency') &&
                 sql.includes("'idempotent_replay', true")
  }
];

let failed = 0;
for (const t of tests) {
  try {
    if (t.check()) {
      console.log(`PASS: ${t.name}`);
    } else {
      console.error(`FAIL: ${t.name}`);
      failed++;
    }
  } catch (err) {
    console.error(`ERROR in test "${t.name}":`, err.message);
    failed++;
  }
}

console.log(`\nResult: ${tests.length - failed}/${tests.length} passed.`);
if (failed > 0) {
  process.exit(1);
}

console.log('All Phase 6 Node 3 POS Mixed Cart & Checkout contracts verified successfully!');
