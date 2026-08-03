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

  if (!migContent.includes('SECURITY DEFINER') || !migContent.includes('SET search_path = pg_catalog, public')) {
    throw new Error('Migration 41 RPCs lack mandatory SECURITY DEFINER or search_path hardening');
  }

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

  if (!mig42Content.includes('idempotency_key_required')) {
    throw new Error('Migration 42 missing idempotency_key_required enforcement');
  }
});

check('3. Migration 43 SQL file exists and contains transaction advisory locking and none semantics', () => {
  const mig43Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260818_h1d_idempotency_concurrency_and_filter_fix.sql'), 'utf8');

  const redefinedFunctions = [
    'super_admin_create_platform_restriction',
    'super_admin_end_platform_restriction',
    'super_admin_list_tenant_commercial_directory'
  ];

  for (const fnName of redefinedFunctions) {
    if (!mig43Content.includes(fnName)) {
      throw new Error(`Migration 43 missing redefinition for function: ${fnName}`);
    }
  }

  // Verify Transaction Advisory Locking
  if (!mig43Content.includes('pg_advisory_xact_lock')) {
    throw new Error('Migration 43 missing pg_advisory_xact_lock advisory lock enforcement');
  }

  // Verify Complete Create Fingerprint
  if (!mig43Content.includes('COALESCE(p_expires_at::text, \'none\')')) {
    throw new Error('Migration 43 create fingerprint missing temporal fields');
  }

  // Verify Directory None Semantics
  if (!mig43Content.includes("p_status = 'none' AND s.id IS NULL")) {
    throw new Error('Migration 43 missing explicit directory none status filter semantics');
  }
  if (!mig43Content.includes("p_plan_code = 'none' AND (s.id IS NULL OR p.id IS NULL)")) {
    throw new Error('Migration 43 missing explicit directory none plan filter semantics');
  }

  // Verify Security Hardening
  if (!mig43Content.includes('SECURITY DEFINER') || !mig43Content.includes('SET search_path = pg_catalog, public')) {
    throw new Error('Migration 43 RPCs lack mandatory SECURITY DEFINER or search_path hardening');
  }
});

check('4. Migration Manifest and documentation files updated for Migrations 41, 42, and 43', () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), 'supabase/MIGRATION_APPLY_MANIFEST.md'), 'utf8');
  if (!manifest.includes('20260816_h1d_missing_commercial_admin_contracts.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 41');
  }
  if (!manifest.includes('20260817_h1d_contract_truth_and_idempotency_fix.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 42');
  }
  if (!manifest.includes('20260818_h1d_idempotency_concurrency_and_filter_fix.sql')) {
    throw new Error('MIGRATION_APPLY_MANIFEST.md missing entry for Migration 43');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1D-A Commercial Admin Contracts QA PASSED.');
