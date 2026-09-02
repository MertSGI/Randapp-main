// ============================================================================
// HARDENED SELF-TEST MATRIX FOR SCANNER & AGGREGATOR (R9-R1.3)
// File: scripts/test-r9-contracts-selftest.mjs
// Purpose:
//   Executes comprehensive positive and adversarial unit tests for 30 fragment ownership,
//   strict enum/integer parsing, conditional reason key ownership, FIRST_FATAL reason
//   preservation, and results.env disk re-read validation.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenizeSql, parseAndVerifyInsertStatements } from './test-health-tourism-slice4-fixture-arity-contract.mjs';
import { aggregateEvidence, phaseFragmentOwners } from './aggregate-lari-e2-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testArityScannerAdversarial() {
  console.log('--- Testing Arity Scanner Positive & Adversarial Cases (R9-R1.3) ---');

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

  // 6. Double Quoted Identifiers
  const sql6 = `INSERT INTO "public"."table6" ("col1", "col2") VALUES ('v1', 'v2');`;
  const res6 = parseAndVerifyInsertStatements(tokenizeSql(sql6, 'sql6.sql'), 'sql6.sql');
  if (res6.checkedInserts !== 1 || res6.mismatchOccurrences !== 0) throw new Error('Failed double quoted identifiers');

  // 7. Tagged & Untagged Dollar Quotes DO
  const sql7 = `
    DO $tag$
    BEGIN
      INSERT INTO public.t7 (c1, c2) VALUES ('v1', 'v2');
    END $tag$;
  `;
  const res7 = parseAndVerifyInsertStatements(tokenizeSql(sql7, 'sql7.sql'), 'sql7.sql');
  if (res7.checkedInserts !== 1 || res7.mismatchOccurrences !== 0) throw new Error('Failed tagged dollar quote DO block');

  // 8. Static EXECUTE String (Valid)
  const sql8 = `EXECUTE 'INSERT INTO public.t8 (c1, c2) VALUES (''v1'', ''v2'')';`;
  const res8 = parseAndVerifyInsertStatements(tokenizeSql(sql8, 'sql8.sql'), 'sql8.sql');
  if (res8.checkedInserts !== 1 || res8.mismatchOccurrences !== 0) throw new Error('Failed static EXECUTE valid');

  // 9. Static EXECUTE String (Mismatch)
  const sql9 = `EXECUTE 'INSERT INTO public.t9 (c1, c2) VALUES (''v1'', ''v2'', ''v3'')';`;
  const res9 = parseAndVerifyInsertStatements(tokenizeSql(sql9, 'sql9.sql'), 'sql9.sql');
  if (res9.mismatchOccurrences !== 1) throw new Error('Failed static EXECUTE mismatch');

  // 10. Dynamic EXECUTE Variable / Concatenation Unsupported
  const sql10 = `EXECUTE 'INSERT INTO public.t10 (c1) VALUES (' || v_var || ')';`;
  const res10 = parseAndVerifyInsertStatements(tokenizeSql(sql10, 'sql10.sql'), 'sql10.sql');
  if (res10.unsupportedCount !== 1) throw new Error('Failed dynamic EXECUTE unsupported check');

  // 11. No Column List INSERT VALUES Unsupported
  const sql11 = `INSERT INTO public.t11 VALUES ('v1', 'v2');`;
  const res11 = parseAndVerifyInsertStatements(tokenizeSql(sql11, 'sql11.sql'), 'sql11.sql');
  if (res11.unsupportedCount !== 1) throw new Error('Failed no column list INSERT VALUES unsupported check');

  // 12. INSERT ... SELECT Handled
  const sql12 = `INSERT INTO public.t12 (c1, c2) SELECT col1, col2 FROM public.other;`;
  const res12 = parseAndVerifyInsertStatements(tokenizeSql(sql12, 'sql12.sql'), 'sql12.sql');
  if (res12.nonValuesInserts !== 1) throw new Error('Failed INSERT...SELECT handling');

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
  fs.writeFileSync(path.join(targetDir, '09-pgtap-slice4-block2.env'), 'SLICE4_BLOCK2_PGTAP_PLANNED_COUNT=20\nSLICE4_BLOCK2_PGTAP_EXECUTED_COUNT=20\nSLICE4_BLOCK2_PGTAP_COUNT=20\nSLICE4_BLOCK2_PGTAP_PASSED_COUNT=20\nSLICE4_BLOCK2_PGTAP_FAILED_COUNT=0\nSLICE4_BLOCK2_PGTAP_RESULT=PASS\nSLICE4_BLOCK2_PGTAP_FAILURE_CLASS=NONE\n');
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
  console.log('--- Testing Evidence Aggregator Fragment Ownership & Adversarial Cases (R9-R1.3) ---');
  const tempDir = path.join(__dirname, '../scratch/test-aggregator-fragments-tmp');

  // 1. Positive Full Set PASS (30 Fragments)
  writeValidPhaseFragments(tempDir);
  const passRes = aggregateEvidence(tempDir);
  if (!passRes) throw new Error('Failed full valid positive evidence set across 30 separate fragments');

  // 2. Unknown Fragment Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '99-injected.env'), 'INJECTED_KEY=PASS\n');
  let unkFragCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('UNKNOWN_FRAGMENT_REJECTED')) unkFragCaught = true; }
  if (!unkFragCaught) throw new Error('Failed unknown fragment rejection');

  // 3. Wrong Owner Failure Reason Key Rejection
  writeValidPhaseFragments(tempDir);
  fs.appendFileSync(path.join(tempDir, '01-migration.env'), 'TYPECHECK_RESULT_FAILURE_REASON=WRONG_FILE\n');
  let wrongReasonOwnerCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) wrongReasonOwnerCaught = true; }
  if (!wrongReasonOwnerCaught) throw new Error('Failed wrong owner failure reason key rejection');

  // 4. Invalid Enum Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=MAYBE\n');
  let invalidEnumCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_ENUM_VALIDATION_FAILED')) invalidEnumCaught = true; }
  if (!invalidEnumCaught) throw new Error('Failed invalid enum rejection');

  // 5. Invalid Integer Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=40junk\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  let invalidIntCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_INTEGER_VALIDATION_FAILED')) invalidIntCaught = true; }
  if (!invalidIntCaught) throw new Error('Failed invalid integer rejection');

  // 6. FIRST_FATAL Preserves Explicit Failure Reason Exactly
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  aggregateEvidence(tempDir);
  const resEnv1 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv1.includes('FIRST_FATAL_REASON_IF_ANY=ASSERTION_38_PAST_SLOT_DENIED_FAILED')) {
    throw new Error('FIRST_FATAL failed to preserve exact explicit failure reason value!');
  }

  // 7. Missing Failure Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\n');
  let missingReasonCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_FAILURE_REASON_REJECTED')) missingReasonCaught = true; }
  if (!missingReasonCaught) throw new Error('Failed missing explicit failure reason rejection');

  // 8. Missing NOT_EXECUTED Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=NOT_EXECUTED\n');
  let missingNotExecCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_NOT_EXECUTED_REASON_REJECTED')) missingNotExecCaught = true; }
  if (!missingNotExecCaught) throw new Error('Failed missing explicit NOT_EXECUTED reason rejection');

  // 9. pgTAP COUNT != EXECUTED Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=32\nFOUNDATION_PGTAP_EXECUTED_COUNT=32\nFOUNDATION_PGTAP_COUNT=30\nFOUNDATION_PGTAP_PASSED_COUNT=32\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=PASS\nFOUNDATION_PGTAP_FAILURE_CLASS=NONE\n');
  const countRes = aggregateEvidence(tempDir);
  if (countRes !== false) throw new Error('pgTAP COUNT != EXECUTED must fail composite gate');

  // 10. Concurrency Round Active Count != 1 Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=2\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const concRes = aggregateEvidence(tempDir);
  if (concRes !== false) throw new Error('Concurrency round active count != 1 must fail composite gate');

  console.log('✅ Evidence aggregator 30-fragment & R9-R1.3 consistency self-tests PASSED.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  console.log('\n🎉 ALL HARDENED R9-R1.3 CONTRACT SELF-TESTS PASSED!');
}

main();
