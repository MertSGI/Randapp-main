-- =========================================================================
-- Ported from 72911e4: 20260906_lari_clinic_operational_integration.sql
-- Conflict-free sequential prefix: 20260929 (ADIM-036 / Faz E1)
-- Description:
-- 1. Upgrade public.clinic_start_encounter with FOR UPDATE row lock + confirmed-only
-- 2. Open-encounter appointment status guard trigger
-- 3. Atomic encounter + appointment completion RPC with FOR UPDATE, audit, outbox
-- 4. Legacy clinic_complete_encounter wrapper closure
-- 5. Clinic context and operational day RPCs
-- =========================================================================

-- =========================================================================
-- 1. UPGRADE PUBLIC.CLINIC_START_ENCOUNTER (FOR UPDATE + CONFIRMED-ONLY)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.clinic_start_encounter(
    p_appointment_id UUID,
    p_reason_for_visit TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_vert_ctx JSONB;
    v_appointment RECORD;
    v_existing_encounter RECORD;
    v_encounter RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_appointment_id::text, 0));

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Practitioner lacks can_write_clinical_notes capability.';
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_staff.tenant_id);
    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Clinic workspace vertical is not currently eligible or enabled (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    SELECT * INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Appointment not found.';
    END IF;

    IF v_appointment.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant mismatch on appointment.';
    END IF;

    IF v_appointment.staff_id <> v_staff.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the practitioner assigned to the appointment can start the encounter.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        WHERE sb.tenant_id = v_staff.tenant_id
          AND sb.staff_id = v_staff.id
          AND sb.branch_id = v_appointment.branch_id
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller staff is not currently assigned to the appointment branch.';
    END IF;

    IF v_appointment.customer_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATE: Appointment has no registered customer.';
    END IF;

    IF v_appointment.status <> 'confirmed' THEN
        RAISE EXCEPTION 'INVALID_STATE: APPOINTMENT_NOT_CONFIRMED: Only confirmed appointments can be started (current status: %).', v_appointment.status;
    END IF;

    SELECT * INTO v_existing_encounter
    FROM public.clinic_encounters
    WHERE appointment_id = p_appointment_id;

    IF v_existing_encounter.id IS NOT NULL THEN
        RAISE EXCEPTION 'ALREADY_EXISTS: An encounter already exists for this appointment.';
    END IF;

    INSERT INTO public.clinic_encounters (
        tenant_id,
        appointment_id,
        customer_id,
        practitioner_staff_id,
        branch_id,
        status,
        reason_for_visit,
        started_at,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        p_appointment_id,
        v_appointment.customer_id,
        v_staff.id,
        v_appointment.branch_id,
        'open',
        p_reason_for_visit,
        now(),
        v_caller_uid,
        now(),
        now()
    )
    RETURNING * INTO v_encounter;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'clinic_encounter_started',
        'clinic_encounters',
        v_encounter.id::text,
        jsonb_build_object(
            'encounter_id', v_encounter.id,
            'appointment_id', p_appointment_id,
            'customer_id', v_appointment.customer_id,
            'practitioner_staff_id', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'encounter_id', v_encounter.id,
        'status', v_encounter.status,
        'started_at', v_encounter.started_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_start_encounter(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_start_encounter(UUID, TEXT) TO authenticated;


-- =========================================================================
-- 2. OPEN-ENCOUNTER APPOINTMENT STATUS GUARD TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_clinic_open_encounter_appointment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF EXISTS (
            SELECT 1 FROM public.clinic_encounters
            WHERE appointment_id = NEW.id
              AND status = 'open'
        ) THEN
            RAISE EXCEPTION 'INVARIANT_VIOLATION: Cannot change appointment status while a clinic encounter is open for this appointment.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clinic_open_encounter_appointment_status ON public.appointments;
CREATE TRIGGER trg_enforce_clinic_open_encounter_appointment_status
    BEFORE UPDATE OF status ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_clinic_open_encounter_appointment_status();


-- =========================================================================
-- 3. ATOMIC ENCOUNTER + APPOINTMENT COMPLETION RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.clinic_complete_encounter_and_appointment(
    p_encounter_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_vert_ctx JSONB;
    v_encounter RECORD;
    v_appointment RECORD;
    v_now TIMESTAMPTZ := now();
    v_outbox_exists BOOLEAN;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_encounter_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATE: Encounter ID must be provided.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_encounter_id::text, 0));

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Practitioner lacks can_write_clinical_notes capability.';
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_staff.tenant_id);
    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Clinic workspace vertical is not currently eligible or enabled (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    SELECT * INTO v_encounter
    FROM public.clinic_encounters
    WHERE id = p_encounter_id;

    IF v_encounter.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Encounter not found.';
    END IF;

    IF v_encounter.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Tenant mismatch on encounter.';
    END IF;

    IF v_encounter.practitioner_staff_id <> v_staff.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the assigned practitioner can complete the encounter.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        WHERE sb.tenant_id = v_staff.tenant_id
          AND sb.staff_id = v_staff.id
          AND sb.branch_id = v_encounter.branch_id
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller staff is not currently assigned to the encounter branch.';
    END IF;

    SELECT * INTO v_appointment
    FROM public.appointments
    WHERE id = v_encounter.appointment_id
    FOR UPDATE;

    IF v_appointment.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Linked appointment not found.';
    END IF;

    IF v_encounter.status = 'completed' AND v_appointment.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'already_completed',
            'encounter_id', v_encounter.id,
            'encounter_status', 'completed',
            'appointment_status', 'completed',
            'completed_at', v_encounter.completed_at
        );
    END IF;

    IF v_encounter.status = 'completed' AND v_appointment.status <> 'completed' THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Encounter is completed but linked appointment status is %.', v_appointment.status;
    END IF;

    IF v_encounter.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Encounter status is %, expected open.', v_encounter.status;
    END IF;

    IF v_appointment.status <> 'confirmed' THEN
        RAISE EXCEPTION 'INVALID_STATE: Linked appointment status is %, expected confirmed.', v_appointment.status;
    END IF;

    UPDATE public.clinic_encounters
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_encounter.id;

    UPDATE public.appointments
    SET status = 'completed',
        updated_at = v_now
    WHERE id = v_appointment.id;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'clinic_encounter_completed',
        'clinic_encounters',
        v_encounter.id::text,
        jsonb_build_object(
            'encounter_id', v_encounter.id,
            'appointment_id', v_appointment.id,
            'customer_id', v_encounter.customer_id,
            'practitioner_staff_id', v_staff.id,
            'completed_at', v_now
        )
    );

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'admin_status_completed',
        'appointment',
        v_appointment.id::text,
        jsonb_build_object(
            'previous_status', 'confirmed',
            'new_status', 'completed',
            'reason', 'clinic_atomic_completion',
            'actor_name', v_staff.name
        )
    );

    SELECT EXISTS (
        SELECT 1 FROM public.communication_outbox
        WHERE tenant_id = v_staff.tenant_id::text
          AND (metadata->>'appointment_id') = v_appointment.id::text
          AND (metadata->>'event_type') = 'appointment_completed'
    ) INTO v_outbox_exists;

    IF NOT v_outbox_exists THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata
        ) VALUES (
            v_staff.tenant_id::text,
            COALESCE(v_appointment.phone, v_appointment.user_email, v_appointment.id::text),
            'whatsapp',
            'Randevunuz tamamlandı.',
            'queued',
            jsonb_build_object(
                'event_type', 'appointment_completed',
                'appointment_id', v_appointment.id::text,
                'previous_status', 'confirmed',
                'target_status', 'completed',
                'no_real_send', true
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'encounter_id', v_encounter.id,
        'encounter_status', 'completed',
        'appointment_status', 'completed',
        'completed_at', v_now
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_complete_encounter_and_appointment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_complete_encounter_and_appointment(UUID) TO authenticated;


-- =========================================================================
-- 4. LEGACY CLINIC_COMPLETE_ENCOUNTER WRAPPER CLOSURE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.clinic_complete_encounter(
    p_encounter_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_atomic_result JSONB;
BEGIN
    v_atomic_result := public.clinic_complete_encounter_and_appointment(p_encounter_id);

    IF (v_atomic_result->>'success')::boolean = true THEN
        RETURN jsonb_build_object(
            'success', true,
            'encounter_id', v_atomic_result->>'encounter_id',
            'status', v_atomic_result->>'encounter_status',
            'completed_at', v_atomic_result->>'completed_at'
        );
    ELSE
        RETURN v_atomic_result;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_complete_encounter(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_complete_encounter(UUID) TO authenticated;


-- =========================================================================
-- 5. CLINIC CURRENT USER CONTEXT RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.clinic_get_my_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_branches JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'unauthenticated'
        );
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'not_clinic_staff'
        );
    END IF;

    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'no_clinic_profile'
        );
    END IF;

    SELECT jsonb_agg(b.id) INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_staff.tenant_id
      AND b.is_active IS NOT FALSE;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_staff.tenant_id,
        'staff_id', v_staff.id,
        'staff_name', v_staff.name,
        'practitioner_type', v_csp.practitioner_type,
        'specialty', v_csp.specialty,
        'can_manage_patient_profiles', v_csp.can_manage_patient_profiles,
        'can_view_clinical_records', v_csp.can_view_clinical_records,
        'can_write_clinical_notes', v_csp.can_write_clinical_notes,
        'permitted_branch_ids', COALESCE(v_branches, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_get_my_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_get_my_context() TO authenticated;


-- =========================================================================
-- 6. CLINIC OPERATIONAL DAY READ MODEL RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.clinic_get_operational_day(
    p_date DATE,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_csp RECORD;
    v_appts JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_date IS NULL THEN
        RAISE EXCEPTION 'INVALID_STATE: Date parameter is required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active clinic staff profile.';
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.branches b
            JOIN public.staff_branches sb
              ON sb.branch_id = b.id
             AND sb.tenant_id = v_staff.tenant_id
            WHERE b.id = p_branch_id
              AND b.tenant_id = v_staff.tenant_id
              AND sb.staff_id = v_staff.id
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Branch not found, cross-tenant, or not assigned to caller staff_branches.';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'appointment_id', a.id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', COALESCE(srv.duration, 30),
            'appointment_status', a.status,
            'branch_id', a.branch_id,
            'branch_name', b.name,
            'staff_id', a.staff_id,
            'staff_name', st.name,
            'practitioner_type', csp.practitioner_type,
            'specialty', csp.specialty,
            'service_id', a.service_id,
            'service_name', srv.name,
            'customer_id', a.customer_id,
            'customer_name', c.name,
            'customer_phone', c.phone,
            'encounter_id', e.id,
            'encounter_status', e.status,
            'encounter_started_at', e.started_at,
            'encounter_completed_at', e.completed_at
        ) ORDER BY a.appointment_time ASC
    ), '[]'::jsonb) INTO v_appts
    FROM public.appointments a
    LEFT JOIN public.branches b ON b.id = a.branch_id
    LEFT JOIN public.staff st ON st.id = a.staff_id
    LEFT JOIN public.clinic_staff_profiles csp ON csp.staff_id = st.id
    LEFT JOIN public.services srv ON srv.id = a.service_id
    LEFT JOIN public.customers c ON c.id = a.customer_id
    LEFT JOIN public.clinic_encounters e ON e.appointment_id = a.id
    WHERE a.tenant_id = v_staff.tenant_id
      AND a.appointment_date = p_date
      AND EXISTS (
          SELECT 1
          FROM public.staff_branches sb
          WHERE sb.tenant_id = v_staff.tenant_id
            AND sb.staff_id = v_staff.id
            AND sb.branch_id = a.branch_id
      )
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'date', p_date,
        'branch_id', p_branch_id,
        'appointments', v_appts
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_get_operational_day(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_get_operational_day(DATE, UUID) TO authenticated;
