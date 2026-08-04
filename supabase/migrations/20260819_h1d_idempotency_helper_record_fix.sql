-- =========================================================================
-- MIGRATION 44: H1D IDEMPOTENCY HELPER RECORD-SHAPE FIX
--
-- Forward-only correction for check_super_admin_idempotency.
-- The previous function referenced a record field that was not selected.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_super_admin_idempotency(
    p_idempotency_key TEXT,
    p_rpc_name TEXT,
    p_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RETURN NULL;
    END IF;

    SELECT
        idempotency_key,
        actor_user_id,
        rpc_name,
        request_fingerprint,
        response_payload
    INTO v_rec
    FROM public.super_admin_commercial_mutation_idempotency
    WHERE idempotency_key = trim(p_idempotency_key);

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF
        v_rec.rpc_name IS DISTINCT FROM p_rpc_name
        OR v_rec.request_fingerprint IS DISTINCT FROM p_fingerprint
    THEN
        RAISE EXCEPTION
            'IDEMPOTENCY_CONFLICT: Idempotency key reuse with different parameters or operation.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN v_rec.response_payload;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.check_super_admin_idempotency(TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
