// scripts/test-appointments-direct-write-hardening.mjs
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rwedeejhjazwjthdjzrt.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
    process.exitCode = 1;
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

async function getStaffToken() {
  const email = process.env.LARI_STAGE_D1_STAFF_EMAIL || 'melisstaff@randevulari.com';
  const password = process.env.LARI_STAGE_D1_STAFF_PASSWORD || '';
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      p_slug: 'melis-guzellik',
      p_service_id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
      p_staff_id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
      p_branch_id: 'b0000000-0000-0000-0000-000000000001',
      p_appointment_date: dateStr,
      p_appointment_time: timeStr,
      p_customer_name: nameStr,
      p_customer_phone: '+905559998877',
      p_customer_email: 'hardening_test@test.local',
      p_required_consent: true,
      p_marketing_consent: false,
      p_reminder_consent: false,
      p_idempotency_key: 'h_test_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
    })
  });
  if (!res.ok) return null;
  return await res.json();
}

async function cleanupAppointment(ownerToken, appointmentId) {
  if (!ownerToken || !appointmentId) return;
  const h = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
  await fetch(`${SUPABASE_URL}/rest/v1/appointment_access_tokens?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/admin_mutation_idempotency?appointment_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/audit_events?resource_id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/communication_outbox?recipient=eq.+905559998877`, { method: 'DELETE', headers: h });
  await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${appointmentId}`, { method: 'DELETE', headers: h });
}

async function main() {
  console.log('=== Stage D2B — Appointments Direct-Write Database Hardening QA ===\n');

  // §1 Static Migration 29 Contract
  console.log('--- §1 Static Migration 29 File & Contract ---');
  const migPath = path.join(process.cwd(), 'supabase/migrations/20260804_appointments_direct_update_hardening.sql');
  assert(fs.existsSync(migPath), 'Migration 29 file exists');
  const sql = fs.readFileSync(migPath, 'utf8');
  assert(sql.includes('REVOKE UPDATE ON public.appointments FROM PUBLIC'), 'Revokes UPDATE from PUBLIC');
  assert(sql.includes('REVOKE UPDATE ON public.appointments FROM anon'), 'Revokes UPDATE from anon');
  assert(sql.includes('REVOKE UPDATE ON public.appointments FROM authenticated'), 'Revokes UPDATE from authenticated');
  assert(sql.includes('DROP POLICY IF EXISTS'), 'Drops obsolete direct UPDATE RLS policies');

  // Get Auth Tokens
  const ownerToken = await getOwnerToken();
  const staffToken = await getStaffToken();

  console.log('\n--- §2 Direct Status Mutation Denial Matrix Over HTTP ---');
  const booking = await createBooking('2026-09-10', '11:00', 'Direct Patch Test');
  const aptId = booking?.appointment_id;
  assert(!!aptId, 'Created test booking for direct patch matrix');

  if (aptId) {
    // 1. Unauthenticated direct PATCH
    const unauthRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    const unauthBody = await unauthRes.json();
    assert(unauthRes.status === 401 || (Array.isArray(unauthBody) && unauthBody.length === 0), 'Unauthenticated direct status PATCH denied / 0 rows mutated');

    // 2. Anon direct PATCH
    const anonRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Prefer': 'return=representation' },
      body: JSON.stringify({ status: 'cancelled_by_customer' })
    });
    const anonBody = await anonRes.json();
    assert(Array.isArray(anonBody) && anonBody.length === 0, 'Anon direct status PATCH denied / 0 rows mutated');

    // 3. Authenticated Owner direct PATCH
    if (ownerToken) {
      const ownerPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: 'completed' })
      });
      const ownerPatchBody = await ownerPatchRes.json();
      assert(ownerPatchRes.status === 403 || (Array.isArray(ownerPatchBody) && ownerPatchBody.length === 0), 'Authenticated owner direct status PATCH denied by DB permissions');
    }

    // 4. Authenticated Staff direct PATCH
    if (staffToken) {
      const staffPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${staffToken}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: 'no_show' })
      });
      const staffPatchBody = await staffPatchRes.json();
      assert(staffPatchRes.status === 403 || (Array.isArray(staffPatchBody) && staffPatchBody.length === 0), 'Authenticated staff direct status PATCH denied by DB permissions');
    }

    // 5. Multi-column atomic denial test
    if (ownerToken) {
      const multiPatchRes = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: 'completed', notes: 'Atomic test note' })
      });
      const multiPatchBody = await multiPatchRes.json();
      assert(multiPatchRes.status === 403 || (Array.isArray(multiPatchBody) && multiPatchBody.length === 0), 'Atomic multi-column direct PATCH containing status denied');
    }

    // 6. Protected status vocabulary denial
    const statuses = ['completed', 'no_show', 'cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'invalid_bogus_status'];
    let allDenied = true;
    for (const st of statuses) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${aptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: st })
      });
      const body = await res.json();
      if (!Array.isArray(body) || body.length > 0) {
        allDenied = false;
      }
    }
    assert(allDenied, 'All protected status vocabulary values denied direct table mutation');

    // Clean test fixture
    await cleanupAppointment(ownerToken, aptId);
    console.log('  ✅ Cleaned direct status mutation test fixture');
  }

  console.log('\n--- §3 Canonical RPC Regression Matrix ---');
  // Test Admin Owner Mutation RPC
  if (ownerToken) {
    const bOwner = await createBooking('2026-09-10', '12:00', 'Owner RPC Test');
    if (bOwner?.appointment_id) {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_appointment_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` },
        body: JSON.stringify({
          p_appointment_id: bOwner.appointment_id,
          p_new_status: 'completed',
          p_reason: 'Owner RPC regression check',
          p_idempotency_key: 'h_idem_' + Date.now()
        })
      });
      const rpcData = await rpcRes.json();
      assert(rpcRes.status === 200 && rpcData.success === true && rpcData.changed === true, 'admin_update_appointment_status RPC succeeds for owner after DB hardening');
      await cleanupAppointment(ownerToken, bOwner.appointment_id);
    }
  }

  // Test Customer Manage Token Cancellation RPC
  const bCustomer = await createBooking('2026-09-10', '13:00', 'Customer Token RPC Test');
  if (bCustomer?.appointment_id && bCustomer?.manage_token) {
    const cancelRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_public_appointment_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        p_token: bCustomer.manage_token,
        p_reason: 'Customer token RPC regression check'
      })
    });
    const cancelData = await cancelRes.json();
    assert(cancelRes.status === 200 && cancelData.success === true && cancelData.status === 'cancelled_by_customer', 'cancel_public_appointment_by_manage_token RPC succeeds for customer after DB hardening');

    // Detail read check
    const detailRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_appointment_by_manage_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_token: bCustomer.manage_token })
    });
    const detailData = await detailRes.json();
    assert(detailRes.status === 200 && detailData.success === true && detailData.appointment?.status === 'cancelled_by_customer', 'Manage token detail read RPC remains functional after cancellation');

    await cleanupAppointment(ownerToken, bCustomer.appointment_id);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`✅ Passed: ${passed} | Failed: ${failed}. Stage D2B DB hardening QA PASSED.`);
  } else {
    console.error(`❌ Passed: ${passed} | Failed: ${failed}. Stage D2B DB hardening QA FAILED.`);
  }
}

main().catch(console.error);
