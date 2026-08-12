-- p2a_tenant_provisioning_integration_tests.sql
-- Executable Local Integration & Matrix Verification Test Suite for P2A Atomic Tenant Provisioning (P2A.0-R1)
-- Governance: INTEGRATION TEST FILE FOR LOCAL/DISPOSABLE POSTGRES DATABASE ONLY.
-- DO NOT APPLY TO LIVE SUPABASE STAGING OR PRODUCTION DATABASE.

DO $$
DECLARE
    v_user_a_id UUID := gen_random_uuid();
    v_user_b_id UUID := gen_random_uuid();
    v_super_admin_id UUID := gen_random_uuid();
    v_staff_user_id UUID := gen_random_uuid();
    
    r1 JSONB;
    r2 JSONB;
    r3 JSONB;
    
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
    v_onboarding_salon_info BOOLEAN;
    v_site_status TEXT;
BEGIN
    RAISE NOTICE '=== STARTING P2A.0-R1 ATOMIC TENANT PROVISIONING INTEGRATION MATRIX TESTS ===';

    -- -------------------------------------------------------------------------
    -- SETUP TEST FIXTURES IN LOCAL DB SESSION
    -- -------------------------------------------------------------------------
    -- Create dummy auth users in auth.users if auth table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, role, created_at, updated_at)
        VALUES 
            (v_user_a_id, 'user_a@p2a-test.invalid', 'authenticated', now(), now()),
            (v_user_b_id, 'user_b@p2a-test.invalid', 'authenticated', now(), now()),
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
    -- P2A-PROV-02 to 03: Valid new auth user provisions exactly 1 tenant & bindings
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

    -- Verify 1 tenant created
    SELECT count(*) INTO v_count FROM public.tenants WHERE id = v_tenant_id;
    IF v_count != 1 THEN
        RAISE EXCEPTION 'P2A-PROV-02 FAIL: Tenant row not found.';
    END IF;

    -- Verify tenant owner binding
    SELECT role, tenant_id INTO v_profile_role, v_profile_tenant FROM public.users_profile WHERE id = v_user_a_id;
    IF v_profile_role != 'tenant_owner' OR v_profile_tenant != v_tenant_id THEN
        RAISE EXCEPTION 'P2A-PROV-03 FAIL: users_profile binding incorrect (% / %)', v_profile_role, v_profile_tenant;
    END IF;

    -- Verify business profile created with real columns
    SELECT count(*) INTO v_count FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_id AND city = 'Istanbul' AND phone = '+905551112233';
    IF v_count != 1 THEN
        RAISE EXCEPTION 'P2A-PROV-16 FAIL: tenant_business_profiles row missing or column mismatch.';
    END IF;

    -- Verify branding row created
    SELECT count(*) INTO v_count FROM public.tenant_branding WHERE tenant_id = v_tenant_id;
    IF v_count != 1 THEN
        RAISE EXCEPTION 'P2A-PROV-02 FAIL: tenant_branding row missing.';
    END IF;

    -- Verify onboarding checklist initial state (incomplete)
    SELECT salon_info_completed INTO v_onboarding_salon_info FROM public.tenant_onboarding_progress WHERE tenant_id = v_tenant_id;
    IF v_onboarding_salon_info != false THEN
        RAISE EXCEPTION 'P2A-PROV-02 FAIL: Onboarding salon_info_completed should be false initially.';
    END IF;

    -- Verify tenant remains draft/non-public
    SELECT public_site_status INTO v_site_status FROM public.tenants WHERE id = v_tenant_id;
    IF v_site_status != 'draft' THEN
        RAISE EXCEPTION 'P2A-PROV-17 FAIL: public_site_status must be draft upon provisioning.';
    END IF;

    RAISE NOTICE 'P2A-PROV-02 & P2A-PROV-03 & P2A-PROV-16 & P2A-PROV-17 PASS: Valid provisioning created non-public tenant, profile, branding & onboarding.';

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
    -- P2A-PROV-06: Two different owners may use the same textual key independently
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_b_id::text, true);
    r3 := public.provision_tenant_for_authenticated_owner(
        p_business_name => 'Bosphorus Spa',
        p_business_display_name => 'Bosphorus Spa & Wellness',
        p_requested_plan_code => 'baslangic',
        p_idempotency_key => 'key-user-a-1' -- same textual key as User A
    );

    IF r3->>'tenant_id' = v_tenant_id::text THEN
        RAISE EXCEPTION 'P2A-PROV-06 FAIL: User B received User A tenant!';
    END IF;
    RAISE NOTICE 'P2A-PROV-06 PASS: Textual idempotency key is owner-scoped.';

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
    -- P2A-PROV-09: Already provisioned owner cannot provision second tenant under new key
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner('Second Salon', 'Second Salon', 'Hair Salon', 'Istanbul', '+905001112233', 'baslangic', 'key-user-a-2');
        RAISE EXCEPTION 'P2A-PROV-09 FAIL: Re-provisioning second tenant should be blocked.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%USER_ALREADY_HAS_TENANT%' THEN
            RAISE NOTICE 'P2A-PROV-09 PASS: Existing tenant_owner cannot provision second tenant.';
        ELSE
            RAISE EXCEPTION 'P2A-PROV-09 FAIL: Unexpected error: %', SQLERRM;
        END IF;
    END;

    -- -------------------------------------------------------------------------
    -- P2A-PROV-10 & 11 & 12: Plan Request Authorization Filters
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
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

    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
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
    -- P2A-PROV-13 & 14 & 15: Currently effective plan version & pre-commercial non-entitlement status
    -- -------------------------------------------------------------------------
    SELECT status, plan_id, plan_version_id INTO v_sub_status, v_sub_plan, v_sub_version FROM public.subscriptions WHERE id = v_sub_id;
    IF v_sub_status != 'pending_onboarding' THEN
        RAISE EXCEPTION 'P2A-PROV-15 FAIL: Subscription status must be pending_onboarding, got %', v_sub_status;
    END IF;

    IF v_sub_plan != 'baslangic' THEN
        RAISE EXCEPTION 'P2A-PROV-14 FAIL: Subscription plan_id must match resolved plan code.';
    END IF;

    -- Verify resolved plan_version_id is currently effective
    SELECT id INTO v_effective_version_id FROM public.plan_versions 
    WHERE plan_id = (SELECT id FROM public.plans WHERE code = 'baslangic')
      AND lifecycle_status = 'published' AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
    LIMIT 1;

    IF v_sub_version != v_effective_version_id THEN
        RAISE EXCEPTION 'P2A-PROV-13 FAIL: Subscription plan_version_id does not match currently effective published version.';
    END IF;

    RAISE NOTICE 'P2A-PROV-13 & P2A-PROV-14 & P2A-PROV-15 PASS: Pre-commercial status is pending_onboarding with matching effective plan version.';

    RAISE NOTICE '=== ALL P2A.0-R1 INTEGRATION MATRIX TESTS COMPLETED SUCCESSFULLY ===';
END;
$$;
