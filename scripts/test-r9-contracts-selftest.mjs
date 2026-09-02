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
  console.log('--- Testing Arity Scanner 25 Distinct Executable Cases (R9-R1.6) ---');

  // Case 1: normal valid INSERT
  const sql1 = `INSERT INTO public.t1 (c1, c2) VALUES ('v1', 'v2'), ('v3', 'v4');`;
  const res1 = parseAndVerifyInsertStatements(tokenizeSql(sql1, 'sql1.sql'), 'sql1.sql');
  if (res1.checkedInserts !== 1 || res1.mismatchOccurrences !== 0 || res1.distinctMismatches !== 0) throw new Error('Case 1 failed: normal valid INSERT');

  // Case 2: normal arity mismatch
  const sql2 = `INSERT INTO public.t2 (c1, c2) VALUES ('v1', 'v2', 'v3_extra');`;
  const res2 = parseAndVerifyInsertStatements(tokenizeSql(sql2, 'sql2.sql'), 'sql2.sql');
  if (res2.mismatchOccurrences !== 1 || res2.distinctMismatches !== 1) throw new Error('Case 2 failed: normal mismatch');

  // Case 3: multi-row VALUES
  const sql3 = `INSERT INTO public.t3 (a, b) VALUES (1, 2), (3, 4), (5, 6);`;
  const res3 = parseAndVerifyInsertStatements(tokenizeSql(sql3, 'sql3.sql'), 'sql3.sql');
  if (res3.checkedInserts !== 1 || res3.mismatchOccurrences !== 0) throw new Error('Case 3 failed: multi-row VALUES');

  // Case 4: comma inside string
  const sql4 = `INSERT INTO public.t4 (c1, c2) VALUES ('val, with, commas', 'another string');`;
  const res4 = parseAndVerifyInsertStatements(tokenizeSql(sql4, 'sql4.sql'), 'sql4.sql');
  if (res4.mismatchOccurrences !== 0) throw new Error('Case 4 failed: comma inside string');

  // Case 5: escaped quote inside string
  const sql5 = `INSERT INTO public.t5 (c1, c2) VALUES ('escaped ''quote'' inside', 'normal val');`;
  const res5 = parseAndVerifyInsertStatements(tokenizeSql(sql5, 'sql5.sql'), 'sql5.sql');
  if (res5.mismatchOccurrences !== 0) throw new Error('Case 5 failed: escaped quote inside string');

  // Case 6: line comment
  const sql6 = `
    -- line comment with comma, and (parens)
    INSERT INTO public.t6 (c1, c2) VALUES ('v1', 'v2');
  `;
  const res6 = parseAndVerifyInsertStatements(tokenizeSql(sql6, 'sql6.sql'), 'sql6.sql');
  if (res6.mismatchOccurrences !== 0) throw new Error('Case 6 failed: line comment');

  // Case 7: block comment
  const sql7 = `
    /* block comment with comma, and (parens) */
    INSERT INTO public.t7 (c1, c2) VALUES ('v1', 'v2');
  `;
  const res7 = parseAndVerifyInsertStatements(tokenizeSql(sql7, 'sql7.sql'), 'sql7.sql');
  if (res7.mismatchOccurrences !== 0) throw new Error('Case 7 failed: block comment');

  // Case 8: double-quoted schema/table/column identifiers
  const sql8 = `INSERT INTO "public"."table8" ("col1", "col2") VALUES ('v1', 'v2');`;
  const res8 = parseAndVerifyInsertStatements(tokenizeSql(sql8, 'sql8.sql'), 'sql8.sql');
  if (res8.checkedInserts !== 1 || res8.mismatchOccurrences !== 0) throw new Error('Case 8 failed: double-quoted identifiers');

  // Case 9: tagged dollar body
  const sql9 = `
    DO $tag$
    BEGIN
      INSERT INTO public.t9 (c1, c2) VALUES ('v1', 'v2');
    END $tag$;
  `;
  const res9 = parseAndVerifyInsertStatements(tokenizeSql(sql9, 'sql9.sql'), 'sql9.sql');
  if (res9.checkedInserts !== 1 || res9.mismatchOccurrences !== 0) throw new Error('Case 9 failed: tagged dollar body');

  // Case 10: UNTAGGED $$ dollar body
  const sql10 = `
    DO $$
    BEGIN
      INSERT INTO public.t10 (c1, c2) VALUES ('v1', 'v2');
    END $$;
  `;
  const res10 = parseAndVerifyInsertStatements(tokenizeSql(sql10, 'sql10.sql'), 'sql10.sql');
  if (res10.checkedInserts !== 1 || res10.mismatchOccurrences !== 0) throw new Error('Case 10 failed: untagged $$ dollar body');

  // Case 11: static EXECUTE valid
  const sql11 = `EXECUTE 'INSERT INTO public.t11 (c1, c2) VALUES (''v1'', ''v2'')';`;
  const res11 = parseAndVerifyInsertStatements(tokenizeSql(sql11, 'sql11.sql'), 'sql11.sql');
  if (res11.checkedInserts !== 1 || res11.mismatchOccurrences !== 0) throw new Error('Case 11 failed: static EXECUTE valid');

  // Case 12: static EXECUTE mismatch (occurrence > 0 AND distinct > 0)
  const sql12 = `EXECUTE 'INSERT INTO public.t12 (c1, c2) VALUES (''v1'', ''v2'', ''v3'')';`;
  const res12 = parseAndVerifyInsertStatements(tokenizeSql(sql12, 'sql12.sql'), 'sql12.sql');
  if (res12.mismatchOccurrences !== 1 || res12.distinctMismatches !== 1) {
    throw new Error(`Case 12 failed: static EXECUTE mismatch (occurrences=${res12.mismatchOccurrences}, distinct=${res12.distinctMismatches})`);
  }

  // Case 13: EXECUTE variable unsupported
  const sql13 = `EXECUTE v_stmt_var;`;
  const res13 = parseAndVerifyInsertStatements(tokenizeSql(sql13, 'sql13.sql'), 'sql13.sql');
  if (res13.unsupportedCount !== 1) throw new Error('Case 13 failed: EXECUTE variable unsupported');

  // Case 14: EXECUTE concatenation unsupported
  const sql14 = `EXECUTE 'INSERT INTO public.t14 (c1) VALUES (' || v_var || ')';`;
  const res14 = parseAndVerifyInsertStatements(tokenizeSql(sql14, 'sql14.sql'), 'sql14.sql');
  if (res14.unsupportedCount !== 1) throw new Error('Case 14 failed: EXECUTE concatenation unsupported');

  // Case 15: EXECUTE format(...) unsupported
  const sql15 = `EXECUTE format('INSERT INTO public.t15 (c1) VALUES (%L)', v_val);`;
  const res15 = parseAndVerifyInsertStatements(tokenizeSql(sql15, 'sql15.sql'), 'sql15.sql');
  if (res15.unsupportedCount !== 1) throw new Error('Case 15 failed: EXECUTE format(...) unsupported');

  // Case 16: INSERT VALUES without column list unsupported
  const sql16 = `INSERT INTO public.t16 VALUES ('v1', 'v2');`;
  const res16 = parseAndVerifyInsertStatements(tokenizeSql(sql16, 'sql16.sql'), 'sql16.sql');
  if (res16.unsupportedCount !== 1) throw new Error('Case 16 failed: INSERT VALUES without column list unsupported');

  // Case 17: INSERT ... SELECT
  const sql17 = `INSERT INTO public.t17 (c1, c2) SELECT col1, col2 FROM public.other;`;
  const res17 = parseAndVerifyInsertStatements(tokenizeSql(sql17, 'sql17.sql'), 'sql17.sql');
  if (res17.nonValuesInserts !== 1) throw new Error('Case 17 failed: INSERT...SELECT');

  // Case 18: DEFAULT VALUES
  const sql18 = `INSERT INTO public.t18 DEFAULT VALUES;`;
  const res18 = parseAndVerifyInsertStatements(tokenizeSql(sql18, 'sql18.sql'), 'sql18.sql');
  if (res18.nonValuesInserts !== 1) throw new Error('Case 18 failed: DEFAULT VALUES');

  // Case 19: unclosed single quote
  let c19Caught = false;
  try { tokenizeSql("SELECT 'unclosed string", 'sql19.sql'); } catch (e) { if (e.message.includes('UNCLOSED_STRING_LITERAL')) c19Caught = true; }
  if (!c19Caught) throw new Error('Case 19 failed: unclosed single quote');

  // Case 20: unclosed double quote
  let c20Caught = false;
  try { tokenizeSql('SELECT "unclosed ident', 'sql20.sql'); } catch (e) { if (e.message.includes('UNCLOSED_DOUBLE_QUOTE')) c20Caught = true; }
  if (!c20Caught) throw new Error('Case 20 failed: unclosed double quote');

  // Case 21: unclosed block comment
  let c21Caught = false;
  try { tokenizeSql('/* unclosed block comment', 'sql21.sql'); } catch (e) { if (e.message.includes('UNCLOSED_BLOCK_COMMENT')) c21Caught = true; }
  if (!c21Caught) throw new Error('Case 21 failed: unclosed block comment');

  // Case 22: unclosed tagged dollar quote
  let c22Caught = false;
  try { tokenizeSql('DO $tag$ unclosed body', 'sql22.sql'); } catch (e) { if (e.message.includes('UNCLOSED_DOLLAR_QUOTE')) c22Caught = true; }
  if (!c22Caught) throw new Error('Case 22 failed: unclosed tagged dollar quote');

  // Case 23: unclosed untagged dollar quote
  let c23Caught = false;
  try { tokenizeSql('DO $$ unclosed untagged body', 'sql23.sql'); } catch (e) { if (e.message.includes('UNCLOSED_DOLLAR_QUOTE')) c23Caught = true; }
  if (!c23Caught) throw new Error('Case 23 failed: unclosed untagged dollar quote');

  // Case 24: unbalanced opening punctuation
  let c24Caught = false;
  try { tokenizeSql('INSERT INTO t (c1, c2 VALUES (1, 2);', 'sql24.sql'); } catch (e) { if (e.message.includes('UNBALANCED_PUNCTUATION_OPEN')) c24Caught = true; }
  if (!c24Caught) throw new Error('Case 24 failed: unbalanced opening punctuation');

  // Case 25: unbalanced closing punctuation
  let c25Caught = false;
  try { tokenizeSql('INSERT INTO t (c1, c2)) VALUES (1, 2);', 'sql25.sql'); } catch (e) { if (e.message.includes('UNBALANCED_PUNCTUATION_CLOSE')) c25Caught = true; }
  if (!c25Caught) throw new Error('Case 25 failed: unbalanced closing punctuation');

  console.log('✅ Arity scanner 25 distinct executable cases PASSED.');
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
  console.log('--- Testing Evidence Aggregator 34 Actual Executable Cases (R9-R1.6) ---');
  const tempDir = path.join(__dirname, '../scratch/test-aggregator-fragments-tmp');

  // Case 1: valid complete 30-fragment PASS
  writeValidPhaseFragments(tempDir);
  const passRes = aggregateEvidence(tempDir);
  if (!passRes) throw new Error('Case 1 failed: valid complete 30-fragment PASS');

  // Case 2: unknown fragment rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '99-injected.env'), 'INJECTED_KEY=PASS\n');
  let c2Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('UNKNOWN_FRAGMENT_REJECTED')) c2Caught = true; }
  if (!c2Caught) throw new Error('Case 2 failed: unknown fragment rejection');

  // Case 3: wrong base-key owner rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=PASS\nMIGRATION_COUNT=69/69\nR9_SELFTEST_RESULT=PASS\n');
  let c3Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) c3Caught = true; }
  if (!c3Caught) throw new Error('Case 3 failed: wrong base-key owner rejection');

  // Case 4: wrong FAILURE_REASON owner rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=FAIL\nMIGRATION_REPLAY_RESULT_FAILURE_REASON=ERR\nMIGRATION_COUNT=69/69\nR9_SELFTEST_RESULT_FAILURE_REASON=ERR\n');
  let c4Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) c4Caught = true; }
  if (!c4Caught) throw new Error('Case 4 failed: wrong failure reason owner rejection');

  // Case 5: wrong NOT_EXECUTED_REASON owner rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=NOT_EXECUTED\nMIGRATION_REPLAY_RESULT_NOT_EXECUTED_REASON=ERR\nMIGRATION_COUNT=NOT_OBSERVED\nR9_SELFTEST_RESULT_NOT_EXECUTED_REASON=ERR\n');
  let c5Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) c5Caught = true; }
  if (!c5Caught) throw new Error('Case 5 failed: wrong not_executed reason owner rejection');

  // Case 6: non-status key reason rejection
  writeValidPhaseFragments(tempDir);
  fs.appendFileSync(path.join(tempDir, '04-uuid-static.env'), 'INVALID_UUID_DISTINCT_COUNT_FAILURE_REASON=NOT_ALLOWED\n');
  let c6Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('UNKNOWN_KEY_REJECTED')) c6Caught = true; }
  if (!c6Caught) throw new Error('Case 6 failed: non-status key reason rejection');

  // Case 7: intra-fragment duplicate rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'R9_SELFTEST_RESULT=PASS\nR9_SELFTEST_RESULT=PASS\n');
  let c7Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('INTRA_FRAGMENT_DUPLICATE_REJECTED')) c7Caught = true; }
  if (!c7Caught) throw new Error('Case 7 failed: intra-fragment duplicate rejection');

  // Case 8: cross-fragment duplicate / wrong-owner duplicate rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=0\nINVALID_UUID_OCCURRENCE_COUNT=0\nMIGRATION_REPLAY_RESULT=PASS\n');
  let c8Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('WRONG_OWNER_KEY_REJECTED')) c8Caught = true; }
  if (!c8Caught) throw new Error('Case 8 failed: cross-fragment duplicate / wrong-owner rejection');

  // Case 9: missing mandatory fragment rejection
  writeValidPhaseFragments(tempDir);
  fs.unlinkSync(path.join(tempDir, '03-r9-selftest.env'));
  let c9Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_MANDATORY_FRAGMENT')) c9Caught = true; }
  if (!c9Caught) throw new Error('Case 9 failed: missing mandatory fragment rejection');

  // Case 10: missing mandatory base key rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), '# Empty file\n');
  let c10Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_KEY_IN_FRAGMENT')) c10Caught = true; }
  if (!c10Caught) throw new Error('Case 10 failed: missing mandatory base key rejection');

  // Case 11: malformed bare line rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'BARE_LINE_WITHOUT_EQUALS\n');
  let c11Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MALFORMED_LINE')) c11Caught = true; }
  if (!c11Caught) throw new Error('Case 11 failed: malformed bare line rejection');

  // Case 12: invalid ordinary RESULT enum rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '03-r9-selftest.env'), 'R9_SELFTEST_RESULT=MAYBE\n');
  let c12Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_ENUM_VALIDATION_FAILED')) c12Caught = true; }
  if (!c12Caught) throw new Error('Case 12 failed: invalid ordinary result enum rejection');

  // Case 13: invalid REGRESSION/group-status enum rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '22b-app-clinic-summary.env'), 'CLINIC_REGRESSION=INVALID_STATUS\n');
  let c13Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_ENUM_VALIDATION_FAILED')) c13Caught = true; }
  if (!c13Caught) throw new Error('Case 13 failed: invalid group-status enum rejection');

  // Case 14: malformed integer `40junk` rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=40junk\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  let c14Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('STRICT_INTEGER_VALIDATION_FAILED')) c14Caught = true; }
  if (!c14Caught) throw new Error('Case 14 failed: malformed integer 40junk rejection');

  // Case 15: FIRST_FATAL exact earliest explicit reason preservation
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\nTYPECHECK_RESULT_FAILURE_REASON=TYPECHECK_EXIT_1\n');
  aggregateEvidence(tempDir);
  const resEnv15 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv15.includes('FIRST_FATAL_REASON_IF_ANY=ASSERTION_38_PAST_SLOT_DENIED_FAILED')) {
    throw new Error('Case 15 failed: FIRST_FATAL failed to preserve exact earliest explicit failure reason value!');
  }

  // Case 16: earlier NOT_EXECUTED does NOT become FIRST_FATAL
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '01-migration.env'), 'MIGRATION_REPLAY_RESULT=NOT_EXECUTED\nMIGRATION_REPLAY_RESULT_NOT_EXECUTED_REASON=BOOTSTRAP_FAILED\nMIGRATION_COUNT=NOT_OBSERVED\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\nTYPECHECK_RESULT_FAILURE_REASON=TYPECHECK_EXIT_1\n');
  aggregateEvidence(tempDir);
  const resEnv16 = fs.readFileSync(path.join(tempDir, 'results.env'), 'utf8');
  if (!resEnv16.includes('FIRST_FATAL_STEP_IF_ANY=TYPECHECK_RESULT') || !resEnv16.includes('FIRST_FATAL_REASON_IF_ANY=TYPECHECK_EXIT_1')) {
    throw new Error('Case 16 failed: earlier NOT_EXECUTED wrongly became FIRST_FATAL instead of subsequent real FAIL');
  }

  // Case 17: first FAIL has reason + second FAIL lacks reason => rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=ASSERTION_38_PAST_SLOT_DENIED_FAILED\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=FAIL\n');
  let c17Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_FAILURE_REASON_REJECTED')) c17Caught = true; }
  if (!c17Caught) throw new Error('Case 17 failed: second FAIL missing explicit reason rejection');

  // Case 18: missing NOT_EXECUTED reason => rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '24-typecheck.env'), 'TYPECHECK_RESULT=NOT_EXECUTED\n');
  let c18Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('MISSING_NOT_EXECUTED_REASON_REJECTED')) c18Caught = true; }
  if (!c18Caught) throw new Error('Case 18 failed: missing NOT_EXECUTED reason rejection');

  // Case 19: pgTAP COUNT != EXECUTED => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=32\nFOUNDATION_PGTAP_EXECUTED_COUNT=32\nFOUNDATION_PGTAP_COUNT=30\nFOUNDATION_PGTAP_PASSED_COUNT=32\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=PASS\nFOUNDATION_PGTAP_FAILURE_CLASS=NONE\n');
  const c19Res = aggregateEvidence(tempDir);
  if (c19Res !== false) throw new Error('Case 19 failed: pgTAP COUNT != EXECUTED must fail composite gate');

  // Case 20: pgTAP zero executed => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '06-pgtap-foundation.env'), 'FOUNDATION_PGTAP_PLANNED_COUNT=0\nFOUNDATION_PGTAP_EXECUTED_COUNT=0\nFOUNDATION_PGTAP_COUNT=0\nFOUNDATION_PGTAP_PASSED_COUNT=0\nFOUNDATION_PGTAP_FAILED_COUNT=0\nFOUNDATION_PGTAP_RESULT=FAIL\nFOUNDATION_PGTAP_RESULT_FAILURE_REASON=ZERO_TESTS_EXECUTED\nFOUNDATION_PGTAP_FAILURE_CLASS=SETUP_OR_PARSE_FAILURE\n');
  const c20Res = aggregateEvidence(tempDir);
  if (c20Res !== false) throw new Error('Case 20 failed: pgTAP zero executed must fail composite gate');

  // Case 21: ROUND_1 active count != 1 => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=2\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const c21Res = aggregateEvidence(tempDir);
  if (c21Res !== false) throw new Error('Case 21 failed: ROUND_1 active count != 1 must fail composite gate');

  // Case 22: ROUND_2 active count != 1 => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=0\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const c22Res = aggregateEvidence(tempDir);
  if (c22Res !== false) throw new Error('Case 22 failed: ROUND_2 active count != 1 must fail composite gate');

  // Case 23: ROUND_3 active count != 1 => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=ht\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=5\nHT_WIN_COUNT=1\nHT_WIN_PROVENANCE_RESULT=PASS\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const c23Res = aggregateEvidence(tempDir);
  if (c23Res !== false) throw new Error('Case 23 failed: ROUND_3 active count != 1 must fail composite gate');

  // Case 24: containment nonzero => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '28-containment.env'), 'REMOTE_SUPABASE_ACCESS_COUNT=1\nSHARED_STAGING_ACCESS_COUNT=0\nPRODUCTION_ACCESS_COUNT=0\nDEPLOYMENT_COUNT=0\nCONTROL_PLANE_MUTATION_COUNT=0\nAOS_MUTATION_COUNT=0\n');
  const c24Res = aggregateEvidence(tempDir);
  if (c24Res !== false) throw new Error('Case 24 failed: containment nonzero count must fail composite gate');

  // Case 25: HT provenance PASS alternative accepted
  writeValidPhaseFragments(tempDir);
  const c25Res = aggregateEvidence(tempDir);
  if (c25Res !== true) throw new Error('Case 25 failed: HT provenance PASS alternative accepted');

  // Case 26: HT provenance NOT_OBSERVED + Block1 PASS accepted
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=core\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=0\nHT_WIN_PROVENANCE_RESULT=NOT_OBSERVED\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const c26Res = aggregateEvidence(tempDir);
  if (c26Res !== true) throw new Error('Case 26 failed: HT provenance NOT_OBSERVED + Block1 PASS accepted');

  // Case 27: invalid HT provenance combination => composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '08-pgtap-slice4-block1.env'), 'SLICE4_BLOCK1_PGTAP_PLANNED_COUNT=40\nSLICE4_BLOCK1_PGTAP_EXECUTED_COUNT=40\nSLICE4_BLOCK1_PGTAP_COUNT=40\nSLICE4_BLOCK1_PGTAP_PASSED_COUNT=39\nSLICE4_BLOCK1_PGTAP_FAILED_COUNT=1\nSLICE4_BLOCK1_PGTAP_RESULT=FAIL\nSLICE4_BLOCK1_PGTAP_RESULT_FAILURE_REASON=FAIL\nSLICE4_BLOCK1_PGTAP_FAILURE_CLASS=ASSERTION_FAILURE\n');
  fs.writeFileSync(path.join(tempDir, '14-concurrency.env'), `REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS\nCONTROLLER_LOCK_BARRIER_RESULT=PASS\nBOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS\nINDEPENDENT_DB_CONNECTION_COUNT=2\nCONCURRENCY_ROUND_COUNT=3\nROUND_1_WINNER=core\nROUND_1_ACTIVE_APPOINTMENT_COUNT=1\nROUND_2_WINNER=core\nROUND_2_ACTIVE_APPOINTMENT_COUNT=1\nROUND_3_WINNER=core\nROUND_3_ACTIVE_APPOINTMENT_COUNT=1\nHT_WIN_COUNT=0\nHT_WIN_PROVENANCE_RESULT=NOT_OBSERVED\nBOTH_SUCCESS_COUNT=0\nDEADLOCK_COUNT=0\nTIMEOUT_COUNT=0\nLOSING_HT_PARTIAL_CUSTOMER_COUNT=0\nLOSING_HT_PARTIAL_PATIENT_PROFILE_COUNT=0\nLOSING_HT_PARTIAL_APPOINTMENT_COUNT=0\nNO_ENCOUNTER_AUTOCREATE_RESULT=PASS\nNO_EXTERNAL_SIDE_EFFECT_RESULT=PASS\n`);
  const c27Res = aggregateEvidence(tempDir);
  if (c27Res !== false) throw new Error('Case 27 failed: HT provenance NOT_OBSERVED + Block1 FAIL must fail composite gate');

  // Case 28: Clinic summary PASS with all four commands PASS
  writeValidPhaseFragments(tempDir);
  const c28Res = aggregateEvidence(tempDir);
  if (c28Res !== true) throw new Error('Case 28 failed: Clinic summary PASS with 4 commands PASS should succeed');

  // Case 29: Clinic summary NOT_EXECUTED with four npm-blocked commands and explicit reasons => composite false without schema rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '19-app-clinic-domain.env'), 'CLINIC_DOMAIN_APP_RESULT=NOT_EXECUTED\nCLINIC_DOMAIN_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '20-app-clinic-contracts.env'), 'CLINIC_APPLICATION_CONTRACTS_APP_RESULT=NOT_EXECUTED\nCLINIC_APPLICATION_CONTRACTS_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '21-app-clinic-operational.env'), 'CLINIC_OPERATIONAL_APP_RESULT=NOT_EXECUTED\nCLINIC_OPERATIONAL_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '22-app-clinic-workspace.env'), 'CLINIC_WORKSPACE_APP_RESULT=NOT_EXECUTED\nCLINIC_WORKSPACE_APP_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  fs.writeFileSync(path.join(tempDir, '22b-app-clinic-summary.env'), 'CLINIC_REGRESSION=NOT_EXECUTED\nCLINIC_REGRESSION_NOT_EXECUTED_REASON=NPM_CI_FAILED\n');
  const c29Res = aggregateEvidence(tempDir);
  if (c29Res !== false) throw new Error('Case 29 failed: Clinic summary NOT_EXECUTED should fail composite gate cleanly');

  // Case 30: PASS scanner status with NOT_OBSERVED required numeric metric => rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=PASS\nINVALID_UUID_DISTINCT_COUNT=NOT_OBSERVED\nINVALID_UUID_OCCURRENCE_COUNT=0\n');
  let c30Caught = false;
  try { aggregateEvidence(tempDir); } catch (e) { if (e.message.includes('NOT_OBSERVED_VALIDATION_FAILED')) c30Caught = true; }
  if (!c30Caught) throw new Error('Case 30 failed: PASS scanner status with NOT_OBSERVED numeric metric must be rejected');

  // Case 31: NOT_EXECUTED scanner status with allowed NOT_OBSERVED metrics => accepted as valid evidence but composite false
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '04-uuid-static.env'), 'FIXTURE_UUID_STATIC_RESULT=NOT_EXECUTED\nFIXTURE_UUID_STATIC_RESULT_NOT_EXECUTED_REASON=NPM_CI_FAILED\nINVALID_UUID_DISTINCT_COUNT=NOT_OBSERVED\nINVALID_UUID_OCCURRENCE_COUNT=NOT_OBSERVED\n');
  const c31Res = aggregateEvidence(tempDir);
  if (c31Res !== false) throw new Error('Case 31 failed: NOT_EXECUTED scanner status should be valid evidence but fail composite gate');

  // Case 32: results.env raw-byte tamper => rejection
  writeValidPhaseFragments(tempDir);
  const origWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function(filePath, data, options) {
    if (typeof filePath === 'string' && filePath.endsWith('results.env')) {
      origWriteFileSync.call(fs, filePath, data + 'EXTRA_TAMPER_BYTE=1\n', options);
    } else {
      origWriteFileSync.call(fs, filePath, data, options);
    }
  };
  let c32Caught = false;
  try {
    aggregateEvidence(tempDir);
  } catch (e) {
    if (e.message.includes('REREAD_VALIDATION_FAILED')) c32Caught = true;
  } finally {
    fs.writeFileSync = origWriteFileSync;
  }
  if (!c32Caught) throw new Error('Case 32 failed: results.env raw-byte tamper test failed to trigger REREAD_VALIDATION_FAILED');

  // Case 33: results.env missing/replaced key/value => rejection
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync = function(filePath, data, options) {
    if (typeof filePath === 'string' && filePath.endsWith('results.env')) {
      origWriteFileSync.call(fs, filePath, 'MUTATED_KEY=VALUE\n', options);
    } else {
      origWriteFileSync.call(fs, filePath, data, options);
    }
  };
  let c33Caught = false;
  try {
    aggregateEvidence(tempDir);
  } catch (e) {
    if (e.message.includes('REREAD_VALIDATION_FAILED')) c33Caught = true;
  } finally {
    fs.writeFileSync = origWriteFileSync;
  }
  if (!c33Caught) throw new Error('Case 33 failed: results.env key mutation test failed to trigger REREAD_VALIDATION_FAILED');

  // Case 34: missing canonical evidence is never synthesized
  writeValidPhaseFragments(tempDir);
  fs.writeFileSync(path.join(tempDir, '28-containment.env'), 'REMOTE_SUPABASE_ACCESS_COUNT=0\nSHARED_STAGING_ACCESS_COUNT=0\nPRODUCTION_ACCESS_COUNT=0\nDEPLOYMENT_COUNT=0\nCONTROL_PLANE_MUTATION_COUNT=0\n');
  let c34Caught = false;
  try {
    aggregateEvidence(tempDir);
  } catch (e) {
    if (e.message.includes('MISSING_KEY_IN_FRAGMENT')) c34Caught = true;
  }
  if (!c34Caught) throw new Error('Case 34 failed: missing canonical key in fragment was synthesized instead of rejected');

  // Clean up scratch temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ Evidence aggregator 34 actual executable cases PASSED.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  console.log('\n🎉 ALL HARDENED R9-R1.4/1.5 CONTRACT SELF-TESTS PASSED!');
}

main();
