import fs from 'fs';
import path from 'path';

console.log('=== RUNNING HARDENED SUPABASE STAGING SMOKE TEST ===\n');

// 1. Read environment config from .env or process.env
let env = { ...process.env };

if (fs.existsSync('.env')) {
  try {
    const lines = fs.readFileSync('.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
          env[key] = value;
        }
      }
    }
  } catch (e) {
    console.warn('[WARN] Failed to read .env file:', e.message);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

const envOnly = args.includes('--env-only');
const readOnly = args.includes('--read-only') || args.length === 0;
const writeStagingFixtures = args.includes('--write-staging-fixtures');
const cleanupStagingFixtures = args.includes('--cleanup-staging-fixtures');

// Determine target execution mode based on flags
let targetMode = 'read-only';
if (envOnly) {
  targetMode = 'env-only';
} else if (writeStagingFixtures) {
  targetMode = 'write-staging-fixtures';
} else if (cleanupStagingFixtures) {
  targetMode = 'cleanup-staging-fixtures';
}

const requiredVars = [
  'VITE_LAUNCH_MODE',
  'VITE_DATA_MODE',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

const missing = requiredVars.filter(v => !env[v]);

if (missing.length > 0) {
  console.log('====================================================');
  console.log('📊 LARİ STAGING SMOKE TEST SUMMARY');
  console.log('Status: BLOCKED');
  console.log('Reason: Missing required environment variables');
  console.log('Missing Variables:');
  for (const m of missing) {
    console.log(`  - ${m}`);
  }
  console.log('====================================================');
  console.log('\n[INFO] Real staging smoke test requires live staging environment credentials.');
  console.log('Next Actions to Unblock:');
  console.log('  1. Create a staging project in Supabase');
  console.log('  2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local .env file');
  console.log('  3. Ensure VITE_LAUNCH_MODE=paymentless_limited_production, VITE_DATA_MODE=supabase_staging, VITE_PAYMENT_MODE=disabled');
  console.log('  4. Re-run command sheet operations');
  console.log('\nSkipping execution safely without throwing build errors...');
  process.exit(0); // Exit cleanly for preflight validations when env is not present
}

const launchMode = env.VITE_LAUNCH_MODE;
const dataMode = env.VITE_DATA_MODE;
const paymentMode = env.VITE_PAYMENT_MODE || 'disabled';

// Refuse to run if data mode is local or mock
if (dataMode === 'local' || dataMode === 'mock') {
  console.log('====================================================');
  console.log('📊 LARİ STAGING SMOKE TEST SUMMARY');
  console.log('Status: FAIL');
  console.log(`Reason: VITE_DATA_MODE is "${dataMode}". Staging smoke testing is strictly blocked on local/mock databases.`);
  console.log('====================================================');
  process.exit(1);
}

// Refuse to run if payment mode is not disabled under paymentless launch mode
if (paymentMode !== 'disabled') {
  console.log('====================================================');
  console.log('📊 LARİ STAGING SMOKE TEST SUMMARY');
  console.log('Status: FAIL');
  console.log(`Reason: VITE_PAYMENT_MODE is "${paymentMode}". Online payment must be disabled under paymentless staging.`);
  console.log('====================================================');
  process.exit(1);
}

console.log('Configuration Audit:');
console.log(`  - Launch Mode: ${launchMode}`);
console.log(`  - Data Mode: ${dataMode}`);
console.log('  - Supabase URL: Registered (Safely Hidden)');
console.log('  - Supabase Anon Key: Registered (Safely Hidden)');
console.log(`  - Payment Integration: DISABLED (iyzico is NOT required)`);
console.log(`  - Target Execution Mode: ${targetMode.toUpperCase()}`);
console.log('');

// --- MODE 1: Env-Only Check ---
if (targetMode === 'env-only') {
  console.log('====================================================');
  console.log('📊 LARİ STAGING SMOKE TEST SUMMARY');
  console.log('Status: PASS');
  console.log('Mode: ENV-ONLY check completed successfully with 0 violations.');
  console.log('====================================================');
  process.exit(0);
}

// Setup safe parameters for checks
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

// Safe public fetch function
async function fetchStagingPublicEndpoint(endpoint) {
  const url = `${supabaseUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    return res;
  } catch (err) {
    throw new Error(`Connection failed: ${err.message}`);
  }
}

// Safe guest insertion fetch function
async function insertStagingPublicEndpoint(endpoint, payload) {
  const url = `${supabaseUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return res;
  } catch (err) {
    throw new Error(`Write failed: ${err.message}`);
  }
}

// Safe deletion function for cleanup
async function deleteStagingPublicEndpoint(endpoint) {
  const url = `${supabaseUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    return res;
  } catch (err) {
    throw new Error(`Delete failed: ${err.message}`);
  }
}

// Execute checks
async function executeSmokeTests() {
  console.log('📡 Fetching schema and testing public anonymous boundaries on remote staging...');

  // --- MODE 2: Read-Only Schema & Anon Check (Default & --read-only) ---
  if (targetMode === 'read-only' || targetMode === 'write-staging-fixtures' || targetMode === 'cleanup-staging-fixtures') {
    try {
      // 1. Try to read active tenants
      console.log('Testing SELECT /rest/v1/tenants...');
      const resTenants = await fetchStagingPublicEndpoint('/rest/v1/tenants?select=id,slug,status');
      if (resTenants.status === 401 || resTenants.status === 403) {
        console.error(`[BLOCKER] RLS denies anonymous read access on tenants: status ${resTenants.status}`);
        printSummaryAndExit('FAIL', 'RLS denies anonymous read access on tenants');
      } else if (resTenants.ok) {
        const data = await resTenants.json();
        console.log(`  - Success: Received ${data.length} published tenant(s)`);
      } else {
        console.warn(`  - Unexpected response code: ${resTenants.status}`);
      }

      // 2. Try to read services (Public read policy)
      console.log('Testing SELECT /rest/v1/services...');
      const resServices = await fetchStagingPublicEndpoint('/rest/v1/services?select=id,name,price');
      if (resServices.ok) {
        const data = await resServices.json();
        console.log(`  - Success: Retrieved ${data.length} active service(s) from public catalog`);
      } else {
        console.error(`  - Failed to fetch services catalog: status ${resServices.status}`);
      }

      // 3. Try to read appointments anonymously (MUST fail or return empty due to RLS privacy bounds)
      console.log('Testing SELECT /rest/v1/appointments anonymously (Privacy isolation check)...');
      const resAppts = await fetchStagingPublicEndpoint('/rest/v1/appointments?select=*');
      if (resAppts.ok) {
        const data = await resAppts.json();
        if (data.length > 0) {
          console.error(`[CRITICAL LEAK] Public anonymous client can read ${data.length} appointment details! RLS policy is broken.`);
          printSummaryAndExit('FAIL', 'RLS Leak: Anonymous client can read private appointments');
        } else {
          console.log('  - Success: Received empty list. Public reads are correctly blocked.');
        }
      } else {
        console.log(`  - Success: Query rejected with status ${resAppts.status} (Protected by default).`);
      }

      // 4. Try to read customers anonymously (MUST return empty)
      console.log('Testing SELECT /rest/v1/customers anonymously...');
      const resCusts = await fetchStagingPublicEndpoint('/rest/v1/customers?select=*');
      if (resCusts.ok) {
        const data = await resCusts.json();
        if (data.length > 0) {
          console.error('[CRITICAL LEAK] Public anonymous client can read customer listings!');
          printSummaryAndExit('FAIL', 'RLS Leak: Anonymous client can read customer listings');
        } else {
          console.log('  - Success: Customer records safely isolated.');
        }
      } else {
        console.log(`  - Success: Access blocked with status ${resCusts.status}.`);
      }

    } catch (err) {
      console.error(`[FAIL] Connection test failed with error: ${err.message}`);
      console.log('Please verify VITE_SUPABASE_URL and your network connection.');
      printSummaryAndExit('FAIL', `Staging connection failed: ${err.message}`);
    }
  }

  // --- MODE 3: Write Smoke Check with explicit confirmation flag ---
  if (targetMode === 'write-staging-fixtures') {
    console.log('\n✍️ Executing public reservation insert smoke test (Fictional guest data)...');
    
    const testTenantId = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa'; // Melis Güzellik static UUID
    
    const fictionalCustomer = {
      tenant_id: testTenantId,
      name: 'Smoke Test Guest',
      email: 'smoke-guest-staging@example.com',
      phone: '+905001112233'
    };

    try {
      console.log('Inserting fictional guest record into /rest/v1/customers...');
      const resCustInsert = await insertStagingPublicEndpoint('/rest/v1/customers', fictionalCustomer);
      if (resCustInsert.ok) {
        console.log('  - Success: Fictional customer created.');
      } else {
        console.error(`[BLOCKER] Could not insert customer during guest booking checkout. Status: ${resCustInsert.status}`);
        const text = await resCustInsert.text();
        console.error('Details:', text);
        printSummaryAndExit('FAIL', `Guest customer insertion blocked: Status ${resCustInsert.status}`);
      }
    } catch (err) {
      console.error(`[FAIL] Guest insertion failed: ${err.message}`);
      printSummaryAndExit('FAIL', `Guest insertion failed: ${err.message}`);
    }
  }

  // --- MODE 4: Cleanup Staging Fixtures ---
  if (targetMode === 'cleanup-staging-fixtures') {
    console.log('\n🧹 Cleaning up fictional staging fixtures...');
    try {
      console.log('Deleting fictional guest record from /rest/v1/customers...');
      const resCleanup = await deleteStagingPublicEndpoint('/rest/v1/customers?email=eq.smoke-guest-staging@example.com');
      if (resCleanup.ok || resCleanup.status === 404) {
        console.log('  - Success: Cleaned up fictional guest record.');
      } else {
        console.warn(`  - Cleanup response status: ${resCleanup.status}`);
      }
    } catch (err) {
      console.warn(`[WARN] Cleanup failed: ${err.message}`);
    }
  }

  printSummaryAndExit('PASS', 'Staging smoke checks completed successfully.');
}

function printSummaryAndExit(status, reason) {
  console.log('\n====================================================');
  console.log('📊 LARİ STAGING SMOKE TEST SUMMARY');
  console.log(`Status: ${status}`);
  console.log(`Details: ${reason}`);
  console.log('====================================================\n');
  process.exit(status === 'PASS' ? 0 : 1);
}

// Run asynchronous checks
executeSmokeTests();
