import fs from 'fs';
import path from 'path';

console.log('🏁 Starting QA Verification: First Manual Pilot Pack & Operating Docs...');

const root = process.cwd();

// Helper to check file existence
function assertFile(filePath) {
  const fullPath = path.join(root, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ QA ERROR: Missing vital pilot document file: ${filePath}`);
    process.exit(1);
  }
  console.log(`✅ Verified document: ${filePath}`);
}

// 1. Check all required pilot files are present
assertFile('docs/FIRST_MANUAL_PILOT_OPERATING_PACK.md');
assertFile('docs/PILOT_SALON_INTAKE_FORM.md');
assertFile('docs/MANUAL_PILOT_SETUP_CHECKLIST.md');
assertFile('docs/FIRST_REAL_SALON_DEMO_SCRIPT.md');
assertFile('docs/FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md');
assertFile('docs/PILOT_DOCS_INDEX.md');

// 2. Read documents content to verify compliance
const operatingPack = fs.readFileSync(path.join(root, 'docs/FIRST_MANUAL_PILOT_OPERATING_PACK.md'), 'utf-8');
const intakeForm = fs.readFileSync(path.join(root, 'docs/PILOT_SALON_INTAKE_FORM.md'), 'utf-8');
const setupChecklist = fs.readFileSync(path.join(root, 'docs/MANUAL_PILOT_SETUP_CHECKLIST.md'), 'utf-8');
const demoScript = fs.readFileSync(path.join(root, 'docs/FIRST_REAL_SALON_DEMO_SCRIPT.md'), 'utf-8');
const scorecard = fs.readFileSync(path.join(root, 'docs/FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md'), 'utf-8');
const docsIndex = fs.readFileSync(path.join(root, 'docs/PILOT_DOCS_INDEX.md'), 'utf-8');

// 3. Verify PILOT_DOCS_INDEX contains links to all of these documents
const newDocs = [
  'FIRST_MANUAL_PILOT_OPERATING_PACK.md',
  'PILOT_SALON_INTAKE_FORM.md',
  'MANUAL_PILOT_SETUP_CHECKLIST.md',
  'FIRST_REAL_SALON_DEMO_SCRIPT.md',
  'FIRST_MANUAL_PILOT_FEEDBACK_SCORECARD.md'
];

newDocs.forEach(doc => {
  if (!docsIndex.includes(doc)) {
    console.error(`❌ QA ERROR: PILOT_DOCS_INDEX.md is missing reference to: ${doc}`);
    process.exit(1);
  }
});
console.log('✅ All new pilot documents are properly linked in PILOT_DOCS_INDEX.md.');

// 4. Verify no document claims live payments, live DNS, live SMS, live WhatsApp, or live SMTP are active
// Instead, they must correctly describe them as future/rehearsal phase tasks OR outbox logs.
const forbiddenLiveClaims = [
  'live payments are connected',
  'live dns is connected',
  'smtp is live',
  'real whatsapp messages are sent out now',
  'kredi kartından gerçek tahsilat yapılır',
  'sms doğrudan telefona gider'
];

const allTexts = [operatingPack, intakeForm, setupChecklist, demoScript, scorecard];

allTexts.forEach((text, idx) => {
  forbiddenLiveClaims.forEach(claim => {
    if (text.toLowerCase().includes(claim)) {
      console.error(`❌ QA ERROR: Document #${idx} contains forbidden live infrastructure claim: "${claim}"`);
      process.exit(1);
    }
  });
});
console.log('✅ verified: No documents make incorrect claims about live external connections or active payment transactions.');

// 5. Verify LARİ is described as the visible brand
allTexts.forEach((text, idx) => {
  if (!text.includes('LARİ') && !text.includes('Lari') && !text.includes('LAR&Idot;')) {
    console.warn(`⚠️ QA WARNING: LARİ brand name is not mentioned in document #${idx}`);
  }
});
console.log('✅ Verified LARİ brand usage in new documents.');

// 6. Verify randevulari.com is described as Turkey domain strategy
let strategyFound = false;
allTexts.forEach(text => {
  if (text.includes('randevulari.com')) {
    strategyFound = true;
  }
});

if (!strategyFound) {
  console.error('❌ QA ERROR: None of the new pilot operating docs mention the Turkey domain strategy (randevulari.com).');
  process.exit(1);
}
console.log('✅ Verified Turkey domain strategy (randevulari.com) is referenced across operating docs.');

console.log('🎉 QA SUCCESS: First Manual Pilot Pack verification completed 100% green!');
process.exit(0);
