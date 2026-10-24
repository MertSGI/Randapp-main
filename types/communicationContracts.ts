/**
 * Safe Communication Delivery Contracts (Phase E)
 * Explicit, typed domain contracts for outbox intent lifecycle,
 * dispatch attempts, provider receipts, error taxonomy, and retry policies.
 */

export type DeliveryState =
  | 'rendered'
  | 'queued'
  | 'accepted_by_provider'
  | 'delivered'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type CommunicationChannelType = 'sms' | 'whatsapp' | 'email' | 'in_app';

export interface ConsentDecision {
  allowed: boolean;
  reason?: string;
  consentType: 'transactional' | 'marketing';
  timestamp: string;
}

export interface OutboxIntent {
  intentId: string;
  tenantId: string;
  branchId?: string;
  channel: CommunicationChannelType;
  recipient: string;
  templateId: string;
  templateArgs: Record<string, string | number>;
  subject?: string;
  body: string;
  status: DeliveryState;
  consentVerified: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  metadata?: Record<string, any>;
}

export interface DispatchAttempt {
  attemptId: string;
  intentId: string;
  tenantId: string;
  providerName: string;
  attemptNumber: number;
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected' | 'failed';
  httpStatusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  retryAfterMs?: number;
}

export interface ProviderAcceptanceReceipt {
  receiptId: string;
  intentId: string;
  providerMessageId: string;
  providerName: string;
  acceptedAt: string;
  signatureVerified: boolean;
  rawProviderStatus?: string;
}

export interface ProviderDeliveryReceipt {
  receiptId: string;
  intentId: string;
  providerMessageId: string;
  providerName: string;
  deliveredAt: string;
  signatureVerified: boolean;
  carrierMetadata?: Record<string, any>;
}

export type FailureType =
  | 'PERMANENT'
  | 'RETRYABLE'
  | 'RATE_LIMITED'
  | 'POISON_MESSAGE'
  | 'TENANT_MISMATCH'
  | 'CONSENT_DENIED'
  | 'RETRY_EXHAUSTED'
  | 'INVALID_SIGNATURE'
  | 'REPLAY_REJECTED'
  | 'CHANNEL_DISABLED';

export interface DeliveryFailure {
  intentId: string;
  failureType: FailureType;
  reason: string;
  code: string;
  attemptCount: number;
  terminal: boolean;
  timestamp: string;
}

export interface RetryPolicyConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 30000,
  backoffMultiplier: 2
};

export class CommunicationRetryPolicy {
  constructor(private config: RetryPolicyConfig = DEFAULT_RETRY_POLICY) {}

  get maxAttempts(): number {
    return this.config.maxAttempts;
  }

  isRetryable(statusCode?: number, errorCode?: string): boolean {
    if (statusCode === 429) return true;
    if (statusCode && statusCode >= 500 && statusCode < 600) return true;
    if (errorCode === 'NETWORK_TIMEOUT' || errorCode === 'CONNECTION_RESET') return true;
    return false;
  }

  calculateBackoff(attemptNumber: number, retryAfterHeaderMs?: number): number {
    if (retryAfterHeaderMs && retryAfterHeaderMs > 0) {
      return Math.min(retryAfterHeaderMs, this.config.maxBackoffMs);
    }
    const backoff = this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attemptNumber - 1);
    return Math.min(backoff, this.config.maxBackoffMs);
  }
}
