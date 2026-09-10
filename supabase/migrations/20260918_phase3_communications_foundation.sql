-- ===========================================================================
-- Migration: Phase 3 Provider-Neutral Communications Foundation (R1 Hardened)
-- Authority: LARI-PROGRAM-V2-EV057-COMMUNICATIONS-FOUNDATION-R1-CORRECTION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: fcfca154e0a9e57cd8f6ab007cd6d88771f8b16a
-- Stacked on: fcfca154e0a9e57cd8f6ab007cd6d88771f8b16a
--
-- Controller R1 Security & Concurrency Corrections Applied:
-- 1. ZERO PII BROWSER LEAKAGE / RAW OUTBOX PROTECTION:
--    REVOKE ALL ON public.communication_outbox FROM PUBLIC, anon, authenticated.
--    Raw outbox is strictly server/internal. No browser role has direct table access.
-- 2. ENQUEUE AUTHORIZATION & IMMUTABLE FINGERPRINT IDEMPOTENCY:
--    enqueue_communication_outbox:
--    - REVOKE from PUBLIC, anon, authenticated. Callable only by internal/service-role (or authorized DB triggers).
--    - Computes SHA-256 fingerprint of (channel, recipient, template, payload).
--    - If idempotency_key matches with identical fingerprint: returns existing logical outbox entry.
--    - If idempotency_key matches with different fingerprint: raises/returns IDEMPOTENCY_CONFLICT error.
-- 3. WORKER AUTHORITY & BOUNDED CLAIM:
--    claim_outbox_batch:
--    - REVOKE EXECUTE from PUBLIC, anon, authenticated. Restricted to service_role / internal workers.
--    - Enforces bounded inputs: batch_size (1..100), lease_seconds (10..3600), worker_id non-empty.
-- 4. CALLBACK AUTHENTICITY, PROVIDER BINDING & ATOMIC REPLAY:
--    record_delivery_callback:
--    - REVOKE EXECUTE from PUBLIC, anon, authenticated. Restricted to verified Edge/adapter boundary.
--    - Callback lookup binds provider_id + provider_msg_ref to prevent cross-provider collision.
--    - Atomic replay protection: INSERT ON CONFLICT (provider_id, replay_token) DO NOTHING.
--    - If same provider + replay_token arrives with different payload digest: classifies as EVENT_ID_PAYLOAD_MISMATCH.
--    - Monotonic event ordering: tracks provider_event_timestamp vs last_applied_event_timestamp.
--      Stale or out-of-order callbacks are logged for audit but cannot regress terminal or advanced status.
-- 5. STATE MACHINE TRANSITION INTEGRITY:
--    Enforces state machine invariants preventing illegal regressions (e.g., delivered -> queued, dead_letter -> processing).
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.communication_outbox
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.communication_outbox (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    channel                 TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'otp')),
    recipient_address       TEXT NOT NULL,  -- phone number or email (server-side only)
    template_id             TEXT NOT NULL,
    payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_fingerprint     TEXT NOT NULL,  -- SHA-256 fingerprint of (channel, recipient, template, payload)
    idempotency_key         TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN (
                                'queued',
                                'processing',
                                'sent_to_provider',
                                'delivered',
                                'failed_retryable',
                                'failed_terminal',
                                'dead_letter',
                                'cancelled'
                            )),
    attempt_count           INTEGER NOT NULL DEFAULT 0,
    max_attempts            INTEGER NOT NULL DEFAULT 3,
    next_attempt_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at         TIMESTAMPTZ DEFAULT NULL,
    last_event_timestamp    TIMESTAMPTZ DEFAULT NULL, -- Monotonic provider event timestamp tracking
    locked_by               TEXT DEFAULT NULL,
    lease_until             TIMESTAMPTZ DEFAULT NULL,
    provider_id             TEXT DEFAULT NULL,
    provider_msg_ref        TEXT DEFAULT NULL,
    error_code              TEXT DEFAULT NULL,
    error_message           TEXT DEFAULT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comms_outbox_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_comms_outbox_queue_dispatch 
    ON public.communication_outbox(status, next_attempt_at) 
    WHERE status IN ('queued', 'failed_retryable');

CREATE INDEX IF NOT EXISTS idx_comms_outbox_tenant ON public.communication_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comms_outbox_provider_msg ON public.communication_outbox(provider_id, provider_msg_ref)
    WHERE provider_id IS NOT NULL AND provider_msg_ref IS NOT NULL;

CREATE TRIGGER update_comms_outbox_modtime
    BEFORE UPDATE ON public.communication_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.communication_outbox ENABLE ROW LEVEL SECURITY;

-- Block direct table access from public, anon, AND authenticated (zero browser PII leakage)
REVOKE ALL ON public.communication_outbox FROM PUBLIC;
REVOKE ALL ON public.communication_outbox FROM anon;
REVOKE ALL ON public.communication_outbox FROM authenticated;

-- Service role has full access by default. No browser client can query raw outbox.

-- =========================================================================
-- 2. Table: public.communication_delivery_callbacks
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.communication_delivery_callbacks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outbox_id           UUID REFERENCES public.communication_outbox(id) ON DELETE CASCADE,
    provider_id         TEXT NOT NULL,
    provider_msg_ref    TEXT NOT NULL,
    event_type          TEXT NOT NULL CHECK (event_type IN ('delivered', 'rejected', 'failed', 'bounced', 'complaint')),
    event_timestamp     TIMESTAMPTZ NOT NULL,
    replay_token        TEXT NOT NULL,
    raw_payload_hash    TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comms_callbacks_replay_unique UNIQUE (provider_id, replay_token)
);

CREATE INDEX IF NOT EXISTS idx_comms_callbacks_outbox ON public.communication_delivery_callbacks(outbox_id);
CREATE INDEX IF NOT EXISTS idx_comms_callbacks_provider_ref ON public.communication_delivery_callbacks(provider_id, provider_msg_ref);

ALTER TABLE public.communication_delivery_callbacks ENABLE ROW LEVEL SECURITY;

-- Block direct table access from public, anon, and authenticated
REVOKE ALL ON public.communication_delivery_callbacks FROM PUBLIC;
REVOKE ALL ON public.communication_delivery_callbacks FROM anon;
REVOKE ALL ON public.communication_delivery_callbacks FROM authenticated;

-- =========================================================================
-- 3. Server-Side RPC: enqueue_communication_outbox
-- Restricted to internal / service-role execution.
-- Enforces immutable request fingerprint idempotency.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enqueue_communication_outbox(
    p_tenant_id         UUID,
    p_channel           TEXT,
    p_recipient_address TEXT,
    p_template_id       TEXT,
    p_payload           JSONB,
    p_idempotency_key   TEXT,
    p_max_attempts      INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_recipient   TEXT;
    v_clean_idempotency TEXT;
    v_fingerprint       TEXT;
    v_existing_rec      RECORD;
    v_new_id            UUID;
BEGIN
    v_clean_recipient := trim(COALESCE(p_recipient_address, ''));
    v_clean_idempotency := trim(COALESCE(p_idempotency_key, ''));

    IF length(v_clean_recipient) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_RECIPIENT');
    END IF;

    IF length(v_clean_idempotency) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY');
    END IF;

    IF p_channel NOT IN ('email', 'sms', 'whatsapp', 'otp') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHANNEL');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    -- Compute SHA-256 fingerprint of immutable request parameters
    v_fingerprint := encode(sha256(
        (p_channel || ':' || v_clean_recipient || ':' || p_template_id || ':' || COALESCE(p_payload::text, '{}'))::bytea
    ), 'hex');

    -- Check if idempotency key already exists for tenant
    SELECT id, request_fingerprint, status INTO v_existing_rec
    FROM public.communication_outbox
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_clean_idempotency;

    IF FOUND THEN
        IF v_existing_rec.request_fingerprint != v_fingerprint THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'IDEMPOTENCY_CONFLICT',
                'message', 'Same idempotency key supplied with differing request payload or parameters'
            );
        END IF;

        -- Same key + identical fingerprint: return existing logical message
        RETURN jsonb_build_object(
            'success', true,
            'outbox_id', v_existing_rec.id,
            'status', v_existing_rec.status,
            'idempotent_duplicate', true
        );
    END IF;

    -- Insert new entry
    INSERT INTO public.communication_outbox (
        tenant_id,
        channel,
        recipient_address,
        template_id,
        payload,
        request_fingerprint,
        idempotency_key,
        max_attempts,
        status
    ) VALUES (
        p_tenant_id,
        p_channel,
        v_clean_recipient,
        p_template_id,
        COALESCE(p_payload, '{}'::jsonb),
        v_fingerprint,
        v_clean_idempotency,
        GREATEST(COALESCE(p_max_attempts, 3), 1),
        'queued'
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', v_new_id,
        'status', 'queued'
    );
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.enqueue_communication_outbox(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_communication_outbox(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_communication_outbox(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER) FROM authenticated;

-- =========================================================================
-- 4. Server-Side RPC: claim_outbox_batch
-- Atomic lease-based worker claim with bounded parameters.
-- Internal / service-role execution only.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
    p_worker_id         TEXT,
    p_batch_size        INTEGER DEFAULT 10,
    p_lease_seconds     INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_worker_id   TEXT;
    v_bounded_batch     INTEGER;
    v_bounded_lease     INTEGER;
    v_lease_until       TIMESTAMPTZ;
    v_claimed_ids       UUID[];
BEGIN
    v_clean_worker_id := trim(COALESCE(p_worker_id, ''));
    IF length(v_clean_worker_id) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WORKER_ID');
    END IF;

    -- Bounded parameters
    v_bounded_batch := LEAST(GREATEST(COALESCE(p_batch_size, 10), 1), 100);
    v_bounded_lease := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 10), 3600);
    v_lease_until := NOW() + (v_bounded_lease || ' seconds')::interval;

    -- Atomically select and lock available messages
    WITH candidates AS (
        SELECT id
        FROM public.communication_outbox
        WHERE (
            status IN ('queued', 'failed_retryable')
            AND next_attempt_at <= NOW()
        ) OR (
            status = 'processing'
            AND lease_until < NOW()  -- Re-claim expired leases
        )
        ORDER BY next_attempt_at ASC
        LIMIT v_bounded_batch
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.communication_outbox co
        SET status = 'processing',
            locked_by = v_clean_worker_id,
            lease_until = v_lease_until,
            last_attempt_at = NOW(),
            attempt_count = co.attempt_count + 1,
            updated_at = NOW()
        FROM candidates c
        WHERE co.id = c.id
        RETURNING co.id
    )
    SELECT array_agg(id) INTO v_claimed_ids FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'claimed_count', COALESCE(array_length(v_claimed_ids, 1), 0),
        'claimed_ids', COALESCE(v_claimed_ids, '{}'::UUID[])
    );
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM authenticated;

-- =========================================================================
-- 5. Server-Side RPC: record_delivery_callback
-- Atomic callback persistence, replay deduplication, mismatch detection,
-- and monotonic out-of-order state progression.
-- Internal / service-role execution only.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.record_delivery_callback(
    p_provider_id       TEXT,
    p_provider_msg_ref  TEXT,
    p_event_type        TEXT,
    p_event_timestamp   TIMESTAMPTZ,
    p_replay_token      TEXT,
    p_raw_payload       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_provider    TEXT;
    v_clean_msg_ref     TEXT;
    v_clean_replay      TEXT;
    v_payload_hash      TEXT;
    v_existing_cb       RECORD;
    v_outbox_rec        RECORD;
    v_inserted          BOOLEAN := false;
BEGIN
    v_clean_provider := trim(COALESCE(p_provider_id, ''));
    v_clean_msg_ref := trim(COALESCE(p_provider_msg_ref, ''));
    v_clean_replay := trim(COALESCE(p_replay_token, ''));

    IF length(v_clean_provider) < 1 OR length(v_clean_msg_ref) < 1 OR length(v_clean_replay) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CALLBACK_IDENTIFIERS');
    END IF;

    IF p_event_type NOT IN ('delivered', 'rejected', 'failed', 'bounced', 'complaint') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_TYPE');
    END IF;

    v_payload_hash := encode(sha256(COALESCE(p_raw_payload, '')::bytea), 'hex');

    -- Replay verification: atomic check on (provider_id, replay_token)
    SELECT id, raw_payload_hash INTO v_existing_cb
    FROM public.communication_delivery_callbacks
    WHERE provider_id = v_clean_provider AND replay_token = v_clean_replay;

    IF FOUND THEN
        IF v_existing_cb.raw_payload_hash != v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'EVENT_ID_PAYLOAD_MISMATCH',
                'message', 'Duplicate event ID received with altered payload digest'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'message', 'CALLBACK_ALREADY_PROCESSED'
        );
    END IF;

    -- Find matching outbox record by compound provider_id + provider_msg_ref
    SELECT * INTO v_outbox_rec
    FROM public.communication_outbox
    WHERE provider_id = v_clean_provider AND provider_msg_ref = v_clean_msg_ref
    FOR UPDATE;

    -- Atomic insertion into callback audit table
    INSERT INTO public.communication_delivery_callbacks (
        outbox_id,
        provider_id,
        provider_msg_ref,
        event_type,
        event_timestamp,
        replay_token,
        raw_payload_hash
    ) VALUES (
        v_outbox_rec.id,
        v_clean_provider,
        v_clean_msg_ref,
        p_event_type,
        p_event_timestamp,
        v_clean_replay,
        v_payload_hash
    )
    ON CONFLICT (provider_id, replay_token) DO NOTHING;

    -- If outbox record found, apply state transition enforcing monotonic timestamp & terminal precedence
    IF v_outbox_rec.id IS NOT NULL THEN
        -- Check if current outbox is already in a terminal state
        IF v_outbox_rec.status IN ('delivered', 'failed_terminal', 'dead_letter', 'cancelled') THEN
            -- Cannot regress terminal state. Update event timestamp if newer, but preserve terminal status.
            IF p_event_timestamp > COALESCE(v_outbox_rec.last_event_timestamp, v_outbox_rec.created_at) THEN
                UPDATE public.communication_outbox
                SET last_event_timestamp = p_event_timestamp, updated_at = NOW()
                WHERE id = v_outbox_rec.id;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'outbox_id', v_outbox_rec.id,
                'status_preserved', v_outbox_rec.status,
                'message', 'TERMINAL_STATE_PRESERVED_AGAINST_REGRESSION'
            );
        END IF;

        -- Out-of-order check: ignore status progression if callback event timestamp is older than last applied event
        IF v_outbox_rec.last_event_timestamp IS NOT NULL AND p_event_timestamp < v_outbox_rec.last_event_timestamp THEN
            RETURN jsonb_build_object(
                'success', true,
                'outbox_id', v_outbox_rec.id,
                'status_preserved', v_outbox_rec.status,
                'message', 'OUT_OF_ORDER_EVENT_IGNORED'
            );
        END IF;

        -- Apply monotonic legal transition
        IF p_event_type = 'delivered' THEN
            UPDATE public.communication_outbox
            SET status = 'delivered',
                last_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_outbox_rec.id;
        ELSIF p_event_type IN ('rejected', 'bounced', 'complaint') THEN
            UPDATE public.communication_outbox
            SET status = 'failed_terminal',
                error_code = p_event_type,
                error_message = 'Terminal delivery failure reported by provider callback',
                last_event_timestamp = p_event_timestamp,
                updated_at = NOW()
            WHERE id = v_outbox_rec.id;
        ELSIF p_event_type = 'failed' THEN
            IF v_outbox_rec.attempt_count >= v_outbox_rec.max_attempts THEN
                UPDATE public.communication_outbox
                SET status = 'dead_letter',
                    error_code = 'MAX_RETRIES_EXCEEDED',
                    last_event_timestamp = p_event_timestamp,
                    updated_at = NOW()
                WHERE id = v_outbox_rec.id;
            ELSE
                UPDATE public.communication_outbox
                SET status = 'failed_retryable',
                    next_attempt_at = NOW() + interval '5 minutes',
                    last_event_timestamp = p_event_timestamp,
                    updated_at = NOW()
                WHERE id = v_outbox_rec.id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', v_outbox_rec.id,
        'status_applied', p_event_type
    );
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.record_delivery_callback(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_delivery_callback(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_delivery_callback(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM authenticated;
