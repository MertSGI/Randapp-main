import { supabase } from './supabaseClient';
import { dataProvider } from './dataProvider';
import { planService, PricingPlan } from './planService';
import { communicationEventService } from './communicationEventService';


export type SubscriptionStatus = 
  | 'pending_checkout' 
  | 'trialing' 
  | 'active' 
  | 'past_due' 
  | 'cancelled' 
  | 'paused' 
  | 'suspended' 
  | 'comped' 
  | 'manual_active' 
  | 'expired' 
  | 'none';

export interface TenantSubscription {
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  trialStart?: string;
  trialEnd?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  paymentProvider?: string;
  providerSubscriptionId?: string;
  lastPaymentStatus?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  setupNotes?: string;
  referralCredits?: number;
  planChangeStatus?: 'none' | 'upgrade_pending' | 'downgrade_scheduled' | 'cancelled_at_period_end' | 'manual_review_required';
  scheduledPlanId?: string;
  paidThroughDate?: string;
  manualActivationReason?: string;
  paymentReferenceNote?: string;
  nextManualReviewAt?: string;
}

export interface TenantUsage {
  staffCount: number;
  serviceCount: number;
  monthlyAppointmentsCount: number;
  aiUsageCount: number;
}

export const subscriptionService = {
  async getCurrentSubscription(tenantId: string): Promise<TenantSubscription | null> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    
    if (mode === 'supabase') {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching subscription:", error);
        return null;
      }
      if (data) {
        return {
          tenantId: data.tenant_id,
          planId: data.plan_id,
          status: data.status,
          trialStart: data.trial_start,
          trialEnd: data.trial_end,
          currentPeriodStart: data.current_period_start,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
          paymentProvider: data.provider,
          providerSubscriptionId: data.provider_subscription_id
        };
      }
      return null;
    }

    // Mock Mode
    const saved = localStorage.getItem(`mock_subscription_${tenantId}`);
    if (saved) {
      return JSON.parse(saved);
    }
    const dataProvSaved = await dataProvider.get<any>(`randapp:${tenantId}:subscription`);
    if (dataProvSaved) {
       return dataProvSaved;
    }
    
    return {
      tenantId,
      planId: 'professional',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
      cancelAtPeriodEnd: false,
      paymentProvider: 'mock'
    };
  },

  async getPlanForTenant(tenantId: string): Promise<PricingPlan | null> {
    const sub = await this.getCurrentSubscription(tenantId);
    let planId = sub ? sub.planId : 'starter';
    const plan = planService.getPlan(planId) || planService.getPlan('starter');
    return plan as PricingPlan;
  },

  async getTenantUsage(tenantId: string): Promise<TenantUsage> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';

    if (mode === 'supabase') {
      return {
        staffCount: 2,
        serviceCount: 5,
        monthlyAppointmentsCount: 120,
        aiUsageCount: 42
      };
    }

    // Mock Mode
    const staffList = (await dataProvider.get<any[]>(`randapp:${tenantId}:staff`)) || [];
    const servicesList = (await dataProvider.get<any[]>(`randapp:${tenantId}:services`)) || [];
    const aiUsage = parseInt(localStorage.getItem('mock_ai_usage') || '0', 10);
    
    return {
      staffCount: staffList.length,
      serviceCount: servicesList.length,
      monthlyAppointmentsCount: 45,
      aiUsageCount: aiUsage
    };
  },

  async canAddStaff(tenantId: string): Promise<boolean> {
    const { entitlementService } = await import('./entitlementService');
    const plan = await this.getPlanForTenant(tenantId);
    const usage = await this.getTenantUsage(tenantId);
    if (!plan) return false;
    const max = entitlementService.getLimit(plan.id, 'maxStaff');
    if (max === -1) return true; // unlimited
    return usage.staffCount < max;
  },

  async canAddService(tenantId: string): Promise<boolean> {
    const { entitlementService } = await import('./entitlementService');
    const plan = await this.getPlanForTenant(tenantId);
    const usage = await this.getTenantUsage(tenantId);
    if (!plan) return false;
    const max = entitlementService.getLimit(plan.id, 'maxServices');
    if (max === -1) return true;
    return usage.serviceCount < max;
  },

  async canCreateAppointment(tenantId: string): Promise<boolean> {
    const plan = await this.getPlanForTenant(tenantId);
    const usage = await this.getTenantUsage(tenantId);
    if (!plan) return false;
    // Monthly appointments count is not explicitly limited in the new packages, but keeping existing logic if needed
    // The previous packages had maxMonthlyAppointments. New ones have it unlimited except maybe basic.
    return usage.monthlyAppointmentsCount < plan.maxMonthlyAppointments;
  },

  async isFeatureEnabled(tenantId: string, featureKey: keyof PricingPlan): Promise<boolean> {
    const plan = await this.getPlanForTenant(tenantId);
    if (!plan) return false;
    return Boolean(plan[featureKey]);
  },

  async startCheckout(tenantId: string, planId: string, customer?: any): Promise<string> {
    const { paymentRunModeService } = await import('./paymentRunModeService');
    const runModeStatus = paymentRunModeService.getStatus();
    
    if (runModeStatus.mode === 'local_dry_run') {
        const simUrl = paymentRunModeService.simulateCheckoutHandoff(tenantId, planId, '');
        
        // Before returning the URL, let's also seed the mock state appropriately if no UI action is taken
        const plan = planService.getPlan(planId);
        if (plan) {
            const mockSub: TenantSubscription = {
                tenantId,
                planId,
                status: 'trialing',
                trialStart: new Date().toISOString(),
                trialEnd: plan.trialDays ? new Date(new Date().setDate(new Date().getDate() + plan.trialDays)).toISOString() : new Date().toISOString(),
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
                cancelAtPeriodEnd: false,
                paymentProvider: 'local_dry_run'
            };
            localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(mockSub));
            await dataProvider.set(`randapp:${tenantId}:subscription`, mockSub);
        }
        
        return simUrl;
    }

    if (runModeStatus.mode === 'sandbox_live' || runModeStatus.mode === 'production_live') {
      if (runModeStatus.mode === 'sandbox_live' && !runModeStatus.canRunCheckout) {
          throw {
              isSafeStructure: true,
              message: 'Sistem sandbox testine hazır değil (eksik yapılandırmalar var). Lütfen Super Admin panelini kontrol edin.',
              errorCode: 'SANDBOX_NOT_CONFIGURED',
              raw: { blockers: runModeStatus.missingBlockers }
          };
      }

      try {
        console.log(`[${runModeStatus.mode}] Calling POST /functions/v1/create-checkout-session`);
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            tenantId,
            planId,
            billingCycle: customer?.billingPeriod || 'monthly', // default
            successUrl: `${window.location.origin}/#/admin?tab=kurulum&checkout=success`,
            cancelUrl: `${window.location.origin}/#/admin?tab=abonelik&checkout=cancelled`,
            customer
          }
        });

        if (error) {
           let parsedError = error;
           try {
             if (error.context && typeof error.context.json === 'function') {
                const body = await error.context.json();
                parsedError = body;
             }
           } catch(e) {}
           
           throw {
             isSafeStructure: true,
             message: parsedError?.message || error.message || 'Ödeme oturumu oluşturulamadı. Lütfen sistem yöneticisiyle iletişime geçin.',
             errorCode: parsedError?.errorCode || 'UNKNOWN_CHECKOUT_ERROR',
             raw: parsedError
           };
        }
        
        if (data?.error) {
          throw {
             isSafeStructure: true,
             message: data.message || data.error || 'Ödeme oturumu oluşturulamadı. Lütfen sistem yöneticisiyle iletişime geçin.',
             errorCode: data.errorCode || 'UNKNOWN_CHECKOUT_ERROR',
             raw: data
          };
        }

        if (data?.mode === 'sandbox_not_configured') {
           throw {
             isSafeStructure: true,
             message: data.message || 'Payment provider sandbox is not configured.',
             errorCode: 'SANDBOX_NOT_CONFIGURED',
             raw: data
           };
        }

        if (data?.checkoutUrl) {
          return data.checkoutUrl;
        } else {
          throw {
            isSafeStructure: true,
            message: 'Ödeme oturumu URL döndürmedi. Lütfen sistem yöneticisiyle iletişime geçin.',
            errorCode: 'MISSING_CHECKOUT_URL',
            raw: data
          };
        }
      } catch (err: any) {
        console.error("Checkout session error:", err);
        if (err.isSafeStructure) {
          throw err;
        }
        throw {
          isSafeStructure: true,
          message: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
          errorCode: 'UNEXPECTED_ERROR',
          raw: err
        };
      }
    }
    
    return '';
  },

  async openBillingPortal(tenantId: string): Promise<void> {
    const paymentProvider = (import.meta as any).env.VITE_PAYMENT_PROVIDER || 'mock';
    
    if (paymentProvider !== 'mock') {
      try {
        console.log(`[${paymentProvider} Mode] Calling POST /functions/v1/create-billing-portal-session`);
        const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
          body: {
            tenantId,
            returnUrl: window.location.origin
          }
        });

        if (error) throw error;
        
        if (data?.portalUrl) {
          if (data.note) alert(data.note);
          if (data.portalUrl.startsWith('http') || data.portalUrl.startsWith('/')) {
              window.location.href = data.portalUrl;
          }
        } else {
          alert('Portal olusturulamadi.');
        }
      } catch (err: any) {
        console.error("Billing portal error:", err);
        alert('Portal başlatılırken bir hata oluştu: ' + err.message);
      }
      return;
    }

    // Mock Mode
    console.log(`[Mock Mode] Opening billing portal for ${tenantId}`);
    alert(`[Demo] Fatura portalı açılıyor. Geçmiş faturalarınız listelenebilir.`);
  },

  async getSubscriptionState(tenantId: string): Promise<TenantSubscription | null> {
    return this.getCurrentSubscription(tenantId);
  },

  async canTenantPublish(tenantId: string): Promise<boolean> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (!sub) return false;
    return ['active', 'trialing', 'manual_active', 'comped'].includes(sub.status);
  },

  async canTenantAcceptBookings(tenantId: string): Promise<boolean> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (!sub) return false;
    if (['paused', 'suspended', 'expired', 'none', 'pending_checkout'].includes(sub.status)) {
      return false;
    }
    return true;
  },

  async startTrialAfterCheckout(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId) || {
      tenantId,
      planId: 'professional',
      status: 'pending_checkout',
      cancelAtPeriodEnd: false
    };
    sub.status = 'trialing';
    sub.trialStart = new Date().toISOString();
    sub.trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    sub.currentPeriodStart = new Date().toISOString();
    sub.currentPeriodEnd = sub.trialEnd;
    localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
    await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

    // Queue Trial Started communication event
    try {
      communicationEventService.queueCommunicationEvent({
        tenantId,
        subscriptionId: sub.planId,
        audience: 'business_owner',
        channel: 'email',
        type: 'trial_started',
        contextArgs: {
          ownerName: 'İşletme Yetkilisi',
          businessName: tenantId,
          planName: sub.planId.toUpperCase()
        }
      });
    } catch (e) {
      console.error('Subscription outbox event hook error:', e);
    }

    return sub;
  },

  async activateManualSubscription(tenantId: string, options: Partial<TenantSubscription>): Promise<TenantSubscription> {
    const sub: TenantSubscription = {
      tenantId,
      planId: options.planId || 'standart',
      status: (options.status as any) || 'manual_active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: options.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: options.cancelAtPeriodEnd || false,
      paymentProvider: options.paymentProvider || 'offline_payment',
      discountType: options.discountType,
      discountValue: options.discountValue,
      setupNotes: options.setupNotes,
      referralCredits: options.referralCredits
    };
    localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
    await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

    // Queue Manual Subscriber communication event
    try {
      communicationEventService.queueCommunicationEvent({
        tenantId,
        subscriptionId: sub.planId,
        audience: 'business_owner',
        channel: 'email',
        type: 'manual_subscription_activated',
        contextArgs: {
          ownerName: 'İşletme Yetkilisi',
          businessName: tenantId,
          planName: sub.planId.toUpperCase()
        }
      });
    } catch (e) {
      console.error('Manual activation outbox hook error:', e);
    }

    return sub;
  },

  async applyReferralCredit(tenantId: string, months: number): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.referralCredits = (sub.referralCredits || 0) + months;
      const currentEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date();
      currentEnd.setMonth(currentEnd.getMonth() + months);
      sub.currentPeriodEnd = currentEnd.toISOString();
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Credit Awarded communication event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'business_owner',
          channel: 'in_app',
          type: 'referral_credit_awarded',
          contextArgs: {
            months: months
          }
        });
      } catch (e) {
        console.error('Referral award outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async applyManualDiscount(tenantId: string, discount: { type: 'percentage' | 'fixed'; value: number }): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.discountType = discount.type;
      sub.discountValue = discount.value;
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);
      return sub;
    }
    throw new Error('Subscription not found');
  },

  async schedulePlanChange(tenantId: string, targetPlanId: string, timing: 'immediate' | 'period_end'): Promise<TenantSubscription> {
    if (timing === 'immediate') {
      return this.upgradePlanNow(tenantId, targetPlanId);
    } else {
      return this.scheduleDowngradeAtPeriodEnd(tenantId, targetPlanId);
    }
  },

  async upgradePlanNow(tenantId: string, targetPlanId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.planId = targetPlanId;
      sub.planChangeStatus = 'none';
      sub.scheduledPlanId = undefined;
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Upgrade Success event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'plan_upgraded',
          contextArgs: {
            businessName: tenantId,
            newPlanName: targetPlanId.toUpperCase()
          }
        });
      } catch (e) {
        console.error('Plan upgrade outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async scheduleDowngradeAtPeriodEnd(tenantId: string, targetPlanId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.planChangeStatus = 'downgrade_scheduled';
      sub.scheduledPlanId = targetPlanId;
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Downgrade Scheduled event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'in_app',
          type: 'plan_downgrade_scheduled',
          contextArgs: {
            newPlanName: targetPlanId.toUpperCase()
          }
        });
      } catch (e) {
        console.error('Plan downgrade outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async cancelAtPeriodEnd(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.cancelAtPeriodEnd = true;
      sub.planChangeStatus = 'cancelled_at_period_end';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Period End Cancellation event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'subscription_cancelled_period_end',
          contextArgs: {
            businessName: tenantId
          }
        });
      } catch (e) {
        console.error('Period end cancel outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async cancelImmediately(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.status = 'cancelled';
      sub.cancelAtPeriodEnd = false;
      sub.planChangeStatus = 'none';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Immediate Deactivation event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'subscription_cancelled_immediate',
          contextArgs: {}
        });
      } catch (e) {
        console.error('Immediate cancellation outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async pauseSubscription(tenantId: string, reason?: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.status = 'paused';
      sub.setupNotes = reason || 'User paused';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Suspend Paused event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'subscription_paused',
          contextArgs: {
            businessName: tenantId
          }
        });
      } catch (e) {
        console.error('Pause subscription outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async resumeSubscription(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.status = 'active';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Re-activated active subscription event
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'subscription_active',
          contextArgs: {
            businessName: tenantId
          }
        });
      } catch (e) {
        console.error('Resume subscription outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async markPastDue(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.status = 'past_due';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);

      // Queue Past Due invoice retry alert
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          subscriptionId: sub.planId,
          audience: 'business_owner',
          channel: 'email',
          type: 'subscription_past_due',
          contextArgs: {
            ownerName: 'İşletme Yetkilisi',
            businessName: tenantId
          }
        });
      } catch (e) {
        console.error('Past due subscription outbox hook error:', e);
      }

      return sub;
    }
    throw new Error('Subscription not found');
  },

  async expireSubscription(tenantId: string): Promise<TenantSubscription> {
    const sub = await this.getCurrentSubscription(tenantId);
    if (sub) {
      sub.status = 'expired';
      localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(sub));
      await dataProvider.set(`randapp:${tenantId}:subscription`, sub);
      return sub;
    }
    throw new Error('Subscription not found');
  },

  async fetchUsageStats(tenantId: string): Promise<TenantUsage> {
    return this.getTenantUsage(tenantId);
  },

  async grantFreeDiscountMonths(tenantId: string, months: number, reason?: string): Promise<TenantSubscription> {
    return this.applyReferralCredit(tenantId, months);
  },

  async getEffectiveEntitlements(tenantId: string): Promise<any> {
    const sub = await this.getCurrentSubscription(tenantId);
    const planId = sub ? sub.planId : 'baslangic';
    const { entitlementService } = await import('./entitlementService');
    const entitlements = entitlementService.getPlanEntitlements(planId);
    const isActive = sub ? ['active', 'trialing', 'manual_active', 'comped'].includes(sub.status) : false;
    return {
      ...entitlements,
      features: {
        ...entitlements.features,
        website_publication: isActive && entitlements.features.website_publication,
        online_booking: isActive && entitlements.features.online_booking,
      }
    };
  }
};
