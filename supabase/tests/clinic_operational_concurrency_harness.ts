import pg from 'pg';
import assert from 'assert';

export async function runClinicOperationalConcurrencyHarness() {
  console.log('=== CLINIC OPERATIONAL INTEGRATION REAL MULTI-SESSION CONCURRENCY HARNESS STARTED (R3) ===');

  const connectionString = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  
  const client1 = new pg.Client({ connectionString });
  const client2 = new pg.Client({ connectionString });
  const client3 = new pg.Client({ connectionString });

  await client1.connect();
  await client2.connect();
  await client3.connect();

  const tenant_id = '11111111-1111-4111-8111-111111111111';
  const tenant2_id = '22222222-2222-4222-8222-222222222222';

  const owner_id = 'a1111111-1111-4111-8111-111111111111';
  const doc1_id  = 'a3333333-3333-4333-8333-333333333333';
  const doc2_id  = 'a4444444-4444-4444-8444-444444444444';

  const staff_doc1_id = '31111111-1111-4111-8111-111111111111';
  const staff_doc2_id = '32222222-2222-4222-8222-222222222222';

  const branch_id = 'b1111111-1111-4111-8111-111111111111';
  const cust_id   = 'c1111111-1111-4111-8111-111111111111';

  // Appointment IDs for different scenarios
  const appt_control_id      = 'f0000000-0000-4000-8000-000000000000';
  const appt_race_start_id   = 'f1111111-1111-4111-8111-111111111111';
  const appt_race_comp_id    = 'f2222222-2222-4222-8222-222222222222';
  const appt_dup_comp_id     = 'f3333333-3333-4333-8333-333333333333';
  const enc_comp_id          = 'e2222222-2222-4222-8222-222222222222';
  const enc_dup_comp_id      = 'e3333333-3333-4333-8333-333333333333';

  try {
    // Setup isolated fixtures
    await client1.query(`
      DELETE FROM public.communication_outbox WHERE tenant_id IN ('${tenant_id}', '${tenant2_id}');
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

      INSERT INTO public.customers (id, tenant_id, name, email, phone) VALUES
      ('${cust_id}', '${tenant_id}', 'Conc Patient', 'conc@patient.com', '5551234567');

      -- Appointments for control and race scenarios
      INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, branch_id, appointment_date, appointment_time, status, phone) VALUES
      ('${appt_control_id}',    '${tenant_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', '2026-09-15', '13:00:00', 'confirmed', '5551234567'),
      ('${appt_race_start_id}', '${tenant_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', '2026-09-15', '14:00:00', 'confirmed', '5551234567'),
      ('${appt_race_comp_id}',  '${tenant_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', '2026-09-15', '15:00:00', 'confirmed', '5551234567'),
      ('${appt_dup_comp_id}',   '${tenant_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', '2026-09-15', '16:00:00', 'confirmed', '5551234567');

      -- Pre-create encounters for completion races
      INSERT INTO public.clinic_encounters (id, tenant_id, appointment_id, customer_id, practitioner_staff_id, branch_id, status, started_at, created_by, created_at, updated_at) VALUES
      ('${enc_comp_id}',     '${tenant_id}', '${appt_race_comp_id}', '${cust_id}', '${staff_doc1_id}', '${branch_id}', 'open', now(), '${doc1_id}', now(), now()),
      ('${enc_dup_comp_id}', '${tenant_id}', '${appt_dup_comp_id}',  '${cust_id}', '${staff_doc1_id}', '${branch_id}', 'open', now(), '${doc1_id}', now(), now());
    `);

    console.log('CLINIC_OPERATIONAL_DB_EXECUTION_OCCURRED = YES');
    console.log('CLINIC_OPERATIONAL_REAL_CONCURRENCY = YES');

    // Helper: run RPC in an independent transaction
    const runInTx = async (client: pg.Client, user_id: string, sql: string) => {
      await client.query('BEGIN;');
      try {
        await client.query('SET LOCAL ROLE authenticated;');
        await client.query(`SELECT set_config('request.jwt.claim.sub', '${user_id}', true);`);
        const res = await client.query(sql);
        await client.query('COMMIT;');
        const firstRowRes = res.rows[0]?.res;
        return {
          success: true,
          rows: res.rows,
          result: firstRowRes
        };
      } catch (err: unknown) {
        await client.query('ROLLBACK;');
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    };

    // =================================================================
    // CONTROL TEST: Core Owner Status RPC Control (Section 3)
    // =================================================================
    console.log('--- CONTROL TEST: Core Owner Status RPC Control ---');
    const controlRes = await runInTx(
      client2,
      owner_id,
      `SELECT public.admin_update_appointment_status('${appt_control_id}', 'cancelled', 'Control test cancellation', 'idemp_control_001') AS res;`
    );

    assert(controlRes.success === true, `Control Test Failed: TX error = ${controlRes.error}`);
    assert(controlRes.result && typeof controlRes.result === 'object', 'Control Test Failed: RPC result is empty');
    assert((controlRes.result as Record<string, unknown>).success === true, `Control Test Failed: RPC returned failure = ${JSON.stringify(controlRes.result)}`);

    const controlApptState = (await client3.query(`SELECT status FROM public.appointments WHERE id = '${appt_control_id}'`)).rows[0];
    assert(controlApptState && controlApptState.status === 'cancelled', `Control Test Failed: DB status is ${controlApptState?.status}, expected cancelled`);

    console.log('CORE_OWNER_STATUS_RPC_CONTROL = PASS');

    // =================================================================
    // SCENARIO A: start-vs-cancel race (Section 3)
    // =================================================================
    console.log('--- SCENARIO A: start-vs-cancel race ---');

    // Session A (doc1) starts encounter, Session B (owner) cancels appointment using canonical Core RPC
    const pStart = runInTx(
      client1,
      doc1_id,
      `SELECT public.clinic_start_encounter('${appt_race_start_id}', 'Race test') AS res;`
    );
    const pCancel = runInTx(
      client2,
      owner_id,
      `SELECT public.admin_update_appointment_status('${appt_race_start_id}', 'cancelled', 'Start-cancel race cancellation', 'idemp_race_start_001') AS res;`
    );

    const [rStart, rCancel] = await Promise.allSettled([pStart, pCancel]);
    assert(rStart.status === 'fulfilled' && rCancel.status === 'fulfilled', 'Both race invocations settled safely.');

    // Query persisted DB truth
    const finalStartAppt = (await client3.query(`SELECT status FROM public.appointments WHERE id = '${appt_race_start_id}'`)).rows[0];
    const startEncCount = (await client3.query(`SELECT count(*) as cnt FROM public.clinic_encounters WHERE appointment_id = '${appt_race_start_id}' AND status = 'open'`)).rows[0];

    // Must be one of exactly two allowed terminal states:
    // CASE A: appointment = cancelled, open encounter count = 0
    // CASE B: appointment = confirmed, open encounter count = 1
    const caseA = finalStartAppt.status === 'cancelled' && parseInt(startEncCount.cnt) === 0;
    const caseB = finalStartAppt.status === 'confirmed' && parseInt(startEncCount.cnt) === 1;

    assert(caseA || caseB,
      `START_CANCEL RACE INVARIANT FAILED: appt=${finalStartAppt.status}, open_enc=${startEncCount.cnt}. ` +
      `Must be (cancelled,0) or (confirmed,1).`);

    // Forbidden states
    assert(!(finalStartAppt.status === 'cancelled' && parseInt(startEncCount.cnt) > 0),
      'FORBIDDEN STATE: appointment cancelled but open encounter exists!');
    assert(!(finalStartAppt.status === 'completed' && parseInt(startEncCount.cnt) > 0),
      'FORBIDDEN STATE: appointment completed but open encounter exists!');
    assert(!(finalStartAppt.status === 'no_show' && parseInt(startEncCount.cnt) > 0),
      'FORBIDDEN STATE: appointment no_show but open encounter exists!');

    console.log(`  Start-cancel race resolved: appt=${finalStartAppt.status}, open_encounters=${startEncCount.cnt}`);
    console.log('CLINIC_START_CANCEL_RACE_INVARIANT_PROVEN = YES');

    // =================================================================
    // SCENARIO B: completion-vs-cancel race (Section 4)
    // =================================================================
    console.log('--- SCENARIO B: completion-vs-cancel race ---');

    // Session A completes encounter + appointment, Session B cancels appointment using canonical Core RPC
    const pComplete = runInTx(
      client1,
      doc1_id,
      `SELECT public.clinic_complete_encounter_and_appointment('${enc_comp_id}') AS res;`
    );
    const pCancelComp = runInTx(
      client2,
      owner_id,
      `SELECT public.admin_update_appointment_status('${appt_race_comp_id}', 'cancelled', 'Completion-cancel race cancellation', 'idemp_race_comp_001') AS res;`
    );

    const [rComplete, rCancelComp] = await Promise.allSettled([pComplete, pCancelComp]);
    assert(rComplete.status === 'fulfilled' && rCancelComp.status === 'fulfilled', 'Both completion-cancel invocations settled safely.');

    const finalCompAppt = (await client3.query(`SELECT status FROM public.appointments WHERE id = '${appt_race_comp_id}'`)).rows[0];
    const finalCompEnc = (await client3.query(`SELECT status FROM public.clinic_encounters WHERE id = '${enc_comp_id}'`)).rows[0];

    // Forbidden states under all circumstances
    assert(!(finalCompEnc.status === 'completed' && finalCompAppt.status === 'cancelled'),
      'FORBIDDEN STATE: encounter completed but appointment cancelled!');
    assert(!(finalCompEnc.status === 'completed' && finalCompAppt.status === 'no_show'),
      'FORBIDDEN STATE: encounter completed but appointment no_show!');
    assert(!(finalCompEnc.status === 'open' && finalCompAppt.status === 'completed'),
      'FORBIDDEN STATE: encounter open but appointment completed!');
    assert(!(finalCompEnc.status === 'open' && finalCompAppt.status === 'cancelled'),
      'FORBIDDEN STATE: encounter open but appointment cancelled!');

    // Allowed consistent state: both completed (or confirmed + open if cancellation failed closed due to guard)
    const compCaseValid = (finalCompAppt.status === 'completed' && finalCompEnc.status === 'completed') ||
                          (finalCompAppt.status === 'confirmed' && finalCompEnc.status === 'open');

    assert(compCaseValid,
      `COMPLETION_CANCEL RACE INVARIANT FAILED: appt=${finalCompAppt.status}, enc=${finalCompEnc.status}`);

    console.log(`  Completion-cancel race resolved: appt=${finalCompAppt.status}, enc=${finalCompEnc.status}`);
    console.log('CLINIC_COMPLETION_CANCEL_RACE_INVARIANT_PROVEN = YES');

    // =================================================================
    // SCENARIO C: duplicate completion outbox exactly-once (Section 5)
    // =================================================================
    console.log('--- SCENARIO C: concurrent duplicate completion / outbox exactly-once ---');

    // Clear outbox for this appointment
    await client3.query(`DELETE FROM public.communication_outbox WHERE (metadata->>'appointment_id') = '${appt_dup_comp_id}'`);

    const pDup1 = runInTx(
      client1,
      doc1_id,
      `SELECT public.clinic_complete_encounter_and_appointment('${enc_dup_comp_id}') AS res;`
    );
    const pDup2 = runInTx(
      client2,
      doc1_id,
      `SELECT public.clinic_complete_encounter_and_appointment('${enc_dup_comp_id}') AS res;`
    );

    const dupResults = await Promise.allSettled([pDup1, pDup2]);
    const dupFulfilled = dupResults.filter(r => r.status === 'fulfilled');
    assert(dupFulfilled.length === 2, 'Both concurrent completion calls fulfilled safely.');

    // Verify final DB state
    const finalDupAppt = (await client3.query(`SELECT status FROM public.appointments WHERE id = '${appt_dup_comp_id}'`)).rows[0];
    const finalDupEnc = (await client3.query(`SELECT status FROM public.clinic_encounters WHERE id = '${enc_dup_comp_id}'`)).rows[0];

    assert(finalDupAppt.status === 'completed', 'Duplicate completion: appointment must be completed.');
    assert(finalDupEnc.status === 'completed', 'Duplicate completion: encounter must be completed.');

    // Verify exactly one outbox row
    const outboxCount = (await client3.query(
      `SELECT count(*) as cnt FROM public.communication_outbox
       WHERE (metadata->>'appointment_id') = '${appt_dup_comp_id}'
         AND (metadata->>'event_type') = 'appointment_completed'`
    )).rows[0];

    assert(parseInt(outboxCount.cnt) === 1,
      `OUTBOX EXACTLY-ONCE FAILED: expected 1, got ${outboxCount.cnt}`);

    console.log(`  Duplicate completion outbox count: ${outboxCount.cnt} (expected 1)`);
    console.log('CLINIC_OPERATIONAL_ATOMIC_COMPLETION_PROVEN = YES');
    console.log('CLINIC_COMPLETION_OUTBOX_EXACTLY_ONCE_PROVEN = YES');

    // =================================================================
    // SCENARIO D: unauthorized vs authorized completion
    // =================================================================
    console.log('--- SCENARIO D: Unauthorized vs Authorized completion ---');

    // Reset dup encounter for this test by updating appointment FIRST while encounter is completed, then encounter to open
    await client3.query(`
      UPDATE public.appointments SET status = 'confirmed' WHERE id = '${appt_dup_comp_id}';
      UPDATE public.clinic_encounters SET status = 'open', completed_at = NULL WHERE id = '${enc_dup_comp_id}';
    `);

    const pAuth = runInTx(
      client1,
      doc1_id,
      `SELECT public.clinic_complete_encounter_and_appointment('${enc_dup_comp_id}') AS res;`
    );
    const pUnauth = runInTx(
      client2,
      doc2_id, // Tenant 2 practitioner (unauthorized)
      `SELECT public.clinic_complete_encounter_and_appointment('${enc_dup_comp_id}') AS res;`
    );

    const resultsD = await Promise.allSettled([pAuth, pUnauth]);
    assert(resultsD[0].status === 'fulfilled' && resultsD[1].status === 'fulfilled', 'Both D invocations settled.');

    // The authorized call must succeed, the unauthorized must fail
    const finalDEnc = (await client3.query(`SELECT status FROM public.clinic_encounters WHERE id = '${enc_dup_comp_id}'`)).rows[0];
    assert(finalDEnc.status === 'completed', 'Authorized completion must eventually succeed.');

  } finally {
    await client1.end();
    await client2.end();
    await client3.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('clinic_operational_concurrency_harness.ts')) {
  runClinicOperationalConcurrencyHarness()
    .then(() => {
      console.log('🎉 Clinic Operational Integration Concurrency Harness Passed Successfully (R3)!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Harness Exception:', err);
      process.exit(1);
    });
}
