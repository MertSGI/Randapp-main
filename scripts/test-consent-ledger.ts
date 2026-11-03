import { consentLedgerService } from '../services/consentLedgerService';

class MockLocalStorage {
  private store = new Map<string, string>();
  private failKeys = new Set<string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failKeys.has(key)) {
      throw new Error(`simulated write failure for ${key}`);
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.failKeys.clear();
  }

  failOnKey(key: string): void {
    this.failKeys.add(key);
  }
}

const LEDGER_STORAGE_KEY = 'lari_consent_ledger_v1';
const mockLocalStorage = new MockLocalStorage();
(globalThis as any).window = { localStorage: mockLocalStorage };
(globalThis as any).localStorage = mockLocalStorage;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(run: () => unknown, message: string) {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function resetLedger() {
  mockLocalStorage.clear();
}

const originalNow = Date.now;
const originalRandom = Math.random;
Date.now = () => 1762160400000;
Math.random = () => 0.123456789;

try {
  resetLedger();

  expectThrows(
    () =>
      consentLedgerService.recordConsent({
        actorType: 'customer',
        actorId: 'cust-1',
        consentType: 'marketing',
        status: 'granted',
        source: 'booking_page'
      }),
    'Customer consent without tenantId must be rejected.'
  );

  expectThrows(
    () =>
      consentLedgerService.recordConsent({
        actorType: 'customer',
        tenantId: 'tenant-1',
        consentType: 'marketing',
        status: 'granted',
        source: 'booking_page'
      }),
    'Customer consent without actorId must be rejected.'
  );

  expectThrows(
    () =>
      consentLedgerService.recordConsent({
        actorType: 'customer',
        tenantId: 'tenant-1',
        actorId: 'cust-1',
        consentType: 'marketing',
        status: 'bogus' as any,
        source: 'booking_page'
      }),
    'Invalid status must be rejected.'
  );

  const grant = consentLedgerService.recordConsent({
    actorType: 'customer',
    tenantId: 'tenant-a',
    actorId: 'cust-a',
    consentType: 'marketing',
    status: 'granted',
    source: 'booking_page'
  });
  const withdrawn = consentLedgerService.withdrawConsent('cust-a', 'marketing', 'test-withdraw');
  assert(withdrawn === true, 'withdrawConsent must succeed after active grant.');

  const history = consentLedgerService.getConsentHistory({
    actorId: 'cust-a',
    consentType: 'marketing'
  });
  assert(history.length === 2, 'Grant + withdraw must produce two ledger records.');
  assert(history[0].status === 'withdrawn', 'Newest record must be withdrawn.');
  assert(history[0].metadata?.supersedesRecordId === grant.id, 'Withdrawal must link to superseded grant record.');
  assert(history[1].status === 'granted', 'Original granted record must stay preserved.');
  assert(consentLedgerService.hasConsent('cust-a', 'marketing') === false, 'Latest withdrawn state must disable active consent.');
  assert(consentLedgerService.getConsentState('cust-a', 'marketing') === 'withdrawn', 'Latest state must be withdrawn.');

  const duplicateWithdrawn = consentLedgerService.withdrawConsent('cust-a', 'marketing', 'duplicate');
  assert(duplicateWithdrawn === false, 'Duplicate withdrawal must not append duplicate records.');
  const historyAfterDuplicate = consentLedgerService.getConsentHistory({
    actorId: 'cust-a',
    consentType: 'marketing'
  });
  assert(historyAfterDuplicate.length === 2, 'Duplicate withdrawal must not change history length.');

  resetLedger();
  mockLocalStorage.setItem(
    LEDGER_STORAGE_KEY,
    JSON.stringify([
      {
        id: 'legacy_1',
        tenantId: 'tenant-legacy',
        actorType: 'customer',
        actorId: 'legacy-customer',
        consentType: 'communication',
        status: 'granted',
        source: 'legacy-import',
        capturedAt: '2026-01-01T00:00:00.000Z'
      }
    ])
  );
  const legacyState = consentLedgerService.getConsentState('legacy-customer', 'communication');
  assert(legacyState === 'granted', 'Legacy localStorage schema must remain readable.');

  resetLedger();
  consentLedgerService.recordConsent({
    actorType: 'customer',
    tenantId: 'tenant-one',
    actorId: 'shared-actor',
    consentType: 'communication',
    status: 'granted',
    source: 'booking_page'
  });
  consentLedgerService.recordConsent({
    actorType: 'customer',
    tenantId: 'tenant-two',
    actorId: 'shared-actor',
    consentType: 'communication',
    status: 'granted',
    source: 'booking_page'
  });
  const tenantCollisionWithdrawal = consentLedgerService.withdrawConsent('shared-actor', 'communication', 'collision');
  assert(tenantCollisionWithdrawal === false, 'Ambiguous cross-tenant actor withdrawal must fail closed.');

  resetLedger();
  mockLocalStorage.failOnKey(LEDGER_STORAGE_KEY);
  expectThrows(
    () =>
      consentLedgerService.recordConsent({
        actorType: 'customer',
        tenantId: 'tenant-fail',
        actorId: 'cust-fail',
        consentType: 'marketing',
        status: 'granted',
        source: 'booking_page'
      }),
    'recordConsent must fail when ledger persistence fails.'
  );
  assert(consentLedgerService.getConsentHistory().length === 0, 'Failed persistence must not claim successful saved history.');

  console.log('✅ consent ledger fail-closed + append-only tests passed');
} finally {
  Date.now = originalNow;
  Math.random = originalRandom;
}
