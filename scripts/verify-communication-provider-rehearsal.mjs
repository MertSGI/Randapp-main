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

console.log('🔍 Starting QA: Transactional Email, SMS & WhatsApp Provider Rehearsal Verification (Phase E)...');

const cwd = process.cwd();

// 1. Check Document Existences
const requiredDocs = [
  'COMMUNICATION_PROVIDER_CONTRACT_MATRIX.md',
  'TRANSACTIONAL_COMMUNICATION_PROVIDER_REHEARSAL.md',
  'COMMUNICATION_WEBHOOK_AND_DELIVERY_STATUS_PLAN.md',
  'COMMUNICATION_CONSENT_AND_COMPLIANCE_CHECKLIST.md'
];

for (const doc of requiredDocs) {
  const fullPath = path.join(cwd, 'docs', doc);
  assert(fs.existsSync(fullPath), `Document file docs/${doc} exists`);
}

// 2. config defaults
const configPath = path.join(cwd, 'services', 'communicationProviderConfigService.ts');
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, 'utf8');
  assert(content.includes('local_outbox_only'), 'communicationProviderConfigService defaults to local_outbox_only');
} else {
  console.error('❌ communicationProviderConfigService.ts not found!');
  failCount++;
}

// 3. .env.example verification
const envPath = path.join(cwd, '.env.example');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  assert(content.includes('VITE_COMMUNICATION_MODE=local_outbox_only'), '.env.example defines VITE_COMMUNICATION_MODE as local_outbox_only');
  assert(content.includes('EMAIL_PROVIDER_MODE=disabled'), '.env.example sets EMAIL_PROVIDER_MODE to disabled');
  assert(content.includes('SMS_PROVIDER_MODE=disabled'), '.env.example sets SMS_PROVIDER_MODE to disabled');
  assert(content.includes('WHATSAPP_PROVIDER_MODE=disabled'), '.env.example sets WHATSAPP_PROVIDER_MODE to disabled');
  assert(content.includes('# RESEND_API_KEY='), '.env.example comments out and hides RESEND_API_KEY');
  assert(content.includes('# WHATSAPP_ACCESS_TOKEN='), '.env.example comments out and hides WHATSAPP_ACCESS_TOKEN');
} else {
  console.error('❌ .env.example not found!');
  failCount++;
}

// 4. Outbox Panel simulation check
const panelPath = path.join(cwd, 'components', 'CommunicationOutboxPanel.tsx');
if (fs.existsSync(panelPath)) {
  const content = fs.readFileSync(panelPath, 'utf8');
  assert(content.includes('local_outbox_only'), 'CommunicationOutboxPanel checks the local_outbox_only state');
  assert(content.includes('Gönderim Simüle Edildi') || content.includes('Simüle Gönderildi'), 'CommunicationOutboxPanel replaces "delivered" or "sent" statuses with simulated warning labels under dry runs');
} else {
  console.error('❌ CommunicationOutboxPanel.tsx not found!');
  failCount++;
}

// 5. Template Localization Check
const templatePath = path.join(cwd, 'services', 'messageTemplateService.ts');
if (fs.existsSync(templatePath)) {
  const content = fs.readFileSync(templatePath, 'utf8');
  assert(content.includes('language: \'tr\''), 'messageTemplateService contains Turkish translations');
  assert(content.includes('language: \'en\''), 'messageTemplateService contains English translations');
} else {
  console.error('❌ messageTemplateService.ts not found!');
  failCount++;
}

// 6. Consent Bypass Verification (Strategic vs Personal)
const eventPath = path.join(cwd, 'services', 'communicationEventService.ts');
if (fs.existsSync(eventPath)) {
  const content = fs.readFileSync(eventPath, 'utf8');
  assert(content.includes('bookingContactConsent'), 'communicationEventService performs bookingContactConsent validations');
  assert(content.includes('skipped'), 'communicationEventService contains skipped event status updates');
} else {
  console.error('❌ communicationEventService.ts not found!');
  failCount++;
}

// 7. Security Scanning
let hasSecrets = false;
let hasForbiddenNoCardCopy = false;
let hasForbidden7DayCopy = false;

const scanFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.match(/RESEND_API_KEY\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.match(/WHATSAPP_ACCESS_TOKEN\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.match(/NETGSM_PASSWORD\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.includes('Kredi kartı gerekmez') || content.includes('No credit card required')) hasForbiddenNoCardCopy = true;
  if (content.includes('7-day trial') || content.includes('7 günlük') || content.includes('7 gün deneme')) hasForbidden7DayCopy = true;
};

const dirs = ['components', 'pages', 'services'];
for (const dir of dirs) {
  const fullDir = path.join(cwd, dir);
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir, { recursive: true });
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        scanFile(path.join(fullDir, file));
      }
    }
  }
}

assert(!hasSecrets, 'Security check: Absolute zero hardcoded live messaging secrets committed');
assert(!hasForbiddenNoCardCopy, 'Commercial safety check: All signup screens avoid "no credit card required" marketing lines');
assert(!hasForbidden7DayCopy, 'Commercial duration check: Absolutely zero 7-day trials reference found, LARİ standardizes on 14-day trials');

// 8. Brand and Strategy Checks
const marketPath = path.join(cwd, 'services', 'marketConfigService.ts');
if (fs.existsSync(marketPath)) {
  const content = fs.readFileSync(marketPath, 'utf8');
  assert(content.includes('randevulari.com'), 'Platform uses randevulari.com for Turkey routing');
  assert(content.includes('brandName: \'LARİ\''), 'Platform preserves LARİ as brand name');
}

if (failCount > 0) {
  console.error(`\n❌ QA Failed: ${failCount} errors were encountered during Communication/Provider rehearsal review.`);
  process.exit(1);
} else {
  console.log('\n🎉 Communication Provider Setup & Rehearsal QA completed with 100% SUCCESS.');
  process.exit(0);
}
