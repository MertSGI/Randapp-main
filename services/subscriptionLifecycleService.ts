import { SubscriptionStatus, TenantSubscription } from './subscriptionService';
import { planService } from './planService';
import {
  canonicalizeJson,
  getPlanRankFromCatalog,
  resolveSignedEventTimestamp,
  validatePaymentMoney,
  VerifiedNormalizedPaymentEvent,
  VerifiedWebhookEnvelope
} from './paymentProviderContract.ts';

function getPlanRank(planId: string): number | null {
  return getPlanRankFromCatalog(planId, (id) => planService.getPlan(id));
}

function normalizeRemoteReconcileStatus(rawStatus: unknown): SubscriptionStatus | null {
  if (typeof rawStatus !== 'string') return null;
  const normalized = rawStatus.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'ACTIVE') return 'active';
  if (normalized === 'PAST_DUE' || normalized === 'UNPAID') return 'past_due';
  if (normalized === 'CANCELED' || normalized === 'CANCELLED' || normalized === 'EXPIRED') return 'cancelled';
  if (normalized === 'TRIALING') return 'trialing';
  if (normalized === 'PAUSED') return 'paused';
  if (normalized === 'SUSPENDED') return 'suspended';
  if (normalized === 'PENDING' || normalized === 'PENDING_CHECKOUT') return 'pending_checkout';
  return null;
}

function resolvePreservedPaidThroughDate(
  existingDate?: string,
  incomingDate?: string
): string | undefined {
  const cleanExisting = typeof existingDate === 'string' && existingDate.trim() ? existingDate.trim() : undefined;
  const cleanIncoming = typeof incomingDate === 'string' && incomingDate.trim() ? incomingDate.trim() : undefined;
  const existingMs = cleanExisting ? Date.parse(cleanExisting) : Number.NaN;
  const incomingMs = cleanIncoming ? Date.parse(cleanIncoming) : Number.NaN;
  const hasValidExisting = !Number.isNaN(existingMs);
  const hasValidIncoming = !Number.isNaN(incomingMs);

  if (hasValidExisting && hasValidIncoming) {
    return existingMs >= incomingMs ? cleanExisting : cleanIncoming;
  }
  if (hasValidIncoming) return cleanIncoming;
  if (hasValidExisting) return cleanExisting;
  return undefined;
}

export interface WebhookEventRecord {
  providerEventId: string;
  eventType: string;
  tenantId: string;
  subscriptionReferenceCode: string;
  processedAt: string;
  eventTimestamp?: string;
  payloadFingerprint?: string;
}

export type AtomicRefundStatus =
  | 'committed'
  | 'already_processed'
  | 'integrity_conflict'
  | 'stale_event'
  | 'in_progress_retryable'
  | 'failed';

export interface AtomicRefundResult {
  success: boolean;
  status: AtomicRefundStatus;
  duplicate?: boolean;
  retryable?: boolean;
  error?: string;
}

export type AtomicTransitionStatus =
  | 'committed'
  | 'already_processed'
  | 'integrity_conflict'
  | 'stale_event'
  | 'in_progress_retryable'
  | 'failed';

export interface AtomicTransitionResult {
  success: boolean;
  status: AtomicTransitionStatus;
  duplicate?: boolean;
  retryable?: boolean;
  error?: string;
  subscription?: TenantSubscription;
}

export interface StoredPaymentRecord {
  id: string;
  tenantId: string;
  subscriptionReferenceCode: string;
  amountMinor: number;
  currency: string;
  status: 'paid' | 'partially_refunded' | 'refunded';
  refundedAmountMinor?: number;
  targetPlanId?: string;
  expectedAmountMinor?: number;
  expectedCurrency?: string;
}

export interface TransitionResult {
  success: boolean;
  errorCode?: string;
  message: string;
  subscription?: TenantSubscription;
  duplicate?: boolean;
  retryable?: boolean;
}

export interface WebhookPayloadInput {
  eventType: string;
  providerEventId: string;
  subscriptionReferenceCode: string;
  customerReferenceCode?: string;
  tenantId?: string;
  eventTimestamp?: string;
  status?: string;
  price?: number;
  currencyCode?: string;
  amountMinor?: number;
  paymentId?: string;
  orderReferenceCode?: string;
  intentId?: string;
  providerReference?: string;
  paymentStatus?: string;
  paidThroughDate?: string;
  currentPeriodEnd?: string;
  rawPayload?: string;
}

export interface RefundWebhookPayloadInput {
  providerEventId: string;
  subscriptionReferenceCode: string;
  tenantId?: string;
  amountMinor: number;
  currency: string;
  paymentId?: string;
  originalPaymentAmountMinor?: number;
  originalCurrency?: string;
  refundReason?: string;
  isFullRefund?: boolean;
  rawPayload?: string;
}

const MAX_FUTURE_EVENT_SKEW_MS = 5 * 60 * 1000;

function isFutureEventTimestampBeyondSkew(ts: string, nowMs: number = Date.now()): boolean {
  const parsedMs = Date.parse(ts);
  if (Number.isNaN(parsedMs)) return true;
  return parsedMs > nowMs + MAX_FUTURE_EVENT_SKEW_MS;
}

const VALID_REFUND_SUCCESS_EVENT_TYPES = new Set([
  'payment.refunded',
  'subscription.refunded',
  'refund.succeeded'
]);

const SYNTHETIC_CANCELLATION_WEBHOOK_ALIASES = new Set([
  'subscription.cancelled',
  'subscription.expired'
]);

const LIFECYCLE_CANONICAL_OPERATIONS: Record<string, { canonical: string; targetStatus: SubscriptionStatus }> = {
  'subscription.created': { canonical: 'subscription.created', targetStatus: 'pending_checkout' },
  'subscription.active': { canonical: 'payment.succeeded', targetStatus: 'active' },
  'subscription.renewed': { canonical: 'payment.succeeded', targetStatus: 'active' },
  'payment.success': { canonical: 'payment.succeeded', targetStatus: 'active' },
  'payment.succeeded': { canonical: 'payment.succeeded', targetStatus: 'active' },
  'subscription.order.success': { canonical: 'payment.succeeded', targetStatus: 'active' },
  'subscription.past_due': { canonical: 'subscription.past_due', targetStatus: 'past_due' },
  'subscription.failed': { canonical: 'subscription.past_due', targetStatus: 'past_due' },
  'payment.failed': { canonical: 'subscription.past_due', targetStatus: 'past_due' }
};

/**
 * Collects every present lifecycle operation alias (eventType, type, operationType),
 * normalizes synonymous values to one canonical operation, and rejects unknown values
 * or semantic disagreements before lookup or mutation.
 */
function resolveLifecycleOperation(parsedRaw: Record<string, any>): {
  valid: boolean;
  canonicalOperation?: string;
  targetStatus?: SubscriptionStatus;
  errorCode?: 'UNKNOWN_EVENT_TYPE' | 'CONFLICTING_EVENT_TYPE' | 'PROVIDER_STATE_RECONCILIATION_REQUIRED';
  message?: string;
} {
  const aliasFields = ['eventType', 'type', 'operationType'] as const;
  const resolved: Array<{ field: string; raw: string; canonical: string; targetStatus: SubscriptionStatus }> = [];

  for (const field of aliasFields) {
    if (Object.prototype.hasOwnProperty.call(parsedRaw, field) && parsedRaw[field] !== undefined) {
      const rawVal = parsedRaw[field];
      if (typeof rawVal !== 'string' || !rawVal.trim()) {
        return {
          valid: false,
          errorCode: 'UNKNOWN_EVENT_TYPE',
          message: `Verified rawPayload ${field} must be a non-empty supported lifecycle operation.`
        };
      }
      const normalized = rawVal.trim().toLowerCase();
      if (SYNTHETIC_CANCELLATION_WEBHOOK_ALIASES.has(normalized)) {
        return {
          valid: false,
          errorCode: 'PROVIDER_STATE_RECONCILIATION_REQUIRED',
          message: `Unsupported synthetic cancellation webhook event in ${field} (${rawVal}); use authorized provider state reconciliation.`
        };
      }
      const mapped = LIFECYCLE_CANONICAL_OPERATIONS[normalized];
      if (!mapped) {
        return {
          valid: false,
          errorCode: 'UNKNOWN_EVENT_TYPE',
          message: `Unsupported event type in ${field}: ${rawVal}`
        };
      }
      resolved.push({
        field,
        raw: normalized,
        canonical: mapped.canonical,
        targetStatus: mapped.targetStatus
      });
    }
  }

  if (resolved.length === 0) {
    return {
      valid: false,
      errorCode: 'UNKNOWN_EVENT_TYPE',
      message: 'Verified rawPayload eventType/type/operationType is missing.'
    };
  }

  const canonicalSet = new Set(resolved.map((item) => item.canonical));
  if (canonicalSet.size > 1) {
    return {
      valid: false,
      errorCode: 'CONFLICTING_EVENT_TYPE',
      message: `Conflicting lifecycle operation aliases in verified rawPayload: ${resolved
        .map((r) => `${r.field}=${r.raw}`)
        .join(', ')}`
    };
  }

  return {
    valid: true,
    canonicalOperation: resolved[0].canonical,
    targetStatus: resolved[0].targetStatus
  };
}

function computeSubscriptionSnapshotFingerprint(sub: TenantSubscription): string {
  return canonicalizeJson({
    tenantId: sub.tenantId,
    status: sub.status,
    providerSubscriptionId: sub.providerSubscriptionId ?? null,
    planId: sub.planId,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    planChangeStatus: sub.planChangeStatus ?? null,
    scheduledPlanId: sub.scheduledPlanId ?? null,
    lastPaymentStatus: sub.lastPaymentStatus ?? null,
    paidThroughDate: sub.paidThroughDate ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    lastWebhookEventAt: sub.lastWebhookEventAt ?? null,
    version: (sub as any).version ?? null
  });
}

/**
 * Normalizes and enforces unanimous semantic agreement across all present
 * refund event type aliases in a cryptographically verified raw payload.
 */
function resolveRefundEventType(parsedRaw: Record<string, any>): {
  valid: boolean;
  eventType?: string;
  message?: string;
} {
  const aliasFields = ['eventType', 'type', 'operationType'] as const;
  const normalizedValues: string[] = [];

  for (const field of aliasFields) {
    if (Object.prototype.hasOwnProperty.call(parsedRaw, field) && parsedRaw[field] !== undefined) {
      const rawVal = parsedRaw[field];
      if (typeof rawVal !== 'string' || !rawVal.trim()) {
        return {
          valid: false,
          message: `Verified rawPayload ${field} must be a non-empty terminal refund success event type.`
        };
      }
      const normalized = rawVal.trim().toLowerCase();
      if (!VALID_REFUND_SUCCESS_EVENT_TYPES.has(normalized)) {
        return {
          valid: false,
          message: `Verified rawPayload ${field} is not a terminal refund success event: ${rawVal}`
        };
      }
      normalizedValues.push(normalized);
    }
  }

  if (normalizedValues.length === 0) {
    return {
      valid: false,
      message: 'Verified rawPayload eventType/type/operationType is missing.'
    };
  }

  if (new Set(normalizedValues).size > 1) {
    return {
      valid: false,
      message: `Conflicting refund event type aliases in verified rawPayload: ${normalizedValues.join(' vs ')}`
    };
  }

  return { valid: true, eventType: normalizedValues[0] };
}

/**
 * Validates signed event timestamp syntax, future clock-skew tolerance, and
 * strict monotonic ordering against an existing subscription watermark.
 */
function validateEventTimestampWatermark(
  incomingTs: string | undefined,
  watermark: string | undefined
): {
  valid: boolean;
  errorCode?: 'INVALID_EVENT_TIMESTAMP' | 'STALE_EVENT_OUT_OF_ORDER';
  message?: string;
} {
  if (incomingTs !== undefined) {
    if (typeof incomingTs !== 'string' || !incomingTs.trim() || Number.isNaN(Date.parse(incomingTs))) {
      return {
        valid: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Invalid eventTimestamp (${String(incomingTs)})`
      };
    }
    if (isFutureEventTimestampBeyondSkew(incomingTs)) {
      return {
        valid: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Future eventTimestamp (${incomingTs}) exceeds allowed clock skew tolerance`
      };
    }
  }

  if (watermark) {
    if (!incomingTs || typeof incomingTs !== 'string') {
      return {
        valid: false,
        errorCode: 'STALE_EVENT_OUT_OF_ORDER',
        message: 'Signed eventTimestamp is mandatory when subscription already has an event watermark.'
      };
    }
    const incomingMs = Date.parse(incomingTs);
    const watermarkMs = Date.parse(watermark);
    if (Number.isNaN(incomingMs) || Number.isNaN(watermarkMs) || incomingMs <= watermarkMs) {
      return {
        valid: false,
        errorCode: 'STALE_EVENT_OUT_OF_ORDER',
        message: `Stale eventTimestamp (${incomingTs}) is not newer than subscription watermark (${watermark}).`
      };
    }
  }

  return { valid: true };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidEnvelopeObject(envelope: unknown): envelope is VerifiedWebhookEnvelope {
  if (!isPlainObject(envelope)) return false;
  return (
    typeof envelope.rawPayload === 'string' &&
    envelope.rawPayload.trim().length > 0 &&
    isPlainObject(envelope.headers) &&
    isPlainObject(envelope.provider) &&
    typeof envelope.provider.verifyWebhook === 'function'
  );
}

function mapAtomicRefundResult(
  commitRes: AtomicRefundResult,
  providerEventId: string,
  updatedSub: TenantSubscription
): TransitionResult {
  if (commitRes.status === 'integrity_conflict') {
    return {
      success: false,
      errorCode: 'INTEGRITY_CONFLICT',
      message: commitRes.error || `Conflict detected for refund event (${providerEventId}).`
    };
  }
  if (commitRes.status === 'stale_event') {
    return {
      success: false,
      errorCode: 'STALE_EVENT_OUT_OF_ORDER',
      message: commitRes.error || `Stale or missing timestamp for refund event (${providerEventId}) rejected by monotonic watermark.`
    };
  }
  if (commitRes.status === 'already_processed' || (commitRes.success && commitRes.duplicate)) {
    return {
      success: true,
      duplicate: true,
      message: `Duplicate refund event (${providerEventId}) ignored idempotently.`
    };
  }
  if (commitRes.status === 'in_progress_retryable' || commitRes.retryable) {
    return {
      success: false,
      retryable: true,
      errorCode: 'IN_PROGRESS_RETRYABLE',
      message: commitRes.error || `Refund event (${providerEventId}) is currently in flight; retryable.`
    };
  }
  if (!commitRes.success || commitRes.status !== 'committed') {
    return {
      success: false,
      errorCode: 'ATOMIC_COMMIT_FAILED',
      message: commitRes.error || 'Failed to commit atomic refund transaction.'
    };
  }
  return {
    success: true,
    message: `Refund processed successfully. Status: ${updatedSub.status}`,
    subscription: updatedSub
  };
}

function mapAtomicTransitionResult(
  commitRes: AtomicTransitionResult,
  providerEventId: string,
  targetStatus: string,
  fallbackSub: TenantSubscription
): TransitionResult {
  if (commitRes.status === 'integrity_conflict') {
    return {
      success: false,
      errorCode: 'INTEGRITY_CONFLICT',
      message: commitRes.error || `Conflict detected for webhook event (${providerEventId}).`
    };
  }
  if (commitRes.status === 'stale_event') {
    return {
      success: false,
      errorCode: 'STALE_EVENT_OUT_OF_ORDER',
      message: commitRes.error || `Stale or missing timestamp for webhook event (${providerEventId}) rejected by monotonic watermark.`
    };
  }
  if (commitRes.status === 'already_processed' || (commitRes.success && commitRes.duplicate)) {
    return {
      success: true,
      duplicate: true,
      message: `Duplicate webhook event (${providerEventId}) ignored idempotently.`,
      subscription: commitRes.subscription || fallbackSub
    };
  }
  if (commitRes.status === 'in_progress_retryable' || commitRes.retryable) {
    return {
      success: false,
      retryable: true,
      errorCode: 'IN_PROGRESS_RETRYABLE',
      message: commitRes.error || `Webhook event (${providerEventId}) is currently in flight; retryable.`
    };
  }
  if (!commitRes.success || commitRes.status !== 'committed') {
    return {
      success: false,
      errorCode: 'ATOMIC_COMMIT_FAILED',
      message: commitRes.error || 'Failed to commit atomic subscription transition.'
    };
  }
  return {
    success: true,
    message: `Subscription successfully transitioned to ${targetStatus}`,
    subscription: commitRes.subscription || fallbackSub
  };
}

export interface CommitRefundOptions {
  refundAmountMinor: number;
  expectedPaymentAmountMinor: number;
  expectedCurrency: string;
  expectedRefundedAmountMinor?: number;
  isFullRefund: boolean;
  expectedSubscriptionStatus?: SubscriptionStatus;
  expectedLastWebhookEventAt?: string;
  expectedLastPaymentStatus?: string;
}

export interface CommitTransitionOptions {
  eventTimestamp?: string;
  expectedLastWebhookEventAt?: string;
  expectedSubscriptionStatus?: SubscriptionStatus;
  expectedProviderSubscriptionId?: string;
  expectedTenantId?: string;
  expectedSubscriptionSnapshotFingerprint?: string;
  paymentVerification?: {
    paymentId: string;
    expectedTenantId: string;
    expectedSubscriptionRef: string;
    expectedAmountMinor: number;
    expectedCurrency: string;
    expectedTargetPlanId?: string;
    expectedCheckoutAmountMinor?: number;
    expectedCheckoutCurrency?: string;
  };
}

export interface StorageAdapter {
  getSubscriptionByReference(refCode: string): Promise<TenantSubscription | null>;
  saveSubscription(subscription: TenantSubscription): Promise<void>;
  hasProcessedEvent(providerEventId: string): Promise<boolean>;
  recordProcessedEvent(record: WebhookEventRecord): Promise<void>;
  getPayment(paymentId: string): Promise<StoredPaymentRecord | null>;
  savePayment?(payment: StoredPaymentRecord): Promise<void>;
  commitRefundAtomic(
    record: WebhookEventRecord,
    updatedSub: TenantSubscription,
    paymentId: string,
    expectedFingerprint?: string,
    refundOptions?: CommitRefundOptions
  ): Promise<AtomicRefundResult>;
  commitTransitionAtomic(
    record: WebhookEventRecord,
    updatedSub: TenantSubscription,
    expectedFingerprint?: string,
    transitionOptions?: CommitTransitionOptions
  ): Promise<AtomicTransitionResult>;
}

// In-Memory Storage Adapter for deterministic offline tests and fallback
export class InMemoryStorageAdapter implements StorageAdapter {
  private subscriptions: Map<string, TenantSubscription> = new Map();
  private processedEvents: Map<string, WebhookEventRecord> = new Map();
  private eventFingerprints: Map<string, string> = new Map();
  private payments: Map<string, StoredPaymentRecord> = new Map();
  private inFlightClaims: Set<string> = new Set();
  public failNextAtomicCommit: boolean = false;

  async getSubscriptionByReference(refCode: string): Promise<TenantSubscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.providerSubscriptionId === refCode) {
        return { ...sub };
      }
    }
    return null;
  }

  async saveSubscription(subscription: TenantSubscription): Promise<void> {
    this.subscriptions.set(subscription.tenantId, { ...subscription });
  }

  async hasProcessedEvent(providerEventId: string): Promise<boolean> {
    return this.processedEvents.has(providerEventId);
  }

  async recordProcessedEvent(record: WebhookEventRecord): Promise<void> {
    this.processedEvents.set(record.providerEventId, { ...record });
  }

  seedPayment(payment: StoredPaymentRecord): void {
    this.payments.set(payment.id, { ...payment });
  }

  async getPayment(paymentId: string): Promise<StoredPaymentRecord | null> {
    const p = this.payments.get(paymentId);
    return p ? { ...p } : null;
  }

  async savePayment(payment: StoredPaymentRecord): Promise<void> {
    const existing = this.payments.get(payment.id);
    if (existing) {
      if (
        (existing.targetPlanId !== undefined && payment.targetPlanId !== existing.targetPlanId) ||
        (existing.expectedAmountMinor !== undefined && payment.expectedAmountMinor !== existing.expectedAmountMinor) ||
        (existing.expectedCurrency !== undefined && payment.expectedCurrency !== existing.expectedCurrency)
      ) {
        throw new Error(`Immutable checkout payment binding for '${payment.id}' cannot be modified.`);
      }
    }
    this.payments.set(payment.id, { ...payment });
  }

  claimInFlightForTest(providerEventId: string): void {
    this.inFlightClaims.add(providerEventId);
  }

  releaseInFlightForTest(providerEventId: string): void {
    this.inFlightClaims.delete(providerEventId);
  }

  async commitTransitionAtomic(
    record: WebhookEventRecord,
    updatedSub: TenantSubscription,
    expectedFingerprint?: string,
    transitionOptions?: CommitTransitionOptions
  ): Promise<AtomicTransitionResult> {
    const effectiveFingerprint = expectedFingerprint || record.payloadFingerprint;
    if (this.processedEvents.has(record.providerEventId)) {
      const storedFingerprint = this.eventFingerprints.get(record.providerEventId);
      if (!storedFingerprint || !effectiveFingerprint || storedFingerprint !== effectiveFingerprint) {
        return {
          success: false,
          status: 'integrity_conflict',
          duplicate: true,
          error: 'Replay with mismatched or missing payload fingerprint detected'
        };
      }
      return {
        success: true,
        status: 'already_processed',
        duplicate: true,
        subscription: this.subscriptions.get(updatedSub.tenantId)
      };
    }

    if (this.inFlightClaims.has(record.providerEventId)) {
      return {
        success: false,
        status: 'in_progress_retryable',
        retryable: true,
        error: 'Event processing already in flight'
      };
    }

    this.inFlightClaims.add(record.providerEventId);
    try {
      if (this.failNextAtomicCommit) {
        this.failNextAtomicCommit = false;
        throw new Error('Simulated atomic commit failure');
      }

      const lockedSub = this.subscriptions.get(updatedSub.tenantId);
      const lockedWatermark = lockedSub?.lastWebhookEventAt;
      const hasExpectedSnapshotGuard = Boolean(
        transitionOptions &&
          (transitionOptions.expectedTenantId !== undefined ||
            transitionOptions.expectedSubscriptionStatus !== undefined ||
            transitionOptions.expectedProviderSubscriptionId !== undefined ||
            transitionOptions.expectedSubscriptionSnapshotFingerprint !== undefined ||
            'expectedLastWebhookEventAt' in transitionOptions)
      );
      if (hasExpectedSnapshotGuard && transitionOptions) {
        const snapshotMismatch =
          !lockedSub ||
          (transitionOptions.expectedTenantId !== undefined &&
            lockedSub.tenantId !== transitionOptions.expectedTenantId) ||
          (transitionOptions.expectedSubscriptionStatus !== undefined &&
            lockedSub.status !== transitionOptions.expectedSubscriptionStatus) ||
          (transitionOptions.expectedProviderSubscriptionId !== undefined &&
            lockedSub.providerSubscriptionId !== transitionOptions.expectedProviderSubscriptionId) ||
          ('expectedLastWebhookEventAt' in transitionOptions &&
            lockedWatermark !== transitionOptions.expectedLastWebhookEventAt) ||
          (transitionOptions.expectedSubscriptionSnapshotFingerprint !== undefined &&
            computeSubscriptionSnapshotFingerprint(lockedSub) !==
              transitionOptions.expectedSubscriptionSnapshotFingerprint);

        if (snapshotMismatch) {
          return {
            success: false,
            status: 'in_progress_retryable',
            retryable: true,
            error: 'Concurrent subscription state modification detected under lock'
          };
        }
      }

      const incomingTs = transitionOptions?.eventTimestamp ?? record.eventTimestamp;
      const watermarkCheck = validateEventTimestampWatermark(incomingTs, lockedWatermark);
      if (!watermarkCheck.valid) {
        return {
          success: false,
          status: 'stale_event',
          error: watermarkCheck.message
        };
      }

      if (transitionOptions?.paymentVerification) {
        const pv = transitionOptions.paymentVerification;
        const lockedPayment = this.payments.get(pv.paymentId);
        const targetPlanMismatch =
          pv.expectedTargetPlanId !== undefined &&
          (typeof lockedPayment?.targetPlanId !== 'string' ||
            lockedPayment.targetPlanId.trim() !== pv.expectedTargetPlanId);
        const checkoutAmountMismatch =
          pv.expectedCheckoutAmountMinor !== undefined &&
          lockedPayment?.expectedAmountMinor !== pv.expectedCheckoutAmountMinor;
        const checkoutCurrencyMismatch =
          pv.expectedCheckoutCurrency !== undefined &&
          (typeof lockedPayment?.expectedCurrency !== 'string' ||
            lockedPayment.expectedCurrency.trim().toUpperCase() !== pv.expectedCheckoutCurrency);
        if (
          !lockedPayment ||
          lockedPayment.tenantId !== pv.expectedTenantId ||
          lockedPayment.subscriptionReferenceCode !== pv.expectedSubscriptionRef ||
          lockedPayment.status !== 'paid' ||
          (lockedPayment.refundedAmountMinor || 0) > 0 ||
          lockedPayment.currency !== pv.expectedCurrency ||
          lockedPayment.amountMinor !== pv.expectedAmountMinor ||
          targetPlanMismatch ||
          checkoutAmountMismatch ||
          checkoutCurrencyMismatch
        ) {
          return {
            success: false,
            status: 'failed',
            error: `Verified paid payment record (${pv.paymentId}) missing, mismatched, or altered under atomic lock`
          };
        }
      }

      this.subscriptions.set(updatedSub.tenantId, { ...updatedSub });
      this.processedEvents.set(record.providerEventId, { ...record });
      if (effectiveFingerprint) {
        this.eventFingerprints.set(record.providerEventId, effectiveFingerprint);
      }
      return {
        success: true,
        status: 'committed',
        duplicate: false,
        subscription: { ...updatedSub }
      };
    } catch (err: any) {
      return { success: false, status: 'failed', error: err.message };
    } finally {
      this.inFlightClaims.delete(record.providerEventId);
    }
  }

  async commitRefundAtomic(
    record: WebhookEventRecord,
    updatedSub: TenantSubscription,
    paymentId: string,
    expectedFingerprint?: string,
    refundOptions?: CommitRefundOptions
  ): Promise<AtomicRefundResult> {
    const effectiveFingerprint = expectedFingerprint || record.payloadFingerprint;
    if (this.processedEvents.has(record.providerEventId)) {
      const storedFingerprint = this.eventFingerprints.get(record.providerEventId);
      if (!storedFingerprint || !effectiveFingerprint || storedFingerprint !== effectiveFingerprint) {
        return {
          success: false,
          status: 'integrity_conflict',
          duplicate: true,
          error: 'Replay with mismatched or missing payload fingerprint detected'
        };
      }
      return { success: true, status: 'already_processed', duplicate: true };
    }

    if (this.inFlightClaims.has(record.providerEventId)) {
      return {
        success: false,
        status: 'in_progress_retryable',
        retryable: true,
        error: 'Event processing already in flight'
      };
    }

    this.inFlightClaims.add(record.providerEventId);
    try {
      if (this.failNextAtomicCommit) {
        this.failNextAtomicCommit = false;
        throw new Error('Simulated atomic commit failure');
      }
      if (!paymentId || !this.payments.has(paymentId)) {
        return { success: false, status: 'failed', error: 'Locked payment record not found during atomic commit' };
      }
      const lockedSub = this.subscriptions.get(updatedSub.tenantId);
      if (!lockedSub) {
        return { success: false, status: 'failed', error: 'Locked subscription record not found during atomic refund commit' };
      }
      if (
        refundOptions &&
        ((refundOptions.expectedSubscriptionStatus !== undefined &&
          lockedSub.status !== refundOptions.expectedSubscriptionStatus) ||
          ('expectedLastWebhookEventAt' in refundOptions &&
            lockedSub.lastWebhookEventAt !== refundOptions.expectedLastWebhookEventAt) ||
          ('expectedLastPaymentStatus' in refundOptions &&
            lockedSub.lastPaymentStatus !== refundOptions.expectedLastPaymentStatus))
      ) {
        return {
          success: false,
          status: 'in_progress_retryable',
          retryable: true,
          error: 'Concurrent subscription state modification detected under lock during refund commit'
        };
      }
      const refundWatermarkCheck = validateEventTimestampWatermark(record.eventTimestamp, lockedSub.lastWebhookEventAt);
      if (!refundWatermarkCheck.valid) {
        return {
          success: false,
          status: 'stale_event',
          error: refundWatermarkCheck.message
        };
      }
      const lockedPayment = this.payments.get(paymentId)!;
      if (
        (lockedPayment.status !== 'paid' && lockedPayment.status !== 'partially_refunded') ||
        lockedPayment.tenantId !== updatedSub.tenantId ||
        lockedPayment.subscriptionReferenceCode !== record.subscriptionReferenceCode
      ) {
        return { success: false, status: 'failed', error: 'Atomic payment ownership or paid-state invariant failed' };
      }
      const currentRefunded = lockedPayment.refundedAmountMinor || 0;
      if (refundOptions) {
        if (lockedPayment.amountMinor !== refundOptions.expectedPaymentAmountMinor) {
          return { success: false, status: 'failed', error: 'Payment amount mismatch under lock' };
        }
        if (lockedPayment.currency !== refundOptions.expectedCurrency) {
          return { success: false, status: 'failed', error: 'Payment currency mismatch under lock' };
        }
        if (
          refundOptions.expectedRefundedAmountMinor !== undefined &&
          currentRefunded !== refundOptions.expectedRefundedAmountMinor
        ) {
          return { success: false, status: 'failed', error: 'Payment refunded balance changed concurrently under lock' };
        }
      }

      const remaining = lockedPayment.amountMinor - currentRefunded;
      if (remaining <= 0) {
        return { success: false, status: 'failed', error: 'Atomic payment balance invariant failed' };
      }

      const refundDelta = refundOptions ? refundOptions.refundAmountMinor : lockedPayment.amountMinor;
      const newRefunded = currentRefunded + refundDelta;
      if (newRefunded > lockedPayment.amountMinor) {
        return { success: false, status: 'failed', error: 'Cumulative refund exceeds payment amount' };
      }
      const isFullyRefunded = Boolean(refundOptions?.isFullRefund || newRefunded >= lockedPayment.amountMinor);
      const newStatus = isFullyRefunded ? 'refunded' : 'partially_refunded';

      this.subscriptions.set(updatedSub.tenantId, { ...updatedSub });
      this.processedEvents.set(record.providerEventId, { ...record });
      if (effectiveFingerprint) {
        this.eventFingerprints.set(record.providerEventId, effectiveFingerprint);
      }
      this.payments.set(paymentId, {
        ...lockedPayment,
        status: newStatus,
        refundedAmountMinor: newRefunded
      });
      return { success: true, status: 'committed', duplicate: false };
    } catch (err: any) {
      return { success: false, status: 'failed', error: err.message };
    } finally {
      this.inFlightClaims.delete(record.providerEventId);
    }
  }

  // Test helper to seed data
  seedSubscription(sub: TenantSubscription): void {
    this.subscriptions.set(sub.tenantId, { ...sub });
  }

  getSubscription(tenantId: string): TenantSubscription | undefined {
    return this.subscriptions.get(tenantId);
  }
}

export const subscriptionLifecycleService = {
  // Pure state transition rules
  isValidTransition(
    currentStatus: SubscriptionStatus,
    targetStatus: SubscriptionStatus
  ): boolean {
    if (currentStatus === targetStatus) return true;

    // Terminal statuses cannot transition to active via delayed webhook
    if (currentStatus === 'cancelled' && targetStatus === 'active') {
      return false;
    }
    if (currentStatus === 'expired' && targetStatus === 'active') {
      return false;
    }

    const allowedTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
      pending_checkout: ['trialing', 'active', 'cancelled', 'none'],
      trialing: ['active', 'past_due', 'cancelled', 'expired', 'paused'],
      active: ['past_due', 'paused', 'cancelled', 'active'],
      past_due: ['active', 'suspended', 'cancelled'],
      paused: ['active', 'cancelled'],
      suspended: ['active', 'cancelled'],
      comped: ['active', 'cancelled'],
      manual_active: ['pending_checkout', 'active', 'cancelled', 'expired'],
      cancelled: [], // Terminal
      expired: [], // Terminal
      none: ['pending_checkout', 'trialing', 'active']
    };

    const allowed = allowedTransitions[currentStatus] || [];
    return allowed.includes(targetStatus);
  },

  // Map incoming verified webhook event to target subscription status
  mapEventToTargetStatus(eventType: string, providerStatus?: string): SubscriptionStatus | null {
    const trimmedEvent = typeof eventType === 'string' ? eventType.trim() : '';
    if (trimmedEvent.length > 0) {
      if (trimmedEvent === 'subscription.created') {
        return 'pending_checkout';
      }
      if (
        trimmedEvent === 'subscription.active' ||
        trimmedEvent === 'subscription.renewed' ||
        trimmedEvent === 'payment.success' ||
        trimmedEvent === 'payment.succeeded' ||
        trimmedEvent === 'subscription.order.success'
      ) {
        return 'active';
      }
      if (
        trimmedEvent === 'subscription.past_due' ||
        trimmedEvent === 'subscription.failed' ||
        trimmedEvent === 'payment.failed'
      ) {
        return 'past_due';
      }
      // Reject unknown or synthetic cancellation event types strictly before inspecting providerStatus
      return null;
    }

    if (providerStatus === 'ACTIVE') {
      return 'active';
    }
    if (providerStatus === 'PAST_DUE' || providerStatus === 'UNPAID') {
      return 'past_due';
    }
    if (providerStatus === 'CANCELED' || providerStatus === 'CANCELLED' || providerStatus === 'EXPIRED') {
      return 'cancelled';
    }
    return null;
  },

  // Process incoming verified webhook with full integrity assertions
  async processVerifiedWebhook(
    payload: WebhookPayloadInput,
    storage: StorageAdapter,
    verification: VerifiedWebhookEnvelope
  ): Promise<TransitionResult> {
    // 1. Signature requirement invariant: requires cryptographic envelope
    if (!isValidEnvelopeObject(verification)) {
      return {
        success: false,
        errorCode: 'UNVERIFIED_WEBHOOK',
        message: 'Verified payload-bound webhook envelope is mandatory. Detached boolean or missing envelope is prohibited.'
      };
    }

    const sigOk = await verification.provider.verifyWebhook(verification.headers, verification.rawPayload);
    if (!sigOk) {
      return {
        success: false,
        errorCode: 'UNVERIFIED_WEBHOOK',
        message: 'Cryptographic signature verification failed against rawPayload envelope.'
      };
    }

    if (payload.rawPayload !== undefined && payload.rawPayload !== verification.rawPayload) {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_MISMATCH',
        message: 'Payload rawPayload does not match verified envelope rawPayload.'
      };
    }
    const rawToBind = verification.rawPayload;

    if (typeof storage.commitTransitionAtomic !== 'function') {
      return {
        success: false,
        errorCode: 'ATOMIC_STORAGE_REQUIRED',
        message: 'Storage adapter must implement commitTransitionAtomic. Sequential fallback is prohibited.'
      };
    }

    if (!payload.providerEventId || typeof payload.providerEventId !== 'string' || !payload.providerEventId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_IDENTIFIER',
        message: 'providerEventId is required and cannot be empty.'
      };
    }

    // 2. Financial parameters validation
    if (payload.currencyCode !== undefined && payload.amountMinor === undefined) {
      const currencyCheck = validatePaymentMoney(1, payload.currencyCode);
      if (!currencyCheck.valid) {
        return {
          success: false,
          errorCode: 'INVALID_MONEY',
          message: `Invalid webhook currencyCode: ${currencyCheck.error}`
        };
      }
    }
    if (payload.amountMinor !== undefined) {
      if (payload.currencyCode === undefined) {
        return {
          success: false,
          errorCode: 'INVALID_MONEY',
          message: 'Both amountMinor and currencyCode must be present together.'
        };
      }
      const moneyCheck = validatePaymentMoney(payload.amountMinor, payload.currencyCode);
      if (!moneyCheck.valid) {
        return {
          success: false,
          errorCode: 'INVALID_MONEY',
          message: `Invalid webhook money parameters: ${moneyCheck.error}`
        };
      }
    }
    if (payload.price !== undefined && (typeof payload.price !== 'number' || payload.price < 0 || isNaN(payload.price))) {
      return {
        success: false,
        errorCode: 'INVALID_MONEY',
        message: 'Invalid webhook price parameter: price must be non-negative.'
      };
    }

    // 3. Raw payload envelope verification & provider normalization
    if (typeof rawToBind !== 'string' || !rawToBind.trim()) {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_INVALID',
        message: 'Verified rawPayload cannot be empty.'
      };
    }
    let parsedRaw: Record<string, any>;
    try {
      const parsed = JSON.parse(rawToBind);
      if (!isPlainObject(parsed)) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_INVALID',
          message: 'Verified rawPayload must be a JSON object.'
        };
      }
      parsedRaw = parsed;
      if (parsedRaw.currencyCode !== undefined && parsedRaw.currency !== undefined && parsedRaw.currencyCode !== parsedRaw.currency) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_MISMATCH',
          message: 'Verified rawPayload contains conflicting currency and currencyCode values.'
        };
      }
      const rawCurrency = parsedRaw.currencyCode ?? parsedRaw.currency;
      if (
        parsedRaw.providerEventId !== payload.providerEventId ||
        parsedRaw.subscriptionReferenceCode !== payload.subscriptionReferenceCode ||
        parsedRaw.eventType !== payload.eventType ||
        ((payload as any).type !== undefined && (parsedRaw.type ?? undefined) !== (payload as any).type) ||
        ((payload as any).operationType !== undefined && (parsedRaw.operationType ?? undefined) !== (payload as any).operationType) ||
        (parsedRaw.status ?? undefined) !== payload.status ||
        (parsedRaw.tenantId ?? undefined) !== payload.tenantId ||
        (parsedRaw.customerReferenceCode ?? undefined) !== payload.customerReferenceCode ||
        (parsedRaw.amountMinor ?? undefined) !== payload.amountMinor ||
        (rawCurrency ?? undefined) !== payload.currencyCode ||
        (parsedRaw.price ?? undefined) !== payload.price ||
        (parsedRaw.paymentId ?? undefined) !== payload.paymentId ||
        (parsedRaw.orderReferenceCode ?? undefined) !== payload.orderReferenceCode ||
        (parsedRaw.intentId ?? undefined) !== payload.intentId ||
        (parsedRaw.providerReference ?? undefined) !== payload.providerReference ||
        (parsedRaw.paymentStatus ?? undefined) !== payload.paymentStatus ||
        (parsedRaw.paidThroughDate ?? undefined) !== payload.paidThroughDate ||
        (parsedRaw.currentPeriodEnd ?? undefined) !== payload.currentPeriodEnd
      ) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_MISMATCH',
          message: 'Decoded parameters do not match verified rawPayload envelope.'
        };
      }
    } catch {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_INVALID',
        message: 'Verified rawPayload is not valid JSON.'
      };
    }

    const signedTsResolution = resolveSignedEventTimestamp(parsedRaw);
    if (!signedTsResolution.valid) {
      return {
        success: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: signedTsResolution.message || 'Verified rawPayload contains an invalid event timestamp.'
      };
    }

    if (payload.eventTimestamp !== undefined) {
      if (typeof payload.eventTimestamp !== 'string' || !payload.eventTimestamp.trim() || Number.isNaN(Date.parse(payload.eventTimestamp))) {
        return {
          success: false,
          errorCode: 'INVALID_EVENT_TIMESTAMP',
          message: 'Payload eventTimestamp is invalid.'
        };
      }
      if (!signedTsResolution.timestamp || Date.parse(payload.eventTimestamp) !== Date.parse(signedTsResolution.timestamp)) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_MISMATCH',
          message: 'Decoded eventTimestamp does not match verified rawPayload timestamp.'
        };
      }
    }

    const signedEventTimestamp: string | undefined = signedTsResolution.timestamp;
    if (signedEventTimestamp !== undefined) {
      if (isFutureEventTimestampBeyondSkew(signedEventTimestamp)) {
        return {
          success: false,
          errorCode: 'INVALID_EVENT_TIMESTAMP',
          message: `Verified rawPayload eventTimestamp (${signedEventTimestamp}) exceeds maximum allowed future clock skew.`
        };
      }
    }

    const signedPaidPeriodRaw = parsedRaw.paidThroughDate ?? parsedRaw.currentPeriodEnd;
    if (signedPaidPeriodRaw !== undefined) {
      if (typeof signedPaidPeriodRaw !== 'string' || !signedPaidPeriodRaw.trim() || Number.isNaN(Date.parse(signedPaidPeriodRaw))) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_INVALID',
          message: 'Verified rawPayload contains an invalid billing period date.'
        };
      }
    }
    if (parsedRaw.currentPeriodEnd !== undefined) {
      if (typeof parsedRaw.currentPeriodEnd !== 'string' || !parsedRaw.currentPeriodEnd.trim() || Number.isNaN(Date.parse(parsedRaw.currentPeriodEnd))) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_INVALID',
          message: 'Verified rawPayload contains an invalid currentPeriodEnd.'
        };
      }
    }

    let normalizedEvent: VerifiedNormalizedPaymentEvent | undefined;
    if (typeof verification.provider.normalizeEvent === 'function') {
      try {
        normalizedEvent = verification.provider.normalizeEvent(rawToBind);
      } catch (err: any) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_INVALID',
          message: err?.message || 'Provider event normalization failed.'
        };
      }
    }

    const lifecycleOpResolution = resolveLifecycleOperation(parsedRaw);
    if (!lifecycleOpResolution.valid) {
      return {
        success: false,
        errorCode: lifecycleOpResolution.errorCode || 'UNKNOWN_EVENT_TYPE',
        message: lifecycleOpResolution.message || `Unsupported or conflicting event type: ${payload.eventType}`
      };
    }

    // 4. Subscription lookup
    if (!payload.subscriptionReferenceCode || !payload.subscriptionReferenceCode.trim()) {
      return {
        success: false,
        errorCode: 'MISSING_SUBSCRIPTION_REFERENCE',
        message: 'Payload is missing subscriptionReferenceCode.'
      };
    }

    const existingSub = await storage.getSubscriptionByReference(payload.subscriptionReferenceCode);
    if (!existingSub) {
      return {
        success: false,
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
        message: `Unknown subscription reference: ${payload.subscriptionReferenceCode}`
      };
    }

    // 5. Customer / Tenant mismatch detection (check both if both present)
    const cleanCustomerRef = payload.customerReferenceCode?.trim() || '';
    const cleanTenantId = payload.tenantId?.trim() || '';
    if (cleanCustomerRef && cleanTenantId && cleanCustomerRef !== cleanTenantId) {
      return {
        success: false,
        errorCode: 'TENANT_MISMATCH',
        message: `Conflicting customerReferenceCode (${cleanCustomerRef}) and tenantId (${cleanTenantId}) in payload.`
      };
    }
    const payloadCustomer = cleanCustomerRef || cleanTenantId;
    if (payloadCustomer && existingSub.tenantId && payloadCustomer !== existingSub.tenantId) {
      return {
        success: false,
        errorCode: 'TENANT_MISMATCH',
        message: `Tenant mismatch: payload references ${payloadCustomer} but subscription belongs to ${existingSub.tenantId}`
      };
    }

    const webhookFingerprint = canonicalizeJson([
      existingSub.tenantId,
      payload.subscriptionReferenceCode,
      payload.eventType,
      payload.status ?? null,
      payload.amountMinor ?? null,
      payload.currencyCode ?? null,
      payload.price ?? null,
      verification.rawPayload
    ]);

    const eventRecord: WebhookEventRecord = {
      providerEventId: payload.providerEventId,
      eventType: payload.eventType,
      tenantId: existingSub.tenantId,
      subscriptionReferenceCode: payload.subscriptionReferenceCode,
      processedAt: new Date().toISOString(),
      eventTimestamp: signedEventTimestamp,
      payloadFingerprint: webhookFingerprint
    };

    // 6. Idempotency check: duplicate event rejection with fingerprint comparison
    const isDuplicate = await storage.hasProcessedEvent(payload.providerEventId);
    if (isDuplicate) {
      const replayRes = await storage.commitTransitionAtomic(eventRecord, existingSub, webhookFingerprint);
      return mapAtomicTransitionResult(replayRes, payload.providerEventId, existingSub.status, existingSub);
    }

    // 7. Target status mapping & conflict guard (require known eventType; never fall back to providerStatus alone)
    const byEvent =
      typeof payload.eventType === 'string' && payload.eventType.trim().length > 0
        ? this.mapEventToTargetStatus(payload.eventType, undefined)
        : null;
    if (!byEvent) {
      return {
        success: false,
        errorCode: 'UNKNOWN_EVENT_TYPE',
        message: `Unsupported event type: ${payload.eventType}`
      };
    }
    if (payload.status && payload.eventType !== 'subscription.created') {
      const byStatus = this.mapEventToTargetStatus('', payload.status);
      if (byStatus && byEvent !== byStatus) {
        return {
          success: false,
          errorCode: 'CONFLICTING_EVENT_STATUS',
          message: `Conflicting eventType (${payload.eventType}) and status (${payload.status}).`
        };
      }
    } else if (payload.eventType === 'subscription.created' && payload.status && payload.status !== 'ACTIVE' && payload.status !== 'PENDING') {
      const byStatus = this.mapEventToTargetStatus('', payload.status);
      if (byStatus && byStatus !== 'pending_checkout') {
        return {
          success: false,
          errorCode: 'CONFLICTING_EVENT_STATUS',
          message: `Conflicting eventType (${payload.eventType}) and status (${payload.status}).`
        };
      }
    }
    const targetStatus = byEvent;

    // Monotonic timestamp watermark protection against unique-event-ID stale replay
    if (existingSub.lastWebhookEventAt) {
      if (!signedEventTimestamp) {
        return {
          success: false,
          errorCode: 'STALE_EVENT_OUT_OF_ORDER',
          message: 'Signed eventTimestamp is mandatory when subscription already has an event watermark.'
        };
      }
      const watermarkMs = Date.parse(existingSub.lastWebhookEventAt);
      const incomingMs = Date.parse(signedEventTimestamp);
      if (Number.isNaN(incomingMs) || Number.isNaN(watermarkMs) || incomingMs <= watermarkMs) {
        return {
          success: false,
          errorCode: 'STALE_EVENT_OUT_OF_ORDER',
          message: `Stale webhook eventTimestamp (${signedEventTimestamp}) is older than or equal to current watermark (${existingSub.lastWebhookEventAt}).`
        };
      }
    }

    // Unverified cancellation / manual transition prevention: requires verified customer/tenant reference matching owner
    if (existingSub.status === 'manual_active' && targetStatus === 'pending_checkout') {
      if (!payloadCustomer || payloadCustomer !== existingSub.tenantId) {
        return {
          success: false,
          errorCode: 'UNVERIFIED_MANUAL_TRANSITION',
          message: 'Manual-to-online checkout transition webhook requires verified customer/tenant reference matching subscription owner.'
        };
      }
    }

    if (targetStatus === 'cancelled') {
      if (!payloadCustomer || payloadCustomer !== existingSub.tenantId) {
        return {
          success: false,
          errorCode: 'UNVERIFIED_CANCELLATION',
          message: 'Cancellation webhook requires verified customer/tenant reference matching subscription owner.'
        };
      }
    }

    // Payment-gated transition to active requires trusted provider-normalized payment proof AND settled stored payment verification
    let activePaymentVerification:
      | {
          paymentId: string;
          expectedTenantId: string;
          expectedSubscriptionRef: string;
          expectedAmountMinor: number;
          expectedCurrency: string;
          expectedTargetPlanId?: string;
          expectedCheckoutAmountMinor?: number;
          expectedCheckoutCurrency?: string;
        }
      | undefined;

    if (targetStatus === 'active') {
      const paidEventStatuses = new Set(['succeeded', 'success', 'paid', 'active', 'completed', 'settled']);
      const paidPaymentStatuses = new Set(['succeeded', 'success', 'paid', 'completed', 'settled']);
      const hasInvalidNormalizedStatus =
        normalizedEvent?.status !== undefined &&
        !paidEventStatuses.has(String(normalizedEvent.status).trim().toLowerCase());
      const hasInvalidRawStatus =
        parsedRaw.status !== undefined &&
        !paidEventStatuses.has(String(parsedRaw.status).trim().toLowerCase());
      const hasInvalidPaymentStatus =
        parsedRaw.paymentStatus !== undefined &&
        !paidPaymentStatuses.has(String(parsedRaw.paymentStatus).trim().toLowerCase());
      const isNonPaidStatus = hasInvalidNormalizedStatus || hasInvalidRawStatus || hasInvalidPaymentStatus;
      const verifiedPaymentId = [
        parsedRaw.paymentId,
        normalizedEvent?.intentId,
        parsedRaw.intentId
      ]
        .find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)
        ?.trim();
      const proofAmountMinor = normalizedEvent?.amountMinor ?? parsedRaw.amountMinor;
      const proofCurrency = normalizedEvent?.currency ?? parsedRaw.currencyCode ?? parsedRaw.currency;
      const proofMoneyValid =
        typeof proofAmountMinor === 'number' &&
        typeof proofCurrency === 'string' &&
        validatePaymentMoney(proofAmountMinor, proofCurrency).valid;

      if (
        isNonPaidStatus ||
        parsedRaw.hasPaymentProof === false ||
        parsedRaw.hasVerifiedPaymentProof === false ||
        !verifiedPaymentId ||
        !proofMoneyValid
      ) {
        return {
          success: false,
          errorCode: 'PAYMENT_PROOF_REQUIRED',
          message: 'Transition to active status requires verified provider paymentId and positive amount/currency in signed payload.'
        };
      }

      if (!this.isValidTransition(existingSub.status, targetStatus)) {
        return {
          success: false,
          errorCode: 'INVALID_TRANSITION_OUT_OF_ORDER',
          message: `Cannot transition subscription from ${existingSub.status} to ${targetStatus} (out-of-order or terminal).`
        };
      }

      if (typeof storage.getPayment !== 'function') {
        return {
          success: false,
          errorCode: 'ATOMIC_STORAGE_REQUIRED',
          message: 'Storage adapter must implement getPayment to verify settled payment proof.'
        };
      }

      const storedPayment = await storage.getPayment(verifiedPaymentId);
      if (!storedPayment) {
        return {
          success: false,
          errorCode: 'PAYMENT_NOT_FOUND',
          message: `Verified paid payment record '${verifiedPaymentId}' was not found in storage.`
        };
      }
      if (storedPayment.tenantId !== existingSub.tenantId) {
        return {
          success: false,
          errorCode: 'TENANT_MISMATCH',
          message: `Payment ${verifiedPaymentId} belongs to tenant ${storedPayment.tenantId}, not ${existingSub.tenantId}.`
        };
      }
      if (storedPayment.subscriptionReferenceCode !== payload.subscriptionReferenceCode) {
        return {
          success: false,
          errorCode: 'PAYMENT_SUBSCRIPTION_MISMATCH',
          message: `Payment ${verifiedPaymentId} belongs to subscription ${storedPayment.subscriptionReferenceCode}, not ${payload.subscriptionReferenceCode}.`
        };
      }
      if (storedPayment.status !== 'paid' || (storedPayment.refundedAmountMinor || 0) > 0) {
        return {
          success: false,
          errorCode: 'PAYMENT_PROOF_REQUIRED',
          message: `Payment ${verifiedPaymentId} is not in settled 'paid' state (status=${storedPayment.status}).`
        };
      }
      if (storedPayment.currency !== proofCurrency) {
        return {
          success: false,
          errorCode: 'CURRENCY_MISMATCH',
          message: `Payment currency (${storedPayment.currency}) does not match webhook currency (${proofCurrency}).`
        };
      }
      if (storedPayment.amountMinor !== proofAmountMinor) {
        return {
          success: false,
          errorCode: 'PAYMENT_AMOUNT_MISMATCH',
          message: `Payment amount (${storedPayment.amountMinor}) does not match webhook amount (${proofAmountMinor}).`
        };
      }

      const isScheduledUpgradeActiveTransition =
        existingSub.planChangeStatus === 'upgrade_pending' &&
        typeof existingSub.scheduledPlanId === 'string' &&
        existingSub.scheduledPlanId.trim().length > 0;

      let expectedTargetPlanId: string | undefined;
      let expectedCheckoutAmountMinor: number | undefined;
      let expectedCheckoutCurrency: string | undefined;

      if (isScheduledUpgradeActiveTransition) {
        const scheduledTargetPlanId = existingSub.scheduledPlanId!.trim();
        const targetPlan = planService.getPlan(scheduledTargetPlanId);
        if (!targetPlan || targetPlan.isActive === false) {
          return {
            success: false,
            errorCode: 'INVALID_TARGET_PLAN',
            message: `Scheduled target plan '${scheduledTargetPlanId}' is invalid or inactive.`
          };
        }

        const paymentTargetPlanId =
          typeof storedPayment.targetPlanId === 'string' ? storedPayment.targetPlanId.trim() : '';
        if (!paymentTargetPlanId || paymentTargetPlanId !== scheduledTargetPlanId) {
          return {
            success: false,
            errorCode: 'PAYMENT_PLAN_MISMATCH',
            message: `Payment ${verifiedPaymentId} is not bound to scheduled target plan '${scheduledTargetPlanId}'.`
          };
        }

        const catalogCurrency = (targetPlan.currency || 'TRY').trim().toUpperCase();
        const paymentExpectedCurrency =
          typeof storedPayment.expectedCurrency === 'string'
            ? storedPayment.expectedCurrency.trim().toUpperCase()
            : '';
        if (
          !paymentExpectedCurrency ||
          paymentExpectedCurrency !== catalogCurrency ||
          storedPayment.currency !== paymentExpectedCurrency ||
          proofCurrency !== paymentExpectedCurrency
        ) {
          return {
            success: false,
            errorCode: 'CURRENCY_MISMATCH',
            message: `Payment ${verifiedPaymentId} currency (${storedPayment.currency}) does not match expected checkout currency (${catalogCurrency}) for plan '${scheduledTargetPlanId}'.`
          };
        }

        const paymentExpectedAmountMinor = storedPayment.expectedAmountMinor;
        if (
          typeof paymentExpectedAmountMinor !== 'number' ||
          !validatePaymentMoney(paymentExpectedAmountMinor, paymentExpectedCurrency).valid
        ) {
          return {
            success: false,
            errorCode: 'PAYMENT_AMOUNT_MISMATCH',
            message: `Payment ${verifiedPaymentId} is missing a valid expectedAmountMinor binding for plan '${scheduledTargetPlanId}'.`
          };
        }

        const allowedPlanMinorAmounts = new Set<number>();
        if (typeof targetPlan.monthlyPrice === 'number' && targetPlan.monthlyPrice > 0) {
          allowedPlanMinorAmounts.add(Math.round(targetPlan.monthlyPrice * 100));
        }
        if (typeof targetPlan.annualPrice === 'number' && targetPlan.annualPrice > 0) {
          allowedPlanMinorAmounts.add(Math.round(targetPlan.annualPrice * 100));
        }
        if (allowedPlanMinorAmounts.size > 0 && !allowedPlanMinorAmounts.has(paymentExpectedAmountMinor)) {
          return {
            success: false,
            errorCode: 'PAYMENT_AMOUNT_MISMATCH',
            message: `Payment ${verifiedPaymentId} expectedAmountMinor (${paymentExpectedAmountMinor}) does not match catalog price for plan '${scheduledTargetPlanId}'.`
          };
        }

        if (
          storedPayment.amountMinor !== paymentExpectedAmountMinor ||
          proofAmountMinor !== paymentExpectedAmountMinor
        ) {
          return {
            success: false,
            errorCode: 'PAYMENT_AMOUNT_MISMATCH',
            message: `Payment ${verifiedPaymentId} amount (${storedPayment.amountMinor}) does not match expected checkout amount (${paymentExpectedAmountMinor}) for plan '${scheduledTargetPlanId}'.`
          };
        }

        expectedTargetPlanId = scheduledTargetPlanId;
        expectedCheckoutAmountMinor = paymentExpectedAmountMinor;
        expectedCheckoutCurrency = paymentExpectedCurrency;
      }

      activePaymentVerification = {
        paymentId: verifiedPaymentId,
        expectedTenantId: existingSub.tenantId,
        expectedSubscriptionRef: payload.subscriptionReferenceCode,
        expectedAmountMinor: proofAmountMinor,
        expectedCurrency: proofCurrency,
        expectedTargetPlanId,
        expectedCheckoutAmountMinor,
        expectedCheckoutCurrency
      };
    }

    // 8. Out-of-order & state machine transition validation
    if (!this.isValidTransition(existingSub.status, targetStatus)) {
      return {
        success: false,
        errorCode: 'INVALID_TRANSITION_OUT_OF_ORDER',
        message: `Cannot transition subscription from ${existingSub.status} to ${targetStatus} (out-of-order or terminal).`
      };
    }

    // 9. Apply transition (never synthesize paid period from local Date.now() without signed period data)
    let nextWatermark = existingSub.lastWebhookEventAt;
    if (signedEventTimestamp) {
      if (!nextWatermark || Date.parse(signedEventTimestamp) > Date.parse(nextWatermark)) {
        nextWatermark = signedEventTimestamp;
      }
    }

    const promotedPlanId =
      targetStatus === 'active' &&
      existingSub.planChangeStatus === 'upgrade_pending' &&
      typeof existingSub.scheduledPlanId === 'string' &&
      existingSub.scheduledPlanId.trim()
        ? existingSub.scheduledPlanId.trim()
        : existingSub.planId;
    const isPromotingScheduledUpgrade =
      targetStatus === 'active' &&
      existingSub.planChangeStatus === 'upgrade_pending' &&
      Boolean(existingSub.scheduledPlanId?.trim());

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: targetStatus,
      planId: promotedPlanId,
      scheduledPlanId: isPromotingScheduledUpgrade ? undefined : existingSub.scheduledPlanId,
      planChangeStatus: isPromotingScheduledUpgrade ? 'none' : existingSub.planChangeStatus,
      paidThroughDate:
        targetStatus === 'active'
          ? resolvePreservedPaidThroughDate(
              existingSub.paidThroughDate,
              typeof signedPaidPeriodRaw === 'string' ? signedPaidPeriodRaw : undefined
            )
          : existingSub.paidThroughDate,
      currentPeriodEnd:
        targetStatus === 'active' && typeof parsedRaw.currentPeriodEnd === 'string'
          ? resolvePreservedPaidThroughDate(existingSub.currentPeriodEnd, parsedRaw.currentPeriodEnd) ||
            parsedRaw.currentPeriodEnd
          : existingSub.currentPeriodEnd,
      lastPaymentStatus:
        targetStatus === 'active'
          ? 'paid'
          : targetStatus === 'past_due'
            ? 'failed'
            : existingSub.lastPaymentStatus,
      lastWebhookEventAt: nextWatermark
    };

    const expectedSnapshotFingerprint = computeSubscriptionSnapshotFingerprint(existingSub);

    // 10. Atomic commit: persist event claim, watermark guard, and subscription mutation together
    const commitRes = await storage.commitTransitionAtomic(eventRecord, updatedSub, webhookFingerprint, {
      eventTimestamp: signedEventTimestamp,
      expectedLastWebhookEventAt: existingSub.lastWebhookEventAt,
      expectedSubscriptionStatus: existingSub.status,
      expectedProviderSubscriptionId: existingSub.providerSubscriptionId,
      expectedTenantId: existingSub.tenantId,
      expectedSubscriptionSnapshotFingerprint: expectedSnapshotFingerprint,
      paymentVerification: activePaymentVerification
    });
    return mapAtomicTransitionResult(commitRes, payload.providerEventId, targetStatus, updatedSub);
  },

  // Validate checkout initiation parameters
  validateCheckoutRequest(tenantId?: string, planId?: string): { valid: boolean; errorCode?: string; message?: string } {
    if (!tenantId || tenantId.trim() === '') {
      return { valid: false, errorCode: 'UNKNOWN_TENANT', message: 'Tenant identifier is required.' };
    }
    if (!planId || planId.trim() === '') {
      return { valid: false, errorCode: 'INVALID_PLAN', message: 'Plan identifier is required.' };
    }
    const plan = planService.getPlan(planId);
    if (!plan) {
      return { valid: false, errorCode: 'INVALID_PLAN', message: `Plan '${planId}' does not exist.` };
    }
    return { valid: true };
  },

  // Evaluate grace period for past_due status fail-closed without throwing on invalid input
  evaluateGracePeriod(
    pastDueDateStr?: string,
    graceDays: number = 7,
    now: Date = new Date()
  ): { inGracePeriod: boolean; daysRemaining: number; expired: boolean; graceEndDate: string; status: 'in_grace' | 'expired' } {
    const validNow = now instanceof Date && !Number.isNaN(now.getTime());
    const safeGraceEndIso = validNow ? now.toISOString() : new Date(0).toISOString();
    if (
      !pastDueDateStr ||
      typeof pastDueDateStr !== 'string' ||
      !pastDueDateStr.trim() ||
      !validNow ||
      typeof graceDays !== 'number' ||
      !Number.isFinite(graceDays) ||
      graceDays < 0
    ) {
      return { inGracePeriod: false, daysRemaining: 0, expired: true, graceEndDate: safeGraceEndIso, status: 'expired' };
    }
    const pastDueDate = new Date(pastDueDateStr);
    if (Number.isNaN(pastDueDate.getTime())) {
      return { inGracePeriod: false, daysRemaining: 0, expired: true, graceEndDate: safeGraceEndIso, status: 'expired' };
    }
    const graceEndMs = pastDueDate.getTime() + graceDays * 24 * 60 * 60 * 1000;
    const graceEnd = new Date(graceEndMs);
    if (!Number.isFinite(graceEndMs) || Number.isNaN(graceEnd.getTime())) {
      return { inGracePeriod: false, daysRemaining: 0, expired: true, graceEndDate: safeGraceEndIso, status: 'expired' };
    }
    const msRemaining = graceEndMs - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const inGrace = msRemaining > 0;
    return {
      inGracePeriod: inGrace,
      daysRemaining,
      expired: !inGrace,
      graceEndDate: graceEnd.toISOString(),
      status: inGrace ? 'in_grace' : 'expired'
    };
  },

  // Pure logic for plan upgrades (immediate) vs downgrades (period end)
  calculatePlanChange(
    sub: TenantSubscription,
    targetPlanId: string,
    timing: 'immediate' | 'period_end'
  ): {
    success: boolean;
    errorCode?: string;
    message?: string;
    updatedSub: TenantSubscription;
    action: 'upgraded' | 'downgrade_scheduled' | 'rejected';
  } {
    if (sub.status === 'cancelled' || sub.status === 'expired') {
      return {
        success: false,
        errorCode: 'TERMINAL_SUBSCRIPTION_STATE',
        message: `Cannot change plan for terminal subscription status '${sub.status}'.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    if (timing !== 'immediate' && timing !== 'period_end') {
      return {
        success: false,
        errorCode: 'INVALID_TIMING',
        message: `Invalid plan change timing: '${String(timing)}'.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    if (!targetPlanId || typeof targetPlanId !== 'string' || !targetPlanId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_PLAN',
        message: 'Target planId is required and cannot be empty.',
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    const currentRank = getPlanRank(sub.planId);
    if (currentRank === null) {
      return {
        success: false,
        errorCode: 'INVALID_CURRENT_PLAN',
        message: `Current plan '${sub.planId}' does not exist.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    const targetRank = getPlanRank(targetPlanId);
    if (targetRank === null) {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_PLAN',
        message: `Plan '${targetPlanId}' does not exist.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    if (targetRank < currentRank && timing === 'immediate') {
      return {
        success: false,
        errorCode: 'DOWNGRADE_REQUIRES_PERIOD_END',
        message: `Downgrade from '${sub.planId}' to '${targetPlanId}' must be scheduled for period_end.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    if (targetRank > currentRank && timing === 'period_end') {
      return {
        success: false,
        errorCode: 'UPGRADE_REQUIRES_IMMEDIATE',
        message: `Upgrade from '${sub.planId}' to '${targetPlanId}' must be applied immediately.`,
        updatedSub: { ...sub },
        action: 'rejected'
      };
    }
    if (timing === 'immediate') {
      return {
        success: true,
        updatedSub: {
          ...sub,
          planId: targetPlanId,
          planChangeStatus: 'none',
          scheduledPlanId: undefined
        },
        action: 'upgraded'
      };
    } else {
      return {
        success: true,
        updatedSub: {
          ...sub,
          planChangeStatus: 'downgrade_scheduled',
          scheduledPlanId: targetPlanId
        },
        action: 'downgrade_scheduled'
      };
    }
  },

  // Apply due scheduled plan change at period end
  applyDueScheduledPlanChange(
    sub: TenantSubscription,
    now: Date = new Date()
  ): { applied: boolean; subscription: TenantSubscription; reason?: string } {
    if (!(now instanceof Date) || isNaN(now.getTime())) {
      return {
        applied: false,
        subscription: { ...sub, planChangeStatus: 'manual_review_required' },
        reason: 'Invalid evaluation timestamp for scheduled plan change'
      };
    }
    if (sub.planChangeStatus === 'downgrade_scheduled' && sub.scheduledPlanId) {
      const scheduledPlan = planService.getPlan(sub.scheduledPlanId);
      if (!scheduledPlan) {
        return {
          applied: false,
          subscription: {
            ...sub,
            planChangeStatus: 'manual_review_required'
          },
          reason: `Scheduled plan '${sub.scheduledPlanId}' does not exist`
        };
      }
      if (!sub.currentPeriodEnd || typeof sub.currentPeriodEnd !== 'string') {
        return {
          applied: false,
          subscription: {
            ...sub,
            planChangeStatus: 'manual_review_required'
          },
          reason: 'Missing currentPeriodEnd for scheduled plan change'
        };
      }
      const periodEnd = new Date(sub.currentPeriodEnd);
      if (isNaN(periodEnd.getTime())) {
        return {
          applied: false,
          subscription: {
            ...sub,
            planChangeStatus: 'manual_review_required'
          },
          reason: 'Invalid currentPeriodEnd date format for scheduled plan change'
        };
      }
      if (now.getTime() >= periodEnd.getTime()) {
        return {
          applied: true,
          subscription: {
            ...sub,
            planId: sub.scheduledPlanId,
            planChangeStatus: 'none',
            scheduledPlanId: undefined,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd
          }
        };
      }
    }
    return { applied: false, subscription: { ...sub } };
  },

  // Process verified refund webhook event (requires cryptographic payload-bound envelope)
  async processRefundWebhookEvent(
    payload: RefundWebhookPayloadInput,
    storage: StorageAdapter,
    verification: VerifiedWebhookEnvelope
  ): Promise<TransitionResult> {
    if (!isValidEnvelopeObject(verification)) {
      return {
        success: false,
        errorCode: 'UNVERIFIED_WEBHOOK',
        message: 'Verified payload-bound webhook envelope is required. Detached boolean verification is prohibited.'
      };
    }

    const isSignatureValid = await verification.provider.verifyWebhook(verification.headers, verification.rawPayload);
    if (!isSignatureValid) {
      return {
        success: false,
        errorCode: 'UNVERIFIED_WEBHOOK',
        message: 'Cryptographic signature is missing or invalid against rawPayload. Refund mutation rejected.'
      };
    }

    if (payload.rawPayload !== undefined && payload.rawPayload !== verification.rawPayload) {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_MISMATCH',
        message: 'Payload rawPayload does not match verified envelope rawPayload.'
      };
    }

    let parsedRaw: Record<string, any>;
    try {
      const parsed = JSON.parse(verification.rawPayload);
      if (!isPlainObject(parsed)) {
        return {
          success: false,
          errorCode: 'RAW_PAYLOAD_INVALID',
          message: 'Verified rawPayload must be a JSON object.'
        };
      }
      parsedRaw = parsed;
    } catch {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_INVALID',
        message: 'Verified rawPayload is not valid JSON.'
      };
    }

    if (parsedRaw.currencyCode !== undefined && parsedRaw.currencyCode !== parsedRaw.currency) {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_MISMATCH',
        message: 'Verified rawPayload contains conflicting currency and currencyCode values.'
      };
    }
    if (parsedRaw.isFullRefund !== undefined && typeof parsedRaw.isFullRefund !== 'boolean') {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_INVALID',
        message: 'Verified rawPayload isFullRefund must be a boolean when provided.'
      };
    }
    if (
      parsedRaw.providerEventId !== payload.providerEventId ||
      parsedRaw.subscriptionReferenceCode !== payload.subscriptionReferenceCode ||
      parsedRaw.paymentId !== payload.paymentId ||
      parsedRaw.amountMinor !== payload.amountMinor ||
      parsedRaw.currency !== payload.currency ||
      parsedRaw.tenantId !== payload.tenantId ||
      (parsedRaw.isFullRefund ?? undefined) !== payload.isFullRefund ||
      (parsedRaw.originalPaymentAmountMinor ?? undefined) !== payload.originalPaymentAmountMinor ||
      (parsedRaw.originalCurrency ?? undefined) !== payload.originalCurrency ||
      (parsedRaw.refundReason ?? undefined) !== payload.refundReason
    ) {
      return {
        success: false,
        errorCode: 'RAW_PAYLOAD_MISMATCH',
        message: 'Decoded refund parameters do not strictly match cryptographically verified rawPayload envelope.'
      };
    }

    const signedTsResolution = resolveSignedEventTimestamp(parsedRaw);
    if (!signedTsResolution.valid) {
      return {
        success: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: signedTsResolution.message || 'Verified rawPayload contains an invalid event timestamp.'
      };
    }
    const signedEventTimestamp = signedTsResolution.timestamp;
    if (signedEventTimestamp !== undefined && isFutureEventTimestampBeyondSkew(signedEventTimestamp)) {
      return {
        success: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Verified rawPayload eventTimestamp (${signedEventTimestamp}) exceeds maximum allowed future clock skew.`
      };
    }

    const refundTypeResolution = resolveRefundEventType(parsedRaw);
    if (!refundTypeResolution.valid) {
      return {
        success: false,
        errorCode: 'INVALID_EVENT_TYPE',
        message: refundTypeResolution.message || 'Verified rawPayload refund eventType/type/operationType is invalid or conflicting.'
      };
    }
    if (
      parsedRaw.status !== undefined &&
      !['succeeded', 'SUCCESS', 'refunded', 'REFUNDED', 'completed', 'COMPLETED'].includes(String(parsedRaw.status))
    ) {
      return {
        success: false,
        errorCode: 'INVALID_EVENT_TYPE',
        message: `Verified rawPayload refund status is not succeeded: ${String(parsedRaw.status)}`
      };
    }

    if (typeof storage.commitRefundAtomic !== 'function' || typeof storage.getPayment !== 'function') {
      return {
        success: false,
        errorCode: 'ATOMIC_STORAGE_REQUIRED',
        message: 'Storage adapter must implement getPayment and commitRefundAtomic. Sequential fallback is prohibited.'
      };
    }

    if (!payload.providerEventId || typeof payload.providerEventId !== 'string' || !payload.providerEventId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_IDENTIFIER',
        message: 'providerEventId is required and cannot be empty.'
      };
    }
    if (!payload.subscriptionReferenceCode || typeof payload.subscriptionReferenceCode !== 'string' || !payload.subscriptionReferenceCode.trim()) {
      return {
        success: false,
        errorCode: 'MISSING_SUBSCRIPTION_REFERENCE',
        message: 'subscriptionReferenceCode is required.'
      };
    }

    if (!payload.paymentId || typeof payload.paymentId !== 'string' || !payload.paymentId.trim()) {
      return {
        success: false,
        errorCode: 'MISSING_PAYMENT_ID',
        message: 'paymentId is mandatory for verified refund processing.'
      };
    }

    const moneyCheck = validatePaymentMoney(payload.amountMinor, payload.currency);
    if (!moneyCheck.valid) {
      return {
        success: false,
        errorCode: 'INVALID_MONEY',
        message: `Invalid refund money parameters: ${moneyCheck.error}`
      };
    }

    const existingSub = await storage.getSubscriptionByReference(payload.subscriptionReferenceCode);
    if (!existingSub) {
      return {
        success: false,
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
        message: `Unknown subscription reference: ${payload.subscriptionReferenceCode}`
      };
    }

    if (!payload.tenantId || payload.tenantId !== existingSub.tenantId) {
      return {
        success: false,
        errorCode: 'TENANT_MISMATCH',
        message: `Tenant mismatch for refund: expected ${existingSub.tenantId}, got ${payload.tenantId}`
      };
    }

    const refundFingerprint = canonicalizeJson([
      existingSub.tenantId,
      payload.subscriptionReferenceCode,
      payload.paymentId,
      payload.amountMinor,
      payload.currency,
      payload.isFullRefund ? 'full' : 'partial',
      payload.originalPaymentAmountMinor ?? null,
      payload.originalCurrency ?? null,
      payload.refundReason ?? null,
      verification.rawPayload
    ]);

    const eventRecord: WebhookEventRecord = {
      providerEventId: payload.providerEventId,
      eventType: 'payment.refunded',
      tenantId: existingSub.tenantId,
      subscriptionReferenceCode: payload.subscriptionReferenceCode,
      processedAt: new Date().toISOString(),
      eventTimestamp: signedEventTimestamp,
      payloadFingerprint: refundFingerprint
    };

    // If event is already processed, delegate directly to atomic storage for idempotent replay & fingerprint check
    const isAlreadyProcessed = await storage.hasProcessedEvent(payload.providerEventId);
    if (isAlreadyProcessed) {
      const replayRes = await storage.commitRefundAtomic(eventRecord, existingSub, payload.paymentId, refundFingerprint);
      return mapAtomicRefundResult(replayRes, payload.providerEventId, existingSub);
    }

    const watermarkCheck = validateEventTimestampWatermark(signedEventTimestamp, existingSub.lastWebhookEventAt);
    if (!watermarkCheck.valid) {
      return {
        success: false,
        errorCode: watermarkCheck.errorCode || 'STALE_EVENT_OUT_OF_ORDER',
        message: watermarkCheck.message || 'Stale or invalid refund webhook eventTimestamp rejected by monotonic watermark.'
      };
    }

    const payment = await storage.getPayment(payload.paymentId);
    if (!payment) {
      return {
        success: false,
        errorCode: 'PAYMENT_NOT_FOUND',
        message: `Payment record ${payload.paymentId} not found.`
      };
    }
    if (payment.tenantId !== existingSub.tenantId) {
      return {
        success: false,
        errorCode: 'TENANT_MISMATCH',
        message: `Payment belongs to tenant ${payment.tenantId}, not subscription tenant ${existingSub.tenantId}.`
      };
    }
    if (payment.subscriptionReferenceCode !== payload.subscriptionReferenceCode) {
      return {
        success: false,
        errorCode: 'PAYMENT_SUBSCRIPTION_MISMATCH',
        message: `Payment belongs to subscription ${payment.subscriptionReferenceCode}, not ${payload.subscriptionReferenceCode}.`
      };
    }
    const currentRefundedMinor = payment.refundedAmountMinor || 0;
    const remainingRefundableMinor = payment.amountMinor - currentRefundedMinor;
    if (payment.status === 'refunded' || remainingRefundableMinor <= 0) {
      return {
        success: false,
        errorCode: 'PAYMENT_ALREADY_REFUNDED',
        message: `Payment ${payload.paymentId} is already fully refunded.`
      };
    }
    if (payment.status !== 'paid' && payment.status !== 'partially_refunded') {
      return {
        success: false,
        errorCode: 'PAYMENT_ALREADY_REFUNDED',
        message: `Payment ${payload.paymentId} is in status '${payment.status}', only 'paid' or 'partially_refunded' payments can be refunded.`
      };
    }
    if (payment.currency !== payload.currency) {
      return {
        success: false,
        errorCode: 'CURRENCY_MISMATCH',
        message: `Payment currency (${payment.currency}) does not match refund currency (${payload.currency}).`
      };
    }
    if (payload.originalPaymentAmountMinor !== undefined && payload.originalPaymentAmountMinor !== payment.amountMinor) {
      return {
        success: false,
        errorCode: 'PAYMENT_AMOUNT_MISMATCH',
        message: `Original payment amount (${payload.originalPaymentAmountMinor}) does not match stored payment amount (${payment.amountMinor}).`
      };
    }
    if (payload.originalCurrency && payload.originalCurrency !== payment.currency) {
      return {
        success: false,
        errorCode: 'CURRENCY_MISMATCH',
        message: `Original currency (${payload.originalCurrency}) does not match stored payment currency (${payment.currency}).`
      };
    }
    if (payload.amountMinor > remainingRefundableMinor) {
      return {
        success: false,
        errorCode: 'REFUND_EXCEEDS_PAYMENT',
        message: `Refund amount (${payload.amountMinor}) exceeds remaining refundable amount (${remainingRefundableMinor}).`
      };
    }
    const isNowFullyRefunded = Boolean(payload.isFullRefund || (currentRefundedMinor + payload.amountMinor === payment.amountMinor));
    if (payload.isFullRefund && payload.amountMinor !== remainingRefundableMinor) {
      return {
        success: false,
        errorCode: 'PARTIAL_FULL_REFUND_MISMATCH',
        message: `Full refund indicated but refund amountMinor (${payload.amountMinor}) does not equal remaining refundable balance (${remainingRefundableMinor}).`
      };
    }

    let nextWatermark = existingSub.lastWebhookEventAt;
    if (signedEventTimestamp) {
      if (!nextWatermark || Date.parse(signedEventTimestamp) > Date.parse(nextWatermark)) {
        nextWatermark = signedEventTimestamp;
      }
    }

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: isNowFullyRefunded ? 'cancelled' : existingSub.status,
      lastPaymentStatus: isNowFullyRefunded ? 'refunded' : 'partially_refunded',
      lastWebhookEventAt: nextWatermark
    };

    const commitRes = await storage.commitRefundAtomic(
      eventRecord,
      updatedSub,
      payload.paymentId,
      refundFingerprint,
      {
        refundAmountMinor: payload.amountMinor,
        expectedPaymentAmountMinor: payment.amountMinor,
        expectedCurrency: payment.currency,
        expectedRefundedAmountMinor: currentRefundedMinor,
        isFullRefund: isNowFullyRefunded,
        expectedSubscriptionStatus: existingSub.status,
        expectedLastWebhookEventAt: existingSub.lastWebhookEventAt,
        expectedLastPaymentStatus: existingSub.lastPaymentStatus
      }
    );
    return mapAtomicRefundResult(commitRes, payload.providerEventId, updatedSub);
  },

  // Reconcile subscription against provider record
  reconcileSubscription(
    localSub: TenantSubscription,
    remoteProviderData: {
      status: string;
      currentPeriodEnd?: string;
      planId?: string;
      hasVerifiedPaymentProof?: boolean;
    }
  ): {
    inSync: boolean;
    discrepancyType: 'none' | 'status_mismatch' | 'period_mismatch' | 'plan_mismatch';
    resolutionApplied: 'none' | 'updated_local_status' | 'updated_period' | 'manual_review_required';
    reconciledSub: TenantSubscription;
    reason?: string;
  } {
    // 1. manual_active or comped subscriptions are protected from external override
    if (localSub.status === 'manual_active' || localSub.status === 'comped') {
      return {
        inSync: true,
        discrepancyType: 'none',
        resolutionApplied: 'none',
        reconciledSub: { ...localSub },
        reason: 'Manual or comped subscription is immune to remote provider mutation.'
      };
    }

    // 2. Unrecognized, empty, or unsupported remote statuses fail-closed to manual review
    const mappedRemoteStatus = normalizeRemoteReconcileStatus(remoteProviderData.status);
    if (!mappedRemoteStatus) {
      return {
        inSync: false,
        discrepancyType: 'status_mismatch',
        resolutionApplied: 'manual_review_required',
        reconciledSub: { ...localSub },
        reason: `Unrecognized or empty remote provider status: '${String(remoteProviderData.status ?? '')}'.`
      };
    }

    // 3. Terminal states (cancelled / expired) CANNOT be resurrected to active by provider sync
    if ((localSub.status === 'cancelled' || localSub.status === 'expired') && mappedRemoteStatus === 'active') {
      return {
        inSync: false,
        discrepancyType: 'status_mismatch',
        resolutionApplied: 'manual_review_required',
        reconciledSub: { ...localSub },
        reason: `Refusing to resurrect terminal ${localSub.status} subscription to active via reconciliation.`
      };
    }

    // 3. Status mismatch
    if (mappedRemoteStatus && mappedRemoteStatus !== localSub.status) {
      if (localSub.status === 'past_due' && mappedRemoteStatus === 'active' && !remoteProviderData.hasVerifiedPaymentProof) {
        return {
          inSync: false,
          discrepancyType: 'status_mismatch',
          resolutionApplied: 'manual_review_required',
          reconciledSub: { ...localSub },
          reason: 'past_due to active transition requires verified payment proof from provider.'
        };
      }
      const allowed = this.isValidTransition(localSub.status, mappedRemoteStatus);
      if (allowed) {
        return {
          inSync: false,
          discrepancyType: 'status_mismatch',
          resolutionApplied: 'updated_local_status',
          reconciledSub: {
            ...localSub,
            status: mappedRemoteStatus,
            lastPaymentStatus: mappedRemoteStatus === 'active' ? 'paid' : (mappedRemoteStatus === 'past_due' ? 'failed' : localSub.lastPaymentStatus)
          },
          reason: `Synchronized status from ${localSub.status} to ${mappedRemoteStatus}`
        };
      } else {
        return {
          inSync: false,
          discrepancyType: 'status_mismatch',
          resolutionApplied: 'manual_review_required',
          reconciledSub: { ...localSub },
          reason: `Invalid transition from ${localSub.status} to ${mappedRemoteStatus}`
        };
      }
    }

    // 4. Plan mismatch check
    if (remoteProviderData.planId && remoteProviderData.planId !== localSub.planId) {
      return {
        inSync: false,
        discrepancyType: 'plan_mismatch',
        resolutionApplied: 'manual_review_required',
        reconciledSub: { ...localSub },
        reason: `Plan mismatch: local plan (${localSub.planId}) differs from remote plan (${remoteProviderData.planId}).`
      };
    }

    // 5. Period sync
    if (remoteProviderData.currentPeriodEnd && remoteProviderData.currentPeriodEnd !== localSub.currentPeriodEnd) {
      const parsedPeriodEnd = new Date(remoteProviderData.currentPeriodEnd);
      if (isNaN(parsedPeriodEnd.getTime())) {
        return {
          inSync: false,
          discrepancyType: 'period_mismatch',
          resolutionApplied: 'manual_review_required',
          reconciledSub: { ...localSub },
          reason: `Invalid remote currentPeriodEnd format: ${remoteProviderData.currentPeriodEnd}`
        };
      }
      return {
        inSync: false,
        discrepancyType: 'period_mismatch',
        resolutionApplied: 'updated_period',
        reconciledSub: {
          ...localSub,
          currentPeriodEnd: remoteProviderData.currentPeriodEnd
        },
        reason: 'Updated currentPeriodEnd to match provider'
      };
    }

    return {
      inSync: true,
      discrepancyType: 'none',
      resolutionApplied: 'none',
      reconciledSub: { ...localSub }
    };
  },

  resolvePreservedPaidThroughDate(existingDate?: string, incomingDate?: string): string | undefined {
    return resolvePreservedPaidThroughDate(existingDate, incomingDate);
  },

  prepareManualToOnlineCheckoutTransition(
    currentSub: TenantSubscription,
    options: {
      targetPlanId?: string;
      paymentProvider?: TenantSubscription['paymentProvider'];
      providerSubscriptionId?: string;
    } = {}
  ): {
    success: boolean;
    errorCode?: string;
    message?: string;
    subscription?: TenantSubscription;
  } {
    if (!currentSub || !currentSub.tenantId || !currentSub.tenantId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_SUBSCRIPTION',
        message: 'Valid subscription with tenantId is required.'
      };
    }

    if (currentSub.status !== 'manual_active') {
      return {
        success: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        message: `Manual-to-online transition requires status manual_active, got ${currentSub.status}.`
      };
    }

    if (!this.isValidTransition(currentSub.status, 'pending_checkout')) {
      return {
        success: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        message: 'Transition from manual_active to pending_checkout is not permitted.'
      };
    }

    if (options.targetPlanId !== undefined && !options.targetPlanId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_PLAN',
        message: 'Target planId cannot be empty or whitespace.'
      };
    }

    const cleanCurrentPlanId = currentSub.planId?.trim() || '';
    const cleanTargetPlanId = options.targetPlanId !== undefined ? options.targetPlanId.trim() : cleanCurrentPlanId;
    if (!cleanTargetPlanId) {
      return {
        success: false,
        errorCode: 'MISSING_PLAN_ID',
        message: 'Target planId is required for checkout transition.'
      };
    }

    const resolvedTargetPlan = planService.getPlan(cleanTargetPlanId);
    if (!resolvedTargetPlan || resolvedTargetPlan.isActive === false) {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_PLAN',
        message: `Target planId '${cleanTargetPlanId}' is not active in the plan catalog.`
      };
    }

    const isDifferentTargetPlan = cleanTargetPlanId.toLowerCase() !== cleanCurrentPlanId.toLowerCase();
    if (isDifferentTargetPlan && cleanTargetPlanId.toLowerCase() === 'standart') {
      return {
        success: false,
        errorCode: 'INVALID_TARGET_PLAN',
        message: `Legacy plan '${cleanTargetPlanId}' cannot be newly assigned during online checkout transition.`
      };
    }

    const preservedPaidThroughDate = resolvePreservedPaidThroughDate(
      currentSub.paidThroughDate,
      currentSub.currentPeriodEnd
    );

    const nextSub: TenantSubscription = {
      ...currentSub,
      status: 'pending_checkout',
      planId: cleanCurrentPlanId || cleanTargetPlanId,
      scheduledPlanId: isDifferentTargetPlan ? cleanTargetPlanId : currentSub.scheduledPlanId,
      planChangeStatus: isDifferentTargetPlan ? 'upgrade_pending' : currentSub.planChangeStatus ?? 'none',
      paymentProvider: options.paymentProvider || 'iyzico',
      providerSubscriptionId: options.providerSubscriptionId?.trim() || currentSub.providerSubscriptionId,
      paidThroughDate: preservedPaidThroughDate,
      manualActivationReason: currentSub.manualActivationReason?.trim() || 'legacy_manual_active',
      cancelAtPeriodEnd: false
    };

    return {
      success: true,
      subscription: nextSub
    };
  },

  rollbackManualCheckoutToManualActive(
    currentSub: TenantSubscription,
    reason: string
  ): {
    success: boolean;
    errorCode?: string;
    message?: string;
    subscription?: TenantSubscription;
  } {
    if (!currentSub || !currentSub.tenantId || !currentSub.tenantId.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_SUBSCRIPTION',
        message: 'Valid subscription with tenantId is required for rollback.'
      };
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cleanReason) {
      return {
        success: false,
        errorCode: 'MISSING_ROLLBACK_REASON',
        message: 'Explicit non-empty rollback reason is required.'
      };
    }

    if (currentSub.status !== 'pending_checkout') {
      return {
        success: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        message: `Rollback to manual_active is only allowed from pending_checkout, got ${currentSub.status}.`
      };
    }

    if (currentSub.lastPaymentStatus === 'paid') {
      return {
        success: false,
        errorCode: 'CHECKOUT_ALREADY_SETTLED',
        message: 'Cannot rollback checkout after online payment has settled.'
      };
    }

    const hasManualOrigin = Boolean(
      (currentSub.manualActivationReason && currentSub.manualActivationReason.trim()) ||
      (currentSub.paymentReferenceNote && currentSub.paymentReferenceNote.trim())
    );
    if (!hasManualOrigin) {
      return {
        success: false,
        errorCode: 'NOT_A_MANUAL_ORIGIN_CHECKOUT',
        message: 'Cannot rollback non-manual checkout to manual_active.'
      };
    }

    const existingNotes = currentSub.setupNotes?.trim();
    const rollbackNote = `rollback_to_manual_active: ${cleanReason}`;
    const mergedNotes = existingNotes ? `${existingNotes} | ${rollbackNote}` : rollbackNote;

    const restoredProvider: TenantSubscription['paymentProvider'] =
      currentSub.paymentProvider === 'iyzico' || currentSub.paymentProvider === 'stripe'
        ? 'offline_payment'
        : currentSub.paymentProvider || 'offline_payment';

    const restoredSub: TenantSubscription = {
      ...currentSub,
      status: 'manual_active',
      planId: currentSub.planId,
      scheduledPlanId: undefined,
      planChangeStatus: 'none',
      paymentProvider: restoredProvider,
      providerSubscriptionId: undefined,
      setupNotes: mergedNotes
    };

    return {
      success: true,
      subscription: restoredSub
    };
  }
};
