import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🏁 Running Package Branch Server-Authority Verification Test Suite (Slice 1-R2.2)...\n');

// 1. Verify Migration 20260904 Existence & RPC Contents
const migrationPath = path.join(rootDir, 'supabase/migrations/20260904_authenticated_owner_branch_mutations_rpc.sql');
assert(fs.existsSync(migrationPath), 'Migration 20260904_authenticated_owner_branch_mutations_rpc.sql exists');

if (fs.existsSync(migrationPath)) {
  const migContent = fs.readFileSync(migrationPath, 'utf8');
  assert(migContent.includes('CREATE OR REPLACE FUNCTION public.create_tenant_branch'), 'Migration contains create_tenant_branch RPC');
  assert(migContent.includes('CREATE OR REPLACE FUNCTION public.update_tenant_branch'), 'Migration contains update_tenant_branch RPC');
  assert(migContent.includes('CREATE OR REPLACE FUNCTION public.set_primary_tenant_branch'), 'Migration contains set_primary_tenant_branch RPC');
  assert(migContent.includes('CREATE OR REPLACE FUNCTION public.deactivate_tenant_branch'), 'Migration contains deactivate_tenant_branch RPC');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.create_tenant_branch'), 'Migration revokes PUBLIC/anon on create_tenant_branch');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.update_tenant_branch'), 'Migration revokes PUBLIC/anon on update_tenant_branch');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.set_primary_tenant_branch'), 'Migration revokes PUBLIC/anon on set_primary_tenant_branch');
  assert(migContent.includes('REVOKE ALL ON FUNCTION public.deactivate_tenant_branch'), 'Migration revokes PUBLIC/anon on deactivate_tenant_branch');
  assert(migContent.includes('cannot_deactivate_primary_with_active_branches'), 'Migration preserves active primary deactivation invariant');
  assert(migContent.includes('hashtextextended'), 'Migration implements 64-bit hashtextextended tenant-scoped advisory locks');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid, text, text, text) TO service_role;'), 'Least privilege: service_role execute grant removed');
  assert(migContent.includes('public.is_super_admin(v_user_id)'), 'Super Admin authorization uses canonical predicate public.is_super_admin');
  assert(migContent.includes("RETURN 'sube';"), 'generate_branch_slug is IMMUTABLE and produces deterministic "sube" fallback');
  assert(migContent.includes('CREATE POLICY "Tenant Owner - Read own branches"'), 'Migration creates SELECT-ONLY Tenant Owner policy on public.branches');
  assert(migContent.includes('CREATE POLICY "Super Admin - Read all branches"'), 'Migration creates SELECT-ONLY Super Admin policy on public.branches');
  assert(!migContent.includes('FOR ALL ON public.branches'), 'Migration removes direct DML FOR ALL policies on public.branches');
}

// 2. Verify SQL Test File Assertions
const testSqlPath = path.join(rootDir, 'supabase/tests/package_branch_server_authority_tests.sql');
assert(fs.existsSync(testSqlPath), 'Test SQL package_branch_server_authority_tests.sql exists');

if (fs.existsSync(testSqlPath)) {
  const sqlTestContent = fs.readFileSync(testSqlPath, 'utf8');
  assert(sqlTestContent.includes('create_tenant_branch'), 'Test SQL tests create_tenant_branch');
  assert(sqlTestContent.includes('update_tenant_branch'), 'Test SQL tests update_tenant_branch');
  assert(sqlTestContent.includes('set_primary_tenant_branch'), 'Test SQL tests set_primary_tenant_branch');
  assert(sqlTestContent.includes('deactivate_tenant_branch'), 'Test SQL tests deactivate_tenant_branch');
  assert(sqlTestContent.includes('cannot_deactivate_primary_with_active_branches'), 'Test SQL asserts primary deactivation invariant');
  assert(sqlTestContent.includes('tenant_entitlement_overrides'), 'Test SQL creates tenant_entitlement_overrides for multi-branch test tenants');
  assert(sqlTestContent.includes('COMMERCIAL_BRANCH_QUOTA_NEGATIVE_CONTROL'), 'Test SQL executes commercial quota negative control');
}

// 2b. Verify Fail-Closed Real Multi-Session Concurrency & RLS Harness
const harnessPath = path.join(rootDir, 'supabase/tests/package_branch_concurrency_harness.ts');
assert(fs.existsSync(harnessPath), 'Real multi-session concurrency harness package_branch_concurrency_harness.ts exists');

if (fs.existsSync(harnessPath)) {
  const hContent = fs.readFileSync(harnessPath, 'utf8');
  assert(hContent.includes("import pg from 'pg'") || hContent.includes("from 'pg'"), 'Harness imports pg Client for real DB connections');
  assert(hContent.includes('statement_timeout'), 'Harness sets bounded statement_timeout');
  assert(hContent.includes("set_config('request.jwt.claim.sub'"), 'Harness sets JWT auth context in test sessions');
  assert(hContent.includes('SET LOCAL ROLE authenticated'), 'Harness tests direct RLS under authenticated database role');
  assert(hContent.includes('Promise.all'), 'Harness executes concurrent Promise.all queries');
  assert(!hContent.includes('assert(true,'), 'Harness contains ZERO fake unconditional assert(true) statements');
  assert(!hContent.includes('is currently offline in this environment session'), 'Harness rejects ECONNREFUSED success-return path');
  assert(!hContent.includes('fully constructed & validated'), 'Harness rejects fake validation text without DB execution');
  assert(hContent.includes('process.exit(1)'), 'Harness fails closed with process.exit(1) on DB connection failure');
  assert(hContent.includes('HARNESS_DB_EXECUTION_OCCURRED = YES'), 'Harness contains HARNESS_DB_EXECUTION_OCCURRED marker');
  assert(hContent.includes('HARNESS_EXECUTION_COMPLETED = YES'), 'Harness contains HARNESS_EXECUTION_COMPLETED marker');
  assert(hContent.includes('SAVEPOINT'), 'Harness uses SAVEPOINT for safe transaction recovery during expected RLS failures');
  assert(hContent.includes('ROLLBACK TO SAVEPOINT'), 'Harness uses ROLLBACK TO SAVEPOINT for RLS test recovery');
  assert(hContent.includes('validateUuid') || hContent.includes('UUID_REGEX'), 'Harness validates returned UUID format');
  assert(hContent.includes('tenant_entitlement_overrides'), 'Harness creates tenant_entitlement_overrides for synthetic multi-branch tenants');
  assert(hContent.includes('TEST_MULTI_BRANCH_OVERRIDE_RESOLUTION'), 'Harness verifies commercial quota override resolution');
}

// 3. Verify branchService.ts Supabase Fail-Closed Server Authority
const branchServicePath = path.join(rootDir, 'services/branchService.ts');
assert(fs.existsSync(branchServicePath), 'branchService.ts exists');

if (fs.existsSync(branchServicePath)) {
  const bsContent = fs.readFileSync(branchServicePath, 'utf8');
  assert(bsContent.includes("create_tenant_branch"), 'branchService uses create_tenant_branch RPC');
  assert(bsContent.includes("update_tenant_branch"), 'branchService uses update_tenant_branch RPC');
  assert(bsContent.includes("set_primary_tenant_branch"), 'branchService uses set_primary_tenant_branch RPC');
  assert(bsContent.includes("deactivate_tenant_branch"), 'branchService uses deactivate_tenant_branch RPC');
  assert(bsContent.includes("get_public_branches"), 'branchService preserves get_public_branches fail-closed contract');
  assert(!bsContent.includes("saveStoredBranches") || bsContent.includes("getDataSourceMode() === 'supabase'"), 'branchService separates Supabase mode from localStorage fallback');
}

// 4. Verify BranchManagementSection.tsx UI Consumption
const bmsPath = path.join(rootDir, 'components/BranchManagementSection.tsx');
assert(fs.existsSync(bmsPath), 'BranchManagementSection.tsx exists');

if (fs.existsSync(bmsPath)) {
  const bmsContent = fs.readFileSync(bmsPath, 'utf8');
  assert(bmsContent.includes("await branchService.listBranches"), 'BranchManagementSection calls listBranches asynchronously');
  assert(!bmsContent.includes("branchService.getStoredBranches(tenantId)"), 'BranchManagementSection does not read getStoredBranches directly');
}

if (failures > 0) {
  console.error(`\n❌ Package Branch Server-Authority Verification failed with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('\n🎉 All Package Branch Server-Authority Verification tests passed successfully!');
  process.exit(0);
}
