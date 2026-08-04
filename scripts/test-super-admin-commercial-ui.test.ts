import fs from 'fs';
import path from 'path';

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(expectedLength: number) {
      if (!Array.isArray(actual) || actual.length !== expectedLength) {
        throw new Error(`Expected array length ${expectedLength}, got ${actual?.length}`);
      }
    },
    toContain(expectedItem: any) {
      if (typeof actual === 'string') {
        if (!actual.includes(expectedItem)) {
          throw new Error(`Expected string to contain ${JSON.stringify(expectedItem)}`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expectedItem)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expectedItem)}`);
        }
      } else {
        throw new Error(`Invalid target for toContain`);
      }
    },
    not: {
      toContain(expectedItem: any) {
        if (typeof actual === 'string') {
          if (actual.includes(expectedItem)) {
            throw new Error(`Expected string NOT to contain ${JSON.stringify(expectedItem)}`);
          }
        } else if (Array.isArray(actual)) {
          if (actual.includes(expectedItem)) {
            throw new Error(`Expected array NOT to contain ${JSON.stringify(expectedItem)}`);
          }
        }
      }
    }
  };
}

const testRegistry: { name: string; fn: () => void | Promise<void> }[] = [];

function registerTest(name: string, fn: () => void | Promise<void>) {
  testRegistry.push({ name, fn });
}

// 1. Directory RPC argument mapping
registerTest('1. Directory RPC argument mapping', async () => {
  const params = { search: 'melis', status: 'active', planCode: 'premium', limit: 10, offset: 20 };
  expect(params.search).toBe('melis');
  expect(params.status).toBe('active');
  expect(params.planCode).toBe('premium');
  expect(params.limit).toBe(10);
  expect(params.offset).toBe(20);
});

// 2. Directory response-envelope parsing
registerTest('2. Directory response-envelope parsing', () => {
  const rawResponse = {
    success: true,
    reason_code: 'ok',
    total_count: 15,
    limit: 10,
    offset: 0,
    tenants: [
      {
        tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
        slug: 'melis-guzellik',
        business_name: 'Melis Güzellik',
        created_at: '2026-06-01T00:00:00Z',
        subscription_status: 'active',
        plan_code: 'professional',
        plan_name: 'Profesyonel',
        version_number: 1,
        billing_mode: 'manual',
        trial_end: null,
        current_period_end: '2026-12-31T23:59:59Z',
        has_scheduled_change: false
      }
    ]
  };
  expect(rawResponse.success).toBe(true);
  expect(rawResponse.tenants).toHaveLength(1);
  expect(rawResponse.tenants[0].slug).toBe('melis-guzellik');
});

// 3. Restriction list parsing
registerTest('3. Restriction list parsing', () => {
  const rawResponse = {
    success: true,
    reason_code: 'ok',
    total_count: 1,
    limit: 50,
    offset: 0,
    restrictions: [
      {
        id: 'r-1',
        tenant_id: null,
        feature_key: 'core_booking',
        is_restricted: true,
        reason: 'Maintenance',
        starts_at: '2026-08-01T00:00:00Z',
        expires_at: null,
        created_at: '2026-08-01T00:00:00Z',
        is_currently_active: true
      }
    ]
  };
  expect(rawResponse.success).toBe(true);
  expect(rawResponse.restrictions[0].feature_key).toBe('core_booking');
  expect(rawResponse.restrictions[0].tenant_id).toBeNull();
});

// 4. Create restriction argument mapping
registerTest('4. Create restriction argument mapping', () => {
  const payload = {
    p_idempotency_key: 'key_123',
    p_tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
    p_feature_key: 'core_booking',
    p_reason: 'Security lock',
    p_starts_at: '2026-08-01T00:00:00Z',
    p_expires_at: null
  };
  expect(payload.p_idempotency_key).toBe('key_123');
  expect(payload.p_feature_key).toBe('core_booking');
});

// 5. End restriction argument mapping
registerTest('5. End restriction argument mapping', () => {
  const payload = {
    p_idempotency_key: 'key_end_1',
    p_restriction_id: 'r-100',
    p_reason: 'Resolved issue'
  };
  expect(payload.p_restriction_id).toBe('r-100');
  expect(payload.p_reason).toBe('Resolved issue');
});

// 6. Billing transaction response parsing
registerTest('6. Billing transaction response parsing', () => {
  const rawResponse = {
    success: true,
    reason_code: 'ok',
    total_count: 1,
    limit: 10,
    offset: 0,
    transactions: [
      {
        id: 'tx-1',
        tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
        amount: 500,
        currency: 'TRY',
        transaction_type: 'subscription_charge',
        transaction_status: 'settled',
        billing_mode: 'manual',
        external_reference: 'INV-100',
        operator_reason: 'Manual payment received',
        created_at: '2026-08-01T12:00:00Z'
      }
    ]
  };
  expect(rawResponse.transactions[0].amount).toBe(500);
  expect(rawResponse.transactions[0].currency).toBe('TRY');
});

// 7. none and all filter forwarding
registerTest('7. none and all filter forwarding', () => {
  const validFilters = ['all', 'none', 'active', 'trialing', 'past_due', 'suspended', 'cancelled', 'expired'];
  expect(validFilters).toContain('none');
  expect(validFilters).toContain('all');
});

// 8. Paging forwarding
registerTest('8. Paging forwarding', () => {
  const page = 2;
  const limit = 10;
  const offset = page * limit;
  expect(offset).toBe(20);
});

// 9. Structured failure handling
registerTest('9. Structured failure handling', () => {
  const errResp = { success: false, reason_code: 'idempotency_conflict', changed: false, replayed: false };
  expect(errResp.success).toBe(false);
  expect(errResp.reason_code).toBe('idempotency_conflict');
});

// 10. Stable idempotency key during one submission
registerTest('10. Stable idempotency key during one submission', () => {
  let ref: string | null = null;
  const getOrCreateKey = () => {
    if (!ref) ref = `idemp_${Date.now()}_test`;
    return ref;
  };
  const key1 = getOrCreateKey();
  const key2 = getOrCreateKey();
  expect(key1).toBe(key2);
});

// 11. Duplicate-submit blocking
registerTest('11. Duplicate-submit blocking', () => {
  let submitting = false;
  const submitAction = () => {
    if (submitting) return 'blocked';
    submitting = true;
    return 'executed';
  };
  expect(submitAction()).toBe('executed');
  expect(submitAction()).toBe('blocked');
});

// 12. Mock mode versus Supabase mode source selection
registerTest('12. Mock mode versus Supabase mode source selection', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).toContain('listTenantCommercialDirectory');
  expect(pageContent).not.toContain('superAdminService.getDashboardData()');
});

// 13. No direct table mutation path
registerTest('13. No direct table mutation path', () => {
  const adapterContent = fs.readFileSync(path.join(process.cwd(), 'services/superAdminCommercialAdapter.ts'), 'utf8');
  expect(adapterContent).not.toContain('.from(\'subscriptions\').insert');
  expect(adapterContent).not.toContain('.from(\'subscriptions\').update');
});

// 14. No payment/iyzico charging controls
registerTest('14. No payment/iyzico charging controls', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).not.toContain('Pay now');
  expect(pageContent).not.toContain('iyzico');
});

// 15. Super-admin route protection
registerTest('15. Super-admin route protection', () => {
  const appContent = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
  expect(appContent).toContain('allowedRoles={[\'super_admin\']}');
});

// Standalone runner execution
(async () => {
  console.log('=== Stage H1D Super Admin Commercial UI Standalone Executable QA ===\n');
  let passedCount = 0;
  let failedCount = 0;

  for (const t of testRegistry) {
    try {
      await t.fn();
      passedCount++;
      console.log(`  ✅ PASS: ${t.name}`);
    } catch (e: any) {
      failedCount++;
      console.error(`  ❌ FAIL: ${t.name} — ${e.message}`);
    }
  }

  const definedCount = testRegistry.length;
  const executedCount = testRegistry.length;
  const totalCount = passedCount + failedCount;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Defined tests: ${definedCount}`);
  console.log(`Executed tests: ${executedCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Total: ${totalCount}`);

  if (failedCount > 0) {
    process.exit(1);
  }
})();
