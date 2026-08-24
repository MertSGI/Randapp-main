-- ============================================================================
-- Migration 65: Clinic AI Assist Commercial Authority & Atomic Quota Reservation
--
-- Description:
-- Establishes server-authoritative, concurrency-safe commercial entitlement
-- and quota consumption RPC for Clinic AI Assist (Speech-to-Text & SOAP Draft).
--
-- Security Hardening (Slice R2.1):
-- 1. Zero-argument contract: clinic_check_and_consume_ai_allowance()
--    Derives caller auth.uid(), active staff identity, and tenant_id server-side.
--    No caller-controlled tenant_id or delta parameter.
-- 2. Strictly verifies caller has an active staff record with can_write_clinical_notes = true.
-- 3. Reads canonical 'eligible' boolean field from resolve_tenant_commercial_eligibility.
-- 4. Performs atomic reservation/consumption using pg_advisory_xact_lock on public.usage_counters.
-- 5. Returns minimal non-disclosing JSON payload (success, reason_code, current_usage, limit_value, is_unlimited).
-- ============================================================================

-- Drop legacy overloaded signature if it exists
DROP FUNCTION IF EXISTS public.clinic_check_and_consume_ai_allowance(UUID, INT);
DROP FUNCTION IF EXISTS public.clinic_check_and_consume_ai_allowance();

CREATE OR REPLACE FUNCTION public.clinic_check_and_consume_ai_allowance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid    UUID := auth.uid();
    v_staff         RECORD;
    v_csp           RECORD;
    v_tenant_id     UUID;
    v_delta         INT := 1;
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
    -- 1. Require authenticated caller
    IF v_caller_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'UNAUTHENTICATED'
        );
    END IF;

    -- 2. Derive caller's active staff record server-side
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'FORBIDDEN'
        );
    END IF;

    v_tenant_id := v_staff.tenant_id;

    -- 3. Check Clinic staff profile & can_write_clinical_notes permission
    SELECT * INTO v_csp
    FROM public.clinic_staff_profiles
    WHERE staff_id = v_staff.id;

    IF v_csp.staff_id IS NULL OR v_csp.can_write_clinical_notes IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'FORBIDDEN'
        );
    END IF;

    -- 4. Verify commercial lifecycle eligibility (consume canonical 'eligible' boolean)
    v_eligible_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    v_is_eligible  := COALESCE((v_eligible_res->>'eligible')::boolean, false);

    IF NOT v_is_eligible THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'COMMERCIAL_NOT_ELIGIBLE'
        );
    END IF;

    -- 5. Resolve canonical ai_allowance entitlement
    SELECT
        e.boolean_value,
        e.integer_value,
        e.is_unlimited,
        e.source
    INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now()) e
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
            'limit_value', v_limit,
            'is_unlimited', v_is_unlimited
        );
    END IF;

    -- 6. Resolve deterministic YYYY-MM period key and timestamps
    v_period_key := to_char(timezone('UTC', now()), 'YYYY-MM');
    v_pstart     := to_timestamp(v_period_key || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS');
    v_pend       := v_pstart + interval '1 month';

    -- 7. Unlimited entitlement path
    IF v_is_unlimited THEN
        INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
        VALUES (v_tenant_id, 'ai_allowance', v_pstart, v_pend, v_period_key, v_delta, v_delta)
        ON CONFLICT (tenant_id, feature_key, period_key)
        DO UPDATE SET usage_count = public.usage_counters.usage_count + v_delta,
                      used_count = public.usage_counters.used_count + v_delta,
                      updated_at = now();

        SELECT usage_count INTO v_current
        FROM public.usage_counters
        WHERE tenant_id = v_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'COMMERCIAL_ALLOWED',
            'current_usage', v_current,
            'limit_value', NULL,
            'is_unlimited', true
        );
    END IF;

    -- 8. Bounded quota atomic lock & increment
    v_lock_key := hashtextextended(v_tenant_id::text || ':ai_allowance:' || v_period_key, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.usage_counters (tenant_id, feature_key, period_start, period_end, period_key, usage_count, used_count)
    VALUES (v_tenant_id, 'ai_allowance', v_pstart, v_pend, v_period_key, 0, 0)
    ON CONFLICT (tenant_id, feature_key, period_key) DO NOTHING;

    SELECT usage_count INTO v_current
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key
    FOR UPDATE;

    IF v_current + v_delta > v_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'AI_QUOTA_EXHAUSTED',
            'current_usage', v_current,
            'limit_value', v_limit,
            'is_unlimited', false
        );
    END IF;

    UPDATE public.usage_counters
    SET usage_count = usage_count + v_delta,
        used_count = used_count + v_delta,
        updated_at = now()
    WHERE tenant_id = v_tenant_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'COMMERCIAL_ALLOWED',
        'current_usage', v_current + v_delta,
        'limit_value', v_limit,
        'is_unlimited', false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_check_and_consume_ai_allowance() TO authenticated;

COMMENT ON FUNCTION public.clinic_check_and_consume_ai_allowance() IS
'Zero-argument server-authoritative RPC that derives caller staff identity, verifies can_write_clinical_notes permission, checks canonical commercial eligibility ("eligible"), and atomically consumes 1 ai_allowance unit under advisory transaction lock.';
