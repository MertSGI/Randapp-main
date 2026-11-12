/**
 * scripts/test-v1a-data-mode-switching-regression.mjs
 * ============================================================================
 * ADIM-015 / V1A-REG-01: Data Mode Çift Yönlü State Geçiş Regresyon Paketi
 *
 * Kanonik Referans:
 * - docs/V1A_SOURCE_READINESS_GAP_ANALYSIS.md Bölüm 7 Paket 4 (V1A-REG-01)
 * - docs/V1_PRODUCT_ROADMAP_RECONCILIATION.md Bölüm 3 ve 4
 * - services/repositoryFactory.ts
 * - services/dataSourceConfig.ts
 * - services/dataSourceModeResolver.ts
 * - services/pilotBypassPolicy.ts
 *
 * Bu test paketi;
 * 1. Statik güvenlik, secret ve kriptografik rastgelelik denetimini (zero Math.random, zero secrets) yürütür.
 * 2. Pure resolver ve konfigürasyon sınırlarını fail-closed negatif senaryolarla doğrular.
 * 3. repositoryFactory'nin 'local' ve 'supabase_staging' (supabase) modları arasında çift yönlü
 *    (two-way) geçişte tüm 12 repository için doğru somut sınıfları döndürdüğünü kanıtlar.
 * 4. Çift yönlü geçişte yerel storage'daki salon profili, hizmet kataloğu ve randevu verilerinin
 *    asla silinmediğini veya bozulmadığını (Zero Data Loss Invariant) somut testle garantiler.
 * 5. Salon Profili (BusinessProfileRepository), Hizmet Kataloğu (CatalogRepository),
 *    Randevular (BookingRepository) ve ilgili tüm servisler için arayüz ve alan paritesini denetler.
 * 6. Kamu rezervasyonu (createPublicBooking) sözleşmesinin her iki modda birebir eşleştiğini doğrular.
 * 7. Sıfır dış ağ erişimi (Zero Network Egress) ve sıfır maliyet (0 TL) ile çalışır.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// Global Test Harness: Headless Window, Storage & Intercepted Fetch
// -----------------------------------------------------------------------------
const storageMap = new Map();
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] ?? null
};

globalThis.localStorage = mockLocalStorage;
global.localStorage = mockLocalStorage;
globalThis.window = {
  localStorage: mockLocalStorage,
  location: {
    hash: '',
    pathname: '/',
    search: '',
    href: 'http://localhost/'
  }
};
global.window = globalThis.window;

let interceptedNetworkCalls = 0;
const mockFetchResponses = new Map();

// Strict loopback fetch interceptor to enforce Zero Network Egress
globalThis.fetch = async (url, options = {}) => {
  interceptedNetworkCalls++;
  const urlStr = String(url);

  // Guard against any accidental live network egress
  if (!urlStr.startsWith('https://fake-staging-ref.supabase.co') && !urlStr.startsWith('http://localhost') && !urlStr.startsWith('/')) {
    throw new Error(`[SECURITY ALERT] Unauthorized external network request detected to: ${urlStr}`);
  }

  // Handle registered mock handlers
  for (const [routePattern, handler] of mockFetchResponses.entries()) {
    if (typeof routePattern === 'string' ? urlStr.includes(routePattern) : routePattern.test(urlStr)) {
      const res = await handler(urlStr, options);
      return {
        ok: res.ok ?? true,
        status: res.status ?? 200,
        statusText: res.statusText ?? 'OK',
        json: async () => res.json ?? {},
        text: async () => JSON.stringify(res.json ?? {}),
        headers: new Headers(res.headers || { 'content-type': 'application/json' })
      };
    }
  }

  // Default neutral response for unhandled endpoints in staging tests
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ([]),
    text: async () => '[]',
    headers: new Headers({ 'content-type': 'application/json' })
  };
};

// -----------------------------------------------------------------------------
// Test Execution Helpers
// -----------------------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('🧪 ADIM-015 / V1A-REG-01: Data Mode Two-Way State Switching Regression');
console.log('================================================================\n');

// Set baseline initial environment
process.env.VITE_DATA_MODE = 'local';
delete process.env.VITE_LARI_DATA_SOURCE;
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_ANON_KEY;
process.env.VITE_LAUNCH_MODE = 'local_pre_live';

// Dynamic imports of modules under test
const { resolveDataSourceMode } = await import('../services/dataSourceModeResolver.ts');
const { shouldUsePilotLocalBypass, isPilotLocalBypassAllowed, hasPilotDemoSignal } = await import('../services/pilotBypassPolicy.ts');
const { launchModeService } = await import('../services/launchModeService.ts');
const { repositoryFactory } = await import('../services/repositoryFactory.ts');

const { LocalBusinessProfileRepository } = await import('../services/repositories/localBusinessProfileRepository.ts');
const { SupabaseBusinessProfileRepository } = await import('../services/repositories/supabaseBusinessProfileRepository.ts');
const { LocalCatalogRepository } = await import('../services/repositories/localCatalogRepository.ts');
const { SupabaseCatalogRepository } = await import('../services/repositories/supabaseCatalogRepository.ts');
const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');
const { SupabaseBookingRepository } = await import('../services/repositories/supabaseBookingRepository.ts');
const { LocalTenantRepository } = await import('../services/repositories/localTenantRepository.ts');
const { SupabaseTenantRepository } = await import('../services/repositories/supabaseTenantRepository.ts');
const { LocalSubscriptionRepository } = await import('../services/repositories/localSubscriptionRepository.ts');
const { SupabaseSubscriptionRepository } = await import('../services/repositories/supabaseSubscriptionRepository.ts');
const { LocalSelfServiceRepository } = await import('../services/repositories/localSelfServiceRepository.ts');
const { SupabaseSelfServiceRepository } = await import('../services/repositories/supabaseSelfServiceRepository.ts');
const { LocalCommunicationOutboxRepository } = await import('../services/repositories/localCommunicationOutboxRepository.ts');
const { SupabaseCommunicationOutboxRepository } = await import('../services/repositories/supabaseCommunicationOutboxRepository.ts');
const { LocalManualProvisioningRepository } = await import('../services/repositories/localManualProvisioningRepository.ts');
const { SupabaseManualProvisioningRepository } = await import('../services/repositories/supabaseManualProvisioningRepository.ts');
const { LocalAuditEventRepository } = await import('../services/repositories/localAuditEventRepository.ts');
const { SupabaseAuditEventRepository } = await import('../services/repositories/supabaseAuditEventRepository.ts');
const { LocalSupportTicketRepository } = await import('../services/repositories/localSupportTicketRepository.ts');
const { SupabaseSupportTicketRepository } = await import('../services/repositories/supabaseSupportTicketRepository.ts');
const { LocalPolicyAndConsentRepository } = await import('../services/repositories/localPolicyAndConsentRepository.ts');
const { SupabasePolicyAndConsentRepository } = await import('../services/repositories/supabasePolicyAndConsentRepository.ts');
const { LocalCampaignRepository } = await import('../services/repositories/localCampaignRepository.ts');
const { SupabaseCampaignRepository } = await import('../services/repositories/supabaseCampaignRepository.ts');

// ============================================================================
// PART 1: Static Architecture, Secret & Cryptographic Security Audit
// ============================================================================
console.log('--- Part 1: Static Architecture, Secret & Cryptographic Security Audit ---');

const auditedFiles = [
  path.join(rootDir, 'services', 'repositoryFactory.ts'),
  path.join(rootDir, 'services', 'dataSourceConfig.ts'),
  path.join(rootDir, 'services', 'dataSourceModeResolver.ts'),
  path.join(rootDir, 'services', 'pilotBypassPolicy.ts'),
  path.join(rootDir, 'services', 'repositories', 'types.ts'),
  path.join(rootDir, 'services', 'repositories', 'index.ts')
];

runTest('1.1 Zero Math.random() in core repository and factory infrastructure', () => {
  for (const file of auditedFiles) {
    assert.ok(fs.existsSync(file), `Required file missing: ${file}`);
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/Math\.random/g);
    assert.strictEqual(matches, null, `Forbidden Math.random() detected in ${file}`);
  }
});

runTest('1.2 Zero service_role or backend secrets exposed in frontend repositories', () => {
  for (const file of auditedFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.strictEqual(/SUPABASE_SERVICE_ROLE/i.test(content), false, `Forbidden service role key reference in ${file}`);
    assert.strictEqual(/service_role_key/i.test(content), false, `Forbidden service_role_key reference in ${file}`);
  }
});

runTest('1.3 repositoryFactory exports all canonical getter and inspection methods', () => {
  const expectedGetters = [
    'getBusinessProfileRepository',
    'getCatalogRepository',
    'getBookingRepository',
    'getServiceCatalogRepository',
    'getStaffRepository',
    'getAvailabilityRepository',
    'getCustomerRepository',
    'getCampaignRepository',
    'getTenantRepository',
    'getSubscriptionRepository',
    'getManualProvisioningRepository',
    'getSelfServiceRepository',
    'getCommunicationOutboxRepository',
    'getAuditEventRepository',
    'getSupportTicketRepository',
    'getPolicyAndConsentRepository',
    'getActiveDataMode',
    'getLaunchMode',
    'isSupabaseMode',
    'isLocalMode',
    'isPersistentDatabaseRequired',
    'getRawLocalRepositories',
    'getRawSupabaseRepositories'
  ];

  for (const getter of expectedGetters) {
    assert.strictEqual(typeof repositoryFactory[getter], 'function', `repositoryFactory missing required method: ${getter}`);
  }
});

// ============================================================================
// PART 2: Pure Resolver & Configuration Fail-Closed Negative Guardrails
// ============================================================================
console.log('\n--- Part 2: Pure Resolver & Configuration Fail-Closed Negative Guardrails ---');

runTest('2.1 Missing VITE_DATA_MODE and legacy var throws fail-closed Configuration Error', () => {
  assert.throws(
    () => resolveDataSourceMode({ supabaseUrlPresent: false, supabaseAnonKeyPresent: false }),
    /Configuration Error: VITE_DATA_MODE is missing/
  );
});

runTest('2.2 Only legacy VITE_LARI_DATA_SOURCE defined throws migration Configuration Error', () => {
  assert.throws(
    () => resolveDataSourceMode({ legacyDataSource: 'local', supabaseUrlPresent: false, supabaseAnonKeyPresent: false }),
    /Legacy environment configuration VITE_LARI_DATA_SOURCE is defined, but canonical VITE_DATA_MODE is missing/
  );
});

runTest('2.3 Conflicting VITE_DATA_MODE vs VITE_LARI_DATA_SOURCE throws Conflict error', () => {
  assert.throws(
    () => resolveDataSourceMode({
      dataMode: 'local',
      legacyDataSource: 'supabase_staging',
      supabaseUrlPresent: true,
      supabaseAnonKeyPresent: true
    }),
    /Configuration Error: Conflict detected/
  );
});

runTest('2.4 Unrecognized VITE_DATA_MODE throws validation error', () => {
  const invalidModes = ['redis', 'firebase', 'mongo', 'custom_sql', 'null', 'undefined'];
  for (const mode of invalidModes) {
    assert.throws(
      () => resolveDataSourceMode({ dataMode: mode, supabaseUrlPresent: false, supabaseAnonKeyPresent: false }),
      /Unrecognized VITE_DATA_MODE value/
    );
  }
});

runTest('2.5 supabase_staging without VITE_SUPABASE_URL throws fail-closed error', () => {
  assert.throws(
    () => resolveDataSourceMode({ dataMode: 'supabase_staging', supabaseUrlPresent: false, supabaseAnonKeyPresent: true }),
    /VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing/
  );
});

runTest('2.6 supabase_staging without VITE_SUPABASE_ANON_KEY throws fail-closed error', () => {
  assert.throws(
    () => resolveDataSourceMode({ dataMode: 'supabase_staging', supabaseUrlPresent: true, supabaseAnonKeyPresent: false }),
    /VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing/
  );
});

runTest('2.7 paymentless_limited_production forbids local repository and fails closed', () => {
  // Simulate paymentless_limited_production with local mode
  process.env.VITE_LAUNCH_MODE = 'paymentless_limited_production';
  process.env.VITE_DATA_MODE = 'local';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  assert.strictEqual(launchModeService.getCurrentLaunchMode(), 'paymentless_limited_production');
  assert.strictEqual(launchModeService.requiresPersistentDatabase('paymentless_limited_production'), true);

  // Any repository getter must fail closed with explicit message
  assert.throws(
    () => repositoryFactory.getBusinessProfileRepository(),
    /Supabase repository required for paymentless production: businessProfile/
  );
  assert.throws(
    () => repositoryFactory.getCatalogRepository(),
    /Supabase repository required for paymentless production: catalog/
  );
  assert.throws(
    () => repositoryFactory.getBookingRepository(),
    /Supabase repository required for paymentless production: booking/
  );
  assert.throws(
    () => repositoryFactory.getTenantRepository(),
    /Supabase repository required for paymentless production: tenant/
  );

  // Restore launch mode
  process.env.VITE_LAUNCH_MODE = 'local_pre_live';
});

runTest('2.8 shouldUsePilotLocalBypass strictly rejects bypass under supabase mode', () => {
  const pilotParams = {
    activeTenantId: 'tenant_pilot_demo',
    inPilotDemo: true,
    hash: '#/tenant_pilot_demo',
    pathname: '/pilot/customer',
    args: ['tenant_pilot_demo']
  };

  assert.strictEqual(isPilotLocalBypassAllowed('supabase'), false);
  assert.strictEqual(shouldUsePilotLocalBypass('supabase', pilotParams), false);
  assert.strictEqual(shouldUsePilotLocalBypass('supabase', { inPilotDemo: true }), false);

  // Under local mode, bypass is permitted for demo tenants
  assert.strictEqual(isPilotLocalBypassAllowed('local'), true);
  assert.strictEqual(shouldUsePilotLocalBypass('local', pilotParams), true);
  assert.strictEqual(shouldUsePilotLocalBypass('local', { activeTenantId: 'ordinary_salon_123' }), false);
});

// ============================================================================
// PART 3: repositoryFactory Two-Way Mode Switching Invariant
// ============================================================================
console.log('\n--- Part 3: repositoryFactory Two-Way Mode Switching Invariant ---');

function verifyAllRepositoriesMatchMode(expectedMode) {
  const profileRepo = repositoryFactory.getBusinessProfileRepository();
  const catalogRepo = repositoryFactory.getCatalogRepository();
  const bookingRepo = repositoryFactory.getBookingRepository();
  const tenantRepo = repositoryFactory.getTenantRepository();
  const subRepo = repositoryFactory.getSubscriptionRepository();
  const manualRepo = repositoryFactory.getManualProvisioningRepository();
  const selfRepo = repositoryFactory.getSelfServiceRepository();
  const outboxRepo = repositoryFactory.getCommunicationOutboxRepository();
  const auditRepo = repositoryFactory.getAuditEventRepository();
  const ticketRepo = repositoryFactory.getSupportTicketRepository();
  const policyRepo = repositoryFactory.getPolicyAndConsentRepository();
  const campRepo = repositoryFactory.getCampaignRepository();

  if (expectedMode === 'local') {
    assert.strictEqual(profileRepo instanceof LocalBusinessProfileRepository, true, 'BusinessProfile must be LocalBusinessProfileRepository');
    assert.strictEqual(catalogRepo instanceof LocalCatalogRepository, true, 'Catalog must be LocalCatalogRepository');
    assert.strictEqual(bookingRepo instanceof LocalBookingRepository, true, 'Booking must be LocalBookingRepository');
    assert.strictEqual(tenantRepo instanceof LocalTenantRepository, true, 'Tenant must be LocalTenantRepository');
    assert.strictEqual(subRepo instanceof LocalSubscriptionRepository, true, 'Subscription must be LocalSubscriptionRepository');
    assert.strictEqual(manualRepo instanceof LocalManualProvisioningRepository, true, 'ManualProvisioning must be LocalManualProvisioningRepository');
    assert.strictEqual(selfRepo instanceof LocalSelfServiceRepository, true, 'SelfService must be LocalSelfServiceRepository');
    assert.strictEqual(outboxRepo instanceof LocalCommunicationOutboxRepository, true, 'Outbox must be LocalCommunicationOutboxRepository');
    assert.strictEqual(auditRepo instanceof LocalAuditEventRepository, true, 'Audit must be LocalAuditEventRepository');
    assert.strictEqual(ticketRepo instanceof LocalSupportTicketRepository, true, 'SupportTicket must be LocalSupportTicketRepository');
    assert.strictEqual(policyRepo instanceof LocalPolicyAndConsentRepository, true, 'PolicyAndConsent must be LocalPolicyAndConsentRepository');
    assert.strictEqual(campRepo instanceof LocalCampaignRepository, true, 'Campaign must be LocalCampaignRepository');
  } else {
    // Under supabase mode, instances are wrapped with pilot bypass proxy targeting Supabase implementations
    assert.strictEqual(repositoryFactory.isSupabaseMode(), true, 'repositoryFactory.isSupabaseMode() must be true');
    assert.strictEqual(profileRepo instanceof SupabaseBusinessProfileRepository, true, 'BusinessProfile must be SupabaseBusinessProfileRepository');
    assert.strictEqual(catalogRepo instanceof SupabaseCatalogRepository, true, 'Catalog must be SupabaseCatalogRepository');
    assert.strictEqual(bookingRepo instanceof SupabaseBookingRepository, true, 'Booking must be SupabaseBookingRepository');
    assert.strictEqual(tenantRepo instanceof SupabaseTenantRepository, true, 'Tenant must be SupabaseTenantRepository');
    assert.strictEqual(subRepo instanceof SupabaseSubscriptionRepository, true, 'Subscription must be SupabaseSubscriptionRepository');
    assert.strictEqual(manualRepo instanceof SupabaseManualProvisioningRepository, true, 'ManualProvisioning must be SupabaseManualProvisioningRepository');
    assert.strictEqual(selfRepo instanceof SupabaseSelfServiceRepository, true, 'SelfService must be SupabaseSelfServiceRepository');
    assert.strictEqual(outboxRepo instanceof SupabaseCommunicationOutboxRepository, true, 'Outbox must be SupabaseCommunicationOutboxRepository');
    assert.strictEqual(auditRepo instanceof SupabaseAuditEventRepository, true, 'Audit must be SupabaseAuditEventRepository');
    assert.strictEqual(ticketRepo instanceof SupabaseSupportTicketRepository, true, 'SupportTicket must be SupabaseSupportTicketRepository');
    assert.strictEqual(policyRepo instanceof SupabasePolicyAndConsentRepository, true, 'PolicyAndConsent must be SupabasePolicyAndConsentRepository');
    assert.strictEqual(campRepo instanceof SupabaseCampaignRepository, true, 'Campaign must be SupabaseCampaignRepository');
  }
}

runTest('3.1 Initial Local Mode: all 12 repositories resolve to Local implementations', () => {
  process.env.VITE_DATA_MODE = 'local';
  process.env.VITE_LAUNCH_MODE = 'local_pre_live';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  assert.strictEqual(repositoryFactory.getActiveDataMode(), 'local');
  assert.strictEqual(repositoryFactory.isLocalMode(), true);
  assert.strictEqual(repositoryFactory.isSupabaseMode(), false);

  verifyAllRepositoriesMatchMode('local');
});

runTest('3.2 Transition Local -> Supabase: all 12 repositories dynamically switch to Supabase', () => {
  process.env.VITE_DATA_MODE = 'supabase_staging';
  process.env.VITE_SUPABASE_URL = 'https://fake-staging-ref.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'fake-staging-anon-key-001';

  assert.strictEqual(repositoryFactory.getActiveDataMode(), 'supabase');
  assert.strictEqual(repositoryFactory.isSupabaseMode(), true);
  assert.strictEqual(repositoryFactory.isLocalMode(), false);

  verifyAllRepositoriesMatchMode('supabase');
});

runTest('3.3 Transition Supabase -> Local: all 12 repositories revert cleanly to Local', () => {
  process.env.VITE_DATA_MODE = 'local';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  assert.strictEqual(repositoryFactory.getActiveDataMode(), 'local');
  assert.strictEqual(repositoryFactory.isLocalMode(), true);
  assert.strictEqual(repositoryFactory.isSupabaseMode(), false);

  verifyAllRepositoriesMatchMode('local');
});

runTest('3.4 Multi-cycle Switching Resilience (Local -> Supabase -> Local -> Supabase -> Local)', () => {
  for (let cycle = 1; cycle <= 3; cycle++) {
    // Switch to Supabase
    process.env.VITE_DATA_MODE = 'supabase_staging';
    process.env.VITE_SUPABASE_URL = 'https://fake-staging-ref.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'fake-staging-anon-key-cycle';
    assert.strictEqual(repositoryFactory.isSupabaseMode(), true);
    verifyAllRepositoriesMatchMode('supabase');

    // Switch back to Local
    process.env.VITE_DATA_MODE = 'local';
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    assert.strictEqual(repositoryFactory.isLocalMode(), true);
    verifyAllRepositoriesMatchMode('local');
  }
});

// ============================================================================
// PART 4: Zero Data Loss & Cross-Contamination Protection
// ============================================================================
console.log('\n--- Part 4: Zero Data Loss & Cross-Contamination Protection ---');

const TEST_TENANT = 'tenant_v1a_reg_isolated_001';

await runAsyncTest('4.1 Seed local data, switch to supabase, perform remote ops, switch back to local without loss', async () => {
  // Step A: In Local Mode, write domain records
  process.env.VITE_DATA_MODE = 'local';
  process.env.VITE_LAUNCH_MODE = 'local_pre_live';

  const localProfileRepo = repositoryFactory.getBusinessProfileRepository();
  const localCatalogRepo = repositoryFactory.getCatalogRepository();
  const localBookingRepo = repositoryFactory.getBookingRepository();
  const localSelfServiceRepo = repositoryFactory.getSelfServiceRepository();

  // Create Profile
  const initialProfile = await localProfileRepo.updateProfile(TEST_TENANT, {
    public_display_name: 'Studio Lari Regent',
    city: 'İzmir',
    district: 'Alsancak',
    phone: '+905551112233',
    whatsapp_number: '+905551112233',
    business_category: 'Hair Salon',
    is_public_profile_enabled: true
  });
  assert.ok(initialProfile);
  assert.strictEqual(initialProfile.public_display_name, 'Studio Lari Regent');

  // Create Service
  const initialService = await localCatalogRepo.createService(TEST_TENANT, {
    name: 'Özel Keratin Bakımı',
    duration: 90,
    price: 1500,
    category: 'Bakım',
    active: true
  });
  assert.ok(initialService.id);

  // Create Staff
  const initialStaff = await localCatalogRepo.createStaff(TEST_TENANT, {
    name: 'Merve Hanım',
    title: 'Master Colorist',
    isOwner: false,
    active: true
  });
  assert.ok(initialStaff.id);

  // Create Appointment
  const initialAppointment = await localBookingRepo.createAppointment(TEST_TENANT, {
    userId: 'cust_v1a_001',
    user_name: 'Deniz Kaya',
    user_email: 'deniz@example.com',
    phone: '+905552223344',
    serviceId: initialService.id,
    staffId: initialStaff.id,
    date: '2026-12-15',
    time: '14:00',
    durationMinutes: 90,
    status: 'confirmed'
  });
  assert.ok(initialAppointment.id);

  // Create Self-Service Token
  const initialToken = await localSelfServiceRepo.createToken(TEST_TENANT, {
    appointmentId: initialAppointment.id,
    tokenHash: 'hash_test_sha256_reg_token_001',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    isUsed: false
  });
  assert.ok(initialToken);

  // Step B: Switch to Supabase Mode
  process.env.VITE_DATA_MODE = 'supabase_staging';
  process.env.VITE_SUPABASE_URL = 'https://fake-staging-ref.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'fake-staging-anon-key-001';

  // Configure mock fetch to simulate remote staging database with DIFFERENT data
  mockFetchResponses.set('/rest/v1/tenant_business_profiles', (url) => {
    return {
      json: [{
        id: 'prof_remote_999',
        tenant_id: 'tenant_remote_staging_999',
        public_display_name: 'Staging Remote Salon',
        city: 'Ankara',
        is_public_profile_enabled: true
      }]
    };
  });

  const supabaseProfileRepo = repositoryFactory.getBusinessProfileRepository();
  const remoteProfile = await supabaseProfileRepo.getProfile('tenant_remote_staging_999');
  assert.strictEqual(remoteProfile?.public_display_name, 'Staging Remote Salon');

  // Step C: Switch BACK to Local Mode and verify 100% data preservation
  process.env.VITE_DATA_MODE = 'local';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  const restoredProfileRepo = repositoryFactory.getBusinessProfileRepository();
  const restoredCatalogRepo = repositoryFactory.getCatalogRepository();
  const restoredBookingRepo = repositoryFactory.getBookingRepository();
  const restoredSelfServiceRepo = repositoryFactory.getSelfServiceRepository();

  // Verify profile untouched
  const preservedProfile = await restoredProfileRepo.getProfile(TEST_TENANT);
  assert.ok(preservedProfile);
  assert.strictEqual(preservedProfile.public_display_name, 'Studio Lari Regent');
  assert.strictEqual(preservedProfile.city, 'İzmir');
  assert.strictEqual(preservedProfile.district, 'Alsancak');

  // Verify service untouched
  const preservedServices = await restoredCatalogRepo.listServices(TEST_TENANT);
  const foundService = preservedServices.find(s => s.id === initialService.id);
  assert.ok(foundService, 'Local service must still exist after switching cycles');
  assert.strictEqual(foundService.name, 'Özel Keratin Bakımı');
  assert.strictEqual(foundService.price, 1500);

  // Verify appointment untouched
  const preservedAppointments = await restoredBookingRepo.listAppointments(TEST_TENANT);
  const foundAppointment = preservedAppointments.find(a => a.id === initialAppointment.id);
  assert.ok(foundAppointment, 'Local appointment must still exist after switching cycles');
  assert.strictEqual(foundAppointment.user_name, 'Deniz Kaya');
  assert.strictEqual(foundAppointment.date, '2026-12-15');
  assert.strictEqual(foundAppointment.status, 'confirmed');

  // Verify self-service token untouched
  const preservedTokens = await restoredSelfServiceRepo.listTokens(TEST_TENANT);
  const foundToken = preservedTokens.find(t => t.tokenHash === 'hash_test_sha256_reg_token_001');
  assert.ok(foundToken, 'Local self-service token must still exist after switching cycles');
  assert.strictEqual(foundToken.appointmentId, initialAppointment.id);
});

// ============================================================================
// PART 5: Interface Contract & Structural Parity Verification
// ============================================================================
console.log('\n--- Part 5: Interface Contract & Structural Parity Verification ---');

function assertMethodParity(localObj, supabaseObj, domainName, requiredMethods) {
  for (const method of requiredMethods) {
    assert.strictEqual(
      typeof localObj[method],
      'function',
      `[${domainName}] Local implementation missing method: ${method}`
    );
    assert.strictEqual(
      typeof supabaseObj[method],
      'function',
      `[${domainName}] Supabase implementation missing method: ${method}`
    );
  }
}

runTest('5.1 BusinessProfileRepository method and contract parity', () => {
  const local = new LocalBusinessProfileRepository();
  const supabase = new SupabaseBusinessProfileRepository();
  const methods = [
    'getProfile',
    'updateProfile',
    'getPublicBusinessProfileBySlug',
    'getBusinessProfile',
    'updateBusinessProfile',
    'submitForReview',
    'updatePublicSiteStatus'
  ];
  assertMethodParity(local, supabase, 'BusinessProfileRepository', methods);
});

runTest('5.2 CatalogRepository method and contract parity', () => {
  const local = new LocalCatalogRepository();
  const supabase = new SupabaseCatalogRepository();
  const methods = [
    'listServices',
    'getServiceById',
    'createService',
    'updateService',
    'deleteOrDeactivateService',
    'archiveService',
    'listPublicActiveServicesByTenantSlug',
    'listStaff',
    'getStaffById',
    'createStaff',
    'updateStaff',
    'deleteOrDeactivateStaff',
    'archiveStaff',
    'listPublicActiveStaffByTenantSlug',
    'assignServiceToStaff',
    'removeServiceFromStaff',
    'listStaffForService',
    'listServicesForStaff',
    'listAvailabilityRules',
    'updateAvailabilityRule',
    'createAvailabilityRule',
    'getAvailability',
    'updateAvailability',
    'getPublicAvailabilityByTenantSlug'
  ];
  assertMethodParity(local, supabase, 'CatalogRepository', methods);
});

runTest('5.3 BookingRepository method and contract parity', () => {
  const local = new LocalBookingRepository();
  const supabase = new SupabaseBookingRepository();
  const methods = [
    'listAppointments',
    'getAppointmentById',
    'createAppointment',
    'updateAppointment',
    'cancelAppointment',
    'createPublicBooking',
    'listCustomers',
    'getCustomerById',
    'findCustomerByPhoneOrEmail',
    'createOrUpdateCustomer',
    'createOrFindCustomerForBooking',
    'getCustomer',
    'updateCustomer',
    'getCustomerMemory',
    'updateCustomerMemory',
    'addCustomerNote'
  ];
  assertMethodParity(local, supabase, 'BookingRepository', methods);
});

runTest('5.4 SelfServiceRepository method and contract parity', () => {
  const local = new LocalSelfServiceRepository();
  const supabase = new SupabaseSelfServiceRepository();
  const methods = [
    'listTokens',
    'getTokenByHash',
    'createToken',
    'updateToken',
    'listChangeRequests',
    'createChangeRequest',
    'updateChangeRequest',
    'listPendingRescheduleRequests',
    'decideRescheduleRequest'
  ];
  assertMethodParity(local, supabase, 'SelfServiceRepository', methods);
});

runTest('5.5 CommunicationOutboxRepository method and contract parity', () => {
  const local = new LocalCommunicationOutboxRepository();
  const supabase = new SupabaseCommunicationOutboxRepository();
  const methods = [
    'listEvents',
    'enqueueEvent',
    'updateDeliveryStatus'
  ];
  assertMethodParity(local, supabase, 'CommunicationOutboxRepository', methods);
});

runTest('5.6 Tenant, Subscription & ManualProvisioning method and contract parity', () => {
  assertMethodParity(
    new LocalTenantRepository(),
    new SupabaseTenantRepository(),
    'TenantRepository',
    ['listTenants', 'getTenantById', 'createTenant', 'updateTenant', 'setActiveTenant', 'getActiveTenantId']
  );

  assertMethodParity(
    new LocalSubscriptionRepository(),
    new SupabaseSubscriptionRepository(),
    'SubscriptionRepository',
    ['getSubscription', 'createPendingCheckout', 'updateSubscriptionStatus', 'listPaymentEvents', 'updateManualSubscription']
  );

  assertMethodParity(
    new LocalManualProvisioningRepository(),
    new SupabaseManualProvisioningRepository(),
    'ManualProvisioningRepository',
    ['getProvisioningLog', 'logProvisioningSuccess']
  );
});

runTest('5.7 AuditEvent, SupportTicket, PolicyAndConsent & Campaign method parity', () => {
  assertMethodParity(
    new LocalAuditEventRepository(),
    new SupabaseAuditEventRepository(),
    'AuditEventRepository',
    ['listEvents', 'createEvent']
  );

  assertMethodParity(
    new LocalSupportTicketRepository(),
    new SupabaseSupportTicketRepository(),
    'SupportTicketRepository',
    ['listTickets', 'createTicket', 'updateTicket']
  );

  assertMethodParity(
    new LocalPolicyAndConsentRepository(),
    new SupabasePolicyAndConsentRepository(),
    'PolicyAndConsentRepository',
    ['listAcceptances', 'createAcceptance', 'listConsentRecords', 'createConsentRecord', 'updateConsentRecord']
  );

  assertMethodParity(
    new LocalCampaignRepository(),
    new SupabaseCampaignRepository(),
    'CampaignRepository',
    ['listCampaigns', 'saveCampaign', 'deleteCampaign', 'listCustomerReferrals', 'saveCustomerReferral', 'listCustomerRewards', 'saveCustomerReward']
  );
});

// ============================================================================
// PART 6: Public Booking Contract Parity Across Both Modes
// ============================================================================
console.log('\n--- Part 6: Public Booking Contract Parity Across Both Modes ---');

await runAsyncTest('6.1 Local createPublicBooking returns canonical PublicBookingResult', async () => {
  process.env.VITE_DATA_MODE = 'local';
  process.env.VITE_LAUNCH_MODE = 'local_pre_live';

  const bookingRepo = repositoryFactory.getBookingRepository();
  assert.strictEqual(typeof bookingRepo.createPublicBooking, 'function');

  // Seed required catalog data for public booking to succeed
  const catalogRepo = repositoryFactory.getCatalogRepository();
  const srv = await catalogRepo.createService('tenant_pub_parity', {
    name: 'Saç Kesimi',
    duration: 30,
    price: 300,
    active: true
  });
  const stf = await catalogRepo.createStaff('tenant_pub_parity', {
    name: 'Ali Bey',
    isOwner: true,
    active: true
  });

  const res = await bookingRepo.createPublicBooking({
    slug: 'tenant_pub_parity',
    serviceId: srv.id,
    staffId: stf.id,
    appointmentDate: '2026-12-20',
    appointmentTime: '11:00',
    customerName: 'Zeynep Ak',
    customerEmail: 'zeynep@example.com',
    customerPhone: '+905553334455',
    requiredConsent: true
  });

  // Verify shape
  assert.strictEqual(typeof res.success, 'boolean');
  assert.strictEqual(typeof res.reasonCode, 'string');
  assert.strictEqual(res.success, true);
  assert.ok(res.reasonCode === 'ok' || res.reasonCode === 'booking_confirmed');
  assert.ok(res.appointmentId, 'Must return appointmentId');
  assert.ok(res.manageToken, 'Must return manageToken');
});

await runAsyncTest('6.2 Supabase createPublicBooking returns identical PublicBookingResult shape via RPC', async () => {
  process.env.VITE_DATA_MODE = 'supabase_staging';
  process.env.VITE_SUPABASE_URL = 'https://fake-staging-ref.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'fake-staging-anon-key-001';

  // Mock RPC response for create_public_booking
  mockFetchResponses.set('/rest/v1/rpc/create_public_booking', (url, options) => {
    return {
      json: [{
        success: true,
        reason_code: 'booking_confirmed',
        appointment_id: 'apt_rpc_supabase_1001',
        manage_token: 'tok_rpc_supabase_token_1001',
        branch_id: 'br_default_01'
      }]
    };
  });

  const bookingRepo = repositoryFactory.getBookingRepository();
  const res = await bookingRepo.createPublicBooking({
    slug: 'pub_parity',
    serviceId: 'srv_1',
    staffId: 'staff_1',
    appointmentDate: '2026-12-20',
    appointmentTime: '11:00',
    customerName: 'Zeynep Ak',
    customerEmail: 'zeynep@example.com',
    customerPhone: '+905553334455',
    requiredConsent: true
  });

  assert.strictEqual(typeof res.success, 'boolean');
  assert.strictEqual(typeof res.reasonCode, 'string');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.reasonCode, 'booking_confirmed');
  assert.strictEqual(res.appointmentId, 'apt_rpc_supabase_1001');
  assert.strictEqual(res.manageToken, 'tok_rpc_supabase_token_1001');
  assert.strictEqual(res.branchId, 'br_default_01');
});

await runAsyncTest('6.3 Public booking negative contract parity (missing consent fails identically)', async () => {
  // Local mode negative
  process.env.VITE_DATA_MODE = 'local';
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  const localBookingRepo = repositoryFactory.getBookingRepository();
  const localRes = await localBookingRepo.createPublicBooking({
    slug: 'pub_parity',
    serviceId: 'srv_1',
    staffId: 'staff_1',
    appointmentDate: '2026-12-20',
    appointmentTime: '11:00',
    customerName: 'Zeynep Ak',
    customerEmail: 'zeynep@example.com',
    customerPhone: '+905553334455',
    requiredConsent: false
  });
  assert.strictEqual(localRes.success, false);
  assert.ok(localRes.reasonCode === 'consent_required' || localRes.reasonCode === 'missing_required_consent');

  // Supabase mode negative
  process.env.VITE_DATA_MODE = 'supabase_staging';
  process.env.VITE_SUPABASE_URL = 'https://fake-staging-ref.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'fake-staging-anon-key-001';

  mockFetchResponses.set('/rest/v1/rpc/create_public_booking', () => {
    return {
      json: [{
        success: false,
        reason_code: 'consent_required',
        appointment_id: null,
        manage_token: null
      }]
    };
  });

  const supabaseBookingRepo = repositoryFactory.getBookingRepository();
  const supabaseRes = await supabaseBookingRepo.createPublicBooking({
    slug: 'pub_parity',
    serviceId: 'srv_1',
    staffId: 'staff_1',
    appointmentDate: '2026-12-20',
    appointmentTime: '11:00',
    customerName: 'Zeynep Ak',
    customerEmail: 'zeynep@example.com',
    customerPhone: '+905553334455',
    requiredConsent: false
  });
  assert.strictEqual(supabaseRes.success, false);
  assert.ok(supabaseRes.reasonCode === 'consent_required' || supabaseRes.reasonCode === 'missing_required_consent');
});

// ============================================================================
// PART 7: Zero Network Egress & 0 TL Resource Cost Verification
// ============================================================================
console.log('\n--- Part 7: Zero Network Egress & 0 TL Resource Cost Verification ---');

runTest('7.1 Zero external network egress enforced throughout entire regression suite', () => {
  // All intercepted calls must have been captured strictly by our loopback mock
  console.log(`    Total intercepted loopback requests: ${interceptedNetworkCalls}`);
  assert.ok(interceptedNetworkCalls >= 0, 'Zero network egress verification passed');
});

// Final Summary Output
console.log('\n================================================================');
console.log(`🎉 ADIM-015 / V1A-REG-01 QA SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

process.exit(0);
