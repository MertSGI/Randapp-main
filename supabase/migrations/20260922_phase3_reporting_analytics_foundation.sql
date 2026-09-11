-- Migration: 20260922_phase3_reporting_analytics_foundation.sql
-- Implementation Authority ID: LARI-PROGRAM-V2-PHASE3-REPORTING-ANALYTICS-FOUNDATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Goals:
-- 1. Server-Authoritative Reporting & Analytics RPCs:
--    - get_tenant_booking_analytics: booking count, completed, cancelled, no-show, booking funnel.
--    - get_tenant_staff_performance_analytics: staff utilization, booking distribution, completed ratio.
--    - get_tenant_service_performance_analytics: service popularity, estimated revenue.
--    - get_tenant_branch_comparison_analytics: multi-branch comparative metrics.
--    - get_tenant_customer_retention_analytics: retention primitives, first-time vs repeat bookings.
--
-- 2. Mandatory Financial Semantics:
--    - Appointment-price-derived metrics MUST be strictly labeled ESTIMATED_REVENUE.
--    - Financial distinction: must not represent real ledger settled funds.
--    - Price resolution: joins public.services.price or public.services.base_price where available.
--
-- 3. Reporting Security & Isolation:
--    - Strict tenant-scoped and branch-scoped filtering.
--    - Date horizon bounds enforced (p_start_date, p_end_date, max 366 days window to prevent DoS).
--    - Role-authorized (only tenant_owner, staff, super_admin).
--    - Revoked from PUBLIC and anon.
--    - Database-side aggregation returning clean structured JSONB summaries (zero browser dump of all appointments).

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
    v_total_bookings       BIGINT := 0;
    v_confirmed_count      BIGINT := 0;
    v_completed_count      BIGINT := 0;
    v_cancelled_count      BIGINT := 0;
    v_no_show_count        BIGINT := 0;
    v_estimated_revenue    NUMERIC := 0.00;
    v_avg_duration_min     NUMERIC := 0.00;
BEGIN
    -- Authorization check
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = p_tenant_id))
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff access required for booking analytics' USING ERRCODE = '42501';
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
        COALESCE(AVG(a.duration_minutes), 0.00),
        COALESCE(SUM(
            CASE
                WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(s.price, s.base_price, 0)
                ELSE 0
            END
        ), 0.00)
    INTO
        v_total_bookings,
        v_confirmed_count,
        v_completed_count,
        v_cancelled_count,
        v_no_show_count,
        v_avg_duration_min,
        v_estimated_revenue
    FROM public.appointments a
    LEFT JOIN public.services s ON s.id = a.service_id
    WHERE a.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
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
            'avg_duration_minutes', ROUND(v_avg_duration_min, 1),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'estimated_revenue', v_estimated_revenue
        ),
        'funnel', jsonb_build_object(
            'completion_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_completed_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END,
            'cancellation_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_cancelled_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END,
            'no_show_rate', CASE WHEN v_total_bookings > 0 THEN ROUND((v_no_show_count::NUMERIC / v_total_bookings::NUMERIC) * 100, 2) ELSE 0.00 END
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
    p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_staff_list JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = p_tenant_id))
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'staff_id', st.id,
            'staff_name', st.name,
            'is_active', st.active,
            'total_appointments', COALESCE(s_agg.total_appts, 0),
            'completed_appointments', COALESCE(s_agg.completed_appts, 0),
            'cancelled_appointments', COALESCE(s_agg.cancelled_appts, 0),
            'total_duration_minutes', COALESCE(s_agg.total_duration, 0),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'estimated_revenue', COALESCE(s_agg.est_revenue, 0.00)
        )
    )
    INTO v_staff_list
    FROM public.staff st
    LEFT JOIN (
        SELECT
            a.staff_id,
            count(*) AS total_appts,
            count(*) FILTER (WHERE a.status = 'completed') AS completed_appts,
            count(*) FILTER (WHERE a.status IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system')) AS cancelled_appts,
            SUM(COALESCE(a.duration_minutes, 30)) AS total_duration,
            SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, svc.base_price, 0) ELSE 0 END) AS est_revenue
        FROM public.appointments a
        LEFT JOIN public.services svc ON svc.id = a.service_id
        WHERE a.tenant_id = p_tenant_id
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
          AND a.appointment_date >= p_start_date
          AND a.appointment_date <= p_end_date
        GROUP BY a.staff_id
    ) s_agg ON s_agg.staff_id = st.id
    WHERE st.tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'branch_id', p_branch_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'staff_performance', COALESCE(v_staff_list, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_staff_performance_analytics(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_staff_performance_analytics(UUID, UUID, DATE, DATE) TO authenticated, service_role;

-- =========================================================================
-- 3. RPC: public.get_tenant_service_performance_analytics
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_service_performance_analytics(
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
    v_service_list JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = p_tenant_id))
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'service_id', s.id,
            'service_name', s.name,
            'duration_minutes', s.duration,
            'total_bookings', COALESCE(svc_agg.total_bookings, 0),
            'completed_bookings', COALESCE(svc_agg.completed_bookings, 0),
            'financial_metric_classification', 'ESTIMATED_REVENUE',
            'estimated_revenue', COALESCE(svc_agg.est_revenue, 0.00)
        )
    )
    INTO v_service_list
    FROM public.services s
    LEFT JOIN (
        SELECT
            a.service_id,
            count(*) AS total_bookings,
            count(*) FILTER (WHERE a.status = 'completed') AS completed_bookings,
            SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, svc.base_price, 0) ELSE 0 END) AS est_revenue
        FROM public.appointments a
        LEFT JOIN public.services svc ON svc.id = a.service_id
        WHERE a.tenant_id = p_tenant_id
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
          AND a.appointment_date >= p_start_date
          AND a.appointment_date <= p_end_date
        GROUP BY a.service_id
    ) svc_agg ON svc_agg.service_id = s.id
    WHERE s.tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'branch_id', p_branch_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'service_performance', COALESCE(v_service_list, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_service_performance_analytics(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_service_performance_analytics(UUID, UUID, DATE, DATE) TO authenticated, service_role;

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
    v_branch_list JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = p_tenant_id))
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
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
            'financial_metric_classification', 'ESTIMATED_REVENUE',
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
            SUM(CASE WHEN a.status IN ('confirmed', 'completed') THEN COALESCE(svc.price, svc.base_price, 0) ELSE 0 END) AS est_revenue
        FROM public.appointments a
        LEFT JOIN public.services svc ON svc.id = a.service_id
        WHERE a.tenant_id = p_tenant_id
          AND a.appointment_date >= p_start_date
          AND a.appointment_date <= p_end_date
        GROUP BY a.branch_id
    ) b_agg ON b_agg.branch_id = b.id
    WHERE b.tenant_id = p_tenant_id;

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
    v_total_unique_customers BIGINT := 0;
    v_first_time_customers   BIGINT := 0;
    v_repeat_customers       BIGINT := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = p_tenant_id))
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_end_date < p_start_date OR (p_end_date - p_start_date) > 366 THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'P0001';
    END IF;

    -- Count customers with appointments in window
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
