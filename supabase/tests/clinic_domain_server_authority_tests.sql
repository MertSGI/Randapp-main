-- =========================================================================
-- TRANSACTIONAL TEST SUITE: clinic_domain_server_authority_tests.sql
-- Proves Clinic Block 1 Clinical Domain Server Authority, RLS Policies & RPC Contracts
-- Target: Disposable PostgreSQL database / Supabase
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant1_id   uuid := '11111111-1111-4111-8111-111111111111';
    v_tenant2_id   uuid := '22222222-2222-4222-8222-222222222222';
    
    v_owner1_id    uuid := 'a1111111-1111-4111-8111-111111111111';
    v_rec1_id      uuid := 'a2222222-2222-4222-8222-222222222222';
    v_doc1_id      uuid := 'a3333333-3333-4333-8333-333333333333';
    v_doc2_id      uuid := 'a4444444-4444-4444-8444-444444444444';
    
    v_staff_rec1_id uuid := 'b1111111-1111-4111-8111-111111111111';
    v_staff_doc1_id uuid := 'b2222222-2222-4222-8222-222222222222';
    v_staff_doc2_id uuid := 'b3333333-3333-4333-8333-333333333333';

    v_branch1_id   uuid := 'c1111111-1111-4111-8111-111111111111';
    v_cust1_id     uuid := 'd1111111-1111-4111-8111-111111111111';
    v_cust2_id     uuid := 'd2222222-2222-4222-8222-222222222222';
    
    v_appt1_id     uuid := 'e1111111-1111-4111-8111-111111111111';
    v_appt2_id     uuid := 'e2222222-2222-4222-8222-222222222222';
    
    v_res          jsonb;
    v_pat_res      jsonb;
    v_enc1_id      uuid;
    v_note1_res    jsonb;
    v_note2_res    jsonb;
    v_history_res  jsonb;
    v_audit_count  integer;
    v_audit_check  record;
BEGIN
    RAISE NOTICE 'Starting Clinic Domain Server Authority SQL Contract Tests (Block 1)...';

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
    DELETE FROM public.users_profile WHERE id IN (v_owner1_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM auth.users WHERE id IN (v_owner1_id, v_rec1_id, v_doc1_id, v_doc2_id);
    DELETE FROM public.tenants WHERE id IN (v_tenant1_id, v_tenant2_id);

    -- 2. CREATE SEED TENANTS & AUTH USERS
    INSERT INTO public.tenants (id, slug, name, status)
    VALUES (v_tenant1_id, 'clinic-t1', 'Clinic Tenant 1', 'active'),
           (v_tenant2_id, 'clinic-t2', 'Clinic Tenant 2', 'active');

    INSERT INTO auth.users (id, email) VALUES
    (v_owner1_id, 'owner1@clinic.com'),
    (v_rec1_id, 'rec1@clinic.com'),
    (v_doc1_id, 'doc1@clinic.com'),
    (v_doc2_id, 'doc2@clinic.com');

    -- Note: DB identity roles remain super_admin, tenant_owner, staff. NO doctor/practitioner added to users_profile.
    INSERT INTO public.users_profile (id, tenant_id, role, full_name) VALUES
    (v_owner1_id, v_tenant1_id, 'tenant_owner', 'Dr. Owner'),
    (v_rec1_id, v_tenant1_id, 'staff', 'Receptionist Jane'),
    (v_doc1_id, v_tenant1_id, 'staff', 'Dr. Alice'),
    (v_doc2_id, v_tenant2_id, 'staff', 'Dr. Bob');

    -- Create public.staff linked via user_profile_id
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
    (v_staff_rec1_id, v_tenant1_id, v_rec1_id, 'Receptionist Jane', true),
    (v_staff_doc1_id, v_tenant1_id, v_doc1_id, 'Dr. Alice', true),
    (v_staff_doc2_id, v_tenant2_id, v_doc2_id, 'Dr. Bob', true);

    -- Create branches & customers
    INSERT INTO public.branches (id, tenant_id, name, is_primary) VALUES
    (v_branch1_id, v_tenant1_id, 'Main Clinic Branch', true);

    INSERT INTO public.customers (id, tenant_id, name, email, phone) VALUES
    (v_cust1_id, v_tenant1_id, 'Patient John', 'john@patient.com', '555-0101'),
    (v_cust2_id, v_tenant2_id, 'Patient Mary', 'mary@patient.com', '555-0202');

    -- Create appointment
    INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, branch_id, appointment_date, appointment_time, status) VALUES
    (v_appt1_id, v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, '2026-09-10', '10:00:00', 'confirmed'),
    (v_appt2_id, v_tenant1_id, v_cust1_id, v_staff_rec1_id, v_branch1_id, '2026-09-10', '11:00:00', 'confirmed');


    -- 3. TEST RPC: public.clinic_set_staff_profile (Tenant Owner Only)
    -- Receptionist capability setup: can_manage_patient_profiles = true
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_owner1_id);
    SET LOCAL ROLE authenticated;

    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_rec1_id,
        p_practitioner_type => 'receptionist',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => false,
        p_can_write_clinical_notes => false
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: clinic_set_staff_profile failed for receptionist.';
    END IF;

    -- Practitioner capability setup: can_write_clinical_notes = true (implies can_view_clinical_records = true)
    v_res := public.clinic_set_staff_profile(
        p_staff_id => v_staff_doc1_id,
        p_practitioner_type => 'physician',
        p_specialty => 'dermatology',
        p_can_manage_patient_profiles => true,
        p_can_view_clinical_records => false,
        p_can_write_clinical_notes => true -- Must imply can_view_clinical_records = true
    );
    IF (v_res->>'can_view_clinical_records')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: can_write_clinical_notes did not imply can_view_clinical_records = true.';
    END IF;


    -- 4. TEST RPC: public.clinic_upsert_patient_profile (Receptionist & Practitioner)
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_rec1_id);

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
        RAISE EXCEPTION 'TEST FAILED: Receptionist failed to upsert patient profile.';
    END IF;


    -- 5. TEST SECURITY: Receptionist CANNOT read/write encounters or notes
    BEGIN
        v_res := public.clinic_start_encounter(v_appt2_id, 'Checkup');
        RAISE EXCEPTION 'SECURITY FAIL: Receptionist was allowed to start encounter.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error when receptionist started encounter: %', SQLERRM;
        END IF;
    END;

    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id);
        RAISE EXCEPTION 'SECURITY FAIL: Receptionist was allowed to read patient clinical history.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error when receptionist read clinical history: %', SQLERRM;
        END IF;
    END;


    -- 6. TEST RPC: public.clinic_start_encounter (Practitioner)
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_doc1_id);

    v_res := public.clinic_start_encounter(
        p_appointment_id => v_appt1_id,
        p_reason_for_visit => 'Skin rash evaluation'
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: Practitioner failed to start encounter.';
    END IF;
    v_enc1_id := (v_res->>'encounter_id')::uuid;

    -- Duplicate encounter start MUST fail
    BEGIN
        v_res := public.clinic_start_encounter(v_appt1_id, 'Duplicate start');
        RAISE EXCEPTION 'SECURITY FAIL: Duplicate encounter start was allowed.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%ALREADY_EXISTS%' THEN
            RAISE EXCEPTION 'Unexpected error on duplicate encounter start: %', SQLERRM;
        END IF;
    END;


    -- 7. TEST RPC: public.clinic_save_encounter_note & APPEND-ONLY VERSIONING
    -- Version 1 creation
    v_note1_res := public.clinic_save_encounter_note(
        p_encounter_id => v_enc1_id,
        p_subjective => 'Patient reports rash on left forearm for 3 days.',
        p_objective => 'Erythematous plaque observed.',
        p_assessment => 'Contact dermatitis',
        p_plan => 'Topical hydrocortisone 1% BID',
        p_note_status => 'draft'
    );
    IF (v_note1_res->>'version')::integer <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Initial note version was not 1.';
    END IF;

    -- Version 2 creation (Correction / Revision)
    v_note2_res := public.clinic_save_encounter_note(
        p_encounter_id => v_enc1_id,
        p_subjective => 'Patient reports rash on left forearm for 3 days. Added mild itching.',
        p_objective => 'Erythematous plaque observed, mild scaling.',
        p_assessment => 'Contact dermatitis - mild',
        p_plan => 'Topical hydrocortisone 1% BID + oral antihistamine PRN',
        p_note_status => 'final'
    );
    IF (v_note2_res->>'version')::integer <> 2 THEN
        RAISE EXCEPTION 'TEST FAILED: Revised note version was not 2.';
    END IF;


    -- 8. TEST SECURITY: Direct UPDATE / DELETE on clinical notes MUST BE DENIED
    BEGIN
        UPDATE public.clinic_encounter_notes
        SET subjective = 'MUTATED DIRECTLY'
        WHERE encounter_id = v_enc1_id AND version = 1;

        DELETE FROM public.clinic_encounter_notes
        WHERE encounter_id = v_enc1_id AND version = 1;
    EXCEPTION WHEN OTHERS THEN
        -- RLS / REVOKE or trigger prevents mutation
        NULL;
    END;

    -- Prove Version 1 content remained untouched
    IF (SELECT subjective FROM public.clinic_encounter_notes WHERE encounter_id = v_enc1_id AND version = 1) <> 'Patient reports rash on left forearm for 3 days.' THEN
        RAISE EXCEPTION 'SECURITY FAIL: Historical clinical note version 1 was overwritten or mutated!';
    END IF;


    -- 9. TEST RPC: public.clinic_complete_encounter
    v_res := public.clinic_complete_encounter(v_enc1_id);
    IF (v_res->>'status') <> 'completed' THEN
        RAISE EXCEPTION 'TEST FAILED: clinic_complete_encounter status is not completed.';
    END IF;

    -- Core appointment status MUST NOT be altered in Block 1
    IF (SELECT status FROM public.appointments WHERE id = v_appt1_id) <> 'confirmed' THEN
        RAISE EXCEPTION 'TEST FAILED: Core appointment status was improperly mutated in Block 1.';
    END IF;


    -- 10. TEST RPC: public.clinic_get_patient_history
    v_history_res := public.clinic_get_patient_history(v_cust1_id);
    IF (v_history_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED: clinic_get_patient_history failed for practitioner.';
    END IF;
    IF jsonb_array_length(v_history_res->'encounters') <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Patient history encounter count mismatch.';
    END IF;
    IF jsonb_array_length(v_history_res->'encounters'->0->'notes') <> 2 THEN
        RAISE EXCEPTION 'TEST FAILED: Versioned notes count mismatch in patient history.';
    END IF;


    -- 11. TEST SECURITY: Cross-Tenant Access MUST Fail Closed
    EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_doc2_id); -- Tenant 2 Practitioner

    BEGIN
        v_res := public.clinic_get_patient_history(v_cust1_id); -- Tenant 1 Patient
        RAISE EXCEPTION 'SECURITY FAIL: Cross-tenant patient history read was allowed.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%NOT_FOUND%' AND SQLERRM NOT LIKE '%FORBIDDEN%' THEN
            RAISE EXCEPTION 'Unexpected error on cross-tenant history read: %', SQLERRM;
        END IF;
    END;


    -- 12. TEST AUDIT INTEGRATION & NO CLINICAL CONTENT LEAKAGE
    RESET ROLE;

    SELECT count(*) INTO v_audit_count
    FROM public.audit_events
    WHERE tenant_id = v_tenant1_id::text;

    IF v_audit_count < 5 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected at least 5 audit events, got %', v_audit_count;
    END IF;

    -- Verify audit payloads DO NOT contain clinical narrative content (SOAP, allergies, chronic conditions, etc.)
    FOR v_audit_check IN (
        SELECT action, payload FROM public.audit_events WHERE tenant_id = v_tenant1_id::text
    ) LOOP
        IF v_audit_check.payload::text LIKE '%Contact dermatitis%'
           OR v_audit_check.payload::text LIKE '%hydrocortisone%'
           OR v_audit_check.payload::text LIKE '%Penicillin%'
           OR v_audit_check.payload::text LIKE '%Skin rash%' THEN
            RAISE EXCEPTION 'AUDIT LEAK FAIL: Clinical narrative leaked into audit_events payload for action %!', v_audit_check.action;
        END IF;
    END LOOP;

    RAISE NOTICE 'SUCCESS: All Clinic Domain Server Authority SQL Contract Tests Passed!';
END $$;

ROLLBACK;
