import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import {
  handlePaymentWebhook,
  isSensitiveKey,
  sanitizeString,
  sanitizeObject,
  createSafeErrorResponse,
  safeLogger
} from '../supabase/functions/payment-webhook/index.ts';

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

console.log('================================================================================');
console.log('=== LARI [LARI-PILOT3-004] Veritabani Hata Yonetimi ve Guvenli Loglar QA ===');
console.log('================================================================================\n');

// ---------------------------------------------------------------------------
// 1. STATIK VE MİMARİ DOĞRULAMA (Static Code & Policy Verification)
// ---------------------------------------------------------------------------
const webhookIndexPath = path.join(rootDir, 'supabase', 'functions', 'payment-webhook', 'index.ts');
const webhookIndexContent = fs.readFileSync(webhookIndexPath, 'utf8');

runTest('1.1. payment-webhook/index.ts PII sanitization fonksiyonlarini export ediyor', () => {
  assert.strictEqual(typeof isSensitiveKey, 'function', 'isSensitiveKey fonksiyonu bulunamadi');
  assert.strictEqual(typeof sanitizeString, 'function', 'sanitizeString fonksiyonu bulunamadi');
  assert.strictEqual(typeof sanitizeObject, 'function', 'sanitizeObject fonksiyonu bulunamadi');
  assert.strictEqual(typeof createSafeErrorResponse, 'function', 'createSafeErrorResponse fonksiyonu bulunamadi');
  assert(typeof safeLogger === 'object' && safeLogger !== null, 'safeLogger nesnesi bulunamadi');
});

runTest('1.2. payment-webhook/index.ts DB hata kodlarini kontrollu hata olarak tanimliyor', () => {
  assert(webhookIndexContent.includes('AUDIT_LOG_INSERT_FAILED'), 'AUDIT_LOG_INSERT_FAILED hata kontrolu bulunamadi');
  assert(webhookIndexContent.includes('SUBSCRIPTION_UPDATE_FAILED'), 'SUBSCRIPTION_UPDATE_FAILED hata kontrolu bulunamadi');
  assert(webhookIndexContent.includes('PAYMENT_INSERT_FAILED'), 'PAYMENT_INSERT_FAILED hata kontrolu bulunamadi');
  assert(webhookIndexContent.includes('SUBSCRIPTION_NOT_YET_PROVISIONED'), 'SUBSCRIPTION_NOT_YET_PROVISIONED kontrolu bulunamadi');
  assert(webhookIndexContent.includes('TENANT_MISMATCH'), 'TENANT_MISMATCH kontrolu bulunamadi');
});

// ---------------------------------------------------------------------------
// 2. PII VE GÜVENLİ LOG SANITIZATION BİRİM TESTLERİ (Unit Tests)
// ---------------------------------------------------------------------------
runTest('2.1. isSensitiveKey: Hassas anahtar isimlerini dogru tespit eder', () => {
  const sensitiveKeys = [
    'password', 'passWord', 'secret', 'apiKey', 'api_key', 'authorization', 'bearer',
    'token', 'x-iyz-signature', 'signature', 'hash', 'salt', 'cardNumber', 'pan',
    'cvv', 'cvc', 'securityCode', 'expiryMonth', 'expiryYear', 'email', 'phone',
    'gsmNumber', 'mobile', 'identityNumber', 'tckn', 'tcKimlik', 'vkn', 'taxNumber',
    'iban', 'accountNumber', 'billingAddress', 'shippingAddress', 'buyer', 'customer',
    'clientIp', 'firstName', 'lastName', 'fullName', 'city', 'zipCode'
  ];
  for (const k of sensitiveKeys) {
    assert(isSensitiveKey(k), `Hassas anahtar tespit edilemedi: ${k}`);
  }
});

runTest('2.2. isSensitiveKey: Yapisal ve guvenli meta alanlarini maskelemez', () => {
  const safeKeys = [
    'functionName', 'eventType', 'iyziEventType', 'status', 'subscriptionStatus',
    'provider', 'reason', 'code', 'errorCode', 'error', 'message', 'received',
    'duplicate', 'idempotent', 'paymentRecorded', 'providerEventId', 'providerPaymentId',
    'orderReferenceCode', 'subscriptionReferenceCode', 'hasPaymentProof', 'action',
    'details', 'created_at', 'updated_at', 'paid_at', 'finalized', 'retryable', 'verified'
  ];
  for (const k of safeKeys) {
    assert(!isSensitiveKey(k), `Guvenli anahtar yanlislikla hassas olarak isaretlendi: ${k}`);
  }
});

runTest('2.3. sanitizeString: Kart numaralari, CVV, token ve kisisel verileri maskeler', () => {
  const raw1 = 'Customer card 4111 2222 3333 4444 with cvv: 123 and email user@example.com';
  const clean1 = sanitizeString(raw1);
  assert(!clean1.includes('4111 2222 3333 4444'), 'Kart numarasi maskelenmedi');
  assert(!clean1.includes('user@example.com'), 'Email maskelenmedi');
  assert(clean1.includes('[REDACTED_CARD]'), 'Kart maske etiketi eksik');
  assert(clean1.includes('[REDACTED_EMAIL]'), 'Email maske etiketi eksik');

  const raw2 = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcNVBpEr7l0CE1qD7QwfJodOmxQqWmuf3zOXb8 Header with TCKN 12345678901 and TR330006100511123456789012';
  const clean2 = sanitizeString(raw2);
  assert(!clean2.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'JWT token maskelenmedi');
  assert(!clean2.includes('12345678901'), 'TCKN maskelenmedi');
  assert(!clean2.includes('TR330006100511123456789012'), 'IBAN maskelenmedi');
  assert(clean2.includes('[REDACTED_TOKEN]'), 'Bearer token maske etiketi eksik');
  assert(clean2.includes('[REDACTED_ID]') || clean2.includes('[REDACTED_PHONE]'), 'Kimlik/telefon maske etiketi eksik');
  assert(clean2.includes('[REDACTED_IBAN]'), 'IBAN maske etiketi eksik');
});

runTest('2.4. sanitizeObject: Derin nesne ve dizilerdeki hassas verileri temizler', () => {
  const inputObj = {
    eventType: 'payment.success',
    status: 'success',
    orderReferenceCode: 'order_ref_123',
    customer: {
      name: 'Ahmet',
      surname: 'Yilmaz',
      email: 'ahmet@example.com',
      identityNumber: '11111111110',
      gsmNumber: '+905551234567'
    },
    paymentCard: {
      cardNumber: '5528790000000001',
      cvv: '999',
      cardHolderName: 'Ahmet Yilmaz'
    },
    authHeaders: {
      authorization: 'Bearer secret_token_xyz',
      apiKey: 'AIzaSyA_test_api_key_123456789012'
    },
    items: [
      { id: 1, name: 'Standard Plan', price: 350.00 },
      { id: 2, name: 'Secret Extra', token: 'item_token_abc' }
    ]
  };

  const cleanObj = sanitizeObject(inputObj);

  // Orijinal nesne degismemeli (immutability)
  assert.strictEqual(inputObj.customer.email, 'ahmet@example.com', 'Orijinal nesne mutasyona ugradi');

  // Yapisal alanlar korunmali
  assert.strictEqual(cleanObj.eventType, 'payment.success');
  assert.strictEqual(cleanObj.status, 'success');
  assert.strictEqual(cleanObj.orderReferenceCode, 'order_ref_123');
  assert.strictEqual(cleanObj.items[0].price, 350.00);

  // Hassas alanlar ve nesneler maskelenmeli
  assert.strictEqual(cleanObj.customer, '[REDACTED]');
  assert.strictEqual(cleanObj.paymentCard, '[REDACTED]');
  assert.strictEqual(cleanObj.authHeaders, '[REDACTED]');
  assert.strictEqual(cleanObj.items[1].token, '[REDACTED]');
});

runTest('2.5. createSafeErrorResponse: Structured error olusturur ve PII sizdirmaz', async () => {
  const resp = createSafeErrorResponse(
    500,
    'Database error while processing payment for card 4111222233334444 and email test@user.com',
    'PAYMENT_INSERT_FAILED',
    {
      secretKey: 'my_super_secret',
      token: 'jwt_token_1234567890',
      retryable: true,
      safeMetric: 42
    }
  );

  assert.strictEqual(resp.status, 500);
  assert.strictEqual(resp.headers.get('Content-Type'), 'application/json');

  const body = await resp.json();
  assert.strictEqual(body.errorCode, 'PAYMENT_INSERT_FAILED');
  assert(!body.error.includes('4111222233334444'), 'Hata mesajinda kart numarasi yer alamaz');
  assert(!body.error.includes('test@user.com'), 'Hata mesajinda email yer alamaz');
  assert.strictEqual(body.retryable, true);
  assert.strictEqual(body.safeMetric, 42);
  assert.strictEqual(body.secretKey, '[REDACTED]');
  assert.strictEqual(body.token, '[REDACTED]');
});

runTest('2.6. safeLogger: Serbest metin message ve error nesnelerindeki sentinelleri maskeler', () => {
  const logs = [];
  const origErr = console.error;
  console.error = (...args) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };

  try {
    safeLogger.error({
      message: 'payments insert failed with client_secret AIzaSyD_Secret_123456',
      code: '23505'
    });
    safeLogger.error({
      error: 'custom error with arbitrary_sentinel_xyz123',
      errorCode: 'CUSTOM_ERR'
    });
    safeLogger.error(new Error('unhandled error with secret_token_abc'));

    const joined = logs.join('\n');
    assert(!joined.includes('AIzaSyD_Secret_123456'), 'safeLogger message alanindaki API anahtarini sizdirdi');
    assert(!joined.includes('arbitrary_sentinel_xyz123'), 'safeLogger error alanindaki serbest metin sentineli sizdirdi');
    assert(!joined.includes('secret_token_abc'), 'safeLogger Error mesajindaki sirri sizdirdi');
  } finally {
    console.error = origErr;
  }
});

// ---------------------------------------------------------------------------
// 3. MOCK DATABASE İLE HATA YÖNETİMİ DALLARI (Fail-Safe Error Management)
// ---------------------------------------------------------------------------
function createMockSupabase(overrides = {}) {
  const state = {
    auditLogs: [],
    subscriptions: [
      {
        id: 'sub_uuid_001',
        provider_subscription_id: 'sub_ref_db_err_01',
        tenant_id: 'tenant_uuid_001',
        status: 'pending',
        price: 350.00,
        currency: 'TRY',
        provider_token: 'tok_db_err_01',
        provider_session_id: 'conv_db_err_01'
      }
    ],
    payments: [],
    idempotency: []
  };

  const client = {
    from: (table) => {
      if (overrides[table]) {
        return overrides[table](state);
      }

      if (table === 'subscriptions') {
        return {
          select: (cols) => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                const found = state.subscriptions.find((s) => s[col] === val);
                return { data: found || null, error: null };
              }
            })
          }),
          update: (fields) => ({
            eq: (col, val) => {
              const exec = async () => {
                const item = state.subscriptions.find((s) => s[col] === val);
                if (item) Object.assign(item, fields);
                return { data: item || null, error: null };
              };
              return {
                select: () => ({
                  single: exec,
                  maybeSingle: exec
                }),
                then: (resolve, reject) => exec().then(resolve, reject)
              };
            }
          })
        };
      }

      if (table === 'audit_logs') {
        return {
          insert: async (row) => {
            state.auditLogs.push(row);
            return { data: row, error: null };
          }
        };
      }

      if (table === 'payments') {
        return {
          insert: (row) => {
            const exec = async () => {
              state.payments.push(row);
              return { data: { id: 'pay_gen_uuid_001', ...row }, error: null };
            };
            return {
              select: () => ({
                single: exec,
                maybeSingle: exec
              }),
              then: (resolve, reject) => exec().then(resolve, reject)
            };
          }
        };
      }

      if (table === 'payment_webhook_idempotency') {
        return {
          select: () => ({
            eq: (c1, v1) => ({
              eq: (c2, v2) => ({
                maybeSingle: async () => {
                  const found = state.idempotency.find((i) => i[c1] === v1 && i[c2] === v2);
                  return { data: found || null, error: null };
                }
              })
            })
          }),
          insert: async (row) => {
            state.idempotency.push(row);
            return { data: row, error: null };
          },
          update: (fields) => ({
            eq: (c1, v1) => {
              const eq2 = (c2, v2) => {
                const exec = async () => {
                  const item = state.idempotency.find((i) => i[c1] === v1 && i[c2] === v2);
                  if (item) Object.assign(item, fields);
                  return { data: item || null, error: null };
                };
                return {
                  select: () => ({
                    single: exec,
                    maybeSingle: exec
                  }),
                  then: (resolve, reject) => exec().then(resolve, reject)
                };
              };
              return {
                eq: eq2,
                then: (resolve, reject) => {
                  const exec = async () => {
                    const item = state.idempotency.find((i) => i[c1] === v1);
                    if (item) Object.assign(item, fields);
                    return { data: item || null, error: null };
                  };
                  return exec().then(resolve, reject);
                }
              };
            }
          })
        };
      }

      throw new Error(`Bilinmeyen tablo: ${table}`);
    },
    rpc: overrides.rpc ? overrides.rpc(state) : async (name, params) => {
      if (name === 'claim_payment_webhook_event') {
        const attemptId = 'claim_attempt_' + crypto.randomUUID();
        const record = {
          provider: params?.p_provider || 'iyzico',
          provider_event_id: params?.p_provider_event_id,
          status: 'processing',
          claim_attempt_id: attemptId,
          response_payload: null
        };
        state.idempotency.push(record);
        return {
          data: {
            can_proceed: true,
            is_duplicate: false,
            claim_attempt_id: attemptId,
            status: 'processing'
          },
          error: null
        };
      }
      if (name === 'execute_payment_webhook_transaction') {
        if (overrides.txError) {
          return {
            data: {
              success: false,
              error: overrides.txError,
              retryable: overrides.retryable ?? true
            },
            error: null
          };
        }
        if (overrides.txErr) {
          return { data: null, error: overrides.txErr };
        }
        const sub = state.subscriptions.find((s) => s.provider_subscription_id === params?.p_subscription_reference_code);
        if (!sub) {
          return { data: { success: false, error: 'SUBSCRIPTION_NOT_FOUND', retryable: true }, error: null };
        }
        if (params?.p_tenant_id && sub.tenant_id !== params?.p_tenant_id) {
          return {
            data: {
              success: false,
              error: 'TENANT_MISMATCH',
              retryable: false,
              current_subscription_status: sub.status
            },
            error: null
          };
        }
        sub.status = params?.p_target_status || 'active';
        state.payments.push({
          id: 'pay_gen_' + crypto.randomUUID(),
          subscription_id: sub.id,
          provider_event_id: params?.p_provider_event_id,
          amount: params?.p_amount,
          currency: params?.p_currency,
          status: 'paid'
        });
        state.auditLogs.push({
          tenant_id: sub.tenant_id,
          action: 'payment_webhook',
          details: { eventType: params?.p_event_type }
        });
        const idem = state.idempotency.find((i) => i.provider_event_id === params?.p_provider_event_id);
        if (idem) {
          idem.status = 'processed';
          idem.response_payload = { received: true, status: sub.status, paymentRecorded: true };
        }
        return {
          data: {
            success: true,
            status: sub.status,
            payment_recorded: true
          },
          error: null
        };
      }
      if (name === 'finalize_payment_webhook_event') {
        const item = state.idempotency.find((i) => i.provider === params?.p_provider && i.provider_event_id === params?.p_provider_event_id);
        if (item) {
          item.status = params?.p_status;
          item.response_payload = params?.p_response_payload;
        }
        return { data: { finalized: true }, error: null };
      }
      return { data: null, error: null };
    }
  };

  return { client, state };
}

async function buildSignedWebhookRequest(payload, secretKey = 'test_secret_qa_004', merchantId = 'test_merchant_004') {
  const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
  let message;
  if (format === 'subscription') {
    if (!payload.merchantId) {
      payload.merchantId = merchantId;
    }
    message = iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secretKey, payload.merchantId);
  } else {
    message = iyzicoClient.buildHppWebhookSignaturePayload(payload, secretKey);
  }
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

async function buildSignedHppRequest(payload, secretKey = 'test_secret_qa_004') {
  return buildSignedWebhookRequest(payload, secretKey);
}

async function buildSignedSubscriptionRequest(payload, secretKey = 'test_secret_qa_004', merchantId = 'test_merchant_004') {
  return buildSignedWebhookRequest(payload, secretKey, merchantId);
}

await runAsyncTest('3.1. [FAIL-SAFE AUDIT LOG] RPC AUDIT_LOG_INSERT_FAILED hatasinda sahte 200 donulmez, 500 AUDIT_LOG_INSERT_FAILED donulur ve DB degisikligi yapilmaz', async () => {
  const { client, state } = createMockSupabase({
    txError: 'AUDIT_LOG_INSERT_FAILED'
  });

  const payload = {
    iyziEventType: 'checkoutform.auth',
    status: 'SUCCESS',
    token: 'tok_db_err_01',
    paymentConversationId: 'conv_db_err_01',
    iyziPaymentId: 'pay_audit_fail_01',
    paidPrice: 350.00
  };

  const req = await buildSignedHppRequest(payload);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    inFlightSet: new Set(),
    getEnv: (k) => (k === 'IYZICO_SECRET_KEY' ? 'test_secret_qa_004' : undefined)
  });

  assert.strictEqual(res.status, 500, 'Audit log hatasinda sahte 200 donulmemeli, HTTP 500 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'AUDIT_LOG_INSERT_FAILED', 'Hata kodu AUDIT_LOG_INSERT_FAILED olmalidir');
  assert.strictEqual(body.retryable, true, 'Audit log hatasi retryable olmalidir');
  assert.strictEqual(state.payments.length, 0, 'Audit log hatasinda payment kaydedilmemelidir');
  assert.strictEqual(state.subscriptions[0].status, 'pending', 'Audit log hatasinda subscription durumu pending kalmalidir');
});

await runAsyncTest('3.2. [FAIL-SAFE SUBSCRIPTION UPDATE] RPC SUBSCRIPTION_UPDATE_FAILED hatasinda sahte 200 donulmez, 500 SUBSCRIPTION_UPDATE_FAILED donulur ve DB degisikligi yapilmaz', async () => {
  const { client, state } = createMockSupabase({
    txError: 'SUBSCRIPTION_UPDATE_FAILED'
  });

  const payload = {
    iyziEventType: 'checkoutform.auth',
    status: 'SUCCESS',
    token: 'tok_db_err_01',
    paymentConversationId: 'conv_db_err_01',
    iyziPaymentId: 'pay_sub_fail_01',
    paidPrice: 350.00
  };

  const req = await buildSignedHppRequest(payload);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    inFlightSet: new Set(),
    getEnv: (k) => (k === 'IYZICO_SECRET_KEY' ? 'test_secret_qa_004' : undefined)
  });

  assert.strictEqual(res.status, 500, 'Abonelik guncelleme hatasinda sahte 200 donulmemeli, HTTP 500 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'SUBSCRIPTION_UPDATE_FAILED', 'Hata kodu SUBSCRIPTION_UPDATE_FAILED olmalidir');
  assert.strictEqual(state.payments.length, 0, 'Abonelik guncellenemezse odeme olusturulmamalidir');
  assert.strictEqual(state.subscriptions[0].status, 'pending', 'Abonelik durumu pending kalmalidir');
});

await runAsyncTest('3.3. [FAIL-SAFE PAYMENT INSERT] RPC PAYMENT_INSERT_FAILED hatasinda sahte 200 donulmez, 500 PAYMENT_INSERT_FAILED donulur ve DB degisikligi yapilmaz', async () => {
  const { client, state } = createMockSupabase({
    txError: 'PAYMENT_INSERT_FAILED'
  });

  const payload = {
    iyziEventType: 'checkoutform.auth',
    status: 'SUCCESS',
    token: 'tok_db_err_01',
    paymentConversationId: 'conv_db_err_01',
    iyziPaymentId: 'pay_insert_fail_01',
    paidPrice: 350.00
  };

  const req = await buildSignedHppRequest(payload);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: client,
    inFlightSet: new Set(),
    getEnv: (k) => (k === 'IYZICO_SECRET_KEY' ? 'test_secret_qa_004' : undefined)
  });

  assert.strictEqual(res.status, 500, 'Odeme ekleme hatasinda sahte 200 donulmemeli, HTTP 500 donmelidir');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'PAYMENT_INSERT_FAILED', 'Hata kodu PAYMENT_INSERT_FAILED olmalidir');
  assert.strictEqual(state.payments.length, 0, 'Odeme ekleme hatasinda payment kaydedilmemelidir');
  assert.strictEqual(state.subscriptions[0].status, 'pending', 'Abonelik durumu pending kalmalidir');
});

await runAsyncTest('3.4. [BILINMEYEN ABONELIK GUVENLI RET] Veritabaninda henuz acilmamis abonelik durumunda retryable 503 SUBSCRIPTION_NOT_YET_PROVISIONED donulur ve PII sizmaz', async () => {
  const interceptedLogs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.warn = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.error = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };

  try {
    const { client, state } = createMockSupabase();

    const piiCustomerName = 'AhmetYilmaz';
    const sentinelSubRef = `sub-customer-${piiCustomerName}-999`;
    const sentinelOrderRef = `order-${piiCustomerName}-001`;

    // Subscription formatindaki event henuz DB'de bulunmayan bir provider_subscription_id referansi iceriyor
    const payload = {
      merchantId: 'test_merchant_004',
      iyziEventType: 'subscription.order.success',
      status: 'SUCCESS',
      subscriptionReferenceCode: sentinelSubRef,
      orderReferenceCode: sentinelOrderRef
    };

    const req = await buildSignedSubscriptionRequest(payload);

    const res = await handlePaymentWebhook(req, {
      supabaseAdmin: client,
      inFlightSet: new Set(),
      getEnv: (k) => {
        if (k === 'IYZICO_SECRET_KEY') return 'test_secret_qa_004';
        if (k === 'IYZICO_MERCHANT_ID') return 'test_merchant_004';
        return undefined;
      }
    });

    assert.strictEqual(res.status, 503, 'Bilinmeyen abonelikte 200 donulmemeli, retryable 503 donmelidir');
    const resText = await res.text();
    const body = JSON.parse(resText);
    assert.strictEqual(body.errorCode, 'SUBSCRIPTION_NOT_YET_PROVISIONED');
    assert.strictEqual(body.retryable, true);
    assert.strictEqual(body.finalized, true, 'Idempotency tablosunda failed olarak finalize edilmelidir');
    assert.strictEqual(body.referenceCode, undefined, 'Bilinmeyen abonelik yanitinda referenceCode yer alamaz');

    const joinedLogs = interceptedLogs.join('\n');
    const finalPayload = state.idempotency[0]?.response_payload || {};
    const finalPayloadStr = JSON.stringify(finalPayload);

    // Negative verification: PII sentinel ve referans kodlari response, log ve finalize payload'a sizamaz
    assert(!resText.includes(piiCustomerName), `Response body icerisinde PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!resText.includes(sentinelSubRef), `Response body icerisinde subscriptionReferenceCode yer alamaz`);
    assert(!resText.includes(sentinelOrderRef), `Response body icerisinde orderReferenceCode yer alamaz`);

    assert(!joinedLogs.includes(piiCustomerName), `Konsol loglarinda PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!joinedLogs.includes(sentinelSubRef), `Konsol loglarinda subscriptionReferenceCode yer alamaz`);
    assert(!joinedLogs.includes(sentinelOrderRef), `Konsol loglarinda orderReferenceCode yer alamaz`);

    assert(!finalPayloadStr.includes(piiCustomerName), `Finalize payload icerisinde PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!finalPayloadStr.includes(sentinelSubRef), `Finalize payload icerisinde subscriptionReferenceCode yer alamaz`);
    assert(!finalPayloadStr.includes(sentinelOrderRef), `Finalize payload icerisinde orderReferenceCode yer alamaz`);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
});

await runAsyncTest('3.5. [TENANT MISMATCH GUVENLI RET] Payload tenant uyuşmazlığında HTTP 403 ve duplicate_suppressed guvenli ret gerceklesir ve PII sizmaz', async () => {
  const interceptedLogs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.warn = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.error = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };

  try {
    const piiCustomerName = 'MehmetDemir';
    const sentinelSubRef = `sub-customer-${piiCustomerName}-777`;
    const sentinelOrderRef = `order-${piiCustomerName}-002`;

    const { client, state } = createMockSupabase();
    state.subscriptions[0].provider_subscription_id = sentinelSubRef;

    const payload = {
      merchantId: 'test_merchant_004',
      iyziEventType: 'subscription.order.success',
      status: 'SUCCESS',
      subscriptionReferenceCode: sentinelSubRef,
      orderReferenceCode: sentinelOrderRef,
      customerReferenceCode: `tenant_uuid_ATTACKER_${piiCustomerName}` // DB'deki tenant_uuid_001 ile uyusmuyor
    };

    const req = await buildSignedSubscriptionRequest(payload);

    const res = await handlePaymentWebhook(req, {
      supabaseAdmin: client,
      inFlightSet: new Set(),
      getEnv: (k) => {
        if (k === 'IYZICO_SECRET_KEY') return 'test_secret_qa_004';
        if (k === 'IYZICO_MERCHANT_ID') return 'test_merchant_004';
        return undefined;
      }
    });

    assert.strictEqual(res.status, 403, 'Tenant uyusmazliginda 403 Forbidden donulmelidir');
    const resText = await res.text();
    const body = JSON.parse(resText);
    assert.strictEqual(body.errorCode, 'TENANT_MISMATCH');
    assert.strictEqual(body.finalized, true);
    assert.strictEqual(state.payments.length, 0, 'Tenant uyusmazliginda odeme acilamaz');

    const joinedLogs = interceptedLogs.join('\n');
    const suppressedItem = state.idempotency.find((i) => i.status === 'duplicate_suppressed');
    const finalPayload = suppressedItem?.response_payload || {};
    const finalPayloadStr = JSON.stringify(finalPayload);

    // Negative verification: PII sentinel ve referans kodlari response, log ve finalize payload'a sizamaz
    assert(!resText.includes(piiCustomerName), `Tenant mismatch response icerisinde PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!resText.includes(sentinelSubRef), `Tenant mismatch response icerisinde subscriptionReferenceCode yer alamaz`);
    assert(!resText.includes(sentinelOrderRef), `Tenant mismatch response icerisinde orderReferenceCode yer alamaz`);

    assert(!joinedLogs.includes(piiCustomerName), `Tenant mismatch loglarinda PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!joinedLogs.includes(sentinelSubRef), `Tenant mismatch loglarinda subscriptionReferenceCode yer alamaz`);
    assert(!joinedLogs.includes(sentinelOrderRef), `Tenant mismatch loglarinda orderReferenceCode yer alamaz`);

    assert(!finalPayloadStr.includes(piiCustomerName), `Finalize payload icerisinde PII sentinel (${piiCustomerName}) yer alamaz`);
    assert(!finalPayloadStr.includes(sentinelSubRef), `Finalize payload icerisinde subscriptionReferenceCode yer alamaz`);
    assert(!finalPayloadStr.includes(sentinelOrderRef), `Finalize payload icerisinde orderReferenceCode yer alamaz`);
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
});

await runAsyncTest('3.6. [LOGLARDA VE YANITLARDA SIFIR PII GUVENCESI] Tum hata akislarinda log, response ve finalize payload icerisinde PII / sır sizintisi yoktur', async () => {
  const interceptedLogs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.warn = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };
  console.error = (...args) => { interceptedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); };

  try {
    const sentinelToken = 'AIzaSyD_Secret_123456';
    const sentinelRegexOut = 'UNEXPECTED_ARBITRARY_SECRET_SENTINEL_789';
    const piiCustomerName = 'AyseFatmaYildiz';
    const sentinelSubRef = `sub-customer-${piiCustomerName}-555`;
    const sentinelOrderRef = `order-${piiCustomerName}-666`;

    // 1. HPP format DB payment insert error flow
    {
      const { client, state } = createMockSupabase({
        txErr: {
          message: `payments insert failed with PAN 5528790012345678, CVV: 456, client_secret ${sentinelToken}, sentinel ${sentinelRegexOut} and email victim@salon.com`,
          code: 'PAYMENT_INSERT_FAILED'
        }
      });

      const payload = {
        iyziEventType: 'checkoutform.auth',
        status: 'SUCCESS',
        token: 'tok_db_err_01',
        paymentConversationId: 'conv_db_err_01',
        iyziPaymentId: 'pay_leak_test_01',
        paidPrice: 350.00,
        customerEmail: 'victim@salon.com',
        cardPan: '5528790012345678'
      };

      const req = await buildSignedHppRequest(payload);
      const res = await handlePaymentWebhook(req, {
        supabaseAdmin: client,
        inFlightSet: new Set(),
        getEnv: (k) => (k === 'IYZICO_SECRET_KEY' ? 'test_secret_qa_004' : undefined)
      });

      const resBody = await res.text();
      const joinedLogs = interceptedLogs.join('\n');
      const finalPayload = state.idempotency[0]?.response_payload || {};
      const finalPayloadStr = JSON.stringify(finalPayload);

      // Yanıt metninde hiçbir hassas veri veya sentinel olmamalı
      assert(!resBody.includes('5528790012345678'), 'Response body icerisinde kredi karti yer alamaz');
      assert(!resBody.includes('victim@salon.com'), 'Response body icerisinde email yer alamaz');
      assert(!resBody.includes(sentinelToken), 'Response body icerisinde API key yer alamaz');
      assert(!resBody.includes(sentinelRegexOut), 'Response body icerisinde regex disi sentinel yer alamaz');

      // Konsol loglarinda hiçbir hassas veri veya sentinel olmamalı
      assert(!joinedLogs.includes('5528790012345678'), 'Konsol loglarinda kredi karti yer alamaz');
      assert(!joinedLogs.includes('victim@salon.com'), 'Konsol loglarinda email yer alamaz');
      assert(!joinedLogs.includes(sentinelToken), 'Konsol loglarinda API anahtari yer alamaz');
      assert(!joinedLogs.includes(sentinelRegexOut), 'Konsol loglarinda regex disi sentinel yer alamaz');

      // Finalize payload icerisinde hiçbir hassas veri veya sentinel olmamalı
      assert(!finalPayloadStr.includes('5528790012345678'), 'Finalize payload icerisinde kredi karti yer alamaz');
      assert(!finalPayloadStr.includes('victim@salon.com'), 'Finalize payload icerisinde email yer alamaz');
      assert(!finalPayloadStr.includes(sentinelToken), 'Finalize payload icerisinde API anahtari yer alamaz');
      assert(!finalPayloadStr.includes(sentinelRegexOut), 'Finalize payload icerisinde regex disi sentinel yer alamaz');
    }

    // 2. Subscription format DB error flow with dynamic customer/order references
    {
      interceptedLogs.length = 0; // Clear logs for second sub-test
      const { client, state } = createMockSupabase({
        txErr: {
          message: `Database error in subscription transaction with secret ${sentinelToken} and custom ${piiCustomerName}`,
          code: 'PAYMENT_INSERT_FAILED'
        }
      });
      state.subscriptions[0].provider_subscription_id = sentinelSubRef;

      const subPayload = {
        merchantId: 'test_merchant_004',
        iyziEventType: 'subscription.order.success',
        status: 'SUCCESS',
        subscriptionReferenceCode: sentinelSubRef,
        orderReferenceCode: sentinelOrderRef,
        customerReferenceCode: 'tenant_uuid_001'
      };

      const reqSub = await buildSignedSubscriptionRequest(subPayload);
      const resSub = await handlePaymentWebhook(reqSub, {
        supabaseAdmin: client,
        inFlightSet: new Set(),
        getEnv: (k) => {
          if (k === 'IYZICO_SECRET_KEY') return 'test_secret_qa_004';
          if (k === 'IYZICO_MERCHANT_ID') return 'test_merchant_004';
          return undefined;
        }
      });

      assert.strictEqual(resSub.status, 500);
      const subResBody = await resSub.text();
      const subLogs = interceptedLogs.join('\n');
      const subFinalPayload = state.idempotency[0]?.response_payload || {};
      const subFinalPayloadStr = JSON.stringify(subFinalPayload);

      assert(!subResBody.includes(piiCustomerName), 'Subscription DB hatasi response icinde PII sentinel yer alamaz');
      assert(!subResBody.includes(sentinelSubRef), 'Subscription DB hatasi response icinde subscriptionReferenceCode yer alamaz');
      assert(!subResBody.includes(sentinelOrderRef), 'Subscription DB hatasi response icinde orderReferenceCode yer alamaz');
      assert(!subResBody.includes(sentinelToken), 'Subscription DB hatasi response icinde token yer alamaz');

      assert(!subLogs.includes(piiCustomerName), 'Subscription DB hatasi loglari icinde PII sentinel yer alamaz');
      assert(!subLogs.includes(sentinelSubRef), 'Subscription DB hatasi loglari icinde subscriptionReferenceCode yer alamaz');
      assert(!subLogs.includes(sentinelOrderRef), 'Subscription DB hatasi loglari icinde orderReferenceCode yer alamaz');
      assert(!subLogs.includes(sentinelToken), 'Subscription DB hatasi loglari icinde token yer alamaz');

      assert(!subFinalPayloadStr.includes(piiCustomerName), 'Subscription DB hatasi finalize payload icinde PII sentinel yer alamaz');
      assert(!subFinalPayloadStr.includes(sentinelSubRef), 'Subscription DB hatasi finalize payload icinde subscriptionReferenceCode yer alamaz');
      assert(!subFinalPayloadStr.includes(sentinelOrderRef), 'Subscription DB hatasi finalize payload icinde orderReferenceCode yer alamaz');
      assert(!subFinalPayloadStr.includes(sentinelToken), 'Subscription DB hatasi finalize payload icinde token yer alamaz');
    }
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
});

await runAsyncTest('3.7. [FAIL-CLOSED RPC INTERFACE] supabaseAdmin.rpc metodu yoksa operasyon tablolara dokunmadan 503 RPC_UNAVAILABLE doner', async () => {
  const clientWithoutRpc = {
    from: () => {
      throw new Error('RPC yokken dogrudan tablolara dokunulmamalidir!');
    }
  };

  const payload = {
    iyziEventType: 'checkoutform.auth',
    status: 'SUCCESS',
    token: 'tok_db_err_01',
    paymentConversationId: 'conv_db_err_01',
    iyziPaymentId: 'pay_norpc_01',
    paidPrice: 350.00
  };

  const req = await buildSignedHppRequest(payload);
  const res = await handlePaymentWebhook(req, {
    supabaseAdmin: clientWithoutRpc,
    inFlightSet: new Set(),
    getEnv: (k) => (k === 'IYZICO_SECRET_KEY' ? 'test_secret_qa_004' : undefined)
  });

  assert.strictEqual(res.status, 503, 'RPC arayuzu yoksa 503 donulmelidir');
  const body = await res.json();
  assert.strictEqual(body.errorCode, 'RPC_UNAVAILABLE');
  assert.strictEqual(body.retryable, true);
});

// ---------------------------------------------------------------------------
// 4. EMBEDDED POSTGRESQL 18.6 TRANSACTIONAL RPC DB HATA YÖNETİMİ TESTLERİ
// ---------------------------------------------------------------------------
let pgEngine = null;
let pgClient = null;
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
  if (pgClient) return pgClient;
  const tmpDir = path.join(os.tmpdir(), `pg_lari_dberr_${Date.now()}_${Math.floor(Math.random() * 10000)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  disposableTmpDir = tmpDir;

  const port = await getAvailablePort();
  const pg = new EmbeddedPostgres({
    databaseDir: tmpDir,
    port,
    user: 'postgres',
    password: 'password',
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    persistent: false
  });

  await pg.initialise();
  await pg.start();
  pgEngine = pg;

  const client = pg.getPgClient();
  await client.connect();
  await client.query(`ALTER DATABASE postgres SET synchronous_commit = 'off'; SET synchronous_commit = 'off';`);
  pgClient = client;

  // Create roles required by migration
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
  `);

  // Create schema and migrations
  const migPath = path.join(rootDir, 'supabase', 'migrations', '20260901_payment_webhook_idempotency_and_replay_security.sql');
  const migSql = fs.readFileSync(migPath, 'utf8');

  await client.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS public.tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      provider_subscription_id TEXT UNIQUE,
      provider_token TEXT,
      provider_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      price NUMERIC(10,2) NOT NULL DEFAULT 350.00,
      currency TEXT NOT NULL DEFAULT 'TRY',
      last_webhook_event_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
      provider TEXT NOT NULL,
      provider_payment_id TEXT,
      provider_event_id TEXT,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      paid_at TIMESTAMPTZ,
      raw_payload JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(migSql);
  return client;
}

await runAsyncTest('4.1. [GERÇEK DB RPC HATA DALLARI] Transactional RPC veritabanı hatalarında kontrollü hata fırlatır', async () => {
  const db = await getDisposablePgEngine();
  const tenantRes = await db.query("INSERT INTO public.tenants (name) VALUES ('Salon DB Error Test') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  const subRes = await db.query(
    "INSERT INTO public.subscriptions (tenant_id, provider_subscription_id, status, price, currency) VALUES ($1, 'sub_ref_real_dberr_01', 'pending', 350.00, 'TRY') RETURNING id;",
    [tenantId]
  );
  const subId = subRes.rows[0].id;

  // 1. Bilinmeyen subscription reference ile transactional RPC çağrısı -> SUBSCRIPTION_NOT_FOUND
  const evtUnknown = 'evt_real_dberr_unknown_01';
  const claimUnknown = await db.query(`
    SELECT public.claim_payment_webhook_event(
      'iyzico', $1, 'subscription.order.success', 'sub_ref_NON_EXISTENT_999', $2, 'fp_unknown_999', 60, NULL
    ) AS res;
  `, [evtUnknown, tenantId]);
  const tokenUnknown = claimUnknown.rows[0].res.claim_attempt_id;

  let unknownError = null;
  try {
    await db.query(`
      SELECT public.execute_payment_webhook_transaction(
        p_provider := 'iyzico',
        p_provider_event_id := $1,
        p_provider_payment_id := 'pay_real_dberr_unknown_01',
        p_event_type := 'subscription.order.success',
        p_subscription_reference_code := 'sub_ref_NON_EXISTENT_999',
        p_tenant_id := $2,
        p_target_status := 'active',
        p_has_payment_proof := true,
        p_amount := 350.00,
        p_currency := 'TRY',
        p_event_timestamp := NOW(),
        p_claim_attempt_id := $3::uuid
      ) AS res;
    `, [evtUnknown, tenantId, tokenUnknown]);
  } catch (err) {
    unknownError = err;
  }

  assert(unknownError, 'Bilinmeyen abonelikte transaction basarili olamaz, kontrollu exception firlatmalidir');
  assert(
    unknownError.message.includes('Subscription not found for reference') ||
    unknownError.message.includes('SUBSCRIPTION_NOT_FOUND'),
    `Hata mesaji beklenen formata uygun olmalidir: ${unknownError.message}`
  );

  // 2. Tenant uyuşmazlığı ile transactional RPC çağrısı -> TENANT_MISMATCH
  const fakeTenantId = '00000000-0000-0000-0000-000000000099';
  const evtMismatch = 'evt_real_dberr_mismatch_01';
  const claimMismatch = await db.query(`
    SELECT public.claim_payment_webhook_event(
      'iyzico', $1, 'subscription.order.success', 'sub_ref_real_dberr_01', $2, 'fp_mismatch_01', 60, NULL
    ) AS res;
  `, [evtMismatch, fakeTenantId]);
  const tokenMismatch = claimMismatch.rows[0].res.claim_attempt_id;

  const mismatchRes = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      p_provider := 'iyzico',
      p_provider_event_id := $1,
      p_provider_payment_id := 'pay_real_dberr_mismatch_01',
      p_event_type := 'subscription.order.success',
      p_subscription_reference_code := 'sub_ref_real_dberr_01',
      p_tenant_id := $2,
      p_target_status := 'active',
      p_has_payment_proof := true,
      p_amount := 350.00,
      p_currency := 'TRY',
      p_event_timestamp := NOW(),
      p_claim_attempt_id := $3::uuid
    ) AS res;
  `, [evtMismatch, fakeTenantId, tokenMismatch]);

  const mismatchData = mismatchRes.rows[0].res || mismatchRes.rows[0].execute_payment_webhook_transaction;
  assert.strictEqual(mismatchData.success, false, 'Tenant uyusmazliginda transaction basarili olamaz');
  assert.strictEqual(mismatchData.error, 'TENANT_MISMATCH', 'Hata kodu TENANT_MISMATCH olmalidir');
});

await runAsyncTest('4.2. [GERÇEK DB ATOMIK ROLLBACK] RPC veritabanı hatası durumunda audit_logs, subscriptions ve payments roll back edilir', async () => {
  const db = await getDisposablePgEngine();
  const tenantRes = await db.query("INSERT INTO public.tenants (name) VALUES ('Rollback Test') RETURNING id;");
  const tenantId = tenantRes.rows[0].id;

  // subscriptions kaydı oluştur (price = 0 veya currency null bırakılarak hata tetiklenecek)
  await db.query(`
    INSERT INTO public.subscriptions (tenant_id, provider_subscription_id, status, price, currency)
    VALUES ($1, 'sub_ref_rollback_01', 'pending', 0.00, 'TRY');
  `, [tenantId]);

  const paymentsBefore = await db.query("SELECT COUNT(*) FROM public.payments WHERE provider_event_id = 'evt_rollback_01';");
  const auditBefore = await db.query("SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

  const evtRollback = 'evt_rollback_01';
  const claimRollback = await db.query(`
    SELECT public.claim_payment_webhook_event(
      'iyzico', $1, 'subscription.order.success', 'sub_ref_rollback_01', $2, 'fp_rollback_01', 60, NULL
    ) AS res;
  `, [evtRollback, tenantId]);
  const tokenRollback = claimRollback.rows[0].res.claim_attempt_id;

  const res = await db.query(`
    SELECT public.execute_payment_webhook_transaction(
      p_provider := 'iyzico',
      p_provider_event_id := $1,
      p_provider_payment_id := 'pay_rollback_01',
      p_event_type := 'subscription.order.success',
      p_subscription_reference_code := 'sub_ref_rollback_01',
      p_tenant_id := $2,
      p_target_status := 'active',
      p_has_payment_proof := true,
      p_amount := 0.00,
      p_currency := 'TRY',
      p_event_timestamp := NOW(),
      p_claim_attempt_id := $3::uuid
    ) AS res;
  `, [evtRollback, tenantId, tokenRollback]);

  const resData = res.rows[0].res || res.rows[0].execute_payment_webhook_transaction;
  assert.strictEqual(resData.success, false);
  assert.strictEqual(resData.error, 'MISSING_SUBSCRIPTION_PRICE');

  // Atomik rollback teyidi
  const paymentsAfter = await db.query("SELECT COUNT(*) FROM public.payments WHERE provider_event_id = 'evt_rollback_01';");
  const auditAfter = await db.query("SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = $1;", [tenantId]);

  assert.strictEqual(Number(paymentsAfter.rows[0].count), Number(paymentsBefore.rows[0].count), 'Hata sonrasi payment olusmamalidir');
  assert.strictEqual(Number(auditAfter.rows[0].count), Number(auditBefore.rows[0].count), 'Hata sonrasi audit_log olusmamalidir');
});

// ---------------------------------------------------------------------------
// TEST SONUCU VE RAPORLAMA
// ---------------------------------------------------------------------------
if (pgClient) {
  try {
    await pgClient.end();
  } catch (err) {}
}
if (pgEngine) {
  try {
    await pgEngine.stop();
  } catch (err) {
    // Ignore cleanup error on exit
  }
}
if (disposableTmpDir) {
  try {
    fs.rmSync(disposableTmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n================================================================================');
console.log(`=== QA SONUCU: ${passedTests}/${totalTests} TEST BASARIYLA TAMAMLANDI (ALL PASS) ===`);
console.log('================================================================================\n');
process.exit(0);
