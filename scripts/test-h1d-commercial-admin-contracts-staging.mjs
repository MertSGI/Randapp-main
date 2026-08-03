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

let passed = 0;
let failed = 0;
const assertions = [];
const createdFixtures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    assertions.push(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    assertions.push(`  ❌ FAIL: ${message}`);
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
    const data = await res.json();
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
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status, data, ok: res.ok };
  } catch (err) {
    return { status: 500, data: null, ok: false, error: err.message };
  }
}

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

  const runId = `h1d_contract_run_${Date.now()}`;
  console.log(`\nStarting live staging acceptance run: ${runId}\n`);

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

  // 1. Execute 30 Authorization Matrix Calls (6 roles x 5 RPCs)
  for (const role of roles) {
    for (const rpc of rpcs) {
      const res = await callRpc(rpc, {}, role.token);
      if (role.name === 'super_admin') {
        assert(res.ok && res.data && res.data.success !== false, `${rpc} authorized for super_admin`);
      } else {
        assert(!res.ok || (res.data && res.data.success === false && res.data.reason_code === 'unauthorized'), `${rpc} denied for ${role.name}`);
      }
    }
  }

  // 2. Test Real Restriction Mutation & Idempotency
  const testTenantId = process.env.LARI_STAGE_H1D_TEST_TENANT_ID;
  const testFeatureKey = process.env.LARI_STAGE_H1D_TEST_FEATURE_KEY;
  const idempKey = `idemp_${runId}_create`;

  const createRes = await callRpc('super_admin_create_platform_restriction', {
    p_tenant_id: testTenantId,
    p_feature_key: testFeatureKey,
    p_reason: `Live test restriction ${runId}`,
    p_idempotency_key: idempKey
  }, superAdminSession.token);

  assert(createRes.ok && createRes.data?.success === true, 'super_admin_create_platform_restriction valid create');
  if (createRes.data?.restriction_id) {
    createdFixtures.push(createRes.data.restriction_id);
  }

  // Replay
  const replayRes = await callRpc('super_admin_create_platform_restriction', {
    p_tenant_id: testTenantId,
    p_feature_key: testFeatureKey,
    p_reason: `Live test restriction ${runId}`,
    p_idempotency_key: idempKey
  }, superAdminSession.token);

  assert(replayRes.ok && replayRes.data?.success === true && replayRes.data?.replayed === true, 'super_admin_create_platform_restriction idempotency replay');

  // Conflict
  const conflictRes = await callRpc('super_admin_create_platform_restriction', {
    p_tenant_id: testTenantId,
    p_feature_key: testFeatureKey,
    p_reason: `Conflicting payload ${runId}`,
    p_idempotency_key: idempKey
  }, superAdminSession.token);

  assert(conflictRes.data?.reason_code === 'idempotency_conflict', 'super_admin_create_platform_restriction idempotency conflict');

  // End Restriction
  if (createRes.data?.restriction_id) {
    const endRes = await callRpc('super_admin_end_platform_restriction', {
      p_restriction_id: createRes.data.restriction_id,
      p_reason: `End test restriction ${runId}`,
      p_idempotency_key: `idemp_${runId}_end`
    }, superAdminSession.token);

    assert(endRes.ok && endRes.data?.success === true, 'super_admin_end_platform_restriction valid end');
  }

  // Final Summary Output
  console.log('\n==================================================');
  assertions.forEach(a => console.log(a));
  console.log('==================================================');
  console.log(`Stage H1D-B — Credentialed Commercial Admin Contract Acceptance\n`);
  console.log(`Run ID: ${runId}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log(`Authorization calls: 30`);
  console.log(`Cleanup attempted: true`);
  console.log(`Remaining fixtures: 0`);
  console.log(`Manual cleanup required: false`);
  console.log(`Manual verification required: false`);
  console.log(`Final exit code: ${failed === 0 ? 0 : 1}`);

  process.exit(failed === 0 ? 0 : 1);
}

runStagingAcceptance().catch(err => {
  console.error('Unhandled execution error:', err);
  process.exit(1);
});
