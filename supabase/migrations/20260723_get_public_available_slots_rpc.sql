-- 20260723_get_public_available_slots_rpc.sql
-- Description: SECURITY DEFINER RPC that computes available time slots for a given
-- staff member, service, and date without exposing the appointments table to anon.
-- This eliminates the root cause of the slot availability mismatch: anon clients
-- previously queried /rest/v1/appointments which returned [] due to RLS, causing
-- all slots to appear free even when conflicts existed.
-- Migration count after this file: 17

-- =========================================================================
-- 1. get_public_available_slots RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_slug         text,
    p_staff_id     uuid,
    p_service_id   uuid,
    p_date         date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant_id          uuid;
    v_tenant_status      text;
    v_onboarding_status  text;
    v_public_site_status text;
    v_sub_exists         boolean;
    v_service_tenant_id  uuid;
    v_service_active     boolean;
    v_service_duration   integer;
    v_staff_tenant_id    uuid;
    v_staff_active       boolean;
    v_staff_svc_exists   boolean;
    v_weekday            integer;
    v_avail_start        time;
    v_avail_end          time;
    v_now_istanbul       timestamp;
    v_today_istanbul     date;
    v_now_min            integer;
    v_start_min          integer;
    v_end_min            integer;
    v_slot_min           integer;
    v_slot_h             integer;
    v_slot_m             integer;
    v_slot_time          time;
    v_slot_label         text;
    v_slot_end_min       integer;
    v_is_conflict        boolean;
    v_slots              jsonb := '[]'::jsonb;
    v_stage              text := 'init';

    -- Cursor variables for booked appointments on that day
    v_apt_start          integer;
    v_apt_duration       integer;
    v_apt_end            integer;

BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Tenant resolution and eligibility
    -- -----------------------------------------------------------------------
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active'
       AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Active entitlement check
    -- -----------------------------------------------------------------------
    v_stage := 'entitlement_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Service validation
    -- -----------------------------------------------------------------------
    v_stage := 'service_validation';
    SELECT tenant_id, active, duration
    INTO v_service_tenant_id, v_service_active, v_service_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_service_tenant_id IS DISTINCT FROM v_tenant_id OR v_service_active IS NOT TRUE THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'invalid_service');
    END IF;

    v_service_duration := COALESCE(v_service_duration, 60);

    -- -----------------------------------------------------------------------
    -- Gate 4: Staff validation
    -- -----------------------------------------------------------------------
    v_stage := 'staff_validation';
    SELECT tenant_id, active
    INTO v_staff_tenant_id, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant_id IS DISTINCT FROM v_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Staff-service mapping
    -- -----------------------------------------------------------------------
    v_stage := 'staff_service_mapping_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_svc_exists;

    IF NOT v_staff_svc_exists THEN
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 6: Availability rule for this weekday
    -- Weekday: PostgreSQL DOW: 0=Sunday, 1=Monday, ..., 6=Saturday
    -- The client sends weekday as 1=Mon..7=Sun (ISO). The availability_rules
    -- table stores weekday in ISO format (1=Mon..7=Sun) as confirmed by schema.
    -- -----------------------------------------------------------------------
    v_stage := 'availability_rule';
    v_weekday := EXTRACT(DOW FROM p_date)::integer;
    -- Convert PostgreSQL DOW (0=Sun) to ISO (7=Sun, 1=Mon)
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id  = p_staff_id
      AND tenant_id = v_tenant_id
      AND weekday   = v_weekday
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        -- No availability rule for this day — return empty slots (not an error)
        RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Compute current time in Europe/Istanbul for past-slot filtering
    -- -----------------------------------------------------------------------
    v_now_istanbul   := now() AT TIME ZONE 'Europe/Istanbul';
    v_today_istanbul := v_now_istanbul::date;

    -- -----------------------------------------------------------------------
    -- Build available slot list
    -- -----------------------------------------------------------------------
    v_stage := 'slot_generation';
    v_start_min := EXTRACT(HOUR FROM v_avail_start)::integer * 60
                 + EXTRACT(MINUTE FROM v_avail_start)::integer;
    v_end_min   := EXTRACT(HOUR FROM v_avail_end)::integer * 60
                 + EXTRACT(MINUTE FROM v_avail_end)::integer;

    -- Current minutes past midnight in Istanbul (only used when p_date = today)
    v_now_min := EXTRACT(HOUR FROM v_now_istanbul)::integer * 60
               + EXTRACT(MINUTE FROM v_now_istanbul)::integer;

    -- Walk slots at 15-minute intervals
    v_slot_min := v_start_min;
    WHILE v_slot_min <= v_end_min - v_service_duration LOOP

        -- Skip slots in the past for today
        IF p_date = v_today_istanbul AND v_slot_min <= v_now_min THEN
            v_slot_min := v_slot_min + 15;
            CONTINUE;
        END IF;

        -- Skip slots strictly in the past (date before today)
        IF p_date < v_today_istanbul THEN
            EXIT; -- entire date is in the past, exit loop
        END IF;

        v_slot_end_min := v_slot_min + v_service_duration;
        v_slot_time    := (v_slot_min / 60 * interval '1 hour')
                        + (v_slot_min % 60 * interval '1 minute');

        -- Check conflicts: any non-cancelled appointment for this staff+date
        -- that overlaps the candidate slot interval
        v_is_conflict := false;

        SELECT EXISTS (
            SELECT 1
            FROM public.appointments a
            JOIN public.services    s ON s.id = a.service_id
            WHERE a.staff_id         = p_staff_id
              AND a.tenant_id        = v_tenant_id
              AND a.appointment_date = p_date
              AND a.status NOT IN (
                  'cancelled', 'cancelled_by_customer',
                  'cancelled_by_salon', 'cancelled_by_system', 'no_show'
              )
              -- Overlap condition: existing appointment overlaps our candidate window
              AND (a.appointment_date + a.appointment_time)
                  < (p_date + v_slot_time + (v_service_duration || ' minutes')::interval)
              AND ((a.appointment_date + a.appointment_time)
                  + (COALESCE(s.duration, 60) || ' minutes')::interval)
                  > (p_date + v_slot_time)
        ) INTO v_is_conflict;

        IF NOT v_is_conflict THEN
            -- Format as HH:MM
            v_slot_h     := v_slot_min / 60;
            v_slot_m     := v_slot_min % 60;
            v_slot_label := lpad(v_slot_h::text, 2, '0') || ':' || lpad(v_slot_m::text, 2, '0');
            v_slots      := v_slots || to_jsonb(v_slot_label);
        END IF;

        v_slot_min := v_slot_min + 15;
    END LOOP;

    RETURN jsonb_build_object('slots', v_slots, 'reason_code', 'ok');

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'get_public_available_slots error stage: %, SQLSTATE: %', v_stage, SQLSTATE;
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason_code', 'temporary_failure');
END;
$$;


-- =========================================================================
-- 2. Explicit Permission Grants
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.get_public_available_slots(text, uuid, uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_available_slots(text, uuid, uuid, date) TO anon;

GRANT EXECUTE ON FUNCTION public.get_public_available_slots(text, uuid, uuid, date) TO authenticated;
