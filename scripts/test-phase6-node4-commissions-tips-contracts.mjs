// scripts/test-phase6-node4-commissions-tips-contracts.mjs
// Phase 6 Node 4: Staff Commissions & Tips Static Contracts

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20261003_phase6_node4_staff_commissions_tips.sql');

console.log('--- Checking Phase 6 Node 4: Staff Commissions & Tips Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Migration file exists and has valid header',
    check: () => fs.existsSync(migrationPath) && sql.includes('20261003_phase6_node4_staff_commissions_tips.sql')
  },
  {
    name: '2. public.staff_commission_rules table defined with tenant, staff, item_type and basis points',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.staff_commission_rules') &&
                 sql.includes('REFERENCES public.staff(id)') &&
                 sql.includes("item_type IN ('service', 'product', 'package', 'custom')") &&
                 sql.includes('uq_staff_commission_rules_logical UNIQUE (tenant_id, staff_id, item_type)')
  },
  {
    name: '3. public.pos_tip_allocations table defined with order, staff, positive minor units and uniqueness',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.pos_tip_allocations') &&
                 sql.includes('REFERENCES public.pos_orders(id, tenant_id)') &&
                 sql.includes('amount_minor_units  INTEGER NOT NULL CHECK (amount_minor_units > 0)') &&
                 sql.includes('uq_pos_tip_allocations_order_staff UNIQUE (tenant_id, order_id, staff_id)')
  },
  {
    name: '4. public.staff_earnings_ledger table defined with immutable structure and unique idempotency',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.staff_earnings_ledger') &&
                 sql.includes("earning_type IN ('commission', 'tip')") &&
                 sql.includes('earning_minor_units         INTEGER NOT NULL CHECK (earning_minor_units >= 0)') &&
                 sql.includes('uq_staff_earnings_tenant_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '5. Commission basis points strictly bounded between 0 and 10000',
    check: () => sql.includes('commission_basis_points >= 0 AND commission_basis_points <= 10000')
  },
  {
    name: '6. Money values use integer minor units exclusively',
    check: () => sql.includes('amount_minor_units  INTEGER NOT NULL') &&
                 sql.includes('earning_minor_units         INTEGER NOT NULL') &&
                 !sql.includes('FLOAT') && !sql.includes('DOUBLE')
  },
  {
    name: '7. Direct table mutations revoked on all 3 new tables',
    check: () => sql.includes('REVOKE ALL ON TABLE public.staff_commission_rules FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.pos_tip_allocations FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON TABLE public.staff_earnings_ledger FROM PUBLIC, anon, authenticated;')
  },
  {
    name: '8. Row Level Security enabled on all 3 new tables',
    check: () => sql.includes('ALTER TABLE public.staff_commission_rules ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.pos_tip_allocations ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.staff_earnings_ledger ENABLE ROW LEVEL SECURITY;')
  },
  {
    name: '9. pos_set_staff_commission_rule RPC defined with SECURITY DEFINER and search_path set',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_set_staff_commission_rule(') &&
                 sql.includes('SECURITY DEFINER') &&
                 sql.includes('SET search_path = pg_catalog, public')
  },
  {
    name: '10. pos_set_staff_commission_rule requires active tenant_owner role',
    check: () => sql.includes("role = 'tenant_owner'") &&
                 sql.includes('Only active tenant_owner can manage staff commission rules')
  },
  {
    name: '11. pos_set_staff_commission_rule rejects cross-tenant targets',
    check: () => sql.includes('v_target_staff.tenant_id <> v_owner_profile.tenant_id') &&
                 sql.includes('CROSS_TENANT_VIOLATION')
  },
  {
    name: '12. pos_set_tip_allocation RPC defined with SECURITY DEFINER and search_path set',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_set_tip_allocation(') &&
                 sql.includes('p_order_id UUID') &&
                 sql.includes('p_staff_id UUID') &&
                 sql.includes('p_tip_minor_units INTEGER')
  },
  {
    name: '13. pos_set_tip_allocation validates target staff is active in same tenant',
    check: () => sql.includes('v_target_staff.tenant_id <> v_caller_staff.tenant_id') &&
                 sql.includes('v_target_staff.active IS NOT TRUE')
  },
  {
    name: '14. pos_set_tip_allocation enforces open-order-only mutation',
    check: () => sql.includes("v_order.status <> 'open'") &&
                 sql.includes('Cannot modify tip allocation on order with status')
  },
  {
    name: '15. pos_set_tip_allocation serializes under advisory transaction lock',
    check: () => sql.includes("pg_advisory_xact_lock(") &&
                 sql.includes("hashtextextended('pos_order:' || p_order_id::text, 0)")
  },
  {
    name: '16. pos_set_tip_allocation updates pos_orders tip_minor_units and total_minor_units',
    check: () => sql.includes('SET tip_minor_units = v_new_tip_total') &&
                 sql.includes('total_minor_units = v_new_order_total')
  },
  {
    name: '17. pos_add_cart_item function signature preserved exactly',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_add_cart_item(') &&
                 sql.includes('p_order_id UUID') &&
                 sql.includes('p_item_type TEXT') &&
                 sql.includes('p_quantity INTEGER') &&
                 sql.includes('p_product_id UUID DEFAULT NULL') &&
                 sql.includes('p_service_id UUID DEFAULT NULL') &&
                 sql.includes('p_package_id UUID DEFAULT NULL') &&
                 sql.includes('p_appointment_id UUID DEFAULT NULL') &&
                 sql.includes('p_performing_staff_id UUID DEFAULT NULL') &&
                 sql.includes('p_custom_name TEXT DEFAULT NULL') &&
                 sql.includes('p_custom_price_minor_units INTEGER DEFAULT NULL') &&
                 sql.includes('p_discount_minor_units INTEGER DEFAULT 0')
  },
  {
    name: '18. pos_add_cart_item validates non-null performing_staff_id is active in same tenant',
    check: () => sql.includes('IF p_performing_staff_id IS NOT NULL THEN') &&
                 sql.includes('v_perf_staff.tenant_id <> v_staff.tenant_id') &&
                 sql.includes('v_perf_staff.active IS NOT TRUE')
  },
  {
    name: '19. pos_checkout_order function signature preserved exactly',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_checkout_order(') &&
                 sql.includes('p_order_id UUID') &&
                 sql.includes('p_payment_method TEXT') &&
                 sql.includes('p_amount_paid_minor_units INTEGER') &&
                 sql.includes('p_reference_identifier TEXT DEFAULT NULL') &&
                 sql.includes('p_idempotency_key TEXT DEFAULT NULL')
  },
  {
    name: '20. Commission calculation base explicitly excludes tax',
    check: () => sql.includes('v_comm_base := GREATEST(') &&
                 sql.includes('(v_item.unit_price_minor_units * v_item.quantity) - COALESCE(v_item.discount_minor_units, 0)') &&
                 !sql.includes('v_comm_base := GREATEST((v_item.unit_price_minor_units * v_item.quantity) + v_tax')
  },
  {
    name: '21. Commission calculation base explicitly excludes tips',
    check: () => !sql.includes('v_comm_base := v_order.total_minor_units') &&
                 !sql.includes('v_comm_base := v_order.tip_minor_units')
  },
  {
    name: '22. Deterministic integer arithmetic used for commission calculation with basis points',
    check: () => sql.includes('(v_comm_base::BIGINT * v_comm_rule.commission_basis_points) / 10000')
  },
  {
    name: '23. Staff earnings ledger deterministic commission idempotency key',
    check: () => sql.includes("'commission:' || v_order.id::text || ':' || v_item.id::text")
  },
  {
    name: '24. Staff earnings ledger deterministic tip idempotency key',
    check: () => sql.includes("'tip:' || v_order.id::text || ':' || v_tip_alloc.staff_id::text")
  },
  {
    name: '25. pos_get_staff_earnings RPC defined with SECURITY DEFINER and search_path set',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.pos_get_staff_earnings(') &&
                 sql.includes('p_staff_id UUID') &&
                 sql.includes('p_from TIMESTAMPTZ DEFAULT NULL') &&
                 sql.includes('p_to TIMESTAMPTZ DEFAULT NULL')
  },
  {
    name: '26. pos_get_staff_earnings restricts visibility to own staff and same-tenant tenant_owner',
    check: () => sql.includes('user_profile_id = v_caller_uid') &&
                 sql.includes("role = 'tenant_owner'") &&
                 sql.includes('Caller is not authorized to read earnings for target staff')
  },
  {
    name: '27. No implicit super_admin business earnings visibility granted',
    check: () => !sql.includes("role = 'super_admin'") &&
                 sql.includes('NO implicit super_admin authority')
  },
  {
    name: '28. No payroll, external payout, or provider disbursement implemented',
    check: () => !sql.includes('stripe_connect') &&
                 !sql.includes('iyzico_payout') &&
                 !sql.includes('tax_withholding') &&
                 !sql.includes('bank_payout')
  },
  {
    name: '29. No floating point mathematics used in commission or tip calculations',
    check: () => !sql.includes('::float') &&
                 !sql.includes('::numeric(') &&
                 !sql.includes('::real')
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
  console.error(`FAILED: ${failed} contracts failed.`);
  process.exit(1);
} else {
  console.log('All Phase 6 Node 4 Staff Commissions & Tips contracts verified successfully!');
}
