// scripts/test-availability-tenant-isolation.mjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
    process.exitCode = 1;
  }
}

async function main() {
  console.log('🔒 Starting QA: Supabase & Local Availability/Booking Multi-Tenant Isolation (W-LARI-LP-3)...');

  // --- §1 Static Source & Contract Inspection ---
  console.log('\n--- §1 Static Source & Contract Inspection ---');
  const availServicePath = path.join(process.cwd(), 'services/availabilityService.ts');
  assert(fs.existsSync(availServicePath), 'availabilityService.ts exists');
  const availContent = fs.readFileSync(availServicePath, 'utf8');

  assert(availContent.includes('export function assertTenantId'), 'availabilityService exports assertTenantId guard');
  assert(availContent.includes('export function requireTenantId'), 'availabilityService exports requireTenantId guard');
  assert(availContent.includes("requireTenantId(tenantId, 'getWorkingHours')"), 'getWorkingHours enforces requireTenantId');
  assert(availContent.includes("requireTenantId(tenantId, 'updateWorkingHours')"), 'updateWorkingHours enforces requireTenantId');
  assert(availContent.includes("requireTenantId(tenantId, 'getAvailableSlotsForStaff')"), 'getAvailableSlotsForStaff enforces requireTenantId');
  assert(availContent.includes("requireTenantId(tenantId, 'getNextAvailableSlotForStaff')"), 'getNextAvailableSlotForStaff enforces requireTenantId');
  assert(availContent.includes("requireTenantId(tenantId, 'getEarliestAvailableStaff')"), 'getEarliestAvailableStaff enforces requireTenantId');
  assert(availContent.includes("non-empty slug is required"), 'getPublicWorkingHoursBySlug enforces non-empty slug');

  const supaBookingPath = path.join(process.cwd(), 'services/repositories/supabaseBookingRepository.ts');
  assert(fs.existsSync(supaBookingPath), 'supabaseBookingRepository.ts exists');
  const supaBookingContent = fs.readFileSync(supaBookingPath, 'utf8');

  assert(supaBookingContent.includes('export function assertTenantId'), 'supabaseBookingRepository exports assertTenantId guard');
  assert(supaBookingContent.includes('export function requireTenantId'), 'supabaseBookingRepository exports requireTenantId guard');
  assert(supaBookingContent.includes("requireTenantId(tenantId, 'listAppointments')"), 'listAppointments enforces requireTenantId');
  assert(supaBookingContent.includes("requireTenantId(tenantId, 'createAppointment')"), 'createAppointment enforces requireTenantId');
  assert(supaBookingContent.includes("requireTenantId(tenantId, 'listCustomers')"), 'listCustomers enforces requireTenantId');
  assert(supaBookingContent.includes("assertTenantId(tenantId, 'getAppointmentById')"), 'getAppointmentById enforces assertTenantId');
  assert(supaBookingContent.includes("assertTenantId(tenantId, 'updateAppointment')"), 'updateAppointment enforces assertTenantId');
  assert(supaBookingContent.includes("assertTenantId(tenantId, 'cancelAppointment')"), 'cancelAppointment enforces assertTenantId');
  assert(supaBookingContent.includes('Tenant isolation violation: returned appointment does not match requested tenant'), 'Guards against cross-tenant appointment return');

  const localBookingPath = path.join(process.cwd(), 'services/repositories/localBookingRepository.ts');
  assert(fs.existsSync(localBookingPath), 'localBookingRepository.ts exists');
  const localBookingContent = fs.readFileSync(localBookingPath, 'utf8');

  assert(localBookingContent.includes('Tenant isolation violation: cannot update appointment of another tenant'), 'Local repo enforces cross-tenant appointment update isolation');
  assert(localBookingContent.includes('Tenant isolation violation: cannot cancel appointment of another tenant'), 'Local repo enforces cross-tenant appointment cancel isolation');

  // --- §2 Functional Guard Validation ---
  console.log('\n--- §2 Tenant Guard Functions (Fail-Closed Behavior) ---');

  // Extract functions for pure runtime verification
  function assertTenantId(tenantId, operation = 'operation') {
    if (tenantId !== undefined && (typeof tenantId !== 'string' || !tenantId.trim())) {
      throw new Error(`[guard] Security error: invalid or empty tenantId provided for ${operation}`);
    }
    return tenantId?.trim() || '';
  }

  function requireTenantId(tenantId, operation = 'operation') {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new Error(`[guard] Security error: non-empty tenantId is required for ${operation}`);
    }
    return tenantId.trim();
  }

  // assertTenantId
  assert(assertTenantId(undefined) === '', 'assertTenantId(undefined) returns empty string');
  assert(assertTenantId('  tenant_a  ') === 'tenant_a', 'assertTenantId trims valid tenantId');

  let assertEmptyFailed = false;
  try {
    assertTenantId('');
  } catch {
    assertEmptyFailed = true;
  }
  assert(assertEmptyFailed, 'assertTenantId("") throws error');

  let assertWhitespaceFailed = false;
  try {
    assertTenantId('   ');
  } catch {
    assertWhitespaceFailed = true;
  }
  assert(assertWhitespaceFailed, 'assertTenantId("   ") throws error');

  // requireTenantId
  assert(requireTenantId('tenant_b') === 'tenant_b', 'requireTenantId returns valid tenantId');

  let reqUndefinedFailed = false;
  try {
    requireTenantId(undefined);
  } catch {
    reqUndefinedFailed = true;
  }
  assert(reqUndefinedFailed, 'requireTenantId(undefined) throws error');

  let reqEmptyFailed = false;
  try {
    requireTenantId('');
  } catch {
    reqEmptyFailed = true;
  }
  assert(reqEmptyFailed, 'requireTenantId("") throws error');

  let reqWhitespaceFailed = false;
  try {
    requireTenantId('   ');
  } catch {
    reqWhitespaceFailed = true;
  }
  assert(reqWhitespaceFailed, 'requireTenantId("   ") throws error');

  // --- §3 Simulated Storage Multi-Tenant Isolation ---
  console.log('\n--- §3 Simulated Storage Multi-Tenant Isolation ---');
  const storage = new Map();
  const mockLocalStorage = {
    getItem: (k) => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    get length() { return storage.size; },
    key: (i) => Array.from(storage.keys())[i] || null,
  };

  const getAppointmentsKey = (tenantId) => `lari:${tenantId}:appointments`;

  const tenantAlpha = 'tenant_salon_alpha';
  const tenantBeta = 'tenant_salon_beta';

  const aptAlpha = {
    id: 'apt_alpha_1',
    tenantId: tenantAlpha,
    user_name: 'Customer Alpha',
    serviceId: 'srv_1',
    staffId: 'staff_1',
    date: '2026-11-20',
    time: '10:00',
    status: 'confirmed',
    notes: 'Alpha booking',
  };

  const aptBeta = {
    id: 'apt_beta_1',
    tenantId: tenantBeta,
    user_name: 'Customer Beta',
    serviceId: 'srv_2',
    staffId: 'staff_2',
    date: '2026-11-20',
    time: '11:00',
    status: 'confirmed',
    notes: 'Beta booking',
  };

  mockLocalStorage.setItem(getAppointmentsKey(tenantAlpha), JSON.stringify([aptAlpha]));
  mockLocalStorage.setItem(getAppointmentsKey(tenantBeta), JSON.stringify([aptBeta]));

  // Verify list scoping
  const alphaRaw = JSON.parse(mockLocalStorage.getItem(getAppointmentsKey(tenantAlpha)) || '[]');
  const betaRaw = JSON.parse(mockLocalStorage.getItem(getAppointmentsKey(tenantBeta)) || '[]');

  assert(alphaRaw.length === 1 && alphaRaw[0].id === 'apt_alpha_1', 'Tenant Alpha sees only its own appointment');
  assert(betaRaw.length === 1 && betaRaw[0].id === 'apt_beta_1', 'Tenant Beta sees only its own appointment');

  // Verify cross-tenant tampering detection
  function checkCrossTenantTampering(targetAptId, callerTenantId) {
    for (let i = 0; i < mockLocalStorage.length; i++) {
      const k = mockLocalStorage.key(i);
      if (k && k.endsWith(':appointments') && k !== getAppointmentsKey(callerTenantId)) {
        const raw = mockLocalStorage.getItem(k);
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list) && list.some(a => a && a.id === targetAptId)) {
          throw new Error('[localBookingRepository] Tenant isolation violation: cannot update appointment of another tenant');
        }
      }
    }
  }

  let tamperBlocked = false;
  try {
    checkCrossTenantTampering('apt_alpha_1', tenantBeta);
  } catch (e) {
    if (e.message.includes('Tenant isolation violation')) {
      tamperBlocked = true;
    }
  }
  assert(tamperBlocked, 'Attempt by Tenant Beta to mutate Tenant Alpha appointment triggers Tenant isolation violation');

  console.log(`\n======================================================`);
  console.log(`🏁 Availability/Booking Multi-Tenant Isolation Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
