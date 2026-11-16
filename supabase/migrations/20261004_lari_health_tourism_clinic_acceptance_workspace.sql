-- =========================================================================
-- Ported from 72911e4: 20260913_lari_health_tourism_clinic_acceptance_workspace.sql
-- Conflict-free sequential prefix: 20261004 (ADIM-036 / Faz E1)
-- Description: Clinic Acceptance Workspace Read Support (Options & Slots)
-- =========================================================================

-- 1. RPC: ht_get_clinic_acceptance_options
CREATE OR REPLACE FUNCTION public.ht_get_clinic_acceptance_options(
    p_lead_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_service_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_lead RECORD;
    v_caller_staff RECORD;
    v_csp RECORD;
    v_vert_ctx JSONB;
    v_branches JSONB;
    v_services JSONB;
    v_practitioners JSONB;
    v_branch_permitted BOOLEAN;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.status <> 'handoff_pending' OR v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.';
    END IF;

    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.tenant_id = v_lead.tenant_id
      AND s.active = true;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
    END IF;

    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_caller_staff.id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.branches b
            JOIN public.staff_branches sb ON sb.branch_id = b.id
            WHERE b.id = p_branch_id
              AND b.tenant_id = v_lead.tenant_id
              AND b.is_active = true
              AND sb.staff_id = v_caller_staff.id
        ) INTO v_branch_permitted;

        IF NOT v_branch_permitted THEN
            RAISE EXCEPTION 'FORBIDDEN: Caller is not permitted for the requested branch.';
        END IF;
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_lead.tenant_id);
    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'health_tourism_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Both Clinic and Health Tourism verticals must be eligible and enabled (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name
        ) ORDER BY b.name
    ) INTO v_branches
    FROM public.branches b
    JOIN public.staff_branches sb ON sb.branch_id = b.id
    WHERE b.tenant_id = v_lead.tenant_id
      AND b.is_active = true
      AND sb.staff_id = v_caller_staff.id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'duration_minutes', COALESCE(s.duration, 30)
        ) ORDER BY s.name
    ) INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_lead.tenant_id
      AND s.active = true
      AND EXISTS (
        SELECT 1 FROM public.service_branches sb
        WHERE sb.service_id = s.id
          AND (
            (p_branch_id IS NOT NULL AND sb.branch_id = p_branch_id)
            OR
            (p_branch_id IS NULL AND EXISTS (
                SELECT 1 FROM public.staff_branches caller_sb
                WHERE caller_sb.branch_id = sb.branch_id
                  AND caller_sb.staff_id = v_caller_staff.id
            ))
          )
      );

    SELECT jsonb_agg(
        jsonb_build_object(
            'staff_id', st.id,
            'staff_name', st.name,
            'practitioner_type', csp.practitioner_type,
            'specialty', csp.specialty
        ) ORDER BY st.name
    ) INTO v_practitioners
    FROM public.staff st
    JOIN public.clinic_staff_profiles csp ON csp.staff_id = st.id AND csp.tenant_id = st.tenant_id
    WHERE st.tenant_id = v_lead.tenant_id
      AND st.active = true
      AND (
        (p_branch_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.staff_branches sb
            WHERE sb.staff_id = st.id
              AND sb.branch_id = p_branch_id
        ))
        OR
        (p_branch_id IS NULL AND EXISTS (
            SELECT 1 FROM public.staff_branches sb
            JOIN public.staff_branches caller_sb ON caller_sb.branch_id = sb.branch_id
            WHERE sb.staff_id = st.id
              AND caller_sb.staff_id = v_caller_staff.id
        ))
      )
      AND (
        p_service_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.staff_services ss
            WHERE ss.staff_id = st.id
              AND ss.service_id = p_service_id
        )
      );

    RETURN jsonb_build_object(
        'lead_id', p_lead_id,
        'tenant_id', v_lead.tenant_id,
        'branches', COALESCE(v_branches, '[]'::jsonb),
        'services', COALESCE(v_services, '[]'::jsonb),
        'practitioners', COALESCE(v_practitioners, '[]'::jsonb)
    );
END;
$$;


-- 2. RPC: ht_get_clinic_acceptance_slots
CREATE OR REPLACE FUNCTION public.ht_get_clinic_acceptance_slots(
    p_lead_id UUID,
    p_branch_id UUID,
    p_service_id UUID,
    p_practitioner_staff_id UUID,
    p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_lead RECORD;
    v_caller_staff RECORD;
    v_csp RECORD;
    v_vert_ctx JSONB;
    v_service_duration INT;
    v_slots JSONB := '[]'::jsonb;
    v_branch_permitted BOOLEAN;
    v_weekday INT;
    v_rule RECORD;
    v_current_time TIME;
    v_eval_res JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.status <> 'handoff_pending' OR v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.';
    END IF;

    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.tenant_id = v_lead.tenant_id
      AND s.active = true;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
    END IF;

    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_caller_staff.id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.branches b
        JOIN public.staff_branches sb ON sb.branch_id = b.id
        WHERE b.id = p_branch_id
          AND b.tenant_id = v_lead.tenant_id
          AND b.is_active = true
          AND sb.staff_id = v_caller_staff.id
    ) INTO v_branch_permitted;

    IF NOT v_branch_permitted THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller is not permitted for the requested branch.';
    END IF;

    v_vert_ctx := public.resolve_tenant_vertical_context(v_lead.tenant_id);
    IF (v_vert_ctx->>'eligible')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'clinic_enabled')::boolean IS NOT TRUE
       OR (v_vert_ctx->'verticals'->>'health_tourism_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FORBIDDEN: Both Clinic and Health Tourism verticals must be eligible and enabled (%).',
            COALESCE(v_vert_ctx->>'reason_code', 'INELIGIBLE');
    END IF;

    SELECT COALESCE(duration, 30) INTO v_service_duration
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = v_lead.tenant_id
      AND active = true;

    IF v_service_duration IS NULL THEN
        RAISE EXCEPTION 'INVALID_SERVICE: Service not found or inactive.';
    END IF;

    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    FOR v_rule IN
        SELECT start_time, end_time
        FROM public.availability_rules
        WHERE staff_id = p_practitioner_staff_id
          AND tenant_id = v_lead.tenant_id
          AND weekday = v_weekday
          AND is_active = true
        ORDER BY start_time ASC
    LOOP
        v_current_time := v_rule.start_time;
        WHILE v_current_time < v_rule.end_time LOOP
            SELECT public.evaluate_booking_slot(
                p_tenant_id => v_lead.tenant_id,
                p_branch_id => p_branch_id,
                p_service_id => p_service_id,
                p_staff_id => p_practitioner_staff_id,
                p_date => p_date,
                p_time => v_current_time,
                p_exclude_appointment_id => NULL
            ) INTO v_eval_res;

            IF (v_eval_res->>'allowed')::boolean IS TRUE THEN
                v_slots := v_slots || jsonb_build_object(
                    'time', to_char(v_current_time, 'HH24:MI'),
                    'duration_minutes', COALESCE((v_eval_res->>'duration_minutes')::integer, v_service_duration),
                    'allowed', true
                );
            END IF;

            v_current_time := v_current_time + interval '15 minutes';
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'lead_id', p_lead_id,
        'branch_id', p_branch_id,
        'service_id', p_service_id,
        'practitioner_staff_id', p_practitioner_staff_id,
        'date', p_date,
        'available_slots', v_slots
    );
END;
$$;


-- 3. PRIVILEGES & SECURITY HARDENING
REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_options(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_options(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_slots(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_slots(uuid, uuid, uuid, uuid, date) TO authenticated;
