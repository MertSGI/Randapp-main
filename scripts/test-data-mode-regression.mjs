import { resolveDataSourceMode } from '../services/dataSourceModeResolver';
import { mapSupabaseProfileToUser } from '../services/authProfileMapper';
import { shouldUsePilotLocalBypass } from '../services/pilotBypassPolicy';

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


function assert(condition, msg) {
  if (!condition) {
    console.error(`? ${msg}`);
    failures++;
  } else {
    console.log(`? ${msg}`);
  }
}

function expectAuthProfile(name, authUser, profile, expected) {
  try {
    const user = mapSupabaseProfileToUser(authUser, profile, authUser.email || 'fallback@example.com');
    if (expected instanceof Error) {
      console.error(`? Auth ${name} FAILED: expected rejection but got ${JSON.stringify(user)}`);
      failures++;
      return;
    }
    assert(user.role === expected.role, `Auth ${name}: role ${expected.role}`);
    assert((user.tenantId || null) === (expected.tenantId || null), `Auth ${name}: tenant ${expected.tenantId || null}`);
  } catch (err) {
    if (expected instanceof Error) {
      console.log(`? Auth ${name}: rejected as expected`);
    } else {
      console.error(`? Auth ${name} FAILED: ${err.message}`);
      failures++;
    }
  }
}

function runAuthProfileTests() {
  const authUser = { id: 'user-1', email: 'owner@example.com' };
  expectAuthProfile('valid tenant_owner profile', authUser, { id: 'user-1', tenant_id: 'tenant-1', name: 'Owner', role: 'tenant_owner', active: true }, { role: 'tenant_owner', tenantId: 'tenant-1' });
  expectAuthProfile('valid staff profile', authUser, { id: 'user-1', tenant_id: 'tenant-1', name: 'Staff', role: 'staff', active: true }, { role: 'staff', tenantId: 'tenant-1' });
  expectAuthProfile('valid super_admin null tenant', authUser, { id: 'user-1', tenant_id: null, name: 'Root', role: 'super_admin', active: true }, { role: 'super_admin', tenantId: null });
  expectAuthProfile('missing profile in supabase_staging rejected', authUser, null, new Error('reject'));
  expectAuthProfile('inactive profile rejected', authUser, { id: 'user-1', tenant_id: 'tenant-1', role: 'tenant_owner', active: false }, new Error('reject'));
  expectAuthProfile('unknown role rejected', authUser, { id: 'user-1', tenant_id: 'tenant-1', role: 'customer', active: true }, new Error('reject'));
  expectAuthProfile('missing tenant_id for tenant_owner rejected', authUser, { id: 'user-1', tenant_id: null, role: 'tenant_owner', active: true }, new Error('reject'));
  expectAuthProfile('profile lookup failure cannot produce tenant_demo', authUser, undefined, new Error('reject'));
  expectAuthProfile('mismatched profile id rejected', authUser, { id: 'other-user', tenant_id: 'tenant_demo', role: 'tenant_owner', active: true }, new Error('reject'));

  try {
    const user = mapSupabaseProfileToUser(authUser, { id: 'user-1', tenant_id: null, role: 'tenant_owner', active: false });
    assert(user.tenantId !== 'tenant_demo' && user.role !== 'tenant_owner', 'Auth missing profile cannot produce tenant_demo or tenant_owner');
  } catch {
    console.log('? Auth missing/malformed profile fails closed without tenant_demo fallback');
  }
}

function runPilotBypassPolicyTests() {
  const pilotSignal = { activeTenantId: 'tenant_pilot_demo', inPilotDemo: true, hash: '#/tenant_pilot_demo', pathname: '/pilot/customer', args: ['tenant_pilot_demo'] };
  assert(shouldUsePilotLocalBypass('supabase', pilotSignal) === false, 'supabase_staging + tenant_pilot_demo never uses local adapter');
  assert(shouldUsePilotLocalBypass('supabase', { inPilotDemo: true }) === false, 'supabase_staging + localStorage pilot flag never uses local adapter');
  assert(shouldUsePilotLocalBypass('supabase', pilotSignal) === false, 'supabase_production + any pilot flag never uses local adapter');
  assert(shouldUsePilotLocalBypass('local', pilotSignal) === true, 'demo mode + pilot tenant can use isolated local adapter');
  assert(shouldUsePilotLocalBypass('local', { activeTenantId: 'tenant_pilot_demo' }) === true, 'mock mode pilot tenant can use local adapter');
  assert(shouldUsePilotLocalBypass('supabase', { activeTenantId: 'ordinary-tenant' }) === false, 'Supabase repository failure path has no pilot local fallback signal');
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

runAuthProfileTests();
runPilotBypassPolicyTests();

if (failures > 0) {
  console.error(`❌ Regression test suite failed with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All regression test cases passed successfully!');
  process.exit(0);
}
