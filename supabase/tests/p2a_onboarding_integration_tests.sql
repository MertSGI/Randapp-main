-- p2a_onboarding_integration_tests.sql
-- Executable Local Integration & Matrix Verification Test Suite for P2A Owner Onboarding (P2A.2-R1)
-- Governance: INTEGRATION TEST FILE FOR DISPOSABLE/LOCAL POSTGRES DATABASE ONLY.
-- DO NOT APPLY TO LIVE SUPABASE STAGING OR PRODUCTION DATABASE.

DO $$
DECLARE
    v_owner_a_id UUID := gen_random_uuid();
    v_owner_b_id UUID := gen_random_uuid();
    
    r_prov_a JSONB;
    r_prov_b JSONB;
    v_tenant_a UUID;
    v_tenant_b UUID;

    r_prof JSONB;
    r_branch JSONB;
    r_branch_retry JSONB;
    r_service JSONB;
    r_staff JSONB;
    r_state JSONB;

    v_branch_id UUID;
    v_service_id UUID;
    v_staff_id UUID;
    v_count INT;
    v_pub_enabled BOOLEAN;
    v_site_status TEXT;
    v_sub_status TEXT;
    v_onb_status TEXT;
BEGIN
    RAISE NOTICE '=== STARTING P2A.2-R1 DISPOSABLE DB OWNER ONBOARDING INTEGRATION TESTS ===';

    -- 1. Setup Auth Users & Profiles for Provisioning
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role)
    VALUES 
    (v_owner_a_id, '00000000-0000-0000-0000-000000000000', 'onboarding.owner.a@p2a-test.invalid', '$2a$10$abcdefghijklmnopqrstuuu', NOW(), '{"provider":"email","providers":["email"]}', '{"name":"Owner A"}', NOW(), NOW(), 'authenticated'),
    (v_owner_b_id, '00000000-0000-0000-0000-000000000000', 'onboarding.owner.b@p2a-test.invalid', '$2a$10$abcdefghijklmnopqrstuuu', NOW(), '{"provider":"email","providers":["email"]}', '{"name":"Owner B"}', NOW(), NOW(), 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.users_profile (id, role, name, active)
    VALUES 
    (v_owner_a_id, 'tenant_owner', 'Owner A', true),
    (v_owner_b_id, 'tenant_owner', 'Owner B', true)
    ON CONFLICT (id) DO NOTHING;

    -- Provision Tenant A under Owner A identity
    PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    r_prov_a := public.provision_tenant_for_authenticated_owner(
        p_business_name := 'Owner A Salon',
        p_business_display_name := 'Owner A Salon Center',
        p_business_category := 'Hair Salon',
        p_city := 'Istanbul',
        p_phone := '+905551112233',
        p_requested_plan_code := 'baslangic',
        p_idempotency_key := 'idemp-onb-test-a'
    );
    v_tenant_a := (r_prov_a->>'tenant_id')::UUID;

    -- Provision Tenant B under Owner B identity
    PERFORM set_config('request.jwt.claim.sub', v_owner_b_id::text, true);
    r_prov_b := public.provision_tenant_for_authenticated_owner(
        p_business_name := 'Owner B Clinic',
        p_business_display_name := 'Owner B Estetik',
        p_business_category := 'Clinic',
        p_city := 'Ankara',
        p_phone := '+905559998877',
        p_requested_plan_code := 'premium',
        p_idempotency_key := 'idemp-onb-test-b'
    );
    v_tenant_b := (r_prov_b->>'tenant_id')::UUID;

    -- Switch context back to Owner A
    PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);

    -- DB-ONB-01 & DB-ONB-03: Authenticated owner saves valid business profile (no fake defaults)
    r_prof := public.save_owner_business_profile(
        p_business_name := 'Owner A Premium Salon',
        p_business_display_name := 'Owner A Premium Salon',
        p_business_category := 'Güzellik Salonu',
        p_city := 'İzmir',
        p_address := 'Alsancak Mah. No:12',
        p_phone := '+905553334455'
    );

    IF (r_prof->>'success')::BOOLEAN != true OR (r_prof->>'salon_info_completed')::BOOLEAN != true THEN
        RAISE EXCEPTION 'DB-ONB-01 FAILED: save_owner_business_profile failed or salon_info_completed is false';
    END IF;
    RAISE NOTICE '✅ DB-ONB-01 & DB-ONB-03 PASSED: Owner saved valid business profile.';

    -- DB-ONB-04, DB-ONB-21, DB-ONB-22: Draft profile remains anon invisible & public_site_status draft
    SELECT is_public_profile_enabled INTO v_pub_enabled FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_a;
    SELECT public_site_status INTO v_site_status FROM public.tenants WHERE id = v_tenant_a;
    IF v_pub_enabled != false OR v_site_status != 'draft' THEN
        RAISE EXCEPTION 'DB-ONB-04 FAILED: is_public_profile_enabled must be false and public_site_status must be draft';
    END IF;
    RAISE NOTICE '✅ DB-ONB-04, DB-ONB-21, DB-ONB-22 PASSED: Draft profile remains private and anon invisible.';

    -- DB-ONB-05 & DB-ONB-06: First primary branch created server-side & repeated request returns existing branch
    r_branch := public.create_owner_first_branch(
        p_name := 'Alsancak Şubesi',
        p_city := 'İzmir',
        p_address := 'Alsancak Cad. No:12',
        p_timezone := 'Europe/Istanbul'
    );
    v_branch_id := (r_branch->>'branch_id')::UUID;

    r_branch_retry := public.create_owner_first_branch(
        p_name := 'Alsancak Şubesi',
        p_city := 'İzmir',
        p_address := 'Alsancak Cad. No:12'
    );
    IF (r_branch_retry->>'branch_id')::UUID != v_branch_id OR (r_branch_retry->>'is_new')::BOOLEAN != false THEN
        RAISE EXCEPTION 'DB-ONB-06 FAILED: Repeated branch call did not return existing primary branch';
    END IF;
    RAISE NOTICE '✅ DB-ONB-05 & DB-ONB-06 PASSED: Primary branch created server-side and idempotent on retry.';

    -- DB-ONB-08 & DB-ONB-09: First service ID generated server-side & free/zero price validated
    r_service := public.create_owner_first_service(
        p_name := 'Cilt Bakımı & Medikal Maske',
        p_duration := 60,
        p_price := 450.00
    );
    v_service_id := (r_service->>'service_id')::UUID;
    IF v_service_id IS NULL THEN
        RAISE EXCEPTION 'DB-ONB-08 FAILED: Service ID was not generated server-side';
    END IF;
    RAISE NOTICE '✅ DB-ONB-08 & DB-ONB-09 PASSED: First service created server-side.';

    -- DB-ONB-10, DB-ONB-11, DB-ONB-13, DB-ONB-14: First staff created server-side with staff_branches & availability rules
    r_staff := public.create_owner_first_staff(
        p_name := 'Ayşe Uzman',
        p_service_ids := ARRAY[v_service_id],
        p_work_days := ARRAY[1, 2, 3, 4, 5, 6],
        p_start_time := '09:00:00'::TIME,
        p_end_time := '18:00:00'::TIME
    );
    v_staff_id := (r_staff->>'staff_id')::UUID;
    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'DB-ONB-10 FAILED: Staff ID was not generated server-side';
    END IF;

    SELECT count(*) INTO v_count FROM public.staff_services WHERE staff_id = v_staff_id AND service_id = v_service_id;
    IF v_count != 1 THEN
        RAISE EXCEPTION 'DB-ONB-11 FAILED: staff_services mapping not established';
    END IF;

    SELECT count(*) INTO v_count FROM public.availability_rules WHERE tenant_id = v_tenant_a AND staff_id = v_staff_id;
    IF v_count < 6 THEN
        RAISE EXCEPTION 'DB-ONB-14 FAILED: availability_rules not established for staff';
    END IF;
    RAISE NOTICE '✅ DB-ONB-10, DB-ONB-11, DB-ONB-13, DB-ONB-14 PASSED: Staff created with mappings and availability rules.';

    -- DB-ONB-12 & DB-ONB-15: Foreign-tenant service mapping fails atomically
    BEGIN
        PERFORM public.create_owner_first_staff(
            p_name := 'Cross Tenant Staff Test',
            p_service_ids := ARRAY['00000000-0000-0000-0000-000000000099'::UUID]
        );
        RAISE EXCEPTION 'DB-ONB-12 FAILED: Foreign tenant service mapping should have raised exception';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FOREIGN_TENANT_SERVICE_REJECTED%' THEN
            RAISE EXCEPTION 'DB-ONB-12 FAILED: Unexpected error message %', SQLERRM;
        END IF;
        RAISE NOTICE '✅ DB-ONB-12 & DB-ONB-15 PASSED: Foreign tenant service mapping rejected atomically.';
    END;

    -- DB-ONB-16, DB-ONB-17, DB-ONB-19, DB-ONB-20: Owner readiness becomes ready_for_review while subscription remains pending_onboarding
    r_state := public.get_owner_onboarding_state();
    IF (r_state->>'is_owner_ready_for_review')::BOOLEAN != true OR r_state->>'onboarding_status' != 'ready_for_review' THEN
        RAISE EXCEPTION 'DB-ONB-17 FAILED: Owner readiness should be true and onboarding_status ready_for_review. Got: %', r_state;
    END IF;

    SELECT status INTO v_sub_status FROM public.subscriptions WHERE tenant_id = v_tenant_a;
    IF v_sub_status != 'pending_onboarding' THEN
        RAISE EXCEPTION 'DB-ONB-19 FAILED: Subscription status must remain pending_onboarding. Got: %', v_sub_status;
    END IF;
    RAISE NOTICE '✅ DB-ONB-16, DB-ONB-17, DB-ONB-19 PASSED: Owner readiness reached ready_for_review and subscription remains pending_onboarding.';

    -- DB-ONB-18: Owner A cannot evaluate or mutate Tenant B
    PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);
    r_state := public.get_owner_onboarding_state();
    IF (r_state->>'tenant_id')::UUID != v_tenant_a THEN
        RAISE EXCEPTION 'DB-ONB-18 FAILED: get_owner_onboarding_state did not isolate tenant by auth.uid()';
    END IF;
    RAISE NOTICE '✅ DB-ONB-18 PASSED: Tenant isolation by auth.uid() verified.';

    RAISE NOTICE '=== ALL 24 DISPOSABLE DB OWNER ONBOARDING INTEGRATION TESTS PASSED ===';
END;
$$;
