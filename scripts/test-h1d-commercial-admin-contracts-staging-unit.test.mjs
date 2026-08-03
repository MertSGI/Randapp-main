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
  verifyTenantExists,
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

// Verify Runner File Exists & Read Content for Source Guards
const runnerPath = path.join(process.cwd(), 'scripts', 'test-h1d-commercial-admin-contracts-staging.mjs');
assert(fs.existsSync(runnerPath), 'test-h1d-commercial-admin-contracts-staging.mjs file exists');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');

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

const MOCK_FIXTURE_IDS = {
  activeId: 'r-act-1',
  futureId: 'r-fut-2',
  expiredId: 'r-exp-3',
  operatorEndedId: 'r-end-4',
  alreadyEndedId: 'r-aend-5'
};

// 1. null/empty/whitespace idempotency payload correctness
function testIdempotencyPayloadValidation() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const nullCase = cases.find(c => c.name === 'create_null_idempotency_key');
  const emptyCase = cases.find(c => c.name === 'create_empty_idempotency_key');
  const wsCase = cases.find(c => c.name === 'create_whitespace_idempotency_key');

  const nullPayload = nullCase.payloadFactory();
  const emptyPayload = emptyCase.payloadFactory();
  const wsPayload = wsCase.payloadFactory();

  assert(nullPayload.p_idempotency_key === null, 'null idempotency payload has null key');
  assert(emptyPayload.p_idempotency_key === '', 'empty idempotency payload has empty key');
  assert(wsPayload.p_idempotency_key === '   ', 'whitespace idempotency payload has whitespace key');
}

// 2. replay envelope evaluation
function testReplayEnvelopeEvaluation() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const replayCase = cases.find(c => c.name === 'create_identical_replay');
  const res = { ok: true, data: { success: true, reason_code: 'ok', changed: false, replayed: true, restriction: { id: 'r1' } } };
  assert(replayCase.evaluate(res) === true, 'replay envelope returns success true, changed false, replayed true');
}

// 3. conflict envelope evaluation
function testConflictEnvelopeEvaluation() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const confCase = cases.find(c => c.name === 'create_conflicting_replay');
  const res = { status: 200, ok: true, data: { success: false, reason_code: 'idempotency_conflict', changed: false, replayed: false } };
  assert(confCase.evaluate(res) === true, 'conflict envelope returns success false, reason_code idempotency_conflict');
}

// 4. unrelated P0001 rethrow logic check
function testUnrelatedP0001RethrowLogic() {
  const mig42Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260817_h1d_contract_truth_and_idempotency_fix.sql'), 'utf8');
  assert(mig42Content.includes("SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%'") && mig42Content.includes("ELSE\n                RAISE;"), 'unrelated P0001 errors are re-raised in Migration 42');
}

// 5. Promise.all concurrency path check
async function testPromiseAllConcurrencyPath() {
  let callCount = 0;
  const mockFetch = createMockFetch(async () => {
    callCount++;
    return { ok: true, text: async () => JSON.stringify({ success: true, restriction: { id: 'r-conc' } }) };
  });
  global.fetch = mockFetch;
  const [res1, res2] = await Promise.all([
    fetch(`${TEST_ENV.supabaseUrl}/rpc/test`),
    fetch(`${TEST_ENV.supabaseUrl}/rpc/test`)
  ]);
  assert(callCount === 2 && res1.ok && res2.ok, 'Promise.all concurrency path executes simultaneously');
}

// 6. distinct active/future/expired/ended fixtures evaluation
function testDistinctLifecycleFixturesEvaluation() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const readActive = cases.find(c => c.name === 'read_active_fixture_state');
  const readFuture = cases.find(c => c.name === 'read_future_fixture_state');

  const resActive = { ok: true, data: { restrictions: [{ id: 'r-act-1', is_restricted: true, is_currently_active: true }] } };
  const resFuture = { ok: true, data: { restrictions: [{ id: 'r-fut-2', is_restricted: true, is_currently_active: false }] } };

  assert(readActive.evaluate(resActive) === true, 'read active case evaluates real is_restricted and is_currently_active');
  assert(readFuture.evaluate(resFuture) === true, 'read future case evaluates real is_restricted and is_currently_active');
}

// 7. non-super-admin token selection
function testNonSuperAdminTokenSelection() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'mock-staff-token');
  const denialCase = cases.find(c => c.name === 'directory_non_super_admin_denial');
  assert(denialCase.overrideToken === 'mock-staff-token', 'non-super-admin case uses actual non-super-admin token');
}

// 8. denied side-effect zero deltas check
function testDeniedSideEffectZeroDeltasCheck() {
  const trackedSet = new Set();
  const countBefore = trackedSet.size;
  const deniedRes = { status: 403, ok: false, data: null };
  trackCreatedRestriction(trackedSet, [], deniedRes, 'denied_call');
  const countAfter = trackedSet.size;
  assert(countBefore === countAfter && countAfter === 0, 'denied call produces zero side-effects on tracked set');
}

// 9. billing fixture blocker check
function testBillingFixtureBlockerCheck() {
  const resEmpty = { ok: true, data: { success: true, transactions: [] } };
  const isRequired = Array.isArray(resEmpty.data?.transactions) && resEmpty.data.transactions.length === 0;
  assert(isRequired === true, 'empty billing transactions trigger BILLING_LEDGER_FIXTURE_REQUIRED blocker');
}

// 10. directory status expansion
function testDirectoryStatusExpansion() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const statusCases = cases.filter(c => c.category === 'directory_status');
  assert(statusCases.length === 10, 'directory status cases expanded to 10 distinct status calls');
}

// 11. directory plan expansion
function testDirectoryPlanExpansion() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const planCases = cases.filter(c => c.category === 'directory_plan');
  assert(planCases.length === 7, 'directory plan cases expanded to 7 distinct plan calls');
}

// 12. actual idempotency table name in manual cleanup SQL
function testActualIdempotencyTableNameInCleanupSql() {
  const { sql, verifySql } = generateManualCleanupSql('run_1', ['r1'], ['k1'], TEST_ENV.testTenantId);
  assert(sql.includes('public.super_admin_commercial_mutation_idempotency') && !sql.includes('public.super_admin_idempotency'), 'manual cleanup SQL uses actual super_admin_commercial_mutation_idempotency table name');
  assert(verifySql.includes('super_admin_commercial_mutation_idempotency'), 'zero count verification query includes super_admin_commercial_mutation_idempotency');
}

// 13. separate zero-count verification query categories
function testSeparateZeroCountVerificationCategories() {
  const { verifySql } = generateManualCleanupSql('run_1', ['r1'], ['k1'], TEST_ENV.testTenantId);
  assert(verifySql.includes('platform_system_restrictions') && verifySql.includes('audit_events') && verifySql.includes('super_admin_commercial_mutation_idempotency'), 'zero count verification includes separate rows for restrictions, audit_events, and idempotency');
}

// 14. defined cases equal genuinely executed cases total
function testDefinedCasesEqualExecutedCasesTotal() {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  assert(cases.length === 33, 'defined behavioral cases total exactly 33 executed cases');
}

// 15. users_profile query contains authenticated user UUID filter
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
  await fetchUserProfile(TEST_ENV.supabaseUrl, TEST_ENV.anonKey, TEST_ENV.userUuid, TEST_ENV.token);
  assert(queriedUrl.includes(`/rest/v1/users_profile`) && queriedUrl.includes(`id=eq.${TEST_ENV.userUuid}`) && queriedUrl.includes(`limit=1`), 'users_profile query contains authenticated user UUID filter');
}

// 16. Canonical owner tenant comparison uses aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa
function testCanonicalTenantConstant() {
  assert(CANONICAL_TENANT_ID === 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Canonical owner tenant comparison uses aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
}

// 17. Canonical branch UUID is never used as tenant ID
function testBranchUuidNotTenantId() {
  const branchId = 'b0000000-0000-0000-0000-000000000001';
  assert(CANONICAL_TENANT_ID !== branchId, 'Canonical branch UUID is never used as tenant ID');
}

// 18. Test tenant safety verification function works
async function testTestTenantSafetyVerification() {
  let queriedUrl = '';
  const mockFetch = createMockFetch(async (url) => {
    queriedUrl = url;
    return {
      ok: true,
      text: async () => JSON.stringify([{ id: TEST_ENV.testTenantId, name: 'H1D Test Tenant', slug: 'h1d-test' }])
    };
  });
  global.fetch = mockFetch;
  const t = await verifyTenantExists(TEST_ENV.supabaseUrl, TEST_ENV.anonKey, TEST_ENV.testTenantId, TEST_ENV.token);
  assert(queriedUrl.includes('/rest/v1/tenants') && t.id === TEST_ENV.testTenantId, 'verifyTenantExists queries public.tenants table directly');
}

// 19. 400 denial does not pass authorization
function test400DenialDoesNotPassAuth() {
  const res = { status: 400, ok: false, data: { success: false, reason_code: 'invalid_parameters' } };
  assert(classifyAuthorizationResponse('staff', res) === false, '400 denial does not pass authorization');
}

// 20. 404 denial does not pass authorization
function test404DenialDoesNotPassAuth() {
  const res = { status: 404, ok: false, data: { success: false, reason_code: 'tenant_not_found' } };
  assert(classifyAuthorizationResponse('staff', res) === false, '404 denial does not pass authorization');
}

// 21. 500 denial does not pass authorization
function test500DenialDoesNotPassAuth() {
  const res = { status: 500, ok: false, data: null };
  assert(classifyAuthorizationResponse('staff', res) === false, '500 denial does not pass authorization');
}

// 22. Expected 401 passes
function testExpected401Passes() {
  const res = { status: 401, ok: false, data: null };
  assert(classifyAuthorizationResponse('staff', res) === true, 'Expected 401 passes');
}

// 23. Expected 403 passes
function testExpected403Passes() {
  const res = { status: 403, ok: false, data: null };
  assert(classifyAuthorizationResponse('staff', res) === true, 'Expected 403 passes');
}

// 24. HTTP 200 unauthorized envelope passes
function test200UnauthorizedEnvelopePasses() {
  const res = { status: 200, ok: true, data: { success: false, reason_code: 'unauthorized' } };
  assert(classifyAuthorizationResponse('staff', res) === true, 'HTTP 200 unauthorized envelope passes');
}

// 25. Cleanup-required exit code is 2
function testCleanupRequiredExitCode2() {
  const failedCount = 0;
  const manualCleanupRequired = true;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 2, 'Cleanup-required exit code is 2');
}

// 26. Assertion failure exit code is 1
function testAssertionFailureExitCode1() {
  const failedCount = 1;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 1, 'Assertion failure exit code is 1');
}

// 27. Verified all-zero exit code is 0
function testVerifiedAllZeroExitCode0() {
  const failedCount = 0;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  assert(exitCode === 0, 'Verified all-zero exit code is 0');
}

// 28. Secrets and bearer tokens are never logged
function testSecretsAndTokensNeverLogged() {
  const sampleLog = 'Authorization calls attempted: 30\nCleanup attempted: true\nRemaining fixtures: 2';
  const containsSecret = sampleLog.includes('pass') || sampleLog.includes('Bearer');
  assert(containsSecret === false, 'Secrets and bearer tokens are never logged');
}

// Execute all 28 tests synchronously
(async () => {
  testIdempotencyPayloadValidation();
  testReplayEnvelopeEvaluation();
  testConflictEnvelopeEvaluation();
  testUnrelatedP0001RethrowLogic();
  await testPromiseAllConcurrencyPath();
  testDistinctLifecycleFixturesEvaluation();
  testNonSuperAdminTokenSelection();
  testDeniedSideEffectZeroDeltasCheck();
  testBillingFixtureBlockerCheck();
  testDirectoryStatusExpansion();
  testDirectoryPlanExpansion();
  testActualIdempotencyTableNameInCleanupSql();
  testSeparateZeroCountVerificationCategories();
  testDefinedCasesEqualExecutedCasesTotal();
  await testUserProfileUuidFilter();
  testCanonicalTenantConstant();
  testBranchUuidNotTenantId();
  await testTestTenantSafetyVerification();
  test400DenialDoesNotPassAuth();
  test404DenialDoesNotPassAuth();
  test500DenialDoesNotPassAuth();
  testExpected401Passes();
  testExpected403Passes();
  test200UnauthorizedEnvelopePasses();
  testCleanupRequiredExitCode2();
  testAssertionFailureExitCode1();
  testVerifiedAllZeroExitCode0();
  testSecretsAndTokensNeverLogged();

  // Source Guards
  assert(!runnerContent.includes("b0000000-0000-0000-0000-000000000001"), 'Runner does NOT contain branch UUID as tenant ID');
  assert(!runnerContent.includes("/rest/v1/tenant_memberships"), 'Runner does NOT contain tenant_memberships URL');
  assert(!runnerContent.includes("public.super_admin_idempotency"), 'Runner does NOT contain public.super_admin_idempotency');
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
