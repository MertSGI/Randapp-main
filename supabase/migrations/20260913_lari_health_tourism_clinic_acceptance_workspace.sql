-- =========================================================================
-- MIGRATION 20260913_lari_health_tourism_clinic_acceptance_workspace.sql
-- Description: Health Tourism Slice 4 (Block 2) — Server-Authoritative
--              Clinic Acceptance Workspace Read Support (Options & Slots)
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 69
-- =========================================================================

-- =========================================================================
-- 1. RPC: ht_get_clinic_acceptance_options
-- =========================================================================

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
    v_branches JSONB;
    v_services JSONB;
    v_practitioners JSONB;
    v_branch_permitted BOOLEAN;
BEGIN
    -- 1. Authentication Check
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- 2. Lead Existence & Tenant Verification
    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    -- Lead MUST be in handoff_pending status AND handoff_state requested
    IF v_lead.status <> 'handoff_pending' OR v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.';
    END IF;

    -- 3. Resolve Active Caller Staff Identity for Lead Tenant
    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.tenant_id = v_lead.tenant_id
      AND s.active = true;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
    END IF;

    -- 4. Clinic Authority Check: Caller MUST have Clinic staff profile with can_manage_patient_profiles=true
    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_caller_staff.id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    -- 5. Branch Authority Check: If p_branch_id supplied, caller MUST be permitted for it
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

    -- 6. Branches Query: Active same-tenant branches permitted for caller
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

    -- 7. Services Query: Active same-tenant services, mapped in service_branches
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

    -- 8. Practitioners Query: Active same-tenant staff with Clinic profile, mapped to branch and service if provided
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


-- =========================================================================
-- 2. RPC: ht_get_clinic_acceptance_slots
-- =========================================================================

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
    v_service_duration INT;
    v_slots JSONB := '[]'::jsonb;
    v_branch_permitted BOOLEAN;
    v_weekday INT;
    v_rule RECORD;
    v_current_time TIME;
    v_eval_res JSONB;
BEGIN
    -- 1. Authentication Check
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- 2. Lead Existence & Tenant Verification
    SELECT * INTO v_lead
    FROM public.ht_leads
    WHERE id = p_lead_id;

    IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Lead not found.';
    END IF;

    IF v_lead.status <> 'handoff_pending' OR v_lead.handoff_state <> 'requested' THEN
        RAISE EXCEPTION 'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.';
    END IF;

    -- 3. Resolve Active Caller Staff Identity for Lead Tenant
    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.tenant_id = v_lead.tenant_id
      AND s.active = true;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity in this tenant.';
    END IF;

    -- 4. Clinic Authority Check
    SELECT csp.* INTO v_csp
    FROM public.clinic_staff_profiles csp
    WHERE csp.staff_id = v_caller_staff.id
      AND csp.tenant_id = v_lead.tenant_id;

    IF v_csp.staff_id IS NULL OR v_csp.can_manage_patient_profiles = false THEN
        RAISE EXCEPTION 'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.';
    END IF;

    -- 5. Branch Authority Check: Caller MUST be permitted for p_branch_id
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

    -- 6. Service Duration Lookup
    SELECT COALESCE(duration, 30) INTO v_service_duration
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = v_lead.tenant_id
      AND active = true;

    IF v_service_duration IS NULL THEN
        RAISE EXCEPTION 'INVALID_SERVICE: Service not found or inactive.';
    END IF;

    -- 7. Determine ISO Weekday (1=Mon .. 7=Sun)
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    -- 8. Generate Candidates from ACTIVE availability_rules for Practitioner
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
            -- Delegate to canonical Core slot evaluator
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


-- =========================================================================
-- 3. PRIVILEGES & SECURITY HARDENING
-- =========================================================================

REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_options(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_options(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ht_get_clinic_acceptance_slots(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ht_get_clinic_acceptance_slots(uuid, uuid, uuid, uuid, date) TO authenticated;
