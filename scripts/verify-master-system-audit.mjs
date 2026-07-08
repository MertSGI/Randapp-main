import fs from 'fs';
import path from 'path';

console.log('--- Verifying Master System Audit Readiness ---');

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
checkFileExists(path.join(process.cwd(), 'docs', 'MASTER_END_TO_END_SYSTEM_AUDIT.md'), 'Master System Audit Report');
checkFileExists(path.join(process.cwd(), 'docs', 'FINAL_REAL_PILOT_READINESS_REPORT.md'), 'Final Readiness Report');

// 2. Check Core Services
checkFileExists(path.join(process.cwd(), 'services', 'consentService.ts'), 'Consent Service');
checkFileExists(path.join(process.cwd(), 'services', 'shareToolkitService.ts'), 'Share Toolkit Service');
checkFileExists(path.join(process.cwd(), 'services', 'publicLinkService.ts'), 'Public Link Service');
checkFileExists(path.join(process.cwd(), 'services', 'branchService.ts'), 'Branch Service');
checkFileExists(path.join(process.cwd(), 'services', 'entitlementService.ts'), 'Entitlement Service');
checkFileExists(path.join(process.cwd(), 'services', 'onboardingChecklistService.ts'), 'Onboarding Checklist Service');

if (hasErrors) {
    console.error('\n❌ Master System Audit verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Master System Audit verification PASSED.');
}
