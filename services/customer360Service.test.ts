import assert from 'node:assert/strict';
import {
  Customer360Service,
  customer360Service,
} from './customer360Service.ts';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const SEGMENT_ID = '33333333-3333-4333-8333-333333333333';

export async function runCustomer360ServiceTests(): Promise<void> {
  // 1. Execution authority reflects modeOverride accurately
  assert.equal(customer360Service.getExecutionAuthority('supabase'), 'DB_AUTHORITATIVE');
  assert.equal(customer360Service.getExecutionAuthority('local'), 'LOCAL_SIMULATION');

  // 2. Direct Customer360Service validates required parameters and normalizes RPC payloads
  const rpcCalls: Array<{ rpcName: string; body: Record<string, any> }> = [];
  const svc = new Customer360Service(async (rpcName, body) => {
    rpcCalls.push({ rpcName, body });
    if (rpcName === 'get_customer_360_view') {
      return {
        customer_id: CUSTOMER_ID,
        tenant_id: TENANT_ID,
        name: 'Ayşe Yılmaz',
        email: 'ayse@example.test',
        phone: '+905551112233',
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
        metrics: {
          total_appointments: 4,
          completed_appointments: 3,
          cancelled_appointments: 1,
          no_show_appointments: 0,
          first_visit_date: '2026-01-05',
          last_visit_date: '2026-02-01',
        },
        segments: [
          { segment_id: SEGMENT_ID, name: 'VIP', segment_type: 'manual', assigned_at: '2026-01-15T00:00:00Z' },
        ],
        memory: {
          preferences: { hairStyle: 'Bob' },
          notes: 'Hassas cilt',
          photos: [],
          consent_flags: { marketing: true },
          updated_at: '2026-01-20T00:00:00Z',
        },
        recent_appointments: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            date: '2026-02-01',
            time: '14:00',
            status: 'completed',
            service_id: '55555555-5555-4555-8555-555555555555',
            staff_id: '66666666-6666-4666-8666-666666666666',
            branch_id: null,
            created_at: '2026-01-25T10:00:00Z',
          },
        ],
      };
    }
    if (rpcName === 'list_tenant_customer_segments') {
      return [
        {
          id: SEGMENT_ID,
          name: 'VIP',
          description: 'High value clients',
          segment_type: 'manual',
          criteria: {},
          is_active: true,
          member_count: 12,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];
    }
    if (rpcName === 'evaluate_dynamic_customer_segments') {
      return {
        status: 'DYNAMIC_RULE_EVALUATION_NOT_IMPLEMENTED',
        tenant_id: TENANT_ID,
        segment_id: SEGMENT_ID,
      };
    }
    return true;
  });

  await assert.rejects(
    () => svc.getCustomer360View('', CUSTOMER_ID),
    /MISSING_REQUIRED_PARAMS/
  );

  const view = await svc.getCustomer360View(TENANT_ID, CUSTOMER_ID);
  assert.ok(view);
  assert.equal(view.customerId, CUSTOMER_ID);
  assert.equal(view.metrics.completedAppointments, 3);
  assert.equal(view.segments[0].name, 'VIP');
  assert.equal(view.memory.notes, 'Hassas cilt');
  assert.equal(view.recentAppointments.length, 1);

  const segs = await svc.listSegments(TENANT_ID);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].memberCount, 12);

  assert.equal(await svc.assignCustomerToSegment(TENANT_ID, SEGMENT_ID, CUSTOMER_ID, 'owner-1'), true);
  assert.equal(await svc.removeCustomerFromSegment(TENANT_ID, SEGMENT_ID, CUSTOMER_ID), true);

  const dyn = await svc.evaluateDynamicSegments(TENANT_ID, SEGMENT_ID);
  assert.equal(dyn.status, 'DYNAMIC_RULE_EVALUATION_NOT_IMPLEMENTED');
  assert.equal(rpcCalls.length, 5);

  // 3. Safe wrappers fail closed in local simulation mode without calling any RPC
  const localView = await customer360Service.getCustomer360ViewSafe(TENANT_ID, CUSTOMER_ID, { mode: 'local' });
  assert.equal(localView.success, false);
  assert.equal(localView.authority, 'LOCAL_SIMULATION');
  assert.equal(localView.reasonCode, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');

  const localSegs = await customer360Service.listSegmentsSafe(TENANT_ID, { mode: 'local' });
  assert.equal(localSegs.success, false);
  assert.equal(localSegs.authority, 'LOCAL_SIMULATION');

  // 4. Safe wrappers validate UUID format before invoking Supabase RPC
  let unexpectedRpcCalled = false;
  const badUuidRes = await customer360Service.getCustomer360ViewSafe('not-a-uuid', CUSTOMER_ID, {
    mode: 'supabase',
    rpcClient: {
      rpc: async () => {
        unexpectedRpcCalled = true;
        return { data: null, error: null };
      },
    },
  });
  assert.equal(badUuidRes.success, false);
  assert.equal(badUuidRes.reasonCode, 'CUSTOMER_360_FETCH_FAILED');
  assert.match(badUuidRes.error || '', /INVALID_UUID/);
  assert.equal(unexpectedRpcCalled, false);

  // 5. Safe wrapper delegates cleanly in supabase mode
  const okSafeView = await customer360Service.getCustomer360ViewSafe(TENANT_ID, CUSTOMER_ID, {
    mode: 'supabase',
    rpcClient: {
      rpc: async (fn) => {
        if (fn === 'get_customer_360_view') {
          return {
            data: {
              customer_id: CUSTOMER_ID,
              tenant_id: TENANT_ID,
              name: 'Zeynep Kaya',
              email: null,
              phone: '+905550001122',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              metrics: {},
              segments: [],
              memory: {},
              recent_appointments: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    },
  });
  assert.equal(okSafeView.success, true);
  assert.equal(okSafeView.authority, 'DB_AUTHORITATIVE');
  assert.equal(okSafeView.data?.name, 'Zeynep Kaya');

  console.log('[PASS] customer360Service tests verified');
}

await runCustomer360ServiceTests();
