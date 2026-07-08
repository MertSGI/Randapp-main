import fs from 'fs';
import path from 'path';

console.log('--- Verifying Sales Demo Rehearsal Package ---');

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
            if (content.toLowerCase().includes(str.toLowerCase())) {
                console.error(`❌ ${name} contains forbidden string: "${str}"`);
                hasErrors = true;
            }
        });
    }
}

// 1. Check Rehearsal Pack Docs
checkFileExists(path.join(process.cwd(), 'docs', 'MANUAL_SALES_DEMO_REHEARSAL_CHECKLIST.md'), 'Manual Sales Demo Rehearsal Checklist');
checkFileExists(path.join(process.cwd(), 'docs', 'SALES_DEMO_OBJECTION_CHEAT_SHEET.md'), 'Sales Demo Objection Cheat Sheet');
checkFileExists(path.join(process.cwd(), 'docs', 'FIRST_DEMO_FEEDBACK_SCORECARD.md'), 'First Demo Feedback Scorecard');
checkFileExists(path.join(process.cwd(), 'docs', 'PILOT_DEMO_SCRIPT.md'), 'Pilot Demo Script');

// 2. Check Router Support in App.tsx
const appTsxPath = path.join(process.cwd(), 'App.tsx');
checkContent(appTsxPath, 'App.tsx', [
    '/pilot/customer',
    '/pilot/admin'
]);

// 3. Scan main pages for prohibited raw card input patterns or trial info
const registrationPagePath = path.join(process.cwd(), 'pages', 'RegistrationPage.tsx');
checkContent(registrationPagePath, 'RegistrationPage.tsx', [
    '14 gün'
], [
    'kart gerekmez',
    'kredi kartı gerekmez',
    '7 day',
    '7 gün'
]);

// Ensure no raw card fields is checked via general audits or in BookingPage / RegistrationPage
const bookingPagePath = path.join(process.cwd(), 'pages', 'BookingPage.tsx');
checkContent(bookingPagePath, 'BookingPage.tsx', null, [
    'cardNumber',
    'cardExpiry',
    'cardCvc',
    'kredi kartı gerekmez',
    'kart gerekmez',
    '7 gün',
    '7-day'
]);

if (hasErrors) {
    console.error('\n❌ Sales Demo Rehearsal Package verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Sales Demo Rehearsal Package verification PASSED successfully.');
}
