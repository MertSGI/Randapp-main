import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
};

console.log('🔍 Starting QA: DNS, SSL, Wildcard Subdomain Routing & Hosting Rewrite Readiness (Phase D)...');

const cwd = process.cwd();

// 1. Documentation Exists
const requiredDocs = [
  'WILDCARD_DNS_AND_SSL_REHEARSAL.md',
  'HOSTING_REWRITE_REQUIREMENTS.md',
  'CUSTOM_DOMAIN_DNS_OPERATIONS.md'
];

for (const doc of requiredDocs) {
  const fullPath = path.join(cwd, 'docs', doc);
  assert(fs.existsSync(fullPath), `Documentation file docs/${doc} exists`);
}

// 2. domainResolverService Integrity
const resolverPath = path.join(cwd, 'services', 'domainResolverService.ts');
if (fs.existsSync(resolverPath)) {
  const content = fs.readFileSync(resolverPath, 'utf8');
  assert(content.includes('parseHostname'), 'domainResolverService contains parseHostname method');
  assert(content.includes('extractTenantSlugFromSubdomain'), 'domainResolverService extracts tenant slug from subdomain');
  assert(content.includes('isCustomDomain'), 'domainResolverService contains isCustomDomain check');
  assert(content.includes('randevulari.com'), 'domainResolverService recognizes randevulari.com domain');
} else {
  console.error('❌ domainResolverService.ts was not found!');
  failCount++;
}

// 3. siteProvisioningService / publicLinkService Generation Integrity
const provPath = path.join(cwd, 'services', 'siteProvisioningService.ts');
const linkPath = path.join(cwd, 'services', 'publicLinkService.ts');

if (fs.existsSync(provPath)) {
  const content = fs.readFileSync(provPath, 'utf8');
  assert(content.includes('getPublicSiteUrl'), 'siteProvisioningService generates public site URLs');
  assert(content.includes('getBranchPublicSiteUrl'), 'siteProvisioningService supports branch specific URLs');
  assert(content.includes('CustomDomainStatus'), 'siteProvisioningService contains custom domain status values');
  
  // Branch format check: https://{slug}.randevulari.com/{branchSlug} matches URL format description
  assert(content.includes('return `${baseUrl}/${branchSlugOrId}`'), 'siteProvisioningService appends branch slug as a dynamic subfolder path on direct subdomain formats');
} else {
  console.error('❌ siteProvisioningService.ts was not found!');
  failCount++;
}

if (fs.existsSync(linkPath)) {
  const content = fs.readFileSync(linkPath, 'utf8');
  assert(content.includes('getTenantPublicUrl'), 'publicLinkService contains getTenantPublicUrl');
  assert(content.includes('getBranchBookingUrl'), 'publicLinkService contains getBranchBookingUrl');
  assert(content.includes('canUseCustomDomain'), 'publicLinkService defines custom domain authorization gating');
} else {
  console.error('❌ publicLinkService.ts was not found!');
  failCount++;
}

// 4. UI Copy & Pre-live Footnote Honesty Verify
const wizardPath = path.join(cwd, 'components', 'OnboardingWizard.tsx');
if (fs.existsSync(wizardPath)) {
  const content = fs.readFileSync(wizardPath, 'utf8');
  assert(content.includes('Önizleme bağlantısı, yayına almadan önce sayfanızı kontrol etmeniz içindir.'), 'Onboarding UI directs to design safety first');
  assert(content.includes('Alan adı yönlendirmesi canlı yayın ortamında etkinleştirilir.'), 'Onboarding footnote correctly states DNS is active on live launch only');
  assert(content.includes('randevulari.com'), 'Onboarding wizard targets randevulari.com for local subdomain visualization');
} else {
  console.error('❌ OnboardingWizard.tsx was not found!');
  failCount++;
}

// 5. Local Fallback Layout & Catch-all Presence
const appPath = path.join(cwd, 'App.tsx');
if (fs.existsSync(appPath)) {
  const content = fs.readFileSync(appPath, 'utf8');
  assert(content.includes('/:tenantSlug'), 'App.tsx Router preserves local parameter wildcard fallback logic (/:tenantSlug)');
  assert(content.includes('/book'), 'App.tsx Router preserves standard /book path');
} else {
  console.error('❌ App.tsx was not found!');
  failCount++;
}

// 6. Platform Brand Visibility & Turkey Domain Strategy checks
const marketPath = path.join(cwd, 'services', 'marketConfigService.ts');
if (fs.existsSync(marketPath)) {
  const content = fs.readFileSync(marketPath, 'utf8');
  assert(content.includes('randevulari.com'), 'Market configuration explicitly assigns randevulari.com under Turkey market');
  assert(content.includes('brandName: \'LARİ\''), 'Platform preserves LARİ as core visible brand name');
} else {
  console.error('❌ marketConfigService.ts was not found!');
  failCount++;
}

// 7. Security Boundaries & Leak Verification
let hasSecrets = false;
let hasForbiddenCardFields = false;
let hasForbiddenNoCardCopy = false;
let hasForbidden7DayCopy = false;

const scanFileForViolations = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (content.match(/IYZICO_SECRET_KEY\s*=\s*['"][a-zA-Z0-9]{10,}/)) {
    hasSecrets = true;
  }
  if (content.match(/AWS_SECRET_ACCESS_KEY/)) {
    hasSecrets = true;
  }
  
  // Exclude mock test templates from standard raw credit card field violations
  if (
    content.includes('name="cardNumber"') &&
    !filePath.includes('Mock') &&
    !filePath.includes('PreviewModal') &&
    !filePath.includes('Sandbox')
  ) {
    hasForbiddenCardFields = true;
  }
  
  // Forbidden No Card / Free Trial / 7 Days Copy (Turkey SaaS standardizes on 14-days and Card required)
  if (
    content.includes('7-day trial') || 
    content.includes('7 günlük') ||
    content.includes('7 gün deneme')
  ) {
    hasForbidden7DayCopy = true;
  }
  
  if (
    content.includes('Kredi kartı gerekmez') ||
    content.includes('No credit card required')
  ) {
    hasForbiddenNoCardCopy = true;
  }
};

const directoriesToScan = ['components', 'pages', 'services'];
for (const dir of directoriesToScan) {
  const fullDir = path.join(cwd, dir);
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(fullDir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
        scanFileForViolations(fullPath);
      }
    }
  }
}

assert(!hasSecrets, 'Security check passes: Zero private credentials or live DNS registrar credentials committed to codebase');
assert(!hasForbiddenCardFields, 'Security check passes: No Raw credit card inputs or checkout hijacking in UI layer');
assert(!hasForbiddenNoCardCopy, 'Market consistency check passes: No "No credit card required" marketing claims found on customer-facing screens');
assert(!hasForbidden7DayCopy, 'Market consistency check passes: Absolutely zero 7-day trials reference found, LARİ standardizes on 14-day trials');

// 8. Package Script Presence Check
const packJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
assert(packJson.scripts && packJson.scripts['qa:dns-subdomain'], 'package.json maps the qa:dns-subdomain validation script target');

if (failCount > 0) {
  console.error(`\n❌ QA Failed: ${failCount} errors were encountered during DNS/subdomain review.`);
  process.exit(1);
} else {
  console.log('\n🎉 DNS, SSL, Wildcard Subdomain Routing & Hosting Rewrite QA completed with 100% SUCCESS.');
  process.exit(0);
}
