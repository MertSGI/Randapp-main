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
    points_per_completed_appointment INTEGER NOT NULL DEFAULT 50, -- Non-financial deterministic rule per completed appointment
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
    customer_id UUID NOT NULL,
    appointment_id UUID DEFAULT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('earned_appointment', 'redeemed_appointment', 'manual_adjustment', 'reactivation_bonus', 'expired')),
    points_delta INTEGER NOT NULL, -- positive for earn, negative for redeem
    running_balance INTEGER NOT NULL CHECK (running_balance >= 0),
    description TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_loyalty_tenant_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_customer_loyalty_ledger_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_loyalty_ledger_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL
);

-- Database-enforced Append-Only Protection on Loyalty Ledger
CREATE OR REPLACE FUNCTION public.prevent_loyalty_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'LOYALTY_LEDGER_IMMUTABLE: Updates and deletes are forbidden'
        USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_loyalty_ledger_mutation ON public.customer_loyalty_ledger;
CREATE TRIGGER trg_prevent_loyalty_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.customer_loyalty_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_loyalty_ledger_mutation();

-- 3. CUSTOMER LOYALTY BALANCES (AGGREGATE ROW CACHE WITH LOCKING SUPPORT)
CREATE TABLE IF NOT EXISTS public.customer_loyalty_balances (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
    lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
    lifetime_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_redeemed >= 0),
    last_earned_at TIMESTAMPTZ,
    last_redeemed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (tenant_id, customer_id),
    CONSTRAINT fk_customer_loyalty_balances_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE
);

-- 4. AUTOMATED REACTIVATION CAMPAIGN QUEUE
-- EV079-R3: Explicit cohort identity ('inactive_60d', 'inactive_90d') permitting
-- distinct 60d and 90d reactivation events for same customer and last appointment.
CREATE TABLE IF NOT EXISTS public.customer_reactivation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    cohort_code TEXT NOT NULL CHECK (cohort_code IN ('inactive_60d', 'inactive_90d')),
    last_appointment_at TIMESTAMPTZ NOT NULL,
    inactivity_days INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'detected'
        CHECK (status IN ('detected', 'queued_outbox', 'suppressed', 'converted')),
    suppression_reason TEXT DEFAULT NULL,
    outbox_id UUID DEFAULT NULL,
    bonus_points_offered INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_reactivation_cohort_event UNIQUE (tenant_id, customer_id, last_appointment_at, cohort_code),
    CONSTRAINT fk_customer_reactivation_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE
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
-- Proves appointment exists, belongs to tenant & customer, and is completed.
CREATE OR REPLACE FUNCTION public.earn_loyalty_points_for_appointment(
    p_tenant_id UUID,
    p_customer_id UUID,
    p_appointment_id UUID,
    p_amount_minor_units BIGINT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_config RECORD;
    v_appt RECORD;
    v_points_to_award INTEGER;
    v_new_balance INTEGER;
    v_new_lifetime_earned INTEGER;
    v_ledger_id UUID;
    v_svc_price INTEGER;
    v_effective_amount BIGINT;
BEGIN
    -- Check config
    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT v_config.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'LOYALTY_DISABLED_OR_NOT_CONFIGURED');
    END IF;

    -- Verify appointment integrity: must exist, match tenant & customer, and be completed
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'APPOINTMENT_NOT_FOUND_IN_TENANT');
    END IF;

    IF v_appt.customer_id <> p_customer_id THEN
        RETURN jsonb_build_object('success', false, 'reason', 'APPOINTMENT_CUSTOMER_MISMATCH');
    END IF;

    IF v_appt.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'APPOINTMENT_NOT_COMPLETED');
    END IF;

    -- Derive reward basis strictly from non-financial completed appointment rule.
    -- In accordance with Controller Directive EV079-R2, monetary reward accounting from
    -- unproven service catalog prices or caller-supplied amounts is forbidden.
    v_points_to_award := COALESCE(v_config.points_per_completed_appointment, 50);
    IF v_points_to_award <= 0 THEN
        v_points_to_award := 50;
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
        format('Earned from completed appointment %s', p_appointment_id), p_idempotency_key
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_config RECORD;
    v_current_bal RECORD;
    v_new_balance INTEGER;
    v_discount_minor_units BIGINT;
    v_ledger_id UUID;
    v_appt RECORD;
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

    -- Validate appointment if specified
    IF p_appointment_id IS NOT NULL THEN
        SELECT * INTO v_appt
        FROM public.appointments
        WHERE id = p_appointment_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'reason', 'APPOINTMENT_NOT_FOUND_IN_TENANT');
        END IF;

        IF v_appt.customer_id <> p_customer_id THEN
            RETURN jsonb_build_object('success', false, 'reason', 'APPOINTMENT_CUSTOMER_MISMATCH');
        END IF;
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
-- Enforces caller authorization and tenant scope validation.
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_profile(
    p_tenant_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user    RECORD;
    v_balance RECORD;
    v_config  RECORD;
BEGIN
    -- Enforce caller authentication & tenant scope
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF auth.role() <> 'service_role' THEN
        IF NOT FOUND THEN
            RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
        END IF;

        IF v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff or owner access required' USING ERRCODE = '42501';
        END IF;
    END IF;

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

-- 8. AUTOMATED REACTIVATION SCAN (EV079-R3 HARDENED)
-- Explicit cohort identity: 'inactive_60d' (>=60d) and 'inactive_90d' (>=90d).
-- Evaluates current effective marketing consent from canonical consent_ledger (FAIL-CLOSED).
-- Enforces frequency / cooldown suppression (deterministic campaign identity).
-- Reuses trusted EV057 public.enqueue_communication_outbox boundary with deterministic idempotency key.
-- Zero direct provider sends, zero browser bypass, strictly deterministic.
CREATE OR REPLACE FUNCTION public.scan_customer_reactivation_cohorts(
    p_tenant_id UUID,
    p_inactivity_days INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_cohort_code TEXT;
    v_cand RECORD;
    v_detected_count INTEGER := 0;
    v_queued_count INTEGER := 0;
    v_suppressed_count INTEGER := 0;
    v_current_consent BOOLEAN;
    v_event_id UUID;
    v_idempotency_key TEXT;
    v_recipient TEXT;
    v_channel TEXT;
    v_payload JSONB;
    v_outbox_res JSONB;
    v_recent_reactivation_exists BOOLEAN;
    v_bonus_pts INTEGER := 50;
BEGIN
    -- 1. Authority & Tenant Scope Check
    IF auth.role() <> 'service_role' THEN
        SELECT role, tenant_id INTO v_user
        FROM public.users_profile
        WHERE id = auth.uid() AND active = true;

        IF NOT FOUND OR (v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id)) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff or owner access required' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Determine explicit cohort_code from requested inactivity boundary
    IF p_inactivity_days >= 90 THEN
        v_cohort_code := 'inactive_90d';
    ELSE
        v_cohort_code := 'inactive_60d';
    END IF;

    -- 3. Iterate over eligible customers whose latest completed appointment is >= p_inactivity_days ago
    FOR v_cand IN
        SELECT
            a.customer_id,
            MAX(a.appointment_date + a.appointment_time) AS last_appt,
            EXTRACT(DAY FROM (now() - MAX(a.appointment_date + a.appointment_time)))::INTEGER AS days_inactive,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone
        FROM public.appointments a
        JOIN public.customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
        WHERE a.tenant_id = p_tenant_id
          AND a.status = 'completed'
        GROUP BY a.customer_id, c.name, c.email, c.phone
        HAVING (now() - MAX(a.appointment_date + a.appointment_time)) >= (p_inactivity_days || ' days')::INTERVAL
    LOOP
        -- Check if event already exists for (tenant_id, customer_id, last_appointment_at, cohort_code)
        SELECT id INTO v_event_id
        FROM public.customer_reactivation_events
        WHERE tenant_id = p_tenant_id
          AND customer_id = v_cand.customer_id
          AND last_appointment_at = v_cand.last_appt
          AND cohort_code = v_cohort_code;

        -- If event already exists, repeat scan: skip (idempotent, delta=0)
        IF FOUND THEN
            CONTINUE;
        END IF;

        -- Candidate detected
        v_detected_count := v_detected_count + 1;

        -- 4. Canonical Marketing Consent Evaluation (FAIL-CLOSED)
        -- Query latest authoritative state from canonical consent_ledger.
        -- If false, missing, ambiguous, or not provable -> SUPPRESSED_NO_CURRENT_MARKETING_CONSENT
        SELECT is_granted INTO v_current_consent
        FROM public.consent_ledger
        WHERE tenant_id = p_tenant_id::text
          AND customer_id = v_cand.customer_id::text
          AND consent_type = 'marketing'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_current_consent IS NOT TRUE THEN
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, suppression_reason, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'suppressed', 'SUPPRESSED_NO_CURRENT_MARKETING_CONSENT', v_bonus_pts
            );
            v_suppressed_count := v_suppressed_count + 1;
            CONTINUE;
        END IF;

        -- 5. Frequency / Cooldown Suppression Check
        -- Cooldown: prevent any reactivation message if another reactivation was queued within 30 days
        SELECT EXISTS (
            SELECT 1 FROM public.customer_reactivation_events
            WHERE tenant_id = p_tenant_id
              AND customer_id = v_cand.customer_id
              AND status = 'queued_outbox'
              AND created_at > (now() - INTERVAL '30 days')
        ) INTO v_recent_reactivation_exists;

        IF v_recent_reactivation_exists THEN
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, suppression_reason, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'suppressed', 'SUPPRESSED_COOLDOWN_ACTIVE', v_bonus_pts
            );
            v_suppressed_count := v_suppressed_count + 1;
            CONTINUE;
        END IF;

        -- 6. Recipient address resolution (prefer email, fallback to phone)
        IF v_cand.customer_email IS NOT NULL AND length(trim(v_cand.customer_email)) >= 3 THEN
            v_channel := 'email';
            v_recipient := trim(v_cand.customer_email);
        ELSIF v_cand.customer_phone IS NOT NULL AND length(trim(v_cand.customer_phone)) >= 3 THEN
            v_channel := 'sms';
            v_recipient := trim(v_cand.customer_phone);
        ELSE
            -- No valid recipient address -> suppress
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, suppression_reason, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'suppressed', 'SUPPRESSED_NO_VALID_RECIPIENT_ADDRESS', v_bonus_pts
            );
            v_suppressed_count := v_suppressed_count + 1;
            CONTINUE;
        END IF;

        -- 7. Deterministic Idempotency Key & EV057 Outbox Integration
        -- Format: reactivation:<tenant_id>:<customer_id>:<cohort_code>:<last_appointment_epoch>
        v_idempotency_key := 'reactivation:' || p_tenant_id::text || ':' || v_cand.customer_id::text || ':' || v_cohort_code || ':' || EXTRACT(EPOCH FROM v_cand.last_appt)::BIGINT::text;

        v_payload := jsonb_build_object(
            'customer_name', v_cand.customer_name,
            'cohort_code', v_cohort_code,
            'days_inactive', v_cand.days_inactive,
            'bonus_points_offered', v_bonus_pts,
            'message', 'We miss you! Book your next visit and receive ' || v_bonus_pts || ' bonus loyalty points.'
        );

        -- Enqueue via canonical trusted EV057 communications outbox
        v_outbox_res := public.enqueue_communication_outbox(
            p_tenant_id         => p_tenant_id,
            p_channel           => v_channel,
            p_recipient_address => v_recipient,
            p_template_id       => 'customer_reactivation_' || v_cohort_code,
            p_payload           => v_payload,
            p_idempotency_key   => v_idempotency_key,
            p_max_attempts      => 3
        );

        -- Check outbox result: transition to queued_outbox only after EV057 enqueue succeeds
        IF (v_outbox_res->>'success')::BOOLEAN IS TRUE THEN
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, outbox_id, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'queued_outbox', (v_outbox_res->>'outbox_id')::UUID, v_bonus_pts
            );
            v_queued_count := v_queued_count + 1;
        ELSE
            -- Outbox enqueue failed -> record as suppressed with error reason
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, suppression_reason, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'suppressed', 'OUTBOX_ENQUEUE_FAILED:' || COALESCE(v_outbox_res->>'error', 'UNKNOWN'), v_bonus_pts
            );
            v_suppressed_count := v_suppressed_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'cohort_code', v_cohort_code,
        'cohort_inactivity_days', p_inactivity_days,
        'detected_customers', v_detected_count,
        'queued_outbox_count', v_queued_count,
        'suppressed_count', v_suppressed_count
    );
END;
$$;

-- REVOKE EXECUTE FROM PUBLIC & anon; GRANT TO authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_loyalty_profile FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.scan_customer_reactivation_cohorts FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_profile TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_customer_reactivation_cohorts TO authenticated, service_role;
