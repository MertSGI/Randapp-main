// supabase/tests/program-v2/phase6-live/test-phase6-node4-commissions-tips-behavioral-matrix.mjs
// Phase 6 Node 4 Live PostgreSQL Staff Commissions, Tip Allocation & Earnings Ledger Behavioral Matrix

import pg from 'pg';
const { Client } = pg;

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;
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
  console.log('STARTING PHASE 6 NODE 4 LIVE POSTGRESQL STAFF COMMISSIONS & TIPS BEHAVIORAL MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\n');

  const mainClient = new Client({ connectionString: DB_URL });
  await mainClient.connect();

  try {
    const tenantA = '11111111-aaaa-4111-8111-111111111111';
    const tenantB = '22222222-bbbb-4222-8222-222222222222';
    const branchA1 = '11111111-bbbb-4111-8111-111111111111';

    // Resolve fixture identities deterministically from database
    const ownerARow = await mainClient.query(`
      SELECT id FROM public.users_profile 
      WHERE tenant_id = '${tenantA}' AND role = 'tenant_owner' AND active = true
      LIMIT 1;
    `);
    const staffARow = await mainClient.query(`
      SELECT id, user_profile_id FROM public.staff 
      WHERE tenant_id = '${tenantA}' AND active = true
      ORDER BY created_at ASC
      LIMIT 1;
    `);
    const staffBRow = await mainClient.query(`
      SELECT id, user_profile_id FROM public.staff 
      WHERE tenant_id = '${tenantB}' AND active = true
      ORDER BY created_at ASC
      LIMIT 1;
    `);

    assert(ownerARow.rows.length > 0, 'Resolved Tenant A owner profile');
    assert(staffARow.rows.length > 0, 'Resolved Tenant A staff entity');
    assert(staffBRow.rows.length > 0, 'Resolved Tenant B staff entity');

    const userOwnerA = ownerARow.rows[0].id;
    const staffEntityA = staffARow.rows[0].id;
    const userStaffA = staffARow.rows[0].user_profile_id;

    const staffEntityB = staffBRow.rows[0].id;
    const userStaffB = staffBRow.rows[0].user_profile_id;

    console.log(`\nIdentities bound:
      Tenant A: ${tenantA}
      Owner A (user_profile): ${userOwnerA}
      Staff A (staff entity): ${staffEntityA}, (user_profile): ${userStaffA}
      Staff B (staff entity): ${staffEntityB}, (user_profile): ${userStaffB}
    `);

    // -------------------------------------------------------------------------
    // 1. DIRECT DML ATTEMPTS AGAINST ALL 3 NEW TABLES ARE BLOCKED
    // -------------------------------------------------------------------------
    console.log('\n--- 1. TRUST BOUNDARY: DIRECT DML REVOCATION ---');
    await setAuth(mainClient, userStaffA);

    let insertRuleBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.staff_commission_rules (tenant_id, staff_id, item_type, commission_basis_points, created_by_user_id)
        VALUES ('${tenantA}', '${staffEntityA}', 'product', 1000, '${userStaffA}');
      `);
    } catch (e) {
      insertRuleBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertRuleBlocked, 'Direct INSERT into staff_commission_rules strictly blocked');

    let insertTipBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.pos_tip_allocations (tenant_id, order_id, staff_id, amount_minor_units)
        VALUES ('${tenantA}', '${tenantA}', '${staffEntityA}', 500);
      `);
    } catch (e) {
      insertTipBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertTipBlocked, 'Direct INSERT into pos_tip_allocations strictly blocked');

    let insertLedgerBlocked = false;
    try {
      await mainClient.query(`
        INSERT INTO public.staff_earnings_ledger (tenant_id, staff_id, order_id, earning_type, source_amount_minor_units, earning_minor_units, currency, idempotency_key)
        VALUES ('${tenantA}', '${staffEntityA}', '${tenantA}', 'commission', 1000, 100, 'TRY', 'hack-key');
      `);
    } catch (e) {
      insertLedgerBlocked = e.message.includes('permission denied') || e.code === '42501';
    }
    assert(insertLedgerBlocked, 'Direct INSERT into staff_earnings_ledger strictly blocked');

    // -------------------------------------------------------------------------
    // 2. TENANT OWNER CREATES PRODUCT COMMISSION RULE (1000 BP = 10%)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. COMMISSION RULE CREATION BY TENANT OWNER ---');
    await setAuth(mainClient, userOwnerA);

    const ruleRes = await mainClient.query(`
      SELECT pos_set_staff_commission_rule(
        '${staffEntityA}',
        'product',
        1000,
        true
      ) AS result;
    `);
    const ruleObj = ruleRes.rows[0].result;
    assert(ruleObj.success === true && ruleObj.commission_basis_points === 1000, 'Tenant owner successfully set 10% (1000 BP) product commission rule for Staff A');

    // -------------------------------------------------------------------------
    // 3. ORDINARY STAFF CANNOT MUTATE COMMISSION RULES
    // -------------------------------------------------------------------------
    console.log('\n--- 3. ORDINARY STAFF COMMISSION RULE MUTATION BLOCKED ---');
    await setAuth(mainClient, userStaffA);

    let staffRuleBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_set_staff_commission_rule(
          '${staffEntityA}',
          'product',
          2000,
          true
        ) AS result;
      `);
    } catch (e) {
      staffRuleBlocked = e.message.includes('FORBIDDEN') || e.message.includes('Only active tenant_owner');
    }
    assert(staffRuleBlocked, 'Ordinary staff cannot mutate commission rules (tenant_owner only)');

    // -------------------------------------------------------------------------
    // 4. CROSS-TENANT COMMISSION RULE TARGET IS REJECTED
    // -------------------------------------------------------------------------
    console.log('\n--- 4. CROSS-TENANT COMMISSION RULE TARGET REJECTED ---');
    await setAuth(mainClient, userOwnerA);
    crossTenantNegativeTestsExecuted++;

    let crossTenantRuleBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_set_staff_commission_rule(
          '${staffEntityB}', -- Staff belonging to Tenant B
          'product',
          1000,
          true
        ) AS result;
      `);
    } catch (e) {
      crossTenantRuleBlocked = e.message.includes('CROSS_TENANT_VIOLATION') || e.message.includes('Target staff not found');
    }
    assert(crossTenantRuleBlocked, 'Setting commission rule for foreign tenant staff strictly rejected');

    // -------------------------------------------------------------------------
    // 5. CROSS-TENANT PERFORMING_STAFF_ID IN POS_ADD_CART_ITEM IS REJECTED
    // -------------------------------------------------------------------------
    console.log('\n--- 5. CROSS-TENANT PERFORMING STAFF ATTRIBUTION REJECTED ---');
    await setAuth(mainClient, userStaffA);

    // Create an open order in Tenant A
    const order1Res = await mainClient.query(`
      SELECT pos_create_order('${branchA1}', 'TRY', NULL, 'Order for Staff Attribution Test') AS result;
    `);
    const order1 = order1Res.rows[0].result;
    assert(order1.success === true, 'Created open POS order for attribution test');

    crossTenantNegativeTestsExecuted++;
    let crossTenantAttributionBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_add_cart_item(
          '${order1.order_id}',
          'custom',
          1,
          NULL, NULL, NULL, NULL,
          '${staffEntityB}', -- Foreign staff member
          'Styling',
          10000
        ) AS result;
      `);
    } catch (e) {
      crossTenantAttributionBlocked = e.message.includes('CROSS_TENANT_VIOLATION') || e.message.includes('Performing staff not found');
    }
    assert(crossTenantAttributionBlocked, 'Attributing performing_staff_id to foreign-tenant staff strictly rejected');

    // -------------------------------------------------------------------------
    // 6. CREATE PRODUCT: PRICE = 25000 MINOR UNITS, SUFFICIENT STOCK
    // -------------------------------------------------------------------------
    console.log('\n--- 6. PRODUCT SEEDING WITH SUFFICIENT STOCK ---');
    const prodRes = await mainClient.query(`
      SELECT pos_create_product(
        'Botanical Hair Oil 100ml',
        'SKU-OIL-100',
        25000,
        'TRY',
        'haircare'
      ) AS result;
    `);
    const oilId = prodRes.rows[0].result.product_id;
    assert(oilId !== undefined, 'Product SKU-OIL-100 created at 25000 minor units');

    await mainClient.query(`
      SELECT pos_record_stock_receipt(
        '${branchA1}',
        '${oilId}',
        10,
        15000,
        'REC-OIL-01',
        'seed_oil_stock'
      );
    `);

    // -------------------------------------------------------------------------
    // 7. CREATE OPEN POS ORDER
    // -------------------------------------------------------------------------
    console.log('\n--- 7. CREATE OPEN POS ORDER ---');
    const orderRes = await mainClient.query(`
      SELECT pos_create_order('${branchA1}', 'TRY', NULL, 'Commission & Tip Lifecycle Test') AS result;
    `);
    const orderObj = orderRes.rows[0].result;
    assert(orderObj.success === true && orderObj.status === 'open', 'Created open order for commission/tip test');

    // -------------------------------------------------------------------------
    // 8. ADD PRODUCT: QUANTITY = 2, PERFORMING_STAFF_ID = TENANT A STAFF
    // -------------------------------------------------------------------------
    console.log('\n--- 8. ADD PRODUCT LINE ITEM WITH STAFF ATTRIBUTION ---');
    // Price = 25000 * 2 = 50000, discount = 0, tax = 0 -> commission base = 50000
    const addProdRes = await mainClient.query(`
      SELECT pos_add_cart_item(
        '${orderObj.order_id}',
        'product',
        2,
        '${oilId}',
        NULL, NULL, NULL,
        '${staffEntityA}', -- Tenant A staff
        NULL, NULL, 0
      ) AS result;
    `);
    assert(addProdRes.rows[0].result.success === true, 'Added 2 units of product attributed to Staff A');
    assert(addProdRes.rows[0].result.order_total_minor_units === 50000, 'Order subtotal is 50000 minor units');

    // -------------------------------------------------------------------------
    // 9. ALLOCATE: 3000 MINOR UNITS TIP TO SAME TENANT A STAFF
    // -------------------------------------------------------------------------
    console.log('\n--- 9. ALLOCATE TIP TO STAFF A ---');
    const tipRes = await mainClient.query(`
      SELECT pos_set_tip_allocation(
        '${orderObj.order_id}',
        '${staffEntityA}',
        3000
      ) AS result;
    `);
    const tipObj = tipRes.rows[0].result;
    assert(tipObj.success === true, 'Allocated 3000 minor units tip to Staff A');
    assert(tipObj.tip_minor_units === 3000, 'pos_orders.tip_minor_units updated to 3000');
    assert(tipObj.total_minor_units === 53000, 'pos_orders.total_minor_units updated to 53000 (50000 items + 3000 tip)');

    // -------------------------------------------------------------------------
    // 10. ATTEMPT INSUFFICIENT-PAYMENT CHECKOUT -> ZERO NEW EARNINGS
    // -------------------------------------------------------------------------
    console.log('\n--- 10. INSUFFICIENT PAYMENT CHECKOUT & LEDGER INTEGRITY ---');
    let underpaymentBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_checkout_order(
          '${orderObj.order_id}',
          'cash',
          50000 -- underpaying 50000 vs 53000 total (omits tip)
        ) AS result;
      `);
    } catch (e) {
      underpaymentBlocked = e.message.includes('INSUFFICIENT_PAYMENT');
    }
    assert(underpaymentBlocked, 'Checkout with amount less than total (including tip) fails closed');

    const ledgerZeroCheck = await mainClient.query(`
      SELECT count(*) AS cnt FROM public.staff_earnings_ledger
      WHERE order_id = '${orderObj.order_id}';
    `);
    assert(parseInt(ledgerZeroCheck.rows[0].cnt) === 0, 'Zero staff earnings recorded on failed checkout attempt');

    // -------------------------------------------------------------------------
    // 11. SUCCESSFUL CHECKOUT WITH EXACT REQUIRED AMOUNT (53000)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. SUCCESSFUL CHECKOUT & EARNINGS MATERIALIZATION ---');
    const checkoutKey = `chk-comm-tip-${Date.now()}`;
    const checkoutRes = await mainClient.query(`
      SELECT pos_checkout_order(
        '${orderObj.order_id}',
        'cash',
        53000,
        'CASH-EXACT-01',
        '${checkoutKey}'
      ) AS result;
    `);
    const checkoutObj = checkoutRes.rows[0].result;
    assert(checkoutObj.success === true && checkoutObj.status === 'completed', 'Order successfully checked out for 53000 minor units');

    // Verify earnings ledger entries
    const commEntry = await mainClient.query(`
      SELECT * FROM public.staff_earnings_ledger
      WHERE order_id = '${orderObj.order_id}' AND earning_type = 'commission';
    `);
    assert(commEntry.rows.length === 1, 'Exactly one commission ledger entry generated');
    assert(commEntry.rows[0].earning_minor_units === 5000, 'Commission correctly calculated as 5000 minor units (10% of 50000)');
    assert(commEntry.rows[0].source_amount_minor_units === 50000, 'Commission source amount correctly recorded as 50000 (tax and tip excluded)');

    const tipEntry = await mainClient.query(`
      SELECT * FROM public.staff_earnings_ledger
      WHERE order_id = '${orderObj.order_id}' AND earning_type = 'tip';
    `);
    assert(tipEntry.rows.length === 1, 'Exactly one tip ledger entry generated');
    assert(tipEntry.rows[0].earning_minor_units === 3000, 'Tip correctly recorded as 3000 minor units');

    // -------------------------------------------------------------------------
    // 12. POS_GET_STAFF_EARNINGS RETURNS CORRECT BREAKDOWN
    // -------------------------------------------------------------------------
    console.log('\n--- 12. READ STAFF EARNINGS BREAKDOWN ---');
    const earningsRes = await mainClient.query(`
      SELECT pos_get_staff_earnings('${staffEntityA}') AS result;
    `);
    const earningsObj = earningsRes.rows[0].result;
    assert(earningsObj.success === true, 'pos_get_staff_earnings executed successfully');
    assert(earningsObj.commission_minor_units >= 5000, `Commission total includes 5000 (${earningsObj.commission_minor_units})`);
    assert(earningsObj.tip_minor_units >= 3000, `Tip total includes 3000 (${earningsObj.tip_minor_units})`);
    assert(earningsObj.total_earnings_minor_units === (earningsObj.commission_minor_units + earningsObj.tip_minor_units), 'Total earnings equals commission + tip sum');

    // -------------------------------------------------------------------------
    // 13. REPLAY CHECKOUT WITH IDEMPOTENCY KEY -> ZERO DUPLICATE EARNINGS
    // -------------------------------------------------------------------------
    console.log('\n--- 13. IDEMPOTENT CHECKOUT REPLAY: ZERO DUPLICATE EARNINGS ---');
    const ledgerCountBefore = await mainClient.query(`
      SELECT count(*) AS cnt FROM public.staff_earnings_ledger
      WHERE order_id = '${orderObj.order_id}';
    `);

    const replayRes = await mainClient.query(`
      SELECT pos_checkout_order(
        '${orderObj.order_id}',
        'cash',
        53000,
        'CASH-EXACT-01',
        '${checkoutKey}'
      ) AS result;
    `);
    const replayObj = replayRes.rows[0].result;
    assert(replayObj.success === true && replayObj.idempotent_replay === true, 'Checkout returned idempotent_replay = true');

    const ledgerCountAfter = await mainClient.query(`
      SELECT count(*) AS cnt FROM public.staff_earnings_ledger
      WHERE order_id = '${orderObj.order_id}';
    `);
    assert(ledgerCountBefore.rows[0].cnt === ledgerCountAfter.rows[0].cnt, 'Zero duplicate ledger rows created on checkout replay');

    // -------------------------------------------------------------------------
    // 14. FOREIGN TENANT STAFF CANNOT READ TENANT A STAFF EARNINGS
    // -------------------------------------------------------------------------
    console.log('\n--- 14. CROSS-TENANT EARNINGS READ BLOCKED ---');
    await setAuth(mainClient, userStaffB);
    crossTenantNegativeTestsExecuted++;

    let crossTenantEarningsBlocked = false;
    try {
      await mainClient.query(`
        SELECT pos_get_staff_earnings('${staffEntityA}') AS result;
      `);
    } catch (e) {
      crossTenantEarningsBlocked = e.message.includes('FORBIDDEN') || e.message.includes('Caller is not authorized');
    }
    assert(crossTenantEarningsBlocked, 'Foreign tenant staff cannot read Staff A earnings');

    // -------------------------------------------------------------------------
    // 15. TENANT OWNER CAN READ TENANT A STAFF EARNINGS
    // -------------------------------------------------------------------------
    console.log('\n--- 15. TENANT OWNER READS STAFF A EARNINGS ---');
    await setAuth(mainClient, userOwnerA);

    const ownerReadRes = await mainClient.query(`
      SELECT pos_get_staff_earnings('${staffEntityA}') AS result;
    `);
    assert(ownerReadRes.rows[0].result.success === true, 'Tenant owner successfully read Staff A earnings');

    // -------------------------------------------------------------------------
    // 16. STAFF CAN READ OWN EARNINGS
    // -------------------------------------------------------------------------
    console.log('\n--- 16. STAFF READS OWN EARNINGS ---');
    await setAuth(mainClient, userStaffA);

    const staffReadRes = await mainClient.query(`
      SELECT pos_get_staff_earnings('${staffEntityA}') AS result;
    `);
    assert(staffReadRes.rows[0].result.success === true, 'Staff A successfully read own earnings');

    console.log('\n===============================================================');
    console.log(`PHASE 6 NODE 4 BEHAVIORAL MATRIX PASSED: ${testsPassed}/${testsExecuted} tests`);
    console.log(`Cross-tenant negative tests executed: ${crossTenantNegativeTestsExecuted}`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n*** ERROR RUNNING PHASE 6 NODE 4 BEHAVIORAL MATRIX ***');
    console.error(err);
    process.exit(1);
  } finally {
    await mainClient.end();
  }
}

run();
