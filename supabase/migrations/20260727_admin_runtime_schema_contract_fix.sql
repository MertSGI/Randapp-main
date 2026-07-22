-- 20260727_admin_runtime_schema_contract_fix.sql
-- Description: Stage B.2 Repair - Fixes PostgreSQL 42703 runtime errors in admin read model RPCs:
-- 1. get_my_admin_bootstrap(): replaces non-existent website/instagram_handle columns with website_url/instagram_url from public.tenant_business_profiles.
-- 2. get_my_tenant_appointments(uuid): replaces non-existent a.user_id with a.customer_id from public.appointments.
-- Migration count after this file: 21

-- =========================================================================
-- 1. PUBLIC.GET_MY_ADMIN_BOOTSTRAP() REPAIR
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_admin_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_profile          record;
    v_tenant           record;
    v_business_profile record;
    v_services         jsonb;
    v_staff            jsonb;
    v_branches         jsonb;
    v_subscription     jsonb;
    v_tz               text := 'Europe/Istanbul';
BEGIN
    -- Reject unauthenticated callers
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Resolve user profile
    SELECT id, tenant_id, role, active
    INTO v_profile
    FROM public.users_profile
    WHERE id = v_user_id;

    IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.active IS NOT TRUE
       OR v_profile.role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Load tenant
    SELECT id, name, slug, status, created_at, updated_at,
           verification_status, public_site_status, business_risk_status,
           onboarding_status, category, city, district, phone, address,
           official_business_name, public_display_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_profile.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- Load business profile (may not exist) - using actual canonical columns: website_url, instagram_url
    SELECT tenant_id, business_category, city, district, address, phone, whatsapp_number,
           website_url, instagram_url,
           logo_url, cover_image_url, is_public_profile_enabled, public_display_name
    INTO v_business_profile
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Load active services
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'name_tr', s.name_tr,
            'duration', s.duration,
            'price', s.price,
            'active', s.active,
            'category', s.category
        ) ORDER BY s.name ASC
    )
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_profile.tenant_id AND s.active = true;

    -- Load active staff
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'title', st.title,
            'active', st.active,
            'is_owner', st.is_owner
        ) ORDER BY st.name ASC
    )
    INTO v_staff
    FROM public.staff st
    WHERE st.tenant_id = v_profile.tenant_id AND st.active = true;

    -- Load active branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'slug', b.slug,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'timezone', b.timezone
        ) ORDER BY b.is_primary DESC, b.name ASC
    )
    INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_profile.tenant_id AND b.is_active = true;

    -- Resolve tenant timezone from primary branch
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_profile.tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN v_tz := 'Europe/Istanbul'; END IF;

    -- Load subscription summary (safe fields only, no provider secrets)
    SELECT jsonb_build_object(
        'plan_id', sub.plan_id,
        'status', sub.status,
        'billing_source', sub.billing_source,
        'paid_through_date', sub.paid_through_date,
        'trial_end', sub.trial_end,
        'cancel_at_period_end', sub.cancel_at_period_end
    )
    INTO v_subscription
    FROM public.subscriptions sub
    WHERE sub.tenant_id = v_profile.tenant_id
    LIMIT 1;

    -- Return consolidated payload
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'status', v_tenant.status,
            'verification_status', v_tenant.verification_status,
            'public_site_status', v_tenant.public_site_status,
            'business_risk_status', v_tenant.business_risk_status,
            'onboarding_status', v_tenant.onboarding_status,
            'official_business_name', v_tenant.official_business_name,
            'public_display_name', v_tenant.public_display_name,
            'category', v_tenant.category,
            'city', v_tenant.city,
            'district', v_tenant.district,
            'created_at', v_tenant.created_at
        ),
        'business_profile', CASE
            WHEN v_business_profile.tenant_id IS NOT NULL THEN jsonb_build_object(
                'business_category', v_business_profile.business_category,
                'city', v_business_profile.city,
                'district', v_business_profile.district,
                'address', v_business_profile.address,
                'phone', v_business_profile.phone,
                'whatsapp_number', v_business_profile.whatsapp_number,
                'website', v_business_profile.website_url,
                'website_url', v_business_profile.website_url,
                'instagram_handle', v_business_profile.instagram_url,
                'instagram_url', v_business_profile.instagram_url,
                'logo_url', v_business_profile.logo_url,
                'cover_image_url', v_business_profile.cover_image_url,
                'is_public_profile_enabled', v_business_profile.is_public_profile_enabled,
                'public_display_name', v_business_profile.public_display_name
            )
            ELSE NULL
        END,
        'services', COALESCE(v_services, '[]'::jsonb),
        'staff', COALESCE(v_staff, '[]'::jsonb),
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'subscription', v_subscription,
        'timezone', v_tz,
        'user_role', v_profile.role
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_admin_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap() TO authenticated;


-- =========================================================================
-- 2. PUBLIC.GET_MY_TENANT_APPOINTMENTS(UUID) REPAIR
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_appointments(
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_role      text;
    v_active    boolean;
    v_res       jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'appointments', '[]'::jsonb);
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden', 'appointments', '[]'::jsonb);
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'appointments', '[]'::jsonb);
        END IF;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'branch_id', a.branch_id,
            'user_id', a.customer_id,
            'customer_id', a.customer_id,
            'user_name', a.user_name,
            'user_email', a.user_email,
            'phone', a.phone,
            'service_id', a.service_id,
            'staff_id', a.staff_id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', a.duration_minutes,
            'status', a.status,
            'notes', a.notes,
            'cancel_reason', a.cancel_reason,
            'cancelled_at', a.cancelled_at,
            'cancelled_by', a.cancelled_by,
            'created_at', a.created_at
        ) ORDER BY a.appointment_date ASC, a.appointment_time ASC
    )
    INTO v_res
    FROM public.appointments a
    WHERE a.tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'appointments', COALESCE(v_res, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) TO authenticated;
