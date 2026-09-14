-- 20260929_phase5_scheduling_buffer_parity_hardening.sql
-- LARI PROGRAM V2 PHASE 5 ADDITIVE CORRECTION MIGRATION
-- Migration 88 of 88 in cumulative product lineage.
--
-- Restores canonical Phase 2 asymmetric buffer collision logic (EV055-R3) within evaluate_booking_slot
-- while strictly preserving Phase 3 resource/capacity evaluation, Phase 5 security/branch scoping,
-- timezone past checks, and SECURITY DEFINER execution contracts.
--
-- Root Cause Addressed:
-- Phase 3 migration (20260920_phase3_resource_capacity_foundation.sql) replaced evaluate_booking_slot
-- but omitted the existing appointment's service/default buffer rules from its collision query.
-- This caused requested slots inside an active appointment's buffer_after window to incorrectly pass.

CREATE OR REPLACE FUNCTION public.evaluate_booking_slot(
    p_tenant_id                UUID,
    p_branch_id                UUID,
    p_service_id               UUID,
    p_staff_id                 UUID,
    p_date                     DATE,
    p_time                     TIME,
    p_exclude_appointment_id   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_branch_active        BOOLEAN;
    v_branch_tenant        UUID;
    v_svc_tenant           UUID;
    v_svc_active           BOOLEAN;
    v_svc_duration         INTEGER;
    v_svc_branch_match     BOOLEAN;
    v_staff_tenant         UUID;
    v_staff_active         BOOLEAN;
    v_staff_branch_match   BOOLEAN;
    v_staff_svc_match      BOOLEAN;
    v_weekday              INTEGER;
    v_avail_start          TIME;
    v_avail_end            TIME;
    v_req_start            TIMESTAMP;
    v_req_end              TIMESTAMP;
    v_tz                   TEXT := 'Europe/Istanbul';
    v_now_in_tz            TIMESTAMP;
    v_slot_conflict        BOOLEAN;
    v_sched_res            JSONB;
    v_req_buf_before       INTEGER := 0;
    v_req_buf_after        INTEGER := 0;
    v_res_eval             JSONB;
BEGIN
    -- 1. Validate Branch (canonical public.branches)
    SELECT tenant_id, is_active, COALESCE(timezone, 'Europe/Istanbul')
    INTO v_branch_tenant, v_branch_active, v_tz
    FROM public.branches
    WHERE id = p_branch_id;

    IF NOT FOUND OR v_branch_tenant IS DISTINCT FROM p_tenant_id OR v_branch_active IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_branch', 'duration_minutes', 0);
    END IF;

    -- 2. Validate Service (canonical public.services)
    SELECT tenant_id, active, duration
    INTO v_svc_tenant, v_svc_active, v_svc_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_svc_tenant IS DISTINCT FROM p_tenant_id OR v_svc_active IS NOT TRUE OR v_svc_duration IS NULL OR v_svc_duration <= 0 THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_service', 'duration_minutes', 0);
    END IF;

    -- Service-Branch Fail-Closed Check: exact service_branches mapping required
    SELECT EXISTS (
        SELECT 1 FROM public.service_branches 
        WHERE service_id = p_service_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id
    ) INTO v_svc_branch_match;

    IF NOT v_svc_branch_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_service', 'duration_minutes', 0);
    END IF;

    -- 3. Validate Staff (canonical public.staff)
    SELECT tenant_id, active
    INTO v_staff_tenant, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant IS DISTINCT FROM p_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- Staff-Branch Fail-Closed Check: exact staff_branches mapping required
    SELECT EXISTS (
        SELECT 1 FROM public.staff_branches 
        WHERE staff_id = p_staff_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id
    ) INTO v_staff_branch_match;

    IF NOT v_staff_branch_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- 4. Validate Staff-Service Mapping (canonical public.staff_services)
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_svc_match;

    IF NOT v_staff_svc_match THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_staff', 'duration_minutes', 0);
    END IF;

    -- 5. Validate Schedule Constraints (EV055-R3: Holidays, Time-Off, Breaks, Buffers)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'evaluate_schedule_constraints') THEN
        v_sched_res := public.evaluate_schedule_constraints(
            p_tenant_id,
            p_branch_id,
            p_service_id,
            p_staff_id,
            p_date,
            p_time,
            v_svc_duration
        );

        IF (v_sched_res->>'allowed')::BOOLEAN IS NOT TRUE THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', v_sched_res->>'reason_code',
                'duration_minutes', v_svc_duration
            );
        END IF;

        v_req_buf_before := COALESCE((v_sched_res->>'buffer_before')::INTEGER, 0);
        v_req_buf_after  := COALESCE((v_sched_res->>'buffer_after')::INTEGER, 0);
    END IF;

    -- 6. Validate Availability Rules (ISO Weekday: 1=Mon..7=Sun)
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id = p_staff_id
      AND tenant_id = p_tenant_id
      AND weekday = v_weekday
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'outside_availability', 'duration_minutes', v_svc_duration);
    END IF;

    v_req_start := p_date + p_time;
    v_req_end   := v_req_start + (v_svc_duration || ' minutes')::INTERVAL;

    IF p_time < v_avail_start OR (p_time + (v_svc_duration || ' minutes')::INTERVAL) > v_avail_end THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'outside_availability', 'duration_minutes', v_svc_duration);
    END IF;

    -- 7. Validate Future Slot (Timezone aware)
    v_now_in_tz := now() AT TIME ZONE v_tz;
    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_in_past', 'duration_minutes', v_svc_duration);
    END IF;

    -- 8. Validate Overlapping Active Appointments with Asymmetric Buffer Consideration (EV055-R3 parity)
    -- For each existing active appointment:
    --   occupied_start = a.start - existing_buf_before
    --   occupied_end   = a.end   + existing_buf_after
    -- Collision condition: (requested_start - req_buf_before) < occupied_end
    --                  AND (requested_end   + req_buf_after)  > occupied_start
    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        LEFT JOIN public.booking_buffer_rules bbr_exist_svc
            ON bbr_exist_svc.tenant_id = a.tenant_id
           AND bbr_exist_svc.service_id = a.service_id
           AND bbr_exist_svc.is_active = true
        LEFT JOIN public.booking_buffer_rules bbr_exist_def
            ON bbr_exist_def.tenant_id = a.tenant_id
           AND bbr_exist_def.service_id IS NULL
           AND bbr_exist_def.is_active = true
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show')
          AND (v_req_start - (v_req_buf_before || ' minutes')::INTERVAL) < (
              (a.appointment_date + a.appointment_time) + (COALESCE(a.duration_minutes, 30) || ' minutes')::INTERVAL
              + (COALESCE(bbr_exist_svc.buffer_after, bbr_exist_def.buffer_after, 0) || ' minutes')::INTERVAL
          )
          AND (v_req_end + (v_req_buf_after || ' minutes')::INTERVAL) > (
              (a.appointment_date + a.appointment_time)
              - (COALESCE(bbr_exist_svc.buffer_before, bbr_exist_def.buffer_before, 0) || ' minutes')::INTERVAL
          )
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_conflict', 'duration_minutes', v_svc_duration);
    END IF;

    -- 9. Validate Resource & Capacity Constraints (LARI Phase 3 Extension)
    v_res_eval := public.evaluate_and_lock_resource_plan(
        p_tenant_id,
        p_branch_id,
        p_service_id,
        p_date,
        p_time,
        v_svc_duration,
        p_exclude_appointment_id,
        FALSE
    );

    IF NOT (v_res_eval->>'allowed')::boolean THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason_code', v_res_eval->>'reason_code',
            'duration_minutes', v_svc_duration,
            'resource_details', v_res_eval
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'duration_minutes', v_svc_duration,
        'slot_start', p_time::text,
        'slot_end', (p_time + (v_svc_duration || ' minutes')::INTERVAL)::text,
        'allocation_plan', v_res_eval->'allocation_plan'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('allowed', false, 'reason_code', 'temporary_failure', 'duration_minutes', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) TO authenticated, service_role;
