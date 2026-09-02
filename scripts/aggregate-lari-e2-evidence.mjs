// ============================================================================
// CANONICAL EVIDENCE AGGREGATOR & SCHEMA VALIDATOR (R9-R1.2 CONSISTENT)
// File: scripts/aggregate-lari-e2-evidence.mjs
// Purpose:
//   Consumes exactly 30 separate phase-owned evidence fragments under /tmp/e2-artifacts/,
//   validates strict 1:1 key-to-owner mappings, enforces explicit failure reasons,
//   derives FIRST_FATAL causally from actual FAIL phases, and outputs results.env.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const artifactsDir = '/tmp/e2-artifacts';

export const phaseFragmentOwners = {
  '01-migration.env': ['MIGRATION_REPLAY_RESULT', 'MIGRATION_COUNT'],
  '02-commercial.env': [
    'COMMERCIAL_BOOTSTRAP_RESULT', 'COMMERCIAL_ELIGIBILITY_RESULT',
    'COMMERCIAL_CORE_BOOKING_RESULT', 'COMMERCIAL_STAFF_MANAGEMENT_RESULT',
    'COMMERCIAL_SERVICE_MANAGEMENT_RESULT', 'COMMERCIAL_LARI_MINISITE_RESULT',
    'COMMERCIAL_MAX_STAFF_RESULT', 'COMMERCIAL_MAX_SERVICES_RESULT',
    'COMMERCIAL_MAX_BRANCHES_RESULT', 'COMMERCIAL_MAX_MONTHLY_APPOINTMENTS_RESULT',
    'COMMERCIAL_FIXTURE_RESULT', 'COMMERCIAL_QUOTA_RESULT'
  ],
  '03-r9-selftest.env': ['R9_SELFTEST_RESULT'],
  '04-uuid-static.env': ['FIXTURE_UUID_STATIC_RESULT', 'INVALID_UUID_DISTINCT_COUNT', 'INVALID_UUID_OCCURRENCE_COUNT'],
  '05-arity-static.env': [
    'FIXTURE_ARITY_STATIC_RESULT', 'ARITY_CHECKED_INSERT_COUNT',
    'ARITY_NON_VALUES_INSERT_COUNT', 'ARITY_MISMATCH_DISTINCT_COUNT',
    'ARITY_MISMATCH_OCCURRENCE_COUNT', 'ARITY_UNSUPPORTED_STATEMENT_COUNT'
  ],
  '06-pgtap-foundation.env': ['FOUNDATION_PGTAP_PLANNED_COUNT', 'FOUNDATION_PGTAP_EXECUTED_COUNT', 'FOUNDATION_PGTAP_COUNT', 'FOUNDATION_PGTAP_PASSED_COUNT', 'FOUNDATION_PGTAP_FAILED_COUNT', 'FOUNDATION_PGTAP_RESULT', 'FOUNDATION_PGTAP_FAILURE_CLASS'],
  '07-pgtap-slice3.env': ['SLICE3_PGTAP_PLANNED_COUNT', 'SLICE3_PGTAP_EXECUTED_COUNT', 'SLICE3_PGTAP_COUNT', 'SLICE3_PGTAP_PASSED_COUNT', 'SLICE3_PGTAP_FAILED_COUNT', 'SLICE3_PGTAP_RESULT', 'SLICE3_PGTAP_FAILURE_CLASS'],
  '08-pgtap-slice4-block1.env': ['SLICE4_BLOCK1_PGTAP_PLANNED_COUNT', 'SLICE4_BLOCK1_PGTAP_EXECUTED_COUNT', 'SLICE4_BLOCK1_PGTAP_COUNT', 'SLICE4_BLOCK1_PGTAP_PASSED_COUNT', 'SLICE4_BLOCK1_PGTAP_FAILED_COUNT', 'SLICE4_BLOCK1_PGTAP_RESULT', 'SLICE4_BLOCK1_PGTAP_FAILURE_CLASS'],
  '09-pgtap-slice4-block2.env': ['SLICE4_BLOCK2_PGTAP_PLANNED_COUNT', 'SLICE4_BLOCK2_PGTAP_EXECUTED_COUNT', 'SLICE4_BLOCK2_PGTAP_COUNT', 'SLICE4_BLOCK2_PASSED_COUNT', 'SLICE4_BLOCK2_PGTAP_PASSED_COUNT', 'SLICE4_BLOCK2_PGTAP_FAILED_COUNT', 'SLICE4_BLOCK2_PGTAP_RESULT', 'SLICE4_BLOCK2_PGTAP_FAILURE_CLASS'],
  '10-pgtap-clinic-domain.env': ['CLINIC_DOMAIN_PGTAP_PLANNED_COUNT', 'CLINIC_DOMAIN_PGTAP_EXECUTED_COUNT', 'CLINIC_DOMAIN_PGTAP_COUNT', 'CLINIC_DOMAIN_PGTAP_PASSED_COUNT', 'CLINIC_DOMAIN_PGTAP_FAILED_COUNT', 'CLINIC_DOMAIN_PGTAP_RESULT', 'CLINIC_DOMAIN_PGTAP_FAILURE_CLASS'],
  '11-pgtap-clinic-ops.env': ['CLINIC_OPS_PGTAP_PLANNED_COUNT', 'CLINIC_OPS_PGTAP_EXECUTED_COUNT', 'CLINIC_OPS_PGTAP_COUNT', 'CLINIC_OPS_PGTAP_PASSED_COUNT', 'CLINIC_OPS_PGTAP_FAILED_COUNT', 'CLINIC_OPS_PGTAP_RESULT', 'CLINIC_OPS_PGTAP_FAILURE_CLASS'],
  '12-pgtap-clinic-hardening.env': ['CLINIC_HARDENING_PGTAP_PLANNED_COUNT', 'CLINIC_HARDENING_PGTAP_EXECUTED_COUNT', 'CLINIC_HARDENING_PGTAP_COUNT', 'CLINIC_HARDENING_PGTAP_PASSED_COUNT', 'CLINIC_HARDENING_PGTAP_FAILED_COUNT', 'CLINIC_HARDENING_PGTAP_RESULT', 'CLINIC_HARDENING_PGTAP_FAILURE_CLASS'],
  '13-pgtap-public-booking.env': ['PUBLIC_BOOKING_PGTAP_PLANNED_COUNT', 'PUBLIC_BOOKING_PGTAP_EXECUTED_COUNT', 'PUBLIC_BOOKING_PGTAP_COUNT', 'PUBLIC_BOOKING_PGTAP_PASSED_COUNT', 'PUBLIC_BOOKING_PGTAP_FAILED_COUNT', 'PUBLIC_BOOKING_PGTAP_RESULT', 'PUBLIC_BOOKING_PGTAP_FAILURE_CLASS'],
  '13b-pgtap-summary.env': ['ZERO_TEST_SUITE_COUNT', 'PGTAP_PHASE_RESULT'],
  '14-concurrency.env': [
    'REAL_TWO_SESSION_CONCURRENCY_RESULT', 'CONTROLLER_LOCK_BARRIER_RESULT', 'BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT', 'INDEPENDENT_DB_CONNECTION_COUNT', 'CONCURRENCY_ROUND_COUNT',
    'ROUND_1_WINNER', 'ROUND_1_ACTIVE_APPOINTMENT_COUNT', 'ROUND_2_WINNER', 'ROUND_2_ACTIVE_APPOINTMENT_COUNT', 'ROUND_3_WINNER', 'ROUND_3_ACTIVE_APPOINTMENT_COUNT',
    'HT_WIN_COUNT', 'HT_WIN_PROVENANCE_RESULT', 'BOTH_SUCCESS_COUNT', 'DEADLOCK_COUNT', 'TIMEOUT_COUNT',
    'LOSING_HT_PARTIAL_CUSTOMER_COUNT', 'LOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT', 'LOSING_HT_PARTIAL_APPOINTMENT_COUNT', 'NO_ENCOUNTER_AUTOCREATE_RESULT', 'NO_EXTERNAL_SIDE_EFFECT_RESULT'
  ],
  '15-app-ht-slice4-block2.env': ['HT_SLICE4_BLOCK2_APP_RESULT', 'BLOCK2_APPLICATION_RESULT'],
  '16-app-ht-slice4-block1.env': ['HT_SLICE4_BLOCK1_APP_RESULT', 'BLOCK1_REGRESSION'],
  '17-app-ht-foundation.env': ['HT_FOUNDATION_APP_RESULT', 'FOUNDATION_REGRESSION'],
  '18-app-ht-slice3.env': ['HT_SLICE3_APP_RESULT', 'SLICE3_REGRESSION'],
  '19-app-clinic-domain.env': ['CLINIC_DOMAIN_APP_RESULT'],
  '20-app-clinic-contracts.env': ['CLINIC_APPLICATION_CONTRACTS_APP_RESULT'],
  '21-app-clinic-operational.env': ['CLINIC_OPERATIONAL_APP_RESULT'],
  '22-app-clinic-workspace.env': ['CLINIC_WORKSPACE_APP_RESULT'],
  '22b-app-clinic-summary.env': ['CLINIC_REGRESSION'],
  '23-app-ht-slice2.env': ['HT_SLICE2_APP_RESULT', 'SLICE2_REGRESSION'],
  '24-typecheck.env': ['TYPECHECK_RESULT'],
  '25-lint.env': ['LINT_RESULT'],
  '26-build.env': ['BUILD_RESULT'],
  '27-secret-scan.env': ['SECRET_SCAN_RESULT'],
  '28-containment.env': ['REMOTE_SUPABASE_ACCESS_COUNT', 'SHARED_STAGING_ACCESS_COUNT', 'PRODUCTION_ACCESS_COUNT', 'DEPLOYMENT_COUNT', 'CONTROL_PLANE_MUTATION_COUNT', 'AOS_MUTATION_COUNT']
};

export function aggregateEvidence(targetDir = artifactsDir) {
  console.log('=== CANONICAL EVIDENCE AGGREGATOR RUNNING (R9-R1.2 CONSISTENT) ===');
  const kv = new Map();
  const keyOwnerMap = new Map();
  const globalKeyToOwner = new Map();

  // Verify manifest count is exactly 30
  const fragCount = Object.keys(phaseFragmentOwners).length;
  if (fragCount !== 30) {
    throw new Error(`MANIFEST_ERROR: Expected exactly 30 fragment files, found ${fragCount}`);
  }

  // Build global reverse lookup map
  for (const [fragFile, ownedKeys] of Object.entries(phaseFragmentOwners)) {
    for (const k of ownedKeys) {
      if (globalKeyToOwner.has(k)) {
        throw new Error(`SCHEMA_ERROR: Key "${k}" declared under multiple fragment owners!`);
      }
      globalKeyToOwner.set(k, fragFile);
    }
  }

  // 1. Process each mandatory fragment file individually
  for (const [fragFile, ownedKeys] of Object.entries(phaseFragmentOwners)) {
    const fragPath = path.join(targetDir, fragFile);

    if (!fs.existsSync(fragPath)) {
      throw new Error(`MISSING_MANDATORY_FRAGMENT: Fragment file "${fragFile}" absent from ${targetDir}`);
    }

    const fileKeys = new Set();
    const lines = fs.readFileSync(fragPath, 'utf8').split('\n');

    for (let lNum = 0; lNum < lines.length; lNum++) {
      const line = lines[lNum].trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        throw new Error(`MALFORMED_LINE: Bare/unassigned line "${line}" at line ${lNum + 1} in ${fragFile}`);
      }
      const k = line.substring(0, eqIdx).trim();
      const v = line.substring(eqIdx + 1).trim();

      // Check if key is allowed for this fragment
      if (!ownedKeys.includes(k) && !k.endsWith('_NOT_EXECUTED_REASON') && !k.endsWith('_FAILURE_REASON')) {
        throw new Error(`WRONG_OWNER_KEY_REJECTED: Key "${k}" in ${fragFile} is not owned by this fragment!`);
      }

      // Check for intra-fragment duplicate key
      if (fileKeys.has(k)) {
        throw new Error(`INTRA_FRAGMENT_DUPLICATE_REJECTED: Duplicate key "${k}" inside ${fragFile}`);
      }
      fileKeys.add(k);

      // Check for cross-fragment duplicate key
      if (keyOwnerMap.has(k)) {
        throw new Error(`CROSS_FRAGMENT_DUPLICATE_REJECTED: Key "${k}" found in both ${keyOwnerMap.get(k)} and ${fragFile}`);
      }
      keyOwnerMap.set(k, fragFile);
      kv.set(k, v);
    }

    // Verify all declared owned keys exist in fragment
    for (const k of ownedKeys) {
      if (!kv.has(k)) {
        throw new Error(`MISSING_KEY_IN_FRAGMENT: Fragment ${fragFile} did not provide key "${k}"`);
      }
    }
  }

  // Validate containment counts: must be numeric '0' for PASS
  const containmentKeys = phaseFragmentOwners['28-containment.env'];
  for (const k of containmentKeys) {
    const val = kv.get(k);
    if (!/^\d+$/.test(val)) {
      throw new Error(`INVALID_NUMERIC_VALUE: Key "${k}" has non-numeric value "${val}"`);
    }
  }

  // 2. Derive FIRST_FATAL strictly from actual FAIL steps (NOT_EXECUTED is NEVER a cause!)
  let firstFatalStep = '';
  let firstFatalReason = '';

  const executionOrderKeys = [
    ...phaseFragmentOwners['01-migration.env'],
    ...phaseFragmentOwners['02-commercial.env'],
    ...phaseFragmentOwners['03-r9-selftest.env'],
    ...phaseFragmentOwners['04-uuid-static.env'],
    ...phaseFragmentOwners['05-arity-static.env'],
    ...phaseFragmentOwners['06-pgtap-foundation.env'],
    ...phaseFragmentOwners['07-pgtap-slice3.env'],
    ...phaseFragmentOwners['08-pgtap-slice4-block1.env'],
    ...phaseFragmentOwners['09-pgtap-slice4-block2.env'],
    ...phaseFragmentOwners['10-pgtap-clinic-domain.env'],
    ...phaseFragmentOwners['11-pgtap-clinic-ops.env'],
    ...phaseFragmentOwners['12-pgtap-clinic-hardening.env'],
    ...phaseFragmentOwners['13-pgtap-public-booking.env'],
    ...phaseFragmentOwners['14-concurrency.env'],
    ...phaseFragmentOwners['15-app-ht-slice4-block2.env'],
    ...phaseFragmentOwners['16-app-ht-slice4-block1.env'],
    ...phaseFragmentOwners['17-app-ht-foundation.env'],
    ...phaseFragmentOwners['18-app-ht-slice3.env'],
    ...phaseFragmentOwners['19-app-clinic-domain.env'],
    ...phaseFragmentOwners['20-app-clinic-contracts.env'],
    ...phaseFragmentOwners['21-app-clinic-operational.env'],
    ...phaseFragmentOwners['22-app-clinic-workspace.env'],
    ...phaseFragmentOwners['23-app-ht-slice2.env'],
    ...phaseFragmentOwners['24-typecheck.env'],
    ...phaseFragmentOwners['25-lint.env'],
    ...phaseFragmentOwners['26-build.env'],
    ...phaseFragmentOwners['27-secret-scan.env']
  ];

  for (const k of executionOrderKeys) {
    const v = kv.get(k);
    if (v === 'FAIL' && !firstFatalStep) {
      firstFatalStep = k;
      const explicitReason = kv.get(`${k}_FAILURE_REASON`);
      if (!explicitReason) {
        throw new Error(`MISSING_FAILURE_REASON_REJECTED: Step "${k}" reported FAIL without explicit "${k}_FAILURE_REASON"!`);
      }
      firstFatalReason = explicitReason;
    }
  }

  kv.set('FIRST_FATAL_STEP_IF_ANY', firstFatalStep);
  kv.set('FIRST_FATAL_REASON_IF_ANY', firstFatalReason);

  // 3. Evaluate Composite Acceptance Gate
  let compositePass = true;

  // 1. Static Contracts
  if (kv.get('FIXTURE_UUID_STATIC_RESULT') !== 'PASS' || kv.get('INVALID_UUID_DISTINCT_COUNT') !== '0' || kv.get('INVALID_UUID_OCCURRENCE_COUNT') !== '0') compositePass = false;
  if (kv.get('FIXTURE_ARITY_STATIC_RESULT') !== 'PASS' || kv.get('ARITY_MISMATCH_DISTINCT_COUNT') !== '0' || kv.get('ARITY_MISMATCH_OCCURRENCE_COUNT') !== '0' || kv.get('ARITY_UNSUPPORTED_STATEMENT_COUNT') !== '0') compositePass = false;
  if (kv.get('R9_SELFTEST_RESULT') !== 'PASS') compositePass = false;

  // 2. Migration & Commercial Verification
  if (kv.get('MIGRATION_REPLAY_RESULT') !== 'PASS' || kv.get('MIGRATION_COUNT') !== '69/69') compositePass = false;
  const commercialKeys = phaseFragmentOwners['02-commercial.env'];
  for (const k of commercialKeys) {
    if (kv.get(k) !== 'PASS') compositePass = false;
  }

  // 3. 8 pgTAP DB Suites
  const suitePrefixes = ['FOUNDATION', 'SLICE3', 'SLICE4_BLOCK1', 'SLICE4_BLOCK2', 'CLINIC_DOMAIN', 'CLINIC_OPS', 'CLINIC_HARDENING', 'PUBLIC_BOOKING'];
  for (const p of suitePrefixes) {
    const planned = parseInt(kv.get(`${p}_PGTAP_PLANNED_COUNT`), 10);
    const executed = parseInt(kv.get(`${p}_PGTAP_EXECUTED_COUNT`), 10);
    const passed = parseInt(kv.get(`${p}_PGTAP_PASSED_COUNT`), 10);
    const failed = parseInt(kv.get(`${p}_PGTAP_FAILED_COUNT`), 10);
    const result = kv.get(`${p}_PGTAP_RESULT`);

    if (result !== 'PASS' || planned <= 0 || executed !== planned || passed !== planned || failed !== 0) {
      compositePass = false;
    }
  }
  if (kv.get('ZERO_TEST_SUITE_COUNT') !== '0' || kv.get('PGTAP_PHASE_RESULT') !== 'PASS') compositePass = false;

  // 4. Concurrency
  if (kv.get('REAL_TWO_SESSION_CONCURRENCY_RESULT') !== 'PASS' || kv.get('CONTROLLER_LOCK_BARRIER_RESULT') !== 'PASS' || kv.get('BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT') !== 'PASS' || kv.get('INDEPENDENT_DB_CONNECTION_COUNT') !== '2' || kv.get('CONCURRENCY_ROUND_COUNT') !== '3' || kv.get('BOTH_SUCCESS_COUNT') !== '0' || kv.get('DEADLOCK_COUNT') !== '0' || kv.get('TIMEOUT_COUNT') !== '0' || kv.get('LOSING_HT_PARTIAL_CUSTOMER_COUNT') !== '0' || kv.get('LOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT') !== '0' || kv.get('LOSING_HT_PARTIAL_APPOINTMENT_COUNT') !== '0' || kv.get('NO_ENCOUNTER_AUTOCREATE_RESULT') !== 'PASS' || kv.get('NO_EXTERNAL_SIDE_EFFECT_RESULT') !== 'PASS') {
    compositePass = false;
  }

  // 5. HT Provenance Rule Enforcement
  const htProv = kv.get('HT_WIN_PROVENANCE_RESULT');
  const b1Result = kv.get('SLICE4_BLOCK1_PGTAP_RESULT');
  if (htProv === 'PASS') {
    // Valid
  } else if (htProv === 'NOT_OBSERVED' && b1Result === 'PASS') {
    // Valid
  } else {
    compositePass = false;
  }

  // 6. Application Commands & Regressions
  const appIndividualKeys = ['HT_SLICE4_BLOCK2_APP_RESULT', 'HT_SLICE4_BLOCK1_APP_RESULT', 'HT_FOUNDATION_APP_RESULT', 'HT_SLICE3_APP_RESULT', 'CLINIC_DOMAIN_APP_RESULT', 'CLINIC_APPLICATION_CONTRACTS_APP_RESULT', 'CLINIC_OPERATIONAL_APP_RESULT', 'CLINIC_WORKSPACE_APP_RESULT', 'HT_SLICE2_APP_RESULT'];
  for (const k of appIndividualKeys) {
    if (kv.get(k) !== 'PASS') compositePass = false;
  }

  const appGroupKeys = ['BLOCK2_APPLICATION_RESULT', 'BLOCK1_REGRESSION', 'FOUNDATION_REGRESSION', 'SLICE3_REGRESSION', 'CLINIC_REGRESSION', 'SLICE2_REGRESSION', 'TYPECHECK_RESULT', 'LINT_RESULT', 'BUILD_RESULT', 'SECRET_SCAN_RESULT'];
  for (const k of appGroupKeys) {
    if (kv.get(k) !== 'PASS') compositePass = false;
  }

  // 7. Containment
  for (const k of containmentKeys) {
    if (kv.get(k) !== '0') compositePass = false;
  }

  kv.set('SLICE4_E2_RESULT', compositePass ? 'PASS_CANDIDATE' : 'FAIL');
  kv.set('CONTROLLER_REVIEW_REQUIRED', 'YES');

  // Re-read & Validate output string before writing
  let outputStr = '';
  for (const [k, v] of kv.entries()) {
    outputStr += `${k}=${v}\n`;
  }

  fs.writeFileSync(path.join(targetDir, 'results.env'), outputStr);
  console.log('✅ Canonical results.env generated and validated.');
  return compositePass;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  aggregateEvidence();
}
