import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Plan Version Immutability QA ===\n');

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260810_h1a_commercial_catalog_and_read_contracts.sql');
const sqlContent = fs.readFileSync(migrationPath, 'utf8');

// 1. Check plan_versions immutability function & trigger
if (!sqlContent.includes('enforce_plan_version_immutability') ||
    !sqlContent.includes('CANNOT_DELETE_PUBLISHED_PLAN_VERSION') ||
    !sqlContent.includes('CANNOT_MUTATE_PUBLISHED_PLAN_VERSION')) {
  console.error('❌ FAIL: enforce_plan_version_immutability trigger function not properly defined');
  process.exit(1);
}
console.log('✅ PASS: enforce_plan_version_immutability function verified');

if (!sqlContent.includes('BEFORE UPDATE OR DELETE ON public.plan_versions')) {
  console.error('❌ FAIL: Trigger on public.plan_versions missing');
  process.exit(1);
}
console.log('✅ PASS: Immutability trigger on public.plan_versions verified');

// 2. Check plan_entitlements immutability function & trigger
if (!sqlContent.includes('enforce_plan_entitlement_immutability') ||
    !sqlContent.includes('CANNOT_MUTATE_PUBLISHED_PLAN_ENTITLEMENTS')) {
  console.error('❌ FAIL: enforce_plan_entitlement_immutability trigger function not properly defined');
  process.exit(1);
}
console.log('✅ PASS: enforce_plan_entitlement_immutability function verified');

if (!sqlContent.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.plan_entitlements')) {
  console.error('❌ FAIL: Trigger on public.plan_entitlements missing');
  process.exit(1);
}
console.log('✅ PASS: Immutability trigger on public.plan_entitlements verified');

// 3. Check append-only triggers on subscription_events & billing_transactions
if (!sqlContent.includes('enforce_append_only_subscription_events') ||
    !sqlContent.includes('enforce_append_only_billing_transactions')) {
  console.error('❌ FAIL: Append-only ledger triggers missing');
  process.exit(1);
}
console.log('✅ PASS: Append-only ledger triggers for subscription_events & billing_transactions verified');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Immutability QA PASSED.\n');
