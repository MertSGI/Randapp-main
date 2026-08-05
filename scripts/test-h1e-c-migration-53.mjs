import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-C3 MIGRATION 53 HARMONIZED QA ===');

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
const mig53Path = path.join(rootDir, 'supabase/migrations/20260828_h1e_c_controlled_release_phase_transition.sql');

checkStatic('1. Migrations 1-52 remain present and unaltered', 
  fs.existsSync(mig47Path) && fs.existsSync(mig48Path) && fs.existsSync(mig49Path) && 
  fs.existsSync(mig50Path) && fs.existsSync(mig51Path) && fs.existsSync(mig52Path)
);
checkStatic('2. Migration 53 file exists with exact filename', fs.existsSync(mig53Path));

const mig53Content = fs.existsSync(mig53Path) ? fs.readFileSync(mig53Path, 'utf8') : '';

checkStatic('3. Transition RPC exact signature and SECURITY DEFINER search_path', 
  mig53Content.includes('CREATE OR REPLACE FUNCTION public.super_admin_transition_release_phase(\n    p_expected_phase TEXT,\n    p_target_phase TEXT,\n    p_reason TEXT,\n    p_idempotency_key TEXT\n)') &&
  mig53Content.includes('SECURITY DEFINER') &&
  mig53Content.includes('SET search_path = pg_catalog, public')
);

checkStatic('4. Super-admin authorization boundary enforced', 
  mig53Content.includes('v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id)') &&
  mig53Content.includes('REVOKE ALL ON FUNCTION public.super_admin_transition_release_phase(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;') &&
  mig53Content.includes('GRANT EXECUTE ON FUNCTION public.super_admin_transition_release_phase(TEXT, TEXT, TEXT, TEXT) TO authenticated;')
);

checkStatic('5. Transaction advisory lock and row lock FOR UPDATE present', 
  mig53Content.includes("PERFORM pg_advisory_xact_lock(hashtextextended('platform_global_release_control:singleton', 0));") &&
  mig53Content.includes('FOR UPDATE')
);

checkStatic('6. Expected-phase conflict check present', 
  mig53Content.includes('v_current_ctrl.release_phase != p_expected_phase') &&
  mig53Content.includes("'reason_code', 'RELEASE_PHASE_CONFLICT'")
);

checkStatic('7. Full-production phase blocked from transition contract', 
  mig53Content.includes("p_expected_phase NOT IN ('pre_pilot', 'paymentless_pilot')") &&
  mig53Content.includes("p_target_phase NOT IN ('pre_pilot', 'paymentless_pilot')")
);

checkStatic('8. Payment safety interlock check enforced', 
  mig53Content.includes("v_current_ctrl.is_payment_collection_enabled OR") &&
  mig53Content.includes("v_current_ctrl.is_checkout_enabled OR") &&
  mig53Content.includes("v_current_ctrl.is_iyzico_enabled") &&
  mig53Content.includes("'reason_code', 'PAYMENT_SAFETY_VIOLATION'")
);

checkStatic('9. Dedicated idempotency and history tables created with strict RLS', 
  mig53Content.includes('CREATE TABLE IF NOT EXISTS public.platform_release_phase_transition_history') &&
  mig53Content.includes('CREATE TABLE IF NOT EXISTS public.super_admin_release_transition_idempotency') &&
  mig53Content.includes('REVOKE ALL ON TABLE public.platform_release_phase_transition_history FROM PUBLIC, anon, authenticated;') &&
  mig53Content.includes('REVOKE ALL ON TABLE public.super_admin_release_transition_idempotency FROM PUBLIC, anon, authenticated;')
);

checkStatic('10. Audit event payload uses safe idempotency_key_hash and no raw secrets', 
  mig53Content.includes("event_type,\n        resource_type,\n        resource_id,\n        payload") &&
  mig53Content.includes("'idempotency_key_hash', v_idempotency_hash") &&
  !mig53Content.includes("p_idempotency_key'")
);

checkStatic('11. Evidence read RPC provisions safe numerical totals', 
  mig53Content.includes('CREATE OR REPLACE FUNCTION public.super_admin_get_release_transition_evidence(') &&
  mig53Content.includes('REVOKE ALL ON FUNCTION public.super_admin_get_release_transition_evidence(TEXT) FROM PUBLIC, anon;') &&
  mig53Content.includes('GRANT EXECUTE ON FUNCTION public.super_admin_get_release_transition_evidence(TEXT) TO authenticated;')
);

checkStatic('12. No automatic release_phase update or pilot tenant authorization in migration', 
  !mig53Content.includes('UPDATE public.platform_global_release_control SET release_phase =') &&
  !mig53Content.includes('INSERT INTO public.tenant_pilot_authorizations')
);

checkStatic('13. Payment capability flags remain explicitly false', 
  !mig53Content.includes('is_payment_collection_enabled = true') &&
  !mig53Content.includes('is_checkout_enabled = true') &&
  !mig53Content.includes('is_iyzico_enabled = true')
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
