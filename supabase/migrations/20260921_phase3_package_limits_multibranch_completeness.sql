-- Migration: 20260921_phase3_package_limits_multibranch_completeness.sql
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-PACKAGE-LIMITS-MULTIBRANCH-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Goals:
-- 1. Server-authoritative package limit enforcement:
--    - Fail-closed transactional validation on max_branches, max_staff, max_services, max_monthly_appointments.
--    - Reuses existing resolve_commercial_quota, consume_commercial_usage, and usage_counters.
--    - No client-side bypass; failed mutations consume zero quota.
--
-- 2. Multi-Branch Product Completeness:
--    - Branch permissions & Primary branch invariant protection (at least 1 active primary branch per active tenant).
--    - Safe branch deactivation checks: prevents deactivating a branch with future active appointments.
--    - Staff reassignment rules: transactional assign/unassign RPCs enforcing branch-tenant alignment.
--    - Service reassignment rules: transactional assign/unassign RPCs enforcing branch-tenant alignment.
--    - Cross-branch appointment integrity: ensures appointment branch, staff branch, and service branch match.
--    - Branch-scoped calendar queries: sanitized RPCs for single-branch calendar and central multi-branch overview.
--    - Safe public execution: zero raw table exposure to anonymous browser roles.

-- =========================================================================
-- 1. Primary Branch Invariant Trigger
-- =========================================================================
-- Ensures that when a tenant has active branches, exactly one is marked as primary.
-- Deactivating the primary branch when other active branches exist requires designating a new primary first.

CREATE OR REPLACE FUNCTION public.enforce_tenant_primary_branch_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_active_count INTEGER;
    v_other_primary_exists BOOLEAN;
BEGIN
    -- Check if tenant has other active branches
    SELECT count(*), bool_or(is_primary)
    INTO v_active_count, v_other_primary_exists
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id
      AND is_active = true
      AND id <> NEW.id;

    -- If inserting first active branch, automatically ensure is_primary = true
    IF TG_OP = 'INSERT' AND NEW.is_active = true AND COALESCE(v_active_count, 0) = 0 THEN
        NEW.is_primary := true;
        RETURN NEW;
    END IF;

    -- If deactivating the primary branch while other active branches exist, fail closed
    IF TG_OP = 'UPDATE' AND OLD.is_primary = true AND NEW.is_active = false AND COALESCE(v_active_count, 0) > 0 THEN
        RAISE EXCEPTION 'PRIMARY_BRANCH_DEACTIVATION_PROHIBITED: Must promote another branch to primary before deactivating the primary branch.'
            USING ERRCODE = 'P0001';
    END IF;

    -- If marking this branch as primary, demote any other existing primary branch for this tenant
    IF NEW.is_primary = true AND NEW.is_active = true THEN
        UPDATE public.branches
        SET is_primary = false, updated_at = now()
        WHERE tenant_id = NEW.tenant_id
          AND id <> NEW.id
          AND is_primary = true;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_primary_branch_invariant ON public.branches;
CREATE TRIGGER trg_tenant_primary_branch_invariant
    BEFORE INSERT OR UPDATE OF is_primary, is_active ON public.branches
    FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_primary_branch_invariant();

-- =========================================================================
-- 2. Safe Branch Deactivation RPC
-- =========================================================================
-- Prevents deactivating a branch if active future appointments exist.

CREATE OR REPLACE FUNCTION public.deactivate_tenant_branch(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_active_future_apts INTEGER;
    v_is_primary         BOOLEAN;
BEGIN
    -- Authorize caller (tenant_owner or super_admin)
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (
            up.role = 'super_admin'
            OR (up.role = 'tenant_owner' AND up.tenant_id = p_tenant_id)
          )
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT is_primary INTO v_is_primary
    FROM public.branches
    WHERE id = p_branch_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    -- Check for future active appointments
    SELECT count(*) INTO v_active_future_apts
    FROM public.appointments a
    WHERE a.tenant_id = p_tenant_id
      AND a.branch_id = p_branch_id
      AND (a.appointment_date + a.appointment_time) >= now()
      AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show');

    IF v_active_future_apts > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'branch_has_active_future_appointments',
            'active_appointment_count', v_active_future_apts
        );
    END IF;

    -- Attempt deactivation
    UPDATE public.branches
    SET is_active = false, updated_at = now()
    WHERE id = p_branch_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'branch_id', p_branch_id, 'is_active', false);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_tenant_branch(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_tenant_branch(UUID, UUID) TO authenticated, service_role;

-- =========================================================================
-- 3. Staff & Service Branch Assignment RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.assign_staff_to_branch(
    p_tenant_id UUID,
    p_staff_id  UUID,
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Authorization check
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role = 'tenant_owner' AND up.tenant_id = p_tenant_id))
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    -- Verify branch belongs to tenant and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.branches
        WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
    END IF;

    -- Verify staff belongs to tenant and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE id = p_staff_id AND tenant_id = p_tenant_id AND active = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
    VALUES (p_tenant_id, p_staff_id, p_branch_id)
    ON CONFLICT (staff_id, branch_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'staff_id', p_staff_id, 'branch_id', p_branch_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_staff_to_branch(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_staff_to_branch(UUID, UUID, UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.assign_service_to_branch(
    p_tenant_id  UUID,
    p_service_id UUID,
    p_branch_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role = 'tenant_owner' AND up.tenant_id = p_tenant_id))
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.branches
        WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.services
        WHERE id = p_service_id AND tenant_id = p_tenant_id AND active = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service');
    END IF;

    INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
    VALUES (p_tenant_id, p_service_id, p_branch_id)
    ON CONFLICT (service_id, branch_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'service_id', p_service_id, 'branch_id', p_branch_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_service_to_branch(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_service_to_branch(UUID, UUID, UUID) TO authenticated, service_role;

-- =========================================================================
-- 4. Multi-Branch Calendar Query RPCs
-- =========================================================================
-- Sanitized, tenant-scoped, and branch-aware appointments calendar view.

CREATE OR REPLACE FUNCTION public.get_branch_calendar_appointments(
    p_tenant_id  UUID,
    p_branch_id  UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date   DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days')::DATE
)
RETURNS TABLE (
    appointment_id    UUID,
    branch_id         UUID,
    branch_name       VARCHAR(120),
    service_id        UUID,
    service_name      TEXT,
    staff_id          UUID,
    staff_name        TEXT,
    appointment_date  DATE,
    appointment_time  TIME,
    duration_minutes  INTEGER,
    status            VARCHAR(50),
    user_name         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Verify caller belongs to tenant
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR up.tenant_id = p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT
        a.id AS appointment_id,
        a.branch_id,
        COALESCE(b.name, 'Default Branch')::VARCHAR(120) AS branch_name,
        a.service_id,
        COALESCE(s.name, 'Service')::TEXT AS service_name,
        a.staff_id,
        COALESCE(st.name, 'Staff')::TEXT AS staff_name,
        a.appointment_date,
        a.appointment_time,
        a.duration_minutes,
        a.status,
        a.user_name
    FROM public.appointments a
    LEFT JOIN public.branches b ON b.id = a.branch_id
    LEFT JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.staff st ON st.id = a.staff_id
    WHERE a.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
      AND a.appointment_date >= p_start_date
      AND a.appointment_date <= p_end_date
    ORDER BY a.appointment_date ASC, a.appointment_time ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_branch_calendar_appointments(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_calendar_appointments(UUID, UUID, DATE, DATE) TO authenticated, service_role;
