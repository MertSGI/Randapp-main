-- =========================================================================
-- Ported from 72911e4: 20261001_phase6_node2_suppliers_po_receiving.sql
-- Conflict-free sequential prefix: 20260917 (ADIM-034 / Faz D2)
-- Description: Phase 6 Node 2 — Suppliers, Purchase Orders & Receiving Foundation
-- Target: Disposable PostgreSQL database / Supabase
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuses canonical public.tenants, public.branches, public.staff,
--    public.products, public.inventory_balances, public.inventory_movements,
--    public.users_profile, public.audit_events.
-- 2. CANONICAL MONEY & QUANTITY MODEL:
--    INTEGER minor units (unit_cost_minor_units >= 0, total_cost_minor_units >= 0).
--    ISO uppercase 3-char currency (CHECK currency ~ '^[A-Z]{3}$').
--    INTEGER quantities (quantity_ordered > 0, quantity_received >= 0).
--    Invariant: quantity_received <= quantity_ordered on line items.
-- 3. INVENTORY INTEGRATION INVARIANT:
--    Receiving appends 'receipt' movement to public.inventory_movements,
--    updates public.inventory_balances (on_hand_quantity),
--    and serializes per (branch_id, product_id) via pg_advisory_xact_lock.
-- 4. PURCHASE ORDER STATE MACHINE:
--    'draft' -> 'approved' -> 'partially_received' -> 'received'
--    'draft' | 'approved' -> 'cancelled'
--    No receiving allowed on 'draft', 'cancelled', or 'received' purchase orders.
-- 5. CONCURRENCY-SAFE ATOMIC RECEIVING:
--    Serialized per purchase order via pg_advisory_xact_lock(hashtextextended('po_receive:' || po_id, 0)).
--    Prevents concurrent over-receipt past ordered quantities.
-- 6. IDEMPOTENT RECEIVING:
--    Unique (tenant_id, idempotency_key, po_item_id) on receiving events prevents duplicate ingestion,
--    and rejects cross-PO reuse of an existing idempotency key with IDEMPOTENCY_CONFLICT.
-- 7. TRUST BOUNDARY:
--    Direct table DML revoked from PUBLIC, anon, and authenticated.
--    SELECT permitted to authenticated with RLS defense-in-depth.
--    Server-authoritative SECURITY DEFINER RPCs require active staff + active users_profile
--    with role IN ('tenant_owner', 'staff').
-- =========================================================================

-- =========================================================================
-- 1. TABLE: public.suppliers (Supplier / Vendor Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL CHECK (length(trim(name)) > 0),
    contact_person      TEXT NULL,
    email               TEXT NULL,
    phone               TEXT NULL,
    tax_identifier      TEXT NULL,
    address             TEXT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_suppliers_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_suppliers_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_active ON public.suppliers(tenant_id, is_active);

CREATE TRIGGER update_suppliers_modtime
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 2. TABLE: public.purchase_orders (Purchase Order Header Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    po_number           TEXT NOT NULL CHECK (length(trim(po_number)) > 0),
    supplier_id         UUID NOT NULL,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')
    ),
    currency            VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    total_amount_minor_units INTEGER NOT NULL DEFAULT 0 CHECK (total_amount_minor_units >= 0),
    notes               TEXT NULL,
    created_by_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    approved_by_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ NULL,
    cancelled_by_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    cancelled_at        TIMESTAMPTZ NULL,
    cancellation_reason TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_purchase_orders_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_purchase_orders_tenant_po_number UNIQUE (tenant_id, po_number),
    CONSTRAINT fk_purchase_orders_supplier_tenant FOREIGN KEY (supplier_id, tenant_id)
        REFERENCES public.suppliers(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status ON public.purchase_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON public.purchase_orders(tenant_id, destination_branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(tenant_id, supplier_id);

CREATE TRIGGER update_purchase_orders_modtime
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 3. TABLE: public.purchase_order_items (Purchase Order Line Item Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    purchase_order_id   UUID NOT NULL,
    product_id          UUID NOT NULL,
    quantity_ordered    INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost_minor_units INTEGER NOT NULL CHECK (unit_cost_minor_units >= 0),
    total_cost_minor_units INTEGER NOT NULL CHECK (total_cost_minor_units >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_po_items_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_po_items_po_product UNIQUE (purchase_order_id, product_id),
    CONSTRAINT fk_po_items_po_tenant FOREIGN KEY (purchase_order_id, tenant_id)
        REFERENCES public.purchase_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_product_tenant FOREIGN KEY (product_id, tenant_id)
        REFERENCES public.products(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT chk_po_items_received_bound CHECK (quantity_received <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS idx_po_items_lookup ON public.purchase_order_items(tenant_id, purchase_order_id, product_id);

CREATE TRIGGER update_purchase_order_items_modtime
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 4. TABLE: public.purchase_order_receiving_events (Audit & Idempotency)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.purchase_order_receiving_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    purchase_order_id   UUID NOT NULL,
    po_item_id          UUID NOT NULL,
    product_id          UUID NOT NULL,
    branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    quantity_received   INTEGER NOT NULL CHECK (quantity_received > 0),
    inventory_movement_id UUID NOT NULL,
    receiver_staff_id   UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    idempotency_key     TEXT NULL,
    notes               TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_pore_po_tenant FOREIGN KEY (purchase_order_id, tenant_id)
        REFERENCES public.purchase_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_pore_item_tenant FOREIGN KEY (po_item_id, tenant_id)
        REFERENCES public.purchase_order_items(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_pore_product_tenant FOREIGN KEY (product_id, tenant_id)
        REFERENCES public.products(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT uq_pore_tenant_item_idempotency UNIQUE (tenant_id, idempotency_key, po_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pore_po ON public.purchase_order_receiving_events(tenant_id, purchase_order_id);

ALTER TABLE public.purchase_order_receiving_events ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 5. HARDENED TRUST BOUNDARY: REVOKE DIRECT MUTATIONS, GRANT SELECT TO AUTH
-- =========================================================================

REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_order_receiving_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.suppliers TO authenticated;
GRANT SELECT ON TABLE public.purchase_orders TO authenticated;
GRANT SELECT ON TABLE public.purchase_order_items TO authenticated;
GRANT SELECT ON TABLE public.purchase_order_receiving_events TO authenticated;


-- =========================================================================
-- 6. RLS POLICIES FOR DEFENSE IN DEPTH
-- =========================================================================

DROP POLICY IF EXISTS "Authorized tenant staff can view suppliers" ON public.suppliers;
CREATE POLICY "Authorized tenant staff can view suppliers"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = suppliers.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = suppliers.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Authorized tenant staff can view purchase orders"
ON public.purchase_orders
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = purchase_orders.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = purchase_orders.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view purchase order items" ON public.purchase_order_items;
CREATE POLICY "Authorized tenant staff can view purchase order items"
ON public.purchase_order_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = purchase_order_items.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = purchase_order_items.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view po receiving events" ON public.purchase_order_receiving_events;
CREATE POLICY "Authorized tenant staff can view po receiving events"
ON public.purchase_order_receiving_events
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        JOIN public.users_profile up ON up.id = s.user_profile_id
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = purchase_order_receiving_events.tenant_id
          AND s.active = true
          AND up.tenant_id = s.tenant_id
          AND up.active = true
          AND up.role IN ('tenant_owner', 'staff')
    )
    OR EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.tenant_id = purchase_order_receiving_events.tenant_id
          AND up.role = 'tenant_owner'
          AND up.active = true
    )
);


-- =========================================================================
-- 7. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. pos_create_supplier: Register a new supplier in the tenant
CREATE OR REPLACE FUNCTION public.pos_create_supplier(
    p_name TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_tax_identifier TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_clean_name TEXT;
    v_new_supplier RECORD;
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

    v_clean_name := trim(COALESCE(p_name, ''));

    IF length(v_clean_name) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Supplier name cannot be empty.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.suppliers
        WHERE tenant_id = v_staff.tenant_id
          AND lower(trim(name)) = lower(v_clean_name)
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_SUPPLIER: Supplier with name % already exists.', v_clean_name;
    END IF;

    INSERT INTO public.suppliers (
        tenant_id,
        name,
        contact_person,
        email,
        phone,
        tax_identifier,
        address,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        v_clean_name,
        nullif(trim(p_contact_person), ''),
        nullif(trim(p_email), ''),
        nullif(trim(p_phone), ''),
        nullif(trim(p_tax_identifier), ''),
        nullif(trim(p_address), ''),
        COALESCE(p_is_active, true),
        now(),
        now()
    )
    RETURNING * INTO v_new_supplier;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'supplier_created',
        'suppliers',
        v_new_supplier.id::text,
        jsonb_build_object(
            'supplier_id', v_new_supplier.id,
            'name', v_new_supplier.name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'supplier_id', v_new_supplier.id,
        'tenant_id', v_new_supplier.tenant_id,
        'name', v_new_supplier.name,
        'is_active', v_new_supplier.is_active
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_supplier FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_supplier TO authenticated, service_role;


-- B. pos_create_purchase_order: Create a PO in draft status with line items
CREATE OR REPLACE FUNCTION public.pos_create_purchase_order(
    p_supplier_id UUID,
    p_destination_branch_id UUID,
    p_currency TEXT,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_po_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_supplier RECORD;
    v_branch RECORD;
    v_norm_currency VARCHAR(3);
    v_po_number TEXT;
    v_po_id UUID;
    v_total_amount INTEGER := 0;
    v_item RECORD;
    v_product RECORD;
    v_item_count INTEGER := 0;
    v_line_total INTEGER := 0;
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

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Purchase order must contain at least one line item.';
    END IF;

    v_norm_currency := upper(trim(COALESCE(p_currency, '')));
    IF v_norm_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid ISO 3-character currency.';
    END IF;

    SELECT * INTO v_supplier
    FROM public.suppliers
    WHERE id = p_supplier_id;

    IF v_supplier.id IS NULL OR v_supplier.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Supplier not found or cross-tenant access denied.';
    END IF;

    IF v_supplier.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'SUPPLIER_INACTIVE: Cannot create purchase order for an inactive supplier.';
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_destination_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    IF v_branch.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'BRANCH_INACTIVE: Destination branch is inactive.';
    END IF;

    IF p_po_number IS NOT NULL AND length(trim(p_po_number)) > 0 THEN
        v_po_number := upper(trim(p_po_number));
    ELSE
        v_po_number := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 6));
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE tenant_id = v_staff.tenant_id
          AND po_number = v_po_number
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_PO_NUMBER: Purchase order number % already exists.', v_po_number;
    END IF;

    INSERT INTO public.purchase_orders (
        tenant_id,
        po_number,
        supplier_id,
        destination_branch_id,
        status,
        currency,
        total_amount_minor_units,
        notes,
        created_by_staff_id,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        v_po_number,
        v_supplier.id,
        v_branch.id,
        'draft',
        v_norm_currency,
        0,
        nullif(trim(p_notes), ''),
        v_staff.id,
        now(),
        now()
    )
    RETURNING id INTO v_po_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
        product_id UUID,
        quantity INTEGER,
        unit_cost_minor_units INTEGER
    ) LOOP
        v_item_count := v_item_count + 1;

        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: Line item % missing product_id.', v_item_count;
        END IF;

        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT: Quantity for line item % must be positive.', v_item_count;
        END IF;

        IF v_item.unit_cost_minor_units IS NULL OR v_item.unit_cost_minor_units < 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT: Unit cost for line item % must be non-negative.', v_item_count;
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id;

        IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product for line item % does not belong to tenant.', v_item_count;
        END IF;

        IF v_product.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'PRODUCT_INACTIVE: Product % is inactive.', v_product.sku;
        END IF;

        v_line_total := v_item.quantity * v_item.unit_cost_minor_units;
        v_total_amount := v_total_amount + v_line_total;

        INSERT INTO public.purchase_order_items (
            tenant_id,
            purchase_order_id,
            product_id,
            quantity_ordered,
            quantity_received,
            unit_cost_minor_units,
            total_cost_minor_units,
            created_at,
            updated_at
        ) VALUES (
            v_staff.tenant_id,
            v_po_id,
            v_product.id,
            v_item.quantity,
            0,
            v_item.unit_cost_minor_units,
            v_line_total,
            now(),
            now()
        );
    END LOOP;

    UPDATE public.purchase_orders
    SET total_amount_minor_units = v_total_amount,
        updated_at = now()
    WHERE id = v_po_id;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'purchase_order_created',
        'purchase_orders',
        v_po_id::text,
        jsonb_build_object(
            'po_id', v_po_id,
            'po_number', v_po_number,
            'supplier_id', v_supplier.id,
            'destination_branch_id', v_branch.id,
            'item_count', v_item_count,
            'total_amount_minor_units', v_total_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'purchase_order_id', v_po_id,
        'po_number', v_po_number,
        'status', 'draft',
        'supplier_id', v_supplier.id,
        'destination_branch_id', v_branch.id,
        'currency', v_norm_currency,
        'total_amount_minor_units', v_total_amount,
        'item_count', v_item_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_purchase_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_purchase_order TO authenticated, service_role;


-- C. pos_approve_purchase_order: Move PO from 'draft' to 'approved'
CREATE OR REPLACE FUNCTION public.pos_approve_purchase_order(
    p_purchase_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_po RECORD;
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

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id
    FOR UPDATE;

    IF v_po.id IS NULL OR v_po.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Purchase order not found or cross-tenant access denied.';
    END IF;

    IF v_po.status <> 'draft' THEN
        RAISE EXCEPTION 'INVALID_STATE: Only draft purchase orders can be approved (current status: %).', v_po.status;
    END IF;

    UPDATE public.purchase_orders
    SET status = 'approved',
        approved_by_staff_id = v_staff.id,
        approved_at = now(),
        updated_at = now()
    WHERE id = v_po.id;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'purchase_order_approved',
        'purchase_orders',
        v_po.id::text,
        jsonb_build_object(
            'po_id', v_po.id,
            'approved_by', v_staff.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'purchase_order_id', v_po.id,
        'status', 'approved'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_approve_purchase_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_approve_purchase_order TO authenticated, service_role;


-- D. pos_cancel_purchase_order: Cancel a PO (only allowed if no items received)
CREATE OR REPLACE FUNCTION public.pos_cancel_purchase_order(
    p_purchase_order_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_po RECORD;
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

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id
    FOR UPDATE;

    IF v_po.id IS NULL OR v_po.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Purchase order not found or cross-tenant access denied.';
    END IF;

    IF v_po.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVALID_STATE: Purchase order is already cancelled.';
    END IF;

    IF v_po.status IN ('partially_received', 'received') THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot cancel purchase order with received goods (status: %).', v_po.status;
    END IF;

    UPDATE public.purchase_orders
    SET status = 'cancelled',
        cancelled_by_staff_id = v_staff.id,
        cancelled_at = now(),
        cancellation_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    WHERE id = v_po.id;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'purchase_order_cancelled',
        'purchase_orders',
        v_po.id::text,
        jsonb_build_object(
            'po_id', v_po.id,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'purchase_order_id', v_po.id,
        'status', 'cancelled'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_cancel_purchase_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_purchase_order TO authenticated, service_role;


-- E. pos_receive_purchase_order_items: Atomic, concurrency-safe receiving
CREATE OR REPLACE FUNCTION public.pos_receive_purchase_order_items(
    p_purchase_order_id UUID,
    p_receipts JSONB,
    p_idempotency_key TEXT DEFAULT NULL,
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
    v_po RECORD;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_event RECORD;
    v_incoming_canonical JSONB;
    v_existing_canonical JSONB;
    v_receipt RECORD;
    v_item RECORD;
    v_product RECORD;
    v_branch RECORD;
    v_new_item_received INTEGER;
    v_movement_id UUID;
    v_prev_stock INTEGER := 0;
    v_new_stock INTEGER := 0;
    v_balance RECORD;
    v_all_received BOOLEAN := true;
    v_any_received BOOLEAN := false;
    v_items_processed INTEGER := 0;
    v_total_units_received INTEGER := 0;
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

    IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Receiving payload must contain at least one item receipt.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_receipts) AS r(po_item_id UUID, quantity_received INTEGER)
        WHERE r.po_item_id IS NULL OR r.quantity_received IS NULL OR r.quantity_received <= 0
    ) THEN
        RAISE EXCEPTION 'INVALID_INPUT: Each receipt item must include a valid po_item_id and positive quantity_received.';
    END IF;

    -- Concurrency lock: serialize PO receiving operations via transaction advisory lock
    PERFORM pg_advisory_xact_lock(
        hashtextextended('po_receive:' || p_purchase_order_id::text, 0)
    );

    -- Check idempotency under lock
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_event
        FROM public.purchase_order_receiving_events
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key
        LIMIT 1;

        IF v_existing_event.id IS NOT NULL THEN
            IF v_existing_event.purchase_order_id <> p_purchase_order_id THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Receiving idempotency key already used for a different purchase order.';
            END IF;

            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'po_item_id', r.po_item_id,
                        'quantity_received', r.quantity_received
                    )
                    ORDER BY r.po_item_id ASC, r.quantity_received ASC
                ),
                '[]'::jsonb
            )
            INTO v_incoming_canonical
            FROM jsonb_to_recordset(p_receipts) AS r(po_item_id UUID, quantity_received INTEGER);

            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'po_item_id', e.po_item_id,
                        'quantity_received', e.quantity_received
                    )
                    ORDER BY e.po_item_id ASC, e.quantity_received ASC
                ),
                '[]'::jsonb
            )
            INTO v_existing_canonical
            FROM public.purchase_order_receiving_events e
            WHERE e.tenant_id = v_staff.tenant_id
              AND e.idempotency_key = v_clean_key;

            IF v_incoming_canonical IS DISTINCT FROM v_existing_canonical THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Receiving idempotency key already used for a different receiving payload.';
            END IF;

            SELECT status INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'purchase_order_id', p_purchase_order_id,
                'status', v_po.status,
                'message', 'Receipt operation already recorded with idempotency key.'
            );
        END IF;
    END IF;

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id
    FOR UPDATE;

    IF v_po.id IS NULL OR v_po.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Purchase order not found or cross-tenant access denied.';
    END IF;

    IF v_po.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot receive items on a cancelled purchase order.';
    END IF;

    IF v_po.status = 'draft' THEN
        RAISE EXCEPTION 'INVALID_STATE: Purchase order must be approved before receiving items.';
    END IF;

    IF v_po.status = 'received' THEN
        RAISE EXCEPTION 'INVALID_STATE: Purchase order is already fully received.';
    END IF;

    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = v_po.destination_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Destination branch cross-tenant violation.';
    END IF;

    IF v_branch.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'BRANCH_INACTIVE: Destination branch is inactive.';
    END IF;

    FOR v_receipt IN SELECT * FROM jsonb_to_recordset(p_receipts) AS (
        po_item_id UUID,
        quantity_received INTEGER
    ) LOOP
        v_items_processed := v_items_processed + 1;

        IF v_receipt.po_item_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: Missing po_item_id in receipt item %.', v_items_processed;
        END IF;

        IF v_receipt.quantity_received IS NULL OR v_receipt.quantity_received <= 0 THEN
            RAISE EXCEPTION 'INVALID_INPUT: Received quantity must be greater than zero in item %.', v_items_processed;
        END IF;

        SELECT * INTO v_item
        FROM public.purchase_order_items
        WHERE id = v_receipt.po_item_id
          AND purchase_order_id = v_po.id
          AND tenant_id = v_staff.tenant_id
        FOR UPDATE;

        IF v_item.id IS NULL THEN
            RAISE EXCEPTION 'INVALID_INPUT: Purchase order line item % not found on this PO.', v_receipt.po_item_id;
        END IF;

        v_new_item_received := v_item.quantity_received + v_receipt.quantity_received;
        IF v_new_item_received > v_item.quantity_ordered THEN
            RAISE EXCEPTION 'OVER_RECEIPT: Receiving % exceeds remaining ordered quantity (ordered: %, already received: %, remaining: %).',
                v_receipt.quantity_received,
                v_item.quantity_ordered,
                v_item.quantity_received,
                (v_item.quantity_ordered - v_item.quantity_received);
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_item.product_id;

        IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product cross-tenant violation.';
        END IF;

        PERFORM pg_advisory_xact_lock(
            hashtextextended(v_branch.id::text || ':' || v_product.id::text, 0)
        );

        SELECT * INTO v_balance
        FROM public.inventory_balances
        WHERE branch_id = v_branch.id
          AND product_id = v_product.id;

        IF v_balance.id IS NULL THEN
            v_prev_stock := 0;
            v_new_stock := v_receipt.quantity_received;
            INSERT INTO public.inventory_balances (
                tenant_id,
                branch_id,
                product_id,
                on_hand_quantity,
                allocated_quantity,
                last_movement_at,
                created_at,
                updated_at
            ) VALUES (
                v_staff.tenant_id,
                v_branch.id,
                v_product.id,
                v_new_stock,
                0,
                now(),
                now(),
                now()
            );
        ELSE
            v_prev_stock := v_balance.on_hand_quantity;
            v_new_stock := v_prev_stock + v_receipt.quantity_received;
            UPDATE public.inventory_balances
            SET on_hand_quantity = v_new_stock,
                last_movement_at = now(),
                updated_at = now()
            WHERE id = v_balance.id;
        END IF;

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
            v_branch.id,
            v_product.id,
            'receipt',
            v_receipt.quantity_received,
            v_prev_stock,
            v_new_stock,
            v_item.unit_cost_minor_units,
            v_po.currency,
            v_po.po_number,
            'purchase_order_receipt',
            v_staff.id,
            CASE WHEN v_clean_key IS NOT NULL THEN v_clean_key || ':' || v_item.id::text ELSE NULL END,
            now()
        )
        RETURNING id INTO v_movement_id;

        UPDATE public.purchase_order_items
        SET quantity_received = v_new_item_received,
            updated_at = now()
        WHERE id = v_item.id;

        INSERT INTO public.purchase_order_receiving_events (
            tenant_id,
            purchase_order_id,
            po_item_id,
            product_id,
            branch_id,
            quantity_received,
            inventory_movement_id,
            receiver_staff_id,
            idempotency_key,
            notes,
            created_at
        ) VALUES (
            v_staff.tenant_id,
            v_po.id,
            v_item.id,
            v_product.id,
            v_branch.id,
            v_receipt.quantity_received,
            v_movement_id,
            v_staff.id,
            v_clean_key,
            nullif(trim(p_notes), ''),
            now()
        );

        v_total_units_received := v_total_units_received + v_receipt.quantity_received;
    END LOOP;

    SELECT
        bool_and(quantity_received = quantity_ordered),
        bool_or(quantity_received > 0)
    INTO v_all_received, v_any_received
    FROM public.purchase_order_items
    WHERE purchase_order_id = v_po.id;

    IF v_all_received THEN
        UPDATE public.purchase_orders
        SET status = 'received',
            updated_at = now()
        WHERE id = v_po.id;
    ELSIF v_any_received THEN
        UPDATE public.purchase_orders
        SET status = 'partially_received',
            updated_at = now()
        WHERE id = v_po.id;
    END IF;

    INSERT INTO public.audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        payload
    ) VALUES (
        v_staff.tenant_id::text,
        v_caller_uid::text,
        'staff',
        'purchase_order_received',
        'purchase_orders',
        v_po.id::text,
        jsonb_build_object(
            'po_id', v_po.id,
            'po_number', v_po.po_number,
            'total_units_received', v_total_units_received,
            'status', CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'purchase_order_id', v_po.id,
        'po_number', v_po.po_number,
        'status', CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END,
        'total_units_received', v_total_units_received,
        'items_processed', v_items_processed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_receive_purchase_order_items FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_receive_purchase_order_items TO authenticated, service_role;


-- F. pos_get_purchase_order: Retrieve PO details with line items and receiving
CREATE OR REPLACE FUNCTION public.pos_get_purchase_order(
    p_purchase_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_staff RECORD;
    v_po RECORD;
    v_supplier RECORD;
    v_branch RECORD;
    v_items JSONB;
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

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id;

    IF v_po.id IS NULL OR v_po.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Purchase order not found or cross-tenant access denied.';
    END IF;

    SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_po.supplier_id;
    SELECT * INTO v_branch FROM public.branches WHERE id = v_po.destination_branch_id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'item_id', poi.id,
            'product_id', poi.product_id,
            'product_name', p.name,
            'sku', p.sku,
            'quantity_ordered', poi.quantity_ordered,
            'quantity_received', poi.quantity_received,
            'remaining_quantity', (poi.quantity_ordered - poi.quantity_received),
            'unit_cost_minor_units', poi.unit_cost_minor_units,
            'total_cost_minor_units', poi.total_cost_minor_units
        )
        ORDER BY p.name ASC
    ), '[]'::jsonb)
    INTO v_items
    FROM public.purchase_order_items poi
    JOIN public.products p ON p.id = poi.product_id
    WHERE poi.purchase_order_id = v_po.id;

    RETURN jsonb_build_object(
        'success', true,
        'purchase_order_id', v_po.id,
        'po_number', v_po.po_number,
        'status', v_po.status,
        'supplier', jsonb_build_object(
            'id', v_supplier.id,
            'name', v_supplier.name
        ),
        'destination_branch', jsonb_build_object(
            'id', v_branch.id,
            'name', v_branch.name
        ),
        'currency', v_po.currency,
        'total_amount_minor_units', v_po.total_amount_minor_units,
        'notes', v_po.notes,
        'items', v_items,
        'created_at', v_po.created_at,
        'updated_at', v_po.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_get_purchase_order FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_get_purchase_order TO authenticated, service_role;
