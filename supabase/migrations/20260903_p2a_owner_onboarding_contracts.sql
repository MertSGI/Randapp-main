-- 20260903_p2a_owner_onboarding_contracts.sql
-- Parallel Lane P2A — Server-Authoritative Owner Onboarding RPC Contracts & Readiness Derivation (P2A.2-R1)
-- Governance: FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.

-- Internal Helper: Derives readiness and transitions onboarding_status to 'ready_for_review' if all 4 required steps pass
CREATE OR REPLACE FUNCTION public.evaluate_owner_onboarding_readiness_internal(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_progress RECORD;
    v_tenant RECORD;
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

    IF v_tenant.id IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant % does not exist', p_tenant_id;
    END IF;

    -- Count active entities
    SELECT count(*) INTO v_service_count FROM public.services WHERE tenant_id = p_tenant_id AND active = true;
    SELECT count(*) INTO v_staff_count FROM public.staff WHERE tenant_id = p_tenant_id AND active = true;
    SELECT count(*) INTO v_avail_count FROM public.availability_rules WHERE tenant_id = p_tenant_id AND is_active = true;

    v_salon_info := COALESCE(v_progress.salon_info_completed, false);
    v_services := (v_service_count >= 1) OR COALESCE(v_progress.services_completed, false);
    v_staff := (v_staff_count >= 1) OR COALESCE(v_progress.staff_completed, false);
    v_calendar := (v_avail_count >= 1) OR COALESCE(v_progress.calendar_completed, false);

    v_is_ready := v_salon_info AND v_services AND v_staff AND v_calendar;

    IF NOT v_salon_info THEN v_next_step := 'business_profile';
    ELSIF NOT v_services THEN v_next_step := 'services';
    ELSIF NOT v_staff THEN v_next_step := 'staff';
    ELSIF NOT v_calendar THEN v_next_step := 'availability';
    ELSE v_next_step := NULL;
    END IF;

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

-- 1. RPC: Save Owner Business Profile
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
    v_existing_profile RECORD;
    v_is_complete BOOLEAN;
    v_final_name TEXT;
    v_final_cat TEXT;
    v_final_city TEXT;
    v_final_addr TEXT;
    v_final_phone TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    SELECT * INTO v_existing_profile FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_id;

    v_final_cat := COALESCE(trim(p_business_category), v_existing_profile.business_category);
    v_final_city := COALESCE(trim(p_city), v_existing_profile.city);
    v_final_addr := COALESCE(trim(p_address), v_existing_profile.address);
    v_final_phone := COALESCE(trim(p_phone), v_existing_profile.phone);

    INSERT INTO public.tenant_business_profiles (
        tenant_id, business_category, city, address, phone, short_description, about_text, is_public_profile_enabled, updated_at
    )
    VALUES (
        v_tenant_id,
        COALESCE(v_final_cat, 'Güzellik Salonu'),
        COALESCE(v_final_city, 'İstanbul'),
        COALESCE(v_final_addr, 'Merkez Adres'),
        COALESCE(v_final_phone, ''),
        trim(p_short_description),
        trim(p_about_text),
        false, -- Draft privacy strictly preserved!
        NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        business_category = COALESCE(EXCLUDED.business_category, tenant_business_profiles.business_category),
        city = COALESCE(EXCLUDED.city, tenant_business_profiles.city),
        address = COALESCE(EXCLUDED.address, tenant_business_profiles.address),
        phone = COALESCE(EXCLUDED.phone, tenant_business_profiles.phone),
        short_description = COALESCE(EXCLUDED.short_description, tenant_business_profiles.short_description),
        about_text = COALESCE(EXCLUDED.about_text, tenant_business_profiles.about_text),
        is_public_profile_enabled = false,
        updated_at = NOW();

    IF p_business_name IS NOT NULL AND trim(p_business_name) != '' THEN
        UPDATE public.tenants
        SET official_business_name = trim(p_business_name),
            public_display_name = COALESCE(trim(p_business_display_name), trim(p_business_name)),
            name = trim(p_business_name),
            updated_at = NOW()
        WHERE id = v_tenant_id;
    END IF;

    SELECT official_business_name INTO v_final_name FROM public.tenants WHERE id = v_tenant_id;

    -- SALON_INFO_COMPLETION_PREDICATE: real required business fields check without fabricated defaults
    v_is_complete := (v_final_name IS NOT NULL AND trim(v_final_name) != '')
                 AND (v_final_cat IS NOT NULL AND trim(v_final_cat) != '')
                 AND (v_final_city IS NOT NULL AND trim(v_final_city) != '')
                 AND (v_final_addr IS NOT NULL AND trim(v_final_addr) != '')
                 AND (v_final_phone IS NOT NULL AND trim(v_final_phone) != '');

    INSERT INTO public.tenant_onboarding_progress (tenant_id, salon_info_completed, updated_at)
    VALUES (v_tenant_id, v_is_complete, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET
        salon_info_completed = v_is_complete,
        updated_at = NOW();

    PERFORM public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'salon_info_completed', v_is_complete
    );
END;
$$;

-- 2. RPC: Create Owner First Branch (Server-side UUID + Concurrency/Idempotency Safe)
CREATE OR REPLACE FUNCTION public.create_owner_first_branch(
    p_name TEXT DEFAULT 'Merkez Şube',
    p_city TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
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
    v_existing_id UUID;
    v_branch_id UUID;
    v_clean_name TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    v_clean_name := COALESCE(trim(p_name), 'Merkez Şube');
    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'INVALID_BRANCH_NAME: Branch name cannot be empty';
    END IF;

    -- Concurrency lock on tenant_id for branch creation
    PERFORM pg_advisory_xact_lock(hashtext('branch_create_' || v_tenant_id::text));

    -- Check if primary branch exists
    SELECT id INTO v_existing_id FROM public.branches WHERE tenant_id = v_tenant_id AND is_primary = true LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'branch_id', v_existing_id, 'is_new', false);
    END IF;

    v_branch_id := gen_random_uuid();

    INSERT INTO public.branches (
        id, tenant_id, name, timezone, is_primary, is_active, created_at, updated_at
    )
    VALUES (
        v_branch_id,
        v_tenant_id,
        v_clean_name,
        COALESCE(trim(p_timezone), 'Europe/Istanbul'),
        true,
        true,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'branch_id', v_branch_id, 'is_new', true);
END;
$$;

-- 3. RPC: Create Owner First Service (Server-side UUID + Validation)
CREATE OR REPLACE FUNCTION public.create_owner_first_service(
    p_name TEXT,
    p_duration INT DEFAULT 30,
    p_price NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_id UUID;
    v_tenant_id UUID;
    v_existing_id UUID;
    v_service_id UUID;
    v_clean_name TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    v_clean_name := trim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'INVALID_SERVICE_NAME: Service name cannot be empty';
    END IF;

    IF p_duration IS NULL OR p_duration <= 0 THEN
        RAISE EXCEPTION 'INVALID_DURATION: Service duration must be greater than zero';
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'INVALID_PRICE: Service price cannot be negative';
    END IF;

    -- Check idempotent existing service by name
    SELECT id INTO v_existing_id FROM public.services WHERE tenant_id = v_tenant_id AND name = v_clean_name AND active = true LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'service_id', v_existing_id, 'is_new', false);
    END IF;

    v_service_id := gen_random_uuid();

    INSERT INTO public.services (
        id, tenant_id, name, duration, price, active, created_at, updated_at
    )
    VALUES (
        v_service_id, v_tenant_id, v_clean_name, p_duration, p_price, true, NOW(), NOW()
    );

    INSERT INTO public.tenant_onboarding_progress (tenant_id, services_completed, updated_at)
    VALUES (v_tenant_id, true, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET services_completed = true, updated_at = NOW();

    PERFORM public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object('success', true, 'service_id', v_service_id, 'is_new', true);
END;
$$;

-- Unique index for availability rules idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_rules_tenant_staff_weekday 
ON public.availability_rules (tenant_id, staff_id, weekday);

-- 4. RPC: Create Owner First Staff (Atomic Staff + Service Mapping + Branch + Availability Rules)
CREATE OR REPLACE FUNCTION public.create_owner_first_staff(
    p_name TEXT,
    p_service_ids UUID[] DEFAULT ARRAY[]::UUID[],
    p_work_days INT[] DEFAULT ARRAY[1,2,3,4,5,6]::INT[],
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
    v_existing_id UUID;
    v_clean_name TEXT;
    v_foreign_count INT;
    v_sid UUID;
    v_day INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User session required';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.users_profile WHERE id = v_caller_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NOT_OWNER: User profile has no active tenant_id';
    END IF;

    v_clean_name := trim(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'INVALID_STAFF_NAME: Staff name cannot be empty';
    END IF;

    -- Strict Cross-Tenant Mapping Check: Fail atomically if any requested service belongs to another tenant!
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        SELECT count(*) INTO v_foreign_count
        FROM public.services
        WHERE id = ANY(p_service_ids) AND tenant_id != v_tenant_id;

        IF v_foreign_count > 0 THEN
            RAISE EXCEPTION 'FOREIGN_TENANT_SERVICE_REJECTED: Requested services belong to another tenant';
        END IF;
    END IF;

    -- Resolve primary branch for staff association
    SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id AND is_primary = true LIMIT 1;
    IF v_branch_id IS NULL THEN
        SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id LIMIT 1;
    END IF;

    IF v_branch_id IS NULL THEN
        v_branch_id := gen_random_uuid();
        INSERT INTO public.branches (id, tenant_id, name, timezone, is_primary, is_active, created_at, updated_at)
        VALUES (v_branch_id, v_tenant_id, 'Merkez Şube', 'Europe/Istanbul', true, true, NOW(), NOW());
    END IF;

    -- Check existing staff by name
    SELECT id INTO v_existing_id FROM public.staff WHERE tenant_id = v_tenant_id AND name = v_clean_name AND active = true LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
        v_staff_id := v_existing_id;
    ELSE
        v_staff_id := gen_random_uuid();
        INSERT INTO public.staff (id, tenant_id, name, active, created_at, updated_at)
        VALUES (v_staff_id, v_tenant_id, v_clean_name, true, NOW(), NOW());
    END IF;

    -- Branch association
    INSERT INTO public.staff_branches (staff_id, branch_id)
    VALUES (v_staff_id, v_branch_id)
    ON CONFLICT (staff_id, branch_id) DO NOTHING;

    -- Service mappings
    IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
        FOREACH v_sid IN ARRAY p_service_ids LOOP
            INSERT INTO public.staff_services (staff_id, service_id)
            VALUES (v_staff_id, v_sid)
            ON CONFLICT (staff_id, service_id) DO NOTHING;
        END LOOP;
    END IF;

    -- Availability rules
    IF p_work_days IS NOT NULL AND array_length(p_work_days, 1) > 0 THEN
        FOREACH v_day IN ARRAY p_work_days LOOP
            DELETE FROM public.availability_rules WHERE tenant_id = v_tenant_id AND staff_id = v_staff_id AND weekday = v_day;
            INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
            VALUES (v_tenant_id, v_staff_id, v_day, COALESCE(p_start_time, '09:00:00'::TIME), COALESCE(p_end_time, '18:00:00'::TIME), true);
        END LOOP;
    END IF;

    INSERT INTO public.tenant_onboarding_progress (tenant_id, staff_completed, calendar_completed, updated_at)
    VALUES (v_tenant_id, true, true, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET staff_completed = true, calendar_completed = true, updated_at = NOW();

    PERFORM public.evaluate_owner_onboarding_readiness_internal(v_tenant_id);

    RETURN jsonb_build_object('success', true, 'staff_id', v_staff_id, 'branch_id', v_branch_id);
END;
$$;

-- 5. RPC: Get Owner Onboarding State
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

-- 6. RPC: Evaluate Owner Onboarding Readiness
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

-- ACL Grants
REVOKE EXECUTE ON FUNCTION public.save_owner_business_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_owner_business_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_owner_first_branch(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_owner_first_branch(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_owner_first_service(TEXT, INT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_owner_first_service(TEXT, INT, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_owner_first_staff(TEXT, UUID[], INT[], TIME, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_owner_first_staff(TEXT, UUID[], INT[], TIME, TIME) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_owner_onboarding_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_onboarding_state() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.evaluate_owner_onboarding_readiness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_owner_onboarding_readiness() TO authenticated;
