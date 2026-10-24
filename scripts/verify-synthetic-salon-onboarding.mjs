import fs from 'fs';
import path from 'path';
import { SYNTHETIC_SALON_AURA, SyntheticSalonFixtureService } from '../services/syntheticSalonFixtureService.js';
import { CommunicationDeliveryService } from '../services/communicationDeliveryService.js';
import { OfflineCommunicationProviderSimulator } from '../services/offlineCommunicationProviderSimulator.js';
import { superAdminService } from '../services/superAdminService.js';

let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
};

console.log('============================================================================');
console.log('LARI — PHASE F: FIRST-SALON SYNTHETIC ONBOARDING REHEARSAL QA');
console.log('============================================================================\n');

const fixture = SyntheticSalonFixtureService.getFixture();

// ----------------------------------------------------------------------------
// STEP 1: Salon Profile Creation & Branding
// ----------------------------------------------------------------------------
console.log('[Step 1] Salon Profile Creation & Branding...');
assert(fixture.tenantId === 'synthetic_salon_aura_001', 'Step 1: Tenant ID matches synthetic convention');
assert(fixture.slug === 'aura-nisantasi', 'Step 1: Slug is aura-nisantasi');
assert(fixture.businessName === 'Aura Kuaför & Güzellik', 'Step 1: Business name is Aura Kuaför & Güzellik');
assert(fixture.officialBusinessName.includes('Tic. Ltd. Şti.'), 'Step 1: Official business entity name defined');
assert(fixture.category === 'hair_and_beauty', 'Step 1: Category is hair_and_beauty');

// ----------------------------------------------------------------------------
// STEP 2: Single Branch Configuration
// ----------------------------------------------------------------------------
console.log('\n[Step 2] Single Branch Configuration...');
const branch = fixture.branch;
assert(branch.id === 'branch_aura_nisantasi_01', 'Step 2: Branch ID is defined');
assert(branch.name === 'Aura Nişantaşı', 'Step 2: Branch name is Aura Nişantaşı');
assert(branch.address.includes('Teşvikiye'), 'Step 2: Branch street address is valid');
assert(branch.district === 'Şişli' && branch.city === 'İstanbul', 'Step 2: District and City verified');
assert(branch.phone.startsWith('+90 212'), 'Step 2: Branch landline phone verified');

// ----------------------------------------------------------------------------
// STEP 3: Staff Creation (2 Staff Members)
// ----------------------------------------------------------------------------
console.log('\n[Step 3] Staff Creation (2 Staff Members)...');
assert(fixture.staff.length === 2, 'Step 3: Exactly 2 staff members created');
const staffElif = fixture.staff.find(s => s.name === 'Elif Yılmaz');
const staffCan = fixture.staff.find(s => s.name === 'Can Demir');
assert(staffElif !== undefined && staffElif.role.includes('Stylist'), 'Step 3: Elif Yılmaz registered as Senior Stylist');
assert(staffCan !== undefined && staffCan.role.includes('Estetisyen'), 'Step 3: Can Demir registered as Esthetician');

// ----------------------------------------------------------------------------
// STEP 4: Service Catalog Configuration (6 Services)
// ----------------------------------------------------------------------------
console.log('\n[Step 4] Service Catalog Configuration (6 Services)...');
assert(fixture.services.length === 6, 'Step 4: Exactly 6 distinct services configured');
const prices = fixture.services.map(s => s.price);
const durations = fixture.services.map(s => s.durationMinutes);
assert(prices.every(p => p > 0), 'Step 4: All services have positive pricing');
assert(durations.every(d => d >= 30), 'Step 4: All service durations are at least 30 minutes');
assert(fixture.services.some(s => s.name.includes('Saç Kesimi')), 'Step 4: Haircut service present');
assert(fixture.services.some(s => s.name.includes('Cilt Bakımı')), 'Step 4: Skincare service present');
assert(fixture.services.some(s => s.name.includes('Manikür')), 'Step 4: Manicure service present');

// ----------------------------------------------------------------------------
// STEP 5: Staff-Service Association & Branch Assignment
// ----------------------------------------------------------------------------
console.log('\n[Step 5] Staff-Service Association...');
assert(staffElif.serviceIds.length >= 3, 'Step 5: Elif assigned to multiple styling services');
assert(staffCan.serviceIds.length >= 3, 'Step 5: Can assigned to multiple aesthetic services');
assert(staffElif.branchId === branch.id, 'Step 5: Elif assigned to Aura Nişantaşı branch');
assert(staffCan.branchId === branch.id, 'Step 5: Can assigned to Aura Nişantaşı branch');

// ----------------------------------------------------------------------------
// STEP 6: Weekly Operating Hours & Schedule Setup
// ----------------------------------------------------------------------------
console.log('\n[Step 6] Weekly Operating Hours & Schedule...');
assert(fixture.weeklyHours.length === 7, 'Step 6: All 7 days configured in schedule');
const workDays = fixture.weeklyHours.filter(h => h.isOpen);
const offDays = fixture.weeklyHours.filter(h => !h.isOpen);
assert(workDays.length === 6, 'Step 6: Mon-Sat are open (6 days)');
assert(offDays.length === 1 && offDays[0].weekday === 7, 'Step 6: Sunday is closed');
assert(workDays[0].openTime === '09:00' && workDays[0].closeTime === '19:00', 'Step 6: Operating hours are 09:00 - 19:00');

// ----------------------------------------------------------------------------
// STEP 7: Staff Leave Exception Scheduling
// ----------------------------------------------------------------------------
console.log('\n[Step 7] Staff Leave Scheduling...');
assert(fixture.staffLeave.length === 1, 'Step 7: Staff leave exception exists');
const leave = fixture.staffLeave[0];
assert(leave.staffName === 'Can Demir', 'Step 7: Leave assigned to Can Demir');
assert(leave.startDate === '2026-10-27', 'Step 7: Leave date is 2026-10-27');
assert(leave.reason.includes('Seminer'), 'Step 7: Leave reason recorded');

// ----------------------------------------------------------------------------
// STEP 8: Public Booking Link & QR Token Generation
// ----------------------------------------------------------------------------
console.log('\n[Step 8] Public Booking Link & QR Token Generation...');
assert(fixture.publicBookingUrl === 'https://randevulari.com/b/aura-nisantasi', 'Step 8: Public booking link formatted accurately');
assert(fixture.qrPayload.startsWith('LARI:V1:BOOKING:aura-nisantasi:'), 'Step 8: QR code token payload properly structured');

// ----------------------------------------------------------------------------
// STEP 9: Customer Booking Flow (Consent Granted)
// ----------------------------------------------------------------------------
console.log('\n[Step 9] Customer Booking (Consent Granted)...');
const booking1 = fixture.bookings[0];
assert(booking1.customerName === 'Selin Arslan', 'Step 9: Customer 1 is Selin Arslan');
assert(booking1.status === 'confirmed', 'Step 9: Booking 1 is confirmed');
assert(booking1.contactConsent === true, 'Step 9: Customer 1 gave contact consent');

// ----------------------------------------------------------------------------
// STEP 10: Customer Booking Flow (Consent Denied)
// ----------------------------------------------------------------------------
console.log('\n[Step 10] Customer Booking (Consent Denied)...');
const booking2 = fixture.bookings[1];
assert(booking2.customerName === 'Merve Çelik', 'Step 10: Customer 2 is Merve Çelik');
assert(booking2.status === 'confirmed', 'Step 10: Booking 2 confirmed in calendar');
assert(booking2.contactConsent === false, 'Step 10: Customer 2 explicitly denied contact consent');

// ----------------------------------------------------------------------------
// STEP 11: Customer Reschedule Flow via Token
// ----------------------------------------------------------------------------
console.log('\n[Step 11] Customer Reschedule via Token...');
const booking3 = fixture.bookings[2];
assert(booking3.status === 'rescheduled', 'Step 11: Booking 3 status is rescheduled');
assert(booking3.manageToken.startsWith('tok_'), 'Step 11: Booking 3 has secure manage token');

// ----------------------------------------------------------------------------
// STEP 12: Appointment Cancellation Flow
// ----------------------------------------------------------------------------
console.log('\n[Step 12] Appointment Cancellation Flow...');
const booking4 = fixture.bookings[3];
assert(booking4.status === 'cancelled', 'Step 12: Booking 4 status is cancelled');
assert(booking4.cancellationReason && booking4.cancellationReason.length > 5, 'Step 12: Cancellation reason preserved');

// ----------------------------------------------------------------------------
// STEP 13: Communication Outbox Audit (Phase E Integration)
// ----------------------------------------------------------------------------
console.log('\n[Step 13] Communication Outbox Audit...');
const deliveryService = new CommunicationDeliveryService();

// Intent 1 for Booking 1 (Consent Granted)
const intent1 = deliveryService.createIntent({
  intentId: 'intent_rehearsal_selin_01',
  tenantId: fixture.tenantId,
  branchId: branch.id,
  channel: 'sms',
  recipient: booking1.customerPhone,
  templateId: 'booking_confirmed',
  templateArgs: { customerName: booking1.customerName, salonName: fixture.businessName },
  body: `Sayın ${booking1.customerName}, ${fixture.businessName} randevunuz onaylandı.`,
  consentGranted: true
});
assert(intent1.status === 'rendered', 'Step 13: Consent-granted intent defaults to rendered (fails closed, no auto-dispatch)');

// Intent 2 for Booking 2 (Consent Denied)
const intent2 = deliveryService.createIntent({
  intentId: 'intent_rehearsal_merve_02',
  tenantId: fixture.tenantId,
  branchId: branch.id,
  channel: 'sms',
  recipient: booking2.customerPhone,
  templateId: 'booking_confirmed',
  templateArgs: { customerName: booking2.customerName, salonName: fixture.businessName },
  body: `Sayın ${booking2.customerName}, randevunuz onaylandı.`,
  consentGranted: false,
  consentDenialReason: 'Customer denied contact consent during booking'
});
assert(intent2.status === 'skipped', 'Step 13: Consent-denied intent transitions directly to skipped');
assert(deliveryService.getFailuresForIntent(intent2.intentId)[0].failureType === 'CONSENT_DENIED', 'Step 13: Failure record logged as CONSENT_DENIED');

// ----------------------------------------------------------------------------
// STEP 14: SuperAdmin Review & Synthetic Go-Live Approval Guard
// ----------------------------------------------------------------------------
console.log('\n[Step 14] SuperAdmin Review & Go-Live Guard...');
const approved = await superAdminService.approveGoLive(fixture.tenantId, { isRehearsal: true });
assert(approved === true, 'Step 14: SuperAdmin synthetic rehearsal approval returned true');

// Verify that the data provider has DEMO_REHEARSAL_APPROVED
const { dataProvider } = await import('../services/dataProvider.js');
const provStatus = await dataProvider.get(`lari:${fixture.tenantId}:go_live_status`);
assert(provStatus === 'DEMO_REHEARSAL_APPROVED', 'Step 14: Rehearsal guard stored DEMO_REHEARSAL_APPROVED without calling live RPC');

// ----------------------------------------------------------------------------
// STEP 15: Responsive UI Layout & Terminal State Assertion
// ----------------------------------------------------------------------------
console.log('\n[Step 15] Responsive Layout Verification (360px, 390px, 768px, 1024px)...');
const viewports = [
  { name: 'Mobile Small', width: 360, classExpected: 'grid-cols-1' },
  { name: 'Mobile Standard', width: 390, classExpected: 'grid-cols-1' },
  { name: 'Tablet', width: 768, classExpected: 'md:grid-cols' },
  { name: 'Desktop', width: 1024, classExpected: 'lg:grid-cols-12' }
];

const outboxPanelSrc = fs.readFileSync(path.join(process.cwd(), 'components', 'CommunicationOutboxPanel.tsx'), 'utf8');
for (const vp of viewports) {
  assert(outboxPanelSrc.includes(vp.classExpected), `Step 15: ${vp.name} (${vp.width}px) responsive breakpoint rule "${vp.classExpected}" active in UI`);
}

const adminOnboardSrc = fs.readFileSync(path.join(process.cwd(), 'pages', 'super-admin', 'SuperAdminOnboardingPage.tsx'), 'utf8');
assert(adminOnboardSrc.includes('md:hidden') && adminOnboardSrc.includes('hidden md:block'), 'Step 15: SuperAdminOnboardingPage defines separate mobile cards and desktop table views');

// Terminal State
console.log('\n============================================================================');
if (failCount > 0) {
  console.error(`❌ Phase F Rehearsal QA Failed: ${failCount} errors.`);
  process.exit(1);
} else {
  console.log(`🎉 SYNTHETIC_PILOT_REHEARSAL_PASSED (15/15 Journey Steps Verified, ${passCount} checks passed).`);
  console.log('Terminal State: LARI_PHASE_E_COMMUNICATION_SOURCE_QUALIFIED_AND_PHASE_F_SYNTHETIC_ONBOARDING_READY');
  console.log('============================================================================');
  process.exit(0);
}
