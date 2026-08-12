-- 20260901_p2a_atomic_tenant_provisioning_rpc.sql
-- Parallel Lane P2A — Server-Authoritative Atomic Tenant Provisioning & Onboarding Initialization RPC
-- Governance: FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.
-- Description:
--   Provisions a new tenant atomically and idempotently for an authenticated user (auth.uid()).
--   Creates:
--     1. public.tenants (with unique slug generation and status = 'active', onboarding_status = 'onboarding_required')
--     2. public.users_profile (upsert/bind id = auth.uid(), role = 'tenant_owner', tenant_id = new_tenant_id)
--     3. public.tenant_business_profiles (initial details)
--     4. public.tenant_branding (initial branding)
--     5. public.subscriptions (initial baseline subscription assigned to 'baslangic' Version 1 active/manual)
--     6. public.tenant_onboarding_progress (initial state machine setup)
-- Security:
--   - SECURITY DEFINER hardened with search_path = pg_catalog, public
--   - Strict auth.uid() identity binding — caller CANNOT pass arbitrary tenant_id or owner_user_id
--   - Idempotency via idempotency_key in public.admin_mutation_idempotency or profile check
--   - No service_role key required by client

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    result_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_provisioning_idempotency ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.provision_tenant_for_authenticated_owner(
    p_business_name TEXT,
    p_business_display_name TEXT,
    p_business_category TEXT DEFAULT 'Hair Salon',
    p_city TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_requested_plan_code TEXT DEFAULT 'baslangic',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_email TEXT;
    v_existing_profile RECORD;
    v_tenant_id UUID;
    v_base_slug TEXT;
    v_slug TEXT;
    v_counter INT := 0;
    v_plan_id UUID;
    v_plan_ver_id UUID;
    v_sub_id UUID;
    v_result JSONB;
    v_cached_payload JSONB;
BEGIN
    -- 1. Authentication check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Must be authenticated to provision a tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- Extract caller email from JWT or auth.users
    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT result_payload INTO v_cached_payload
        FROM public.tenant_provisioning_idempotency
        WHERE idempotency_key = trim(p_idempotency_key)
          AND owner_user_id = v_caller_id;

        IF v_cached_payload IS NOT NULL THEN
            RETURN v_cached_payload;
        END IF;
    END IF;

    -- 3. Check if user profile already belongs to a tenant
    SELECT id, tenant_id, role INTO v_existing_profile
    FROM public.users_profile
    WHERE id = v_caller_id;

    IF v_existing_profile.tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'USER_ALREADY_HAS_TENANT: User profile % already belongs to tenant %.', v_caller_id, v_existing_profile.tenant_id USING ERRCODE = 'P0001';
    END IF;

    -- Validate input
    IF trim(COALESCE(p_business_name, '')) = '' THEN
        RAISE EXCEPTION 'INVALID_BUSINESS_NAME: Business name cannot be empty.' USING ERRCODE = 'P0001';
    END IF;

    -- 4. Deterministic and Unique Slug Generation
    v_base_slug := lower(regexp_replace(COALESCE(p_business_display_name, p_business_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
    IF v_base_slug = '' THEN
        v_base_slug := 'salon';
    END IF;

    v_slug := v_base_slug;
    LOOP
        PERFORM 1 FROM public.tenants WHERE slug = v_slug;
        EXIT WHEN NOT FOUND;
        v_counter := v_counter + 1;
        v_slug := v_base_slug || '-' || v_counter;
    END LOOP;

    -- 5. Create Tenant Row
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (
        id,
        slug,
        name,
        status,
        provisioning_status,
        go_live_status,
        onboarding_status,
        public_site_status,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        v_slug,
        trim(p_business_name),
        'active',
        'onboarding_required',
        'draft',
        'onboarding_required',
        'draft',
        now(),
        now()
    );

    -- 6. Upsert/Bind users_profile as tenant_owner
    INSERT INTO public.users_profile (
        id,
        tenant_id,
        name,
        role,
        active,
        created_at,
        updated_at
    ) VALUES (
        v_caller_id,
        v_tenant_id,
        trim(p_business_name) || ' Owner',
        'tenant_owner',
        true,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = v_tenant_id,
        role = 'tenant_owner',
        active = true,
        updated_at = now();

    -- 7. Create Business Profile Details
    INSERT INTO public.tenant_business_profiles (
        tenant_id,
        display_name,
        category,
        city,
        phone,
        email,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        COALESCE(trim(p_business_display_name), trim(p_business_name)),
        COALESCE(p_business_category, 'Hair Salon'),
        p_city,
        p_phone,
        v_caller_email,
        now(),
        now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 8. Create Default Branding
    INSERT INTO public.tenant_branding (
        tenant_id,
        business_name,
        primary_color,
        address,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        COALESCE(trim(p_business_display_name), trim(p_business_name)),
        '#4f46e5',
        p_city,
        now(),
        now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 9. Resolve Plan & Assign Baseline Subscription
    SELECT p.id, pv.id INTO v_plan_id, v_plan_ver_id
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.version_number = 1
    WHERE p.code = lower(trim(p_requested_plan_code))
      AND pv.lifecycle_status = 'published'
    LIMIT 1;

    IF v_plan_ver_id IS NULL THEN
        -- Fallback to baslangic
        SELECT p.id, pv.id INTO v_plan_id, v_plan_ver_id
        FROM public.plans p
        JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.version_number = 1
        WHERE p.code = 'baslangic'
          AND pv.lifecycle_status = 'published'
        LIMIT 1;
    END IF;

    v_sub_id := gen_random_uuid();
    INSERT INTO public.subscriptions (
        id,
        tenant_id,
        plan_id,
        plan_version_id,
        status,
        billing_mode,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
    ) VALUES (
        v_sub_id,
        v_tenant_id,
        COALESCE(lower(trim(p_requested_plan_code)), 'baslangic'),
        v_plan_ver_id,
        'active',
        'manual',
        now(),
        now() + interval '1 year',
        now(),
        now()
    );

    -- 10. Initialize Onboarding State Machine
    INSERT INTO public.tenant_onboarding_progress (
        tenant_id,
        salon_info_completed,
        branding_completed,
        whatsapp_completed,
        services_completed,
        staff_completed,
        calendar_completed,
        test_appointment_completed,
        reviewed_by_admin,
        live_enabled,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        true, -- Business details captured during signup
        true, -- Default branding initialized
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        now(),
        now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 11. Build Response JSON
    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'role', 'tenant_owner',
        'onboarding_status', 'onboarding_required',
        'subscription_id', v_sub_id,
        'plan_code', COALESCE(lower(trim(p_requested_plan_code)), 'baslangic')
    );

    -- Record Idempotency Result if Key Provided
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.tenant_provisioning_idempotency (
            idempotency_key,
            tenant_id,
            owner_user_id,
            result_payload,
            created_at
        ) VALUES (
            trim(p_idempotency_key),
            v_tenant_id,
            v_caller_id,
            v_result,
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN v_result;
END;
$$;

-- Revoke public grants and restrict to authenticated
REVOKE EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
