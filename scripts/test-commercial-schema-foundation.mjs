import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Schema Foundation QA ===\n');

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Total migration files found: ${files.length}`);

if (files.length < 35) {
  console.error(`❌ FAIL: Expected at least 35 migration files, found ${files.length}`);
  process.exit(1);
}
console.log(`✅ PASS: Migration count is ${files.length} (Parity ${files.length}/${files.length})`);

const h1aMigration = files.find(f => f.includes('20260810_h1a_commercial_catalog_and_read_contracts'));
console.log(`Checking H1A migration file: ${h1aMigration}`);

if (!h1aMigration) {
  console.error(`❌ FAIL: H1A migration 20260810_h1a_commercial_catalog_and_read_contracts not found`);
  process.exit(1);
}
console.log('✅ PASS: H1A migration filename matched');

const sqlContent = fs.readFileSync(path.join(migrationsDir, h1aMigration), 'utf8');

const requiredTables = [
  'public.commercial_feature_definitions',
  'public.plans',
  'public.plan_versions',
  'public.plan_entitlements',
  'public.tenant_entitlement_overrides',
  'public.subscription_events',
  'public.billing_transactions',
  'public.usage_counters'
];

for (const table of requiredTables) {
  if (!sqlContent.includes(table)) {
    console.error(`❌ FAIL: Table definition ${table} not found in ${h1aMigration}`);
    process.exit(1);
  }
}
console.log('✅ PASS: All 8 required H1A commercial tables defined in migration');

// Check subscriptions table extension
if (!sqlContent.includes('plan_version_id UUID REFERENCES public.plan_versions') ||
    !sqlContent.includes('billing_mode TEXT') ||
    !sqlContent.includes('grace_until TIMESTAMPTZ')) {
  console.error('❌ FAIL: subscriptions table alignment columns missing from migration');
  process.exit(1);
}
console.log('✅ PASS: subscriptions table schema extension confirmed');

// Check canonical plans seeded
const canonicalPlans = ["'baslangic'", "'professional'", "'premium'", "'kurumsal'", "'standart'"];
for (const planCode of canonicalPlans) {
  if (!sqlContent.includes(planCode)) {
    console.error(`❌ FAIL: Seed for plan ${planCode} missing from migration`);
    process.exit(1);
  }
}
console.log('✅ PASS: All 5 canonical plans (baslangic, professional, premium, kurumsal, standart) seeded');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Schema Foundation QA PASSED.\n');
