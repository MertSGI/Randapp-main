import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory mock localStorage for deterministic node testing
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

const mockLs = new MockLocalStorage();
globalThis.localStorage = mockLs;
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    localStorage: mockLs,
  };
}

let mockFetchHandler = async () => new Response(JSON.stringify([]), { status: 200 });
globalThis.fetch = async (...args) => mockFetchHandler(...args);

function setTestEnv(envObj) {
  globalThis.import = { meta: { env: envObj } };
  for (const [k, v] of Object.entries(envObj)) {
    if (v === undefined || v === '') delete process.env[k];
    else process.env[k] = v;
  }
}

function setPersistentSupabaseEnv() {
  setTestEnv({
    VITE_DATA_MODE: 'supabase_staging',
    VITE_SUPABASE_URL: 'https://rwedeejhjazwjthdjzrt.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic-anon-test-key',
  });
}

function setLocalDemoEnv() {
  setTestEnv({
    VITE_DATA_MODE: 'local',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
  });
}

// Start with local demo mode
setLocalDemoEnv();

// Import modules under test
const { SupabasePolicyAndConsentRepository } = await import('../services/repositories/supabasePolicyAndConsentRepository.ts');
const { policyAcceptanceService } = await import('../services/policyAcceptanceService.ts');
const { consentLedgerService } = await import('../services/consentLedgerService.ts');
const { dataRightsRequestService } = await import('../services/dataRightsRequestService.ts');

test('Case 1: Anonymous forged tenant is blocked from direct table insert', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  await assert.rejects(
    async () => {
      await repo.createAcceptance({
        id: 'acpt-forged-1',
        tenantId: 'forged_tenant_xyz',
        actorId: 'attacker_123',
        documentType: 'terms_of_service',
      });
    },
    /LEGAL_SERVER_WRITE_NOT_CONFIGURED/
  );
});

test('Case 2: Forged actor identity cannot be written via client repository', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  await assert.rejects(
    async () => {
      await repo.createConsentRecord({
        id: 'cld-forged-2',
        tenantId: 'legit_tenant',
        actorId: 'impersonated_super_admin',
        consentType: 'marketing',
        status: 'granted',
      });
    },
    /LEGAL_SERVER_WRITE_NOT_CONFIGURED/
  );
});

test('Case 3: Fake IP and digital signature fallbacks are rejected from direct table write', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  await assert.rejects(
    async () => {
      await repo.createAcceptance({
        documentType: 'privacy_policy',
        ipAddress: '127.0.0.1',
        digitalSignature: 'digital_signature',
      });
    },
    /LEGAL_SERVER_WRITE_NOT_CONFIGURED/
  );
});

test('Case 4: Direct client table POST to policy_acceptances and consent_ledger is impossible', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  await assert.rejects(
    async () => repo.createAcceptance({ documentType: 'terms' }),
    /LEGAL_SERVER_WRITE_NOT_CONFIGURED/
  );
  await assert.rejects(
    async () => repo.createConsentRecord({ consentType: 'communication', status: 'granted' }),
    /LEGAL_SERVER_WRITE_NOT_CONFIGURED/
  );
});

test('Case 5: Forbidden status edit / mutation on consent_ledger is strictly blocked', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  await assert.rejects(
    async () => {
      await repo.updateConsentRecord('cld-existing-1', {
        status: 'withdrawn',
        withdrawnAt: new Date().toISOString(),
      });
    },
    /LEGAL_MUTATION_PROHIBITED/
  );
});

test('Case 6: RLS read failures throw typed LEGAL_READ_FAILED error instead of empty success []', async () => {
  setPersistentSupabaseEnv();
  const repo = new SupabasePolicyAndConsentRepository();
  // Simulate 403 forbidden response from PostgREST RLS
  mockFetchHandler = async () => new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 });

  await assert.rejects(
    async () => {
      await repo.listAcceptances('tenant-unauthorized');
    },
    /LEGAL_READ_FAILED/
  );

  await assert.rejects(
    async () => {
      await repo.listConsentRecords('tenant-unauthorized');
    },
    /LEGAL_READ_FAILED/
  );
});

test('Case 7: In Supabase mode, policyAcceptanceService rejects writing to localStorage', () => {
  mockLs.clear();
  setPersistentSupabaseEnv();

  assert.throws(
    () => {
      policyAcceptanceService.recordPolicyAcceptance({
        tenantId: 'tenant-test',
        actorType: 'customer',
        actorId: 'cust-1',
        documentType: 'terms_of_service',
        acceptanceSource: 'booking',
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.equal(mockLs.getItem('lari_policy_acceptances_v1'), null, 'localStorage must not receive writes in supabase mode');
});

test('Case 8: In Supabase mode, fake policy acceptance cannot return success record', () => {
  setPersistentSupabaseEnv();

  let recordReturned = null;
  try {
    recordReturned = policyAcceptanceService.recordPolicyAcceptance({
      actorType: 'customer',
      documentType: 'privacy_policy',
      acceptanceSource: 'registration',
    });
  } catch {
    // Expected fail-closed throw
  }

  assert.equal(recordReturned, null, 'No success record can be manufactured in persistent mode');
});

test('Case 9: In Supabase mode, consentLedgerService rejects writing to localStorage', () => {
  mockLs.clear();
  setPersistentSupabaseEnv();

  assert.throws(
    () => {
      consentLedgerService.recordConsent({
        tenantId: 'tenant-test',
        actorType: 'customer',
        actorId: 'cust-2',
        consentType: 'marketing',
        status: 'granted',
        source: 'booking_page',
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.equal(mockLs.getItem('lari_consent_ledger_v1'), null, 'Consent ledger must not write to localStorage in supabase mode');
});

test('Case 10: In Supabase mode, dataRightsRequestService rejects local-only write', () => {
  mockLs.clear();
  setPersistentSupabaseEnv();

  assert.throws(
    () => {
      dataRightsRequestService.createDataRightsRequest({
        tenantId: 'tenant-test',
        requesterType: 'customer',
        requesterName: 'Ali Demir',
        type: 'deletion',
        description: 'Tüm randevu ve hesap verilerimin silinmesini talep ediyorum.',
      });
    },
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.equal(mockLs.getItem('lari_data_rights_requests_v1'), null, 'Data rights requests must not write to localStorage in supabase mode');
});

test('Case 11: In local mode, demo local policy acceptance succeeds', () => {
  mockLs.clear();
  setLocalDemoEnv();

  const record = policyAcceptanceService.recordPolicyAcceptance({
    tenantId: 'demo-tenant',
    actorType: 'tenant_owner',
    actorId: 'owner@example.com',
    actorDisplayName: 'Demo Owner',
    documentType: 'terms_of_service',
    acceptanceSource: 'registration',
  });

  assert.ok(record.id.startsWith('acpt_'));
  assert.equal(record.documentType, 'terms_of_service');
  assert.equal(record.actorType, 'tenant_owner');
  assert.ok(mockLs.getItem('lari_policy_acceptances_v1') !== null);
});

test('Case 12: In local mode, demo local consent succeeds', () => {
  mockLs.clear();
  setLocalDemoEnv();

  const record = consentLedgerService.recordConsent({
    tenantId: 'demo-tenant',
    actorType: 'customer',
    actorId: 'customer-local-1',
    consentType: 'booking_transactional',
    status: 'granted',
    source: 'booking_page',
    legalDocumentType: 'booking_terms',
  });

  assert.ok(record.id.startsWith('cld_'));
  assert.equal(record.status, 'granted');
  assert.equal(consentLedgerService.hasConsent('customer-local-1', 'booking_transactional'), true);
});

test('Case 13: In local mode, demo data rights request succeeds', () => {
  mockLs.clear();
  setLocalDemoEnv();

  const req = dataRightsRequestService.createDataRightsRequest({
    tenantId: 'demo-tenant',
    requesterType: 'customer',
    requesterName: 'Demo Customer',
    type: 'export',
    description: 'Veri kopyası talebi.',
  });

  assert.ok(req.id.startsWith('drq_'));
  assert.equal(req.status, 'submitted');
  assert.equal(req.type, 'export');
});

test('Case 14: In persistent mode, readiness summary integrityVerified cannot be true', () => {
  setPersistentSupabaseEnv();

  const summary = policyAcceptanceService.getPolicyAcceptanceReadinessSummary();
  assert.equal(summary.integrityVerified, false, 'integrityVerified must be false in persistent mode without server attestation');
  assert.equal(summary.persistenceMode, 'unconfigured_server');

  const ledgerSummary = consentLedgerService.getConsentLedgerSummary();
  assert.equal(ledgerSummary.immutableStorageMocked, false);
  assert.equal(ledgerSummary.serverProofVerified, false);
});

test('Case 15: Revoke and withdrawal operations fail closed in persistent mode', () => {
  setPersistentSupabaseEnv();

  assert.throws(
    () => policyAcceptanceService.revokePolicyAcceptance('acpt-123', 'User request'),
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => consentLedgerService.withdrawConsent('cust-123', 'marketing', 'User request'),
    /LEGAL_PERSISTENCE_REQUIRED/
  );

  assert.throws(
    () => dataRightsRequestService.updateDataRightsRequestStatus('drq-123', 'completed', 'Processed'),
    /LEGAL_PERSISTENCE_REQUIRED/
  );
});
