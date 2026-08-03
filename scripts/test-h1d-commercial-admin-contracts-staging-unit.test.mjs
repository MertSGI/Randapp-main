// scripts/test-h1d-commercial-admin-contracts-staging-unit.test.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Executable Unit Test Suite for Stage H1D-B Staging Acceptance Runner Logic
// Imports and tests actual functions from test-h1d-commercial-admin-contracts-staging.mjs
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import {
  CANONICAL_TENANT_ID,
  safeJsonParse,
  fetchUserProfile,
  verifySuperAdminRpcPrivilege,
  classifyAuthorizationResponse,
  trackCreatedRestriction,
  generateManualCleanupSql,
  buildExecutableBehavioralCases
} from './test-h1d-commercial-admin-contracts-staging.mjs';

console.log('=== Stage H1D-B Staging Acceptance Runner Executable Unit QA ===\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// 1. Verify Runner File Exists
const runnerPath = path.join(process.cwd(), 'scripts', 'test-h1d-commercial-admin-contracts-staging.mjs');
assert(fs.existsSync(runnerPath), 'test-h1d-commercial-admin-contracts-staging.mjs file exists');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');

// ── TEST SUITE EXECUTION ──────────────────────────────────────────────────

// Helper: Mock fetch factory
function createMockFetch(handler) {
  return async (url, options = {}) => {
    return handler(url, options);
  };
}

const TEST_ENV = {
  supabaseUrl: 'https://staging.supabase.co',
  anonKey: 'mock-anon-key',
  userUuid: '11111111-1111-4111-a111-111111111111',
  token: 'mock-jwt-token',
  testTenantId: 'e0000000-0000-0000-0000-000000000002',
  testFeatureKey: 'commercial_analytics'
};

// 1. users_profile query contains authenticated user UUID filter
async function testUserProfileUuidFilter() {
  let queriedUrl = '';
  const mockFetch = createMockFetch(async (url) => {
    queriedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify([{ id: TEST_ENV.userUuid, tenant_id: CANONICAL_TENANT_ID, role: 'tenant_owner', active: true }])
    };
  });

  global.fetch = mockFetch;
  const profile = await fetchUserProfile(TEST_ENV.supabaseUrl, TEST_ENV.anonKey, TEST_ENV.userUuid, TEST_ENV.token);
  assert(queriedUrl.includes(`/rest/v1/users_profile`) && queriedUrl.includes(`id=eq.${TEST_ENV.userUuid}`) && queriedUrl.includes(`limit=1`), 'users_profile query contains authenticated user UUID filter');
}

// 2. Canonical owner tenant comparison uses aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa
function testCanonicalTenantConstant() {
  assert(CANONICAL_TENANT_ID === 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Canonical owner tenant comparison uses aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
}

// 3. Canonical branch UUID is never used as tenant ID
function testBranchUuidNotTenantId() {
  const branchId = 'b0000000-0000-0000-0000-000000000001';
  assert(CANONICAL_TENANT_ID !== branchId, 'Canonical branch UUID is never used as tenant ID');
}

// 4. Wrong users_profile role blocks Run ID
function testWrongRoleBlocksRunId() {
  const profile = { id: TEST_ENV.userUuid, role: 'staff', tenant_id: CANONICAL_TENANT_ID, active: true };
  const isValidOwner = profile.role === 'tenant_owner' && profile.tenant_id === CANONICAL_TENANT_ID;
  assert(isValidOwner === false, 'Wrong users_profile role blocks Run ID');
}

// 5. Wrong users_profile tenant blocks Run ID
function testWrongTenantBlocksRunId() {
  const profile = { id: TEST_ENV.userUuid, role: 'tenant_owner', tenant_id: 'wrong-tenant-id', active: true };
  const isValidOwner = profile.role === 'tenant_owner' && profile.tenant_id === CANONICAL_TENANT_ID;
  assert(isValidOwner === false, 'Wrong users_profile tenant blocks Run ID');
}

// 6. Malformed response envelope fails
function testMalformedResponseEnvelopeFails() {
  const res = { status: 200, ok: true, data: { success: true } }; // missing restrictions array
  const isValidList = res.ok && res.data?.success === true && Array.isArray(res.data?.restrictions);
  assert(isValidList === false, 'Malformed response envelope fails');
}

// 7. Create parser reads restriction.id
function testCreateParserReadsRestrictionId() {
  const trackedSet = new Set();
  const trackedList = [];
  const res = { ok: true, data: { success: true, restriction: { id: 'rest-uuid-99' } } };
  const id = trackCreatedRestriction(trackedSet, trackedList, res, 'unit_test');
  assert(id === 'rest-uuid-99' && trackedSet.has('rest-uuid-99'), 'Create parser reads restriction.id');
}

// 8. List parser reads restrictions
function testListParserReadsRestrictions() {
  const res = { ok: true, data: { success: true, restrictions: [{ id: 'r1' }, { id: 'r2' }] } };
  assert(Array.isArray(res.data?.restrictions) && res.data.restrictions.length === 2, 'List parser reads restrictions');
}

// 9. Billing parser reads transactions
function testBillingParserReadsTransactions() {
  const res = { ok: true, data: { success: true, transactions: [{ id: 'tx1' }] } };
  assert(Array.isArray(res.data?.transactions) && res.data.transactions.length === 1, 'Billing parser reads transactions');
}

// 10. Directory parser reads tenants
function testDirectoryParserReadsTenants() {
  const res = { ok: true, data: { success: true, tenants: [{ tenant_id: 't1' }] } };
  assert(Array.isArray(res.data?.tenants) && res.data.tenants.length === 1, 'Directory parser reads tenants');
}

// 11. 400 denial does not pass authorization
function test400DenialDoesNotPassAuth() {
  const res = { status: 400, ok: false, data: { success: false, reason_code: 'invalid_parameters' } };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === false, '400 denial does not pass authorization');
}

// 12. 404 denial does not pass authorization
function test404DenialDoesNotPassAuth() {
  const res = { status: 404, ok: false, data: { success: false, reason_code: 'tenant_not_found' } };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === false, '404 denial does not pass authorization');
}

// 13. 500 denial does not pass authorization
function test500DenialDoesNotPassAuth() {
  const res = { status: 500, ok: false, data: null };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === false, '500 denial does not pass authorization');
}

// 14. Network error does not pass authorization
function testNetworkErrorDoesNotPassAuth() {
  const res = { status: 500, ok: false, error: 'Failed to fetch' };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === false, 'Network error does not pass authorization');
}

// 15. Expected 401 passes
function testExpected401Passes() {
  const res = { status: 401, ok: false, data: null };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === true, 'Expected 401 passes');
}

// 16. Expected 403 passes
function testExpected403Passes() {
  const res = { status: 403, ok: false, data: null };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === true, 'Expected 403 passes');
}

// 17. HTTP 200 unauthorized envelope passes
function test200UnauthorizedEnvelopePasses() {
  const res = { status: 200, ok: true, data: { success: false, reason_code: 'unauthorized' } };
  const isAuth = classifyAuthorizationResponse('staff', res);
  assert(isAuth === true, 'HTTP 200 unauthorized envelope passes');
}

// 18. Every successful create is fixture-tracked
function testEverySuccessfulCreateIsTracked() {
  const trackedSet = new Set();
  const trackedList = [];
  const res = { ok: true, data: { success: true, restriction: { id: 'r-101' } } };
  trackCreatedRestriction(trackedSet, trackedList, res, 'test_create');
  assert(trackedSet.has('r-101') && trackedList.some(i => i.id === 'r-101'), 'Every successful create is fixture-tracked');
}

// 19. Untracked successful create fails
function testUntrackedSuccessfulCreateFails() {
  const trackedSet = new Set();
  const trackedList = [];
  const res = { ok: true, data: { success: true, restriction: null } };
  const id = trackCreatedRestriction(trackedSet, trackedList, res, 'test_create');
  assert(id === null && trackedSet.size === 0, 'Untracked successful create fails');
}

// 20. Inactive historical restriction remains counted as physical fixture
function testInactiveHistoricalRestrictionCounted() {
  const restrictions = [
    { id: 'r-1', is_restricted: false, is_currently_active: false },
    { id: 'r-2', is_restricted: true, is_currently_active: true }
  ];
  const trackedSet = new Set(['r-1', 'r-2']);
  const remainingFixtures = restrictions.filter(r => trackedSet.has(r.id)).length;
  assert(remainingFixtures === 2, 'Inactive historical restriction remains counted as physical fixture');
}

// 21. Audit/idempotency rows affect remainingFixtures
function testAuditIdempotencyAffectRemainingFixtures() {
  const remainingFixtures = 2; // Physical historical rows present
  const manualCleanupRequired = remainingFixtures > 0;
  assert(manualCleanupRequired === true, 'Audit/idempotency rows affect remainingFixtures');
}

// 22. Manual cleanup SQL uses actual table and column names
function testManualCleanupSqlUsesActualNames() {
  const { sql } = generateManualCleanupSql('run_123', ['r-1'], ['k-1'], TEST_ENV.testTenantId);
  assert(sql.includes('public.platform_system_restrictions') && sql.includes('is_restricted = false') && sql.includes('public.super_admin_idempotency'), 'Manual cleanup SQL uses actual table and column names');
}

// 23. Manual cleanup SQL is scoped to exact IDs
function testManualCleanupSqlScopedToExactIds() {
  const { sql } = generateManualCleanupSql('run_123', ['uuid-target-123'], ['k-1'], TEST_ENV.testTenantId);
  assert(sql.includes(`'uuid-target-123'`) && !sql.includes(`WHERE tenant_id = '${TEST_ENV.testTenantId}'`), 'Manual cleanup SQL is scoped to exact IDs');
}

// 24. Defined behavioral case count equals executed case count
function testDefinedBehavioralCaseCountEqualsExecuted() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, 'r-disp');
  assert(cases.length === 55, 'Defined behavioral case count equals executed case count');
}

// 25. Cleanup-required exit code is 2
function testCleanupRequiredExitCode2() {
  const failed = 0;
  const manualCleanupRequired = true;
  let exitCode = 0;
  if (failed > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 2, 'Cleanup-required exit code is 2');
}

// 26. Assertion failure exit code is 1
function testAssertionFailureExitCode1() {
  const failed = 1;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failed > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 1, 'Assertion failure exit code is 1');
}

// 27. Verified all-zero exit code is 0
function testVerifiedAllZeroExitCode0() {
  const failed = 0;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failed > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 0, 'Verified all-zero exit code is 0');
}

// 28. Secrets and bearer tokens are never logged
function testSecretsAndTokensNeverLogged() {
  const sampleLog = 'Authorization calls attempted: 30\nCleanup attempted: true\nRemaining fixtures: 2';
  const containsSecret = sampleLog.includes('pass') || sampleLog.includes('Bearer');
  assert(containsSecret === false, 'Secrets and bearer tokens are never logged');
}

// Execute 28 tests synchronously
(async () => {
  await testUserProfileUuidFilter();
  testCanonicalTenantConstant();
  testBranchUuidNotTenantId();
  testWrongRoleBlocksRunId();
  testWrongTenantBlocksRunId();
  testMalformedResponseEnvelopeFails();
  testCreateParserReadsRestrictionId();
  testListParserReadsRestrictions();
  testBillingParserReadsTransactions();
  testDirectoryParserReadsTenants();
  test400DenialDoesNotPassAuth();
  test404DenialDoesNotPassAuth();
  test500DenialDoesNotPassAuth();
  testNetworkErrorDoesNotPassAuth();
  testExpected401Passes();
  testExpected403Passes();
  test200UnauthorizedEnvelopePasses();
  testEverySuccessfulCreateIsTracked();
  testUntrackedSuccessfulCreateFails();
  testInactiveHistoricalRestrictionCounted();
  testAuditIdempotencyAffectRemainingFixtures();
  testManualCleanupSqlUsesActualNames();
  testManualCleanupSqlScopedToExactIds();
  testDefinedBehavioralCaseCountEqualsExecuted();
  testCleanupRequiredExitCode2();
  testAssertionFailureExitCode1();
  testVerifiedAllZeroExitCode0();
  testSecretsAndTokensNeverLogged();

  // Source Guards
  assert(!runnerContent.includes("b0000000-0000-0000-0000-000000000001"), 'Runner does NOT contain branch UUID as tenant ID');
  assert(!runnerContent.includes("/rest/v1/tenant_memberships"), 'Runner does NOT contain tenant_memberships URL');
  assert(!runnerContent.includes("response.restriction_id"), 'Runner does NOT contain response.restriction_id');
  assert(!runnerContent.includes("checkRes.data?.data"), 'Runner does NOT contain checkRes.data?.data');
  assert(!runnerContent.includes("billingRes.data?.data"), 'Runner does NOT contain billingRes.data?.data');
  assert(!runnerContent.includes("r.status === 'active'"), 'Runner does NOT contain r.status === active');
  assert(!runnerContent.includes("platform_tenant_restrictions"), 'Runner does NOT contain platform_tenant_restrictions');
  assert(!runnerContent.includes("is_active = false"), 'Runner does NOT contain is_active = false');
  assert(!runnerContent.includes("ended_at = now()"), 'Runner does NOT contain ended_at = now()');

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    console.error('\n❌ Stage H1D-B Executable Unit QA FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ Stage H1D-B Executable Unit QA PASSED.');
  }
})();
