-- 20260720_public_booking_rpc.sql
-- Description: Safe, atomic, SECURITY DEFINER public booking RPC.
-- Replaces direct anonymous INSERT paths to appointments, customers, consent_ledger,
-- and appointment_access_tokens. Anonymous users call only this RPC.
-- Migration count after this file: 15

-- =========================================================================
-- 1. Idempotency Table
-- =========================================================================
-- Used by the RPC to detect and short-circuit duplicate submissions.
-- The anon role cannot INSERT/SELECT directly; the SECURITY DEFINER function manages it.

CREATE TABLE IF NOT EXISTS public.public_booking_idempotency (
    idempotency_key TEXT NOT NULL,
    tenant_id       UUID NOT NULL,
    appointment_id  UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (idempotency_key, tenant_id)
);

-- No direct public access to idempotency table.
ALTER TABLE public.public_booking_idempotency ENABLE ROW LEVEL SECURITY;

-- Only authenticated tenant owners and super admins can inspect it for debugging.
CREATE POLICY "Owner/Admin can inspect idempotency records"
    ON public.public_booking_idempotency
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.active = true
              AND (
                up.role = 'super_admin'
                OR (
                    up.role = 'tenant_owner'
                    AND up.tenant_id = public_booking_idempotency.tenant_id
                )
              )
        )
    );


-- =========================================================================
-- 2. Public Booking RPC
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
SET search_path = public
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
    v_apt_end_time          time;
    v_weekday               integer;
    v_avail_start           time;
    v_avail_end             time;
    v_avail_exists          boolean;
    v_slot_conflict         boolean;
    v_customer_id           uuid;
    v_appointment_id        uuid;
    v_token                 text;
    v_token_hash            text;
    v_expires_at            timestamptz;
    v_existing_apt_id       uuid;
    v_now_utc               timestamptz;
    v_apt_ts                timestamptz;
BEGIN
    -- -----------------------------------------------------------------------
    -- Gate 1: Required consent must be granted by customer
    -- -----------------------------------------------------------------------
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'consent_required'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 2: Minimal customer data validation
    -- -----------------------------------------------------------------------
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_customer_data'
        );
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '')
       AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_customer_data'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 3: Tenant resolution and eligibility
    -- -----------------------------------------------------------------------
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_tenant'
        );
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active'
       AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'booking_unavailable'
        );
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'booking_unavailable'
        );
    END IF;

    IF v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'booking_unavailable'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 4: Active entitlement check
    -- -----------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions WHERE tenant_id = v_tenant_id
    ) INTO v_sub_exists;

    IF NOT v_sub_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'booking_unavailable'
        );
    END IF;

    SELECT status INTO v_sub_status
    FROM public.subscriptions
    WHERE tenant_id = v_tenant_id
    LIMIT 1;

    IF v_sub_status IS DISTINCT FROM 'active'
       AND v_sub_status IS DISTINCT FROM 'manual_active'
       AND v_sub_status IS DISTINCT FROM 'comped'
       AND v_sub_status IS DISTINCT FROM 'trialing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'booking_unavailable'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 5: Idempotency — short-circuit duplicate submissions
    -- -----------------------------------------------------------------------
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key
          AND tenant_id = v_tenant_id;

        IF FOUND THEN
            -- Return existing appointment without creating a duplicate
            RETURN jsonb_build_object(
                'success', true,
                'appointment_id', v_existing_apt_id,
                'reason_code', 'ok'
            );
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 6: Service validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    SELECT tenant_id, active, duration
    INTO v_service_tenant_id, v_service_active, v_service_duration
    FROM public.services
    WHERE id = p_service_id;

    IF NOT FOUND OR v_service_tenant_id IS DISTINCT FROM v_tenant_id OR v_service_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_service'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 7: Staff validation — must belong to this tenant and be active
    -- -----------------------------------------------------------------------
    SELECT tenant_id, active
    INTO v_staff_tenant_id, v_staff_active
    FROM public.staff
    WHERE id = p_staff_id;

    IF NOT FOUND OR v_staff_tenant_id IS DISTINCT FROM v_tenant_id OR v_staff_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_staff'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 8: Staff-service mapping must exist
    -- -----------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM public.staff_services
        WHERE staff_id = p_staff_id AND service_id = p_service_id
    ) INTO v_staff_service_exists;

    IF NOT v_staff_service_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'invalid_staff'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 9: Date/time must be strictly in the future
    -- -----------------------------------------------------------------------
    v_now_utc := now() AT TIME ZONE 'UTC';
    v_apt_ts  := (p_appointment_date::text || ' ' || p_appointment_time::text)::timestamptz AT TIME ZONE 'Europe/Istanbul';

    IF v_apt_ts <= v_now_utc THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'outside_availability'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 10: Availability rule check
    --   weekday: 0=Sunday, 1=Monday ... 6=Saturday (EXTRACT DOW from date)
    --   selected time must be within an active rule for this staff
    --   and the slot must end before/at the rule's end_time
    -- -----------------------------------------------------------------------
    v_weekday   := EXTRACT(DOW FROM p_appointment_date)::integer;
    v_apt_end_time := (p_appointment_time + (COALESCE(v_service_duration, 60) || ' minutes')::interval)::time;

    SELECT start_time, end_time
    INTO v_avail_start, v_avail_end
    FROM public.availability_rules
    WHERE staff_id  = p_staff_id
      AND tenant_id = v_tenant_id
      AND weekday   = v_weekday
      AND is_active = true
      AND start_time <= p_appointment_time
      AND end_time   >= v_apt_end_time
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'outside_availability'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- Gate 11: Slot conflict — lock existing appointments for the staff/date
    --   to prevent concurrent double booking
    -- -----------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE staff_id         = p_staff_id
          AND tenant_id        = v_tenant_id
          AND appointment_date = p_appointment_date
          AND appointment_time = p_appointment_time
          AND status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'no_show')
        FOR UPDATE SKIP LOCKED
    ) INTO v_slot_conflict;

    IF v_slot_conflict THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'slot_conflict'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- All gates passed — begin atomic writes
    -- -----------------------------------------------------------------------

    -- Step 1: Resolve or create customer
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

    -- Step 2: Persist booking consent to consent_ledger
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

    -- Step 3: Insert appointment
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

    -- Step 4: Record idempotency key if provided
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        INSERT INTO public.public_booking_idempotency (idempotency_key, tenant_id, appointment_id)
        VALUES (p_idempotency_key, v_tenant_id, v_appointment_id)
        ON CONFLICT (idempotency_key, tenant_id) DO NOTHING;
    END IF;

    -- Step 5: Create appointment access token for self-service management
    -- Token = 32 random bytes hex-encoded; hash stored for lookup
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

    -- -----------------------------------------------------------------------
    -- Return safe response — no personal data, no internal IDs beyond appointment
    -- -----------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'manage_token',   v_token,
        'reason_code',    'ok'
    );

EXCEPTION WHEN OTHERS THEN
    -- Rollback is automatic; return a controlled failure code
    RAISE WARNING 'create_public_booking failed: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
        'success',      false,
        'reason_code',  'temporary_failure'
    );
END;
$$;


-- =========================================================================
-- 3. Explicit Permission Grants
-- =========================================================================

-- Revoke all first for safety
REVOKE EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) FROM PUBLIC;

-- Grant only to anon (public booking) and authenticated (logged-in users)
GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.create_public_booking(
    text, uuid, uuid, date, time,
    text, text, text, boolean, boolean, boolean, text
) TO authenticated;
