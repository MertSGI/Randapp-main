-- =========================================================================
-- MIGRATION 20260930_phase6_product_inventory_foundation.sql
-- Description: Phase 6 Node 1 — Product Catalog & Ledger-Safe Branch Inventory Foundation
-- Target: Disposable PostgreSQL database / Supabase
-- Canonical Migration Number: 89
-- Authority: LARI-PHASE5-RETENTION-VISUAL-CLOSEOUT-PHASE6-FOUNDATION-20260914-01
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuses canonical public.tenants, public.branches, public.staff,
--    public.users_profile, public.audit_events.
-- 2. CANONICAL MONEY MODEL:
--    INTEGER minor units (price_minor_units >= 0, cost_minor_units >= 0).
--    ISO uppercase 3-char currency (CHECK currency ~ '^[A-Z]{3}$').
-- 3. LEDGER-SAFE APPEND-ONLY STOCK MOVEMENTS:
--    Inventory source of truth is public.inventory_movements (immutable append-only).
--    public.inventory_balances caches current stock atomically via triggers.
--    Compensating movements for adjustments and refunds (no historical mutation).
-- 4. CONCURRENCY-SAFE ATOMIC DECREMENTS:
--    Serialized per (branch_id, product_id) via pg_advisory_xact_lock.
--    Enforces available stock >= decrement quantity (fails closed on insufficient stock).
-- 5. IDEMPOTENT MUTATIONS:
--    Unique (tenant_id, idempotency_key) on stock operations prevents double consumption.
-- 6. TRUST BOUNDARY:
--    Direct table DML revoked from PUBLIC, anon, and authenticated.
--    Server-authoritative SECURITY DEFINER RPCs enforce caller active staff / owner authority.
-- =========================================================================

-- =========================================================================
-- 1. TABLE: public.products (Product Catalog Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sku                 TEXT NOT NULL CHECK (length(trim(sku)) > 0),
    barcode             TEXT NULL,
    description         TEXT NULL,
    category            TEXT NOT NULL DEFAULT 'general' CHECK (length(trim(category)) > 0),
    brand               TEXT NULL,
    unit_of_measure     TEXT NOT NULL DEFAULT 'piece' CHECK (length(trim(unit_of_measure)) > 0),
    price_minor_units   INTEGER NOT NULL CHECK (price_minor_units >= 0),
    cost_minor_units    INTEGER NOT NULL DEFAULT 0 CHECK (cost_minor_units >= 0),
    currency            VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    tax_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points >= 0 AND tax_rate_basis_points <= 10000),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_retail           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_products_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON public.products(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON public.products(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(tenant_id, barcode) WHERE barcode IS NOT NULL;

CREATE TRIGGER update_products_modtime
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 2. TABLE: public.inventory_balances (Branch Inventory Projection)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.inventory_balances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL,
    on_hand_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
    allocated_quantity INTEGER NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
    reorder_point       INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    reorder_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0),
    last_movement_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT uq_inventory_balances_branch_product UNIQUE (branch_id, product_id),
    CONSTRAINT fk_inventory_balances_product_tenant FOREIGN KEY (product_id, tenant_id)
        REFERENCES public.products(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT chk_inventory_balances_allocated CHECK (allocated_quantity <= on_hand_quantity)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_lookup ON public.inventory_balances(tenant_id, branch_id, product_id);

CREATE TRIGGER update_inventory_balances_modtime
BEFORE UPDATE ON public.inventory_balances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 3. TABLE: public.inventory_movements (Append-Only Stock Ledger)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL,
    movement_type       TEXT NOT NULL CHECK (
        movement_type IN (
            'receipt',          -- Incoming supplier/purchase delivery
            'sale',             -- Decrement upon customer retail purchase
            'adjustment_gain',  -- Manual stock count correction (+)
            'adjustment_loss',  -- Manual stock count correction / damage (-)
            'return_restock',   -- Customer refund/return returned to inventory
            'transfer_out',     -- Multi-branch transit out
            'transfer_in'       -- Multi-branch transit in
        )
    ),
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    previous_balance    INTEGER NOT NULL CHECK (previous_balance >= 0),
    new_balance         INTEGER NOT NULL CHECK (new_balance >= 0),
    cost_minor_units    INTEGER NOT NULL DEFAULT 0 CHECK (cost_minor_units >= 0),
    currency            VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    reference_id        TEXT NULL,   -- e.g. receipt id, sale id, order id
    reason              TEXT NULL,
    actor_staff_id      UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    idempotency_key     TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT fk_inventory_movements_product_tenant FOREIGN KEY (product_id, tenant_id)
        REFERENCES public.products(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_inventory_movements_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ledger ON public.inventory_movements(tenant_id, branch_id, product_id, created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 4. HARDENED TRUST BOUNDARY: REVOKE DIRECT TABLE ACCESS
-- =========================================================================

REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;

-- Allow SELECT to authenticated so that RLS policies govern row-level read access.
-- Direct mutations (INSERT, UPDATE, DELETE) remain completely revoked; all writes
-- must proceed through server-authoritative SECURITY DEFINER RPCs.
GRANT SELECT ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.inventory_balances TO authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;


-- =========================================================================
-- 5. RLS POLICIES FOR DEFENSE IN DEPTH
-- =========================================================================

DROP POLICY IF EXISTS "Authorized tenant staff can view products" ON public.products;
CREATE POLICY "Authorized tenant staff can view products"
ON public.products
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = products.tenant_id
          AND s.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view inventory balances" ON public.inventory_balances;
CREATE POLICY "Authorized tenant staff can view inventory balances"
ON public.inventory_balances
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = inventory_balances.tenant_id
          AND s.active = true
    )
);

DROP POLICY IF EXISTS "Authorized tenant staff can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Authorized tenant staff can view inventory movements"
ON public.inventory_movements
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_profile_id = auth.uid()
          AND s.tenant_id = inventory_movements.tenant_id
          AND s.active = true
    )
);


-- =========================================================================
-- 6. SERVER-AUTHORITATIVE RPC CONTRACTS
-- =========================================================================

-- A. pos_create_product: Register a new product in the catalog
CREATE OR REPLACE FUNCTION public.pos_create_product(
    p_name TEXT,
    p_sku TEXT,
    p_price_minor_units INTEGER,
    p_currency TEXT,
    p_category TEXT DEFAULT 'general',
    p_barcode TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_unit_of_measure TEXT DEFAULT 'piece',
    p_cost_minor_units INTEGER DEFAULT 0,
    p_tax_rate_basis_points INTEGER DEFAULT 0
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
    v_clean_sku TEXT;
    v_norm_currency VARCHAR(3);
    v_new_product RECORD;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    v_clean_name := trim(COALESCE(p_name, ''));
    v_clean_sku := upper(trim(COALESCE(p_sku, '')));
    v_norm_currency := upper(trim(COALESCE(p_currency, '')));

    IF length(v_clean_name) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Product name cannot be empty.';
    END IF;

    IF length(v_clean_sku) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: SKU cannot be empty.';
    END IF;

    IF p_price_minor_units IS NULL OR p_price_minor_units < 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Price minor units must be non-negative.';
    END IF;

    IF v_norm_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Invalid ISO 3-character currency.';
    END IF;

    -- Check for SKU collision in tenant
    IF EXISTS (
        SELECT 1 FROM public.products
        WHERE tenant_id = v_staff.tenant_id
          AND sku = v_clean_sku
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_SKU: Product with SKU % already exists for tenant.', v_clean_sku;
    END IF;

    INSERT INTO public.products (
        tenant_id,
        name,
        sku,
        barcode,
        description,
        category,
        brand,
        unit_of_measure,
        price_minor_units,
        cost_minor_units,
        currency,
        tax_rate_basis_points,
        is_active,
        is_retail,
        created_at,
        updated_at
    ) VALUES (
        v_staff.tenant_id,
        v_clean_name,
        v_clean_sku,
        nullif(trim(p_barcode), ''),
        nullif(trim(p_description), ''),
        trim(COALESCE(p_category, 'general')),
        nullif(trim(p_brand), ''),
        trim(COALESCE(p_unit_of_measure, 'piece')),
        p_price_minor_units,
        COALESCE(p_cost_minor_units, 0),
        v_norm_currency,
        COALESCE(p_tax_rate_basis_points, 0),
        true,
        true,
        now(),
        now()
    )
    RETURNING * INTO v_new_product;

    -- Audit event (metadata only)
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
        'product_created',
        'products',
        v_new_product.id::text,
        jsonb_build_object(
            'product_id', v_new_product.id,
            'sku', v_new_product.sku,
            'name', v_new_product.name,
            'price_minor_units', v_new_product.price_minor_units,
            'currency', v_new_product.currency
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', v_new_product.id,
        'tenant_id', v_new_product.tenant_id,
        'sku', v_new_product.sku,
        'name', v_new_product.name,
        'price_minor_units', v_new_product.price_minor_units,
        'currency', v_new_product.currency
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_product FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_product TO authenticated, service_role;


-- B. pos_record_stock_receipt: Ingest stock into a specific branch
CREATE OR REPLACE FUNCTION public.pos_record_stock_receipt(
    p_branch_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_cost_minor_units INTEGER DEFAULT 0,
    p_reference_id TEXT DEFAULT NULL,
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
    v_product RECORD;
    v_branch RECORD;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_movement RECORD;
    v_prev_balance INTEGER := 0;
    v_new_balance INTEGER := 0;
    v_movement_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Quantity must be greater than zero.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Validate product and assert tenant match
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id;

    IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product not found or cross-tenant access denied.';
    END IF;

    IF v_product.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'PRODUCT_INACTIVE: Cannot receive stock for an inactive product.';
    END IF;

    -- Validate branch and assert tenant match
    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    IF v_branch.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'BRANCH_INACTIVE: Target branch is inactive.';
    END IF;

    -- Check idempotency
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_movement
        FROM public.inventory_movements
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_movement.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'movement_id', v_existing_movement.id,
                'product_id', v_existing_movement.product_id,
                'branch_id', v_existing_movement.branch_id,
                'quantity', v_existing_movement.quantity,
                'new_balance', v_existing_movement.new_balance
            );
        END IF;
    END IF;

    -- Concurrency lock: serialize inventory operations for this (branch, product)
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_branch.id::text || ':' || v_product.id::text, 0)
    );

    -- Fetch or initialize inventory balance row
    SELECT on_hand_quantity INTO v_prev_balance
    FROM public.inventory_balances
    WHERE branch_id = v_branch.id
      AND product_id = v_product.id;

    IF NOT FOUND THEN
        v_prev_balance := 0;
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
            p_quantity,
            0,
            now(),
            now(),
            now()
        );
        v_new_balance := p_quantity;
    ELSE
        v_new_balance := v_prev_balance + p_quantity;
        UPDATE public.inventory_balances
        SET on_hand_quantity = v_new_balance,
            last_movement_at = now(),
            updated_at = now()
        WHERE branch_id = v_branch.id
          AND product_id = v_product.id;
    END IF;

    -- Append to immutable stock ledger
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
        p_quantity,
        v_prev_balance,
        v_new_balance,
        COALESCE(p_cost_minor_units, v_product.cost_minor_units),
        v_product.currency,
        nullif(trim(p_reference_id), ''),
        'stock_receipt',
        v_staff.id,
        v_clean_key,
        now()
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'movement_id', v_movement_id,
        'branch_id', v_branch.id,
        'product_id', v_product.id,
        'quantity', p_quantity,
        'previous_balance', v_prev_balance,
        'new_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_record_stock_receipt FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_record_stock_receipt TO authenticated, service_role;


-- C. pos_decrement_stock_for_sale: Concurrency-safe atomic sale decrement
CREATE OR REPLACE FUNCTION public.pos_decrement_stock_for_sale(
    p_branch_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_reference_id TEXT DEFAULT NULL,
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
    v_product RECORD;
    v_branch RECORD;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_movement RECORD;
    v_balance RECORD;
    v_prev_balance INTEGER;
    v_new_balance INTEGER;
    v_movement_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Quantity must be greater than zero.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Validate product and assert tenant match
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id;

    IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product not found or cross-tenant access denied.';
    END IF;

    IF v_product.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'PRODUCT_INACTIVE: Cannot sell an inactive product.';
    END IF;

    -- Validate branch and assert tenant match
    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    -- Check idempotency
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_movement
        FROM public.inventory_movements
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_movement.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'movement_id', v_existing_movement.id,
                'product_id', v_existing_movement.product_id,
                'branch_id', v_existing_movement.branch_id,
                'quantity', v_existing_movement.quantity,
                'new_balance', v_existing_movement.new_balance
            );
        END IF;
    END IF;

    -- Concurrency lock: serialize inventory operations for this (branch, product)
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_branch.id::text || ':' || v_product.id::text, 0)
    );

    -- Fetch current stock balance
    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE branch_id = v_branch.id
      AND product_id = v_product.id;

    IF v_balance.id IS NULL THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: No stock record exists for this product at the specified branch.';
    END IF;

    v_prev_balance := v_balance.on_hand_quantity;

    -- Check sufficient available stock
    IF v_prev_balance < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Requested quantity % exceeds available on-hand balance %.', p_quantity, v_prev_balance;
    END IF;

    v_new_balance := v_prev_balance - p_quantity;

    -- Update balance projection
    UPDATE public.inventory_balances
    SET on_hand_quantity = v_new_balance,
        last_movement_at = now(),
        updated_at = now()
    WHERE id = v_balance.id;

    -- Record immutable sale movement
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
        'sale',
        p_quantity,
        v_prev_balance,
        v_new_balance,
        v_product.cost_minor_units,
        v_product.currency,
        nullif(trim(p_reference_id), ''),
        'retail_sale',
        v_staff.id,
        v_clean_key,
        now()
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'movement_id', v_movement_id,
        'branch_id', v_branch.id,
        'product_id', v_product.id,
        'quantity', p_quantity,
        'previous_balance', v_prev_balance,
        'new_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_decrement_stock_for_sale FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_decrement_stock_for_sale TO authenticated, service_role;


-- D. pos_adjust_stock: Compensating movement for manual stock audit corrections
CREATE OR REPLACE FUNCTION public.pos_adjust_stock(
    p_branch_id UUID,
    p_product_id UUID,
    p_adjustment_delta INTEGER,
    p_reason TEXT,
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
    v_product RECORD;
    v_branch RECORD;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_movement RECORD;
    v_balance RECORD;
    v_prev_balance INTEGER := 0;
    v_new_balance INTEGER := 0;
    v_movement_type TEXT;
    v_abs_qty INTEGER;
    v_movement_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_adjustment_delta IS NULL OR p_adjustment_delta = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Adjustment delta must be non-zero.';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Reason must be provided for stock adjustment.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Validate product and assert tenant match
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id;

    IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product not found or cross-tenant access denied.';
    END IF;

    -- Validate branch and assert tenant match
    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    -- Check idempotency
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_movement
        FROM public.inventory_movements
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_movement.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'movement_id', v_existing_movement.id,
                'product_id', v_existing_movement.product_id,
                'branch_id', v_existing_movement.branch_id,
                'quantity', v_existing_movement.quantity,
                'new_balance', v_existing_movement.new_balance
            );
        END IF;
    END IF;

    -- Concurrency lock: serialize inventory operations for this (branch, product)
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_branch.id::text || ':' || v_product.id::text, 0)
    );

    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE branch_id = v_branch.id
      AND product_id = v_product.id;

    IF v_balance.id IS NULL THEN
        v_prev_balance := 0;
    ELSE
        v_prev_balance := v_balance.on_hand_quantity;
    END IF;

    v_new_balance := v_prev_balance + p_adjustment_delta;
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Adjustment would result in negative stock balance (current: %, delta: %).', v_prev_balance, p_adjustment_delta;
    END IF;

    IF p_adjustment_delta > 0 THEN
        v_movement_type := 'adjustment_gain';
        v_abs_qty := p_adjustment_delta;
    ELSE
        v_movement_type := 'adjustment_loss';
        v_abs_qty := -p_adjustment_delta;
    END IF;

    -- Update or initialize balance
    IF v_balance.id IS NULL THEN
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
            v_new_balance,
            0,
            now(),
            now(),
            now()
        );
    ELSE
        UPDATE public.inventory_balances
        SET on_hand_quantity = v_new_balance,
            last_movement_at = now(),
            updated_at = now()
        WHERE id = v_balance.id;
    END IF;

    -- Append compensating movement to ledger
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
        v_movement_type,
        v_abs_qty,
        v_prev_balance,
        v_new_balance,
        v_product.cost_minor_units,
        v_product.currency,
        NULL,
        trim(p_reason),
        v_staff.id,
        v_clean_key,
        now()
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'movement_id', v_movement_id,
        'branch_id', v_branch.id,
        'product_id', v_product.id,
        'delta', p_adjustment_delta,
        'previous_balance', v_prev_balance,
        'new_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_adjust_stock FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_adjust_stock TO authenticated, service_role;


-- E. pos_return_restock: Compensating return of previously sold inventory
CREATE OR REPLACE FUNCTION public.pos_return_restock(
    p_branch_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_reason TEXT,
    p_sale_reference_id TEXT DEFAULT NULL,
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
    v_product RECORD;
    v_branch RECORD;
    v_clean_key TEXT := nullif(trim(COALESCE(p_idempotency_key, '')), '');
    v_existing_movement RECORD;
    v_balance RECORD;
    v_prev_balance INTEGER := 0;
    v_new_balance INTEGER := 0;
    v_movement_id UUID;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Return restock quantity must be positive.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Validate product and assert tenant match
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id;

    IF v_product.id IS NULL OR v_product.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Product not found or cross-tenant access denied.';
    END IF;

    -- Validate branch and assert tenant match
    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    -- Check idempotency
    IF v_clean_key IS NOT NULL THEN
        SELECT * INTO v_existing_movement
        FROM public.inventory_movements
        WHERE tenant_id = v_staff.tenant_id
          AND idempotency_key = v_clean_key;

        IF v_existing_movement.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'movement_id', v_existing_movement.id,
                'product_id', v_existing_movement.product_id,
                'branch_id', v_existing_movement.branch_id,
                'quantity', v_existing_movement.quantity,
                'new_balance', v_existing_movement.new_balance
            );
        END IF;
    END IF;

    -- Concurrency lock: serialize inventory operations for this (branch, product)
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_branch.id::text || ':' || v_product.id::text, 0)
    );

    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE branch_id = v_branch.id
      AND product_id = v_product.id;

    IF v_balance.id IS NULL THEN
        v_prev_balance := 0;
        v_new_balance := p_quantity;
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
            v_new_balance,
            0,
            now(),
            now(),
            now()
        );
    ELSE
        v_prev_balance := v_balance.on_hand_quantity;
        v_new_balance := v_prev_balance + p_quantity;
        UPDATE public.inventory_balances
        SET on_hand_quantity = v_new_balance,
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
        'return_restock',
        p_quantity,
        v_prev_balance,
        v_new_balance,
        v_product.cost_minor_units,
        v_product.currency,
        nullif(trim(p_sale_reference_id), ''),
        trim(COALESCE(p_reason, 'customer_return_restock')),
        v_staff.id,
        v_clean_key,
        now()
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'movement_id', v_movement_id,
        'branch_id', v_branch.id,
        'product_id', v_product.id,
        'quantity', p_quantity,
        'previous_balance', v_prev_balance,
        'new_balance', v_new_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_return_restock FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_return_restock TO authenticated, service_role;


-- F. pos_get_branch_inventory: Read-only query for staff to inspect branch inventory balances
CREATE OR REPLACE FUNCTION public.pos_get_branch_inventory(
    p_branch_id UUID,
    p_category TEXT DEFAULT NULL
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
    v_items JSONB;
BEGIN
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
    END IF;

    -- Derive caller active staff identity
    SELECT s.* INTO v_staff
    FROM public.staff s
    WHERE s.user_profile_id = v_caller_uid
      AND s.active = true
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller has no active staff identity.';
    END IF;

    -- Validate branch and assert tenant match
    SELECT * INTO v_branch
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_branch.id IS NULL OR v_branch.tenant_id <> v_staff.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Branch not found or cross-tenant access denied.';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'product_id', p.id,
            'name', p.name,
            'sku', p.sku,
            'category', p.category,
            'price_minor_units', p.price_minor_units,
            'cost_minor_units', p.cost_minor_units,
            'currency', p.currency,
            'unit_of_measure', p.unit_of_measure,
            'is_active', p.is_active,
            'on_hand_quantity', COALESCE(b.on_hand_quantity, 0),
            'allocated_quantity', COALESCE(b.allocated_quantity, 0),
            'available_quantity', (COALESCE(b.on_hand_quantity, 0) - COALESCE(b.allocated_quantity, 0)),
            'reorder_point', COALESCE(b.reorder_point, 0)
        )
        ORDER BY p.name ASC
    ), '[]'::jsonb)
    INTO v_items
    FROM public.products p
    LEFT JOIN public.inventory_balances b ON b.product_id = p.id AND b.branch_id = v_branch.id
    WHERE p.tenant_id = v_staff.tenant_id
      AND (p_category IS NULL OR p.category = trim(p_category));

    RETURN jsonb_build_object(
        'success', true,
        'branch_id', v_branch.id,
        'tenant_id', v_staff.tenant_id,
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_get_branch_inventory FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_get_branch_inventory TO authenticated, service_role;
