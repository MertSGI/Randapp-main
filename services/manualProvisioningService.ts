import { Tenant } from '../types';
import { tenantService } from './tenantService';
import { siteProvisioningService } from './siteProvisioningService';
import { dataProvider } from './dataProvider';
import { communicationEventService } from './communicationEventService';
import { DYNAMIC_STORAGE_KEYS } from './storageKeys';
import { TenantSubscription } from './subscriptionService';
import { subscriptionLifecycleService } from './subscriptionLifecycleService';

let manualTenantSequence = 0;

const CLIENT_SIMULATION_MODES = new Set(['mock', 'local', 'demo']);

function getRuntimeDataMode(): string {
  const processMode =
    typeof process !== 'undefined' && process.env ? process.env.VITE_DATA_MODE : undefined;
  const metaEnv =
    typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const metaMode = metaEnv ? metaEnv.VITE_DATA_MODE : undefined;
  return (processMode || metaMode || 'mock').toString();
}

function isClientSimulationMode(mode: string): boolean {
  return CLIENT_SIMULATION_MODES.has(mode.trim().toLowerCase());
}

async function readLocalSubscription(tenantId: string): Promise<TenantSubscription | null> {
  const fromProvider = await dataProvider.get<TenantSubscription>(
    DYNAMIC_STORAGE_KEYS.tenantSubscription(tenantId)
  );
  if (fromProvider) {
    return fromProvider;
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(`mock_subscription_${tenantId}`);
    if (raw) {
      return JSON.parse(raw) as TenantSubscription;
    }
  }
  return null;
}

async function persistLocalSubscription(
  tenantId: string,
  subscriptionRecord: TenantSubscription
): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`mock_subscription_${tenantId}`, JSON.stringify(subscriptionRecord));
  }
  await dataProvider.set(DYNAMIC_STORAGE_KEYS.tenantSubscription(tenantId), subscriptionRecord);
}

export interface ManualProvisioningPayload {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  billingSource: 'self_service_checkout' | 'manual_invoice' | 'offline_payment' | 'complimentary' | 'pilot_exception';
  subscriptionStatus: 'pending_checkout' | 'trialing' | 'active' | 'manual_active' | 'comped' | 'paused';
  freePeriodEndDate?: string;
  paidThroughDate?: string;
  manualActivationReason?: string;
  paymentReferenceNote?: string;
  discountType?: 'percentage' | 'fixed_amount' | 'free_months';
  discountValue?: number;
  publicSlug: string;
  setupNotes?: string;
  publishStatus: boolean;
  branchCountOverride?: number;
}

export const manualProvisioningService = {
  async provisionTenant(payload: ManualProvisioningPayload): Promise<{ success: boolean; tenantId?: string; error?: string }> {
    try {
      const mode = getRuntimeDataMode();

      if (!isClientSimulationMode(mode)) {
        console.warn("Manual provisioning outside local simulation mode is disabled in frontend. Requires backend Edge function.");
        return { success: false, error: `Mode '${mode}' requires backend API for manual provisioning to ensure safety.` };
      }

      const slugValid = await siteProvisioningService.validateTenantSlug(payload.publicSlug);
      if (!slugValid.isValid) {
        return { success: false, error: slugValid.error };
      }

      manualTenantSequence += 1;
      const tenantId = `tenant-${Date.now()}-${manualTenantSequence}-manual`;

      const setupComplete = payload.publishStatus;

      // In mock mode, we manually insert a tenant-like object
      const newTenant: Partial<Tenant> = {
        id: tenantId,
        name: payload.businessName,
        slug: payload.publicSlug,
        planId: payload.planId as any,
        isPublished: payload.publishStatus,
        setupComplete: setupComplete,
      };

      await tenantService.updateTenant(tenantId, newTenant);

      const nowIso = new Date().toISOString();
      const defaultPeriodEnd = payload.freePeriodEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const resolvedPaidThroughDate =
        payload.paidThroughDate ||
        payload.freePeriodEndDate ||
        (payload.subscriptionStatus === 'manual_active' ? defaultPeriodEnd : undefined);

      // Create and save proper subscription for the manually provisioned tenant
      const subscriptionRecord: TenantSubscription = {
        tenantId,
        planId: payload.planId,
        status: payload.subscriptionStatus === 'comped' ? 'active' : payload.subscriptionStatus,
        trialStart: nowIso,
        trialEnd: payload.freePeriodEndDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        currentPeriodStart: nowIso,
        currentPeriodEnd: resolvedPaidThroughDate || defaultPeriodEnd,
        paidThroughDate: resolvedPaidThroughDate,
        cancelAtPeriodEnd: false,
        paymentProvider: payload.billingSource as TenantSubscription['paymentProvider'],
        discountType: payload.discountType as TenantSubscription['discountType'],
        discountValue: payload.discountValue,
        setupNotes: payload.setupNotes,
        manualActivationReason:
          payload.manualActivationReason ||
          (payload.subscriptionStatus === 'manual_active' ? 'super_admin_manual_provisioning' : undefined),
        paymentReferenceNote: payload.paymentReferenceNote,
      };

      // Set in both local storage and dataProvider to ensure perfect retrieval
      await persistLocalSubscription(tenantId, subscriptionRecord);

      // Queue administrative outbox notifications
      try {
        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'super_admin',
          channel: 'internal_note',
          type: 'super_admin_manual_provisioning_completed',
          internalOnly: true,
          contextArgs: {
            ownerName: payload.ownerName,
            businessName: payload.businessName,
            slug: payload.publicSlug,
            billingType: payload.billingSource
          }
        });

        communicationEventService.queueCommunicationEvent({
          tenantId,
          audience: 'business_owner',
          channel: 'email',
          type: 'manual_subscription_activated',
          contextArgs: {
            ownerName: payload.ownerName,
            businessName: payload.businessName,
            planName: payload.planId.toUpperCase()
          }
        });
      } catch (err) {
        console.error('Manual provisioning outbox hook error:', err);
      }

      console.log(`[Manual Provisioning] Provisioned tenant ${tenantId} with plan ${payload.planId} via ${payload.billingSource}`);
      return { success: true, tenantId };

    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async initiateOnlineSubscriptionTransition(
    tenantId: string,
    options: {
      targetPlanId?: string;
      paymentProvider?: TenantSubscription['paymentProvider'];
      providerSubscriptionId?: string;
    } = {}
  ): Promise<{
    success: boolean;
    error?: string;
    tenant?: Tenant | null;
    subscription?: TenantSubscription;
  }> {
    try {
      const mode = getRuntimeDataMode();
      if (!isClientSimulationMode(mode)) {
        return {
          success: false,
          error: `Mode '${mode}' requires backend RPC for manual-to-online subscription transition.`
        };
      }

      const cleanTenantId = tenantId?.trim();
      if (!cleanTenantId) {
        return { success: false, error: 'Valid tenantId is required.' };
      }

      const currentTenant = await tenantService.getTenantById(cleanTenantId);
      if (!currentTenant) {
        return { success: false, error: `Tenant not found: ${cleanTenantId}` };
      }

      const currentSub = await readLocalSubscription(cleanTenantId);
      if (!currentSub) {
        return { success: false, error: `Subscription not found for tenant: ${cleanTenantId}` };
      }

      const transition = subscriptionLifecycleService.prepareManualToOnlineCheckoutTransition(
        currentSub,
        options
      );
      if (!transition.success || !transition.subscription) {
        return { success: false, error: transition.message || transition.errorCode || 'Transition rejected.' };
      }

      await persistLocalSubscription(cleanTenantId, transition.subscription);

      if (transition.subscription.planId !== currentTenant.planId) {
        await tenantService.updateTenant(cleanTenantId, {
          planId: transition.subscription.planId as any
        });
      }

      const updatedTenant = await tenantService.getTenantById(cleanTenantId);
      return {
        success: true,
        tenant: updatedTenant,
        subscription: transition.subscription
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async rollbackPendingCheckoutToManualActive(
    tenantId: string,
    reason: string
  ): Promise<{
    success: boolean;
    error?: string;
    subscription?: TenantSubscription;
  }> {
    try {
      const mode = getRuntimeDataMode();
      if (!isClientSimulationMode(mode)) {
        return {
          success: false,
          error: `Mode '${mode}' requires backend RPC for checkout rollback.`
        };
      }

      const cleanTenantId = tenantId?.trim();
      if (!cleanTenantId) {
        return { success: false, error: 'Valid tenantId is required.' };
      }

      const currentSub = await readLocalSubscription(cleanTenantId);
      if (!currentSub) {
        return { success: false, error: `Subscription not found for tenant: ${cleanTenantId}` };
      }

      const rollback = subscriptionLifecycleService.rollbackManualCheckoutToManualActive(
        currentSub,
        reason
      );
      if (!rollback.success || !rollback.subscription) {
        return { success: false, error: rollback.message || rollback.errorCode || 'Rollback rejected.' };
      }

      await persistLocalSubscription(cleanTenantId, rollback.subscription);
      const currentTenant = await tenantService.getTenantById(cleanTenantId);
      if (currentTenant && rollback.subscription.planId && currentTenant.planId !== rollback.subscription.planId) {
        await tenantService.updateTenant(cleanTenantId, {
          planId: rollback.subscription.planId as any
        });
      }
      return {
        success: true,
        subscription: rollback.subscription
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
};
