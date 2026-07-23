-- 20260730_self_service_token_read_rpc.sql
-- Description: Secure Read-Only Appointment Self-Service Contract (Stage C1).
-- Provides public.get_public_appointment_by_manage_token(p_token text) RETURNS jsonb.
-- Hashes the raw token server-side using SHA-256 (encode(sha256(p_token::bytea), 'hex')),
-- matches public.appointment_access_tokens.token_hash, checks expiration (expires_at > now()),
-- and returns sanitized appointment summary with joined service, staff, and branch details.
-- Returns neutral { "success": false, "reason_code": "invalid_token" } for invalid/expired tokens.
-- SECURITY DEFINER, SET search_path = pg_catalog, public, REVOKE FROM PUBLIC, GRANT TO anon, authenticated.
-- Migration count after this file: 24

CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token(
    p_token text
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
    v_service           record;
    v_staff             record;
    v_branch            record;
    v_tenant            record;
BEGIN
    -- -----------------------------------------------------------------------
    -- Step 1: Input hygiene — reject NULL, empty, or non-hex/malformed tokens
    -- -----------------------------------------------------------------------
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 2: Compute SHA-256 digest matching create_public_booking algorithm
    -- -----------------------------------------------------------------------
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

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
    -- Step 4: Resolve appointment record
    -- -----------------------------------------------------------------------
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Join service detail
    -- -----------------------------------------------------------------------
    SELECT id, name, name_tr, duration, price
    INTO v_service
    FROM public.services
    WHERE id = v_appointment.service_id;

    -- -----------------------------------------------------------------------
    -- Step 6: Join staff detail
    -- -----------------------------------------------------------------------
    SELECT id, name, title
    INTO v_staff
    FROM public.staff
    WHERE id = v_appointment.staff_id;

    -- -----------------------------------------------------------------------
    -- Step 7: Join branch & tenant detail
    -- -----------------------------------------------------------------------
    SELECT id, name, timezone
    INTO v_branch
    FROM public.branches
    WHERE id = v_appointment.branch_id;

    SELECT id, name, official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_appointment.tenant_id;

    -- -----------------------------------------------------------------------
    -- Step 8: Return sanitized response contract
    -- -----------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment', jsonb_build_object(
            'id', v_appointment.id,
            'status', v_appointment.status,
            'appointment_date', v_appointment.appointment_date,
            'appointment_time', v_appointment.appointment_time,
            'duration_minutes', COALESCE(v_appointment.duration_minutes, v_service.duration, 30),
            'customer_name', v_appointment.user_name,
            'customer_phone', v_appointment.phone,
            'notes', v_appointment.notes,
            'service', CASE WHEN v_service.id IS NOT NULL THEN jsonb_build_object(
                'id', v_service.id,
                'name', v_service.name,
                'name_tr', COALESCE(v_service.name_tr, v_service.name),
                'price', v_service.price
            ) ELSE NULL END,
            'staff', CASE WHEN v_staff.id IS NOT NULL THEN jsonb_build_object(
                'id', v_staff.id,
                'name', v_staff.name,
                'title', v_staff.title
            ) ELSE NULL END,
            'branch', CASE WHEN v_branch.id IS NOT NULL THEN jsonb_build_object(
                'id', v_branch.id,
                'name', v_branch.name,
                'timezone', COALESCE(v_branch.timezone, 'Europe/Istanbul')
            ) ELSE jsonb_build_object(
                'name', COALESCE(v_tenant.official_business_name, v_tenant.name, 'Güzellik Salonu'),
                'timezone', 'Europe/Istanbul'
            ) END
        ),
        'allowed_actions', jsonb_build_object(
            'can_cancel', false,
            'can_reschedule', false
        )
    );

EXCEPTION WHEN OTHERS THEN
    -- Redact all error details: Return neutral invalid_token response, never leak SQLERRM
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL Permissions Management
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_public_appointment_by_manage_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text) TO authenticated;
