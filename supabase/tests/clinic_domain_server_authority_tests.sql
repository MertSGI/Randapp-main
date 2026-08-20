-- =========================================================================
-- TRANSACTIONAL TEST SUITE: clinic_domain_server_authority_tests.sql
-- Proves Clinic Block 1 Clinical Domain Server Authority, RLS Policies & RPC Contracts (R1.1 Test-Truth Closure)
-- Target: Disposable PostgreSQL database / Supabase
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant1_id       uuid := '11111111-1111-4111-8111-111111111111';
    v_tenant2_id       uuid := '22222222-2222-4222-8222-222222222222';
    
    v_owner1_id        uuid := 'a1111111-1111-4111-8111-111111111111';
    v_owner2_id        uuid := 'a7777777-7777-4777-8777-777777777777';
    v_inact_owner_id   uuid := 'a5555555-5555-4555-8555-555555555555';
    v_no_prof_user_id  uuid := 'a6666666-6666-4666-8666-666666666666';
    v_rec1_id          uuid := 'a2222222-2222-4222-8222-222222222222';
    v_doc1_id          uuid := 'a3333333-3333-4333-8333-333333333333';
    v_doc2_id          uuid := 'a4444444-4444-4444-8444-444444444444';
    
    v_staff_rec1_id    uuid := 'b1111111-1111-4111-8111-111111111111';
    v_staff_doc1_id    uuid := 'b2222222-2222-4222-8222-222222222222';
    v_staff_doc2_id    uuid := 'b3333333-3333-4333-8333-333333333333';
    v_inact_staff_id   uuid := 'b4444444-4444-4444-8444-444444444444';

    v_branch1_id       uuid := 'c1111111-1111-4111-8111-111111111111';
    v_branch2_id       uuid := 'c2222222-2222-4222-8222-222222222222';

    v_cust1_id         uuid := 'd1111111-1111-4111-8111-111111111111';
    v_cust2_id         uuid := 'd2222222-2222-4222-8222-222222222222';
    
    v_appt1_id         uuid := 'e1111111-1111-4111-8111-111111111111';
    v_appt2_id         uuid := 'e2222222-2222-4222-8222-222222222222';
    
    v_res              jsonb;
    v_pat_res          jsonb;
    v_enc1_id          uuid;
    v_note1_res        jsonb;
    v_note2_res        jsonb;
    v_history_res      jsonb;
    v_audit_count      integer;
    v_audit_check      record;
    v_row_count        integer;
    v_denied           boolean;
    v_priv_count       integer;
    v_anon_count       integer;
    v_sub_check        text;
BEGIN
    RAISE NOTICE 'Starting Clinic Domain Server Authority SQL Contract Tests (R1.1 Test-Truth Closure)...';

    -- 1. CLEANUP PREVIOUS TEST FIXTURES IF ANY
    DELETE FROM public.audit_events WHERE tenant_id IN (v_tenant1_id::text, v_tenant2_id::text);
    DELETE FROM public.clinic_encounter_notes WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_encounters WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_patient_profiles WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.appointments WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.staff WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.customers WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.branches WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.users_profile WHERE id IN (v_owner1_id, v_owner2_id, v_inact_owner_id, v_no_prof_user_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM auth.users WHERE id IN (v_owner1_id, v_owner2_id, v_inact_owner_id, v_no_prof_user_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM public.tenants WHERE id IN (v_tenant1_id, v_tenant2_id);

    -- 2. CREATE SEED TENANTS & AUTH USERS
    INSERT INTO public.tenants (id, slug, name, status)
    VALUES (v_tenant1_id, 'clinic-t1', 'Clinic Tenant 1', 'active'),
           (v_tenant2_id, 'clinic-t2', 'Clinic Tenant 2', 'active');

    -- Give test tenants active subscriptions and staff entitlement overrides for disposable testing
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    SELECT v_tenant1_id, p.id, pv.id, 'active', 'manual'
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id
    WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC LIMIT 1;

    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    SELECT v_tenant2_id, p.id, pv.id, 'active', 'manual'
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id
    WHERE p.code = 'kurumsal' AND pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC LIMIT 1;

    INSERT INTO public.tenant_entitlement_overrides (tenant_id, feature_key, value_type, is_unlimited, integer_value, reason)
    VALUES (v_tenant1_id, 'max_staff', 'integer', true, NULL, 'Clinic domain authority disposable test fixture'),
           (v_tenant2_id, 'max_staff', 'integer', true, NULL, 'Clinic domain authority disposable test fixture');

    INSERT INTO auth.users (id, email) VALUES
    (v_owner1_id, 'owner1@clinic.com'),
    (v_owner2_id, 'owner2@clinic.com'),
    (v_inact_owner_id, 'inact_owner@clinic.com'),
    (v_no_prof_user_id, 'noprofile@clinic.com'),
    (v_rec1_id, 'rec1@clinic.com'),
    (v_doc1_id, 'doc1@clinic.com'),
    (v_doc2_id, 'doc2@clinic.com');

    -- Users Profile
    INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
    (v_owner1_id, v_tenant1_id, 'tenant_owner', 'Dr. Active Owner 1', true),
    (v_owner2_id, v_tenant2_id, 'tenant_owner', 'Dr. Active Owner 2', true),
    (v_inact_owner_id, v_tenant1_id, 'tenant_owner', 'Dr. Inactive Owner', false),
    (v_rec1_id, v_tenant1_id, 'staff', 'Receptionist Jane', true),
    (v_doc1_id, v_tenant1_id, 'staff', 'Dr. Alice', true),
    (v_doc2_id, v_tenant2_id, 'staff', 'Dr. Bob', true);

    -- Create public.staff linked via user_profile_id
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
    (v_staff_rec1_id, v_tenant1_id, v_rec1_id, 'Receptionist Jane', true),
    (v_staff_doc1_id, v_tenant1_id, v_doc1_id, 'Dr. Alice', true),
    (v_staff_doc2_id, v_tenant2_id, v_doc2_id, 'Dr. Bob', true),
    (v_inact_staff_id, v_tenant1_id, NULL, 'Inactive Staff Member', false);

    -- Create branches & customers
    INSERT INTO public.branches (id, tenant_id, name, is_primary) VALUES
    (v_branch1_id, v_tenant1_id, 'Main Clinic Branch 1', true),
    (v_branch2_id, v_tenant2_id, 'Main Clinic Branch 2', true);

    INSERT INTO public.customers (id, tenant_id, name, email, phone) VALUES
    (v_cust1_id, v_tenant1_id, 'Patient John', 'john@patient.com', '555-0101'),
    (v_cust2_id, v_tenant2_id, 'Patient Mary', 'mary@patient.com', '555-0202');

    -- Create appointments
    INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, branch_id, appointment_date, appointment_time, status) VALUES
    (v_appt1_id, v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, '2026-09-10', '10:00:00', 'confirmed'),
    (v_appt2_id, v_tenant1_id, v_cust1_id, v_staff_rec1_id, v_branch1_id, '2026-09-10', '11:00:00', 'confirmed');


    -- =========================================================================
    -- D & F. ACTIVE TENANT OWNER 1 CONFIGURATION OF STAFF
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_owner1_id::text, true);
    SET LOCAL ROLE authenticated;

    -- F. Inactive target staff MUST be rejected
    v_denied := false;
    BEGIN
        v_res := public.clinic_set_staff_profile(v_inact_staff_id, 'receptionist', NULL, NULL, true, false, false);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INVALID_STATE%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL F1: Inactive target staff was granted Clinic profile!';
    END IF;

    -- D. Active tenant owner 1 configures active staff members
    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_rec1_id,
        p_practitioner_type => 'receptionist',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => false,
        p_can_write_clinical_notes => false
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED D1: clinic_set_staff_profile failed for receptionist.';
    END IF;

    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_doc1_id,
        p_practitioner_type => 'physician',
        p_specialty => 'dermatology',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => false,
        p_can_write_clinical_notes => true
    );
    IF (v_res->>'can_view_clinical_records')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED D2: can_write_clinical_notes did not imply can_view_clinical_records = true.';
    END IF;


    -- =========================================================================
    -- H. RECEPTIONIST-LIKE STAFF BOUNDARY
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_rec1_id::text, true);
    SET LOCAL ROLE authenticated;

    -- Manage patient profile allowed
    v_pat_res := public.clinic_upsert_patient_profile(
        p_customer_id => v_cust1_id,
        p_date_of_birth => '1990-05-15',
        p_sex_at_birth => 'male',
        p_emergency_contact_name => 'Emergency Contact',
        p_emergency_contact_phone => '555-9999',
        p_allergies => 'Penicillin',
        p_chronic_conditions => 'Hypertension'
    );
    IF (v_pat_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED H1: Receptionist failed to upsert patient profile.';
    END IF;

    -- Clinical history denied
    v_denied := false;
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL H2: Receptionist was allowed to read clinical history!';
    END IF;

    -- Start encounter denied
    v_denied := false;
    BEGIN
        v_res := public.clinic_start_encounter(v_appt2_id, 'Checkup');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL H3: Receptionist was allowed to start encounter!';
    END IF;


    -- =========================================================================
    -- I & J. PRACTITIONER & ASSIGNMENT BOUNDARY
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_doc1_id::text, true);
    SET LOCAL ROLE authenticated;

    -- J. Assigned practitioner mismatch denied
    v_denied := false;
    BEGIN
        v_res := public.clinic_start_encounter(v_appt2_id, 'Wrong practitioner start');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL J1: Practitioner started encounter assigned to another staff member!';
    END IF;

    -- I. Authorized practitioner starts own encounter
    v_res := public.clinic_start_encounter(
        p_appointment_id => v_appt1_id,
        p_reason_for_visit => 'Skin rash evaluation'
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED I1: Practitioner failed to start own encounter.';
    END IF;
    v_enc1_id := (v_res->>'encounter_id')::uuid;

    -- Save Note Version 1
    v_note1_res := public.clinic_save_encounter_note(
        p_encounter_id => v_enc1_id,
        p_subjective => 'Patient reports rash on left forearm for 3 days.',
        p_objective => 'Erythematous plaque observed.',
        p_assessment => 'Contact dermatitis',
        p_plan => 'Topical hydrocortisone 1% BID',
        p_note_status => 'draft'
    );
    IF (v_note1_res->>'version')::integer <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED I2: Initial note version was not 1.';
    END IF;

    -- Save Note Version 2
    v_note2_res := public.clinic_save_encounter_note(
        p_encounter_id => v_enc1_id,
        p_subjective => 'Patient reports rash on left forearm for 3 days. Added mild itching.',
        p_objective => 'Erythematous plaque observed, mild scaling.',
        p_assessment => 'Contact dermatitis - mild',
        p_plan => 'Topical hydrocortisone 1% BID + oral antihistamine PRN',
        p_note_status => 'final'
    );
    IF (v_note2_res->>'version')::integer <> 2 THEN
        RAISE EXCEPTION 'TEST FAILED I3: Revised note version was not 2.';
    END IF;

    -- Complete encounter
    v_res := public.clinic_complete_encounter(v_enc1_id);
    IF (v_res->>'status') <> 'completed' THEN
        RAISE EXCEPTION 'TEST FAILED I4: Complete encounter failed.';
    END IF;


    -- =========================================================================
    -- PROOF OF KNOWN PROTECTED ROWS BEFORE ANON / NO-PROFILE / DIRECT DML TESTS
    -- =========================================================================
    RESET ROLE;
    SELECT count(*) INTO v_priv_count FROM public.clinic_staff_profiles;
    IF v_priv_count < 2 THEN
        RAISE EXCEPTION 'FIXTURE FAIL: Privileged count on clinic_staff_profiles is expected >= 2, got %', v_priv_count;
    END IF;

    SELECT count(*) INTO v_priv_count FROM public.clinic_patient_profiles;
    IF v_priv_count < 1 THEN
        RAISE EXCEPTION 'FIXTURE FAIL: Privileged count on clinic_patient_profiles is expected >= 1, got %', v_priv_count;
    END IF;

    SELECT count(*) INTO v_priv_count FROM public.clinic_encounters;
    IF v_priv_count < 1 THEN
        RAISE EXCEPTION 'FIXTURE FAIL: Privileged count on clinic_encounters is expected >= 1, got %', v_priv_count;
    END IF;

    SELECT count(*) INTO v_priv_count FROM public.clinic_encounter_notes;
    IF v_priv_count < 2 THEN
        RAISE EXCEPTION 'FIXTURE FAIL: Privileged count on clinic_encounter_notes is expected >= 2, got %', v_priv_count;
    END IF;

    RAISE NOTICE 'ANON_PROTECTED_ROWS_PREEXIST=YES';


    -- =========================================================================
    -- A. ANON BOUNDARY CHECKS WITH KNOWN PROTECTED ROWS
    -- =========================================================================
    SET LOCAL ROLE anon;

    -- A1. SELECT zero visibility with pre-existing protected rows
    IF (SELECT count(*) FROM public.clinic_staff_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_patient_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounters) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounter_notes) <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL A1: anon has non-zero SELECT visibility on Clinic tables despite pre-existing protected rows!';
    END IF;

    RAISE NOTICE 'ANON_CLINICAL_VISIBILITY_ZERO=YES';

    -- A2. Direct INSERT denied and row not persisted
    v_denied := false;
    BEGIN
        INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id) VALUES (v_tenant1_id, v_staff_rec1_id);
    EXCEPTION WHEN OTHERS THEN
        v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL A2: anon direct INSERT unexpectedly succeeded!';
    END IF;

    -- A3. Direct UPDATE denied / zero rows
    UPDATE public.clinic_staff_profiles SET practitioner_type = 'hacked' WHERE staff_id = v_staff_rec1_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL A3: anon direct UPDATE modified % rows!', v_row_count;
    END IF;

    -- A4. Direct DELETE denied / zero rows
    DELETE FROM public.clinic_staff_profiles WHERE staff_id = v_staff_rec1_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL A4: anon direct DELETE deleted % rows!', v_row_count;
    END IF;

    -- A5. RPC execution denied for all 6 RPCs
    v_denied := false;
    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_set_staff_profile succeeded!'; END IF;

    v_denied := false;
    BEGIN
        v_res := public.clinic_upsert_patient_profile(v_cust1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_upsert_patient_profile succeeded!'; END IF;

    v_denied := false;
    BEGIN
        v_res := public.clinic_start_encounter(v_appt1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_start_encounter succeeded!'; END IF;

    v_denied := false;
    BEGIN
        v_res := public.clinic_save_encounter_note(v_enc1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_save_encounter_note succeeded!'; END IF;

    v_denied := false;
    BEGIN
        v_res := public.clinic_complete_encounter(v_enc1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_complete_encounter succeeded!'; END IF;

    v_denied := false;
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN RAISE EXCEPTION 'SECURITY FAIL A5: anon clinic_get_patient_history succeeded!'; END IF;


    -- =========================================================================
    -- B. AUTHENTICATED USER WITHOUT PROFILE DENIAL WITH KNOWN PROTECTED ROWS
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_no_prof_user_id::text, true);
    SET LOCAL ROLE authenticated;

    -- B1. SELECT zero visibility with pre-existing protected rows
    IF (SELECT count(*) FROM public.clinic_staff_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_patient_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounters) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounter_notes) <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL B1: Auth user without profile has SELECT access to protected Clinic rows!';
    END IF;

    -- B2. RPC execution denied
    v_denied := false;
    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' OR SQLERRM LIKE '%UNAUTHENTICATED%' OR SQLERRM LIKE '%permission denied%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL B2: Auth user without profile was allowed to call clinic_set_staff_profile!';
    END IF;


    -- =========================================================================
    -- C. INACTIVE TENANT OWNER DENIAL
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_inact_owner_id::text, true);
    SET LOCAL ROLE authenticated;

    v_denied := false;
    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id, 'receptionist', NULL, NULL, true, false, false);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL C1: Inactive tenant owner was allowed to configure staff profile!';
    END IF;


    -- =========================================================================
    -- E. OWNER DIRECT DML DENIAL PROOF (BLOCKER A & ROW_COUNT DIAGNOSTICS)
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_owner1_id::text, true);
    SET LOCAL ROLE authenticated;

    -- E1. Owner direct INSERT denied and row not persisted
    v_denied := false;
    BEGIN
        INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, can_manage_patient_profiles)
        VALUES (v_tenant1_id, v_staff_rec1_id, true);
    EXCEPTION WHEN OTHERS THEN
        v_denied := true;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL E1: Tenant owner direct INSERT against clinic_staff_profiles unexpectedly succeeded!';
    END IF;

    -- E2. Owner direct UPDATE denied / 0 rows affected
    UPDATE public.clinic_staff_profiles
    SET can_write_clinical_notes = true
    WHERE staff_id = v_staff_rec1_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL E2: Tenant owner direct UPDATE modified % rows in clinic_staff_profiles!', v_row_count;
    END IF;

    -- E3. Owner direct DELETE denied / 0 rows affected
    DELETE FROM public.clinic_staff_profiles WHERE staff_id = v_staff_rec1_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL E3: Tenant owner direct DELETE deleted % rows from clinic_staff_profiles!', v_row_count;
    END IF;

    -- Verify row still exists unchanged as privileged operator
    RESET ROLE;
    IF (SELECT can_write_clinical_notes FROM public.clinic_staff_profiles WHERE staff_id = v_staff_rec1_id) IS NOT FALSE THEN
        RAISE EXCEPTION 'SECURITY FAIL E4: clinic_staff_profiles row was mutated by direct DML!';
    END IF;

    RAISE NOTICE 'OWNER_DIRECT_DML_DENIED=YES';


    -- =========================================================================
    -- N. NOTE IMMUTABILITY & DIRECT DML DENIAL (PRACTITIONER ROW_COUNT PROOF)
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_doc1_id::text, true);
    SET LOCAL ROLE authenticated;

    -- N1. Direct authenticated UPDATE denied / 0 rows
    UPDATE public.clinic_encounter_notes
    SET subjective = 'MUTATED DIRECTLY BY PRACTITIONER'
    WHERE encounter_id = v_enc1_id AND version = 1;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL N1: Direct UPDATE on clinical notes modified % rows!', v_row_count;
    END IF;

    -- N2. Direct authenticated DELETE denied / 0 rows
    DELETE FROM public.clinic_encounter_notes
    WHERE encounter_id = v_enc1_id AND version = 1;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL N2: Direct DELETE on clinical notes deleted % rows!', v_row_count;
    END IF;

    -- Prove Version 1 content remained immutable
    RESET ROLE;
    IF (SELECT subjective FROM public.clinic_encounter_notes WHERE encounter_id = v_enc1_id AND version = 1) <> 'Patient reports rash on left forearm for 3 days.' THEN
        RAISE EXCEPTION 'SECURITY FAIL N3: Historical clinical note version 1 was mutated or deleted!';
    END IF;

    RAISE NOTICE 'CLINICAL_NOTE_APPEND_ONLY_PROVEN=YES';


    -- =========================================================================
    -- K. AUTHORIZED TENANT 2 OWNER & CROSS-TENANT PRACTITIONER BOUNDARY
    -- =========================================================================
    -- K0. Create real Tenant 2 Owner Authority & configure Dr. Bob as fully authorized practitioner
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_owner2_id::text, true);
    SET LOCAL ROLE authenticated;

    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_doc2_id,
        p_practitioner_type => 'physician',
        p_specialty => 'cardiology',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => true,
        p_can_write_clinical_notes => true
    );
    IF (v_res->>'can_write_clinical_notes')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FIXTURE FAIL: Failed to configure Dr. Bob as fully authorized Tenant 2 practitioner.';
    END IF;

    -- Switch explicit identity to Tenant 2 Practitioner (Dr. Bob)
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_doc2_id::text, true);
    SET LOCAL ROLE authenticated;

    -- K1. Read Tenant-1 patient history denied specifically because of TENANT BOUNDARY
    v_denied := false;
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%NOT_FOUND%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL K1: Tenant 2 practitioner read Tenant 1 patient history!';
    END IF;

    -- K2. Save note to Tenant-1 encounter denied specifically because of TENANT BOUNDARY
    v_denied := false;
    BEGIN
        v_res := public.clinic_save_encounter_note(v_enc1_id, 'Hacked note', NULL, NULL, NULL, 'draft');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' OR SQLERRM LIKE '%NOT_FOUND%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL K2: Tenant 2 practitioner saved note to Tenant 1 encounter!';
    END IF;

    -- K3. Complete Tenant-1 encounter denied specifically because of TENANT BOUNDARY
    v_denied := false;
    BEGIN
        v_res := public.clinic_complete_encounter(v_enc1_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' OR SQLERRM LIKE '%NOT_FOUND%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL K3: Tenant 2 practitioner completed Tenant 1 encounter!';
    END IF;

    RAISE NOTICE 'AUTHORIZED_CROSS_TENANT_BOUNDARY_PROVEN=YES';


    -- =========================================================================
    -- L. BRANCH & APPOINTMENT CONTEXT HARDENING
    -- =========================================================================
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_doc1_id::text, true);
    SET LOCAL ROLE authenticated;

    v_denied := false;
    BEGIN
        v_res := public.clinic_start_encounter('00000000-0000-0000-0000-000000000000', 'Nonexistent appt');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%NOT_FOUND%' THEN
            v_denied := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF v_denied IS NOT TRUE THEN
        RAISE EXCEPTION 'SECURITY FAIL L1: Start encounter succeeded for non-existent appointment!';
    END IF;


    -- =========================================================================
    -- O. AUDIT FORBIDDEN KEYS & NO CLINICAL CONTENT LEAKAGE
    -- =========================================================================
    RESET ROLE;

    SELECT count(*) INTO v_audit_count
    FROM public.audit_events
    WHERE tenant_id = v_tenant1_id::text;

    IF v_audit_count < 4 THEN
        RAISE EXCEPTION 'TEST FAILED O1: Expected at least 4 audit events, got %', v_audit_count;
    END IF;

    FOR v_audit_check IN (
        SELECT action, payload FROM public.audit_events WHERE tenant_id = v_tenant1_id::text
    ) LOOP
        -- Inspect JSON payload keys for sensitive fields
        IF (v_audit_check.payload ? 'subjective') OR
           (v_audit_check.payload ? 'objective') OR
           (v_audit_check.payload ? 'assessment') OR
           (v_audit_check.payload ? 'plan') OR
           (v_audit_check.payload ? 'allergies') OR
           (v_audit_check.payload ? 'chronic_conditions') OR
           (v_audit_check.payload ? 'reason_for_visit') OR
           (v_audit_check.payload ? 'emergency_contact_phone') THEN
            RAISE EXCEPTION 'AUDIT KEY LEAK FAIL O2: Forbidden clinical field key present in audit payload for action %!', v_audit_check.action;
        END IF;

        -- Value string checks
        IF v_audit_check.payload::text LIKE '%Contact dermatitis%'
           OR v_audit_check.payload::text LIKE '%hydrocortisone%'
           OR v_audit_check.payload::text LIKE '%Penicillin%'
           OR v_audit_check.payload::text LIKE '%Skin rash%'
           OR v_audit_check.payload::text LIKE '%555-9999%' THEN
            RAISE EXCEPTION 'AUDIT LEAK FAIL O3: Sensitive clinical/contact content leaked into audit payload for action %!', v_audit_check.action;
        END IF;
    END LOOP;

    RAISE NOTICE 'AUDIT_CLINICAL_CONTENT_LEAK=NO';


    -- =========================================================================
    -- P. PUBLIC / SELF-SERVICE CLINICAL ISOLATION PROOF
    -- =========================================================================
    -- Inspect definitions of canonical public booking functions and prove zero references to Clinic tables
    IF (SELECT count(*) FROM pg_proc WHERE proname IN ('create_public_booking', 'get_public_available_slots', 'can_accept_public_booking')
        AND (prosrc LIKE '%clinic_patient_profiles%' OR prosrc LIKE '%clinic_encounters%' OR prosrc LIKE '%clinic_encounter_notes%')) <> 0 THEN
        RAISE EXCEPTION 'PUBLIC ISOLATION FAIL P1: Public booking functions contain references to Clinic clinical tables!';
    END IF;

    RAISE NOTICE 'PUBLIC_SELF_SERVICE_CLINICAL_ISOLATION=PASS';

    RAISE NOTICE 'CLINIC_SQL_DB_EXECUTION=PASS';
    RAISE NOTICE 'SUCCESS: All Expanded Clinic Domain Server Authority SQL Contract Tests Passed (R1.2 Executable Truth)!';
END $$;

ROLLBACK;
