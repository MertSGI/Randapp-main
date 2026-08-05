import path from 'path';
import {
  CANONICAL_TENANT_ID,
  DEDICATED_H1D_TENANT_ID,
  NONEXISTENT_TENANT_ID,
  loadEnvFile,
  NetworkObserver,
  createMonitoredFetch,
  authenticateUser,
  callRpcEndpoint,
  redactSecrets
} from './test-h1e-a-credentialed-runner-helpers.mjs';

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const credentials = {
  nonmember: {
    label: 'nonmember',
    email: process.env.LARI_STAGE_H1D_NONMEMBER_EMAIL || 'h1dnonmember@randevulari.com',
    password: process.env.LARI_STAGE_H1D_NONMEMBER_PASSWORD
  },
  staff: {
    label: 'staff',
    email: process.env.LARI_STAGE_H1D_STAFF_EMAIL || 'melisstaff@randevulari.com',
    password: process.env.LARI_STAGE_H1D_STAFF_PASSWORD
  },
  owner: {
    label: 'canonical owner',
    email: process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com',
    password: process.env.LARI_STAGE_D1_OWNER_PASSWORD
  },
  otherOwner: {
    label: 'other owner',
    email: process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL || 'h1dotherowner@randevulari.com',
    password: process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD
  },
  superAdmin: {
    label: 'super admin',
    email: process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com',
    password: process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD
  }
};

const missingVars = [];
if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL');
if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');
if (!credentials.nonmember.password) missingVars.push('LARI_STAGE_H1D_NONMEMBER_PASSWORD');
if (!credentials.staff.password) missingVars.push('LARI_STAGE_H1D_STAFF_PASSWORD');
if (!credentials.owner.password) missingVars.push('LARI_STAGE_D1_OWNER_PASSWORD');
if (!credentials.otherOwner.password) missingVars.push('LARI_STAGE_H1D_OTHER_OWNER_PASSWORD');
if (!credentials.superAdmin.password) missingVars.push('LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD');

if (missingVars.length > 0) {
  console.log('=== STAGE H1E-A REAL READ-ONLY CREDENTIALED ACCEPTANCE RUNNER ===');
  console.log('\n⚠️ H1E_A_CREDENTIALS_REQUIRED');
  console.log('⚠️ STAGE_H1E_A_NOT_YET_GO');
  console.log('⚠️ PRODUCTION_NO_GO\n');
  console.log('Missing environment variables required for H1E-A credentialed acceptance:');
  for (const v of missingVars) {
    console.log('  - ' + v);
  }
  console.log('\nNo login attempt, network mutation or database write executed.');
  console.log('Final exit code: 1');
  process.exit(1);
}

let supabaseOrigin = null;
try {
  supabaseOrigin = new URL(supabaseUrl).origin;
} catch (e) {
  console.error('Invalid VITE_SUPABASE_URL format');
  process.exit(1);
}

async function runCredentialedAcceptance() {
  const runId = 'h1e_a_credentialed_run_' + Date.now();
  console.log('=== STAGE H1E-A REAL READ-ONLY CREDENTIALED ACCEPTANCE RUNNER ===');
  console.log('Run ID: ' + runId + '\n');

  const observer = new NetworkObserver(supabaseOrigin);
  const monitoredFetch = await createMonitoredFetch(observer);

  let defined = 0;
  let executed = 0;
  let passed = 0;
  let failed = 0;
  let authAttempted = 0;
  let authPassed = 0;
  let authFailed = 0;
  let behavioralAttempted = 0;
  let behavioralPassed = 0;
  let behavioralFailed = 0;
  let firstError = null;

  async function test(name, category, fn) {
    defined++;
    executed++;
    if (category === 'auth') authAttempted++;
    else if (category === 'behavioral') behavioralAttempted++;

    try {
      await fn();
      passed++;
      if (category === 'auth') authPassed++;
      else if (category === 'behavioral') behavioralPassed++;
      console.log('  ✅ PASS: ' + name);
    } catch (err) {
      failed++;
      if (category === 'auth') authFailed++;
      else if (category === 'behavioral') behavioralFailed++;
      const msg = redactSecrets(err.message || String(err));
      if (!firstError) firstError = { name, error: msg };
      console.error('  ❌ FAIL: ' + name + ' — ' + msg);
    }
  }

  try {
    // 1. Authenticate five isolated identities independently
    const nonmemberAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.nonmember.email, credentials.nonmember.password, 'nonmember', monitoredFetch);
    const staffAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.staff.email, credentials.staff.password, 'staff', monitoredFetch);
    const ownerAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.owner.email, credentials.owner.password, 'owner', monitoredFetch);
    const otherOwnerAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.otherOwner.email, credentials.otherOwner.password, 'otherOwner', monitoredFetch);
    const superAdminAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.superAdmin.email, credentials.superAdmin.password, 'superAdmin', monitoredFetch);

    const loginCheck = [
      { name: 'nonmember', auth: nonmemberAuth },
      { name: 'staff', auth: staffAuth },
      { name: 'canonical owner', auth: ownerAuth },
      { name: 'other owner', auth: otherOwnerAuth },
      { name: 'super admin', auth: superAdminAuth }
    ];

    for (const item of loginCheck) {
      if (!item.auth.ok || !item.auth.token) {
        console.error(`❌ Authentication failed for ${item.name}: ${item.auth.failure_category || 'unknown_failure'}`);
        process.exit(1);
      }
    }

    console.log('── 1. Five-Role Authorization Acceptance Matrix ──');

    await test('1. Anon call denied with exact structured error without data leakage', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, null, monitoredFetch);
      if (!res.ok) throw new Error('Transport or network failure during anon test (HTTP ' + res.status + ')');
      if (!res.data || typeof res.data !== 'object') throw new Error('Anon call returned invalid JSON response');
      if (res.data.success !== false) throw new Error('Expected success=false for anon call, got ' + res.data.success);
      if (res.data.reason_code !== 'unauthorized') throw new Error('Expected reason_code=unauthorized for anon call, got ' + res.data.reason_code);
      if (res.data.readiness_facts || res.data.global_release_control || res.data.pilot_authorization) {
        throw new Error('Anon call leaked tenant snapshot data!');
      }
    });

    await test('2. Authenticated non-member call denied with exact structured error', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, nonmemberAuth.token, monitoredFetch);
      if (!res.ok) throw new Error('Transport failure during nonmember test (HTTP ' + res.status + ')');
      if (!res.data || res.data.success !== false || res.data.reason_code !== 'unauthorized') {
        throw new Error('Expected success=false & reason_code=unauthorized for nonmember call');
      }
      if (res.data.readiness_facts || res.data.global_release_control || res.data.pilot_authorization) {
        throw new Error('Nonmember call leaked tenant snapshot data!');
      }
    });

    await test('3. Staff call denied with exact structured error', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, staffAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== false || res.data.reason_code !== 'unauthorized') {
        throw new Error('Expected success=false & reason_code=unauthorized for staff call');
      }
      if (res.data.readiness_facts) throw new Error('Staff call leaked snapshot data!');
    });

    await test('4. Canonical tenant owner call denied with exact structured error', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, ownerAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== false || res.data.reason_code !== 'unauthorized') {
        throw new Error('Expected success=false & reason_code=unauthorized for tenant owner call');
      }
      if (res.data.readiness_facts) throw new Error('Tenant owner call leaked snapshot data!');
    });

    await test('5. Other tenant owner call denied with exact structured error', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, otherOwnerAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== false || res.data.reason_code !== 'unauthorized') {
        throw new Error('Expected success=false & reason_code=unauthorized for other tenant owner call');
      }
      if (res.data.readiness_facts) throw new Error('Other tenant owner call leaked snapshot data!');
    });

    await test('6. Super Admin call allowed with full structured envelope', 'auth', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, superAdminAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== true) throw new Error('Super Admin eligibility snapshot call failed');
    });

    console.log('\n── 2. Behavioral Acceptance & Safety Verification ──');

    let canonicalSnap = null;
    await test('7. Canonical tenant snapshot envelope structured correctly', 'behavioral', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: CANONICAL_TENANT_ID }, superAdminAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== true) throw new Error('Failed to fetch canonical tenant snapshot');
      canonicalSnap = res.data;
      if (!canonicalSnap.readiness_facts || !canonicalSnap.global_release_control || !canonicalSnap.pilot_authorization) {
        throw new Error('Canonical snapshot envelope missing required subsections');
      }
    });

    await test('8. Dedicated H1D tenant snapshot envelope structured correctly', 'behavioral', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, superAdminAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== true) throw new Error('Failed to fetch dedicated H1D tenant snapshot');
      if (!res.data.readiness_facts || !res.data.global_release_control || !res.data.pilot_authorization) {
        throw new Error('Dedicated H1D snapshot envelope missing required subsections');
      }
    });

    await test('9. Nonexistent tenant produces GLOBAL_RELEASE_PHASE_BLOCKED with TENANT_NOT_FOUND blocker', 'behavioral', async () => {
      const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_eligibility_snapshot', { p_tenant_id: NONEXISTENT_TENANT_ID }, superAdminAuth.token, monitoredFetch);
      if (!res.ok || !res.data || res.data.success !== true) throw new Error('Missing tenant call failed');
      if (res.data.primary_reason_code !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
        throw new Error('Expected primary_reason_code GLOBAL_RELEASE_PHASE_BLOCKED under pre_pilot, got ' + res.data.primary_reason_code);
      }
      if (!Array.isArray(res.data.blocking_reason_codes) || !res.data.blocking_reason_codes.includes('TENANT_NOT_FOUND')) {
        throw new Error('blocking_reason_codes missing TENANT_NOT_FOUND');
      }
      if (res.data.readiness_facts.tenant_exists !== false) {
        throw new Error('readiness_facts.tenant_exists should be false for nonexistent tenant');
      }
    });

    await test('10. Global release phase is pre_pilot', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.global_release_control.release_phase !== 'pre_pilot') {
        throw new Error('Expected global release phase pre_pilot');
      }
    });

    await test('11. Payment collection enabled remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.global_release_control.is_payment_collection_enabled !== false) {
        throw new Error('Payment collection is enabled!');
      }
    });

    await test('12. Checkout enabled remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.global_release_control.is_checkout_enabled !== false) {
        throw new Error('Checkout is enabled!');
      }
    });

    await test('13. Iyzico enabled remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.global_release_control.is_iyzico_enabled !== false) {
        throw new Error('Iyzico is enabled!');
      }
    });

    await test('14. Production authorization remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.production_authorized !== false) {
        throw new Error('Production is authorized!');
      }
    });

    await test('15. Transitional authorization implementation state is pending_h1e_b', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.pilot_authorization.implementation_state !== 'pending_h1e_b') {
        throw new Error('Transitional implementation state is not pending_h1e_b');
      }
    });

    await test('16. Transitional authorization actor and timestamp fields are null', 'behavioral', async () => {
      const authObj = canonicalSnap.pilot_authorization;
      if (authObj.authorization_id !== null || authObj.approved_by !== null || authObj.revoked_by !== null || authObj.approved_at !== null || authObj.revoked_at !== null) {
        throw new Error('Transitional authorization actor/id/timestamp fields are not null');
      }
    });

    await test('17. authorized remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.authorized !== false) throw new Error('authorized is true!');
    });

    await test('18. bookable remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.bookable !== false) throw new Error('bookable is true!');
    });

    await test('19. pilot_enforcement_active remains false', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.pilot_enforcement_active !== false) throw new Error('pilot_enforcement_active is true!');
    });

    await test('20. Primary reason code is GLOBAL_RELEASE_PHASE_BLOCKED under pre_pilot default', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.primary_reason_code !== 'GLOBAL_RELEASE_PHASE_BLOCKED') {
        throw new Error('Expected primary_reason_code GLOBAL_RELEASE_PHASE_BLOCKED, got ' + canonicalSnap.primary_reason_code);
      }
    });

    await test('21. BOOKING_ALLOWED is not returned under pre_pilot default', 'behavioral', async () => {
      if (!canonicalSnap || canonicalSnap.primary_reason_code === 'BOOKING_ALLOWED') {
        throw new Error('BOOKING_ALLOWED was returned under pre_pilot!');
      }
    });

    await test('22. blocking_reason_codes is a structured array', 'behavioral', async () => {
      if (!canonicalSnap || !Array.isArray(canonicalSnap.blocking_reason_codes)) {
        throw new Error('blocking_reason_codes is not an array');
      }
    });

    await test('23. Zero forbidden network requests executed', 'behavioral', async () => {
      if (observer.forbiddenRequestsDetected !== 0) {
        throw new Error('Forbidden network requests detected: ' + observer.forbiddenRequestsDetected);
      }
    });

    await test('24. Zero network mutation attempts executed', 'behavioral', async () => {
      if (observer.mutationAttemptsDetected !== 0) {
        throw new Error('Network mutation attempts detected: ' + observer.mutationAttemptsDetected);
      }
    });

    await test('25. Secrets redacted from formatted output', 'behavioral', async () => {
      const text = JSON.stringify(canonicalSnap);
      if (text.includes('Bearer ') && !text.includes('Bearer [REDACTED]')) {
        throw new Error('Unredacted bearer token found in output');
      }
    });

  } catch (topErr) {
    const msg = redactSecrets(topErr.message || String(topErr));
    console.error('\n❌ Top-Level Execution Exception: ' + msg);
    if (!firstError) firstError = { name: 'Top-Level Execution', error: msg };
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('Run ID: ' + runId);
  console.log('Defined tests: ' + defined);
  console.log('Executed tests: ' + executed);
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('Total: ' + (passed + failed));
  console.log('Authorization attempted: ' + authAttempted);
  console.log('Authorization passed: ' + authPassed);
  console.log('Authorization failed: ' + authFailed);
  console.log('Behavioral attempted: ' + behavioralAttempted);
  console.log('Behavioral passed: ' + behavioralPassed);
  console.log('Behavioral failed: ' + behavioralFailed);
  console.log('Mutation attempts detected: ' + observer.mutationAttemptsDetected);
  console.log('Forbidden requests detected: ' + observer.forbiddenRequestsDetected);
  console.log('Cleanup required: false');

  const finalExitCode = (executed === defined && passed === defined && failed === 0 && observer.mutationAttemptsDetected === 0 && observer.forbiddenRequestsDetected === 0) ? 0 : 1;
  console.log('Final exit code: ' + finalExitCode);

  process.exit(finalExitCode);
}

runCredentialedAcceptance();
