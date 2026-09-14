// scripts/test-phase6-node2-suppliers-po-receiving-contracts.mjs
// Phase 6 Node 2: Suppliers, Purchase Orders & Receiving Static Contracts

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20261001_phase6_node2_suppliers_po_receiving.sql');

console.log('--- Checking Phase 6 Node 2: Suppliers, Purchase Orders & Receiving Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Suppliers table defined with tenant FK, active flag, and unique name per tenant',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.suppliers') &&
                 sql.includes('REFERENCES public.tenants(id)') &&
                 sql.includes('is_active           BOOLEAN NOT NULL DEFAULT true') &&
                 sql.includes('CONSTRAINT uq_suppliers_tenant_name UNIQUE (tenant_id, name)')
  },
  {
    name: '2. Purchase orders table defined with supplier FK, destination branch FK, bounded state machine, and currency check',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.purchase_orders') &&
                 sql.includes('destination_branch_id UUID NOT NULL REFERENCES public.branches(id)') &&
                 sql.includes("'draft', 'approved', 'partially_received', 'received', 'cancelled'") &&
                 sql.includes("CHECK (currency ~ '^[A-Z]{3}$'") &&
                 sql.includes('CONSTRAINT uq_purchase_orders_tenant_po_number UNIQUE (tenant_id, po_number)')
  },
  {
    name: '3. Purchase order items table defined with composite PO FK, product FK, positive quantities, and received <= ordered invariant',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.purchase_order_items') &&
                 sql.includes('REFERENCES public.purchase_orders(id, tenant_id)') &&
                 sql.includes('REFERENCES public.products(id, tenant_id)') &&
                 sql.includes('CONSTRAINT chk_po_items_received_bound CHECK (quantity_received <= quantity_ordered)')
  },
  {
    name: '4. Purchase order receiving events table defined with idempotency constraint and link to canonical inventory movements',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.purchase_order_receiving_events') &&
                 sql.includes('inventory_movement_id UUID NOT NULL') &&
                 sql.includes('CONSTRAINT uq_pore_tenant_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '5. Direct table mutations strictly revoked from PUBLIC, anon, and authenticated on all 4 tables',
    check: () => sql.includes('REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.purchase_orders FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.purchase_order_receiving_events FROM PUBLIC, anon, authenticated;')
  },
  {
    name: '6. Row Level Security enabled with defense-in-depth staff SELECT policies on all 4 tables',
    check: () => sql.includes('ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.purchase_order_receiving_events ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view suppliers"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view purchase orders"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view purchase order items"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view po receiving events"')
  },
  {
    name: '7. Server-authoritative RPCs defined with SECURITY DEFINER and fixed search_path',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_create_supplier') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_create_purchase_order') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_approve_purchase_order') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_cancel_purchase_order') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_receive_purchase_order_items') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_get_purchase_order') &&
                 (sql.match(/SET search_path = pg_catalog, public/g) || []).length >= 6
  },
  {
    name: '8. Receiving integrates directly into canonical Phase 6 Node 1 inventory movements ledger',
    check: () => sql.includes('INSERT INTO public.inventory_movements') &&
                 sql.includes("'receipt'") &&
                 sql.includes('UPDATE public.inventory_balances')
  },
  {
    name: '9. Concurrency protection via advisory locks on PO and branch-product during receiving',
    check: () => sql.includes('hashtextextended(\'po_receive:\' || p_purchase_order_id::text, 0)') &&
                 sql.includes('hashtextextended(v_branch.id::text || \':\' || v_product.id::text, 0)')
  },
  {
    name: '10. Over-receipt and cancelled PO receiving prevented fail-closed',
    check: () => sql.includes('OVER_RECEIPT') &&
                 sql.includes('Cannot receive items on a cancelled purchase order')
  }
];

let failed = 0;
tests.forEach((t) => {
  if (t.check()) {
    console.log(`PASS: ${t.name}`);
  } else {
    console.error(`FAIL: ${t.name}`);
    failed++;
  }
});

console.log(`\nResult: ${tests.length - failed}/${tests.length} passed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Phase 6 Node 2 Suppliers, Purchase Orders & Receiving contracts verified successfully!');
}
