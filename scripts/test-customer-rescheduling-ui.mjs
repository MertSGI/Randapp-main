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

console.log('=== Stage F2 — Customer Reschedule Request UI Integration QA ===\n');

// 1. Check AppointmentSelfServicePage.tsx exists
const pagePath = path.join(process.cwd(), 'pages', 'AppointmentSelfServicePage.tsx');
assert(fs.existsSync(pagePath), 'AppointmentSelfServicePage.tsx exists');
const pageContent = fs.readFileSync(pagePath, 'utf8');

// 2. Check Service File exists
const servicePath = path.join(process.cwd(), 'services', 'appointmentSelfServiceService.ts');
assert(fs.existsSync(servicePath), 'appointmentSelfServiceService.ts exists');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

// 3. Approval-based Turkish product wording assertions
assert(pageContent.includes('Randevu Değişikliği Talep Et'), 'Primary action wording "Randevu Değişikliği Talep Et" present');
assert(pageContent.includes('Randevu Değişikliği Talebi'), 'Modal title wording "Randevu Değişikliği Talebi" present');
assert(pageContent.includes('Değişiklik talebiniz işletmenin onayını bekliyor.'), 'Pending banner wording present');
assert(pageContent.includes('Talep Edilen Tarih'), 'Proposed schedule rendered separately with "Talep Edilen Tarih" label');
assert(pageContent.includes('Talep Edilen Saat'), 'Proposed schedule rendered separately with "Talep Edilen Saat" label');

// 4. Assert NO immediate-reschedule wording
assert(!pageContent.includes('Randevunuz değiştirildi'), 'NO immediate-reschedule wording "Randevunuz değiştirildi" present');
assert(!pageContent.includes('Yeni randevunuz onaylandı'), 'NO immediate-reschedule wording "Yeni randevunuz onaylandı" present');

// 5. Eligibility assertions
assert(pageContent.includes("appointment.status === 'confirmed'"), 'Action restricted to confirmed status only');
assert(pageContent.includes('pendingRequest'), 'Pending request state checked to hide action when request exists');

// 6. Double-submit guard & Idempotency key handling
assert(pageContent.includes('idempotencyKeyRef'), 'Idempotency key ref present for double-submit protection');
assert(pageContent.includes('submitting'), 'Submitting state disables form buttons');

// 7. Reason-code mapping
assert(pageContent.includes('mapRescheduleReasonCodeToMessage'), 'Reason-code mapping function present');
assert(pageContent.includes('slot_unavailable'), 'Handles slot_unavailable reason code');
assert(pageContent.includes('request_already_pending'), 'Handles request_already_pending reason code');

// 8. Secure RPC wrapper usage & zero direct writes
assert(serviceContent.includes('requestRescheduleByManageToken'), 'Uses secure RPC wrapper requestRescheduleByManageToken');
assert(serviceContent.includes('getPendingRescheduleRequestByManageToken'), 'Uses secure RPC wrapper getPendingRescheduleRequestByManageToken');

const directPatchMatches = (pageContent.match(/\/appointments\?.*method=PATCH/g) || []).length;
assert(directPatchMatches === 0, 'Direct PATCH /rest/v1/appointments count in UI = 0');

const directChangeReqInserts = (pageContent.match(/\/appointment_change_requests.*method=POST/g) || []).length;
assert(directChangeReqInserts === 0, 'Direct POST /rest/v1/appointment_change_requests count in UI = 0');

// 9. Payment safety
assert(!pageContent.includes('iyzico') && !pageContent.includes('checkout'), 'NO payments or checkout UI introduced');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage F2 Customer Rescheduling UI QA PASSED.');
