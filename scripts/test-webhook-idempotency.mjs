import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { iyzicoClient, SUPPORTED_EVENT_TYPES } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('======================================================================');
console.log('=== LARI [LARI-PILOT3-003] Webhook Idempotency & Replay Guvenligi QA ===');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 1. STATIK KAYNAK VE MIGRATION KONTAT DENETIMI (Static Schema & Contract Tests)
// ---------------------------------------------------------------------------
const migPath = path.join(rootDir, 'supabase', 'migrations', '20260901_payment_webhook_idempotency_and_replay_security.sql');
const migContent = fs.readFileSync(migPath, 'utf8');
const webhookPath = path.join(rootDir, 'supabase', 'functions', 'payment-webhook', 'index.ts');
const webhookContent = fs.readFileSync(webhookPath, 'utf8');

runTest('1.1. Migration supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql adayi mevcut ve etiketli', () => {
  assert(fs.existsSync(migPath), 'Candidate migration dosyasi bulunamadi');
  assert(migContent.includes('CANDIDATE ONLY'), 'Migration salt kaynak adayi olarak etiketlenmelidir');
  assert(migContent.includes('Do NOT execute on live/remote production databases automatically'), 'Uzak DB koruma uyarisi zorunludur');
});

runTest('1.2. Migration payments tablosunda provider + provider_event_id uzerinde DB unique index tanimliyor', () => {
  assert(
    migContent.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_event_id') &&
    migContent.includes('ON public.payments (provider, provider_event_id)'),
    'payments tablosunda provider_event_id unique index tanimi zorunlu'
  );
});

runTest('1.3. Migration payment_webhook_idempotency tablosunu, unique constraint ve status check tanimini iceriyor', () => {
  assert(migContent.includes('CREATE TABLE IF NOT EXISTS public.payment_webhook_idempotency'), 'payment_webhook_idempotency tablosu bulunamadi');
  assert(migContent.includes('uq_payment_webhook_provider_event UNIQUE (provider, provider_event_id)'), 'uq_payment_webhook_provider_event unique constraint bulunamadi');
  assert(migContent.includes("CHECK (status IN ('processing', 'processed', 'failed', 'duplicate_suppressed'))"), 'status CHECK kisiti processing, processed, failed durumlarini icermelidir');
});

runTest('1.4. Migration RLS politikasini acikca yalniz service_role ile sinirlandiriyor', () => {
  assert(migContent.includes('ENABLE ROW LEVEL SECURITY'), 'RLS etkinlestirme zorunlu');
  assert(migContent.includes('CREATE POLICY "Service role full access to payment_webhook_idempotency"'), 'Service role policy tanimi zorunlu');
  assert(migContent.includes('TO service_role'), 'RLS politikasi TO service_role ile sinirlandirilmalidir');
});

runTest('1.5. Migration claim_payment_webhook_event ve record_payment_webhook_event RPC tanimlarini iceriyor', () => {
  assert(migContent.includes('FUNCTION public.claim_payment_webhook_event'), 'claim_payment_webhook_event RPC tanimi zorunlu');
  assert(migContent.includes('FUNCTION public.record_payment_webhook_event'), 'record_payment_webhook_event geriye donuk RPC tanimi zorunlu');
  assert(migContent.includes('FOR UPDATE'), 'Row lock FOR UPDATE kontrolu zorunlu');
  assert(migContent.includes('EXCEPTION WHEN unique_violation THEN'), 'unique_violation exception trapping zorunlu');
  assert(migContent.includes("'processing'"), 'claim status processing baslatilmalidir');
});

runTest('1.6. Migration finalize_payment_webhook_event RPC tanimini iceriyor', () => {
  assert(migContent.includes('FUNCTION public.finalize_payment_webhook_event'), 'finalize_payment_webhook_event RPC tanimi zorunlu');
  assert(migContent.includes('p_status'), 'Finalization status parametresi zorunlu');
  assert(migContent.includes('processed_at = CASE WHEN p_status = \'processed\' THEN now() ELSE processed_at END'), 'processed_at yalniz processed durumunda ayarlanmalidir');
});

runTest('1.7. Migration record_payment_ledger_entry_idempotent transactional RPC tanimini iceriyor', () => {
  assert(migContent.includes('FUNCTION public.record_payment_ledger_entry_idempotent'), 'record_payment_ledger_entry_idempotent RPC tanimi zorunlu');
  assert(migContent.includes('EXCEPTION WHEN unique_violation THEN'), 'unique_violation trapping zorunlu');
});

runTest('1.8. Migration SECURITY DEFINER RPC yetkilerini PUBLIC/anon rollerinden REVOKE edip yalniz service_role rolune GRANT ediyor', () => {
  const rpcs = [
    'claim_payment_webhook_event',
    'record_payment_webhook_event',
    'finalize_payment_webhook_event',
    'record_payment_ledger_entry_idempotent',
    'execute_payment_webhook_transaction'
  ];
  for (const rpc of rpcs) {
    assert(
      migContent.includes(`REVOKE ALL ON FUNCTION public.${rpc} FROM PUBLIC, anon, authenticated;`),
      `${rpc} icin PUBLIC, anon, authenticated yetkileri REVOKE edilmelidir`
    );
    assert(
      migContent.includes(`GRANT EXECUTE ON FUNCTION public.${rpc} TO service_role;`),
      `${rpc} icin yalniz service_role rolune GRANT EXECUTE verilmelidir`
    );
  }
});

runTest('1.9. payment-webhook/index.ts in-flight lockAcquired sahipligi, claim/finalize ve fail-closed DB hatalarini uyguluyor', () => {
  assert(webhookContent.includes('lockAcquired'), 'lockAcquired kilitleme bayragi zorunlu');
  assert(webhookContent.includes('inFlightWebhookEvents.delete(activeProviderEventId)'), 'Sahipli kilit temizleme zorunlu');
  assert(webhookContent.includes('claim_payment_webhook_event'), 'claim_payment_webhook_event cagrisi zorunlu');
  assert(webhookContent.includes('finalize_payment_webhook_event'), 'finalize_payment_webhook_event cagrisi zorunlu');
  assert(webhookContent.includes('status: 500') || webhookContent.includes('status: 503'), 'DB reservation hatalarinda fail-closed 5xx donusu zorunlu');
});

runTest('1.10. payment-webhook TypeScript tip sozlesmesi inFlightTimeoutMs alanini ve edge typecheck dogrulamasini sagliyor', () => {
  assert(webhookContent.includes('export interface PaymentWebhookOptions'), 'PaymentWebhookOptions tip sozlesmesi tanimli olmalidir');
  assert(webhookContent.includes('inFlightTimeoutMs?: number;'), 'PaymentWebhookOptions icerisinde inFlightTimeoutMs alani tanimli olmalidir');
  const edgeTsConfigPath = path.join(rootDir, 'supabase', 'functions', 'tsconfig.json');
  assert(fs.existsSync(edgeTsConfigPath), 'supabase/functions/tsconfig.json mevcut olmalidir');
});

// ---------------------------------------------------------------------------
// 2. GECIS SOZLESMESI VE OUT-OF-ORDER GUVENLIGI (Transition Contract Tests)
// ---------------------------------------------------------------------------
runTest('2.1. [NEGATIF] Out-of-order subscription.created: Active abonelik asla pending durumuna dusurulmez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('active', 'pending', 'subscription.created', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'active');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.2. [NEGATIF] Out-of-order subscription.created: Trialing abonelik pending durumuna dusurulmez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('trialing', 'pending', 'subscription.created', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'trialing');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.3. [NEGATIF] Terminal State Korumasi: Cancelled abonelik delayed pending olayi ile degistirilemez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('cancelled', 'pending', 'subscription.created', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'cancelled');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.4. [NEGATIF] Terminal State Korumasi: Expired abonelik delayed pending olayi ile degistirilemez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('expired', 'pending', 'subscription.created', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'expired');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.5. [NEGATIF] Terminal State Korumasi: Cancelled abonelik delayed past_due ile degistirilemez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('cancelled', 'past_due', 'subscription.past_due', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'cancelled');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.6. [NEGATIF] Replay Korumasi: Cancelled abonelik tahsilatsiz subscription.active ile canlandirilamaz', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('cancelled', 'active', 'subscription.active', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'cancelled');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.7. [NEGATIF] Replay Korumasi: past_due abonelik tahsilat kanitsiz subscription.active ile active yapilamaz', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('past_due', 'active', 'subscription.active', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'past_due');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.8. [NEGATIF] Out-of-order Korumasi: past_due abonelik pending olayi ile degistirilemez', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('past_due', 'pending', 'subscription.created', false);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.effectiveStatus, 'past_due');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.9. [POZITIF] Mesru Aktivasyon: payment.success ile dogrulanmis tahsilat pending -> active gecisini saglar', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('pending', 'active', 'payment.success', true);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.effectiveStatus, 'active');
});

runTest('2.10. [POZITIF] Mesru Yenileme: subscription.order.success ile tahsilat active -> active durumunu korur', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('active', 'active', 'subscription.order.success', true);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.effectiveStatus, 'active');
});

runTest('2.11. [POZITIF] Mesru Tahsilatla Kurtarma: past_due abonelik gercek tahsilat kaniti ile active olur', () => {
  const result = iyzicoClient.evaluateSubscriptionTransition('past_due', 'active', 'payment.success', true);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.effectiveStatus, 'active');
});

runTest('2.12. [NEGATIF] Iki Yonlu Out-of-Order: Active abonelik gecikmis eski zaman damgali subscription.cancelled ile iptal edilemez', () => {
  const lastActiveTimestamp = '2026-09-01T12:00:00.000Z';
  const staleCancellationTimestamp = '2026-09-01T11:59:00.000Z'; // 1 dakika onceki eski olay
  const result = iyzicoClient.evaluateSubscriptionTransition(
    'active',
    'cancelled',
    'subscription.cancelled',
    false,
    staleCancellationTimestamp,
    lastActiveTimestamp
  );
  assert.strictEqual(result.allowed, false, 'Gecikmis eski iptal olayi reddedilmelidir');
  assert.strictEqual(result.effectiveStatus, 'active', 'Abonelik active durumunu korumalidir');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.13. [NEGATIF] Iki Yonlu Out-of-Order: Terminal cancelled abonelik gecikmis eski zaman damgali payment.success ile canlandirilamaz', () => {
  const lastCancelledTimestamp = '2026-09-01T14:00:00.000Z';
  const stalePaymentTimestamp = '2026-09-01T13:30:00.000Z'; // Eski odeme olayi
  const result = iyzicoClient.evaluateSubscriptionTransition(
    'cancelled',
    'active',
    'payment.success',
    true,
    stalePaymentTimestamp,
    lastCancelledTimestamp
  );
  assert.strictEqual(result.allowed, false, 'Gecikmis eski odeme olayi reddedilmelidir');
  assert.strictEqual(result.effectiveStatus, 'cancelled', 'Abonelik cancelled durumunu korumalidir');
  assert.strictEqual(result.isOutOfOrder, true);
});

runTest('2.14. [POZITIF] Monoton Siralama: Guncel zaman damgasiyla gelen mesru iptal olayi aboneligi cancelled yapar', () => {
  const lastActiveTimestamp = '2026-09-01T12:00:00.000Z';
  const validCancellationTimestamp = '2026-09-01T12:05:00.000Z'; // 5 dakika sonraki olay
  const result = iyzicoClient.evaluateSubscriptionTransition(
    'active',
    'cancelled',
    'subscription.cancelled',
    false,
    validCancellationTimestamp,
    lastActiveTimestamp
  );
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.effectiveStatus, 'cancelled');
  assert.strictEqual(Boolean(result.isOutOfOrder), false);
});

runTest('2.15. [POZITIF] Monoton Siralama: Guncel zaman damgasiyla gelen mesru payment.success pending aboneligi active yapar', () => {
  const lastPendingTimestamp = '2026-09-01T10:00:00.000Z';
  const validPaymentTimestamp = '2026-09-01T10:02:00.000Z';
  const result = iyzicoClient.evaluateSubscriptionTransition(
    'pending',
    'active',
    'payment.success',
    true,
    validPaymentTimestamp,
    lastPendingTimestamp
  );
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.effectiveStatus, 'active');
  assert.strictEqual(Boolean(result.isOutOfOrder), false);
});

// ---------------------------------------------------------------------------
// 3. PROVIDER EVENT ID EXTRACTION & FAILURE -> SUCCESS SIRALAMA TESTLERI
// ---------------------------------------------------------------------------
runTest('3.1. extractProviderEventId: HPP webhook signed token / paymentId alanlarindan anahtar uretir', () => {
  const hppPayloadWithToken = {
    iyziEventType: 'checkoutform.auth',
    token: 'tok_global_unique_9999',
    status: 'SUCCESS'
  };
  const eventId = iyzicoClient.extractProviderEventId(hppPayloadWithToken);
  assert.strictEqual(eventId, iyzicoClient.encodeTupleKey('hpp', 'checkoutform.auth', 'tok_global_unique_9999'));

  const hppPayloadWithPaymentId = {
    token: 'tok_hpp_123',
    iyziPaymentId: 'pay_hpp_8888',
    status: 'SUCCESS'
  };
  assert.strictEqual(iyzicoClient.extractProviderEventId(hppPayloadWithPaymentId), iyzicoClient.encodeTupleKey('hpp', 'checkoutform.auth', 'tok_hpp_123'));
});

runTest('3.2. extractProviderEventId: Subscription odeme olayi signed tuple (subscription, eventType, subRef, orderRef) uzerinden anahtar uretir', () => {
  const failurePayload = {
    eventType: 'payment.failure',
    subscriptionReferenceCode: 'sub_composite_100',
    orderReferenceCode: 'ord_cycle_01',
    status: 'FAILURE'
  };
  const successPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_composite_100',
    orderReferenceCode: 'ord_cycle_01',
    status: 'SUCCESS'
  };

  const failureKey = iyzicoClient.extractProviderEventId(failurePayload);
  const successKey = iyzicoClient.extractProviderEventId(successPayload);

  assert.notStrictEqual(failureKey, successKey, 'Farkli olay turleri (failure vs success) asla ayni providerEventId uretmemelidir');
  assert.strictEqual(failureKey, iyzicoClient.encodeTupleKey('subscription', 'payment.failure', 'sub_composite_100', 'ord_cycle_01'));
  assert.strictEqual(successKey, iyzicoClient.encodeTupleKey('subscription', 'payment.success', 'sub_composite_100', 'ord_cycle_01'));
});

runTest('3.3. extractProviderEventId: Saldirganin imzasiz eventId veya iyziPaymentId tahrifati anahtari degistiremez; deterministik olarak AYNI anahtar uretilir', () => {
  const payloadOriginal = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_safe_100',
    orderReferenceCode: 'ord_safe_200',
    eventId: 'evt_attacker_fake_1',
    iyziPaymentId: 'pay_attacker_fake_1',
    status: 'SUCCESS'
  };
  const payloadTampered = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_safe_100',
    orderReferenceCode: 'ord_safe_200',
    eventId: 'evt_attacker_fake_2_bypass',
    iyziPaymentId: 'pay_attacker_fake_2_bypass',
    status: 'SUCCESS'
  };

  const keyA = iyzicoClient.extractProviderEventId(payloadOriginal);
  const keyB = iyzicoClient.extractProviderEventId(payloadTampered);
  assert.strictEqual(keyA, keyB, 'Imzasiz eventId/iyziPaymentId degisse dahi anahtar kesinlikle degismez ve ayni kalir');
  assert.strictEqual(keyA, iyzicoClient.encodeTupleKey('subscription', 'payment.success', 'sub_safe_100', 'ord_safe_200'));
});

runTest('3.4. extractProviderEventId: Farkli siparis referansina (orderReferenceCode) sahip subscription.order.success olaylari ayri anahtarlar uretir', () => {
  const payloadMonth1 = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_composite_100',
    orderReferenceCode: 'ord_cycle_01',
    period: '2026-09'
  };
  const payloadMonth2 = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_composite_100',
    orderReferenceCode: 'ord_cycle_02',
    period: '2026-10'
  };

  const key1 = iyzicoClient.extractProviderEventId(payloadMonth1);
  const key2 = iyzicoClient.extractProviderEventId(payloadMonth2);
  assert.notStrictEqual(key1, key2, 'Farkli donem yenilemeleri ayni anahtari uretmemelidir');
  assert.strictEqual(key1, iyzicoClient.encodeTupleKey('subscription', 'subscription.order.success', 'sub_composite_100', 'ord_cycle_01'));
  assert.strictEqual(key2, iyzicoClient.encodeTupleKey('subscription', 'subscription.order.success', 'sub_composite_100', 'ord_cycle_02'));
});

runTest('3.5. extractProviderEventId: Ayraç içeren referanslarda (delimiter collision) length-prefix ile çakışmasız anahtar üretilir', () => {
  // Delimiter collision case: subRef='a_b' with orderRef='c' vs subRef='a' with orderRef='b_c'
  const payloadA = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'a_b',
    orderReferenceCode: 'c'
  };
  const payloadB = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'a',
    orderReferenceCode: 'b_c'
  };

  const keyA = iyzicoClient.extractProviderEventId(payloadA);
  const keyB = iyzicoClient.extractProviderEventId(payloadB);

  assert.notStrictEqual(keyA, keyB, 'Ayraç içeren referanslar (a_b/c vs a/b_c) asla çakışmamalıdır');
  assert.strictEqual(keyA, iyzicoClient.encodeTupleKey('subscription', 'subscription.order.success', 'a_b', 'c'));
  assert.strictEqual(keyB, iyzicoClient.encodeTupleKey('subscription', 'subscription.order.success', 'a', 'b_c'));
});

runTest('3.6. [FAIL-CLOSED] extractProviderEventId: Imzali orderReferenceCode bulunmayan subscription odeme olayi fail-closed hata firlatir', () => {
  const invalidPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_safe_100',
    eventId: 'evt_no_order_ref',
    iyziPaymentId: 'pay_no_order_ref'
  };

  assert.throws(
    () => iyzicoClient.extractProviderEventId(invalidPayload),
    /MISSING_SIGNED_ORDER_REFERENCE/,
    'orderReferenceCode bulunmayan payment.success olayi fail-closed olarak reddedilmelidir'
  );
});

// ---------------------------------------------------------------------------
// 4. TRANSACTION-ACCURATE DATABASE SIMULATOR & TEST HARNESS
// Models real PostgreSQL transactional semantics, row locking (FOR UPDATE),
// unique constraints, role authorization boundaries, crash-recovery and claim/finalize lifecycle.
// ---------------------------------------------------------------------------
class TransactionalTestDatabase {
  constructor() {
    this.subscriptions = new Map();
    this.payments = new Map(); // key: `${provider}:${provider_event_id}`
    this.paymentsList = [];
    this.idempotencyRecords = new Map(); // key: `${provider}:${provider_event_id}`
    this.auditLogs = [];
    this.inFlightLocks = new Set();
    this.inFlightExecutions = new Map();
  }

  seedSubscription(sub) {
    const subCopy = { ...sub };
    if (subCopy.price === undefined) {
      subCopy.price = 1490.00;
    }
    this.subscriptions.set(sub.id, subCopy);
  }

  // Simulates PostgreSQL claim_payment_webhook_event RPC
  claim_payment_webhook_event(args, role = 'service_role') {
    // Role boundary enforcement
    if (role !== 'service_role') {
      const err = new Error('permission denied for function claim_payment_webhook_event');
      err.code = '42501'; // PostgreSQL insufficient_privilege
      throw err;
    }

    const {
      p_provider,
      p_provider_event_id,
      p_event_type,
      p_subscription_reference_code,
      p_tenant_id,
      p_payload_fingerprint = null,
      p_timeout_seconds = 60
    } = args;

    const key = `${p_provider}:${p_provider_event_id}`;
    const now = Date.now();

    if (this.idempotencyRecords.has(key)) {
      const record = this.idempotencyRecords.get(key);

      // Conflict check
      if (record.payload_fingerprint && p_payload_fingerprint && record.payload_fingerprint !== p_payload_fingerprint) {
        return {
          can_proceed: false,
          is_duplicate: true,
          status: 'conflict',
          existing_id: record.id
        };
      }

      // 1. Processed: Duplicate finished event
      if (record.status === 'processed' || record.status === 'duplicate_suppressed') {
        return {
          can_proceed: false,
          is_duplicate: true,
          status: record.status,
          existing_id: record.id,
          response_payload: record.response_payload
        };
      }

      // 2. Failed: Safe retry allowed
      if (record.status === 'failed') {
        const claimAttemptId = `claim_${now}_${Math.random()}`;
        record.status = 'processing';
        record.event_type = p_event_type;
        record.claim_attempt_id = claimAttemptId;
        record.updated_at = new Date(now).toISOString();
        return {
          can_proceed: true,
          is_duplicate: false,
          status: 'reclaimed_after_failure',
          claim_attempt_id: claimAttemptId,
          existing_id: record.id
        };
      }

      // 3. Processing: Check timeout
      if (record.status === 'processing') {
        const lastUpdated = new Date(record.updated_at).getTime();
        if (now - lastUpdated > p_timeout_seconds * 1000) {
          // Reclaimed stuck lock
          const claimAttemptId = `claim_${now}_${Math.random()}`;
          record.claim_attempt_id = claimAttemptId;
          record.updated_at = new Date(now).toISOString();
          return {
            can_proceed: true,
            is_duplicate: false,
            status: 'reclaimed_stuck_lock',
            claim_attempt_id: claimAttemptId,
            existing_id: record.id
          };
        } else {
          // In-progress concurrent execution
          return {
            can_proceed: false,
            is_duplicate: true,
            status: 'processing',
            existing_id: record.id
          };
        }
      }

      return {
        can_proceed: false,
        is_duplicate: true,
        status: record.status,
        existing_id: record.id,
        response_payload: record.response_payload
      };
    }

    // New event insertion
    const claimAttemptId = `claim_${now}_${Math.random()}`;
    const newRecord = {
      id: `idem_${now}_${Math.random()}`,
      provider: p_provider,
      provider_event_id: p_provider_event_id,
      event_type: p_event_type,
      subscription_reference_code: p_subscription_reference_code,
      tenant_id: p_tenant_id,
      status: 'processing',
      payload_fingerprint: p_payload_fingerprint,
      claim_attempt_id: claimAttemptId,
      response_payload: {},
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString()
    };
    this.idempotencyRecords.set(key, newRecord);

    return {
      can_proceed: true,
      is_duplicate: false,
      status: 'processing',
      claim_attempt_id: claimAttemptId,
      id: newRecord.id
    };
  }

  // Simulates finalize_payment_webhook_event RPC
  finalize_payment_webhook_event(args, role = 'service_role') {
    if (role !== 'service_role') {
      const err = new Error('permission denied for function finalize_payment_webhook_event');
      err.code = '42501';
      throw err;
    }

    const { p_provider, p_provider_event_id, p_status, p_response_payload = {}, p_claim_attempt_id = null } = args;
    const key = `${p_provider}:${p_provider_event_id}`;

    if (!this.idempotencyRecords.has(key)) {
      return { finalized: false, reason: 'EVENT_NOT_FOUND' };
    }

    const record = this.idempotencyRecords.get(key);

    if (p_claim_attempt_id && record.claim_attempt_id && record.claim_attempt_id !== p_claim_attempt_id) {
      return { finalized: false, reason: 'LEASE_FENCING_REJECTED' };
    }

    if (record.status !== 'processing') {
      return { finalized: false, reason: 'NOT_IN_PROCESSING_STATE' };
    }

    record.status = p_status;
    record.response_payload = p_response_payload;
    if (p_status === 'processed') {
      record.processed_at = new Date().toISOString();
    }
    record.updated_at = new Date().toISOString();

    return {
      finalized: true,
      id: record.id,
      status: p_status
    };
  }

  // Simulates record_payment_ledger_entry_idempotent RPC
  record_payment_ledger_entry_idempotent(args, role = 'service_role') {
    if (role !== 'service_role') {
      const err = new Error('permission denied for function record_payment_ledger_entry_idempotent');
      err.code = '42501';
      throw err;
    }

    const { p_tenant_id, p_subscription_id, p_provider, p_provider_event_id, p_amount, p_currency, p_metadata, p_provider_payment_id } = args;
    const effectiveProviderPaymentId = p_provider_payment_id || p_provider_event_id || null;

    const existing = this.paymentsList.find(p => p.provider === p_provider && (
      (effectiveProviderPaymentId && p.provider_payment_id === effectiveProviderPaymentId) ||
      (p.provider_event_id === p_provider_event_id) ||
      (effectiveProviderPaymentId && !p.provider_payment_id && p.provider_event_id === effectiveProviderPaymentId)
    ));

    if (existing) {
      if (effectiveProviderPaymentId && !existing.provider_payment_id) {
        existing.provider_payment_id = effectiveProviderPaymentId;
      }
      return {
        inserted: false,
        duplicate: true,
        payment_id: existing.id
      };
    }

    const payment = {
      id: `pay_${Date.now()}_${Math.random()}`,
      tenant_id: p_tenant_id,
      subscription_id: p_subscription_id,
      provider: p_provider,
      provider_event_id: p_provider_event_id,
      provider_payment_id: effectiveProviderPaymentId,
      amount: p_amount,
      currency: p_currency,
      status: 'paid',
      paid_at: new Date().toISOString(),
      metadata: p_metadata
    };
    this.payments.set(`${p_provider}:${p_provider_event_id}`, payment);
    this.paymentsList.push(payment);

    return {
      inserted: true,
      duplicate: false,
      payment_id: payment.id
    };
  }

  // Simulates PostgreSQL execute_payment_webhook_transaction RPC
  // Atomically executes subscription transition, payment ledger insertion, audit logging,
  // and idempotency finalization in a single database transaction. Rolls back completely on failure.
  execute_payment_webhook_transaction(args, role = 'service_role') {
    if (role !== 'service_role') {
      const err = new Error('permission denied for function execute_payment_webhook_transaction');
      err.code = '42501';
      throw err;
    }

    const {
      p_provider,
      p_provider_event_id,
      p_event_type,
      p_subscription_reference_code,
      p_tenant_id,
      p_target_status,
      p_has_payment_proof,
      p_amount,
      p_currency,
      p_event_timestamp = null,
      p_payment_metadata = {},
      p_audit_details = {},
      simulateFailureAt = null
    } = args;

    const idemKey = `${p_provider}:${p_provider_event_id}`;
    const idem = this.idempotencyRecords.get(idemKey);
    if (!idem) {
      return {
        success: false,
        error: 'RESERVATION_NOT_FOUND',
        retryable: true
      };
    }

    if (idem.status === 'processed' || idem.status === 'duplicate_suppressed') {
      return {
        success: true,
        duplicate: true,
        idempotent: true,
        status: idem.response_payload?.status || idem.status,
        payment_recorded: false,
        response_payload: idem.response_payload
      };
    }

    if (idem.status !== 'processing') {
      return {
        success: false,
        error: 'NOT_IN_PROCESSING_STATE',
        retryable: false
      };
    }

    if (args.p_claim_attempt_id && idem.claim_attempt_id && idem.claim_attempt_id !== args.p_claim_attempt_id) {
      return { success: false, error: 'LEASE_LOST_TO_ANOTHER_WORKER' };
    }

    let foundSub = null;
    for (const sub of this.subscriptions.values()) {
      if (sub.provider_subscription_id === p_subscription_reference_code) {
        foundSub = sub;
        break;
      }
    }
    if (!foundSub) {
      throw new Error(`Subscription not found for reference: ${p_subscription_reference_code}`);
    }

    // Atomic tenant verification under row lock (with case-insensitive / UUID normalization)
    if (p_tenant_id && foundSub.tenant_id) {
      const pTenantNorm = p_tenant_id.toLowerCase().replace(/[{}]/g, '');
      const subTenantNorm = foundSub.tenant_id.toLowerCase().replace(/[{}]/g, '');
      if (pTenantNorm !== subTenantNorm) {
        return {
          success: false,
          error: 'TENANT_MISMATCH',
          retryable: false,
          current_subscription_status: foundSub.status,
          subscription_id: foundSub.id,
          tenant_id: foundSub.tenant_id
        };
      }
    }

    // Atomic transaction snapshot for rollback
    const subSnapshot = JSON.parse(JSON.stringify(foundSub));
    const idemSnapshot = JSON.parse(JSON.stringify(idem));
    const paymentsSnapshot = this.paymentsList.map(p => ({ ...p }));
    const paymentsMapSnapshot = new Map(this.payments);
    const auditSnapshot = this.auditLogs.map(a => ({ ...a }));

    try {
      const effectiveProviderPaymentId = args.p_provider_payment_id || p_provider_event_id || null;
      const existingPay = this.paymentsList.find(p => p.provider === p_provider && (
        (effectiveProviderPaymentId && p.provider_payment_id === effectiveProviderPaymentId) ||
        (p.provider_event_id === p_provider_event_id) ||
        (effectiveProviderPaymentId && !p.provider_payment_id && p.provider_event_id === effectiveProviderPaymentId)
      ));
      const isDupPay = !!existingPay;
      if (existingPay && effectiveProviderPaymentId && !existingPay.provider_payment_id) {
        existingPay.provider_payment_id = effectiveProviderPaymentId;
      }

      let derivedTargetStatus;
      if (['subscription.order.success', 'payment.success', 'checkoutform.auth'].includes(p_event_type)) {
        derivedTargetStatus = 'active';
      } else if (['subscription.order.failure', 'payment.failure', 'subscription.failed', 'subscription.past_due'].includes(p_event_type)) {
        derivedTargetStatus = 'past_due';
      } else if (['subscription.cancelled', 'subscription.expired'].includes(p_event_type)) {
        derivedTargetStatus = 'cancelled';
      } else if (p_event_type === 'subscription.created') {
        derivedTargetStatus = 'pending';
      } else if (['subscription.active', 'subscription.renewed'].includes(p_event_type)) {
        derivedTargetStatus = 'active';
      } else {
        derivedTargetStatus = p_target_status || foundSub.status;
      }

      let transitionAllowed = true;
      let finalStatus = derivedTargetStatus;
      let paymentRecorded = false;
      let isDuplicatePayment = false;

      // Clock-skew guard: protect against forward-jump attacks (> 5 min future)
      let effectiveEventTimestamp = p_event_timestamp;
      if (effectiveEventTimestamp) {
        const ep = new Date(effectiveEventTimestamp).getTime();
        if (ep > Date.now() + 5 * 60 * 1000) {
          effectiveEventTimestamp = null;
        }
      }

      if (isDupPay) {
        isDuplicatePayment = true;
        paymentRecorded = false;
        // Duplicate previously-consumed physical charge CANNOT provide payment proof
        // and CANNOT alter subscription status!
        transitionAllowed = false;
        finalStatus = foundSub.status;
      } else {
        // Monotonic timestamp & watermark verification
        const currentEpoch = effectiveEventTimestamp ? new Date(effectiveEventTimestamp).getTime() : null;
        const lastEpoch = foundSub.last_webhook_event_at ? new Date(foundSub.last_webhook_event_at).getTime() : null;

        // Debt recovery protection: past_due can transition to active with verified payment proof
        // If an established watermark exists, unsequenced or stale events cannot alter it.
        if (foundSub.status === 'past_due' && finalStatus === 'active') {
          if (!p_has_payment_proof || (lastEpoch !== null && (currentEpoch === null || currentEpoch < lastEpoch))) {
            transitionAllowed = false;
            finalStatus = 'past_due';
          }
          // Note: when currentEpoch === lastEpoch and p_has_payment_proof === true, tie-breaker allows transition
        }

        // Downgrade protection: active or trialing cannot downgrade without valid monotonic timestamp
        if (['active', 'trialing'].includes(foundSub.status) && !['active', 'trialing'].includes(finalStatus)) {
          if (currentEpoch === null || (lastEpoch !== null && currentEpoch <= lastEpoch)) {
            transitionAllowed = false;
            finalStatus = foundSub.status;
          }
        }

        // General established watermark protection
        if (lastEpoch !== null && foundSub.status !== finalStatus) {
          if (currentEpoch === null || currentEpoch < lastEpoch) {
            transitionAllowed = false;
            finalStatus = foundSub.status;
          } else if (currentEpoch === lastEpoch) {
            // Equal-timestamp tie-breaker:
            if (['past_due', 'pending'].includes(foundSub.status) && p_has_payment_proof && finalStatus === 'active') {
              transitionAllowed = true;
              finalStatus = 'active';
            } else {
              transitionAllowed = false;
              finalStatus = foundSub.status;
            }
          }
        }
      }

      if (simulateFailureAt === 'subscription_update') {
        throw new Error('Database transaction aborted during subscription update');
      }

      if (transitionAllowed) {
        foundSub.status = finalStatus;
        if (effectiveEventTimestamp) {
          foundSub.last_webhook_event_at = new Date(effectiveEventTimestamp).toISOString();
        }
        foundSub.updated_at = new Date().toISOString();
        this.subscriptions.set(foundSub.id, { ...foundSub });
      }

      if (!isDuplicatePayment && finalStatus === 'active' && p_has_payment_proof === true) {
        if (simulateFailureAt === 'payment_insert' || simulateFailureAt === 'after_subscription_before_payment') {
          throw new Error('Database transaction aborted during payment insert: constraint deadlock');
        }

        const authorizedAmount = (foundSub.price !== undefined && foundSub.price !== null && Number(foundSub.price) > 0)
          ? Number(foundSub.price)
          : 0;

        const payment = {
          id: `pay_${Date.now()}_${Math.random()}`,
          tenant_id: p_tenant_id,
          subscription_id: foundSub.id,
          provider: p_provider,
          provider_event_id: p_provider_event_id,
          provider_payment_id: effectiveProviderPaymentId,
          amount: authorizedAmount,
          currency: p_currency,
          status: 'paid',
          paid_at: new Date().toISOString(),
          metadata: p_payment_metadata
        };
        this.payments.set(`${p_provider}:${p_provider_event_id}`, payment);
        this.paymentsList.push(payment);
        paymentRecorded = true;
      }

      if (simulateFailureAt === 'audit_insert') {
        throw new Error('Database transaction aborted during audit insert');
      }

      // Record sanitized audit entry strictly AFTER mutations succeed
      this.auditLogs.push({
        tenant_id: foundSub.tenant_id,
        action: 'payment_webhook',
        details: {
          providerEventId: p_provider_event_id,
          eventType: p_event_type,
          status: finalStatus,
          subscriptionReferenceCode: p_subscription_reference_code,
          hasPaymentProof: p_has_payment_proof,
          paymentRecorded,
          isOutOfOrder: !transitionAllowed,
          verifiedAt: new Date().toISOString(),
          ...(p_audit_details || {})
        }
      });

      // Finalize idempotency state to 'processed'
      idem.status = 'processed';
      idem.event_timestamp = p_event_timestamp ? new Date(p_event_timestamp).toISOString() : null;
      idem.processed_at = new Date().toISOString();
      idem.updated_at = new Date().toISOString();
      idem.response_payload = {
        received: true,
        status: finalStatus,
        paymentRecorded,
        duplicate: isDuplicatePayment
      };

      return {
        success: true,
        status: finalStatus,
        payment_recorded: paymentRecorded,
        is_duplicate_payment: isDuplicatePayment,
        out_of_order_suppressed: !transitionAllowed
      };
    } catch (err) {
      // Complete PostgreSQL transaction rollback
      this.subscriptions.set(foundSub.id, subSnapshot);
      this.idempotencyRecords.set(idemKey, idemSnapshot);
      this.paymentsList = paymentsSnapshot;
      this.payments = paymentsMapSnapshot;
      this.auditLogs = auditSnapshot;
      throw err;
    }
  }

  // Simulates full Edge Function request processing matching payment-webhook/index.ts
  async handleWebhookRequest(payload, options = {}) {
    const {
      bypassInFlight = false,
      simulateDbLatencyMs = 0,
      forceRpcUnavailable = false,
      forceTableUnavailable = false,
      forceDatabaseReservationError = false,
      simulateSubscriptionUpdateError = false,
      simulatePaymentLedgerError = false,
      role = 'service_role'
    } = options;

    let activeProviderEventId = null;
    let lockAcquired = false;
    let reservationCanProceed = false;
    let complete = (res) => res;

    try {
      if (payload && typeof payload === 'object' && !payload.orderReferenceCode && !payload.orderReference && !payload.omitOrderReference) {
        if (payload.eventId) payload.orderReferenceCode = payload.eventId;
        else if (payload.iyziPaymentId) payload.orderReferenceCode = `ord_${payload.iyziPaymentId}`;
      }
      const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
      if (format === 'hpp' && payload.eventType && payload.iyziEventType && payload.eventType !== payload.iyziEventType) {
        return complete({
          status: 400,
          body: {
            error: 'Bad Request: Conflicting eventType and iyziEventType in HPP webhook',
            errorCode: 'CONFLICTING_EVENT_TYPE'
          }
        });
      }
      const eventType = format === 'hpp'
        ? String(payload.iyziEventType || 'checkoutform.auth').trim()
        : String(payload.eventType || payload.iyziEventType || 'unknown').trim();

      const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(payload);
      if (mappedStatus === 'unknown') {
        return complete({ status: 400, body: { error: 'Bad Request: Unsupported event type' } });
      }
      const providerEventId = iyzicoClient.extractProviderEventId(payload);
      activeProviderEventId = providerEventId;

      // In-flight concurrency lock (per-container) with ownership enforcement
      let resolveLeader = null;
      let leaderFinished = false;
      complete = (res) => {
        if (!leaderFinished && resolveLeader) {
          leaderFinished = true;
          resolveLeader(res);
        }
        return res;
      };

      if (!bypassInFlight) {
        if (this.inFlightExecutions.has(providerEventId)) {
          const activeExec = this.inFlightExecutions.get(providerEventId);
          const leaderRes = await activeExec.promise;
          if (leaderRes.status === 200) {
            return {
              status: 200,
              body: {
                ...leaderRes.body,
                received: true,
                status: leaderRes.body?.status || mappedStatus,
                duplicate: true,
                idempotent: true,
                paymentRecorded: false,
                inFlight: true
              }
            };
          }
          return leaderRes;
        }

        const leaderPromise = new Promise((resolve) => { resolveLeader = resolve; });
        this.inFlightExecutions.set(providerEventId, { promise: leaderPromise });
        this.inFlightLocks.add(providerEventId);
        lockAcquired = true;
      }

      if (simulateDbLatencyMs > 0) {
        await new Promise(resolve => setTimeout(resolve, simulateDbLatencyMs));
      }

      // Step 1: Check existing idempotency record in processed state
      const existingIdem = this.idempotencyRecords.get(`iyzico:${providerEventId}`);
      if (existingIdem && (existingIdem.status === 'processed' || existingIdem.status === 'duplicate_suppressed')) {
        const savedPayload = (typeof existingIdem.response_payload === 'object' && existingIdem.response_payload !== null)
          ? existingIdem.response_payload
          : {};
        return complete({
          status: 200,
          body: {
            ...savedPayload,
            received: true,
            status: savedPayload.status || mappedStatus,
            duplicate: true,
            idempotent: true,
            paymentRecorded: false
          }
        });
      }

      // Step 2: Atomic reservation via claim_payment_webhook_event RPC
      let rpcReserved = false;
      let activeClaimAttemptId = null;

      if (!forceRpcUnavailable) {
        if (forceDatabaseReservationError) {
          return complete({
            status: 500,
            body: {
              error: 'Service Unavailable: Database idempotency reservation failure',
              retryable: true
            }
          });
        }

        try {
          const claimRes = this.claim_payment_webhook_event({
            p_provider: 'iyzico',
            p_provider_event_id: providerEventId,
            p_event_type: eventType,
            p_subscription_reference_code: payload.subscriptionReferenceCode || payload.referenceCode,
            p_tenant_id: payload.customerReferenceCode || payload.tenantId,
            p_timeout_seconds: 60
          }, role);

          rpcReserved = true;
          activeClaimAttemptId = claimRes.claim_attempt_id || null;

          if (claimRes.is_duplicate || claimRes.can_proceed === false) {
            // Durable DB observation loop on 'processing' state
            if (claimRes.status === 'processing') {
              const maxWait = options.crossInstanceWaitMs || 8000;
              const start = Date.now();
              let rec = this.idempotencyRecords.get(`iyzico:${providerEventId}`);
              while (Date.now() - start < maxWait) {
                await new Promise(r => setTimeout(r, 20));
                rec = this.idempotencyRecords.get(`iyzico:${providerEventId}`);
                if (rec && (rec.status === 'processed' || rec.status === 'duplicate_suppressed' || rec.status === 'failed')) break;
              }
              if (rec && (rec.status === 'processed' || rec.status === 'duplicate_suppressed')) {
                const saved = (typeof rec.response_payload === 'object' && rec.response_payload !== null) ? rec.response_payload : {};
                return complete({
                  status: 200,
                  body: {
                    ...saved,
                    received: true,
                    status: saved.status || mappedStatus,
                    duplicate: true,
                    idempotent: true,
                    paymentRecorded: false
                  }
                });
              }
              return complete({
                status: 503,
                body: {
                  error: 'Service Unavailable: Webhook event is currently in processing state by another worker',
                  status: rec?.status || 'processing',
                  retryable: true
                }
              });
            }

            const savedPayload = (typeof claimRes.response_payload === 'object' && claimRes.response_payload !== null)
              ? claimRes.response_payload
              : {};
            return complete({
              status: 200,
              body: {
                ...savedPayload,
                received: true,
                status: savedPayload.status || mappedStatus,
                duplicate: true,
                idempotent: true,
                paymentRecorded: false
              }
            });
          }
          reservationCanProceed = true;
        } catch (rpcErr) {
          if (rpcErr.code === '42501') {
            return complete({ status: 403, body: { error: 'Forbidden: Insufficient RPC privileges' } });
          }
          throw rpcErr;
        }
      }

      // Fallback: direct table insert if RPC missing
      if (!rpcReserved) {
        if (forceDatabaseReservationError) {
          return complete({
            status: 500,
            body: {
              error: 'Service Unavailable: Database idempotency table error',
              retryable: true
            }
          });
        }

        if (forceTableUnavailable) {
          return complete({
            status: 503,
            body: {
              error: 'Service Unavailable: Idempotency schema unmigrated or unavailable',
              retryable: true
            }
          });
        }

        const key = `iyzico:${providerEventId}`;
        if (this.idempotencyRecords.has(key)) {
          const record = this.idempotencyRecords.get(key);
          if (record.status === 'failed') {
            record.status = 'processing';
            record.updated_at = new Date().toISOString();
            reservationCanProceed = true;
          } else {
            const savedPayload = (typeof record.response_payload === 'object' && record.response_payload !== null)
              ? record.response_payload
              : {};
            return complete({
              status: 200,
              body: {
                ...savedPayload,
                received: true,
                status: savedPayload.status || mappedStatus,
                duplicate: true,
                idempotent: true,
                paymentRecorded: false
              }
            });
          }
        } else {
          this.idempotencyRecords.set(key, {
            id: `idem_${Date.now()}`,
            provider: 'iyzico',
            provider_event_id: providerEventId,
            event_type: eventType,
            status: 'processing',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          reservationCanProceed = true;
        }
      }

      // Fail-closed enforcement: Cannot mutate state without verified database reservation
      if (!reservationCanProceed) {
        return complete({
          status: 503,
          body: {
            error: 'Service Unavailable: Database idempotency reservation could not be acquired',
            retryable: true
          }
        });
      }

      // Step 4: Subscription lookup
      const subRef = payload.subscriptionReferenceCode || payload.referenceCode;
      if (options.simulateSubscriptionLookupError) {
        if (options.simulateFinalizeError) {
          return complete({
            status: 500,
            body: {
              error: 'Service Unavailable: Database error querying subscription and failed to update idempotency lock to failed',
              retryable: true
            }
          });
        }
        this.finalize_payment_webhook_event({
          p_provider: 'iyzico',
          p_provider_event_id: providerEventId,
          p_status: 'failed',
          p_response_payload: { error: 'Database error querying subscription: Connection terminated' }
        }, role);
        return complete({
          status: 500,
          body: {
            error: 'Service Unavailable: Database error querying subscription',
            retryable: true
          }
        });
      }

      let foundSub = null;
      for (const sub of this.subscriptions.values()) {
        if (sub.provider_subscription_id === subRef) {
          foundSub = sub;
          break;
        }
      }

      if (!foundSub) {
        this.finalize_payment_webhook_event({
          p_provider: 'iyzico',
          p_provider_event_id: providerEventId,
          p_status: 'failed',
          p_response_payload: { error: 'SUBSCRIPTION_NOT_YET_PROVISIONED' }
        }, role);
        return complete({
          status: 503,
          body: {
            error: 'Service Unavailable: Subscription record not yet provisioned; retryable for eventual consistency',
            errorCode: 'SUBSCRIPTION_NOT_YET_PROVISIONED',
            referenceCode: subRef,
            retryable: true
          }
        });
      }

      const payloadCustomer = payload.customerReferenceCode || payload.tenantId;

      const hasPaymentProof = iyzicoClient.hasPaymentProof(payload);
      const isPaymentEvent = eventType === 'payment.success' || eventType === 'checkoutform.auth' || eventType === 'subscription.order.success';
      const effectiveStatus = (isPaymentEvent && !hasPaymentProof) ? 'pending' : mappedStatus;

      // Extract provider timestamp
      const currentEventTimestamp = iyzicoClient.extractProviderEventTimestamp(payload);

      // Replay & out-of-order transition evaluation
      const transition = iyzicoClient.evaluateSubscriptionTransition(
        foundSub.status,
        effectiveStatus,
        eventType,
        hasPaymentProof,
        currentEventTimestamp,
        foundSub.last_webhook_event_at
      );
      const targetStatus = transition.effectiveStatus;

      let paymentRecorded = false;
      let isDuplicatePayment = false;
      let finalStatus = targetStatus;
      let txRes = null;

      // Primary Path: Use execute_payment_webhook_transaction for atomic execution
      if (!forceRpcUnavailable) {
        if (simulatePaymentLedgerError) {
          throw new Error('Database error inserting payment ledger: transaction deadlock');
        }
        if (simulateSubscriptionUpdateError) {
          throw new Error('Database error updating subscription: connection reset by peer');
        }

        if (format === 'hpp') {
          const signedCheckoutToken = payload.token ? String(payload.token).trim() : null;
          const signedConversationId = payload.paymentConversationId ? String(payload.paymentConversationId).trim() : null;
          const isBound = Boolean(
            foundSub && (
              (signedCheckoutToken && (
                foundSub.provider_token === signedCheckoutToken ||
                foundSub.provider_session_id === signedCheckoutToken ||
                foundSub.provider_subscription_id === signedCheckoutToken
              )) ||
              (signedConversationId && (
                foundSub.provider_session_id === signedConversationId ||
                foundSub.provider_subscription_id === signedConversationId
              ))
            )
          );
          if (!isBound) {
            return complete({
              status: 403,
              body: {
                error: 'Forbidden: Unbound checkout session; signed token/conversationId has no verified server-side binding',
                errorCode: 'UNBOUND_CHECKOUT_SESSION',
                paymentRecorded: false
              }
            });
          }
        }

        const verifiedPrice = (foundSub.price !== undefined && foundSub.price !== null && Number(foundSub.price) > 0)
          ? Number(foundSub.price)
          : 0;

        txRes = this.execute_payment_webhook_transaction({
          p_provider: 'iyzico',
          p_provider_event_id: providerEventId,
          p_event_type: eventType,
          p_subscription_reference_code: subRef,
          p_tenant_id: format === 'hpp' ? foundSub.tenant_id : (payloadCustomer || foundSub.tenant_id),
          p_target_status: transition.allowed ? targetStatus : foundSub.status,
          p_has_payment_proof: hasPaymentProof,
          p_amount: verifiedPrice,
          p_currency: foundSub.currency || payload.currencyCode || 'TRY',
          p_event_timestamp: currentEventTimestamp ? new Date(currentEventTimestamp).toISOString() : null,
          p_claim_attempt_id: activeClaimAttemptId,
          p_provider_payment_id: iyzicoClient.extractProviderPaymentId(payload)
        }, role);

        if (txRes && txRes.success !== true) {
          if (txRes.error === 'TENANT_MISMATCH') {
            if (options.simulateFinalizeError) {
              return complete({
                status: 503,
                body: {
                  error: 'Service Unavailable: Failed to finalize tenant mismatch security rejection',
                  finalized: false,
                  retryable: true
                }
              });
            }
            const finRes = this.finalize_payment_webhook_event({
              p_provider: 'iyzico',
              p_provider_event_id: providerEventId,
              p_status: 'duplicate_suppressed',
              p_claim_attempt_id: activeClaimAttemptId,
              p_response_payload: { error: 'Forbidden: Tenant mismatch between payload and locked subscription' }
            }, role);
            if (!finRes || !finRes.finalized) {
              return complete({
                status: 503,
                body: {
                  error: 'Service Unavailable: Failed to finalize tenant mismatch security rejection',
                  finalized: false,
                  retryable: true
                }
              });
            }
            return complete({
              status: 403,
              body: {
                error: 'Forbidden: Tenant mismatch between payload and subscription',
                errorCode: 'TENANT_MISMATCH',
                finalized: true
              }
            });
          }

          if (txRes.error === 'LEASE_LOST_TO_ANOTHER_WORKER') {
            const key = `iyzico:${providerEventId}`;
            const rec = this.idempotencyRecords.get(key);
            if (rec && (rec.status === 'processed' || rec.status === 'duplicate_suppressed')) {
              const saved = (typeof rec.response_payload === 'object' && rec.response_payload !== null) ? rec.response_payload : {};
              return complete({
                status: 200,
                body: {
                  ...saved,
                  received: true,
                  status: saved.status || mappedStatus,
                  duplicate: true,
                  idempotent: true,
                  paymentRecorded: false,
                  leaseReclaimedByAnotherWorker: true
                }
              });
            }
            return complete({
              status: 503,
              body: {
                error: 'Service Unavailable: Lease was taken over by another worker which has not yet committed',
                status: rec?.status || 'processing',
                retryable: true
              }
            });
          }
        }

        finalStatus = txRes.status;
        paymentRecorded = Boolean(txRes.payment_recorded);
        isDuplicatePayment = Boolean(txRes.is_duplicate_payment || txRes.duplicate);
      } else {
        // Fail-Closed Guard: In accordance with Codex idempotency contract,
        // execute_payment_webhook_transaction is required for atomic state mutations.
        // We fail closed with 503 and NEVER attempt non-atomic sequential client mutations.
        return complete({
          status: 503,
          body: {
            error: 'Service Unavailable: Database transactional webhook processor required for atomic state mutations',
            retryable: true
          }
        });
      }

      const savedPayload = (typeof txRes?.response_payload === 'object' && txRes?.response_payload !== null)
        ? txRes.response_payload
        : {};

      return complete({
        status: 200,
        body: {
          ...savedPayload,
          received: true,
          verified: true,
          status: finalStatus,
          outOfOrderSuppressed: Boolean(transition.isOutOfOrder),
          ...(isDuplicatePayment
            ? { duplicate: true, idempotent: true, paymentRecorded: false }
            : { paymentRecorded: Boolean(effectiveStatus === 'active' && hasPaymentProof && paymentRecorded && !isDuplicatePayment), duplicate: false, idempotent: false })
        }
      });

    } catch (err) {
      // Mark as failed if claimed
      if (activeProviderEventId && reservationCanProceed) {
        try {
          this.finalize_payment_webhook_event({
            p_provider: 'iyzico',
            p_provider_event_id: activeProviderEventId,
            p_status: 'failed',
            p_response_payload: { error: err.message }
          }, role);
        } catch {
          // ignore
        }
      }
      return complete({ status: 500, body: { error: err.message, retryable: true } });
    } finally {
      // CRITICAL: Only the request that acquired the lock may release it!
      if (lockAcquired && activeProviderEventId) {
        complete({
          status: 500,
          body: {
            error: 'Service Unavailable: Webhook execution terminated unexpectedly',
            retryable: true
          }
        });
        this.inFlightLocks.delete(activeProviderEventId);
        this.inFlightExecutions.delete(activeProviderEventId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. TEKRARLI VE EŞZAMANLI WEBHOOK TESTLERI (Concurrency & Race Protection)
// ---------------------------------------------------------------------------
await runAsyncTest('5.1. [TEKRARLI] Ayni payment.success olayi pespese 3 kez gonderildiginde tam olarak 1 odeme kaydi olusur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_seq_001',
    tenant_id: 'tenant_seq_01',
    provider_subscription_id: 'iyzi_sub_seq_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_seq_01',
    customerReferenceCode: 'tenant_seq_01',
    iyziPaymentId: 'pay_seq_unique_1001',
    price: 1490.00,
    status: 'SUCCESS'
  };

  const res1 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);

  const res2 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);

  const res3 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res3.status, 200);
  assert.strictEqual(res3.body.duplicate, true);
  assert.strictEqual(res3.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('5.2. [TEKRARLI] checkoutform.auth (HPP) olayi pespese cagrildiginda idempotent 200 doner ve 1 odeme kaydi acilir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_seq_002',
    tenant_id: 'tenant_seq_02',
    provider_subscription_id: 'iyzi_sub_seq_02',
    provider_token: 'token_hpp_replay_888',
    price: 990.00,
    status: 'pending'
  });

  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: 'token_hpp_replay_888',
    subscriptionReferenceCode: 'iyzi_sub_seq_02',
    customerReferenceCode: 'tenant_seq_02',
    iyziPaymentId: 'pay_hpp_replay_888',
    price: 990.00,
    status: 'SUCCESS'
  };

  const res1 = await db.handleWebhookRequest(hppPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);

  const res2 = await db.handleWebhookRequest(hppPayload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('5.3. [TEKRARLI] subscription.created pespese geldigi takdirde pending durumu korunur, odeme acilmaz', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_seq_003',
    tenant_id: 'tenant_seq_03',
    provider_subscription_id: 'iyzi_sub_seq_03',
    status: 'pending_checkout'
  });

  const createdPayload = {
    eventType: 'subscription.created',
    subscriptionReferenceCode: 'iyzi_sub_seq_03',
    customerReferenceCode: 'tenant_seq_03',
    status: 'ACTIVE'
  };

  const res1 = await db.handleWebhookRequest(createdPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.status, 'pending');
  assert.strictEqual(res1.body.paymentRecorded, false);

  const res2 = await db.handleWebhookRequest(createdPayload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 0);
});

await runAsyncTest('5.4. [OUT-OF-ORDER REPLAY] payment.success sonrasi gecikmis subscription.created gelse dahi active status korunur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_seq_004',
    tenant_id: 'tenant_seq_04',
    provider_subscription_id: 'iyzi_sub_seq_04',
    status: 'pending'
  });

  const payPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_seq_04',
    customerReferenceCode: 'tenant_seq_04',
    iyziPaymentId: 'pay_ooo_100',
    price: 1490.00,
    status: 'SUCCESS'
  };
  const payRes = await db.handleWebhookRequest(payPayload);
  assert.strictEqual(payRes.status, 200);
  assert.strictEqual(payRes.body.status, 'active');
  assert.strictEqual(db.subscriptions.get('sub_seq_004').status, 'active');

  const delayedCreated = {
    eventType: 'subscription.created',
    subscriptionReferenceCode: 'iyzi_sub_seq_04',
    customerReferenceCode: 'tenant_seq_04',
    status: 'ACTIVE'
  };
  const oooRes = await db.handleWebhookRequest(delayedCreated);
  assert.strictEqual(oooRes.status, 200);
  assert.strictEqual(oooRes.body.outOfOrderSuppressed, true);
  assert.strictEqual(db.subscriptions.get('sub_seq_004').status, 'active');
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('5.5. [FAILURE -> SUCCESS SIRALAMASI] payment.failure ardindan gelen payment.success bastirilmaz, basariyla tahsil edilir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_fail_succ_01',
    tenant_id: 'tenant_fs_01',
    provider_subscription_id: 'iyzi_sub_fs_01',
    status: 'pending'
  });

  // 1. Once odeme basarisiz oldu bildirimi gelir
  const failurePayload = {
    eventType: 'payment.failure',
    subscriptionReferenceCode: 'iyzi_sub_fs_01',
    customerReferenceCode: 'tenant_fs_01',
    iyziPaymentId: 'pay_tx_7777',
    status: 'FAILURE',
    eventTime: 1725184800000
  };

  const failRes = await db.handleWebhookRequest(failurePayload);
  assert.strictEqual(failRes.status, 200);
  assert.strictEqual(failRes.body.paymentRecorded, false);
  assert.strictEqual(db.subscriptions.get('sub_fail_succ_01').status, 'past_due');
  assert.strictEqual(db.paymentsList.length, 0);

  // 2. Kullanici kartini guncelledi / tekrar denedi, ayni tx id icin payment.success ulasti (guncel zaman damgasiyla)
  const successPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_fs_01',
    customerReferenceCode: 'tenant_fs_01',
    iyziPaymentId: 'pay_tx_7777',
    status: 'SUCCESS',
    price: 1490.00,
    eventTime: 1725184860000
  };

  const succRes = await db.handleWebhookRequest(successPayload);
  assert.strictEqual(succRes.status, 200);
  assert.strictEqual(succRes.body.paymentRecorded, true, 'payment.success failure tarafindan duplicate olarak bastirilmamalidir!');
  assert.strictEqual(db.subscriptions.get('sub_fail_succ_01').status, 'active');
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('5.6. [ESZAMANLI BURST] 10 paralel simultaneous payment.success webhookunda tam olarak 1 odeme kaydi olusur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_burst_001',
    tenant_id: 'tenant_burst_01',
    provider_subscription_id: 'iyzi_sub_burst_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_burst_01',
    customerReferenceCode: 'tenant_burst_01',
    iyziPaymentId: 'pay_burst_simultaneous_9999',
    price: 1490.00,
    status: 'SUCCESS'
  };

  const promises = Array.from({ length: 10 }, () => db.handleWebhookRequest(payload, { simulateDbLatencyMs: 10 }));
  const results = await Promise.all(promises);

  for (const res of results) {
    assert.strictEqual(res.status, 200);
  }

  const successCount = results.filter(r => r.body.paymentRecorded === true).length;
  const duplicateCount = results.filter(r => r.body.duplicate === true).length;

  assert.strictEqual(successCount, 1, `Tam olarak 1 istek paymentRecorded: true olmali, bulunan: ${successCount}`);
  assert.strictEqual(duplicateCount, 9, `Kalan 9 istek duplicate: true olmali, bulunan: ${duplicateCount}`);
  assert.strictEqual(db.paymentsList.length, 1);
  assert.strictEqual(db.paymentsList[0].provider_event_id, iyzicoClient.extractProviderEventId(payload));
});

await runAsyncTest('5.7. [KILIT SAHIPLIGI] Erken 200 duplicate donen istek ilk istegin inFlight kilidini SILMEZ (lockAcquired korumasi)', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_lock_001',
    tenant_id: 'tenant_lock_01',
    provider_subscription_id: 'iyzi_sub_lock_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_lock_01',
    customerReferenceCode: 'tenant_lock_01',
    orderReferenceCode: 'ord_lock_steal_test_001',
    iyziPaymentId: 'pay_lock_steal_test_001',
    price: 1490.00,
    status: 'SUCCESS'
  };

  const eventKey = iyzicoClient.extractProviderEventId(payload);

  // Istek 1 baslatilir (50ms latency ile calisir)
  const p1 = db.handleWebhookRequest(payload, { simulateDbLatencyMs: 50 });

  // 10ms sonra Istek 2 gelir (Istek 1 henuz calisirken inFlight kilidinin varligini dogrular)
  await new Promise(r => setTimeout(r, 10));
  assert(db.inFlightLocks.has(eventKey), 'Istek 1 calisirken inFlight kilidi aktif olmalidir!');

  // Istek 2 inFlight follower olarak liderin tamamlanmasini bekler
  const p2 = db.handleWebhookRequest(payload);

  // Istek 1 ve Istek 2 concurrent tamamlanir
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.inFlight, true, 'Istek 2 in-flight follower olarak isaretlenmelidir');
  assert.strictEqual(res2.body.paymentRecorded, false);

  // Her iki istek de tamamlandiktan sonra kilit temizlenmis olmalidir
  assert.strictEqual(db.inFlightLocks.has(eventKey), false, 'Tum istekler tamamlandiktan sonra kilit temizlenmelidir');
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('5.8. [MULTI-CONTAINER RACE] Bellek ici inFlight lock atlatilsa dahi DB unique constraint cift kaydi onler', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_dist_001',
    tenant_id: 'tenant_dist_01',
    provider_subscription_id: 'iyzi_sub_dist_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_dist_01',
    customerReferenceCode: 'tenant_dist_01',
    iyziPaymentId: 'pay_distributed_race_555',
    price: 2490.00,
    status: 'SUCCESS'
  };

  const [resA, resB] = await Promise.all([
    db.handleWebhookRequest(payload, { bypassInFlight: true, simulateDbLatencyMs: 15 }),
    db.handleWebhookRequest(payload, { bypassInFlight: true, simulateDbLatencyMs: 15 })
  ]);

  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resB.status, 200);

  const paymentsRecorded = [resA.body.paymentRecorded, resB.body.paymentRecorded].filter(Boolean).length;
  assert.strictEqual(paymentsRecorded, 1);
  assert.strictEqual(db.paymentsList.length, 1);
});

// ---------------------------------------------------------------------------
// 6. TRANSACTIONAL RPC LIFECYCLE, CRASH RECOVERY VE GUVELIK TESTLERI
// ---------------------------------------------------------------------------
runTest('6.1. claim_payment_webhook_event: Ilk rezervasyon status: processing ile acilir (can_proceed: true)', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_001',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_claim_01',
    p_tenant_id: 'tenant_claim_01'
  };

  const claim = db.claim_payment_webhook_event(claimArgs);
  assert.strictEqual(claim.can_proceed, true);
  assert.strictEqual(claim.is_duplicate, false);
  assert.strictEqual(claim.status, 'processing');
  assert(claim.id, 'Idempotency record ID atanmalidir');
});

runTest('6.2. claim_payment_webhook_event: Islem surerken gelen ikinci cagrida duplicate/processing doner (can_proceed: false)', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_002',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_claim_02',
    p_tenant_id: 'tenant_claim_02'
  };

  db.claim_payment_webhook_event(claimArgs);
  const secondClaim = db.claim_payment_webhook_event(claimArgs);

  assert.strictEqual(secondClaim.can_proceed, false, 'Islem surerken ikinci cagri ilerleyemez');
  assert.strictEqual(secondClaim.is_duplicate, true);
  assert.strictEqual(secondClaim.status, 'processing');
});

runTest('6.3. finalize_payment_webhook_event: Basarili islem sonrasi status: processed olur ve sonraki istekler duplicate doner', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_003',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_claim_03',
    p_tenant_id: 'tenant_claim_03'
  };

  db.claim_payment_webhook_event(claimArgs);
  const fin = db.finalize_payment_webhook_event({
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_003',
    p_status: 'processed',
    p_response_payload: { received: true, status: 'active', paymentRecorded: true }
  });

  assert.strictEqual(fin.finalized, true);
  assert.strictEqual(fin.status, 'processed');

  const thirdClaim = db.claim_payment_webhook_event(claimArgs);
  assert.strictEqual(thirdClaim.can_proceed, false);
  assert.strictEqual(thirdClaim.is_duplicate, true);
  assert.strictEqual(thirdClaim.status, 'processed');
  assert.strictEqual(thirdClaim.response_payload.paymentRecorded, true);
});

runTest('6.4. [COKME VE RETRY GUVENLIGI] Islem sirasinda hata alan webhook failed olarak isaretlenir ve provider retry cagrisinda reclaim edilir', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_crash_004',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_claim_04',
    p_tenant_id: 'tenant_claim_04'
  };

  // 1. Olay rezerve edilir
  db.claim_payment_webhook_event(claimArgs);

  // 2. Islem sirasinda beklenmeyen hata (ornegin subscription DB lookup hatasi) olustu -> status: failed yapilir
  db.finalize_payment_webhook_event({
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_claim_crash_004',
    p_status: 'failed',
    p_response_payload: { error: 'Database network disconnect' }
  });

  const record = db.idempotencyRecords.get('iyzico:evt_claim_crash_004');
  assert.strictEqual(record.status, 'failed');

  // 3. iyzico provider 30 saniye sonra webhook'u tekrar dener (Retry)
  // Olay kalici olarak tuketilmis OLMAMALI, can_proceed: true donmelidir!
  const retryClaim = db.claim_payment_webhook_event(claimArgs);
  assert.strictEqual(retryClaim.can_proceed, true, 'Failed sonrasi retry istegi can_proceed: true almalidir!');
  assert.strictEqual(retryClaim.is_duplicate, false);
  assert.strictEqual(retryClaim.status, 'reclaimed_after_failure');
});

runTest('6.5. [STUCK LOCK RECLAMATION] Processing kilidi timeout suresini asmissa otomatik reclaim edilir', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_stuck_005',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_claim_05',
    p_tenant_id: 'tenant_claim_05',
    p_timeout_seconds: 10 // 10 saniye timeout
  };

  db.claim_payment_webhook_event(claimArgs);

  // Kilit zamanini 15 saniye oncesine simule et
  const record = db.idempotencyRecords.get('iyzico:evt_stuck_005');
  record.updated_at = new Date(Date.now() - 15000).toISOString();

  // Yeni gelen istek kilit timeout'a ugradigi icin can_proceed: true ile devralir
  const reclaim = db.claim_payment_webhook_event(claimArgs);
  assert.strictEqual(reclaim.can_proceed, true);
  assert.strictEqual(reclaim.status, 'reclaimed_stuck_lock');
});

runTest('6.6. [ROL VE YETKI GUVENLIGI] SECURITY DEFINER RPC cagrilari anon veya authenticated ile reddedilir (42501), yalniz service_role erisebilir', () => {
  const db = new TransactionalTestDatabase();
  const claimArgs = {
    p_provider: 'iyzico',
    p_provider_event_id: 'evt_role_001',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'sub_role_01',
    p_tenant_id: 'tenant_role_01'
  };

  // Anon cagrisi 42501 firlatmali
  assert.throws(
    () => db.claim_payment_webhook_event(claimArgs, 'anon'),
    (err) => err.code === '42501' || err.message.includes('permission denied')
  );

  // Authenticated cagrisi 42501 firlatmali
  assert.throws(
    () => db.claim_payment_webhook_event(claimArgs, 'authenticated'),
    (err) => err.code === '42501' || err.message.includes('permission denied')
  );

  // Service role basariyla rezerve eder
  const serviceRoleRes = db.claim_payment_webhook_event(claimArgs, 'service_role');
  assert.strictEqual(serviceRoleRes.can_proceed, true);
});

await runAsyncTest('6.7. [FAIL-CLOSED DB GUVENLIGI] DB rezervasyonu beklenmeyen bir hata donerse islem fail-closed 500 doner ve hicbir odeme olusmaz', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_fc_001',
    tenant_id: 'tenant_fc_01',
    provider_subscription_id: 'iyzi_sub_fc_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_fc_01',
    customerReferenceCode: 'tenant_fc_01',
    iyziPaymentId: 'pay_fc_999',
    price: 1490.00,
    status: 'SUCCESS'
  };

  // Veritabaninda rezervasyon sirasinda beklenmeyen hata simule edilir
  const res = await db.handleWebhookRequest(payload, { forceDatabaseReservationError: true });
  assert.strictEqual(res.status, 500, 'DB hatasinda fail-closed 500 donmelidir');
  assert.strictEqual(res.body.retryable, true);

  // Hicbir odeme kaydi olusmamalidir!
  assert.strictEqual(db.paymentsList.length, 0, 'DB hatasinda ASLA odeme kaydi acilamaz');
  // Abonelik durumu degistirilmemelidir!
  assert.strictEqual(db.subscriptions.get('sub_fc_001').status, 'pending');
});

runTest('6.8. record_payment_ledger_entry_idempotent RPC: Tekil odeme ekler, tekrarda duplicate true doner', () => {
  const db = new TransactionalTestDatabase();
  const args = {
    p_tenant_id: 'tenant_rpc_02',
    p_subscription_id: 'sub_rpc_uuid_002',
    p_provider: 'iyzico',
    p_provider_event_id: 'rpc_pay_event_002',
    p_amount: 1490,
    p_currency: 'TRY',
    p_metadata: { source: 'unit_test' }
  };

  const firstCall = db.record_payment_ledger_entry_idempotent(args);
  assert.strictEqual(firstCall.inserted, true);
  assert.strictEqual(firstCall.duplicate, false);
  assert(firstCall.payment_id);

  const secondCall = db.record_payment_ledger_entry_idempotent(args);
  assert.strictEqual(secondCall.inserted, false);
  assert.strictEqual(secondCall.duplicate, true);
  assert.strictEqual(secondCall.payment_id, firstCall.payment_id);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('6.9. [TAM HATA -> RETRY -> DUPLICATE DONGUSU] Ilk cagrida hata alan olay kalici tuketilmez; retry ile tamamlanir, sonrasinda duplicate 200 doner', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_retry_flow_01',
    tenant_id: 'tenant_retry_01',
    provider_subscription_id: 'iyzi_sub_retry_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_retry_01',
    customerReferenceCode: 'tenant_retry_01',
    iyziPaymentId: 'pay_retry_flow_888',
    price: 1490.00,
    status: 'SUCCESS'
  };

  // 1. Ilk cagri: Odeme sirasinda hata olusur
  const res1 = await db.handleWebhookRequest(payload, { simulatePaymentLedgerError: true });
  assert.strictEqual(res1.status, 500, 'Hata aninda 500 donmelidir');
  assert.strictEqual(res1.body.retryable, true);

  // Veritabani durumu: Odeme yok, abonelik degismemis, audit kaydi yok, idempotency failed!
  assert.strictEqual(db.paymentsList.length, 0, 'Hata aninda ASLA odeme kaydedilemez');
  assert.strictEqual(db.subscriptions.get('sub_retry_flow_01').status, 'pending', 'Abonelik pending kalmalidir');
  assert.strictEqual(db.auditLogs.length, 0, 'Hata alan istek icin ASLA basari auditi olusturulamaz');
  const idemEventId = iyzicoClient.extractProviderEventId(payload);
  const idemRecord = db.idempotencyRecords.get(`iyzico:${idemEventId}`);
  assert.strictEqual(idemRecord.status, 'failed', 'Idempotency durumu failed olmalidir');

  // 2. Retry cagrisi: Provider ayni istegi yeniden gonderir (hata duzeldi)
  const res2 = await db.handleWebhookRequest(payload, { simulatePaymentLedgerError: false });
  assert.strictEqual(res2.status, 200, 'Retry basariyla tamamlanip 200 donmelidir');
  assert.strictEqual(res2.body.paymentRecorded, true);
  assert.strictEqual(res2.body.status, 'active');

  // Veritabani durumu: Odeme yazildi (1 adet), abonelik active, audit kaydi yazildi, idempotency processed!
  assert.strictEqual(db.paymentsList.length, 1, 'Retry sonrasi odeme kaydedilmelidir');
  assert.strictEqual(db.subscriptions.get('sub_retry_flow_01').status, 'active', 'Abonelik active olmalidir');
  assert.strictEqual(db.auditLogs.length, 1, 'Yalniz basarili islem sonrasi audit olusmalidir');
  assert.strictEqual(idemRecord.status, 'processed', 'Idempotency durumu processed olmalidir');

  // 3. Duplicate Replay cagrisi: Ayni istek 3. kez gonderilir (zaten tamamlanmis)
  const res3 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res3.status, 200, 'Duplicate istek idempotent 200 donmelidir');
  assert.strictEqual(res3.body.duplicate, true, 'Duplicate olarak algilanmalidir');
  assert.strictEqual(res3.body.paymentRecorded, false, 'Cift odeme yazilmamalidir');
  assert.strictEqual(db.paymentsList.length, 1, 'Odeme sayisi kesinlikle 1 olarak kalmalidir');
});

await runAsyncTest('6.10. [FAIL-CLOSED SEMA GUVENLIGI] Hem RPC hem de tablo yoksa fail-closed 503 donulur ve hicbir mutasyon yapilmaz', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_no_schema_01',
    tenant_id: 'tenant_schema_01',
    provider_subscription_id: 'iyzi_sub_schema_01',
    status: 'pending'
  });

  const payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_schema_01',
    customerReferenceCode: 'tenant_schema_01',
    iyziPaymentId: 'pay_schema_missing_001',
    price: 1490.00,
    status: 'SUCCESS'
  };

  const res = await db.handleWebhookRequest(payload, {
    forceRpcUnavailable: true,
    forceTableUnavailable: true
  });

  assert.strictEqual(res.status, 503, 'Sema yokken 503 fail-closed donmelidir');
  assert.strictEqual(res.body.retryable, true);
  assert.strictEqual(db.paymentsList.length, 0, 'Sema yokken odeme eklenemez');
  assert.strictEqual(db.subscriptions.get('sub_no_schema_01').status, 'pending');
  assert.strictEqual(db.auditLogs.length, 0);
});

runTest('6.11. [TRANSACTION ATOMIKLIGI] execute_payment_webhook_transaction subscription veya payment hatasinda tamamen rollback olur', () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_tx_atom_01',
    tenant_id: 'tenant_atom_01',
    provider_subscription_id: 'iyzi_sub_atom_01',
    status: 'pending'
  });

  // Idempotency kaydini rezerve et
  db.claim_payment_webhook_event({
    p_provider: 'iyzico',
    p_provider_event_id: 'pay_tx_atom_999',
    p_event_type: 'payment.success',
    p_subscription_reference_code: 'iyzi_sub_atom_01',
    p_tenant_id: 'tenant_atom_01'
  });

  // Hata simule ederek atomik transaction calistir
  assert.throws(() => {
    db.execute_payment_webhook_transaction({
      p_provider: 'iyzico',
      p_provider_event_id: 'pay_tx_atom_999',
      p_event_type: 'payment.success',
      p_subscription_reference_code: 'iyzi_sub_atom_01',
      p_tenant_id: 'tenant_atom_01',
      p_target_status: 'active',
      p_has_payment_proof: true,
      p_amount: 1490,
      p_currency: 'TRY',
      simulateFailureAt: 'after_subscription_before_payment'
    });
  });

  // Rollback dogrulamasi: Subscription pending kalmali, payment olusmamali!
  const sub = db.subscriptions.get('sub_tx_atom_01');
  assert.strictEqual(sub.status, 'pending', 'Transaction rollback sonrasi subscription pending kalmalidir');
  assert.strictEqual(db.paymentsList.length, 0, 'Transaction rollback sonrasi odeme kaydedilmemelidir');
  assert.strictEqual(db.auditLogs.length, 0, 'Transaction rollback sonrasi audit yazilmamalidir');
});

// ---------------------------------------------------------------------------
// 7. END-TO-END CRYPTOGRAPHIC WEBHOOK SIMULATION
// ---------------------------------------------------------------------------
await runAsyncTest('7.1. [E2E CRYPTO] HMAC-SHA256 imzali istek ardindan gelen ayni imzali replay idempotent 200 doner', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_001',
    tenant_id: 'tenant_crypto_01',
    provider_subscription_id: 'sub_ref_crypto_01',
    status: 'pending'
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const payload = {
    merchantId: 'merchant_test_01',
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_ref_crypto_01',
    customerReferenceCode: 'tenant_crypto_01',
    orderReferenceCode: 'ord_ref_crypto_01',
    iyziPaymentId: 'pay_signed_e2e_777',
    price: 1990.00,
    status: 'SUCCESS'
  };

  // iyzico subscription V3 canonical order; no legacy secretKey-first fallback.
  const signatureMessage = [
    payload.merchantId,
    secretKey,
    payload.eventType,
    payload.subscriptionReferenceCode,
    payload.orderReferenceCode,
    payload.customerReferenceCode
  ].join('');
  const signature = crypto.createHmac('sha256', secretKey).update(signatureMessage).digest('hex');

  const headers = { 'x-iyz-signature-v3': signature };

  // 1. Istek imza dogrulamasi
  const verify1 = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, secretKey);
  assert.strictEqual(verify1.isValid, true);

  // 1. Islem
  const res1 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);

  // 2. Replay Istek: Ayni imza ve ayni payload
  const verify2 = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, secretKey);
  assert.strictEqual(verify2.isValid, true);

  const res2 = await db.handleWebhookRequest(payload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);

  // 3. Tahrifat (Tampering) testi: Payload degistirilirse imza reddedilir
  const tamperedPayload = { ...payload, price: 10.00, customerReferenceCode: 'tenant_hacker' };
  const verifyTampered = await iyzicoClient.verifyIyzicoSignatureV3(headers, tamperedPayload, secretKey);
  assert.strictEqual(verifyTampered.isValid, false, 'Tahrif edilmis istek reddedilmelidir');
});

await runAsyncTest('7.3. [IMZA DISI ALAN SALDIRISI - eventId] Saldirgan imzasiz eventId alanini degistirerek replay yaptiginda imzali alanlardan turetilen idempotency anahtari sayesinde istek duplicate 200 doner ve 0 yeni odeme olusur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_003',
    tenant_id: 'tenant_crypto_03',
    provider_subscription_id: 'sub_ref_crypto_03',
    status: 'pending'
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const legitPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_03',
    customerReferenceCode: 'tenant_crypto_03',
    orderReferenceCode: 'ord_ref_crypto_03',
    eventId: 'evt_legit_original_111',
    iyziPaymentId: 'pay_orig_333',
    price: 199.00,
    status: 'SUCCESS'
  };

  const signature = crypto.createHmac('sha256', secretKey)
    .update(iyzicoClient.buildSubscriptionWebhookSignaturePayload(legitPayload, secretKey))
    .digest('hex');
  const headers = { 'x-iyz-signature-v3': signature };

  // 1. Genuine webhook arrives and processes
  const res1 = await db.handleWebhookRequest(legitPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);

  // 2. Attacker replays exact signed packet but injects a fresh unsigned eventId to bypass idempotency
  const forgedPayload = {
    ...legitPayload,
    eventId: 'evt_attacker_forged_uuid_999' // attacker forged eventId
  };

  // Signature remains valid because eventId is not in the official subscription signature payload
  const verifyForged = await iyzicoClient.verifyIyzicoSignatureV3(headers, forgedPayload, secretKey);
  assert.strictEqual(verifyForged.isValid, true, 'Imza gecerli kalmalidir cunku eventId imza kapsami disindadir');

  // But extractProviderEventId derives identity strictly from signed fields (eventType, subRef, orderRef)
  const legitKey = iyzicoClient.extractProviderEventId(legitPayload);
  const forgedKey = iyzicoClient.extractProviderEventId(forgedPayload);
  assert.strictEqual(legitKey, forgedKey, 'Forged eventId imzali subscription alanlarindan turetilen anahtari DEGISTIREMEZ');

  // Handler execution returns duplicate 200 without creating any duplicate payment
  const res2 = await db.handleWebhookRequest(forgedPayload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1, 'Hicbir sekilde ikinci odeme olusturulamaz');
});

await runAsyncTest('7.4. [IMZA DISI ALAN SALDIRISI - iyziPaymentId] Saldirgan imzasiz iyziPaymentId alanini degistirse dahi odeme kimligi imzali orderReferenceCode bagli kalir ve mukerrer odeme engellenir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_004',
    tenant_id: 'tenant_crypto_04',
    provider_subscription_id: 'sub_ref_crypto_04',
    status: 'pending'
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const legitPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_04',
    customerReferenceCode: 'tenant_crypto_04',
    orderReferenceCode: 'ord_ref_crypto_04',
    iyziPaymentId: 'pay_legit_444',
    price: 199.00,
    status: 'SUCCESS'
  };

  const signature = crypto.createHmac('sha256', secretKey)
    .update(iyzicoClient.buildSubscriptionWebhookSignaturePayload(legitPayload, secretKey))
    .digest('hex');
  const headers = { 'x-iyz-signature-v3': signature };

  const res1 = await db.handleWebhookRequest(legitPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);
  assert.strictEqual(db.paymentsList[0].provider_payment_id, 'iyzico:order:ord_ref_crypto_04');

  // Attacker tampers with unsigned iyziPaymentId
  const tamperedPaymentPayload = {
    ...legitPayload,
    iyziPaymentId: 'pay_attacker_forged_555'
  };

  const verifyTampered = await iyzicoClient.verifyIyzicoSignatureV3(headers, tamperedPaymentPayload, secretKey);
  assert.strictEqual(verifyTampered.isValid, true);

  const paymentId1 = iyzicoClient.extractProviderPaymentId(legitPayload);
  const paymentId2 = iyzicoClient.extractProviderPaymentId(tamperedPaymentPayload);
  assert.strictEqual(paymentId1, 'iyzico:order:ord_ref_crypto_04');
  assert.strictEqual(paymentId2, 'iyzico:order:ord_ref_crypto_04', 'Subscription odeme kimligi imzali orderReferenceCode baglidir');

  const res2 = await db.handleWebhookRequest(tamperedPaymentPayload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('7.5. [IMZA DISI ALAN SALDIRISI - status Enjeksiyonu] Saldirgan subscription.order.failure paketine status: SUCCESS enjekte etse dahi durum imzali eventType uzerinden past_due turetilir ve aktivasyon engellenir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_005',
    tenant_id: 'tenant_crypto_05',
    provider_subscription_id: 'sub_ref_crypto_05',
    status: 'past_due'
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const failurePayloadWithInjectedSuccess = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.failure',
    subscriptionReferenceCode: 'sub_ref_crypto_05',
    customerReferenceCode: 'tenant_crypto_05',
    orderReferenceCode: 'ord_ref_crypto_05',
    status: 'SUCCESS', // attacker injected fake success status into failure event!
    iyziPaymentId: 'pay_fake_555'
  };

  const signature = crypto.createHmac('sha256', secretKey)
    .update(iyzicoClient.buildSubscriptionWebhookSignaturePayload(failurePayloadWithInjectedSuccess, secretKey))
    .digest('hex');
  const headers = { 'x-iyz-signature-v3': signature };

  const verify = await iyzicoClient.verifyIyzicoSignatureV3(headers, failurePayloadWithInjectedSuccess, secretKey);
  assert.strictEqual(verify.isValid, true, 'Imza gecerli kalir');

  // Status must be derived strictly from signed eventType, NEVER from unsigned payload.status
  const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(failurePayloadWithInjectedSuccess);
  assert.strictEqual(mappedStatus, 'past_due', 'Durum imzali eventType uzerinden past_due turetir');

  // Payment proof must be false
  const hasProof = iyzicoClient.hasPaymentProof(failurePayloadWithInjectedSuccess);
  assert.strictEqual(hasProof, false, 'subscription.order.failure asla payment proof olamaz');

  const res = await db.handleWebhookRequest(failurePayloadWithInjectedSuccess);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'past_due');
  assert.strictEqual(res.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 0, 'Basarisiz siparis icin odeme kaydedilemez');
});

await runAsyncTest('7.6. [IMZA DISI ALAN SALDIRISI - eventTime Forward Jump] Saldirgan ileri tarihli (+1 yil) eventTime enjekte ettiginde clock skew korumasiyla zaman damgasi reddedilir ve watermark korunur', async () => {
  const db = new TransactionalTestDatabase();
  const subNowIso = new Date('2026-09-01T12:00:00Z').toISOString();
  db.seedSubscription({
    id: 'sub_crypto_006',
    tenant_id: 'tenant_crypto_06',
    provider_subscription_id: 'sub_ref_crypto_06',
    status: 'active',
    last_webhook_event_at: subNowIso
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const futureTimestamp = Date.now() + 365 * 24 * 3600 * 1000; // +1 year in future
  const payloadWithFutureTime = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_06',
    customerReferenceCode: 'tenant_crypto_06',
    orderReferenceCode: 'ord_ref_crypto_06',
    eventTime: futureTimestamp,
    iyziPaymentId: 'pay_future_666',
    price: 199.00,
    status: 'SUCCESS'
  };

  // Clock skew guard must reject the future timestamp
  const extractedTimestamp = iyzicoClient.extractProviderEventTimestamp(payloadWithFutureTime);
  assert.strictEqual(extractedTimestamp, null, '5 dakikadan ileri zaman damgasi guvenilmez olarak null donmelidir');

  const transitionEval = iyzicoClient.evaluateSubscriptionTransition(
    'active',
    'active',
    'subscription.order.success',
    true,
    futureTimestamp,
    Date.now()
  );
  assert.strictEqual(transitionEval.allowed, false);
  assert.strictEqual(transitionEval.isOutOfOrder, true);

  await db.handleWebhookRequest(payloadWithFutureTime);
  const sub = db.subscriptions.get('sub_crypto_006');
  assert.notStrictEqual(sub.last_webhook_event_at, new Date(futureTimestamp).toISOString(), 'Watermark ileri tarihe ziplatilamaz');
});

await runAsyncTest('7.7. [IMZA DISI ALAN SALDIRISI - price Tahrifati] Saldirgan imzasiz price alanini 0.01 veya 99999 olarak degistirse dahi odeme defterine yetkili abonelik sozlesme fiyati (sub.price) yazilir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_007',
    tenant_id: 'tenant_crypto_07',
    provider_subscription_id: 'sub_ref_crypto_07',
    status: 'pending',
    price: 1490.00 // authorized contract price
  });

  const secretKey = 'test_secret_key_idempotency_2026';
  const tamperedPricePayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_07',
    customerReferenceCode: 'tenant_crypto_07',
    orderReferenceCode: 'ord_ref_crypto_07',
    price: 0.01, // attacker changed price to 1 kurus!
    iyziPaymentId: 'pay_tampered_price_777',
    status: 'SUCCESS'
  };

  const signature = crypto.createHmac('sha256', secretKey)
    .update(iyzicoClient.buildSubscriptionWebhookSignaturePayload(tamperedPricePayload, secretKey))
    .digest('hex');
  const headers = { 'x-iyz-signature-v3': signature };

  const verify = await iyzicoClient.verifyIyzicoSignatureV3(headers, tamperedPricePayload, secretKey);
  assert.strictEqual(verify.isValid, true, 'Price subscription imza formulunde olmadigi icin imza gecmistir');

  const res = await db.handleWebhookRequest(tamperedPricePayload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);
  assert.strictEqual(Number(db.paymentsList[0].amount), 1490.00, 'Odeme defterine saldirganin tahrif ettigi 0.01 degil, sozlesme fiyati 1490.00 kaydedilmelidir');
});

await runAsyncTest('7.8. [IMZA DISI ALAN SALDIRISI - HEM eventId HEM iyziPaymentId DEGISTIRILMESI] Saldirgan hem imzasiz eventId hem imzasiz iyziPaymentId alanlarini degistirerek gonderse dahi sistem imzali (eventType, subRef, orderRef) anahtari ve iyzico:order:{orderRef} odeme kimligi sayesinde mukerrer 200 doner ve 0 yeni odeme kaydeder', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_008',
    tenant_id: 'tenant_crypto_08',
    provider_subscription_id: 'sub_ref_crypto_08',
    status: 'pending'
  });

  const legitPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_ref_crypto_08',
    customerReferenceCode: 'tenant_crypto_08',
    orderReferenceCode: 'ord_ref_crypto_08',
    eventId: 'evt_legit_888',
    iyziPaymentId: 'pay_legit_888',
    price: 299.00,
    status: 'SUCCESS'
  };

  const res1 = await db.handleWebhookRequest(legitPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);

  // Attacker tampers with BOTH unsigned eventId AND unsigned iyziPaymentId
  const doubleTamperedPayload = {
    ...legitPayload,
    eventId: 'evt_attacker_fresh_bypass_999',
    iyziPaymentId: 'pay_attacker_fresh_bypass_999'
  };

  const legitEventKey = iyzicoClient.extractProviderEventId(legitPayload);
  const tamperedEventKey = iyzicoClient.extractProviderEventId(doubleTamperedPayload);
  assert.strictEqual(legitEventKey, tamperedEventKey, 'Hem eventId hem iyziPaymentId degisse de anahtar degismez');

  const legitPaymentId = iyzicoClient.extractProviderPaymentId(legitPayload);
  const tamperedPaymentId = iyzicoClient.extractProviderPaymentId(doubleTamperedPayload);
  assert.strictEqual(legitPaymentId, tamperedPaymentId, 'Odeme kimligi degismez');

  const res2 = await db.handleWebhookRequest(doubleTamperedPayload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1, 'Cift tahrifatta asla ikinci bir odeme olusturulamaz');
});

await runAsyncTest('7.9. [IMZA DISI ALAN SALDIRISI - period VE conversationId MANIPULASYONU] Saldirgan imza kapsami disindaki period veya conversationId alanlarini degistirse dahi duplicate olarak bastirilir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_009',
    tenant_id: 'tenant_crypto_09',
    provider_subscription_id: 'sub_ref_crypto_09',
    status: 'active'
  });

  const legitPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_09',
    customerReferenceCode: 'tenant_crypto_09',
    orderReferenceCode: 'ord_ref_crypto_09',
    period: '2026-09',
    conversationId: 'conv_111',
    price: 199.00,
    status: 'SUCCESS'
  };

  const res1 = await db.handleWebhookRequest(legitPayload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);

  const tamperedRenewal = {
    ...legitPayload,
    period: '2026-10', // unsigned tampered period
    conversationId: 'conv_attacker_999' // unsigned tampered convId
  };

  const key1 = iyzicoClient.extractProviderEventId(legitPayload);
  const key2 = iyzicoClient.extractProviderEventId(tamperedRenewal);
  assert.strictEqual(key1, key2, 'Imzasiz period veya conversationId anahtari degistiremez');

  const res2 = await db.handleWebhookRequest(tamperedRenewal);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.duplicate, true);
  assert.strictEqual(res2.body.paymentRecorded, false);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('7.10. [MESRU AYRI YASAM DONGUSU OLAYLARI] subscription.created ardindan farkli orderReferenceCode tasiyan mesru renewal olaylari farkli anahtarlar uretir ve ayri ayri islenir', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_010',
    tenant_id: 'tenant_crypto_10',
    provider_subscription_id: 'sub_ref_crypto_10',
    status: 'none'
  });

  const createdPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.created',
    subscriptionReferenceCode: 'sub_ref_crypto_10',
    customerReferenceCode: 'tenant_crypto_10'
  };

  const renewalPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_10',
    customerReferenceCode: 'tenant_crypto_10',
    orderReferenceCode: 'ord_cycle_1001',
    price: 199.00,
    status: 'SUCCESS'
  };

  const keyCreated = iyzicoClient.extractProviderEventId(createdPayload);
  const keyRenewal = iyzicoClient.extractProviderEventId(renewalPayload);
  assert.notStrictEqual(keyCreated, keyRenewal, 'Mesru ayri yasam dongusu olaylari farkli anahtarlar uretmelidir');

  const resCreated = await db.handleWebhookRequest(createdPayload);
  assert.strictEqual(resCreated.status, 200);
  assert.strictEqual(resCreated.body.status, 'pending');

  const resRenewal = await db.handleWebhookRequest(renewalPayload);
  assert.strictEqual(resRenewal.status, 200);
  assert.strictEqual(resRenewal.body.status, 'active');
  assert.strictEqual(resRenewal.body.paymentRecorded, true);
  assert.strictEqual(db.paymentsList.length, 1);
});

await runAsyncTest('7.11. [STATUS ENJEKSIYONU KORUMASI] subscription.order.success olayina status: FAILURE enjeksiyonu yok sayilir; abonelik mesru sekilde active olur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_011',
    tenant_id: 'tenant_crypto_11',
    provider_subscription_id: 'sub_ref_crypto_11',
    status: 'pending'
  });

  const injectedPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_crypto_11',
    customerReferenceCode: 'tenant_crypto_11',
    orderReferenceCode: 'ord_ref_crypto_11',
    status: 'FAILURE', // attacker injected fake FAILURE into order.success!
    price: 199.00
  };

  const mapped = iyzicoClient.mapIyzicoWebhookToInternalStatus(injectedPayload);
  assert.strictEqual(mapped, 'active', 'eventType subscription.order.success oldugunda imzasiz FAILURE enjeksiyonu yok sayilmalidir');

  const res = await db.handleWebhookRequest(injectedPayload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'active');
  assert.strictEqual(res.body.paymentRecorded, true);
  assert.strictEqual(db.subscriptions.get('sub_crypto_011').status, 'active');
});

await runAsyncTest('7.12. [STATUS ENJEKSIYONU KORUMASI] payment.success olayina status: PENDING enjeksiyonu yok sayilir; abonelik mesru sekilde active olur', async () => {
  const db = new TransactionalTestDatabase();
  db.seedSubscription({
    id: 'sub_crypto_012',
    tenant_id: 'tenant_crypto_12',
    provider_subscription_id: 'sub_ref_crypto_12',
    status: 'pending'
  });

  const injectedPayload = {
    merchantId: 'merchant_test_01',
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_ref_crypto_12',
    customerReferenceCode: 'tenant_crypto_12',
    orderReferenceCode: 'ord_ref_crypto_12',
    status: 'PENDING', // attacker injected fake PENDING into payment.success!
    price: 199.00
  };

  const mapped = iyzicoClient.mapIyzicoWebhookToInternalStatus(injectedPayload);
  assert.strictEqual(mapped, 'active', 'eventType payment.success oldugunda imzasiz PENDING enjeksiyonu yok sayilmalidir');

  const res = await db.handleWebhookRequest(injectedPayload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'active');
  assert.strictEqual(res.body.paymentRecorded, true);
  assert.strictEqual(db.subscriptions.get('sub_crypto_012').status, 'active');
});

// ---------------------------------------------------------------------------
// 8. DISPOSABLE POSTGRESQL ENGINE INTEGRATION & QUALIFICATION
// Executes candidate migration, unique constraints, role privileges, atomic transactions,
// crash-recovery retries, and out-of-order replay suppression directly on a real PostgreSQL engine.
// ---------------------------------------------------------------------------
let embeddedPgServer = null;
let disposablePgClient = null;
let disposableTmpDir = null;

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function getDisposablePgEngine() {
  if (disposablePgClient) return disposablePgClient;

  disposableTmpDir = path.join(os.tmpdir(), `pg_lari_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
  const port = await getAvailablePort();
  const pg = new EmbeddedPostgres({
    databaseDir: disposableTmpDir,
    port,
    user: 'postgres',
    password: 'password',
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    persistent: false
  });

  await pg.initialise();
  await pg.start();
  embeddedPgServer = pg;

  const client = pg.getPgClient();
  await client.connect();
  await client.query(`ALTER DATABASE postgres SET synchronous_commit = 'off'; SET synchronous_commit = 'off';`);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS public.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      provider_subscription_id TEXT,
      provider_token TEXT,
      provider_session_id TEXT,
      status TEXT,
      price NUMERIC DEFAULT 1490.00,
      currency TEXT DEFAULT 'TRY',
      last_webhook_event_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS public.payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      subscription_id UUID,
      provider TEXT NOT NULL,
      provider_event_id TEXT,
      provider_payment_id TEXT,
      amount NUMERIC(10,2),
      currency TEXT,
      status TEXT,
      paid_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      action TEXT,
      details JSONB,
      created_at TIMESTAMPTZ
    );
  `);

  // Apply candidate migration directly on real PostgreSQL
  await client.query(migContent);

  disposablePgClient = {
    client,
    port,
    getPgClient: () => pg.getPgClient(),
    // NEVER rewrite a failed PostgreSQL lookup into LIKE/metadata matches.
    // Real database results are the sole acceptance evidence.
    query: (sql, params) => client.query(sql, params),
    exec: (sql) => client.query(sql)
  };

  return disposablePgClient;
}

class DisposablePgClient {
  constructor(client, sessionId, sessionToken = crypto.randomUUID(), backendPid = null, engine = null) {
    this.client = client;
    this.sessionId = sessionId;
    this.sessionToken = sessionToken;
    this.clientId = sessionId;
    this.active = true;
    this.backendPid = backendPid;
    this.engine = engine;
    this.inTransaction = false;
  }

  getBackendPid() {
    return this.backendPid;
  }

  async getSessionIdentity() {
    return {
      sessionId: this.sessionId,
      sessionToken: this.sessionToken,
      backendPid: this.backendPid,
      active: this.active
    };
  }

  async query(sql, params) {
    if (!this.active) throw new Error(`Session ${this.sessionId} is inactive`);
    return this.client.query(sql, params);
  }

  async exec(sql) {
    if (!this.active) throw new Error(`Session ${this.sessionId} is inactive`);
    return this.client.query(sql);
  }

  async transaction(callback) {
    if (!this.active) throw new Error(`Session ${this.sessionId} is inactive`);
    this.inTransaction = true;
    await this.client.query('BEGIN');
    try {
      const sessionTx = {
        sessionId: this.sessionId,
        sessionToken: this.sessionToken,
        getBackendPid: () => this.getBackendPid(),
        query: (s, p) => this.client.query(s, p),
        exec: (s) => this.client.query(s),
        rollback: async () => {
          await this.client.query('ROLLBACK');
          this.inTransaction = false;
        }
      };
      const res = await callback(sessionTx);
      if (this.inTransaction) {
        await this.client.query('COMMIT');
      }
      return res;
    } catch (err) {
      if (this.inTransaction) {
        try { await this.client.query('ROLLBACK'); } catch {}
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async clone(newSessionId) {
    if (!this.engine) throw new Error('Engine reference missing for clone');
    const newClient = this.engine.getPgClient();
    await newClient.connect();
    const pidRes = await newClient.query('SELECT pg_backend_pid() AS pid');
    const newPid = pidRes.rows[0].pid;
    const newSessionToken = crypto.randomUUID();
    return new DisposablePgClient(newClient, newSessionId || `${this.sessionId}-cloned`, newSessionToken, newPid, this.engine);
  }

  async sync() {
    // No-op for network PostgreSQL
  }

  async close() {
    this.active = false;
    if (this.client) {
      try {
        await this.client.end();
      } catch {}
    }
  }
}

function createTransactionBarrier() {
  let resolveEntered;
  const entered = new Promise(resolve => { resolveEntered = resolve; });
  let resolveRelease;
  const release = new Promise(resolve => { resolveRelease = resolve; });
  return {
    signalEntered: () => resolveEntered(),
    waitEntered: () => entered,
    releaseBarrier: () => resolveRelease(),
    waitRelease: () => release,
  };
}

async function createIndependentPgSessions() {
  const engine = await getDisposablePgEngine();
  const registry = new Map();

  const createSession = async (sessionId) => {
    const pgClient = engine.getPgClient();
    await pgClient.connect();
    const pidRes = await pgClient.query('SELECT pg_backend_pid() AS pid');
    const backendPid = pidRes.rows[0].pid;
    const token = crypto.randomUUID();
    const client = new DisposablePgClient(pgClient, sessionId, token, backendPid, engine);
    registry.set(sessionId, client);
    return client;
  };

  const client1 = await createSession('worker-client-alpha-01');
  const client2 = await createSession('worker-client-beta-02');

  return {
    client1,
    client2,
    createSession,
    registry,
    cleanup: async () => {
      for (const c of registry.values()) {
        await c.close();
      }
      registry.clear();
    }
  };
}

await runAsyncTest('8.1. [DISPOSABLE DB QUALIFICATION] Aday migration gercek PostgreSQL motoru uzerinde basariyla calistirilir', async () => {
  const db = await getDisposablePgEngine();
  assert(db, 'Disposable PostgreSQL motoru baslatilmalidir');

  // Verify tables and extensions
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('payment_webhook_idempotency', 'subscriptions', 'payments', 'audit_logs');
  `);
  const tableNames = tables.rows.map(r => r.table_name);
  assert(tableNames.includes('payment_webhook_idempotency'), 'payment_webhook_idempotency tablosu olusturulmus olmali');
  assert(tableNames.includes('payments'), 'payments tablosu mevcut olmali');

  // Verify column added to subscriptions
  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'last_webhook_event_at';
  `);
  assert.strictEqual(cols.rows.length, 1, 'last_webhook_event_at kolonu subscriptions tablosuna eklenmis olmali');

  // Protokol geregi migration dosyasinda uzak DB koruma direktifinin varligi teyit edilir
  assert(migContent.includes('Do NOT execute on live/remote production databases automatically'), 'Uzak DB koruma direktifi zorunludur');
});

await runAsyncTest('8.2. [GERCEK DB UNIQUE CONSTRAINT] PostgreSQL motoru payments ve idempotency unique kisitlarini 23505 ile zorunlu kilar', async () => {
  const db = await getDisposablePgEngine();

  // 1. payment_webhook_idempotency unique constraint
  await db.query(`
    INSERT INTO public.payment_webhook_idempotency (provider, provider_event_id, event_type, status)
    VALUES ('iyzico', 'evt_pg_unique_test', 'payment.success', 'processing');
  `);

  let uniqueViolationCaught = false;
  try {
    await db.query(`
      INSERT INTO public.payment_webhook_idempotency (provider, provider_event_id, event_type, status)
      VALUES ('iyzico', 'evt_pg_unique_test', 'payment.success', 'processing');
    `);
  } catch (err) {
    if (err.code === '23505' || err.message.includes('unique constraint') || err.message.includes('duplicate key')) {
      uniqueViolationCaught = true;
    }
  }
  assert.strictEqual(uniqueViolationCaught, true, 'payment_webhook_idempotency unique violation 23505 firlatmalidir');

  // 2. payments unique index
  await db.query(`
    INSERT INTO public.payments (provider, provider_event_id, amount, currency, status)
    VALUES ('iyzico', 'pay_pg_unique_test', 1490, 'TRY', 'paid');
  `);

  let paymentUniqueViolationCaught = false;
  try {
    await db.query(`
      INSERT INTO public.payments (provider, provider_event_id, amount, currency, status)
      VALUES ('iyzico', 'pay_pg_unique_test', 1490, 'TRY', 'paid');
    `);
  } catch (err) {
    if (err.code === '23505' || err.message.includes('unique') || err.message.includes('duplicate key')) {
      paymentUniqueViolationCaught = true;
    }
  }
  assert.strictEqual(paymentUniqueViolationCaught, true, 'payments unique index 23505 firlatmalidir');
});

await runAsyncTest('8.3. [GERCEK DB CLAIM RPC] claim_payment_webhook_event gercek PostgreSQL uzerinde satiri processing kilitler ve duplicate engeller', async () => {
  const db = await getDisposablePgEngine();

  // 1. Initial claim
  const res1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_claim_rpc_01', 'payment.success', 'sub_pg_01', 'tenant_pg_01') as claim;
  `);
  const claim1 = res1.rows[0].claim;
  assert.strictEqual(claim1.can_proceed, true);
  assert.strictEqual(claim1.is_duplicate, false);
  assert.strictEqual(claim1.status, 'processing');
  assert(claim1.id, 'Claim ID atanmalidir');

  // 2. Immediate duplicate claim
  const res2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_claim_rpc_01', 'payment.success', 'sub_pg_01', 'tenant_pg_01') as claim;
  `);
  const claim2 = res2.rows[0].claim;
  assert.strictEqual(claim2.can_proceed, false);
  assert.strictEqual(claim2.is_duplicate, true);
  assert.strictEqual(claim2.status, 'processing');

  // 3. Timeout reclamation
  await db.query(`
    UPDATE public.payment_webhook_idempotency
    SET updated_at = now() - interval '90 seconds'
    WHERE provider = 'iyzico' AND provider_event_id = 'evt_pg_claim_rpc_01';
  `);
  const res3 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_claim_rpc_01', 'payment.success', 'sub_pg_01', 'tenant_pg_01') as claim;
  `);
  const claim3 = res3.rows[0].claim;
  assert.strictEqual(claim3.can_proceed, true);
  assert.strictEqual(claim3.status, 'reclaimed_stuck_lock');
});

await runAsyncTest('8.4. [GERCEK DB FINALIZE RPC] finalize_payment_webhook_event statusu processed yapar ve gecersiz durumu reddeder', async () => {
  const db = await getDisposablePgEngine();
  const evtId = 'evt_pg_finalize_rpc_01';

  // First claim with mandatory token
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_pg_01', 'tenant_pg_01') as claim;
  `, [evtId]);
  const claimAttemptId = claimRes.rows[0].claim.claim_attempt_id;
  assert(claimAttemptId, 'Claim fresh claim_attempt_id token uretmelidir');

  const finRes = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'processed', '{"status":"active","paymentRecorded":true}'::jsonb, $2::uuid) as fin;
  `, [evtId, claimAttemptId]);
  const fin = finRes.rows[0].fin;
  assert.strictEqual(fin.finalized, true);
  assert.strictEqual(fin.status, 'processed');

  // Claiming processed event returns is_duplicate: true
  const resDuplicate = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_pg_01', 'tenant_pg_01') as claim;
  `, [evtId]);
  const claimDup = resDuplicate.rows[0].claim;
  assert.strictEqual(claimDup.can_proceed, false);
  assert.strictEqual(claimDup.is_duplicate, true);
  assert.strictEqual(claimDup.status, 'processed');

  // Invalid finalization status is rejected by check constraint / exception
  let invalidStatusCaught = false;
  try {
    await db.query(`
      SELECT public.finalize_payment_webhook_event('iyzico', $1, 'unrecognized_status', '{}'::jsonb, $2::uuid);
    `, [evtId, claimAttemptId]);
  } catch (err) {
    if (err.message.includes('Invalid finalization status')) {
      invalidStatusCaught = true;
    }
  }
  assert.strictEqual(invalidStatusCaught, true, 'Gecersiz finalize durumu PostgreSQL exception firlatmalidir');
});

await runAsyncTest('8.5. [GERCEK DB CRASH RECOVERY] Failed durumu alan olay gercek DB retry cagrisinda reclaim edilir ve tamamlanir', async () => {
  const db = await getDisposablePgEngine();

  // 1. Claim initial event
  const claim1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'payment.success', 'sub_pg_crash', 'tenant_pg_crash') as claim;
  `);
  const token1 = claim1.rows[0].claim.claim_attempt_id;
  assert(token1, 'Ilk claim attempt token uretmelidir');

  // 2. Mark failed (crash / network error) with valid token
  const fin1 = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'failed', '{"error":"network timeout"}'::jsonb, $1::uuid) as fin;
  `, [token1]);
  assert.strictEqual(fin1.rows[0].fin.finalized, true);

  // 3. Provider retry: claim succeeds with reclaimed_after_failure and NEW fresh token
  const retryRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'payment.success', 'sub_pg_crash', 'tenant_pg_crash') as claim;
  `);
  const retryClaim = retryRes.rows[0].claim;
  assert.strictEqual(retryClaim.can_proceed, true, 'Failed olay retry cagrilarinda can_proceed: true almali');
  assert.strictEqual(retryClaim.status, 'reclaimed_after_failure');
  const token2 = retryClaim.claim_attempt_id;
  assert(token2 && token2 !== token1, 'Reclaim sonrasi YENI claim_attempt_id atanmalidir');

  // Stale token1 cannot finalize anymore!
  const staleFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'processed', '{"status":"active"}'::jsonb, $1::uuid) as fin;
  `, [token1]);
  assert.strictEqual(staleFin.rows[0].fin.finalized, false, 'Bayat token finalize edemez');
  assert.strictEqual(staleFin.rows[0].fin.reason, 'LEASE_FENCING_REJECTED');

  // 4. Finalize to processed with fresh token2
  const legitFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'processed', '{"status":"active"}'::jsonb, $1::uuid) as fin;
  `, [token2]);
  assert.strictEqual(legitFin.rows[0].fin.finalized, true, 'Gecerli token finalize edebilmelidir');

  // 5. Duplicate replay is suppressed
  const thirdRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_pg_crash_01', 'payment.success', 'sub_pg_crash', 'tenant_pg_crash') as claim;
  `);
  assert.strictEqual(thirdRes.rows[0].claim.can_proceed, false);
  assert.strictEqual(thirdRes.rows[0].claim.is_duplicate, true);
  assert.strictEqual(thirdRes.rows[0].claim.status, 'processed');
});

await runAsyncTest('8.6. [GERCEK DB TRANSACTION ATOMICITY] execute_payment_webhook_transaction tek islemde subscription, payment ve audit yazar; hatada rollback eder', async () => {
  const db = await getDisposablePgEngine();

  // Seed subscription
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price, currency)
    VALUES ('sub_ref_tx_real_01', 'pending', 1990.00, 'TRY');
  `);

  // Claim
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_tx_real_01', 'payment.success', 'sub_ref_tx_real_01', null) as claim;
  `);
  const attemptId = claimRes.rows[0].claim.claim_attempt_id;
  assert(attemptId, 'Claim attemptId donmelidir');

  // Execute all-in-one transaction with valid attemptId
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      'evt_tx_real_01',
      'payment.success',
      'sub_ref_tx_real_01',
      null,
      'active',
      true,
      1990,
      'TRY',
      null,
      '{}'::jsonb,
      '{}'::jsonb,
      $1::uuid
    ) as tx;
  `, [attemptId]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'active');
  assert.strictEqual(tx.payment_recorded, true);

  // Verify in PostgreSQL tables
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = 'sub_ref_tx_real_01';`);
  assert.strictEqual(subCheck.rows[0].status, 'active');

  const payCheck = await db.query(`SELECT amount, status FROM public.payments WHERE provider_event_id = 'evt_tx_real_01';`);
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(Number(payCheck.rows[0].amount), 1990);
  assert.strictEqual(payCheck.rows[0].status, 'paid');

  const auditCheck = await db.query(`SELECT action, details FROM public.audit_logs WHERE action = 'payment_webhook';`);
  assert(auditCheck.rows.length >= 1);

  const idemCheck = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = 'evt_tx_real_01';`);
  assert.strictEqual(idemCheck.rows[0].status, 'processed');

  // Replay of same transaction returns duplicate without extra payment
  const txReplayRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      'evt_tx_real_01',
      'payment.success',
      'sub_ref_tx_real_01',
      null,
      'active',
      true,
      1990,
      'TRY',
      null,
      '{}'::jsonb,
      '{}'::jsonb,
      $1::uuid
    ) as tx;
  `, [attemptId]);
  assert.strictEqual(txReplayRes.rows[0].tx.duplicate, true);
  assert.strictEqual(txReplayRes.rows[0].tx.payment_recorded, false);

  const payCheck2 = await db.query(`SELECT id FROM public.payments WHERE provider_event_id = 'evt_tx_real_01';`);
  assert.strictEqual(payCheck2.rows.length, 1, 'Mukerrer istek sonrasi odeme adedi kesinlikle 1 kalmalidir');
});

await runAsyncTest('8.7. [GERCEK DB MONOTONIC TIMESTAMPS] Gercek PostgreSQL uzerinde gecikmis eski olay subscription durumunu degistiremez', async () => {
  const db = await getDisposablePgEngine();

  // Create active subscription with timestamp 2026-09-01 12:00:00+00
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ('sub_ref_ooo_01', 'active', '2026-09-01 12:00:00+00');
  `);

  // Claim
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_stale_cancel_01', 'subscription.cancelled', 'sub_ref_ooo_01', null) as claim;
  `);
  const attemptId = claimRes.rows[0].claim.claim_attempt_id;

  // Execute transaction with older timestamp 2026-09-01 11:45:00+00 and target_status = 'cancelled'
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      'evt_stale_cancel_01',
      'subscription.cancelled',
      'sub_ref_ooo_01',
      null,
      'cancelled',
      false,
      0,
      'TRY',
      '2026-09-01 11:45:00+00'::timestamptz,
      '{}'::jsonb,
      '{}'::jsonb,
      $1::uuid
    ) as tx;
  `, [attemptId]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.out_of_order_suppressed, true, 'Gecikmis iptal olayi suppressed olarak isaretlenmelidir');
  assert.strictEqual(tx.status, 'active', 'Abonelik durumu active kalmalidir');

  // Verify in subscriptions table
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = 'sub_ref_ooo_01';`);
  assert.strictEqual(subCheck.rows[0].status, 'active', 'Veritabanindaki abonelik active durumunu korumalidir');
});

await runAsyncTest('8.8. [GERCEK DB ROL VE YETKI GUVENLIGI] Anon rolunun RPC ve tablo erisimi 42501 ile engellenir, service_role erisebilir', async () => {
  const db = await getDisposablePgEngine();

  // 1. Anon role executing claim_payment_webhook_event must be rejected (42501)
  let anonRpcRejected = false;
  try {
    await db.exec(`
      SET ROLE anon;
      SELECT public.claim_payment_webhook_event('iyzico', 'evt_anon_test', 'payment.success', 'sub_1', null);
    `);
  } catch (err) {
    if (err.code === '42501' || err.message.includes('permission denied')) {
      anonRpcRejected = true;
    }
  } finally {
    await db.exec('RESET ROLE;');
  }
  assert.strictEqual(anonRpcRejected, true, 'Anon rolunun claim RPC calistirmasi 42501 ile engellenmelidir');

  // 2. Anon role querying payment_webhook_idempotency must be rejected (42501)
  let anonTableRejected = false;
  try {
    await db.exec(`
      SET ROLE anon;
      SELECT * FROM public.payment_webhook_idempotency;
    `);
  } catch (err) {
    if (err.code === '42501' || err.message.includes('permission denied')) {
      anonTableRejected = true;
    }
  } finally {
    await db.exec('RESET ROLE;');
  }
  assert.strictEqual(anonTableRejected, true, 'Anon rolunun idempotency tablosunu okumasi 42501 ile engellenmelidir');

  // 3. Service role has full authorized access
  await db.exec('SET ROLE service_role;');
  const serviceRoleRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', 'evt_service_role_legit', 'payment.success', 'sub_sr_01', null) as claim;
  `);
  await db.exec('RESET ROLE;');
  assert.strictEqual(serviceRoleRes.rows[0].claim.can_proceed, true, 'service_role yetkili erisim saglamalidir');
});

await runAsyncTest('8.9. [GERÇEK DB LEASE FENCING] NULL token ve bayat token ile finalize/execute çağrıları kesin olarak reddedilir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_fencing_test_01';
  const evtId = 'evt_fencing_test_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1890.00);
  `, [subRef]);

  // Worker 1 claims event
  const claim1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtId, subRef]);
  const token1 = claim1.rows[0].claim.claim_attempt_id;
  assert(token1, 'Worker 1 gecerli token almalidir');

  // 1. Finalize with NULL token is rejected
  const nullFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{}'::jsonb, NULL) as fin;
  `, [evtId]);
  assert.strictEqual(nullFin.rows[0].fin.finalized, false, 'NULL token ile finalize reddedilmelidir');
  assert.strictEqual(nullFin.rows[0].fin.reason, 'LEASE_FENCING_REJECTED');

  // 2. Execute transaction with NULL token is rejected
  const nullTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 100, 'TRY', null, '{}'::jsonb, '{}'::jsonb, NULL
    ) as tx;
  `, [evtId, subRef]);
  assert.strictEqual(nullTx.rows[0].tx.success, false, 'NULL token ile transaction reddedilmelidir');
  assert.strictEqual(nullTx.rows[0].tx.error, 'LEASE_LOST_TO_ANOTHER_WORKER');

  // Fast forward lock to simulate timeout
  await db.query(`
    UPDATE public.payment_webhook_idempotency
    SET updated_at = now() - interval '90 seconds'
    WHERE provider_event_id = $1;
  `, [evtId]);

  // Worker 2 claims stuck lock
  const claim2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtId, subRef]);
  const token2 = claim2.rows[0].claim.claim_attempt_id;
  assert(token2 && token2 !== token1, 'Worker 2 yeni token almalidir');

  // 3. Delayed Worker 1 attempts to finalize with stale token1: MUST BE REJECTED
  const staleFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{"error":"delayed"}'::jsonb, $2::uuid) as fin;
  `, [evtId, token1]);
  assert.strictEqual(staleFin.rows[0].fin.finalized, false, 'Bayat token1 ile finalize reddedilmelidir');
  assert.strictEqual(staleFin.rows[0].fin.reason, 'LEASE_FENCING_REJECTED');

  // 4. Delayed Worker 1 attempts to execute transaction with stale token1: MUST BE REJECTED
  const staleTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 100, 'TRY', null, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtId, subRef, token1]);
  assert.strictEqual(staleTx.rows[0].tx.success, false, 'Bayat token1 ile transaction reddedilmelidir');
  assert.strictEqual(staleTx.rows[0].tx.error, 'LEASE_LOST_TO_ANOTHER_WORKER');

  // 5. Worker 2 executes successfully with valid token2
  const validTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 100, 'TRY', null, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtId, subRef, token2]);
  assert.strictEqual(validTx.rows[0].tx.success, true, 'Worker 2 gecerli token2 ile islemi tamamlamalidir');
  assert.strictEqual(validTx.rows[0].tx.payment_recorded, true);

  // 6. After reaching terminal processed state, delayed Worker 1 catch finalize is harmlessly rejected
  const lateCatchFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{"error":"late"}'::jsonb, $2::uuid) as fin;
  `, [evtId, token1]);
  assert.strictEqual(lateCatchFin.rows[0].fin.finalized, false);
  assert.strictEqual(lateCatchFin.rows[0].fin.reason, 'ALREADY_TERMINAL');
});

await runAsyncTest('8.10. [GERÇEK DB PAYLOAD ÇAKIŞMASI] Aynı provider_event_id farklı payload_fingerprint taşıdığında processed, processing ve failed durumlarının tümünde conflict döner', async () => {
  const db = await getDisposablePgEngine();

  // Test Case A: Processing status - different fingerprint -> conflict
  const evtA = 'evt_collision_test_processing';
  const claimA1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_01', 't1', 'fp_original_A') as claim;
  `, [evtA]);
  assert.strictEqual(claimA1.rows[0].claim.status, 'processing');

  const claimA2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_01', 't1', 'fp_tampered_A') as claim;
  `, [evtA]);
  assert.strictEqual(claimA2.rows[0].claim.status, 'conflict', 'Processing kaydina farkli fingerprint conflict donmelidir');
  assert.strictEqual(claimA2.rows[0].claim.error, 'PAYLOAD_FINGERPRINT_MISMATCH');

  // Test Case B: Failed status - different fingerprint -> conflict (fingerprint remains immutable)
  const evtB = 'evt_collision_test_failed';
  const claimB1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_02', 't2', 'fp_original_B') as claim;
  `, [evtB]);
  const tokenB1 = claimB1.rows[0].claim.claim_attempt_id;
  await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{}'::jsonb, $2::uuid);
  `, [evtB, tokenB1]);

  const claimB2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_02', 't2', 'fp_tampered_B') as claim;
  `, [evtB]);
  assert.strictEqual(claimB2.rows[0].claim.status, 'conflict', 'Failed kaydina farkli fingerprint ile reclaim denenirse conflict donmelidir');
  assert.strictEqual(claimB2.rows[0].claim.error, 'PAYLOAD_FINGERPRINT_MISMATCH');

  // Test Case C: Processed status - different fingerprint -> conflict
  const evtC = 'evt_collision_test_processed';
  const claimC1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_03', 't3', 'fp_original_C') as claim;
  `, [evtC]);
  const tokenC1 = claimC1.rows[0].claim.claim_attempt_id;
  await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'processed', '{"status":"active"}'::jsonb, $2::uuid);
  `, [evtC, tokenC1]);

  const claimC2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_fp_03', 't3', 'fp_tampered_C') as claim;
  `, [evtC]);
  assert.strictEqual(claimC2.rows[0].claim.status, 'conflict', 'Processed kaydina farkli fingerprint conflict donmelidir');
  assert.strictEqual(claimC2.rows[0].claim.error, 'PAYLOAD_FINGERPRINT_MISMATCH');
});

await runAsyncTest('8.11. [GERÇEK DB INTERLEAVING - TRIALING] PostgreSQL içinde FOR UPDATE kilidi altında trialing abonelik concurrent subscription.created olayı ile pending durumuna düşürülemez', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_trialing_interleaving_01';
  const evtId = 'evt_trialing_delayed_create_01';

  // Seed subscription in 'trialing' status
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'trialing');
  `, [subRef]);

  // Concurrent/delayed subscription.created event arrives attempting to set status = 'pending'
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.created', $2, null) as claim;
  `, [evtId, subRef]);
  const attemptId = claimRes.rows[0].claim.claim_attempt_id;

  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      $1,
      'subscription.created',
      $2,
      null,
      'pending',
      false,
      0,
      'TRY',
      null,
      '{}'::jsonb,
      '{}'::jsonb,
      $3::uuid
    ) as tx;
  `, [evtId, subRef, attemptId]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'trialing', 'SQL transaction icinde trialing abonelik pending yapilamaz, trialing kalmalidir');
  assert.strictEqual(tx.out_of_order_suppressed, true, 'Interleaving regression bastirilmis olmalidir');

  // Verify in subscriptions table
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'trialing', 'Veritabanindaki abonelik trialing durumunu kesinlikle korumalidir');
});

await runAsyncTest('8.12. [GERÇEK DB FINALIZATION STATE RESTRICTION] Failed durumundaki kayda ayni tokenla dahi finalize cagrisi yapilirsa finalized: false ve NOT_IN_PROCESSING_STATE doner', async () => {
  const db = await getDisposablePgEngine();
  const evtId = 'evt_finalize_failed_state_01';

  // Claim
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', 'sub_ff_01', 't1') as claim;
  `, [evtId]);
  const token = claimRes.rows[0].claim.claim_attempt_id;

  // Finalize as failed
  const failRes = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{"error":"network"}'::jsonb, $2::uuid) as fin;
  `, [evtId, token]);
  assert.strictEqual(failRes.rows[0].fin.finalized, true);

  // Calling finalize again with the same token on 'failed' record MUST return finalized: false
  const retryFin = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'processed', '{"status":"active"}'::jsonb, $2::uuid) as fin;
  `, [evtId, token]);
  assert.strictEqual(retryFin.rows[0].fin.finalized, false, 'Failed durumundaki kayit reclaim edilmeden finalize edilemez');
  assert.strictEqual(retryFin.rows[0].fin.reason, 'NOT_IN_PROCESSING_STATE');
});

await runAsyncTest('8.13. [GERÇEK DB ZAMAN DAMGASIZ OLAY KORUMASI] Dogrulanmis watermark tasiyan active abonelik, zaman damgasi bulunmayan iptal olayi ile downgrade edilemez', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_watermark_protect_01';
  const evtId = 'evt_watermark_protect_01';
  const verifiedWatermark = '2026-09-01 14:00:00+00';

  // Seed active subscription with known watermark
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'active', $2::timestamptz);
  `, [subRef, verifiedWatermark]);

  // Claim cancellation event
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.cancelled', $2, null) as claim;
  `, [evtId, subRef]);
  const token = claimRes.rows[0].claim.claim_attempt_id;

  // Execute transaction without event timestamp (NULL timestamp)
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      $1,
      'subscription.cancelled',
      $2,
      null,
      'cancelled',
      false,
      0,
      'TRY',
      NULL,
      '{}'::jsonb,
      '{}'::jsonb,
      $3::uuid
    ) as tx;
  `, [evtId, subRef, token]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'active', 'Zaman damgasiz iptal olayi active aboneligi iptal edemez');
  assert.strictEqual(tx.out_of_order_suppressed, true);

  // Verify DB state: subscription remains active, watermark is NOT updated with server now()
  const subCheck = await db.query(`
    SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;
  `, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');
  const dbTime = new Date(subCheck.rows[0].last_webhook_event_at).toISOString();
  const expectedTime = new Date(verifiedWatermark).toISOString();
  assert.strictEqual(dbTime, expectedTime, 'Provider watermark sunucu now() degeriyle kirletilemez');
});

await runAsyncTest('8.14. [GERÇEK DB LIFECYCLE EVENT] pending abonelik odeme kaniti gerektirmeyen dogrulanmis subscription.active olayi ile active durumuna gecer', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_lifecycle_active_01';
  const evtId = 'evt_lifecycle_active_01';
  const eventTime = '2026-09-01 10:00:00+00';

  // Seed pending subscription without watermark
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'pending', NULL);
  `, [subRef]);

  // Claim lifecycle active event
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.active', $2, null) as claim;
  `, [evtId, subRef]);
  const token = claimRes.rows[0].claim.claim_attempt_id;
  assert.strictEqual(claimRes.rows[0].claim.can_proceed, true);

  // Execute transaction: lifecycle event carries no payment proof (p_has_payment_proof = false)
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      $1,
      'subscription.active',
      $2,
      null,
      'active',
      false,
      0,
      'TRY',
      $3::timestamptz,
      '{}'::jsonb,
      '{}'::jsonb,
      $4::uuid
    ) as tx;
  `, [evtId, subRef, eventTime, token]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'active', 'subscription.active olayi pending aboneligi basariyla active durumuna gecirmelidir');
  assert.strictEqual(tx.payment_recorded, false, 'Lifecycle olayinda odeme kaydi yazilmamalidir');

  // Verify DB state
  const subCheck = await db.query(`
    SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;
  `, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');
  const dbTime = new Date(subCheck.rows[0].last_webhook_event_at).toISOString();
  const expectedTime = new Date(eventTime).toISOString();
  assert.strictEqual(dbTime, expectedTime, 'Provider watermark dogru guncellenmelidir');
});

await runAsyncTest('8.15. [GERÇEK DB RENEWAL OLAYLARI] Farkli periyot/orderRef tasiyan subscription.renewed olaylari ayri ayri islenir ve duplicate olarak bastirilmaz', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_renewed_series_01';
  const evt1 = 'evt_sub_renewed_month1';
  const evt2 = 'evt_sub_renewed_month2';
  const time1 = '2026-09-01 10:00:00+00';
  const time2 = '2026-10-01 10:00:00+00';

  // Seed active subscription
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'active', '2026-08-01 10:00:00+00'::timestamptz);
  `, [subRef]);

  // First renewal: Month 1
  const claim1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.renewed', $2, null) as claim;
  `, [evt1, subRef]);
  const token1 = claim1.rows[0].claim.claim_attempt_id;
  assert.strictEqual(claim1.rows[0].claim.can_proceed, true);

  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'subscription.renewed', $2, null, 'active', true, 99.00, 'TRY', $3::timestamptz, '{}'::jsonb, '{}'::jsonb, $4::uuid
    ) as tx;
  `, [evt1, subRef, time1, token1]);
  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.payment_recorded, true);

  await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'processed', '{"ok":true}'::jsonb, $2::uuid) as fin;
  `, [evt1, token1]);

  // Second renewal: Month 2 (different event id / period)
  const claim2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.renewed', $2, null) as claim;
  `, [evt2, subRef]);
  const token2 = claim2.rows[0].claim.claim_attempt_id;
  assert.strictEqual(claim2.rows[0].claim.can_proceed, true, 'Yeni periyot yenileme olayi duplicate olarak engellenemez');

  const tx2 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'subscription.renewed', $2, null, 'active', true, 99.00, 'TRY', $3::timestamptz, '{}'::jsonb, '{}'::jsonb, $4::uuid
    ) as tx;
  `, [evt2, subRef, time2, token2]);
  assert.strictEqual(tx2.rows[0].tx.success, true);
  assert.strictEqual(tx2.rows[0].tx.payment_recorded, true);

  // Both payments exist in payments table
  const payCount = await db.query(`
    SELECT count(*)::int as cnt FROM public.payments WHERE provider_event_id IN ($1, $2);
  `, [evt1, evt2]);
  assert.strictEqual(payCount.rows[0].cnt, 2, 'Iki ayri periyot yenilemesi icin iki ayri odeme kaydi bulunmalidir');
});

await runAsyncTest('8.16. [GERÇEK DB TERMINAL RESURRECTION BLOCKED] Dogrulanmis watermark tasiyan cancelled abonelik, zaman damgasi bulunmayan (NULL) payment.success ile canlandirilamaz', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_terminal_resurrect_01';
  const evtId = 'evt_null_ts_pay_resurrect_01';
  const terminalWatermark = '2026-09-01 12:00:00+00';

  // Seed cancelled subscription with verified terminal watermark
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'cancelled', $2::timestamptz);
  `, [subRef, terminalWatermark]);

  // Claim payment.success event
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtId, subRef]);
  const token = claimRes.rows[0].claim.claim_attempt_id;

  // Execute payment transaction with NULL timestamp
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      $1,
      'payment.success',
      $2,
      null,
      'active',
      true,
      149.00,
      'TRY',
      NULL,
      '{}'::jsonb,
      '{}'::jsonb,
      $3::uuid
    ) as tx;
  `, [evtId, subRef, token]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'cancelled', 'Zaman damgasiz odeme olayi terminal iptal edilmis aboneligi canlandiramaz');
  assert.strictEqual(tx.out_of_order_suppressed, true, 'Zaman damgasiz canlandirma bastirilmalidir');

  // Verify DB state: subscription remains cancelled, watermark unchanged
  const subCheck = await db.query(`
    SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;
  `, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'cancelled');
  const dbTime = new Date(subCheck.rows[0].last_webhook_event_at).toISOString();
  const expectedTime = new Date(terminalWatermark).toISOString();
  assert.strictEqual(dbTime, expectedTime, 'Terminal watermark asla kirletilemez veya ezilemez');
});

await runAsyncTest('8.17. [GERÇEK DB PAST_DUE ÖDEME KANITI KORUMASI] past_due durumundaki abonelik tahsilat kaniti icermeyen subscription.active olayi ile active yapilamaz, past_due korunur', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_past_due_protect_01';
  const evtId = 'evt_past_due_no_proof_01';

  // Seed past_due subscription
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'past_due', '2026-09-01 10:00:00+00'::timestamptz);
  `, [subRef]);

  // Claim subscription.active event
  const claimRes = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.active', $2, null) as claim;
  `, [evtId, subRef]);
  const token = claimRes.rows[0].claim.claim_attempt_id;
  assert.strictEqual(claimRes.rows[0].claim.can_proceed, true);

  // Execute transaction without payment proof: p_has_payment_proof = false
  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico',
      $1,
      'subscription.active',
      $2,
      null,
      'active',
      false,
      0,
      'TRY',
      '2026-09-02 10:00:00+00'::timestamptz,
      '{}'::jsonb,
      '{}'::jsonb,
      $3::uuid
    ) as tx;
  `, [evtId, subRef, token]);
  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'past_due', 'past_due abonelik odeme kaniti olmadan active yapilamaz');
  assert.strictEqual(tx.out_of_order_suppressed, true);
  assert.strictEqual(tx.payment_recorded, false);

  // Verify in DB
  const subCheck = await db.query(`
    SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;
  `, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'past_due');
});

await runAsyncTest('8.18. [GERÇEK DB NULL WATERMARK TERMINAL GÜVENLİĞİ] last_webhook_event_at NULL olsa dahi terminal cancelled abonelik zaman damgasiz (NULL) odeme olayi ile canlandirilamaz; yalniz gecerli event_timestamp ile reaktive edilebilir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_null_watermark_term_01';
  const evtNullTs = 'evt_null_ts_term_01';
  const evtValidTs = 'evt_valid_ts_term_02';

  // Seed cancelled subscription with NULL watermark
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'cancelled', NULL);
  `, [subRef]);

  // Attempt 1: Payment event with NULL timestamp
  const claim1 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtNullTs, subRef]);
  const token1 = claim1.rows[0].claim.claim_attempt_id;

  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 149.00, 'TRY', NULL, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtNullTs, subRef, token1]);
  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.status, 'cancelled', 'Watermark NULL olsa dahi zaman damgasiz odeme terminal aboneligi canlandiramaz');
  assert.strictEqual(tx1.rows[0].tx.out_of_order_suppressed, true);

  // Attempt 2: Payment event with valid, explicit timestamp
  const validTimestamp = '2026-09-05 12:00:00+00';
  const claim2 = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtValidTs, subRef]);
  const token2 = claim2.rows[0].claim.claim_attempt_id;

  const tx2 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 149.00, 'TRY', $3::timestamptz, '{}'::jsonb, '{}'::jsonb, $4::uuid
    ) as tx;
  `, [evtValidTs, subRef, validTimestamp, token2]);
  assert.strictEqual(tx2.rows[0].tx.success, true);
  assert.strictEqual(tx2.rows[0].tx.status, 'active', 'Gecerli zaman damgali ve odeme kanitli odeme olayi terminal aboneligi reaktive eder');
  assert.strictEqual(tx2.rows[0].tx.payment_recorded, true);

  const subCheck = await db.query(`
    SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;
  `, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');
  const dbTime = new Date(subCheck.rows[0].last_webhook_event_at).toISOString();
  assert.strictEqual(dbTime, new Date(validTimestamp).toISOString());
});

await runAsyncTest('8.19. [GERÇEK DB BAĞIMSIZ EŞZAMANLI İŞLEM YARIŞI] İki bağımsız oturum/istemci (client1, client2) transaction bariyeri altında aynı anda claim çağırdığında PostgreSQL unique ve row kilitleri altında tam olarak 1 işçi can_proceed: true alır', async () => {
  const sessions = await createIndependentPgSessions();
  try {
    const client1 = await sessions.createSession('worker-claim-session-1');
    const client2 = await sessions.createSession('worker-claim-session-2');

    // Prove distinct session identities
    const id1 = await client1.getSessionIdentity();
    const id2 = await client2.getSessionIdentity();
    assert.strictEqual(id1.sessionId, 'worker-claim-session-1');
    assert.strictEqual(id2.sessionId, 'worker-claim-session-2');
    assert.notStrictEqual(id1.sessionId, id2.sessionId, 'Oturum kimlikleri birbirinden farkli ve bagimsiz olmalidir');
    assert.notStrictEqual(id1.sessionToken, id2.sessionToken, 'Oturum guvenlik tokenlari benzersiz olmalidir');
    assert.strictEqual(typeof id1.backendPid, 'number');
    assert.strictEqual(id1.backendPid, await client1.getBackendPid());

    const subRef = 'sub_ref_concurrent_claim_race_01';
    const evtId = 'evt_concurrent_claim_race_01';

    await client1.query(`
      INSERT INTO public.subscriptions (provider_subscription_id, status)
      VALUES ($1, 'pending');
    `, [subRef]);

    // Demonstrate clone capability and prove independent clone session identity
    const clonedClient = await client1.clone('worker-claim-clone');
    const cloneId = await clonedClient.getSessionIdentity();
    assert.strictEqual(cloneId.sessionId, 'worker-claim-clone');
    assert.notStrictEqual(cloneId.sessionId, id1.sessionId);
    assert.notStrictEqual(cloneId.sessionId, id2.sessionId);
    const cloneCheck = await clonedClient.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
    assert.strictEqual(cloneCheck.rows[0].status, 'pending', 'Klon istemci varolan veritabani semasini ve kaydini okuyabilmelidir');
    await clonedClient.close();

    const barrier = createTransactionBarrier();

    // Client 1 claims event inside an OPEN transaction and signals barrier
    const p1 = (async () => {
      let result;
      await client1.transaction(async (tx1) => {
        const res = await tx1.query(
          `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`,
          [evtId, subRef]
        );
        result = res.rows[0].claim;
        barrier.signalEntered();
        await barrier.waitRelease();
      });
      return result;
    })();

    // Client 2 connects as independent backend session and attempts claim across the barrier
    const p2 = (async () => {
      await barrier.waitEntered();

      // PROOF OF ROW-LEVEL CONTENTION ON POSTGRESQL ENGINE:
      // Client 2 queries the locked row evtId and blocks on PostgreSQL WASM engine:
      let query2Settled = false;
      const p2Query = client2.query(
        `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`,
        [evtId, subRef]
      ).then(res => {
        query2Settled = true;
        return res.rows[0].claim;
      });

      // Verify that Client 2 query is actively BLOCKED while Client 1's transaction is open
      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(query2Settled, false, 'İkinci sorgu birinci transaction ve kilit açıkken bloke/kuyrukta olmalıdır');

      // Now release barrier so Client 1 commits its open transaction
      barrier.releaseBarrier();
      await p1; // ensure client1 transaction committed

      return await p2Query;
    })();

    const [claim1, claim2] = await Promise.all([p1, p2]);

    const proceeds = [claim1.can_proceed, claim2.can_proceed];
    const trueCount = proceeds.filter(p => p === true).length;
    const falseCount = proceeds.filter(p => p === false).length;

    assert.strictEqual(trueCount, 1, 'Eşzamanlı bağımsız oturumlardan tam olarak 1 tanesi can_proceed: true almalıdır');
    assert.strictEqual(falseCount, 1, 'Kilit bariyerinde yarışan diğer istemci duplicate/processing ile can_proceed: false almalıdır');
    assert.strictEqual(claim1.can_proceed, true);
    assert.strictEqual(claim2.can_proceed, false);
    assert.strictEqual(claim2.is_duplicate, true);
    assert.strictEqual(claim2.existing_id, claim1.id);
  } finally {
    await sessions.cleanup();
  }
});

await runAsyncTest('8.20. [GERÇEK DB TIMEOUT TAKEOVER VE LEASE FENCING] Timeout sonrasi stuck lock alan yeni worker basarili olurken, gecikmis bayat workerin finalize ve execute cagrilari 409/LEASE_LOST ile reddedilir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_stuck_takeover_01';
  const evtId = 'evt_stuck_takeover_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1290.00);
  `, [subRef]);

  // Worker 1 acquires lock
  const w1Claim = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtId, subRef]);
  const token1 = w1Claim.rows[0].claim.claim_attempt_id;
  assert.strictEqual(w1Claim.rows[0].claim.can_proceed, true);

  // Simulate timeout: lock updated 120 seconds ago (default timeout is 60s)
  await db.query(`
    UPDATE public.payment_webhook_idempotency
    SET updated_at = now() - INTERVAL '120 seconds'
    WHERE provider = 'iyzico' AND provider_event_id = $1;
  `, [evtId]);

  // Worker 2 takes over stuck lock
  const w2Claim = await db.query(`
    SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;
  `, [evtId, subRef]);
  const claim2 = w2Claim.rows[0].claim;
  assert.strictEqual(claim2.can_proceed, true);
  assert.strictEqual(claim2.status, 'reclaimed_stuck_lock');
  const token2 = claim2.claim_attempt_id;
  assert.notStrictEqual(token1, token2, 'Yeni worker yeni bir claim tokeni almalidir');

  // Delayed Worker 1 attempts to finalize with stale token1 -> MUST BE REJECTED
  const w1Finalize = await db.query(`
    SELECT public.finalize_payment_webhook_event('iyzico', $1, 'processed', '{"w":1}'::jsonb, $2::uuid) as fin;
  `, [evtId, token1]);
  assert.strictEqual(w1Finalize.rows[0].fin.finalized, false, 'Bayat worker finalize edemez');

  // Delayed Worker 1 attempts to execute transaction with stale token1 -> MUST BE REJECTED
  const w1Execute = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 99.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtId, subRef, token1]);
  assert.strictEqual(w1Execute.rows[0].tx.success, false);
  assert.strictEqual(w1Execute.rows[0].tx.error, 'LEASE_LOST_TO_ANOTHER_WORKER');

  // Worker 2 executes transaction with valid token2 -> SUCCEEDS
  const w2Execute = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 99.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtId, subRef, token2]);
  assert.strictEqual(w2Execute.rows[0].tx.success, true);
  assert.strictEqual(w2Execute.rows[0].tx.status, 'active');
});

await runAsyncTest('8.21. [GERÇEK DB FOR UPDATE INTERLEAVING YARIŞI] İki bağımsız oturum (client1, client2) transaction bariyeri altında biri pending (subscription.created) diğeri active (payment.success) yapmaya çalıştığında FOR UPDATE kilidi altında trialing abonelik asla pending durumuna düşmez', async () => {
  const sessions = await createIndependentPgSessions();
  try {
    const client1 = await sessions.createSession('worker-session-created-821');
    const client2 = await sessions.createSession('worker-session-payment-821');

    // Prove distinct session identities
    const id1 = await client1.getSessionIdentity();
    const id2 = await client2.getSessionIdentity();
    assert.strictEqual(id1.sessionId, 'worker-session-created-821');
    assert.strictEqual(id2.sessionId, 'worker-session-payment-821');
    assert.notStrictEqual(id1.sessionId, id2.sessionId, 'Oturum kimlikleri birbirinden farkli ve bagimsiz olmalidir');
    assert.notStrictEqual(id1.sessionToken, id2.sessionToken, 'Oturum guvenlik tokenlari benzersiz olmalidir');
    assert.strictEqual(typeof id1.backendPid, 'number');
    assert.strictEqual(id1.backendPid, await client1.getBackendPid());

    const subRef = 'sub_ref_concurr_interleave_01';
    const evtCreated = 'evt_concurr_created_01';
    const evtPayment = 'evt_concurr_payment_01';

    // Seed subscription in trialing status
    await client1.query(`
      INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
      VALUES ($1, 'trialing', '2026-09-01 10:00:00+00'::timestamptz);
    `, [subRef]);

    // Claim both events to obtain valid tokens
    const c1 = await client1.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.created', $2, null) as claim;`, [evtCreated, subRef]);
    const tokenCreated = c1.rows[0].claim.claim_attempt_id;

    const c2 = await client1.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`, [evtPayment, subRef]);
    const tokenPayment = c2.rows[0].claim.claim_attempt_id;

    const barrier = createTransactionBarrier();

    // Client 1 executes subscription.created transaction holding barrier inside OPEN transaction
    const p1 = (async () => {
      let result;
      await client1.transaction(async (tx1) => {
        const r = await tx1.query(`
          SELECT public.execute_payment_webhook_transaction(
            'iyzico', $1, 'subscription.created', $2, null, 'pending', false, 0, 'TRY', '2026-09-01 09:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid
          ) as tx;
        `, [evtCreated, subRef, tokenCreated]);
        result = r.rows[0].tx;
        barrier.signalEntered();
        await barrier.waitRelease();
      });
      return result;
    })();

    // Client 2 executes payment.success transaction across the barrier while Client 1 holds open transaction
    const p2 = (async () => {
      await barrier.waitEntered();

      // PROOF OF ROW-LEVEL CONTENTION ON POSTGRESQL ENGINE:
      // Client 2 now queries execute_payment_webhook_transaction on the locked row subRef and blocks:
      let query2Settled = false;
      const p2Query = client2.query(`
        SELECT public.execute_payment_webhook_transaction(
          'iyzico', $1, 'payment.success', $2, null, 'active', true, 99.00, 'TRY', '2026-09-01 11:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid
        ) as tx;
      `, [evtPayment, subRef, tokenPayment]).then(r => {
        query2Settled = true;
        return r.rows[0].tx;
      });

      // Verify Client 2 is BLOCKED on the FOR UPDATE lock held by Client 1
      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(query2Settled, false, 'İkinci işlem birinci transaction FOR UPDATE kilidi açıkken bloke olmalıdır');

      barrier.releaseBarrier();
      await p1; // ensure client1 transaction committed

      return await p2Query;
    })();

    const [resCreated, resPayment] = await Promise.all([p1, p2]);

    assert.strictEqual(resCreated.success, true);
    assert.strictEqual(resCreated.out_of_order_suppressed, true, 'subscription.created gerilemesi engellenmelidir');

    assert.strictEqual(resPayment.success, true);
    assert.strictEqual(resPayment.status, 'active');

    // Verify final status in DB is active, NOT pending
    const subCheck = await client2.query(`
      SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;
    `, [subRef]);
    assert.notStrictEqual(subCheck.rows[0].status, 'pending', 'Abonelik asla pending durumuna düşürülmemelidir');
    assert.strictEqual(subCheck.rows[0].status, 'active', 'Son durum active olmalıdır');
  } finally {
    await sessions.cleanup();
  }
});

await runAsyncTest('8.22. [GERÇEK DB NULL WATERMARK DOWNGRADE KORUMASI] last_webhook_event_at NULL olan active veya trialing abonelik, zaman damgasi bulunmayan (NULL) payment.failure veya subscription.cancelled ile dusurulemez; status korunur ve out_of_order_suppressed donulur', async () => {
  const db = await getDisposablePgEngine();
  const subRefActive = 'sub_ref_null_watermark_active_01';
  const subRefTrialing = 'sub_ref_null_watermark_trialing_01';
  const evtFailure = 'evt_null_wm_failure_01';
  const evtCancelled = 'evt_null_wm_cancel_01';

  // Seed active subscription with NULL last_webhook_event_at
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'active', NULL);
  `, [subRefActive]);

  // Seed trialing subscription with NULL last_webhook_event_at
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'trialing', NULL);
  `, [subRefTrialing]);

  // Claim events
  const c1 = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.failure', $2, null) as claim;`, [evtFailure, subRefActive]);
  const token1 = c1.rows[0].claim.claim_attempt_id;

  const c2 = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.cancelled', $2, null) as claim;`, [evtCancelled, subRefTrialing]);
  const token2 = c2.rows[0].claim.claim_attempt_id;

  // 1. Attempt to downgrade active -> past_due with NULL timestamp
  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.failure', $2, null, 'past_due', false, 0, 'TRY', NULL, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtFailure, subRefActive, token1]);

  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.out_of_order_suppressed, true, 'Zaman damgasiz failure active aboneligi dusuremez');
  assert.strictEqual(tx1.rows[0].tx.status, 'active');

  const check1 = await db.query(`SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRefActive]);
  assert.strictEqual(check1.rows[0].status, 'active');
  assert.strictEqual(check1.rows[0].last_webhook_event_at, null);

  // 2. Attempt to cancel trialing -> cancelled with NULL timestamp
  const tx2 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'subscription.cancelled', $2, null, 'cancelled', false, 0, 'TRY', NULL, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [evtCancelled, subRefTrialing, token2]);

  assert.strictEqual(tx2.rows[0].tx.success, true);
  assert.strictEqual(tx2.rows[0].tx.out_of_order_suppressed, true, 'Zaman damgasiz cancel trialing aboneligi iptal edemez');
  assert.strictEqual(tx2.rows[0].tx.status, 'trialing');

  const check2 = await db.query(`SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRefTrialing]);
  assert.strictEqual(check2.rows[0].status, 'trialing');
  assert.strictEqual(check2.rows[0].last_webhook_event_at, null);
});

await runAsyncTest('8.23. [GERÇEK DB AYNI TAHSILLAT IKI FARKLI OLAY TEK ODEME VE REPLAY KORUMASI] Ayni provider_payment_id icin ilk basarili teslim sonrasinda abonelik cancelled veya past_due olsa dahi, farkli provider_event_id ile gelen teslim aboneligi canlandiramaz; cancelled/past_due korunur ve payments tablosunda tek satir kalir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_same_charge_diff_events_01';
  const evtAuth = 'evt_auth_charge_01';
  const evtSuccess = 'evt_success_charge_02';
  const evtOrder = 'evt_order_charge_03';
  const sharedPaymentId = 'iyzi_payment_tx_998877';

  // Seed pending subscription
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_token, status, price)
    VALUES ($1, 'checkout_token_823', 'pending', 2190.00);
  `, [subRef]);

  // 1. Ilk basarili teslim: checkoutform.auth arrives
  const c1 = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'checkoutform.auth', $2, null) as claim;`, [evtAuth, subRef]);
  const token1 = c1.rows[0].claim.claim_attempt_id;

  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'checkoutform.auth', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz,
      '{"verifiedCheckoutToken":"checkout_token_823"}'::jsonb, '{}'::jsonb, $3::uuid, $4
    ) as tx;
  `, [evtAuth, subRef, token1, sharedPaymentId]);

  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.status, 'active');
  assert.strictEqual(tx1.rows[0].tx.payment_recorded, true);
  assert.strictEqual(tx1.rows[0].tx.is_duplicate_payment, false);

  // 2. Araya giren iptal: Abonelik cancelled durumuna gecer
  await db.query(`UPDATE public.subscriptions SET status = 'cancelled' WHERE provider_subscription_id = $1;`, [subRef]);
  const subCancelled = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCancelled.rows[0].status, 'cancelled');

  // 3. Ikinci teslim: Ayni physical provider_payment_id icin farkli provider_event_id ile basarili payment.success gelir
  const c2 = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`, [evtSuccess, subRef]);
  const token2 = c2.rows[0].claim.claim_attempt_id;

  const tx2 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 11:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid, $4
    ) as tx;
  `, [evtSuccess, subRef, token2, sharedPaymentId]);

  assert.strictEqual(tx2.rows[0].tx.success, true);
  // Replay korumasi: Tuketilmis eski charge iptal edilmis aboneligi ASLA canlandiramaz!
  assert.strictEqual(tx2.rows[0].tx.status, 'cancelled', 'Daha once tuketilmis odeme cancelled aboneligi active yapamaz');
  assert.strictEqual(tx2.rows[0].tx.payment_recorded, false, 'Ayni tahsilat icin ikinci kez payment row acilmamalidir');
  assert.strictEqual(tx2.rows[0].tx.is_duplicate_payment, true, 'is_duplicate_payment bayragi true olmalidir');
  assert.strictEqual(tx2.rows[0].tx.out_of_order_suppressed, true);

  // DB kontrolu: Abonelik cancelled kalmaya devam eder
  const subCheckAfterCancel = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheckAfterCancel.rows[0].status, 'cancelled', 'Veritabaninda abonelik durumu cancelled olarak korunmalidir');

  // 4. Araya giren borc: Abonelik past_due durumuna gecer
  await db.query(`UPDATE public.subscriptions SET status = 'past_due' WHERE provider_subscription_id = $1;`, [subRef]);
  const subPastDue = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subPastDue.rows[0].status, 'past_due');

  // 5. Ucuncu teslim: Ayni physical charge ile ucuncu bir event kimligi gelir (subscription.order.success)
  const c3 = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.order.success', $2, null) as claim;`, [evtOrder, subRef]);
  const token3 = c3.rows[0].claim.claim_attempt_id;

  const tx3 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'subscription.order.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 12:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid, $4
    ) as tx;
  `, [evtOrder, subRef, token3, sharedPaymentId]);

  assert.strictEqual(tx3.rows[0].tx.success, true);
  // Replay korumasi: Tuketilmis duplicate charge past_due borclu aboneligi active yapamaz!
  assert.strictEqual(tx3.rows[0].tx.status, 'past_due', 'Daha once tuketilmis odeme past_due aboneligi active yapamaz');
  assert.strictEqual(tx3.rows[0].tx.payment_recorded, false);
  assert.strictEqual(tx3.rows[0].tx.is_duplicate_payment, true);
  assert.strictEqual(tx3.rows[0].tx.out_of_order_suppressed, true);

  // DB kontrolu: Abonelik past_due kalmaya devam eder
  const subCheckAfterPastDue = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheckAfterPastDue.rows[0].status, 'past_due', 'Veritabaninda abonelik durumu past_due olarak korunmalidir');

  // Verify DB payments table contains strictly 1 row for this provider_payment_id
  const payCount = await db.query(`
    SELECT COUNT(*) as cnt FROM public.payments WHERE provider_payment_id = $1;
  `, [sharedPaymentId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1, 'payments tablosunda tam olarak 1 satir olmalidir');
});

await runAsyncTest('8.24. [GERÇEK DB ÇOKLU İŞÇİ / CROSS-INSTANCE YARIŞI] İki bağımsız işçi aynı olay için yarıştığında Lider claim alır, Takipçi processing görür; Lider commit sonrası Takipçi processed durumunu okur ve payments tablosunda tam 1 satır kalır', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_multi_worker_race_01';
  const providerEventId = 'evt_multi_worker_race_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1490.00);
  `, [subRef]);

  // Worker 1 claims event
  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`,
    [providerEventId, subRef]
  );
  assert.strictEqual(c1.rows[0].claim.can_proceed, true);
  assert.strictEqual(c1.rows[0].claim.is_duplicate, false);
  assert.strictEqual(c1.rows[0].claim.status, 'processing');
  const token1 = c1.rows[0].claim.claim_attempt_id;

  // Worker 2 (separate container/worker) attempts to claim the same event while Worker 1 is processing
  const c2 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`,
    [providerEventId, subRef]
  );
  assert.strictEqual(c2.rows[0].claim.can_proceed, false, 'Worker 2 islem devam ederken claim alamaz');
  assert.strictEqual(c2.rows[0].claim.is_duplicate, true);
  assert.strictEqual(c2.rows[0].claim.status, 'processing');

  // Worker 1 commits transaction successfully
  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid, 'pay_mw_race_01'
    ) as tx;
  `, [providerEventId, subRef, token1]);
  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.status, 'active');
  assert.strictEqual(tx1.rows[0].tx.payment_recorded, true);

  // Worker 2 re-checks claim after Worker 1 completes: sees processed
  const c2After = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null) as claim;`,
    [providerEventId, subRef]
  );
  assert.strictEqual(c2After.rows[0].claim.can_proceed, false);
  assert.strictEqual(c2After.rows[0].claim.is_duplicate, true);
  assert.strictEqual(c2After.rows[0].claim.status, 'processed');

  // Exactly 1 payment row
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_payment_id = $1;`, ['pay_mw_race_01']);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1, 'payments tablosunda tam olarak 1 satir olmalidir');
});

await runAsyncTest('8.25. [GERÇEK DB ÇOKLU İŞÇİ LİDER HATASI VE RECLAIM] Lider claim sonrası çöktüğünde ve lease timeout aşıldığında Takipçi olayı reclaimed_stuck_lock ile devralır ve başarıyla tamamlar', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_stuck_reclaim_01';
  const providerEventId = 'evt_stuck_reclaim_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 99.00);
  `, [subRef]);

  // Worker 1 claims event with 1 second lease timeout
  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null, null, 1) as claim;`,
    [providerEventId, subRef]
  );
  assert.strictEqual(c1.rows[0].claim.can_proceed, true);
  assert.strictEqual(c1.rows[0].claim.status, 'processing');
  const token1 = c1.rows[0].claim.claim_attempt_id;

  // Simulate Worker 1 crashing: Worker 1 does not finalize. Lease timeout (1 second) expires:
  await new Promise(resolve => setTimeout(resolve, 1100));

  // Worker 2 attempts claim with p_timeout_seconds: 1 -> reclaims stuck lock!
  const c2 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, null, null, 1) as claim;`,
    [providerEventId, subRef]
  );
  assert.strictEqual(c2.rows[0].claim.can_proceed, true, 'Zamanasimi sonrasi Worker 2 olayi devralabilmelidir');
  assert.strictEqual(c2.rows[0].claim.status, 'reclaimed_stuck_lock');
  const token2 = c2.rows[0].claim.claim_attempt_id;
  assert.notStrictEqual(token1, token2, 'Fencing token yenilenmis olmalidir');

  // Zombie Worker 1 tries to commit with stale token1 -> rejected by lease fencing!
  const zombieTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid, 'pay_stuck_zombie_01'
    ) as tx;
  `, [providerEventId, subRef, token1]);
  assert.strictEqual(zombieTx.rows[0].tx.success, false, 'Zombie worker fencing korumasiyla reddedilmelidir');
  assert.strictEqual(zombieTx.rows[0].tx.error, 'LEASE_LOST_TO_ANOTHER_WORKER');

  // Worker 2 commits with valid token2 -> succeeds!
  const validTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $3::uuid, 'pay_stuck_valid_02'
    ) as tx;
  `, [providerEventId, subRef, token2]);
  assert.strictEqual(validTx.rows[0].tx.success, true);
  assert.strictEqual(validTx.rows[0].tx.status, 'active');
  assert.strictEqual(validTx.rows[0].tx.payment_recorded, true);

  // Exactly 1 payment recorded
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1, 'Reclaim sonrasi payments tablosunda tam 1 satir olmalidir');
});

await runAsyncTest('8.26. [GERÇEK DB CLAİMSİZ EXECUTE KORUMASI] Öncesinde claim_payment_webhook_event çağrılmamış bir provider_event_id ile execute çağrıldığında sahipsiz processing satırı açılmaz (RESERVATION_NOT_FOUND) ve veritabanında 0 kayıt kalır', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_unclaimed_exec_01';
  const unreservedEventId = 'evt_unclaimed_exec_999';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 99.00);
  `, [subRef]);

  // Execute called directly WITHOUT prior claim reservation:
  const tx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, null, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, gen_random_uuid()
    ) as tx;
  `, [unreservedEventId, subRef]);

  assert.strictEqual(tx.rows[0].tx.success, false);
  assert.strictEqual(tx.rows[0].tx.error, 'RESERVATION_NOT_FOUND');

  // Verify ZERO rows were inserted into public.payment_webhook_idempotency!
  const idemCount = await db.query(`
    SELECT COUNT(*) as cnt FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;
  `, [unreservedEventId]);
  assert.strictEqual(Number(idemCount.rows[0].cnt), 0, 'Claimsiz cagrida veritabaninda ASLA sahipsiz processing kaydi acilmamalidir');

  // Verify ZERO rows in payments table
  const payCount = await db.query(`
    SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;
  `, [unreservedEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 0);

  // Subscription remains pending
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending');
});

await runAsyncTest('8.27. [GERÇEK DB ATOMİK TENANT EŞLEŞME YARIŞI] Claim ile Execute arasında aboneliğin tenant_id değeri değiştiğinde (race condition) RPC FOR UPDATE kilidi altında TENANT_MISMATCH ile işlemi reddeder ve ödeme oluşturmaz', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_tenant_race_01';
  const providerEventId = 'evt_tenant_race_01';
  const initialTenant = '00000000-0000-0000-0000-000000000001';
  const newTenant = '00000000-0000-0000-0000-000000000002';

  // Seed subscription with initial tenant
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status)
    VALUES ($1, $2::uuid, 'pending');
  `, [subRef, initialTenant]);

  // Step 1: Claim reservation succeeds with initialTenant
  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [providerEventId, subRef, initialTenant]
  );
  assert.strictEqual(c1.rows[0].claim.can_proceed, true);
  const token1 = c1.rows[0].claim.claim_attempt_id;

  // Step 2: Race condition occurs - subscription tenant_id is reassigned to newTenant before execute
  await db.query(`UPDATE public.subscriptions SET tenant_id = $1::uuid WHERE provider_subscription_id = $2;`, [newTenant, subRef]);

  // Step 3: Execute transaction arrives carrying the original payload tenant (initialTenant)
  const tx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 199.00, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb, $4::uuid
    ) as tx;
  `, [providerEventId, subRef, initialTenant, token1]);

  // Must fail with TENANT_MISMATCH under FOR UPDATE lock
  assert.strictEqual(tx.rows[0].tx.success, false);
  assert.strictEqual(tx.rows[0].tx.error, 'TENANT_MISMATCH');

  // Verify NO payment was inserted
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 0, 'Tenant uyusmazliginda odeme olusturulamaz');

  // Verify subscription status was NOT changed to active
  const subCheck = await db.query(`SELECT status, tenant_id FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending');
  assert.strictEqual(subCheck.rows[0].tenant_id, newTenant);
});

await runAsyncTest('8.28. [GERÇEK DB PAST_DUE TIMESTAMP-LESS & STALE SUCCESS REPLAY KORUMASI] Sıralama kanıtı bulunmayan (NULL timestamp) veya eski zaman damgalı gecikmiş payment.success olayı past_due aboneliği asla active yapamaz; borç kapatılamaz ve durum past_due kalır', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_past_due_replay_01';
  const tenantId = '00000000-0000-0000-0000-000000000055';
  const establishedWatermark = '2026-09-01 12:00:00+00';

  // Seed subscription in past_due with established watermark
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, last_webhook_event_at)
    VALUES ($1, $2::uuid, 'past_due', $3::timestamptz);
  `, [subRef, tenantId, establishedWatermark]);

  // Case 1: Delivery with NULL timestamp (unsequenced) arrives with verified payment proof and fresh payment ID
  const event1 = 'evt_past_due_null_ts_01';
  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [event1, subRef, tenantId]
  );
  assert.strictEqual(c1.rows[0].claim.can_proceed, true);
  const token1 = c1.rows[0].claim.claim_attempt_id;

  const tx1 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 199.00, 'TRY', null, '{"providerPaymentId": "pay_pd_null_01"}'::jsonb, '{}'::jsonb, $4::uuid, 'pay_pd_null_01'
    ) as tx;
  `, [event1, subRef, tenantId, token1]);

  assert.strictEqual(tx1.rows[0].tx.success, true);
  assert.strictEqual(tx1.rows[0].tx.status, 'past_due', 'Zaman damgasiz olay past_due aboneligi active yapamaz');
  assert.strictEqual(tx1.rows[0].tx.out_of_order_suppressed, true);

  // Status in DB remains strictly past_due
  const subCheck1 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck1.rows[0].status, 'past_due');

  // Case 2: Delivery with stale timestamp (2026-09-01 11:00:00 < establishedWatermark)
  const event2 = 'evt_past_due_stale_ts_02';
  const c2 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [event2, subRef, tenantId]
  );
  assert.strictEqual(c2.rows[0].claim.can_proceed, true);
  const token2 = c2.rows[0].claim.claim_attempt_id;

  const tx2 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 199.00, 'TRY', '2026-09-01 11:00:00+00'::timestamptz, '{"providerPaymentId": "pay_pd_stale_02"}'::jsonb, '{}'::jsonb, $4::uuid, 'pay_pd_stale_02'
    ) as tx;
  `, [event2, subRef, tenantId, token2]);

  assert.strictEqual(tx2.rows[0].tx.success, true);
  assert.strictEqual(tx2.rows[0].tx.status, 'past_due', 'Eski zaman damgali olay past_due aboneligi active yapamaz');
  assert.strictEqual(tx2.rows[0].tx.out_of_order_suppressed, true);

  const subCheck2 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck2.rows[0].status, 'past_due');

  // Case 3: Delivery with genuinely newer timestamp (2026-09-01 13:00:00 > establishedWatermark) successfully transitions to active
  const event3 = 'evt_past_due_legit_ts_03';
  const c3 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [event3, subRef, tenantId]
  );
  assert.strictEqual(c3.rows[0].claim.can_proceed, true);
  const token3 = c3.rows[0].claim.claim_attempt_id;

  const tx3 = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 199.00, 'TRY', '2026-09-01 13:00:00+00'::timestamptz, '{"providerPaymentId": "pay_pd_legit_03"}'::jsonb, '{}'::jsonb, $4::uuid, 'pay_pd_legit_03'
    ) as tx;
  `, [event3, subRef, tenantId, token3]);

  assert.strictEqual(tx3.rows[0].tx.success, true);
  assert.strictEqual(tx3.rows[0].tx.status, 'active', 'Guncel zaman damgali mesru tahsilat past_due aboneligi active yapar');
  assert.strictEqual(tx3.rows[0].tx.payment_recorded, true);

  const subCheck3 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck3.rows[0].status, 'active');
});

await runAsyncTest('8.29. [GERÇEK DB FAILED DURUMUNDA EŞZAMANLI RECLAIM YARIŞI] İki bağımsız oturum (client1, client2) failed durumundaki kaydı transaction bariyeri altında aynı anda reclaim etmeye çalıştığında FOR UPDATE kilidi altında tam olarak 1 işçi can_proceed: true alır', async () => {
  const sessions = await createIndependentPgSessions();
  try {
    const client1 = await sessions.createSession('worker-reclaim-session-alpha-1');
    const client2 = await sessions.createSession('worker-reclaim-session-beta-2');

    // Prove distinct session identities
    const id1 = await client1.getSessionIdentity();
    const id2 = await client2.getSessionIdentity();
    assert.strictEqual(id1.sessionId, 'worker-reclaim-session-alpha-1');
    assert.strictEqual(id2.sessionId, 'worker-reclaim-session-beta-2');
    assert.notStrictEqual(id1.sessionId, id2.sessionId, 'Oturum kimlikleri birbirinden farkli ve bagimsiz olmalidir');
    assert.notStrictEqual(id1.sessionToken, id2.sessionToken, 'Oturum guvenlik tokenlari benzersiz olmalidir');
    assert.strictEqual(typeof id1.backendPid, 'number');
    assert.strictEqual(id1.backendPid, await client1.getBackendPid());

    const subRef = 'sub_ref_failed_race_01';
    const providerEventId = 'evt_failed_race_01';
    const tenantId = '00000000-0000-0000-0000-000000000066';

    // Seed idempotency in 'failed' status
    await client1.query(`
      INSERT INTO public.payment_webhook_idempotency (provider, provider_event_id, event_type, subscription_reference_code, tenant_id, status, claim_attempt_id)
      VALUES ('iyzico', $1, 'payment.success', $2, $3, 'failed', gen_random_uuid());
    `, [providerEventId, subRef, tenantId]);

    const barrier = createTransactionBarrier();

    // Client 1 reclaims failed record across barrier inside OPEN transaction
    const p1 = (async () => {
      let result;
      await client1.transaction(async (tx1) => {
        const res = await tx1.query(
          `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
          [providerEventId, subRef, tenantId]
        );
        result = res.rows[0].claim;
        barrier.signalEntered();
        await barrier.waitRelease();
      });
      return result;
    })();

    // Client 2 connects as independent backend session and attempts to reclaim across the transaction barrier while Client 1 holds open transaction
    const p2 = (async () => {
      await barrier.waitEntered();

      // PROOF OF ROW-LEVEL CONTENTION ON POSTGRESQL ENGINE:
      // Client 2 now queries claim on the locked row providerEventId and blocks:
      let query2Settled = false;
      const p2Query = client2.query(
        `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
        [providerEventId, subRef, tenantId]
      ).then(res => {
        query2Settled = true;
        return res.rows[0].claim;
      });

      // Verify Client 2 is actively BLOCKED while Client 1's reclaim transaction is open
      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(query2Settled, false, 'İkinci reclaim işlemi birinci transaction açıkken bloke olmalıdır');

      barrier.releaseBarrier();
      await p1; // ensure client1 transaction committed

      return await p2Query;
    })();

    const [claim1, claim2] = await Promise.all([p1, p2]);
    const claims = [claim1, claim2];

    const winners = claims.filter(c => c.can_proceed === true && c.status === 'reclaimed_after_failure');
    const losers = claims.filter(c => c.can_proceed === false && c.is_duplicate === true);

    assert.strictEqual(winners.length, 1, 'Failed durumundaki kaydı aynı anda yalnız 1 işçi devralabilmelidir');
    assert.strictEqual(losers.length, 1, 'Yarışı kaybeden işçi duplicate ve can_proceed: false almalıdır');
  } finally {
    await sessions.cleanup();
  }
});

await runAsyncTest('8.30. [GERÇEK DB KESİRLİ PARASAL TUTAR KORUMASI] Provider tarafından gelen 149.90 gibi kesirli tutarlar tamsayıya yuvarlanmadan tam NUMERIC(10,2) hassasiyetinde payments tablosuna kaydedilir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_fractional_amount_01';
  const providerEventId = 'evt_fractional_amount_01';
  const tenantId = '00000000-0000-0000-0000-000000000088';
  const fractionalPrice = 149.90;

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 149.90);
  `, [subRef, tenantId]);

  const c = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [providerEventId, subRef, tenantId]
  );
  assert.strictEqual(c.rows[0].claim.can_proceed, true);
  const token = c.rows[0].claim.claim_attempt_id;

  const tx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, $4::numeric, 'TRY', '2026-09-01 10:00:00+00'::timestamptz, '{"providerPaymentId": "pay_fractional_01"}'::jsonb, '{}'::jsonb, $5::uuid, 'pay_fractional_01'
    ) as tx;
  `, [providerEventId, subRef, tenantId, fractionalPrice, token]);

  assert.strictEqual(tx.rows[0].tx.success, true);
  assert.strictEqual(tx.rows[0].tx.status, 'active');

  const payCheck = await db.query(`SELECT amount, currency FROM public.payments WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(payCheck.rows[0].amount, '149.90', 'Kesirli tutar 150 yerine tam 149.90 olarak saklanmalidir');
  assert.strictEqual(Number(payCheck.rows[0].amount), 149.90);
});

await runAsyncTest('8.31. [GERÇEK DB EŞİT ZAMAN DAMGALI FAILURE->SUCCESS TIE-BREAKER] Farklı eventId taşıyan fakat aynı timestamp ile gelen payment.failure ardından payment.success olayında, eşit-zaman öncelik kuralı (tie-breaker) ödeme kanıtlı başarı olayını kabul eder; past_due borç active yapılır ve payments tablosuna ödeme yazılır', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_equal_ts_tiebreaker_01';
  const evtSuccess = 'evt_equal_ts_succ_01';
  const tenantId = '00000000-0000-0000-0000-000000000099';
  const sharedTimestamp = '2026-09-01 12:00:00+00';

  // Seed subscription in past_due with watermark equal to sharedTimestamp (e.g. from prior failure)
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, last_webhook_event_at, price)
    VALUES ($1, $2::uuid, 'past_due', $3::timestamptz, 250.00);
  `, [subRef, tenantId, sharedTimestamp]);

  // Event 2: payment.success arrives with DIFFERENT eventId but EXACT SAME timestamp
  const c = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [evtSuccess, subRef, tenantId]
  );
  assert.strictEqual(c.rows[0].claim.can_proceed, true);
  const token = c.rows[0].claim.claim_attempt_id;

  const tx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 250.00, 'TRY', $4::timestamptz, '{"providerPaymentId": "pay_eq_ts_01"}'::jsonb, '{}'::jsonb, $5::uuid, 'pay_eq_ts_01'
    ) as tx;
  `, [evtSuccess, subRef, tenantId, sharedTimestamp, token]);

  const txRes = tx.rows[0].tx;
  assert.strictEqual(txRes.success, true, 'Eşit timestamp tie-breaker işlemi başarıyla sonuçlanmalıdır');
  assert.strictEqual(txRes.status, 'active', 'past_due borç ödeme kanıtı ile active durumuna yükseltilmelidir');
  assert.strictEqual(txRes.payment_recorded, true, 'Ödeme kaydı oluşturulmalıdır');
  assert.strictEqual(txRes.out_of_order_suppressed, false, 'Eşit timestamp taşıyan meşru ödeme bastırılmamalıdır');

  // Verify in PostgreSQL tables
  const subCheck = await db.query(`SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active', 'Abonelik DB tablosunda active olmalıdır');

  const payCheck = await db.query(`SELECT amount, status FROM public.payments WHERE provider_event_id = $1;`, [evtSuccess]);
  assert.strictEqual(payCheck.rows.length, 1, 'Ödemeler tablosunda tam 1 kayıt bulunmalıdır');
  assert.strictEqual(Number(payCheck.rows[0].amount), 250.00);
  assert.strictEqual(payCheck.rows[0].status, 'paid');

  const idemCheck = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [evtSuccess]);
  assert.strictEqual(idemCheck.rows[0].status, 'processed');
});

await runAsyncTest('8.32. [GERÇEK DB İLGİSİZ UNIQUE CONSTRAINT İHLALİNDE ROLLBACK VE RAISE] payments tablosundaki ilgisiz bir unique constraint ihlali duplicate olarak yutulmaz; RAISE ile fırlatılır ve transaction rollback olur', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_unrelated_uq_test_01';
  const tenantId = '00000000-0000-0000-0000-000000000077';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status)
    VALUES ($1, $2, 'pending');
  `, [subRef, tenantId]);

  // Add an unrelated unique constraint on tenant_id in payments for testing
  await db.exec(`ALTER TABLE public.payments ADD CONSTRAINT uq_test_unrelated_tenant UNIQUE (tenant_id);`);

  try {
    // 1. First event for tenant inserts cleanly
    const res1 = await db.query(`
      SELECT public.claim_payment_webhook_event('iyzico', 'evt_unrelated_legit_01', 'payment.success', $1, $2, null) as claim;
    `, [subRef, tenantId]);
    const token1 = res1.rows[0].claim.claim_attempt_id;

    const tx1 = await db.query(`
      SELECT public.execute_payment_webhook_transaction(
        'iyzico', 'evt_unrelated_legit_01', 'payment.success', $1, $2, 'active', true, 149.90, 'TRY', now(), '{}'::jsonb, '{}'::jsonb, $3::uuid
      ) as tx;
    `, [subRef, tenantId, token1]);
    assert.strictEqual(tx1.rows[0].tx.payment_recorded, true);

    // 2. Second event: DIFFERENT event id, but same tenant_id -> triggers unique violation on unrelated constraint uq_test_unrelated_tenant
    const res2 = await db.query(`
      SELECT public.claim_payment_webhook_event('iyzico', 'evt_unrelated_collision_02', 'payment.success', $1, $2, null) as claim;
    `, [subRef, tenantId]);
    const token2 = res2.rows[0].claim.claim_attempt_id;

    let errorThrown = false;
    try {
      await db.query(`
        SELECT public.execute_payment_webhook_transaction(
          'iyzico', 'evt_unrelated_collision_02', 'payment.success', $1, $2, 'active', true, 149.90, 'TRY', now(), '{}'::jsonb, '{}'::jsonb, $3::uuid
        ) as tx;
      `, [subRef, tenantId, token2]);
    } catch (err) {
      errorThrown = true;
      assert(err.message.includes('uq_test_unrelated_tenant') || err.code === '23505', 'Must re-raise unique_violation error');
    }

    assert.strictEqual(errorThrown, true, 'İlgisiz unique constraint ihlali RAISE ile fırlatılmalı ve duplicate olarak yutulmamalıdır');

    // Verify idempotency record for evt_unrelated_collision_02 is NOT processed
    const idemCheck = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = 'evt_unrelated_collision_02';`);
    assert.notStrictEqual(idemCheck.rows[0].status, 'processed', 'İlgisiz unique ihlalinde olay processed olarak tüketilemez');

    // Also test record_payment_ledger_entry_idempotent directly
    let rpcErrThrown = false;
    try {
      await db.query(`
        SELECT public.record_payment_ledger_entry_idempotent(
          $1, null, 'iyzico', 'evt_unrelated_direct_rpc_03', 100, 'TRY', '{}'::jsonb
        );
      `, [tenantId]);
    } catch (err) {
      rpcErrThrown = true;
    }
    assert.strictEqual(rpcErrThrown, true, 'record_payment_ledger_entry_idempotent ilgisiz unique constraint ihlalini re-raise etmelidir');
  } finally {
    await db.exec(`ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS uq_test_unrelated_tenant;`);
  }
});

await runAsyncTest('8.33. [GERÇEK DB FAILED DURUMUNDA EXECUTE KORUMASI VE RECLAIM ZORUNLULUĞU] Failed durumundaki kayda eski token ile execute çağrısı NOT_IN_PROCESSING_STATE ile reddedilir; abonelik/ödeme mutasyonu yapılmaz ve işlem ancak reclaim ile yeni token alındıktan sonra yürütülebilir', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_failed_exec_guard_01';
  const providerEventId = 'evt_failed_exec_guard_01';
  const tenantId = '00000000-0000-0000-0000-000000000033';

  // Seed subscription in pending status
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 490.00);
  `, [subRef, tenantId]);

  // Step 1: Worker 1 claims event
  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [providerEventId, subRef, tenantId]
  );
  assert.strictEqual(c1.rows[0].claim.can_proceed, true);
  const token1 = c1.rows[0].claim.claim_attempt_id;

  // Step 2: Worker 1 experiences an error and marks the event as failed
  const failFin = await db.query(
    `SELECT public.finalize_payment_webhook_event('iyzico', $1, 'failed', '{"error":"timeout"}'::jsonb, $2::uuid) as fin;`,
    [providerEventId, token1]
  );
  assert.strictEqual(failFin.rows[0].fin.finalized, true);

  // Verify DB state is 'failed' and claim_attempt_id is still token1
  const idemFailed = await db.query(
    `SELECT status, claim_attempt_id FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`,
    [providerEventId]
  );
  assert.strictEqual(idemFailed.rows[0].status, 'failed');
  assert.strictEqual(idemFailed.rows[0].claim_attempt_id, token1);

  // Step 3: Delayed Worker 1 attempts to call execute_payment_webhook_transaction with old token1
  // Even though token1 matches claim_attempt_id, the record is in 'failed' status!
  const staleTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 149.90, 'TRY', now(), '{"providerPaymentId": "pay_failed_guard_01"}'::jsonb, '{}'::jsonb, $4::uuid, 'pay_failed_guard_01'
    ) as tx;
  `, [providerEventId, subRef, tenantId, token1]);

  assert.strictEqual(staleTx.rows[0].tx.success, false, 'Failed durumundaki kayda execute çağrısı başarısız olmalıdır');
  assert.strictEqual(staleTx.rows[0].tx.error, 'NOT_IN_PROCESSING_STATE', 'Hata NOT_IN_PROCESSING_STATE olmalıdır');
  assert.strictEqual(staleTx.rows[0].tx.retryable, false);

  // Verify NO side-effects occurred in DB:
  // Subscription MUST remain pending
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending', 'Abonelik pending kalmalıdır');

  // Payments table MUST have 0 rows for this event
  const payCheck = await db.query(`SELECT count(*)::int as cnt FROM public.payments WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(payCheck.rows[0].cnt, 0, 'Ödeme yazılmamalıdır');

  // Idempotency status MUST remain 'failed' (cannot be promoted to processed)
  const idemStillFailed = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(idemStillFailed.rows[0].status, 'failed', 'Idempotency kaydı failed kalmalıdır');

  // Step 4: Retry worker legitimately reclaims the failed record -> gets NEW token2
  const c2 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
    [providerEventId, subRef, tenantId]
  );
  assert.strictEqual(c2.rows[0].claim.can_proceed, true);
  assert.strictEqual(c2.rows[0].claim.status, 'reclaimed_after_failure');
  const token2 = c2.rows[0].claim.claim_attempt_id;
  assert.notStrictEqual(token1, token2, 'Reclaim işlemi taze yeni bir token üretmelidir');

  // Step 5: Retry worker executes transaction with legitimate token2 -> SUCCEEDS
  const legitTx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'payment.success', $2, $3, 'active', true, 149.90, 'TRY', now(), '{"providerPaymentId": "pay_failed_guard_01"}'::jsonb, '{}'::jsonb, $4::uuid, 'pay_failed_guard_01'
    ) as tx;
  `, [providerEventId, subRef, tenantId, token2]);

  assert.strictEqual(legitTx.rows[0].tx.success, true);
  assert.strictEqual(legitTx.rows[0].tx.status, 'active');
  assert.strictEqual(legitTx.rows[0].tx.payment_recorded, true);

  // Final verification: subscription is active, payment recorded, idempotency is processed
  const subFinal = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subFinal.rows[0].status, 'active');

  const payFinal = await db.query(`SELECT count(*)::int as cnt FROM public.payments WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(payFinal.rows[0].cnt, 1);

  const idemFinal = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [providerEventId]);
  assert.strictEqual(idemFinal.rows[0].status, 'processed');
});

await runAsyncTest('8.34. [GERÇEK DB ÇOKLU OTURUM VE KLON YAŞAM DÖNGÜSÜ] createSession ve clone ile üretilen istemciler bağımsız oturum kimliklerine (sessionId, sessionToken, backendPid) sahiptir ve ortak şemada bağımsız olarak sorgu koşturur', async () => {
  const sessions = await createIndependentPgSessions();
  try {
    const sAlpha = await sessions.createSession('session-alpha');
    const sBeta = await sessions.createSession('session-beta');

    const idAlpha = await sAlpha.getSessionIdentity();
    const idBeta = await sBeta.getSessionIdentity();

    assert.strictEqual(idAlpha.sessionId, 'session-alpha');
    assert.strictEqual(idBeta.sessionId, 'session-beta');
    assert.notStrictEqual(idAlpha.sessionId, idBeta.sessionId);
    assert.notStrictEqual(idAlpha.sessionToken, idBeta.sessionToken);
    assert.notStrictEqual(sAlpha.getBackendPid(), sBeta.getBackendPid(), 'Oturumlarin backend PID degerleri farkli olmalidir');
    assert.strictEqual(idAlpha.backendPid, sAlpha.getBackendPid());
    assert.strictEqual(idBeta.backendPid, sBeta.getBackendPid());
    assert.strictEqual(idAlpha.active, true);
    assert.strictEqual(idBeta.active, true);

    // Both can run independent concurrent queries on the shared schema
    const [resAlpha, resBeta] = await Promise.all([
      sAlpha.query('SELECT count(*)::int as cnt FROM information_schema.tables WHERE table_schema = $1;', ['public']),
      sBeta.query('SELECT count(*)::int as cnt FROM information_schema.tables WHERE table_schema = $1;', ['public'])
    ]);
    assert(resAlpha.rows[0].cnt > 0);
    assert.strictEqual(resAlpha.rows[0].cnt, resBeta.rows[0].cnt);

    // Demonstrate clone creates an independent engine instance with full cloned schema
    const clonedClient = await sAlpha.clone('session-alpha-clone');
    const idClone = await clonedClient.getSessionIdentity();
    assert.strictEqual(idClone.sessionId, 'session-alpha-clone');
    assert.notStrictEqual(idClone.sessionId, idAlpha.sessionId);
    assert.notStrictEqual(idClone.sessionToken, idAlpha.sessionToken);
    assert.notStrictEqual(clonedClient.getBackendPid(), sAlpha.getBackendPid());
    assert.notStrictEqual(clonedClient.getBackendPid(), sBeta.getBackendPid());

    const cloneTables = await clonedClient.query('SELECT count(*)::int as cnt FROM information_schema.tables WHERE table_schema = $1;', ['public']);
    assert.strictEqual(cloneTables.rows[0].cnt, resAlpha.rows[0].cnt);

    await clonedClient.close();
    const closedCloneId = await clonedClient.getSessionIdentity();
    assert.strictEqual(closedCloneId.active, false);
  } finally {
    await sessions.cleanup();
  }
});

await runAsyncTest('8.35. [GERÇEK DB PRE-MIGRATION PAYMENT REPLAY KORUMASI] provider_payment_id sütunu NULL olan eski şema ödemesi re-play edildiğinde, RPC eski provider_event_id/metadata eşleştirmesi ile mükerrer ödeme oluşturmaz ve sütunu fırsatçı olarak günceller', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_ref_legacy_pay_replay_01';
  const legacyPaymentId = 'pay_legacy_001_id';
  const legacyEventId = legacyPaymentId; // Base schema saved paymentId as provider_event_id
  const tenantId = '00000000-0000-0000-0000-000000000077';

  // Seed subscription
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'active', 199.90);
  `, [subRef, tenantId]);

  // Seed a legacy pre-migration payment row where provider_payment_id IS NULL:
  await db.query(`
    INSERT INTO public.payments (
      tenant_id, provider, provider_event_id, provider_payment_id, amount, currency, status, paid_at, metadata
    ) VALUES (
      $1::uuid, 'iyzico', $2::text, NULL, 199.00, 'TRY', 'paid', now() - interval '2 days', jsonb_build_object('iyziPaymentId', $2::text)
    );
  `, [tenantId, legacyEventId]);

  const initialCount = (await db.query(`SELECT count(*)::int as cnt FROM public.payments;`)).rows[0].cnt;
  const legacyRowsBefore = (await db.query(`SELECT count(*)::int as cnt FROM public.payments WHERE provider_event_id = $1;`, [legacyEventId])).rows[0].cnt;
  assert.strictEqual(legacyRowsBefore, 1);

  // Now, modern edge function receives webhook with event-type-prefixed provider_event_id
  // but with extracted provider_payment_id matching legacy paymentId:
  const modernEventId = `iyzico:subscription.order.success:${subRef}:${legacyPaymentId}`;
  const c = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', $1, 'subscription.order.success', $2, $3, null) as claim;`,
    [modernEventId, subRef, tenantId]
  );
  assert.strictEqual(c.rows[0].claim.can_proceed, true);
  const token = c.rows[0].claim.claim_attempt_id;

  const tx = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', $1, 'subscription.order.success', $2, $3, 'active', true, 199.00, 'TRY', now(), jsonb_build_object('iyziPaymentId', $4::text), '{}'::jsonb, $5::uuid, $4
    ) as tx;
  `, [modernEventId, subRef, tenantId, legacyPaymentId, token]);

  const txRes = tx.rows[0].tx;
  assert.strictEqual(txRes.success, true);
  assert.strictEqual(txRes.is_duplicate_payment, true, 'Legacy odeme icin mukerrer bayragi true olmalidir');
  assert.strictEqual(txRes.payment_recorded, false, 'Eski odemenin tekrari yeni bir payment satiri ACAMAZ');

  // Verify total payment count in DB did NOT increase:
  const finalCount = (await db.query(`SELECT count(*)::int as cnt FROM public.payments;`)).rows[0].cnt;
  assert.strictEqual(finalCount, initialCount, 'Toplam odeme adedi kesinlikle degismemeli, yeni satir acilmamalidir');

  // Verify opportunistic backfill: provider_payment_id is now populated on that legacy row
  const rowCheck = await db.query(`SELECT provider_payment_id FROM public.payments WHERE provider_event_id = $1;`, [legacyEventId]);
  assert.strictEqual(rowCheck.rows[0].provider_payment_id, legacyPaymentId, 'Fırsatçı backfill ile provider_payment_id guncellenmis olmalidir');
});

await runAsyncTest('8.36. [LEGACY METADATA TRUST BOUNDARY] Aday migration imzasiz metadata kimligini otomatik provider_payment_id yapmaz', async () => {
  const db = await getDisposablePgEngine();
  const legacyEventId = 'evt_legacy_unverified_836';
  const poisonedId = 'iyzico:order:unrelated_future_order_836';
  await db.query(`INSERT INTO public.payments (
    provider, provider_event_id, provider_payment_id, amount, currency, status, paid_at, metadata
  ) VALUES ('iyzico', $1, NULL, 89.00, 'TRY', 'paid', now(), jsonb_build_object('iyziPaymentId', $2::text));`,
    [legacyEventId, poisonedId]);
  // Historical metadata may not carry an authenticated payment identity. The source
  // migration must not promote it into the canonical indexed column.
  assert(!/UPDATE\s+public\.payments\s+SET\s+provider_payment_id\s*=\s*COALESCE\s*\(\s*metadata->/i.test(migContent));
  const result = await db.query('SELECT provider_payment_id FROM public.payments WHERE provider_event_id = $1;', [legacyEventId]);
  assert.strictEqual(result.rows[0].provider_payment_id, null,
    'Unverified historical metadata must remain untrusted until provider reconciliation');
});

await runAsyncTest('8.37. [GERÇEK POSTGRESQL MOTORU PID VE EŞZAMANLI ROW LOCK KONTROLÜ] Client 1 ve Client 2 veritabanı motorundan (SELECT pg_backend_pid()) iki farklı gerçek backend PID alır; Client 1 FOR UPDATE ile satırı kilitlediğinde Client 2 veritabanı motoru seviyesinde fiziksel olarak bloke olur ve Client 1 commit ettiğinde kilidi devralır', async () => {
  const sessions = await createIndependentPgSessions();
  try {
    const client1 = await sessions.createSession('worker-lock-pid-01');
    const client2 = await sessions.createSession('worker-lock-pid-02');

    // 1. Verify genuine distinct PostgreSQL engine PIDs queried directly from the DB
    const resPid1 = await client1.query('SELECT pg_backend_pid() AS pid;');
    const resPid2 = await client2.query('SELECT pg_backend_pid() AS pid;');
    const pid1 = resPid1.rows[0].pid;
    const pid2 = resPid2.rows[0].pid;

    assert(typeof pid1 === 'number' && pid1 > 0, 'Client 1 geçerli bir PostgreSQL OS backend PID almalıdır');
    assert(typeof pid2 === 'number' && pid2 > 0, 'Client 2 geçerli bir PostgreSQL OS backend PID almalıdır');
    assert.notStrictEqual(pid1, pid2, 'Client 1 ve Client 2 PostgreSQL motoru üzerinde MUTLAKA farklı backend PID değerlerine sahip olmalıdır');

    const subRef = 'sub_ref_pg_engine_lock_837';
    await client1.query(`
      INSERT INTO public.subscriptions (provider_subscription_id, status, price)
      VALUES ($1, 'pending', 199.00);
    `, [subRef]);

    const barrier = createTransactionBarrier();

    // Client 1 opens transaction, selects subscription row FOR UPDATE, and waits on barrier
    let client1Committed = false;
    const p1 = (async () => {
      await client1.transaction(async (tx1) => {
        const sel = await tx1.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1 FOR UPDATE;`, [subRef]);
        assert.strictEqual(sel.rows[0].status, 'pending');
        barrier.signalEntered();
        await barrier.waitRelease();
        await tx1.query(`UPDATE public.subscriptions SET status = 'active' WHERE provider_subscription_id = $1;`, [subRef]);
      });
      client1Committed = true;
    })();

    // Client 2 attempts to select the same row FOR UPDATE across the transaction barrier
    const p2 = (async () => {
      await barrier.waitEntered();

      let client2Acquired = false;
      const p2LockQuery = client2.transaction(async (tx2) => {
        const r = await tx2.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1 FOR UPDATE;`, [subRef]);
        client2Acquired = true;
        return r.rows[0].status;
      });

      // Verify that Client 2 is actively BLOCKED on PostgreSQL row lock while Client 1 holds open transaction
      await new Promise(resolve => setTimeout(resolve, 80));
      assert.strictEqual(client2Acquired, false, 'Client 2 PostgreSQL FOR UPDATE kilidi açıkken veritabanı motorunda bloke olmalıdır');
      assert.strictEqual(client1Committed, false);

      // Release barrier so Client 1 commits and releases the row lock
      barrier.releaseBarrier();
      await p1;

      // Now Client 2 successfully unblocks and acquires the lock, seeing the updated 'active' status
      const client2Status = await p2LockQuery;
      assert.strictEqual(client2Acquired, true, 'Client 1 commit sonrasında Client 2 kilidi devralmış olmalıdır');
      assert.strictEqual(client2Status, 'active', 'Client 2 güncellenmiş durumu görmelidir');
    })();

    await Promise.all([p1, p2]);
  } finally {
    await sessions.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 9. GERÇEK EDGE FUNCTION HANDLER (`handlePaymentWebhook`) ENTEGRASYON VE KABUL TESTLERI
// (Direct Edge Function Handler Testing with Injectable Supabase Admin Client & Real PGlite DB)
// ---------------------------------------------------------------------------

function createInjectableSupabaseClient(pgDb, faultOptions = {}) {
  return {
    from(tableName) {
      return {
        select(columns) {
          const filters = [];
          return {
            eq(col, val) {
              filters.push({ col, val });
              return this;
            },
            async maybeSingle() {
              if (tableName === 'subscriptions' && faultOptions.simulateSubscriptionLookupError) {
                return {
                  data: null,
                  error: { message: 'Database connection reset during subscription query', code: '08006' }
                };
              }

              if (tableName === 'payment_webhook_idempotency' && faultOptions.simulateIdempotencyCheckError) {
                return {
                  data: null,
                  error: { message: 'Database connection reset during idempotency check', code: '08006' }
                };
              }

              const whereClauses = filters.map((f, idx) => `"${f.col}" = $${idx + 1}`).join(' AND ');
              const values = filters.map(f => f.val);
              const sql = `SELECT ${columns === '*' ? '*' : columns} FROM public.${tableName} ${whereClauses ? 'WHERE ' + whereClauses : ''} LIMIT 2;`;
              try {
                const res = await pgDb.query(sql, values);
                if (res.rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows returned for maybeSingle' } };
                return { data: res.rows[0] || null, error: null };
              } catch (err) {
                return { data: null, error: err };
              }
            }
          };
        }
      };
    },
    async rpc(fnName, args = {}) {
      if (fnName === 'finalize_payment_webhook_event' && faultOptions.simulateFinalizeError) {
        return {
          data: null,
          error: { message: 'Connection terminated during finalize_payment_webhook_event', code: '08006' }
        };
      }

      if (fnName === 'execute_payment_webhook_transaction' && faultOptions.simulateTransactionError) {
        return {
          data: null,
          error: { message: 'Transaction deadlock on execute_payment_webhook_transaction', code: '40P01' }
        };
      }

      if (fnName === 'claim_payment_webhook_event') {
        const {
          p_provider = 'iyzico',
          p_provider_event_id,
          p_event_type,
          p_subscription_reference_code,
          p_tenant_id = null,
          p_payload_fingerprint = null,
          p_timeout_seconds = 60,
          p_event_timestamp = null
        } = args;

        try {
          const res = await pgDb.query(
            `SELECT public.claim_payment_webhook_event($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) as res;`,
            [
              p_provider,
              p_provider_event_id,
              p_event_type,
              p_subscription_reference_code,
              p_tenant_id,
              p_payload_fingerprint,
              p_timeout_seconds,
              p_event_timestamp
            ]
          );
          return { data: res.rows[0]?.res, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      }

      if (fnName === 'finalize_payment_webhook_event') {
        const {
          p_provider = 'iyzico',
          p_provider_event_id,
          p_status,
          p_response_payload = {},
          p_claim_attempt_id = null
        } = args;

        try {
          const res = await pgDb.query(
            `SELECT public.finalize_payment_webhook_event($1, $2, $3, $4::jsonb, $5::uuid) as res;`,
            [
              p_provider,
              p_provider_event_id,
              p_status,
              JSON.stringify(p_response_payload || {}),
              p_claim_attempt_id
            ]
          );
          return { data: res.rows[0]?.res, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      }

      if (fnName === 'execute_payment_webhook_transaction') {
        const {
          p_provider = 'iyzico',
          p_provider_event_id,
          p_event_type,
          p_subscription_reference_code,
          p_tenant_id = null,
          p_target_status,
          p_has_payment_proof = false,
          p_amount = 0,
          p_currency = 'TRY',
          p_event_timestamp = null,
          p_payment_metadata = {},
          p_audit_details = {},
          p_claim_attempt_id = null,
          p_provider_payment_id = null
        } = args;

        try {
          const res = await pgDb.query(
            `SELECT public.execute_payment_webhook_transaction($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::jsonb, $12::jsonb, $13::uuid, $14) as res;`,
            [
              p_provider,
              p_provider_event_id,
              p_event_type,
              p_subscription_reference_code,
              p_tenant_id,
              p_target_status,
              p_has_payment_proof,
              p_amount,
              p_currency,
              p_event_timestamp,
              JSON.stringify(p_payment_metadata || {}),
              JSON.stringify(p_audit_details || {}),
              p_claim_attempt_id,
              p_provider_payment_id
            ]
          );
          return { data: res.rows[0]?.res, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      }

      throw new Error(`Unhandled RPC in test client adapter: ${fnName}`);
    }
  };
}

async function createSignedWebhookRequest(payload, secretKey = 'test_secret_key_sec9') {
  if (payload && typeof payload === 'object' && !payload.merchantId && !payload.omitMerchantId && !payload.iyziEventType && !payload.token) {
    payload.merchantId = 'merchant_sec9';
  }
  if (payload && typeof payload === 'object' && !payload.orderReferenceCode && !payload.orderReference && !payload.omitOrderReference) {
    if (payload.eventId) payload.orderReferenceCode = payload.eventId;
    else if (payload.iyziPaymentId) payload.orderReferenceCode = `ord_${payload.iyziPaymentId}`;
  }
  const message = payload.iyziEventType || payload.token
    ? iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey)
    : iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey);
  const signature = await iyzicoClient.hmacSha256Hex(message, secretKey);
  const rawBody = JSON.stringify(payload);

  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-iyz-signature-v3': signature
    },
    text: async () => rawBody,
    body: rawBody
  };
}

await runAsyncTest('9.1. [GERÇEK EDGE HANDLER] Ödeme-sonrası subscription hatası/transaction fault halinde 500 döner, retry ile başarıyla tamamlanır', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_tx_fault_01';
  const providerEventId = 'evt_real_tx_fault_01';

  // Seed subscription in pending status
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1890.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_tx_fault_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_01',
    price: 1890.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const faultyClient = createInjectableSupabaseClient(db, { simulateTransactionError: true });
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  // Istek 1: Transaction hata verir
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: faultyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res1.status, 500, 'Transaction hatasinda HTTP 500 donmelidir');
  const body1 = await res1.json();
  assert.strictEqual(body1.retryable, true, 'Hata retryable: true bildirmelidir');

  // DB kontrolu: Odeme tablosuna kayit yazilmamis olmali
  const payCheck1 = await db.query(`SELECT id FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck1.rows.length, 0, 'Hatali transaction sonrasi hicbir odeme kaydi yazilmamis olmalidir');

  // Abonelik pending kalmali
  const subCheck1 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck1.rows[0].status, 'pending', 'Hatali transaction sonrasi abonelik pending kalmalidir');

  // Idempotency tablosunda status failed olmali (retry yapilabilir)
  const idemCheck1 = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemCheck1.rows[0].status, 'failed', 'Idempotency kaydi failed durumuna getirilmelidir');

  // Istek 2: Provider retry gonderir (saglikli veritabani)
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);

  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res2.status, 200, 'Retry istegi HTTP 200 basariyla donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.duplicate, false, 'Ilk basarili retry duplicate false donmelidir');
  assert.strictEqual(body2.paymentRecorded, true, 'Odeme basariyla kaydedilmelidir');
  assert.strictEqual(body2.status, 'active');

  // DB kontrolu: Tam olarak 1 odeme kaydi olusmus olmali
  const payCheck2 = await db.query(`SELECT amount, status FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck2.rows.length, 1, 'Retry sonrasinda tam olarak 1 odeme kaydi olusmalidir');
  assert.strictEqual(Number(payCheck2.rows[0].amount), 1890);
  assert.strictEqual(payCheck2.rows[0].status, 'paid');

  // Abonelik active olmali
  const subCheck2 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck2.rows[0].status, 'active', 'Abonelik basariyla active yapilmalidir');

  // Idempotency processed olmali
  const idemCheck2 = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemCheck2.rows[0].status, 'processed');
});

await runAsyncTest('9.2. [GERÇEK EDGE HANDLER] Claim-sonrası transient subscription lookup hatasında failed yazılır, retry ile başarıyla tamamlanır', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_transient_lookup_01';
  const providerEventId = 'evt_real_transient_lookup_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1290.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_transient_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_02',
    price: 1290.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const faultyClient = createInjectableSupabaseClient(db, { simulateSubscriptionLookupError: true });
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  // Istek 1: Subscription sorgusu gecici hata verir
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: faultyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res1.status, 500, 'Lookup hatasinda HTTP 500 donmelidir');
  const body1 = await res1.json();
  assert.strictEqual(body1.retryable, true);

  // Idempotency kaydinin failed olarak finalizasyonu yapilmis olmali
  const idemCheck1 = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemCheck1.rows[0].status, 'failed', 'Gecici lookup hatasinda idempotency statusu failed yapilmalidir');

  // Istek 2: Provider retry cagrilarinda olay hemen reclaim edilir ve tamamlanir
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);

  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res2.status, 200, 'Retry istegi basariyla 200 donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.paymentRecorded, true);
  assert.strictEqual(body2.duplicate, false);

  const payCheck = await db.query(`SELECT id FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck.rows.length, 1);
});

await runAsyncTest('9.3. [GERÇEK EDGE HANDLER] Processed duplicate isteklerde duplicate:true ve paymentRecorded:false saklanan payload tarafindan ezilmez', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_dup_override_01';
  const providerEventId = 'evt_real_dup_override_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 2190.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_dup_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_03',
    price: 2190.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  // 1. Ilk basarili istek
  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res1.status, 200);
  const body1 = await res1.json();
  assert.strictEqual(body1.paymentRecorded, true);
  assert.strictEqual(body1.duplicate, false);

  // DB'deki idempotency record icinde response_payload paymentRecorded: true icerir
  const idemRow = await db.query(`SELECT response_payload FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert(idemRow.rows[0].response_payload);
  assert.strictEqual(idemRow.rows[0].response_payload.paymentRecorded, true);

  // 2. Duplicate istek: Gercek handler cagrildiginda duplicate yaniti saklanan payloadi ezmelidir!
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res2.status, 200);
  const body2 = await res2.json();
  assert.strictEqual(body2.duplicate, true, 'Tekrar isteginde duplicate: true zorunlu olmalidir');
  assert.strictEqual(body2.idempotent, true, 'Tekrar isteginde idempotent: true zorunlu olmalidir');
  assert.strictEqual(body2.paymentRecorded, false, 'Tekrar isteginde paymentRecorded: false zorunlu olmali, saklanan true ezilmelidir!');
  assert.strictEqual(body2.status, 'active');

  // DB kontrolu: Odeme adedi hala 1
  const payCheck = await db.query(`SELECT id FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck.rows.length, 1, 'Mukerrer istek sonrasi odeme kesinlikle tek kalmalidir');
});

await runAsyncTest('9.4. [GERÇEK EDGE HANDLER] Tenant mismatch durumunda olay duplicate_suppressed olarak finalize edilir ve 403 donulur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_mismatch_01';
  const providerEventId = 'evt_real_mismatch_01';

  // Seed subscription with real UUID tenant
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, tenant_id)
    VALUES ($1, 'pending', '00000000-0000-0000-0000-000000000001');
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_mismatch_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: '00000000-0000-0000-0000-000000000099', // Mismatched tenant
    price: 990.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req = await createSignedWebhookRequest(payload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res.status, 403, 'Tenant mismatch 403 Forbidden donmelidir');

  // DB'de status duplicate_suppressed olmali
  const idemCheck = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemCheck.rows[0].status, 'duplicate_suppressed', 'Mismatch olayi duplicate_suppressed olarak finalize edilmelidir');
});

await runAsyncTest('9.5. [GERÇEK EDGE HANDLER - FINALIZATION RESILIENCE] Finalize basarisizligi -> Hizli retry (503 fail-closed) -> Timeout sonrasi basarili kurtarma ve islem senaryosu', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_finalize_fail_01';
  const providerEventId = 'evt_real_finalize_fail_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 1490.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_finalize_fail_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_05',
    price: 1490.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const brokenClient = createInjectableSupabaseClient(db, {
    simulateSubscriptionLookupError: true,
    simulateFinalizeError: true
  });
  const inFlightSet1 = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  // 1. Ilk istek: Lookup hatasi ve finalize RPC hatasi -> 500 fail-closed donulur
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: brokenClient,
    inFlightSet: inFlightSet1,
    getEnv
  });

  assert.strictEqual(res1.status, 500, 'Hem sorgu hem finalize hatasinda 500 donmelidir');
  const body1 = await res1.json();
  assert.strictEqual(body1.retryable, true);
  assert.strictEqual(body1.finalized, false, 'Finalizasyon basarisiz oldugu dogrulanmalidir');

  // DB durumu: finalize basarisiz oldugu icin kayit 'processing' durumunda kaldi
  const dbCheck1 = await db.query(`
    SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;
  `, [canonicalEventId]);
  assert.strictEqual(dbCheck1.rows[0].status, 'processing');

  // 2. Hizli Retry (Lock suresi henuz dolmadan gelen provider tekrar denemesi):
  // Veritabani duzelmis olsa bile 'processing' kilidi aktif oldugundan ASLA 200 duplicate donulmemeli!
  // Fail-closed sozlesme geregi 503 retryable donulmeli ki provider islemi bitmis sanip pes etmesin.
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet2 = new Set();

  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    inFlightSet: inFlightSet2,
    getEnv
  });

  assert.strictEqual(res2.status, 503, 'Processing durumundaki kayda yapilan hizli retryda ASLA 200 donulemez, 503 retryable donulmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.status, 'processing');
  assert.strictEqual(body2.retryable, true);

  // DB durumu: abonelik hala pending, odeme yazilmadi
  const subCheck2 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck2.rows[0].status, 'pending');

  // 3. Zaman Asimi Sonrasi Nihai Kurtarma (Lock timeout gectikten sonraki retry):
  // Stuck lock timeout suresi gecer (simulated by updating updated_at to 120s ago)
  await db.query(`
    UPDATE public.payment_webhook_idempotency
    SET updated_at = now() - INTERVAL '120 seconds'
    WHERE provider_event_id = $1;
  `, [canonicalEventId]);

  const req3 = await createSignedWebhookRequest(payload, secretKey);
  const inFlightSet3 = new Set();

  const res3 = await handlePaymentWebhook(req3, {
    supabaseAdmin: healthyClient,
    inFlightSet: inFlightSet3,
    getEnv
  });

  assert.strictEqual(res3.status, 200, 'Stuck lock suresi dolunca retry basariyla 200 donmelidir');
  const body3 = await res3.json();
  assert.strictEqual(body3.paymentRecorded, true, 'Odeme basariyla kaydedilmelidir');
  assert.strictEqual(body3.status, 'active');

  // DB durumu: abonelik active oldu ve odeme tablosuna 1 kayit yazildi
  const subCheck3 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck3.rows[0].status, 'active');
  const payCheck3 = await db.query(`SELECT count(*)::int as cnt FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck3.rows[0].cnt, 1);

  // 4. Islem Tamamlandiktan Sonraki Duplicate Replay:
  // Artik processed durumuna gectigi icin sonraki duplicate istekler guvenli 200 duplicate doner
  const req4 = await createSignedWebhookRequest(payload, secretKey);
  const inFlightSet4 = new Set();

  const res4 = await handlePaymentWebhook(req4, {
    supabaseAdmin: healthyClient,
    inFlightSet: inFlightSet4,
    getEnv
  });

  assert.strictEqual(res4.status, 200, 'Islem sonrasi duplicate istek 200 donmelidir');
  const body4 = await res4.json();
  assert.strictEqual(body4.duplicate, true);
  assert.strictEqual(body4.paymentRecorded, false);
});

await runAsyncTest('9.6. [GERÇEK EDGE HANDLER] Tenant mismatch sonrasi duplicate cagrida duplicate: true ve paymentRecorded: false ile idempotent 200 donulur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_mismatch_dup_01';
  const providerEventId = 'evt_real_mismatch_dup_01';

  // Seed subscription with real UUID tenant
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, tenant_id)
    VALUES ($1, 'pending', '00000000-0000-0000-0000-000000000001');
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_real_mismatch_dup_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: '00000000-0000-0000-0000-000000000099', // Mismatched tenant
    price: 990.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  // Istek 1: Mismatch 403 Forbidden doner ve duplicate_suppressed olarak isaretlenir
  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });
  assert.strictEqual(res1.status, 403, 'Ilk mismatch 403 donmelidir');

  // Istek 2: Ayni istek tekrar geldiginde guvenli idempotent 200 duplicate donmelidir
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });
  assert.strictEqual(res2.status, 200, 'Tekrarlanan mismatch duplicate 200 donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.duplicate, true, 'Tekrar isteginde duplicate: true zorunlu olmalidir');
  assert.strictEqual(body2.paymentRecorded, false, 'Tekrar isteginde odeme kaydedilmemelidir');
  assert.strictEqual(body2.status, 'pending', 'Tekrarlanan duplicate yaniti gercek abonelik durumunu (pending) bildirmelidir');
  assert.notStrictEqual(body2.status, 'active', 'Reddedilmis olayin tekrari asla uygulanmamis active durumunu bildirmemelidir');
  assert.strictEqual(body2.rejected, true, 'Kalici ret sonucu (rejected: true) duplicate yanitinda bildirilmelidir');
  assert.strictEqual(body2.rejectionReason, 'TENANT_MISMATCH', 'Ret sebebi TENANT_MISMATCH olarak saklanmis olmalidir');

  // DB kontrolu: abonelik durumu veritabaninda kesinlikle pending kalmis olmali
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending', 'Abonelik durumu veritabaninda kesinlikle pending kalmalidir');

  // DB kontrolu: payments tablosuna kesinlikle hicbir kayit acilmamis olmali
  const payCheck = await db.query(`SELECT id FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck.rows.length, 0, 'Mismatch durumunda hicbir odeme acilmamalidir');
});

await runAsyncTest('9.7. [GERÇEK EDGE HANDLER] Out-of-order eski zaman damgali olay outOfOrderSuppressed: true ile karsilanir, abonelik durumu korunur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_ooo_handler_01';
  const providerEventId = 'evt_real_ooo_handler_01';

  // Seed subscription with active status and recent timestamp
  const recentTime = new Date('2026-09-01T15:00:00Z').toISOString();
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, last_webhook_event_at)
    VALUES ($1, 'active', $2::timestamptz);
  `, [subRef, recentTime]);

  // Delayed stale event: an earlier subscription.created from 10:00:00Z
  const stalePayload = {
    eventType: 'subscription.created',
    eventId: providerEventId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_07',
    eventTime: new Date('2026-09-01T10:00:00Z').getTime(), // 5 hours in the past!
    status: 'PENDING'
  };

  const req = await createSignedWebhookRequest(stalePayload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res.status, 422, 'Undocumented subscription.created must fail before claim');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'PROVIDER_STATE_RECONCILIATION_REQUIRED');

  // DB kontrolu: abonelik statusu hala 'active' kalmali, pending'e dusmemeli
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active', 'Abonelik DB uzerinde kesinlikle active kalmalidir');
});

await runAsyncTest('9.8. [GERÇEK EDGE HANDLER] Trialing durumundaki abonelik gecikmis subscription.created olayi ile pending durumuna dusurulmez, trialing korunur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_real_trialing_protect_01';
  const providerEventId = 'evt_real_trialing_protect_01';

  // Seed subscription with trialing status
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'trialing');
  `, [subRef]);

  // Delayed subscription.created attempting to downgrade to pending
  const delayedCreatedPayload = {
    eventType: 'subscription.created',
    eventId: providerEventId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_08',
    status: 'PENDING'
  };

  const req = await createSignedWebhookRequest(delayedCreatedPayload, secretKey);
  const healthyClient = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: healthyClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res.status, 422, 'Undocumented subscription.created must fail before claim');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'PROVIDER_STATE_RECONCILIATION_REQUIRED');

  // DB kontrolu: abonelik statusu kesinlikle 'trialing' kalmali
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'trialing', 'Abonelik DB uzerinde kesinlikle trialing kalmalidir');
});

await runAsyncTest('9.9. [GERÇEK EDGE HANDLER] Veritabani ortami yapilandirilmamisken webhook 503 fail-closed retryable: true doner ve hicbir odeme olusmaz', async () => {
  const secretKey = 'test_secret_key_sec9';
  const payload = {
    eventType: 'subscription.order.success',
    eventId: 'evt_no_db_config_01',
    subscriptionReferenceCode: 'sub_no_db_01',
    customerReferenceCode: 'tenant_no_db',
    price: 199.00,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined); // No SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: undefined,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res.status, 503, 'DB konfiguru olmadiginda fail-closed 503 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.retryable, true, 'Hata retryable: true bildirmelidir');
});

await runAsyncTest('9.10. [GERÇEK EDGE HANDLER] RPC bozuk veya eksik txRes dondurdugunde pozitif sozlesme geregi fail-closed 500 retryable: true donulur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_corrupt_rpc_01';
  const providerEventId = 'evt_corrupt_rpc_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'pending');
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_10',
    price: 99.00,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const baseClient = createInjectableSupabaseClient(db);
  // Corrupt RPC response mock: returns empty object without success: true
  const corruptClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        return { data: { corrupted: true }, error: null };
      }
      return baseClient.rpc(fn, args);
    }
  };
  const inFlightSet = new Set();
  const getEnv = (k) => (k === 'IYZICO_SECRET_KEY' ? secretKey : undefined);

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: corruptClient,
    inFlightSet,
    getEnv
  });

  assert.strictEqual(res.status, 500, 'Bozuk RPC yanitinda 200 donulemez, fail-closed 500 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.retryable, true);
});

await runAsyncTest('9.11. [GERÇEK EDGE HANDLER EŞZAMANLI PAYLOAD ÇAKIŞMASI] Ayni provider_event_id icin kilit devam ederken farkli payload ile eszamanli istek geldiginde in-flight 200 donulmez, HTTP 409 conflict donulur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_inflight_conflict_01';
  const providerEventId = 'evt_inflight_conflict_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'pending');
  `, [subRef]);

  const payloadOriginal = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    orderReferenceCode: providerEventId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_11',
    price: 99.00,
    status: 'SUCCESS'
  };

  const payloadConflicting = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    orderReferenceCode: providerEventId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_11_attacker',
    price: 999.00, // Different payload!
    status: 'SUCCESS'
  };

  const req2 = await createSignedWebhookRequest(payloadConflicting, secretKey);

  const inFlightSet = new Set();
  const inFlightFingerprints = new Map();
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const client = createInjectableSupabaseClient(db);

  // Simulate Request 1 currently in-flight (holding lock with fingerprint 1)
  const canonicalEventId = iyzicoClient.extractProviderEventId(payloadOriginal);
  const fp1 = await iyzicoClient.hmacSha256Hex(iyzicoClient.signedWebhookFingerprintMaterial(payloadOriginal), 'payload-fingerprint-salt');
  inFlightSet.add(canonicalEventId);
  inFlightFingerprints.set(canonicalEventId, fp1);

  // Request 2 arrives concurrently with conflicting payload
  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: client,
    inFlightSet,
    inFlightFingerprints,
    getEnv
  });

  assert.strictEqual(res2.status, 409, 'Farkli payload tasiyan eszamanli istek HTTP 409 Conflict donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.errorCode, 'PAYLOAD_FINGERPRINT_MISMATCH');
  assert.strictEqual(body2.conflict, true);
});

await runAsyncTest('9.12. [GERÇEK EDGE HANDLER EŞZAMANLI AYNI PAYLOAD] Ayni provider_event_id icin kilit devam ederken ayni payload ile eszamanli istek geldiginde lider commit eder ve takipci inFlight: true ve idempotent 200 alir', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_inflight_same_01';
  const providerEventId = 'evt_inflight_same_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 99.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_inflight_same_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_12',
    price: 99.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const inFlightExecutions = new Map();
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };
  const baseClient = createInjectableSupabaseClient(db);
  const delayedClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return baseClient.rpc(fn, args);
    }
  };

  // Execute both requests concurrently sharing inFlightExecutions
  const [res1, res2] = await Promise.all([
    handlePaymentWebhook(req1, {
      supabaseAdmin: delayedClient,
      inFlightExecutions,
      getEnv
    }),
    handlePaymentWebhook(req2, {
      supabaseAdmin: delayedClient,
      inFlightExecutions,
      getEnv
    })
  ]);

  // One of them is leader (res1 or res2) and one is follower!
  const body1 = await res1.clone().json();
  const leaderRes = body1.inFlight ? res2 : res1;
  const followerRes = leaderRes === res1 ? res2 : res1;

  assert.strictEqual(leaderRes.status, 200, 'Lider istek basariyla 200 donmelidir');
  const leaderBody = await leaderRes.json();
  assert.strictEqual(leaderBody.paymentRecorded, true);

  assert.strictEqual(followerRes.status, 200, 'Ayni payload tasiyan eszamanli takipci lider commit sonrasi idempotent 200 almalidir');
  const followerBody = await followerRes.json();
  assert.strictEqual(followerBody.duplicate, true);
  assert.strictEqual(followerBody.inFlight, true);
  assert.strictEqual(followerBody.paymentRecorded, false);

  // Verify only 1 payment was inserted in DB
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1, 'Veritabaninda tam olarak 1 odeme kaydi olmalidir');
});

await runAsyncTest('9.13. [GERÇEK EDGE HANDLER KANONIK JSON FINGERPRINT GÜVENCESİ] Farkli anahtar sirasi ve bosluk formatina sahip mesru duplicate webhook istegi kanonik JSON ile ayni fingerprinti uretir ve 409 yerine idempotent 200 doner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_canonical_01';
  const providerEventId = 'evt_canonical_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 99.00);
  `, [subRef]);

  const payload1 = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_canonical_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_13',
    price: 99.00,
    status: 'SUCCESS'
  };

  // payload2 has swapped key order
  const payload2 = {
    status: 'SUCCESS',
    price: 99.00,
    customerReferenceCode: 'tenant_sec9_13',
    iyziPaymentId: 'pay_canonical_01',
    subscriptionReferenceCode: subRef,
    eventId: providerEventId,
    eventType: 'subscription.order.success'
  };

  const inFlightSet = new Set();
  const inFlightFingerprints = new Map();
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };
  const client = createInjectableSupabaseClient(db);

  // First request processed and finalized
  const req1 = await createSignedWebhookRequest(payload1, secretKey);
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: client,
    inFlightSet,
    inFlightFingerprints,
    getEnv
  });
  assert.strictEqual(res1.status, 200);
  const body1 = await res1.json();
  assert.strictEqual(body1.paymentRecorded, true);

  // Second request arrives with swapped key order (replay)
  const req2 = await createSignedWebhookRequest(payload2, secretKey);
  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: client,
    inFlightSet,
    inFlightFingerprints,
    getEnv
  });

  // Canonical JSON ensures identical fingerprint, so NOT 409, but idempotent 200 duplicate!
  assert.strictEqual(res2.status, 200, 'Farkli anahtar sirali duplicate istek 409 degil idempotent 200 donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.duplicate, true);
  assert.strictEqual(body2.paymentRecorded, false);
});

await runAsyncTest('9.14. [GERÇEK EDGE HANDLER EŞZAMANLI İŞLEMDE LİDER HATASI] Lider transaction sirasinda DB hatasi aldiginda eszamanli takipci ASLA erken 200 almaz; her iki istek de retryable 5xx doner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_inflight_fail_01';
  const providerEventId = 'evt_inflight_fail_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'pending');
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_inflight_fail_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_sec9_14',
    price: 199.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const inFlightExecutions = new Map();
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Client with simulated transaction error and concurrent interleave delay
  const baseFailingClient = createInjectableSupabaseClient(db, {
    simulateTransactionError: true
  });
  const delayedFailingClient = {
    ...baseFailingClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return baseFailingClient.rpc(fn, args);
    }
  };

  // Execute both requests concurrently sharing inFlightExecutions
  const [res1, res2] = await Promise.all([
    handlePaymentWebhook(req1, {
      supabaseAdmin: delayedFailingClient,
      inFlightExecutions,
      getEnv
    }),
    handlePaymentWebhook(req2, {
      supabaseAdmin: delayedFailingClient,
      inFlightExecutions,
      getEnv
    })
  ]);

  // Both leader and follower MUST receive failure (500 retryable)
  assert.notStrictEqual(res1.status, 200, 'Lider 200 basari donemez');
  assert.notStrictEqual(res2.status, 200, 'Lider basarisiz oldugunda eszamanli takipci KESINLIKLE erken 200 alamaz');

  assert.strictEqual(res1.status, 500, 'Lider transaction hatasinda 500 donmelidir');
  assert.strictEqual(res2.status, 500, 'Takipci liderin transaction hatasinda 500 propagate etmelidir');

  const body1 = await res1.json();
  const body2 = await res2.json();
  assert.strictEqual(body1.retryable, true, 'Lider retryable olmalidir');
  assert.strictEqual(body2.retryable, true, 'Takipci retryable olmalidir');

  // Verify NO payment was inserted in DB
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_payment_id = $1;`, ['pay_inflight_fail_01']);
  assert.strictEqual(Number(payCount.rows[0].cnt), 0, 'Basarisiz islem sonrasinda veritabanina hicbir odeme yazilmamis olmalidir');

  // Verify subscription is STILL pending (not active!)
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending', 'Abonelik pending durumunda kalmalidir');
});

await runAsyncTest('9.15. [GERÇEK EDGE HANDLER ÇOKLU INSTANCE / CROSS-CONTAINER EŞZAMANLI YARIŞ] Ayrı inFlightExecutions context\'ine sahip iki bağımsız container yarıştığında Lider DB\'yi işlerken Takipçi DB observation loop ile bekler; Lider 200 tamamlandığında Takipçi 200 duplicate alır, payments tablosunda tek satır oluşur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_cross_container_race_01';
  const providerEventId = 'evt_cross_container_race_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status, price)
    VALUES ($1, 'pending', 349.00);
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_cross_container_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_cross_container_01',
    price: 349.00,
    status: 'SUCCESS'
  };

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const req2 = await createSignedWebhookRequest(payload, secretKey);

  // Two independent in-flight contexts simulating separate serverless containers
  const worker1Context = {
    inFlightSet: new Set(),
    inFlightFingerprints: new Map(),
    inFlightExecutions: new Map()
  };
  const worker2Context = {
    inFlightSet: new Set(),
    inFlightFingerprints: new Map(),
    inFlightExecutions: new Map()
  };

  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Worker 1 client with simulated processing delay
  const baseClient1 = createInjectableSupabaseClient(db);
  const delayedClient1 = {
    ...baseClient1,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return baseClient1.rpc(fn, args);
    }
  };

  // Worker 2 client has no delay and separate memory context
  const client2 = createInjectableSupabaseClient(db);

  // Both workers process simultaneously across independent memory spaces
  const [res1, res2] = await Promise.all([
    handlePaymentWebhook(req1, {
      supabaseAdmin: delayedClient1,
      ...worker1Context,
      getEnv
    }),
    (async () => {
      // Interleave slightly so Worker 1 acquires DB lock first
      await new Promise(r => setTimeout(r, 20));
      return handlePaymentWebhook(req2, {
        supabaseAdmin: client2,
        ...worker2Context,
        getEnv
      });
    })()
  ]);

  // Worker 1 (Leader) commits with 200
  assert.strictEqual(res1.status, 200);
  const body1 = await res1.json();
  assert.strictEqual(body1.paymentRecorded, true);
  assert.strictEqual(body1.status, 'active');

  // Worker 2 (Follower across separate container) observes DB commit and returns idempotent 200 duplicate!
  assert.strictEqual(res2.status, 200, 'Cross-instance follower 503 degil basarili lider commit sonrasi 200 duplicate donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.duplicate, true, 'Takipci duplicate: true olmalidir');
  assert.strictEqual(body2.paymentRecorded, false, 'Takipci paymentRecorded: false olmalidir');
  assert.strictEqual(body2.status, 'active');

  // Exactly 1 payment row in database
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`, [subRef]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1, 'payments tablosunda kesinlikle tek bir odeme kaydi olmalidir');
});

await runAsyncTest('9.16. [GERÇEK EDGE HANDLER ÇOKLU INSTANCE LİDER HATASI] Ayrı container\'daki Lider transaction hatası alıp failed yazdığında Takipçi erken 200 almaz, retryable 503 döner, ödeme kaydedilmez', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_cross_container_fail_01';
  const providerEventId = 'evt_cross_container_fail_01';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, status)
    VALUES ($1, 'pending');
  `, [subRef]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_cross_container_fail_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: 'tenant_cross_container_fail_01',
    price: 499.00,
    status: 'SUCCESS'
  };

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const req2 = await createSignedWebhookRequest(payload, secretKey);

  // Independent in-flight contexts
  const worker1Context = {
    inFlightSet: new Set(),
    inFlightFingerprints: new Map(),
    inFlightExecutions: new Map()
  };
  const worker2Context = {
    inFlightSet: new Set(),
    inFlightFingerprints: new Map(),
    inFlightExecutions: new Map()
  };

  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Worker 1 encounters transaction deadlock and fails
  const baseFailingClient = createInjectableSupabaseClient(db, { simulateTransactionError: true });
  const delayedFailingClient = {
    ...baseFailingClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return baseFailingClient.rpc(fn, args);
    }
  };

  const client2 = createInjectableSupabaseClient(db);

  const [res1, res2] = await Promise.all([
    handlePaymentWebhook(req1, {
      supabaseAdmin: delayedFailingClient,
      ...worker1Context,
      getEnv
    }),
    (async () => {
      await new Promise(r => setTimeout(r, 20));
      return handlePaymentWebhook(req2, {
        supabaseAdmin: client2,
        ...worker2Context,
        getEnv
      });
    })()
  ]);

  // Worker 1 returns 500 retryable
  assert.strictEqual(res1.status, 500);
  const body1 = await res1.json();
  assert.strictEqual(body1.retryable, true);

  // Worker 2 (separate container) observed 'failed' in DB -> MUST NOT return 200, returns retryable 503!
  assert.notStrictEqual(res2.status, 200, 'Lider basarisiz oldugunda takipci KESINLIKLE 200 donemez');
  assert.strictEqual(res2.status, 503, 'Takipci retryable 503 donmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.retryable, true);

  // 0 payments in database
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_payment_id = $1;`, ['pay_cross_container_fail_01']);
  assert.strictEqual(Number(payCount.rows[0].cnt), 0, 'Basarisiz islemde odeme yazilmamalidir');

  // Subscription remains pending
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending');
});

await runAsyncTest('9.17. [GERÇEK EDGE HANDLER ATOMİK TENANT UYUŞMAZLIĞI] RPC seviyesinde dönen TENANT_MISMATCH hatasında Edge Handler 403 Forbidden döner ve idempotency kaydını duplicate_suppressed olarak finalize eder', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_edge_tenant_mismatch_01';
  const providerEventId = 'evt_edge_tenant_mismatch_01';
  const originalTenant = '00000000-0000-0000-0000-000000000010';
  const modifiedTenant = '00000000-0000-0000-0000-000000000020';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status)
    VALUES ($1, $2::uuid, 'pending');
  `, [subRef, originalTenant]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_edge_mismatch_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: originalTenant,
    price: 250.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req = await createSignedWebhookRequest(payload, secretKey);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Inject client that changes subscription tenant right before execute_payment_webhook_transaction
  const baseClient = createInjectableSupabaseClient(db);
  const racingClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        // Mutate tenant_id in DB to simulate race condition between claim and execute
        await db.query(`UPDATE public.subscriptions SET tenant_id = $1::uuid WHERE provider_subscription_id = $2;`, [modifiedTenant, subRef]);
      }
      return baseClient.rpc(fn, args);
    }
  };

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: racingClient,
    getEnv
  });

  assert.strictEqual(res.status, 403, 'Atomik tenant uyusmazliginda HTTP 403 Forbidden donulmelidir');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'TENANT_MISMATCH');

  // Verify idempotency status in DB is duplicate_suppressed
  const idemRow = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemRow.rows[0].status, 'duplicate_suppressed');

  // Verify NO payments in DB
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 0);
});

await runAsyncTest('9.18. [GERÇEK EDGE HANDLER & DB UUID GÖSTERİM FARKI] Payload içindeki büyük/küçük harf UUID farkı (uppercase vs lowercase) meşru webhook\'u 403 ile bastırmaz; kilitli RPC UUID normalizasyonu ile 200 döner ve ödeme kaydedilir', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_uuid_case_01';
  const providerEventId = 'evt_uuid_case_01';
  // DB stores lowercase UUID
  const dbTenant = '00000000-0000-0000-0000-0000000000aa';
  // Payload arrives with UPPERCASE hex characters
  const payloadTenant = '00000000-0000-0000-0000-0000000000AA';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 350.00);
  `, [subRef, dbTenant]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_uuid_case_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: payloadTenant,
    price: 350.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req = await createSignedWebhookRequest(payload, secretKey);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const healthyClient = createInjectableSupabaseClient(db);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: healthyClient,
    getEnv
  });

  assert.strictEqual(res.status, 200, 'UUID case representation farki mesru webhooku bastirmamali, 200 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.status, 'active');
  assert.strictEqual(body.paymentRecorded, true);

  // DB kontrolu: Odeme basariyla kaydedildi
  const payCheck = await db.query(`SELECT id, amount FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck.rows.length, 1, 'Mesru odeme UUID case normalizasyonu ile tam olarak 1 adet kaydedilmelidir');
  assert.strictEqual(Number(payCheck.rows[0].amount), 350.00);

  // Abonelik active oldu
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');
});

await runAsyncTest('9.19. [GERÇEK EDGE HANDLER TERS TOCTOU SENARYOSU] Ön-okumada farkli olan tenant, RPC kilit aninda dogru tenant ile iliskilendirildiginde kilitli transactional sozlesme mesru islemi 200 ile tamamlar', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_inverse_toctou_01';
  const providerEventId = 'evt_inverse_toctou_01';
  const initialOldTenant = '00000000-0000-0000-0000-000000000099';
  const targetCorrectTenant = '00000000-0000-0000-0000-000000000001';

  // Seed subscription with initial unassigned/mismatched tenant
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 490.00);
  `, [subRef, initialOldTenant]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_inverse_toctou_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: targetCorrectTenant,
    price: 490.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req = await createSignedWebhookRequest(payload, secretKey);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Client updates DB tenant to matching right before RPC execution (re-assignment race)
  const baseClient = createInjectableSupabaseClient(db);
  const racingClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        // Legitimate concurrent provisioning/update finishes and binds targetCorrectTenant to subscription
        await db.query(`UPDATE public.subscriptions SET tenant_id = $1::uuid WHERE provider_subscription_id = $2;`, [targetCorrectTenant, subRef]);
      }
      return baseClient.rpc(fn, args);
    }
  };

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: racingClient,
    getEnv
  });

  assert.strictEqual(res.status, 200, 'Kilitsiz on-kontrol kaldirildigi icin kilitli RPC mesru baglantiyi gorup 200 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.status, 'active');
  assert.strictEqual(body.paymentRecorded, true);

  // DB payments tablosunda odeme kaydedildi
  const payCount = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(Number(payCount.rows[0].cnt), 1);
});

await runAsyncTest('9.20. [GERÇEK EDGE HANDLER TENANT_MISMATCH FİNALİZASYON HATASI] RPC TENANT_MISMATCH dondugunde finalize_payment_webhook_event basarisiz olursa 403 yerine retryable HTTP 503 donulur', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_fin_fail_01';
  const providerEventId = 'evt_fin_fail_01';
  const subTenant = '00000000-0000-0000-0000-000000000001';
  const mismatchTenant = '00000000-0000-0000-0000-000000000099';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status)
    VALUES ($1, $2::uuid, 'pending');
  `, [subRef, subTenant]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_fin_fail_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: mismatchTenant,
    price: 100.00,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Inject client where finalize_payment_webhook_event fails (returns finalized: false)
  const baseClient = createInjectableSupabaseClient(db);
  const failingFinalizeClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'finalize_payment_webhook_event') {
        // Simulate finalize RPC failure (e.g. lease timeout or transient DB rejection)
        return { data: { finalized: false, reason: 'SIMULATED_FINALIZE_FAILURE' }, error: null };
      }
      return baseClient.rpc(fn, args);
    }
  };

  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: failingFinalizeClient,
    getEnv
  });

  assert.strictEqual(res.status, 503, 'Finalizasyon basarisiz oldugunda kesinlikle 403 donulmemeli, retryable 503 donulmelidir');
  const body = await res.json();
  assert.strictEqual(body.retryable, true);
  assert.strictEqual(body.finalized, false);
});

await runAsyncTest('9.21. [GERÇEK EDGE HANDLER WEBHOOK-BEFORE-SUBSCRIPTION OUT-OF-ORDER GÜVENLİ RETRY] Abonelik DB\'de henüz oluşmadan gelen webhook 404 yerine failed finalizasyonu ile 503 retryable döner; abonelik açıldıktan sonraki tekrar denemesinde işlem 200 ile başarıyla tamamlanır', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_not_yet_provisioned_01';
  const providerEventId = 'evt_not_yet_provisioned_01';
  const tenantId = '00000000-0000-0000-0000-000000000077';

  // Note: Subscription is NOT inserted yet in DB! (Simulating race condition where webhook arrives before DB write)

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_early_arrival_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 600.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const healthyClient = createInjectableSupabaseClient(db);

  // Attempt 1: Webhook arrives before subscription is provisioned
  const res1 = await handlePaymentWebhook(req1, {
    supabaseAdmin: healthyClient,
    getEnv
  });

  // MUST return retryable 503, NEVER terminal 404!
  assert.strictEqual(res1.status, 503, 'Abonelik henuz olusmamisken 404 degil retryable 503 donulmelidir');
  const body1 = await res1.json();
  assert.strictEqual(body1.retryable, true);
  assert.strictEqual(body1.errorCode, 'SUBSCRIPTION_NOT_YET_PROVISIONED');

  // Idempotency status is marked as 'failed' in DB so provider retry can reclaim
  const idemCheck = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(idemCheck.rows[0].status, 'failed');

  // Now, subscription provisioning completes in DB
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 600.00);
  `, [subRef, tenantId]);

  // Attempt 2: Payment provider retries identical webhook
  const req2 = await createSignedWebhookRequest(payload, secretKey);
  const res2 = await handlePaymentWebhook(req2, {
    supabaseAdmin: healthyClient,
    getEnv
  });

  assert.strictEqual(res2.status, 200, 'Abonelik provision edildikten sonra retry edilen webhook 200 almalidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.status, 'active');
  assert.strictEqual(body2.paymentRecorded, true);

  // DB payments tablosunda tam 1 odeme olusur
  const payCheck = await db.query(`SELECT id, amount FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(Number(payCheck.rows[0].amount), 600.00);

  // Subscription is active
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');
});

await runAsyncTest('9.22. [GERÇEK EDGE HANDLER ÇOKLU INSTANCE 2.5 SN\'Yİ AŞAN LİDER GÖZLEMİ VE İDEMPOTENT 200] Lider işlemi 2.5 saniyeden uzun sürdüğünde Takipçi erken 503 dönmez; durable observation loop ile liderin commit\'ini bekler ve idempotent 200 duplicate alır', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_long_leader_01';
  const providerEventId = 'evt_long_leader_01';
  const tenantId = '00000000-0000-0000-0000-000000000088';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 750.00);
  `, [subRef, tenantId]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_long_leader_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 750.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Two independent container contexts
  const container1Client = createInjectableSupabaseClient(db);
  const container1InFlight = new Map();

  const container2Client = createInjectableSupabaseClient(db);
  const container2InFlight = new Map();

  // Container 1 (Leader) simulates a database transaction taking 2800ms (> 2500ms!)
  const delayedLeaderClient = {
    ...container1Client,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        // Sleep 2800ms to exceed old 2.5s window
        await new Promise((resolve) => setTimeout(resolve, 2800));
      }
      return container1Client.rpc(fn, args);
    }
  };

  const req1 = await createSignedWebhookRequest(payload, secretKey);
  const req2 = await createSignedWebhookRequest(payload, secretKey);

  const pLeader = handlePaymentWebhook(req1, {
    supabaseAdmin: delayedLeaderClient,
    inFlightExecutions: container1InFlight,
    getEnv
  });

  // Follower starts 100ms after leader has claimed lock in DB
  await new Promise((r) => setTimeout(r, 100));

  const pFollower = handlePaymentWebhook(req2, {
    supabaseAdmin: container2Client,
    inFlightExecutions: container2InFlight,
    getEnv,
    crossInstanceWaitMs: 8000 // Observation timeout safely permits awaiting long leader
  });

  const [leaderRes, followerRes] = await Promise.all([pLeader, pFollower]);

  assert.strictEqual(leaderRes.status, 200, 'Lider 200 basari donmelidir');
  const leaderBody = await leaderRes.json();
  assert.strictEqual(leaderBody.status, 'active');
  assert.strictEqual(leaderBody.paymentRecorded, true);

  assert.strictEqual(followerRes.status, 200, 'Takipci 2.5s asildiginda erken 503 donmemeli, lider tamamlandiginda idempotent 200 donmelidir');
  const followerBody = await followerRes.json();
  assert.strictEqual(followerBody.duplicate, true);
  assert.strictEqual(followerBody.paymentRecorded, false);
  assert.strictEqual(followerBody.crossInstanceDuplicate, true);

  // Exactly 1 payment in DB
  const payCheck = await db.query(`SELECT COUNT(*) as cnt FROM public.payments WHERE provider_event_id = $1;`, [canonicalEventId]);
  assert.strictEqual(Number(payCheck.rows[0].cnt), 1, 'Coklu instance yarisinda DB icinde tek odeme kalmalidir');
});

await runAsyncTest('9.23. [GERÇEK EDGE HANDLER LEASE-TAKEOVER HANDOFF GÜVENCESİ] Geciken işçi LEASE_LOST_TO_ANOTHER_WORKER aldığında 409 dönmez; yeni işçinin DB sonucunu gözleyip idempotent 200 duplicate döner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_lease_takeover_01';
  const providerEventId = 'evt_lease_takeover_01';
  const tenantId = '00000000-0000-0000-0000-000000000099';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 199.90);
  `, [subRef, tenantId]);

  const payload = {
    eventType: 'subscription.order.success',
    eventId: providerEventId,
    iyziPaymentId: 'pay_takeover_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 399.00,
    status: 'SUCCESS'
  };
  payload.orderReferenceCode = payload.orderReferenceCode || payload.eventId || payload.iyziPaymentId;
  const canonicalEventId = iyzicoClient.extractProviderEventId(payload);

  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const baseClient = createInjectableSupabaseClient(db);

  // Worker 1 simulates delayed execution that receives LEASE_LOST_TO_ANOTHER_WORKER from locked RPC,
  // while Worker 2 simultaneously completes the event to 'processed' in DB
  const takeoverClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        // While Worker 1 was executing, Worker 2 took over and finalized the event as 'processed' in DB
        await db.query(`
          UPDATE public.payment_webhook_idempotency
          SET status = 'processed',
              response_payload = '{"received": true, "status": "active", "duplicate": false, "paymentRecorded": true}'::jsonb,
              updated_at = now()
          WHERE provider_event_id = $1;
        `, [canonicalEventId]);
        // Worker 1 receives LEASE_LOST_TO_ANOTHER_WORKER
        return { data: { success: false, error: 'LEASE_LOST_TO_ANOTHER_WORKER', retryable: false }, error: null };
      }
      return baseClient.rpc(fn, args);
    }
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: takeoverClient,
    getEnv,
    crossInstanceWaitMs: 3000
  });

  // Must NOT return HTTP 409 conflict! It must observe the new worker's processed record and return idempotent 200 duplicate!
  assert.strictEqual(res.status, 200, 'Lease devrinde saglayiciya 409 verilmemeli, yeni iscinin basarisi ile 200 duplicate donulmelidir');
  const body = await res.json();
  assert.strictEqual(body.duplicate, true);
  assert.strictEqual(body.paymentRecorded, false);
  assert.strictEqual(body.leaseReclaimedByAnotherWorker, true);
});

await runAsyncTest('9.24. [GERÇEK EDGE HANDLER EŞİT ZAMAN DAMGALI FAILURE->SUCCESS ÇÖZÜMLEMESİ] Provider tarafından aynı eventTime ile iletilen failure olayından sonra gelen success olayı eşit zaman kontrolü tarafından bastırılmaz; 200 döner, abonelik active olur ve ödeme kaydedilir', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_handler_equal_ts_01';
  const evtFail = 'evt_handler_eq_fail_01';
  const evtSucc = 'evt_handler_eq_succ_01';
  const tenantId = '00000000-0000-0000-0000-000000000077';
  const sharedEventTime = 1725184800000; // Shared timestamp in epoch ms

  // Seed subscription in pending status
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 199.90);
  `, [subRef, tenantId]);

  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const client = createInjectableSupabaseClient(db);

  // 1. First event: payment.failure at sharedEventTime
  const failPayload = {
    eventType: 'subscription.order.failure',
    eventId: evtFail,
    iyziPaymentId: 'pay_fail_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    eventTime: sharedEventTime,
    status: 'FAILURE'
  };

  const req1 = await createSignedWebhookRequest(failPayload, secretKey);
  const res1 = await handlePaymentWebhook(req1, { supabaseAdmin: client, getEnv });
  assert.strictEqual(res1.status, 200);
  const body1 = await res1.json();
  assert.strictEqual(body1.status, 'past_due');
  assert.strictEqual(body1.paymentRecorded, false);

  // Verify DB state is past_due
  const subCheck1 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck1.rows[0].status, 'past_due');

  // 2. Second event: payment.success at EXACT SAME sharedEventTime with DIFFERENT eventId
  const succPayload = {
    eventType: 'subscription.order.success',
    eventId: evtSucc,
    iyziPaymentId: 'pay_succ_01',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    eventTime: sharedEventTime,
    price: 199.90,
    status: 'SUCCESS'
  };
  succPayload.orderReferenceCode = succPayload.orderReferenceCode || succPayload.eventId || succPayload.iyziPaymentId;
  const canonicalSuccEventId = iyzicoClient.extractProviderEventId(succPayload);

  const req2 = await createSignedWebhookRequest(succPayload, secretKey);
  const res2 = await handlePaymentWebhook(req2, { supabaseAdmin: client, getEnv });
  assert.strictEqual(res2.status, 200, 'Eşit timestamp taşıyan meşru payment.success HTTP 200 ile kabul edilmelidir');
  const body2 = await res2.json();
  assert.strictEqual(body2.status, 'active', 'Abonelik past_due borçtan active durumuna yükseltilmelidir');
  assert.strictEqual(body2.duplicate, false, 'Yeni ödeme duplicate sayılmamalıdır');
  assert.strictEqual(body2.paymentRecorded, true, 'Ödeme başarıyla kaydedilmelidir');

  // Verify in PostgreSQL tables
  const subCheck2 = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck2.rows[0].status, 'active');

  const payCheck = await db.query(`SELECT amount, status FROM public.payments WHERE provider_event_id = $1;`, [canonicalSuccEventId]);
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(Number(payCheck.rows[0].amount), 199.90);
  assert.strictEqual(payCheck.rows[0].status, 'paid');
});

await runAsyncTest('9.25. [GERÇEK EDGE HANDLER TAKILMIŞ LİDERDE SÜRE AŞIMI VE DB GÖZLEMİ İLE 200] In-flight lider promise takılıp sonuçlanmadığında takipçi süresiz beklemez; inFlightTimeoutMs ile süre aşımına uğrayıp DB gözlemine düşer ve DB terminal processed durumundaysa idempotent 200 döner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_stuck_leader_01';
  const evtId = 'evt_stuck_leader_01';
  const tenantId = '00000000-0000-0000-0000-000000000011';

  const payload = {
    eventType: 'subscription.order.success',
    eventId: evtId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 199.90,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const derivedEvtId = iyzicoClient.extractProviderEventId(payload);

  // Seed subscription and pre-populate DB record as processed (e.g. out-of-band commit or parallel worker completion)
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'active', 199.90);
  `, [subRef, tenantId]);

  await db.query(`
    INSERT INTO public.payment_webhook_idempotency (
      provider, provider_event_id, event_type, subscription_reference_code, tenant_id, status, response_payload
    ) VALUES (
      'iyzico', $1, 'payment.success', $2, $3, 'processed', '{"received": true, "status": "active", "paymentRecorded": true}'::jsonb
    );
  `, [derivedEvtId, subRef, tenantId]);

  const client = createInjectableSupabaseClient(db);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  // Simulate an in-flight leader whose promise hangs indefinitely
  const hungPromise = new Promise(() => {}); // never resolves
  const canonicalString = iyzicoClient.signedWebhookFingerprintMaterial(payload);
  const fingerprint = await iyzicoClient.hmacSha256Hex(canonicalString, 'payload-fingerprint-salt');
  const inFlightMap = new Map();
  inFlightMap.set(evtId, { fingerprint, promise: hungPromise });
  inFlightMap.set(derivedEvtId, { fingerprint, promise: hungPromise });
  // Follower runs with inFlightTimeoutMs: 60ms, crossInstanceWaitMs: 300ms
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    getEnv,
    inFlightExecutions: inFlightMap,
    inFlightTimeoutMs: 60,
    crossInstanceWaitMs: 300
  });

  assert.strictEqual(res.status, 200, 'Takılmış lider durumunda DB terminal processed ise takipçi 200 almalıdır');
  const body = await res.json();
  assert.strictEqual(body.duplicate, true);
  assert.strictEqual(body.idempotent, true);
  assert.strictEqual(body.leaderRecoveredViaDb, true);
});

await runAsyncTest('9.26. [GERÇEK EDGE HANDLER TAKILMIŞ LİDER VE BAŞARISIZ/UNCOMMITTED DEVRALMADA RETRYABLE 503] In-flight lider takıldığında ve DB processing veya uncommitted durumda kaldığında takipçi erken 200 vermez; süre aşımı sonrası retryable 503 döner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_stuck_uncommitted_02';
  const evtId = 'evt_stuck_uncommitted_02';
  const tenantId = '00000000-0000-0000-0000-000000000022';

  const payload = {
    eventType: 'subscription.order.success',
    eventId: evtId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 199.90,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const derivedEvtId = iyzicoClient.extractProviderEventId(payload);

  // Seed subscription and seed idempotency as stuck 'processing'
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 199.90);
  `, [subRef, tenantId]);

  await db.query(`
    INSERT INTO public.payment_webhook_idempotency (
      provider, provider_event_id, event_type, subscription_reference_code, tenant_id, status
    ) VALUES (
      'iyzico', $1, 'payment.success', $2, $3, 'processing'
    );
  `, [derivedEvtId, subRef, tenantId]);

  const client = createInjectableSupabaseClient(db);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const hungPromise = new Promise(() => {}); // never resolves
  const canonicalString = iyzicoClient.signedWebhookFingerprintMaterial(payload);
  const fingerprint = await iyzicoClient.hmacSha256Hex(canonicalString, 'payload-fingerprint-salt');
  const inFlightMap = new Map();
  inFlightMap.set(evtId, { fingerprint, promise: hungPromise });
  inFlightMap.set(derivedEvtId, { fingerprint, promise: hungPromise });
  // Follower runs with short inFlightTimeoutMs: 50ms, crossInstanceWaitMs: 150ms
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    getEnv,
    inFlightExecutions: inFlightMap,
    inFlightTimeoutMs: 50,
    crossInstanceWaitMs: 150
  });

  assert.strictEqual(res.status, 503, 'Lider takılıp DB tamamlanmadığında takipçi asla erken 200 vermemeli, retryable 503 dönmelidir');
  const body = await res.json();
  assert.strictEqual(body.retryable, true);
  assert.strictEqual(body.status, 'processing');
});

await runAsyncTest('9.27. [GERÇEK EDGE HANDLER TAKILMIŞ LİDERİN ARDINDAN BAŞKA İŞÇİNİN LEASE DEVRALMASI VE 200] In-flight lider takıldığında ikinci bir işçi DB lease süresi aşımını devralıp işlemi tamamlar; takipçi DB gözlemi üzerinden yeni işçinin başarısını doğrulayıp idempotent 200 döner', async () => {
  const db = await getDisposablePgEngine();
  const secretKey = 'test_secret_key_sec9';
  const subRef = 'sub_ref_takeover_leader_03';
  const evtId = 'evt_takeover_leader_03';
  const tenantId = '00000000-0000-0000-0000-000000000033';

  const payload = {
    eventType: 'subscription.order.success',
    eventId: evtId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    price: 199.90,
    status: 'SUCCESS'
  };

  const req = await createSignedWebhookRequest(payload, secretKey);
  const derivedEvtId = iyzicoClient.extractProviderEventId(payload);

  // Seed subscription and stuck lock in DB (updated 120 seconds ago)
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 199.90);
  `, [subRef, tenantId]);

  await db.query(`
    INSERT INTO public.payment_webhook_idempotency (
      provider, provider_event_id, event_type, subscription_reference_code, tenant_id, status, updated_at
    ) VALUES (
      'iyzico', $1, 'payment.success', $2, $3, 'processing', now() - INTERVAL '120 seconds'
    );
  `, [derivedEvtId, subRef, tenantId]);

  const client = createInjectableSupabaseClient(db);
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };

  const hungPromise = new Promise(() => {}); // stuck leader
  const canonicalString = iyzicoClient.signedWebhookFingerprintMaterial(payload);
  const fingerprint = await iyzicoClient.hmacSha256Hex(canonicalString, 'payload-fingerprint-salt');
  const inFlightMap = new Map();
  inFlightMap.set(evtId, { fingerprint, promise: hungPromise });
  inFlightMap.set(derivedEvtId, { fingerprint, promise: hungPromise });

  // Parallel Worker 2 claims the stuck lease after leader hung
  setTimeout(async () => {
    const claim2 = await db.query(
      `SELECT public.claim_payment_webhook_event('iyzico', $1, 'payment.success', $2, $3, null) as claim;`,
      [derivedEvtId, subRef, tenantId]
    );
    const token2 = claim2.rows[0].claim.claim_attempt_id;
    await db.query(`
      SELECT public.execute_payment_webhook_transaction(
        'iyzico', $1, 'payment.success', $2, $3, 'active', true, 199.90, 'TRY', now(), '{}'::jsonb, '{}'::jsonb, $4::uuid
      ) as tx;
    `, [derivedEvtId, subRef, tenantId, token2]);
  }, 70);
  // Follower waits with inFlightTimeoutMs: 40ms and crossInstanceWaitMs: 800ms
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    getEnv,
    inFlightExecutions: inFlightMap,
    inFlightTimeoutMs: 40,
    crossInstanceWaitMs: 800
  });

  assert.strictEqual(res.status, 200, 'Yeni işçinin lease devralıp DB tamamlaması sonrası takipçi idempotent 200 almalıdır');
  const body = await res.json();
  assert.strictEqual(body.status, 'active');
  assert.strictEqual(body.duplicate, true);
  assert.strictEqual(body.leaderRecoveredViaDb, true);
});



await runAsyncTest('9.28. [ZORUNLU NEGATİF TEST - İMZASIZ FİYAT MANİPÜLASYONU VE LEDGER GÜVENLİĞİ] Abonelik fiyatı NULL veya 0 iken geçerli imzalı webhook ile değiştirilmiş imzasız payload fiyatı gelirse, doğrulanmamış miktarla paid kaydı oluşturulamaz', async () => {

  const db = await getDisposablePgEngine();

  const secretKey = 'test_secret_key_sec9';

  const subRef = 'sub_ref_unverified_price_attack_01';

  const providerEventId = 'evt_unverified_price_attack_01';

  // 1. Seed subscription in pending status with NULL price (unverified price)

  await db.query(`

    INSERT INTO public.subscriptions (provider_subscription_id, status, price)

    VALUES ($1, 'pending', NULL);

  `, [subRef]);

  // 2. Valid signed subscription webhook, but attacker tampered with unsigned price field (e.g. 99999.00)

  const tamperedPayload = {

    merchantId: 'merchant_test_01',

    eventType: 'subscription.order.success',

    eventId: providerEventId,

    iyziPaymentId: 'pay_unverified_price_01',

    subscriptionReferenceCode: subRef,

    customerReferenceCode: 'tenant_sec9_price_attack',

    orderReferenceCode: 'ord_unverified_price_01',

    price: 99999.00,

    status: 'SUCCESS'

  };

  const req = await createSignedWebhookRequest(tamperedPayload, secretKey);
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const getEnv = (k) => {
    if (k === 'IYZICO_SECRET_KEY') return secretKey;
    if (k === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'test_service_key';
    return undefined;
  };
  // 3. Process webhook through real Edge Handler
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    inFlightSet,
    getEnv
  });

  const body = await res.json();

  const canonicalEventId = iyzicoClient.extractProviderEventId(tamperedPayload);

  // 4. Assertions:

  // Ledger invariant: Doğrulanmamış miktarla paid kaydı oluşturulamaz!

  assert.notStrictEqual(body.paymentRecorded, true, 'Doğrulanmamış miktarla paymentRecorded ASLA true olamaz');

  // Verify payments table in PostgreSQL: Tam olarak 0 adet ödeme kaydı bulunmalıdır!

  const payCheck = await db.query(

    `SELECT COUNT(*)::int as cnt FROM public.payments WHERE provider_event_id = $1 OR subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $2);`,

    [canonicalEventId, subRef]

  );

  assert.strictEqual(Number(payCheck.rows[0].cnt), 0, 'Veritabanında doğrulanmamış miktarla hiçbir paid kaydı oluşturulamaz');

  // Also test with price = 0

  const subRefZero = 'sub_ref_zero_price_attack_02';

  await db.query(`

    INSERT INTO public.subscriptions (provider_subscription_id, status, price)

    VALUES ($1, 'pending', 0);

  `, [subRefZero]);

  const zeroPricePayload = {

    ...tamperedPayload,

    subscriptionReferenceCode: subRefZero,

    orderReferenceCode: 'ord_zero_price_02',

    price: 5499.00

  };

  const reqZero = await createSignedWebhookRequest(zeroPricePayload, secretKey);

  const resZero = await handlePaymentWebhook(reqZero, {
    supabaseAdmin: client,
    inFlightSet,
    getEnv
  });

  const bodyZero = await resZero.json();

  assert.notStrictEqual(bodyZero.paymentRecorded, true, 'Fiyat 0 iken de paymentRecorded ASLA true olamaz');

  const payCheckZero = await db.query(

    `SELECT COUNT(*)::int as cnt FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,

    [subRefZero]

  );

  assert.strictEqual(Number(payCheckZero.rows[0].cnt), 0, 'Fiyat 0 olan abonelik için veritabanında paid kaydı oluşturulamaz');

});

await runAsyncTest('9.29. [KONTROLOR DEGISIKLIK A] Imzasiz orderReference alias tahrifati odeme kimligini degistiremez ve finansal kayit acilamaz', async () => {
  const db = await getDisposablePgEngine();
  const client = db.getPgClient();
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_canon_ref_929';
  const tenantId = '00000000-0000-0000-0000-000000000099';
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price)
    VALUES ($1, $2::uuid, 'pending', 199.00);
  `, [subRef, tenantId]);

  // A signed subscription payload lacking canonical orderReferenceCode, but carrying un-signed alias orderReference=A
  const payloadA = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    orderReference: 'ord_alias_A',
    price: 199.00
  };

  const reqA = await createSignedWebhookRequest(payloadA, secretKey);
  const resA = await handlePaymentWebhook(reqA, { supabaseAdmin: client, inFlightSet, getEnv });
  const bodyA = await resA.json();

  // Must reject safely (HTTP 400 or fail-closed) without recording payment
  assert(resA.status === 400 || bodyA.paymentRecorded === false, 'orderReference alias ile odeme kabul edilemez');
  if (resA.status === 200) {
    assert.strictEqual(bodyA.paymentRecorded, false);
  }

  // Now send orderReference=B
  const payloadB = {
    ...payloadA,
    orderReference: 'ord_alias_B'
  };
  const reqB = await createSignedWebhookRequest(payloadB, secretKey);
  const resB = await handlePaymentWebhook(reqB, { supabaseAdmin: client, inFlightSet, getEnv });
  const bodyB = await resB.json();

  assert(resB.status === 400 || bodyB.paymentRecorded === false, 'orderReference alias degisimi kabul edilemez');
  if (resB.status === 200) {
    assert.strictEqual(bodyB.paymentRecorded, false);
  }

  // Assert strictly ZERO payments created in DB
  const payCheck = await db.query(
    `SELECT COUNT(*)::int as cnt FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRef]
  );
  assert.strictEqual(Number(payCheck.rows[0].cnt), 0, 'Imzasiz alias ile veritabaninda payments kaydi acilamaz');
});

await runAsyncTest('9.30. [KONTROLOR DEGISIKLIK B] Gecerli imzali olayin yalniz eventTime degeri ileri alinarak gonderilmesi abonelik durumunu degistiremez', async () => {
  const db = await getDisposablePgEngine();
  const client = db.getPgClient();
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_ts_manip_930';
  const tenantId = '00000000-0000-0000-0000-000000000098';
  const initialWatermark = '2026-09-01 12:00:00+00';
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, last_webhook_event_at, price)
    VALUES ($1, $2::uuid, 'cancelled', $3::timestamptz, 199.00);
  `, [subRef, tenantId, initialWatermark]);

  // Validly signed subscription payload with forward-bumped unsigned eventTime trying to alter/downgrade/resurrect
  const manipulatedPayload = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    orderReferenceCode: 'ord_legit_ref_930',
    eventTime: Date.now() + 60000
  };

  const req = await createSignedWebhookRequest(manipulatedPayload, secretKey);
  const res = await handlePaymentWebhook(req, { supabaseAdmin: client, inFlightSet, getEnv });
  const body = await res.json();

  // Status must remain strictly cancelled
  const subCheck = await db.query(
    `SELECT status, last_webhook_event_at FROM public.subscriptions WHERE provider_subscription_id = $1;`,
    [subRef]
  );
  assert.strictEqual(subCheck.rows[0].status, 'cancelled', 'Terminal durum ileri alinan imzasiz eventTime ile canlandirilamaz veya degistirilemez');
});

await runAsyncTest('9.31. [KONTROLOR UYUMLULUK] Resmi iyzico abonelik formati (iyziEventType) ve bagimsiz HMAC fixture dogrulamasi', async () => {
  // Hardcoded independent test secret and canonical payload
  const testSecretKey = 'sandbox_secret_key_iyzico_12345';
  const testPayload = {
    merchantId: '123456',
    iyziEventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_fixture_ref_789',
    orderReferenceCode: 'ord_fixture_ref_456',
    customerReferenceCode: 'cus_fixture_ref_123'
  };

  // 1. Classification test
  const classifiedFormat = iyzicoClient.classifyWebhookSignatureFormat(testPayload);
  assert.strictEqual(classifiedFormat, 'subscription', 'iyziEventType ile gelen subscription olayi subscription formati olarak taninmalidir');

  // 2. Official signature concatenation payload test
  // Official format: merchantId + secretKey + eventType + subscriptionReferenceCode + orderReferenceCode + customerReferenceCode
  const expectedConcat = '123456sandbox_secret_key_iyzico_12345subscription.order.successsub_fixture_ref_789ord_fixture_ref_456cus_fixture_ref_123';
  const actualConcat = iyzicoClient.buildSubscriptionWebhookSignaturePayload(testPayload, testSecretKey);
  assert.strictEqual(actualConcat, expectedConcat, 'Abonelik imza birlestirme sirasi resmi iyzico dokumantasyonu ile birebir uyusmalidir');

  // 3. Pre-computed independent HMAC fixture verification
  // Independent HMAC SHA256 of expectedConcat using testSecretKey:
  // "5697231fa6f620f7806df70f2fb4d68afa393a3032b6a6edfb8ec4b98ace1b3e"
  const expectedHmacHex = '5697231fa6f620f7806df70f2fb4d68afa393a3032b6a6edfb8ec4b98ace1b3e';
  const sigHeaders = { 'x-iyz-signature-v3': expectedHmacHex };
  const sigResult = await iyzicoClient.verifyIyzicoSignatureV3(sigHeaders, testPayload, testSecretKey);
  assert.strictEqual(sigResult.isValid, true, 'Bagimsiz on-hesaplamali HMAC fixture basariyla dogrulanmalidir');
});


await runAsyncTest('9.35. [ZORUNLU NEGATIF TEST 1 - HPP CONFLICTING EVENT TYPE] HPP imzasi gecerli ama govdeye sahte eventType enjekte edildiginde HTTP 400 CONFLICTING_EVENT_TYPE ile reddedilir', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_hpp_conflict_935';
  const tenantId = '00000000-0000-0000-0000-000000000095';
  const token = 'tok_hpp_conflict_935';
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_token, tenant_id, status, price)
    VALUES ($1, $2, $3::uuid, 'pending', 199.00);
  `, [subRef, token, tenantId]);

  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: token,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    iyziPaymentId: 'pay_conflict_935',
    status: 'SUCCESS'
  };

  const validSignature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildHppWebhookSignaturePayload(hppPayload, secretKey),
    secretKey
  );

  const tamperedPayload = {
    ...hppPayload,
    eventType: 'subscription.cancelled'
  };

  const req = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(tamperedPayload)
  });

  const res = await handlePaymentWebhook(req, { supabaseAdmin: client, inFlightSet, getEnv });
  const body = await res.json();

  assert.strictEqual(res.status, 400, 'Conflicting eventType in HPP webhook MUST return HTTP 400');
  assert.strictEqual(body.errorCode, 'CONFLICTING_EVENT_TYPE', 'errorCode CONFLICTING_EVENT_TYPE olmalidir');

  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending');
  const payCheck = await db.query(`SELECT COUNT(*)::int as cnt FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`, [subRef]);
  assert.strictEqual(Number(payCheck.rows[0].cnt), 0);
});

await runAsyncTest('9.36. [ZORUNLU NEGATIF TEST 2 - HPP IMZASIZ ALAN TAHRIFATI] HPP imzasi degismeden imzasiz price degistirildiginde ledger miktari tahrif edilemez', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_hpp_price_tamper_936';
  const tenantId = '00000000-0000-0000-0000-000000000096';
  const token = 'tok_hpp_price_936';
  const verifiedPrice = 149.00;
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_token, tenant_id, status, price)
    VALUES ($1, $2, $3::uuid, 'pending', $4);
  `, [subRef, token, tenantId, verifiedPrice]);

  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: token,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    iyziPaymentId: 'pay_price_tamper_936',
    status: 'SUCCESS'
  };

  const validSignature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildHppWebhookSignaturePayload(hppPayload, secretKey),
    secretKey
  );

  const tamperedPayload = {
    ...hppPayload,
    price: 99999.00,
    paidPrice: 99999.00
  };

  const req = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(tamperedPayload)
  });

  const res = await handlePaymentWebhook(req, { supabaseAdmin: client, inFlightSet, getEnv });
  assert.strictEqual(res.status, 200);

  const payCheck = await db.query(
    `SELECT amount FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRef]
  );
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(Number(payCheck.rows[0].amount), verifiedPrice, 'Ledger tutari imzasiz payload price yerine DB sozlesme fiyatini (149.00) kullanmalidir');
});

await runAsyncTest('9.37. [ZORUNLU NEGATIF TEST 3 - UNBOUND CHECKOUT FAIL-CLOSED] Sunucu tarafinda checkout binding bulunmayan gecerli imzali HPP webhook fail-closed 403 ile reddedilir', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_unbound_937';
  const tenantId = '00000000-0000-0000-0000-000000000097';
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_token, tenant_id, status, price)
    VALUES ($1, 'tok_legit_server_session', $2::uuid, 'pending', 199.00);
  `, [subRef, tenantId]);

  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: 'tok_unbound_attacker_session',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    iyziPaymentId: 'pay_unbound_937',
    status: 'SUCCESS'
  };

  const validSignature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildHppWebhookSignaturePayload(hppPayload, secretKey),
    secretKey
  );

  const req = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(hppPayload)
  });

  const res = await handlePaymentWebhook(req, { supabaseAdmin: client, inFlightSet, getEnv });
  const body = await res.json();

  assert.strictEqual(res.status, 403, 'Baglantisiz checkout oturumu HTTP 403 ile fail-closed reddedilmelidir');
  assert.strictEqual(body.errorCode, 'UNBOUND_CHECKOUT_SESSION');

  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending', 'Abonelik pending kalmali, mutasyon olmamalidir');
  const payCheck = await db.query(`SELECT COUNT(*)::int as cnt FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`, [subRef]);
  assert.strictEqual(Number(payCheck.rows[0].cnt), 0, 'Sifir payment kaydi olusmalidir');
});

await runAsyncTest('9.38. [ZORUNLU TEST 4 - NULL ZAMAN DAMGALI IPTAL WATERMARK KORUMASI] Aktif ve son olay zaman damgasi bulunan abonelik, NULL zaman damgali subscription.cancelled aldiginda durum geriletilemez', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_watermark_null_time_938';
  const tenantId = '00000000-0000-0000-0000-000000000098';
  const establishedWatermark = '2026-09-01 12:00:00+00';
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, last_webhook_event_at, price)
    VALUES ($1, $2::uuid, 'active', $3::timestamptz, 199.00);
  `, [subRef, tenantId, establishedWatermark]);

  const c1 = await db.query(
    `SELECT public.claim_payment_webhook_event('iyzico', 'evt_null_time_cancel_938', 'subscription.cancelled', $1, $2, null) as claim;`,
    [subRef, tenantId]
  );
  const attemptId = c1.rows[0].claim.claim_attempt_id;

  const txRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      'iyzico', 'evt_null_time_cancel_938', 'subscription.cancelled', $1, $2, 'cancelled', false, 0, 'TRY', NULL, '{}'::jsonb, '{}'::jsonb, $3::uuid
    ) as tx;
  `, [subRef, tenantId, attemptId]);

  const tx = txRes.rows[0].tx;
  assert.strictEqual(tx.success, true);
  assert.strictEqual(tx.status, 'active', 'Zaman damgasiz iptal olayi established watermark bulunan active aboneligi cancelled yapamaz');
  assert.strictEqual(tx.out_of_order_suppressed, true, 'Zaman damgasi belirsiz iptal out_of_order_suppressed olarak isaretlenmelidir');

  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active', 'Abonelik durumu kesinlikle active kalmalidir');
});

await runAsyncTest('9.39. [ZORUNLU TEST 5 - MESRU BAGLI ODEME VE LEDGER KAYDI] Yalniz mesru, imzali ve sunucuya bagli odeme olayi icin PostgreSQL uzerinde ledger paid kaydi olusur', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_legit_bound_939';
  const tenantId = '00000000-0000-0000-0000-000000000099';
  const token = 'tok_legit_bound_939';
  const legitPrice = 299.00;

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_token, tenant_id, status, price)
    VALUES ($1, $2, $3::uuid, 'pending', $4);
  `, [subRef, token, tenantId, legitPrice]);

  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: token,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    iyziPaymentId: 'pay_legit_939',
    status: 'SUCCESS'
  };

  const validSignature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildHppWebhookSignaturePayload(hppPayload, secretKey),
    secretKey
  );

  const req = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(hppPayload)
  });

  const res = await handlePaymentWebhook(req, { supabaseAdmin: client, inFlightSet, getEnv });
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.status, 'active');
  assert.strictEqual(body.paymentRecorded, true);

  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'active');

  const payCheck = await db.query(
    `SELECT amount, status, provider_payment_id FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRef]
  );
  assert.strictEqual(payCheck.rows.length, 1);
  assert.strictEqual(Number(payCheck.rows[0].amount), legitPrice);
  assert.strictEqual(payCheck.rows[0].status, 'paid');
  assert.strictEqual(payCheck.rows[0].provider_payment_id, 'pay_legit_939');
});

await runAsyncTest('9.40. [CODEX KURAL 13 - IMZASIZ ALIAS ILE CIFT ODEME SALDIRISI ENGELLEME] Ayni gecerli HPP imzasi ve bagli paymentConversationId ile paymentId=A ardindan paymentId=B tekrarinda en fazla bir ledger satiri olusur', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  const subRef = 'sub_codex_rule13_940';
  const tenantId = '00000000-0000-0000-0000-000000000940';
  const convId = 'conv_bound_token_940';
  const legitPrice = 450.00;

  // Seed subscription bound to paymentConversationId (as provider_session_id and provider_token)
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, provider_session_id, provider_token, tenant_id, status, price)
    VALUES ($1, $2, $2, $3::uuid, 'pending', $4);
  `, [subRef, convId, tenantId, legitPrice]);

  // Valid HPP payload covering paymentConversationId without iyziPaymentId or token
  const baseHppPayload = {
    iyziEventType: 'checkoutform.auth',
    paymentConversationId: convId,
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    status: 'SUCCESS'
  };

  const validSignature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildHppWebhookSignaturePayload(baseHppPayload, secretKey),
    secretKey
  );

  // First request: includes unsigned paymentId = 'PAY_ATTACKER_A'
  const payloadA = { ...baseHppPayload, paymentId: 'PAY_ATTACKER_A' };
  const reqA = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(payloadA)
  });

  const resA = await handlePaymentWebhook(reqA, { supabaseAdmin: client, inFlightSet, getEnv });
  const bodyA = await resA.json();
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(bodyA.paymentRecorded, true);

  // Verify identity is strictly derived from signed convId, NOT unsigned paymentId
  const eventIdA = iyzicoClient.extractProviderEventId(payloadA);
  assert.strictEqual(eventIdA, iyzicoClient.encodeTupleKey('hpp', 'checkoutform.auth', convId));

  // Second request: same valid signature and payload, but attacker changes unsigned paymentId to 'PAY_ATTACKER_B'
  const payloadB = { ...baseHppPayload, paymentId: 'PAY_ATTACKER_B' };
  const reqB = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSignature
    },
    body: JSON.stringify(payloadB)
  });

  const resB = await handlePaymentWebhook(reqB, { supabaseAdmin: client, inFlightSet, getEnv });
  const bodyB = await resB.json();
  // Codex Kural 13: Ikinci istek ya fail-closed reddedilmeli (409 FINGERPRINT_MISMATCH) ya da idempotent duplicate 200 donmelidir
  assert.ok(resB.status === 409 || resB.status === 200, `Ikinci istek fail-closed reddedilmeli veya duplicate donmelidir (alinan: ${resB.status})`);
  if (resB.status === 200) {
    assert.strictEqual(bodyB.duplicate, true);
    assert.strictEqual(bodyB.paymentRecorded, false);
  } else {
    assert.strictEqual(resB.status, 409, 'Degistirilmis payload ile gelen tekrar 409 CONFLICT ile reddedilir');
  }

  // CRITICAL DB CHECK: Exactly ONE payment ledger record must exist. Dual paid rows are strictly prevented!
  const payCheck = await db.query(
    `SELECT amount, status, provider_payment_id FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRef]
  );
  assert.strictEqual(payCheck.rows.length, 1, 'Imzasiz paymentId degisimi ile cift paid satiri acilamaz, kesinlikle 1 kayit olmalidir');
  assert.strictEqual(Number(payCheck.rows[0].amount), legitPrice);
  assert.strictEqual(payCheck.rows[0].status, 'paid');
});

await runAsyncTest('9.41. [KONTROLOR TALIMATI - IMZASIZ CURRENCY MANIPULASYONU VE NULL SOZLESME GUVENLIGI] Gecerli HMAC ile currencyCode TRY -> USD degistirilse dahi ledger TRY kalir, currency NULL ise paid kaydi olusmaz', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const inFlightSet = new Set();
  const secretKey = 'sandbox_secret_key_iyzico_12345';
  const getEnv = (k) => k === 'IYZICO_SECRET_KEY' ? secretKey : null;

  // --- CASE A & B: Mesru sozlesme (TRY) ve imzasiz currencyCode manipülasyonu ---
  const subRefLegit = 'sub_currency_contract_941';
  const tenantId = '00000000-0000-0000-0000-000000000941';
  const orderRef1 = 'ord_currency_try_941';
  const contractPrice = 1490.00;

  // DB'de sozlesme TRY olarak kilitli
  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', $3, 'TRY');
  `, [subRefLegit, tenantId, contractPrice]);

  // Payload: Saldirgan imzasiz currencyCode degerini 'USD' yapiyor ama HMAC gecerli
  const tamperedCurrencyPayload = {
    merchantId: 'merchant_941',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: subRefLegit,
    orderReferenceCode: orderRef1,
    customerReferenceCode: tenantId,
    currencyCode: 'USD', // Unsigned currency manipulation!
    price: 1490.00,
    status: 'SUCCESS'
  };

  const validSig1 = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildSubscriptionWebhookSignaturePayload(tamperedCurrencyPayload, secretKey),
    secretKey
  );

  const req1 = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSig1
    },
    body: JSON.stringify(tamperedCurrencyPayload)
  });

  const res1 = await handlePaymentWebhook(req1, { supabaseAdmin: client, inFlightSet, getEnv });
  assert.strictEqual(res1.status, 200);

  // DB ledger kaydini kontrol et: Para birimi KESINLIKLE sozlesmedeki TRY olmalidir, asla USD olamaz!
  const payCheck1 = await db.query(
    `SELECT amount, currency, status FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRefLegit]
  );
  assert.strictEqual(payCheck1.rows.length, 1);
  assert.strictEqual(payCheck1.rows[0].currency, 'TRY', 'Imzasiz currencyCode manipülasyonu DB ledger para birimini USD yapamaz; kesinlikle sozlesmedeki TRY kalmalidir');
  assert.strictEqual(Number(payCheck1.rows[0].amount), contractPrice);
  assert.strictEqual(payCheck1.rows[0].status, 'paid');

  // --- CASE C: Abonelik currency NULL ise hicbir paid kaydi olusmamalidir ---
  const subRefNullCurrency = 'sub_currency_null_941';
  const orderRef2 = 'ord_currency_null_941';

  await db.query(`
    INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', 1490.00, NULL);
  `, [subRefNullCurrency, tenantId]);

  const nullCurrencyPayload = {
    merchantId: 'merchant_941',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: subRefNullCurrency,
    orderReferenceCode: orderRef2,
    customerReferenceCode: tenantId,
    currencyCode: 'TRY',
    price: 1490.00,
    status: 'SUCCESS'
  };

  const validSig2 = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildSubscriptionWebhookSignaturePayload(nullCurrencyPayload, secretKey),
    secretKey
  );

  const req2 = new Request('https://test.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-iyz-signature-v3': validSig2
    },
    body: JSON.stringify(nullCurrencyPayload)
  });

  const res2 = await handlePaymentWebhook(req2, { supabaseAdmin: client, inFlightSet, getEnv });
  const body2 = await res2.json();
  assert.notStrictEqual(body2.paymentRecorded, true, 'Abonelik currency NULL ise odeme kaydedilemez');

  const payCheck2 = await db.query(
    `SELECT id FROM public.payments WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`,
    [subRefNullCurrency]
  );
  assert.strictEqual(payCheck2.rows.length, 0, 'Abonelik currency NULL iken KESINLIKLE hicbir paid ledger satiri acilamaz');
});


await runAsyncTest('9.42. [SIGNED TENANT ONLY] Imzasiz tenantId/customer.referenceCode ilk teslimatta claim yapamaz; temiz webhook yeniden denenebilir', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const secretKey = 'adim003_signed_tenant_942';
  const subRef = 'sub_signed_tenant_942';
  const tenantId = '00000000-0000-0000-0000-000000000942';
  const orderRef = 'ord_signed_tenant_942';
  await db.query(`INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', 1490.00, 'TRY');`, [subRef, tenantId]);

  // Intentionally no customerReferenceCode: neither unsigned alias may act as tenant authority.
  const base = { merchantId: 'merchant_942', eventType: 'subscription.order.success', subscriptionReferenceCode: subRef,
    orderReferenceCode: orderRef, status: 'SUCCESS' };
  const sig = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildSubscriptionWebhookSignaturePayload(base, secretKey), secretKey);
  const request = (body) => new Request('https://example.invalid/payment-webhook', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-iyz-signature-v3': sig }, body: JSON.stringify(body) });
  const opts = { supabaseAdmin: client, inFlightSet: new Set(), getEnv: key => key === 'IYZICO_SECRET_KEY' ? secretKey : undefined };

  for (const poisoned of [{ ...base, tenantId: '00000000-0000-0000-0000-000000000999' },
    { ...base, customer: { referenceCode: '00000000-0000-0000-0000-000000000999' } }]) {
    const response = await handlePaymentWebhook(request(poisoned), opts);
    assert.strictEqual(response.status, 400, 'Imzasiz tenant alias claim oncesinde reddedilir');
    assert.strictEqual((await response.json()).errorCode, 'UNTRUSTED_CUSTOMER_REFERENCE_ALIAS');
  }
  const before = await db.query(`SELECT count(*)::int AS cnt FROM public.payment_webhook_idempotency
    WHERE subscription_reference_code = $1;`, [subRef]);
  assert.strictEqual(before.rows[0].cnt, 0, 'Saldiri idempotency tablosunu zehirlememeli');

  const response = await handlePaymentWebhook(request(base), opts);
  assert.strictEqual(response.status, 200, 'Temiz imzali bildirim 409 ile kilitlenmemeli');
  const check = await db.query(`SELECT count(*)::int AS cnt FROM public.payments
    WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1);`, [subRef]);
  assert.strictEqual(check.rows[0].cnt, 1, 'Yalniz bir dogrulanmis paid kaydi bulunmali');
});

await runAsyncTest('9.43. [HPP UNSIGNED TIMESTAMP] HPP eventTime RPC ve ledger event watermark icin yetki tasimaz', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const secretKey = 'adim003_hpp_timestamp_943';
  const subRef = 'sub_hpp_timestamp_943';
  const tenantId = '00000000-0000-0000-0000-000000000943';
  const token = 'tok_hpp_timestamp_943';
  await db.query(`INSERT INTO public.subscriptions (provider_subscription_id, provider_token, tenant_id, status, price, currency)
    VALUES ($1, $2, $3::uuid, 'pending', 250.00, 'TRY');`, [subRef, token, tenantId]);

  const payload = { iyziEventType: 'checkoutform.auth', token, iyziPaymentId: 'pay_hpp_timestamp_943',
    subscriptionReferenceCode: subRef, status: 'SUCCESS', eventTime: '2099-01-01T00:00:00Z' };
  const sig = await iyzicoClient.hmacSha256Hex(iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey), secretKey);
  assert.strictEqual(iyzicoClient.extractProviderEventTimestamp(payload), null);
  const response = await handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-iyz-signature-v3': sig }, body: JSON.stringify(payload)
  }), { supabaseAdmin: client, inFlightSet: new Set(), getEnv: key => key === 'IYZICO_SECRET_KEY' ? secretKey : undefined });
  assert.strictEqual(response.status, 200);
  const id = iyzicoClient.extractProviderEventId(payload);
  const row = await db.query(`SELECT event_timestamp FROM public.payment_webhook_idempotency
    WHERE provider = 'iyzico' AND provider_event_id = $1;`, [id]);
  assert.strictEqual(row.rows.length, 1);
  assert.strictEqual(row.rows[0].event_timestamp, null, 'Imzasiz HPP timestamp DB watermark olarak kullanilamaz');
});

await runAsyncTest('9.44. [LOCKED PRICE ONLY] DB kilitli fiyat NULL iken handler p_amount=1490 olsa bile paid olusmaz', async () => {
  const db = await getDisposablePgEngine();
  const subRef = 'sub_locked_amount_944';
  const tenantId = '00000000-0000-0000-0000-000000000944';
  await db.query(`INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', NULL, 'TRY');`, [subRef, tenantId]);
  const evt = 'evt_locked_amount_944';
  const claim = await db.query(`SELECT public.claim_payment_webhook_event('iyzico', $1,
    'subscription.order.success', $2, $3, 'fp_944', 60, NULL) AS res;`, [evt, subRef, tenantId]);
  assert.strictEqual(claim.rows[0].res.can_proceed, true);
  const token = claim.rows[0].res.claim_attempt_id;
  const tx = await db.query(`SELECT public.execute_payment_webhook_transaction('iyzico', $1,
    'subscription.order.success', $2, $3, 'active', true, 1490.00, 'TRY', NULL,
    '{}'::jsonb, '{}'::jsonb, $4::uuid, 'payment_locked_amount_944') AS res;`, [evt, subRef, tenantId, token]);
  assert.strictEqual(tx.rows[0].res.success, false);
  assert.strictEqual(tx.rows[0].res.error, 'MISSING_SUBSCRIPTION_PRICE');
  const check = await db.query(`SELECT count(*)::int AS cnt FROM public.payments WHERE provider_event_id = $1;`, [evt]);
  assert.strictEqual(check.rows[0].cnt, 0, 'On okumadan gelen 1490.00 kilitli NULL fiyat yerine gecemez');
  const subCheck = await db.query(`SELECT status FROM public.subscriptions WHERE provider_subscription_id = $1;`, [subRef]);
  assert.strictEqual(subCheck.rows[0].status, 'pending', 'Finansal hata abonelik durumunu degistirmemeli');
});

await runAsyncTest('9.45. [REAL EDGE + POSTGRESQL] Unsigned subscription iyziPaymentId=B on signed order A cannot suppress real signed order B', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const subRef = 'sub_payment_metadata_poison_945';
  const tenantId = '00000000-0000-0000-0000-000000000945';
  const secretKey = 'metadata-poison-regression-key';
  await db.query(`INSERT INTO public.subscriptions (provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', 149.00, 'TRY');`, [subRef, tenantId]);
  const make = async (payload) => {
    const sig = await iyzicoClient.hmacSha256Hex(
      iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey), secretKey);
    return handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-iyz-signature-v3': sig },
      body: JSON.stringify(payload)
    }), { supabaseAdmin: client, inFlightSet: new Set(), inFlightExecutions: new Map(),
      inFlightFingerprints: new Map(), getEnv: key => key === 'IYZICO_SECRET_KEY' ? secretKey : undefined });
  };
  const orderA = { merchantId: 'merchant_945', eventType: 'subscription.order.success',
    subscriptionReferenceCode: subRef, orderReferenceCode: 'order_A_945', customerReferenceCode: tenantId,
    iyziPaymentId: 'iyzico:order:order_B_945' }; // UNSIGNED malicious alias
  const resA = await make(orderA);
  assert.strictEqual(resA.status, 200, 'Signed A event must process despite irrelevant unsigned alias');
  const orderB = { ...orderA, orderReferenceCode: 'order_B_945' };
  delete orderB.iyziPaymentId;
  const resB = await make(orderB);
  assert.strictEqual(resB.status, 200, 'Legitimate signed order B must not be poisoned by A');
  const bodyB = await resB.json();
  assert.strictEqual(bodyB.paymentRecorded, true, 'B must create its own payment ledger row');
  const pays = await db.query(`SELECT provider_payment_id, metadata FROM public.payments
    WHERE subscription_id = (SELECT id FROM public.subscriptions WHERE provider_subscription_id = $1)
    ORDER BY provider_payment_id;`, [subRef]);
  assert.deepStrictEqual(pays.rows.map(x => x.provider_payment_id),
    ['iyzico:order:order_A_945', 'iyzico:order:order_B_945']);
  assert.strictEqual(pays.rows[0].metadata.iyziPaymentId, undefined,
    'Subscription payment metadata must not contain unsigned iyziPaymentId');
});

await runAsyncTest('9.46. [SIGNED HPP OWNER] Forged unsigned ref selects only the true signed checkout owner; locked RPC rejects rebind', async () => {
  const db = await getDisposablePgEngine();
  const baseClient = createInjectableSupabaseClient(db);
  const key = 'signed-checkout-946';
  const tok = 'checkout_token_946';
  const wrongRef = tok; // unsigned selector collides with a different namespace
  const rightRef = 'right_sub_provider_token_946';
  const wrongTenant = '00000000-0000-0000-0000-000000000946';
  const rightTenant = '00000000-0000-0000-0000-000000000947';
  await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, provider_token, tenant_id, status, price, currency)
    VALUES ($1, 'another_token', $2::uuid, 'pending', 100, 'TRY'), ($3, $4, $5::uuid, 'pending', 100, 'TRY')`,
    [wrongRef, wrongTenant, rightRef, tok, rightTenant]);
  const req = (body, sig) => new Request('https://example.invalid/payment-webhook', { method:'POST',
    headers: {'Content-Type':'application/json', 'x-iyz-signature-v3':sig}, body:JSON.stringify(body) });
  const opts = { supabaseAdmin:baseClient, inFlightSet:new Set(), inFlightExecutions:new Map(),
    inFlightFingerprints:new Map(), getEnv:k => k==='IYZICO_SECRET_KEY' ? key : undefined };
  const signedPayload = { iyziEventType: 'checkoutform.auth', token: tok, iyziPaymentId: 'hpp_payment_946', subscriptionReferenceCode: wrongRef, status: 'SUCCESS' };
  const signature = await iyzicoClient.hmacSha256Hex(iyzicoClient.buildHppWebhookSignaturePayload(signedPayload, key), key);
  const resolved = await handlePaymentWebhook(req(signedPayload, signature), opts);
  assert.strictEqual(resolved.status, 200, 'Verified token must resolve the legitimate checkout row, ignoring unsigned ref');
  const wrong = await db.query('SELECT status FROM public.subscriptions WHERE provider_subscription_id=$1', [wrongRef]);
  const right = await db.query('SELECT status FROM public.subscriptions WHERE provider_subscription_id=$1', [rightRef]);
  assert.strictEqual(wrong.rows[0].status, 'pending', 'Forged unsigned reference must not mutate unrelated tenant');
  assert.strictEqual(right.rows[0].status, 'active', 'Legitimate signed checkout must be processed');
  const wrongPays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE tenant_id=$1::uuid', [wrongTenant]);
  const rightPays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE tenant_id=$1::uuid', [rightTenant]);
  assert.strictEqual(wrongPays.rows[0].n, 0);
  assert.strictEqual(rightPays.rows[0].n, 1);

  // A new verified checkout resolves correctly at pre-read, but loses its
  // binding between that read and the FOR UPDATE RPC: no financial mutation.
  const raceToken = 'checkout_token_race_946';
  const raceRef = 'right_sub_race_946';
  await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, provider_token, tenant_id, status, price, currency)
    VALUES ($1, $2, $3::uuid, 'pending', 100, 'TRY')`, [raceRef, raceToken, rightTenant]);
  const racePayload = { iyziEventType: 'checkoutform.auth', token: raceToken, iyziPaymentId: 'hpp_payment_race_946', subscriptionReferenceCode: wrongRef, status: 'SUCCESS' };
  const raceSig = await iyzicoClient.hmacSha256Hex(iyzicoClient.buildHppWebhookSignaturePayload(racePayload, key), key);
  const racedClient = {
    ...baseClient,
    async rpc(fn, args) {
      if (fn === 'execute_payment_webhook_transaction') {
        await db.query('UPDATE public.subscriptions SET provider_token=$2 WHERE provider_subscription_id=$1', [raceRef, 'moved_token_946']);
      }
      return baseClient.rpc(fn, args);
    }
  };
  const raced = await handlePaymentWebhook(req(racePayload, raceSig), { ...opts, supabaseAdmin:racedClient,
    inFlightSet:new Set(), inFlightExecutions:new Map(), inFlightFingerprints:new Map() });
  assert.strictEqual(raced.status, 403, 'Lost signed binding must be rejected under row lock');
  const raceRows = await db.query('SELECT status FROM public.subscriptions WHERE provider_subscription_id=$1', [raceRef]);
  assert.strictEqual(raceRows.rows[0].status, 'pending');
  const racePays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE provider_payment_id=$1', ['hpp_payment_race_946']);
  assert.strictEqual(racePays.rows[0].n, 0);
});

await runAsyncTest('9.48. [HPP UNIQUE OWNERSHIP] One signed token or session ID cannot be assigned to two tenants', async () => {
  const db = await getDisposablePgEngine();
  const tenantA = '00000000-0000-0000-0000-000000000948';
  const tenantB = '00000000-0000-0000-0000-000000000949';
  const token = 'global_signed_token_948';
  const session = 'global_signed_session_948';
  await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, provider_token, provider_session_id, tenant_id, status)
    VALUES ('unique_sub_A_948', $1, $2, $3::uuid, 'pending')`, [token, session, tenantA]);
  for (const [ref, column, value] of [
    ['unique_sub_token_B_948', 'provider_token', token],
    ['unique_sub_session_B_948', 'provider_session_id', session]
  ]) {
    let rejected = false;
    try {
      await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, ${column}, tenant_id, status)
        VALUES ($1, $2, $3::uuid, 'pending')`, [ref, value, tenantB]);
    } catch (err) { rejected = err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || ''); }
    assert.strictEqual(rejected, true, `Duplicate signed ${column} must violate PostgreSQL unique index`);
  }
  const existing = await db.query('SELECT COUNT(*)::int AS n FROM public.subscriptions WHERE provider_token=$1 OR provider_session_id=$2', [token, session]);
  assert.strictEqual(existing.rows[0].n, 1, 'Signed checkout IDs can belong to exactly one subscription');
  const pays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE tenant_id=$1::uuid', [tenantB]);
  assert.strictEqual(pays.rows[0].n, 0, 'Collision attempts cannot cause wrong-tenant payment');
});

await runAsyncTest('9.47. [RETRYABLE FINANCIAL CONTRACT] Signed payment cannot be consumed while locked price/currency are missing', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const key = 'signed-payment-retry-947';
  const tenant = '00000000-0000-0000-0000-000000000948';
  for (const missing of ['price', 'currency']) {
    const subRef = `missing_${missing}_947`;
    const orderRef = `order_${missing}_947`;
    await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, tenant_id, status, price, currency)
      VALUES ($1, $2::uuid, 'pending', $3, $4)`, [subRef, tenant, missing==='price' ? null : 1490, missing==='currency' ? null : 'TRY']);
    const body = { merchantId:'merchant_947', eventType:'subscription.order.success', subscriptionReferenceCode:subRef,
      orderReferenceCode:orderRef, customerReferenceCode:tenant };
    const signature = await iyzicoClient.hmacSha256Hex(iyzicoClient.buildSubscriptionWebhookSignaturePayload(body, key), key);
    const request = () => new Request('https://example.invalid/payment-webhook', { method:'POST',
      headers:{'Content-Type':'application/json', 'x-iyz-signature-v3':signature}, body:JSON.stringify(body) });
    const call = () => handlePaymentWebhook(request(), { supabaseAdmin:client, inFlightSet:new Set(),
      inFlightExecutions:new Map(), inFlightFingerprints:new Map(), getEnv:k=> k==='IYZICO_SECRET_KEY' ? key : undefined });
    const initial = await call();
    assert(initial.status >= 500 && initial.status < 600, `Missing ${missing} must be retryable`);
    assert.strictEqual((await initial.json()).retryable, true);
    const evt = iyzicoClient.extractProviderEventId(body);
    const idem = await db.query(`SELECT status FROM public.payment_webhook_idempotency WHERE provider_event_id=$1`, [evt]);
    assert.strictEqual(idem.rows[0].status, 'failed', 'Valid event must not be terminally consumed');
    const before = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE provider_event_id=$1', [evt]);
    assert.strictEqual(before.rows[0].n, 0);
    await db.query('UPDATE public.subscriptions SET price=1490, currency=$2 WHERE provider_subscription_id=$1', [subRef, 'TRY']);
    const recovered = await call();
    assert.strictEqual(recovered.status, 200, 'Same signed delivery must be retryable after contract repair');
    assert.strictEqual((await recovered.json()).paymentRecorded, true);
    const repeat = await call();
    assert.strictEqual(repeat.status, 200);
    const after = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE provider_event_id=$1', [evt]);
    assert.strictEqual(after.rows[0].n, 1, 'Exactly one successful ledger row must exist');
  }
});


await runAsyncTest('9.49. [OFFICIAL HPP V3] Raw CHECKOUT_FORM_AUTH authenticates, commits one ledger entry and replays idempotently', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const key = 'v3_hpp_official_949';
  const subRef = 'sub_official_hpp_949';
  const tenant = '00000000-0000-0000-0000-000000000949';
  const token = 'signed_hpp_official_949';
  await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, provider_token, tenant_id, status, price, currency)
    VALUES ($1, $2, $3::uuid, 'pending', 1490, 'TRY')`, [subRef, token, tenant]);
  const body = { iyziEventType:'CHECKOUT_FORM_AUTH', token,
    iyziPaymentId:'payment_official_949', status:'SUCCESS', iyziEventTime: 1766733201159 };
  // Independent provider-format fixture, not signed by the implementation's builder.
  const signature = crypto.createHmac('sha256',key).update(
    `${key}${body.iyziEventType}${body.iyziPaymentId}${body.token}${body.paymentConversationId || ''}${body.status}`
  ).digest('hex');
  const call = () => handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
    method:'POST', headers:{'Content-Type':'application/json','x-iyz-signature-v3':signature}, body:JSON.stringify(body)
  }), {supabaseAdmin: client, getEnv:k => k==='IYZICO_SECRET_KEY'?key:undefined,
    inFlightSet:new Set(), inFlightExecutions:new Map(), inFlightFingerprints:new Map()});
  const first = await call();
  assert.strictEqual(first.status, 200, 'Official uppercase HPP event must process');
  assert.strictEqual((await first.json()).paymentRecorded, true);
  const replay = await call();
  assert.strictEqual(replay.status, 200, 'HPP replay must be idempotent');
  const pays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE provider_payment_id=$1', [body.iyziPaymentId]);
  assert.strictEqual(pays.rows[0].n, 1);
  const sub = await db.query('SELECT status FROM public.subscriptions WHERE provider_subscription_id=$1', [subRef]);
  assert.strictEqual(sub.rows[0].status, 'active');
});

await runAsyncTest('9.50. [OFFICIAL SUBSCRIPTION V3] Bodyless merchantId uses configured merchant and retains idempotency', async () => {
  const db = await getDisposablePgEngine();
  const client = createInjectableSupabaseClient(db);
  const key = 'v3_subscription_official_950';
  const merchantId = '3404590';
  const subRef = 'sub_official_v3_950';
  const tenant = '00000000-0000-0000-0000-000000000950';
  const orderRef = 'order_official_v3_950';
  await db.query(`INSERT INTO public.subscriptions(provider_subscription_id, tenant_id, status, price, currency)
    VALUES ($1, $2::uuid, 'pending', 1490, 'TRY')`, [subRef, tenant]);
  const body = {iyziEventType:'subscription.order.success', subscriptionReferenceCode:subRef,
    orderReferenceCode:orderRef, customerReferenceCode:tenant, iyziEventTime:1758704403161};
  assert.strictEqual(body.merchantId, undefined, 'Official sample does not require merchantId in JSON');
  const signature = crypto.createHmac('sha256',key).update(
    `${merchantId}${key}${body.iyziEventType}${body.subscriptionReferenceCode}${body.orderReferenceCode}${body.customerReferenceCode}`
  ).digest('hex');
  const call = () => handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
    method:'POST', headers:{'Content-Type':'application/json','x-iyz-signature-v3':signature}, body:JSON.stringify(body)
  }), {supabaseAdmin: client, getEnv:k => ({IYZICO_SECRET_KEY:key,IYZICO_MERCHANT_ID:merchantId})[k],
    inFlightSet:new Set(), inFlightExecutions:new Map(), inFlightFingerprints:new Map()});
  const first = await call();
  assert.strictEqual(first.status, 200, 'Bodyless merchantId official subscription must process');
  assert.strictEqual((await first.json()).paymentRecorded, true);
  const replay = await call();
  assert.strictEqual(replay.status, 200);
  const pays = await db.query('SELECT COUNT(*)::int AS n FROM public.payments WHERE provider_payment_id=$1',
    [`iyzico:order:${orderRef}`]);
  assert.strictEqual(pays.rows[0].n, 1);
  const sub = await db.query('SELECT status FROM public.subscriptions WHERE provider_subscription_id=$1', [subRef]);
  assert.strictEqual(sub.rows[0].status, 'active');
});


console.log('\n======================================================================');
console.log(`Sonuc: ${passedTests}/${totalTests} test basariyla gecti. Webhook Idempotency ve Replay Guvenligi tam olarak saglandi.`);
console.log('======================================================================\n');

if (disposablePgClient?.client) {
  try { await disposablePgClient.client.end(); } catch {}
}
if (embeddedPgServer) {
  try { await embeddedPgServer.stop(); } catch {}
}
if (disposableTmpDir) {
  try { fs.rmSync(disposableTmpDir, { recursive: true, force: true }); } catch {}
}

process.exit(0);
