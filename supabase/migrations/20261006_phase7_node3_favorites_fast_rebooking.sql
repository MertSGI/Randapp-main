-- =========================================================================
-- MIGRATION 20261006_phase7_node3_favorites_fast_rebooking.sql
-- Description: Phase 7 Node 3 R1 - Favorites and fast-rebooking server foundation
-- Authority: LARI-P7-N3-R1-IMPLEMENTATION-20261006-01
-- Production: NO_GO
--
-- This migration adds only:
--   1. an authenticated user's relationship to an existing canonical tenant;
--   2. a manage-token-authorized projection of current booking inputs.
--
-- It does not create customer, business, service, staff, or booking truth. It
-- does not create appointments. A fast-rebooking caller must select a current
-- slot through evaluate_booking_slot and create the appointment through the
-- canonical create_public_booking transaction.
-- =========================================================================

-- =========================================================================
-- 1. FAVORITES RELATIONSHIP
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.customer_favorites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_customer_favorites_user_tenant UNIQUE (customer_user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_user_id
    ON public.customer_favorites(customer_user_id);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_tenant_id
    ON public.customer_favorites(tenant_id);

ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_favorites_select_own ON public.customer_favorites;
CREATE POLICY customer_favorites_select_own
    ON public.customer_favorites
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL AND customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_favorites_insert_own ON public.customer_favorites;
CREATE POLICY customer_favorites_insert_own
    ON public.customer_favorites
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_favorites_delete_own ON public.customer_favorites;
CREATE POLICY customer_favorites_delete_own
    ON public.customer_favorites
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) IS NOT NULL AND customer_user_id = (SELECT auth.uid()));

-- Browser roles use the bounded RPCs below. They cannot supply an arbitrary
-- customer_user_id through direct table mutation.
REVOKE ALL ON TABLE public.customer_favorites FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_favorites TO service_role;

-- Idempotently establish or remove the caller's relationship to a currently
-- public, canonically bookable business. Removal remains possible after a
-- business becomes unavailable so stale relationships can always be cleared.
CREATE OR REPLACE FUNCTION public.set_customer_favorite(
    p_tenant_id  UUID,
    p_is_favorite BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          UUID;
    v_favorite_id      UUID;
    v_target_eligible  BOOLEAN := false;
    v_action           TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'UNAUTHENTICATED');
    END IF;

    IF p_tenant_id IS NULL OR p_is_favorite IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_ARGUMENTS');
    END IF;

    IF p_is_favorite THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.tenants t
            JOIN public.tenant_business_profiles bp ON bp.tenant_id = t.id
            WHERE t.id = p_tenant_id
              AND t.status IN ('active', 'manual_active')
              AND t.onboarding_status = 'completed'
              AND t.public_site_status = 'published'
              AND bp.is_public_profile_enabled IS TRUE
              AND COALESCE(
                    (public.evaluate_public_booking_eligibility_internal(t.id, t.slug)->>'bookable')::BOOLEAN,
                    false
                  ) IS TRUE
        ) INTO v_target_eligible;

        IF NOT v_target_eligible THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'TARGET_NOT_ELIGIBLE');
        END IF;

        INSERT INTO public.customer_favorites (customer_user_id, tenant_id)
        VALUES (v_user_id, p_tenant_id)
        ON CONFLICT (customer_user_id, tenant_id) DO NOTHING
        RETURNING id INTO v_favorite_id;

        IF v_favorite_id IS NULL THEN
            SELECT cf.id
            INTO v_favorite_id
            FROM public.customer_favorites cf
            WHERE cf.customer_user_id = v_user_id
              AND cf.tenant_id = p_tenant_id;
            v_action := 'UNCHANGED';
        ELSE
            v_action := 'ADDED';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'OK',
            'action', v_action,
            'favorite_id', v_favorite_id,
            'is_favorite', true
        );
    END IF;

    DELETE FROM public.customer_favorites cf
    WHERE cf.customer_user_id = v_user_id
      AND cf.tenant_id = p_tenant_id
    RETURNING cf.id INTO v_favorite_id;

    v_action := CASE WHEN v_favorite_id IS NULL THEN 'UNCHANGED' ELSE 'REMOVED' END;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'OK',
        'action', v_action,
        'favorite_id', v_favorite_id,
        'is_favorite', false
    );
END;
$$;

-- Return only the caller's relations whose targets remain public and
-- canonically bookable. All descriptive fields are projected from current
-- canonical tenant truth; none are copied into customer_favorites.
CREATE OR REPLACE FUNCTION public.get_customer_favorites(
    p_limit  INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id     UUID;
    v_eff_limit   INTEGER;
    v_eff_offset  INTEGER;
    v_favorites   JSONB;
    v_total       INTEGER;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'UNAUTHENTICATED');
    END IF;

    v_eff_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_eff_offset := GREATEST(COALESCE(p_offset, 0), 0);

    WITH eligible AS (
        SELECT cf.id, cf.tenant_id, cf.created_at, t.slug, t.name
        FROM public.customer_favorites cf
        JOIN public.tenants t ON t.id = cf.tenant_id
        JOIN public.tenant_business_profiles bp ON bp.tenant_id = t.id
        WHERE cf.customer_user_id = v_user_id
          AND t.status IN ('active', 'manual_active')
          AND t.onboarding_status = 'completed'
          AND t.public_site_status = 'published'
          AND bp.is_public_profile_enabled IS TRUE
          AND COALESCE(
                (public.evaluate_public_booking_eligibility_internal(t.id, t.slug)->>'bookable')::BOOLEAN,
                false
              ) IS TRUE
    )
    SELECT COUNT(*)::INTEGER
    INTO v_total
    FROM eligible;

    WITH eligible AS (
        SELECT cf.id, cf.tenant_id, cf.created_at, t.slug, t.name
        FROM public.customer_favorites cf
        JOIN public.tenants t ON t.id = cf.tenant_id
        JOIN public.tenant_business_profiles bp ON bp.tenant_id = t.id
        WHERE cf.customer_user_id = v_user_id
          AND t.status IN ('active', 'manual_active')
          AND t.onboarding_status = 'completed'
          AND t.public_site_status = 'published'
          AND bp.is_public_profile_enabled IS TRUE
          AND COALESCE(
                (public.evaluate_public_booking_eligibility_internal(t.id, t.slug)->>'bookable')::BOOLEAN,
                false
              ) IS TRUE
        ORDER BY cf.created_at DESC, cf.id
        LIMIT v_eff_limit OFFSET v_eff_offset
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'favorite_id', e.id,
                'tenant_id', e.tenant_id,
                'tenant_slug', e.slug,
                'tenant_name', e.name,
                'created_at', e.created_at
            ) ORDER BY e.created_at DESC, e.id
        ),
        '[]'::JSONB
    )
    INTO v_favorites
    FROM eligible e;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'OK',
        'total', v_total,
        'limit', v_eff_limit,
        'offset', v_eff_offset,
        'favorites', v_favorites
    );
END;
$$;

-- =========================================================================
-- 2. FAST-REBOOKING SEED
-- =========================================================================

-- The existing self-service manage token is the sole ownership proof. The old
-- appointment is historical input only. Every returned service, staff, branch,
-- price, and duration field is resolved from current canonical tables.
CREATE OR REPLACE FUNCTION public.get_fast_rebooking_seed_by_manage_token(
    p_manage_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash       TEXT;
    v_history          RECORD;
    v_tenant           RECORD;
    v_service          RECORD;
    v_staff            RECORD;
    v_branch           RECORD;
    v_booking_eligible BOOLEAN := false;
BEGIN
    IF p_manage_token IS NULL
       OR length(trim(p_manage_token)) < 32
       OR length(trim(p_manage_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_TOKEN');
    END IF;

    v_token_hash := encode(sha256(trim(p_manage_token)::bytea), 'hex');

    SELECT
        a.id,
        a.tenant_id,
        a.branch_id,
        a.service_id,
        a.staff_id,
        a.status
    INTO v_history
    FROM public.appointment_access_tokens tok
    JOIN public.appointments a
      ON a.id = tok.appointment_id
     AND a.tenant_id::TEXT = tok.tenant_id
    WHERE tok.token_hash = v_token_hash
      AND tok.expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_TOKEN');
    END IF;

    IF v_history.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'APPOINTMENT_NOT_REBOOKABLE');
    END IF;

    SELECT t.id, t.slug, t.status, t.onboarding_status, t.public_site_status
    INTO v_tenant
    FROM public.tenants t
    JOIN public.tenant_business_profiles bp
      ON bp.tenant_id = t.id
     AND bp.is_public_profile_enabled IS TRUE
    WHERE t.id = v_history.tenant_id
      AND t.status IN ('active', 'manual_active')
      AND t.onboarding_status = 'completed'
      AND t.public_site_status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TENANT_RESELECTION_REQUIRED');
    END IF;

    v_booking_eligible := COALESCE(
        (public.evaluate_public_booking_eligibility_internal(v_tenant.id, v_tenant.slug)->>'bookable')::BOOLEAN,
        false
    );

    IF NOT v_booking_eligible THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TENANT_RESELECTION_REQUIRED');
    END IF;

    SELECT s.id, s.tenant_id, s.name, s.price, s.duration
    INTO v_service
    FROM public.services s
    WHERE s.id = v_history.service_id
      AND s.tenant_id = v_history.tenant_id
      AND s.active IS TRUE
      AND s.duration > 0;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'SERVICE_RESELECTION_REQUIRED');
    END IF;

    SELECT st.id, st.tenant_id, st.name
    INTO v_staff
    FROM public.staff st
    WHERE st.id = v_history.staff_id
      AND st.tenant_id = v_history.tenant_id
      AND st.active IS TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'STAFF_RESELECTION_REQUIRED');
    END IF;

    SELECT b.id, b.tenant_id, b.name, b.timezone
    INTO v_branch
    FROM public.branches b
    WHERE b.id = v_history.branch_id
      AND b.tenant_id = v_history.tenant_id
      AND b.is_active IS TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'BRANCH_RESELECTION_REQUIRED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.staff_services ss
        WHERE ss.staff_id = v_staff.id
          AND ss.service_id = v_service.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'STAFF_RESELECTION_REQUIRED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.service_branches sb
        WHERE sb.tenant_id = v_history.tenant_id
          AND sb.service_id = v_service.id
          AND sb.branch_id = v_branch.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'BRANCH_RESELECTION_REQUIRED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.staff_branches stb
        WHERE stb.tenant_id = v_history.tenant_id
          AND stb.staff_id = v_staff.id
          AND stb.branch_id = v_branch.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'BRANCH_RESELECTION_REQUIRED');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'OK',
        'seed', jsonb_build_object(
            'source_appointment_id', v_history.id,
            'tenant_slug', v_tenant.slug,
            'branch_id', v_branch.id,
            'service_id', v_service.id,
            'service_name', v_service.name,
            'current_service_price', v_service.price,
            'current_service_duration_minutes', v_service.duration,
            'staff_id', v_staff.id,
            'staff_name', v_staff.name,
            'requires_current_availability_selection', true,
            'availability_authority', 'evaluate_booking_slot',
            'booking_authority', 'create_public_booking',
            'canonical_booking_required', true
        )
    );
EXCEPTION WHEN OTHERS THEN
    -- Keep token and ownership failures neutral. No SQL details are returned.
    RETURN jsonb_build_object('success', false, 'reason_code', 'TEMPORARY_FAILURE');
END;
$$;

-- =========================================================================
-- 3. MINIMAL FUNCTION PRIVILEGES
-- =========================================================================

REVOKE ALL ON FUNCTION public.set_customer_favorite(UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_favorite(UUID, BOOLEAN)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_customer_favorites(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_favorites(INTEGER, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_fast_rebooking_seed_by_manage_token(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fast_rebooking_seed_by_manage_token(TEXT)
    TO anon, authenticated, service_role;

-- =========================================================================
-- END MIGRATION 95
-- =========================================================================
