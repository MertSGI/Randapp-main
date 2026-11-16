import assert from 'node:assert/strict';
import { VerticalCommercialService } from './verticalCommercialService.ts';

const SYNTH_TENANT_ID = 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa';

export async function runVerticalCommercialServiceTests(): Promise<void> {
  let rpcCalled = false;
  const failingMockClient = {
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: { message: 'SHOULD_NOT_CALL' } };
    },
  };

  const svcGuard = new VerticalCommercialService(failingMockClient);

  // 1. Execution authority & EXTERNAL_HOLD regulatory classification
  assert.equal(svcGuard.getExecutionAuthority('supabase'), 'DB_AUTHORITATIVE');
  assert.equal(svcGuard.getExecutionAuthority('local'), 'LOCAL_SIMULATION');

  const holdStatus = svcGuard.getRegulatoryHoldStatus();
  assert.equal(holdStatus.classification, 'EXTERNAL_HOLD');
  assert.equal(holdStatus.kvkkSpecialCategoryHealthDataApproval, 'EXTERNAL_HOLD');
  assert.equal(holdStatus.healthRegulationAndMedicalCertificateApproval, 'EXTERNAL_HOLD');
  assert.equal(holdStatus.liveExternalMessagingAndAiDispatch, 'EXTERNAL_HOLD');
  assert.equal(holdStatus.productionGoLive, 'NO_GO');

  // 2. Negative: invalid tenant UUID fails closed without invoking RPC
  const invalidTenantRes = await svcGuard.resolveVerticalContext('not-a-uuid', { mode: 'supabase' });
  assert.equal(invalidTenantRes.success, false);
  assert.equal(invalidTenantRes.eligible, false);
  assert.equal(invalidTenantRes.reason_code, 'INVALID_TENANT_ID');
  assert.equal(invalidTenantRes.verticals.clinic_enabled, false);
  assert.equal(invalidTenantRes.verticals.health_tourism_enabled, false);
  assert.equal(rpcCalled, false);

  // 3. Negative: local simulation mode fails closed without invoking RPC
  const localModeRes = await svcGuard.resolveVerticalContext(SYNTH_TENANT_ID, { mode: 'local' });
  assert.equal(localModeRes.success, false);
  assert.equal(localModeRes.eligible, false);
  assert.equal(localModeRes.reason_code, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');
  assert.equal(rpcCalled, false);

  // 4. Negative: RPC error or thrown network error fails closed cleanly
  const rpcErrorSvc = new VerticalCommercialService({
    rpc: async () => ({ data: null, error: { message: 'FORBIDDEN_CROSS_TENANT' } }),
  });
  const crossTenantRes = await rpcErrorSvc.resolveVerticalContext(SYNTH_TENANT_ID, { mode: 'supabase' });
  assert.equal(crossTenantRes.success, false);
  assert.equal(crossTenantRes.eligible, false);
  assert.equal(crossTenantRes.reason_code, 'FORBIDDEN_CROSS_TENANT');
  assert.equal(crossTenantRes.verticals.clinic_enabled, false);

  const throwingSvc = new VerticalCommercialService({
    rpc: async () => {
      throw new Error('Network down');
    },
  });
  const thrownRes = await throwingSvc.resolveVerticalContext(SYNTH_TENANT_ID, { mode: 'supabase' });
  assert.equal(thrownRes.success, false);
  assert.equal(thrownRes.eligible, false);
  assert.equal(thrownRes.reason_code, 'RPC_EXECUTION_FAILED');

  // 5. Positive: synthetic DB-authoritative vertical context normalization
  const capturedCalls: Array<{ fn: string; args: Record<string, any> }> = [];
  const okSvc = new VerticalCommercialService({
    rpc: async (fn, args) => {
      capturedCalls.push({ fn, args: args ?? {} });
      return {
        data: {
          success: true,
          tenant_id: SYNTH_TENANT_ID,
          eligible: true,
          subscription_status: 'manual_active',
          plan_code: 'clinic_starter',
          plan_name: 'Klinik Başlangıç',
          verticals: {
            clinic_enabled: true,
            health_tourism_enabled: false,
          },
          quotas: {
            max_practitioners: { limit: 2, is_unlimited: false, active: 1 },
            max_coordinators: { limit: 0, is_unlimited: false, active: 0 },
            max_active_journeys: { limit: 0, is_unlimited: false },
            ai_allowance: { limit: 0, is_unlimited: false },
          },
        },
        error: null,
      };
    },
  });

  const okRes = await okSvc.resolveVerticalContext(`  ${SYNTH_TENANT_ID}  `, { mode: 'supabase' });
  assert.equal(capturedCalls.length, 1);
  assert.equal(capturedCalls[0].fn, 'resolve_tenant_vertical_context');
  assert.equal(capturedCalls[0].args.p_tenant_id, SYNTH_TENANT_ID);
  assert.equal(okRes.success, true);
  assert.equal(okRes.eligible, true);
  assert.equal(okRes.subscription_status, 'manual_active');
  assert.equal(okRes.verticals.clinic_enabled, true);
  assert.equal(okRes.verticals.health_tourism_enabled, false);
  assert.equal(okRes.quotas.max_practitioners.limit, 2);

  console.log('[PASS] verticalCommercialService tests verified');
}

await runVerticalCommercialServiceTests();
