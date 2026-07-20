-- 20260722_public_booking_search_path_fix.sql
-- Description: Fix SECURITY DEFINER functions to use search_path = public, extensions.
-- This ensures gen_random_bytes (from pgcrypto) resolves correctly when invoked.
-- Migration count after this file: 16

-- =========================================================================
-- 1. Redefine create_public_booking with corrected search_path
-- =========================================================================
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
    p_idempotency_key   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant_id             uuid;
    v_tenant_status         text;
    v_onboarding_status     text;
    v_public_site_status    text;
    v_sub_status            text;
    v_sub_exists            boolean;
    v_service_tenant_id     uuid;
    v_service_active        boolean;
    v_staff_tenant_id       uuid;
    v_staff_active          boolean;
    v_staff_service_exists  boolean;
    v_service_duration      integer;
    v_weekday               integer;
    v_avail_start           time;
    v_avail_end             time;
    v_slot_conflict         boolean;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_now_in_tz             timestamp;
    v_req_start             timestamp;
    v_req_end               timestamp;
    v_lock_key              bigint;
    v_stage                 text := 'init';
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Required consent must be granted by customer
    -- -----------------------------------------------------------------------
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Minimal customer data validation
    -- -----------------------------------------------------------------------
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '')
       AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Tenant resolution and eligibility
    -- -----------------------------------------------------------------------
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active'
       AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Active entitlement check
    -- -----------------------------------------------------------------------
    v_stage := 'entitlement_validation';
    
    -- Select the current deterministic active/manual entitlement honoring active status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions 
        WHERE tenant_id = v_tenant_id 
          AND status IN ('active', 'manual_active', 'comped', 'trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Concurrency Safety via Transactional Advisory Lock
    -- -----------------------------------------------------------------------
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- -----------------------------------------------------------------------
    -- Gate 6: Idempotency Replay (with Token Regeneration & Old Token Revocation)
    -- -----------------------------------------------------------------------
    v_stage := 'idempotency_replay';
    -- Delete expired idempotency keys before checking to enforce the retention window
    DELETE FROM public.public_booking_idempotency 
    WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key
          AND tenant_id = v_tenant_id;

        IF FOUND THEN
            -- Expire/Revoke all previous access tokens for this appointment to enforce max 1 active token rule
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id 
              AND expires_at > now();

            -- Generate a fresh secure manage token on replay and store only its hash
            v_token      := encode(gen_random_bytes(32), 'hex');
            v_token_hash := encode(sha256(v_token::bytea), 'hex');
            v_expires_at := now() + interval '30 days';

            INSERT INTO public.appointment_access_tokens (
                tenant_id,
                appointment_id,
                token_hash,
                expires_at
            ) VALUES (
                v_tenant_id::text,
                v_existing_apt_id,
                v_token_hash,
                v_expires_at
            );

            RETURN jsonb_build_object(
                'success',        true,
                'appointment_id', v_existing_apt_id,
                'manage_token',   v_token,
                'reason_code',    'ok'
            );
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Service validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'service_validation';
    SELECT tenant_id, active, duration
    INTO v_service_tenant_id, v_service_active, v_service_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_service_tenant_id IS DISTINCT FROM v_tenant_id OR v_service_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_service');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Staff validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    v_stage := 'staff_validation';
    SELECT tenant_id, active
    INTO v_staff_tenant_id, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant_id IS DISTINCT FROM v_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 9: Staff-service mapping must exist
    -- -----------------------------------------------------------------------
    v_stage := 'staff_service_mapping_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_service_exists;

    IF NOT v_staff_service_exists THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_staff');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 10: Date/time must be strictly in the future (timezone-aware)
    -- -----------------------------------------------------------------------
    v_stage := 'timezone_validation';
    v_now_in_tz := now() AT TIME ZONE 'Europe/Istanbul';
    v_req_start := (p_appointment_date + p_appointment_time);

    IF v_req_start <= v_now_in_tz THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 11: Availability rule check
    -- -----------------------------------------------------------------------
    v_stage := 'availability_validation';
    v_weekday   := EXTRACT(ISODOW FROM p_appointment_date)::integer;
    v_req_end   := v_req_start + (COALESCE(v_service_duration, 60) || ' minutes')::interval;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id  = p_staff_id
      AND tenant_id = v_tenant_id
      AND weekday   = v_weekday
      AND is_active = true
      AND start_time <= v_req_start::time
      AND end_time   >= v_req_end::time
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'outside_availability');
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 12: Overlapping conflict detection
    -- -----------------------------------------------------------------------
    v_stage := 'slot_conflict_validation';
    SELECT EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.staff_id  = p_staff_id
          AND a.tenant_id = v_tenant_id
          AND a.appointment_date = p_appointment_date
          AND a.status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
          -- Check overlapping interval:
          AND (a.appointment_date + a.appointment_time) < v_req_end
          AND ((a.appointment_date + a.appointment_time) + (COALESCE(s.duration, 60) || ' minutes')::interval) > v_req_start
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'slot_conflict');
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 1: Resolve or create customer (atomically under SECURITY DEFINER)
    -- -----------------------------------------------------------------------
    v_stage := 'customer_write';
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE tenant_id = v_tenant_id
      AND (
          (p_customer_email IS NOT NULL AND trim(p_customer_email) != '' AND email = trim(p_customer_email))
          OR
          (p_customer_phone IS NOT NULL AND trim(p_customer_phone) != '' AND phone = trim(p_customer_phone))
      )
    LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.customers (tenant_id, name, email, phone)
        VALUES (
            v_tenant_id,
            trim(p_customer_name),
            NULLIF(trim(p_customer_email), ''),
            NULLIF(trim(p_customer_phone), '')
        )
        RETURNING id INTO v_customer_id;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 2: Persist booking consent to consent_ledger
    -- -----------------------------------------------------------------------
    v_stage := 'consent_write';
    INSERT INTO public.consent_ledger (
        tenant_id,
        customer_id,
        consent_type,
        is_granted,
        digital_signature
    ) VALUES
    (
        v_tenant_id::text,
        v_customer_id::text,
        'booking_transactional',
        p_required_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'communication',
        p_reminder_consent,
        'rpc_booking_submit'
    ),
    (
        v_tenant_id::text,
        v_customer_id::text,
        'marketing',
        p_marketing_consent,
        'rpc_booking_submit'
    );

    -- -----------------------------------------------------------------------
    -- Step 3: Insert appointment
    -- -----------------------------------------------------------------------
    v_stage := 'appointment_write';
    INSERT INTO public.appointments (
        tenant_id,
        customer_id,
        service_id,
        staff_id,
        user_name,
        user_email,
        phone,
        appointment_date,
        appointment_time,
        status
    ) VALUES (
        v_tenant_id,
        v_customer_id,
        p_service_id,
        p_staff_id,
        trim(p_customer_name),
        NULLIF(trim(p_customer_email), ''),
        NULLIF(trim(p_customer_phone), ''),
        p_appointment_date,
        p_appointment_time,
        'confirmed'
    )
    RETURNING id INTO v_appointment_id;

    -- -----------------------------------------------------------------------
    -- Step 4: Record idempotency key if provided
    -- -----------------------------------------------------------------------
    v_stage := 'idempotency_write';
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (idempotency_key, tenant_id, appointment_id)
        VALUES (p_idempotency_key, v_tenant_id, v_appointment_id)
        ON CONFLICT (idempotency_key, tenant_id) DO NOTHING;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Create appointment access token
    -- -----------------------------------------------------------------------
    v_stage := 'token_write';
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id,
        appointment_id,
        token_hash,
        expires_at
    ) VALUES (
        v_tenant_id::text,
        v_appointment_id,
        v_token_hash,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );

EXCEPTION WHEN OTHERS THEN
    -- Redact all details: Log only safe stage identifier and SQLSTATE, never log SQLERRM or PII
    RAISE WARNING 'create_public_booking error stage: %, SQLSTATE: %', v_stage, SQLSTATE;
    RETURN jsonb_build_object(
        'success',      false,
        'reason_code',  'temporary_failure'
    );
END;
$$;


-- =========================================================================
-- 2. Redefine can_accept_public_booking with corrected search_path
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_accept_public_booking(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_tenant_id uuid;
    v_status text;
    v_onboarding_status text;
    v_public_site_status text;
    v_sub_exists boolean;
    v_sub_status text;
    v_allowed boolean := false;
    v_reason_code text := 'ok';
BEGIN
    -- 1. Resolve tenant details by slug
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'allowed', false,
            'reason_code', 'tenant_not_found'
        );
    END IF;

    -- 2. Validate tenant status
    IF v_status IS DISTINCT FROM 'active' AND v_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'tenant_inactive'
        );
    END IF;

    -- 3. Validate onboarding status
    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'onboarding_incomplete'
        );
    END IF;

    -- 4. Validate public site status
    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'site_unpublished'
        );
    END IF;

    -- 5. Query manual active or active subscription status
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = v_tenant_id
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    -- Canonical allowed active statuses: 'active', 'manual_active', 'comped', 'trialing'
    IF v_sub_status IS DISTINCT FROM 'active' 
       AND v_sub_status IS DISTINCT FROM 'manual_active' 
       AND v_sub_status IS DISTINCT FROM 'comped' 
       AND v_sub_status IS DISTINCT FROM 'trialing' THEN
        RETURN jsonb_build_object(
            'found', true,
            'allowed', false,
            'reason_code', 'entitlement_inactive'
        );
    END IF;

    -- 6. All checks passed
    RETURN jsonb_build_object(
        'found', true,
        'allowed', true,
        'reason_code', 'ok'
    );
END;
$$;


-- =========================================================================
-- 3. Explicit Permission Grants
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_accept_public_booking(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO anon;

GRANT EXECUTE ON FUNCTION public.can_accept_public_booking(text) TO authenticated;
