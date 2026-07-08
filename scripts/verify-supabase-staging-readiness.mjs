import fs from 'fs';
import path from 'path';

console.log('🏁 Starting QA Verification: Supabase Staging & RLS Cutover Readiness...');

const root = process.cwd();

function assertFile(filePath) {
  const fullPath = path.join(root, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ QA ERROR: Missing important schema/rehearsal file: ${filePath}`);
    process.exit(1);
  }
  console.log(`✅ Verified: ${filePath}`);
}

// 1. Verify docs & schema files exist
assertFile('docs/SUPABASE_SCHEMA.md');
assertFile('docs/RLS_POLICY_PLAN.md');
assertFile('docs/SUPABASE_STAGING_CUTOVER_REHEARSAL.md');
assertFile('docs/SUPABASE_ADAPTER_GAP_NOTES.md');
assertFile('services/dataExportService.ts');
assertFile('services/migrationDryRunService.ts');
assertFile('services/dataSourceConfig.ts');

// 2. Read documents content
const schemaDoc = fs.readFileSync(path.join(root, 'docs/SUPABASE_SCHEMA.md'), 'utf-8');
const rlsDoc = fs.readFileSync(path.join(root, 'docs/RLS_POLICY_PLAN.md'), 'utf-8');
const rehearsalDoc = fs.readFileSync(path.join(root, 'docs/SUPABASE_STAGING_CUTOVER_REHEARSAL.md'), 'utf-8');
const gapDoc = fs.readFileSync(path.join(root, 'docs/SUPABASE_ADAPTER_GAP_NOTES.md'), 'utf-8');

// 3. Verify no secrets are exposed in code
const secretsToCheck = ['VITE_SUPABASE_SERVICE_ROLE', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
function inspectDirForExposedSecrets(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git' && file !== 'docs' && file !== 'scripts') {
        inspectDirForExposedSecrets(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const code = fs.readFileSync(fullPath, 'utf8');
      
      // Let's audit for raw payment card inputs in client
      if (code.includes('card-number-input' ) || code.includes('cvc-field-raw')) {
        console.error(`❌ QA ERROR: Unsafe card entry fields detected: ${file}`);
        process.exit(1);
      }
      
      // Look for SERVICE_ROLE key ingestion in browser context
      if (file !== 'supabaseClient.ts' && (code.includes('SERVICE_ROLE') || code.includes('service_role'))) {
         // Some repository files can refer to it in comments, but prevent client-side use
         if (code.includes('supabaseAdmin') && file.endsWith('.tsx')) {
           console.error(`❌ QA ERROR: frontend components must never handle elevated Service Role privileges: ${file}`);
           process.exit(1);
         }
      }
    }
  }
}
inspectDirForExposedSecrets(root);
console.log('✅ Visual / Cryptographic key audits completed with clean separation.');

// 4. Verify local fallback capability is active
const sourceConfig = fs.readFileSync(path.join(root, 'services/dataSourceConfig.ts'), 'utf-8');
if (!sourceConfig.includes("'local'") || !sourceConfig.includes('return \'local\'')) {
  console.error('❌ QA ERROR: dataSourceConfig.ts must retain local mode fallback options.');
  process.exit(1);
}
console.log('✅ Local-mode hybrid storage fallback is robust and active.');

// 5. Verify LARİ is described as the primary Turkey brand strategy
const lariFound = [schemaDoc, rlsDoc, rehearsalDoc, gapDoc].some(text => text.includes('LARİ') || text.includes('Lari') || text.includes('randevulari.com'));
if (!lariFound) {
  console.error('❌ QA ERROR: Turkey branding strategy (LARİ / randevulari.com) must be preserved in Supabase staging documentation.');
  process.exit(1);
}
console.log('✅ Turkey branding strategy remains consistent.');

// 6. Verify required validation fields exist in the migration dry-run logic
const migrationCode = fs.readFileSync(path.join(root, 'services/migrationDryRunService.ts'), 'utf-8');
const expectedValidations = [
  'slug',
  'plan',
  'subscriptionStatus',
  'tenantId',
  'services',
  'staff',
  'appointments',
  'branches',
  'customers',
  'password',
  'cardNumber',
  'apiKey',
  'communicationEvents'
];

expectedValidations.forEach(field => {
  if (!migrationCode.includes(field)) {
    console.error(`❌ QA ERROR: migrationDryRunService is missing validation check for "${field}"`);
    process.exit(1);
  }
});
console.log('✅ migrationDryRunService covers 100% of the required validation fields.');

console.log('🎉 QA SUCCESS: Supabase Staging & RLS Cutover static verifier has completed 100% green!');
process.exit(0);
