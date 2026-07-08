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

if (hasErrors) {
  console.error('\n❌ Admin UX Readiness check failed. Please fix the above issues.');
  process.exit(1);
} else {
  console.log('\n🎉 Admin UX Readiness check passed!');
  process.exit(0);
}
