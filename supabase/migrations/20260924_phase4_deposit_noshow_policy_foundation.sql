-- =========================================================================
-- MIGRATION: 20260924_phase4_deposit_noshow_policy_foundation.sql
-- Description: Phase 4 Node 1 Deposit & No-Show Policy Foundation
-- Target: PostgreSQL / Supabase
-- Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Constraints:
--   - Provider-neutral policy domain only (NO live payment collection, NO charge, NO real provider)
--   - Integer minor units only (e.g. kuruş / cents)
--   - Deposit requirements: fixed minor units or percentage requirement
--   - Service override & tenant default hierarchy
--   - No-show policy: cancellation window, consequence, forfeit / refund eligibility state
--   - Separated from evaluate_booking_slot availability logic (slot availability evaluates CAN_THIS_SLOT_BE_BOOKED,
--     deposit policy evaluates WHAT_FINANCIAL_OR_POLICY_REQUIREMENT_APPLIES_TO_CONFIRMATION)
--   - Evaluated atomically during booking confirmation
-- =========================================================================

-- 1. Table: public.deposit_policies
CREATE TABLE IF NOT EXISTS public.deposit_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    service_id UUID DEFAULT NULL, -- NULL indicates tenant default deposit policy
    deposit_type TEXT NOT NULL CHECK (deposit_type IN ('fixed_amount', 'percentage', 'none')),
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0), -- Minor units if fixed_amount; percentage (0-100) if percentage
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_deposit_policies_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_deposit_policies_tenant_service UNIQUE (tenant_id, service_id),
    CONSTRAINT chk_deposit_percentage_range CHECK (deposit_type <> 'percentage' OR (deposit_value >= 0 AND deposit_value <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deposit_policies_tenant_default
    ON public.deposit_policies (tenant_id)
    WHERE service_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_policies_tenant ON public.deposit_policies(tenant_id);

ALTER TABLE public.deposit_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deposit_policies FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read deposit_policies"
    ON public.deposit_policies FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = deposit_policies.tenant_id
                )
              )
        )
    );

-- 2. Table: public.no_show_policies
CREATE TABLE IF NOT EXISTS public.no_show_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cancellation_deadline_hours INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_deadline_hours >= 0),
    no_show_consequence TEXT NOT NULL DEFAULT 'forfeit_deposit'
        CHECK (no_show_consequence IN ('forfeit_deposit', 'strike_record', 'block_booking', 'none')),
    late_cancellation_fee_minor_units INTEGER NOT NULL DEFAULT 0 CHECK (late_cancellation_fee_minor_units >= 0),
    refund_eligible_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (refund_eligible_window_hours >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_no_show_policies_tenant UNIQUE (tenant_id)
);

ALTER TABLE public.no_show_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.no_show_policies FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read no_show_policies"
    ON public.no_show_policies FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = no_show_policies.tenant_id
                )
              )
        )
    );

-- 3. Table: public.appointment_deposits
CREATE TABLE IF NOT EXISTS public.appointment_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL,
    required_minor_units INTEGER NOT NULL CHECK (required_minor_units >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    status TEXT NOT NULL DEFAULT 'required'
        CHECK (status IN ('required', 'held', 'applied', 'forfeited', 'refunded', 'waived')),
    payment_intent_id UUID DEFAULT NULL, -- Tenant-safe relational binding to provider-neutral payment_intents
    payment_intent_ref TEXT DEFAULT NULL, -- LEGACY_NON_AUTHORITATIVE_ONLY (unconstrained string reference)
    forfeited_reason TEXT DEFAULT NULL,
    refund_eligibility_state TEXT NOT NULL DEFAULT 'eligible_if_cancelled_in_time'
        CHECK (refund_eligibility_state IN ('eligible_if_cancelled_in_time', 'non_refundable', 'refund_issued', 'forfeited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_appointment_deposits_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_deposits_payment_intent_tenant FOREIGN KEY (payment_intent_id, tenant_id)
        REFERENCES public.payment_intents(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT uq_appointment_deposits_appointment UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_deposits_tenant ON public.appointment_deposits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointment_deposits_status ON public.appointment_deposits(status);

ALTER TABLE public.appointment_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_deposits FROM PUBLIC, anon, authenticated;

CREATE POLICY "Tenant staff and admins read appointment_deposits"
    ON public.appointment_deposits FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = appointment_deposits.tenant_id
                )
              )
        )
    );

-- =========================================================================
-- 4. Policy Evaluator: public.evaluate_booking_confirmation_deposit_policy
-- =========================================================================
-- Evaluates financial requirements that apply to appointment confirmation.
-- Strictly separated from slot availability. Returns requirement in integer minor units.
-- Explicitly classifies catalog price units without silent conversion assumption.

CREATE OR REPLACE FUNCTION public.evaluate_booking_confirmation_deposit_policy(
    p_tenant_id  UUID,
    p_service_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_svc_price         INTEGER;
    v_dep_pol           RECORD;
    v_ns_pol            RECORD;
    v_required_amount   INTEGER := 0;
    v_currency          VARCHAR(3) := 'TRY';
    v_price_units_classification TEXT := 'CATALOG_PRICE_ASSUMED_MAJOR_UNITS';
BEGIN
    -- 1. Get service price from catalog
    SELECT price INTO v_svc_price
    FROM public.services
    WHERE id = p_service_id AND tenant_id = p_tenant_id AND active = true;

    IF NOT FOUND OR v_svc_price IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service');
    END IF;

    -- 2. Lookup deposit policy: exact service rule first, fallback to tenant default
    SELECT * INTO v_dep_pol
    FROM public.deposit_policies
    WHERE tenant_id = p_tenant_id
      AND service_id = p_service_id
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT * INTO v_dep_pol
        FROM public.deposit_policies
        WHERE tenant_id = p_tenant_id
          AND service_id IS NULL
          AND is_active = true
        LIMIT 1;
    END IF;

    -- If deposit policy found and active:
    IF v_dep_pol.id IS NOT NULL THEN
        v_currency := v_dep_pol.currency;
        IF v_dep_pol.deposit_type = 'fixed_amount' THEN
            -- Fixed-amount deposit is explicitly stored in minor units
            v_required_amount := v_dep_pol.deposit_value;
        ELSIF v_dep_pol.deposit_type = 'percentage' THEN
            -- Until catalog price unit source truth is proven, percentage-based calculation
            -- fails closed rather than silently assuming major vs minor units.
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'PERCENTAGE_DEPOSIT_CALCULATION_UNAVAILABLE',
                'price_units_source_truth', 'CATALOG_PRICE_UNIT_UNRESOLVED',
                'detail', 'Catalog price unit is unproven in repository source truth; percentage conversion suspended'
            );
        END IF;
    END IF;

    -- 3. Lookup no-show policy
    SELECT * INTO v_ns_pol
    FROM public.no_show_policies
    WHERE tenant_id = p_tenant_id AND is_active = true
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'service_id', p_service_id,
        'price_units_source_truth', 'CATALOG_PRICE_UNIT_UNRESOLVED',
        'deposit_required', (v_required_amount > 0),
        'deposit_amount_minor_units', v_required_amount,
        'currency', v_currency,
        'no_show_cancellation_deadline_hours', COALESCE(v_ns_pol.cancellation_deadline_hours, 24),
        'no_show_consequence', COALESCE(v_ns_pol.no_show_consequence, 'forfeit_deposit'),
        'refund_eligible_window_hours', COALESCE(v_ns_pol.refund_eligible_window_hours, 24)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_booking_confirmation_deposit_policy(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_booking_confirmation_deposit_policy(UUID, UUID) TO anon, authenticated, service_role;

-- =========================================================================
-- 5. Management RPCs: Deposit & No-Show Policy Administration
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_set_deposit_policy(
    p_tenant_id    UUID,
    p_service_id   UUID DEFAULT NULL,
    p_deposit_type TEXT DEFAULT 'fixed_amount',
    p_deposit_val  INTEGER DEFAULT 0,
    p_currency     TEXT DEFAULT 'TRY',
    p_is_active    BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_id   UUID;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_service_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'INVALID_SERVICE' USING ERRCODE = '23503';
    END IF;

    IF p_deposit_type = 'percentage' AND (p_deposit_val < 0 OR p_deposit_val > 100) THEN
        RAISE EXCEPTION 'INVALID_PERCENTAGE: Must be between 0 and 100' USING ERRCODE = '22003';
    END IF;

    -- Handle Tenant Default (p_service_id IS NULL) vs Service Override explicitly
    IF p_service_id IS NULL THEN
        SELECT id INTO v_id
        FROM public.deposit_policies
        WHERE tenant_id = p_tenant_id AND service_id IS NULL;

        IF v_id IS NOT NULL THEN
            UPDATE public.deposit_policies
            SET deposit_type  = p_deposit_type,
                deposit_value = GREATEST(0, COALESCE(p_deposit_val, 0)),
                currency      = upper(COALESCE(p_currency, 'TRY')),
                is_active     = COALESCE(p_is_active, true),
                updated_at    = now()
            WHERE id = v_id;
        ELSE
            INSERT INTO public.deposit_policies (tenant_id, service_id, deposit_type, deposit_value, currency, is_active)
            VALUES (p_tenant_id, NULL, p_deposit_type, GREATEST(0, COALESCE(p_deposit_val, 0)), upper(COALESCE(p_currency, 'TRY')), COALESCE(p_is_active, true))
            RETURNING id INTO v_id;
        END IF;
    ELSE
        INSERT INTO public.deposit_policies (tenant_id, service_id, deposit_type, deposit_value, currency, is_active)
        VALUES (p_tenant_id, p_service_id, p_deposit_type, GREATEST(0, COALESCE(p_deposit_val, 0)), upper(COALESCE(p_currency, 'TRY')), COALESCE(p_is_active, true))
        ON CONFLICT (tenant_id, service_id) DO UPDATE
        SET deposit_type  = EXCLUDED.deposit_type,
            deposit_value = EXCLUDED.deposit_value,
            currency      = EXCLUDED.currency,
            is_active     = EXCLUDED.is_active,
            updated_at    = now()
        RETURNING id INTO v_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'deposit_policy_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_no_show_policy(
    p_tenant_id        UUID,
    p_deadline_hours   INTEGER DEFAULT 24,
    p_consequence      TEXT DEFAULT 'forfeit_deposit',
    p_late_fee_minor   INTEGER DEFAULT 0,
    p_refund_win_hours INTEGER DEFAULT 24,
    p_is_active        BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user RECORD;
    v_id   UUID;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.no_show_policies (
        tenant_id, cancellation_deadline_hours, no_show_consequence,
        late_cancellation_fee_minor_units, refund_eligible_window_hours, is_active
    ) VALUES (
        p_tenant_id, GREATEST(0, COALESCE(p_deadline_hours, 24)), p_consequence,
        GREATEST(0, COALESCE(p_late_fee_minor, 0)), GREATEST(0, COALESCE(p_refund_win_hours, 24)), COALESCE(p_is_active, true)
    )
    ON CONFLICT (tenant_id) DO UPDATE
    SET cancellation_deadline_hours = EXCLUDED.cancellation_deadline_hours,
        no_show_consequence         = EXCLUDED.no_show_consequence,
        late_cancellation_fee_minor_units = EXCLUDED.late_cancellation_fee_minor_units,
        refund_eligible_window_hours = EXCLUDED.refund_eligible_window_hours,
        is_active                   = EXCLUDED.is_active,
        updated_at                  = now()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'no_show_policy_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_deposit_policy(UUID, UUID, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_no_show_policy(UUID, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_deposit_policy(UUID, UUID, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_no_show_policy(UUID, INTEGER, TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated, service_role;
