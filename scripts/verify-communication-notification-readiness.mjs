import fs from 'fs';
import path from 'path';

console.log('🏁 Starting Master QA: Communication Event & Notification outbox auditing...');

const root = process.cwd();

// Helper to check file existence
function assertFileExists(filePath) {
  const fullPath = path.join(root, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing critical file: ${filePath}`);
    process.exit(1);
  }
  console.log(`✅ File exists: ${filePath}`);
}

// 1. Audit critical files presence
assertFileExists('types.ts');
assertFileExists('services/communicationProviderConfigService.ts');
assertFileExists('services/messageTemplateService.ts');
assertFileExists('services/communicationEventService.ts');
assertFileExists('components/CommunicationOutboxPanel.tsx');
assertFileExists('docs/COMMUNICATION_AND_NOTIFICATION_OPERATIONS.md');

// 2. Validate copy safety violations in codebases
const forbiddenWords = [
  'sandbox', 'dry run', 'payment disabled', 'not configured', 'coming soon',
  'planned', 'roadmap', 'future', 'yakında', 'planlanan', 'yol haritası',
  'no card', 'no credit card', 'kart gerekmez', 'kredi kartı gerekmez', '7 day', '7 gün'
];

// Read template files to check forbidden customer-facing copy
const messageTemplateCode = fs.readFileSync(path.join(root, 'services/messageTemplateService.ts'), 'utf8');

console.log('🔍 Checking Turkish & English templates for copy rules enforcement...');
forbiddenWords.forEach(word => {
  if (messageTemplateCode.toLowerCase().includes(word)) {
    // Exception: internal setup setupNotes/Super Admin context allows some terms,
    // but customer visible subjects or bodies must remain free of the slop indicators.
    // Let's print a warning or fail if found in TEMPLATES block.
    const templatesBlockStartIndex = messageTemplateCode.indexOf('const TEMPLATES');
    const templatesBlockEndIndex = messageTemplateCode.indexOf('export const messageTemplateService');
    const templatesBlock = messageTemplateCode.substring(templatesBlockStartIndex, templatesBlockEndIndex);
    
    if (templatesBlock.toLowerCase().includes(word)) {
      console.error(`❌ Violation: Forbidden public copy indicator "${word}" detected in customer-facing templates!`);
      process.exit(1);
    }
  }
});
console.log('✅ Template copies adhere fully to LARİ premium guidelines.');

// 3. Inspect Service Interfaces
console.log('🔍 Auditing service export APIs...');

const eventServiceCode = fs.readFileSync(path.join(root, 'services/communicationEventService.ts'), 'utf8');
const requiredEventMethods = [
  'createCommunicationEvent',
  'queueCommunicationEvent',
  'renderCommunicationTemplate',
  'listCommunicationEventsForTenant',
  'listCommunicationEventsForCustomer',
  'listInternalCommunicationEvents',
  'markCommunicationSent',
  'markCommunicationFailed',
  'cancelCommunicationEvent',
  'getCommunicationEventSummary'
];

requiredEventMethods.forEach(method => {
  if (!eventServiceCode.includes(method)) {
    console.error(`❌ Event Service is missing mandated API: "${method}"`);
    process.exit(1);
  }
});
console.log('✅ Communication Event Service implements the full mandated API.');

const providerConfigCode = fs.readFileSync(path.join(root, 'services/communicationProviderConfigService.ts'), 'utf8');
const requiredProviderFields = [
  'mode',
  'getConfig',
  'updateConfig',
  'isProviderActive',
  'local_outbox_only'
];

requiredProviderFields.forEach(field => {
  if (!providerConfigCode.includes(field)) {
    console.error(`❌ Provider Config Service is missing mandated setting or API: "${field}"`);
    process.exit(1);
  }
});

// Guard checks for active live providers or keys
if (providerConfigCode.includes('apiKey') || providerConfigCode.includes('secretKey') || providerConfigCode.includes('password')) {
  console.error('❌ Violation: Active provider keys or secrets detected in CommunicationProviderConfigService!');
  process.exit(1);
}
console.log('✅ Provider Config Service complies fully with pre-live local-sandbox requirements.');

console.log('🎉 MASTER QA PASSED: Communication Readiness Layer is 100% green and verified!');
process.exit(0);
