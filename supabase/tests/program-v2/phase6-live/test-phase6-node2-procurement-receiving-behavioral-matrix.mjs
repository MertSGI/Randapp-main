// supabase/tests/program-v2/phase6-live/test-phase6-node2-procurement-receiving-behavioral-matrix.mjs
// Phase 6 Node 2 Live PostgreSQL Suppliers, Purchase Orders & Receiving Behavioral Matrix

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
  console.log('STARTING PHASE 6 NODE 2 LIVE POSTGRESQL PROCUREMENT & RECEIVING BEHAVIORAL MATRIX');
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
    // 1. SUPPLIER DOMAIN CREATION & BOUNDARIES
    // -------------------------------------------------------------------------
    console.log('--- 1. SUPPLIER CREATION & IDENTITY ---');
    await setAuth(mainClient, userStaffA);

    const rSuppA1 = await mainClient.query(`
      SELECT public.pos_create_supplier(
        p_name := 'Dermacare Pharma Ltd',
        p_contact_person := 'Ali Yilmaz',
        p_email := 'orders@dermacare.com.tr',
        p_phone := '+902125550101',
        p_tax_identifier := 'TR1234567890',
        p_address := 'Sisli, Istanbul'
      ) AS res;
    `);
    const suppA1 = rSuppA1.rows[0].res;
    assert(suppA1.success === true && suppA1.supplier_id, 'P6.2.1: Supplier A1 created successfully');
    assert(suppA1.name === 'Dermacare Pharma Ltd', 'P6.2.2: Supplier name stored accurately');
    assert(suppA1.is_active === true, 'P6.2.3: Supplier active state initialized to true');

    // Duplicate supplier in same tenant fails closed
    let dupSuppFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_create_supplier(
          p_name := 'Dermacare Pharma Ltd'
        );
      `);
    } catch (e) {
      dupSuppFailed = true;
    }
    assert(dupSuppFailed, 'P6.2.4: Duplicate supplier name in same tenant rejected fail-closed');

    // Create a second supplier in Tenant A and mark inactive for inactive-supplier checks
    const rSuppA2 = await mainClient.query(`
      SELECT public.pos_create_supplier(
        p_name := 'Discontinued Lab Supplies',
        p_is_active := false
      ) AS res;
    `);
    const suppA2 = rSuppA2.rows[0].res;

    // Create a supplier in Tenant B
    await setAuth(mainClient, userStaffB);
    const rSuppB1 = await mainClient.query(`
      SELECT public.pos_create_supplier(
        p_name := 'Anatolia Medical Supplies'
      ) AS res;
    `);
    const suppB1 = rSuppB1.rows[0].res;
    assert(suppB1.success === true, 'P6.2.5: Supplier B1 created in Tenant B');

    // -------------------------------------------------------------------------
    // 2. PURCHASE ORDER CREATION & LIFECYCLE
    // -------------------------------------------------------------------------
    console.log('\n--- 2. PURCHASE ORDER CREATION & LIFECYCLE ---');
    await setAuth(mainClient, userStaffA);

    // Fetch or create products for PO items in Tenant A
    let prodRes = await mainClient.query(`
      SELECT id, sku FROM public.products
      WHERE tenant_id = '${tenantA}' AND is_active = true
      ORDER BY created_at ASC LIMIT 2;
    `);

    let prod1Id, prod2Id;
    if (prodRes.rows.length >= 2) {
      prod1Id = prodRes.rows[0].id;
      prod2Id = prodRes.rows[1].id;
    } else {
      // Create products if not present
      const p1 = (await mainClient.query(`
        SELECT public.pos_create_product(
          p_name := 'Hyaluronic Acid Serum 50ml',
          p_sku := 'SERUM-HA-50',
          p_price_minor_units := 60000,
          p_currency := 'TRY',
          p_cost_minor_units := 25000
        ) AS res;
      `)).rows[0].res;
      prod1Id = p1.product_id;

      const p2 = (await mainClient.query(`
        SELECT public.pos_create_product(
          p_name := 'Collagen Mask Pack',
          p_sku := 'MASK-COL-10',
          p_price_minor_units := 30000,
          p_currency := 'TRY',
          p_cost_minor_units := 12000
        ) AS res;
      `)).rows[0].res;
      prod2Id = p2.product_id;
    }

    // Attempt to create PO with inactive supplier -> fails closed
    let inactiveSuppFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_create_purchase_order(
          p_supplier_id := '${suppA2.supplier_id}',
          p_destination_branch_id := '${branchA1}',
          p_currency := 'TRY',
          p_items := '[{"product_id":"${prod1Id}","quantity":10,"unit_cost_minor_units":25000}]'::jsonb
        );
      `);
    } catch (e) {
      inactiveSuppFailed = true;
    }
    assert(inactiveSuppFailed, 'P6.2.6: PO creation with inactive supplier rejected fail-closed');

    // Create valid PO 1 in Tenant A (10 units prod1, 20 units prod2)
    const rPo1 = await mainClient.query(`
      SELECT public.pos_create_purchase_order(
        p_supplier_id := '${suppA1.supplier_id}',
        p_destination_branch_id := '${branchA1}',
        p_currency := 'TRY',
        p_items := '[
          {"product_id":"${prod1Id}","quantity":10,"unit_cost_minor_units":25000},
          {"product_id":"${prod2Id}","quantity":20,"unit_cost_minor_units":12000}
        ]'::jsonb,
        p_notes := 'Initial bulk clinical restocking PO'
      ) AS res;
    `);
    const po1 = rPo1.rows[0].res;
    assert(po1.success === true && po1.purchase_order_id, 'P6.2.7: PO 1 created in draft status');
    assert(po1.status === 'draft', 'P6.2.8: Initial PO status is draft');
    // Total: (10 * 25000) + (20 * 12000) = 250000 + 240000 = 490000
    assert(po1.total_amount_minor_units === 490000, 'P6.2.9: PO total minor units accurately computed (490000)');

    // Attempt to receive on draft PO -> rejected fail closed
    let receiveDraftFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_receive_purchase_order_items(
          p_purchase_order_id := '${po1.purchase_order_id}',
          p_receipts := '[{"po_item_id":"${po1.purchase_order_id}","quantity_received":5}]'::jsonb
        );
      `);
    } catch (e) {
      receiveDraftFailed = true;
    }
    assert(receiveDraftFailed, 'P6.2.10: Receiving items on draft PO rejected fail-closed');

    // Approve PO 1
    const rApprove = await mainClient.query(`
      SELECT public.pos_approve_purchase_order('${po1.purchase_order_id}') AS res;
    `);
    assert(rApprove.rows[0].res.success === true && rApprove.rows[0].res.status === 'approved',
      'P6.2.11: PO 1 approved successfully');

    // Create and cancel a separate PO 2 to verify cancellation boundaries
    const rPo2 = await mainClient.query(`
      SELECT public.pos_create_purchase_order(
        p_supplier_id := '${suppA1.supplier_id}',
        p_destination_branch_id := '${branchA1}',
        p_currency := 'TRY',
        p_items := '[{"product_id":"${prod1Id}","quantity":5,"unit_cost_minor_units":25000}]'::jsonb,
        p_notes := 'PO to be cancelled'
      ) AS res;
    `);
    const po2 = rPo2.rows[0].res;
    const rCancel = await mainClient.query(`
      SELECT public.pos_cancel_purchase_order('${po2.purchase_order_id}', 'Budget reallocation') AS res;
    `);
    assert(rCancel.rows[0].res.success === true && rCancel.rows[0].res.status === 'cancelled',
      'P6.2.12: PO 2 cancelled successfully');

    // Attempt to receive on cancelled PO -> rejected fail closed
    let receiveCancelledFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_receive_purchase_order_items(
          p_purchase_order_id := '${po2.purchase_order_id}',
          p_receipts := '[{"po_item_id":"${po2.purchase_order_id}","quantity_received":1}]'::jsonb
        );
      `);
    } catch (e) {
      receiveCancelledFailed = true;
    }
    assert(receiveCancelledFailed, 'P6.2.13: Receiving on cancelled PO rejected fail-closed');

    // -------------------------------------------------------------------------
    // 3. PARTIAL RECEIVING & INVENTORY INTEGRATION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. PARTIAL RECEIVING & INVENTORY INTEGRATION ---');

    // Fetch PO 1 line items
    const rPoDetails = await mainClient.query(`
      SELECT public.pos_get_purchase_order('${po1.purchase_order_id}') AS res;
    `);
    const poDetails = rPoDetails.rows[0].res;
    const item1 = poDetails.items.find(i => i.product_id === prod1Id);
    const item2 = poDetails.items.find(i => i.product_id === prod2Id);

    // Initial stock balances for prod1 and prod2 at branchA1
    const getStock = async (prodId) => {
      const q = await mainClient.query(`
        SELECT COALESCE(on_hand_quantity, 0) AS qty FROM public.inventory_balances
        WHERE branch_id = '${branchA1}' AND product_id = '${prodId}';
      `);
      return q.rows[0]?.qty || 0;
    };

    const initialStock1 = await getStock(prod1Id);
    const initialStock2 = await getStock(prod2Id);

    // Partial receipt 1: receive 4 of 10 for item 1, 10 of 20 for item 2
    const rReceivePart1 = await mainClient.query(`
      SELECT public.pos_receive_purchase_order_items(
        p_purchase_order_id := '${po1.purchase_order_id}',
        p_receipts := '[
          {"po_item_id":"${item1.item_id}","quantity_received":4},
          {"po_item_id":"${item2.item_id}","quantity_received":10}
        ]'::jsonb,
        p_idempotency_key := 'PO1-RECV-PART1',
        p_notes := 'First delivery batch received at dock'
      ) AS res;
    `);
    const part1 = rReceivePart1.rows[0].res;
    assert(part1.success === true && part1.idempotent_replay === false, 'P6.2.14: Partial receipt 1 executed');
    assert(part1.status === 'partially_received', 'P6.2.15: PO 1 status updated to partially_received');
    assert(part1.total_units_received === 14, 'P6.2.16: Total 14 units received in batch');

    // Verify inventory balance increases
    const stockAfterPart1_1 = await getStock(prod1Id);
    const stockAfterPart1_2 = await getStock(prod2Id);
    assert(stockAfterPart1_1 === initialStock1 + 4, 'P6.2.17: Product 1 inventory balance increased by exactly 4');
    assert(stockAfterPart1_2 === initialStock2 + 10, 'P6.2.18: Product 2 inventory balance increased by exactly 10');

    // Verify canonical inventory_movements records created
    const rMovements = await mainClient.query(`
      SELECT movement_type, quantity, reference_id FROM public.inventory_movements
      WHERE reference_id = '${po1.po_number}'
      ORDER BY created_at ASC;
    `);
    assert(rMovements.rows.length === 2, 'P6.2.19: Canonical inventory_movements records created (2 receipts)');
    assert(rMovements.rows.every(m => m.movement_type === 'receipt'), 'P6.2.20: Movement type strictly matches receipt');

    // Idempotent replay of partial receipt 1
    const rReplay = await mainClient.query(`
      SELECT public.pos_receive_purchase_order_items(
        p_purchase_order_id := '${po1.purchase_order_id}',
        p_receipts := '[
          {"po_item_id":"${item1.item_id}","quantity_received":4},
          {"po_item_id":"${item2.item_id}","quantity_received":10}
        ]'::jsonb,
        p_idempotency_key := 'PO1-RECV-PART1'
      ) AS res;
    `);
    assert(rReplay.rows[0].res.success === true && rReplay.rows[0].res.idempotent_replay === true,
      'P6.2.21: Repeated idempotency key recognized as replay without double stock ingestion');
    const stockAfterReplay1 = await getStock(prod1Id);
    assert(stockAfterReplay1 === stockAfterPart1_1, 'P6.2.22: Stock balance completely unchanged on duplicate receipt replay');

    // Over-receipt attempt: item 1 had 10 ordered, 4 received -> remaining 6. Requesting 7 must fail closed.
    let overReceiptFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_receive_purchase_order_items(
          p_purchase_order_id := '${po1.purchase_order_id}',
          p_receipts := '[{"po_item_id":"${item1.item_id}","quantity_received":7}]'::jsonb
        );
      `);
    } catch (e) {
      overReceiptFailed = true;
    }
    assert(overReceiptFailed, 'P6.2.23: Over-receipt past remaining quantity rejected fail-closed');

    // -------------------------------------------------------------------------
    // 4. CONCURRENT RECEIVING RACE
    // -------------------------------------------------------------------------
    console.log('\n--- 4. CONCURRENT RECEIVING RACE ---');
    concurrencyTestsExecuted++;

    await setAuth(concurrentClient1, userStaffA);
    await setAuth(concurrentClient2, userStaffA);

    // Item 1: ordered 10, received 4 -> remaining 6.
    // Client 1 requests remaining 6. Client 2 requests remaining 6 concurrently.
    // Total 12 requested > 6 remaining. Exactly ONE must succeed; ONE must fail closed.
    const race1 = concurrentClient1.query(`
      SELECT public.pos_receive_purchase_order_items(
        p_purchase_order_id := '${po1.purchase_order_id}',
        p_receipts := '[{"po_item_id":"${item1.item_id}","quantity_received":6}]'::jsonb,
        p_idempotency_key := 'RACE-PO-RECV-SESSION-1'
      ) AS res;
    `);

    const race2 = concurrentClient2.query(`
      SELECT public.pos_receive_purchase_order_items(
        p_purchase_order_id := '${po1.purchase_order_id}',
        p_receipts := '[{"po_item_id":"${item1.item_id}","quantity_received":6}]'::jsonb,
        p_idempotency_key := 'RACE-PO-RECV-SESSION-2'
      ) AS res;
    `);

    const raceResults = await Promise.allSettled([race1, race2]);
    const raceFulfilled = raceResults.filter(r => r.status === 'fulfilled');
    const raceRejected = raceResults.filter(r => r.status === 'rejected');

    assert(raceFulfilled.length === 1, 'P6.2.24: Exactly 1 concurrent receiving session succeeded');
    assert(raceRejected.length === 1, 'P6.2.25: Exactly 1 concurrent receiving session failed closed (OVER_RECEIPT)');

    // Verify Item 1 is now fully received (10 of 10)
    const rItem1Check = await mainClient.query(`
      SELECT quantity_ordered, quantity_received FROM public.purchase_order_items WHERE id = '${item1.item_id}';
    `);
    assert(rItem1Check.rows[0].quantity_received === 10, 'P6.2.26: Item 1 total received is exactly 10 (no over-receipt)');

    // Final receipt: receive remaining 10 of 20 for Item 2
    const rFinalReceive = await mainClient.query(`
      SELECT public.pos_receive_purchase_order_items(
        p_purchase_order_id := '${po1.purchase_order_id}',
        p_receipts := '[{"po_item_id":"${item2.item_id}","quantity_received":10}]'::jsonb,
        p_idempotency_key := 'PO1-RECV-FINAL'
      ) AS res;
    `);
    const finalRec = rFinalReceive.rows[0].res;
    assert(finalRec.success === true && finalRec.status === 'received',
      'P6.2.27: PO 1 transitions to fully received upon final line item completion');

    // Attempting to receive on already fully received PO -> rejected fail closed
    let fullyReceivedFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_receive_purchase_order_items(
          p_purchase_order_id := '${po1.purchase_order_id}',
          p_receipts := '[{"po_item_id":"${item2.item_id}","quantity_received":1}]'::jsonb
        );
      `);
    } catch (e) {
      fullyReceivedFailed = true;
    }
    assert(fullyReceivedFailed, 'P6.2.28: Receiving on already fully received PO rejected fail-closed');

    // -------------------------------------------------------------------------
    // 5. CROSS-TENANT & CROSS-BRANCH DEFENSE IN DEPTH
    // -------------------------------------------------------------------------
    console.log('\n--- 5. CROSS-TENANT & CROSS-BRANCH DEFENSE ---');
    crossTenantNegativeTestsExecuted++;

    // Staff B (Tenant B) attempts to view or receive on Tenant A PO -> REJECTED
    await setAuth(mainClient, userStaffB);
    let crossTenantViewFailed = false;
    try {
      await mainClient.query(`SELECT public.pos_get_purchase_order('${po1.purchase_order_id}');`);
    } catch (e) {
      crossTenantViewFailed = true;
    }
    assert(crossTenantViewFailed, 'P6.2.29: Cross-tenant view of purchase order denied fail-closed');

    crossTenantNegativeTestsExecuted++;
    let crossTenantRecvFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_receive_purchase_order_items(
          p_purchase_order_id := '${po1.purchase_order_id}',
          p_receipts := '[{"po_item_id":"${item1.item_id}","quantity_received":1}]'::jsonb
        );
      `);
    } catch (e) {
      crossTenantRecvFailed = true;
    }
    assert(crossTenantRecvFailed, 'P6.2.30: Cross-tenant receiving on foreign purchase order denied fail-closed');

    crossTenantNegativeTestsExecuted++;
    // Staff A attempts to create PO with foreign supplier B1 -> REJECTED
    await setAuth(mainClient, userStaffA);
    let crossTenantSuppFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_create_purchase_order(
          p_supplier_id := '${suppB1.supplier_id}',
          p_destination_branch_id := '${branchA1}',
          p_currency := 'TRY',
          p_items := '[{"product_id":"${prod1Id}","quantity":1,"unit_cost_minor_units":1000}]'::jsonb
        );
      `);
    } catch (e) {
      crossTenantSuppFailed = true;
    }
    assert(crossTenantSuppFailed, 'P6.2.31: PO creation with cross-tenant supplier rejected fail-closed');

    crossTenantNegativeTestsExecuted++;
    // Staff A attempts to create PO with foreign destination branch B1 -> REJECTED
    let crossTenantBranchFailed = false;
    try {
      await mainClient.query(`
        SELECT public.pos_create_purchase_order(
          p_supplier_id := '${suppA1.supplier_id}',
          p_destination_branch_id := '${branchB1}',
          p_currency := 'TRY',
          p_items := '[{"product_id":"${prod1Id}","quantity":1,"unit_cost_minor_units":1000}]'::jsonb
        );
      `);
    } catch (e) {
      crossTenantBranchFailed = true;
    }
    assert(crossTenantBranchFailed, 'P6.2.32: PO creation with cross-tenant destination branch rejected fail-closed');

    // -------------------------------------------------------------------------
    // 6. DIRECT TABLE DML REVOCATION TEST (SECURITY BOUNDARY)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. DIRECT TABLE DML REVOCATION DEFENSE ---');
    let directSuppDmlFailed = false;
    try {
      await mainClient.query(`
        INSERT INTO public.suppliers (tenant_id, name) VALUES ('${tenantA}', 'Malicious Direct Supplier');
      `);
    } catch (e) {
      directSuppDmlFailed = true;
    }
    assert(directSuppDmlFailed, 'P6.2.33: Direct DML on suppliers table denied by permission revoke');

    let directPoDmlFailed = false;
    try {
      await mainClient.query(`
        INSERT INTO public.purchase_orders (tenant_id, po_number, supplier_id, destination_branch_id, currency)
        VALUES ('${tenantA}', 'PO-MALICIOUS', '${suppA1.supplier_id}', '${branchA1}', 'TRY');
      `);
    } catch (e) {
      directPoDmlFailed = true;
    }
    assert(directPoDmlFailed, 'P6.2.34: Direct DML on purchase_orders table denied by permission revoke');

    console.log('\n===============================================================');
    console.log(`LIVE POSTGRESQL PROCUREMENT BEHAVIORAL MATRIX: ${testsPassed}/${testsExecuted} TESTS PASSED | ZERO FAILURES`);
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
  console.error('Procurement behavioral test execution failed:', err);
  process.exit(1);
});
