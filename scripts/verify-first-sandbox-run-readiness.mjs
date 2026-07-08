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

console.log('🔍 Starting QA: First Sandbox Run Readiness...');

const cwd = process.cwd();

// 1. Files & Docs Check
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
assert(packageJson.scripts && packageJson.scripts['qa:payment-run-modes'], 'Payment run modes QA script exists');

// 3. Env variables check
const envExample = fs.readFileSync(path.join(cwd, '.env.example'), 'utf8');
assert(envExample.includes('VITE_PAYMENT_RUN_MODE='), '.env.example includes VITE_PAYMENT_RUN_MODE');

// 4. Forbidden wording check (no secrets, no no-card copy, etc.)
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
      
      // Basic checks for secrets in frontend
      if (content.includes('IYZICO_API_KEY') || content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
         if (!content.includes('process.env') && !content.includes('.env') && !fullPath.includes('GoLive')) {
             console.error(`⚠️ Found possible secret reference in ${file.name}`);
             hasSecretInputFields = true;
         }
      }
      // Raw card fields check
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

if (failCount > 0) {
  console.log(`\n⚠️ QA complete with ${failCount} failures.`);
  process.exit(1);
} else {
  console.log('\n🎉 First Sandbox Run Readiness QA verified successfully.');
  process.exit(0);
}
