-- ==============================================================================
-- Ported from 72911e4: 20260925_phase4_loyalty_reactivation_foundation.sql
-- Conflict-free sequential prefix: 20260924 (ADIM-035 / Faz D3)
-- Description: Phase 4 Loyalty & Automated Client Reactivation Foundation
-- Production Status: NO_GO
-- Safety Constraints:
--   1. Reuses canonical public.customers(id), tenants, and appointments models.
--   2. Direct mutation access revoked from PUBLIC, anon, and authenticated browser roles.
--   3. All loyalty ledger events are monotonic and append-only (BEFORE UPDATE OR DELETE trigger).
--   4. Advisory locking + FOR UPDATE + idempotency conflict guards on earn & redeem.
--   5. Strictly NO_NETWORK_SEND; reactivation queues via enqueue_communication_outbox only.
-- ==============================================================================

-- 1. LOYALTY PROGRAM CONFIGURATION PER TENANT
CREATE TABLE IF NOT EXISTS public.tenant_loyalty_configs (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    points_per_completed_appointment INTEGER NOT NULL DEFAULT 50,
    points_per_minor_unit NUMERIC(10, 4) NOT NULL DEFAULT 0.0100,
    minor_units_per_point NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
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
    points_delta INTEGER NOT NULL,
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

CREATE OR REPLACE FUNCTION public.prevent_loyalty_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
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

ALTER TABLE public.tenant_loyalty_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reactivation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_loyalty_configs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_loyalty_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_loyalty_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_reactivation_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.tenant_loyalty_configs TO service_role;
GRANT ALL ON public.customer_loyalty_ledger TO service_role;
GRANT ALL ON public.customer_loyalty_balances TO service_role;
GRANT ALL ON public.customer_reactivation_events TO service_role;

-- 5. SERVER-AUTHORITATIVE RPC: EARN LOYALTY POINTS ON COMPLETED APPOINTMENT
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
    v_existing RECORD;
    v_idem_key TEXT;
    v_points_to_award INTEGER;
    v_new_balance INTEGER;
    v_new_lifetime_earned INTEGER;
    v_ledger_id UUID;
BEGIN
    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT v_config.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'LOYALTY_DISABLED_OR_NOT_CONFIGURED');
    END IF;

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

    v_idem_key := COALESCE(NULLIF(trim(COALESCE(p_idempotency_key, '')), ''), 'earn_appt:' || p_appointment_id::text);

    PERFORM pg_advisory_xact_lock(
        hashtextextended('loyalty_bal:' || p_tenant_id::text || ':' || p_customer_id::text, 0)
    );

    SELECT * INTO v_existing
    FROM public.customer_loyalty_ledger
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem_key;

    IF FOUND THEN
        IF v_existing.customer_id <> p_customer_id
           OR v_existing.appointment_id IS DISTINCT FROM p_appointment_id
           OR v_existing.entry_type <> 'earned_appointment' THEN
            RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_CONFLICT');
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'reason', 'IDEMPOTENCY_KEY_ALREADY_PROCESSED',
            'ledger_id', v_existing.id,
            'current_balance', v_existing.running_balance
        );
    END IF;

    v_points_to_award := COALESCE(v_config.points_per_completed_appointment, 50);
    IF v_points_to_award <= 0 THEN
        v_points_to_award := 50;
    END IF;

    INSERT INTO public.customer_loyalty_balances (tenant_id, customer_id, current_balance, lifetime_earned, lifetime_redeemed, last_earned_at, updated_at)
    VALUES (p_tenant_id, p_customer_id, v_points_to_award, v_points_to_award, 0, timezone('utc'::text, now()), timezone('utc'::text, now()))
    ON CONFLICT (tenant_id, customer_id)
    DO UPDATE SET
        current_balance = customer_loyalty_balances.current_balance + v_points_to_award,
        lifetime_earned = customer_loyalty_balances.lifetime_earned + v_points_to_award,
        last_earned_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    RETURNING current_balance, lifetime_earned INTO v_new_balance, v_new_lifetime_earned;

    INSERT INTO public.customer_loyalty_ledger (
        tenant_id, customer_id, appointment_id, entry_type, points_delta, running_balance, description, idempotency_key
    ) VALUES (
        p_tenant_id, p_customer_id, p_appointment_id, 'earned_appointment', v_points_to_award, v_new_balance,
        format('Earned from completed appointment %s', p_appointment_id), v_idem_key
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_awarded', v_points_to_award,
        'current_balance', v_new_balance,
        'lifetime_earned', v_new_lifetime_earned,
        'ledger_id', v_ledger_id
    );
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
    v_existing RECORD;
    v_idem_key TEXT;
    v_new_balance INTEGER;
    v_discount_minor_units BIGINT;
    v_ledger_id UUID;
    v_appt RECORD;
BEGIN
    IF p_points_to_redeem IS NULL OR p_points_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_POINTS_AMOUNT');
    END IF;

    v_idem_key := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
    IF v_idem_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_IDEMPOTENCY_KEY');
    END IF;

    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    IF NOT FOUND OR NOT v_config.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason', 'LOYALTY_DISABLED');
    END IF;

    IF p_points_to_redeem < v_config.minimum_points_redemption THEN
        RETURN jsonb_build_object('success', false, 'reason', 'BELOW_MINIMUM_REDEMPTION_THRESHOLD');
    END IF;

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

    PERFORM pg_advisory_xact_lock(
        hashtextextended('loyalty_bal:' || p_tenant_id::text || ':' || p_customer_id::text, 0)
    );

    SELECT * INTO v_existing
    FROM public.customer_loyalty_ledger
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem_key;

    IF FOUND THEN
        IF v_existing.customer_id <> p_customer_id
           OR v_existing.appointment_id IS DISTINCT FROM p_appointment_id
           OR v_existing.points_delta <> -p_points_to_redeem
           OR v_existing.entry_type <> 'redeemed_appointment' THEN
            RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_CONFLICT');
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'reason', 'IDEMPOTENCY_KEY_ALREADY_PROCESSED',
            'ledger_id', v_existing.id,
            'remaining_balance', v_existing.running_balance
        );
    END IF;

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
        format('Redeemed on appointment %s', p_appointment_id), v_idem_key
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_redeemed', p_points_to_redeem,
        'discount_minor_units', v_discount_minor_units,
        'remaining_balance', v_new_balance,
        'ledger_id', v_ledger_id
    );
END;
$$;

-- 7. SANITIZED READ RPC: GET CUSTOMER LOYALTY PROFILE
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
    v_user        RECORD;
    v_balance     RECORD;
    v_config      RECORD;
    v_has_config  BOOLEAN := FALSE;
    v_has_balance BOOLEAN := FALSE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        SELECT role, tenant_id INTO v_user
        FROM public.users_profile
        WHERE id = auth.uid() AND active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
        END IF;

        IF v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff or owner access required' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_config FROM public.tenant_loyalty_configs WHERE tenant_id = p_tenant_id;
    v_has_config := FOUND;
    SELECT * INTO v_balance FROM public.customer_loyalty_balances WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id;
    v_has_balance := FOUND;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'customer_id', p_customer_id,
        'is_active', CASE WHEN v_has_config THEN COALESCE(v_config.is_active, false) ELSE false END,
        'current_balance', CASE WHEN v_has_balance THEN COALESCE(v_balance.current_balance, 0) ELSE 0 END,
        'lifetime_earned', CASE WHEN v_has_balance THEN COALESCE(v_balance.lifetime_earned, 0) ELSE 0 END,
        'lifetime_redeemed', CASE WHEN v_has_balance THEN COALESCE(v_balance.lifetime_redeemed, 0) ELSE 0 END,
        'last_earned_at', CASE WHEN v_has_balance THEN v_balance.last_earned_at ELSE NULL END,
        'last_redeemed_at', CASE WHEN v_has_balance THEN v_balance.last_redeemed_at ELSE NULL END
    );
END;
$$;

-- 8. AUTOMATED REACTIVATION SCAN
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
    v_max_created_at TIMESTAMPTZ;
    v_granted_count INTEGER;
    v_revoked_count INTEGER;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        SELECT role, tenant_id INTO v_user
        FROM public.users_profile
        WHERE id = auth.uid() AND active = true;

        IF NOT FOUND OR (v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id)) THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Tenant staff or owner access required' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_inactivity_days = 60 THEN
        v_cohort_code := 'inactive_60d';
    ELSIF p_inactivity_days = 90 THEN
        v_cohort_code := 'inactive_90d';
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'tenant_id', p_tenant_id,
            'error', 'INVALID_COHORT_INACTIVITY_BOUNDARY',
            'message', 'Cohort boundary must be exactly 60 or 90 days',
            'detected_customers', 0,
            'queued_outbox_count', 0,
            'suppressed_count', 0
        );
    END IF;

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
        SELECT id INTO v_event_id
        FROM public.customer_reactivation_events
        WHERE tenant_id = p_tenant_id
          AND customer_id = v_cand.customer_id
          AND last_appointment_at = v_cand.last_appt
          AND cohort_code = v_cohort_code;

        IF FOUND THEN
            CONTINUE;
        END IF;

        v_detected_count := v_detected_count + 1;

        SELECT MAX(created_at) INTO v_max_created_at
        FROM public.consent_ledger
        WHERE tenant_id = p_tenant_id::text
          AND customer_id = v_cand.customer_id::text
          AND consent_type = 'marketing';

        IF v_max_created_at IS NULL THEN
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

        SELECT
            COUNT(*) FILTER (WHERE is_granted IS TRUE),
            COUNT(*) FILTER (WHERE is_granted IS NOT TRUE)
        INTO v_granted_count, v_revoked_count
        FROM public.consent_ledger
        WHERE tenant_id = p_tenant_id::text
          AND customer_id = v_cand.customer_id::text
          AND consent_type = 'marketing'
          AND created_at = v_max_created_at;

        IF v_granted_count > 0 AND v_revoked_count > 0 THEN
            INSERT INTO public.customer_reactivation_events (
                tenant_id, customer_id, cohort_code, last_appointment_at, inactivity_days,
                status, suppression_reason, bonus_points_offered
            ) VALUES (
                p_tenant_id, v_cand.customer_id, v_cohort_code, v_cand.last_appt, v_cand.days_inactive,
                'suppressed', 'SUPPRESSED_AMBIGUOUS_MARKETING_CONSENT', v_bonus_pts
            );
            v_suppressed_count := v_suppressed_count + 1;
            CONTINUE;
        ELSIF v_granted_count > 0 AND v_revoked_count = 0 THEN
            v_current_consent := true;
        ELSE
            v_current_consent := false;
        END IF;

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

        IF v_cand.customer_email IS NOT NULL AND length(trim(v_cand.customer_email)) >= 3 THEN
            v_channel := 'email';
            v_recipient := trim(v_cand.customer_email);
        ELSIF v_cand.customer_phone IS NOT NULL AND length(trim(v_cand.customer_phone)) >= 3 THEN
            v_channel := 'sms';
            v_recipient := trim(v_cand.customer_phone);
        ELSE
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

        v_idempotency_key := 'reactivation:' || p_tenant_id::text || ':' || v_cand.customer_id::text || ':' || v_cohort_code || ':' || EXTRACT(EPOCH FROM v_cand.last_appt)::BIGINT::text;

        v_payload := jsonb_build_object(
            'customer_name', v_cand.customer_name,
            'cohort_code', v_cohort_code,
            'days_inactive', v_cand.days_inactive,
            'bonus_points_offered', v_bonus_pts,
            'message', 'We miss you! Book your next visit and receive ' || v_bonus_pts || ' bonus loyalty points.'
        );

        v_outbox_res := public.enqueue_communication_outbox(
            p_tenant_id         => p_tenant_id,
            p_channel           => v_channel,
            p_recipient_address => v_recipient,
            p_template_id       => 'customer_reactivation_' || v_cohort_code,
            p_payload           => v_payload,
            p_idempotency_key   => v_idempotency_key,
            p_max_attempts      => 3
        );

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

REVOKE EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment(UUID, UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment(UUID, UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_loyalty_profile(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.scan_customer_reactivation_cohorts(UUID, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.earn_loyalty_points_for_appointment(UUID, UUID, UUID, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points_for_appointment(UUID, UUID, UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_profile(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_customer_reactivation_cohorts(UUID, INTEGER) TO authenticated, service_role;
