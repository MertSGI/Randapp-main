import fs from 'fs';
import path from 'path';

console.log('--- Verifying Live Cutover Runbook ---');

let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return;
    }
    console.log(`✅ ${name} exists`);
}

checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_CUTOVER_EXECUTION_RUNBOOK.md'), 'Cutover Runbook');
checkFileExists(path.join(process.cwd(), 'docs', 'GO_NO_GO_LIVE_CHECKLIST.md'), 'Go/No-go Checklist');
checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_SMOKE_TEST_SCRIPT.md'), 'Live Smoke Test Script');
checkFileExists(path.join(process.cwd(), 'docs', 'PRE_LIVE_HARDENING_AND_CUTOVER_BLOCKERS.md'), 'Cutover Blockers');
checkFileExists(path.join(process.cwd(), 'docs', 'DATA_EXPORT_IMPORT_AND_MIGRATION_DRY_RUN.md'), 'Data Export Docs');

// Ensure no raw secrets remain in env example
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
    const envContent = fs.readFileSync(envExamplePath, 'utf8');
    if (envContent.includes('sk_test_') || envContent.includes('sk_live_') || envContent.match(/IYZICO_API_KEY=\w+/)) {
        console.error('❌ .env.example contains raw secrets or keys. Clean them out.');
        hasErrors = true;
    }
}

if (hasErrors) {
    console.error('\n❌ Live Cutover Runbook verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Live Cutover Runbook verification PASSED.');
}
