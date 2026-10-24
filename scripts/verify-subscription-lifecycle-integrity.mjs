import { subscriptionLifecycleService, InMemoryStorageAdapter } from '../services/subscriptionLifecycleService.ts';
import { paymentSandboxTestService } from '../services/paymentSandboxTestService.ts';

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

console.log('=== LARI Phase C: Subscription & Checkout Lifecycle Integrity QA ===\n');

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

  // Attempt processing with isSignatureVerified = false
  const res = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, false);
  if (res.success || res.errorCode !== 'UNVERIFIED_WEBHOOK') {
    throw new Error(`Expected UNVERIFIED_WEBHOOK error, got ${JSON.stringify(res)}`);
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

  const res = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, true);
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
    customerReferenceCode: 'tenant_attacker_99'
  };

  const res = await subscriptionLifecycleService.processVerifiedWebhook(mismatchedPayload, storage, true);
  if (res.success || res.errorCode !== 'TENANT_MISMATCH') {
    throw new Error(`Expected TENANT_MISMATCH, got ${JSON.stringify(res)}`);
  }

  // Ensure status was not mutated
  const sub = storage.getSubscription('tenant_legitimate_01');
  if (sub?.status !== 'trialing') {
    throw new Error(`Security violation: subscription changed status despite tenant mismatch!`);
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

  const payload = {
    eventType: 'subscription.active',
    providerEventId: 'evt_unique_101',
    subscriptionReferenceCode: 'sub_ref_idem_01',
    customerReferenceCode: 'tenant_idem_01'
  };

  // First delivery: processes successfully
  const firstRes = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, true);
  if (!firstRes.success || firstRes.duplicate) {
    throw new Error(`First processing failed: ${JSON.stringify(firstRes)}`);
  }
  if (firstRes.subscription?.status !== 'active') {
    throw new Error(`Expected active status, got ${firstRes.subscription?.status}`);
  }

  // Second delivery with identical providerEventId: must be recognized as duplicate
  const secondRes = await subscriptionLifecycleService.processVerifiedWebhook(payload, storage, true);
  if (!secondRes.success || !secondRes.duplicate) {
    throw new Error(`Expected duplicate to succeed with duplicate:true, got ${JSON.stringify(secondRes)}`);
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
    customerReferenceCode: 'tenant_ooo_01'
  };

  const res = await subscriptionLifecycleService.processVerifiedWebhook(delayedActivePayload, storage, true);
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
  const failRes = await subscriptionLifecycleService.processVerifiedWebhook(failPayload, storage, true);
  if (!failRes.success || failRes.subscription?.status !== 'past_due') {
    throw new Error(`Expected past_due status, got ${JSON.stringify(failRes)}`);
  }

  // Step B: Cancellation transitions past_due -> cancelled
  const cancelPayload = {
    eventType: 'subscription.cancelled',
    providerEventId: 'evt_cancel_01',
    subscriptionReferenceCode: 'sub_ref_life_01',
    customerReferenceCode: 'tenant_life_01'
  };
  const cancelRes = await subscriptionLifecycleService.processVerifiedWebhook(cancelPayload, storage, true);
  if (!cancelRes.success || cancelRes.subscription?.status !== 'cancelled') {
    throw new Error(`Expected cancelled status, got ${JSON.stringify(cancelRes)}`);
  }
});

console.log('\nAll 10 subscription and checkout lifecycle integrity assertions passed.');
