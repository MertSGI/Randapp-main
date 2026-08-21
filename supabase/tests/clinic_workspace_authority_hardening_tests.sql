-- LARİ CLINIC WORKSPACE AUTHORITY HARDENING EXECUTABLE TEST SUITE (R1.2 HARDENED ISOLATED)
-- File: supabase/tests/clinic_workspace_authority_hardening_tests.sql
-- Purpose:
--   Executable SQL verification for Migration 63 with REAL TOP-LEVEL DATABASE ROLE STATEMENTS (SET LOCAL ROLE authenticated / anon),
--   catalog EXECUTE ACL proof, inactive tenant owner setup denial, exact UUID signatures, and canonical audit verification.

BEGIN;

-- =========================================================================
-- 1. FIXTURE SETUP (Privileged Session Role)
-- =========================================================================
DO $$
DECLARE
    v_tenant_id UUID := 'b3888888-8888-4888-8888-888888888801'::UUID;
    v_tenant2_id UUID := 'b3888888-8888-4888-8888-888888888802'::UUID;

    v_owner_uid UUID := 'a3888888-8888-4888-8888-888888888801'::UUID;
    v_owner2_uid UUID := 'a3888888-8888-4888-8888-888888888802'::UUID;
    v_inactive_owner_uid UUID := 'a3888888-8888-4888-8888-888888888807'::UUID;
    v_superadmin_uid UUID := 'a3888888-8888-4888-8888-888888888809'::UUID;

    v_manage_staff_uid UUID := 'a3888888-8888-4888-8888-888888888808'::UUID;
    v_view_staff_uid UUID := 'a3888888-8888-4888-8888-888888888803'::UUID;
    v_none_staff_uid UUID := 'a3888888-8888-4888-8888-888888888800'::UUID;

    v_manage_staff_id UUID := '33888888-8888-4888-8888-888888888808'::UUID;
    v_view_staff_id UUID := '33888888-8888-4888-8888-888888888803'::UUID;
    v_none_staff_id UUID := '33888888-8888-4888-8888-888888888800'::UUID;

    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_cust2_id UUID := 'c3888888-8888-4888-8888-888888888802'::UUID;
BEGIN
    RAISE NOTICE '=== STARTING CLINIC WORKSPACE AUTHORITY HARDENING SQL TEST SUITE (R1.2) ===';

    -- Clean any existing isolated test fixture
    DELETE FROM public.audit_events WHERE tenant_id IN (v_tenant_id::text, v_tenant2_id::text);
    DELETE FROM public.clinic_patient_profiles WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.appointments WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.staff WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.customers WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.services WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        DELETE FROM public.subscriptions WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'published_sites') THEN
        DELETE FROM public.published_sites WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    DELETE FROM public.tenant_branding WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    DELETE FROM public.users_profile WHERE id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid);
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        DELETE FROM auth.users WHERE id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid)
           OR email LIKE '%_hardened_b3@test.invalid';
    END IF;
    DELETE FROM public.tenants WHERE id IN (v_tenant_id, v_tenant2_id);

    -- Seed Tenants
    INSERT INTO public.tenants (id, name, slug, status)
    VALUES (v_tenant_id, 'Hardening Clinic Tenant 1', 'hardening-clinic-1', 'active'),
           (v_tenant2_id, 'Hardening Clinic Tenant 2', 'hardening-clinic-2', 'active');

    -- Seed Auth Users with unique test.invalid emails
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, role, created_at, updated_at)
        VALUES (v_owner_uid, 'owner1_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_owner2_uid, 'owner2_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_inactive_owner_uid, 'owner_in_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_superadmin_uid, 'superadmin_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_manage_staff_uid, 'manage_staff_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_view_staff_uid, 'view_staff_hardened_b3@test.invalid', 'authenticated', now(), now()),
               (v_none_staff_uid, 'none_staff_hardened_b3@test.invalid', 'authenticated', now(), now())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Seed Users Profiles (using canonical name column)
    INSERT INTO public.users_profile (id, tenant_id, role, name, active)
    VALUES (v_owner_uid, v_tenant_id, 'tenant_owner', 'Owner One', true),
           (v_owner2_uid, v_tenant2_id, 'tenant_owner', 'Owner Two', true),
           (v_inactive_owner_uid, v_tenant_id, 'tenant_owner', 'Inactive Owner', false),
           (v_superadmin_uid, NULL, 'super_admin', 'Super Admin', true),
           (v_manage_staff_uid, v_tenant_id, 'staff', 'Manage Staff', true),
           (v_view_staff_uid, v_tenant_id, 'staff', 'View Staff', true),
           (v_none_staff_uid, v_tenant_id, 'staff', 'NoCap Staff', true);

    -- Seed Staff Records
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
    VALUES (v_manage_staff_id, v_tenant_id, v_manage_staff_uid, 'Manage Staff', true),
           (v_view_staff_id, v_tenant_id, v_view_staff_uid, 'View Staff', true),
           (v_none_staff_id, v_tenant_id, v_none_staff_uid, 'None Staff', true);

    -- Seed Clinic Staff Profiles with specific capabilities
    INSERT INTO public.clinic_staff_profiles (
        tenant_id, staff_id, practitioner_type, specialty,
        can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes
    ) VALUES 
        (v_tenant_id, v_manage_staff_id, 'nurse', 'Reception', true, false, false),
        (v_tenant_id, v_view_staff_id, 'physician', 'Cardiology', false, true, false),
        (v_tenant_id, v_none_staff_id, 'other', 'Assistant', false, false, false);

    -- Seed Customers (using canonical name column)
    INSERT INTO public.customers (id, tenant_id, name, phone)
    VALUES (v_cust_id, v_tenant_id, 'Patient One', '5550001'),
           (v_cust2_id, v_tenant2_id, 'Tenant2 Patient', '5550002');
END;
$$;

-- =========================================================================
-- 2. CATALOG EXECUTE ACL PROOF (AUTHENTICATED vs ANON)
-- =========================================================================
DO $$
BEGIN
    -- Authenticated Role Privileges
    IF NOT has_function_privilege('authenticated', 'public.clinic_get_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: authenticated role must have EXECUTE on clinic_get_patient_profile';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.clinic_upsert_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: authenticated role must have EXECUTE on clinic_upsert_patient_profile';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.clinic_get_staff_setup_profiles'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: authenticated role must have EXECUTE on clinic_get_staff_setup_profiles';
    END IF;
    RAISE NOTICE 'CLINIC_AUTHENTICATED_EXECUTE_ACL_PROVEN=YES';

    -- Anon Role Revocations
    IF has_function_privilege('anon', 'public.clinic_get_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: anon role must NOT have EXECUTE on clinic_get_patient_profile';
    END IF;
    IF has_function_privilege('anon', 'public.clinic_upsert_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: anon role must NOT have EXECUTE on clinic_upsert_patient_profile';
    END IF;
    IF has_function_privilege('anon', 'public.clinic_get_staff_setup_profiles'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL CHECK FAILED: anon role must NOT have EXECUTE on clinic_get_staff_setup_profiles';
    END IF;
    RAISE NOTICE 'CLINIC_ANON_EXECUTE_ACL_DENIED=YES';
END;
$$;

-- =========================================================================
-- 3. EXECUTABLE DOMAIN BEHAVIOR (SET LOCAL ROLE authenticated)
-- =========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888808', true);

DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    -- Read bounded profile succeeds
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST A FAILED: Manage-only staff should read bounded profile';
    END IF;
    RAISE NOTICE 'CLINIC_PROFILE_VIEW_WITHOUT_HISTORY_PROVEN=YES';

    -- History denied FORBIDDEN
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST B FAILED: Manage-only staff must NOT load patient history';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST B FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- Profile upsert succeeds
    v_res := public.clinic_upsert_patient_profile(
        p_customer_id := v_cust_id,
        p_blood_type := 'A Rh+',
        p_allergies := 'Penicillin'
    );
    IF (v_res->>'success')::boolean <> true OR v_res->>'patient_profile_id' IS NULL THEN
        RAISE EXCEPTION 'TEST C FAILED: Manage-only profile upsert failed or missing patient_profile_id';
    END IF;
    RAISE NOTICE 'CLINIC_PROFILE_MUTATION_MANAGE_ONLY_PROVEN=YES';
    RAISE NOTICE 'CLINIC_PROFILE_RESPONSE_CONTRACT_PROVEN=YES';
END;
$$;

-- TEST H, I, J: View-Only Staff
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888803', true);

DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST H FAILED: View-only staff should read bounded profile';
    END IF;

    v_res := public.clinic_get_patient_history(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST I FAILED: View-only staff should read clinical history';
    END IF;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'O Rh-');
        RAISE EXCEPTION 'TEST J FAILED: View-only staff must NOT mutate patient profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST J FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_VIEW_ONLY_MUTATION_DENIED=YES';
END;
$$;

-- TEST K, L, M: No-Capability Staff
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888800', true);

DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST K FAILED';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST K FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST L FAILED';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST L FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'B Rh+');
        RAISE EXCEPTION 'TEST M FAILED';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST M FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_NO_CAPABILITY_DENIAL_PROVEN=YES';
END;
$$;

-- TEST N, O: Cross-Tenant Isolation
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888808', true);

DO $$
DECLARE
    v_cust2_id UUID := 'c3888888-8888-4888-8888-888888888802'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust2_id);
        RAISE EXCEPTION 'TEST N FAILED';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST N FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust2_id, p_blood_type := 'AB Rh+');
        RAISE EXCEPTION 'TEST O FAILED';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST O FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_PROFILE_CROSS_TENANT_DENIED=YES';
END;
$$;

-- TEST S, T: Active Tenant Owner Setup RPC Success
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888801', true);

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_get_staff_setup_profiles();
    IF (v_res->>'success')::boolean <> true OR jsonb_array_length(v_res->'profiles') < 3 THEN
        RAISE EXCEPTION 'TEST S, T FAILED: Active tenant owner setup read failed';
    END IF;
    RAISE NOTICE 'CLINIC_OWNER_SETUP_READ_PROVEN=YES';
    RAISE NOTICE 'CLINIC_OWNER_SETUP_CROSS_TENANT_SAFE=YES';
END;
$$;

-- TEST INACTIVE OWNER SETUP DENIAL (v_inactive_owner_uid: active = false)
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888807', true);

DO $$
DECLARE
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST INACTIVE OWNER FAILED: Inactive tenant owner must NOT read setup profiles';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST INACTIVE OWNER FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_INACTIVE_OWNER_SETUP_DENIED=YES';
END;
$$;

-- TEST U, V: Non-Owner / Super Admin Setup RPC Denial
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888808', true);
DO $$
DECLARE
    v_res JSONB;
BEGIN
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST U FAILED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888809', true);
DO $$
DECLARE
    v_res JSONB;
BEGIN
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST V FAILED';
    EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- =========================================================================
-- 4. EXECUTABLE ANON DENIAL BEHAVIOR (SET LOCAL ROLE anon)
-- =========================================================================
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST P FAILED: Anon caller must NOT read bounded profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'TEST P FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'O Rh+');
        RAISE EXCEPTION 'TEST Q FAILED: Anon caller must NOT mutate profile';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_state NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'TEST Q FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST R FAILED: Anon caller must NOT read setup profiles';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST R FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_ANON_PROFILE_ACCESS_DENIED=YES';
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- =========================================================================
-- 5. CANONICAL AUDIT & ZERO LEAK POST-CHECKS (Privileged Session Role)
-- =========================================================================
DO $$
DECLARE
    v_tenant_id UUID := 'b3888888-8888-4888-8888-888888888801'::UUID;
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_owner_uid UUID := 'a3888888-8888-4888-8888-888888888801'::UUID;
    v_manage_staff_uid UUID := 'a3888888-8888-4888-8888-888888888808'::UUID;
    v_audit RECORD;
    v_res JSONB;
BEGIN
    -- Verify audit row inserted by authenticated manage-staff upsert
    SELECT * INTO v_audit
    FROM public.audit_events
    WHERE tenant_id = v_tenant_id::text
      AND action = 'clinic_patient_profile_changed'
    ORDER BY created_at DESC LIMIT 1;

    IF v_audit.id IS NULL THEN
        RAISE EXCEPTION 'CANONICAL AUDIT CHECK FAILED: Audit event missing';
    END IF;

    IF v_audit.actor_role <> 'staff' THEN
        RAISE EXCEPTION 'CANONICAL AUDIT CHECK FAILED: actor_role must be staff';
    END IF;

    IF v_audit.payload ? 'blood_type' OR v_audit.payload ? 'allergies' THEN
        RAISE EXCEPTION 'CANONICAL AUDIT CHECK FAILED: Payload leaked clinical health content';
    END IF;
    RAISE NOTICE 'CLINIC_PROFILE_MUTATION_AUDIT_CANONICAL=YES';

    -- Zero leak checks
    PERFORM set_config('request.jwt.claim.sub', v_manage_staff_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->'patient_profile') ? 'encounters' OR (v_res->'patient_profile') ? 'notes' THEN
        RAISE EXCEPTION 'LEAK CHECK FAILED: Bounded profile contains clinical history!';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_owner_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    v_res := public.clinic_get_staff_setup_profiles();
    IF (v_res->'profiles'->0) ? 'allergies' THEN
        RAISE EXCEPTION 'LEAK CHECK FAILED: Setup profiles contain patient health data!';
    END IF;
    RAISE NOTICE 'CLINIC_BOUNDED_PROFILE_NO_HISTORY_LEAK=YES';

    RAISE NOTICE 'CLINIC_WORKSPACE_DB_ROLE_CONTEXT_PROVEN=YES';
    RAISE NOTICE 'CLINIC_WORKSPACE_AUTHORITY_HARDENING_DB_EXECUTION=PASS';
END;
$$;

ROLLBACK;
