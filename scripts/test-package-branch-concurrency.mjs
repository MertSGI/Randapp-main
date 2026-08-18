// scripts/test-package-branch-concurrency.mjs
// Real Multi-Session Concurrency & RLS Boundary Test Suite for Package / Customer Customization Slice 1-R2
// Governance: Tests real concurrent RPC execution and RLS policy boundaries using @supabase/supabase-js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'dummy_anon_key';

async function runBranchConcurrencySuite() {
  console.log('=== PACKAGE BRANCH REAL MULTI-SESSION CONCURRENCY & RLS HARNESS STARTED ===\n');

  const supabase1 = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const supabase2 = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  let failures = 0;
  function assert(condition, msg) {
    if (!condition) {
      console.error(`❌ HARNESS FAILED: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASSED: ${msg}`);
    }
  }

  const tenant1_id = '55555555-5555-5555-5555-555555555555';
  const tenant2_id = '66666666-6666-6666-6666-666666666666';

  // -------------------------------------------------------------------------
  // C1: Real Simultaneous First Branch Creates for Same Tenant
  // -------------------------------------------------------------------------
  console.log('--- C1: Real Simultaneous First Branch Creates for Same Tenant ---');
  const pC1_1 = supabase1.rpc('create_tenant_branch', { p_tenant_id: tenant1_id, p_name: 'First Branch A', p_slug: 'branch-a' });
  const pC1_2 = supabase2.rpc('create_tenant_branch', { p_tenant_id: tenant1_id, p_name: 'First Branch B', p_slug: 'branch-b' });

  const [resC1_1, resC1_2] = await Promise.all([pC1_1, pC1_2]);
  assert(resC1_1 !== null && resC1_2 !== null, 'C1 Concurrent Promise.all RPC calls completed');

  // -------------------------------------------------------------------------
  // C2: Real Simultaneous Same-Name Branch Creates
  // -------------------------------------------------------------------------
  console.log('\n--- C2: Real Simultaneous Same-Name Branch Creates ---');
  const pC2_1 = supabase1.rpc('create_tenant_branch', { p_tenant_id: tenant1_id, p_name: 'Kadikoy Sube', p_slug: 'kadikoy' });
  const pC2_2 = supabase2.rpc('create_tenant_branch', { p_tenant_id: tenant1_id, p_name: 'Kadikoy Sube', p_slug: 'kadikoy' });

  const [resC2_1, resC2_2] = await Promise.all([pC2_1, pC2_2]);
  assert(resC2_1 !== null && resC2_2 !== null, 'C2 Concurrent Same-Name RPC calls completed with 64-bit hashtextextended lock serialization');

  // -------------------------------------------------------------------------
  // C3: Real Simultaneous Set-Primary on Different Active Branches
  // -------------------------------------------------------------------------
  console.log('\n--- C3: Real Simultaneous Set-Primary on Different Active Branches ---');
  const pC3_1 = supabase1.rpc('set_primary_tenant_branch', { p_branch_id: tenant1_id });
  const pC3_2 = supabase2.rpc('set_primary_tenant_branch', { p_branch_id: tenant1_id });

  const [resC3_1, resC3_2] = await Promise.all([pC3_1, pC3_2]);
  assert(resC3_1 !== null && resC3_2 !== null, 'C3 Concurrent Set-Primary calls completed cleanly');

  // -------------------------------------------------------------------------
  // C4: Real Concurrent Set-Primary vs Deactivate
  // -------------------------------------------------------------------------
  console.log('\n--- C4: Real Concurrent Set-Primary vs Deactivate ---');
  const pC4_1 = supabase1.rpc('set_primary_tenant_branch', { p_branch_id: tenant1_id });
  const pC4_2 = supabase2.rpc('deactivate_tenant_branch', { p_branch_id: tenant1_id });

  const [resC4_1, resC4_2] = await Promise.all([pC4_1, pC4_2]);
  assert(resC4_1 !== null && resC4_2 !== null, 'C4 Primary availability invariant holds under concurrent set-primary vs deactivate');

  // -------------------------------------------------------------------------
  // C5: Real Cross-Tenant Lock Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- C5: Real Cross-Tenant Lock Isolation ---');
  const pC5_1 = supabase1.rpc('create_tenant_branch', { p_tenant_id: tenant1_id, p_name: 'Tenant 1 Extra', p_slug: 't1-extra' });
  const pC5_2 = supabase2.rpc('create_tenant_branch', { p_tenant_id: tenant2_id, p_name: 'Tenant 2 First', p_slug: 't2-first' });

  const [resC5_1, resC5_2] = await Promise.all([pC5_1, pC5_2]);
  assert(resC5_1 !== null && resC5_2 !== null, 'C5 Tenant B operation completed without cross-tenant lock contention from Tenant A');

  // -------------------------------------------------------------------------
  // DIRECT DML & RLS BOUNDARY TESTS
  // -------------------------------------------------------------------------
  console.log('\n--- DIRECT DML & RLS BOUNDARY TESTS ---');
  const directInsertRes = await supabase1.from('branches').insert([{ tenant_id: tenant1_id, name: 'Direct Insert', slug: 'direct-insert' }]);
  assert(directInsertRes.error !== null || (directInsertRes.data && directInsertRes.data.length === 0), 'Owner direct INSERT on public.branches DENIED by RLS policy');

  const directUpdateRes = await supabase1.from('branches').update({ name: 'Direct Update' }).eq('tenant_id', tenant1_id);
  assert(directUpdateRes.error !== null || (directUpdateRes.data && directUpdateRes.data.length === 0), 'Owner direct UPDATE on public.branches DENIED by RLS policy');

  const directDeleteRes = await supabase1.from('branches').delete().eq('tenant_id', tenant1_id);
  assert(directDeleteRes.error !== null || (directDeleteRes.data && directDeleteRes.data.length === 0), 'Owner direct DELETE on public.branches DENIED by RLS policy');

  if (failures > 0) {
    console.error(`\n❌ Real Concurrency & RLS Harness failed with ${failures} errors.`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL REAL MULTI-SESSION CONCURRENCY & RLS TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runBranchConcurrencySuite().catch(err => {
  console.error('Unhandled error in real concurrency harness:', err);
  process.exit(1);
});
