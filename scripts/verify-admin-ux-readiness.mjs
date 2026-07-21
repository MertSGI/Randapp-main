import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let hasErrors = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    hasErrors = true;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('Running Admin UX Readiness Check...\n');

const adminPageContent = fs.readFileSync(path.join(rootDir, 'pages/AdminPage.tsx'), 'utf-8');
const adminFeatureAvailabilityServicePath = path.join(rootDir, 'services/adminFeatureAvailabilityService.ts');

assert(fs.existsSync(adminFeatureAvailabilityServicePath), 'adminFeatureAvailabilityService.ts must exist');

assert(
  adminPageContent.includes("adminFeatureAvailabilityService"),
  "AdminPage must import and use adminFeatureAvailabilityService"
);

assert(
  adminPageContent.includes("renderLockedFeature"),
  "AdminPage must include rendering logic for locked tabs"
);

assert(
  adminPageContent.includes("tabAvailability['reports']?.isAccessible === false"),
  "AdminPage must conditionally lock the reports tab"
);

assert(
  adminPageContent.includes("adminNextAction"),
  "AdminPage must implement the setup-aware Next Action banner"
);

assert(
  adminPageContent.includes("Henüz Randevu Yok") || adminPageContent.includes("Site Önizlemesini Aç"),
  "AdminPage must have improved empty states"
);

assert(
  !adminPageContent.includes("Referans & Puan"),
  "AdminPage must use correct translation keys instead of hardcoded string 'Referans & Puan'"
);

// Stage B.2 Unified Admin Bootstrap Architecture Checks
const useAdminBootstrapPath = path.join(rootDir, 'services/useAdminBootstrap.ts');
assert(fs.existsSync(useAdminBootstrapPath), 'useAdminBootstrap.ts hook must exist');

const useAdminBootstrapContent = fs.existsSync(useAdminBootstrapPath) ? fs.readFileSync(useAdminBootstrapPath, 'utf-8') : '';
assert(
  adminPageContent.includes("useAdminBootstrap"),
  "AdminPage must import and use useAdminBootstrap hook"
);

assert(
  useAdminBootstrapContent.includes("get_my_admin_bootstrap"),
  "useAdminBootstrap hook must invoke get_my_admin_bootstrap RPC"
);

assert(
  useAdminBootstrapContent.includes("loadedKeyRef") && useAdminBootstrapContent.includes("inFlightRef"),
  "useAdminBootstrap hook must deduplicate bootstrap requests using loadedKeyRef and inFlightRef"
);

const bookingRepoPath = path.join(rootDir, 'services/repositories/supabaseBookingRepository.ts');
const bookingRepoContent = fs.existsSync(bookingRepoPath) ? fs.readFileSync(bookingRepoPath, 'utf-8') : '';
assert(
  adminPageContent.includes("getAppointments") && bookingRepoContent.includes("get_my_tenant_appointments"),
  "AdminPage must use get_my_tenant_appointments RPC via appointmentService / SupabaseBookingRepository"
);

assert(
  adminPageContent.includes("getDashboardSummary"),
  "AdminPage must use getDashboardSummary RPC adapter"
);

if (hasErrors) {
  console.error('\n❌ Admin UX Readiness check failed. Please fix the above issues.');
  process.exit(1);
} else {
  console.log('\n🎉 Admin UX Readiness check passed!');
  process.exit(0);
}
