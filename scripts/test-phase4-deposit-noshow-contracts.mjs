// scripts/test-phase4-deposit-noshow-contracts.mjs
// Phase 4 Node 1: Deposit & No-Show Policy Static & Semantic Contract Tests

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20260924_phase4_deposit_noshow_policy_foundation.sql');

console.log('--- Checking Phase 4 Node 1: Deposit & No-Show Policy Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Deposit policies table definition exists with integer minor units check',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.deposit_policies') &&
                 sql.includes('deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0)')
  },
  {
    name: '2. Deposit type supports fixed_amount, percentage, and none',
    check: () => sql.includes("deposit_type IN ('fixed_amount', 'percentage', 'none')")
  },
  {
    name: '3. Composite foreign key constraint on service and tenant',
    check: () => sql.includes('CONSTRAINT fk_deposit_policies_service_tenant FOREIGN KEY (service_id, tenant_id)') &&
                 sql.includes('REFERENCES public.services(id, tenant_id)')
  },
  {
    name: '4. Unique index for tenant default deposit policy (service_id IS NULL)',
    check: () => sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_deposit_policies_tenant_default') &&
                 sql.includes('WHERE service_id IS NULL')
  },
  {
    name: '5. No-show policies table definition exists',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.no_show_policies') &&
                 sql.includes('cancellation_deadline_hours INTEGER NOT NULL DEFAULT 24') &&
                 sql.includes("CHECK (no_show_consequence IN ('forfeit_deposit', 'strike_record', 'block_booking', 'none'))")
  },
  {
    name: '6. Appointment deposits table with composite (appointment_id, tenant_id) foreign key, payment_intent_id composite FK, lifecycle states',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.appointment_deposits') &&
                 sql.includes('REFERENCES public.appointments(id, tenant_id)') &&
                 sql.includes('REFERENCES public.payment_intents(id, tenant_id)') &&
                 sql.includes("CHECK (status IN ('required', 'held', 'applied', 'forfeited', 'refunded', 'waived'))") &&
                 sql.includes("CHECK (refund_eligibility_state IN ('eligible_if_cancelled_in_time', 'non_refundable', 'refund_issued', 'forfeited'))")
  },
  {
    name: '7. Policy evaluator separated from slot availability (evaluate_booking_confirmation_deposit_policy) with CATALOG_PRICE_UNIT_UNRESOLVED fail-closed classification',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.evaluate_booking_confirmation_deposit_policy') &&
                 sql.includes('SECURITY DEFINER') &&
                 sql.includes('SET search_path = pg_catalog, public') &&
                 sql.includes('CATALOG_PRICE_UNIT_UNRESOLVED') &&
                 sql.includes('PERCENTAGE_DEPOSIT_CALCULATION_UNAVAILABLE') &&
                 sql.includes('chk_deposit_percentage_range')
  },
  {
    name: '8. Evaluator calculates minor units for fixed amount and fails closed for percentage',
    check: () => sql.includes("v_dep_pol.deposit_type = 'fixed_amount'") &&
                 sql.includes("v_dep_pol.deposit_type = 'percentage'") &&
                 sql.includes('deposit_amount_minor_units')
  },
  {
    name: '9. Evaluator returns no-show consequence and refund window',
    check: () => sql.includes('no_show_cancellation_deadline_hours') &&
                 sql.includes('no_show_consequence') &&
                 sql.includes('refund_eligible_window_hours')
  },
  {
    name: '10. Admin RPCs exist with tenant_owner / super_admin role check and safe tenant default upsert',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.admin_set_deposit_policy') &&
                 sql.includes('CREATE OR REPLACE FUNCTION public.admin_set_no_show_policy') &&
                 sql.includes('IF p_service_id IS NULL THEN') &&
                 sql.includes("v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id)")
  },
  {
    name: '11. Hardened search_path on admin RPCs',
    check: () => (sql.match(/SET search_path = pg_catalog, public/g) || []).length >= 3
  },
  {
    name: '12. Row level security enabled on all 3 tables with PUBLIC revoke',
    check: () => sql.includes('ALTER TABLE public.deposit_policies ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.no_show_policies ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.appointment_deposits ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('REVOKE ALL ON public.deposit_policies FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON public.no_show_policies FROM PUBLIC, anon, authenticated;') &&
                 sql.includes('REVOKE ALL ON public.appointment_deposits FROM PUBLIC, anon, authenticated;')
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
  console.log('All Phase 4 Node 1 Deposit & No-Show Policy contracts verified successfully!');
}
