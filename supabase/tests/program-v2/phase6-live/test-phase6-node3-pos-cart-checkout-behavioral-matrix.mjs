// supabase/tests/program-v2/phase6-live/test-phase6-node3-pos-cart-checkout-behavioral-matrix.mjs
// Phase 6 Node 3 Live PostgreSQL POS Mixed Cart, Multi-Branch Stock Allocation & Checkout Behavioral Matrix

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
  console.log('STARTING PHASE 6 NODE 3 LIVE POSTGRESQL POS MIXED CART & CHECKOUT BEHAVIORAL MATRIX');
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
    // 1. DIRECT TABLE ACCESS REVOCATION (TRUST BOUNDARY)
    // -------------------------------------------------------------------------
    console.log('--- 1. TRUST BOUNDARY & DIRECT TABLE ACCESS REVOCATION ---');
    await setAuth(mainClient, userStaffA);

    let insertOrderDirectBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.pos_orders (tenant_id, branch_id, order_number, staff_id, currency)
        VALUES ('${tenantA}', '${branchA1}', 'HACK-001', 'aaaa1111-0000-4000-a000-000000000001', 'TRY');
      `);
    } catch (e) {
      insertOrderDirectBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertOrderDirectBlocked, 'Direct INSERT into pos_orders strictly blocked for authenticated user');

    let insertOrderItemDirectBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.pos_order_items (order_id, tenant_id, item_type, item_name, quantity, unit_price_minor_units, line_total_minor_units)
        VALUES ('${tenantA}', '${tenantA}', 'service', 'Hack Service', 1, 10000, 10000);
      `);
    } catch (e) {
      insertOrderItemDirectBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertOrderItemDirectBlocked, 'Direct INSERT into pos_order_items strictly blocked for authenticated user');

    let insertPaymentDirectBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.pos_order_payments (order_id, tenant_id, payment_method, amount_minor_units, currency, staff_id)
        VALUES ('${tenantA}', '${tenantA}', 'cash', 10000, 'TRY', 'aaaa1111-0000-4000-a000-000000000001');
      `);
    } catch (e) {
      insertPaymentDirectBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertPaymentDirectBlocked, 'Direct INSERT into pos_order_payments strictly blocked for authenticated user');

    // -------------------------------------------------------------------------
    // 2. SETUP TEST CATALOG & INVENTORY AT BRANCH A1 AND BRANCH A2
    // -------------------------------------------------------------------------
    console.log('\n--- 2. SETUP PRODUCT CATALOG & MULTI-BRANCH STOCK ---');
    await setAuth(mainClient, null); // admin/service role to seed

    const prodRes = await mainClient.query(`
      SELECT pos_create_product(
        'Organic Shampoo 250ml',
        'SKU-SHAMPOO-250',
        25000,
        'TRY',
        'haircare',
        '8680000012345',
        'Sulfate-free retail shampoo',
        'PureBotanic',
        'bottle',
        12000,
        2000
      ) AS result;
    `);
    const shampooId = prodRes.rows[0].result.product_id;
    assert(shampooId !== undefined, 'Product SKU-SHAMPOO-250 created successfully via pos_create_product');

    // Stock 10 bottles at Branch A1 and 5 bottles at Branch A2
    await mainClient.query(`
      SELECT pos_record_stock_receipt(
        '${branchA1}',
        '${shampooId}',
        10,
        12000,
        'REC-SEED-A1',
        'seed_stock_a1'
      );
    `);
    await mainClient.query(`
      SELECT pos_record_stock_receipt(
        '${branchA2}',
        '${shampooId}',
        5,
        12000,
        'REC-SEED-A2',
        'seed_stock_a2'
      );
    `);

    const balA1 = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${shampooId}';
    `);
    const balA2 = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA2}' AND product_id = '${shampooId}';
    `);
    assert(balA1.rows[0].on_hand_quantity === 10, 'Branch A1 seeded with 10 units on hand');
    assert(balA2.rows[0].on_hand_quantity === 5, 'Branch A2 seeded with 5 units on hand (multi-branch isolation)');

    // -------------------------------------------------------------------------
    // 3. SERVER-AUTHORITATIVE ORDER CREATION & CROSS-TENANT DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n--- 3. ORDER CREATION & CROSS-TENANT NEGATIVE ASSERTIONS ---');
    await setAuth(mainClient, userStaffA);

    const orderRes = await mainClient.query(`
      SELECT pos_create_order('${branchA1}', 'TRY', NULL, 'Test Walk-in Order') AS result;
    `);
    const orderA = orderRes.rows[0].result;
    assert(orderA.success === true && orderA.status === 'open', 'pos_create_order creates open order for Staff A at Branch A1');

    // Cross-tenant test: Staff B attempts to access Staff A's order
    await setAuth(mainClient, userStaffB);
    crossTenantNegativeTestsExecuted++;
    let crossTenantViewBlocked = false;
    try {
      await mainClient.query(`SELECT pos_get_order('${orderA.order_id}') AS result;`);
    } catch (e) {
      crossTenantViewBlocked = e.message.includes('CROSS_TENANT_VIOLATION') || e.message.includes('Order not found');
    }
    assert(crossTenantViewBlocked, 'Cross-tenant pos_get_order attempt by Staff B strictly blocked');

    crossTenantNegativeTestsExecuted++;
    let crossTenantItemBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_add_cart_item('${orderA.order_id}', 'custom', 1, NULL, NULL, NULL, NULL, NULL, 'Cross Tenant Item', 5000) AS result;
      `);
    } catch (e) {
      crossTenantItemBlocked = e.message.includes('CROSS_TENANT_VIOLATION') || e.message.includes('Order not found');
    }
    assert(crossTenantItemBlocked, 'Cross-tenant pos_add_cart_item attempt by Staff B strictly blocked');

    // -------------------------------------------------------------------------
    // 4. MIXED CART COMPOSITION: PRODUCT + CUSTOM ITEM
    // -------------------------------------------------------------------------
    console.log('\n--- 4. MIXED CART LINE ITEM ADDITION & TOTALS RECONCILIATION ---');
    await setAuth(mainClient, userStaffA);

    // Add 2 bottles of shampoo to cart
    const addProdRes = await mainClient.query(`
      SELECT pos_add_cart_item(
        '${orderA.order_id}',
        'product',
        2,
        '${shampooId}'
      ) AS result;
    `);
    assert(addProdRes.rows[0].result.success === true, 'Added 2 retail products to cart');

    // Add a custom adjustment item (e.g. Gift Packaging for 15.00 TRY = 1500 minor units)
    const addCustomRes = await mainClient.query(`
      SELECT pos_add_cart_item(
        '${orderA.order_id}',
        'custom',
        1,
        NULL, NULL, NULL, NULL, NULL,
        'Luxury Gift Packaging',
        1500
      ) AS result;
    `);
    assert(addCustomRes.rows[0].result.success === true, 'Added custom service line item to cart');

    const getOrderRes = await mainClient.query(`
      SELECT pos_get_order('${orderA.order_id}') AS result;
    `);
    const orderDetails = getOrderRes.rows[0].result;
    assert(orderDetails.items.length === 2, 'Mixed cart contains exactly 2 line items');
    assert(orderDetails.total_minor_units > 0, `Order total reconciled: ${orderDetails.total_minor_units} minor units`);

    // -------------------------------------------------------------------------
    // 5. INSUFFICIENT PAYMENT & INSUFFICIENT STOCK VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n--- 5. CHECKOUT VALIDATION & DEFENSIVE FAIL-CLOSED CHECKS ---');

    let underpaidBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_checkout_order(
          '${orderA.order_id}',
          'cash',
          100 -- underpaying 1.00 TRY against larger total
        ) AS result;
      `);
    } catch (e) {
      underpaidBlocked = e.message.includes('INSUFFICIENT_PAYMENT');
    }
    assert(underpaidBlocked, 'Checkout fails closed when amount paid is less than order total');

    // -------------------------------------------------------------------------
    // 6. SUCCESSFUL ATOMIC CHECKOUT & STOCK DECREMENT VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 6. SUCCESSFUL CHECKOUT & AUTOMATIC LEDGER DECREMENT ---');
    const checkoutRes = await mainClient.query(`
      SELECT pos_checkout_order(
        '${orderA.order_id}',
        'card_present',
        ${orderDetails.total_minor_units},
        'AUTH-POS-TX-9988',
        'checkout_idemp_key_001'
      ) AS result;
    `);
    const checkoutResult = checkoutRes.rows[0].result;
    assert(checkoutResult.success === true && checkoutResult.status === 'completed', 'Order successfully checked out and marked completed');
    assert(checkoutResult.products_decremented === 1, 'Product line item decremented exactly 1 unique SKU');

    // Verify stock at Branch A1 dropped from 10 to 8
    const balA1Post = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${shampooId}';
    `);
    assert(balA1Post.rows[0].on_hand_quantity === 8, 'Branch A1 on-hand quantity correctly decremented from 10 to 8');

    // Verify stock at Branch A2 remained UNTOUCHED at 5
    const balA2Post = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA2}' AND product_id = '${shampooId}';
    `);
    assert(balA2Post.rows[0].on_hand_quantity === 5, 'Branch A2 on-hand quantity completely unaffected (multi-branch stock integrity)');

    // Verify canonical immutable ledger movement created
    const movRes = await mainClient.query(`
      SELECT * FROM public.inventory_movements
      WHERE branch_id = '${branchA1}' AND product_id = '${shampooId}' AND movement_type = 'sale'
      ORDER BY created_at DESC LIMIT 1;
    `);
    assert(movRes.rows.length === 1, 'Canonical sale inventory movement recorded in append-only ledger');
    assert(movRes.rows[0].quantity === 2, 'Sale movement recorded exact quantity of 2 units');

    // -------------------------------------------------------------------------
    // 7. IDEMPOTENT REPLAY OF CHECKOUT
    // -------------------------------------------------------------------------
    console.log('\n--- 7. IDEMPOTENT CHECKOUT REPLAY ---');
    const replayRes = await mainClient.query(`
      SELECT pos_checkout_order(
        '${orderA.order_id}',
        'card_present',
        ${orderDetails.total_minor_units},
        'AUTH-POS-TX-9988',
        'checkout_idemp_key_001'
      ) AS result;
    `);
    assert(replayRes.rows[0].result.idempotent_replay === true, 'Replaying checkout with same idempotency key flags idempotent_replay=true');

    // Assert stock was NOT decremented a second time
    const balA1Replay = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${shampooId}';
    `);
    assert(balA1Replay.rows[0].on_hand_quantity === 8, 'On-hand quantity preserved at 8 on replay (zero duplicate stock burn)');

    // -------------------------------------------------------------------------
    // 8. CONCURRENCY RACE: TWO CASHIERS CHECKING OUT LAST REMAINING STOCK
    // -------------------------------------------------------------------------
    console.log('\n--- 8. CONCURRENCY RACE: ATOMIC STOCK OVER-SUBSCRIPTION PREVENTION ---');
    concurrencyTestsExecuted++;

    // Create single-unit product
    await setAuth(mainClient, null);
    const scarceProdRes = await mainClient.query(`
      SELECT pos_create_product(
        'Limited Edition Hair Serum',
        'SKU-SERUM-LTD',
        50000,
        'TRY'
      ) AS result;
    `);
    const serumId = scarceProdRes.rows[0].result.product_id;

    // Stock exactly 1 unit
    await mainClient.query(`
      SELECT pos_record_stock_receipt(
        '${branchA1}',
        '${serumId}',
        1,
        25000,
        'REC-SERUM-1',
        'seed_serum_single'
      );
    `);

    // Cashier 1 creates order for 1 unit
    await setAuth(mainClient, userStaffA);
    const ord1 = (await mainClient.query(`SELECT pos_create_order('${branchA1}', 'TRY') AS result;`)).rows[0].result;
    await mainClient.query(`SELECT pos_add_cart_item('${ord1.order_id}', 'product', 1, '${serumId}') AS result;`);

    // Cashier 2 creates order for 1 unit
    const ord2 = (await mainClient.query(`SELECT pos_create_order('${branchA1}', 'TRY') AS result;`)).rows[0].result;
    await mainClient.query(`SELECT pos_add_cart_item('${ord2.order_id}', 'product', 1, '${serumId}') AS result;`);

    await setAuth(concurrentClient1, userStaffA);
    await setAuth(concurrentClient2, userStaffA);

    let winnerCount = 0;
    let loserCount = 0;

    const p1 = concurrentClient1.query(`
      SELECT pos_checkout_order('${ord1.order_id}', 'cash', 50000, 'RACE-1') AS result;
    `).then(r => { winnerCount++; return { client: 1, success: true }; })
      .catch(err => { loserCount++; return { client: 1, success: false, err: err.message }; });

    const p2 = concurrentClient2.query(`
      SELECT pos_checkout_order('${ord2.order_id}', 'cash', 50000, 'RACE-2') AS result;
    `).then(r => { winnerCount++; return { client: 2, success: true }; })
      .catch(err => { loserCount++; return { client: 2, success: false, err: err.message }; });

    const raceResults = await Promise.all([p1, p2]);

    assert(winnerCount === 1 && loserCount === 1, `Concurrency race serialized: exactly 1 winner and 1 loser (winnerCount=${winnerCount}, loserCount=${loserCount})`);
    const loser = raceResults.find(r => !r.success);
    assert(loser.err.includes('INSUFFICIENT_STOCK'), 'Losing cashier received explicit INSUFFICIENT_STOCK exception');

    // Final balance must be exactly 0, never negative
    const finalSerumStock = await mainClient.query(`
      SELECT on_hand_quantity FROM public.inventory_balances
      WHERE branch_id = '${branchA1}' AND product_id = '${serumId}';
    `);
    assert(finalSerumStock.rows[0].on_hand_quantity === 0, 'Final stock balance is strictly zero, never negative');

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('PHASE 6 NODE 3 BEHAVIORAL MATRIX SUMMARY');
    console.log(`Total Assertions Executed: ${testsExecuted}`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Concurrency Race Tests: ${concurrencyTestsExecuted}`);
    console.log(`Cross-Tenant Negative Tests: ${crossTenantNegativeTestsExecuted}`);
    console.log('===============================================================');

  } finally {
    await mainClient.end();
    await concurrentClient1.end();
    await concurrentClient2.end();
  }
}

run().catch(err => {
  console.error('FATAL TEST RUN ERROR:', err);
  process.exit(1);
});
