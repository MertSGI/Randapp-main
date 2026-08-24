-- ============================================================================
-- Migration 65: Clinic AI Assist Commercial Authority & Atomic Quota Reservation
--
-- Description:
-- Establishes server-authoritative, concurrency-safe commercial entitlement
-- and quota consumption RPC for Clinic AI Assist (Speech-to-Text & SOAP Draft).
--
-- Features:
-- 1. Verifies tenant commercial lifecycle eligibility via resolve_tenant_commercial_eligibility
-- 2. Checks canonical ai_allowance entitlement via resolve_effective_tenant_entitlements
-- 3. Performs atomic reservation/consumption using pg_advisory_xact_lock on public.usage_counters
-- 4. Operates on deterministic YYYY-MM period key
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clinic_check_and_consume_ai_allowance(
    p_tenant_id UUID,
    p_delta INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_eligible_res  JSONB;
    v_is_eligible   BOOLEAN;
    v_ent           RECORD;
    v_has_ent       BOOLEAN := false;
    v_is_unlimited  BOOLEAN := false;
    v_limit         BIGINT := 0;
    v_current       BIGINT := 0;
    v_period_key    TEXT;
    v_lock_key      BIGINT;
    v_pstart        TIMESTAMPTZ;
    v_pend          TIMESTAMPTZ;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_TENANT_ID',
            'message', 'Tenant ID is required.'
        );
    END IF;

    -- 1. Verify commercial lifecycle eligibility
    v_eligible_res := public.resolve_tenant_commercial_eligibility(p_tenant_id, now());
    v_is_eligible  := COALESCE((v_eligible_res->>'is_eligible')::boolean, false);

    IF NOT v_is_eligible THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'COMMERCIAL_NOT_ELIGIBLE',
            'message', 'Tenant commercial lifecycle is not eligible for AI operations.',
            'eligibility_details', v_eligible_res
        );
    END IF;

    -- 2. Resolve canonical ai_allowance entitlement
    SELECT
        e.boolean_value,
        e.integer_value,
        e.is_unlimited,
        e.source
    INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, now()) e
    WHERE e.feature_key = 'ai_allowance';

    IF FOUND THEN
        v_has_ent := true;
        v_is_unlimited := COALESCE(v_ent.is_unlimited, false);
        v_limit := COALESCE(v_ent.integer_value, 0);
    END IF;

    -- If no entitlement or explicit limit is 0 (and not unlimited)
    IF NOT v_has_ent OR (NOT v_is_unlimited AND v_limit <= 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'AI_NOT_ENTITLED',
            'message', 'Tenant is not entitled to AI operations under active plan.',
            'limit_value', v_limit,
            'is_unlimited', v_is_unlimited
        );
    END IF;

    -- 3. Resolve deterministic YYYY-MM period key and timestamps
    v_period_key := to_char(timezone('UTC', now()), 'YYYY-MM');
    v_pstart     := to_timestamp(v_period_key || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS');
    v_pend       := v_pstart + interval '1 month';

    -- 4. Unlimited entitlement path
    IF v_is_unlimited THEN
        INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
        VALUES (p_tenant_id, 'ai_allowance', v_pstart, v_pend, v_period_key, p_delta, p_delta)
        ON CONFLICT (tenant_id, feature_key, period_key)
        DO UPDATE SET usage_count = public.usage_counters.usage_count + p_delta,
                      used_count = public.usage_counters.used_count + p_delta,
                      updated_at = now();

        SELECT usage_count INTO v_current
        FROM public.usage_counters
        WHERE tenant_id = p_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'COMMERCIAL_ALLOWED',
            'current_usage', v_current,
            'limit_value', NULL,
            'is_unlimited', true
        );
    END IF;

    -- 5. Bounded quota atomic lock & increment
    v_lock_key := hashtextextended(p_tenant_id::text || ':ai_allowance:' || v_period_key, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
    VALUES (p_tenant_id, 'ai_allowance', v_pstart, v_pend, v_period_key, 0, 0)
    ON CONFLICT (tenant_id, feature_key, period_key) DO NOTHING;

    SELECT usage_count INTO v_current
    FROM public.usage_counters
    WHERE tenant_id = p_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key
    FOR UPDATE;

    IF v_current + p_delta > v_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'AI_QUOTA_EXHAUSTED',
            'message', 'Monthly AI usage quota exhausted.',
            'current_usage', v_current,
            'limit_value', v_limit,
            'is_unlimited', false
        );
    END IF;

    UPDATE public.usage_counters
    SET usage_count = usage_count + p_delta,
        used_count = used_count + p_delta,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'COMMERCIAL_ALLOWED',
        'current_usage', v_current + p_delta,
        'limit_value', v_limit,
        'is_unlimited', false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.clinic_check_and_consume_ai_allowance(UUID, INT) IS
'Atomically verifies tenant commercial eligibility, resolves ai_allowance entitlement, and consumes quota under advisory transaction lock.';
