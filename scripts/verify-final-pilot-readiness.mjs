import fs from 'fs';
import path from 'path';

console.log('--- Verifying Final Pilot Readiness ---');

let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return;
    }
    console.log(`✅ ${name} exists`);
}

function checkContent(filepath, name, requiredStrings, forbiddenStrings) {
    if (!fs.existsSync(filepath)) return;
    const content = fs.readFileSync(filepath, 'utf8');
    
    if (requiredStrings) {
        requiredStrings.forEach(str => {
            if (!content.includes(str)) {
                console.error(`❌ ${name} is missing required string: "${str}"`);
                hasErrors = true;
            }
        });
    }

    if (forbiddenStrings) {
        forbiddenStrings.forEach(str => {
            if (content.includes(str)) {
                console.error(`❌ ${name} contains forbidden string: "${str}"`);
                hasErrors = true;
            }
        });
    }
}

// 1. Check Report Exists
checkFileExists(path.join(process.cwd(), 'docs', 'FINAL_REAL_PILOT_READINESS_REPORT.md'), 'Final Readiness Report');

// 2. Check App.tsx routing
const appTsxPath = path.join(process.cwd(), 'App.tsx');
checkContent(appTsxPath, 'App.tsx', [
    '<Route path="/pilot/customer" element={<BookingPage />} />',
    '<Route path="/demo" element={<DemoLandingPage />} />',
    '<Route path="/register" element={<RegistrationPage />} />',
    '<Route path="/super-admin/pilots" element={<SuperAdminPilotTrackerPage />} />'
]);

// 3. Check for forbidden words in RegistrationPage (No-card, 7-day etc. Should be 14-day and card required)
const registrationPagePath = path.join(process.cwd(), 'pages', 'RegistrationPage.tsx');
checkContent(registrationPagePath, 'RegistrationPage.tsx', [
    '14 gün'
], [
    'kart gerekmez',
    'kredi kartı gerekmez',
    '7 day',
    '7 günlük'
]);

if (hasErrors) {
    console.error('\n❌ Final Pilot Readiness verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Final Pilot Readiness verification PASSED.');
}
