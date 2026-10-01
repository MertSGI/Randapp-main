-- =========================================================================
-- MIGRATION 20261003_phase6_node4_staff_commissions_tips.sql
-- Description: Phase 6 Node 4 — Staff Commissions, Tip Allocation & Earnings Ledger Foundation
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 92
-- Authority: LARI-AOS-PROGRAM-V2-BOOTSTRAP-20260908-01 (DECISION-020)
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
--
-- Directives & Domain Architecture:
-- 1. INTERNAL EARNINGS ACCOUNTING ONLY:
--    Does NOT implement payroll, bank payouts, payment-provider payouts, Iyzico payout flows,
--    Stripe Connect, tax withholding, payroll exports, or production activation.
-- 2. REUSE EXISTING POS & STAFF DOMAINS:
--    Builds directly on public.pos_orders, public.pos_order_items, public.pos_order_payments,
--    public.staff, public.users_profile, existing auth.uid() authority, and existing POS checkout.
-- 3. STAFF COMMISSION RULES:
--    public.staff_commission_rules with integer basis points (0..10000), unique (tenant_id, staff_id, item_type),
--    allowed item_types ('service', 'product', 'package', 'custom'). Managed strictly by tenant_owner.
-- 4. TIP ALLOCATION:
--    public.pos_tip_allocations for multi-staff tip splits per order. Unique (tenant_id, order_id, staff_id),
--    amount_minor_units > 0. Recomputes order tip_minor_units and total_minor_units under advisory lock.
-- 5. PERFORMING STAFF ATTRIBUTION HARDENING:
--    pos_add_cart_item hardened so non-null performing_staff_id MUST be an active staff member
--    in the caller/order tenant. Foreign-tenant staff UUIDs fail closed.
-- 6. IMMUTABLE STAFF EARNINGS LEDGER:
--    public.staff_earnings_ledger records immutable commission and tip rows during atomic checkout.
--    Deterministic idempotency keys (commission:<order_id>:<order_item_id>, tip:<order_id>:<staff_id>).
--    Zero duplicate earnings on checkout replay. Failed/insufficient checkouts generate zero earnings.
-- 7. COMMISSION CALCULATION INVARIANT:
--    Commissionable base = GREATEST(unit_price_minor_units * quantity - discount_minor_units, 0).
--    Explicitly excludes tax and tip. Calculated as (commissionable_base * commission_basis_points) / 10000.
-- 8. TRUST BOUNDARY:
--    Direct table mutations revoked from PUBLIC, anon, and authenticated on all new tables. RLS enabled.
-- =========================================================================


-- =========================================================================
-- 1. TABLE: public.staff_commission_rules
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_commission_rules (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id                    UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    item_type                   TEXT NOT NULL CHECK (
        item_type IN ('service', 'product', 'package', 'custom')
    ),
    commission_basis_points     INTEGER NOT NULL CHECK (
        commission_basis_points >= 0 AND commission_basis_points <= 10000
    ),
    active                      BOOLEAN NOT NULL DEFAULT true,
    created_by_user_id          UUID NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_staff_commission_rules_logical UNIQUE (tenant_id, staff_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_staff_comm_rules_lookup 
ON public.staff_commission_rules(tenant_id, staff_id, item_type, active);

CREATE TRIGGER update_staff_commission_rules_modtime
BEFORE UPDATE ON public.staff_commission_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.staff_commission_rules ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 2. TABLE: public.pos_tip_allocations
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pos_tip_allocations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL,
    staff_id            UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    amount_minor_units  INTEGER NOT NULL CHECK (amount_minor_units > 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_pos_tip_allocations_order FOREIGN KEY (order_id, tenant_id)
        REFERENCES public.pos_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_pos_tip_allocations_order_staff UNIQUE (tenant_id, order_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_tip_allocations_order 
ON public.pos_tip_allocations(tenant_id, order_id);

CREATE TRIGGER update_pos_tip_allocations_modtime
BEFORE UPDATE ON public.pos_tip_allocations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.pos_tip_allocations ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 3. TABLE: public.staff_earnings_ledger
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.staff_earnings_ledger (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id                    UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    order_id                    UUID NOT NULL,
    order_item_id               UUID NULL,
    earning_type                TEXT NOT NULL CHECK (
        earning_type IN ('commission', 'tip')
    ),
    source_amount_minor_units   INTEGER NOT NULL CHECK (source_amount_minor_units >= 0),
    rate_basis_points           INTEGER NULL CHECK (
        rate_basis_points IS NULL OR (rate_basis_points >= 0 AND rate_basis_points <= 10000)
    ),
    earning_minor_units         INTEGER NOT NULL CHECK (earning_minor_units >= 0),
    currency                    VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    idempotency_key             TEXT NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_staff_earnings_order FOREIGN KEY (order_id, tenant_id)
        REFERENCES public.pos_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_staff_earnings_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_staff_earnings_staff_date 
ON public.staff_earnings_ledger(tenant_id, staff_id, created_at);

CREATE INDEX IF NOT EXISTS idx_staff_earnings_order 
ON public.staff_earnings_ledger(tenant_id, order_id);

ALTER TABLE public.staff_earnings_ledger ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 4. HARDENED TRUST BOUNDARY: REVOKE DIRECT TABLE MUTATIONS
-- =========================================================================

REVOKE ALL ON TABLE public.staff_commission_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_tip_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_earnings_ledger FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.staff_commission_rules TO authenticated;
GRANT SELECT ON TABLE public.pos_tip_allocations TO authenticated;
GRANT SELECT ON TABLE public.staff_earnings_ledger TO authenticated;


-- =========================================================================
-- 5. RLS POLICIES FOR DEFENSE IN DEPTH
-- =========================================================================

DROP POLICY IF EXISTS "Authorized tenant staff can view commission rules" ON public.staff_commission_rules;
CREATE POLICY "Authorized tenant staff can view commission rules"
ON public.staff_commission_rules
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = staff_commission_rules.tenant_id
          AND s.active = true
    )
    OR
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = staff_commission_rules.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view tip allocations" ON public.pos_tip_allocations;
CREATE POLICY "Authorized tenant staff can view tip allocations"
ON public.pos_tip_allocations
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = pos_tip_allocations.tenant_id
          AND s.active = true
    )
    OR
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = pos_tip_allocations.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Staff and tenant owners can view earnings ledger" ON public.staff_earnings_ledger;
CREATE POLICY "Staff and tenant owners can view earnings ledger"
ON public.staff_earnings_ledger
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.id = staff_earnings_ledger.staff_id
          AND s.tenant_id = staff_earnings_ledger.tenant_id
          AND s.active = true
    )
    OR
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = staff_earnings_ledger.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. pos_set_staff_commission_rule: Manage commission rules (tenant_owner only)
CREATE OR REPLACE FUNCTION public.pos_set_staff_commission_rule(
    p_staff_id UUID,
    p_item_type TEXT,
    p_commission_basis_points INTEGER,
    p_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_owner_profile RECORD;
    v_target_staff RECORD;
    v_clean_item_type TEXT := lower(trim(COALESCE(p_item_type, '')));
    v_rule_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF v_clean_item_type NOT IN ('service', 'product', 'package', 'custom') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Unsupported item_type %.', p_item_type;
    END IF;

    IF p_commission_basis_points IS NULL OR p_commission_basis_points < 0 OR p_commission_basis_points > 10000 THEN
        RAISE EXCEPTION 'INVALID_INPUT: commission_basis_points must be an integer between 0 and 10000.';
    END IF;

    -- Resolve caller: ONLY active tenant_owner of the same tenant (NO super_admin bypass)
    SELECT * INTO v_owner_profile
    FROM public.users_profile
    WHERE id = v_caller_uid
      AND role = 'tenant_owner'
      AND active = true;

    IF v_owner_profile.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active tenant_owner can manage staff commission rules.';
    END IF;

    -- Resolve target staff
    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL OR v_target_staff.tenant_id <> v_owner_profile.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Target staff not found or cross-tenant access denied.';
    END IF;

    IF v_target_staff.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member is inactive.';
    END IF;

    INSERT INTO public.staff_commission_rules (
        tenant_id,
        staff_id,
        item_type,
        commission_basis_points,
        active,
        created_by_user_id,
        created_at,
        updated_at
    ) VALUES (
        v_owner_profile.tenant_id,
        p_staff_id,
        v_clean_item_type,
        p_commission_basis_points,
        COALESCE(p_active, true),
        v_caller_uid,
        now(),
        now()
    )
    ON CONFLICT (tenant_id, staff_id, item_type)
    DO UPDATE SET
        commission_basis_points = EXCLUDED.commission_basis_points,
        active = EXCLUDED.active,
        created_by_user_id = EXCLUDED.created_by_user_id,
        updated_at = now()
    RETURNING id INTO v_rule_id;

    RETURN jsonb_build_object(
        'success', true,
        'rule_id', v_rule_id,
        'tenant_id', v_owner_profile.tenant_id,
        'staff_id', p_staff_id,
        'item_type', v_clean_item_type,
        'commission_basis_points', p_commission_basis_points,
        'active', COALESCE(p_active, true)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_staff_commission_rule FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_set_staff_commission_rule TO authenticated, service_role;


-- B. pos_set_tip_allocation: Allocate tips to staff members on open orders
CREATE OR REPLACE FUNCTION public.pos_set_tip_allocation(
    p_order_id UUID,
    p_staff_id UUID,
    p_tip_minor_units INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_staff RECORD;
    v_order RECORD;
    v_target_staff RECORD;
    v_new_tip_total INTEGER := 0;
    v_items_total INTEGER := 0;
    v_new_order_total INTEGER := 0;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_tip_minor_units IS NULL OR p_tip_minor_units < 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: p_tip_minor_units must be non-negative.';
    END IF;

    -- Resolve caller: active staff member in tenant
    SELECT s.* INTO v_caller_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_caller_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Advisory lock serialization on order
    PERFORM pg_advisory_xact_lock(
        hashtextextended('pos_order:' || p_order_id::text, 0)
    );

    SELECT * INTO v_order
    FROM public.pos_orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL OR v_order.tenant_id <> v_caller_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Order not found or cross-tenant access denied.';
    END IF;

    IF v_order.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot modify tip allocation on order with status %.', v_order.status;
    END IF;

    -- Target staff validation
    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL OR v_target_staff.tenant_id <> v_caller_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Target staff not found or cross-tenant access denied.';
    END IF;

    IF v_target_staff.active IS NOT TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Target staff member is inactive.';
    END IF;

    IF p_tip_minor_units = 0 THEN
        DELETE FROM public.pos_tip_allocations
        WHERE tenant_id = v_caller_staff.tenant_id
          AND order_id = v_order.id
          AND staff_id = p_staff_id;
    ELSE
        INSERT INTO public.pos_tip_allocations (
            tenant_id,
            order_id,
            staff_id,
            amount_minor_units,
            created_at,
            updated_at
        ) VALUES (
            v_caller_staff.tenant_id,
            v_order.id,
            p_staff_id,
            p_tip_minor_units,
            now(),
            now()
        )
        ON CONFLICT (tenant_id, order_id, staff_id)
        DO UPDATE SET
            amount_minor_units = EXCLUDED.amount_minor_units,
            updated_at = now();
    END IF;

    -- Recompute total tips for order
    SELECT COALESCE(SUM(amount_minor_units), 0)
    INTO v_new_tip_total
    FROM public.pos_tip_allocations
    WHERE order_id = v_order.id;

    -- Recompute items line total sum
    SELECT COALESCE(SUM(line_total_minor_units), 0)
    INTO v_items_total
    FROM public.pos_order_items
    WHERE order_id = v_order.id;

    v_new_order_total := v_items_total + v_new_tip_total;

    UPDATE public.pos_orders
    SET tip_minor_units = v_new_tip_total,
        total_minor_units = v_new_order_total,
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'staff_id', p_staff_id,
        'allocated_tip_minor_units', p_tip_minor_units,
        'tip_minor_units', v_new_tip_total,
        'total_minor_units', v_new_order_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_tip_allocation FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_set_tip_allocation TO authenticated, service_role;


-- C. pos_add_cart_item: Hardened with performing_staff_id same-tenant/active validation
CREATE OR REPLACE FUNCTION public.pos_add_cart_item(
    p_order_id UUID,
    p_item_type TEXT,
    p_quantity INTEGER,
    p_product_id UUID DEFAULT NULL,
    p_service_id UUID DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_performing_staff_id UUID DEFAULT NULL,
    p_custom_name TEXT DEFAULT NULL,
    p_custom_price_minor_units INTEGER DEFAULT NULL,
    p_discount_minor_units INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_order RECORD;
    v_product RECORD;
    v_service RECORD;
    v_pkg RECORD;
    v_perf_staff RECORD;
    v_item_name TEXT;
    v_sku TEXT := NULL;
    v_unit_price INTEGER := 0;
    v_tax_rate INTEGER := 0;
    v_tax_amount INTEGER := 0;
    v_line_total INTEGER := 0;
    v_item_id UUID;
    v_subtotal INTEGER;
    v_total_tax INTEGER;
    v_total_discount INTEGER;
    v_items_line_total INTEGER;
    v_order_total INTEGER;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Quantity must be greater than zero.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    SELECT * INTO v_order
    FROM public.pos_orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL OR v_order.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Order not found or cross-tenant access denied.';
    END IF;

    IF v_order.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot add items to an order with status %.', v_order.status;
    END IF;

    -- NODE 4 HARDENING: When p_performing_staff_id is provided, must be active staff in same tenant
    IF p_performing_staff_id IS NOT NULL THEN
        SELECT * INTO v_perf_staff
        FROM public.staff
        WHERE id = p_performing_staff_id;

        IF v_perf_staff.id IS NULL OR v_perf_staff.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Performing staff not found or cross-tenant access denied.';
        END IF;

        IF v_perf_staff.active IS NOT TRUE THEN
            RAISE EXCEPTION 'INVALID_STATE: Performing staff member is inactive.';
        END IF;
    END IF;

    IF p_item_type = 'product' THEN
        IF p_product_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: product_id is required for product line items.';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = p_product_id;

        IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product not found or cross-tenant access denied.';
        END IF;

        IF v_product.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'PRODUCT_INACTIVE: Cannot sell an inactive product.';
        END IF;

        v_item_name := v_product.name;
        v_sku := v_product.sku;
        v_unit_price := v_product.price_minor_units;
        v_tax_rate := v_product.tax_rate_basis_points;

    ELSIF p_item_type = 'service' THEN
        IF p_service_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: service_id is required for service line items.';
        END IF;

        SELECT * INTO v_service
        FROM public.services
        WHERE id = p_service_id;

        IF v_service.id IS NULL OR v_service.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Service not found or cross-tenant access denied.';
        END IF;

        v_item_name := v_service.name;
        v_unit_price := COALESCE(v_service.price_minor_units, 0);

    ELSIF p_item_type = 'package' THEN
        IF p_package_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: package_id is required for package line items.';
        END IF;

        SELECT * INTO v_pkg
        FROM public.service_package_definitions
        WHERE id = p_package_id;

        IF v_pkg.id IS NULL OR v_pkg.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Package not found or cross-tenant access denied.';
        END IF;

        v_item_name := v_pkg.name;
        v_unit_price := COALESCE(v_pkg.price_minor_units, 0);

    ELSIF p_item_type = 'custom' THEN
        IF p_custom_name IS NULL OR length(trim(p_custom_name)) = 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT: custom_name is required for custom line items.';
        END IF;
        IF p_custom_price_minor_units IS NULL OR p_custom_price_minor_units < 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT: custom_price_minor_units must be non-negative.';
        END IF;

        v_item_name := trim(p_custom_name);
        v_unit_price := p_custom_price_minor_units;
    ELSE
        RAISE EXCEPTION 'INVALID_INPUT: Unsupported item_type %.', p_item_type;
    END IF;

    -- Calculate line totals
    v_tax_amount := ((v_unit_price * p_quantity) * v_tax_rate) / 10000;
    v_line_total := (v_unit_price * p_quantity) - COALESCE(p_discount_minor_units, 0) + v_tax_amount;
    IF v_line_total < 0 THEN v_line_total := 0; END IF;

    INSERT INTO public.pos_order_items (
        order_id,
        tenant_id,
        item_type,
        service_id,
        product_id,
        package_id,
        appointment_id,
        item_name,
        sku,
        quantity,
        unit_price_minor_units,
        discount_minor_units,
        tax_rate_basis_points,
        tax_minor_units,
        line_total_minor_units,
        performing_staff_id,
        created_at
    ) VALUES (
        v_order.id,
        v_staff.tenant_id,
        p_item_type,
        p_service_id,
        p_product_id,
        p_package_id,
        p_appointment_id,
        v_item_name,
        v_sku,
        p_quantity,
        v_unit_price,
        COALESCE(p_discount_minor_units, 0),
        v_tax_rate,
        v_tax_amount,
        v_line_total,
        p_performing_staff_id,
        now()
    )
    RETURNING id INTO v_item_id;

    -- Update order aggregate totals (preserving tip_minor_units)
    SELECT
        COALESCE(sum(unit_price_minor_units * quantity), 0),
        COALESCE(sum(tax_minor_units), 0),
        COALESCE(sum(discount_minor_units), 0),
        COALESCE(sum(line_total_minor_units), 0)
    INTO v_subtotal, v_total_tax, v_total_discount, v_items_line_total
    FROM public.pos_order_items
    WHERE order_id = v_order.id;

    v_order_total := v_items_line_total + COALESCE(v_order.tip_minor_units, 0);

    UPDATE public.pos_orders
    SET subtotal_minor_units = v_subtotal,
        tax_minor_units = v_total_tax,
        discount_minor_units = v_total_discount,
        total_minor_units = v_order_total,
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'item_id', v_item_id,
        'item_name', v_item_name,
        'quantity', p_quantity,
        'line_total_minor_units', v_line_total,
        'order_total_minor_units', v_order_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_add_cart_item FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_add_cart_item TO authenticated, service_role;


-- D. pos_checkout_order: Augmented with atomic staff commission and tip earnings ledger materialization
CREATE OR REPLACE FUNCTION public.pos_checkout_order(
    p_order_id UUID,
    p_payment_method TEXT,
    p_amount_paid_minor_units INTEGER,
    p_reference_identifier TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_order RECORD;
    v_item RECORD;
    v_tip_alloc RECORD;
    v_comm_rule RECORD;
    v_balance RECORD;
    v_prev_stock INTEGER;
    v_new_stock INTEGER;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_order RECORD;
    v_movement_id UUID;
    v_payment_id UUID;
    v_products_decremented INTEGER := 0;
    v_comm_base INTEGER;
    v_commission_amount INTEGER;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_payment_method NOT IN ('cash', 'card_present', 'card_terminal_adapter', 'customer_wallet', 'external') THEN
        RAISE EXCEPTION 'INVALID_INPUT: Unsupported payment method %.', p_payment_method;
    END IF;

    IF p_amount_paid_minor_units IS NULL OR p_amount_paid_minor_units <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Amount paid must be greater than zero.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Check idempotency
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_order
        FROM public.pos_orders
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_order.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'status', v_existing_order.status,
                'total_minor_units', v_existing_order.total_minor_units
            );
        END IF;
    END IF;

    -- Concurrency lock: serialize operations for this order
    PERFORM pg_advisory_xact_lock(
        hashtextextended('pos_order:' || p_order_id::text, 0)
    );

    SELECT * INTO v_order
    FROM public.pos_orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL OR v_order.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Order not found or cross-tenant access denied.';
    END IF;

    IF v_order.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Order is not open for checkout (current status: %).', v_order.status;
    END IF;

    IF p_amount_paid_minor_units < v_order.total_minor_units THEN
        RAISE EXCEPTION 'INSUFFICIENT_PAYMENT: Paid amount % is less than order total %.',
            p_amount_paid_minor_units, v_order.total_minor_units;
    END IF;

    -- Process each product line item: atomic stock decrement through canonical ledger
    FOR v_item IN
        SELECT * FROM public.pos_order_items
        WHERE order_id = v_order.id
          AND item_type = 'product'
        ORDER BY id
    LOOP
        -- Concurrency serialization for this branch and product
        PERFORM pg_advisory_xact_lock(
            hashtextextended(v_order.branch_id::text || ':' || v_item.product_id::text, 0)
        );

        SELECT * INTO v_balance
        FROM public.inventory_balances
        WHERE branch_id = v_order.branch_id
          AND product_id = v_item.product_id;

        IF v_balance.id IS NULL THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: No inventory record for product % at branch %.',
                v_item.product_id, v_order.branch_id;
        END IF;

        v_prev_stock := v_balance.on_hand_quantity;

        IF v_prev_stock < v_item.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product % has % on hand, but % requested in checkout.',
                v_item.item_name, v_prev_stock, v_item.quantity;
        END IF;

        v_new_stock := v_prev_stock - v_item.quantity;

        UPDATE public.inventory_balances
        SET on_hand_quantity = v_new_stock,
            last_movement_at = now(),
            updated_at = now()
        WHERE id = v_balance.id;

        -- Record canonical immutable sale movement
        INSERT INTO public.inventory_movements (
            tenant_id,
            branch_id,
            product_id,
            movement_type,
            quantity,
            previous_balance,
            new_balance,
            cost_minor_units,
            currency,
            reference_id,
            reason,
            actor_staff_id,
            idempotency_key,
            created_at
        ) VALUES (
            v_staff.tenant_id,
            v_order.branch_id,
            v_item.product_id,
            'sale',
            v_item.quantity,
            v_prev_stock,
            v_new_stock,
            0,
            v_order.currency,
            v_order.order_number,
            'pos_checkout',
            v_staff.id,
            COALESCE(v_clean_key || ':item:' || v_item.id::text, 'pos_sale:' || v_item.id::text),
            now()
        )
        RETURNING id INTO v_movement_id;

        UPDATE public.pos_order_items
        SET inventory_movement_id = v_movement_id
        WHERE id = v_item.id;

        v_products_decremented := v_products_decremented + 1;
    END LOOP;

    -- NODE 4 EARNINGS MATERIALIZATION: Commissions
    FOR v_item IN
        SELECT * FROM public.pos_order_items
        WHERE order_id = v_order.id
          AND performing_staff_id IS NOT NULL
        ORDER BY id
    LOOP
        SELECT * INTO v_comm_rule
        FROM public.staff_commission_rules
        WHERE tenant_id = v_order.tenant_id
          AND staff_id = v_item.performing_staff_id
          AND item_type = v_item.item_type
          AND active = true;

        IF v_comm_rule.id IS NOT NULL AND v_comm_rule.commission_basis_points > 0 THEN
            v_comm_base := GREATEST(
                (v_item.unit_price_minor_units * v_item.quantity) - COALESCE(v_item.discount_minor_units, 0),
                0
            );

            v_commission_amount := (v_comm_base::BIGINT * v_comm_rule.commission_basis_points) / 10000;

            IF v_commission_amount > 0 THEN
                INSERT INTO public.staff_earnings_ledger (
                    tenant_id,
                    staff_id,
                    order_id,
                    order_item_id,
                    earning_type,
                    source_amount_minor_units,
                    rate_basis_points,
                    earning_minor_units,
                    currency,
                    idempotency_key,
                    created_at
                ) VALUES (
                    v_order.tenant_id,
                    v_item.performing_staff_id,
                    v_order.id,
                    v_item.id,
                    'commission',
                    v_comm_base,
                    v_comm_rule.commission_basis_points,
                    v_commission_amount,
                    v_order.currency,
                    'commission:' || v_order.id::text || ':' || v_item.id::text,
                    now()
                )
                ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
            END IF;
        END IF;
    END LOOP;

    -- NODE 4 EARNINGS MATERIALIZATION: Tips
    FOR v_tip_alloc IN
        SELECT * FROM public.pos_tip_allocations
        WHERE order_id = v_order.id
        ORDER BY id
    LOOP
        INSERT INTO public.staff_earnings_ledger (
            tenant_id,
            staff_id,
            order_id,
            order_item_id,
            earning_type,
            source_amount_minor_units,
            rate_basis_points,
            earning_minor_units,
            currency,
            idempotency_key,
            created_at
        ) VALUES (
            v_order.tenant_id,
            v_tip_alloc.staff_id,
            v_order.id,
            NULL,
            'tip',
            v_tip_alloc.amount_minor_units,
            NULL,
            v_tip_alloc.amount_minor_units,
            v_order.currency,
            'tip:' || v_order.id::text || ':' || v_tip_alloc.staff_id::text,
            now()
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END LOOP;

    -- Record payment
    INSERT INTO public.pos_order_payments (
        order_id,
        tenant_id,
        payment_method,
        amount_minor_units,
        currency,
        reference_identifier,
        staff_id,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_staff.tenant_id,
        p_payment_method,
        p_amount_paid_minor_units,
        v_order.currency,
        nullif(trim(p_reference_identifier), ''),
        v_staff.id,
        'checkout_payment',
        now()
    )
    RETURNING id INTO v_payment_id;

    -- Transition order to completed
    UPDATE public.pos_orders
    SET status = 'completed',
        idempotency_key = v_clean_key,
        completed_at = now(),
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', 'completed',
        'total_minor_units', v_order.total_minor_units,
        'payment_id', v_payment_id,
        'products_decremented', v_products_decremented
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_checkout_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_checkout_order TO authenticated, service_role;


-- E. pos_get_staff_earnings: Read staff earnings breakdown (own staff or same-tenant tenant_owner only)
CREATE OR REPLACE FUNCTION public.pos_get_staff_earnings(
    p_staff_id UUID,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_target_staff RECORD;
    v_caller_staff RECORD;
    v_caller_owner RECORD;
    v_is_authorized BOOLEAN := false;
    v_commission_total INTEGER := 0;
    v_tip_total INTEGER := 0;
    v_total_earnings INTEGER := 0;
    v_currency VARCHAR(3);
    v_entries JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Resolve target staff
    SELECT * INTO v_target_staff
    FROM public.staff
    WHERE id = p_staff_id;

    IF v_target_staff.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Staff member not found.';
    END IF;

    -- Check if caller is the staff member themselves (active)
    SELECT * INTO v_caller_staff
    FROM public.staff
    WHERE user_profile_id = v_caller_uid
      AND id = p_staff_id
      AND tenant_id = v_target_staff.tenant_id
      AND active = true;

    IF v_caller_staff.id IS NOT NULL THEN
        v_is_authorized := true;
    END IF;

    -- If not self, check if caller is active tenant_owner in the same tenant
    IF NOT v_is_authorized THEN
        SELECT * INTO v_caller_owner
        FROM public.users_profile
        WHERE id = v_caller_uid
          AND tenant_id = v_target_staff.tenant_id
          AND role = 'tenant_owner'
          AND active = true;

        IF v_caller_owner.id IS NOT NULL THEN
            v_is_authorized := true;
        END IF;
    END IF;

    -- NO implicit super_admin authority
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller is not authorized to read earnings for target staff.';
    END IF;

    -- Aggregate totals
    SELECT
        COALESCE(SUM(CASE WHEN earning_type = 'commission' THEN earning_minor_units ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN earning_type = 'tip' THEN earning_minor_units ELSE 0 END), 0),
        COALESCE(SUM(earning_minor_units), 0),
        MAX(currency)
    INTO v_commission_total, v_tip_total, v_total_earnings, v_currency
    FROM public.staff_earnings_ledger
    WHERE tenant_id = v_target_staff.tenant_id
      AND staff_id = p_staff_id
      AND (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at <= p_to);

    -- Fetch entry rows
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', el.id,
            'earning_type', el.earning_type,
            'order_id', el.order_id,
            'order_item_id', el.order_item_id,
            'source_amount_minor_units', el.source_amount_minor_units,
            'rate_basis_points', el.rate_basis_points,
            'earning_minor_units', el.earning_minor_units,
            'currency', el.currency,
            'idempotency_key', el.idempotency_key,
            'created_at', el.created_at
        )
        ORDER BY el.created_at ASC
    ), '[]'::jsonb)
    INTO v_entries
    FROM public.staff_earnings_ledger el
    WHERE el.tenant_id = v_target_staff.tenant_id
      AND el.staff_id = p_staff_id
      AND (p_from IS NULL OR el.created_at >= p_from)
      AND (p_to IS NULL OR el.created_at <= p_to);

    RETURN jsonb_build_object(
        'success', true,
        'staff_id', p_staff_id,
        'tenant_id', v_target_staff.tenant_id,
        'currency', COALESCE(v_currency, 'TRY'),
        'commission_minor_units', v_commission_total,
        'tip_minor_units', v_tip_total,
        'total_earnings_minor_units', v_total_earnings,
        'entries', v_entries
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_get_staff_earnings FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_get_staff_earnings TO authenticated, service_role;
