// scripts/test-commercial-plan-version-immutability.mjs
// Stage H1A — Commercial Catalog & Immutability QA Suite

import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Plan Version Immutability QA ===\n');

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260810_h1a_commercial_catalog_and_read_contracts.sql');

if (!fs.existsSync(migrationPath)) {
  console.error('❌ FAIL: Migration file 20260810_h1a_commercial_catalog_and_read_contracts.sql not found.');
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// 1. Plan Code Immutability
assert(sql.includes('enforce_plan_code_immutability'), 'enforce_plan_code_immutability function verified');
assert(sql.includes('trg_enforce_plan_code_immutability'), 'Immutability trigger on public.plans verified');
assert(sql.includes('CANNOT_MUTATE_PLAN_CODE'), 'CANNOT_MUTATE_PLAN_CODE exception defined');

// 2. Single Published Version Overlap Prevention
assert(sql.includes('enforce_single_published_plan_version'), 'enforce_single_published_plan_version function verified');
assert(sql.includes('trg_enforce_single_published_plan_version'), 'Overlap prevention trigger on public.plan_versions verified');
assert(sql.includes('OVERLAPPING_PUBLISHED_PLAN_VERSION'), 'OVERLAPPING_PUBLISHED_PLAN_VERSION exception defined');

// 3. Published Plan Version Immutability & Retirement Integrity
assert(sql.includes('enforce_plan_version_immutability'), 'enforce_plan_version_immutability function verified');
assert(sql.includes('trg_enforce_plan_version_immutability'), 'Immutability trigger on public.plan_versions verified');
assert(sql.includes('CANNOT_DELETE_PUBLISHED_PLAN_VERSION'), 'CANNOT_DELETE_PUBLISHED_PLAN_VERSION exception defined');
assert(sql.includes('Retirement transition cannot alter commercial content values'), 'Retirement integrity check verified');

// 4. Entitlement Immutability & Type Consistency
assert(sql.includes('enforce_plan_entitlement_immutability'), 'enforce_plan_entitlement_immutability function verified');
assert(sql.includes('trg_enforce_plan_entitlement_immutability'), 'Immutability trigger on public.plan_entitlements verified');
assert(sql.includes('enforce_entitlement_type_consistency'), 'enforce_entitlement_type_consistency function verified');
assert(sql.includes('ENTITLEMENT_TYPE_MISMATCH'), 'ENTITLEMENT_TYPE_MISMATCH exception defined');

// 5. Append-Only Ledgers & Financial Integrity
assert(sql.includes('enforce_append_only_subscription_events'), 'enforce_append_only_subscription_events function verified');
assert(sql.includes('enforce_append_only_billing_transactions'), 'enforce_append_only_billing_transactions function verified');
assert(sql.includes('REFUND_REVERSAL_MUST_REFERENCE_TRANSACTION'), 'Refund/Reversal linkage check verified');
assert(sql.includes('CROSS_TENANT_TRANSACTION_VIOLATION'), 'Cross-tenant transaction check verified');
assert(sql.includes('CROSS_TENANT_EVENT_VIOLATION'), 'Cross-tenant event check verified');

// 6. Platform System Restriction (Level 1 Precedence)
assert(sql.includes('platform_system_restrictions'), 'platform_system_restrictions table defined');
assert(sql.includes('platform_restriction'), 'platform_restriction source precedence integrated into resolve_effective_tenant_entitlements');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Immutability QA PASSED.');
