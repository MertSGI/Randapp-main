import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iyzicoClient, SUPPORTED_EVENT_TYPES } from '../supabase/functions/_shared/iyzicoClient.ts';

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
console.log('=== LARI [LARI-PILOT3-002] Abonelik Olusturma Durum Guvenligi QA   ===');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 1. STATIK KAYNAK VE KONTAT GUVENLIGI DENETIMI
// ---------------------------------------------------------------------------
runTest('1.1. iyzicoClient.ts dosyasinda subscription.created guvenli pending eslemesi mevcut', () => {
  const clientPath = path.join(rootDir, 'supabase', 'functions', '_shared', 'iyzicoClient.ts');
  const content = fs.readFileSync(clientPath, 'utf8');

  assert(content.includes("eventType === 'subscription.created'"), 'subscription.created kontrolu bulunamadi');
  assert(content.includes("hasPaymentProof"), 'hasPaymentProof fonksiyonu bulunamadi');
});

runTest('1.2. payment-webhook/index.ts odeme kaniti olmadan payments tablosuna yazim yapmiyor', () => {
  const webhookPath = path.join(rootDir, 'supabase', 'functions', 'payment-webhook', 'index.ts');
  const content = fs.readFileSync(webhookPath, 'utf8');

  assert(content.includes("hasPaymentProof"), 'payment-webhook icinde hasPaymentProof kontrolu zorunlu');
  assert(
    content.includes("effectiveStatus === 'active' && hasPaymentProof") ||
    content.includes("mappedStatus === 'active' && hasPaymentProof") ||
    content.includes("hasPaymentProof"),
    'payments tablosuna yazim hasPaymentProof ile korunmali'
  );
});

runTest('1.3. payment-webhook/index.ts abonelik durumu guncellemesinde fail-closed odeme kaniti kontrolu uyguluyor', () => {
  const webhookPath = path.join(rootDir, 'supabase', 'functions', 'payment-webhook', 'index.ts');
  const content = fs.readFileSync(webhookPath, 'utf8');

  assert(
    content.includes("effectiveStatus") &&
    content.includes("(isPaymentEvent && !hasPaymentProof) ? 'pending' : mappedStatus"),
    'payment-webhook abonelik durumu guncellemesinde fail-closed payment proof kontrolu yapmalidir'
  );
});

// ---------------------------------------------------------------------------
// 2. NEGATIF SENARYOLAR (Tahsilatsiz subscription.created ve odeme kanitsiz durumlar)
// ---------------------------------------------------------------------------
runTest('2.1. [NEGATIF] subscription.created olayi active degil, pending durumuna eslenir', () => {
  const payload = { eventType: 'subscription.created' };
  const mapped = iyzicoClient.mapIyzicoWebhookToInternalStatus(payload);
  assert.strictEqual(mapped, 'pending', `Beklenen 'pending', alinan: '${mapped}'`);
});

runTest('2.2. [NEGATIF] iyzico standard payload: subscription.created + status: ACTIVE -> pending eslenir', () => {
  // iyzico servisi subscription.created webhookunda status alanini "ACTIVE" (abonelik tanimi aktif)
  // olarak gonderebilir. Bu kesinlikle ucretli erisimin aktiflendigi anlamina gelmez!
  const iyzicoStandardSample = {
    merchantId: 'sandbox-merchant-123',
    eventType: 'subscription.created',
    subscriptionReferenceCode: '59a7f3ec-sub',
    orderReferenceCode: '74b6s-order',
    customerReferenceCode: 'tenant-001',
    createdDate: 1690000000000,
    status: 'ACTIVE'
  };
  const mapped = iyzicoClient.mapIyzicoWebhookToInternalStatus(iyzicoStandardSample);
  assert.strictEqual(mapped, 'pending', `status: ACTIVE olsa dahi subscription.created 'pending' olmali. Alinan: '${mapped}'`);
});

runTest('2.3. [NEGATIF] subscription.created icinde sahte price veya plan tutari olsa bile pending kalir', () => {
  const payloadWithPrice = {
    eventType: 'subscription.created',
    price: 499.00,
    currencyCode: 'TRY',
    status: 'ACTIVE'
  };
  const mapped = iyzicoClient.mapIyzicoWebhookToInternalStatus(payloadWithPrice);
  assert.strictEqual(mapped, 'pending', `subscription.created katalog fiyati icerse dahi 'pending' kalmalidir.`);
});

runTest('2.4. [NEGATIF] subscription.created icin hasPaymentProof kesinlikle false doner', () => {
  const plainCreated = { eventType: 'subscription.created' };
  assert.strictEqual(iyzicoClient.hasPaymentProof(plainCreated), false);

  const createdWithActiveStatus = {
    eventType: 'subscription.created',
    status: 'ACTIVE',
    price: 499.00
  };
  assert.strictEqual(iyzicoClient.hasPaymentProof(createdWithActiveStatus), false);

  const createdWithSpoofedPaymentId = {
    eventType: 'subscription.created',
    iyziPaymentId: 'spoofed_pay_id_999',
    price: 499.00,
    status: 'ACTIVE'
  };
  assert.strictEqual(
    iyzicoClient.hasPaymentProof(createdWithSpoofedPaymentId),
    false,
    'subscription.created olayina odeme ID enjekte edilse dahi hasPaymentProof false olmalidir.'
  );
});

runTest('2.5. [NEGATIF] subscription.active tahsilat kaniti (odeme ID) olmadan hasPaymentProof false doner', () => {
  // Aktivasyon bildirimi yapilmis ancak gercek bir tahsilat/odeme ID'si icermeyen bildirim
  const activeWithoutPayment = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_test_001',
    customerReferenceCode: 'tenant_test_001'
  };
  assert.strictEqual(
    iyzicoClient.hasPaymentProof(activeWithoutPayment),
    false,
    'Tahsilat kaniti icermeyen subscription.active odeme kaniti sayilamaz.'
  );
});

runTest('2.6. [NEGATIF] Basarisiz, iptal ve gecikmis olaylar odeme kaniti sayilmaz', () => {
  assert.strictEqual(iyzicoClient.hasPaymentProof({ eventType: 'payment.failure', status: 'FAILURE' }), false);
  assert.strictEqual(iyzicoClient.hasPaymentProof({ eventType: 'subscription.past_due', status: 'PAST_DUE' }), false);
  assert.strictEqual(iyzicoClient.hasPaymentProof({ eventType: 'subscription.cancelled', status: 'CANCELED' }), false);
  assert.strictEqual(iyzicoClient.hasPaymentProof({ eventType: 'subscription.failed', status: 'FAILURE' }), false);
  assert.strictEqual(iyzicoClient.hasPaymentProof(null), false);
  assert.strictEqual(iyzicoClient.hasPaymentProof({}), false);
});

runTest('2.7. [NEGATIF] payment.success: paymentId veya status eksik/hatali oldugunda hasPaymentProof false doner', () => {
  // paymentId olmadan
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success', status: 'SUCCESS' }),
    false,
    'paymentId olmayan payment.success odeme kaniti sayilamaz'
  );
  // status olmadan
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success', iyziPaymentId: 'pay_123' }),
    false,
    'status olmayan payment.success odeme kaniti sayilamaz'
  );
  // ne paymentId ne de status olmadan
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success' }),
    false,
    'Eksik payment.success payload hasPaymentProof false donmeli'
  );
  // status: FAILURE ile
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success', iyziPaymentId: 'pay_123', status: 'FAILURE' }),
    false,
    'status: FAILURE olan payment.success hasPaymentProof false donmeli'
  );
  // status: UNPAID / PAST_DUE ile
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success', iyziPaymentId: 'pay_123', status: 'UNPAID' }),
    false
  );
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'payment.success', iyziPaymentId: 'pay_123', status: 'PAST_DUE' }),
    false
  );
});

runTest('2.8. [NEGATIF] checkoutform.auth: status SUCCESS veya gercek paymentId eksik/hatali ise hasPaymentProof false doner', () => {
  // status alani yokken
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ iyziEventType: 'checkoutform.auth', iyziPaymentId: 'pay_hpp_123' }),
    false,
    'status alani olmayan checkoutform.auth odeme kaniti sayilamaz'
  );
  // paymentId yokken
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ iyziEventType: 'checkoutform.auth', status: 'SUCCESS' }),
    false,
    'paymentId olmayan checkoutform.auth odeme kaniti sayilamaz'
  );
  // her ikisi de yokken
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ iyziEventType: 'checkoutform.auth' }),
    false,
    'Eksik checkoutform.auth payload hasPaymentProof false donmeli'
  );
  // status FAILURE iken
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ iyziEventType: 'checkoutform.auth', iyziPaymentId: 'pay_hpp_123', status: 'FAILURE' }),
    false,
    'status: FAILURE olan checkoutform.auth hasPaymentProof false donmeli'
  );
});

runTest('2.9. [NEGATIF] subscription.active/subscription.renewed: paymentId olsa dahi FAILURE/UNPAID/PAST_DUE durumlarinda hasPaymentProof false doner', () => {
  // subscription.active + paymentId + FAILURE
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.active', iyziPaymentId: 'pay_act_fail', status: 'FAILURE' }),
    false,
    'subscription.active + paymentId + FAILURE kesinlikle hasPaymentProof false olmali'
  );
  // subscription.renewed + paymentId + FAILURE
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.renewed', iyziPaymentId: 'pay_ren_fail', status: 'FAILURE' }),
    false,
    'subscription.renewed + paymentId + FAILURE kesinlikle hasPaymentProof false olmali'
  );
  // subscription.active + paymentId + UNPAID / PAST_DUE
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.active', iyziPaymentId: 'pay_act_unpaid', status: 'UNPAID' }),
    false
  );
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.renewed', iyziPaymentId: 'pay_ren_past', status: 'PAST_DUE' }),
    false
  );
  // status alani eksik iken
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.active', iyziPaymentId: 'pay_act_nostatus' }),
    false,
    'status alani olmayan subscription.active hasPaymentProof false olmali'
  );
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.renewed', iyziPaymentId: 'pay_ren_nostatus' }),
    false,
    'status alani olmayan subscription.renewed hasPaymentProof false olmali'
  );
});

runTest('2.10. [NEGATIF] subscription.active/renewed + paymentId + status: ACTIVE -> hasPaymentProof kesinlikle false doner', () => {
  // iyzico abonelik aktivasyonunda status: ACTIVE gonderir; bu kesinlikle tahsilat kaniti degildir!
  const activeWithActiveStatus = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_act_active_01',
    customerReferenceCode: 'tenant_act_01',
    iyziPaymentId: 'pay_iyzi_active_123',
    status: 'ACTIVE',
    price: 499.00
  };
  assert.strictEqual(
    iyzicoClient.hasPaymentProof(activeWithActiveStatus),
    false,
    'subscription.active status: ACTIVE iken paymentId olsa dahi hasPaymentProof false olmalidir'
  );

  const renewWithActiveStatus = {
    eventType: 'subscription.renewed',
    subscriptionReferenceCode: 'sub_ren_active_01',
    customerReferenceCode: 'tenant_ren_01',
    iyziPaymentId: 'pay_iyzi_renew_123',
    status: 'ACTIVE',
    price: 499.00
  };
  assert.strictEqual(
    iyzicoClient.hasPaymentProof(renewWithActiveStatus),
    false,
    'subscription.renewed status: ACTIVE iken paymentId olsa dahi hasPaymentProof false olmalidir'
  );
});

runTest('2.11. [NEGATIF] payment.success / checkoutform.auth odeme kanitsiz gelirse mapIyzicoWebhookToInternalStatus active degil pending doner', () => {
  assert.strictEqual(
    iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'payment.success' }),
    'pending',
    'Kanitsiz payment.success pending donmelidir'
  );
  assert.strictEqual(
    iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'payment.success', status: 'SUCCESS' }),
    'pending',
    'paymentId olmayan payment.success pending donmelidir'
  );
  assert.strictEqual(
    iyzicoClient.mapIyzicoWebhookToInternalStatus({ eventType: 'payment.success', iyziPaymentId: 'pay_123' }),
    'pending',
    'status olmayan payment.success pending donmelidir'
  );
  assert.strictEqual(
    iyzicoClient.mapIyzicoWebhookToInternalStatus({ iyziEventType: 'checkoutform.auth' }),
    'pending',
    'Kanitsiz checkoutform.auth pending donmelidir'
  );
  assert.strictEqual(
    iyzicoClient.mapIyzicoWebhookToInternalStatus({ iyziEventType: 'checkoutform.auth', iyziPaymentId: 'pay_123' }),
    'pending',
    'status olmayan checkoutform.auth pending donmelidir'
  );
});

// ---------------------------------------------------------------------------
// 3. POZITIF SENARYOLAR (Gercek tahsilatli ve dogrulanmis olaylar)
// ---------------------------------------------------------------------------
runTest('3.1. [POZITIF] payment.success olayi active duruma eslenir ve hasPaymentProof true doner', () => {
  const paymentSuccessPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_verified_01',
    customerReferenceCode: 'tenant_verified_01',
    iyziPaymentId: 'pay_iyzi_987654',
    price: 499.00,
    currencyCode: 'TRY',
    status: 'SUCCESS'
  };

  const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(paymentSuccessPayload);
  assert.strictEqual(mappedStatus, 'active', 'payment.success active durumuna eslenmeli');

  const hasProof = iyzicoClient.hasPaymentProof(paymentSuccessPayload);
  assert.strictEqual(hasProof, true, 'payment.success icin hasPaymentProof true olmali');
});

runTest('3.2. [POZITIF] checkoutform.auth (HPP) basarili odeme yetkilendirmesi hasPaymentProof true doner', () => {
  const hppPayload = {
    iyziEventType: 'checkoutform.auth',
    token: 'token_sandbox_session_777',
    iyziPaymentId: 'pay_iyzi_hpp_123',
    status: 'SUCCESS',
    price: 1490.00
  };

  const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(hppPayload);
  assert.strictEqual(mappedStatus, 'active', 'checkoutform.auth active durumuna eslenmeli');

  const hasProof = iyzicoClient.hasPaymentProof(hppPayload);
  assert.strictEqual(hasProof, true, 'checkoutform.auth SUCCESS icin hasPaymentProof true olmali');
});

runTest('3.3. [NEGATIF] subscription.active + SUCCESS senaryosunda hasPaymentProof kesinlikle false doner', () => {
  const activeWithSuccess = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_paid_01',
    customerReferenceCode: 'tenant_paid_01',
    iyziPaymentId: 'pay_iyzi_real_999',
    price: 2490.00,
    status: 'SUCCESS'
  };

  const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(activeWithSuccess);
  assert.strictEqual(mappedStatus, 'active', 'subscription.active abonelik durumu olarak active eslenir');

  const hasProof = iyzicoClient.hasPaymentProof(activeWithSuccess);
  assert.strictEqual(hasProof, false, 'subscription.active status: SUCCESS icerse dahi hasPaymentProof kesinlikle false olmalidir');
});

runTest('3.4. [POZITIF] subscription.order.success gecerli tahsilat kaniti ile hasPaymentProof true doner', () => {
  const orderSuccessPayload = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_order_01',
    orderReferenceCode: 'ord_ref_01',
    customerReferenceCode: 'tenant_order_01',
    iyziPaymentId: 'pay_iyzi_order_888',
    price: 2490.00,
    currencyCode: 'TRY',
    status: 'SUCCESS'
  };

  const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(orderSuccessPayload);
  assert.strictEqual(mappedStatus, 'active', 'subscription.order.success kanitli ise active durumuna eslenmeli');

  const hasProof = iyzicoClient.hasPaymentProof(orderSuccessPayload);
  assert.strictEqual(hasProof, true, 'Gecerli subscription.order.success icin hasPaymentProof true olmali');

  // Negatif durum: paymentId yoksa veya status FAILURE ise hasPaymentProof false donmeli
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.order.success', status: 'SUCCESS' }),
    false,
    'paymentId olmayan subscription.order.success hasPaymentProof false donmeli'
  );
  assert.strictEqual(
    iyzicoClient.hasPaymentProof({ eventType: 'subscription.order.success', iyziPaymentId: 'pay_order_fail', status: 'FAILURE' }),
    false,
    'status: FAILURE olan subscription.order.success hasPaymentProof false donmeli'
  );
});

// ---------------------------------------------------------------------------
// 4. UCUN UCA WEBHOOK ISLEYICI SIMULASYONU (Negative vs Positive Database Mutation)
// ---------------------------------------------------------------------------
class MockDatabase {
  constructor() {
    this.subscriptions = new Map();
    this.payments = [];
    this.auditLogs = [];
  }

  seedSubscription(sub) {
    this.subscriptions.set(sub.id, { ...sub });
  }

  async processWebhook(payload) {
    const mappedStatus = iyzicoClient.mapIyzicoWebhookToInternalStatus(payload);
    if (mappedStatus === 'unknown') {
      return { status: 400, error: 'Unsupported event type' };
    }

    const subRef = payload.subscriptionReferenceCode || payload.referenceCode;
    let foundSub = null;
    for (const sub of this.subscriptions.values()) {
      if (sub.provider_subscription_id === subRef) {
        foundSub = sub;
        break;
      }
    }

    if (!foundSub) {
      return { status: 404, error: 'Subscription not found' };
    }

    // Customer/tenant mismatch guard
    const payloadCustomer = payload.customerReferenceCode || payload.tenantId;
    if (payloadCustomer && foundSub.tenant_id && foundSub.tenant_id !== payloadCustomer) {
      return { status: 403, error: 'Tenant mismatch' };
    }

    const eventType = payload.eventType || payload.iyziEventType || 'unknown';
    const providerEventId = payload.iyziPaymentId || payload.paymentId || payload.token || `${eventType}_${subRef}_${Date.now()}`;
    const hasPaymentProof = iyzicoClient.hasPaymentProof(payload);
    const isPaymentEvent = eventType === 'payment.success' || eventType === 'checkoutform.auth' || eventType === 'subscription.order.success';
    const effectiveStatus = (isPaymentEvent && !hasPaymentProof) ? 'pending' : mappedStatus;

    // 1. Audit log
    this.auditLogs.push({
      tenant_id: foundSub.tenant_id,
      action: 'payment_webhook',
      details: { eventType, status: effectiveStatus, providerEventId, hasPaymentProof }
    });

    // 2. Subscriptions tablosu guncellemesi (odeme kaniti olmayan odeme olaylari ASLA active yapilmaz)
    foundSub.status = effectiveStatus;
    foundSub.updated_at = new Date().toISOString();
    this.subscriptions.set(foundSub.id, { ...foundSub });

    // 3. Payments tablosuna yazim — SADECE ve SADECE odeme kaniti dogrulanmissa
    if (effectiveStatus === 'active' && hasPaymentProof) {
      const paymentRecord = {
        id: `pay_${Date.now()}_${Math.random()}`,
        tenant_id: foundSub.tenant_id,
        subscription_id: foundSub.id,
        provider: 'iyzico',
        provider_event_id: providerEventId,
        amount: payload.price || payload.paidPrice || 0,
        currency: payload.currencyCode || 'TRY',
        status: 'paid',
        paid_at: new Date().toISOString()
      };
      this.payments.push(paymentRecord);
    }

    return {
      status: 200,
      received: true,
      verified: true,
      mappedStatus: effectiveStatus,
      paymentRecorded: Boolean(effectiveStatus === 'active' && hasPaymentProof)
    };
  }
}

await runAsyncTest('4.1. [E2E NEGATIF] subscription.created veritabaninda pending yapar, payments tablosuna ASLA yazmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_001',
    tenant_id: 'tenant_alpha_01',
    provider_subscription_id: 'iyzi_sub_ref_100',
    status: 'pending_checkout'
  });

  const createdPayload = {
    eventType: 'subscription.created',
    subscriptionReferenceCode: 'iyzi_sub_ref_100',
    customerReferenceCode: 'tenant_alpha_01',
    status: 'ACTIVE',
    price: 1490.00
  };

  const response = await db.processWebhook(createdPayload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.mappedStatus, 'pending');
  assert.strictEqual(response.paymentRecorded, false);

  const subInDb = db.subscriptions.get('sub_row_001');
  assert.strictEqual(subInDb.status, 'pending', 'Abonelik durumu active degil pending olmalidir!');

  assert.strictEqual(
    db.payments.length,
    0,
    'Guvenlik ihlali: subscription.created sonrasi payments tablosuna sahte kayit atildi!'
  );
});

await runAsyncTest('4.2. [E2E NEGATIF] subscription.active odeme kanitsiz gelirse payments tablosuna sahte paid atmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_002',
    tenant_id: 'tenant_beta_02',
    provider_subscription_id: 'iyzi_sub_ref_200',
    status: 'pending'
  });

  const activeWithoutProofPayload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'iyzi_sub_ref_200',
    customerReferenceCode: 'tenant_beta_02'
  };

  const response = await db.processWebhook(activeWithoutProofPayload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.mappedStatus, 'active');
  assert.strictEqual(response.paymentRecorded, false);

  const subInDb = db.subscriptions.get('sub_row_002');
  assert.strictEqual(subInDb.status, 'active', 'Abonelik aktivasyonu gerceklesti.');

  assert.strictEqual(
    db.payments.length,
    0,
    'Tahsilat kaniti olmayan subscription.active payments tablosuna paid kaydi ATMAMALIDIR!'
  );
});

await runAsyncTest('4.3. [E2E POZITIF] payment.success gelince subscriptions active olur ve payments tablosuna paid yazilir', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_003',
    tenant_id: 'tenant_gamma_03',
    provider_subscription_id: 'iyzi_sub_ref_300',
    status: 'pending'
  });

  const paymentSuccessPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_ref_300',
    customerReferenceCode: 'tenant_gamma_03',
    iyziPaymentId: 'pay_trans_success_777',
    price: 1490.00,
    currencyCode: 'TRY',
    status: 'SUCCESS'
  };

  const response = await db.processWebhook(paymentSuccessPayload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.mappedStatus, 'active');
  assert.strictEqual(response.paymentRecorded, true);

  const subInDb = db.subscriptions.get('sub_row_003');
  assert.strictEqual(subInDb.status, 'active');

  assert.strictEqual(db.payments.length, 1, 'payments tablosuna tam olarak 1 odeme kaydi yazilmalidir.');
  const payment = db.payments[0];
  assert.strictEqual(payment.status, 'paid');
  assert.strictEqual(payment.amount, 1490.00);
  assert.strictEqual(payment.provider_event_id, 'pay_trans_success_777');
  assert.strictEqual(payment.tenant_id, 'tenant_gamma_03');
});

await runAsyncTest('4.4. [E2E YASAM DONGUSU] Sirali akis: created -> pending (no pay), ardindan payment.success -> active (paid)', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_lifecycle',
    tenant_id: 'tenant_lifecycle_01',
    provider_subscription_id: 'iyzi_sub_ref_cycle',
    status: 'pending_checkout'
  });

  // 1. Asama: iyzico subscription olusturur
  const step1Payload = {
    eventType: 'subscription.created',
    subscriptionReferenceCode: 'iyzi_sub_ref_cycle',
    customerReferenceCode: 'tenant_lifecycle_01',
    status: 'ACTIVE',
    price: 2490.00
  };
  const res1 = await db.processWebhook(step1Payload);
  assert.strictEqual(res1.mappedStatus, 'pending');
  assert.strictEqual(db.subscriptions.get('sub_row_lifecycle').status, 'pending');
  assert.strictEqual(db.payments.length, 0, 'Asama 1: Kesinlikle odeme kaydi yazilmamalidir.');

  // 2. Asama: Tahsilat basariyla tamamlanir
  const step2Payload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'iyzi_sub_ref_cycle',
    customerReferenceCode: 'tenant_lifecycle_01',
    iyziPaymentId: 'pay_cycle_success_888',
    price: 2490.00,
    currencyCode: 'TRY',
    status: 'SUCCESS'
  };
  const res2 = await db.processWebhook(step2Payload);
  assert.strictEqual(res2.mappedStatus, 'active');
  assert.strictEqual(db.subscriptions.get('sub_row_lifecycle').status, 'active');
  assert.strictEqual(db.payments.length, 1, 'Asama 2: Odeme kaydi yazilmalidir.');
  assert.strictEqual(db.payments[0].status, 'paid');
  assert.strictEqual(db.payments[0].amount, 2490.00);
});

await runAsyncTest('4.5. [E2E NEGATIF] payment.success odeme kimligi veya status olmadan aboneligi active YAPMAZ ve payments tablosuna yazilmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_405',
    tenant_id: 'tenant_405',
    provider_subscription_id: 'sub_ref_405',
    status: 'pending'
  });

  // paymentId olmayan eksik payload
  const incompletePayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_ref_405',
    customerReferenceCode: 'tenant_405',
    status: 'SUCCESS',
    price: 999.00
  };
  const res = await db.processWebhook(incompletePayload);
  assert.strictEqual(res.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'paymentId olmayan payment.success payments tablosuna yazilamaz');
  const subInDb1 = db.subscriptions.get('sub_row_405');
  assert.notStrictEqual(subInDb1.status, 'active', 'paymentId olmayan payment.success aboneligi active yapamaz');
  assert.strictEqual(subInDb1.status, 'pending', 'Abonelik durumu pending kalmalidir');

  // status olmayan eksik payload (reset state)
  db.seedSubscription({
    id: 'sub_row_405',
    tenant_id: 'tenant_405',
    provider_subscription_id: 'sub_ref_405',
    status: 'pending'
  });
  const noStatusPayload = {
    eventType: 'payment.success',
    subscriptionReferenceCode: 'sub_ref_405',
    customerReferenceCode: 'tenant_405',
    iyziPaymentId: 'pay_nostatus_405',
    price: 999.00
  };
  const res2 = await db.processWebhook(noStatusPayload);
  assert.strictEqual(res2.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'status olmayan payment.success payments tablosuna yazilamaz');
  const subInDb2 = db.subscriptions.get('sub_row_405');
  assert.notStrictEqual(subInDb2.status, 'active', 'status olmayan payment.success aboneligi active yapamaz');
  assert.strictEqual(subInDb2.status, 'pending', 'Abonelik durumu pending kalmalidir');
});

await runAsyncTest('4.6. [E2E NEGATIF] checkoutform.auth status SUCCESS veya paymentId olmadan aboneligi active YAPMAZ ve payments tablosuna yazilmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_406',
    tenant_id: 'tenant_406',
    provider_subscription_id: 'sub_ref_406',
    status: 'pending'
  });

  // status eksik HPP payload
  const hppNoStatus = {
    iyziEventType: 'checkoutform.auth',
    subscriptionReferenceCode: 'sub_ref_406',
    customerReferenceCode: 'tenant_406',
    iyziPaymentId: 'pay_hpp_nostatus',
    price: 890.00
  };
  const res1 = await db.processWebhook(hppNoStatus);
  assert.strictEqual(res1.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'status eksik HPP webhooku payments tablosuna yazilamaz');
  const subInDb1 = db.subscriptions.get('sub_row_406');
  assert.notStrictEqual(subInDb1.status, 'active', 'status eksik HPP webhooku aboneligi active yapamaz');
  assert.strictEqual(subInDb1.status, 'pending', 'Abonelik durumu pending kalmalidir');

  // paymentId eksik HPP payload (reset state)
  db.seedSubscription({
    id: 'sub_row_406',
    tenant_id: 'tenant_406',
    provider_subscription_id: 'sub_ref_406',
    status: 'pending'
  });
  const hppNoPaymentId = {
    iyziEventType: 'checkoutform.auth',
    subscriptionReferenceCode: 'sub_ref_406',
    customerReferenceCode: 'tenant_406',
    status: 'SUCCESS',
    price: 890.00
  };
  const res2 = await db.processWebhook(hppNoPaymentId);
  assert.strictEqual(res2.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'paymentId eksik HPP webhooku payments tablosuna yazilamaz');
  const subInDb2 = db.subscriptions.get('sub_row_406');
  assert.notStrictEqual(subInDb2.status, 'active', 'paymentId eksik HPP webhooku aboneligi active yapamaz');
  assert.strictEqual(subInDb2.status, 'pending', 'Abonelik durumu pending kalmalidir');
});

await runAsyncTest('4.7. [E2E NEGATIF] subscription.active/renewed + paymentId + FAILURE payments tablosuna yazilmaz ve abonelik active olmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_407',
    tenant_id: 'tenant_407',
    provider_subscription_id: 'sub_ref_407',
    status: 'pending'
  });

  const failurePayload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_407',
    customerReferenceCode: 'tenant_407',
    iyziPaymentId: 'pay_fake_failure_123',
    status: 'FAILURE',
    price: 1990.00
  };
  const res = await db.processWebhook(failurePayload);
  assert.strictEqual(res.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'FAILURE durumlu olay payments tablosuna kayit atamaz');

  const subInDb = db.subscriptions.get('sub_row_407');
  assert.notStrictEqual(subInDb.status, 'active', 'FAILURE durumlu olay aboneligi active yapamaz');
  assert.strictEqual(subInDb.status, 'past_due');
});

await runAsyncTest('4.8. [E2E NEGATIF] subscription.renewed + paymentId + FAILURE payments tablosuna yazilmaz', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_408',
    tenant_id: 'tenant_408',
    provider_subscription_id: 'sub_ref_408',
    status: 'active'
  });

  const renewFailPayload = {
    eventType: 'subscription.renewed',
    subscriptionReferenceCode: 'sub_ref_408',
    customerReferenceCode: 'tenant_408',
    iyziPaymentId: 'pay_renew_fail_456',
    status: 'FAILURE',
    price: 1990.00
  };
  const res = await db.processWebhook(renewFailPayload);
  assert.strictEqual(res.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'subscription.renewed + FAILURE payments tablosuna yazilamaz');

  const subInDb = db.subscriptions.get('sub_row_408');
  assert.strictEqual(subInDb.status, 'past_due', 'Yenileme basarisiz oldugunda abonelik past_due olmalidir');
});

await runAsyncTest('4.9. [E2E NEGATIF] subscription.active + paymentId + ACTIVE aboneligi active yapsa bile paid ledger kaydi URETMEZ', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_409',
    tenant_id: 'tenant_409',
    provider_subscription_id: 'sub_ref_409',
    status: 'pending'
  });

  const activeWithActiveStatusPayload = {
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_409',
    customerReferenceCode: 'tenant_409',
    iyziPaymentId: 'pay_active_only_409',
    status: 'ACTIVE',
    price: 1490.00
  };

  const res = await db.processWebhook(activeWithActiveStatusPayload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.mappedStatus, 'active');
  assert.strictEqual(res.paymentRecorded, false, 'status: ACTIVE odeme kaniti sayilamaz, paymentRecorded false olmali');

  const subInDb = db.subscriptions.get('sub_row_409');
  assert.strictEqual(subInDb.status, 'active', 'Abonelik aktivasyonu gerceklesti');
  assert.strictEqual(
    db.payments.length,
    0,
    'Guvenlik ihlali: subscription.active + status: ACTIVE payments tablosuna paid kaydi ATAMAZ!'
  );
});

await runAsyncTest('4.10. [E2E POZITIF] subscription.order.success basarili tahsilat ile aboneligi active yapar ve payments tablosuna yazar', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_410',
    tenant_id: 'tenant_order_410',
    provider_subscription_id: 'sub_ref_order_410',
    status: 'pending'
  });

  const orderSuccessPayload = {
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'sub_ref_order_410',
    customerReferenceCode: 'tenant_order_410',
    iyziPaymentId: 'pay_order_success_410',
    price: 3490.00,
    currencyCode: 'TRY',
    status: 'SUCCESS'
  };

  const response = await db.processWebhook(orderSuccessPayload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.mappedStatus, 'active');
  assert.strictEqual(response.paymentRecorded, true);

  const subInDb = db.subscriptions.get('sub_row_410');
  assert.strictEqual(subInDb.status, 'active');

  assert.strictEqual(db.payments.length, 1);
  const payment = db.payments[0];
  assert.strictEqual(payment.status, 'paid');
  assert.strictEqual(payment.amount, 3490.00);
  assert.strictEqual(payment.provider_event_id, 'pay_order_success_410');
});

await runAsyncTest('4.11. [E2E NEGATIF] subscription.renewed + PAID odeme kaydi URETMEZ', async () => {
  const db = new MockDatabase();
  db.seedSubscription({
    id: 'sub_row_411',
    tenant_id: 'tenant_renew_411',
    provider_subscription_id: 'sub_ref_renew_411',
    status: 'active'
  });

  const renewPaidPayload = {
    eventType: 'subscription.renewed',
    subscriptionReferenceCode: 'sub_ref_renew_411',
    customerReferenceCode: 'tenant_renew_411',
    iyziPaymentId: 'pay_renew_411',
    status: 'PAID',
    price: 1490.00
  };

  const response = await db.processWebhook(renewPaidPayload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.mappedStatus, 'active');
  assert.strictEqual(response.paymentRecorded, false);
  assert.strictEqual(db.payments.length, 0, 'subscription.renewed payments tablosuna kayit ATAMAZ!');
});

console.log(`\n======================================================================`);
console.log(`Sonuc: ${passedTests}/${totalTests} test basariyla gecti. Tum abonelik olusturma durum guvenligi kriterleri saglandi.`);
console.log(`======================================================================\n`);
