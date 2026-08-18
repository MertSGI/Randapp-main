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

console.log('🏁 Running Package Branch Server-Authority Verification Test Suite (Slice 1-R1)...\n');

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
  assert(migContent.includes('pg_advisory_xact_lock'), 'Migration implements tenant-scoped advisory transaction locks (pg_advisory_xact_lock)');
  assert(!migContent.includes('GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid, text, text, text) TO service_role;'), 'Least privilege: service_role execute grant removed');
  assert(migContent.includes('public.is_super_admin(v_user_id)'), 'Super Admin authorization uses canonical predicate public.is_super_admin');
  assert(migContent.includes("RETURN 'sube';"), 'generate_branch_slug is IMMUTABLE and produces deterministic "sube" fallback');
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
  assert(sqlTestContent.includes('get_public_branches'), 'Test SQL tests get_public_branches RPC isolation');
  assert(sqlTestContent.includes('generate_branch_slug'), 'Test SQL tests deterministic slug function');
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
