import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const UI_PAGE_PATH = path.resolve(ROOT_DIR, 'pages', 'super-admin', 'SuperAdminLegalPage.tsx');

// Ensure localStorage and window mocks are present for node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    localStorage: globalThis.localStorage
  };
}

function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  }
}

function setSupabaseMode() {
  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://fake-staging.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'fake-anon-key-for-test'
  });
}

function setLocalMode() {
  setTestEnv({
    VITE_DATA_MODE: 'local',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: ''
  });
}

// Start with local mode for import time
setLocalMode();

// Dynamically import services using tsx loader
const { legalDocumentService } = await import('../services/legalDocumentService.ts');
const { policyAcceptanceService } = await import('../services/policyAcceptanceService.ts');
const { consentLedgerService } = await import('../services/consentLedgerService.ts');
const { dataRightsRequestService } = await import('../services/dataRightsRequestService.ts');

test('1. Supabase Mode: createLegalDocumentVersion throws LEGAL_SERVER_WRITE_NOT_CONFIGURED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      legalDocumentService.createLegalDocumentVersion({
        type: 'terms_of_service',
        version: '2.0-TEST',
        locale: 'tr',
        title: 'Test Terms',
        summary: 'Summary',
        content: 'Content',
        requiresAcceptance: true
      });
    },
    (err) => err.message.includes('LEGAL_SERVER_WRITE_NOT_CONFIGURED')
  );
});

test('2. Supabase Mode: archiveLegalDocumentVersion throws LEGAL_SERVER_WRITE_NOT_CONFIGURED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      legalDocumentService.archiveLegalDocumentVersion('doc-any-id');
    },
    (err) => err.message.includes('LEGAL_SERVER_WRITE_NOT_CONFIGURED')
  );
});

test('3. Supabase Mode: markLegalDocumentReviewRequired throws LEGAL_SERVER_WRITE_NOT_CONFIGURED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      legalDocumentService.markLegalDocumentReviewRequired('doc-any-id');
    },
    (err) => err.message.includes('LEGAL_SERVER_WRITE_NOT_CONFIGURED')
  );
});

test('4. Supabase Mode: publishLegalDocumentVersion throws LEGAL_SERVER_WRITE_NOT_CONFIGURED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      legalDocumentService.publishLegalDocumentVersion('doc-any-id', 'Avukat Test');
    },
    (err) => err.message.includes('LEGAL_SERVER_WRITE_NOT_CONFIGURED')
  );
});

test('5. Supabase Mode: getLegalReadinessSummary returns UNAVAILABLE_PENDING_SERVER_API and false compliance', () => {
  setSupabaseMode();
  const summary = legalDocumentService.getLegalReadinessSummary();
  assert.equal(summary.readinessStatus, 'UNAVAILABLE_PENDING_SERVER_API');
  assert.equal(summary.lawyerReviewApproved, false);
  assert.equal(summary.serverVerificationRequired, true);
  assert.equal(summary.complianceFinalized, false);
});

test('6. Supabase Mode: policyAcceptanceService.revokePolicyAcceptance throws LEGAL_PERSISTENCE_REQUIRED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      policyAcceptanceService.revokePolicyAcceptance('rec-any-id', 'Test revoke');
    },
    (err) => err.message.includes('LEGAL_PERSISTENCE_REQUIRED')
  );
});

test('7. Supabase Mode: consentLedgerService.withdrawConsent throws LEGAL_PERSISTENCE_REQUIRED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      consentLedgerService.withdrawConsent('actor-123', 'marketing', 'Test reason');
    },
    (err) => err.message.includes('LEGAL_PERSISTENCE_REQUIRED')
  );
});

test('8. Supabase Mode: dataRightsRequestService.updateDataRightsRequestStatus throws LEGAL_PERSISTENCE_REQUIRED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      dataRightsRequestService.updateDataRightsRequestStatus('req-123', 'completed', 'Notes');
    },
    (err) => err.message.includes('LEGAL_PERSISTENCE_REQUIRED')
  );
});

test('9. Supabase Mode: dataRightsRequestService.linkToSupportTicket throws LEGAL_PERSISTENCE_REQUIRED', () => {
  setSupabaseMode();
  assert.throws(
    () => {
      dataRightsRequestService.linkToSupportTicket('req-123', 'ticket-456');
    },
    (err) => err.message.includes('LEGAL_PERSISTENCE_REQUIRED')
  );
});

test('10. Local Mode: createLegalDocumentVersion and archiving succeed in pre-live demo', () => {
  setLocalMode();
  const created = legalDocumentService.createLegalDocumentVersion({
    type: 'terms_of_service',
    version: '1.9-DEMO',
    locale: 'tr',
    title: 'Demo Local Terms',
    summary: 'Demo',
    content: 'Demo content',
    requiresAcceptance: true
  });
  assert.ok(created && created.id);
  assert.equal(created.status, 'draft');

  const archived = legalDocumentService.archiveLegalDocumentVersion(created.id);
  assert.ok(archived);
  assert.equal(archived.status, 'archived');
});

test('11. Local Mode: policy acceptance revocation succeeds locally', () => {
  setLocalMode();
  const acceptance = policyAcceptanceService.recordPolicyAcceptance({
    tenantId: 'demo-tenant',
    actorType: 'customer',
    actorId: 'cust-local-01',
    documentType: 'terms_of_service',
    documentVersion: '1.0-DEMO',
    acceptanceSource: 'customer_portal'
  });
  assert.ok(acceptance && acceptance.id);

  const revoked = policyAcceptanceService.revokePolicyAcceptance(acceptance.id, 'Demo revocation');
  assert.ok(revoked);
  assert.ok(revoked.revokedAt);
});

test('12. Local Mode: consent withdrawal succeeds in demo ledger', () => {
  setLocalMode();
  const consent = consentLedgerService.recordConsent({
    tenantId: 'demo-tenant',
    actorType: 'customer',
    actorId: 'cust-local-02',
    consentType: 'booking_transactional',
    status: 'granted',
    source: 'web_form'
  });
  assert.ok(consent && consent.id);

  const withdrawn = consentLedgerService.withdrawConsent('cust-local-02', 'booking_transactional', 'Customer request');
  assert.equal(withdrawn, true);
});

test('13. Local Mode: data rights request status update succeeds in demo', () => {
  setLocalMode();
  const req = dataRightsRequestService.createDataRightsRequest({
    tenantId: 'demo-tenant',
    requesterType: 'customer',
    requesterName: 'Demo User',
    requesterContact: '5551234567',
    type: 'export',
    description: 'Data export demo'
  });
  assert.ok(req && req.id);

  const updated = dataRightsRequestService.updateDataRightsRequestStatus(req.id, 'completed', 'Demo process notes');
  assert.ok(updated);
  assert.equal(updated.status, 'completed');
});

test('14. Static UI Contract: SuperAdminLegalPage renders blocked banner in persistent mode and disables actions', () => {
  const uiCode = fs.readFileSync(UI_PAGE_PATH, 'utf8');

  // Verify getDataSourceMode resolution
  assert.ok(uiCode.includes('getDataSourceMode'), 'UI must resolve getDataSourceMode');
  assert.ok(uiCode.includes('isPersistentMode'), 'UI must define isPersistentMode');

  // Verify localized warning banner
  assert.ok(
    uiCode.includes('Kayıt/işlem geçici olarak kullanılamıyor; sunucu doğrulaması gerekli'),
    'UI must show localized blocked state banner'
  );

  // Verify action handlers enforce isPersistentMode check
  assert.ok(uiCode.includes('if (isPersistentMode)'), 'Action handlers must verify isPersistentMode');

  // Verify action buttons disabled attributes
  assert.ok(uiCode.includes('disabled={isPersistentMode || isSubmitting}'), 'Buttons must be disabled in persistent mode');

  // Verify double submission guard
  assert.ok(uiCode.includes('isSubmitting'), 'UI must include double submission prevention');
});

test('15. Static Compliance & Forbidden Words Audit', () => {
  const uiCode = fs.readFileSync(UI_PAGE_PATH, 'utf8');

  // Must preserve official contract strings
  assert.ok(uiCode.includes('Hukuk & Mevzuat Uyumluluk'), 'Must include Hukuk & Mevzuat Uyumluluk');
  assert.ok(uiCode.includes('Değiştirilemez Rıza Defteri'), 'Must include Değiştirilemez Rıza Defteri');
  assert.ok(uiCode.includes('KVKK Veri Sahibi Başvuruları'), 'Must include KVKK Veri Sahibi Başvuruları');
  assert.ok(uiCode.includes('Onayla & Yayınla'), 'Must include Onayla & Yayınla');

  // Must NOT contain forbidden unsecure wording
  assert.ok(!uiCode.includes('dummy'), 'Forbidden word: dummy');
  assert.ok(!uiCode.includes('mock_legal'), 'Forbidden word: mock_legal');
  assert.ok(!uiCode.includes('sandbox_data'), 'Forbidden word: sandbox_data');
});
