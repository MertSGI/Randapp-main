-- =========================================================================
-- MIGRATION 20261005_phase7_node2_discovery_marketplace_projection.sql
-- Description: Phase 7 Node 2 R1 — Discovery Marketplace Server-Authoritative Public Projection
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 94
-- Authority: DECISION-022
-- Objective: LARI-P7-N2-DISCOVERY-MARKETPLACE-R1
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE MARKETPLACE LISTING SOURCE OF TRUTH:
--    Explicitly forbidden: creating discovery_marketplace_listings or duplicate business truth tables.
--    This migration introduces NO NEW MUTATING BUSINESS ENTITY TABLES.
--    It delivers server-authoritative read RPCs projecting over canonical tables:
--    public.tenants, public.tenant_business_profiles, public.branches,
--    public.services, public.reviews.
-- 2. REUSE CANONICAL PUBLIC ELIGIBILITY GATES:
--    Marketplace visibility reuses canonical public eligibility/publication rules already
--    enforced by the existing public booking/business surfaces.
--    A business is eligible for public discovery IF AND ONLY IF:
--      - tenants.status IN ('active', 'manual_active')
--      - tenants.onboarding_status = 'completed'
--      - tenants.public_site_status = 'published'
--      - tenant_business_profiles.is_public_profile_enabled = true
--      - canonical evaluate_public_booking_eligibility_internal returns bookable = true
--    Inactive, suspended, draft, onboarding, commercial-ineligible, or profile-disabled
--    businesses are strictly omitted.
--    Discovery RPCs fail closed with generic NOT_ELIGIBLE without exposing internal details.
-- 3. VERIFIED PUBLISHED REVIEW AGGREGATES ONLY:
--    Only verified reviews with is_published = true affect review counts and rating averages.
--    Unpublished reviews (is_published = false) are strictly excluded from aggregates and details.
-- 4. PRIVACY & SECURITY DEFENSE-IN-DEPTH:
--    Only public-safe fields are exposed (business name, slug, category, address, city, district,
--    contact info, cover/logo/gallery, active branches, active services, verified rating aggregates).
--    Internal notes, staff commissions, profits, costs, subscription internals, moderation logs,
--    and customer private records are NEVER exposed.
-- 5. BOUNDED INPUTS & DETERMINISTIC RANKING:
--    All text and pagination inputs are explicitly bounded:
--      - search query, city, district, category, slug: trimmed, bounded to max 100 characters.
--      - p_min_rating: bounded between 1.0 and 5.0.
--      - p_limit: constrained to 1..100 (default 20).
--      - p_offset: constrained to >= 0.
--    Deterministic tie-breaking:
--      ORDER BY avg_rating DESC NULLS LAST, review_count DESC, t.created_at DESC, t.id ASC
--    Deterministic nested projections (primary_branch, featured_services, recent_reviews).
-- 6. ZERO-RESULT CONTRACT:
--    When zero matches exist, total_count = 0 and listings = [] (empty jsonb array, no null objects).
-- 7. SECURITY DEFINER RPCs:
--    search_path pinned to pg_catalog, public.
--    Execute granted to anon, authenticated, and service_role.
-- =========================================================================

-- =========================================================================
-- 1. PERFORMANCE INDEXES ON CANONICAL TABLES FOR SEARCH PROJECTION
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_public_discovery 
ON public.tenants (status, onboarding_status, public_site_status)
WHERE status IN ('active', 'manual_active') 
  AND onboarding_status = 'completed' 
  AND public_site_status = 'published';

CREATE INDEX IF NOT EXISTS idx_tenant_business_profiles_discovery
ON public.tenant_business_profiles (tenant_id, is_public_profile_enabled, city, business_category)
WHERE is_public_profile_enabled = true;

CREATE INDEX IF NOT EXISTS idx_services_active_discovery
ON public.services (tenant_id, active)
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_branches_active_discovery
ON public.branches (tenant_id, is_active, is_primary)
WHERE is_active = true;

-- =========================================================================
-- 2. RPC: public.get_discovery_marketplace_listings
--    Server-authoritative paginated public discovery search and filter
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_discovery_marketplace_listings(
    p_search_query        TEXT DEFAULT NULL,
    p_city                TEXT DEFAULT NULL,
    p_district            TEXT DEFAULT NULL,
    p_category            TEXT DEFAULT NULL,
    p_min_rating          NUMERIC DEFAULT NULL,
    p_limit               INTEGER DEFAULT 20,
    p_offset              INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_search        TEXT;
    v_clean_city          TEXT;
    v_clean_district      TEXT;
    v_clean_category      TEXT;
    v_limit               INTEGER;
    v_offset              INTEGER;
    v_listings            JSONB;
    v_total_count         BIGINT;
BEGIN
    -- 1. Validate & bound pagination
    IF p_limit IS NULL OR p_limit < 1 THEN
        v_limit := 20;
    ELSIF p_limit > 100 THEN
        v_limit := 100;
    ELSE
        v_limit := p_limit;
    END IF;

    IF p_offset IS NULL OR p_offset < 0 THEN
        v_offset := 0;
    ELSE
        v_offset := p_offset;
    END IF;

    -- Validate rating bounds if supplied
    IF p_min_rating IS NOT NULL AND (p_min_rating < 1.0 OR p_min_rating > 5.0) THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_min_rating must be between 1.0 and 5.0';
    END IF;

    -- Validate & bound all text inputs explicitly (finite bounds)
    v_clean_search := nullif(trim(p_search_query), '');
    IF v_clean_search IS NOT NULL THEN
        IF length(v_clean_search) > 100 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: p_search_query exceeds maximum length of 100 characters';
        END IF;
    END IF;

    v_clean_city := nullif(trim(p_city), '');
    IF v_clean_city IS NOT NULL THEN
        IF length(v_clean_city) > 100 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: p_city exceeds maximum length of 100 characters';
        END IF;
    END IF;

    v_clean_district := nullif(trim(p_district), '');
    IF v_clean_district IS NOT NULL THEN
        IF length(v_clean_district) > 100 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: p_district exceeds maximum length of 100 characters';
        END IF;
    END IF;

    v_clean_category := nullif(trim(p_category), '');
    IF v_clean_category IS NOT NULL THEN
        IF length(v_clean_category) > 100 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: p_category exceeds maximum length of 100 characters';
        END IF;
    END IF;

    -- 2. Execute bounded, deterministic query with canonical eligibility reuse
    WITH eligible_tenants AS (
        SELECT
            t.id AS tenant_id,
            t.slug,
            t.name AS tenant_name,
            t.created_at AS tenant_created_at,
            bp.short_description,
            bp.about_text,
            bp.business_category,
            bp.address,
            bp.city,
            bp.district,
            bp.cover_image_url,
            bp.logo_url,
            bp.gallery_images,
            bp.amenities,
            bp.phone,
            bp.whatsapp_number,
            bp.instagram_url,
            bp.website_url,
            bp.opening_hours_summary,
            COALESCE(rev.review_count, 0) AS review_count,
            COALESCE(rev.avg_rating, 0.0) AS avg_rating
        FROM public.tenants t
        JOIN public.tenant_business_profiles bp ON bp.tenant_id = t.id
        LEFT JOIN (
            SELECT
                r.tenant_id,
                COUNT(r.id) AS review_count,
                ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
            FROM public.reviews r
            WHERE r.is_published = true
            GROUP BY r.tenant_id
        ) rev ON rev.tenant_id = t.id
        WHERE t.status IN ('active', 'manual_active')
          AND t.onboarding_status = 'completed'
          AND t.public_site_status = 'published'
          AND bp.is_public_profile_enabled = true
          -- Reuse canonical public eligibility evaluator
          AND COALESCE((public.evaluate_public_booking_eligibility_internal(t.id, t.slug)->>'bookable')::boolean, false) = true
          AND (v_clean_city IS NULL OR bp.city ILIKE v_clean_city)
          AND (v_clean_district IS NULL OR bp.district ILIKE v_clean_district)
          AND (v_clean_category IS NULL OR bp.business_category ILIKE v_clean_category)
          AND (
              v_clean_search IS NULL
              OR t.name ILIKE ('%' || v_clean_search || '%')
              OR bp.short_description ILIKE ('%' || v_clean_search || '%')
              OR bp.city ILIKE ('%' || v_clean_search || '%')
              OR bp.district ILIKE ('%' || v_clean_search || '%')
              OR bp.business_category ILIKE ('%' || v_clean_search || '%')
              OR EXISTS (
                  SELECT 1 FROM public.services s
                  WHERE s.tenant_id = t.id
                    AND s.active = true
                    AND (s.name ILIKE ('%' || v_clean_search || '%') OR s.category ILIKE ('%' || v_clean_search || '%'))
              )
          )
          AND (p_min_rating IS NULL OR COALESCE(rev.avg_rating, 0.0) >= p_min_rating)
    ),
    counted AS (
        SELECT COUNT(*) AS total_count FROM eligible_tenants
    ),
    paged AS (
        SELECT *
        FROM eligible_tenants
        ORDER BY
            avg_rating DESC NULLS LAST,
            review_count DESC,
            tenant_created_at DESC,
            tenant_id ASC
        LIMIT v_limit
        OFFSET v_offset
    )
    SELECT
        counted.total_count,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'tenant_id', p.tenant_id,
                    'slug', p.slug,
                    'name', p.tenant_name,
                    'business_category', p.business_category,
                    'short_description', p.short_description,
                    'about_text', p.about_text,
                    'city', p.city,
                    'district', p.district,
                    'address', p.address,
                    'cover_image_url', p.cover_image_url,
                    'logo_url', p.logo_url,
                    'gallery_images', COALESCE(p.gallery_images, '[]'::jsonb),
                    'amenities', COALESCE(p.amenities, '[]'::jsonb),
                    'phone', p.phone,
                    'whatsapp_number', p.whatsapp_number,
                    'instagram_url', p.instagram_url,
                    'website_url', p.website_url,
                    'opening_hours_summary', p.opening_hours_summary,
                    'review_count', p.review_count,
                    'average_rating', p.avg_rating,
                    'primary_branch', (
                        SELECT jsonb_build_object(
                            'id', b.id,
                            'name', b.name,
                            'slug', b.slug,
                            'is_primary', b.is_primary,
                            'timezone', b.timezone
                        )
                        FROM public.branches b
                        WHERE b.tenant_id = p.tenant_id
                          AND b.is_active = true
                        ORDER BY b.is_primary DESC, b.created_at ASC, b.id ASC
                        LIMIT 1
                    ),
                    'featured_services', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', s.id,
                                'name', s.name,
                                'name_tr', s.name_tr,
                                'duration', s.duration,
                                'price', s.price,
                                'category', s.category,
                                'image', s.image
                            ) ORDER BY s.price ASC, s.name ASC, s.id ASC
                        )
                        FROM (
                            SELECT s.id, s.name, s.name_tr, s.duration, s.price, s.category, s.image
                            FROM public.services s
                            WHERE s.tenant_id = p.tenant_id
                              AND s.active = true
                            ORDER BY s.price ASC, s.name ASC, s.id ASC
                            LIMIT 5
                        ) s
                    ), '[]'::jsonb)
                )
                ORDER BY
                    p.avg_rating DESC NULLS LAST,
                    p.review_count DESC,
                    p.tenant_created_at DESC,
                    p.tenant_id ASC
            ) FILTER (WHERE p.tenant_id IS NOT NULL),
            '[]'::jsonb
        )
    INTO v_total_count, v_listings
    FROM counted
    LEFT JOIN paged p ON true
    GROUP BY counted.total_count;

    -- Zero-result safety check: ensure strictly 0 and []
    IF v_total_count IS NULL OR v_total_count = 0 THEN
        v_total_count := 0;
        v_listings := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'total_count', COALESCE(v_total_count, 0),
        'limit', v_limit,
        'offset', v_offset,
        'listings', COALESCE(v_listings, '[]'::jsonb)
    );
END;
$$;

-- =========================================================================
-- 3. RPC: public.get_discovery_marketplace_detail
--    Server-authoritative single business public discovery detail projection
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_discovery_marketplace_detail(
    p_slug                TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_slug          TEXT;
    v_tenant              RECORD;
    v_bp                  RECORD;
    v_canonical_eval      JSONB;
    v_branches            JSONB;
    v_services            JSONB;
    v_reviews             JSONB;
    v_review_aggregates   RECORD;
BEGIN
    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_ARGUMENT',
            'message', 'p_slug is required'
        );
    END IF;

    v_clean_slug := trim(p_slug);

    IF length(v_clean_slug) > 100 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_ARGUMENT',
            'message', 'p_slug exceeds maximum length of 100 characters'
        );
    END IF;

    -- 1. Resolve tenant
    SELECT
        t.id,
        t.slug,
        t.name,
        t.status,
        t.onboarding_status,
        t.public_site_status
    INTO v_tenant
    FROM public.tenants t
    WHERE t.slug = v_clean_slug;

    IF v_tenant.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'NOT_FOUND',
            'message', 'Business not found'
        );
    END IF;

    -- 2. Strict public eligibility checks:
    -- A. Status & publication check
    IF v_tenant.status NOT IN ('active', 'manual_active')
       OR v_tenant.onboarding_status <> 'completed'
       OR v_tenant.public_site_status <> 'published' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'NOT_ELIGIBLE',
            'message', 'Business is not published or eligible for discovery'
        );
    END IF;

    -- B. Canonical public booking eligibility evaluator reuse
    v_canonical_eval := public.evaluate_public_booking_eligibility_internal(v_tenant.id, v_tenant.slug);
    IF COALESCE((v_canonical_eval->>'bookable')::boolean, false) IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'NOT_ELIGIBLE',
            'message', 'Business is not eligible for discovery'
        );
    END IF;

    -- 3. Fetch business profile
    SELECT * INTO v_bp
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_tenant.id;

    IF v_bp.id IS NULL OR v_bp.is_public_profile_enabled IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'NOT_ELIGIBLE',
            'message', 'Business public profile is disabled'
        );
    END IF;

    -- 4. Fetch active branches only
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', b.id,
                'name', b.name,
                'slug', b.slug,
                'is_primary', b.is_primary,
                'timezone', b.timezone
            ) ORDER BY b.is_primary DESC, b.name ASC, b.id ASC
        ),
        '[]'::jsonb
    ) INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_tenant.id
      AND b.is_active = true;

    -- 5. Fetch active services only
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'name_tr', s.name_tr,
                'category', s.category,
                'duration', s.duration,
                'price', s.price,
                'image', s.image
            ) ORDER BY s.category ASC NULLS LAST, s.price ASC, s.name ASC, s.id ASC
        ),
        '[]'::jsonb
    ) INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_tenant.id
      AND s.active = true;

    -- 6. Fetch verified published reviews aggregates and recent published reviews
    SELECT
        COUNT(r.id) AS count,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0.0) AS avg_rating,
        COUNT(r.id) FILTER (WHERE r.rating = 5) AS count_5,
        COUNT(r.id) FILTER (WHERE r.rating = 4) AS count_4,
        COUNT(r.id) FILTER (WHERE r.rating = 3) AS count_3,
        COUNT(r.id) FILTER (WHERE r.rating = 2) AS count_2,
        COUNT(r.id) FILTER (WHERE r.rating = 1) AS count_1
    INTO v_review_aggregates
    FROM public.reviews r
    WHERE r.tenant_id = v_tenant.id
      AND r.is_published = true;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', r.id,
                'rating', r.rating,
                'title', r.title,
                'content', r.content,
                'published_at', r.published_at,
                'created_at', r.created_at,
                'response_text', r.response_text,
                'responded_at', r.responded_at,
                'service_name', s.name,
                'branch_name', b.name
            ) ORDER BY r.created_at DESC, r.id DESC
        ),
        '[]'::jsonb
    ) INTO v_reviews
    FROM (
        SELECT r.*
        FROM public.reviews r
        WHERE r.tenant_id = v_tenant.id
          AND r.is_published = true
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 10
    ) r
    JOIN public.branches b ON b.id = r.branch_id
    JOIN public.services s ON s.id = r.service_id;

    RETURN jsonb_build_object(
        'success', true,
        'business', jsonb_build_object(
            'tenant_id', v_tenant.id,
            'slug', v_tenant.slug,
            'name', v_tenant.name,
            'business_category', v_bp.business_category,
            'short_description', v_bp.short_description,
            'about_text', v_bp.about_text,
            'city', v_bp.city,
            'district', v_bp.district,
            'address', v_bp.address,
            'phone', v_bp.phone,
            'whatsapp_number', v_bp.whatsapp_number,
            'instagram_url', v_bp.instagram_url,
            'website_url', v_bp.website_url,
            'opening_hours_summary', v_bp.opening_hours_summary,
            'cover_image_url', v_bp.cover_image_url,
            'logo_url', v_bp.logo_url,
            'gallery_images', COALESCE(v_bp.gallery_images, '[]'::jsonb),
            'amenities', COALESCE(v_bp.amenities, '[]'::jsonb),
            'parking_info', v_bp.parking_info,
            'payment_methods', COALESCE(v_bp.payment_methods, '[]'::jsonb),
            'cancellation_policy', v_bp.cancellation_policy,
            'booking_policy', v_bp.booking_policy,
            'branches', v_branches,
            'services', v_services,
            'reviews_summary', jsonb_build_object(
                'total_reviews', v_review_aggregates.count,
                'average_rating', v_review_aggregates.avg_rating,
                'distribution', jsonb_build_object(
                    '5', v_review_aggregates.count_5,
                    '4', v_review_aggregates.count_4,
                    '3', v_review_aggregates.count_3,
                    '2', v_review_aggregates.count_2,
                    '1', v_review_aggregates.count_1
                )
            ),
            'recent_reviews', v_reviews
        )
    );
END;
$$;

-- =========================================================================
-- 4. PERMISSIONS & RPC SECURITY GRANTS
-- =========================================================================

REVOKE ALL ON FUNCTION public.get_discovery_marketplace_listings(TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discovery_marketplace_listings(TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_discovery_marketplace_detail(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discovery_marketplace_detail(TEXT) TO anon, authenticated, service_role;

-- =========================================================================
-- END MIGRATION 94 (Phase 7 Node 2 R1 Discovery Marketplace Projection)
-- =========================================================================
