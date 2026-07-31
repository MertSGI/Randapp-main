-- =========================================================================
-- STAGE H1B — SECURE SUPER ADMIN COMMERCIAL MUTATION BACKEND
-- Migration: 20260811_h1b_super_admin_commercial_mutations.sql
-- Description: Server-authoritative SECURITY DEFINER RPC surface for commercial
--              subscription assignment, status lifecycle, trial management,
--              scheduled plan changes, manual billing transactions, and typed
--              entitlement overrides with concurrency locking and idempotency.
-- Governance: Forward-only migration 36. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- 1. EXTEND SUBSCRIPTIONS TABLE FOR SCHEDULED CHANGES AND PRICING OVERRIDES
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS scheduled_plan_version_id UUID REFERENCES public.plan_versions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_change_reason TEXT,
ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly' CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
ADD COLUMN IF NOT EXISTS fixed_discount NUMERIC(10,2) CHECK (fixed_discount IS NULL OR fixed_discount >= 0),
ADD COLUMN IF NOT EXISTS percent_discount NUMERIC(5,2) CHECK (percent_discount IS NULL OR (percent_discount >= 0 AND percent_discount <= 100)),
ADD COLUMN IF NOT EXISTS custom_monthly_price NUMERIC(10,2) CHECK (custom_monthly_price IS NULL OR custom_monthly_price >= 0),
ADD COLUMN IF NOT EXISTS custom_annual_price NUMERIC(10,2) CHECK (custom_annual_price IS NULL OR custom_annual_price >= 0),
ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_extended_count INT NOT NULL DEFAULT 0 CHECK (trial_extended_count >= 0),
ADD CONSTRAINT chk_subscriptions_discounts_mutual_exclusivity CHECK (
    (fixed_discount IS NULL OR percent_discount IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change
ON public.subscriptions (scheduled_change_at)
WHERE scheduled_plan_version_id IS NOT NULL;


-- 2. SUPER ADMIN COMMERCIAL MUTATION IDEMPOTENCY TABLE
CREATE TABLE IF NOT EXISTS public.super_admin_commercial_mutation_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE CHECK (trim(idempotency_key) != ''),
    actor_user_id UUID NOT NULL REFERENCES auth.users(id),
    rpc_name TEXT NOT NULL CHECK (trim(rpc_name) != ''),
    request_fingerprint TEXT NOT NULL CHECK (trim(request_fingerprint) != ''),
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_commercial_mutation_idempotency ENABLE ROW LEVEL SECURITY;

-- Strict default deny RLS on idempotency ledger for browser roles
DROP POLICY IF EXISTS super_admin_idempotency_no_client_read ON public.super_admin_commercial_mutation_idempotency;
CREATE POLICY super_admin_idempotency_no_client_read
ON public.super_admin_commercial_mutation_idempotency
FOR ALL
TO authenticated, anon
USING (false);


-- =========================================================================
-- 3. HELPER: IDEMPOTENCY CHECK AND RECORD
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_super_admin_idempotency(
    p_idempotency_key TEXT,
    p_rpc_name TEXT,
    p_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN NULL;
    END IF;

    SELECT actor_user_id, rpc_name, request_fingerprint, response_payload
    INTO v_rec
    FROM public.super_admin_commercial_mutation_idempotency
    WHERE idempotency_key = trim(p_idempotency_key);

    IF v_rec.idempotency_key IS NOT NULL OR v_rec.response_payload IS NOT NULL THEN
        IF v_rec.rpc_name != p_rpc_name OR v_rec.request_fingerprint != p_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key reuse with different parameters or operation.' USING ERRCODE = 'P0001';
        END IF;
        RETURN v_rec.response_payload;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_super_admin_idempotency(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.record_super_admin_idempotency(
    p_idempotency_key TEXT,
    p_actor_user_id UUID,
    p_rpc_name TEXT,
    p_fingerprint TEXT,
    p_response_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.super_admin_commercial_mutation_idempotency (
        idempotency_key,
        actor_user_id,
        rpc_name,
        request_fingerprint,
        response_payload
    ) VALUES (
        trim(p_idempotency_key),
        p_actor_user_id,
        p_rpc_name,
        p_fingerprint,
        p_response_payload
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_super_admin_idempotency(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 4. RPC: super_admin_assign_commercial_plan
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_assign_commercial_plan(
    p_tenant_id UUID,
    p_plan_version_id UUID,
    p_reason TEXT,
    p_billing_mode TEXT DEFAULT 'manual',
    p_billing_interval TEXT DEFAULT 'monthly',
    p_custom_monthly_price NUMERIC DEFAULT NULL,
    p_custom_annual_price NUMERIC DEFAULT NULL,
    p_fixed_discount NUMERIC DEFAULT NULL,
    p_percent_discount NUMERIC DEFAULT NULL,
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
    v_sub_id        UUID;
    v_prev_sub      RECORD;
    v_ver_row       RECORD;
    v_plan_row      RECORD;
    v_new_sub       RECORD;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_plan_version_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    IF p_fixed_discount IS NOT NULL AND p_percent_discount IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'conflicting_discounts');
    END IF;

    IF p_percent_discount IS NOT NULL AND (p_percent_discount < 0 OR p_percent_discount > 100) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_discount_percent');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_plan_version_id::text, p_billing_mode, p_billing_interval, coalesce(p_custom_monthly_price::text, ''), coalesce(p_custom_annual_price::text, ''), coalesce(p_fixed_discount::text, ''), coalesce(p_percent_discount::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_assign_commercial_plan', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Lock tenant subscriptions for update
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 42));

    -- Verify target plan version
    SELECT pv.id, pv.plan_id, pv.version_number, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = p_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_not_assignable');
    END IF;

    -- Lock active subscription
    SELECT * INTO v_prev_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_prev_sub.id IS NOT NULL THEN
        v_sub_id := v_prev_sub.id;
        UPDATE public.subscriptions
        SET plan_id = v_ver_row.plan_code,
            plan_version_id = v_ver_row.id,
            status = CASE WHEN v_prev_sub.status = 'pending_checkout' THEN 'active' ELSE v_prev_sub.status END,
            billing_mode = coalesce(p_billing_mode, v_prev_sub.billing_mode, 'manual'),
            billing_interval = coalesce(p_billing_interval, v_prev_sub.billing_interval, 'monthly'),
            custom_monthly_price = p_custom_monthly_price,
            custom_annual_price = p_custom_annual_price,
            fixed_discount = p_fixed_discount,
            percent_discount = p_percent_discount,
            scheduled_plan_version_id = NULL,
            scheduled_change_at = NULL,
            scheduled_change_reason = NULL,
            updated_at = now()
        WHERE id = v_sub_id
        RETURNING * INTO v_new_sub;
    ELSE
        INSERT INTO public.subscriptions (
            tenant_id,
            plan_id,
            plan_version_id,
            status,
            billing_source,
            billing_mode,
            billing_interval,
            custom_monthly_price,
            custom_annual_price,
            fixed_discount,
            percent_discount
        ) VALUES (
            p_tenant_id,
            v_ver_row.plan_code,
            v_ver_row.id,
            'active',
            'manual',
            coalesce(p_billing_mode, 'manual'),
            coalesce(p_billing_interval, 'monthly'),
            p_custom_monthly_price,
            p_custom_annual_price,
            p_fixed_discount,
            p_percent_discount
        )
        RETURNING * INTO v_new_sub;
        v_sub_id := v_new_sub.id;
    END IF;

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
        v_sub_id,
        p_tenant_id,
        'plan_assigned',
        CASE WHEN v_prev_sub.id IS NOT NULL THEN to_jsonb(v_prev_sub) ELSE NULL END,
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub_id,
        'tenant_id', p_tenant_id,
        'plan_code', v_ver_row.plan_code,
        'plan_version_id', v_ver_row.id
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_assign_commercial_plan', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_assign_commercial_plan(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_assign_commercial_plan(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;


-- =========================================================================
-- 5. RPC: super_admin_change_subscription_status
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_change_subscription_status(
    p_tenant_id UUID,
    p_target_status TEXT,
    p_reason TEXT,
    p_extend_trial_days INT DEFAULT NULL,
    p_paid_through_date TIMESTAMPTZ DEFAULT NULL,
    p_grace_until TIMESTAMPTZ DEFAULT NULL,
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
    v_new_sub       RECORD;
    v_new_trial_end TIMESTAMPTZ;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_target_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_target_status NOT IN ('pending_checkout', 'trialing', 'active', 'past_due', 'paused', 'suspended', 'cancelled', 'expired') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_status');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_target_status, coalesce(p_extend_trial_days::text, ''), coalesce(p_paid_through_date::text, ''), coalesce(p_grace_until::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_change_subscription_status', v_fingerprint);
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

    v_new_trial_end := v_sub.trial_end;
    IF p_extend_trial_days IS NOT NULL THEN
        IF p_extend_trial_days <= 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_trial_extension_days');
        END IF;
        v_new_trial_end := coalesce(v_sub.trial_end, now()) + (p_extend_trial_days || ' days')::INTERVAL;
    END IF;

    UPDATE public.subscriptions
    SET status = p_target_status,
        trial_end = v_new_trial_end,
        trial_extended_count = CASE WHEN p_extend_trial_days IS NOT NULL THEN v_sub.trial_extended_count + 1 ELSE v_sub.trial_extended_count END,
        paid_through_date = coalesce(p_paid_through_date, v_sub.paid_through_date),
        grace_until = coalesce(p_grace_until, v_sub.grace_until),
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
        'status_changed_' || p_target_status,
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'previous_status', v_sub.status,
        'new_status', p_target_status
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_change_subscription_status', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_change_subscription_status(UUID, TEXT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_change_subscription_status(UUID, TEXT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


-- =========================================================================
-- 6. RPC: super_admin_schedule_plan_change
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_schedule_plan_change(
    p_tenant_id UUID,
    p_target_plan_version_id UUID,
    p_scheduled_change_at TIMESTAMPTZ,
    p_reason TEXT,
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

    IF p_tenant_id IS NULL OR p_target_plan_version_id IS NULL OR p_scheduled_change_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_scheduled_change_at <= now() THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'scheduled_time_must_be_in_future');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_target_plan_version_id::text, p_scheduled_change_at::text));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_schedule_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Verify target plan version
    SELECT pv.id, pv.plan_id, pv.lifecycle_status, p.code AS plan_code, p.is_assignable, p.is_legacy
    INTO v_ver_row
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.id = p_target_plan_version_id;

    IF v_ver_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_found');
    END IF;

    IF v_ver_row.lifecycle_status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_version_not_published');
    END IF;

    IF NOT v_ver_row.is_assignable OR v_ver_row.is_legacy THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'plan_not_assignable');
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'subscription_not_found');
    END IF;

    UPDATE public.subscriptions
    SET scheduled_plan_version_id = v_ver_row.id,
        scheduled_change_at = p_scheduled_change_at,
        scheduled_change_reason = trim(p_reason),
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

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
        'plan_change_scheduled',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'subscription_id', v_sub.id,
        'scheduled_plan_version_id', v_ver_row.id,
        'scheduled_change_at', p_scheduled_change_at
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_schedule_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_schedule_plan_change(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_schedule_plan_change(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 7. RPC: super_admin_cancel_scheduled_plan_change
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_cancel_scheduled_plan_change(
    p_tenant_id UUID,
    p_reason TEXT,
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

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, 'cancel_scheduled'));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_cancel_scheduled_plan_change', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_sub.id IS NULL OR v_sub.scheduled_plan_version_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_scheduled_change');
    END IF;

    UPDATE public.subscriptions
    SET scheduled_plan_version_id = NULL,
        scheduled_change_at = NULL,
        scheduled_change_reason = NULL,
        updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_new_sub;

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
        'scheduled_plan_change_cancelled',
        to_jsonb(v_sub),
        to_jsonb(v_new_sub),
        trim(p_reason),
        p_idempotency_key,
        v_actor_user_id,
        'super_admin'
    );

    v_resp := jsonb_build_object('success', true, 'reason_code', 'ok', 'subscription_id', v_sub.id);
    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_cancel_scheduled_plan_change', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_cancel_scheduled_plan_change(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_cancel_scheduled_plan_change(UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 8. RPC: super_admin_record_billing_transaction
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_record_billing_transaction(
    p_tenant_id UUID,
    p_transaction_type TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'TRY',
    p_billing_mode TEXT DEFAULT 'manual',
    p_payment_method TEXT DEFAULT 'bank_transfer',
    p_reference_note TEXT DEFAULT NULL,
    p_related_transaction_id UUID DEFAULT NULL,
    p_internal_reason TEXT DEFAULT NULL,
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
    v_sub_id        UUID;
    v_rel_tx        RECORD;
    v_new_tx_id     UUID;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_transaction_type IS NULL OR p_amount IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'negative_amount_invalid');
    END IF;

    IF p_transaction_type NOT IN ('charge', 'payment', 'credit_adjustment', 'debit_adjustment', 'refund', 'reversal', 'void') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_transaction_type');
    END IF;

    IF p_internal_reason IS NULL OR trim(p_internal_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_transaction_type, p_amount::text, p_currency, coalesce(p_related_transaction_id::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_record_billing_transaction', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    -- Validate related transaction linkage for refunds/reversals
    IF p_related_transaction_id IS NOT NULL THEN
        SELECT * INTO v_rel_tx
        FROM public.billing_transactions
        WHERE id = p_related_transaction_id;

        IF v_rel_tx.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'related_transaction_not_found');
        END IF;

        IF v_rel_tx.tenant_id != p_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'cross_tenant_transaction_linkage_rejected');
        END IF;
    END IF;

    -- Get subscription_id
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO public.billing_transactions (
        tenant_id,
        subscription_id,
        transaction_type,
        amount,
        currency,
        billing_mode,
        payment_method,
        related_transaction_id,
        reference_note,
        internal_reason,
        created_by,
        idempotency_key
    ) VALUES (
        p_tenant_id,
        v_sub_id,
        p_transaction_type,
        p_amount,
        upper(p_currency),
        p_billing_mode,
        p_payment_method,
        p_related_transaction_id,
        p_reference_note,
        trim(p_internal_reason),
        v_actor_user_id,
        p_idempotency_key
    )
    RETURNING id INTO v_new_tx_id;

    v_resp := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'transaction_id', v_new_tx_id,
        'tenant_id', p_tenant_id,
        'amount', p_amount,
        'transaction_type', p_transaction_type
    );

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_record_billing_transaction', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_record_billing_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_record_billing_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;


-- =========================================================================
-- 9. RPC: super_admin_manage_tenant_entitlement_override
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_manage_tenant_entitlement_override(
    p_tenant_id UUID,
    p_feature_key TEXT,
    p_action TEXT, -- 'create' or 'revoke'
    p_value_type TEXT DEFAULT NULL,
    p_boolean_value BOOLEAN DEFAULT NULL,
    p_integer_value BIGINT DEFAULT NULL,
    p_text_value TEXT DEFAULT NULL,
    p_json_value JSONB DEFAULT NULL,
    p_is_unlimited BOOLEAN DEFAULT false,
    p_starts_at TIMESTAMPTZ DEFAULT now(),
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
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
    v_fd            RECORD;
    v_ovr_id        UUID;
    v_resp          JSONB;
BEGIN
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL OR NOT public.is_super_admin(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL OR p_feature_key IS NULL OR p_action NOT IN ('create', 'revoke') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters');
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'reason_required');
    END IF;

    -- Verify feature key exists
    SELECT * INTO v_fd
    FROM public.commercial_feature_definitions
    WHERE feature_key = p_feature_key;

    IF v_fd.feature_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'feature_key_not_found');
    END IF;

    -- Idempotency check
    v_fingerprint := md5(concat_ws(':', p_tenant_id::text, p_feature_key, p_action, coalesce(p_value_type, ''), coalesce(p_starts_at::text, '')));
    v_cached_resp := public.check_super_admin_idempotency(p_idempotency_key, 'super_admin_manage_tenant_entitlement_override', v_fingerprint);
    IF v_cached_resp IS NOT NULL THEN
        RETURN v_cached_resp;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(concat(p_tenant_id::text, ':', p_feature_key), 99));

    IF p_action = 'revoke' THEN
        UPDATE public.tenant_entitlement_overrides
        SET revoked_at = now(),
            revoked_by = v_actor_user_id,
            revoke_reason = trim(p_reason)
        WHERE tenant_id = p_tenant_id
          AND feature_key = p_feature_key
          AND revoked_at IS NULL;

        v_resp := jsonb_build_object('success', true, 'reason_code', 'ok', 'action', 'revoked');
    ELSE
        -- Verify type matches definition
        IF p_value_type IS NULL OR p_value_type != v_fd.value_type THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'value_type_mismatch');
        END IF;

        -- Automatically revoke previous active override for this feature/tenant
        UPDATE public.tenant_entitlement_overrides
        SET revoked_at = now(),
            revoked_by = v_actor_user_id,
            revoke_reason = 'Superseded by new override'
        WHERE tenant_id = p_tenant_id
          AND feature_key = p_feature_key
          AND revoked_at IS NULL;

        INSERT INTO public.tenant_entitlement_overrides (
            tenant_id,
            feature_key,
            value_type,
            boolean_value,
            integer_value,
            text_value,
            json_value,
            is_unlimited,
            starts_at,
            expires_at,
            reason,
            created_by
        ) VALUES (
            p_tenant_id,
            p_feature_key,
            p_value_type,
            p_boolean_value,
            p_integer_value,
            p_text_value,
            p_json_value,
            coalesce(p_is_unlimited, false),
            coalesce(p_starts_at, now()),
            p_expires_at,
            trim(p_reason),
            v_actor_user_id
        )
        RETURNING id INTO v_ovr_id;

        v_resp := jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'override_id', v_ovr_id,
            'feature_key', p_feature_key,
            'action', 'created'
        );
    END IF;

    PERFORM public.record_super_admin_idempotency(p_idempotency_key, v_actor_user_id, 'super_admin_manage_tenant_entitlement_override', v_fingerprint, v_resp);
    RETURN v_resp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_manage_tenant_entitlement_override(UUID, TEXT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, JSONB, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_manage_tenant_entitlement_override(UUID, TEXT, TEXT, TEXT, BOOLEAN, BIGINT, TEXT, JSONB, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
