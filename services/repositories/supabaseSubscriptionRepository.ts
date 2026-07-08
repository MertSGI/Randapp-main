import { SubscriptionRepository } from './types';
import { fetchSupabase } from './supabaseClient';

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  async getSubscription(tenantId: string): Promise<any> {
    try {
      const res = await fetchSupabase(`/rest/v1/subscriptions?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data[0]) return null;
      const s = data[0];
      return {
        id: s.id,
        tenantId: s.tenant_id,
        planId: s.plan_id,
        status: s.status,
        billingSource: s.billing_source,
        paidThroughDate: s.paid_through_date,
        paymentReferenceNote: s.payment_reference_note,
        nextManualReviewAt: s.next_manual_review_at,
        manualActivationReason: s.manual_activation_reason,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      };
    } catch {
      return null;
    }
  }

  async createPendingCheckout(tenantId: string, planId: string): Promise<any> {
    // Paymentless mode checkout simulation directly into db subscription state
    try {
      const res = await fetchSupabase('/rest/v1/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          tenant_id: tenantId,
          plan_id: planId,
          status: 'pending',
          billing_source: 'offline',
          created_at: new Date().toISOString()
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data[0];
    } catch {
      return null;
    }
  }

  async updateSubscriptionStatus(tenantId: string, status: string): Promise<void> {
    try {
      const res = await fetchSupabase(`/rest/v1/subscriptions?tenant_id=eq.${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          updated_at: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Failed to update subscription status');
    } catch (err) {
      console.error('Error in updateSubscriptionStatus:', err);
    }
  }

  async listPaymentEvents(tenantId: string): Promise<any[]> {
    try {
      const res = await fetchSupabase(`/rest/v1/payments?tenant_id=eq.${tenantId}&select=*`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  }

  async updateManualSubscription(tenantId: string, options: any): Promise<any> {
    try {
      const existing = await this.getSubscription(tenantId);
      let res;
      const body = {
        plan_id: options.planId,
        status: options.status,
        billing_source: options.billingSource,
        paid_through_date: options.paidThroughDate,
        payment_reference_note: options.paymentReferenceNote,
        next_manual_review_at: options.nextManualReviewAt,
        manual_activation_reason: options.manualActivationReason,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        res = await fetchSupabase(`/rest/v1/subscriptions?tenant_id=eq.${tenantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify(body)
        });
      } else {
        res = await fetchSupabase('/rest/v1/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify({
            ...body,
            tenant_id: tenantId,
            created_at: new Date().toISOString()
          })
        });
      }

      if (!res.ok) throw new Error('Supabase manual subscription update failed');
      const data = await res.json();
      const s = data[0];
      return {
        id: s.id,
        tenantId: s.tenant_id,
        planId: s.plan_id,
        status: s.status,
        billingSource: s.billing_source,
        paidThroughDate: s.paid_through_date,
        paymentReferenceNote: s.payment_reference_note,
        nextManualReviewAt: s.next_manual_review_at,
        manualActivationReason: s.manual_activation_reason,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      };
    } catch (err) {
      console.error('Error in updateManualSubscription:', err);
      throw err;
    }
  }
}
