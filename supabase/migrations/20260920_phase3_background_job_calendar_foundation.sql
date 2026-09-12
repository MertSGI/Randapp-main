-- ===========================================================================
-- Migration: Phase 3 Provider-Neutral Background Job & Calendar Integration Foundation (R1 Hardened)
-- Authority: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
-- Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Phase: 3 (PRODUCT_COMPLETENESS_BEFORE_EXTERNAL_PROVIDERS)
-- Base: 09bb1f8d8ce070c33d09099a6d0ae20c93787d11
--
-- Directives & Domain Architecture:
-- 1. NO DUPLICATE DOMAIN MODELS:
--    Reuses existing appointments, tenants, and background job structures.
-- 2. CALENDAR INTEGRATION:
--    - Enforces appointment existence and exact tenant validation:
--      (appointment_id, tenant_id) check in enqueue_calendar_sync fails closed on tenant mismatch.
--    - Strictly provider-neutral queue for calendar synchronizations.
--    - NO Google network access, NO OAuth activation, NO real credentials.
-- 3. BACKGROUND JOB RUN ENGINE:
--    - Full bounded worker lifecycle:
--      enqueue_background_job
--      claim_background_job_batch (with FOR UPDATE SKIP LOCKED & lease expiry reclaim)
--      complete_background_job
--      fail_background_job (retryable vs terminal/dead_letter with attempt limits)
--      cancel_background_job
-- 4. TRUST BOUNDARY:
--    - Direct table privileges revoked from PUBLIC, anon, and authenticated.
--    - Internal RPCs explicitly granted to service_role.
-- ===========================================================================

-- =========================================================================
-- 1. Table: public.calendar_sync_queue
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.calendar_sync_queue (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id          UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    provider                TEXT NOT NULL CHECK (provider IN ('google_intent', 'ics', 'apple', 'deterministic_test')),
    status                  TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'processing', 'synced', 'failed', 'cancelled')),
    external_event_ref      TEXT DEFAULT NULL,
    attempt_count           INTEGER NOT NULL DEFAULT 0,
    max_attempts            INTEGER NOT NULL DEFAULT 3,
    next_attempt_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at         TIMESTAMPTZ DEFAULT NULL,
    locked_by               TEXT DEFAULT NULL,
    lease_until             TIMESTAMPTZ DEFAULT NULL,
    error_code              TEXT DEFAULT NULL,
    error_message           TEXT DEFAULT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT calendar_sync_tenant_appointment_provider_unique UNIQUE (tenant_id, appointment_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_dispatch 
    ON public.calendar_sync_queue(status, next_attempt_at) 
    WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_calendar_sync_tenant ON public.calendar_sync_queue(tenant_id);

ALTER TABLE public.calendar_sync_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_sync_queue FROM PUBLIC;
REVOKE ALL ON public.calendar_sync_queue FROM anon;
REVOKE ALL ON public.calendar_sync_queue FROM authenticated;

-- =========================================================================
-- 2. Table: public.background_job_runs (Canonical Background Job Ledger)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.background_job_runs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type                TEXT NOT NULL,
    tenant_id               UUID DEFAULT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued', 'processing', 'completed', 'failed_retryable', 'failed_terminal', 'dead_letter', 'cancelled')),
    idempotency_key         TEXT DEFAULT NULL,
    attempt_count           INTEGER NOT NULL DEFAULT 0,
    max_attempts            INTEGER NOT NULL DEFAULT 3,
    next_attempt_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by               TEXT DEFAULT NULL,
    lease_until             TIMESTAMPTZ DEFAULT NULL,
    started_at              TIMESTAMPTZ DEFAULT NULL,
    completed_at            TIMESTAMPTZ DEFAULT NULL,
    payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    result                  JSONB DEFAULT NULL,
    error_code              TEXT DEFAULT NULL,
    error_message           TEXT DEFAULT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_background_job_idempotency UNIQUE (tenant_id, job_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_background_job_runs_queue 
    ON public.background_job_runs(status, next_attempt_at) 
    WHERE status IN ('queued', 'failed_retryable');

CREATE INDEX IF NOT EXISTS idx_background_job_runs_tenant ON public.background_job_runs(tenant_id)
    WHERE tenant_id IS NOT NULL;

ALTER TABLE public.background_job_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.background_job_runs FROM PUBLIC;
REVOKE ALL ON public.background_job_runs FROM anon;
REVOKE ALL ON public.background_job_runs FROM authenticated;

-- =========================================================================
-- 3. Server-Side RPC: enqueue_calendar_sync
-- Enforces appointment existence and tenant binding: fails closed on mismatch.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enqueue_calendar_sync(
    p_tenant_id         UUID,
    p_appointment_id     UUID,
    p_provider          TEXT DEFAULT 'deterministic_test'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_provider    TEXT;
    v_new_id            UUID;
    v_existing_id       UUID;
    v_existing_status   TEXT;
BEGIN
    v_clean_provider := trim(COALESCE(p_provider, 'deterministic_test'));

    IF v_clean_provider NOT IN ('google_intent', 'ics', 'apple', 'deterministic_test') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PROVIDER');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    -- Fail closed: appointment must exist AND belong to exact tenant
    IF NOT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE id = p_appointment_id AND tenant_id = p_tenant_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'APPOINTMENT_TENANT_MISMATCH');
    END IF;

    -- Idempotent upsert/re-queue
    INSERT INTO public.calendar_sync_queue (
        tenant_id,
        appointment_id,
        provider,
        status
    ) VALUES (
        p_tenant_id,
        p_appointment_id,
        v_clean_provider,
        'queued'
    )
    ON CONFLICT (tenant_id, appointment_id, provider) DO UPDATE
    SET status = 'queued',
        next_attempt_at = NOW(),
        updated_at = NOW()
    WHERE public.calendar_sync_queue.status IN ('failed', 'cancelled')
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
        SELECT id, status INTO v_existing_id, v_existing_status
        FROM public.calendar_sync_queue
        WHERE tenant_id = p_tenant_id AND appointment_id = p_appointment_id AND provider = v_clean_provider;

        RETURN jsonb_build_object(
            'success', true,
            'sync_id', v_existing_id,
            'status', v_existing_status,
            'idempotent_duplicate', true
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sync_id', v_new_id,
        'status', 'queued'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_calendar_sync(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_calendar_sync(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_calendar_sync(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_calendar_sync(UUID, UUID, TEXT) TO service_role;

-- =========================================================================
-- 4. Server-Side RPC: claim_calendar_sync_batch
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_calendar_sync_batch(
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
    v_clean_worker      TEXT;
    v_bounded_batch     INTEGER;
    v_bounded_lease     INTEGER;
    v_claimed_ids       UUID[];
BEGIN
    v_clean_worker := trim(COALESCE(p_worker_id, ''));
    IF length(v_clean_worker) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WORKER_ID');
    END IF;

    v_bounded_batch := LEAST(GREATEST(COALESCE(p_batch_size, 10), 1), 100);
    v_bounded_lease := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 10), 3600);

    WITH candidates AS (
        SELECT id
        FROM public.calendar_sync_queue
        WHERE (status = 'queued' AND next_attempt_at <= NOW())
           OR (status = 'processing' AND lease_until < NOW())
        ORDER BY next_attempt_at ASC
        LIMIT v_bounded_batch
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.calendar_sync_queue csq
        SET status = 'processing',
            locked_by = v_clean_worker,
            lease_until = NOW() + (v_bounded_lease || ' seconds')::interval,
            last_attempt_at = NOW(),
            attempt_count = csq.attempt_count + 1,
            updated_at = NOW()
        FROM candidates c
        WHERE csq.id = c.id
        RETURNING csq.id
    )
    SELECT array_agg(id) INTO v_claimed_ids FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'claimed_count', COALESCE(array_length(v_claimed_ids, 1), 0),
        'claimed_ids', COALESCE(v_claimed_ids, '{}'::UUID[])
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_calendar_sync_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_sync_batch(TEXT, INTEGER, INTEGER) TO service_role;

-- =========================================================================
-- 5. Complete Background Job Engine Worker Lifecycle Primitives
-- =========================================================================

-- 5.1 enqueue_background_job
CREATE OR REPLACE FUNCTION public.enqueue_background_job(
    p_job_type         TEXT,
    p_tenant_id        UUID DEFAULT NULL,
    p_payload          JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key  TEXT DEFAULT NULL,
    p_max_attempts     INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_job_id UUID;
    v_existing_id UUID;
BEGIN
    IF p_job_type IS NULL OR trim(p_job_type) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_JOB_TYPE');
    END IF;

    IF p_tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
    END IF;

    -- Idempotent insert
    INSERT INTO public.background_job_runs (
        job_type, tenant_id, payload, idempotency_key, max_attempts, status
    ) VALUES (
        trim(p_job_type), p_tenant_id, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key, GREATEST(1, COALESCE(p_max_attempts, 3)), 'queued'
    )
    ON CONFLICT (tenant_id, job_type, idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL AND p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM public.background_job_runs
        WHERE tenant_id IS NOT DISTINCT FROM p_tenant_id
          AND job_type = trim(p_job_type)
          AND idempotency_key = p_idempotency_key;

        RETURN jsonb_build_object('success', true, 'job_id', v_existing_id, 'is_idempotent_duplicate', true);
    END IF;

    RETURN jsonb_build_object('success', true, 'job_id', v_job_id, 'is_idempotent_duplicate', false);
END;
$$;

-- 5.2 claim_background_job_batch
CREATE OR REPLACE FUNCTION public.claim_background_job_batch(
    p_worker_id     TEXT,
    p_batch_size    INTEGER DEFAULT 10,
    p_lease_seconds INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_worker      TEXT;
    v_bounded_batch     INTEGER;
    v_bounded_lease     INTEGER;
    v_claimed_ids       UUID[];
BEGIN
    v_clean_worker := trim(COALESCE(p_worker_id, ''));
    IF length(v_clean_worker) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WORKER_ID');
    END IF;

    v_bounded_batch := LEAST(GREATEST(COALESCE(p_batch_size, 10), 1), 100);
    v_bounded_lease := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 10), 3600);

    WITH candidates AS (
        SELECT id
        FROM public.background_job_runs
        WHERE (status IN ('queued', 'failed_retryable') AND next_attempt_at <= NOW())
           OR (status = 'processing' AND lease_until < NOW())
        ORDER BY next_attempt_at ASC
        LIMIT v_bounded_batch
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.background_job_runs bjr
        SET status = 'processing',
            locked_by = v_clean_worker,
            lease_until = NOW() + (v_bounded_lease || ' seconds')::interval,
            started_at = COALESCE(bjr.started_at, NOW()),
            attempt_count = bjr.attempt_count + 1,
            updated_at = NOW()
        FROM candidates c
        WHERE bjr.id = c.id
        RETURNING bjr.id
    )
    SELECT array_agg(id) INTO v_claimed_ids FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'claimed_count', COALESCE(array_length(v_claimed_ids, 1), 0),
        'claimed_ids', COALESCE(v_claimed_ids, '{}'::UUID[])
    );
END;
$$;

-- 5.3 complete_background_job
CREATE OR REPLACE FUNCTION public.complete_background_job(
    p_job_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    UPDATE public.background_job_runs
    SET status = 'completed',
        completed_at = NOW(),
        result = p_result,
        locked_by = NULL,
        lease_until = NULL,
        updated_at = NOW()
    WHERE id = p_job_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND');
    END IF;

    RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', 'completed');
END;
$$;

-- 5.4 fail_background_job (handles retry vs terminal/dead_letter)
CREATE OR REPLACE FUNCTION public.fail_background_job(
    p_job_id        UUID,
    p_error_code    TEXT,
    p_error_message TEXT,
    p_retry_delay_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_job RECORD;
    v_new_status TEXT;
BEGIN
    SELECT * INTO v_job
    FROM public.background_job_runs
    WHERE id = p_job_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'JOB_NOT_FOUND');
    END IF;

    IF v_job.attempt_count >= v_job.max_attempts THEN
        v_new_status := 'dead_letter';
    ELSE
        v_new_status := 'failed_retryable';
    END IF;

    UPDATE public.background_job_runs
    SET status = v_new_status,
        error_code = p_error_code,
        error_message = p_error_message,
        locked_by = NULL,
        lease_until = NULL,
        next_attempt_at = CASE WHEN v_new_status = 'failed_retryable' THEN NOW() + (GREATEST(1, COALESCE(p_retry_delay_seconds, 60)) || ' seconds')::interval ELSE next_attempt_at END,
        updated_at = NOW()
    WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', v_new_status);
END;
$$;

-- 5.5 cancel_background_job
CREATE OR REPLACE FUNCTION public.cancel_background_job(
    p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    UPDATE public.background_job_runs
    SET status = 'cancelled',
        locked_by = NULL,
        lease_until = NULL,
        updated_at = NOW()
    WHERE id = p_job_id AND status IN ('queued', 'failed_retryable');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'JOB_CANNOT_BE_CANCELLED');
    END IF;

    RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'status', 'cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_background_job(TEXT, UUID, JSONB, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_background_job_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_background_job(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_background_job(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_background_job(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_background_job(TEXT, UUID, JSONB, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_background_job_batch(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_background_job(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_background_job(UUID, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_background_job(UUID) TO service_role;
