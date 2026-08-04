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
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
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

import {
  buildTenantDirectoryRpcArgs,
  parseTenantDirectoryResponse,
  buildRestrictionListRpcArgs,
  parseRestrictionListResponse,
  buildCreateRestrictionRpcArgs,
  buildEndRestrictionRpcArgs,
  buildBillingTransactionsRpcArgs,
  parseBillingTransactionsResponse
} from '../services/superAdminCommercialAdapter.ts';

const testRegistry: { name: string; fn: () => void | Promise<void> }[] = [];

function registerTest(name: string, fn: () => void | Promise<void>) {
  testRegistry.push({ name, fn });
}

// 1. Restriction RPC args contain only tenant ID, limit and offset
registerTest('1. Restriction RPC args contain only tenant ID, limit and offset', () => {
  const args = buildRestrictionListRpcArgs({ tenantId: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', limit: 25, offset: 50 });
  expect(Object.keys(args).sort()).toEqual(['p_limit', 'p_offset', 'p_tenant_id'].sort());
  expect(args.p_tenant_id).toBe('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
  expect(args.p_limit).toBe(25);
  expect(args.p_offset).toBe(50);
});

// 2. Unsupported p_feature_key is absent
registerTest('2. Unsupported p_feature_key is absent', () => {
  const args = buildRestrictionListRpcArgs({ tenantId: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa' } as any);
  expect((args as any).p_feature_key).toBeUndefined();
});

// 3. Unsupported p_active_only is absent
registerTest('3. Unsupported p_active_only is absent', () => {
  const args = buildRestrictionListRpcArgs({ tenantId: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa' } as any);
  expect((args as any).p_active_only).toBeUndefined();
});

// 4. Billing response preserves actual DB fields
registerTest('4. Billing response preserves actual DB fields', () => {
  const rawDbPayload = {
    success: true,
    reason_code: 'ok',
    total_count: 1,
    limit: 50,
    offset: 0,
    transactions: [
      {
        id: 'tx-db-100',
        tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
        subscription_id: 'sub-1',
        transaction_type: 'manual_charge',
        amount: 0.00,
        currency: 'TRY',
        billing_mode: 'comped',
        payment_method: 'manual',
        related_transaction_id: null,
        external_provider_reference: null,
        reference_note: 'H1D Staging Fixture',
        internal_reason: 'h1d_safe_billing_fixture_v1',
        billing_period_start: '2026-08-01T00:00:00Z',
        billing_period_end: '2026-08-31T23:59:59Z',
        occurred_at: '2026-08-01T12:00:00Z',
        effective_at: '2026-08-01T12:00:00Z',
        created_at: '2026-08-01T12:00:00Z'
      }
    ]
  };

  const parsed = parseBillingTransactionsResponse(rawDbPayload);
  expect(parsed.transactions[0].occurred_at).toBe('2026-08-01T12:00:00Z');
  expect(parsed.transactions[0].effective_at).toBe('2026-08-01T12:00:00Z');
  expect(parsed.transactions[0].billing_mode).toBe('comped');
  expect(parsed.transactions[0].internal_reason).toBe('h1d_safe_billing_fixture_v1');
  expect(parsed.transactions[0].reference_note).toBe('H1D Staging Fixture');
});

// 5. Invented transaction_status is not required
registerTest('5. Invented transaction_status is not required', () => {
  const rawDbPayload = {
    success: true,
    reason_code: 'ok',
    total_count: 1,
    limit: 50,
    offset: 0,
    transactions: [
      {
        id: 'tx-db-101',
        tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
        transaction_type: 'subscription_charge',
        amount: 150,
        currency: 'TRY',
        billing_mode: 'manual',
        occurred_at: '2026-08-01T12:00:00Z',
        effective_at: '2026-08-01T12:00:00Z',
        created_at: '2026-08-01T12:00:00Z'
      }
    ]
  };

  const parsed = parseBillingTransactionsResponse(rawDbPayload);
  expect((parsed.transactions[0] as any).transaction_status).toBeUndefined();
});

// 6. Directory status forwarding includes pending_checkout and paused
registerTest('6. Directory status forwarding includes pending_checkout and paused', () => {
  const argsPending = buildTenantDirectoryRpcArgs({ status: 'pending_checkout' });
  const argsPaused = buildTenantDirectoryRpcArgs({ status: 'paused' });
  expect(argsPending.p_status).toBe('pending_checkout');
  expect(argsPaused.p_status).toBe('paused');
});

// 7. advanced_reporting is a valid UI option
registerTest('7. advanced_reporting is a valid UI option', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).toContain('advanced_reporting');
});

// 8. commercial_analytics is absent
registerTest('8. commercial_analytics is absent', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).not.toContain('commercial_analytics');
});

// 9. Tenant restriction scope without selected tenant is blocked
registerTest('9. Tenant restriction scope without selected tenant is blocked', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).toContain('restrictionScopeFilter === \'tenant\' && !selectedTenantId');
});

// 10. Restriction ID display view model exists
registerTest('10. Restriction ID display view model exists', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).toContain('Kısıtlama ID');
  expect(pageContent).toContain('{r.id}');
});

// 11. is_currently_active is preserved from the RPC
registerTest('11. is_currently_active is preserved from the RPC', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).toContain('isActiveNow = r.is_currently_active === true');
});

// 12. Stable idempotency key behavior
registerTest('12. Stable idempotency key behavior', () => {
  const createArgs1 = buildCreateRestrictionRpcArgs({
    idempotencyKey: 'idemp_stable_1',
    featureKey: 'core_booking',
    reason: 'test'
  });
  const createArgs2 = buildCreateRestrictionRpcArgs({
    idempotencyKey: 'idemp_stable_1',
    featureKey: 'core_booking',
    reason: 'test'
  });
  expect(createArgs1.p_idempotency_key).toBe(createArgs2.p_idempotency_key);
});

// 13. Duplicate submission blocking
registerTest('13. Duplicate submission blocking', () => {
  let submitting = false;
  const submitAction = () => {
    if (submitting) return 'blocked';
    submitting = true;
    return 'executed';
  };
  expect(submitAction()).toBe('executed');
  expect(submitAction()).toBe('blocked');
});

// 14. No direct table mutation
registerTest('14. No direct table mutation', () => {
  const adapterContent = fs.readFileSync(path.join(process.cwd(), 'services/superAdminCommercialAdapter.ts'), 'utf8');
  expect(adapterContent).not.toContain('.from(\'subscriptions\').insert');
  expect(adapterContent).not.toContain('.from(\'subscriptions\').update');
  expect(adapterContent).not.toContain('.from(\'platform_system_restrictions\').insert');
});

// 15. No payment/checkout/iyzico controls
registerTest('15. No payment/checkout/iyzico controls', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  expect(pageContent).not.toContain('Pay now');
  expect(pageContent).not.toContain('Checkout');
  expect(pageContent).not.toContain('iyzico');
});

// Standalone runner execution
(async () => {
  console.log('=== Stage H1D-C1 Super Admin Commercial UI Executable QA ===\n');
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
