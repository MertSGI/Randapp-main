// p2a_concurrency_harness.ts
// Multi-Session Concurrency & Barrier Test Harness for P2A Atomic Tenant Provisioning
// Governance: EXECUTES ONLY ON DISPOSABLE LOCAL SUPABASE QA DB (127.0.0.1:54322)

import { Client } from 'pg';

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function runConcurrencyHarness() {
  console.log('P2A-CONCURRENCY-HARNESS STARTED');
  console.log(`NODE_VERSION = ${process.version}`);

  const client1 = new Client({ connectionString: DB_URL });
  const client2 = new Client({ connectionString: DB_URL });

  await client1.connect();
  await client2.connect();

  const user1_id = 'a1a1a1a1-1111-1111-1111-a1a1a1a1a1a1';
  const user2_id = 'b2b2b2b2-2222-2222-2222-b2b2b2b2b2b2';

  try {
    // Setup Auth Fixtures
    await client1.query(`
      INSERT INTO auth.users (id, email, role, created_at, updated_at)
      VALUES 
        ('${user1_id}', 'conc_owner1@p2a-test.invalid', 'authenticated', now(), now()),
        ('${user2_id}', 'conc_owner2@p2a-test.invalid', 'authenticated', now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);

    // -------------------------------------------------------------------------
    // CONC-01: Same owner, same idempotency key overlapping calls
    // -------------------------------------------------------------------------
    console.log('CONC-01 START');

    const conc01_call_a_start = new Date().toISOString();
    const p1 = (async () => {
      const res = await client1.query(`
        SELECT set_config('request.jwt.claim.sub', '${user1_id}', true);
        SELECT public.provision_tenant_for_authenticated_owner(
          'Same Owner Salon',
          'Same Owner Salon Display',
          'Hair Salon',
          'Istanbul',
          '+905559990011',
          'baslangic',
          'conc-key-same-owner'
        ) as res;
      `);
      const end = new Date().toISOString();
      return { res, end };
    })();

    const conc01_call_b_start = new Date().toISOString();
    const p2 = (async () => {
      const res = await client2.query(`
        SELECT set_config('request.jwt.claim.sub', '${user1_id}', true);
        SELECT public.provision_tenant_for_authenticated_owner(
          'Same Owner Salon Concurrent',
          'Same Owner Salon Display Concurrent',
          'Hair Salon',
          'Istanbul',
          '+905559990011',
          'baslangic',
          'conc-key-same-owner'
        ) as res;
      `);
      const end = new Date().toISOString();
      return { res, end };
    })();

    const [out1, out2] = await Promise.all([p1, p2]);
    const conc01_call_a_end = out1.end;
    const conc01_call_b_end = out2.end;

    const payload1 = out1.res[1].rows[0].res;
    const payload2 = out2.res[1].rows[0].res;

    console.log(`CONC01_CALL_A_START = ${conc01_call_a_start}`);
    console.log(`CONC01_CALL_B_START = ${conc01_call_b_start}`);
    console.log(`CONC01_CALL_A_END = ${conc01_call_a_end}`);
    console.log(`CONC01_CALL_B_END = ${conc01_call_b_end}`);

    if (payload1.tenant_id !== payload2.tenant_id || payload1.slug !== payload2.slug) {
      throw new Error(`CONC-01 FAIL: Discrepancy detected between concurrent same-owner calls! (${payload1.tenant_id} vs ${payload2.tenant_id})`);
    }

    // Assert exact 1 tenant row created
    const countCheck = await client1.query(`SELECT count(*) FROM public.tenants WHERE owner_user_id = '${user1_id}';`);
    if (parseInt(countCheck.rows[0].count, 10) !== 1) {
      throw new Error(`CONC-01 FAIL: Expected exactly 1 tenant row, found ${countCheck.rows[0].count}`);
    }

    // Assert exact 1 idempotency row created
    const idempCheck = await client1.query(`SELECT count(*) FROM public.tenant_provisioning_idempotency WHERE owner_user_id = '${user1_id}' AND idempotency_key = 'conc-key-same-owner';`);
    if (parseInt(idempCheck.rows[0].count, 10) !== 1) {
      throw new Error(`CONC-01 FAIL: Expected exactly 1 idempotency row, found ${idempCheck.rows[0].count}`);
    }

    console.log('CONC-01 PASS');

    // -------------------------------------------------------------------------
    // CONC-02: Different owners, same business name overlapping calls
    // -------------------------------------------------------------------------
    console.log('CONC-02 START');

    const user3_id = 'c3c3c3c3-3333-3333-3333-c3c3c3c3c3c3';
    const user4_id = 'd4d4d4d4-4444-4444-4444-d4d4d4d4d4d4';

    await client1.query(`
      INSERT INTO auth.users (id, email, role, created_at, updated_at)
      VALUES 
        ('${user3_id}', 'conc_owner3@p2a-test.invalid', 'authenticated', now(), now()),
        ('${user4_id}', 'conc_owner4@p2a-test.invalid', 'authenticated', now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);

    const conc02_call_a_start = new Date().toISOString();
    const p_owner3 = (async () => {
      const res = await client1.query(`
        SELECT set_config('request.jwt.claim.sub', '${user3_id}', true);
        SELECT public.provision_tenant_for_authenticated_owner(
          'Apex Beauty Studio',
          'Apex Beauty Studio',
          'Hair Salon',
          'Ankara',
          '+905559990022',
          'baslangic',
          'conc-key-user3'
        ) as res;
      `);
      const end = new Date().toISOString();
      return { res, end };
    })();

    const conc02_call_b_start = new Date().toISOString();
    const p_owner4 = (async () => {
      const res = await client2.query(`
        SELECT set_config('request.jwt.claim.sub', '${user4_id}', true);
        SELECT public.provision_tenant_for_authenticated_owner(
          'Apex Beauty Studio',
          'Apex Beauty Studio',
          'Hair Salon',
          'Ankara',
          '+905559990033',
          'baslangic',
          'conc-key-user4'
        ) as res;
      `);
      const end = new Date().toISOString();
      return { res, end };
    })();

    const [out3, out4] = await Promise.all([p_owner3, p_owner4]);
    const conc02_call_a_end = out3.end;
    const conc02_call_b_end = out4.end;

    const payload3 = out3.res[1].rows[0].res;
    const payload4 = out4.res[1].rows[0].res;

    console.log(`CONC02_CALL_A_START = ${conc02_call_a_start}`);
    console.log(`CONC02_CALL_B_START = ${conc02_call_b_start}`);
    console.log(`CONC02_CALL_A_END = ${conc02_call_a_end}`);
    console.log(`CONC02_CALL_B_END = ${conc02_call_b_end}`);

    if (payload3.tenant_id === payload4.tenant_id) {
      throw new Error(`CONC-02 FAIL: Different owners received same tenant ID!`);
    }

    if (payload3.slug === payload4.slug) {
      throw new Error(`CONC-02 FAIL: Slug collision detected (${payload3.slug})`);
    }

    console.log('CONC-02 PASS');
    console.log('=== ALL MULTI-SESSION CONCURRENCY HARNESS TESTS PASSED ===');
  } finally {
    await client1.end();
    await client2.end();
  }
}

runConcurrencyHarness().catch((err) => {
  console.error('HARNESS_EXECUTION_FAILURE:', err);
  process.exit(1);
});
