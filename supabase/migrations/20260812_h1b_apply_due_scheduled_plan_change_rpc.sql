-- =========================================================================
-- STAGE H1B — DUE SCHEDULED PLAN CHANGE EXECUTOR RPC
-- Migration: 20260812_h1b_apply_due_scheduled_plan_change_rpc.sql
-- Description: Server-authoritative SECURITY DEFINER RPC to apply a due
--              scheduled plan change for a tenant subscription with full
--              re-validation, atomic status update, locking, idempotency, and audit logging.
-- Governance: Forward-only migration 37. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_apply_due_scheduled_plan_change(
    p_tenant_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_actor_user_id UUID;
    v_fingerprint   TEXT;
    v_cached_resp   JSONB;
    v_sub           RECORD;
    v_ver_row       RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, 'apply_due_scheduled_plan_change'));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_apply_due_scheduled_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Lock tenant subscription
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'subscription_not_found');
    END IF;

    IF v_sub.scheduled_plan_version_id IS NULL OR v_sub.scheduled_change_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_scheduled_change');
    END IF;

    IF v_sub.scheduled_change_at > now() THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'scheduled_change_not_due');
    END IF;

    -- Re-validate target plan version at execution time
    SELECT pv.id, pv.plan_id, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = v_sub.scheduled_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'target_plan_not_assignable');
    END IF;

    -- Apply scheduled change atomically
    UPDATE public.subscriptions
    SET plan_id = v_ver_row.plan_code,
        plan_version_id = v_ver_row.id,
        scheduled_plan_version_id = NULL,
        scheduled_change_at = NULL,
        scheduled_change_reason = NULL,
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

    -- Append audit event
    INSERT INTO public.subscription_events (
        subscription_id,
        tenant_id,
        event_type,
        previous_state,
        new_state,
        internal_reason,
        idempotency_key,
        actor_user_id,
        actor_role
    ) VALUES (
        v_sub.id,
        p_tenant_id,
        'due_scheduled_plan_change_applied',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        coalesce(v_sub.scheduled_change_reason, 'Applied due scheduled plan change'),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'previous_plan_version_id', v_sub.plan_version_id,
        'new_plan_version_id', v_ver_row.id,
        'plan_code', v_ver_row.plan_code
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_apply_due_scheduled_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_apply_due_scheduled_plan_change(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_apply_due_scheduled_plan_change(UUID, TEXT) TO authenticated;
