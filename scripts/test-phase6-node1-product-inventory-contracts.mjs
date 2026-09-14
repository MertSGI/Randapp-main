// scripts/test-phase6-node1-product-inventory-contracts.mjs
// Phase 6 Node 1: Product Catalog & Ledger-Safe Inventory Foundation Static Contracts

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20260930_phase6_product_inventory_foundation.sql');

console.log('--- Checking Phase 6 Node 1: Product Catalog & Inventory Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Products table defined with tenant FK, positive price minor units, ISO currency check, and unique SKU per tenant',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.products') &&
                 sql.includes('REFERENCES public.tenants(id)') &&
                 sql.includes('price_minor_units   INTEGER NOT NULL CHECK (price_minor_units >= 0)') &&
                 sql.includes("CHECK (currency ~ '^[A-Z]{3}$'") &&
                 sql.includes('CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)')
  },
  {
    name: '2. Inventory balances table defined with branch scoping, allocated <= on_hand invariant',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.inventory_balances') &&
                 sql.includes('REFERENCES public.branches(id)') &&
                 sql.includes('CONSTRAINT uq_inventory_balances_branch_product UNIQUE (branch_id, product_id)') &&
                 sql.includes('CONSTRAINT chk_inventory_balances_allocated CHECK (allocated_quantity <= on_hand_quantity)')
  },
  {
    name: '3. Inventory movements table defined with append-only ledger types and idempotency constraint',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.inventory_movements') &&
                 sql.includes("'receipt'") &&
                 sql.includes("'sale'") &&
                 sql.includes("'adjustment_gain'") &&
                 sql.includes("'adjustment_loss'") &&
                 sql.includes("'return_restock'") &&
                 sql.includes('CONSTRAINT uq_inventory_movements_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '4. Direct table access strictly revoked from PUBLIC, anon, and authenticated on all 3 tables',
    check: () => sql.includes('REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;')
  },
  {
    name: '5. Row Level Security enabled on all 3 tables with defense-in-depth staff read policies',
    check: () => sql.includes('ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view products"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view inventory balances"') &&
                 sql.includes('CREATE POLICY "Authorized tenant staff can view inventory movements"')
  },
  {
    name: '6. Server-authoritative RPCs defined with SECURITY DEFINER and search_path set',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_create_product') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_record_stock_receipt') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_decrement_stock_for_sale') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_adjust_stock') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_return_restock') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.pos_get_branch_inventory') &&
                 (sql.match(/SET search_path = pg_catalog, public/g) || []).length >= 6
  },
  {
    name: '7. Concurrency serialization using pg_advisory_xact_lock on branch and product',
    check: () => (sql.match(/pg_advisory_xact_lock/g) || []).length >= 4
  },
  {
    name: '8. Insufficient stock fail-closed validation and negative balance protection',
    check: () => sql.includes('INSUFFICIENT_STOCK') &&
                 sql.includes('Requested quantity % exceeds available on-hand balance')
  },
  {
    name: '9. Cross-tenant and cross-branch isolation enforced in RPCs',
    check: () => sql.includes('CROSS_TENANT_VIOLATION') &&
                 sql.includes('Product not found or cross-tenant access denied')
  },
  {
    name: '10. Idempotent request duplicate handling returns existing movement without mutation',
    check: () => sql.includes('idempotent_replay')
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
  console.log('All Phase 6 Node 1 Product & Inventory contracts verified successfully!');
}
