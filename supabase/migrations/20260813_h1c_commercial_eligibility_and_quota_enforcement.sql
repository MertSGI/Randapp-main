-- =========================================================================
-- STAGE H1C — SERVER-AUTHORITATIVE COMMERCIAL ELIGIBILITY & QUOTA ENFORCEMENT
-- Migration: 20260813_h1c_commercial_eligibility_and_quota_enforcement.sql
-- Description: Implements server-authoritative commercial eligibility checks,
--              feature gates, staff/service/branch quotas, monthly appointment
--              quota with concurrency-safe usage accounting, and enforcement
--              diagnostics. All enforcement occurs inside the mutation transaction.
-- Governance: Forward-only migration 38. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- =========================================================================
-- SECTION 0: CANONICAL STAGING TENANT COMMERCIAL BOOTSTRAP
-- Persistent staging configuration, not a disposable test fixture.
-- =========================================================================

DO $$
DECLARE
    v_tenant_id    UUID := 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
    v_plan_ver_id  UUID;
    v_sub_id       UUID;
BEGIN
    -- Get baslangic Version 1 published plan_version_id
    SELECT pv.id INTO v_plan_ver_id
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'baslangic'
      AND pv.version_number = 1
      AND pv.lifecycle_status = 'published'
    LIMIT 1;

    IF v_plan_ver_id IS NULL THEN
        RAISE EXCEPTION 'Cannot bootstrap: baslangic Version 1 published plan not found';
    END IF;

    -- Check if canonical tenant already has a subscription
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub_id IS NOT NULL THEN
        -- Update existing subscription to active baslangic
        UPDATE public.subscriptions
        SET plan_id = 'baslangic',
            plan_version_id = v_plan_ver_id,
            status = 'active',
            billing_mode = 'manual',
            current_period_start = now(),
            current_period_end = now() + interval '1 year',
            updated_at = now()
        WHERE id = v_sub_id;
    ELSE
        -- Insert new canonical subscription
        INSERT INTO public.subscriptions (
            tenant_id, plan_id, plan_version_id, status, billing_mode,
            current_period_start, current_period_end
        ) VALUES (
            v_tenant_id, 'baslangic', v_plan_ver_id, 'active', 'manual',
            now(), now() + interval '1 year'
        )
        RETURNING id INTO v_sub_id;
    END IF;

    -- Record bootstrap event
    INSERT INTO public.subscription_events (
        subscription_id, tenant_id, event_type,
        previous_state, new_state, internal_reason,
        actor_role
    )
    SELECT
        s.id, v_tenant_id, 'plan_assigned',
        '{}'::jsonb,
        to_jsonb(s),
        'H1C staging commercial enforcement bootstrap',
        'system'
    FROM public.subscriptions s
    WHERE s.id = v_sub_id;

    RAISE NOTICE 'Canonical tenant bootstrapped with baslangic Version 1 active/manual';
END;
$$;

-- =========================================================================
-- SECTION 1: INTERNAL HELPERS (NOT browser-callable)
-- =========================================================================

-- 10. Forward-fix resolve_effective_tenant_entitlements CASE type mismatch (boolean_value)
CREATE OR REPLACE FUNCTION public.resolve_effective_tenant_entitlements(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    feature_key TEXT,
    value_type TEXT,
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    "json_value" JSONB,
    is_unlimited BOOLEAN,
    source TEXT,
    plan_version_id UUID,
    override_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_plan_version_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN;
    END IF;

    -- Resolve active subscription's plan_version_id for this tenant
    SELECT sub.plan_version_id INTO v_sub_plan_version_id
    FROM public.subscriptions sub
    WHERE sub.tenant_id = p_tenant_id
      AND sub.status IN ('active', 'manual_active', 'comped', 'trialing')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > p_at)
    ORDER BY sub.created_at DESC
    LIMIT 1;

    RETURN QUERY
    WITH all_keys AS (
        SELECT f.feature_key AS fkey, f.value_type AS vtype
        FROM public.commercial_feature_definitions f
    ),
    -- Level 1: Platform / System Restriction (Highest Precedence)
    platform_rest AS (
        SELECT DISTINCT ON (pr.feature_key)
            pr.feature_key AS fkey
        FROM public.platform_system_restrictions pr
        WHERE (pr.tenant_id = p_tenant_id OR pr.tenant_id IS NULL)
          AND pr.is_restricted = true
          AND pr.starts_at <= p_at
          AND (pr.expires_at IS NULL OR pr.expires_at > p_at)
        ORDER BY pr.feature_key, pr.tenant_id NULLS LAST, pr.starts_at DESC
    ),
    -- Level 2: Active Tenant Override
    active_overrides AS (
        SELECT DISTINCT ON (o.feature_key)
            o.id AS ovr_id,
            o.feature_key AS fkey,
            o.value_type AS vtype,
            o.boolean_value AS bval,
            o.integer_value AS ival,
            o.text_value AS tval,
            o.json_value AS jval,
            o.is_unlimited AS unlim
        FROM public.tenant_entitlement_overrides o
        WHERE o.tenant_id = p_tenant_id
          AND o.starts_at <= p_at
          AND (o.expires_at IS NULL OR o.expires_at > p_at)
          AND o.revoked_at IS NULL
        ORDER BY o.feature_key, o.starts_at DESC, o.created_at DESC
    ),
    -- Level 3: Assigned Plan Version Default
    plan_defaults AS (
        SELECT
            pe.feature_key AS fkey,
            pe.value_type AS vtype,
            pe.boolean_value AS bval,
            pe.integer_value AS ival,
            pe.text_value AS tval,
            pe.json_value AS jval,
            pe.is_unlimited AS unlim
        FROM public.plan_entitlements pe
        WHERE pe.plan_version_id = v_sub_plan_version_id
    )
    SELECT
        k.fkey AS feature_key,
        k.vtype AS value_type,
        CASE
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'boolean' THEN false
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.bval
            WHEN pd.fkey IS NOT NULL THEN pd.bval
            WHEN k.vtype = 'boolean' THEN false
            ELSE NULL
        END AS boolean_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 0::bigint
            WHEN o.ovr_id IS NOT NULL THEN o.ival
            WHEN pd.fkey IS NOT NULL THEN pd.ival
            WHEN k.vtype = 'integer' THEN 0::bigint
            ELSE NULL
        END AS integer_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.tval
            WHEN pd.fkey IS NOT NULL THEN pd.tval
            ELSE NULL
        END AS text_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.jval
            WHEN pd.fkey IS NOT NULL THEN pd.jval
            ELSE NULL
        END AS "json_value",
        CASE
            WHEN pr.fkey IS NOT NULL THEN false
            WHEN o.ovr_id IS NOT NULL THEN o.unlim
            WHEN pd.fkey IS NOT NULL THEN pd.unlim
            ELSE false
        END AS is_unlimited,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 'platform_restriction'
            WHEN o.ovr_id IS NOT NULL THEN 'tenant_override'
            WHEN pd.fkey IS NOT NULL THEN 'plan_version'
            ELSE 'default_deny'
        END AS source,
        v_sub_plan_version_id AS plan_version_id,
        o.ovr_id AS override_id
    FROM all_keys k
    LEFT JOIN platform_rest pr ON pr.fkey = k.fkey
    LEFT JOIN active_overrides o ON o.fkey = k.fkey
    LEFT JOIN plan_defaults pd ON pd.fkey = k.fkey;
END;
$$;

-- 1a. Resolve tenant commercial eligibility
CREATE OR REPLACE FUNCTION public.resolve_tenant_commercial_eligibility(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_tenant_not_found');
    END IF;

    -- Check tenant exists
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_tenant_not_found');
    END IF;

    -- Get most recent subscription
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_subscription_missing');
    END IF;

    IF v_sub.plan_version_id IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_plan_version_missing');
    END IF;

    -- Validate plan version is published
    IF NOT EXISTS (
        SELECT 1 FROM public.plan_versions
        WHERE id = v_sub.plan_version_id AND lifecycle_status = 'published'
    ) THEN
        RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_plan_version_not_effective');
    END IF;

    -- Lifecycle status check
    IF v_sub.status = 'active' THEN
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status
        );
    END IF;

    IF v_sub.status = 'trialing' THEN
        IF v_sub.trial_end IS NOT NULL AND p_at >= v_sub.trial_end THEN
            RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_trial_expired');
        END IF;
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status, 'trial_end', v_sub.trial_end
        );
    END IF;

    IF v_sub.status = 'past_due' THEN
        IF v_sub.grace_until IS NOT NULL AND p_at >= v_sub.grace_until THEN
            RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_grace_expired');
        END IF;
        RETURN jsonb_build_object(
            'eligible', true, 'reason_code', 'commercial_allowed',
            'subscription_id', v_sub.id, 'plan_version_id', v_sub.plan_version_id,
            'status', v_sub.status, 'grace_until', v_sub.grace_until
        );
    END IF;

    -- All other statuses: denied
    RETURN jsonb_build_object('eligible', false, 'reason_code', 'commercial_status_not_eligible');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_tenant_commercial_eligibility(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- 1b. Assert tenant commercial action allowed (eligibility + feature gate)
CREATE OR REPLACE FUNCTION public.assert_tenant_commercial_action_allowed(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_elig       JSONB;
    v_ent_row    RECORD;
BEGIN
    -- Check eligibility first
    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id, p_at);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('allowed', false, 'reason_code', v_elig->>'reason_code');
    END IF;

    -- Check feature entitlement via 4-level resolver
    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        -- Feature key not found means default deny
        RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
    END IF;

    -- Boolean features: must be true
    IF v_ent_row.value_type = 'boolean' THEN
        IF v_ent_row.boolean_value IS NOT TRUE THEN
            RETURN jsonb_build_object('allowed', false, 'reason_code', 'commercial_feature_disabled');
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'commercial_allowed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_tenant_commercial_action_allowed(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- 1c. Resolve commercial quota for a feature key
CREATE OR REPLACE FUNCTION public.resolve_commercial_quota(
    p_tenant_id UUID,
    p_feature_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ent_row RECORD;
BEGIN
    SELECT * INTO v_ent_row
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
    WHERE feature_key = p_feature_key;

    IF v_ent_row.feature_key IS NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
    END IF;

    IF v_ent_row.is_unlimited IS TRUE THEN
        RETURN jsonb_build_object('is_unlimited', true, 'limit_value', NULL);
    END IF;

    IF v_ent_row.value_type = 'integer' AND v_ent_row.integer_value IS NOT NULL THEN
        RETURN jsonb_build_object('is_unlimited', false, 'limit_value', v_ent_row.integer_value);
    END IF;

    -- No integer value and not unlimited = zero allowed
    RETURN jsonb_build_object('is_unlimited', false, 'limit_value', 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_commercial_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 1d. Resolve quota period key (YYYY-MM for monthly, 'lifetime' for non-periodic)
CREATE OR REPLACE FUNCTION public.resolve_quota_period_key(
    p_tenant_id UUID,
    p_feature_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tz TEXT;
BEGIN
    IF p_feature_key = 'max_monthly_appointments' THEN
        -- Use primary branch timezone, fallback to Europe/Istanbul
        SELECT COALESCE(timezone, 'Europe/Istanbul') INTO v_tz
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_primary = true AND is_active = true
        LIMIT 1;

        IF v_tz IS NULL THEN
            v_tz := 'Europe/Istanbul';
        END IF;

        RETURN to_char(timezone(v_tz, now()), 'YYYY-MM');
    END IF;

    RETURN 'lifetime';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_quota_period_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- 1e. Consume commercial usage atomically
CREATE OR REPLACE FUNCTION public.consume_commercial_usage(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_period_key TEXT,
    p_delta INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_current    BIGINT;
    v_lock_key   BIGINT;
BEGIN
    -- Resolve quota
    v_quota := public.resolve_commercial_quota(p_tenant_id, p_feature_key);
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;

    IF v_is_unlimited THEN
        -- Still track usage but never reject
        INSERT INTO public.usage_counters (tenant_id, feature_key, period_key, usage_count)
        VALUES (p_tenant_id, p_feature_key, p_period_key, p_delta)
        ON CONFLICT (tenant_id, feature_key, period_key)
        DO UPDATE SET usage_count = public.usage_counters.usage_count + p_delta,
                      updated_at = now();

        SELECT usage_count INTO v_current
        FROM public.usage_counters
        WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key;

        RETURN jsonb_build_object('success', true, 'reason_code', 'commercial_allowed',
            'current_usage', v_current, 'limit_value', NULL, 'is_unlimited', true);
    END IF;

    v_limit := (v_quota->>'limit_value')::bigint;

    -- Acquire deterministic lock for this tenant+feature+period
    v_lock_key := hashtextextended(p_tenant_id::text || ':' || p_feature_key || ':' || p_period_key, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Upsert with initial 0 if missing, then read current
    INSERT INTO public.usage_counters (tenant_id, feature_key, period_key, usage_count)
    VALUES (p_tenant_id, p_feature_key, p_period_key, 0)
    ON CONFLICT (tenant_id, feature_key, period_key) DO NOTHING;

    SELECT usage_count INTO v_current
    FROM public.usage_counters
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key
    FOR UPDATE;

    -- Check quota
    IF v_current + p_delta > v_limit THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'commercial_quota_exceeded',
            'current_usage', v_current, 'limit_value', v_limit, 'is_unlimited', false);
    END IF;

    -- Consume
    UPDATE public.usage_counters
    SET usage_count = usage_count + p_delta, updated_at = now()
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key AND period_key = p_period_key;

    RETURN jsonb_build_object('success', true, 'reason_code', 'commercial_allowed',
        'current_usage', v_current + p_delta, 'limit_value', v_limit, 'is_unlimited', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_commercial_usage(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- SECTION 2: QUOTA ENFORCEMENT TRIGGERS (staff, services, branches)
-- =========================================================================

-- 2a. Staff quota trigger
CREATE OR REPLACE FUNCTION public.enforce_staff_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
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

    -- Resolve quota
    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_staff');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    -- Lock and count
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

DROP TRIGGER IF EXISTS trg_enforce_staff_quota ON public.staff;
CREATE TRIGGER trg_enforce_staff_quota
    BEFORE INSERT OR UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_quota();

-- 2b. Service quota trigger
CREATE OR REPLACE FUNCTION public.enforce_service_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
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

DROP TRIGGER IF EXISTS trg_enforce_service_quota ON public.services;
CREATE TRIGGER trg_enforce_service_quota
    BEFORE INSERT OR UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.enforce_service_quota();

-- 2c. Branch quota trigger
CREATE OR REPLACE FUNCTION public.enforce_branch_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_quota      JSONB;
    v_is_unlimited BOOLEAN;
    v_limit      BIGINT;
    v_count      BIGINT;
    v_lock_key   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_active = true AND NEW.is_active = true THEN
            RETURN NEW;
        END IF;
        IF NEW.is_active IS NOT TRUE THEN
            RETURN NEW;
        END IF;
    END IF;

    v_quota := public.resolve_commercial_quota(NEW.tenant_id, 'max_branches');
    v_is_unlimited := (v_quota->>'is_unlimited')::boolean;
    IF v_is_unlimited THEN
        RETURN NEW;
    END IF;
    v_limit := (v_quota->>'limit_value')::bigint;

    v_lock_key := hashtextextended(NEW.tenant_id::text || ':max_branches', 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT count(*) INTO v_count
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id AND is_active = true AND id != NEW.id;

    IF v_count >= v_limit THEN
        RAISE EXCEPTION 'commercial_quota_exceeded' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_quota ON public.branches;
CREATE TRIGGER trg_enforce_branch_quota
    BEFORE INSERT OR UPDATE ON public.branches
    FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_quota();

-- =========================================================================
-- SECTION 3: UPDATED PUBLIC BOOKING RPCs
-- =========================================================================

-- 3a. Updated can_accept_public_booking with commercial eligibility
CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_elig jsonb;
    v_action jsonb;
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'allowed', false, 'reason_code', 'tenant_not_found');
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'tenant_inactive');
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'onboarding_incomplete');
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'site_unpublished');
    END IF;

    -- 5. Commercial eligibility check
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'entitlement_inactive');
    END IF;

    -- 6. Core booking feature gate
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('found', true, 'allowed', false, 'reason_code', 'entitlement_inactive');
    END IF;

    -- 7. All checks passed
    RETURN jsonb_build_object('found', true, 'allowed', true, 'reason_code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon, authenticated;

-- 3b. Updated create_public_booking with commercial enforcement
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
    v_elig                  jsonb;
    v_action                jsonb;
    v_period_key            text;
    v_usage_res             jsonb;
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

    -- Gate 4: Commercial Eligibility (H1C)
    v_stage := 'commercial_eligibility';
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4b: Core Booking Feature Gate (H1C)
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
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

    -- Gate 7: Monthly Appointment Quota (H1C)
    v_stage := 'appointment_quota';
    v_period_key := public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments');
    v_usage_res := public.consume_commercial_usage(v_tenant_id, 'max_monthly_appointments', v_period_key);
    IF NOT (v_usage_res->>'success')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 8: Shared Slot Evaluator Engine Execution
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

    -- Gate 9: Customer Upsert
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

    -- Gate 10: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 11: Appointment Creation
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

    -- Gate 12: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 13: Idempotency Record
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

-- =========================================================================
-- SECTION 4: CUSTOMER OPERATION GATES
-- =========================================================================

-- 4a. Updated cancel_public_appointment_by_manage_token with commercial feature gate
CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
    v_action            jsonb;
BEGIN
    -- Step 1: Input hygiene
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- Step 2: Compute SHA-256 digest
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- Step 3: Match token record
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4: Lock appointment row
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4b: Commercial feature gate (H1C) — customer_cancellation
    v_action := public.assert_tenant_commercial_action_allowed(v_appointment.tenant_id, 'customer_cancellation');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'feature_unavailable');
    END IF;

    -- Step 5: Transition State Machine
    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id, actor_id, actor_role, action,
            resource_type, resource_id, payload
        ) VALUES (
            v_appointment.tenant_id::text, 'customer_token', 'customer',
            'appointment_cancelled_by_customer', 'appointment',
            v_appointment.id::text,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata
        ) VALUES (
            v_appointment.tenant_id::text,
            COALESCE(v_appointment.phone, v_appointment.user_email, v_appointment.id::text),
            'whatsapp', 'Randevunuz iptal edildi.', 'queued',
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true, 'reason_code', 'ok', 'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback
    RETURN jsonb_build_object(
        'success', false, 'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id, 'status', v_appointment.status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

-- =========================================================================
-- SECTION 5: DIAGNOSTIC RPCs
-- =========================================================================

-- 5a. Self-service enforcement snapshot (authenticated user's own tenant)
CREATE OR REPLACE FUNCTION public.get_my_commercial_enforcement_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID := auth.uid();
    v_tenant_id UUID;
    v_elig      JSONB;
    v_result    JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.users_profile
    WHERE id = v_user_id AND active = true;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_tenant');
    END IF;

    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);

    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'eligibility', v_elig,
        'feature_gates', (
            SELECT jsonb_object_agg(feature_key, jsonb_build_object(
                'value_type', value_type,
                'boolean_value', boolean_value,
                'integer_value', integer_value,
                'is_unlimited', is_unlimited,
                'source', source
            ))
            FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
            WHERE feature_key IN ('core_booking', 'customer_cancellation', 'customer_reschedule_request',
                                  'admin_appointment_operations', 'staff_management', 'service_management',
                                  'max_staff', 'max_services', 'max_branches', 'max_monthly_appointments')
        )
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commercial_enforcement_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_enforcement_snapshot() TO authenticated;

-- 5b. Super Admin enforcement snapshot for any tenant
CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_elig  JSONB;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    v_elig := public.resolve_tenant_commercial_eligibility(p_tenant_id);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'eligibility', v_elig,
        'feature_gates', (
            SELECT jsonb_object_agg(feature_key, jsonb_build_object(
                'value_type', value_type,
                'boolean_value', boolean_value,
                'integer_value', integer_value,
                'is_unlimited', is_unlimited,
                'source', source
            ))
            FROM public.resolve_effective_tenant_entitlements(p_tenant_id)
            WHERE feature_key IN ('core_booking', 'customer_cancellation', 'customer_reschedule_request',
                                  'admin_appointment_operations', 'staff_management', 'service_management',
                                  'max_staff', 'max_services', 'max_branches', 'max_monthly_appointments')
        ),
        'usage', (
            SELECT COALESCE(jsonb_object_agg(feature_key || ':' || period_key, usage_count), '{}'::jsonb)
            FROM public.usage_counters
            WHERE tenant_id = p_tenant_id
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_enforcement_snapshot(UUID) TO authenticated;
