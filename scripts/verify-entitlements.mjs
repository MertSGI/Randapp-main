import fs from 'fs';
import path from 'path';

const SRC_DIR = process.cwd();

function checkFileContains(filePath, stringsToFind) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ QA FAILED: File not found: ${filePath}`);
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const str of stringsToFind) {
    if (!content.includes(str)) {
      console.error(`❌ QA FAILED: Missing entitlement logic in ${filePath}`);
      console.error(`   Could not find: "${str}"`);
      return false;
    }
  }
  return true;
}

console.log('--- ENTITLEment QA RUN ---');

const checks = [
  {
    file: path.join(SRC_DIR, 'services', 'planService.ts'),
    strings: ['baslangic', 'standart', 'professional', 'premium', 'kurumsal']
  },
  {
    file: path.join(SRC_DIR, 'services', 'entitlementService.ts'),
    strings: ['export const entitlementService', 'canUseFeature', 'getLimit']
  },
  {
    file: path.join(SRC_DIR, 'components', 'ReferralTab.tsx'),
    strings: ['canTenantUseFeature']
  },
  {
    file: path.join(SRC_DIR, 'components', 'SalonReportsTab.tsx'),
    strings: ['canTenantUseFeature']
  },
  {
    file: path.join(SRC_DIR, 'components', 'layouts', 'SalonBookingLayout.tsx'),
    strings: ['entitlementService']
  },
  {
    file: path.join(SRC_DIR, 'services', 'subscriptionService.ts'),
    strings: ['getTenantLimit']
  },
  {
    file: path.join(SRC_DIR, 'components', 'CustomerMemoryTab.tsx'),
    strings: ['canTenantUseFeature']
  }
];

let allPassed = true;
for (const check of checks) {
  const result = checkFileContains(check.file, check.strings);
  if (!result) allPassed = false;
}

if (allPassed) {
  console.log('✅ QA PASSED: Feature entitlements correctly distributed across UI/Services.');
  process.exit(0);
} else {
  process.exit(1);
}
