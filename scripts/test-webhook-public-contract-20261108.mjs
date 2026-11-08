// Standalone fail-closed provider-contract regression checks (no remote services).
// Run: node --experimental-strip-types scripts/test-webhook-public-contract-20261108.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const secret = 'local-contract-fixture-not-a-provider-secret';
const eventTypes = [
  'subscription.created', 'subscription.active', 'subscription.renewed',
  'subscription.past_due', 'subscription.failed', 'subscription.cancelled',
  'subscription.expired', 'payment.success', 'payment.failure'
];
let checks = 0;
let calls = 0;
const db = { rpc() { calls++; throw new Error('Disallowed event reached DB RPC'); } };
for (const eventType of eventTypes) {
  const payload = {merchantId:'merchant_1', eventType, subscriptionReferenceCode:'subscription_1',
    orderReferenceCode:'order_1', customerReferenceCode:'customer_1', status:'SUCCESS'};
  const message = iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secret);
  const signature = await iyzicoClient.hmacSha256Hex(message, secret);
  const response = await handlePaymentWebhook(new Request('https://example.invalid/webhook', {
    method:'POST', headers:{'content-type':'application/json','x-iyz-signature-v3':signature},body:JSON.stringify(payload)
  }), { supabaseAdmin: db, getEnv: n => n === 'IYZICO_SECRET_KEY' ? secret : undefined,
    inFlightSet: new Set(), inFlightExecutions: new Map(), inFlightFingerprints: new Map() });
  assert.equal(response.status, 422, `${eventType}: expected pre-claim HTTP 422, got ${response.status}`);
  assert.equal((await response.json()).errorCode, 'PROVIDER_STATE_RECONCILIATION_REQUIRED');
  checks += 2;
}
assert.equal(calls,0); checks++;
// Signed official subscription orders must pass the PUBLIC contract gate.
for (const eventType of ['subscription.order.success','subscription.order.failure']) {
  const payload = {merchantId:'merchant_1',eventType,subscriptionReferenceCode:'subscription_2',
    orderReferenceCode:'order_2',customerReferenceCode:'customer_2'};
  const sig = await iyzicoClient.hmacSha256Hex(iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload,secret),secret);
  const response = await handlePaymentWebhook(new Request('https://example.invalid/webhook',{
    method:'POST',headers:{'content-type':'application/json','x-iyz-signature-v3':sig},body:JSON.stringify(payload)
  }),{supabaseAdmin: {rpc:async()=>({data:null,error:{message:'offline-mocked-claim'}})},getEnv:n=>n==='IYZICO_SECRET_KEY'?secret:undefined,
    inFlightSet:new Set(),inFlightExecutions:new Map(),inFlightFingerprints:new Map()});
  assert.notEqual(response.status,422,`${eventType} must reach normal processing path`); checks++;
}
const sql = fs.readFileSync(new URL('../supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql',import.meta.url),'utf8');
for (const k of ['providerPaymentId','iyziPaymentId','paymentId']) {
  assert.doesNotMatch(sql,new RegExp("metadata->>'"+k+"'\\s*=\\s*v_provider_payment_id"),'i'); checks++;
  assert.doesNotMatch(sql,new RegExp("p_(?:payment_)?metadata->>'"+k+"'"),'i'); checks++;
}
assert.doesNotMatch(sql,/SET\s+provider_payment_id\s*=\s*COALESCE\s*\(\s*metadata->/i); checks++;
const source = fs.readFileSync(new URL('../supabase/functions/payment-webhook/index.ts',import.meta.url),'utf8');
assert.match(source,/\.\.\.\(format === 'hpp' && parsedBody\?\.iyziPaymentId/); checks++;
assert.doesNotMatch(source,/iyziPaymentId:\s*parsedBody\?\.iyziPaymentId\s*\?\?\s*null/); checks++;
// Confirm that the integration harness never fabricates a successful SQL lookup.
const integrationHarness = fs.readFileSync(new URL('./test-webhook-idempotency.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(integrationHarness,/fallbackSql/); checks++;
assert.doesNotMatch(integrationHarness,/LIKE\s*'%'\s*\|\|/); checks++;
assert.doesNotMatch(integrationHarness,/p\.metadata\?\.iyziPaymentId/); checks++;
console.log(`[PASS] ${checks} provider-contract, identity and test-integrity assertions`);
