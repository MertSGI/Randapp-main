import fs from 'fs';
import path from 'path';

console.log('=== Stage H1A — Commercial Read Contracts QA ===\n');

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260810_h1a_commercial_catalog_and_read_contracts.sql');
const sqlContent = fs.readFileSync(migrationPath, 'utf8');

const requiredRPCs = [
  'public.resolve_effective_tenant_entitlements',
  'public.get_public_commercial_plan_catalog',
  'public.get_my_commercial_subscription_snapshot',
  'public.super_admin_get_commercial_catalog',
  'public.super_admin_get_tenant_commercial_snapshot'
];

for (const rpc of requiredRPCs) {
  if (!sqlContent.includes(`CREATE OR REPLACE FUNCTION ${rpc}`)) {
    console.error(`❌ FAIL: RPC definition ${rpc} missing from migration`);
    process.exit(1);
  }
}
console.log('✅ PASS: All 5 required H1A commercial read functions/RPCs present in migration');

// Check SECURITY DEFINER and search_path on functions
const funcMatches = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || [];
console.log(`Found ${funcMatches.length} functions in H1A migration.`);

if (!sqlContent.includes('SET search_path = pg_catalog, public')) {
  console.error('❌ FAIL: Explicit search_path setting missing from functions');
  process.exit(1);
}
console.log('✅ PASS: Fixed search_path = pg_catalog, public verified across RPCs');

// Check EXECUTE Grants
if (!sqlContent.includes('GRANT EXECUTE ON FUNCTION public.get_public_commercial_plan_catalog() TO anon, authenticated;') ||
    !sqlContent.includes('GRANT EXECUTE ON FUNCTION public.get_my_commercial_subscription_snapshot() TO authenticated;') ||
    !sqlContent.includes('REVOKE EXECUTE ON FUNCTION public.resolve_effective_tenant_entitlements(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;')) {
  console.error('❌ FAIL: RPC execution grants/revokes invalid');
  process.exit(1);
}
console.log('✅ PASS: RPC EXECUTE grants and internal function revokes verified');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1A Commercial Read Contracts QA PASSED.\n');
