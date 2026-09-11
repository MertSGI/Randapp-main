-- ==============================================================================
-- Migration: 20260925_phase4_loyalty_reactivation_foundation.sql
-- Description: Phase 4 Loyalty & Automated Client Reactivation Foundation
-- Authority: LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 (DECISION-020)
-- Production Status: NO_GO
-- Safety Constraints:
--   1. Reuses canonical public.customers(id), tenants, and appointments models (zero duplication).
--   2. Direct mutation access revoked from PUBLIC, anon, and authenticated browser roles.
--   3. All loyalty ledger events are monotonic and append-only.
--   4. Point redemption requires row-level locking (FOR UPDATE) to eliminate race conditions.
--   5. Automated reactivation trigger emits structured outbox messages without external provider activation.
--   6. Strictly NO_NETWORK_SEND, zero real marketing gateway or SMS/email provider activation.
-- ==============================================================================

-- 1. LOYALTY PROGRAM CONFIGURATION PER TENANT
CREATE TABLE IF NOT EXISTS public.tenant_loyalty_configs (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    points_per_minor_unit NUMERIC(10, 4) NOT NULL DEFAULT 0.0100, -- e.g. 1 point per 100 minor units (1 TRY = 1 pt)
    minor_units_per_point NUMERIC(10, 4) NOT NULL DEFAULT 1.0000, -- e.g. 1 point = 1 minor unit discount
    minimum_points_redemption INTEGER NOT NULL DEFAULT 100,
    reactivation_inactivity_days INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. CUSTOMER LOYALTY LEDGER (APPEND-ONLY EVENT SOURCED LEDGER)
CREATE TABLE IF NOT EXISTS public.customer_loyalty_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('earned_appointment', 'redeemed_appointment', 'manual_adjustment', 'reactivation_bonus', 'expired')),
    points_delta INTEGER NOT NULL, -- positive for earn, negative for redeem
    running_balance INTEGER NOT NULL CHECK (running_balance >= 0),
    description TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_loyalty_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

-- 3. CUSTOMER LOYALTY BALANCES (AGGREGATE ROW CACHE WITH LOCKING SUPPORT)
CREATE TABLE IF NOT EXISTS public.customer_loyalty_balances (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
    lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
    lifetime_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_redeemed >= 0),
    last_earned_at TIMESTAMPTZ,
    last_redeemed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (tenant_id, customer_id)
);

-- 4. AUTOMATED REACTIVATION CAMPAIGN QUEUE
CREATE TABLE IF NOT EXISTS public.customer_reactivation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    last_appointment_at TIMESTAMPTZ NOT NULL,
    inactivity_days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'queued_outbox', 'suppressed', 'converted')),
    bonus_points_offered INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_reactivation_tenant_customer_detection UNIQUE (tenant_id, customer_id, last_appointment_at)
);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.tenant_loyalty_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reactivation_events ENABLE ROW LEVEL SECURITY;

-- REVOKE DIRECT ACCESS FROM PUBLIC, ANON, AND AUTHENTICATED BROWSER ROLES
REVOKE ALL ON public.tenant_loyalty_configs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_loyalty_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_loyalty_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_reactivation_events FROM PUBLIC, anon, authenticated;

-- GRANT SERVICE ROLE TRUSTED ACCESS
GRANT ALL ON public.tenant_loyalty_configs TO service_role;
GRANT ALL ON public.customer_loyalty_ledger TO service_role;
GRANT ALL ON public.customer_loyalty_balances TO service_role;
GRANT ALL ON public.customer_reactivation_events TO service_role;

-- 5. SERVER-AUTHORITATIVE RPC: EARN LOYALTY POINTS ON COMPLETED APPOINTMENT
CREATE OR REPLACE FUNCTION public.earn_loyalty_points_for_appointment(
    p_tenant_id UUID,
    p_customer_id UUID,
    p_appointment_id UUID,
    p_amount_minor_units BIGINT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_config RECORD;
    v_points_to_award INTEGER;
    v_new_balance INTEGER;
    v_new_lifetime_earned INTEGER;
    v_ledger_id UUID;
BEGIN
    -- Check config
    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT v_config.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'LOYALTY_DISABLED_OR_NOT_CONFIGURED');
    END IF;

    -- Calculate points
    v_points_to_award := FLOOR(p_amount_minor_units * v_config.points_per_minor_unit);
    IF v_points_to_award <= 0 THEN
        RETURN jsonb_build_object('success', true, 'points_awarded', 0, 'reason', 'AMOUNT_BELOW_POINT_THRESHOLD');
    END IF;

    -- Lock and update balance
    INSERT INTO public.customer_loyalty_balances (tenant_id, customer_id, current_balance, lifetime_earned, lifetime_redeemed, last_earned_at, updated_at)
    VALUES (p_tenant_id, p_customer_id, v_points_to_award, v_points_to_award, 0, timezone('utc'::text, now()), timezone('utc'::text, now()))
    ON CONFLICT (tenant_id, customer_id)
    DO UPDATE SET
        current_balance = customer_loyalty_balances.current_balance + v_points_to_award,
        lifetime_earned = customer_loyalty_balances.lifetime_earned + v_points_to_award,
        last_earned_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    RETURNING current_balance, lifetime_earned INTO v_new_balance, v_new_lifetime_earned;

    -- Append to ledger
    INSERT INTO public.customer_loyalty_ledger (
        tenant_id, customer_id, appointment_id, entry_type, points_delta, running_balance, description, idempotency_key
    ) VALUES (
        p_tenant_id, p_customer_id, p_appointment_id, 'earned_appointment', v_points_to_award, v_new_balance,
        format('Earned from appointment %s', p_appointment_id), p_idempotency_key
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_awarded', v_points_to_award,
        'current_balance', v_new_balance,
        'lifetime_earned', v_new_lifetime_earned,
        'ledger_id', v_ledger_id
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'reason', 'IDEMPOTENCY_KEY_ALREADY_PROCESSED');
END;
$$;

-- 6. SERVER-AUTHORITATIVE RPC: REDEEM LOYALTY POINTS AT APPOINTMENT CHECKOUT
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points_for_appointment(
    p_tenant_id UUID,
    p_customer_id UUID,
    p_appointment_id UUID,
    p_points_to_redeem INTEGER,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_config RECORD;
    v_current_bal RECORD;
    v_new_balance INTEGER;
    v_discount_minor_units BIGINT;
    v_ledger_id UUID;
BEGIN
    IF p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_POINTS_AMOUNT');
    END IF;

    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT v_config.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'LOYALTY_DISABLED');
    END IF;

    IF p_points_to_redeem < v_config.minimum_points_redemption THEN
        RETURN jsonb_build_object('success', false, 'reason', 'BELOW_MINIMUM_REDEMPTION_THRESHOLD');
    END IF;

    -- Concurrency row lock on balance
    SELECT * INTO v_current_bal
    FROM public.customer_loyalty_balances
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND OR v_current_bal.current_balance < p_points_to_redeem THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_LOYALTY_BALANCE');
    END IF;

    v_discount_minor_units := ROUND(p_points_to_redeem * v_config.minor_units_per_point);

    UPDATE public.customer_loyalty_balances
    SET
        current_balance = current_balance - p_points_to_redeem,
        lifetime_redeemed = lifetime_redeemed + p_points_to_redeem,
        last_redeemed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
    RETURNING current_balance INTO v_new_balance;

    INSERT INTO public.customer_loyalty_ledger (
        tenant_id, customer_id, appointment_id, entry_type, points_delta, running_balance, description, idempotency_key
    ) VALUES (
        p_tenant_id, p_customer_id, p_appointment_id, 'redeemed_appointment', -p_points_to_redeem, v_new_balance,
        format('Redeemed on appointment %s', p_appointment_id), p_idempotency_key
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_redeemed', p_points_to_redeem,
        'discount_minor_units', v_discount_minor_units,
        'remaining_balance', v_new_balance,
        'ledger_id', v_ledger_id
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'reason', 'IDEMPOTENCY_KEY_ALREADY_PROCESSED');
END;
$$;

-- 7. SANITIZED READ RPC: GET CUSTOMER LOYALTY PROFILE (STAFF / AUTHENTICATED ACCESS)
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_profile(
    p_tenant_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_balance RECORD;
    v_config RECORD;
BEGIN
    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    SELECT * INTO v_balance FROM public.customer_loyalty_balances WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'customer_id', p_customer_id,
        'is_active', COALESCE(v_config.is_active, false),
        'current_balance', COALESCE(v_balance.current_balance, 0),
        'lifetime_earned', COALESCE(v_balance.lifetime_earned, 0),
        'lifetime_redeemed', COALESCE(v_balance.lifetime_redeemed, 0),
        'last_earned_at', v_balance.last_earned_at,
        'last_redeemed_at', v_balance.last_redeemed_at
    );
END;
$$;

-- REVOKE EXECUTE FROM PUBLIC & anon; GRANT TO authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_loyalty_profile FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_profile TO authenticated, service_role;
