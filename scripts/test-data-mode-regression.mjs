import { resolveDataSourceMode } from '../services/dataSourceModeResolver';

console.log('🏁 Running pure config resolver regression test suite...');

let failures = 0;

function runCase(name, params, expected) {
  try {
    const result = resolveDataSourceMode(params);
    if (expected instanceof Error) {
      console.error(`❌ Case ${name} FAILED: Expected error but got success: "${result}"`);
      failures++;
    } else if (result !== expected) {
      console.error(`❌ Case ${name} FAILED: Expected "${expected}" but got "${result}"`);
      failures++;
    } else {
      console.log(`✅ Case ${name} PASSED: resolved to "${result}"`);
    }
  } catch (err) {
    if (expected instanceof Error) {
      if (err.message.includes(expected.message)) {
        console.log(`✅ Case ${name} PASSED: Got expected error: "${err.message}"`);
      } else {
        console.error(`❌ Case ${name} FAILED: Expected error containing "${expected.message}" but got: "${err.message}"`);
        failures++;
      }
    } else {
      console.error(`❌ Case ${name} FAILED: Expected "${expected}" but caught error: "${err.message}"`);
      failures++;
    }
  }
}

// Case A: VITE_DATA_MODE=supabase_staging
runCase('A', {
  dataMode: 'supabase_staging',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: true
}, 'supabase');

// Case B: VITE_DATA_MODE=supabase_production
runCase('B', {
  dataMode: 'supabase_production',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: true
}, 'supabase');

// Case C: VITE_DATA_MODE=local
runCase('C', {
  dataMode: 'local',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, 'local');

// Case D: VITE_DATA_MODE=mock
runCase('D', {
  dataMode: 'mock',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, 'local');

// Case E: VITE_DATA_MODE=demo
runCase('E', {
  dataMode: 'demo',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, 'local');

// Case F: No canonical or legacy mode
runCase('F', {
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, new Error('VITE_DATA_MODE is missing'));

// Case G: Canonical empty string
runCase('G', {
  dataMode: '',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, new Error('VITE_DATA_MODE is missing'));

// Case H: Canonical staging
runCase('H', {
  dataMode: 'staging',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, new Error('Unrecognized VITE_DATA_MODE value: "staging"'));

// Case I: Canonical supabase
runCase('I', {
  dataMode: 'supabase',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, new Error('Unrecognized VITE_DATA_MODE value: "supabase"'));

// Case J: Canonical supabase_staging with missing URL
runCase('J', {
  dataMode: 'supabase_staging',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: true
}, new Error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing'));

// Case K: Canonical supabase_staging with missing anon/publishable key
runCase('K', {
  dataMode: 'supabase_staging',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: false
}, new Error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing'));

// Case L: Canonical supabase_staging plus legacy local
runCase('L', {
  dataMode: 'supabase_staging',
  legacyDataSource: 'local',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: true
}, new Error('Conflict detected'));

// Case M: Canonical local plus legacy supabase_staging
runCase('M', {
  dataMode: 'local',
  legacyDataSource: 'supabase_staging',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: true
}, new Error('Conflict detected'));

// Case N: Both values supabase_staging
runCase('N', {
  dataMode: 'supabase_staging',
  legacyDataSource: 'supabase_staging',
  supabaseUrlPresent: true,
  supabaseAnonKeyPresent: true
}, 'supabase');

// Case O: Legacy variable only
runCase('O', {
  legacyDataSource: 'local',
  supabaseUrlPresent: false,
  supabaseAnonKeyPresent: false
}, new Error('VITE_LARI_DATA_SOURCE is defined, but canonical VITE_DATA_MODE is missing'));

if (failures > 0) {
  console.error(`❌ Regression test suite failed with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All regression test cases passed successfully!');
  process.exit(0);
}
