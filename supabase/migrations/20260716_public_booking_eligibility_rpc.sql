-- Description: Public, atomic RPC to resolve public booking eligibility by slug.
-- Accept slug, return safe non-billing metadata.

CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_sub_exists boolean;
    v_sub_status text;
    v_allowed boolean := false;
    v_reason_code text := 'ok';
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'reason_code', 'tenant_not_found'
        );
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'tenant_inactive'
        );
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'onboarding_incomplete'
        );
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'site_unpublished'
        );
    END IF;

    -- 5. Query manual active or active subscription status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = v_tenant_id
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    -- Canonical allowed active statuses: 'active', 'manual_active', 'comped', 'trialing'
    IF v_sub_status IS DISTINCT FROM 'active' 
       AND v_sub_status IS DISTINCT FROM 'manual_active' 
       AND v_sub_status IS DISTINCT FROM 'comped' 
       AND v_sub_status IS DISTINCT FROM 'trialing' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    -- 6. All checks passed
    RETURN jsonb_build_object(
        'found', true,
        'allowed', true,
        'reason_code', 'ok'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Explicit Function Permissions
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM authenticated;

-- Grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO authenticated;
