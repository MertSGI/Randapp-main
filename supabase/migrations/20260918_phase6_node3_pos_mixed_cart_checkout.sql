-- =========================================================================
-- Ported from 72911e4: 20261002_phase6_node3_pos_mixed_cart_checkout.sql
-- Conflict-free sequential prefix: 20260918 (ADIM-034 / Faz D2)
-- Description: Phase 6 Node 3 — POS Mixed Cart, Multi-Branch Stock Allocation & Checkout Foundation
-- Target: Disposable PostgreSQL database / Supabase
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuses canonical public.tenants, public.branches, public.staff, public.customers,
--    public.appointments, public.services, public.products,
--    public.inventory_balances, public.inventory_movements.
--    Note: package_id is stored as UUID NULL; FK to service_package_definitions is deferred
--    until ADIM-035 (Faz D3) provisions service_package_definitions, and runtime package
--    resolution uses to_regclass('public.service_package_definitions') fail-closed guard.
-- 2. MIXED CART MODEL:
--    A single transaction can compose services, products/retail items, packages, and custom items.
--    Item types: 'service', 'product', 'package', 'custom'.
-- 3. CANONICAL MONEY & PRICING:
--    INTEGER minor units (unit_price_minor_units >= 0, discount_minor_units >= 0, line_total_minor_units >= 0).
--    ISO uppercase 3-char currency (CHECK currency ~ '^[A-Z]{3}$').
--    Schema truth: public.services.price is INTEGER major currency units -> converted via price * 100.
-- 4. INVENTORY INTEGRATION INVARIANT:
--    Checkout automatically registers 'sale' ledger movements in public.inventory_movements,
--    updates public.inventory_balances (on_hand_quantity) per branch,
--    and acquires pg_advisory_xact_lock(hashtextextended(branch_id || ':' || product_id, 0)).
-- 5. PAYMENT & ORDER LIFECYCLE:
--    Order statuses: 'open', 'completed', 'voided', 'refunded'.
--    Payment methods: 'cash', 'card_present', 'card_terminal_adapter', 'customer_wallet', 'external'.
--    Live terminal PSP / wallet ledger remains EXTERNAL_HOLD / deferred until Faz D3.
-- 6. IDEMPOTENT ATOMIC CHECKOUT:
--    Unique (tenant_id, idempotency_key) on orders prevents double-charging and duplicate stock decrement.
--    Lock acquired before idempotency evaluation; cross-order key reuse raises IDEMPOTENCY_CONFLICT.
-- 7. TRUST BOUNDARY:
--    Direct table DML revoked from PUBLIC, anon, and authenticated.
--    SELECT permitted to authenticated with RLS defense-in-depth.
--    Server-authoritative SECURITY DEFINER RPCs require active staff + active users_profile
--    with role IN ('tenant_owner', 'staff').
-- =========================================================================

-- =========================================================================
-- 1. TABLE: public.pos_orders (Point of Sale Order Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pos_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id               UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    order_number            TEXT NOT NULL CHECK (length(trim(order_number)) > 0),
    customer_id             UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    staff_id                UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    status                  TEXT NOT NULL DEFAULT 'open' CHECK (
        status IN ('open', 'completed', 'voided', 'refunded')
    ),
    currency                VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_minor_units    INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor_units >= 0),
    discount_minor_units    INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor_units >= 0),
    tax_minor_units         INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor_units >= 0),
    tip_minor_units         INTEGER NOT NULL DEFAULT 0 CHECK (tip_minor_units >= 0),
    total_minor_units       INTEGER NOT NULL DEFAULT 0 CHECK (total_minor_units >= 0),
    notes                   TEXT NULL,
    idempotency_key         TEXT NULL,
    completed_at            TIMESTAMPTZ NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_pos_orders_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_pos_orders_tenant_order_number UNIQUE (tenant_id, order_number),
    CONSTRAINT uq_pos_orders_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_tenant_branch ON public.pos_orders(tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_customer ON public.pos_orders(tenant_id, customer_id);

CREATE TRIGGER update_pos_orders_modtime
BEFORE UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 2. TABLE: public.pos_order_items (Mixed Cart Line Items)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pos_order_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL,
    tenant_id               UUID NOT NULL,
    item_type               TEXT NOT NULL CHECK (
        item_type IN ('service', 'product', 'package', 'custom')
    ),
    service_id              UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
    product_id              UUID NULL,
    package_id              UUID NULL,
    appointment_id          UUID NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
    item_name               TEXT NOT NULL CHECK (length(trim(item_name)) > 0),
    sku                     TEXT NULL,
    quantity                INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_minor_units  INTEGER NOT NULL CHECK (unit_price_minor_units >= 0),
    discount_minor_units    INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor_units >= 0),
    tax_rate_basis_points   INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points >= 0 AND tax_rate_basis_points <= 10000),
    tax_minor_units         INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor_units >= 0),
    line_total_minor_units  INTEGER NOT NULL CHECK (line_total_minor_units >= 0),
    performing_staff_id     UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    inventory_movement_id   UUID NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_pos_order_items_order FOREIGN KEY (order_id, tenant_id)
        REFERENCES public.pos_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_pos_order_items_product FOREIGN KEY (product_id, tenant_id)
        REFERENCES public.products(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT chk_pos_items_product_ref CHECK (
        (item_type = 'product' AND product_id IS NOT NULL) OR
        (item_type <> 'product')
    )
);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON public.pos_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_product ON public.pos_order_items(tenant_id, product_id);

ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 3. TABLE: public.pos_order_payments (Multi-Tender Payments)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pos_order_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL,
    tenant_id               UUID NOT NULL,
    payment_method          TEXT NOT NULL CHECK (
        payment_method IN ('cash', 'card_present', 'card_terminal_adapter', 'customer_wallet', 'external')
    ),
    amount_minor_units      INTEGER NOT NULL CHECK (amount_minor_units > 0),
    currency                VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    reference_identifier    TEXT NULL,
    staff_id                UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    notes                   TEXT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_pos_order_payments_order FOREIGN KEY (order_id, tenant_id)
        REFERENCES public.pos_orders(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pos_order_payments_order ON public.pos_order_payments(order_id);

ALTER TABLE public.pos_order_payments ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 4. HARDENED TRUST BOUNDARY: REVOKE DIRECT TABLE MUTATIONS
-- =========================================================================

REVOKE ALL ON TABLE public.pos_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_order_payments FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.pos_orders TO authenticated;
GRANT SELECT ON TABLE public.pos_order_items TO authenticated;
GRANT SELECT ON TABLE public.pos_order_payments TO authenticated;


-- =========================================================================
-- 5. RLS POLICIES FOR DEFENSE IN DEPTH
-- =========================================================================

DROP POLICY IF EXISTS "Authorized tenant staff can view pos orders" ON public.pos_orders;
CREATE POLICY "Authorized tenant staff can view pos orders"
ON public.pos_orders
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = pos_orders.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = pos_orders.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view pos order items" ON public.pos_order_items;
CREATE POLICY "Authorized tenant staff can view pos order items"
ON public.pos_order_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = pos_order_items.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = pos_order_items.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view pos order payments" ON public.pos_order_payments;
CREATE POLICY "Authorized tenant staff can view pos order payments"
ON public.pos_order_payments
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = pos_order_payments.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = pos_order_payments.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. pos_create_order: Create an open POS order / cart
CREATE OR REPLACE FUNCTION public.pos_create_order(
    p_branch_id UUID,
    p_currency TEXT,
    p_customer_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_branch RECORD;
    v_customer RECORD;
    v_order_id UUID;
    v_order_number TEXT;
    v_clean_currency TEXT := upper(trim(COALESCE(p_currency, '')));
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF v_clean_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Currency must be a 3-letter uppercase ISO code.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    JOIN public.users_profile up ON up.id = s.user_profile_id
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
      AND up.active = true
      AND up.tenant_id = s.tenant_id
      AND up.role IN ('tenant_owner', 'staff')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active authorized staff identity.';
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    IF v_branch.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'BRANCH_INACTIVE: Target branch is inactive.';
    END IF;

    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer
        FROM public.customers
        WHERE id = p_customer_id;

        IF v_customer.id IS NULL OR v_customer.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Customer not found or cross-tenant access denied.';
        END IF;
    END IF;

    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

    INSERT INTO public.pos_orders (
        tenant_id,
        branch_id,
        order_number,
        customer_id,
        staff_id,
        status,
        currency,
        subtotal_minor_units,
        discount_minor_units,
        tax_minor_units,
        tip_minor_units,
        total_minor_units,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        v_branch.id,
        v_order_number,
        p_customer_id,
        v_staff.id,
        'open',
        v_clean_currency,
        0, 0, 0, 0, 0,
        nullif(trim(p_notes), ''),
        now(),
        now()
    )
    RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'open',
        'currency', v_clean_currency
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_order TO authenticated, service_role;


-- B. pos_add_cart_item: Add line item (service, product, package, custom) to order
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
    v_perf_staff RECORD;
    v_apt RECORD;
    v_pkg_id UUID;
    v_pkg_tenant_id UUID;
    v_pkg_name TEXT;
    v_pkg_price INTEGER;
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
    v_order_total INTEGER;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Quantity must be greater than zero.';
    END IF;

    IF COALESCE(p_discount_minor_units, 0) < 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: discount_minor_units must be non-negative.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    JOIN public.users_profile up ON up.id = s.user_profile_id
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
      AND up.active = true
      AND up.tenant_id = s.tenant_id
      AND up.role IN ('tenant_owner', 'staff')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active authorized staff identity.';
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

    IF p_appointment_id IS NOT NULL THEN
        SELECT id, tenant_id INTO v_apt
        FROM public.appointments
        WHERE id = p_appointment_id;

        IF v_apt.id IS NULL OR v_apt.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Appointment not found or cross-tenant access denied.';
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

        IF v_service.active IS NOT TRUE THEN
            RAISE EXCEPTION 'SERVICE_INACTIVE: Cannot sell an inactive service.';
        END IF;

        v_item_name := v_service.name;
        -- public.services.price stores integer major currency units; convert to integer minor units
        v_unit_price := COALESCE(v_service.price, 0) * 100;

    ELSIF p_item_type = 'package' THEN
        IF p_package_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: package_id is required for package line items.';
        END IF;

        IF to_regclass('public.service_package_definitions') IS NULL THEN
            RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE: Service package definitions catalog is not yet provisioned.';
        END IF;

        EXECUTE 'SELECT id, tenant_id, name, price_minor_units FROM public.service_package_definitions WHERE id = $1'
            INTO v_pkg_id, v_pkg_tenant_id, v_pkg_name, v_pkg_price
            USING p_package_id;

        IF v_pkg_id IS NULL OR v_pkg_tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Package not found or cross-tenant access denied.';
        END IF;

        v_item_name := v_pkg_name;
        v_unit_price := COALESCE(v_pkg_price, 0);

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

    SELECT
        COALESCE(sum(unit_price_minor_units * quantity), 0),
        COALESCE(sum(tax_minor_units), 0),
        COALESCE(sum(discount_minor_units), 0),
        COALESCE(sum(line_total_minor_units), 0)
    INTO v_subtotal, v_total_tax, v_total_discount, v_order_total
    FROM public.pos_order_items
    WHERE order_id = v_order.id;

    UPDATE public.pos_orders
    SET subtotal_minor_units = v_subtotal,
        tax_minor_units = v_total_tax,
        discount_minor_units = v_total_discount,
        total_minor_units = v_order_total + COALESCE(tip_minor_units, 0),
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'item_id', v_item_id,
        'item_name', v_item_name,
        'quantity', p_quantity,
        'line_total_minor_units', v_line_total,
        'order_total_minor_units', v_order_total + COALESCE(v_order.tip_minor_units, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_add_cart_item FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_add_cart_item TO authenticated, service_role;


-- C. pos_checkout_order: Atomic checkout, payment registration, and serialized stock decrement
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
    v_balance RECORD;
    v_prev_stock INTEGER;
    v_new_stock INTEGER;
    v_prod_cost INTEGER;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_order RECORD;
    v_movement_id UUID;
    v_payment_id UUID;
    v_products_decremented INTEGER := 0;
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
    JOIN public.users_profile up ON up.id = s.user_profile_id
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
      AND up.active = true
      AND up.tenant_id = s.tenant_id
      AND up.role IN ('tenant_owner', 'staff')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active authorized staff identity.';
    END IF;

    -- Concurrency lock: serialize operations for this order
    PERFORM pg_advisory_xact_lock(
        hashtextextended('pos_order:' || p_order_id::text, 0)
    );

    -- Check idempotency under lock
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_order
        FROM public.pos_orders
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_order.id IS NOT NULL THEN
            IF v_existing_order.id <> p_order_id THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Idempotency key already used for a different POS order.';
            END IF;

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

    SELECT * INTO v_order
    FROM public.pos_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL OR v_order.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Order not found or cross-tenant access denied.';
    END IF;

    IF v_order.status <> 'open' THEN
        RAISE EXCEPTION 'INVALID_STATE: Order is not open for checkout (current status: %).', v_order.status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pos_order_items WHERE order_id = v_order.id) THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot checkout an order with zero line items.';
    END IF;

    IF p_amount_paid_minor_units < v_order.total_minor_units THEN
        RAISE EXCEPTION 'INSUFFICIENT_PAYMENT: Paid amount % is less than order total %.',
            p_amount_paid_minor_units, v_order.total_minor_units;
    END IF;

    FOR v_item IN
        SELECT * FROM public.pos_order_items
        WHERE order_id = v_order.id
          AND item_type = 'product'
        ORDER BY id
    LOOP
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

        SELECT COALESCE(cost_minor_units, 0) INTO v_prod_cost
        FROM public.products
        WHERE id = v_item.product_id;

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
            COALESCE(v_prod_cost, 0),
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


-- D. pos_get_order: Server-authoritative order retrieval with line items and payments
CREATE OR REPLACE FUNCTION public.pos_get_order(
    p_order_id UUID
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
    v_items JSONB;
    v_payments JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    SELECT s.* INTO v_staff
    FROM public.staff s
    JOIN public.users_profile up ON up.id = s.user_profile_id
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
      AND up.active = true
      AND up.tenant_id = s.tenant_id
      AND up.role IN ('tenant_owner', 'staff')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active authorized staff identity.';
    END IF;

    SELECT * INTO v_order
    FROM public.pos_orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL OR v_order.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Order not found or cross-tenant access denied.';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'item_id', poi.id,
            'item_type', poi.item_type,
            'item_name', poi.item_name,
            'sku', poi.sku,
            'quantity', poi.quantity,
            'unit_price_minor_units', poi.unit_price_minor_units,
            'discount_minor_units', poi.discount_minor_units,
            'tax_minor_units', poi.tax_minor_units,
            'line_total_minor_units', poi.line_total_minor_units,
            'performing_staff_id', poi.performing_staff_id,
            'inventory_movement_id', poi.inventory_movement_id
        )
        ORDER BY poi.created_at ASC
    ), '[]'::jsonb)
    INTO v_items
    FROM public.pos_order_items poi
    WHERE poi.order_id = v_order.id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'payment_id', pop.id,
            'payment_method', pop.payment_method,
            'amount_minor_units', pop.amount_minor_units,
            'currency', pop.currency,
            'reference_identifier', pop.reference_identifier,
            'created_at', pop.created_at
        )
        ORDER BY pop.created_at ASC
    ), '[]'::jsonb)
    INTO v_payments
    FROM public.pos_order_payments pop
    WHERE pop.order_id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', v_order.status,
        'currency', v_order.currency,
        'subtotal_minor_units', v_order.subtotal_minor_units,
        'discount_minor_units', v_order.discount_minor_units,
        'tax_minor_units', v_order.tax_minor_units,
        'tip_minor_units', v_order.tip_minor_units,
        'total_minor_units', v_order.total_minor_units,
        'items', v_items,
        'payments', v_payments,
        'created_at', v_order.created_at,
        'completed_at', v_order.completed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_get_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_get_order TO authenticated, service_role;
