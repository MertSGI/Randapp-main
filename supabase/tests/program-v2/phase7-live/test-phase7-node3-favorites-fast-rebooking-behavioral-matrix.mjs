// Phase 7 Node 3 R1 disposable PostgreSQL behavioral acceptance matrix.
// This suite assumes the full ordered migration chain has already been applied.

import pg from 'pg';
const { Client } = pg;

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let testsExecuted = 0;
let testsPassed = 0;

function assert(condition, testName, detail = '') {
  testsExecuted += 1;
  if (!condition) {
    throw new Error(`Assertion failed: ${testName}${detail ? ` - ${JSON.stringify(detail)}` : ''}`);
  }
  testsPassed += 1;
  console.log(`  [PASS] ${testName}`);
}

async function setClaims(client, userId) {
  const claims = userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '';
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims]);
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await client.query(`SELECT set_config('request.jwt.claim.role', $1, false)`, [userId ? 'authenticated' : '']);
}

async function expectDenied(promise, testName) {
  try {
    await promise;
    assert(false, testName, 'operation unexpectedly succeeded');
  } catch (error) {
    assert(
      /permission denied/i.test(error.message),
      testName,
      error.message
    );
  }
}

async function run() {
  console.log('===============================================================');
  console.log('PHASE 7 NODE 3 R1 DISPOSABLE POSTGRESQL BEHAVIORAL MATRIX');
  console.log(`Target: ${DB_URL}`);
  console.log('===============================================================');

  const admin = new Client({ connectionString: DB_URL });
  const actor = new Client({ connectionString: DB_URL });
  await admin.connect();
  await actor.connect();

  const ids = {
    tenantA: 'a3111111-1111-4111-8111-111111111111',
    tenantB: 'a3222222-2222-4222-8222-222222222222',
    tenantPrivate: 'a3333333-3333-4333-8333-333333333333',
    branchA: 'b3111111-1111-4111-8111-111111111111',
    branchB: 'b3222222-2222-4222-8222-222222222222',
    branchInactive: 'b3444444-4444-4444-8444-444444444444',
    serviceA: 'c3111111-1111-4111-8111-111111111111',
    serviceB: 'c3222222-2222-4222-8222-222222222222',
    serviceInactive: 'c3333333-3333-4333-8333-333333333333',
    serviceMissing: 'c3444444-4444-4444-8444-444444444444',
    serviceUnmapped: 'c3555555-5555-4555-8555-555555555555',
    staffA: 'd3111111-1111-4111-8111-111111111111',
    staffB: 'd3222222-2222-4222-8222-222222222222',
    staffInactive: 'd3333333-3333-4333-8333-333333333333',
    staffUnmapped: 'd3444444-4444-4444-8444-444444444444',
    userA: 'e3111111-1111-4111-8111-111111111111',
    userB: 'e3222222-2222-4222-8222-222222222222',
    customerA: 'f3111111-1111-4111-8111-111111111111',
    customerB: 'f3222222-2222-4222-8222-222222222222',
    appointmentValid: 'a4111111-1111-4111-8111-111111111111',
    appointmentCustomerB: 'a4222222-2222-4222-8222-222222222222',
    appointmentInactiveService: 'a4333333-3333-4333-8333-333333333333',
    appointmentMissingService: 'a4444444-4444-4444-8444-444444444444',
    appointmentInactiveStaff: 'a4555555-5555-4555-8555-555555555555',
    appointmentUnmappedStaff: 'a4666666-6666-4666-8666-666666666666',
    appointmentInactiveBranch: 'a4777777-7777-4777-8777-777777777777',
  };

  const tokens = {
    valid: '11'.repeat(32),
    customerB: '22'.repeat(32),
    inactiveService: '33'.repeat(32),
    missingService: '44'.repeat(32),
    inactiveStaff: '55'.repeat(32),
    unmappedStaff: '66'.repeat(32),
    inactiveBranch: '77'.repeat(32),
    crossTenantMismatch: '88'.repeat(32),
  };

  try {
    console.log('\n--- SETUP: isolated canonical fixtures ---');

    // Match the accepted Phase 7 disposable-test convention: exercise public
    // eligibility under full_production routing while every real production
    // and payment authorization flag remains false in this isolated database.
    await admin.query(`
      UPDATE public.platform_global_release_control
      SET release_phase = 'full_production'
      WHERE id = 1;
    `);

    await admin.query(`
      DELETE FROM public.appointment_access_tokens
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.customer_favorites
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}')
         OR customer_user_id IN ('${ids.userA}', '${ids.userB}');
      DELETE FROM public.appointments
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.availability_rules
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.staff_services
      WHERE staff_id IN ('${ids.staffA}', '${ids.staffB}', '${ids.staffInactive}', '${ids.staffUnmapped}');
      DELETE FROM public.service_branches
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.staff_branches
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.customers
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.users_profile WHERE id IN ('${ids.userA}', '${ids.userB}');
      DELETE FROM public.services
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.branches
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.staff
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.tenant_business_profiles
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.subscriptions
      WHERE tenant_id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM public.tenants
      WHERE id IN ('${ids.tenantA}', '${ids.tenantB}', '${ids.tenantPrivate}');
      DELETE FROM auth.users WHERE id IN ('${ids.userA}', '${ids.userB}');
    `);

    await admin.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${ids.userA}', 'node3-user-a@example.test'),
        ('${ids.userB}', 'node3-user-b@example.test');

      INSERT INTO public.tenants (id, slug, name, status, onboarding_status, public_site_status) VALUES
        ('${ids.tenantA}', 'node3-salon-a', 'Node 3 Salon A', 'active', 'completed', 'published'),
        ('${ids.tenantB}', 'node3-salon-b', 'Node 3 Salon B', 'active', 'completed', 'published'),
        ('${ids.tenantPrivate}', 'node3-private', 'Node 3 Private Salon', 'active', 'completed', 'published');

      INSERT INTO public.tenant_business_profiles (
        id, tenant_id, short_description, business_category, city, district, is_public_profile_enabled
      ) VALUES
        (gen_random_uuid(), '${ids.tenantA}', 'Public A', 'Hair', 'Istanbul', 'Kadikoy', true),
        (gen_random_uuid(), '${ids.tenantB}', 'Public B', 'Spa', 'Ankara', 'Cankaya', true),
        (gen_random_uuid(), '${ids.tenantPrivate}', 'Private', 'Hair', 'Izmir', 'Konak', false);
    `);

    for (const tenantId of [ids.tenantA, ids.tenantB]) {
      const subscription = await admin.query(`
        INSERT INTO public.subscriptions (
          tenant_id, plan_id, plan_version_id, status, billing_mode,
          current_period_start, current_period_end
        )
        SELECT $1, p.code, pv.id, 'active', 'manual', now() - interval '1 day', now() + interval '1 year'
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        JOIN public.plan_entitlements pe_core
          ON pe_core.plan_version_id = pv.id
         AND pe_core.feature_key = 'core_booking'
         AND pe_core.boolean_value IS TRUE
        JOIN public.plan_entitlements pe_branch
          ON pe_branch.plan_version_id = pv.id
         AND pe_branch.feature_key = 'max_branches'
         AND pe_branch.is_unlimited IS TRUE
        JOIN public.plan_entitlements pe_staff
          ON pe_staff.plan_version_id = pv.id
         AND pe_staff.feature_key = 'max_staff'
         AND pe_staff.is_unlimited IS TRUE
        JOIN public.plan_entitlements pe_service
          ON pe_service.plan_version_id = pv.id
         AND pe_service.feature_key = 'max_services'
         AND pe_service.is_unlimited IS TRUE
        JOIN public.plan_entitlements pe_appointment
          ON pe_appointment.plan_version_id = pv.id
         AND pe_appointment.feature_key = 'max_monthly_appointments'
         AND pe_appointment.is_unlimited IS TRUE
        WHERE pv.lifecycle_status = 'published'
        ORDER BY pv.created_at DESC
        LIMIT 1
        RETURNING id;
      `, [tenantId]);
      assert(subscription.rowCount === 1, `Commercial fixture exists for ${tenantId}`);
    }

    await admin.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_primary, is_active) VALUES
        ('${ids.branchA}', '${ids.tenantA}', 'A Main', 'a-main', true, true),
        ('${ids.branchB}', '${ids.tenantB}', 'B Main', 'b-main', true, true),
        ('${ids.branchInactive}', '${ids.tenantA}', 'A Closed', 'a-closed', false, false);

      INSERT INTO public.staff (id, tenant_id, name, active) VALUES
        ('${ids.staffA}', '${ids.tenantA}', 'Staff A', true),
        ('${ids.staffB}', '${ids.tenantB}', 'Staff B', true),
        ('${ids.staffInactive}', '${ids.tenantA}', 'Inactive Staff', false),
        ('${ids.staffUnmapped}', '${ids.tenantA}', 'Unmapped Staff', true);

      INSERT INTO public.services (id, tenant_id, name, duration, price, active) VALUES
        ('${ids.serviceA}', '${ids.tenantA}', 'Current Service A', 45, 475, true),
        ('${ids.serviceB}', '${ids.tenantB}', 'Current Service B', 60, 650, true),
        ('${ids.serviceInactive}', '${ids.tenantA}', 'Inactive Service', 90, 900, false),
        ('${ids.serviceMissing}', '${ids.tenantA}', 'Soon Deleted Service', 30, 300, true),
        ('${ids.serviceUnmapped}', '${ids.tenantA}', 'Unmapped Service', 40, 400, true);

      INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES
        ('${ids.tenantA}', '${ids.staffA}', '${ids.branchA}'),
        ('${ids.tenantA}', '${ids.staffA}', '${ids.branchInactive}'),
        ('${ids.tenantA}', '${ids.staffInactive}', '${ids.branchA}'),
        ('${ids.tenantA}', '${ids.staffUnmapped}', '${ids.branchA}'),
        ('${ids.tenantB}', '${ids.staffB}', '${ids.branchB}');

      INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES
        ('${ids.tenantA}', '${ids.serviceA}', '${ids.branchA}'),
        ('${ids.tenantA}', '${ids.serviceA}', '${ids.branchInactive}'),
        ('${ids.tenantA}', '${ids.serviceInactive}', '${ids.branchA}'),
        ('${ids.tenantA}', '${ids.serviceMissing}', '${ids.branchA}'),
        ('${ids.tenantA}', '${ids.serviceUnmapped}', '${ids.branchA}'),
        ('${ids.tenantB}', '${ids.serviceB}', '${ids.branchB}');

      INSERT INTO public.staff_services (staff_id, service_id) VALUES
        ('${ids.staffA}', '${ids.serviceA}'),
        ('${ids.staffA}', '${ids.serviceInactive}'),
        ('${ids.staffA}', '${ids.serviceMissing}'),
        ('${ids.staffInactive}', '${ids.serviceA}'),
        ('${ids.staffB}', '${ids.serviceB}');

      INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
      SELECT '${ids.tenantA}', '${ids.staffA}', d, '08:00:00'::time, '20:00:00'::time, true
      FROM generate_series(1, 7) AS d;

      INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
      SELECT '${ids.tenantB}', '${ids.staffB}', d, '08:00:00'::time, '20:00:00'::time, true
      FROM generate_series(1, 7) AS d;

      INSERT INTO public.users_profile (id, tenant_id, name, role, active) VALUES
        ('${ids.userA}', '${ids.tenantA}', 'Node3 User A', 'customer', true),
        ('${ids.userB}', '${ids.tenantA}', 'Node3 User B', 'customer', true);

      INSERT INTO public.customers (id, tenant_id, user_profile_id, name, email) VALUES
        ('${ids.customerA}', '${ids.tenantA}', '${ids.userA}', 'Customer A', 'customer-a@example.test'),
        ('${ids.customerB}', '${ids.tenantB}', '${ids.userB}', 'Customer B', 'customer-b@example.test');
    `);

    const eligibilityA = await admin.query(
      `SELECT public.evaluate_public_booking_eligibility_internal($1, $2) AS result`,
      [ids.tenantA, 'node3-salon-a']
    );
    const eligibilityB = await admin.query(
      `SELECT public.evaluate_public_booking_eligibility_internal($1, $2) AS result`,
      [ids.tenantB, 'node3-salon-b']
    );
    assert(eligibilityA.rows[0].result.bookable === true, 'Tenant A is canonically bookable', eligibilityA.rows[0].result);
    assert(eligibilityB.rows[0].result.bookable === true, 'Tenant B is canonically bookable', eligibilityB.rows[0].result);

    await admin.query(`
      INSERT INTO public.appointments (
        id, tenant_id, customer_id, staff_id, service_id, branch_id,
        user_name, user_email, phone, appointment_date, appointment_time,
        duration_minutes, status
      ) VALUES
        ('${ids.appointmentValid}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffA}', '${ids.serviceA}', '${ids.branchA}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 30, '10:00', 999, 'completed'),
        ('${ids.appointmentCustomerB}', '${ids.tenantB}', '${ids.customerB}', '${ids.staffB}', '${ids.serviceB}', '${ids.branchB}', 'Historical B', 'old-b@example.test', '+900000000002', current_date - 31, '11:00', 777, 'completed'),
        ('${ids.appointmentInactiveService}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffA}', '${ids.serviceInactive}', '${ids.branchA}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 32, '10:00', 90, 'completed'),
        ('${ids.appointmentMissingService}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffA}', '${ids.serviceMissing}', '${ids.branchA}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 33, '10:00', 30, 'completed'),
        ('${ids.appointmentInactiveStaff}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffInactive}', '${ids.serviceA}', '${ids.branchA}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 34, '10:00', 45, 'completed'),
        ('${ids.appointmentUnmappedStaff}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffUnmapped}', '${ids.serviceUnmapped}', '${ids.branchA}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 35, '10:00', 40, 'completed'),
        ('${ids.appointmentInactiveBranch}', '${ids.tenantA}', '${ids.customerA}', '${ids.staffA}', '${ids.serviceA}', '${ids.branchInactive}', 'Historical A', 'old-a@example.test', '+900000000001', current_date - 36, '10:00', 45, 'completed');
    `);

    const tokenRows = [
      [tokens.valid, ids.tenantA, ids.appointmentValid],
      [tokens.customerB, ids.tenantB, ids.appointmentCustomerB],
      [tokens.inactiveService, ids.tenantA, ids.appointmentInactiveService],
      [tokens.missingService, ids.tenantA, ids.appointmentMissingService],
      [tokens.inactiveStaff, ids.tenantA, ids.appointmentInactiveStaff],
      [tokens.unmappedStaff, ids.tenantA, ids.appointmentUnmappedStaff],
      [tokens.inactiveBranch, ids.tenantA, ids.appointmentInactiveBranch],
      [tokens.crossTenantMismatch, ids.tenantB, ids.appointmentValid],
    ];

    for (const [rawToken, tenantId, appointmentId] of tokenRows) {
      await admin.query(`
        INSERT INTO public.appointment_access_tokens (tenant_id, appointment_id, token_hash, expires_at)
        VALUES ($1, $2, encode(sha256($3::bytea), 'hex'), now() + interval '30 days')
      `, [tenantId, appointmentId, rawToken]);
    }

    // Deletion must be observed as current truth by the seed, never resurrected
    // from the historical appointment.
    await admin.query(`DELETE FROM public.services WHERE id = $1`, [ids.serviceMissing]);

    console.log('\n--- FAVORITES: identity, idempotency, isolation, and deletion safety ---');

    const rls = await admin.query(`
      SELECT c.relrowsecurity,
             COUNT(p.policyname)::integer AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
      WHERE n.nspname = 'public' AND c.relname = 'customer_favorites'
      GROUP BY c.relrowsecurity
    `);
    assert(rls.rows[0].relrowsecurity === true && rls.rows[0].policy_count === 3, 'Favorites RLS is enabled with three owner policies', rls.rows[0]);

    await setClaims(admin, null);
    const unauthFavorite = await admin.query(`SELECT public.set_customer_favorite($1, true) AS result`, [ids.tenantA]);
    assert(unauthFavorite.rows[0].result.reason_code === 'UNAUTHENTICATED', 'Favorite mutation fails closed without auth.uid()', unauthFavorite.rows[0].result);

    await actor.query('SET ROLE authenticated');
    await setClaims(actor, ids.userA);

    await expectDenied(
      actor.query(
        `INSERT INTO public.customer_favorites (customer_user_id, tenant_id) VALUES ($1, $2)`,
        [ids.userB, ids.tenantA]
      ),
      'Authenticated browser role cannot insert arbitrary favorite owner directly'
    );

    const firstAdd = await actor.query(`SELECT public.set_customer_favorite($1, true) AS result`, [ids.tenantA]);
    const secondAdd = await actor.query(`SELECT public.set_customer_favorite($1, true) AS result`, [ids.tenantA]);
    assert(firstAdd.rows[0].result.action === 'ADDED', 'First favorite request adds relation', firstAdd.rows[0].result);
    assert(secondAdd.rows[0].result.action === 'UNCHANGED', 'Repeated favorite request is idempotent', secondAdd.rows[0].result);

    const uniqueCount = await admin.query(
      `SELECT COUNT(*)::integer AS count FROM public.customer_favorites WHERE customer_user_id = $1 AND tenant_id = $2`,
      [ids.userA, ids.tenantA]
    );
    assert(uniqueCount.rows[0].count === 1, 'Repeated favorite produces exactly one relation');

    const userAList = await actor.query(`SELECT public.get_customer_favorites(50, 0) AS result`);
    assert(userAList.rows[0].result.total === 1, 'Owner lists exactly one favorite', userAList.rows[0].result);
    assert(userAList.rows[0].result.favorites[0].tenant_id === ids.tenantA, 'Favorite references canonical tenant ID only');

    await setClaims(actor, ids.userB);
    const userBList = await actor.query(`SELECT public.get_customer_favorites(50, 0) AS result`);
    assert(userBList.rows[0].result.total === 0, 'Different user cannot read another user favorites', userBList.rows[0].result);

    const userBRemove = await actor.query(`SELECT public.set_customer_favorite($1, false) AS result`, [ids.tenantA]);
    assert(userBRemove.rows[0].result.action === 'UNCHANGED', 'Different user cannot delete another user favorite', userBRemove.rows[0].result);
    const stillExists = await admin.query(
      `SELECT COUNT(*)::integer AS count FROM public.customer_favorites WHERE customer_user_id = $1 AND tenant_id = $2`,
      [ids.userA, ids.tenantA]
    );
    assert(stillExists.rows[0].count === 1, 'Cross-user delete attempt leaves owner relation intact');

    const invalidTarget = await actor.query(`SELECT public.set_customer_favorite($1, true) AS result`, ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    assert(invalidTarget.rows[0].result.reason_code === 'TARGET_NOT_ELIGIBLE', 'Nonexistent favorite target is rejected', invalidTarget.rows[0].result);

    const privateTarget = await actor.query(`SELECT public.set_customer_favorite($1, true) AS result`, [ids.tenantPrivate]);
    assert(privateTarget.rows[0].result.reason_code === 'TARGET_NOT_ELIGIBLE', 'Private tenant cannot become a favorite target', privateTarget.rows[0].result);

    await setClaims(actor, ids.userA);
    const tenantBefore = await admin.query(`SELECT name FROM public.tenants WHERE id = $1`, [ids.tenantA]);
    const removeOwn = await actor.query(`SELECT public.set_customer_favorite($1, false) AS result`, [ids.tenantA]);
    const tenantAfter = await admin.query(`SELECT name FROM public.tenants WHERE id = $1`, [ids.tenantA]);
    assert(removeOwn.rows[0].result.action === 'REMOVED', 'Owner can remove own favorite relation', removeOwn.rows[0].result);
    assert(tenantBefore.rows[0].name === tenantAfter.rows[0].name, 'Unfavorite leaves underlying business truth untouched');

    console.log('\n--- FAST REBOOKING: manage-token ownership and current truth ---');

    const invalidToken = await admin.query(
      `SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`,
      ['not-a-valid-manage-token']
    );
    assert(invalidToken.rows[0].result.reason_code === 'INVALID_TOKEN', 'Invalid ownership proof is denied', invalidToken.rows[0].result);

    const crossTenant = await admin.query(
      `SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`,
      [tokens.crossTenantMismatch]
    );
    assert(crossTenant.rows[0].result.reason_code === 'INVALID_TOKEN', 'Token tenant mismatch is denied without cross-tenant leakage', crossTenant.rows[0].result);

    const validSeed = await admin.query(
      `SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`,
      [tokens.valid]
    );
    assert(validSeed.rows[0].result.success === true, 'Valid manage token and current mappings allow a rebooking seed', validSeed.rows[0].result);
    assert(validSeed.rows[0].result.seed.source_appointment_id === ids.appointmentValid, 'Token can resolve only its bound historical appointment');
    assert(Number(validSeed.rows[0].result.seed.current_service_price) === 475, 'Historical appointment does not override current price', validSeed.rows[0].result.seed);
    assert(validSeed.rows[0].result.seed.current_service_duration_minutes === 45, 'Historical duration does not override current duration', validSeed.rows[0].result.seed);
    assert(validSeed.rows[0].result.seed.booking_authority === 'create_public_booking', 'Seed names canonical booking authority');
    assert(validSeed.rows[0].result.seed.availability_authority === 'evaluate_booking_slot', 'Seed names canonical availability authority');

    const otherCustomerSeed = await admin.query(
      `SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`,
      [tokens.customerB.slice(0, -1) + '0']
    );
    assert(otherCustomerSeed.rows[0].result.reason_code === 'INVALID_TOKEN', 'A forged token cannot access another customer appointment', otherCustomerSeed.rows[0].result);

    const signature = await admin.query(`
      SELECT pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_fast_rebooking_seed_by_manage_token'
    `);
    assert(signature.rows[0].args === 'p_manage_token text', 'Rebooking API accepts no caller-selected customer, tenant, or appointment ID', signature.rows[0].args);
    assert(!/insert\s+into\s+public\.appointments/i.test(signature.rows[0].definition), 'Fast-rebooking seed cannot directly insert an appointment');

    const inactiveService = await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`, [tokens.inactiveService]);
    assert(inactiveService.rows[0].result.reason_code === 'SERVICE_RESELECTION_REQUIRED', 'Inactive service fails closed and requires reselection', inactiveService.rows[0].result);

    const missingService = await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`, [tokens.missingService]);
    assert(missingService.rows[0].result.reason_code === 'SERVICE_RESELECTION_REQUIRED', 'Deleted service is not resurrected from history', missingService.rows[0].result);

    const inactiveStaff = await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`, [tokens.inactiveStaff]);
    assert(inactiveStaff.rows[0].result.reason_code === 'STAFF_RESELECTION_REQUIRED', 'Inactive staff fails closed and requires reselection', inactiveStaff.rows[0].result);

    const unmappedStaff = await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`, [tokens.unmappedStaff]);
    assert(unmappedStaff.rows[0].result.reason_code === 'STAFF_RESELECTION_REQUIRED', 'Staff no longer serving service fails closed', unmappedStaff.rows[0].result);

    const inactiveBranch = await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1) AS result`, [tokens.inactiveBranch]);
    assert(inactiveBranch.rows[0].result.reason_code === 'BRANCH_RESELECTION_REQUIRED', 'Inactive branch fails closed and requires reselection', inactiveBranch.rows[0].result);

    console.log('\n--- CANONICAL BOOKING: availability, overlap, and idempotency remain authoritative ---');

    const dateResult = await admin.query(`SELECT (current_date + 60)::date::text AS booking_date`);
    const bookingDate = dateResult.rows[0].booking_date;

    const available = await admin.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, '10:00'::time, NULL) AS result
    `, [ids.tenantA, ids.branchA, ids.serviceA, ids.staffA, bookingDate]);
    assert(available.rows[0].result.allowed === true, 'Canonical availability allows a valid current slot', available.rows[0].result);

    const appointmentCountBeforeSeed = await admin.query(`SELECT COUNT(*)::integer AS count FROM public.appointments`);
    await admin.query(`SELECT public.get_fast_rebooking_seed_by_manage_token($1)`, [tokens.valid]);
    const appointmentCountAfterSeed = await admin.query(`SELECT COUNT(*)::integer AS count FROM public.appointments`);
    assert(appointmentCountBeforeSeed.rows[0].count === appointmentCountAfterSeed.rows[0].count, 'Reading a fast-rebooking seed creates no appointment');

    await admin.query(`
      INSERT INTO public.appointments (
        tenant_id, branch_id, service_id, staff_id, user_name, phone,
        appointment_date, appointment_time, duration_minutes, status
      ) VALUES ($1, $2, $3, $4, 'Overlap Fixture', '+900000000099', $5::date, '10:00'::time, 45, 'confirmed')
    `, [ids.tenantA, ids.branchA, ids.serviceA, ids.staffA, bookingDate]);

    const overlap = await admin.query(`
      SELECT public.evaluate_booking_slot($1, $2, $3, $4, $5::date, '10:00'::time, NULL) AS result
    `, [ids.tenantA, ids.branchA, ids.serviceA, ids.staffA, bookingDate]);
    assert(overlap.rows[0].result.allowed === false && overlap.rows[0].result.reason_code === 'slot_conflict', 'Canonical overlap protection rejects occupied slot', overlap.rows[0].result);

    await admin.query(`
      DELETE FROM public.appointments
      WHERE tenant_id = $1 AND appointment_date = $2::date AND user_name = 'Overlap Fixture'
    `, [ids.tenantA, bookingDate]);

    const bookingArgs = [
      'node3-salon-a', ids.serviceA, ids.staffA, bookingDate, '10:00',
      'Canonical Rebook Customer', 'canonical-rebook@example.test', '+900000000088',
      true, false, false, 'node3-rebook-idempotency-1', ids.branchA,
    ];
    const createSql = `
      SELECT public.create_public_booking(
        $1, $2, $3, $4::date, $5::time, $6, $7, $8,
        $9, $10, $11, $12, $13
      ) AS result
    `;
    const bookingOne = await admin.query(createSql, bookingArgs);
    const bookingTwo = await admin.query(createSql, bookingArgs);
    assert(bookingOne.rows[0].result.success === true, 'Canonical create_public_booking creates the rebooked appointment', bookingOne.rows[0].result);
    assert(bookingTwo.rows[0].result.appointment_id === bookingOne.rows[0].result.appointment_id, 'Canonical booking idempotency returns the same appointment', {
      first: bookingOne.rows[0].result,
      second: bookingTwo.rows[0].result,
    });

    const canonicalCount = await admin.query(
      `SELECT COUNT(*)::integer AS count FROM public.appointments WHERE id = $1`,
      [bookingOne.rows[0].result.appointment_id]
    );
    assert(canonicalCount.rows[0].count === 1, 'Canonical booking idempotency persists one appointment');

    console.log('\n===============================================================');
    console.log(`TOTAL BEHAVIORAL TESTS: ${testsExecuted}`);
    console.log(`PASSED: ${testsPassed}`);
    console.log('FAILED: 0');
    console.log('===============================================================');
  } finally {
    await actor.end();
    await admin.end();
  }
}

if (process.env.RUN_STANDALONE === 'true') {
  run().catch((error) => {
    console.error('Fatal behavioral matrix error:', error);
    process.exit(1);
  });
}

export { run };
