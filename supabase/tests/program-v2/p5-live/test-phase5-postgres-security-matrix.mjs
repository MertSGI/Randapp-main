import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let testsExecuted = 0;
let testsPassed = 0;
let testsFailed = 0;

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

async function run() {
  console.log('===============================================================');
  console.log('STARTING PHASE 5 NODE 2 & NODE 3 LIVE POSTGRESQL SECURITY MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\n');

  const client = new Client({ connectionString: DB_URL });
  const concurrentClient1 = new Client({ connectionString: DB_URL });
  const concurrentClient2 = new Client({ connectionString: DB_URL });

  await client.connect();
  await concurrentClient1.connect();
  await concurrentClient2.connect();

  const tenantA = '11111111-aaaa-4111-8111-111111111111';
  const tenantB = '22222222-bbbb-4222-8222-222222222222';
  const branchA1 = '11111111-bbbb-4111-8111-111111111111';
  const branchA2 = '11111111-cccc-4111-8111-111111111111';
  const branchB1 = '22222222-bbbb-4222-8222-222222222222';

  const userOwnerA = 'aaaa1111-0000-4000-a000-000000000001';
  const userStaffA = 'aaaa1111-0000-4000-a000-000000000002'; // Has HT & Clinic permissions
  const userOrdinaryStaffA = 'aaaa1111-0000-4000-a000-000000000003'; // Ordinary staff without HT permissions
  const userOwnerB = 'bbbb2222-0000-4000-b000-000000000001';
  const userStaffB = 'bbbb2222-0000-4000-b000-000000000002';

  const staffEntityA = 'aaaa1111-1111-4000-a000-000000000001';
  const staffEntityOrdinaryA = 'aaaa1111-1111-4000-a000-000000000002';
  const staffEntityB = 'bbbb2222-1111-4000-b000-000000000001';

  const customerA = 'aaaa1111-2222-4000-a000-000000000001';
  const customerB = 'bbbb2222-2222-4000-b000-000000000001';

  const leadA = 'aaaa1111-3333-4000-a000-000000000001';
  const leadB = 'bbbb2222-3333-4000-b000-000000000001';

  const apptA = 'aaaa1111-4444-4000-a000-000000000001';
  const apptB = 'bbbb2222-4444-4000-b000-000000000001';

  console.log('--- Seeding Fixtures for Tenant A and Tenant B ---');
  await client.query(`
    -- Cleanup existing test entities
    DELETE FROM public.ht_journey_itinerary_events WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.ht_journey_quotes WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.ht_treatment_journeys WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.ht_staff_profiles WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.ht_leads WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.staff_branches WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.appointments WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.staff WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.customers WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.users_profile WHERE id IN ('${userOwnerA}', '${userStaffA}', '${userOrdinaryStaffA}', '${userOwnerB}', '${userStaffB}');
    DELETE FROM auth.users WHERE id IN ('${userOwnerA}', '${userStaffA}', '${userOrdinaryStaffA}', '${userOwnerB}', '${userStaffB}');
    DELETE FROM public.branches WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.subscriptions WHERE tenant_id IN ('${tenantA}', '${tenantB}');
    DELETE FROM public.tenants WHERE id IN ('${tenantA}', '${tenantB}');

    -- Insert Tenants
    INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
    VALUES
      ('${tenantA}', 'Tenant A Clinic & HT', 'tenant-a-p5', 'active', 'completed', 'published'),
      ('${tenantB}', 'Tenant B Foreign Tenant', 'tenant-b-p5', 'active', 'completed', 'published');

    -- Insert Subscriptions with Vertical HT Enterprise plan
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, plan_version_id, status, billing_mode, current_period_start, current_period_end
    )
    SELECT
      '${tenantA}', p.code, pv.id, 'active', 'manual', now() - interval '1 day', now() + interval '1 year'
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'ht_enterprise' AND pv.lifecycle_status = 'published'
    ORDER BY pv.version_number DESC LIMIT 1;

    INSERT INTO public.subscriptions (
      tenant_id, plan_id, plan_version_id, status, billing_mode, current_period_start, current_period_end
    )
    SELECT
      '${tenantB}', p.code, pv.id, 'active', 'manual', now() - interval '1 day', now() + interval '1 year'
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'ht_enterprise' AND pv.lifecycle_status = 'published'
    ORDER BY pv.version_number DESC LIMIT 1;

    -- Insert Auth Users & Profiles
    INSERT INTO auth.users (id, email) VALUES
      ('${userOwnerA}', 'ownera@lari.p5'),
      ('${userStaffA}', 'staffa@lari.p5'),
      ('${userOrdinaryStaffA}', 'ordinarya@lari.p5'),
      ('${userOwnerB}', 'ownerb@lari.p5'),
      ('${userStaffB}', 'staffb@lari.p5');

    INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES
      ('${userOwnerA}', '${tenantA}', 'Owner A', 'tenant_owner', true),
      ('${userStaffA}', '${tenantA}', 'Staff A HT Coordinator', 'staff', true),
      ('${userOrdinaryStaffA}', '${tenantA}', 'Ordinary Staff A', 'staff', true),
      ('${userOwnerB}', '${tenantB}', 'Owner B', 'tenant_owner', true),
      ('${userStaffB}', '${tenantB}', 'Staff B Foreign', 'staff', true);

    -- Insert Branches
    INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary) VALUES
      ('${branchA1}', '${tenantA}', 'Branch A1 Primary', 'branch-a1-p5', true, true),
      ('${branchA2}', '${tenantA}', 'Branch A2 Secondary', 'branch-a2-p5', true, false),
      ('${branchB1}', '${tenantB}', 'Branch B1 Foreign', 'branch-b1-p5', true, true);

    -- Insert Staff
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
      ('${staffEntityA}', '${tenantA}', '${userStaffA}', 'Coordinator Staff A', true),
      ('${staffEntityOrdinaryA}', '${tenantA}', '${userOrdinaryStaffA}', 'Non-HT Staff A', true),
      ('${staffEntityB}', '${tenantB}', '${userStaffB}', 'Foreign Staff B', true);

    -- Map Staff A to Branch A1 ONLY
    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES
      ('${tenantA}', '${staffEntityA}', '${branchA1}'),
      ('${tenantA}', '${staffEntityOrdinaryA}', '${branchA2}'),
      ('${tenantB}', '${staffEntityB}', '${branchB1}');

    -- Clinic staff profiles for Staff A
    INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, practitioner_type, can_manage_patient_profiles, can_view_clinical_records) VALUES
      ('${tenantA}', '${staffEntityA}', 'physician', true, true);

    -- HT staff profiles: Staff A is HT Coordinator (can_manage_ht_leads=true), Ordinary Staff A has NO HT profile
    INSERT INTO public.ht_staff_profiles (tenant_id, staff_id, can_manage_ht_leads, can_view_ht_leads) VALUES
      ('${tenantA}', '${staffEntityA}', true, true),
      ('${tenantB}', '${staffEntityB}', true, true);

    -- Customers
    INSERT INTO public.customers (id, tenant_id, name, email, phone) VALUES
      ('${customerA}', '${tenantA}', 'Customer A', 'cust_a@p5.test', '+905551110001'),
      ('${customerB}', '${tenantB}', 'Customer B Foreign', 'cust_b@p5.test', '+905552220002');

    -- Leads
    INSERT INTO public.ht_leads (id, tenant_id, full_name, email, phone, status) VALUES
      ('${leadA}', '${tenantA}', 'Lead A', 'lead_a@p5.test', '+905553330001', 'new'),
      ('${leadB}', '${tenantB}', 'Lead B Foreign', 'lead_b@p5.test', '+905554440002', 'new');

    -- Appointments
    INSERT INTO public.appointments (id, tenant_id, customer_id, appointment_date, appointment_time, status) VALUES
      ('${apptA}', '${tenantA}', '${customerA}', (now() + interval '1 day')::date, '10:00:00'::time, 'confirmed'),
      ('${apptB}', '${tenantB}', '${customerB}', (now() + interval '1 day')::date, '10:00:00'::time, 'confirmed');
  `);
  console.log('Fixtures seeded.\n');

  async function setAuth(c, userId, role = 'authenticated') {
    if (!userId) {
      await c.query(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);`);
      return;
    }
    await c.query(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claims', '{"sub": "${userId}", "role": "${role}"}', false);
    `);
  }

  // TEST 1: Node 2 Branch Scope Security Audit
  console.log('--- TEST 1: Node 2 clinic_get_my_context permitted_branch_ids Scoping ---');
  await setAuth(client, userStaffA);
  const ctxRes = await client.query(`SELECT public.clinic_get_my_context() AS ctx;`);
  const ctxData = ctxRes.rows[0].ctx;
  console.log('clinic_get_my_context result:', JSON.stringify(ctxData));
  assert(ctxData.success === true, 'clinic_get_my_context returns success for authorized clinic staff', JSON.stringify(ctxData));
  assert(ctxData.permitted_branch_ids.length === 1 && ctxData.permitted_branch_ids[0] === branchA1,
    'permitted_branch_ids contains ONLY branchA1 from staff_branches mapping, NOT branchA2');

  // TEST 2: Node 3 Authorized Same-Tenant Journey Creation
  console.log('\n--- TEST 2: Authorized Same-Tenant Journey Creation ---');
  const createRes = await client.query(`
    SELECT public.ht_create_treatment_journey(
      p_title := 'Dental Implant Journey A',
      p_lead_id := '${leadA}',
      p_customer_id := '${customerA}',
      p_coordinator_staff_id := '${staffEntityA}',
      p_target_treatment_category := 'Dental'
    ) AS res;
  `);
  const journeyAId = createRes.rows[0].res.journey_id;
  assert(createRes.rows[0].res.success === true && journeyAId, 'Authorized same-tenant journey creation PASS');

  // TEST 3: Ordinary Staff Without HT Permission = DENY
  console.log('\n--- TEST 3: Ordinary Non-HT Staff Journey Creation = DENY ---');
  await setAuth(client, userOrdinaryStaffA);
  let deniedOrdinary = false;
  try {
    await client.query(`
      SELECT public.ht_create_treatment_journey(
        p_title := 'Unauthorized Journey',
        p_lead_id := '${leadA}'
      );
    `);
  } catch (err) {
    deniedOrdinary = true;
    assert(err.message.includes('FORBIDDEN'), 'Non-HT staff denied with FORBIDDEN', err.message);
  }
  assert(deniedOrdinary, 'Ordinary non-HT staff journey creation DENY');

  // TEST 4: Cross-Tenant Lead Association = DENY
  console.log('\n--- TEST 4: Cross-Tenant Lead Association = DENY ---');
  await setAuth(client, userStaffA);
  let deniedLead = false;
  try {
    await client.query(`
      SELECT public.ht_create_treatment_journey(
        p_title := 'Cross-Tenant Lead Journey',
        p_lead_id := '${leadB}'
      );
    `);
  } catch (err) {
    deniedLead = true;
    assert(err.message.includes('Lead does not belong to caller tenant'), 'Cross-tenant lead rejected fail-closed');
  }
  assert(deniedLead, 'Cross-tenant lead association DENY');

  // TEST 5: Cross-Tenant Customer Association = DENY
  console.log('\n--- TEST 5: Cross-Tenant Customer Association = DENY ---');
  let deniedCustomer = false;
  try {
    await client.query(`
      SELECT public.ht_create_treatment_journey(
        p_title := 'Cross-Tenant Customer Journey',
        p_customer_id := '${customerB}'
      );
    `);
  } catch (err) {
    deniedCustomer = true;
    assert(err.message.includes('Customer does not belong to caller tenant'), 'Cross-tenant customer rejected fail-closed');
  }
  assert(deniedCustomer, 'Cross-tenant customer association DENY');

  // TEST 6: Cross-Tenant Coordinator Assignment = DENY
  console.log('\n--- TEST 6: Cross-Tenant Coordinator Assignment = DENY ---');
  let deniedCoord = false;
  try {
    await client.query(`
      SELECT public.ht_create_treatment_journey(
        p_title := 'Cross-Tenant Coord Journey',
        p_coordinator_staff_id := '${staffEntityB}'
      );
    `);
  } catch (err) {
    deniedCoord = true;
    assert(err.message.includes('Assigned coordinator is not an active HT staff member in caller tenant'), 'Cross-tenant coordinator rejected fail-closed');
  }
  assert(deniedCoord, 'Cross-tenant coordinator assignment DENY');

  // TEST 7: Tenant B User Mutating Tenant A Quote By Known Journey UUID = DENY
  console.log('\n--- TEST 7: Tenant B Mutating Tenant A Quote = DENY ---');
  await setAuth(client, userStaffB);
  let deniedQuoteB = false;
  try {
    await client.query(`
      SELECT public.ht_create_or_update_journey_quote(
        p_journey_id := '${journeyAId}',
        p_currency := 'EUR',
        p_total_amount_minor_units := 50000,
        p_items := '[{"description":"Malicious Item","category":"hotel","amount_minor_units":50000}]'::jsonb
      );
    `);
  } catch (err) {
    deniedQuoteB = true;
    assert(err.message.includes('FORBIDDEN'), 'Cross-tenant quote mutation rejected with FORBIDDEN', err.message);
  }
  assert(deniedQuoteB, 'Tenant B user mutating Tenant A quote by UUID DENY');

  // TEST 8: Tenant B User Adding Itinerary Event to Tenant A Journey = DENY
  console.log('\n--- TEST 8: Tenant B Adding Itinerary Event to Tenant A Journey = DENY ---');
  let deniedItinB = false;
  try {
    await client.query(`
      SELECT public.ht_add_journey_itinerary_event(
        p_journey_id := '${journeyAId}',
        p_event_type := 'airport_pickup',
        p_title := 'Malicious Airport Pickup',
        p_scheduled_start := now() + interval '2 days'
      );
    `);
  } catch (err) {
    deniedItinB = true;
    assert(err.message.includes('FORBIDDEN'), 'Cross-tenant itinerary event rejected with FORBIDDEN', err.message);
  }
  assert(deniedItinB, 'Tenant B user adding itinerary event to Tenant A journey DENY');

  // TEST 9: Cross-Tenant Appointment Linkage = DENY
  console.log('\n--- TEST 9: Cross-Tenant Appointment Linkage = DENY ---');
  await setAuth(client, userStaffA);
  let deniedAppt = false;
  try {
    await client.query(`
      SELECT public.ht_add_journey_itinerary_event(
        p_journey_id := '${journeyAId}',
        p_event_type := 'clinical_consultation',
        p_title := 'Cross-Tenant Consultation',
        p_scheduled_start := now() + interval '2 days',
        p_appointment_id := '${apptB}'
      );
    `);
  } catch (err) {
    deniedAppt = true;
    assert(err.message.includes('Appointment does not belong to journey tenant'), 'Cross-tenant appointment rejected');
  }
  assert(deniedAppt, 'Cross-tenant appointment linkage in itinerary DENY');

  // TEST 10: Cross-Tenant Coordinator in Itinerary = DENY
  console.log('\n--- TEST 10: Cross-Tenant Coordinator in Itinerary = DENY ---');
  let deniedItinCoord = false;
  try {
    await client.query(`
      SELECT public.ht_add_journey_itinerary_event(
        p_journey_id := '${journeyAId}',
        p_event_type := 'hotel_checkin',
        p_title := 'Hotel Checkin',
        p_scheduled_start := now() + interval '2 days',
        p_assigned_coordinator_staff_id := '${staffEntityB}'
      );
    `);
  } catch (err) {
    deniedItinCoord = true;
    assert(err.message.includes('Assigned coordinator is not an active HT staff member in journey tenant'), 'Cross-tenant coordinator rejected');
  }
  assert(deniedItinCoord, 'Cross-tenant coordinator assignment in itinerary DENY');

  // TEST 11: Valid Same-Tenant Quote Mutation = PASS
  console.log('\n--- TEST 11: Valid Same-Tenant Quote Mutation = PASS ---');
  const quote1Res = await client.query(`
    SELECT public.ht_create_or_update_journey_quote(
      p_journey_id := '${journeyAId}',
      p_currency := 'EUR',
      p_total_amount_minor_units := 300000,
      p_items := '[{"description":"Package All Inclusive","category":"medical","amount_minor_units":300000}]'::jsonb
    ) AS res;
  `);
  assert(quote1Res.rows[0].res.success === true && quote1Res.rows[0].res.version === 1,
    'Valid same-tenant quote creation version 1 PASS');

  // TEST 12: Valid Same-Tenant Itinerary Mutation = PASS
  console.log('\n--- TEST 12: Valid Same-Tenant Itinerary Mutation = PASS ---');
  const itinRes = await client.query(`
    SELECT public.ht_add_journey_itinerary_event(
      p_journey_id := '${journeyAId}',
      p_event_type := 'airport_pickup',
      p_title := 'VIP Airport Transfer to Hotel',
      p_scheduled_start := now() + interval '2 days',
      p_scheduled_end := now() + interval '2 days 1 hour',
      p_location := 'Istanbul Airport IST',
      p_assigned_coordinator_staff_id := '${staffEntityA}'
    ) AS res;
  `);
  assert(itinRes.rows[0].res.success === true && itinRes.rows[0].res.event_id,
    'Valid same-tenant itinerary event creation PASS');

  // TEST 13: Quote Concurrency Version Allocation Under FOR UPDATE
  console.log('\n--- TEST 13: Deterministic Quote Version Concurrency Under FOR UPDATE ---');
  await setAuth(concurrentClient1, userStaffA);

  const session1Quote = client.query(`
    SELECT public.ht_create_or_update_journey_quote(
      p_journey_id := '${journeyAId}',
      p_currency := 'EUR',
      p_total_amount_minor_units := 150000,
      p_items := '[{"description":"Session 1 Revision","category":"medical","amount_minor_units":150000}]'::jsonb
    ) AS res;
  `);

  const session2Quote = concurrentClient1.query(`
    SELECT public.ht_create_or_update_journey_quote(
      p_journey_id := '${journeyAId}',
      p_currency := 'EUR',
      p_total_amount_minor_units := 200000,
      p_items := '[{"description":"Session 2 Revision","category":"medical","amount_minor_units":200000}]'::jsonb
    ) AS res;
  `);

  const [res1, res2] = await Promise.all([session1Quote, session2Quote]);
  const v1 = res1.rows[0].res.version;
  const v2 = res2.rows[0].res.version;

  assert(v1 !== v2, `Deterministic distinct versions allocated concurrently: v1=${v1}, v2=${v2}`);
  assert((v1 === 2 && v2 === 3) || (v1 === 3 && v2 === 2), 'Concurrent versions serialized monotonically');

  console.log('\n===============================================================');
  console.log(`LIVE POSTGRESQL SECURITY MATRIX: ${testsPassed}/${testsExecuted} TESTS PASSED | ZERO FAILURES`);
  console.log('===============================================================\n');

  await client.end();
  await concurrentClient1.end();
  await concurrentClient2.end();
}

run().catch(err => {
  console.error('Test matrix execution error:', err);
  process.exit(1);
});
