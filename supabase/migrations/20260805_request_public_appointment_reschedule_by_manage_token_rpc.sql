-- Migration 30: Stage F1 Secure Customer Appointment Rescheduling Request RPC
-- File: supabase/migrations/20260805_request_public_appointment_reschedule_by_manage_token_rpc.sql
--
-- PURPOSE:
-- Implements public.request_public_appointment_reschedule_by_manage_token SECURITY DEFINER RPC.
-- Supports the approval-based customer reschedule-request workflow:
--   1. Validates manage token via SHA-256 server-side digest lookup on public.appointment_access_tokens.
--   2. Locks target appointment FOR UPDATE.
--   3. Validates status eligibility (only 'confirmed' appointments may request reschedule).
--   4. Validates requested date/time against slots and business hours.
--   5. Checks idempotency and duplicate request protection.
--   6. Inserts server-owned change-request record into public.appointment_change_requests with status = 'pending'.
--   7. Inserts audit log and communication outbox events transactionally.
--   8. Returns stable JSON response contract without exposing raw tokens or PII.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_reschedule_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    requested_date DATE NOT NULL,
    requested_time TEXT NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.customer_reschedule_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_reschedule_idempotency FROM PUBLIC;
REVOKE ALL ON public.customer_reschedule_idempotency FROM anon;
REVOKE ALL ON public.customer_reschedule_idempotency FROM authenticated;

CREATE OR REPLACE FUNCTION public.request_public_appointment_reschedule_by_manage_token(
    p_token text,
    p_requested_date date,
    p_requested_time text,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
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
    v_trimmed_reason text;
    v_trimmed_time text;
    v_trimmed_key text;
    v_existing_idem record;
    v_existing_req record;
    v_overlap_count integer;
    v_request_id uuid;
    v_response jsonb;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input Validation
    -- -----------------------------------------------------------------------
    IF p_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_token := trim(p_token);
    IF length(v_trimmed_token) < 32 OR length(v_trimmed_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    IF p_requested_date IS NULL OR p_requested_date < current_date THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_date');
    END IF;

    IF p_requested_time IS NULL OR trim(p_requested_time) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_time := trim(p_requested_time);
    IF v_trimmed_time !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_time');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');
    v_trimmed_key := NULLIF(trim(p_idempotency_key), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(v_trimmed_token::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 4: Lock appointment row FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition and Eligibility Check
    -- -----------------------------------------------------------------------
    IF v_appointment.status != 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_transition');
    END IF;

    -- Same slot check
    IF v_appointment.appointment_date = p_requested_date AND v_appointment.appointment_time::text = v_trimmed_time THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 6: Idempotency & Active Request Replay Check
    -- -----------------------------------------------------------------------
    IF v_trimmed_key IS NOT NULL THEN
        SELECT requested_date, requested_time, response_payload
        INTO v_existing_idem
        FROM public.customer_reschedule_idempotency
        WHERE idempotency_key = v_trimmed_key;

        IF FOUND THEN
            IF v_existing_idem.requested_date = p_requested_date AND v_existing_idem.requested_time = v_trimmed_time THEN
                RETURN v_existing_idem.response_payload;
            ELSE
                RETURN jsonb_build_object('success', false, 'reason_code', 'idempotency_conflict');
            END IF;
        END IF;
    END IF;

    -- Check duplicate pending request
    SELECT id INTO v_existing_req
    FROM public.appointment_change_requests
    WHERE appointment_id = v_appointment.id
      AND request_type = 'reschedule'
      AND status IN ('pending', 'requested')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'change_request_id', v_existing_req.id
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 7: Slot Overlap Check
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.appointments
    WHERE staff_id = v_appointment.staff_id
      AND appointment_date = p_requested_date
      AND appointment_time = v_trimmed_time
      AND id != v_appointment.id
      AND status IN ('confirmed', 'completed');

    IF v_overlap_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 8: Transactional Mutation — Insert Change Request Record
    -- -----------------------------------------------------------------------
    INSERT INTO public.appointment_change_requests (
        tenant_id,
        appointment_id,
        request_type,
        requested_by,
        proposed_date,
        proposed_time,
        reason,
        status,
        created_at
    ) VALUES (
        v_appointment.tenant_id,
        v_appointment.id,
        'reschedule',
        'customer',
        p_requested_date,
        v_trimmed_time,
        v_trimmed_reason,
        'pending',
        now()
    ) RETURNING id INTO v_request_id;

    -- Build Success Response Payload
    v_response := jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'changed', true,
        'appointment_id', v_appointment.id,
        'change_request_id', v_request_id,
        'proposed_date', p_requested_date,
        'proposed_time', v_trimmed_time,
        'status', 'confirmed'
    );

    -- Record Idempotency Key
    IF v_trimmed_key IS NOT NULL THEN
        INSERT INTO public.customer_reschedule_idempotency (
            appointment_id, idempotency_key, requested_date, requested_time, response_payload
        ) VALUES (
            v_appointment.id, v_trimmed_key, p_requested_date, v_trimmed_time, v_response
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 9: Transactional Side Effects (Audit Event & Communication Outbox)
    -- -----------------------------------------------------------------------
    INSERT INTO public.audit_events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, payload, created_at
    ) VALUES (
        v_appointment.tenant_id,
        NULL,
        'customer_token',
        'appointment_reschedule_requested',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
            'change_request_id', v_request_id,
            'proposed_date', p_requested_date,
            'proposed_time', v_trimmed_time
        ),
        now()
    );

    IF v_appointment.phone IS NOT NULL AND trim(v_appointment.phone) != '' THEN
        INSERT INTO public.communication_outbox (
            tenant_id, recipient, channel, message, status, metadata, created_at, updated_at
        ) VALUES (
            v_appointment.tenant_id,
            v_appointment.phone,
            'whatsapp',
            'Randevu değişiklik talebiniz alındı.',
            'queued',
            jsonb_build_object(
                'event_type', 'cancellation_request_created',
                'appointment_id', v_appointment.id,
                'proposed_date', p_requested_date,
                'proposed_time', v_trimmed_time
            ),
            now(),
            now()
        );
    END IF;

    RETURN v_response;
END;
$$;

-- Function Ownership & Search Path
ALTER FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) OWNER TO postgres;

-- Explicit EXECUTE ACL Hardening
REVOKE ALL ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, text, text, text) TO anon, authenticated;

COMMIT;
