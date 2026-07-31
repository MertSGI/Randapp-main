import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Security QA ===\n');

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260810_h1a_commercial_catalog_and_read_contracts.sql');
const sqlContent = fs.readFileSync(migrationPath, 'utf8');

const rlsTables = [
  'public.commercial_feature_definitions',
  'public.plans',
  'public.plan_versions',
  'public.plan_entitlements',
  'public.tenant_entitlement_overrides',
  'public.subscription_events',
  'public.billing_transactions',
  'public.usage_counters'
];

for (const table of rlsTables) {
  if (!sqlContent.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)) {
    console.error(`❌ FAIL: RLS not enabled for ${table}`);
    process.exit(1);
  }
}
console.log('✅ PASS: Row Level Security enabled for all 8 commercial tables');

// Check Super Admin policy checks
if (!sqlContent.includes('public.is_super_admin(auth.uid())')) {
  console.error('❌ FAIL: Super Admin RLS policy check missing');
  process.exit(1);
}
console.log('✅ PASS: Super Admin authorization checks verified in RLS policies');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Security QA PASSED.\n');
