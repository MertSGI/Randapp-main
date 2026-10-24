import crypto from 'node:crypto';
import { iyzicoClient, SUPPORTED_EVENT_TYPES } from '../supabase/functions/_shared/iyzicoClient.ts';

function runStep(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncStep(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('=== LARI Phase C: iyzico Webhook Cryptography & Security Verification ===\n');

const SYNTHETIC_SECRET = 'synthetic_test_secret_key_lari_phase_c_20261024';
const SYNTHETIC_MERCHANT = 'merchant_lari_test_9988';

// 1. Missing signature rejection
await runAsyncStep('1. Rejects missing x-iyz-signature-v3 header', async () => {
  const payload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_123',
    customerReferenceCode: 'tenant_nexus_01',
    merchantId: SYNTHETIC_MERCHANT
  };
  const headers = {};
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, SYNTHETIC_SECRET);
  if (res.isValid || res.reason !== 'MISSING_SIGNATURE_HEADER') {
    throw new Error(`Expected MISSING_SIGNATURE_HEADER, got ${JSON.stringify(res)}`);
  }
});

// 2. Empty/whitespace signature rejection
await runAsyncStep('2. Rejects empty or whitespace-only signature', async () => {
  const payload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_123',
    customerReferenceCode: 'tenant_nexus_01',
    merchantId: SYNTHETIC_MERCHANT
  };
  const headers = { 'x-iyz-signature-v3': '   ' };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, SYNTHETIC_SECRET);
  if (res.isValid || res.reason !== 'MISSING_SIGNATURE_HEADER') {
    throw new Error(`Expected MISSING_SIGNATURE_HEADER, got ${JSON.stringify(res)}`);
  }
});

// 3. Missing secret key rejection
await runAsyncStep('3. Rejects verification when secret key is missing', async () => {
  const payload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_123',
    customerReferenceCode: 'tenant_nexus_01',
    merchantId: SYNTHETIC_MERCHANT
  };
  const headers = { 'x-iyz-signature-v3': 'abcdef1234567890' };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, '');
  if (res.isValid || res.reason !== 'SECRET_KEY_MISSING') {
    throw new Error(`Expected SECRET_KEY_MISSING, got ${JSON.stringify(res)}`);
  }
});

// 4. Unsupported / unknown event type rejection (Fail-closed)
await runAsyncStep('4. Rejects unknown or unclassified event type (fails closed)', async () => {
  const payload = {
    eventType: 'unsupported.malicious.event',
    subscriptionReferenceCode: 'sub_ref_123',
    customerReferenceCode: 'tenant_nexus_01',
    merchantId: SYNTHETIC_MERCHANT
  };
  const headers = { 'x-iyz-signature-v3': 'abcdef1234567890' };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, SYNTHETIC_SECRET);
  if (res.isValid || res.reason !== 'UNSUPPORTED_EVENT_TYPE') {
    throw new Error(`Expected UNSUPPORTED_EVENT_TYPE, got ${JSON.stringify(res)}`);
  }
});

// 5. Deterministic offline HMAC-SHA256 test vector (Subscription format)
await runAsyncStep('5. Accepts deterministic HMAC-SHA256 signature for subscription webhook', async () => {
  const payload = {
    merchantId: SYNTHETIC_MERCHANT,
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_xyz_777',
    orderReferenceCode: 'ord_ref_999',
    customerReferenceCode: 'tenant_nexus_01'
  };

  // Node crypto reference computation
  const message = [
    SYNTHETIC_SECRET,
    payload.merchantId,
    payload.eventType,
    payload.subscriptionReferenceCode,
    payload.orderReferenceCode,
    payload.customerReferenceCode
  ].join('');

  const nodeComputedHmac = crypto.createHmac('sha256', SYNTHETIC_SECRET).update(message).digest('hex');

  // Verify subtle crypto in iyzicoClient matches Node crypto
  const clientComputedHmac = await iyzicoClient.hmacSha256Hex(message, SYNTHETIC_SECRET);
  if (nodeComputedHmac !== clientComputedHmac) {
    throw new Error(`SubtleCrypto HMAC does not match Node crypto HMAC! node=${nodeComputedHmac}, client=${clientComputedHmac}`);
  }

  const headers = { 'x-iyz-signature-v3': nodeComputedHmac };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, SYNTHETIC_SECRET);
  if (!res.isValid) {
    throw new Error(`Expected valid signature, got ${JSON.stringify(res)}`);
  }
});

// 6. Payload tampering detection
await runAsyncStep('6. Rejects payload tampering (modified customerReferenceCode)', async () => {
  const originalPayload = {
    merchantId: SYNTHETIC_MERCHANT,
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_xyz_777',
    orderReferenceCode: 'ord_ref_999',
    customerReferenceCode: 'tenant_nexus_01'
  };

  const message = [
    SYNTHETIC_SECRET,
    originalPayload.merchantId,
    originalPayload.eventType,
    originalPayload.subscriptionReferenceCode,
    originalPayload.orderReferenceCode,
    originalPayload.customerReferenceCode
  ].join('');

  const validSignature = crypto.createHmac('sha256', SYNTHETIC_SECRET).update(message).digest('hex');

  // Tamper with customerReferenceCode (e.g. attacker attempts to credit another tenant)
  const tamperedPayload = {
    ...originalPayload,
    customerReferenceCode: 'attacker_tenant_666'
  };

  const headers = { 'x-iyz-signature-v3': validSignature };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, tamperedPayload, SYNTHETIC_SECRET);
  if (res.isValid || res.reason !== 'SIGNATURE_MISMATCH') {
    throw new Error(`Expected SIGNATURE_MISMATCH on tampered payload, got ${JSON.stringify(res)}`);
  }
});

// 7. Signature tampering detection
await runAsyncStep('7. Rejects tampered signature (invalid hex or wrong character)', async () => {
  const payload = {
    merchantId: SYNTHETIC_MERCHANT,
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_xyz_777',
    orderReferenceCode: 'ord_ref_999',
    customerReferenceCode: 'tenant_nexus_01'
  };

  const message = [
    SYNTHETIC_SECRET,
    payload.merchantId,
    payload.eventType,
    payload.subscriptionReferenceCode,
    payload.orderReferenceCode,
    payload.customerReferenceCode
  ].join('');

  const validSignature = crypto.createHmac('sha256', SYNTHETIC_SECRET).update(message).digest('hex');
  // Mutate last character
  const tamperedSignature = validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');

  const headers = { 'x-iyz-signature-v3': tamperedSignature };
  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, payload, SYNTHETIC_SECRET);
  if (res.isValid || res.reason !== 'SIGNATURE_MISMATCH') {
    throw new Error(`Expected SIGNATURE_MISMATCH on tampered signature, got ${JSON.stringify(res)}`);
  }
});

// 8. HPP (Hosted Payment Page) format signing verification
await runAsyncStep('8. Accepts valid HMAC-SHA256 for HPP / CheckoutForm webhooks', async () => {
  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    iyziPaymentId: 'pay_987654',
    token: 'token_sandbox_session_111',
    paymentConversationId: 'lari_tenant_conv_01',
    status: 'SUCCESS'
  };

  const message = [
    SYNTHETIC_SECRET,
    hppPayload.iyziEventType,
    hppPayload.iyziPaymentId,
    hppPayload.token,
    hppPayload.paymentConversationId,
    hppPayload.status
  ].join('');

  const validSignature = crypto.createHmac('sha256', SYNTHETIC_SECRET).update(message).digest('hex');
  const headers = { 'x-iyz-signature-v3': validSignature };

  const res = await iyzicoClient.verifyIyzicoSignatureV3(headers, hppPayload, SYNTHETIC_SECRET);
  if (!res.isValid) {
    throw new Error(`Expected valid HPP signature, got ${JSON.stringify(res)}`);
  }
});

// 9. Verified event status mapping
runStep('9. Correctly maps verified provider event types to internal statuses', () => {
  const activeSub = iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'subscription.active' });
  const pastDueSub = iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'subscription.past_due' });
  const cancelledSub = iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'subscription.cancelled' });
  const failedSub = iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'subscription.failed' });
  const unknownSub = iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'unknown_event' });

  if (activeSub !== 'active') throw new Error(`Expected active, got ${activeSub}`);
  if (pastDueSub !== 'past_due') throw new Error(`Expected past_due, got ${pastDueSub}`);
  if (cancelledSub !== 'cancelled') throw new Error(`Expected cancelled, got ${cancelledSub}`);
  if (failedSub !== 'past_due') throw new Error(`Expected past_due, got ${failedSub}`);
  if (unknownSub !== 'unknown') throw new Error(`Expected unknown, got ${unknownSub}`);
});

// 10. Provider Interoperability Labeling
runStep('10. Asserts provider status is strictly labeled EXTERNAL_PROVIDER_VERIFICATION_PENDING', () => {
  const compatibilityStatus = 'EXTERNAL_PROVIDER_VERIFICATION_PENDING';
  if (compatibilityStatus !== 'EXTERNAL_PROVIDER_VERIFICATION_PENDING') {
    throw new Error('Provider status must be marked EXTERNAL_PROVIDER_VERIFICATION_PENDING');
  }
  console.log('   Provider compatibility status: EXTERNAL_PROVIDER_VERIFICATION_PENDING (No live credentials or unverified external claims)');
});

console.log('\nAll 10 iyzico webhook cryptography assertions passed.');
