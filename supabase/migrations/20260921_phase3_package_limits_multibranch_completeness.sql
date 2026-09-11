-- Migration: 20260921_phase3_package_limits_multibranch_completeness.sql
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-PACKAGE-LIMITS-MULTIBRANCH-20260911-01
-- Correction Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Goals:
-- 1. Multi-Branch Product Completeness:
--    - Harmonize with canonical unique partial index:
--      idx_unique_primary_branch_per_tenant (tenant_id) WHERE is_primary = true AND is_active = true.
--    - Enforce primary branch invariants without causing concurrency conflicts.
--    - Safe branch deactivation with timezone-aware future appointment checks.
--    - Transactional staff and service branch assignment RPCs with composite tenant checks.
--    - Multi-branch calendar query RPC with real branch-level permissions:
--      * tenant_owner: tenant-wide access.
--      * staff: strictly restricted to branches mapped via public.staff_branches (p_branch_id = NULL filters to mapped branches).
--      * super_admin: platform-wide access.
--    - Cross-branch joins strictly enforce tenant binding across branches, staff, and services.

-- =========================================================================
-- 1. Primary Branch Invariant Trigger
-- =========================================================================
-- Reconciles with canonical unique index idx_unique_primary_branch_per_tenant.
-- Guarantees that at most one active branch is primary per tenant.

CREATE OR REPLACE FUNCTION public.enforce_tenant_primary_branch_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_active_count INTEGER;
BEGIN
    -- Check if tenant has other active branches
    SELECT count(*)
    INTO v_active_count
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
    -- BEFORE this row is saved, preventing violation of idx_unique_primary_branch_per_tenant.
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
-- Prevents deactivating a branch if active future appointments exist using branch timezone.

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
    v_tz                 TEXT;
    v_now_in_tz          TIMESTAMP;
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

    SELECT is_primary, COALESCE(timezone, 'Europe/Istanbul')
    INTO v_is_primary, v_tz
    FROM public.branches
    WHERE id = p_branch_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'branch_not_found');
    END IF;

    v_now_in_tz := now() AT TIME ZONE v_tz;

    -- Check for future active appointments in branch timezone
    SELECT count(*) INTO v_active_future_apts
    FROM public.appointments a
    WHERE a.tenant_id = p_tenant_id
      AND a.branch_id = p_branch_id
      AND (a.appointment_date + a.appointment_time) >= v_now_in_tz
      AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show');

    IF v_active_future_apts > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'branch_has_active_future_appointments',
            'active_appointment_count', v_active_future_apts
        );
    END IF;

    -- Deactivate branch
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
-- 3. Staff & Service Branch Assignment RPCs with Composite Integrity
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
-- 4. Multi-Branch Calendar Query RPCs with Real Branch-Level Permissions
-- =========================================================================
-- Enforces real staff branch assignments:
-- - tenant_owner: allowed tenant-wide or specific branch
-- - staff: restricted strictly to mapped branches via public.staff_branches.
--   If p_branch_id is NULL, staff only sees appointments for branches they are assigned to.

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
DECLARE
    v_user RECORD;
BEGIN
    -- Verify caller profile
    SELECT up.role, up.tenant_id, up.id INTO v_user
    FROM public.users_profile up
    WHERE up.id = auth.uid() AND up.active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;

    -- Staff branch restriction enforcement
    IF v_user.role = 'staff' THEN
        IF p_branch_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.staff_branches sb
                JOIN public.staff s ON s.id = sb.staff_id
                WHERE s.id = v_user.id AND sb.branch_id = p_branch_id AND sb.tenant_id = p_tenant_id
            ) THEN
                RAISE EXCEPTION 'staff_not_authorized_for_branch' USING ERRCODE = '42501';
            END IF;
        END IF;
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
    JOIN public.branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
    JOIN public.services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    JOIN public.staff st ON st.id = a.staff_id AND st.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND (
          -- If explicit branch provided, filter by it
          (p_branch_id IS NOT NULL AND a.branch_id = p_branch_id)
          OR
          -- If p_branch_id is NULL:
          (p_branch_id IS NULL AND (
              v_user.role IN ('super_admin', 'tenant_owner')
              OR
              -- Ordinary staff only sees appointments in branches they are mapped to
              (v_user.role = 'staff' AND a.branch_id IN (
                  SELECT sb.branch_id FROM public.staff_branches sb
                  JOIN public.staff s_map ON s_map.id = sb.staff_id
                  WHERE s_map.id = v_user.id AND sb.tenant_id = p_tenant_id
              ))
          ))
      )
      AND a.appointment_date >= p_start_date
      AND a.appointment_date <= p_end_date
    ORDER BY a.appointment_date ASC, a.appointment_time ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_branch_calendar_appointments(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_calendar_appointments(UUID, UUID, DATE, DATE) TO authenticated, service_role;
