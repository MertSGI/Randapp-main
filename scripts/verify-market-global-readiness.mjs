import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const REQUIRED_SERVICES = [
  'services/marketConfigService.ts',
  'services/currencyService.ts',
  'services/paymentProviderConfigService.ts',
  'services/adminFeatureAvailabilityService.ts',
  'services/geminiService.ts',
  'services/clinicAiAssistService.ts',
  'utils/healthTourismAiService.ts',
  'utils/countryHelper.ts',
  'utils/i18nLanguageConfig.ts',
  'supabase/functions/_shared/aiEdgePolicy.ts',
  'supabase/functions/_shared/clinicAiAssistProvider.ts',
  'supabase/functions/_shared/clinicAiEdgeHandlers.ts',
  'supabase/functions/clinic-ai-draft/index.ts',
  'supabase/functions/clinic-ai-transcribe/index.ts',
  'supabase/functions/ht-ai-chat/index.ts',
  'supabase/functions/ht-ai-chat/handler.ts',
  'supabase/functions/ht-ai-chat/provider-policy.ts',
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

console.log('🌍 Verifying Multi-Market Global Readiness & Fail-Closed AI Modules...');

for (const service of REQUIRED_SERVICES) {
  const fullPath = path.join(rootDir, service);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing critical market/AI file: ${service}`);
    hasErrors = true;
  } else {
    console.log(`✅ Found ${service}`);
  }
}

// Brand & marketing copy checks
assertFileIncludes('services/marketConfigService.ts', "brandName: 'LARİ'", "Config must set brandName to LARİ");
assertFileDoesNotInclude('components/layouts/MarketingLayout.tsx', "RandevuLari", "MarketingLayout should not use RandevuLari");
assertFileDoesNotInclude('components/layouts/AdminLayout.tsx', "RandevuLari", "AdminLayout should not use RandevuLari");
assertFileDoesNotInclude('components/layouts/SuperAdminLayout.tsx', "RandevuLari", "SuperAdminLayout should not use RandevuLari");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "Randapp", "No Randapp public references");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "kart gerekmez", "No no-card copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "no card", "No no-card copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "7 gün", "No 7-day copy");
assertFileDoesNotInclude('pages/MarketingHomePage.tsx', "7 day", "No 7-day copy");

// 3-tier feature classification & fail-closed AI invariants
assertFileIncludes('services/adminFeatureAvailabilityService.ts', 'LIVE_ACTIVE', 'Missing LIVE_ACTIVE tier');
assertFileIncludes('services/adminFeatureAvailabilityService.ts', 'LOCAL_OR_SANDBOX_ONLY', 'Missing LOCAL_OR_SANDBOX_ONLY tier');
assertFileIncludes('services/adminFeatureAvailabilityService.ts', 'DISABLED_EXTERNAL_HOLD', 'Missing DISABLED_EXTERNAL_HOLD tier');
assertFileDoesNotInclude('services/geminiService.ts', '@google/genai', 'geminiService must never bundle @google/genai');
assertFileDoesNotInclude('services/geminiService.ts', 'generativelanguage.googleapis.com', 'geminiService must never call Google Gemini API directly');
assertFileIncludes('supabase/functions/ai-quota-check/index.ts', 'handleAiEdgeScaffoldRequest', 'ai-quota-check must use fail-closed policy');
assertFileIncludes('supabase/functions/ai-recommendation/index.ts', 'handleAiEdgeScaffoldRequest', 'ai-recommendation must use fail-closed policy');
assertFileIncludes('supabase/functions/ai-visualization/index.ts', 'handleAiEdgeScaffoldRequest', 'ai-visualization must use fail-closed policy');
assertFileIncludes('supabase/functions/_shared/clinicAiEdgeHandlers.ts', 'CLINIC_AI_LIVE_ENABLED', 'clinic AI handlers must enforce CLINIC_AI_LIVE_ENABLED gate');
assertFileIncludes('supabase/functions/ht-ai-chat/handler.ts', 'HT_AI_CHAT_LIVE_ENABLED', 'ht-ai-chat handler must enforce HT_AI_CHAT_LIVE_ENABLED gate');
assertFileIncludes('supabase/functions/ht-ai-chat/handler.ts', 'resolveHtAiProviderConfig', 'ht-ai-chat handler must use explicit allowlisted provider resolution');

// Ensure package.json scripts didn't break things
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
if (!packageJson.scripts['qa:all'].includes('qa:market-global')) {
  console.warn(`⚠️ Warning: qa:all does not include qa:market-global yet.`);
}

if (hasErrors) {
  console.error('\n❌ Global Market Readiness static verification failed. See errors above.');
  process.exit(1);
}

// Run behavioral unit & policy suites via tsx (zero network calls)
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!fs.existsSync(tsxCli)) {
  console.error(`❌ Missing tsx CLI at ${tsxCli}`);
  process.exit(1);
}

const BEHAVIORAL_SUITES = [
  'services/marketConfigService.test.ts',
  'services/currencyService.test.ts',
  'services/adminFeatureAvailabilityService.test.ts',
  'services/geminiService.test.ts',
  'services/clinicAiAssistService.test.ts',
  'utils/healthTourismAiService.test.ts',
  'utils/countryHelper.test.ts',
  'scripts/verify-market-global-readiness.test.mjs',
];

console.log('\n🧪 Running Globalization & Fail-Closed AI Behavioral Unit Suites...');
for (const relSuite of BEHAVIORAL_SUITES) {
  const absSuite = path.join(rootDir, relSuite);
  if (!fs.existsSync(absSuite)) {
    console.error(`❌ Missing behavioral test suite: ${relSuite}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [tsxCli, absSuite], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`❌ Failed to execute ${relSuite}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`❌ Behavioral suite failed (${relSuite}) with exit code ${result.status}`);
    process.exit(1);
  }
}

console.log(`\n✅ Global Market Readiness & Fail-Closed AI verified (${BEHAVIORAL_SUITES.length}/${BEHAVIORAL_SUITES.length} suites PASS).`);
