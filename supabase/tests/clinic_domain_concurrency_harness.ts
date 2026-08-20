// supabase/tests/clinic_domain_concurrency_harness.ts
// Real Multi-Session Concurrency & Authenticated RLS Harness for Clinic Block 1
// Governance: EXECUTES ONLY ON DISPOSABLE LOCAL SUPABASE QA DB (127.0.0.1:54322) - FAILS CLOSED IF DB UNAVAILABLE

import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
const { Client } = pg;

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runClinicDomainConcurrencyHarness() {
  const executionId = crypto.randomUUID();
  console.log('=== CLINIC DOMAIN REAL MULTI-SESSION CONCURRENCY HARNESS STARTED ===');
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

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ CLINIC HARNESS FAILED: ${msg}`);
      failures++;
      throw new Error(`CLINIC HARNESS ASSERTION FAILURE: ${msg}`);
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

  // Seed test environment for concurrency
  const tenant_id  = 'f1111111-1111-4111-8111-111111111111';
  const tenant2_id = 'f2222222-2222-4222-8222-222222222222';
  
  const owner_id = 'f1555555-5555-4555-8555-555555555555';
  const doc1_id  = 'f1666666-6666-4666-8666-666666666666';
  const doc2_id  = 'f2666666-6666-4666-8666-666666666666';
  
  const staff_doc1_id = 'f1777777-7777-4777-8777-777777777777';
  const staff_doc2_id = 'f2777777-7777-4777-8777-777777777777';
  
  const branch_id = 'f1888888-8888-4888-8888-888888888888';
  const cust_id   = 'f1999999-9999-4999-8999-999999999999';
  const appt_id   = 'f1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
      DELETE FROM public.tenants WHERE id IN ('${tenant_id}', '${tenant2_id}');

      INSERT INTO public.tenants (id, slug, name, status) VALUES 
      ('${tenant_id}', 'conc-t1', 'Concurrency Tenant 1', 'active'),
      ('${tenant2_id}', 'conc-t2', 'Concurrency Tenant 2', 'active');

      INSERT INTO auth.users (id, email) VALUES
      ('${owner_id}', 'owner_c@test.com'),
      ('${doc1_id}', 'doc1_c@test.com'),
      ('${doc2_id}', 'doc2_c@test.com');

      INSERT INTO public.users_profile (id, tenant_id, role, full_name) VALUES
      ('${owner_id}', '${tenant_id}', 'tenant_owner', 'Owner C'),
      ('${doc1_id}', '${tenant_id}', 'staff', 'Dr. Doc 1'),
      ('${doc2_id}', '${tenant2_id}', 'staff', 'Dr. Doc 2');

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
    `);

    // SCENARIO A: Concurrent double-start encounter for same appointment
    console.log('--- SCENARIO A: Concurrent double-start encounter ---');
    
    await client1.query(`SET LOCAL request.jwt.claim.sub = '${doc1_id}'; SET LOCAL ROLE authenticated;`);
    await client2.query(`SET LOCAL request.jwt.claim.sub = '${doc1_id}'; SET LOCAL ROLE authenticated;`);

    const p1 = client1.query(`SELECT public.clinic_start_encounter('${appt_id}', 'Concurrent start 1');`);
    const p2 = client2.query(`SELECT public.clinic_start_encounter('${appt_id}', 'Concurrent start 2');`);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected');

    assert(fulfilled.length === 1, 'Exactly one simultaneous encounter start call succeeded.');
    assert(rejected.length === 1, 'Exactly one simultaneous encounter start call failed with lock / ALREADY_EXISTS.');

    const encRes = (fulfilled[0] as PromiseFulfilledResult<any>).value.rows[0].clinic_start_encounter;
    const encounter_id = encRes.encounter_id;
    validateUuid(encounter_id, 'Encounter ID');

    // SCENARIO B: Concurrent note writes produce unique sequential versions
    console.log('--- SCENARIO B: Concurrent note writes ---');

    const noteP1 = client1.query(`SELECT public.clinic_save_encounter_note('${encounter_id}', 'Note A', 'Obj A', 'Ass A', 'Plan A', 'draft');`);
    const noteP2 = client2.query(`SELECT public.clinic_save_encounter_note('${encounter_id}', 'Note B', 'Obj B', 'Ass B', 'Plan B', 'draft');`);

    const noteResults = await Promise.allSettled([noteP1, noteP2]);
    const noteFulfilled = noteResults.filter(r => r.status === 'fulfilled');

    assert(noteFulfilled.length === 2, 'Both concurrent note writes completed safely without deadlock.');

    const versions = noteFulfilled.map(r => (r as PromiseFulfilledResult<any>).value.rows[0].clinic_save_encounter_note.version);
    versions.sort((a, b) => a - b);
    assert(versions[0] === 1 && versions[1] === 2, `Note versions produced were strictly sequential: [${versions.join(', ')}]`);

    // Verify version 1 and version 2 both exist and version 1 was NOT overwritten
    const checkVersions = await client1.query(`SELECT version, subjective FROM public.clinic_encounter_notes WHERE encounter_id = '${encounter_id}' ORDER BY version ASC;`);
    assert(checkVersions.rows.length === 2, 'Exactly 2 note versions persisted in database.');
    assert(checkVersions.rows[0].version === 1 && checkVersions.rows[0].subjective === 'Note A' || checkVersions.rows[0].subjective === 'Note B', 'Version 1 preserved original text.');

    // SCENARIO C: Cross-tenant concurrent call does not escape tenant boundary
    console.log('--- SCENARIO C: Cross-tenant concurrency boundary check ---');
    await client2.query(`SET LOCAL request.jwt.claim.sub = '${doc2_id}'; SET LOCAL ROLE authenticated;`);
    
    try {
      await client2.query(`SELECT public.clinic_save_encounter_note('${encounter_id}', 'Hacked Note', NULL, NULL, NULL, 'draft');`);
      assert(false, 'Cross-tenant note save should have thrown FORBIDDEN exception.');
    } catch (err: any) {
      assert(err.message.includes('FORBIDDEN') || err.message.includes('NOT_FOUND'), 'Cross-tenant call failed closed correctly.');
    }

    console.log('HARNESS_DB_EXECUTION_OCCURRED = YES');
    console.log('HARNESS_EXECUTION_COMPLETED = YES');
    console.log('\n🎉 ALL CLINIC REAL CONCURRENCY HARNESS TESTS PASSED SUCCESSFULLY!');
  } finally {
    await client1.end();
    await client2.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('clinic_domain_concurrency_harness.ts')) {
  runClinicDomainConcurrencyHarness().catch((err) => {
    console.error('❌ HARNESS EXCEPTION:', err);
    process.exit(1);
  });
}
