-- =========================================================================
-- STAGE H1E-C MIGRATION 51: PUBLIC BOOKING RELEASE & PILOT ENFORCEMENT GATE
-- Migration: 20260826_h1e_c_public_booking_release_gate.sql
-- =========================================================================

-- 1. SINGLE CANONICAL ELIGIBILITY ENGINE (INTERNAL ONLY)
-- Evaluates all 12 frozen reason precedence rules for public booking.
-- Not exposed directly to PUBLIC, anon, or authenticated.

CREATE OR REPLACE FUNCTION public.evaluate_public_booking_eligibility_internal(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $internal_evaluator$
DECLARE
    -- Tenant facts
    v_tenant_exists             BOOLEAN := false;
    v_tenant_id                 UUID := null;
    v_tenant_name               TEXT := null;
    v_tenant_slug               TEXT := null;
    v_tenant_status             TEXT := null;
    v_public_site_status        TEXT := null;

    -- Release control facts
    v_release_ctrl_exists       BOOLEAN := false;
    v_release_phase             TEXT := null;

    -- Pilot authorization facts
    v_active_auth_found         BOOLEAN := false;
    v_has_auth_history          BOOLEAN := false;
    v_pilot_enforce_active      BOOLEAN := false;

    -- Operational & relationship facts
    v_primary_branch_id         UUID := null;
    v_primary_branch_count      INTEGER := 0;
    v_active_service_count      INTEGER := 0;
    v_active_staff_count        INTEGER := 0;
    v_primary_branch_has_staff   BOOLEAN := false;
    v_primary_branch_has_services BOOLEAN := false;
    v_staff_can_perform_service  BOOLEAN := false;

    -- Subscription & commercial facts
    v_sub_exists                BOOLEAN := false;
    v_sub_status                TEXT := null;
    v_billing_mode              TEXT := null;
    v_comm_elig                 JSONB := null;
    v_comm_eligible             BOOLEAN := false;

    -- Entitlement facts
    v_core_entitlement          RECORD;
    v_core_entitlement_found    BOOLEAN := false;

    -- Platform restriction facts
    v_active_restrictions_count INTEGER := 0;
    v_core_booking_restricted   BOOLEAN := false;

    -- Precedence & evaluation variables
    v_blocking_reasons          TEXT[] := ARRAY[]::TEXT[];
    v_primary_reason            TEXT := null;
    v_authorized                BOOLEAN := false;
    v_bookable                  BOOLEAN := false;
BEGIN
    -- 1. Global Release Control Evaluation (Singleton id = 1)
    SELECT release_phase
    INTO v_release_phase
    FROM public.platform_global_release_control
    WHERE id = 1;

    IF NOT FOUND OR v_release_phase IS NULL OR v_release_phase NOT IN ('pre_pilot', 'paymentless_pilot', 'full_production') THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'RELEASE_CONTROL_UNAVAILABLE');
    ELSE
        v_release_ctrl_exists := true;
    END IF;

    -- Rule 1: RELEASE_CONTROL_UNAVAILABLE
    IF 'RELEASE_CONTROL_UNAVAILABLE' = ANY(v_blocking_reasons) THEN
        v_primary_reason := 'RELEASE_CONTROL_UNAVAILABLE';
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'bookable', false,
            'authorized', false,
            'pilot_enforcement_active', false,
            'primary_reason_code', v_primary_reason,
            'blocking_reason_codes', v_blocking_reasons
        );
    END IF;

    -- Rule 2: GLOBAL_RELEASE_PHASE_BLOCKED (under pre_pilot)
    IF v_release_phase = 'pre_pilot' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'GLOBAL_RELEASE_PHASE_BLOCKED');
        v_pilot_enforce_active := false;
    ELSIF v_release_phase = 'paymentless_pilot' THEN
        v_pilot_enforce_active := true;
    ELSIF v_release_phase = 'full_production' THEN
        v_pilot_enforce_active := false;
    END IF;

    -- 2. Tenant Lookup & Status
    SELECT id, name, slug, status, public_site_status
    INTO v_tenant_id, v_tenant_name, v_tenant_slug, v_tenant_status, v_public_site_status
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_NOT_FOUND');
    ELSE
        v_tenant_exists := true;
        -- Rule 4: TENANT_INACTIVE
        IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_INACTIVE');
        END IF;
    END IF;

    -- 3. Core Booking Restrictions Check
    IF v_tenant_exists THEN
        SELECT COUNT(*)
        INTO v_active_restrictions_count
        FROM public.platform_tenant_restrictions
        WHERE (tenant_id = v_tenant_id OR tenant_id IS NULL)
          AND restriction_type = 'block_core_booking'
          AND active = true
          AND (expires_at IS NULL OR expires_at > now());

        IF v_active_restrictions_count > 0 THEN
            v_core_booking_restricted := true;
            v_blocking_reasons := array_append(v_blocking_reasons, 'CORE_BOOKING_RESTRICTED');
        END IF;

        -- Rule 6: PUBLIC_SITE_STATUS_BLOCKED
        IF v_public_site_status IS DISTINCT FROM 'published' THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'PUBLIC_SITE_STATUS_BLOCKED');
        END IF;

        -- 4. Pilot Authorization Check
        PERFORM 1
        FROM public.tenant_pilot_authorizations
        WHERE tenant_id = v_tenant_id
          AND revoked_at IS NULL;
        v_active_auth_found := FOUND;
        v_authorized := v_active_auth_found;

        SELECT EXISTS (
            SELECT 1 FROM public.tenant_pilot_authorizations
            WHERE tenant_id = v_tenant_id
        ) INTO v_has_auth_history;

        -- Pilot authorization gate enforcement (active under paymentless_pilot)
        IF v_pilot_enforce_active THEN
            IF NOT v_active_auth_found THEN
                IF v_has_auth_history THEN
                    v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REVOKED');
                ELSE
                    v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REQUIRED');
                END IF;
            END IF;
        END IF;

        -- 5. Subscription & Commercial Eligibility
        v_comm_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
        v_comm_eligible := COALESCE((v_comm_elig->>'eligible')::boolean, false);

        IF NOT v_comm_eligible THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'SUBSCRIPTION_BLOCKED');
        END IF;

        -- 6. Required Entitlement Check (core_booking)
        SELECT * INTO v_core_entitlement
        FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
        WHERE feature_key = 'core_booking';

        IF FOUND THEN
            v_core_entitlement_found := true;
            IF v_core_entitlement.value_type = 'boolean' AND v_core_entitlement.boolean_value IS NOT TRUE THEN
                v_blocking_reasons := array_append(v_blocking_reasons, 'REQUIRED_ENTITLEMENT_BLOCKED');
            END IF;
        ELSE
            v_blocking_reasons := array_append(v_blocking_reasons, 'REQUIRED_ENTITLEMENT_BLOCKED');
        END IF;

        -- 7. Operational Readiness Check
        SELECT id INTO v_primary_branch_id
        FROM public.branches
        WHERE tenant_id = v_tenant_id
          AND is_primary = true;

        IF v_primary_branch_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_active_service_count
            FROM public.services s
            JOIN public.service_branches sb ON s.id = sb.service_id
            WHERE s.tenant_id = v_tenant_id
              AND sb.branch_id = v_primary_branch_id
              AND s.active = true;

            SELECT COUNT(*) INTO v_active_staff_count
            FROM public.staff st
            JOIN public.staff_branches stb ON st.id = stb.staff_id
            WHERE st.tenant_id = v_tenant_id
              AND stb.branch_id = v_primary_branch_id
              AND st.active = true;

            v_primary_branch_has_services := (v_active_service_count > 0);
            v_primary_branch_has_staff := (v_active_staff_count > 0);

            IF v_primary_branch_has_services AND v_primary_branch_has_staff THEN
                SELECT EXISTS (
                    SELECT 1
                    FROM public.staff_services ss
                    JOIN public.staff st ON st.id = ss.staff_id
                    JOIN public.services s ON s.id = ss.service_id
                    JOIN public.staff_branches stb ON st.id = stb.staff_id
                    JOIN public.service_branches sb ON s.id = sb.service_id
                    WHERE st.tenant_id = v_tenant_id
                      AND s.tenant_id = v_tenant_id
                      AND stb.branch_id = v_primary_branch_id
                      AND sb.branch_id = v_primary_branch_id
                      AND st.active = true
                      AND s.active = true
                ) INTO v_staff_can_perform_service;
            END IF;
        END IF;

        IF NOT (v_primary_branch_id IS NOT NULL AND v_primary_branch_has_services AND v_primary_branch_has_staff AND v_staff_can_perform_service) THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'OPERATIONAL_READINESS_FAILED');
        END IF;
    END IF;

    -- Primary reason determination by frozen precedence
    IF array_length(v_blocking_reasons, 1) IS NULL OR array_length(v_blocking_reasons, 1) = 0 THEN
        v_primary_reason := 'BOOKING_ALLOWED';
        v_bookable := true;
    ELSE
        v_bookable := false;
        v_primary_reason := v_blocking_reasons[1];
    END IF;

    RETURN jsonb_build_object(
        'found', v_tenant_exists,
        'allowed', v_bookable,
        'bookable', v_bookable,
        'authorized', v_authorized,
        'pilot_enforcement_active', v_pilot_enforce_active,
        'primary_reason_code', v_primary_reason,
        'blocking_reason_codes', v_blocking_reasons
    );
END;
$internal_evaluator$;

REVOKE ALL ON FUNCTION public.evaluate_public_booking_eligibility_internal(UUID) FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 2. CANONICAL PUBLIC RPC INTEGRATION (can_accept_public_booking)
-- Signature: can_accept_public_booking(p_slug text) -> jsonb
-- =========================================================================

CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $public_booking$
DECLARE
    v_tenant_id UUID;
    v_eval      JSONB;
    v_primary   TEXT;
BEGIN
    -- 1. Resolve tenant_id by slug
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'reason_code', 'tenant_not_found',
            'primary_reason_code', 'TENANT_NOT_FOUND',
            'blocking_reason_codes', ARRAY['TENANT_NOT_FOUND']
        );
    END IF;

    -- 2. Evaluate using single canonical internal eligibility engine
    v_eval := public.evaluate_public_booking_eligibility_internal(v_tenant_id);
    v_primary := v_eval->>'primary_reason_code';

    RETURN jsonb_build_object(
        'found', COALESCE((v_eval->>'found')::boolean, true),
        'allowed', COALESCE((v_eval->>'bookable')::boolean, false),
        'bookable', COALESCE((v_eval->>'bookable')::boolean, false),
        'reason_code', lower(v_primary),
        'primary_reason_code', v_primary,
        'blocking_reason_codes', v_eval->'blocking_reason_codes'
    );
END;
$public_booking$;

REVOKE ALL ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon, authenticated;


-- =========================================================================
-- 3. SUPER ADMIN ELIGIBILITY SNAPSHOT UPDATE (H1E-C INTEGRATION)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $eligibility_snapshot$
DECLARE
    v_actor_user_id             UUID;

    -- Tenant facts
    v_tenant_exists             BOOLEAN := false;
    v_tenant_id                 UUID := null;
    v_tenant_name               TEXT := null;
    v_tenant_slug               TEXT := null;
    v_tenant_status             TEXT := null;
    v_public_site_status        TEXT := null;
    v_slug_resolves             BOOLEAN := false;

    -- Release control facts
    v_release_ctrl_exists       BOOLEAN := false;
    v_release_phase             TEXT := null;
    v_prod_authorized           BOOLEAN := false;
    v_pilot_enforce_req         BOOLEAN := false;
    v_payment_enabled           BOOLEAN := false;
    v_checkout_enabled          BOOLEAN := false;
    v_iyzico_enabled            BOOLEAN := false;

    -- Operational & relationship facts
    v_primary_branch_id         UUID := null;
    v_primary_branch_count      INTEGER := 0;
    v_active_service_count      INTEGER := 0;
    v_active_staff_count        INTEGER := 0;
    v_primary_branch_has_staff   BOOLEAN := false;
    v_primary_branch_has_services BOOLEAN := false;
    v_staff_can_perform_service  BOOLEAN := false;
    v_rel_status                TEXT := 'NOT_VERIFIED';

    -- Pilot authorization facts
    v_active_auth_rec           RECORD;
    v_active_auth_found         BOOLEAN := false;
    v_has_auth_history          BOOLEAN := false;

    -- Subscription & commercial facts
    v_sub_exists                BOOLEAN := false;
    v_sub_status                TEXT := null;
    v_billing_mode              TEXT := null;
    v_comm_elig                 JSONB := null;
    v_comm_eligible             BOOLEAN := false;

    -- Entitlement facts
    v_core_entitlement          RECORD;
    v_core_entitlement_found    BOOLEAN := false;
    v_core_entitlement_blocked  BOOLEAN := false;

    -- Platform restriction facts
    v_active_restrictions_count INTEGER := 0;
    v_core_booking_restricted   BOOLEAN := false;

    -- Internal evaluation result
    v_eval                      JSONB;
    v_blocking_reasons          TEXT[] := ARRAY[]::TEXT[];
    v_primary_reason            TEXT := null;
    v_authorized                BOOLEAN := false;
    v_bookable                  BOOLEAN := false;

    -- Output JSON objects
    v_readiness_facts           JSONB;
    v_global_release_facts      JSONB;
    v_auth_facts                JSONB;
    v_rel_verification          JSONB;
    v_entitlement_facts         JSONB;
    v_restriction_facts         JSONB;
BEGIN
    -- 1. Authorization check: Require authenticated super-admin
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthorized',
            'timestamp', now()
        );
    END IF;

    -- 2. Fetch global release control (Singleton id = 1)
    SELECT
        release_phase,
        is_payment_collection_enabled,
        is_checkout_enabled,
        is_iyzico_enabled
    INTO
        v_release_phase,
        v_payment_enabled,
        v_checkout_enabled,
        v_iyzico_enabled
    FROM public.platform_global_release_control
    WHERE id = 1;

    IF NOT FOUND OR v_release_phase IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'RELEASE_CONTROL_UNAVAILABLE',
            'timestamp', now()
        );
    END IF;

    v_release_ctrl_exists := true;
    v_prod_authorized := (v_release_phase = 'full_production');
    v_pilot_enforce_req := (v_release_phase = 'paymentless_pilot');

    -- 3. Tenant facts
    SELECT id, name, slug, status, public_site_status
    INTO v_tenant_id, v_tenant_name, v_tenant_slug, v_tenant_status, v_public_site_status
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'TENANT_NOT_FOUND',
            'timestamp', now()
        );
    END IF;

    v_tenant_exists := true;
    v_slug_resolves := (v_tenant_slug IS NOT NULL);

    -- 4. Evaluate internal eligibility engine
    v_eval := public.evaluate_public_booking_eligibility_internal(p_tenant_id);
    v_bookable := COALESCE((v_eval->>'bookable')::boolean, false);
    v_authorized := COALESCE((v_eval->>'authorized')::boolean, false);
    v_primary_reason := v_eval->>'primary_reason_code';
    
    -- Extract blocking reasons array
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_eval->'blocking_reason_codes')) INTO v_blocking_reasons;

    -- 5. Build readiness facts
    SELECT id INTO v_primary_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true;

    SELECT COUNT(*) INTO v_primary_branch_count
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true;

    IF v_primary_branch_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_active_service_count
        FROM public.services s
        JOIN public.service_branches sb ON s.id = sb.service_id
        WHERE s.tenant_id = v_tenant_id AND sb.branch_id = v_primary_branch_id AND s.active = true;

        SELECT COUNT(*) INTO v_active_staff_count
        FROM public.staff st
        JOIN public.staff_branches stb ON st.id = stb.staff_id
        WHERE st.tenant_id = v_tenant_id AND stb.branch_id = v_primary_branch_id AND st.active = true;

        v_primary_branch_has_services := (v_active_service_count > 0);
        v_primary_branch_has_staff := (v_active_staff_count > 0);

        IF v_primary_branch_has_services AND v_primary_branch_has_staff THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.staff_services ss
                JOIN public.staff st ON st.id = ss.staff_id
                JOIN public.services s ON s.id = ss.service_id
                JOIN public.staff_branches stb ON st.id = stb.staff_id
                JOIN public.service_branches sb ON s.id = sb.service_id
                WHERE st.tenant_id = v_tenant_id
                  AND s.tenant_id = v_tenant_id
                  AND stb.branch_id = v_primary_branch_id
                  AND sb.branch_id = v_primary_branch_id
                  AND st.active = true
                  AND s.active = true
            ) INTO v_staff_can_perform_service;
        END IF;
    END IF;

    -- 6. Pilot Authorization Facts
    SELECT id, authorized_at, authorized_by, authorization_reason
    INTO v_active_auth_rec
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = v_tenant_id
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    v_active_auth_found := FOUND;

    SELECT EXISTS (
        SELECT 1 FROM public.tenant_pilot_authorizations
        WHERE tenant_id = v_tenant_id
    ) INTO v_has_auth_history;

    v_auth_facts := jsonb_build_object(
        'implementation_state', 'implemented',
        'is_authorized', v_active_auth_found,
        'has_authorization_history', v_has_auth_history,
        'active_authorization_id', CASE WHEN v_active_auth_found THEN v_active_auth_rec.id ELSE NULL END,
        'authorized_at', CASE WHEN v_active_auth_found THEN v_active_auth_rec.authorized_at ELSE NULL END,
        'authorized_by', CASE WHEN v_active_auth_found THEN v_active_auth_rec.authorized_by ELSE NULL END,
        'authorization_reason', CASE WHEN v_active_auth_found THEN v_active_auth_rec.authorization_reason ELSE NULL END
    );

    -- 7. Relationship Verification
    IF v_primary_branch_count = 1 AND v_primary_branch_has_services AND v_primary_branch_has_staff AND v_staff_can_perform_service THEN
        v_rel_status := 'VERIFIED';
    ELSE
        v_rel_status := 'RELATIONSHIP_MISSING';
    END IF;

    v_rel_verification := jsonb_build_object(
        'status', v_rel_status,
        'primary_branch_verified', (v_primary_branch_count = 1),
        'active_services_on_primary_branch', v_active_service_count,
        'active_staff_on_primary_branch', v_active_staff_count,
        'staff_service_mapping_verified', v_staff_can_perform_service
    );

    v_readiness_facts := jsonb_build_object(
        'tenant_status', v_tenant_status,
        'public_site_status', v_public_site_status,
        'slug_resolves', v_slug_resolves,
        'primary_branch_count', v_primary_branch_count,
        'active_service_count', v_active_service_count,
        'active_staff_count', v_active_staff_count,
        'primary_branch_has_staff', v_primary_branch_has_staff,
        'primary_branch_has_services', v_primary_branch_has_services,
        'staff_can_perform_service', v_staff_can_perform_service,
        'relationship_verification', v_rel_verification
    );

    -- 8. Global release control payload
    v_global_release_facts := jsonb_build_object(
        'release_phase', v_release_phase,
        'production_authorized', v_prod_authorized,
        'pilot_enforcement_required', v_pilot_enforce_req,
        'is_payment_collection_enabled', false,
        'is_checkout_enabled', false,
        'is_iyzico_enabled', false
    );

    -- 9. Commercial & entitlement facts
    v_comm_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    v_comm_eligible := COALESCE((v_comm_elig->>'eligible')::boolean, false);

    SELECT * INTO v_core_entitlement
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
    WHERE feature_key = 'core_booking';

    IF FOUND THEN
        v_core_entitlement_found := true;
        IF v_core_entitlement.value_type = 'boolean' AND v_core_entitlement.boolean_value IS NOT TRUE THEN
            v_core_entitlement_blocked := true;
        END IF;
    ELSE
        v_core_entitlement_blocked := true;
    END IF;

    v_entitlement_facts := jsonb_build_object(
        'commercial_eligibility', v_comm_elig,
        'commercial_eligible', v_comm_eligible,
        'core_booking_entitlement_found', v_core_entitlement_found,
        'core_booking_entitlement_blocked', v_core_entitlement_blocked
    );

    -- 10. Platform restrictions
    SELECT COUNT(*) INTO v_active_restrictions_count
    FROM public.platform_tenant_restrictions
    WHERE (tenant_id = v_tenant_id OR tenant_id IS NULL)
      AND restriction_type = 'block_core_booking'
      AND active = true
      AND (expires_at IS NULL OR expires_at > now());

    v_core_booking_restricted := (v_active_restrictions_count > 0);

    v_restriction_facts := jsonb_build_object(
        'active_restrictions_count', v_active_restrictions_count,
        'core_booking_restricted', v_core_booking_restricted
    );

    -- 11. Final Structured Response
    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'tenant_name', v_tenant_name,
        'tenant_slug', v_tenant_slug,
        'authorized', v_authorized,
        'pilot_enforcement_active', v_pilot_enforce_req,
        'bookable', v_bookable,
        'primary_reason_code', v_primary_reason,
        'blocking_reason_codes', v_blocking_reasons,
        'global_release_control', v_global_release_facts,
        'pilot_authorization', v_auth_facts,
        'readiness_facts', v_readiness_facts,
        'entitlement_facts', v_entitlement_facts,
        'restriction_facts', v_restriction_facts,
        'timestamp', now()
    );
END;
$eligibility_snapshot$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;
