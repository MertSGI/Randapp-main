-- ===========================================================================
-- Migration: Phase 2 Staff Scheduling Foundation
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 2 (REAL_PAYMENTLESS_PILOT_CORE)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
-- 
-- This migration adds foundational scheduling domain tables that the
-- existing booking system lacks:
--
-- 1. staff_time_off       — Single-day or multi-day time-off/holiday blocks
-- 2. staff_breaks         — Recurring break periods within working hours
-- 3. booking_buffer_rules — Buffer time before/after services
-- 4. business_holidays    — Tenant-wide holiday calendar
--
-- These tables are designed to be consumed by:
-- - The existing create_public_booking RPC (Gate 11 availability validation)
-- - Future capacity/waitlist RPCs
-- - Admin scheduling UI
--
-- All tables follow existing patterns:
-- - UUID PKs with gen_random_uuid()
-- - tenant_id FK with ON DELETE CASCADE
-- - RLS enabled with standard tenant admin policies
-- - Public read where appropriate
-- - updated_at trigger using existing update_updated_at_column()
-- ===========================================================================

-- =========================================================================
-- 1. staff_time_off — Individual staff time-off blocks
-- =========================================================================
-- Represents a specific date range where a staff member is unavailable.
-- Can be vacation, sick leave, personal day, or any custom reason.
-- The booking RPC should check this before allowing a booking.

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

    -- End date must be >= start date
    CONSTRAINT staff_time_off_date_range CHECK (end_date >= start_date),
    -- If partial-day, both times must be present and valid
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

-- Public can read (needed for booking UI to show unavailability)
CREATE POLICY "Public read staff_time_off"
    ON public.staff_time_off FOR SELECT USING (true);

-- Tenant admins can manage
CREATE POLICY "Tenant admins can manage staff_time_off"
    ON public.staff_time_off FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = staff_time_off.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 2. staff_breaks — Recurring break periods within working hours
-- =========================================================================
-- Represents recurring breaks (e.g., lunch break 12:00-13:00 every weekday).
-- These are per-staff, per-weekday recurring slots where no booking is allowed.
-- Different from time_off which is date-specific.

CREATE TABLE IF NOT EXISTS public.staff_breaks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    weekday     INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),  -- 0=Sun, 6=Sat
    start_time  TIME WITHOUT TIME ZONE NOT NULL,
    end_time    TIME WITHOUT TIME ZONE NOT NULL,
    label       TEXT DEFAULT NULL,  -- e.g., "Lunch Break", "Prayer Break"
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- End time must be after start time
    CONSTRAINT staff_breaks_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_staff_breaks_tenant ON public.staff_breaks(tenant_id);
CREATE INDEX idx_staff_breaks_staff_weekday ON public.staff_breaks(staff_id, weekday);

CREATE TRIGGER update_staff_breaks_modtime
    BEFORE UPDATE ON public.staff_breaks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;

-- Public can read (needed for booking UI slot generation)
CREATE POLICY "Public read staff_breaks"
    ON public.staff_breaks FOR SELECT USING (true);

-- Tenant admins can manage
CREATE POLICY "Tenant admins can manage staff_breaks"
    ON public.staff_breaks FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = staff_breaks.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 3. booking_buffer_rules — Buffer time between appointments
-- =========================================================================
-- Configures mandatory gap time before/after appointments for a service.
-- E.g., a hair coloring service may need 10 min cleanup buffer.
-- Can be set per-service or as a tenant-wide default.

CREATE TABLE IF NOT EXISTS public.booking_buffer_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id      UUID DEFAULT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    -- If service_id is NULL, this is the tenant-wide default
    buffer_before   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0),  -- minutes
    buffer_after    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0),   -- minutes
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure only one rule per service per tenant (or one default per tenant)
    CONSTRAINT booking_buffer_unique UNIQUE (tenant_id, service_id)
);

CREATE INDEX idx_booking_buffer_tenant ON public.booking_buffer_rules(tenant_id);

CREATE TRIGGER update_booking_buffer_modtime
    BEFORE UPDATE ON public.booking_buffer_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_buffer_rules ENABLE ROW LEVEL SECURITY;

-- Public can read (needed for slot generation)
CREATE POLICY "Public read booking_buffer_rules"
    ON public.booking_buffer_rules FOR SELECT USING (true);

-- Tenant admins can manage
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

-- =========================================================================
-- 4. business_holidays — Tenant-wide holiday/closure calendar
-- =========================================================================
-- Represents days where the entire business is closed.
-- Staff time-off is individual; business holidays affect all staff.
-- Can be used for public holidays, planned closures, etc.

CREATE TABLE IF NOT EXISTS public.business_holidays (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id   UUID DEFAULT NULL,  -- NULL = all branches
    date        DATE NOT NULL,
    name        TEXT NOT NULL,           -- e.g., "Republic Day", "Annual Closure"
    name_tr     TEXT DEFAULT NULL,       -- Turkish name
    is_recurring BOOLEAN NOT NULL DEFAULT false,  -- If true, repeats yearly on same date
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One holiday entry per date per tenant per branch
    CONSTRAINT business_holidays_unique UNIQUE (tenant_id, branch_id, date)
);

CREATE INDEX idx_business_holidays_tenant ON public.business_holidays(tenant_id);
CREATE INDEX idx_business_holidays_date ON public.business_holidays(tenant_id, date);

CREATE TRIGGER update_business_holidays_modtime
    BEFORE UPDATE ON public.business_holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

-- Public can read (needed for booking calendar)
CREATE POLICY "Public read business_holidays"
    ON public.business_holidays FOR SELECT USING (true);

-- Tenant admins can manage
CREATE POLICY "Tenant admins can manage business_holidays"
    ON public.business_holidays FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = business_holidays.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 5. Server-authoritative RPC: Check staff availability
-- =========================================================================
-- A read-only RPC that returns whether a staff member is available for a
-- given date/time slot, considering: availability_rules, time_off, breaks,
-- holidays, and existing appointments.

CREATE OR REPLACE FUNCTION public.check_staff_slot_availability(
    p_tenant_id     UUID,
    p_staff_id      UUID,
    p_date          DATE,
    p_start_time    TIME,
    p_duration_min  INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_weekday       INTEGER;
    v_req_end       TIME;
    v_avail_start   TIME;
    v_avail_end     TIME;
    v_is_available  BOOLEAN := true;
    v_reason        TEXT := NULL;
    v_buffer_before INTEGER := 0;
    v_buffer_after  INTEGER := 0;
BEGIN
    v_weekday := EXTRACT(DOW FROM p_date)::integer;
    v_req_end := p_start_time + (p_duration_min || ' minutes')::interval;

    -- Check 1: Business holiday
    IF EXISTS (
        SELECT 1 FROM public.business_holidays bh
        WHERE bh.tenant_id = p_tenant_id
          AND bh.is_active = true
          AND (
              bh.date = p_date
              OR (bh.is_recurring = true AND EXTRACT(MONTH FROM bh.date) = EXTRACT(MONTH FROM p_date)
                  AND EXTRACT(DAY FROM bh.date) = EXTRACT(DAY FROM p_date))
          )
    ) THEN
        RETURN jsonb_build_object(
            'available', false,
            'reason', 'business_holiday'
        );
    END IF;

    -- Check 2: Staff time-off
    IF EXISTS (
        SELECT 1 FROM public.staff_time_off sto
        WHERE sto.staff_id = p_staff_id
          AND sto.tenant_id = p_tenant_id
          AND sto.is_approved = true
          AND p_date BETWEEN sto.start_date AND sto.end_date
          AND (
              -- Full-day time off
              (sto.start_time IS NULL)
              OR
              -- Partial-day overlap: requested slot overlaps the blocked period
              (p_start_time < sto.end_time AND v_req_end > sto.start_time)
          )
    ) THEN
        RETURN jsonb_build_object(
            'available', false,
            'reason', 'staff_time_off'
        );
    END IF;

    -- Check 3: Availability rule (weekly schedule)
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
        RETURN jsonb_build_object(
            'available', false,
            'reason', 'outside_working_hours'
        );
    END IF;

    -- Check 4: Staff breaks
    IF EXISTS (
        SELECT 1 FROM public.staff_breaks sb
        WHERE sb.staff_id = p_staff_id
          AND sb.tenant_id = p_tenant_id
          AND sb.weekday = v_weekday
          AND sb.is_active = true
          AND p_start_time < sb.end_time
          AND v_req_end > sb.start_time
    ) THEN
        RETURN jsonb_build_object(
            'available', false,
            'reason', 'staff_break'
        );
    END IF;

    -- Check 5: Get buffer rules (service-specific or tenant default)
    SELECT COALESCE(bbr.buffer_before, 0), COALESCE(bbr.buffer_after, 0)
    INTO v_buffer_before, v_buffer_after
    FROM public.booking_buffer_rules bbr
    WHERE bbr.tenant_id = p_tenant_id
      AND bbr.is_active = true
    ORDER BY bbr.service_id IS NOT NULL DESC  -- service-specific first
    LIMIT 1;

    -- Check 6: Appointment overlap (with buffer consideration)
    IF EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          AND (
              -- Buffered overlap check
              (a.appointment_date + a.appointment_time - (v_buffer_before || ' minutes')::interval) < (p_date + v_req_end + (v_buffer_after || ' minutes')::interval)
              AND
              ((a.appointment_date + a.appointment_time) + (COALESCE(s.duration, 60) || ' minutes')::interval + (v_buffer_after || ' minutes')::interval) > (p_date + p_start_time - (v_buffer_before || ' minutes')::interval)
          )
    ) THEN
        RETURN jsonb_build_object(
            'available', false,
            'reason', 'slot_conflict'
        );
    END IF;

    -- All checks passed
    RETURN jsonb_build_object(
        'available', true,
        'working_hours', jsonb_build_object('start', v_avail_start::text, 'end', v_avail_end::text),
        'buffer', jsonb_build_object('before', v_buffer_before, 'after', v_buffer_after)
    );
END;
$$;

-- Grant execute to anon and authenticated (read-only availability check)
GRANT EXECUTE ON FUNCTION public.check_staff_slot_availability TO anon;
GRANT EXECUTE ON FUNCTION public.check_staff_slot_availability TO authenticated;

-- =========================================================================
-- 6. Super Admin RLS policies (following existing pattern from 20260619)
-- =========================================================================

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
