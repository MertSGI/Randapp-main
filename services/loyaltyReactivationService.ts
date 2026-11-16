// ==============================================================================
// Service: loyaltyReactivationService.ts
// Description: Server-Authoritative Loyalty, Reactivation, Deposit Policy,
//              Packages & Client Wallet / Gift Card RPC Contracts (Faz D3)
// Authority: ADIM-035 / Faz D3
// Production Status: NO_GO
// Safety Constraints:
//   - Zero client-side balance, point, wallet, or deposit mutations.
//   - All stored-value, loyalty, package, and deposit mutations route strictly
//     through PostgreSQL SECURITY DEFINER RPCs.
//   - Local simulation mode fails closed for DB-authoritative balance mutations.
//   - Live payment capture & live marketing dispatch remain EXTERNAL_HOLD.
// ==============================================================================
import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';

export type LoyaltyExecutionAuthority = 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION' | 'EXTERNAL_HOLD';

export interface TenantLoyaltyConfig {
  tenantId: string;
  isActive: boolean;
  pointsPerMinorUnit: number;
  minorUnitsPerPoint: number;
  minimumPointsRedemption: number;
  reactivationInactivityDays: number;
}

export interface CustomerLoyaltyProfile {
  tenantId: string;
  customerId: string;
  isActive: boolean;
  currentBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lastEarnedAt: string | null;
  lastRedeemedAt: string | null;
}

export interface LoyaltyEarnResult {
  success: boolean;
  pointsAwarded?: number;
  currentBalance?: number;
  lifetimeEarned?: number;
  ledgerId?: string;
  reason?: string;
  idempotentReplay?: boolean;
}

export interface LoyaltyRedeemResult {
  success: boolean;
  pointsRedeemed?: number;
  discountMinorUnits?: number;
  remainingBalance?: number;
  ledgerId?: string;
  reason?: string;
  idempotentReplay?: boolean;
}

export interface DepositPolicyEvaluation {
  success: boolean;
  tenantId?: string;
  serviceId?: string;
  priceUnitsSourceTruth?: string;
  depositRequired?: boolean;
  depositAmountMinorUnits?: number;
  currency?: string;
  noShowCancellationDeadlineHours?: number;
  noShowConsequence?: string;
  refundEligibleWindowHours?: number;
  reasonCode?: string;
}

export interface LoyaltyCapabilityBoundaryItem {
  capabilityId:
    | 'customer_360_segmentation'
    | 'deposit_noshow_policy_engine'
    | 'loyalty_points_ledger'
    | 'packages_memberships_ledger'
    | 'client_wallet_gift_cards_ledger'
    | 'live_deposit_payment_capture'
    | 'live_reactivation_marketing_dispatch';
  label: string;
  authority: LoyaltyExecutionAuthority;
  reasonCode: string;
  rpcContracts: string[];
  notes: string;
}

export interface LoyaltyCapabilityBoundaryReport {
  dataMode: 'supabase' | 'local';
  activeAuthority: 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION';
  productionReady: false;
  capabilities: LoyaltyCapabilityBoundaryItem[];
}

export interface LoyaltyRpcResult<T = Record<string, unknown>> {
  success: boolean;
  authority: LoyaltyExecutionAuthority;
  reasonCode: string;
  data?: T;
  error?: string;
}

export interface LoyaltyRpcClient {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

export function validatePositiveMinorUnits(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`INVALID_INPUT: ${fieldName} must be a positive integer in minor units.`);
  }
  return value;
}

export function validateLoyaltyIsoCurrency(currency: string): string {
  const normalized = (currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`INVALID_INPUT: Currency '${currency}' must be a 3-letter uppercase ISO code.`);
  }
  return normalized;
}

function assertUuidParam(value: string, fieldName: string): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!UUID_REGEX.test(clean)) {
    throw new Error(`INVALID_INPUT: ${fieldName} must be a valid UUID.`);
  }
  return clean;
}

export function getLoyaltyWalletCapabilityReport(
  modeOverride?: 'supabase' | 'local'
): LoyaltyCapabilityBoundaryReport {
  const dataMode = modeOverride ?? getDataSourceMode();
  const activeAuthority: 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION' =
    dataMode === 'supabase' ? 'DB_AUTHORITATIVE' : 'LOCAL_SIMULATION';

  return {
    dataMode,
    activeAuthority,
    productionReady: false,
    capabilities: [
      {
        capabilityId: 'customer_360_segmentation',
        label: 'Müşteri 360 Görünümü & Segmentasyon',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'get_customer_360_view',
          'list_tenant_customer_segments',
          'assign_customer_to_segment',
          'remove_customer_from_segment',
        ],
        notes:
          dataMode === 'supabase'
            ? 'Sunucu yetkili SECURITY DEFINER RPC üzerinden okuma ve segment üyeliği yönetimi.'
            : 'Yerel simülasyon modu: uzak DB müşteri 360 RPC bağlantısı yok.',
      },
      {
        capabilityId: 'deposit_noshow_policy_engine',
        label: 'Depozito & No-Show Politika Motoru',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'evaluate_booking_confirmation_deposit_policy',
          'admin_set_deposit_policy',
          'admin_set_no_show_policy',
        ],
        notes:
          dataMode === 'supabase'
            ? 'Sabit tutarlı depozito ve iptal penceresi kuralları DB RPC tarafından değerlendirilir; yüzdesel depozito fail-closed kapalıdır.'
            : 'Yerel simülasyon modu: politika kuralları uzak DB üzerinde doğrulanmaz.',
      },
      {
        capabilityId: 'loyalty_points_ledger',
        label: 'Sadakat Puanı Defteri & Reaktivasyon Tarayıcısı',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'get_customer_loyalty_profile',
          'scan_customer_reactivation_cohorts',
          'earn_loyalty_points_for_appointment',
          'redeem_loyalty_points_for_appointment',
        ],
        notes:
          dataMode === 'supabase'
            ? 'Puan kazanım/harcama mutasyonları yalnız güvenilir sunucu bağlamında yürütülür; istemci doğrudan puan yazamaz.'
            : 'Yerel simülasyon modu: istemci tarafında sahte puan bakiyesi oluşturulmaz.',
      },
      {
        capabilityId: 'packages_memberships_ledger',
        label: 'Hizmet Paketleri & Üyelik Kredisi Defteri',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: ['admin_grant_customer_package', 'redeem_customer_package_credits'],
        notes:
          dataMode === 'supabase'
            ? 'FOR UPDATE satır kilidi ve değişmez kullanım defteri ile kredi düşümü yapılır.'
            : 'Yerel simülasyon modu: paket kredisi istemcide saklanmaz veya düşülmez.',
      },
      {
        capabilityId: 'client_wallet_gift_cards_ledger',
        label: 'Müşteri Cüzdanı & Hediye Kartı Defteri',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: ['transact_wallet_balance', 'redeem_gift_card'],
        notes:
          dataMode === 'supabase'
            ? 'Cüzdan bakiye mutasyonları tenant_owner / yetkili sunucu bağlamına kilitlidir; hediye kartı kodları SHA-256 özetiyle doğrulanır.'
            : 'Yerel simülasyon modu: istemci tarafında yetkisiz cüzdan bakiyesi yazımı kapalıdır.',
      },
      {
        capabilityId: 'live_deposit_payment_capture',
        label: 'Canlı Depozito / Hediye Kartı Online Tahsilatı',
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'LIVE_PAYMENT_PROVIDER_CREDENTIALS_REQUIRED',
        rpcContracts: [],
        notes: 'Canlı ödeme sağlayıcı entegrasyonu (iyzico/PSP) 0 TL kuralı gereği EXTERNAL_HOLD kapsamındadır.',
      },
      {
        capabilityId: 'live_reactivation_marketing_dispatch',
        label: 'Canlı SMS / E-posta / WhatsApp Reaktivasyon Gönderimi',
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'NO_NETWORK_SEND_OUTBOX_ONLY',
        rpcContracts: [],
        notes: 'Reaktivasyon mesajları yalnız rıza kontrolü sonrası communication_outbox kuyruğuna yazılır; canlı gönderim kapalıdır.',
      },
    ],
  };
}

function normalizeLoyaltyProfile(data: any): CustomerLoyaltyProfile {
  return {
    tenantId: data.tenant_id ?? data.tenantId,
    customerId: data.customer_id ?? data.customerId,
    isActive: Boolean(data.is_active ?? data.isActive),
    currentBalance: Number(data.current_balance ?? data.currentBalance ?? 0),
    lifetimeEarned: Number(data.lifetime_earned ?? data.lifetimeEarned ?? 0),
    lifetimeRedeemed: Number(data.lifetime_redeemed ?? data.lifetimeRedeemed ?? 0),
    lastEarnedAt: data.last_earned_at ?? data.lastEarnedAt ?? null,
    lastRedeemedAt: data.last_redeemed_at ?? data.lastRedeemedAt ?? null,
  };
}

export class LoyaltyReactivationService {
  constructor(private readonly supabaseClient: any) {}

  /**
   * Get sanitized customer loyalty profile (authenticated tenant staff/owner)
   */
  async getLoyaltyProfile(tenantId: string, customerId: string): Promise<CustomerLoyaltyProfile> {
    const { data, error } = await this.supabaseClient.rpc('get_customer_loyalty_profile', {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });

    if (error) {
      throw new Error(`Failed to fetch loyalty profile: ${error.message}`);
    }

    return normalizeLoyaltyProfile(data);
  }

  /**
   * Earn loyalty points on completed appointment (Trusted Server Context Only)
   */
  async earnPoints(
    tenantId: string,
    customerId: string,
    appointmentId: string,
    amountMinorUnits: number,
    idempotencyKey: string
  ): Promise<LoyaltyEarnResult> {
    const { data, error } = await this.supabaseClient.rpc('earn_loyalty_points_for_appointment', {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_appointment_id: appointmentId,
      p_amount_minor_units: amountMinorUnits,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      throw new Error(`Failed to earn loyalty points: ${error.message}`);
    }

    return data as LoyaltyEarnResult;
  }

  /**
   * Redeem loyalty points during appointment checkout (Trusted Server Context Only)
   */
  async redeemPoints(
    tenantId: string,
    customerId: string,
    appointmentId: string,
    pointsToRedeem: number,
    idempotencyKey: string
  ): Promise<LoyaltyRedeemResult> {
    const { data, error } = await this.supabaseClient.rpc('redeem_loyalty_points_for_appointment', {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_appointment_id: appointmentId,
      p_points_to_redeem: pointsToRedeem,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      throw new Error(`Failed to redeem loyalty points: ${error.message}`);
    }

    return data as LoyaltyRedeemResult;
  }
}

async function callServerAuthorityRpc<T>(
  rpcName: string,
  params: Record<string, unknown>,
  deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
): Promise<LoyaltyRpcResult<T>> {
  const mode = deps?.mode ?? getDataSourceMode();
  if (mode !== 'supabase') {
    return {
      success: false,
      authority: 'LOCAL_SIMULATION',
      reasonCode: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
      error: `RPC '${rpcName}' requires supabase data mode; client-side balance/policy mutations are blocked in local mode.`,
    };
  }

  const client: LoyaltyRpcClient = deps?.rpcClient ?? (supabase as unknown as LoyaltyRpcClient);
  const { data, error } = await client.rpc(rpcName, params);
  if (error) {
    return {
      success: false,
      authority: 'DB_AUTHORITATIVE',
      reasonCode: 'RPC_EXECUTION_ERROR',
      error: error.message || String(error),
    };
  }

  if (data && typeof data === 'object' && data.success === false) {
    return {
      success: false,
      authority: 'DB_AUTHORITATIVE',
      reasonCode: String(data.reason_code || data.error || data.reason || 'RPC_REJECTED'),
      data: data as T,
      error: String(data.message || data.reason_code || data.error || data.reason || 'Server rejected operation.'),
    };
  }

  return {
    success: true,
    authority: 'DB_AUTHORITATIVE',
    reasonCode: 'OK',
    data: data as T,
  };
}

export const loyaltyReactivationService = {
  getCapabilityBoundaryReport(modeOverride?: 'supabase' | 'local'): LoyaltyCapabilityBoundaryReport {
    return getLoyaltyWalletCapabilityReport(modeOverride);
  },

  async getLoyaltyProfile(
    tenantId: string,
    customerId: string,
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult<CustomerLoyaltyProfile>> {
    const validTenantId = assertUuidParam(tenantId, 'tenantId');
    const validCustomerId = assertUuidParam(customerId, 'customerId');
    const res = await callServerAuthorityRpc<any>(
      'get_customer_loyalty_profile',
      { p_tenant_id: validTenantId, p_customer_id: validCustomerId },
      deps
    );
    if (!res.success || !res.data) return res as LoyaltyRpcResult<CustomerLoyaltyProfile>;
    return {
      ...res,
      data: normalizeLoyaltyProfile(res.data),
    };
  },

  async scanReactivationCohorts(
    tenantId: string,
    inactivityDays: 60 | 90 = 60,
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(tenantId, 'tenantId');
    if (inactivityDays !== 60 && inactivityDays !== 90) {
      throw new Error('INVALID_INPUT: inactivityDays must be exactly 60 or 90.');
    }
    return callServerAuthorityRpc(
      'scan_customer_reactivation_cohorts',
      { p_tenant_id: validTenantId, p_inactivity_days: inactivityDays },
      deps
    );
  },

  async evaluateDepositPolicy(
    tenantId: string,
    serviceId: string,
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult<DepositPolicyEvaluation>> {
    const validTenantId = assertUuidParam(tenantId, 'tenantId');
    const validServiceId = assertUuidParam(serviceId, 'serviceId');
    const res = await callServerAuthorityRpc<any>(
      'evaluate_booking_confirmation_deposit_policy',
      { p_tenant_id: validTenantId, p_service_id: validServiceId },
      deps
    );
    if (!res.data) return res as LoyaltyRpcResult<DepositPolicyEvaluation>;
    return {
      ...res,
      data: {
        success: Boolean(res.data.success),
        tenantId: res.data.tenant_id,
        serviceId: res.data.service_id,
        priceUnitsSourceTruth: res.data.price_units_source_truth,
        depositRequired: res.data.deposit_required,
        depositAmountMinorUnits: res.data.deposit_amount_minor_units,
        currency: res.data.currency,
        noShowCancellationDeadlineHours: res.data.no_show_cancellation_deadline_hours,
        noShowConsequence: res.data.no_show_consequence,
        refundEligibleWindowHours: res.data.refund_eligible_window_hours,
        reasonCode: res.data.reason_code,
      },
    };
  },

  async setDepositPolicy(
    input: {
      tenantId: string;
      serviceId?: string | null;
      depositType: 'fixed_amount' | 'percentage' | 'none';
      depositValueMinorOrPercent: number;
      currency?: string;
      isActive?: boolean;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const validServiceId = input.serviceId ? assertUuidParam(input.serviceId, 'serviceId') : null;
    if (!Number.isInteger(input.depositValueMinorOrPercent) || input.depositValueMinorOrPercent < 0) {
      throw new Error('INVALID_INPUT: depositValueMinorOrPercent must be a non-negative integer.');
    }
    if (input.depositType === 'percentage' && input.depositValueMinorOrPercent > 100) {
      throw new Error('INVALID_INPUT: percentage deposit value must be between 0 and 100.');
    }
    const currency = validateLoyaltyIsoCurrency(input.currency || 'TRY');

    return callServerAuthorityRpc(
      'admin_set_deposit_policy',
      {
        p_tenant_id: validTenantId,
        p_service_id: validServiceId,
        p_deposit_type: input.depositType,
        p_deposit_val: input.depositValueMinorOrPercent,
        p_currency: currency,
        p_is_active: input.isActive ?? true,
      },
      deps
    );
  },

  async setNoShowPolicy(
    input: {
      tenantId: string;
      cancellationDeadlineHours?: number;
      noShowConsequence?: 'forfeit_deposit' | 'strike_record' | 'block_booking' | 'none';
      lateCancellationFeeMinorUnits?: number;
      refundEligibleWindowHours?: number;
      isActive?: boolean;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const lateFee = input.lateCancellationFeeMinorUnits ?? 0;
    if (!Number.isInteger(lateFee) || lateFee < 0) {
      throw new Error('INVALID_INPUT: lateCancellationFeeMinorUnits must be a non-negative integer.');
    }

    return callServerAuthorityRpc(
      'admin_set_no_show_policy',
      {
        p_tenant_id: validTenantId,
        p_deadline_hours: input.cancellationDeadlineHours ?? 24,
        p_consequence: input.noShowConsequence ?? 'forfeit_deposit',
        p_late_fee_minor: lateFee,
        p_refund_win_hours: input.refundEligibleWindowHours ?? 24,
        p_is_active: input.isActive ?? true,
      },
      deps
    );
  },

  async grantCustomerPackage(
    input: {
      tenantId: string;
      customerId: string;
      packageDefinitionId: string;
      customValidityDays?: number | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const validCustomerId = assertUuidParam(input.customerId, 'customerId');
    const validPkgId = assertUuidParam(input.packageDefinitionId, 'packageDefinitionId');
    if (input.customValidityDays !== undefined && input.customValidityDays !== null) {
      if (!Number.isInteger(input.customValidityDays) || input.customValidityDays <= 0) {
        throw new Error('INVALID_INPUT: customValidityDays must be a positive integer.');
      }
    }

    return callServerAuthorityRpc(
      'admin_grant_customer_package',
      {
        p_tenant_id: validTenantId,
        p_customer_id: validCustomerId,
        p_package_definition_id: validPkgId,
        p_custom_validity_days: input.customValidityDays ?? null,
      },
      deps
    );
  },

  async redeemPackageCredits(
    input: {
      tenantId: string;
      customerPackageId: string;
      serviceId: string;
      creditsToRedeem?: number;
      appointmentId?: string | null;
      idempotencyKey: string;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const validCustPkgId = assertUuidParam(input.customerPackageId, 'customerPackageId');
    const validServiceId = assertUuidParam(input.serviceId, 'serviceId');
    const validApptId = input.appointmentId ? assertUuidParam(input.appointmentId, 'appointmentId') : null;
    const credits = input.creditsToRedeem ?? 1;
    validatePositiveMinorUnits(credits, 'creditsToRedeem');
    if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
      throw new Error('INVALID_INPUT: idempotencyKey is required.');
    }

    return callServerAuthorityRpc(
      'redeem_customer_package_credits',
      {
        p_tenant_id: validTenantId,
        p_customer_package_id: validCustPkgId,
        p_service_id: validServiceId,
        p_credits_to_redeem: credits,
        p_appointment_id: validApptId,
        p_idempotency_key: input.idempotencyKey.trim(),
      },
      deps
    );
  },

  async transactWalletBalance(
    input: {
      tenantId: string;
      customerId: string;
      amountMinorUnits: number;
      operation: 'debit' | 'credit';
      currency?: string;
      appointmentId?: string | null;
      idempotencyKey: string;
      description?: string | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const validCustomerId = assertUuidParam(input.customerId, 'customerId');
    const validApptId = input.appointmentId ? assertUuidParam(input.appointmentId, 'appointmentId') : null;
    const amountMinor = validatePositiveMinorUnits(input.amountMinorUnits, 'amountMinorUnits');
    const currency = validateLoyaltyIsoCurrency(input.currency || 'TRY');
    if (input.operation !== 'debit' && input.operation !== 'credit') {
      throw new Error('INVALID_INPUT: operation must be debit or credit.');
    }
    if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
      throw new Error('INVALID_INPUT: idempotencyKey is required.');
    }

    return callServerAuthorityRpc(
      'transact_wallet_balance',
      {
        p_tenant_id: validTenantId,
        p_customer_id: validCustomerId,
        p_amount_minor: amountMinor,
        p_operation: input.operation,
        p_currency: currency,
        p_appointment_id: validApptId,
        p_idempotency_key: input.idempotencyKey.trim(),
        p_description: input.description ?? null,
      },
      deps
    );
  },

  async redeemGiftCard(
    input: {
      tenantId: string;
      codeHash: string;
      amountMinorUnits: number;
      customerId?: string | null;
      appointmentId?: string | null;
      idempotencyKey: string;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: LoyaltyRpcClient }
  ): Promise<LoyaltyRpcResult> {
    const validTenantId = assertUuidParam(input.tenantId, 'tenantId');
    const validCustomerId = input.customerId ? assertUuidParam(input.customerId, 'customerId') : null;
    const validApptId = input.appointmentId ? assertUuidParam(input.appointmentId, 'appointmentId') : null;
    const cleanHash = typeof input.codeHash === 'string' ? input.codeHash.trim().toLowerCase() : '';
    if (!SHA256_HEX_REGEX.test(cleanHash)) {
      throw new Error('INVALID_INPUT: codeHash must be a 64-character SHA-256 hex digest (never raw plaintext).');
    }
    const amountMinor = validatePositiveMinorUnits(input.amountMinorUnits, 'amountMinorUnits');
    if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
      throw new Error('INVALID_INPUT: idempotencyKey is required.');
    }

    return callServerAuthorityRpc(
      'redeem_gift_card',
      {
        p_tenant_id: validTenantId,
        p_code_hash: cleanHash,
        p_amount_minor: amountMinor,
        p_customer_id: validCustomerId,
        p_appointment_id: validApptId,
        p_idempotency_key: input.idempotencyKey.trim(),
      },
      deps
    );
  },

  /**
   * Live PSP / terminal capture for deposits & gift cards remains EXTERNAL_HOLD.
   */
  requestLiveDepositCharge(): LoyaltyRpcResult {
    return {
      success: false,
      authority: 'EXTERNAL_HOLD',
      reasonCode: 'LIVE_PAYMENT_PROVIDER_CREDENTIALS_REQUIRED',
      error: 'Live deposit payment collection is classified EXTERNAL_HOLD (0 TL rule / NO_GO).',
    };
  },
};
