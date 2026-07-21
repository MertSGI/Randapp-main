-- 20260723_booking_lifecycle_foundation.sql
-- Description: Stage A Database Scheduling Foundation & Shared Slot Engine (Hardened)
-- Provisions:
--   1. Candidate keys (id, tenant_id) on staff, services, branches for composite FK cross-tenant database-level constraints.
--   2. public.branches with RLS and composite FK to tenants.
--   3. public.staff_branches & public.service_branches junction tables with composite FK constraints and fail-closed RLS.
--   4. public.appointments composite FK constraints:
--        - (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id)
--        - duration_minutes INTEGER CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 1440))
--   5. Backfills duration_minutes for existing appointments ONLY where valid service duration exists (leaves unresolved as NULL).
--   6. public.evaluate_booking_slot: Shared, internal SECURITY DEFINER slot evaluator engine with strict fail-closed branch mapping requirement and revoked public execution.
--   7. public.get_public_available_slots & public.create_public_booking RPCs with hardened security, auto branch resolution, and safe returns.

-- =========================================================================
-- 1. UNIQUE CANDIDATE KEYS FOR COMPOSITE FK CROSS-TENANT INTEGRITY
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_staff_id_tenant'
    ) THEN
        ALTER TABLE public.staff ADD CONSTRAINT uq_staff_id_tenant UNIQUE (id, tenant_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_services_id_tenant'
    ) THEN
        ALTER TABLE public.services ADD CONSTRAINT uq_services_id_tenant UNIQUE (id, tenant_id);
    END IF;
END $$;


-- =========================================================================
-- 2. CANONICAL BRANCHES TABLE & CONSTRAINTS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    timezone TEXT DEFAULT 'Europe/Istanbul',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_tenant_branch_slug UNIQUE (tenant_id, slug),
    CONSTRAINT uq_branches_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON public.branches(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_branch_per_tenant 
ON public.branches (tenant_id) 
WHERE is_primary = true AND is_active = true;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage own branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Staff - Read own branches" ON public.branches;
DROP POLICY IF EXISTS "Tenant Staff - Read/Write own branches" ON public.branches;
DROP POLICY IF EXISTS "Public - SELECT active branches" ON public.branches;

-- Super Admins: Full access
CREATE POLICY "Super Admins - Full Access on branches" 
ON public.branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Tenant Owner: CRUD within own tenant
CREATE POLICY "Tenant Owner - Manage own branches" 
ON public.branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = branches.tenant_id
    )
);

-- Tenant Staff: SELECT only within own tenant
CREATE POLICY "Tenant Staff - Read own branches" 
ON public.branches FOR SELECT TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'staff'
        AND up.tenant_id = branches.tenant_id
    )
);


-- =========================================================================
-- 3. BRANCH JUNCTION TABLES WITH COMPOSITE FKs (STAFF & SERVICES)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_branches (
    tenant_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, branch_id),
    CONSTRAINT fk_staff_branches_staff_tenant 
        FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staff(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_staff_branches_branch_tenant 
        FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_branches_tenant ON public.staff_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_branches_branch ON public.staff_branches(branch_id);

ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on staff_branches" ON public.staff_branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage staff_branches" ON public.staff_branches;
DROP POLICY IF EXISTS "Tenant Staff - Manage staff_branches" ON public.staff_branches;

CREATE POLICY "Super Admins - Full Access on staff_branches" 
ON public.staff_branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owner - Manage staff_branches" 
ON public.staff_branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff_branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = staff_branches.tenant_id
    )
);


CREATE TABLE IF NOT EXISTS public.service_branches (
    tenant_id UUID NOT NULL,
    service_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (service_id, branch_id),
    CONSTRAINT fk_service_branches_service_tenant 
        FOREIGN KEY (service_id, tenant_id) REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_service_branches_branch_tenant 
        FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_branches_tenant ON public.service_branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_branches_branch ON public.service_branches(branch_id);

ALTER TABLE public.service_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins - Full Access on service_branches" ON public.service_branches;
DROP POLICY IF EXISTS "Tenant Owner - Manage service_branches" ON public.service_branches;
DROP POLICY IF EXISTS "Tenant Staff - Manage service_branches" ON public.service_branches;

CREATE POLICY "Super Admins - Full Access on service_branches" 
ON public.service_branches FOR ALL TO authenticated 
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Owner - Manage service_branches" 
ON public.service_branches FOR ALL TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = service_branches.tenant_id
    )
)
WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role = 'tenant_owner'
        AND up.tenant_id = service_branches.tenant_id
    )
);


-- =========================================================================
-- 4. APPOINTMENTS CONTRACT ALTERATIONS & SAFE BACKFILL
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN branch_id UUID NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointments_branch_tenant'
    ) THEN
        ALTER TABLE public.appointments ADD CONSTRAINT fk_appointments_branch_tenant 
            FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'duration_minutes'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN duration_minutes INTEGER NULL;
        ALTER TABLE public.appointments ADD CONSTRAINT chk_appointments_duration_positive 
            CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 1440));
    END IF;
END $$;

-- Backfill duration_minutes ONLY where a valid service duration exists
UPDATE public.appointments a
SET duration_minutes = s.duration
FROM public.services s
WHERE a.service_id = s.id
  AND s.duration IS NOT NULL
  AND s.duration > 0
  AND a.duration_minutes IS NULL;

-- Unresolved legacy appointments without a matching valid service remain NULL.


-- =========================================================================
-- 5. SHARED INTERNAL SLOT EVALUATOR ENGINE (FAIL-CLOSED MAPPINGS)
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
BEGIN
    -- 1. Validate Branch
    SELECT tenant_id, is_active, COALESCE(timezone, 'Europe/Istanbul')
    INTO v_branch_tenant, v_branch_active, v_tz
    FROM public.branches
    WHERE id = p_branch_id;

    IF NOT FOUND OR v_branch_tenant IS DISTINCT FROM p_tenant_id OR v_branch_active IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'invalid_branch', 'duration_minutes', 0);
    END IF;

    -- 2. Validate Service
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

    -- 3. Validate Staff
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

    -- 4. Validate Staff-Service Mapping
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

    -- Check window bounds
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

    -- 7. Validate Overlapping Active Appointments
    -- Active slot-occupying statuses: 'confirmed', 'pending'
    -- Non-blocking statuses: 'cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show'
    -- Unknown status values fail closed by being treated as active/blocking.
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

-- Revoke execution from PUBLIC and anon for internal evaluator engine
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_booking_slot(UUID, UUID, UUID, UUID, DATE, TIME, UUID) FROM anon;


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE PUBLIC SLOT RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_slug         TEXT,
    p_branch_id    UUID DEFAULT NULL,
    p_service_id   UUID DEFAULT NULL,
    p_staff_id     UUID DEFAULT NULL,
    p_date         DATE DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id          UUID;
    v_tenant_status      TEXT;
    v_onboarding_status  TEXT;
    v_public_site_status TEXT;
    v_sub_exists         BOOLEAN;
    v_effective_branch   UUID := p_branch_id;
    v_active_branches    UUID[];
    v_svc_duration       INTEGER;
    v_weekday            INTEGER;
    v_avail_start        TIME;
    v_avail_end          TIME;
    v_tz                 TEXT := 'Europe/Istanbul';
    v_now_in_tz          TIMESTAMP;
    v_start_min          INTEGER;
    v_end_min            INTEGER;
    v_slot_min           INTEGER;
    v_slot_time          TIME;
    v_slot_label         TEXT;
    v_slot_end_label     TEXT;
    v_eval_res           JSONB;
    v_slots              JSONB := '[]'::jsonb;
BEGIN
    -- 1. Tenant Resolution & Eligibility
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'slots', '[]'::jsonb);
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    -- 2. Entitlement Check
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'slots', '[]'::jsonb);
    END IF;

    -- 3. Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required', 'slots', '[]'::jsonb);
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'slots', '[]'::jsonb);
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'slots', '[]'::jsonb);
        END IF;
    END IF;

    -- Get branch timezone
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches WHERE id = v_effective_branch;

    -- 4. Service Duration & Validation
    SELECT duration INTO v_svc_duration FROM public.services WHERE id = p_service_id AND tenant_id = v_tenant_id AND active = true;
    IF NOT FOUND OR v_svc_duration IS NULL OR v_svc_duration <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service', 'slots', '[]'::jsonb);
    END IF;

    -- 5. Staff Availability Window
    v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
    IF v_weekday = 0 THEN v_weekday := 7; END IF;

    SELECT start_time, end_time INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id = p_staff_id AND tenant_id = v_tenant_id AND weekday = v_weekday AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'outside_availability',
            'branch_id', v_effective_branch,
            'duration_minutes', v_svc_duration,
            'slots', '[]'::jsonb
        );
    END IF;

    -- 6. Slot Iteration at 15-minute Intervals
    v_start_min := EXTRACT(HOUR FROM v_avail_start)::INTEGER * 60 + EXTRACT(MINUTE FROM v_avail_start)::INTEGER;
    v_end_min   := EXTRACT(HOUR FROM v_avail_end)::INTEGER * 60 + EXTRACT(MINUTE FROM v_avail_end)::INTEGER;

    v_slot_min := v_start_min;
    WHILE v_slot_min <= v_end_min - v_svc_duration LOOP
        v_slot_time := (v_slot_min / 60 * interval '1 hour') + (v_slot_min % 60 * interval '1 minute');

        -- Evaluate candidate slot using shared evaluator
        v_eval_res := public.evaluate_booking_slot(
            p_tenant_id  => v_tenant_id,
            p_branch_id  => v_effective_branch,
            p_service_id => p_service_id,
            p_staff_id   => p_staff_id,
            p_date       => p_date,
            p_time       => v_slot_time
        );

        IF (v_eval_res->>'allowed')::boolean THEN
            v_slot_label     := lpad((v_slot_min / 60)::text, 2, '0') || ':' || lpad((v_slot_min % 60)::text, 2, '0');
            v_slot_end_label := lpad(((v_slot_min + v_svc_duration) / 60)::text, 2, '0') || ':' || lpad(((v_slot_min + v_svc_duration) % 60)::text, 2, '0');

            v_slots := v_slots || jsonb_build_object(
                'start', v_slot_label,
                'end', v_slot_end_label
            );
        END IF;

        v_slot_min := v_slot_min + 15;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'branch_id', v_effective_branch,
        'duration_minutes', v_svc_duration,
        'slots', v_slots
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure', 'slots', '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(TEXT, UUID, UUID, UUID, DATE) TO anon, authenticated;


-- =========================================================================
-- 7. UPDATED CREATE_PUBLIC_BOOKING RPC (CALLING SHARED EVALUATOR)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL,
    p_branch_id         uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_sub_exists            boolean;
    v_effective_branch      uuid := p_branch_id;
    v_active_branches       uuid[];
    v_eval_res              jsonb;
    v_svc_duration          integer;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_lock_key              bigint;
    v_stage                 text := 'init';
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4: Entitlement
    v_stage := 'entitlement_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    END IF;

    -- Gate 5: Concurrency Advisory Lock
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Gate 6: Idempotency Replay
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key AND tenant_id = v_tenant_id;

        IF FOUND THEN
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id AND expires_at > now();

            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id, appointment_id, token_hash, expires_at
            ) VALUES (
                v_tenant_id::text, v_existing_apt_id, v_token_hash, v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- Gate 7: Shared Slot Evaluator Engine Execution
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
        RETURN jsonb_build_object('success', false, 'reason_code', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Gate 8: Customer Upsert
    v_stage := 'customer_upsert';
    IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = p_customer_phone LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND p_customer_email IS NOT NULL AND trim(p_customer_email) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND email = p_customer_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_tenant_id, trim(p_customer_name), trim(p_customer_email), trim(p_customer_phone))
        RETURNING id INTO v_customer_id;
    END IF;

    -- Gate 9: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 10: Appointment Creation
    v_stage := 'appointment_insert';
    INSERT INTO public.appointments (
        tenant_id, branch_id, customer_id, user_name, user_email, phone,
        service_id, staff_id, appointment_date, appointment_time,
        duration_minutes, status
    ) VALUES (
        v_tenant_id, v_effective_branch, v_customer_id, trim(p_customer_name),
        trim(p_customer_email), trim(p_customer_phone), p_service_id, p_staff_id,
        p_appointment_date, p_appointment_time, v_svc_duration, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 11: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 12: Idempotency Record
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (
            idempotency_key, tenant_id, appointment_id, expires_at
        ) VALUES (
            p_idempotency_key, v_tenant_id, v_appointment_id, now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) TO anon, authenticated;
