// Standalone test for the signed-only idempotency fingerprint and provider
// lifecycle event boundary. No network, remote DB or production credentials.
import assert from 'node:assert/strict';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const secret = 'isolated-regression-secret';
let checks = 0;

function makeDb() {
  const claims = [];
  let finalizations = 0;
  return {
    claims,
    get finalizations() { return finalizations; },
    rpc: async (name, args) => {
      if (name === 'claim_payment_webhook_event') {
        claims.push(args);
        return { data: { status: 'processing', can_proceed: true, is_duplicate: false,
          claim_attempt_id: '00000000-0000-0000-0000-000000000001' }, error: null };
      }
      if (name === 'finalize_payment_webhook_event') {
        finalizations++;
        return { data: { finalized: true }, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from: (table) => {
      assert.equal(table, 'subscriptions');
      let queryCol = '';
      const chain = {
        select: () => chain,
        eq: (col) => { queryCol = col; return chain; },
        maybeSingle: async () => {
          if (queryCol === 'provider_token' || queryCol === 'provider_session_id') {
            return {
              data: {
                id: '00000000-0000-0000-0000-000000000001',
                provider_subscription_id: 'sub_1',
                tenant_id: '00000000-0000-0000-0000-000000000001'
              },
              error: null
            };
          }
          return { data: null, error: null };
        }
      };
      return chain;
    }
  };
}
async function request(payload, db) {
  const format = iyzicoClient.classifyWebhookSignatureFormat(payload);
  const material = format === 'hpp' ? iyzicoClient.buildHppWebhookSignaturePayload(payload, secret)
    : iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secret);
  const signature = await iyzicoClient.hmacSha256Hex(material, secret);
  return handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-iyz-signature-v3': signature },
    body: JSON.stringify(payload)
  }), {
    getEnv: key => key === 'IYZICO_SECRET_KEY' ? secret : undefined,
    supabaseAdmin: db,
    inFlightSet: new Set(), inFlightFingerprints: new Map(), inFlightExecutions: new Map()
  });
}

const subscription = {
  merchantId: 'm_1', eventType: 'subscription.order.success',
  subscriptionReferenceCode: 'sub_1', orderReferenceCode: 'order_1', customerReferenceCode: 'cust_1'
};
const subPoison = { ...subscription, foo: 'A', eventTime: 1, arbitrary: { value: 1 } };
const subRetry = { ...subscription, foo: 'B', eventTime: 9999999999 };
assert.equal(iyzicoClient.signedWebhookFingerprintMaterial(subPoison), iyzicoClient.signedWebhookFingerprintMaterial(subRetry)); checks++;
const subDb = makeDb();
const subRes1 = await request(subPoison, subDb);
const subRes2 = await request(subRetry, subDb);
assert.equal(subRes1.status, 503);
assert.equal(subRes2.status, 503);
assert.equal(subDb.claims.length, 2);
assert.equal(subDb.claims[0].p_payload_fingerprint, subDb.claims[1].p_payload_fingerprint);
checks += 4;

const hpp = {
  iyziEventType: 'checkoutform.auth', token: 'signed_tok',
  iyziPaymentId: 'paid_1', paymentConversationId: 'conversation_1', status: 'SUCCESS',
  subscriptionReferenceCode: 'sub_1'
};
const hppPoison = { ...hpp, subscriptionReferenceCode: 'sub_attacker', foo: 'evil', eventTime: 42 };
const hppRetry = { ...hpp, eventTime: 1000 };
assert.equal(iyzicoClient.signedWebhookFingerprintMaterial(hppPoison), iyzicoClient.signedWebhookFingerprintMaterial(hppRetry)); checks++;
const hppDb = makeDb();
const hppRes1 = await request(hppPoison, hppDb);
const hppRes2 = await request(hppRetry, hppDb);
assert.equal(hppRes1.status, 503);
assert.equal(hppRes2.status, 503);
assert.equal(hppDb.claims.length, 2);
assert.equal(hppDb.claims[0].p_payload_fingerprint, hppDb.claims[1].p_payload_fingerprint);
checks += 4;

const changedSignedOrder = { ...subscription, orderReferenceCode: 'order_other' };
assert.notEqual(iyzicoClient.signedWebhookFingerprintMaterial(subscription), iyzicoClient.signedWebhookFingerprintMaterial(changedSignedOrder));
checks++;
const changedSignedHpp = { ...hpp, token: 'different_tok' };
assert.notEqual(iyzicoClient.signedWebhookFingerprintMaterial(hpp), iyzicoClient.signedWebhookFingerprintMaterial(changedSignedHpp));
checks++;

for (const eventType of ['subscription.cancelled', 'subscription.expired']) {
  const db = makeDb();
  const response = await request({ merchantId: 'm_1', eventType,
    subscriptionReferenceCode: 'sub_1', customerReferenceCode: 'cust_1' }, db);
  assert.equal(response.status, 422, eventType);
  assert.equal((await response.json()).errorCode, 'PROVIDER_STATE_RECONCILIATION_REQUIRED');
  assert.equal(db.claims.length, 0, 'No idempotency claim for undocumented cancellation');
  checks += 3;
}
console.log(`[PASS] ${checks} signed-identity and provider-event-boundary assertions`);
