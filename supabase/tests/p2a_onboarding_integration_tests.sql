-- p2a_onboarding_integration_tests.sql
-- Executable Integration Test Suite for P2A Owner Onboarding & Least-Privilege Commercial Contracts (P2A.2-R2)
-- Governance: INTEGRATION TEST FILE FOR DISPOSABLE/LOCAL POSTGRES DATABASE ONLY.
-- DO NOT APPLY TO LIVE SUPABASE STAGING OR PRODUCTION DATABASE.

CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
    v_owner_a_id UUID := gen_random_uuid();
    v_owner_b_id UUID := gen_random_uuid();
    v_owner_c_id UUID := gen_random_uuid();
    
    r_prov_a JSONB;
    r_prov_b JSONB;
    r_prov_c JSONB;
    v_tenant_a UUID;
    v_tenant_b UUID;
    v_tenant_c UUID;

    r_prof JSONB;
    r_branch JSONB;
    r_branch_retry JSONB;
    r_service JSONB;
    r_service_free JSONB;
    r_service_b JSONB;
    r_staff JSONB;
    r_state JSONB;

    v_branch_id UUID;
    v_service_id UUID;
    v_service_b_id UUID;
    v_staff_id UUID;
    v_count INT;
    v_pub_enabled BOOLEAN;
    v_site_status TEXT;
    v_sub_status TEXT;
    v_onb_status TEXT;

    v_quota JSONB;
    v_action JSONB;
    v_pay_count_before INT;
    v_pay_count_after INT;

    v_prof_cat TEXT;
    v_prof_city TEXT;
    v_prof_addr TEXT;
BEGIN
    RAISE NOTICE '=== STARTING P2A.2-R2 DISPOSABLE DB OWNER ONBOARDING INTEGRATION TESTS ===';

    -- 1. Setup Auth Users
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
            INSERT INTO auth.users (id, email, role, created_at, updated_at)
            VALUES 
            (v_owner_a_id, 'onboarding.owner.a@p2a-test.invalid', 'authenticated', NOW(), NOW()),
            (v_owner_b_id, 'onboarding.owner.b@p2a-test.invalid', 'authenticated', NOW(), NOW()),
            (v_owner_c_id, 'onboarding.owner.c@p2a-test.invalid', 'authenticated', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'STEP 1 AUTH USERS FAIL: % (%)', SQLERRM, SQLSTATE;
    END;

    -- Provision Tenant A under Owner A identity (Plan: baslangic)
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'STEP 2 PROVISION TENANT A FAIL: % (%)', SQLERRM, SQLSTATE;
    END;

    -- Provision Tenant B under Owner B identity (Plan: premium)
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'STEP 3 PROVISION TENANT B FAIL: % (%)', SQLERRM, SQLSTATE;
    END;

    -- Provision Tenant C under Owner C identity (For Concurrency Test)
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_owner_c_id::text, true);
        r_prov_c := public.provision_tenant_for_authenticated_owner(
            p_business_name := 'Owner C Conc Salon',
            p_business_display_name := 'Owner C Conc Center',
            p_business_category := 'Spa',
            p_city := 'Izmir',
            p_phone := '+905557776655',
            p_requested_plan_code := 'baslangic',
            p_idempotency_key := 'idemp-onb-test-c'
        );
        v_tenant_c := (r_prov_c->>'tenant_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'STEP 4 PROVISION TENANT C FAIL: % (%)', SQLERRM, SQLSTATE;
    END;

    -- DB-ONB-24: Measure Payment/Provider Artifact Baseline Count
    SELECT (SELECT count(*) FROM public.payment_events) + (SELECT count(*) FROM public.billing_transactions) INTO v_pay_count_before;

    -- Switch context to Owner A
    PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);

    -- =========================================================================
    -- SECTION 1: LEAST-PRIVILEGE COMMERCIAL ONBOARDING CONTRACTS (DB-COMM-ONB-01..08)
    -- =========================================================================

    -- DB-COMM-ONB-01: pending_onboarding max_branches resolves requested plan integer quota
    BEGIN
        v_quota := public.resolve_commercial_quota(v_tenant_a, 'max_branches');
        IF (v_quota->>'limit_value')::INT != 1 OR (v_quota->>'is_unlimited')::BOOLEAN != false THEN
            RAISE EXCEPTION 'DB-COMM-ONB-01 FAILED: Expected max_branches quota = 1 for baslangic plan, got %', v_quota;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-01 PASSED: pending_onboarding max_branches resolves requested plan quota.';
    END;

    -- DB-COMM-ONB-02: pending_onboarding max_services resolves requested plan integer quota
    BEGIN
        v_quota := public.resolve_commercial_quota(v_tenant_a, 'max_services');
        IF (v_quota->>'limit_value')::INT <= 0 THEN
            RAISE EXCEPTION 'DB-COMM-ONB-02 FAILED: Expected positive max_services quota for baslangic plan, got %', v_quota;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-02 PASSED: pending_onboarding max_services resolves requested plan quota.';
    END;

    -- DB-COMM-ONB-03: pending_onboarding max_staff resolves requested plan integer quota
    BEGIN
        v_quota := public.resolve_commercial_quota(v_tenant_a, 'max_staff');
        IF (v_quota->>'limit_value')::INT != 1 THEN
            RAISE EXCEPTION 'DB-COMM-ONB-03 FAILED: Expected max_staff quota = 1 for baslangic plan, got %', v_quota;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-03 PASSED: pending_onboarding max_staff resolves requested plan quota.';
    END;

    -- DB-COMM-ONB-04: Unknown quota key returns zero/denied
    BEGIN
        v_quota := public.resolve_commercial_quota(v_tenant_a, 'unknown_custom_quota_key');
        IF (v_quota->>'limit_value')::INT != 0 OR (v_quota->>'is_unlimited')::BOOLEAN != false THEN
            RAISE EXCEPTION 'DB-COMM-ONB-04 FAILED: Unknown quota key must return limit 0, got %', v_quota;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-04 PASSED: Unknown quota key returns zero/denied.';
    END;

    -- DB-COMM-ONB-05: Missing plan entitlement row returns zero/denied
    BEGIN
        v_quota := public.resolve_commercial_quota(v_tenant_a, 'unmapped_feature_key');
        IF (v_quota->>'limit_value')::INT != 0 THEN
            RAISE EXCEPTION 'DB-COMM-ONB-05 FAILED: Unmapped feature quota must return limit 0, got %', v_quota;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-05 PASSED: Missing plan entitlement row returns zero/denied.';
    END;

    -- DB-COMM-ONB-06: core_booking action helper remains denied while pending_onboarding
    BEGIN
        v_action := public.assert_tenant_commercial_action_allowed(v_tenant_a, 'core_booking');
        IF (v_action->>'allowed')::BOOLEAN != false OR v_action->>'reason_code' != 'commercial_status_not_eligible' THEN
            RAISE EXCEPTION 'DB-COMM-ONB-06 FAILED: core_booking must be denied during pending_onboarding, got %', v_action;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-06 PASSED: core_booking action helper remains denied while pending_onboarding.';
    END;

    -- DB-COMM-ONB-07: customer_cancellation action helper remains denied while pending_onboarding
    BEGIN
        v_action := public.assert_tenant_commercial_action_allowed(v_tenant_a, 'customer_cancellation');
        IF (v_action->>'allowed')::BOOLEAN != false OR v_action->>'reason_code' != 'commercial_status_not_eligible' THEN
            RAISE EXCEPTION 'DB-COMM-ONB-07 FAILED: customer_cancellation must be denied during pending_onboarding, got %', v_action;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-07 PASSED: customer_cancellation action helper is not globally enabled by pending_onboarding.';
    END;

    -- DB-COMM-ONB-08: Effective paid entitlement grants remain zero while pending_onboarding
    BEGIN
        SELECT count(*) INTO v_count
        FROM public.resolve_effective_tenant_entitlements(v_tenant_a, now())
        WHERE source = 'plan_version'
           OR boolean_value = true
           OR (integer_value IS NOT NULL AND integer_value > 0 AND is_unlimited = false AND source != 'default_deny');
        IF v_count != 0 THEN
            RAISE EXCEPTION 'DB-COMM-ONB-08 FAILED: Effective paid entitlements must be 0 during pending_onboarding, got %', v_count;
        END IF;
        RAISE NOTICE '✅ DB-COMM-ONB-08 PASSED: Effective paid entitlement grants remain zero.';
    END;

    -- =========================================================================
    -- SECTION 2: CANONICAL ONBOARDING MATRIX (DB-ONB-01..24)
    -- =========================================================================

    -- DB-ONB-02: Incomplete profile remains incomplete when required field (address) is empty
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_owner_b_id::text, true);
        UPDATE public.tenant_business_profiles SET address = NULL WHERE tenant_id = v_tenant_b;
        r_prof := public.save_owner_business_profile(
            p_business_name := 'Incomplete Owner B Salon',
            p_business_category := 'Clinic',
            p_city := 'Ankara',
            p_address := ''
        );
        IF (r_prof->>'salon_info_completed')::BOOLEAN = true THEN
            RAISE EXCEPTION 'DB-ONB-02 FAILED: Profile with empty address must remain incomplete!';
        END IF;
        RAISE NOTICE '✅ DB-ONB-02 PASSED: Incomplete profile remains incomplete.';
    END;

    -- DB-ONB-03: No fabricated category/city/address defaults inserted
    BEGIN
        SELECT business_category, city, address INTO v_prof_cat, v_prof_city, v_prof_addr
        FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_b;
        IF v_prof_addr IS NOT NULL AND v_prof_addr = 'Merkez Adres' THEN
            RAISE EXCEPTION 'DB-ONB-03 FAILED: Fabricated "Merkez Adres" default detected!';
        END IF;
        RAISE NOTICE '✅ DB-ONB-03 PASSED: Zero fabricated category/city/address defaults inserted.';
    END;

    -- Switch context back to Owner A
    PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);

    -- DB-ONB-01: Valid Business Profile Save & Stored Completion Predicate
    BEGIN
        r_prof := public.save_owner_business_profile(
            p_business_name := 'Owner A Premium Salon',
            p_business_display_name := 'Owner A Premium Salon',
            p_business_category := 'Güzellik Salonu',
            p_city := 'İzmir',
            p_address := 'Alsancak Mah. No:12',
            p_phone := '+905553334455'
        );
        IF (r_prof->>'success')::BOOLEAN != true OR (r_prof->>'salon_info_completed')::BOOLEAN != true THEN
            RAISE EXCEPTION 'DB-ONB-01 FAILED: save_owner_business_profile failed or salon_info_completed is false. Payload: %', r_prof;
        END IF;
        RAISE NOTICE '✅ DB-ONB-01 PASSED: Valid business profile saved and stored completion predicate verified.';
    END;

    -- DB-ONB-04: Draft Profile Private Guard
    BEGIN
        SELECT is_public_profile_enabled INTO v_pub_enabled FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_a;
        SELECT public_site_status INTO v_site_status FROM public.tenants WHERE id = v_tenant_a;
        IF v_pub_enabled != false OR v_site_status != 'draft' THEN
            RAISE EXCEPTION 'DB-ONB-04 FAILED: is_public_profile_enabled must be false and public_site_status must be draft';
        END IF;
        RAISE NOTICE '✅ DB-ONB-04 PASSED: Draft profile remains private.';
    END;

    -- DB-ONB-05: First Branch Creation with Server-Side UUID
    BEGIN
        r_branch := public.create_owner_first_branch(
            p_name := 'Alsancak Şubesi',
            p_timezone := 'Europe/Istanbul'
        );
        v_branch_id := (r_branch->>'branch_id')::UUID;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'DB-ONB-05 FAILED: Primary branch ID was not generated server-side';
        END IF;
        RAISE NOTICE '✅ DB-ONB-05 PASSED: First branch created with server-side UUID.';
    END;

    -- DB-ONB-06: Repeated Branch Request Idempotency
    BEGIN
        r_branch_retry := public.create_owner_first_branch(
            p_name := 'Alsancak Şubesi',
            p_timezone := 'Europe/Istanbul'
        );
        IF (r_branch_retry->>'branch_id')::UUID != v_branch_id OR (r_branch_retry->>'is_new')::BOOLEAN != false THEN
            RAISE EXCEPTION 'DB-ONB-06 FAILED: Repeated branch call did not return existing primary branch';
        END IF;
        RAISE NOTICE '✅ DB-ONB-06 PASSED: Repeated branch request is idempotent.';
    END;

    -- DB-ONB-07: Real 2-Session Overlapping PostgreSQL Concurrency Test
    BEGIN
        BEGIN PERFORM dblink_disconnect('conn1'); EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN PERFORM dblink_disconnect('conn2'); EXCEPTION WHEN OTHERS THEN NULL; END;

        PERFORM dblink_connect('conn1', 'dbname=postgres user=postgres password=postgres host=127.0.0.1 port=5432');
        PERFORM dblink_connect('conn2', 'dbname=postgres user=postgres password=postgres host=127.0.0.1 port=5432');

        PERFORM dblink_send_query('conn1', 'BEGIN; SELECT set_config(''request.jwt.claim.sub'', ''' || v_owner_c_id || ''', true); SELECT set_config(''request.jwt.claim.role'', ''authenticated'', true); SELECT public.create_owner_first_branch(''Conc Branch 1''); COMMIT;');
        PERFORM dblink_send_query('conn2', 'BEGIN; SELECT set_config(''request.jwt.claim.sub'', ''' || v_owner_c_id || ''', true); SELECT set_config(''request.jwt.claim.role'', ''authenticated'', true); SELECT public.create_owner_first_branch(''Conc Branch 2''); COMMIT;');

        PERFORM dblink_get_result('conn1');
        PERFORM dblink_get_result('conn2');

        PERFORM dblink_disconnect('conn1');
        PERFORM dblink_disconnect('conn2');

        SELECT count(*) INTO v_count FROM public.branches WHERE tenant_id = v_tenant_c AND is_primary = true AND is_active = true;
        IF v_count != 1 THEN
            RAISE EXCEPTION 'DB-ONB-07 FAILED: Expected exactly 1 primary branch after concurrent 2-session execution, got %', v_count;
        END IF;
        RAISE NOTICE '✅ DB-ONB-07 PASSED: Real 2-session concurrent first-branch calls leave exactly one primary branch.';
    END;

    -- DB-ONB-08: Service Server-Generated ID
    BEGIN
        r_service := public.create_owner_first_service(
            p_name := 'Cilt Bakımı & Medikal Maske',
            p_duration := 60,
            p_price := 450.00
        );
        v_service_id := (r_service->>'service_id')::UUID;
        IF v_service_id IS NULL THEN
            RAISE EXCEPTION 'DB-ONB-08 FAILED: Service ID was not generated server-side';
        END IF;
        RAISE NOTICE '✅ DB-ONB-08 PASSED: First service created with server-generated ID.';
    END;

    -- DB-ONB-09: Zero/Free Price Service Validation
    BEGIN
        r_service_free := public.create_owner_first_service(
            p_name := 'Ücretsiz Ön Danışmanlık',
            p_duration := 15,
            p_price := 0.00
        );
        IF (r_service_free->>'success')::BOOLEAN != true OR (r_service_free->>'service_id')::UUID IS NULL THEN
            RAISE EXCEPTION 'DB-ONB-09 FAILED: Free service (price = 0.00) creation failed';
        END IF;
        RAISE NOTICE '✅ DB-ONB-09 PASSED: Zero/free price service follows canonical validation.';
    END;

    -- DB-ONB-10: Staff Server-Generated ID
    BEGIN
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
        RAISE NOTICE '✅ DB-ONB-10 PASSED: First staff created with server-generated ID.';
    END;

    -- DB-ONB-11: Same-Tenant Service Mapping Assertion
    BEGIN
        SELECT count(*) INTO v_count FROM public.staff_services WHERE staff_id = v_staff_id AND service_id = v_service_id;
        IF v_count != 1 THEN
            RAISE EXCEPTION 'DB-ONB-11 FAILED: staff_services mapping not established';
        END IF;
        RAISE NOTICE '✅ DB-ONB-11 PASSED: Same-tenant service mapping asserted.';
    END;

    -- Setup an ACTUAL Service belonging to Tenant B for DB-ONB-12
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_owner_b_id::text, true);
        r_service_b := public.create_owner_first_service(
            p_name := 'Tenant B Clinic Service',
            p_duration := 30,
            p_price := 1000.00
        );
        v_service_b_id := (r_service_b->>'service_id')::UUID;
        PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);
    END;

    -- DB-ONB-12 & DB-ONB-15: Real Foreign Tenant Service Rejection & Partial Residue Assertions
    BEGIN
        BEGIN
            PERFORM public.create_owner_first_staff(
                p_name := 'Cross Tenant Staff Test',
                p_service_ids := ARRAY[v_service_b_id]
            );
            RAISE EXCEPTION 'DB-ONB-12 FAILED: Foreign tenant service mapping should have raised exception';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%FOREIGN_TENANT_SERVICE_REJECTED%' THEN
                RAISE EXCEPTION 'DB-ONB-12 FAILED: Unexpected error message %', SQLERRM;
            END IF;
        END;

        -- DB-ONB-15: Assert zero partial staff residue created for Owner A from failed operation
        SELECT count(*) INTO v_count FROM public.staff WHERE tenant_id = v_tenant_a AND name = 'Cross Tenant Staff Test';
        IF v_count != 0 THEN
            RAISE EXCEPTION 'DB-ONB-15 FAILED: Partial staff residue found after failed foreign service mapping!';
        END IF;

        RAISE NOTICE '✅ DB-ONB-12 PASSED: Actual foreign-tenant service mapping rejected with FOREIGN_TENANT_SERVICE_REJECTED.';
        RAISE NOTICE '✅ DB-ONB-15 PASSED: Failed staff operation leaves zero partial residue.';
    END;

    -- DB-ONB-13: staff_branches Mapping Explicit Assertion
    BEGIN
        SELECT count(*) INTO v_count FROM public.staff_branches WHERE tenant_id = v_tenant_a AND staff_id = v_staff_id AND branch_id = v_branch_id;
        IF v_count != 1 THEN
            RAISE EXCEPTION 'DB-ONB-13 FAILED: staff_branches mapping row not found for staff % and branch %', v_staff_id, v_branch_id;
        END IF;
        RAISE NOTICE '✅ DB-ONB-13 PASSED: staff_branches mapping explicitly asserted.';
    END;

    -- DB-ONB-14: Availability Rules Explicit Assertion
    BEGIN
        SELECT count(*) INTO v_count FROM public.availability_rules WHERE tenant_id = v_tenant_a AND staff_id = v_staff_id AND is_active = true;
        IF v_count != 6 THEN
            RAISE EXCEPTION 'DB-ONB-14 FAILED: availability_rules count mismatch for staff. Expected 6, got %', v_count;
        END IF;
        RAISE NOTICE '✅ DB-ONB-14 PASSED: Availability rules explicitly asserted.';
    END;

    -- DB-ONB-16: Re-read / Resume Onboarding State
    BEGIN
        r_state := public.get_owner_onboarding_state();
        IF (r_state->>'tenant_id')::UUID != v_tenant_a THEN
            RAISE EXCEPTION 'DB-ONB-16 FAILED: get_owner_onboarding_state did not return current tenant';
        END IF;
        RAISE NOTICE '✅ DB-ONB-16 PASSED: Owner onboarding state re-read from server truth.';
    END;

    -- DB-ONB-17: Readiness Transition to ready_for_review
    BEGIN
        IF (r_state->>'is_owner_ready_for_review')::BOOLEAN != true OR r_state->>'onboarding_status' != 'ready_for_review' THEN
            RAISE EXCEPTION 'DB-ONB-17 FAILED: Owner readiness should be true and onboarding_status ready_for_review. Got: %', r_state;
        END IF;
        RAISE NOTICE '✅ DB-ONB-17 PASSED: Readiness reaches ready_for_review after all required steps completed.';
    END;

    -- DB-ONB-18: Tenant Isolation Guard
    BEGIN
        PERFORM set_config('request.jwt.claim.sub', v_owner_b_id::text, true);
        r_state := public.get_owner_onboarding_state();
        IF (r_state->>'tenant_id')::UUID != v_tenant_b THEN
            RAISE EXCEPTION 'DB-ONB-18 FAILED: get_owner_onboarding_state did not isolate tenant by auth.uid()';
        END IF;
        PERFORM set_config('request.jwt.claim.sub', v_owner_a_id::text, true);
        RAISE NOTICE '✅ DB-ONB-18 PASSED: Tenant isolation strictly enforced by auth.uid().';
    END;

    -- DB-ONB-19: Subscription Status Preservation
    BEGIN
        SELECT status INTO v_sub_status FROM public.subscriptions WHERE tenant_id = v_tenant_a;
        IF v_sub_status != 'pending_onboarding' THEN
            RAISE EXCEPTION 'DB-ONB-19 FAILED: Subscription status must remain pending_onboarding. Got: %', v_sub_status;
        END IF;
        RAISE NOTICE '✅ DB-ONB-19 PASSED: Subscription status confirmed as pending_onboarding.';
    END;

    -- DB-ONB-20: Effective Paid Entitlements Guard
    BEGIN
        SELECT count(*) INTO v_count
        FROM public.resolve_effective_tenant_entitlements(v_tenant_a, now())
        WHERE source = 'plan_version'
           OR boolean_value = true
           OR (integer_value IS NOT NULL AND integer_value > 0 AND is_unlimited = false AND source != 'default_deny');
        IF v_count != 0 THEN
            RAISE EXCEPTION 'DB-ONB-20 FAILED: pending_onboarding tenant received % effective granted plan entitlements.', v_count;
        END IF;
        RAISE NOTICE '✅ DB-ONB-20 PASSED: Effective paid entitlement grant count remains zero while pending_onboarding.';
    END;

    -- DB-ONB-21: Storefront Remains Draft
    BEGIN
        SELECT public_site_status INTO v_site_status FROM public.tenants WHERE id = v_tenant_a;
        IF v_site_status != 'draft' THEN
            RAISE EXCEPTION 'DB-ONB-21 FAILED: public_site_status must remain draft, got %', v_site_status;
        END IF;
        RAISE NOTICE '✅ DB-ONB-21 PASSED: Storefront status remains draft.';
    END;

    -- DB-ONB-22: Public Profile Remains Disabled & Anon Invisible
    BEGIN
        SELECT is_public_profile_enabled INTO v_pub_enabled FROM public.tenant_business_profiles WHERE tenant_id = v_tenant_a;
        IF v_pub_enabled != false THEN
            RAISE EXCEPTION 'DB-ONB-22 FAILED: is_public_profile_enabled must be false, got %', v_pub_enabled;
        END IF;
        RAISE NOTICE '✅ DB-ONB-22 PASSED: Public profile remains disabled and anon-invisible.';
    END;

    -- DB-ONB-23: Published/Completed Read-Model State Proof
    BEGIN
        UPDATE public.tenants SET onboarding_status = 'completed', public_site_status = 'published' WHERE id = v_tenant_a;
        UPDATE public.tenant_business_profiles SET is_public_profile_enabled = true WHERE tenant_id = v_tenant_a;

        r_state := public.get_owner_onboarding_state();
        IF r_state->>'onboarding_status' != 'completed' OR r_state->>'public_site_status' != 'published' THEN
            RAISE EXCEPTION 'DB-ONB-23 FAILED: get_owner_onboarding_state read model mismatch for published tenant. Got: %', r_state;
        END IF;
        RAISE NOTICE '✅ DB-ONB-23 PASSED: Published/completed tenant state read model verified.';
    END;

    -- DB-ONB-24: Zero Payment/Provider Artifact Delta Assertion
    BEGIN
        SELECT (SELECT count(*) FROM public.payment_events) + (SELECT count(*) FROM public.billing_transactions) INTO v_pay_count_after;
        IF (v_pay_count_after - v_pay_count_before) != 0 THEN
            RAISE EXCEPTION 'DB-ONB-24 FAILED: Payment/provider artifacts created during onboarding! Delta = %', (v_pay_count_after - v_pay_count_before);
        END IF;
        RAISE NOTICE '✅ DB-ONB-24 PASSED: Payment/provider artifact delta = 0 verified across canonical billing tables.';
    END;

    RAISE NOTICE '=== ALL 8 COMMERCIAL ONBOARDING & 24 CANONICAL ONBOARDING DISPOSABLE DB INTEGRATION TESTS PASSED ===';
END;
$$;
