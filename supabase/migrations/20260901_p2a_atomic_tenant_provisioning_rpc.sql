-- 20260901_p2a_atomic_tenant_provisioning_rpc.sql
-- Parallel Lane P2A — Server-Authoritative Hardened Atomic Tenant Provisioning & Onboarding Initialization RPC (P2A.0-R2)
-- Governance: FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.
-- Description:
--   Provisions a new tenant atomically and idempotently for an authenticated user (auth.uid()).
--   P2A.0-R2 Schema Truth & Privacy Safeguards:
--     1. Populates canonical public.tenants columns (owner_user_id, official_business_name, public_display_name, category, city, phone, name, slug).
--     2. Business profile draft privacy: tenant_business_profiles.is_public_profile_enabled set to FALSE initially.
--     3. Forward-hardens public SELECT policy on tenant_business_profiles so anonymous public reads require is_public_profile_enabled = true AND tenant.public_site_status = 'published' AND tenant.onboarding_status = 'completed'.
--     4. Neutral initial business profile description (no premature 'online randevu kabul etmeye başlamıştır' claims).
--     5. Concurrency: Dual pg_advisory_xact_lock (owner-scoped & base-slug-scoped) preventing both same-owner and cross-owner slug race conditions.
--     6. Canonical plan request validation & effective plan_version resolution. Pre-commercial subscription status set to 'pending_onboarding' (billing_mode = 'manual').
-- Security:
--   - SECURITY DEFINER hardened with search_path = pg_catalog, public
--   - Strict auth.uid() identity binding
--   - REVOKE EXECUTE from PUBLIC and anon; GRANT EXECUTE to authenticated

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_idempotency (
    idempotency_key TEXT NOT NULL CHECK (trim(idempotency_key) != ''),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    result_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_user_id, idempotency_key)
);

ALTER TABLE public.tenant_provisioning_idempotency ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.provision_tenant_for_authenticated_owner(
    p_business_name TEXT,
    p_business_display_name TEXT DEFAULT NULL,
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
    v_resolved_plan_code TEXT;
    v_effective_version_count INT;
    v_sub_id UUID;
    v_result JSONB;
    v_cached_payload JSONB;
    v_clean_idempotency_key TEXT;
    v_official_name TEXT;
    v_display_name TEXT;
    v_category TEXT;
BEGIN
    -- 1. Authentication check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Must be authenticated to provision a tenant.' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Owner-Scoped Concurrency Serialization
    PERFORM pg_advisory_xact_lock(hashtextextended(v_caller_id::text, 9283741));

    -- Extract caller email from auth.users
    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

    -- 3. Idempotency Check (Owner-Scoped)
    v_clean_idempotency_key := trim(COALESCE(p_idempotency_key, ''));
    IF v_clean_idempotency_key = '' THEN
        RAISE EXCEPTION 'MISSING_IDEMPOTENCY_KEY: Self-service tenant provisioning requires a valid non-empty idempotency key.' USING ERRCODE = 'P0001';
    END IF;

    SELECT result_payload INTO v_cached_payload
    FROM public.tenant_provisioning_idempotency
    WHERE owner_user_id = v_caller_id
      AND idempotency_key = v_clean_idempotency_key;

    IF v_cached_payload IS NOT NULL THEN
        RETURN v_cached_payload;
    END IF;

    -- 4. Existing Profile Safety Check
    SELECT id, tenant_id, role, active INTO v_existing_profile
    FROM public.users_profile
    WHERE id = v_caller_id;

    IF v_existing_profile.id IS NOT NULL THEN
        -- If profile already has a tenant_id, or is super_admin, staff, or tenant_owner, reject provisioning
        IF v_existing_profile.tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'USER_ALREADY_HAS_TENANT: User profile % already belongs to tenant %.', v_caller_id, v_existing_profile.tenant_id USING ERRCODE = 'P0001';
        END IF;

        IF v_existing_profile.role IN ('super_admin', 'staff', 'tenant_owner') THEN
            RAISE EXCEPTION 'PROFILE_NOT_PROVISIONABLE: Profile role % is not eligible for self-service tenant provisioning.', v_existing_profile.role USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Validate business name
    v_official_name := trim(COALESCE(p_business_name, ''));
    IF v_official_name = '' THEN
        RAISE EXCEPTION 'INVALID_BUSINESS_NAME: Business name cannot be empty.' USING ERRCODE = 'P0001';
    END IF;

    v_display_name := trim(COALESCE(p_business_display_name, v_official_name));
    v_category := COALESCE(trim(p_business_category), 'Hair Salon');

    -- 5. Canonical Plan Selection & Authorization Validation
    v_resolved_plan_code := lower(trim(COALESCE(p_requested_plan_code, 'baslangic')));

    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE code = v_resolved_plan_code
      AND is_active = true
      AND is_assignable = true
      AND is_public = true;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'PLAN_NOT_ASSIGNABLE: Requested plan code % is invalid, inactive, non-public, or not assignable for public self-service.', v_resolved_plan_code USING ERRCODE = 'P0001';
    END IF;

    -- Resolve currently effective published plan_version_id
    SELECT count(*) INTO v_effective_version_count
    FROM public.plan_versions
    WHERE plan_id = v_plan_id
      AND lifecycle_status = 'published'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now());

    IF v_effective_version_count = 0 THEN
        RAISE EXCEPTION 'NO_EFFECTIVE_PLAN_VERSION: No currently effective published plan version found for plan %.', v_resolved_plan_code USING ERRCODE = 'P0001';
    ELSIF v_effective_version_count > 1 THEN
        RAISE EXCEPTION 'MULTIPLE_EFFECTIVE_PLAN_VERSIONS: Ambiguous published plan versions detected for plan %.', v_resolved_plan_code USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_plan_ver_id
    FROM public.plan_versions
    WHERE plan_id = v_plan_id
      AND lifecycle_status = 'published'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now())
    LIMIT 1;

    -- 6. Deterministic and Unique Slug Generation with Cross-Owner Advisory Lock
    v_base_slug := lower(regexp_replace(v_display_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
    IF v_base_slug = '' THEN
        v_base_slug := 'salon';
    END IF;

    -- Lock slug namespace to prevent cross-owner slug generation race conditions
    PERFORM pg_advisory_xact_lock(hashtextextended(v_base_slug, 8823910));

    v_slug := v_base_slug;
    LOOP
        PERFORM 1 FROM public.tenants WHERE slug = v_slug;
        EXIT WHEN NOT FOUND;
        v_counter := v_counter + 1;
        v_slug := v_base_slug || '-' || v_counter;
    END LOOP;

    -- 7. Create Tenant Row (Populating Complete Canonical Identity & Draft Status)
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (
        id,
        slug,
        name,
        official_business_name,
        public_display_name,
        owner_user_id,
        category,
        city,
        phone,
        status,
        provisioning_status,
        go_live_status,
        onboarding_status,
        public_site_status,
        verification_status,
        business_risk_status,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        v_slug,
        v_display_name,
        v_official_name,
        v_display_name,
        v_caller_id,
        v_category,
        p_city,
        p_phone,
        'active',
        'onboarding_required',
        'draft',
        'onboarding_required',
        'draft',
        'not_submitted',
        'normal',
        now(),
        now()
    );

    -- 8. Upsert/Bind users_profile as tenant_owner
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
        v_display_name || ' Owner',
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

    -- 9. Create Business Profile Details (Neutral Initial Copy & is_public_profile_enabled = false)
    INSERT INTO public.tenant_business_profiles (
        tenant_id,
        short_description,
        about_text,
        business_category,
        address,
        city,
        phone,
        email,
        is_public_profile_enabled,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        NULL,
        NULL,
        v_category,
        p_city,
        p_city,
        p_phone,
        v_caller_email,
        false, -- Draft business profile MUST NOT be public initially
        now(),
        now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 10. Create Default Branding
    INSERT INTO public.tenant_branding (
        tenant_id,
        business_name,
        primary_color,
        address,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        v_display_name,
        '#4f46e5',
        p_city,
        now(),
        now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 11. Assign Non-Entitlement-Active Baseline Subscription Record
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
        v_resolved_plan_code,
        v_plan_ver_id,
        'pending_onboarding',
        'manual',
        now(),
        now() + interval '1 year',
        now(),
        now()
    );

    -- 12. Initialize Onboarding State Machine (Checklist Starts Incomplete)
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
        false,
        false,
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

    -- 13. Audit Log Entry
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
        v_caller_id::text,
        'tenant_owner',
        'tenant_provisioned',
        'tenants',
        v_tenant_id::text,
        jsonb_build_object(
            'slug', v_slug,
            'plan_code', v_resolved_plan_code,
            'plan_version_id', v_plan_ver_id,
            'subscription_status', 'pending_onboarding'
        )
    );

    -- 14. Build Response JSON
    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'role', 'tenant_owner',
        'onboarding_status', 'onboarding_required',
        'subscription_id', v_sub_id,
        'plan_code', v_resolved_plan_code,
        'plan_version_id', v_plan_ver_id,
        'subscription_status', 'pending_onboarding'
    );

    -- 15. Record Idempotency Result
    INSERT INTO public.tenant_provisioning_idempotency (
        idempotency_key,
        owner_user_id,
        tenant_id,
        result_payload,
        created_at
    ) VALUES (
        v_clean_idempotency_key,
        v_caller_id,
        v_tenant_id,
        v_result,
        now()
    ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

    RETURN v_result;
END;
$$;

-- Forward-Harden Public RLS Policy on tenant_business_profiles
DROP POLICY IF EXISTS "Public can view enabled business profiles" ON public.tenant_business_profiles;
CREATE POLICY "Public can view enabled and published business profiles"
    ON public.tenant_business_profiles
    FOR SELECT TO public
    USING (
        is_public_profile_enabled = true
        AND EXISTS (
            SELECT 1 FROM public.tenants t
            WHERE t.id = tenant_business_profiles.tenant_id
              AND t.status IN ('active', 'manual_active')
              AND t.onboarding_status = 'completed'
              AND t.public_site_status = 'published'
        )
    );

-- Revoke public execution permissions
REVOKE EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.provision_tenant_for_authenticated_owner(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
