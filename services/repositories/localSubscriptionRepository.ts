import { SubscriptionRepository } from './types';

export class LocalSubscriptionRepository implements SubscriptionRepository {
  async getSubscription(tenantId: string): Promise<any> {
    const raw = localStorage.getItem(`mock_subscription_${tenantId}`);
    if (raw) return JSON.parse(raw);
    return {
      tenantId,
      planId: 'free',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async createPendingCheckout(tenantId: string, planId: string): Promise<any> {
    console.log(`[LocalSubscriptionRepository] createPendingCheckout for tenant ${tenantId}, plan ${planId}`);
    return { id: `chk_${Date.now()}`, status: 'pending' };
  }

  async updateSubscriptionStatus(tenantId: string, status: string): Promise<void> {
    const sub = await this.getSubscription(tenantId);
    sub.status = status;
    sub.updatedAt = new Date().toISOString();
    localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
  }

  async listPaymentEvents(tenantId: string): Promise<any[]> {
    return [];
  }

  async updateManualSubscription(tenantId: string, options: any): Promise<any> {
    const sub = await this.getSubscription(tenantId);
    const updated = {
      ...sub,
      planId: options.planId || sub.planId,
      status: options.status || sub.status,
      billingSource: options.billingSource,
      paidThroughDate: options.paidThroughDate,
      paymentReferenceNote: options.paymentReferenceNote,
      nextManualReviewAt: options.nextManualReviewAt,
      manualActivationReason: options.manualActivationReason,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(updated));
    return updated;
  }
}
