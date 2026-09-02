// ============================================================================
// SELF-TEST SUITE FOR ARITY SCANNER & EVIDENCE AGGREGATOR
// File: scripts/test-r9-contracts-selftest.mjs
// Purpose:
//   Local verification of arity scanner and evidence aggregator.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runArityScanner, tokenizeSql, parseAndVerifyInsertStatements } from './test-health-tourism-slice4-fixture-arity-contract.mjs';
import { aggregateEvidence } from './aggregate-lari-e2-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testArityScanner() {
  console.log('--- Testing Arity Scanner Lexical Adversarial Fixtures ---');

  const validSql = `
    -- Line comment with comma, and (parens)
    /* Block comment with (comma, inside) */
    INSERT INTO public.test_table (col1, col2, col3) VALUES
      ('value 1, with comma', 100, NOW() - INTERVAL '1 day'),
      ('another ''escaped'' quote', gen_random_uuid(), ARRAY[1, 2, 3]);

    DO $$
    BEGIN
      INSERT INTO public.do_table (id, name) VALUES ('id1', 'name1');
    END $$;
  `;

  const tokens = tokenizeSql(validSql, 'valid.sql');
  const res = parseAndVerifyInsertStatements(tokens, 'valid.sql');
  if (res.mismatchOccurrences !== 0) {
    throw new Error(`Arity scanner self-test failed on valid SQL! Occurrences: ${res.mismatchOccurrences}`);
  }

  const invalidSql = `
    INSERT INTO public.bad_table (col1, col2) VALUES
      ('v1', 'v2', 'v3_extra');
  `;
  const badTokens = tokenizeSql(invalidSql, 'invalid.sql');
  const badRes = parseAndVerifyInsertStatements(badTokens, 'invalid.sql');
  if (badRes.mismatchOccurrences !== 1) {
    throw new Error(`Arity scanner failed to catch deliberate tuple mismatch!`);
  }

  console.log('✅ Arity scanner self-test PASSED.');
}

function testAggregator() {
  console.log('--- Testing Evidence Aggregator Validation & Rejections ---');

  const tempDir = path.join(__dirname, '../scratch/test-aggregator-tmp');
  fs.mkdirSync(tempDir, { recursive: true });

  // 1. Test Duplicate Key Rejection
  const dupEnv = `
FIXTURE_UUID_STATIC_RESULT=PASS
FIXTURE_UUID_STATIC_RESULT=FAIL
  `;
  fs.writeFileSync(path.join(tempDir, 'raw-fragment.env'), dupEnv);
  let caughtDup = false;
  try {
    aggregateEvidence(tempDir);
  } catch (err) {
    if (err.message.includes('DUPLICATE_KEY_REJECTED')) caughtDup = true;
  }
  if (!caughtDup) throw new Error('Aggregator failed to reject duplicate key!');

  // 2. Test Malformed Bare Line Rejection
  const malformedEnv = `
FIXTURE_UUID_STATIC_RESULT=PASS
BARE_LINE_WITHOUT_EQUALS
  `;
  fs.writeFileSync(path.join(tempDir, 'raw-fragment.env'), malformedEnv);
  let caughtMalformed = false;
  try {
    aggregateEvidence(tempDir);
  } catch (err) {
    if (err.message.includes('MALFORMED_LINE')) caughtMalformed = true;
  }
  if (!caughtMalformed) throw new Error('Aggregator failed to reject malformed line!');

  console.log('✅ Evidence aggregator self-test PASSED.');
}

function main() {
  testArityScanner();
  testAggregator();
  console.log('\n🎉 ALL R9 CONTRACT SELF-TESTS PASSED SUCCESSFULLY!');
}

main();
