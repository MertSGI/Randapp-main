// ADIM-003: Independent official-format iyzico V3 contract regression.
// No provider requests, remote database, credentials, or production activation.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const secret = 'local-only-independent-fixture-secret';
const merchantId = '3404590';
const headersFor = payload => ({ 'x-iyz-signature-v3': hppSignature(payload) });
const sha = (message) => createHmac('sha256', secret).update(message).digest('hex');
const subscriptionSignature = payload => sha([
  merchantId, secret, payload.iyziEventType, payload.subscriptionReferenceCode,
  payload.orderReferenceCode, payload.customerReferenceCode
].join(''));
const hppSignature = payload => sha([
  secret, payload.iyziEventType, payload.iyziPaymentId, payload.token,
  payload.paymentConversationId, payload.status
].join(''));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// iyzico's documented subscription JSON may not include merchantId.
const subscription = {
  iyziEventType: 'subscription.order.success',
  orderReferenceCode: 'order_123',
  customerReferenceCode: 'customer_456',
  subscriptionReferenceCode: 'subscription_789',
  iyziReferenceCode: 'unsigned_reference',
  iyziEventTime: 1758704403161
};
const subSignature = subscriptionSignature(subscription);
check(iyzicoClient.buildSubscriptionWebhookSignaturePayload(subscription, secret, merchantId) ===
  [merchantId, secret, subscription.iyziEventType, subscription.subscriptionReferenceCode,
    subscription.orderReferenceCode, subscription.customerReferenceCode].join(''), 'official subscription field order');
check((await iyzicoClient.verifyIyzicoSignatureV3({ 'X-IYZ-SIGNATURE-V3': subSignature },
  subscription, secret, merchantId)).isValid, 'bodyless merchantId accepted from trusted configuration');
check((await iyzicoClient.verifyIyzicoSignatureV3({ 'X-IYZ-SIGNATURE-V3': subSignature },
  subscription, secret)).reason === 'MERCHANT_ID_MISSING', 'unconfigured merchant rejects bodyless message');
check((await iyzicoClient.verifyIyzicoSignatureV3({ 'X-IYZ-SIGNATURE-V3': subSignature },
  { ...subscription, merchantId: 'wrong-merchant' }, secret, merchantId)).reason === 'MERCHANT_ID_MISMATCH',
  'mismatched merchant in body is rejected');
check((await iyzicoClient.verifyIyzicoSignatureV3({ 'X-IYZ-SIGNATURE-V3': subSignature },
  { ...subscription, orderReferenceCode: 'tampered' }, secret, merchantId)).reason === 'SIGNATURE_MISMATCH',
  'signed subscription order tampering rejected');
check(iyzicoClient.signedWebhookFingerprintMaterial(subscription, merchantId) ===
  iyzicoClient.signedWebhookFingerprintMaterial({ ...subscription, iyziEventTime: 5, extra: 'unsigned' }, merchantId),
  'untrusted metadata does not alter canonical fingerprint');

const hpp = {
  paymentConversationId: 'conv_123', merchantId: 3404590,
  status: 'SUCCESS', token: 'checkout_token_123', iyziPaymentId: 28157797,
  iyziEventType: 'CHECKOUT_FORM_AUTH', iyziEventTime: 1766733201159
};
const hppSig = hppSignature(hpp);
check((await iyzicoClient.verifyIyzicoSignatureV3(headersFor(hpp), hpp, secret, merchantId)).isValid,
  'uppercase raw CHECKOUT_FORM_AUTH validates without normalization before HMAC');
check(iyzicoClient.classifyWebhookSignatureFormat(hpp) === 'hpp', 'uppercase HPP classified correctly');
check(iyzicoClient.isPublicProviderWebhookEvent('hpp', hpp.iyziEventType), 'official uppercase HPP publicly accepted');
check(iyzicoClient.toInternalProviderEventType('hpp', hpp.iyziEventType) === 'checkoutform.auth',
  'provider name normalized after HMAC');
check(iyzicoClient.mapIyzicoWebhookToInternalStatus(hpp) === 'active',
  'signed successful HPP maps to internal active status');
check(!(await iyzicoClient.verifyIyzicoSignatureV3(headersFor(hpp),
  { ...hpp, iyziEventType: 'checkoutform.auth' }, secret, merchantId)).isValid,
  'changing raw event casing invalidates HMAC');
check((await iyzicoClient.verifyIyzicoSignatureV3(headersFor(hpp),
  { ...hpp, eventType: 'subscription.order.success' }, secret, merchantId)).reason === 'CONFLICTING_EVENT_TYPE',
  'unsigned contradictory eventType cannot override signed HPP event');

// Ensure real handler routes official raw HPP to existing internal SQL/RPC type.
const rpcCalls = [];
const db = {
  from(table) {
    assert.equal(table, 'subscriptions');
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: {
        id: '00000000-0000-0000-0000-000000000001',
        provider_subscription_id: 'sub_internal_1', tenant_id: '00000000-0000-0000-0000-000000000002'
      }, error: null }) };
    return query;
  },
  rpc: async (name, args) => { rpcCalls.push({ name, args });
    return { data: null, error: { message: 'intentional-offline-test-stop' } }; }
};
const run = async (payload, sig) => handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-iyz-signature-v3': sig },
  body: JSON.stringify(payload)
}), { supabaseAdmin: db, getEnv: k => ({ IYZICO_SECRET_KEY: secret, IYZICO_MERCHANT_ID: merchantId })[k],
  inFlightSet: new Set(), inFlightExecutions: new Map(), inFlightFingerprints: new Map() });
const hppResponse = await run(hpp, hppSig);
check(hppResponse.status === 500, 'HPP passed HMAC and public gates; expected mock DB failure');
check(rpcCalls.some(call => call.name === 'claim_payment_webhook_event' &&
  call.args.p_event_type === 'checkoutform.auth'), 'SQL receives canonical internal HPP event type');
check(rpcCalls.find(call => call.name === 'claim_payment_webhook_event')?.args.p_subscription_reference_code === 'sub_internal_1',
  'HPP subscription resolves from signed checkout identity');

const subResponse = await run(subscription, subSignature);
check(subResponse.status === 500, 'official bodyless subscription passed HMAC and public gates');
check(rpcCalls.some(call => call.name === 'claim_payment_webhook_event' &&
  call.args.p_event_type === 'subscription.order.success'), 'subscription event preserved');

console.log(`[PASS] ${checks} official V3 HMAC, merchant binding, event-name and handler-to-RPC assertions`);
