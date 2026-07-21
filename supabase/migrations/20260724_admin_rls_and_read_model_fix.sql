-- 20260724_admin_rls_and_read_model_fix.sql
-- Description: Stage B.1 Fix - RLS Hardening & Authenticated Admin Read Model RPCs
-- 1. Drops the offending customer appointments RLS policy referencing auth.users directly.
-- 2. Implements public.current_user_owns_customer helper (SECURITY DEFINER) querying public.customers only.
-- 3. Replaces Registered Customers RLS policy on public.appointments with current_user_owns_customer.
-- 4. Implements public.current_user_can_access_tenant helper (SECURITY DEFINER) querying public.users_profile only.
-- 5. Implements public.get_my_tenant_appointments(p_branch_id) RPC for server-scoped admin appointment listing.
-- 6. Implements public.get_my_tenant_dashboard_summary() RPC for server-scoped admin dashboard counters.
-- Migration count after this file: 18

-- =========================================================================
-- 1. HELPER FUNCTIONS FOR RLS & IDENTITY
-- =========================================================================

-- Helper to check if current auth.uid() owns the given customer record
CREATE OR REPLACE FUNCTION public.current_user_owns_customer(
    p_customer_id uuid,
    p_tenant_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_customer_id IS NULL OR p_tenant_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id
          AND c.tenant_id = p_tenant_id
          AND c.user_profile_id = auth.uid()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid) TO authenticated;

-- Helper to check if current auth.uid() can access target tenant as owner/staff
CREATE OR REPLACE FUNCTION public.current_user_can_access_tenant(
    p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_tenant_id IS NULL OR auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
          AND up.tenant_id = p_tenant_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid) TO authenticated;


-- =========================================================================
-- 2. DROP & REPLACE CUSTOMER APPOINTMENT RLS POLICY
-- =========================================================================

DROP POLICY IF EXISTS "Registered Customers - Read own appointments" ON public.appointments;

CREATE POLICY "Registered Customers - Read own appointments"
ON public.appointments FOR SELECT TO authenticated
USING (
    public.current_user_owns_customer(
        appointments.customer_id,
        appointments.tenant_id
    )
);


-- =========================================================================
-- 3. SERVER-SCOPED ADMIN READ RPCS
-- =========================================================================

-- RPC: get_my_tenant_appointments
-- Returns all appointments for the caller's active tenant (derived server-side from users_profile)
CREATE OR REPLACE FUNCTION public.get_my_tenant_appointments(
    p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_role      text;
    v_active    boolean;
    v_res       jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized', 'appointments', '[]'::jsonb);
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden', 'appointments', '[]'::jsonb);
    END IF;

    IF p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'appointments', '[]'::jsonb);
        END IF;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'tenant_id', a.tenant_id,
            'branch_id', a.branch_id,
            'user_id', a.user_id,
            'customer_id', a.customer_id,
            'user_name', a.user_name,
            'user_email', a.user_email,
            'phone', a.phone,
            'service_id', a.service_id,
            'staff_id', a.staff_id,
            'appointment_date', a.appointment_date,
            'appointment_time', a.appointment_time,
            'duration_minutes', a.duration_minutes,
            'status', a.status,
            'notes', a.notes,
            'cancel_reason', a.cancel_reason,
            'cancelled_at', a.cancelled_at,
            'cancelled_by', a.cancelled_by,
            'created_at', a.created_at
        ) ORDER BY a.appointment_date ASC, a.appointment_time ASC
    )
    INTO v_res
    FROM public.appointments a
    WHERE a.tenant_id = v_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id);

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'appointments', COALESCE(v_res, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid) TO authenticated;

-- RPC: get_my_tenant_dashboard_summary
-- Computes dashboard summary metrics server-side using Europe/Istanbul timezone
CREATE OR REPLACE FUNCTION public.get_my_tenant_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id          uuid := auth.uid();
    v_tenant_id        uuid;
    v_role             text;
    v_active           boolean;
    v_tz               text := 'Europe/Istanbul';
    v_today            date;
    v_total_apts       bigint := 0;
    v_confirmed_today  bigint := 0;
    v_completed_total  bigint := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT tenant_id, role, active
    INTO v_tenant_id, v_role, v_active
    FROM public.users_profile
    WHERE id = v_user_id;

    IF v_tenant_id IS NULL OR v_active IS NOT TRUE OR v_role NOT IN ('tenant_owner', 'staff') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'forbidden');
    END IF;

    -- Resolve branch timezone if primary exists
    SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
    FROM public.branches
    WHERE tenant_id = v_tenant_id AND is_primary = true AND is_active = true
    LIMIT 1;
    IF v_tz IS NULL THEN
        v_tz := 'Europe/Istanbul';
    END IF;

    v_today := (timezone(v_tz, now()))::date;

    SELECT COUNT(*) INTO v_total_apts
    FROM public.appointments
    WHERE tenant_id = v_tenant_id;

    SELECT COUNT(*) INTO v_confirmed_today
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND appointment_date = v_today
      AND status = 'confirmed';

    SELECT COUNT(*) INTO v_completed_total
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND status = 'completed';

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'tenant_id', v_tenant_id,
        'today_date', v_today,
        'timezone', v_tz,
        'total_appointments', v_total_apts,
        'confirmed_today', v_confirmed_today,
        'completed_total', v_completed_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary() TO authenticated;
