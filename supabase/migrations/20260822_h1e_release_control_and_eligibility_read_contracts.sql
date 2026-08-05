-- =========================================================================
-- MIGRATION 47: H1E-A GLOBAL RELEASE CONTROL & ELIGIBILITY READ CONTRACTS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_global_release_control (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    release_phase TEXT NOT NULL DEFAULT 'pre_pilot' CHECK (release_phase IN ('pre_pilot', 'paymentless_pilot', 'full_production')),
    is_production_authorized BOOLEAN NOT NULL DEFAULT false,
    is_pilot_enforcement_required BOOLEAN NOT NULL DEFAULT true,
    is_payment_collection_enabled BOOLEAN NOT NULL DEFAULT false,
    is_checkout_enabled BOOLEAN NOT NULL DEFAULT false,
    is_iyzico_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID REFERENCES public.users_profile(id),
    updated_reason TEXT NOT NULL DEFAULT 'Initial migration seeding' CHECK (trim(updated_reason) != ''),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_checkout_requires_payment CHECK (NOT is_checkout_enabled OR is_payment_collection_enabled),
    CONSTRAINT chk_iyzico_requires_checkout CHECK (NOT is_iyzico_enabled OR is_checkout_enabled),
    CONSTRAINT chk_iyzico_requires_payment CHECK (NOT is_iyzico_enabled OR is_payment_collection_enabled),
    CONSTRAINT chk_paymentless_pilot_no_payments CHECK (
        release_phase != 'paymentless_pilot' OR (
            NOT is_payment_collection_enabled AND NOT is_checkout_enabled AND NOT is_iyzico_enabled
        )
    )
);

ALTER TABLE public.platform_global_release_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_global_release_control FROM PUBLIC, anon, authenticated;

INSERT INTO public.platform_global_release_control (
    id, release_phase, is_production_authorized, is_pilot_enforcement_required,
    is_payment_collection_enabled, is_checkout_enabled, is_iyzico_enabled, updated_reason, updated_at
) VALUES (
    1, 'pre_pilot', false, true, false, false, false, 'Initial safe seed for Stage H1E-A', now()
) ON CONFLICT (id) DO NOTHING;

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
    v_tenant                    RECORD;
    v_release_ctrl              RECORD;
    v_primary_branch_count      INTEGER := 0;
    v_active_service_count      INTEGER := 0;
    v_active_staff_count        INTEGER := 0;
    v_sub                       RECORD;
    v_active_restrictions_count INTEGER := 0;
    v_core_booking_restricted   BOOLEAN := false;
    v_blocking_reasons          TEXT[] := ARRAY[]::TEXT[];
    v_primary_reason            TEXT;
    v_eligible                  BOOLEAN := false;
    v_authorized                BOOLEAN := false;
    v_bookable                  BOOLEAN := false;
    v_prod_authorized           BOOLEAN := false;
    v_readiness_facts           JSONB;
    v_global_release_facts      JSONB;
    v_transitional_auth         JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'timestamp', now());
    END IF;

    SELECT * INTO v_release_ctrl FROM public.platform_global_release_control WHERE id = 1;

    IF NOT FOUND THEN
        v_primary_reason := 'RELEASE_CONTROL_UNAVAILABLE';
        v_blocking_reasons := array_append(v_blocking_reasons, 'RELEASE_CONTROL_UNAVAILABLE');
    ELSE
        v_prod_authorized := v_release_ctrl.is_production_authorized;
        IF v_release_ctrl.release_phase = 'pre_pilot' THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'GLOBAL_RELEASE_PHASE_BLOCKED');
        END IF;
    END IF;

    IF p_tenant_id IS NULL THEN
        v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_NOT_FOUND');
    ELSE
        SELECT id, name, slug, public_site_status INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
        IF NOT FOUND THEN
            v_blocking_reasons := array_append(v_blocking_reasons, 'TENANT_NOT_FOUND');
        END IF;
    END IF;

    IF v_tenant.id IS NOT NULL THEN
        SELECT count(*) INTO v_primary_branch_count FROM public.branches WHERE tenant_id = v_tenant.id AND is_primary = true;
        SELECT count(*) INTO v_active_service_count FROM public.services WHERE tenant_id = v_tenant.id AND is_active = true;
        SELECT count(*) INTO v_active_staff_count FROM public.staff WHERE tenant_id = v_tenant.id AND is_active = true;
        SELECT status, billing_mode INTO v_sub FROM public.subscriptions WHERE tenant_id = v_tenant.id ORDER BY created_at DESC LIMIT 1;
        SELECT count(*), COALESCE(bool_or(feature_key = 'core_booking'), false) INTO v_active_restrictions_count, v_core_booking_restricted FROM public.platform_system_restrictions WHERE (tenant_id = v_tenant.id OR tenant_id IS NULL) AND is_restricted = true AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now());

        IF v_core_booking_restricted THEN v_blocking_reasons := array_append(v_blocking_reasons, 'CORE_BOOKING_RESTRICTED'); END IF;
        IF v_tenant.public_site_status IS DISTINCT FROM 'published' THEN v_blocking_reasons := array_append(v_blocking_reasons, 'PUBLIC_SITE_STATUS_BLOCKED'); END IF;
        v_blocking_reasons := array_append(v_blocking_reasons, 'PILOT_AUTHORIZATION_REQUIRED');
        IF v_sub.status IS NULL OR v_sub.status NOT IN ('active', 'comped', 'manual_active', 'trialing') THEN v_blocking_reasons := array_append(v_blocking_reasons, 'SUBSCRIPTION_BLOCKED'); END IF;
        IF v_primary_branch_count = 0 OR v_active_service_count = 0 OR v_active_staff_count = 0 THEN v_blocking_reasons := array_append(v_blocking_reasons, 'OPERATIONAL_READINESS_FAILED'); END IF;

        IF v_primary_branch_count > 0 AND v_active_service_count > 0 AND v_active_staff_count > 0 AND v_sub.status IN ('active', 'comped', 'manual_active', 'trialing') THEN v_eligible := true; END IF;
    END IF;

    IF v_release_ctrl.id IS NULL THEN v_primary_reason := 'RELEASE_CONTROL_UNAVAILABLE';
    ELSIF v_release_ctrl.release_phase = 'pre_pilot' THEN v_primary_reason := 'GLOBAL_RELEASE_PHASE_BLOCKED';
    ELSIF v_tenant.id IS NULL THEN v_primary_reason := 'TENANT_NOT_FOUND';
    ELSIF v_core_booking_restricted THEN v_primary_reason := 'CORE_BOOKING_RESTRICTED';
    ELSIF v_tenant.public_site_status IS DISTINCT FROM 'published' THEN v_primary_reason := 'PUBLIC_SITE_STATUS_BLOCKED';
    ELSIF array_position(v_blocking_reasons, 'PILOT_AUTHORIZATION_REQUIRED') IS NOT NULL THEN v_primary_reason := 'PILOT_AUTHORIZATION_REQUIRED';
    ELSIF v_sub.status IS NULL OR v_sub.status NOT IN ('active', 'comped', 'manual_active', 'trialing') THEN v_primary_reason := 'SUBSCRIPTION_BLOCKED';
    ELSIF NOT v_eligible THEN v_primary_reason := 'OPERATIONAL_READINESS_FAILED';
    ELSE v_primary_reason := 'BOOKING_ALLOWED';
    END IF;

    v_readiness_facts := jsonb_build_object(
        'tenant_exists', (v_tenant.id IS NOT NULL),
        'tenant_active', (v_tenant.id IS NOT NULL),
        'primary_branch_count', v_primary_branch_count,
        'active_service_count', v_active_service_count,
        'active_staff_count', v_active_staff_count,
        'relationships_valid', (v_primary_branch_count > 0 AND v_active_service_count > 0 AND v_active_staff_count > 0),
        'slug_resolved', COALESCE(v_tenant.slug, null),
        'public_site_status', COALESCE(v_tenant.public_site_status, 'unknown'),
        'subscription_status', COALESCE(v_sub.status, 'none'),
        'billing_mode', COALESCE(v_sub.billing_mode, 'manual'),
        'active_restrictions_count', v_active_restrictions_count
    );

    v_global_release_facts := jsonb_build_object(
        'release_phase', COALESCE(v_release_ctrl.release_phase, 'pre_pilot'),
        'is_production_authorized', COALESCE(v_release_ctrl.is_production_authorized, false),
        'is_pilot_enforcement_required', COALESCE(v_release_ctrl.is_pilot_enforcement_required, true),
        'is_payment_collection_enabled', COALESCE(v_release_ctrl.is_payment_collection_enabled, false),
        'is_checkout_enabled', COALESCE(v_release_ctrl.is_checkout_enabled, false),
        'is_iyzico_enabled', COALESCE(v_release_ctrl.is_iyzico_enabled, false)
    );

    v_transitional_auth := jsonb_build_object(
        'implementation_state', 'pending_h1e_b',
        'authorization_id', null,
        'is_authorized', false,
        'approved_at', null,
        'approved_by', null,
        'revoked_at', null,
        'revoked_by', null
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
        'pilot_authorization', v_transitional_auth
    );
END;
$eligibility_snapshot$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_pilot_eligibility_snapshot(UUID) TO authenticated;
