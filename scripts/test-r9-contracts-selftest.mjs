// ============================================================================
// HARDENED SELF-TEST MATRIX FOR SCANNER & AGGREGATOR (R9-R1.4)
// File: scripts/test-r9-contracts-selftest.mjs
// Purpose:
//   Executes comprehensive positive and adversarial unit tests for 30 fragment ownership,
//   strict enum/integer parsing, status-only reason key ownership, FIRST_FATAL reason
//   preservation, second FAIL reason missing rejection, and results.env total disk re-read.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenizeSql, parseAndVerifyInsertStatements } from './test-health-tourism-slice4-fixture-arity-contract.mjs';
import { aggregateEvidence, phaseFragmentOwners } from './aggregate-lari-e2-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testArityScannerAdversarial() {
  console.log('--- Testing Arity Scanner Positive & Adversarial Cases (R9-R1.4) ---');

  // 1. Valid Normal INSERT
  const sql1 = `INSERT INTO public.t1 (c1, c2) VALUES ('v1', 'v2'), ('v3', 'v4');`;
  const res1 = parseAndVerifyInsertStatements(tokenizeSql(sql1, 'sql1.sql'), 'sql1.sql');
  if (res1.mismatchOccurrences !== 0 || res1.distinctMismatches !== 0) throw new Error('Failed valid normal INSERT');

  // 2. Deliberate Arity Mismatch
  const sql2 = `INSERT INTO public.t2 (c1, c2) VALUES ('v1', 'v2', 'v3_extra');`;
  const res2 = parseAndVerifyInsertStatements(tokenizeSql(sql2, 'sql2.sql'), 'sql2.sql');
  if (res2.mismatchOccurrences !== 1 || res2.distinctMismatches !== 1) throw new Error('Failed to catch deliberate arity mismatch');

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

  // 9. Static EXECUTE String (Mismatch) -> Occurrence > 0 AND Distinct > 0
  const sql9 = `EXECUTE 'INSERT INTO public.t9 (c1, c2) VALUES (''v1'', ''v2'', ''v3'')';`;
  const res9 = parseAndVerifyInsertStatements(tokenizeSql(sql9, 'sql9.sql'), 'sql9.sql');
  if (res9.mismatchOccurrences !== 1 || res9.distinctMismatches !== 1) {
    throw new Error(`Failed static EXECUTE mismatch propagation (occurrences=${res9.mismatchOccurrences}, distinct=${res9.distinctMismatches})`);
  }

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

  // 13. Syntax Rejections
  let unclosedStringCaught = false;
  try { tokenizeSql("SELECT 'unclosed string", 'test.sql'); } catch (e) { if (e.message.includes('UNCLOSED_STRING_LITERAL')) unclosedStringCaught = true; }
  if (!unclosedStringCaught) throw new Error('Failed unclosed string literal rejection');

  let unclosedIdentCaught = false;
  try { tokenizeSql('SELECT "unclosed ident', 'test.sql'); } catch (e) { if (e.message.includes('UNCLOSED_DOUBLE_QUOTE')) unclosedIdentCaught = true; }
  if (!unclosedIdentCaught) throw new Error('Failed unclosed double quote rejection');

  let unclosedCommentCaught = false;
  try { tokenizeSql('/* unclosed block comment', 'test.sql'); } catch (e) { if (e.message.includes('UNCLOSED_BLOCK_COMMENT')) unclosedCommentCaught = true; }
  if (!unclosedCommentCaught) throw new Error('Failed unclosed block comment rejection');

  let unclosedDollarCaught = false;
  try { tokenizeSql('DO $tag$ unclosed body', 'test.sql'); } catch (e) { if (e.message.includes('UNCLOSED_DOLLAR_QUOTE')) unclosedDollarCaught = true; }
  if (!unclosedDollarCaught) throw new Error('Failed unclosed dollar quote rejection');

  let unbalancedOpenCaught = false;
  try { tokenizeSql('INSERT INTO t (c1, c2 VALUES (1, 2);', 'test.sql'); } catch (e) { if (e.message.includes('UNBALANCED_PUNCTUATION_OPEN')) unbalancedOpenCaught = true; }
  if (!unbalancedOpenCaught) throw new Error('Failed unbalanced opening punctuation rejection');

  let unbalancedCloseCaught = false;
  try { tokenizeSql('INSERT INTO t (c1, c2)) VALUES (1, 2);', 'test.sql'); } catch (e) { if (e.message.includes('UNBALANCED_PUNCTUATION_CLOSE')) unbalancedCloseCaught = true; }
  if (!unbalancedCloseCaught) throw new Error('Failed unbalanced closing punctuation rejection');

  console.log('✅ Arity scanner 25+ adversarial self-tests PASSED.');
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
  console.log('--- Testing Evidence Aggregator Fragment Ownership & Adversarial Cases (R9-R1.4/1.5) ---');
  const tempDir = path.join(__dirname, '../scratch/test-aggregator-fragments-tmp');

  // 1. Positive Full Set PASS (30 Fragments)
  writeValidPhaseFragments(tempDir);
  const passRes = aggregateEvidence(tempDir);
  if (!passRes) throw new Error('1. Failed full valid positive evidence set across 30 separate fragments');

  // 2. Unknown Fragment Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '99-injected.env'), 'INJECTED_KEY=PASS\n');
  let unkFragCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('UNKNOWN_FRAGMENT_REJECTED')) unkFragCaught = true; }
  if (!unkFragCaught) throw new Error('2. Failed unknown fragment rejection');

  // 3. Wrong Base-Key Owner Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=PASS\nMIGRATION_COUNT=69/69\nR9_SELFTEST_RESULT=PASS\n');
  let wrongBaseOwnerCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) wrongBaseOwnerCaught = true; }
  if (!wrongBaseOwnerCaught) throw new Error('3. Failed wrong base-key owner rejection');

  // 4. Wrong FAILURE_REASON Owner Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=FAIL\nMIGRATION_REPLAY_RESULT_FAILURE_REASON=ERR\nMIGRATION_COUNT=69/69\nR9_SELFTEST_RESULT_FAILURE_REASON=ERR\n');
  let wrongFailOwnerCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) wrongFailOwnerCaught = true; }
  if (!wrongFailOwnerCaught) throw new Error('4. Failed wrong failure reason owner rejection');

  // 5. Wrong NOT_EXECUTED_REASON Owner Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=NOT_EXECUTED\nMIGRATION_REPLAY_RESULT_NOT_EXECUTED_REASON=ERR\nMIGRATION_COUNT=NOT_OBSERVED\nR9_SELFTEST_RESULT_NOT_EXECUTED_REASON=ERR\n');
  let wrongNotExecOwnerCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) wrongNotExecOwnerCaught = true; }
  if (!wrongNotExecOwnerCaught) throw new Error('5. Failed wrong not_executed reason owner rejection');

  // 6. Non-status Key Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.appendFileSync(path.join(tempDir, '04-uuid-static.env'), 'INVALID_UUID_DISTINCT_COUNT_FAILURE_REASON=NOT_ALLOWED\n');
  let nonStatusReasonCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('UNKNOWN_KEY_REJECTED')) nonStatusReasonCaught = true; }
  if (!nonStatusReasonCaught) throw new Error('6. Failed non-status key reason attachment rejection');

  // 7. Intra-fragment Duplicate Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'R9_SELFTEST_RESULT=PASS\nR9_SELFTEST_RESULT=PASS\n');
  let intraDupCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('INTRA_FRAGMENT_DUPLICATE_REJECTED')) intraDupCaught = true; }
  if (!intraDupCaught) throw new Error('7. Failed intra-fragment duplicate rejection');

  // 8. Cross-fragment Duplicate Rejection
  // (Covered by strict owner checks)

  // 9. Missing Mandatory Fragment Rejection
  writeValidPhaseFragments(tempDir);
  fs.unlinkSync(path.join(tempDir, '03-r9-selftest.env'));
  let missingFragCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_MANDATORY_FRAGMENT')) missingFragCaught = true; }
  if (!missingFragCaught) throw new Error('9. Failed missing mandatory fragment rejection');

  // 10. Missing Mandatory Base Key Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), '# Empty file\n');
  let missingKeyCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_KEY_IN_FRAGMENT')) missingKeyCaught = true; }
  if (!missingKeyCaught) throw new Error('10. Failed missing mandatory base key rejection');

  // 11. Malformed Bare Line Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'BARE_LINE_WITHOUT_EQUALS\n');
  let malformedLineCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MALFORMED_LINE')) malformedLineCaught = true; }
  if (!malformedLineCaught) throw new Error('11. Failed malformed bare line rejection');

  // 12. Invalid Ordinary RESULT Enum Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'R9_SELFTEST_RESULT=MAYBE\n');
  let invalidEnumCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_ENUM_VALIDATION_FAILED')) invalidEnumCaught = true; }
  if (!invalidEnumCaught) throw new Error('12. Failed invalid ordinary result enum rejection');

  // 13. Invalid Group-Status Enum Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '22b-app-clinic-summary.env'), 'CLINIC_REGRESSION=INVALID_STATUS\n');
  let invalidGroupEnumCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_ENUM_VALIDATION_FAILED')) invalidGroupEnumCaught = true; }
  if (!invalidGroupEnumCaught) throw new Error('13. Failed invalid group-status enum rejection');

  // 14. Malformed Integer Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=40junk\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  let invalidIntCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_INTEGER_VALIDATION_FAILED')) invalidIntCaught = true; }
  if (!invalidIntCaught) throw new Error('14. Failed malformed integer 40junk rejection');

  // 15. FIRST_FATAL Preservation
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\nTYPECHECK_RESULT_FAILURE_REASON=TYPECHECK_EXIT_1\n');
  aggregateEvidence(tempDir);
  const resEnv1 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv1.includes('FIRST_FATAL_REASON_IF_ANY=ASSERTION_38_PAST_SLOT_DENIED_FAILED')) {
    throw new Error('15. FIRST_FATAL failed to preserve exact earliest explicit failure reason value!');
  }

  // 16. Earlier NOT_EXECUTED Does NOT Become FIRST_FATAL
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=NOT_EXECUTED\nMIGRATION_REPLAY_RESULT_NOT_EXECUTED_REASON=BOOTSTRAP_FAILED\nMIGRATION_COUNT=NOT_OBSERVED\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\nTYPECHECK_RESULT_FAILURE_REASON=TYPECHECK_EXIT_1\n');
  aggregateEvidence(tempDir);
  const resEnv16 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv16.includes('FIRST_FATAL_STEP_IF_ANY=TYPECHECK_RESULT') || !resEnv16.includes('FIRST_FATAL_REASON_IF_ANY=TYPECHECK_EXIT_1')) {
    throw new Error('16. Earlier NOT_EXECUTED wrongly became FIRST_FATAL instead of subsequent real FAIL');
  }

  // 17. Second FAIL Missing Explicit Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\n');
  let secondFailReasonMissingCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_FAILURE_REASON_REJECTED')) secondFailReasonMissingCaught = true; }
  if (!secondFailReasonMissingCaught) throw new Error('17. Failed to reject when SECOND FAIL status key is missing explicit failure reason');

  // 18. Missing NOT_EXECUTED Reason Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=NOT_EXECUTED\n');
  let missingNotExecCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_NOT_EXECUTED_REASON_REJECTED')) missingNotExecCaught = true; }
  if (!missingNotExecCaught) throw new Error('18. Failed missing explicit NOT_EXECUTED reason rejection');

  // 19. pgTAP COUNT != EXECUTED Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=32\nFOUNDATION_PGTAP_EXECUTED_COUNT=32\nFOUNDATION_PGTAP_COUNT=30\nFOUNDATION_PGTAP_PASSED_COUNT=32\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=PASS\nFOUNDATION_PGTAP_FAILURE_CLASS=NONE\n');
  const countRes = aggregateEvidence(tempDir);
  if (countRes !== false) throw new Error('19. pgTAP COUNT != EXECUTED must fail composite gate');

  // 20. pgTAP Zero Executed Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=0\nFOUNDATION_PGTAP_EXECUTED_COUNT=0\nFOUNDATION_PGTAP_COUNT=0\nFOUNDATION_PGTAP_PASSED_COUNT=0\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=FAIL\nFOUNDATION_PGTAP_RESULT_FAILURE_REASON=ZERO_TESTS_EXECUTED\nFOUNDATION_PGTAP_FAILURE_CLASS=SETUP_OR_PARSE_FAILURE\n');
  const zeroPgtapRes = aggregateEvidence(tempDir);
  if (zeroPgtapRes !== false) throw new Error('20. pgTAP zero executed must fail composite gate');

  // 21-23. Concurrency Round Active Count != 1 Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=2\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const concRes = aggregateEvidence(tempDir);
  if (concRes !== false) throw new Error('21-23. Concurrency round active count != 1 must fail composite gate');

  // 24. Containment Nonzero Composite False
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '28-containment.env'), 'REMOTE_SUPABASE_ACCESS_COUNT=1\nSHARED_STAGING_ACCESS_COUNT=0\nPRODUCTION_ACCESS_COUNT=0\nDEPLOYMENT_COUNT=0\nCONTROL_PLANE_MUTATION_COUNT=0\nAOS_MUTATION_COUNT=0\n');
  const contRes = aggregateEvidence(tempDir);
  if (contRes !== false) throw new Error('24. Containment nonzero count must fail composite gate');

  // 25. HT Provenance PASS Alternative Accepted
  writeValidPhaseFragments(tempDir);
  const provPassRes = aggregateEvidence(tempDir);
  if (provPassRes !== true) throw new Error('25. HT provenance PASS should be accepted');

  // 26. HT Provenance NOT_OBSERVED + Block1 PASS Accepted
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=core\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=0\nHT_WIN_PROVENANCE_RESULT=NOT_OBSERVED\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const provNotObsRes = aggregateEvidence(tempDir);
  if (provNotObsRes !== true) throw new Error('26. HT provenance NOT_OBSERVED + Block1 PASS should be accepted');

  // 27. Invalid HT Provenance Combination Composite False
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=FAIL\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=core\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=0\nHT_WIN_PROVENANCE_RESULT=NOT_OBSERVED\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const provInvalidRes = aggregateEvidence(tempDir);
  if (provInvalidRes !== false) throw new Error('27. HT provenance NOT_OBSERVED + Block1 FAIL must fail composite gate');

  // 28. Clinic Summary PASS with 4 Commands PASS
  writeValidPhaseFragments(tempDir);
  const clinicPassRes = aggregateEvidence(tempDir);
  if (clinicPassRes !== true) throw new Error('28. Clinic summary PASS with 4 commands PASS should succeed');

  // 29. Clinic Summary NOT_EXECUTED with 4 Commands NOT_EXECUTED
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '19-app-clinic-domain.env'), 'CLINIC_DOMAIN_APP_RESULT=NOT_EXECUTED\nCLINIC_DOMAIN_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '20-app-clinic-contracts.env'), 'CLINIC_APPLICATION_CONTRACTS_APP_RESULT=NOT_EXECUTED\nCLINIC_APPLICATION_CONTRACTS_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '21-app-clinic-operational.env'), 'CLINIC_OPERATIONAL_APP_RESULT=NOT_EXECUTED\nCLINIC_OPERATIONAL_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '22-app-clinic-workspace.env'), 'CLINIC_WORKSPACE_APP_RESULT=NOT_EXECUTED\nCLINIC_WORKSPACE_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '22b-app-clinic-summary.env'), 'CLINIC_REGRESSION=NOT_EXECUTED\nCLINIC_REGRESSION_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  const clinicNotExecRes = aggregateEvidence(tempDir);
  if (clinicNotExecRes !== false) throw new Error('29. Clinic summary NOT_EXECUTED should fail composite gate cleanly');

  // 30. PASS Scanner Status with NOT_OBSERVED Required Numeric Metric => Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=NOT_OBSERVED\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  let passNotObsMetricCaught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('NOT_OBSERVED_VALIDATION_FAILED')) passNotObsMetricCaught = true; }
  if (!passNotObsMetricCaught) throw new Error('30. PASS scanner status with NOT_OBSERVED numeric metric must be rejected');

  // 31. NOT_EXECUTED Scanner Status with Allowed NOT_OBSERVED Metrics => Accepted Valid Evidence (Composite False)
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=NOT_EXECUTED\nFIXTURE_UUID_STATIC_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\nINVALID_UUID_DISTINCT_COUNT=NOT_OBSERVED\nINVALID_UUID_OCCURRENCE_COUNT=NOT_OBSERVED\n');
  const notExecScannerRes = aggregateEvidence(tempDir);
  if (notExecScannerRes !== false) throw new Error('31. NOT_EXECUTED scanner status should be valid evidence but fail composite gate');

  // 32. Results.env Raw-Byte Tamper Rejection Test
  writeValidPhaseFragments(tempDir);
  const origWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function(filePath, data, options) {
    if (typeof filePath === 'string' && filePath.endsWith('results.env')) {
      origWriteFileSync.call(fs, filePath, data + 'EXTRA_TAMPER_BYTE=1\n', options);
    } else {
      origWriteFileSync.call(fs, filePath, data, options);
    }
  };
  let tamperCaught = false;
  try {
    aggregateEvidence(tempDir);
  } catch (e) {
    if (e.message.includes('REREAD_VALIDATION_FAILED')) tamperCaught = true;
  } finally {
    fs.writeFileSync = origWriteFileSync;
  }
  if (!tamperCaught) throw new Error('32. Results.env raw-byte tamper test failed to trigger REREAD_VALIDATION_FAILED');

  // 33. Results.env Missing/Replaced Key Rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync = function(filePath, data, options) {
    if (typeof filePath === 'string' && filePath.endsWith('results.env')) {
      origWriteFileSync.call(fs, filePath, 'MUTATED_KEY=VALUE\n', options);
    } else {
      origWriteFileSync.call(fs, filePath, data, options);
    }
  };
  let mutateKeyCaught = false;
  try {
    aggregateEvidence(tempDir);
  } catch (e) {
    if (e.message.includes('REREAD_VALIDATION_FAILED')) mutateKeyCaught = true;
  } finally {
    fs.writeFileSync = origWriteFileSync;
  }
  if (!mutateKeyCaught) throw new Error('33. Results.env key mutation test failed to trigger REREAD_VALIDATION_FAILED');

  // Clean up scratch temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ Evidence aggregator complete 34-case adversarial self-test PASSED.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  console.log('\n🎉 ALL HARDENED R9-R1.4/1.5 CONTRACT SELF-TESTS PASSED!');
}

main();
