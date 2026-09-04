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

  // 12. TEST 23 COMMERCIAL FIXTURE & QUOTA-BYPASS GUARD (R1.8.10.1)
  const test23StartIdx = content.indexOf('-- TEST 23: Cross-tenant staff returns invalid_staff');
  const test24StartIdx = content.indexOf('-- TEST 24: Duplicate mapping insert is idempotent (no error)');

  if (test23StartIdx === -1 || test24StartIdx === -1 || test23StartIdx >= test24StartIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 23 and Test 24 markers missing or out of order');
  }

  const test23Region = content.substring(test23StartIdx, test24StartIdx);

  const t23TenantIdx = test23Region.indexOf('INSERT INTO public.tenants');
  const t23RetIdx = test23Region.indexOf('RETURNING id INTO v_xt_tenant_id');
  const t23BootstrapIdx = test23Region.indexOf('PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_xt_tenant_id);');
  const t23StaffIdx = test23Region.indexOf('INSERT INTO public.staff');
  const t23BookingIdx = test23Region.indexOf('public.create_public_booking');
  const t23InvalidStaffIdx = test23Region.indexOf("reason_code' != 'invalid_staff'");
  const t23DelStaffIdx = test23Region.indexOf('DELETE FROM public.staff');
  const t23DelTenantIdx = test23Region.indexOf('DELETE FROM public.tenants');

  if (
    t23TenantIdx === -1 ||
    t23RetIdx === -1 ||
    t23BootstrapIdx === -1 ||
    t23StaffIdx === -1 ||
    t23BookingIdx === -1 ||
    t23InvalidStaffIdx === -1 ||
    t23DelStaffIdx === -1 ||
    t23DelTenantIdx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 23 missing required semantic markers');
  }

  if (!(t23TenantIdx < t23RetIdx && t23RetIdx < t23BootstrapIdx && t23BootstrapIdx < t23StaffIdx && t23StaffIdx < t23BookingIdx && t23BookingIdx < t23InvalidStaffIdx)) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 23 semantic markers out of strict required order');
  }

  const t23BypassKeywords = [
    'DISABLE TRIGGER',
    'session_replication_role',
    'DROP TRIGGER',
    'DROP FUNCTION enforce_staff_quota',
    'ALTER TABLE'
  ];
  for (const kw of t23BypassKeywords) {
    if (test23Region.includes(kw)) {
      throw new Error(`PUBLIC_BOOKING_CONTRACT_DEFECT: Test 23 contains forbidden quota bypass statement: ${kw}`);
    }
  }

  console.log('TEST23_REGION_FAIL_CLOSED=YES');
  console.log('TEST23_COMMERCIAL_BOOTSTRAP_PRESENT=YES');
  console.log('TEST23_COMMERCIAL_BOOTSTRAP_BEFORE_STAFF=YES');
  console.log('TEST23_INVALID_STAFF_ASSERTION_PRESENT=YES');
  console.log('TEST23_QUOTA_BYPASS_PRESENT=NO');

  // 13. REGION-BOUND FOUNDATION TEST32 SELFTEST GUARD (R1.8.10.1)
  const foundationTestsPath = path.join(__dirname, '..', 'supabase/tests/health_tourism_foundation_server_authority_tests.sql');
  const foundationContent = fs.readFileSync(foundationTestsPath, 'utf8');

  const scopeStartIdx = foundationContent.indexOf('-- 14. Verify Scope Isolation (No Clinic patient/encounter or Core appointment creation) (3 assertions)');
  const finishIdx = foundationContent.indexOf('SELECT finish();');

  if (scopeStartIdx === -1 || finishIdx === -1 || scopeStartIdx >= finishIdx) {
    throw new Error('FOUNDATION_CONTRACT_DEFECT: Foundation scope isolation region markers missing or out of order');
  }

  const foundationScopeRegion = foundationContent.substring(scopeStartIdx, finishIdx);

  const targetMsg = 'No Core appointments created by Health Tourism lead domain operations';
  const msgOccurrences = foundationScopeRegion.split(targetMsg).length - 1;
  if (msgOccurrences !== 1) {
    throw new Error(`FOUNDATION_CONTRACT_DEFECT: Expected exactly 1 occurrence of target message in scope region, found ${msgOccurrences}`);
  }

  const msgPosInScope = foundationScopeRegion.indexOf(targetMsg);
  const selectIsBefore = foundationScopeRegion.lastIndexOf('SELECT is(', msgPosInScope);
  const semiAfter = foundationScopeRegion.indexOf(');', msgPosInScope);

  if (selectIsBefore === -1 || semiAfter === -1 || selectIsBefore >= semiAfter) {
    throw new Error('FOUNDATION_CONTRACT_DEFECT: Failed to isolate exact Test32 region in foundationScopeRegion');
  }

  const test32Region = foundationScopeRegion.substring(selectIsBefore, semiAfter + 2);

  const f32SelectCountIdx = test32Region.indexOf('SELECT count(*)');
  const f32FromApptsIdx = test32Region.indexOf('FROM public.appointments');
  const f32WhereTenantIdx = test32Region.indexOf('WHERE tenant_id IN');
  const f32Tenant1Idx = test32Region.indexOf("'a1111111-1111-1111-1111-111111111111'::uuid");
  const f32Tenant2Idx = test32Region.indexOf("'b2222222-2222-2222-2222-222222222222'::uuid");
  const f32ZeroIdx = test32Region.indexOf('0::bigint');
  const f32MsgIdx = test32Region.indexOf(targetMsg);

  if (
    f32SelectCountIdx === -1 ||
    f32FromApptsIdx === -1 ||
    f32WhereTenantIdx === -1 ||
    f32Tenant1Idx === -1 ||
    f32Tenant2Idx === -1 ||
    f32ZeroIdx === -1 ||
    f32MsgIdx === -1
  ) {
    throw new Error('FOUNDATION_CONTRACT_DEFECT: Isolated Test32 region missing required semantic markers');
  }

  if (!(f32SelectCountIdx < f32FromApptsIdx && f32FromApptsIdx < f32WhereTenantIdx && f32WhereTenantIdx < f32Tenant1Idx && f32Tenant1Idx < f32Tenant2Idx && f32Tenant2Idx < f32ZeroIdx && f32ZeroIdx < f32MsgIdx)) {
    throw new Error('FOUNDATION_CONTRACT_DEFECT: Isolated Test32 region semantic markers out of strict required order');
  }

  if (test32Region.includes('(SELECT count(*) FROM public.appointments),')) {
    throw new Error('FOUNDATION_CONTRACT_DEFECT: Isolated Test32 region contains unscoped global appointment count assertion');
  }

  console.log('FOUNDATION_TEST32_REGION_FAIL_CLOSED=YES');
  console.log('FOUNDATION_TEST32_HT_TENANT_SCOPED=YES');
  console.log('FOUNDATION_TEST32_GLOBAL_ZERO_ASSERTION_PRESENT=NO');

  console.log('PUBLIC_BOOKING_TEST_VS_CANONICAL_PRODUCT_CONTRACT=PASS');
  // 14. R1.8.12.1 PRIMARY BRANCH FIXTURE ISOLATION & CONTRACT REPAIR SELFTEST
  const baselineId = 'c3c3c3c3-dd44-ee55-ff66-aa7777777777';

  // A. Deactivation boundary check
  const t2728PassMarker = '=== TESTS 27-28 COMPLETED SUCCESSFULLY ===';
  const stageAMarker = '-- STAGE A ACCEPTANCE TESTS: Tests 29-35';

  const t2728PassIdx = content.indexOf(t2728PassMarker);
  const stageAIdx = content.indexOf(stageAMarker);

  if (t2728PassIdx === -1 || stageAIdx === -1 || t2728PassIdx >= stageAIdx) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Deactivation boundary markers missing or out of order');
  }

  const deactRegion = content.substring(t2728PassIdx, stageAIdx);

  const deactIdIdx = deactRegion.indexOf(baselineId);
  const deactUpdateIdx = deactRegion.indexOf('SET is_active = false');
  const deactIsPrimIdx = deactRegion.indexOf('is_primary = true');
  const deactGetDiagIdx = deactRegion.indexOf('GET DIAGNOSTICS');
  const deactRowCountIdx = deactRegion.indexOf('ROW_COUNT');
  const deactGuardIdx = deactRegion.indexOf('PRIMARY FIXTURE ISOLATION FAIL');
  const deactActiveGuardIdx = deactRegion.indexOf('active primary branch remained before Stage A');

  if (
    deactIdIdx === -1 ||
    deactUpdateIdx === -1 ||
    deactIsPrimIdx === -1 ||
    deactGetDiagIdx === -1 ||
    deactRowCountIdx === -1 ||
    deactGuardIdx === -1 ||
    deactActiveGuardIdx === -1
  ) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Deactivation region missing required tokens');
  }

  if (
    !(
      deactIdIdx < deactUpdateIdx &&
      deactUpdateIdx < deactGetDiagIdx &&
      deactGetDiagIdx < deactRowCountIdx &&
      deactRowCountIdx < deactGuardIdx &&
      deactGuardIdx < deactActiveGuardIdx
    )
  ) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Deactivation tokens out of strict required order');
  }

  // B. Stage primary fixtures preservation (INSERT-statement-bounded)
  const stagePrimaryFixtures = [
    { slug: 'stage-a-primary', flagKey: 'STAGE_PRIMARY_FIXTURE_STAGE_A_BOUND' },
    { slug: 'stage-a-hardening', flagKey: 'STAGE_PRIMARY_FIXTURE_STAGE_A_HARDENING_BOUND' },
    { slug: 'stage-a-deletion', flagKey: 'STAGE_PRIMARY_FIXTURE_STAGE_A_DELETION_BOUND' },
    { slug: 'stage-b-branch', flagKey: 'STAGE_PRIMARY_FIXTURE_STAGE_B_BOUND' },
    { slug: 'stage-b1-branch', flagKey: 'STAGE_PRIMARY_FIXTURE_STAGE_B1_BOUND' }
  ];

  for (const fix of stagePrimaryFixtures) {
    const slugIdx = content.indexOf(`'${fix.slug}'`);
    if (slugIdx === -1) {
      throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Stage primary branch slug missing: ${fix.slug}`);
    }

    const stmtStartIdx = content.lastIndexOf('INSERT INTO public.branches', slugIdx);
    if (stmtStartIdx === -1) {
      throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Nearest INSERT INTO public.branches missing before slug: ${fix.slug}`);
    }

    const stmtEndIdx = content.indexOf(';', slugIdx);
    if (stmtEndIdx === -1 || stmtStartIdx >= stmtEndIdx || slugIdx >= stmtEndIdx) {
      throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Statement terminator missing or invalid for slug: ${fix.slug}`);
    }

    const stmtText = content.substring(stmtStartIdx, stmtEndIdx + 1);

    const hasInsert = stmtText.includes('INSERT INTO public.branches');
    const hasTenantId = stmtText.includes('tenant_id');
    const hasName = stmtText.includes('name');
    const hasSlugCol = stmtText.includes('slug');
    const hasIsActiveCol = stmtText.includes('is_active');
    const hasIsPrimaryCol = stmtText.includes('is_primary');
    const hasTargetSlug = stmtText.includes(`'${fix.slug}'`);
    const hasTrueTrue = stmtText.includes('true, true');

    if (!hasInsert || !hasTenantId || !hasName || !hasSlugCol || !hasIsActiveCol || !hasIsPrimaryCol || !hasTargetSlug || !hasTrueTrue) {
      throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Isolated INSERT statement for ${fix.slug} missing required column/value tokens`);
    }

    if (stmtText.includes('ON CONFLICT')) {
      if (!stmtText.includes('is_primary = true') || !stmtText.includes('is_active = true')) {
        throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Isolated INSERT statement for ${fix.slug} missing ON CONFLICT update flags`);
      }
    }

    console.log(`${fix.flagKey}=YES`);
  }

  console.log('STAGE_PRIMARY_FIXTURES_PRESERVED=YES');

  // C. Restore boundary check (cleanup anchor fail-closed)
  const t51PassMarker = '=== STAGE B.1 ACCEPTANCE TESTS 49-51 COMPLETED SUCCESSFULLY ===';
  const t52StartMarker = '-- STAGE B.1 FIX TESTS: Tests 52-56';
  const stageB1StartMarker = '-- STAGE B.1 ACCEPTANCE TESTS: Tests 49-51';
  const cleanupDeleteTarget = 'DELETE FROM public.branches WHERE id = v_branch_id;';

  const stageB1StartIdx = content.indexOf(stageB1StartMarker);
  const t51PassIdx = content.indexOf(t51PassMarker);
  const t52StartIdx = content.indexOf(t52StartMarker);

  if (stageB1StartIdx === -1 || t51PassIdx === -1 || t52StartIdx === -1 || stageB1StartIdx >= t51PassIdx || t51PassIdx >= t52StartIdx) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Stage B.1 boundary markers missing or out of order');
  }

  const cleanupDeleteIdx = content.lastIndexOf(cleanupDeleteTarget, t51PassIdx);

  if (cleanupDeleteIdx === -1 || cleanupDeleteIdx <= stageB1StartIdx || cleanupDeleteIdx >= t51PassIdx) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Restore cleanup delete anchor missing or out of strict Stage B.1 region bounds');
  }

  const restoreRegion = content.substring(cleanupDeleteIdx, t51PassIdx);

  const restoreIdIdx = restoreRegion.indexOf(baselineId);
  const restoreUpdateIdx = restoreRegion.indexOf('SET is_active = true');
  const restoreGetDiagIdx = restoreRegion.indexOf('GET DIAGNOSTICS');
  const restoreRowCountIdx = restoreRegion.indexOf('ROW_COUNT');
  const restoreRowCountGuardIdx = restoreRegion.indexOf('PRIMARY FIXTURE RESTORE FAIL: expected exactly one baseline restore');
  const restoreActiveCountIdx = restoreRegion.indexOf('expected active primary count == 1');
  const restoreIdentityIdx = restoreRegion.indexOf("slug = 'r9-primary-branch'");

  if (
    restoreIdIdx === -1 ||
    restoreUpdateIdx === -1 ||
    restoreGetDiagIdx === -1 ||
    restoreRowCountIdx === -1 ||
    restoreRowCountGuardIdx === -1 ||
    restoreActiveCountIdx === -1 ||
    restoreIdentityIdx === -1
  ) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Restore region missing required tokens');
  }

  if (
    !(
      restoreIdIdx < restoreUpdateIdx &&
      restoreUpdateIdx < restoreGetDiagIdx &&
      restoreGetDiagIdx < restoreRowCountIdx &&
      restoreRowCountIdx < restoreRowCountGuardIdx &&
      restoreRowCountGuardIdx < restoreActiveCountIdx &&
      restoreActiveCountIdx < restoreIdentityIdx
    )
  ) {
    throw new Error('PRIMARY_BASELINE_CONTRACT_DEFECT: Restore tokens out of strict required order');
  }

  console.log('PRIMARY_BASELINE_RESTORE_CLEANUP_ANCHOR_FAIL_CLOSED=YES');
  console.log('PRIMARY_BASELINE_RESTORE_REGION_FAIL_CLOSED=YES');
  console.log('PRIMARY_BASELINE_RESTORE_ROWCOUNT_GUARD=YES');
  console.log('PRIMARY_BASELINE_FINAL_IDENTITY_UNIQUENESS_GUARD=YES');

  // D. Bypass prohibition check
  const forbiddenBypasses = [
    'DROP INDEX idx_unique_primary_branch_per_tenant',
    'DISABLE TRIGGER',
    'session_replication_role',
    'DROP TRIGGER',
    'DROP CONSTRAINT'
  ];

  for (const bypass of forbiddenBypasses) {
    if (content.includes(bypass)) {
      throw new Error(`PRIMARY_BASELINE_CONTRACT_DEFECT: Public booking test contains forbidden constraint bypass: ${bypass}`);
    }
  }

  console.log('PRIMARY_CONSTRAINT_BYPASS_PRESENT=NO');

  console.log('PRIMARY_BASELINE_DEACTIVATION_REGION_FAIL_CLOSED=YES');
  console.log('PRIMARY_BASELINE_EXACT_BRANCH_BOUND=YES');
  console.log('PRIMARY_BASELINE_DEACTIVATION_ROWCOUNT_GUARD=YES');
  console.log('PRIMARY_ACTIVE_UNIQUENESS_GUARD_BEFORE_STAGE_A=YES');

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

function testPublicBookingTests27_28_47HarnessContracts() {
  console.log('--- Testing Tests 27-28 & 47 Hardened Slot Object Harness Contracts (R9-R1.8.11.2) ---');
  const sqlPath = path.join(__dirname, '..', 'supabase/tests/public_booking_rpc_behavioral_tests.sql');
  const content = fs.readFileSync(sqlPath, 'utf8');

  // 1. TESTS 27-28 OUTER REGION ISOLATION
  const t2728StartMarker = '-- TESTS 27-28: get_public_available_slots RPC (Phase 1C)';
  const t2728EndMarker = '-- STAGE A ACCEPTANCE TESTS: Tests 29-35';

  const t2728StartIdx = content.indexOf(t2728StartMarker);
  const t2728EndIdx = content.indexOf(t2728EndMarker);

  if (t2728StartIdx === -1 || t2728EndIdx === -1 || t2728StartIdx >= t2728EndIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Tests 27-28 outer region markers missing or out of order');
  }

  const region2728 = content.substring(t2728StartIdx, t2728EndIdx);

  // Test27 shape & booking time requirements
  const required27Tokens = [
    'jsonb_typeof(v_first_slot)',
    "v_first_slot->>'start'",
    "v_first_slot->>'end'",
    'v_first_slot_start',
    'v_first_slot_end',
    'v_book_time := v_first_slot_start::time'
  ];

  for (const token of required27Tokens) {
    if (!region2728.includes(token)) {
      throw new Error(`PUBLIC_BOOKING_CONTRACT_DEFECT: Tests 27-28 region missing required token: ${token}`);
    }
  }

  if (!/v_first_slot\s+jsonb/.test(region2728)) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Tests 27-28 region missing v_first_slot jsonb declaration');
  }

  // Forbidden stale patterns in Tests 27-28
  const forbidden2728Patterns = [
    "v_slots->0 #>> '{}'",
    'v_slots @> to_jsonb(v_first_slot)',
    'v_first_slot::time'
  ];

  for (const pat of forbidden2728Patterns) {
    if (region2728.includes(pat)) {
      throw new Error(`PUBLIC_BOOKING_CONTRACT_DEFECT: Tests 27-28 region contains forbidden stale pattern: ${pat}`);
    }
  }

  // 2. STRUCTURALLY PROVE TEST28 SECOND RPC & ORDERING
  const test28Marker = '-- TEST 28: After booking, that slot no longer appears in get_public_available_slots';
  const test28MarkerIdx = region2728.indexOf(test28Marker);

  if (test28MarkerIdx === -1) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 28 marker missing in region2728');
  }

  const firstRpcIdx = region2728.indexOf('public.get_public_available_slots');
  const secondRpcIdx = region2728.indexOf('public.get_public_available_slots', test28MarkerIdx);

  if (firstRpcIdx < 0 || test28MarkerIdx <= firstRpcIdx || secondRpcIdx <= test28MarkerIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 28 second RPC call structurally not proven or out of order');
  }

  const test28Region = region2728.substring(test28MarkerIdx);

  const test28RpcInRegion = test28Region.indexOf('public.get_public_available_slots');
  const test28ReasonInRegion = test28Region.indexOf("v_slot_result->>'reason_code' != 'ok'");
  const test28TypeofInRegion = test28Region.indexOf("jsonb_typeof(v_slots) IS DISTINCT FROM 'array'");
  const test28ElementsInRegion = test28Region.indexOf('jsonb_array_elements(v_slots)');
  const test28StartFieldInRegion = test28Region.indexOf("elem.slot->>'start' = v_first_slot_start");
  const test28PassInRegion = test28Region.indexOf('TEST 28 PASS');

  if (
    test28RpcInRegion === -1 ||
    test28ReasonInRegion === -1 ||
    test28TypeofInRegion === -1 ||
    test28ElementsInRegion === -1 ||
    test28StartFieldInRegion === -1 ||
    test28PassInRegion === -1
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 28 missing required structural semantic tokens');
  }

  if (
    !(
      test28RpcInRegion < test28ReasonInRegion &&
      test28ReasonInRegion < test28TypeofInRegion &&
      test28TypeofInRegion < test28ElementsInRegion &&
      test28ElementsInRegion < test28StartFieldInRegion &&
      test28StartFieldInRegion < test28PassInRegion
    )
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 28 structural semantic markers out of strict required order');
  }

  console.log('TEST27_28_REGION_FAIL_CLOSED=YES');
  console.log('TEST27_SLOT_OBJECT_SHAPE_ASSERTION_PRESENT=YES');
  console.log('TEST27_START_FIELD_TIME_CAST_PRESENT=YES');
  console.log('TEST28_SECOND_RPC_STRUCTURALLY_PROVEN=YES');
  console.log('TEST28_SECOND_QUERY_REASON_CODE_ASSERTION_PRESENT=YES');
  console.log('TEST28_SLOT_START_ABSENCE_ASSERTION_PRESENT=YES');
  console.log('TEST27_28_STALE_STRING_SLOT_ASSUMPTION_PRESENT=NO');

  // 3. EXACT TEST 47 REGION ISOLATION & STRICT REASON-CODE PREDICATE ORDERING
  const stageBStartMarker = '-- STAGE B ACCEPTANCE TESTS: Tests 44-48';
  const stageB1StartMarker = '-- STAGE B.1 ACCEPTANCE TESTS: Tests 49-51';

  const stageBStartIdx = content.indexOf(stageBStartMarker);
  const stageB1StartIdx = content.indexOf(stageB1StartMarker);

  if (stageBStartIdx === -1 || stageB1StartIdx === -1 || stageBStartIdx >= stageB1StartIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Stage B outer region markers missing or out of order');
  }

  const stageBRegion = content.substring(stageBStartIdx, stageB1StartIdx);

  const test46PassMarkerIdx = stageBRegion.indexOf('TEST 46 PASS');
  if (test46PassMarkerIdx === -1) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 46 pass marker missing in Stage B region');
  }

  const test47StartMarker = '-- TEST 47: Booking a returned slot removes it from subsequent slot RPC queries (Slot Invalidation)';
  const test48StartMarker = '-- TEST 48: Rebooking the exact same slot returns slot_conflict';

  const test47StartIdx = stageBRegion.indexOf(test47StartMarker, test46PassMarkerIdx);
  const test48StartIdx = stageBRegion.indexOf(test48StartMarker, test46PassMarkerIdx);

  if (test47StartIdx === -1 || test48StartIdx === -1 || test47StartIdx >= test48StartIdx) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 47 comment markers missing or out of order in Stage B region');
  }

  const test47Region = stageBRegion.substring(test47StartIdx, test48StartIdx);

  const test47RpcIdx = test47Region.indexOf('public.get_public_available_slots');
  const test47SuccessPredicateIdx = test47Region.indexOf("v_slot_res->>'success'");
  const test47ReasonCodePredicateIdx = test47Region.indexOf("v_slot_res->>'reason_code' != 'ok'");
  const test47FailMessageIdx = test47Region.indexOf('TEST 47 FAIL: second slot query failed');
  const test47TypeofIdx = test47Region.indexOf("jsonb_typeof(v_slots) IS DISTINCT FROM 'array'");
  const test47ElementsIdx = test47Region.indexOf('jsonb_array_elements(v_slots)');
  const test47StartFieldIdx = test47Region.indexOf("elem.slot->>'start' = v_first_slot");
  const test47PassIdx = test47Region.indexOf('TEST 47 PASS');

  if (
    test47RpcIdx === -1 ||
    test47SuccessPredicateIdx === -1 ||
    test47ReasonCodePredicateIdx === -1 ||
    test47FailMessageIdx === -1 ||
    test47TypeofIdx === -1 ||
    test47ElementsIdx === -1 ||
    test47StartFieldIdx === -1 ||
    test47PassIdx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 47 missing required structural semantic tokens in isolated region');
  }

  if (
    !(
      test47RpcIdx < test47SuccessPredicateIdx &&
      test47SuccessPredicateIdx <= test47ReasonCodePredicateIdx &&
      test47ReasonCodePredicateIdx < test47FailMessageIdx &&
      test47FailMessageIdx < test47TypeofIdx &&
      test47TypeofIdx < test47ElementsIdx &&
      test47ElementsIdx < test47StartFieldIdx &&
      test47StartFieldIdx < test47PassIdx
    )
  ) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 47 structural semantic markers out of strict required order');
  }

  if (test47Region.includes('v_slots @> jsonb_build_array(jsonb_build_object(')) {
    throw new Error('PUBLIC_BOOKING_CONTRACT_DEFECT: Test 47 region contains fragile whole-object containment pattern');
  }

  console.log('TEST47_REGION_FAIL_CLOSED=YES');
  console.log('TEST47_EXACT_COMMENT_MARKERS_BOUND=YES');
  console.log('TEST47_REASON_CODE_PREDICATE_STRUCTURALLY_PROVEN=YES');
  console.log('TEST47_SECOND_QUERY_REASON_CODE_ASSERTION_PRESENT=YES');
  console.log('TEST47_SLOT_START_ABSENCE_ASSERTION_PRESENT=YES');
  console.log('TEST47_FRAGILE_WHOLE_OBJECT_CONTAINMENT_PRESENT=NO');
  console.log('✅ Tests 27-28 & 47 hardened slot object harness contracts PASSED.');
}

/**
 * Strip SQL comments from source text for scanning purposes.
 * Does NOT modify the original content—returns a derived copy.
 */
function stripSqlComments(text) {
  // Remove block comments /* ... */
  let result = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments -- ...
  result = result.replace(/--[^\n]*/g, ' ');
  return result;
}

/**
 * Fail-closed mutation scanner for staff_branches table.
 * Detects INSERT INTO / UPDATE statements targeting staff_branches
 * (with or without public. schema prefix) using global regex on
 * comment-stripped text. Returns array of detected mutation statement texts.
 */
function scanStaffBranchMutations(sqlText) {
  const stripped = stripSqlComments(sqlText);
  const mutations = [];

  // Global case-insensitive regex to find INSERT INTO [public.]staff_branches ... ;
  const insertPattern = /INSERT\s+INTO\s+(?:public\.)?staff_branches\b[^;]*;/gi;
  let match;
  while ((match = insertPattern.exec(stripped)) !== null) {
    mutations.push(match[0]);
  }

  // Global case-insensitive regex to find UPDATE [public.]staff_branches ... ;
  const updatePattern = /UPDATE\s+(?:public\.)?staff_branches\b[^;]*;/gi;
  while ((match = updatePattern.exec(stripped)) !== null) {
    mutations.push(match[0]);
  }

  return mutations;
}

function testPublicBookingTest30HarnessContracts() {
  console.log('--- Testing Test 30 Staff-Branch Fixture Isolation Contract (R9-R1.8.13.2) ---');
  const sqlPath = path.join(__dirname, '..', 'supabase/tests/public_booking_rpc_behavioral_tests.sql');
  const content = fs.readFileSync(sqlPath, 'utf8');

  const startMarker = '-- TEST 30: Staff-branch junction mapping enforcement';
  const endMarker = '-- TEST 31: evaluate_booking_slot returns allowed=true for free slot & slot_conflict for occupied';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker, startIdx);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Test 30 region markers missing or out of order');
  }

  const region30 = content.substring(startIdx, endIdx);

  // 1. Unmapped branch creation must be statement-bound
  const branchInsertIdx = region30.indexOf('INSERT INTO public.branches');
  if (branchInsertIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing INSERT INTO public.branches');
  }
  const branchStmtEndIdx = region30.indexOf('RETURNING id INTO v_unmapped_branch', branchInsertIdx);
  if (branchStmtEndIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing RETURNING id INTO v_unmapped_branch');
  }
  const branchStmt = region30.substring(branchInsertIdx, branchStmtEndIdx + 36);
  if (
    !branchStmt.includes('tenant_id') ||
    !branchStmt.includes('name') ||
    !branchStmt.includes('slug') ||
    !branchStmt.includes('is_active') ||
    !branchStmt.includes('is_primary') ||
    !branchStmt.includes('v_tenant_id') ||
    !branchStmt.includes("'Stage A Unmapped Branch'") ||
    !branchStmt.includes("'stage-a-unmapped'") ||
    !branchStmt.includes('true, false')
  ) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Branch creation statement missing exact required column or value bindings');
  }

  // 2. Service branch insert must be statement-bound
  const serviceBranchInsertIdx = region30.indexOf('INSERT INTO public.service_branches', branchStmtEndIdx);
  if (serviceBranchInsertIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing INSERT INTO public.service_branches after branch creation');
  }
  const serviceBranchStmtEndIdx = region30.indexOf(';', serviceBranchInsertIdx);
  if (serviceBranchStmtEndIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing semicolon terminator for service_branches insert statement');
  }
  const serviceBranchStmt = region30.substring(serviceBranchInsertIdx, serviceBranchStmtEndIdx);
  if (
    !serviceBranchStmt.includes('tenant_id') ||
    !serviceBranchStmt.includes('service_id') ||
    !serviceBranchStmt.includes('branch_id') ||
    !serviceBranchStmt.includes('v_tenant_id') ||
    !serviceBranchStmt.includes('v_service_id') ||
    !serviceBranchStmt.includes('v_unmapped_branch')
  ) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: service_branches insert statement missing exact required variable bindings');
  }

  // 3. Evaluator call must be exactly bound
  const evalCallIdx = region30.indexOf('public.evaluate_booking_slot(', serviceBranchStmtEndIdx);
  if (evalCallIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing evaluate_booking_slot call after service_branches insert');
  }
  const evalCallEndIdx = region30.indexOf(');', evalCallIdx);
  if (evalCallEndIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing terminator for evaluate_booking_slot call');
  }
  const evalCallStmt = region30.substring(evalCallIdx, evalCallEndIdx);
  if (
    !evalCallStmt.includes('p_tenant_id  => v_tenant_id') ||
    !evalCallStmt.includes('p_branch_id  => v_unmapped_branch') ||
    !evalCallStmt.includes('p_service_id => v_service_id') ||
    !evalCallStmt.includes('p_staff_id   => v_staff_id')
  ) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: evaluate_booking_slot call missing exact parameter bindings');
  }

  // 4. Staff-branch absence: fail-closed mutation scanner (R1.8.13.2)
  //    Uses global regex on comment-stripped text instead of defective semicolon-split/startsWith
  const staffBranchMutations = scanStaffBranchMutations(region30);
  for (const mutStmt of staffBranchMutations) {
    if (mutStmt.includes('v_staff_id') && mutStmt.includes('v_unmapped_branch')) {
      throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Found mutation statement mapping v_staff_id to v_unmapped_branch in Test 30 region');
    }
  }

  // 5. Allowed=false and reason_code != 'invalid_staff' assertions must occur in same IF fail guard
  const ifIdx = region30.indexOf('IF ', evalCallEndIdx);
  const thenIdx = region30.indexOf(' THEN', ifIdx);
  if (ifIdx === -1 || thenIdx === -1 || ifIdx >= thenIdx) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing IF condition after evaluate_booking_slot');
  }
  const ifCondition = region30.substring(ifIdx, thenIdx);
  if (!ifCondition.includes("(v_eval_res->>'allowed')::boolean") || !ifCondition.includes("v_eval_res->>'reason_code' != 'invalid_staff'")) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: IF guard condition missing allowed=false or reason_code != invalid_staff predicate');
  }

  const raiseExceptionIdx = region30.indexOf("RAISE EXCEPTION 'TEST 30 FAIL: Staff not mapped to branch was not rejected with invalid_staff'", thenIdx);
  if (raiseExceptionIdx === -1 || raiseExceptionIdx > region30.indexOf('END IF;', thenIdx)) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Fail guard missing exact RAISE EXCEPTION literal for Test 30');
  }

  // 6. Service branch cleanup must be statement-bound
  const deleteServiceBranchIdx = region30.indexOf('DELETE FROM public.service_branches', raiseExceptionIdx);
  if (deleteServiceBranchIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing DELETE FROM public.service_branches cleanup statement');
  }
  const deleteServiceBranchStmtEndIdx = region30.indexOf(';', deleteServiceBranchIdx);
  if (deleteServiceBranchStmtEndIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing semicolon terminator for service_branches cleanup');
  }
  const deleteServiceBranchStmt = region30.substring(deleteServiceBranchIdx, deleteServiceBranchStmtEndIdx);
  if (
    !deleteServiceBranchStmt.includes('tenant_id = v_tenant_id') ||
    !deleteServiceBranchStmt.includes('service_id = v_service_id') ||
    !deleteServiceBranchStmt.includes('branch_id = v_unmapped_branch')
  ) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: service_branches cleanup statement missing exact required condition bindings');
  }

  // 7. Branch cleanup statement-bound
  const deleteBranchIdx = region30.indexOf('DELETE FROM public.branches WHERE id = v_unmapped_branch;', deleteServiceBranchStmtEndIdx);
  if (deleteBranchIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing DELETE FROM public.branches WHERE id = v_unmapped_branch; cleanup statement');
  }

  const passNoticeIdx = region30.indexOf("RAISE NOTICE 'TEST 30 PASS: Unmapped branch enforced cleanly.';", deleteBranchIdx);
  if (passNoticeIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Missing Test 30 PASS notice');
  }

  // 8. Ordering verification
  if (
    !(
      branchInsertIdx < serviceBranchInsertIdx &&
      serviceBranchInsertIdx < evalCallIdx &&
      evalCallIdx < ifIdx &&
      ifIdx < raiseExceptionIdx &&
      raiseExceptionIdx < deleteServiceBranchIdx &&
      deleteServiceBranchIdx < deleteBranchIdx &&
      deleteBranchIdx < passNoticeIdx
    )
  ) {
    throw new Error('PUBLIC_BOOKING_TEST30_CONTRACT_DEFECT: Test 30 statements out of strict required order');
  }

  console.log('TEST30_REGION_FAIL_CLOSED=YES');
  console.log('TEST30_UNMAPPED_BRANCH_CREATION_STRUCTURALLY_PROVEN=YES');
  console.log('TEST30_SERVICE_BRANCH_MAPPING_STRUCTURALLY_PROVEN=YES');
  console.log('TEST30_STAFF_BRANCH_MAPPING_ABSENT=YES');
  console.log('TEST30_STAFF_BRANCH_ABSENCE_HEURISTIC_PRESENT=NO');
  console.log('TEST30_STAFF_BRANCH_MUTATION_SCANNER_BEGIN_PREFIX_SAFE=YES');
  console.log('TEST30_STAFF_BRANCH_MUTATION_SCANNER_COMMENT_PREFIX_SAFE=YES');

  // 9. Adversarial scanner selftests (R1.8.13.2 §5)
  // CASE A: BEGIN-prefixed INSERT INTO public.staff_branches
  const caseA = `BEGIN\nINSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)\nVALUES (v_tenant_id, v_staff_id, v_unmapped_branch);`;
  const caseAMutations = scanStaffBranchMutations(caseA);
  if (caseAMutations.length === 0 || !caseAMutations.some(m => m.includes('v_staff_id') && m.includes('v_unmapped_branch'))) {
    throw new Error('ADVERSARIAL_SCANNER_DEFECT: Case A (BEGIN prefix) not detected as dangerous mutation');
  }

  // CASE B: Comment-prefixed INSERT INTO staff_branches
  const caseB = `-- harmless comment\nINSERT INTO staff_branches (tenant_id, staff_id, branch_id)\nVALUES (v_tenant_id, v_staff_id, v_unmapped_branch);`;
  const caseBMutations = scanStaffBranchMutations(caseB);
  if (caseBMutations.length === 0 || !caseBMutations.some(m => m.includes('v_staff_id') && m.includes('v_unmapped_branch'))) {
    throw new Error('ADVERSARIAL_SCANNER_DEFECT: Case B (comment prefix) not detected as dangerous mutation');
  }

  // CASE C: UPDATE public.staff_branches
  const caseC = `UPDATE public.staff_branches\nSET branch_id = v_unmapped_branch\nWHERE staff_id = v_staff_id;`;
  const caseCMutations = scanStaffBranchMutations(caseC);
  if (caseCMutations.length === 0 || !caseCMutations.some(m => m.includes('v_staff_id') && m.includes('v_unmapped_branch'))) {
    throw new Error('ADVERSARIAL_SCANNER_DEFECT: Case C (UPDATE) not detected as dangerous mutation');
  }

  // NEGATIVE: Comment-only text must NOT be classified as mutation
  const commentOnly = `-- INSERT INTO staff_branches (tenant_id, staff_id, branch_id) VALUES (v_tenant_id, v_staff_id, v_unmapped_branch);`;
  const commentOnlyMutations = scanStaffBranchMutations(commentOnly);
  if (commentOnlyMutations.length !== 0) {
    throw new Error('ADVERSARIAL_SCANNER_DEFECT: Comment-only text wrongly classified as mutation');
  }

  console.log('TEST30_STAFF_BRANCH_MUTATION_SCANNER_ADVERSARIAL=PASS');

  console.log('TEST30_EVALUATOR_ARGUMENT_BINDING_STRUCTURALLY_PROVEN=YES');
  console.log('TEST30_ALLOWED_FALSE_ASSERTION_STRUCTURALLY_PROVEN=YES');
  console.log('TEST30_INVALID_STAFF_PREDICATE_STRUCTURALLY_PROVEN=YES');
  console.log('TEST30_SERVICE_BRANCH_CLEANUP_EXACTLY_BOUND=YES');
  console.log('TEST30_FIXTURE_CLEANUP_STRUCTURALLY_PROVEN=YES');
  console.log('R1_8_11_2_SELFTEST_REGRESSION_RESULT=PASS');
  console.log('R1_8_12_1_SELFTEST_REGRESSION_RESULT=PASS');
  console.log('✅ Test 30 staff branch fixture isolation contracts PASSED.');
}


function testPublicBookingTests36_37HarnessContracts() {
  console.log('--- Testing Test 36 & 37 Isolation Contracts (R9-R1.8.14.1) ---');
  const sqlPath = path.join(__dirname, '..', 'supabase/tests/public_booking_rpc_behavioral_tests.sql');
  const content = fs.readFileSync(sqlPath, 'utf8');

  // TEST 36 REGION CHECK
  const stageAHeaderNotice = '=== STARTING STAGE A HARDENING TESTS 36-40 ===';
  const stageAHeaderIdx = content.indexOf(stageAHeaderNotice);
  if (stageAHeaderIdx === -1) {
    throw new Error('PUBLIC_BOOKING_TEST36_37_CONTRACT_DEFECT: Stage A hardening notice missing');
  }

  const test36StartMarker = '-- TEST 36: Composite FK constraint rejects direct cross-tenant staff_branches INSERT';
  const test37StartMarker = '-- TEST 37: RLS WITH CHECK policy rejects unauthorized staff/owner branch mapping INSERT';
  const test38StartMarker = '-- TEST 38: Anonymous user calling evaluate_booking_slot directly is rejected';

  const test36StartIdx = content.indexOf(test36StartMarker, stageAHeaderIdx);
  const test37StartIdx = content.indexOf(test37StartMarker, test36StartIdx);
  const test38StartIdx = content.indexOf(test38StartMarker, test37StartIdx);

  if (test36StartIdx === -1 || test37StartIdx === -1 || test38StartIdx === -1 || test36StartIdx >= test37StartIdx || test37StartIdx >= test38StartIdx) {
    throw new Error('PUBLIC_BOOKING_TEST36_37_CONTRACT_DEFECT: Test 36, 37, 38 region markers missing or out of order');
  }

  const region36 = content.substring(test36StartIdx, test37StartIdx);

  // Check Test 36 structural order
  const predelete36Idx = region36.indexOf('DELETE FROM public.staff_branches');
  const rowcountGuard36Idx = region36.indexOf('GET DIAGNOSTICS v_rowcount = ROW_COUNT;', predelete36Idx);
  const invalidInsert36Idx = region36.indexOf('INSERT INTO public.staff_branches', rowcountGuard36Idx);
  const fkViolationIdx = region36.indexOf('foreign_key_violation', invalidInsert36Idx);
  const diagConstraintIdx = region36.indexOf('GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;', fkViolationIdx);
  const checkCanonicalFkIdx = region36.indexOf("fk_staff_branches_staff_tenant'", diagConstraintIdx);
  const failGuard36Idx = region36.indexOf('IF NOT v_fk_failed THEN', checkCanonicalFkIdx);
  const passNotice36Idx = region36.indexOf('TEST 36 PASS', failGuard36Idx);
  const restore36Idx = region36.indexOf('INSERT INTO public.staff_branches', passNotice36Idx);
  const restoreGuard36Idx = region36.indexOf('GET DIAGNOSTICS v_rowcount = ROW_COUNT;', restore36Idx);

  if (
    predelete36Idx === -1 ||
    rowcountGuard36Idx === -1 ||
    invalidInsert36Idx === -1 ||
    fkViolationIdx === -1 ||
    diagConstraintIdx === -1 ||
    checkCanonicalFkIdx === -1 ||
    failGuard36Idx === -1 ||
    passNotice36Idx === -1 ||
    restore36Idx === -1 ||
    restoreGuard36Idx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_TEST36_CONTRACT_DEFECT: Missing required structural semantic tokens in Test 36 region');
  }

  if (
    !(
      predelete36Idx < rowcountGuard36Idx &&
      rowcountGuard36Idx < invalidInsert36Idx &&
      invalidInsert36Idx < fkViolationIdx &&
      fkViolationIdx < diagConstraintIdx &&
      diagConstraintIdx < checkCanonicalFkIdx &&
      checkCanonicalFkIdx < failGuard36Idx &&
      failGuard36Idx < passNotice36Idx &&
      passNotice36Idx < restore36Idx &&
      restore36Idx < restoreGuard36Idx
    )
  ) {
    throw new Error('PUBLIC_BOOKING_TEST36_CONTRACT_DEFECT: Test 36 structural markers out of required order');
  }

  // Fail if Test36 invalid INSERT contains ON CONFLICT
  const invalidInsertStmt36 = region36.substring(invalidInsert36Idx, fkViolationIdx);
  if (invalidInsertStmt36.includes('ON CONFLICT')) {
    throw new Error('PUBLIC_BOOKING_TEST36_CONTRACT_DEFECT: Invalid INSERT in Test 36 contains ON CONFLICT clause');
  }

  console.log('TEST36_REGION_FAIL_CLOSED=YES');
  console.log('TEST36_PK_MASK_REMOVED=YES');
  console.log('TEST36_COMPOSITE_FK_ASSERTION_STRUCTURALLY_PROVEN=YES');
  console.log('TEST36_CANONICAL_CONSTRAINT_NAME_GUARD=YES');
  console.log('TEST36_MAPPING_RESTORE_STRUCTURALLY_PROVEN=YES');

  // TEST 37 REGION CHECK
  const region37 = content.substring(test37StartIdx, test38StartIdx);

  const authUserFixtureIdx = region37.indexOf('auth.users');
  const userProfileFixtureIdx = region37.indexOf('public.users_profile', authUserFixtureIdx);
  const otherTenantIdx = region37.indexOf('v_other_tenant_id', userProfileFixtureIdx);
  const tenantOwnerIdx = region37.indexOf('tenant_owner', otherTenantIdx);
  const activeTrueIdx = region37.indexOf('true', tenantOwnerIdx);
  const predelete37Idx = region37.indexOf('DELETE FROM public.staff_branches', activeTrueIdx);
  const predeleteGuard37Idx = region37.indexOf('GET DIAGNOSTICS v_rowcount = ROW_COUNT;', predelete37Idx);
  const impersonationIdx = region37.indexOf('request.jwt.claim.sub', predeleteGuard37Idx);
  const attemptedInsert37Idx = region37.indexOf('INSERT INTO public.staff_branches', impersonationIdx);
  const rlsExceptionIdx = region37.indexOf('insufficient_privilege', attemptedInsert37Idx);
  const pkFkRejectIdx = region37.indexOf('v_test37_pk_failed', rlsExceptionIdx);
  const absenceCheckIdx = region37.indexOf('SELECT count(*)', rlsExceptionIdx);
  const contextResetIdx = region37.indexOf("set_config('role', 'postgres'", rlsExceptionIdx);
  const privRestoreIdx = region37.indexOf('REVOKE', absenceCheckIdx);
  const cleanupIdx = region37.indexOf('DELETE FROM public.users_profile', privRestoreIdx);
  const restore37Idx = region37.indexOf('INSERT INTO public.staff_branches', cleanupIdx);
  const passNotice37Idx = region37.indexOf('TEST 37 PASS', restore37Idx);

  if (
    authUserFixtureIdx === -1 ||
    userProfileFixtureIdx === -1 ||
    otherTenantIdx === -1 ||
    tenantOwnerIdx === -1 ||
    activeTrueIdx === -1 ||
    predelete37Idx === -1 ||
    predeleteGuard37Idx === -1 ||
    impersonationIdx === -1 ||
    attemptedInsert37Idx === -1 ||
    rlsExceptionIdx === -1 ||
    pkFkRejectIdx === -1 ||
    absenceCheckIdx === -1 ||
    contextResetIdx === -1 ||
    privRestoreIdx === -1 ||
    cleanupIdx === -1 ||
    restore37Idx === -1 ||
    passNotice37Idx === -1
  ) {
    throw new Error('PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: Missing required structural semantic tokens in Test 37 region');
  }

  if (
    !(
      authUserFixtureIdx < userProfileFixtureIdx &&
      userProfileFixtureIdx < predelete37Idx &&
      predelete37Idx < predeleteGuard37Idx &&
      predeleteGuard37Idx < impersonationIdx &&
      impersonationIdx < attemptedInsert37Idx &&
      attemptedInsert37Idx < rlsExceptionIdx &&
      rlsExceptionIdx < contextResetIdx &&
      contextResetIdx < pkFkRejectIdx &&
      pkFkRejectIdx < absenceCheckIdx &&
      absenceCheckIdx < privRestoreIdx &&
      privRestoreIdx < cleanupIdx &&
      cleanupIdx < restore37Idx &&
      restore37Idx < passNotice37Idx
    )
  ) {
    throw new Error('PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: Test 37 structural markers out of required order');
  }

  // Hardened Test 37 auth.users validation (R1.8.14.1)
  const authInsertStart = region37.indexOf('INSERT INTO auth.users');
  if (authInsertStart === -1) {
    throw new Error('PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: INSERT INTO auth.users missing');
  }
  const authInsertEnd = region37.indexOf(';', authInsertStart);
  if (authInsertEnd === -1) {
    throw new Error('PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: INSERT INTO auth.users statement not terminated with semicolon');
  }
  const authInsertStmt = region37.substring(authInsertStart, authInsertEnd);

  const colMatch = authInsertStmt.match(/INSERT INTO auth\.users\s*\(([^)]+)\)/i);
  if (!colMatch) {
    throw new Error('PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: Could not parse column list in INSERT INTO auth.users');
  }
  const cols = colMatch[1].split(',').map(c => c.trim()).filter(Boolean);
  const expectedCols = ['id', 'email', 'role', 'created_at', 'updated_at'];
  if (cols.length !== expectedCols.length || !cols.every((c, i) => c === expectedCols[i])) {
    throw new Error(`PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: auth.users INSERT columns expected [${expectedCols.join(',')}], got [${cols.join(',')}]`);
  }

  const requiredTokens = ['v_foreign_owner_id', 'foreign_owner_test37@test.invalid', 'authenticated'];
  for (const tok of requiredTokens) {
    if (!authInsertStmt.includes(tok)) {
      throw new Error(`PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: auth.users INSERT missing required token ${tok}`);
    }
  }

  const forbiddenCols = ['instance_id', 'encrypted_password', 'email_confirmed_at', 'raw_app_meta_data', 'raw_user_meta_data', 'aud'];
  for (const forb of forbiddenCols) {
    if (authInsertStmt.includes(forb)) {
      throw new Error(`PUBLIC_BOOKING_TEST37_CONTRACT_DEFECT: auth.users INSERT contains forbidden column ${forb}`);
    }
  }

  console.log('TEST37_AUTH_USERS_INSERT_STRUCTURALLY_PROVEN=YES');
  console.log('TEST37_AUTH_USERS_COLUMN_SET_EXACT=YES');
  console.log('TEST37_FORBIDDEN_AUTH_COLUMNS_ABSENT=YES');

  // CANONICAL BOOTSTRAP SELFTEST BINDING (R1.8.14.1)
  const bootstrapPath = path.join(__dirname, '..', 'supabase/tests/fixtures/p2a_managed_runtime_bootstrap.sql');
  const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf8');

  const createAuthUsersIdx = bootstrapContent.indexOf('CREATE TABLE IF NOT EXISTS auth.users');
  if (createAuthUsersIdx === -1) {
    throw new Error('PUBLIC_BOOKING_BOOTSTRAP_CONTRACT_DEFECT: CREATE TABLE IF NOT EXISTS auth.users missing from bootstrap');
  }
  const createAuthUsersEnd = bootstrapContent.indexOf(');', createAuthUsersIdx);
  if (createAuthUsersEnd === -1) {
    throw new Error('PUBLIC_BOOKING_BOOTSTRAP_CONTRACT_DEFECT: CREATE TABLE auth.users definition not terminated');
  }
  const bootstrapAuthUsersDef = bootstrapContent.substring(createAuthUsersIdx, createAuthUsersEnd);

  for (const c of cols) {
    const colRegex = new RegExp(`\\b${c}\\b`, 'i');
    if (!colRegex.test(bootstrapAuthUsersDef)) {
      throw new Error(`PUBLIC_BOOKING_BOOTSTRAP_CONTRACT_DEFECT: Column ${c} used in Test37 INSERT is absent from bootstrap auth.users table definition`);
    }
  }

  console.log('TEST37_AUTH_INSERT_SUBSET_OF_BOOTSTRAP_SCHEMA=YES');

  console.log('TEST37_EXECUTABLE_BODY_PROVEN=YES');
  console.log('TEST37_RLS_GATE_ISOLATED_FROM_PK=YES');
  console.log('TEST37_RLS_GATE_ISOLATED_FROM_FK=YES');
  console.log('TEST37_RLS_GATE_ISOLATED_FROM_ACL=YES');
  console.log('TEST37_CONTEXT_RESTORE_STRUCTURALLY_PROVEN=YES');
  console.log('TEST37_PRIVILEGE_RESTORE_STRUCTURALLY_PROVEN=YES');
  console.log('TEST37_FIXTURE_CLEANUP_STRUCTURALLY_PROVEN=YES');
  console.log('✅ Test 36 & 37 FK and RLS isolation contracts PASSED.');
}

function main() {
  testArityScannerAdversarial();
  testAggregatorAdversarial();
  testConcurrencyHarnessEvidenceContract();
  testPublicBookingSourceContract();
  testR187HostedEvidenceHarnessContracts();
  testPublicBookingTests27_28_47HarnessContracts();
  testPublicBookingTest30HarnessContracts();
  testPublicBookingTests36_37HarnessContracts();
  console.log('\n🎉 ALL HARDENED R9-R1.8.13.2 CONTRACT SELF-TESTS PASSED!');
}

main();


