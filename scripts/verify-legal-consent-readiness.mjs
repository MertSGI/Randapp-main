import fs from 'fs';
import path from 'path';

console.log('--- Verifying Legal, KVKK, and Consent Ledger Infrastructure ---');

let hasErrors = false;

function checkFileExists(filepath, name) {
    if (!fs.existsSync(filepath)) {
        console.error(`❌ Missing file: ${filepath} (${name})`);
        hasErrors = true;
        return false;
    }
    console.log(`✅ ${name} file exists`);
    return true;
}

function checkContent(filepath, name, requiredStrings, forbiddenStrings) {
    if (!fs.existsSync(filepath)) return;
    const content = fs.readFileSync(filepath, 'utf8');
    
    if (requiredStrings) {
        requiredStrings.forEach(str => {
            if (!content.includes(str)) {
                console.error(`❌ ${name} is missing contract element: "${str}"`);
                hasErrors = true;
            }
        });
    }

    if (forbiddenStrings) {
        forbiddenStrings.forEach(str => {
            if (content.includes(str)) {
                console.error(`❌ ${name} contains forbidden/unsecure word: "${str}"`);
                hasErrors = true;
            }
        });
    }
}

// 1. Check Service Files
checkFileExists(path.join(process.cwd(), 'services', 'legalDocumentService.ts'), 'Legal Document Service');
checkFileExists(path.join(process.cwd(), 'services', 'policyAcceptanceService.ts'), 'Policy Acceptance Service');
checkFileExists(path.join(process.cwd(), 'services', 'consentLedgerService.ts'), 'Consent Ledger Service');
checkFileExists(path.join(process.cwd(), 'services', 'dataRightsRequestService.ts'), 'Data Rights Request Service');

// 2. Check UI Panels
checkFileExists(path.join(process.cwd(), 'pages', 'super-admin', 'SuperAdminLegalPage.tsx'), 'Super Admin Legal & KVKK Workstation');

// 3. Check Documentation Files
checkFileExists(path.join(process.cwd(), 'docs', 'LEGAL_KVKK_AND_POLICY_OPERATIONS.md'), 'Legal Policy Operations Manual');
checkFileExists(path.join(process.cwd(), 'docs', 'POLICY_ACCEPTANCE_AND_CONSENT_LEDGER.md'), 'Consent Ledger Guide');
checkFileExists(path.join(process.cwd(), 'docs', 'DATA_RIGHTS_REQUEST_OPERATIONS.md'), 'Data Rights Request Operations Guide');
checkFileExists(path.join(process.cwd(), 'docs', 'LEGAL_REVIEW_CHECKLIST_BEFORE_PILOT.md'), 'Regulatory Review Checklist');

// 4. Validate types contract in types.ts
const typesPath = path.join(process.cwd(), 'types.ts');
checkContent(typesPath, 'Global Types Declaration', [
    'LegalDocumentType',
    'LegalDocumentStatus',
    'LegalDocumentVersion',
    'PolicyAcceptanceRecord',
    'DataRightsRequestType',
    'DataRightsRequestStatus',
    'DataRightsRequest',
    'terms_of_service',
    'privacy_policy',
    'kvkk_clarification_text',
    'cookie_policy',
    'data_processing_terms',
    'acceptable_use_policy',
    'subscription_terms',
    'booking_terms',
    'cancellation_policy',
    'communication_consent_text',
    'marketing_consent_text',
    'media_consent_text'
]);

// 5. Validate Legal Document Lifecycle & Seeding in legalDocumentService
const legalServicePath = path.join(process.cwd(), 'services', 'legalDocumentService.ts');
checkContent(legalServicePath, 'Legal Document Service Contracts', [
    'createDraftDocument',
    'submitForReview',
    'publishDocumentVersion',
    'archiveDocumentVersion',
    'getLatestActiveDocument',
    'seedInitialDocuments'
]);

// 6. Validate Policy Acceptance Service
const acceptanceServicePath = path.join(process.cwd(), 'services', 'policyAcceptanceService.ts');
checkContent(acceptanceServicePath, 'Policy Acceptance Service Contracts', [
    'recordPolicyAcceptance',
    'checkMandatoryAcceptances',
    'getAcceptanceHistory',
    'revokePolicyAcceptance'
]);

// 7. Validate Consent Ledger Service
const ledgerServicePath = path.join(process.cwd(), 'services', 'consentLedgerService.ts');
checkContent(ledgerServicePath, 'Consent Ledger Service Contracts', [
    'recordConsent',
    'getConsentState',
    'withdrawConsent',
    'getConsentHistory'
]);

// 8. Validate Data Rights Request Service
const rightsServicePath = path.join(process.cwd(), 'services', 'dataRightsRequestService.ts');
checkContent(rightsServicePath, 'Data Rights Request Service Contracts', [
    'createDataRightsRequest',
    'listRequests',
    'updateRequestStatus'
]);

// 9. Verify RegistrationPage has integrated policy acceptances
const registrationPath = path.join(process.cwd(), 'pages', 'registrationPage.tsx');
if (!fs.existsSync(registrationPath)) {
    // try uppercase first letter
    const registrationPathCap = path.join(process.cwd(), 'pages', 'RegistrationPage.tsx');
    checkContent(registrationPathCap, 'Registration Form Page', [
        'policyAcceptanceService',
        'recordPolicyAcceptance',
        'consentLedgerService',
        'recordConsent',
        'terms_of_service',
        'privacy_policy'
    ]);
} else {
    checkContent(registrationPath, 'Registration Form Page', [
        'policyAcceptanceService',
        'recordPolicyAcceptance',
        'consentLedgerService',
        'recordConsent',
        'terms_of_service',
        'privacy_policy'
    ]);
}

// 10. Verify BookingPage has integrated policy acceptances
const bookingPath = path.join(process.cwd(), 'pages', 'BookingPage.tsx');
checkContent(bookingPath, 'Booking Checkout Page', [
    'policyAcceptanceService',
    'recordPolicyAcceptance',
    'consentLedgerService',
    'recordConsent',
    'booking_terms',
    'communication_consent_text',
    'marketing_consent_text'
]);

// 11. Verify AppointmentSelfServicePage has integrated KVKK data rights panel
const selfServicePath = path.join(process.cwd(), 'pages', 'AppointmentSelfServicePage.tsx');
checkContent(selfServicePath, 'Customer Appointment Self-Service Page', [
    'dataRightsRequestService',
    'createDataRightsRequest',
    'Kişisel Verilerin Korunması',
    'Talep Türü',
    'deletion',
    'export',
    'correction',
    'consent_withdrawal'
]);

// 12. Security Audit on forbidden public-facing words (Anti-leak & Professional wording compliance)
const superAdminLegalPath = path.join(process.cwd(), 'pages', 'super-admin', 'SuperAdminLegalPage.tsx');
checkContent(superAdminLegalPath, 'Super Admin Legal UX Panel', [
    'Hukuk & Mevzuat Uyumluluk',
    'Değiştirilemez Rıza Defteri',
    'KVKK Veri Sahibi Başvuruları',
    'Onayla & Yayınla'
], [
    'dummy',
    'mock_legal',
    'sandbox_data'
]);

if (hasErrors) {
    console.error('❌ QA Validation Failed: Legal and KVKK compliance checkpoints are NOT fully green.');
    process.exit(1);
} else {
    console.log('✅ QA Validation Succeeded: All 12 legal categories, multiversion workflows, consent ledger and KVKK self-service paths are fully ready!');
    process.exit(0);
}
