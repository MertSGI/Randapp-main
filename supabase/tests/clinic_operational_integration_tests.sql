-- =========================================================================
-- LARİ CLINIC — BLOCK 2 OPERATIONAL INTEGRATION TEST SUITE (R2)
-- File: supabase/tests/clinic_operational_integration_tests.sql
-- Description:
--   Comprehensive verification of Block 2 operational invariants:
--   - confirmed-only start, open-encounter status guard, legacy bypass closure
--   - atomic completion with Core audit + outbox side effects
--   - idempotent completion (no duplicate outbox/audit)
--   - patient history contract projection
--   - cross-tenant boundary enforcement
--   - non-Clinic appointment compatibility
--   - clinical content leak prevention in audit/outbox
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant1_id UUID := '11111111-1111-4111-8111-111111111111';
    v_tenant2_id UUID := '22222222-2222-4222-8222-222222222222';

    v_owner1_id UUID := 'a1111111-1111-4111-8111-111111111111';
    v_owner2_id UUID := 'a2222222-2222-4222-8222-222222222222';
    v_doc1_id   UUID := 'a3333333-3333-4333-8333-333333333333';
    v_rec1_id   UUID := 'a4444444-4444-4444-8444-444444444444';
    v_no_clinic_staff_id UUID := 'a5555555-5555-4555-8555-555555555555';

    v_staff_doc1_id UUID := '31111111-1111-4111-8111-111111111111';
    v_staff_rec1_id UUID := '32222222-2222-4222-8222-222222222222';
    v_staff_no_clinic_id UUID := '33333333-3333-4333-8333-333333333333';

    v_branch1_id UUID := 'b1111111-1111-4111-8111-111111111111';
    v_branch2_id UUID := 'b2222222-2222-4222-8222-222222222222';

    v_cust1_id UUID := 'c1111111-1111-4111-8111-111111111111';
    v_cust2_id UUID := 'c2222222-2222-4222-8222-222222222222';

    v_service1_id UUID := 'e1111111-1111-4111-8111-111111111111';

    v_appt_confirmed_id UUID := 'f1111111-1111-4111-8111-111111111111';
    v_appt_pending_id   UUID := 'f2222222-2222-4222-8222-222222222222';
    v_appt_cancelled_id UUID := 'f3333333-3333-4333-8333-333333333333';
    v_appt_completed_id UUID := 'f4444444-4444-4444-8444-444444444444';
    v_appt_noshow_id    UUID := 'f5555555-5555-4555-8555-555555555555';
    v_appt_nonenc_id    UUID := 'f6666666-6666-4666-8666-666666666666';

    v_legacy_enc_id     UUID;

    v_res JSONB;
    v_enc_id UUID;
    v_audit_count INT;
    v_audit_payload JSONB;
    v_outbox_count INT;
    v_outbox_metadata JSONB;
    v_all_audit TEXT;
    v_all_outbox TEXT;
    v_legacy_res JSONB;
    v_ph_res JSONB;
BEGIN
    RAISE NOTICE 'Starting Clinic Domain Operational Integration SQL Contract Tests (Block 2 R2)...';

    -- 1. CLEANUP PRE-EXISTING FIXTURES
    DELETE FROM public.communication_outbox WHERE tenant_id IN (v_tenant1_id::text, v_tenant2_id::text);
    DELETE FROM public.audit_events WHERE tenant_id IN (v_tenant1_id::text, v_tenant2_id::text);
    DELETE FROM public.clinic_encounter_notes WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_encounters WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_patient_profiles WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.appointments WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.services WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.staff WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.customers WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.branches WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.users_profile WHERE id IN (v_owner1_id, v_owner2_id, v_doc1_id, v_rec1_id, v_no_clinic_staff_id);
    DELETE FROM auth.users WHERE id IN (v_owner1_id, v_owner2_id, v_doc1_id, v_rec1_id, v_no_clinic_staff_id);
    DELETE FROM public.subscriptions WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.tenants WHERE id IN (v_tenant1_id, v_tenant2_id);

    -- 2. CREATE SEED TENANTS, SUBSCRIPTIONS & AUTH USERS
    INSERT INTO public.tenants (id, slug, name, status)
    VALUES (v_tenant1_id, 'clinic-op-t1', 'Clinic Operational Tenant 1', 'active'),
           (v_tenant2_id, 'clinic-op-t2', 'Clinic Operational Tenant 2', 'active');

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
    VALUES (v_tenant1_id, 'max_staff', 'integer', true, NULL, 'Clinic operational test fixture'),
           (v_tenant2_id, 'max_staff', 'integer', true, NULL, 'Clinic operational test fixture');

    INSERT INTO auth.users (id, email) VALUES
    (v_owner1_id, 'owner1@opclinic.com'),
    (v_owner2_id, 'owner2@opclinic.com'),
    (v_doc1_id,   'doc1@opclinic.com'),
    (v_rec1_id,   'rec1@opclinic.com'),
    (v_no_clinic_staff_id, 'noclinic@opclinic.com');

    INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
    (v_owner1_id, v_tenant1_id, 'tenant_owner', 'Owner Alice', true),
    (v_owner2_id, v_tenant2_id, 'tenant_owner', 'Owner Bob', true),
    (v_doc1_id,   v_tenant1_id, 'staff', 'Dr. Charlie', true),
    (v_rec1_id,   v_tenant1_id, 'staff', 'Receptionist Dave', true),
    (v_no_clinic_staff_id, v_tenant1_id, 'staff', 'Generic Staff', true);

    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
    (v_staff_doc1_id, v_tenant1_id, v_doc1_id, 'Dr. Charlie', true),
    (v_staff_rec1_id, v_tenant1_id, v_rec1_id, 'Receptionist Dave', true),
    (v_staff_no_clinic_id, v_tenant1_id, v_no_clinic_staff_id, 'Generic Staff', true);

    INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, practitioner_type, specialty, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes) VALUES
    (v_tenant1_id, v_staff_doc1_id, 'physician', 'Cardiology', true, true, true),
    (v_tenant1_id, v_staff_rec1_id, NULL, NULL, true, false, false);

    INSERT INTO public.branches (id, tenant_id, name, is_primary) VALUES
    (v_branch1_id, v_tenant1_id, 'Main Clinic Branch', true),
    (v_branch2_id, v_tenant2_id, 'Tenant 2 Branch', true);

    INSERT INTO public.customers (id, tenant_id, name, email, phone) VALUES
    (v_cust1_id, v_tenant1_id, 'Patient John Doe', 'john@patient.com', '5551112233'),
    (v_cust2_id, v_tenant2_id, 'Tenant 2 Patient', 't2@patient.com', '5559998877');

    INSERT INTO public.services (id, tenant_id, name, duration, price) VALUES
    (v_service1_id, v_tenant1_id, 'Cardiology Consultation', 45, 100);

    -- Seed patient profile for history contract test
    INSERT INTO public.clinic_patient_profiles (tenant_id, customer_id, date_of_birth, sex_at_birth, blood_type, allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, created_by, updated_by, created_at, updated_at)
    VALUES (v_tenant1_id, v_cust1_id, '1985-03-15', 'male', 'A+', 'Penicillin', 'Hypertension', 'Jane Doe', '5551119999', 'Spouse', v_doc1_id, v_doc1_id, now(), now());

    -- Seed Appointments in various statuses
    INSERT INTO public.appointments (id, tenant_id, customer_id, staff_id, branch_id, service_id, appointment_date, appointment_time, status, phone, user_email) VALUES
    (v_appt_confirmed_id, v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-15', '09:00:00', 'confirmed', '5551112233', 'john@patient.com'),
    (v_appt_pending_id,   v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-15', '10:00:00', 'pending', NULL, NULL),
    (v_appt_cancelled_id, v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-15', '11:00:00', 'cancelled', NULL, NULL),
    (v_appt_completed_id, v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-15', '12:00:00', 'completed', NULL, NULL),
    (v_appt_noshow_id,    v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-15', '13:00:00', 'no_show', NULL, NULL),
    (v_appt_nonenc_id,    v_tenant1_id, v_cust1_id, v_staff_doc1_id, v_branch1_id, v_service1_id, '2026-09-16', '09:00:00', 'confirmed', '5551112233', 'john@patient.com');

    -- =========================================================================
    -- TEST 1: clinic_get_my_context returns active Clinic identity
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_doc1_id::text);
    v_res := public.clinic_get_my_context();
    ASSERT (v_res->>'success')::boolean = true, 'Test 1 Failed: clinic_get_my_context failed for active practitioner';
    ASSERT v_res->>'staff_id' = v_staff_doc1_id::text, 'Test 1 Failed: Incorrect staff_id in context';
    ASSERT (v_res->>'can_write_clinical_notes')::boolean = true, 'Test 1 Failed: Incorrect write capability';
    RAISE NOTICE 'CHECKPOINT 1 PASS: clinic_get_my_context returns active Clinic identity';

    -- =========================================================================
    -- TEST 2: non-Clinic staff cannot obtain Clinic context
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_no_clinic_staff_id::text);
    v_res := public.clinic_get_my_context();
    ASSERT (v_res->>'success')::boolean = false, 'Test 2 Failed: Non-clinic staff obtained clinic context';
    ASSERT v_res->>'reason_code' = 'no_clinic_profile', 'Test 2 Failed: Expected no_clinic_profile reason code';
    RAISE NOTICE 'CHECKPOINT 2 PASS: non-Clinic staff cannot obtain Clinic context';

    -- =========================================================================
    -- TEST 3: cross-tenant context fails closed
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_owner2_id::text);
    v_res := public.clinic_get_my_context();
    ASSERT (v_res->>'success')::boolean = false, 'Test 3 Failed: Tenant 2 owner obtained clinic context';
    RAISE NOTICE 'CHECKPOINT 3 PASS: cross-tenant context fails closed';

    -- =========================================================================
    -- TEST 4: receptionist can obtain operational context
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_rec1_id::text);
    v_res := public.clinic_get_my_context();
    ASSERT (v_res->>'success')::boolean = true, 'Test 4 Failed: Receptionist failed to get operational context';
    ASSERT (v_res->>'can_manage_patient_profiles')::boolean = true, 'Test 4 Failed: Receptionist can_manage_patient_profiles should be true';
    ASSERT (v_res->>'can_write_clinical_notes')::boolean = false, 'Test 4 Failed: Receptionist can_write_clinical_notes should be false';
    RAISE NOTICE 'CHECKPOINT 4 PASS: receptionist can obtain operational context';

    -- =========================================================================
    -- TEST 5 & 6: receptionist can see operational day metadata, NO clinical narrative
    -- =========================================================================
    v_res := public.clinic_get_operational_day('2026-09-15'::date, v_branch1_id);
    ASSERT (v_res->>'success')::boolean = true, 'Test 5 Failed: Receptionist operational day fetch failed';
    ASSERT jsonb_array_length(v_res->'appointments') = 5, 'Test 5 Failed: Expected 5 operational appointments';
    ASSERT NOT (v_res::text LIKE '%subjective%' OR v_res::text LIKE '%assessment%' OR v_res::text LIKE '%allergies%'), 'Test 6 Failed: Operational day returned clinical narrative fields!';
    RAISE NOTICE 'CHECKPOINT 5 & 6 PASS: receptionist can see operational day metadata with ZERO clinical narrative';

    -- =========================================================================
    -- TEST 7 & 8: branch filter remains tenant-scoped, cross-tenant branch denied
    -- =========================================================================
    BEGIN
        v_res := public.clinic_get_operational_day('2026-09-15'::date, v_branch2_id);
        RAISE EXCEPTION 'Test 8 Failed: Cross-tenant branch filter did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%FORBIDDEN%', 'Test 8 Failed: Expected FORBIDDEN on cross-tenant branch filter';
    END;
    RAISE NOTICE 'CHECKPOINT 7 & 8 PASS: branch filter is tenant-scoped and cross-tenant branch is denied';

    -- =========================================================================
    -- TEST 9: confirmed appointment encounter start succeeds
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_doc1_id::text);
    v_res := public.clinic_start_encounter(v_appt_confirmed_id, 'Routine Cardiology Check');
    ASSERT (v_res->>'success')::boolean = true, 'Test 9 Failed: Starting encounter for confirmed appointment failed';
    v_enc_id := (v_res->>'encounter_id')::uuid;
    RAISE NOTICE 'CHECKPOINT 9 PASS: confirmed appointment encounter start succeeds';

    -- =========================================================================
    -- TEST 10-13: pending, cancelled, completed, no_show appointment start denied
    -- =========================================================================
    BEGIN
        PERFORM public.clinic_start_encounter(v_appt_pending_id, 'Invalid start');
        RAISE EXCEPTION 'Test 10 Failed: Pending appointment start did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%APPOINTMENT_NOT_CONFIRMED%', 'Test 10 Failed: Expected APPOINTMENT_NOT_CONFIRMED error';
    END;

    BEGIN
        PERFORM public.clinic_start_encounter(v_appt_cancelled_id, 'Invalid start');
        RAISE EXCEPTION 'Test 11 Failed: Cancelled appointment start did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%APPOINTMENT_NOT_CONFIRMED%', 'Test 11 Failed: Expected APPOINTMENT_NOT_CONFIRMED error';
    END;

    BEGIN
        PERFORM public.clinic_start_encounter(v_appt_completed_id, 'Invalid start');
        RAISE EXCEPTION 'Test 12 Failed: Completed appointment start did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%APPOINTMENT_NOT_CONFIRMED%', 'Test 12 Failed: Expected APPOINTMENT_NOT_CONFIRMED error';
    END;

    BEGIN
        PERFORM public.clinic_start_encounter(v_appt_noshow_id, 'Invalid start');
        RAISE EXCEPTION 'Test 13 Failed: No-show appointment start did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%APPOINTMENT_NOT_CONFIRMED%', 'Test 13 Failed: Expected APPOINTMENT_NOT_CONFIRMED error';
    END;
    RAISE NOTICE 'CHECKPOINT 10-13 PASS: non-confirmed appointment encounter start strictly denied';

    -- =========================================================================
    -- TEST: OPEN ENCOUNTER APPOINTMENT STATUS GUARD
    -- While an open encounter exists, generic appointment status mutations MUST fail
    -- =========================================================================
    -- Try cancelling the appointment that has an open encounter
    BEGIN
        UPDATE public.appointments SET status = 'cancelled' WHERE id = v_appt_confirmed_id;
        RAISE EXCEPTION 'GUARD FAIL: Cancellation succeeded while encounter is open!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%INVARIANT_VIOLATION%', 'GUARD FAIL: Expected INVARIANT_VIOLATION on cancel with open encounter';
    END;

    -- Verify encounter and appointment remain unchanged after failed cancellation
    ASSERT (SELECT status FROM public.clinic_encounters WHERE id = v_enc_id) = 'open', 'GUARD FAIL: Encounter status changed after failed cancel';
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_confirmed_id) = 'confirmed', 'GUARD FAIL: Appointment status changed after failed cancel';

    -- Try no_show
    BEGIN
        UPDATE public.appointments SET status = 'no_show' WHERE id = v_appt_confirmed_id;
        RAISE EXCEPTION 'GUARD FAIL: No-show succeeded while encounter is open!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%INVARIANT_VIOLATION%', 'GUARD FAIL: Expected INVARIANT_VIOLATION on no_show with open encounter';
    END;

    ASSERT (SELECT status FROM public.clinic_encounters WHERE id = v_enc_id) = 'open', 'GUARD FAIL: Encounter status changed after failed no_show';
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_confirmed_id) = 'confirmed', 'GUARD FAIL: Appointment status changed after failed no_show';

    -- Try completed outside Clinic atomic path
    BEGIN
        UPDATE public.appointments SET status = 'completed' WHERE id = v_appt_confirmed_id;
        RAISE EXCEPTION 'GUARD FAIL: Direct completion succeeded while encounter is open!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%INVARIANT_VIOLATION%', 'GUARD FAIL: Expected INVARIANT_VIOLATION on direct completion with open encounter';
    END;

    ASSERT (SELECT status FROM public.clinic_encounters WHERE id = v_enc_id) = 'open', 'GUARD FAIL: Encounter status changed after failed direct complete';
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_confirmed_id) = 'confirmed', 'GUARD FAIL: Appointment status changed after failed direct complete';

    RAISE NOTICE 'CHECKPOINT GUARD PASS: open encounter appointment status guard proven for cancel, no_show, and direct completion';

    -- =========================================================================
    -- TEST 14: assigned-practitioner boundary preserved
    -- =========================================================================
    -- Save a note first as assigned practitioner
    PERFORM public.clinic_save_encounter_note(v_enc_id, 'S: Chest pain', 'O: BP 120/80', 'A: Stable', 'P: Followup');

    -- Switch actor to Receptionist to test unauthorized completion
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_rec1_id::text);
    BEGIN
        PERFORM public.clinic_complete_encounter_and_appointment(v_enc_id);
        RAISE EXCEPTION 'Test 18 Failed: Receptionist completion did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%FORBIDDEN%', 'Test 18 Failed: Expected FORBIDDEN for receptionist completion';
    END;

    -- Switch actor to Tenant 2 Owner to test cross-tenant completion
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_owner2_id::text);
    BEGIN
        PERFORM public.clinic_complete_encounter_and_appointment(v_enc_id);
        RAISE EXCEPTION 'Test 19 Failed: Cross-tenant completion did not raise EXCEPTION!';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM LIKE '%FORBIDDEN%', 'Test 19 Failed: Expected FORBIDDEN for cross-tenant completion';
    END;
    RAISE NOTICE 'CHECKPOINT 14 & 18 & 19 PASS: assigned practitioner boundary and role permissions enforced';

    -- =========================================================================
    -- TEST 15: atomic completion with Core side effects
    -- =========================================================================
    EXECUTE 'SET LOCAL request.jwt.claim.sub = ' || quote_literal(v_doc1_id::text);
    -- Clear any pre-existing audit/outbox rows for clean count
    DELETE FROM public.audit_events WHERE resource_id = v_enc_id::text AND action = 'clinic_encounter_completed';
    DELETE FROM public.audit_events WHERE resource_id = v_appt_confirmed_id::text AND action = 'admin_status_completed';
    DELETE FROM public.communication_outbox WHERE (metadata->>'appointment_id') = v_appt_confirmed_id::text;

    v_res := public.clinic_complete_encounter_and_appointment(v_enc_id);
    ASSERT (v_res->>'success')::boolean = true, 'Test 15 Failed: Atomic completion call failed';
    ASSERT v_res->>'encounter_status' = 'completed', 'Test 15 Failed: Encounter status not completed';
    ASSERT v_res->>'appointment_status' = 'completed', 'Test 15 Failed: Appointment status not completed';

    -- Verify DB state directly
    ASSERT (SELECT status FROM public.clinic_encounters WHERE id = v_enc_id) = 'completed', 'Test 15 Failed: DB encounter status is not completed';
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_confirmed_id) = 'completed', 'Test 15 Failed: DB appointment status is not completed';

    -- Verify exactly one Clinic completion audit event
    SELECT count(*) INTO v_audit_count FROM public.audit_events WHERE action = 'clinic_encounter_completed' AND resource_id = v_enc_id::text;
    ASSERT v_audit_count = 1, 'Test 15 Failed: Expected exactly 1 clinic_encounter_completed audit event, got ' || v_audit_count;

    -- Verify exactly one appointment transition audit event
    SELECT count(*) INTO v_audit_count FROM public.audit_events WHERE action = 'admin_status_completed' AND resource_id = v_appt_confirmed_id::text;
    ASSERT v_audit_count = 1, 'Test 15 Failed: Expected exactly 1 admin_status_completed audit event, got ' || v_audit_count;

    -- Verify exactly one communication_outbox event
    SELECT count(*) INTO v_outbox_count FROM public.communication_outbox
    WHERE (metadata->>'appointment_id') = v_appt_confirmed_id::text
      AND (metadata->>'event_type') = 'appointment_completed';
    ASSERT v_outbox_count = 1, 'Test 15 Failed: Expected exactly 1 appointment_completed outbox event, got ' || COALESCE(v_outbox_count::text, '0');

    RAISE NOTICE 'CHECKPOINT 15 PASS: atomic completion proven with Core audit + outbox side effects';

    -- =========================================================================
    -- TEST 16: duplicate completion is deterministic / idempotent (no second outbox)
    -- =========================================================================
    v_res := public.clinic_complete_encounter_and_appointment(v_enc_id);
    ASSERT (v_res->>'success')::boolean = true, 'Test 16 Failed: Duplicate completion failed';
    ASSERT v_res->>'reason_code' = 'already_completed', 'Test 16 Failed: Expected already_completed reason code';

    -- Verify NO second outbox row
    SELECT count(*) INTO v_outbox_count FROM public.communication_outbox
    WHERE (metadata->>'appointment_id') = v_appt_confirmed_id::text
      AND (metadata->>'event_type') = 'appointment_completed';
    ASSERT v_outbox_count = 1, 'Test 16 Failed: Duplicate completion created extra outbox row! Got ' || v_outbox_count;

    -- Verify NO duplicate completion audit event
    SELECT count(*) INTO v_audit_count FROM public.audit_events WHERE action = 'clinic_encounter_completed' AND resource_id = v_enc_id::text;
    ASSERT v_audit_count = 1, 'Test 16 Failed: Duplicate completion created extra audit event! Got ' || v_audit_count;

    RAISE NOTICE 'CHECKPOINT 16 PASS: duplicate completion is idempotent with exactly-once outbox and audit';

    -- =========================================================================
    -- TEST: LEGACY clinic_complete_encounter wrapper
    -- =========================================================================
    -- Create a new encounter for testing legacy wrapper
    UPDATE public.appointments SET status = 'confirmed' WHERE id = v_appt_nonenc_id;
    v_res := public.clinic_start_encounter(v_appt_nonenc_id, 'Legacy test');
    ASSERT (v_res->>'success')::boolean = true, 'Legacy Wrapper Test: Failed to start encounter for legacy test';
    v_legacy_enc_id := (v_res->>'encounter_id')::uuid;

    -- Clear outbox for clean count
    DELETE FROM public.communication_outbox WHERE (metadata->>'appointment_id') = v_appt_nonenc_id::text;

    v_legacy_res := public.clinic_complete_encounter(v_legacy_enc_id);
    ASSERT (v_legacy_res->>'success')::boolean = true, 'Legacy Wrapper Test: Legacy completion failed';

        -- Legacy wrapper MUST have completed BOTH encounter AND appointment atomically
        ASSERT (SELECT status FROM public.clinic_encounters WHERE id = v_legacy_enc_id) = 'completed', 'Legacy Wrapper Test: Encounter not completed by legacy wrapper';
        ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_nonenc_id) = 'completed', 'Legacy Wrapper Test: Appointment not completed by legacy wrapper (BYPASS STILL OPEN!)';

        RAISE NOTICE 'CHECKPOINT LEGACY PASS: legacy clinic_complete_encounter wrapper delegates to atomic path, no split state';

    -- =========================================================================
    -- TEST: NON-CLINIC APPOINTMENT CORE STATUS MUTATION COMPATIBILITY
    -- =========================================================================
    -- The appointment without any Clinic encounter should be mutable normally
    -- (v_appt_pending_id has no encounter)
    UPDATE public.appointments SET status = 'confirmed' WHERE id = v_appt_pending_id;
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_pending_id) = 'confirmed', 'Non-Clinic Test: Cannot confirm non-clinic appointment';
    UPDATE public.appointments SET status = 'cancelled' WHERE id = v_appt_pending_id;
    ASSERT (SELECT status FROM public.appointments WHERE id = v_appt_pending_id) = 'cancelled', 'Non-Clinic Test: Cannot cancel non-clinic appointment';
    RAISE NOTICE 'CHECKPOINT NON-CLINIC PASS: non-Clinic appointment Core status mutation remains compatible';

    -- =========================================================================
    -- TEST: PATIENT HISTORY CONTRACT PROJECTION
    -- =========================================================================
    v_ph_res := public.clinic_get_patient_history(v_cust1_id);
    ASSERT (v_ph_res->>'success')::boolean = true, 'Patient History Test: Failed to fetch patient history';
    ASSERT v_ph_res->'patient_profile' IS NOT NULL, 'Patient History Test: patient_profile is null';
    -- Verify exact RPC projection fields exist
    ASSERT v_ph_res->'patient_profile'->>'id' IS NOT NULL, 'Patient History Test: Missing id in profile projection';
    ASSERT v_ph_res->'patient_profile'->>'date_of_birth' IS NOT NULL, 'Patient History Test: Missing date_of_birth';
    ASSERT v_ph_res->'patient_profile'->>'blood_type' IS NOT NULL, 'Patient History Test: Missing blood_type';
    ASSERT v_ph_res->'patient_profile'->>'updated_at' IS NOT NULL, 'Patient History Test: Missing updated_at';
    -- Verify fields NOT in projection are absent
    ASSERT v_ph_res->'patient_profile'->>'tenant_id' IS NULL, 'Patient History Test: tenant_id should NOT be in history projection!';
    ASSERT v_ph_res->'patient_profile'->>'customer_id' IS NULL, 'Patient History Test: customer_id should NOT be in history projection!';
    ASSERT v_ph_res->'patient_profile'->>'created_at' IS NULL, 'Patient History Test: created_at should NOT be in history projection!';
    RAISE NOTICE 'CHECKPOINT PATIENT HISTORY PASS: patient history profile projection matches exact RPC output contract';

    -- =========================================================================
    -- TEST 21: audit + outbox content MUST NOT contain clinical narrative
    -- =========================================================================
    SELECT string_agg(payload::text, ' ') INTO v_all_audit
    FROM public.audit_events WHERE tenant_id = v_tenant1_id::text;

    v_all_audit := COALESCE(v_all_audit, '');

    ASSERT NOT (v_all_audit LIKE '%Chest pain%'), 'Test 21 Failed: Audit leaked subjective narrative!';
    ASSERT NOT (v_all_audit LIKE '%BP 120/80%'), 'Test 21 Failed: Audit leaked objective narrative!';
    ASSERT NOT (v_all_audit LIKE '%Stable%'), 'Test 21 Failed: Audit leaked assessment narrative!';
    ASSERT NOT (v_all_audit LIKE '%Followup%'), 'Test 21 Failed: Audit leaked plan narrative!';
    ASSERT NOT (v_all_audit LIKE '%Penicillin%'), 'Test 21 Failed: Audit leaked allergies!';
    ASSERT NOT (v_all_audit LIKE '%Hypertension%'), 'Test 21 Failed: Audit leaked chronic conditions!';
    ASSERT NOT (v_all_audit LIKE '%reason_for_visit%'), 'Test 21 Failed: Audit leaked reason_for_visit!';
    ASSERT NOT (v_all_audit LIKE '%Jane Doe%'), 'Test 21 Failed: Audit leaked emergency contact!';

    SELECT string_agg(metadata::text || ' ' || message, ' ') INTO v_all_outbox
    FROM public.communication_outbox WHERE tenant_id = v_tenant1_id::text;

    v_all_outbox := COALESCE(v_all_outbox, '');

    ASSERT NOT (v_all_outbox LIKE '%Chest pain%'), 'Test 21 Failed: Outbox leaked subjective!';
    ASSERT NOT (v_all_outbox LIKE '%BP 120/80%'), 'Test 21 Failed: Outbox leaked objective!';
    ASSERT NOT (v_all_outbox LIKE '%Penicillin%'), 'Test 21 Failed: Outbox leaked allergies!';
    ASSERT NOT (v_all_outbox LIKE '%Hypertension%'), 'Test 21 Failed: Outbox leaked chronic conditions!';
    ASSERT NOT (v_all_outbox LIKE '%Jane Doe%'), 'Test 21 Failed: Outbox leaked emergency contact!';

    RAISE NOTICE 'CHECKPOINT 21 PASS: audit + outbox contain metadata only, ZERO clinical content';

    -- Emit required execution verification markers
    RAISE NOTICE 'CLINIC_BLOCK2_SQL_DB_EXECUTION=PASS';
    RAISE NOTICE 'CLINIC_CONFIRMED_ONLY_START_PROVEN=YES';
    RAISE NOTICE 'CLINIC_OPEN_ENCOUNTER_STATUS_GUARD_PROVEN=YES';
    RAISE NOTICE 'CLINIC_LEGACY_COMPLETION_BYPASS_CLOSED=YES';
    RAISE NOTICE 'CLINIC_ATOMIC_COMPLETION_PROVEN=YES';
    RAISE NOTICE 'CLINIC_CORE_COMPLETION_SIDE_EFFECTS_PROVEN=YES';
    RAISE NOTICE 'CLINIC_IDEMPOTENT_COMPLETION_PROVEN=YES';
    RAISE NOTICE 'CLINIC_PATIENT_HISTORY_CONTRACT_PROVEN=YES';
    RAISE NOTICE 'CLINIC_CROSS_TENANT_BOUNDARY_PROVEN=YES';

    RAISE NOTICE 'SUCCESS: All Clinic Domain Operational Integration SQL Contract Tests Passed (Block 2 R2)!';
END;
$$;

ROLLBACK;
