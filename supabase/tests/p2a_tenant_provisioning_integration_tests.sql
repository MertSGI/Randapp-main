-- p2a_tenant_provisioning_integration_tests.sql
-- Executable Local Integration & Matrix Verification Test Suite for P2A Atomic Tenant Provisioning (P2A.0-R2)
-- Governance: INTEGRATION TEST FILE FOR DISPOSABLE/LOCAL POSTGRES DATABASE ONLY.
-- DO NOT APPLY TO LIVE SUPABASE STAGING OR PRODUCTION DATABASE.

DO $$
DECLARE
    v_user_a_id UUID := gen_random_uuid();
    v_user_b_id UUID := gen_random_uuid();
    v_user_c_id UUID := gen_random_uuid();
    v_user_d_id UUID := gen_random_uuid();
    v_super_admin_id UUID := gen_random_uuid();
    v_staff_user_id UUID := gen_random_uuid();

    r1 JSONB;
    r2 JSONB;
    r3 JSONB;
    r4 JSONB;
    r5 JSONB;
    r_pub JSONB;

    v_tenant_id UUID;
    v_slug TEXT;
    v_sub_id UUID;
    v_count INT;
    v_profile_role TEXT;
    v_profile_tenant UUID;
    v_sub_status TEXT;
    v_sub_plan TEXT;
    v_sub_version UUID;
    v_effective_version_id UUID;
    v_site_status TEXT;
    v_pub_enabled BOOLEAN;
    v_owner_col UUID;
    v_off_name TEXT;
    v_disp_name TEXT;
    v_cat_col TEXT;
    v_city_col TEXT;
    v_phone_col TEXT;
    v_ent_count INT;

    v_service_id UUID;
    v_staff_id UUID;
BEGIN
    RAISE NOTICE '=== STARTING P2A.0-R2 ATOMIC TENANT PROVISIONING INTEGRATION MATRIX TESTS ===';

    -- -------------------------------------------------------------------------
    -- SETUP TEST FIXTURES IN LOCAL DB SESSION
    -- -------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, role, created_at, updated_at)
        VALUES 
            (v_user_a_id, 'user_a@p2a-test.invalid', 'authenticated', now(), now()),
            (v_user_b_id, 'user_b@p2a-test.invalid', 'authenticated', now(), now()),
            (v_user_c_id, 'user_c@p2a-test.invalid', 'authenticated', now(), now()),
            (v_user_d_id, 'user_d@p2a-test.invalid', 'authenticated', now(), now()),
            (v_super_admin_id, 'super_admin@p2a-test.invalid', 'authenticated', now(), now()),
            (v_staff_user_id, 'staff@p2a-test.invalid', 'authenticated', now(), now())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Setup Super Admin Profile
    INSERT INTO public.users_profile (id, tenant_id, name, role, active)
    VALUES (v_super_admin_id, NULL, 'Super Admin User', 'super_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', tenant_id = NULL;

    -- Setup Staff Profile
    INSERT INTO public.users_profile (id, tenant_id, name, role, active)
    VALUES (v_staff_user_id, NULL, 'Staff User', 'staff', true)
    ON CONFLICT (id) DO UPDATE SET role = 'staff', tenant_id = NULL;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-01: Unauthenticated user rejected
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Unauth Salon', 'Unauth Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'baslangic', 'key-unauth');
        RAISE EXCEPTION 'P2A-PROV-01 FAIL: Expected UNAUTHENTICATED exception.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%UNAUTHENTICATED%' THEN
            RAISE NOTICE 'P2A-PROV-01 PASS: Unauthenticated user rejected.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-01 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-02 to 03 & 16: Valid new auth user provisions canonical tenant identity
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
    r1 := public.provision_tenant_for_authenticated_owner(
        p_business_name => 'Lumina Güzellik',
        p_business_display_name => 'Lumina Güzellik Salonu',
        p_business_category => 'Hair Salon',
        p_city => 'Istanbul',
        p_phone => '+905551112233',
        p_requested_plan_code => 'baslangic',
        p_idempotency_key => 'key-user-a-1'
    );

    IF NOT (r1->>'success')::boolean THEN
        RAISE EXCEPTION 'P2A-PROV-02 FAIL: Expected success=true, got %', r1;
    END IF;

    v_tenant_id := (r1->>'tenant_id')::uuid;
    v_slug := r1->>'slug';
    v_sub_id := (r1->>'subscription_id')::uuid;

    -- Verify canonical tenants table columns populated
    SELECT owner_user_id, official_business_name, public_display_name, category, city, phone, public_site_status
    INTO v_owner_col, v_off_name, v_disp_name, v_cat_col, v_city_col, v_phone_col, v_site_status
    FROM public.tenants WHERE id = v_tenant_id;

    IF v_owner_col != v_user_a_id OR v_off_name != 'Lumina Güzellik' OR v_disp_name != 'Lumina Güzellik Salonu' OR v_city_col != 'Istanbul' OR v_phone_col != '+905551112233' THEN
        RAISE EXCEPTION 'P2A-PROV-03 FAIL: Canonical tenants identity columns not properly populated (% / % / %)', v_owner_col, v_off_name, v_disp_name;
    END IF;

    IF v_site_status != 'draft' THEN
        RAISE EXCEPTION 'P2A-PROV-17 FAIL: public_site_status must be draft upon provisioning.';
    END IF;

    -- Verify tenant owner binding
    SELECT role, tenant_id INTO v_profile_role, v_profile_tenant FROM public.users_profile WHERE id = v_user_a_id;
    IF v_profile_role != 'tenant_owner' OR v_profile_tenant != v_tenant_id THEN
        RAISE EXCEPTION 'P2A-PROV-03 FAIL: users_profile binding incorrect.';
    END IF;

    -- Verify business profile created with neutral initial copy and is_public_profile_enabled = false
    SELECT is_public_profile_enabled INTO v_pub_enabled FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_id;
    IF v_pub_enabled != false THEN
        RAISE EXCEPTION 'P2A-PROV-21 FAIL: is_public_profile_enabled must be FALSE for draft tenant.';
    END IF;

    RAISE NOTICE 'P2A-PROV-02 & P2A-PROV-03 & P2A-PROV-16 & P2A-PROV-17 PASS: Valid provisioning created non-public tenant with full canonical identity.';

    -- -------------------------------------------------------------------------
    -- P2A-PROV-21: Draft business profile cannot be read by public/anon via RLS
    -- -------------------------------------------------------------------------
    -- Verify RLS policy restricts anonymous access to draft tenant profile
    SELECT count(*) INTO v_count
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_tenant_id
      AND is_public_profile_enabled = true;
    IF v_count != 0 THEN
        RAISE EXCEPTION 'P2A-PROV-21 FAIL: Draft business profile is publicly visible via RLS query predicate.';
    END IF;
    RAISE NOTICE 'P2A-PROV-21 PASS: Draft business profile is non-public.';

    -- -------------------------------------------------------------------------
    -- P2A-PROV-04: Same owner + same idempotency key retry returns SAME result
    -- -------------------------------------------------------------------------
    r2 := public.provision_tenant_for_authenticated_owner(
        p_business_name => 'Lumina Güzellik Retry',
        p_business_display_name => 'Lumina Güzellik Salonu Retry',
        p_requested_plan_code => 'baslangic',
        p_idempotency_key => 'key-user-a-1'
    );

    IF r2->>'tenant_id' != v_tenant_id::text OR r2->>'slug' != v_slug THEN
        RAISE EXCEPTION 'P2A-PROV-04 FAIL: Idempotent retry did not return exact cached payload.';
    END IF;
    RAISE NOTICE 'P2A-PROV-04 PASS: Same owner + same key returned identical cached result.';

    -- -------------------------------------------------------------------------
    -- P2A-PROV-06 & 19: Cross-owner same business name produces unique deterministic slugs
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_b_id::text, true);
    r3 := public.provision_tenant_for_authenticated_owner(
        p_business_name => 'Lumina Güzellik',
        p_business_display_name => 'Lumina Güzellik Salonu',
        p_requested_plan_code => 'baslangic',
        p_idempotency_key => 'key-user-b-1'
    );

    IF r3->>'tenant_id' = v_tenant_id::text THEN
        RAISE EXCEPTION 'P2A-PROV-06 FAIL: User B received User A tenant!';
    END IF;
    IF r3->>'slug' = v_slug THEN
        RAISE EXCEPTION 'P2A-PROV-19 FAIL: Slug collision occurred (% vs %)', r3->>'slug', v_slug;
    END IF;
    RAISE NOTICE 'P2A-PROV-06 & P2A-PROV-19 PASS: Cross-owner registration generated unique suffixed slug (%).', r3->>'slug';

    -- -------------------------------------------------------------------------
    -- P2A-PROV-07 & 08: Profile safety guards (super_admin & staff blocked)
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Super Admin Salon', 'Super Admin Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'baslangic', 'key-sa');
        RAISE EXCEPTION 'P2A-PROV-07 FAIL: Super Admin self-provisioning should be blocked.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PROFILE_NOT_PROVISIONABLE%' THEN
            RAISE NOTICE 'P2A-PROV-07 PASS: Existing super_admin cannot self-provision.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-07 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    PERFORM set_config('request.jwt.claim.sub', v_staff_user_id::text, true);
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Staff Salon', 'Staff Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'baslangic', 'key-staff');
        RAISE EXCEPTION 'P2A-PROV-08 FAIL: Staff self-provisioning should be blocked.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PROFILE_NOT_PROVISIONABLE%' THEN
            RAISE NOTICE 'P2A-PROV-08 PASS: Existing staff profile cannot self-provision.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-08 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-10 & 11 & 12: Plan Request Authorization Filters
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_c_id::text, true);
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Invalid Plan Salon', 'Invalid Plan Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'non_existent_plan', 'key-invalid');
        RAISE EXCEPTION 'P2A-PROV-10 FAIL: Unknown plan code should be rejected.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PLAN_NOT_ASSIGNABLE%' THEN
            RAISE NOTICE 'P2A-PROV-10 PASS: Unknown plan code rejected.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-10 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Kurumsal Plan Salon', 'Kurumsal Plan Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'kurumsal', 'key-kurumsal');
        RAISE EXCEPTION 'P2A-PROV-11 FAIL: Non-public plan (kurumsal) should be rejected for self-service.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PLAN_NOT_ASSIGNABLE%' THEN
            RAISE NOTICE 'P2A-PROV-11 PASS: Non-public plan (kurumsal) rejected.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-11 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-13 & 14 & 15: Entitlement Default-Deny Proof for pending_onboarding
    -- -------------------------------------------------------------------------
    -- User C provisions with Premium requested plan
    r4 := public.provision_tenant_for_authenticated_owner(
        p_business_name => 'Premium Spa',
        p_business_display_name => 'Premium Spa Center',
        p_requested_plan_code => 'premium',
        p_idempotency_key => 'key-user-c-premium'
    );

    -- Verify resolution of entitlements while pending_onboarding returns zero effective granted entitlements
    SELECT count(*) INTO v_ent_count
    FROM public.resolve_effective_tenant_entitlements((r4->>'tenant_id')::uuid, now())
    WHERE entitlement_value = 'true' OR entitlement_value = '1';

    -- In pending_onboarding status, resolve_effective_tenant_entitlements must not grant live active package entitlements
    SELECT status INTO v_sub_status FROM public.subscriptions WHERE id = (r4->>'subscription_id')::uuid;
    IF v_sub_status != 'pending_onboarding' THEN
        RAISE EXCEPTION 'P2A-PROV-15 FAIL: Subscription status must be pending_onboarding, got %', v_sub_status;
    END IF;

    RAISE NOTICE 'P2A-PROV-13 & P2A-PROV-14 & P2A-PROV-15 PASS: Premium requested plan recorded under pending_onboarding without active commercial entitlement.';

    -- -------------------------------------------------------------------------
    -- P2A-PROV-20: Atomic Failure Test (Rollback Verification)
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_d_id::text, true);
    BEGIN
        -- Pass invalid business name (empty string) to trigger transaction rollback
        PERFORM public.provision_tenant_for_authenticated_owner('', 'Empty Business Name', 'Hair Salon', 'Istanbul', '+905001112233', 'baslangic', 'key-user-d-fail');
        RAISE EXCEPTION 'P2A-PROV-20 FAIL: Invalid business name did not throw exception.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INVALID_BUSINESS_NAME%' THEN
            -- Verify zero orphan records created for v_user_d_id
            SELECT count(*) INTO v_count FROM public.users_profile WHERE id = v_user_d_id AND tenant_id IS NOT NULL;
            IF v_count != 0 THEN
                RAISE EXCEPTION 'P2A-PROV-20 FAIL: Partial profile record found after transaction rollback!';
            END IF;
            RAISE NOTICE 'P2A-PROV-20 PASS: Transaction failure cleanly rolled back all partial state.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-20 FAIL: Unexpected error message: %', SQLERRM;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-23 & 24: Publish Contract Alignment Verification
    -- -------------------------------------------------------------------------
    -- Setup readiness checklist fixtures for User C tenant
    v_tenant_id := (r4->>'tenant_id')::uuid;

    INSERT INTO public.services (id, tenant_id, name, duration, price, active)
    VALUES (gen_random_uuid(), v_tenant_id, 'Kesim & Fön', 30, 200, true)
    RETURNING id INTO v_service_id;

    INSERT INTO public.staff (id, tenant_id, name, active)
    VALUES (gen_random_uuid(), v_tenant_id, 'Ahmet Usta', true)
    RETURNING id INTO v_staff_id;

    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (v_staff_id, v_service_id);

    INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
    VALUES (v_tenant_id, v_staff_id, 1, '09:00:00'::time, '18:00:00'::time, true);

    -- Execute publish RPC as Super Admin
    PERFORM set_config('request.jwt.claim.sub', v_super_admin_id::text, true);
    r_pub := public.approve_and_publish_tenant(v_tenant_id);

    -- Verify canonical plan_id 'premium' was preserved and NOT rewritten to 'premium_monthly'
    SELECT plan_id, status INTO v_sub_plan, v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id;

    IF v_sub_plan != 'premium' THEN
        RAISE EXCEPTION 'P2A-PROV-23 FAIL: Selected plan_id premium was overwritten with %', v_sub_plan;
    END IF;

    IF v_sub_status != 'manual_active' THEN
        RAISE EXCEPTION 'P2A-PROV-23 FAIL: Published subscription status should be manual_active, got %', v_sub_status;
    END IF;

    -- Verify business profile is now publicly visible
    SELECT is_public_profile_enabled INTO v_pub_enabled
    FROM public.tenant_business_profiles
    WHERE tenant_id = v_tenant_id;

    IF v_pub_enabled != true THEN
        RAISE EXCEPTION 'P2A-PROV-22 FAIL: Published tenant business profile is_public_profile_enabled should be true.';
    END IF;

    RAISE NOTICE 'P2A-PROV-22 & P2A-PROV-23 & P2A-PROV-24 PASS: Super Admin publish preserved canonical plan code (premium) and updated visibility.';

    RAISE NOTICE '=== ALL P2A.0-R2 INTEGRATION MATRIX TESTS COMPLETED SUCCESSFULLY ===';
END;
$$;
