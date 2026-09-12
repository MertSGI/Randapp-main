-- ===========================================================================
-- Migration: Phase 2 Staff Scheduling Foundation (R2 Canonical Alignment)
-- Authority: LARI-PROGRAM-V2-EV055-SCHEDULING-FOUNDATION-R2-CORRECTION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 2 (REAL_PAYMENTLESS_PILOT_CORE)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
-- Stacked on: 59bc9a31ca8f14de33f08f1934d38a485c53af21
--
-- Required Corrections Implemented:
-- 1. CANONICAL BRANCH BINDING:
--    Replaced all noncanonical business_branches with canonical public.branches.
--    Replaced direct staff.branch_id and services.branch_id assumptions with
--    canonical public.staff_branches and public.service_branches mappings.
-- 2. COMPOSITE TENANT-SAFE RELATIONSHIPS:
--    New scheduling tables reference staff, services, and branches with composite
--    foreign keys ensuring relational cross-tenant isolation at the DB engine level.
-- 3. CANONICAL HOLIDAY PREDICATE & EFFECTIVE BRANCH RESOLUTION:
--    If p_branch_id IS NULL:
--      - If exactly one active branch exists for the tenant, safe auto-resolve to it.
--      - If multiple active branches exist, fail closed with 'branch_required'.
--    Holiday applies strictly if (bh.branch_id IS NULL OR bh.branch_id = v_effective_branch_id).
-- 4. ISO-WEEKDAY ENCODING (1=Mon..7=Sun):
--    Matches canonical evaluate_booking_slot semantics identically.
-- 5. CANONICAL SERVICE DURATION SOURCE:
--    Public callers cannot shorten service duration. Service duration is loaded strictly
--    from public.services.duration (or appointments.duration_minutes for existing appointments).
-- 6. ASYMMETRIC BUFFER EVALUATION:
--    Distinguishes requested-service buffer from existing appointment buffer.
-- 7. NO DIVERGENT AVAILABILITY ENGINE:
--    Internal helper public.evaluate_schedule_constraints(...) encapsulates
--    time-off, breaks, holidays, and buffers.
--    Extended public.evaluate_booking_slot invokes evaluate_schedule_constraints.
--    public.check_staff_slot_availability is a thin, safe, public wrapper around
--    canonical evaluate_booking_slot.
-- 8. PARTIAL UNIQUE INDEX ON DEFAULT BUFFERS:
--    booking_buffer_rules_tenant_default_idx ON booking_buffer_rules(tenant_id) WHERE service_id IS NULL.
-- 9. SECURITY DEFINER HARDENING:
--    All functions use fixed search_path = pg_catalog, public, extensions.
--    REVOKE EXECUTE FROM PUBLIC on internal functions.
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.staff_time_off
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_time_off (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL,
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

    -- Composite foreign key ensuring staff belongs to tenant
    CONSTRAINT fk_staff_time_off_staff_tenant FOREIGN KEY (staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT staff_time_off_date_range CHECK (end_date >= start_date),
    CONSTRAINT staff_time_off_partial_day CHECK (
        (start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_staff_time_off_tenant ON public.staff_time_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff ON public.staff_time_off(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_dates ON public.staff_time_off(staff_id, start_date, end_date);

CREATE TRIGGER update_staff_time_off_modtime
    BEFORE UPDATE ON public.staff_time_off
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_time_off FROM PUBLIC;
REVOKE ALL ON public.staff_time_off FROM anon;

CREATE POLICY "Tenant admins and staff manage staff_time_off"
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

CREATE POLICY "Super Admins Full Access staff_time_off"
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
-- 2. Table: public.staff_breaks
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_breaks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id    UUID NOT NULL,
    weekday     INTEGER NOT NULL CHECK (weekday >= 1 AND weekday <= 7),  -- Canonical ISO weekday (1=Mon..7=Sun)
    start_time  TIME WITHOUT TIME ZONE NOT NULL,
    end_time    TIME WITHOUT TIME ZONE NOT NULL,
    label       TEXT DEFAULT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_staff_breaks_staff_tenant FOREIGN KEY (staff_id, tenant_id)
        REFERENCES public.staff(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT staff_breaks_time_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_breaks_tenant ON public.staff_breaks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_breaks_staff_weekday ON public.staff_breaks(staff_id, weekday);

CREATE TRIGGER update_staff_breaks_modtime
    BEFORE UPDATE ON public.staff_breaks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_breaks FROM PUBLIC;
REVOKE ALL ON public.staff_breaks FROM anon;

CREATE POLICY "Tenant admins and staff manage staff_breaks"
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

CREATE POLICY "Super Admins Full Access staff_breaks"
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
-- 3. Table: public.booking_buffer_rules
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.booking_buffer_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id      UUID DEFAULT NULL,
    buffer_before   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before >= 0),  -- minutes
    buffer_after    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after >= 0),   -- minutes
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_booking_buffer_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT booking_buffer_service_unique UNIQUE (tenant_id, service_id)
);

-- Guarantees exactly ONE tenant default buffer where service_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS booking_buffer_rules_tenant_default_idx
    ON public.booking_buffer_rules (tenant_id)
    WHERE service_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_buffer_tenant ON public.booking_buffer_rules(tenant_id);

CREATE TRIGGER update_booking_buffer_modtime
    BEFORE UPDATE ON public.booking_buffer_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_buffer_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_buffer_rules FROM PUBLIC;
REVOKE ALL ON public.booking_buffer_rules FROM anon;

CREATE POLICY "Tenant admins manage booking_buffer_rules"
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

CREATE POLICY "Super Admins Full Access booking_buffer_rules"
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
-- 4. Table: public.business_holidays (Bound to canonical public.branches)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.business_holidays (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id   UUID DEFAULT NULL,
    date        DATE NOT NULL,
    name        TEXT NOT NULL,
    name_tr     TEXT DEFAULT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_business_holidays_branch_tenant FOREIGN KEY (branch_id, tenant_id)
        REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT business_holidays_unique UNIQUE (tenant_id, branch_id, date)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_holidays_tenant_all_branches_idx
    ON public.business_holidays (tenant_id, date)
    WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_holidays_tenant ON public.business_holidays(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_holidays_date ON public.business_holidays(tenant_id, date);

CREATE TRIGGER update_business_holidays_modtime
    BEFORE UPDATE ON public.business_holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_holidays FROM PUBLIC;
REVOKE ALL ON public.business_holidays FROM anon;

CREATE POLICY "Tenant admins and staff manage business_holidays"
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

CREATE POLICY "Super Admins Full Access business_holidays"
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
-- 5. Internal Helper: evaluate_schedule_constraints
-- =========================================================================
-- Encapsulates staff time-off, staff breaks, business holidays, and asymmetric buffer intervals.
-- Invoked by canonical evaluate_booking_slot.

CREATE OR REPLACE FUNCTION public.evaluate_schedule_constraints(
    p_tenant_id         UUID,
    p_branch_id         UUID,
    p_service_id        UUID,
    p_staff_id          UUID,
    p_date              DATE,
    p_time              TIME,
    p_duration_minutes  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_weekday           INTEGER;
    v_req_start         TIMESTAMP;
    v_req_end           TIMESTAMP;
    v_req_buffer_before INTEGER := 0;
    v_req_buffer_after  INTEGER := 0;
BEGIN
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    v_req_start := p_date + p_time;
    v_req_end   := v_req_start + (p_duration_minutes || ' minutes')::INTERVAL;

    -- 1. Holiday Check: applies if branch_id IS NULL OR branch_id = p_branch_id
    IF EXISTS (
        SELECT 1 FROM public.business_holidays bh
        WHERE bh.tenant_id = p_tenant_id
          AND bh.is_active = true
          AND (bh.branch_id IS NULL OR bh.branch_id = p_branch_id)
          AND (
              bh.date = p_date
              OR (bh.is_recurring = true AND EXTRACT(MONTH FROM bh.date) = EXTRACT(MONTH FROM p_date)
                  AND EXTRACT(DAY FROM bh.date) = EXTRACT(DAY FROM p_date))
          )
    ) THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'business_holiday');
    END IF;

    -- 2. Staff Time-Off Check (date range & partial day)
    IF EXISTS (
        SELECT 1 FROM public.staff_time_off sto
        WHERE sto.staff_id = p_staff_id
          AND sto.tenant_id = p_tenant_id
          AND sto.is_approved = true
          AND p_date BETWEEN sto.start_date AND sto.end_date
          AND (
              (sto.start_time IS NULL)
              OR
              (p_time < sto.end_time AND (p_time + (p_duration_minutes || ' minutes')::INTERVAL) > sto.start_time)
          )
    ) THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'staff_unavailable');
    END IF;

    -- 3. Staff Break Check (ISO weekday 1..7)
    IF EXISTS (
        SELECT 1 FROM public.staff_breaks sb
        WHERE sb.staff_id = p_staff_id
          AND sb.tenant_id = p_tenant_id
          AND sb.weekday = v_weekday
          AND sb.is_active = true
          AND p_time < sb.end_time
          AND (p_time + (p_duration_minutes || ' minutes')::INTERVAL) > sb.start_time
    ) THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'staff_break');
    END IF;

    -- 4. Asymmetric Buffer Lookup for Requested Service:
    -- Hierarchy: 1) exact service rule, 2) tenant default rule, 3) zero
    SELECT bbr.buffer_before, bbr.buffer_after
    INTO v_req_buffer_before, v_req_buffer_after
    FROM public.booking_buffer_rules bbr
    WHERE bbr.tenant_id = p_tenant_id
      AND bbr.service_id = p_service_id
      AND bbr.is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT bbr.buffer_before, bbr.buffer_after
        INTO v_req_buffer_before, v_req_buffer_after
        FROM public.booking_buffer_rules bbr
        WHERE bbr.tenant_id = p_tenant_id
          AND bbr.service_id IS NULL
          AND bbr.is_active = true
        LIMIT 1;
    END IF;

    v_req_buffer_before := COALESCE(v_req_buffer_before, 0);
    v_req_buffer_after  := COALESCE(v_req_buffer_after, 0);

    RETURN jsonb_build_object(
        'allowed', true,
        'buffer_before', v_req_buffer_before,
        'buffer_after', v_req_buffer_after
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_schedule_constraints(UUID, UUID, UUID, UUID, DATE, TIME, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_schedule_constraints(UUID, UUID, UUID, UUID, DATE, TIME, INTEGER) FROM anon;

-- =========================================================================
-- 6. Canonical Integration: Extended evaluate_booking_slot
-- =========================================================================
-- Seamlessly incorporates schedule constraints and asymmetric buffered collisions
-- while preserving all canonical release, branch, staff-service, timezone, and concurrency semantics.

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

    -- 5. Validate Schedule Constraints (Holidays, Time-Off, Breaks, Buffers)
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

    v_req_buf_before := (v_sched_res->>'buffer_before')::INTEGER;
    v_req_buf_after  := (v_sched_res->>'buffer_after')::INTEGER;

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

    -- 8. Validate Overlapping Active Appointments with Asymmetric Buffer Consideration
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

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'duration_minutes', v_svc_duration,
        'slot_start', p_time::text,
        'slot_end', (p_time + (v_svc_duration || ' minutes')::INTERVAL)::text
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('allowed', false, 'reason_code', 'temporary_failure', 'duration_minutes', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM anon;

-- =========================================================================
-- 7. Public Wrapper: check_staff_slot_availability
-- =========================================================================
-- Thin, safe, public-facing wrapper that delegates strictly to canonical evaluate_booking_slot.
-- Resolves effective branch canonical logic:
-- - If branch supplied: uses it.
-- - If branch NOT supplied:
--     * If tenant has exactly 1 active branch, auto-resolves to it.
--     * If tenant has >1 active branches, fails closed with 'branch_required'.

CREATE OR REPLACE FUNCTION public.check_staff_slot_availability(
    p_tenant_id     UUID,
    p_staff_id      UUID,
    p_service_id    UUID,
    p_date          DATE,
    p_start_time    TIME,
    p_branch_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_effective_branch_id UUID := p_branch_id;
    v_branch_count        INTEGER;
    v_eval_res            JSONB;
BEGIN
    -- Branch resolution logic
    IF v_effective_branch_id IS NULL THEN
        SELECT count(*), min(id)
        INTO v_branch_count, v_effective_branch_id
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_active = true;

        IF v_branch_count = 0 THEN
            RETURN jsonb_build_object('available', false, 'reason', 'no_active_branches');
        ELSIF v_branch_count > 1 THEN
            RETURN jsonb_build_object('available', false, 'reason', 'branch_required');
        END IF;
    END IF;

    -- Delegate strictly to canonical evaluator
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id,
        v_effective_branch_id,
        p_service_id,
        p_staff_id,
        p_date,
        p_start_time
    );

    IF (v_eval_res->>'allowed')::BOOLEAN IS TRUE THEN
        RETURN jsonb_build_object(
            'available', true,
            'duration_minutes', (v_eval_res->>'duration_minutes')::INTEGER,
            'slot_start', v_eval_res->>'slot_start',
            'slot_end', v_eval_res->>'slot_end'
        );
    ELSE
        RETURN jsonb_build_object(
            'available', false,
            'reason', v_eval_res->>'reason_code'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_staff_slot_availability(UUID, UUID, UUID, DATE, TIME, UUID) TO authenticated;

