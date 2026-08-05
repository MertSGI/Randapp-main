import path from 'path';
import {
  DEDICATED_H1D_TENANT_ID,
  loadEnvFile,
  NetworkObserver,
  createMonitoredFetch,
  authenticateUser,
  callRpcEndpoint,
  redactSecrets,
  assertAnonAclDenied,
  assertAuthenticatedUnauthorized
} from './test-h1e-a-credentialed-runner-helpers.mjs';

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const h1eCMode = process.env.LARI_H1E_C_ACCEPTANCE_MODE;

const credentials = {
  nonmember: { label: 'nonmember', email: process.env.LARI_STAGE_H1D_NONMEMBER_EMAIL || 'h1dnonmember@randevulari.com', password: process.env.LARI_STAGE_H1D_NONMEMBER_PASSWORD },
  staff: { label: 'staff', email: process.env.LARI_STAGE_H1D_STAFF_EMAIL || 'melisstaff@randevulari.com', password: process.env.LARI_STAGE_H1D_STAFF_PASSWORD },
  owner: { label: 'canonical owner', email: process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com', password: process.env.LARI_STAGE_D1_OWNER_PASSWORD },
  otherOwner: { label: 'other owner', email: process.env.LARI_STAGE_H1D_OTHER_OWNER_EMAIL || 'h1dotherowner@randevulari.com', password: process.env.LARI_STAGE_H1D_OTHER_OWNER_PASSWORD },
  superAdmin: { label: 'super admin', email: process.env.LARI_STAGE_H1D_SUPER_ADMIN_EMAIL || 'superadmin@randevulari.com', password: process.env.LARI_STAGE_H1D_SUPER_ADMIN_PASSWORD }
};

if (!h1eCMode || (h1eCMode !== 'pre_pilot_readonly' && h1eCMode !== 'controlled_paymentless_pilot')) {
  console.log('=== STAGE H1E-C PUBLIC BOOKING & PILOT ACCEPTANCE RUNNER ===\n');
  console.log('⚠️ H1E_C_MODE_REQUIRED');
  console.log('⚠️ STAGE_H1E_C_NOT_YET_GO');
  console.log('⚠️ PRODUCTION_NO_GO\n');
  console.log('Environment variable LARI_H1E_C_ACCEPTANCE_MODE must be explicitly set to either:');
  console.log('  - pre_pilot_readonly');
  console.log('  - controlled_paymentless_pilot');
  console.log('\nNo login attempt, network request or database mutation executed.');
  console.log('Final exit code: 1');
  if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs')) {
    process.exit(1);
  }
}

export function evaluateH1ECPrecedence(blockingReasons) {
  const precedence = [
    'RELEASE_CONTROL_UNAVAILABLE',
    'GLOBAL_RELEASE_PHASE_BLOCKED',
    'TENANT_NOT_FOUND',
    'TENANT_INACTIVE',
    'CORE_BOOKING_RESTRICTED',
    'PUBLIC_SITE_STATUS_BLOCKED',
    'PILOT_AUTHORIZATION_REQUIRED',
    'PILOT_AUTHORIZATION_REVOKED',
    'SUBSCRIPTION_BLOCKED',
    'REQUIRED_ENTITLEMENT_BLOCKED',
    'OPERATIONAL_READINESS_FAILED',
    'BOOKING_ALLOWED'
  ];

  if (!Array.isArray(blockingReasons)) return { ok: false, error: 'blocking_reason_codes is not an array' };

  const seen = new Set();
  for (const r of blockingReasons) {
    if (seen.has(r)) return { ok: false, error: `Duplicate reason code: ${r}` };
    seen.add(r);
    if (!precedence.includes(r)) return { ok: false, error: `Unknown reason code: ${r}` };
  }

  let lastIndex = -1;
  for (const r of blockingReasons) {
    const idx = precedence.indexOf(r);
    if (idx <= lastIndex) return { ok: false, error: `Reason code ${r} violates canonical precedence order` };
    lastIndex = idx;
  }

  if (blockingReasons.includes('BOOKING_ALLOWED') && blockingReasons.length > 1) {
    return { ok: false, error: 'BOOKING_ALLOWED coexists with blocker in array' };
  }

  return { ok: true, error: null };
}

export async function runCredentialedAcceptanceH1EC() {
  const runId = 'h1e_c_run_' + Date.now();
  console.log('=== STAGE H1E-C ACCEPTANCE RUNNER ===');
  console.log('Run ID: ' + runId);
  console.log('Mode: ' + h1eCMode);

  // Stub for prepared credentialed execution path
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('test-h1e-c-credentialed-runner.mjs') && h1eCMode) {
  runCredentialedAcceptanceH1EC();
}
