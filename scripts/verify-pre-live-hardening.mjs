import fs from 'fs';
import path from 'path';

console.log('--- Verifying Pre-Live Hardening ---');

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

// 1. Files
checkFileExists(path.join(process.cwd(), 'docs', 'PRE_LIVE_HARDENING_AND_CUTOVER_BLOCKERS.md'), 'Cutover Blockers Report');
checkFileExists(path.join(process.cwd(), 'docs', 'MASTER_END_TO_END_SYSTEM_AUDIT.md'), 'Master Audit');
checkFileExists(path.join(process.cwd(), 'docs', 'FINAL_REAL_PILOT_READINESS_REPORT.md'), 'Final Pilot Readiness');

// 2. Env check
const envExamplePath = path.join(process.cwd(), '.env.example');
checkContent(envExamplePath, '.env.example', [
    'VITE_DATA_MODE',
    'VITE_PAYMENT_RUN_MODE'
], [
    'sk_test',
    'sk_live'
]);

if (hasErrors) {
    console.error('\n❌ Pre-Live Hardening verification FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 Pre-Live Hardening verification PASSED.');
}
