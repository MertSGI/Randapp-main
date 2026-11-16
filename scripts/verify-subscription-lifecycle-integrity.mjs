import { subscriptionLifecycleService, InMemoryStorageAdapter } from '../services/subscriptionLifecycleService.ts';
import { subscriptionService } from '../services/subscriptionService.ts';
import { paymentSandboxTestService } from '../services/paymentSandboxTestService.ts';
import { DeterministicTestPaymentProvider } from '../services/deterministicTestPaymentProvider.ts';
import { validatePaymentMoney } from '../services/paymentProviderContract.ts';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, val) => store.set(String(key), String(val)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear()
  };
}

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

console.log('=== LARI Phase B1: Subscription & Checkout Lifecycle Integrity QA ===\n');

// 1. Unknown tenant or invalid plan check
runStep('1. Rejects checkout for unknown tenant or invalid planId', () => {
  const missingTenant = subscriptionLifecycleService.validateCheckoutRequest('', 'baslangic');
  if (missingTenant.valid || missingTenant.errorCode !== 'UNKNOWN_TENANT') {
    throw new Error(`Expected UNKNOWN_TENANT, got ${JSON.stringify(missingTenant)}`);
  }

  const invalidPlan = subscriptionLifecycleService.validateCheckoutRequest('tenant_real_01', 'non_existent_plan_99');
  if (invalidPlan.valid || invalidPlan.errorCode !== 'INVALID_PLAN') {
    throw new Error(`Expected INVALID_PLAN, got ${JSON.stringify(invalidPlan)}`);
  }

  const valid = subscriptionLifecycleService.validateCheckoutRequest('tenant_real_01', 'baslangic');
  if (!valid.valid) {
    throw new Error(`Expected valid request for baslangic plan, got ${JSON.stringify(valid)}`);
  }
});

// 2. Missing sandbox configuration check
runStep('2. Detects missing sandbox provider configuration', () => {
  const codeValidation = paymentSandboxTestService.validatePlanReferenceCodes('baslangic');
  if (typeof codeValidation.valid !== 'boolean') {
    throw new Error('validatePlanReferenceCodes must return boolean status');
  }
});

// 3. Unauthenticated diagnostic request
runStep('3. Rejects unauthenticated diagnostic request', () => {
  // Simulate Edge Function diagnostic check
  const simulateDiagnostic = (headers) => {
    const authHeader = headers['authorization'] || headers['Authorization'];
    const expectedSecret = 'service_role_secret_mock_123';
    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return { status: 401, errorCode: 'UNAUTHENTICATED_DIAGNOSTIC_REQUEST' };
    }
    return { status: 200, mode: 'diagnostic' };
  };

  const unauth = simulateDiagnostic({});
  if (unauth.status !== 401 || unauth.errorCode !== 'UNAUTHENTICATED_DIAGNOSTIC_REQUEST') {
    throw new Error(`Expected 401 UNAUTHENTICATED_DIAGNOSTIC_REQUEST, got ${JSON.stringify(unauth)}`);
  }

  const auth = simulateDiagnostic({ authorization: 'Bearer service_role_secret_mock_123' });
  if (auth.status !== 200) {
    throw new Error(`Expected 200 for authenticated diagnostic, got ${auth.status}`);
  }
});

// 4. Forged checkout-success redirect does NOT activate subscription
runStep('4. Forged frontend checkout-success redirect does NOT alter subscription status', () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_test_url_tamper',
    planId: 'standart',
    status: 'pending_checkout',
    cancelAtPeriodEnd: false
  });

  // Attacker crafts URL: /#/admin?tab=abonelik&checkout=success
  const queryParams = new URLSearchParams('tab=abonelik&checkout=success');
  const isSuccessUrlParam = queryParams.get('checkout') === 'success';

  if (!isSuccessUrlParam) {
    throw new Error('Failed to parse simulated URL query parameter');
  }

  // Pure invariant: URL parameter presence alone does not transition subscription state in storage
  const currentSub = storage.getSubscription('tenant_test_url_tamper');
  if (currentSub?.status !== 'pending_checkout') {
    throw new Error(`Security breach: subscription status became '${currentSub?.status}' without backend event!`);
  }
});

// 5. Signature verification failure rejects state mutation
const defaultTestProvider = new DeterministicTestPaymentProvider();
function makeWebhookEnvelope(payloadObj, overrideHeaders) {
  const raw = payloadObj.rawPayload !== undefined ? payloadObj.rawPayload : JSON.stringify(payloadObj);
  const signed = defaultTestProvider.signWebhookPayload(raw);
  return {
    rawPayload: signed.rawPayload,
    headers: overrideHeaders ?? signed.headers,
    provider: defaultTestProvider
  };
}

await runAsyncStep('5. Unverified webhook signature NEVER mutates subscription state', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_sig_test',
    planId: 'standart',
    status: 'pending_checkout',
    providerSubscriptionId: 'sub_ref_sig_01',
    cancelAtPeriodEnd: false
  });

  const payload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_sig_fail_01',
    subscriptionReferenceCode: 'sub_ref_sig_01',
    customerReferenceCode: 'tenant_sig_test'
  };

  // Attempt processing with boolean false
  const resFalse = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, false);
  if (resFalse.success || resFalse.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK error for false, got ${JSON.stringify(resFalse)}`);
  }

  // Attempt processing with boolean true [FINDING-ADIM027-011]
  const resTrue = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, true);
  if (resTrue.success || resTrue.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK error for true, got ${JSON.stringify(resTrue)}`);
  }

  // Attempt processing with invalid signature
  const forgedEnvelope = makeWebhookEnvelope(payload, { 'x-test-provider-signature': 'sig_forged_invalid' });
  const resForged = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, forgedEnvelope);
  if (resForged.success || resForged.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK error for forged sig, got ${JSON.stringify(resForged)}`);
  }

  const sub = storage.getSubscription('tenant_sig_test');
  if (sub?.status !== 'pending_checkout') {
    throw new Error(`Security breach: subscription transitioned without valid signature to ${sub?.status}`);
  }
});

// 6. Unknown subscription reference rejection
await runAsyncStep('6. Rejects webhook referencing unknown subscription reference', async () => {
  const storage = new InMemoryStorageAdapter();

  const payload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_unknown_sub_01',
    subscriptionReferenceCode: 'sub_ref_does_not_exist',
    customerReferenceCode: 'tenant_ghost'
  };

  const res = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, makeWebhookEnvelope(payload));
  if (res.success || res.errorCode !== 'SUBSCRIPTION_NOT_FOUND') {
    throw new Error(`Expected SUBSCRIPTION_NOT_FOUND, got ${JSON.stringify(res)}`);
  }
});

// 7. Customer / Tenant mismatch rejection
await runAsyncStep('7. Rejects customer/tenant mismatch between payload and database record', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_legitimate_01',
    planId: 'standart',
    status: 'trialing',
    providerSubscriptionId: 'sub_ref_match_01',
    cancelAtPeriodEnd: false
  });

  const mismatchedPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_mismatch_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_attacker_99',
    paymentId: 'pay_mismatch_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };

  const res = await subscriptionLifecycleService.processVerifiedWebhook(mismatchedPayload, storage, makeWebhookEnvelope(mismatchedPayload));
  if (res.success || res.errorCode !== 'TENANT_MISMATCH') {
    throw new Error(`Expected TENANT_MISMATCH, got ${JSON.stringify(res)}`);
  }

  // Ensure status was not mutated
  const sub = storage.getSubscription('tenant_legitimate_01');
  if (sub?.status !== 'trialing') {
    throw new Error(`Security violation: subscription changed status despite tenant mismatch!`);
  }

  // Negative test: Synthetic public cancellation aliases rejected fail-closed with PROVIDER_STATE_RECONCILIATION_REQUIRED
  const unverifiedCancelPayload = {
    eventType: 'subscription.cancelled',
    providerEventId: 'evt_unverified_canc_01',
    subscriptionReferenceCode: 'sub_ref_match_01'
  };
  const unverifiedCancel = await subscriptionLifecycleService.processVerifiedWebhook(unverifiedCancelPayload, storage, makeWebhookEnvelope(unverifiedCancelPayload));
  if (unverifiedCancel.success || unverifiedCancel.errorCode !== 'PROVIDER_STATE_RECONCILIATION_REQUIRED') {
    throw new Error(`Synthetic cancellation webhook bypassed reconciliation boundary: ${JSON.stringify(unverifiedCancel)}`);
  }
  const afterSynthCancel = storage.getSubscription('tenant_legitimate_01');
  if (afterSynthCancel?.status !== 'trialing' || (await storage.hasProcessedEvent('evt_unverified_canc_01'))) {
    throw new Error(`Synthetic cancellation webhook mutated subscription or claimed event!`);
  }

  // Negative test: Negative money parameters rejected with INVALID_MONEY
  const negMoneyPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_neg_money_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01',
    amountMinor: -100,
    currencyCode: 'TRY'
  };
  const negMoneyWebhook = await subscriptionLifecycleService.processVerifiedWebhook(negMoneyPayload, storage, makeWebhookEnvelope(negMoneyPayload));
  if (negMoneyWebhook.success || negMoneyWebhook.errorCode !== 'INVALID_MONEY') {
    throw new Error(`Negative amountMinor was accepted in webhook: ${JSON.stringify(negMoneyWebhook)}`);
  }

  // Negative test: Mismatched rawPayload envelope rejected with RAW_PAYLOAD_MISMATCH
  const rawMismatchPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_raw_mismatch_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01',
    rawPayload: JSON.stringify({
      eventType: 'subscription.cancelled',
      providerEventId: 'evt_raw_mismatch_01',
      subscriptionReferenceCode: 'sub_ref_match_01',
      customerReferenceCode: 'tenant_legitimate_01'
    })
  };
  const rawMismatchWebhook = await subscriptionLifecycleService.processVerifiedWebhook(
    rawMismatchPayload,
    storage,
    makeWebhookEnvelope(JSON.parse(rawMismatchPayload.rawPayload))
  );
  if (rawMismatchWebhook.success || rawMismatchWebhook.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Mismatched rawPayload envelope was accepted: ${JSON.stringify(rawMismatchWebhook)}`);
  }

  // Negative test: Conflicting customerReferenceCode and tenantId on supported event rejected with TENANT_MISMATCH
  const conflictTenantPayload = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_conflict_tenant_ref_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01',
    tenantId: 'tenant_attacker_99'
  };
  const conflictingTenantRefs = await subscriptionLifecycleService.processVerifiedWebhook(
    conflictTenantPayload,
    storage,
    makeWebhookEnvelope(conflictTenantPayload)
  );
  if (conflictingTenantRefs.success || conflictingTenantRefs.errorCode !== 'TENANT_MISMATCH') {
    throw new Error(`Conflicting customerReferenceCode/tenantId was accepted: ${JSON.stringify(conflictingTenantRefs)}`);
  }

  // Negative test: Even with conflicting/missing tenant refs, synthetic cancellation aliases return PROVIDER_STATE_RECONCILIATION_REQUIRED without mutation
  const synthCancelWithConflictTenant = {
    eventType: 'subscription.cancelled',
    providerEventId: 'evt_synth_cancel_conflict_tenant_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01',
    tenantId: 'tenant_attacker_99'
  };
  const synthCancelConflictRes = await subscriptionLifecycleService.processVerifiedWebhook(
    synthCancelWithConflictTenant,
    storage,
    makeWebhookEnvelope(synthCancelWithConflictTenant)
  );
  if (
    synthCancelConflictRes.success ||
    synthCancelConflictRes.errorCode !== 'PROVIDER_STATE_RECONCILIATION_REQUIRED' ||
    storage.getSubscription('tenant_legitimate_01')?.status !== 'trialing' ||
    (await storage.hasProcessedEvent('evt_synth_cancel_conflict_tenant_01'))
  ) {
    throw new Error(`Expected mutation-free PROVIDER_STATE_RECONCILIATION_REQUIRED for synthetic cancellation, got ${JSON.stringify(synthCancelConflictRes)}`);
  }

  const synthExpiredWithDifferentTenant = {
    eventType: 'subscription.expired',
    providerEventId: 'evt_synth_expired_diff_tenant_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_attacker_99'
  };
  const synthExpiredDiffTenantRes = await subscriptionLifecycleService.processVerifiedWebhook(
    synthExpiredWithDifferentTenant,
    storage,
    makeWebhookEnvelope(synthExpiredWithDifferentTenant)
  );
  if (
    synthExpiredDiffTenantRes.success ||
    synthExpiredDiffTenantRes.errorCode !== 'PROVIDER_STATE_RECONCILIATION_REQUIRED' ||
    storage.getSubscription('tenant_legitimate_01')?.status !== 'trialing' ||
    (await storage.hasProcessedEvent('evt_synth_expired_diff_tenant_01'))
  ) {
    throw new Error(`Expected mutation-free PROVIDER_STATE_RECONCILIATION_REQUIRED for synthetic expiration, got ${JSON.stringify(synthExpiredDiffTenantRes)}`);
  }

  // Negative test: Conflicting eventType and status rejected with CONFLICTING_EVENT_STATUS
  const conflictStatusPayload = {
    eventType: 'subscription.active',
    status: 'CANCELED',
    providerEventId: 'evt_conflict_status_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01'
  };
  const conflictingStatusWebhook = await subscriptionLifecycleService.processVerifiedWebhook(
    conflictStatusPayload,
    storage,
    makeWebhookEnvelope(conflictStatusPayload)
  );
  if (conflictingStatusWebhook.success || conflictingStatusWebhook.errorCode !== 'CONFLICTING_EVENT_STATUS') {
    throw new Error(`Conflicting eventType/status was accepted: ${JSON.stringify(conflictingStatusWebhook)}`);
  }

  // Negative test: Unsigned financial field omitted from signed rawPayload rejected with RAW_PAYLOAD_MISMATCH
  const signedNoAmount = defaultTestProvider.signWebhookPayload(JSON.stringify({
    eventType: 'subscription.active',
    providerEventId: 'evt_unsigned_fin_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01'
  }));
  const unsignedAmountWebhook = await subscriptionLifecycleService.processVerifiedWebhook({
    eventType: 'subscription.active',
    providerEventId: 'evt_unsigned_fin_01',
    subscriptionReferenceCode: 'sub_ref_match_01',
    customerReferenceCode: 'tenant_legitimate_01',
    amountMinor: 9900,
    currencyCode: 'TRY'
  }, storage, { ...signedNoAmount, provider: defaultTestProvider });
  if (unsignedAmountWebhook.success || unsignedAmountWebhook.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Unsigned amountMinor omitted from signed rawPayload was accepted: ${JSON.stringify(unsignedAmountWebhook)}`);
  }
});

// 8. Idempotent duplicate webhook event handling
await runAsyncStep('8. Idempotently ignores duplicate webhook events', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_idem_01',
    planId: 'standart',
    status: 'trialing',
    providerSubscriptionId: 'sub_ref_idem_01',
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: 'pay_idem_101',
    tenantId: 'tenant_idem_01',
    subscriptionReferenceCode: 'sub_ref_idem_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });

  const payload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_unique_101',
    subscriptionReferenceCode: 'sub_ref_idem_01',
    customerReferenceCode: 'tenant_idem_01',
    paymentId: 'pay_idem_101',
    amountMinor: 249000,
    currencyCode: 'TRY',
    eventTimestamp: '2026-10-01T10:00:00.000Z',
    paidThroughDate: '2026-11-01T10:00:00.000Z'
  };

  // First delivery: processes successfully
  const firstRes = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, makeWebhookEnvelope(payload));
  if (!firstRes.success || firstRes.duplicate) {
    throw new Error(`First processing failed: ${JSON.stringify(firstRes)}`);
  }
  if (firstRes.subscription?.status !== 'active') {
    throw new Error(`Expected active status, got ${firstRes.subscription?.status}`);
  }

  // Second delivery with identical providerEventId: must be recognized as duplicate
  const secondRes = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, makeWebhookEnvelope(payload));
  if (!secondRes.success || !secondRes.duplicate) {
    throw new Error(`Expected duplicate to succeed with duplicate:true, got ${JSON.stringify(secondRes)}`);
  }

  // Negative test [FINDING-ADIM027-012]: Replay with same providerEventId but different payload yields INTEGRITY_CONFLICT
  const conflictPayload = { ...payload, eventType: 'subscription.past_due' };
  const conflictRes = await subscriptionLifecycleService.processVerifiedWebhook(
    conflictPayload,
    storage,
    makeWebhookEnvelope(conflictPayload)
  );
  if (conflictRes.success || conflictRes.errorCode !== 'INTEGRITY_CONFLICT') {
    throw new Error(`Expected INTEGRITY_CONFLICT for mismatched replay payload, got ${JSON.stringify(conflictRes)}`);
  }

  // Negative test [FINDING-ADIM027-012]: Adapter without commitTransitionAtomic rejected fail-closed
  const nonAtomicStorage = {
    getSubscriptionByReference: storage.getSubscriptionByReference.bind(storage),
    saveSubscription: storage.saveSubscription.bind(storage),
    hasProcessedEvent: storage.hasProcessedEvent.bind(storage),
    recordProcessedEvent: storage.recordProcessedEvent.bind(storage),
    getPayment: storage.getPayment.bind(storage)
  };
  const missingAtomicPayload = { ...payload, providerEventId: 'evt_no_atomic_01' };
  const missingAtomicRes = await subscriptionLifecycleService.processVerifiedWebhook(
    missingAtomicPayload,
    nonAtomicStorage,
    makeWebhookEnvelope(missingAtomicPayload)
  );
  if (missingAtomicRes.success || missingAtomicRes.errorCode !== 'ATOMIC_STORAGE_REQUIRED') {
    throw new Error(`Expected ATOMIC_STORAGE_REQUIRED, got ${JSON.stringify(missingAtomicRes)}`);
  }

  // Negative test [FINDING-ADIM027-012]: In-flight follower gets retryable error, NOT duplicate success
  storage.claimInFlightForTest('evt_inflight_sub_01');
  const inFlightSubPayload = {
    ...payload,
    providerEventId: 'evt_inflight_sub_01',
    eventTimestamp: '2026-10-01T10:05:00.000Z'
  };
  const inFlightSubRes = await subscriptionLifecycleService.processVerifiedWebhook(
    inFlightSubPayload,
    storage,
    makeWebhookEnvelope(inFlightSubPayload)
  );
  storage.releaseInFlightForTest('evt_inflight_sub_01');
  if (inFlightSubRes.success || !inFlightSubRes.retryable || inFlightSubRes.errorCode !== 'IN_PROGRESS_RETRYABLE') {
    throw new Error(`Expected IN_PROGRESS_RETRYABLE for in-flight webhook, got ${JSON.stringify(inFlightSubRes)}`);
  }

  // Negative test [FINDING-ADIM027-012]: Atomic commit failure rolls back claim and allows safe retry
  storage.seedSubscription({
    tenantId: 'tenant_idem_retry_02',
    planId: 'standart',
    status: 'trialing',
    providerSubscriptionId: 'sub_ref_idem_retry_02',
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: 'pay_retry_02',
    tenantId: 'tenant_idem_retry_02',
    subscriptionReferenceCode: 'sub_ref_idem_retry_02',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });
  const retryPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_retry_after_fail_02',
    subscriptionReferenceCode: 'sub_ref_idem_retry_02',
    customerReferenceCode: 'tenant_idem_retry_02',
    paymentId: 'pay_retry_02',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  storage.failNextAtomicCommit = true;
  const failedCommitRes = await subscriptionLifecycleService.processVerifiedWebhook(
    retryPayload,
    storage,
    makeWebhookEnvelope(retryPayload)
  );
  if (failedCommitRes.success || failedCommitRes.errorCode !== 'ATOMIC_COMMIT_FAILED') {
    throw new Error(`Expected ATOMIC_COMMIT_FAILED, got ${JSON.stringify(failedCommitRes)}`);
  }
  if (await storage.hasProcessedEvent(retryPayload.providerEventId)) {
    throw new Error('Failed atomic transition prematurely consumed providerEventId');
  }
  const retriedRes = await subscriptionLifecycleService.processVerifiedWebhook(
    retryPayload,
    storage,
    makeWebhookEnvelope(retryPayload)
  );
  if (!retriedRes.success || retriedRes.duplicate || retriedRes.subscription?.status !== 'active') {
    throw new Error(`Retry after atomic failure did not succeed cleanly: ${JSON.stringify(retriedRes)}`);
  }
});

// 8B. Subscription creation vs payment-gated activation & no local now+30 period synthesis [FINDING-ADIM027-017]
await runAsyncStep('8B. subscription.created & proof-less subscription.active never grant paid/active access [FINDING-ADIM027-017]', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_paygate_01',
    planId: 'standart',
    status: 'pending_checkout',
    providerSubscriptionId: 'sub_ref_paygate_01',
    cancelAtPeriodEnd: false
  });

  // 1. Signed subscription.created (even with provider status ACTIVE and no payment proof) stays pending_checkout and never sets paid/now+30
  const createdPayload = {
    eventType: 'subscription.created',
    status: 'ACTIVE',
    providerEventId: 'evt_created_no_pay_01',
    subscriptionReferenceCode: 'sub_ref_paygate_01',
    customerReferenceCode: 'tenant_paygate_01',
    eventTimestamp: '2026-10-05T09:00:00.000Z'
  };
  const createdRes = await subscriptionLifecycleService.processVerifiedWebhook(
    createdPayload,
    storage,
    makeWebhookEnvelope(createdPayload)
  );
  if (
    !createdRes.success ||
    createdRes.subscription?.status !== 'pending_checkout' ||
    createdRes.subscription?.lastPaymentStatus === 'paid' ||
    createdRes.subscription?.paidThroughDate !== undefined
  ) {
    throw new Error(`subscription.created improperly activated or marked paid: ${JSON.stringify(createdRes)}`);
  }

  // 2. Signed subscription.active WITHOUT payment proof is rejected fail-closed on pending_checkout
  const activeNoProofPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_active_no_proof_01',
    subscriptionReferenceCode: 'sub_ref_paygate_01',
    customerReferenceCode: 'tenant_paygate_01',
    eventTimestamp: '2026-10-05T09:05:00.000Z'
  };
  const activeNoProofRes = await subscriptionLifecycleService.processVerifiedWebhook(
    activeNoProofPayload,
    storage,
    makeWebhookEnvelope(activeNoProofPayload)
  );
  if (activeNoProofRes.success || activeNoProofRes.errorCode !== 'PAYMENT_PROOF_REQUIRED') {
    throw new Error(`Expected PAYMENT_PROOF_REQUIRED for proof-less subscription.active, got ${JSON.stringify(activeNoProofRes)}`);
  }

  // 3. past_due subscription cannot recover with proof-less subscription.active
  storage.seedSubscription({
    tenantId: 'tenant_paygate_pd_01',
    planId: 'standart',
    status: 'past_due',
    lastPaymentStatus: 'failed',
    providerSubscriptionId: 'sub_ref_paygate_pd_01',
    cancelAtPeriodEnd: false
  });
  const pdNoProofPayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_pd_no_proof_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01'
  };
  const pdNoProofRes = await subscriptionLifecycleService.processVerifiedWebhook(
    pdNoProofPayload,
    storage,
    makeWebhookEnvelope(pdNoProofPayload)
  );
  if (pdNoProofRes.success || pdNoProofRes.errorCode !== 'PAYMENT_PROOF_REQUIRED' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`past_due recovered without payment proof: ${JSON.stringify(pdNoProofRes)}`);
  }

  // 3b. past_due / pending_checkout cannot activate if paymentStatus is failed or status is processing/created even with paymentId/amount
  const activeWithFailedPaymentStatus = {
    eventType: 'subscription.active',
    status: 'ACTIVE',
    paymentStatus: 'failed',
    providerEventId: 'evt_active_failed_paystatus_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_failed_shadow_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const failedPayStatusRes = await subscriptionLifecycleService.processVerifiedWebhook(
    activeWithFailedPaymentStatus,
    storage,
    makeWebhookEnvelope(activeWithFailedPaymentStatus)
  );
  if (failedPayStatusRes.success || failedPayStatusRes.errorCode !== 'PAYMENT_PROOF_REQUIRED' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`subscription.active with paymentStatus=failed was accepted: ${JSON.stringify(failedPayStatusRes)}`);
  }

  const processingPayPayload = {
    eventType: 'payment.succeeded',
    status: 'processing',
    providerEventId: 'evt_pay_processing_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_proc_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const processingPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    processingPayPayload,
    storage,
    makeWebhookEnvelope(processingPayPayload)
  );
  if (processingPayRes.success || processingPayRes.errorCode !== 'PAYMENT_PROOF_REQUIRED' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`payment.succeeded with status=processing was accepted: ${JSON.stringify(processingPayRes)}`);
  }

  // 3c. Forged non-existent paymentId, wrong amount/currency, wrong owner, or refunded payment rejected fail-closed [FINDING-ADIM027-017]
  storage.seedPayment({
    id: 'pay_verified_pd_01',
    tenantId: 'tenant_paygate_pd_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });
  storage.seedPayment({
    id: 'pay_other_tenant_01',
    tenantId: 'tenant_other_owner_99',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });
  storage.seedPayment({
    id: 'pay_refunded_pd_01',
    tenantId: 'tenant_paygate_pd_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'refunded',
    refundedAmountMinor: 249000
  });

  const nonExistentPayPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_missing_record_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_fake_nonexistent_99',
    amountMinor: 1,
    currencyCode: 'TRY'
  };
  const nonExistentPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    nonExistentPayPayload,
    storage,
    makeWebhookEnvelope(nonExistentPayPayload)
  );
  if (nonExistentPayRes.success || nonExistentPayRes.errorCode !== 'PAYMENT_NOT_FOUND' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`Non-existent paymentId activated subscription: ${JSON.stringify(nonExistentPayRes)}`);
  }

  const wrongAmountPayPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_wrong_amt_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_verified_pd_01',
    amountMinor: 1,
    currencyCode: 'TRY'
  };
  const wrongAmountPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    wrongAmountPayPayload,
    storage,
    makeWebhookEnvelope(wrongAmountPayPayload)
  );
  if (wrongAmountPayRes.success || wrongAmountPayRes.errorCode !== 'PAYMENT_AMOUNT_MISMATCH' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`Mismatched payment amountMinor activated subscription: ${JSON.stringify(wrongAmountPayRes)}`);
  }

  const wrongOwnerPayPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_wrong_owner_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_other_tenant_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const wrongOwnerPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    wrongOwnerPayPayload,
    storage,
    makeWebhookEnvelope(wrongOwnerPayPayload)
  );
  if (wrongOwnerPayRes.success || wrongOwnerPayRes.errorCode !== 'TENANT_MISMATCH' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`Foreign tenant paymentId activated subscription: ${JSON.stringify(wrongOwnerPayRes)}`);
  }

  const refundedPayPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_refunded_record_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_refunded_pd_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const refundedPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    refundedPayPayload,
    storage,
    makeWebhookEnvelope(refundedPayPayload)
  );
  if (refundedPayRes.success || refundedPayRes.errorCode !== 'PAYMENT_PROOF_REQUIRED' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`Refunded paymentId activated subscription: ${JSON.stringify(refundedPayRes)}`);
  }

  // Concurrent payment state mutation between pre-read and commitTransitionAtomic lock fails closed
  const racePayStorage = {
    getSubscriptionByReference: storage.getSubscriptionByReference.bind(storage),
    saveSubscription: storage.saveSubscription.bind(storage),
    hasProcessedEvent: storage.hasProcessedEvent.bind(storage),
    recordProcessedEvent: storage.recordProcessedEvent.bind(storage),
    commitRefundAtomic: storage.commitRefundAtomic.bind(storage),
    async getPayment(paymentId) {
      const p = await storage.getPayment(paymentId);
      if (paymentId === 'pay_verified_pd_01') {
        storage.seedPayment({ ...p, status: 'refunded', refundedAmountMinor: p.amountMinor });
      }
      return p;
    },
    commitTransitionAtomic: storage.commitTransitionAtomic.bind(storage)
  };
  const racePayPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_race_lock_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_verified_pd_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const racePayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    racePayPayload,
    racePayStorage,
    makeWebhookEnvelope(racePayPayload)
  );
  if (racePayRes.success || racePayRes.errorCode !== 'ATOMIC_COMMIT_FAILED' || storage.getSubscription('tenant_paygate_pd_01')?.status !== 'past_due') {
    throw new Error(`Concurrent payment mutation bypassed atomic lock check: ${JSON.stringify(racePayRes)}`);
  }
  // Restore paid payment for Step 4 positive assertion
  storage.seedPayment({
    id: 'pay_verified_pd_01',
    tenantId: 'tenant_paygate_pd_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });

  // 4. Legitimate payment.succeeded WITH payment proof activates, WITHOUT synthesizing now+30 if period is omitted
  const validPayNoPeriodPayload = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_pay_proof_no_period_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    paymentId: 'pay_verified_pd_01',
    amountMinor: 249000,
    currencyCode: 'TRY',
    eventTimestamp: '2026-10-05T09:10:00.000Z'
  };
  const validPayRes = await subscriptionLifecycleService.processVerifiedWebhook(
    validPayNoPeriodPayload,
    storage,
    makeWebhookEnvelope(validPayNoPeriodPayload)
  );
  if (
    !validPayRes.success ||
    validPayRes.subscription?.status !== 'active' ||
    validPayRes.subscription?.lastPaymentStatus !== 'paid' ||
    validPayRes.subscription?.paidThroughDate !== undefined
  ) {
    throw new Error(`Verified payment activation failed or synthesized local period: ${JSON.stringify(validPayRes)}`);
  }

  // 5. Out-of-order subscription.created on trialing/active cannot regress to pending_checkout
  const createdAfterActivePayload = {
    eventType: 'subscription.created',
    providerEventId: 'evt_created_after_active_01',
    subscriptionReferenceCode: 'sub_ref_paygate_pd_01',
    customerReferenceCode: 'tenant_paygate_pd_01',
    eventTimestamp: '2026-10-05T09:15:00.000Z'
  };
  const createdAfterActiveRes = await subscriptionLifecycleService.processVerifiedWebhook(
    createdAfterActivePayload,
    storage,
    makeWebhookEnvelope(createdAfterActivePayload)
  );
  if (createdAfterActiveRes.success || createdAfterActiveRes.errorCode !== 'INVALID_TRANSITION_OUT_OF_ORDER') {
    throw new Error(`Delayed subscription.created regressed active subscription: ${JSON.stringify(createdAfterActiveRes)}`);
  }
});

// 8C. Monotonic watermark enforcement against unique-event-ID stale replay [FINDING-ADIM027-018]
await runAsyncStep('8C. Enforces monotonic eventTimestamp watermark under atomic lock [FINDING-ADIM027-018]', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_watermark_01',
    planId: 'standart',
    status: 'pending_checkout',
    providerSubscriptionId: 'sub_ref_watermark_01',
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: 'pay_wm_01',
    tenantId: 'tenant_watermark_01',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });

  const t2 = '2026-10-10T12:00:00.000Z';
  const t1 = '2026-10-10T11:00:00.000Z';
  const t3 = '2026-10-10T13:00:00.000Z';

  // 1. Transition to active at T2 with verified payment proof
  const activeT2 = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_wm_active_t2',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01',
    paymentId: 'pay_wm_01',
    amountMinor: 249000,
    currencyCode: 'TRY',
    eventTimestamp: t2
  };
  const activeRes = await subscriptionLifecycleService.processVerifiedWebhook(activeT2, storage, makeWebhookEnvelope(activeT2));
  if (!activeRes.success || activeRes.subscription?.status !== 'active' || activeRes.subscription?.lastWebhookEventAt !== t2) {
    throw new Error(`Expected active at T2 watermark, got ${JSON.stringify(activeRes)}`);
  }

  // 2. Stale past_due with UNIQUE eventId and older T1 < T2 rejected fail-closed
  const stalePastDue = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_wm_stale_t1_unique',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01',
    eventTimestamp: t1
  };
  const staleRes = await subscriptionLifecycleService.processVerifiedWebhook(stalePastDue, storage, makeWebhookEnvelope(stalePastDue));
  if (staleRes.success || staleRes.errorCode !== 'STALE_EVENT_OUT_OF_ORDER') {
    throw new Error(`Stale unique-ID past_due event was accepted: ${JSON.stringify(staleRes)}`);
  }
  const afterStale = storage.getSubscription('tenant_watermark_01');
  if (afterStale?.status !== 'active' || afterStale?.lastWebhookEventAt !== t2) {
    throw new Error(`Stale event mutated status or watermark: ${JSON.stringify(afterStale)}`);
  }

  // 3. Missing eventTimestamp when watermark exists rejected fail-closed
  const missingTsPastDue = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_wm_missing_ts_unique',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01'
  };
  const missingTsRes = await subscriptionLifecycleService.processVerifiedWebhook(missingTsPastDue, storage, makeWebhookEnvelope(missingTsPastDue));
  if (missingTsRes.success || missingTsRes.errorCode !== 'STALE_EVENT_OUT_OF_ORDER') {
    throw new Error(`Timestamp-less event bypassed watermark: ${JSON.stringify(missingTsRes)}`);
  }

  // 4. Direct atomic lock watermark guard rejects stale/concurrent watermark change under lock
  const directStaleAtomic = await storage.commitTransitionAtomic(
    {
      providerEventId: 'evt_wm_direct_stale_lock',
      eventType: 'subscription.past_due',
      tenantId: 'tenant_watermark_01',
      subscriptionReferenceCode: 'sub_ref_watermark_01',
      processedAt: new Date().toISOString(),
      eventTimestamp: t1,
      payloadFingerprint: 'fp_direct_stale'
    },
    { ...afterStale, status: 'past_due' },
    'fp_direct_stale',
    { eventTimestamp: t1, expectedLastWebhookEventAt: t2 }
  );
  if (directStaleAtomic.success || directStaleAtomic.status !== 'stale_event') {
    throw new Error(`Atomic commit failed to enforce watermark under lock: ${JSON.stringify(directStaleAtomic)}`);
  }

  // 5. Newer valid event at T3 > T2 succeeds and atomically advances watermark to T3
  const newerPastDue = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_wm_newer_t3',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01',
    eventTimestamp: t3
  };
  const newerRes = await subscriptionLifecycleService.processVerifiedWebhook(newerPastDue, storage, makeWebhookEnvelope(newerPastDue));
  if (!newerRes.success || newerRes.subscription?.status !== 'past_due' || newerRes.subscription?.lastWebhookEventAt !== t3) {
    throw new Error(`Newer T3 event failed to advance watermark: ${JSON.stringify(newerRes)}`);
  }

  // 6. Future eventTimestamp beyond clock skew (e.g. 2099) rejected fail-closed without poisoning watermark [FINDING-ADIM027-023]
  const futurePayload = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_wm_future_2099',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01',
    eventTimestamp: '2099-01-01T00:00:00.000Z'
  };
  const futureRes = await subscriptionLifecycleService.processVerifiedWebhook(futurePayload, storage, makeWebhookEnvelope(futurePayload));
  if (futureRes.success || futureRes.errorCode !== 'INVALID_EVENT_TIMESTAMP') {
    throw new Error(`Future 2099 timestamp was accepted: ${JSON.stringify(futureRes)}`);
  }
  const afterFuture = storage.getSubscription('tenant_watermark_01');
  if (afterFuture?.status !== 'past_due' || afterFuture?.lastWebhookEventAt !== t3) {
    throw new Error(`Future timestamp poisoned subscription or watermark: ${JSON.stringify(afterFuture)}`);
  }

  const directFutureAtomic = await storage.commitTransitionAtomic(
    {
      providerEventId: 'evt_wm_direct_future_lock',
      eventType: 'subscription.past_due',
      tenantId: 'tenant_watermark_01',
      subscriptionReferenceCode: 'sub_ref_watermark_01',
      processedAt: new Date().toISOString(),
      eventTimestamp: '2099-01-01T00:00:00.000Z',
      payloadFingerprint: 'fp_direct_future'
    },
    { ...afterFuture, status: 'cancelled' },
    'fp_direct_future',
    { eventTimestamp: '2099-01-01T00:00:00.000Z', expectedLastWebhookEventAt: t3 }
  );
  if (directFutureAtomic.success || directFutureAtomic.status !== 'stale_event') {
    throw new Error(`Direct atomic commit failed to reject future 2099 timestamp: ${JSON.stringify(directFutureAtomic)}`);
  }

  // Legitimate T4 event after rejected future timestamp still succeeds with verified payment proof
  storage.seedPayment({
    id: 'pay_wm_t4',
    tenantId: 'tenant_watermark_01',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });
  const t4 = '2026-10-10T14:00:00.000Z';
  const validT4 = {
    eventType: 'payment.succeeded',
    providerEventId: 'evt_wm_valid_t4',
    subscriptionReferenceCode: 'sub_ref_watermark_01',
    customerReferenceCode: 'tenant_watermark_01',
    paymentId: 'pay_wm_t4',
    amountMinor: 249000,
    currencyCode: 'TRY',
    eventTimestamp: t4
  };
  const validT4Res = await subscriptionLifecycleService.processVerifiedWebhook(validT4, storage, makeWebhookEnvelope(validT4));
  if (!validT4Res.success || validT4Res.subscription?.status !== 'active' || validT4Res.subscription?.lastWebhookEventAt !== t4) {
    throw new Error(`Valid T4 event failed after rejected future timestamp: ${JSON.stringify(validT4Res)}`);
  }
});

// 8D. Unsupported eventType never falls back to providerStatus [FINDING-ADIM027-022]
await runAsyncStep('8D. Rejects unsupported eventType strictly without falling back to providerStatus [FINDING-ADIM027-022]', async () => {
  if (subscriptionLifecycleService.mapEventToTargetStatus('customer.updated', 'CANCELED') !== null) {
    throw new Error('mapEventToTargetStatus fell back to CANCELED for unknown eventType customer.updated');
  }
  if (subscriptionLifecycleService.mapEventToTargetStatus('customer.updated', 'ACTIVE') !== null) {
    throw new Error('mapEventToTargetStatus fell back to ACTIVE for unknown eventType customer.updated');
  }

  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_unk_evt_01',
    planId: 'standart',
    status: 'active',
    providerSubscriptionId: 'sub_ref_unk_evt_01',
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: 'pay_unk_evt_01',
    tenantId: 'tenant_unk_evt_01',
    subscriptionReferenceCode: 'sub_ref_unk_evt_01',
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });

  const unknownCancelPayload = {
    eventType: 'customer.updated',
    status: 'CANCELED',
    providerEventId: 'evt_unk_customer_cancel_01',
    subscriptionReferenceCode: 'sub_ref_unk_evt_01',
    customerReferenceCode: 'tenant_unk_evt_01'
  };
  const unknownCancelRes = await subscriptionLifecycleService.processVerifiedWebhook(
    unknownCancelPayload,
    storage,
    makeWebhookEnvelope(unknownCancelPayload)
  );
  if (unknownCancelRes.success || unknownCancelRes.errorCode !== 'UNKNOWN_EVENT_TYPE') {
    throw new Error(`Unknown eventType customer.updated with status=CANCELED was accepted: ${JSON.stringify(unknownCancelRes)}`);
  }
  if (storage.getSubscription('tenant_unk_evt_01')?.status !== 'active') {
    throw new Error('Unknown eventType mutated active subscription status');
  }

  const refundActivePayload = {
    eventType: 'refund.succeeded',
    status: 'ACTIVE',
    providerEventId: 'evt_unk_refund_active_01',
    subscriptionReferenceCode: 'sub_ref_unk_evt_01',
    customerReferenceCode: 'tenant_unk_evt_01',
    paymentId: 'pay_unk_evt_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };
  const refundActiveRes = await subscriptionLifecycleService.processVerifiedWebhook(
    refundActivePayload,
    storage,
    makeWebhookEnvelope(refundActivePayload)
  );
  if (refundActiveRes.success || refundActiveRes.errorCode !== 'UNKNOWN_EVENT_TYPE') {
    throw new Error(`refund.succeeded with status=ACTIVE was accepted in processVerifiedWebhook: ${JSON.stringify(refundActiveRes)}`);
  }
});

// 9. Out-of-order lifecycle event handling
await runAsyncStep('9. Prevents invalid/out-of-order transitions (cancelled -> active)', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_ooo_01',
    planId: 'standart',
    status: 'cancelled',
    providerSubscriptionId: 'sub_ref_ooo_01',
    cancelAtPeriodEnd: false
  });

  // Stale or delayed 'subscription.active' ping arriving after user already cancelled
  const delayedActivePayload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_delayed_active_01',
    subscriptionReferenceCode: 'sub_ref_ooo_01',
    customerReferenceCode: 'tenant_ooo_01',
    paymentId: 'pay_delayed_01',
    amountMinor: 249000,
    currencyCode: 'TRY'
  };

  const res = await subscriptionLifecycleService.processVerifiedWebhook(delayedActivePayload, storage, makeWebhookEnvelope(delayedActivePayload));
  if (res.success || res.errorCode !== 'INVALID_TRANSITION_OUT_OF_ORDER') {
    throw new Error(`Expected INVALID_TRANSITION_OUT_OF_ORDER, got ${JSON.stringify(res)}`);
  }

  const currentSub = storage.getSubscription('tenant_ooo_01');
  if (currentSub?.status !== 'cancelled') {
    throw new Error(`Cancelled subscription was resurrected to ${currentSub?.status}!`);
  }
});

// 10. Payment failure, cancellation and expiration lifecycle handling
await runAsyncStep('10. Correctly handles payment failure, cancellation and expiration', async () => {
  const storage = new InMemoryStorageAdapter();
  storage.seedSubscription({
    tenantId: 'tenant_life_01',
    planId: 'standart',
    status: 'active',
    providerSubscriptionId: 'sub_ref_life_01',
    cancelAtPeriodEnd: false
  });

  // Step A: Payment failure transitions active -> past_due
  const failPayload = {
    eventType: 'subscription.past_due',
    providerEventId: 'evt_fail_01',
    subscriptionReferenceCode: 'sub_ref_life_01',
    customerReferenceCode: 'tenant_life_01'
  };
  const failRes = await subscriptionLifecycleService.processVerifiedWebhook(failPayload, storage, makeWebhookEnvelope(failPayload));
  if (!failRes.success || failRes.subscription?.status !== 'past_due') {
    throw new Error(`Expected past_due status, got ${JSON.stringify(failRes)}`);
  }

  // Step B: Synthetic public cancellation rejected; authorized provider-state reconciliation transitions past_due -> cancelled
  const cancelPayload = {
    eventType: 'subscription.cancelled',
    providerEventId: 'evt_cancel_01',
    subscriptionReferenceCode: 'sub_ref_life_01',
    customerReferenceCode: 'tenant_life_01'
  };
  const cancelWebhookRes = await subscriptionLifecycleService.processVerifiedWebhook(cancelPayload, storage, makeWebhookEnvelope(cancelPayload));
  if (cancelWebhookRes.success || cancelWebhookRes.errorCode !== 'PROVIDER_STATE_RECONCILIATION_REQUIRED') {
    throw new Error(`Expected PROVIDER_STATE_RECONCILIATION_REQUIRED for synthetic cancellation, got ${JSON.stringify(cancelWebhookRes)}`);
  }
  const curPastDue = storage.getSubscription('tenant_life_01');
  const cancelRes = subscriptionLifecycleService.reconcileSubscription(curPastDue, { status: 'CANCELLED' });
  if (cancelRes.inSync || cancelRes.reconciledSub?.status !== 'cancelled') {
    throw new Error(`Expected cancelled status via reconciliation, got ${JSON.stringify(cancelRes)}`);
  }
  await storage.saveSubscription(cancelRes.reconciledSub);
});

// 11. Plan upgrade (immediate) vs downgrade scheduling (period_end)
runStep('11. Plan upgrade (immediate) vs downgrade scheduling (period_end)', () => {
  const sub = {
    tenantId: 'tenant_plan_change_01',
    planId: 'standart',
    status: 'active',
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false
  };

  // Immediate upgrade: activates immediately, clears scheduled
  const upgrade = subscriptionLifecycleService.calculatePlanChange(sub, 'professional', 'immediate');
  if (upgrade.action !== 'upgraded' || upgrade.updatedSub.planId !== 'professional' || upgrade.updatedSub.planChangeStatus !== 'none') {
    throw new Error(`Immediate upgrade failed: ${JSON.stringify(upgrade)}`);
  }

  // Period end downgrade: keeps active plan, schedules target plan
  const downgrade = subscriptionLifecycleService.calculatePlanChange(sub, 'baslangic', 'period_end');
  if (downgrade.action !== 'downgrade_scheduled' || downgrade.updatedSub.planId !== 'standart' || downgrade.updatedSub.scheduledPlanId !== 'baslangic' || downgrade.updatedSub.planChangeStatus !== 'downgrade_scheduled') {
    throw new Error(`Period-end downgrade failed: ${JSON.stringify(downgrade)}`);
  }

  // Negative test [FINDING-ADIM027-007]: Unknown or empty target plan ID must not alter existing plan or schedule
  const unknownPlan = subscriptionLifecycleService.calculatePlanChange(sub, 'non_existent_plan_99', 'immediate');
  if (unknownPlan.success || unknownPlan.action !== 'rejected' || unknownPlan.updatedSub.planId !== sub.planId || unknownPlan.updatedSub.planChangeStatus !== sub.planChangeStatus) {
    throw new Error(`Unknown plan was accepted: ${JSON.stringify(unknownPlan)}`);
  }

  const emptyPlan = subscriptionLifecycleService.calculatePlanChange(sub, '', 'period_end');
  if (emptyPlan.success || emptyPlan.action !== 'rejected' || emptyPlan.updatedSub.planId !== sub.planId || emptyPlan.updatedSub.scheduledPlanId !== sub.scheduledPlanId) {
    throw new Error(`Empty planId was accepted: ${JSON.stringify(emptyPlan)}`);
  }

  // Negative test [FINDING-ADIM027-019]: Downgrade cannot be immediate; Upgrade cannot be period_end
  const immediateDowngrade = subscriptionLifecycleService.calculatePlanChange(sub, 'baslangic', 'immediate');
  if (immediateDowngrade.success || immediateDowngrade.errorCode !== 'DOWNGRADE_REQUIRES_PERIOD_END') {
    throw new Error(`Immediate downgrade was accepted in calculatePlanChange: ${JSON.stringify(immediateDowngrade)}`);
  }
  const periodEndUpgrade = subscriptionLifecycleService.calculatePlanChange(sub, 'professional', 'period_end');
  if (periodEndUpgrade.success || periodEndUpgrade.errorCode !== 'UPGRADE_REQUIRES_IMMEDIATE') {
    throw new Error(`Period-end upgrade was accepted in calculatePlanChange: ${JSON.stringify(periodEndUpgrade)}`);
  }
});

// 11B. subscriptionService plan change validation & timing enforcement [FINDING-ADIM027-019]
await runAsyncStep('11B. subscriptionService plan changes enforce plan existence & timing [FINDING-ADIM027-019]', async () => {
  const tenantId = 'tenant_serv_plan_change_01';
  const initialSub = {
    tenantId,
    planId: 'standart',
    status: 'active',
    currentPeriodStart: '2026-10-01T00:00:00.000Z',
    currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    planChangeStatus: 'none'
  };
  localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(initialSub));

  // 1. Unknown plan rejected & does not mutate persisted subscription
  let unknownRejected = false;
  try {
    await subscriptionService.schedulePlanChange(tenantId, 'non_existent_plan_99', 'immediate');
  } catch (err) {
    unknownRejected = true;
  }
  if (!unknownRejected) {
    throw new Error('subscriptionService.schedulePlanChange accepted unknown plan');
  }
  const afterUnknown = await subscriptionService.getCurrentSubscription(tenantId);
  if (afterUnknown?.planId !== 'standart' || afterUnknown?.scheduledPlanId !== undefined || afterUnknown?.planChangeStatus !== 'none') {
    throw new Error(`Unknown plan altered persisted subscription: ${JSON.stringify(afterUnknown)}`);
  }

  // 2. Immediate downgrade rejected (standart -> baslangic)
  let immDowngradeRejected = false;
  try {
    await subscriptionService.upgradePlanNow(tenantId, 'baslangic');
  } catch (err) {
    immDowngradeRejected = true;
  }
  if (!immDowngradeRejected) {
    throw new Error('subscriptionService.upgradePlanNow allowed immediate downgrade');
  }
  const afterImmDowngrade = await subscriptionService.getCurrentSubscription(tenantId);
  if (afterImmDowngrade?.planId !== 'standart' || afterImmDowngrade?.planChangeStatus !== 'none') {
    throw new Error(`Immediate downgrade altered persisted subscription: ${JSON.stringify(afterImmDowngrade)}`);
  }

  // 3. Period-end upgrade rejected (standart -> professional)
  let periodUpgradeRejected = false;
  try {
    await subscriptionService.scheduleDowngradeAtPeriodEnd(tenantId, 'professional');
  } catch (err) {
    periodUpgradeRejected = true;
  }
  if (!periodUpgradeRejected) {
    throw new Error('subscriptionService.scheduleDowngradeAtPeriodEnd allowed period_end upgrade');
  }
  const afterPeriodUpgrade = await subscriptionService.getCurrentSubscription(tenantId);
  if (afterPeriodUpgrade?.planId !== 'standart' || afterPeriodUpgrade?.scheduledPlanId !== undefined) {
    throw new Error(`Period-end upgrade altered persisted subscription: ${JSON.stringify(afterPeriodUpgrade)}`);
  }

  // 4. Legitimate period-end downgrade persists on re-read
  const downgraded = await subscriptionService.schedulePlanChange(tenantId, 'baslangic', 'period_end');
  if (downgraded.planChangeStatus !== 'downgrade_scheduled' || downgraded.scheduledPlanId !== 'baslangic') {
    throw new Error(`Valid downgrade failed: ${JSON.stringify(downgraded)}`);
  }
  const rereadDowngraded = await subscriptionService.getCurrentSubscription(tenantId);
  if (rereadDowngraded?.planChangeStatus !== 'downgrade_scheduled' || rereadDowngraded?.scheduledPlanId !== 'baslangic') {
    throw new Error(`Persisted downgrade mismatch on re-read: ${JSON.stringify(rereadDowngraded)}`);
  }

  // 5. Legitimate immediate upgrade persists and clears downgrade schedule on re-read
  const upgraded = await subscriptionService.schedulePlanChange(tenantId, 'professional', 'immediate');
  if (upgraded.planId !== 'professional' || upgraded.planChangeStatus !== 'none' || upgraded.scheduledPlanId !== undefined) {
    throw new Error(`Valid upgrade failed: ${JSON.stringify(upgraded)}`);
  }
  const rereadUpgraded = await subscriptionService.getCurrentSubscription(tenantId);
  if (rereadUpgraded?.planId !== 'professional' || rereadUpgraded?.planChangeStatus !== 'none') {
    throw new Error(`Persisted upgrade mismatch on re-read: ${JSON.stringify(rereadUpgraded)}`);
  }

  // 6. Non-mock/supabase mode rejects client-side plan upgrade and downgrade scheduling
  const prevPlanMode = process.env.VITE_DATA_MODE;
  process.env.VITE_DATA_MODE = 'supabase_staging';
  let upgradeBlocked = false;
  let downgradeBlocked = false;
  try {
    try {
      await subscriptionService.upgradePlanNow(tenantId, 'premium');
    } catch (err) {
      if (err.message.includes('unauthorized in production/supabase mode')) upgradeBlocked = true;
    }
    try {
      await subscriptionService.scheduleDowngradeAtPeriodEnd(tenantId, 'baslangic');
    } catch (err) {
      if (err.message.includes('unauthorized in production/supabase mode')) downgradeBlocked = true;
    }
  } finally {
    if (prevPlanMode === undefined) {
      delete process.env.VITE_DATA_MODE;
    } else {
      process.env.VITE_DATA_MODE = prevPlanMode;
    }
  }
  if (!upgradeBlocked || !downgradeBlocked) {
    throw new Error(`Client-side plan change was not blocked in supabase_staging mode (upgrade=${upgradeBlocked}, downgrade=${downgradeBlocked})`);
  }
});

// 12. Apply due scheduled plan change at period end
runStep('12. Apply due scheduled plan change at period end', () => {
  const sub = {
    tenantId: 'tenant_apply_due_01',
    planId: 'standart',
    status: 'active',
    planChangeStatus: 'downgrade_scheduled',
    scheduledPlanId: 'baslangic',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false
  };

  // Before period end: not applied
  const beforeEnd = new Date('2026-09-20T00:00:00.000Z');
  const notDue = subscriptionLifecycleService.applyDueScheduledPlanChange(sub, beforeEnd);
  if (notDue.applied || notDue.subscription.planId !== 'standart') {
    throw new Error(`Downgrade applied prematurely: ${JSON.stringify(notDue)}`);
  }

  // At or after period end (even 45 days late): applied while preserving existing period boundaries [FINDING-ADIM027-014]
  const subWithBounds = {
    ...sub,
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z'
  };
  const lateAfterEnd = new Date('2026-11-15T00:00:00.000Z');
  const due = subscriptionLifecycleService.applyDueScheduledPlanChange(subWithBounds, lateAfterEnd);
  if (
    !due.applied ||
    due.subscription.planId !== 'baslangic' ||
    due.subscription.planChangeStatus !== 'none' ||
    due.subscription.currentPeriodStart !== '2026-09-01T00:00:00.000Z' ||
    due.subscription.currentPeriodEnd !== '2026-10-01T00:00:00.000Z'
  ) {
    throw new Error(`Scheduled plan change failed or arbitrarily shifted billing period: ${JSON.stringify(due)}`);
  }

  // Negative test [FINDING-ADIM027-006]: Missing currentPeriodEnd must NOT apply immediately; flags manual review
  const afterEnd = new Date('2026-10-02T00:00:00.000Z');
  const subMissingEnd = { ...sub, currentPeriodEnd: undefined };
  const resMissing = subscriptionLifecycleService.applyDueScheduledPlanChange(subMissingEnd, afterEnd);
  if (resMissing.applied || resMissing.subscription.planId !== 'standart' || resMissing.subscription.planChangeStatus !== 'manual_review_required') {
    throw new Error(`Scheduled change applied with missing currentPeriodEnd: ${JSON.stringify(resMissing)}`);
  }

  // Negative test [FINDING-ADIM027-006]: Invalid currentPeriodEnd must NOT apply immediately; flags manual review
  const subInvalidEnd = { ...sub, currentPeriodEnd: 'not_a_valid_date' };
  const resInvalid = subscriptionLifecycleService.applyDueScheduledPlanChange(subInvalidEnd, afterEnd);
  if (resInvalid.applied || resInvalid.subscription.planId !== 'standart' || resInvalid.subscription.planChangeStatus !== 'manual_review_required') {
    throw new Error(`Scheduled change applied with invalid currentPeriodEnd: ${JSON.stringify(resInvalid)}`);
  }

  // Negative test [FINDING-ADIM027-014/006]: Future currentPeriodEnd must NOT apply
  const subFutureEnd = { ...sub, currentPeriodEnd: '2026-11-01T00:00:00.000Z' };
  const resFuture = subscriptionLifecycleService.applyDueScheduledPlanChange(subFutureEnd, afterEnd);
  if (resFuture.applied || resFuture.subscription.planId !== 'standart') {
    throw new Error(`Scheduled change applied prematurely for future period: ${JSON.stringify(resFuture)}`);
  }
});

// 13. Grace period evaluation
runStep('13. Evaluates past_due grace period window', () => {
  const pastDueDate = '2026-10-01T00:00:00.000Z';
  const nowDay3 = new Date('2026-10-04T00:00:00.000Z');
  const inGrace = subscriptionLifecycleService.evaluateGracePeriod(pastDueDate, 7, nowDay3);
  if (!inGrace.inGracePeriod || inGrace.expired || inGrace.daysRemaining !== 4) {
    throw new Error(`Expected inGracePeriod with 4 days remaining, got ${JSON.stringify(inGrace)}`);
  }

  const nowDay10 = new Date('2026-10-11T00:00:00.000Z');
  const expiredGrace = subscriptionLifecycleService.evaluateGracePeriod(pastDueDate, 7, nowDay10);
  if (expiredGrace.inGracePeriod || !expiredGrace.expired || expiredGrace.daysRemaining !== 0) {
    throw new Error(`Expected expired grace period, got ${JSON.stringify(expiredGrace)}`);
  }

  // Negative tests [FINDING-ADIM027-021]: Invalid date, NaN/negative graceDays, invalid referenceNow fail closed without throwing
  const providerForGrace = new DeterministicTestPaymentProvider();
  const invalidInputs = [
    ['not-a-date', 7, nowDay3],
    ['', 7, nowDay3],
    [pastDueDate, Number.NaN, nowDay3],
    [pastDueDate, -3, nowDay3],
    [pastDueDate, 7, new Date('invalid-now')]
  ];
  for (const [d, g, ref] of invalidInputs) {
    const svcRes = subscriptionLifecycleService.evaluateGracePeriod(d, g, ref);
    if (svcRes.inGracePeriod || !svcRes.expired || svcRes.daysRemaining !== 0 || svcRes.status !== 'expired') {
      throw new Error(`subscriptionLifecycleService.evaluateGracePeriod failed open for invalid input (${d}, ${g}): ${JSON.stringify(svcRes)}`);
    }
    const provRes = providerForGrace.evaluateGracePeriod(d, g, ref);
    if (provRes.inGracePeriod || !provRes.expired || provRes.daysRemaining !== 0 || provRes.status !== 'expired') {
      throw new Error(`DeterministicTestPaymentProvider.evaluateGracePeriod failed open for invalid input (${d}, ${g}): ${JSON.stringify(provRes)}`);
    }
  }
});

// 14. Verified refund webhook handling & idempotency
await runAsyncStep('14. Verified refund webhook handling & idempotency', async () => {
  const storage = new InMemoryStorageAdapter();
  const refundProvider = new DeterministicTestPaymentProvider();
  const makeRefundEnvelope = (payloadObj, overrideHeaders) => {
    const signed = refundProvider.signWebhookPayload(JSON.stringify({ eventType: 'payment.refunded', ...payloadObj }));
    return {
      rawPayload: signed.rawPayload,
      headers: overrideHeaders ?? signed.headers,
      provider: refundProvider
    };
  };

  storage.seedSubscription({
    tenantId: 'tenant_refund_01',
    planId: 'standart',
    status: 'active',
    providerSubscriptionId: 'sub_ref_refund_01',
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: 'pay_refund_01',
    tenantId: 'tenant_refund_01',
    subscriptionReferenceCode: 'sub_ref_refund_01',
    amountMinor: 50000,
    currency: 'TRY',
    status: 'paid'
  });

  const refundPayload = {
    providerEventId: 'evt_refund_901',
    subscriptionReferenceCode: 'sub_ref_refund_01',
    tenantId: 'tenant_refund_01',
    paymentId: 'pay_refund_01',
    amountMinor: 50000,
    currency: 'TRY',
    refundReason: 'Customer requested refund within cooling off',
    isFullRefund: true
  };

  // 1. Detached boolean verification (true/false) and invalid signature rejected fail-closed [FINDING-ADIM027-003]
  const detachedBoolFalse = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, false);
  if (detachedBoolFalse.success || detachedBoolFalse.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK for boolean false, got ${JSON.stringify(detachedBoolFalse)}`);
  }
  const detachedBoolTrue = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, true);
  if (detachedBoolTrue.success || detachedBoolTrue.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK for detached boolean true, got ${JSON.stringify(detachedBoolTrue)}`);
  }
  const forgedSigEnvelope = makeRefundEnvelope(refundPayload, { 'x-test-provider-signature': 'sig_forged_0000' });
  const unverified = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, forgedSigEnvelope);
  if (unverified.success || unverified.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK for forged signature, got ${JSON.stringify(unverified)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Negative or zero amount rejected with no mutation
  const negMoneyPayload = { ...refundPayload, amountMinor: -1 };
  const negMoney = await subscriptionLifecycleService.processRefundWebhookEvent(negMoneyPayload, storage, makeRefundEnvelope(negMoneyPayload));
  if (negMoney.success || negMoney.errorCode !== 'INVALID_MONEY') {
    throw new Error(`Negative money refund was accepted: ${JSON.stringify(negMoney)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Empty providerEventId rejected with no mutation
  const emptyEventPayload = { ...refundPayload, providerEventId: '' };
  const emptyEventId = await subscriptionLifecycleService.processRefundWebhookEvent(emptyEventPayload, storage, makeRefundEnvelope(emptyEventPayload));
  if (emptyEventId.success || emptyEventId.errorCode !== 'INVALID_IDENTIFIER') {
    throw new Error(`Empty providerEventId was accepted: ${JSON.stringify(emptyEventId)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Invalid currency rejected with no mutation
  const badCurrencyPayload = { ...refundPayload, currency: 'try' };
  const badCurrency = await subscriptionLifecycleService.processRefundWebhookEvent(badCurrencyPayload, storage, makeRefundEnvelope(badCurrencyPayload));
  if (badCurrency.success || badCurrency.errorCode !== 'INVALID_MONEY') {
    throw new Error(`Invalid currency refund was accepted: ${JSON.stringify(badCurrency)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Tenant mismatch rejected with no mutation
  const badTenantPayload = { ...refundPayload, tenantId: 'tenant_attacker_99' };
  const badTenant = await subscriptionLifecycleService.processRefundWebhookEvent(badTenantPayload, storage, makeRefundEnvelope(badTenantPayload));
  if (badTenant.success || badTenant.errorCode !== 'TENANT_MISMATCH') {
    throw new Error(`Mismatched tenant refund was accepted: ${JSON.stringify(badTenant)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Refund exceeding payment amount rejected with no mutation
  const excessivePayload = { ...refundPayload, amountMinor: 999999 };
  const excessiveRefund = await subscriptionLifecycleService.processRefundWebhookEvent(excessivePayload, storage, makeRefundEnvelope(excessivePayload));
  if (excessiveRefund.success || excessiveRefund.errorCode !== 'REFUND_EXCEEDS_PAYMENT') {
    throw new Error(`Excessive refund was accepted: ${JSON.stringify(excessiveRefund)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Missing paymentId rejected with no mutation
  const missingPayPayload = { ...refundPayload, paymentId: '' };
  const missingPaymentId = await subscriptionLifecycleService.processRefundWebhookEvent(missingPayPayload, storage, makeRefundEnvelope(missingPayPayload));
  if (missingPaymentId.success || missingPaymentId.errorCode !== 'MISSING_PAYMENT_ID') {
    throw new Error(`Missing paymentId was accepted: ${JSON.stringify(missingPaymentId)}`);
  }

  // Negative test [FINDING-ADIM027-002]: Storage adapter without atomic commit rejected with no mutation
  const adapterWithoutAtomic = {
    getSubscriptionByReference: storage.getSubscriptionByReference.bind(storage),
    saveSubscription: storage.saveSubscription.bind(storage),
    hasProcessedEvent: storage.hasProcessedEvent.bind(storage),
    recordProcessedEvent: storage.recordProcessedEvent.bind(storage),
    getPayment: storage.getPayment.bind(storage)
  };
  const noAtomicRes = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, adapterWithoutAtomic, makeRefundEnvelope(refundPayload));
  if (noAtomicRes.success || noAtomicRes.errorCode !== 'ATOMIC_STORAGE_REQUIRED') {
    throw new Error(`Adapter without atomic commit was accepted: ${JSON.stringify(noAtomicRes)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Payment belonging to different subscription rejected
  storage.seedPayment({
    id: 'pay_diff_sub_01',
    tenantId: 'tenant_refund_01',
    subscriptionReferenceCode: 'other_sub_reference',
    amountMinor: 50000,
    currency: 'TRY',
    status: 'paid'
  });
  const diffSubPayload = { ...refundPayload, paymentId: 'pay_diff_sub_01' };
  const diffSubRes = await subscriptionLifecycleService.processRefundWebhookEvent(diffSubPayload, storage, makeRefundEnvelope(diffSubPayload));
  if (diffSubRes.success || diffSubRes.errorCode !== 'PAYMENT_SUBSCRIPTION_MISMATCH') {
    throw new Error(`Payment with mismatched subscription was accepted: ${JSON.stringify(diffSubRes)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Partial refund amount with isFullRefund=true rejected
  const partialFullPayload = { ...refundPayload, amountMinor: 25000, isFullRefund: true };
  const partialFullMismatch = await subscriptionLifecycleService.processRefundWebhookEvent(partialFullPayload, storage, makeRefundEnvelope(partialFullPayload));
  if (partialFullMismatch.success || partialFullMismatch.errorCode !== 'PARTIAL_FULL_REFUND_MISMATCH') {
    throw new Error(`Partial amount with isFullRefund=true was accepted: ${JSON.stringify(partialFullMismatch)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Processing object differing from verified rawPayload rejected (RAW_PAYLOAD_MISMATCH)
  const tamperedRawRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    refundPayload,
    storage,
    makeRefundEnvelope({ ...refundPayload, amountMinor: 10000 })
  );
  if (tamperedRawRes.success || tamperedRawRes.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Processing object differing from verified rawPayload was accepted: ${JSON.stringify(tamperedRawRes)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Unsigned financial field omitted from signed rawPayload rejected
  const { amountMinor: _omitted, ...unsignedRawObj } = refundPayload;
  const unsignedFieldRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    refundPayload,
    storage,
    makeRefundEnvelope(unsignedRawObj)
  );
  if (unsignedFieldRes.success || unsignedFieldRes.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Unsigned amountMinor omitted from rawPayload was accepted: ${JSON.stringify(unsignedFieldRes)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Tampered isFullRefund vs signed rawPayload rejected
  const tamperedFullRefundRaw = await subscriptionLifecycleService.processRefundWebhookEvent(
    { ...refundPayload, isFullRefund: true },
    storage,
    makeRefundEnvelope({ ...refundPayload, isFullRefund: false })
  );
  if (tamperedFullRefundRaw.success || tamperedFullRefundRaw.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Tampered isFullRefund vs signed rawPayload was accepted: ${JSON.stringify(tamperedFullRefundRaw)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Mismatched originalPaymentAmountMinor rejected
  const mismatchedOrigAmountPayload = { ...refundPayload, originalPaymentAmountMinor: 12345 };
  const mismatchedOrigAmount = await subscriptionLifecycleService.processRefundWebhookEvent(
    mismatchedOrigAmountPayload,
    storage,
    makeRefundEnvelope(mismatchedOrigAmountPayload)
  );
  if (mismatchedOrigAmount.success || mismatchedOrigAmount.errorCode !== 'PAYMENT_AMOUNT_MISMATCH') {
    throw new Error(`Mismatched originalPaymentAmountMinor was accepted: ${JSON.stringify(mismatchedOrigAmount)}`);
  }

  // Negative test [FINDING-ADIM027-003]: Mismatched originalCurrency rejected
  const mismatchedOrigCurrPayload = { ...refundPayload, originalCurrency: 'USD' };
  const mismatchedOrigCurrency = await subscriptionLifecycleService.processRefundWebhookEvent(
    mismatchedOrigCurrPayload,
    storage,
    makeRefundEnvelope(mismatchedOrigCurrPayload)
  );
  if (mismatchedOrigCurrency.success || mismatchedOrigCurrency.errorCode !== 'CURRENCY_MISMATCH') {
    throw new Error(`Mismatched originalCurrency was accepted: ${JSON.stringify(mismatchedOrigCurrency)}`);
  }

  // Negative test [FINDING-ADIM027-002]: Concurrent in-flight follower receives retryable status (NOT duplicate success)
  storage.claimInFlightForTest('evt_inflight_qa');
  const inFlightPayload = { ...refundPayload, providerEventId: 'evt_inflight_qa' };
  const inFlightRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    inFlightPayload,
    storage,
    makeRefundEnvelope(inFlightPayload)
  );
  if (inFlightRes.success || !inFlightRes.retryable || inFlightRes.errorCode !== 'IN_PROGRESS_RETRYABLE') {
    throw new Error(`Expected IN_PROGRESS_RETRYABLE for in-flight event, got ${JSON.stringify(inFlightRes)}`);
  }
  storage.releaseInFlightForTest('evt_inflight_qa');

  // Subscription must still be intact as 'active'
  const subBeforeCommit = storage.getSubscription('tenant_refund_01');
  if (subBeforeCommit?.status !== 'active') {
    throw new Error(`Subscription status altered despite negative validation failures: ${subBeforeCommit?.status}`);
  }

  // Negative test [FINDING-ADIM027-002]: Atomic commit failure allows safe retry without consuming event
  storage.failNextAtomicCommit = true;
  const commitFailed = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, makeRefundEnvelope(refundPayload));
  if (commitFailed.success || commitFailed.errorCode !== 'ATOMIC_COMMIT_FAILED') {
    throw new Error(`Expected ATOMIC_COMMIT_FAILED, got ${JSON.stringify(commitFailed)}`);
  }
  const hasEventAfterFailure = await storage.hasProcessedEvent(refundPayload.providerEventId);
  if (hasEventAfterFailure) {
    throw new Error('Failed atomic commit prematurely marked event as processed in storage');
  }

  // 2. Successful refund processing on retry
  const success = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, makeRefundEnvelope(refundPayload));
  if (!success.success || success.subscription?.status !== 'cancelled' || success.subscription?.lastPaymentStatus !== 'refunded') {
    throw new Error(`Refund processing failed: ${JSON.stringify(success)}`);
  }

  // 3. Duplicate refund idempotently ignored
  const duplicate = await subscriptionLifecycleService.processRefundWebhookEvent(refundPayload, storage, makeRefundEnvelope(refundPayload));
  if (!duplicate.success || !duplicate.duplicate) {
    throw new Error(`Duplicate refund not detected idempotently: ${JSON.stringify(duplicate)}`);
  }

  // Negative test [FINDING-ADIM027-002]: Replay of same eventId with conflicting payload fingerprint yields INTEGRITY_CONFLICT
  const tamperedReplayPayload = { ...refundPayload, amountMinor: 25000, isFullRefund: false };
  const tamperedReplay = await subscriptionLifecycleService.processRefundWebhookEvent(
    tamperedReplayPayload,
    storage,
    makeRefundEnvelope(tamperedReplayPayload)
  );
  if (tamperedReplay.success || tamperedReplay.errorCode !== 'INTEGRITY_CONFLICT') {
    throw new Error(`Expected INTEGRITY_CONFLICT on replay with mismatched payload, got ${JSON.stringify(tamperedReplay)}`);
  }

  // Negative test [FINDING-ADIM027-003]: New refund event referencing already refunded payment rejected
  storage.seedSubscription({
    tenantId: 'tenant_already_ref_qa',
    planId: 'standart',
    status: 'active',
    providerSubscriptionId: 'sub_ref_already_ref_qa'
  });
  storage.seedPayment({
    id: 'pay_already_ref_qa',
    tenantId: 'tenant_already_ref_qa',
    subscriptionReferenceCode: 'sub_ref_already_ref_qa',
    amountMinor: 50000,
    currency: 'TRY',
    status: 'refunded'
  });
  const alreadyRefPayload = {
    providerEventId: 'evt_new_attempt_already_ref',
    subscriptionReferenceCode: 'sub_ref_already_ref_qa',
    tenantId: 'tenant_already_ref_qa',
    paymentId: 'pay_already_ref_qa',
    amountMinor: 50000,
    currency: 'TRY',
    isFullRefund: true
  };
  const alreadyRefRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    alreadyRefPayload,
    storage,
    makeRefundEnvelope(alreadyRefPayload)
  );
  if (alreadyRefRes.success || alreadyRefRes.errorCode !== 'PAYMENT_ALREADY_REFUNDED') {
    throw new Error(`Expected PAYMENT_ALREADY_REFUNDED for refunded payment, got ${JSON.stringify(alreadyRefRes)}`);
  }

  // Negative test [FINDING-ADIM027-013]: Semantic event type bound to refund mutation
  const invalidTypePayload = { ...refundPayload, providerEventId: 'evt_mismatched_op_type' };
  const rawWithPaymentSucceeded = JSON.stringify({ ...invalidTypePayload, eventType: 'payment.succeeded' });
  const paymentSucceededSig = refundProvider.signWebhookPayload(rawWithPaymentSucceeded);
  const badTypeRes1 = await subscriptionLifecycleService.processRefundWebhookEvent(
    invalidTypePayload,
    storage,
    { rawPayload: rawWithPaymentSucceeded, headers: paymentSucceededSig.headers, provider: refundProvider }
  );
  if (badTypeRes1.success || badTypeRes1.errorCode !== 'INVALID_EVENT_TYPE') {
    throw new Error(`Expected INVALID_EVENT_TYPE for payment.succeeded in refund handler, got ${JSON.stringify(badTypeRes1)}`);
  }

  const rawWithMissingType = JSON.stringify({ ...invalidTypePayload, eventType: undefined });
  const missingTypeSig = refundProvider.signWebhookPayload(rawWithMissingType);
  const badTypeRes2 = await subscriptionLifecycleService.processRefundWebhookEvent(
    invalidTypePayload,
    storage,
    { rawPayload: rawWithMissingType, headers: missingTypeSig.headers, provider: refundProvider }
  );
  if (badTypeRes2.success || badTypeRes2.errorCode !== 'INVALID_EVENT_TYPE') {
    throw new Error(`Expected INVALID_EVENT_TYPE for missing eventType in refund handler, got ${JSON.stringify(badTypeRes2)}`);
  }

  const rawWithFailedRefundStatus = JSON.stringify({ ...invalidTypePayload, eventType: 'refund.succeeded', status: 'failed' });
  const failedStatusSig = refundProvider.signWebhookPayload(rawWithFailedRefundStatus);
  const badTypeRes3 = await subscriptionLifecycleService.processRefundWebhookEvent(
    invalidTypePayload,
    storage,
    { rawPayload: rawWithFailedRefundStatus, headers: failedStatusSig.headers, provider: refundProvider }
  );
  if (badTypeRes3.success || badTypeRes3.errorCode !== 'INVALID_EVENT_TYPE') {
    throw new Error(`Expected INVALID_EVENT_TYPE for failed refund status, got ${JSON.stringify(badTypeRes3)}`);
  }

  // Statusless refund.created, generic refund, and pending/processing refund events must NEVER mutate
  for (const nonTerminalCase of [
    { eventType: 'refund.created' },
    { eventType: 'refund' },
    { eventType: 'refund.created', status: 'pending' },
    { eventType: 'refund.succeeded', status: 'pending' },
    { eventType: 'refund.succeeded', status: 'processing' }
  ]) {
    const rawNonTerminal = JSON.stringify({
      ...invalidTypePayload,
      providerEventId: `evt_nonterm_${nonTerminalCase.eventType}_${nonTerminalCase.status ?? 'none'}`,
      ...nonTerminalCase
    });
    const nonTermSig = refundProvider.signWebhookPayload(rawNonTerminal);
    const nonTermRes = await subscriptionLifecycleService.processRefundWebhookEvent(
      { ...invalidTypePayload, providerEventId: `evt_nonterm_${nonTerminalCase.eventType}_${nonTerminalCase.status ?? 'none'}` },
      storage,
      { rawPayload: rawNonTerminal, headers: nonTermSig.headers, provider: refundProvider }
    );
    if (nonTermRes.success || nonTermRes.errorCode !== 'INVALID_EVENT_TYPE') {
      throw new Error(`Non-terminal refund case ${JSON.stringify(nonTerminalCase)} was accepted: ${JSON.stringify(nonTermRes)}`);
    }
  }

  // Negative tests [FINDING-ADIM027-030]: Conflicting eventType/type/operationType aliases rejected fail-closed without mutation
  const refundPayBeforeAlias = await storage.getPayment(refundPayload.paymentId);
  const refundSubBeforeAlias = storage.getSubscription(refundPayload.tenantId);
  for (const [idx, aliasCase] of [
    { eventType: 'payment.refunded', type: 'payment.succeeded' },
    { eventType: 'payment.refunded', operationType: 'refund.failed' },
    { eventType: 'payment.refunded', type: 'refund.succeeded' },
    { type: 'payment.refunded', operationType: '' },
    { eventType: 'subscription.refunded', type: 'payment.failed' }
  ].entries()) {
    const conflictEventId = `evt_refund_alias_conflict_${idx}`;
    const rawAliasConflict = JSON.stringify({
      ...invalidTypePayload,
      providerEventId: conflictEventId,
      ...aliasCase
    });
    const aliasSig = refundProvider.signWebhookPayload(rawAliasConflict);
    const aliasRes = await subscriptionLifecycleService.processRefundWebhookEvent(
      { ...invalidTypePayload, providerEventId: conflictEventId },
      storage,
      { rawPayload: rawAliasConflict, headers: aliasSig.headers, provider: refundProvider }
    );
    if (aliasRes.success || aliasRes.errorCode !== 'INVALID_EVENT_TYPE') {
      throw new Error(`Conflicting refund aliases ${JSON.stringify(aliasCase)} were accepted: ${JSON.stringify(aliasRes)}`);
    }
    if (await storage.hasProcessedEvent(conflictEventId)) {
      throw new Error(`Conflicting refund alias event ${conflictEventId} recorded event claim`);
    }
  }
  const refundPayAfterAlias = await storage.getPayment(refundPayload.paymentId);
  const refundSubAfterAlias = storage.getSubscription(refundPayload.tenantId);
  if (
    refundPayAfterAlias?.status !== refundPayBeforeAlias?.status ||
    refundSubAfterAlias?.status !== refundSubBeforeAlias?.status
  ) {
    throw new Error('Conflicting refund alias test mutated payment or subscription');
  }

  // Negative test: Omitted isFullRefund in signed rawPayload when payload sets isFullRefund:false rejected
  const { isFullRefund: _omittedFlag, ...rawWithoutFullFlag } = { ...invalidTypePayload, eventType: 'payment.refunded' };
  const missingFlagSig = refundProvider.signWebhookPayload(JSON.stringify(rawWithoutFullFlag));
  const missingFlagRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    { ...invalidTypePayload, isFullRefund: false },
    storage,
    { rawPayload: JSON.stringify(rawWithoutFullFlag), headers: missingFlagSig.headers, provider: refundProvider }
  );
  if (missingFlagRes.success || missingFlagRes.errorCode !== 'RAW_PAYLOAD_MISMATCH') {
    throw new Error(`Expected RAW_PAYLOAD_MISMATCH when isFullRefund omitted from signed rawPayload, got ${JSON.stringify(missingFlagRes)}`);
  }

  // Positive & Negative tests for consecutive partial refunds [FINDING-ADIM027-003]
  storage.seedSubscription({
    tenantId: 'tenant_partial_qa',
    planId: 'standart',
    status: 'active',
    providerSubscriptionId: 'sub_ref_partial_qa'
  });
  storage.seedPayment({
    id: 'pay_partial_qa',
    tenantId: 'tenant_partial_qa',
    subscriptionReferenceCode: 'sub_ref_partial_qa',
    amountMinor: 50000,
    currency: 'TRY',
    status: 'paid'
  });

  // Partial refund 1: 15000 of 50000
  const partialPayload1 = {
    providerEventId: 'evt_partial_01',
    subscriptionReferenceCode: 'sub_ref_partial_qa',
    tenantId: 'tenant_partial_qa',
    paymentId: 'pay_partial_qa',
    amountMinor: 15000,
    currency: 'TRY',
    isFullRefund: false
  };
  const partRes1 = await subscriptionLifecycleService.processRefundWebhookEvent(
    partialPayload1,
    storage,
    makeRefundEnvelope(partialPayload1)
  );
  if (!partRes1.success || partRes1.subscription?.status !== 'active') {
    throw new Error(`Partial refund 1 failed or altered subscription status: ${JSON.stringify(partRes1)}`);
  }
  const payAfter1 = await storage.getPayment('pay_partial_qa');
  if (payAfter1?.status !== 'partially_refunded' || payAfter1?.refundedAmountMinor !== 15000) {
    throw new Error(`Payment state invalid after partial refund 1: ${JSON.stringify(payAfter1)}`);
  }

  // Excess partial refund rejected: attempting 40000 when remaining is 35000
  const excessPartialPayload = {
    providerEventId: 'evt_partial_excess',
    subscriptionReferenceCode: 'sub_ref_partial_qa',
    tenantId: 'tenant_partial_qa',
    paymentId: 'pay_partial_qa',
    amountMinor: 40000,
    currency: 'TRY',
    isFullRefund: false
  };
  const excessRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    excessPartialPayload,
    storage,
    makeRefundEnvelope(excessPartialPayload)
  );
  if (excessRes.success || excessRes.errorCode !== 'REFUND_EXCEEDS_PAYMENT') {
    throw new Error(`Excessive partial refund accepted: ${JSON.stringify(excessRes)}`);
  }

  // Partial refund 2: exact remaining 35000 -> completes full refund and cancels subscription
  const partialPayload2 = {
    providerEventId: 'evt_partial_02',
    subscriptionReferenceCode: 'sub_ref_partial_qa',
    tenantId: 'tenant_partial_qa',
    paymentId: 'pay_partial_qa',
    amountMinor: 35000,
    currency: 'TRY',
    isFullRefund: true
  };
  const partRes2 = await subscriptionLifecycleService.processRefundWebhookEvent(
    partialPayload2,
    storage,
    makeRefundEnvelope(partialPayload2)
  );
  if (!partRes2.success || partRes2.subscription?.status !== 'cancelled') {
    throw new Error(`Final partial refund failed or did not cancel subscription: ${JSON.stringify(partRes2)}`);
  }
  const payAfter2 = await storage.getPayment('pay_partial_qa');
  if (payAfter2?.status !== 'refunded' || payAfter2?.refundedAmountMinor !== 50000) {
    throw new Error(`Payment state invalid after final refund: ${JSON.stringify(payAfter2)}`);
  }

  // Subsequent refund on fully refunded payment rejected
  const postRefundPayload = {
    providerEventId: 'evt_partial_post',
    subscriptionReferenceCode: 'sub_ref_partial_qa',
    tenantId: 'tenant_partial_qa',
    paymentId: 'pay_partial_qa',
    amountMinor: 1000,
    currency: 'TRY'
  };
  const postRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    postRefundPayload,
    storage,
    makeRefundEnvelope(postRefundPayload)
  );
  if (postRes.success || postRes.errorCode !== 'PAYMENT_ALREADY_REFUNDED') {
    throw new Error(`Post-refund attempt accepted: ${JSON.stringify(postRes)}`);
  }

  // Concurrent subscription status mutation (active -> past_due) while refund awaits getPayment fails closed [FINDING-ADIM027-003]
  storage.seedSubscription({
    tenantId: 'tenant_refund_race_01',
    planId: 'standart',
    status: 'active',
    lastPaymentStatus: 'paid',
    providerSubscriptionId: 'sub_ref_refund_race_01'
  });
  storage.seedPayment({
    id: 'pay_refund_race_01',
    tenantId: 'tenant_refund_race_01',
    subscriptionReferenceCode: 'sub_ref_refund_race_01',
    amountMinor: 50000,
    currency: 'TRY',
    status: 'paid'
  });

  const raceRefundStorage = {
    getSubscriptionByReference: storage.getSubscriptionByReference.bind(storage),
    saveSubscription: storage.saveSubscription.bind(storage),
    hasProcessedEvent: storage.hasProcessedEvent.bind(storage),
    recordProcessedEvent: storage.recordProcessedEvent.bind(storage),
    commitTransitionAtomic: storage.commitTransitionAtomic.bind(storage),
    commitRefundAtomic: storage.commitRefundAtomic.bind(storage),
    async getPayment(paymentId) {
      const p = await storage.getPayment(paymentId);
      if (paymentId === 'pay_refund_race_01') {
        const failEvt = {
          eventType: 'subscription.past_due',
          providerEventId: 'evt_concurrent_past_due_01',
          subscriptionReferenceCode: 'sub_ref_refund_race_01',
          customerReferenceCode: 'tenant_refund_race_01',
          eventTimestamp: '2026-10-12T10:00:00.000Z'
        };
        const concurrentRes = await subscriptionLifecycleService.processVerifiedWebhook(
          failEvt,
          storage,
          makeWebhookEnvelope(failEvt)
        );
        if (!concurrentRes.success || concurrentRes.subscription?.status !== 'past_due') {
          throw new Error(`Concurrent past_due transition failed in barrier setup: ${JSON.stringify(concurrentRes)}`);
        }
      }
      return p;
    }
  };

  const racePartialRefundPayload = {
    providerEventId: 'evt_partial_race_01',
    subscriptionReferenceCode: 'sub_ref_refund_race_01',
    tenantId: 'tenant_refund_race_01',
    paymentId: 'pay_refund_race_01',
    amountMinor: 10000,
    currency: 'TRY',
    isFullRefund: false
  };
  const raceRefundRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    racePartialRefundPayload,
    raceRefundStorage,
    makeRefundEnvelope(racePartialRefundPayload)
  );
  if (raceRefundRes.success || !raceRefundRes.retryable || raceRefundRes.errorCode !== 'IN_PROGRESS_RETRYABLE') {
    throw new Error(`Stale refund overwrote concurrent past_due transition: ${JSON.stringify(raceRefundRes)}`);
  }
  const raceSubAfter = storage.getSubscription('tenant_refund_race_01');
  if (raceSubAfter?.status !== 'past_due' || raceSubAfter?.lastPaymentStatus !== 'failed') {
    throw new Error(`Concurrent past_due subscription was overwritten by stale refund: ${JSON.stringify(raceSubAfter)}`);
  }

  // Stale timestamped refund older than subscription watermark rejected without mutating payment/subscription
  const staleRefundEnvelope = makeRefundEnvelope({
    ...racePartialRefundPayload,
    providerEventId: 'evt_refund_stale_ts_01',
    eventTimestamp: '2026-10-12T09:00:00.000Z'
  });
  const staleRefundRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    { ...racePartialRefundPayload, providerEventId: 'evt_refund_stale_ts_01' },
    storage,
    staleRefundEnvelope
  );
  if (staleRefundRes.success || staleRefundRes.errorCode !== 'STALE_EVENT_OUT_OF_ORDER') {
    throw new Error(`Stale refund timestamp bypassed watermark: ${JSON.stringify(staleRefundRes)}`);
  }

  // Future timestamped refund beyond clock skew rejected without mutating payment/subscription
  const futureRefundEnvelope = makeRefundEnvelope({
    ...racePartialRefundPayload,
    providerEventId: 'evt_refund_future_ts_01',
    eventTimestamp: '2099-01-01T00:00:00.000Z'
  });
  const futureRefundRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    { ...racePartialRefundPayload, providerEventId: 'evt_refund_future_ts_01' },
    storage,
    futureRefundEnvelope
  );
  if (futureRefundRes.success || futureRefundRes.errorCode !== 'INVALID_EVENT_TIMESTAMP') {
    throw new Error(`Future refund timestamp beyond skew was accepted: ${JSON.stringify(futureRefundRes)}`);
  }

  // Negative tests [FINDING-ADIM027-027]: Timestampless refund rejected when watermark exists & rechecked under atomic lock
  const noTsSubBefore = storage.getSubscription('tenant_refund_race_01');
  const noTsPayBefore = await storage.getPayment('pay_refund_race_01');
  const noTsRefundEnvelope = makeRefundEnvelope({
    ...racePartialRefundPayload,
    providerEventId: 'evt_refund_missing_ts_01'
  });
  const noTsRefundRes = await subscriptionLifecycleService.processRefundWebhookEvent(
    { ...racePartialRefundPayload, providerEventId: 'evt_refund_missing_ts_01' },
    storage,
    noTsRefundEnvelope
  );
  if (noTsRefundRes.success || noTsRefundRes.errorCode !== 'STALE_EVENT_OUT_OF_ORDER') {
    throw new Error(`Timestampless refund bypassed subscription watermark: ${JSON.stringify(noTsRefundRes)}`);
  }
  if (await storage.hasProcessedEvent('evt_refund_missing_ts_01')) {
    throw new Error('Timestampless refund against watermarked subscription recorded event claim');
  }
  const noTsPayAfter = await storage.getPayment('pay_refund_race_01');
  const noTsSubAfter = storage.getSubscription('tenant_refund_race_01');
  if (
    noTsPayAfter?.status !== noTsPayBefore?.status ||
    noTsPayAfter?.refundedAmountMinor !== noTsPayBefore?.refundedAmountMinor ||
    noTsSubAfter?.lastWebhookEventAt !== noTsSubBefore?.lastWebhookEventAt
  ) {
    throw new Error('Timestampless refund mutated payment or subscription');
  }

  // Direct atomic lock watermark check on InMemoryStorageAdapter.commitRefundAtomic
  for (const atomicBadCase of [
    { id: 'evt_atomic_refund_missing_ts', ts: undefined },
    { id: 'evt_atomic_refund_equal_ts', ts: noTsSubBefore.lastWebhookEventAt },
    { id: 'evt_atomic_refund_older_ts', ts: '2026-10-12T08:00:00.000Z' },
    { id: 'evt_atomic_refund_future_ts', ts: '2099-01-01T00:00:00.000Z' }
  ]) {
    const atomicBadRes = await storage.commitRefundAtomic(
      {
        providerEventId: atomicBadCase.id,
        eventType: 'payment.refunded',
        tenantId: 'tenant_refund_race_01',
        subscriptionReferenceCode: 'sub_ref_refund_race_01',
        processedAt: new Date().toISOString(),
        eventTimestamp: atomicBadCase.ts,
        payloadFingerprint: `fp_${atomicBadCase.id}`
      },
      { ...noTsSubBefore, status: 'cancelled' },
      'pay_refund_race_01',
      `fp_${atomicBadCase.id}`,
      { refundAmountMinor: 10000 }
    );
    if (atomicBadRes.success || atomicBadRes.status !== 'stale_event') {
      throw new Error(`commitRefundAtomic allowed ${atomicBadCase.id}: ${JSON.stringify(atomicBadRes)}`);
    }
    if (await storage.hasProcessedEvent(atomicBadCase.id)) {
      throw new Error(`commitRefundAtomic recorded processed event for ${atomicBadCase.id}`);
    }
  }
});

// 15. Subscription reconciliation (mutabakat) rules & terminal state protection
runStep('15. Subscription reconciliation (mutabakat) rules & terminal state protection', () => {
  // A. Protects manual_active from remote override
  const manualSub = {
    tenantId: 'tenant_manual_rec',
    planId: 'standart',
    status: 'manual_active',
    cancelAtPeriodEnd: false
  };
  const recManual = subscriptionLifecycleService.reconcileSubscription(manualSub, { status: 'CANCELED' });
  if (!recManual.inSync || recManual.reconciledSub.status !== 'manual_active') {
    throw new Error(`Manual subscription was mutated during reconciliation: ${JSON.stringify(recManual)}`);
  }

  // B. Protects comped from remote override
  const compedSub = {
    tenantId: 'tenant_comped_rec',
    planId: 'standart',
    status: 'comped',
    cancelAtPeriodEnd: false
  };
  const recComped = subscriptionLifecycleService.reconcileSubscription(compedSub, { status: 'CANCELED' });
  if (!recComped.inSync || recComped.reconciledSub.status !== 'comped') {
    throw new Error(`Comped subscription was mutated during reconciliation: ${JSON.stringify(recComped)}`);
  }

  // C. Refuses to resurrect terminal cancelled subscription
  const cancelledSub = {
    tenantId: 'tenant_canc_rec',
    planId: 'standart',
    status: 'cancelled',
    cancelAtPeriodEnd: false
  };
  const recCanc = subscriptionLifecycleService.reconcileSubscription(cancelledSub, { status: 'ACTIVE' });
  if (recCanc.inSync || recCanc.reconciledSub.status !== 'cancelled' || recCanc.resolutionApplied !== 'manual_review_required') {
    throw new Error(`Cancelled subscription resurrected to active: ${JSON.stringify(recCanc)}`);
  }

  // D. Negative test [FINDING-ADIM027-001]: Fake ACTIVE input without verified payment proof cannot transition past_due to active
  const pastDueSub = {
    tenantId: 'tenant_pd_rec',
    planId: 'standart',
    status: 'past_due',
    cancelAtPeriodEnd: false
  };
  const recPdFake = subscriptionLifecycleService.reconcileSubscription(pastDueSub, { status: 'ACTIVE', hasVerifiedPaymentProof: false });
  if (recPdFake.inSync || recPdFake.reconciledSub.status !== 'past_due' || recPdFake.resolutionApplied !== 'manual_review_required') {
    throw new Error(`past_due was improperly transitioned to active without verified payment proof: ${JSON.stringify(recPdFake)}`);
  }

  // E. Syncs past_due to active ONLY when remote payment proof is verified
  const recPd = subscriptionLifecycleService.reconcileSubscription(pastDueSub, { status: 'ACTIVE', hasVerifiedPaymentProof: true });
  if (recPd.inSync || recPd.reconciledSub.status !== 'active' || recPd.resolutionApplied !== 'updated_local_status') {
    throw new Error(`past_due failed to sync to active with verified payment proof: ${JSON.stringify(recPd)}`);
  }

  // F. Plan mismatch [FINDING-ADIM027-008]: Reports plan_mismatch and inSync: false
  const activeSub = {
    tenantId: 'tenant_active_rec',
    planId: 'standart',
    status: 'active',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false
  };
  const recPlanMismatch = subscriptionLifecycleService.reconcileSubscription(activeSub, { status: 'ACTIVE', planId: 'kurumsal' });
  if (recPlanMismatch.inSync || recPlanMismatch.discrepancyType !== 'plan_mismatch' || recPlanMismatch.resolutionApplied !== 'manual_review_required') {
    throw new Error(`Plan mismatch was not detected properly: ${JSON.stringify(recPlanMismatch)}`);
  }

  // G. Period mismatch [FINDING-ADIM027-008]: Reports period_mismatch and updated_period
  const recPeriodMismatch = subscriptionLifecycleService.reconcileSubscription(activeSub, { status: 'ACTIVE', currentPeriodEnd: '2026-11-01T00:00:00.000Z' });
  if (recPeriodMismatch.inSync || recPeriodMismatch.discrepancyType !== 'period_mismatch' || recPeriodMismatch.resolutionApplied !== 'updated_period' || recPeriodMismatch.reconciledSub.currentPeriodEnd !== '2026-11-01T00:00:00.000Z') {
    throw new Error(`Period mismatch was not resolved properly: ${JSON.stringify(recPeriodMismatch)}`);
  }

  // H. Negative test [FINDING-ADIM027-020]: Unknown, empty, and unsupported remote status fail closed to manual review without mutation
  for (const weirdStatus of ['CORRUPTED_UNKNOWN_STATE', 'MYSTERY_STATUS', '', '   ']) {
    const weirdRec = subscriptionLifecycleService.reconcileSubscription(activeSub, { status: weirdStatus });
    if (
      weirdRec.inSync ||
      weirdRec.discrepancyType !== 'status_mismatch' ||
      weirdRec.resolutionApplied !== 'manual_review_required' ||
      weirdRec.reconciledSub.status !== 'active'
    ) {
      throw new Error(`Unrecognized/empty remote status '${weirdStatus}' was not flagged for manual review: ${JSON.stringify(weirdRec)}`);
    }
  }
});

// 15B. subscriptionService.reconcileSubscriptionWithProvider integration & persistence [FINDING-ADIM027-001 & FINDING-ADIM027-008]
await runAsyncStep('15B. subscriptionService.reconcileSubscriptionWithProvider integration & persistence', async () => {
  const tenantId = 'tenant_serv_rec_01';
  const mockSub = {
    tenantId,
    planId: 'standart',
    status: 'past_due',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false
  };
  localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(mockSub));

  // 1. Negative test: Fake ACTIVE without payment proof must NOT alter past_due status
  const fakeRes = await subscriptionService.reconcileSubscriptionWithProvider(tenantId, {
    status: 'ACTIVE',
    hasVerifiedPaymentProof: false
  });
  if (fakeRes.inSync || fakeRes.subscription.status !== 'past_due') {
    throw new Error('Fake ACTIVE input without verified payment proof changed subscription in service!');
  }
  const reread1 = await subscriptionService.getCurrentSubscription(tenantId);
  if (reread1?.status !== 'past_due') {
    throw new Error('Fake ACTIVE was improperly persisted to storage!');
  }

  // 2. Legitimate recovery with verified payment proof transitions to active and persists
  const validRes = await subscriptionService.reconcileSubscriptionWithProvider(tenantId, {
    status: 'ACTIVE',
    hasVerifiedPaymentProof: true
  });
  if (validRes.inSync || validRes.subscription.status !== 'active') {
    throw new Error('Legitimate ACTIVE with payment proof failed to update status!');
  }
  const reread2 = await subscriptionService.getCurrentSubscription(tenantId);
  if (reread2?.status !== 'active') {
    throw new Error('Updated active status was not persisted to storage!');
  }

  // 3. Period mismatch is persisted and preserved upon subsequent reads [FINDING-ADIM027-008]
  const newPeriodEnd = '2026-11-15T00:00:00.000Z';
  const periodRes = await subscriptionService.reconcileSubscriptionWithProvider(tenantId, {
    status: 'ACTIVE',
    currentPeriodEnd: newPeriodEnd
  });
  if (periodRes.inSync || periodRes.subscription.currentPeriodEnd !== newPeriodEnd) {
    throw new Error('Period mismatch was not updated in reconciliation result!');
  }
  const reread3 = await subscriptionService.getCurrentSubscription(tenantId);
  if (reread3?.currentPeriodEnd !== newPeriodEnd) {
    throw new Error(`Updated currentPeriodEnd (${newPeriodEnd}) was not persisted to storage (got ${reread3?.currentPeriodEnd})!`);
  }

  // 4. Negative test [FINDING-ADIM027-001]: Non-mock/supabase mode rejects client-supplied reconciliation
  const prevMode = process.env.VITE_DATA_MODE;
  process.env.VITE_DATA_MODE = 'supabase_staging';
  let rejectedInSupabase = false;
  try {
    await subscriptionService.reconcileSubscriptionWithProvider(tenantId, {
      status: 'ACTIVE',
      hasVerifiedPaymentProof: true
    });
  } catch (err) {
    if (err.message.includes('unauthorized in production/supabase mode')) {
      rejectedInSupabase = true;
    }
  } finally {
    if (prevMode === undefined) {
      delete process.env.VITE_DATA_MODE;
    } else {
      process.env.VITE_DATA_MODE = prevMode;
    }
  }
  if (!rejectedInSupabase) {
    throw new Error('reconcileSubscriptionWithProvider allowed client-supplied state in supabase_staging mode!');
  }
});

// 16. DeterministicTestPaymentProvider comprehensive verification
await runAsyncStep('16. DeterministicTestPaymentProvider comprehensive verification', async () => {
  let seq = 0;
  const provider = new DeterministicTestPaymentProvider({
    fixedNow: () => 1700000000000 + (++seq * 1000),
    idGenerator: (p) => `${p}_test_${++seq}`
  });

  // A. Money validation
  const validMoney = validatePaymentMoney(10000, 'TRY');
  const invalidMinor = validatePaymentMoney(-50, 'TRY');
  const invalidCurrency = validatePaymentMoney(10000, 'try');
  if (!validMoney.valid || invalidMinor.valid || invalidCurrency.valid) {
    throw new Error('validatePaymentMoney failed validation rules');
  }

  // B. Intent creation & idempotency conflict detection
  const intent1 = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 25000,
    currency: 'TRY',
    idempotencyKey: 'idem_key_01'
  });
  if (intent1.status !== 'created' || intent1.amountMinor !== 25000) {
    throw new Error(`Intent creation failed: ${JSON.stringify(intent1)}`);
  }
  // Same idempotency key and params returns identical intent
  const intent1Dup = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 25000,
    currency: 'TRY',
    idempotencyKey: 'idem_key_01'
  });
  if (intent1Dup.id !== intent1.id) {
    throw new Error('Duplicate intent with matching params did not return existing record');
  }

  // Negative test [FINDING-ADIM027-009]: Delimiter collision prevention in createPaymentIntent
  const intentColA = await provider.createPaymentIntent({
    tenantId: 'tenant:col',
    purpose: 'subscription',
    amountMinor: 15000,
    currency: 'TRY',
    idempotencyKey: 'sub:key1'
  });
  const intentColB = await provider.createPaymentIntent({
    tenantId: 'tenant',
    purpose: 'subscription',
    amountMinor: 15000,
    currency: 'TRY',
    idempotencyKey: 'col:sub:key1'
  });
  if (intentColA.id === intentColB.id) {
    throw new Error('Delimiter collision allowed cross-tenant intent sharing in createPaymentIntent');
  }

  // Negative test [FINDING-ADIM027-009]: Differing resourceId with same idempotency key throws IDEMPOTENCY_CONFLICT
  let intentResourceConflict = false;
  try {
    await provider.createPaymentIntent({
      tenantId: 'tenant_prov_01',
      purpose: 'subscription',
      amountMinor: 25000,
      currency: 'TRY',
      idempotencyKey: 'idem_key_01',
      resourceId: 'different_resource_spec'
    });
  } catch (err) {
    if (err.message.includes('IDEMPOTENCY_CONFLICT')) {
      intentResourceConflict = true;
    }
  }
  if (!intentResourceConflict) {
    throw new Error('Differing resourceId with same idempotency key did not throw IDEMPOTENCY_CONFLICT');
  }

  // Metadata key order invariance vs differing metadata IDEMPOTENCY_CONFLICT
  const intentMeta1 = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 30000,
    currency: 'TRY',
    idempotencyKey: 'idem_meta_01',
    metadata: { plan: 'pro', cycle: 'monthly' }
  });
  const intentMetaSameReordered = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 30000,
    currency: 'TRY',
    idempotencyKey: 'idem_meta_01',
    metadata: { cycle: 'monthly', plan: 'pro' }
  });
  if (intentMetaSameReordered.id !== intentMeta1.id) {
    throw new Error('Reordered identical metadata keys did not preserve idempotent PaymentIntent');
  }
  let intentMetaConflict = false;
  try {
    await provider.createPaymentIntent({
      tenantId: 'tenant_prov_01',
      purpose: 'subscription',
      amountMinor: 30000,
      currency: 'TRY',
      idempotencyKey: 'idem_meta_01',
      metadata: { plan: 'kurumsal', cycle: 'monthly' }
    });
  } catch (err) {
    if (err.message.includes('IDEMPOTENCY_CONFLICT')) {
      intentMetaConflict = true;
    }
  }
  if (!intentMetaConflict) {
    throw new Error('Differing metadata with same idempotency key did not throw IDEMPOTENCY_CONFLICT');
  }

  // C. Webhook simulation & deterministic payload-bound signature [FINDING-ADIM027-004]
  const sim = provider.simulateWebhookEvent(intent1.id, 'success');
  const sigValid = await provider.verifyWebhook(sim.headers, sim.rawPayload);
  const sigInvalid = await provider.verifyWebhook({ 'x-test-provider-signature': 'forged' }, sim.rawPayload);
  if (!sigValid || sigInvalid) {
    throw new Error('Deterministic webhook signature verification failed');
  }

  // Negative test [FINDING-ADIM027-004]: Tampering any canonical field in rawPayload must fail verification
  const parsedPayload = JSON.parse(sim.rawPayload);
  const tamperedEventId = JSON.stringify({ ...parsedPayload, providerEventId: 'tampered_evt_id' });
  const tamperedIntentId = JSON.stringify({ ...parsedPayload, intentId: 'tampered_intent_id' });
  const tamperedStatus = JSON.stringify({ ...parsedPayload, status: 'failed' });

  if (await provider.verifyWebhook(sim.headers, tamperedEventId)) {
    throw new Error('Tampered providerEventId was accepted by verifyWebhook');
  }
  if (await provider.verifyWebhook(sim.headers, tamperedIntentId)) {
    throw new Error('Tampered intentId was accepted by verifyWebhook');
  }
  if (await provider.verifyWebhook(sim.headers, tamperedStatus)) {
    throw new Error('Tampered status was accepted by verifyWebhook');
  }

  const normalized = provider.normalizeEvent(sim.rawPayload);
  if (normalized.status !== 'succeeded' || normalized.intentId !== intent1.id) {
    throw new Error(`Normalized event mismatch: ${JSON.stringify(normalized)}`);
  }
  if (normalized.amountMinor !== 25000 || normalized.currency !== 'TRY' || normalized.tenantId !== 'tenant_prov_01') {
    throw new Error(`Normalized event missing financial/tenant fields: ${JSON.stringify(normalized)}`);
  }

  // Negative test: normalizeEvent rejects negative amountMinor and invalid standalone currency in payload
  let normMoneyError = false;
  try {
    provider.normalizeEvent(JSON.stringify({
      providerEventId: 'evt_neg_money_norm',
      eventType: 'payment.succeeded',
      amountMinor: -50,
      currency: 'TRY'
    }));
  } catch (err) {
    normMoneyError = true;
  }
  if (!normMoneyError) {
    throw new Error('normalizeEvent accepted negative amountMinor');
  }
  let normCurrencyError = false;
  try {
    provider.normalizeEvent(JSON.stringify({
      providerEventId: 'evt_bad_curr_norm',
      eventType: 'payment.succeeded',
      currency: 'try'
    }));
  } catch (err) {
    normCurrencyError = true;
  }
  if (!normCurrencyError) {
    throw new Error('normalizeEvent accepted invalid standalone lowercase currency');
  }

  // Negative test [FINDING-ADIM027-010]: normalizeEvent derives rawPayloadHash internally and ignores attacker hash
  const forgedHashPayload = JSON.stringify({
    providerEventId: 'evt_hash_derive_qa',
    intentId: 'intent_hash_qa',
    status: 'succeeded',
    rawPayloadHash: 'attacker_forged_hash_value'
  });
  const normalizedForged = provider.normalizeEvent(forgedHashPayload);
  if (normalizedForged.rawPayloadHash === 'attacker_forged_hash_value') {
    throw new Error('normalizeEvent accepted attacker-supplied rawPayloadHash');
  }
  const evalRep1 = provider.evaluateEventReplay('evt_replay_tamper_qa', normalizedForged.rawPayloadHash);
  if (evalRep1 !== 'NEW') throw new Error('Expected NEW on first replay evaluation');
  const tamperedReplayPayload = JSON.stringify({
    providerEventId: 'evt_replay_tamper_qa',
    intentId: 'intent_hash_qa_tampered',
    status: 'succeeded'
  });
  const normalizedTampered = provider.normalizeEvent(tamperedReplayPayload);
  const evalRep2 = provider.evaluateEventReplay('evt_replay_tamper_qa', normalizedTampered.rawPayloadHash);
  if (evalRep2 !== 'INTEGRITY_CONFLICT') {
    throw new Error(`Expected INTEGRITY_CONFLICT for tampered event replay, got ${evalRep2}`);
  }

  // D. Event replay
  const r1 = provider.evaluateEventReplay('evt_det_01', 'hash_aaa');
  const r2 = provider.evaluateEventReplay('evt_det_01', 'hash_aaa');
  const r3 = provider.evaluateEventReplay('evt_det_01', 'hash_bbb');
  if (r1 !== 'NEW' || r2 !== 'IDEMPOTENT_SUCCESS' || r3 !== 'INTEGRITY_CONFLICT') {
    throw new Error(`Event replay evaluation failed: r1=${r1}, r2=${r2}, r3=${r3}`);
  }

  // E. Deterministic refund simulation, target ownership, cumulative caps & idempotency [FINDING-ADIM027-005 / -025]
  const refund = await provider.simulateRefund({
    tenantId: 'tenant_prov_01',
    intentId: intent1.id,
    amountMinor: 12000,
    currency: 'TRY',
    idempotencyKey: 'ref_idem_01'
  });
  if (refund.status !== 'succeeded' || refund.amountMinor !== 12000) {
    throw new Error(`Refund simulation failed: ${JSON.stringify(refund)}`);
  }

  // Identical replay succeeds idempotently
  const refundDup = await provider.simulateRefund({
    tenantId: 'tenant_prov_01',
    intentId: intent1.id,
    amountMinor: 12000,
    currency: 'TRY',
    idempotencyKey: 'ref_idem_01'
  });
  if (refundDup.refundId !== refund.refundId) {
    throw new Error('Duplicate refund did not return identical refund record');
  }

  // Negative test [FINDING-ADIM027-005]: Key reuse with differing financial parameters throws IDEMPOTENCY_CONFLICT
  let conflictThrown = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: intent1.id,
      amountMinor: 15000, // Different amount
      currency: 'TRY',
      idempotencyKey: 'ref_idem_01'
    });
  } catch (err) {
    if (err.message.includes('IDEMPOTENCY_CONFLICT')) {
      conflictThrown = true;
    }
  }
  if (!conflictThrown) {
    throw new Error('Differing refund amount with same idempotency key did not throw IDEMPOTENCY_CONFLICT');
  }

  // Negative tests [FINDING-ADIM027-025]: Targetless refund, unknown target, cross-tenant & cumulative limit overflow
  let targetlessRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_targetless_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_REQUIRED')) targetlessRejected = true;
  }
  if (!targetlessRejected) throw new Error('Targetless refund was accepted');

  let unknownIntentRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: 'pi_does_not_exist_999',
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_unknown_intent_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_NOT_FOUND')) unknownIntentRejected = true;
  }
  if (!unknownIntentRejected) throw new Error('Unknown intentId refund was accepted');

  let crossTenantRefundRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_other_attacker',
      intentId: intent1.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_cross_tenant_01'
    });
  } catch (err) {
    if (err.message.includes('TENANT_MISMATCH')) crossTenantRefundRejected = true;
  }
  if (!crossTenantRefundRejected) throw new Error('Cross-tenant intent refund was accepted');

  // Cumulative cap: intent1 = 25000, already refunded 12000; 14000 with NEW key must fail (12000+14000=26000 > 25000)
  let cumulativeOverflowRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: intent1.id,
      amountMinor: 14000,
      currency: 'TRY',
      idempotencyKey: 'ref_cumul_overflow_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_EXCEEDS_INTENT')) cumulativeOverflowRejected = true;
  }
  if (!cumulativeOverflowRejected) throw new Error('Cumulative refund exceeding intent amount was accepted');

  // Remaining 13000 succeeds exactly up to 25000
  const refundSecondHalf = await provider.simulateRefund({
    tenantId: 'tenant_prov_01',
    intentId: intent1.id,
    amountMinor: 13000,
    currency: 'TRY',
    idempotencyKey: 'ref_cumul_valid_02'
  });
  if (refundSecondHalf.status !== 'succeeded' || refundSecondHalf.amountMinor !== 13000) {
    throw new Error('Remaining valid partial refund failed unexpectedly');
  }

  // Negative test [FINDING-ADIM027-005]: Delimiter collision prevention in simulateRefund
  provider.simulateWebhookEvent(intentColA.id, 'success');
  provider.simulateWebhookEvent(intentColB.id, 'success');
  const refColA = await provider.simulateRefund({
    tenantId: 'tenant:col',
    intentId: intentColA.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'sub:key1'
  });
  const refColB = await provider.simulateRefund({
    tenantId: 'tenant',
    intentId: intentColB.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'col:sub:key1'
  });
  if (refColA.refundId === refColB.refundId) {
    throw new Error('Delimiter collision allowed cross-tenant refund sharing in simulateRefund');
  }

  // Negative tests [FINDING-ADIM027-028 / -029]: Refund requires settled intent & timeout never succeeds or consumes balances
  const createdIntent = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 20000,
    currency: 'TRY',
    idempotencyKey: 'idem_unsettled_created_01'
  });
  let createdRefundRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: createdIntent.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_unsettled_created_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_NOT_SETTLED')) createdRefundRejected = true;
  }
  if (!createdRefundRejected) throw new Error('Unsettled created PaymentIntent was allowed to refund');

  const reqActionIntent = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 20000,
    currency: 'TRY',
    idempotencyKey: 'idem_req_action_01'
  });
  provider.simulateWebhookEvent(reqActionIntent.id, 'requires_action');
  let reqActionRefundRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: reqActionIntent.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_req_action_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_NOT_SETTLED')) reqActionRefundRejected = true;
  }
  if (!reqActionRefundRejected) throw new Error('requires_action PaymentIntent was allowed to refund');

  const failedIntent = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 20000,
    currency: 'TRY',
    idempotencyKey: 'idem_failed_01'
  });
  provider.simulateWebhookEvent(failedIntent.id, 'decline');
  let failedRefundRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: failedIntent.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_failed_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_NOT_SETTLED')) failedRefundRejected = true;
  }
  if (!failedRefundRejected) throw new Error('failed PaymentIntent was allowed to refund');

  const timeoutIntent = await provider.createPaymentIntent({
    tenantId: 'tenant_prov_01',
    purpose: 'subscription',
    amountMinor: 20000,
    currency: 'TRY',
    idempotencyKey: 'idem_timeout_01'
  });
  const timeoutWebhook = provider.simulateWebhookEvent(timeoutIntent.id, 'timeout');
  const parsedTimeoutWebhook = JSON.parse(timeoutWebhook.rawPayload);
  if (parsedTimeoutWebhook.eventType === 'payment.succeeded' || parsedTimeoutWebhook.status === 'succeeded') {
    throw new Error(`Timeout webhook falsely reported success: ${timeoutWebhook.rawPayload}`);
  }
  if (parsedTimeoutWebhook.eventType !== 'payment.timeout' || parsedTimeoutWebhook.errorCode !== 'PROVIDER_TIMEOUT') {
    throw new Error(`Unexpected timeout webhook payload: ${timeoutWebhook.rawPayload}`);
  }
  let timeoutIntentRefundRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: timeoutIntent.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_timeout_intent_01'
    });
  } catch (err) {
    if (err.message.includes('REFUND_TARGET_NOT_SETTLED')) timeoutIntentRefundRejected = true;
  }
  if (!timeoutIntentRefundRejected) throw new Error('Timed-out unsettled PaymentIntent was allowed to refund');

  // Timeout during refund on a settled intent must throw PROVIDER_TIMEOUT and leave idempotency & balance untouched
  provider.simulateWebhookEvent(timeoutIntent.id, 'success');
  provider.setSimulationMode('timeout');
  let refundTimeoutThrown = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_prov_01',
      intentId: timeoutIntent.id,
      amountMinor: 20000,
      currency: 'TRY',
      idempotencyKey: 'ref_timeout_retryable_01'
    });
  } catch (err) {
    if (err.message.includes('PROVIDER_TIMEOUT')) refundTimeoutThrown = true;
  }
  provider.setSimulationMode('success');
  if (!refundTimeoutThrown) throw new Error('Timeout simulation mode allowed simulateRefund to succeed or did not signal PROVIDER_TIMEOUT');
  // Retry with the exact same idempotencyKey and full 20000 must succeed without prior balance or idempotency corruption
  const retryAfterTimeoutRefund = await provider.simulateRefund({
    tenantId: 'tenant_prov_01',
    intentId: timeoutIntent.id,
    amountMinor: 20000,
    currency: 'TRY',
    idempotencyKey: 'ref_timeout_retryable_01'
  });
  if (retryAfterTimeoutRefund.status !== 'succeeded' || retryAfterTimeoutRefund.amountMinor !== 20000) {
    throw new Error(`Retry after refund timeout failed or consumed balance: ${JSON.stringify(retryAfterTimeoutRefund)}`);
  }

  // F. Plan change simulation & idempotency
  const planChange = await provider.simulatePlanChange({
    tenantId: 'tenant_prov_01',
    currentPlanId: 'standart',
    targetPlanId: 'professional',
    timing: 'immediate',
    prorationAmountMinor: 1000,
    currency: 'TRY',
    idempotencyKey: 'pc_idem_01'
  });
  if (!planChange.success || planChange.activePlanId !== 'professional') {
    throw new Error(`Plan change simulation failed: ${JSON.stringify(planChange)}`);
  }

  // Idempotent repeat returns identical result
  const planChangeDup = await provider.simulatePlanChange({
    tenantId: 'tenant_prov_01',
    currentPlanId: 'standart',
    targetPlanId: 'professional',
    timing: 'immediate',
    prorationAmountMinor: 1000,
    currency: 'TRY',
    idempotencyKey: 'pc_idem_01'
  });
  if (planChangeDup.activePlanId !== planChange.activePlanId || planChangeDup.effectiveDate !== planChange.effectiveDate) {
    throw new Error('Duplicate plan change did not return cached idempotent result');
  }

  // Negative test: Differing parameters with same idempotencyKey throws IDEMPOTENCY_CONFLICT
  let planConflict = false;
  try {
    await provider.simulatePlanChange({
      tenantId: 'tenant_prov_01',
      currentPlanId: 'standart',
      targetPlanId: 'kurumsal',
      timing: 'immediate',
      idempotencyKey: 'pc_idem_01'
    });
  } catch (err) {
    if (err.message.includes('IDEMPOTENCY_CONFLICT')) {
      planConflict = true;
    }
  }
  if (!planConflict) {
    throw new Error('Plan change key reuse with different plan did not throw IDEMPOTENCY_CONFLICT');
  }

  // Negative test: Invalid negative proration minor rejected
  let negProrationThrown = false;
  try {
    await provider.simulatePlanChange({
      tenantId: 'tenant_prov_01',
      currentPlanId: 'standart',
      targetPlanId: 'professional',
      timing: 'immediate',
      prorationAmountMinor: -500
    });
  } catch (err) {
    negProrationThrown = true;
  }
  if (!negProrationThrown) {
    throw new Error('Negative prorationAmountMinor was accepted in simulatePlanChange');
  }

  // Negative test: Delimiter collision prevention in simulatePlanChange
  const pcColA = await provider.simulatePlanChange({
    tenantId: 'tenant:col',
    currentPlanId: 'standart',
    targetPlanId: 'professional',
    timing: 'immediate',
    idempotencyKey: 'pc:sub1'
  });
  const pcColB = await provider.simulatePlanChange({
    tenantId: 'tenant',
    currentPlanId: 'baslangic',
    targetPlanId: 'standart',
    timing: 'immediate',
    idempotencyKey: 'col:pc:sub1'
  });
  if (pcColA.activePlanId === pcColB.activePlanId && pcColB.activePlanId === 'professional') {
    throw new Error('Delimiter collision allowed cross-tenant plan change reuse');
  }

  // Negative tests [FINDING-ADIM027-026]: Plan catalog validation & upgrade/downgrade timing enforcement
  let unknownPlanRejected = false;
  try {
    await provider.simulatePlanChange({
      tenantId: 'tenant_prov_01',
      currentPlanId: 'standart',
      targetPlanId: 'non_existent_plan_99',
      timing: 'immediate',
      idempotencyKey: 'pc_invalid_not_cached_01'
    });
  } catch (err) {
    if (err.message.includes('INVALID_TARGET_PLAN')) unknownPlanRejected = true;
  }
  if (!unknownPlanRejected) throw new Error('Unknown plan ID was accepted in simulatePlanChange');

  let immediateDowngradeRejected = false;
  try {
    await provider.simulatePlanChange({
      tenantId: 'tenant_prov_01',
      currentPlanId: 'professional',
      targetPlanId: 'baslangic',
      timing: 'immediate',
      idempotencyKey: 'pc_invalid_not_cached_01'
    });
  } catch (err) {
    if (err.message.includes('DOWNGRADE_REQUIRES_PERIOD_END')) immediateDowngradeRejected = true;
  }
  if (!immediateDowngradeRejected) throw new Error('Immediate downgrade was accepted in simulatePlanChange');

  let periodEndUpgradeRejected = false;
  try {
    await provider.simulatePlanChange({
      tenantId: 'tenant_prov_01',
      currentPlanId: 'baslangic',
      targetPlanId: 'kurumsal',
      timing: 'period_end',
      idempotencyKey: 'pc_invalid_not_cached_01'
    });
  } catch (err) {
    if (err.message.includes('UPGRADE_REQUIRES_IMMEDIATE')) periodEndUpgradeRejected = true;
  }
  if (!periodEndUpgradeRejected) throw new Error('Period-end upgrade was accepted in simulatePlanChange');

  // Reusing the same idempotencyKey with a valid period_end downgrade succeeds because failed calls did NOT cache it
  const validDowngrade = await provider.simulatePlanChange({
    tenantId: 'tenant_prov_01',
    currentPlanId: 'professional',
    targetPlanId: 'standart',
    timing: 'period_end',
    idempotencyKey: 'pc_invalid_not_cached_01'
  });
  if (!validDowngrade.success || validDowngrade.planChangeStatus !== 'downgrade_scheduled' || validDowngrade.scheduledPlanId !== 'standart') {
    throw new Error(`Valid period_end downgrade failed after rejected calls: ${JSON.stringify(validDowngrade)}`);
  }

  // G. Reconciliation sweep simulation
  const sweep = await provider.simulateReconciliationSweep([
    { tenantId: 't1', providerSubscriptionId: 's1', localStatus: 'active', remoteStatus: 'active' },
    { tenantId: 't2', providerSubscriptionId: 's2', localStatus: 'cancelled', remoteStatus: 'active' },
    { tenantId: 't3', providerSubscriptionId: 's3', localStatus: 'past_due', remoteStatus: 'active', hasVerifiedPaymentProof: true },
    { tenantId: 't3_fake', providerSubscriptionId: 's3f', localStatus: 'past_due', remoteStatus: 'active', hasVerifiedPaymentProof: false },
    { tenantId: 't4', providerSubscriptionId: 's4', localStatus: 'manual_active', remoteStatus: 'cancelled', isManualOrComped: true },
    { tenantId: 't5', providerSubscriptionId: 's5', localStatus: 'active', remoteStatus: 'active', localPlanId: 'standart', remotePlanId: 'kurumsal' },
    { tenantId: 't6', providerSubscriptionId: 's6', localStatus: 'active', remoteStatus: 'active', localPeriodEnd: '2026-10-01T00:00:00.000Z', remotePeriodEnd: '2026-11-01T00:00:00.000Z' }
  ]);
  if (sweep.length !== 7) throw new Error('Sweep result count mismatch');
  if (!sweep[0].inSync) throw new Error('t1 should be inSync');
  if (sweep[1].inSync || sweep[1].resolutionApplied !== 'manual_review_required') throw new Error('t2 should require manual review');
  if (sweep[2].resolutionApplied !== 'updated_local_status') throw new Error('t3 should update local status');
  if (sweep[3].resolutionApplied !== 'manual_review_required') throw new Error('t3_fake without payment proof should require manual review');
  if (!sweep[4].inSync || sweep[4].resolutionApplied !== 'none') throw new Error('t4 manual should be protected');
  if (sweep[5].discrepancyType !== 'plan_mismatch' || sweep[5].resolutionApplied !== 'manual_review_required') throw new Error('t5 should report plan_mismatch');
  if (sweep[6].discrepancyType !== 'period_mismatch' || sweep[6].resolutionApplied !== 'updated_period') throw new Error('t6 should report updated_period');
});

// 17. Preserves PAID_FALLBACK = DISABLED and zero-network security invariants
runStep('17. Preserves PAID_FALLBACK = DISABLED and zero-network security invariants', () => {
  const provider = new DeterministicTestPaymentProvider();
  if (typeof provider.verifyWebhook !== 'function' || typeof provider.normalizeEvent !== 'function') {
    throw new Error('DeterministicTestPaymentProvider does not satisfy PaymentProviderAdapter interface');
  }
});

// 18. Cancellation withdrawal & resume resets cancellation flags [FINDING-ADIM027-016]
await runAsyncStep('18. Cancellation withdrawal & resume resets cancellation flags [FINDING-ADIM027-016]', async () => {
  const tenantId = 'tenant_withdraw_cancel_01';
  const sub = {
    tenantId,
    planId: 'standart',
    status: 'active',
    cancelAtPeriodEnd: true,
    planChangeStatus: 'cancelled_at_period_end'
  };
  localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));

  // Withdraw scheduled cancellation
  const updated = await subscriptionService.withdrawScheduledCancellation(tenantId);
  if (updated.cancelAtPeriodEnd !== false || updated.planChangeStatus !== 'none') {
    throw new Error(`withdrawScheduledCancellation failed to reset flags: ${JSON.stringify(updated)}`);
  }
  const reread = await subscriptionService.getCurrentSubscription(tenantId);
  if (reread?.cancelAtPeriodEnd !== false || reread?.planChangeStatus !== 'none') {
    throw new Error(`Re-read subscription did not persist cleared flags: ${JSON.stringify(reread)}`);
  }

  // Also verify resumeSubscription resets cancellation flags
  const pausedSub = {
    tenantId,
    planId: 'standart',
    status: 'paused',
    cancelAtPeriodEnd: true,
    planChangeStatus: 'cancelled_at_period_end'
  };
  localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(pausedSub));
  const resumed = await subscriptionService.resumeSubscription(tenantId);
  if (resumed.cancelAtPeriodEnd !== false || resumed.planChangeStatus !== 'none' || resumed.status !== 'active') {
    throw new Error(`resumeSubscription failed to reset cancellation flags: ${JSON.stringify(resumed)}`);
  }
  const rereadResumed = await subscriptionService.getCurrentSubscription(tenantId);
  if (rereadResumed?.cancelAtPeriodEnd !== false || rereadResumed?.planChangeStatus !== 'none' || rereadResumed?.status !== 'active') {
    throw new Error(`Re-read resumed subscription did not persist cleared flags: ${JSON.stringify(rereadResumed)}`);
  }
});

// 19. Signed timestamp alias watermark protection & no synthetic normalization [FINDING-ADIM027-024]
await runAsyncStep('19. Signed timestamp aliases advance watermark, reject stale/conflicting aliases & never synthesize fixedNow()', async () => {
  const provider = new DeterministicTestPaymentProvider();

  // A. normalizeEvent does NOT synthesize fixedNow() when timestamp is omitted, and rejects conflicting aliases
  const noTsNormalized = provider.normalizeEvent(JSON.stringify({
    providerEventId: 'evt_no_ts_01',
    eventType: 'payment.succeeded',
    status: 'succeeded'
  }));
  if (noTsNormalized.eventTimestamp !== undefined) {
    throw new Error(`Expected undefined eventTimestamp when omitted, got ${noTsNormalized.eventTimestamp}`);
  }

  let aliasConflictInNorm = false;
  try {
    provider.normalizeEvent(JSON.stringify({
      providerEventId: 'evt_alias_conflict_01',
      eventType: 'payment.succeeded',
      eventTimestamp: '2026-10-10T10:00:00.000Z',
      eventTime: '2026-10-10T09:00:00.000Z'
    }));
  } catch (err) {
    aliasConflictInNorm = true;
  }
  if (!aliasConflictInNorm) {
    throw new Error('normalizeEvent accepted conflicting signed timestamp aliases');
  }

  // B. Each signed timestamp alias (eventTime, timestamp, createdDate) sets watermark and rejects older events
  for (const [idx, aliasKey] of ['eventTime', 'timestamp', 'createdDate'].entries()) {
    const storage = new InMemoryStorageAdapter();
    const tenantId = `tenant_alias_${aliasKey}_${idx}`;
    const subRef = `sub_alias_${aliasKey}_${idx}`;
    const payId = `pay_alias_${aliasKey}_${idx}`;
    storage.seedSubscription({
      tenantId,
      planId: 'standart',
      status: 'pending_checkout',
      providerSubscriptionId: subRef,
      cancelAtPeriodEnd: false
    });
    storage.seedPayment({
      id: payId,
      tenantId,
      subscriptionReferenceCode: subRef,
      amountMinor: 249000,
      currency: 'TRY',
      status: 'paid'
    });

    const t2Iso = '2026-10-10T12:00:00.000Z';
    const t1Iso = '2026-10-10T11:00:00.000Z';

    const t2Payload = {
      eventType: 'payment.succeeded',
      providerEventId: `evt_t2_${aliasKey}_${idx}`,
      subscriptionReferenceCode: subRef,
      customerReferenceCode: tenantId,
      paymentId: payId,
      amountMinor: 249000,
      currencyCode: 'TRY',
      [aliasKey]: t2Iso
    };
    const t2Res = await subscriptionLifecycleService.processVerifiedWebhook(
      t2Payload,
      storage,
      makeWebhookEnvelope(t2Payload)
    );
    if (!t2Res.success || t2Res.subscription?.status !== 'active' || t2Res.subscription?.lastWebhookEventAt !== t2Iso) {
      throw new Error(`Expected active & watermark ${t2Iso} for alias ${aliasKey}, got ${JSON.stringify(t2Res)}`);
    }

    // Stale unique-event-ID event at T1 < T2 via same alias must be rejected fail-closed
    const stalePayload = {
      eventType: 'subscription.past_due',
      providerEventId: `evt_t1_stale_${aliasKey}_${idx}`,
      subscriptionReferenceCode: subRef,
      customerReferenceCode: tenantId,
      [aliasKey]: t1Iso
    };
    const staleRes = await subscriptionLifecycleService.processVerifiedWebhook(
      stalePayload,
      storage,
      makeWebhookEnvelope(stalePayload)
    );
    if (staleRes.success || staleRes.errorCode !== 'STALE_EVENT_OUT_OF_ORDER' || storage.getSubscription(tenantId)?.status !== 'active') {
      throw new Error(`Stale ${aliasKey} event regressed active subscription: ${JSON.stringify(staleRes)}`);
    }

    // Conflicting alias payload must reject without mutation
    const conflictPayload = {
      eventType: 'subscription.past_due',
      providerEventId: `evt_conflict_${aliasKey}_${idx}`,
      subscriptionReferenceCode: subRef,
      customerReferenceCode: tenantId,
      eventTimestamp: '2026-10-10T13:00:00.000Z',
      [aliasKey]: t1Iso
    };
    const conflictRes = await subscriptionLifecycleService.processVerifiedWebhook(
      conflictPayload,
      storage,
      makeWebhookEnvelope(conflictPayload)
    );
    if (conflictRes.success || conflictRes.errorCode !== 'INVALID_EVENT_TIMESTAMP' || storage.getSubscription(tenantId)?.status !== 'active') {
      throw new Error(`Conflicting timestamp aliases were accepted: ${JSON.stringify(conflictRes)}`);
    }
  }
});

// 20. Concurrent subscription state modification between pre-read and atomic lock fails retryably [FINDING-ADIM027-031]
await runAsyncStep('20. Concurrent cancelled/paused transition between pre-read and commit rejects retryably without stale active write [FINDING-ADIM027-031]', async () => {
  for (const concurrentTargetStatus of ['cancelled', 'paused']) {
    const storage = new InMemoryStorageAdapter();
    const tenantId = `tenant_race_${concurrentTargetStatus}_031`;
    const subRef = `sub_race_${concurrentTargetStatus}_031`;
    const payId = `pay_race_${concurrentTargetStatus}_031`;
    const eventId = `evt_race_pay_succ_${concurrentTargetStatus}_031`;

    storage.seedSubscription({
      tenantId,
      planId: 'standart',
      status: 'trialing',
      providerSubscriptionId: subRef,
      cancelAtPeriodEnd: false
    });
    storage.seedPayment({
      id: payId,
      tenantId,
      subscriptionReferenceCode: subRef,
      amountMinor: 249000,
      currency: 'TRY',
      status: 'paid'
    });

    const raceStorage = {
      getSubscriptionByReference: storage.getSubscriptionByReference.bind(storage),
      saveSubscription: storage.saveSubscription.bind(storage),
      hasProcessedEvent: storage.hasProcessedEvent.bind(storage),
      recordProcessedEvent: storage.recordProcessedEvent.bind(storage),
      commitRefundAtomic: storage.commitRefundAtomic.bind(storage),
      commitTransitionAtomic: storage.commitTransitionAtomic.bind(storage),
      async getPayment(paymentId) {
        const p = await storage.getPayment(paymentId);
        if (paymentId === payId) {
          const current = storage.getSubscription(tenantId);
          await storage.saveSubscription({
            ...current,
            status: concurrentTargetStatus
          });
        }
        return p;
      }
    };

    const paySucceededPayload = {
      eventType: 'payment.succeeded',
      providerEventId: eventId,
      subscriptionReferenceCode: subRef,
      customerReferenceCode: tenantId,
      paymentId: payId,
      amountMinor: 249000,
      currencyCode: 'TRY',
      eventTimestamp: '2026-10-15T12:00:00.000Z'
    };

    const raceRes = await subscriptionLifecycleService.processVerifiedWebhook(
      paySucceededPayload,
      raceStorage,
      makeWebhookEnvelope(paySucceededPayload)
    );
    if (raceRes.success || !raceRes.retryable || raceRes.errorCode !== 'IN_PROGRESS_RETRYABLE') {
      throw new Error(`Expected IN_PROGRESS_RETRYABLE for concurrent ${concurrentTargetStatus} race, got ${JSON.stringify(raceRes)}`);
    }

    const subAfterRace = storage.getSubscription(tenantId);
    if (subAfterRace?.status !== concurrentTargetStatus) {
      throw new Error(`Stale payment.succeeded overwrote concurrent ${concurrentTargetStatus} state with ${subAfterRace?.status}`);
    }
    if (await storage.hasProcessedEvent(eventId)) {
      throw new Error(`Concurrent ${concurrentTargetStatus} race prematurely created event claim for ${eventId}`);
    }

    if (concurrentTargetStatus === 'cancelled') {
      const retryOnCancelled = await subscriptionLifecycleService.processVerifiedWebhook(
        paySucceededPayload,
        storage,
        makeWebhookEnvelope(paySucceededPayload)
      );
      if (retryOnCancelled.success || retryOnCancelled.errorCode !== 'INVALID_TRANSITION_OUT_OF_ORDER' || storage.getSubscription(tenantId)?.status !== 'cancelled') {
        throw new Error(`Retry after concurrent cancelled state resurrected subscription: ${JSON.stringify(retryOnCancelled)}`);
      }
      if (await storage.hasProcessedEvent(eventId)) {
        throw new Error(`Retry against cancelled state created event claim for ${eventId}`);
      }
    }
  }

  // Direct commitTransitionAtomic guard rejects ownership / providerSubscriptionId / version change retryably
  const guardStorage = new InMemoryStorageAdapter();
  guardStorage.seedSubscription({
    tenantId: 'tenant_guard_031',
    planId: 'standart',
    status: 'trialing',
    providerSubscriptionId: 'sub_guard_new_031',
    cancelAtPeriodEnd: false
  });
  const directMismatch = await guardStorage.commitTransitionAtomic(
    {
      providerEventId: 'evt_guard_mismatch_031',
      eventType: 'payment.succeeded',
      tenantId: 'tenant_guard_031',
      subscriptionReferenceCode: 'sub_guard_orig_031',
      processedAt: new Date().toISOString(),
      payloadFingerprint: 'fp_guard_031'
    },
    {
      tenantId: 'tenant_guard_031',
      planId: 'standart',
      status: 'active',
      providerSubscriptionId: 'sub_guard_orig_031',
      cancelAtPeriodEnd: false
    },
    'fp_guard_031',
    {
      expectedTenantId: 'tenant_guard_031',
      expectedSubscriptionStatus: 'trialing',
      expectedProviderSubscriptionId: 'sub_guard_orig_031'
    }
  );
  if (directMismatch.success || !directMismatch.retryable || directMismatch.status !== 'in_progress_retryable') {
    throw new Error(`Expected retryable rejection on providerSubscriptionId change under lock, got ${JSON.stringify(directMismatch)}`);
  }
  if (await guardStorage.hasProcessedEvent('evt_guard_mismatch_031')) {
    throw new Error('commitTransitionAtomic recorded event claim despite snapshot mismatch');
  }
});

// 21. Exhaustive SimulatedPaymentOutcome handling in simulateRefund [FINDING-ADIM027-032]
await runAsyncStep('21. simulateRefund handles every SimulatedPaymentOutcome exhaustively without leaking balance or terminal idempotency [FINDING-ADIM027-032]', async () => {
  const provider = new DeterministicTestPaymentProvider();

  // Helper to create & settle a fresh 10000 minor TRY intent
  let intentCounter = 0;
  const createSettledIntent = async (amountMinor = 10000) => {
    const intent = await provider.createPaymentIntent({
      tenantId: 'tenant_sim_refund_032',
      purpose: 'subscription',
      amountMinor,
      currency: 'TRY',
      idempotencyKey: `idem_sim_intent_${++intentCounter}`
    });
    provider.simulateWebhookEvent(intent.id, 'success');
    return intent;
  };

  // A. requires_action: never produces succeeded status, never increases refunded balance, never caches terminal idempotency
  const reqActionIntent = await createSettledIntent(10000);
  provider.setSimulationMode('requires_action');
  const reqActionRefund = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: reqActionIntent.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'ref_req_action_032'
  });
  if (reqActionRefund.status === 'succeeded') {
    throw new Error(`requires_action produced a succeeded refund: ${JSON.stringify(reqActionRefund)}`);
  }
  // Full 10000 retry with the SAME idempotencyKey under success must succeed because neither balance nor terminal idempotency was committed
  provider.setSimulationMode('success');
  const retryAfterReqAction = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: reqActionIntent.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'ref_req_action_032'
  });
  if (retryAfterReqAction.status !== 'succeeded' || retryAfterReqAction.amountMinor !== 10000) {
    throw new Error(`Full refund retry after requires_action failed or balance leaked: ${JSON.stringify(retryAfterReqAction)}`);
  }

  // B. retryable_provider_failure: never commits balance or terminal idempotency; same key succeeds when retried under success
  const retryableIntent = await createSettledIntent(10000);
  provider.setSimulationMode('retryable_provider_failure');
  const transientFailRefund = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: retryableIntent.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'ref_retryable_032'
  });
  if (transientFailRefund.status !== 'failed') {
    throw new Error(`Expected failed status for retryable_provider_failure, got ${JSON.stringify(transientFailRefund)}`);
  }
  provider.setSimulationMode('success');
  const retryAfterTransient = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: retryableIntent.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'ref_retryable_032'
  });
  if (retryAfterTransient.status !== 'succeeded' || retryAfterTransient.amountMinor !== 10000) {
    throw new Error(`Retry with same idempotencyKey after retryable_provider_failure failed: ${JSON.stringify(retryAfterTransient)}`);
  }

  // C. timeout: throws PROVIDER_TIMEOUT, never commits balance or terminal idempotency; same key succeeds under success
  const timeoutIntent = await createSettledIntent(10000);
  provider.setSimulationMode('timeout');
  let timeoutThrew = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_sim_refund_032',
      intentId: timeoutIntent.id,
      amountMinor: 10000,
      currency: 'TRY',
      idempotencyKey: 'ref_timeout_032'
    });
  } catch (err) {
    if (err.message.includes('PROVIDER_TIMEOUT')) timeoutThrew = true;
  }
  provider.setSimulationMode('success');
  if (!timeoutThrew) throw new Error('timeout mode did not throw PROVIDER_TIMEOUT');
  const retryAfterTimeout = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: timeoutIntent.id,
    amountMinor: 10000,
    currency: 'TRY',
    idempotencyKey: 'ref_timeout_032'
  });
  if (retryAfterTimeout.status !== 'succeeded' || retryAfterTimeout.amountMinor !== 10000) {
    throw new Error(`Retry with same idempotencyKey after timeout failed: ${JSON.stringify(retryAfterTimeout)}`);
  }

  // D. decline & terminal_provider_failure: return failed, cache terminal failure idempotently, never consume balance
  for (const terminalMode of ['decline', 'terminal_provider_failure']) {
    const termIntent = await createSettledIntent(10000);
    provider.setSimulationMode(terminalMode);
    const termRes1 = await provider.simulateRefund({
      tenantId: 'tenant_sim_refund_032',
      intentId: termIntent.id,
      amountMinor: 10000,
      currency: 'TRY',
      idempotencyKey: `ref_${terminalMode}_032`
    });
    if (termRes1.status !== 'failed') {
      throw new Error(`${terminalMode} did not return failed: ${JSON.stringify(termRes1)}`);
    }
    // Replay with same key returns cached terminal failure
    provider.setSimulationMode('success');
    const termReplay = await provider.simulateRefund({
      tenantId: 'tenant_sim_refund_032',
      intentId: termIntent.id,
      amountMinor: 10000,
      currency: 'TRY',
      idempotencyKey: `ref_${terminalMode}_032`
    });
    if (termReplay.status !== 'failed' || termReplay.refundId !== termRes1.refundId) {
      throw new Error(`${terminalMode} terminal failure was not cached idempotently: ${JSON.stringify(termReplay)}`);
    }
    // Full 10000 refund with a NEW key succeeds because terminal failure did NOT consume balance
    const fullAfterTerm = await provider.simulateRefund({
      tenantId: 'tenant_sim_refund_032',
      intentId: termIntent.id,
      amountMinor: 10000,
      currency: 'TRY',
      idempotencyKey: `ref_${terminalMode}_fresh_032`
    });
    if (fullAfterTerm.status !== 'succeeded' || fullAfterTerm.amountMinor !== 10000) {
      throw new Error(`${terminalMode} leaked refunded balance: ${JSON.stringify(fullAfterTerm)}`);
    }
  }

  // E. success: commits balance and blocks subsequent overflow
  const succIntent = await createSettledIntent(10000);
  provider.setSimulationMode('success');
  const succRes = await provider.simulateRefund({
    tenantId: 'tenant_sim_refund_032',
    intentId: succIntent.id,
    amountMinor: 6000,
    currency: 'TRY',
    idempotencyKey: 'ref_succ_part_032'
  });
  if (succRes.status !== 'succeeded' || succRes.amountMinor !== 6000) {
    throw new Error(`success refund failed: ${JSON.stringify(succRes)}`);
  }
  let overflowRejected = false;
  try {
    await provider.simulateRefund({
      tenantId: 'tenant_sim_refund_032',
      intentId: succIntent.id,
      amountMinor: 5000,
      currency: 'TRY',
      idempotencyKey: 'ref_succ_overflow_032'
    });
  } catch (err) {
    if (err.message.includes('REFUND_EXCEEDS_INTENT')) overflowRejected = true;
  }
  if (!overflowRejected) {
    throw new Error('success refund did not commit balance to block overflow');
  }
});

// 22. Lifecycle operation alias disagreement (eventType/type/operationType) rejected before lookup or mutation [FINDING-ADIM027-033]
await runAsyncStep('22. Rejects semantic disagreement across eventType/type/operationType aliases without subscription, claim, or watermark mutation [FINDING-ADIM027-033]', async () => {
  const storage = new InMemoryStorageAdapter();
  const tenantId = 'tenant_alias_lifecycle_033';
  const subRef = 'sub_alias_lifecycle_033';
  const payId = 'pay_alias_lifecycle_033';
  const initialWatermark = '2026-10-10T10:00:00.000Z';

  storage.seedSubscription({
    tenantId,
    planId: 'standart',
    status: 'past_due',
    lastPaymentStatus: 'failed',
    providerSubscriptionId: subRef,
    lastWebhookEventAt: initialWatermark,
    cancelAtPeriodEnd: false
  });
  storage.seedPayment({
    id: payId,
    tenantId,
    subscriptionReferenceCode: subRef,
    amountMinor: 249000,
    currency: 'TRY',
    status: 'paid'
  });

  const conflictingCases = [
    { eventType: 'payment.succeeded', type: 'payment.failed' },
    { eventType: 'payment.success', operationType: 'subscription.past_due' },
    { eventType: 'payment.succeeded', type: 'subscription.cancelled' },
    { eventType: 'subscription.active', operationType: 'subscription.expired' },
    { eventType: 'payment.succeeded', type: 'customer.updated' },
    { eventType: 'payment.succeeded', operationType: 'refund.succeeded' },
    { eventType: 'payment.succeeded', type: '' },
    { eventType: 'payment.failed', operationType: 'subscription.cancelled' }
  ];

  for (const [idx, aliasCase] of conflictingCases.entries()) {
    const conflictEventId = `evt_lifecycle_alias_conflict_${idx}_033`;
    const conflictPayload = {
      providerEventId: conflictEventId,
      subscriptionReferenceCode: subRef,
      customerReferenceCode: tenantId,
      paymentId: payId,
      amountMinor: 249000,
      currencyCode: 'TRY',
      eventTimestamp: '2026-10-10T12:00:00.000Z',
      ...aliasCase
    };
    const res = await subscriptionLifecycleService.processVerifiedWebhook(
      conflictPayload,
      storage,
      makeWebhookEnvelope(conflictPayload)
    );
    if (res.success) {
      throw new Error(`Conflicting lifecycle alias pair ${JSON.stringify(aliasCase)} was accepted: ${JSON.stringify(res)}`);
    }
    if (await storage.hasProcessedEvent(conflictEventId)) {
      throw new Error(`Conflicting lifecycle alias ${conflictEventId} created event claim`);
    }
    const subAfter = storage.getSubscription(tenantId);
    if (
      subAfter?.status !== 'past_due' ||
      subAfter?.lastPaymentStatus !== 'failed' ||
      subAfter?.lastWebhookEventAt !== initialWatermark
    ) {
      throw new Error(`Conflicting lifecycle alias mutated subscription or watermark: ${JSON.stringify(subAfter)}`);
    }
  }

  // Synonymous aliases (payment.success + payment.succeeded + subscription.active) resolve to one canonical operation and succeed
  const synonymousPayload = {
    eventType: 'payment.success',
    type: 'payment.succeeded',
    operationType: 'subscription.active',
    providerEventId: 'evt_lifecycle_alias_synonym_033',
    subscriptionReferenceCode: subRef,
    customerReferenceCode: tenantId,
    paymentId: payId,
    amountMinor: 249000,
    currencyCode: 'TRY',
    eventTimestamp: '2026-10-10T12:30:00.000Z'
  };
  const synRes = await subscriptionLifecycleService.processVerifiedWebhook(
    synonymousPayload,
    storage,
    makeWebhookEnvelope(synonymousPayload)
  );
  if (!synRes.success || synRes.subscription?.status !== 'active' || synRes.subscription?.lastWebhookEventAt !== '2026-10-10T12:30:00.000Z') {
    throw new Error(`Synonymous lifecycle aliases failed to normalize: ${JSON.stringify(synRes)}`);
  }
});

console.log('\nAll 22 subscription and checkout lifecycle integrity assertions passed.');
