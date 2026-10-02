// scripts/test-phase7-node1-verified-reviews-contracts.mjs
// Phase 7 Node 1 Static Contract Verification Suite
// Delegates to Python verification script

import { spawnSync } from 'child_process';

console.log('===============================================================');
console.log('STARTING PHASE 7 NODE 1 STATIC CONTRACT VERIFICATION (via Python)');
console.log('===============================================================\n');

const result = spawnSync('python', ['scripts/quick_check.py'], { 
  encoding: 'utf8', 
  stdio: 'inherit' 
});

if (result.status !== 0) {
  console.error('Static contract verification failed');
  process.exit(1);
}

console.log('\n===============================================================');
console.log('STATIC CONTRACT VERIFICATION PASSED');
console.log('===============================================================\n');