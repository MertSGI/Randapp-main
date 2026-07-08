import fs from 'fs';
import path from 'path';

console.log('--- Verifying Pilot Onboarding & Sales Enablement Readiness ---');

const DOCS_DIR = path.join(process.cwd(), 'docs');
const SERVICES_DIR = path.join(process.cwd(), 'services');
let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return;
    }
    console.log(`✅ ${name} exists`);
}

// 1. Check services
checkFileExists(path.join(SERVICES_DIR, 'pilotCustomerOnboardingService.ts'), 'pilotCustomerOnboardingService');

// 2. Check documentation / enablement assets
checkFileExists(path.join(DOCS_DIR, 'PILOT_CUSTOMER_INTAKE_FORM.md'), 'Intake Form');
checkFileExists(path.join(DOCS_DIR, 'FIRST_SALES_DEMO_SCRIPT.md'), 'Sales Demo Script');
checkFileExists(path.join(DOCS_DIR, 'PILOT_ONBOARDING_CALL_SCRIPT.md'), 'Onboarding Call Script');
checkFileExists(path.join(DOCS_DIR, 'FIRST_WEEK_FOLLOW_UP_SCRIPT.md'), 'First Week Follow-Up Script');
checkFileExists(path.join(DOCS_DIR, 'SUPPORT_RESPONSE_TEMPLATES.md'), 'Support Templates');

// 3. Check App.tsx for Super Admin Pilot Route
const appTsx = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf-8');
if(appTsx.includes('SuperAdminPilotTrackerPage')) {
    console.log('✅ Super Admin Pilot Tracker Route Exists');
} else {
    console.error('❌ Super Admin Pilot Tracker Route Missing');
    hasErrors = true;
}

if (hasErrors) {
    console.error('\n❌ Pilot Onboarding readiness verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Pilot Onboarding readiness verification PASSED.');
}
