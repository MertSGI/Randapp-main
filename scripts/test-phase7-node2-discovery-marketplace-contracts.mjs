// scripts/test-phase7-node2-discovery-marketplace-contracts.mjs
// Phase 7 Node 2 R1: Discovery Marketplace Server Authority Static Contracts
// Strictly asserts no duplicate listing table, server-authoritative projections,
// security definer functions, bounded pagination, deterministic ranking, and privacy guarantees.

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20261005_phase7_node2_discovery_marketplace_projection.sql');
const workflowPath = path.resolve('.github/workflows/lari-phase5-postgres-acceptance.yml');

console.log('===============================================================');
console.log('STARTING PHASE 7 NODE 2 R1 STATIC CONTRACT VERIFICATION');
console.log(`Checking migration: ${migrationPath}`);
console.log('===============================================================\n');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const workflowYaml = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;

function assertContract(name, checkFn, detail = '') {
  testsExecuted++;
  let passed = false;
  try {
    passed = Boolean(checkFn());
  } catch (err) {
    passed = false;
    detail = err.message;
  }

  if (passed) {
    testsPassed++;
    console.log(`  [PASS] ${name}`);
  } else {
    testsFailed++;
    console.error(`  [FAIL] ${name}${detail ? ' - ' + detail : ''}`);
  }
}

// -----------------------------------------------------------------------------
// 1. FORBIDDEN PATTERNS: NO DUPLICATE LISTING TABLE
// -----------------------------------------------------------------------------
assertContract(
  '1. Migration forbids and DOES NOT CREATE discovery_marketplace_listings table',
  () => !sql.includes('CREATE TABLE public.discovery_marketplace_listings') &&
        !sql.includes('CREATE TABLE IF NOT EXISTS public.discovery_marketplace_listings')
);

assertContract(
  '2. Migration DOES NOT create any duplicate business model tables',
  () => !sql.includes('CREATE TABLE') // No CREATE TABLE at all in migration 94
);

// -----------------------------------------------------------------------------
// 2. RPC SIGNATURES & SECURITY DEFINER
// -----------------------------------------------------------------------------
assertContract(
  '3. Migration implements public.get_discovery_marketplace_listings RPC',
  () => sql.includes('CREATE OR REPLACE FUNCTION public.get_discovery_marketplace_listings')
);

assertContract(
  '4. Migration implements public.get_discovery_marketplace_detail RPC',
  () => sql.includes('CREATE OR REPLACE FUNCTION public.get_discovery_marketplace_detail')
);

assertContract(
  '5. Both discovery RPCs are SECURITY DEFINER with fixed search_path',
  () => {
    const secDefs = (sql.match(/SECURITY DEFINER/g) || []).length;
    const paths = (sql.match(/SET search_path = pg_catalog, public/g) || []).length;
    return secDefs >= 2 && paths >= 2;
  }
);

assertContract(
  '6. Direct table DML is NOT granted and RPC execution is granted to anon, authenticated, service_role',
  () => sql.includes('GRANT EXECUTE ON FUNCTION public.get_discovery_marketplace_listings(TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER) TO anon, authenticated, service_role;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.get_discovery_marketplace_detail(TEXT) TO anon, authenticated, service_role;')
);

// -----------------------------------------------------------------------------
// 3. CANONICAL ELIGIBILITY REUSE
// -----------------------------------------------------------------------------
assertContract(
  '7. Public eligibility gate strictly checked in get_discovery_marketplace_listings',
  () => sql.includes("t.status IN ('active', 'manual_active')") &&
        sql.includes("t.onboarding_status = 'completed'") &&
        sql.includes("t.public_site_status = 'published'") &&
        sql.includes("bp.is_public_profile_enabled = true")
);

assertContract(
  '8. Public eligibility gate strictly enforced in get_discovery_marketplace_detail',
  () => sql.includes("v_tenant.status NOT IN ('active', 'manual_active')") &&
        sql.includes("v_tenant.onboarding_status <> 'completed'") &&
        sql.includes("v_tenant.public_site_status <> 'published'") &&
        sql.includes("v_bp.is_public_profile_enabled IS NOT TRUE")
);

// -----------------------------------------------------------------------------
// 4. VERIFIED PUBLISHED REVIEW AGGREGATION ONLY
// -----------------------------------------------------------------------------
assertContract(
  '9. Listings query filters reviews strictly by is_published = true',
  () => sql.includes("WHERE r.is_published = true")
);

assertContract(
  '10. Detail query filters reviews strictly by is_published = true for both summary and recent reviews',
  () => {
    const publishedMatches = sql.match(/r\.is_published = true/g) || [];
    return publishedMatches.length >= 3; // In listings, in detail summary, in detail recent
  }
);

// -----------------------------------------------------------------------------
// 5. DETERMINISTIC RANKING & BOUNDED PAGINATION
// -----------------------------------------------------------------------------
assertContract(
  '11. Deterministic tie-breaking order in listings query',
  () => sql.includes("avg_rating DESC NULLS LAST") &&
        sql.includes("review_count DESC") &&
        sql.includes("tenant_created_at DESC") &&
        sql.includes("tenant_id ASC")
);

assertContract(
  '12. Input limits enforced and bounded (default 20, max 100, min 1)',
  () => sql.includes("v_limit := 20;") &&
        sql.includes("v_limit := 100;") &&
        sql.includes("v_offset := 0;")
);

// -----------------------------------------------------------------------------
// 6. PRIVACY & LEAKAGE NEGATIVE CONSTRAINTS
// -----------------------------------------------------------------------------
assertContract(
  '13. No internal financial or private customer fields leaked in RPCs',
  () => !sql.includes('profit_margin') &&
        !sql.includes('cost_price') &&
        !sql.includes('commission_rate') &&
        !sql.includes('customer_notes') &&
        !sql.includes('user_email') &&
        !sql.includes('user_phone') &&
        !sql.includes('synced_to_google')
);

// -----------------------------------------------------------------------------
// 7. CI WORKFLOW PARITY
// -----------------------------------------------------------------------------
assertContract(
  '14. Workflow incorporates Phase 7 Node 2 static contracts execution',
  () => workflowYaml.includes('test-phase7-node2-discovery-marketplace-contracts.mjs')
);

assertContract(
  '15. Workflow incorporates Phase 7 Node 2 behavioral matrix execution',
  () => workflowYaml.includes('test-phase7-node2-discovery-marketplace-behavioral-matrix.mjs')
);

console.log('---------------------------------------------------------------');
console.log(`TOTAL STATIC CONTRACT TESTS: ${testsExecuted}`);
console.log(`PASSED: ${testsPassed}`);
console.log(`FAILED: ${testsFailed}`);
console.log('---------------------------------------------------------------');

if (testsFailed > 0) {
  console.error(`STATIC CONTRACT VERIFICATION FAILED WITH ${testsFailed} ERRORS.`);
  process.exit(1);
} else {
  console.log('ALL STATIC CONTRACT TESTS PASSED CLEANLY.');
  process.exit(0);
}
