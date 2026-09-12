-- =========================================================================
-- MIGRATION: 20260925_phase4_packages_memberships_foundation.sql
-- Description: Phase 4 Node 2 Service Packages & Memberships Foundation
-- Target: PostgreSQL / Supabase
-- Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Constraints:
--   - Service packages, credit grants, remaining credits, expiry, service eligibility
--   - Membership entitlements, manual/test activation state
--   - Concurrency-safe locking (SELECT ... FOR UPDATE) and idempotency
--   - Immutable redemption ledger
--   - NO billing provider activation
--   - Integer minor units for package pricing
-- =========================================================================

-- 1. Table: public.service_package_definitions
CREATE TABLE IF NOT EXISTS public.service_package_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_minor_units INTEGER NOT NULL CHECK (price_minor_units >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    total_credits INTEGER NOT NULL CHECK (total_credits > 0),
    validity_days INTEGER NOT NULL CHECK (validity_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_pkg_def_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT uq_pkg_def_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_def_tenant ON public.service_package_definitions(tenant_id);

-- 2. Table: public.service_package_eligibility
-- Maps package definitions to eligible services
CREATE TABLE IF NOT EXISTS public.service_package_eligibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    package_definition_id UUID NOT NULL,
    service_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_pkg_eligibility UNIQUE (package_definition_id, service_id),
    CONSTRAINT fk_pkg_eligibility_pkg_tenant FOREIGN KEY (package_definition_id, tenant_id)
        REFERENCES public.service_package_definitions(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_pkg_eligibility_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pkg_eligibility_pkg ON public.service_package_eligibility(package_definition_id);
CREATE INDEX IF NOT EXISTS idx_pkg_eligibility_svc ON public.service_package_eligibility(service_id);

-- 3. Table: public.customer_packages
-- Customer-purchased/granted package instances
CREATE TABLE IF NOT EXISTS public.customer_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    package_definition_id UUID NOT NULL,
    initial_credits INTEGER NOT NULL CHECK (initial_credits > 0),
    remaining_credits INTEGER NOT NULL CHECK (remaining_credits >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_customer_packages_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_customer_packages_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_packages_pkg_def_tenant FOREIGN KEY (package_definition_id, tenant_id)
        REFERENCES public.service_package_definitions(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT chk_customer_package_credits CHECK (remaining_credits <= initial_credits)
);

CREATE INDEX IF NOT EXISTS idx_customer_packages_lookup
    ON public.customer_packages(tenant_id, customer_id, status);

-- 4. Table: public.customer_package_redemption_ledger
-- Immutable redemption audit log
CREATE TABLE IF NOT EXISTS public.customer_package_redemption_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_package_id UUID NOT NULL,
    appointment_id UUID DEFAULT NULL,
    service_id UUID NOT NULL,
    credits_debited INTEGER NOT NULL CHECK (credits_debited > 0),
    credits_after INTEGER NOT NULL CHECK (credits_after >= 0),
    idempotency_key TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_pkg_redemption_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_pkg_redemption_customer_pkg_tenant FOREIGN KEY (customer_package_id, tenant_id)
        REFERENCES public.customer_packages(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_pkg_redemption_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_pkg_redemption_service_tenant FOREIGN KEY (service_id, tenant_id)
        REFERENCES public.services(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pkg_redemption_pkg ON public.customer_package_redemption_ledger(customer_package_id);
CREATE INDEX IF NOT EXISTS idx_pkg_redemption_appt ON public.customer_package_redemption_ledger(appointment_id);

-- Database-enforced Append-Only Protection on Redemption Ledger
CREATE OR REPLACE FUNCTION public.prevent_redemption_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'REDEMPTION_LEDGER_IMMUTABLE: Updates and deletes are forbidden'
        USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_redemption_ledger_mutation ON public.customer_package_redemption_ledger;
CREATE TRIGGER trg_prevent_redemption_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.customer_package_redemption_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_redemption_ledger_mutation();

-- 5. Table: public.membership_plans
CREATE TABLE IF NOT EXISTS public.membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_minor_units INTEGER NOT NULL CHECK (price_minor_units >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    interval_unit TEXT NOT NULL CHECK (interval_unit IN ('month', 'quarter', 'year')),
    interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
    entitlement_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"discount_percent": 15, "monthly_free_credits": 2}
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_membership_plans_name UNIQUE (tenant_id, name),
    CONSTRAINT uq_membership_plans_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_tenant ON public.membership_plans(tenant_id);

-- 6. Table: public.customer_memberships
-- Supports historical & resubscribe semantics via partial unique on active state
CREATE TABLE IF NOT EXISTS public.customer_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    membership_plan_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    activation_mode TEXT NOT NULL DEFAULT 'manual_test' CHECK (activation_mode IN ('manual_test', 'comped', 'admin_granted')),
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_customer_memberships_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_memberships_plan_tenant FOREIGN KEY (membership_plan_id, tenant_id)
        REFERENCES public.membership_plans(id, tenant_id) ON DELETE RESTRICT
);

-- Partial unique: only 1 ACTIVE membership per customer per plan, allowing past historical records
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_active_membership
    ON public.customer_memberships (tenant_id, customer_id, membership_plan_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_customer_memberships_lookup
    ON public.customer_memberships(tenant_id, customer_id, status);

-- Enable RLS on all tables and revoke public
ALTER TABLE public.service_package_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_package_redemption_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.service_package_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.service_package_eligibility FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_packages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_package_redemption_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.membership_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_memberships FROM PUBLIC, anon, authenticated;

-- Staff / Tenant Owner Read Policies
CREATE POLICY "Staff read service_package_definitions" ON public.service_package_definitions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = service_package_definitions.tenant_id)))
);
CREATE POLICY "Staff read service_package_eligibility" ON public.service_package_eligibility FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = service_package_eligibility.tenant_id)))
);
CREATE POLICY "Staff read customer_packages" ON public.customer_packages FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = customer_packages.tenant_id)))
);
CREATE POLICY "Staff read customer_package_redemption_ledger" ON public.customer_package_redemption_ledger FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = customer_package_redemption_ledger.tenant_id)))
);
CREATE POLICY "Staff read membership_plans" ON public.membership_plans FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = membership_plans.tenant_id)))
);
CREATE POLICY "Staff read customer_memberships" ON public.customer_memberships FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = customer_memberships.tenant_id)))
);

-- =========================================================================
-- 7. RPC: redeem_customer_package_credits
-- Concurrency-safe atomic redemption with row-level locking & idempotency
-- Validates appointment tenant, customer, and service before mutation.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.redeem_customer_package_credits(
    p_tenant_id           UUID,
    p_customer_package_id UUID,
    p_service_id          UUID,
    p_credits_to_redeem   INTEGER DEFAULT 1,
    p_appointment_id      UUID DEFAULT NULL,
    p_idempotency_key     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user              RECORD;
    v_pkg               RECORD;
    v_eligibility_count INTEGER;
    v_existing_ledger   RECORD;
    v_new_remaining     INTEGER;
    v_new_status        TEXT;
    v_ledger_id         UUID;
    v_idem_key          TEXT;
    v_appt              RECORD;
BEGIN
    -- 1. Authorization
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_credits_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_credits_amount');
    END IF;

    v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

    -- 2. Check Idempotency
    SELECT * INTO v_existing_ledger
    FROM public.customer_package_redemption_ledger
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'ledger_id', v_existing_ledger.id,
            'remaining_credits', v_existing_ledger.credits_after
        );
    END IF;

    -- 3. Lock Customer Package Row (SELECT ... FOR UPDATE)
    SELECT * INTO v_pkg
    FROM public.customer_packages
    WHERE id = p_customer_package_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'package_not_found');
    END IF;

    IF v_pkg.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'package_not_active', 'status', v_pkg.status);
    END IF;

    IF v_pkg.expires_at < now() THEN
        -- Mark as expired
        UPDATE public.customer_packages SET status = 'expired', updated_at = now() WHERE id = v_pkg.id;
        RETURN jsonb_build_object('success', false, 'reason_code', 'package_expired');
    END IF;

    IF v_pkg.remaining_credits < p_credits_to_redeem THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'insufficient_credits',
            'available_credits', v_pkg.remaining_credits,
            'requested_credits', p_credits_to_redeem
        );
    END IF;

    -- 4. Validate Appointment if provided (Tenant, Customer, Service match)
    IF p_appointment_id IS NOT NULL THEN
        SELECT * INTO v_appt
        FROM public.appointments
        WHERE id = p_appointment_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'appointment_not_found_in_tenant');
        END IF;

        IF v_appt.customer_id <> v_pkg.customer_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'appointment_customer_mismatch');
        END IF;

        IF v_appt.service_id <> p_service_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'appointment_service_mismatch');
        END IF;
    END IF;

    -- 5. Verify Service Eligibility
    SELECT COUNT(*) INTO v_eligibility_count
    FROM public.service_package_eligibility
    WHERE package_definition_id = v_pkg.package_definition_id
      AND service_id = p_service_id
      AND tenant_id = p_tenant_id;

    IF v_eligibility_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'service_not_eligible_for_package');
    END IF;

    -- 6. Deduct Credits
    v_new_remaining := v_pkg.remaining_credits - p_credits_to_redeem;
    v_new_status := CASE WHEN v_new_remaining = 0 THEN 'exhausted' ELSE 'active' END;

    UPDATE public.customer_packages
    SET remaining_credits = v_new_remaining,
        status = v_new_status,
        updated_at = now()
    WHERE id = v_pkg.id;

    -- 7. Insert Immutable Redemption Ledger Entry
    INSERT INTO public.customer_package_redemption_ledger (
        tenant_id,
        customer_package_id,
        appointment_id,
        service_id,
        credits_debited,
        credits_after,
        idempotency_key,
        metadata
    ) VALUES (
        p_tenant_id,
        v_pkg.id,
        p_appointment_id,
        p_service_id,
        p_credits_to_redeem,
        v_new_remaining,
        v_idem_key,
        jsonb_build_object('debited_by', auth.uid(), 'debited_at', now())
    )
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', false,
        'ledger_id', v_ledger_id,
        'credits_redeemed', p_credits_to_redeem,
        'remaining_credits', v_new_remaining,
        'package_status', v_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_customer_package_credits(UUID, UUID, UUID, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_customer_package_credits(UUID, UUID, UUID, INTEGER, UUID, TEXT) TO authenticated, service_role;

-- =========================================================================
-- 8. Admin RPC: grant_customer_package
-- Proves customer belongs to tenant before creating package instance.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_grant_customer_package(
    p_tenant_id             UUID,
    p_customer_id           UUID,
    p_package_definition_id UUID,
    p_custom_validity_days  INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user    RECORD;
    v_pkg_def RECORD;
    v_inst_id UUID;
    v_days    INTEGER;
    v_cust_exists BOOLEAN;
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

    -- Prove customer belongs to exact tenant
    SELECT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = p_tenant_id
    ) INTO v_cust_exists;

    IF NOT v_cust_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'customer_not_found_in_tenant');
    END IF;

    SELECT * INTO v_pkg_def
    FROM public.service_package_definitions
    WHERE id = p_package_definition_id AND tenant_id = p_tenant_id AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'package_definition_not_found');
    END IF;

    v_days := COALESCE(p_custom_validity_days, v_pkg_def.validity_days);

    INSERT INTO public.customer_packages (
        tenant_id, customer_id, package_definition_id,
        initial_credits, remaining_credits, expires_at, status
    ) VALUES (
        p_tenant_id, p_customer_id, p_pkg_def.id,
        v_pkg_def.total_credits, v_pkg_def.total_credits, now() + (v_days || ' days')::INTERVAL, 'active'
    )
    RETURNING id INTO v_inst_id;

    RETURN jsonb_build_object('success', true, 'customer_package_id', v_inst_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_customer_package(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_customer_package(UUID, UUID, UUID, INTEGER) TO authenticated, service_role;
