// supabase/tests/package_branch_concurrency_harness.ts
// Real Multi-Session Concurrency & Authenticated RLS Harness for Package / Customer Customization Slice 1-R2.2
// Governance: EXECUTES ONLY ON DISPOSABLE LOCAL SUPABASE QA DB (127.0.0.1:54322) - FAILS CLOSED IF DB UNAVAILABLE

import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
const { Client } = pg;

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runPackageBranchConcurrencyHarness() {
  const executionId = crypto.randomUUID();
  console.log('=== PACKAGE BRANCH REAL MULTI-SESSION CONCURRENCY & RLS HARNESS STARTED ===');
  console.log(`HARNESS_EXECUTION_ID = ${executionId}\n`);

  const client1 = new Client({ connectionString: DB_URL });
  const client2 = new Client({ connectionString: DB_URL });

  // Fail closed immediately if database connection fails
  try {
    await client1.connect();
    await client2.connect();
  } catch (err: any) {
    console.error(`❌ DB_CONNECTION_FAILURE: Failed to connect to local database at ${DB_URL}`);
    console.error(`ERROR_DETAILS: ${err.message}`);
    process.exit(1);
  }

  let failures = 0;
  let rawDeadlockCount = 0;
  let rawUniqueViolationCount = 0;
  let concurrencyTimeoutCount = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ HARNESS FAILED: ${msg}`);
      failures++;
      throw new Error(`HARNESS ASSERTION FAILURE: ${msg}`);
    } else {
      console.log(`✅ PASSED: ${msg}`);
    }
  }

  function validateUuid(id: string, label: string) {
    assert(UUID_REGEX.test(id), `${label} is a valid PostgreSQL UUID: ${id}`);
  }

  // Set 5s statement timeout on both sessions to fail deterministically on lock hangs
  await client1.query("SET statement_timeout = '5000ms';");
  await client2.query("SET statement_timeout = '5000ms';");

  // Isolated tenant & user UUIDs per scenario
  const tenantC1_id = 'c1111111-1111-4111-8111-111111111111';
  const ownerC1_id  = 'c1555555-5555-4555-8555-555555555555';

  const tenantC2_id = 'c2222222-2222-4222-8222-222222222222';
  const ownerC2_id  = 'c2555555-5555-4555-8555-555555555555';

  const tenantC3_id = 'c3333333-3333-4333-8333-333333333333';
  const ownerC3_id  = 'c3555555-5555-4555-8555-555555555555';

  const tenantC4_id = 'c4444444-4444-4444-8444-444444444444';
  const ownerC4_id  = 'c4555555-5555-4555-8555-555555555555';

  const tenantC5A_id = 'c5aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ownerC5A_id  = 'c5a55555-5555-4555-8555-555555555555';
  const tenantC5B_id = 'c5bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ownerC5B_id  = 'c5b66666-6666-4666-8666-666666666666';

  const tenantRLSA_id = '77777777-7777-4777-8777-777777777777';
  const ownerRLSA_id  = '77755555-5555-4555-8555-555555555555';
  const tenantRLSB_id = '88888888-8888-4888-8888-888888888888';
  const ownerRLSB_id  = '88866666-6666-4666-8666-666666666666';
  const tenantNeg_id  = '99991111-1111-4111-8111-111111111111';
  const ownerNeg_id   = '99995555-5555-4555-8555-555555555555';
  const staffRLSA_id  = '77788888-8888-4888-8888-888888888888';
  const admin_id      = '99999999-9999-4999-8999-999999999999';

  const allTenantIds = [tenantC1_id, tenantC2_id, tenantC3_id, tenantC4_id, tenantC5A_id, tenantC5B_id, tenantRLSA_id, tenantRLSB_id, tenantNeg_id];
  const allUserIds   = [ownerC1_id, ownerC2_id, ownerC3_id, ownerC4_id, ownerC5A_id, ownerC5B_id, ownerRLSA_id, ownerRLSB_id, ownerNeg_id, staffRLSA_id, admin_id];

  try {
    // 0. Setup Clean Isolated Fixtures
    const tInList = allTenantIds.map(id => `'${id}'`).join(',');
    const uInList = allUserIds.map(id => `'${id}'`).join(',');

    await client1.query(`
      DELETE FROM public.service_branches WHERE tenant_id IN (${tInList});
      DELETE FROM public.staff_branches WHERE tenant_id IN (${tInList});
      DELETE FROM public.branches WHERE tenant_id IN (${tInList});
      DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id IN (${tInList});
      DELETE FROM public.users_profile WHERE id IN (${uInList});
      DELETE FROM auth.users WHERE id IN (${uInList});
      DELETE FROM public.tenants WHERE id IN (${tInList});

      INSERT INTO public.tenants (id, slug, name, status)
      VALUES 
        ('${tenantC1_id}', 'tenant-c1', 'Tenant C1', 'active'),
        ('${tenantC2_id}', 'tenant-c2', 'Tenant C2', 'active'),
        ('${tenantC3_id}', 'tenant-c3', 'Tenant C3', 'active'),
        ('${tenantC4_id}', 'tenant-c4', 'Tenant C4', 'active'),
        ('${tenantC5A_id}', 'tenant-c5a', 'Tenant C5A', 'active'),
        ('${tenantC5B_id}', 'tenant-c5b', 'Tenant C5B', 'active'),
        ('${tenantRLSA_id}', 'tenant-rlsa', 'Tenant RLS A', 'active'),
        ('${tenantRLSB_id}', 'tenant-rlsb', 'Tenant RLS B', 'active'),
        ('${tenantNeg_id}', 'tenant-neg', 'Tenant Neg Control', 'active');

      INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, is_unlimited, integer_value, reason)
      VALUES
        ('${tenantC1_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantC2_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantC3_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantC4_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantC5A_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantC5B_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantRLSA_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture'),
        ('${tenantRLSB_id}', 'max_branches', 'integer', true, NULL, 'Package branch authority disposable test fixture');

      INSERT INTO auth.users (id, email, role, created_at, updated_at)
      VALUES
        ('${ownerC1_id}', 'ownerc1@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerC2_id}', 'ownerc2@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerC3_id}', 'ownerc3@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerC4_id}', 'ownerc4@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerC5A_id}', 'ownerc5a@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerC5B_id}', 'ownerc5b@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerRLSA_id}', 'owner-rlsa@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerRLSB_id}', 'owner-rlsb@test-harness.invalid', 'authenticated', now(), now()),
        ('${ownerNeg_id}', 'owner-neg@test-harness.invalid', 'authenticated', now(), now()),
        ('${staffRLSA_id}', 'staff-rlsa@test-harness.invalid', 'authenticated', now(), now()),
        ('${admin_id}', 'admin@test-harness.invalid', 'authenticated', now(), now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES 
        ('${ownerC1_id}', '${tenantC1_id}', 'Owner C1', 'tenant_owner', true),
        ('${ownerC2_id}', '${tenantC2_id}', 'Owner C2', 'tenant_owner', true),
        ('${ownerC3_id}', '${tenantC3_id}', 'Owner C3', 'tenant_owner', true),
        ('${ownerC4_id}', '${tenantC4_id}', 'Owner C4', 'tenant_owner', true),
        ('${ownerC5A_id}', '${tenantC5A_id}', 'Owner C5A', 'tenant_owner', true),
        ('${ownerC5B_id}', '${tenantC5B_id}', 'Owner C5B', 'tenant_owner', true),
        ('${ownerRLSA_id}', '${tenantRLSA_id}', 'Owner RLS A', 'tenant_owner', true),
        ('${ownerRLSB_id}', '${tenantRLSB_id}', 'Owner RLS B', 'tenant_owner', true),
        ('${ownerNeg_id}', '${tenantNeg_id}', 'Owner Neg', 'tenant_owner', true),
        ('${staffRLSA_id}', '${tenantRLSA_id}', 'Staff RLS A', 'staff', true),
        ('${admin_id}', NULL, 'Super Admin', 'super_admin', true);
    `);

    // Verify override resolution
    const quotaRes = await client1.query(`SELECT is_unlimited FROM public.resolve_commercial_quota('${tenantC1_id}', 'max_branches');`);
    assert(quotaRes.rows[0]?.is_unlimited === true, 'TEST_MULTI_BRANCH_OVERRIDE_RESOLUTION = PASS (TEST_TENANT_MAX_BRANCHES_SOURCE = tenant_override)');

    // Commercial Branch Quota Negative Control Verification
    await client1.query(`SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '${ownerNeg_id}', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true);`);
    const negB1 = await client1.query(`SELECT public.create_tenant_branch('${tenantNeg_id}', 'Neg Branch 1', 'neg-1') as res;`);
    const negB1Res = negB1.rows[0]?.res;
    assert(negB1Res?.success === true, 'Commercial negative control first branch creation succeeded');

    const negB2 = await client1.query(`SELECT public.create_tenant_branch('${tenantNeg_id}', 'Neg Branch 2 Exceeding Quota', 'neg-2') as res;`);
    const negB2Res = negB2.rows[0]?.res;
    assert(negB2Res?.success === false && negB2Res?.reason_code === 'commercial_quota_exceeded', 'COMMERCIAL_BRANCH_QUOTA_NEGATIVE_CONTROL = PASS');

    // 0b. Execute Package Branch Server Authority Functional SQL Suite (Assertions A-L)
    const sqlPath = path.join(process.cwd(), 'supabase/tests/package_branch_server_authority_tests.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      await client1.query(sqlContent);
      console.log('✅ PASSED: Package Branch Server-Authority Functional SQL Suite (Assertions A-L)');
    }

    // Helper to catch DB SQLSTATE errors
    async function execRpc(client: any, userId: string, sql: string) {
      try {
        const res = await client.query(`
          SELECT set_config('request.jwt.claim.sub', '${userId}', true);
          ${sql}
        `);
        return { success: true, data: res[1].rows[0].res, error: null };
      } catch (err: any) {
        if (err.code === '40P01') rawDeadlockCount++;
        if (err.code === '23505') rawUniqueViolationCount++;
        if (err.code === '57014') concurrencyTimeoutCount++;
        return { success: false, data: null, error: err };
      }
    }

    // -------------------------------------------------------------------------
    // C1: Real Simultaneous First Branch Creates for Same Tenant
    // -------------------------------------------------------------------------
    console.log('--- C1: Real Simultaneous First Branch Creates ---');
    const pC1_1 = execRpc(client1, ownerC1_id, `SELECT public.create_tenant_branch('${tenantC1_id}', 'First Branch A', 'first-a') as res;`);
    const pC1_2 = execRpc(client2, ownerC1_id, `SELECT public.create_tenant_branch('${tenantC1_id}', 'First Branch B', 'first-b') as res;`);

    const [outC1_1, outC1_2] = await Promise.all([pC1_1, pC1_2]);
    assert(outC1_1.success && outC1_1.data.success === true, `C1 Session 1 RPC succeeded: ${JSON.stringify(outC1_1.data)}`);
    assert(outC1_2.success && outC1_2.data.success === true, `C1 Session 2 RPC succeeded: ${JSON.stringify(outC1_2.data)}`);

    const c1DbCheck = await client1.query(`
      SELECT count(*) filter (where is_active = true) as active_cnt,
             count(*) filter (where is_primary = true) as primary_cnt,
             array_agg(id::text ORDER BY created_at ASC) as branch_ids
      FROM public.branches
      WHERE tenant_id = '${tenantC1_id}';
    `);

    const c1ActiveCnt = parseInt(c1DbCheck.rows[0].active_cnt, 10);
    const c1PrimaryCnt = parseInt(c1DbCheck.rows[0].primary_cnt, 10);
    const c1BranchIds = c1DbCheck.rows[0].branch_ids;

    assert(c1ActiveCnt === 2, `C1 Persisted Active Branch Count = ${c1ActiveCnt} (expected 2)`);
    assert(c1PrimaryCnt === 1, `C1 Persisted Active Primary Count = ${c1PrimaryCnt} (expected 1)`);
    assert(c1BranchIds.length === 2, 'C1 Returned 2 actual branch IDs');
    validateUuid(c1BranchIds[0], 'C1 Branch 1');
    validateUuid(c1BranchIds[1], 'C1 Branch 2');
    console.log(`C1_BRANCH_IDS = ${c1BranchIds.join(', ')}`);

    // -------------------------------------------------------------------------
    // C2: Real Simultaneous Same-Slug Branch Creates
    // -------------------------------------------------------------------------
    console.log('\n--- C2: Real Simultaneous Same-Slug Branch Creates ---');
    const pC2_1 = execRpc(client1, ownerC2_id, `SELECT public.create_tenant_branch('${tenantC2_id}', 'Kadikoy Sube', 'kadikoy') as res;`);
    const pC2_2 = execRpc(client2, ownerC2_id, `SELECT public.create_tenant_branch('${tenantC2_id}', 'Kadikoy Sube', 'kadikoy') as res;`);

    const [outC2_1, outC2_2] = await Promise.all([pC2_1, pC2_2]);
    assert(outC2_1.success && outC2_1.data.success === true, `C2 Session 1 RPC succeeded: ${outC2_1.data.branch.slug}`);
    assert(outC2_2.success && outC2_2.data.success === true, `C2 Session 2 RPC succeeded: ${outC2_2.data.branch.slug}`);

    const c2DbCheck = await client1.query(`
      SELECT id::text, slug FROM public.branches WHERE tenant_id = '${tenantC2_id}' ORDER BY created_at ASC;
    `);
    const c2Slugs = c2DbCheck.rows.map((r: any) => r.slug).sort();
    const c2BranchIds = c2DbCheck.rows.map((r: any) => r.id);

    assert(c2Slugs[0] === 'kadikoy' && c2Slugs[1] === 'kadikoy-1', `C2 Persisted Slugs: ${c2Slugs.join(', ')}`);
    validateUuid(c2BranchIds[0], 'C2 Branch 1');
    validateUuid(c2BranchIds[1], 'C2 Branch 2');
    console.log(`C2_PERSISTED_SLUGS = ${c2Slugs.join(', ')}`);

    // -------------------------------------------------------------------------
    // C3: Real Simultaneous Set-Primary on Different Active Branches
    // -------------------------------------------------------------------------
    console.log('\n--- C3: Real Simultaneous Set-Primary on Different Active Branches ---');
    // Pre-create 2 active branches for Tenant C3
    const c3Init1 = await execRpc(client1, ownerC3_id, `SELECT public.create_tenant_branch('${tenantC3_id}', 'Branch C3-1', 'c3-1') as res;`);
    const c3Init2 = await execRpc(client1, ownerC3_id, `SELECT public.create_tenant_branch('${tenantC3_id}', 'Branch C3-2', 'c3-2') as res;`);

    const bC3_1 = c3Init1.data.branch.id;
    const bC3_2 = c3Init2.data.branch.id;
    validateUuid(bC3_1, 'C3 Branch 1 fixture');
    validateUuid(bC3_2, 'C3 Branch 2 fixture');

    const pC3_1 = execRpc(client1, ownerC3_id, `SELECT public.set_primary_tenant_branch('${bC3_1}') as res;`);
    const pC3_2 = execRpc(client2, ownerC3_id, `SELECT public.set_primary_tenant_branch('${bC3_2}') as res;`);

    const [outC3_1, outC3_2] = await Promise.all([pC3_1, pC3_2]);
    assert(outC3_1.success && outC3_1.data.success === true, 'C3 Session 1 set_primary succeeded');
    assert(outC3_2.success && outC3_2.data.success === true, 'C3 Session 2 set_primary succeeded');

    const c3DbCheck = await client1.query(`
      SELECT id::text, name FROM public.branches WHERE tenant_id = '${tenantC3_id}' AND is_primary = true AND is_active = true;
    `);
    assert(c3DbCheck.rows.length === 1, `C3 Final Active Primary Count = ${c3DbCheck.rows.length} (expected 1)`);
    const c3FinalPrimaryId = c3DbCheck.rows[0].id;
    validateUuid(c3FinalPrimaryId, 'C3 Final Primary ID');
    console.log(`C3_FINAL_PRIMARY_ID = ${c3FinalPrimaryId}`);

    // -------------------------------------------------------------------------
    // C4: Real Concurrent Set-Primary vs Deactivate
    // -------------------------------------------------------------------------
    console.log('\n--- C4: Real Concurrent Set-Primary vs Deactivate ---');
    const c4Init1 = await execRpc(client1, ownerC4_id, `SELECT public.create_tenant_branch('${tenantC4_id}', 'Branch C4-Primary', 'c4-p') as res;`);
    const c4Init2 = await execRpc(client1, ownerC4_id, `SELECT public.create_tenant_branch('${tenantC4_id}', 'Branch C4-Secondary', 'c4-s') as res;`);

    const bC4_primary = c4Init1.data.branch.id;
    const bC4_secondary = c4Init2.data.branch.id;
    validateUuid(bC4_primary, 'C4 Primary Branch fixture');
    validateUuid(bC4_secondary, 'C4 Secondary Branch fixture');

    const pC4_1 = execRpc(client1, ownerC4_id, `SELECT public.set_primary_tenant_branch('${bC4_secondary}') as res;`);
    const pC4_2 = execRpc(client2, ownerC4_id, `SELECT public.deactivate_tenant_branch('${bC4_secondary}') as res;`);

    const [outC4_1, outC4_2] = await Promise.all([pC4_1, pC4_2]);
    const rC4_code1 = outC4_1.data?.reason_code || outC4_1.error?.code || 'error';
    const rC4_code2 = outC4_2.data?.reason_code || outC4_2.error?.code || 'error';
    console.log(`C4 RPC Result Codes: set_primary -> ${rC4_code1}, deactivate -> ${rC4_code2}`);

    const c4DbCheck = await client1.query(`
      SELECT count(*) filter (where is_active = true) as active_cnt,
             count(*) filter (where is_primary = true) as primary_cnt
      FROM public.branches
      WHERE tenant_id = '${tenantC4_id}';
    `);

    const c4Active = parseInt(c4DbCheck.rows[0].active_cnt, 10);
    const c4Primary = parseInt(c4DbCheck.rows[0].primary_cnt, 10);
    assert(c4Active >= 1, `C4 Active count = ${c4Active} (>= 1)`);
    assert(c4Primary === 1, `C4 Invariant held: active_cnt=${c4Active}, primary_cnt=${c4Primary} (expected 1 primary)`);

    // -------------------------------------------------------------------------
    // C5: Real Cross-Tenant Lock Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- C5: Real Cross-Tenant Lock Isolation ---');
    const lockAcquiredAt = new Date().toISOString();
    await client1.query('BEGIN;');
    await client1.query(`SELECT pg_advisory_xact_lock(hashtextextended('${tenantC5A_id}', 0));`);
    console.log(`C5 Session 1 acquired tenant A lock at ${lockAcquiredAt}`);

    const tenantBStartAt = new Date().toISOString();
    const pC5_2 = execRpc(client2, ownerC5B_id, `SELECT public.create_tenant_branch('${tenantC5B_id}', 'Tenant B First', 't2-first') as res;`);

    const c5StartTime = Date.now();
    const outC5_2 = await pC5_2;
    const tenantBEndAt = new Date().toISOString();
    const c5Duration = Date.now() - c5StartTime;

    await client1.query('ROLLBACK;');
    const lockReleaseAt = new Date().toISOString();
    console.log(`C5 Session 1 released tenant A lock at ${lockReleaseAt}`);

    assert(outC5_2.success && outC5_2.data.success === true, `C5 Tenant B RPC succeeded: ${JSON.stringify(outC5_2.data)}`);
    assert(new Date(tenantBEndAt).getTime() <= new Date(lockReleaseAt).getTime(), 'Tenant B completed BEFORE Client 1 released Tenant A lock');
    assert(c5Duration < 2000, `C5 Tenant B duration = ${c5Duration}ms (<2000ms)`);

    // -------------------------------------------------------------------------
    // SAFE AUTHENTICATED RLS BOUNDARY TESTS WITH SAVEPOINTS
    // -------------------------------------------------------------------------
    console.log('\n--- SAFE AUTHENTICATED RLS BOUNDARY TESTS ---');

    // 1. Owner RLS Boundary
    await client1.query('BEGIN;');
    await client1.query("SET LOCAL ROLE authenticated;");
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${ownerRLSA_id}', true);`);

    // Pre-create 1 branch for Tenant RLS A
    await client1.query("SAVEPOINT pre_create;");
    // Run RPC under postgres to ensure branch exists for SELECT test
    await client2.query(`SELECT public.create_tenant_branch('${tenantRLSA_id}', 'RLS A Branch', 'rls-a') as res;`);

    const ownerAOwnSelect = await client1.query(`SELECT count(*) FROM public.branches WHERE tenant_id = '${tenantRLSA_id}';`);
    assert(parseInt(ownerAOwnSelect.rows[0].count, 10) >= 1, 'Owner A CAN SELECT own tenant branches');

    const ownerAOtherSelect = await client1.query(`SELECT count(*) FROM public.branches WHERE tenant_id = '${tenantRLSB_id}';`);
    assert(parseInt(ownerAOtherSelect.rows[0].count, 10) === 0, 'Owner A CANNOT SELECT tenant B branches (0 rows)');

    // Safe transaction test: Direct INSERT
    await client1.query("SAVEPOINT sp_insert;");
    let ownerAInsertFailed = false;
    try {
      await client1.query(`INSERT INTO public.branches (tenant_id, name, slug) VALUES ('${tenantRLSA_id}', 'Direct', 'direct');`);
    } catch (err) {
      ownerAInsertFailed = true;
    }
    await client1.query("ROLLBACK TO SAVEPOINT sp_insert;");
    assert(ownerAInsertFailed, 'Owner A direct INSERT on public.branches DENIED by RLS policy');

    // Safe transaction test: Direct UPDATE
    await client1.query("SAVEPOINT sp_update;");
    let ownerAUpdateFailed = false;
    try {
      const up = await client1.query(`UPDATE public.branches SET name = 'Direct Update' WHERE tenant_id = '${tenantRLSA_id}';`);
      if (up.rowCount === 0) ownerAUpdateFailed = true;
    } catch (err) {
      ownerAUpdateFailed = true;
    }
    await client1.query("ROLLBACK TO SAVEPOINT sp_update;");
    assert(ownerAUpdateFailed, 'Owner A direct UPDATE on public.branches DENIED by RLS policy');

    // Safe transaction test: Direct DELETE
    await client1.query("SAVEPOINT sp_delete;");
    let ownerADeleteFailed = false;
    try {
      const del = await client1.query(`DELETE FROM public.branches WHERE tenant_id = '${tenantRLSA_id}';`);
      if (del.rowCount === 0) ownerADeleteFailed = true;
    } catch (err) {
      ownerADeleteFailed = true;
    }
    await client1.query("ROLLBACK TO SAVEPOINT sp_delete;");
    assert(ownerADeleteFailed, 'Owner A direct DELETE on public.branches DENIED by RLS policy');

    const ownerARpcRes = await client1.query(`SELECT public.create_tenant_branch('${tenantRLSA_id}', 'Owner RPC Branch', 'owner-rpc') as res;`);
    assert(ownerARpcRes.rows[0].res.success === true, 'Owner A RPC mutation ALLOWED');
    await client1.query('ROLLBACK;');

    // 2. Super Admin RLS Boundary
    await client1.query('BEGIN;');
    await client1.query("SET LOCAL ROLE authenticated;");
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${admin_id}', true);`);

    const adminSelect = await client1.query(`SELECT count(*) FROM public.branches;`);
    assert(parseInt(adminSelect.rows[0].count, 10) >= 1, 'Super Admin CAN SELECT all branches under RLS');

    await client1.query("SAVEPOINT sp_admin_insert;");
    let adminInsertFailed = false;
    try {
      await client1.query(`INSERT INTO public.branches (tenant_id, name, slug) VALUES ('${tenantRLSA_id}', 'Admin Direct', 'admin-direct');`);
    } catch (err) {
      adminInsertFailed = true;
    }
    await client1.query("ROLLBACK TO SAVEPOINT sp_admin_insert;");
    assert(adminInsertFailed, 'Super Admin direct DML on public.branches DENIED by RLS policy');

    const adminRpcRes = await client1.query(`SELECT public.create_tenant_branch('${tenantRLSA_id}', 'Admin RPC Branch', 'admin-rpc') as res;`);
    assert(adminRpcRes.rows[0].res.success === true, 'Super Admin RPC mutation ALLOWED');
    await client1.query('ROLLBACK;');

    // 3. Staff RLS Boundary
    await client1.query('BEGIN;');
    await client1.query("SET LOCAL ROLE authenticated;");
    await client1.query(`SELECT set_config('request.jwt.claim.sub', '${staffRLSA_id}', true);`);

    const staffSelect = await client1.query(`SELECT count(*) FROM public.branches WHERE tenant_id = '${tenantRLSA_id}';`);
    assert(parseInt(staffSelect.rows[0].count, 10) >= 1, 'Staff A CAN SELECT own tenant branches under RLS');

    await client1.query("SAVEPOINT sp_staff_insert;");
    let staffInsertFailed = false;
    try {
      await client1.query(`INSERT INTO public.branches (tenant_id, name, slug) VALUES ('${tenantRLSA_id}', 'Staff Direct', 'staff-direct');`);
    } catch (err) {
      staffInsertFailed = true;
    }
    await client1.query("ROLLBACK TO SAVEPOINT sp_staff_insert;");
    assert(staffInsertFailed, 'Staff A direct DML on public.branches DENIED by RLS policy');

    const staffRpcRes = await client1.query(`SELECT public.create_tenant_branch('${tenantRLSA_id}', 'Staff RPC Branch', 'staff-rpc') as res;`);
    assert(staffRpcRes.rows[0].res.success === false && staffRpcRes.rows[0].res.reason_code === 'forbidden', 'Staff A RPC mutation DENIED (reason_code = forbidden)');
    await client1.query('ROLLBACK;');

  } finally {
    await client1.end();
    await client2.end();
  }

  assert(rawDeadlockCount === 0, `RAW_DEADLOCK_COUNT = ${rawDeadlockCount} (expected 0)`);
  assert(rawUniqueViolationCount === 0, `RAW_UNIQUE_VIOLATION_COUNT = ${rawUniqueViolationCount} (expected 0)`);
  assert(concurrencyTimeoutCount === 0, `CONCURRENCY_TIMEOUT_COUNT = ${concurrencyTimeoutCount} (expected 0)`);

  if (failures > 0) {
    console.error(`\n❌ Real Concurrency & RLS Harness failed with ${failures} errors.`);
    process.exit(1);
  } else {
    console.log('\nHARNESS_DB_EXECUTION_OCCURRED = YES');
    console.log('HARNESS_EXECUTION_COMPLETED = YES');
    console.log('🎉 ALL REAL MULTI-SESSION CONCURRENCY & AUTHENTICATED RLS TESTS PASSED SUCCESSFULLY!');
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('package_branch_concurrency_harness.ts')) {
  runPackageBranchConcurrencyHarness().catch(err => {
    console.error('Unhandled error in concurrency harness:', err);
    process.exit(1);
  });
}
