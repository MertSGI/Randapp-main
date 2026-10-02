-- =========================================================================
-- MIGRATION 20261004_phase7_node1_verified_reviews_foundation.sql
-- Description: Phase 7 Node 1 — Verified Reviews Foundation
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 93
-- Authority: LARI-PROGRAM-V2-PHASE6-COMPLETE-PHASE7-NODE1-20261004-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuses canonical public.tenants, public.branches, public.staff,
--    public.users_profile, public.customers, public.appointments,
--    public.services, public.audit_events.
-- 2. VERIFIED REVIEW ELIGIBILITY:
--    Reviews can ONLY be created for appointments with status = 'completed'.
--    Enforced server-side in RPC; client cannot bypass.
-- 3. DUPLICATE REVIEW PROTECTION:
--    Unique constraint on (tenant_id, appointment_id, customer_id) prevents
--    multiple reviews for the same appointment by the same customer.
-- 4. SERVER-AUTHORITATIVE MUTATION:
--    Direct table DML revoked from PUBLIC, anon, and authenticated.
--    SECURITY DEFINER RPC enforces caller identity and eligibility.
-- 5. DETERMINISTIC TENANT ISOLATION:
--    All queries filtered by caller's tenant_id derived from auth.uid().
--    Cross-tenant access raises CROSS_TENANT_VIOLATION exception.
-- 6. IDEMPOTENT MUTATIONS:
--    Unique (tenant_id, idempotency_key) on review creation prevents double-submission.
-- 7. BOUNDED READ CONTRACT:
--    Public read RPC returns only published reviews with aggregated ratings.
--    Staff/owner read RPC returns all reviews with full detail for moderation.
-- 8. RLS DEFENSE-IN-DEPTH:
--    RLS enabled on reviews table with tenant-scoped policies as safety net.
-- =========================================================================

-- =========================================================================
-- 1. TABLE: public.reviews (Verified Reviews Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    appointment_id      UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    customer_id         UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    service_id          UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    staff_id            UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    rating              SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title               TEXT NULL CHECK (title IS NULL OR length(trim(title)) <= 160),
    content             TEXT NULL CHECK (content IS NULL OR length(trim(content)) <= 4000),
    is_published        BOOLEAN NOT NULL DEFAULT false,
    published_at        TIMESTAMPTZ NULL,
    response_text       TEXT NULL CHECK (response_text IS NULL OR length(trim(response_text)) <= 4000),
    responded_by        UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    responded_by_user_id UUID NULL REFERENCES public.users_profile(id) ON DELETE SET NULL,
    responded_at        TIMESTAMPTZ NULL,
    idempotency_key     TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_reviews_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_reviews_tenant_appointment_customer UNIQUE (tenant_id, appointment_id, customer_id),
    CONSTRAINT uq_reviews_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant_published ON public.reviews(tenant_id, is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_appointment ON public.reviews(tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_customer ON public.reviews(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_staff ON public.reviews(tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_reviews_branch_published ON public.reviews(branch_id, is_published);

CREATE TRIGGER update_reviews_modtime
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant owners and staff can read all reviews in their tenant
CREATE POLICY "Tenant staff read reviews" ON public.reviews
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (
            up.role = 'super_admin'
            OR (
              up.role IN ('tenant_owner', 'staff')
              AND up.tenant_id = reviews.tenant_id
            )
          )
    )
);

-- RLS: Public can read only published reviews
CREATE POLICY "Public read published reviews" ON public.reviews
FOR SELECT TO anon
USING (is_published = true);

-- RLS: No direct INSERT/UPDATE/DELETE - all via RPC
REVOKE ALL ON public.reviews FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 2. TABLE: public.review_idempotency_keys (Idempotency tracking)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.review_idempotency_keys (
    idempotency_key     TEXT NOT NULL,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    review_id           UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    PRIMARY KEY (tenant_id, idempotency_key)
);

ALTER TABLE public.review_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff read idempotency" ON public.review_idempotency_keys
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (
            up.role = 'super_admin'
            OR (
              up.role IN ('tenant_owner', 'staff')
              AND up.tenant_id = review_idempotency_keys.tenant_id
            )
          )
    )
);

REVOKE ALL ON public.review_idempotency_keys FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. RPC: public.create_verified_review
--     Server-authoritative review creation with eligibility verification
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_verified_review(
    p_appointment_id      UUID,
    p_rating              SMALLINT,
    p_title               TEXT DEFAULT NULL,
    p_content             TEXT DEFAULT NULL,
    p_idempotency_key     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid          UUID := auth.uid();
    v_customer            RECORD;
    v_appointment         RECORD;
    v_review_id           UUID;
    v_idempotency_clean   TEXT;
    v_title_clean         TEXT;
    v_content_clean       TEXT;
BEGIN
    -- Authentication gate
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Validate idempotency key presence and bounds
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: idempotency_key is required.';
    END IF;

    v_idempotency_clean := trim(p_idempotency_key);
    IF length(v_idempotency_clean) > 200 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: idempotency_key exceeds maximum length of 200 characters.';
    END IF;

    -- Validate rating range
    IF p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Rating must be between 1 and 5.';
    END IF;

    -- Validate bounded text inputs
    v_title_clean := nullif(trim(p_title), '');
    IF v_title_clean IS NOT NULL AND length(v_title_clean) > 160 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Title exceeds maximum length of 160 characters.';
    END IF;

    v_content_clean := nullif(trim(p_content), '');
    IF v_content_clean IS NOT NULL AND length(v_content_clean) > 4000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Content exceeds maximum length of 4000 characters.';
    END IF;

    -- Fetch appointment with all necessary joins for eligibility verification
    SELECT a.*, s.name AS service_name, b.name AS branch_name
    INTO v_appointment
    FROM public.appointments a
    JOIN public.services s ON s.id = a.service_id
    JOIN public.branches b ON b.id = a.branch_id
    WHERE a.id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Appointment not found.';
    END IF;

    -- Derive caller customer identity deterministically bound to appointment's tenant
    SELECT c.* INTO v_customer
    FROM public.customers c
    WHERE c.user_profile_id = v_caller_uid
      AND c.tenant_id = v_appointment.tenant_id;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no customer profile in this tenant.';
    END IF;

    -- Eligibility gate: appointment must belong to caller
    IF v_appointment.customer_id <> v_customer.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Appointment does not belong to caller.';
    END IF;

    -- Tenant isolation: verify appointment belongs to customer's tenant
    IF v_appointment.tenant_id <> v_customer.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Appointment not in caller tenant.';
    END IF;

    -- Eligibility gate: appointment must be COMPLETED
    IF v_appointment.status <> 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'appointment_not_completed',
            'message', 'Reviews can only be submitted for completed appointments.',
            'appointment_status', v_appointment.status
        );
    END IF;

    -- Advisory lock to serialize review creation per appointment BEFORE replay / duplicate check
    PERFORM pg_advisory_xact_lock(hashtext('review:' || p_appointment_id::text));

    -- Check idempotency key first: same tenant + same idempotency key returns original review with idempotent_replay=true
    IF EXISTS (
        SELECT 1 FROM public.review_idempotency_keys
        WHERE tenant_id = v_customer.tenant_id
          AND idempotency_key = v_idempotency_clean
    ) THEN
        SELECT r.id INTO v_review_id
        FROM public.reviews r
        JOIN public.review_idempotency_keys k ON k.review_id = r.id
        WHERE k.tenant_id = v_customer.tenant_id
          AND k.idempotency_key = v_idempotency_clean;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'review_id', v_review_id,
            'reason_code', 'ok'
        );
    END IF;

    -- Check duplicate review: same appointment/customer + different key returns duplicate_review
    IF EXISTS (
        SELECT 1 FROM public.reviews
        WHERE tenant_id = v_customer.tenant_id
          AND appointment_id = p_appointment_id
          AND customer_id = v_customer.id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'duplicate_review',
            'message', 'A review for this appointment by this customer already exists.'
        );
    END IF;

    -- Insert review (initially unpublished, requires moderation)
    INSERT INTO public.reviews (
        tenant_id,
        branch_id,
        appointment_id,
        customer_id,
        service_id,
        staff_id,
        rating,
        title,
        content,
        is_published,
        idempotency_key
    ) VALUES (
        v_customer.tenant_id,
        v_appointment.branch_id,
        p_appointment_id,
        v_customer.id,
        v_appointment.service_id,
        v_appointment.staff_id,
        p_rating,
        v_title_clean,
        v_content_clean,
        false,  -- published after moderation
        v_idempotency_clean
    ) RETURNING id INTO v_review_id;

    -- Record idempotency key
    INSERT INTO public.review_idempotency_keys (
        tenant_id,
        idempotency_key,
        review_id
    ) VALUES (
        v_customer.tenant_id,
        v_idempotency_clean,
        v_review_id
    );

    -- Audit event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_customer.tenant_id::text,
        v_caller_uid::text,
        'customer',
        'review_created',
        'reviews',
        v_review_id::text,
        jsonb_build_object(
            'review_id', v_review_id,
            'appointment_id', p_appointment_id,
            'rating', p_rating,
            'branch_id', v_appointment.branch_id,
            'service_id', v_appointment.service_id,
            'staff_id', v_appointment.staff_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'review_id', v_review_id,
        'reason_code', 'ok',
        'message', 'Review submitted for moderation.'
    );

EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001', 'P0002', 'P0003') THEN
        RAISE;
    ELSE
        RAISE EXCEPTION 'INTERNAL_ERROR: %', SQLERRM;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_verified_review(UUID, SMALLINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_verified_review(UUID, SMALLINT, TEXT, TEXT, TEXT) TO authenticated;

-- =========================================================================
-- 4. RPC: public.get_public_reviews (Public read contract - published only)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_reviews(
    p_tenant_slug         TEXT,
    p_branch_id           UUID DEFAULT NULL,
    p_service_id          UUID DEFAULT NULL,
    p_staff_id            UUID DEFAULT NULL,
    p_min_rating          SMALLINT DEFAULT NULL,
    p_limit               INTEGER DEFAULT 20,
    p_offset              INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tenant_id           UUID;
    v_branch_check        RECORD;
    v_service_check       RECORD;
    v_staff_check         RECORD;
    v_reviews             JSONB;
    v_aggregate           JSONB;
BEGIN
    -- Validate input bounds
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_limit must be between 1 and 100.';
    END IF;

    IF p_offset < 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_offset must be greater than or equal to 0.';
    END IF;

    IF p_min_rating IS NOT NULL AND (p_min_rating < 1 OR p_min_rating > 5) THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_min_rating must be between 1 and 5.';
    END IF;

    -- Resolve tenant by slug
    SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = p_tenant_slug;
    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Validate branch if provided
    IF p_branch_id IS NOT NULL THEN
        SELECT * INTO v_branch_check FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id;
        IF v_branch_check.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
        END IF;
    END IF;

    -- Validate service if provided
    IF p_service_id IS NOT NULL THEN
        SELECT * INTO v_service_check FROM public.services WHERE id = p_service_id AND tenant_id = v_tenant_id;
        IF v_service_check.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'service_not_found');
        END IF;
    END IF;

    -- Validate staff if provided
    IF p_staff_id IS NOT NULL THEN
        SELECT * INTO v_staff_check FROM public.staff WHERE id = p_staff_id AND tenant_id = v_tenant_id;
        IF v_staff_check.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'staff_not_found');
        END IF;
    END IF;

    -- Fetch paginated review rows via subquery / CTE before json aggregation
    WITH paged_reviews AS (
        SELECT
            r.id,
            r.branch_id,
            b.name AS branch_name,
            r.service_id,
            s.name AS service_name,
            r.staff_id,
            st.name AS staff_name,
            r.rating,
            r.title,
            r.content,
            r.created_at
        FROM public.reviews r
        JOIN public.branches b ON b.id = r.branch_id
        JOIN public.services s ON s.id = r.service_id
        JOIN public.staff st ON st.id = r.staff_id
        WHERE r.tenant_id = v_tenant_id
          AND r.is_published = true
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
          AND (p_service_id IS NULL OR r.service_id = p_service_id)
          AND (p_staff_id IS NULL OR r.staff_id = p_staff_id)
          AND (p_min_rating IS NULL OR r.rating >= p_min_rating)
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', pr.id,
            'branch_id', pr.branch_id,
            'branch_name', pr.branch_name,
            'service_id', pr.service_id,
            'service_name', pr.service_name,
            'staff_id', pr.staff_id,
            'staff_name', pr.staff_name,
            'rating', pr.rating,
            'title', pr.title,
            'content', pr.content,
            'created_at', pr.created_at
        )
    ), '[]'::jsonb)
    INTO v_reviews
    FROM paged_reviews pr;

    -- Aggregate statistics over complete filtered set (unaffected by LIMIT / OFFSET)
    SELECT jsonb_build_object(
        'total_count', COUNT(*),
        'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
        'rating_distribution', jsonb_build_object(
            '5', COUNT(*) FILTER (WHERE rating = 5),
            '4', COUNT(*) FILTER (WHERE rating = 4),
            '3', COUNT(*) FILTER (WHERE rating = 3),
            '2', COUNT(*) FILTER (WHERE rating = 2),
            '1', COUNT(*) FILTER (WHERE rating = 1)
        )
    ) INTO v_aggregate
    FROM public.reviews
    WHERE tenant_id = v_tenant_id
      AND is_published = true
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_service_id IS NULL OR service_id = p_service_id)
      AND (p_staff_id IS NULL OR staff_id = p_staff_id)
      AND (p_min_rating IS NULL OR rating >= p_min_rating);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'reviews', v_reviews,
        'aggregate', v_aggregate
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_reviews(TEXT, UUID, UUID, UUID, SMALLINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_reviews(TEXT, UUID, UUID, UUID, SMALLINT, INTEGER, INTEGER) TO anon, authenticated;

-- =========================================================================
-- 5. RPC: public.get_tenant_reviews (Staff/Owner read contract - all reviews)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_reviews(
    p_branch_id           UUID DEFAULT NULL,
    p_service_id          UUID DEFAULT NULL,
    p_staff_id            UUID DEFAULT NULL,
    p_customer_id         UUID DEFAULT NULL,
    p_is_published        BOOLEAN DEFAULT NULL,
    p_min_rating          SMALLINT DEFAULT NULL,
    p_limit               INTEGER DEFAULT 50,
    p_offset              INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid          UUID := auth.uid();
    v_up                  RECORD;
    v_staff               RECORD;
    v_tenant_id           UUID;
    v_reviews             JSONB;
    v_aggregate           JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Validate input bounds
    IF p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_limit must be between 1 and 100.';
    END IF;

    IF p_offset < 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_offset must be greater than or equal to 0.';
    END IF;

    IF p_min_rating IS NOT NULL AND (p_min_rating < 1 OR p_min_rating > 5) THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_min_rating must be between 1 and 5.';
    END IF;

    -- Derive caller active user profile deterministically
    SELECT up.* INTO v_up
    FROM public.users_profile up
    WHERE up.id = v_caller_uid
      AND up.active = true;

    IF v_up.id IS NULL OR v_up.tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active tenant identity.';
    END IF;

    v_tenant_id := v_up.tenant_id;

    -- Verify caller authority in this tenant (staff or tenant_owner or super_admin)
    IF v_up.role = 'tenant_owner' OR v_up.role = 'super_admin' THEN
        -- Owner has direct tenant authority without requiring a staff entity
        NULL;
    ELSIF v_up.role = 'staff' THEN
        SELECT s.* INTO v_staff
        FROM public.staff s
        WHERE s.user_profile_id = v_caller_uid
          AND s.tenant_id = v_tenant_id
          AND s.active = true;

        IF v_staff.id IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
        END IF;
    ELSE
        RAISE EXCEPTION 'FORBIDDEN: Caller role % is not authorized for tenant reviews.', v_up.role;
    END IF;

    -- Validate branch if provided (tenant fail-closed)
    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
        END IF;
    END IF;

    -- Validate service if provided (tenant fail-closed)
    IF p_service_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Service not found or cross-tenant access denied.';
        END IF;
    END IF;

    -- Validate staff if provided (tenant fail-closed)
    IF p_staff_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Staff not found or cross-tenant access denied.';
        END IF;
    END IF;

    -- Validate customer if provided (tenant fail-closed)
    IF p_customer_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = v_tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Customer not found or cross-tenant access denied.';
        END IF;
    END IF;

    -- Fetch paginated review rows via subquery / CTE before json aggregation
    WITH paged_reviews AS (
        SELECT
            r.id,
            r.branch_id,
            b.name AS branch_name,
            r.appointment_id,
            a.appointment_date,
            r.customer_id,
            c.name AS customer_name,
            c.email AS customer_email,
            r.service_id,
            s.name AS service_name,
            r.staff_id,
            st.name AS staff_name,
            r.rating,
            r.title,
            r.content,
            r.is_published,
            r.published_at,
            r.response_text,
            r.responded_by,
            r.responded_by_user_id,
            r.responded_at,
            r.created_at,
            r.updated_at
        FROM public.reviews r
        JOIN public.branches b ON b.id = r.branch_id
        JOIN public.appointments a ON a.id = r.appointment_id
        JOIN public.customers c ON c.id = r.customer_id
        JOIN public.services s ON s.id = r.service_id
        JOIN public.staff st ON st.id = r.staff_id
        WHERE r.tenant_id = v_tenant_id
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
          AND (p_service_id IS NULL OR r.service_id = p_service_id)
          AND (p_staff_id IS NULL OR r.staff_id = p_staff_id)
          AND (p_customer_id IS NULL OR r.customer_id = p_customer_id)
          AND (p_is_published IS NULL OR r.is_published = p_is_published)
          AND (p_min_rating IS NULL OR r.rating >= p_min_rating)
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', pr.id,
            'branch_id', pr.branch_id,
            'branch_name', pr.branch_name,
            'appointment_id', pr.appointment_id,
            'appointment_date', pr.appointment_date,
            'customer_id', pr.customer_id,
            'customer_name', pr.customer_name,
            'customer_email', pr.customer_email,
            'service_id', pr.service_id,
            'service_name', pr.service_name,
            'staff_id', pr.staff_id,
            'staff_name', pr.staff_name,
            'rating', pr.rating,
            'title', pr.title,
            'content', pr.content,
            'is_published', pr.is_published,
            'published_at', pr.published_at,
            'response_text', pr.response_text,
            'responded_by', pr.responded_by,
            'responded_by_user_id', pr.responded_by_user_id,
            'responded_at', pr.responded_at,
            'created_at', pr.created_at,
            'updated_at', pr.updated_at
        )
    ), '[]'::jsonb)
    INTO v_reviews
    FROM paged_reviews pr;

    -- Aggregate statistics over complete filtered set (unaffected by LIMIT / OFFSET)
    SELECT jsonb_build_object(
        'total_count', COUNT(*),
        'published_count', COUNT(*) FILTER (WHERE is_published = true),
        'pending_count', COUNT(*) FILTER (WHERE is_published = false),
        'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
        'rating_distribution', jsonb_build_object(
            '5', COUNT(*) FILTER (WHERE rating = 5),
            '4', COUNT(*) FILTER (WHERE rating = 4),
            '3', COUNT(*) FILTER (WHERE rating = 3),
            '2', COUNT(*) FILTER (WHERE rating = 2),
            '1', COUNT(*) FILTER (WHERE rating = 1)
        )
    ) INTO v_aggregate
    FROM public.reviews
    WHERE tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (p_service_id IS NULL OR service_id = p_service_id)
      AND (p_staff_id IS NULL OR staff_id = p_staff_id)
      AND (p_customer_id IS NULL OR customer_id = p_customer_id)
      AND (p_is_published IS NULL OR is_published = p_is_published)
      AND (p_min_rating IS NULL OR rating >= p_min_rating);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'reviews', v_reviews,
        'aggregate', v_aggregate
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_reviews(UUID, UUID, UUID, UUID, BOOLEAN, SMALLINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_reviews(UUID, UUID, UUID, UUID, BOOLEAN, SMALLINT, INTEGER, INTEGER) TO authenticated;

-- =========================================================================
-- 6. RPC: public.moderate_review (Staff/Owner publish/unpublish/respond)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.moderate_review(
    p_review_id           UUID,
    p_action              TEXT,  -- 'publish', 'unpublish', 'respond'
    p_response_text       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid          UUID := auth.uid();
    v_up                  RECORD;
    v_staff               RECORD;
    v_staff_id            UUID := NULL;
    v_tenant_id           UUID;
    v_actor_role          TEXT;
    v_review              RECORD;
    v_response_clean      TEXT;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive caller active user profile deterministically
    SELECT up.* INTO v_up
    FROM public.users_profile up
    WHERE up.id = v_caller_uid
      AND up.active = true;

    IF v_up.id IS NULL OR v_up.tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active tenant identity.';
    END IF;

    v_tenant_id := v_up.tenant_id;

    -- Resolve authority and staff foreign key
    IF v_up.role = 'tenant_owner' OR v_up.role = 'super_admin' THEN
        v_actor_role := 'tenant_owner';
        -- Try to resolve staff entity if one exists for the owner, otherwise NULL
        SELECT s.id INTO v_staff_id
        FROM public.staff s
        WHERE s.user_profile_id = v_caller_uid
          AND s.tenant_id = v_tenant_id
          AND s.active = true;
    ELSIF v_up.role = 'staff' THEN
        v_actor_role := 'staff';
        SELECT s.id INTO v_staff_id
        FROM public.staff s
        WHERE s.user_profile_id = v_caller_uid
          AND s.tenant_id = v_tenant_id
          AND s.active = true;

        IF v_staff_id IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
        END IF;
    ELSE
        RAISE EXCEPTION 'FORBIDDEN: Caller role % is not authorized to moderate reviews.', v_up.role;
    END IF;

    -- Fetch review with tenant check
    SELECT r.* INTO v_review
    FROM public.reviews r
    WHERE r.id = p_review_id;

    IF v_review.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Review not found.';
    END IF;

    IF v_review.tenant_id <> v_tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Review not in caller tenant.';
    END IF;

    -- Validate action
    IF p_action NOT IN ('publish', 'unpublish', 'respond') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Action must be publish, unpublish, or respond.';
    END IF;

    -- Execute action
    CASE p_action
        WHEN 'publish' THEN
            IF v_review.is_published THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'already_published');
            END IF;
            UPDATE public.reviews
            SET is_published = true,
                published_at = now(),
                updated_at = now()
            WHERE id = p_review_id;

        WHEN 'unpublish' THEN
            IF NOT v_review.is_published THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'already_unpublished');
            END IF;
            UPDATE public.reviews
            SET is_published = false,
                published_at = NULL,
                updated_at = now()
            WHERE id = p_review_id;

        WHEN 'respond' THEN
            IF v_review.response_text IS NOT NULL THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'already_responded');
            END IF;

            IF p_response_text IS NULL OR trim(p_response_text) = '' THEN
                RAISE EXCEPTION 'INVALID_ARGUMENT: Response text is required for respond action.';
            END IF;

            v_response_clean := trim(p_response_text);
            IF length(v_response_clean) > 4000 THEN
                RAISE EXCEPTION 'INVALID_ARGUMENT: Response text exceeds maximum length of 4000 characters.';
            END IF;

            UPDATE public.reviews
            SET response_text = v_response_clean,
                responded_by = v_staff_id,
                responded_by_user_id = v_caller_uid,
                responded_at = now(),
                updated_at = now()
            WHERE id = p_review_id;
    END CASE;

    -- Audit event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_tenant_id::text,
        v_caller_uid::text,
        v_actor_role,
        'review_moderated',
        'reviews',
        p_review_id::text,
        jsonb_build_object(
            'action', p_action,
            'previous_published', v_review.is_published,
            'new_published', CASE WHEN p_action = 'publish' THEN true WHEN p_action = 'unpublish' THEN false ELSE v_review.is_published END
        )
    );

    RETURN jsonb_build_object('success', true, 'reason_code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_review(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review(UUID, TEXT, TEXT) TO authenticated;

-- =========================================================================
-- 7. TABLE GRANTS / REVOKES (Server-Authoritative Direct Access Model)
-- =========================================================================

-- Direct table DML revoked from PUBLIC, anon, authenticated
-- Only service_role (server-side RPCs) may mutate/read directly
REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.review_idempotency_keys FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.reviews TO service_role;
GRANT SELECT, INSERT ON TABLE public.review_idempotency_keys TO service_role;