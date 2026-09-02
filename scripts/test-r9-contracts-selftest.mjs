// ============================================================================
// CONSISTENT SELF-TEST MATRIX FOR SCANNER & AGGREGATOR (R9-R1.2)
// File: scripts/test-r9-contracts-selftest.mjs
// Purpose:
//   Executes positive and adversarial unit tests for 30 fragment ownership,
//   strict FIRST_FATAL reason preservation, and fail-collect dependency models.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenizeSql, parseAndVerifyInsertStatements } from './test-health-tourism-slice4-fixture-arity-contract.mjs';
import { aggregateEvidence, phaseFragmentOwners } from './aggregate-lari-e2-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testArityScannerAdversarial() {
  console.log('--- Testing Arity Scanner Positive & Adversarial Cases ---');

  // 1. Valid Normal INSERT
  const sql1 = `INSERT INTO public.t1 (c1, c2) VALUES ('v1', 'v2'), ('v3', 'v4');`;
  const res1 = parseAndVerifyInsertStatements(tokenizeSql(sql1, 'sql1.sql'), 'sql1.sql');
  if (res1.mismatchOccurrences !== 0) throw new Error('Failed valid normal INSERT');

  // 2. Deliberate Arity Mismatch
  const sql2 = `INSERT INTO public.t2 (c1, c2) VALUES ('v1', 'v2', 'v3_extra');`;
  const res2 = parseAndVerifyInsertStatements(tokenizeSql(sql2, 'sql2.sql'), 'sql2.sql');
  if (res2.mismatchOccurrences !== 1) throw new Error('Failed to catch deliberate arity mismatch');

  // 3. Multi-row VALUES
  const sql3 = `INSERT INTO public.t3 (a, b) VALUES (1, 2), (3, 4), (5, 6);`;
  const res3 = parseAndVerifyInsertStatements(tokenizeSql(sql3, 'sql3.sql'), 'sql3.sql');
  if (res3.checkedInserts !== 1 || res3.mismatchOccurrences !== 0) throw new Error('Failed multi-row VALUES');

  // 4. Commas inside Strings & Escaped Quotes
  const sql4 = `INSERT INTO public.t4 (c1, c2) VALUES ('val, with, commas', 'escaped ''quote'' inside');`;
  const res4 = parseAndVerifyInsertStatements(tokenizeSql(sql4, 'sql4.sql'), 'sql4.sql');
  if (res4.mismatchOccurrences !== 0) throw new Error('Failed commas inside strings or escaped quotes');

  // 5. Line & Block Comments
  const sql5 = `
    -- line comment with comma, and (parens)
    /* block comment with comma, and (parens) */
    INSERT INTO public.t5 (c1, c2) VALUES ('v1', 'v2');
  `;
  const res5 = parseAndVerifyInsertStatements(tokenizeSql(sql5, 'sql5.sql'), 'sql5.sql');
  if (res5.mismatchOccurrences !== 0) throw new Error('Failed line/block comments');

  // 6. Tagged & Untagged Dollar Quotes
  const sql6 = `
    DO $tag$
    BEGIN
      INSERT INTO public.t6 (c1, c2) VALUES ('v1', 'v2');
    END $tag$;
  `;
  const res6 = parseAndVerifyInsertStatements(tokenizeSql(sql6, 'sql6.sql'), 'sql6.sql');
  if (res6.checkedInserts !== 1 || res6.mismatchOccurrences !== 0) throw new Error('Failed tagged dollar quote DO block');

  // 7. Dynamic EXECUTE Fails Closed
  const sql7 = `
    DO $$
    BEGIN
      EXECUTE 'INSERT INTO public.t7 (c1, c2) VALUES (' || quote_literal(v_var) || ')';
    END $$;
  `;
  const res7 = parseAndVerifyInsertStatements(tokenizeSql(sql7, 'sql7.sql'), 'sql7.sql');
  if (res7.unsupportedCount !== 1) throw new Error('Failed dynamic EXECUTE fail-closed check');

  // 8. INSERT ... SELECT Handled
  const sql8 = `INSERT INTO public.t8 (c1, c2) SELECT col1, col2 FROM public.other;`;
  const res8 = parseAndVerifyInsertStatements(tokenizeSql(sql8, 'sql8.sql'), 'sql8.sql');
  if (res8.nonValuesInserts !== 1) throw new Error('Failed INSERT...SELECT handling');

  console.log('✅ Arity scanner adversarial self-tests PASSED.');
}

function writeValidPhaseFragments(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=PASS\nMIGRATION_COUNT=69/69\n');
  fs.writeFileSync(path.join(targetDir, '02-commercial.env'), `COMMERCIAL_BOOTSTRAP_RESULT=PASS\nCOMMERCIAL_ELIGIBILITY_RESULT=PASS\nCOMMERCIAL_CORE_BOOKING_RESULT=PASS\nCOMMERCIAL_STAFF_MANAGEMENT_RESULT=PASS\nCOMMERCIAL_SERVICE_MANAGEMENT_RESULT=PASS\nCOMMERCIAL_LARI_MINISITE_RESULT=PASS\nCOMMERCIAL_MAX_STAFF_RESULT=PASS\nCOMMERCIAL_MAX_SERVICES_RESULT=PASS\nCOMMERCIAL_MAX_BRANCHES_RESULT=PASS\nCOMMERCIAL_MAX_MONTHLY_APPOINTMENTS_RESULT=PASS\nCOMMERCIAL_FIXTURE_RESULT=PASS\nCOMMERCIAL_QUOTA_RESULT=PASS\n`);
  fs.writeFileSync(path.join(targetDir, '03-r9-selftest.env'), 'R9_SELFTEST_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=0\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  fs.writeFileSync(path.join(targetDir, '05-arity-static.env'), 'FIXTURE_ARITY_STATIC_RESULT=PASS\nARITY_CHECKED_INSERT_COUNT=100\nARITY_NON_VALUES_INSERT_COUNT=0\nARITY_MISMATCH_DISTINCT_COUNT=0\nARITY_MISMATCH_OCCURRENCE_COUNT=0\nARITY_UNSUPPORTED_STATEMENT_COUNT=0\n');

  fs.writeFileSync(path.join(targetDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=32\nFOUNDATION_PGTAP_EXECUTED_COUNT=32\nFOUNDATION_PGTAP_COUNT=32\nFOUNDATION_PGTAP_PASSED_COUNT=32\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=PASS\nFOUNDATION_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '07-pgtap-slice3.env'), 'SLICE3_PGTAP_PLANNED_COUNT=40\nSLICE3_PGTAP_EXECUTED_COUNT=40\nSLICE3_PGTAP_COUNT=40\nSLICE3_PGTAP_PASSED_COUNT=40\nSLICE3_PGTAP_FAILED_COUNT=0\nSLICE3_PGTAP_RESULT=PASS\nSLICE3_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=40\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=0\nSLICE4_BLOCK1_PGTAP_RESULT=PASS\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '09-pgtap-slice4-block2.env'), 'SLICE4_BLOCK2_PGTAP_PLANNED_COUNT=20\nSLICE4_BLOCK2_PGTAP_EXECUTED_COUNT=20\nSLICE4_BLOCK2_PGTAP_COUNT=20\nSLICE4_BLOCK2_PASSED_COUNT=20\nSLICE4_BLOCK2_PGTAP_PASSED_COUNT=20\nSLICE4_BLOCK2_PGTAP_FAILED_COUNT=0\nSLICE4_BLOCK2_PGTAP_RESULT=PASS\nSLICE4_BLOCK2_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '10-pgtap-clinic-domain.env'), 'CLINIC_DOMAIN_PGTAP_PLANNED_COUNT=10\nCLINIC_DOMAIN_PGTAP_EXECUTED_COUNT=10\nCLINIC_DOMAIN_PGTAP_COUNT=10\nCLINIC_DOMAIN_PGTAP_PASSED_COUNT=10\nCLINIC_DOMAIN_PGTAP_FAILED_COUNT=0\nCLINIC_DOMAIN_PGTAP_RESULT=PASS\nCLINIC_DOMAIN_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '11-pgtap-clinic-ops.env'), 'CLINIC_OPS_PGTAP_PLANNED_COUNT=10\nCLINIC_OPS_PGTAP_EXECUTED_COUNT=10\nCLINIC_OPS_PGTAP_COUNT=10\nCLINIC_OPS_PGTAP_PASSED_COUNT=10\nCLINIC_OPS_PGTAP_FAILED_COUNT=0\nCLINIC_OPS_PGTAP_RESULT=PASS\nCLINIC_OPS_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '12-pgtap-clinic-hardening.env'), 'CLINIC_HARDENING_PGTAP_PLANNED_COUNT=10\nCLINIC_HARDENING_PGTAP_EXECUTED_COUNT=10\nCLINIC_HARDENING_PGTAP_COUNT=10\nCLINIC_HARDENING_PGTAP_PASSED_COUNT=10\nCLINIC_HARDENING_PGTAP_FAILED_COUNT=0\nCLINIC_HARDENING_PGTAP_RESULT=PASS\nCLINIC_HARDENING_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '13-pgtap-public-booking.env'), 'PUBLIC_BOOKING_PGTAP_PLANNED_COUNT=67\nPUBLIC_BOOKING_PGTAP_EXECUTED_COUNT=67\nPUBLIC_BOOKING_PGTAP_COUNT=67\nPUBLIC_BOOKING_PGTAP_PASSED_COUNT=67\nPUBLIC_BOOKING_PGTAP_FAILED_COUNT=0\nPUBLIC_BOOKING_PGTAP_RESULT=PASS\nPUBLIC_BOOKING_PGTAP_FAILURE_CLASS=NONE\n');
  fs.writeFileSync(path.join(targetDir, '13b-pgtap-summary.env'), 'ZERO_TEST_SUITE_COUNT=0\nPGTAP_PHASE_RESULT=PASS\n');

  fs.writeFileSync(path.join(targetDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);

  fs.writeFileSync(path.join(targetDir, '15-app-ht-slice4-block2.env'), 'HT_SLICE4_BLOCK2_APP_RESULT=PASS\nBLOCK2_APPLICATION_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '16-app-ht-slice4-block1.env'), 'HT_SLICE4_BLOCK1_APP_RESULT=PASS\nBLOCK1_REGRESSION=PASS\n');
  fs.writeFileSync(path.join(targetDir, '17-app-ht-foundation.env'), 'HT_FOUNDATION_APP_RESULT=PASS\nFOUNDATION_REGRESSION=PASS\n');
  fs.writeFileSync(path.join(targetDir, '18-app-ht-slice3.env'), 'HT_SLICE3_APP_RESULT=PASS\nSLICE3_REGRESSION=PASS\n');
  fs.writeFileSync(path.join(targetDir, '19-app-clinic-domain.env'), 'CLINIC_DOMAIN_APP_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '20-app-clinic-contracts.env'), 'CLINIC_APPLICATION_CONTRACTS_APP_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '21-app-clinic-operational.env'), 'CLINIC_OPERATIONAL_APP_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '22-app-clinic-workspace.env'), 'CLINIC_WORKSPACE_APP_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '22b-app-clinic-summary.env'), 'CLINIC_REGRESSION=PASS\n');
  fs.writeFileSync(path.join(targetDir, '23-app-ht-slice2.env'), 'HT_SLICE2_APP_RESULT=PASS\nSLICE2_REGRESSION=PASS\n');

  fs.writeFileSync(path.join(targetDir, '24-typecheck.env'), 'TYPECHECK_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '25-lint.env'), 'LINT_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '26-build.env'), 'BUILD_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '27-secret-scan.env'), 'SECRET_SCAN_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '28-containment.env'), 'REMOTE_SUPABASE_ACCESS_COUNT=0\nSHARED_STAGING_ACCESS_COUNT=0\nPRODUCTION_ACCESS_COUNT=0\nDEPLOYMENT_COUNT=0\nCONTROL_PLANE_MUTATION_COUNT=0\nAOS_MUTATION_COUNT=0\n');
}

function testAggregatorAdversarial() {
  console.log('--- Testing Evidence Aggregator Fragment Ownership & Adversarial Cases ---');
  const tempDir = path.join(__dirname, '../scratch/test-aggregator-fragments-tmp');

  // 1. Positive Full Set PASS (30 Fragments)
  writeValidPhaseFragments(tempDir);
  const passRes = aggregateEvidence(tempDir);
  if (!passRes) throw new Error('Failed full valid positive evidence set across 30 separate fragments');

  // 2. Wrong Owner Key Rejection
  writeValidPhaseFragments(tempDir);
  fs.appendFileSync(path.join(tempDir, '01-migration.env'), 'TYPECHECK_RESULT=PASS\n');
  let wrongOwnerCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) wrongOwnerCaught = true; }
  if (!wrongOwnerCaught) throw new Error('Failed wrong owner key rejection');

  // 3. Intra-Fragment Duplicate Key Rejection
  writeValidPhaseFragments(tempDir);
  fs.appendFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=PASS\n');
  let intraDupCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('INTRA_FRAGMENT_DUPLICATE_REJECTED')) intraDupCaught = true; }
  if (!intraDupCaught) throw new Error('Failed intra-fragment duplicate key rejection');

  // 4. Missing Fragment Rejection
  writeValidPhaseFragments(tempDir);
  fs.unlinkSync(path.join(tempDir, '28-containment.env'));
  let missingFragCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_MANDATORY_FRAGMENT')) missingFragCaught = true; }
  if (!missingFragCaught) throw new Error('Failed missing mandatory fragment rejection');

  // 5. FIRST_FATAL Preserves Explicit Failure Reason Exactly
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  aggregateEvidence(tempDir);
  const resEnv1 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv1.includes('FIRST_FATAL_REASON_IF_ANY=ASSERTION_38_PAST_SLOT_DENIED_FAILED')) {
    throw new Error('FIRST_FATAL failed to preserve exact explicit failure reason value!');
  }

  // 6. Missing Failure Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\n');
  let missingReasonCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_FAILURE_REASON_REJECTED')) missingReasonCaught = true; }
  if (!missingReasonCaught) throw new Error('Failed missing explicit failure reason rejection');

  // 7. Commercial Failure Does NOT Prevent pgTAP Execution in Dependency Model
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '02-commercial.env'), `COMMERCIAL_BOOTSTRAP_RESULT=FAIL\nCOMMERCIAL_BOOTSTRAP_RESULT_FAILURE_REASON=COMMERCIAL_BOOTSTRAP_TENANT_NOT_FOUND\nCOMMERCIAL_ELIGIBILITY_RESULT=FAIL\nCOMMERCIAL_CORE_BOOKING_RESULT=FAIL\nCOMMERCIAL_STAFF_MANAGEMENT_RESULT=FAIL\nCOMMERCIAL_SERVICE_MANAGEMENT_RESULT=FAIL\nCOMMERCIAL_LARI_MINISITE_RESULT=FAIL\nCOMMERCIAL_MAX_STAFF_RESULT=FAIL\nCOMMERCIAL_MAX_SERVICES_RESULT=FAIL\nCOMMERCIAL_MAX_BRANCHES_RESULT=FAIL\nCOMMERCIAL_MAX_MONTHLY_APPOINTMENTS_RESULT=FAIL\nCOMMERCIAL_FIXTURE_RESULT=FAIL\nCOMMERCIAL_QUOTA_RESULT=FAIL\n`);
  const depRes = aggregateEvidence(tempDir);
  if (depRes !== false) throw new Error('Commercial failure must fail final composite gate');
  const resEnv2 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv2.includes('FIRST_FATAL_STEP_IF_ANY=COMMERCIAL_BOOTSTRAP_RESULT') || !resEnv2.includes('FIRST_FATAL_REASON_IF_ANY=COMMERCIAL_BOOTSTRAP_TENANT_NOT_FOUND')) {
    throw new Error('FIRST_FATAL failed for commercial failure');
  }

  console.log('✅ Evidence aggregator 30-fragment & consistency self-tests PASSED.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  console.log('\n🎉 ALL HARDENED R9-R1.2 CONTRACT SELF-TESTS PASSED!');
}

main();
