// supabase/tests/program-v2/phase7-live/test-phase7-node2-discovery-marketplace-behavioral-matrix.mjs
// Phase 7 Node 2 Live PostgreSQL Behavioral Acceptance Matrix
// Discovery Marketplace Server Authority & Public Projection

import pg from 'pg';
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
  console.log('STARTING PHASE 7 NODE 2 LIVE POSTGRESQL DISCOVERY MARKETPLACE BEHAVIORAL MATRIX');
  console.log(`Target Database: ${DB_URL}`);
  console.log('===============================================================\n');

  const adminClient = new Client({ connectionString: DB_URL });
  const anonClient = new Client({ connectionString: DB_URL });

  await adminClient.connect();
  await anonClient.connect();

  try {
    // -------------------------------------------------------------------------
    // TEST FIXTURES IDENTIFIERS
    // -------------------------------------------------------------------------
    const tenantEligible1 = '81111111-1111-4111-8111-111111111111'; // Istanbul, Barber, rating 4.8
    const tenantEligible2 = '82222222-2222-4222-8222-222222222222'; // Ankara, Spa, rating 4.0
    const tenantDraft = '83333333-3333-4333-8333-333333333333';     // public_site_status = 'draft'
    const tenantSuspended = '84444444-4444-4444-8444-444444444444'; // status = 'suspended'
    const tenantDisabledProfile = '85555555-5555-4555-8555-555555555555'; // is_public_profile_enabled = false

    const branch1 = 'b1111111-1111-4111-8111-111111111111';
    const branch2 = 'b2222222-2222-4222-8222-222222222222';
    const branchInactive = 'b3333333-3333-4333-8333-333333333333';

    const service1 = 's1111111-1111-4111-8111-111111111111';
    const service2 = 's2222222-2222-4222-8222-222222222222';
    const serviceInactive = 's3333333-3333-4333-8333-333333333333';

    const customer1 = 'c1111111-1111-4111-8111-111111111111';
    const staff1 = 'f1111111-1111-4111-8111-111111111111';
    const apptCompleted1 = 'a1111111-1111-4111-8111-111111111111';
    const apptCompleted2 = 'a2222222-2222-4222-8222-222222222222';
    const apptCompleted3 = 'a3333333-3333-4333-8333-333333333333';

    // -------------------------------------------------------------------------
    // SETUP: Seed test fixtures via adminClient
    // -------------------------------------------------------------------------
    console.log('--- SETUP: Seeding Marketplace Test Fixtures ---');

    // 1. Tenants
    await adminClient.query(`
      INSERT INTO public.tenants (id, slug, name, status, public_site_status, onboarding_status)
      VALUES
        ('${tenantEligible1}', 'salon-alpha', 'Salon Alpha Istanbul', 'active', 'published', 'completed'),
        ('${tenantEligible2}', 'spa-beta', 'Beta Wellness Spa Ankara', 'manual_active', 'published', 'completed'),
        ('${tenantDraft}', 'draft-salon', 'Draft Salon', 'active', 'draft', 'completed'),
        ('${tenantSuspended}', 'suspended-salon', 'Suspended Salon', 'suspended', 'published', 'completed'),
        ('${tenantDisabledProfile}', 'hidden-salon', 'Hidden Salon', 'active', 'published', 'completed')
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug, name = EXCLUDED.name, status = EXCLUDED.status,
        public_site_status = EXCLUDED.public_site_status, onboarding_status = EXCLUDED.onboarding_status;
    `);

    // 2. Profiles
    await adminClient.query(`
      INSERT INTO public.tenant_business_profiles (
        id, tenant_id, short_description, about_text, business_category,
        address, city, district, is_public_profile_enabled, phone
      )
      VALUES
        (gen_random_uuid(), '${tenantEligible1}', 'Premium Istanbul haircut', 'About Alpha', 'Hair Salon', 'Kadikoy Cad 1', 'Istanbul', 'Kadikoy', true, '+905550000001'),
        (gen_random_uuid(), '${tenantEligible2}', 'Relaxing Ankara sauna and massage', 'About Beta', 'Spa & Wellness', 'Cankaya Sok 2', 'Ankara', 'Cankaya', true, '+905550000002'),
        (gen_random_uuid(), '${tenantDraft}', 'Draft description', 'About Draft', 'Hair Salon', 'Besiktas 3', 'Istanbul', 'Besiktas', true, '+905550000003'),
        (gen_random_uuid(), '${tenantSuspended}', 'Suspended description', 'About Suspended', 'Nail Salon', 'Sisli 4', 'Istanbul', 'Sisli', true, '+905550000004'),
        (gen_random_uuid(), '${tenantDisabledProfile}', 'Hidden description', 'About Hidden', 'Barber', 'Uskudar 5', 'Istanbul', 'Uskudar', false, '+905550000005')
      ON CONFLICT (tenant_id) DO UPDATE SET
        short_description = EXCLUDED.short_description,
        about_text = EXCLUDED.about_text,
        business_category = EXCLUDED.business_category,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        district = EXCLUDED.district,
        is_public_profile_enabled = EXCLUDED.is_public_profile_enabled,
        phone = EXCLUDED.phone;
    `);

    // 3. Branches
    await adminClient.query(`
      INSERT INTO public.branches (id, tenant_id, name, slug, is_active, is_primary)
      VALUES
        ('${branch1}', '${tenantEligible1}', 'Kadikoy Main', 'kadikoy-main', true, true),
        ('${branch2}', '${tenantEligible2}', 'Cankaya Branch', 'cankaya-branch', true, true),
        ('${branchInactive}', '${tenantEligible1}', 'Closed Branch', 'closed-branch', false, false)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, is_active = EXCLUDED.is_active, is_primary = EXCLUDED.is_primary;
    `);

    // 4. Services
    await adminClient.query(`
      INSERT INTO public.services (id, tenant_id, name, duration, price, active, category)
      VALUES
        ('${service1}', '${tenantEligible1}', 'Fade Haircut', 45, 300, true, 'Hair'),
        ('${service2}', '${tenantEligible2}', 'Deep Tissue Massage', 60, 800, true, 'Massage'),
        ('${serviceInactive}', '${tenantEligible1}', 'Discontinued Beard Trim', 20, 150, false, 'Beard')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, active = EXCLUDED.active, price = EXCLUDED.price;
    `);

    // 5. Staff, Customer, Appointments for Reviews
    await adminClient.query(`
      INSERT INTO public.staff (id, tenant_id, name, active)
      VALUES ('${staff1}', '${tenantEligible1}', 'Master Barber', true)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.customers (id, tenant_id, name, email)
      VALUES ('${customer1}', '${tenantEligible1}', 'John Customer', 'john@test.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.appointments (id, tenant_id, customer_id, branch_id, staff_id, service_id, appointment_date, appointment_time, status)
      VALUES
        ('${apptCompleted1}', '${tenantEligible1}', '${customer1}', '${branch1}', '${staff1}', '${service1}', '2026-10-01', '10:00:00', 'completed'),
        ('${apptCompleted2}', '${tenantEligible1}', '${customer1}', '${branch1}', '${staff1}', '${service1}', '2026-10-02', '11:00:00', 'completed'),
        ('${apptCompleted3}', '${tenantEligible1}', '${customer1}', '${branch1}', '${staff1}', '${service1}', '2026-10-03', '12:00:00', 'completed')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 6. Reviews (2 published, 1 unpublished)
    await adminClient.query(`
      DELETE FROM public.reviews WHERE tenant_id = '${tenantEligible1}';

      INSERT INTO public.reviews (
        id, tenant_id, branch_id, appointment_id, customer_id, service_id, staff_id,
        rating, title, content, is_published, published_at, idempotency_key
      )
      VALUES
        (gen_random_uuid(), '${tenantEligible1}', '${branch1}', '${apptCompleted1}', '${customer1}', '${service1}', '${staff1}', 5, 'Great haircut', 'Loved the fade', true, now(), 'rev-seed-1'),
        (gen_random_uuid(), '${tenantEligible1}', '${branch1}', '${apptCompleted2}', '${customer1}', '${service1}', '${staff1}', 5, 'Perfect styling', 'Very clean shop', true, now(), 'rev-seed-2'),
        (gen_random_uuid(), '${tenantEligible1}', '${branch1}', '${apptCompleted3}', '${customer1}', '${service1}', '${staff1}', 1, 'Unpublished complaint', 'Should not affect avg', false, null, 'rev-seed-3');
    `);

    // -------------------------------------------------------------------------
    // TEST 1: ELIGIBLE BUSINESSES ARE VISIBLE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 1: Public Discovery Visibility ---');
    const resAll = await anonClient.query('SELECT public.get_discovery_marketplace_listings() AS result;');
    const payloadAll = resAll.rows[0].result;

    assert(payloadAll.success === true, 'get_discovery_marketplace_listings returns success=true');
    const slugs = payloadAll.listings.map(l => l.slug);
    assert(slugs.includes('salon-alpha'), 'Eligible published salon-alpha is present in listings');
    assert(slugs.includes('spa-beta'), 'Eligible manual_active spa-beta is present in listings');

    // -------------------------------------------------------------------------
    // TEST 2: INELIGIBLE & UNPUBLISHED BUSINESSES STRICTLY HIDDEN
    // -------------------------------------------------------------------------
    assert(!slugs.includes('draft-salon'), 'Draft business is strictly hidden from listings');
    assert(!slugs.includes('suspended-salon'), 'Suspended business is strictly hidden from listings');
    assert(!slugs.includes('hidden-salon'), 'Business with is_public_profile_enabled=false is hidden from listings');

    // -------------------------------------------------------------------------
    // TEST 3: UNPUBLISHED REVIEWS STRICTLY EXCLUDED FROM AGGREGATES
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Review Aggregates & Unpublished Review Exclusion ---');
    const alphaListing = payloadAll.listings.find(l => l.slug === 'salon-alpha');
    assert(alphaListing !== undefined, 'salon-alpha found in listings');
    assert(Number(alphaListing.review_count) === 2, `salon-alpha review_count is 2 (excluding 1 unpublished review), got: ${alphaListing.review_count}`);
    assert(Number(alphaListing.average_rating) === 5.0, `salon-alpha average_rating is 5.0 (excluding unpublished 1-star), got: ${alphaListing.average_rating}`);

    // Detail RPC review exclusion test
    const resDetail = await anonClient.query("SELECT public.get_discovery_marketplace_detail('salon-alpha') AS result;");
    const payloadDetail = resDetail.rows[0].result;
    assert(payloadDetail.success === true, 'get_discovery_marketplace_detail returns success=true');
    const b = payloadDetail.business;
    assert(b.reviews_summary.total_reviews === 2, `Detail reviews_summary.total_reviews is 2, got: ${b.reviews_summary.total_reviews}`);
    assert(Number(b.reviews_summary.average_rating) === 5.0, `Detail reviews_summary.average_rating is 5.0, got: ${b.reviews_summary.average_rating}`);
    assert(b.recent_reviews.length === 2, `recent_reviews count is 2 (no unpublished reviews), got: ${b.recent_reviews.length}`);
    const unpubPresent = b.recent_reviews.some(r => r.title === 'Unpublished complaint');
    assert(!unpubPresent, 'Unpublished review content is strictly omitted from recent_reviews');

    // -------------------------------------------------------------------------
    // TEST 4: INACTIVE BRANCHES & SERVICES EXCLUDED
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Inactive Branches & Services Exclusion ---');
    const branchNames = b.branches.map(br => br.name);
    assert(branchNames.includes('Kadikoy Main'), 'Active branch is present');
    assert(!branchNames.includes('Closed Branch'), 'Inactive branch is strictly excluded');

    const serviceNames = b.services.map(s => s.name);
    assert(serviceNames.includes('Fade Haircut'), 'Active service is present');
    assert(!serviceNames.includes('Discontinued Beard Trim'), 'Inactive service is strictly excluded');

    // -------------------------------------------------------------------------
    // TEST 5: FILTERING & SEARCH BEHAVIOR
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Search & Filter Dimensions ---');
    // Filter by city: Istanbul
    const resCity = await anonClient.query("SELECT public.get_discovery_marketplace_listings(p_city := 'Istanbul') AS result;");
    const listingsCity = resCity.rows[0].result.listings;
    assert(listingsCity.every(l => l.city === 'Istanbul'), 'p_city filter returns only Istanbul businesses');
    assert(listingsCity.some(l => l.slug === 'salon-alpha'), 'salon-alpha returned for Istanbul');
    assert(!listingsCity.some(l => l.slug === 'spa-beta'), 'spa-beta (Ankara) filtered out of Istanbul search');

    // Search query: 'Massage'
    const resSearch = await anonClient.query("SELECT public.get_discovery_marketplace_listings(p_search_query := 'Massage') AS result;");
    const listingsSearch = resSearch.rows[0].result.listings;
    assert(listingsSearch.some(l => l.slug === 'spa-beta'), 'Search query matches service/description of spa-beta');
    assert(!listingsSearch.some(l => l.slug === 'salon-alpha'), 'Search query excludes non-matching salon-alpha');

    // Filter by min rating: 4.5
    const resRating = await anonClient.query("SELECT public.get_discovery_marketplace_listings(p_min_rating := 4.5) AS result;");
    const listingsRating = resRating.rows[0].result.listings;
    assert(listingsRating.every(l => Number(l.average_rating) >= 4.5), 'p_min_rating filter strictly enforces minimum rating');

    // -------------------------------------------------------------------------
    // TEST 6: BOUNDED PAGINATION & DETERMINISTIC RANKING
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Bounded Pagination & Determinism ---');
    const resPaged1 = await anonClient.query("SELECT public.get_discovery_marketplace_listings(p_limit := 1, p_offset := 0) AS result;");
    const page1 = resPaged1.rows[0].result.listings;
    assert(page1.length === 1, 'Pagination limit 1 returns exactly 1 item');
    assert(page1[0].slug === 'salon-alpha', 'Highest rated business (salon-alpha: 5.0) ranks first');

    const resPaged2 = await anonClient.query("SELECT public.get_discovery_marketplace_listings(p_limit := 1, p_offset := 1) AS result;");
    const page2 = resPaged2.rows[0].result.listings;
    assert(page2.length === 1, 'Pagination offset 1 returns 2nd item');
    assert(page2[0].slug !== page1[0].slug, 'Offset correctly skips first item');

    // -------------------------------------------------------------------------
    // TEST 7: PRIVACY & DATA LEAKAGE PREVENTION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: Data Leakage Negative Tests ---');
    const listingString = JSON.stringify(payloadAll.listings);
    const detailString = JSON.stringify(payloadDetail);

    assert(!listingString.includes('profit_margin'), 'No profit_margin in listings output');
    assert(!listingString.includes('cost_price'), 'No cost_price in listings output');
    assert(!listingString.includes('customer_notes'), 'No customer_notes in listings output');
    assert(!listingString.includes('john@test.com'), 'No customer email in listings output');
    assert(!detailString.includes('profit_margin'), 'No profit_margin in detail output');
    assert(!detailString.includes('cost_price'), 'No cost_price in detail output');
    assert(!detailString.includes('customer_notes'), 'No customer_notes in detail output');
    assert(!detailString.includes('john@test.com'), 'No customer email in detail output');

    // -------------------------------------------------------------------------
    // TEST 8: DETAIL REJECTION OF INELIGIBLE SLUGS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: Ineligible Detail Rejections ---');
    const resDraftDetail = await anonClient.query("SELECT public.get_discovery_marketplace_detail('draft-salon') AS result;");
    assert(resDraftDetail.rows[0].result.success === false, 'Draft salon detail returns success=false');
    assert(resDraftDetail.rows[0].result.reason_code === 'NOT_ELIGIBLE', 'Draft salon detail returns NOT_ELIGIBLE');

    const resSuspDetail = await anonClient.query("SELECT public.get_discovery_marketplace_detail('suspended-salon') AS result;");
    assert(resSuspDetail.rows[0].result.success === false, 'Suspended salon detail returns success=false');
    assert(resSuspDetail.rows[0].result.reason_code === 'NOT_ELIGIBLE', 'Suspended salon detail returns NOT_ELIGIBLE');

    const resDisabledDetail = await anonClient.query("SELECT public.get_discovery_marketplace_detail('hidden-salon') AS result;");
    assert(resDisabledDetail.rows[0].result.success === false, 'Disabled profile salon detail returns success=false');
    assert(resDisabledDetail.rows[0].result.reason_code === 'NOT_ELIGIBLE', 'Disabled profile salon detail returns NOT_ELIGIBLE');

    const resMissingDetail = await anonClient.query("SELECT public.get_discovery_marketplace_detail('non-existent-salon') AS result;");
    assert(resMissingDetail.rows[0].result.success === false, 'Non-existent salon returns success=false');
    assert(resMissingDetail.rows[0].result.reason_code === 'NOT_FOUND', 'Non-existent salon returns NOT_FOUND');

    console.log('\n===============================================================');
    console.log(`TOTAL BEHAVIORAL MATRIX TESTS: ${testsExecuted}`);
    console.log(`PASSED: ${testsPassed}`);
    console.log(`FAILED: ${testsFailed}`);
    console.log('===============================================================');

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      console.log('ALL PHASE 7 NODE 2 BEHAVIORAL MATRIX TESTS PASSED CLEANLY.');
      process.exit(0);
    }

  } finally {
    await adminClient.end();
    await anonClient.end();
  }
}

run().catch(err => {
  console.error('Phase 7 Node 2 behavioral matrix execution failed:', err);
  process.exit(1);
});
