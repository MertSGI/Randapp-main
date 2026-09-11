// ==============================================================================
// Service: LoyaltyReactivationService.ts
// Description: Domain Service for Phase 4 Loyalty & Reactivation Foundation
// Authority: LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 (DECISION-020)
// Production Status: NO_GO
// ==============================================================================

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

export class LoyaltyReactivationService {
  constructor(private readonly supabaseClient: any) {}

  /**
   * Get sanitized customer loyalty profile
   */
  async getLoyaltyProfile(tenantId: string, customerId: string): Promise<CustomerLoyaltyProfile> {
    const { data, error } = await this.supabaseClient.rpc('get_customer_loyalty_profile', {
      p_tenant_id: tenantId,
      p_customer_id: customerId
    });

    if (error) {
      throw new Error(`Failed to fetch loyalty profile: ${error.message}`);
    }

    return data as CustomerLoyaltyProfile;
  }

  /**
   * Earn loyalty points on appointment completion (Service-Role or Trusted Server context)
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
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      throw new Error(`Failed to earn loyalty points: ${error.message}`);
    }

    return data as LoyaltyEarnResult;
  }

  /**
   * Redeem loyalty points during appointment checkout (Service-Role or Trusted Server context)
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
      p_idempotency_key: idempotencyKey
    });

    if (error) {
      throw new Error(`Failed to redeem loyalty points: ${error.message}`);
    }

    return data as LoyaltyRedeemResult;
  }
}
