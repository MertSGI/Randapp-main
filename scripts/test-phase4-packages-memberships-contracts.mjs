// scripts/test-phase4-packages-memberships-contracts.mjs
// Phase 4 Node 2: Packages & Memberships Foundation Static & Semantic Contract Tests

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20260925_phase4_packages_memberships_foundation.sql');

console.log('--- Checking Phase 4 Node 2: Packages & Memberships Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Package definitions table exists with price in integer minor units and total credits',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.service_package_definitions') &&
                 sql.includes('price_minor_units INTEGER NOT NULL CHECK (price_minor_units >= 0)') &&
                 sql.includes('total_credits INTEGER NOT NULL CHECK (total_credits > 0)')
  },
  {
    name: '2. Service package eligibility mapping table exists with cascade integrity',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.service_package_eligibility') &&
                 sql.includes('CONSTRAINT uq_pkg_eligibility UNIQUE (package_definition_id, service_id)') &&
                 sql.includes('CONSTRAINT fk_pkg_eligibility_service_tenant FOREIGN KEY (service_id, tenant_id)')
  },
  {
    name: '3. Customer packages table tracks initial and remaining credits with bounds',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.customer_packages') &&
                 sql.includes('remaining_credits INTEGER NOT NULL CHECK (remaining_credits >= 0)') &&
                 sql.includes('CONSTRAINT chk_customer_package_credits CHECK (remaining_credits <= initial_credits)') &&
                 sql.includes("status IN ('active', 'exhausted', 'expired', 'revoked')")
  },
  {
    name: '4. Immutable redemption ledger with unique idempotency key per tenant',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.customer_package_redemption_ledger') &&
                 sql.includes('credits_debited INTEGER NOT NULL CHECK (credits_debited > 0)') &&
                 sql.includes('credits_after INTEGER NOT NULL CHECK (credits_after >= 0)') &&
                 sql.includes('CONSTRAINT uq_pkg_redemption_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '5. Membership plans table exists with intervals and minor units',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.membership_plans') &&
                 sql.includes("interval_unit IN ('month', 'quarter', 'year')") &&
                 sql.includes('price_minor_units INTEGER NOT NULL CHECK (price_minor_units >= 0)')
  },
  {
    name: '6. Customer memberships table supports manual/test activation mode',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.customer_memberships') &&
                 sql.includes("activation_mode IN ('manual_test', 'comped', 'admin_granted')") &&
                 sql.includes("status IN ('active', 'paused', 'cancelled', 'expired')")
  },
  {
    name: '7. Concurrency-safe package credit redemption RPC uses SELECT ... FOR UPDATE',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.redeem_customer_package_credits') &&
                 sql.includes('FOR UPDATE')
  },
  {
    name: '8. Redemption RPC enforces idempotency',
    check: () => sql.includes('is_idempotent_replay') &&
                 sql.includes('public.customer_package_redemption_ledger')
  },
  {
    name: '9. Redemption RPC verifies service eligibility',
    check: () => sql.includes('service_not_eligible_for_package') &&
                 sql.includes('public.service_package_eligibility')
  },
  {
    name: '10. Grant package admin RPC exists with role validation',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.admin_grant_customer_package') &&
                 sql.includes("v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id)")
  },
  {
    name: '11. Search path is hardened on all functions',
    check: () => (sql.match(/SET search_path = pg_catalog, public/g) || []).length >= 2
  },
  {
    name: '12. Row level security enabled on all 6 tables with PUBLIC revoke',
    check: () => sql.includes('ALTER TABLE public.service_package_definitions ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.service_package_eligibility ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.customer_package_redemption_ledger ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;') &&
                 (sql.match(/REVOKE ALL ON public\..* FROM PUBLIC, anon, authenticated;/g) || []).length >= 6
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
  console.log('All Phase 4 Node 2 Packages & Memberships contracts verified successfully!');
}
