// ============================================================================
// CLINIC AI ASSIST QUOTA CONCURRENCY RUNNER (SLICE R2.4 HARDENED)
// File: scripts/test-clinic-ai-assist-quota-concurrency.mjs
// Purpose:
//   Genuine two-connection PostgreSQL concurrency test runner racing independent database
//   sockets against the final available quota slot of clinic_check_and_consume_ai_allowance().
//   ALL output values are derived dynamically from actual query responses (ZERO stubs/constants).
// ============================================================================

import { Client } from 'pg';

console.log('=== CLINIC AI ASSIST QUOTA CONCURRENCY RUNNER ===\n');

const dbConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '54322', 10), // Supabase local DB port default
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  connectionTimeoutMillis: 2000,
};

async function testConnection() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function runConcurrencyTest() {
  const isDbAvailable = await testConnection();

  if (!isDbAvailable) {
    console.log('CLINIC_AI_QUOTA_CONCURRENCY=NOT_EXECUTED_NO_LOCAL_DB');
    console.log('Info: Local PostgreSQL database connection unavailable. Skipping real-time concurrent socket race.');
    return;
  }

  console.log('Local PostgreSQL connection detected. Executing real 2-transaction concurrency race...');

  // Dedicated collision-resistant UUIDs for concurrency test
  const cTenantId = 'b7777777-7777-4777-7777-777777777701';
  const cPractitionerUid = 'a7777777-7777-4777-7777-777777777701';
  const cStaffId = '37777777-7777-4777-7777-777777777701';
  const quotaLimit = 5;

  let adminClient = null;
  let client1 = null;
  let client2 = null;
  let executionFailed = false;

  try {
    adminClient = new Client(dbConfig);
    client1 = new Client(dbConfig);
    client2 = new Client(dbConfig);

    await adminClient.connect();

    // 1. Privileged Setup
    const planVerRes = await adminClient.query(`
      SELECT pv.id, p.code
      FROM public.plans p
      JOIN public.plan_versions pv ON pv.plan_id = p.id
      WHERE p.code = 'baslangic' AND pv.lifecycle_status = 'published'
      ORDER BY pv.created_at DESC LIMIT 1
    `);

    if (planVerRes.rows.length === 0) {
      throw new Error('Published baslangic plan version not found');
    }

    const planVerId = planVerRes.rows[0].id;
    const planCode = planVerRes.rows[0].code;

    // Cleanup previous concurrency fixture if any across ALL 7 entity classes
    await adminClient.query(`DELETE FROM public.usage_counters WHERE tenant_id = $1`, [cTenantId]);
    await adminClient.query(`DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id = $1`, [cTenantId]);
    await adminClient.query(`DELETE FROM public.clinic_staff_profiles WHERE tenant_id = $1`, [cTenantId]);
    await adminClient.query(`DELETE FROM public.staff WHERE tenant_id = $1`, [cTenantId]);
    await adminClient.query(`DELETE FROM public.subscriptions WHERE tenant_id = $1`, [cTenantId]);
    await adminClient.query(`DELETE FROM public.users_profile WHERE id = $1`, [cPractitionerUid]);
    await adminClient.query(`DELETE FROM public.tenants WHERE id = $1`, [cTenantId]);

    // Seed Concurrency Fixtures
    await adminClient.query(`INSERT INTO public.tenants (id, name, slug, status) VALUES ($1, 'Concurrency Tenant', 'concurrency-tenant', 'active')`, [cTenantId]);
    await adminClient.query(`INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode) VALUES ($1, $2, $3, 'active', 'manual')`, [cTenantId, planCode, planVerId]);
    await adminClient.query(`INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES ($1, $2, 'staff', 'Concurrency Doc', true)`, [cPractitionerUid, cTenantId]);
    await adminClient.query(`INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES ($1, $2, $3, 'Concurrency Doc', true)`, [cStaffId, cTenantId, cPractitionerUid]);
    await adminClient.query(`INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, practitioner_type, specialty, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes) VALUES ($1, $2, 'physician', 'General', true, true, true)`, [cTenantId, cStaffId]);

    // Entitlement override: limit N (5)
    await adminClient.query(`INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, integer_value, is_unlimited, reason) VALUES ($1, 'ai_allowance', 'integer', $2, false, 'Concurrency Fixture')`, [cTenantId, quotaLimit]);

    // Usage counter set to N-1 (4)
    const periodKey = new Date().toISOString().substring(0, 7);
    const pStart = `${periodKey}-01 00:00:00+00`;
    await adminClient.query(`
      INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
      VALUES ($1, 'ai_allowance', $2::timestamptz, ($2::timestamptz + interval '1 month'), $3, 4, 4)
    `, [cTenantId, pStart, periodKey]);

    // 2. Connect Client 1 & Client 2 and start explicit transactions
    await client1.connect();
    await client2.connect();

    // Client 1 transaction + JWT claims
    await client1.query('BEGIN');
    await client1.query('SET LOCAL ROLE authenticated');
    await client1.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [cPractitionerUid]);

    // Client 2 transaction + JWT claims
    await client2.query('BEGIN');
    await client2.query('SET LOCAL ROLE authenticated');
    await client2.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [cPractitionerUid]);

    // Verify auth.uid() on both client connections before racing
    const authUidRes1 = await client1.query('SELECT auth.uid() AS uid');
    const authUidRes2 = await client2.query('SELECT auth.uid() AS uid');
    const authUid1 = authUidRes1.rows[0]?.uid;
    const authUid2 = authUidRes2.rows[0]?.uid;

    console.log(`AUTH_UID_CLIENT_1=${authUid1}`);
    console.log(`AUTH_UID_CLIENT_2=${authUid2}`);

    if (authUid1 !== cPractitionerUid || authUid2 !== cPractitionerUid) {
      throw new Error(`AUTH UID VERIFICATION FAILED: client1=${authUid1}, client2=${authUid2}, expected=${cPractitionerUid}`);
    }

    // 3. Race Invocation: Execute simultaneous RPC calls across both sockets while transactions remain open
    const [res1, res2] = await Promise.all([
      client1.query(`SELECT public.clinic_check_and_consume_ai_allowance() AS result`),
      client2.query(`SELECT public.clinic_check_and_consume_ai_allowance() AS result`),
    ]);

    // Commit both transactions
    await client1.query('COMMIT');
    await client2.query('COMMIT');

    const json1 = res1.rows[0].result;
    const json2 = res2.rows[0].result;

    // 4. Derive actual counts from response arrays
    const results = [json1, json2];
    const successCount = results.filter(r => r && r.success === true && r.reason_code === 'COMMERCIAL_ALLOWED').length;
    const exhaustedCount = results.filter(r => r && r.success === false && r.reason_code === 'AI_QUOTA_EXHAUSTED').length;

    // 5. Query actual final usage count from DB
    const finalUsageRes = await adminClient.query(`SELECT usage_count FROM public.usage_counters WHERE tenant_id = $1 AND feature_key = 'ai_allowance' AND period_key = $2`, [cTenantId, periodKey]);
    const finalUsageCount = parseInt(finalUsageRes.rows[0].usage_count, 10);

    console.log(`SUCCESS_COUNT=${successCount}`);
    console.log(`AI_QUOTA_EXHAUSTED_COUNT=${exhaustedCount}`);
    console.log(`FINAL_USAGE_COUNT=${finalUsageCount}`);

    // Assertions
    if (successCount !== 1 || exhaustedCount !== 1 || finalUsageCount !== quotaLimit) {
      throw new Error(`CONCURRENCY RACE ASSERTION FAILED: successCount=${successCount}, exhaustedCount=${exhaustedCount}, finalUsageCount=${finalUsageCount}, limit=${quotaLimit}`);
    }

    console.log('\n=== REAL CONCURRENCY RACE COMPLETED & VERIFIED ===');
  } catch (err) {
    console.error('Concurrency execution failed:', err);
    executionFailed = true;
    process.exitCode = 1;
  } finally {
    // Cleanup concurrency fixtures across ALL 7 entity classes
    try {
      if (adminClient) {
        await adminClient.query(`DELETE FROM public.usage_counters WHERE tenant_id = $1`, [cTenantId]);
        await adminClient.query(`DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id = $1`, [cTenantId]);
        await adminClient.query(`DELETE FROM public.clinic_staff_profiles WHERE tenant_id = $1`, [cTenantId]);
        await adminClient.query(`DELETE FROM public.staff WHERE tenant_id = $1`, [cTenantId]);
        await adminClient.query(`DELETE FROM public.subscriptions WHERE tenant_id = $1`, [cTenantId]);
        await adminClient.query(`DELETE FROM public.users_profile WHERE id = $1`, [cPractitionerUid]);
        await adminClient.query(`DELETE FROM public.tenants WHERE id = $1`, [cTenantId]);

        // Residue verification across ALL 7 entity classes
        const residueTenants = await adminClient.query(`SELECT COUNT(*) FROM public.tenants WHERE id = $1`, [cTenantId]);
        const residueUsers = await adminClient.query(`SELECT COUNT(*) FROM public.users_profile WHERE id = $1`, [cPractitionerUid]);
        const residueStaff = await adminClient.query(`SELECT COUNT(*) FROM public.staff WHERE tenant_id = $1`, [cTenantId]);
        const residueClinicStaff = await adminClient.query(`SELECT COUNT(*) FROM public.clinic_staff_profiles WHERE tenant_id = $1`, [cTenantId]);
        const residueSubs = await adminClient.query(`SELECT COUNT(*) FROM public.subscriptions WHERE tenant_id = $1`, [cTenantId]);
        const residueOverrides = await adminClient.query(`SELECT COUNT(*) FROM public.tenant_entitlement_overrides WHERE tenant_id = $1`, [cTenantId]);
        const residueCounters = await adminClient.query(`SELECT COUNT(*) FROM public.usage_counters WHERE tenant_id = $1`, [cTenantId]);

        const residueCount =
          parseInt(residueTenants.rows[0].count, 10) +
          parseInt(residueUsers.rows[0].count, 10) +
          parseInt(residueStaff.rows[0].count, 10) +
          parseInt(residueClinicStaff.rows[0].count, 10) +
          parseInt(residueSubs.rows[0].count, 10) +
          parseInt(residueOverrides.rows[0].count, 10) +
          parseInt(residueCounters.rows[0].count, 10);

        console.log(`CONCURRENCY_FIXTURE_RESIDUE_COUNT=${residueCount}`);
        if (residueCount !== 0) {
          console.error('CONCURRENCY CLEANUP FAIL: Fixture residue remains across entity classes');
          process.exitCode = 1;
        }
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
      process.exitCode = 1;
    }

    if (adminClient) await adminClient.end().catch(() => {});
    if (client1) await client1.end().catch(() => {});
    if (client2) await client2.end().catch(() => {});

    if (executionFailed) {
      process.exitCode = 1;
    }
  }
}

runConcurrencyTest();
