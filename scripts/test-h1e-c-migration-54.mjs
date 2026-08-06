// scripts/test-h1e-c-migration-54.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log('=== STAGE H1E-C MIGRATION 54 HARMONIZED QA ===\n');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, condition, detail = '') {
  defined++;
  executed++;
  if (condition) {
    passed++;
    console.log(`  ✅ PASS (Static): ${title}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL (Static): ${title} - ${detail}`);
  }
}

function sha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

// 1. Frozen Baseline Hashes Verification
const MIG_51_PATH = path.join(MIGRATIONS_DIR, '20260826_h1e_c_public_booking_release_gate.sql');
const MIG_52_PATH = path.join(MIGRATIONS_DIR, '20260827_h1e_c_public_booking_release_gate_runtime_fix.sql');
const MIG_53_PATH = path.join(MIGRATIONS_DIR, '20260828_h1e_c_controlled_release_phase_transition.sql');

const EXPECTED_MIG_51_SHA = '045e42bf76e2c1f4c62db3bc521a9ed87c0db29ce320249adb07b476ade1cc07';
const EXPECTED_MIG_52_SHA = '8e0e9e6ad81337d5831049801184ec50491f6ef59b46f0b524092edce6214d8d';
const EXPECTED_MIG_53_SHA = 'e12239d1b51904895d4f94d03c6a3edf25d8dddb17526bf803038c6a3f069357';

check('1. Migrations 1-53 remain present and unaltered',
  fs.existsSync(MIG_51_PATH) && sha256(MIG_51_PATH) === EXPECTED_MIG_51_SHA &&
  fs.existsSync(MIG_52_PATH) && sha256(MIG_52_PATH) === EXPECTED_MIG_52_SHA &&
  fs.existsSync(MIG_53_PATH) && sha256(MIG_53_PATH) === EXPECTED_MIG_53_SHA,
  'Migration 51, 52 or 53 hash mismatch or file missing'
);

// 2. Migration 54 Existence
const MIG_54_PATH = path.join(MIGRATIONS_DIR, '20260829_h1e_c_controlled_transition_runtime_fix.sql');
check('2. Migration 54 file exists with exact filename',
  fs.existsSync(MIG_54_PATH),
  'Migration 54 SQL file not found'
);

const sql54 = fs.existsSync(MIG_54_PATH) ? fs.readFileSync(MIG_54_PATH, 'utf8') : '';

// 3. Transition RPC Signature Preserved
check('3. Transition RPC exact signature and SECURITY DEFINER search_path preserved',
  sql54.includes('CREATE OR REPLACE FUNCTION public.super_admin_transition_release_phase(') &&
  sql54.includes('p_expected_phase TEXT,') &&
  sql54.includes('p_target_phase TEXT,') &&
  sql54.includes('p_reason TEXT,') &&
  sql54.includes('p_idempotency_key TEXT') &&
  sql54.includes('SECURITY DEFINER') &&
  sql54.includes('SET search_path = pg_catalog, public'),
  'Transition RPC signature or SECURITY DEFINER search_path definition missing'
);

// 4. Canonical Audit Columns Used
check('4. Transition RPC inserts into public.audit_events using canonical columns (tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload)',
  sql54.includes('INSERT INTO public.audit_events (') &&
  sql54.includes('tenant_id,') &&
  sql54.includes('actor_id,') &&
  sql54.includes('actor_role,') &&
  sql54.includes('action,') &&
  sql54.includes('resource_type,') &&
  sql54.includes('resource_id,') &&
  sql54.includes('payload'),
  'Canonical audit columns not used in transition RPC'
);

// 5. Non-canonical Audit Columns Absent from audit_events INSERT
check('5. Legacy columns actor_user_id and event_type are absent from audit_events INSERT statement and evidence query',
  !sql54.includes('INSERT INTO public.audit_events (\n        tenant_id,\n        actor_user_id') &&
  !sql54.includes('event_type,'),
  'Non-canonical audit columns detected in audit_events INSERT or evidence query'
);

// 6. Evidence RPC Queries Action Column
check('6. Evidence RPC queries canonical action column instead of event_type',
  sql54.includes("WHERE action = 'platform_release_phase_transitioned_to_paymentless_pilot'") &&
  sql54.includes("WHERE action = 'platform_release_phase_restored_to_pre_pilot'"),
  'Evidence RPC does not query canonical action column'
);

// 7. Idempotency Actor Binding Enforced
check('7. Idempotency replay verifies actor_user_id match and returns IDEMPOTENCY_CONFLICT on mismatch',
  sql54.includes('v_cached_rec.actor_user_id != v_actor_user_id') &&
  sql54.includes("'IDEMPOTENCY_CONFLICT'"),
  'Different-actor idempotency conflict check missing'
);

// 8. Advisory and Row Locks Retained
check('8. Transaction advisory lock and row lock FOR UPDATE retained',
  sql54.includes("hashtextextended('platform_global_release_control:singleton', 0)") &&
  sql54.includes('FOR UPDATE'),
  'Concurrency locks missing'
);

// 9. Full-production Transition Blocked
check('9. Full-production phase blocked from transition contract',
  sql54.includes("p_target_phase NOT IN ('pre_pilot', 'paymentless_pilot')") &&
  sql54.includes("'RELEASE_PHASE_TRANSITION_NOT_ALLOWED'"),
  'Full production restriction missing'
);

// 10. Payment Interlock Retained
check('10. Payment safety interlock check enforced prior to transition',
  sql54.includes('v_current_ctrl.is_payment_collection_enabled OR') &&
  sql54.includes('v_current_ctrl.is_checkout_enabled OR') &&
  sql54.includes('v_current_ctrl.is_iyzico_enabled') &&
  sql54.includes("'PAYMENT_SAFETY_VIOLATION'"),
  'Payment safety interlock check missing'
);

// 11. Direct Table Privileges Revoked
check('11. Direct function privileges revoked from PUBLIC and anon',
  sql54.includes('REVOKE ALL ON FUNCTION public.super_admin_transition_release_phase(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;') &&
  sql54.includes('REVOKE ALL ON FUNCTION public.super_admin_get_release_transition_evidence(TEXT) FROM PUBLIC, anon;'),
  'Revoke privileges statement missing'
);

// 12. Safe Correlation Hash Used (No Raw Secrets)
check('12. Audit event payload uses safe idempotency_key_hash and no raw key',
  sql54.includes("'idempotency_key_hash', v_idempotency_hash") &&
  !sql54.includes("'idempotency_key', p_idempotency_key"),
  'Audit payload exposes raw idempotency key'
);

// 13. No Immediate State Update at Migration Time
check('13. No automatic release_phase update or pilot tenant authorization in migration body',
  !sql54.includes('UPDATE public.platform_global_release_control SET release_phase') ||
  sql54.indexOf('UPDATE public.platform_global_release_control SET release_phase') > sql54.indexOf('CREATE OR REPLACE FUNCTION'),
  'Automatic release phase update detected in migration body'
);

console.log('\n══════════════════════════════════════════════════════════');
console.log(`Defined static tests: ${defined}`);
console.log(`Executed static tests: ${executed}`);
console.log(`Passed static tests: ${passed}`);
console.log(`Failed static tests: ${failed}`);

const exitCode = (executed === defined && passed === defined && failed === 0) ? 0 : 1;
console.log(`Final static exit code: ${exitCode}`);
if (exitCode !== 0) process.exit(exitCode);
