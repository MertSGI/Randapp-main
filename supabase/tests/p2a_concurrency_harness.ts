// p2a_concurrency_harness.ts
// Multi-Session Concurrency & Barrier Test Harness for P2A Atomic Tenant Provisioning
// Governance: EXECUTES ONLY ON DISPOSABLE LOCAL SUPABASE QA DB (127.0.0.1:54322)

import { Client } from 'pg';

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function runConcurrencyHarness() {
  console.log('=== STARTING P2A MULTI-SESSION REAL CONCURRENCY HARNESS ===');

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
    console.log('--- CONC-01: Executing overlapping requests for same owner + same idempotency key ---');
    const p1 = client1.query(`
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

    const p2 = client2.query(`
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

    const [res1, res2] = await Promise.all([p1, p2]);
    const payload1 = res1[1].rows[0].res;
    const payload2 = res2[1].rows[0].res;

    if (payload1.tenant_id !== payload2.tenant_id || payload1.slug !== payload2.slug) {
      throw new Error(`CONC-01 FAIL: Discrepancy detected between concurrent same-owner calls! (${payload1.tenant_id} vs ${payload2.tenant_id})`);
    }

    // Assert exact 1 tenant row created
    const countCheck = await client1.query(`SELECT count(*) FROM public.tenants WHERE owner_user_id = '${user1_id}';`);
    if (parseInt(countCheck.rows[0].count, 10) !== 1) {
      throw new Error(`CONC-01 FAIL: Expected exactly 1 tenant row, found ${countCheck.rows[0].count}`);
    }
    console.log('✅ CONC-01 PASS: Concurrent same-owner requests safely serialized to 1 tenant.');

    // -------------------------------------------------------------------------
    // CONC-02: Different owners, same business name overlapping calls
    // -------------------------------------------------------------------------
    console.log('--- CONC-02: Executing overlapping requests for different owners + same business name ---');
    const p3 = client1.query(`
      SELECT set_config('request.jwt.claim.sub', '${user1_id}', true);
      -- User 1 already has tenant, so use fresh user IDs
    `);

    const user3_id = 'c3c3c3c3-3333-3333-3333-c3c3c3c3c3c3';
    const user4_id = 'd4d4d4d4-4444-4444-4444-d4d4d4d4d4d4';

    await client1.query(`
      INSERT INTO auth.users (id, email, role, created_at, updated_at)
      VALUES 
        ('${user3_id}', 'conc_owner3@p2a-test.invalid', 'authenticated', now(), now()),
        ('${user4_id}', 'conc_owner4@p2a-test.invalid', 'authenticated', now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);

    const p_owner3 = client1.query(`
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

    const p_owner4 = client2.query(`
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

    const [res3, res4] = await Promise.all([p_owner3, p_owner4]);
    const payload3 = res3[1].rows[0].res;
    const payload4 = res4[1].rows[0].res;

    if (payload3.tenant_id === payload4.tenant_id) {
      throw new Error(`CONC-02 FAIL: Different owners received same tenant ID!`);
    }

    if (payload3.slug === payload4.slug) {
      throw new Error(`CONC-02 FAIL: Slug collision detected (${payload3.slug})`);
    }

    console.log(`✅ CONC-02 PASS: Concurrent cross-owner registration succeeded with unique slugs: '${payload3.slug}' & '${payload4.slug}'.`);

    console.log('=== ALL MULTI-SESSION CONCURRENCY HARNESS TESTS PASSED ===');
  } finally {
    await client1.end();
    await client2.end();
  }
}

runConcurrencyHarness().catch((err) => {
  console.error('FATAL CONCURRENCY HARNESS ERROR:', err);
  process.exit(1);
});
