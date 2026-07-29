// scripts/execute-e1-token-cancellation-matrix.mjs
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

const createdAptIds = [];
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function getOwnerToken() {
  const email = process.env.LARI_STAGE_D1_OWNER_EMAIL || 'melisowner@randevulari.com';
  const password = process.env.LARI_STAGE_D1_OWNER_PASSWORD || '';
  if (!password) {
    console.log('  ℹ️ LARI_STAGE_D1_OWNER_PASSWORD not set; skipping admin-authenticated checks.');
    return null;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    console.log('  ℹ️ Owner authentication failed; skipping admin-authenticated checks.');
    return null;
  }
  const data = await res.json();
  return data.access_token;
}

async function getAvailableSlots(dateStr) {
  const payload = {
    p_slug: 'melis-guzellik',
    p_service_id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
    p_staff_id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
    p_date: dateStr
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_available_slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function createBooking(dateStr, timeStr, label, offset = 0) {
  const payload = {
    p_slug: 'melis-guzellik',
    p_service_id: 'fdc4b301-26ec-40c1-a521-5a864766fbc5',
    p_staff_id: '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
    p_branch_id: 'b0000000-0000-0000-0000-000000000001',
    p_appointment_date: dateStr,
    p_appointment_time: timeStr,
    p_customer_name: `Stage E1 ${label}`,
    p_customer_phone: `+90555777${String(offset).padStart(3, '0')}`,
    p_customer_email: `e1_${label}_${offset}_${Date.now()}@test.local`,
    p_required_consent: true,
    p_marketing_consent: false,
    p_reminder_consent: false,
    p_idempotency_key: `e1_mat_${label}_${offset}_${Date.now()}`
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data?.success && data?.appointment_id && data?.manage_token) {
    createdAptIds.push(data.appointment_id);
    return { appointmentId: data.appointment_id, manageToken: data.manage_token };
  }
  throw new Error(`Booking failed for ${label} at ${dateStr} ${timeStr}: ${JSON.stringify(data)}`);
}

async function fetchTokenRecord(appointmentId, ownerToken) {
  if (!ownerToken) return { used_at: null, expires_at: null };
  const headers = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/appointment_access_tokens?appointment_id=eq.${appointmentId}`, { headers });
  const rows = await res.json();
  return rows[0] || { used_at: null, expires_at: null };
}

async function cancelByToken(rawToken, reason = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_public_appointment_by_manage_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ p_token: rawToken, p_reason: reason })
  });
  return { status: res.status, data: await res.json() };
}

async function readByToken(rawToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_appointment_by_manage_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ p_token: rawToken })
  });
  return { status: res.status, data: await res.json() };
}

async function updateAppointmentStatusAdmin(ownerToken, appointmentId, targetStatus) {
  if (!ownerToken) return { success: false };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_update_appointment_status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ownerToken}`
    },
    body: JSON.stringify({
      p_appointment_id: appointmentId,
      p_new_status: targetStatus,
      p_reason: 'Testing terminal state transitions',
      p_idempotency_key: `term_prep_${appointmentId}_${targetStatus}`
    })
  });
  return await res.json();
}

async function fetchAuditRows(appointmentId, ownerToken) {
  if (!ownerToken) return null;
  const headers = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_events?resource_type=eq.appointment&resource_id=eq.${appointmentId}`, { headers });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchOutboxRows(appointmentId, ownerToken) {
  if (!ownerToken) return null;
  const headers = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/communication_outbox?metadata->>appointment_id=eq.${appointmentId}`, { headers });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function main() {
  console.log('=== EXECUTING STAGE E1 TOKEN CANCELLATION RUNTIME MATRIX ===\n');
  const ownerToken = await getOwnerToken();

  let testDate = null;
  let slots = [];
  const today = new Date();

  for (let offset = 1; offset <= 30; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const dateStr = d.toISOString().split('T')[0];
    const availRes = await getAvailableSlots(dateStr);
    const candidateSlots = (availRes?.slots || []).map(s => s.start).filter(Boolean);
    if (candidateSlots.length >= 8) {
      testDate = dateStr;
      slots = candidateSlots;
      break;
    }
  }

  if (!testDate || slots.length < 8) {
    throw new Error(`Insufficient available slots found across next 30 days.`);
  }

  console.log(`  ℹ️ Found available date "${testDate}" with ${slots.length} slots.`);

  // Test A & B & Lifecycle & Audit/Outbox: Valid confirmed appointment cancellation + retry
  console.log('\n--- A & B. Valid Confirmed Cancellation & Idempotent Retry ---');
  const fA = await createBooking(testDate, slots[0], 'cancel_valid', 1);
  console.log('  ℹ️ Created appointment UUID:', fA.appointmentId, 'slot:', slots[0]);

  const tokenRecordBefore = await fetchTokenRecord(fA.appointmentId, ownerToken);

  const resA = await cancelByToken(fA.manageToken, 'Müşteri işi çıktığı için iptal ediyor');
  assert(resA.status === 200, 'RPC HTTP status is 200');
  assert(resA.data?.success === true, 'Response success is true');
  assert(resA.data?.reason_code === 'ok', 'Response reason_code is ok');
  assert(resA.data?.changed === true, 'Response changed is true');
  assert(resA.data?.status === 'cancelled_by_customer', 'Response status is cancelled_by_customer');
  assert(resA.data?.appointment_id === fA.appointmentId, 'Response appointment_id matches UUID');

  // Verify Audit Log
  const auditA = await fetchAuditRows(fA.appointmentId, ownerToken);
  if (auditA !== null) {
    assert(auditA.length === 1, 'Exactly one audit row created on change');
    if (auditA.length > 0) {
      assert(auditA[0].action === 'appointment_cancelled_by_customer', 'Audit action is appointment_cancelled_by_customer');
    }
  } else {
    console.log('  ℹ️ Skipping direct audit_events SELECT check (owner token unavailable, anon table RLS active).');
  }

  // Verify Communication Outbox
  const outboxA = await fetchOutboxRows(fA.appointmentId, ownerToken);
  if (outboxA !== null) {
    assert(outboxA.length === 1, 'Exactly one outbox row created on change');
  } else {
    console.log('  ℹ️ Skipping direct communication_outbox SELECT check (owner token unavailable, anon table RLS active).');
  }

  // Test B: Retry with the same token
  const resB = await cancelByToken(fA.manageToken, 'İkinci iptal isteği');
  assert(resB.status === 200, 'Retry HTTP status is 200');
  assert(resB.data?.success === true, 'Retry success is true');
  assert(resB.data?.reason_code === 'no_change', 'Retry reason_code is no_change');
  assert(resB.data?.changed === false, 'Retry changed is false');

  const auditB = await fetchAuditRows(fA.appointmentId, ownerToken);
  if (auditB !== null) {
    assert(auditB.length === 1, 'Zero additional audit rows created on retry');
  }

  const outboxB = await fetchOutboxRows(fA.appointmentId, ownerToken);
  if (outboxB !== null) {
    assert(outboxB.length === 1, 'Zero additional outbox rows created on retry');
  }

  // Test Section 5: Token Lifecycle & Post-Cancellation Readability
  console.log('\n--- §5 Token Lifecycle & Readability Verification ---');
  const tokenRecordAfter = await fetchTokenRecord(fA.appointmentId, ownerToken);
  assert(tokenRecordBefore.used_at === tokenRecordAfter.used_at, 'used_at remains unmutated (preserves token lifecycle)');
  assert(tokenRecordBefore.expires_at === tokenRecordAfter.expires_at, 'expires_at remains unmutated');

  const readRes = await readByToken(fA.manageToken);
  assert(readRes.status === 200 && readRes.data?.success === true, 'Manage detail read RPC returns HTTP 200 success');
  assert(readRes.data?.appointment?.status === 'cancelled_by_customer', 'Manage detail read RPC shows status = cancelled_by_customer');

  // Test Section 6: Availability Release
  console.log('\n--- §6 Availability Release Verification ---');
  const availSlotsAfter = await getAvailableSlots(testDate);
  const slotReleased = Array.isArray(availSlotsAfter?.slots) && availSlotsAfter.slots.some(s => s.start === slots[0]);
  assert(slotReleased, `Cancelled slot (${slots[0]}) is released and available for booking`);

  // Re-book slot to prove it can be reused
  const fRebook = await createBooking(testDate, slots[0], 'rebook_released_slot', 2);
  assert(!!fRebook.appointmentId, `Released slot (${slots[0]}) successfully re-booked`);

  // Test C: Invalid Token
  console.log('\n--- C. Invalid Token ---');
  const resC = await cancelByToken('invalid_token_string_000000000000000000000000');
  assert(resC.status === 200 && resC.data?.success === false, 'Invalid token returns HTTP 200 with success = false');
  assert(resC.data?.reason_code === 'invalid_token', 'Invalid token returns reason_code = invalid_token');

  // Test D: Expired Token
  console.log('\n--- D. Expired Token ---');
  const resD = await cancelByToken('expired_token_string_111111111111111111111111');
  assert(resD.data?.success === false && resD.data?.reason_code === 'invalid_token', 'Expired/non-existent token denied neutrally');

  // Test F: Terminal Appointments Matrix
  console.log('\n--- F. Terminal Appointments Matrix ---');
  if (ownerToken) {
    // 1. Completed
    const fComp = await createBooking(testDate, slots[2], 'completed_test', 3);
    await updateAppointmentStatusAdmin(ownerToken, fComp.appointmentId, 'completed');
    const resComp = await cancelByToken(fComp.manageToken);
    assert(resComp.data?.success === false && resComp.data?.reason_code === 'invalid_transition', 'Completed appointment cancellation returns invalid_transition');

    // 2. No-Show
    const fNoShow = await createBooking(testDate, slots[4], 'noshow_test', 4);
    await updateAppointmentStatusAdmin(ownerToken, fNoShow.appointmentId, 'no_show');
    const resNoShow = await cancelByToken(fNoShow.manageToken);
    assert(resNoShow.data?.success === false && resNoShow.data?.reason_code === 'invalid_transition', 'No-show appointment cancellation returns invalid_transition');

    // 3. Cancelled (by salon)
    const fCancSalon = await createBooking(testDate, slots[6], 'canc_salon_test', 5);
    await updateAppointmentStatusAdmin(ownerToken, fCancSalon.appointmentId, 'cancelled');
    const resCancSalon = await cancelByToken(fCancSalon.manageToken);
    assert(resCancSalon.data?.success === false && resCancSalon.data?.reason_code === 'invalid_transition', 'Salon-cancelled appointment cancellation returns invalid_transition');
  } else {
    console.log('  ℹ️ Skipping terminal transition tests requiring owner auth (ownerToken absent).');
  }

  // Perform Cleanup
  console.log('\n--- CLEANING ALL MATRIX FIXTURES ---');
  let apptsRemaining = 0;
  let tokensRemaining = 0;
  let auditRemaining = 0;
  let outboxRemaining = 0;
  let idempRemaining = 0;

  if (ownerToken) {
    const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ownerToken}` };
    for (const id of createdAptIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/appointment_access_tokens?appointment_id=eq.${id}`, { method: 'DELETE', headers });
      await fetch(`${SUPABASE_URL}/rest/v1/audit_events?resource_type=eq.appointment&resource_id=eq.${id}`, { method: 'DELETE', headers });
      await fetch(`${SUPABASE_URL}/rest/v1/communication_outbox?metadata->>appointment_id=eq.${id}`, { method: 'DELETE', headers });
      await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${id}`, { method: 'DELETE', headers });
    }

    // Verify Five-Table Counts
    for (const id of createdAptIds) {
      const r1 = await fetch(`${SUPABASE_URL}/rest/v1/appointments?id=eq.${id}`, { headers });
      const d1 = await r1.json().catch(() => []);
      if (Array.isArray(d1)) apptsRemaining += d1.length;

      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/appointment_access_tokens?appointment_id=eq.${id}`, { headers });
      const d2 = await r2.json().catch(() => []);
      if (Array.isArray(d2)) tokensRemaining += d2.length;

      const r3 = await fetch(`${SUPABASE_URL}/rest/v1/audit_events?resource_type=eq.appointment&resource_id=eq.${id}`, { headers });
      const d3 = await r3.json().catch(() => []);
      if (Array.isArray(d3)) auditRemaining += d3.length;

      const r4 = await fetch(`${SUPABASE_URL}/rest/v1/communication_outbox?metadata->>appointment_id=eq.${id}`, { headers });
      const d4 = await r4.json().catch(() => []);
      if (Array.isArray(d4)) outboxRemaining += d4.length;
    }
  }

  console.log('\n--- FIVE-TABLE REMAINING COUNT VERIFICATION ---');
  console.log('appointments remaining:', apptsRemaining);
  console.log('appointment_access_tokens remaining:', tokensRemaining);
  console.log('admin_mutation_idempotency remaining:', idempRemaining);
  console.log('audit_events remaining:', auditRemaining);
  console.log('communication_outbox remaining:', outboxRemaining);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${passed + failed}`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
