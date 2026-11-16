import fs from 'fs';
import os from 'os';
import path from 'path';
import assertNode from 'assert/strict';
import { pathToFileURL } from 'url';
import * as esbuild from 'esbuild';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${label}`);
    failed++;
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installMemoryLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    }
  };
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  return store;
}

console.log('=== Faz B3 — Manual-to-Online Subscription Lossless Transition QA ===\n');

installMemoryLocalStorage();
globalThis.__LARI_TRANSITION_TEST_STATE__ = {
  dataMode: 'local'
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lari-adim029-transition-'));
const tempBundlePath = path.join(tempDir, 'bundle.mjs');
const prevViteDataMode = process.env.VITE_DATA_MODE;

try {
  const virtualEntry = `
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'manualProvisioningService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'subscriptionLifecycleService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'subscriptionService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'commercialCatalogService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'tenantService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'planService.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'deterministicTestPaymentProvider.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'repositories', 'localCatalogRepository.ts'))};
    export * from ${JSON.stringify(path.join(process.cwd(), 'services', 'repositories', 'localBookingRepository.ts'))};
  `;

  const mockPlugin = {
    name: 'mock-supabase-and-mode',
    setup(build) {
      build.onResolve({ filter: /^\.\/supabaseClient(?:\.ts)?$/ }, () => ({
        path: 'mock-supabase-client',
        namespace: 'lari-transition-mock'
      }));
      build.onResolve({ filter: /^\.\/dataSourceConfig(?:\.ts)?$/ }, () => ({
        path: 'mock-data-source-config',
        namespace: 'lari-transition-mock'
      }));

      build.onLoad({ filter: /^mock-supabase-client$/, namespace: 'lari-transition-mock' }, () => ({
        contents: `
          export const supabase = {
            rpc: async () => ({ data: null, error: new Error('Offline test mode') })
          };
          export async function fetchSupabase() {
            return null;
          }
        `,
        loader: 'js'
      }));

      build.onLoad({ filter: /^mock-data-source-config$/, namespace: 'lari-transition-mock' }, () => ({
        contents: `
          export function getDataSourceMode() {
            return globalThis.__LARI_TRANSITION_TEST_STATE__.dataMode;
          }
          export const dataSourceConfig = {
            get mode() {
              return globalThis.__LARI_TRANSITION_TEST_STATE__.dataMode;
            }
          };
        `,
        loader: 'js'
      }));
    }
  };

  const result = await esbuild.build({
    stdin: {
      contents: virtualEntry,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [mockPlugin]
  });

  fs.writeFileSync(tempBundlePath, result.outputFiles[0].text, 'utf8');
  const mod = await import(pathToFileURL(tempBundlePath).href);

  const catalogRepo = new mod.LocalCatalogRepository();
  const bookingRepo = new mod.LocalBookingRepository();
  const paymentProvider = new mod.DeterministicTestPaymentProvider();
  const webhookStorage = new mod.InMemoryStorageAdapter();

  process.env.VITE_DATA_MODE = 'mock';
  const nowMs = Date.now();
  const earnedManualPaidThroughIso = new Date(nowMs + 45 * 24 * 60 * 60 * 1000).toISOString();
  const shorterOnlineCycleEndIso = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  const graceFutureIso = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastIso = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Seed V1-A manual_active Tenant A and isolation Tenant B
  const provA = await mod.manualProvisioningService.provisionTenant({
    businessName: 'Lari Miras Guzellik A',
    ownerName: 'Selin Yilmaz',
    ownerEmail: 'selin@larimiras.test',
    ownerPhone: '+905550001122',
    planId: 'standart',
    billingSource: 'offline_payment',
    subscriptionStatus: 'manual_active',
    paidThroughDate: earnedManualPaidThroughIso,
    manualActivationReason: 'v1a_manual_bank_transfer',
    paymentReferenceNote: 'HAVALE-2026-A01',
    publicSlug: 'lari-miras-a',
    setupNotes: 'Migrated from V1-A offline contract',
    publishStatus: true
  });
  await sleep(3);
  const provB = await mod.manualProvisioningService.provisionTenant({
    businessName: 'Lari Izolasyon Salon B',
    ownerName: 'Deniz Kaya',
    ownerEmail: 'deniz@lariizolasyon.test',
    ownerPhone: '+905550003344',
    planId: 'professional',
    billingSource: 'manual_invoice',
    subscriptionStatus: 'manual_active',
    paidThroughDate: new Date(nowMs + 20 * 24 * 60 * 60 * 1000).toISOString(),
    manualActivationReason: 'v1a_control_tenant',
    paymentReferenceNote: 'FATURA-2026-B01',
    publicSlug: 'lari-izolasyon-b',
    publishStatus: true
  });

  const tenantAId = provA.tenantId;
  const tenantBId = provB.tenantId;
  assert(
    provA.success === true && Boolean(tenantAId) && provB.success === true && Boolean(tenantBId) && tenantAId !== tenantBId,
    'Seeded V1-A manual_active Tenant A and isolated Tenant B with distinct tenantIds'
  );

  // 2. Populate realistic operational records for Tenant A & Tenant B
  const srvA1 = await catalogRepo.createService(tenantAId, {
    name: 'Lazer Epilasyon Paketi',
    duration: 45,
    price: 1850,
    category: 'Bakim',
    active: true
  });
  await sleep(3);
  const srvA2 = await catalogRepo.createService(tenantAId, {
    name: 'Cilt Bakimi Pro',
    duration: 60,
    price: 2200,
    category: 'Cilt',
    active: true
  });
  await sleep(3);
  const stfA1 = await catalogRepo.createStaff(tenantAId, {
    name: 'Ece Aydin',
    specialty: 'Estetisyen',
    avatar: '',
    active: true
  });
  await sleep(3);
  const stfA2 = await catalogRepo.createStaff(tenantAId, {
    name: 'Mert Demir',
    specialty: 'Uzman',
    avatar: '',
    active: true
  });
  await catalogRepo.assignServiceToStaff(stfA1.id, srvA1.id, tenantAId);
  await catalogRepo.assignServiceToStaff(stfA2.id, srvA2.id, tenantAId);

  const aptDateA = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const aptA1 = await bookingRepo.createAppointment(tenantAId, {
    serviceId: srvA1.id,
    staffId: stfA1.id,
    date: aptDateA,
    time: '10:00',
    user_name: 'Zeynep Acar',
    phone: '+905559990001',
    user_email: 'zeynep@customer.test',
    status: 'confirmed'
  });
  const aptA2 = await bookingRepo.createAppointment(tenantAId, {
    serviceId: srvA2.id,
    staffId: stfA2.id,
    date: aptDateA,
    time: '14:00',
    user_name: 'Burcu Arslan',
    phone: '+905559990002',
    user_email: 'burcu@customer.test',
    status: 'confirmed'
  });
  const customersAInitial = await bookingRepo.listCustomers(tenantAId);
  await bookingRepo.addCustomerNote(
    customersAInitial[0].id,
    'Hassas cilt notu - V1A arsivi',
    'Selin Yilmaz',
    tenantAId
  );

  // Tenant B operational records
  const srvB1 = await catalogRepo.createService(tenantBId, {
    name: 'Sac Tasarimi B',
    duration: 30,
    price: 900,
    category: 'Sac',
    active: true
  });
  await sleep(3);
  const stfB1 = await catalogRepo.createStaff(tenantBId, {
    name: 'Can Yildiz',
    specialty: 'Kuafor',
    avatar: '',
    active: true
  });
  await catalogRepo.assignServiceToStaff(stfB1.id, srvB1.id, tenantBId);
  const aptB1 = await bookingRepo.createAppointment(tenantBId, {
    serviceId: srvB1.id,
    staffId: stfB1.id,
    date: aptDateA,
    time: '11:00',
    user_name: 'Asli Ozturk',
    phone: '+905558880001',
    user_email: 'asli@tenantb.test',
    status: 'confirmed'
  });

  async function readTenantOperationalSnapshot(targetTenantId) {
    const tenant = await mod.tenantService.getTenantById(targetTenantId);
    const services = await catalogRepo.listServices(targetTenantId);
    const staff = await catalogRepo.listStaff(targetTenantId);
    const staff1Services = (await catalogRepo.listServicesForStaff(targetTenantId, staff[0].id)).map((s) => s.id);
    const appointments = await bookingRepo.listAppointments(targetTenantId);
    const customers = await bookingRepo.listCustomers(targetTenantId);
    const subscription = JSON.parse(globalThis.localStorage.getItem(`mock_subscription_${targetTenantId}`) || 'null');
    return { tenant, services, staff, staff1Services, appointments, customers, subscription };
  }

  function assertLosslessOperationalState(stageLabel, current, baseline) {
    assertNode.ok(Boolean(current.tenant?.id), `${stageLabel}: tenant object missing`);
    assertNode.ok(Boolean(current.tenant?.slug), `${stageLabel}: tenant slug missing`);
    assertNode.equal(current.tenant?.id, baseline.tenant?.id, `${stageLabel}: tenantId mismatch`);
    assertNode.equal(current.tenant?.slug, baseline.tenant?.slug, `${stageLabel}: slug mismatch`);
    assertNode.equal(current.tenant?.name, baseline.tenant?.name, `${stageLabel}: tenant name mismatch`);
    assertNode.deepEqual(current.services, baseline.services, `${stageLabel}: services altered`);
    assertNode.deepEqual(current.staff, baseline.staff, `${stageLabel}: staff altered`);
    assertNode.deepEqual(current.staff1Services, baseline.staff1Services, `${stageLabel}: staff-service mapping altered`);
    assertNode.deepEqual(current.appointments, baseline.appointments, `${stageLabel}: appointments altered`);
    assertNode.deepEqual(current.customers, baseline.customers, `${stageLabel}: customers altered`);
  }

  const baselineA = deepClone(await readTenantOperationalSnapshot(tenantAId));
  const baselineB = deepClone(await readTenantOperationalSnapshot(tenantBId));
  assert(
    baselineA.services.length === 2 &&
      baselineA.staff.length === 2 &&
      baselineA.appointments.length === 2 &&
      baselineA.customers.length === 2 &&
      baselineA.customers[0].internalNotes?.length === 1 &&
      baselineB.appointments.length === 1 &&
      aptA1.id !== aptA2.id &&
      aptB1.tenantId === tenantBId,
    'Baseline V1-A operational records (services, staff, mappings, appointments, customers + notes) populated cleanly'
  );

  // 3. Test rollback guards & reversible transition before online checkout settles
  process.env.VITE_DATA_MODE = 'supabase';
  const supaBlockedTransition = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: 'professional'
  });
  process.env.VITE_DATA_MODE = 'mock';
  assert(
    supaBlockedTransition.success === false && /supabase/i.test(supaBlockedTransition.error || ''),
    'initiateOnlineSubscriptionTransition fails closed in supabase mode'
  );

  process.env.VITE_DATA_MODE = 'production';
  const prodBlockedTransition = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: 'professional'
  });
  assert(
    prodBlockedTransition.success === false && /production/i.test(prodBlockedTransition.error || ''),
    'initiateOnlineSubscriptionTransition fails closed in non-simulation production mode'
  );
  process.env.VITE_DATA_MODE = 'mock';

  // Negative targetPlanId validation checks
  const blankTargetTransition = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: '   '
  });
  const unknownTargetTransition = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: 'non_existent_plan_99'
  });
  const legacySwitchCheck = mod.subscriptionLifecycleService.prepareManualToOnlineCheckoutTransition(
    {
      tenantId: 'tenant-baslangic-check',
      planId: 'baslangic',
      status: 'manual_active',
      cancelAtPeriodEnd: false,
      manualActivationReason: 'manual_invoice_v1'
    },
    { targetPlanId: 'standart' }
  );
  assert(
    blankTargetTransition.success === false &&
      unknownTargetTransition.success === false &&
      legacySwitchCheck.success === false &&
      legacySwitchCheck.errorCode === 'INVALID_TARGET_PLAN',
    'Checkout transition rejects empty targetPlanId, unknown planId, and new assignment to legacy standart'
  );

  const pendingAttempt = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: 'professional',
    paymentProvider: 'iyzico',
    providerSubscriptionId: 'sub_ref_tenant_a_v1'
  });
  assert(
    pendingAttempt.success === true &&
      pendingAttempt.subscription?.status === 'pending_checkout' &&
      pendingAttempt.subscription?.paidThroughDate === earnedManualPaidThroughIso &&
      pendingAttempt.subscription?.planId === 'standart' &&
      pendingAttempt.subscription?.scheduledPlanId === 'professional' &&
      pendingAttempt.subscription?.planChangeStatus === 'upgrade_pending' &&
      pendingAttempt.tenant?.id === tenantAId &&
      pendingAttempt.tenant?.slug === 'lari-miras-a' &&
      pendingAttempt.tenant?.planId === 'standart',
    'Transitioned manual_active -> pending_checkout preserving tenantId, slug, paidThroughDate, and keeping planId un-upgraded until settlement'
  );

  // Negative rollback checks
  const emptyReasonRollback = await mod.manualProvisioningService.rollbackPendingCheckoutToManualActive(tenantAId, '   ');
  const settledPaymentRollback = mod.subscriptionLifecycleService.rollbackManualCheckoutToManualActive(
    { ...pendingAttempt.subscription, lastPaymentStatus: 'paid' },
    'late_attempt'
  );
  const nonManualOriginRollback = mod.subscriptionLifecycleService.rollbackManualCheckoutToManualActive(
    {
      tenantId: 'tenant-self-serve',
      planId: 'professional',
      status: 'pending_checkout',
      cancelAtPeriodEnd: false,
      paymentProvider: 'iyzico'
    },
    'not_manual'
  );
  assert(
    emptyReasonRollback.success === false &&
      settledPaymentRollback.success === false &&
      settledPaymentRollback.errorCode === 'CHECKOUT_ALREADY_SETTLED' &&
      nonManualOriginRollback.success === false &&
      nonManualOriginRollback.errorCode === 'NOT_A_MANUAL_ORIGIN_CHECKOUT',
    'Rollback fails closed for empty reason, settled payment, or non-manual checkout origin'
  );

  const rollbackOk = await mod.manualProvisioningService.rollbackPendingCheckoutToManualActive(
    tenantAId,
    'customer_cancelled_3ds_before_payment'
  );
  const afterRollbackA = await readTenantOperationalSnapshot(tenantAId);
  assertLosslessOperationalState('After Rollback', afterRollbackA, baselineA);
  assert(
    rollbackOk.success === true &&
      afterRollbackA.subscription?.status === 'manual_active' &&
      afterRollbackA.subscription?.planId === 'standart' &&
      afterRollbackA.subscription?.scheduledPlanId === undefined &&
      afterRollbackA.subscription?.planChangeStatus === 'none' &&
      afterRollbackA.tenant?.planId === 'standart' &&
      afterRollbackA.subscription?.paidThroughDate === earnedManualPaidThroughIso &&
      afterRollbackA.subscription?.paymentReferenceNote === 'HAVALE-2026-A01',
    'Valid pre-settlement rollback restores manual_active, clears pending upgrade plan, keeps paidThroughDate and zero operational loss'
  );

  // 4. Full lifecycle progression: manual_active -> pending_checkout -> active -> past_due (grace) -> cancelled
  const checkoutStart = await mod.manualProvisioningService.initiateOnlineSubscriptionTransition(tenantAId, {
    targetPlanId: 'professional',
    paymentProvider: 'iyzico',
    providerSubscriptionId: 'sub_ref_tenant_a_live'
  });
  assert(
    checkoutStart.success === true && checkoutStart.subscription?.status === 'pending_checkout',
    'Re-initiated online transition manual_active -> pending_checkout cleanly'
  );
  await webhookStorage.saveSubscription(checkoutStart.subscription);

  // Negative webhook guard: unverified manual_active -> pending_checkout webhook without matching customerReferenceCode
  const unverifiedManualSubRef = 'sub_ref_manual_guard_check';
  await webhookStorage.saveSubscription({
    ...baselineA.subscription,
    tenantId: 'tenant-manual-guard-only',
    providerSubscriptionId: unverifiedManualSubRef
  });
  const tsGuard = new Date(nowMs - 400_000).toISOString();
  const guardRaw = JSON.stringify({
    providerEventId: 'evt_unverified_manual_01',
    eventType: 'subscription.created',
    subscriptionReferenceCode: unverifiedManualSubRef,
    status: 'PENDING',
    eventTimestamp: tsGuard
  });
  const guardSigned = paymentProvider.signWebhookPayload(guardRaw);
  const guardRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    {
      providerEventId: 'evt_unverified_manual_01',
      eventType: 'subscription.created',
      subscriptionReferenceCode: unverifiedManualSubRef,
      status: 'PENDING',
      eventTimestamp: tsGuard,
      rawPayload: guardSigned.rawPayload
    },
    webhookStorage,
    { provider: paymentProvider, headers: guardSigned.headers, rawPayload: guardSigned.rawPayload }
  );
  assert(
    guardRes.success === false && guardRes.errorCode === 'UNVERIFIED_MANUAL_TRANSITION',
    'Webhook transitioning manual_active -> pending_checkout without verified tenant/customer reference fails closed'
  );

  // Negative cross-tenant webhook rejection on pending_checkout subscription
  const tsCross = new Date(nowMs - 350_000).toISOString();
  const crossPayloadObj = {
    providerEventId: 'evt_cross_tenant_01',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantBId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_cross_01',
    amountMinor: 1000,
    currencyCode: 'TRY',
    eventTimestamp: tsCross
  };
  const crossSigned = paymentProvider.signWebhookPayload(JSON.stringify(crossPayloadObj));
  const crossRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...crossPayloadObj, rawPayload: crossSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: crossSigned.headers, rawPayload: crossSigned.rawPayload }
  );
  assert(
    crossRes.success === false && crossRes.errorCode === 'TENANT_MISMATCH',
    `Cross-tenant webhook claiming Tenant A checkout via Tenant B customerReferenceCode fails closed (got ${crossRes.errorCode})`
  );

  // Stage B: Negative checkout-binding guards before pending_checkout -> active promotion
  const proPlan = mod.planService.getPlan('professional');
  const expectedProMinor = Math.round((proPlan?.monthlyPrice || 3490) * 100);

  // Negative B1: 1 TRY (100 minor) paid record for professional target must fail closed
  await webhookStorage.savePayment({
    id: 'pay_tenant_a_low_1try_001',
    tenantId: tenantAId,
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    amountMinor: 100,
    currency: 'TRY',
    status: 'paid',
    targetPlanId: 'professional',
    expectedAmountMinor: 100,
    expectedCurrency: 'TRY'
  });
  const tsLowAmount = new Date(nowMs - 340_000).toISOString();
  const lowAmountPayloadObj = {
    providerEventId: 'evt_tenant_a_low_1try_001',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_tenant_a_low_1try_001',
    amountMinor: 100,
    currencyCode: 'TRY',
    currentPeriodEnd: shorterOnlineCycleEndIso,
    paidThroughDate: shorterOnlineCycleEndIso,
    eventTimestamp: tsLowAmount
  };
  const lowAmountSigned = paymentProvider.signWebhookPayload(JSON.stringify(lowAmountPayloadObj));
  const lowAmountRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...lowAmountPayloadObj, rawPayload: lowAmountSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: lowAmountSigned.headers, rawPayload: lowAmountSigned.rawPayload }
  );
  const subAfterLowAmount = webhookStorage.getSubscription(tenantAId);
  assert(
    lowAmountRes.success === false &&
      lowAmountRes.errorCode === 'PAYMENT_AMOUNT_MISMATCH' &&
      subAfterLowAmount?.status === 'pending_checkout' &&
      subAfterLowAmount?.planId === 'standart' &&
      subAfterLowAmount?.scheduledPlanId === 'professional' &&
      (await webhookStorage.hasProcessedEvent('evt_tenant_a_low_1try_001')) === false,
    'Low-amount (1 TRY) paid payment record fails closed without activating or promoting scheduledPlanId'
  );

  // Negative B2: Paid payment bound to a different planId ('baslangic') must fail closed
  await webhookStorage.savePayment({
    id: 'pay_tenant_a_wrong_plan_001',
    tenantId: tenantAId,
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    amountMinor: expectedProMinor,
    currency: 'TRY',
    status: 'paid',
    targetPlanId: 'baslangic',
    expectedAmountMinor: expectedProMinor,
    expectedCurrency: 'TRY'
  });
  const tsWrongPlan = new Date(nowMs - 330_000).toISOString();
  const wrongPlanPayloadObj = {
    providerEventId: 'evt_tenant_a_wrong_plan_001',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_tenant_a_wrong_plan_001',
    amountMinor: expectedProMinor,
    currencyCode: 'TRY',
    currentPeriodEnd: shorterOnlineCycleEndIso,
    paidThroughDate: shorterOnlineCycleEndIso,
    eventTimestamp: tsWrongPlan
  };
  const wrongPlanSigned = paymentProvider.signWebhookPayload(JSON.stringify(wrongPlanPayloadObj));
  const wrongPlanRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...wrongPlanPayloadObj, rawPayload: wrongPlanSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: wrongPlanSigned.headers, rawPayload: wrongPlanSigned.rawPayload }
  );
  const subAfterWrongPlan = webhookStorage.getSubscription(tenantAId);
  assert(
    wrongPlanRes.success === false &&
      wrongPlanRes.errorCode === 'PAYMENT_PLAN_MISMATCH' &&
      subAfterWrongPlan?.status === 'pending_checkout' &&
      subAfterWrongPlan?.planId === 'standart' &&
      subAfterWrongPlan?.scheduledPlanId === 'professional' &&
      (await webhookStorage.hasProcessedEvent('evt_tenant_a_wrong_plan_001')) === false,
    'Paid payment bound to different targetPlanId fails closed without activating or promoting scheduledPlanId'
  );

  // Negative B3: Unbound paid payment (missing targetPlanId/expected binding) & mismatched currency fail closed
  await webhookStorage.savePayment({
    id: 'pay_tenant_a_unbound_001',
    tenantId: tenantAId,
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    amountMinor: expectedProMinor,
    currency: 'TRY',
    status: 'paid'
  });
  const tsUnbound = new Date(nowMs - 320_000).toISOString();
  const unboundPayloadObj = {
    providerEventId: 'evt_tenant_a_unbound_001',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_tenant_a_unbound_001',
    amountMinor: expectedProMinor,
    currencyCode: 'TRY',
    eventTimestamp: tsUnbound
  };
  const unboundSigned = paymentProvider.signWebhookPayload(JSON.stringify(unboundPayloadObj));
  const unboundRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...unboundPayloadObj, rawPayload: unboundSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: unboundSigned.headers, rawPayload: unboundSigned.rawPayload }
  );

  await webhookStorage.savePayment({
    id: 'pay_tenant_a_wrong_curr_001',
    tenantId: tenantAId,
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    amountMinor: expectedProMinor,
    currency: 'USD',
    status: 'paid',
    targetPlanId: 'professional',
    expectedAmountMinor: expectedProMinor,
    expectedCurrency: 'USD'
  });
  const tsWrongCurr = new Date(nowMs - 310_000).toISOString();
  const wrongCurrPayloadObj = {
    providerEventId: 'evt_tenant_a_wrong_curr_001',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_tenant_a_wrong_curr_001',
    amountMinor: expectedProMinor,
    currencyCode: 'USD',
    eventTimestamp: tsWrongCurr
  };
  const wrongCurrSigned = paymentProvider.signWebhookPayload(JSON.stringify(wrongCurrPayloadObj));
  const wrongCurrRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...wrongCurrPayloadObj, rawPayload: wrongCurrSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: wrongCurrSigned.headers, rawPayload: wrongCurrSigned.rawPayload }
  );
  const subAfterCurrencyFail = webhookStorage.getSubscription(tenantAId);
  assert(
    unboundRes.success === false &&
      unboundRes.errorCode === 'PAYMENT_PLAN_MISMATCH' &&
      wrongCurrRes.success === false &&
      wrongCurrRes.errorCode === 'CURRENCY_MISMATCH' &&
      subAfterCurrencyFail?.status === 'pending_checkout' &&
      subAfterCurrencyFail?.planId === 'standart' &&
      subAfterCurrencyFail?.scheduledPlanId === 'professional',
    'Unbound payment record and mismatched-currency payment record fail closed without promoting scheduledPlanId'
  );

  // Stage B (Valid): pending_checkout -> active via verified signed webhook + checkout-correlated paid record
  await webhookStorage.savePayment({
    id: 'pay_tenant_a_live_001',
    tenantId: tenantAId,
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    amountMinor: expectedProMinor,
    currency: 'TRY',
    status: 'paid',
    targetPlanId: 'professional',
    expectedAmountMinor: expectedProMinor,
    expectedCurrency: 'TRY'
  });

  const tsActive = new Date(nowMs - 300_000).toISOString();
  const activePayloadObj = {
    providerEventId: 'evt_tenant_a_active_001',
    eventType: 'subscription.active',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'ACTIVE',
    paymentStatus: 'paid',
    paymentId: 'pay_tenant_a_live_001',
    amountMinor: expectedProMinor,
    currencyCode: 'TRY',
    currentPeriodEnd: shorterOnlineCycleEndIso,
    paidThroughDate: shorterOnlineCycleEndIso,
    eventTimestamp: tsActive
  };
  const activeSigned = paymentProvider.signWebhookPayload(JSON.stringify(activePayloadObj));
  const activeRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...activePayloadObj, rawPayload: activeSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: activeSigned.headers, rawPayload: activeSigned.rawPayload }
  );

  assert(
    activeRes.success === true &&
      activeRes.subscription?.status === 'active' &&
      activeRes.subscription?.planId === 'professional' &&
      activeRes.subscription?.scheduledPlanId === undefined &&
      activeRes.subscription?.planChangeStatus === 'none' &&
      activeRes.subscription?.paidThroughDate === earnedManualPaidThroughIso &&
      activeRes.subscription?.currentPeriodEnd === earnedManualPaidThroughIso,
    'pending_checkout -> active promotes scheduledPlanId and preserves longer earned manual paidThroughDate without truncation'
  );

  globalThis.localStorage.setItem(
    `mock_subscription_${tenantAId}`,
    JSON.stringify(activeRes.subscription)
  );
  await mod.tenantService.updateTenant(tenantAId, { planId: activeRes.subscription.planId });
  const activeSnapshotEligible = mod.isCommercialSubscriptionSnapshotEligible(
    {
      success: true,
      tenant_id: tenantAId,
      status: activeRes.subscription.status,
      current_period_end: activeRes.subscription.currentPeriodEnd,
      paid_through_date: activeRes.subscription.paidThroughDate
    },
    nowMs
  );
  const afterActiveA = await readTenantOperationalSnapshot(tenantAId);
  assertLosslessOperationalState('Stage active', afterActiveA, baselineA);
  assert(
    activeSnapshotEligible === true && afterActiveA.tenant?.planId === 'professional',
    'Active subscription preserves full commercial eligibility and zero operational data loss'
  );

  // Stage C: active -> past_due (grace window)
  const tsGrace = new Date(nowMs - 200_000).toISOString();
  const gracePayloadObj = {
    providerEventId: 'evt_tenant_a_grace_002',
    eventType: 'payment.failed',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    status: 'PAST_DUE',
    eventTimestamp: tsGrace
  };
  const graceSigned = paymentProvider.signWebhookPayload(JSON.stringify(gracePayloadObj));
  const graceRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...gracePayloadObj, rawPayload: graceSigned.rawPayload },
    webhookStorage,
    { provider: paymentProvider, headers: graceSigned.headers, rawPayload: graceSigned.rawPayload }
  );
  assert(
    graceRes.success === true && graceRes.subscription?.status === 'past_due',
    'active -> past_due (grace) webhook transition succeeds cleanly'
  );

  globalThis.localStorage.setItem(
    `mock_subscription_${tenantAId}`,
    JSON.stringify(graceRes.subscription)
  );
  const strictPastDueEligible = mod.isCommercialSubscriptionSnapshotEligible(
    {
      success: true,
      tenant_id: tenantAId,
      status: 'past_due',
      current_period_end: shorterOnlineCycleEndIso
    },
    nowMs
  );
  const activeGraceEligible = mod.isLegacySubscriptionSnapshotEligible(
    {
      success: true,
      tenant_id: tenantAId,
      status: 'past_due',
      current_period_end: pastIso,
      grace_until: graceFutureIso
    },
    nowMs
  );
  const afterGraceA = await readTenantOperationalSnapshot(tenantAId);
  assertLosslessOperationalState('Stage past_due/grace', afterGraceA, baselineA);
  assert(
    strictPastDueEligible === false && activeGraceEligible === true,
    'past_due preserves grace eligibility under explicit grace_until while strict commercial default stays fail-closed'
  );

  // Stage D: Public synthetic cancellation webhooks rejected; past_due (grace) -> cancelled via authorized provider-state reconciliation
  assert(
    mod.subscriptionLifecycleService.mapEventToTargetStatus('subscription.cancelled') === null &&
      mod.subscriptionLifecycleService.mapEventToTargetStatus('subscription.expired') === null,
    'mapEventToTargetStatus rejects synthetic cancellation event aliases'
  );

  const tsCancelSynthetic = new Date(nowMs - 150_000).toISOString();
  const syntheticCancelledPayloadObj = {
    providerEventId: 'evt_tenant_a_synthetic_cancel_001',
    eventType: 'subscription.cancelled',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'CANCELLED',
    eventTimestamp: tsCancelSynthetic
  };
  const syntheticCancelledSigned = paymentProvider.signWebhookPayload(JSON.stringify(syntheticCancelledPayloadObj));
  const syntheticCancelledRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...syntheticCancelledPayloadObj, rawPayload: syntheticCancelledSigned.rawPayload },
    webhookStorage,
    {
      provider: paymentProvider,
      headers: syntheticCancelledSigned.headers,
      rawPayload: syntheticCancelledSigned.rawPayload
    }
  );

  const tsExpiredSynthetic = new Date(nowMs - 125_000).toISOString();
  const syntheticExpiredPayloadObj = {
    providerEventId: 'evt_tenant_a_synthetic_expired_001',
    eventType: 'subscription.expired',
    subscriptionReferenceCode: 'sub_ref_tenant_a_live',
    customerReferenceCode: tenantAId,
    tenantId: tenantAId,
    status: 'EXPIRED',
    eventTimestamp: tsExpiredSynthetic
  };
  const syntheticExpiredSigned = paymentProvider.signWebhookPayload(JSON.stringify(syntheticExpiredPayloadObj));
  const syntheticExpiredRes = await mod.subscriptionLifecycleService.processVerifiedWebhook(
    { ...syntheticExpiredPayloadObj, rawPayload: syntheticExpiredSigned.rawPayload },
    webhookStorage,
    {
      provider: paymentProvider,
      headers: syntheticExpiredSigned.headers,
      rawPayload: syntheticExpiredSigned.rawPayload
    }
  );

  const subAfterSyntheticWebhooks = webhookStorage.getSubscription(tenantAId);
  assert(
    syntheticCancelledRes.success === false &&
      syntheticCancelledRes.errorCode === 'PROVIDER_STATE_RECONCILIATION_REQUIRED' &&
      syntheticExpiredRes.success === false &&
      syntheticExpiredRes.errorCode === 'PROVIDER_STATE_RECONCILIATION_REQUIRED' &&
      subAfterSyntheticWebhooks?.status === 'past_due' &&
      (await webhookStorage.hasProcessedEvent('evt_tenant_a_synthetic_cancel_001')) === false &&
      (await webhookStorage.hasProcessedEvent('evt_tenant_a_synthetic_expired_001')) === false,
    'Signed synthetic subscription.cancelled and subscription.expired webhooks fail closed as PROVIDER_STATE_RECONCILIATION_REQUIRED without mutating state'
  );

  // Authorized reconciliation boundary: fails closed in supabase/production mode, transitions past_due -> cancelled in authorized execution
  process.env.VITE_DATA_MODE = 'supabase';
  let supaReconcileBlocked = false;
  try {
    await mod.subscriptionService.reconcileSubscriptionWithProvider(tenantAId, { status: 'CANCELLED' });
  } catch (err) {
    supaReconcileBlocked = /unauthorized/i.test(err?.message || '');
  }
  process.env.VITE_DATA_MODE = 'mock';
  assert(
    supaReconcileBlocked === true,
    'Client-side reconcileSubscriptionWithProvider fails closed in supabase mode (requires server-side RPC)'
  );

  const reconcileCancelRes = await mod.subscriptionService.reconcileSubscriptionWithProvider(tenantAId, {
    status: 'CANCELLED'
  });
  await webhookStorage.saveSubscription(reconcileCancelRes.subscription);
  assert(
    reconcileCancelRes.inSync === false && reconcileCancelRes.subscription?.status === 'cancelled',
    'past_due -> cancelled authorized provider-state reconciliation transition succeeds cleanly'
  );

  const canceledEligible = mod.isLegacySubscriptionSnapshotEligible(
    {
      success: true,
      tenant_id: tenantAId,
      status: reconcileCancelRes.subscription.status,
      current_period_end: earnedManualPaidThroughIso,
      grace_until: graceFutureIso
    },
    nowMs
  );
  const reactivateAttempt = mod.subscriptionLifecycleService.isValidTransition('cancelled', 'active');
  const afterCancelA = await readTenantOperationalSnapshot(tenantAId);
  assertLosslessOperationalState('Stage cancelled', afterCancelA, baselineA);
  assert(
    afterCancelA.subscription?.status === 'cancelled' &&
      canceledEligible === false &&
      reactivateAttempt === false,
    'Cancelled subscription via authorized reconciliation blocks commercial eligibility and terminal reactivation while preserving 100% historical operational data'
  );

  // 5. Final check: Tenant B remained completely isolated and unmodified
  const finalB = await readTenantOperationalSnapshot(tenantBId);
  assertLosslessOperationalState('Tenant B Isolation', finalB, baselineB);
  assert(
    finalB.subscription?.status === 'manual_active' && finalB.subscription?.planId === 'professional',
    'Isolation control Tenant B remained untouched in manual_active across all Tenant A transitions'
  );
} finally {
  if (prevViteDataMode === undefined) {
    delete process.env.VITE_DATA_MODE;
  } else {
    process.env.VITE_DATA_MODE = prevViteDataMode;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
console.log('✅ Faz B3 Manual-to-Online Subscription Lossless Transition QA PASSED.\n');
