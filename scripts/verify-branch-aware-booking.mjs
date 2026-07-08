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

console.log('\nRunning Branch-Aware Booking QA Check...\n');

// 1. Check BookingPage logic
const bookingPagePath = path.join(rootDir, 'src/pages/BookingPage.tsx');
if (fs.existsSync(bookingPagePath)) {
  const content = fs.readFileSync(bookingPagePath, 'utf8');
  assert(content.includes('branches.length > 1'), 'BookingPage uses branches.length > 1 rule for branch selection');
  assert(content.includes('setStep(0.5)'), 'BookingPage implements step 0.5 for branch selection');
  assert(content.includes('branchId: currentBranchId'), 'BookingPage passes currentBranchId to the appointment creation');
  assert(content.includes('filteredServices'), 'BookingPage uses branch-filtered services logic');
  assert(content.includes('filteredStaff'), 'BookingPage uses branch-filtered staff logic');
} else {
  // It might be in pages/BookingPage.tsx if no src/
  const bookingPageFallbackPath = path.join(rootDir, 'pages/BookingPage.tsx');
  if (fs.existsSync(bookingPageFallbackPath)) {
      const content = fs.readFileSync(bookingPageFallbackPath, 'utf8');
      assert(content.includes('branches.length > 1'), 'BookingPage uses branches.length > 1 rule for branch selection');
      assert(content.includes('setStep(0.5)'), 'BookingPage implements step 0.5 for branch selection');
      assert(content.includes('branchId: currentBranchId'), 'BookingPage passes currentBranchId to the appointment creation');
      assert(content.includes('filteredServices'), 'BookingPage uses branch-filtered services logic');
      assert(content.includes('filteredStaff'), 'BookingPage uses branch-filtered staff logic');
  } else {
      assert(false, 'BookingPage.tsx not found in expected locations');
  }
}

// 2. Check AdminPage logic
const adminPagePath = path.join(rootDir, 'pages/AdminPage.tsx');
if (fs.existsSync(adminPagePath)) {
  const content = fs.readFileSync(adminPagePath, 'utf8');
  assert(content.includes('selectedBranchFilter'), 'AdminPage supports selectedBranchFilter');
  assert(content.includes('branches.length > 1'), 'AdminPage selectively displays branch filter if branches > 1');
  assert(content.includes('branchName && `• [${branchName}]`'), 'AdminPage renders the branch name in appointment lists');
} else {
  assert(false, 'AdminPage.tsx not found in expected locations');
}

if (hasErrors) {
  console.error('\n❌ QA Failed: Branch-Aware Booking check did not pass.');
  process.exit(1);
} else {
  console.log('\n🎉 Branch-Aware Booking QA passed successfully!');
}
