-- ===========================================================================
-- Ported from 72911e4: 20260921_phase3_customer360_segmentation_foundation.sql
-- Conflict-free sequential prefix: 20260922 (ADIM-035 / Faz D3)
-- Description: Phase 3 Customer 360 & Segmentation Foundation
-- Safety Hardening:
--   - Reuses canonical public.customers and public.customer_memory
--   - is_tenant_staff / is_staff_assigned_to_branch require active users_profile & active staff
--   - Uses auth.role() IS DISTINCT FROM 'service_role' to prevent NULL bypass
--   - Direct table privileges revoked from PUBLIC, anon, and authenticated
-- ===========================================================================

-- =========================================================================
-- 1. Tables: public.customer_segments & public.customer_segment_members
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_customers_id_tenant'
          AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT uq_customers_id_tenant UNIQUE (id, tenant_id);
    END IF;
END $$;

-- Reconcile existing public.customer_segments (created in 001_initial_schema.sql)
-- without duplicate CREATE TABLE so migration integrity checks remain conflict-free.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_segments' AND column_name = 'description') THEN
        ALTER TABLE public.customer_segments ADD COLUMN description TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_segments' AND column_name = 'segment_type') THEN
        ALTER TABLE public.customer_segments ADD COLUMN segment_type TEXT NOT NULL DEFAULT 'manual' CHECK (segment_type IN ('manual', 'dynamic_rule', 'system'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_segments' AND column_name = 'is_active') THEN
        ALTER TABLE public.customer_segments ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_segments' AND column_name = 'updated_at') THEN
        ALTER TABLE public.customer_segments ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    UPDATE public.customer_segments SET criteria = '{}'::jsonb WHERE criteria IS NULL;
    ALTER TABLE public.customer_segments ALTER COLUMN criteria SET DEFAULT '{}'::jsonb;
    ALTER TABLE public.customer_segments ALTER COLUMN criteria SET NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customer_segments_tenant_name_unique'
          AND conrelid = 'public.customer_segments'::regclass
    ) THEN
        ALTER TABLE public.customer_segments ADD CONSTRAINT customer_segments_tenant_name_unique UNIQUE (tenant_id, name);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_customer_segments_id_tenant'
          AND conrelid = 'public.customer_segments'::regclass
    ) THEN
        ALTER TABLE public.customer_segments ADD CONSTRAINT uq_customer_segments_id_tenant UNIQUE (id, tenant_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant ON public.customer_segments(tenant_id);

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_segments FROM PUBLIC;
REVOKE ALL ON public.customer_segments FROM anon;
REVOKE ALL ON public.customer_segments FROM authenticated;

CREATE TABLE IF NOT EXISTS public.customer_segment_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    segment_id      UUID NOT NULL,
    customer_id     UUID NOT NULL,
    assigned_by     TEXT NOT NULL DEFAULT 'system',
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_segment_members_unique UNIQUE (segment_id, customer_id),
    CONSTRAINT fk_customer_segment_members_segment
        FOREIGN KEY (segment_id, tenant_id)
        REFERENCES public.customer_segments(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_segment_members_customer
        FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_segment_members_lookup
    ON public.customer_segment_members(tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_segment_members_segment
    ON public.customer_segment_members(tenant_id, segment_id);

ALTER TABLE public.customer_segment_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_segment_members FROM PUBLIC;
REVOKE ALL ON public.customer_segment_members FROM anon;
REVOKE ALL ON public.customer_segment_members FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_customer_memory_tenant_cust
    ON public.customer_memory(tenant_id, customer_id);

REVOKE ALL ON public.customer_memory FROM PUBLIC;
REVOKE ALL ON public.customer_memory FROM anon;
REVOKE ALL ON public.customer_memory FROM authenticated;

-- =========================================================================
-- 2. Tenant Staff RLS Helper Functions
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_tenant_staff(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_tenant_id UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT up.role, up.tenant_id
    INTO v_role, v_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_uid
      AND up.active = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    IF v_tenant_id = p_tenant_id AND v_role IN ('tenant_owner', 'staff') THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_tenant_staff(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_staff(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.is_staff_assigned_to_branch(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_tenant_id UUID;
    v_staff_id UUID;
    v_has_access BOOLEAN;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT up.role, up.tenant_id
    INTO v_role, v_tenant_id
    FROM public.users_profile up
    WHERE up.id = v_uid
      AND up.active = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    IF v_tenant_id <> p_tenant_id OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN FALSE;
    END IF;

    IF v_role = 'tenant_owner' THEN
        RETURN TRUE;
    END IF;

    IF p_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT s.id INTO v_staff_id
    FROM public.staff s
    WHERE s.user_profile_id = v_uid
      AND s.tenant_id = p_tenant_id
      AND s.active = TRUE;

    IF v_staff_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.staff_branches sb
        WHERE sb.staff_id = v_staff_id
          AND sb.tenant_id = p_tenant_id
          AND sb.branch_id = p_branch_id
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$;

REVOKE ALL ON FUNCTION public.is_staff_assigned_to_branch(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_assigned_to_branch(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff_assigned_to_branch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_assigned_to_branch(UUID, UUID) TO service_role;

-- =========================================================================
-- 3. RPC: get_customer_360_view
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_customer_360_view(
    p_tenant_id   UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_customer       RECORD;
    v_memory         RECORD;
    v_has_memory     BOOLEAN := FALSE;
    v_segments       JSONB;
    v_stats          RECORD;
    v_recent_appts   JSONB;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required for customer 360'
            USING ERRCODE = '42501';
    END IF;

    SELECT
        c.id,
        c.tenant_id,
        c.name,
        c.email,
        c.phone,
        c.created_at,
        c.updated_at
    INTO v_customer
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        cm.preferences,
        cm.notes AS memory_notes,
        cm.reference_photo_metadata,
        cm.consent_flags,
        cm.updated_at
    INTO v_memory
    FROM public.customer_memory cm
    WHERE cm.customer_id = p_customer_id
      AND cm.tenant_id = p_tenant_id
    LIMIT 1;
    v_has_memory := FOUND;

    SELECT
        COUNT(*)::INT AS total_appointments,
        COUNT(*) FILTER (WHERE a.status = 'completed')::INT AS completed_appointments,
        COUNT(*) FILTER (WHERE a.status LIKE 'cancelled%')::INT AS cancelled_appointments,
        COUNT(*) FILTER (WHERE a.status = 'no_show')::INT AS no_show_appointments,
        MIN(a.appointment_date)::TEXT AS first_visit_date,
        MAX(a.appointment_date)::TEXT AS last_visit_date
    INTO v_stats
    FROM public.appointments a
    WHERE a.customer_id = p_customer_id
      AND a.tenant_id = p_tenant_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'date', a.appointment_date,
                'time', a.appointment_time,
                'status', a.status,
                'service_id', a.service_id,
                'staff_id', a.staff_id,
                'branch_id', a.branch_id,
                'created_at', a.created_at
            ) ORDER BY a.appointment_date DESC, a.appointment_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_recent_appts
    FROM (
        SELECT id, appointment_date, appointment_time, status, service_id, staff_id, branch_id, created_at
        FROM public.appointments
        WHERE customer_id = p_customer_id
          AND tenant_id = p_tenant_id
        ORDER BY appointment_date DESC, appointment_time DESC
        LIMIT 10
    ) a;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'segment_id', s.id,
                'name', s.name,
                'segment_type', s.segment_type,
                'assigned_at', csm.assigned_at
            ) ORDER BY s.name ASC
        ),
        '[]'::jsonb
    )
    INTO v_segments
    FROM public.customer_segment_members csm
    JOIN public.customer_segments s ON s.id = csm.segment_id AND s.tenant_id = csm.tenant_id
    WHERE csm.customer_id = p_customer_id
      AND csm.tenant_id = p_tenant_id
      AND s.is_active = TRUE;

    RETURN jsonb_build_object(
        'customer_id', v_customer.id,
        'tenant_id', v_customer.tenant_id,
        'name', v_customer.name,
        'email', v_customer.email,
        'phone', v_customer.phone,
        'created_at', v_customer.created_at,
        'updated_at', v_customer.updated_at,
        'metrics', jsonb_build_object(
            'total_appointments', COALESCE(v_stats.total_appointments, 0),
            'completed_appointments', COALESCE(v_stats.completed_appointments, 0),
            'cancelled_appointments', COALESCE(v_stats.cancelled_appointments, 0),
            'no_show_appointments', COALESCE(v_stats.no_show_appointments, 0),
            'first_visit_date', v_stats.first_visit_date,
            'last_visit_date', v_stats.last_visit_date
        ),
        'segments', v_segments,
        'memory', jsonb_build_object(
            'preferences', CASE WHEN v_has_memory THEN COALESCE(v_memory.preferences, '{}'::jsonb) ELSE '{}'::jsonb END,
            'notes', CASE WHEN v_has_memory THEN v_memory.memory_notes ELSE NULL END,
            'photos', CASE WHEN v_has_memory THEN COALESCE(v_memory.reference_photo_metadata, '[]'::jsonb) ELSE '[]'::jsonb END,
            'consent_flags', CASE WHEN v_has_memory THEN COALESCE(v_memory.consent_flags, '{}'::jsonb) ELSE '{}'::jsonb END,
            'updated_at', CASE WHEN v_has_memory THEN v_memory.updated_at ELSE NULL END
        ),
        'recent_appointments', v_recent_appts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_360_view(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_360_view(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_360_view(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_360_view(UUID, UUID) TO service_role;

-- =========================================================================
-- 4. RPC: assign_customer_to_segment
-- =========================================================================

CREATE OR REPLACE FUNCTION public.assign_customer_to_segment(
    p_tenant_id   UUID,
    p_segment_id  UUID,
    p_customer_id UUID,
    p_assigned_by TEXT DEFAULT 'admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_segment_exists BOOLEAN;
    v_customer_exists BOOLEAN;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required to assign segments'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.customer_segments
        WHERE id = p_segment_id AND tenant_id = p_tenant_id
    ) INTO v_segment_exists;

    IF NOT v_segment_exists THEN
        RAISE EXCEPTION 'SEGMENT_NOT_FOUND: Segment % does not exist in tenant %', p_segment_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.customers
        WHERE id = p_customer_id AND tenant_id = p_tenant_id
    ) INTO v_customer_exists;

    IF NOT v_customer_exists THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer % does not exist in tenant %', p_customer_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.customer_segment_members (tenant_id, segment_id, customer_id, assigned_by, assigned_at)
    VALUES (p_tenant_id, p_segment_id, p_customer_id, COALESCE(NULLIF(trim(p_assigned_by), ''), 'admin'), NOW())
    ON CONFLICT (segment_id, customer_id) DO UPDATE
    SET assigned_by = EXCLUDED.assigned_by,
        assigned_at = NOW();

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_customer_to_segment(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_customer_to_segment(UUID, UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_customer_to_segment(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_customer_to_segment(UUID, UUID, UUID, TEXT) TO service_role;

-- =========================================================================
-- 5. RPC: remove_customer_from_segment
-- =========================================================================

CREATE OR REPLACE FUNCTION public.remove_customer_from_segment(
    p_tenant_id   UUID,
    p_segment_id  UUID,
    p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required to remove segments'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.customer_segment_members
    WHERE tenant_id = p_tenant_id
      AND segment_id = p_segment_id
      AND customer_id = p_customer_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_customer_from_segment(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_customer_from_segment(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_customer_from_segment(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_customer_from_segment(UUID, UUID, UUID) TO service_role;

-- =========================================================================
-- 6. RPC: list_tenant_customer_segments
-- =========================================================================

CREATE OR REPLACE FUNCTION public.list_tenant_customer_segments(
    p_tenant_id UUID
)
RETURNS TABLE (
    id           UUID,
    name         TEXT,
    description  TEXT,
    segment_type TEXT,
    criteria     JSONB,
    is_active    BOOLEAN,
    member_count BIGINT,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.name::TEXT,
        s.description::TEXT,
        s.segment_type::TEXT,
        s.criteria,
        s.is_active,
        COUNT(csm.id)::BIGINT AS member_count,
        s.created_at,
        s.updated_at
    FROM public.customer_segments s
    LEFT JOIN public.customer_segment_members csm
        ON csm.segment_id = s.id AND csm.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant_id
    GROUP BY s.id
    ORDER BY s.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_customer_segments(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_tenant_customer_segments(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_customer_segments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_customer_segments(UUID) TO service_role;

-- =========================================================================
-- 7. RPC: evaluate_dynamic_customer_segments (Explicit Source-Truth Classification)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.evaluate_dynamic_customer_segments(
    p_tenant_id UUID,
    p_segment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required to evaluate dynamic segments'
            USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'status', 'DYNAMIC_RULE_EVALUATION_NOT_IMPLEMENTED',
        'tenant_id', p_tenant_id,
        'segment_id', p_segment_id,
        'message', 'Automated dynamic segmentation rule evaluation engine requires Phase 4 background worker integration.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_dynamic_customer_segments(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_dynamic_customer_segments(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_dynamic_customer_segments(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_dynamic_customer_segments(UUID, UUID) TO service_role;
