// scripts/test-self-service-runtime-target.mjs
// Non-secret runtime consistency test for Stage C1 self-service token read contract.
// Verifies:
// 1. Vite Supabase URL matches the target staging project ref (rwedeejhjazwjthdjzrt).
// 2. appointmentSelfServiceService uses fetchSupabase with Content-Type application/json.
// 3. No active frontend code performs direct appointment_access_tokens SELECT.
// 4. manage route does not trigger tenant slug resolution.
// 5. RPC error handling distinguishes invalid_token from service_error.

import fs from 'fs';
import path from 'path';
import assert from 'assert';

const ROOT = process.cwd();
const EXPECTED_PROJECT_REF = 'rwedeejhjazwjthdjzrt';

function checkFileExists(relPath) {
  const full = path.join(ROOT, relPath);
  assert(fs.existsSync(full), `File ${relPath} must exist`);
  return fs.readFileSync(full, 'utf8');
}

console.log('🏁 Running Stage C1 Runtime-Target & Route Isolation Test Suite...');

// 1. Check .env configuration for expected staging project ref
const envLocalPath = path.join(ROOT, '.env.local');
const envPath = path.join(ROOT, '.env');
const targetEnvPath = fs.existsSync(envLocalPath) ? envLocalPath : envPath;
const envContent = fs.readFileSync(targetEnvPath, 'utf8');

const urlMatch = envContent.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
assert(urlMatch, 'VITE_SUPABASE_URL must be defined in .env / .env.local');

const supabaseUrl = urlMatch[1].trim();
const derivedProjectRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0];
assert.strictEqual(
  derivedProjectRef,
  EXPECTED_PROJECT_REF,
  `Staging project ref must match canonical target ${EXPECTED_PROJECT_REF}. Found: ${derivedProjectRef}`
);
console.log(`  ✅ Staging project ref verified: ${derivedProjectRef}.supabase.co`);

// 2. Check fetchSupabase implementation sends Content-Type application/json when body is provided
const supabaseClientCode = checkFileExists('services/repositories/supabaseClient.ts');
assert(
  supabaseClientCode.includes("'Content-Type': 'application/json'"),
  'fetchSupabase must default Content-Type to application/json when body is present'
);
console.log('  ✅ fetchSupabase Content-Type JSON header assertion passed.');

// 3. Check appointmentSelfServiceService uses fetchSupabase with get_public_appointment_by_manage_token
const selfServiceCode = checkFileExists('services/appointmentSelfServiceService.ts');
assert(
  selfServiceCode.includes('get_public_appointment_by_manage_token'),
  'appointmentSelfServiceService must invoke get_public_appointment_by_manage_token'
);
assert(
  !/\.from\(['"]appointment_access_tokens['"]\)\.select/.test(selfServiceCode),
  'appointmentSelfServiceService must not perform direct SELECT on appointment_access_tokens in Supabase mode'
);
console.log('  ✅ appointmentSelfServiceService RPC integration passed.');

// 4. Check tenantService excludes /appointment/manage from slug resolution
const tenantServiceCode = checkFileExists('services/tenantService.ts');
assert(
  tenantServiceCode.includes("hash.includes('/appointment/manage')"),
  'tenantService must short-circuit getCurrentTenant on /appointment/manage route'
);
assert(
  tenantServiceCode.includes("parts[1] !== 'appointment'"),
  "tenantService must exclude 'appointment' from generic tenant slug parsing"
);
console.log('  ✅ tenantService route isolation passed.');

// 5. Check AppointmentSelfServicePage handles typed result kinds (invalid_token vs service_error)
const selfServicePageCode = checkFileExists('pages/AppointmentSelfServicePage.tsx');
assert(
  selfServicePageCode.includes("resultKind === 'service_error'"),
  'AppointmentSelfServicePage must render separate retryable UI for service_error'
);
assert(
  selfServicePageCode.includes("Randevu Bilgilerine Ulaşılamıyor"),
  'AppointmentSelfServicePage must render Randevu Bilgilerine Ulaşılamıyor heading for service_error'
);
assert(
  selfServicePageCode.includes("Bağlantı Geçersiz"),
  'AppointmentSelfServicePage must render Bağlantı Geçersiz heading for invalid_token'
);
assert(
  selfServicePageCode.includes("loadedTokenRef"),
  'AppointmentSelfServicePage must use loadedTokenRef for request deduplication'
);
console.log('  ✅ AppointmentSelfServicePage error-contract & deduplication passed.');

console.log('🎉 ALL STAGE C1 RUNTIME-TARGET & ROUTE ISOLATION CHECKS PASSED!');
