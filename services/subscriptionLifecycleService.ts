import { SubscriptionStatus, TenantSubscription } from './subscriptionService';
import { planService } from './planService';

export interface WebhookEventRecord {
  providerEventId: string;
  eventType: string;
  tenantId: string;
  subscriptionReferenceCode: string;
  processedAt: string;
}

export interface TransitionResult {
  success: boolean;
  errorCode?: string;
  message: string;
  subscription?: TenantSubscription;
  duplicate?: boolean;
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
}

export interface StorageAdapter {
  getSubscriptionByReference(refCode: string): Promise<TenantSubscription | null>;
  saveSubscription(subscription: TenantSubscription): Promise<void>;
  hasProcessedEvent(providerEventId: string): Promise<boolean>;
  recordProcessedEvent(record: WebhookEventRecord): Promise<void>;
}

// In-Memory Storage Adapter for deterministic offline tests and fallback
export class InMemoryStorageAdapter implements StorageAdapter {
  private subscriptions: Map<string, TenantSubscription> = new Map();
  private processedEvents: Map<string, WebhookEventRecord> = new Map();

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
      manual_active: ['active', 'cancelled', 'expired'],
      cancelled: [], // Terminal
      expired: [], // Terminal
      none: ['pending_checkout', 'trialing', 'active']
    };

    const allowed = allowedTransitions[currentStatus] || [];
    return allowed.includes(targetStatus);
  },

  // Map incoming verified webhook event to target subscription status
  mapEventToTargetStatus(eventType: string, providerStatus?: string): SubscriptionStatus | null {
    if (eventType === 'subscription.active' || eventType === 'subscription.created' || eventType === 'subscription.renewed' || providerStatus === 'ACTIVE') {
      return 'active';
    }
    if (eventType === 'subscription.past_due' || eventType === 'subscription.failed' || providerStatus === 'PAST_DUE' || providerStatus === 'UNPAID') {
      return 'past_due';
    }
    if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired' || providerStatus === 'CANCELED' || providerStatus === 'EXPIRED') {
      return 'cancelled';
    }
    return null;
  },

  // Process incoming verified webhook with full integrity assertions
  async processVerifiedWebhook(
    payload: WebhookPayloadInput,
    storage: StorageAdapter,
    isSignatureVerified: boolean
  ): Promise<TransitionResult> {
    // 1. Signature requirement invariant
    if (!isSignatureVerified) {
      return {
        success: false,
        errorCode: 'UNVERIFIED_WEBHOOK',
        message: 'Cryptographic signature is missing or unverified. State mutation rejected.'
      };
    }

    // 2. Idempotency check: duplicate event rejection
    const isDuplicate = await storage.hasProcessedEvent(payload.providerEventId);
    if (isDuplicate) {
      return {
        success: true,
        duplicate: true,
        message: `Duplicate webhook event (${payload.providerEventId}) ignored idempotently.`
      };
    }

    // 3. Subscription lookup
    if (!payload.subscriptionReferenceCode) {
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

    // 4. Customer / Tenant mismatch detection
    const payloadCustomer = payload.customerReferenceCode || payload.tenantId;
    if (payloadCustomer && existingSub.tenantId && payloadCustomer !== existingSub.tenantId) {
      return {
        success: false,
        errorCode: 'TENANT_MISMATCH',
        message: `Tenant mismatch: payload references ${payloadCustomer} but subscription belongs to ${existingSub.tenantId}`
      };
    }

    // 5. Target status mapping
    const targetStatus = this.mapEventToTargetStatus(payload.eventType, payload.status);
    if (!targetStatus) {
      return {
        success: false,
        errorCode: 'UNKNOWN_EVENT_TYPE',
        message: `Unsupported event type: ${payload.eventType}`
      };
    }

    // 6. Out-of-order & state machine transition validation
    if (!this.isValidTransition(existingSub.status, targetStatus)) {
      return {
        success: false,
        errorCode: 'INVALID_TRANSITION_OUT_OF_ORDER',
        message: `Cannot transition subscription from ${existingSub.status} to ${targetStatus} (out-of-order or terminal).`
      };
    }

    // 7. Apply transition
    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: targetStatus,
      paidThroughDate: targetStatus === 'active'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : existingSub.paidThroughDate,
      lastPaymentStatus: targetStatus === 'active' ? 'paid' : (targetStatus === 'past_due' ? 'failed' : existingSub.lastPaymentStatus)
    };

    // 8. Record audit idempotency event first (fail-safe)
    await storage.recordProcessedEvent({
      providerEventId: payload.providerEventId,
      eventType: payload.eventType,
      tenantId: existingSub.tenantId,
      subscriptionReferenceCode: payload.subscriptionReferenceCode,
      processedAt: new Date().toISOString()
    });

    // 9. Persist updated subscription
    await storage.saveSubscription(updatedSub);

    return {
      success: true,
      message: `Subscription successfully transitioned to ${targetStatus}`,
      subscription: updatedSub
    };
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
  }
};
