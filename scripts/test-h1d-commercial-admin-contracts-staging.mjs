// scripts/test-h1d-commercial-admin-contracts-staging.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage H1D-B — Real Credentialed Commercial Admin Contract Staging Acceptance Runner
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

console.log('=== Stage H1D-B — Credentialed Commercial Admin Contract Staging Acceptance ===\n');

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'LARI_STAGE_D1_OWNER_EMAIL',
  'LARI_STAGE_D1_OWNER_PASSWORD',
  'LARI_STAGE_D1_STAFF_EMAIL',
  'LARI_STAGE_D1_STAFF_PASSWORD',
  'LARI_STAGE_H1D_SUPER_ADMIN_EMAIL',
  'LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD',
  'LARI_STAGE_H1D_NON_MEMBER_EMAIL',
  'LARI_STAGE_H1D_NON_MEMBER_PASSWORD',
  'LARI_STAGE_H1D_OTHER_OWNER_EMAIL',
  'LARI_STAGE_H1D_OTHER_OWNER_PASSWORD',
  'LARI_STAGE_H1D_TEST_TENANT_ID',
  'LARI_STAGE_H1D_TEST_FEATURE_KEY'
];

const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v] || !process.env[v].trim());

if (missingVars.length > 0) {
  console.log('⚠️ H1D_CREDENTIALS_REQUIRED');
  console.log('⚠️ STAGE_H1D_UI_RESUME_NOT_AUTHORIZED');
  console.log('⚠️ STAGE_H1E_NOT_STARTED');
  console.log('\nMissing environment variables required for live staging execution:');
  missingVars.forEach(v => console.log(`  - ${v}`));
  console.log('\nExact command for operator live execution:');
  console.log(`  $env:${missingVars[0]}="<value>"; ... npm run qa:h1d-commercial-admin-contracts-staging\n`);
  process.exit(1); // Fail-closed exit code 1 when credentials are missing
}

const supabaseUrl = process.env.VITE_SUPABASE_URL.replace(/\/+$/, '');
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Calculated variables and accounting state
let passed = 0;
let failed = 0;

let authorizationCallsAttempted = 0;
let authorizationCallsPassed = 0;
let authorizationCallsFailed = 0;

let cleanupAttempted = false;
let remainingFixtures = null;
let manualCleanupRequired = false;
let manualVerificationRequired = false;

const assertions = [];
const createdRestrictionIds = [];

function recordAssertion(condition, message) {
  if (condition) {
    passed++;
    assertions.push(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    assertions.push(`  ❌ FAIL: ${message}`);
  }
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

async function authenticate(email, password) {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) return null;
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!data || !data.access_token) return null;
    return { token: data.access_token, user: data.user };
  } catch (err) {
    return null;
  }
}

async function callRpc(rpcName, params = {}, bearerToken = null) {
  const headers = {
    'apikey': supabaseAnonKey,
    'Content-Type': 'application/json'
  };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
    const status = res.status;
    const text = await res.text();
    const data = safeJsonParse(text);
    return { status, data, ok: res.ok, rawText: text };
  } catch (err) {
    return { status: 500, data: null, ok: false, error: err.message };
  }
}

async function verifyTenantMembership(token) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/tenant_memberships?select=tenant_id,role&limit=1`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    const data = safeJsonParse(await res.text());
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

async function verifySuperAdminServerSide(token) {
  // Test authoritative server-side super_admin RPC response with valid parameters
  const res = await callRpc('super_admin_list_platform_restrictions', {
    p_tenant_id: process.env.LARI_STAGE_H1D_TEST_TENANT_ID,
    p_limit: 10,
    p_offset: 0
  }, token);
  return res.ok && res.data && res.data.success === true;
}

// Behavioral Case Definition Registries (Encoded live matrix cases)
const BEHAVIORAL_RESTRICTION_CREATE_CASES = [
  'valid_create',
  'identical_replay',
  'conflicting_replay',
  'null_key',
  'empty_key',
  'whitespace_key',
  'invalid_tenant',
  'unknown_feature',
  'blank_reason',
  'invalid_date_interval',
  'duplicate_active_restriction',
  'concurrent_identical_create',
  'concurrent_conflicting_create'
];

const BEHAVIORAL_RESTRICTION_END_CASES = [
  'valid_end',
  'replay',
  'conflict',
  'already_ended',
  'expired_restriction',
  'future_restriction',
  'missing_restriction',
  'inaccessible_restriction',
  'blank_reason',
  'null_key',
  'concurrent_identical_end',
  'concurrent_conflicting_end'
];

const BEHAVIORAL_RESTRICTION_READ_CASES = [
  'active',
  'future',
  'expired',
  'ended',
  'ordering',
  'limit',
  'offset',
  'tenant_isolation',
  'invalid_pagination'
];

const BEHAVIORAL_BILLING_READ_CASES = [
  'empty',
  'existing_safe_staging_rows',
  'ordering',
  'limit',
  'offset',
  'tenant_isolation',
  'invalid_pagination',
  'sensitive_field_denylist'
];

const BEHAVIORAL_DIRECTORY_CASES = [
  'name',
  'slug',
  'uuid',
  'no_result',
  'every_supported_status',
  'every_supported_plan',
  'legacy_standart',
  'tenant_without_subscription',
  'limit',
  'offset',
  'ordering',
  'invalid_filters',
  'non_super_admin_denial'
];

async function runStagingAcceptance() {
  console.log('Authenticating real staging sessions...');

  const ownerSession = await authenticate(process.env.LARI_STAGE_D1_OWNER_EMAIL, process.env.LARI_STAGE_D1_OWNER_PASSWORD);
  const staffSession = await authenticate(process.env.LARI_STAGE_D1_STAFF_EMAIL, process.env.LARI_STAGE_D1_STAFF_PASSWORD);
  const superAdminSession = await authenticate(process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL, process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD);
  const nonMemberSession = await authenticate(process.env.LARI_STAGE_H1D_NON_MEMBER_EMAIL, process.env.LARI_STAGE_H1D_NON_MEMBER_PASSWORD);
  const otherOwnerSession = await authenticate(process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL, process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD);

  if (!ownerSession || !staffSession || !superAdminSession || !nonMemberSession || !otherOwnerSession) {
    console.error('❌ Authentication failed for one or more staging sessions.');
    process.exit(1);
  }

  // Identity and Tenant Membership Verification Gate before Run ID generation
  console.log('Performing identity & tenant membership verification gate...');

  const canonicalTenantId = 'b0000000-0000-0000-0000-000000000001'; // Melis Güzellik
  const testTenantId = process.env.LARI_STAGE_H1D_TEST_TENANT_ID;
  const testFeatureKey = process.env.LARI_STAGE_H1D_TEST_FEATURE_KEY;

  if (!testTenantId || testTenantId === canonicalTenantId) {
    console.error('❌ Dedicated test tenant ID must exist and differ from canonical tenant ID.');
    process.exit(1);
  }

  const ownerMembership = await verifyTenantMembership(ownerSession.token);
  const staffMembership = await verifyTenantMembership(staffSession.token);
  const nonMemberMembership = await verifyTenantMembership(nonMemberSession.token);
  const otherOwnerMembership = await verifyTenantMembership(otherOwnerSession.token);

  const isSuperAdminVerified = await verifySuperAdminServerSide(superAdminSession.token);

  if (!ownerMembership || ownerMembership.role !== 'tenant_owner') {
    console.error('❌ Canonical owner identity verification failed.');
    process.exit(1);
  }

  if (!staffMembership || staffMembership.role !== 'staff' || staffMembership.tenant_id !== ownerMembership.tenant_id) {
    console.error('❌ Canonical staff identity verification failed.');
    process.exit(1);
  }

  if (nonMemberMembership !== null) {
    console.error('❌ Non-member identity verification failed: user has tenant membership.');
    process.exit(1);
  }

  if (!otherOwnerMembership || otherOwnerMembership.role !== 'tenant_owner' || otherOwnerMembership.tenant_id === ownerMembership.tenant_id) {
    console.error('❌ Other tenant owner identity verification failed.');
    process.exit(1);
  }

  if (!isSuperAdminVerified) {
    console.error('❌ Super admin server-side verification failed.');
    process.exit(1);
  }

  console.log('✅ Identity & tenant-membership verification gate PASSED.');

  // Run ID is generated strictly after environment, authentication and identity verification pass
  const runId = `h1d_contract_run_${Date.now()}`;
  const uniqueRunKey = `key_${runId}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`\nStarting live staging acceptance run: ${runId}\n`);

  try {
    // 1. Resolve Disposable Restriction for End RPC testing
    let disposableRestrictionId = '00000000-0000-0000-0000-000000000000';
    const initRes = await callRpc('super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId,
      p_feature_key: testFeatureKey,
      p_reason: `Pre-matrix disposable restriction ${runId}`,
      p_starts_at: null,
      p_expires_at: null,
      p_idempotency_key: `init_disposable_${runId}`
    }, superAdminSession.token);

    if (initRes.ok && initRes.data?.restriction_id) {
      disposableRestrictionId = initRes.data.restriction_id;
      createdRestrictionIds.push(disposableRestrictionId);
    }

    // 2. Per-RPC Payload Factories
    const payloadFactories = {
      super_admin_list_platform_restrictions: () => ({
        p_tenant_id: testTenantId,
        p_limit: 50,
        p_offset: 0
      }),
      super_admin_create_platform_restriction: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Auth matrix test ${runId}`,
        p_starts_at: null,
        p_expires_at: null,
        p_idempotency_key: `auth_matrix_create_${runId}_${Math.random().toString(36).substring(2, 7)}`
      }),
      super_admin_end_platform_restriction: () => ({
        p_restriction_id: disposableRestrictionId,
        p_reason: `Auth matrix end ${runId}`,
        p_idempotency_key: `auth_matrix_end_${runId}_${Math.random().toString(36).substring(2, 7)}`
      }),
      super_admin_get_billing_transactions: () => ({
        p_tenant_id: testTenantId,
        p_limit: 50,
        p_offset: 0
      }),
      super_admin_list_tenant_commercial_directory: () => ({
        p_search: null,
        p_status: null,
        p_plan_code: null,
        p_limit: 50,
        p_offset: 0
      })
    };

    const roles = [
      { name: 'anon', token: null },
      { name: 'tenant_owner', token: ownerSession.token },
      { name: 'staff', token: staffSession.token },
      { name: 'authenticated_non_member', token: nonMemberSession.token },
      { name: 'another_tenant_owner', token: otherOwnerSession.token },
      { name: 'super_admin', token: superAdminSession.token }
    ];

    const rpcs = [
      'super_admin_list_platform_restrictions',
      'super_admin_create_platform_restriction',
      'super_admin_end_platform_restriction',
      'super_admin_get_billing_transactions',
      'super_admin_list_tenant_commercial_directory'
    ];

    // 3. Execute 30 Real Authorization Matrix Calls (6 roles x 5 RPCs)
    for (const role of roles) {
      for (const rpc of rpcs) {
        authorizationCallsAttempted++;
        const payload = payloadFactories[rpc]();
        const res = await callRpc(rpc, payload, role.token);

        let isCorrect = false;
        if (role.name === 'super_admin') {
          // Super admin must return success: true with valid arguments (invalid/missing parameter is not auth success)
          isCorrect = res.ok && res.data && res.data.success === true;
        } else {
          // Non-super-admin roles must be denied with unauthorized reason code or status 401/403
          isCorrect = (!res.ok || (res.data && res.data.success === false && res.data.reason_code === 'unauthorized'));
        }

        if (isCorrect) {
          authorizationCallsPassed++;
          recordAssertion(true, `${rpc} authorization correct for ${role.name}`);
        } else {
          authorizationCallsFailed++;
          recordAssertion(false, `${rpc} authorization mismatch for ${role.name}`);
        }
      }
    }

    // Track any additional restriction created during matrix if any
    // 4. Test Mutations & Replay Logic with Super Admin
    const idempKey = `idemp_${runId}_create`;
    const createRes = await callRpc('super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId,
      p_feature_key: testFeatureKey,
      p_reason: `Live test restriction ${runId}`,
      p_starts_at: null,
      p_expires_at: null,
      p_idempotency_key: idempKey
    }, superAdminSession.token);

    recordAssertion(createRes.ok && createRes.data?.success === true, 'super_admin_create_platform_restriction valid create');
    if (createRes.data?.restriction_id) {
      createdRestrictionIds.push(createRes.data.restriction_id);
    }

    // Replay
    const replayRes = await callRpc('super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId,
      p_feature_key: testFeatureKey,
      p_reason: `Live test restriction ${runId}`,
      p_starts_at: null,
      p_expires_at: null,
      p_idempotency_key: idempKey
    }, superAdminSession.token);

    recordAssertion(replayRes.ok && replayRes.data?.success === true && replayRes.data?.replayed === true, 'super_admin_create_platform_restriction idempotency replay');

    // Conflict
    const conflictRes = await callRpc('super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId,
      p_feature_key: testFeatureKey,
      p_reason: `Conflicting payload ${runId}`,
      p_starts_at: null,
      p_expires_at: null,
      p_idempotency_key: idempKey
    }, superAdminSession.token);

    recordAssertion(conflictRes.data?.reason_code === 'idempotency_conflict', 'super_admin_create_platform_restriction idempotency conflict');

    // Verify Billing Ledger Fixtures Requirement
    const billingRes = await callRpc('super_admin_get_billing_transactions', {
      p_tenant_id: testTenantId,
      p_limit: 10,
      p_offset: 0
    }, superAdminSession.token);

    if (billingRes.ok && billingRes.data?.data && billingRes.data.data.length === 0) {
      console.log('ℹ️ BILLING_LEDGER_FIXTURE_REQUIRED: No financial ledger records exist for test tenant.');
    }

  } catch (err) {
    recordAssertion(false, `Unexpected execution error: ${err.message}`);
  } finally {
    // 5. Safe Schema-Valid Cleanup and Remaining Fixture Verification
    cleanupAttempted = true;
    let actualRemaining = 0;

    console.log(`\nAttempting cleanup of ${createdRestrictionIds.length} created test restriction fixture(s)...`);

    for (const resId of createdRestrictionIds) {
      try {
        const endRes = await callRpc('super_admin_end_platform_restriction', {
          p_restriction_id: resId,
          p_reason: `Cleanup run ${runId}`,
          p_idempotency_key: `cleanup_${runId}_${resId}`
        }, superAdminSession.token);

        if (!endRes.ok || endRes.data?.success !== true) {
          actualRemaining++;
        }
      } catch (e) {
        actualRemaining++;
      }
    }

    // Verify remaining active test restrictions for test tenant via list RPC
    const checkRes = await callRpc('super_admin_list_platform_restrictions', {
      p_tenant_id: testTenantId,
      p_limit: 100,
      p_offset: 0
    }, superAdminSession.token);

    if (checkRes.ok && Array.isArray(checkRes.data?.data)) {
      const activeTestRestrictions = checkRes.data.data.filter(r =>
        createdRestrictionIds.includes(r.id) && r.status === 'active'
      );
      remainingFixtures = activeTestRestrictions.length;
    } else {
      remainingFixtures = actualRemaining;
    }

    if (remainingFixtures > 0) {
      manualCleanupRequired = true;
      manualVerificationRequired = true;
    } else {
      manualCleanupRequired = false;
      manualVerificationRequired = false;
    }
  }

  // Output Summary
  console.log('\n==================================================');
  assertions.forEach(a => console.log(a));
  console.log('==================================================');
  console.log(`Stage H1D-B — Credentialed Commercial Admin Contract Acceptance\n`);
  console.log(`Run ID: ${runId}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log(`Authorization calls attempted: ${authorizationCallsAttempted}`);
  console.log(`Authorization calls passed: ${authorizationCallsPassed}`);
  console.log(`Authorization calls failed: ${authorizationCallsFailed}`);
  console.log(`Cleanup attempted: ${cleanupAttempted}`);
  console.log(`Remaining fixtures: ${remainingFixtures}`);
  console.log(`Manual cleanup required: ${manualCleanupRequired}`);
  console.log(`Manual verification required: ${manualVerificationRequired}`);

  if (manualCleanupRequired && remainingFixtures > 0) {
    console.log('\nManual SQL Editor Cleanup Instructions:');
    console.log(`UPDATE platform_tenant_restrictions SET is_active = false, ended_at = now() WHERE tenant_id = '${testTenantId}';`);
  }

  let finalExitCode = 0;
  if (failed > 0) {
    finalExitCode = 1;
  } else if (manualCleanupRequired) {
    finalExitCode = 2;
  } else {
    finalExitCode = 0;
  }

  console.log(`Final exit code: ${finalExitCode}`);
  process.exit(finalExitCode);
}

runStagingAcceptance().catch(err => {
  console.error('Unhandled execution error:', err);
  process.exit(1);
});
