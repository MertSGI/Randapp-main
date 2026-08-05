import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-C1 MIGRATION 52 HARMONIZED QA ===');

let staticDefined = 0;
let staticExecuted = 0;
let staticPassed = 0;
let staticFailed = 0;

function checkStatic(title, condition, detail = '') {
  staticDefined++;
  staticExecuted++;
  if (condition) {
    staticPassed++;
    console.log('  ✅ PASS (Static): ' + title);
  } else {
    staticFailed++;
    console.error('  ❌ FAIL (Static): ' + title + (detail ? ' - ' + detail : ''));
  }
}

const rootDir = process.cwd();
const mig47Path = path.join(rootDir, 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
const mig48Path = path.join(rootDir, 'supabase/migrations/20260823_h1e_a_eligibility_runtime_contract_fix.sql');
const mig49Path = path.join(rootDir, 'supabase/migrations/20260824_h1e_b_pilot_authorization_history.sql');
const mig50Path = path.join(rootDir, 'supabase/migrations/20260825_h1e_b_authorization_contract_hardening.sql');
const mig51Path = path.join(rootDir, 'supabase/migrations/20260826_h1e_c_public_booking_release_gate.sql');
const mig52Path = path.join(rootDir, 'supabase/migrations/20260827_h1e_c_public_booking_release_gate_runtime_fix.sql');

// 1. Static QA
checkStatic('1. Migrations 1-51 remain present and unaltered', 
  fs.existsSync(mig47Path) && fs.existsSync(mig48Path) && fs.existsSync(mig49Path) && fs.existsSync(mig50Path) && fs.existsSync(mig51Path)
);
checkStatic('2. Migration 52 file exists with exact filename', fs.existsSync(mig52Path));

const mig52Content = fs.existsSync(mig52Path) ? fs.readFileSync(mig52Path, 'utf8') : '';

checkStatic('3. Obsolete 1-argument evaluator removed', mig52Content.includes('DROP FUNCTION IF EXISTS public.evaluate_public_booking_eligibility_internal(UUID);'));
checkStatic('4. New 2-argument internal evaluator created with safe search_path', 
  mig52Content.includes('CREATE OR REPLACE FUNCTION public.evaluate_public_booking_eligibility_internal(\n    p_tenant_id UUID DEFAULT NULL,\n    p_slug TEXT DEFAULT NULL\n)') &&
  mig52Content.includes('SET search_path = pg_catalog, public')
);
checkStatic('5. 2-argument internal evaluator REVOKES ALL from PUBLIC, anon, authenticated', 
  mig52Content.includes('REVOKE ALL ON FUNCTION public.evaluate_public_booking_eligibility_internal(UUID, TEXT) FROM PUBLIC, anon, authenticated;')
);
checkStatic('6. can_accept_public_booking signature and return type preserved', 
  mig52Content.includes('CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)') &&
  mig52Content.includes('RETURNS jsonb')
);
checkStatic('7. Snapshot signature preserved with authenticated super-admin boundary', 
  mig52Content.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(') &&
  mig52Content.includes('REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;') &&
  mig52Content.includes('GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;')
);
checkStatic('8. Snapshot uses canonical approved_* columns and contains no authorized_* column references', 
  mig52Content.includes('SELECT id, approved_at, approved_by, approved_reason') &&
  !mig52Content.includes('authorized_at') &&
  !mig52Content.includes('authorized_by') &&
  !mig52Content.includes('authorization_reason')
);
checkStatic('9. Canonical restriction schema platform_system_restrictions used and platform_tenant_restrictions absent', 
  mig52Content.includes('FROM public.platform_system_restrictions') &&
  !mig52Content.includes('platform_tenant_restrictions')
);
checkStatic('10. 2-argument commercial resolver used', 
  mig52Content.includes('public.resolve_tenant_commercial_eligibility(v_tenant_id, now())')
);
checkStatic('11. All payment capability flags remain explicitly false', 
  mig52Content.includes("'is_payment_collection_enabled', false") &&
  mig52Content.includes("'is_checkout_enabled', false") &&
  mig52Content.includes("'is_iyzico_enabled', false")
);

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined static tests: ' + staticDefined);
console.log('Executed static tests: ' + staticExecuted);
console.log('Passed static tests: ' + staticPassed);
console.log('Failed static tests: ' + staticFailed);

const staticExitCode = (staticExecuted === staticDefined && staticPassed === staticDefined && staticFailed === 0) ? 0 : 1;
console.log('Final static exit code: ' + staticExitCode);

if (staticExitCode !== 0) {
  process.exit(staticExitCode);
}
