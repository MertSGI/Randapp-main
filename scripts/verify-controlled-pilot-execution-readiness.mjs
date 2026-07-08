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

console.log('=== RUNNING CONTROLLED PILOT EXECUTION QA VERIFICATION ===\n');

// 1. Check existence of new playbook and operational documents
const requiredFiles = [
    'docs/CONTROLLED_FIRST_PILOT_EXECUTION_PLAYBOOK.md',
    'docs/FOUNDER_SALON_OUTREACH_MESSAGE_PACK.md',
    'docs/MANUAL_PILOT_COMMERCIAL_OPERATIONS_CHECKLIST.md',
    'docs/FIRST_7_DAY_PILOT_MONITORING_SCORECARD.md',
    'docs/FIRST_PILOT_ISSUE_TRIAGE_BOARD.md'
];

requiredFiles.forEach(doc => checkFileExists(doc));

// 2. Validate distinction between Unpaid, Paid Manual, and SaaS modes
checkFileContains('docs/CONTROLLED_FIRST_PILOT_EXECUTION_PLAYBOOK.md', [
    'ücretsiz',
    'ücretli',
    'Süper Admin',
    'Sınırları Dürüstçe Açıklama'
]);

// 3. Check for lawyer/accountant review requirement
checkFileContains('docs/MANUAL_PILOT_COMMERCIAL_OPERATIONS_CHECKLIST.md', [
    'Mali Müşavir',
    'Hukuk Danışmanı',
    'vergi',
    'fatura'
]);

// 4. Verify no false claims are made about live integrations in docs
checkFileDoesNotContain('docs/CONTROLLED_FIRST_PILOT_EXECUTION_PLAYBOOK.md', [
    'automatic recurring card billing',
    'live iyzico',
    'active custom DNS'
]);

checkFileDoesNotContain('docs/FOUNDER_SALON_OUTREACH_MESSAGE_PACK.md', [
    'mock',
    'sandbox',
    'dry run',
    'payment disabled',
    'not configured',
    'coming soon',
    'planned',
    'roadmap',
    'future',
    'yakında',
    'planlanan',
    'yol haritası',
    'no card',
    'no credit card',
    'kart gerekmez',
    'kredi kartı gerekmez',
    '7 day',
    '7 gün'
]);

// 5. Check branding consistency remains LARİ and randevulari.com
checkFileContains('docs/CONTROLLED_FIRST_PILOT_EXECUTION_PLAYBOOK.md', [
    'LARİ',
    'randevulari.com'
]);

checkFileContains('docs/FOUNDER_SALON_OUTREACH_MESSAGE_PACK.md', [
    'LARİ',
    'randevulari.com'
]);

// 6. Check that Super Admin page was updated and has elements
checkFileContains('pages/super-admin/SuperAdminPilotTrackerPage.tsx', [
    'First Live Pilot Execution Hub',
    'Güvenli Ödeme Uyarısı',
    'Contact potential salon using outreach pack'
]);

console.log('\n=== CONTROLLED PILOT EXECUTION QA COMPLETE ===');
if (failures > 0) {
    console.error(`\n[FAIL] Controlled pilot QA completed with ${failures} failure(s).`);
    process.exit(1);
} else {
    console.log('\n[SUCCESS] All controlled pilot execution assertions passed!');
    process.exit(0);
}
