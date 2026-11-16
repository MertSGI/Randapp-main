// Dependency-free security regression checks for ADIM-003's last three blockers.
// Run with Node.js >=22: node --experimental-strip-types scripts/test-webhook-final-guardrails.mjs
// PostgreSQL integration coverage remains in scripts/test-webhook-idempotency.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql'), 'utf8');
const secret = 'local-test-key-no-provider-requests';
let n = 0;

async function webhook(payload, db) {
  const signature = await iyzicoClient.hmacSha256Hex(
    iyzicoClient.buildSubscriptionWebhookSignaturePayload(payload, secret), secret
  );
  return handlePaymentWebhook(new Request('https://example.invalid/payment-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-iyz-signature-v3': signature },
    body: JSON.stringify(payload)
  }), { supabaseAdmin: db, getEnv: name => name === 'IYZICO_SECRET_KEY' ? secret : undefined });
}

const unsignedTenantBase = {
  merchantId: 'guardrail_merchant',
  eventType: 'subscription.order.success',
  subscriptionReferenceCode: 'sub_final_guard_01',
  orderReferenceCode: 'order_final_guard_01',
  status: 'SUCCESS'
};
let claimed = 0;
const db = { rpc: async () => { claimed++; throw new Error('An invalid tenant alias must not reach DB claim'); } };
for (const [name, extra] of [
  ['top-level tenantId', { tenantId: 'attacker' }],
  ['nested customer.referenceCode', { customer: { referenceCode: 'attacker' } }]
]) {
  const response = await webhook({ ...unsignedTenantBase, ...extra }, db);
  assert.equal(response.status, 400, name);
  assert.equal((await response.json()).errorCode, 'UNTRUSTED_CUSTOMER_REFERENCE_ALIAS', name);
  n++;
}
assert.equal(claimed, 0, 'Poisoned first delivery must not reserve an event');
console.log('[PASS] Unsigned tenant aliases fail before any idempotency reservation');

for (const format of ['subscription', 'hpp']) {
  for (const field of ['eventTime', 'iyziEventTime', 'timestamp', 'createdDate', 'paymentDate', 'eventTimestamp', 'date']) {
    const payload = format === 'hpp' ? { iyziEventType: 'checkoutform.auth', token: 'signed_checkout_test' } : {
      eventType: 'subscription.order.success', subscriptionReferenceCode: 'sub_guard', orderReferenceCode: 'ord_guard'
    };
    payload[field] = '2099-01-01T00:00:00Z';
    assert.equal(iyzicoClient.extractProviderEventTimestamp(payload), null, `${format}:${field}`);
    n++;
  }
}
console.log('[PASS] Unsigned timestamps never become ordering authority (subscription and HPP)');

const lockedSubscriptionContract = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.execute_payment_webhook_transaction('));
assert.ok(lockedSubscriptionContract.includes('FOR UPDATE'), 'Subscription row locking required');
assert.ok(lockedSubscriptionContract.includes('MISSING_SUBSCRIPTION_PRICE'), 'Missing locked price must reject financial recording');
assert.ok(lockedSubscriptionContract.includes('AND (v_sub.price IS NOT NULL AND v_sub.price > 0)'), 'Ledger guard must use locked price');
assert.ok(lockedSubscriptionContract.includes('ROUND(v_sub.price, 2)'), 'Ledger amount must use locked price');
assert.ok(!/COALESCE\(v_sub\.price\s*,\s*p_amount/.test(lockedSubscriptionContract), 'No stale pre-read amount fallback allowed');
assert.ok(!/ELSE\s+p_amount/.test(lockedSubscriptionContract), 'No stale conditional amount fallback allowed');
n++;
console.log('[PASS] SQL payment ledger path never falls back to handler pre-read price');
console.log(`[PASS] ${n} targeted assertions`);
