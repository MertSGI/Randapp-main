-- =========================================================================
-- STAGE H1E-C3 MIGRATION 53: CONTROLLED RELEASE-PHASE TRANSITION CONTRACT
-- Migration: 20260828_h1e_c_controlled_release_phase_transition.sql
-- =========================================================================
-- Provisions:
--   1. Dedicated release-phase transition history table:
--      public.platform_release_phase_transition_history
--   2. Dedicated release-phase transition idempotency table:
--      public.super_admin_release_transition_idempotency
--   3. Super admin mutation RPC: public.super_admin_transition_release_phase
--   4. Super admin evidence read RPC: public.super_admin_get_release_transition_evidence
--
-- Migration 52 remains applied and immutable.
-- Does not automatically update the release phase.
-- Does not authorize a pilot tenant.
-- Payments remain disabled. Production NO-GO.

-- =========================================================================
-- 1. RELEASE PHASE TRANSITION HISTORY TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_release_phase_transition_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    previous_phase TEXT NOT NULL,
    target_phase TEXT NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    idempotency_key_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_release_phase_transition_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_release_phase_transition_history FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_platform_release_transition_history_created
ON public.platform_release_phase_transition_history (created_at DESC);

-- =========================================================================
-- 2. RELEASE PHASE TRANSITION IDEMPOTENCY TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.super_admin_release_transition_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE CHECK (trim(idempotency_key) != ''),
    actor_user_id UUID NOT NULL REFERENCES auth.users(id),
    request_fingerprint TEXT NOT NULL CHECK (trim(request_fingerprint) != ''),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_release_transition_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.super_admin_release_transition_idempotency FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 3. MUTATION RPC: super_admin_transition_release_phase
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_transition_release_phase(
    p_expected_phase TEXT,
    p_target_phase TEXT,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $transition_rpc$
DECLARE
    v_actor_user_id     UUID;
    v_fingerprint       TEXT;
    v_idempotency_hash  TEXT;
    v_cached_rec        RECORD;
    v_current_ctrl      RECORD;
    v_new_history_id    UUID;
    v_resp              JSONB;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'UNAUTHORIZED',
            'changed', false,
            'replayed', false
        );
    END IF;

    -- 2. Input Validation
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'IDEMPOTENCY_KEY_REQUIRED',
            'changed', false,
            'replayed', false
        );
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_REASON',
            'changed', false,
            'replayed', false
        );
    END IF;

    IF p_expected_phase IS NULL OR p_expected_phase NOT IN ('pre_pilot', 'paymentless_pilot') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_RELEASE_PHASE',
            'changed', false,
            'replayed', false
        );
    END IF;

    IF p_target_phase IS NULL OR p_target_phase NOT IN ('pre_pilot', 'paymentless_pilot') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'INVALID_RELEASE_PHASE',
            'changed', false,
            'replayed', false
        );
    END IF;

    -- Allowed transition pairs rule
    IF NOT (
        (p_expected_phase = 'pre_pilot' AND p_target_phase = 'paymentless_pilot') OR
        (p_expected_phase = 'paymentless_pilot' AND p_target_phase = 'pre_pilot')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'RELEASE_PHASE_TRANSITION_NOT_ALLOWED',
            'changed', false,
            'replayed', false
        );
    END IF;

    -- 3. Concurrency Lock & Idempotency Check
    PERFORM pg_advisory_xact_lock(hashtextextended('platform_global_release_control:singleton', 0));

    v_fingerprint := md5(concat_ws(':', trim(p_expected_phase), trim(p_target_phase), trim(p_reason)));
    v_idempotency_hash := md5(trim(p_idempotency_key));

    SELECT actor_user_id, request_fingerprint, response_payload
    INTO v_cached_rec
    FROM public.super_admin_release_transition_idempotency
    WHERE idempotency_key = trim(p_idempotency_key);

    IF FOUND THEN
        IF v_cached_rec.request_fingerprint != v_fingerprint THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'IDEMPOTENCY_CONFLICT',
                'changed', false,
                'replayed', false
            );
        END IF;

        RETURN v_cached_rec.response_payload || jsonb_build_object('changed', false, 'replayed', true);
    END IF;

    -- 4. Lock Singleton Global Release Control Row FOR UPDATE
    SELECT * INTO v_current_ctrl
    FROM public.platform_global_release_control
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'RELEASE_CONTROL_UNAVAILABLE',
            'changed', false,
            'replayed', false
        );
    END IF;

    -- Compare expected vs current phase
    IF v_current_ctrl.release_phase != p_expected_phase THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'RELEASE_PHASE_CONFLICT',
            'current_phase', v_current_ctrl.release_phase,
            'expected_phase', p_expected_phase,
            'changed', false,
            'replayed', false
        );
    END IF;

    -- Same phase check
    IF v_current_ctrl.release_phase = p_target_phase THEN
        v_resp := jsonb_build_object(
            'success', true,
            'reason_code', 'RELEASE_PHASE_ALREADY_SET',
            'release_phase', v_current_ctrl.release_phase,
            'changed', false,
            'replayed', false
        );

        INSERT INTO public.super_admin_release_transition_idempotency (
            idempotency_key, actor_user_id, request_fingerprint, response_payload
        ) VALUES (
            trim(p_idempotency_key), v_actor_user_id, v_fingerprint, v_resp
        );

        RETURN v_resp;
    END IF;

    -- Payment Safety Interlock Check
    IF p_target_phase = 'paymentless_pilot' THEN
        IF v_current_ctrl.is_payment_collection_enabled OR
           v_current_ctrl.is_checkout_enabled OR
           v_current_ctrl.is_iyzico_enabled THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'PAYMENT_SAFETY_VIOLATION',
                'changed', false,
                'replayed', false
            );
        END IF;
    END IF;

    -- 5. Execute State Update
    UPDATE public.platform_global_release_control
    SET release_phase = p_target_phase,
        is_pilot_enforcement_required = (p_target_phase = 'paymentless_pilot'),
        updated_by = v_actor_user_id,
        updated_reason = trim(p_reason),
        updated_at = now()
    WHERE id = 1;

    -- 6. Insert Transition History Row
    INSERT INTO public.platform_release_phase_transition_history (
        previous_phase,
        target_phase,
        actor_user_id,
        reason,
        idempotency_key_hash
    ) VALUES (
        v_current_ctrl.release_phase,
        p_target_phase,
        v_actor_user_id,
        trim(p_reason),
        v_idempotency_hash
    ) RETURNING id INTO v_new_history_id;

    -- 7. Write Audit Event
    INSERT INTO public.audit_events (
        tenant_id,
        actor_user_id,
        event_type,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        'global',
        v_actor_user_id,
        CASE
            WHEN p_target_phase = 'paymentless_pilot' THEN 'platform_release_phase_transitioned_to_paymentless_pilot'
            ELSE 'platform_release_phase_restored_to_pre_pilot'
        END,
        'platform_global_release_control',
        '1',
        jsonb_build_object(
            'previous_phase', v_current_ctrl.release_phase,
            'target_phase', p_target_phase,
            'reason', trim(p_reason),
            'history_id', v_new_history_id,
            'idempotency_key_hash', v_idempotency_hash
        )
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'RELEASE_PHASE_TRANSITIONED',
        'previous_phase', v_current_ctrl.release_phase,
        'release_phase', p_target_phase,
        'changed', true,
        'replayed', false
    );

    -- Record Idempotency
    INSERT INTO public.super_admin_release_transition_idempotency (
        idempotency_key, actor_user_id, request_fingerprint, response_payload
    ) VALUES (
        trim(p_idempotency_key), v_actor_user_id, v_fingerprint, v_resp
    );

    RETURN v_resp;
END;
$transition_rpc$;

REVOKE ALL ON FUNCTION public.super_admin_transition_release_phase(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_transition_release_phase(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =========================================================================
-- 4. READ CONTRACT: super_admin_get_release_transition_evidence
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_release_transition_evidence(
    p_run_prefix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $evidence_rpc$
DECLARE
    v_actor_user_id             UUID;
    v_release_ctrl              RECORD;
    v_history_cnt               INTEGER := 0;
    v_paymentless_audit_cnt     INTEGER := 0;
    v_prepilot_audit_cnt        INTEGER := 0;
    v_idempotency_cnt           INTEGER := 0;
BEGIN
    -- 1. Authenticate and Authorize
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'UNAUTHORIZED',
            'timestamp', now()
        );
    END IF;

    -- 2. Current Global Control State
    SELECT * INTO v_release_ctrl
    FROM public.platform_global_release_control
    WHERE id = 1;

    -- 3. Aggregate Transition History Count
    SELECT count(*)::INTEGER INTO v_history_cnt
    FROM public.platform_release_phase_transition_history;

    -- 4. Aggregate Transition Audit Counts
    SELECT count(*)::INTEGER INTO v_paymentless_audit_cnt
    FROM public.audit_events
    WHERE event_type = 'platform_release_phase_transitioned_to_paymentless_pilot';

    SELECT count(*)::INTEGER INTO v_prepilot_audit_cnt
    FROM public.audit_events
    WHERE event_type = 'platform_release_phase_restored_to_pre_pilot';

    -- 5. Aggregate Transition Idempotency Records
    SELECT count(*)::INTEGER INTO v_idempotency_cnt
    FROM public.super_admin_release_transition_idempotency
    WHERE (p_run_prefix IS NULL OR idempotency_key LIKE p_run_prefix || '%');

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', now(),
        'release_phase', v_release_ctrl.release_phase,
        'is_production_authorized', v_release_ctrl.is_production_authorized,
        'is_pilot_enforcement_required', v_release_ctrl.is_pilot_enforcement_required,
        'is_payment_collection_enabled', v_release_ctrl.is_payment_collection_enabled,
        'is_checkout_enabled', v_release_ctrl.is_checkout_enabled,
        'is_iyzico_enabled', v_release_ctrl.is_iyzico_enabled,
        'transition_history_count', v_history_cnt,
        'paymentless_pilot_transition_audit_count', v_paymentless_audit_cnt,
        'pre_pilot_restoration_audit_count', v_prepilot_audit_cnt,
        'idempotency_record_count', v_idempotency_cnt
    );
END;
$evidence_rpc$;

REVOKE ALL ON FUNCTION public.super_admin_get_release_transition_evidence(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_release_transition_evidence(TEXT) TO authenticated;
