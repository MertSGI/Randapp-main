import fs from 'fs';
import path from 'path';

export function validateSqlStructure(sqlText) {
  const lines = sqlText.split('\n');
  let inFunction = false;
  let tag = null;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for malformed opening AS $
    if (/AS\s+\$\s*$/i.test(line.trim())) {
      throw new Error(`Malformed opening dollar quote 'AS $' at line ${lineNum}: tag name is required`);
    }

    // Match AS $tag$
    const openingMatch = line.match(/AS\s+\$([a-zA-Z0-9_]+)\$/i);
    if (openingMatch) {
      if (inFunction) {
        throw new Error(`Nested or unclosed dollar quote at line ${lineNum}`);
      }
      inFunction = true;
      tag = openingMatch[1];
      startLine = lineNum;
    }

    // Match $tag$;
    if (inFunction && tag) {
      const closingRegex = new RegExp(`\\\$${tag}\\\$\\s*;`);
      if (closingRegex.test(line)) {
        inFunction = false;
        tag = null;
      }
    }
  }

  if (inFunction) {
    throw new Error(`Unclosed function body starting at line ${startLine} with tag '$${tag}$'`);
  }

  return true;
}

if (process.argv[1] && process.argv[1].endsWith('validate-supabase-migration-sql.mjs')) {
  const migPath = path.join(process.cwd(), 'supabase/migrations/20260822_h1e_release_control_and_eligibility_read_contracts.sql');
  const sql = fs.readFileSync(migPath, 'utf8');
  try {
    validateSqlStructure(sql);
    console.log('✅ Migration 47 SQL structure & dollar-quoting validation PASSED');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration 47 SQL validation FAILED: ' + err.message);
    process.exit(1);
  }
}
