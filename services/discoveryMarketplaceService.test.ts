import assert from 'node:assert/strict';
import {
  discoveryMarketplaceService,
  createDiscoveryUnavailableResult,
  normalizeDiscoveryRpcError,
  mapRawListingToDTO,
  mapRawBusinessDetailToDTO,
  sanitizeBoundedText,
  validateRatingBounds,
  validateReviewRating,
  validatePaginationBounds,
} from './discoveryMarketplaceService.ts';

const SYNTH_TENANT_ID = 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa';
const SYNTH_BRANCH_ID = 'bbbb2222-b2b2-42b2-82b2-bbbbbbbbbbbb';
const SYNTH_SERVICE_ID = 'cccc3333-c3c3-43c3-83c3-cccccccccccc';
const SYNTH_STAFF_ID = 'dddd4444-d4d4-44d4-84d4-dddddddddddd';
const SYNTH_APPT_ID = 'eeee5555-e5e5-45e5-85e5-eeeeeeeeeeee';
const SYNTH_REVIEW_ID = 'ffff6666-f6f6-46f6-86f6-ffffffffffff';
const VALID_TOKEN = 'a'.repeat(64);

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function runDiscoveryMarketplaceServiceTests(): Promise<void> {
  // 1. Fail-closed: non-Supabase mode must return UNAVAILABLE without calling fetcher
  let fetcherCalled = false;
  const neverCalledFetcher = async () => {
    fetcherCalled = true;
    return makeJsonResponse(200, {});
  };

  const localCalls = await Promise.all([
    discoveryMarketplaceService.getListings({}, { mode: 'local', fetcher: neverCalledFetcher }),
    discoveryMarketplaceService.getDetail({ slug: 'melis-guzellik' }, { mode: 'local', fetcher: neverCalledFetcher }),
    discoveryMarketplaceService.createVerifiedReview(
      { appointmentId: SYNTH_APPT_ID, rating: 5, idempotencyKey: 'k1' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    discoveryMarketplaceService.createVerifiedReviewByManageToken(
      { manageToken: VALID_TOKEN, rating: 5, idempotencyKey: 'k2' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    discoveryMarketplaceService.getPublicReviews(
      { tenantSlug: 'melis-guzellik' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    discoveryMarketplaceService.getTenantReviews({}, { mode: 'local', fetcher: neverCalledFetcher }),
    discoveryMarketplaceService.moderateReview(
      { reviewId: SYNTH_REVIEW_ID, action: 'publish' },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    discoveryMarketplaceService.setCustomerFavorite(
      { tenantId: SYNTH_TENANT_ID, isFavorite: true },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
    discoveryMarketplaceService.getCustomerFavorites({}, { mode: 'local', fetcher: neverCalledFetcher }),
    discoveryMarketplaceService.getFastRebookingSeed(
      { manageToken: VALID_TOKEN },
      { mode: 'local', fetcher: neverCalledFetcher }
    ),
  ]);

  for (const res of localCalls) {
    assert.equal(res.success, false);
    if (res.success === false) {
      assert.equal(res.error.code, 'UNAVAILABLE');
    }
  }
  assert.equal(fetcherCalled, false, 'Local mode must never invoke network fetcher');
  assert.equal(createDiscoveryUnavailableResult().success, false);

  // 2. Client-side bounded validation (prevents malformed payloads before RPC)
  assert.equal(sanitizeBoundedText('  Istanbul  ', 'city'), 'Istanbul');
  assert.equal(sanitizeBoundedText('   ', 'city'), null);
  assert.throws(() => sanitizeBoundedText('x'.repeat(101), 'searchQuery'), /exceeds maximum length/);
  assert.equal(validateRatingBounds(4.5), 4.5);
  assert.throws(() => validateRatingBounds(5.5), /between 1.0 and 5.0/);
  assert.throws(() => validateReviewRating(0), /integer between 1 and 5/);
  assert.throws(() => validateReviewRating(4.5), /integer between 1 and 5/);
  assert.deepEqual(validatePaginationBounds(500, -10), { boundedLimit: 100, boundedOffset: 0 });

  const badReviewTokenRes = await discoveryMarketplaceService.createVerifiedReviewByManageToken(
    { manageToken: 'short-token', rating: 5, idempotencyKey: 'key-1' },
    { mode: 'supabase', fetcher: neverCalledFetcher }
  );
  assert.equal(badReviewTokenRes.success, false);
  if (badReviewTokenRes.success === false) {
    assert.equal(badReviewTokenRes.error.code, 'INVALID_TOKEN');
  }

  const badRebookTokenRes = await discoveryMarketplaceService.getFastRebookingSeed(
    { manageToken: 'bad' },
    { mode: 'supabase', fetcher: neverCalledFetcher }
  );
  assert.equal(badRebookTokenRes.success, false);
  if (badRebookTokenRes.success === false) {
    assert.equal(badRebookTokenRes.error.code, 'INVALID_TOKEN');
  }
  assert.equal(fetcherCalled, false, 'Malformed token validation must reject before RPC call');

  // 3. Error normalization invariants
  assert.equal(normalizeDiscoveryRpcError(401, 'UNAUTHENTICATED').code, 'UNAUTHENTICATED');
  assert.equal(normalizeDiscoveryRpcError(403, 'FORBIDDEN: No customer profile').code, 'FORBIDDEN');
  assert.equal(normalizeDiscoveryRpcError(400, 'CROSS_TENANT_VIOLATION: mismatch').code, 'CROSS_TENANT_VIOLATION');
  assert.equal(normalizeDiscoveryRpcError(409, 'IDEMPOTENCY_CONFLICT: changed').code, 'IDEMPOTENCY_CONFLICT');

  // 4. Negative: Non-completed appointment, forged token, and cross-tenant review rejections
  const negFetcher = async (path: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (path.endsWith('/create_verified_review')) {
      return makeJsonResponse(200, {
        success: false,
        reason_code: 'appointment_not_completed',
        message: 'Reviews can only be submitted for completed appointments.',
        appointment_status: 'confirmed',
      });
    }
    if (path.endsWith('/create_verified_review_by_manage_token')) {
      if (body.p_manage_token === 'b'.repeat(64)) {
        return makeJsonResponse(200, { success: false, reason_code: 'invalid_token' });
      }
      if (body.p_expected_tenant_slug === 'other-tenant') {
        return makeJsonResponse(400, { message: 'CROSS_TENANT_VIOLATION: Token does not belong to target tenant.' });
      }
    }
    if (path.endsWith('/get_discovery_marketplace_detail')) {
      return makeJsonResponse(200, {
        success: false,
        reason_code: 'NOT_ELIGIBLE',
        message: 'Business is not eligible for discovery',
      });
    }
    if (path.endsWith('/get_fast_rebooking_seed_by_manage_token')) {
      return makeJsonResponse(200, {
        success: false,
        reason_code: 'APPOINTMENT_NOT_REBOOKABLE',
      });
    }
    return makeJsonResponse(404, { message: 'NOT_FOUND' });
  };

  const uncompletedRes = await discoveryMarketplaceService.createVerifiedReview(
    { appointmentId: SYNTH_APPT_ID, rating: 5, idempotencyKey: 'k-uncomp' },
    { mode: 'supabase', fetcher: negFetcher }
  );
  assert.equal(uncompletedRes.success, false);
  if (uncompletedRes.success === false) {
    assert.equal(uncompletedRes.error.reasonCode, 'appointment_not_completed');
  }

  const forgedTokenRes = await discoveryMarketplaceService.createVerifiedReviewByManageToken(
    { manageToken: 'b'.repeat(64), rating: 5, idempotencyKey: 'k-forged' },
    { mode: 'supabase', fetcher: negFetcher }
  );
  assert.equal(forgedTokenRes.success, false);
  if (forgedTokenRes.success === false) {
    assert.equal(forgedTokenRes.error.reasonCode, 'invalid_token');
  }

  const crossTenantTokenRes = await discoveryMarketplaceService.createVerifiedReviewByManageToken(
    {
      manageToken: VALID_TOKEN,
      rating: 5,
      idempotencyKey: 'k-cross',
      expectedTenantSlug: 'other-tenant',
    },
    { mode: 'supabase', fetcher: negFetcher }
  );
  assert.equal(crossTenantTokenRes.success, false);
  if (crossTenantTokenRes.success === false) {
    assert.equal(crossTenantTokenRes.error.code, 'CROSS_TENANT_VIOLATION');
  }

  const ineligibleDetailRes = await discoveryMarketplaceService.getDetail(
    { slug: 'draft-salon' },
    { mode: 'supabase', fetcher: negFetcher }
  );
  assert.equal(ineligibleDetailRes.success, false);
  if (ineligibleDetailRes.success === false) {
    assert.equal(ineligibleDetailRes.error.reasonCode, 'NOT_ELIGIBLE');
  }

  const nonRebookableRes = await discoveryMarketplaceService.getFastRebookingSeed(
    { manageToken: VALID_TOKEN },
    { mode: 'supabase', fetcher: negFetcher }
  );
  assert.equal(nonRebookableRes.success, false);
  if (nonRebookableRes.success === false) {
    assert.equal(nonRebookableRes.error.reasonCode, 'APPOINTMENT_NOT_REBOOKABLE');
  }

  // 5. Positive: Listings, zero-rating fidelity, verified review, favorites & fast rebooking
  const rpcLog: string[] = [];
  const happyFetcher = async (path: string) => {
    rpcLog.push(path);
    if (path.endsWith('/get_discovery_marketplace_listings')) {
      return makeJsonResponse(200, {
        success: true,
        total_count: 1,
        limit: 20,
        offset: 0,
        listings: [
          {
            tenant_id: SYNTH_TENANT_ID,
            slug: 'aura-nisantasi',
            name: 'Aura Kuaför',
            business_category: 'Kuaför',
            city: 'İstanbul',
            district: 'Şişli',
            review_count: 0,
            average_rating: 0,
            primary_branch: {
              id: SYNTH_BRANCH_ID,
              name: 'Nişantaşı',
              slug: 'nisantasi',
              is_primary: true,
              timezone: 'Europe/Istanbul',
            },
            featured_services: [
              { id: SYNTH_SERVICE_ID, name: 'Saç Kesimi', duration: 45, price: 750 },
            ],
          },
        ],
      });
    }
    if (path.endsWith('/get_discovery_marketplace_detail')) {
      return makeJsonResponse(200, {
        success: true,
        business: {
          tenant_id: SYNTH_TENANT_ID,
          slug: 'aura-nisantasi',
          name: 'Aura Kuaför',
          business_category: 'Kuaför',
          city: 'İstanbul',
          district: 'Şişli',
          branches: [{ id: SYNTH_BRANCH_ID, name: 'Nişantaşı', slug: 'nisantasi', is_primary: true, timezone: 'Europe/Istanbul' }],
          services: [{ id: SYNTH_SERVICE_ID, name: 'Saç Kesimi', duration: 45, price: 750 }],
          reviews_summary: {
            total_reviews: 1,
            average_rating: 5.0,
            distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 },
          },
          recent_reviews: [
            {
              id: SYNTH_REVIEW_ID,
              rating: 5,
              title: 'Harika',
              content: 'Çok memnun kaldım',
              created_at: '2026-11-16T10:00:00Z',
            },
          ],
        },
      });
    }
    if (path.endsWith('/create_verified_review')) {
      return makeJsonResponse(200, {
        success: true,
        idempotent_replay: true,
        review_id: SYNTH_REVIEW_ID,
        reason_code: 'ok',
      });
    }
    if (path.endsWith('/create_verified_review_by_manage_token')) {
      return makeJsonResponse(200, {
        success: true,
        idempotent_replay: false,
        review_id: SYNTH_REVIEW_ID,
        reason_code: 'ok',
      });
    }
    if (path.endsWith('/get_public_reviews')) {
      return makeJsonResponse(200, {
        success: true,
        tenant_id: SYNTH_TENANT_ID,
        reviews: [
          {
            id: SYNTH_REVIEW_ID,
            branch_id: SYNTH_BRANCH_ID,
            branch_name: 'Nişantaşı',
            service_id: SYNTH_SERVICE_ID,
            service_name: 'Saç Kesimi',
            staff_id: SYNTH_STAFF_ID,
            staff_name: 'Selin Demir',
            rating: 5,
            title: 'Harika',
            content: 'Çok memnun kaldım',
            created_at: '2026-11-16T10:00:00Z',
          },
        ],
        aggregate: {
          total_count: 1,
          average_rating: 5,
          rating_distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
      });
    }
    if (path.endsWith('/get_tenant_reviews')) {
      return makeJsonResponse(200, {
        success: true,
        tenant_id: SYNTH_TENANT_ID,
        reviews: [],
        aggregate: {
          total_count: 1,
          published_count: 0,
          pending_count: 1,
          average_rating: 5,
          rating_distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
      });
    }
    if (path.endsWith('/moderate_review')) {
      return makeJsonResponse(200, {
        success: true,
        reason_code: 'ok',
      });
    }
    if (path.endsWith('/set_customer_favorite')) {
      return makeJsonResponse(200, {
        success: true,
        reason_code: 'OK',
        action: 'ADDED',
        favorite_id: '11111111-1111-4111-8111-111111111111',
        is_favorite: true,
      });
    }
    if (path.endsWith('/get_customer_favorites')) {
      return makeJsonResponse(200, {
        success: true,
        reason_code: 'OK',
        total: 1,
        limit: 50,
        offset: 0,
        favorites: [
          {
            favorite_id: '11111111-1111-4111-8111-111111111111',
            tenant_id: SYNTH_TENANT_ID,
            tenant_slug: 'aura-nisantasi',
            tenant_name: 'Aura Kuaför',
            created_at: '2026-11-16T10:00:00Z',
          },
        ],
      });
    }
    if (path.endsWith('/get_fast_rebooking_seed_by_manage_token')) {
      return makeJsonResponse(200, {
        success: true,
        reason_code: 'OK',
        seed: {
          source_appointment_id: SYNTH_APPT_ID,
          tenant_slug: 'aura-nisantasi',
          branch_id: SYNTH_BRANCH_ID,
          service_id: SYNTH_SERVICE_ID,
          service_name: 'Saç Kesimi',
          current_service_price: 750,
          current_service_duration_minutes: 45,
          staff_id: SYNTH_STAFF_ID,
          staff_name: 'Selin Demir',
          requires_current_availability_selection: true,
          availability_authority: 'evaluate_booking_slot',
          booking_authority: 'create_public_booking',
          canonical_booking_required: true,
        },
      });
    }
    return makeJsonResponse(404, {});
  };

  const listRes = await discoveryMarketplaceService.getListings(
    { city: 'İstanbul' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(listRes.success, true);
  if (listRes.success) {
    assert.equal(listRes.data.totalCount, 1);
    assert.equal(listRes.data.listings[0].reviewCount, 0);
    assert.equal(listRes.data.listings[0].averageRating, 0, 'Zero reviews must remain 0 rating');
  }

  const detailRes = await discoveryMarketplaceService.getDetail(
    { slug: 'aura-nisantasi' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(detailRes.success, true);
  if (detailRes.success) {
    assert.equal(detailRes.data.business.reviewsSummary.totalReviews, 1);
    assert.equal(detailRes.data.business.recentReviews[0].title, 'Harika');
  }

  const tokenRevRes = await discoveryMarketplaceService.createVerifiedReviewByManageToken(
    { manageToken: VALID_TOKEN, rating: 5, title: 'Süper', idempotencyKey: 'rev-1' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(tokenRevRes.success, true);
  if (tokenRevRes.success) {
    assert.equal(tokenRevRes.data.reviewId, SYNTH_REVIEW_ID);
  }

  const authRevRes = await discoveryMarketplaceService.createVerifiedReview(
    { appointmentId: SYNTH_APPT_ID, rating: 5, title: 'Harika', idempotencyKey: 'auth-rev-1' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(authRevRes.success, true);
  if (authRevRes.success) {
    assert.equal(authRevRes.data.idempotentReplay, true);
  }

  const pubRevRes = await discoveryMarketplaceService.getPublicReviews(
    { tenantSlug: 'aura-nisantasi' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(pubRevRes.success, true);
  if (pubRevRes.success) {
    assert.equal(pubRevRes.data.aggregate.totalCount, 1);
    assert.equal(pubRevRes.data.reviews[0].staffName, 'Selin Demir');
  }

  const tenantRevRes = await discoveryMarketplaceService.getTenantReviews(
    { isPublished: false },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(tenantRevRes.success, true);
  if (tenantRevRes.success) {
    assert.equal(tenantRevRes.data.aggregate.pendingCount, 1);
  }

  const modRes = await discoveryMarketplaceService.moderateReview(
    { reviewId: SYNTH_REVIEW_ID, action: 'publish' },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(modRes.success, true);

  const badModRes = await discoveryMarketplaceService.moderateReview(
    { reviewId: SYNTH_REVIEW_ID, action: 'respond', responseText: '   ' },
    { mode: 'supabase', fetcher: neverCalledFetcher }
  );
  assert.equal(badModRes.success, false);
  if (badModRes.success === false) {
    assert.equal(badModRes.error.code, 'INVALID_ARGUMENT');
  }

  const favSetRes = await discoveryMarketplaceService.setCustomerFavorite(
    { tenantId: SYNTH_TENANT_ID, isFavorite: true },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(favSetRes.success, true);

  const favGetRes = await discoveryMarketplaceService.getCustomerFavorites(
    {},
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(favGetRes.success, true);
  if (favGetRes.success) {
    assert.equal(favGetRes.data.favorites.length, 1);
  }

  const seedRes = await discoveryMarketplaceService.getFastRebookingSeed(
    { manageToken: VALID_TOKEN },
    { mode: 'supabase', fetcher: happyFetcher }
  );
  assert.equal(seedRes.success, true);
  if (seedRes.success && seedRes.data.seed) {
    assert.equal(seedRes.data.seed.canonicalBookingRequired, true);
    assert.equal(seedRes.data.seed.availabilityAuthority, 'evaluate_booking_slot');
    assert.equal(seedRes.data.seed.bookingAuthority, 'create_public_booking');
  }

  assert.equal(rpcLog.length, 10);
  assert.equal(mapRawListingToDTO({}).averageRating, 0);
  assert.equal(mapRawBusinessDetailToDTO({}).reviewsSummary.totalReviews, 0);

  console.log('[PASS] discoveryMarketplaceService tests verified');
}

await runDiscoveryMarketplaceServiceTests();
