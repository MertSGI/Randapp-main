import { supabase } from './supabaseClient.ts';

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
  changed?: boolean;
  replayed?: boolean;
  subscription_id?: string;
  transaction_id?: string;
  override_id?: string;
  restriction_id?: string;
  restriction?: PlatformRestrictionItem;
  applied?: boolean;
  previous_status?: string;
  new_status?: string;
}

export interface CommercialDirectoryTenantItem {
  tenant_id: string;
  slug: string;
  business_name: string;
  created_at: string;
  subscription_status: string;
  plan_code: string;
  plan_name: string;
  version_number: number | null;
  billing_mode: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  has_scheduled_change: boolean;
}

export interface ListTenantCommercialDirectoryResponse {
  success: boolean;
  reason_code: string;
  total_count: number;
  limit: number;
  offset: number;
  tenants: CommercialDirectoryTenantItem[];
}

export interface PlatformRestrictionItem {
  id: string;
  tenant_id: string | null;
  tenant_slug?: string | null;
  tenant_name?: string | null;
  feature_key: string;
  is_restricted: boolean;
  reason: string;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  is_currently_active?: boolean;
}

export interface ListPlatformRestrictionsResponse {
  success: boolean;
  reason_code: string;
  total_count: number;
  limit: number;
  offset: number;
  restrictions: PlatformRestrictionItem[];
}

export interface BillingTransactionItem {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  transaction_type: string;
  amount: number;
  currency: string;
  billing_mode: string;
  payment_method: string | null;
  related_transaction_id: string | null;
  external_provider_reference: string | null;
  reference_note: string | null;
  internal_reason: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  occurred_at: string;
  effective_at: string;
  created_at: string;
}

export interface GetBillingTransactionsResponse {
  success: boolean;
  reason_code: string;
  total_count: number;
  limit: number;
  offset: number;
  transactions: BillingTransactionItem[];
}

// ── Pure Adapter Helper Builders & Parsers ───────────────────────────────────

export function buildTenantDirectoryRpcArgs(params?: {
  search?: string | null;
  status?: string | null;
  planCode?: string | null;
  limit?: number;
  offset?: number;
}) {
  return {
    p_search: params?.search ?? null,
    p_status: params?.status ?? null,
    p_plan_code: params?.planCode ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0
  };
}

export function parseTenantDirectoryResponse(data: any, params?: { limit?: number; offset?: number }): ListTenantCommercialDirectoryResponse {
  return data || {
    success: false,
    reason_code: 'empty_response',
    total_count: 0,
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
    tenants: []
  };
}

export function buildRestrictionListRpcArgs(params?: {
  tenantId?: string | null;
  limit?: number;
  offset?: number;
}) {
  return {
    p_tenant_id: params?.tenantId ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0
  };
}

export function parseRestrictionListResponse(data: any, params?: { limit?: number; offset?: number }): ListPlatformRestrictionsResponse {
  return data || {
    success: false,
    reason_code: 'empty_response',
    total_count: 0,
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
    restrictions: []
  };
}

export function buildCreateRestrictionRpcArgs(params: {
  idempotencyKey: string;
  tenantId?: string | null;
  featureKey: string;
  reason: string;
  startsAt?: string | null;
  expiresAt?: string | null;
}) {
  return {
    p_idempotency_key: params.idempotencyKey,
    p_tenant_id: params.tenantId ?? null,
    p_feature_key: params.featureKey,
    p_reason: params.reason,
    p_starts_at: params.startsAt ?? null,
    p_expires_at: params.expiresAt ?? null
  };
}

export function buildEndRestrictionRpcArgs(params: {
  idempotencyKey: string;
  restrictionId: string;
  reason: string;
}) {
  return {
    p_idempotency_key: params.idempotencyKey,
    p_restriction_id: params.restrictionId,
    p_reason: params.reason
  };
}

export function buildBillingTransactionsRpcArgs(params?: {
  tenantId?: string | null;
  limit?: number;
  offset?: number;
}) {
  return {
    p_tenant_id: params?.tenantId ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0
  };
}

export function parseBillingTransactionsResponse(data: any, params?: { limit?: number; offset?: number }): GetBillingTransactionsResponse {
  return data || {
    success: false,
    reason_code: 'empty_response',
    total_count: 0,
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
    transactions: []
  };
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
   * H1D Read RPC 1: List Tenant Commercial Directory
   */
  async listTenantCommercialDirectory(params?: {
    search?: string | null;
    status?: string | null;
    planCode?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ListTenantCommercialDirectoryResponse> {
    const rpcArgs = buildTenantDirectoryRpcArgs(params);
    const { data, error } = await supabase.rpc('super_admin_list_tenant_commercial_directory', rpcArgs);
    if (error) throw new Error(error.message);
    return parseTenantDirectoryResponse(data, params);
  },

  /**
   * H1D Read RPC 2: List Platform Restrictions
   * Note: RPC accepts strictly p_tenant_id, p_limit, p_offset.
   */
  async listPlatformRestrictions(params?: {
    tenantId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ListPlatformRestrictionsResponse> {
    const rpcArgs = buildRestrictionListRpcArgs(params);
    const { data, error } = await supabase.rpc('super_admin_list_platform_restrictions', rpcArgs);
    if (error) throw new Error(error.message);
    return parseRestrictionListResponse(data, params);
  },

  /**
   * H1D Mutation RPC 1: Create Platform Restriction
   */
  async createPlatformRestriction(params: {
    idempotencyKey: string;
    tenantId?: string | null;
    featureKey: string;
    reason: string;
    startsAt?: string | null;
    expiresAt?: string | null;
  }): Promise<MutationResult> {
    const rpcArgs = buildCreateRestrictionRpcArgs(params);
    const { data, error } = await supabase.rpc('super_admin_create_platform_restriction', rpcArgs);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1D Mutation RPC 2: End Platform Restriction
   */
  async endPlatformRestriction(params: {
    idempotencyKey: string;
    restrictionId: string;
    reason: string;
  }): Promise<MutationResult> {
    const rpcArgs = buildEndRestrictionRpcArgs(params);
    const { data, error } = await supabase.rpc('super_admin_end_platform_restriction', rpcArgs);
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * H1D Read RPC 3: Get Billing Transactions Ledger
   */
  async getBillingTransactions(params?: {
    tenantId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<GetBillingTransactionsResponse> {
    const rpcArgs = buildBillingTransactionsRpcArgs(params);
    const { data, error } = await supabase.rpc('super_admin_get_billing_transactions', rpcArgs);
    if (error) throw new Error(error.message);
    return parseBillingTransactionsResponse(data, params);
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
    transactionStatus?: string;
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
      p_transaction_status: params.transactionStatus ?? 'settled',
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
