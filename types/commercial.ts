export type FeatureValueType = 'boolean' | 'integer' | 'text' | 'json';

export type FeatureCategory =
  | 'core'
  | 'operations'
  | 'limits'
  | 'channels'
  | 'customization'
  | 'integrations'
  | 'support';

export type FeatureMaturity =
  | 'LIVE_ENFORCED'
  | 'LIVE_NOT_PACKAGE_ENFORCED'
  | 'CODE_PRESENT'
  | 'SCHEMA_PRESENT'
  | 'MOCK_ONLY'
  | 'DOCUMENTED_ONLY'
  | 'ROADMAP'
  | 'ABSENT';

export type PlanLifecycleStatus = 'draft' | 'published' | 'retired';

export interface CommercialFeatureDefinition {
  feature_key: string;
  value_type: FeatureValueType;
  category: FeatureCategory;
  public_label: string;
  description?: string;
  maturity: FeatureMaturity;
  publicly_claimable: boolean;
  unit?: string;
}

export interface CommercialPlanEntitlement {
  value_type: FeatureValueType;
  boolean_value?: boolean | null;
  integer_value?: number | null;
  text_value?: string | null;
  json_value?: any | null;
  is_unlimited: boolean;
  public_label?: string;
  maturity?: FeatureMaturity;
  publicly_claimable?: boolean;
  source?: 'tenant_override' | 'plan_version' | 'default_deny';
}

export interface CommercialPublicPlan {
  plan_code: string;
  public_name: string;
  sort_order: number;
  version_number: number;
  plan_version_id: string;
  currency: string | null;
  monthly_price: number | null;
  annual_price: number | null;
  annual_discount_percent: number | null;
  setup_fee: number | null;
  trial_days: number | null;
  entitlements: Record<string, CommercialPlanEntitlement>;
}

export interface TenantCommercialSubscriptionSnapshot {
  success: boolean;
  reason_code: string;
  tenant_id?: string;
  subscription?: {
    subscription_id: string;
    plan_id: string;
    plan_version_id: string | null;
    status: string;
    billing_source?: string | null;
    billing_mode?: string | null;
    paid_through_date?: string | null;
    grace_until?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  } | null;
  assigned_plan_version?: {
    plan_code: string;
    public_name: string;
    version_number: number;
    is_legacy: boolean;
    currency: string | null;
    monthly_price: number | null;
    annual_price: number | null;
    annual_discount_percent: number | null;
    setup_fee: number | null;
    trial_days: number | null;
  } | null;
  effective_entitlements: Record<string, CommercialPlanEntitlement>;
  active_overrides: Array<{
    override_id: string;
    feature_key: string;
    value_type: FeatureValueType;
    boolean_value?: boolean | null;
    integer_value?: number | null;
    text_value?: string | null;
    json_value?: any | null;
    is_unlimited: boolean;
    starts_at: string;
    expires_at?: string | null;
    reason: string;
  }>;
  current_usage_counters: Array<{
    feature_key: string;
    period_start: string;
    period_end: string;
    used_count: number;
    reserved_count: number;
  }>;
}

export interface SuperAdminCommercialCatalog {
  success: boolean;
  reason_code: string;
  plans: Array<{
    plan_id: string;
    plan_code: string;
    public_name: string;
    internal_description?: string;
    is_public: boolean;
    is_active: boolean;
    is_assignable: boolean;
    is_legacy: boolean;
    sort_order: number;
    versions: Array<{
      version_id: string;
      version_number: number;
      lifecycle_status: PlanLifecycleStatus;
      currency: string | null;
      monthly_price: number | null;
      annual_price: number | null;
      annual_discount_percent: number | null;
      setup_fee: number | null;
      trial_days: number | null;
      effective_from: string;
      effective_to?: string | null;
      published_at?: string | null;
      retired_at?: string | null;
      internal_note?: string | null;
      entitlements: Record<string, CommercialPlanEntitlement>;
    }>;
  }>;
}
