import fs from 'fs';
import path from 'path';
import { CommunicationDeliveryService } from '../services/communicationDeliveryService.js';
import { OfflineCommunicationProviderSimulator } from '../services/offlineCommunicationProviderSimulator.js';
import { CommunicationRetryPolicy } from '../types/communicationContracts.js';

let passCount = 0;
let failCount = 0;

const assert = (condition, message) => {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
};

console.log('🔍 Starting QA: Transactional Communication Provider Rehearsal & Delivery Contracts (Phase E)...');

const cwd = process.cwd();

// ============================================================================
// PART 1: STATIC & CONTRACT CHECKS
// ============================================================================

// 1. Check Document Existences
const requiredDocs = [
  'COMMUNICATION_PROVIDER_CONTRACT_MATRIX.md',
  'TRANSACTIONAL_COMMUNICATION_PROVIDER_REHEARSAL.md',
  'COMMUNICATION_WEBHOOK_AND_DELIVERY_STATUS_PLAN.md',
  'COMMUNICATION_CONSENT_AND_COMPLIANCE_CHECKLIST.md'
];

for (const doc of requiredDocs) {
  const fullPath = path.join(cwd, 'docs', doc);
  assert(fs.existsSync(fullPath), `Document file docs/${doc} exists`);
}

// 2. config defaults
const configPath = path.join(cwd, 'services', 'communicationProviderConfigService.ts');
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, 'utf8');
  assert(content.includes('local_outbox_only'), 'communicationProviderConfigService defaults to local_outbox_only');
} else {
  console.error('❌ communicationProviderConfigService.ts not found!');
  failCount++;
}

// 3. .env.example verification
const envPath = path.join(cwd, '.env.example');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  assert(content.includes('VITE_COMMUNICATION_MODE=local_outbox_only'), '.env.example defines VITE_COMMUNICATION_MODE as local_outbox_only');
  assert(content.includes('EMAIL_PROVIDER_MODE=disabled'), '.env.example sets EMAIL_PROVIDER_MODE to disabled');
  assert(content.includes('SMS_PROVIDER_MODE=disabled'), '.env.example sets SMS_PROVIDER_MODE to disabled');
  assert(content.includes('WHATSAPP_PROVIDER_MODE=disabled'), '.env.example sets WHATSAPP_PROVIDER_MODE to disabled');
  assert(content.includes('# RESEND_API_KEY='), '.env.example comments out and hides RESEND_API_KEY');
  assert(content.includes('# WHATSAPP_ACCESS_TOKEN='), '.env.example comments out and hides WHATSAPP_ACCESS_TOKEN');
} else {
  console.error('❌ .env.example not found!');
  failCount++;
}

// 4. Security Scanning
let hasSecrets = false;
let hasForbiddenNoCardCopy = false;
let hasForbidden7DayCopy = false;

const scanFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.match(/RESEND_API_KEY\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.match(/WHATSAPP_ACCESS_TOKEN\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.match(/NETGSM_PASSWORD\s*=\s*['"][a-zA-Z0-9]{10,}/)) hasSecrets = true;
  if (content.includes('Kredi kartı gerekmez') || content.includes('No credit card required')) hasForbiddenNoCardCopy = true;
  if (content.includes('7-day trial') || content.includes('7 günlük') || content.includes('7 gün deneme')) hasForbidden7DayCopy = true;
};

const dirs = ['components', 'pages', 'services'];
for (const dir of dirs) {
  const fullDir = path.join(cwd, dir);
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir, { recursive: true });
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        scanFile(path.join(fullDir, file));
      }
    }
  }
}

assert(!hasSecrets, 'Security check: Absolute zero hardcoded live messaging secrets committed');
assert(!hasForbiddenNoCardCopy, 'Commercial safety check: All signup screens avoid "no credit card required" marketing lines');
assert(!hasForbidden7DayCopy, 'Commercial duration check: Absolutely zero 7-day trials reference found, LARİ standardizes on 14-day trials');

// ============================================================================
// PART 2: 18 DETERMINISTIC OFFLINE SIMULATION SCENARIOS
// ============================================================================

console.log('\n🧪 Executing 18 Deterministic Behavioral Simulation Scenarios...');

const deliveryService = new CommunicationDeliveryService();
const simulator = new OfflineCommunicationProviderSimulator(deliveryService, {
  webhookSecret: 'test_rehearsal_secret_20261024',
  isSimulation: true
});

// Scenario 1: Rate limit 429 backoff handling
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_01_rate_limit',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905551112233',
    templateId: 'booking_confirmed',
    templateArgs: { customerName: 'Ayşe' },
    body: 'Sayın Ayşe, randevunuz onaylandı.',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await simulator.simulateDispatch(intent.intentId, {
    forceRateLimit: true,
    retryAfterMs: 2000
  });
  assert(res.success === true, 'Scenario 1: Rate limit 429 backoff successfully retries and accepts');
  assert(res.attempts.length === 2, 'Scenario 1: Two attempts recorded (1 rate limit + 1 accepted)');
  assert(res.attempts[0].httpStatusCode === 429, 'Scenario 1: First attempt was HTTP 429');
  assert(res.attempts[1].httpStatusCode === 200, 'Scenario 1: Second attempt was HTTP 200');
}

// Scenario 2: Retryable 5xx error recovery
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_02_server_error',
    tenantId: 'tenant_alpha',
    channel: 'email',
    recipient: 'test@example.com',
    templateId: 'booking_confirmed',
    templateArgs: { customerName: 'Fatma' },
    body: 'Randevunuz onaylandı.',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await simulator.simulateDispatch(intent.intentId, {
    consecutiveFailuresBeforeSuccess: 1
  });
  assert(res.success === true, 'Scenario 2: Retryable 5xx error recovers on subsequent attempt');
  assert(res.attempts.length === 2, 'Scenario 2: Attempt count is 2 (503 then 200)');
  assert(res.attempts[0].httpStatusCode === 503, 'Scenario 2: Initial attempt was HTTP 503');
}

// Scenario 3: Permanent 4xx error fail-closed (invalid recipient)
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_03_invalid_recipient',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: 'invalid_phone',
    templateId: 'booking_confirmed',
    templateArgs: { customerName: 'Zeynep' },
    body: 'Randevu onay',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await simulator.simulateDispatch(intent.intentId, { forceInvalidRecipient: true });
  assert(res.success === false, 'Scenario 3: Permanent 4xx error fails closed immediately');
  assert(res.attempts.length === 1, 'Scenario 3: Exactly 1 attempt made (0 retries on 400)');
  assert(res.intent.status === 'failed', 'Scenario 3: Intent status is terminal failed');
  assert(res.error === 'INVALID_RECIPIENT_NUMBER', 'Scenario 3: Error code is INVALID_RECIPIENT_NUMBER');
}

// Scenario 4: Poison message / serialization failure
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_04_poison_msg',
    tenantId: 'tenant_alpha',
    channel: 'whatsapp',
    recipient: '+905559998877',
    templateId: 'booking_confirmed',
    templateArgs: {},
    body: 'Poison test',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await simulator.simulateDispatch(intent.intentId, { forcePoisonPayload: true });
  assert(res.success === false, 'Scenario 4: Poison payload rejected at boundary');
  assert(res.error === 'POISON_PAYLOAD', 'Scenario 4: Error code is POISON_PAYLOAD');
  assert(res.intent.status === 'failed', 'Scenario 4: Intent marked terminal failed');
}

// Scenario 5: Duplicate delivery callback (idempotent ignore)
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_05_idempotent',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905553334455',
    templateId: 'booking_confirmed',
    templateArgs: {},
    body: 'Idempotency test',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);
  const dispatchRes = await simulator.simulateDispatch(intent.intentId);
  const provMsgId = deliveryService.getAcceptanceReceipt(intent.intentId).providerMessageId;

  const payload = {
    intentId: intent.intentId,
    providerMessageId: provMsgId,
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_05_a'
  };
  const bodyStr = JSON.stringify(payload);
  const sig = simulator.signPayload(bodyStr);

  const res1 = simulator.verifyAndProcessWebhook(bodyStr, sig, 'tenant_alpha');
  assert(res1.valid === true, 'Scenario 5: First delivery callback processed');
  assert(deliveryService.getIntent(intent.intentId).status === 'delivered', 'Scenario 5: Intent reached delivered');

  // Second delivery callback with new nonce for same providerMessageId
  const payload2 = { ...payload, nonce: 'nonce_scen_05_b' };
  const bodyStr2 = JSON.stringify(payload2);
  const sig2 = simulator.signPayload(bodyStr2);
  const res2 = simulator.verifyAndProcessWebhook(bodyStr2, sig2, 'tenant_alpha');
  assert(res2.valid === true, 'Scenario 5: Duplicate delivery callback safely acknowledged idempotently');
  assert(deliveryService.getIntent(intent.intentId).status === 'delivered', 'Scenario 5: Status remains delivered without duplicate corruption');
}

// Scenario 6: Out-of-order callback (delivery before acceptance)
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_06_out_of_order',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905556667788',
    templateId: 'booking_confirmed',
    templateArgs: {},
    body: 'Out of order test',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  // Directly send delivery webhook while intent is still 'queued'
  const payload = {
    intentId: intent.intentId,
    providerMessageId: 'prov_out_of_order_01',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_06'
  };
  const bodyStr = JSON.stringify(payload);
  const sig = simulator.signPayload(bodyStr);

  const res = simulator.verifyAndProcessWebhook(bodyStr, sig, 'tenant_alpha');
  assert(res.valid === true, 'Scenario 6: Out-of-order delivery callback handled cleanly');
  assert(deliveryService.getIntent(intent.intentId).status === 'delivered', 'Scenario 6: Intent successfully transitioned to delivered');
  assert(deliveryService.getAcceptanceReceipt(intent.intentId) !== undefined, 'Scenario 6: Synthesized acceptance receipt created');
}

// Scenario 7: Tampered webhook signature rejection
{
  const payload = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_msg_tamper',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_07'
  };
  const bodyStr = JSON.stringify(payload);
  const badSig = '0000000000000000000000000000000000000000000000000000000000000000';

  const res = simulator.verifyAndProcessWebhook(bodyStr, badSig, 'tenant_alpha');
  assert(res.valid === false && res.statusCode === 401, 'Scenario 7: Tampered webhook signature rejected with HTTP 401');
}

// Scenario 8: Tampered webhook payload rejection
{
  const payload = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_msg_tamper_payload',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_08'
  };
  const bodyStr = JSON.stringify(payload);
  const sig = simulator.signPayload(bodyStr);

  // Tamper body after signature generation
  const tamperedBody = bodyStr.replace('tenant_alpha', 'tenant_hacked');
  const res = simulator.verifyAndProcessWebhook(tamperedBody, sig, 'tenant_alpha');
  assert(res.valid === false && res.statusCode === 401, 'Scenario 8: Tampered payload body rejected with HTTP 401');
}

// Scenario 9: Tenant mismatch rejection
{
  const payload = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_msg_mismatch',
    tenantId: 'tenant_bravo', // Belongs to Bravo, but handler expects Alpha
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_09'
  };
  const bodyStr = JSON.stringify(payload);
  const sig = simulator.signPayload(bodyStr);

  const res = simulator.verifyAndProcessWebhook(bodyStr, sig, 'tenant_alpha');
  assert(res.valid === false && res.statusCode === 403, 'Scenario 9: Tenant mismatch rejected with HTTP 403');
  assert(res.error.includes('TENANT_MISMATCH'), 'Scenario 9: Error specifies TENANT_MISMATCH');
}

// Scenario 10: Retry exhaustion
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_10_exhaustion',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905554443322',
    templateId: 'booking_confirmed',
    templateArgs: {},
    body: 'Exhaustion test',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await simulator.simulateDispatch(intent.intentId, {
    forceServerError: true
  });
  assert(res.success === false, 'Scenario 10: Dispatch failed after exhausting retries');
  assert(res.error === 'RETRY_EXHAUSTED', 'Scenario 10: Terminal error is RETRY_EXHAUSTED');
  assert(res.attempts.length === 3, 'Scenario 10: Exactly maxAttempts (3) attempted before exhaustion');
  assert(res.intent.status === 'failed', 'Scenario 10: Terminal status is failed');
}

// Scenario 11: PII/secret scrubbing
{
  const rawLog = 'Customer Phone: +905551234567, Email: zeynep.kaya@example.com';
  const scrubbed = CommunicationDeliveryService.scrubPII(rawLog);
  assert(!scrubbed.includes('1234567'), 'Scenario 11: Phone number digits scrubbed');
  assert(!scrubbed.includes('zeynep.kaya'), 'Scenario 11: Email address scrubbed');
  assert(scrubbed.includes('****'), 'Scenario 11: Mask characters present in scrubbed output');
}

// Scenario 12: Consent denied -> terminal skipped
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_12_consent_denied',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905558887766',
    templateId: 'marketing_promo',
    templateArgs: {},
    body: 'Kampanya mesajı',
    consentGranted: false,
    consentDenialReason: 'Customer opted out of marketing SMS'
  });
  assert(intent.status === 'skipped', 'Scenario 12: Intent immediately created as skipped');

  let queueError = false;
  try {
    deliveryService.queueIntent(intent.intentId);
  } catch {
    queueError = true;
  }
  assert(queueError === true, 'Scenario 12: Attempting to queue a skipped intent throws error');

  const res = await simulator.simulateDispatch(intent.intentId);
  assert(res.success === false, 'Scenario 12: Simulator refuses dispatch for skipped intent');
  assert(res.attempts.length === 0, 'Scenario 12: Zero dispatch attempts made for skipped intent');
}

// Scenario 13: Channel disabled / unsupported
{
  const disabledSim = new OfflineCommunicationProviderSimulator(deliveryService, {
    enabledChannels: { sms: false, whatsapp: true, email: true, in_app: true }
  });
  const intent = deliveryService.createIntent({
    intentId: 'scen_13_disabled_channel',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905557776655',
    templateId: 'booking_confirmed',
    templateArgs: {},
    body: 'Disabled channel test',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);

  const res = await disabledSim.simulateDispatch(intent.intentId);
  assert(res.success === false, 'Scenario 13: Dispatch rejected on disabled channel');
  assert(res.error === 'CHANNEL_DISABLED', 'Scenario 13: Error code is CHANNEL_DISABLED');
  assert(res.intent.status === 'failed', 'Scenario 13: Intent status transitioned to failed');
}

// Scenario 14: Simulation mode header/flag requirement
{
  const nonSim = new OfflineCommunicationProviderSimulator(deliveryService, {
    isSimulation: false
  });
  const payload = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_non_sim',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_scen_14'
  };
  const bodyStr = JSON.stringify(payload);
  const sig = nonSim.signPayload(bodyStr);

  const res = nonSim.verifyAndProcessWebhook(bodyStr, sig, 'tenant_alpha');
  assert(res.valid === false && res.statusCode === 403, 'Scenario 14: Simulator refuses execution when simulation mode flag is false');
  assert(res.error.includes('SIMULATION_REQUIRED'), 'Scenario 14: Error specifies SIMULATION_REQUIRED');
}

// Scenario 15: Receipt correlation with outbound message ID
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_15_correlation',
    tenantId: 'tenant_alpha',
    channel: 'email',
    recipient: 'owner@salon.com',
    templateId: 'trial_started',
    templateArgs: {},
    body: 'Deneme süreniz başladı',
    consentGranted: true
  });
  deliveryService.queueIntent(intent.intentId);
  await simulator.simulateDispatch(intent.intentId);

  const accReceipt = deliveryService.getAcceptanceReceipt(intent.intentId);
  assert(accReceipt !== undefined, 'Scenario 15: Acceptance receipt recorded');
  assert(accReceipt.intentId === 'scen_15_correlation', 'Scenario 15: Acceptance receipt correlates to outbound intentId');
  assert(accReceipt.providerMessageId.startsWith('prov_msg_'), 'Scenario 15: Provider message ID stamped');
}

// Scenario 16: Dispatch attempt ledger immutability
{
  const attempts = deliveryService.getAttemptsForIntent('scen_10_exhaustion');
  assert(attempts.length === 3, 'Scenario 16: All 3 attempts preserved in ledger');
  const firstAttempt = attempts[0];
  assert(firstAttempt.attemptNumber === 1, 'Scenario 16: Attempt order and structure preserved');
  assert(firstAttempt.httpStatusCode === 503, 'Scenario 16: Attempt status codes unmodified');
}

// Scenario 17: Zero network I/O in offline mode
{
  assert(simulator.getNetworkCallCount() === 0, 'Scenario 17: Absolute zero external network calls made in offline mode');
}

// Scenario 18: Callback replay protection with timestamp nonce
{
  // 18a: Replay by reusing nonce
  const payload1 = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_msg_replay_1',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    nonce: 'unique_nonce_18a'
  };
  const body1 = JSON.stringify(payload1);
  const sig1 = simulator.signPayload(body1);

  const firstCall = simulator.verifyAndProcessWebhook(body1, sig1, 'tenant_alpha');
  assert(firstCall.valid === true, 'Scenario 18a: First webhook with unique nonce succeeds');

  const replayCall = simulator.verifyAndProcessWebhook(body1, sig1, 'tenant_alpha');
  assert(replayCall.valid === false && replayCall.statusCode === 409, 'Scenario 18a: Replayed webhook with same nonce rejected with HTTP 409');

  // 18b: Expired timestamp (> 5 minutes ago)
  const expiredTime = new Date(Date.now() - 600 * 1000).toISOString(); // 10 minutes ago
  const payload2 = {
    intentId: 'scen_01_rate_limit',
    providerMessageId: 'prov_msg_replay_2',
    tenantId: 'tenant_alpha',
    status: 'delivered',
    timestamp: expiredTime,
    nonce: 'unique_nonce_18b'
  };
  const body2 = JSON.stringify(payload2);
  const sig2 = simulator.signPayload(body2);

  const expiredCall = simulator.verifyAndProcessWebhook(body2, sig2, 'tenant_alpha');
  assert(expiredCall.valid === false && expiredCall.statusCode === 400, 'Scenario 18b: Expired timestamp outside replay window rejected with HTTP 400');
}



// Scenario 19: Negative coverage for fabricated receipts, cross-tenant status updates
{
  global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, value) { this._data[key] = value; },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; }
  };
  const localOutbox = new (await import('../services/repositories/localCommunicationOutboxRepository.ts')).LocalCommunicationOutboxRepository();
  await localOutbox.enqueueEvent('tenant_alpha', {
    id: 'scen_19_fabricated',
    channel: 'sms',
    recipient: '+905550000000',
    body: 'Fabricated test',
    status: 'queued'
  });

  const { SupabaseCommunicationOutboxRepository } = await import('../services/repositories/supabaseCommunicationOutboxRepository.ts');
  const supabaseOutbox = new SupabaseCommunicationOutboxRepository();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('LIVE_NETWORK_CALL_BLOCKED'); };

  try {
    // Cross-tenant update check
  let crossTenantFailed = false;
  try {
    await localOutbox.updateDeliveryStatus('tenant_bravo', 'scen_19_fabricated', 'sent');
  } catch (e) {
    if (e.message.includes('Cross-tenant outbox violation')) crossTenantFailed = true;
  }
  assert(crossTenantFailed, 'Scenario 19: Cross-tenant outbox status update rejected');

  // Fabricated receipt check (false)
  let fabricatedReceiptFailed = false;
  try {
    await localOutbox.updateDeliveryStatus('tenant_alpha', 'scen_19_fabricated', 'delivered', undefined, { verifiedProviderReceipt: false });
  } catch (e) {
    if (e.message.includes('verified provider receipt')) fabricatedReceiptFailed = true;
  }
  assert(fabricatedReceiptFailed, 'Scenario 19: Fabricated client delivery status rejected');

  // Fabricated receipt check (true)
  let fabricatedReceiptTrueFailed = false;
  try {
    await localOutbox.updateDeliveryStatus('tenant_alpha', 'scen_19_fabricated', 'delivered', undefined, { verifiedProviderReceipt: true });
  } catch (e) {
    if (e.message.includes('verified provider receipt')) fabricatedReceiptTrueFailed = true;
  }
  assert(fabricatedReceiptTrueFailed, 'Scenario 19: Client delivery status with verifiedProviderReceipt: true rejected');

  // Supabase check (false)
  let supabaseFabricatedFailed = false;
  try {
    await supabaseOutbox.updateDeliveryStatus('tenant_alpha', 'scen_19_fabricated', 'delivered', undefined, { verifiedProviderReceipt: false });
  } catch (e) {
    if (e.message.includes('verified provider receipt')) supabaseFabricatedFailed = true;
  }
  assert(supabaseFabricatedFailed, 'Scenario 19: Supabase client delivery status rejected');

  // Supabase check (true)
  let supabaseFabricatedTrueFailed = false;
  try {
    await supabaseOutbox.updateDeliveryStatus('tenant_alpha', 'scen_19_fabricated', 'delivered', undefined, { verifiedProviderReceipt: true });
  } catch (e) {
    if (e.message.includes('verified provider receipt')) supabaseFabricatedTrueFailed = true;
  }
  assert(supabaseFabricatedTrueFailed, 'Scenario 19: Supabase client delivery status with verifiedProviderReceipt: true rejected');

  // Verify historically stored 'sent' and 'delivered' records remain readable
  global.localStorage.setItem('lari_communication_events', JSON.stringify([
    {
      id: 'scen_19_historical_delivered',
      tenantId: 'tenant_alpha',
      channel: 'sms',
      status: 'delivered',
      body: 'Historical delivered record'
    },
    {
      id: 'scen_19_historical_sent',
      tenantId: 'tenant_alpha',
      channel: 'sms',
      status: 'sent',
      body: 'Historical sent record'
    }
  ]));
  const historicalEvents = await localOutbox.listEvents('tenant_alpha');
  const historicalDelivered = historicalEvents.find(e => e.id === 'scen_19_historical_delivered');
  const historicalSent = historicalEvents.find(e => e.id === 'scen_19_historical_sent');
  assert(historicalDelivered && historicalDelivered.status === 'delivered', 'Scenario 19: Historically stored delivered records remain readable');
  assert(historicalSent && historicalSent.status === 'sent', 'Scenario 19: Historically stored sent records remain readable');
  } finally {
    global.fetch = originalFetch;
  }
}

// Scenario 20: Negative coverage for consent-skipped terminal behavior
{
  const intent = deliveryService.createIntent({
    intentId: 'scen_20_consent_skipped',
    tenantId: 'tenant_alpha',
    channel: 'sms',
    recipient: '+905559990000',
    templateId: 'marketing_promo',
    templateArgs: {},
    body: 'Promo message',
    consentGranted: false,
    consentDenialReason: 'Customer opted out'
  });

  // Verify that a skipped intent cannot be forcibly dispatched
  const res = await simulator.simulateDispatch(intent.intentId, { forceDispatchSkipped: true });
  assert(res.success === false, 'Scenario 20: Force dispatch on consent-skipped intent is rejected');
  assert(res.attempts.length === 0, 'Scenario 20: Zero attempts made despite forced dispatch attempt');

  // Assert the intent status remains skipped
  assert(deliveryService.getIntent(intent.intentId).status === 'skipped', 'Scenario 20: Intent status remains skipped');
}

// Final check
if (failCount > 0) {
  console.error(`\n❌ QA Failed: ${failCount} errors were encountered during Communication Provider & Delivery Contracts verification.`);
  process.exit(1);
} else {
  console.log(`\n🎉 Phase E Communication Provider Rehearsal QA completed with 100% SUCCESS (${passCount} checks passed).`);
  process.exit(0);
}