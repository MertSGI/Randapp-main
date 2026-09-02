// ============================================================================
// STATIC FIXTURE ARITY CONTRACT SCANNER
// File: scripts/test-health-tourism-slice4-fixture-arity-contract.mjs
// Purpose:
//   Lexical fail-closed scanner that parses all 8 mandatory pgTAP SQL test files
//   and verifies column count vs value tuple count for static INSERT statements.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const testSuites = [
  'supabase/tests/health_tourism_foundation_server_authority_tests.sql',
  'supabase/tests/health_tourism_lead_ops_ai_assist_tests.sql',
  'supabase/tests/health_tourism_clinic_acceptance_tests.sql',
  'supabase/tests/health_tourism_clinic_acceptance_workspace_tests.sql',
  'supabase/tests/clinic_domain_server_authority_tests.sql',
  'supabase/tests/clinic_operational_integration_tests.sql',
  'supabase/tests/clinic_workspace_authority_hardening_tests.sql',
  'supabase/tests/public_booking_rpc_behavioral_tests.sql',
];

export function tokenizeSql(sql, filename = 'test.sql') {
  const tokens = [];
  let i = 0;
  const len = sql.length;
  let line = 1;

  while (i < len) {
    const char = sql[i];

    if (char === '\n') {
      line++;
      i++;
      continue;
    }

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Line comment --
    if (char === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment /* ... */
    if (char === '/' && sql[i + 1] === '*') {
      const startLine = line;
      i += 2;
      let closed = false;
      while (i < len) {
        if (sql[i] === '\n') line++;
        if (sql[i] === '*' && sql[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        throw new Error(`UNCLOSED_BLOCK_COMMENT at ${filename}:${startLine}`);
      }
      continue;
    }

    // Single quoted string '...'
    if (char === "'") {
      const startLine = line;
      let val = "'";
      i++;
      let closed = false;
      while (i < len) {
        if (sql[i] === '\n') line++;
        if (sql[i] === "'" && sql[i + 1] === "'") {
          val += "''";
          i += 2;
        } else if (sql[i] === "'") {
          val += "'";
          i++;
          closed = true;
          break;
        } else {
          val += sql[i];
          i++;
        }
      }
      if (!closed) {
        throw new Error(`UNCLOSED_STRING_LITERAL at ${filename}:${startLine}`);
      }
      tokens.push({ type: 'STRING', value: val, line: startLine });
      continue;
    }

    // Dollar-quoted string ($$...$$ or $tag$...$tag$)
    if (char === '$') {
      const startLine = line;
      const match = sql.substring(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        const tag = match[1];
        i += tag.length;
        const endIdx = sql.indexOf(tag, i);
        if (endIdx === -1) {
          throw new Error(`UNCLOSED_DOLLAR_QUOTE ${tag} at ${filename}:${startLine}`);
        }
        const body = sql.substring(i, endIdx);
        // Count lines inside dollar quote
        for (let k = 0; k < body.length; k++) {
          if (body[k] === '\n') line++;
        }
        i = endIdx + tag.length;

        // If body looks like DO/PLpgSQL block, tokenize body recursively so static INSERTs inside DO blocks are inspected!
        if (/\bINSERT\s+INTO\b/i.test(body) && !/\bEXECUTE\b/i.test(body)) {
          try {
            const innerTokens = tokenizeSql(body, `${filename}:DO_BLOCK`);
            tokens.push(...innerTokens);
          } catch {
            tokens.push({ type: 'DOLLAR_STRING', value: body, line: startLine });
          }
        } else {
          tokens.push({ type: 'DOLLAR_STRING', value: body, line: startLine });
        }
        continue;
      }
    }

    // Punctuation () , ;
    if (['(', ')', ',', ';'].includes(char)) {
      tokens.push({ type: 'PUNCT', value: char, line });
      i++;
      continue;
    }

    // Identifiers & Keywords
    let ident = '';
    const startLine = line;
    while (i < len && !/\s/.test(sql[i]) && !['(', ')', ',', ';', "'", '"', '$'].includes(sql[i]) && !(sql[i] === '-' && sql[i+1] === '-') && !(sql[i] === '/' && sql[i+1] === '*')) {
      ident += sql[i];
      i++;
    }
    if (ident.length > 0) {
      tokens.push({ type: 'WORD', value: ident, line: startLine });
    } else {
      i++;
    }
  }

  return tokens;
}

export function splitTokenListByCommas(tokens) {
  const items = [];
  let current = [];
  let depth = 0;

  for (const t of tokens) {
    if (t.type === 'PUNCT' && (t.value === '(' || t.value === '[')) depth++;
    else if (t.type === 'PUNCT' && (t.value === ')' || t.value === ']')) depth--;

    if (t.type === 'PUNCT' && t.value === ',' && depth === 0) {
      items.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) items.push(current);
  return items;
}

export function parseAndVerifyInsertStatements(tokens, filename) {
  let checkedInserts = 0;
  let nonValuesInserts = 0;
  let mismatchOccurrences = 0;
  const mismatchMap = new Map();
  let unsupportedCount = 0;

  let idx = 0;
  const len = tokens.length;

  while (idx < len) {
    const t = tokens[idx];
    if (t.type === 'WORD' && t.value.toUpperCase() === 'INSERT') {
      const insertLine = t.line;
      if (idx + 1 < len && tokens[idx + 1].type === 'WORD' && tokens[idx + 1].value.toUpperCase() === 'INTO') {
        let cur = idx + 2;
        if (cur < len && tokens[cur].type === 'WORD') {
          const tableName = tokens[cur].value;
          cur++;

          // Check if explicit column list (cols...) is present
          if (cur < len && tokens[cur].type === 'PUNCT' && tokens[cur].value === '(') {
            cur++;
            const colTokens = [];
            while (cur < len && !(tokens[cur].type === 'PUNCT' && tokens[cur].value === ')')) {
              colTokens.push(tokens[cur]);
              cur++;
            }
            if (cur < len && tokens[cur].type === 'PUNCT' && tokens[cur].value === ')') {
              cur++; // Skip closing paren
            }

            const declaredCols = splitTokenListByCommas(colTokens);
            const expectedArity = declaredCols.length;

            // Look for VALUES or SELECT or DEFAULT VALUES
            while (cur < len && tokens[cur].type === 'WORD' && !['VALUES', 'SELECT', 'DEFAULT'].includes(tokens[cur].value.toUpperCase())) {
              cur++;
            }

            if (cur < len && tokens[cur].type === 'WORD') {
              const kw = tokens[cur].value.toUpperCase();
              if (kw === 'SELECT' || kw === 'DEFAULT') {
                nonValuesInserts++;
                idx = cur + 1;
                continue;
              }

              if (kw === 'VALUES') {
                checkedInserts++;
                cur++;

                // Read values tuples (t1), (t2), ...
                let tupleNum = 0;
                while (cur < len && tokens[cur].type === 'PUNCT' && tokens[cur].value === '(') {
                  tupleNum++;
                  cur++; // skip '('
                  const tupleTokens = [];
                  let depth = 1;
                  while (cur < len && depth > 0) {
                    if (tokens[cur].type === 'PUNCT' && tokens[cur].value === '(') depth++;
                    else if (tokens[cur].type === 'PUNCT' && tokens[cur].value === ')') depth--;

                    if (depth > 0) {
                      tupleTokens.push(tokens[cur]);
                      cur++;
                    }
                  }
                  if (cur < len && tokens[cur].type === 'PUNCT' && tokens[cur].value === ')') {
                    cur++; // skip ')'
                  }

                  const tupleVals = splitTokenListByCommas(tupleTokens);
                  if (tupleVals.length !== expectedArity) {
                    mismatchOccurrences++;
                    const key = `${filename}:${insertLine}:${tableName}:${expectedArity}:${tupleVals.length}`;
                    mismatchMap.set(key, (mismatchMap.get(key) || 0) + 1);
                    console.error(`❌ ARITY MISMATCH [${filename}:${insertLine}] Table ${tableName}: expected ${expectedArity} cols, received ${tupleVals.length} values in tuple #${tupleNum}`);
                  }

                  // If next token is comma, skip and continue to next tuple
                  if (cur < len && tokens[cur].type === 'PUNCT' && tokens[cur].value === ',') {
                    cur++;
                  } else {
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
    idx++;
  }

  return {
    checkedInserts,
    nonValuesInserts,
    mismatchOccurrences,
    distinctMismatches: mismatchMap.size,
    unsupportedCount
  };
}

export function runArityScanner() {
  console.log('🏁 Running Fail-Closed Lexical SQL INSERT Arity Scanner...\n');

  let totalChecked = 0;
  let totalNonValues = 0;
  let totalOccurrences = 0;
  let totalDistinct = 0;
  let totalUnsupported = 0;
  let fileError = false;

  for (const relPath of testSuites) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing mandatory test file: ${relPath}`);
      fileError = true;
      continue;
    }

    try {
      const sql = fs.readFileSync(fullPath, 'utf8');
      const tokens = tokenizeSql(sql, relPath);
      const res = parseAndVerifyInsertStatements(tokens, relPath);

      totalChecked += res.checkedInserts;
      totalNonValues += res.nonValuesInserts;
      totalOccurrences += res.mismatchOccurrences;
      totalDistinct += res.distinctMismatches;
      totalUnsupported += res.unsupportedCount;
    } catch (err) {
      console.error(`❌ SCANNER_PARSER_FATAL in ${relPath}: ${err.message}`);
      fileError = true;
    }
  }

  const passed = !fileError && totalDistinct === 0 && totalOccurrences === 0 && totalUnsupported === 0;

  console.log(`\nFIXTURE_ARITY_STATIC_RESULT=${passed ? 'PASS' : 'FAIL'}`);
  console.log(`ARITY_CHECKED_INSERT_COUNT=${totalChecked}`);
  console.log(`ARITY_NON_VALUES_INSERT_COUNT=${totalNonValues}`);
  console.log(`ARITY_MISMATCH_DISTINCT_COUNT=${totalDistinct}`);
  console.log(`ARITY_MISMATCH_OCCURRENCE_COUNT=${totalOccurrences}`);
  console.log(`ARITY_UNSUPPORTED_STATEMENT_COUNT=${totalUnsupported}`);

  return passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const exitCode = runArityScanner();
  process.exit(exitCode);
}
