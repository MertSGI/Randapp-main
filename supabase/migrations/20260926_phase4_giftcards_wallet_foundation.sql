-- =========================================================================
-- MIGRATION: 20260926_phase4_giftcards_wallet_foundation.sql
-- Description: Phase 4 Node 3 Gift Cards & Client Wallet Foundation
-- Target: PostgreSQL / Supabase
-- Authority ID: LARI-PROGRAM-V2-PHASE3-R1-CORRECTIONS-AND-PHASE4-CONTINUATION-20260911-01
-- Program ID: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Constraints:
--   - Integer minor units only
--   - Currency-bound balances
--   - Immutable ledger entries
--   - Atomic debit/credit
--   - Anti-double-spend row-level locking (SELECT ... FOR UPDATE)
--   - Idempotency via unique idempotency keys per tenant
--   - Gift card secret capability codes stored as SHA-256 digests only (no raw plaintext code storage)
--   - NO real gift-card sale or live payment collection
-- =========================================================================

-- 1. Table: public.client_wallets
CREATE TABLE IF NOT EXISTS public.client_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    balance_minor_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor_units >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_client_wallets_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_client_wallets_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT uq_client_wallet_customer_currency UNIQUE (tenant_id, customer_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_client_wallets_lookup ON public.client_wallets(tenant_id, customer_id);

-- 2. Table: public.client_wallet_ledger
-- Immutable audit log for all wallet debits and credits
CREATE TABLE IF NOT EXISTS public.client_wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit', 'adjustment', 'refund', 'gift_card_redemption')),
    amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
    balance_before_minor_units INTEGER NOT NULL CHECK (balance_before_minor_units >= 0),
    balance_after_minor_units INTEGER NOT NULL CHECK (balance_after_minor_units >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    appointment_id UUID DEFAULT NULL,
    idempotency_key TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_client_wallet_ledger_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_wallet_ledger_wallet_tenant FOREIGN KEY (wallet_id, tenant_id)
        REFERENCES public.client_wallets(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_wallet_ledger_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON public.client_wallet_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_appt ON public.client_wallet_ledger(appointment_id);

-- Database-enforced Append-Only Protection on Wallet Ledger
CREATE OR REPLACE FUNCTION public.prevent_wallet_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'WALLET_LEDGER_IMMUTABLE: Updates and deletes are forbidden'
        USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_wallet_ledger_mutation ON public.client_wallet_ledger;
CREATE TRIGGER trg_prevent_wallet_ledger_mutation
    BEFORE UPDATE OR DELETE ON public.client_wallet_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_wallet_ledger_mutation();

-- 3. Table: public.gift_cards
-- Stores gift card vouchers. Secret capability code is stored as a SHA-256 hash.
CREATE TABLE IF NOT EXISTS public.gift_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, -- SHA-256 hex digest of the redeemable code
    code_last_four VARCHAR(4) NOT NULL, -- Masked display identifier (e.g. "4921")
    initial_balance_minor_units INTEGER NOT NULL CHECK (initial_balance_minor_units > 0),
    current_balance_minor_units INTEGER NOT NULL CHECK (current_balance_minor_units >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    recipient_name VARCHAR(255),
    recipient_email VARCHAR(255),
    purchaser_customer_id UUID DEFAULT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'voided')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gift_cards_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_gift_cards_code_hash UNIQUE (tenant_id, code_hash),
    CONSTRAINT fk_gift_cards_purchaser_tenant FOREIGN KEY (purchaser_customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT chk_gift_card_balance CHECK (current_balance_minor_units <= initial_balance_minor_units)
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_lookup ON public.gift_cards(tenant_id, status);

-- 4. Table: public.gift_card_redemptions
-- Immutable audit log for gift card redemptions
CREATE TABLE IF NOT EXISTS public.gift_card_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    gift_card_id UUID NOT NULL,
    customer_id UUID DEFAULT NULL,
    appointment_id UUID DEFAULT NULL,
    redeemed_minor_units INTEGER NOT NULL CHECK (redeemed_minor_units > 0),
    remaining_balance_minor_units INTEGER NOT NULL CHECK (remaining_balance_minor_units >= 0),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_gift_card_redemptions_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_gift_card_redemptions_card_tenant FOREIGN KEY (gift_card_id, tenant_id)
        REFERENCES public.gift_cards(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_gift_card_redemptions_customer_tenant FOREIGN KEY (customer_id, tenant_id)
        REFERENCES public.customers(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT fk_gift_card_redemptions_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemptions_card ON public.gift_card_redemptions(gift_card_id);

-- Database-enforced Append-Only Protection on Gift Card Redemptions Ledger
CREATE OR REPLACE FUNCTION public.prevent_gift_card_redemptions_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'GIFT_CARD_REDEMPTIONS_IMMUTABLE: Updates and deletes are forbidden'
        USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_gift_card_redemptions_mutation ON public.gift_card_redemptions;
CREATE TRIGGER trg_prevent_gift_card_redemptions_mutation
    BEFORE UPDATE OR DELETE ON public.gift_card_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_gift_card_redemptions_mutation();

-- RLS Configuration
ALTER TABLE public.client_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_wallets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.client_wallet_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gift_cards FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.gift_card_redemptions FROM PUBLIC, anon, authenticated;

CREATE POLICY "Staff read client_wallets" ON public.client_wallets FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = client_wallets.tenant_id)))
);
CREATE POLICY "Staff read client_wallet_ledger" ON public.client_wallet_ledger FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = client_wallet_ledger.tenant_id)))
);
CREATE POLICY "Staff read gift_cards" ON public.gift_cards FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = gift_cards.tenant_id)))
);
CREATE POLICY "Staff read gift_card_redemptions" ON public.gift_card_redemptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users_profile up WHERE up.id = auth.uid() AND up.active = true AND (up.role = 'super_admin' OR (up.role IN ('tenant_owner', 'staff') AND up.tenant_id = gift_card_redemptions.tenant_id)))
);

-- =========================================================================
-- 5. RPC: transact_wallet_balance
-- Atomic wallet debit or credit with anti-double-spend row-level locking
-- Proves customer belongs to tenant before creating a wallet.
-- Narrows authority to tenant_owner, super_admin, or explicit stored_value capability.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.transact_wallet_balance(
    p_tenant_id        UUID,
    p_customer_id      UUID,
    p_amount_minor     INTEGER,
    p_operation        TEXT, -- 'debit' or 'credit'
    p_currency         TEXT DEFAULT 'TRY',
    p_appointment_id   UUID DEFAULT NULL,
    p_idempotency_key  TEXT DEFAULT NULL,
    p_description      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user         RECORD;
    v_wallet       RECORD;
    v_existing     RECORD;
    v_new_bal      INTEGER;
    v_ledger_id    UUID;
    v_idem_key     TEXT;
    v_curr         VARCHAR(3);
    v_cust_exists  BOOLEAN;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    -- Narrow mutation authority: only super_admin or tenant_owner have stored-value authority by default
    IF v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Stored-value financial mutation requires tenant_owner or super_admin'
            USING ERRCODE = '42501';
    END IF;

    IF p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_amount');
    END IF;

    IF p_operation NOT IN ('debit', 'credit') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_operation');
    END IF;

    -- Prove customer belongs to tenant
    SELECT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = p_tenant_id
    ) INTO v_cust_exists;

    IF NOT v_cust_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'customer_not_found_in_tenant');
    END IF;

    -- Prove appointment belongs to tenant if specified
    IF p_appointment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.appointments WHERE id = p_appointment_id AND tenant_id = p_tenant_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'appointment_not_found_in_tenant');
    END IF;

    v_curr := upper(COALESCE(p_currency, 'TRY'));
    v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

    -- 1. Check idempotency replay
    SELECT * INTO v_existing
    FROM public.client_wallet_ledger
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'ledger_id', v_existing.id,
            'balance_after_minor_units', v_existing.balance_after_minor_units
        );
    END IF;

    -- 2. Lock or insert wallet row
    SELECT * INTO v_wallet
    FROM public.client_wallets
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND currency = v_curr
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create wallet after verifying customer belongs to tenant
        INSERT INTO public.client_wallets (tenant_id, customer_id, currency, balance_minor_units)
        VALUES (p_tenant_id, p_customer_id, v_curr, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF NOT v_wallet.is_active THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'wallet_inactive');
    END IF;

    -- 3. Calculate new balance
    IF p_operation = 'debit' THEN
        IF v_wallet.balance_minor_units < p_amount_minor THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'insufficient_funds',
                'current_balance_minor_units', v_wallet.balance_minor_units,
                'requested_debit_minor_units', p_amount_minor
            );
        END IF;
        v_new_bal := v_wallet.balance_minor_units - p_amount_minor;
    ELSE
        v_new_bal := v_wallet.balance_minor_units + p_amount_minor;
    END IF;

    -- 4. Update wallet balance
    UPDATE public.client_wallets
    SET balance_minor_units = v_new_bal,
        updated_at = now()
    WHERE id = v_wallet.id;

    -- 5. Insert immutable ledger entry
    INSERT INTO public.client_wallet_ledger (
        tenant_id, wallet_id, entry_type, amount_minor_units,
        balance_before_minor_units, balance_after_minor_units, currency,
        appointment_id, idempotency_key, description, metadata
    ) VALUES (
        p_tenant_id, v_wallet.id, p_operation, p_amount_minor,
        v_wallet.balance_minor_units, v_new_bal, v_curr,
        p_appointment_id, v_idem_key, p_description,
        jsonb_build_object('operator_id', auth.uid())
    )
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', false,
        'ledger_id', v_ledger_id,
        'balance_before_minor_units', v_wallet.balance_minor_units,
        'balance_after_minor_units', v_new_bal,
        'operation', p_operation,
        'currency', v_curr
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transact_wallet_balance(UUID, UUID, INTEGER, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transact_wallet_balance(UUID, UUID, INTEGER, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- =========================================================================
-- 6. RPC: redeem_gift_card
-- Concurrency-safe gift card redemption against SHA-256 hashed code
-- Proves customer and appointment belong to tenant if provided.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.redeem_gift_card(
    p_tenant_id       UUID,
    p_code_hash       TEXT,
    p_amount_minor    INTEGER,
    p_customer_id     UUID DEFAULT NULL,
    p_appointment_id  UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user       RECORD;
    v_card       RECORD;
    v_existing   RECORD;
    v_new_bal    INTEGER;
    v_new_status TEXT;
    v_redemp_id  UUID;
    v_idem_key   TEXT;
BEGIN
    SELECT role, tenant_id INTO v_user
    FROM public.users_profile
    WHERE id = auth.uid() AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF v_user.role <> 'super_admin' AND (v_user.role NOT IN ('tenant_owner', 'staff') OR v_user.tenant_id <> p_tenant_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;

    IF p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_amount');
    END IF;

    -- If customer_id provided, verify customer belongs to tenant
    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = p_tenant_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'customer_not_found_in_tenant');
    END IF;

    -- If appointment_id provided, verify appointment belongs to tenant
    IF p_appointment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.appointments WHERE id = p_appointment_id AND tenant_id = p_tenant_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'appointment_not_found_in_tenant');
    END IF;

    v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

    -- 1. Idempotency check
    SELECT * INTO v_existing
    FROM public.gift_card_redemptions
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'redemption_id', v_existing.id,
            'remaining_balance_minor_units', v_existing.remaining_balance_minor_units
        );
    END IF;

    -- 2. Lock Gift Card Row (SELECT ... FOR UPDATE)
    SELECT * INTO v_card
    FROM public.gift_cards
    WHERE tenant_id = p_tenant_id AND code_hash = p_code_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'gift_card_not_found');
    END IF;

    IF v_card.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'gift_card_not_active', 'status', v_card.status);
    END IF;

    IF v_card.expires_at < now() THEN
        UPDATE public.gift_cards SET status = 'expired', updated_at = now() WHERE id = v_card.id;
        RETURN jsonb_build_object('success', false, 'reason_code', 'gift_card_expired');
    END IF;

    IF v_card.current_balance_minor_units < p_amount_minor THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'insufficient_balance',
            'current_balance_minor_units', v_card.current_balance_minor_units,
            'requested_minor_units', p_amount_minor
        );
    END IF;

    -- 3. Calculate remaining balance & new status
    v_new_bal := v_card.current_balance_minor_units - p_amount_minor;
    v_new_status := CASE WHEN v_new_bal = 0 THEN 'redeemed' ELSE 'active' END;

    UPDATE public.gift_cards
    SET current_balance_minor_units = v_new_bal,
        status = v_new_status,
        updated_at = now()
    WHERE id = v_card.id;

    -- 4. Record redemption
    INSERT INTO public.gift_card_redemptions (
        tenant_id, gift_card_id, customer_id, appointment_id,
        redeemed_minor_units, remaining_balance_minor_units, idempotency_key
    ) VALUES (
        p_tenant_id, v_card.id, p_customer_id, p_appointment_id,
        p_amount_minor, v_new_bal, v_idem_key
    )
    RETURNING id INTO v_redemp_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', false,
        'redemption_id', v_redemp_id,
        'gift_card_id', v_card.id,
        'redeemed_minor_units', p_amount_minor,
        'remaining_balance_minor_units', v_new_bal,
        'status', v_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_gift_card(UUID, TEXT, INTEGER, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(UUID, TEXT, INTEGER, UUID, UUID, TEXT) TO authenticated, service_role;
