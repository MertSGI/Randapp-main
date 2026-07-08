import { planService } from './planService';

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
    // Default to 'baslangic' if not found
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
     // In a real backend, we'd look up the tenant's actual subscription status. 
     // Here we just check the plan's mapped capabilities.
     return this.canUseFeature(planId, featureKey);
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
