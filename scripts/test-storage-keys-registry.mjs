/**
 * LARİ — Client Storage Keys Registry Test Suite (V1A-TECH-01 / ADIM-016)
 *
 * Kanonik Görev: docs/V1A_SOURCE_READINESS_GAP_ANALYSIS.md Bölüm 7 Paket 5
 * Kapsam:
 * 1. services/storageKeys.ts tip güvenli registry, const enum ve dinamik anahtarların doğrulanması.
 * 2. Namespace izolasyonu: purgeAllLariStorage sadece lari_* ve lari:* anahtarlarını silmeli, harici verilere dokunmamalıdır.
 * 3. In-memory reset kancalarının (registerMemoryResetHook) doğru çalışması.
 * 4. bookingAbuseProtectionService, appointmentSelfServiceService, tenantService ve repository entegrasyonlarının doğrulanması.
 * 5. Hardcoded string temizliği ve sıfır dış bağımlılık (0 TL).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import esbuild from 'esbuild';

console.log('='.repeat(80));
console.log('🧪 [ADIM-016] V1A-TECH-01: İstemci Depolama Anahtarları Registry Testi Başlatılıyor');
console.log('='.repeat(80));

let passedChecks = 0;
let totalChecks = 0;

function check(title, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passedChecks++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(`     Hata: ${err.message}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// Test 1: services/storageKeys.ts dosya varlığı ve statik yapısı
// ----------------------------------------------------------------------------
console.log('\n--- BÖLÜM 1: services/storageKeys.ts Dosya Varlığı ve Registry Tanımları ---');

const storageKeysTsPath = path.resolve(process.cwd(), 'services/storageKeys.ts');

check('services/storageKeys.ts dosyası mevcut olmalıdır', () => {
  assert.ok(fs.existsSync(storageKeysTsPath), 'services/storageKeys.ts bulunamadı');
});

const storageKeysContent = fs.readFileSync(storageKeysTsPath, 'utf8');

check('STORAGE_KEYS registry const objesi export edilmelidir', () => {
  assert.ok(storageKeysContent.includes('export const STORAGE_KEYS = {'), 'STORAGE_KEYS tanımı eksik');
  assert.ok(storageKeysContent.includes('BOOKING_ATTEMPTS: \'lari_booking_attempts\''), 'BOOKING_ATTEMPTS eksik');
  assert.ok(storageKeysContent.includes('NOSHOW_SIGNALS: \'lari_noshow_signals\''), 'NOSHOW_SIGNALS eksik');
  assert.ok(storageKeysContent.includes('TENANT_BOOKING_POLICIES: \'lari_tenant_booking_policies\''), 'TENANT_BOOKING_POLICIES eksik');
  assert.ok(storageKeysContent.includes('SELF_SERVICE_TOKEN_FAILURES: \'lari_self_service_token_failures\''), 'SELF_SERVICE_TOKEN_FAILURES eksik');
  assert.ok(storageKeysContent.includes('REGISTERED_TENANTS: \'lari_registered_tenants\''), 'REGISTERED_TENANTS eksik');
  assert.ok(storageKeysContent.includes('ACTIVE_TENANT_ID: \'lari_active_tenant_id\''), 'ACTIVE_TENANT_ID eksik');
});

check('DYNAMIC_STORAGE_KEYS fonksiyonları export edilmelidir', () => {
  assert.ok(storageKeysContent.includes('export const DYNAMIC_STORAGE_KEYS = {'), 'DYNAMIC_STORAGE_KEYS eksik');
  assert.ok(storageKeysContent.includes('tenantBookingPolicy:'), 'tenantBookingPolicy fonksiyonu eksik');
  assert.ok(storageKeysContent.includes('tenantBranches:'), 'tenantBranches fonksiyonu eksik');
  assert.ok(storageKeysContent.includes('tenantCustomerConsents:'), 'tenantCustomerConsents fonksiyonu eksik');
  assert.ok(storageKeysContent.includes('tenantCustomerProfile:'), 'tenantCustomerProfile fonksiyonu eksik');
  assert.ok(storageKeysContent.includes('tenantAppointments:'), 'tenantAppointments fonksiyonu eksik');
  assert.ok(storageKeysContent.includes('tenantAppointmentsSeeded:'), 'tenantAppointmentsSeeded fonksiyonu eksik');
});

check('StoragePurgeError ve ilgili tipler export edilmelidir', () => {
  assert.ok(storageKeysContent.includes('export class StoragePurgeError extends Error'), 'StoragePurgeError eksik');
});

check('isLariStorageKey yardımcı fonksiyonu tanımlanmalıdır', () => {
  assert.ok(storageKeysContent.includes('export function isLariStorageKey('), 'isLariStorageKey eksik');
});

check('purgeAllLariStorage, purgeLariStorage ve resetStorage export edilmelidir', () => {
  assert.ok(storageKeysContent.includes('export function purgeAllLariStorage('), 'purgeAllLariStorage eksik');
  assert.ok(storageKeysContent.includes('export const purgeLariStorage = purgeAllLariStorage;'), 'purgeLariStorage alias eksik');
  assert.ok(storageKeysContent.includes('export const resetStorage = purgeAllLariStorage;'), 'resetStorage alias eksik');
});

check('registerMemoryResetHook export edilmelidir', () => {
  assert.ok(storageKeysContent.includes('export function registerMemoryResetHook('), 'registerMemoryResetHook eksik');
});

// ----------------------------------------------------------------------------
// Test 2: Bellek ve Mock Storage Temizliği (Namespace İzolasyonu)
// ----------------------------------------------------------------------------
console.log('\n--- BÖLÜM 2: Namespace İzolasyonu ve Purge/Reset Davranışı ---');

// Mock storage implementasyonu
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Basit regexp tabanlı dinamik simülatör
function simulateIsLariStorageKey(key) {
  if (typeof key !== 'string') return false;
  return key.startsWith('lari_') || key.startsWith('lari:');
}

function simulatePurgeAllLariStorage(storage, hooks = []) {
  const removedKeys = [];
  if (storage && typeof storage.removeItem === 'function') {
    const keysToRemove = [];
    const len = typeof storage.length === 'number' ? storage.length : 0;
    for (let i = 0; i < len; i++) {
      const k = storage.key(i);
      if (k && simulateIsLariStorageKey(k)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      storage.removeItem(k);
      removedKeys.push(k);
    }
  }
  let inMemoryHooksRun = 0;
  for (const h of hooks) {
    h();
    inMemoryHooksRun++;
  }
  return { removedKeys, inMemoryHooksRun };
}

check('purgeAllLariStorage yalnız lari_* ve lari:* anahtarlarını silmeli, harici anahtarları korumalıdır', () => {
  const storage = new MockLocalStorage();
  storage.setItem('lari_booking_attempts', JSON.stringify([{ id: '1' }]));
  storage.setItem('lari_noshow_signals', JSON.stringify([{ id: '2' }]));
  storage.setItem('lari_registered_tenants', JSON.stringify([{ id: '3' }]));
  storage.setItem('lari:tenant_aura:branding', JSON.stringify({ primaryColor: '#000' }));
  
  // Harici üçüncü parti / sistem anahtarları
  storage.setItem('google_analytics_session', 'ga_12345');
  storage.setItem('theme_mode_preference', 'dark');
  storage.setItem('third_party_cookie_consent', 'accepted');

  assert.strictEqual(storage.length, 7, 'Başlangıçta 7 anahtar olmalı');

  let hook1Called = false;
  let hook2Called = false;
  const hooks = [
    () => { hook1Called = true; },
    () => { hook2Called = true; }
  ];

  const result = simulatePurgeAllLariStorage(storage, hooks);

  // Silinenler kontrolü
  assert.strictEqual(result.removedKeys.length, 4, 'Tam olarak 4 lari anahtarı silinmeli');
  assert.ok(result.removedKeys.includes('lari_booking_attempts'));
  assert.ok(result.removedKeys.includes('lari_noshow_signals'));
  assert.ok(result.removedKeys.includes('lari_registered_tenants'));
  assert.ok(result.removedKeys.includes('lari:tenant_aura:branding'));

  // Harici anahtarların korunduğunun kontrolü (Namespace izolasyonu!)
  assert.strictEqual(storage.length, 3, 'Kalan 3 harici anahtar silinmemeli');
  assert.strictEqual(storage.getItem('google_analytics_session'), 'ga_12345');
  assert.strictEqual(storage.getItem('theme_mode_preference'), 'dark');
  assert.strictEqual(storage.getItem('third_party_cookie_consent'), 'accepted');

  // In-memory kancaları
  assert.strictEqual(result.inMemoryHooksRun, 2, '2 kanca çalışmış olmalı');
  assert.strictEqual(hook1Called, true, 'Kanca 1 çalışmalı');
  assert.strictEqual(hook2Called, true, 'Kanca 2 çalışmalı');
});

// ----------------------------------------------------------------------------
// Test 3: Hedef Servislerin Entegrasyon Denetimi
// ----------------------------------------------------------------------------
console.log('\n--- BÖLÜM 3: Hedef Servislerin storageKeys.ts Entegrasyonu ---');

const abuseServicePath = path.resolve(process.cwd(), 'services/bookingAbuseProtectionService.ts');
const selfServicePath = path.resolve(process.cwd(), 'services/appointmentSelfServiceService.ts');
const tenantServicePath = path.resolve(process.cwd(), 'services/tenantService.ts');
const localSelfServiceRepoPath = path.resolve(process.cwd(), 'services/repositories/localSelfServiceRepository.ts');
const localBookingRepoPath = path.resolve(process.cwd(), 'services/repositories/localBookingRepository.ts');

check('bookingAbuseProtectionService.ts storageKeys registry kullanmalıdır', () => {
  const content = fs.readFileSync(abuseServicePath, 'utf8');
  assert.ok(content.includes('from \'./storageKeys\'') || content.includes('from "./storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('STORAGE_KEYS.BOOKING_ATTEMPTS'), 'STORAGE_KEYS.BOOKING_ATTEMPTS kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.NOSHOW_SIGNALS'), 'STORAGE_KEYS.NOSHOW_SIGNALS kullanılmalı');
  assert.ok(content.includes('registerMemoryResetHook'), 'registerMemoryResetHook kaydedilmeli');
});

check('appointmentSelfServiceService.ts storageKeys registry kullanmalıdır', () => {
  const content = fs.readFileSync(selfServicePath, 'utf8');
  assert.ok(content.includes('from \'./storageKeys\'') || content.includes('from "./storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('STORAGE_KEYS.TENANT_BOOKING_POLICIES'), 'STORAGE_KEYS.TENANT_BOOKING_POLICIES kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.SELF_SERVICE_TOKEN_FAILURES'), 'STORAGE_KEYS.SELF_SERVICE_TOKEN_FAILURES kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.CLIENT_DEVICE_FINGERPRINT'), 'STORAGE_KEYS.CLIENT_DEVICE_FINGERPRINT kullanılmalı');
  assert.ok(content.includes('registerMemoryResetHook'), 'registerMemoryResetHook kaydedilmeli');
});

check('tenantService.ts storageKeys registry kullanmalıdır', () => {
  const content = fs.readFileSync(tenantServicePath, 'utf8');
  assert.ok(content.includes('from \'./storageKeys\'') || content.includes('from "./storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('STORAGE_KEYS.REGISTERED_TENANTS'), 'STORAGE_KEYS.REGISTERED_TENANTS kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.ACTIVE_TENANT_ID'), 'STORAGE_KEYS.ACTIVE_TENANT_ID kullanılmalı');
  assert.ok(content.includes('DYNAMIC_STORAGE_KEYS.tenantBrandingColon'), 'DYNAMIC_STORAGE_KEYS.tenantBrandingColon kullanılmalı');
});

check('localSelfServiceRepository.ts storageKeys registry kullanmalıdır', () => {
  const content = fs.readFileSync(localSelfServiceRepoPath, 'utf8');
  assert.ok(content.includes('from \'../storageKeys\'') || content.includes('from "../storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('STORAGE_KEYS.APPOINTMENT_ACCESS_TOKENS'), 'STORAGE_KEYS.APPOINTMENT_ACCESS_TOKENS kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.APPOINTMENT_CHANGE_REQUESTS'), 'STORAGE_KEYS.APPOINTMENT_CHANGE_REQUESTS kullanılmalı');
  assert.ok(content.includes('STORAGE_KEYS.ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY'), 'STORAGE_KEYS.ADMIN_RESCHEDULE_DECISION_IDEMPOTENCY kullanılmalı');
  assert.ok(content.includes('registerMemoryResetHook'), 'registerMemoryResetHook kaydedilmeli');
});

check('localBookingRepository.ts storageKeys registry kullanmalıdır', () => {
  const content = fs.readFileSync(localBookingRepoPath, 'utf8');
  assert.ok(content.includes('from \'../storageKeys\'') || content.includes('from "../storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('STORAGE_KEYS.TENANT_BOOKING_POLICIES') || content.includes('DYNAMIC_STORAGE_KEYS.tenantBookingPolicy'), 'STORAGE_KEYS / DYNAMIC_STORAGE_KEYS kullanılmalı');
  assert.ok(content.includes('DYNAMIC_STORAGE_KEYS.tenantAppointments'), 'DYNAMIC_STORAGE_KEYS.tenantAppointments kullanılmalı');
  assert.ok(content.includes('DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded'), 'DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded kullanılmalı');
});

check('localTenantRepository.ts registerMemoryResetHook kullanmalıdır', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'services/repositories/localTenantRepository.ts'), 'utf8');
  assert.ok(content.includes('from \'../storageKeys\'') || content.includes('from "../storageKeys"'), 'storageKeys import eksik');
  assert.ok(content.includes('registerMemoryResetHook'), 'registerMemoryResetHook kullanılmalı');
});

// ----------------------------------------------------------------------------
// Test 4: Hardcoded lari_* Temizliği Doğrulaması
// ----------------------------------------------------------------------------
console.log('\n--- BÖLÜM 4: Hardcoded lari_* String Kalıntısı Olmadığının Doğrulanması ---');

check('bookingAbuseProtectionService.ts içinde hardcoded lari_booking_attempts stringi kalmamalıdır', () => {
  const content = fs.readFileSync(abuseServicePath, 'utf8');
  assert.ok(!content.includes("'lari_booking_attempts'"), 'Hardcoded lari_booking_attempts stringi tespit edildi!');
  assert.ok(!content.includes("'lari_noshow_signals'"), 'Hardcoded lari_noshow_signals stringi tespit edildi!');
});

check('appointmentSelfServiceService.ts içinde hardcoded string kalmamalıdır', () => {
  const content = fs.readFileSync(selfServicePath, 'utf8');
  assert.ok(!content.includes("'lari_self_service_token_failures'"), 'Hardcoded token failures stringi tespit edildi!');
  assert.ok(!content.includes("'lari_client_device_fingerprint'"), 'Hardcoded client fingerprint stringi tespit edildi!');
});

check('localSelfServiceRepository.ts içinde hardcoded string kalmamalıdır', () => {
  const content = fs.readFileSync(localSelfServiceRepoPath, 'utf8');
  assert.ok(!content.includes("'lari_appointment_access_tokens'"), 'Hardcoded appointment tokens stringi tespit edildi!');
  assert.ok(!content.includes("'lari_appointment_change_requests'"), 'Hardcoded change requests stringi tespit edildi!');
  assert.ok(!content.includes("'lari_admin_reschedule_decision_idempotency'"), 'Hardcoded idempotency stringi tespit edildi!');
});

check('localBookingRepository.ts içinde hardcoded lari: appointments stringi kalmamalıdır', () => {
  const content = fs.readFileSync(localBookingRepoPath, 'utf8');
  assert.ok(!content.includes('`lari:${tenantId}:appointments`'), 'Hardcoded lari appointments literal tespit edildi!');
  assert.ok(!content.includes('`lari:${tenantId}:appointments_seeded`'), 'Hardcoded lari appointments_seeded literal tespit edildi!');
});

check('localBookingRepository.ts (FINDING-ADIM016-004): seeded appointment demo payload alanları byte-for-byte korunmalı ve yalnız storage anahtarı registry üzerinden değişmelidir', () => {
  const content = fs.readFileSync(localBookingRepoPath, 'utf8');
  assert.ok(content.includes('DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded(tenantId)'), 'DYNAMIC_STORAGE_KEYS.tenantAppointmentsSeeded kullanılmalıdır');
  assert.ok(content.includes('DYNAMIC_STORAGE_KEYS.tenantAppointments(tenantId)'), 'DYNAMIC_STORAGE_KEYS.tenantAppointments kullanılmalıdır');

  // Base-commit seeded appointment payload alanlarının byte-for-byte korunduğu doğrulanır
  assert.ok(content.includes("'Ahmet YÄ±lmaz'"), 'Base-commit seeded user_name Ahmet YÄ±lmaz korunmalıdır');
  assert.ok(content.includes("'AyÅŸe Kaya'"), 'Base-commit seeded user_name AyÅŸe Kaya korunmalıdır');
  assert.ok(content.includes("'Fatma Ã‡elik'"), 'Base-commit seeded user_name Fatma Ã‡elik korunmalıdır');
  assert.ok(content.includes("'Ä°ÅŸim Ã§Ä±ktÄ±'"), 'Base-commit seeded cancelReason Ä°ÅŸim Ã§Ä±ktÄ± korunmalıdır');

  // Negatif test: Yetkisiz payload sapmaları veya sessiz normalizasyonlar reddedilir
  assert.ok(!content.includes("'Ahmet Yılmaz'"), 'Ahmet Yılmaz demo payload sapması tespit edildi');
  assert.ok(!content.includes("'Ayşe Kaya'"), 'Ayşe Kaya demo payload sapması tespit edildi');
  assert.ok(!content.includes("'Fatma Çelik'"), 'Fatma Çelik demo payload sapması tespit edildi');
  assert.ok(!content.includes("'İşim çıktı'"), 'İşim çıktı demo payload sapması tespit edildi');
});

check('ADIM-016 kapsamında göç ettirilen servislerde (storageKeys.ts hariç) doğrudan lari_ veya lari: storage-key üretimi bulunmamalıdır', () => {
  const migratedFiles = [
    'services/bookingAbuseProtectionService.ts',
    'services/appointmentSelfServiceService.ts',
    'services/auditLogService.ts',
    'services/authService.ts',
    'services/branchService.ts',
    'services/communicationEventService.ts',
    'services/communicationProviderConfigService.ts',
    'services/consentLedgerService.ts',
    'services/customerService.ts',
    'services/dataRightsRequestService.ts',
    'services/incidentResponseService.ts',
    'services/legalDocumentService.ts',
    'services/policyAcceptanceService.ts',
    'services/repositories/localAuditEventRepository.ts',
    'services/repositories/localBookingRepository.ts',
    'services/repositories/localCommunicationOutboxRepository.ts',
    'services/repositories/localPolicyAndConsentRepository.ts',
    'services/repositories/localSelfServiceRepository.ts',
    'services/repositories/localSupportTicketRepository.ts',
    'services/repositories/localTenantRepository.ts',
    'services/supportTicketService.ts',
    'services/tenantService.ts'
  ];

  const violations = [];
  for (const rel of migratedFiles) {
    const fullPath = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const regex = /(?:localStorage|sessionStorage|dataProvider)\s*\.\s*(?:getItem|setItem|removeItem|set|get|getList)\s*\(\s*[`'"]lari[_:][^`'"]*[`'"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      violations.push(`${path.basename(rel)}: ${match[0]}`);
    }
  }
  assert.strictEqual(violations.length, 0, `Doğrudan anahtar üretimi tespit edildi: ${violations.join(', ')}`);
});

// ----------------------------------------------------------------------------
// Test 5: Canlı Runtime Testi (esbuild ile derlenen services/storageKeys.ts)
// ----------------------------------------------------------------------------
console.log('\n--- BÖLÜM 5: Canlı Runtime Doğrulaması (services/storageKeys.ts) ---');

const bundle = esbuild.buildSync({
  stdin: {
    contents: `
      export * from './services/storageKeys.ts';
      export { LocalTenantRepository } from './services/repositories/localTenantRepository.ts';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
});

const tempPath = path.resolve(process.cwd(), 'scripts/.temp_storage_keys_live_qa.mjs');
fs.writeFileSync(tempPath, bundle.outputFiles[0].text);
let liveStorageKeys;
try {
  liveStorageKeys = await import('./.temp_storage_keys_live_qa.mjs');
} finally {
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}

check('Canlı runtime: STORAGE_KEYS tüm kritik anahtarları doğru lari_ önekiyle içerir', () => {
  assert.ok(liveStorageKeys.STORAGE_KEYS, 'STORAGE_KEYS tanımsız');
  for (const [key, value] of Object.entries(liveStorageKeys.STORAGE_KEYS)) {
    assert.ok(typeof value === 'string', `${key} değeri string olmalı`);
    assert.ok(value.startsWith('lari_'), `${key} (${value}) lari_ öneki ile başlamalı`);
  }
});

check('Canlı runtime: DYNAMIC_STORAGE_KEYS fonksiyonları doğru formatta anahtar üretir', () => {
  const dyn = liveStorageKeys.DYNAMIC_STORAGE_KEYS;
  assert.strictEqual(dyn.tenantBookingPolicy('t_1'), 'lari_tenant_booking_policies_t_1');
  assert.strictEqual(dyn.tenantBranches('t_1'), 'lari_branches_t_1');
  assert.strictEqual(dyn.tenantCustomerConsents('t_1'), 'lari_customer_consents_by_tenant_t_1');
  assert.strictEqual(dyn.tenantCustomerProfile('t_1'), 'lari_customer_profile_t_1');
  assert.strictEqual(dyn.tenantBrandingColon('t_1'), 'lari:t_1:branding');
  assert.strictEqual(dyn.tenantAppointments('t_1'), 'lari:t_1:appointments');
  assert.strictEqual(dyn.tenantAppointmentsSeeded('t_1'), 'lari:t_1:appointments_seeded');
});

check('Canlı runtime: isLariStorageKey doğru filtreleme yapar', () => {
  const isLari = liveStorageKeys.isLariStorageKey;
  assert.strictEqual(isLari('lari_booking_attempts'), true);
  assert.strictEqual(isLari('lari:demo:branding'), true);
  assert.strictEqual(isLari('google_tag'), false);
  assert.strictEqual(isLari(null), false);
  assert.strictEqual(isLari(123), false);
});

check('Canlı runtime: purgeAllLariStorage mock storage üzerinde namespace izolasyonunu korur', () => {
  const storage = new MockLocalStorage();
  storage.setItem('lari_booking_attempts', 'data1');
  storage.setItem('lari:demo:branding', 'data2');
  storage.setItem('external_session', 'sess_123');

  let hookRun = false;
  const unregister = liveStorageKeys.registerMemoryResetHook(() => {
    hookRun = true;
  });

  const res = liveStorageKeys.purgeAllLariStorage(storage);
  assert.strictEqual(res.removedKeys.length, 2);
  assert.strictEqual(storage.getItem('external_session'), 'sess_123');
  assert.strictEqual(storage.getItem('lari_booking_attempts'), null);
  assert.strictEqual(storage.getItem('lari:demo:branding'), null);
  assert.strictEqual(hookRun, true);

  unregister();
});

check('Canlı runtime (FINDING-002): LocalTenantRepository instance memory state resetStorage ile sıfırlanmalıdır', () => {
  const mockStorage = new MockLocalStorage();
  const origLocal = globalThis.localStorage;
  globalThis.localStorage = mockStorage;

  try {
    const repo = new liveStorageKeys.LocalTenantRepository();
    repo.setActiveTenant('tenant_A');
    assert.strictEqual(repo.getActiveTenantId(), 'tenant_A', 'setActiveTenant sonrası tenant_A olmalı');

    // Run resetStorage
    liveStorageKeys.resetStorage(mockStorage);

    // Assert same instance now returns null (in-memory cache cleared via registered reset hook)
    assert.strictEqual(repo.getActiveTenantId(), null, 'resetStorage sonrası getActiveTenantId null olmalı');
  } finally {
    globalThis.localStorage = origLocal;
  }
});

check('Canlı runtime (FINDING-003): purgeAllLariStorage hata durumunda sessiz başarı dönmemeli, diğer anahtarları temizlemeli ve dış veriyi korumalıdır', () => {
  const failingStorage = new MockLocalStorage();
  failingStorage.setItem('lari_key_1', 'val1');
  failingStorage.setItem('lari_faulty_key', 'val2');
  failingStorage.setItem('lari_key_3', 'val3');
  failingStorage.setItem('external_session_cookie', 'safe_ext_value');

  const originalRemove = failingStorage.removeItem.bind(failingStorage);
  failingStorage.removeItem = (key) => {
    if (key === 'lari_faulty_key') {
      throw new Error('Simulated storage write-protection failure on key: ' + key);
    }
    originalRemove(key);
  };

  let hookCalled = false;
  const unregisterHook = liveStorageKeys.registerMemoryResetHook(() => {
    hookCalled = true;
  });

  try {
    // 1. throwOnError: true (varsayılan) ile StoragePurgeError fırlatılmalı (sessiz başarı dönülmemeli!)
    assert.throws(
      () => liveStorageKeys.purgeAllLariStorage(failingStorage),
      (err) => {
        assert.ok(err instanceof liveStorageKeys.StoragePurgeError || err.name === 'StoragePurgeError', 'StoragePurgeError fırlatılmalı');
        assert.ok(err.failures && err.failures.length > 0, 'failures listesi dolu olmalı');
        assert.ok(err.failures.some(f => f.key === 'lari_faulty_key'), 'lari_faulty_key hatası kaydedilmiş olmalı');
        return true;
      },
      'Sessiz başarı dönmemeli, StoragePurgeError fırlatılmalı'
    );

    // 2. Diğer anahtarların silinmeye çalışıldığı doğrulanmalı
    assert.strictEqual(failingStorage.getItem('lari_key_1'), null, 'lari_key_1 silinmiş olmalı');
    assert.strictEqual(failingStorage.getItem('lari_key_3'), null, 'lari_key_3 silinmiş olmalı');
    assert.strictEqual(failingStorage.getItem('lari_faulty_key'), 'val2', 'Hatalı anahtar storage içinde kalır');

    // 3. Dış namespace verisi kesinlikle korunmalı
    assert.strictEqual(failingStorage.getItem('external_session_cookie'), 'safe_ext_value', 'Dış namespace anahtarı silinmemeli');

    // 4. In-memory hook yine de çalışmış olmalı
    assert.strictEqual(hookCalled, true, 'Hata oluşsa bile memory reset kancaları çalıştırılmalı');

    // 5. throwOnError: false seçeneği ile explicit failure sonucu dönmeli
    const explicitResult = liveStorageKeys.purgeAllLariStorage(failingStorage, { throwOnError: false });
    assert.strictEqual(explicitResult.ok, false, 'explicit failure sonucu ok: false olmalı');
    assert.ok(explicitResult.failures.length > 0, 'failures listesi mevcut olmalı');
  } finally {
    unregisterHook();
  }
});

check('Canlı runtime: purgeLariStorage ve resetStorage referans eşitliği sağlar', () => {
  assert.strictEqual(liveStorageKeys.purgeLariStorage, liveStorageKeys.purgeAllLariStorage);
  assert.strictEqual(liveStorageKeys.resetStorage, liveStorageKeys.purgeAllLariStorage);
});

// ----------------------------------------------------------------------------
// Sonuç ve Özet
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log(`🏁 [ADIM-016] TEST SONUCU: ${passedChecks}/${totalChecks} Kontrol Başarılı!`);
console.log('='.repeat(80));

if (passedChecks === totalChecks) {
  console.log('✨ V1A-TECH-01 depolama anahtarları merkezileştirmesi eksiksiz ve hatasız doğrulandı.');
  process.exit(0);
} else {
  console.error('❌ Bazı kontroller başarısız oldu!');
  process.exit(1);
}
