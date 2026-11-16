-- ===========================================================================
-- Ported from 72911e4: 20260919_phase3_provider_neutral_payment_foundation.sql
-- Conflict-free sequential prefix: 20260921 (ADIM-035 / Faz D3)
-- Description: Phase 3 Provider-Neutral Payment Domain Foundation
-- Safety Constraints:
--   - Preserves platform_global_release_control paymentless NO_GO invariants
--   - All financial intent mutations restricted to service_role
--   - Direct table DML revoked from PUBLIC, anon, and authenticated
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.payment_intents (Provider-Neutral Intent Domain)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.payment_intents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    purpose             TEXT NOT NULL CHECK (purpose IN ('subscription', 'appointment_deposit', 'invoice', 'custom')),
    resource_id         TEXT DEFAULT NULL,
    amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
    currency            VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN (
                            'created',
                            'requires_action',
                            'processing',
                            'succeeded',
                            'failed',
                            'cancelled',
                            'expired'
                        )),
    idempotency_key     TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    provider_id         TEXT DEFAULT NULL,
    provider_reference  TEXT DEFAULT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code          TEXT DEFAULT NULL,
    error_message       TEXT DEFAULT NULL,
    last_applied_event_timestamp TIMESTAMPTZ DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payment_intents_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT uq_payment_intents_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_status ON public.payment_intents(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_provider_reference ON public.payment_intents(provider_id, provider_reference)
    WHERE provider_id IS NOT NULL AND provider_reference IS NOT NULL;

DROP TRIGGER IF EXISTS update_payment_intents_modtime ON public.payment_intents;
CREATE TRIGGER update_payment_intents_modtime
    BEFORE UPDATE ON public.payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_intents FROM PUBLIC;
REVOKE ALL ON public.payment_intents FROM anon;
REVOKE ALL ON public.payment_intents FROM authenticated;

-- =========================================================================
-- 2. Reconcile & Harden public.payments (Canonical Minor-Units Alignment)
-- =========================================================================

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS amount_minor BIGINT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_event_timestamp TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS amount_unit_classification TEXT DEFAULT NULL;

UPDATE public.payments
SET amount_unit_classification = 'LEGACY_UNPROVEN_UNIT'
WHERE amount_minor IS NULL AND amount IS NOT NULL AND amount_unit_classification IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_minor_positive'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT chk_payments_amount_minor_positive CHECK (amount_minor IS NULL OR amount_minor > 0);
    END IF;
END $$;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payments FROM PUBLIC;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.payments FROM authenticated;

-- =========================================================================
-- 3. Reconcile & Harden public.payment_events (Provider-Scoped Atomic Replay)
-- =========================================================================

ALTER TABLE public.payment_events
    ADD COLUMN IF NOT EXISTS intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payload_digest TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ DEFAULT NOW();

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.payment_events'::regclass
          AND contype = 'u'
          AND conkey = ARRAY[(
              SELECT attnum FROM pg_attribute
              WHERE attrelid = 'public.payment_events'::regclass AND attname = 'provider_event_id'
          )]
    ) LOOP
        EXECUTE 'ALTER TABLE public.payment_events DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payment_events_provider_event_unique'
    ) THEN
        ALTER TABLE public.payment_events
        ADD CONSTRAINT payment_events_provider_event_unique UNIQUE (provider, provider_event_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON public.payment_events(intent_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_events FROM PUBLIC;
REVOKE ALL ON public.payment_events FROM anon;
REVOKE ALL ON public.payment_events FROM authenticated;

-- =========================================================================
-- 4. Server-Side RPC: create_payment_intent
-- =========================================================================

CREATE OR REPLACE FUNCTION public.create_payment_intent(
    p_tenant_id         UUID,
    p_purpose           TEXT,
    p_amount_minor      BIGINT,
    p_currency          TEXT,
    p_idempotency_key   TEXT,
    p_resource_id       TEXT DEFAULT NULL,
    p_metadata          JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_norm_currency     VARCHAR(3);
    v_clean_key         TEXT;
    v_clean_purpose     TEXT;
    v_fingerprint       TEXT;
    v_existing_intent   RECORD;
    v_new_id            UUID;
BEGIN
    v_clean_key := trim(COALESCE(p_idempotency_key, ''));
    v_clean_purpose := trim(COALESCE(p_purpose, ''));
    v_norm_currency := upper(trim(COALESCE(p_currency, '')));

    IF length(v_clean_key) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY');
    END IF;

    IF v_clean_purpose NOT IN ('subscription', 'appointment_deposit', 'invoice', 'custom') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PURPOSE');
    END IF;

    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT_MINOR');
    END IF;

    IF v_norm_currency !~ '^[A-Z]{3}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CURRENCY');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    v_fingerprint := encode(sha256(
        (p_tenant_id::text || ':' || v_clean_purpose || ':' || p_amount_minor::text || ':' || v_norm_currency || ':' || COALESCE(p_resource_id, '') || ':' || COALESCE(p_metadata::text, '{}'))::bytea
    ), 'hex');

    INSERT INTO public.payment_intents (
        tenant_id,
        purpose,
        resource_id,
        amount_minor,
        currency,
        idempotency_key,
        request_fingerprint,
        metadata,
        status
    ) VALUES (
        p_tenant_id,
        v_clean_purpose,
        p_resource_id,
        p_amount_minor,
        v_norm_currency,
        v_clean_key,
        v_fingerprint,
        COALESCE(p_metadata, '{}'::jsonb),
        'created'
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
        SELECT id, request_fingerprint, status, amount_minor, currency INTO v_existing_intent
        FROM public.payment_intents
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_clean_key;

        IF v_existing_intent.request_fingerprint != v_fingerprint THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'IDEMPOTENCY_CONFLICT',
                'message', 'Same idempotency key supplied with altered financial amount, currency, or purpose'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'intent_id', v_existing_intent.id,
            'status', v_existing_intent.status,
            'amount_minor', v_existing_intent.amount_minor,
            'currency', v_existing_intent.currency,
            'idempotent_duplicate', true
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', v_new_id,
        'status', 'created',
        'amount_minor', p_amount_minor,
        'currency', v_norm_currency
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_payment_intent(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_payment_intent(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_payment_intent(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_intent(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- =========================================================================
-- 5. Server-Side RPC: bind_payment_intent_provider
-- =========================================================================

CREATE OR REPLACE FUNCTION public.bind_payment_intent_provider(
    p_intent_id          UUID,
    p_provider_id        TEXT,
    p_provider_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_provider    TEXT;
    v_clean_ref         TEXT;
    v_intent_rec        RECORD;
BEGIN
    v_clean_provider := trim(COALESCE(p_provider_id, ''));
    v_clean_ref := trim(COALESCE(p_provider_reference, ''));

    IF length(v_clean_provider) < 1 OR length(v_clean_ref) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_BINDING_IDENTIFIERS');
    END IF;

    SELECT * INTO v_intent_rec
    FROM public.payment_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent_rec.provider_id IS NOT NULL AND v_intent_rec.provider_id != v_clean_provider THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PROVIDER_BINDING_MISMATCH',
            'message', 'Intent is already bound to a different payment provider'
        );
    END IF;

    IF v_intent_rec.provider_reference IS NOT NULL AND v_intent_rec.provider_reference != v_clean_ref THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PROVIDER_REFERENCE_MISMATCH',
            'message', 'Intent is already bound to a different provider reference'
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.payment_intents
        WHERE provider_id = v_clean_provider
          AND provider_reference = v_clean_ref
          AND id != v_intent_rec.id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PROVIDER_REFERENCE_ALREADY_BOUND',
            'message', 'Another payment intent already owns this provider reference'
        );
    END IF;

    UPDATE public.payment_intents
    SET provider_id = v_clean_provider,
        provider_reference = v_clean_ref,
        updated_at = NOW()
    WHERE id = v_intent_rec.id;

    RETURN jsonb_build_object(
        'success', true,
        'intent_id', v_intent_rec.id,
        'provider_id', v_clean_provider,
        'provider_reference', v_clean_ref
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bind_payment_intent_provider(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bind_payment_intent_provider(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bind_payment_intent_provider(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_payment_intent_provider(UUID, TEXT, TEXT) TO service_role;

-- =========================================================================
-- 6. Server-Side RPC: process_verified_payment_event
-- =========================================================================

CREATE OR REPLACE FUNCTION public.process_verified_payment_event(
    p_provider          TEXT,
    p_provider_event_id TEXT,
    p_event_type        TEXT,
    p_event_timestamp   TIMESTAMPTZ,
    p_raw_payload_hash  TEXT,
    p_intent_id         UUID DEFAULT NULL,
    p_provider_ref      TEXT DEFAULT NULL,
    p_status            TEXT DEFAULT NULL,
    p_error_code        TEXT DEFAULT NULL,
    p_error_message     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_provider    TEXT;
    v_clean_event_id    TEXT;
    v_clean_ref         TEXT;
    v_inserted_ev_id    UUID;
    v_existing_ev       RECORD;
    v_intent_rec        RECORD;
    v_has_intent        BOOLEAN := FALSE;
    v_payment_id        UUID;
BEGIN
    v_clean_provider := trim(COALESCE(p_provider, ''));
    v_clean_event_id := trim(COALESCE(p_provider_event_id, ''));
    v_clean_ref := trim(COALESCE(p_provider_ref, ''));

    IF length(v_clean_provider) < 1 OR length(v_clean_event_id) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_IDENTIFIERS');
    END IF;

    IF p_intent_id IS NOT NULL THEN
        SELECT * INTO v_intent_rec
        FROM public.payment_intents
        WHERE id = p_intent_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INTENT_NOT_FOUND',
                'message', 'Payment intent specified in callback does not exist'
            );
        END IF;

        IF v_intent_rec.provider_id IS NOT NULL AND v_intent_rec.provider_id != v_clean_provider THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'PROVIDER_BINDING_MISMATCH',
                'classification', 'PROVIDER_BINDING_MISMATCH',
                'message', 'Verified event provider does not match bound intent provider'
            );
        END IF;

        IF v_intent_rec.provider_reference IS NOT NULL AND length(v_clean_ref) > 0 AND v_intent_rec.provider_reference != v_clean_ref THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'PROVIDER_REFERENCE_MISMATCH',
                'classification', 'PROVIDER_REFERENCE_MISMATCH',
                'message', 'Verified event reference does not match bound intent provider reference'
            );
        END IF;

        IF v_intent_rec.provider_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INTENT_NOT_BOUND',
                'classification', 'INTENT_NOT_BOUND',
                'message', 'Payment intent is not bound to a provider; bind_payment_intent_provider must be called first'
            );
        END IF;

        v_has_intent := TRUE;
    END IF;

    INSERT INTO public.payment_events (
        provider,
        provider_event_id,
        event_type,
        event_timestamp,
        payload_digest,
        intent_id,
        status,
        processed_at
    ) VALUES (
        v_clean_provider,
        v_clean_event_id,
        p_event_type,
        p_event_timestamp,
        p_raw_payload_hash,
        p_intent_id,
        p_status,
        NOW()
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id INTO v_inserted_ev_id;

    IF v_inserted_ev_id IS NULL THEN
        SELECT id, payload_digest, status INTO v_existing_ev
        FROM public.payment_events
        WHERE provider = v_clean_provider AND provider_event_id = v_clean_event_id;

        IF p_raw_payload_hash IS NOT NULL AND v_existing_ev.payload_digest IS NOT NULL AND v_existing_ev.payload_digest != p_raw_payload_hash THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INTEGRITY_CONFLICT',
                'classification', 'INTEGRITY_CONFLICT',
                'message', 'EVENT_ID_PAYLOAD_MISMATCH: Same provider event ID received with altered payload digest'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'classification', 'IDEMPOTENT_SUCCESS',
            'message', 'IDEMPOTENT_SUCCESS',
            'event_id', v_existing_ev.id
        );
    END IF;

    IF v_has_intent THEN
        IF v_intent_rec.status IN ('succeeded', 'failed', 'cancelled', 'expired') THEN
            RETURN jsonb_build_object(
                'success', true,
                'intent_id', v_intent_rec.id,
                'status_preserved', v_intent_rec.status,
                'message', 'TERMINAL_STATE_PRESERVED_AGAINST_MUTATION'
            );
        END IF;

        IF v_intent_rec.last_applied_event_timestamp IS NOT NULL AND p_event_timestamp < v_intent_rec.last_applied_event_timestamp THEN
            RETURN jsonb_build_object(
                'success', true,
                'intent_id', v_intent_rec.id,
                'status_preserved', v_intent_rec.status,
                'message', 'STALE_EVENT_IGNORED_AGAINST_NEWER_STATE'
            );
        END IF;

        IF p_status = 'succeeded' THEN
            UPDATE public.payment_intents
            SET status = 'succeeded',
                provider_reference = COALESCE(NULLIF(v_clean_ref, ''), provider_reference),
                last_applied_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_intent_rec.id;

            INSERT INTO public.payments (
                tenant_id,
                intent_id,
                amount,
                amount_minor,
                amount_unit_classification,
                currency,
                status,
                provider,
                provider_reference,
                last_event_timestamp,
                paid_at
            ) VALUES (
                v_intent_rec.tenant_id,
                v_intent_rec.id,
                ROUND(v_intent_rec.amount_minor / 100.0, 2),
                v_intent_rec.amount_minor,
                'CANONICAL_MINOR_UNITS',
                v_intent_rec.currency,
                'paid',
                v_clean_provider,
                COALESCE(NULLIF(v_clean_ref, ''), v_intent_rec.provider_reference),
                p_event_timestamp,
                NOW()
            ) RETURNING id INTO v_payment_id;

        ELSIF p_status = 'failed' THEN
            UPDATE public.payment_intents
            SET status = 'failed',
                error_code = p_error_code,
                error_message = p_error_message,
                last_applied_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_intent_rec.id;

        ELSIF p_status = 'requires_action' THEN
            UPDATE public.payment_intents
            SET status = 'requires_action',
                last_applied_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_intent_rec.id;

        ELSIF p_status = 'processing' THEN
            UPDATE public.payment_intents
            SET status = 'processing',
                last_applied_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_intent_rec.id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'provider', v_clean_provider,
        'provider_event_id', v_clean_event_id,
        'status_applied', p_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_verified_payment_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_verified_payment_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_verified_payment_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_verified_payment_event(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
