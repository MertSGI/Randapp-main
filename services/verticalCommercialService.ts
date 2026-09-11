import { createClient } from '@supabase/supabase-js';
import type { TenantVerticalCommercialContext } from '../types/commercial';

export class VerticalCommercialService {
  constructor(private supabase: ReturnType<typeof createClient>) {}

  /**
   * Resolve server-authoritative vertical commercial context for a tenant.
   */
  async resolveVerticalContext(tenantId: string): Promise<TenantVerticalCommercialContext> {
    if (!tenantId) {
      return {
        success: false,
        tenant_id: '',
        eligible: false,
        reason_code: 'INVALID_TENANT_ID',
        verticals: { clinic_enabled: false, health_tourism_enabled: false },
        quotas: {
          max_practitioners: { limit: 0, is_unlimited: false, active: 0 },
          max_coordinators: { limit: 0, is_unlimited: false, active: 0 },
          max_active_journeys: { limit: 0, is_unlimited: false },
          ai_allowance: { limit: 0, is_unlimited: false }
        }
      };
    }

    const { data, error } = await (this.supabase.rpc as any)('resolve_tenant_vertical_context', {
      p_tenant_id: tenantId
    });

    if (error || !data) {
      return {
        success: false,
        tenant_id: tenantId,
        eligible: false,
        reason_code: error?.message || 'RPC_EXECUTION_FAILED',
        verticals: { clinic_enabled: false, health_tourism_enabled: false },
        quotas: {
          max_practitioners: { limit: 0, is_unlimited: false, active: 0 },
          max_coordinators: { limit: 0, is_unlimited: false, active: 0 },
          max_active_journeys: { limit: 0, is_unlimited: false },
          ai_allowance: { limit: 0, is_unlimited: false }
        }
      };
    }

    return data as TenantVerticalCommercialContext;
  }
}
