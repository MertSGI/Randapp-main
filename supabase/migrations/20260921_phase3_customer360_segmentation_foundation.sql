-- ===========================================================================
-- Migration: Phase 3 Customer 360 & Segmentation Foundation
-- Authority: LARI-AOS-PROGRAM-V2-CONTINUATION-AND-LIVE-RELAY-R1-20260911-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuse canonical public.customers and public.customer_memory.
--    Do NOT create customers_v2 or parallel customer truth.
-- 2. SEGMENTATION FOUNDATION:
--    Tenant-scoped customer_segments and customer_segment_members.
--    Dynamic rule criteria evaluation (e.g. min_appointments, last_visit_days, total_spend).
-- 3. SANITIZED CUSTOMER 360 AGGREGATION:
--    Strictly tenant-scoped RPC returning aggregated customer 360 views
--    (metrics, appointments history, notes, preferences, segment memberships).
-- 4. TRUST BOUNDARY:
--    Direct table privileges revoked from PUBLIC, anon, and authenticated.
--    Trusted internal operations granted to service_role.
--    Sanitized read-only RPCs granted to authenticated staff/admin with tenant isolation.
-- ===========================================================================

-- =========================================================================
-- 1. Tables: public.customer_segments & public.customer_segment_members
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.customer_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     TEXT DEFAULT NULL,
    segment_type    TEXT NOT NULL DEFAULT 'manual' CHECK (segment_type IN ('manual', 'dynamic_rule', 'system')),
    criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_segments_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant ON public.customer_segments(tenant_id);

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_segments FROM PUBLIC;
REVOKE ALL ON public.customer_segments FROM anon;
REVOKE ALL ON public.customer_segments FROM authenticated;

-- Segment memberships link directly to canonical public.customers(id)
CREATE TABLE IF NOT EXISTS public.customer_segment_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    segment_id      UUID NOT NULL REFERENCES public.customer_segments(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    assigned_by     TEXT NOT NULL DEFAULT 'system',
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_segment_members_unique UNIQUE (segment_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_segment_members_lookup 
    ON public.customer_segment_members(tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_segment_members_segment 
    ON public.customer_segment_members(tenant_id, segment_id);

ALTER TABLE public.customer_segment_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_segment_members FROM PUBLIC;
REVOKE ALL ON public.customer_segment_members FROM anon;
REVOKE ALL ON public.customer_segment_members FROM authenticated;

-- Ensure public.customer_memory has tenant index and RLS enabled
CREATE INDEX IF NOT EXISTS idx_customer_memory_tenant_cust 
    ON public.customer_memory(tenant_id, customer_id);

REVOKE ALL ON public.customer_memory FROM PUBLIC;
REVOKE ALL ON public.customer_memory FROM anon;
REVOKE ALL ON public.customer_memory FROM authenticated;

-- =========================================================================
-- 2. Tenant Staff RLS Helper Function (Tenant Scope Validation)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_tenant_staff(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = p_tenant_id
          AND up.role IN ('admin', 'staff', 'owner')
    );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO service_role;

-- =========================================================================
-- 3. RPC: get_customer_360_view (Sanitized Tenant Read RPC)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_customer_360_view(
    p_tenant_id   UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_customer       RECORD;
    v_memory         RECORD;
    v_segments       JSONB;
    v_stats          RECORD;
    v_recent_appts   JSONB;
    v_notes          JSONB;
    v_photos         JSONB;
BEGIN
    -- Auth & Tenant Scope Check: caller must be service_role OR verified tenant staff
    IF auth.role() <> 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required for customer 360'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Fetch canonical customer record
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

    IF v_customer.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Fetch canonical customer memory
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

    -- 3. Compute appointment stats (total, completed, cancelled, no_show, first_visit, last_visit)
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

    -- 4. Fetch recent appointments (sanitized up to 10 latest)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'date', a.appointment_date,
                'time', a.appointment_time,
                'status', a.status,
                'service_id', a.service_id,
                'staff_id', a.staff_id,
                'created_at', a.created_at
            ) ORDER BY a.appointment_date DESC, a.appointment_time DESC
        ),
        '[]'::jsonb
    )
    INTO v_recent_appts
    FROM (
        SELECT id, appointment_date, appointment_time, status, service_id, staff_id, created_at
        FROM public.appointments
        WHERE customer_id = p_customer_id
          AND tenant_id = p_tenant_id
        ORDER BY appointment_date DESC, appointment_time DESC
        LIMIT 10
    ) a;

    -- 5. Fetch segment memberships
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
    JOIN public.customer_segments s ON s.id = csm.segment_id
    WHERE csm.customer_id = p_customer_id
      AND csm.tenant_id = p_tenant_id
      AND s.is_active = TRUE;

    -- 6. Assemble 360 View JSON
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
            'preferences', COALESCE(v_memory.preferences, '{}'::jsonb),
            'notes', v_memory.memory_notes,
            'photos', COALESCE(v_memory.reference_photo_metadata, '[]'::jsonb),
            'consent_flags', COALESCE(v_memory.consent_flags, '{}'::jsonb),
            'updated_at', v_memory.updated_at
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
-- 4. RPC: manage_customer_segment_membership (Trusted / Admin RPC)
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
SET search_path = public, auth
AS $$
DECLARE
    v_segment_exists BOOLEAN;
    v_customer_exists BOOLEAN;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required to assign segments'
            USING ERRCODE = '42501';
    END IF;

    -- Verify segment exists within tenant
    SELECT EXISTS (
        SELECT 1 FROM public.customer_segments 
        WHERE id = p_segment_id AND tenant_id = p_tenant_id
    ) INTO v_segment_exists;

    IF NOT v_segment_exists THEN
        RAISE EXCEPTION 'SEGMENT_NOT_FOUND: Segment % does not exist in tenant %', p_segment_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Verify customer exists within tenant
    SELECT EXISTS (
        SELECT 1 FROM public.customers 
        WHERE id = p_customer_id AND tenant_id = p_tenant_id
    ) INTO v_customer_exists;

    IF NOT v_customer_exists THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer % does not exist in tenant %', p_customer_id, p_tenant_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Upsert segment membership
    INSERT INTO public.customer_segment_members (tenant_id, segment_id, customer_id, assigned_by, assigned_at)
    VALUES (p_tenant_id, p_segment_id, p_customer_id, p_assigned_by, NOW())
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
SET search_path = public, auth
AS $$
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
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
    name         VARCHAR(100),
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
SET search_path = public, auth
AS $$
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_tenant_staff(p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.description,
        s.segment_type,
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
