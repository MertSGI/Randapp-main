/**
 * test-reschedule-approval-workflow.mjs
 * ADIM-013 / V1A-FUNC-01: Randevu Saat Değişikliği (Reschedule) İnceleme ve Takvim Yansıtma Paritesi
 *
 * Scope:
 * 1. Static Anti-Pattern & Cryptographic Randomness Audit (zero Math.random)
 * 2. Local Mode End-to-End Reschedule Lifecycle:
 *    - 2.1 List Pending Requests with joined appointment metadata
 *    - 2.2 Rejection flow with resolution reason preservation
 *    - 2.3 Same-staff slot collision prevention (slot_unavailable)
 *    - 2.4 Atomic rollback guarantee (appointment untouched on collision)
 *    - 2.5 Successful approval, atomic appointment date/time update & status transition
 *    - 2.6 Freed slot verification (previous slot becomes available)
 *    - 2.7 Idempotency handling & conflicting decision rejection
 *    - 2.8 Already resolved request protection (request_already_resolved)
 *    - 2.9 Past date protection (slot_unavailable for past dates)
 *    - 2.10 Invalid status transition protection (invalid_transition on non-confirmed)
 *    - 2.11 Tenant boundary isolation (request_unavailable on cross-tenant)
 *    - 2.12 Audit trail & communication outbox event parity
 * 3. Migration 33 & 34 Contract Parity Verification
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VITE_DATA_MODE = 'local';

// Setup standard mock localStorage harness for headless Node environment
const storageMap = new Map();
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) || null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};
globalThis.localStorage = mockLocalStorage;
globalThis.window = { localStorage: mockLocalStorage };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('🧪 ADIM-013 / V1A-FUNC-01: Reschedule Approval & Calendar Parity');
console.log('================================================================\n');

// ============================================================================
// PART 1: Static Anti-Pattern & Cryptographic Randomness Audit
// ============================================================================
console.log('--- Part 1: Static Anti-Pattern & Cryptographic Randomness Audit ---');

const focusFiles = [
  path.join(rootDir, 'services', 'adminRescheduleService.ts'),
  path.join(rootDir, 'services', 'appointmentSelfServiceService.ts'),
  path.join(rootDir, 'services', 'repositories', 'localSelfServiceRepository.ts'),
  path.join(rootDir, 'services', 'repositories', 'supabaseSelfServiceRepository.ts'),
  path.join(rootDir, 'components', 'RescheduleRequestsTab.tsx')
];

runTest('1.1 Zero Math.random() in all focus files', () => {
  for (const file of focusFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Focus file missing: ${file}`);
    }
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/Math\.random/g);
    assert.strictEqual(
      matches,
      null,
      `Found insecure Math.random() in ${path.basename(file)}: ${matches ? matches.length : 0} occurrences`
    );
  }
});

runTest('1.2 Required repository methods exist in types.ts', () => {
  const typesPath = path.join(rootDir, 'services', 'repositories', 'types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  assert.ok(typesContent.includes('listPendingRescheduleRequests?'), 'types.ts must declare listPendingRescheduleRequests');
  assert.ok(typesContent.includes('decideRescheduleRequest?'), 'types.ts must declare decideRescheduleRequest');
});

runTest('1.3 adminRescheduleService routes to local parity repository when in local data mode', () => {
  const servicePath = path.join(rootDir, 'services', 'adminRescheduleService.ts');
  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  assert.ok(serviceContent.includes('appointmentSelfServiceService.adminListPendingRescheduleRequests'), 'Must delegate list in local mode');
  assert.ok(serviceContent.includes('appointmentSelfServiceService.adminDecideRescheduleRequest'), 'Must delegate decide in local mode');
});

// ============================================================================
// PART 2: Local Mode End-to-End Reschedule Workflow
// ============================================================================
console.log('\n--- Part 2: Local Mode End-to-End Reschedule Workflow ---');

// Dynamically import application services
const { LocalSelfServiceRepository, resetLocalSelfServiceState } = await import('../services/repositories/localSelfServiceRepository');
const { getBookingRepository, getAuditEventRepository, getCommunicationOutboxRepository } = await import('../services/repositories/index');
const { adminRescheduleService } = await import('../services/adminRescheduleService');
const { appointmentSelfServiceService } = await import('../services/appointmentSelfServiceService');

const selfServiceRepo = new LocalSelfServiceRepository();
const bookingRepo = getBookingRepository();
const auditRepo = getAuditEventRepository();
const outboxRepo = getCommunicationOutboxRepository();

const TEST_TENANT_ID = 'tenant_reschedule_test_001';
const OTHER_TENANT_ID = 'tenant_other_999';
const STAFF_AHMET = 'staff_ahmet_01';
const STAFF_MEHMET = 'staff_mehmet_02';

// Helper to seed appointment directly into local repo
async function seedAppointment(apt) {
  const tenantId = apt.tenantId || TEST_TENANT_ID;
  const input = {
    branch_id: 'branch_central',
    service_id: 'service_haircut',
    service: { name: 'Saç Kesimi', name_tr: 'Saç Kesimi' },
    staff: { name: apt.staffId === STAFF_MEHMET ? 'Mehmet Usta' : 'Ahmet Usta' },
    branch: { name: 'Merkez Şube' },
    user_name: 'Müşteri Test',
    phone: '+905551234567',
    status: 'confirmed',
    ...apt
  };
  delete input.tenantId;

  // If specific ID requested, ensure it is set or preserved
  const key = `lari:${tenantId}:appointments`;
  const existing = await bookingRepo.listAppointments(tenantId);
  const newApt = {
    ...input,
    id: apt.id || `apt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    tenantId,
    createdAt: new Date().toISOString()
  };
  const updatedList = [...existing.filter(a => a.id !== newApt.id), newApt];
  mockLocalStorage.setItem(key, JSON.stringify(updatedList));

  return newApt;
}

await runAsyncTest('2.1 Initial State & Pending Reschedule Request Listing', async () => {
  mockLocalStorage.clear();
  resetLocalSelfServiceState();

  const apt = await seedAppointment({
    id: 'apt_test_001',
    staffId: STAFF_AHMET,
    date: '2026-12-10',
    time: '10:00',
    user_name: 'Ayşe Yılmaz',
    phone: '+905551112233'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_resched_001',
    appointmentId: apt.id,
    requestType: 'reschedule',
    requestedBy: 'customer',
    proposedDate: '2026-12-10',
    proposedTime: '15:00',
    reason: 'İşim uzadı, öğleden sonra gelebilirim.',
    status: 'pending'
  });

  const listRes = await adminRescheduleService.listPendingRescheduleRequests({
    limit: 10
  });

  assert.strictEqual(listRes.success, true, 'Listing must succeed');
  assert.strictEqual(listRes.reasonCode, 'ok', 'Reason code must be ok');
  assert.ok(listRes.requests.length >= 1, 'Should find at least 1 pending request');

  const found = listRes.requests.find(r => r.change_request_id === 'req_resched_001');
  assert.ok(found, 'Pending request req_resched_001 must be in list');
  assert.strictEqual(found.appointment_id, 'apt_test_001');
  assert.strictEqual(found.proposed_date, '2026-12-10');
  assert.strictEqual(found.proposed_time, '15:00');
  assert.strictEqual(found.customer_reason, 'İşim uzadı, öğleden sonra gelebilirim.');
  assert.strictEqual(found.current_appointment_date, '2026-12-10');
  assert.strictEqual(found.current_appointment_time, '10:00');
  assert.strictEqual(found.customer_name, 'Ayşe Yılmaz');
  assert.strictEqual(found.customer_phone, '+905551112233');
});

await runAsyncTest('2.2 Rejection with Reason Preservation & Outbox Notification', async () => {
  const apt = await seedAppointment({
    id: 'apt_test_reject',
    staffId: STAFF_AHMET,
    date: '2026-12-11',
    time: '11:00',
    phone: '+905553334455'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_resched_reject',
    appointmentId: apt.id,
    requestType: 'reschedule',
    requestedBy: 'customer',
    proposedDate: '2026-12-11',
    proposedTime: '17:00',
    reason: 'Müsaitlik değişti',
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_resched_reject',
    decision: 'rejected',
    reason: 'O gün dükkan erken kapanacaktır.'
  });

  assert.strictEqual(decRes.success, true, 'Rejection must succeed');
  assert.strictEqual(decRes.reasonCode, 'ok', 'Reason code must be ok');
  assert.strictEqual(decRes.decision, 'rejected', 'Decision must be rejected');
  assert.strictEqual(decRes.requestStatus, 'rejected', 'Request status must be rejected');

  // Verify original appointment was NOT modified
  const currentApt = await bookingRepo.getAppointmentById('apt_test_reject');
  assert.strictEqual(currentApt.date, '2026-12-11');
  assert.strictEqual(currentApt.time, '11:00');
  assert.strictEqual(currentApt.status, 'confirmed');

  // Verify request preserved both customer reason and resolution reason
  const allReqs = await selfServiceRepo.listChangeRequests(TEST_TENANT_ID);
  const updatedReq = allReqs.find(r => r.id === 'req_resched_reject');
  assert.strictEqual(updatedReq.status, 'rejected');
  assert.strictEqual(updatedReq.reason, 'Müsaitlik değişti', 'Original customer reason preserved');
  assert.strictEqual(updatedReq.resolutionReason, 'O gün dükkan erken kapanacaktır.', 'Resolution reason recorded');

  // Verify outbox notification enqueued
  const outboxEvents = await outboxRepo.listEvents(TEST_TENANT_ID);
  const rejectOutbox = outboxEvents.find(e => e.metadata?.event_type === 'reschedule_request_rejected' && e.metadata?.change_request_id === 'req_resched_reject');
  assert.ok(rejectOutbox, 'Outbox must record reschedule_request_rejected notification');
  assert.strictEqual(rejectOutbox.recipient, '+905553334455');
});

await runAsyncTest('2.3 Same-Staff Slot Collision Prevention (slot_unavailable)', async () => {
  // Appointment A for Ahmet at 10:00 wanting to move to 14:00
  const aptA = await seedAppointment({
    id: 'apt_collision_a',
    staffId: STAFF_AHMET,
    date: '2026-12-12',
    time: '10:00'
  });

  // Appointment B already booked for Ahmet at 14:00 (Collision target)
  const aptB = await seedAppointment({
    id: 'apt_collision_b',
    staffId: STAFF_AHMET,
    date: '2026-12-12',
    time: '14:00',
    status: 'confirmed'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_collision_test',
    appointmentId: aptA.id,
    requestType: 'reschedule',
    requestedBy: 'customer',
    proposedDate: '2026-12-12',
    proposedTime: '14:00',
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_collision_test',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, false, 'Decision must fail due to collision');
  assert.strictEqual(decRes.reasonCode, 'slot_unavailable', 'Reason code must be slot_unavailable');
});

await runAsyncTest('2.4 Atomic Rollback Verification on Collision', async () => {
  // Check that aptA date/time was not modified
  const currentAptA = await bookingRepo.getAppointmentById('apt_collision_a');
  assert.strictEqual(currentAptA.date, '2026-12-12', 'Date must be untouched');
  assert.strictEqual(currentAptA.time, '10:00', 'Time must be untouched');
  assert.strictEqual(currentAptA.status, 'confirmed', 'Status must stay confirmed');

  // Check that request remains pending
  const allReqs = await selfServiceRepo.listChangeRequests(TEST_TENANT_ID);
  const req = allReqs.find(r => r.id === 'req_collision_test');
  assert.strictEqual(req.status, 'pending', 'Change request must stay pending so salon owner can try alternative or reject');
});

await runAsyncTest('2.5 Successful Approval & Atomic Schedule Update (Staff Conflict Free)', async () => {
  // Target slot 16:00 is occupied by Mehmet (different staff), Ahmet is free!
  const aptMehmet = await seedAppointment({
    id: 'apt_mehmet_16',
    staffId: STAFF_MEHMET,
    date: '2026-12-12',
    time: '16:00',
    status: 'confirmed'
  });

  const aptAhmet = await seedAppointment({
    id: 'apt_ahmet_free',
    staffId: STAFF_AHMET,
    date: '2026-12-12',
    time: '11:00',
    status: 'confirmed',
    phone: '+905559998877'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_ahmet_approve',
    appointmentId: aptAhmet.id,
    requestType: 'reschedule',
    requestedBy: 'customer',
    proposedDate: '2026-12-12',
    proposedTime: '16:00',
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_ahmet_approve',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, true, 'Approval must succeed because target slot is free for Ahmet');
  assert.strictEqual(decRes.reasonCode, 'ok', 'Reason code must be ok');
  assert.strictEqual(decRes.changed, true, 'Changed must be true');
  assert.strictEqual(decRes.decision, 'approved');
  assert.strictEqual(decRes.previousDate, '2026-12-12');
  assert.strictEqual(decRes.previousTime, '11:00');
  assert.strictEqual(decRes.appointmentDate, '2026-12-12');
  assert.strictEqual(decRes.appointmentTime, '16:00');
  assert.strictEqual(decRes.requestStatus, 'approved');
  assert.strictEqual(decRes.appointmentStatus, 'confirmed');

  // Verify DB reflects updated appointment date and time
  const updatedApt = await bookingRepo.getAppointmentById('apt_ahmet_free');
  assert.strictEqual(updatedApt.date, '2026-12-12');
  assert.strictEqual(updatedApt.time, '16:00', 'Appointment time must be updated to 16:00');
  assert.strictEqual(updatedApt.status, 'confirmed');

  // Verify change request marked approved
  const allReqs = await selfServiceRepo.listChangeRequests(TEST_TENANT_ID);
  const updatedReq = allReqs.find(r => r.id === 'req_ahmet_approve');
  assert.strictEqual(updatedReq.status, 'approved');

  // Verify outbox approval event
  const outboxEvents = await outboxRepo.listEvents(TEST_TENANT_ID);
  const approveOutbox = outboxEvents.find(e => e.metadata?.event_type === 'reschedule_request_approved' && e.metadata?.change_request_id === 'req_ahmet_approve');
  assert.ok(approveOutbox, 'Outbox must record reschedule_request_approved notification');
  assert.strictEqual(approveOutbox.recipient, '+905559998877');
});

await runAsyncTest('2.6 Freed Slot Verification (Old Slot 11:00 Is Now Available)', async () => {
  // Ahmet was previously at 11:00, now moved to 16:00.
  // Now another customer can reschedule to Ahmet's old 11:00 slot without collision!
  const aptAnother = await seedAppointment({
    id: 'apt_another_customer',
    staffId: STAFF_AHMET,
    date: '2026-12-12',
    time: '09:00',
    status: 'confirmed'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_use_freed_slot',
    appointmentId: aptAnother.id,
    requestType: 'reschedule',
    requestedBy: 'customer',
    proposedDate: '2026-12-12',
    proposedTime: '11:00', // Ahmet's old slot!
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_use_freed_slot',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, true, 'Approval into freed slot must succeed without collision');
  assert.strictEqual(decRes.reasonCode, 'ok');
  assert.strictEqual(decRes.appointmentTime, '11:00');
});

await runAsyncTest('2.7 Idempotency Handling & Conflicting Decision Replay Safety', async () => {
  const apt = await seedAppointment({
    id: 'apt_idem_test',
    staffId: STAFF_AHMET,
    date: '2026-12-15',
    time: '10:00'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_idem_test',
    appointmentId: apt.id,
    requestType: 'reschedule',
    proposedDate: '2026-12-15',
    proposedTime: '12:00',
    status: 'pending'
  });

  const idemKey = 'idem_key_unique_test_123';

  // First decision: approved with idemKey
  const firstRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_idem_test',
    decision: 'approved',
    idempotencyKey: idemKey
  });

  assert.strictEqual(firstRes.success, true);
  assert.strictEqual(firstRes.decision, 'approved');

  // Replay exactly same request with same key
  const replayRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_idem_test',
    decision: 'approved',
    idempotencyKey: idemKey
  });

  assert.strictEqual(replayRes.success, true, 'Idempotent replay must return success');
  assert.strictEqual(replayRes.decision, 'approved');
  assert.strictEqual(replayRes.changeRequestId, 'req_idem_test');

  // Conflicting replay with same key but different decision
  const conflictRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_idem_test',
    decision: 'rejected',
    idempotencyKey: idemKey
  });

  assert.strictEqual(conflictRes.success, false, 'Conflicting decision with same idempotency key must fail');
  assert.strictEqual(conflictRes.reasonCode, 'idempotency_conflict', 'Reason must be idempotency_conflict');
});

await runAsyncTest('2.8 Double Decision Protection (request_already_resolved)', async () => {
  // Calling decide on already resolved request with a NEW key
  const newKeyRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_idem_test',
    decision: 'approved',
    idempotencyKey: 'completely_different_key_999'
  });

  assert.strictEqual(newKeyRes.success, false, 'Should fail because request was already resolved');
  assert.strictEqual(newKeyRes.reasonCode, 'request_already_resolved');
  assert.strictEqual(newKeyRes.changed, false);
});

await runAsyncTest('2.9 Past Date Protection (slot_unavailable for Past Dates)', async () => {
  const apt = await seedAppointment({
    id: 'apt_past_test',
    staffId: STAFF_AHMET,
    date: '2026-12-20',
    time: '10:00'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_past_date',
    appointmentId: apt.id,
    requestType: 'reschedule',
    proposedDate: '2020-01-01', // Past date
    proposedTime: '10:00',
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_past_date',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, false, 'Must reject past date');
  assert.strictEqual(decRes.reasonCode, 'slot_unavailable');
});

await runAsyncTest('2.10 Invalid Appointment Transition Protection (Non-Confirmed Appointment)', async () => {
  const apt = await seedAppointment({
    id: 'apt_cancelled_test',
    staffId: STAFF_AHMET,
    date: '2026-12-21',
    time: '10:00',
    status: 'cancelled_by_customer'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_cancelled_apt',
    appointmentId: apt.id,
    requestType: 'reschedule',
    proposedDate: '2026-12-21',
    proposedTime: '14:00',
    status: 'pending'
  });

  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: TEST_TENANT_ID,
    changeRequestId: 'req_cancelled_apt',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, false, 'Cannot approve reschedule on cancelled appointment');
  assert.strictEqual(decRes.reasonCode, 'invalid_transition');
  assert.strictEqual(decRes.appointmentStatus, 'cancelled_by_customer');
});

await runAsyncTest('2.11 Multi-Tenant Boundary Isolation (Cross-Tenant Access Denial)', async () => {
  const apt = await seedAppointment({
    id: 'apt_tenant_iso',
    tenantId: TEST_TENANT_ID,
    staffId: STAFF_AHMET,
    date: '2026-12-22',
    time: '10:00'
  });

  const req = await selfServiceRepo.createChangeRequest(TEST_TENANT_ID, {
    id: 'req_tenant_iso',
    tenantId: TEST_TENANT_ID,
    appointmentId: apt.id,
    requestType: 'reschedule',
    proposedDate: '2026-12-22',
    proposedTime: '14:00',
    status: 'pending'
  });

  // Attempt decision using a different tenant ID
  const decRes = await adminRescheduleService.decideRescheduleRequest({
    tenantId: OTHER_TENANT_ID,
    changeRequestId: 'req_tenant_iso',
    decision: 'approved'
  });

  assert.strictEqual(decRes.success, false, 'Cross-tenant decision must fail');
  assert.strictEqual(decRes.reasonCode, 'request_unavailable');
});

await runAsyncTest('2.12 Audit Trail Parity Verification', async () => {
  const auditEvents = await auditRepo.listEvents(TEST_TENANT_ID);
  const approvedAudit = auditEvents.find(e => e.action === 'appointment_reschedule_approved');
  const rejectedAudit = auditEvents.find(e => e.action === 'appointment_reschedule_rejected');

  assert.ok(approvedAudit, 'Must record appointment_reschedule_approved in audit log');
  assert.ok(approvedAudit.payload?.approved_date, 'Approved audit must record approved_date');
  assert.ok(approvedAudit.payload?.previous_date, 'Approved audit must record previous_date');

  assert.ok(rejectedAudit, 'Must record appointment_reschedule_rejected in audit log');
  assert.ok(rejectedAudit.payload?.rejection_reason, 'Rejected audit must record rejection_reason');
});

// ============================================================================
// PART 3: Migration 33 & 34 Contract Parity Verification
// ============================================================================
console.log('\n--- Part 3: Migration 33 & 34 Contract Parity Verification ---');

runTest('3.1 Migration 33 and 34 define exact parity SQL schemas and RPCs', () => {
  const mig33Path = path.join(rootDir, 'supabase', 'migrations', '20260808_admin_reschedule_request_decision_rpc.sql');
  const mig34Path = path.join(rootDir, 'supabase', 'migrations', '20260809_admin_reschedule_decision_lock_and_reason_fix.sql');

  assert.ok(fs.existsSync(mig33Path), 'Migration 33 exists');
  assert.ok(fs.existsSync(mig34Path), 'Migration 34 exists');

  const mig33 = fs.readFileSync(mig33Path, 'utf8');
  const mig34 = fs.readFileSync(mig34Path, 'utf8');

  // Verify RPC names and security attributes
  assert.ok(mig33.includes('admin_list_pending_reschedule_requests'), 'Defines admin_list_pending_reschedule_requests');
  assert.ok(mig33.includes('admin_decide_reschedule_request'), 'Defines admin_decide_reschedule_request');
  assert.ok(mig33.includes('SECURITY DEFINER'), 'Enforces SECURITY DEFINER');
  assert.ok(mig33.includes('SET search_path = pg_catalog, public'), 'Enforces explicit search_path');

  // Verify concurrency locking
  assert.ok(mig34.includes('pg_advisory_xact_lock'), 'Migration 34 enforces advisory lock');
  assert.ok(mig34.includes('resolution_reason'), 'Migration 34 adds resolution_reason column');
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log('================================================================');
