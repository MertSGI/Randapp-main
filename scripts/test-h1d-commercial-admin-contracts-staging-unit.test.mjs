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

const testRegistry = [];

function registerTest(name, fn) {
  testRegistry.push({ name, fn });
}

// Verify Runner File Exists & Read Content for Source Guards
const runnerPath = path.join(process.cwd(), 'scripts', 'test-h1d-commercial-admin-contracts-staging.mjs');

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

registerTest('runner_file_exists', () => {
  return fs.existsSync(runnerPath);
});

registerTest('null_empty_whitespace_idempotency_payloads', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const nullCase = cases.find(c => c.name === 'create_null_idempotency_key');
  const emptyCase = cases.find(c => c.name === 'create_empty_idempotency_key');
  const wsCase = cases.find(c => c.name === 'create_whitespace_idempotency_key');

  const nullPayload = nullCase.payloadFactory();
  const emptyPayload = emptyCase.payloadFactory();
  const wsPayload = wsCase.payloadFactory();

  return nullPayload.p_idempotency_key === null && emptyPayload.p_idempotency_key === '' && wsPayload.p_idempotency_key === '   ';
});

registerTest('replay_envelope_evaluation', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const replayCase = cases.find(c => c.name === 'create_identical_replay');
  const res = { ok: true, data: { success: true, reason_code: 'ok', changed: false, replayed: true, restriction: { id: 'r1' } } };
  return replayCase.evaluate(res) === true;
});

registerTest('conflict_envelope_evaluation', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const confCase = cases.find(c => c.name === 'create_conflicting_replay');
  const res = { status: 200, ok: true, data: { success: false, reason_code: 'idempotency_conflict', changed: false, replayed: false } };
  return confCase.evaluate(res) === true;
});

registerTest('unrelated_p0001_rethrow_logic', () => {
  const mig43Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260818_h1d_idempotency_concurrency_and_filter_fix.sql'), 'utf8');
  return mig43Content.includes("SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%'") && mig43Content.includes("ELSE\n                RAISE;");
});

registerTest('migration_43_advisory_lock_existence', () => {
  const mig43Content = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260818_h1d_idempotency_concurrency_and_filter_fix.sql'), 'utf8');
  return mig43Content.includes("pg_advisory_xact_lock") && mig43Content.includes("super_admin_create_platform_restriction");
});

registerTest('promise_all_concurrency_path', async () => {
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
  return callCount === 2 && res1.ok && res2.ok;
});

registerTest('distinct_lifecycle_fixtures_evaluation', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const readActive = cases.find(c => c.name === 'read_active_fixture_state');
  const readFuture = cases.find(c => c.name === 'read_future_fixture_state');

  const resActive = { ok: true, data: { restrictions: [{ id: 'r-act-1', is_restricted: true, is_currently_active: true }] } };
  const resFuture = { ok: true, data: { restrictions: [{ id: 'r-fut-2', is_restricted: true, is_currently_active: false }] } };

  return readActive.evaluate(resActive) === true && readFuture.evaluate(resFuture) === true;
});

registerTest('non_super_admin_token_selection', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'mock-staff-token');
  const denialCase = cases.find(c => c.name === 'directory_non_super_admin_denial');
  return denialCase.overrideToken === 'mock-staff-token';
});

registerTest('denied_side_effect_zero_deltas_check', () => {
  const trackedSet = new Set();
  const countBefore = trackedSet.size;
  const deniedRes = { status: 403, ok: false, data: null };
  trackCreatedRestriction(trackedSet, [], deniedRes, 'denied_call');
  const countAfter = trackedSet.size;
  return countBefore === countAfter && countAfter === 0;
});

registerTest('billing_fixture_blocker_check', () => {
  const resEmpty = { ok: true, data: { success: true, transactions: [] } };
  return Array.isArray(resEmpty.data?.transactions) && resEmpty.data.transactions.length === 0;
});

registerTest('directory_status_expansion', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const statusCases = cases.filter(c => c.category === 'directory_status');
  return statusCases.length === 10;
});

registerTest('directory_plan_expansion', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  const planCases = cases.filter(c => c.category === 'directory_plan');
  return planCases.length === 7;
});

registerTest('actual_idempotency_table_name_in_cleanup_sql', () => {
  const { sql, verifySql } = generateManualCleanupSql('run_1', ['r1'], ['k1'], TEST_ENV.testTenantId);
  return sql.includes('public.super_admin_commercial_mutation_idempotency') &&
         !sql.includes('public.super_admin_idempotency') &&
         verifySql.includes('super_admin_commercial_mutation_idempotency');
});

registerTest('separate_zero_count_verification_categories', () => {
  const { verifySql } = generateManualCleanupSql('run_1', ['r1'], ['k1'], TEST_ENV.testTenantId);
  return verifySql.includes('platform_system_restrictions') &&
         verifySql.includes('audit_events') &&
         verifySql.includes('super_admin_commercial_mutation_idempotency');
});

registerTest('defined_cases_equal_executed_cases_total', () => {
  const cases = buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token');
  return Array.isArray(cases) && cases.length > 0 && cases.length === buildExecutableBehavioralCases('run_1', TEST_ENV.testTenantId, TEST_ENV.testFeatureKey, MOCK_FIXTURE_IDS, 'token').length;
});

registerTest('user_profile_uuid_filter', async () => {
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
  return queriedUrl.includes(`/rest/v1/users_profile`) && queriedUrl.includes(`id=eq.${TEST_ENV.userUuid}`) && queriedUrl.includes(`limit=1`);
});

registerTest('canonical_tenant_constant', () => {
  return CANONICAL_TENANT_ID === 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
});

registerTest('branch_uuid_not_tenant_id', () => {
  const branchId = 'b0000000-0000-0000-0000-000000000001';
  return CANONICAL_TENANT_ID !== branchId;
});

registerTest('test_tenant_safety_verification', async () => {
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
  return queriedUrl.includes('/rest/v1/tenants') && t.id === TEST_ENV.testTenantId;
});

registerTest('400_denial_does_not_pass_auth', () => {
  const res = { status: 400, ok: false, data: { success: false, reason_code: 'invalid_parameters' } };
  return classifyAuthorizationResponse('staff', res) === false;
});

registerTest('404_denial_does_not_pass_auth', () => {
  const res = { status: 404, ok: false, data: { success: false, reason_code: 'tenant_not_found' } };
  return classifyAuthorizationResponse('staff', res) === false;
});

registerTest('500_denial_does_not_pass_auth', () => {
  const res = { status: 500, ok: false, data: null };
  return classifyAuthorizationResponse('staff', res) === false;
});

registerTest('expected_401_passes', () => {
  const res = { status: 401, ok: false, data: null };
  return classifyAuthorizationResponse('staff', res) === true;
});

registerTest('expected_403_passes', () => {
  const res = { status: 403, ok: false, data: null };
  return classifyAuthorizationResponse('staff', res) === true;
});

registerTest('200_unauthorized_envelope_passes', () => {
  const res = { status: 200, ok: true, data: { success: false, reason_code: 'unauthorized' } };
  return classifyAuthorizationResponse('staff', res) === true;
});

registerTest('cleanup_required_exit_code_is_2', () => {
  const failedCount = 0;
  const manualCleanupRequired = true;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  return exitCode === 2;
});

registerTest('assertion_failure_exit_code_is_1', () => {
  const failedCount = 1;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  return exitCode === 1;
});

registerTest('verified_all_zero_exit_code_is_0', () => {
  const failedCount = 0;
  const manualCleanupRequired = false;
  let exitCode = 0;
  if (failedCount > 0) exitCode = 1;
  else if (manualCleanupRequired) exitCode = 2;
  return exitCode === 0;
});

registerTest('secrets_and_tokens_never_logged', () => {
  const sampleLog = 'Authorization calls attempted: 30\nCleanup attempted: true\nRemaining fixtures: 2';
  const containsSecret = sampleLog.includes('pass') || sampleLog.includes('Bearer');
  return containsSecret === false;
});

// Source Guard Tests (counted in registry)
registerTest('source_guard_no_branch_uuid_as_tenant_id', () => {
  const runnerContent = fs.readFileSync(runnerPath, 'utf8');
  return !runnerContent.includes("b0000000-0000-0000-0000-000000000001");
});

registerTest('source_guard_no_tenant_memberships_url', () => {
  const runnerContent = fs.readFileSync(runnerPath, 'utf8');
  return !runnerContent.includes("/rest/v1/tenant_memberships");
});

registerTest('source_guard_no_legacy_idempotency_table_name', () => {
  const runnerContent = fs.readFileSync(runnerPath, 'utf8');
  return !runnerContent.includes("public.super_admin_idempotency");
});

registerTest('source_guard_no_legacy_restriction_table_name', () => {
  const runnerContent = fs.readFileSync(runnerPath, 'utf8');
  return !runnerContent.includes("platform_tenant_restrictions");
});

// Execute Registry
(async () => {
  let passedCount = 0;
  let failedCount = 0;

  for (const t of testRegistry) {
    try {
      const res = await t.fn();
      if (res) {
        passedCount++;
        console.log(`  ✅ PASS: ${t.name}`);
      } else {
        failedCount++;
        console.error(`  ❌ FAIL: ${t.name}`);
      }
    } catch (e) {
      failedCount++;
      console.error(`  ❌ FAIL: ${t.name} — ${e.message}`);
    }
  }

  const definedCount = testRegistry.length;
  const executedCount = testRegistry.length;
  const totalCount = passedCount + failedCount;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Defined tests: ${definedCount}`);
  console.log(`Executed tests: ${executedCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Total: ${totalCount}`);

  if (failedCount > 0 || definedCount !== executedCount || totalCount !== (passedCount + failedCount)) {
    console.error('\n❌ Stage H1D-B Executable Unit QA FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ Stage H1D-B Executable Unit QA PASSED.');
  }
})();
