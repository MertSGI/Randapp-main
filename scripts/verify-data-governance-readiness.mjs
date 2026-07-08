import fs from 'fs';
import path from 'path';

console.log('--- Verifying Data Governance & Privacy Readiness ---');

const SRC_DIR = path.join(process.cwd(), 'src');
const COMPONENTS_DIR = path.join(process.cwd(), 'components');
const SERVICES_DIR = path.join(process.cwd(), 'services');
const PAGES_DIR = path.join(process.cwd(), 'pages');
const TYPES_FILE = path.join(process.cwd(), 'types.ts');
let hasErrors = false;

function checkFileContains(filepath, keyword, requirementStr) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath}`);
        hasErrors = true;
        return;
    }
    const content = fs.readFileSync(filepath, 'utf8');
    if (!content.includes(keyword)) {
        console.error(`❌ ${filepath} is missing ${requirementStr} (keyword: ${keyword})`);
        hasErrors = true;
    } else {
        console.log(`✅ ${filepath} correctly implements ${requirementStr}`);
    }
}

// 1. Check types for Consent models
checkFileContains(TYPES_FILE, 'CustomerConsentFlags', 'Consent Data Model');
checkFileContains(TYPES_FILE, 'BusinessOwnerTermsAcceptance', 'Owner Terms Model');
checkFileContains(TYPES_FILE, 'CustomerDataRequest', 'Data Request Model');

// 2. Check Consent Service
const servicePath = path.join(SERVICES_DIR, 'consentService.ts');
if (fs.existsSync(servicePath)) {
    console.log('✅ consentService.ts exists');
} else {
    console.error('❌ consentService.ts missing');
    hasErrors = true;
}

// 3. Check Booking Flow
checkFileContains(path.join(PAGES_DIR, 'BookingPage.tsx'), 'consentService.captureBookingConsent', 'Booking Consent Capture logic');

// 4. Check Customer Memory
checkFileContains(path.join(COMPONENTS_DIR, 'CustomerMemoryTab.tsx'), 'limitMemory', 'Customer Memory Consent limitation wrapper');

// 5. Check Registration
checkFileContains(path.join(PAGES_DIR, 'RegistrationPage.tsx'), 'consentService.recordBusinessOwnerTermsAcceptance', 'Registration Terms saving');

// 6. Check Pages App Route
checkFileContains(path.join(process.cwd(), 'App.tsx'), 'PrivacyPage', 'Privacy Route');
checkFileContains(path.join(process.cwd(), 'App.tsx'), 'TermsPage', 'Terms Route');

if (hasErrors) {
    console.error('\n❌ Data Governance & Privacy readiness verification FAILED. Please review the missing pieces before pilot.');
    process.exit(1);
} else {
    console.log('\n🎉 Data Governance & Privacy readiness verification PASSED.');
}
