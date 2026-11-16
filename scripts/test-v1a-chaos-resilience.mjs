/**
 * scripts/test-v1a-chaos-resilience.mjs
 * ============================================================================
 * LARİ — [LARI-PILOT5-011] V1A-PREFLIGHT-04: Ağ Kesintisi, Fail-Closed Outbox &
 * Kurtarma Kaos Testi
 *
 * Kanonik Görev & Hedef:
 * Bildirim/Outbox kuyruğunda dış sağlayıcı zaman aşımı (504/ECONNRESET) simüle
 * edildiğinde randevu kaydının bozulmadığını, outbox kaydının dead_letter/retry_scheduled
 * durumuna güvenli geçtiğini ve eksik/hatalı ortam değişkenlerinde sistemin
 * Fail-Closed olarak güvenli hata verdiğini doğrulayan uçtan uca kaos testi.
 *
 * Sıfır maliyet (0 TL) ve sıfır harici ağ çıkışı (Zero Network Egress) garantili.
 * ============================================================================
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Technical Guardrail: Normalization
process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.VITE_DATA_MODE = 'mock';
process.env.VITE_APP_BASE_DOMAIN = 'randevulari.com';
try {
  if (typeof import.meta !== 'undefined') {
    if (!import.meta.env) import.meta.env = {};
    import.meta.env.VITE_DATA_MODE = 'mock';
    import.meta.env.VITE_APP_BASE_DOMAIN = 'randevulari.com';
  }
} catch (e) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// Global Test Harness: Headless Window, Synthetic Storage & Zero Egress Fetch
// -----------------------------------------------------------------------------
class SyntheticStorage {
  constructor() {
    this.map = new Map();
    this.failReads = false;
    this.failWrites = false;
  }

  getItem(key) {
    if (this.failReads) throw new Error('SYNTHETIC_READ_FAILURE: Storage read I/O error');
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, val) {
    if (this.failWrites) throw new Error('SYNTHETIC_WRITE_FAILURE: Storage quota/disk write error');
    this.map.set(key, String(val));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get length() {
    return this.map.size;
  }

  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const mockLocalStorage = new SyntheticStorage();
const mockSessionStorage = new SyntheticStorage();

globalThis.localStorage = mockLocalStorage;
global.localStorage = mockLocalStorage;
globalThis.sessionStorage = mockSessionStorage;
global.sessionStorage = mockSessionStorage;

globalThis.window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: {
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost/'
  }
};
global.window = globalThis.window;

// Strict fetch interceptor to guarantee Zero Network Egress (0 TL)
let interceptedNetworkCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  // Loopback HTTP traffic to local test server is permitted if present
  if (urlStr.startsWith('http://127.0.0.1:') || urlStr.startsWith('http://localhost:')) {
    return {
      ok: true,
      status: 200,
      text: async () => '{"status":"ok"}',
      json: async () => ({ status: 'ok' })
    };
  }
  // Any external network egress is strictly forbidden
  interceptedNetworkCalls++;
  throw new Error(`SECURITY_VIOLATION_EGRESS_BLOCKED: External network request to '${urlStr}' is forbidden.`);
};

// -----------------------------------------------------------------------------
// Dynamic TS module loading via tsx
// -----------------------------------------------------------------------------
const {
  CommunicationDeliveryService
} = await import('../services/communicationDeliveryService.ts');

const {
  LocalCommunicationOutboxRepository
} = await import('../services/repositories/localCommunicationOutboxRepository.ts');

const {
  resolveDataSourceMode
} = await import('../services/dataSourceModeResolver.ts');

const {
  environmentPreflightService
} = await import('../services/environmentPreflightService.ts');

const {
  fetchSupabase,
  getSupabaseClientConfig
} = await import('../services/repositories/supabaseClient.ts');

const {
  createAppointment,
  createAppointmentSafely
} = await import('../services/appointmentService.ts');

const {
  getBookingRepository
} = await import('../services/repositories/index.ts');

const {
  STORAGE_KEYS
} = await import('../services/storageKeys.ts');

// -----------------------------------------------------------------------------
// Test Execution Suite & Reporting
// -----------------------------------------------------------------------------
let totalPassed = 0;
let totalFailed = 0;
const testResults = [];

async function test(name, fn) {
  try {
    await fn();
    totalPassed++;
    testResults.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    totalFailed++;
    testResults.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}`);
    console.error(`         -> ${err.stack || err.message}`);
  }
}

async function expectReject(promise, expectedSubstring, errorMsg) {
  let threw = false;
  let actualMessage = '';
  try {
    await promise;
  } catch (err) {
    threw = true;
    actualMessage = err?.message || String(err);
  }
  assert.ok(threw, `${errorMsg}: expected promise to reject, but it resolved`);
  if (expectedSubstring) {
    assert.ok(
      actualMessage.includes(expectedSubstring),
      `${errorMsg}: expected error message to include '${expectedSubstring}', got '${actualMessage}'`
    );
  }
}

console.log('================================================================================');
console.log('LARİ — [LARI-PILOT5-011] V1A-PREFLIGHT-04: Ağ Kesintisi & Fail-Closed Kaos Testi');
console.log('================================================================================');

// =============================================================================
// SECTION 1: Dış Sağlayıcı Zaman Aşımı (HTTP 504 Gateway Timeout) Simülasyonu
// =============================================================================
console.log('\n[Suite 1] Dış Sağlayıcı Zaman Aşımı (HTTP 504 Gateway Timeout) Kaos Senaryosu');

await test('1.1: CommunicationDeliveryService 504 Gateway Timeout hatasını isRetryable olarak tanımalıdır', () => {
  assert.equal(CommunicationDeliveryService.isRetryableError(504), true, '504 Gateway Timeout retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(502), true, '502 Bad Gateway retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(503), true, '503 Service Unavailable retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(500), true, '500 Internal Error retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(429), true, '429 Rate Limited retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(400), false, '400 Bad Request retryable OLMAMALIDIR');
  assert.equal(CommunicationDeliveryService.isRetryableError(401), false, '401 Unauthorized retryable OLMAMALIDIR');
  assert.equal(CommunicationDeliveryService.isRetryableError(403), false, '403 Forbidden retryable OLMAMALIDIR');
});

await test('1.2: Dış sağlayıcı 504 döndüğünde outbox kaydı retry_scheduled durumuna güvenle geçmelidir', () => {
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_504_test_1',
    tenantId: 'tenant-alpha',
    channel: 'sms',
    recipient: '+905551112233',
    templateId: 'booking_confirmation',
    templateArgs: { customerName: 'Ali Demir' },
    body: 'Randevunuz onaylandı.',
    consentGranted: true
  });

  deliveryService.queueIntent(intent.intentId);
  assert.equal(intent.status, 'queued');

  // Simulate 504 Gateway Timeout from external upstream provider
  const result = deliveryService.handleTransientFailure(intent.intentId, {
    statusCode: 504,
    errorCode: 'GATEWAY_TIMEOUT',
    errorMessage: 'Upstream SMS Gateway timed out after 10000ms',
    providerName: 'mock_sms_gateway'
  });

  assert.equal(result.status, 'retry_scheduled', 'Status retry_scheduled olmalıdır');
  assert.equal(result.retryCount, 1, 'retryCount 1 olmalıdır');
  assert.equal(result.terminal, false, 'İlk denemede terminal OLMAMALIDIR');
  assert.ok(result.nextRetryAt, 'nextRetryAt belirlenmiş olmalıdır');
  assert.ok(new Date(result.nextRetryAt).getTime() >= Date.now(), 'nextRetryAt gelecekte olmalıdır');

  const storedIntent = deliveryService.getIntent(intent.intentId);
  assert.equal(storedIntent.status, 'retry_scheduled', 'Intent bellekte retry_scheduled olarak saklanmalıdır');
  assert.equal(storedIntent.retryCount, 1);
  assert.ok(storedIntent.failureReason.includes('GATEWAY_TIMEOUT') || storedIntent.failureReason.includes('504'));
});

// =============================================================================
// SECTION 2: Ağ Kesintisi ve Soket Kopması (ECONNRESET & ETIMEDOUT) Kaos Testi
// =============================================================================
console.log('\n[Suite 2] Ağ Kesintisi ve Soket Kopması (ECONNRESET / ETIMEDOUT) Kaos Senaryosu');

await test('2.1: CommunicationDeliveryService ECONNRESET, ETIMEDOUT ve NETWORK_TIMEOUT hatalarını tanımalıdır', () => {
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'ECONNRESET'), true, 'ECONNRESET retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'ETIMEDOUT'), true, 'ETIMEDOUT retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'NETWORK_TIMEOUT'), true, 'NETWORK_TIMEOUT retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'CONNECTION_RESET'), true, 'CONNECTION_RESET retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'ECONNREFUSED'), true, 'ECONNREFUSED retryable olmalıdır');
  assert.equal(CommunicationDeliveryService.isRetryableError(undefined, 'INVALID_RECIPIENT_NUMBER'), false, 'Geçersiz alıcı numarası retryable OLMAMALIDIR');
});

await test('2.2: Soket sıfırlandığında (ECONNRESET) outbox kaydı retry_scheduled durumuna geçmelidir', () => {
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_econnreset_test_1',
    tenantId: 'tenant-alpha',
    channel: 'whatsapp',
    recipient: '+905559998877',
    templateId: 'booking_created',
    templateArgs: { customerName: 'Zeynep Kaya' },
    body: 'Randevunuz oluşturuldu.',
    consentGranted: true
  });

  deliveryService.queueIntent(intent.intentId);

  // Simulating socket reset by peer during TLS handshake
  const result = deliveryService.handleTransientFailure(intent.intentId, {
    errorCode: 'ECONNRESET',
    errorMessage: 'read ECONNRESET - connection abruptly closed by remote server',
    providerName: 'mock_whatsapp_gateway'
  });

  assert.equal(result.status, 'retry_scheduled');
  assert.equal(result.terminal, false);
  assert.equal(result.retryCount, 1);

  const updatedIntent = deliveryService.getIntent(intent.intentId);
  assert.equal(updatedIntent.status, 'retry_scheduled');
});

await test('2.3: LocalCommunicationOutboxRepository scheduleRetry metodu event durumunu retry_scheduled yapmalıdır', async () => {
  mockLocalStorage.clear();
  const repository = new LocalCommunicationOutboxRepository();
  const event = await repository.enqueueEvent('tenant-alpha', {
    id: 'outbox_econnreset_repo_1',
    channel: 'sms',
    recipient: '+905554443322',
    body: 'Test bildirimi',
    status: 'queued'
  });

  assert.equal(event.status, 'queued');

  // Schedule retry on network failure
  const updated = await repository.scheduleRetry('tenant-alpha', 'outbox_econnreset_repo_1', {
    reason: 'Underlying socket ECONNRESET during delivery',
    delayMs: 2000
  });

  assert.equal(updated.status, 'retry_scheduled');
  assert.equal(updated.retryCount, 1);
  assert.ok(updated.nextRetryAt);

  const list = await repository.listEvents('tenant-alpha', { status: 'retry_scheduled' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'outbox_econnreset_repo_1');
});

// =============================================================================
// SECTION 3: Yeniden Deneme Kotası Aşımı ve Dead Letter (DLQ) İzolasyonu
// =============================================================================
console.log('\n[Suite 3] Retry Kotası Aşımı ve Dead Letter Queue (DLQ) İzolasyonu');

await test('3.1: 3 ardışık 504/ECONNRESET denemesi sonunda intent otomatik olarak dead_letter durumuna geçmelidir', () => {
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_dlq_exhaustion_test',
    tenantId: 'tenant-beta',
    channel: 'sms',
    recipient: '+905552223344',
    templateId: 'reminder',
    templateArgs: {},
    body: 'Hatırlatma iletisi',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  // Attempt 1: 504 Timeout
  const res1 = deliveryService.handleTransientFailure(intent.intentId, {
    statusCode: 504,
    errorCode: 'GATEWAY_TIMEOUT',
    errorMessage: 'Attempt 1 timeout'
  });
  assert.equal(res1.status, 'retry_scheduled');
  assert.equal(res1.retryCount, 1);
  assert.equal(res1.terminal, false);

  // Intent can be requeued for attempt 2
  deliveryService.queueIntent(intent.intentId);

  // Attempt 2: ECONNRESET
  const res2 = deliveryService.handleTransientFailure(intent.intentId, {
    errorCode: 'ECONNRESET',
    errorMessage: 'Attempt 2 connection reset'
  });
  assert.equal(res2.status, 'retry_scheduled');
  assert.equal(res2.retryCount, 2);
  assert.equal(res2.terminal, false);

  deliveryService.queueIntent(intent.intentId);

  // Attempt 3: 504 Timeout (Max attempts = 3 reached)
  const res3 = deliveryService.handleTransientFailure(intent.intentId, {
    statusCode: 504,
    errorCode: 'GATEWAY_TIMEOUT',
    errorMessage: 'Attempt 3 timeout'
  });
  assert.equal(res3.status, 'dead_letter', '3. deneme sonrasında dead_letter durumuna geçmelidir');
  assert.equal(res3.retryCount, 3);
  assert.equal(res3.terminal, true, 'Terminal failure olarak işaretlenmelidir');

  const finalIntent = deliveryService.getIntent(intent.intentId);
  assert.equal(finalIntent.status, 'dead_letter');
  assert.ok(finalIntent.failureReason.includes('exhausted'), 'Gerekçe retry exhausted içermelidir');

  const failures = deliveryService.getFailuresForIntent(intent.intentId);
  const terminalFailure = failures.find(f => f.terminal);
  assert.ok(terminalFailure, 'Terminal failure kaydı bulunmalıdır');
  assert.equal(terminalFailure.failureType, 'RETRY_EXHAUSTED');
});

await test('3.2: Fail-Closed Güvenlik: dead_letter durumundaki kayıt keyfi olarak queued durumuna geri alınamaz', () => {
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_dead_letter_lock',
    tenantId: 'tenant-beta',
    channel: 'sms',
    recipient: '+905553332211',
    templateId: 'alert',
    templateArgs: {},
    body: 'Kritik uyarı',
    consentGranted: true
  });

  deliveryService.moveToDeadLetter(intent.intentId, 'Permanent outage', 'FATAL_TIMEOUT');
  assert.equal(intent.status, 'dead_letter');

  // Attempting to queue dead_letter must reject fail-closed
  assert.throws(() => {
    deliveryService.queueIntent(intent.intentId);
  }, /Cannot queue dead_letter intent/);

  // Only explicit authorized administrative revival can move it
  assert.throws(() => {
    deliveryService.reviveDeadLetter(intent.intentId, '');
  }, /Authorized actor ID is required/);

  const revived = deliveryService.reviveDeadLetter(intent.intentId, 'admin_super_user');
  assert.equal(revived.status, 'rendered', 'Revival sonrasında intent rendered olmalı ve denetim izi bırakmalıdır');
  assert.equal(revived.metadata?.revivedBy, 'admin_super_user');
});

await test('3.3: LocalCommunicationOutboxRepository dead_letter durumunu queued yapmaya çalışan istekleri fail-closed reddetmelidir', async () => {
  mockLocalStorage.clear();
  const repo = new LocalCommunicationOutboxRepository();
  await repo.enqueueEvent('tenant-beta', {
    id: 'outbox_dlq_lock_1',
    status: 'queued',
    channel: 'whatsapp',
    body: 'Deneme'
  });

  await repo.moveToDeadLetter('tenant-beta', 'outbox_dlq_lock_1', 'Max retries exhausted');
  const events = await repo.listEvents('tenant-beta');
  const ev = events.find(e => e.id === 'outbox_dlq_lock_1');
  assert.equal(ev.status, 'dead_letter');

  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_dlq_lock_1', 'queued'),
    'Local outbox cannot move terminal status \'dead_letter\' back to \'queued\'',
    'dead_letter durumu queued yapılamamalıdır'
  );
});

await test('3.4: dead_letter durumundan scheduleRetry, rendered ve retry_scheduled geçişleri kesinlikle reddedilmelidir', async () => {
  mockLocalStorage.clear();
  // 1. Test in CommunicationDeliveryService
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_dead_letter_transitions',
    tenantId: 'tenant-beta',
    channel: 'sms',
    recipient: '+905553332211',
    templateId: 'alert',
    templateArgs: {},
    body: 'Kritik uyarı',
    consentGranted: true
  });
  deliveryService.moveToDeadLetter(intent.intentId, 'Permanent outage', 'FATAL_TIMEOUT');
  assert.equal(intent.status, 'dead_letter');

  // Negative test: dead_letter -> scheduleRetry
  assert.throws(() => {
    deliveryService.scheduleRetry(intent.intentId, { delayMs: 1000 });
  }, /Cannot schedule retry for dead_letter intent/, 'dead_letter durumundaki intent scheduleRetry yapılamamalıdır');

  // 2. Test in LocalCommunicationOutboxRepository
  const repo = new LocalCommunicationOutboxRepository();
  await repo.enqueueEvent('tenant-beta', {
    id: 'outbox_dlq_trans_1',
    status: 'queued',
    channel: 'sms',
    body: 'DLQ transition test'
  });
  await repo.moveToDeadLetter('tenant-beta', 'outbox_dlq_trans_1', 'Exhausted retries');

  // Negative test: dead_letter -> scheduleRetry
  await expectReject(
    repo.scheduleRetry('tenant-beta', 'outbox_dlq_trans_1', { delayMs: 1000 }),
    'Cannot schedule retry for dead_letter event',
    'dead_letter durumundaki outbox kaydına scheduleRetry çağrısı reddedilmelidir'
  );

  // Negative test: dead_letter -> rendered
  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_dlq_trans_1', 'rendered'),
    'Local outbox cannot move terminal status \'dead_letter\' back to \'rendered\'',
    'dead_letter durumu rendered yapılamamalıdır'
  );

  // Negative test: dead_letter -> retry_scheduled
  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_dlq_trans_1', 'retry_scheduled'),
    'Local outbox cannot move terminal status \'dead_letter\' back to \'retry_scheduled\'',
    'dead_letter durumu retry_scheduled yapılamamalıdır'
  );
});

await test('3.5: skipped (rıza verilmeyen) kayıt moveToDeadLetter ile veya zincirleme olarak rendered, retry_scheduled veya queued yapılamaz', async () => {
  mockLocalStorage.clear();

  // 1. Test in CommunicationDeliveryService
  const deliveryService = new CommunicationDeliveryService();
  const skippedIntent = deliveryService.createIntent({
    intentId: 'intent_consent_denied_chain',
    tenantId: 'tenant-beta',
    channel: 'sms',
    recipient: '+905554445566',
    templateId: 'promo',
    templateArgs: {},
    body: 'Rıza verilmeyen ileti',
    consentGranted: false,
    consentDenialReason: 'Customer opted out'
  });
  assert.equal(skippedIntent.status, 'skipped');
  assert.equal(skippedIntent.consentVerified, false);

  // Negative test: skipped -> moveToDeadLetter must be rejected
  assert.throws(() => {
    deliveryService.moveToDeadLetter(skippedIntent.intentId, 'Attempting DLQ bypass', 'BYPASS_ATTEMPT');
  }, /Cannot move skipped intent.*to dead_letter/, 'skipped kayıt moveToDeadLetter ile dead_letter durumuna taşınamamalıdır');

  // Negative test: skipped -> queueIntent must be rejected
  assert.throws(() => {
    deliveryService.queueIntent(skippedIntent.intentId);
  }, /Cannot queue skipped intent/, 'skipped kayıt queueIntent ile queued yapılamamalıdır');

  // Negative test: skipped -> scheduleRetry must be rejected
  assert.throws(() => {
    deliveryService.scheduleRetry(skippedIntent.intentId);
  }, /Cannot schedule retry for skipped intent/, 'skipped kayıt scheduleRetry ile retry_scheduled yapılamamalıdır');

  // Negative test: reviveDeadLetter must refuse records where consentVerified=false
  const forgedDeadLetter = deliveryService.createIntent({
    intentId: 'intent_forged_revival',
    tenantId: 'tenant-beta',
    channel: 'sms',
    recipient: '+905554445577',
    templateId: 'promo',
    templateArgs: {},
    body: 'İkinci ileti',
    consentGranted: false
  });
  forgedDeadLetter.status = 'dead_letter';
  assert.throws(() => {
    deliveryService.reviveDeadLetter(forgedDeadLetter.intentId, 'admin_super');
  }, /customer consent was not verified/, 'consentVerified=false olan kayıt reviveDeadLetter ile canlandırılamamalıdır');

  // 2. Test in LocalCommunicationOutboxRepository
  const repo = new LocalCommunicationOutboxRepository();
  await repo.enqueueEvent('tenant-beta', {
    id: 'outbox_skipped_chain_1',
    status: 'skipped',
    channel: 'sms',
    body: 'Rızasız outbox kaydı'
  });

  // Negative test: skipped -> moveToDeadLetter
  await expectReject(
    repo.moveToDeadLetter('tenant-beta', 'outbox_skipped_chain_1', 'Bypass attempt'),
    'Cannot move skipped event',
    'skipped outbox kaydı moveToDeadLetter ile taşınamamalıdır'
  );

  // Negative test: skipped -> scheduleRetry
  await expectReject(
    repo.scheduleRetry('tenant-beta', 'outbox_skipped_chain_1'),
    'Cannot schedule retry for skipped event',
    'skipped outbox kaydı scheduleRetry ile retry_scheduled yapılamamalıdır'
  );

  // Negative test: skipped -> rendered via updateDeliveryStatus
  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_skipped_chain_1', 'rendered'),
    'Local outbox cannot move terminal status \'skipped\' back to \'rendered\'',
    'skipped outbox kaydı rendered yapılamamalıdır'
  );

  // Negative test: skipped -> retry_scheduled via updateDeliveryStatus
  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_skipped_chain_1', 'retry_scheduled'),
    'Local outbox cannot move terminal status \'skipped\' back to \'retry_scheduled\'',
    'skipped outbox kaydı retry_scheduled yapılamamalıdır'
  );

  // Negative test: skipped -> queued via updateDeliveryStatus
  await expectReject(
    repo.updateDeliveryStatus('tenant-beta', 'outbox_skipped_chain_1', 'queued'),
    'Local outbox cannot move terminal status \'skipped\' back to \'queued\'',
    'skipped outbox kaydı queued yapılamamalıdır'
  );

  // Verify status is still skipped
  const finalEvents = await repo.listEvents('tenant-beta');
  const finalEv = finalEvents.find(e => e.id === 'outbox_skipped_chain_1');
  assert.equal(finalEv.status, 'skipped', 'skipped kaydın durumu değişmeden skipped kalmalıdır');
});

// =============================================================================
// SECTION 4: Zehirli Mesaj (Poison Message / Malformed Payload) İzolasyonu
// =============================================================================
console.log('\n[Suite 4] Zehirli Mesaj (Poison Message / Malformed Payload) DLQ İzolasyonu');

await test('4.1: Zehirli / bozuk yük tespit edildiğinde retry yapılmadan doğrudan dead_letter karantinasına alınmalıdır', () => {
  const deliveryService = new CommunicationDeliveryService();
  const intent = deliveryService.createIntent({
    intentId: 'intent_poison_1',
    tenantId: 'tenant-gamma',
    channel: 'sms',
    recipient: '+905557778899',
    templateId: 'poison_sample',
    templateArgs: {},
    body: '\x00\x01\x02MALFORMED_UNESCAPED_CONTROL_CHARS',
    consentGranted: true
  });

  deliveryService.queueIntent(intent.intentId);

  // Direct quarantine on poison message detection
  const deadLetterIntent = deliveryService.moveToDeadLetter(
    intent.intentId,
    'POISON_PAYLOAD: Unescaped illegal control sequence cannot be serialized',
    'POISON_MESSAGE'
  );

  assert.equal(deadLetterIntent.status, 'dead_letter');
  assert.equal(deadLetterIntent.failureReason, 'POISON_PAYLOAD: Unescaped illegal control sequence cannot be serialized');

  const failures = deliveryService.getFailuresForIntent(intent.intentId);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].failureType, 'POISON_MESSAGE');
  assert.equal(failures[0].terminal, true);
});

await test('4.2: Zehirli mesaj kuyruktaki sonraki meşru mesajların işlenmesini kilitlememelidir (No Head-of-Line Blocking)', () => {
  const deliveryService = new CommunicationDeliveryService();
  
  // Message 1: Poison
  const msg1 = deliveryService.createIntent({
    intentId: 'msg_poison',
    tenantId: 'tenant-gamma',
    channel: 'sms',
    recipient: '+905551110001',
    templateId: 'temp1',
    templateArgs: {},
    body: 'BAD_PAYLOAD',
    consentGranted: true
  });
  deliveryService.queueIntent(msg1.intentId);
  deliveryService.moveToDeadLetter(msg1.intentId, 'Poison message quarantined', 'POISON_MESSAGE');

  // Message 2: Legitimate subsequent message
  const msg2 = deliveryService.createIntent({
    intentId: 'msg_legit',
    tenantId: 'tenant-gamma',
    channel: 'sms',
    recipient: '+905551110002',
    templateId: 'temp1',
    templateArgs: {},
    body: 'GOOD_PAYLOAD',
    consentGranted: true
  });
  deliveryService.queueIntent(msg2.intentId);
  assert.equal(msg2.status, 'queued');

  // Successful dispatch of message 2
  deliveryService.recordDispatchAttempt({
    intentId: msg2.intentId,
    tenantId: 'tenant-gamma',
    providerName: 'mock_sms_gateway',
    attemptNumber: 1,
    status: 'accepted',
    httpStatusCode: 200
  });

  deliveryService.recordProviderAcceptance({
    receiptId: 'rcpt_legit_1',
    intentId: msg2.intentId,
    tenantId: 'tenant-gamma',
    providerMessageId: 'prov_legit_msg_1',
    providerName: 'mock_sms_gateway',
    acceptedAt: new Date().toISOString(),
    signatureVerified: true
  });

  assert.equal(deliveryService.getIntent(msg2.intentId).status, 'accepted_by_provider');
  assert.equal(deliveryService.getIntent(msg1.intentId).status, 'dead_letter');
});

// =============================================================================
// SECTION 5: Randevu Kaydının Bütünlüğü ve Bozulmazlığı (Appointment Non-Corruption)
// =============================================================================
console.log('\n[Suite 5] Randevu Kaydının Bütünlüğü ve Bozulmazlığı (Appointment Non-Corruption Under Outbox Chaos)');

await test('5.1: Bildirim/Outbox aşamasında dış sağlayıcı zaman aşımı (504) simüle edildiğinde randevu kaydı ASLA bozulmamalıdır', async () => {
  mockLocalStorage.clear();
  const bookingRepo = getBookingRepository();
  const testTenantId = 'tenant_resilience_salon';

  // Seed minimum business / tenant metadata in storage
  mockLocalStorage.setItem(`lari_tenant_${testTenantId}`, JSON.stringify({
    id: testTenantId,
    name: 'Dayanıklılık Test Salonu',
    domain: 'resilience.randevulari.com'
  }));

  // Create appointment
  const aptData = {
    serviceId: 'srv_haircut_1',
    staffId: 'staff_1',
    date: '2026-11-20',
    time: '14:00',
    duration: 30,
    price: 450,
    customer_name: 'Ahmet Yılmaz',
    customer_phone: '+905551234567',
    status: 'confirmed',
    notes: 'Chaos test randevusu'
  };

  const safeResult = await createAppointmentSafely(testTenantId, aptData);
  assert.ok(safeResult, 'Randevu sonucu dönmelidir');
  assert.equal(safeResult.success, true, 'Randevu oluşturma başarılı olmalıdır');
  const newAppointment = safeResult.appointment;
  assert.ok(newAppointment, 'Randevu nesnesi bulunmalıdır');
  assert.ok(newAppointment.id, 'Randevu ID oluşturulmalıdır');
  assert.equal(newAppointment.tenantId, testTenantId);
  assert.equal(newAppointment.customer_name, 'Ahmet Yılmaz');

  // Verify appointment in booking repository
  const fetchedAppointment = await bookingRepo.getAppointmentById(newAppointment.id);
  assert.ok(fetchedAppointment, 'Randevu depoda bulunmalıdır');
  assert.equal(fetchedAppointment.id, newAppointment.id);
  assert.equal(fetchedAppointment.date, '2026-11-20');
  assert.equal(fetchedAppointment.time, '14:00');
  assert.equal(fetchedAppointment.staffId, 'staff_1');
  assert.equal(fetchedAppointment.status, 'confirmed');

  // Simulating catastrophic communication outbox failure (504 Timeout on notification dispatch)
  const outboxRepo = new LocalCommunicationOutboxRepository();
  const allOutboxEvents = await outboxRepo.listEvents(testTenantId);
  assert.ok(allOutboxEvents.length > 0, 'Randevu için outbox eventi oluşturulmuş olmalıdır');

  const dispatchableEvents = allOutboxEvents.filter(e => e.status !== 'skipped');
  assert.ok(dispatchableEvents.length > 0, 'İletilecek outbox eventi bulunmalıdır');

  for (const ev of dispatchableEvents) {
    // Inject 504 Gateway Timeout into each dispatchable notification
    await outboxRepo.scheduleRetry(testTenantId, ev.id, {
      reason: 'Upstream SMS/WhatsApp provider timed out with HTTP 504',
      delayMs: 5000,
      retryCount: 1
    });
  }

  // Re-verify appointment record remains 100% intact and uncorrupted!
  const verifiedAppointment = await bookingRepo.getAppointmentById(newAppointment.id);
  assert.ok(verifiedAppointment, 'Bildirim zaman aşımına uğrasa bile randevu kaydı ASLA silinmemelidir');
  assert.equal(verifiedAppointment.id, newAppointment.id);
  assert.equal(verifiedAppointment.customer_name, 'Ahmet Yılmaz');
  assert.equal(verifiedAppointment.customer_phone, '+905551234567');
  assert.equal(verifiedAppointment.status, 'confirmed');
  assert.equal(verifiedAppointment.staffId, 'staff_1');

  // Verify outbox events are in retry_scheduled, not lost
  const postChaosEvents = await outboxRepo.listEvents(testTenantId, { status: 'retry_scheduled' });
  assert.equal(postChaosEvents.length, dispatchableEvents.length);
  for (const ev of postChaosEvents) {
    assert.equal(ev.status, 'retry_scheduled', 'Outbox kaydı retry_scheduled durumuna güvenle geçmiş olmalıdır');
    assert.equal(ev.retryCount, 1);
  }
});

await test('5.2: Outbox kaydetme katmanında disk/depolama hatası oluşsa bile oluşturulmuş randevu sağlam kalmalıdır', async () => {
  mockLocalStorage.clear();
  const bookingRepo = getBookingRepository();
  const testTenantId = 'tenant_storage_chaos';

  const appointment = await bookingRepo.createAppointment(testTenantId, {
    serviceId: 'srv_skincare_1',
    staffId: 'staff_1',
    date: '2026-11-25',
    time: '16:00',
    duration: 45,
    price: 600,
    customer_name: 'Merve Aydın',
    customer_phone: '+905553334455',
    status: 'confirmed'
  });

  assert.ok(appointment.id);

  // Now induce synthetic storage write failure on outbox
  const outboxRepo = new LocalCommunicationOutboxRepository();
  mockLocalStorage.failWrites = true;

  await expectReject(
    outboxRepo.enqueueEvent(testTenantId, {
      appointmentId: appointment.id,
      channel: 'sms',
      recipient: '+905553334455',
      body: 'Randevu onay mesajı'
    }),
    'Local outbox persistence failed',
    'Outbox yazma hatası güvenle fırlatılmalıdır'
  );

  mockLocalStorage.failWrites = false;

  // The appointment in the booking repository must still be 100% intact
  const aptAfterStorageFailure = await bookingRepo.getAppointmentById(appointment.id);
  assert.ok(aptAfterStorageFailure, 'Randevu kaydı depolama hatasından etkilenmemelidir');
  assert.equal(aptAfterStorageFailure.id, appointment.id);
  assert.equal(aptAfterStorageFailure.customer_name, 'Merve Aydın');
});

// =============================================================================
// SECTION 6: Eksik ve Hatalı Ortam Değişkenlerinde Sistemin Fail-Closed Koruması
// =============================================================================
console.log('\n[Suite 6] Eksik ve Hatalı Ortam Değişkenlerinde Sistemin Fail-Closed Davranışı');

await test('6.1: VITE_DATA_MODE eksik olduğunda resolveDataSourceMode Fail-Closed hata fırlatmalıdır', () => {
  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: '',
      legacyDataSource: '',
      supabaseUrlPresent: false,
      supabaseAnonKeyPresent: false
    });
  }, /Configuration Error: VITE_DATA_MODE is missing/);
});

await test('6.2: VITE_DATA_MODE yerine sadece legacy VITE_LARI_DATA_SOURCE varsa Fail-Closed reddetmelidir', () => {
  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: '',
      legacyDataSource: 'local',
      supabaseUrlPresent: false,
      supabaseAnonKeyPresent: false
    });
  }, /Legacy environment configuration VITE_LARI_DATA_SOURCE is defined, but canonical VITE_DATA_MODE is missing/);
});

await test('6.3: VITE_DATA_MODE ile legacy VITE_LARI_DATA_SOURCE çelişkili değerlere sahipse Fail-Closed reddetmelidir', () => {
  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: 'local',
      legacyDataSource: 'supabase_staging',
      supabaseUrlPresent: true,
      supabaseAnonKeyPresent: true
    });
  }, /Configuration Error: Conflict detected/);
});

await test('6.4: Tanınmayan veya geçersiz VITE_DATA_MODE değeri Fail-Closed reddetmelidir', () => {
  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: 'unsupported_alien_mode',
      legacyDataSource: '',
      supabaseUrlPresent: false,
      supabaseAnonKeyPresent: false
    });
  }, /Configuration Error: Unrecognized VITE_DATA_MODE value/);
});

await test('6.5: Supabase modunda credentials eksikse resolveDataSourceMode Fail-Closed hata fırlatmalıdır', () => {
  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: 'supabase_production',
      legacyDataSource: '',
      supabaseUrlPresent: false,
      supabaseAnonKeyPresent: true
    });
  }, /Configuration Error: Data mode is configured for "supabase_production", but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing/);

  assert.throws(() => {
    resolveDataSourceMode({
      dataMode: 'supabase_staging',
      legacyDataSource: '',
      supabaseUrlPresent: true,
      supabaseAnonKeyPresent: false
    });
  }, /Configuration Error: Data mode is configured for "supabase_staging", but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing/);
});

await test('6.6: Supabase URL veya Anon Key eksik olduğunda fetchSupabase çağrısı Fail-Closed reddetmelidir', async () => {
  // Clear any env variables temporarily
  const origUrl = process.env.VITE_SUPABASE_URL;
  const origKey = process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  try {
    await expectReject(
      fetchSupabase('/rest/v1/communication_outbox'),
      'Supabase client is not configured',
      'Credentials eksikken fetchSupabase çağrısı fail-closed durmalıdır'
    );
  } finally {
    if (origUrl) process.env.VITE_SUPABASE_URL = origUrl;
    if (origKey) process.env.VITE_SUPABASE_ANON_KEY = origKey;
  }
});

await test('6.7: environmentPreflightService eksik üretim değişkenlerinde isValid: false dönmelidir', () => {
  const result = environmentPreflightService.validatePaymentlessProductionEnv();
  // Under our test sandbox, mock/local is active, so production validation MUST fail closed
  assert.equal(result.isValid, false, 'Ön-doğrulama eksik üretim değişkenlerinde başarısız olmalıdır');
  assert.ok(result.errors.length > 0, 'Hata listesi boş olmamalıdır');
});

// =============================================================================
// SECTION 7: Kiracı İzolasyonu ve Outbox Depolama Sızdırmazlığı
// =============================================================================
console.log('\n[Suite 7] Kiracı İzolasyonu ve Outbox Depolama Sızdırmazlığı Kaos Altında');

await test('7.1: Kaos ve arıza koşullarında Tenant-A ya ait outbox kayıtları Tenant-B ye sızmamalıdır', async () => {
  mockLocalStorage.clear();
  const repo = new LocalCommunicationOutboxRepository();

  await repo.enqueueEvent('tenant-alpha', {
    id: 'outbox_tenant_iso_1',
    channel: 'sms',
    recipient: '+905551111111',
    body: 'Alpha secret notification',
    status: 'queued'
  });

  await repo.scheduleRetry('tenant-alpha', 'outbox_tenant_iso_1', {
    reason: '504 timeout',
    delayMs: 3000
  });

  const alphaEvents = await repo.listEvents('tenant-alpha');
  const betaEvents = await repo.listEvents('tenant-beta');

  assert.equal(alphaEvents.length, 1, 'Tenant-Alpha 1 kayda sahip olmalıdır');
  assert.equal(betaEvents.length, 0, 'Tenant-Beta sıfır kayda sahip olmalı, hiçbir sızıntı olmamalıdır');
});

await test('7.2: Tarayıcı istemcisi doğrulanmamış fiş olmaksızın sent veya delivered durumu enjekte edemez (Anti-Forgery)', async () => {
  mockLocalStorage.clear();
  const repo = new LocalCommunicationOutboxRepository();

  await repo.enqueueEvent('tenant-alpha', {
    id: 'outbox_forgery_1',
    channel: 'sms',
    recipient: '+905551111111',
    body: 'Forgery test',
    status: 'queued'
  });

  await expectReject(
    repo.updateDeliveryStatus('tenant-alpha', 'outbox_forgery_1', 'delivered'),
    'Local outbox cannot set provider-only status \'delivered\' from browser state',
    'Doğrulanmamış delivered durumu reddedilmelidir'
  );

  await expectReject(
    repo.updateDeliveryStatus('tenant-alpha', 'outbox_forgery_1', 'sent'),
    'Local outbox cannot set provider-only status \'sent\' from browser state',
    'Doğrulanmamış sent durumu reddedilmelidir'
  );
});

await test('7.3: Outbox JSON depolama bozulduğunda (Corrupted JSON) veri ezilmemeli, Fail-Closed reddedilmelidir', async () => {
  mockLocalStorage.clear();
  const repo = new LocalCommunicationOutboxRepository();

  await repo.enqueueEvent('tenant-alpha', {
    id: 'valid_pre_corruption_event',
    channel: 'whatsapp',
    body: 'Geçerli veri',
    status: 'queued'
  });

  // Induce storage corruption
  mockLocalStorage.setItem(STORAGE_KEYS.COMMUNICATION_EVENTS, '{BAD_MALFORMED_JSON:::');

  await expectReject(
    repo.listEvents('tenant-alpha'),
    'Local outbox persistence contains invalid stored event data',
    'Bozuk JSON okuma çağrısını fail-closed reddetmelidir'
  );

  await expectReject(
    repo.enqueueEvent('tenant-alpha', { id: 'should_not_overwrite' }),
    'Local outbox persistence contains invalid stored event data',
    'Bozuk depolama üzerine yeni yazma yapılarak önceki bozuk veri sessizce ezilmemelidir'
  );
});

// =============================================================================
// SECTION 8: Arka Plan Outbox Retry Taraması ve Kurtarma (Recovery Sweep)
// =============================================================================
console.log('\n[Suite 8] Arka Plan Outbox Retry Taraması ve Kurtarma (Background Recovery Sweep)');

await test('8.1: handleCommunicationOutboxRetrySweep yalnızca zamanı gelmiş (nextRetryAt <= now) kayıtları tarayıp rendered yapmalı, gelecekteki kayıtları değiştirmemelidir', async () => {
  mockLocalStorage.clear();
  const testTenant = 'tenant_recovery_sweep';
  const outboxRepo = new LocalCommunicationOutboxRepository();

  // 1. Due/Past event (zamanı gelmiş kayıt)
  const pastRetryTime = new Date(Date.now() - 5000).toISOString();
  const evDue = await outboxRepo.enqueueEvent(testTenant, {
    id: 'outbox_sweep_due_1',
    channel: 'sms',
    recipient: '+905551112233',
    body: 'Zamanı gelmiş randevu bildirimi',
    status: 'queued'
  });
  await outboxRepo.scheduleRetry(testTenant, evDue.id, {
    nextRetryAt: pastRetryTime,
    retryCount: 1,
    reason: '504 Gateway Timeout'
  });

  // 2. Future event (gelecekteki kayıt)
  const futureRetryTime = new Date(Date.now() + 60000).toISOString();
  const evFuture = await outboxRepo.enqueueEvent(testTenant, {
    id: 'outbox_sweep_future_1',
    channel: 'whatsapp',
    recipient: '+905559998877',
    body: 'Gelecekteki randevu bildirimi',
    status: 'queued'
  });
  await outboxRepo.scheduleRetry(testTenant, evFuture.id, {
    nextRetryAt: futureRetryTime,
    retryCount: 1,
    reason: 'Temporary network glitch'
  });

  const beforeSweep = await outboxRepo.listEvents(testTenant, { status: 'retry_scheduled' });
  assert.equal(beforeSweep.length, 2, 'Sweep öncesi 2 adet retry_scheduled kayıt olmalıdır');

  // Run sweep job on outbox repository
  const sweepResult = await outboxRepo.handleRetrySweep(testTenant);
  assert.equal(sweepResult.affectedRecordCount, 1, 'Yalnızca zamanı gelmiş 1 kayıt işlenmelidir');
  assert.ok(sweepResult.affectedTenantIds.includes(testTenant));

  const allAfter = await outboxRepo.listEvents(testTenant);

  // Gelecekteki kaydın değişmediğini doğrula
  const futureAfter = allAfter.find(e => e.id === evFuture.id);
  assert.equal(futureAfter.status, 'retry_scheduled', 'Gelecekteki kayıt retry_scheduled olarak kalmalıdır');
  assert.equal(futureAfter.retryCount, 1, 'Gelecekteki kaydın retryCount değeri değişmemelidir');
  assert.equal(futureAfter.nextRetryAt, futureRetryTime, 'Gelecekteki kaydın nextRetryAt zamanı korunmalıdır');

  // Ayrı bir geçmiş/zamanı gelmiş kaydın rendered olduğunu doğrula
  const dueAfter = allAfter.find(e => e.id === evDue.id);
  assert.equal(dueAfter.status, 'rendered', 'Zamanı gelmiş kayıt yeniden denemeye hazır (rendered) olmalıdır');
  assert.equal(dueAfter.retryCount, 2, 'Zamanı gelmiş kaydın retryCount değeri artırılmış olmalıdır');
});

await test('8.2: 3 denemeyi aşmış olaylar sweep sırasında otomatik olarak dead_letter durumuna taşınmalıdır', async () => {
  mockLocalStorage.clear();
  const testTenant = 'tenant_sweep_dlq';
  const outboxRepo = new LocalCommunicationOutboxRepository();

  const evExhausted = await outboxRepo.enqueueEvent(testTenant, {
    channel: 'sms',
    recipient: '+905551112233',
    body: 'Exhausted message',
    status: 'retry_scheduled',
    retryCount: 3,
    nextRetryAt: new Date(Date.now() - 1000).toISOString()
  });

  const sweepResult = await outboxRepo.handleRetrySweep(testTenant);
  assert.ok(sweepResult.affectedRecordCount >= 1);

  const afterSweep = await outboxRepo.listEvents(testTenant, { status: 'dead_letter' });
  assert.equal(afterSweep[0].status, 'dead_letter', '3 denemeyi aşan kayıt dead_letter durumuna taşınmalıdır');
  assert.ok(afterSweep[0].failureReason.includes('exhausted') || afterSweep[0].failureReason.includes('dead_letter'));
});

// =============================================================================
// SECTION 9: Sıfır Harici Ağ Çıkışı ve Sıfır Maliyet Güvencesi (Zero Egress)
// =============================================================================
console.log('\n[Suite 9] Sıfır Harici Ağ Çıkışı ve Sıfır Maliyet Güvencesi (Zero Egress)');

await test('9.1: Kaos testi boyunca harici ağa sıfır (0) çağrı yapıldığı doğrulanmalıdır (0 TL Maliyet)', () => {
  assert.equal(interceptedNetworkCalls, 0, `Dış ağa ${interceptedNetworkCalls} çağrı yapıldı! Sıfır harici ağ çıkışı ihlal edildi.`);
});

// =============================================================================
// FINAL SUMMARY & EXIT
// =============================================================================
console.log('\n================================================================================');
console.log(`TEST SONUCU: ${totalPassed} / ${totalPassed + totalFailed} test BAŞARIYLA GEÇTİ.`);
console.log('================================================================================');

if (totalFailed > 0) {
  console.error(`❌ Kaos dayanıklılık testinde ${totalFailed} hata tespit edildi.`);
  process.exit(1);
} else {
  console.log('✅ [V1A-PREFLIGHT-04] Ağ Kesintisi, Fail-Closed Outbox & Kurtarma Kaos Testi %100 PASS.');
  process.exit(0);
}
