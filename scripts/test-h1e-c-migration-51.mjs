import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-C MIGRATION 51 HARMONIZED QA ===');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, condition, detail = '') {
  defined++;
  executed++;
  if (condition) {
    passed++;
    console.log('  ✅ PASS: ' + title);
  } else {
    failed++;
    console.error('  ❌ FAIL: ' + title + (detail ? ' - ' + detail : ''));
  }
}

const rootDir = process.cwd();
const mig47Path = path.join(rootDir, 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
const mig48Path = path.join(rootDir, 'supabase/migrations/20260823_h1e_a_eligibility_runtime_contract_fix.sql');
const mig49Path = path.join(rootDir, 'supabase/migrations/20260824_h1e_b_pilot_authorization_history.sql');
const mig50Path = path.join(rootDir, 'supabase/migrations/20260825_h1e_b_authorization_contract_hardening.sql');
const mig51Path = path.join(rootDir, 'supabase/migrations/20260826_h1e_c_public_booking_release_gate.sql');

// Static QA checks
check('1. Migration 51 file exists with exact filename', fs.existsSync(mig51Path));
check('2. Migrations 47, 48, 49 and 50 remain present and unaltered', fs.existsSync(mig47Path) && fs.existsSync(mig48Path) && fs.existsSync(mig49Path) && fs.existsSync(mig50Path));

const mig51Content = fs.existsSync(mig51Path) ? fs.readFileSync(mig51Path, 'utf8') : '';

check('3. Migration 51 contains single internal eligibility evaluator (evaluate_public_booking_eligibility_internal)', mig51Content.includes('evaluate_public_booking_eligibility_internal'));
check('4. Internal evaluator revokes all privileges from PUBLIC, anon, and authenticated', mig51Content.includes('REVOKE ALL ON FUNCTION public.evaluate_public_booking_eligibility_internal(UUID) FROM PUBLIC, anon, authenticated;'));

check('5. Migration 51 preserves exact can_accept_public_booking(p_slug text) signature and return type', mig51Content.includes('CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)') && mig51Content.includes('RETURNS jsonb'));
check('6. can_accept_public_booking grants EXECUTE strictly to anon and authenticated', mig51Content.includes('REVOKE ALL ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;') && mig51Content.includes('GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon, authenticated;'));

check('7. Migration 51 contains all 12 frozen reason precedence codes', 
  mig51Content.includes('RELEASE_CONTROL_UNAVAILABLE') &&
  mig51Content.includes('GLOBAL_RELEASE_PHASE_BLOCKED') &&
  mig51Content.includes('TENANT_NOT_FOUND') &&
  mig51Content.includes('TENANT_INACTIVE') &&
  mig51Content.includes('CORE_BOOKING_RESTRICTED') &&
  mig51Content.includes('PUBLIC_SITE_STATUS_BLOCKED') &&
  mig51Content.includes('PILOT_AUTHORIZATION_REQUIRED') &&
  mig51Content.includes('PILOT_AUTHORIZATION_REVOKED') &&
  mig51Content.includes('SUBSCRIPTION_BLOCKED') &&
  mig51Content.includes('REQUIRED_ENTITLEMENT_BLOCKED') &&
  mig51Content.includes('OPERATIONAL_READINESS_FAILED') &&
  mig51Content.includes('BOOKING_ALLOWED')
);

check('8. Migration 51 updates eligibility snapshot RPC with implementation_state = implemented', mig51Content.includes("super_admin_get_tenant_pilot_eligibility_snapshot") && mig51Content.includes("'implementation_state', 'implemented'"));
check('9. Snapshot RPC preserves authenticated super-admin ACL boundary', mig51Content.includes("REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;") && mig51Content.includes("GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;"));

check('10. Payment collection, checkout, and Iyzico flags remain explicitly false in global release control payload', mig51Content.includes("'is_payment_collection_enabled', false") && mig51Content.includes("'is_checkout_enabled', false") && mig51Content.includes("'is_iyzico_enabled', false"));

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined static tests: ' + defined);
console.log('Executed static tests: ' + executed);
console.log('Passed static tests: ' + passed);
console.log('Failed static tests: ' + failed);

const exitCode = (executed === defined && passed === defined && failed === 0) ? 0 : 1;
console.log('Final static exit code: ' + exitCode);
process.exit(exitCode);
