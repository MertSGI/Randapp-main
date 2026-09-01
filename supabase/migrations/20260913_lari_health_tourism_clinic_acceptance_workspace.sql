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

    -- 5. Branches Query: Active same-tenant branches
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'name', b.name
        ) ORDER BY b.name
    ) INTO v_branches
    FROM public.branches b
    WHERE b.tenant_id = v_lead.tenant_id
      AND b.active = true;

    -- 6. Services Query: Active same-tenant services, optionally mapped to p_branch_id
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'duration_minutes', COALESCE(s.duration_minutes, 30)
        ) ORDER BY s.name
    ) INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_lead.tenant_id
      AND s.active = true
      AND (
        p_branch_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.branch_services bs
            WHERE bs.branch_id = p_branch_id
              AND bs.service_id = s.id
        )
      );

    -- 7. Practitioners Query: Active same-tenant staff with Clinic profile, mapped to branch and service if provided
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
        p_branch_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.staff_branches sb
            WHERE sb.staff_id = st.id
              AND sb.branch_id = p_branch_id
        )
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

    v_current_time TIME;
    v_eval_res JSONB;
    v_hour INT;
    v_minute INT;
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

    -- 5. Service Duration Lookup
    SELECT COALESCE(duration_minutes, 30) INTO v_service_duration
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = v_lead.tenant_id;

    IF v_service_duration IS NULL THEN
        RAISE EXCEPTION 'INVALID_SERVICE: Service not found or inactive.';
    END IF;

    -- 6. Slot Grid Generation & Canonical Evaluation (15-minute intervals from 08:00 to 19:45)
    FOR v_hour IN 8..19 LOOP
        FOR v_minute IN 0..3 LOOP
            v_current_time := make_time(v_hour, v_minute * 15, 0);

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
        END LOOP;
    END FOR;

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
