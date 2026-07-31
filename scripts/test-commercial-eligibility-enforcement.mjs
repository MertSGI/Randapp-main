import fs from 'fs';
import path from 'path';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('=== Stage H1C — Commercial Eligibility & Quota Enforcement QA ===\n');

const migDir = path.join(process.cwd(), 'supabase', 'migrations');
const h1cPath = path.join(migDir, '20260813_h1c_commercial_eligibility_and_quota_enforcement.sql');
assert(fs.existsSync(h1cPath), 'Migration 38 file 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql exists');

const sql = fs.readFileSync(h1cPath, 'utf8');

// Read all H1B files for regression
const h1bFiles = ['20260811_h1b_super_admin_commercial_mutations.sql', '20260812_h1b_apply_due_scheduled_plan_change_rpc.sql'];
let h1bSql = '';
for (const f of h1bFiles) {
  h1bSql += fs.readFileSync(path.join(migDir, f), 'utf8') + '\n';
}

// 1. Canonical staging bootstrap
assert(sql.includes("'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa'"), 'Canonical tenant UUID referenced in bootstrap');
assert(sql.includes("'baslangic'") && sql.includes("'active'") && sql.includes("'manual'"), 'Bootstrap assigns baslangic/active/manual');
assert(sql.includes("H1C staging commercial enforcement bootstrap"), 'Bootstrap event reason recorded');

// 2. Internal helpers
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_tenant_commercial_eligibility'), 'resolve_tenant_commercial_eligibility declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed'), 'assert_tenant_commercial_action_allowed declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_commercial_quota'), 'resolve_commercial_quota declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.resolve_quota_period_key'), 'resolve_quota_period_key declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.consume_commercial_usage'), 'consume_commercial_usage declared');

// 3. Internal helpers are NOT browser-callable
const internalFns = [
  'resolve_tenant_commercial_eligibility',
  'assert_tenant_commercial_action_allowed',
  'resolve_commercial_quota',
  'resolve_quota_period_key',
  'consume_commercial_usage'
];
for (const fn of internalFns) {
  assert(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${fn}`), `EXECUTE revoked from browser roles for ${fn}`);
}

// 4. Quota enforcement triggers
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_staff_quota'), 'enforce_staff_quota trigger function declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_service_quota'), 'enforce_service_quota trigger function declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_branch_quota'), 'enforce_branch_quota trigger function declared');
assert(sql.includes('trg_enforce_staff_quota'), 'Staff quota trigger installed');
assert(sql.includes('trg_enforce_service_quota'), 'Service quota trigger installed');
assert(sql.includes('trg_enforce_branch_quota'), 'Branch quota trigger installed');

// 5. SECURITY DEFINER and search_path
assert(sql.includes('SECURITY DEFINER'), 'SECURITY DEFINER used');
assert(sql.includes('SET search_path = pg_catalog, public'), 'search_path hardening present');

// 6. Reason codes
const reasonCodes = [
  'commercial_subscription_missing',
  'commercial_plan_version_missing',
  'commercial_plan_version_not_effective',
  'commercial_status_not_eligible',
  'commercial_trial_expired',
  'commercial_grace_expired',
  'commercial_feature_disabled',
  'commercial_quota_exceeded',
  'commercial_allowed',
  'commercial_tenant_not_found'
];
for (const rc of reasonCodes) {
  assert(sql.includes(rc), `Reason code ${rc} defined`);
}

// 7. Updated public booking RPCs
assert(sql.includes('CREATE OR REPLACE FUNCTION public.can_accept_public_booking'), 'can_accept_public_booking updated');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.create_public_booking'), 'create_public_booking updated');
assert(sql.includes('resolve_tenant_commercial_eligibility(v_tenant_id)'), 'create_public_booking uses commercial eligibility');
assert(sql.includes("assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking')"), 'create_public_booking checks core_booking');
assert(sql.includes("consume_commercial_usage(v_tenant_id, 'max_monthly_appointments'"), 'create_public_booking enforces monthly quota');

// 8. Cancellation feature gate
assert(sql.includes('CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token'), 'cancel_public_appointment updated');
assert(sql.includes("'customer_cancellation'"), 'Cancellation feature gate checks customer_cancellation');
assert(sql.includes("'feature_unavailable'"), 'Feature unavailable reason code used');

// 9. Diagnostic RPCs
assert(sql.includes('CREATE OR REPLACE FUNCTION public.get_my_commercial_enforcement_snapshot'), 'Self-service enforcement snapshot declared');
assert(sql.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot'), 'Super Admin enforcement snapshot declared');

// 10. Concurrency controls
assert(sql.includes('pg_advisory_xact_lock'), 'Advisory transaction locks used for concurrency');
assert(sql.includes('FOR UPDATE'), 'FOR UPDATE row locking used');

// 11. Usage counters integration
assert(sql.includes('usage_counters'), 'usage_counters table integrated');

// 12. Timezone handling
assert(sql.includes("'Europe/Istanbul'"), 'Europe/Istanbul timezone fallback present');
assert(sql.includes('resolve_quota_period_key'), 'Period key resolution function referenced');

// 13. H1B regression - ensure H1B RPCs still exist in their migration files
const h1bRpcs = [
  'super_admin_assign_commercial_plan',
  'super_admin_change_subscription_status',
  'super_admin_schedule_plan_change',
  'super_admin_cancel_scheduled_plan_change',
  'super_admin_apply_due_scheduled_plan_change',
  'super_admin_record_billing_transaction',
  'super_admin_manage_tenant_entitlement_override'
];
for (const rpc of h1bRpcs) {
  assert(h1bSql.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`), `H1B RPC ${rpc} remains in migration files`);
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1C Commercial Eligibility & Quota Enforcement QA PASSED.');
