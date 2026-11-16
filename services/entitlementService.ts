import { commercialCatalogService, isCommercialSubscriptionSnapshotEligible } from './commercialCatalogService';
import { getDataSourceMode } from './dataSourceConfig';
import type { TenantCommercialSubscriptionSnapshot } from '../types/commercial';

export type FeatureKey = 
  | 'website_publication'
  | 'online_booking'
  | 'staff_management'
  | 'service_management'
  | 'customer_list'
  | 'customer_memory_lite'
  | 'customer_memory_full'
  | 'ai_style_assistant_basic'
  | 'ai_style_assistant_full'
  | 'campaigns_referrals'
  | 'reports_basic'
  | 'reports_advanced'
  | 'custom_domain_manual'
  | 'multi_branch'
  | 'notification_templates'
  | 'whatsapp_automation_readiness'
  | 'priority_support'
  | 'super_admin_review_priority'
  | 'advanced_branding'
  | 'billing_self_service';

export type LimitKey = 
  | 'maxStaff'
  | 'maxServices'
  | 'maxBranches'
  | 'maxGalleryImages';

export interface PlanEntitlements {
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, number>;
  unlimitedFlags?: Record<LimitKey, boolean>;
}

const ALL_FEATURE_KEYS: FeatureKey[] = [
  'website_publication',
  'online_booking',
  'staff_management',
  'service_management',
  'customer_list',
  'customer_memory_lite',
  'customer_memory_full',
  'ai_style_assistant_basic',
  'ai_style_assistant_full',
  'campaigns_referrals',
  'reports_basic',
  'reports_advanced',
  'custom_domain_manual',
  'multi_branch',
  'notification_templates',
  'whatsapp_automation_readiness',
  'priority_support',
  'super_admin_review_priority',
  'advanced_branding',
  'billing_self_service'
];

const LIMIT_KEY_ALIASES: Record<LimitKey, string[]> = {
  maxStaff: ['maxStaff', 'max_staff', 'staff_limit'],
  maxServices: ['maxServices', 'max_services', 'service_limit'],
  maxBranches: ['maxBranches', 'max_branches', 'branch_limit'],
  maxGalleryImages: ['maxGalleryImages', 'max_gallery_images', 'gallery_image_limit']
};

/**
 * Returns a strict fail-closed entitlement object where every feature is disabled
 * and every quota is 0. Used whenever server verification fails or status is ineligible.
 */
export function createDenyAllEntitlements(): PlanEntitlements {
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of ALL_FEATURE_KEYS) {
    features[key] = false;
  }

  return {
    features,
    limits: {
      maxStaff: 0,
      maxServices: 0,
      maxBranches: 0,
      maxGalleryImages: 0
    },
    unlimitedFlags: {
      maxStaff: false,
      maxServices: false,
      maxBranches: false,
      maxGalleryImages: false
    }
  };
}

/**
 * Maps a server-verified commercial snapshot into client PlanEntitlements.
 * Fails closed unless the snapshot status and period/trial timestamps are eligible.
 */
export function _mapServerEntitlementsToPlanEntitlements(
  snapshot: TenantCommercialSubscriptionSnapshot | null | undefined,
  now: Date | number = Date.now()
): PlanEntitlements {
  if (!snapshot || !isCommercialSubscriptionSnapshotEligible(snapshot, now)) {
    return createDenyAllEntitlements();
  }

  const mapped = createDenyAllEntitlements();
  const rawRecord = snapshot as unknown as Record<string, unknown>;
  const effectiveSource =
    (rawRecord.effective_entitlements && typeof rawRecord.effective_entitlements === 'object'
      ? (rawRecord.effective_entitlements as Record<string, unknown>)
      : null) ??
    (rawRecord.entitlements && typeof rawRecord.entitlements === 'object'
      ? (rawRecord.entitlements as Record<string, unknown>)
      : null);

  if (!effectiveSource) {
    return createDenyAllEntitlements();
  }

  const rawFeatures =
    effectiveSource.features && typeof effectiveSource.features === 'object'
      ? (effectiveSource.features as Record<string, unknown>)
      : effectiveSource;

  for (const key of ALL_FEATURE_KEYS) {
    mapped.features[key] = rawFeatures[key] === true;
  }

  const rawLimits =
    (effectiveSource.limits && typeof effectiveSource.limits === 'object'
      ? (effectiveSource.limits as Record<string, unknown>)
      : null) ??
    (effectiveSource.quotas && typeof effectiveSource.quotas === 'object'
      ? (effectiveSource.quotas as Record<string, unknown>)
      : null) ??
    effectiveSource;

  const rawUnlimitedFlags =
    effectiveSource.unlimitedFlags && typeof effectiveSource.unlimitedFlags === 'object'
      ? (effectiveSource.unlimitedFlags as Record<string, unknown>)
      : effectiveSource.unlimited_flags && typeof effectiveSource.unlimited_flags === 'object'
      ? (effectiveSource.unlimited_flags as Record<string, unknown>)
      : null;

  (Object.keys(LIMIT_KEY_ALIASES) as LimitKey[]).forEach((limitKey) => {
    const aliases = LIMIT_KEY_ALIASES[limitKey];
    let resolvedRaw: unknown;
    for (const alias of aliases) {
      if (rawLimits[alias] !== undefined) {
        resolvedRaw = rawLimits[alias];
        break;
      }
    }

    const explicitUnlimited =
      rawUnlimitedFlags !== null &&
      aliases.some((alias) => rawUnlimitedFlags[alias] === true);

    if (explicitUnlimited || resolvedRaw === -1) {
      mapped.limits[limitKey] = Number.MAX_SAFE_INTEGER;
      if (mapped.unlimitedFlags) {
        mapped.unlimitedFlags[limitKey] = true;
      }
      return;
    }

    if (typeof resolvedRaw === 'number' && Number.isFinite(resolvedRaw) && resolvedRaw >= 0) {
      mapped.limits[limitKey] = Math.floor(resolvedRaw);
      return;
    }

    // Any missing, negative (< -1), NaN, or non-numeric limit fails closed to 0.
    mapped.limits[limitKey] = 0;
  });

  return mapped;
}

const ENTITLEMENTS_MAP: Record<string, PlanEntitlements> = {
  baslangic: {
    features: {
      website_publication: true,
      online_booking: true,
      staff_management: true,
      service_management: true,
      customer_list: true,
      customer_memory_lite: false,
      customer_memory_full: false,
      ai_style_assistant_basic: false,
      ai_style_assistant_full: false,
      campaigns_referrals: false,
      reports_basic: false,
      reports_advanced: false,
      custom_domain_manual: false,
      multi_branch: false,
      notification_templates: false,
      whatsapp_automation_readiness: false,
      priority_support: false,
      super_admin_review_priority: false,
      advanced_branding: false,
      billing_self_service: true
    },
    limits: {
      maxStaff: 1,
      maxServices: 10,
      maxBranches: 1,
      maxGalleryImages: 5
    }
  },
  standart: {
    features: {
      website_publication: true,
      online_booking: true,
      staff_management: true,
      service_management: true,
      customer_list: true,
      customer_memory_lite: true,
      customer_memory_full: false,
      ai_style_assistant_basic: true,
      ai_style_assistant_full: false,
      campaigns_referrals: false,
      reports_basic: true,
      reports_advanced: false,
      custom_domain_manual: false,
      multi_branch: false,
      notification_templates: true,
      whatsapp_automation_readiness: false,
      priority_support: false,
      super_admin_review_priority: false,
      advanced_branding: false,
      billing_self_service: true
    },
    limits: {
      maxStaff: 3,
      maxServices: 25,
      maxBranches: 1,
      maxGalleryImages: 10
    }
  },
  professional: {
    features: {
      website_publication: true,
      online_booking: true,
      staff_management: true,
      service_management: true,
      customer_list: true,
      customer_memory_lite: true,
      customer_memory_full: true,
      ai_style_assistant_basic: true,
      ai_style_assistant_full: true,
      campaigns_referrals: true,
      reports_basic: true,
      reports_advanced: true,
      custom_domain_manual: false, // Unless manual add-on, but keeping simple
      multi_branch: false,
      notification_templates: true,
      whatsapp_automation_readiness: false,
      priority_support: true,
      super_admin_review_priority: false,
      advanced_branding: true,
      billing_self_service: true
    },
    limits: {
      maxStaff: 8,
      maxServices: 60,
      maxBranches: 1,
      maxGalleryImages: 30
    }
  },
  premium: {
    features: {
      website_publication: true,
      online_booking: true,
      staff_management: true,
      service_management: true,
      customer_list: true,
      customer_memory_lite: true,
      customer_memory_full: true,
      ai_style_assistant_basic: true,
      ai_style_assistant_full: true,
      campaigns_referrals: true,
      reports_basic: true,
      reports_advanced: true,
      custom_domain_manual: true,
      multi_branch: false,
      notification_templates: true,
      whatsapp_automation_readiness: true,
      priority_support: true,
      super_admin_review_priority: true,
      advanced_branding: true,
      billing_self_service: true
    },
    limits: {
      maxStaff: 20,
      maxServices: 200,
      maxBranches: 1,
      maxGalleryImages: 100
    }
  },
  kurumsal: {
    features: {
      website_publication: true,
      online_booking: true,
      staff_management: true,
      service_management: true,
      customer_list: true,
      customer_memory_lite: true,
      customer_memory_full: true,
      ai_style_assistant_basic: true,
      ai_style_assistant_full: true,
      campaigns_referrals: true,
      reports_basic: true,
      reports_advanced: true,
      custom_domain_manual: true,
      multi_branch: true,
      notification_templates: true,
      whatsapp_automation_readiness: true,
      priority_support: true,
      super_admin_review_priority: true,
      advanced_branding: true,
      billing_self_service: false // Custom workflow
    },
    limits: {
      maxStaff: 999,
      maxServices: 999,
      maxBranches: 999,
      maxGalleryImages: 999
    }
  }
};

export const entitlementService = {
  getPlanEntitlements(planId: string): PlanEntitlements {
    // Default to 'baslangic' if not found in static UI preview map
    return ENTITLEMENTS_MAP[planId] || ENTITLEMENTS_MAP['baslangic'];
  },

  canUseFeature(planId: string, featureKey: FeatureKey): boolean {
    const entitlements = this.getPlanEntitlements(planId);
    return entitlements.features[featureKey] === true;
  },

  getLimit(planId: string, limitKey: LimitKey): number {
    const entitlements = this.getPlanEntitlements(planId);
    return entitlements.limits[limitKey];
  },

  assertFeatureAccess(tenantId: string, planId: string, featureKey: FeatureKey): boolean {
    if (!tenantId || !tenantId.trim()) {
      return false;
    }
    return this.canUseFeature(planId, featureKey);
  },

  /**
   * Resolves effective tenant entitlements from server commercial snapshot in supabase mode.
   * Strictly fail-closed on missing tenant, RPC error, tenant mismatch, or ineligible status.
   */
  async getTenantEffectiveEntitlements(
    tenantId: string,
    localFallbackPlanId?: string
  ): Promise<PlanEntitlements> {
    const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
    if (!normalizedTenantId) {
      return createDenyAllEntitlements();
    }

    if (getDataSourceMode() === 'local') {
      if (localFallbackPlanId && ENTITLEMENTS_MAP[localFallbackPlanId]) {
        const fallback = ENTITLEMENTS_MAP[localFallbackPlanId];
        return {
          features: { ...fallback.features },
          limits: { ...fallback.limits }
        };
      }
      return createDenyAllEntitlements();
    }

    const snapshot = await commercialCatalogService.getMyCommercialSubscriptionSnapshot(
      normalizedTenantId
    );
    return _mapServerEntitlementsToPlanEntitlements(snapshot);
  },

  async canTenantUseFeature(
    tenantId: string,
    featureKey: FeatureKey,
    localFallbackPlanId?: string
  ): Promise<boolean> {
    const entitlements = await this.getTenantEffectiveEntitlements(tenantId, localFallbackPlanId);
    return entitlements.features[featureKey] === true;
  },

  async getTenantLimit(
    tenantId: string,
    limitKey: LimitKey,
    localFallbackPlanId?: string
  ): Promise<number> {
    const entitlements = await this.getTenantEffectiveEntitlements(tenantId, localFallbackPlanId);
    return entitlements.limits[limitKey] ?? 0;
  },

  async getEffectiveEntitlementsAsync(
    tenantId: string,
    localFallbackPlanId?: string
  ): Promise<PlanEntitlements> {
    return this.getTenantEffectiveEntitlements(tenantId, localFallbackPlanId);
  },

  async canUseFeatureAsync(
    tenantId: string,
    featureKey: FeatureKey,
    localFallbackPlanId?: string
  ): Promise<boolean> {
    return this.canTenantUseFeature(tenantId, featureKey, localFallbackPlanId);
  },

  async getLimitAsync(
    tenantId: string,
    limitKey: LimitKey,
    localFallbackPlanId?: string
  ): Promise<number> {
    return this.getTenantLimit(tenantId, limitKey, localFallbackPlanId);
  },

  getUpgradeTarget(featureKey: FeatureKey): string {
    if (featureKey === 'campaigns_referrals') return 'professional';
    if (featureKey === 'customer_memory_full') return 'professional';
    if (featureKey === 'ai_style_assistant_full') return 'professional';
    if (featureKey === 'custom_domain_manual') return 'premium';
    if (featureKey === 'multi_branch') return 'kurumsal';
    // Fallbacks
    return 'professional';
  }
};
