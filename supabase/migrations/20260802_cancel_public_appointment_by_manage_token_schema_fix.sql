-- 20260802_cancel_public_appointment_by_manage_token_schema_fix.sql
-- Description: Forward Fix for public.cancel_public_appointment_by_manage_token RPC (Stage E1).
-- Omits non-existent appointment table columns (cancel_reason, cancelled_at, cancelled_by).
-- Preserves status = 'cancelled_by_customer' and updated_at = now() on public.appointments.
-- Preserves full transactional logging of p_reason in audit_events and communication_outbox.
-- SECURITY DEFINER, SET search_path = pg_catalog, public.
-- REVOKE FROM PUBLIC, GRANT TO anon, authenticated.
-- Migration count after this file: 27

CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token  text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_trimmed_reason    text;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or out-of-range tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    v_trimmed_reason := NULLIF(trim(p_reason), '');

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching canonical token creation
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- -----------------------------------------------------------------------
    -- Step 3: Match appointment_access_tokens record (must not be expired)
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
    -- Step 4: Lock appointment row with SELECT FOR UPDATE
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Transition State Machine
    -- -----------------------------------------------------------------------

    -- A. Idempotent Replay — Already cancelled by customer
    IF v_appointment.status = 'cancelled_by_customer' THEN
        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'no_change',
            'changed', false,
            'appointment_id', v_appointment.id,
            'previous_status', 'cancelled_by_customer',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- B. Terminal / Invalid Transitions
    IF v_appointment.status IN ('completed', 'no_show', 'cancelled', 'cancelled_by_salon', 'cancelled_by_system') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_transition',
            'appointment_id', v_appointment.id,
            'status', v_appointment.status
        );
    END IF;

    -- C. Valid Mutation — confirmed -> cancelled_by_customer
    IF v_appointment.status = 'confirmed' THEN
        UPDATE public.appointments
        SET status = 'cancelled_by_customer',
            updated_at = now()
        WHERE id = v_appointment.id;

        -- Transactional Audit Log
        INSERT INTO public.audit_events (
            tenant_id,
            actor_type,
            category,
            severity,
            action,
            entity_type,
            entity_id,
            summary,
            safe_details
        ) VALUES (
            v_appointment.tenant_id,
            'customer_token',
            'booking',
            'info',
            'appointment_cancelled_by_customer',
            'Appointment',
            v_appointment.id::text,
            'Randevu müşteri tarafından iptal edildi (Manage Token)',
            jsonb_build_object(
                'appointmentId', v_appointment.id,
                'previous_status', 'confirmed',
                'status', 'cancelled_by_customer',
                'cancelReason', v_trimmed_reason
            )
        );

        -- Transactional Communication Outbox Event
        INSERT INTO public.communication_outbox (
            tenant_id,
            event_type,
            recipient_email,
            recipient_phone,
            metadata
        ) VALUES (
            v_appointment.tenant_id,
            'appointment_cancelled_by_customer',
            v_appointment.user_email,
            v_appointment.phone,
            jsonb_build_object(
                'appointment_id', v_appointment.id,
                'appointment_date', v_appointment.appointment_date,
                'appointment_time', v_appointment.appointment_time,
                'status', 'cancelled_by_customer',
                'cancelled_by', 'customer',
                'cancel_reason', v_trimmed_reason
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'reason_code', 'ok',
            'changed', true,
            'appointment_id', v_appointment.id,
            'previous_status', 'confirmed',
            'status', 'cancelled_by_customer'
        );
    END IF;

    -- Fail-closed fallback for any unhandled state
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'invalid_transition',
        'appointment_id', v_appointment.id,
        'status', v_appointment.status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) IS
'Stage E1 Correction: Updates status to cancelled_by_customer without referencing non-existent columns. Enforces SECURITY DEFINER search_path, server-side token hashing, row locking, audit logging, and outbox insertion.';
