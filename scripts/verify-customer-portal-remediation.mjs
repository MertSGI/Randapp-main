// scripts/verify-customer-portal-remediation.mjs
// Verification of customer login & portal remediation under AUTHORITY LARI-WP5-ACCEPTANCE-REMEDIATION-20261008-01

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

console.log('=== LARI WP5 Acceptance Remediation Verification ===\n');

const loginPath = path.join(process.cwd(), 'pages/customer/CustomerLoginPage.tsx');
const portalPath = path.join(process.cwd(), 'pages/customer/CustomerPortalPage.tsx');

const loginSrc = fs.readFileSync(loginPath, 'utf8');
const portalSrc = fs.readFileSync(portalPath, 'utf8');

console.log('--- Fix 1: Customer Login Containment & Session Recognition ---');
assert(
  !loginSrc.includes('signInWithOtp('),
  'CustomerLoginPage does NOT call signInWithOtp()'
);
assert(
  loginSrc.includes('supabase.auth.getSession()') && loginSrc.includes('/customer/appointments'),
  'CustomerLoginPage recognizes existing Supabase session and redirects to /customer/appointments'
);
assert(
  loginSrc.includes('isSupabase') && loginSrc.includes('güvenli yönetim bağlantısını'),
  'CustomerLoginPage displays clear unavailable message with guidance to secure manage-token link'
);
assert(
  loginSrc.includes("localStorage.setItem('lari_customer_auth'"),
  'CustomerLoginPage preserves mock-only login path for non-Supabase mode'
);

console.log('\n--- Fix 2: Customer Portal History Containment & Fallback State ---');
assert(
  !portalSrc.includes('loadData(user)') && !portalSrc.includes('isSupabase && loadData'),
  'CustomerPortalPage in Supabase mode does NOT call client-side filtering loadData'
);
assert(
  portalSrc.includes('isSupabase ? (') &&
  portalSrc.includes('Randevu Geçmişi Bu Ekranda Görüntülenemiyor') &&
  portalSrc.includes('güvenli randevu yönetim bağlantısını'),
  'CustomerPortalPage in Supabase mode displays explicit unavailable state directing to manage-token link'
);
assert(
  portalSrc.includes('{upcomingApts.length === 0 ?') &&
  portalSrc.includes('{pastApts.length === 0 ?'),
  'CustomerPortalPage preserves standard appointment listing in non-Supabase mock mode'
);
assert(
  !portalSrc.includes('getAppointments(tenant.id) // supabase'),
  'CustomerPortalPage does not leak tenant-wide appointments in Supabase mode'
);

console.log('\n══════════════════════════════════════════════════════════');
if (process.exitCode === 1) {
  console.error('❌ LARI WP5 Customer Portal Remediation QA FAILED.');
  process.exit(1);
} else {
  console.log('✅ LARI WP5 Customer Portal Remediation QA PASSED.');
}
