/**
 * Provider-Neutral Payment Domain Contract Interfaces (Phase 3 Foundation)
 * Strictly enforces integer minor units, normalized ISO uppercase currency,
 * immutable idempotency fingerprinting, and provider event normalization.
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
  amountMinor: number; // Integer > 0
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
  eventTimestamp: string;
  rawPayloadHash: string;
  intentId?: string;
  providerReference?: string;
  status?: PaymentIntentStatus;
  errorCode?: string;
  errorMessage?: string;
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
}
