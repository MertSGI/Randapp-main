-- =========================================================================
-- STAGE H1C — FEATURE GATE REASON CODE & TRIGGER HARDENING FIX
-- Migration: 20260814_h1c_feature_gate_reason_code_fix.sql
-- Description: Ensures enforce_staff_quota and enforce_service_quota triggers
--              explicitly check staff_management and service_management feature
--              gates before numerical quota evaluation, raising
--              'commercial_feature_disabled' when management features are disabled.
-- Governance: Forward-only migration 39. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- 1. Hardened enforce_staff_quota trigger function
CREATE OR REPLACE FUNCTION public.enforce_staff_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_action     JSONB;
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    -- Only enforce on active insert or reactivation
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW; -- not changing active count
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW; -- deactivation always allowed
        END IF;
    END IF;

    -- 1. Check feature gate for staff_management
    v_action := public.assert_tenant_commercial_action_allowed(NEW.tenant_id, 'staff_management');
    IF NOT (v_action->>'allowed')::boolean THEN
        RAISE EXCEPTION 'commercial_feature_disabled' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Resolve staff numerical quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_staff');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    -- 3. Lock and count
    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_staff', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.staff
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Hardened enforce_service_quota trigger function
CREATE OR REPLACE FUNCTION public.enforce_service_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_action     JSONB;
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.active = true AND NEW.active = true THEN
            RETURN NEW;
        END IF;
        IF NEW.active IS NOT TRUE THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 1. Check feature gate for service_management
    v_action := public.assert_tenant_commercial_action_allowed(NEW.tenant_id, 'service_management');
    IF NOT (v_action->>'allowed')::boolean THEN
        RAISE EXCEPTION 'commercial_feature_disabled' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Resolve service numerical quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_services');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_services', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.services
    WHERE tenant_id = NEW.tenant_id AND active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;
