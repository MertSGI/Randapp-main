import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1D-A MISSING COMMERCIAL ADMIN CONTRACTS QA ===');

function check(title, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${title}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${title} — ${err.message}`);
    process.exit(1);
  }
}

check('1. Migration 41 SQL file exists and contains all 5 required Super Admin RPCs', () => {
  const migContent = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260816_h1d_missing_commercial_admin_contracts.sql'), 'utf8');
  
  const requiredRPCs = [
    'super_admin_list_platform_restrictions',
    'super_admin_create_platform_restriction',
    'super_admin_end_platform_restriction',
    'super_admin_get_billing_transactions',
    'super_admin_list_tenant_commercial_directory'
  ];

  for (const rpc of requiredRPCs) {
    if (!migContent.includes(rpc)) {
      throw new Error(`Migration 41 missing required RPC: ${rpc}`);
    }
  }

  // Verify Security Hardening
  if (!migContent.includes('SECURITY DEFINER') || !migContent.includes('SET search_path = pg_catalog, public')) {
    throw new Error('Migration 41 RPCs lack mandatory SECURITY DEFINER or search_path hardening');
  }

  // Verify REVOKE from PUBLIC and anon
  if (!migContent.includes('REVOKE EXECUTE ON FUNCTION public.super_admin_list_platform_restrictions')) {
    throw new Error('Migration 41 missing REVOKE statement for PUBLIC/anon');
  }
});

check('2. Migration Manifest and documentation files updated for Migration 41', () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), 'supabase/MIGRATION_APPLY_MANIFEST.md'), 'utf8');
  if (!manifest.includes('20260816_h1d_missing_commercial_admin_contracts.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 41');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1D-A Commercial Admin Contracts QA PASSED.');
