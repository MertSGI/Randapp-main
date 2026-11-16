import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { iyzicoClient } from '../supabase/functions/_shared/iyzicoClient.ts';
import { handlePaymentWebhook } from '../supabase/functions/payment-webhook/index.ts';

const secret = 'signed-owner-test-secret';
const records = [
  { id:'owner-a', provider_subscription_id:'subscription-A', tenant_id:'tenant-A', provider_token:'signed-token', provider_session_id:'signed-conversation' },
  { id:'owner-b', provider_subscription_id:'subscription-B', tenant_id:'tenant-B', provider_token:'different-token', provider_session_id:'different-conversation' },
];

function makeAdmin(rows) {
  const calls=[];
  return {
    calls,
    from(table) {
      assert.equal(table,'subscriptions');
      return { select() {
        const filters=[];
        return {
          eq(column,value) {filters.push([column,value]);return this;},
          async maybeSingle() {
            const matches=rows.filter(r=>filters.every(([key,val])=>r[key]===val));
            if(matches.length>1) return {data:null,error:{code:'PGRST116',message:'Multiple rows returned'}};
            return {data:matches[0]||null,error:null};
          }
        };
      }};
    },
    async rpc(name,args) {
      calls.push({name,args});
      return {data:null,error:{message:'Intentional stop after signed identity resolution'}};
    }
  };
}

async function call(admin, overrides={}) {
  const body={iyziEventType:'checkoutform.auth',token:'signed-token',
    iyziPaymentId:'payment-test',paymentConversationId:'signed-conversation',
    subscriptionReferenceCode:'subscription-B',status:'SUCCESS',...overrides};
  const signature=await iyzicoClient.hmacSha256Hex(iyzicoClient.buildHppWebhookSignaturePayload(body,secret),secret);
  const request=new Request('https://example.invalid/payment-webhook',{method:'POST',headers:{'Content-Type':'application/json','x-iyz-signature-v3':signature},body:JSON.stringify(body)});
  return handlePaymentWebhook(request,{supabaseAdmin:admin,inFlightSet:new Set(),inFlightFingerprints:new Map(),
    inFlightExecutions:new Map(),getEnv:k=>k==='IYZICO_SECRET_KEY'?secret:undefined});
}

let passed=0;
const admin1=makeAdmin(records);
const result1=await call(admin1);
assert.equal(result1.status,500,'Intentionally aborted at mock claim; no financial mutation');
assert.equal(admin1.calls[0]?.name,'claim_payment_webhook_event');
assert.equal(admin1.calls[0]?.args.p_subscription_reference_code,'subscription-A',
  'Unsigned subscriptionReferenceCode cannot choose tenant B');
passed++;

const admin2=makeAdmin([...records,{...records[0],id:'owner-c',provider_subscription_id:'subscription-C'}]);
const result2=await call(admin2);
assert.equal(result2.status,503,'Ambiguous signed checkout must fail closed');
assert.equal(admin2.calls.length,0,'Ambiguous binding must never claim or mutate');
passed++;

const admin3=makeAdmin([records[1]]);
const result3=await call(admin3);
assert.equal(result3.status,403,'Missing signed checkout binding must be rejected');
assert.equal(admin3.calls.length,0);
passed++;

const admin4=makeAdmin([{...records[0],provider_session_id:'different-conversation'},
  {...records[1],provider_session_id:'signed-conversation'}]);
const result4=await call(admin4);
assert.equal(result4.status,403,'Signed token and signed conversation IDs must resolve the same row');
assert.equal(admin4.calls.length,0);
passed++;

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260901_payment_webhook_idempotency_and_replay_security.sql'),'utf8');
assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_provider_token\s+ON public\.subscriptions \(provider_token\)/);
assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_provider_session_id\s+ON public\.subscriptions \(provider_session_id\)/);
assert.match(sql,/AMBIGUOUS_CHECKOUT_SESSION/);
passed++;

console.log(`${passed}/5 HPP signed-owner guardrail tests PASS. (Mock-based; real PostgreSQL regression pending.)`);
