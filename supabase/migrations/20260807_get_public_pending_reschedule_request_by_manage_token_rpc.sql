-- Migration 32: Stage F2 Secure Pending Reschedule Request Read RPC
-- File: supabase/migrations/20260807_get_public_pending_reschedule_request_by_manage_token_rpc.sql
--
-- PURPOSE:
-- Implements public.get_public_pending_reschedule_request_by_manage_token(p_token text) RETURNS jsonb.
-- Server-side token validation and pending reschedule request lookup for Stage F2 UI.
-- Hashes the raw token using SHA-256 against public.appointment_access_tokens,
-- resolves appointment server-side, and returns the active pending reschedule request if present.
-- Never exposes raw tokens, token hashes, customer PII, SQLERRM, or SQLSTATE.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_pending_reschedule_request_by_manage_token(
    p_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trimmed_token text;
    v_token_hash text;
    v_token_record record;
    v_appointment record;
    v_req_record record;
BEGIN
    -- Step 1: Input Validation
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_token := trim(p_token);
    IF length(v_trimmed_token) < 32 OR length(v_trimmed_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 2: Compute SHA-256 token digest
    v_token_hash := encode(sha256(v_trimmed_token::bytea), 'hex');

    -- Step 3: Match token in appointment_access_tokens
    SELECT id, tenant_id, appointment_id, expires_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4: Resolve target appointment
    SELECT id, tenant_id, status
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 5: Query active pending reschedule request
    SELECT id, proposed_date, proposed_time, status, created_at
    INTO v_req_record
    FROM public.appointment_change_requests
    WHERE appointment_id = v_appointment.id
      AND request_type = 'reschedule'
      AND status IN ('pending', 'requested')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'has_pending_request', true,
            'change_request_id', v_req_record.id,
            'proposed_date', v_req_record.proposed_date,
            'proposed_time', v_req_record.proposed_time,
            'status', v_req_record.status,
            'created_at', v_req_record.created_at
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'has_pending_request', false
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

ALTER FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pending_reschedule_request_by_manage_token(text) TO anon, authenticated;

COMMIT;
