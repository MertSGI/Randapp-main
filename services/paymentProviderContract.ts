/**
 * Provider-Neutral Payment Domain Contract Interfaces (Phase B1 Foundation)
 * Strictly enforces integer minor units, normalized ISO uppercase currency,
 * immutable idempotency fingerprinting, provider event normalization,
 * plan upgrade/downgrade, cancel/grace period, refund, and reconciliation.
 */

export type PaymentPurpose = 'subscription' | 'appointment_deposit' | 'invoice' | 'custom';

export type PaymentIntentStatus =
  | 'created'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface PaymentMoney {
  amountMinor: number; // Integer > 0 (e.g. 10000 = 100.00 TRY)
  currency: string;    // ISO 4217 uppercase 3-letter code (e.g. 'TRY', 'USD', 'EUR')
}

export interface CreatePaymentIntentParams {
  tenantId: string;
  purpose: PaymentPurpose;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntent {
  id: string;
  tenantId: string;
  purpose: PaymentPurpose;
  amountMinor: number;
  currency: string;
  status: PaymentIntentStatus;
  idempotencyKey: string;
  requestFingerprint: string;
  providerId?: string;
  providerReference?: string;
  resourceId?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedNormalizedPaymentEvent {
  provider: string;
  providerEventId: string;
  eventType: string;
  eventTimestamp?: string;
  rawPayloadHash: string;
  intentId?: string;
  providerReference?: string;
  status?: PaymentIntentStatus;
  tenantId?: string;
  amountMinor?: number;
  currency?: string;
  purpose?: PaymentPurpose;
  errorCode?: string;
  errorMessage?: string;
}

export interface RefundRequest {
  tenantId: string;
  intentId?: string;
  paymentId?: string;
  amountMinor: number; // Integer > 0
  currency: string;    // ISO 4217 uppercase 3-letter code
  reason?: string;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  refundId: string;
  intentId?: string;
  paymentId?: string;
  amountMinor: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending';
  providerReference?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface PlanChangeRequest {
  tenantId: string;
  currentPlanId: string;
  targetPlanId: string;
  timing: 'immediate' | 'period_end';
  prorationAmountMinor?: number;
  currency?: string;
  idempotencyKey?: string;
}

export interface PlanChangeResult {
  success: boolean;
  tenantId: string;
  previousPlanId: string;
  activePlanId: string;
  scheduledPlanId?: string;
  planChangeStatus: 'none' | 'upgrade_pending' | 'downgrade_scheduled';
  effectiveDate: string;
  prorationAppliedMinor?: number;
  message: string;
  errorCode?: string;
}

export interface GracePeriodEvaluation {
  inGracePeriod: boolean;
  daysRemaining: number;
  expired: boolean;
  gracePeriodDays: number;
  graceEndDate?: string;
  status: 'active' | 'in_grace' | 'expired';
}

export type ReconciliationDiscrepancyType =
  | 'status_mismatch'
  | 'period_mismatch'
  | 'plan_mismatch'
  | 'untracked_remote'
  | 'local_only'
  | 'none';

export interface ReconciliationRecord {
  tenantId: string;
  providerSubscriptionId: string;
  localStatus: string;
  providerStatus: string;
  inSync: boolean;
  discrepancyType: ReconciliationDiscrepancyType;
  reconciledAt: string;
  resolutionApplied?: 'none' | 'updated_local_status' | 'updated_period' | 'manual_review_required';
  notes?: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: string;

  /**
   * Verifies incoming webhook/callback signature without mutating DB state.
   */
  verifyWebhook(headers: Record<string, string>, rawPayload: string): Promise<boolean>;

  /**
   * Normalizes raw verified payload into canonical provider-neutral structure.
   */
  normalizeEvent(rawPayload: string): VerifiedNormalizedPaymentEvent;

  /**
   * Optional intent creation
   */
  createPaymentIntent?(params: CreatePaymentIntentParams): Promise<PaymentIntent>;

  /**
   * Optional refund execution
   */
  processRefund?(request: RefundRequest): Promise<RefundResult>;

  /**
   * Optional subscription reconciliation
   */
  reconcileSubscription?(tenantId: string, providerSubscriptionId: string): Promise<ReconciliationRecord>;
}

export interface VerifiedWebhookEnvelope {
  rawPayload: string;
  headers: Record<string, string>;
  provider: Pick<PaymentProviderAdapter, 'verifyWebhook'> & Partial<Pick<PaymentProviderAdapter, 'normalizeEvent'>>;
}

/**
 * Deterministic canonical JSON serialization with recursive key sorting
 * so idempotency fingerprints are invariant to object property insertion order.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item === undefined ? null : item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(',')}}`;
}

/**
 * Validates integer minor units and uppercase ISO currency code
 */
export function validatePaymentMoney(amountMinor: number, currency: string): { valid: boolean; error?: string } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { valid: false, error: 'amountMinor must be a positive integer' };
  }
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    return { valid: false, error: 'currency must be an uppercase 3-letter ISO 4217 code (e.g. TRY, USD, EUR)' };
  }
  return { valid: true };
}

export const SIGNED_EVENT_TIMESTAMP_ALIASES = ['eventTimestamp', 'eventTime', 'timestamp', 'createdDate'] as const;

export const DEFAULT_PLAN_TIER_ORDER: Record<string, number> = {
  baslangic: 1,
  standart: 2,
  professional: 3,
  premium: 4,
  kurumsal: 5
};

/**
 * Resolves a plan's rank monotonically using fixed tier ordering first, falling back to monthlyPrice.
 */
export function getPlanRankFromCatalog(
  planId: string,
  lookupPlan: (id: string) => { id: string; monthlyPrice: number; isActive?: boolean } | undefined
): number | null {
  const plan = lookupPlan(planId);
  if (!plan || plan.isActive === false) return null;
  if (DEFAULT_PLAN_TIER_ORDER[plan.id] !== undefined) {
    return DEFAULT_PLAN_TIER_ORDER[plan.id];
  }
  return plan.monthlyPrice;
}

/**
 * Resolves and validates signed event timestamp across canonical & provider alias fields
 * (eventTimestamp, eventTime, timestamp, createdDate).
 * Rejects malformed timestamps or conflicting multi-alias timestamp values.
 */
export function resolveSignedEventTimestamp(rawObj: Record<string, unknown>): {
  valid: boolean;
  timestamp?: string;
  errorCode?: 'INVALID_EVENT_TIMESTAMP';
  message?: string;
} {
  const resolved: Array<{ key: string; ms: number; iso: string }> = [];

  for (const key of SIGNED_EVENT_TIMESTAMP_ALIASES) {
    const rawVal = rawObj[key];
    if (rawVal === undefined) continue;

    let parsedMs = NaN;
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if (!trimmed) {
        return {
          valid: false,
          errorCode: 'INVALID_EVENT_TIMESTAMP',
          message: `Signed payload contains empty timestamp field '${key}'.`
        };
      }
      parsedMs = Date.parse(trimmed);
    } else if (typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal > 0) {
      parsedMs = rawVal < 1e11 ? rawVal * 1000 : rawVal;
    } else {
      return {
        valid: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Signed payload contains invalid timestamp field '${key}'.`
      };
    }

    if (Number.isNaN(parsedMs)) {
      return {
        valid: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Signed payload contains unparseable timestamp field '${key}'.`
      };
    }

    resolved.push({
      key,
      ms: parsedMs,
      iso: new Date(parsedMs).toISOString()
    });
  }

  if (resolved.length === 0) {
    return { valid: true, timestamp: undefined };
  }

  const first = resolved[0];
  for (let i = 1; i < resolved.length; i++) {
    const cur = resolved[i];
    if (cur.ms !== first.ms || cur.iso !== first.iso) {
      return {
        valid: false,
        errorCode: 'INVALID_EVENT_TIMESTAMP',
        message: `Conflicting signed timestamp fields '${first.key}' (${first.iso}) and '${cur.key}' (${cur.iso}).`
      };
    }
  }

  return { valid: true, timestamp: first.iso };
}
