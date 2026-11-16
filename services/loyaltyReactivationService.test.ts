import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  LoyaltyReactivationService,
  loyaltyReactivationService,
  getLoyaltyWalletCapabilityReport,
  validatePositiveMinorUnits,
  validateLoyaltyIsoCurrency,
} from './loyaltyReactivationService.ts';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const PKG_DEF_ID = '44444444-4444-4444-8444-444444444444';
const CUST_PKG_ID = '55555555-5555-4555-8555-555555555555';
const APPT_ID = '66666666-6666-4666-8666-666666666666';

export async function runLoyaltyReactivationServiceTests(): Promise<void> {
  // 1. Positive minor-unit and ISO currency validators
  assert.equal(validatePositiveMinorUnits(1500, 'amount'), 1500);
  assert.throws(() => validatePositiveMinorUnits(0, 'amount'), /INVALID_INPUT/);
  assert.throws(() => validatePositiveMinorUnits(-10, 'amount'), /INVALID_INPUT/);
  assert.throws(() => validatePositiveMinorUnits(12.5, 'amount'), /INVALID_INPUT/);
  assert.equal(validateLoyaltyIsoCurrency('try'), 'TRY');
  assert.throws(() => validateLoyaltyIsoCurrency('TR'), /INVALID_INPUT/);

  // 2. Capability boundary report enforces NO_GO & EXTERNAL_HOLD for live charge and live marketing dispatch
  const supaReport = getLoyaltyWalletCapabilityReport('supabase');
  assert.equal(supaReport.productionReady, false);
  assert.equal(supaReport.activeAuthority, 'DB_AUTHORITATIVE');
  const liveCharge = supaReport.capabilities.find((c) => c.capabilityId === 'live_deposit_payment_capture');
  const liveSend = supaReport.capabilities.find((c) => c.capabilityId === 'live_reactivation_marketing_dispatch');
  assert.equal(liveCharge?.authority, 'EXTERNAL_HOLD');
  assert.equal(liveSend?.authority, 'EXTERNAL_HOLD');

  const localReport = getLoyaltyWalletCapabilityReport('local');
  assert.equal(localReport.activeAuthority, 'LOCAL_SIMULATION');

  // 3. Direct requestLiveDepositCharge stays EXTERNAL_HOLD
  const holdRes = loyaltyReactivationService.requestLiveDepositCharge();
  assert.equal(holdRes.success, false);
  assert.equal(holdRes.authority, 'EXTERNAL_HOLD');
  assert.equal(holdRes.reasonCode, 'LIVE_PAYMENT_PROVIDER_CREDENTIALS_REQUIRED');

  // 4. Local simulation fails closed on all DB-authoritative wallet/loyalty/package/deposit mutations
  const walletLocalFail = await loyaltyReactivationService.transactWalletBalance(
    {
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      amountMinorUnits: 5000,
      operation: 'credit',
      idempotencyKey: 'local-deny-wal',
    },
    { mode: 'local' }
  );
  assert.equal(walletLocalFail.success, false);
  assert.equal(walletLocalFail.authority, 'LOCAL_SIMULATION');
  assert.equal(walletLocalFail.reasonCode, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');

  const pkgLocalFail = await loyaltyReactivationService.redeemPackageCredits(
    {
      tenantId: TENANT_ID,
      customerPackageId: CUST_PKG_ID,
      serviceId: SERVICE_ID,
      creditsToRedeem: 1,
      idempotencyKey: 'local-deny-pkg',
    },
    { mode: 'local' }
  );
  assert.equal(pkgLocalFail.success, false);
  assert.equal(pkgLocalFail.authority, 'LOCAL_SIMULATION');

  // 5. Reject raw plaintext gift card code (requires 64-hex SHA-256 digest)
  await assert.rejects(
    () =>
      loyaltyReactivationService.redeemGiftCard(
        {
          tenantId: TENANT_ID,
          codeHash: 'RAW-PLAINTEXT-CODE',
          amountMinorUnits: 2500,
          idempotencyKey: 'gc-bad-hash',
        },
        { mode: 'supabase' }
      ),
    /SHA-256 hex digest/
  );

  // 6. Reject reactivation boundaries other than 60 or 90 days
  await assert.rejects(
    () => loyaltyReactivationService.scanReactivationCohorts(TENANT_ID, 45 as any, { mode: 'supabase' }),
    /exactly 60 or 90/
  );

  // 7. Server-authoritative RPC delegation in supabase mode
  const calls: Array<{ fn: string; params?: Record<string, unknown> }> = [];
  const mockRpcClient = {
    rpc: async (fn: string, params?: Record<string, unknown>) => {
      calls.push({ fn, params });
      if (fn === 'get_customer_loyalty_profile') {
        return {
          data: {
            tenant_id: TENANT_ID,
            customer_id: CUSTOMER_ID,
            is_active: true,
            current_balance: 180,
            lifetime_earned: 260,
            lifetime_redeemed: 80,
            last_earned_at: '2026-02-01T10:00:00Z',
            last_redeemed_at: null,
          },
          error: null,
        };
      }
      if (fn === 'evaluate_booking_confirmation_deposit_policy') {
        return {
          data: {
            success: false,
            reason_code: 'PERCENTAGE_DEPOSIT_CALCULATION_UNAVAILABLE',
            price_units_source_truth: 'CATALOG_PRICE_UNIT_UNRESOLVED',
          },
          error: null,
        };
      }
      return { data: { success: true, balance_after_minor_units: 7500 }, error: null };
    },
  };

  const legacyInstance = new LoyaltyReactivationService(mockRpcClient);
  const profileFromClass = await legacyInstance.getLoyaltyProfile(TENANT_ID, CUSTOMER_ID);
  assert.equal(profileFromClass.currentBalance, 180);

  const evalFailClosed = await loyaltyReactivationService.evaluateDepositPolicy(TENANT_ID, SERVICE_ID, {
    mode: 'supabase',
    rpcClient: mockRpcClient,
  });
  assert.equal(evalFailClosed.success, false);
  assert.equal(evalFailClosed.reasonCode, 'PERCENTAGE_DEPOSIT_CALCULATION_UNAVAILABLE');
  assert.equal(evalFailClosed.data?.priceUnitsSourceTruth, 'CATALOG_PRICE_UNIT_UNRESOLVED');

  await loyaltyReactivationService.setDepositPolicy(
    {
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      depositType: 'fixed_amount',
      depositValueMinorOrPercent: 25000,
      currency: 'try',
    },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );

  await loyaltyReactivationService.grantCustomerPackage(
    {
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      packageDefinitionId: PKG_DEF_ID,
      customValidityDays: 60,
    },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );

  const validHash = crypto.createHash('sha256').update('LARI-GIFT-2026').digest('hex');
  const gcOk = await loyaltyReactivationService.redeemGiftCard(
    {
      tenantId: TENANT_ID,
      codeHash: validHash,
      amountMinorUnits: 5000,
      customerId: CUSTOMER_ID,
      appointmentId: APPT_ID,
      idempotencyKey: 'gc-redeem-001',
    },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(gcOk.success, true);
  assert.equal(gcOk.authority, 'DB_AUTHORITATIVE');

  const walDebit = await loyaltyReactivationService.transactWalletBalance(
    {
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      amountMinorUnits: 2500,
      operation: 'debit',
      currency: 'TRY',
      appointmentId: APPT_ID,
      idempotencyKey: 'wal-debit-001',
    },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(walDebit.success, true);
  assert.ok(calls.some((c) => c.fn === 'redeem_gift_card' && c.params?.p_code_hash === validHash));
  assert.ok(calls.some((c) => c.fn === 'transact_wallet_balance' && c.params?.p_amount_minor === 2500));

  console.log('[PASS] loyaltyReactivationService tests verified');
}

await runLoyaltyReactivationServiceTests();
