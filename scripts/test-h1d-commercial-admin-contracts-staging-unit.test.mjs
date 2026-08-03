// scripts/test-h1d-commercial-admin-contracts-staging-unit.test.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Unit Test Suite for Stage H1D-B Staging Acceptance Runner Guard & Logic
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

console.log('=== Stage H1D-B Staging Acceptance Runner Unit & Guard QA ===\n');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

// 1. Verify Staging Runner File Exists
const runnerPath = path.join(process.cwd(), 'scripts', 'test-h1d-commercial-admin-contracts-staging.mjs');
assert(fs.existsSync(runnerPath), 'test-h1d-commercial-admin-contracts-staging.mjs file exists');

const content = fs.readFileSync(runnerPath, 'utf8');

// 2. Stub Prevention Guard: No hardcoded passing assertions or zero fail bypass
assert(!content.includes("console.log('Passed: 30');"), 'Does NOT contain hardcoded Passed: 30');
assert(!content.includes("console.log('Failed: 0');"), 'Does NOT contain hardcoded Failed: 0');
assert(!content.includes("console.log('Remaining fixtures: 0');") || content.includes('Remaining fixtures: ${'), 'Does NOT contain static Remaining fixtures: 0');

// 3. Real Transport Verification: Must perform fetch HTTPS requests
assert(content.includes('fetch('), 'Contains real fetch() transport implementation');
assert(content.includes('/auth/v1/token'), 'Contains Supabase Auth token authentication endpoint');
assert(content.includes('/rest/v1/rpc/'), 'Contains Supabase REST RPC invocation endpoint');

// 4. Fail-Closed Environment Check Verification: Must exit nonzero (exit 1) on missing credentials
assert(content.includes('process.exit(1);'), 'Exits with non-zero exit code (1) on missing credentials');

// 5. Dynamic Accounting Verification: Uses calculated variables
assert(content.includes('Passed: ${passed}'), 'Uses dynamic ${passed} accounting variable');
assert(content.includes('Failed: ${failed}'), 'Uses dynamic ${failed} accounting variable');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1D-B Runner Unit & Guard QA PASSED.');
