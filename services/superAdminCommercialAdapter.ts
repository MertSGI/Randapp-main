import { supabase } from './supabaseClient';

export interface CommercialPlanCatalogItem {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  description: string | null;
  badge: string | null;
  sort_order: number;
  is_public: boolean;
  is_assignable: boolean;
  is_legacy: boolean;
  plan_version_id: string;
  version_number: number;
  lifecycle_status: string;
  billing_interval: string;
  currency: string;
  price: number | null;
  is_custom_pricing: boolean;
  entitlements: Record<string, {
    value_type: 'boolean' | 'integer' | 'text' | 'json';
    boolean_value: boolean | null;
    integer_value: number | null;
    text_value: string | null;
    json_value: any | null;
    is_unlimited: boolean;
    public_label: string;
    publicly_claimable: boolean;
    maturity: string;
  }>;
}

export interface TenantCommercialEnforcementSnapshot {
  success: boolean;
  reason_code?: string;
  tenant_id?: string;
  eligibility?: {
    eligible: boolean;
    reason_code: string;
    subscription_id: string | null;
    status: string | null;
    billing_mode: string | null;
    plan_id: string | null;
    plan_version_id: string | null;
    version_number: number | null;
    plan_code: string | null;
    trial_end: string | null;
    grace_until: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    scheduled_plan_id: string | null;
    scheduled_change_at: string | null;
    eval_time: string;
  };
  feature_gates?: Record<string, {
    value_type: string;
    boolean_value: boolean | null;
    integer_value: number | null;
    is_unlimited: boolean;
    source: 'platform_restriction' | 'entitlement_override' | 'plan_version_default';
  }>;
  usage?: Record<string, number>;
}

export interface MutationResult {
  success: boolean;
  reason_code: string;
  replayed?: boolean;
  subscription_id?: string;
  transaction_id?: string;
  override_id?: string;
  restriction_id?: string;
  applied?: boolean;
  previous_status?: string;
  new_status?: string;
}

export const superAdminCommercialAdapter = {
  /**
   * Get public commercial plan catalog (H1A read contract)
   */
  async getPublicPlanCatalog(): Promise<CommercialPlanCatalogItem[]> {
    const { data, error } = await supabase.rpc('get_public_commercial_plan_catalog');
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Get tenant commercial enforcement snapshot (H1C Super Admin diagnostic contract)
   */
  async getTenantSnapshot(tenantId: string): Promise<TenantCommercialEnforcementSnapshot> {
    const { data, error } = await supabase.rpc('super_admin_get_tenant_commercial_enforcement_snapshot', {
      p_tenant_id: tenantId
    });
    if (error) throw new Error(error.message);
    return data || { success: false, reason_code: 'unknown_error' };
  },

  /**
   * H1B Mutation 1: Assign Commercial Plan
   */
  async assignPlan(params: {
    idempotencyKey: string;
    tenantId: string;
    planCode: string;
    versionNumber?: number;
    billingMode?: string;
    agreedAmount?: number;
    customDomainApproved?: boolean;
    internalNote?: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_assign_commercial_plan', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_plan_code: params.planCode,
      p_version_number: params.versionNumber ?? 1,
      p_billing_mode: params.billingMode ?? 'manual',
      p_agreed_amount: params.agreedAmount ?? null,
      p_custom_domain_approved: params.customDomainApproved ?? false,
      p_internal_note: params.internalNote ?? null
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 2: Change Subscription Status
   */
  async changeStatus(params: {
    idempotencyKey: string;
    tenantId: string;
    targetStatus: string;
    operatorReason: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_change_subscription_status', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_target_status: params.targetStatus,
      p_operator_reason: params.operatorReason
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 3: Schedule Plan Change
   */
  async schedulePlanChange(params: {
    idempotencyKey: string;
    tenantId: string;
    targetPlanCode: string;
    effectiveAt: string;
    operatorReason: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_schedule_plan_change', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_target_plan_code: params.targetPlanCode,
      p_effective_at: params.effectiveAt,
      p_operator_reason: params.operatorReason
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 4: Cancel Scheduled Plan Change
   */
  async cancelScheduledPlanChange(params: {
    idempotencyKey: string;
    tenantId: string;
    operatorReason: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_cancel_scheduled_plan_change', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_operator_reason: params.operatorReason
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 5: Apply Due Scheduled Plan Change
   */
  async applyDueScheduledPlanChange(params: {
    idempotencyKey: string;
    tenantId: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_apply_due_scheduled_plan_change', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 6: Record Manual Billing Transaction
   */
  async recordBillingTransaction(params: {
    idempotencyKey: string;
    tenantId: string;
    amount: number;
    currency?: string;
    transactionType: string;
    transactionStatus: string;
    billingMode?: string;
    externalReference?: string;
    operatorReason: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_record_billing_transaction', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_amount: params.amount,
      p_currency: params.currency ?? 'TRY',
      p_transaction_type: params.transactionType,
      p_transaction_status: params.transactionStatus,
      p_billing_mode: params.billingMode ?? 'manual',
      p_external_reference: params.externalReference ?? null,
      p_operator_reason: params.operatorReason
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1B Mutation 7: Manage Tenant Entitlement Override
   */
  async manageEntitlementOverride(params: {
    idempotencyKey: string;
    tenantId: string;
    featureKey: string;
    action: 'set' | 'revoke';
    overrideValue?: {
      boolean_value?: boolean;
      integer_value?: number;
      text_value?: string;
      is_unlimited?: boolean;
    };
    endsAt?: string;
    operatorReason: string;
  }): Promise<MutationResult> {
    const { data, error } = await supabase.rpc('super_admin_manage_tenant_entitlement_override', {
      p_idempotency_key: params.idempotencyKey,
      p_tenant_id: params.tenantId,
      p_feature_key: params.featureKey,
      p_action: params.action,
      p_override_value: params.overrideValue ? JSON.stringify(params.overrideValue) : null,
      p_ends_at: params.endsAt ?? null,
      p_operator_reason: params.operatorReason
    });
    if (error) throw new Error(error.message);
    return data;
  }
};
