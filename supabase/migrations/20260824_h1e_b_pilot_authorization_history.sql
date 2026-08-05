-- =========================================================================
-- MIGRATION 49: STAGE H1E-B PILOT AUTHORIZATION HISTORY & MANAGEMENT CONTRACTS
-- =========================================================================
-- Provisions:
--   1. public.tenant_pilot_authorizations history table with partial unique index
--      enforcing at most one active authorization per tenant (where revoked_at IS NULL).
--   2. RLS policy revoking all direct table writes from PUBLIC, anon, and authenticated.
--   3. public.super_admin_get_tenant_pilot_authorization read RPC.
--   4. public.super_admin_approve_tenant_pilot mutation RPC.
--   5. public.super_admin_revoke_tenant_pilot mutation RPC.
--   6. Updated public.super_admin_get_tenant_pilot_eligibility_snapshot RPC with
--      implementation_state = 'implemented', authorized boolean bound to active pilot
--      authorization, and transitional pilot_authorization facts.
--
-- Migration 48 remains applied and immutable.
-- Payment/iyzico capabilities remain disabled. Production NO-GO.

-- 1. CREATE TENANT PILOT AUTHORIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.tenant_pilot_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by UUID NOT NULL REFERENCES auth.users(id),
    approved_reason TEXT NOT NULL CHECK (trim(approved_reason) != ''),
    revoked_at TIMESTAMPTZ NULL,
    revoked_by UUID NULL REFERENCES auth.users(id),
    revoked_reason TEXT NULL CHECK (revoked_reason IS NULL OR trim(revoked_reason) != ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pilot_auth_revocation_consistency CHECK (
        (revoked_at IS NULL AND revoked_by IS NULL AND revoked_reason IS NULL) OR
        (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_reason IS NOT NULL)
    ),
    CONSTRAINT chk_pilot_auth_revoked_after_approved CHECK (
        revoked_at IS NULL OR revoked_at >= approved_at
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_pilot_authorizations_tenant
ON public.tenant_pilot_authorizations (tenant_id, created_at DESC);

-- Partial unique index enforcing AT MOST ONE active authorization per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_pilot_authorizations_active_unique
ON public.tenant_pilot_authorizations (tenant_id)
WHERE revoked_at IS NULL;

ALTER TABLE public.tenant_pilot_authorizations ENABLE ROW LEVEL SECURITY;

-- Strict default deny RLS for client direct writes/reads
DROP POLICY IF EXISTS tenant_pilot_authorizations_super_admin_read ON public.tenant_pilot_authorizations;
CREATE POLICY tenant_pilot_authorizations_super_admin_read
ON public.tenant_pilot_authorizations
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS tenant_pilot_authorizations_no_direct_write ON public.tenant_pilot_authorizations;
CREATE POLICY tenant_pilot_authorizations_no_direct_write
ON public.tenant_pilot_authorizations
FOR INSERT
TO authenticated, anon
WITH CHECK (false);


-- =========================================================================
-- 2. READ CONTRACT: super_admin_get_tenant_pilot_authorization
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_pilot_authorization(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_read$
DECLARE
    v_actor_user_id     UUID;
    v_tenant_exists     BOOLEAN := false;
    v_active_auth       RECORD;
    v_active_found      BOOLEAN := false;
    v_history           JSONB;
    v_status            TEXT;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthorized',
            'timestamp', now()
        );
    END IF;

    -- 2. Check tenant existence
    IF p_tenant_id IS NOT NULL THEN
        PERFORM 1 FROM public.tenants WHERE id = p_tenant_id;
        v_tenant_exists := FOUND;
    END IF;

    IF NOT v_tenant_exists THEN
        RETURN jsonb_build_object(
            'success', true,
            'timestamp', now(),
            'tenant_id', p_tenant_id,
            'status', 'TENANT_NOT_FOUND',
            'is_authorized', false,
            'active_authorization', NULL,
            'authorization_history', jsonb_build_array()
        );
    END IF;

    -- 3. Fetch active authorization
    SELECT * INTO v_active_auth
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    LIMIT 1;

    v_active_found := FOUND;

    -- 4. Fetch full authorization history summary
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'approved_at', approved_at,
            'approved_by', approved_by,
            'approved_reason', approved_reason,
            'revoked_at', revoked_at,
            'revoked_by', revoked_by,
            'revoked_reason', revoked_reason,
            'is_active', (revoked_at IS NULL)
        ) ORDER BY created_at DESC
    ), jsonb_build_array())
    INTO v_history
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id;

    -- Determine status: PILOT_AUTHORIZED if active, PILOT_AUTHORIZATION_REVOKED if history exists, PILOT_NOT_AUTHORIZED otherwise
    IF v_active_found THEN
        v_status := 'PILOT_AUTHORIZED';
    ELSIF jsonb_array_length(v_history) > 0 THEN
        v_status := 'PILOT_AUTHORIZATION_REVOKED';
    ELSE
        v_status := 'PILOT_NOT_AUTHORIZED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', now(),
        'tenant_id', p_tenant_id,
        'status', v_status,
        'is_authorized', v_active_found,
        'active_authorization', CASE WHEN v_active_found THEN jsonb_build_object(
            'id', v_active_auth.id,
            'approved_at', v_active_auth.approved_at,
            'approved_by', v_active_auth.approved_by,
            'approved_reason', v_active_auth.approved_reason
        ) ELSE NULL END,
        'authorization_history', v_history
    );
END;
$pilot_read$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_authorization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_authorization(UUID) TO authenticated;


-- =========================================================================
-- 3. MUTATION CONTRACT: super_admin_approve_tenant_pilot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_approve_tenant_pilot(
    p_tenant_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_approve$
DECLARE
    v_actor_user_id     UUID;
    v_fingerprint       TEXT;
    v_cached_resp       JSONB;
    v_active_auth_id    UUID;
    v_new_auth          RECORD;
    v_resp              JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate inputs
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_key_required', 'changed', false, 'replayed', false);
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_reason', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Tenant-Scoped Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('tenant_pilot_authorization:' || p_tenant_id::text, 0));

    -- Check cached idempotency record
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, trim(p_reason)));

    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_approve_tenant_pilot', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 4. Check if active authorization already exists
    SELECT id INTO v_active_auth_id
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
        v_resp := jsonb_build_object(
            'success', true,
            'reason_code', 'PILOT_ALREADY_AUTHORIZED',
            'tenant_id', p_tenant_id,
            'authorization_id', v_active_auth_id,
            'changed', false,
            'replayed', false
        );
        PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_approve_tenant_pilot', v_fingerprint, v_resp);
        RETURN v_resp;
    END IF;

    -- 5. Insert new authorization row
    INSERT INTO public.tenant_pilot_authorizations (
        tenant_id,
        approved_at,
        approved_by,
        approved_reason
    ) VALUES (
        p_tenant_id,
        now(),
        v_actor_user_id,
        trim(p_reason)
    )
    RETURNING * INTO v_new_auth;

    -- 6. Write Audit Event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        p_tenant_id::text,
        v_actor_user_id::text,
        'super_admin',
        'tenant_pilot_approved',
        'tenant_pilot_authorizations',
        v_new_auth.id::text,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'approved_reason', trim(p_reason),
            'idempotency_key', p_idempotency_key
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'PILOT_AUTHORIZATION_APPROVED',
        'tenant_id', p_tenant_id,
        'authorization_id', v_new_auth.id,
        'approved_at', v_new_auth.approved_at,
        'changed', true,
        'replayed', false
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_approve_tenant_pilot', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$pilot_approve$;

REVOKE ALL ON FUNCTION public.super_admin_approve_tenant_pilot(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_approve_tenant_pilot(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 4. MUTATION CONTRACT: super_admin_revoke_tenant_pilot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_revoke_tenant_pilot(
    p_tenant_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pilot_revoke$
DECLARE
    v_actor_user_id     UUID;
    v_fingerprint       TEXT;
    v_cached_resp       JSONB;
    v_active_auth       RECORD;
    v_resp              JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'changed', false, 'replayed', false);
    END IF;

    -- 2. Validate inputs
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_key_required', 'changed', false, 'replayed', false);
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found', 'changed', false, 'replayed', false);
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_reason', 'changed', false, 'replayed', false);
    END IF;

    -- 3. Acquire Tenant-Scoped Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtextextended('tenant_pilot_authorization:' || p_tenant_id::text, 0));

    -- Check cached idempotency record
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, trim(p_reason)));

    BEGIN
        v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_revoke_tenant_pilot', v_fingerprint);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%IDEMPOTENCY_CONFLICT%' THEN
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict', 'changed', false, 'replayed', false);
            ELSE
                RAISE;
            END IF;
    END;

    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 4. Fetch active authorization row
    SELECT * INTO v_active_auth
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Check if tenant had history (already revoked) or never had authorization
        IF EXISTS (SELECT 1 FROM public.tenant_pilot_authorizations WHERE tenant_id = p_tenant_id) THEN
            v_resp := jsonb_build_object(
                'success', true,
                'reason_code', 'PILOT_ALREADY_REVOKED',
                'tenant_id', p_tenant_id,
                'changed', false,
                'replayed', false
            );
        ELSE
            v_resp := jsonb_build_object(
                'success', true,
                'reason_code', 'PILOT_NOT_AUTHORIZED',
                'tenant_id', p_tenant_id,
                'changed', false,
                'replayed', false
            );
        END IF;
        PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_revoke_tenant_pilot', v_fingerprint, v_resp);
        RETURN v_resp;
    END IF;

    -- 5. Revoke active authorization row
    UPDATE public.tenant_pilot_authorizations
    SET
        revoked_at = now(),
        revoked_by = v_actor_user_id,
        revoked_reason = trim(p_reason)
    WHERE id = v_active_auth.id;

    -- 6. Write Audit Event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        p_tenant_id::text,
        v_actor_user_id::text,
        'super_admin',
        'tenant_pilot_revoked',
        'tenant_pilot_authorizations',
        v_active_auth.id::text,
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'revoked_reason', trim(p_reason),
            'idempotency_key', p_idempotency_key
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'PILOT_AUTHORIZATION_REVOKED',
        'tenant_id', p_tenant_id,
        'authorization_id', v_active_auth.id,
        'revoked_at', now(),
        'changed', true,
        'replayed', false
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_revoke_tenant_pilot', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$pilot_revoke$;

REVOKE ALL ON FUNCTION public.super_admin_revoke_tenant_pilot(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_tenant_pilot(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 5. UPDATE ELIGIBILITY SNAPSHOT RPC (H1E-B INTEGRATION)
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

    -- Pilot authorization facts (H1E-B implemented)
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

    -- Precedence & evaluation variables
    v_blocking_reasons          TEXT[] := ARRAY[]::TEXT[];
    v_primary_reason            TEXT := null;
    v_eligible                  BOOLEAN := false;
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
        SELECT id INTO v_primary_branch_id
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true
        LIMIT 1;

        SELECT count(*)::INTEGER INTO v_primary_branch_count
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true;

        SELECT count(*)::INTEGER INTO v_active_service_count
        FROM public.services
        WHERE tenant_id = p_tenant_id AND active = true;

        SELECT count(*)::INTEGER INTO v_active_staff_count
        FROM public.staff
        WHERE tenant_id = p_tenant_id AND active = true;

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

            PERFORM 1
            FROM public.staff_services ss
            JOIN public.staff st
              ON st.id = ss.staff_id
             AND st.tenant_id = p_tenant_id
             AND st.active = true
            JOIN public.services se
              ON se.id = ss.service_id
             AND se.tenant_id = p_tenant_id
             AND se.active = true
            JOIN public.staff_branches stb
              ON stb.staff_id = st.id
             AND stb.branch_id = v_primary_branch_id
             AND stb.tenant_id = p_tenant_id
            JOIN public.service_branches seb
              ON seb.service_id = se.id
             AND seb.branch_id = v_primary_branch_id
             AND seb.tenant_id = p_tenant_id
            LIMIT 1;
            v_staff_can_perform_service := FOUND;
        END IF;

        IF v_primary_branch_count = 1 AND v_primary_branch_has_staff AND v_primary_branch_has_services AND v_staff_can_perform_service THEN
            v_rel_status := 'VERIFIED';
        ELSE
            v_rel_status := 'RELATIONSHIP_VERIFICATION_FAILED';
        END IF;

        -- Fetch active pilot authorization (H1E-B)
        SELECT * INTO v_active_auth_rec
        FROM public.tenant_pilot_authorizations
        WHERE tenant_id = p_tenant_id AND revoked_at IS NULL
        LIMIT 1;

        v_active_auth_found := FOUND;

        PERFORM 1 FROM public.tenant_pilot_authorizations WHERE tenant_id = p_tenant_id;
        v_has_auth_history := FOUND;

        -- Subscription & commercial facts
        SELECT status, billing_mode INTO v_sub_status, v_billing_mode
        FROM public.subscriptions
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at DESC
        LIMIT 1;
        v_sub_exists := FOUND;

        v_comm_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id, now());
        v_comm_eligible := COALESCE((v_comm_elig->>'eligible')::boolean, false);

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

        SELECT count(*)::INTEGER INTO v_active_restrictions_count
        FROM public.platform_system_restrictions
        WHERE (tenant_id = p_tenant_id OR tenant_id IS NULL)
          AND feature_key = 'core_booking'
          AND is_restricted = true
          AND starts_at <= now()
          AND (expires_at IS NULL OR expires_at > now());

        v_core_booking_restricted := (v_active_restrictions_count > 0);
    END IF;

    -- 5. Evaluate Blocking Reason Codes in Precedence Order
    IF v_release_phase != 'paymentless_pilot' AND v_release_phase != 'full_production' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'GLOBAL_RELEASE_PHASE_BLOCKED');
    END IF;

    IF NOT v_tenant_exists THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_NOT_FOUND');
    END IF;

    IF v_tenant_exists AND v_tenant_status IS DISTINCT FROM 'active' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_INACTIVE');
    END IF;

    IF v_tenant_exists AND v_core_booking_restricted THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'CORE_BOOKING_RESTRICTED');
    END IF;

    IF v_tenant_exists AND v_public_site_status IS DISTINCT FROM 'published' THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'PUBLIC_SITE_STATUS_BLOCKED');
    END IF;

    -- Pilot authorization precedence checks (H1E-B)
    IF v_tenant_exists AND NOT v_active_auth_found THEN
        IF v_has_auth_history THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REVOKED');
        ELSE
            v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REQUIRED');
        END IF;
    END IF;

    IF v_tenant_exists AND (NOT v_sub_exists OR v_sub_status IS DISTINCT FROM 'active' OR NOT v_comm_eligible) THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'SUBSCRIPTION_BLOCKED');
    END IF;

    IF v_tenant_exists AND v_core_entitlement_blocked THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'REQUIRED_ENTITLEMENT_BLOCKED');
    END IF;

    IF v_tenant_exists AND (v_primary_branch_count != 1 OR v_active_service_count < 1 OR v_active_staff_count < 1 OR v_rel_status != 'VERIFIED') THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'OPERATIONAL_READINESS_FAILED');
    END IF;

    IF array_length(v_blocking_reasons, 1) > 0 THEN
        v_primary_reason := v_blocking_reasons[1];
    ELSE
        v_primary_reason := 'BOOKING_ALLOWED';
    END IF;

    -- Calculate Booleans
    v_eligible := v_tenant_exists
      AND (v_tenant_status = 'active')
      AND NOT v_core_booking_restricted
      AND (v_public_site_status = 'published')
      AND v_sub_exists AND (v_sub_status = 'active') AND v_comm_eligible
      AND NOT v_core_entitlement_blocked
      AND (v_primary_branch_count = 1) AND (v_active_service_count >= 1) AND (v_active_staff_count >= 1) AND (v_rel_status = 'VERIFIED');

    -- authorized boolean is TRUE when active pilot authorization exists
    v_authorized := v_active_auth_found;
    v_bookable := false;   -- Pending H1E-C

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

    v_auth_facts := jsonb_build_object(
        'implementation_state', 'implemented',
        'authorization_id', CASE WHEN v_active_auth_found THEN v_active_auth_rec.id ELSE NULL END,
        'is_authorized', v_active_auth_found,
        'approved_at', CASE WHEN v_active_auth_found THEN v_active_auth_rec.approved_at ELSE NULL END,
        'approved_by', CASE WHEN v_active_auth_found THEN v_active_auth_rec.approved_by ELSE NULL END,
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
        'pilot_authorization', v_auth_facts,
        'relationship_verification', v_rel_verification,
        'entitlement_facts', v_entitlement_facts,
        'restriction_facts', v_restriction_facts
    );
END;
$eligibility_snapshot$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;
