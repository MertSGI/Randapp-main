import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1E-B CREDENTIALED RUNNER HELPER UNIT TESTS ===');

let defined = 0;
let executed = 0;
let passed = 0;
let failed = 0;

function check(title, fn) {
  defined++;
  executed++;
  try {
    fn();
    passed++;
    console.log('  ✅ PASS: ' + title);
  } catch (err) {
    failed++;
    console.error('  ❌ FAIL: ' + title + ' - ' + err.message);
  }
}

check('1. H1E-B credentialed runner file exists with exact filename', () => {
  const runnerPath = path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs');
  if (!fs.existsSync(runnerPath)) throw new Error('H1E-B credentialed runner missing!');
});

check('2. H1E-B credentialed runner requires credentials and does not execute mutations without environment variables', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs'), 'utf8');
  if (!content.includes('H1E_B_CREDENTIALS_REQUIRED') || !content.includes('process.exit(1)')) {
    throw new Error('H1E-B credentialed runner missing uncredentialed guard!');
  }
});

check('3. Dedicated staging test tenant ID is documented in runner', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'scripts/test-h1e-b-credentialed-runner.mjs'), 'utf8');
  if (!content.includes('DEDICATED_H1D_TENANT_ID')) {
    throw new Error('H1E-B runner missing dedicated test tenant ID binding!');
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('Defined tests: ' + defined);
console.log('Executed tests: ' + executed);
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Final exit code: ' + (failed === 0 ? 0 : 1));

process.exit(failed === 0 ? 0 : 1);
