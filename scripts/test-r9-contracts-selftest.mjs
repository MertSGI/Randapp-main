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

  // Case A: safe SET LOCAL + quote_literal scalar => supported safe non-INSERT
  const sqlA = `EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_id::text);`;
  const resA = parseAndVerifyInsertStatements(tokenizeSql(sqlA, 'sqlA.sql'), 'sqlA.sql');
  if (resA.unsupportedCount !== 0) throw new Error('Case A failed: safe SET LOCAL + quote_literal scalar must be supported');

  // Case B: multi-statement with INSERT => unsupported
  const sqlB = `EXECUTE 'SET LOCAL request.jwt.claim.sub = 1; INSERT INTO public.t(c) VALUES (' || quote_literal(v) || ')';`;
  const resB = parseAndVerifyInsertStatements(tokenizeSql(sqlB, 'sqlB.sql'), 'sqlB.sql');
  if (resB.unsupportedCount !== 1) throw new Error('Case B failed: multi-statement with INSERT must be unsupported');

  // Case C: multi-statement with SELECT => unsupported
  const sqlC = `EXECUTE 'SET LOCAL request.jwt.claim.sub = 1; SELECT ' || quote_literal(v);`;
  const resC = parseAndVerifyInsertStatements(tokenizeSql(sqlC, 'sqlC.sql'), 'sqlC.sql');
  if (resC.unsupportedCount !== 1) throw new Error('Case C failed: multi-statement with SELECT must be unsupported');

  // Case D: SET ROLE => unsupported
  const sqlD = `EXECUTE 'SET ROLE ' || quote_literal(v);`;
  const resD = parseAndVerifyInsertStatements(tokenizeSql(sqlD, 'sqlD.sql'), 'sqlD.sql');
  if (resD.unsupportedCount !== 1) throw new Error('Case D failed: SET ROLE must be unsupported');

  // Case E: raw variable concatenation => unsupported
  const sqlE = `EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || v_raw;`;
  const resE = parseAndVerifyInsertStatements(tokenizeSql(sqlE, 'sqlE.sql'), 'sqlE.sql');
  if (resE.unsupportedCount !== 1) throw new Error('Case E failed: raw variable concatenation must be unsupported');

  // Case F: dynamic INSERT => unsupported
  const sqlF = `EXECUTE 'INSERT INTO public.t(c) VALUES (' || quote_literal(v) || ')';`;
  const resF = parseAndVerifyInsertStatements(tokenizeSql(sqlF, 'sqlF.sql'), 'sqlF.sql');
  if (resF.unsupportedCount !== 1) throw new Error('Case F failed: dynamic INSERT must be unsupported');

  // Case G: safe prefix followed by USING => unsupported
  const sqlG = `EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v) USING v_param;`;
  const resG = parseAndVerifyInsertStatements(tokenizeSql(sqlG, 'sqlG.sql'), 'sqlG.sql');
  if (resG.unsupportedCount !== 1) throw new Error('Case G failed: safe prefix followed by USING must be unsupported');

  // Case H: safe prefix followed by second concatenation => unsupported
  const sqlH = `EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v) || ' ;';`;
  const resH = parseAndVerifyInsertStatements(tokenizeSql(sqlH, 'sqlH.sql'), 'sqlH.sql');
  if (resH.unsupportedCount !== 1) throw new Error('Case H failed: safe prefix followed by second concatenation must be unsupported');

  console.log('✅ Arity scanner adversarial cases A-H PASSED.');
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
  fs.writeFileSync(path.join(targetDir, '10-sql-clinic-domain.env'), 'CLINIC_DOMAIN_SQL_EXECUTION_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '11-sql-clinic-ops.env'), 'CLINIC_OPS_SQL_EXECUTION_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '12-sql-clinic-hardening.env'), 'CLINIC_HARDENING_SQL_EXECUTION_RESULT=PASS\n');
  fs.writeFileSync(path.join(targetDir, '13-sql-public-booking.env'), 'PUBLIC_BOOKING_SQL_EXECUTION_RESULT=PASS\n');
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

function testConcurrencyHarnessEvidenceContract() {
  console.log('--- Testing Concurrency Harness Static Source Evidence Contract (R9-R1.7) ---');
  const harnessPath = path.join(__dirname, 'test-health-tourism-slice4-booking-concurrency.mjs');
  const content = fs.readFileSync(harnessPath, 'utf8');

  // Assert legacy non-canonical strings are completely absent
  if (content.includes("CONTROLLER_LOCK_BARRIER_RESULT=ACQUIRED_HELD_RELEASED")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Harness outputs non-canonical ACQUIRED_HELD_RELEASED!');
  }
  if (content.includes("BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PROVEN")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Harness outputs non-canonical PROVEN!');
  }
  if (content.includes("INDEPENDENT_DB_CONNECTION_COUNT=3")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Harness outputs connection count 3 instead of 2!');
  }
  if (content.includes("winner = 'HT'") || content.includes("winner = 'CORE'") || content.includes("winner = 'BOTH_SUCCEEDED_ERROR'")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Harness outputs upper-case winner values!');
  }

  // Assert canonical markers are present in source
  if (!content.includes("CONTROLLER_LOCK_BARRIER_RESULT=PASS")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Missing canonical CONTROLLER_LOCK_BARRIER_RESULT=PASS output');
  }
  if (!content.includes("BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Missing canonical BOTH_CALLS_BLOCKED_BEFORE_RELEASE_RESULT=PASS output');
  }
  if (!content.includes("INDEPENDENT_DB_CONNECTION_COUNT=2")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Missing canonical INDEPENDENT_DB_CONNECTION_COUNT=2 output');
  }
  if (!content.includes("winner = 'ht'") || !content.includes("winner = 'core'")) {
    throw new Error('CONCURRENCY_HARNESS_DEFECT: Missing lower-case ht/core winner logic');
  }

  console.log('✅ Concurrency harness static evidence contract PASSED.');
}

function normalizeSql(str) {
  return str
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function testPublicBookingSourceContract() {
  console.log('--- Testing Public Booking Behavioral Test Suite & Product Migration Source Contract (R9-R1.8.6) ---');
  const sqlPath = path.join(__dirname, '..', 'supabase/tests/public_booking_rpc_behavioral_tests.sql');
  const content = fs.readFileSync(sqlPath, 'utf8');

  const mig20260813Path = path.join(__dirname, '..', 'supabase/migrations/20260813_h1c_commercial_eligibility_and_quota_enforcement.sql');
  const mig20260723Path = path.join(__dirname, '..', 'supabase/migrations/20260723_booking_lifecycle_foundation.sql');
  const mig20260827Path = path.join(__dirname, '..', 'supabase/migrations/20260827_h1e_c_public_booking_release_gate_runtime_fix.sql');

  const mig20260813 = fs.readFileSync(mig20260813Path, 'utf8');
  const mig20260723 = fs.readFileSync(mig20260723Path, 'utf8');
  const mig20260827 = fs.readFileSync(mig20260827Path, 'utf8');

  // 1. CANONICAL CREATE_PUBLIC_BOOKING IDENTITY (20260813)
  const normMig20260813 = normalizeSql(mig20260813);
  const expectedCreateRevoke = normalizeSql(
    'REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) FROM PUBLIC;'
  );
  const expectedCreateGrant = normalizeSql(
    'GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) TO anon, authenticated;'
  );

  if (!normMig20260813.includes(expectedCreateRevoke)) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260813 missing REVOKE EXECUTE ON FUNCTION public.create_public_booking(...) with exact 13 parameter types');
  }
  if (!normMig20260813.includes(expectedCreateGrant)) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260813 missing GRANT EXECUTE ON FUNCTION public.create_public_booking(...) with exact 13 parameter types');
  }

  // Function-local SECURITY DEFINER guard for create_public_booking
  const createStart = mig20260813.indexOf('CREATE OR REPLACE FUNCTION public.create_public_booking(');
  const createGrantIdx = mig20260813.indexOf('GRANT EXECUTE ON FUNCTION public.create_public_booking(', createStart);
  if (createStart === -1 || createGrantIdx === -1 || createGrantIdx <= createStart) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260813 could not isolate function region for create_public_booking');
  }
  const createRegion = mig20260813.substring(createStart, createGrantIdx);
  if (!createRegion.includes('SECURITY DEFINER')) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260813 create_public_booking function region missing SECURITY DEFINER');
  }

  // 2. GET_PUBLIC_AVAILABLE_SLOTS CANONICAL IDENTITY (20260723)
  const normMig20260723 = normalizeSql(mig20260723);
  const expectedSlotsRevoke = normalizeSql('REVOKE EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) FROM PUBLIC;');
  const expectedSlotsGrant = normalizeSql('GRANT EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) TO anon, authenticated;');

  if (!normMig20260723.includes(expectedSlotsRevoke) || !normMig20260723.includes(expectedSlotsGrant)) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260723 missing REVOKE/GRANT for public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE)');
  }

  const slotStart = mig20260723.indexOf('CREATE OR REPLACE FUNCTION public.get_public_available_slots(');
  const slotGrantIdx = mig20260723.indexOf('GRANT EXECUTE ON FUNCTION public.get_public_available_slots(', slotStart);
  if (slotStart === -1 || slotGrantIdx === -1 || slotGrantIdx <= slotStart) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260723 could not isolate function region for get_public_available_slots');
  }
  const slotRegion = mig20260723.substring(slotStart, slotGrantIdx);
  if (!slotRegion.includes('SECURITY DEFINER')) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260723 get_public_available_slots function region missing SECURITY DEFINER');
  }

  // 3. CAN_ACCEPT_PUBLIC_BOOKING CANONICAL IDENTITY (20260827)
  const normMig20260827 = normalizeSql(mig20260827);
  const expectedCanAcceptGrant = normalizeSql('GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon, authenticated;');

  if (!normMig20260827.includes(expectedCanAcceptGrant)) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260827 missing GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text)');
  }

  const canAcceptStart = mig20260827.indexOf('CREATE OR REPLACE FUNCTION public.can_accept_public_booking(');
  const canAcceptGrantIdx = mig20260827.indexOf('GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(', canAcceptStart);
  if (canAcceptStart === -1 || canAcceptGrantIdx === -1 || canAcceptGrantIdx <= canAcceptStart) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260827 could not isolate function region for can_accept_public_booking');
  }
  const canAcceptRegion = mig20260827.substring(canAcceptStart, canAcceptGrantIdx);
  if (!canAcceptRegion.includes('SECURITY DEFINER')) {
    throw new Error('CANONICAL_PRODUCT_MIGRATION_DEFECT: 20260827 can_accept_public_booking function region missing SECURITY DEFINER');
  }

  // 4. CONFLICT TARGET ASSERTIONS IN TEST SQL
  if (!content.includes('ON CONFLICT (staff_id, branch_id) DO NOTHING')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Missing canonical ON CONFLICT (staff_id, branch_id) DO NOTHING');
  }
  if (content.includes('ON CONFLICT (tenant_id, staff_id, branch_id)')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Invalid ON CONFLICT (tenant_id, staff_id, branch_id) target present');
  }
  if (!content.includes('ON CONFLICT (service_id, branch_id) DO NOTHING')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Missing canonical ON CONFLICT (service_id, branch_id) DO NOTHING');
  }
  if (content.includes('ON CONFLICT (tenant_id, service_id, branch_id)')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Invalid ON CONFLICT (tenant_id, service_id, branch_id) target present');
  }

  // 5. TEST SECTION MARKERS MUST FAIL CLOSED (Tests 21-26)
  const sectionStart = content.indexOf('-- STAFF-SERVICE MAPPING TESTS: Tests 21-26');
  const test21Idx = content.indexOf('-- TEST 21: Mapped staff succeeds', sectionStart);
  const test22Idx = content.indexOf('-- TEST 22: Active unmapped staff returns invalid_staff', test21Idx);
  const test25Idx = content.indexOf('-- TEST 25: Removing mapping causes invalid_staff', test22Idx);
  const test26Idx = content.indexOf('-- TEST 26: Restoring mapping restores booking success', test25Idx);
  const completionMarkerIdx = content.indexOf("RAISE NOTICE '=== STAFF-SERVICE MAPPING TESTS 21-26 COMPLETED ===';", test26Idx);

  if (
    sectionStart === -1 ||
    test21Idx === -1 ||
    test22Idx === -1 ||
    test25Idx === -1 ||
    test26Idx === -1 ||
    completionMarkerIdx === -1 ||
    !(sectionStart < test21Idx && test21Idx < test22Idx && test22Idx < test25Idx && test25Idx < test26Idx && test26Idx < completionMarkerIdx)
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Tests 21-26 markers missing or out of strict order');
  }

  // 6. TEST22 CAUSAL ISOLATION
  const setupRegion = content.substring(sectionStart, test21Idx);
  const preTest22Region = content.substring(sectionStart, test22Idx);

  const normSetup = normalizeSql(setupRegion);
  if (!normSetup.includes(normalizeSql('service_branches (tenant_id, service_id, branch_id) values (v_tenant_id, v_service_id, v_b_id)'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Setup region missing service_branches mapping');
  }
  if (!normSetup.includes(normalizeSql('staff_branches (tenant_id, staff_id, branch_id) values (v_tenant_id, v_mapped_staff_id, v_b_id)'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Setup region missing mapped staff_branches mapping');
  }
  if (!normSetup.includes(normalizeSql('staff_branches (tenant_id, staff_id, branch_id) values (v_tenant_id, v_unmapped_staff_id, v_b_id)'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Setup region missing unmapped staff_branches mapping');
  }
  if (!normSetup.includes(normalizeSql('staff_services (staff_id, service_id) values (v_mapped_staff_id, v_service_id)'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Setup region missing staff_services positive mapping for mapped staff');
  }

  const normPreTest22 = normalizeSql(preTest22Region);
  if (normPreTest22.includes(normalizeSql('values (v_unmapped_staff_id, v_service_id)'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Pre-Test22 region incorrectly inserted staff_services mapping for unmapped staff');
  }

  // 7. TEST25 CAUSAL ISOLATION
  const test25Region = content.substring(test25Idx, test26Idx);
  const normTest25Region = normalizeSql(test25Region);
  if (!normTest25Region.includes(normalizeSql('delete from public.staff_services where staff_id = v_mapped_staff_id and service_id = v_service_id;'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 25 region missing exact staff_services deletion');
  }

  const test25BookingCallIdx = test25Region.indexOf('create_public_booking');
  if (test25BookingCallIdx === -1) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 25 region missing create_public_booking call');
  }
  const test25BeforeBooking = test25Region.substring(0, test25BookingCallIdx);
  if (test25BeforeBooking.includes('DELETE FROM public.staff_branches') || test25BeforeBooking.includes('DELETE FROM public.service_branches')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 25 deleted staff_branches or service_branches prematurely before booking call');
  }

  // 8. TEST26 RESTORE GUARD
  const test26Region = content.substring(test26Idx, completionMarkerIdx);
  const test26BookingCallIdx = test26Region.indexOf('create_public_booking');
  if (test26BookingCallIdx === -1) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 26 region missing create_public_booking call');
  }
  const test26BeforeBooking = test26Region.substring(0, test26BookingCallIdx);
  const normTest26BeforeBooking = normalizeSql(test26BeforeBooking);

  if (!normTest26BeforeBooking.includes(normalizeSql('insert into public.staff_services (staff_id, service_id) values (v_mapped_staff_id, v_service_id) on conflict (staff_id, service_id) do nothing'))) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 26 before-booking region missing exact semantic staff_services restore');
  }
  if (test26BeforeBooking.includes('DELETE FROM public.staff_branches') || test26BeforeBooking.includes('DELETE FROM public.service_branches')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 26 deleted staff_branches or service_branches prematurely before booking call');
  }

  // 9. CROSS-SOURCE TEST66/67 CONTRACT
  if (!content.includes("'public.create_public_booking(text,uuid,uuid,date,time,text,text,text,boolean,boolean,boolean,text,uuid)'")) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Missing canonical create_public_booking signature in ACL test');
  }
  if (!content.includes("'public.get_public_available_slots(text,uuid,uuid,uuid,date)'")) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Missing canonical get_public_available_slots signature in ACL test');
  }
  if (!content.includes("'public.can_accept_public_booking(text)'")) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Missing canonical can_accept_public_booking in ACL test');
  }

  if (
    !content.includes("to_regprocedure('public.create_public_booking(text,uuid,uuid,date,time,text,text,text,boolean,boolean,boolean,text,uuid)')") ||
    !content.includes("to_regprocedure('public.get_public_available_slots(text,uuid,uuid,uuid,date)')") ||
    !content.includes("to_regprocedure('public.can_accept_public_booking(text)')")
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 67 missing exact to_regprocedure checks for all three canonical functions');
  }

  if (content.includes('HAVING COUNT(*) = 3')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 67 contains weak generic HAVING COUNT(*) = 3 pattern');
  }

  // REQUIRED STATIC PROOF PRINTS
  console.log('CREATE_BOOKING_CANONICAL_IDENTITY_USES_TYPES_ONLY=YES');
  console.log('CREATE_BOOKING_P_KVKK_NAME_ASSERTION_PRESENT=NO');
  console.log('CREATE_BOOKING_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES');
  console.log('SLOT_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES');
  console.log('ELIGIBILITY_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES');
  console.log('TEST21_TO_26_MARKERS_FAIL_CLOSED=YES');
  console.log('SELFTEST_TEST22_NO_STAFF_SERVICE_MAPPING_GUARD=YES');
  console.log('SELFTEST_TEST25_CAUSAL_ISOLATION_GUARD=YES');
  console.log('SELFTEST_TEST26_RESTORE_GUARD=YES');
  console.log('TEST67_EXACT_REGPROCEDURE_GUARDS_PRESERVED=YES');
  // 10. TEST 10 COMMERCIAL FIXTURE & QUOTA CONTRACT (R1.8.8)
  const test10StartIdx = content.indexOf('-- TEST 10: Cross-tenant staff rejected');
  const test11StartIdx = content.indexOf('-- TEST 11: Outside hours slot rejected');

  if (test10StartIdx === -1 || test11StartIdx === -1 || test10StartIdx >= test11StartIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 10 and Test 11 markers missing or out of order');
  }

  const test10Region = content.substring(test10StartIdx, test11StartIdx);

  const t10TenantInsertIdx = test10Region.indexOf('INSERT INTO public.tenants');
  const t10BootstrapIdx = test10Region.indexOf('PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_other_tenant_id);');
  const t10StaffInsertIdx = test10Region.indexOf('INSERT INTO public.staff');
  const t10BookingCallIdx = test10Region.indexOf('create_public_booking');
  const t10AssertionIdx = test10Region.indexOf("reason_code' != 'invalid_staff'");

  if (
    t10TenantInsertIdx === -1 ||
    t10BootstrapIdx === -1 ||
    t10StaffInsertIdx === -1 ||
    t10BookingCallIdx === -1 ||
    t10AssertionIdx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 10 missing required semantic markers');
  }

  if (
    !(
      t10TenantInsertIdx < t10BootstrapIdx &&
      t10BootstrapIdx < t10StaffInsertIdx &&
      t10StaffInsertIdx < t10BookingCallIdx &&
      t10BookingCallIdx < t10AssertionIdx
    )
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 10 semantic markers out of strict required order');
  }

  const bypassKeywords = [
    'DISABLE TRIGGER',
    'session_replication_role',
    'DROP TRIGGER',
    'enforce_staff_quota'
  ];
  for (const kw of bypassKeywords) {
    if (test10Region.includes(kw)) {
      throw new Error(`PUBLIC_BOOKING_CONTRACT_DEFECT: Test 10 contains forbidden quota bypass statement: ${kw}`);
    }
  }

  console.log('PUBLIC_BOOKING_TEST10_MARKERS_FAIL_CLOSED=YES');
  console.log('TEST10_TEMP_TENANT_INSERT_PRESENT=YES');
  console.log('TEST10_COMMERCIAL_BOOTSTRAP_PRESENT=YES');
  console.log('TEST10_TEMP_STAFF_INSERT_PRESENT=YES');
  console.log('TEST10_INVALID_STAFF_ASSERTION_PRESENT=YES');
  console.log('TEST10_COMMERCIAL_BOOTSTRAP_BEFORE_STAFF=YES');
  console.log('TEST10_QUOTA_BYPASS_PRESENT=NO');

  // 11. TEST 16 ADVISORY LOCK INTROSPECTION CONTRACT (R1.8.9)
  const test16StartIdx = content.indexOf('-- TEST 16: Concurrency Advisory Lock Enforcement');
  const test17StartIdx = content.indexOf('-- TEST 17: No PII stored in public_booking_idempotency');

  if (test16StartIdx === -1 || test17StartIdx === -1 || test16StartIdx >= test17StartIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 16 and Test 17 markers missing or out of order');
  }

  const test16Region = content.substring(test16StartIdx, test17StartIdx);

  // Require forbidden old broken representations ABSENT in Test 16 region
  const forbiddenRepresentations = [
    'classid = (v_lock_key >> 32)',
    "objid = (v_lock_key & x'ffffffff'::int)"
  ];
  for (const rep of forbiddenRepresentations) {
    if (test16Region.includes(rep)) {
      throw new Error(`PUBLIC_BOOKING_CONTRACT_DEFECT: Test 16 contains forbidden signed OID comparison representation: ${rep}`);
    }
  }

  // Required markers in Test 16 region
  const t16HashIdx = test16Region.indexOf('hashtextextended');
  const t16LocksIdx = test16Region.indexOf('pg_locks');
  const t16AdvisoryIdx = test16Region.indexOf("locktype = 'advisory'");
  const t16ClassidIdx = test16Region.indexOf('classid::bigint');
  const t16ObjidIdx = test16Region.indexOf('objid::bigint');
  const t16MaskIdx = test16Region.indexOf('4294967295::bigint');
  const t16SubidIdx = test16Region.indexOf('objsubid = 1');
  const t16CountZeroIdx = test16Region.indexOf('v_count = 0');
  const t16RaiseIdx = test16Region.indexOf('RAISE EXCEPTION');
  const t16PassIdx = test16Region.indexOf('TEST 16 PASS');

  if (
    t16HashIdx === -1 ||
    t16LocksIdx === -1 ||
    t16AdvisoryIdx === -1 ||
    t16ClassidIdx === -1 ||
    t16ObjidIdx === -1 ||
    t16MaskIdx === -1 ||
    t16SubidIdx === -1 ||
    t16CountZeroIdx === -1 ||
    t16RaiseIdx === -1 ||
    t16PassIdx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 16 missing required semantic markers');
  }

  // Ordering check: LOCK_KEY_DERIVATION < PG_LOCKS_QUERY < POSITIVE_OBSERVATION_ASSERTION < PASS_MARKER
  if (!(t16HashIdx < t16LocksIdx && t16LocksIdx < t16CountZeroIdx && t16CountZeroIdx < t16PassIdx)) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 16 semantic markers out of strict required order');
  }

  console.log('TEST16_REGION_FAIL_CLOSED=YES');
  console.log('TEST16_CANONICAL_HASH_KEY_PRESENT=YES');
  console.log('TEST16_PG_LOCKS_QUERY_PRESENT=YES');
  console.log('TEST16_CLASSID_BIGINT_NORMALIZATION_PRESENT=YES');
  console.log('TEST16_OBJID_BIGINT_NORMALIZATION_PRESENT=YES');
  console.log('TEST16_UNSIGNED_32BIT_MASK_PRESENT=YES');
  console.log('TEST16_OBJSUBID_SINGLE_BIGINT_PRESENT=YES');
  console.log('TEST16_POSITIVE_LOCK_ASSERTION_PRESENT=YES');
  console.log('TEST16_SIGNED_OID_COMPARISON_PRESENT=NO');
  console.log('PUBLIC_BOOKING_TEST_VS_CANONICAL_PRODUCT_CONTRACT=PASS');
  console.log('✅ Public booking behavioral test suite & product migration source contract PASSED.');
}


function testR187HostedEvidenceHarnessContracts() {
  console.log('--- Testing R1.8.7 Hosted Evidence Harness & Security Contract Repairs ---');

  const fixturePath = path.join(__dirname, '..', 'supabase/tests/fixtures/slice4_e2_commercial_fixture.sql');
  const workspaceTestsPath = path.join(__dirname, '..', 'supabase/tests/health_tourism_clinic_acceptance_workspace_tests.sql');
  const hardeningMigPath = path.join(__dirname, '..', 'supabase/migrations/20260804_appointments_direct_update_hardening.sql');

  const fixtureContent = fs.readFileSync(fixturePath, 'utf8');
  const workspaceTestsContent = fs.readFileSync(workspaceTestsPath, 'utf8');
  const hardeningMigContent = fs.readFileSync(hardeningMigPath, 'utf8');

  // 1. Verify 20260804 migration canonical REVOKE statements
  if (
    !hardeningMigContent.includes('REVOKE UPDATE ON public.appointments FROM PUBLIC;') ||
    !hardeningMigContent.includes('REVOKE UPDATE ON public.appointments FROM anon;') ||
    !hardeningMigContent.includes('REVOKE UPDATE ON public.appointments FROM authenticated;')
  ) {
    throw new Error('R187_CONTRACT_DEFECT: 20260804 migration missing exact REVOKE UPDATE ON public.appointments statements');
  }

  // 2. Commercial Fixture Checks
  if (fixtureContent.includes('DELETE FROM public.subscriptions')) {
    throw new Error('R187_CONTRACT_DEFECT: Commercial fixture contains destructive DELETE FROM public.subscriptions');
  }
  if (fixtureContent.includes('public.subscription_events')) {
    throw new Error('R187_CONTRACT_DEFECT: Commercial fixture mutates append-only subscription_events ledger');
  }
  if (!fixtureContent.includes('UPDATE public.subscriptions') || !fixtureContent.includes('FOR UPDATE')) {
    throw new Error('R187_CONTRACT_DEFECT: Commercial fixture missing update-existing subscription path with FOR UPDATE locking');
  }
  if (!fixtureContent.includes('INSERT INTO public.subscriptions')) {
    throw new Error('R187_CONTRACT_DEFECT: Commercial fixture missing insert-if-missing subscription path');
  }

  // 3. Block2 Test 20 Checks
  if (workspaceTestsContent.includes('zero direct table-write authority')) {
    throw new Error('R187_CONTRACT_DEFECT: Workspace tests still contain stale overbroad zero direct table-write assertion');
  }
  if (
    !workspaceTestsContent.includes("has_table_privilege('anon', 'public.appointments', 'UPDATE') = false") ||
    !workspaceTestsContent.includes("has_table_privilege('authenticated', 'public.appointments', 'UPDATE') = false")
  ) {
    throw new Error('R187_CONTRACT_DEFECT: Workspace tests missing exact appointments UPDATE privilege checks');
  }
  if (
    !workspaceTestsContent.includes('bool_and(c.relrowsecurity) = true') ||
    !workspaceTestsContent.includes("'appointments', 'customers', 'clinic_patient_profiles', 'ht_leads'")
  ) {
    throw new Error('R187_CONTRACT_DEFECT: Workspace tests missing RLS relrowsecurity checks for all four protected tables');
  }

  console.log('COMMERCIAL_FIXTURE_APPEND_ONLY_SAFE=PASS');
  console.log('BLOCK2_TEST20_MATCHES_CANONICAL_SECURITY_CONTRACT=PASS');
  console.log('Finished R1.8.7 Hosted evidence harness & security contracts PASS.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  testConcurrencyHarnessEvidenceContract();
  testPublicBookingSourceContract();
  testR187HostedEvidenceHarnessContracts();
  console.log('\n🎉 ALL HARDENED R9-R1.8.8 CONTRACT SELF-TESTS PASSED!');
}

main();

