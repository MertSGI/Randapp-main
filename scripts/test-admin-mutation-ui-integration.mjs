// scripts/test-admin-mutation-ui-integration.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Stage D2 — Admin Mutation UI Integration QA
// ═══════════════════════════════════════════════════════════════════════════
//
// Deterministic source-level assertions proving that:
//   1. AdminPage uses the RPC service — NOT direct table writes
//   2. The service calls the correct RPC
//   3. The service does NOT send forbidden fields
//   4. Error mapping covers all required reason codes
//   5. Double-click protection exists
//   6. Owner-only gating exists
//   7. Terminal status handling is correct
//   8. Idempotency key lifecycle is correct
//
// USAGE:
//   npm run qa:admin-mutation-ui
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

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

function section(title) {
  console.log(`\n── ${title} ──`);
}

console.log('🏁 Stage D2 — Admin Mutation UI Integration QA');

// ═══════════════════════════════════════════════════════════════════════════
// §1: Service File Existence & Exports
// ═══════════════════════════════════════════════════════════════════════════

section('§1 Service File Existence & Exports');

const servicePath = path.join(process.cwd(), 'services', 'adminAppointmentService.ts');
assert(fs.existsSync(servicePath), 'adminAppointmentService.ts exists');

const serviceSource = fs.readFileSync(servicePath, 'utf8');
assert(serviceSource.includes('export async function updateAdminAppointmentStatus'),
  'Exports updateAdminAppointmentStatus function');
assert(serviceSource.includes('export function getAdminStatusReasonMessage'),
  'Exports getAdminStatusReasonMessage function');
assert(serviceSource.includes('export function isTerminalStatus'),
  'Exports isTerminalStatus function');
assert(serviceSource.includes('export function getStatusLabelTr'),
  'Exports getStatusLabelTr function');

// ═══════════════════════════════════════════════════════════════════════════
// §2: RPC Argument Mapping
// ═══════════════════════════════════════════════════════════════════════════

section('§2 RPC Argument Mapping');

assert(serviceSource.includes("'/rest/v1/rpc/admin_update_appointment_status'"),
  'Service calls the correct RPC endpoint');
assert(serviceSource.includes('p_appointment_id: input.appointmentId'),
  'Maps p_appointment_id from input.appointmentId');
assert(serviceSource.includes('p_new_status: input.targetStatus'),
  'Maps p_new_status from input.targetStatus');
assert(serviceSource.includes('p_idempotency_key'),
  'Sends p_idempotency_key');

// ═══════════════════════════════════════════════════════════════════════════
// §3: Forbidden Fields NOT Sent
// ═══════════════════════════════════════════════════════════════════════════

section('§3 Forbidden Fields Not Sent');

// Check the RPC payload construction area (between the payload object and the fetch call)
assert(!serviceSource.includes('p_tenant_id'), 'Does NOT send p_tenant_id');
assert(!serviceSource.includes('p_actor_id'), 'Does NOT send p_actor_id');
assert(!serviceSource.includes('p_actor_role'), 'Does NOT send p_actor_role');
assert(!serviceSource.includes('p_user_id'), 'Does NOT send p_user_id');
assert(!serviceSource.includes('p_branch_id'), 'Does NOT send p_branch_id');
assert(!serviceSource.includes('token_hash'), 'Does NOT send token_hash');
assert(!serviceSource.includes('customer_token'), 'Does NOT send customer_token');

// ═══════════════════════════════════════════════════════════════════════════
// §4: Error Mapping Covers All Required Reason Codes
// ═══════════════════════════════════════════════════════════════════════════

section('§4 Error Mapping Coverage');

const requiredReasonCodes = [
  'unauthenticated',
  'forbidden',
  'appointment_unavailable',
  'invalid_status',
  'invalid_transition',
  'idempotency_conflict',
  'service_error',
];

for (const code of requiredReasonCodes) {
  assert(serviceSource.includes(`${code}:`),
    `Error mapping includes '${code}'`);
}

// Turkish messages present
assert(serviceSource.includes('Oturumunuz sona ermiş olabilir'),
  'Turkish: unauthenticated message');
assert(serviceSource.includes('Bu işlem için yetkiniz bulunmuyor'),
  'Turkish: forbidden message');
assert(serviceSource.includes('Randevu bulunamadı veya artık erişilemiyor'),
  'Turkish: appointment_unavailable message');
assert(serviceSource.includes('Seçilen randevu durumu geçerli değil'),
  'Turkish: invalid_status message');
assert(serviceSource.includes('mevcut durumundan seçilen duruma geçirilemez'),
  'Turkish: invalid_transition message');
assert(serviceSource.includes('başka bir değişiklikle çakıştı'),
  'Turkish: idempotency_conflict message');
assert(serviceSource.includes('tamamlanamadı. Lütfen tekrar deneyin'),
  'Turkish: service_error message');

// Default fallback
assert(serviceSource.includes('Randevu durumu güncellenemedi'),
  'Turkish: default unknown failure message');

// ═══════════════════════════════════════════════════════════════════════════
// §5: No Postgres Internals Exposed
// ═══════════════════════════════════════════════════════════════════════════

section('§5 No Postgres Internals Exposed');

assert(!serviceSource.includes('SQLERRM'), 'Service does not contain SQLERRM');
assert(!serviceSource.includes('SQLSTATE'), 'Service does not contain SQLSTATE');
assert(!serviceSource.includes('policy_name'), 'Service does not expose policy names');

// ═══════════════════════════════════════════════════════════════════════════
// §6: Terminal Status Coverage
// ═══════════════════════════════════════════════════════════════════════════

section('§6 Terminal Status Coverage');

const terminalStatuses = ['completed', 'no_show', 'cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system'];
for (const s of terminalStatuses) {
  assert(serviceSource.includes(`'${s}'`),
    `Terminal status set includes '${s}'`);
}

// ═══════════════════════════════════════════════════════════════════════════
// §7: AdminPage Integration
// ═══════════════════════════════════════════════════════════════════════════

section('§7 AdminPage Integration');

const adminPagePath = path.join(process.cwd(), 'pages', 'AdminPage.tsx');
assert(fs.existsSync(adminPagePath), 'AdminPage.tsx exists');

const adminSource = fs.readFileSync(adminPagePath, 'utf8');

// New import
assert(adminSource.includes("from '../services/adminAppointmentService'"),
  'AdminPage imports from adminAppointmentService');
assert(adminSource.includes('adminAppointmentService'),
  'AdminPage uses adminAppointmentService');

// Old import removed
assert(!adminSource.includes('updateAppointmentStatus'),
  'AdminPage does NOT import updateAppointmentStatus from appointmentService');

// No direct table update for status
assert(!adminSource.includes("supabase.from('appointments').update"),
  'AdminPage does NOT call supabase.from(appointments).update');
assert(!adminSource.includes(".from('appointments').update"),
  'AdminPage has no .from(appointments).update path');

// ═══════════════════════════════════════════════════════════════════════════
// §8: Handler Status Mapping
// ═══════════════════════════════════════════════════════════════════════════

section('§8 Handler Status Mapping');

// handleComplete maps to 'completed'
assert(adminSource.includes("executeStatusMutation(id, 'completed')"),
  'handleComplete calls executeStatusMutation with completed');

// handleNoShow maps to 'no_show'
assert(adminSource.includes("executeStatusMutation(id, 'no_show')"),
  'handleNoShow calls executeStatusMutation with no_show');

// handleCancel maps to 'cancelled'
assert(adminSource.includes("executeStatusMutation(id, 'cancelled')"),
  'handleCancel calls executeStatusMutation with cancelled');

// No cancelled_by_salon from AdminPage anymore
assert(!adminSource.includes("cancelled_by_salon"),
  'AdminPage no longer sends cancelled_by_salon');

// ═══════════════════════════════════════════════════════════════════════════
// §9: Double-Click Protection
// ═══════════════════════════════════════════════════════════════════════════

section('§9 Double-Click Protection');

assert(adminSource.includes('mutatingAppointments'),
  'AdminPage has mutatingAppointments state');
assert(adminSource.includes('mutatingAppointments.has(appointmentId)'),
  'Double-click guard checks mutatingAppointments.has(appointmentId)');
assert(adminSource.includes('mutatingAppointments.has(apt.id)'),
  'Buttons check mutatingAppointments.has(apt.id)');
assert(adminSource.includes('disabled={mutatingAppointments.has(apt.id)}'),
  'Buttons have disabled prop tied to mutatingAppointments');

// ═══════════════════════════════════════════════════════════════════════════
// §10: Owner-Only Gating
// ═══════════════════════════════════════════════════════════════════════════

section('§10 Owner-Only Gating');

assert(adminSource.includes("bootstrap.data?.user_role === 'tenant_owner'"),
  'isOwner derived from bootstrap.data.user_role');
assert(adminSource.includes('isOwner &&'),
  'Button rendering is gated by isOwner');
assert(adminSource.includes('if (!isOwner'),
  'Handlers check !isOwner guard');

// ═══════════════════════════════════════════════════════════════════════════
// §11: Idempotency Key Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

section('§11 Idempotency Key Lifecycle');

assert(adminSource.includes('crypto.randomUUID()'),
  'Idempotency key generated via crypto.randomUUID()');
assert(adminSource.includes('pendingRetryKeys'),
  'Pending retry keys map exists');
assert(adminSource.includes("pendingRetryKeys.current.get(retryMapKey)"),
  'Reuses existing key for retry');
assert(adminSource.includes("pendingRetryKeys.current.set(retryMapKey, idempotencyKey)"),
  'Stores new key for potential retry');
assert(adminSource.includes("pendingRetryKeys.current.delete(retryMapKey)"),
  'Clears key on success/conflict/abandonment');

// ═══════════════════════════════════════════════════════════════════════════
// §12: Terminal Status UI Gating
// ═══════════════════════════════════════════════════════════════════════════

section('§12 Terminal Status UI Gating');

assert(adminSource.includes('isTerminalStatus'),
  'AdminPage uses isTerminalStatus check');

// ═══════════════════════════════════════════════════════════════════════════
// §13: Success and Error Handling
// ═══════════════════════════════════════════════════════════════════════════

section('§13 Success and Error Handling');

assert(adminSource.includes('result.changed'),
  'Checks result.changed for real mutation');
assert(adminSource.includes("result.reason_code === 'no_change'"),
  'Handles no_change reason code');
assert(adminSource.includes("result.reason_code === 'idempotency_conflict'"),
  'Handles idempotency_conflict reason code');
assert(adminSource.includes("result.reason_code === 'invalid_transition'"),
  'Handles invalid_transition reason code (stale state refetch)');
assert(adminSource.includes("result.reason_code === 'service_error'"),
  'Handles service_error reason code (retains key)');

// Success triggers refresh
assert(adminSource.includes("bootstrap.invalidateAfterMutation()"),
  'Success triggers bootstrap dashboard invalidation');

// ═══════════════════════════════════════════════════════════════════════════
// §14: Loading Indicator
// ═══════════════════════════════════════════════════════════════════════════

section('§14 Loading Indicator');

assert(adminSource.includes("'İşleniyor...'"),
  'Turkish processing indicator present');

// ═══════════════════════════════════════════════════════════════════════════
// §15: Cancellation Confirmation
// ═══════════════════════════════════════════════════════════════════════════

section('§15 Cancellation Confirmation');

assert(adminSource.includes('showConfirm') && adminSource.includes('handleCancel'),
  'handleCancel uses showConfirm for cancellation confirmation');

// ═══════════════════════════════════════════════════════════════════════════
// §16: No Direct Status Update Paths Remain
// ═══════════════════════════════════════════════════════════════════════════

section('§16 No Direct Status Update Path Remaining');

// The appointmentService.ts still has updateAppointmentStatus for non-admin paths,
// but AdminPage must NOT import or call it.
assert(!adminSource.includes("from '../services/appointmentService'") || 
  (adminSource.includes("from '../services/appointmentService'") && !adminSource.includes('updateAppointmentStatus')),
  'AdminPage does not import updateAppointmentStatus');

// No direct PATCH to appointments table for status changes
const directPatchPattern = /\.from\s*\(\s*['"]appointments['"]\s*\)\s*\.update/;
assert(!directPatchPattern.test(adminSource),
  'AdminPage has no .from(appointments).update');

// ═══════════════════════════════════════════════════════════════════════════
// §17: Service Security — No Credentials Leaked
// ═══════════════════════════════════════════════════════════════════════════

section('§17 Service Security');

assert(!serviceSource.includes('service_role'), 'Service does not contain service_role key reference');
assert(!serviceSource.includes('SERVICE_ROLE'), 'Service does not contain SERVICE_ROLE reference');
assert(!serviceSource.includes('SUPABASE_SERVICE'), 'Service does not contain SUPABASE_SERVICE reference');

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Total:   ${passed + failed}`);
console.log('══════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error(`\n❌ ${failed} assertion(s) FAILED. Stage D2 UI integration is NOT accepted.\n`);
  process.exit(1);
}

console.log(`\n✅ All ${passed} assertions passed. Stage D2 UI integration is accepted.\n`);
process.exit(0);
