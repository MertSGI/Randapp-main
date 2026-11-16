import type {
  PaymentProviderAdapter,
  PaymentPurpose,
  VerifiedNormalizedPaymentEvent,
  PaymentIntentStatus,
  PaymentIntent,
  CreatePaymentIntentParams,
  RefundRequest,
  RefundResult,
  PlanChangeRequest,
  PlanChangeResult,
  ReconciliationRecord,
  GracePeriodEvaluation
} from './paymentProviderContract.ts';
import {
  canonicalizeJson,
  getPlanRankFromCatalog,
  resolveSignedEventTimestamp,
  validatePaymentMoney
} from './paymentProviderContract.ts';
import { planService } from './planService';

const VALID_PURPOSES: readonly PaymentPurpose[] = [
  'subscription',
  'appointment_deposit',
  'invoice',
  'custom'
];

function safeTimingEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getCaseInsensitiveHeader(headers: Record<string, string> | undefined, targetName: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const lowerTarget = targetName.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerTarget && typeof v === 'string') {
      return v;
    }
  }
  return undefined;
}

export type SimulatedPaymentOutcome =
  | 'success'
  | 'requires_action'
  | 'decline'
  | 'retryable_provider_failure'
  | 'terminal_provider_failure'
  | 'timeout';

export interface DeterministicPaymentProviderOptions {
  fixedNow?: () => number;
  idGenerator?: (prefix: string) => string;
}

/**
 * Computes a deterministic payload-bound MAC over the exact raw payload string.
 * Ensures any tampering with canonical fields produces a completely mismatched signature.
 */
export function computeDeterministicPayloadMac(rawPayload: string, secret: string = 'deterministic_test_key_v1'): string {
  let h1 = 0xdeadbeef ^ secret.length;
  let h2 = 0x41c6ce57 ^ secret.length;
  const combined = `${secret}:${rawPayload}`;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `sig_${p1}${p2}`;
}

/**
 * Deterministic Test Payment Provider
 * Performs strictly NO_NETWORK_SEND.
 * Simulates provider operations, webhook signatures, idempotency, event replays,
 * out-of-order monotonic events, refunds, upgrades/downgrades, grace periods,
 * and reconciliation sweeps using an injected clock and deterministic sequence generator.
 */
export class DeterministicTestPaymentProvider implements PaymentProviderAdapter {
  public readonly providerId: string = 'deterministic_test_payment_provider';

  private simulationMode: SimulatedPaymentOutcome = 'success';
  private sequenceCounter: number = 0;
  private readonly fixedNow: () => number;
  private readonly idGenerator: (prefix: string) => string;

  // Processed event tracking for duplicate & mismatch detection
  private processedEvents: Map<string, string> = new Map(); // providerEventId -> payloadHash

  // Stored payment intents for idempotency & lookup
  private intentsById: Map<string, PaymentIntent> = new Map();
  private intentsByIdempotencyKey: Map<string, PaymentIntent> = new Map(); // tenantId:idempotencyKey -> PaymentIntent

  // Refund tracking for idempotency, fingerprinting & cumulative target caps
  private refundsByIdempotencyKey: Map<string, RefundResult> = new Map();
  private refundFingerprintsByKey: Map<string, string> = new Map();
  private refundedMinorByTarget: Map<string, number> = new Map();

  // Plan change tracking for idempotency & fingerprinting
  private planChangesByIdempotencyKey: Map<string, PlanChangeResult> = new Map();
  private planChangeFingerprintsByKey: Map<string, string> = new Map();

  constructor(options?: DeterministicPaymentProviderOptions) {
    this.fixedNow = options?.fixedNow ?? (() => 1788988800000 + (this.sequenceCounter * 1000));
    this.idGenerator = options?.idGenerator ?? ((prefix: string) => `${prefix}_${++this.sequenceCounter}`);
  }

  public setSimulationMode(mode: SimulatedPaymentOutcome): void {
    this.simulationMode = mode;
  }

  public getSimulationMode(): SimulatedPaymentOutcome {
    return this.simulationMode;
  }

  /**
   * Signs an arbitrary canonical raw webhook payload for deterministic offline testing.
   */
  public signWebhookPayload(rawPayload: string): { headers: Record<string, string>; rawPayload: string } {
    const signature = computeDeterministicPayloadMac(rawPayload);
    return {
      headers: {
        'x-test-provider-signature': signature,
        'content-type': 'application/json'
      },
      rawPayload
    };
  }

  /**
   * Deterministic local signature verification.
   * Compares expected signature header with deterministic MAC over exact rawPayload.
   */
  public async verifyWebhook(headers: Record<string, string>, rawPayload: string): Promise<boolean> {
    const signature = getCaseInsensitiveHeader(headers, 'x-test-provider-signature');
    if (!signature || typeof rawPayload !== 'string' || rawPayload.trim() === '') {
      return false;
    }
    const expected = computeDeterministicPayloadMac(rawPayload);
    return safeTimingEqual(signature, expected);
  }

  /**
   * Normalizes raw verified payload into canonical provider-neutral structure.
   * Computes rawPayloadHash internally from the exact rawPayload, ignoring any payload-supplied hash.
   * Strictly validates financial fields if present.
   */
  public normalizeEvent(rawPayload: string): VerifiedNormalizedPaymentEvent {
    const parsed = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid event payload: expected a JSON object');
    }
    if (typeof parsed.providerEventId !== 'string' || !parsed.providerEventId.trim()) {
      throw new Error('Invalid event payload: providerEventId is required');
    }
    const computedHash = computeDeterministicPayloadMac(rawPayload, 'event_replay_hash_salt');

    if (parsed.currency !== undefined && parsed.currencyCode !== undefined && parsed.currency !== parsed.currencyCode) {
      throw new Error('Conflicting currency and currencyCode in normalized event payload');
    }
    const resolvedCurrency = parsed.currency ?? parsed.currencyCode;

    if (parsed.amountMinor !== undefined) {
      if (resolvedCurrency !== undefined) {
        const moneyCheck = validatePaymentMoney(parsed.amountMinor, resolvedCurrency);
        if (!moneyCheck.valid) {
          throw new Error(`Invalid money in normalized event payload: ${moneyCheck.error}`);
        }
      } else {
        throw new Error('Both amountMinor and currency must be present together');
      }
    } else if (resolvedCurrency !== undefined) {
      const currencyCheck = validatePaymentMoney(1, resolvedCurrency);
      if (!currencyCheck.valid) {
        throw new Error(`Invalid currency in normalized event payload: ${currencyCheck.error}`);
      }
    }
    if (parsed.price !== undefined && (typeof parsed.price !== 'number' || parsed.price < 0 || isNaN(parsed.price))) {
      throw new Error('Invalid price in normalized event payload: price must be a non-negative number');
    }

    const tsResolution = resolveSignedEventTimestamp(parsed);
    if (!tsResolution.valid) {
      throw new Error(tsResolution.message || 'Invalid signed event timestamp in normalized event payload');
    }

    return {
      provider: this.providerId,
      providerEventId: parsed.providerEventId,
      eventType: parsed.eventType,
      eventTimestamp: tsResolution.timestamp,
      rawPayloadHash: computedHash,
      intentId: parsed.intentId,
      providerReference: parsed.providerReference,
      status: parsed.status as PaymentIntentStatus,
      tenantId: parsed.tenantId,
      amountMinor: parsed.amountMinor,
      currency: resolvedCurrency,
      purpose: parsed.purpose,
      errorCode: parsed.errorCode,
      errorMessage: parsed.errorMessage
    };
  }

  /**
   * Simulates generation of an incoming webhook event.
   */
  public simulateWebhookEvent(
    intentId: string,
    outcome: SimulatedPaymentOutcome = this.simulationMode,
    customEventId?: string,
    customTimestamp?: string
  ): { headers: Record<string, string>; rawPayload: string } {
    const providerEventId = customEventId ?? this.idGenerator('evt_pay');
    const providerReference = this.idGenerator('ref_pay');
    const eventTimestamp = customTimestamp ?? new Date(this.fixedNow()).toISOString();

    let status: PaymentIntentStatus;
    let eventType: string;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    switch (outcome) {
      case 'success':
        status = 'succeeded';
        eventType = 'payment.succeeded';
        break;
      case 'requires_action':
        status = 'requires_action';
        eventType = 'payment.requires_action';
        break;
      case 'decline':
      case 'terminal_provider_failure':
        status = 'failed';
        eventType = 'payment.failed';
        errorCode = 'CARD_DECLINED';
        errorMessage = 'The card was declined by the simulated issuer.';
        break;
      case 'retryable_provider_failure':
        status = 'failed';
        eventType = 'payment.failed';
        errorCode = 'TRANSIENT_NETWORK_TIMEOUT';
        errorMessage = 'Simulated transient connection failure.';
        break;
      case 'timeout':
        status = 'failed';
        eventType = 'payment.timeout';
        errorCode = 'PROVIDER_TIMEOUT';
        errorMessage = 'Simulated provider timeout; retryable without advancing settlement.';
        break;
      default:
        throw new Error(`INVALID_SIMULATION_OUTCOME: Unsupported simulated payment outcome '${String(outcome)}'`);
    }

    const intent = this.intentsById.get(intentId);
    if (intent) {
      if (outcome === 'success') {
        intent.status = 'succeeded';
        intent.updatedAt = new Date(this.fixedNow()).toISOString();
      } else if (outcome !== 'timeout' && intent.status !== 'succeeded') {
        intent.status = status;
        intent.updatedAt = new Date(this.fixedNow()).toISOString();
      }
    }

    const payloadObj = {
      providerEventId,
      eventType,
      eventTimestamp,
      intentId,
      providerReference,
      status,
      retryable: outcome === 'timeout' || outcome === 'retryable_provider_failure' ? true : undefined,
      tenantId: intent?.tenantId,
      amountMinor: intent?.amountMinor,
      currency: intent?.currency,
      purpose: intent?.purpose,
      errorCode,
      errorMessage
    };

    const rawPayload = JSON.stringify(payloadObj);
    const signature = computeDeterministicPayloadMac(rawPayload);
    return {
      headers: {
        'x-test-provider-signature': signature,
        'content-type': 'application/json'
      },
      rawPayload
    };
  }

  /**
   * Evaluates event replay status:
   * Returns:
   * - 'NEW': first arrival
   * - 'IDEMPOTENT_SUCCESS': identical providerEventId + matching payloadHash
   * - 'INTEGRITY_CONFLICT': identical providerEventId + different payloadHash
   */
  public evaluateEventReplay(providerEventId: string, payloadHash: string): 'NEW' | 'IDEMPOTENT_SUCCESS' | 'INTEGRITY_CONFLICT' {
    if (!providerEventId || typeof providerEventId !== 'string' || !providerEventId.trim()) {
      throw new Error('providerEventId is required and cannot be empty');
    }
    if (!payloadHash || typeof payloadHash !== 'string' || !payloadHash.trim()) {
      throw new Error('payloadHash is required and cannot be empty');
    }

    if (!this.processedEvents.has(providerEventId)) {
      this.processedEvents.set(providerEventId, payloadHash);
      return 'NEW';
    }

    const existingHash = this.processedEvents.get(providerEventId);
    if (existingHash === payloadHash) {
      return 'IDEMPOTENT_SUCCESS';
    }

    return 'INTEGRITY_CONFLICT';
  }

  /**
   * Creates a payment intent with strict minor units and idempotency checking.
   * Uses collision-free tenant/idempotency tuple and compares canonical fingerprint.
   */
  public async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntent> {
    if (!params.tenantId || typeof params.tenantId !== 'string' || !params.tenantId.trim()) {
      throw new Error('tenantId is required and cannot be empty');
    }
    if (!params.idempotencyKey || typeof params.idempotencyKey !== 'string' || !params.idempotencyKey.trim()) {
      throw new Error('idempotencyKey is required and cannot be empty');
    }
    if (!VALID_PURPOSES.includes(params.purpose)) {
      throw new Error(`Invalid payment purpose: ${String(params.purpose)}`);
    }

    const moneyCheck = validatePaymentMoney(params.amountMinor, params.currency);
    if (!moneyCheck.valid) {
      throw new Error(`Invalid payment money parameters: ${moneyCheck.error}`);
    }

    const scopedKey = JSON.stringify([params.tenantId, params.idempotencyKey]);
    const canonicalParams = {
      tenantId: params.tenantId,
      purpose: params.purpose,
      amountMinor: params.amountMinor,
      currency: params.currency,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata || {}
    };
    const requestFingerprint = canonicalizeJson(canonicalParams);

    const existing = this.intentsByIdempotencyKey.get(scopedKey);
    if (existing) {
      if (existing.requestFingerprint === requestFingerprint) {
        return existing;
      }
      throw new Error(`IDEMPOTENCY_CONFLICT: Idempotency key '${params.idempotencyKey}' already used with different parameters`);
    }

    const nowIso = new Date(this.fixedNow()).toISOString();
    const id = this.idGenerator('pi');
    const intent: PaymentIntent = {
      id,
      tenantId: params.tenantId,
      purpose: params.purpose,
      amountMinor: params.amountMinor,
      currency: params.currency,
      status: 'created',
      idempotencyKey: params.idempotencyKey,
      requestFingerprint,
      providerId: this.providerId,
      providerReference: this.idGenerator('ref_pi'),
      resourceId: params.resourceId,
      metadata: params.metadata || {},
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.intentsById.set(id, intent);
    this.intentsByIdempotencyKey.set(scopedKey, intent);
    return intent;
  }

  private resolveRefundTargetIntent(intentId?: string, paymentId?: string): PaymentIntent {
    const cleanIntentId = typeof intentId === 'string' ? intentId.trim() : '';
    const cleanPaymentId = typeof paymentId === 'string' ? paymentId.trim() : '';
    if (!cleanIntentId && !cleanPaymentId) {
      throw new Error('REFUND_TARGET_REQUIRED: Either intentId or paymentId is required for refund');
    }

    let intentFromId: PaymentIntent | undefined;
    if (cleanIntentId) {
      intentFromId = this.intentsById.get(cleanIntentId);
      if (!intentFromId) {
        throw new Error(`REFUND_TARGET_NOT_FOUND: Unknown intentId '${cleanIntentId}'`);
      }
    }

    let intentFromPayment: PaymentIntent | undefined;
    if (cleanPaymentId) {
      for (const candidate of this.intentsById.values()) {
        if (candidate.providerReference === cleanPaymentId || candidate.id === cleanPaymentId) {
          intentFromPayment = candidate;
          break;
        }
      }
      if (!intentFromPayment) {
        throw new Error(`REFUND_TARGET_NOT_FOUND: Unknown paymentId '${cleanPaymentId}'`);
      }
    }

    if (intentFromId && intentFromPayment && intentFromId.id !== intentFromPayment.id) {
      throw new Error('REFUND_TARGET_MISMATCH: intentId and paymentId refer to different payment targets');
    }

    return (intentFromId || intentFromPayment)!;
  }

  /**
   * Simulates deterministic refund with integer minor units, target ownership,
   * cumulative amount caps & collision-free idempotency.
   */
  public async simulateRefund(request: RefundRequest): Promise<RefundResult> {
    if (!request.tenantId || typeof request.tenantId !== 'string' || !request.tenantId.trim()) {
      throw new Error('tenantId is required and cannot be empty');
    }
    if (!request.idempotencyKey || typeof request.idempotencyKey !== 'string' || !request.idempotencyKey.trim()) {
      throw new Error('idempotencyKey is required and cannot be empty');
    }

    const moneyCheck = validatePaymentMoney(request.amountMinor, request.currency);
    if (!moneyCheck.valid) {
      throw new Error(`Invalid refund money parameters: ${moneyCheck.error}`);
    }

    const targetIntent = this.resolveRefundTargetIntent(request.intentId, request.paymentId);
    if (targetIntent.tenantId !== request.tenantId) {
      throw new Error('TENANT_MISMATCH: Refund tenantId does not match linked payment target owner');
    }
    if (targetIntent.currency !== request.currency) {
      throw new Error('CURRENCY_MISMATCH: Refund currency does not match linked payment target currency');
    }
    if (targetIntent.status !== 'succeeded') {
      throw new Error(
        `REFUND_TARGET_NOT_SETTLED: Payment target '${targetIntent.id}' is in status '${targetIntent.status}' and must reach 'succeeded' settlement before refund`
      );
    }

    const scopedKey = JSON.stringify([request.tenantId, request.idempotencyKey]);
    const fingerprint = canonicalizeJson([
      request.tenantId,
      request.amountMinor,
      request.currency,
      request.intentId ?? null,
      request.paymentId ?? null,
      request.reason ?? null,
      request.metadata || {}
    ]);

    const existing = this.refundsByIdempotencyKey.get(scopedKey);
    if (existing) {
      const existingFingerprint = this.refundFingerprintsByKey.get(scopedKey);
      if (existingFingerprint === fingerprint) {
        return existing;
      }
      throw new Error(`IDEMPOTENCY_CONFLICT: Refund idempotency key '${request.idempotencyKey}' already used with differing parameters (amount: ${existing.amountMinor} vs ${request.amountMinor}, currency: ${existing.currency} vs ${request.currency})`);
    }

    const alreadyRefunded = this.refundedMinorByTarget.get(targetIntent.id) ?? 0;
    if (alreadyRefunded + request.amountMinor > targetIntent.amountMinor) {
      throw new Error(`REFUND_EXCEEDS_INTENT: Cumulative refund amountMinor (${alreadyRefunded + request.amountMinor}) exceeds linked PaymentIntent amountMinor (${targetIntent.amountMinor})`);
    }

    let status: 'succeeded' | 'failed' | 'pending';
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    let commitBalance = false;
    let cacheIdempotency = false;

    switch (this.simulationMode) {
      case 'success':
        status = 'succeeded';
        commitBalance = true;
        cacheIdempotency = true;
        break;
      case 'decline':
        status = 'failed';
        errorCode = 'REFUND_DECLINED';
        errorMessage = 'Simulated refund decline from provider';
        cacheIdempotency = true;
        break;
      case 'terminal_provider_failure':
        status = 'failed';
        errorCode = 'REFUND_DECLINED';
        errorMessage = 'Simulated terminal provider failure during refund';
        cacheIdempotency = true;
        break;
      case 'retryable_provider_failure':
        status = 'failed';
        errorCode = 'TRANSIENT_NETWORK_TIMEOUT';
        errorMessage = 'Simulated transient provider failure during refund';
        break;
      case 'requires_action':
        status = 'pending';
        errorCode = 'REQUIRES_ACTION';
        errorMessage = 'Simulated refund requires additional action; balance and terminal idempotency not committed';
        break;
      case 'timeout':
        throw new Error('PROVIDER_TIMEOUT: Simulated provider timeout during refund; retryable without idempotency commit or balance change');
      default: {
        const exhaustiveCheck: never = this.simulationMode;
        throw new Error(`INVALID_SIMULATION_OUTCOME: Unsupported simulated refund outcome '${String(exhaustiveCheck)}'`);
      }
    }

    const nowIso = new Date(this.fixedNow()).toISOString();
    const refundId = this.idGenerator('ref_refund');

    const result: RefundResult = {
      refundId,
      intentId: request.intentId,
      paymentId: request.paymentId,
      amountMinor: request.amountMinor,
      currency: request.currency,
      status,
      providerReference: this.idGenerator('prov_ref'),
      errorCode,
      errorMessage,
      createdAt: nowIso
    };

    if (cacheIdempotency) {
      this.refundsByIdempotencyKey.set(scopedKey, result);
      this.refundFingerprintsByKey.set(scopedKey, fingerprint);
    }
    if (commitBalance) {
      this.refundedMinorByTarget.set(targetIntent.id, alreadyRefunded + request.amountMinor);
    }
    return result;
  }

  /**
   * Simulates plan change (immediate upgrade vs period_end downgrade).
   * Enforces catalog plan existence, tier/timing policy, non-negative minor proration and collision-free idempotency.
   */
  public async simulatePlanChange(request: PlanChangeRequest): Promise<PlanChangeResult> {
    if (!request.tenantId || typeof request.tenantId !== 'string' || !request.tenantId.trim()) {
      throw new Error('tenantId is required and cannot be empty');
    }
    if (!request.currentPlanId || typeof request.currentPlanId !== 'string' || !request.currentPlanId.trim()) {
      throw new Error('currentPlanId is required and cannot be empty');
    }
    if (!request.targetPlanId || typeof request.targetPlanId !== 'string' || !request.targetPlanId.trim()) {
      throw new Error('targetPlanId is required and cannot be empty');
    }
    if (request.timing !== 'immediate' && request.timing !== 'period_end') {
      throw new Error(`Invalid plan change timing: ${String(request.timing)}`);
    }
    if (request.idempotencyKey !== undefined && (typeof request.idempotencyKey !== 'string' || !request.idempotencyKey.trim())) {
      throw new Error('idempotencyKey cannot be empty when provided');
    }
    if (request.prorationAmountMinor !== undefined) {
      if (!Number.isInteger(request.prorationAmountMinor) || request.prorationAmountMinor < 0) {
        throw new Error('prorationAmountMinor must be a non-negative integer');
      }
      if (request.currency && !/^[A-Z]{3}$/.test(request.currency)) {
        throw new Error('currency must be an uppercase 3-letter ISO 4217 code');
      }
    }

    const scopedKey = request.idempotencyKey
      ? JSON.stringify([request.tenantId, request.idempotencyKey])
      : null;
    const fingerprint = request.idempotencyKey
      ? canonicalizeJson([
          request.tenantId,
          request.currentPlanId,
          request.targetPlanId,
          request.timing,
          request.prorationAmountMinor ?? 0,
          request.currency ?? ''
        ])
      : null;

    if (scopedKey && fingerprint) {
      const existing = this.planChangesByIdempotencyKey.get(scopedKey);
      if (existing) {
        const existingFingerprint = this.planChangeFingerprintsByKey.get(scopedKey);
        if (existingFingerprint === fingerprint) {
          return existing;
        }
        throw new Error(`IDEMPOTENCY_CONFLICT: Plan change idempotency key '${request.idempotencyKey}' already used with differing parameters`);
      }
    }

    const currentRank = getPlanRankFromCatalog(request.currentPlanId, (id) => planService.getPlan(id));
    if (currentRank === null) {
      throw new Error(`INVALID_CURRENT_PLAN: Current plan '${request.currentPlanId}' does not exist in catalog`);
    }
    const targetRank = getPlanRankFromCatalog(request.targetPlanId, (id) => planService.getPlan(id));
    if (targetRank === null) {
      throw new Error(`INVALID_TARGET_PLAN: Target plan '${request.targetPlanId}' does not exist in catalog`);
    }
    if (targetRank < currentRank && request.timing === 'immediate') {
      throw new Error(`DOWNGRADE_REQUIRES_PERIOD_END: Downgrade from '${request.currentPlanId}' to '${request.targetPlanId}' must be scheduled for period_end`);
    }
    if (targetRank > currentRank && request.timing === 'period_end') {
      throw new Error(`UPGRADE_REQUIRES_IMMEDIATE: Upgrade from '${request.currentPlanId}' to '${request.targetPlanId}' must be applied immediately`);
    }

    const nowIso = new Date(this.fixedNow()).toISOString();
    let result: PlanChangeResult;

    if (request.timing === 'immediate') {
      // Immediate upgrade
      result = {
        success: true,
        tenantId: request.tenantId,
        previousPlanId: request.currentPlanId,
        activePlanId: request.targetPlanId,
        planChangeStatus: 'none',
        effectiveDate: nowIso,
        prorationAppliedMinor: request.prorationAmountMinor || 0,
        message: `Plan upgraded immediately to ${request.targetPlanId}`
      };
    } else {
      // Period end downgrade
      result = {
        success: true,
        tenantId: request.tenantId,
        previousPlanId: request.currentPlanId,
        activePlanId: request.currentPlanId,
        scheduledPlanId: request.targetPlanId,
        planChangeStatus: 'downgrade_scheduled',
        effectiveDate: nowIso,
        prorationAppliedMinor: 0,
        message: `Plan downgrade to ${request.targetPlanId} scheduled for period end`
      };
    }

    if (scopedKey && fingerprint) {
      this.planChangesByIdempotencyKey.set(scopedKey, result);
      this.planChangeFingerprintsByKey.set(scopedKey, fingerprint);
    }

    return result;
  }

  /**
   * Evaluates grace period for past_due status fail-closed without throwing on invalid input.
   */
  public evaluateGracePeriod(pastDueDate: string | Date, graceDays: number = 7, referenceNow?: Date): GracePeriodEvaluation {
    const validFixedNow = this.fixedNow();
    const safeNowMs = Number.isFinite(validFixedNow) ? validFixedNow : Date.now();
    const hasCustomRef = referenceNow !== undefined;
    const refValid = !hasCustomRef || (referenceNow instanceof Date && !Number.isNaN(referenceNow.getTime()));
    const safeGraceDays = typeof graceDays === 'number' && Number.isFinite(graceDays) && graceDays >= 0 ? graceDays : 0;

    if (!refValid || typeof graceDays !== 'number' || !Number.isFinite(graceDays) || graceDays < 0) {
      return {
        inGracePeriod: false,
        daysRemaining: 0,
        expired: true,
        gracePeriodDays: safeGraceDays,
        graceEndDate: new Date(safeNowMs).toISOString(),
        status: 'expired'
      };
    }

    const nowTime = referenceNow ? referenceNow.getTime() : safeNowMs;
    const dateObj =
      typeof pastDueDate === 'string'
        ? pastDueDate.trim().length > 0
          ? new Date(pastDueDate)
          : new Date(NaN)
        : pastDueDate instanceof Date
          ? pastDueDate
          : new Date(NaN);

    if (Number.isNaN(dateObj.getTime())) {
      return {
        inGracePeriod: false,
        daysRemaining: 0,
        expired: true,
        gracePeriodDays: safeGraceDays,
        graceEndDate: new Date(nowTime).toISOString(),
        status: 'expired'
      };
    }

    const graceEndTime = dateObj.getTime() + safeGraceDays * 24 * 60 * 60 * 1000;
    const graceEndDateObj = new Date(graceEndTime);
    if (!Number.isFinite(graceEndTime) || Number.isNaN(graceEndDateObj.getTime())) {
      return {
        inGracePeriod: false,
        daysRemaining: 0,
        expired: true,
        gracePeriodDays: safeGraceDays,
        graceEndDate: new Date(nowTime).toISOString(),
        status: 'expired'
      };
    }

    const diffMs = graceEndTime - nowTime;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    const inGrace = diffMs > 0;

    return {
      inGracePeriod: inGrace,
      daysRemaining,
      expired: !inGrace,
      gracePeriodDays: safeGraceDays,
      graceEndDate: graceEndDateObj.toISOString(),
      status: inGrace ? 'in_grace' : 'expired'
    };
  }

  /**
   * Simulates a billing reconciliation sweep comparing local state vs provider state.
   * Guarantees:
   * - Does NOT resurrect terminal cancelled/expired states to active.
   * - Does NOT overwrite manual_active or comped records.
   * - Syncs drifted past_due records when remote shows active.
   */
  public async simulateReconciliationSweep(
    records: Array<{
      tenantId: string;
      providerSubscriptionId: string;
      localStatus: string;
      remoteStatus?: string;
      localPlanId?: string;
      remotePlanId?: string;
      localPeriodEnd?: string;
      remotePeriodEnd?: string;
      hasVerifiedPaymentProof?: boolean;
      isManualOrComped?: boolean;
    }>
  ): Promise<ReconciliationRecord[]> {
    const nowIso = new Date(this.fixedNow()).toISOString();
    const results: ReconciliationRecord[] = [];

    for (const record of records) {
      const {
        tenantId,
        providerSubscriptionId,
        localStatus,
        remoteStatus = localStatus,
        localPlanId,
        remotePlanId,
        localPeriodEnd,
        remotePeriodEnd,
        hasVerifiedPaymentProof,
        isManualOrComped
      } = record;

      // 1. manual_active or comped subscriptions are protected
      if (isManualOrComped || localStatus === 'manual_active' || localStatus === 'comped') {
        results.push({
          tenantId,
          providerSubscriptionId,
          localStatus,
          providerStatus: remoteStatus,
          inSync: true,
          discrepancyType: 'none',
          reconciledAt: nowIso,
          resolutionApplied: 'none',
          notes: 'Manual or comped record is protected from remote provider override.'
        });
        continue;
      }

      // 2. Terminal state protection: local cancelled cannot be resurrected to active
      if ((localStatus === 'cancelled' || localStatus === 'expired') && remoteStatus === 'active') {
        results.push({
          tenantId,
          providerSubscriptionId,
          localStatus,
          providerStatus: remoteStatus,
          inSync: false,
          discrepancyType: 'status_mismatch',
          reconciledAt: nowIso,
          resolutionApplied: 'manual_review_required',
          notes: `Refusing to resurrect terminal ${localStatus} subscription to active via automated reconciliation.`
        });
        continue;
      }

      // 3. Status mismatch: past_due -> active sync
      if (localStatus !== remoteStatus) {
        if (localStatus === 'past_due' && remoteStatus === 'active') {
          if (!hasVerifiedPaymentProof) {
            results.push({
              tenantId,
              providerSubscriptionId,
              localStatus,
              providerStatus: remoteStatus,
              inSync: false,
              discrepancyType: 'status_mismatch',
              reconciledAt: nowIso,
              resolutionApplied: 'manual_review_required',
              notes: 'past_due to active transition requires verified payment proof from provider.'
            });
            continue;
          }
          results.push({
            tenantId,
            providerSubscriptionId,
            localStatus,
            providerStatus: remoteStatus,
            inSync: false,
            discrepancyType: 'status_mismatch',
            reconciledAt: nowIso,
            resolutionApplied: 'updated_local_status',
            notes: 'Synchronized recovered active status from remote provider with verified payment proof.'
          });
          continue;
        }

        results.push({
          tenantId,
          providerSubscriptionId,
          localStatus,
          providerStatus: remoteStatus,
          inSync: false,
          discrepancyType: 'status_mismatch',
          reconciledAt: nowIso,
          resolutionApplied: 'manual_review_required',
          notes: `Discrepancy detected between local (${localStatus}) and remote (${remoteStatus}).`
        });
        continue;
      }

      // 4. Plan mismatch check
      if (remotePlanId && localPlanId && remotePlanId !== localPlanId) {
        results.push({
          tenantId,
          providerSubscriptionId,
          localStatus,
          providerStatus: remoteStatus,
          inSync: false,
          discrepancyType: 'plan_mismatch',
          reconciledAt: nowIso,
          resolutionApplied: 'manual_review_required',
          notes: `Plan mismatch: local (${localPlanId}) vs remote (${remotePlanId}).`
        });
        continue;
      }

      // 5. Period mismatch check
      if (remotePeriodEnd && localPeriodEnd && remotePeriodEnd !== localPeriodEnd) {
        results.push({
          tenantId,
          providerSubscriptionId,
          localStatus,
          providerStatus: remoteStatus,
          inSync: false,
          discrepancyType: 'period_mismatch',
          reconciledAt: nowIso,
          resolutionApplied: 'updated_period',
          notes: 'Updated currentPeriodEnd to match provider.'
        });
        continue;
      }

      // 6. In sync
      results.push({
        tenantId,
        providerSubscriptionId,
        localStatus,
        providerStatus: remoteStatus,
        inSync: true,
        discrepancyType: 'none',
        reconciledAt: nowIso,
        resolutionApplied: 'none'
      });
    }

    return results;
  }
}
