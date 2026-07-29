// scripts/verify-customer-portal-containment.mjs
import fs from 'fs';
import path from 'path';

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`);
    process.exitCode = 1;
  }
}

console.log('=== Stage E1B-A — CustomerPortal Containment & Reachability QA ===\n');

const portalPath = path.join(process.cwd(), 'pages/customer/CustomerPortalPage.tsx');
const selfServiceServicePath = path.join(process.cwd(), 'services/appointmentSelfServiceService.ts');
const selfServicePagePath = path.join(process.cwd(), 'pages/AppointmentSelfServicePage.tsx');

const portalSrc = fs.readFileSync(portalPath, 'utf8');
const selfServiceServiceSrc = fs.readFileSync(selfServiceServicePath, 'utf8');
const selfServicePageSrc = fs.readFileSync(selfServicePagePath, 'utf8');

console.log('--- §1 CustomerPortal Direct-Write Containment ---');
assert(!portalSrc.includes('updateAppointmentStatus'), 'CustomerPortalPage does NOT import or call updateAppointmentStatus');
assert(!portalSrc.includes(".from('appointments').update"), 'CustomerPortalPage does NOT call supabase.from("appointments").update');
assert(!portalSrc.includes('PATCH'), 'CustomerPortalPage does NOT issue raw PATCH requests');
assert(!portalSrc.includes('handleCancelClick'), 'CustomerPortalPage does NOT contain handleCancelClick handler');
assert(!portalSrc.includes('confirmCancel'), 'CustomerPortalPage does NOT contain confirmCancel mutation');
assert(!portalSrc.includes('cancel_appointment'), 'CustomerPortalPage does NOT render cancellation buttons');

console.log('\n--- §2 Safe Explanatory Customer UI Banner ---');
assert(
  portalSrc.includes('Bu ekrandan güvenli iptal işlemi şu anda desteklenmiyor') &&
  portalSrc.includes('gönderilen yönetim bağlantısını kullanabilir veya işletmeyle iletişime geçebilirsiniz'),
  'CustomerPortalPage renders safe Turkish explanation banner directing to manage token link'
);

console.log('\n--- §3 Manage-Token Secure RPC Flow Integrity ---');
assert(
  selfServiceServiceSrc.includes('/rest/v1/rpc/cancel_public_appointment_by_manage_token'),
  'appointmentSelfServiceService calls cancel_public_appointment_by_manage_token RPC'
);
assert(
  !selfServiceServiceSrc.includes(".from('appointments').update"),
  'appointmentSelfServiceService does NOT issue direct appointments update'
);
assert(
  selfServicePageSrc.includes('getStatusDisplayLabel'),
  'AppointmentSelfServicePage preserves detail view contracts'
);

console.log('\n══════════════════════════════════════════════════════════');
if (process.exitCode === 1) {
  console.error('❌ Stage E1B-A CustomerPortal containment QA FAILED.');
  process.exit(1);
} else {
  console.log('✅ Stage E1B-A CustomerPortal containment QA PASSED.');
}
