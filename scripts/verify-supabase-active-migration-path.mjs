import fs from 'fs';
import path from 'path';

console.log('=== RUNNING SUPABASE ACTIVE MIGRATION PATH STATIC DRY-RUN PARSER ===\n');

const migrationsDir = 'supabase/migrations';
if (!fs.existsSync(migrationsDir)) {
  console.error(`[FAIL] Migrations directory does not exist: ${migrationsDir}`);
  process.exit(1);
}

const activeFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

let totalErrors = 0;

for (const file of activeFiles) {
  const filePath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Analyzing syntax and blocks for: ${file}...`);

  let openParens = 0;
  let openSquare = 0;
  let lineNum = 1;
  let insideSingleQuote = false;
  let insideDoubleQuote = false;
  let insideMultiLineComment = false;
  let insideDollarQuote = false;
  let dollarQuoteTag = '';

  const chars = sql.split('');
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1] || '';
    const prevChar = chars[i - 1] || '';

    // Handle line tracking
    if (char === '\n') {
      lineNum++;
    }

    // Handle single-line comments (--), skip till newline
    if (!insideSingleQuote && !insideDoubleQuote && !insideMultiLineComment && !insideDollarQuote) {
      if (char === '-' && nextChar === '-') {
        // Skip till next newline
        while (i < chars.length && chars[i] !== '\n') {
          i++;
        }
        lineNum++;
        continue;
      }
    }

    // Handle multi-line comments (/* */)
    if (!insideSingleQuote && !insideDoubleQuote && !insideDollarQuote) {
      if (!insideMultiLineComment && char === '/' && nextChar === '*') {
        insideMultiLineComment = true;
        i++;
        continue;
      }
      if (insideMultiLineComment && char === '*' && nextChar === '/') {
        insideMultiLineComment = false;
        i++;
        continue;
      }
    }

    if (insideMultiLineComment) {
      continue;
    }

    // Handle dollar quoting ($$ or $tag$)
    if (!insideSingleQuote && !insideDoubleQuote && !insideMultiLineComment) {
      if (char === '$') {
        // Check if starting or ending a dollar quote
        if (insideDollarQuote) {
          // Look for closing tag matching dollarQuoteTag
          const endTagIndex = sql.indexOf(dollarQuoteTag, i);
          if (endTagIndex === i) {
            insideDollarQuote = false;
            i += dollarQuoteTag.length - 1;
            continue;
          }
        } else {
          // Search for next $ to capture the tag
          const nextDollarIndex = sql.indexOf('$', i + 1);
          if (nextDollarIndex !== -1 && nextDollarIndex - i < 50) { // arbitrary limit for tag size
            const tag = sql.substring(i, nextDollarIndex + 1);
            if (/^\$[a-zA-Z0-9_]*\$$/.test(tag)) {
              insideDollarQuote = true;
              dollarQuoteTag = tag;
              i += tag.length - 1;
              continue;
            }
          }
        }
      }
    }

    if (insideDollarQuote) {
      continue;
    }

    // Handle string literals and identifiers
    if (char === "'" && prevChar !== '\\' && !insideDoubleQuote) {
      insideSingleQuote = !insideSingleQuote;
      continue;
    }
    if (char === '"' && prevChar !== '\\' && !insideSingleQuote) {
      insideDoubleQuote = !insideDoubleQuote;
      continue;
    }

    if (insideSingleQuote || insideDoubleQuote) {
      continue;
    }

    // Bracket/paren matching
    if (char === '(') {
      openParens++;
    } else if (char === ')') {
      openParens--;
      if (openParens < 0) {
        console.error(`[FAIL] Unmatched closing parenthesis ')' at line ${lineNum} in ${file}`);
        totalErrors++;
        openParens = 0; // reset
      }
    }

    if (char === '[') {
      openSquare++;
    } else if (char === ']') {
      openSquare--;
      if (openSquare < 0) {
        console.error(`[FAIL] Unmatched closing bracket ']' at line ${lineNum} in ${file}`);
        totalErrors++;
        openSquare = 0; // reset
      }
    }
  }

  // End of file sanity check
  if (insideSingleQuote) {
    console.error(`[FAIL] Half-open single quote string literal detected at end of file: ${file}`);
    totalErrors++;
  }
  if (insideDoubleQuote) {
    console.error(`[FAIL] Half-open double quote identifier detected at end of file: ${file}`);
    totalErrors++;
  }
  if (insideMultiLineComment) {
    console.error(`[FAIL] Unclosed multi-line comment /* detected at end of file: ${file}`);
    totalErrors++;
  }
  if (insideDollarQuote) {
    console.error(`[FAIL] Unclosed dollar-quoted body ${dollarQuoteTag} detected at end of file: ${file}`);
    totalErrors++;
  }
  if (openParens > 0) {
    console.error(`[FAIL] Unclosed parentheses '(' detected in ${file} (Open count: ${openParens})`);
    totalErrors++;
  }
  if (openSquare > 0) {
    console.error(`[FAIL] Unclosed square brackets '[' detected in ${file} (Open count: ${openSquare})`);
    totalErrors++;
  }
}

if (totalErrors > 0) {
  console.error(`\n[ABORT] Static dry-run parser identified ${totalErrors} structural error(s) in active migrations!`);
  process.exit(1);
} else {
  console.log('\n[PASS] All active migrations have balanced structures and matching brackets.');
  console.log('=== STATIC DRY-RUN PARSER PASSED SUCCESSFULLY ===\n');
  process.exit(0);
}
