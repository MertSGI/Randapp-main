// test-p2a-static-security-scan.test.mjs
// P2A.1-R1 — Static Source Code Security Scan for Frontend Boundaries

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('=== RUNNING P2A.1 STATIC FRONTEND SECURITY SCAN ===');

const projectRoot = process.cwd();

const targetDirs = ['pages', 'services', 'components', 'contexts'];
const forbiddenTokens = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'service_role'
];

let scannedFiles = 0;
let violations = [];

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      scannedFiles++;
      const content = fs.readFileSync(fullPath, 'utf8');
      
      for (const token of forbiddenTokens) {
        // Exception allowed only inside comments explicitly warning NOT to use service role key
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(token)) {
            const trimmed = line.trim();
            // Allow warning comments explaining service role key safety rules (e.g. in supabaseClient.ts)
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
              return;
            }
            violations.push(`${fullPath}:${idx + 1} - Found forbidden token '${token}': ${trimmed}`);
          }
        });
      }
    }
  }
}

for (const dir of targetDirs) {
  scanDirectory(path.join(projectRoot, dir));
}

console.log(`Scanned ${scannedFiles} frontend source files across target directories.`);

if (violations.length > 0) {
  console.error('STATIC SECURITY VIOLATIONS FOUND:');
  violations.forEach(v => console.error('  ' + v));
  process.exit(1);
}

console.log('✅ STATIC SECURITY SCAN PASS: Zero service_role or backend admin key usage detected in frontend client code.');
