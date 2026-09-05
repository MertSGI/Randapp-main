-- Migration: 20260914_public_booking_branch_id_response_contract_fix.sql
-- Goal: Ensure create_public_booking includes branch_id in both initial booking and idempotency replay responses.

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug              text,
    p_service_id        uuid,
    p_staff_id          uuid,
    p_appointment_date  date,
    p_appointment_time  time,
    p_customer_name     text,
    p_customer_email    text,
    p_customer_phone    text,
    p_required_consent  boolean,
    p_marketing_consent boolean DEFAULT false,
    p_reminder_consent  boolean DEFAULT false,
    p_idempotency_key   text    DEFAULT NULL,
    p_branch_id         uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_effective_branch      uuid := p_branch_id;
    v_active_branches       uuid[];
    v_eval_res              jsonb;
    v_svc_duration          integer;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_existing_branch_id    uuid;
    v_lock_key              bigint;
    v_stage                 text := 'init';
    v_elig                  jsonb;
    v_action                jsonb;
    v_period_key            text;
    v_usage_res             jsonb;
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4: Commercial Eligibility (H1C)
    v_stage := 'commercial_eligibility';
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 4b: Core Booking Feature Gate (H1C)
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Branch Resolution
    SELECT ARRAY(
        SELECT id FROM public.branches
        WHERE tenant_id = v_tenant_id AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
    ) INTO v_active_branches;

    IF v_effective_branch IS NULL THEN
        IF array_length(v_active_branches, 1) = 1 THEN
            v_effective_branch := v_active_branches[1];
        ELSIF array_length(v_active_branches, 1) > 1 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch');
        END IF;
    END IF;

    -- Gate 5: Concurrency Advisory Lock
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Gate 6: Idempotency Replay
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key AND tenant_id = v_tenant_id;

        IF FOUND THEN
            SELECT branch_id INTO v_existing_branch_id
            FROM public.appointments
            WHERE id = v_existing_apt_id AND tenant_id = v_tenant_id;

            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id AND expires_at > now();

            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id, appointment_id, token_hash, expires_at
            ) VALUES (
                v_tenant_id::text, v_existing_apt_id, v_token_hash, v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'branch_id',      v_existing_branch_id,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- Gate 7: Monthly Appointment Quota (H1C)
    v_stage := 'appointment_quota';
    v_period_key := public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments');
    v_usage_res := public.consume_commercial_usage(v_tenant_id, 'max_monthly_appointments', v_period_key);
    IF NOT (v_usage_res->>'success')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- Gate 8: Shared Slot Evaluator Engine Execution
    v_stage := 'evaluate_booking_slot';
    v_eval_res := public.evaluate_booking_slot(
        p_tenant_id  => v_tenant_id,
        p_branch_id  => v_effective_branch,
        p_service_id => p_service_id,
        p_staff_id   => p_staff_id,
        p_date       => p_appointment_date,
        p_time       => p_appointment_time
    );

    IF NOT (v_eval_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Gate 9: Customer Upsert
    v_stage := 'customer_upsert';
    IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = p_customer_phone LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND p_customer_email IS NOT NULL AND trim(p_customer_email) != '' THEN
        SELECT id INTO v_customer_id FROM public.customers
        WHERE tenant_id = v_tenant_id AND email = p_customer_email LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (v_tenant_id, trim(p_customer_name), trim(p_customer_email), trim(p_customer_phone))
        RETURNING id INTO v_customer_id;
    END IF;

    -- Gate 10: Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Gate 11: Appointment Creation
    v_stage := 'appointment_insert';
    INSERT INTO public.appointments (
        tenant_id, branch_id, customer_id, user_name, user_email, phone,
        service_id, staff_id, appointment_date, appointment_time,
        duration_minutes, status
    ) VALUES (
        v_tenant_id, v_effective_branch, v_customer_id, trim(p_customer_name),
        trim(p_customer_email), trim(p_customer_phone), p_service_id, p_staff_id,
        p_appointment_date, p_appointment_time, v_svc_duration, 'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 12: Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Gate 13: Idempotency Record
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (
            idempotency_key, tenant_id, appointment_id, expires_at
        ) VALUES (
            p_idempotency_key, v_tenant_id, v_appointment_id, now() + interval '24 hours'
        );
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'branch_id',      v_effective_branch,
        'reason_code',    'ok'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'reason_code', 'temporary_failure', 'debug_stage', v_stage, 'debug_sqlerrm', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid) TO anon, authenticated;
