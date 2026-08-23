-- =========================================================================
-- STAGE H1E — COMMERCIAL LIFECYCLE ELIGIBILITY & ENTITLEMENT ALIGNMENT
-- Migration: 20260908_commercial_lifecycle_eligibility_alignment.sql
-- Description:
--   Forward-redefines resolve_tenant_commercial_eligibility and
--   resolve_effective_tenant_entitlements to establish canonical
--   commercial lifecycle semantics across active, manual_active, comped,
--   trialing (trial_end authority), and past_due (grace_until authority).
-- =========================================================================

-- 1. Redefine resolve_tenant_commercial_eligibility
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
    IF v_sub.status IN ('active', 'manual_active', 'comped') THEN
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

-- 2. Redefine resolve_effective_tenant_entitlements
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

    -- Resolve active subscription's plan_version_id for this tenant using canonical status/temporal authority
    SELECT sub.plan_version_id INTO v_sub_plan_version_id
    FROM public.subscriptions sub
    WHERE sub.tenant_id = p_tenant_id
      AND (
          sub.status IN ('active', 'manual_active', 'comped')
          OR (sub.status = 'trialing' AND (sub.trial_end IS NULL OR sub.trial_end > p_at))
          OR (sub.status = 'past_due' AND (sub.grace_until IS NULL OR sub.grace_until > p_at))
      )
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
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.ival
            WHEN pd.fkey IS NOT NULL THEN pd.ival
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
        END AS json_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN false
            WHEN o.ovr_id IS NOT NULL THEN o.unlim
            WHEN pd.fkey IS NOT NULL THEN pd.unlim
            ELSE false
        END AS is_unlimited,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 'platform_restriction'
            WHEN o.ovr_id IS NOT NULL THEN 'tenant_override'
            WHEN pd.fkey IS NOT NULL THEN 'plan_default'
            ELSE 'default_deny'
        END AS source,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN NULL
            WHEN pd.fkey IS NOT NULL THEN v_sub_plan_version_id
            ELSE NULL
        END AS plan_version_id,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.ovr_id
            ELSE NULL
        END AS override_id
    FROM all_keys k
    LEFT JOIN platform_rest pr ON pr.fkey = k.fkey
    LEFT JOIN active_overrides o ON o.fkey = k.fkey
    LEFT JOIN plan_defaults pd ON pd.fkey = k.fkey;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_effective_tenant_entitlements(UUID, TIMESTAMPTZ) TO authenticated;
