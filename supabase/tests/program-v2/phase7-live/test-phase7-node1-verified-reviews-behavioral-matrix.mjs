// supabase/tests/program-v2/phase7-live/test-phase7-node1-verified-reviews-behavioral-matrix.mjs
// Phase 7 Node 1 Live PostgreSQL Behavioral & Concurrency Acceptance Matrix
// Verified Reviews Foundation

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

async function setActorAuth(client, userId, role = 'authenticated') {
  await client.query(`SET ROLE ${role};`);
  if (userId) {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [userId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, false);`, [JSON.stringify({ sub: userId, role })]);
  } else {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    await client.query(`SELECT set_config('request.jwt.claims', '', false);`);
  }
}

async function run() {
  console.log('===============================================================');
  console.log('STARTING PHASE 7 NODE 1 LIVE POSTGRESQL VERIFIED REVIEWS BEHAVIORAL MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\n');

  // Privileged admin client: postgres role for fixtures & direct internal state assertions
  const adminClient = new Client({ connectionString: DB_URL });
  // Actor client: authenticated user operations
  const actorClient = new Client({ connectionString: DB_URL });
  // Anon client: unauthenticated visitor operations
  const anonClient = new Client({ connectionString: DB_URL });
  // Dedicated concurrency actor clients
  const concurrentClient1 = new Client({ connectionString: DB_URL });
  const concurrentClient2 = new Client({ connectionString: DB_URL });

  await adminClient.connect();
  await actorClient.connect();
  await anonClient.connect();
  await concurrentClient1.connect();
  await concurrentClient2.connect();

  try {
    // Deterministic test fixtures UUIDs
    const tenantA = '11111111-aaaa-4111-8111-111111111111';
    const tenantB = '22222222-bbbb-4222-8222-222222222222';
    const branchA1 = '11111111-bbbb-4111-8111-111111111111';
    const branchA2 = '11111111-cccc-4111-8111-111111111111';
    const branchB1 = '22222222-bbbb-4222-8222-222222222222';

    // Users (auth.users + public.users_profile)
    const userOwnerA = 'aaaa0000-0000-4000-a000-000000000001';
    const userStaffA = 'aaaa1111-0000-4000-a000-000000000002';
    const userStaffB = 'bbbb2222-0000-4000-b000-000000000002';
    const userCustomerA = 'cccc3333-0000-4000-c000-000000000003';
    const userCustomerA2 = 'eeee5555-0000-4000-e000-000000000003';
    const userCustomerB = 'dddd4444-0000-4000-d000-000000000003';

    // Staff entities
    const staffEntityA = '11111111-2222-3333-4444-111111111111';
    const staffEntityB = '22222222-2222-3333-4444-222222222222';

    // Customers
    const customerA1 = '55555555-1111-2222-3333-555555555555';
    const customerA2 = '66666666-1111-2222-3333-666666666666';
    const customerB1 = '77777777-1111-2222-3333-777777777777';

    // Services
    const serviceA = '3a3a3a3a-1111-2222-3333-333333333333';
    const serviceB = '3b3b3b3b-1111-2222-3333-333333333333';

    // Appointments
    const appointmentCompletedA1 = '4a4a4a4a-1111-2222-3333-444444444444';
    const appointmentCompletedA2 = '4b4b4b4b-1111-2222-3333-444444444444';
    const appointmentConfirmedA1 = '4c4c4c4c-1111-2222-3333-444444444444';
    const appointmentCompletedB1 = '4d4d4d4d-1111-2222-3333-444444444444';
    const appointmentEdge = '6b6b6b6b-1111-2222-3333-666666666666';
    const appointmentConcurrencySame = '5a5a5a5a-1111-2222-3333-555555555555';
    const appointmentConcurrencyDiff = '5b5b5b5b-1111-2222-3333-555555555555';

    // Pagination appointments
    const appointmentPageA3 = '4e4e4e4e-1111-2222-3333-444444444444';
    const appointmentPageA4 = '4f4f4f4f-1111-2222-3333-444444444444';

    // R4 Idempotency across different appointments fixtures
    const appointmentDiffAppSeq1 = '7a7a7a7a-1111-2222-3333-777777777771';
    const appointmentDiffAppSeq2 = '7a7a7a7a-1111-2222-3333-777777777772';
    const appointmentDiffAppConc1 = '7b7b7b7b-1111-2222-3333-777777777771';
    const appointmentDiffAppConc2 = '7b7b7b7b-1111-2222-3333-777777777772';

    // -------------------------------------------------------------------------
    // SETUP: Seed deterministic fixtures via adminClient (postgres superuser)
    // -------------------------------------------------------------------------
    console.log('--- SETUP: Deterministic Fixtures via adminClient ---');

    await adminClient.query(`
      INSERT INTO public.tenants (id, slug, name, status, public_site_status, onboarding_status)
      VALUES 
        ('${tenantA}', 'tenant-a', 'Tenant A', 'active', 'published', 'completed'),
        ('${tenantB}', 'tenant-b', 'Tenant B', 'active', 'published', 'completed')
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug, name = EXCLUDED.name, status = EXCLUDED.status,
        public_site_status = EXCLUDED.public_site_status, onboarding_status = EXCLUDED.onboarding_status;
    `);

    await adminClient.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary)
      VALUES 
        ('${branchA1}', '${tenantA}', 'Branch A1', 'branch-a1', true, true),
        ('${branchA2}', '${tenantA}', 'Branch A2', 'branch-a2', true, false),
        ('${branchB1}', '${tenantB}', 'Branch B1', 'branch-b1', true, true)
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `);

    // Seed auth.users first
    await adminClient.query(`
      INSERT INTO auth.users (id, email, role)
      VALUES
        ('${userOwnerA}', 'ownerA@test.invalid', 'authenticated'),
        ('${userStaffA}', 'staffA@test.invalid', 'authenticated'),
        ('${userStaffB}', 'staffB@test.invalid', 'authenticated'),
        ('${userCustomerA}', 'custA1@test.invalid', 'authenticated'),
        ('${userCustomerA2}', 'custA2@test.invalid', 'authenticated'),
        ('${userCustomerB}', 'custB1@test.invalid', 'authenticated')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed users_profile next (Owner has NO staff row to test owner authority)
    await adminClient.query(`
      INSERT INTO public.users_profile (id, tenant_id, name, role, active)
      VALUES
        ('${userOwnerA}', '${tenantA}', 'Owner A', 'tenant_owner', true),
        ('${userStaffA}', '${tenantA}', 'Staff A User', 'staff', true),
        ('${userStaffB}', '${tenantB}', 'Staff B User', 'staff', true),
        ('${userCustomerA}', '${tenantA}', 'Cust A1 User', 'customer', true),
        ('${userCustomerA2}', '${tenantA}', 'Cust A2 User', 'customer', true),
        ('${userCustomerB}', '${tenantB}', 'Cust B1 User', 'customer', true)
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        role = EXCLUDED.role,
        active = EXCLUDED.active;
    `);

    // Seed staff records
    await adminClient.query(`
      INSERT INTO public.staff (id, tenant_id, user_profile_id, name, title, active)
      VALUES 
        ('${staffEntityA}', '${tenantA}', '${userStaffA}', 'Staff A', 'Specialist', true),
        ('${staffEntityB}', '${tenantB}', '${userStaffB}', 'Staff B', 'Specialist', true)
      ON CONFLICT (id) DO UPDATE SET active = true;
    `);

    // Seed customers
    await adminClient.query(`
      INSERT INTO public.customers (id, tenant_id, user_profile_id, name, email, phone)
      VALUES 
        ('${customerA1}', '${tenantA}', '${userCustomerA}', 'Customer A1', 'custA1@test.invalid', '+905001112233'),
        ('${customerA2}', '${tenantA}', '${userCustomerA2}', 'Customer A2', 'custA2@test.invalid', '+905001112244'),
        ('${customerB1}', '${tenantB}', '${userCustomerB}', 'Customer B1', 'custB1@test.invalid', '+905002223344')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    // Seed services
    await adminClient.query(`
      INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
      VALUES
        ('${serviceA}', '${tenantA}', 'Service A', 'Hizmet A', 30, 10000, true),
        ('${serviceB}', '${tenantB}', 'Service B', 'Hizmet B', 45, 15000, true)
      ON CONFLICT (id) DO UPDATE SET active = true;
    `);

    // Seed appointments
    await adminClient.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES 
        ('${appointmentCompletedA1}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 7, '10:00', 30, 'completed'),
        ('${appointmentCompletedA2}', '${tenantA}', '${branchA1}', '${customerA2}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 5, '14:00', 30, 'completed'),
        ('${appointmentConfirmedA1}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE + 7, '10:00', 30, 'confirmed'),
        ('${appointmentCompletedB1}', '${tenantB}', '${branchB1}', '${customerB1}', '${serviceB}', '${staffEntityB}', CURRENT_DATE - 3, '11:00', 45, 'completed'),
        ('${appointmentEdge}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 2, '15:00', 30, 'completed'),
        ('${appointmentConcurrencySame}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 1, '10:00', 30, 'completed'),
        ('${appointmentConcurrencyDiff}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 1, '11:00', 30, 'completed'),
        ('${appointmentPageA3}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 4, '12:00', 30, 'completed'),
        ('${appointmentPageA4}', '${tenantA}', '${branchA1}', '${customerA2}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 3, '13:00', 30, 'completed'),
        ('${appointmentDiffAppSeq1}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 2, '09:00', 30, 'completed'),
        ('${appointmentDiffAppSeq2}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 2, '09:30', 30, 'completed'),
        ('${appointmentDiffAppConc1}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 1, '14:00', 30, 'completed'),
        ('${appointmentDiffAppConc2}', '${tenantA}', '${branchA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', CURRENT_DATE - 1, '14:30', 30, 'completed')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
    `);

    // Initialize anon client
    await setActorAuth(anonClient, null, 'anon');

    console.log('Setup completed successfully.\n');

    // -------------------------------------------------------------------------
    // 1. CREATE VERIFIED REVIEW - ELIGIBILITY & IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('--- 1. CREATE VERIFIED REVIEW: ELIGIBILITY & IDEMPOTENCY ---');
    await setActorAuth(actorClient, userCustomerA);

    let r1 = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 5,
        p_title := 'Excellent service',
        p_content := 'Very professional.',
        p_idempotency_key := 'review-test-key-1'
      ) AS res;
    `);
    let res1 = r1.rows[0].res;
    assert(res1.success === true, 'P7.1.1: Create review for completed appointment succeeds');
    assert(res1.reason_code === 'ok', 'P7.1.2: Returns ok reason code');
    assert(res1.idempotent_replay === false, 'P7.1.3: First submission is not replay');
    const reviewId1 = res1.review_id;

    // Verify internal state using adminClient
    let checkR1 = await adminClient.query(`SELECT is_published, title, content, idempotency_key FROM public.reviews WHERE id = '${reviewId1}';`);
    assert(checkR1.rows[0].is_published === false, 'P7.1.4: Review is unpublished initially');
    assert(checkR1.rows[0].title === 'Excellent service', 'P7.1.5: Title stored properly');

    // Same appointment + same idempotency key -> idempotent_replay = true
    let r1Replay = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 5,
        p_title := 'Excellent service',
        p_content := 'Very professional.',
        p_idempotency_key := 'review-test-key-1'
      ) AS res;
    `);
    let res1Replay = r1Replay.rows[0].res;
    assert(res1Replay.success === true, 'P7.1.6: Exact same-key replay succeeds');
    assert(res1Replay.idempotent_replay === true, 'P7.1.7: Replay returns idempotent_replay = true');
    assert(res1Replay.review_id === reviewId1, 'P7.1.8: Replay returns original review_id');

    // Same idempotency key with modified rating -> IDEMPOTENCY_CONFLICT
    let conflictRatingCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA1}',
          p_rating := 4,
          p_title := 'Excellent service',
          p_content := 'Very professional.',
          p_idempotency_key := 'review-test-key-1'
        );
      `);
    } catch (err) {
      conflictRatingCaught = err.message.includes('IDEMPOTENCY_CONFLICT');
    }
    assert(conflictRatingCaught, 'P7.1.9: Same key with changed rating raises IDEMPOTENCY_CONFLICT');

    // Same idempotency key with modified title -> IDEMPOTENCY_CONFLICT
    let conflictTitleCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA1}',
          p_rating := 5,
          p_title := 'Changed title',
          p_content := 'Very professional.',
          p_idempotency_key := 'review-test-key-1'
        );
      `);
    } catch (err) {
      conflictTitleCaught = err.message.includes('IDEMPOTENCY_CONFLICT');
    }
    assert(conflictTitleCaught, 'P7.1.10: Same key with changed title raises IDEMPOTENCY_CONFLICT');

    // Same idempotency key with modified content -> IDEMPOTENCY_CONFLICT
    let conflictContentCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA1}',
          p_rating := 5,
          p_title := 'Excellent service',
          p_content := 'Changed content text',
          p_idempotency_key := 'review-test-key-1'
        );
      `);
    } catch (err) {
      conflictContentCaught = err.message.includes('IDEMPOTENCY_CONFLICT');
    }
    assert(conflictContentCaught, 'P7.1.11: Same key with changed content raises IDEMPOTENCY_CONFLICT');

    // Same appointment + different idempotency key -> duplicate_review
    let r1Dup = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 4,
        p_title := 'Trying second review',
        p_content := 'Should be duplicate',
        p_idempotency_key := 'review-test-key-1-diff'
      ) AS res;
    `);
    let res1Dup = r1Dup.rows[0].res;
    assert(res1Dup.success === false, 'P7.1.12: Different key for same appointment fails');
    assert(res1Dup.reason_code === 'duplicate_review', 'P7.1.13: Duplicate returns duplicate_review reason code');

    // -------------------------------------------------------------------------
    // 2. CREATE VERIFIED REVIEW - BOUNDED INPUTS & EXPECTED ERROR GATES
    // -------------------------------------------------------------------------
    console.log('\n--- 2. CREATE VERIFIED REVIEW: BOUNDED INPUTS & EXPECTED ERRORS ---');

    // Uncompleted appointment
    let r2NonCompleted = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentConfirmedA1}',
        p_rating := 5,
        p_title := 'Too early',
        p_content := 'Appointment not completed',
        p_idempotency_key := 'review-test-confirmed'
      ) AS res;
    `);
    let res2NonCompleted = r2NonCompleted.rows[0].res;
    assert(res2NonCompleted.success === false, 'P7.2.1: Non-completed appointment rejected');
    assert(res2NonCompleted.reason_code === 'appointment_not_completed', 'P7.2.2: Returns appointment_not_completed');

    // Other customer's appointment
    await setActorAuth(actorClient, userCustomerA2);
    let customerMismatchCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA1}',
          p_rating := 4,
          p_title := 'Not mine',
          p_content := 'Should fail',
          p_idempotency_key := 'review-test-other-cust'
        );
      `);
    } catch (err) {
      customerMismatchCaught = err.message.includes('FORBIDDEN');
    }
    assert(customerMismatchCaught, 'P7.2.3: Cross-customer review raises FORBIDDEN exception');

    // Cross-tenant review
    await setActorAuth(actorClient, userCustomerB);
    let crossTenantReviewCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA1}',
          p_rating := 5,
          p_title := 'Cross tenant attempt',
          p_content := 'Should fail',
          p_idempotency_key := 'review-test-cross-tenant'
        );
      `);
    } catch (err) {
      crossTenantReviewCaught = err.message.includes('FORBIDDEN') || err.message.includes('CROSS_TENANT_VIOLATION');
      crossTenantNegativeTestsExecuted++;
    }
    assert(crossTenantReviewCaught, 'P7.2.4: Cross-tenant review creation is denied');

    // Invalid rating (> 5)
    await setActorAuth(actorClient, userCustomerA);
    let invalidRatingCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := 6,
          p_title := 'Rating out of range',
          p_content := 'Rating 6 is invalid',
          p_idempotency_key := 'review-test-invalid-rating'
        );
      `);
    } catch (err) {
      invalidRatingCaught = err.message.includes('INVALID_ARGUMENT');
    }
    assert(invalidRatingCaught, 'P7.2.5: Rating > 5 raises INVALID_ARGUMENT');

    // R4 Defect A: p_rating := NULL must fail closed with INVALID_ARGUMENT (NOT INTERNAL_ERROR)
    let nullRatingCaught = false;
    let nullRatingNotInternal = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := NULL,
          p_title := 'Null rating test',
          p_content := 'Rating null should fail closed with INVALID_ARGUMENT',
          p_idempotency_key := 'review-test-null-rating'
        );
      `);
    } catch (err) {
      nullRatingCaught = err.message.includes('INVALID_ARGUMENT');
      nullRatingNotInternal = !err.message.includes('INTERNAL_ERROR');
    }
    assert(nullRatingCaught && nullRatingNotInternal, 'P7.2.5b: p_rating := NULL raises INVALID_ARGUMENT and NOT INTERNAL_ERROR');

    // Idempotency key blank / null / exceeds 200 chars
    let emptyKeyCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := 5,
          p_title := 'No key',
          p_content := 'Empty key',
          p_idempotency_key := '   '
        );
      `);
    } catch (err) {
      emptyKeyCaught = err.message.includes('idempotency_key is required');
    }
    assert(emptyKeyCaught, 'P7.2.6: Blank idempotency key raises INVALID_ARGUMENT');

    let longKeyCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := 5,
          p_title := 'Long key',
          p_content := 'Key > 200 chars',
          p_idempotency_key := '${'k'.repeat(201)}'
        );
      `);
    } catch (err) {
      longKeyCaught = err.message.includes('exceeds maximum length of 200 characters');
    }
    assert(longKeyCaught, 'P7.2.7: Idempotency key > 200 chars raises INVALID_ARGUMENT');

    // Title > 160 chars
    let longTitleCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := 5,
          p_title := '${'T'.repeat(161)}',
          p_content := 'Title too long',
          p_idempotency_key := 'review-test-long-title'
        );
      `);
    } catch (err) {
      longTitleCaught = err.message.includes('Title exceeds maximum length of 160 characters');
    }
    assert(longTitleCaught, 'P7.2.8: Title > 160 chars raises INVALID_ARGUMENT');

    // Content > 4000 chars
    let longContentCaught = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentCompletedA2}',
          p_rating := 5,
          p_title := 'Valid title',
          p_content := '${'C'.repeat(4001)}',
          p_idempotency_key := 'review-test-long-content'
        );
      `);
    } catch (err) {
      longContentCaught = err.message.includes('Content exceeds maximum length of 4000 characters');
    }
    assert(longContentCaught, 'P7.2.9: Content > 4000 chars raises INVALID_ARGUMENT');

    // Create additional valid reviews for pagination & moderation tests
    await setActorAuth(actorClient, userCustomerA2);
    let r3a = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA2}',
        p_rating := 4,
        p_title := 'Good visit',
        p_content := 'Staff was attentive.',
        p_idempotency_key := 'review-test-cust2-key'
      ) AS res;
    `);
    const reviewId2 = r3a.rows[0].res.review_id;
    assert(r3a.rows[0].res.success === true, 'P7.2.10: Customer A2 review created');

    await setActorAuth(actorClient, userCustomerB);
    let r3b = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedB1}',
        p_rating := 5,
        p_title := 'Tenant B Great',
        p_content := 'Outstanding care in Tenant B.',
        p_idempotency_key := 'review-test-tenant-b-key'
      ) AS res;
    `);
    const reviewId3 = r3b.rows[0].res.review_id;
    assert(r3b.rows[0].res.success === true, 'P7.2.11: Tenant B customer review created');

    // -------------------------------------------------------------------------
    // 3. CONCURRENCY: SAME-KEY & DIFFERENT-KEY
    // -------------------------------------------------------------------------
    console.log('\n--- 3. CONCURRENCY: SAME-KEY & DIFFERENT-KEY ---');

    await setActorAuth(concurrentClient1, userCustomerA);
    await setActorAuth(concurrentClient2, userCustomerA);

    // Concurrent same-key: exactly one creates the review, both succeed with identical review ID
    const pSameKey = Promise.all([
      concurrentClient1.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentConcurrencySame}',
          p_rating := 5,
          p_title := 'Concurrent same key',
          p_content := 'Same exact concurrent request',
          p_idempotency_key := 'concurrency-same-key-token'
        ) AS res;
      `),
      concurrentClient2.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentConcurrencySame}',
          p_rating := 5,
          p_title := 'Concurrent same key',
          p_content := 'Same exact concurrent request',
          p_idempotency_key := 'concurrency-same-key-token'
        ) AS res;
      `)
    ]);

    const [resSame1, resSame2] = await pSameKey;
    const sameOut1 = resSame1.rows[0].res;
    const sameOut2 = resSame2.rows[0].res;
    assert(sameOut1.success === true && sameOut2.success === true, 'P7.3.1: Concurrent same-key calls both return success');
    assert(sameOut1.review_id === sameOut2.review_id, 'P7.3.2: Concurrent same-key calls return identical review_id');
    const replayFlags = [sameOut1.idempotent_replay, sameOut2.idempotent_replay];
    assert(replayFlags.includes(false) && replayFlags.includes(true), 'P7.3.3: One creates and one replays');
    concurrencyTestsExecuted++;

    // Verify internal state: exactly 1 review exists for this appointment
    const countSame = await adminClient.query(`
      SELECT count(*) AS cnt FROM public.reviews WHERE appointment_id = '${appointmentConcurrencySame}';
    `);
    assert(parseInt(countSame.rows[0].cnt, 10) === 1, 'P7.3.4: Exactly 1 review inserted under concurrent same-key');

    // Concurrent different-key for one appointment: exactly one succeeds, one returns duplicate_review
    const pDiffKey = Promise.all([
      concurrentClient1.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentConcurrencyDiff}',
          p_rating := 5,
          p_title := 'Concurrent diff key 1',
          p_content := 'Test',
          p_idempotency_key := 'concurrency-diff-key-1'
        ) AS res;
      `),
      concurrentClient2.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentConcurrencyDiff}',
          p_rating := 4,
          p_title := 'Concurrent diff key 2',
          p_content := 'Test',
          p_idempotency_key := 'concurrency-diff-key-2'
        ) AS res;
      `)
    ]);

    const [resDiff1, resDiff2] = await pDiffKey;
    const diffOut1 = resDiff1.rows[0].res;
    const diffOut2 = resDiff2.rows[0].res;
    const diffSuccesses = [diffOut1.success, diffOut2.success].filter(Boolean).length;
    const diffDuplicates = [diffOut1.reason_code, diffOut2.reason_code].filter(rc => rc === 'duplicate_review').length;
    assert(diffSuccesses === 1, 'P7.3.5: Exactly one concurrent different-key call succeeds');
    assert(diffDuplicates === 1, 'P7.3.6: The other concurrent call returns duplicate_review');
    concurrencyTestsExecuted++;

    const countDiff = await adminClient.query(`
      SELECT count(*) AS cnt FROM public.reviews WHERE appointment_id = '${appointmentConcurrencyDiff}';
    `);
    assert(parseInt(countDiff.rows[0].cnt, 10) === 1, 'P7.3.7: Exactly 1 review inserted under concurrent different-key');

    // R4 Defect C & Semantics D: SAME TENANT + SAME IDEMPOTENCY KEY + DIFFERENT APPOINTMENT SEQUENTIAL
    // appointmentDiffAppSeq1 creates first successfully
    await setActorAuth(actorClient, userCustomerA);
    let seqApp1Res = await actorClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentDiffAppSeq1}',
        p_rating := 5,
        p_title := 'Seq diff app 1',
        p_content := 'First review with key',
        p_idempotency_key := 'same-key-diff-app-seq'
      ) AS res;
    `);
    assert(seqApp1Res.rows[0].res.success === true, 'P7.3.8: Sequential diff-app 1 succeeds');

    // appointmentDiffAppSeq2 with same idempotency key raises IDEMPOTENCY_CONFLICT
    let seqApp2Conflict = false;
    try {
      await actorClient.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentDiffAppSeq2}',
          p_rating := 5,
          p_title := 'Seq diff app 2',
          p_content := 'Different appointment same key',
          p_idempotency_key := 'same-key-diff-app-seq'
        );
      `);
    } catch (err) {
      seqApp2Conflict = err.message.includes('IDEMPOTENCY_CONFLICT');
    }
    assert(seqApp2Conflict, 'P7.3.9: Sequential same tenant same idempotency key different appointment raises IDEMPOTENCY_CONFLICT');

    // R4 Defect C & Semantics E: SAME TENANT + SAME IDEMPOTENCY KEY + DIFFERENT APPOINTMENT CONCURRENT
    // Both start from clean state against appointmentDiffAppConc1 and appointmentDiffAppConc2
    let pDiffAppConcurrent = Promise.allSettled([
      concurrentClient1.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentDiffAppConc1}',
          p_rating := 5,
          p_title := 'Concurrent diff app 1',
          p_content := 'Competing appointment 1',
          p_idempotency_key := 'same-key-diff-app-concurrent'
        ) AS res;
      `),
      concurrentClient2.query(`
        SELECT public.create_verified_review(
          p_appointment_id := '${appointmentDiffAppConc2}',
          p_rating := 5,
          p_title := 'Concurrent diff app 2',
          p_content := 'Competing appointment 2',
          p_idempotency_key := 'same-key-diff-app-concurrent'
        ) AS res;
      `)
    ]);

    const [concRes1, concRes2] = await pDiffAppConcurrent;
    const successes = [concRes1, concRes2].filter(r => r.status === 'fulfilled' && r.value.rows[0].res.success === true);
    const conflicts = [concRes1, concRes2].filter(r => r.status === 'rejected' && r.reason.message.includes('IDEMPOTENCY_CONFLICT'));
    const internalErrors = [concRes1, concRes2].filter(r => r.status === 'rejected' && r.reason.message.includes('INTERNAL_ERROR'));
    const uniqueErrors = [concRes1, concRes2].filter(r => r.status === 'rejected' && (r.reason.message.includes('unique constraint') || r.reason.message.includes('duplicate key value')));

    assert(successes.length === 1, 'P7.3.10: Exactly one concurrent diff-app call succeeds');
    assert(conflicts.length === 1, 'P7.3.11: Competing concurrent diff-app call raises IDEMPOTENCY_CONFLICT');
    assert(internalErrors.length === 0, 'P7.3.12: No INTERNAL_ERROR exposed during concurrent diff-app key conflict');
    assert(uniqueErrors.length === 0, 'P7.3.13: No database unique constraint error exposed during concurrent diff-app key conflict');
    concurrencyTestsExecuted++;

    // Exactly one physical review exists across the two target appointments
    const diffAppReviewCount = await adminClient.query(`
      SELECT count(*) AS cnt FROM public.reviews
      WHERE appointment_id IN ('${appointmentDiffAppConc1}', '${appointmentDiffAppConc2}');
    `);
    assert(parseInt(diffAppReviewCount.rows[0].cnt, 10) === 1, 'P7.3.14: Exactly one review exists across competing target appointments');

    // Exactly one idempotency row exists for that tenant/key
    const diffAppIdemCount = await adminClient.query(`
      SELECT count(*) AS cnt FROM public.review_idempotency_keys
      WHERE tenant_id = '${tenantA}' AND idempotency_key = 'same-key-diff-app-concurrent';
    `);
    assert(parseInt(diffAppIdemCount.rows[0].cnt, 10) === 1, 'P7.3.15: Exactly one idempotency row exists for concurrent key');

    // -------------------------------------------------------------------------
    // 4. MODERATION: STAFF & TENANT OWNER AUTHORITY (WITHOUT STAFF ROW)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. MODERATION: STAFF & TENANT OWNER AUTHORITY ---');

    // Staff A publishes review 1
    await setActorAuth(actorClient, userStaffA);
    let modPub = await actorClient.query(`
      SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'publish') AS res;
    `);
    assert(modPub.rows[0].res.success === true, 'P7.4.1: Staff can publish review in own tenant');

    // Double publish returns already_published
    let modDoublePub = await actorClient.query(`
      SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'publish') AS res;
    `);
    assert(modDoublePub.rows[0].res.success === false && modDoublePub.rows[0].res.reason_code === 'already_published', 'P7.4.2: Double publish rejected');

    // Tenant Owner (userOwnerA - has NO staff row) publishes review 2 and responds
    await setActorAuth(actorClient, userOwnerA);
    let ownerPub = await actorClient.query(`
      SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'publish') AS res;
    `);
    assert(ownerPub.rows[0].res.success === true, 'P7.4.3: Tenant owner without staff entity can moderate review');

    let ownerRespond = await actorClient.query(`
      SELECT public.moderate_review(
        p_review_id := '${reviewId2}',
        p_action := 'respond',
        p_response_text := 'Thank you from the Owner!'
      ) AS res;
    `);
    assert(ownerRespond.rows[0].res.success === true, 'P7.4.4: Tenant owner can submit moderation response');

    // Verify internal state using adminClient
    let checkOwnerMod = await adminClient.query(`
      SELECT response_text, responded_by, responded_by_user_id
      FROM public.reviews WHERE id = '${reviewId2}';
    `);
    assert(checkOwnerMod.rows[0].response_text === 'Thank you from the Owner!', 'P7.4.5: Response text recorded accurately');
    assert(checkOwnerMod.rows[0].responded_by === null, 'P7.4.6: responded_by staff FK is NULL for owner without staff row');
    assert(checkOwnerMod.rows[0].responded_by_user_id === userOwnerA, 'P7.4.7: responded_by_user_id stores owner users_profile UUID');

    // Empty moderation response is rejected
    let emptyRespCaught = false;
    try {
      await actorClient.query(`
        SELECT public.moderate_review(
          p_review_id := '${reviewId1}',
          p_action := 'respond',
          p_response_text := '   '
        );
      `);
    } catch (err) {
      emptyRespCaught = err.message.includes('Response text is required');
    }
    assert(emptyRespCaught, 'P7.4.8: Empty moderation response text raises INVALID_ARGUMENT');

    // Moderation response > 4000 characters rejected
    let longRespCaught = false;
    try {
      await actorClient.query(`
        SELECT public.moderate_review(
          p_review_id := '${reviewId1}',
          p_action := 'respond',
          p_response_text := '${'R'.repeat(4001)}'
        );
      `);
    } catch (err) {
      longRespCaught = err.message.includes('Response text exceeds maximum length of 4000 characters');
    }
    assert(longRespCaught, 'P7.4.9: Moderation response > 4000 chars raises INVALID_ARGUMENT');

    // Invalid action rejected
    let invalidActionCaught = false;
    try {
      await actorClient.query(`
        SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'delete_review');
      `);
    } catch (err) {
      invalidActionCaught = err.message.includes('INVALID_ARGUMENT');
    }
    assert(invalidActionCaught, 'P7.4.10: Invalid moderation action raises INVALID_ARGUMENT');

    // Cross-tenant moderation rejected
    await setActorAuth(actorClient, userStaffB);
    let crossTenantModCaught = false;
    try {
      await actorClient.query(`
        SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'publish');
      `);
    } catch (err) {
      crossTenantModCaught = err.message.includes('CROSS_TENANT_VIOLATION');
      crossTenantNegativeTestsExecuted++;
    }
    assert(crossTenantModCaught, 'P7.4.11: Cross-tenant moderation raises CROSS_TENANT_VIOLATION');

    // Also publish Tenant B review for isolation testing
    await actorClient.query(`
      SELECT public.moderate_review(p_review_id := '${reviewId3}', p_action := 'publish');
    `);

    // -------------------------------------------------------------------------
    // 5. PUBLIC & TENANT PAGINATION & AGGREGATE COUNTS
    // -------------------------------------------------------------------------
    console.log('\n--- 5. PAGINATION & GLOBAL AGGREGATES ---');

    // Seed 2 more published reviews in Tenant A for multi-page verification
    await adminClient.query(`
      INSERT INTO public.reviews (
        id, tenant_id, branch_id, appointment_id, customer_id, service_id, staff_id,
        rating, title, content, is_published, published_at, idempotency_key
      ) VALUES
        (gen_random_uuid(), '${tenantA}', '${branchA1}', '${appointmentPageA3}', '${customerA1}', '${serviceA}', '${staffEntityA}', 5, 'Page Review 3', 'Great 3', true, now(), 'page-review-3'),
        (gen_random_uuid(), '${tenantA}', '${branchA1}', '${appointmentPageA4}', '${customerA2}', '${serviceA}', '${staffEntityA}', 4, 'Page Review 4', 'Great 4', true, now(), 'page-review-4')
      ON CONFLICT DO NOTHING;
    `);

    // Now Tenant A has 4 published reviews (two rating 5, two rating 4)
    // Page 1: limit 2, offset 0
    let pubPage1 = await anonClient.query(`
      SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 2, p_offset := 0) AS res;
    `);
    let p1Data = pubPage1.rows[0].res;
    assert(p1Data.success === true, 'P7.5.1: Public read page 1 succeeds');
    assert(p1Data.reviews.length === 2, 'P7.5.2: Page 1 returns exactly 2 items');
    assert(p1Data.aggregate.total_count === 4, 'P7.5.3: Global aggregate total_count is 4 on page 1');
    assert(Number(p1Data.aggregate.average_rating) === 4.5, 'P7.5.4: Global aggregate average_rating is 4.5');

    // Page 2: limit 2, offset 2
    let pubPage2 = await anonClient.query(`
      SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 2, p_offset := 2) AS res;
    `);
    let p2Data = pubPage2.rows[0].res;
    assert(p2Data.success === true, 'P7.5.5: Public read page 2 succeeds');
    assert(p2Data.reviews.length === 2, 'P7.5.6: Page 2 returns exactly 2 items');
    assert(p2Data.aggregate.total_count === 4, 'P7.5.7: Global aggregate total_count remains 4 on page 2');

    // Ensure items between page 1 and page 2 are distinct (deterministic paging)
    const page1Ids = p1Data.reviews.map(r => r.id);
    const page2Ids = p2Data.reviews.map(r => r.id);
    const idOverlap = page1Ids.filter(id => page2Ids.includes(id));
    assert(idOverlap.length === 0, 'P7.5.8: Page 1 and Page 2 reviews are completely disjoint');

    // Bounds validation on get_public_reviews
    let pubLimitInvalid = false;
    try {
      await anonClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 101);`);
    } catch (err) {
      pubLimitInvalid = err.message.includes('p_limit must be between 1 and 100');
    }
    assert(pubLimitInvalid, 'P7.5.9: p_limit > 100 raises INVALID_ARGUMENT');

    let pubOffsetInvalid = false;
    try {
      await anonClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_offset := -1);`);
    } catch (err) {
      pubOffsetInvalid = err.message.includes('p_offset must be greater than or equal to 0');
    }
    assert(pubOffsetInvalid, 'P7.5.10: p_offset < 0 raises INVALID_ARGUMENT');

    let pubRatingInvalid = false;
    try {
      await anonClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_min_rating := 6);`);
    } catch (err) {
      pubRatingInvalid = err.message.includes('p_min_rating must be between 1 and 5');
    }
    assert(pubRatingInvalid, 'P7.5.11: p_min_rating > 5 raises INVALID_ARGUMENT');

    // R4 Defect B: get_public_reviews explicit NULL limit and NULL offset guards
    let pubNullLimitInvalid = false;
    try {
      await anonClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := NULL);`);
    } catch (err) {
      pubNullLimitInvalid = err.message.includes('p_limit must be between 1 and 100');
    }
    assert(pubNullLimitInvalid, 'P7.5.11b: get_public_reviews p_limit := NULL raises INVALID_ARGUMENT');

    let pubNullOffsetInvalid = false;
    try {
      await anonClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_offset := NULL);`);
    } catch (err) {
      pubNullOffsetInvalid = err.message.includes('p_offset must be greater than or equal to 0');
    }
    assert(pubNullOffsetInvalid, 'P7.5.11c: get_public_reviews p_offset := NULL raises INVALID_ARGUMENT');

    // Tenant Reviews read pagination
    await setActorAuth(actorClient, userStaffA);
    let tenPage = await actorClient.query(`
      SELECT public.get_tenant_reviews(p_limit := 2, p_offset := 0) AS res;
    `);
    let tenData = tenPage.rows[0].res;
    assert(tenData.success === true, 'P7.5.12: get_tenant_reviews succeeds');
    assert(tenData.reviews.length === 2, 'P7.5.13: Tenant reviews respects limit');
    assert(tenData.aggregate.total_count >= 4, 'P7.5.14: Tenant aggregate total_count spans complete filtered set');

    // R4 Defect B: get_tenant_reviews explicit NULL limit and NULL offset guards
    let tenNullLimitInvalid = false;
    try {
      await actorClient.query(`SELECT public.get_tenant_reviews(p_limit := NULL);`);
    } catch (err) {
      tenNullLimitInvalid = err.message.includes('p_limit must be between 1 and 100');
    }
    assert(tenNullLimitInvalid, 'P7.5.15: get_tenant_reviews p_limit := NULL raises INVALID_ARGUMENT');

    let tenNullOffsetInvalid = false;
    try {
      await actorClient.query(`SELECT public.get_tenant_reviews(p_offset := NULL);`);
    } catch (err) {
      tenNullOffsetInvalid = err.message.includes('p_offset must be greater than or equal to 0');
    }
    assert(tenNullOffsetInvalid, 'P7.5.16: get_tenant_reviews p_offset := NULL raises INVALID_ARGUMENT');

    // -------------------------------------------------------------------------
    // 6. RLS & PERMISSION TRUST BOUNDARIES
    // -------------------------------------------------------------------------
    console.log('\n--- 6. TRUST BOUNDARIES & RLS RESTRICTIONS ---');

    // Direct table DML is completely denied for authenticated actors
    await setActorAuth(actorClient, userCustomerA);

    let directInsertDenied = false;
    try {
      await actorClient.query(`
        INSERT INTO public.reviews (tenant_id, branch_id, appointment_id, customer_id, service_id, staff_id, rating, idempotency_key)
        VALUES ('${tenantA}', '${branchA1}', '${appointmentCompletedA1}', '${customerA1}', '${serviceA}', '${staffEntityA}', 5, 'direct-tamper');
      `);
    } catch (err) {
      directInsertDenied = err.message.includes('permission denied');
    }
    assert(directInsertDenied, 'P7.6.1: Direct INSERT on reviews denied to authenticated');

    let directUpdateDenied = false;
    try {
      await actorClient.query(`UPDATE public.reviews SET rating = 1 WHERE id = '${reviewId1}';`);
    } catch (err) {
      directUpdateDenied = err.message.includes('permission denied');
    }
    assert(directUpdateDenied, 'P7.6.2: Direct UPDATE on reviews denied to authenticated');

    let directDeleteDenied = false;
    try {
      await actorClient.query(`DELETE FROM public.reviews WHERE id = '${reviewId1}';`);
    } catch (err) {
      directDeleteDenied = err.message.includes('permission denied');
    }
    assert(directDeleteDenied, 'P7.6.3: Direct DELETE on reviews denied to authenticated');

    // Direct table SELECT denied for authenticated on reviews table directly
    let authDirectSelectDenied = false;
    try {
      await actorClient.query(`SELECT * FROM public.reviews;`);
    } catch (err) {
      authDirectSelectDenied = err.message.includes('permission denied');
    }
    assert(authDirectSelectDenied, 'P7.6.4: Direct SELECT on reviews denied to authenticated (must use RPC)');

    // Direct table SELECT denied for anon on reviews table directly
    let anonDirectSelectDenied = false;
    try {
      await anonClient.query(`SELECT * FROM public.reviews;`);
    } catch (err) {
      anonDirectSelectDenied = err.message.includes('permission denied');
    }
    assert(anonDirectSelectDenied, 'P7.6.5: Direct SELECT on reviews denied to anon (must use RPC)');

    // Anon tenant-read denial
    let anonTenantReadDenied = false;
    try {
      await anonClient.query(`SELECT public.get_tenant_reviews();`);
    } catch (err) {
      anonTenantReadDenied = err.message.includes('permission denied') || err.message.includes('UNAUTHENTICATED');
    }
    assert(anonTenantReadDenied, 'P7.6.5: Anon cannot invoke get_tenant_reviews');

    // Customer tenant-read denial
    let customerTenantReadDenied = false;
    try {
      await actorClient.query(`SELECT public.get_tenant_reviews();`);
    } catch (err) {
      customerTenantReadDenied = err.message.includes('FORBIDDEN');
    }
    assert(customerTenantReadDenied, 'P7.6.6: Customer role cannot invoke get_tenant_reviews');

    // -------------------------------------------------------------------------
    // 7. AUDIT LOG VERIFICATION (CANONICAL COLUMNS)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. AUDIT TRAIL VERIFICATION ---');

    const auditCheck = await adminClient.query(`
      SELECT tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload
      FROM public.audit_events
      WHERE resource_type = 'reviews'
      ORDER BY created_at DESC
      LIMIT 20;
    `);

    assert(auditCheck.rows.length >= 2, 'P7.7.1: Audit events recorded for review operations');
    const actions = auditCheck.rows.map(r => r.action);
    assert(actions.includes('review_created'), 'P7.7.2: review_created audit event exists');
    assert(actions.includes('review_moderated'), 'P7.7.3: review_moderated audit event exists');

    console.log('\n===============================================================');
    console.log(`LIVE POSTGRESQL VERIFIED REVIEWS BEHAVIORAL MATRIX: ${testsPassed}/${testsExecuted} TESTS PASSED | ${testsFailed} FAILURES`);
    console.log(`CONCURRENCY TESTS: ${concurrencyTestsExecuted}`);
    console.log(`CROSS-TENANT NEGATIVE TESTS: ${crossTenantNegativeTestsExecuted}`);
    console.log('===============================================================\n');

    console.log('LIVE_BEHAVIORAL_TESTS_EXECUTED=' + testsExecuted);
    console.log('LIVE_BEHAVIORAL_TESTS_PASSED=' + testsPassed);
    console.log('LIVE_BEHAVIORAL_TESTS_FAILED=' + testsFailed);
    console.log('CONCURRENCY_TESTS_EXECUTED=' + concurrencyTestsExecuted);
    console.log('CROSS_TENANT_NEGATIVE_TESTS_EXECUTED=' + crossTenantNegativeTestsExecuted);

  } finally {
    await adminClient.end();
    await actorClient.end();
    await anonClient.end();
    await concurrentClient1.end();
    await concurrentClient2.end();
  }
}

run().catch((err) => {
  console.error('Verified Reviews behavioral test execution failed:', err);
  process.exit(1);
});
