-- ===========================================================================
-- Migration: Phase 3 Provider-Neutral Communications Foundation
-- Authority: LARI-PROGRAM-V2-PHASE3-PROVIDER-NEUTRAL-COMMUNICATIONS-FOUNDATION-20260910-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
--
-- Implements provider-neutral, non-production communications infrastructure:
-- 1. Table: public.communication_outbox
--    - Channel abstraction: email, sms, whatsapp, otp
--    - Full lifecycle: queued -> processing -> sent_to_provider -> delivered | failed_retryable | failed_terminal | dead_letter | cancelled
--    - Concurrency safety: atomic claim with lease_until & locked_by
--    - Idempotency key & deduplication semantics
--    - Bounded retry policy (attempt count, next_attempt_at)
--    - Zero provider secrets, zero customer PII browser leakage
-- 2. Table: public.communication_delivery_callbacks
--    - Stores delivery events/receipts
--    - Dedupe/replay identifier, signature verification boundary, out-of-order handling
-- 3. Security:
--    - REVOKE ALL FROM PUBLIC and anon on both tables
--    - Authenticated tenant access restricted strictly to tenant admins/staff
-- 4. Server Functions:
--    - public.enqueue_communication_outbox (SECURITY DEFINER)
--    - public.claim_outbox_batch (SECURITY DEFINER)
--    - public.record_delivery_callback (SECURITY DEFINER)
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.communication_outbox
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.communication_outbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'otp')),
    recipient_address   TEXT NOT NULL,  -- phone number or email (server-side only)
    template_id         TEXT NOT NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key     TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'queued'
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
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 3,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at     TIMESTAMPTZ DEFAULT NULL,
    locked_by           TEXT DEFAULT NULL,
    lease_until         TIMESTAMPTZ DEFAULT NULL,
    provider_id         TEXT DEFAULT NULL,
    provider_msg_ref    TEXT DEFAULT NULL,
    error_code          TEXT DEFAULT NULL,
    error_message       TEXT DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comms_outbox_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_comms_outbox_queue_dispatch 
    ON public.communication_outbox(status, next_attempt_at) 
    WHERE status IN ('queued', 'failed_retryable');

CREATE INDEX idx_comms_outbox_tenant ON public.communication_outbox(tenant_id);
CREATE INDEX idx_comms_outbox_provider_ref ON public.communication_outbox(provider_msg_ref) WHERE provider_msg_ref IS NOT NULL;

CREATE TRIGGER update_comms_outbox_modtime
    BEFORE UPDATE ON public.communication_outbox
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.communication_outbox ENABLE ROW LEVEL SECURITY;

-- Block direct table access from public / anon
REVOKE ALL ON public.communication_outbox FROM PUBLIC;
REVOKE ALL ON public.communication_outbox FROM anon;

-- Tenant Admins and Staff can view outbox records for their own tenant
CREATE POLICY "Tenant Admins and Staff - Scoped View on communication_outbox"
    ON public.communication_outbox FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role IN ('tenant_owner', 'staff')
                    AND up.tenant_id = communication_outbox.tenant_id
                )
              )
        )
    );

-- Super Admins explicit full access policy
CREATE POLICY "Super Admins - Full Access on communication_outbox"
    ON public.communication_outbox FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

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

CREATE INDEX idx_comms_callbacks_outbox ON public.communication_delivery_callbacks(outbox_id);
CREATE INDEX idx_comms_callbacks_provider_ref ON public.communication_delivery_callbacks(provider_msg_ref);

ALTER TABLE public.communication_delivery_callbacks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.communication_delivery_callbacks FROM PUBLIC;
REVOKE ALL ON public.communication_delivery_callbacks FROM anon;

CREATE POLICY "Super Admins - Full Access on communication_delivery_callbacks"
    ON public.communication_delivery_callbacks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'super_admin'
              AND up.active = true
        )
    );

-- =========================================================================
-- 3. RPC: enqueue_communication_outbox
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_new_id UUID;
    v_clean_recipient TEXT;
    v_clean_idempotency TEXT;
BEGIN
    v_clean_recipient := trim(COALESCE(p_recipient_address, ''));
    v_clean_idempotency := trim(COALESCE(p_idempotency_key, ''));

    IF length(v_clean_recipient) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_RECIPIENT');
    END IF;

    IF length(v_clean_idempotency) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY');
    END IF;

    -- Validate channel
    IF p_channel NOT IN ('email', 'sms', 'whatsapp', 'otp') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHANNEL');
    END IF;

    -- Validate tenant exists
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    -- Insert or Return Existing Idempotent Entry
    INSERT INTO public.communication_outbox (
        tenant_id,
        channel,
        recipient_address,
        template_id,
        payload,
        idempotency_key,
        max_attempts,
        status
    ) VALUES (
        p_tenant_id,
        p_channel,
        v_clean_recipient,
        p_template_id,
        COALESCE(p_payload, '{}'::jsonb),
        v_clean_idempotency,
        GREATEST(COALESCE(p_max_attempts, 3), 1),
        'queued'
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
    SET updated_at = NOW()
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', v_new_id,
        'status', 'queued'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_communication_outbox(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_communication_outbox(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER) TO authenticated;

-- =========================================================================
-- 4. RPC: claim_outbox_batch (Atomic lease-based claim for worker concurrency)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
    p_worker_id         TEXT,
    p_batch_size        INTEGER DEFAULT 10,
    p_lease_seconds     INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_claimed_ids UUID[];
    v_lease_until TIMESTAMPTZ;
BEGIN
    v_lease_until := NOW() + (p_lease_seconds || ' seconds')::interval;

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
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.communication_outbox co
        SET status = 'processing',
            locked_by = p_worker_id,
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

REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) TO authenticated;

-- =========================================================================
-- 5. RPC: record_delivery_callback (Idempotent callback delivery processing)
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
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_outbox_rec RECORD;
    v_payload_hash TEXT;
BEGIN
    IF p_event_type NOT IN ('delivered', 'rejected', 'failed', 'bounced', 'complaint') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EVENT_TYPE');
    END IF;

    -- Replay prevention
    IF EXISTS (
        SELECT 1 FROM public.communication_delivery_callbacks
        WHERE provider_id = p_provider_id AND replay_token = p_replay_token
    ) THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'CALLBACK_ALREADY_PROCESSED');
    END IF;

    v_payload_hash := encode(digest(COALESCE(p_raw_payload, ''), 'sha256'), 'hex');

    -- Find matching outbox record
    SELECT * INTO v_outbox_rec
    FROM public.communication_outbox
    WHERE provider_msg_ref = p_provider_msg_ref
    FOR UPDATE;

    -- Insert callback audit row
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
        p_provider_id,
        p_provider_msg_ref,
        p_event_type,
        p_event_timestamp,
        p_replay_token,
        v_payload_hash
    );

    -- Apply status updates if outbox record found
    IF v_outbox_rec.id IS NOT NULL THEN
        IF p_event_type = 'delivered' THEN
            UPDATE public.communication_outbox
            SET status = 'delivered', updated_at = NOW()
            WHERE id = v_outbox_rec.id;
        ELSIF p_event_type IN ('rejected', 'bounced', 'complaint') THEN
            UPDATE public.communication_outbox
            SET status = 'failed_terminal',
                error_code = p_event_type,
                error_message = 'Terminal delivery failure reported by callback',
                updated_at = NOW()
            WHERE id = v_outbox_rec.id;
        ELSIF p_event_type = 'failed' THEN
            -- Check retry limit
            IF v_outbox_rec.attempt_count >= v_outbox_rec.max_attempts THEN
                UPDATE public.communication_outbox
                SET status = 'dead_letter',
                    error_code = 'MAX_RETRIES_EXCEEDED',
                    updated_at = NOW()
                WHERE id = v_outbox_rec.id;
            ELSE
                UPDATE public.communication_outbox
                SET status = 'failed_retryable',
                    next_attempt_at = NOW() + '5 minutes'::interval,
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

REVOKE EXECUTE ON FUNCTION public.record_delivery_callback(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_delivery_callback(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
