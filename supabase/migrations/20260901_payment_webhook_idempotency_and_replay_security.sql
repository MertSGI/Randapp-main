-- ==============================================================================
-- LARI PILOT 3: CANDIDATE MIGRATION (ADIM-003)
-- File: 20260901_payment_webhook_idempotency_and_replay_security.sql
-- Purpose: Database-level Unique Constraints, Idempotency Table, and Transactional RPCs
-- Target: Webhook Idempotency, Concurrency Race Protection, Replay Safety, and Out-of-Order Transition Ordering
-- Notice: CANDIDATE ONLY. Do NOT execute on live/remote production databases automatically.
-- ==============================================================================

-- 1. Subscriptions Table Extension for Out-of-Order Webhook Event Monotonic Ordering and Pricing Contract
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS price NUMERIC,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'TRY';

-- 2. Database-Level Unique Constraints and Columns on Payments Table
-- Extend payments table with provider_payment_id to distinguish physical charge uniqueness
-- from delivery event idempotency.
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'iyzico',
ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- SECURITY: No automatic legacy identity backfill from JSON metadata.
-- Historic metadata fields may have been taken from unsigned provider payloads;
-- promoting them to provider_payment_id can poison physical-charge uniqueness.
-- Leave unknown legacy IDs NULL until separately authenticated provider-ledger
-- reconciliation establishes the real physical charge identity. In the interim,
-- existing provider_event_id comparisons protect exact legacy event replays.
-- This migration is SOURCE-ONLY; do not apply to production automatically.

-- Ensure payments amount supports fractional monetary values (NUMERIC(10,2))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN amount TYPE NUMERIC(10,2);
  END IF;
END $$;

-- Invariant charge uniqueness: guarantees that the same provider payment/transaction ID
-- can never create more than one payment row, even if delivered via distinct webhook events
-- (e.g. checkoutform.auth followed by payment.success with different event IDs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id 
ON public.payments (provider, provider_payment_id) 
WHERE provider_payment_id IS NOT NULL;

-- Delivery event uniqueness: guarantees no duplicate rows for the same event ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_event_id 
ON public.payments (provider, provider_event_id) 
WHERE provider_event_id IS NOT NULL;

-- An authenticated HPP checkout identity belongs to exactly one subscription.
-- Existing conflicting rows deliberately make migration fail rather than silently
-- choosing an arbitrary tenant; resolve duplicates offline before application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_provider_token
ON public.subscriptions (provider_token)
WHERE provider_token IS NOT NULL AND BTRIM(provider_token) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_provider_session_id
ON public.subscriptions (provider_session_id)
WHERE provider_session_id IS NOT NULL AND BTRIM(provider_session_id) <> '';

-- 3. Dedicated Webhook Idempotency Table
-- Records incoming provider events atomically to prevent concurrent race conditions
-- and sequential replays across distributed edge instances.
CREATE TABLE IF NOT EXISTS public.payment_webhook_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'iyzico',
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    subscription_reference_code TEXT,
    tenant_id TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'duplicate_suppressed')),
    claim_attempt_id UUID DEFAULT gen_random_uuid(),
    payload_fingerprint TEXT,
    event_timestamp TIMESTAMPTZ,
    response_payload JSONB DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
    CONSTRAINT uq_payment_webhook_provider_event UNIQUE (provider, provider_event_id)
);

-- Performance indices for idempotency lookups and TTL purging
CREATE INDEX IF NOT EXISTS idx_payment_webhook_idempotency_lookup
ON public.payment_webhook_idempotency (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_idempotency_tenant
ON public.payment_webhook_idempotency (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_idempotency_expires
ON public.payment_webhook_idempotency (expires_at);

-- Row Level Security for Webhook Idempotency: Exclusively restricted to service_role
ALTER TABLE public.payment_webhook_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to payment_webhook_idempotency" ON public.payment_webhook_idempotency;
CREATE POLICY "Service role full access to payment_webhook_idempotency"
ON public.payment_webhook_idempotency
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Transactional RPC for Atomic Webhook Event Reservation (Claim)
-- Resolves race conditions deterministically via row locking and unique_violation trapping.
-- Reserves event as 'processing'. Handles timeout reclamation for stuck locks and retry on failure.
CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_subscription_reference_code TEXT,
    p_tenant_id TEXT,
    p_payload_fingerprint TEXT DEFAULT NULL,
    p_timeout_seconds INTEGER DEFAULT 60,
    p_event_timestamp TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.payment_webhook_idempotency%ROWTYPE;
    v_now TIMESTAMPTZ := now();
    v_new_attempt_id UUID := gen_random_uuid();
BEGIN
    -- Check if record already exists with row-level lock
    SELECT * INTO v_row
    FROM public.payment_webhook_idempotency
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id
    FOR UPDATE;

    IF FOUND THEN
        -- PAYLOAD FINGERPRINT COLLISION CHECK:
        -- An existing provider event ID with a different payload fingerprint is an unrecoverable collision/conflict!
        IF p_payload_fingerprint IS NOT NULL AND v_row.payload_fingerprint IS NOT NULL AND v_row.payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
            RETURN jsonb_build_object(
                'can_proceed', false,
                'is_duplicate', false,
                'status', 'conflict',
                'error', 'PAYLOAD_FINGERPRINT_MISMATCH',
                'existing_id', v_row.id
            );
        END IF;

        -- Case A: Event was already fully and successfully processed
        IF v_row.status = 'processed' THEN
            RETURN jsonb_build_object(
                'can_proceed', false,
                'is_duplicate', true,
                'status', 'processed',
                'existing_id', v_row.id,
                'claim_attempt_id', v_row.claim_attempt_id,
                'response_payload', v_row.response_payload
            );
        END IF;

        -- Case B: Prior attempt failed - permit safe idempotent retry
        -- Preserves original payload_fingerprint immutably and issues a new claim_attempt_id
        IF v_row.status = 'failed' THEN
            UPDATE public.payment_webhook_idempotency
            SET status = 'processing',
                claim_attempt_id = v_new_attempt_id,
                event_type = p_event_type,
                subscription_reference_code = COALESCE(p_subscription_reference_code, v_row.subscription_reference_code),
                tenant_id = COALESCE(p_tenant_id, v_row.tenant_id),
                payload_fingerprint = COALESCE(v_row.payload_fingerprint, p_payload_fingerprint),
                event_timestamp = COALESCE(p_event_timestamp, v_row.event_timestamp),
                updated_at = v_now
            WHERE id = v_row.id;

            RETURN jsonb_build_object(
                'can_proceed', true,
                'is_duplicate', false,
                'status', 'reclaimed_after_failure',
                'claim_attempt_id', v_new_attempt_id,
                'existing_id', v_row.id
            );
        END IF;

        -- Case C: Currently in 'processing' status
        IF v_row.status = 'processing' THEN
            -- Check if lock is stuck beyond the allowed timeout
            IF v_row.updated_at < (v_now - (p_timeout_seconds || ' seconds')::interval) THEN
                UPDATE public.payment_webhook_idempotency
                SET updated_at = v_now,
                    claim_attempt_id = v_new_attempt_id,
                    event_timestamp = COALESCE(p_event_timestamp, v_row.event_timestamp)
                WHERE id = v_row.id;

                RETURN jsonb_build_object(
                    'can_proceed', true,
                    'is_duplicate', false,
                    'status', 'reclaimed_stuck_lock',
                    'claim_attempt_id', v_new_attempt_id,
                    'existing_id', v_row.id
                );
            ELSE
                -- Actively processing by concurrent worker
                RETURN jsonb_build_object(
                    'can_proceed', false,
                    'is_duplicate', true,
                    'status', 'processing',
                    'existing_id', v_row.id
                );
            END IF;
        END IF;

        -- Any other status (e.g. duplicate_suppressed)
        RETURN jsonb_build_object(
            'can_proceed', false,
            'is_duplicate', true,
            'status', v_row.status,
            'existing_id', v_row.id,
            'response_payload', v_row.response_payload
        );
    END IF;

    -- Case D: New event - Insert atomic reservation with status = 'processing'
    INSERT INTO public.payment_webhook_idempotency (
        provider,
        provider_event_id,
        event_type,
        subscription_reference_code,
        tenant_id,
        status,
        claim_attempt_id,
        payload_fingerprint,
        event_timestamp,
        created_at,
        updated_at
    ) VALUES (
        p_provider,
        p_provider_event_id,
        p_event_type,
        p_subscription_reference_code,
        p_tenant_id,
        'processing',
        v_new_attempt_id,
        p_payload_fingerprint,
        p_event_timestamp,
        v_now,
        v_now
    )
    RETURNING id INTO v_row.id;

    RETURN jsonb_build_object(
        'can_proceed', true,
        'is_duplicate', false,
        'status', 'processing',
        'claim_attempt_id', v_new_attempt_id,
        'id', v_row.id
    );

EXCEPTION WHEN unique_violation THEN
    -- Trapped concurrent insertion race: Lock row FOR UPDATE to ensure single-owner evaluation
    SELECT * INTO v_row
    FROM public.payment_webhook_idempotency
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id
    FOR UPDATE;

    -- Fail-closed guard: if collision was on an unrelated constraint/column, re-raise exception
    IF v_row.id IS NULL THEN
        RAISE;
    END IF;

    -- PAYLOAD FINGERPRINT COLLISION CHECK IN CONCURRENT RACE:
    IF p_payload_fingerprint IS NOT NULL AND v_row.payload_fingerprint IS NOT NULL AND v_row.payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
        RETURN jsonb_build_object(
            'can_proceed', false,
            'is_duplicate', false,
            'status', 'conflict',
            'error', 'PAYLOAD_FINGERPRINT_MISMATCH',
            'existing_id', v_row.id
        );
    END IF;

    IF v_row.status = 'processed' OR v_row.status = 'duplicate_suppressed' THEN
        RETURN jsonb_build_object(
            'can_proceed', false,
            'is_duplicate', true,
            'status', v_row.status,
            'existing_id', v_row.id,
            'claim_attempt_id', v_row.claim_attempt_id,
            'response_payload', v_row.response_payload
        );
    ELSIF v_row.status = 'failed' THEN
        -- Atomically update only if status is still 'failed' under lock
        UPDATE public.payment_webhook_idempotency
        SET status = 'processing',
            claim_attempt_id = v_new_attempt_id,
            tenant_id = COALESCE(p_tenant_id, v_row.tenant_id),
            payload_fingerprint = COALESCE(v_row.payload_fingerprint, p_payload_fingerprint),
            event_timestamp = COALESCE(p_event_timestamp, v_row.event_timestamp),
            updated_at = v_now
        WHERE id = v_row.id AND status = 'failed'
        RETURNING id INTO v_row.id;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'can_proceed', true,
                'is_duplicate', false,
                'status', 'reclaimed_after_failure',
                'claim_attempt_id', v_new_attempt_id,
                'existing_id', v_row.id
            );
        ELSE
            -- Lost race to another concurrent worker who already reclaimed it
            RETURN jsonb_build_object(
                'can_proceed', false,
                'is_duplicate', true,
                'status', 'processing',
                'existing_id', v_row.id
            );
        END IF;
    ELSIF v_row.status = 'processing' AND v_row.updated_at < (v_now - (p_timeout_seconds || ' seconds')::interval) THEN
        -- Stuck lock reclaim under FOR UPDATE
        UPDATE public.payment_webhook_idempotency
        SET updated_at = v_now,
            claim_attempt_id = v_new_attempt_id,
            event_timestamp = COALESCE(p_event_timestamp, v_row.event_timestamp)
        WHERE id = v_row.id AND status = 'processing'
        RETURNING id INTO v_row.id;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'can_proceed', true,
                'is_duplicate', false,
                'status', 'reclaimed_stuck_lock',
                'claim_attempt_id', v_new_attempt_id,
                'existing_id', v_row.id
            );
        ELSE
            RETURN jsonb_build_object(
                'can_proceed', false,
                'is_duplicate', true,
                'status', 'processing',
                'existing_id', v_row.id
            );
        END IF;
    ELSE
        RETURN jsonb_build_object(
            'can_proceed', false,
            'is_duplicate', true,
            'status', COALESCE(v_row.status, 'processing'),
            'existing_id', v_row.id,
            'response_payload', v_row.response_payload
        );
    END IF;
END;
$$;

-- Backwards compatibility wrapper for record_payment_webhook_event
CREATE OR REPLACE FUNCTION public.record_payment_webhook_event(
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_subscription_reference_code TEXT,
    p_tenant_id TEXT,
    p_response_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.claim_payment_webhook_event(
        p_provider => p_provider,
        p_provider_event_id => p_provider_event_id,
        p_event_type => p_event_type,
        p_subscription_reference_code => p_subscription_reference_code,
        p_tenant_id => p_tenant_id,
        p_payload_fingerprint => NULL,
        p_timeout_seconds => 60
    );
END;
$$;

-- 5. Transactional RPC for Finalizing Webhook Event State
-- Updates status to 'processed' (success) or 'failed' (retryable error)
CREATE OR REPLACE FUNCTION public.finalize_payment_webhook_event(
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_status TEXT,
    p_response_payload JSONB DEFAULT '{}'::jsonb,
    p_claim_attempt_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_existing public.payment_webhook_idempotency%ROWTYPE;
BEGIN
    IF p_status NOT IN ('processed', 'failed', 'duplicate_suppressed') THEN
        RAISE EXCEPTION 'Invalid finalization status: %', p_status;
    END IF;

    SELECT * INTO v_existing
    FROM public.payment_webhook_idempotency
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'finalized', false,
            'reason', 'EVENT_NOT_FOUND'
        );
    END IF;

    -- CRITICAL LEASE FENCING INVARIANT:
    -- Terminal status ('processed', 'duplicate_suppressed') CAN NEVER be demoted back to 'failed'!
    IF v_existing.status IN ('processed', 'duplicate_suppressed') THEN
        RETURN jsonb_build_object(
            'finalized', false,
            'reason', 'ALREADY_TERMINAL',
            'status', v_existing.status
        );
    END IF;

    -- MANDATORY LEASE FENCING CHECK:
    -- Every finalizing call MUST provide a valid claim_attempt_id,
    -- and the existing row MUST have a matching claim_attempt_id.
    IF p_claim_attempt_id IS NULL OR v_existing.claim_attempt_id IS DISTINCT FROM p_claim_attempt_id THEN
        RETURN jsonb_build_object(
            'finalized', false,
            'reason', 'LEASE_FENCING_REJECTED',
            'status', v_existing.status
        );
    END IF;

    -- Input state restriction: only actively processing records can be finalized
    IF v_existing.status != 'processing' THEN
        RETURN jsonb_build_object(
            'finalized', false,
            'reason', 'NOT_IN_PROCESSING_STATE',
            'status', v_existing.status
        );
    END IF;

    UPDATE public.payment_webhook_idempotency
    SET status = p_status,
        response_payload = p_response_payload,
        processed_at = CASE WHEN p_status = 'processed' THEN now() ELSE processed_at END,
        updated_at = now()
    WHERE id = v_existing.id AND status = 'processing' AND claim_attempt_id = p_claim_attempt_id
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'finalized', false,
            'reason', 'NO_ROWS_UPDATED',
            'status', v_existing.status
        );
    END IF;

    RETURN jsonb_build_object(
        'finalized', true,
        'id', v_updated_id,
        'status', p_status
    );
END;
$$;

-- 6. Transactional RPC for Idempotent Payment Ledger Entry
-- Guarantees atomic insertion into public.payments with duplicate prevention
CREATE OR REPLACE FUNCTION public.record_payment_ledger_entry_idempotent(
    p_tenant_id TEXT,
    p_subscription_id UUID,
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_provider_payment_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_id UUID;
    v_tenant_uuid UUID;
    v_provider_payment_id TEXT;
BEGIN
    -- Only explicit canonical payment identity or the trusted event identity.
    -- Never derive payment identity from caller-provided JSON metadata.
    v_provider_payment_id := COALESCE(p_provider_payment_id, p_provider_event_id);

    -- Check duplicate using canonical payment ID, exact event ID, or legacy event ID (NULL physical ID).
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE provider = p_provider AND (
        (v_provider_payment_id IS NOT NULL AND provider_payment_id = v_provider_payment_id)
        OR provider_event_id = p_provider_event_id
        OR (v_provider_payment_id IS NOT NULL AND provider_payment_id IS NULL AND provider_event_id = v_provider_payment_id)
    );

    IF FOUND THEN
        IF v_provider_payment_id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = v_provider_payment_id
            WHERE id = v_payment_id AND provider_payment_id IS NULL;
        END IF;

        RETURN jsonb_build_object(
            'inserted', false,
            'duplicate', true,
            'payment_id', v_payment_id
        );
    END IF;

    -- Safely parse tenant uuid if provided
    IF p_tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_tenant_uuid := p_tenant_id::uuid;
    ELSE
        v_tenant_uuid := NULL;
    END IF;

    -- Insert payment record
    INSERT INTO public.payments (
        tenant_id,
        subscription_id,
        provider,
        provider_event_id,
        provider_payment_id,
        amount,
        currency,
        status,
        paid_at,
        metadata
    ) VALUES (
        v_tenant_uuid,
        p_subscription_id,
        p_provider,
        p_provider_event_id,
        v_provider_payment_id,
        ROUND(COALESCE(p_amount, 0), 2),
        COALESCE(p_currency, 'TRY'),
        'paid',
        now(),
        p_metadata
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'inserted', true,
        'duplicate', false,
        'payment_id', v_payment_id
    );
EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE provider = p_provider AND (
        (v_provider_payment_id IS NOT NULL AND provider_payment_id = v_provider_payment_id)
        OR provider_event_id = p_provider_event_id
        OR (v_provider_payment_id IS NOT NULL AND provider_payment_id IS NULL AND provider_event_id = v_provider_payment_id)
    );

    -- Fail-closed guard: if collision was on an unrelated constraint, re-raise to rollback transaction
    IF v_payment_id IS NULL THEN
        RAISE;
    END IF;

    IF v_provider_payment_id IS NOT NULL THEN
        UPDATE public.payments
        SET provider_payment_id = v_provider_payment_id
        WHERE id = v_payment_id AND provider_payment_id IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'inserted', false,
        'duplicate', true,
        'payment_id', v_payment_id
    );
END;
$$;

-- 7. All-in-One Transactional RPC: execute_payment_webhook_transaction
-- Atomically executes subscription transition, payment ledger insertion, audit logging,
-- and idempotency finalization in a single database transaction. Rolls back completely on failure.
CREATE OR REPLACE FUNCTION public.execute_payment_webhook_transaction(
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_event_type TEXT,
    p_subscription_reference_code TEXT,
    p_tenant_id TEXT,
    p_target_status TEXT,
    p_has_payment_proof BOOLEAN,
    p_amount NUMERIC,
    p_currency TEXT,
    p_event_timestamp TIMESTAMPTZ DEFAULT NULL,
    p_payment_metadata JSONB DEFAULT '{}'::jsonb,
    p_audit_details JSONB DEFAULT '{}'::jsonb,
    p_claim_attempt_id UUID DEFAULT NULL,
    p_provider_payment_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_idem public.payment_webhook_idempotency%ROWTYPE;
    v_sub public.subscriptions%ROWTYPE;
    v_sub_id UUID;
    v_payment_id UUID := NULL;
    v_payment_recorded BOOLEAN := false;
    v_is_duplicate_payment BOOLEAN := false;
    v_transition_allowed BOOLEAN := true;
    v_derived_target_status TEXT;
    v_final_status TEXT;
    v_now TIMESTAMPTZ := now();
    v_tenant_uuid UUID;
    v_provider_payment_id TEXT;
BEGIN
    -- Authoritative identity originates in the verified provider event at the
    -- service boundary. Metadata (including iyziPaymentId) is NOT identity authority.
    v_provider_payment_id := COALESCE(p_provider_payment_id, p_provider_event_id);
    -- Protect monotonic watermark from forward-jump attacks by rejecting future timestamps (> 5 min clock skew)
    IF p_event_timestamp IS NOT NULL AND p_event_timestamp > (v_now + INTERVAL '5 minutes') THEN
        p_event_timestamp := NULL;
    END IF;

    -- 1. Ensure idempotency record exists and lock row
    SELECT * INTO v_idem
    FROM public.payment_webhook_idempotency
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'RESERVATION_NOT_FOUND',
            'retryable', true
        );
    END IF;

    IF v_idem.status = 'processed' OR v_idem.status = 'duplicate_suppressed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'idempotent', true,
            'status', COALESCE(v_idem.response_payload->>'status', v_idem.status),
            'payment_recorded', false,
            'response_payload', v_idem.response_payload
        );
    END IF;

    -- MANDATORY LEASE STATUS CHECK:
    -- Transaction execution strictly requires the record to be in active 'processing' state.
    -- If a record is in 'failed' or any other non-processing state, it must be reclaimed first before execution.
    IF v_idem.status <> 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NOT_IN_PROCESSING_STATE',
            'retryable', false
        );
    END IF;

    -- MANDATORY LEASE FENCING CHECK:
    -- Transaction execution strictly requires a valid non-null claim_attempt_id matching the active lease holder
    IF p_claim_attempt_id IS NULL OR v_idem.claim_attempt_id IS DISTINCT FROM p_claim_attempt_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'LEASE_LOST_TO_ANOTHER_WORKER',
            'retryable', false
        );
    END IF;

    -- 2. Lock subscription row
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE provider_subscription_id = p_subscription_reference_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription not found for reference: %', p_subscription_reference_code;
    END IF;

    v_sub_id := v_sub.id;

    -- HPP TRUST BOUNDARY: signed checkout IDs are supplied by the verified
    -- Edge service_role caller via p_payment_metadata. Recheck both exact,
    -- type-specific namespaces on this FOR UPDATE locked subscription row.
    -- Never compare a token against provider_subscription_id/session_id, or
    -- a conversation ID against provider_subscription_id/provider_token.
    IF p_event_type = 'checkoutform.auth' THEN
        IF (
            (NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutToken'), '') IS NULL
             AND NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutConversationId'), '') IS NULL)
            OR (
                NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutToken'), '') IS NOT NULL
                AND v_sub.provider_token IS DISTINCT FROM NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutToken'), '')
            )
            OR (
                NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutConversationId'), '') IS NOT NULL
                AND v_sub.provider_session_id IS DISTINCT FROM NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutConversationId'), '')
            )
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNBOUND_CHECKOUT_SESSION',
                'retryable', false
            );
        END IF;
    END IF;

    -- Even if the uniqueness indexes are not yet present on an older schema,
    -- never allow a signed HPP identity shared by multiple subscription rows.
    -- The locked row and each signed identifier must resolve to exactly one row.
    IF p_event_type = 'checkoutform.auth' THEN
        IF NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutToken'), '') IS NOT NULL
           AND (SELECT COUNT(*) FROM public.subscriptions
                WHERE provider_token = BTRIM(p_payment_metadata->>'verifiedCheckoutToken')) <> 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'AMBIGUOUS_CHECKOUT_SESSION', 'retryable', false);
        END IF;
        IF NULLIF(BTRIM(p_payment_metadata->>'verifiedCheckoutConversationId'), '') IS NOT NULL
           AND (SELECT COUNT(*) FROM public.subscriptions
                WHERE provider_session_id = BTRIM(p_payment_metadata->>'verifiedCheckoutConversationId')) <> 1 THEN
            RETURN jsonb_build_object('success', false, 'error', 'AMBIGUOUS_CHECKOUT_SESSION', 'retryable', false);
        END IF;
    END IF;

    -- ATOMIC TENANT VALIDATION UNDER FOR UPDATE ROW LOCK:
    -- Verify tenant binding directly against locked subscription to eliminate TOCTOU race conditions
    -- where tenant ownership could change between initial un-locked read and atomic execution.
    IF p_tenant_id IS NOT NULL AND v_sub.tenant_id IS NOT NULL THEN
        IF p_tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_tenant_uuid := p_tenant_id::uuid;
            IF v_sub.tenant_id <> v_tenant_uuid THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'TENANT_MISMATCH',
                    'retryable', false,
                    'current_subscription_status', v_sub.status,
                    'subscription_id', v_sub.id,
                    'tenant_id', v_sub.tenant_id
                );
            END IF;
        ELSIF v_sub.tenant_id::text <> p_tenant_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'TENANT_MISMATCH',
                'retryable', false,
                'current_subscription_status', v_sub.status,
                'subscription_id', v_sub.id,
                'tenant_id', v_sub.tenant_id
            );
        END IF;
    END IF;

    -- MANDATORY FINANCIAL CONTRACT CURRENCY VALIDATION (Controller Directive 2):
    -- When webhook brings payment proof, the locked subscription row MUST have a valid non-empty currency contract.
    -- If v_sub.currency is NULL or empty, atomically reject payment recording fail-closed!
    IF p_has_payment_proof IS TRUE AND (v_sub.currency IS NULL OR TRIM(v_sub.currency) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_SUBSCRIPTION_CURRENCY',
            -- Missing contract is temporary: retain verified event for provider retry.
            'retryable', true,
            'current_subscription_status', v_sub.status,
            'subscription_id', v_sub.id,
            'tenant_id', v_sub.tenant_id
        );
    END IF;

    -- Payment proof must use the amount of the subscription row locked above.
    -- Never use the handler's pre-lock p_amount as fallback after a concurrent
    -- subscription price change: the RPC would otherwise record a stale charge.
    IF p_has_payment_proof IS TRUE AND (v_sub.price IS NULL OR v_sub.price <= 0) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_SUBSCRIPTION_PRICE',
            -- Missing contract is temporary: retain verified event for provider retry.
            'retryable', true,
            'current_subscription_status', v_sub.status,
            'subscription_id', v_sub.id,
            'tenant_id', v_sub.tenant_id
        );
    END IF;

    -- 0. CRITICAL PHYSICAL PAYMENT UNIQUENESS & REPLAY PREVENTION
    -- Determine whether this physical charge (provider_payment_id) was ALREADY consumed in public.payments.
    -- This MUST be checked BEFORE determining or applying any subscription state transition!
    -- An already-consumed duplicate charge cannot provide fresh payment proof and CANNOT
    -- resurrect or activate cancelled, expired, past_due, or pending subscriptions!
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE provider = p_provider AND (
        (v_provider_payment_id IS NOT NULL AND provider_payment_id = v_provider_payment_id)
        OR provider_event_id = p_provider_event_id
        OR (v_provider_payment_id IS NOT NULL AND provider_payment_id IS NULL AND provider_event_id = v_provider_payment_id)
    );

    -- DETERMINISTIC EVENT-TYPE STATE DERIVATION UNDER ROW LOCK:
    -- Target status is derived strictly and deterministically from p_event_type, neutralizing status injection
    IF p_event_type IN ('subscription.order.success', 'payment.success', 'checkoutform.auth') THEN
        v_derived_target_status := 'active';
    ELSIF p_event_type IN ('subscription.order.failure', 'payment.failure', 'subscription.failed', 'subscription.past_due') THEN
        v_derived_target_status := 'past_due';
    ELSIF p_event_type IN ('subscription.cancelled', 'subscription.expired') THEN
        v_derived_target_status := 'cancelled';
    ELSIF p_event_type = 'subscription.created' THEN
        v_derived_target_status := 'pending';
    ELSIF p_event_type IN ('subscription.active', 'subscription.renewed') THEN
        v_derived_target_status := 'active';
    ELSE
        v_derived_target_status := COALESCE(p_target_status, v_sub.status);
    END IF;

    IF FOUND THEN
        IF v_provider_payment_id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = v_provider_payment_id
            WHERE id = v_payment_id AND provider_payment_id IS NULL;
        END IF;

        v_is_duplicate_payment := true;
        v_payment_recorded := false;
        -- Suppress transition to prevent duplicate charge from resurrecting/clearing subscription
        v_transition_allowed := false;
        v_final_status := v_sub.status;
    ELSE
        v_is_duplicate_payment := false;
        v_final_status := v_derived_target_status;
    END IF;

    -- 1. Fail-closed security rule: payment collection events strictly require verified payment proof
    IF v_final_status = 'active' THEN
        IF p_event_type IN ('payment.success', 'subscription.order.success', 'checkoutform.auth') THEN
            IF p_has_payment_proof IS NOT TRUE THEN
                v_final_status := COALESCE(v_sub.status, 'pending');
                IF v_final_status = 'active' THEN
                    v_final_status := 'pending';
                END IF;
            END IF;
        END IF;
    END IF;

    -- 2. Debt recovery protection: A past_due subscription can NEVER transition to active:
    --    a) Without verified payment proof
    --    b) Without an explicit, valid non-null provider timestamp (NULL timestamp fail-closed)
    --    c) Without a strictly monotonic provider timestamp newer than the existing watermark,
    --       UNLESS at equal timestamp (p_event_timestamp = last_webhook_event_at) with verified payment proof (tie-breaker)
    IF v_sub.status = 'past_due' AND v_final_status = 'active' THEN
        IF p_has_payment_proof IS NOT TRUE THEN
            v_transition_allowed := false;
            v_final_status := 'past_due';
        ELSIF v_sub.last_webhook_event_at IS NOT NULL AND (p_event_timestamp IS NULL OR p_event_timestamp < v_sub.last_webhook_event_at) THEN
            -- Strictly stale out-of-order event cannot clear past_due debt!
            v_transition_allowed := false;
            v_final_status := 'past_due';
        -- When p_event_timestamp = v_sub.last_webhook_event_at AND p_has_payment_proof IS TRUE:
        -- Tie-breaker: legitimate payment proof at equal timestamp successfully clears past_due debt!
        END IF;
    END IF;

    -- 3. Terminal state protection: Cancelled or expired subscriptions cannot be regressed to pending or past_due
    IF (v_sub.status = 'cancelled' OR v_sub.status = 'expired') AND (v_final_status = 'pending' OR v_final_status = 'past_due') THEN
        v_transition_allowed := false;
        v_final_status := v_sub.status;
    END IF;

    -- 4. Terminal state reactivation protection:
    -- Cancelled or expired subscriptions can NEVER be reactivated:
    --   a) Without verified payment proof
    --   b) Without an explicit, valid non-null provider timestamp (NULL timestamp fail-closed)
    --   c) Without a strictly monotonic provider timestamp newer than the terminal watermark
    IF (v_sub.status = 'cancelled' OR v_sub.status = 'expired') AND v_final_status = 'active' THEN
        IF p_has_payment_proof IS NOT TRUE THEN
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSIF p_event_timestamp IS NULL THEN
            -- Unsequenced / timestamp-less events can NEVER resurrect terminal state (fail-closed)
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSIF v_sub.last_webhook_event_at IS NOT NULL AND p_event_timestamp <= v_sub.last_webhook_event_at THEN
            -- Out-of-order replay cannot resurrect terminal state!
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        END IF;
    END IF;

    -- 4. CRITICAL INTERLEAVING PROTECTION:
    -- Active, trialing, or past_due subscriptions cannot be regressed to pending by concurrent subscription.created events
    IF (v_sub.status = 'active' OR v_sub.status = 'trialing' OR v_sub.status = 'past_due') AND (v_final_status = 'pending') THEN
        v_transition_allowed := false;
        v_final_status := v_sub.status;
    END IF;

    -- 5. STRICT DOWNGRADE & TERMINAL CANCELLATION RULES FOR ACTIVE / TRIALING SUBSCRIPTIONS:
    -- Unsequenced / timestamp-less events CANNOT regress active or trialing subscriptions to past_due or pending!
    IF v_sub.status IN ('active', 'trialing') AND v_final_status IN ('past_due', 'pending') THEN
        IF p_event_timestamp IS NULL THEN
            -- Block unsequenced downgrade fail-closed!
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSIF v_sub.last_webhook_event_at IS NOT NULL AND p_event_timestamp <= v_sub.last_webhook_event_at THEN
            -- Stale out-of-order event cannot downgrade subscription!
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        END IF;
    ELSIF v_sub.status IN ('active', 'trialing') AND v_final_status IN ('cancelled', 'expired') THEN
        -- Terminal cancellation:
        -- Unsequenced (NULL) timestamp CANNOT cancel an active or trialing subscription fail-closed!
        -- Stale out-of-order event strictly older than or equal to established watermark cannot cancel newer active subscription!
        IF p_event_timestamp IS NULL THEN
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSIF v_sub.last_webhook_event_at IS NOT NULL AND p_event_timestamp <= v_sub.last_webhook_event_at THEN
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSE
            -- Valid terminal cancellation is allowed
            v_transition_allowed := true;
            v_final_status := 'cancelled';
        END IF;
    END IF;

    -- 6. General monotonic provider timestamp ordering and equal-timestamp tie-breaker:
    -- If a subscription has an established watermark (last_webhook_event_at IS NOT NULL):
    IF v_sub.last_webhook_event_at IS NOT NULL AND v_sub.status <> v_final_status THEN
        IF v_final_status = 'cancelled' AND v_transition_allowed THEN
            -- Terminal cancellation transition already validated in Section 5
        ELSIF p_event_timestamp IS NULL OR p_event_timestamp < v_sub.last_webhook_event_at THEN
            -- Strictly older timestamp cannot alter established state
            v_transition_allowed := false;
            v_final_status := v_sub.status;
        ELSIF p_event_timestamp = v_sub.last_webhook_event_at THEN
            -- Equal-timestamp tie-breaker / event priority:
            -- If current status is past_due or pending, and incoming event brings verified payment proof to active,
            -- allow the transition (payment success takes precedence over failure/pending at equal timestamp).
            IF v_sub.status IN ('past_due', 'pending') AND p_has_payment_proof IS TRUE AND v_final_status = 'active' THEN
                v_transition_allowed := true;
                v_final_status := 'active';
            ELSE
                -- Otherwise, equal timestamp cannot alter established status
                v_transition_allowed := false;
                v_final_status := v_sub.status;
            END IF;
        END IF;
    ELSIF v_sub.last_webhook_event_at IS NOT NULL AND p_event_timestamp IS NOT NULL AND p_event_timestamp < v_sub.last_webhook_event_at THEN
        v_transition_allowed := false;
        v_final_status := v_sub.status;
    END IF;

    -- Update subscription if transition allowed
    -- Monotonic watermark: ONLY advance last_webhook_event_at with genuine provider p_event_timestamp, NEVER with server v_now!
    IF v_transition_allowed THEN
        UPDATE public.subscriptions
        SET status = v_final_status,
            last_webhook_event_at = CASE 
                WHEN p_event_timestamp IS NOT NULL THEN 
                    GREATEST(COALESCE(last_webhook_event_at, '-infinity'::timestamptz), p_event_timestamp)
                ELSE last_webhook_event_at
            END,
            updated_at = v_now
        WHERE id = v_sub_id;
    END IF;

    -- 7. Record payment if active, has payment proof, AND NOT a duplicate charge
    -- Controller Directive 2: Strictly enforce v_sub.currency. Never fallback to untrusted p_currency or default.
    IF NOT v_is_duplicate_payment AND v_final_status = 'active' AND p_has_payment_proof = true
       AND (v_sub.price IS NOT NULL AND v_sub.price > 0)
       AND (v_sub.currency IS NOT NULL AND TRIM(v_sub.currency) <> '') THEN
        IF p_tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_tenant_uuid := p_tenant_id::uuid;
        ELSIF v_sub.tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_tenant_uuid := v_sub.tenant_id::uuid;
        ELSE
            v_tenant_uuid := NULL;
        END IF;

        BEGIN
            INSERT INTO public.payments (
                tenant_id,
                subscription_id,
                provider,
                provider_event_id,
                provider_payment_id,
                amount,
                currency,
                status,
                paid_at,
                metadata
            ) VALUES (
                v_tenant_uuid,
                v_sub_id,
                p_provider,
                p_provider_event_id,
                v_provider_payment_id,
                ROUND(v_sub.price, 2),
                UPPER(TRIM(v_sub.currency)),
                'paid',
                COALESCE(p_event_timestamp, v_now),
                p_payment_metadata
            )
            RETURNING id INTO v_payment_id;

            v_payment_recorded := true;
            v_is_duplicate_payment := false;
        EXCEPTION WHEN unique_violation THEN
            SELECT id INTO v_payment_id
            FROM public.payments
            WHERE provider = p_provider AND (
                (v_provider_payment_id IS NOT NULL AND provider_payment_id = v_provider_payment_id)
                OR provider_event_id = p_provider_event_id
                OR (v_provider_payment_id IS NOT NULL AND provider_payment_id IS NULL AND provider_event_id = v_provider_payment_id)
            );

            -- Fail-closed guard: if collision was on an unrelated constraint, re-raise to rollback transaction
            IF v_payment_id IS NULL THEN
                RAISE;
            END IF;

            IF v_provider_payment_id IS NOT NULL THEN
                UPDATE public.payments
                SET provider_payment_id = v_provider_payment_id
                WHERE id = v_payment_id AND provider_payment_id IS NULL;
            END IF;

            v_payment_recorded := false;
            v_is_duplicate_payment := true;
            -- Revert any subscription transition if concurrent insert collision occurred
            UPDATE public.subscriptions
            SET status = v_sub.status,
                last_webhook_event_at = v_sub.last_webhook_event_at,
                updated_at = v_sub.updated_at
            WHERE id = v_sub_id;
            v_final_status := v_sub.status;
            v_transition_allowed := false;
        END;
    END IF;

    -- 4. Record sanitized audit log AFTER mutations succeed
    INSERT INTO public.audit_logs (
        tenant_id,
        action,
        details,
        created_at
    ) VALUES (
        v_sub.tenant_id,
        'payment_webhook',
        jsonb_build_object(
            'providerEventId', p_provider_event_id,
            'eventType', p_event_type,
            'status', v_final_status,
            'subscriptionReferenceCode', p_subscription_reference_code,
            'hasPaymentProof', p_has_payment_proof,
            'paymentRecorded', v_payment_recorded,
            'isOutOfOrder', NOT v_transition_allowed,
            'verifiedAt', v_now
        ) || p_audit_details,
        v_now
    );

    -- 5. Finalize idempotency state to 'processed' conditioned on lease token
    UPDATE public.payment_webhook_idempotency
    SET status = 'processed',
        event_timestamp = COALESCE(p_event_timestamp, event_timestamp),
        processed_at = v_now,
        updated_at = v_now,
        response_payload = jsonb_build_object(
            'received', true,
            'status', v_final_status,
            'paymentRecorded', v_payment_recorded,
            'duplicate', v_is_duplicate_payment
        )
    WHERE id = v_idem.id AND status = 'processing' AND claim_attempt_id = p_claim_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to finalize idempotency record % to processed', v_idem.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_final_status,
        'payment_recorded', v_payment_recorded,
        'is_duplicate_payment', v_is_duplicate_payment,
        'out_of_order_suppressed', NOT v_transition_allowed
    );
END;
$$;

-- 8. Role Authorization & Least Privilege Hardening
-- Revoke all execute privileges on SECURITY DEFINER RPCs from PUBLIC, anon, and authenticated.
-- Grant execute privileges exclusively to service_role.
REVOKE ALL ON FUNCTION public.claim_payment_webhook_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event TO service_role;

REVOKE ALL ON FUNCTION public.record_payment_webhook_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_webhook_event TO service_role;

REVOKE ALL ON FUNCTION public.finalize_payment_webhook_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment_webhook_event TO service_role;

REVOKE ALL ON FUNCTION public.record_payment_ledger_entry_idempotent FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_ledger_entry_idempotent TO service_role;

REVOKE ALL ON FUNCTION public.execute_payment_webhook_transaction FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_payment_webhook_transaction TO service_role;

-- Revoke all table-level access from PUBLIC, anon, and authenticated
REVOKE ALL ON TABLE public.payment_webhook_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payment_webhook_idempotency TO service_role;
