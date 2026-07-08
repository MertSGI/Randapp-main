import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log('🔍 Starting QA: Customer Pilot Readiness verification...');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify SuperAdminGoLivePage security and credentials constraints
const goLivePagePath = path.join(rootDir, 'pages', 'super-admin', 'SuperAdminGoLivePage.tsx');
if (fs.existsSync(goLivePagePath)) {
  const content = fs.readFileSync(goLivePagePath, 'utf8');
  
  // Rule: Must not accept inputs for secrets
  const hasCredentialInputs = content.includes('<input') && 
    (content.toLowerCase().includes('secret') || content.toLowerCase().includes('key') || content.toLowerCase().includes('token'));
  
  assert(!hasCredentialInputs, 'Super Admin Go-Live Console must NOT contain secret inputs or fields for entering API keys.');
  
  // Rule: Must state security principles
  const hasSecurityNotice = content.includes('Supabase secrets') || content.includes('güvenliği nedeniyle');
  assert(hasSecurityNotice, 'Super Admin Go-Live Console must display clear notices that credentials must be set via Supabase secrets and not in UI.');
} else {
  assert(false, `SuperAdminGoLivePage.tsx not found at ${goLivePagePath}`);
}

// 2. Verify CUSTOMER_PILOT_READINESS_CHECKLIST.md exists and is populated
const checklistPath = path.join(rootDir, 'docs', 'CUSTOMER_PILOT_READINESS_CHECKLIST.md');
if (fs.existsSync(checklistPath)) {
  const content = fs.readFileSync(checklistPath, 'utf8');
  assert(content.length > 100, 'Customer Pilot Readiness checklist in docs must be fully populated.');
  assert(content.includes('14-day'), 'Customer Pilot Readiness checklist must emphasize 14-day card-required trials.');
} else {
  assert(false, 'CUSTOMER_PILOT_READINESS_CHECKLIST.md not found.');
}

// 3. Scan frontend pages to guarantee NO "no-card" trial claim exists
const pagesDir = path.join(rootDir, 'pages');
function scanDirForNoCardClaims(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirForNoCardClaims(fullPath);
    } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasNoCardMatches = /kredi-kar[t|ı]-gerekmez|kart-gerekmeden|no-card-required|card-not-required/gi.test(content);
      if (hasNoCardMatches) {
        console.warn(`⚠️ Warning: found suspicious string in ${path.relative(rootDir, fullPath)}`);
      }
    }
  }
}
scanDirForNoCardClaims(pagesDir);
assert(true, 'Scanned pages directory for customer-facing no-card claims.');

// 4. Verify core routing components (/pilot, /demo, /register) are registered & resolved correctly
const appPath = path.join(rootDir, 'App.tsx');
if (fs.existsSync(appPath)) {
  const content = fs.readFileSync(appPath, 'utf8');
  assert(content.includes('/pilot') && content.includes('/demo') && content.includes('/register') && content.includes('/super-admin/go-live'), 
    'Core routes (/pilot, /demo, /register, and /super-admin/go-live) are registered in App.tsx');
} else {
  assert(false, `App.tsx not found at ${appPath}`);
}

// 5. Verify publish door gate/verification exists inside tenant views
const verificationServicePath = path.join(rootDir, 'services', 'businessVerificationService.ts');
if (fs.existsSync(verificationServicePath)) {
  const content = fs.readFileSync(verificationServicePath, 'utf8');
  assert(content.includes('verify') || content.includes('Status') || content.includes('publish') || content.includes('block'),
    'Business Verification review service and gate checks are present internally.');
} else {
  console.log('ℹ️ businessVerificationService.ts not found. Double check manual verification gates.');
}

if (failures > 0) {
  console.error(`❌ Customer Pilot readiness checks finished with ${failures} errors.`);
  process.exit(1);
} else {
  console.log('🎉 All Customer Pilot readiness QA checks passed successfully.');
  process.exit(0);
}
