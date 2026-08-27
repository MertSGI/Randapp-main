import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractSourceChannel, extractReferringAgencyId, hasInvalidAgencyReferral, isValidUuid } from '../utils/sourceAttributionHelper.ts';
import { HT_TRANSLATIONS, getHtTranslation } from '../utils/healthTourismTranslations.ts';
import { getLocalizedCountries, isValidIsoCountryCode } from '../utils/countryHelper.ts';

console.log('=== LARİ Health Tourism Slice 2 Public Intake Hardened QA Suite ===\n');

const projectRoot = process.cwd();

// 1. Language Dictionaries Completeness & Key Parity across 5 Languages
console.log('1. Verifying 5-Language Dictionary Key Parity (TR, EN, DE, RU, AR)...');
const languages = ['tr', 'en', 'de', 'ru', 'ar'];
const trKeys = Object.keys(HT_TRANSLATIONS.tr).sort();
assert.equal(trKeys.length > 50, true, 'Translation dictionary should contain at least 50 keys');

for (const lang of languages) {
  const dict = getHtTranslation(lang);
  assert.ok(dict, `Dictionary for ${lang} must exist`);
  const keys = Object.keys(dict).sort();
  assert.deepEqual(keys, trKeys, `Key mismatch in language dictionary for '${lang}'`);
}
console.log('   ✓ All 5 languages (TR, EN, DE, RU, AR) have exact key parity (', trKeys.length, 'keys verified)\n');

// 2. Canonical Business Profile Service Method & Type Usage
console.log('2. Verifying Business Profile Service Contract...');
const landingPagePath = path.join(projectRoot, 'pages', 'health-tourism', 'HealthTourismLandingPage.tsx');
const landingPageContent = fs.readFileSync(landingPagePath, 'utf8');

assert.equal(/\bPublicBusinessProfile\b/.test(landingPageContent), false, 'Must NOT import nonexistent PublicBusinessProfile');
assert.equal(landingPageContent.includes('getPublicProfile('), false, 'Must NOT call nonexistent getPublicProfile');
assert.equal(landingPageContent.includes('businessProfileService.getPublicBusinessProfile('), true, 'Must call canonical businessProfileService.getPublicBusinessProfile');
assert.equal(landingPageContent.includes('SalonBusinessProfile'), true, 'Must import canonical SalonBusinessProfile type');
console.log('   ✓ Business Profile Service contract verified (uses getPublicBusinessProfile & SalonBusinessProfile)\n');

// 3. Translation Key Reference Verification
console.log('3. Verifying Absence of Obsolete Translation Keys...');
const formPath = path.join(projectRoot, 'components', 'health-tourism', 'HealthTourismIntakeForm.tsx');
const formContent = fs.readFileSync(formPath, 'utf8');

const obsoleteKeys = ['t.step1Title', 't.step2Title', 't.step3Title', 't.step4Title'];
for (const obsoleteKey of obsoleteKeys) {
  assert.equal(landingPageContent.includes(obsoleteKey), false, `Landing page must not reference obsolete key ${obsoleteKey}`);
  assert.equal(formContent.includes(obsoleteKey), false, `Intake form must not reference obsolete key ${obsoleteKey}`);
}
console.log('   ✓ Zero obsolete translation key references found\n');

// 4. Zero Mixed-Language Customer UI Literals Check
console.log('4. Verifying Zero Mixed-Language Hardcoded UI Copy...');
const forbiddenLiterals = ['İleri →', '← Geri', 'Telefon:', 'Ana Sayfa'];
for (const literal of forbiddenLiterals) {
  assert.equal(landingPageContent.includes(`"${literal}"`) || landingPageContent.includes(`'${literal}'`), false, `Landing page must not contain hardcoded '${literal}'`);
  assert.equal(formContent.includes(`"${literal}"`) || formContent.includes(`'${literal}'`), false, `Intake form must not contain hardcoded '${literal}'`);
}
console.log('   ✓ Zero hardcoded mixed-language customer UI literals in TSX components\n');

// 5. ISO Country Code Invariant & Localized Names
console.log('5. Verifying ISO Country Code Contract & Localized DisplayNames...');
for (const lang of languages) {
  const options = getLocalizedCountries(lang);
  assert.ok(options.length > 20, 'Localized country list should contain options');
  for (const opt of options) {
    assert.equal(isValidIsoCountryCode(opt.code), true, `Country code '${opt.code}' must satisfy ISO alpha-2 regex ^[A-Z]{2}$`);
    assert.notEqual(opt.code, 'OTHER', "Country code must NOT be 'OTHER'");
  }
}
assert.equal(isValidIsoCountryCode(null), true, 'null country code is valid unselected');
assert.equal(isValidIsoCountryCode('OTHER'), false, "'OTHER' is not a valid ISO country code");
console.log('   ✓ Country selection strictly uses ISO alpha-2 codes (^[A-Z]{2}$) or null\n');

// 6. Source Attribution & Agency Referral Logic (Browser & Hash Router)
console.log('6. Verifying Source Attribution & Hash/Browser Router Query Logic...');
const validUuid = '123e4567-e89b-12d3-a456-426614174000';
const invalidUuid = 'not-a-valid-uuid';

// Agency referral valid
assert.equal(extractSourceChannel(`https://example.com/health-tourism?agency=${validUuid}`), 'agency_referral');
assert.equal(extractSourceChannel(`https://example.com/#/health-tourism/clinic-slug?agency=${validUuid}`), 'agency_referral');
assert.equal(extractReferringAgencyId(`agency=${validUuid}`), validUuid);
assert.equal(hasInvalidAgencyReferral(`agency=${validUuid}`), false);

// Invalid agency referral handling
assert.equal(extractReferringAgencyId(`agency=${invalidUuid}`), null);
assert.equal(hasInvalidAgencyReferral(`agency=${invalidUuid}`), true);

// Channel mappings
assert.equal(extractSourceChannel('https://example.com/health-tourism?gclid=12345'), 'paid_search');
assert.equal(extractSourceChannel('https://example.com/health-tourism?utm_source=facebook'), 'social');
assert.equal(extractSourceChannel('https://example.com/health-tourism?utm_medium=organic'), 'organic');
assert.equal(extractSourceChannel('https://example.com/health-tourism', 'https://www.google.com/'), 'organic');
assert.equal(extractSourceChannel('https://example.com/health-tourism'), 'direct');
console.log('   ✓ Source attribution & malformed agency detection verified across Hash & Browser router queries\n');

// 7. Passport Privacy & Feature Flag Invariant
console.log('7. Verifying Passport Privacy & Feature Flag Invariant...');
const passportEnv = process.env.VITE_HT_PASSPORT_INTAKE_ENABLED;
assert.equal(passportEnv !== 'true', true, 'VITE_HT_PASSPORT_INTAKE_ENABLED must default to OFF/false');
assert.equal(formContent.includes('localStorage.setItem') && formContent.includes('passport'), false, 'Must not save passport to localStorage');
assert.equal(formContent.includes('sessionStorage.setItem') && formContent.includes('passport'), false, 'Must not save passport to sessionStorage');
console.log('   ✓ Passport intake default-OFF and zero local/session storage verified\n');

// 8. Direct DB DML Avoidance & RPC Isolation
console.log('8. Verifying RPC Authority & Direct Table Access Avoidance...');
assert.equal(formContent.includes(".from('ht_leads')"), false, 'Intake form component must NOT call supabase.from("ht_leads") directly');
assert.equal(landingPageContent.includes(".from('ht_leads')"), false, 'Landing page component must NOT call supabase.from("ht_leads") directly');
assert.equal(formContent.includes('HealthTourismService'), true, 'Intake form must use HealthTourismService abstraction');
console.log('   ✓ Direct Supabase DML avoided in public UI (uses HealthTourismService RPC authority only)\n');

// 9. Routing Reservation Verification
console.log('9. Verifying Route Reservation Invariants...');
const tenantServicePath = path.join(projectRoot, 'services', 'tenantService.ts');
const tenantServiceContent = fs.readFileSync(tenantServicePath, 'utf8');
assert.equal(tenantServiceContent.includes("'health-tourism'"), true, 'tenantService must reserve health-tourism route');

const appPath = path.join(projectRoot, 'App.tsx');
const appContent = fs.readFileSync(appPath, 'utf8');
assert.equal(appContent.includes('/health-tourism'), true, 'App.tsx must include /health-tourism route');
assert.equal(appContent.includes('/health-tourism/:tenantSlug'), true, 'App.tsx must include /health-tourism/:tenantSlug route');
console.log('   ✓ Route reservation in tenantService and App.tsx verified\n');

// 10. Localized Error Safety
console.log('10. Verifying Localized Public Error Safety...');
assert.equal(formContent.includes('result.message || t.submitErrorGeneric'), false, 'Form must not leak raw RPC English result.message to public UI');
assert.equal(formContent.includes('setSubmitError(t.submitErrorGeneric)'), true, 'Form must display localized t.submitErrorGeneric on submit error');
console.log('   ✓ Public submit error localization verified (raw DB errors strictly suppressed)\n');

// 11. R3 mechanical assertions: Custom Domain Authority, Gating, Projection, SEO Cleanup, Accessibility & Copy Accuracy
console.log('11. Verifying R3 Corrective Requirements (Custom Domain Authority, Active/Publication Gate, Projection, SEO Cleanup, Accessibility, Country Set, Copy)...');

// A. Custom Domain Resolver
assert.equal(landingPageContent.includes('resolveTenantFromHost(window.location.hostname)'), true, 'Landing page must use resolveTenantFromHost for host authority when routeSlug is absent');
assert.equal(landingPageContent.includes('tenantService.getCurrentTenant()'), false, 'Public HT Landing page must NOT call getCurrentTenant()');

// B & C. Active & Publication Gate
assert.equal(landingPageContent.includes("activeTenant.status === 'active'"), true, 'Landing page must check status === active');
assert.equal(landingPageContent.includes("activeTenant.publicSiteStatus === 'published'"), true, 'Landing page must check publicSiteStatus === published when available');

// D. Projection
assert.equal(tenantServiceContent.includes('verificationStatus: tenant.verification_status'), true, 'tenantService must map verificationStatus');
assert.equal(tenantServiceContent.includes('publicSiteStatus: tenant.public_site_status'), true, 'tenantService must map publicSiteStatus');
assert.equal(tenantServiceContent.includes('businessRiskStatus: tenant.business_risk_status'), true, 'tenantService must map businessRiskStatus');
assert.equal(tenantServiceContent.includes('isPublished: tenant.is_published'), true, 'tenantService must map isPublished');
assert.equal(tenantServiceContent.includes('customDomain: tenant.custom_domain'), true, 'tenantService must map customDomain');

// E. SEO Cleanup
assert.equal(landingPageContent.includes('createdMetaDesc && metaDesc && metaDesc.parentNode'), true, 'Landing page must remove created meta description element on cleanup');
assert.equal(landingPageContent.includes('metaDesc.setAttribute(\'content\', prevMetaDescContent)'), true, 'Landing page must restore previous meta description on cleanup');

// F. Accessibility
assert.equal(formContent.includes('aria-invalid'), true, 'Intake form must contain aria-invalid');
assert.equal(formContent.includes('aria-describedby'), true, 'Intake form must contain aria-describedby');
assert.equal(formContent.includes('FULL_NAME_REQUIRED'), true, 'Intake form must contain FULL_NAME_REQUIRED error ID');
assert.equal(formContent.includes('CONTACT_METHOD_REQUIRED'), true, 'Intake form must contain CONTACT_METHOD_REQUIRED error ID');
assert.equal(formContent.includes('INVALID_COUNTRY'), true, 'Intake form must contain INVALID_COUNTRY error ID');

// G. Country Validation Set
assert.equal(isValidIsoCountryCode('DE'), true, 'DE must pass ISO validation');
assert.equal(isValidIsoCountryCode('TR'), true, 'TR must pass ISO validation');
assert.equal(isValidIsoCountryCode('US'), true, 'US must pass ISO validation');
assert.equal(isValidIsoCountryCode('ZZ'), false, 'ZZ must fail ISO validation');
assert.equal(isValidIsoCountryCode('OTHER'), false, 'OTHER must fail ISO validation');
assert.equal(isValidIsoCountryCode('ABC'), false, 'ABC must fail ISO validation');
assert.equal(isValidIsoCountryCode(null), true, 'null must pass ISO validation');

// H. Security Claim Copy Accuracy
const allDictsJson = JSON.stringify(HT_TRANSLATIONS);
const unverifiedTerms = ['secure form', 'safely submit', 'securely stored', 'güvenli form', 'güvenle gönder'];
let termCount = 0;
for (const term of unverifiedTerms) {
  if (allDictsJson.toLowerCase().includes(term.toLowerCase())) {
    termCount++;
  }
}
assert.equal(termCount, 0, 'Customer-facing HT dictionaries must contain zero prohibited unverified security terms');

// I. R4 Localization & Customer Literal Strictness
assert.equal(formContent.includes('Invalid country selection.'), false, 'Form must NOT contain hardcoded "Invalid country selection." string');
assert.equal(formContent.includes('{t.invalidCountryErr}'), true, 'Form INVALID_COUNTRY element must render {t.invalidCountryErr}');
assert.equal(formContent.includes('setValidationError(t.invalidCountryErr)'), true, 'Form handleSubmit must set t.invalidCountryErr on invalid country');

for (const lang of languages) {
  const dict = getHtTranslation(lang);
  assert.ok(dict.invalidCountryErr, `Dictionary for '${lang}' must contain invalidCountryErr key`);
  assert.ok(dict.invalidCountryErr.length > 5, `invalidCountryErr for '${lang}' must be a non-empty localized sentence`);
}

console.log('   ✓ R4 corrective requirements verified cleanly (invalidCountryErr in all 5 dicts, zero hardcoded English literals in TSX)\n');

console.log('========================================================================');
console.log('ALL SLICE 2 HEALTH TOURISM HARDENED QA CHECKS PASSED CLEANLY (11/11)');
console.log('========================================================================');
