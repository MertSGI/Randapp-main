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

console.log('\nRunning Share Toolkit QA Check...\n');

const shareToolkitServicePath = path.join(rootDir, 'services/shareToolkitService.ts') || path.join(rootDir, 'src/services/shareToolkitService.ts');
if (fs.existsSync(shareToolkitServicePath)) {
  const content = fs.readFileSync(shareToolkitServicePath, 'utf8');
  assert(content.includes('getWhatsAppShareText'), 'shareToolkitService has getWhatsAppShareText');
  assert(content.includes('getShareTrackingUrl'), 'shareToolkitService has source tracking support');
  assert(content.includes('getShareChecklist'), 'shareToolkitService has share checklist support');
} else {
  assert(false, 'shareToolkitService.ts not found');
}

const adminSettingsPath = path.join(rootDir, 'components/ShareToolkitSection.tsx') || path.join(rootDir, 'src/components/ShareToolkitSection.tsx');
if (fs.existsSync(adminSettingsPath)) {
  const content = fs.readFileSync(adminSettingsPath, 'utf8');
  assert(content.includes('getWhatsAppShareText'), 'ShareToolkitSection renders share texts');
  assert(content.includes('toggleChecklist'), 'ShareToolkitSection manages checklist');
  assert(content.includes('QR Poster'), 'ShareToolkitSection supports QR visual helper');
} else {
  assert(false, 'ShareToolkitSection.tsx not found');
}

const bookingPagePath = path.join(rootDir, 'pages/BookingPage.tsx') || path.join(rootDir, 'src/pages/BookingPage.tsx');
if (fs.existsSync(bookingPagePath)) {
  const content = fs.readFileSync(bookingPagePath, 'utf8');
  assert(content.includes('.get(\'source\')'), 'BookingPage can read source param from URL');
  assert(content.includes('source: urlSource'), 'BookingPage attaches source to appointment payload');
} else {
  assert(false, 'BookingPage.tsx not found');
}

const reportsPath = path.join(rootDir, 'components/SalonReportsTab.tsx') || path.join(rootDir, 'src/components/SalonReportsTab.tsx');
if (fs.existsSync(reportsPath)) {
  const content = fs.readFileSync(reportsPath, 'utf8');
  assert(content.includes('Randevu Kaynakları'), 'SalonReportsTab has source breakdown UI');
} else {
  assert(false, 'SalonReportsTab.tsx not found');
}

if (hasErrors) {
  console.error('\n❌ QA Failed: Share Toolkit check did not pass.');
  process.exit(1);
} else {
  console.log('\n🎉 Share Toolkit QA passed successfully!');
}
