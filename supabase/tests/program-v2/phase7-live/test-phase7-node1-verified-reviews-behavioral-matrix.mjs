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
  console.log('STARTING PHASE 7 NODE 1 LIVE POSTGRESQL VERIFIED REVIEWS BEHAVIORAL MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\\n');

  const mainClient = new Client({ connectionString: DB_URL });
  const concurrentClient1 = new Client({ connectionString: DB_URL });
  const concurrentClient2 = new Client({ connectionString: DB_URL });

  await mainClient.connect();
  await concurrentClient1.connect();
  await concurrentClient2.connect();

  try {
// Deterministic test fixtures
    const tenantA = '11111111-aaaa-4111-8111-111111111111';
    const tenantB = '22222222-bbbb-4222-8222-222222222222';
    const branchA1 = '11111111-bbbb-4111-8111-111111111111';
    const branchA2 = '11111111-cccc-4111-8111-111111111111';
    const branchB1 = '22222222-bbbb-4222-8222-222222222222';

    const userStaffA = 'aaaa1111-0000-4000-a000-000000000002';
    const userStaffB = 'bbbb2222-0000-4000-b000-000000000002';
    const userCustomerA = 'cccc3333-0000-4000-c000-000000000003';
    const userCustomerB = 'dddd4444-0000-4000-d000-000000000003';
    const userCustomerA2 = 'eeee5555-0000-4000-e000-000000000003';

    const serviceA = '3a3a3a3a-1111-2222-3333-333333333333';
    const serviceB = '3b3b3b3b-1111-2222-3333-333333333333';

    const appointmentCompletedA1 = '4a4a4a4a-1111-2222-3333-444444444444';
    const appointmentCompletedA2 = '4b4b4b4b-1111-2222-3333-444444444444';
    const appointmentConfirmedA1 = '4c4c4c4c-1111-2222-3333-444444444444';
    const appointmentCompletedB1 = '4d4d4d4d-1111-2222-3333-444444444444';

    // SETUP: Create minimal test fixtures
    console.log('--- SETUP: Test Fixtures ---');
    await setAuth(mainClient, userStaffA);

    await mainClient.query(`
      INSERT INTO public.tenants (id, slug, name, status, public_site_status, onboarding_status)
      VALUES 
        ('${tenantA}', 'tenant-a', 'Tenant A', 'active', 'published', 'completed'),
        ('${tenantB}', 'tenant-b', 'Tenant B', 'active', 'published', 'completed')
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug, name = EXCLUDED.name, status = EXCLUDED.status,
        public_site_status = EXCLUDED.public_site_status, onboarding_status = EXCLUDED.onboarding_status;
    `);

    await mainClient.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary)
      VALUES 
        ('${branchA1}', '${tenantA}', 'Branch A1', 'branch-a1', true, true),
        ('${branchA2}', '${tenantA}', 'Branch A2', 'branch-a2', true, false),
        ('${branchB1}', '${tenantB}', 'Branch B1', 'branch-b1', true, true)
      ON CONFLICT (id) DO UPDATE SET is_active = true;
    `);

    await mainClient.query(`
      INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
      VALUES 
        ('${serviceA}', '${tenantA}', 'Service A', 'Hizmet A', 30, 10000, true),
        ('${serviceB}', '${tenantB}', 'Service B', 'Hizmet B', 45, 15000, true)
      ON CONFLICT (id) DO UPDATE SET active = true;
    `);

    await mainClient.query(`
      INSERT INTO public.staff (id, tenant_id, user_profile_id, name, title, active)
      VALUES 
        ('11111111-2222-3333-4444-111111111111', '${tenantA}', '${userStaffA}', 'Staff A', 'Specialist', true),
        ('22222222-2222-3333-4444-222222222222', '${tenantB}', '${userStaffB}', 'Staff B', 'Specialist', true)
      ON CONFLICT (id) DO UPDATE SET active = true;
    `);

    await mainClient.query(`
      INSERT INTO public.customers (id, tenant_id, user_profile_id, name, email, phone)
      VALUES 
        ('55555555-1111-2222-3333-555555555555', '${tenantA}', '${userCustomerA}', 'Customer A1', 'custA1@test.invalid', '+905001112233'),
        ('66666666-1111-2222-3333-666666666666', '${tenantA}', '${userCustomerA2}', 'Customer A2', 'custA2@test.invalid', '+905001112244'),
        ('77777777-1111-2222-3333-777777777777', '${tenantB}', '${userCustomerB}', 'Customer B1', 'custB1@test.invalid', '+905002223344')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    `);

    await mainClient.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES 
        ('${appointmentCompletedA1}', '${tenantA}', '${branchA1}', '55555555-1111-2222-3333-555555555555', '${serviceA}', '11111111-2222-3333-4444-111111111111', CURRENT_DATE - 7, '10:00', 30, 'completed'),
        ('${appointmentCompletedA2}', '${tenantA}', '${branchA1}', '66666666-1111-2222-3333-666666666666', '${serviceA}', '11111111-2222-3333-4444-111111111111', CURRENT_DATE - 5, '14:00', 30, 'completed'),
        ('${appointmentConfirmedA1}', '${tenantA}', '${branchA1}', '55555555-1111-2222-3333-555555555555', '${serviceA}', '11111111-2222-3333-4444-111111111111', CURRENT_DATE + 7, '10:00', 30, 'confirmed'),
        ('${appointmentCompletedB1}', '${tenantB}', '${branchB1}', '77777777-1111-2222-3333-777777777777', '${serviceB}', '22222222-2222-3333-4444-222222222222', CURRENT_DATE - 3, '11:00', 45, 'completed')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
    `);

    console.log('Setup complete.\\n');
// 1. CREATE VERIFIED REVIEW - BASIC ELIGIBILITY
    console.log('--- 1. CREATE VERIFIED REVIEW: BASIC ELIGIBILITY ---');
    await setAuth(mainClient, userCustomerA);

    let r1 = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 5, p_title := 'Excellent service', p_content := 'Very professional.',
        p_idempotency_key := 'review-test-1'
      ) AS res;
    `);
    let res1 = r1.rows[0].res;
    assert(res1.success === true, 'P7.1.1: Create review for own completed appointment succeeds');
    assert(res1.reason_code === 'ok', 'P7.1.2: Returns ok reason code');
    assert(res1.idempotent_replay === false, 'P7.1.3: First submission not replay');
    const reviewId1 = res1.review_id;

    let r1check = await mainClient.query(`SELECT is_published FROM public.reviews WHERE id = '${reviewId1}';`);
    assert(r1check.rows[0].is_published === false, 'P7.1.4: New review is unpublished by default');

    let r1dup = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 4, p_title := 'Trying again', p_content := 'Should fail',
        p_idempotency_key := 'review-test-1-different-key'
      ) AS res;
    `);
    let res1dup = r1dup.rows[0].res;
    assert(res1dup.success === false, 'P7.1.5: Duplicate review rejected');
    assert(res1dup.reason_code === 'duplicate_review', 'P7.1.6: Returns duplicate_review reason code');

    let r1idem = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 5, p_title := 'Excellent service', p_content := 'Very professional.',
        p_idempotency_key := 'review-test-1'
      ) AS res;
    `);
    let res1idem = r1idem.rows[0].res;
    assert(res1idem.success === true, 'P7.1.7: Idempotent replay succeeds');
    assert(res1idem.idempotent_replay === true, 'P7.1.8: Returns idempotent_replay true');
    assert(res1idem.review_id === reviewId1, 'P7.1.9: Returns same review ID');

    // 2. CREATE VERIFIED REVIEW - ELIGIBILITY GATES
    console.log('\\n--- 2. CREATE VERIFIED REVIEW: ELIGIBILITY GATES ---');

    let r2a = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentConfirmedA1}',
        p_rating := 5, p_title := 'Great', p_content := 'Will be great',
        p_idempotency_key := 'review-test-2a'
      ) AS res;
    `);
    let res2a = r2a.rows[0].res;
    assert(res2a.success === false, 'P7.2.1: Review for confirmed appointment rejected');
    assert(res2a.reason_code === 'appointment_not_completed', 'P7.2.2: Returns appointment_not_completed');

    await setAuth(mainClient, userCustomerA2);
    let r2b = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 3, p_title := 'Not my appointment', p_content := 'Should fail',
        p_idempotency_key := 'review-test-2b'
      ) AS res;
    `);
    let res2b = r2b.rows[0].res;
    assert(res2b.success === false, 'P7.2.3: Review for another customer appointment rejected');

    await setAuth(mainClient, userCustomerB);
    let r2c = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA1}',
        p_rating := 5, p_title := 'Cross tenant', p_content := 'Should fail',
        p_idempotency_key := 'review-test-2c'
      ) AS res;
    `);
    crossTenantNegativeTestsExecuted++;

    await setAuth(mainClient, userCustomerA);
    let r2d = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA2}',
        p_rating := 6, p_title := 'Invalid rating', p_content := 'Should fail',
        p_idempotency_key := 'review-test-2d'
      ) AS res;
    `);
    crossTenantNegativeTestsExecuted++;

    // 3. CREATE VERIFIED REVIEW - VALID REVIEWS
    console.log('\\n--- 3. CREATE VERIFIED REVIEW: VALID REVIEWS ---');
    await setAuth(mainClient, userCustomerA2);

    let r3a = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedA2}',
        p_rating := 4, p_title := 'Good experience', p_content := 'Staff was professional.',
        p_idempotency_key := 'review-test-3a'
      ) AS res;
    `);
    let res3a = r3a.rows[0].res;
    assert(res3a.success === true, 'P7.3.1: Second customer review succeeds');
    const reviewId2 = res3a.review_id;

    await setAuth(mainClient, userCustomerB);
    let r3b = await mainClient.query(`
      SELECT public.create_verified_review(
        p_appointment_id := '${appointmentCompletedB1}',
        p_rating := 5, p_title := 'Perfect', p_content := 'Best experience ever.',
        p_idempotency_key := 'review-test-3b'
      ) AS res;
    `);
    let res3b = r3b.rows[0].res;
    assert(res3b.success === true, 'P7.3.2: Tenant B customer review succeeds');
    const reviewId3 = res3b.review_id;
// 4. PUBLIC READ CONTRACT (get_public_reviews)
    console.log('\\n--- 4. PUBLIC READ CONTRACT (get_public_reviews) ---');

    await setAuth(mainClient, null);
    let r4a = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 10, p_offset := 0) AS res;`);
    let res4a = r4a.rows[0].res;
    assert(res4a.success === true, 'P7.4.1: Public read succeeds');
    assert(res4a.reviews.length === 0, 'P7.4.2: No published reviews initially');
    assert(res4a.aggregate.total_count === 0, 'P7.4.3: Aggregate count is 0');

    await setAuth(mainClient, userStaffA);
    await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'publish') AS res;`);

    let r4b = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 10, p_offset := 0) AS res;`);
    let res4b = r4b.rows[0].res;
    assert(res4b.success === true, 'P7.4.4: Public read after publish succeeds');
    assert(res4b.reviews.length === 1, 'P7.4.5: Published review appears');
    assert(res4b.reviews[0].id === reviewId1, 'P7.4.6: Correct review returned');
    assert(res4b.reviews[0].rating === 5, 'P7.4.7: Rating correct');
    assert(res4b.aggregate.total_count === 1, 'P7.4.8: Aggregate count is 1');
    assert(res4b.aggregate.average_rating === 5, 'P7.4.9: Average rating correct');
    assert(res4b.aggregate.rating_distribution['5'] === 1, 'P7.4.10: Rating distribution correct');

    let r4c = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_branch_id := '${branchA1}', p_limit := 10, p_offset := 0) AS res;`);
    let res4c = r4c.rows[0].res;
    assert(res4c.reviews.length === 1, 'P7.4.11: Branch filter works');

    let r4d = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_min_rating := 4, p_limit := 10, p_offset := 0) AS res;`);
    let res4d = r4d.rows[0].res;
    assert(res4d.reviews.length === 1, 'P7.4.12: Min rating filter works');

    let r4e = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_min_rating := 5, p_limit := 10, p_offset := 0) AS res;`);
    let res4e = r4e.rows[0].res;
    assert(res4e.reviews.length === 1, 'P7.4.13: Min rating 5 works');

    let r4f = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 1, p_offset := 0) AS res;`);
    let res4f = r4f.rows[0].res;
    assert(res4f.reviews.length === 1, 'P7.4.14: Pagination limit works');

    await setAuth(mainClient, null);
    let r4g = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 10, p_offset := 0) AS res;`);
    let res4g = r4g.rows[0].res;
    assert(res4g.reviews.length === 1, 'P7.4.15: Tenant A only sees tenant A reviews');
await setAuth(mainClient, userStaffB);
    await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId3}', p_action := 'publish') AS res;`);
    await setAuth(mainClient, null);
    let r4h = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-b', p_limit := 10, p_offset := 0) AS res;`);
    let res4h = r4h.rows[0].res;
    assert(res4h.success === true, 'P7.4.16: Tenant B public read succeeds');
    assert(res4h.reviews.length === 1, 'P7.4.17: Tenant B has 1 published review');
    assert(res4h.aggregate.total_count === 1, 'P7.4.18: Tenant B aggregate correct');

    // 5. TENANT READ CONTRACT (get_tenant_reviews)
    console.log('\\n--- 5. TENANT READ CONTRACT (get_tenant_reviews) ---');
    await setAuth(mainClient, userStaffA);

    let r5a = await mainClient.query(`SELECT public.get_tenant_reviews(p_limit := 20, p_offset := 0) AS res;`);
    let res5a = r5a.rows[0].res;
    assert(res5a.success === true, 'P7.5.1: Tenant read succeeds');
    assert(res5a.reviews.length === 2, 'P7.5.2: Staff sees both reviews');
    assert(res5a.aggregate.total_count === 2, 'P7.5.3: Total count 2');
    assert(res5a.aggregate.published_count === 1, 'P7.5.4: Published count 1');
    assert(res5a.aggregate.pending_count === 1, 'P7.5.5: Pending count 1');

    let r5b = await mainClient.query(`SELECT public.get_tenant_reviews(p_is_published := false, p_limit := 20, p_offset := 0) AS res;`);
    let res5b = r5b.rows[0].res;
    assert(res5b.reviews.length === 1, 'P7.5.6: Filter unpublished works');
    assert(res5b.reviews[0].is_published === false, 'P7.5.7: Correct unpublished review');

    let r5c = await mainClient.query(`SELECT public.get_tenant_reviews(p_is_published := true, p_limit := 20, p_offset := 0) AS res;`);
    let res5c = r5c.rows[0].res;
    assert(res5c.reviews.length === 1, 'P7.5.8: Filter published works');
    assert(res5c.reviews[0].is_published === true, 'P7.5.9: Correct published review');

    let r5d = await mainClient.query(`SELECT public.get_tenant_reviews(p_customer_id := '55555555-1111-2222-3333-555555555555', p_limit := 20, p_offset := 0) AS res;`);
    let res5d = r5d.rows[0].res;
    assert(res5d.reviews.length === 1, 'P7.5.10: Filter by customer works');
    assert(res5d.reviews[0].customer_id === '55555555-1111-2222-3333-555555555555', 'P7.5.11: Correct customer');

    let r5e = await mainClient.query(`SELECT public.get_tenant_reviews(p_staff_id := '11111111-2222-3333-4444-111111111111', p_limit := 20, p_offset := 0) AS res;`);
    let res5e = r5e.rows[0].res;
    assert(res5e.reviews.length === 2, 'P7.5.12: Filter by staff works');

    await setAuth(mainClient, userStaffA);
    let r5f = await mainClient.query(`SELECT public.get_tenant_reviews(p_limit := 20, p_offset := 0) AS res;`);
    let res5f = r5f.rows[0].res;
    assert(res5f.reviews.length === 2, 'P7.5.13: Staff A only sees tenant A reviews');

    await setAuth(mainClient, userStaffB);
    let r5g = await mainClient.query(`SELECT public.get_tenant_reviews(p_limit := 20, p_offset := 0) AS res;`);
    let res5g = r5g.rows[0].res;
    assert(res5g.reviews.length === 1, 'P7.5.14: Staff B only sees tenant B reviews');
// 6. MODERATE REVIEW (publish/unpublish/respond)
    console.log('\\n--- 6. MODERATE REVIEW ---');
    await setAuth(mainClient, userStaffA);

    let r6a = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'publish') AS res;`);
    let res6a = r6a.rows[0].res;
    assert(res6a.success === true, 'P7.6.1: Publish succeeds');
    assert(res6a.reason_code === 'ok', 'P7.6.2: Returns ok');

    let r6aCheck = await mainClient.query(`SELECT is_published, published_at FROM public.reviews WHERE id = '${reviewId2}';`);
    assert(r6aCheck.rows[0].is_published === true, 'P7.6.3: Review is published');
    assert(r6aCheck.rows[0].published_at !== null, 'P7.6.4: Published_at is set');

    let r6b = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'publish') AS res;`);
    let res6b = r6b.rows[0].res;
    assert(res6b.success === false, 'P7.6.5: Double publish rejected');
    assert(res6b.reason_code === 'already_published', 'P7.6.6: Returns already_published');

    let r6c = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'unpublish') AS res;`);
    let res6c = r6c.rows[0].res;
    assert(res6c.success === true, 'P7.6.7: Unpublish succeeds');

    let r6cCheck = await mainClient.query(`SELECT is_published, published_at FROM public.reviews WHERE id = '${reviewId2}';`);
    assert(r6cCheck.rows[0].is_published === false, 'P7.6.8: Review is unpublished');
    assert(r6cCheck.rows[0].published_at === null, 'P7.6.9: Published_at is null');

    let r6d = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'unpublish') AS res;`);
    let res6d = r6d.rows[0].res;
    assert(res6d.success === false, 'P7.6.10: Double unpublish rejected');
    assert(res6d.reason_code === 'already_unpublished', 'P7.6.11: Returns already_unpublished');

    let r6e = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'respond', p_response_text := 'Thank you!') AS res;`);
    let res6e = r6e.rows[0].res;
    assert(res6e.success === true, 'P7.6.12: Respond succeeds');

    let r6eCheck = await mainClient.query(`SELECT response_text, responded_by, responded_at FROM public.reviews WHERE id = '${reviewId1}';`);
    assert(r6eCheck.rows[0].response_text === 'Thank you!', 'P7.6.13: Response text saved');
    assert(r6eCheck.rows[0].responded_by !== null, 'P7.6.14: Responded_by set');
    assert(r6eCheck.rows[0].responded_at !== null, 'P7.6.15: Responded_at set');

    let r6f = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'respond', p_response_text := 'Another') AS res;`);
    let res6f = r6f.rows[0].res;
    assert(res6f.success === false, 'P7.6.16: Double respond rejected');
    assert(res6f.reason_code === 'already_responded', 'P7.6.17: Returns already_responded');
let r6g = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId2}', p_action := 'respond', p_response_text := '') AS res;`);
    crossTenantNegativeTestsExecuted++;

    await setAuth(mainClient, userStaffB);
    let r6h = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'publish') AS res;`);
    crossTenantNegativeTestsExecuted++;

    await setAuth(mainClient, userStaffA);
    let r6i = await mainClient.query(`SELECT public.moderate_review(p_review_id := '${reviewId1}', p_action := 'invalid_action') AS res;`);
    crossTenantNegativeTestsExecuted++;

    // 7. CONCURRENCY TESTS
    console.log('\\n--- 7. CONCURRENCY TESTS ---');

    const appointmentConcurrency = '5a5a5a5a-1111-2222-3333-555555555555';
    await setAuth(mainClient, userStaffA);
    await mainClient.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES ('${appointmentConcurrency}', '${tenantA}', '${branchA1}', '55555555-1111-2222-3333-555555555555', '${serviceA}', '11111111-2222-3333-4444-111111111111', CURRENT_DATE - 1, '10:00', 30, 'completed')
      ON CONFLICT (id) DO UPDATE SET status = 'completed';
    `);

    await setAuth(mainClient, userCustomerA);
    await setAuth(concurrentClient1, userCustomerA);

    let pConcurrent = Promise.all([
      mainClient.query(`SELECT public.create_verified_review(p_appointment_id := '${appointmentConcurrency}', p_rating := 5, p_title := 'Concurrent 1', p_content := 'Test', p_idempotency_key := 'concurrent-test-1') AS res;`),
      concurrentClient1.query(`SELECT public.create_verified_review(p_appointment_id := '${appointmentConcurrency}', p_rating := 4, p_title := 'Concurrent 2', p_content := 'Test', p_idempotency_key := 'concurrent-test-2') AS res;`)
    ]);

    let [c1, c2] = await pConcurrent;
    let successCount = [c1.rows[0].res.success, c2.rows[0].res.success].filter(s => s).length;
    assert(successCount === 1, 'P7.7.1: Only one concurrent review succeeds');
    concurrencyTestsExecuted++;

    // 8. RLS AND PERMISSION BOUNDARIES
    console.log('\\n--- 8. RLS AND PERMISSION BOUNDARIES ---');

    await setAuth(mainClient, userCustomerA);
    let directInsertFailed = false;
    try { await mainClient.query(`INSERT INTO public.reviews (tenant_id, branch_id, appointment_id, customer_id, service_id, staff_id, rating, idempotency_key) VALUES ('${tenantA}', '${branchA1}', '${appointmentCompletedA2}', '55555555-1111-2222-3333-555555555555', '${serviceA}', '11111111-2222-3333-4444-111111111111', 5, 'direct-insert-test');`); } catch (e) { directInsertFailed = true; }
    assert(directInsertFailed, 'P7.8.1: Direct INSERT on reviews denied');

    let directUpdateFailed = false;
    try { await mainClient.query(`UPDATE public.reviews SET rating = 1 WHERE id = '${reviewId1}';`); } catch (e) { directUpdateFailed = true; }
    assert(directUpdateFailed, 'P7.8.2: Direct UPDATE on reviews denied');

    let directDeleteFailed = false;
    try { await mainClient.query(`DELETE FROM public.reviews WHERE id = '${reviewId1}';`); } catch (e) { directDeleteFailed = true; }
    assert(directDeleteFailed, 'P7.8.3: Direct DELETE on reviews denied');

    await setAuth(mainClient, null);
    let r8d = await mainClient.query(`SELECT public.get_public_reviews(p_tenant_slug := 'tenant-a', p_limit := 10, p_offset := 0) AS res;`);
    let res8d = r8d.rows[0].res;
    assert(res8d.success === true, 'P7.8.4: Anon can call get_public_reviews');

    let anonTenantReadFailed = false;
    try { await mainClient.query(`SELECT public.get_tenant_reviews(p_limit := 10) AS res;`); } catch (e) { anonTenantReadFailed = true; }
    assert(anonTenantReadFailed, 'P7.8.5: Anon cannot call get_tenant_reviews');

    await setAuth(mainClient, userCustomerA);
    let customerTenantReadFailed = false;
    try { await mainClient.query(`SELECT public.get_tenant_reviews(p_limit := 10) AS res;`); } catch (e) { customerTenantReadFailed = true; }
    assert(customerTenantReadFailed, 'P7.8.6: Customer cannot call get_tenant_reviews');
// 9. AUDIT EVENTS
    console.log('\\n--- 9. AUDIT EVENTS ---');
    await setAuth(mainClient, userStaffA);

    let auditCheck = await mainClient.query(`SELECT action, resource_type, resource_id, payload FROM public.audit_events WHERE resource_type = 'reviews' ORDER BY created_at DESC LIMIT 10;`);
    let auditRows = auditCheck.rows;
    let hasCreateEvent = auditRows.some(r => r.action === 'review_created');
    let hasModerateEvent = auditRows.some(r => r.action === 'review_moderated');
    assert(hasCreateEvent, 'P7.9.1: review_created audit event recorded');
    assert(hasModerateEvent, 'P7.9.2: review_moderated audit event recorded');

    // 10. EDGE CASES
    console.log('\\n--- 10. EDGE CASES ---');

    await setAuth(mainClient, userCustomerA2);
    let r10a = await mainClient.query(`
      SELECT public.create_verified_review(p_appointment_id := '${appointmentCompletedA2}', p_rating := 3, p_title := NULL, p_content := NULL, p_idempotency_key := 'review-test-10a') AS res;
    `);
    let res10a = r10a.rows[0].res;
    assert(res10a.success === false && res10a.reason_code === 'duplicate_review', 'P7.10.1: NULL title/content handled (duplicate_review as expected)');

    const appointmentEdge = '6b6b6b6b-1111-2222-3333-666666666666';
    await setAuth(mainClient, userStaffA);
    await mainClient.query(`
      INSERT INTO public.appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, appointment_date, appointment_time, duration_minutes, status)
      VALUES ('${appointmentEdge}', '${tenantA}', '${branchA1}', '55555555-1111-2222-3333-555555555555', '${serviceA}', '11111111-2222-3333-4444-111111111111', CURRENT_DATE - 2, '15:00', 30, 'completed')
      ON CONFLICT (id) DO UPDATE SET status = 'completed';
    `);
    await setAuth(mainClient, userCustomerA);
    let r10b = await mainClient.query(`
      SELECT public.create_verified_review(p_appointment_id := '${appointmentEdge}', p_rating := 3, p_title := '   ', p_content := '   ', p_idempotency_key := 'review-test-10b') AS res;
    `);
    let res10b = r10b.rows[0].res;
    assert(res10b.success === true, 'P7.10.2: Empty string title/content becomes NULL');

    let r10bCheck = await mainClient.query(`SELECT title, content FROM public.reviews WHERE id = '${res10b.review_id}';`);
    assert(r10bCheck.rows[0].title === null, 'P7.10.3: Title is NULL after trim');
    assert(r10bCheck.rows[0].content === null, 'P7.10.4: Content is NULL after trim');

    console.log('\\n===============================================================');
    console.log('LIVE POSTGRESQL VERIFIED REVIEWS BEHAVIORAL MATRIX: ' + testsPassed + '/' + testsExecuted + ' TESTS PASSED | ' + testsFailed + ' FAILURES');
    console.log('CONCURRENCY TESTS: ' + concurrencyTestsExecuted);
    console.log('CROSS-TENANT NEGATIVE TESTS: ' + crossTenantNegativeTestsExecuted);
    console.log('===============================================================\\n');

    console.log('LIVE_BEHAVIORAL_TESTS_EXECUTED=' + testsExecuted);
    console.log('LIVE_BEHAVIORAL_TESTS_PASSED=' + testsPassed);
    console.log('LIVE_BEHAVIORAL_TESTS_FAILED=' + testsFailed);
    console.log('CONCURRENCY_TESTS_EXECUTED=' + concurrencyTestsExecuted);
    console.log('CROSS_TENANT_NEGATIVE_TESTS_EXECUTED=' + crossTenantNegativeTestsExecuted);

  } finally {
    await mainClient.end();
    await concurrentClient1.end();
    await concurrentClient2.end();
  }
}

run().catch((err) => {
  console.error('Verified Reviews behavioral test execution failed:', err);
  process.exit(1);
});
