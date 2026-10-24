/**
 * LARI Phase A Functional Acceptance Test Suite
 * ============================================================================
 * Exercises the customer booking journey through the admin calendar and back
 * to customer self-service with an isolated synthetic single-branch salon fixture:
 * 
 * 1. Booking an available slot.
 * 2. Rejecting a conflicting booking.
 * 3. Honoring staff time-off and working-hour overrides.
 * 4. Preserving service-duration and staff eligibility constraints.
 * 5. Handling cancellation/rescheduling without ghost slots.
 * 6. Ensuring expired or invalid self-service tokens cannot change bookings.
 * 7. Keeping tenant A bookings isolated from tenant B.
 * 8. Ensuring no-show protection does not incorrectly block unrelated customers.
 * 9. Ensuring booking success does not imply SMS, email or WhatsApp delivery.
 * 10. Ensuring leaving the pilot demo restores previous local tenant state.
 */

import assert from 'node:assert/strict';

// Setup headless WebSocket mock for Node.js < 22 runtime
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

// Configure process and global environment for headless runner
process.env.VITE_DATA_MODE = 'local';
process.env.VITE_LAUNCH_MODE = 'local_pre_live';

if (!globalThis.import) {
  globalThis.import = {
    meta: {
      env: {
        VITE_DATA_MODE: 'local',
        VITE_LAUNCH_MODE: 'local_pre_live'
      }
    }
  };
}

// Setup headless browser environment globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.window.location = {
  protocol: 'https:',
  host: 'staging.lari.app',
  origin: 'https://staging.lari.app'
};

const storageMap = new Map();
globalThis.localStorage = {
  get length() {
    return storageMap.size;
  },
  key: (index) => {
    return Array.from(storageMap.keys())[index] || null;
  },
  getItem: (key) => {
    return storageMap.has(key) ? storageMap.get(key) : null;
  },
  setItem: (key, val) => {
    storageMap.set(key, String(val));
  },
  removeItem: (key) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  }
};

// Import services via tsx dynamic import
const { createAppointment, updateAppointmentStatus, getAppointments } = await import('../services/appointmentService.ts');
const { availabilityService } = await import('../services/availabilityService.ts');
const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService.ts');
const { bookingAbuseProtectionService } = await import('../services/bookingAbuseProtectionService.ts');
const { pilotDemoService, DEMO_PILOT_TENANT_ID } = await import('../services/pilotDemoService.ts');
const { getCatalogRepository, getBookingRepository, getSelfServiceRepository } = await import('../services/repositories/index.ts');
const { sendBookingSms, sendBookingEmail, sendAutomatedWhatsApp } = await import('../services/notificationService.ts');
const { communicationEventService } = await import('../services/communicationEventService.ts');

console.log('='.repeat(80));
console.log('LARI — PHASE A FUNCTIONAL ACCEPTANCE SUITE (WP-1)');
console.log('='.repeat(80));

const TENANT_A = 'tenant_phase_a_salon';
const TENANT_B = 'tenant_phase_a_other_salon';

// ----------------------------------------------------------------------------
// Fixture Initialization: 1-branch salon, 3 staff, 7 services, rules & mappings
// ----------------------------------------------------------------------------
async function initSalonFixture() {
  storageMap.clear();

  const catalogRepo = getCatalogRepository();

  // 1. Services
  const services = [
    { id: 'srv_w_haircut', name: 'Women Haircut', name_tr: 'Kadın Saç Kesimi', duration: 45, price: 500, active: true },
    { id: 'srv_coloring', name: 'Hair Coloring', name_tr: 'Saç Boyama', duration: 90, price: 1200, active: true },
    { id: 'srv_blowdry', name: 'Blowdry', name_tr: 'Fön', duration: 30, price: 200, active: true },
    { id: 'srv_m_haircut', name: 'Men Haircut', name_tr: 'Erkek Saç Kesimi', duration: 30, price: 350, active: true },
    { id: 'srv_beard', name: 'Beard Grooming', name_tr: 'Sakal Tıraşı', duration: 20, price: 150, active: true },
    { id: 'srv_manicure', name: 'Manicure', name_tr: 'Manikür', duration: 45, price: 400, active: true },
    { id: 'srv_pedicure', name: 'Pedicure', name_tr: 'Pedikür', duration: 45, price: 450, active: true }
  ];
  storageMap.set(`lari:${TENANT_A}:services`, JSON.stringify(services.map(s => ({ ...s, tenantId: TENANT_A }))));
  storageMap.set(`lari:${TENANT_A}:is_seeded_services`, 'true');

  // 2. Staff
  const staff = [
    { id: 'staff_ayse', tenantId: TENANT_A, name: 'Ayşe Yılmaz', title: 'Colorist & Stylist', isOwner: true, active: true },
    { id: 'staff_mehmet', tenantId: TENANT_A, name: 'Mehmet Demir', title: 'Barber Specialist', isOwner: false, active: true },
    { id: 'staff_zeynep', tenantId: TENANT_A, name: 'Zeynep Kaya', title: 'Nail Artist', isOwner: false, active: true }
  ];
  storageMap.set(`lari:${TENANT_A}:staff`, JSON.stringify(staff));

  // 3. Staff-Service Eligibility Mappings
  const staffServiceMappings = {
    staff_ayse: ['srv_w_haircut', 'srv_coloring', 'srv_blowdry'],
    staff_mehmet: ['srv_m_haircut', 'srv_beard'],
    staff_zeynep: ['srv_manicure', 'srv_pedicure']
  };
  storageMap.set(`lari:${TENANT_A}:staff_services`, JSON.stringify(staffServiceMappings));

  // 4. Availability Rules:
  // Base Salon hours: Monday(1) to Saturday(6) 09:00 - 18:00. Sunday(7) closed.
  // Overrides:
  // - Ayşe is on leave on Wednesdays (weekday 3, is_active: false)
  // - Mehmet working-hour override on Thursdays (weekday 4): 12:00 - 17:00
  const rules = [];
  // Tenant default rules (staffId = null)
  for (let d = 1; d <= 7; d++) {
    rules.push({
      id: `rule_tenant_${d}`,
      tenantId: TENANT_A,
      staffId: null,
      weekday: d,
      is_active: d !== 7,
      start_time: '09:00:00',
      end_time: '18:00:00'
    });
  }
  // Ayşe override for Wednesday (weekday 3): OFF
  rules.push({
    id: 'rule_ayse_wed',
    tenantId: TENANT_A,
    staffId: 'staff_ayse',
    weekday: 3,
    is_active: false,
    start_time: '09:00:00',
    end_time: '18:00:00'
  });
  // Mehmet override for Thursday (weekday 4): 12:00 - 17:00
  rules.push({
    id: 'rule_mehmet_thu',
    tenantId: TENANT_A,
    staffId: 'staff_mehmet',
    weekday: 4,
    is_active: true,
    start_time: '12:00:00',
    end_time: '17:00:00'
  });
  storageMap.set(`lari:${TENANT_A}:availability_rules`, JSON.stringify(rules));

  // Tenant B fixture
  const staffB = [
    { id: 'staff_b_1', tenantId: TENANT_B, name: 'Canan Öz', title: 'Stylist', isOwner: true, active: true }
  ];
  storageMap.set(`lari:${TENANT_B}:staff`, JSON.stringify(staffB));
  storageMap.set(`lari:${TENANT_B}:services`, JSON.stringify(services.map(s => ({ ...s, tenantId: TENANT_B }))));
  storageMap.set(`lari:${TENANT_B}:staff_services`, JSON.stringify({ staff_b_1: ['srv_w_haircut'] }));

  // Mark seeded for both tenants to start from an explicit empty state
  storageMap.set(`lari:${TENANT_A}:appointments_seeded`, 'true');
  storageMap.set(`lari:${TENANT_A}:appointments`, JSON.stringify([]));
  storageMap.set(`lari:${TENANT_B}:appointments_seeded`, 'true');
  storageMap.set(`lari:${TENANT_B}:appointments`, JSON.stringify([]));
}

await initSalonFixture();

// ----------------------------------------------------------------------------
// Test 1: Booking an available slot
// ----------------------------------------------------------------------------
console.log('\n[Scenario 1] Booking an available slot...');
// 2026-11-03 is Tuesday (weekday 2)
const testDateTuesday = '2026-11-03';
const openSlotsBefore = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_ayse', 'srv_w_haircut', testDateTuesday);
assert.ok(openSlotsBefore.length > 0, 'Ayşe must have available slots on open Tuesday');
assert.ok(openSlotsBefore.some(s => s.time === '09:00'), '09:00 slot must be available before booking');

const bookedApt = await createAppointment(TENANT_A, {
  userId: 'user_cust_1',
  user_name: 'Selin Yıldız',
  user_email: 'selin@example.com',
  phone: '+90 555 101 2030',
  serviceId: 'srv_w_haircut',
  staffId: 'staff_ayse',
  date: testDateTuesday,
  time: '09:00',
  status: 'confirmed',
  syncedToGoogle: false
});

assert.ok(bookedApt.id, 'Appointment must have a generated ID');
assert.equal(bookedApt.status, 'confirmed');
assert.equal(bookedApt.time, '09:00');

// Verify slot consumption (45 mins duration covers 09:00 to 09:45)
const openSlotsAfter = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_ayse', 'srv_w_haircut', testDateTuesday);
assert.ok(!openSlotsAfter.some(s => s.time === '09:00'), '09:00 slot must now be unavailable');
assert.ok(!openSlotsAfter.some(s => s.time === '09:15'), '09:15 overlapping slot must now be unavailable');
assert.ok(!openSlotsAfter.some(s => s.time === '09:30'), '09:30 overlapping slot must now be unavailable');
assert.ok(openSlotsAfter.some(s => s.time === '09:45'), '09:45 slot after service completion must remain available');
console.log('✅ Scenario 1 PASS: Available slot booked and duration window consumed.');

// ----------------------------------------------------------------------------
// Test 2: Rejecting a conflicting booking
// ----------------------------------------------------------------------------
console.log('\n[Scenario 2] Rejecting a conflicting booking...');
let conflictRejected = false;
try {
  await createAppointment(TENANT_A, {
    userId: 'user_cust_2',
    user_name: 'Demet Akal',
    user_email: 'demet@example.com',
    phone: '+90 555 202 3040',
    serviceId: 'srv_w_haircut',
    staffId: 'staff_ayse',
    date: testDateTuesday,
    time: '09:15', // Overlaps with 09:00 - 09:45 appointment
    status: 'confirmed',
    syncedToGoogle: false
  });
} catch (err) {
  conflictRejected = true;
  assert.ok(err.message.includes('Slot conflict'), `Error must mention Slot conflict, got: ${err.message}`);
}
assert.equal(conflictRejected, true, 'Conflicting booking on overlapping slot must be rejected');

// A non-overlapping booking at 09:45 must succeed
const nonConflictApt = await createAppointment(TENANT_A, {
  userId: 'user_cust_3',
  user_name: 'Gizem Tan',
  user_email: 'gizem@example.com',
  phone: '+90 555 303 4050',
  serviceId: 'srv_blowdry', // 30 mins
  staffId: 'staff_ayse',
  date: testDateTuesday,
  time: '09:45',
  status: 'confirmed',
  syncedToGoogle: false
});
assert.ok(nonConflictApt.id, 'Non-overlapping adjacent slot must book successfully');
console.log('✅ Scenario 2 PASS: Overlapping booking rejected and adjacent open slot accepted.');

// ----------------------------------------------------------------------------
// Test 3: Honoring staff time-off and working-hour overrides
// ----------------------------------------------------------------------------
console.log('\n[Scenario 3] Honoring staff time-off and working-hour overrides...');
// 2026-11-04 is Wednesday (weekday 3)
const testDateWednesday = '2026-11-04';
const ayseWednesdaySlots = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_ayse', 'srv_w_haircut', testDateWednesday);
assert.equal(ayseWednesdaySlots.length, 0, 'Ayşe is on leave on Wednesday: slots must be empty');

// But Mehmet is NOT on leave on Wednesday
const mehmetWednesdaySlots = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_mehmet', 'srv_m_haircut', testDateWednesday);
assert.ok(mehmetWednesdaySlots.length > 0, 'Mehmet must have open slots on Wednesday');

// 2026-11-05 is Thursday (weekday 4): Mehmet has override 12:00 - 17:00
const testDateThursday = '2026-11-05';
const mehmetThursdaySlots = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_mehmet', 'srv_m_haircut', testDateThursday);
assert.ok(mehmetThursdaySlots.length > 0, 'Mehmet has custom hours on Thursday');
assert.ok(!mehmetThursdaySlots.some(s => s.time < '12:00'), 'No slots before Mehmet 12:00 override start');
assert.ok(!mehmetThursdaySlots.some(s => s.time >= '17:00'), 'No slots at or after Mehmet 17:00 override end');
assert.ok(mehmetThursdaySlots.some(s => s.time === '12:00'), '12:00 slot must be available');
assert.ok(mehmetThursdaySlots.some(s => s.time === '16:30'), '16:30 slot for 30m haircut must be available');
console.log('✅ Scenario 3 PASS: Staff time-off and working-hour overrides honored.');

// ----------------------------------------------------------------------------
// Test 4: Preserving service-duration and staff eligibility constraints
// ----------------------------------------------------------------------------
console.log('\n[Scenario 4] Preserving service-duration and staff eligibility constraints...');
// Zeynep is a nail artist and cannot do Men Haircut
const zeynepSlotsForHaircut = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_zeynep', 'srv_m_haircut', testDateTuesday);
assert.equal(zeynepSlotsForHaircut.length, 0, 'Ineligible staff must return 0 slots for service');

let ineligibleRejected = false;
try {
  await createAppointment(TENANT_A, {
    userId: 'user_cust_4',
    user_name: 'Cem Kaya',
    user_email: 'cem@example.com',
    phone: '+90 555 404 5060',
    serviceId: 'srv_m_haircut',
    staffId: 'staff_zeynep',
    date: testDateTuesday,
    time: '11:00',
    status: 'confirmed',
    syncedToGoogle: false
  });
} catch (err) {
  ineligibleRejected = true;
  assert.ok(err.message.includes('Staff ineligible'), `Error must mention Staff ineligible, got: ${err.message}`);
}
assert.equal(ineligibleRejected, true, 'Booking ineligible staff must fail closed');

// Zeynep can do manicure (45 mins)
const zeynepSlotsForManicure = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_zeynep', 'srv_manicure', testDateTuesday);
assert.ok(zeynepSlotsForManicure.length > 0, 'Eligible staff must have slots for assigned service');
console.log('✅ Scenario 4 PASS: Staff eligibility and service duration boundaries preserved.');

// ----------------------------------------------------------------------------
// Test 5: Handling cancellation/rescheduling without ghost slots
// ----------------------------------------------------------------------------
console.log('\n[Scenario 5] Handling cancellation/rescheduling without ghost slots...');
// Book slot at 14:00 on Tuesday with Mehmet
const mehmetApt = await createAppointment(TENANT_A, {
  userId: 'user_cust_5',
  user_name: 'Boran Gök',
  user_email: 'boran@example.com',
  phone: '+90 555 505 6070',
  serviceId: 'srv_m_haircut',
  staffId: 'staff_mehmet',
  date: testDateTuesday,
  time: '14:00',
  status: 'confirmed',
  syncedToGoogle: false
});

// Verify slot is booked
const slotsWhileBooked = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_mehmet', 'srv_m_haircut', testDateTuesday);
assert.ok(!slotsWhileBooked.some(s => s.time === '14:00'), '14:00 must be unavailable while booked');

// Cancel the appointment
const cancelled = await updateAppointmentStatus(TENANT_A, mehmetApt.id, 'cancelled', 'Plan change', 'customer');
assert.ok(cancelled, 'Cancellation must succeed');

// Verify slot is immediately freed up (no ghost slots)
const slotsAfterCancel = await availabilityService.getAvailableSlotsForStaff(TENANT_A, 'staff_mehmet', 'srv_m_haircut', testDateTuesday);
assert.ok(slotsAfterCancel.some(s => s.time === '14:00'), '14:00 slot must immediately become available upon cancellation');
console.log('✅ Scenario 5 PASS: Slot freed cleanly without ghost reservation.');

// ----------------------------------------------------------------------------
// Test 6: Ensuring expired or invalid self-service tokens cannot change bookings
// ----------------------------------------------------------------------------
console.log('\n[Scenario 6] Ensuring expired or invalid self-service tokens cannot change bookings...');
// Non-existent token
const invalidResult = await appointmentSelfServiceService.validateAppointmentAccessToken('invalid-token-xyz-999');
assert.equal(invalidResult, false, 'Invalid token must validate as false');

const cancelAttemptInvalid = await appointmentSelfServiceService.requestAppointmentCancellation('invalid-token-xyz-999', 'Cancel');
assert.equal(cancelAttemptInvalid.success, false, 'Cancellation with invalid token must fail');

const manageResultInvalid = await appointmentSelfServiceService.getAppointmentByManageToken('invalid-token-xyz-999');
assert.equal(manageResultInvalid.kind, 'invalid_token', 'Lookup with invalid token must return invalid_token');

// Expired token test
const selfServiceRepo = getSelfServiceRepository();
const expiredTokenObj = await selfServiceRepo.createToken(TENANT_A, {
  appointmentId: bookedApt.id,
  tokenHash: 'expired_test_hash_123',
  mode: 'reschedule_cancel',
  expiresAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
});
assert.ok(expiredTokenObj.id, 'Created synthetic expired token');

const expiredValidation = await appointmentSelfServiceService.validateAppointmentAccessToken('expired_test_hash_123');
assert.equal(expiredValidation, false, 'Expired token must validate as false');

const cancelAttemptExpired = await appointmentSelfServiceService.requestAppointmentCancellation('expired_test_hash_123', 'Cancel');
assert.equal(cancelAttemptExpired.success, false, 'Cancellation with expired token must be rejected');
console.log('✅ Scenario 6 PASS: Expired and invalid self-service tokens strictly rejected.');

// ----------------------------------------------------------------------------
// Test 7: Keeping tenant A bookings isolated from tenant B
// ----------------------------------------------------------------------------
console.log('\n[Scenario 7] Keeping tenant A bookings isolated from tenant B...');
const tenantAAppointments = await getAppointments(TENANT_A);
const tenantBAppointments = await getAppointments(TENANT_B);

assert.ok(tenantAAppointments.length > 0, 'Tenant A must have created appointments');
assert.equal(tenantBAppointments.length, 0, 'Tenant B appointments must remain empty (zero leakage)');

// Book in Tenant B with its own eligible staff
const tenantBApt = await createAppointment(TENANT_B, {
  userId: 'user_cust_b',
  user_name: 'Berna Yıldız',
  user_email: 'berna@example.com',
  phone: '+90 555 606 7080',
  serviceId: 'srv_w_haircut',
  staffId: 'staff_b_1',
  date: testDateTuesday,
  time: '09:00',
  status: 'confirmed',
  syncedToGoogle: false
});

const tenantBAfter = await getAppointments(TENANT_B);
assert.equal(tenantBAfter.length, 1);
assert.equal(tenantBAfter[0].tenantId, TENANT_B);

const tenantAAfter = await getAppointments(TENANT_A);
assert.ok(!tenantAAfter.some(a => a.id === tenantBApt.id), 'Tenant A list must NOT contain Tenant B appointment');
console.log('✅ Scenario 7 PASS: Strict cross-tenant booking isolation preserved.');

// ----------------------------------------------------------------------------
// Test 8: Ensuring no-show protection does not incorrectly block unrelated customers
// ----------------------------------------------------------------------------
console.log('\n[Scenario 8] Ensuring no-show protection does not incorrectly block unrelated customers...');
const badPhone = '+905558881122';
const goodPhone = '+905557773344';

// Record no-show signals for badPhone in Tenant A
bookingAbuseProtectionService.recordNoShowSignal(TENANT_A, badPhone);
bookingAbuseProtectionService.recordNoShowSignal(TENANT_A, badPhone);

const badPhoneEvaluation = await bookingAbuseProtectionService.shouldBlockBooking({
  tenantId: TENANT_A,
  phone: badPhone,
  email: 'abuser@example.com'
});
assert.equal(badPhoneEvaluation.block, true, 'Repeat no-show customer must be blocked in Tenant A');
assert.ok(badPhoneEvaluation.reason.includes('no-show'), 'Reason must mention no-show');

// Unrelated customer in Tenant A must NOT be blocked
const goodPhoneEvaluation = await bookingAbuseProtectionService.shouldBlockBooking({
  tenantId: TENANT_A,
  phone: goodPhone,
  email: 'good@example.com'
});
assert.equal(goodPhoneEvaluation.block, false, 'Unrelated customer in Tenant A must NOT be blocked');

// The flagged phone in Tenant B must NOT be blocked (anti-abuse is scoped per tenant)
const tenantBEvaluation = await bookingAbuseProtectionService.shouldBlockBooking({
  tenantId: TENANT_B,
  phone: badPhone,
  email: 'abuser@example.com'
});
assert.equal(tenantBEvaluation.block, false, 'No-show flags do not leak across tenant boundaries');
console.log('✅ Scenario 8 PASS: No-show anti-abuse scoped per tenant without blocking unrelated clients.');

// ----------------------------------------------------------------------------
// Test 9: Ensuring booking success does not imply SMS, email or WhatsApp delivery
// ----------------------------------------------------------------------------
console.log('\n[Scenario 9] Ensuring booking success does not imply notification delivery...');
const events = communicationEventService.listCommunicationEventsForTenant(TENANT_A);
assert.ok(events.length > 0, 'Communication events must be queued on booking');

for (const ev of events) {
  assert.notEqual(ev.status, 'sent', 'Event status must NEVER be manufactured as sent');
  assert.notEqual(ev.status, 'delivered', 'Event status must NEVER be manufactured as delivered');
  assert.ok(['rendered', 'pending', 'skipped'].includes(ev.status), `Event status must be truthful, got: ${ev.status}`);
}

const smsResult = await sendBookingSms('demo', '+905551234567', 'Your booking is confirmed');
assert.equal(smsResult, false, 'Unconfigured SMS dispatch must return false');

const emailResult = await sendBookingEmail('demo', 'cust@example.com', 'Subject', '<p>Body</p>');
assert.equal(emailResult, false, 'Unconfigured Email dispatch must return false');
console.log('✅ Scenario 9 PASS: Booking success decoupled from delivery claims (no fake sent status).');

// ----------------------------------------------------------------------------
// Test 10: Ensuring leaving the pilot demo restores previous local tenant state
// ----------------------------------------------------------------------------
console.log('\n[Scenario 10] Ensuring leaving the pilot demo restores previous local tenant state...');
const PREV_REAL_TENANT = 'tenant_real_salon_555';
const PREV_REAL_SESSION = JSON.stringify({ userId: 'real_owner_1', email: 'owner@realsalon.com' });

storageMap.set('lari_active_tenant_id', PREV_REAL_TENANT);
storageMap.set('lari_active_owner_session', PREV_REAL_SESSION);

// Enter pilot demo
await pilotDemoService.enterDemoContext();

assert.equal(storageMap.get('lari_active_tenant_id'), DEMO_PILOT_TENANT_ID, 'Active tenant must become demo pilot tenant');
assert.equal(storageMap.get('lari_in_pilot_demo'), 'true', 'Pilot demo flag must be set');
assert.equal(storageMap.get('lari_saved_real_tenant_id'), PREV_REAL_TENANT, 'Previous real tenant must be saved');
assert.equal(storageMap.get('lari_saved_real_session'), PREV_REAL_SESSION, 'Previous real session must be saved');

// Exit pilot demo
await pilotDemoService.exitDemoContext();

assert.equal(localStorage.getItem('lari_active_tenant_id'), PREV_REAL_TENANT, 'Active tenant must be restored to previous real tenant');
assert.equal(localStorage.getItem('lari_active_owner_session'), PREV_REAL_SESSION, 'Active owner session must be restored');
assert.equal(localStorage.getItem('lari_saved_real_tenant_id'), null, 'Saved tenant must be cleaned up');
assert.equal(localStorage.getItem('lari_saved_real_session'), null, 'Saved session must be cleaned up');
assert.equal(localStorage.getItem('lari_in_pilot_demo'), null, 'Pilot demo flag must be removed');
console.log('✅ Scenario 10 PASS: Demo entry preserves and exit restores previous real tenant state.');

// ----------------------------------------------------------------------------
// Final Summary
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('ALL 10 PHASE A FUNCTIONAL ACCEPTANCE SCENARIOS PASSED (10/10)');
console.log('='.repeat(80));
