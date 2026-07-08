import fs from 'fs';
import path from 'path';

let failures = 0;

function checkFileExists(filePath) {
    if (fs.existsSync(filePath)) {
        console.log(`[PASS] File exists: ${filePath}`);
    } else {
        console.error(`[FAIL] File does not exist: ${filePath}`);
        failures++;
    }
}

function checkFileContains(filePath, substrings) {
    if (!fs.existsSync(filePath)) {
        console.error(`[FAIL] Cannot inspect missing file: ${filePath}`);
        failures++;
        return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    substrings.forEach(sub => {
        if (content.includes(sub)) {
            console.log(`[PASS] File [${filePath}] contains phrase: "${sub}"`);
        } else {
            console.error(`[FAIL] File [${filePath}] is missing phrase: "${sub}"`);
            failures++;
        }
    });
}

function checkFileDoesNotContain(filePath, substrings) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    substrings.forEach(sub => {
        if (content.includes(sub)) {
            console.error(`[FAIL] File [${filePath}] contains prohibited phrase: "${sub}"`);
            failures++;
        } else {
            console.log(`[PASS] File [${filePath}] does not contain prohibited phrase: "${sub}"`);
        }
    });
}

console.log('=== RUNNING LIVE READINESS SMOKE TEST VERIFICATION ===\n');

// 1. Verify existence of new documentation files
const requiredDocs = [
    'docs/LIVE_ROUTE_AND_CTA_SMOKE_TEST.md',
    'docs/BUTTON_AND_FLOW_SMOKE_TEST_CHECKLIST.md',
    'docs/VISUAL_AND_IMAGE_RELEVANCE_AUDIT.md',
    'docs/OFFLINE_PAYMENT_LAUNCH_READINESS.md',
    'docs/PILOT_LAUNCH_DECISION_GATE.md'
];

requiredDocs.forEach(doc => checkFileExists(doc));

// 2. Code check - App.tsx critical routes
checkFileContains('App.tsx', [
    'path="/pilot"',
    'path="/demo"',
    'path="/register"',
    'path="/login"',
    'path="/admin"',
    'path="/super-admin"',
    'path="/appointment/manage/:token"'
]);

// 3. Super Admin Menu and layout links
checkFileContains('components/layouts/SuperAdminLayout.tsx', [
    '/super-admin/scheduler',
    '/super-admin/observability',
    '/super-admin/legal',
    '/super-admin/pilots'
]);

// 4. Check that legal docs explicitly warning about professional lawyer review
checkFileContains('docs/LEGAL_REVIEW_CHECKLIST_BEFORE_PILOT.md', [
    'ÖNEMLİ HUKUKİ UYARI / DISCLAIMER',
    'profesyonel hukuki tavsiye (legal advice) niteliği taşımaz',
    'avukat'
]);

checkFileContains('docs/LEGAL_KVKK_AND_POLICY_OPERATIONS.md', [
    'ÖNEMLİ HUKUKİ UYARI / DISCLAIMER',
    'profesyonel hukuki tavsiye (legal advice) niteliği taşımaz',
    'avukat'
]);

checkFileContains('docs/POLICY_ACCEPTANCE_AND_CONSENT_LEDGER.md', [
    'ÖNEMLİ HUKUKİ UYARI / DISCLAIMER',
    'profesyonel hukuki tavsiye (legal advice) niteliği taşımaz',
    'avukat'
]);

checkFileContains('docs/DATA_RIGHTS_REQUEST_OPERATIONS.md', [
    'ÖNEMLİ HUKUKİ UYARI / DISCLAIMER',
    'profesyonel hukuki tavsiye (legal advice) niteliği taşımaz',
    'avukat'
]);

// 5. Check branding remains LARİ and randevulari.com
checkFileContains('services/marketConfigService.ts', [
    "brandName: 'LARİ'",
    "primaryDomain: 'randevulari.com'"
]);

// 6. Check payment run mode defaults to local_dry_run or does not claim live in code
checkFileContains('services/paymentRunModeService.ts', [
    "return 'local_dry_run';"
]);

// 7. Check communication provider default remains local_outbox_only
checkFileContains('services/communicationProviderConfigService.ts', [
    "VITE_COMMUNICATION_MODE as any) || 'local_outbox_only'"
]);

// 8. Prevent false claims about live integration/secrets in docs/code
checkFileDoesNotContain('services/paymentRunModeService.ts', [
    'pk_live_',
    'sk_live_'
]);

console.log('\n=== SMOKE TEST VERIFICATION COMPLETE ===');
if (failures > 0) {
    console.error(`\n[FAIL] Smoke tests completed with ${failures} failure(s).`);
    process.exit(1);
} else {
    console.log('\n[SUCCESS] All live readiness smoke test assertions passed!');
    process.exit(0);
}
