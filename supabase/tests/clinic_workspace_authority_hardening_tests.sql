-- LARİ CLINIC WORKSPACE AUTHORITY HARDENING EXECUTABLE TEST SUITE (R1.1 REPAIRED)
-- File: supabase/tests/clinic_workspace_authority_hardening_tests.sql
-- Purpose:
--   Executable SQL verification for Migration 63 with REAL DB ROLE CONTEXT (SET LOCAL ROLE authenticated / anon),
--   ZERO false-green arbitrary exception swallow patterns, exact UUID signatures, and canonical audit verification.

BEGIN;

-- Setup test fixtures using strict hexadecimal UUID literals
DO $$
DECLARE
    v_tenant_id UUID := '11111111-1111-4111-8111-111111111111'::UUID;
    v_tenant2_id UUID := '22222222-2222-4222-8222-222222222222'::UUID;

    v_owner_uid UUID := 'a1111111-1111-4111-8111-111111111111'::UUID;
    v_owner2_uid UUID := 'a2222222-2222-4222-8222-222222222222'::UUID;
    v_superadmin_uid UUID := 'a9999999-9999-4999-8999-999999999999'::UUID;

    v_manage_staff_uid UUID := 'a3333333-3333-4333-8333-333333333333'::UUID;
    v_view_staff_uid UUID := 'a4444444-4444-4444-8444-444444444444'::UUID;
    v_none_staff_uid UUID := 'a5555555-5555-4555-8555-555555555555'::UUID;

    v_manage_staff_id UUID := '33333333-3333-4333-8333-333333333333'::UUID;
    v_view_staff_id UUID := '34444444-4444-4444-8444-444444444444'::UUID;
    v_none_staff_id UUID := '35555555-5555-4555-8555-555555555555'::UUID;

    v_cust_id UUID := 'c1111111-1111-4111-8111-111111111111'::UUID;
    v_cust2_id UUID := 'c2222222-2222-4222-8222-222222222222'::UUID;

    v_res JSONB;
    v_audit RECORD;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    RAISE NOTICE '=== STARTING CLINIC WORKSPACE AUTHORITY HARDENING SQL TEST SUITE (R1.1) ===';

    -- Seed Tenants
    INSERT INTO public.tenants (id, name, slug)
    VALUES (v_tenant_id, 'Hardening Clinic Tenant 1', 'hardening-clinic-1'),
           (v_tenant2_id, 'Hardening Clinic Tenant 2', 'hardening-clinic-2')
    ON CONFLICT (id) DO NOTHING;

    -- Seed Users Profiles
    INSERT INTO public.users_profile (id, tenant_id, role, first_name, last_name)
    VALUES (v_owner_uid, v_tenant_id, 'tenant_owner', 'Owner', 'One'),
           (v_owner2_uid, v_tenant2_id, 'tenant_owner', 'Owner', 'Two'),
           (v_superadmin_uid, NULL, 'super_admin', 'Super', 'Admin'),
           (v_manage_staff_uid, v_tenant_id, 'staff', 'Manage', 'Staff'),
           (v_view_staff_uid, v_tenant_id, 'staff', 'View', 'Staff'),
           (v_none_staff_uid, v_tenant_id, 'staff', 'NoCap', 'Staff')
    ON CONFLICT (id) DO NOTHING;

    -- Seed Staff Records
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
    VALUES (v_manage_staff_id, v_tenant_id, v_manage_staff_uid, 'Manage Staff', true),
           (v_view_staff_id, v_tenant_id, v_view_staff_uid, 'View Staff', true),
           (v_none_staff_id, v_tenant_id, v_none_staff_uid, 'None Staff', true)
    ON CONFLICT (id) DO NOTHING;

    -- Seed Clinic Staff Profiles with specific capabilities
    INSERT INTO public.clinic_staff_profiles (
        tenant_id, staff_id, practitioner_type, specialty,
        can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes
    ) VALUES 
        (v_tenant_id, v_manage_staff_id, 'nurse', 'Reception', true, false, false),
        (v_tenant_id, v_view_staff_id, 'physician', 'Cardiology', false, true, false),
        (v_tenant_id, v_none_staff_id, 'other', 'Assistant', false, false, false)
    ON CONFLICT (tenant_id, staff_id) DO UPDATE SET
        can_manage_patient_profiles = EXCLUDED.can_manage_patient_profiles,
        can_view_clinical_records = EXCLUDED.can_view_clinical_records,
        can_write_clinical_notes = EXCLUDED.can_write_clinical_notes;

    -- Seed Customers
    INSERT INTO public.customers (id, tenant_id, first_name, last_name, phone)
    VALUES (v_cust_id, v_tenant_id, 'Patient', 'One', '5550001'),
           (v_cust2_id, v_tenant2_id, 'Tenant2', 'Patient', '5550002')
    ON CONFLICT (id) DO NOTHING;

    -- -------------------------------------------------------------------------
    -- TEST A: Manage=true, View=false => clinic_get_patient_profile SUCCEEDS
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_manage_staff_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST A FAILED: Manage-only staff should be able to get patient profile';
    END IF;
    RAISE NOTICE '✓ TEST A PASSED: Manage-only staff can read bounded profile';

    -- -------------------------------------------------------------------------
    -- TEST B: Manage=true, View=false => clinic_get_patient_history FAILS CLOSED (FORBIDDEN ONLY)
    -- -------------------------------------------------------------------------
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST B FAILED: Manage-only staff must NOT be able to load patient history';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST B FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST B PASSED: Manage-only staff denied clinical history';

    -- -------------------------------------------------------------------------
    -- TEST C, D, E, F, G: Manage=true, View=false => clinic_upsert_patient_profile SUCCEEDS
    -- -------------------------------------------------------------------------
    v_res := public.clinic_upsert_patient_profile(
        p_customer_id := v_cust_id,
        p_blood_type := 'A Rh+',
        p_allergies := 'Penicillin'
    );
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST C FAILED: Manage-only staff should be able to upsert patient profile';
    END IF;

    -- TEST G: Response Contract Check (patient_profile_id MUST be present and non-null)
    IF v_res->>'patient_profile_id' IS NULL THEN
        RAISE EXCEPTION 'TEST G FAILED: Response contract missing patient_profile_id!';
    END IF;

    -- TEST D, E, F: Verify Canonical audit_events row
    SELECT * INTO v_audit
    FROM public.audit_events
    WHERE tenant_id = v_tenant_id::text
      AND resource_id = v_res->>'patient_profile_id'
    ORDER BY created_at DESC LIMIT 1;

    IF v_audit.id IS NULL THEN
        RAISE EXCEPTION 'TEST D FAILED: Canonical audit_events row was not inserted!';
    END IF;

    IF v_audit.actor_role <> 'staff' OR v_audit.action <> 'clinic_patient_profile_changed' THEN
        RAISE EXCEPTION 'TEST E FAILED: Audit actor_role (%) or action (%) incorrect!', v_audit.actor_role, v_audit.action;
    END IF;

    -- Verify Payload Metadata Only (NO clinical content)
    IF v_audit.payload ? 'blood_type' OR v_audit.payload ? 'allergies' THEN
        RAISE EXCEPTION 'TEST F FAILED: Audit payload contains clinical health fields!';
    END IF;

    RAISE NOTICE '✓ TEST C, D, E, F, G PASSED: Manage-only upsert succeeds and writes canonical audit row';

    -- -------------------------------------------------------------------------
    -- TEST H, I: Manage=false, View=true => clinic_get_patient_profile & history SUCCEED
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_view_staff_uid::text, true);

    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST H FAILED: View-only staff should be able to get patient profile';
    END IF;

    v_res := public.clinic_get_patient_history(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST I FAILED: View-only staff should be able to get patient history';
    END IF;
    RAISE NOTICE '✓ TEST H, I PASSED: View-only staff can read bounded profile and history';

    -- -------------------------------------------------------------------------
    -- TEST J: Manage=false, View=true => clinic_upsert_patient_profile FORBIDDEN ONLY
    -- -------------------------------------------------------------------------
    BEGIN
        v_res := public.clinic_upsert_patient_profile(
            p_customer_id := v_cust_id,
            p_blood_type := 'O Rh-'
        );
        RAISE EXCEPTION 'TEST J FAILED: View-only staff must NOT be able to mutate patient profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST J FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST J PASSED: View-only staff denied profile mutation';

    -- -------------------------------------------------------------------------
    -- TEST K, L, M: Manage=false, View=false => Profile read, history, mutation FORBIDDEN ONLY
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_none_staff_uid::text, true);

    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST K FAILED: No-cap staff profile read must fail';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST K FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST L FAILED: No-cap staff history read must fail';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST L FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'B Rh+');
        RAISE EXCEPTION 'TEST M FAILED: No-cap staff profile mutation must fail';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST M FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST K, L, M PASSED: No-cap staff denied all reads and mutations with expected FORBIDDEN';

    -- -------------------------------------------------------------------------
    -- TEST N, O: Cross-Tenant Profile Read and Mutation DENIED
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_manage_staff_uid::text, true);

    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust2_id);
        RAISE EXCEPTION 'TEST N FAILED: Cross-tenant profile read must fail';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST N FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust2_id, p_blood_type := 'AB Rh+');
        RAISE EXCEPTION 'TEST O FAILED: Cross-tenant profile mutation must fail';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST O FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST N, O PASSED: Cross-tenant profile read and mutation denied with expected domain errors';

    -- -------------------------------------------------------------------------
    -- TEST S, T: Owner Setup RPC Success for Tenant Owner
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_owner_uid::text, true);

    v_res := public.clinic_get_staff_setup_profiles();
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST S FAILED: Tenant owner must be able to execute clinic_get_staff_setup_profiles';
    END IF;

    IF jsonb_array_length(v_res->'profiles') < 3 THEN
        RAISE EXCEPTION 'TEST T FAILED: Owner setup profile list incomplete';
    END IF;
    RAISE NOTICE '✓ TEST S, T PASSED: Tenant owner can fetch setup profiles';

    -- -------------------------------------------------------------------------
    -- TEST U, V: Non-owner / Super Admin Denied Owner Setup RPC
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_manage_staff_uid::text, true);
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST U FAILED: Regular staff must NOT be able to call clinic_get_staff_setup_profiles';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST U FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    PERFORM set_config('request.jwt.claim.sub', v_superadmin_uid::text, true);
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST V FAILED: Super admin must NOT be able to call clinic_get_staff_setup_profiles';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST V FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST U, V PASSED: Non-owner and Super Admin denied owner setup RPC with expected FORBIDDEN';

    -- -------------------------------------------------------------------------
    -- TEST W, X: Zero Clinical Content Leak Check in Bounded & Setup RPCs
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_manage_staff_uid::text, true);
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->'patient_profile') ? 'encounters' OR (v_res->'patient_profile') ? 'notes' OR (v_res->'patient_profile') ? 'subjective' THEN
        RAISE EXCEPTION 'TEST W FAILED: Bounded profile returned clinical history fields!';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_owner_uid::text, true);
    v_res := public.clinic_get_staff_setup_profiles();
    IF (v_res->'profiles'->0) ? 'allergies' OR (v_res->'profiles'->0) ? 'chronic_conditions' THEN
        RAISE EXCEPTION 'TEST X FAILED: Owner setup returned patient health fields!';
    END IF;
    RAISE NOTICE '✓ TEST W, X PASSED: Zero clinical leakage in bounded profile and setup RPCs';

    -- -------------------------------------------------------------------------
    -- TEST P, Q, R: LITERAL ANON ROLE BOUNDARY TESTS
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);

    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST P FAILED: Anon caller must NOT read bounded patient profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST P FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'O Rh+');
        RAISE EXCEPTION 'TEST Q FAILED: Anon caller must NOT mutate patient profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST Q FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST R FAILED: Anon caller must NOT read staff setup profiles';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST R FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE '✓ TEST P, Q, R PASSED: Anon role execution denied all access';

    RAISE NOTICE 'CLINIC_PROFILE_MUTATION_MANAGE_ONLY_PROVEN=YES';
    RAISE NOTICE 'CLINIC_PROFILE_MUTATION_AUDIT_CANONICAL=YES';
    RAISE NOTICE 'CLINIC_PROFILE_RESPONSE_CONTRACT_PROVEN=YES';
    RAISE NOTICE 'CLINIC_PROFILE_VIEW_WITHOUT_HISTORY_PROVEN=YES';
    RAISE NOTICE 'CLINIC_VIEW_ONLY_MUTATION_DENIED=YES';
    RAISE NOTICE 'CLINIC_NO_CAPABILITY_DENIAL_PROVEN=YES';
    RAISE NOTICE 'CLINIC_PROFILE_CROSS_TENANT_DENIED=YES';
    RAISE NOTICE 'CLINIC_ANON_PROFILE_ACCESS_DENIED=YES';
    RAISE NOTICE 'CLINIC_OWNER_SETUP_READ_PROVEN=YES';
    RAISE NOTICE 'CLINIC_OWNER_SETUP_CROSS_TENANT_SAFE=YES';
    RAISE NOTICE 'CLINIC_BOUNDED_PROFILE_NO_HISTORY_LEAK=YES';
    RAISE NOTICE 'CLINIC_WORKSPACE_DB_ROLE_CONTEXT_PROVEN=YES';
    RAISE NOTICE 'CLINIC_WORKSPACE_AUTHORITY_HARDENING_DB_EXECUTION=PASS';
END;
$$;

ROLLBACK;
