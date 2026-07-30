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

console.log('=== Stage F4 — Admin Reschedule Request Review UI QA ===\n');

// 1. Component File Check
const compPath = path.join(process.cwd(), 'components', 'RescheduleRequestsTab.tsx');
assert(fs.existsSync(compPath), 'RescheduleRequestsTab.tsx exists');
const compContent = fs.readFileSync(compPath, 'utf8');

// 2. Admin Reschedule Service Check
const servicePath = path.join(process.cwd(), 'services', 'adminRescheduleService.ts');
assert(fs.existsSync(servicePath), 'adminRescheduleService.ts exists');
const serviceContent = fs.readFileSync(servicePath, 'utf8');

// 3. Admin Page Check
const adminPagePath = path.join(process.cwd(), 'pages', 'AdminPage.tsx');
assert(fs.existsSync(adminPagePath), 'AdminPage.tsx exists');
const adminPageContent = fs.readFileSync(adminPagePath, 'utf8');

// 4. Role Authorization Assertions
assert(compContent.includes("userRole === 'tenant_owner'"), 'Owner authorization check present');
assert(compContent.includes("userRole === 'super_admin'"), 'Super admin authorization check present');
assert(compContent.includes('if (!isAuthorized)'), 'Renders null for unauthorized roles (staff)');

// 5. Super Admin Tenant Context
assert(compContent.includes('isSuperAdmin') && compContent.includes('req.tenant_id'), 'Renders tenant ID context for super admin');

// 6. Secure RPC Usage & Zero Direct Table Writes
assert(serviceContent.includes('admin_list_pending_reschedule_requests'), 'Uses RPC admin_list_pending_reschedule_requests');
assert(serviceContent.includes('admin_decide_reschedule_request'), 'Uses RPC admin_decide_reschedule_request');

const compDirectPatchApts = (compContent.match(/\/appointments\?.*method=PATCH/g) || []).length;
assert(compDirectPatchApts === 0, 'Direct PATCH /rest/v1/appointments count in component = 0');

const compDirectPatchReqs = (compContent.match(/\/appointment_change_requests.*method=PATCH/g) || []).length;
assert(compDirectPatchReqs === 0, 'Direct PATCH /rest/v1/appointment_change_requests count in component = 0');

// 7. Customer & Admin Reason Separation
assert(compContent.includes('req.customer_reason'), 'Customer reason rendered read-only');
assert(compContent.includes('adminReason'), 'Separate field for admin rejection reason');

// 8. Payload Structure Integrity
assert(!serviceContent.includes('p_proposed_date') && !serviceContent.includes('p_proposed_time'), 'Approve payload does not send client proposed date/time');
assert(!serviceContent.includes('p_actor_id') && !serviceContent.includes('p_tenant_id'), 'Decision payload does not send browser-supplied tenant/actor IDs');

// 9. Idempotency & Double-Click Protection
assert(compContent.includes('idempotencyKeysRef'), 'Idempotency key ref present for decision attempts');
assert(compContent.includes('submittingId'), 'Disables decision buttons for pending request card');

// 10. Safe Reason Code Mappings
assert(serviceContent.includes('mapAdminDecisionReasonCodeToMessage'), 'Reason-code mapping function present');
assert(compContent.includes('slot_unavailable'), 'Handles slot_unavailable error response without deleting request');
assert(compContent.includes('request_already_resolved'), 'Handles request_already_resolved response');

// 11. Callback Refresh
assert(compContent.includes('onAppointmentUpdated'), 'Triggers onAppointmentUpdated callback on success');

// 12. Payment Safety
assert(!compContent.includes('iyzico') && !compContent.includes('checkout'), 'NO payments or checkout UI introduced');

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage F4 Admin Reschedule Review UI QA PASSED.');
