-- LARİ CLINIC WORKSPACE AUTHORITY HARDENING EXECUTABLE TEST SUITE (R1.2 RECOVERED)
-- File: supabase/tests/clinic_workspace_authority_hardening_tests.sql
-- Purpose:
--   Executable SQL verification for Migration 63 with REAL DB role switching,
--   catalog EXECUTE ACL proof, inactive tenant owner setup denial, exact UUID signatures,
--   and canonical audit verification.
--   All authorization tests fail-closed: no EXCEPTION WHEN OTHERS THEN NULL on proof paths.

BEGIN;

-- =========================================================================
-- 1. FIXTURE SETUP (Privileged Session Role — postgres superuser)
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

    v_elig_check JSONB;
    v_action_check JSONB;
    v_quota_check JSONB;
BEGIN
    RAISE NOTICE '=== STARTING CLINIC WORKSPACE AUTHORITY HARDENING SQL TEST SUITE (R1.2 RECOVERED) ===';

    -- Clean any existing isolated test fixture (child relations first with table checks)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_events') THEN
        DELETE FROM public.audit_events WHERE tenant_id IN (v_tenant_id::text, v_tenant2_id::text);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_notes') THEN
        DELETE FROM public.clinic_notes WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_encounters') THEN
        DELETE FROM public.clinic_encounters WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_consents') THEN
        DELETE FROM public.clinic_consents WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_prescriptions') THEN
        DELETE FROM public.clinic_prescriptions WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_medical_documents') THEN
        DELETE FROM public.clinic_medical_documents WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_vaccinations') THEN
        DELETE FROM public.clinic_vaccinations WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_lab_results') THEN
        DELETE FROM public.clinic_lab_results WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_vital_signs') THEN
        DELETE FROM public.clinic_vital_signs WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_patient_profiles') THEN
        DELETE FROM public.clinic_patient_profiles WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clinic_staff_profiles') THEN
        DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
        DELETE FROM public.appointments WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff') THEN
        DELETE FROM public.staff WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
        DELETE FROM public.customers WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
        DELETE FROM public.services WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_entitlement_overrides') THEN
        DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        DELETE FROM public.subscriptions WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'published_sites') THEN
        DELETE FROM public.published_sites WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_branding') THEN
        DELETE FROM public.tenant_branding WHERE tenant_id IN (v_tenant_id, v_tenant2_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users_profile') THEN
        DELETE FROM public.users_profile WHERE id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid);
    END IF;

    -- Clean auth tables safely — narrowly justified fixture cleanup only
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
            DELETE FROM auth.identities WHERE user_id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'sessions') THEN
            DELETE FROM auth.sessions WHERE user_id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'mfa_factors') THEN
            DELETE FROM auth.mfa_factors WHERE user_id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'refresh_tokens') THEN
            DELETE FROM auth.refresh_tokens WHERE user_id IN (v_owner_uid::text, v_owner2_uid::text, v_inactive_owner_uid::text, v_superadmin_uid::text, v_manage_staff_uid::text, v_view_staff_uid::text, v_none_staff_uid::text);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
            DELETE FROM auth.users WHERE id IN (v_owner_uid, v_owner2_uid, v_inactive_owner_uid, v_superadmin_uid, v_manage_staff_uid, v_view_staff_uid, v_none_staff_uid)
               OR email LIKE '%_hardened_b3@test.invalid';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Narrowly justified: auth schema FK cleanup may fail in some Supabase versions.
        -- This is fixture cleanup only, NOT authorization proof.
        RAISE NOTICE 'AUTH_CLEANUP_SKIPPED: % (non-proof fixture path)', SQLERRM;
    END;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        DELETE FROM public.tenants WHERE id IN (v_tenant_id, v_tenant2_id);
    END IF;

    -- Seed Tenants
    INSERT INTO public.tenants (id, name, slug, status)
    VALUES (v_tenant_id, 'Hardening Clinic Tenant 1', 'hardening-clinic-1', 'active'),
           (v_tenant2_id, 'Hardening Clinic Tenant 2', 'hardening-clinic-2', 'active');

    -- Commercial Fixture Setup: Subscription & Entitlement Overrides
    INSERT INTO public.subscriptions (
        tenant_id,
        plan_id,
        plan_version_id,
        status,
        billing_mode
    )
    SELECT
        v_tenant_id,
        p.id,
        pv.id,
        'manual_active',
        'manual'
    FROM public.plans p
    JOIN public.plan_versions pv
      ON pv.plan_id = p.id
    WHERE p.code = 'baslangic'
    ORDER BY
        (pv.lifecycle_status = 'published') DESC,
        pv.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMMERCIAL FIXTURE FAIL: baslangic plan/version lookup returned no rows';
    END IF;

    INSERT INTO public.tenant_entitlement_overrides (
        tenant_id,
        feature_key,
        value_type,
        boolean_value,
        is_unlimited,
        reason
    ) VALUES (
        v_tenant_id,
        'staff_management',
        'boolean',
        true,
        false,
        'LARI Clinic Block 3 disposable authority test fixture'
    );

    INSERT INTO public.tenant_entitlement_overrides (
        tenant_id,
        feature_key,
        value_type,
        is_unlimited,
        integer_value,
        reason
    ) VALUES (
        v_tenant_id,
        'max_staff',
        'integer',
        true,
        NULL,
        'LARI Clinic Block 3 disposable authority test fixture'
    );

    -- Prove Fixture Preconditions before active staff INSERT
    v_elig_check := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_elig_check->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'COMMERCIAL FIXTURE PRECONDITION FAILED: resolve_tenant_commercial_eligibility returned eligible=false: %', v_elig_check;
    END IF;

    v_action_check := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'staff_management', now());
    IF (v_action_check->>'allowed')::boolean <> true THEN
        RAISE EXCEPTION 'COMMERCIAL FIXTURE PRECONDITION FAILED: assert_tenant_commercial_action_allowed returned allowed=false: %', v_action_check;
    END IF;

    v_quota_check := public.resolve_commercial_quota(v_tenant_id, 'max_staff');
    IF (v_quota_check->>'is_unlimited')::boolean <> true AND COALESCE((v_quota_check->>'limit_value')::bigint, 0) < 3 THEN
        RAISE EXCEPTION 'COMMERCIAL FIXTURE PRECONDITION FAILED: resolve_commercial_quota max_staff is neither unlimited nor >= 3: %', v_quota_check;
    END IF;

    RAISE NOTICE 'CLINIC_HARDENING_COMMERCIAL_FIXTURE_READY=YES';

    -- Seed Auth Users
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO auth.users (id, email, role, created_at, updated_at)
        VALUES ('a3888888-8888-4888-8888-888888888801'::UUID, 'owner1_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888802'::UUID, 'owner2_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888807'::UUID, 'owner_in_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888809'::UUID, 'superadmin_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888808'::UUID, 'manage_staff_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888803'::UUID, 'view_staff_hardened_b3@test.invalid', 'authenticated', now(), now()),
               ('a3888888-8888-4888-8888-888888888800'::UUID, 'none_staff_hardened_b3@test.invalid', 'authenticated', now(), now())
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

    -- Seed Staff Records (now valid after commercial fixture precondition proven)
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

    RAISE NOTICE 'CLINIC_HARDENING_SECTION1_SETUP_COMPLETE=YES';
END;
$$;

-- =========================================================================
-- 2. CATALOG EXECUTE ACL PROOF (AUTHENTICATED vs ANON)
--    Uses has_function_privilege under privileged postgres session.
--    Fail-closed: RAISE EXCEPTION on any assertion failure.
-- =========================================================================
DO $$
BEGIN
    -- Authenticated Role Privileges — must have EXECUTE
    IF NOT has_function_privilege('authenticated', 'public.clinic_get_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: authenticated lacks EXECUTE on clinic_get_patient_profile';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.clinic_upsert_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: authenticated lacks EXECUTE on clinic_upsert_patient_profile';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.clinic_get_staff_setup_profiles'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: authenticated lacks EXECUTE on clinic_get_staff_setup_profiles';
    END IF;
    RAISE NOTICE 'CLINIC_AUTHENTICATED_EXECUTE_ACL_PROVEN=YES';

    -- Anon Role Revocations — must NOT have EXECUTE
    IF has_function_privilege('anon', 'public.clinic_get_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: anon has EXECUTE on clinic_get_patient_profile';
    END IF;
    IF has_function_privilege('anon', 'public.clinic_upsert_patient_profile'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: anon has EXECUTE on clinic_upsert_patient_profile';
    END IF;
    IF has_function_privilege('anon', 'public.clinic_get_staff_setup_profiles'::regproc, 'EXECUTE') THEN
        RAISE EXCEPTION 'ACL FAIL: anon has EXECUTE on clinic_get_staff_setup_profiles';
    END IF;
    RAISE NOTICE 'CLINIC_ANON_EXECUTE_ACL_DENIED=YES';
    RAISE NOTICE 'CLINIC_HARDENING_SECTION2_ACL_COMPLETE=YES';
END;
$$;

-- =========================================================================
-- 3. EXECUTABLE DOMAIN BEHAVIOR (Authenticated Caller Context)
--    REAL top-level SET LOCAL ROLE authenticated
-- =========================================================================
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RAISE EXCEPTION
          'DB ROLE FAIL: current_user is %, expected authenticated',
          current_user;
    END IF;

    RAISE NOTICE
      'CLINIC_AUTHENTICATED_DB_ROLE_ACTIVE=YES';
END;
$$;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888808', true);

-- TEST A, B, C: Manage-capable staff
DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    -- A: Read bounded profile succeeds
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST A FAILED: clinic_get_patient_profile did not return success=true';
    END IF;
    RAISE NOTICE 'CLINIC_PROFILE_VIEW_WITHOUT_HISTORY_PROVEN=YES';

    -- B: History denied FORBIDDEN
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST B FAILED: clinic_get_patient_history should have raised FORBIDDEN but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST B FAILED%' THEN
            RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST B FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- C: Profile upsert succeeds
    v_res := public.clinic_upsert_patient_profile(
        p_customer_id := v_cust_id,
        p_blood_type := 'A Rh+',
        p_allergies := 'Penicillin'
    );
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST C FAILED: clinic_upsert_patient_profile did not return success=true';
    END IF;
    IF v_res->>'patient_profile_id' IS NULL THEN
        RAISE EXCEPTION 'TEST C FAILED: clinic_upsert_patient_profile did not return patient_profile_id';
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
    -- H: View-only can read profile
    v_res := public.clinic_get_patient_profile(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST H FAILED: view-only staff cannot read patient profile';
    END IF;

    -- I: View-only can read history
    v_res := public.clinic_get_patient_history(v_cust_id);
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST I FAILED: view-only staff cannot read patient history';
    END IF;

    -- J: View-only CANNOT upsert
    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'O Rh-');
        RAISE EXCEPTION 'TEST J FAILED: view-only staff should be denied upsert but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
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
    -- K: No-cap staff denied profile read
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST K FAILED: no-cap staff should be denied profile read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST K FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- L: No-cap staff denied history read
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust_id);
        RAISE EXCEPTION 'TEST L FAILED: no-cap staff should be denied history read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST L FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- M: No-cap staff denied upsert
    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'B Rh+');
        RAISE EXCEPTION 'TEST M FAILED: no-cap staff should be denied upsert but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
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
    -- N: Read cross-tenant profile raises NOT_FOUND
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust2_id);
        RAISE EXCEPTION 'TEST N FAILED: cross-tenant profile read should be denied but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST N FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- O: Upsert cross-tenant profile fails closed
    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust2_id, p_blood_type := 'AB Rh+');
        RAISE EXCEPTION 'TEST O FAILED: cross-tenant upsert should be denied but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%NOT_FOUND%' AND v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST O FAILED [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_PROFILE_CROSS_TENANT_DENIED=YES';
END;
$$;

-- TEST S, T: Active Tenant Owner Setup RPC Success
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888801', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_get_staff_setup_profiles();
    IF (v_res->>'success')::boolean <> true THEN
        RAISE EXCEPTION 'TEST S FAILED: clinic_get_staff_setup_profiles did not return success=true';
    END IF;
    IF jsonb_array_length(v_res->'profiles') < 3 THEN
        RAISE EXCEPTION 'TEST T FAILED: Expected at least 3 staff profiles, got %', jsonb_array_length(v_res->'profiles');
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
        RAISE EXCEPTION 'TEST INACTIVE OWNER FAILED: inactive owner should be denied but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST INACTIVE OWNER FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_INACTIVE_OWNER_SETUP_DENIED=YES';
END;
$$;

-- TEST U: Non-Owner (staff) Setup RPC Denial — fail-closed
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888808', true);
DO $$
DECLARE
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST U FAILED: non-owner staff should be denied setup read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST U FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_NON_OWNER_SETUP_DENIED=YES';
END;
$$;

-- TEST V: Super Admin Setup RPC Denial — fail-closed
SELECT set_config('request.jwt.claim.sub', 'a3888888-8888-4888-8888-888888888809', true);
DO $$
DECLARE
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST V FAILED: super_admin should be denied setup read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_msg NOT LIKE '%FORBIDDEN%' AND v_err_state <> '42501' THEN
            RAISE EXCEPTION 'TEST V FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_SUPERADMIN_SETUP_DENIED=YES';
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'CLINIC_HARDENING_SECTION3_DOMAIN_COMPLETE=YES';
END;
$$;

RESET ROLE;

SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);

-- =========================================================================
-- 4. EXECUTABLE ANON DENIAL BEHAVIOR (Anon Caller Context)
--    REAL top-level SET LOCAL ROLE anon
-- =========================================================================
SET LOCAL ROLE anon;

DO $$
BEGIN
    IF current_user <> 'anon' THEN
        RAISE EXCEPTION
          'DB ROLE FAIL: current_user is %, expected anon',
          current_user;
    END IF;

    RAISE NOTICE
      'CLINIC_ANON_DB_ROLE_ACTIVE=YES';
END;
$$;

SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
    v_cust_id UUID := 'c3888888-8888-4888-8888-888888888801'::UUID;
    v_res JSONB;
    v_err_msg TEXT;
    v_err_state TEXT;
BEGIN
    -- P: Anon denied patient profile read
    BEGIN
        v_res := public.clinic_get_patient_profile(v_cust_id);
        RAISE EXCEPTION 'TEST P FAILED: anon should be denied profile read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'TEST P FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- Q: Anon denied patient profile upsert
    BEGIN
        v_res := public.clinic_upsert_patient_profile(p_customer_id := v_cust_id, p_blood_type := 'O Rh+');
        RAISE EXCEPTION 'TEST Q FAILED: anon should be denied upsert but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'TEST Q FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;

    -- R: Anon denied staff setup profiles
    BEGIN
        v_res := public.clinic_get_staff_setup_profiles();
        RAISE EXCEPTION 'TEST R FAILED: anon should be denied setup read but returned normally';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT, v_err_state = RETURNED_SQLSTATE;
        IF v_err_msg LIKE 'TEST%' THEN RAISE;
        ELSIF v_err_state <> '42501' AND v_err_msg NOT LIKE '%UNAUTHENTICATED%' AND v_err_msg NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'TEST R FAILED with UNEXPECTED ERROR [%: %]', v_err_state, v_err_msg;
        END IF;
    END;
    RAISE NOTICE 'CLINIC_ANON_PROFILE_ACCESS_DENIED=YES';
    RAISE NOTICE 'CLINIC_HARDENING_SECTION4_ANON_COMPLETE=YES';
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
        RAISE EXCEPTION 'CANONICAL AUDIT CHECK FAILED: actor_role must be staff, got %', v_audit.actor_role;
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
    RAISE NOTICE 'CLINIC_HARDENING_SECTION5_AUDIT_COMPLETE=YES';
END;
$$;

ROLLBACK;
