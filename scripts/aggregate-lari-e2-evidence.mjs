// ============================================================================
// CANONICAL EVIDENCE AGGREGATOR & SCHEMA VALIDATOR
// File: scripts/aggregate-lari-e2-evidence.mjs
// Purpose:
//   Merges separate phase fragments, validates single-owner non-duplicate keys,
//   records exact first fatal step/reason, evaluates composite gate criteria,
//   and outputs authoritative /tmp/e2-artifacts/results.env.
// ============================================================================

import fs from 'fs';
import path from 'path';

const artifactsDir = '/tmp/e2-artifacts';

const requiredKeys = [
  'FIXTURE_UUID_STATIC_RESULT', 'INVALID_UUID_DISTINCT_COUNT', 'INVALID_UUID_OCCURRENCE_COUNT',
  'FIXTURE_ARITY_STATIC_RESULT', 'ARITY_CHECKED_INSERT_COUNT', 'ARITY_NON_VALUES_INSERT_COUNT', 'ARITY_MISMATCH_DISTINCT_COUNT', 'ARITY_MISMATCH_OCCURRENCE_COUNT', 'ARITY_UNSUPPORTED_STATEMENT_COUNT',
  'MIGRATION_REPLAY_RESULT', 'MIGRATION_COUNT',
  'COMMERCIAL_FIXTURE_RESULT', 'COMMERCIAL_ELIGIBILITY_RESULT', 'COMMERCIAL_QUOTA_RESULT',
  'FOUNDATION_PGTAP_PLANNED_COUNT', 'FOUNDATION_PGTAP_EXECUTED_COUNT', 'FOUNDATION_PGTAP_COUNT', 'FOUNDATION_PGTAP_PASSED_COUNT', 'FOUNDATION_PGTAP_FAILED_COUNT', 'FOUNDATION_PGTAP_RESULT', 'FOUNDATION_PGTAP_FAILURE_CLASS',
  'SLICE3_PGTAP_PLANNED_COUNT', 'SLICE3_PGTAP_EXECUTED_COUNT', 'SLICE3_PGTAP_COUNT', 'SLICE3_PGTAP_PASSED_COUNT', 'SLICE3_PGTAP_FAILED_COUNT', 'SLICE3_PGTAP_RESULT', 'SLICE3_PGTAP_FAILURE_CLASS',
  'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT', 'SLICE4_BLOCK1_PGTAP_EXECUTED_COUNT', 'SLICE4_BLOCK1_PGTAP_COUNT', 'SLICE4_BLOCK1_PGTAP_PASSED_COUNT', 'SLICE4_BLOCK1_PGTAP_FAILED_COUNT', 'SLICE4_BLOCK1_PGTAP_RESULT', 'SLICE4_BLOCK1_PGTAP_FAILURE_CLASS',
  'SLICE4_BLOCK2_PGTAP_PLANNED_COUNT', 'SLICE4_BLOCK2_PGTAP_EXECUTED_COUNT', 'SLICE4_BLOCK2_PGTAP_COUNT', 'SLICE4_BLOCK2_PGTAP_PASSED_COUNT', 'SLICE4_BLOCK2_PGTAP_FAILED_COUNT', 'SLICE4_BLOCK2_PGTAP_RESULT', 'SLICE4_BLOCK2_PGTAP_FAILURE_CLASS',
  'CLINIC_DOMAIN_PGTAP_PLANNED_COUNT', 'CLINIC_DOMAIN_PGTAP_EXECUTED_COUNT', 'CLINIC_DOMAIN_PGTAP_COUNT', 'CLINIC_DOMAIN_PGTAP_PASSED_COUNT', 'CLINIC_DOMAIN_PGTAP_FAILED_COUNT', 'CLINIC_DOMAIN_PGTAP_RESULT', 'CLINIC_DOMAIN_PGTAP_FAILURE_CLASS',
  'CLINIC_OPS_PGTAP_PLANNED_COUNT', 'CLINIC_OPS_PGTAP_EXECUTED_COUNT', 'CLINIC_OPS_PGTAP_COUNT', 'CLINIC_OPS_PGTAP_PASSED_COUNT', 'CLINIC_OPS_PGTAP_FAILED_COUNT', 'CLINIC_OPS_PGTAP_RESULT', 'CLINIC_OPS_PGTAP_FAILURE_CLASS',
  'CLINIC_HARDENING_PGTAP_PLANNED_COUNT', 'CLINIC_HARDENING_PGTAP_EXECUTED_COUNT', 'CLINIC_HARDENING_PGTAP_COUNT', 'CLINIC_HARDENING_PGTAP_PASSED_COUNT', 'CLINIC_HARDENING_PGTAP_FAILED_COUNT', 'CLINIC_HARDENING_PGTAP_RESULT', 'CLINIC_HARDENING_PGTAP_FAILURE_CLASS',
  'PUBLIC_BOOKING_PGTAP_PLANNED_COUNT', 'PUBLIC_BOOKING_PGTAP_EXECUTED_COUNT', 'PUBLIC_BOOKING_PGTAP_COUNT', 'PUBLIC_BOOKING_PGTAP_PASSED_COUNT', 'PUBLIC_BOOKING_PGTAP_FAILED_COUNT', 'PUBLIC_BOOKING_PGTAP_RESULT', 'PUBLIC_BOOKING_PGTAP_FAILURE_CLASS',
  'ZERO_TEST_SUITE_COUNT', 'PGTAP_PHASE_RESULT',
  'REAL_TWO_SESSION_CONCURRENCY_RESULT', 'CONTROLLER_LOCK_BARRIER_RESULT', 'BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT', 'INDEPENDENT_DB_CONNECTION_COUNT', 'CONCURRENCY_ROUND_COUNT',
  'ROUND_1_WINNER', 'ROUND_1_ACTIVE_APPOINTMENT_COUNT', 'ROUND_2_WINNER', 'ROUND_2_ACTIVE_APPOINTMENT_COUNT', 'ROUND_3_WINNER', 'ROUND_3_ACTIVE_APPOINTMENT_COUNT',
  'HT_WIN_COUNT', 'HT_WIN_PROVENANCE_RESULT', 'BOTH_SUCCESS_COUNT', 'DEADLOCK_COUNT', 'TIMEOUT_COUNT',
  'LOSING_HT_PARTIAL_CUSTOMER_COUNT', 'LOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT', 'LOSING_HT_PARTIAL_APPOINTMENT_COUNT', 'NO_ENCOUNTER_AUTOCREATE_RESULT', 'NO_EXTERNAL_SIDE_EFFECT_RESULT',
  'BLOCK2_APPLICATION_RESULT', 'BLOCK1_REGRESSION', 'FOUNDATION_REGRESSION', 'SLICE3_REGRESSION', 'CLINIC_REGRESSION', 'SLICE2_REGRESSION',
  'TYPECHECK_RESULT', 'LINT_RESULT', 'BUILD_RESULT', 'SECRET_SCAN_RESULT',
  'REMOTE_SUPABASE_ACCESS_COUNT', 'SHARED_STAGING_ACCESS_COUNT', 'PRODUCTION_ACCESS_COUNT', 'DEPLOYMENT_COUNT', 'CONTROL_PLANE_MUTATION_COUNT', 'AOS_MUTATION_COUNT',
  'FIRST_FATAL_STEP_IF_ANY', 'FIRST_FATAL_REASON_IF_ANY', 'SLICE4_E2_RESULT', 'CONTROLLER_REVIEW_REQUIRED'
];

export function aggregateEvidence(targetDir = artifactsDir) {
  console.log('=== CANONICAL EVIDENCE AGGREGATOR RUNNING ===');
  const kv = new Map();
  const keyOwnerMap = new Map();

  const rawEnvPath = path.join(targetDir, 'raw-fragment.env');
  if (fs.existsSync(rawEnvPath)) {
    const lines = fs.readFileSync(rawEnvPath, 'utf8').split('\n');
    for (let lNum = 0; lNum < lines.length; lNum++) {
      const line = lines[lNum].trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        throw new Error(`MALFORMED_LINE: Bare/unassigned line "${line}" at line ${lNum + 1}`);
      }
      const k = line.substring(0, eqIdx).trim();
      const v = line.substring(eqIdx + 1).trim();

      if (!requiredKeys.includes(k) && !k.endsWith('_NOT_EXECUTED_REASON')) {
        throw new Error(`UNKNOWN_KEY: Key "${k}" is not in canonical evidence schema!`);
      }

      if (keyOwnerMap.has(k)) {
        throw new Error(`DUPLICATE_KEY_REJECTED: Key "${k}" assigned multiple times in evidence!`);
      }

      keyOwnerMap.set(k, 'raw-fragment.env');
      kv.set(k, v);
    }
  }

  // Populate missing mandatory execution keys as NOT_EXECUTED
  for (const k of requiredKeys) {
    if (!kv.has(k)) {
      if (k.endsWith('_RESULT')) {
        kv.set(k, 'NOT_EXECUTED');
        kv.set(`${k}_NOT_EXECUTED_REASON`, 'Prerequisite phase failed or skipped');
      } else if (k.endsWith('_COUNT')) {
        if (['REMOTE_SUPABASE_ACCESS_COUNT', 'SHARED_STAGING_ACCESS_COUNT', 'PRODUCTION_ACCESS_COUNT', 'DEPLOYMENT_COUNT', 'CONTROL_PLANE_MUTATION_COUNT', 'AOS_MUTATION_COUNT'].includes(k)) {
          kv.set(k, '0');
        } else {
          kv.set(k, '0');
        }
      } else if (k.endsWith('_CLASS')) {
        kv.set(k, 'NOT_EXECUTED');
      } else {
        kv.set(k, '');
      }
    }
  }

  // Find FIRST_FATAL
  let firstFatalStep = '';
  let firstFatalReason = '';
  for (const k of requiredKeys) {
    const v = kv.get(k);
    if (v === 'FAIL' && !firstFatalStep) {
      firstFatalStep = k;
      firstFatalReason = `Phase or metric ${k} returned FAIL`;
    }
  }

  kv.set('FIRST_FATAL_STEP_IF_ANY', firstFatalStep);
  kv.set('FIRST_FATAL_REASON_IF_ANY', firstFatalReason);

  // Evaluate Composite Acceptance
  let compositePass = true;

  // 1. Static Contracts
  if (kv.get('FIXTURE_UUID_STATIC_RESULT') !== 'PASS' || kv.get('INVALID_UUID_DISTINCT_COUNT') !== '0' || kv.get('INVALID_UUID_OCCURRENCE_COUNT') !== '0') compositePass = false;
  if (kv.get('FIXTURE_ARITY_STATIC_RESULT') !== 'PASS' || kv.get('ARITY_MISMATCH_DISTINCT_COUNT') !== '0' || kv.get('ARITY_MISMATCH_OCCURRENCE_COUNT') !== '0' || kv.get('ARITY_UNSUPPORTED_STATEMENT_COUNT') !== '0') compositePass = false;

  // 2. Migration & Commercial
  if (kv.get('MIGRATION_REPLAY_RESULT') !== 'PASS' || kv.get('MIGRATION_COUNT') !== '69/69') compositePass = false;
  if (kv.get('COMMERCIAL_FIXTURE_RESULT') !== 'PASS' || kv.get('COMMERCIAL_ELIGIBILITY_RESULT') !== 'PASS' || kv.get('COMMERCIAL_QUOTA_RESULT') !== 'PASS') compositePass = false;

  // 3. 8 DB Suites
  const suitePrefixes = ['FOUNDATION', 'SLICE3', 'SLICE4_BLOCK1', 'SLICE4_BLOCK2', 'CLINIC_DOMAIN', 'CLINIC_OPS', 'CLINIC_HARDENING', 'PUBLIC_BOOKING'];
  for (const p of suitePrefixes) {
    if (kv.get(`${p}_PGTAP_RESULT`) !== 'PASS' || kv.get(`${p}_PGTAP_FAILED_COUNT`) !== '0') compositePass = false;
  }
  if (kv.get('ZERO_TEST_SUITE_COUNT') !== '0') compositePass = false;

  // 4. Concurrency
  if (kv.get('REAL_TWO_SESSION_CONCURRENCY_RESULT') !== 'PASS' || kv.get('BOTH_SUCCESS_COUNT') !== '0' || kv.get('DEADLOCK_COUNT') !== '0' || kv.get('TIMEOUT_COUNT') !== '0') compositePass = false;

  // 5. App Regressions
  const appKeys = ['BLOCK2_APPLICATION_RESULT', 'BLOCK1_REGRESSION', 'FOUNDATION_REGRESSION', 'SLICE3_REGRESSION', 'CLINIC_REGRESSION', 'SLICE2_REGRESSION', 'TYPECHECK_RESULT', 'LINT_RESULT', 'BUILD_RESULT', 'SECRET_SCAN_RESULT'];
  for (const k of appKeys) {
    if (kv.get(k) !== 'PASS') compositePass = false;
  }

  // 6. Containment
  const containmentKeys = ['REMOTE_SUPABASE_ACCESS_COUNT', 'SHARED_STAGING_ACCESS_COUNT', 'PRODUCTION_ACCESS_COUNT', 'DEPLOYMENT_COUNT', 'CONTROL_PLANE_MUTATION_COUNT', 'AOS_MUTATION_COUNT'];
  for (const k of containmentKeys) {
    if (kv.get(k) !== '0') compositePass = false;
  }

  kv.set('SLICE4_E2_RESULT', compositePass ? 'PASS_CANDIDATE' : 'FAIL');
  kv.set('CONTROLLER_REVIEW_REQUIRED', 'YES');

  let outputStr = '';
  for (const [k, v] of kv.entries()) {
    outputStr += `${k}=${v}\n`;
  }

  fs.writeFileSync(path.join(targetDir, 'results.env'), outputStr);
  console.log('✅ Canonical results.env generated.');
  return compositePass;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  aggregateEvidence();
}
