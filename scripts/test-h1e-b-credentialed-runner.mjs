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
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized,
  assertSuperAdminEligibilityEnvelope
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
  console.log('=== STAGE H1E-B REAL READ-ONLY CREDENTIALED ACCEPTANCE RUNNER ===\n');
  console.log('⚠️ H1E_B_CREDENTIALS_REQUIRED');
  console.log('⚠️ STAGE_H1E_B_NOT_YET_GO');
  console.log('⚠️ PRODUCTION_NO_GO\n');
  console.log('Missing environment variables required for H1E-B credentialed acceptance:');
  missingVars.forEach(v => console.log('  - ' + v));
  console.log('\nNo login attempt, network mutation or database write executed.');
  console.log('Final exit code: 1');
  process.exit(1);
}

export async function runCredentialedAcceptanceH1EB() {
  const runId = 'h1e_b_credentialed_run_' + Date.now();
  console.log('=== STAGE H1E-B REAL READ-ONLY CREDENTIALED ACCEPTANCE RUNNER ===');
  console.log('Run ID: ' + runId);
  console.log('Targeting: ' + supabaseUrl);
  console.log('Dedicated Staging Test Tenant: ' + DEDICATED_H1D_TENANT_ID);

  const observer = new NetworkObserver(supabaseUrl);
  const monitoredFetch = createMonitoredFetch(observer);

  let defined = 0;
  let executed = 0;
  let passed = 0;
  let failed = 0;
  let topLevelFailed = false;
  let setupFailed = false;
  let firstError = null;

  async function test(name, category, fn) {
    defined++;
    executed++;
    try {
      await fn();
      passed++;
      console.log('  ✅ PASS: ' + name);
    } catch (err) {
      failed++;
      const msg = redactSecrets(err.message || String(err));
      if (!firstError) firstError = { name, error: msg };
      console.error('  ❌ FAIL: ' + name + ' — ' + msg);
    }
  }

  try {
    const superAdminAuth = await authenticateUser(supabaseUrl, supabaseAnonKey, credentials.superAdmin.email, credentials.superAdmin.password, 'superAdmin', monitoredFetch);

    if (!superAdminAuth.ok || !superAdminAuth.token) {
      setupFailed = true;
      console.error('  ❌ SETUP FAIL: Super Admin auth failed');
    } else {
      await test('1. Super Admin get tenant pilot authorization RPC returns structure', 'read', async () => {
        const res = await callRpcEndpoint(supabaseUrl, supabaseAnonKey, 'super_admin_get_tenant_pilot_authorization', { p_tenant_id: DEDICATED_H1D_TENANT_ID }, superAdminAuth.token, monitoredFetch);
        if (!res.ok) throw new Error('RPC failed with status ' + res.status);
        if (res.data.success !== true) throw new Error('Expected success=true');
      });
    }
  } catch (topErr) {
    topLevelFailed = true;
    const msg = redactSecrets(topErr.message || String(topErr));
    if (!firstError) firstError = { name: 'Top-Level Execution', error: msg };
  }

  const isSuccess = (!setupFailed && !topLevelFailed && !firstError && defined > 0 && executed === defined && passed === defined && failed === 0);
  const finalExitCode = isSuccess ? 0 : 1;
  console.log('Final exit code: ' + finalExitCode);
  process.exit(finalExitCode);
}

runCredentialedAcceptanceH1EB();
