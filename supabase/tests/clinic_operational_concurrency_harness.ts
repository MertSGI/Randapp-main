import pg from 'pg';
import assert from 'assert';

export async function runClinicOperationalConcurrencyHarness() {
  console.log('=== CLINIC OPERATIONAL INTEGRATION REAL MULTI-SESSION CONCURRENCY HARNESS STARTED ===');

  const connectionString = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  
  const client1 = new pg.Client({ connectionString });
  const client2 = new pg.Client({ connectionString });

  await client1.connect();
  await client2.connect();

  const tenant_id = '11111111-1111-4111-8111-111111111111';
  const tenant2_id = '22222222-2222-4222-8222-222222222222';

  const owner_id = 'a1111111-1111-4111-8111-111111111111';
  const doc1_id  = 'a3333333-3333-4333-8333-333333333333';
  const doc2_id  = 'a4444444-4444-4444-8444-444444444444';

  const staff_doc1_id = 's1111111-1111-4111-8111-111111111111';
  const staff_doc2_id = 's2222222-2222-4222-8222-222222222222';

  const branch_id = 'b1111111-1111-4111-8111-111111111111';
  const cust_id   = 'c1111111-1111-4111-8111-111111111111';
  const appt_id   = 'f1111111-1111-4111-8111-111111111111';
  const enc_id    = 'e1111111-1111-4111-8111-111111111111';

  try {
    // Setup isolated fixtures
    await client1.query(`
      DELETE FROM public.audit_events WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.clinic_encounter_notes WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.clinic_encounters WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.clinic_patient_profiles WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.appointments WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.staff WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.customers WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.branches WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.users_profile WHERE id IN ('${owner_id}', '${doc1_id}', '${doc2_id}');
      DELETE FROM auth.users WHERE id IN ('${owner_id}', '${doc1_id}', '${doc2_id}');
      DELETE FROM public.subscriptions WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
      DELETE FROM public.tenants WHERE id IN ('${tenant_id}', '${tenant2_id}');

      INSERT INTO public.tenants (id, slug, name, status) VALUES 
      ('${tenant_id}', 'conc-op-t1', 'Concurrency Op Tenant 1', 'active'),
      ('${tenant2_id}', 'conc-op-t2', 'Concurrency Op Tenant 2', 'active');

      INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
      SELECT '${tenant_id}', p.id, pv.id, 'active', 'manual'
      FROM public.plans p
      JOIN public.plan_versions pv ON pv.plan_id = p.id
      WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
      ORDER BY pv.created_at DESC LIMIT 1;

      INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
      SELECT '${tenant2_id}', p.id, pv.id, 'active', 'manual'
      FROM public.plans p
      JOIN public.plan_versions pv ON pv.plan_id = p.id
      WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
      ORDER BY pv.created_at DESC LIMIT 1;

      INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, is_unlimited, integer_value, reason)
      VALUES ('${tenant_id}', 'max_staff', 'integer', true, NULL, 'Clinic operational concurrency fixture'),
             ('${tenant2_id}', 'max_staff', 'integer', true, NULL, 'Clinic operational concurrency fixture');

      INSERT INTO auth.users (id, email) VALUES
      ('${owner_id}', 'owner_op@test.com'),
      ('${doc1_id}', 'doc1_op@test.com'),
      ('${doc2_id}', 'doc2_op@test.com');

      INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
      ('${owner_id}', '${tenant_id}', 'tenant_owner', 'Owner C', true),
      ('${doc1_id}', '${tenant_id}', 'staff', 'Dr. Doc 1', true),
      ('${doc2_id}', '${tenant2_id}', 'staff', 'Dr. Doc 2', true);

      INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
      ('${staff_doc1_id}', '${tenant_id}', '${doc1_id}', 'Dr. Doc 1', true),
      ('${staff_doc2_id}', '${tenant2_id}', '${doc2_id}', 'Dr. Doc 2', true);

      INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, practitioner_type, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes) VALUES
      ('${tenant_id}', '${staff_doc1_id}', 'physician', true, true, true),
      ('${tenant2_id}', '${staff_doc2_id}', 'physician', true, true, true);

      INSERT INTO public.branches (id, tenant_id, name, is_primary) VALUES
      ('${branch_id}', '${tenant_id}', 'Conc Branch', true);

      INSERT INTO public.customers (id, tenant_id, name, email) VALUES
      ('${cust_id}', '${tenant_id}', 'Conc Patient', 'conc@patient.com');

      INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, branch_id, appointment_date, appointment_time, status) VALUES
      ('${appt_id}', '${tenant_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', '2026-09-15', '14:00:00', 'confirmed');

      INSERT INTO public.clinic_encounters (id, tenant_id, appointment_id, customer_id, practitioner_staff_id, branch_id, status, started_at, created_by, created_at, updated_at) VALUES
      ('${enc_id}', '${tenant_id}', '${appt_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', 'open', now(), '${doc1_id}', now(), now());
    `);

    // SCENARIO A: Two simultaneous completion calls against one open encounter
    console.log('--- SCENARIO A: Concurrent completion calls ---');

    const runCompletionInTx = async (client: pg.Client, user_id: string) => {
      await client.query('BEGIN;');
      try {
        await client.query('SET LOCAL ROLE authenticated;');
        await client.query(`SELECT set_config('request.jwt.claim.sub', '${user_id}', true);`);
        const res = await client.query(`SELECT public.clinic_complete_encounter_and_appointment('${enc_id}') AS res;`);
        await client.query('COMMIT;');
        return res.rows[0].res;
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      }
    };

    const p1 = runCompletionInTx(client1, doc1_id);
    const p2 = runCompletionInTx(client2, doc1_id);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');

    assert(fulfilled.length === 2, 'Both concurrent completion calls fulfilled safely.');

    const res1 = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    const res2 = (fulfilled[1] as PromiseFulfilledResult<any>).value;

    const hasOk = res1.reason_code === 'ok' || res2.reason_code === 'ok';
    const hasAlreadyCompleted = res1.reason_code === 'already_completed' || res2.reason_code === 'already_completed';

    assert(hasOk && hasAlreadyCompleted, 'Exactly one call returned ok and one returned already_completed.');

    // SCENARIO B: Simultaneous unauthorized vs authorized completion attempt
    console.log('--- SCENARIO B: Unauthorized vs Authorized completion attempt ---');

    // Reset encounter and appointment back to open / confirmed
    await client1.query(`
      UPDATE public.clinic_encounters SET status = 'open', completed_at = NULL WHERE id = '${enc_id}';
      UPDATE public.appointments SET status = 'confirmed' WHERE id = '${appt_id}';
    `);

    const pAuthorized = runCompletionInTx(client1, doc1_id);
    const pUnauthorized = runCompletionInTx(client2, doc2_id); // Tenant 2 practitioner (unauthorized)

    const resultsB = await Promise.allSettled([pAuthorized, pUnauthorized]);
    const authFulfilled = resultsB[0].status === 'fulfilled';
    const unauthRejected = resultsB[1].status === 'rejected';

    assert(authFulfilled, 'Authorized completion succeeded.');
    assert(unauthRejected, 'Unauthorized completion failed closed.');

    // SCENARIO C: Verify final DB state consistency
    const finalEnc = (await client1.query(`SELECT status FROM public.clinic_encounters WHERE id = '${enc_id}'`)).rows[0];
    const finalAppt = (await client1.query(`SELECT status FROM public.appointments WHERE id = '${appt_id}'`)).rows[0];

    assert(finalEnc.status === 'completed', 'Final encounter status is completed.');
    assert(finalAppt.status === 'completed', 'Final appointment status is completed.');

    console.log('CLINIC_OPERATIONAL_DB_EXECUTION_OCCURRED = YES');
    console.log('CLINIC_OPERATIONAL_REAL_CONCURRENCY = YES');
    console.log('CLINIC_OPERATIONAL_ATOMIC_COMPLETION_PROVEN = YES');

  } finally {
    await client1.end();
    await client2.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('clinic_operational_concurrency_harness.ts')) {
  runClinicOperationalConcurrencyHarness()
    .then(() => {
      console.log('🎉 Clinic Operational Integration Concurrency Harness Passed Successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Harness Exception:', err);
      process.exit(1);
    });
}
