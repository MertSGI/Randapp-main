-- ===========================================================================
-- Ported from 72911e4: 20260920_phase3_resource_capacity_foundation.sql
-- Conflict-free sequential prefix: 20260912 (ADIM-033 / Faz D1)
-- Reconciled with HEAD 20260903_public_booking_ratelimit_spam_and_otp_contract.sql (15-arg canonical signature)
--
-- Migration: Phase 3 Resource & Capacity Foundation (R1 Hardened)
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-RESOURCE-CAPACITY-FOUNDATION-20260911-01
-- Correction Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- R1 Hardening Requirements:
-- 1. Atomic booking transaction: resource availability evaluation AND allocation happen in the SAME
--    transactional boundary within create_public_booking / create_booking_with_resources.
-- 2. Deterministic advisory and row-level locking: stable resource-id order, preventing check-then-allocate races.
-- 3. Restrict allocate_appointment_resource: service_role only.
-- 4. Complete allocation plan for ALL mandatory service_resource_requirements (JSON array of allocated resources).
-- 5. Database-level composite tenant integrity constraints:
--    - (resource_id, tenant_id)
--    - (appointment_id, tenant_id)
--    - (service_id, tenant_id)
--    - (branch_id, tenant_id)
-- 6. Preserves complete EV055-R3 scheduling semantics (time-off, breaks, business holidays, asymmetric buffers,
--    canonical branches, availability rules, timezone-aware past checks) AND HEAD's 15-arg Pilot 4 rate-limit/OTP security.
-- 7. Bounded administrative RPCs with explicit role allowlists (tenant_owner, super_admin):
--    - admin_create_resource, admin_update_resource
--    - admin_create_resource_block
--    - admin_set_service_resource_requirement
-- ===========================================================================

-- =========================================================================
-- 0. Prerequisite: composite unique constraint on public.appointments
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_appointments_id_tenant'
    ) THEN
        ALTER TABLE public.appointments
            ADD CONSTRAINT uq_appointments_id_tenant UNIQUE (id, tenant_id);
    END IF;
END $$;

-- =========================================================================
-- 1. Table: public.resources
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL,
    name            VARCHAR(120) NOT NULL,
    resource_type   VARCHAR(60) NOT NULL CHECK (resource_type IN ('room', 'chair', 'station', 'equipment', 'facility', 'shared')),
    capacity        INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_resources_branch_tenant FOREIGN KEY (branch_id, tenant_id)
        REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_resources_tenant_branch_name UNIQUE (tenant_id, branch_id, name),
    CONSTRAINT uq_resources_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_resources_tenant_branch ON public.resources(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_resources_active ON public.resources(tenant_id, is_active);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resources FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read resources"
    ON public.resources FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = resources.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 2. Table: public.service_resource_requirements
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.service_resource_requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL,
    resource_id     UUID DEFAULT NULL,
    resource_type   VARCHAR(60) DEFAULT NULL CHECK (resource_type IN ('room', 'chair', 'station', 'equipment', 'facility', 'shared')),
    required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity >= 1),
    is_mandatory    BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_srr_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_srr_resource_tenant FOREIGN KEY (resource_id, tenant_id)
        REFERENCES public.resources(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT chk_srr_target CHECK (resource_id IS NOT NULL OR resource_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_srr_tenant_service ON public.service_resource_requirements(tenant_id, service_id);

ALTER TABLE public.service_resource_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_resource_requirements FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read service_resource_requirements"
    ON public.service_resource_requirements FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = service_resource_requirements.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 3. Table: public.resource_blocks
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.resource_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    resource_id     UUID NOT NULL,
    start_date      DATE NOT NULL,
    start_time      TIME WITHOUT TIME ZONE NOT NULL,
    end_date        DATE NOT NULL,
    end_time        TIME WITHOUT TIME ZONE NOT NULL,
    reason          TEXT DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_resource_blocks_resource_tenant FOREIGN KEY (resource_id, tenant_id)
        REFERENCES public.resources(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT chk_resource_block_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_resource_block_times CHECK (
        (end_date > start_date) OR (end_date = start_date AND end_time > start_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_resource_blocks_tenant_resource ON public.resource_blocks(tenant_id, resource_id, start_date);

ALTER TABLE public.resource_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_blocks FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read resource_blocks"
    ON public.resource_blocks FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = resource_blocks.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 4. Table: public.appointment_resources
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.appointment_resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id  UUID NOT NULL,
    resource_id     UUID NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_appointment_resources_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_resources_resource_tenant FOREIGN KEY (resource_id, tenant_id)
        REFERENCES public.resources(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_appointment_resource UNIQUE (appointment_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_resources_tenant_resource ON public.appointment_resources(tenant_id, resource_id);

ALTER TABLE public.appointment_resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_resources FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff read appointment_resources"
    ON public.appointment_resources FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = appointment_resources.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 5. Helper Function: public.evaluate_and_lock_resource_plan
-- =========================================================================

CREATE OR REPLACE FUNCTION public.evaluate_and_lock_resource_plan(
    p_tenant_id                UUID,
    p_branch_id                UUID,
    p_service_id               UUID,
    p_date                     DATE,
    p_start_time               TIME,
    p_duration_minutes         INTEGER,
    p_exclude_appointment_id   UUID DEFAULT NULL,
    p_for_update               BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_req_record               RECORD;
    v_req_start                TIMESTAMP;
    v_req_end                  TIMESTAMP;
    v_resource                 RECORD;
    v_allocated_qty            INTEGER;
    v_planned_qty              INTEGER;
    v_candidate_found          BOOLEAN;
    v_plan                     JSONB := '[]'::jsonb;
    v_resource_lock_key        BIGINT;
BEGIN
    v_req_start := p_date + p_start_time;
    v_req_end   := v_req_start + (p_duration_minutes || ' minutes')::INTERVAL;

    FOR v_req_record IN
        SELECT srr.id, srr.resource_id, srr.resource_type, srr.required_quantity, srr.is_mandatory
        FROM public.service_resource_requirements srr
        WHERE srr.tenant_id = p_tenant_id
          AND srr.service_id = p_service_id
        ORDER BY (srr.resource_id IS NULL) ASC, srr.id ASC
    LOOP
        v_candidate_found := false;

        FOR v_resource IN
            SELECT r.id, r.capacity, r.name
            FROM public.resources r
            WHERE r.tenant_id = p_tenant_id
              AND r.branch_id = p_branch_id
              AND r.is_active = true
              AND (v_req_record.resource_id IS NULL OR r.id = v_req_record.resource_id)
              AND (v_req_record.resource_type IS NULL OR r.resource_type = v_req_record.resource_type)
            ORDER BY r.id ASC
        LOOP
            IF p_for_update THEN
                v_resource_lock_key := hashtextextended(p_tenant_id::text || ':res:' || v_resource.id::text || ':' || p_date::text, 0);
                PERFORM pg_advisory_xact_lock(v_resource_lock_key);
            END IF;

            -- Check 1: Maintenance / Out-of-service block conflicts
            IF EXISTS (
                SELECT 1 FROM public.resource_blocks rb
                WHERE rb.tenant_id = p_tenant_id
                  AND rb.resource_id = v_resource.id
                  AND (rb.start_date + rb.start_time) < v_req_end
                  AND (rb.end_date + rb.end_time) > v_req_start
            ) THEN
                CONTINUE;
            END IF;

            -- Check 2: Active appointment allocation collisions vs resource capacity
            SELECT COALESCE(SUM(ar.quantity), 0)
            INTO v_allocated_qty
            FROM public.appointment_resources ar
            JOIN public.appointments a ON a.id = ar.appointment_id
            WHERE ar.tenant_id = p_tenant_id
              AND ar.resource_id = v_resource.id
              AND a.appointment_date = p_date
              AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
              AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show')
              AND (a.appointment_date + a.appointment_time) < v_req_end
              AND ((a.appointment_date + a.appointment_time) + (COALESCE(a.duration_minutes, 30) || ' minutes')::INTERVAL) > v_req_start;

            -- Check 3: Quantities already planned for this resource within the current allocation_plan
            SELECT COALESCE(SUM((elem->>'quantity')::INTEGER), 0)
            INTO v_planned_qty
            FROM jsonb_array_elements(v_plan) elem
            WHERE (elem->>'resource_id')::UUID = v_resource.id;

            IF (v_allocated_qty + v_planned_qty + v_req_record.required_quantity) <= v_resource.capacity THEN
                v_candidate_found := true;
                IF EXISTS (
                    SELECT 1 FROM jsonb_array_elements(v_plan) elem
                    WHERE (elem->>'resource_id')::UUID = v_resource.id
                ) THEN
                    SELECT COALESCE(jsonb_agg(
                        CASE
                            WHEN (elem->>'resource_id')::UUID = v_resource.id THEN
                                jsonb_build_object(
                                    'requirement_id', elem->>'requirement_id',
                                    'requirement_ids', COALESCE(elem->'requirement_ids', jsonb_build_array(elem->>'requirement_id')) || jsonb_build_array(v_req_record.id),
                                    'resource_id', v_resource.id,
                                    'quantity', (elem->>'quantity')::INTEGER + v_req_record.required_quantity,
                                    'resource_name', v_resource.name
                                )
                            ELSE elem
                        END
                    ), '[]'::jsonb)
                    INTO v_plan
                    FROM jsonb_array_elements(v_plan) elem;
                ELSE
                    v_plan := v_plan || jsonb_build_object(
                        'requirement_id', v_req_record.id,
                        'requirement_ids', jsonb_build_array(v_req_record.id),
                        'resource_id', v_resource.id,
                        'quantity', v_req_record.required_quantity,
                        'resource_name', v_resource.name
                    );
                END IF;
                EXIT;
            END IF;
        END LOOP;

        IF v_req_record.is_mandatory AND NOT v_candidate_found THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'resource_unavailable',
                'resource_type', v_req_record.resource_type,
                'required_quantity', v_req_record.required_quantity,
                'allocation_plan', '[]'::jsonb
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'allocation_plan', v_plan
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_and_lock_resource_plan(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_lock_resource_plan(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID, BOOLEAN) TO service_role;

-- Backward compatible evaluation wrapper for read-only checks
CREATE OR REPLACE FUNCTION public.evaluate_resource_availability(
    p_tenant_id                UUID,
    p_branch_id                UUID,
    p_service_id               UUID,
    p_date                     DATE,
    p_start_time               TIME,
    p_duration_minutes         INTEGER,
    p_exclude_appointment_id   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.evaluate_and_lock_resource_plan(
        p_tenant_id,
        p_branch_id,
        p_service_id,
        p_date,
        p_start_time,
        p_duration_minutes,
        p_exclude_appointment_id,
        FALSE
    );

    IF NOT (v_res->>'allowed')::boolean THEN
        RETURN v_res;
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'resource_id', v_res->'allocation_plan'->0->>'resource_id',
        'allocation_plan', v_res->'allocation_plan'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_resource_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_resource_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) TO authenticated, service_role;

-- =========================================================================
-- 6. Canonical Integration: Extended evaluate_booking_slot
-- =========================================================================

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

    -- 8. Validate Overlapping Active Appointments
    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show')
          AND (a.appointment_date + a.appointment_time) < (v_req_end + (v_req_buf_after || ' minutes')::INTERVAL)
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(a.duration_minutes, 30) || ' minutes')::INTERVAL) > (v_req_start - (v_req_buf_before || ' minutes')::INTERVAL)
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

-- =========================================================================
-- 7. Internal Service-Role-Only Allocator: allocate_appointment_resource
-- =========================================================================

CREATE OR REPLACE FUNCTION public.allocate_appointment_resource(
    p_tenant_id        UUID,
    p_appointment_id   UUID,
    p_resource_id      UUID,
    p_quantity         INTEGER DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.appointments WHERE id = p_appointment_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'APPOINTMENT_TENANT_MISMATCH' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.resources WHERE id = p_resource_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'RESOURCE_TENANT_MISMATCH' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.appointment_resources (tenant_id, appointment_id, resource_id, quantity)
    VALUES (p_tenant_id, p_appointment_id, p_resource_id, COALESCE(p_quantity, 1))
    ON CONFLICT (appointment_id, resource_id) DO UPDATE
    SET quantity = EXCLUDED.quantity;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_appointment_resource(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_appointment_resource(UUID, UUID, UUID, INTEGER) TO service_role;

-- =========================================================================
-- 8. Atomic Canonical Booking Lifecycle with Resource Allocation (ENGINE COUNT = 1)
-- =========================================================================
-- Preserves HEAD's canonical 15-parameter create_public_booking signature (Pilot 4 rate-limit,
-- E.164 phone normalization, idempotency fingerprint/OTP token conflict checks, single-use OTP
-- challenge verification & consumption) while integrating Phase 3 deterministic resource locking
-- and atomic resource allocation BEFORE commercial quota consumption (ZERO_QUOTA_LEAKAGE).
-- Drops any 12-arg / 13-arg legacy overloads so ONLY ONE hardened function exists in pg_proc.

DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug                   text,
    p_service_id             uuid,
    p_staff_id               uuid,
    p_appointment_date       date,
    p_appointment_time       time,
    p_customer_name          text,
    p_customer_email         text,
    p_customer_phone         text,
    p_required_consent       boolean,
    p_marketing_consent      boolean DEFAULT false,
    p_reminder_consent       boolean DEFAULT false,
    p_idempotency_key        text    DEFAULT NULL,
    p_branch_id              uuid    DEFAULT NULL,
    p_otp_verification_token text    DEFAULT NULL,
    p_client_fingerprint     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id               uuid;
    v_tenant_status           text;
    v_onboarding_status       text;
    v_public_site_status      text;
    v_effective_branch        uuid := p_branch_id;
    v_active_branches         uuid[];
    v_eval_res                jsonb;
    v_svc_duration            integer;
    v_customer_id             uuid;
    v_appointment_id          uuid;
    v_token                   text;
    v_token_hash              text;
    v_expires_at              timestamptz;
    v_existing_branch_id      uuid;
    v_lock_key                bigint;
    v_stage                   text := 'init';
    v_elig                    jsonb;
    v_action                  jsonb;
    v_period_key              text;
    v_usage_res               jsonb;
    v_rl_res                  jsonb;
    v_otp_tok_hash            text := NULL;
    v_otp_challenge           RECORD;
    v_require_otp             boolean := false;
    v_challenge_to_consume_id uuid := NULL;
    v_idemp_key_trimmed       text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
    v_clean_phone             text;
    v_clean_email             text;
    v_req_fingerprint         text;
    v_existing_idemp          RECORD;
    v_res_eval                jsonb;
    v_plan_item               jsonb;
    v_res_id                  uuid;
    v_res_qty                 integer;
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required', 'reasonCode', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data', 'reasonCode', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data', 'reasonCode', 'invalid_customer_data');
    END IF;

    IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' THEN
        v_clean_phone := public.normalize_public_booking_phone(p_customer_phone);
        IF v_clean_phone IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_phone', 'reasonCode', 'invalid_phone');
        END IF;
    ELSE
        v_clean_phone := NULL;
    END IF;

    v_clean_email := NULLIF(lower(trim(COALESCE(p_customer_email, ''))), '');

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status, COALESCE(require_otp_for_booking, false)
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status, v_require_otp
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'reasonCode', 'invalid_tenant');
    END IF;

    -- Gate 3b: If OTP policy is required, customer phone is strictly mandatory
    IF v_require_otp AND v_clean_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_phone', 'reasonCode', 'invalid_phone');
    END IF;

    IF v_clean_phone IS NULL THEN
        IF v_clean_email IS NULL OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data', 'reasonCode', 'invalid_customer_data');
        END IF;
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 4: Commercial Eligibility (H1C)
    v_stage := 'commercial_eligibility';
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 4b: Core Booking Feature Gate (H1C)
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Branch Resolution (read-only validation)
    v_stage := 'branch_resolution';
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required', 'reasonCode', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'reasonCode', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'reasonCode', 'invalid_branch');
        END IF;
    END IF;

    -- Canonical Request & OTP Token Fingerprints for Idempotency Integrity
    IF p_otp_verification_token IS NOT NULL AND trim(p_otp_verification_token) != '' THEN
        v_otp_tok_hash := encode(sha256(trim(p_otp_verification_token)::bytea), 'hex');
    END IF;

    v_req_fingerprint := encode(sha256(
        jsonb_build_object(
            'tenant_id', v_tenant_id::text,
            'slug', trim(p_slug),
            'service_id', p_service_id::text,
            'staff_id', p_staff_id::text,
            'requested_branch_id', COALESCE(p_branch_id::text, ''),
            'effective_branch_id', v_effective_branch::text,
            'appointment_date', p_appointment_date::text,
            'appointment_time', p_appointment_time::text,
            'customer_name', trim(p_customer_name),
            'customer_email', COALESCE(v_clean_email, ''),
            'customer_phone', COALESCE(v_clean_phone, ''),
            'required_consent', COALESCE(p_required_consent, false),
            'marketing_consent', COALESCE(p_marketing_consent, false),
            'reminder_consent', COALESCE(p_reminder_consent, false)
        )::text::bytea
    ), 'hex');

    -- Concurrency Lock Phase 1: Idempotency key lock before replay/conflict inspection
    v_stage := 'idempotency_lock';
    IF v_idemp_key_trimmed IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('idemp:' || v_tenant_id::text || ':' || v_idemp_key_trimmed, 0)
        );
    END IF;

    -- Gate 4c: Idempotency Replay & Conflict Verification (MUST precede rate-limit & OTP token checks!)
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF v_idemp_key_trimmed IS NOT NULL THEN
        SELECT appointment_id, request_fingerprint, otp_token_hash
        INTO v_existing_idemp
        FROM public.public_booking_idempotency
        WHERE idempotency_key = v_idemp_key_trimmed AND tenant_id = v_tenant_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_idemp.request_fingerprint IS DISTINCT FROM v_req_fingerprint
               OR v_existing_idemp.otp_token_hash IS DISTINCT FROM v_otp_tok_hash THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'reason_code', 'idempotency_conflict',
                    'reasonCode', 'idempotency_conflict'
                );
            END IF;

            SELECT branch_id INTO v_existing_branch_id
            FROM public.appointments
            WHERE id = v_existing_idemp.appointment_id AND tenant_id = v_tenant_id;

            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_idemp.appointment_id
              AND tenant_id = v_tenant_id::text
              AND expires_at > now();

            v_token      := encode(sha256((gen_random_uuid()::text || '-' || clock_timestamp()::text || '-' || random()::text)::bytea), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id, appointment_id, token_hash, expires_at
            ) VALUES (
                v_tenant_id::text, v_existing_idemp.appointment_id, v_token_hash, v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_idemp.appointment_id,
                'appointmentId',  v_existing_idemp.appointment_id,
                'manage_token',   v_token,
                'manageToken',    v_token,
                'branch_id',      v_existing_branch_id,
                'reason_code',    'ok',
                'reasonCode',     'ok'
            );
        END IF;
    END IF;

    -- Gate 5: Server-Side Rate-Limit & Abuse Protection (V1-WQ-07)
    v_stage := 'rate_limit_evaluation';
    v_rl_res := public.evaluate_and_record_public_booking_rate_limit(
        v_tenant_id,
        p_customer_phone,
        p_client_fingerprint,
        p_service_id,
        p_appointment_date,
        p_customer_email
    );

    IF NOT (v_rl_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', v_rl_res->>'reason_code',
            'reasonCode', v_rl_res->>'reason_code',
            'detail', v_rl_res->>'detail'
        );
    END IF;

    -- Gate 6: Secure OTP Policy & Single-Use Token Verification (V1-WQ-07)
    v_stage := 'otp_policy_and_token_verification';
    IF v_require_otp AND (p_otp_verification_token IS NULL OR trim(p_otp_verification_token) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'otp_required',
            'reasonCode', 'otp_required',
            'message', 'Bu salon icin rezervasyon oncesi dogrulama kodu zorunludur.'
        );
    END IF;

    IF v_otp_tok_hash IS NOT NULL THEN
        v_stage := 'otp_token_verification';

        SELECT id, tenant_id, customer_phone, status, expires_at
        INTO v_otp_challenge
        FROM public.public_booking_otp_challenges
        WHERE verification_token_hash = v_otp_tok_hash
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'otp_token_invalid_or_consumed', 'reasonCode', 'otp_token_invalid_or_consumed');
        END IF;

        IF v_otp_challenge.tenant_id != v_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_mismatch', 'reasonCode', 'tenant_mismatch');
        END IF;

        IF v_otp_challenge.status != 'verified' OR v_otp_challenge.expires_at <= now() THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'otp_token_invalid_or_consumed', 'reasonCode', 'otp_token_invalid_or_consumed');
        END IF;

        IF v_otp_challenge.customer_phone != v_clean_phone THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'phone_mismatch', 'reasonCode', 'phone_mismatch');
        END IF;

        v_challenge_to_consume_id := v_otp_challenge.id;
    END IF;

    -- Concurrency Lock Phase 4: Staff/date lock (monotonic after idemp -> rate_limit -> OTP FOR UPDATE)
    v_stage := 'staff_slot_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Gate 7: Shared Slot Evaluator Engine Execution (Schedule Constraints & Availability)
    v_stage := 'evaluate_booking_slot';
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_tenant_id,
        p_branch_id  => v_effective_branch,
        p_service_id => p_service_id,
        p_staff_id   => p_staff_id,
        p_date       => p_appointment_date,
        p_time       => p_appointment_time
    );

    IF NOT (v_eval_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', v_eval_res->>'reason_code',
            'reasonCode', v_eval_res->>'reason_code'
        );
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Gate 8: Resource Plan Locking (Transactional Advisory Locks in Stable Order)
    v_stage := 'resource_plan_locking';
    v_res_eval := public.evaluate_and_lock_resource_plan(
        v_tenant_id,
        v_effective_branch,
        p_service_id,
        p_appointment_date,
        p_appointment_time,
        v_svc_duration,
        NULL,
        TRUE
    );

    IF NOT (v_res_eval->>'allowed')::boolean THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', v_res_eval->>'reason_code',
            'reasonCode', v_res_eval->>'reason_code'
        );
    END IF;

    -- Gate 9: Monthly Appointment Quota (H1C) - Executed only after all validation and locking succeed!
    -- Ensures ZERO_QUOTA_LEAKAGE_ON_FAILED_BOOKING.
    v_stage := 'appointment_quota';
    v_period_key := public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments');
    v_usage_res := public.consume_commercial_usage(v_tenant_id, 'max_monthly_appointments', v_period_key);
    IF NOT (v_usage_res->>'success')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 10: Customer Upsert
    v_stage := 'customer_upsert';
    IF v_clean_phone IS NOT NULL THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND (phone = v_clean_phone OR public.normalize_public_booking_phone(phone) = v_clean_phone) LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND v_clean_email IS NOT NULL THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND lower(trim(COALESCE(email, ''))) = v_clean_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_tenant_id, trim(p_customer_name), v_clean_email, v_clean_phone)
        RETURNING id INTO v_customer_id;
    END IF;

    -- Gate 10b: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 11: Appointment Creation
    v_stage := 'appointment_insert';
    INSERT INTO public.appointments (
        tenant_id, branch_id, customer_id, user_name, user_email, phone,
        service_id, staff_id, appointment_date, appointment_time,
        duration_minutes, status
    ) VALUES (
        v_tenant_id, v_effective_branch, v_customer_id, trim(p_customer_name),
        v_clean_email, v_clean_phone, p_service_id, p_staff_id,
        p_appointment_date, p_appointment_time, v_svc_duration, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 11b: Atomic Resource Allocation
    v_stage := 'resource_allocation';
    FOR v_plan_item IN SELECT * FROM jsonb_array_elements(v_res_eval->'allocation_plan')
    LOOP
        v_res_id  := (v_plan_item->>'resource_id')::uuid;
        v_res_qty := COALESCE((v_plan_item->>'quantity')::integer, 1);

        INSERT INTO public.appointment_resources (tenant_id, appointment_id, resource_id, quantity)
        VALUES (v_tenant_id, v_appointment_id, v_res_id, v_res_qty);
    END LOOP;

    -- Gate 11c: Atomically consume the OTP verification token now that appointment is guaranteed
    v_stage := 'otp_consume';
    IF v_challenge_to_consume_id IS NOT NULL THEN
        UPDATE public.public_booking_otp_challenges
        SET status = 'consumed',
            consumed_at = now(),
            updated_at = now()
        WHERE id = v_challenge_to_consume_id;
    END IF;

    -- Gate 12: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(sha256((gen_random_uuid()::text || '-' || clock_timestamp()::text || '-' || random()::text)::bytea), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 13: Idempotency Record
    v_stage := 'idempotency_record';
    IF v_idemp_key_trimmed IS NOT NULL THEN
        INSERT INTO public.public_booking_idempotency (
            idempotency_key, tenant_id, appointment_id, expires_at,
            request_fingerprint, otp_token_hash
        ) VALUES (
            v_idemp_key_trimmed, v_tenant_id, v_appointment_id, now() + interval '24 hours',
            v_req_fingerprint, v_otp_tok_hash
        );
    END IF;

    RETURN jsonb_build_object(
        'success',         true,
        'appointment_id',  v_appointment_id,
        'appointmentId',   v_appointment_id,
        'manage_token',    v_token,
        'manageToken',     v_token,
        'branch_id',       v_effective_branch,
        'reason_code',     'ok',
        'reasonCode',      'ok',
        'allocation_plan', v_res_eval->'allocation_plan'
    );
EXCEPTION WHEN OTHERS THEN
    -- If failure occurred after quota consumption, raise exception to ensure total transaction rollback
    -- and prevent quota leakage!
    IF v_stage IN ('customer_upsert', 'consent_ledger_insert', 'appointment_insert', 'resource_allocation', 'otp_consume', 'token_generation', 'idempotency_record') THEN
        RAISE EXCEPTION 'BOOKING_MUTATION_FAILED: Stage %, Error: %', v_stage, SQLERRM;
    END IF;
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'temporary_failure',
        'reasonCode', 'temporary_failure',
        'debug_stage', v_stage,
        'debug_sqlerrm', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text) TO anon, authenticated, service_role;

-- Canonical Internal / Service Helper: compose into create_booking_with_resources as backward compatibility wrapper
CREATE OR REPLACE FUNCTION public.create_booking_with_resources(
    p_tenant_id         UUID,
    p_branch_id         UUID,
    p_service_id        UUID,
    p_staff_id          UUID,
    p_appointment_date  DATE,
    p_appointment_time  TIME,
    p_customer_id       UUID,
    p_customer_name     TEXT,
    p_customer_email    TEXT,
    p_customer_phone    TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_slug TEXT;
BEGIN
    SELECT slug INTO v_slug FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    -- Delegate to canonical unified booking engine
    RETURN public.create_public_booking(
        p_slug              => v_slug,
        p_service_id        => p_service_id,
        p_staff_id          => p_staff_id,
        p_appointment_date  => p_appointment_date,
        p_appointment_time  => p_appointment_time,
        p_customer_name     => p_customer_name,
        p_customer_email    => p_customer_email,
        p_customer_phone    => p_customer_phone,
        p_required_consent  => true,
        p_branch_id         => p_branch_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_with_resources(UUID, UUID, UUID, UUID, DATE, TIME, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_with_resources(UUID, UUID, UUID, UUID, DATE, TIME, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- =========================================================================
-- 9. Administrative RPCs with Role Allowlists (tenant_owner, super_admin)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_create_resource(
    p_tenant_id     UUID,
    p_branch_id     UUID,
    p_name          TEXT,
    p_resource_type TEXT,
    p_capacity      INTEGER DEFAULT 1,
    p_metadata      JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_role   TEXT;
    v_caller_tenant UUID;
    v_new_id        UUID;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS NULL OR (v_caller_role <> 'super_admin' AND (v_caller_role <> 'tenant_owner' OR v_caller_tenant <> p_tenant_id)) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'INVALID_BRANCH_FOR_TENANT' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.resources (tenant_id, branch_id, name, resource_type, capacity, metadata)
    VALUES (p_tenant_id, p_branch_id, trim(p_name), p_resource_type, GREATEST(1, COALESCE(p_capacity, 1)), COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'resource_id', v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_resource(
    p_tenant_id     UUID,
    p_resource_id   UUID,
    p_name          TEXT DEFAULT NULL,
    p_capacity      INTEGER DEFAULT NULL,
    p_is_active     BOOLEAN DEFAULT NULL,
    p_metadata      JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_role   TEXT;
    v_caller_tenant UUID;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS NULL OR (v_caller_role <> 'super_admin' AND (v_caller_role <> 'tenant_owner' OR v_caller_tenant <> p_tenant_id)) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    UPDATE public.resources
    SET name        = COALESCE(trim(p_name), name),
        capacity    = COALESCE(p_capacity, capacity),
        is_active   = COALESCE(p_is_active, is_active),
        metadata    = COALESCE(p_metadata, metadata),
        updated_at  = NOW()
    WHERE id = p_resource_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'resource_not_found');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_resource_block(
    p_tenant_id     UUID,
    p_resource_id   UUID,
    p_start_date    DATE,
    p_start_time    TIME,
    p_end_date      DATE,
    p_end_time      TIME,
    p_reason        TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_role   TEXT;
    v_caller_tenant UUID;
    v_block_id      UUID;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS NULL OR (v_caller_role <> 'super_admin' AND (v_caller_role <> 'tenant_owner' OR v_caller_tenant <> p_tenant_id)) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.resources WHERE id = p_resource_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'INVALID_RESOURCE' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.resource_blocks (tenant_id, resource_id, start_date, start_time, end_date, end_time, reason)
    VALUES (p_tenant_id, p_resource_id, p_start_date, p_start_time, p_end_date, p_end_time, trim(p_reason))
    RETURNING id INTO v_block_id;

    RETURN jsonb_build_object('success', true, 'block_id', v_block_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_service_resource_requirement(
    p_tenant_id         UUID,
    p_service_id        UUID,
    p_resource_id       UUID DEFAULT NULL,
    p_resource_type     TEXT DEFAULT NULL,
    p_required_quantity INTEGER DEFAULT 1,
    p_is_mandatory      BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_caller_role   TEXT;
    v_caller_tenant UUID;
    v_req_id        UUID;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF v_caller_role IS NULL OR (v_caller_role <> 'super_admin' AND (v_caller_role <> 'tenant_owner' OR v_caller_tenant <> p_tenant_id)) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'INVALID_SERVICE' USING ERRCODE = '23503';
    END IF;

    IF p_resource_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resources WHERE id = p_resource_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'INVALID_RESOURCE' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.service_resource_requirements (tenant_id, service_id, resource_id, resource_type, required_quantity, is_mandatory)
    VALUES (p_tenant_id, p_service_id, p_resource_id, p_resource_type, GREATEST(1, COALESCE(p_required_quantity, 1)), COALESCE(p_is_mandatory, true))
    RETURNING id INTO v_req_id;

    RETURN jsonb_build_object('success', true, 'requirement_id', v_req_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_resource(UUID, UUID, TEXT, TEXT, INTEGER, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_resource(UUID, UUID, TEXT, INTEGER, BOOLEAN, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_resource_block(UUID, UUID, DATE, TIME, DATE, TIME, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_service_resource_requirement(UUID, UUID, UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_resource(UUID, UUID, TEXT, TEXT, INTEGER, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_resource(UUID, UUID, TEXT, INTEGER, BOOLEAN, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_resource_block(UUID, UUID, DATE, TIME, DATE, TIME, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_service_resource_requirement(UUID, UUID, UUID, TEXT, INTEGER, BOOLEAN) TO authenticated, service_role;
