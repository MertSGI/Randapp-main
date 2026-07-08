import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const REQUIRED_SERVICES = [
  'services/marketConfigService.ts',
  'services/currencyService.ts',
  'services/paymentProviderConfigService.ts',
  'utils/i18nLanguageConfig.ts'
];

let hasErrors = false;

function assertFileIncludes(filePath, str, errorMessage) {
    const content = fs.readFileSync(path.join(rootDir, filePath), 'utf8');
    if (!content.includes(str)) {
        console.error(`\x1b[31m[verify-market-global-readiness] FAILED: ${errorMessage}\x1b[0m`);
        hasErrors = true;
    }
}

function assertFileDoesNotInclude(filePath, str, errorMessage) {
    const content = fs.readFileSync(path.join(rootDir, filePath), 'utf8');
    if (content.includes(str)) {
        console.error(`\x1b[31m[verify-market-global-readiness] FAILED: ${errorMessage}\x1b[0m`);
        hasErrors = true;
    }
}

console.log('🌍 Verifying Multi-Market Global Readiness...');

for (const service of REQUIRED_SERVICES) {
  const fullPath = path.join(rootDir, service);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing critical market service: ${service}`);
    hasErrors = true;
  } else {
    // Basic syntax/content check could be added
    console.log(`✅ Found ${service}`);
  }
}

// Brand check
assertFileIncludes('services/marketConfigService.ts', "brandName: 'LARİ'", "Config must set brandName to LARİ");
assertFileDoesNotInclude('components/layouts/MarketingLayout.tsx', "RandevuLari", "MarketingLayout should not use RandevuLari");
assertFileDoesNotInclude('components/layouts/AdminLayout.tsx', "RandevuLari", "AdminLayout should not use RandevuLari");
assertFileDoesNotInclude('components/layouts/SuperAdminLayout.tsx', "RandevuLari", "SuperAdminLayout should not use RandevuLari");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "Randapp", "No Randapp public references");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "kart gerekmez", "No no-card copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "no card", "No no-card copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "7 gün", "No 7-day copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "7 day", "No 7-day copy");

// Ensure package.json scripts didn't break things
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (!packageJson.scripts['qa:all'].includes('qa:market-global')) {
    console.warn(`⚠️ Warning: qa:all does not include qa:market-global yet.`);
}

if (hasErrors) {
  console.error('\n❌ Global Market Readiness verification failed. See errors above.');
  process.exit(1);
} else {
  console.log('\n✅ Global Market Readiness infrastructure verified successfully.');
}
