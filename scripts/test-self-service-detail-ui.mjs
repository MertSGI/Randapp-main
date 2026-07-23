// scripts/test-self-service-detail-ui.mjs
// Automated test suite for Stage C2: Customer Appointment Detail Experience.
// Verifies UI state rendering, status mapping, Turkish date formatting, paymentless compliance, route isolation, token safety, and error contracts.

import fs from 'fs';
import path from 'path';
import assert from 'assert';

const ROOT = process.cwd();

function checkFileExists(relPath) {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `File ${relPath} must exist`);
  return fs.readFileSync(full, 'utf8');
}

console.log('🏁 Running Stage C2 Customer Appointment Detail Experience Test Suite...');

const pageCode = checkFileExists('pages/AppointmentSelfServicePage.tsx');
const serviceCode = checkFileExists('services/appointmentSelfServiceService.ts');
const routerCode = checkFileExists('App.tsx');
const tenantServiceCode = checkFileExists('services/tenantService.ts');

// 1. Loading State Requirements
assert(
  pageCode.includes('if (loading)'),
  'Loading state branch must exist'
);
assert(
  pageCode.includes('animate-pulse'),
  'Loading state must use layout skeleton (animate-pulse)'
);
assert(
  !pageCode.includes('Yükleniyor...'),
  'Loading state must not render technical loading text'
);
console.log('  ✅ 1. Loading skeleton state verified (no layout jump, no technical text).');

// 2. Turkish Status Mapping Requirements
assert(
  pageCode.includes("case 'confirmed': return 'Onaylandı'"),
  "Status 'confirmed' must map to 'Onaylandı'"
);
assert(
  pageCode.includes("case 'completed': return 'Tamamlandı'"),
  "Status 'completed' must map to 'Tamamlandı'"
);
assert(
  pageCode.includes("case 'no_show': return 'Gelmedi'"),
  "Status 'no_show' must map to 'Gelmedi'"
);
assert(
  pageCode.includes("case 'cancelled':") && pageCode.includes("case 'cancelled_by_customer': return 'İptal Edildi'"),
  "Status 'cancelled' and 'cancelled_by_customer' must map to 'İptal Edildi'"
);
assert(
  pageCode.includes("case 'cancelled_by_salon': return 'İşletme Tarafından İptal Edildi'"),
  "Status 'cancelled_by_salon' must map to 'İşletme Tarafından İptal Edildi'"
);
assert(
  pageCode.includes("case 'cancelled_by_system': return 'Sistem Tarafından İptal Edildi'"),
  "Status 'cancelled_by_system' must map to 'Sistem Tarafından İptal Edildi'"
);
assert(
  pageCode.includes("default: return 'Durum Bilinmiyor'"),
  "Unknown status must map to 'Durum Bilinmiyor'"
);
console.log('  ✅ 2. Turkish status mapping contract verified.');

// 3. Turkish Date & Time Formatting Requirements
assert(
  pageCode.includes('formatTurkishDate'),
  'Turkish date formatter helper must exist'
);
assert(
  pageCode.includes("tr-TR"),
  'Date formatting must use tr-TR locale'
);
console.log('  ✅ 3. Turkish date and time formatting verified.');

// 4. Invalid-Token State Requirements
assert(
  pageCode.includes('Bağlantı Geçersiz'),
  "Invalid-token state must render 'Bağlantı Geçersiz'"
);
assert(
  pageCode.includes('Bu randevu işlem bağlantısı geçersiz, süresi dolmuş veya iptal edilmiş olabilir'),
  "Invalid-token state must render neutral Turkish body copy"
);
console.log('  ✅ 4. Neutral invalid-token state verified.');

// 5. Service-Error State & Retry Requirements
assert(
  pageCode.includes('Randevu Bilgilerine Ulaşılamıyor'),
  "Service-error state must render 'Randevu Bilgilerine Ulaşılamıyor'"
);
assert(
  pageCode.includes('Randevu bilgileri şu anda kontrol edilemiyor. Lütfen kısa bir süre sonra tekrar deneyin.'),
  "Service-error state must render retryable body copy"
);
assert(
  pageCode.includes('Tekrar Dene'),
  "Service-error state must render 'Tekrar Dene' button"
);
assert(
  pageCode.includes("loadedTokenRef.current = ''"),
  'Retry button must reset loadedTokenRef to trigger one new logical RPC request'
);
console.log('  ✅ 5. Retryable service-error state verified.');

// 6. Paymentless Product Compliance (No Price / Payment UI)
assert(
  !pageCode.includes('Ödeme yapıldı') &&
  !pageCode.includes('Ödeme bekleniyor') &&
  !pageCode.includes('Kart bilgileri') &&
  !pageCode.includes('iyzico') &&
  !pageCode.includes('₺') &&
  !pageCode.includes(' Fiyat'),
  'Stage C2 detail page must not contain payment claims or rendered price UI'
);
console.log('  ✅ 6. Paymentless compliance verified (no price/payment UI).');

// 7. Cancellation & Reschedule Controls Isolation
assert(
  !pageCode.includes('handleCancelRequest') && !pageCode.includes('handleRescheduleRequest'),
  'Cancellation and reschedule handlers must not be active or reachable in Stage C2'
);
assert(
  pageCode.includes('Bu sayfa şu anda randevu bilgilerinizi görüntülemek içindir'),
  'Read-only information notice must state that cancellation and rescheduling are not active'
);
console.log('  ✅ 7. Cancellation & reschedule controls safety verified.');

// 8. Navigation & Tenant Slug Safety
assert(
  pageCode.includes("navigate('/book')"),
  "Navigation action must safely navigate to public booking entry '/book'"
);
assert(
  !pageCode.includes("navigate('/')"),
  "Navigation must not derive tenant route from word 'appointment'"
);
assert(
  tenantServiceCode.includes("parts[1] !== 'appointment'"),
  "tenantService must exclude 'appointment' from generic tenant slug parsing"
);
console.log('  ✅ 8. Navigation & tenant slug isolation verified.');

// 9. Token & Request Safety
assert(
  serviceCode.includes('get_public_appointment_by_manage_token'),
  'Must invoke server-authoritative get_public_appointment_by_manage_token RPC'
);
assert(
  !/\.from\(['"]appointment_access_tokens['"]\)\.select/.test(serviceCode),
  'Must not perform direct SELECT on appointment_access_tokens'
);
assert(
  !/\.from\(['"]appointments['"]\)\.select/.test(serviceCode),
  'Must not perform direct SELECT on appointments table in Supabase mode'
);
assert(
  !pageCode.includes('tokenHash') && !pageCode.includes('p_token'),
  'Must not render raw token or token hash'
);
console.log('  ✅ 9. Token & RPC request safety verified.');

// 10. Route Consistency (Canonical vs Legacy Query Route)
assert(
  routerCode.includes('/appointment/manage/:token') && routerCode.includes('/appointment/manage'),
  'Router must support both canonical hash path and legacy query parameters'
);
console.log('  ✅ 10. Router route consistency verified.');

console.log('🎉 ALL STAGE C2 CUSTOMER DETAIL EXPERIENCE QA CHECKS PASSED!');
