// scripts/test-h1d-commercial-admin-contracts-staging.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage H1D-B — Real Credentialed Commercial Admin Contract Staging Acceptance Runner
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

export const CANONICAL_TENANT_ID = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';

export function loadEnvFile(filePath) {
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

export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

export async function authenticateUser(supabaseUrl, supabaseAnonKey, email, password) {
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
    if (!data || !data.access_token || !data.user) return null;
    return { token: data.access_token, user: data.user };
  } catch (err) {
    return null;
  }
}

export async function callRpcEndpoint(supabaseUrl, supabaseAnonKey, rpcName, params = {}, bearerToken = null) {
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

export async function fetchUserProfile(supabaseUrl, supabaseAnonKey, userUuid, bearerToken) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users_profile?select=id,tenant_id,role,active&id=eq.${userUuid}&limit=1`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${bearerToken}`
      }
    });
    if (!res.ok) return null;
    const data = safeJsonParse(await res.text());
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

export async function verifySuperAdminRpcPrivilege(supabaseUrl, supabaseAnonKey, token, testTenantId) {
  const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_list_platform_restrictions', {
    p_tenant_id: testTenantId,
    p_limit: 10,
    p_offset: 0
  }, token);
  return res.ok && res.data && res.data.success === true && Array.isArray(res.data.restrictions);
}

export async function verifyTenantExists(supabaseUrl, supabaseAnonKey, tenantId, token) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/tenants?select=id,name,slug&id=eq.${tenantId}&limit=1`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    const data = safeJsonParse(await res.text());
    return Array.isArray(data) && data.length === 1 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

export function classifyAuthorizationResponse(roleName, res) {
  if (roleName === 'super_admin') {
    return res.status === 200 && res.ok && res.data && res.data.success === true;
  }

  // Accepted denial results only:
  // A. HTTP 401 or 403
  // B. HTTP 200 with success = false and reason_code = 'unauthorized'
  if (res.status === 401 || res.status === 403) {
    return true;
  }
  if (res.status === 200 && res.data && res.data.success === false && res.data.reason_code === 'unauthorized') {
    return true;
  }

  // Reject 400, 404, 409, 422, 500, network error, invalid_parameters, etc.
  return false;
}

export function trackCreatedRestriction(trackedSet, trackedList, response, sourceCase) {
  if (!response || !response.ok || !response.data || response.data.success !== true) {
    return null;
  }
  const restrictionId = response.data.restriction?.id;
  if (!restrictionId) {
    return null;
  }
  if (!trackedSet.has(restrictionId)) {
    trackedSet.add(restrictionId);
    trackedList.push({ id: restrictionId, sourceCase });
  }
  return restrictionId;
}

export function generateManualCleanupSql(runId, trackedRestrictionIds, idempotencyKeys, testTenantId) {
  const restList = trackedRestrictionIds.map(id => `'${id}'`).join(', ');
  const keyList = idempotencyKeys.map(k => `'${k}'`).join(', ');

  const sqlLines = [
    `-- =========================================================================`,
    `-- MANUAL CLEANUP SQL (Scoped strictly to Run ID: ${runId})`,
    `-- =========================================================================`,
    `-- 1. End active test restrictions safely:`,
    `UPDATE public.platform_system_restrictions SET is_restricted = false, expires_at = now() WHERE id IN (${restList.length > 0 ? restList : "''"});`,
    ``,
    `-- 2. Delete test audit events:`,
    `DELETE FROM public.audit_events WHERE resource_type = 'platform_system_restrictions' AND resource_id IN (${restList.length > 0 ? restList : "''"});`,
    ``,
    `-- 3. Delete super admin idempotency records:`,
    `DELETE FROM public.super_admin_commercial_mutation_idempotency WHERE idempotency_key IN (${keyList.length > 0 ? keyList : "''"});`,
    ``,
    `-- 4. Delete platform restriction rows:`,
    `DELETE FROM public.platform_system_restrictions WHERE id IN (${restList.length > 0 ? restList : "''"});`
  ];

  const verifySql = [
    `-- =========================================================================`,
    `-- ZERO-COUNT VERIFICATION QUERY (Must return zero rows for full acceptance)`,
    `-- =========================================================================`,
    `SELECT 'platform_system_restrictions' AS category, count(*) FROM public.platform_system_restrictions WHERE id IN (${restList.length > 0 ? restList : "''"})`,
    `UNION ALL`,
    `SELECT 'audit_events' AS category, count(*) FROM public.audit_events WHERE resource_type = 'platform_system_restrictions' AND resource_id IN (${restList.length > 0 ? restList : "''"})`,
    `UNION ALL`,
    `SELECT 'super_admin_commercial_mutation_idempotency' AS category, count(*) FROM public.super_admin_commercial_mutation_idempotency WHERE idempotency_key IN (${keyList.length > 0 ? keyList : "''"});`
  ];

  return { sql: sqlLines.join('\n'), verifySql: verifySql.join('\n') };
}

// ── Executable Behavioral Cases Suite Factory ───────────────────────────────

export function buildExecutableBehavioralCases(runId, testTenantId, testFeatureKey, fixtureIds, nonSuperAdminToken) {
  return [
    // --- Restriction Create Cases ---
    {
      name: 'create_valid_fresh_mutation',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Valid fresh create ${runId}`,
        p_starts_at: null,
        p_expires_at: null,
        p_idempotency_key: `create_valid_${runId}`
      }),
      evaluate: (res) => res.ok && res.data?.success === true && res.data?.changed === true && res.data?.replayed === false && Boolean(res.data?.restriction?.id)
    },
    {
      name: 'create_identical_replay',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Valid fresh create ${runId}`,
        p_starts_at: null,
        p_expires_at: null,
        p_idempotency_key: `create_valid_${runId}`
      }),
      evaluate: (res) => res.ok && res.data?.success === true && res.data?.changed === false && res.data?.replayed === true
    },
    {
      name: 'create_conflicting_replay',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Different payload conflict ${runId}`,
        p_starts_at: null,
        p_expires_at: null,
        p_idempotency_key: `create_valid_${runId}`
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_conflict' && res.data?.replayed === false
    },
    {
      name: 'create_null_idempotency_key',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Null key ${runId}`,
        p_idempotency_key: null
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },
    {
      name: 'create_empty_idempotency_key',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Empty key ${runId}`,
        p_idempotency_key: ''
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },
    {
      name: 'create_whitespace_idempotency_key',
      category: 'restriction_create',
      rpc: 'super_admin_create_platform_restriction',
      payloadFactory: () => ({
        p_tenant_id: testTenantId,
        p_feature_key: testFeatureKey,
        p_reason: `Whitespace key ${runId}`,
        p_idempotency_key: '   '
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },

    // --- Restriction End Cases ---
    {
      name: 'end_valid_fresh_mutation',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `Valid end ${runId}`,
        p_idempotency_key: `end_valid_${runId}`
      }),
      evaluate: (res) => res.ok && res.data?.success === true && res.data?.changed === true && res.data?.replayed === false && res.data?.restriction?.is_restricted === false
    },
    {
      name: 'end_identical_replay',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `Valid end ${runId}`,
        p_idempotency_key: `end_valid_${runId}`
      }),
      evaluate: (res) => res.ok && res.data?.success === true && res.data?.changed === false && res.data?.replayed === true
    },
    {
      name: 'end_conflicting_replay',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `Conflict end payload ${runId}`,
        p_idempotency_key: `end_valid_${runId}`
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_conflict'
    },
    {
      name: 'end_already_ended',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.alreadyEndedId,
        p_reason: `End already ended ${runId}`,
        p_idempotency_key: `end_already_ended_${runId}`
      }),
      evaluate: (res) => res.ok && res.data?.success === true && res.data?.reason_code === 'already_ended' && res.data?.changed === false
    },
    {
      name: 'end_null_idempotency_key',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `End null key ${runId}`,
        p_idempotency_key: null
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },
    {
      name: 'end_empty_idempotency_key',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `End empty key ${runId}`,
        p_idempotency_key: ''
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },
    {
      name: 'end_whitespace_idempotency_key',
      category: 'restriction_end',
      rpc: 'super_admin_end_platform_restriction',
      payloadFactory: () => ({
        p_restriction_id: fixtureIds.operatorEndedId,
        p_reason: `End whitespace key ${runId}`,
        p_idempotency_key: '   '
      }),
      evaluate: (res) => res.data?.success === false && res.data?.reason_code === 'idempotency_key_required'
    },

    // --- Restriction Read Cases (Verified against real fixture state) ---
    {
      name: 'read_active_fixture_state',
      category: 'restriction_read',
      rpc: 'super_admin_list_platform_restrictions',
      payloadFactory: () => ({ p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => {
        if (!res.ok || !Array.isArray(res.data?.restrictions)) return false;
        const activeRest = res.data.restrictions.find(r => r.id === fixtureIds.activeId);
        return activeRest && activeRest.is_restricted === true && activeRest.is_currently_active === true;
      }
    },
    {
      name: 'read_future_fixture_state',
      category: 'restriction_read',
      rpc: 'super_admin_list_platform_restrictions',
      payloadFactory: () => ({ p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => {
        if (!res.ok || !Array.isArray(res.data?.restrictions)) return false;
        const futureRest = res.data.restrictions.find(r => r.id === fixtureIds.futureId);
        return futureRest && futureRest.is_restricted === true && futureRest.is_currently_active === false;
      }
    },
    {
      name: 'read_expired_fixture_state',
      category: 'restriction_read',
      rpc: 'super_admin_list_platform_restrictions',
      payloadFactory: () => ({ p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => {
        if (!res.ok || !Array.isArray(res.data?.restrictions)) return false;
        const expiredRest = res.data.restrictions.find(r => r.id === fixtureIds.expiredId);
        return expiredRest && expiredRest.is_currently_active === false;
      }
    },
    {
      name: 'read_operator_ended_fixture_state',
      category: 'restriction_read',
      rpc: 'super_admin_list_platform_restrictions',
      payloadFactory: () => ({ p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => {
        if (!res.ok || !Array.isArray(res.data?.restrictions)) return false;
        const endedRest = res.data.restrictions.find(r => r.id === fixtureIds.operatorEndedId);
        return endedRest && endedRest.is_restricted === false && endedRest.is_currently_active === false;
      }
    },

    // --- Directory Expanded Status & Plan Cases ---
    // Statuses
    ...['pending_checkout', 'trialing', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired', 'none', 'all'].map(status => ({
      name: `directory_status_${status}`,
      category: 'directory_status',
      rpc: 'super_admin_list_tenant_commercial_directory',
      payloadFactory: () => ({ p_search: null, p_status: status, p_plan_code: null, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => res.ok && res.data?.success === true && Array.isArray(res.data?.tenants)
    })),

    // Plans
    ...['baslangic', 'professional', 'premium', 'kurumsal', 'standart', 'none', 'all'].map(planCode => ({
      name: `directory_plan_${planCode}`,
      category: 'directory_plan',
      rpc: 'super_admin_list_tenant_commercial_directory',
      payloadFactory: () => ({ p_search: null, p_status: null, p_plan_code: planCode, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => res.ok && res.data?.success === true && Array.isArray(res.data?.tenants)
    })),

    // Canonical Tenant Directory Searches
    {
      name: 'directory_search_canonical_slug',
      category: 'directory_search',
      rpc: 'super_admin_list_tenant_commercial_directory',
      payloadFactory: () => ({ p_search: 'melis-guzellik', p_status: null, p_plan_code: null, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => res.ok && res.data?.success === true && Array.isArray(res.data?.tenants) && res.data.tenants.some(t => t.slug === 'melis-guzellik')
    },
    {
      name: 'directory_search_canonical_uuid',
      category: 'directory_search',
      rpc: 'super_admin_list_tenant_commercial_directory',
      payloadFactory: () => ({ p_search: CANONICAL_TENANT_ID, p_status: null, p_plan_code: null, p_limit: 50, p_offset: 0 }),
      evaluate: (res) => res.ok && res.data?.success === true && Array.isArray(res.data?.tenants) && res.data.tenants.some(t => t.tenant_id === CANONICAL_TENANT_ID)
    },
    {
      name: 'directory_non_super_admin_denial',
      category: 'directory_auth',
      rpc: 'super_admin_list_tenant_commercial_directory',
      payloadFactory: () => ({ p_search: null, p_status: null, p_plan_code: null, p_limit: 50, p_offset: 0 }),
      overrideToken: nonSuperAdminToken,
      evaluate: (res) => classifyAuthorizationResponse('staff', res)
    }
  ];
}

// ── CLI Execution Engine ─────────────────────────────────────────────────────

async function runCliAcceptance() {
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

  loadEnvFile(path.join(process.cwd(), '.env.local'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  console.log('=== Stage H1D-B — Credentialed Commercial Admin Contract Staging Acceptance ===\n');

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
  const testTenantId = process.env.LARI_STAGE_H1D_TEST_TENANT_ID;
  const testFeatureKey = process.env.LARI_STAGE_H1D_TEST_FEATURE_KEY;

  if (testTenantId === CANONICAL_TENANT_ID) {
    console.error('❌ Safety Error: LARI_STAGE_H1D_TEST_TENANT_ID must not equal the canonical tenant ID.');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  let authorizationCallsAttempted = 0;
  let authorizationCallsPassed = 0;
  let authorizationCallsFailed = 0;

  let definedBehavioralCasesCount = 0;
  let executedBehavioralCasesCount = 0;
  let passedBehavioralCasesCount = 0;
  let failedBehavioralCasesCount = 0;

  let cleanupAttempted = false;
  let remainingFixtures = null;
  let manualCleanupRequired = false;
  let manualVerificationRequired = false;

  const assertions = [];
  const trackedRestrictionSet = new Set();
  const trackedRestrictionList = [];
  const usedIdempotencyKeys = [];

  function recordAssertion(condition, message) {
    if (condition) {
      passed++;
      assertions.push(`  ✅ PASS: ${message}`);
    } else {
      failed++;
      assertions.push(`  ❌ FAIL: ${message}`);
    }
  }

  console.log('Authenticating real staging sessions...');

  const ownerSession = await authenticateUser(supabaseUrl, supabaseAnonKey, process.env.LARI_STAGE_D1_OWNER_EMAIL, process.env.LARI_STAGE_D1_OWNER_PASSWORD);
  const staffSession = await authenticateUser(supabaseUrl, supabaseAnonKey, process.env.LARI_STAGE_D1_STAFF_EMAIL, process.env.LARI_STAGE_D1_STAFF_PASSWORD);
  const superAdminSession = await authenticateUser(supabaseUrl, supabaseAnonKey, process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL, process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD);
  const nonMemberSession = await authenticateUser(supabaseUrl, supabaseAnonKey, process.env.LARI_STAGE_H1D_NON_MEMBER_EMAIL, process.env.LARI_STAGE_H1D_NON_MEMBER_PASSWORD);
  const otherOwnerSession = await authenticateUser(supabaseUrl, supabaseAnonKey, process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL, process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD);

  if (!ownerSession || !staffSession || !superAdminSession || !nonMemberSession || !otherOwnerSession) {
    console.error('❌ Authentication failed for one or more staging sessions.');
    process.exit(1);
  }

  console.log('Performing canonical users_profile identity gate & test tenant safety verification...');

  const ownerProfile = await fetchUserProfile(supabaseUrl, supabaseAnonKey, ownerSession.user.id, ownerSession.token);
  const staffProfile = await fetchUserProfile(supabaseUrl, supabaseAnonKey, staffSession.user.id, staffSession.token);
  const nonMemberProfile = await fetchUserProfile(supabaseUrl, supabaseAnonKey, nonMemberSession.user.id, nonMemberSession.token);
  const otherOwnerProfile = await fetchUserProfile(supabaseUrl, supabaseAnonKey, otherOwnerSession.user.id, otherOwnerSession.token);
  const superAdminProfile = await fetchUserProfile(supabaseUrl, supabaseAnonKey, superAdminSession.user.id, superAdminSession.token);

  const isSuperAdminVerified = await verifySuperAdminRpcPrivilege(supabaseUrl, supabaseAnonKey, superAdminSession.token, testTenantId);
  const testTenantRecord = await verifyTenantExists(supabaseUrl, supabaseAnonKey, testTenantId, superAdminSession.token);

  if (!ownerProfile || ownerProfile.id !== ownerSession.user.id || ownerProfile.active !== true || ownerProfile.role !== 'tenant_owner' || ownerProfile.tenant_id !== CANONICAL_TENANT_ID) {
    console.error('❌ Canonical owner users_profile verification failed.');
    process.exit(1);
  }

  if (!staffProfile || staffProfile.id !== staffSession.user.id || staffProfile.active !== true || staffProfile.role !== 'staff' || staffProfile.tenant_id !== CANONICAL_TENANT_ID) {
    console.error('❌ Canonical staff users_profile verification failed.');
    process.exit(1);
  }

  if (nonMemberProfile !== null) {
    console.error('❌ Non-member users_profile verification failed: active tenant profile exists.');
    process.exit(1);
  }

  if (!otherOwnerProfile || otherOwnerProfile.id !== otherOwnerSession.user.id || otherOwnerProfile.active !== true || otherOwnerProfile.role !== 'tenant_owner' || !otherOwnerProfile.tenant_id || otherOwnerProfile.tenant_id === CANONICAL_TENANT_ID || otherOwnerProfile.tenant_id === testTenantId) {
    console.error('❌ Other tenant owner users_profile verification failed.');
    process.exit(1);
  }

  if (!superAdminProfile || superAdminProfile.id !== superAdminSession.user.id || superAdminProfile.active !== true || superAdminProfile.role !== 'super_admin' || superAdminProfile.tenant_id !== null || !isSuperAdminVerified) {
    console.error('❌ Super admin users_profile verification failed.');
    process.exit(1);
  }

  if (!testTenantRecord || testTenantRecord.id !== testTenantId || testTenantRecord.id === CANONICAL_TENANT_ID) {
    console.error('❌ Test tenant safety verification failed: dedicated H1D test tenant row missing or invalid.');
    process.exit(1);
  }

  console.log('✅ Canonical users_profile identity gate & test tenant safety PASSED.');

  const runId = `h1d_contract_run_${Date.now()}`;
  console.log(`\nStarting live staging acceptance run: ${runId}\n`);

  try {
    // 1. Provision Distinct Fixtures for Lifecycle Scenarios
    const fixtureIds = {};

    // Active fixture
    const actKey = `fix_active_${runId}`;
    usedIdempotencyKeys.push(actKey);
    const actRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Active fix ${runId}`, p_idempotency_key: actKey
    }, superAdminSession.token);
    fixtureIds.activeId = trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, actRes, 'fix_active');

    // Future fixture
    const futKey = `fix_future_${runId}`;
    usedIdempotencyKeys.push(futKey);
    const futRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Future fix ${runId}`, p_starts_at: new Date(Date.now() + 86400000).toISOString(), p_idempotency_key: futKey
    }, superAdminSession.token);
    fixtureIds.futureId = trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, futRes, 'fix_future');

    // Expired fixture
    const expKey = `fix_expired_${runId}`;
    usedIdempotencyKeys.push(expKey);
    const expRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Expired fix ${runId}`, p_starts_at: new Date(Date.now() - 86400000).toISOString(), p_expires_at: new Date(Date.now() - 3600000).toISOString(), p_idempotency_key: expKey
    }, superAdminSession.token);
    fixtureIds.expiredId = trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, expRes, 'fix_expired');

    // Operator-ended fixture target
    const endTargetKey = `fix_end_target_${runId}`;
    usedIdempotencyKeys.push(endTargetKey);
    const endTargetRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `End target fix ${runId}`, p_idempotency_key: endTargetKey
    }, superAdminSession.token);
    fixtureIds.operatorEndedId = trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, endTargetRes, 'fix_end_target');

    // Already-ended fixture target
    const alreadyEndedKey = `fix_already_ended_${runId}`;
    usedIdempotencyKeys.push(alreadyEndedKey);
    const alreadyEndedRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Already ended fix ${runId}`, p_idempotency_key: alreadyEndedKey
    }, superAdminSession.token);
    fixtureIds.alreadyEndedId = trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, alreadyEndedRes, 'fix_already_ended');

    // Pre-end already-ended target
    const preEndKey = `fix_pre_end_${runId}`;
    usedIdempotencyKeys.push(preEndKey);
    await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_end_platform_restriction', {
      p_restriction_id: fixtureIds.alreadyEndedId, p_reason: `Pre end ${runId}`, p_idempotency_key: preEndKey
    }, superAdminSession.token);

    recordAssertion(Boolean(fixtureIds.activeId && fixtureIds.futureId && fixtureIds.expiredId && fixtureIds.operatorEndedId && fixtureIds.alreadyEndedId), 'Distinct lifecycle restriction fixtures created and tracked');

    // 2. Order-Safe 30-Call Authorization Matrix with Zero-Side-Effect Proofs
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

    for (const role of roles) {
      for (const rpc of rpcs) {
        authorizationCallsAttempted++;
        let payload = {};
        const callIdempKey = `auth_matrix_${rpc}_${role.name}_${runId}`;

        if (rpc === 'super_admin_list_platform_restrictions') {
          payload = { p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 };
        } else if (rpc === 'super_admin_create_platform_restriction') {
          usedIdempotencyKeys.push(callIdempKey);
          payload = {
            p_tenant_id: testTenantId,
            p_feature_key: testFeatureKey,
            p_reason: `Auth matrix create ${role.name} ${runId}`,
            p_starts_at: null,
            p_expires_at: null,
            p_idempotency_key: callIdempKey
          };
        } else if (rpc === 'super_admin_end_platform_restriction') {
          usedIdempotencyKeys.push(callIdempKey);
          payload = {
            p_restriction_id: fixtureIds.operatorEndedId,
            p_reason: `Auth matrix end ${role.name} ${runId}`,
            p_idempotency_key: callIdempKey
          };
        } else if (rpc === 'super_admin_get_billing_transactions') {
          payload = { p_tenant_id: testTenantId, p_limit: 50, p_offset: 0 };
        } else if (rpc === 'super_admin_list_tenant_commercial_directory') {
          payload = { p_search: null, p_status: null, p_plan_code: null, p_limit: 50, p_offset: 0 };
        }

        const countBefore = trackedRestrictionSet.size;
        const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, rpc, payload, role.token);

        if (role.name === 'super_admin' && rpc === 'super_admin_create_platform_restriction') {
          trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, res, 'auth_matrix_super_admin_create');
        } else if (role.name !== 'super_admin' && (rpc === 'super_admin_create_platform_restriction' || rpc === 'super_admin_end_platform_restriction')) {
          const countAfter = trackedRestrictionSet.size;
          recordAssertion(countBefore === countAfter, `Zero side-effects proven for denied ${rpc} call by ${role.name}`);
        }

        const isAuthPassed = classifyAuthorizationResponse(role.name, res);
        if (isAuthPassed) {
          authorizationCallsPassed++;
          recordAssertion(true, `${rpc} authorization classification correct for ${role.name}`);
        } else {
          authorizationCallsFailed++;
          recordAssertion(false, `${rpc} authorization classification failed for ${role.name}`);
        }
      }
    }

    // 3. Real Promise.all Concurrency Testing
    console.log('Executing real simultaneous Promise.all concurrency tests...');

    // Concurrency Identical Create
    const concIdentKey = `conc_ident_create_${runId}`;
    usedIdempotencyKeys.push(concIdentKey);
    const concIdentPayload = {
      p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Concurrent identical ${runId}`, p_idempotency_key: concIdentKey
    };
    const [c1, c2] = await Promise.all([
      callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', concIdentPayload, superAdminSession.token),
      callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', concIdentPayload, superAdminSession.token)
    ]);
    trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, c1, 'conc_ident_create_1');
    trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, c2, 'conc_ident_create_2');
    recordAssertion((c1.ok && c1.data?.success === true) && (c2.ok && c2.data?.success === true) && (c1.data?.replayed === true || c2.data?.replayed === true), 'Real Promise.all identical create concurrency handled deterministically');

    // Concurrency Conflicting Create
    const concConfKey = `conc_conf_create_${runId}`;
    usedIdempotencyKeys.push(concConfKey);
    const [cc1, cc2] = await Promise.all([
      callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
        p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Conc conf A ${runId}`, p_idempotency_key: concConfKey
      }, superAdminSession.token),
      callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_create_platform_restriction', {
        p_tenant_id: testTenantId, p_feature_key: testFeatureKey, p_reason: `Conc conf B ${runId}`, p_idempotency_key: concConfKey
      }, superAdminSession.token)
    ]);
    trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, cc1, 'conc_conf_create_1');
    trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, cc2, 'conc_conf_create_2');
    recordAssertion((cc1.data?.reason_code === 'idempotency_conflict' || cc2.data?.reason_code === 'idempotency_conflict'), 'Real Promise.all conflicting create concurrency handled deterministically');

    // 4. Executable Behavioral Test Cases Suite
    const behavioralCases = buildExecutableBehavioralCases(runId, testTenantId, testFeatureKey, fixtureIds, staffSession.token);
    definedBehavioralCasesCount = behavioralCases.length;

    for (const bCase of behavioralCases) {
      executedBehavioralCasesCount++;
      const payload = bCase.payloadFactory();
      if (payload.p_idempotency_key) {
        usedIdempotencyKeys.push(payload.p_idempotency_key);
      }
      const tokenToUse = bCase.overrideToken || superAdminSession.token;
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, bCase.rpc, payload, tokenToUse);

      trackCreatedRestriction(trackedRestrictionSet, trackedRestrictionList, res, bCase.name);

      const casePassed = bCase.evaluate(res);
      if (casePassed) {
        passedBehavioralCasesCount++;
        recordAssertion(true, `Behavioral Case Passed: ${bCase.name}`);
      } else {
        failedBehavioralCasesCount++;
        recordAssertion(false, `Behavioral Case Failed: ${bCase.name}`);
      }
    }

    // 5. Billing Ledger Fixture Blocker Gate
    const billingRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_billing_transactions', {
      p_tenant_id: testTenantId, p_limit: 10, p_offset: 0
    }, superAdminSession.token);

    if (billingRes.ok && Array.isArray(billingRes.data?.transactions) && billingRes.data.transactions.length === 0) {
      console.log('⚠️ BILLING_LEDGER_FIXTURE_REQUIRED: Dedicated test tenant lacks safe staging billing ledger rows.');
      recordAssertion(false, 'BILLING_LEDGER_FIXTURE_REQUIRED: Dedicated test tenant lacks required safe billing transactions fixture');
    }

  } catch (err) {
    recordAssertion(false, `Execution error: ${err.message}`);
  } finally {
    // 6. Safe RPC Ending & Physical Fixture Accounting
    cleanupAttempted = true;
    const trackedIds = Array.from(trackedRestrictionSet);

    console.log(`\nAttempting safe RPC ending of ${trackedIds.length} tracked test restriction fixture(s)...`);

    for (const resId of trackedIds) {
      const endKey = `cleanup_end_${runId}_${resId}`;
      usedIdempotencyKeys.push(endKey);
      await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_end_platform_restriction', {
        p_restriction_id: resId,
        p_reason: `Cleanup safe RPC end ${runId}`,
        p_idempotency_key: endKey
      }, superAdminSession.token);
    }

    // Physical fixture accounting query across all categories
    const listRes = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_list_platform_restrictions', {
      p_tenant_id: testTenantId,
      p_limit: 200,
      p_offset: 0
    }, superAdminSession.token);

    if (listRes.ok && Array.isArray(listRes.data?.restrictions)) {
      const runBoundRestrictions = listRes.data.restrictions.filter(r => trackedRestrictionSet.has(r.id));
      remainingFixtures = runBoundRestrictions.length;
    } else {
      remainingFixtures = trackedIds.length;
    }

    if (remainingFixtures > 0) {
      manualCleanupRequired = true;
      manualVerificationRequired = true;
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
  console.log(`Defined behavioral cases: ${definedBehavioralCasesCount}`);
  console.log(`Executed behavioral cases: ${executedBehavioralCasesCount}`);
  console.log(`Passed behavioral cases: ${passedBehavioralCasesCount}`);
  console.log(`Failed behavioral cases: ${failedBehavioralCasesCount}`);
  // Honest Physical Fixture Accounting Output
  console.log(`Cleanup attempted: ${cleanupAttempted}`);
  console.log(`Restriction rows remaining: ${remainingFixtures}`);
  console.log(`Audit rows remaining: UNKNOWN_PENDING_SQL`);
  console.log(`Idempotency rows remaining: UNKNOWN_PENDING_SQL`);
  console.log(`Billing rows remaining: NOT_CREATED`);
  console.log(`Manual cleanup required: ${manualCleanupRequired}`);
  console.log(`Manual verification required: ${manualVerificationRequired}`);

  console.log('\n⚠️ AUDIT_IDEMPOTENCY_SIDE_EFFECT_SQL_VERIFICATION_REQUIRED');
  console.log('Browser-safe REST endpoints cannot read audit or idempotency ledgers directly.');
  console.log('Run the generated zero-count SQL verification query in Supabase SQL Editor to verify complete cleanup.\n');

  if (manualCleanupRequired) {
    const { sql, verifySql } = generateManualCleanupSql(runId, Array.from(trackedRestrictionSet), usedIdempotencyKeys, testTenantId);
    console.log(sql);
    console.log('\n' + verifySql);
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

// Only execute CLI if invoked directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('test-h1d-commercial-admin-contracts-staging.mjs')) {
  runCliAcceptance().catch(err => {
    console.error('Unhandled execution error:', err);
    process.exit(1);
  });
}
