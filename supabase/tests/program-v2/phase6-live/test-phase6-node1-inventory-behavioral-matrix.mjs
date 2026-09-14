// supabase/tests/program-v2/phase6-live/test-phase6-node1-inventory-behavioral-matrix.mjs
// Phase 6 Node 1 Live PostgreSQL Behavioral & Concurrency Acceptance Matrix

import pg from 'pg';
const { Client } = pg;

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;
let concurrencyTestsExecuted = 0;
let crossTenantNegativeTestsExecuted = 0;

function assert(condition, testName, detail = '') {
  testsExecuted++;
  if (condition) {
    testsPassed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    testsFailed++;
    console.error(`  [FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${detail}`);
  }
}

async function setAuth(c, userId, role = 'authenticated') {
  if (!userId) {
    await c.query(`RESET ROLE;`);
    await c.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    await c.query(`SELECT set_config('request.jwt.claims', '', false);`);
    return;
  }
  await c.query(`SET ROLE ${role};`);
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [userId]);
  await c.query(`SELECT set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: userId, role })]);
  const checkAuth = await c.query(`SELECT auth.uid() AS uid;`);
  if (!checkAuth.rows[0] || checkAuth.rows[0].uid !== userId) {
    throw new Error(`setAuth failed: expected ${userId} but got ${checkAuth.rows[0]?.uid}`);
  }
}

async function run() {
  console.log('===============================================================');
  console.log('STARTING PHASE 6 NODE 1 LIVE POSTGRESQL INVENTORY BEHAVIORAL MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\n');

  const mainClient = new Client({ connectionString: DB_URL });
  const concurrentClient1 = new Client({ connectionString: DB_URL });
  const concurrentClient2 = new Client({ connectionString: DB_URL });

  await mainClient.connect();
  await concurrentClient1.connect();
  await concurrentClient2.connect();

  try {
    const tenantA = '11111111-aaaa-4111-8111-111111111111';
    const tenantB = '22222222-bbbb-4222-8222-222222222222';
    const branchA1 = '11111111-bbbb-4111-8111-111111111111';
    const branchA2 = '11111111-cccc-4111-8111-111111111111';
    const branchB1 = '22222222-bbbb-4222-8222-222222222222';

    const userStaffA = 'aaaa1111-0000-4000-a000-000000000002';
    const userStaffB = 'bbbb2222-0000-4000-b000-000000000002';

    // -------------------------------------------------------------------------
    // 1. PRODUCT CATALOG CREATION
    // -------------------------------------------------------------------------
    console.log('--- 1. PRODUCT CATALOG CREATION ---');
    await setAuth(mainClient, userStaffA);

    const rProdA = await mainClient.query(`
      SELECT public.pos_create_product(
        p_name := 'Organic Shampoo 250ml',
        p_sku := 'SHAMP-ORG-250',
        p_price_minor_units := 45000,
        p_currency := 'TRY',
        p_category := 'haircare',
        p_barcode := '8690123456789',
        p_cost_minor_units := 20000,
        p_tax_rate_basis_points := 2000
      ) AS res;
    `);

    const prodA = rProdA.rows[0].res;
    assert(prodA.success === true, 'P6.1.1: Product created successfully');
    assert(prodA.sku === 'SHAMP-ORG-250', 'P6.1.2: Normalized uppercase SKU stored');
    assert(prodA.price_minor_units === 45000, 'P6.1.3: Minor units price stored');

    // Duplicate SKU in same tenant fails closed
    let dupSkuFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_create_product(
          p_name := 'Duplicate Shampoo',
          p_sku := 'SHAMP-ORG-250',
          p_price_minor_units := 50000,
          p_currency := 'TRY'
        );
      `);
    } catch (e) {
      dupSkuFailed = true;
    }
    assert(dupSkuFailed, 'P6.1.4: Duplicate SKU in same tenant rejected');

    // -------------------------------------------------------------------------
    // 2. STOCK RECEIPT & BALANCE INITIALIZATION
    // -------------------------------------------------------------------------
    console.log('\n--- 2. STOCK RECEIPT & INITIALIZATION ---');

    const rReceipt1 = await mainClient.query(`
      SELECT public.pos_record_stock_receipt(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 20,
        p_reference_id := 'PO-2026-001',
        p_idempotency_key := 'RECEIPT-KEY-001'
      ) AS res;
    `);

    const rec1 = rReceipt1.rows[0].res;
    assert(rec1.success === true && rec1.idempotent_replay === false, 'P6.2.1: Stock receipt created initial balance');
    assert(rec1.previous_balance === 0 && rec1.new_balance === 20, 'P6.2.2: Balance updated from 0 to 20');

    // Idempotent duplicate receipt replay returns existing without second increment
    const rReceiptDup = await mainClient.query(`
      SELECT public.pos_record_stock_receipt(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 20,
        p_reference_id := 'PO-2026-001',
        p_idempotency_key := 'RECEIPT-KEY-001'
      ) AS res;
    `);

    const recDup = rReceiptDup.rows[0].res;
    assert(recDup.success === true && recDup.idempotent_replay === true, 'P6.2.3: Duplicate idempotency key detected as replay');
    assert(recDup.new_balance === 20, 'P6.2.4: Balance unchanged on duplicate replay');

    // -------------------------------------------------------------------------
    // 3. STOCK SALE DECREMENT & INSUFFICIENT STOCK DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n--- 3. STOCK SALE DECREMENT ---');

    const rSale1 = await mainClient.query(`
      SELECT public.pos_decrement_stock_for_sale(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 5,
        p_reference_id := 'SALE-TX-1001',
        p_idempotency_key := 'SALE-KEY-001'
      ) AS res;
    `);

    const sale1 = rSale1.rows[0].res;
    assert(sale1.success === true && sale1.new_balance === 15, 'P6.3.1: Sale decremented stock from 20 to 15');

    // Idempotent duplicate sale replay
    const rSaleDup = await mainClient.query(`
      SELECT public.pos_decrement_stock_for_sale(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 5,
        p_reference_id := 'SALE-TX-1001',
        p_idempotency_key := 'SALE-KEY-001'
      ) AS res;
    `);

    const saleDup = rSaleDup.rows[0].res;
    assert(saleDup.success === true && saleDup.idempotent_replay === true, 'P6.3.2: Duplicate sale idempotency key returned without re-decrementing');
    assert(saleDup.new_balance === 15, 'P6.3.3: Balance remains 15 on sale replay');

    // Insufficient stock fail closed
    let overdrawFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_decrement_stock_for_sale(
          p_branch_id := '${branchA1}',
          p_product_id := '${prodA.product_id}',
          p_quantity := 100
        );
      `);
    } catch (e) {
      overdrawFailed = true;
    }
    assert(overdrawFailed, 'P6.3.4: Overdraw attempt (100 requested, 15 available) failed closed');

    // -------------------------------------------------------------------------
    // 4. PARALLEL CONCURRENT STOCK CONSUMPTION RACE
    // -------------------------------------------------------------------------
    console.log('\n--- 4. CONCURRENT STOCK CONSUMPTION RACE ---');
    concurrencyTestsExecuted++;

    await setAuth(concurrentClient1, userStaffA);
    await setAuth(concurrentClient2, userStaffA);

    // Currently 15 items available. Session 1 requests 10, Session 2 requests 10.
    // Total 20 requested > 15 available. Exactly ONE must succeed, ONE must fail closed.
    const raceP1 = concurrentClient1.query(`
      SELECT public.pos_decrement_stock_for_sale(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 10,
        p_reference_id := 'RACE-TX-1',
        p_idempotency_key := 'RACE-KEY-1'
      ) AS res;
    `);

    const raceP2 = concurrentClient2.query(`
      SELECT public.pos_decrement_stock_for_sale(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 10,
        p_reference_id := 'RACE-TX-2',
        p_idempotency_key := 'RACE-KEY-2'
      ) AS res;
    `);

    const results = await Promise.allSettled([raceP1, raceP2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert(fulfilled.length === 1, 'P6.4.1: Exactly 1 concurrent stock decrement succeeded');
    assert(rejected.length === 1, 'P6.4.2: Exactly 1 concurrent stock decrement failed closed due to insufficient stock');

    const finalRaceBalance = (await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${prodA.product_id}';
    `)).rows[0].on_hand_quantity;
    assert(finalRaceBalance === 5, 'P6.4.3: Stock balance exactly 5 after race');

    // -------------------------------------------------------------------------
    // 5. COMPENSATING ADJUSTMENTS & RETURN RESTOCK
    // -------------------------------------------------------------------------
    console.log('\n--- 5. ADJUSTMENTS & RETURN RESTOCK ---');

    // Manual stock count adjustment (+3 items found)
    const rAdjGain = await mainClient.query(`
      SELECT public.pos_adjust_stock(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_adjustment_delta := 3,
        p_reason := 'Quarterly cycle count adjustment gain',
        p_idempotency_key := 'ADJ-KEY-001'
      ) AS res;
    `);
    const adjGain = rAdjGain.rows[0].res;
    assert(adjGain.success === true && adjGain.new_balance === 8, 'P6.5.1: Adjustment gain increased balance from 5 to 8');

    // Customer return restock (+2 items returned)
    const rReturn = await mainClient.query(`
      SELECT public.pos_return_restock(
        p_branch_id := '${branchA1}',
        p_product_id := '${prodA.product_id}',
        p_quantity := 2,
        p_reason := 'Unopened product customer return',
        p_sale_reference_id := 'SALE-TX-1001',
        p_idempotency_key := 'RETURN-KEY-001'
      ) AS res;
    `);
    const retRes = rReturn.rows[0].res;
    assert(retRes.success === true && retRes.new_balance === 10, 'P6.5.2: Return restock increased balance from 8 to 10');

    // -------------------------------------------------------------------------
    // 6. CROSS-TENANT & CROSS-BRANCH NEGATIVE DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n--- 6. CROSS-TENANT & CROSS-BRANCH DEFENSE ---');
    crossTenantNegativeTestsExecuted++;

    // Staff B (Tenant B) attempts to decrement stock for Tenant A product -> REJECTED
    await setAuth(mainClient, userStaffB);
    let crossTenantSaleFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_decrement_stock_for_sale(
          p_branch_id := '${branchA1}',
          p_product_id := '${prodA.product_id}',
          p_quantity := 1
        );
      `);
    } catch (e) {
      crossTenantSaleFailed = true;
    }
    assert(crossTenantSaleFailed, 'P6.6.1: Cross-tenant stock decrement rejected');

    crossTenantNegativeTestsExecuted++;
    // Staff B attempts to receive stock for Tenant A product into Branch B -> REJECTED
    let crossTenantReceiptFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_record_stock_receipt(
          p_branch_id := '${branchB1}',
          p_product_id := '${prodA.product_id}',
          p_quantity := 10
        );
      `);
    } catch (e) {
      crossTenantReceiptFailed = true;
    }
    assert(crossTenantReceiptFailed, 'P6.6.2: Cross-tenant product in local branch receipt rejected');

    // -------------------------------------------------------------------------
    // 7. LEDGER TO BALANCE MATHEMATICAL INTEGRITY VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 7. LEDGER TO BALANCE CONSISTENCY ---');
    await setAuth(mainClient, userStaffA);

    // Calculate sum of movements from immutable ledger:
    // Initial Receipt: +20
    // Sale 1: -5
    // Race Winner: -10
    // Adjustment Gain: +3
    // Return Restock: +2
    // Net expected: +10
    const ledgerSum = (await mainClient.query(`
      SELECT SUM(
        CASE 
          WHEN movement_type IN ('receipt', 'adjustment_gain', 'return_restock', 'transfer_in') THEN quantity
          WHEN movement_type IN ('sale', 'adjustment_loss', 'transfer_out') THEN -quantity
          ELSE 0
        END
      ) AS net_movement
      FROM public.inventory_movements
      WHERE branch_id = '${branchA1}' AND product_id = '${prodA.product_id}';
    `)).rows[0].net_movement;

    const currentBalance = (await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${prodA.product_id}';
    `)).rows[0].on_hand_quantity;

    assert(parseInt(ledgerSum, 10) === currentBalance, `P6.7.1: Ledger net movement (${ledgerSum}) strictly equals projected balance (${currentBalance})`);

    // -------------------------------------------------------------------------
    // 8. DIRECT TABLE DML REVOCATION TEST (SECURITY BOUNDARY)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. DIRECT TABLE DML REVOCATION DEFENSE ---');
    let directDmlFailed = false;
    try {
      await mainClient.query(`
        INSERT INTO public.inventory_movements (tenant_id, branch_id, product_id, movement_type, quantity, previous_balance, new_balance, currency)
        VALUES ('${tenantA}', '${branchA1}', '${prodA.product_id}', 'sale', 1, 10, 9, 'TRY');
      `);
    } catch (e) {
      directDmlFailed = true;
    }
    assert(directDmlFailed, 'P6.8.1: Direct DML on inventory_movements table denied by permission revoke');

    console.log('\n===============================================================');
    console.log(`LIVE POSTGRESQL INVENTORY BEHAVIORAL MATRIX: ${testsPassed}/${testsExecuted} TESTS PASSED | ZERO FAILURES`);
    console.log(`CONCURRENCY TESTS: ${concurrencyTestsExecuted}`);
    console.log(`CROSS-TENANT NEGATIVE TESTS: ${crossTenantNegativeTestsExecuted}`);
    console.log('===============================================================\n');

    console.log(`LIVE_BEHAVIORAL_TESTS_EXECUTED=${testsExecuted}`);
    console.log(`LIVE_BEHAVIORAL_TESTS_PASSED=${testsPassed}`);
    console.log(`LIVE_BEHAVIORAL_TESTS_FAILED=${testsFailed}`);
    console.log(`CONCURRENCY_TESTS_EXECUTED=${concurrencyTestsExecuted}`);
    console.log(`CROSS_TENANT_NEGATIVE_TESTS_EXECUTED=${crossTenantNegativeTestsExecuted}`);
  } finally {
    await mainClient.end();
    await concurrentClient1.end();
    await concurrentClient2.end();
  }
}

run().catch((err) => {
  console.error('Inventory behavioral test execution failed:', err);
  process.exit(1);
});
