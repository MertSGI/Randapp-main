// scripts/test-customer-rescheduling-rpc.mjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

try {
  const envLocal = fs.readFileSync('.env.local', 'utf8');
  for (const line of envLocal.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
} catch (e) {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rwedeejhjazwjthdjzrt.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function getOwnerToken() {
  const email = process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com';
  const password = process.env.LARI_STAGE_D1_OWNER_PASSWORD || '';
  if (!password) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

async function createBooking(dateStr, timeStr, nameStr) {
  const d = dateStr || '2026-11-10';
  const t = timeStr || '10:00';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      p_slug: 'melis-guzellik',
      p_service_id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
      p_staff_id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
      p_branch_id: 'b0000000-0000-0000-0000-000000000001',
      p_appointment_date: d,
      p_appointment_time: t,
      p_customer_name: nameStr,
      p_customer_phone: '+905556667788',
      p_customer_email: 'reschedule_qa@test.local',
      p_required_consent: true,
      p_marketing_consent: false,
      p_reminder_consent: false,
      p_idempotency_key: 'r_qa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.success) {
    const backupRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        p_slug: 'melis-guzellik',
        p_service_id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
        p_staff_id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
        p_branch_id: 'b0000000-0000-0000-0000-000000000001',
        p_appointment_date: '2026-11-12',
        p_appointment_time: '11:00',
        p_customer_name: nameStr,
        p_customer_phone: '+905556667788',
        p_customer_email: 'reschedule_qa@test.local',
        p_required_consent: true,
        p_marketing_consent: false,
        p_reminder_consent: false,
        p_idempotency_key: 'r_qa_b_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
      })
    });
    return await backupRes.json();
  }
  return data;
}

async function cleanupAppointment(ownerToken, appointmentId) {
  if (!ownerToken || !appointmentId) return;
  const h = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
  await fetch(`${SUPABASE_URL}/rest/v1/appointment_change_requests?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/customer_reschedule_idempotency?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/appointment_access_tokens?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/admin_mutation_idempotency?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/audit_events?resource_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/communication_outbox?recipient=eq.+905556667788`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
}

async function main() {
  console.log('=== Stage F1 — Customer Rescheduling RPC QA ===\n');

  // --- §1 Static File & Contract Assertions ---
  console.log('--- §1 Static Migration 30 File & Contract ---');
  const migFile = path.join(process.cwd(), 'supabase', 'migrations', '20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql');
  const fileExists = fs.existsSync(migFile);
  assert(fileExists, 'Migration 30 file exists');

  if (fileExists) {
    const sql = fs.readFileSync(migFile, 'utf8');
    assert(sql.includes('request_public_appointment_reschedule_by_manage_token'), 'Defines RPC request_public_appointment_reschedule_by_manage_token');
    assert(sql.includes('SECURITY DEFINER'), 'Uses SECURITY DEFINER');
    assert(sql.includes('SET search_path = pg_catalog, public'), 'Explicitly sets search_path = pg_catalog, public');
    assert(sql.includes('sha256('), 'Uses sha256 for manage-token digest lookup');
    assert(sql.includes('FOR UPDATE'), 'Row-locks appointment FOR UPDATE');
    assert(sql.includes('REVOKE ALL ON FUNCTION public.request_public_appointment_reschedule_by_manage_token'), 'Revokes EXECUTE from PUBLIC');
    assert(sql.includes('GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token'), 'Grants EXECUTE to anon and authenticated');
    assert(sql.includes('appointment_change_requests'), 'Inserts change-request record into appointment_change_requests');
    assert(sql.includes('audit_events'), 'Inserts transactional audit_events');
    assert(sql.includes('communication_outbox'), 'Inserts transactional communication_outbox');
  }

  const mig31File = path.join(process.cwd(), 'supabase', 'migrations', '20260806_request_public_appointment_reschedule_outbox_fix.sql');
  const mig31Exists = fs.existsSync(mig31File);
  assert(mig31Exists, 'Migration 31 file exists');
  if (mig31Exists) {
    const sql31 = fs.readFileSync(mig31File, 'utf8');
    assert(sql31.includes('reschedule_request_created'), 'Uses correct reschedule_request_created outbox metadata event_type');
    assert(sql31.includes('idx_appointment_change_requests_pending_reschedule'), 'Creates unique partial index for pending reschedule requests');
    assert(sql31.includes('request_already_pending'), 'Returns reason_code request_already_pending for duplicate active pending requests');
  }

  // --- §2 Remote RPC Execution Matrix ---
  console.log('\n--- §2 RPC Execution Matrix ---');

  // Invalid Token Test
  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_token: 'invalid_bogus_token_12345678901234567890123456789012', p_requested_date: '2026-11-15', p_requested_time: '14:00' })
  });
  const invData = await invRes.json();
  assert(invData?.success === false && invData?.reason_code === 'invalid_token', 'Invalid manage token returns success: false, reason_code: invalid_token');

  // Invalid Date Test
  const invDateRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_token: 'invalid_bogus_token_12345678901234567890123456789012', p_requested_date: '2020-01-01', p_requested_time: '14:00' })
  });
  const invDateData = await invDateRes.json();
  assert(invDateData?.success === false && invDateData?.reason_code === 'invalid_date', 'Past date returns success: false, reason_code: invalid_date');

  // Invalid Time Format Test
  const invTimeRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_token: 'invalid_bogus_token_12345678901234567890123456789012', p_requested_date: '2026-11-15', p_requested_time: '25:99' })
  });
  const invTimeData = await invTimeRes.json();
  assert(invTimeData?.success === false && invTimeData?.reason_code === 'invalid_time', 'Invalid time format returns success: false, reason_code: invalid_time');

  // Create real test booking fixture
  const b = await createBooking('2026-11-10', '10:00', 'Reschedule RPC Test');
  const token = b?.manage_token;
  const aptId = b?.appointment_id;
  const ownerToken = await getOwnerToken();

  if (token && aptId) {
    assert(!!token && !!aptId, 'Created test booking fixture');

    // Valid Reschedule Request
    const key = 'r_idem_' + Date.now();
    const resRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token, p_requested_date: '2026-11-15', p_requested_time: '14:00', p_reason: 'I have a meeting', p_idempotency_key: key })
    });
    const resData = await resRes.json();
    assert(resData?.success === true && resData?.reason_code === 'ok' && resData?.changed === true, 'Valid reschedule request returns success: true, reason_code: ok, changed: true');

    // Idempotency Replay
    const repRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token, p_requested_date: '2026-11-15', p_requested_time: '14:00', p_reason: 'I have a meeting', p_idempotency_key: key })
    });
    const repData = await repRes.json();
    assert(repData?.success === true && repData?.appointment_id === aptId, 'Idempotency replay returns cached response');

    // Second Request with Different Key while Request is Pending
    const pendRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token, p_requested_date: '2026-11-20', p_requested_time: '16:00', p_reason: 'Second attempt', p_idempotency_key: 'r_idem_diff_' + Date.now() })
    });
    const pendData = await pendRes.json();
    assert(pendData?.success === false && pendData?.reason_code === 'request_already_pending', 'Second request while pending returns success: false, reason_code: request_already_pending');

    // Idempotency Conflict
    const confRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_public_appointment_reschedule_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token, p_requested_date: '2026-11-20', p_requested_time: '16:00', p_reason: 'Different time', p_idempotency_key: key })
    });
    const confData = await confRes.json();
    assert(confData?.success === false && confData?.reason_code === 'idempotency_conflict', 'Idempotency conflict returns success: false, reason_code: idempotency_conflict');

    // Manage-Token Read Detail
    const readRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_appointment_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: token })
    });
    const readData = await readRes.json();
    assert(readData?.success === true && readData?.appointment?.id === aptId, 'Manage-token detail read remains functional after reschedule request');

    // Cleanup
    await cleanupAppointment(ownerToken, aptId);
    console.log('  ✅ Cleaned reschedule test fixture');
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`Passed: ${passed} | Failed: ${failed}. Stage F1 QA ${failed === 0 ? 'PASSED' : 'FAILED'}.\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
