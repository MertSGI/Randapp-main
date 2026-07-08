import fs from 'fs';
import path from 'path';

console.log('--- Verifying Live Operations Documentation ---');

let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return;
    }
    console.log(`✅ ${name} exists`);
}

function checkContent(filepath, name, forbiddenStrings) {
    if (!fs.existsSync(filepath)) return;
    const content = fs.readFileSync(filepath, 'utf8');
    
    if (forbiddenStrings) {
        forbiddenStrings.forEach(str => {
            if (content.toLowerCase().includes(str.toLowerCase())) {
                console.error(`❌ ${name} contains forbidden string or real generic secret: "${str}"`);
                hasErrors = true;
            }
        });
    }
}

// 1. Check Required Operations Docs
checkFileExists(path.join(process.cwd(), 'docs', 'LARI_LIVE_DEPLOYMENT_OPERATIONS_GUIDE.md'), 'LARI_LIVE_DEPLOYMENT_OPERATIONS_GUIDE.md');
checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_DEPLOYMENT_COMMAND_CHECKLIST.md'), 'LIVE_DEPLOYMENT_COMMAND_CHECKLIST.md');
checkFileExists(path.join(process.cwd(), 'docs', 'ENVIRONMENT_MODE_MATRIX.md'), 'ENVIRONMENT_MODE_MATRIX.md');
checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_RISK_REGISTER.md'), 'LIVE_RISK_REGISTER.md');
checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_CUTOVER_EXECUTION_RUNBOOK.md'), 'LIVE_CUTOVER_EXECUTION_RUNBOOK.md');
checkFileExists(path.join(process.cwd(), 'docs', 'GO_NO_GO_LIVE_CHECKLIST.md'), 'GO_NO_GO_LIVE_CHECKLIST.md');
checkFileExists(path.join(process.cwd(), 'docs', 'LIVE_SMOKE_TEST_SCRIPT.md'), 'LIVE_SMOKE_TEST_SCRIPT.md');
checkFileExists(path.join(process.cwd(), 'docs', 'PRE_LIVE_HARDENING_AND_CUTOVER_BLOCKERS.md'), 'PRE_LIVE_HARDENING_AND_CUTOVER_BLOCKERS.md');

// 2. Scan for raw card, 7-day trials or forbidden test patterns across the code base or doc
const registrationPagePath = path.join(process.cwd(), 'pages', 'RegistrationPage.tsx');
checkContent(registrationPagePath, 'RegistrationPage.tsx', [
    'kart gerekmez',
    'kredi kartı gerekmez',
    '7 day',
    '7 gün'
]);

const bookingPagePath = path.join(process.cwd(), 'pages', 'BookingPage.tsx');
checkContent(bookingPagePath, 'BookingPage.tsx', [
    'cardNumber',
    'cardExpiry',
    'cardCvc',
    'kredi kartı gerekmez',
    'kart gerekmez'
]);

// 3. Ensure no real or obviously fake non-placeholder keys are used directly without <> wrapping if they represent keys.
const cmdChecklistPath = path.join(process.cwd(), 'docs', 'LIVE_DEPLOYMENT_COMMAND_CHECKLIST.md');
checkContent(cmdChecklistPath, 'LIVE_DEPLOYMENT_COMMAND_CHECKLIST.md', [
    'sk_test_', // standard test secret patterns shouldn't be plain text without placeholder
    'pk_test_',
    'AIzaSy' // google typical api key start
]);

if (hasErrors) {
    console.error('\n❌ Live Operations Documentation verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Live Operations Documentation verification PASSED successfully.');
}
