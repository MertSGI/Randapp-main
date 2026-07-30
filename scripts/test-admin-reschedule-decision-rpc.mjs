import fs from 'fs';
import path from 'path';

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('=== Stage F3 — Admin Reschedule Request Decision Backend QA ===\n');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rwedeejhjazwjthdjzrt.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// --- §1 Static Migration 33 File & Contract ---
console.log('--- §1 Static Migration 33 File & Contract ---');
const migFile = path.join(process.cwd(), 'supabase', 'migrations', '20260808_admin_reschedule_request_decision_rpc.sql');
const fileExists = fs.existsSync(migFile);
assert(fileExists, 'Migration 33 file exists');

if (fileExists) {
  const sql = fs.readFileSync(migFile, 'utf8');
  assert(sql.includes('admin_list_pending_reschedule_requests'), 'Defines RPC admin_list_pending_reschedule_requests');
  assert(sql.includes('admin_decide_reschedule_request'), 'Defines RPC admin_decide_reschedule_request');
  assert(sql.includes('admin_reschedule_decision_idempotency'), 'Creates admin_reschedule_decision_idempotency table');
  assert(sql.includes('SECURITY DEFINER'), 'Uses SECURITY DEFINER');
  assert(sql.includes('SET search_path = pg_catalog, public'), 'Explicitly sets search_path = pg_catalog, public');
  assert(sql.includes('auth.uid()'), 'Derives actor identity from auth.uid()');
  assert(sql.includes("role NOT IN ('tenant_owner', 'super_admin')"), 'Enforces role authorization for tenant_owner/super_admin');
  assert(sql.includes('FOR UPDATE'), 'Row-locks change request and appointment FOR UPDATE');
  assert(sql.includes('appointment_reschedule_approved'), 'Inserts appointment_reschedule_approved audit action');
  assert(sql.includes('appointment_reschedule_rejected'), 'Inserts appointment_reschedule_rejected audit action');
  assert(sql.includes('reschedule_request_approved'), 'Inserts reschedule_request_approved outbox event_type');
  assert(sql.includes('reschedule_request_rejected'), 'Inserts reschedule_request_rejected outbox event_type');
  assert(sql.includes('REVOKE ALL ON FUNCTION public.admin_decide_reschedule_request'), 'Revokes EXECUTE from PUBLIC');
  assert(sql.includes('REVOKE ALL ON FUNCTION public.admin_list_pending_reschedule_requests'), 'Revokes EXECUTE from PUBLIC');
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.admin_decide_reschedule_request(uuid, text, text, text) TO authenticated'), 'Grants EXECUTE to authenticated');
}

// --- §2 Service Wrapper Inspection ---
console.log('\n--- §2 Service Wrapper Inspection ---');
const serviceFile = path.join(process.cwd(), 'services', 'appointmentSelfServiceService.ts');
const serviceSql = fs.readFileSync(serviceFile, 'utf8');
assert(serviceSql.includes('adminListPendingRescheduleRequests'), 'Service wrapper includes adminListPendingRescheduleRequests');
assert(serviceSql.includes('adminDecideRescheduleRequest'), 'Service wrapper includes adminDecideRescheduleRequest');

// --- §3 Unauthenticated & Anon Denial Matrix ---
console.log('\n--- §3 Unauthenticated & Anon Denial Matrix ---');
async function testAnonDenial() {
  if (!ANON_KEY) {
    console.log('  ⚠️ Skipping live HTTP checks (No VITE_SUPABASE_ANON_KEY set)');
    return;
  }

  // Anon decision RPC call
  const decRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_decide_reschedule_request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      p_change_request_id: '00000000-0000-0000-0000-000000000000',
      p_decision: 'approved'
    })
  });

  const decData = await decRes.json();
  const decDenied = decRes.status === 401 || decRes.status === 403 || decData?.reason_code === 'unauthenticated' || decData?.code === 'PGRST301';
  assert(decDenied, 'Anon call to admin_decide_reschedule_request is denied');

  // Anon list RPC call
  const listRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_pending_reschedule_requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_limit: 10 })
  });

  const listData = await listRes.json();
  const listDenied = listRes.status === 401 || listRes.status === 403 || listData?.reason_code === 'unauthenticated' || listData?.code === 'PGRST301';
  assert(listDenied, 'Anon call to admin_list_pending_reschedule_requests is denied');
}

await testAnonDenial();

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage F3 Admin Reschedule Request Decision Backend QA PASSED.');
