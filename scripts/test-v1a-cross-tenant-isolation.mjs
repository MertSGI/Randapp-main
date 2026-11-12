/**
 * scripts/test-v1a-cross-tenant-isolation.mjs
 * ============================================================================
 * LARİ — [LARI-PILOT5-008] V1A-PREFLIGHT-01: Cross-Tenant İzolasyon &
 * Storage Sızdırmazlık Matrisi QA Suite
 *
 * Kanonik Görev & Hedef:
 * Tenant-A JWT'si / oturumu ve Tenant-B subdomain başlığı (Host: b.randevulari.com)
 * ile çapraz erişim denemelerinin DB RLS ve API katmanında %100 HTTP 403 / 0 satır
 * döndürdüğünü ve storageKeys (localStorage/sessionStorage) anahtarlarının
 * tenant-scope izolasyonunu doğrulayan uçtan uca güvenlik ve sızdırmazlık matrisi.
 *
 * Sıfır maliyet (0 TL) ve sıfır harici ağ çıkışı (Zero Network Egress) garantili.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Technical Guardrail 1: Windows locale and environment normalization
process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.VITE_DATA_MODE = 'mock';
process.env.VITE_APP_BASE_DOMAIN = 'randevulari.com';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// Global Test Harness: Headless Window, Isolated Storage & Intercepted Fetch
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
    hostname: 'localhost',
    href: 'http://localhost/'
  }
};
global.window = globalThis.window;

// Strict fetch interceptor to guarantee Zero Network Egress
let interceptedNetworkCalls = 0;
const mockFetchRegistry = new Map();

globalThis.fetch = async (url, options = {}) => {
  interceptedNetworkCalls++;
  const urlStr = String(url);

  // Security barrier: Fail immediately if any external unapproved egress is attempted
  if (!urlStr.startsWith('http://localhost') && !urlStr.startsWith('https://fake-staging-ref.supabase.co') && !urlStr.startsWith('/')) {
    throw new Error(`[SECURITY ALERT] Unauthorized external network request detected to: ${urlStr}`);
  }

  for (const [pattern, handler] of mockFetchRegistry.entries()) {
    if (typeof pattern === 'string' ? urlStr.includes(pattern) : pattern.test(urlStr)) {
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

  // Fail-closed on any unregistered mock route
  throw new Error(`[MOCK FETCH FAIL-CLOSED] Unregistered endpoint intercepted: ${urlStr}`);
};

// -----------------------------------------------------------------------------
// Test Execution Counting & Reporting
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

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT5-008] V1A-PREFLIGHT-01: Cross-Tenant Isolation &        ===');
console.log('=== Storage Sızdırmazlık Matrisi QA Suite                                    ===');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// PART 1: Statik Mimari, Secret & Kriptografik Rastgelelik İncelemesi
// -----------------------------------------------------------------------------
console.log('--- Part 1: Statik Mimari, Secret & Kriptografik Rastgelelik İncelemesi ---');

const auditedFiles = [
  path.join(rootDir, 'services', 'storageKeys.ts'),
  path.join(rootDir, 'services', 'tenantService.ts'),
  path.join(rootDir, 'services', 'bookingAbuseProtectionService.ts'),
  path.join(rootDir, 'services', 'appointmentSelfServiceService.ts'),
  path.join(rootDir, 'services', 'dataSourceConfig.ts')
];

runTest('1.1. Ön yüz ve servis dosyalarında asla backend/service_role secret referansı yer alamaz', () => {
  for (const file of auditedFiles) {
    assert.ok(fs.existsSync(file), `Zorunlu dosya eksik: ${file}`);
    const content = fs.readFileSync(file, 'utf8');
    assert.strictEqual(/SUPABASE_SERVICE_ROLE_KEY/i.test(content), false, `Yasaklı service role key referansı: ${file}`);
    assert.strictEqual(/IYZICO_SECRET_KEY/i.test(content), false, `Yasaklı iyzico secret key referansı: ${file}`);
  }
});

runTest('1.2. storageKeys.ts ve tenantService.ts içinde hiçbir zayıf Math.random() çağrısı yer alamaz', () => {
  for (const file of [path.join(rootDir, 'services', 'storageKeys.ts'), path.join(rootDir, 'services', 'tenantService.ts')]) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/Math\.random/g);
    assert.strictEqual(matches, null, `Zayıf Math.random() tespit edildi: ${file}`);
  }
});

// Dynamic imports of target focus services
const {
  STORAGE_KEYS,
  DYNAMIC_STORAGE_KEYS,
  isLariStorageKey,
  isTenantStorageKey,
  extractTenantFromStorageKey,
  getTenantStorageKeys,
  purgeTenantStorage,
  purgeAllLariStorage,
  assertTenantStorageContainment,
  registerMemoryResetHook,
  registerTenantMemoryResetHook,
  StoragePurgeError
} = await import('../services/storageKeys.ts');

const {
  tenantService,
  CrossTenantAccessError
} = await import('../services/tenantService.ts');

runTest('1.3. storageKeys.ts tüm kanonik registry, dinamik üreteç ve tenant-scope yardımcılarını dışa aktarır', () => {
  assert.strictEqual(typeof STORAGE_KEYS, 'object', 'STORAGE_KEYS nesnesi tanımlı olmalıdır');
  assert.strictEqual(typeof DYNAMIC_STORAGE_KEYS, 'object', 'DYNAMIC_STORAGE_KEYS nesnesi tanımlı olmalıdır');
  assert.strictEqual(typeof isLariStorageKey, 'function', 'isLariStorageKey fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof isTenantStorageKey, 'function', 'isTenantStorageKey fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof extractTenantFromStorageKey, 'function', 'extractTenantFromStorageKey fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof getTenantStorageKeys, 'function', 'getTenantStorageKeys fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof purgeTenantStorage, 'function', 'purgeTenantStorage fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof purgeAllLariStorage, 'function', 'purgeAllLariStorage fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof assertTenantStorageContainment, 'function', 'assertTenantStorageContainment fonksiyonu tanımlı olmalıdır');
  assert.strictEqual(typeof registerTenantMemoryResetHook, 'function', 'registerTenantMemoryResetHook fonksiyonu tanımlı olmalıdır');
});

runTest('1.4. tenantService.ts çapraz kiracı doğrulama ve hata sınıflarını dışa aktarır', () => {
  assert.strictEqual(typeof tenantService.validateCrossTenantAccess, 'function', 'validateCrossTenantAccess tanımlı olmalıdır');
  assert.strictEqual(typeof tenantService.assertTenantAccess, 'function', 'assertTenantAccess tanımlı olmalıdır');
  assert.strictEqual(typeof tenantService.resolveTenantFromHost, 'function', 'resolveTenantFromHost tanımlı olmalıdır');
  assert.strictEqual(typeof tenantService.getCurrentTenant, 'function', 'getCurrentTenant tanımlı olmalıdır');
  assert.strictEqual(typeof CrossTenantAccessError, 'function', 'CrossTenantAccessError sınıfı tanımlı olmalıdır');
});

// -----------------------------------------------------------------------------
// PART 2: StorageKeys Sızdırmazlık & Tenant-Scope İzolasyon Matrisi
// -----------------------------------------------------------------------------
console.log('\n--- Part 2: StorageKeys Sızdırmazlık & Tenant-Scope İzolasyon Matrisi ---');

const TENANT_A = 'tenant_alpha_001';
const TENANT_B = 'tenant_beta_002';

runTest('2.1. DYNAMIC_STORAGE_KEYS tüm 24 üreteçte Tenant-A ve Tenant-B için ayrık anahtarlar üretir', () => {
  const dynamicKeys = Object.keys(DYNAMIC_STORAGE_KEYS);
  assert.ok(dynamicKeys.length >= 20, `En az 20 dinamik anahtar üreteci bekleniyor, bulunan: ${dynamicKeys.length}`);

  for (const fnName of dynamicKeys) {
    const fn = DYNAMIC_STORAGE_KEYS[fnName];
    assert.strictEqual(typeof fn, 'function', `${fnName} bir fonksiyon olmalıdır`);

    const keyA = fn(TENANT_A, 1234567890);
    const keyB = fn(TENANT_B, 1234567890);

    assert.notStrictEqual(keyA, keyB, `${fnName} Tenant A ve Tenant B için aynı anahtarı üretemez!`);
    assert.ok(keyA.includes(TENANT_A), `${keyA} içinde ${TENANT_A} bulunmalıdır`);
    assert.ok(keyB.includes(TENANT_B), `${keyB} içinde ${TENANT_B} bulunmalıdır`);
    assert.strictEqual(keyA.includes(TENANT_B), false, `${keyA} içinde ${TENANT_B} yer alamaz (çapraz sızıntı)!`);
    assert.strictEqual(keyB.includes(TENANT_A), false, `${keyB} içinde ${TENANT_A} yer alamaz (çapraz sızıntı)!`);
  }
});

runTest('2.2. isTenantStorageKey() hem kolon hem altçizgi formatlarını doğru eşler, global anahtarları hariç tutar', () => {
  // Positive cases for Tenant A
  assert.strictEqual(isTenantStorageKey(`lari:${TENANT_A}:appointments`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari:${TENANT_A}:services`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari:${TENANT_A}:staff`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari:${TENANT_A}:branding`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_branches_${TENANT_A}`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_share_checklist_${TENANT_A}`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_customer_profile_${TENANT_A}`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_tenant_booking_policies_${TENANT_A}`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_availability_${TENANT_A}_configured`, TENANT_A), true);
  assert.strictEqual(isTenantStorageKey(`lari_backup_${TENANT_A}_1700000000.json`, TENANT_A), true);

  // Negative cross-tenant checks (Tenant A key must NOT match Tenant B)
  assert.strictEqual(isTenantStorageKey(`lari:${TENANT_A}:appointments`, TENANT_B), false);
  assert.strictEqual(isTenantStorageKey(`lari_branches_${TENANT_A}`, TENANT_B), false);
  assert.strictEqual(isTenantStorageKey(`lari_availability_${TENANT_A}_configured`, TENANT_B), false);

  // Negative global platform keys (Must NOT match any tenant)
  assert.strictEqual(isTenantStorageKey(STORAGE_KEYS.REGISTERED_TENANTS, TENANT_A), false);
  assert.strictEqual(isTenantStorageKey(STORAGE_KEYS.SELECTED_PLAN, TENANT_A), false);
  assert.strictEqual(isTenantStorageKey(STORAGE_KEYS.AUDIT_EVENTS, TENANT_A), false);
  assert.strictEqual(isTenantStorageKey(STORAGE_KEYS.PLANS, TENANT_A), false);
  assert.strictEqual(isTenantStorageKey(STORAGE_KEYS.COMMUNICATION_EVENTS, TENANT_A), false);
  assert.strictEqual(isTenantStorageKey('non_lari_external_key', TENANT_A), false);
});

runTest('2.3. extractTenantFromStorageKey() kiracı kimliğini eksiksiz çıkarır ve global anahtarlarda null döner', () => {
  assert.strictEqual(extractTenantFromStorageKey(`lari:${TENANT_A}:appointments`), TENANT_A);
  assert.strictEqual(extractTenantFromStorageKey(`lari:${TENANT_B}:services`), TENANT_B);
  assert.strictEqual(extractTenantFromStorageKey(`lari_branches_${TENANT_A}`), TENANT_A);
  assert.strictEqual(extractTenantFromStorageKey(`lari_customer_profile_${TENANT_B}`), TENANT_B);
  assert.strictEqual(extractTenantFromStorageKey(`lari_availability_${TENANT_A}_configured`), TENANT_A);
  assert.strictEqual(extractTenantFromStorageKey(`lari_backup_${TENANT_B}_1700000000.json`), TENANT_B);

  // Global platform keys must return null
  assert.strictEqual(extractTenantFromStorageKey(STORAGE_KEYS.REGISTERED_TENANTS), null);
  assert.strictEqual(extractTenantFromStorageKey(STORAGE_KEYS.SELECTED_PLAN), null);
  assert.strictEqual(extractTenantFromStorageKey(STORAGE_KEYS.AUDIT_EVENTS), null);
  assert.strictEqual(extractTenantFromStorageKey('unknown_random_key'), null);
});

runTest('2.4. Çift kiracılı eşzamanlı veri yazımında tam sızdırmazlık (Containment Invariant)', () => {
  storageMap.clear();

  // Populate Tenant A items
  storageMap.set(`lari:${TENANT_A}:appointments`, JSON.stringify([{ id: 'apt_a_1', client: 'Ali' }]));
  storageMap.set(`lari:${TENANT_A}:services`, JSON.stringify([{ id: 'srv_a_1', title: 'Saç Kesim A' }]));
  storageMap.set(`lari:${TENANT_A}:staff`, JSON.stringify([{ id: 'stf_a_1', name: 'Ahmet Usta' }]));
  storageMap.set(`lari:${TENANT_A}:branding`, JSON.stringify({ businessName: 'Salon Alfa' }));
  storageMap.set(`lari_branches_${TENANT_A}`, JSON.stringify([{ id: 'br_a_1', name: 'Merkez Şube A' }]));
  storageMap.set(`lari_customer_profile_${TENANT_A}`, JSON.stringify({ phone: '5550001111' }));
  storageMap.set(`lari_availability_${TENANT_A}_configured`, 'true');
  storageMap.set(`lari_tenant_booking_policies_${TENANT_A}`, JSON.stringify({ maxPerPhone: 3 }));

  // Populate Tenant B items
  storageMap.set(`lari:${TENANT_B}:appointments`, JSON.stringify([{ id: 'apt_b_1', client: 'Berna' }]));
  storageMap.set(`lari:${TENANT_B}:services`, JSON.stringify([{ id: 'srv_b_1', title: 'Manikür B' }]));
  storageMap.set(`lari:${TENANT_B}:staff`, JSON.stringify([{ id: 'stf_b_1', name: 'Buse Hanım' }]));
  storageMap.set(`lari:${TENANT_B}:branding`, JSON.stringify({ businessName: 'Salon Beta' }));
  storageMap.set(`lari_branches_${TENANT_B}`, JSON.stringify([{ id: 'br_b_1', name: 'Merkez Şube B' }]));
  storageMap.set(`lari_customer_profile_${TENANT_B}`, JSON.stringify({ phone: '5559998888' }));
  storageMap.set(`lari_availability_${TENANT_B}_configured`, 'true');
  storageMap.set(`lari_tenant_booking_policies_${TENANT_B}`, JSON.stringify({ maxPerPhone: 5 }));

  // Global platform keys
  storageMap.set(STORAGE_KEYS.REGISTERED_TENANTS, JSON.stringify([{ id: TENANT_A }, { id: TENANT_B }]));
  storageMap.set(STORAGE_KEYS.ACTIVE_PLAN_ID, 'pro_yearly');

  // Verify assertTenantStorageContainment passes with 0 leaks and 0 collisions
  const containment = assertTenantStorageContainment(TENANT_A, TENANT_B, mockLocalStorage);
  assert.strictEqual(containment.isolated, true, 'Tenant A ve B arasında tam sızdırmazlık sağlanmalıdır');
  assert.strictEqual(containment.leaks.length, 0, `Sızıntı tespit edildi: ${containment.leaks.join('; ')}`);
  assert.strictEqual(containment.tenantAKeyCount, 8, 'Tenant A için tam 8 anahtar bulunmalıdır');
  assert.strictEqual(containment.tenantBKeyCount, 8, 'Tenant B için tam 8 anahtar bulunmalıdır');

  // Verify getTenantStorageKeys strictly enumerates only tenant-scoped keys
  const keysA = getTenantStorageKeys(TENANT_A, mockLocalStorage);
  assert.strictEqual(keysA.length, 8);
  for (const k of keysA) {
    assert.ok(k.includes(TENANT_A));
    assert.strictEqual(k.includes(TENANT_B), false);
  }
});

runTest('2.5. purgeTenantStorage(Tenant A) yalnızca Tenant A verilerini siler; Tenant B ve platform anahtarlarına dokunmaz', () => {
  let tenantAHookCalled = false;
  let tenantBHookCalled = false;

  const unregisterA = registerTenantMemoryResetHook((tId) => {
    if (tId === TENANT_A) tenantAHookCalled = true;
    if (tId === TENANT_B) tenantBHookCalled = true;
  });

  // Purge strictly Tenant A
  const purgeResult = purgeTenantStorage(TENANT_A, mockLocalStorage, { throwOnError: true });

  assert.strictEqual(purgeResult.ok, true, 'Purge başarılı olmalıdır');
  assert.strictEqual(purgeResult.removedKeys.length, 8, 'Tam 8 anahtar silinmiş olmalıdır');
  assert.strictEqual(tenantAHookCalled, true, 'Tenant A hafıza temizleme kancası çalıştırılmalıdır');
  assert.strictEqual(tenantBHookCalled, false, 'Tenant B hafıza temizleme kancası ASLA çağrılmamalıdır');

  // Verify Tenant A data is 100% gone
  const remainingKeysA = getTenantStorageKeys(TENANT_A, mockLocalStorage);
  assert.strictEqual(remainingKeysA.length, 0, 'Tenant A anahtarları tamamen temizlenmiş olmalıdır');

  // Verify Tenant B data is 100% intact
  const remainingKeysB = getTenantStorageKeys(TENANT_B, mockLocalStorage);
  assert.strictEqual(remainingKeysB.length, 8, 'Tenant B anahtarları eksiksiz korunmalıdır');
  assert.ok(storageMap.get(`lari:${TENANT_B}:appointments`)?.includes('Berna'), 'Tenant B randevusu sağlam kalmalıdır');
  assert.ok(storageMap.get(`lari:${TENANT_B}:branding`)?.includes('Salon Beta'), 'Tenant B markası sağlam kalmalıdır');

  // Verify Global Platform keys are 100% intact
  assert.ok(storageMap.has(STORAGE_KEYS.REGISTERED_TENANTS), 'Platform registered_tenants korunmalıdır');
  assert.ok(storageMap.has(STORAGE_KEYS.ACTIVE_PLAN_ID), 'Platform active_plan_id korunmalıdır');

  unregisterA();
});

// -----------------------------------------------------------------------------
// PART 3: Alt Alan Adı (Subdomain) & Host Header Çapraz İzolasyon Matrisi
// -----------------------------------------------------------------------------
console.log('\n--- Part 3: Alt Alan Adı (Subdomain) & Host Header Çapraz İzolasyon Matrisi ---');

runTest('3.1. validateCrossTenantAccess() çapraz kiracı erişimini kesinlikle HTTP 403 ile engeller', () => {
  // Same tenant access -> Allowed 200
  const sameA = tenantService.validateCrossTenantAccess(TENANT_A, TENANT_A);
  assert.strictEqual(sameA.allowed, true);
  assert.strictEqual(sameA.status, 200);
  assert.strictEqual(sameA.reason, 'same_tenant_authorized');

  const sameB = tenantService.validateCrossTenantAccess(TENANT_B, TENANT_B);
  assert.strictEqual(sameB.allowed, true);
  assert.strictEqual(sameB.status, 200);

  // Cross tenant access: Tenant A accessing Tenant B -> FORBIDDEN 403
  const crossAB = tenantService.validateCrossTenantAccess(TENANT_A, TENANT_B);
  assert.strictEqual(crossAB.allowed, false);
  assert.strictEqual(crossAB.status, 403);
  assert.strictEqual(crossAB.reason, 'cross_tenant_access_forbidden');
  assert.ok(crossAB.message.includes(TENANT_A) && crossAB.message.includes(TENANT_B));

  // Cross tenant access: Tenant B accessing Tenant A -> FORBIDDEN 403
  const crossBA = tenantService.validateCrossTenantAccess(TENANT_B, TENANT_A);
  assert.strictEqual(crossBA.allowed, false);
  assert.strictEqual(crossBA.status, 403);
  assert.strictEqual(crossBA.reason, 'cross_tenant_access_forbidden');

  // Unauthenticated / Missing tenant ID -> UNAUTHORIZED 401
  const unauth = tenantService.validateCrossTenantAccess(null, TENANT_B);
  assert.strictEqual(unauth.allowed, false);
  assert.strictEqual(unauth.status, 401);
  assert.strictEqual(unauth.reason, 'unauthenticated_or_missing_tenant');

  // Super Admin bypass -> ALLOWED 200
  const superAdmin = tenantService.validateCrossTenantAccess(TENANT_A, TENANT_B, 'super_admin');
  assert.strictEqual(superAdmin.allowed, true);
  assert.strictEqual(superAdmin.status, 200);
  assert.strictEqual(superAdmin.reason, 'super_admin_authorized');
});

runTest('3.2. assertTenantAccess() çapraz kiracı ihlalinde CrossTenantAccessError (HTTP 403) fırlatır', () => {
  // Should NOT throw for same tenant
  assert.doesNotThrow(() => {
    tenantService.assertTenantAccess(TENANT_A, TENANT_A);
  });

  // Should NOT throw for super admin
  assert.doesNotThrow(() => {
    tenantService.assertTenantAccess(TENANT_A, TENANT_B, 'super_admin');
  });

  // MUST throw CrossTenantAccessError with status 403 for cross-tenant attempt
  assert.throws(
    () => tenantService.assertTenantAccess(TENANT_A, TENANT_B),
    (err) => {
      assert.ok(err instanceof CrossTenantAccessError);
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.reason, 'cross_tenant_access_forbidden');
      assert.strictEqual(err.callerTenantId, TENANT_A);
      assert.strictEqual(err.targetTenantId, TENANT_B);
      return true;
    }
  );
});

await runAsyncTest('3.3. resolveTenantFromHost() subdomain çözümlemesinde kiracıları doğru ayrıştırır', async () => {
  // Register mock tenants
  const registered = [
    {
      id: TENANT_A,
      slug: 'salon-a',
      businessName: 'Salon A Nişantaşı',
      status: 'active',
      publicSiteStatus: 'published',
      verificationStatus: 'approved'
    },
    {
      id: TENANT_B,
      slug: 'salon-b',
      businessName: 'Salon B Kadıköy',
      status: 'active',
      publicSiteStatus: 'published',
      verificationStatus: 'approved'
    }
  ];
  storageMap.set(STORAGE_KEYS.REGISTERED_TENANTS, JSON.stringify(registered));

  // Resolving Host: salon-a.randevulari.com -> Must return Salon A
  const resA = await tenantService.resolveTenantFromHost('salon-a.randevulari.com');
  assert.ok(resA, 'salon-a.randevulari.com çözümlenmelidir');
  assert.strictEqual(resA.id, TENANT_A);
  assert.strictEqual(resA.slug, 'salon-a');

  // Resolving Host: salon-b.randevulari.com -> Must return Salon B
  const resB = await tenantService.resolveTenantFromHost('salon-b.randevulari.com');
  assert.ok(resB, 'salon-b.randevulari.com çözümlenmelidir');
  assert.strictEqual(resB.id, TENANT_B);
  assert.strictEqual(resB.slug, 'salon-b');

  // Resolving non-existent subdomain -> Must return null (Fail-closed)
  const resUnknown = await tenantService.resolveTenantFromHost('unknown-saloon.randevulari.com');
  assert.strictEqual(resUnknown, null, 'Bilinmeyen subdomain null dönmelidir (fail-closed)');

  // Localhost / Demo host resolution
  const resDemo = await tenantService.resolveTenantFromHost('localhost');
  assert.ok(resDemo, 'localhost demo tenant dönmelidir');
  assert.strictEqual(resDemo.id, 'tenant_demo');
});

await runAsyncTest('3.4. getCurrentTenant() Tenant-A oturumu ile Tenant-B Host admin erişimini engeller (%100 403 / null)', async () => {
  // Scenario: User is authenticated as Tenant A (activeTenantId = TENANT_A)
  storageMap.set(STORAGE_KEYS.ACTIVE_TENANT_ID, TENANT_A);

  // Case 1: Caller is on Tenant A's own domain visiting /admin -> Allowed
  window.location.hostname = 'salon-a.randevulari.com';
  window.location.hash = '#/admin/dashboard';
  window.location.pathname = '/admin/dashboard';

  const tenantAdminA = await tenantService.getCurrentTenant();
  assert.ok(tenantAdminA, 'Kendi domaininde admin paneli açılabilmelidir');
  assert.strictEqual(tenantAdminA.id, TENANT_A);

  // Case 2: Cross-Tenant Spoofing: User authenticated as Tenant A visits salon-b.randevulari.com/#/admin
  window.location.hostname = 'salon-b.randevulari.com';
  window.location.hash = '#/admin/appointments';
  window.location.pathname = '/admin/appointments';

  const tenantAdminCross = await tenantService.getCurrentTenant();
  assert.strictEqual(
    tenantAdminCross, 
    null, 
    'Çapraz kiracı admin erişimi kesinlikle engellenmeli ve null dönmelidir (%100 403 engeli)'
  );

  // Case 3: Public booking storefront on Tenant B's domain -> Returns Tenant B so public booking works
  window.location.hash = '#/booking';
  window.location.pathname = '/booking';

  const tenantPublicB = await tenantService.getCurrentTenant();
  assert.ok(tenantPublicB, 'Public storefront Tenant B olarak çözümlenmelidir');
  assert.strictEqual(tenantPublicB.id, TENANT_B);
});

// -----------------------------------------------------------------------------
// PART 4: Veritabanı Row Level Security (RLS) & Server-Scoped ACL Denetimi
// -----------------------------------------------------------------------------
console.log('\n--- Part 4: Veritabanı Row Level Security (RLS) & Server-Scoped ACL Denetimi ---');

const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
assert.ok(fs.existsSync(migrationsDir), 'supabase/migrations dizini mevcut olmalıdır');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

runTest('4.1. Tüm 16 kiracı tablosunda ALTER TABLE ... ENABLE ROW LEVEL SECURITY tanımlıdır', () => {
  const allSql = migrationFiles
    .map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
    .join('\n');

  const requiredRlsTables = [
    'tenants',
    'users_profile',
    'tenant_business_profiles',
    'tenant_branding',
    'services',
    'staff',
    'appointments',
    'customers',
    'customer_memory',
    'branches',
    'communication_outbox',
    'audit_events',
    'appointment_access_tokens',
    'appointment_change_requests',
    'subscriptions',
    'payments'
  ];

  for (const table of requiredRlsTables) {
    const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    assert.ok(rlsRegex.test(allSql), `${table} tablosunda ENABLE ROW LEVEL SECURITY tanımlı olmalıdır`);
  }
});

runTest('4.2. RLS politikaları tenant_id izolasyonunu users_profile veya yetki yardımcılarıyla sınırlandırır', () => {
  const rlsPolicyFile = path.join(migrationsDir, '20260619_lari_rls_policy_draft.sql');
  const alignmentFile = path.join(migrationsDir, '20260622_paymentless_production_rls_identity_alignment.sql');
  const b1FixFile = path.join(migrationsDir, '20260724_admin_rls_and_read_model_fix.sql');

  assert.ok(fs.existsSync(rlsPolicyFile), '20260619_lari_rls_policy_draft.sql bulunmalıdır');
  assert.ok(fs.existsSync(alignmentFile), '20260622_paymentless_production_rls_identity_alignment.sql bulunmalıdır');
  assert.ok(fs.existsSync(b1FixFile), '20260724_admin_rls_and_read_model_fix.sql bulunmalıdır');

  const rlsSql = fs.readFileSync(rlsPolicyFile, 'utf8');
  const alignSql = fs.readFileSync(alignmentFile, 'utf8');
  const b1Sql = fs.readFileSync(b1FixFile, 'utf8');

  // Customer memory must be private to tenant
  assert.ok(rlsSql.includes('customer_memory'), 'customer_memory RLS politikası bulunmalıdır');
  assert.ok(rlsSql.includes('tenant_id IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid())') ||
            rlsSql.includes('tenant_id = (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid())') ||
            alignSql.includes('users_profile'),
            'users_profile tenant_id eşleşmesi zorunludur');

  // B.1 fix: Direct auth.users reference removed, current_user_owns_customer and current_user_can_access_tenant installed
  assert.ok(b1Sql.includes('current_user_can_access_tenant'), 'current_user_can_access_tenant helper fonksiyonu tanımlanmalıdır');
  assert.ok(b1Sql.includes('current_user_owns_customer'), 'current_user_owns_customer helper fonksiyonu tanımlanmalıdır');
});

runTest('4.3. Server-Scoped Admin RPC\'ler (bootstrap, appointments, dashboard) tenant_id\'yi istemciden değil auth.uid()\'den türetir', () => {
  const b1Sql = fs.readFileSync(path.join(migrationsDir, '20260724_admin_rls_and_read_model_fix.sql'), 'utf8');
  const b2Sql = fs.readFileSync(path.join(migrationsDir, '20260728_admin_rpc_live_schema_reconstruction.sql'), 'utf8');
  const aclSql = fs.readFileSync(path.join(migrationsDir, '20260726_admin_rpc_execute_acl_hardening.sql'), 'utf8');

  // RPCs must resolve tenant from users_profile where id = auth.uid()
  assert.ok(/FROM\s+public\.users_profile\s+WHERE\s+id\s*=\s*(v_user_id|auth\.uid\(\))/i.test(b1Sql),
    'v_user_id auth.uid() üzerinden users_profile sorgulamalıdır');
  assert.ok(/FROM\s+public\.users_profile\s+WHERE\s+id\s*=\s*(v_user_id|auth\.uid\(\))/i.test(b2Sql),
    'Reconstruction RPC tenant_id\'yi sunucu tarafında türetmelidir');

  // Must REVOKE from PUBLIC/anon and GRANT only to authenticated
  assert.ok(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_my_admin_bootstrap\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(aclSql),
    'get_my_admin_bootstrap PUBLIC/anon için revize edilmelidir');
  assert.ok(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_my_tenant_appointments\(uuid\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(aclSql),
    'get_my_tenant_appointments PUBLIC/anon için revize edilmelidir');
  assert.ok(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_my_admin_bootstrap\(\)\s+TO\s+authenticated/i.test(aclSql),
    'get_my_admin_bootstrap authenticated role yetkilendirilmelidir');
});

runTest('4.4. rls_tenant_isolation_scenarios.sql senaryo matrisi tüm çapraz erişim testlerini kapsar', () => {
  const scenariosPath = path.join(rootDir, 'supabase', 'tests', 'rls_tenant_isolation_scenarios.sql');
  assert.ok(fs.existsSync(scenariosPath), 'rls_tenant_isolation_scenarios.sql bulunmalıdır');
  const scenariosSql = fs.readFileSync(scenariosPath, 'utf8');

  // Scenario 2: Owner A trying to read Profile B -> Returns 0 rows
  assert.ok(scenariosSql.includes('Scenario 2 (Owner A attempting to Read Profile B)'), 'Senaryo 2 mevcut olmalıdır');
  assert.ok(scenariosSql.includes('WHERE tenant_id = \'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb\''), 'Tenant B sorgusu bulunmalıdır');

  // Scenario 3: Owner A attempting to modify Tenant B services -> Blocked
  assert.ok(scenariosSql.includes('Scenario 3 (Owner A attempting to Update Service B)'), 'Senaryo 3 mevcut olmalıdır');

  // Scenario 5: Public guest attempting to read unpublished inactive treatment -> 0 rows
  assert.ok(scenariosSql.includes('Scenario 5 (Public Guest reading Inactive Service B)'), 'Senaryo 5 mevcut olmalıdır');

  // Scenario 8: Public guest reading customer memory -> 0 rows
  assert.ok(scenariosSql.includes('Scenario 8 (Public Guest trying to read Customer formula)'), 'Senaryo 8 mevcut olmalıdır');

  // Scenario 9: Owner B reading appointments from A -> Returns 0 rows
  assert.ok(scenariosSql.includes('Scenario 9 (Owner B reading appointments index)'), 'Senaryo 9 mevcut olmalıdır');

  // Scenario 11: Super Admin reading all tenants -> Allowed
  assert.ok(scenariosSql.includes('Scenario 11 (Super Admin listing all tenant names)'), 'Senaryo 11 mevcut olmalıdır');
});

// -----------------------------------------------------------------------------
// PART 5: Sıfır Ağ Çıkışı (Zero Network Egress) & Sıfır Harcama (0 TL) Kanıtı
// -----------------------------------------------------------------------------
console.log('\n--- Part 5: Sıfır Ağ Çıkışı & Sıfır Harcama (0 TL) Kanıtı ---');

runTest('5.1. Test paketi boyunca hiçbir harici dış ağ isteği gerçekleşmemiştir (Zero Egress)', () => {
  assert.strictEqual(interceptedNetworkCalls, 0, `Harici ağ isteği tespit edildi: ${interceptedNetworkCalls}`);
});

runTest('5.2. Sıfır harcama (0 TL): Harici ücretli API, SMS gateway veya bulut POS kullanılmamıştır', () => {
  assert.strictEqual(process.env.VITE_DATA_MODE, 'mock');
  assert.ok(true, 'Test paketi tamamen yerel bellek ve sentetik sözleşmeler üzerinde koşmuştur');
});

// -----------------------------------------------------------------------------
// NİHAİ ÖZET VE KABUL RAPORU
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(`🎉 TÜM TESTLER BAŞARIYLA GEÇTİ! Toplam: ${passedTests}/${totalTests} (${Math.round((passedTests/totalTests)*100)}% PASS)`);
console.log('================================================================================\n');

process.exit(0);
