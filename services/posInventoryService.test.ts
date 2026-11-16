import assert from 'node:assert/strict';
import {
  calculatePosLineTotalsMinor,
  calculateStaffCommissionMinor,
  getPosCapabilityBoundaryReport,
  posInventoryService,
  validateBasisPoints,
  validateIsoCurrency,
  validateMinorUnits,
} from './posInventoryService.ts';

export async function runPosInventoryServiceTests(): Promise<void> {
  // 1. Integer minor-unit POS line math (matches PostgreSQL pos_add_cart_item)
  const line1 = calculatePosLineTotalsMinor({
    unitPriceMinorUnits: 25000,
    quantity: 2,
    discountMinorUnits: 5000,
    taxRateBasisPoints: 2000, // 20%
  });
  assert.equal(line1.grossMinorUnits, 50000);
  assert.equal(line1.taxMinorUnits, 10000);
  assert.equal(line1.lineTotalMinorUnits, 55000);

  // Discount larger than gross+tax clamps safely to 0
  const lineClamped = calculatePosLineTotalsMinor({
    unitPriceMinorUnits: 1000,
    quantity: 1,
    discountMinorUnits: 2000,
    taxRateBasisPoints: 0,
  });
  assert.equal(lineClamped.lineTotalMinorUnits, 0);

  // 2. Staff commission integer math (excludes tax & tips)
  const comm = calculateStaffCommissionMinor({
    unitPriceMinorUnits: 25000,
    quantity: 2,
    discountMinorUnits: 5000,
    commissionBasisPoints: 1000, // 10%
  });
  assert.equal(comm.commissionableBaseMinorUnits, 45000);
  assert.equal(comm.commissionMinorUnits, 4500);

  // 3. Validators fail closed on invalid currency / fractional minor units / out-of-range basis points
  assert.equal(validateIsoCurrency(' try '), 'TRY');
  assert.throws(() => validateIsoCurrency('TR'), /INVALID_INPUT/);
  assert.throws(() => validateMinorUnits(12.5, 'amount'), /INVALID_INPUT/);
  assert.throws(() => validateMinorUnits(0, 'qty', true), /INVALID_INPUT/);
  assert.throws(() => validateBasisPoints(10001), /INVALID_INPUT/);

  // 4. Capability boundary classification: DB_AUTHORITATIVE vs LOCAL_SIMULATION vs EXTERNAL_HOLD
  const dbReport = getPosCapabilityBoundaryReport('supabase');
  assert.equal(dbReport.activeAuthority, 'DB_AUTHORITATIVE');
  assert.equal(dbReport.productionReady, false);
  const invCap = dbReport.capabilities.find((c) => c.capabilityId === 'product_catalog_inventory_ledger');
  assert.equal(invCap?.authority, 'DB_AUTHORITATIVE');
  const terminalCap = dbReport.capabilities.find((c) => c.capabilityId === 'card_terminal_hardware_psp');
  assert.equal(terminalCap?.authority, 'EXTERNAL_HOLD');
  assert.equal(terminalCap?.reasonCode, 'LIVE_POS_TERMINAL_CREDENTIALS_REQUIRED');
  const walletCap = dbReport.capabilities.find((c) => c.capabilityId === 'customer_wallet_settlement');
  assert.equal(walletCap?.authority, 'EXTERNAL_HOLD');
  const payoutCap = dbReport.capabilities.find((c) => c.capabilityId === 'staff_payroll_bank_payout');
  assert.equal(payoutCap?.authority, 'EXTERNAL_HOLD');

  const localReport = getPosCapabilityBoundaryReport('local');
  assert.equal(localReport.activeAuthority, 'LOCAL_SIMULATION');
  assert.equal(
    localReport.capabilities.find((c) => c.capabilityId === 'pos_mixed_cart_checkout')?.authority,
    'LOCAL_SIMULATION'
  );

  // 5. Fail-closed EXTERNAL_HOLD guards on live terminal, deferred wallet, and payroll payout
  const terminalCheckout = await posInventoryService.checkoutOrder(
    {
      orderId: 'ord-1',
      paymentMethod: 'card_terminal_adapter',
      amountPaidMinorUnits: 10000,
    },
    { mode: 'supabase' }
  );
  assert.equal(terminalCheckout.success, false);
  assert.equal(terminalCheckout.authority, 'EXTERNAL_HOLD');
  assert.equal(terminalCheckout.reasonCode, 'LIVE_POS_TERMINAL_CREDENTIALS_REQUIRED');

  const walletCheckout = await posInventoryService.checkoutOrder(
    {
      orderId: 'ord-1',
      paymentMethod: 'customer_wallet',
      amountPaidMinorUnits: 10000,
    },
    { mode: 'supabase' }
  );
  assert.equal(walletCheckout.success, false);
  assert.equal(walletCheckout.authority, 'EXTERNAL_HOLD');
  assert.equal(walletCheckout.reasonCode, 'WALLET_LEDGER_DEFERRED_TO_FAZ_D3');

  const payoutRes = posInventoryService.requestStaffPayout();
  assert.equal(payoutRes.success, false);
  assert.equal(payoutRes.authority, 'EXTERNAL_HOLD');
  assert.equal(payoutRes.reasonCode, 'INTERNAL_EARNINGS_ACCOUNTING_ONLY');

  // 6. Local mode never fakes DB RPC success
  const localCreate = await posInventoryService.createProduct(
    {
      name: 'Test Serum',
      sku: 'SKU-TST-1',
      priceMinorUnits: 15000,
      currency: 'TRY',
    },
    { mode: 'local' }
  );
  assert.equal(localCreate.success, false);
  assert.equal(localCreate.authority, 'LOCAL_SIMULATION');
  assert.equal(localCreate.reasonCode, 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE');

  // 7. Supabase mode delegates cleanly to SECURITY DEFINER RPC contract
  const rpcCalls: Array<{ fn: string; params: any }> = [];
  const mockRpcClient = {
    async rpc(fn: string, params?: Record<string, unknown>) {
      rpcCalls.push({ fn, params });
      return { data: { success: true, order_id: 'ord-db-1' }, error: null };
    },
  };

  const cashCheckout = await posInventoryService.checkoutOrder(
    {
      orderId: 'ord-db-1',
      paymentMethod: 'cash',
      amountPaidMinorUnits: 55000,
      idempotencyKey: 'key-1',
    },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(cashCheckout.success, true);
  assert.equal(cashCheckout.authority, 'DB_AUTHORITATIVE');
  assert.equal(rpcCalls[0].fn, 'pos_checkout_order');
  assert.equal(rpcCalls[0].params.p_payment_method, 'cash');
  assert.equal(rpcCalls[0].params.p_amount_paid_minor_units, 55000);

  // 8. Package deferral in local mode + RPC delegation for cart, PO receiving, commissions, tips, earnings & error propagation
  const pkgLocal = await posInventoryService.addCartItem(
    { orderId: 'ord-db-1', itemType: 'package', quantity: 1, packageId: 'pkg-1' },
    { mode: 'local' }
  );
  assert.equal(pkgLocal.success, false);
  assert.equal(pkgLocal.authority, 'EXTERNAL_HOLD');
  assert.equal(pkgLocal.reasonCode, 'PACKAGE_CATALOG_DEFERRED_TO_FAZ_D3');

  const emptyRecv = await posInventoryService.receivePurchaseOrderItems(
    { purchaseOrderId: 'po-1', receipts: [] },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(emptyRecv.success, false);
  assert.equal(emptyRecv.reasonCode, 'INVALID_INPUT');

  await assert.rejects(
    () =>
      posInventoryService.recordStockReceipt(
        { branchId: 'br-1', productId: 'prod-1', quantity: 0, costMinorUnits: 100 },
        { mode: 'supabase', rpcClient: mockRpcClient }
      ),
    /INVALID_INPUT/
  );

  await posInventoryService.addCartItem(
    { orderId: 'ord-db-1', itemType: 'product', quantity: 2, productId: 'prod-1', performingStaffId: 'stf-1' },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(rpcCalls[1].fn, 'pos_add_cart_item');
  assert.equal(rpcCalls[1].params.p_product_id, 'prod-1');

  await posInventoryService.receivePurchaseOrderItems(
    { purchaseOrderId: 'po-1', receipts: [{ po_item_id: 'poi-1', quantity_received: 3 }], idempotencyKey: 'recv-k1' },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(rpcCalls[2].fn, 'pos_receive_purchase_order_items');
  assert.equal(rpcCalls[2].params.p_idempotency_key, 'recv-k1');

  await posInventoryService.setStaffCommissionRule(
    { staffId: 'stf-1', itemType: 'product', commissionBasisPoints: 1500 },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(rpcCalls[3].fn, 'pos_set_staff_commission_rule');

  await posInventoryService.setTipAllocation(
    { orderId: 'ord-db-1', staffId: 'stf-1', tipMinorUnits: 2500 },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(rpcCalls[4].fn, 'pos_set_tip_allocation');

  await posInventoryService.getStaffEarnings(
    { staffId: 'stf-1' },
    { mode: 'supabase', rpcClient: mockRpcClient }
  );
  assert.equal(rpcCalls[5].fn, 'pos_get_staff_earnings');

  const errorRpcClient = {
    async rpc() {
      return { data: null, error: { message: 'CURRENCY_MISMATCH: Currency differs' } };
    },
  };
  const rpcErrRes = await posInventoryService.addCartItem(
    { orderId: 'ord-db-1', itemType: 'product', quantity: 1, productId: 'prod-1' },
    { mode: 'supabase', rpcClient: errorRpcClient }
  );
  assert.equal(rpcErrRes.success, false);
  assert.equal(rpcErrRes.authority, 'DB_AUTHORITATIVE');
  assert.equal(rpcErrRes.reasonCode, 'RPC_EXECUTION_ERROR');
  assert.match(rpcErrRes.error || '', /CURRENCY_MISMATCH/);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('posInventoryService.test.ts');

if (isDirectExecution) {
  await runPosInventoryServiceTests();
  console.log('[PASS] posInventoryService.test.ts');
}
