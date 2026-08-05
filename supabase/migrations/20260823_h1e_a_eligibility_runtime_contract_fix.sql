-- =========================================================================
-- MIGRATION 48: H1E-A ELIGIBILITY READ CONTRACT RUNTIME FORWARD FIX
-- =========================================================================
-- Forward-only correction for public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID).
-- Implements:
--   1. Immediate fail-closed return on missing global release control singleton (RELEASE_CONTROL_UNAVAILABLE).
--   2. Canonical phase-based derivation for production_authorized and pilot_enforcement_required.
--   3. Explicit join-based relationship verification across branches, services, staff, service_branches, staff_branches, and staff_services.
--   4. Integration of resolve_tenant_commercial_eligibility into SUBSCRIPTION_BLOCKED evaluation.
--   5. Blocker-consistent eligible boolean semantics (false if any tenant eligibility blocker exists).
--   6. Live column alignment (services.active, staff.active) and safe scalar state.

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
        -- Immediate fail-closed return if singleton missing
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'RELEASE_CONTROL_UNAVAILABLE',
            'timestamp', now(),
            'tenant_id', p_tenant_id,
            'eligible', false,
            'authorized', false,
            'bookable', false,
            'production_authorized', false,
            'pilot_enforcement_active', false,
            'primary_reason_code', 'RELEASE_CONTROL_UNAVAILABLE',
            'blocking_reason_codes', jsonb_build_array('RELEASE_CONTROL_UNAVAILABLE')
        );
    END IF;

    v_release_ctrl_exists := true;

    -- Canonical Phase Derivations
    -- pre_pilot: prod_auth=false, pilot_enforce_req=false
    -- paymentless_pilot: prod_auth=false, pilot_enforce_req=true
    -- full_production: prod_auth=true, pilot_enforce_req=false
    IF v_release_phase = 'full_production' THEN
        v_prod_authorized := true;
        v_pilot_enforce_req := false;
    ELSIF v_release_phase = 'paymentless_pilot' THEN
        v_prod_authorized := false;
        v_pilot_enforce_req := true;
    ELSE
        v_prod_authorized := false;
        v_pilot_enforce_req := false;
    END IF;

    -- 3. Fetch tenant scalar facts
    IF p_tenant_id IS NOT NULL THEN
        SELECT id, name, slug, status, public_site_status
        INTO v_tenant_id, v_tenant_name, v_tenant_slug, v_tenant_status, v_public_site_status
        FROM public.tenants
        WHERE id = p_tenant_id;

        IF FOUND THEN
            v_tenant_exists := true;
            IF v_tenant_slug IS NOT NULL THEN
                PERFORM 1 FROM public.tenants WHERE slug = v_tenant_slug AND id = p_tenant_id;
                v_slug_resolves := FOUND;
            END IF;
        END IF;
    END IF;

    -- 4. Gather operational facts & explicit relationship verifications if tenant exists
    IF v_tenant_exists THEN
        -- Primary branch query
        SELECT id INTO v_primary_branch_id
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true
        LIMIT 1;

        SELECT count(*)::INTEGER INTO v_primary_branch_count
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true;

        -- Active service count
        SELECT count(*)::INTEGER INTO v_active_service_count
        FROM public.services
        WHERE tenant_id = p_tenant_id AND active = true;

        -- Active staff count
        SELECT count(*)::INTEGER INTO v_active_staff_count
        FROM public.staff
        WHERE tenant_id = p_tenant_id AND active = true;

        -- Explicit relationship proof queries
        IF v_primary_branch_id IS NOT NULL THEN
            PERFORM 1
            FROM public.staff_branches sb
            JOIN public.staff s ON s.id = sb.staff_id
            WHERE sb.branch_id = v_primary_branch_id AND sb.tenant_id = p_tenant_id AND s.active = true;
            v_primary_branch_has_staff := FOUND;

            PERFORM 1
            FROM public.service_branches sb
            JOIN public.services s ON s.id = sb.service_id
            WHERE sb.branch_id = v_primary_branch_id AND sb.tenant_id = p_tenant_id AND s.active = true;
            v_primary_branch_has_services := FOUND;
        END IF;

        PERFORM 1
        FROM public.staff_services ss
        JOIN public.staff st ON st.id = ss.staff_id
        JOIN public.services se ON se.id = ss.service_id
        WHERE st.tenant_id = p_tenant_id AND st.active = true AND se.tenant_id = p_tenant_id AND se.active = true;
        v_staff_can_perform_service := FOUND;

        IF v_primary_branch_count = 1 AND v_primary_branch_has_staff AND v_primary_branch_has_services AND v_staff_can_perform_service THEN
            v_rel_status := 'VERIFIED';
        ELSE
            v_rel_status := 'RELATIONSHIP_VERIFICATION_FAILED';
        END IF;

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

        -- Active core_booking restrictions check (handling null/false is_global)
        SELECT count(*)::INTEGER INTO v_active_restrictions_count
        FROM public.platform_system_restrictions
        WHERE (tenant_id = p_tenant_id OR COALESCE(is_global, false) = true)
          AND feature_key = 'core_booking'
          AND is_restricted = true
          AND starts_at <= now()
          AND (expires_at IS NULL OR expires_at > now());

        v_core_booking_restricted := (v_active_restrictions_count > 0);
    END IF;

    -- 5. Evaluate Blocking Reason Codes in Deterministic Precedence Order
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

    -- 9. SUBSCRIPTION_BLOCKED (evaluated via raw sub + commercial resolver)
    IF v_tenant_exists AND (NOT v_sub_exists OR v_sub_status IS DISTINCT FROM 'active' OR NOT v_comm_eligible) THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'SUBSCRIPTION_BLOCKED');
    END IF;

    -- 10. REQUIRED_ENTITLEMENT_BLOCKED
    IF v_tenant_exists AND v_core_entitlement_blocked THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'REQUIRED_ENTITLEMENT_BLOCKED');
    END IF;

    -- 11. OPERATIONAL_READINESS_FAILED
    IF v_tenant_exists AND (v_primary_branch_count != 1 OR v_active_service_count < 1 OR v_active_staff_count < 1 OR v_rel_status != 'VERIFIED') THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'OPERATIONAL_READINESS_FAILED');
    END IF;

    -- Select Primary Reason Code (First in precedence order)
    IF array_length(v_blocking_reasons, 1) > 0 THEN
        v_primary_reason := v_blocking_reasons[1];
    ELSE
        v_primary_reason := 'BOOKING_ALLOWED';
    END IF;

    -- Calculate Blocker-Consistent Eligible Boolean
    -- eligible MUST be false if ANY tenant-level eligibility blocker exists
    v_eligible := v_tenant_exists
      AND (v_tenant_status = 'active')
      AND NOT v_core_booking_restricted
      AND (v_public_site_status = 'published')
      AND v_sub_exists AND (v_sub_status = 'active') AND v_comm_eligible
      AND NOT v_core_entitlement_blocked
      AND (v_primary_branch_count = 1) AND (v_active_service_count >= 1) AND (v_active_staff_count >= 1) AND (v_rel_status = 'VERIFIED');

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
        'status', v_rel_status,
        'primary_branch_has_staff', v_primary_branch_has_staff,
        'primary_branch_has_services', v_primary_branch_has_services,
        'staff_can_perform_service', v_staff_can_perform_service
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
