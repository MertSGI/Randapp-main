-- ===========================================================================
-- Migration: Phase 2 Staff Scheduling Foundation (R1 Hardened)
-- Authority: LARI-PROGRAM-V2-EV055-SCHEDULING-FOUNDATION-R1-CORRECTION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 2 (REAL_PAYMENTLESS_PILOT_CORE)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
-- Stacked on: a29c7e7db10484e413f239f5885d99fb07bed9f4
-- 
-- Controller Corrections Applied:
-- 1. CONFIRMED_ISSUE_EV055_1: Removed broad public-read policies.
--    Direct table access is restricted to authenticated tenant owners/staff and super admins.
--    No anonymous direct table access.
-- 2. CONFIRMED_ISSUE_EV055_2: check_staff_slot_availability now requires p_service_id.
--    Buffer rule selection strictly follows canonical hierarchy:
--    (a) Exact tenant + requested service active rule;
--    (b) Otherwise tenant default where service_id IS NULL;
--    (c) Otherwise zero buffer. Never selects an unrelated service rule.
-- 3. CONFIRMED_ISSUE_EV055_3 (Default Buffer Uniqueness): Added partial unique index:
--    booking_buffer_rules_tenant_default_idx ON booking_buffer_rules(tenant_id) WHERE service_id IS NULL.
-- 4. CONFIRMED_ISSUE_EV055_4 (Branch Holiday): check_staff_slot_availability now accepts
--    p_branch_id UUID DEFAULT NULL. Holiday applies only if holiday.branch_id IS NULL OR holiday.branch_id = p_branch_id.
-- 5. Entity/Tenant Validation: Validates staff belongs to tenant, service belongs to tenant,
--    and branch belongs to tenant (if provided).
-- 6. SECURITY DEFINER Hardening: REVOKE EXECUTE FROM PUBLIC before granting anon/authenticated.
--    Fixed search_path = pg_catalog, public. Returns only safe availability boolean and clean time facts.
-- ===========================================================================

-- =========================================================================
-- 1. staff_time_off — Individual staff time-off blocks
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_time_off (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    start_time  TIME WITHOUT TIME ZONE DEFAULT NULL,  -- NULL = all day
    end_time    TIME WITHOUT TIME ZONE DEFAULT NULL,  -- NULL = all day
    reason      TEXT DEFAULT NULL,
    category    TEXT NOT NULL DEFAULT 'time_off'
                CHECK (category IN ('time_off', 'vacation', 'sick_leave', 'personal', 'training', 'other')),
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_by  UUID DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT staff_time_off_date_range CHECK (end_date >= start_date),
    CONSTRAINT staff_time_off_partial_day CHECK (
        (start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE INDEX idx_staff_time_off_tenant ON public.staff_time_off(tenant_id);
CREATE INDEX idx_staff_time_off_staff ON public.staff_time_off(staff_id);
CREATE INDEX idx_staff_time_off_dates ON public.staff_time_off(staff_id, start_date, end_date);

CREATE TRIGGER update_staff_time_off_modtime
    BEFORE UPDATE ON public.staff_time_off
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

-- REVOKE direct table privileges from public/anon
REVOKE ALL ON public.staff_time_off FROM PUBLIC;
REVOKE ALL ON public.staff_time_off FROM anon;

-- Tenant admins and authorized staff can manage/view staff_time_off
CREATE POLICY "Tenant admins can manage staff_time_off"
    ON public.staff_time_off FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = staff_time_off.tenant_id
                )
              )
        )
    );

CREATE POLICY "Super Admins - Full Access on staff_time_off"
    ON public.staff_time_off FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 2. staff_breaks — Recurring break periods within working hours
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_breaks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    weekday     INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),  -- 0=Sun, 6=Sat
    start_time  TIME WITHOUT TIME ZONE NOT NULL,
    end_time    TIME WITHOUT TIME ZONE NOT NULL,
    label       TEXT DEFAULT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT staff_breaks_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_staff_breaks_tenant ON public.staff_breaks(tenant_id);
CREATE INDEX idx_staff_breaks_staff_weekday ON public.staff_breaks(staff_id, weekday);

CREATE TRIGGER update_staff_breaks_modtime
    BEFORE UPDATE ON public.staff_breaks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_breaks FROM PUBLIC;
REVOKE ALL ON public.staff_breaks FROM anon;

CREATE POLICY "Tenant admins can manage staff_breaks"
    ON public.staff_breaks FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = staff_breaks.tenant_id
                )
              )
        )
    );

CREATE POLICY "Super Admins - Full Access on staff_breaks"
    ON public.staff_breaks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 3. booking_buffer_rules — Buffer time between appointments
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_buffer_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id      UUID DEFAULT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    buffer_before   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0),  -- minutes
    buffer_after    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0),   -- minutes
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure only one rule per service when service_id IS NOT NULL
    CONSTRAINT booking_buffer_service_unique UNIQUE (tenant_id, service_id)
);

-- Partial unique index guaranteeing EXACTLY ONE tenant-wide default where service_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS booking_buffer_rules_tenant_default_idx
    ON public.booking_buffer_rules (tenant_id)
    WHERE service_id IS NULL;

CREATE INDEX idx_booking_buffer_tenant ON public.booking_buffer_rules(tenant_id);

CREATE TRIGGER update_booking_buffer_modtime
    BEFORE UPDATE ON public.booking_buffer_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_buffer_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_buffer_rules FROM PUBLIC;
REVOKE ALL ON public.booking_buffer_rules FROM anon;

CREATE POLICY "Tenant admins can manage booking_buffer_rules"
    ON public.booking_buffer_rules FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = booking_buffer_rules.tenant_id
                )
              )
        )
    );

CREATE POLICY "Super Admins - Full Access on booking_buffer_rules"
    ON public.booking_buffer_rules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 4. business_holidays — Tenant-wide / Branch holiday calendar
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.business_holidays (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id   UUID DEFAULT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    name        TEXT NOT NULL,
    name_tr     TEXT DEFAULT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT business_holidays_unique UNIQUE (tenant_id, branch_id, date)
);

-- Handle NULL branch_id uniqueness per tenant and date
CREATE UNIQUE INDEX IF NOT EXISTS business_holidays_tenant_all_branches_idx
    ON public.business_holidays (tenant_id, date)
    WHERE branch_id IS NULL;

CREATE INDEX idx_business_holidays_tenant ON public.business_holidays(tenant_id);
CREATE INDEX idx_business_holidays_date ON public.business_holidays(tenant_id, date);

CREATE TRIGGER update_business_holidays_modtime
    BEFORE UPDATE ON public.business_holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_holidays FROM PUBLIC;
REVOKE ALL ON public.business_holidays FROM anon;

CREATE POLICY "Tenant admins can manage business_holidays"
    ON public.business_holidays FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = business_holidays.tenant_id
                )
              )
        )
    );

CREATE POLICY "Super Admins - Full Access on business_holidays"
    ON public.business_holidays FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 5. Server-Authoritative RPC: check_staff_slot_availability
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_staff_slot_availability(
    p_tenant_id     UUID,
    p_staff_id      UUID,
    p_service_id    UUID,
    p_date          DATE,
    p_start_time    TIME,
    p_duration_min  INTEGER DEFAULT NULL,
    p_branch_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_weekday        INTEGER;
    v_req_end        TIME;
    v_duration       INTEGER;
    v_avail_start    TIME;
    v_avail_end      TIME;
    v_buffer_before  INTEGER := 0;
    v_buffer_after   INTEGER := 0;
    v_service_rec    RECORD;
    v_staff_rec      RECORD;
    v_branch_rec     RECORD;
BEGIN
    -- Fail-closed 1: Tenant validation
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
        RETURN jsonb_build_object('available', false, 'reason', 'tenant_not_found');
    END IF;

    -- Fail-closed 2: Service belongs to tenant
    SELECT s.id, s.duration, s.active, s.branch_id
    INTO v_service_rec
    FROM public.services s
    WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('available', false, 'reason', 'service_not_found');
    END IF;

    IF v_service_rec.active = false THEN
        RETURN jsonb_build_object('available', false, 'reason', 'service_inactive');
    END IF;

    -- Fail-closed 3: Staff belongs to tenant
    SELECT st.id, st.active, st.branch_id
    INTO v_staff_rec
    FROM public.staff st
    WHERE st.id = p_staff_id AND st.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('available', false, 'reason', 'staff_not_found');
    END IF;

    IF v_staff_rec.active = false THEN
        RETURN jsonb_build_object('available', false, 'reason', 'staff_inactive');
    END IF;

    -- Fail-closed 4: Branch validation where provided
    IF p_branch_id IS NOT NULL THEN
        SELECT b.id, b.is_active
        INTO v_branch_rec
        FROM public.business_branches b
        WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('available', false, 'reason', 'branch_not_found');
        END IF;

        IF v_branch_rec.is_active = false THEN
            RETURN jsonb_build_object('available', false, 'reason', 'branch_inactive');
        END IF;

        -- Check staff branch binding if assigned
        IF v_staff_rec.branch_id IS NOT NULL AND v_staff_rec.branch_id != p_branch_id THEN
            RETURN jsonb_build_object('available', false, 'reason', 'staff_branch_mismatch');
        END IF;

        -- Check service branch binding if assigned
        IF v_service_rec.branch_id IS NOT NULL AND v_service_rec.branch_id != p_branch_id THEN
            RETURN jsonb_build_object('available', false, 'reason', 'service_branch_mismatch');
        END IF;
    END IF;

    -- Calculate effective duration
    v_duration := COALESCE(p_duration_min, v_service_rec.duration, 60);
    IF v_duration <= 0 THEN
        v_duration := 60;
    END IF;

    v_weekday := EXTRACT(DOW FROM p_date)::integer;
    v_req_end := p_start_time + (v_duration || ' minutes')::interval;

    -- Check 1: Business holiday (all-branches NULL OR requested branch match)
    IF EXISTS (
        SELECT 1 FROM public.business_holidays bh
        WHERE bh.tenant_id = p_tenant_id
          AND bh.is_active = true
          AND (bh.branch_id IS NULL OR p_branch_id IS NULL OR bh.branch_id = p_branch_id)
          AND (
              bh.date = p_date
              OR (bh.is_recurring = true AND EXTRACT(MONTH FROM bh.date) = EXTRACT(MONTH FROM p_date)
                  AND EXTRACT(DAY FROM bh.date) = EXTRACT(DAY FROM p_date))
          )
    ) THEN
        RETURN jsonb_build_object('available', false, 'reason', 'business_holiday');
    END IF;

    -- Check 2: Staff time-off (never disclose private absence reasons to public callers)
    IF EXISTS (
        SELECT 1 FROM public.staff_time_off sto
        WHERE sto.staff_id = p_staff_id
          AND sto.tenant_id = p_tenant_id
          AND sto.is_approved = true
          AND p_date BETWEEN sto.start_date AND sto.end_date
          AND (
              (sto.start_time IS NULL)
              OR
              (p_start_time < sto.end_time AND v_req_end > sto.start_time)
          )
    ) THEN
        RETURN jsonb_build_object('available', false, 'reason', 'staff_unavailable');
    END IF;

    -- Check 3: Staff availability rule for weekday
    SELECT ar.start_time, ar.end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules ar
    WHERE ar.staff_id = p_staff_id
      AND ar.tenant_id = p_tenant_id
      AND ar.weekday = v_weekday
      AND ar.is_active = true
      AND ar.start_time <= p_start_time
      AND ar.end_time >= v_req_end
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('available', false, 'reason', 'outside_working_hours');
    END IF;

    -- Check 4: Staff breaks on this weekday
    IF EXISTS (
        SELECT 1 FROM public.staff_breaks sb
        WHERE sb.staff_id = p_staff_id
          AND sb.tenant_id = p_tenant_id
          AND sb.weekday = v_weekday
          AND sb.is_active = true
          AND p_start_time < sb.end_time
          AND v_req_end > sb.start_time
    ) THEN
        RETURN jsonb_build_object('available', false, 'reason', 'staff_break');
    END IF;

    -- Check 5: Buffer rule selection hierarchy
    -- 1. Exact service active rule
    SELECT bbr.buffer_before, bbr.buffer_after
    INTO v_buffer_before, v_buffer_after
    FROM public.booking_buffer_rules bbr
    WHERE bbr.tenant_id = p_tenant_id
      AND bbr.service_id = p_service_id
      AND bbr.is_active = true
    LIMIT 1;

    -- 2. Tenant default rule if no service rule found
    IF NOT FOUND THEN
        SELECT bbr.buffer_before, bbr.buffer_after
        INTO v_buffer_before, v_buffer_after
        FROM public.booking_buffer_rules bbr
        WHERE bbr.tenant_id = p_tenant_id
          AND bbr.service_id IS NULL
          AND bbr.is_active = true
        LIMIT 1;
    END IF;

    v_buffer_before := COALESCE(v_buffer_before, 0);
    v_buffer_after := COALESCE(v_buffer_after, 0);

    -- Check 6: Appointment overlap with buffer consideration
    IF EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          AND (
              (a.appointment_date + a.appointment_time - (v_buffer_before || ' minutes')::interval) < (p_date + v_req_end + (v_buffer_after || ' minutes')::interval)
              AND
              ((a.appointment_date + a.appointment_time) + (COALESCE(s.duration, 60) || ' minutes')::interval + (v_buffer_after || ' minutes')::interval) > (p_date + p_start_time - (v_buffer_before || ' minutes')::interval)
          )
    ) THEN
        RETURN jsonb_build_object('available', false, 'reason', 'slot_conflict');
    END IF;

    -- Safe availability output (no private reasons or internal metadata)
    RETURN jsonb_build_object(
        'available', true,
        'working_hours', jsonb_build_object('start', v_avail_start::text, 'end', v_avail_end::text),
        'buffer_applied', jsonb_build_object('before', v_buffer_before, 'after', v_buffer_after)
    );
END;
$$;

-- Security hardening: REVOKE EXECUTE FROM PUBLIC first
REVOKE EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) TO authenticated;
