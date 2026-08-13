-- Parallel Lane P2A — Server-Authoritative Owner Onboarding RPC Contracts & Least-Privilege Commercial Alignment (P2A.2-R2)
-- Governance: FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.

-- 1. Action Authorization Resolver Helper: Fail-closed least privilege during pending_onboarding status
CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_elig       JSONB;
    v_ent_row    RECORD;
    v_sub        RECORD;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_tenant_missing');
    END IF;

    SELECT status, plan_version_id INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC LIMIT 1;

    -- During pending_onboarding status, ONLY allow explicit onboarding management feature keys
    IF v_sub.status = 'pending_onboarding' THEN
        IF p_feature_key IN ('service_management', 'staff_management') THEN
            RETURN jsonb_build_object('allowed', true, 'reason_code', 'commercial_allowed');
        ELSE
            -- Fail-closed for all other feature keys (core_booking, customer_cancellation, unknown keys)
            RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_status_not_eligible');
        END IF;
    END IF;

    -- Standard check for non-onboarding statuses
    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id, p_at);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', v_elig->>'reason_code');
    END IF;

    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
    END IF;

    IF v_ent_row.value_type = 'boolean' THEN
        IF v_ent_row.boolean_value IS NOT TRUE THEN
            RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'commercial_allowed');
END;
$$;

-- 2. Quota Resolver Helper: Fail-closed least privilege quota resolution during pending_onboarding status
CREATE OR REPLACE FUNCTION public.resolve_commercial_quota(
    p_tenant_id UUID,
    p_feature_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ent_row RECORD;
    v_sub RECORD;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
    END IF;

    SELECT status, plan_version_id INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC LIMIT 1;

    -- For pending_onboarding status, resolve quotas strictly from allowlisted quota keys and matching plan entitlements
    IF v_sub.status = 'pending_onboarding' THEN
        IF v_sub.plan_version_id IS NULL THEN
            RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
        END IF;

        IF p_feature_key NOT IN ('max_branches', 'max_services', 'max_staff') THEN
            -- Fail-closed for unknown or non-allowlisted quota keys during pending_onboarding
            RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
        END IF;

        SELECT value_type, boolean_value, integer_value, is_unlimited INTO v_ent_row
        FROM public.plan_entitlements
        WHERE plan_version_id = v_sub.plan_version_id AND feature_key = p_feature_key;

        IF v_ent_row.value_type IS NULL THEN
            -- Missing plan entitlement row -> zero / denied
            RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
        END IF;

        IF v_ent_row.is_unlimited IS TRUE THEN
            RETURN jsonb_build_object('is_unlimited', true, 'limit_value', NULL);
        END IF;

        IF v_ent_row.value_type = 'integer' AND v_ent_row.integer_value IS NOT NULL THEN
            RETURN jsonb_build_object('is_unlimited', false, 'limit_value', v_ent_row.integer_value);
        END IF;

        -- Invalid entitlement shape -> zero / denied
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
    END IF;

    -- Standard 4-level entitlement resolution for active subscriptions
    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
    END IF;

    IF v_ent_row.is_unlimited IS TRUE THEN
        RETURN jsonb_build_object('is_unlimited', true, 'limit_value', NULL);
    END IF;

    IF v_ent_row.value_type = 'integer' AND v_ent_row.integer_value IS NOT NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', v_ent_row.integer_value);
    END IF;

    RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
END;
$$;

-- 3. Internal Helper: Derives readiness and transitions onboarding_status to 'ready_for_review' if required steps pass
CREATE OR REPLACE FUNCTION public.evaluate_owner_onboarding_readiness_internal(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_progress RECORD;
    v_tenant RECORD;
    v_prof RECORD;
    v_stored_name TEXT;
    v_service_count INT;
    v_staff_count INT;
    v_avail_count INT;
    v_salon_info BOOLEAN;
    v_services BOOLEAN;
    v_staff BOOLEAN;
    v_calendar BOOLEAN;
    v_is_ready BOOLEAN;
    v_next_step TEXT;
BEGIN
    SELECT * INTO v_progress FROM public.tenant_onboarding_progress WHERE tenant_id = p_tenant_id;
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    SELECT * INTO v_prof FROM public.tenant_business_profiles WHERE tenant_id = p_tenant_id;

    IF v_tenant.id IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant % does not exist', p_tenant_id;
    END IF;

    -- Compute salon_info_completed from stored truth (official_business_name, business_category, city, address, phone)
    v_stored_name := v_tenant.official_business_name;
    v_salon_info := (v_stored_name IS NOT NULL AND trim(v_stored_name) != '')
                AND (v_prof.business_category IS NOT NULL AND trim(v_prof.business_category) != '')
                AND (v_prof.city IS NOT NULL AND trim(v_prof.city) != '')
                AND (v_prof.address IS NOT NULL AND trim(v_prof.address) != '')
                AND (v_prof.phone IS NOT NULL AND trim(v_prof.phone) != '');

    -- Count active entities
    SELECT count(*) INTO v_service_count FROM public.services WHERE tenant_id = p_tenant_id AND active = true;
    SELECT count(*) INTO v_staff_count FROM public.staff WHERE tenant_id = p_tenant_id AND active = true;
    SELECT count(*) INTO v_avail_count FROM public.availability_rules WHERE tenant_id = p_tenant_id AND is_active = true;

    v_services := (v_service_count >= 1);
    v_staff := (v_staff_count >= 1);
    v_calendar := (v_avail_count >= 1);

    v_is_ready := v_salon_info AND v_services AND v_staff AND v_calendar;

    IF NOT v_salon_info THEN v_next_step := 'business_profile';
    ELSIF NOT v_services THEN v_next_step := 'services';
    ELSIF NOT v_staff THEN v_next_step := 'staff';
    ELSIF NOT v_calendar THEN v_next_step := 'calendar';
    ELSE v_next_step := NULL;
    END IF;

    -- Update onboarding progress table with exact evaluated completion state
    INSERT INTO public.tenant_onboarding_progress (
        tenant_id, salon_info_completed, services_completed, staff_completed, calendar_completed, updated_at
    ) VALUES (
        p_tenant_id, v_salon_info, v_services, v_staff, v_calendar, NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE
    SET salon_info_completed = EXCLUDED.salon_info_completed,
        services_completed = EXCLUDED.services_completed,
        staff_completed = EXCLUDED.staff_completed,
        calendar_completed = EXCLUDED.calendar_completed,
        updated_at = NOW();

    -- If ready and still in onboarding_required status, transition to ready_for_review
    -- Storefront remains draft (public_site_status = 'draft', is_public_profile_enabled = false, subscription status = 'pending_onboarding')
    IF v_is_ready AND v_tenant.onboarding_status = 'onboarding_required' THEN
        UPDATE public.tenants
        SET onboarding_status = 'ready_for_review',
            updated_at = NOW()
        WHERE id = p_tenant_id;

        UPDATE public.tenant_onboarding_progress
        SET reviewed_by_admin = false,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

        SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'onboarding_status', COALESCE(v_tenant.onboarding_status, 'onboarding_required'),
        'public_site_status', COALESCE(v_tenant.public_site_status, 'draft'),
        'salon_info_completed', v_salon_info,
        'services_completed', v_services,
        'staff_completed', v_staff,
        'calendar_completed', v_calendar,
        'is_owner_ready_for_review', v_is_ready,
        'next_step_id', v_next_step
    );
END;
$$;

-- Unique index for tenant_business_profiles tenant_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_business_profiles_tenant_id 
ON public.tenant_business_profiles (tenant_id);

-- 4. RPC: Save Owner Business Profile (Zero Fabricated Fallbacks)
CREATE OR REPLACE FUNCTION public.save_owner_business_profile(
    p_business_name TEXT DEFAULT NULL,
    p_business_display_name TEXT DEFAULT NULL,
    p_business_category TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_short_description TEXT DEFAULT NULL,
    p_about_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
    v_tenant_row RECORD;
    v_existing_profile RECORD;
    v_final_name TEXT;
    v_final_cat TEXT;
    v_final_city TEXT;
    v_final_addr TEXT;
    v_final_phone TEXT;
    v_readiness JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    SELECT * INTO v_tenant_row FROM public.tenants WHERE id = v_tenant_id;
    SELECT * INTO v_existing_profile FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_id;

    -- Zero fabricated fallbacks: inherit from existing profile or tenant registration input
    v_final_cat := COALESCE(NULLIF(trim(p_business_category), ''), v_existing_profile.business_category, v_tenant_row.category);
    v_final_city := COALESCE(NULLIF(trim(p_city), ''), v_existing_profile.city, v_tenant_row.city);
    v_final_addr := COALESCE(NULLIF(trim(p_address), ''), v_existing_profile.address);
    v_final_phone := COALESCE(NULLIF(trim(p_phone), ''), v_existing_profile.phone, v_tenant_row.phone);

    IF v_existing_profile.id IS NOT NULL THEN
        UPDATE public.tenant_business_profiles
        SET business_category = v_final_cat,
            city = v_final_city,
            address = v_final_addr,
            phone = v_final_phone,
            short_description = COALESCE(NULLIF(trim(p_short_description), ''), short_description),
            about_text = COALESCE(NULLIF(trim(p_about_text), ''), about_text),
            is_public_profile_enabled = false,
            updated_at = NOW()
        WHERE tenant_id = v_tenant_id;
    ELSE
        INSERT INTO public.tenant_business_profiles (
            tenant_id, business_category, city, address, phone, short_description, about_text, is_public_profile_enabled, updated_at
        )
        VALUES (
            v_tenant_id,
            v_final_cat,
            v_final_city,
            v_final_addr,
            v_final_phone,
            NULLIF(trim(p_short_description), ''),
            NULLIF(trim(p_about_text), ''),
            false,
            NOW()
        );
    END IF;

    IF p_business_name IS NOT NULL AND trim(p_business_name) != '' THEN
        UPDATE public.tenants
        SET official_business_name = trim(p_business_name),
            public_display_name = COALESCE(NULLIF(trim(p_business_display_name), ''), trim(p_business_name)),
            name = trim(p_business_name),
            updated_at = NOW()
        WHERE id = v_tenant_id;
    END IF;

    -- Evaluate readiness using stored truth
    v_readiness := public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'salon_info_completed', v_readiness->'salon_info_completed',
        'is_owner_ready_for_review', v_readiness->'is_owner_ready_for_review',
        'onboarding_status', v_readiness->'onboarding_status'
    );
END;
$$;

-- 5. RPC: Create Owner First Branch (Canonical Schema Matching: name & timezone)
CREATE OR REPLACE FUNCTION public.create_owner_first_branch(
    p_name TEXT DEFAULT 'Alsancak Şubesi',
    p_timezone TEXT DEFAULT 'Europe/Istanbul'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_is_new BOOLEAN := false;
    v_readiness JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    -- Lock branch creation namespace for this tenant to prevent duplicate concurrent primary branches
    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text || ':first_branch', 0));

    -- Check if primary branch already exists for this tenant
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;

    IF v_branch_id IS NULL THEN
        -- Create primary branch with server-side UUID generation
        v_branch_id := gen_random_uuid();
        INSERT INTO public.branches (
            id, tenant_id, name, timezone, is_primary, is_active, created_at, updated_at
        ) VALUES (
            v_branch_id,
            v_tenant_id,
            COALESCE(NULLIF(trim(p_name), ''), 'Alsancak Şubesi'),
            COALESCE(NULLIF(trim(p_timezone), ''), 'Europe/Istanbul'),
            true,
            true,
            NOW(),
            NOW()
        );
        v_is_new := true;
    ELSE
        -- Update existing primary branch
        UPDATE public.branches
        SET name = COALESCE(NULLIF(trim(p_name), ''), name),
            timezone = COALESCE(NULLIF(trim(p_timezone), ''), timezone),
            updated_at = NOW()
        WHERE id = v_branch_id;
    END IF;

    v_readiness := public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'is_new', v_is_new,
        'onboarding_status', v_readiness->'onboarding_status'
    );
END;
$$;

-- 6. RPC: Create Owner First Service
CREATE OR REPLACE FUNCTION public.create_owner_first_service(
    p_name TEXT DEFAULT 'Cilt Bakımı & Medikal Maske',
    p_duration INT DEFAULT 60,
    p_price NUMERIC DEFAULT 450.00,
    p_category TEXT DEFAULT 'Cilt Bakımı'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
    v_service_id UUID;
    v_readiness JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_SERVICE_NAME: Service name cannot be empty';
    END IF;

    IF p_duration IS NULL OR p_duration <= 0 THEN
        RAISE EXCEPTION 'INVALID_SERVICE_DURATION: Duration must be greater than zero';
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'INVALID_SERVICE_PRICE: Price cannot be negative';
    END IF;

    v_service_id := gen_random_uuid();
    INSERT INTO public.services (
        id, tenant_id, name, duration, price, category, active, created_at, updated_at
    ) VALUES (
        v_service_id,
        v_tenant_id,
        trim(p_name),
        p_duration,
        p_price,
        COALESCE(NULLIF(trim(p_category), ''), 'Genel'),
        true,
        NOW(),
        NOW()
    );

    v_readiness := public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'service_id', v_service_id,
        'onboarding_status', v_readiness->'onboarding_status'
    );
END;
$$;

-- 7. RPC: Create Owner First Staff
CREATE OR REPLACE FUNCTION public.create_owner_first_staff(
    p_name TEXT DEFAULT 'Ayşe Uzman',
    p_service_ids UUID[] DEFAULT '{}',
    p_work_days INT[] DEFAULT '{1,2,3,4,5,6}',
    p_start_time TIME DEFAULT '09:00:00',
    p_end_time TIME DEFAULT '18:00:00'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_staff_id UUID;
    v_service_id UUID;
    v_day INT;
    v_foreign_count INT;
    v_readiness JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_STAFF_NAME: Staff name cannot be empty';
    END IF;

    -- Strict Cross-Tenant Mapping Check: Fail atomically if any requested service does not belong to owner tenant!
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        SELECT count(*) INTO v_foreign_count
        FROM public.services
        WHERE id = ANY(p_service_ids) AND tenant_id = v_tenant_id;

        IF v_foreign_count != array_length(p_service_ids, 1) THEN
            RAISE EXCEPTION 'FOREIGN_TENANT_SERVICE_REJECTED: Requested services belong to another tenant or do not exist';
        END IF;
    END IF;

    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;

    IF v_branch_id IS NULL THEN
        v_branch_id := gen_random_uuid();
        INSERT INTO public.branches (
            id, tenant_id, name, timezone, is_primary, is_active, created_at, updated_at
        ) VALUES (
            v_branch_id, v_tenant_id, 'Alsancak Şubesi', 'Europe/Istanbul', true, true, NOW(), NOW()
        );
    END IF;

    -- Server-side staff ID generation
    v_staff_id := gen_random_uuid();
    INSERT INTO public.staff (
        id, tenant_id, name, active, created_at, updated_at
    ) VALUES (
        v_staff_id, v_tenant_id, trim(p_name), true, NOW(), NOW()
    );

    -- Branch association (satisfying NOT NULL tenant_id)
    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
    VALUES (v_tenant_id, v_staff_id, v_branch_id)
    ON CONFLICT (staff_id, branch_id) DO NOTHING;

    -- Service mappings
    IF p_service_ids IS NOT NULL THEN
        FOREACH v_service_id IN ARRAY p_service_ids LOOP
            INSERT INTO public.staff_services (staff_id, service_id)
            VALUES (v_staff_id, v_service_id)
            ON CONFLICT (staff_id, service_id) DO NOTHING;
        END LOOP;
    END IF;

    -- Availability rules setup
    IF p_work_days IS NOT NULL THEN
        FOREACH v_day IN ARRAY p_work_days LOOP
            INSERT INTO public.availability_rules (
                id, tenant_id, staff_id, weekday, start_time, end_time, is_active, created_at
            ) VALUES (
                gen_random_uuid(),
                v_tenant_id,
                v_staff_id,
                v_day,
                COALESCE(p_start_time, '09:00:00'::TIME),
                COALESCE(p_end_time, '18:00:00'::TIME),
                true,
                NOW()
            )
            ON CONFLICT (tenant_id, staff_id, weekday) DO UPDATE
            SET start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                is_active = true;
        END LOOP;
    END IF;

    v_readiness := public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'staff_id', v_staff_id,
        'onboarding_status', v_readiness->'onboarding_status'
    );
END;
$$;

-- Unique index for availability_rules to support idempotent weekday upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_rules_tenant_staff_weekday 
ON public.availability_rules (tenant_id, staff_id, weekday);

-- 8. RPC: Get Owner Onboarding State
CREATE OR REPLACE FUNCTION public.get_owner_onboarding_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    RETURN public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);
END;
$$;

-- 9. RPC: Evaluate Owner Onboarding Readiness
CREATE OR REPLACE FUNCTION public.evaluate_owner_onboarding_readiness()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    RETURN public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);
END;
$$;

-- Revoke public execution from non-owner RPCs where appropriate
REVOKE EXECUTE ON FUNCTION public.evaluate_owner_onboarding_readiness_internal(UUID) FROM PUBLIC, anon;
