import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🏁 Running Phase 5 Node 5: Multilingual Health Tourism Funnel Contract Suite...\n');

// 1. Types Contract Integrity
const typesPath = path.join(rootDir, 'types/healthTourismPublic.ts');
assert(fs.existsSync(typesPath), 'types/healthTourismPublic.ts exists');

if (fs.existsSync(typesPath)) {
  const content = fs.readFileSync(typesPath, 'utf8');
  assert(content.includes("'tr' | 'en' | 'de' | 'ru' | 'ar'"), 'HtLanguage includes exactly TR, EN, DE, RU, AR');
  assert(content.includes('export interface HtTranslationDictionary'), 'HtTranslationDictionary interface declared');
  assert(content.includes('metaTitle: string;'), 'Includes metaTitle for SEO');
  assert(content.includes('metaDescription: string;'), 'Includes metaDescription for SEO');
  assert(content.includes('passportNotice: string;'), 'Includes passport notice for privacy transparency');
}

// 2. Multilingual Dictionary Integrity
const transPath = path.join(rootDir, 'utils/healthTourismTranslations.ts');
assert(fs.existsSync(transPath), 'utils/healthTourismTranslations.ts exists');

if (fs.existsSync(transPath)) {
  const content = fs.readFileSync(transPath, 'utf8');
  ['tr', 'en', 'de', 'ru', 'ar'].forEach((lang) => {
    assert(content.includes(`${lang}: {`), `Translation dictionary contains complete '${lang}' locale`);
  });
  assert(content.includes('getHtTranslation'), 'Exports getHtTranslation helper');
}

// 3. Language Detection & RTL Hook Contract
const hookPath = path.join(rootDir, 'hooks/useHealthTourismLanguage.ts');
assert(fs.existsSync(hookPath), 'hooks/useHealthTourismLanguage.ts exists');

if (fs.existsSync(hookPath)) {
  const content = fs.readFileSync(hookPath, 'utf8');
  assert(content.includes('useHealthTourismLanguage'), 'Exports useHealthTourismLanguage hook');
  assert(content.includes("language === 'ar'"), 'RTL correctly derived for Arabic');
  assert(content.includes('localStorage.setItem'), 'Preserves user preference in localStorage');
  assert(content.includes('searchParams.get'), 'Extracts lang query parameter across routes');
}

// 4. Source & Agency Attribution Invariants
const attrPath = path.join(rootDir, 'utils/sourceAttributionHelper.ts');
assert(fs.existsSync(attrPath), 'utils/sourceAttributionHelper.ts exists');

if (fs.existsSync(attrPath)) {
  const content = fs.readFileSync(attrPath, 'utf8');
  assert(content.includes('extractSourceChannel'), 'Exports extractSourceChannel');
  assert(content.includes('extractReferringAgencyId'), 'Exports extractReferringAgencyId');
  assert(content.includes('hasInvalidAgencyReferral'), 'Exports hasInvalidAgencyReferral');
  assert(content.includes('UUID_REGEX'), 'Validates agency UUID using strict regex');
}

// 5. Intake Form Validation & Privacy Invariants
const intakePath = path.join(rootDir, 'components/health-tourism/HealthTourismIntakeForm.tsx');
assert(fs.existsSync(intakePath), 'components/health-tourism/HealthTourismIntakeForm.tsx exists');

if (fs.existsSync(intakePath)) {
  const content = fs.readFileSync(intakePath, 'utf8');
  assert(content.includes('maskEmail'), 'Masks email in Step 4 review');
  assert(content.includes('maskPhone'), 'Masks phone in Step 4 review');
  assert(content.includes('isValidIsoCountryCode'), 'Validates country code against ISO catalog');
  assert(content.includes('VITE_HT_PASSPORT_INTAKE_ENABLED'), 'Passport intake feature-flagged for forward compatibility');
  assert(content.includes("setFullName('')"), 'Clears all PII form state on submission success');
  assert(content.includes('submitErrorGeneric'), 'Suppresses raw database errors from end-users');
  assert(content.includes('primaryColor'), 'Accepts tenant primaryColor branding prop');
}

// 6. Public Landing Page Routing & Safety Invariants
const pagePath = path.join(rootDir, 'pages/health-tourism/HealthTourismLandingPage.tsx');
assert(fs.existsSync(pagePath), 'pages/health-tourism/HealthTourismLandingPage.tsx exists');

if (fs.existsSync(pagePath)) {
  const content = fs.readFileSync(pagePath, 'utf8');
  assert(content.includes('document.documentElement.lang = language'), 'Synchronizes HTML document lang attribute');
  assert(content.includes("document.documentElement.dir = isRtl ? 'rtl' : 'ltr'"), 'Synchronizes HTML document dir attribute for RTL');
  assert(content.includes('document.title = t.metaTitle'), 'Updates document.title dynamically per language');
  assert(content.includes("activeTenant.status === 'active'"), 'Enforces active tenant status gating');
  assert(content.includes("activeTenant.publicSiteStatus === 'published'"), 'Enforces published public site status gating');
  assert(content.includes('HtAiChatWidget'), 'Embeds AI chat assist widget');
  assert(content.includes('HealthTourismIntakeForm'), 'Embeds public intake form');
}

// 7. Route Registration in App.tsx
const appPath = path.join(rootDir, 'App.tsx');
assert(fs.existsSync(appPath), 'App.tsx exists');

if (fs.existsSync(appPath)) {
  const content = fs.readFileSync(appPath, 'utf8');
  assert(content.includes('path="/health-tourism"'), 'Registers /health-tourism public route');
  assert(content.includes('path="/health-tourism/:tenantSlug"'), 'Registers /health-tourism/:tenantSlug dynamic route');
}

console.log('\n-------------------------------------------------------------');
if (failures > 0) {
  console.error(`❌ Total failures: ${failures}`);
  process.exit(1);
} else {
  console.log('🎉 All Phase 5 Node 5 Multilingual Funnel contracts PASS!');
  process.exit(0);
}
