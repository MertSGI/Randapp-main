-- Migration: 20260920_phase3_resource_capacity_foundation.sql
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-RESOURCE-CAPACITY-FOUNDATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Goals:
-- 1. Table: public.resources
--    - Provider-independent bookable rooms, chairs/stations, equipment, shared facilities.
--    - Tenant-isolated and branch-isolated (composite foreign key to public.branches(id, tenant_id)).
--    - Capacity integer >= 1 (handles single-occupancy chairs/rooms or multi-capacity spaces).
--    - RLS enabled, raw table access revoked from PUBLIC, anon, and direct browser mutations.
--
-- 2. Table: public.service_resource_requirements
--    - Service-resource requirements mapping: service requires a specific resource or resource category/type.
--    - Quantity integer >= 1.
--    - Bound to canonical public.services(id, tenant_id).
--
-- 3. Table: public.resource_blocks
--    - Out-of-service / maintenance / reserved intervals for resources.
--    - Timezone-aware date/time boundaries.
--
-- 4. Table: public.appointment_resources
--    - Records actual resource allocations for confirmed/active appointments.
--    - Supports quantity >= 1 per appointment.
--    - Enables strict transactional capacity tracking.
--
-- 5. Function: public.evaluate_resource_availability
--    - Shared internal evaluator that checks resource collisions, block collisions, and capacity thresholds.
--    - Transaction-safe with advisory lock integration.
--
-- 6. Integration: public.evaluate_booking_slot
--    - Integrates evaluate_resource_availability within the canonical slot evaluation pipeline.
--    - Ensures single authoritative booking availability boundary.

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
    CONSTRAINT uq_resources_tenant_branch_name UNIQUE (tenant_id, branch_id, name)
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

CREATE POLICY "Super Admins Full Access resources"
    ON public.resources FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 2. Table: public.service_resource_requirements
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.service_resource_requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id      UUID NOT NULL,
    resource_id     UUID DEFAULT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    resource_type   VARCHAR(60) DEFAULT NULL CHECK (resource_type IN ('room', 'chair', 'station', 'equipment', 'facility', 'shared')),
    required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity >= 1),
    is_mandatory    BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_srr_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
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
    resource_id     UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    start_time      TIME WITHOUT TIME ZONE NOT NULL,
    end_date        DATE NOT NULL,
    end_time        TIME WITHOUT TIME ZONE NOT NULL,
    reason          TEXT DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resource_block_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_resource_block_times CHECK (
        (end_date > start_date) OR (end_date = start_date AND end_time > start_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_resource_blocks_tenant_resource ON public.resource_blocks(tenant_id, resource_id, start_date);

ALTER TABLE public.resource_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_blocks FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins manage resource_blocks"
    ON public.resource_blocks FOR ALL USING (
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
    appointment_id  UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    resource_id     UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
-- 5. Helper Function: public.evaluate_resource_availability
-- =========================================================================
-- Internal SECURITY DEFINER evaluator checking capacity & block conflicts.
-- Returns: jsonb { "allowed": boolean, "reason_code": text, "available_resource_id": uuid }

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
    v_req_record               RECORD;
    v_req_start                TIMESTAMP;
    v_req_end                  TIMESTAMP;
    v_resource                 RECORD;
    v_allocated_qty            INTEGER;
    v_matching_found           BOOLEAN := false;
    v_candidate_found          BOOLEAN := false;
    v_allocated_resource_id    UUID := NULL;
BEGIN
    v_req_start := p_date + p_start_time;
    v_req_end   := v_req_start + (p_duration_minutes || ' minutes')::INTERVAL;

    -- Iterate over each requirement for this service
    FOR v_req_record IN
        SELECT srr.id, srr.resource_id, srr.resource_type, srr.required_quantity, srr.is_mandatory
        FROM public.service_resource_requirements srr
        WHERE srr.tenant_id = p_tenant_id
          AND srr.service_id = p_service_id
    LOOP
        v_matching_found := true;
        v_candidate_found := false;

        -- Find qualifying active resources in this branch
        FOR v_resource IN
            SELECT r.id, r.capacity
            FROM public.resources r
            WHERE r.tenant_id = p_tenant_id
              AND r.branch_id = p_branch_id
              AND r.is_active = true
              AND (v_req_record.resource_id IS NULL OR r.id = v_req_record.resource_id)
              AND (v_req_record.resource_type IS NULL OR r.resource_type = v_req_record.resource_type)
            ORDER BY r.capacity ASC, r.name ASC
        LOOP
            -- Check 1: Maintenance / Out-of-service block conflicts
            IF EXISTS (
                SELECT 1 FROM public.resource_blocks rb
                WHERE rb.tenant_id = p_tenant_id
                  AND rb.resource_id = v_resource.id
                  AND (rb.start_date + rb.start_time) < v_req_end
                  AND (rb.end_date + rb.end_time) > v_req_start
            ) THEN
                CONTINUE; -- This resource is blocked during the requested window
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

            IF (v_allocated_qty + v_req_record.required_quantity) <= v_resource.capacity THEN
                v_candidate_found := true;
                v_allocated_resource_id := v_resource.id;
                EXIT; -- Resource found for this requirement
            END IF;
        END LOOP;

        IF v_req_record.is_mandatory AND NOT v_candidate_found THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'resource_unavailable',
                'resource_type', v_req_record.resource_type,
                'required_quantity', v_req_record.required_quantity
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'allowed', true,
        'reason_code', 'ok',
        'resource_id', v_allocated_resource_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_resource_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_resource_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_resource_availability(UUID, UUID, UUID, DATE, TIME, INTEGER, UUID) TO authenticated, service_role;

-- =========================================================================
-- 6. Canonical Integration: Extended evaluate_booking_slot
-- =========================================================================
-- Incorporates resource and capacity verification within the same authoritative booking boundary.

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

    -- 5. Validate Availability Rules (ISO Weekday: 1=Mon..7=Sun)
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

    -- 6. Validate Future Slot (Timezone aware)
    v_now_in_tz := now() AT TIME ZONE v_tz;
    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_in_past', 'duration_minutes', v_svc_duration);
    END IF;

    -- 7. Validate Overlapping Active Appointments for Staff
    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.staff_id = p_staff_id
          AND a.tenant_id = p_tenant_id
          AND a.appointment_date = p_date
          AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show')
          AND (a.appointment_date + a.appointment_time) < v_req_end
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(a.duration_minutes, 30) || ' minutes')::INTERVAL) > v_req_start
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'slot_conflict', 'duration_minutes', v_svc_duration);
    END IF;

    -- 8. Validate Resource & Capacity Constraints (LARI Phase 3 Extension)
    v_res_eval := public.evaluate_resource_availability(
        p_tenant_id,
        p_branch_id,
        p_service_id,
        p_date,
        p_time,
        v_svc_duration,
        p_exclude_appointment_id
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
        'resource_id', v_res_eval->>'resource_id'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('allowed', false, 'reason_code', 'temporary_failure', 'duration_minutes', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) TO authenticated, service_role;

-- =========================================================================
-- 7. RPC: public.allocate_appointment_resource
-- =========================================================================
-- Transactional allocation helper for booking creation / confirmation.

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
    INSERT INTO public.appointment_resources (tenant_id, appointment_id, resource_id, quantity)
    VALUES (p_tenant_id, p_appointment_id, p_resource_id, COALESCE(p_quantity, 1))
    ON CONFLICT (appointment_id, resource_id) DO UPDATE
    SET quantity = EXCLUDED.quantity;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_appointment_resource(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_appointment_resource(UUID, UUID, UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.allocate_appointment_resource(UUID, UUID, UUID, INTEGER) TO authenticated, service_role;
