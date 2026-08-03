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

check('2. Migration 42 SQL file exists and contains forward-only contract truth redefinitions', () => {
  const mig42Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260817_h1d_contract_truth_and_idempotency_fix.sql'), 'utf8');

  const redefinedFunctions = [
    'super_admin_create_platform_restriction',
    'super_admin_end_platform_restriction',
    'super_admin_list_tenant_commercial_directory'
  ];

  for (const fnName of redefinedFunctions) {
    if (!mig42Content.includes(fnName)) {
      throw new Error(`Migration 42 missing redefinition for function: ${fnName}`);
    }
  }

  // Verify Idempotency Key mandatory check
  if (!mig42Content.includes('idempotency_key_required')) {
    throw new Error('Migration 42 missing idempotency_key_required enforcement');
  }

  // Verify Replay envelope fields
  if (!mig42Content.includes("'replayed', false") || !mig42Content.includes("'replayed', true")) {
    throw new Error('Migration 42 missing structured replayed boolean field in response envelopes');
  }

  // Verify Structured Idempotency Conflict handler
  if (!mig42Content.includes('idempotency_conflict')) {
    throw new Error('Migration 42 missing structured idempotency_conflict error conversion handler');
  }

  // Verify Directory Filter Boolean OR fix
  if (!mig42Content.includes("p_plan_code = 'all' OR p.code = p_plan_code")) {
    throw new Error('Migration 42 missing Boolean OR directory plan filter fix');
  }

  // Verify Security Hardening
  if (!mig42Content.includes('SECURITY DEFINER') || !mig42Content.includes('SET search_path = pg_catalog, public')) {
    throw new Error('Migration 42 RPCs lack mandatory SECURITY DEFINER or search_path hardening');
  }

  // Verify REVOKE from PUBLIC and anon
  if (!mig42Content.includes('REVOKE EXECUTE ON FUNCTION public.super_admin_create_platform_restriction') ||
      !mig42Content.includes('REVOKE EXECUTE ON FUNCTION public.super_admin_end_platform_restriction') ||
      !mig42Content.includes('REVOKE EXECUTE ON FUNCTION public.super_admin_list_tenant_commercial_directory')) {
    throw new Error('Migration 42 missing REVOKE statements for PUBLIC/anon');
  }
});

check('3. Migration Manifest and documentation files updated for Migration 41 and Migration 42', () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), 'supabase/MIGRATION_APPLY_MANIFEST.md'), 'utf8');
  if (!manifest.includes('20260816_h1d_missing_commercial_admin_contracts.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 41');
  }
  if (!manifest.includes('20260817_h1d_contract_truth_and_idempotency_fix.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 42');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1D-A Commercial Admin Contracts QA PASSED.');
