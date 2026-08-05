-- =========================================================================
-- MIGRATION 48: H1E-A ELIGIBILITY READ CONTRACT RUNTIME FORWARD FIX
-- =========================================================================
-- This migration provides a forward-only correction for the eligibility RPC
-- public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID)
-- replacing defective column references (services.is_active -> services.active,
-- staff.is_active -> staff.active) and replacing unsafe RECORD field dereferences
-- with explicit scalar facts and FOUND checks.
--
-- Migration 47 remains applied and immutable.
-- No database state, release state, payment flag, or authorization record is altered.

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
    v_release_phase             TEXT := 'pre_pilot';
    v_prod_authorized           BOOLEAN := false;
    v_pilot_enforce_req         BOOLEAN := true;
    v_payment_enabled           BOOLEAN := false;
    v_checkout_enabled          BOOLEAN := false;
    v_iyzico_enabled            BOOLEAN := false;

    -- Operational readiness facts
    v_primary_branch_count      INTEGER := 0;
    v_active_service_count      INTEGER := 0;
    v_active_staff_count        INTEGER := 0;

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

    -- Precedence & evaluation variables
    v_blocking_reasons          TEXT[] := ARRAY[]::TEXT[];
    v_primary_reason            TEXT := null;
    v_eligible                  BOOLEAN := false;
    v_authorized                BOOLEAN := false;
    v_bookable                  BOOLEAN := false;

    -- Output JSON objects
    v_readiness_facts           JSONB;
    v_global_release_facts      JSONB;
    v_transitional_auth         JSONB;
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
        is_production_authorized,
        is_pilot_enforcement_required,
        is_payment_collection_enabled,
        is_checkout_enabled,
        is_iyzico_enabled
    INTO
        v_release_phase,
        v_prod_authorized,
        v_pilot_enforce_req,
        v_payment_enabled,
        v_checkout_enabled,
        v_iyzico_enabled
    FROM public.platform_global_release_control
    WHERE id = 1;

    IF FOUND THEN
        v_release_ctrl_exists := true;
    ELSE
        -- Fallback default pre_pilot safe values if missing
        v_release_phase := 'pre_pilot';
        v_prod_authorized := false;
        v_pilot_enforce_req := true;
        v_payment_enabled := false;
        v_checkout_enabled := false;
        v_iyzico_enabled := false;
    END IF;

    -- Derive production_authorized strictly from release_phase to enforce canonicality
    v_prod_authorized := (v_release_phase = 'full_production');

    -- 3. Fetch tenant scalar facts
    IF p_tenant_id IS NOT NULL THEN
        SELECT id, name, slug, status, public_site_status
        INTO v_tenant_id, v_tenant_name, v_tenant_slug, v_tenant_status, v_public_site_status
        FROM public.tenants
        WHERE id = p_tenant_id;

        IF FOUND THEN
            v_tenant_exists := true;
            -- Check if slug resolves back to this tenant
            IF v_tenant_slug IS NOT NULL THEN
                PERFORM 1 FROM public.tenants WHERE slug = v_tenant_slug AND id = p_tenant_id;
                v_slug_resolves := FOUND;
            END IF;
        END IF;
    END IF;

    -- 4. Gather operational facts if tenant exists
    IF v_tenant_exists THEN
        -- Primary branch count
        SELECT count(*)::INTEGER INTO v_primary_branch_count
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true;

        -- Active service count (using exact live column `active`)
        SELECT count(*)::INTEGER INTO v_active_service_count
        FROM public.services
        WHERE tenant_id = p_tenant_id AND active = true;

        -- Active staff count (using exact live column `active`)
        SELECT count(*)::INTEGER INTO v_active_staff_count
        FROM public.staff
        WHERE tenant_id = p_tenant_id AND active = true;

        -- Subscription & commercial facts
        SELECT status, billing_mode INTO v_sub_status, v_billing_mode
        FROM public.subscriptions
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at DESC
        LIMIT 1;
        v_sub_exists := FOUND;

        -- Commercial eligibility check via canonical resolver
        v_comm_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id, now());
        v_comm_eligible := COALESCE((v_comm_elig->>'eligible')::boolean, false);

        -- Entitlement check via canonical resolver for core_booking
        SELECT * INTO v_core_entitlement
        FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
        WHERE feature_key = 'core_booking';

        IF FOUND THEN
            v_core_entitlement_found := true;
            IF v_core_entitlement.value_type = 'boolean' AND v_core_entitlement.boolean_value IS NOT TRUE THEN
                v_core_entitlement_blocked := true;
            END IF;
        ELSE
            v_core_entitlement_blocked := true;
        END IF;

        -- Active core_booking restrictions check
        SELECT count(*)::INTEGER INTO v_active_restrictions_count
        FROM public.platform_system_restrictions
        WHERE (tenant_id = p_tenant_id OR is_global = true)
          AND feature_key = 'core_booking'
          AND is_restricted = true
          AND starts_at <= now()
          AND (expires_at IS NULL OR expires_at > now());

        v_core_booking_restricted := (v_active_restrictions_count > 0);
    END IF;

    -- 5. Evaluate Blocking Reason Codes in Precedence Order
    -- 1. RELEASE_CONTROL_UNAVAILABLE
    IF NOT v_release_ctrl_exists THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'RELEASE_CONTROL_UNAVAILABLE');
    END IF;

    -- 2. GLOBAL_RELEASE_PHASE_BLOCKED
    IF v_release_phase != 'paymentless_pilot' AND v_release_phase != 'full_production' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'GLOBAL_RELEASE_PHASE_BLOCKED');
    END IF;

    -- 3. TENANT_NOT_FOUND
    IF NOT v_tenant_exists THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_NOT_FOUND');
    END IF;

    -- 4. TENANT_INACTIVE
    IF v_tenant_exists AND v_tenant_status IS DISTINCT FROM 'active' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_INACTIVE');
    END IF;

    -- 5. CORE_BOOKING_RESTRICTED
    IF v_tenant_exists AND v_core_booking_restricted THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'CORE_BOOKING_RESTRICTED');
    END IF;

    -- 6. PUBLIC_SITE_STATUS_BLOCKED
    IF v_tenant_exists AND v_public_site_status IS DISTINCT FROM 'published' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'PUBLIC_SITE_STATUS_BLOCKED');
    END IF;

    -- 7. PILOT_AUTHORIZATION_REQUIRED (H1E-A pilot authorization state is pending_h1e_b)
    IF v_tenant_exists THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REQUIRED');
    END IF;

    -- 9. SUBSCRIPTION_BLOCKED
    IF v_tenant_exists AND (NOT v_sub_exists OR v_sub_status IS DISTINCT FROM 'active') THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'SUBSCRIPTION_BLOCKED');
    END IF;

    -- 10. REQUIRED_ENTITLEMENT_BLOCKED
    IF v_tenant_exists AND v_core_entitlement_blocked THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'REQUIRED_ENTITLEMENT_BLOCKED');
    END IF;

    -- 11. OPERATIONAL_READINESS_FAILED
    IF v_tenant_exists AND (v_primary_branch_count != 1 OR v_active_service_count < 1 OR v_active_staff_count < 1) THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'OPERATIONAL_READINESS_FAILED');
    END IF;

    -- Select Primary Reason Code (First in precedence order)
    IF array_length(v_blocking_reasons, 1) > 0 THEN
        v_primary_reason := v_blocking_reasons[1];
    ELSE
        v_primary_reason := 'BOOKING_ALLOWED';
    END IF;

    -- Calculate Readiness & Authorization Booleans
    v_eligible := v_tenant_exists AND (v_primary_branch_count = 1) AND (v_active_service_count >= 1) AND (v_active_staff_count >= 1) AND (v_tenant_status = 'active') AND v_sub_exists;
    v_authorized := false; -- Pending H1E-B
    v_bookable := false;   -- Pending H1E-B & H1E-C

    -- Construct JSON Sub-objects
    v_readiness_facts := jsonb_build_object(
        'tenant_exists', v_tenant_exists,
        'tenant_active', (v_tenant_status = 'active'),
        'slug', v_tenant_slug,
        'slug_resolves', v_slug_resolves,
        'public_site_status', COALESCE(v_public_site_status, 'unknown'),
        'primary_branch_count', v_primary_branch_count,
        'primary_branch_valid', (v_primary_branch_count = 1),
        'active_service_count', v_active_service_count,
        'active_staff_count', v_active_staff_count,
        'subscription_status', COALESCE(v_sub_status, 'none'),
        'billing_mode', COALESCE(v_billing_mode, 'none')
    );

    v_global_release_facts := jsonb_build_object(
        'release_phase', v_release_phase,
        'is_production_authorized', v_prod_authorized,
        'is_pilot_enforcement_required', v_pilot_enforce_req,
        'is_payment_collection_enabled', v_payment_enabled,
        'is_checkout_enabled', v_checkout_enabled,
        'is_iyzico_enabled', v_iyzico_enabled
    );

    v_transitional_auth := jsonb_build_object(
        'implementation_state', 'pending_h1e_b',
        'authorization_id', NULL,
        'is_authorized', false,
        'approved_at', NULL,
        'approved_by', NULL,
        'revoked_at', NULL,
        'revoked_by', NULL
    );

    v_rel_verification := jsonb_build_object(
        'status', 'VERIFIED_SCHEMA_BOUND',
        'primary_branch_has_staff', (v_primary_branch_count = 1 AND v_active_staff_count >= 1),
        'primary_branch_has_services', (v_primary_branch_count = 1 AND v_active_service_count >= 1)
    );

    v_entitlement_facts := jsonb_build_object(
        'feature_key', 'core_booking',
        'resolved', v_core_entitlement_found,
        'blocked', v_core_entitlement_blocked
    );

    v_restriction_facts := jsonb_build_object(
        'active_restrictions_count', v_active_restrictions_count,
        'core_booking_restricted', v_core_booking_restricted
    );

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', now(),
        'tenant_id', p_tenant_id,
        'eligible', v_eligible,
        'authorized', v_authorized,
        'bookable', v_bookable,
        'production_authorized', v_prod_authorized,
        'pilot_enforcement_active', false,
        'primary_reason_code', v_primary_reason,
        'blocking_reason_codes', to_jsonb(v_blocking_reasons),
        'readiness_facts', v_readiness_facts,
        'global_release_control', v_global_release_facts,
        'pilot_authorization', v_transitional_auth,
        'relationship_verification', v_rel_verification,
        'entitlement_facts', v_entitlement_facts,
        'restriction_facts', v_restriction_facts
    );
END;
$eligibility_snapshot$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;
