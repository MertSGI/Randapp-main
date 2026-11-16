import { createClient } from '@supabase/supabase-js';
import { getDataSourceMode, type DataSourceMode } from './dataSourceConfig';
import type { TenantVerticalCommercialContext } from '../types/commercial';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerticalExecutionAuthority = 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION';

export interface VerticalRegulatoryHoldStatus {
  classification: 'EXTERNAL_HOLD';
  kvkkSpecialCategoryHealthDataApproval: 'EXTERNAL_HOLD';
  healthRegulationAndMedicalCertificateApproval: 'EXTERNAL_HOLD';
  liveExternalMessagingAndAiDispatch: 'EXTERNAL_HOLD';
  productionGoLive: 'NO_GO';
}

export interface VerticalRpcClientLike {
  rpc: (
    fn: string,
    args?: Record<string, any>
  ) => Promise<{ data: any; error: { message?: string } | null }> | any;
}

function createEmptyVerticalContext(tenantId: string, reasonCode: string): TenantVerticalCommercialContext {
  return {
    success: false,
    tenant_id: tenantId,
    eligible: false,
    reason_code: reasonCode,
    verticals: { clinic_enabled: false, health_tourism_enabled: false },
    quotas: {
      max_practitioners: { limit: 0, is_unlimited: false, active: 0 },
      max_coordinators: { limit: 0, is_unlimited: false, active: 0 },
      max_active_journeys: { limit: 0, is_unlimited: false },
      ai_allowance: { limit: 0, is_unlimited: false },
    },
  };
}

export class VerticalCommercialService {
  constructor(private supabase: ReturnType<typeof createClient> | VerticalRpcClientLike) {}

  getExecutionAuthority(modeOverride?: DataSourceMode): VerticalExecutionAuthority {
    const mode = modeOverride ?? getDataSourceMode();
    return mode === 'supabase' ? 'DB_AUTHORITATIVE' : 'LOCAL_SIMULATION';
  }

  getRegulatoryHoldStatus(): VerticalRegulatoryHoldStatus {
    return {
      classification: 'EXTERNAL_HOLD',
      kvkkSpecialCategoryHealthDataApproval: 'EXTERNAL_HOLD',
      healthRegulationAndMedicalCertificateApproval: 'EXTERNAL_HOLD',
      liveExternalMessagingAndAiDispatch: 'EXTERNAL_HOLD',
      productionGoLive: 'NO_GO',
    };
  }

  /**
   * Resolve server-authoritative vertical commercial context for a tenant.
   */
  async resolveVerticalContext(
    tenantId: string,
    options?: { mode?: DataSourceMode }
  ): Promise<TenantVerticalCommercialContext> {
    if (!tenantId || !UUID_REGEX.test(tenantId.trim())) {
      return createEmptyVerticalContext('', 'INVALID_TENANT_ID');
    }

    const normalizedTenantId = tenantId.trim();
    if (this.getExecutionAuthority(options?.mode) !== 'DB_AUTHORITATIVE') {
      return createEmptyVerticalContext(normalizedTenantId, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');
    }

    try {
      const { data, error } = await (this.supabase.rpc as any)('resolve_tenant_vertical_context', {
        p_tenant_id: normalizedTenantId,
      });

      if (error || !data) {
        return createEmptyVerticalContext(
          normalizedTenantId,
          error?.message || 'RPC_EXECUTION_FAILED'
        );
      }

      const raw = data as Partial<TenantVerticalCommercialContext>;
      return {
        success: Boolean(raw.success),
        tenant_id: raw.tenant_id || normalizedTenantId,
        eligible: Boolean(raw.eligible),
        subscription_status: raw.subscription_status,
        plan_code: raw.plan_code,
        plan_name: raw.plan_name,
        reason_code: raw.reason_code,
        verticals: {
          clinic_enabled: Boolean(raw.verticals?.clinic_enabled),
          health_tourism_enabled: Boolean(raw.verticals?.health_tourism_enabled),
        },
        quotas: {
          max_practitioners: raw.quotas?.max_practitioners ?? { limit: 0, is_unlimited: false, active: 0 },
          max_coordinators: raw.quotas?.max_coordinators ?? { limit: 0, is_unlimited: false, active: 0 },
          max_active_journeys: raw.quotas?.max_active_journeys ?? { limit: 0, is_unlimited: false },
          ai_allowance: raw.quotas?.ai_allowance ?? { limit: 0, is_unlimited: false },
        },
      };
    } catch {
      return createEmptyVerticalContext(normalizedTenantId, 'RPC_EXECUTION_FAILED');
    }
  }
}
