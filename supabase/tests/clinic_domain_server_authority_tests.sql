-- =========================================================================
-- TRANSACTIONAL TEST SUITE: clinic_domain_server_authority_tests.sql
-- Proves Clinic Block 1 Clinical Domain Server Authority, RLS Policies & RPC Contracts (R1 Expanded Security & Authority Truth)
-- Target: Disposable PostgreSQL database / Supabase
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant1_id     uuid := '11111111-1111-4111-8111-111111111111';
    v_tenant2_id     uuid := '22222222-2222-4222-8222-222222222222';
    
    v_owner1_id      uuid := 'a1111111-1111-4111-8111-111111111111';
    v_inact_owner_id uuid := 'a5555555-5555-4555-8555-555555555555';
    v_no_prof_user_id uuid := 'a6666666-6666-4666-8666-666666666666';
    v_rec1_id        uuid := 'a2222222-2222-4222-8222-222222222222';
    v_doc1_id        uuid := 'a3333333-3333-4333-8333-333333333333';
    v_doc2_id        uuid := 'a4444444-4444-4444-8444-444444444444';
    
    v_staff_rec1_id  uuid := 'b1111111-1111-4111-8111-111111111111';
    v_staff_doc1_id  uuid := 'b2222222-2222-4222-8222-222222222222';
    v_staff_doc2_id  uuid := 'b3333333-3333-4333-8333-333333333333';
    v_inact_staff_id uuid := 'b4444444-4444-4444-8444-444444444444';

    v_branch1_id     uuid := 'c1111111-1111-4111-8111-111111111111';
    v_branch2_id     uuid := 'c2222222-2222-4222-8222-222222222222';

    v_cust1_id       uuid := 'd1111111-1111-4111-8111-111111111111';
    v_cust2_id       uuid := 'd2222222-2222-4222-8222-222222222222';
    
    v_appt1_id       uuid := 'e1111111-1111-4111-8111-111111111111';
    v_appt2_id       uuid := 'e2222222-2222-4222-8222-222222222222';
    
    v_res            jsonb;
    v_pat_res        jsonb;
    v_enc1_id        uuid;
    v_note1_res      jsonb;
    v_note2_res      jsonb;
    v_history_res    jsonb;
    v_audit_count    integer;
    v_audit_check    record;
    v_row_count      integer;
BEGIN
    RAISE NOTICE 'Starting Expanded Clinic Domain Server Authority SQL Contract Tests (R1 Repair)...';

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
    DELETE FROM public.users_profile WHERE id IN (v_owner1_id, v_inact_owner_id, v_no_prof_user_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM auth.users WHERE id IN (v_owner1_id, v_inact_owner_id, v_no_prof_user_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM public.tenants WHERE id IN (v_tenant1_id, v_tenant2_id);

    -- 2. CREATE SEED TENANTS & AUTH USERS
    INSERT INTO public.tenants (id, slug, name, status)
    VALUES (v_tenant1_id, 'clinic-t1', 'Clinic Tenant 1', 'active'),
           (v_tenant2_id, 'clinic-t2', 'Clinic Tenant 2', 'active');

    INSERT INTO auth.users (id, email) VALUES
    (v_owner1_id, 'owner1@clinic.com'),
    (v_inact_owner_id, 'inact_owner@clinic.com'),
    (v_no_prof_user_id, 'noprofile@clinic.com'),
    (v_rec1_id, 'rec1@clinic.com'),
    (v_doc1_id, 'doc1@clinic.com'),
    (v_doc2_id, 'doc2@clinic.com');

    -- Users Profile
    INSERT INTO public.users_profile (id, tenant_id, role, full_name, active) VALUES
    (v_owner1_id, v_tenant1_id, 'tenant_owner', 'Dr. Active Owner', true),
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
    -- A. ANON BOUNDARY CHECKS
    -- =========================================================================
    SET LOCAL ROLE anon;

    -- SELECT zero visibility
    IF (SELECT count(*) FROM public.clinic_staff_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_patient_profiles) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounters) <> 0 OR
       (SELECT count(*) FROM public.clinic_encounter_notes) <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL A1: anon has non-zero SELECT visibility on Clinic tables!';
    END IF;

    -- Direct DML denied
    BEGIN
        INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id) VALUES (v_tenant1_id, v_staff_rec1_id);
        RAISE EXCEPTION 'SECURITY FAIL A2: anon direct INSERT succeeded!';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- RPC execution denied
    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id);
        RAISE EXCEPTION 'SECURITY FAIL A3: anon RPC execution succeeded!';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;


    -- =========================================================================
    -- B. AUTHENTICATED USER WITHOUT PROFILE DENIAL
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_no_prof_user_id);
    SET LOCAL ROLE authenticated;

    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id);
        RAISE EXCEPTION 'SECURITY FAIL B1: Auth user without profile was allowed to call clinic_set_staff_profile!';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    IF (SELECT count(*) FROM public.clinic_staff_profiles) <> 0 THEN
        RAISE EXCEPTION 'SECURITY FAIL B2: Auth user without profile has SELECT access to clinic_staff_profiles!';
    END IF;


    -- =========================================================================
    -- C. INACTIVE TENANT OWNER DENIAL
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_inact_owner_id);
    SET LOCAL ROLE authenticated;

    BEGIN
        v_res := public.clinic_set_staff_profile(v_staff_rec1_id, 'receptionist', NULL, NULL, true, false, false);
        RAISE EXCEPTION 'SECURITY FAIL C1: Inactive tenant owner was allowed to configure staff profile!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error for inactive owner: %', SQLERRM;
        END IF;
    END;


    -- =========================================================================
    -- D & F. ACTIVE TENANT OWNER & INACTIVE TARGET STAFF
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_owner1_id);
    SET LOCAL ROLE authenticated;

    -- F. Inactive target staff MUST be rejected
    BEGIN
        v_res := public.clinic_set_staff_profile(v_inact_staff_id, 'receptionist', NULL, NULL, true, false, false);
        RAISE EXCEPTION 'SECURITY FAIL F1: Inactive target staff was granted Clinic profile!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%INVALID_STATE%' THEN
            RAISE EXCEPTION 'Unexpected error for inactive target staff: %', SQLERRM;
        END IF;
    END;

    -- D. Active tenant owner configures active staff members
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
        p_can_write_clinical_notes => true -- Implies can_view_clinical_records = true
    );
    IF (v_res->>'can_view_clinical_records')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED D2: can_write_clinical_notes did not imply can_view_clinical_records = true.';
    END IF;


    -- =========================================================================
    -- E. OWNER DIRECT DML DENIAL PROOF (BLOCKER A)
    -- =========================================================================
    -- Owner direct INSERT denied
    BEGIN
        INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, can_manage_patient_profiles)
        VALUES (v_tenant1_id, v_staff_rec1_id, true);
        RAISE EXCEPTION 'SECURITY FAIL E1: Tenant owner direct INSERT against clinic_staff_profiles succeeded!';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Owner direct UPDATE denied
    BEGIN
        UPDATE public.clinic_staff_profiles
        SET can_write_clinical_notes = true
        WHERE staff_id = v_staff_rec1_id;
        IF FOUND THEN
            RAISE EXCEPTION 'SECURITY FAIL E2: Tenant owner direct UPDATE updated rows in clinic_staff_profiles!';
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Owner direct DELETE denied
    BEGIN
        DELETE FROM public.clinic_staff_profiles WHERE staff_id = v_staff_rec1_id;
        IF FOUND THEN
            RAISE EXCEPTION 'SECURITY FAIL E3: Tenant owner direct DELETE deleted rows from clinic_staff_profiles!';
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;


    -- =========================================================================
    -- H. RECEPTIONIST-LIKE STAFF BOUNDARY
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_rec1_id);
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
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
        RAISE EXCEPTION 'SECURITY FAIL H2: Receptionist was allowed to read clinical history!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error when receptionist read clinical history: %', SQLERRM;
        END IF;
    END;

    -- Start encounter denied
    BEGIN
        v_res := public.clinic_start_encounter(v_appt2_id, 'Checkup');
        RAISE EXCEPTION 'SECURITY FAIL H3: Receptionist was allowed to start encounter!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error when receptionist started encounter: %', SQLERRM;
        END IF;
    END;


    -- =========================================================================
    -- I & J. PRACTITIONER & ASSIGNMENT BOUNDARY
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_doc1_id);
    SET LOCAL ROLE authenticated;

    -- J. Assigned practitioner mismatch denied (v_appt2 is assigned to v_staff_rec1)
    BEGIN
        v_res := public.clinic_start_encounter(v_appt2_id, 'Wrong practitioner start');
        RAISE EXCEPTION 'SECURITY FAIL J1: Practitioner started encounter assigned to another staff member!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error on assignment mismatch: %', SQLERRM;
        END IF;
    END;

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
    -- N. NOTE IMMUTABILITY & DIRECT DML DENIAL
    -- =========================================================================
    -- N1. Direct authenticated UPDATE denied
    BEGIN
        UPDATE public.clinic_encounter_notes
        SET subjective = 'MUTATED DIRECTLY BY PRACTITIONER'
        WHERE encounter_id = v_enc1_id AND version = 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SECURITY FAIL N1: Direct UPDATE on clinical notes succeeded!';
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- N2. Direct authenticated DELETE denied
    BEGIN
        DELETE FROM public.clinic_encounter_notes
        WHERE encounter_id = v_enc1_id AND version = 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SECURITY FAIL N2: Direct DELETE on clinical notes succeeded!';
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Prove Version 1 content remained immutable
    IF (SELECT subjective FROM public.clinic_encounter_notes WHERE encounter_id = v_enc1_id AND version = 1) <> 'Patient reports rash on left forearm for 3 days.' THEN
        RAISE EXCEPTION 'SECURITY FAIL N3: Historical clinical note version 1 was mutated or deleted!';
    END IF;


    -- =========================================================================
    -- K. AUTHORIZED CROSS-TENANT PRACTITIONER BOUNDARY
    -- =========================================================================
    -- Configure Dr. Bob as a fully authorized Clinic practitioner in Tenant 2
    RESET ROLE;
    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_doc2_id,
        p_practitioner_type => 'physician',
        p_specialty => 'cardiology',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => true,
        p_can_write_clinical_notes => true
    );

    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_doc2_id); -- Tenant 2 Practitioner
    SET LOCAL ROLE authenticated;

    -- K1. Read Tenant-1 patient history denied
    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
        RAISE EXCEPTION 'SECURITY FAIL K1: Tenant 2 practitioner read Tenant 1 patient history!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%NOT_FOUND%' THEN
            RAISE EXCEPTION 'Cross-tenant patient history failed with unexpected error: %', SQLERRM;
        END IF;
    END;

    -- K2. Save note to Tenant-1 encounter denied
    BEGIN
        v_res := public.clinic_save_encounter_note(v_enc1_id, 'Hacked note', NULL, NULL, NULL, 'draft');
        RAISE EXCEPTION 'SECURITY FAIL K2: Tenant 2 practitioner saved note to Tenant 1 encounter!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' AND SQLERRM NOT LIKE '%NOT_FOUND%' THEN
            RAISE EXCEPTION 'Cross-tenant note save failed with unexpected error: %', SQLERRM;
        END IF;
    END;

    -- K3. Complete Tenant-1 encounter denied
    BEGIN
        v_res := public.clinic_complete_encounter(v_enc1_id);
        RAISE EXCEPTION 'SECURITY FAIL K3: Tenant 2 practitioner completed Tenant 1 encounter!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' AND SQLERRM NOT LIKE '%NOT_FOUND%' THEN
            RAISE EXCEPTION 'Cross-tenant encounter complete failed with unexpected error: %', SQLERRM;
        END IF;
    END;


    -- =========================================================================
    -- L. BRANCH & APPOINTMENT CONTEXT HARDENING
    -- =========================================================================
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_doc1_id);
    SET LOCAL ROLE authenticated;

    -- Attempt start encounter with invalid appointment ID
    BEGIN
        v_res := public.clinic_start_encounter('00000000-0000-0000-0000-000000000000', 'Nonexistent appt');
        RAISE EXCEPTION 'SECURITY FAIL L1: Start encounter succeeded for non-existent appointment!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%NOT_FOUND%' THEN
            RAISE EXCEPTION 'Invalid appointment start failed with unexpected error: %', SQLERRM;
        END IF;
    END;


    -- =========================================================================
    -- O. AUDIT NO CLINICAL CONTENT LEAKAGE
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
        IF v_audit_check.payload::text LIKE '%Contact dermatitis%'
           OR v_audit_check.payload::text LIKE '%hydrocortisone%'
           OR v_audit_check.payload::text LIKE '%Penicillin%'
           OR v_audit_check.payload::text LIKE '%Skin rash%'
           OR v_audit_check.payload::text LIKE '%555-9999%' THEN
            RAISE EXCEPTION 'AUDIT LEAK FAIL O2: Sensitive clinical/contact content leaked into audit payload for action %!', v_audit_check.action;
        END IF;
    END LOOP;

    RAISE NOTICE 'SUCCESS: All Expanded Clinic Domain Server Authority SQL Contract Tests Passed!';
END $$;

ROLLBACK;
