// Phase 7 Node 3 R1 static architecture and security contracts.
// Behavioral truth is verified separately against disposable PostgreSQL.

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(
  'supabase/migrations/20261006_phase7_node3_favorites_fast_rebooking.sql'
);

if (!fs.existsSync(migrationPath)) {
  console.error(`Missing migration: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');
const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
const repositorySource = fs.readFileSync(
  path.resolve('services/repositories/supabaseBookingRepository.ts'),
  'utf8'
);
const selfServiceSource = fs.readFileSync(
  path.resolve('services/appointmentSelfServiceService.ts'),
  'utf8'
);
const managePageSource = fs.readFileSync(
  path.resolve('pages/AppointmentSelfServicePage.tsx'),
  'utf8'
);
const bookingPageSource = fs.readFileSync(
  path.resolve('pages/BookingPage.tsx'),
  'utf8'
);
const customerLoginSource = fs.readFileSync(
  path.resolve('pages/customer/CustomerLoginPage.tsx'),
  'utf8'
);
const tenantContextSource = fs.readFileSync(
  path.resolve('contexts/TenantContext.tsx'),
  'utf8'
);
const appSource = fs.readFileSync(path.resolve('App.tsx'), 'utf8');

function functionBody(name) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\bas\\s+\\$\\$([\\s\\S]*?)\\$\\$\\s*;`,
    'i'
  );
  const match = sql.match(pattern);
  return match?.[1] ?? '';
}

const setFavoriteBody = functionBody('set_customer_favorite');
const getFavoritesBody = functionBody('get_customer_favorites');
const rebookBody = functionBody('get_fast_rebooking_seed_by_manage_token');

let passed = 0;
let failed = 0;

function assertContract(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return;
  }
  failed += 1;
  console.error(`  [FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
}

console.log('===============================================================');
console.log('PHASE 7 NODE 3 R1 STATIC CONTRACT VERIFICATION');
console.log(`Migration: ${migrationPath}`);
console.log('===============================================================');

assertContract(
  '1. Exactly one relationship table is introduced',
  (normalized.match(/create table if not exists public\./g) ?? []).length === 1 &&
    normalized.includes('create table if not exists public.customer_favorites')
);

assertContract(
  '2. No duplicate customer, tenant, business, service, staff, or booking truth is created',
  !/create table(?: if not exists)? public\.(customers|tenants|tenant_business_profiles|services|staff|appointments|rebookings|fast_bookings|favorite_businesses)/i.test(sql)
);

assertContract(
  '3. Favorite rows contain only identity linkage and timestamps',
  /customer_user_id\s+uuid\s+not null references auth\.users\(id\)/i.test(sql) &&
    /tenant_id\s+uuid\s+not null references public\.tenants\(id\)/i.test(sql) &&
    !/favorite_type|branch_id\s+uuid references|service_id\s+uuid references|staff_id\s+uuid references/i.test(sql)
);

assertContract(
  '4. User and tenant uniqueness is non-null and retry-safe',
  /unique\s*\(\s*customer_user_id\s*,\s*tenant_id\s*\)/i.test(sql) &&
    /on conflict\s*\(\s*customer_user_id\s*,\s*tenant_id\s*\)\s+do nothing/i.test(setFavoriteBody)
);

assertContract(
  '5. RLS is enabled and every policy binds rows to auth.uid()',
  normalized.includes('alter table public.customer_favorites enable row level security') &&
    (sql.match(/customer_user_id\s*=\s*\(select auth\.uid\(\)\)/gi) ?? []).length >= 3
);

assertContract(
  '6. Browser roles cannot directly mutate arbitrary favorite owners',
  /revoke all on table public\.customer_favorites from public, anon, authenticated/i.test(normalized) &&
    !/grant\s+(?:insert|update|delete|all)[^;]*customer_favorites[^;]*authenticated/i.test(normalized)
);

assertContract(
  '7. Favorite mutation authenticates internally and derives owner from auth.uid()',
  /v_user_id\s*:=\s*auth\.uid\(\)/i.test(setFavoriteBody) &&
    /values\s*\(\s*v_user_id\s*,\s*p_tenant_id\s*\)/i.test(setFavoriteBody) &&
    !/p_(?:user|customer)_id/i.test(setFavoriteBody)
);

assertContract(
  '8. Favorite target reuses canonical public-booking eligibility',
  /evaluate_public_booking_eligibility_internal\s*\(\s*t\.id\s*,\s*t\.slug\s*\)/i.test(setFavoriteBody) &&
    /is_public_profile_enabled\s+is true/i.test(setFavoriteBody) &&
    /public_site_status\s*=\s*'published'/i.test(setFavoriteBody)
);

assertContract(
  '9. Favorite removal deletes only the caller relation',
  /delete from public\.customer_favorites[\s\S]*customer_user_id\s*=\s*v_user_id[\s\S]*tenant_id\s*=\s*p_tenant_id/i.test(setFavoriteBody) &&
    !/delete from public\.(?:tenants|tenant_business_profiles|services|staff)/i.test(setFavoriteBody)
);

assertContract(
  '10. Favorite reads are owner-scoped and project current canonical tenant truth',
  /cf\.customer_user_id\s*=\s*v_user_id/i.test(getFavoritesBody) &&
    /join public\.tenants/i.test(getFavoritesBody) &&
    /evaluate_public_booking_eligibility_internal/i.test(getFavoritesBody)
);

assertContract(
  '11. Fast rebooking uses the accepted manage-token hash and expiry authority',
  /sha256\s*\(\s*trim\(p_manage_token\)::bytea\s*\)/i.test(rebookBody) &&
    /from public\.appointment_access_tokens/i.test(rebookBody) &&
    /tok\.expires_at\s*>\s*now\(\)/i.test(rebookBody)
);

assertContract(
  '12. Token ownership is bound to the exact appointment and tenant',
  /a\.id\s*=\s*tok\.appointment_id/i.test(rebookBody) &&
    /a\.tenant_id::text\s*=\s*tok\.tenant_id/i.test(rebookBody) &&
    /v_history\.status\s*<>\s*'completed'/i.test(rebookBody)
);

assertContract(
  '13. Rebooking does not authorize by localStorage, email, phone, or auth.uid()',
  !/localstorage|lari_customer_auth|user_email|customer_email|phone|auth\.uid\(\)|public\.customers/i.test(rebookBody)
);

assertContract(
  '14. Rebooking re-resolves current service price and duration',
  /from public\.services/i.test(rebookBody) &&
    /s\.active\s+is true/i.test(rebookBody) &&
    /current_service_price/i.test(rebookBody) &&
    /current_service_duration_minutes/i.test(rebookBody) &&
    !/duration_minutes[^\n]*v_history|v_history[^\n]*price/i.test(rebookBody)
);

assertContract(
  '15. Current staff, branch, staff-service, and branch mappings fail closed',
  /from public\.staff st/i.test(rebookBody) &&
    /from public\.branches b/i.test(rebookBody) &&
    /from public\.staff_services ss/i.test(rebookBody) &&
    /from public\.service_branches sb/i.test(rebookBody) &&
    /from public\.staff_branches stb/i.test(rebookBody)
);

assertContract(
  '16. Fast rebooking returns a seed for canonical availability and booking only',
  /availability_authority'\s*,\s*'evaluate_booking_slot'/i.test(rebookBody) &&
    /booking_authority'\s*,\s*'create_public_booking'/i.test(rebookBody) &&
    /canonical_booking_required'\s*,\s*true/i.test(rebookBody)
);

assertContract(
  '17. Node 3 never inserts or updates appointments and creates no second booking engine',
  !/(insert into|update|delete from)\s+public\.appointments/i.test(sql) &&
    !/create\s+(?:or replace\s+)?function\s+public\.(?:create|book|rebook).*appointment/i.test(sql)
);

assertContract(
  '18. Draft-only noncanonical service columns are absent',
  !/services[\s\S]{0,120}\bis_active\b/i.test(sql) &&
    !/is_online_booking_enabled/i.test(sql)
);

assertContract(
  '19. All three RPCs are SECURITY DEFINER with a pinned safe search_path',
  (sql.match(/security definer\s+set search_path = pg_catalog, public/gi) ?? []).length === 3
);

assertContract(
  '20. Function execution is revoked from PUBLIC before explicit minimal grants',
  (sql.match(/revoke all on function public\./gi) ?? []).length === 3 &&
    /grant execute on function public\.set_customer_favorite\(uuid, boolean\)\s+to authenticated, service_role/i.test(normalized) &&
    /grant execute on function public\.get_fast_rebooking_seed_by_manage_token\(text\)\s+to anon, authenticated, service_role/i.test(normalized)
);

assertContract(
  '21. R2 favorites call only the accepted RPCs and validate Supabase Auth identity',
  repositorySource.includes('/rest/v1/rpc/get_customer_favorites') &&
    repositorySource.includes('/rest/v1/rpc/set_customer_favorite') &&
    repositorySource.includes('supabase.auth.getUser()') &&
    !repositorySource.includes('lari_customer_auth')
);

assertContract(
  '22. R2 fast rebooking resolves the accepted manage-token seed RPC',
  repositorySource.includes('/rest/v1/rpc/get_fast_rebooking_seed_by_manage_token') &&
    selfServiceSource.includes('getFastRebookingSeedByManageToken(token.trim())')
);

assertContract(
  '23. Manage surface exposes rebooking only for completed appointments',
  /appointment\.status\s*===\s*'completed'[\s\S]*handleFastRebook/i.test(managePageSource) &&
    managePageSource.includes('appointmentSelfServiceService.getFastRebookingSeed(effectiveToken)')
);

assertContract(
  '24. Rebooking handoff carries only the ownership token to the canonical tenant route',
  managePageSource.includes("new URLSearchParams({ rebook_token: effectiveToken })") &&
    managePageSource.includes('encodeURIComponent(result.seed.tenantSlug)') &&
    managePageSource.includes('navigate(') &&
    !/new URLSearchParams\(\{[\s\S]{0,200}service:/i.test(managePageSource)
);

assertContract(
  '25. Booking page re-resolves current seed selections and requires current tenant match',
  bookingPageSource.includes("params.get('rebook_token')") &&
    bookingPageSource.includes('seed.tenantSlug !== tenant.slug') &&
    bookingPageSource.includes('item.id === seed.serviceId') &&
    bookingPageSource.includes('item.id === seed.staffId') &&
    bookingPageSource.includes('item.id === seed.branchId')
);

assertContract(
  '26. Rebooking remains on canonical availability and creation paths',
  bookingPageSource.includes('availabilityService.getAvailableSlotsForStaff') &&
    bookingPageSource.includes('repo.createPublicBooking({') &&
    !/insert\s+into\s+appointments/i.test(bookingPageSource)
);

assertContract(
  '27. Customer authentication recognizes Supabase session and disables OTP initiation under DECISION-024 remediation',
  customerLoginSource.includes("getDataSourceMode() === 'supabase'") &&
    customerLoginSource.includes('supabase.auth.getSession()') &&
    !customerLoginSource.includes('supabase.auth.signInWithOtp(')
);

assertContract(
  '28. R2 does not expand the shared BookingRepository contract',
  !selfServiceSource.includes('repo.getCustomerFavorites(') &&
    !selfServiceSource.includes('repo.getFastRebookingSeedByManageToken(')
);

assertContract(
  '29. Route handoffs refresh tenant context without remounting the provider',
  /<Router>\s*<TenantProvider>/m.test(appSource) &&
    tenantContextSource.includes("import { useLocation } from 'react-router-dom'") &&
    tenantContextSource.includes('const location = useLocation()') &&
    /useEffect\(\(\) => \{\s*void loadTenant\(\);\s*\}, \[location\.pathname, location\.search\]\)/m.test(tenantContextSource)
);

console.log('---------------------------------------------------------------');
console.log(`TOTAL: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('---------------------------------------------------------------');

if (failed > 0) process.exit(1);
console.log('ALL PHASE 7 NODE 3 R1 STATIC CONTRACTS PASSED.');
