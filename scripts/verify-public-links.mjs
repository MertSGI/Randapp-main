import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let hasErrors = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    hasErrors = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('\nRunning Public Links & Domains QA Check...\n');

const publicLinkServicePath = path.join(rootDir, 'services/publicLinkService.ts') || path.join(rootDir, 'src/services/publicLinkService.ts');
if (fs.existsSync(publicLinkServicePath)) {
  const content = fs.readFileSync(publicLinkServicePath, 'utf8');
  assert(content.includes('normalizeSlug'), 'publicLinkService handles slug normalization');
  assert(content.includes('RESERVED_SLUGS'), 'publicLinkService blocks reserved slugs like admin, login, etc.');
  assert(content.includes('getTenantPublicUrl'), 'publicLinkService can generate main public URL');
  assert(content.includes('getBranchBookingUrl'), 'publicLinkService can generate branch-specific URL');
  assert(content.includes('canUseCustomDomain'), 'publicLinkService checks customDomain entitlement');
} else {
  assert(false, 'publicLinkService.ts not found');
}

const adminSettingsPath = path.join(rootDir, 'components/PublicLinkSection.tsx') || path.join(rootDir, 'src/components/PublicLinkSection.tsx');
if (fs.existsSync(adminSettingsPath)) {
  const content = fs.readFileSync(adminSettingsPath, 'utf8');
  assert(content.includes('getTenantBookingUrl'), 'PublicLinkSection displays tenant booking URL');
  assert(content.includes('Kopyala'), 'PublicLinkSection supports copying link');
  assert(content.includes('QR Kod'), 'PublicLinkSection supports QR code generation');
  assert(content.includes('getBranchBookingUrl'), 'PublicLinkSection displays branch URLs if multi-branch');
} else {
  assert(false, 'PublicLinkSection.tsx not found, admin share panel might be missing');
}

const bookingPagePath = path.join(rootDir, 'pages/BookingPage.tsx') || path.join(rootDir, 'src/pages/BookingPage.tsx');
if (fs.existsSync(bookingPagePath)) {
  const content = fs.readFileSync(bookingPagePath, 'utf8');
  assert(content.includes('.get(\'branch\')'), 'BookingPage can read branch param from URL');
  assert(content.includes('branchAlreadySelectedAndValid'), 'BookingPage skips branch selection if valid branch is in URL');
} else {
  assert(false, 'BookingPage.tsx not found');
}

if (hasErrors) {
  console.error('\n❌ QA Failed: Public links & domains check did not pass.');
  process.exit(1);
} else {
  console.log('\n🎉 Public Links & Domains QA passed successfully!');
}
