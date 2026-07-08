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

console.log('🔍 Starting QA: Sandbox Run Evidence Readiness...');

const cwd = process.cwd();

// 1. Files & Docs Check
const evidenceTemplate = path.join(cwd, 'docs', 'SANDBOX_RUN_EVIDENCE_TEMPLATE.md');
assert(fs.existsSync(evidenceTemplate), 'SANDBOX_RUN_EVIDENCE_TEMPLATE.md exists');

if (fs.existsSync(evidenceTemplate)) {
  const content = fs.readFileSync(evidenceTemplate, 'utf8');
  assert(content.includes('Run Metadata'), 'Evidence template includes Run Metadata');
  assert(content.includes('Checkout Evidence'), 'Evidence template includes Checkout Evidence');
  assert(content.includes('Backend Evidence'), 'Evidence template includes Backend Evidence');
  assert(content.includes('App State Evidence'), 'Evidence template includes App State Evidence');
  assert(content.includes('Negative Tests'), 'Evidence template includes Negative Tests');
  assert(content.includes('Final Result'), 'Evidence template includes Final Result');
}

const sandboxRunDoc = path.join(cwd, 'docs', 'FIRST_IYZICO_SANDBOX_RUN.md');
assert(fs.existsSync(sandboxRunDoc), 'FIRST_IYZICO_SANDBOX_RUN.md exists');

const edgeFuncCcs = path.join(cwd, 'supabase', 'functions', 'create-checkout-session', 'index.ts');
const edgeFuncPw = path.join(cwd, 'supabase', 'functions', 'payment-webhook', 'index.ts');
const edgeFuncSs = path.join(cwd, 'supabase', 'functions', 'subscription-sync', 'index.ts');

assert(fs.existsSync(edgeFuncCcs), 'create-checkout-session Edge Function exists');
assert(fs.existsSync(edgeFuncPw), 'payment-webhook Edge Function exists');
assert(fs.existsSync(edgeFuncSs), 'subscription-sync Edge Function exists');

// 2. Package scripts check
const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
assert(packageJson.scripts && packageJson.scripts['qa:first-sandbox-run'], 'First sandbox run QA script exists');

// 3. Forbidden wording check (no secrets, no no-card copy, etc.)
let hasForbiddenWords = false;
let hasRawCardFields = false;
let hasSecretInputFields = false;

const checkNoForbiddenWords = (dirPath) => {
  const forbiddenPatterns = [
    /no card required/i,
    /kart gerekmez/i,
    /7[- ]?g[üu]n/i,
    /7[- ]?day/i
  ];
  const ignoreFiles = ['MockDiagnosticTool.tsx', 'SuperAdmin']; 
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      checkNoForbiddenWords(fullPath);
    } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
      if (ignoreFiles.some(ignore => file.name.includes(ignore))) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      
      if (content.includes('IYZICO_API_KEY') || content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
         if (!content.includes('process.env') && !content.includes('.env') && !fullPath.includes('GoLive')) {
             console.error(`⚠️ Found possible secret reference in ${file.name}`);
             hasSecretInputFields = true;
         }
      }
      if (content.includes('placeholder="Card Number"') || content.includes('placeholder="Kart Numarası"')) {
         hasRawCardFields = true;
      }
      
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
            const lines = content.split('\n');
            const badLines = lines.filter(line => pattern.test(line) && !line.includes('eslint') && !line.includes('console.') && !line.includes('//') && line.includes('<') && line.includes('>') && !line.includes('import.meta.env'));
            if (badLines.length > 0) {
               console.error(`⚠️ Found forbidden word matching ${pattern} in ${file.name}: ${badLines[0].trim()}`);
               hasForbiddenWords = true;
            }
        }
      }
    }
  }
};

const pagesPath = path.join(cwd, 'pages');
const componentsPath = path.join(cwd, 'components');
if (fs.existsSync(pagesPath)) checkNoForbiddenWords(pagesPath);
if (fs.existsSync(componentsPath)) checkNoForbiddenWords(componentsPath);

assert(!hasForbiddenWords, 'No 7-day or no-card trial copy found in customer-facing files');
assert(!hasRawCardFields, 'No raw card inputs found');
assert(!hasSecretInputFields, 'No frontend secret exposure found');

// Optional evidence verification
const evidenceFile = process.env.SANDBOX_EVIDENCE_FILE;
if (evidenceFile && fs.existsSync(evidenceFile)) {
  const evContent = fs.readFileSync(evidenceFile, 'utf8');
  assert(evContent.includes('tenantId'), 'Evidence file contains tenantId');
  assert(evContent.includes('planId'), 'Evidence file contains planId');
  assert(/Result:\s*(PASS|FAIL)/i.test(evContent), 'Evidence file contains proper PASS/FAIL result');
}

if (failCount > 0) {
  console.log(`\n⚠️ QA complete with ${failCount} failures.`);
  process.exit(1);
} else {
  console.log('\n🎉 Sandbox Run Evidence QA verified successfully.');
  process.exit(0);
}
