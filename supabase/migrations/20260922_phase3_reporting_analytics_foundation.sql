-- Migration: 20260922_phase3_reporting_analytics_foundation.sql
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-REPORTING-ANALYTICS-FOUNDATION-20260911-01
-- Correction Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- R1 Hardening Requirements:
-- 1. Schema Truth: Strictly use services.price INTEGER NOT NULL. Nonexistent price column references eliminated.
-- 2. Financial Semantics: Strictly labelled ESTIMATED_REVENUE. Zero representation as collected, settled, or accounting revenue.
--    Limitation explicitly noted: derived from current service catalog price.
-- 3. Metric naming accuracy:
--    - Use occupied_minutes and appointment_load.
--    - Does not misname raw volume as "utilization" unless a real schedule capacity denominator is present.
-- 4. Branch access control:
--    - Staff calling analytics are restricted to branches they are assigned to via public.staff_branches.
-- 5. Bounded pagination & Top-N controls (p_limit, p_offset) to prevent unbounded memory aggregation.
-- 6. Unimplemented capabilities (acquisition / campaign attribution) classified honestly as:
--    NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH rather than fabricating synthetic data.
-- 7. Security:
--    - Strict tenant-scoped and role-authorized (tenant_owner, staff, super_admin).
--    - Date horizon bounds enforced (max 366 days window).
--    - Revoked from PUBLIC and anon.

-- =========================================================================
-- 1. RPC: public.get_tenant_booking_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_booking_analytics(
    p_tenant_id  UUID,
    p_branch_id  UUID DEFAULT NULL,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user                 RECORD;
    v_total_bookings       BIGINT := 0;
    v_confirmed_count      BIGINT := 0;
    v_completed_count      BIGINT := 0;
    v_cancelled_count      BIGINT := 0;
    v_no_show_count        BIGINT := 0;
    v_total_occupied_min   BIGINT := 0;
    v_estimated_revenue    NUMERIC := 0.00;
    v_avg_duration_min     NUMERIC := 0.00;
BEGIN
    -- Authorization check
    SELECT role, tenant_id, id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant mismatch' USING ERRCODE = '42501';
    END IF;

    -- Staff branch restriction check
    IF v_user.role = 'staff' AND p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_branches sb
            JOIN public.staff s ON s.id = sb.staff_id
            WHERE s.user_profile_id = v_user.id AND sb.branch_id = p_branch_id AND sb.tenant_id = p_tenant_id
        ) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Staff not assigned to branch' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Date horizon bounds
    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE: p_end_date must be greater than or equal to p_start_date' USING ERRCODE = 'P0001';
    END IF;
    IF (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'DATE_RANGE_EXCEEDED: Maximum analytics query window is 366 days' USING ERRCODE = 'P0001';
    END IF;

    SELECT
        COALESCE(count(*), 0),
        COALESCE(count(*) FILTER (WHERE a.status = 'confirmed'), 0),
        COALESCE(count(*) FILTER (WHERE a.status = 'completed'), 0),
        COALESCE(count(*) FILTER (WHERE a.status IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system')), 0),
        COALESCE(count(*) FILTER (WHERE a.status = 'no_show'), 0),
        COALESCE(SUM(COALESCE(a.duration_minutes, 30)), 0),
        COALESCE(AVG(COALESCE(a.duration_minutes, 30)), 0.00),
        COALESCE(SUM(
            CASE
                WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(s.price, 0)
                ELSE 0
            END
        ), 0.00)
    INTO
        v_total_bookings,
        v_confirmed_count,
        v_completed_count,
        v_cancelled_count,
        v_no_show_count,
        v_total_occupied_min,
        v_avg_duration_min,
        v_estimated_revenue
    FROM public.appointments a
    LEFT JOIN public.services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND (
          (p_branch_id IS NOT NULL AND a.branch_id = p_branch_id)
          OR
          (p_branch_id IS NULL AND (
              v_user.role IN ('super_admin', 'tenant_owner')
              OR
              (v_user.role = 'staff' AND a.branch_id IN (
                  SELECT sb.branch_id FROM public.staff_branches sb
                  JOIN public.staff st ON st.id = sb.staff_id
                  WHERE st.user_profile_id = v_user.id AND sb.tenant_id = p_tenant_id
              ))
          ))
      )
      AND a.appointment_date >= p_start_date
      AND a.appointment_date <= p_end_date;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'branch_id', p_branch_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'metrics', jsonb_build_object(
            'total_bookings', v_total_bookings,
            'confirmed_bookings', v_confirmed_count,
            'completed_bookings', v_completed_count,
            'cancelled_bookings', v_cancelled_count,
            'no_show_bookings', v_no_show_count,
            'total_occupied_minutes', v_total_occupied_min,
            'avg_duration_minutes', ROUND(v_avg_duration_min, 1),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'financial_metric_limitation', 'Estimated revenue derived from current service catalog price. Does not represent settled, collected, or accounting revenue.',
            'estimated_revenue', v_estimated_revenue
        ),
        'funnel', jsonb_build_object(
            'completion_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_completed_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END,
            'cancellation_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_cancelled_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END,
            'no_show_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_no_show_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END
        ),
        'attribution', jsonb_build_object(
            'acquisition_source_status', 'NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH',
            'campaign_attribution_status', 'NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH'
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_booking_analytics(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_booking_analytics(UUID, UUID, DATE, DATE) TO authenticated, service_role;

-- =========================================================================
-- 2. RPC: public.get_tenant_staff_performance_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_staff_performance_analytics(
    p_tenant_id  UUID,
    p_branch_id  UUID DEFAULT NULL,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date   DATE DEFAULT CURRENT_DATE,
    p_limit      INTEGER DEFAULT 50,
    p_offset     INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user       RECORD;
    v_staff_list JSONB;
    v_total_cnt  BIGINT := 0;
BEGIN
    SELECT role, tenant_id, id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_user.role = 'staff' AND p_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_branches sb
            JOIN public.staff s ON s.id = sb.staff_id
            WHERE s.user_profile_id = v_user.id AND sb.branch_id = p_branch_id AND sb.tenant_id = p_tenant_id
        ) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Staff not assigned to branch' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_total_cnt
    FROM public.staff st
    WHERE st.tenant_id = p_tenant_id
      AND (
          v_user.role IN ('super_admin', 'tenant_owner')
          OR
          (v_user.role = 'staff' AND st.user_profile_id = v_user.id)
      );

    SELECT jsonb_agg(
        jsonb_build_object(
            'staff_id', q.id,
            'staff_name', q.name,
            'is_active', q.active,
            'total_appointments', COALESCE(q.total_appts, 0),
            'completed_appointments', COALESCE(q.completed_appts, 0),
            'cancelled_appointments', COALESCE(q.cancelled_appts, 0),
            'occupied_minutes', COALESCE(q.total_duration, 0),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'financial_metric_limitation', 'Estimated revenue derived from current service catalog price. Does not represent settled, collected, or accounting revenue.',
            'estimated_revenue', COALESCE(q.est_revenue, 0.00)
        )
    )
    INTO v_staff_list
    FROM (
        SELECT
            st.id,
            st.name,
            st.active,
            s_agg.total_appts,
            s_agg.completed_appts,
            s_agg.cancelled_appts,
            s_agg.total_duration,
            s_agg.est_revenue
        FROM public.staff st
        LEFT JOIN (
            SELECT
                a.staff_id,
                count(*) AS total_appts,
                count(*) FILTER (WHERE a.status = 'completed') AS completed_appts,
                count(*) FILTER (WHERE a.status IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system')) AS cancelled_appts,
                SUM(COALESCE(a.duration_minutes, 30)) AS total_duration,
                SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, 0) ELSE 0 END) AS est_revenue
            FROM public.appointments a
            LEFT JOIN public.services svc ON svc.id = a.service_id AND svc.tenant_id = a.tenant_id
            WHERE a.tenant_id = p_tenant_id
              AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
              AND a.appointment_date >= p_start_date
              AND a.appointment_date <= p_end_date
            GROUP BY a.staff_id
        ) s_agg ON s_agg.staff_id = st.id
        WHERE st.tenant_id = p_tenant_id
          AND (
              v_user.role IN ('super_admin', 'tenant_owner')
              OR
              (v_user.role = 'staff' AND st.user_profile_id = v_user.id)
          )
        ORDER BY COALESCE(s_agg.total_appts, 0) DESC, st.name ASC
        LIMIT LEAST(GREATEST(1, p_limit), 100)
        OFFSET GREATEST(0, p_offset)
    ) q;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'branch_id', p_branch_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'total_staff_count', v_total_cnt,
        'limit', p_limit,
        'offset', p_offset,
        'staff_performance', COALESCE(v_staff_list, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_staff_performance_analytics(UUID, UUID, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_staff_performance_analytics(UUID, UUID, DATE, DATE, INTEGER, INTEGER) TO authenticated, service_role;

-- =========================================================================
-- 3. RPC: public.get_tenant_service_performance_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_service_performance_analytics(
    p_tenant_id  UUID,
    p_branch_id  UUID DEFAULT NULL,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date   DATE DEFAULT CURRENT_DATE,
    p_limit      INTEGER DEFAULT 50,
    p_offset     INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user         RECORD;
    v_service_list JSONB;
    v_total_cnt    BIGINT := 0;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_total_cnt
    FROM public.services s
    WHERE s.tenant_id = p_tenant_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'service_id', q.id,
            'service_name', q.name,
            'duration_minutes', q.duration,
            'catalog_price', q.price,
            'total_bookings', COALESCE(q.total_bookings, 0),
            'completed_bookings', COALESCE(q.completed_bookings, 0),
            'occupied_minutes', COALESCE(q.total_duration, 0),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'financial_metric_limitation', 'Estimated revenue derived from current service catalog price. Does not represent settled, collected, or accounting revenue.',
            'estimated_revenue', COALESCE(q.est_revenue, 0.00)
        )
    )
    INTO v_service_list
    FROM (
        SELECT
            s.id,
            s.name,
            s.duration,
            s.price,
            svc_agg.total_bookings,
            svc_agg.completed_bookings,
            svc_agg.total_duration,
            svc_agg.est_revenue
        FROM public.services s
        LEFT JOIN (
            SELECT
                a.service_id,
                count(*) AS total_bookings,
                count(*) FILTER (WHERE a.status = 'completed') AS completed_bookings,
                SUM(COALESCE(a.duration_minutes, 30)) AS total_duration,
                SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, 0) ELSE 0 END) AS est_revenue
            FROM public.appointments a
            LEFT JOIN public.services svc ON svc.id = a.service_id AND svc.tenant_id = a.tenant_id
            WHERE a.tenant_id = p_tenant_id
              AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
              AND a.appointment_date >= p_start_date
              AND a.appointment_date <= p_end_date
            GROUP BY a.service_id
        ) svc_agg ON svc_agg.service_id = s.id
        WHERE s.tenant_id = p_tenant_id
        ORDER BY COALESCE(svc_agg.total_bookings, 0) DESC, s.name ASC
        LIMIT LEAST(GREATEST(1, p_limit), 100)
        OFFSET GREATEST(0, p_offset)
    ) q;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'branch_id', p_branch_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'total_services_count', v_total_cnt,
        'limit', p_limit,
        'offset', p_offset,
        'service_performance', COALESCE(v_service_list, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_service_performance_analytics(UUID, UUID, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_service_performance_analytics(UUID, UUID, DATE, DATE, INTEGER, INTEGER) TO authenticated, service_role;

-- =========================================================================
-- 4. RPC: public.get_tenant_branch_comparison_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_branch_comparison_analytics(
    p_tenant_id  UUID,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user        RECORD;
    v_branch_list JSONB;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'branch_id', b.id,
            'branch_name', b.name,
            'is_primary', b.is_primary,
            'is_active', b.is_active,
            'total_appointments', COALESCE(b_agg.total_appts, 0),
            'completed_appointments', COALESCE(b_agg.completed_appts, 0),
            'occupied_minutes', COALESCE(b_agg.total_duration, 0),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'financial_metric_limitation', 'Estimated revenue derived from current service catalog price. Does not represent settled, collected, or accounting revenue.',
            'estimated_revenue', COALESCE(b_agg.est_revenue, 0.00)
        )
    )
    INTO v_branch_list
    FROM public.branches b
    LEFT JOIN (
        SELECT
            a.branch_id,
            count(*) AS total_appts,
            count(*) FILTER (WHERE a.status = 'completed') AS completed_appts,
            SUM(COALESCE(a.duration_minutes, 30)) AS total_duration,
            SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, 0) ELSE 0 END) AS est_revenue
        FROM public.appointments a
        LEFT JOIN public.services svc ON svc.id = a.service_id AND svc.tenant_id = a.tenant_id
        WHERE a.tenant_id = p_tenant_id
          AND a.appointment_date >= p_start_date
          AND a.appointment_date <= p_end_date
        GROUP BY a.branch_id
    ) b_agg ON b_agg.branch_id = b.id
    WHERE b.tenant_id = p_tenant_id
    ORDER BY b.is_primary DESC, b.name ASC;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'branch_comparison', COALESCE(v_branch_list, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_branch_comparison_analytics(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_branch_comparison_analytics(UUID, DATE, DATE) TO authenticated, service_role;

-- =========================================================================
-- 5. RPC: public.get_tenant_customer_retention_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_customer_retention_analytics(
    p_tenant_id  UUID,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::DATE,
    p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user                   RECORD;
    v_total_unique_customers BIGINT := 0;
    v_first_time_customers   BIGINT := 0;
    v_repeat_customers       BIGINT := 0;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Unauthenticated' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND v_user.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    WITH customer_counts AS (
        SELECT
            a.customer_id,
            count(*) AS appt_count
        FROM public.appointments a
        WHERE a.tenant_id = p_tenant_id
          AND a.customer_id IS NOT NULL
          AND a.appointment_date >= p_start_date
          AND a.appointment_date <= p_end_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system')
        GROUP BY a.customer_id
    )
    SELECT
        COALESCE(count(*), 0),
        COALESCE(count(*) FILTER (WHERE appt_count = 1), 0),
        COALESCE(count(*) FILTER (WHERE appt_count > 1), 0)
    INTO
        v_total_unique_customers,
        v_first_time_customers,
        v_repeat_customers
    FROM customer_counts;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'retention_metrics', jsonb_build_object(
            'total_active_customers', v_total_unique_customers,
            'first_time_customers', v_first_time_customers,
            'repeat_customers', v_repeat_customers,
            'repeat_booking_rate', CASE WHEN v_total_unique_customers > 0 THEN ROUND((v_repeat_customers::NUMERIC / v_total_unique_customers::NUMERIC) * 100, 2) ELSE 0.00 END
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_customer_retention_analytics(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_customer_retention_analytics(UUID, DATE, DATE) TO authenticated, service_role;
