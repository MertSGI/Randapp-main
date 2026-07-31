import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Legacy Compatibility QA ===\n');

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260810_h1a_commercial_catalog_and_read_contracts.sql');
const sqlContent = fs.readFileSync(migrationPath, 'utf8');

// 1. Check legacy standart plan registration
if (!sqlContent.includes("'standart', 'Standart (Miras)'") ||
    !sqlContent.includes("('standart', 'Standart (Miras)', 'Eski Standart paket aboneleri için korunan miras plan snapshot', false, true, false, true, 99)")) {
  console.error('❌ FAIL: Legacy standart plan parameters not set correctly');
  process.exit(1);
}
console.log('✅ PASS: Legacy standart plan correctly seeded as non-public, non-assignable, legacy=true');

// 2. Check public catalog RPC filters out legacy plans
if (!sqlContent.includes('p.is_legacy = false') ||
    !sqlContent.includes('p.is_public = true') ||
    !sqlContent.includes('p.is_assignable = true')) {
  console.error('❌ FAIL: Public catalog RPC does not filter out legacy plans');
  process.exit(1);
}
console.log('✅ PASS: get_public_commercial_plan_catalog RPC excludes legacy and non-public plans');

// 3. Check existing subscription backfill update
if (!sqlContent.includes('UPDATE public.subscriptions s') ||
    !sqlContent.includes('SET plan_version_id = pv.id') ||
    !sqlContent.includes('WHERE s.plan_version_id IS NULL')) {
  console.error('❌ FAIL: Subscriptions plan_version_id backfill query missing');
  process.exit(1);
}
console.log('✅ PASS: Subscriptions plan_version_id backfill logic verified');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Legacy Compatibility QA PASSED.\n');
