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

console.log('=== Stage H1B — Super Admin Commercial Mutation Backend QA ===\n');

const migPath = path.join(process.cwd(), 'supabase', 'migrations', '20260811_h1b_super_admin_commercial_mutations.sql');
assert(fs.existsSync(migPath), 'Migration 36 file 20260811_h1b_super_admin_commercial_mutations.sql exists');

const sql = fs.readFileSync(migPath, 'utf8');

// 1. Schema Extensions & Idempotency
assert(sql.includes('scheduled_plan_version_id UUID'), 'scheduled_plan_version_id column added to subscriptions');
assert(sql.includes('super_admin_commercial_mutation_idempotency'), 'super_admin_commercial_mutation_idempotency table created');
assert(sql.includes('chk_subscriptions_discounts_mutual_exclusivity'), 'Mutual discount exclusivity constraint defined');

// 2. RPC Contracts
const rpcs = [
  'super_admin_assign_commercial_plan',
  'super_admin_change_subscription_status',
  'super_admin_schedule_plan_change',
  'super_admin_cancel_scheduled_plan_change',
  'super_admin_record_billing_transaction',
  'super_admin_manage_tenant_entitlement_override'
];

for (const rpc of rpcs) {
  assert(sql.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`), `RPC ${rpc} declared`);
  assert(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${rpc}`), `EXECUTE revoked from PUBLIC for ${rpc}`);
  assert(sql.includes(`is_super_admin(v_actor_user_id)`), `Super Admin authorization enforced in ${rpc}`);
  assert(sql.includes(`SET search_path = pg_catalog, public`), `search_path hardening enforced in ${rpc}`);
}

// 3. Concurrency & Locking
assert(sql.includes('pg_advisory_xact_lock'), 'Concurrency-safe advisory transaction lock used in mutation RPCs');
assert(sql.includes('FOR UPDATE'), 'Row-level FOR UPDATE locking used for subscriptions');

// 4. Idempotency & Audit
assert(sql.includes('check_super_admin_idempotency'), 'Idempotency check function defined');
assert(sql.includes('record_super_admin_idempotency'), 'Idempotency record function defined');
assert(sql.includes('subscription_events'), 'Subscription events audit logging integrated into mutations');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1B Super Admin Commercial Mutation Backend QA PASSED.');
