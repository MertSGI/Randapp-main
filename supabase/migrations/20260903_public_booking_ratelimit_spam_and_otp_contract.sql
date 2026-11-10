-- ==============================================================================
-- LARI PILOT 4: CANDIDATE MIGRATION (ADIM-010 / V1-WQ-07)
-- File: 20260903_public_booking_ratelimit_spam_and_otp_contract.sql
-- Purpose: Public Booking Server-Side Rate-Limiting, Spam Protection, and Secure OTP Contract
-- Target: Real server-side enforcement of burst/daily quotas, brute-force locking,
--         single-use OTP token consumption, tenant isolation, and synthetic-only outbox queueing.
-- Notice: CANDIDATE ONLY. Do NOT execute on live/remote production databases automatically.
-- ==============================================================================

-- 1. Upstream alignment safeguard (Guardrail 2)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_token TEXT;
ALTER TABLE public.communication_outbox ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'synthetic_outbox_only';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS require_otp_for_booking BOOLEAN DEFAULT false;

-- 2. Server-side Rate Limit Events Ledger
CREATE TABLE IF NOT EXISTS public.public_booking_rate_limit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    customer_phone TEXT,
    client_fingerprint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pbrl_tenant_phone_time 
    ON public.public_booking_rate_limit_events (tenant_id, customer_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pbrl_tenant_fp_time 
    ON public.public_booking_rate_limit_events (tenant_id, client_fingerprint, created_at DESC);

ALTER TABLE public.public_booking_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_booking_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.public_booking_rate_limit_events TO service_role;

DROP POLICY IF EXISTS "Service role access on public_booking_rate_limit_events" ON public.public_booking_rate_limit_events;
CREATE POLICY "Service role access on public_booking_rate_limit_events"
    ON public.public_booking_rate_limit_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. Server-side Public Booking OTP Challenges Ledger
CREATE TABLE IF NOT EXISTS public.public_booking_otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    client_fingerprint TEXT,
    otp_code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'consumed', 'locked', 'expired')),
    attempts_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    verification_token_hash TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbotp_tenant_phone 
    ON public.public_booking_otp_challenges (tenant_id, customer_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pbotp_tenant_status 
    ON public.public_booking_otp_challenges (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pbotp_token_hash 
    ON public.public_booking_otp_challenges (verification_token_hash)
    WHERE verification_token_hash IS NOT NULL;

ALTER TABLE public.public_booking_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_booking_otp_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.public_booking_otp_challenges TO service_role;

DROP POLICY IF EXISTS "Service role access on public_booking_otp_challenges" ON public.public_booking_otp_challenges;
CREATE POLICY "Service role access on public_booking_otp_challenges"
    ON public.public_booking_otp_challenges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Internal Helper: evaluate_and_record_public_booking_rate_limit
CREATE OR REPLACE FUNCTION public.evaluate_and_record_public_booking_rate_limit(
    p_tenant_id          uuid,
    p_customer_phone     text,
    p_client_fingerprint text DEFAULT NULL,
    p_service_id         uuid DEFAULT NULL,
    p_appointment_date   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_clean_phone       text;
    v_phone_burst_count integer;
    v_fp_burst_count    integer;
    v_daily_appts_count integer;
    v_duplicate_exists  boolean;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\s+', '', 'g');

    -- Check 1: Phone Burst Limit (max 5 booking attempts per 10 minutes per phone on this tenant)
    IF v_clean_phone != '' THEN
        SELECT count(*)
        INTO v_phone_burst_count
        FROM public.public_booking_rate_limit_events
        WHERE tenant_id = p_tenant_id
          AND customer_phone = v_clean_phone
          AND event_type = 'booking_attempt'
          AND created_at > (now() - interval '10 minutes');

        IF v_phone_burst_count >= 5 THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'rate_limit_exceeded',
                'reasonCode', 'rate_limit_exceeded',
                'detail', 'phone_burst_limit_reached'
            );
        END IF;
    END IF;

    -- Check 2: Client Fingerprint Burst Limit (max 10 attempts per 10 minutes on this tenant)
    IF p_client_fingerprint IS NOT NULL AND trim(p_client_fingerprint) != '' THEN
        SELECT count(*)
        INTO v_fp_burst_count
        FROM public.public_booking_rate_limit_events
        WHERE tenant_id = p_tenant_id
          AND client_fingerprint = trim(p_client_fingerprint)
          AND event_type = 'booking_attempt'
          AND created_at > (now() - interval '10 minutes');

        IF v_fp_burst_count >= 10 THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'rate_limit_exceeded',
                'reasonCode', 'rate_limit_exceeded',
                'detail', 'fingerprint_burst_limit_reached'
            );
        END IF;
    END IF;

    -- Check 3: Daily Booking Limit per Phone (max 3 confirmed appointments per date per tenant)
    IF v_clean_phone != '' THEN
        SELECT count(*)
        INTO v_daily_appts_count
        FROM public.appointments
        WHERE tenant_id = p_tenant_id
          AND regexp_replace(COALESCE(phone, ''), '\s+', '', 'g') = v_clean_phone
          AND appointment_date = COALESCE(p_appointment_date, CURRENT_DATE)
          AND status = 'confirmed';

        IF v_daily_appts_count >= 3 THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'rate_limit_exceeded',
                'reasonCode', 'rate_limit_exceeded',
                'detail', 'daily_appointment_limit_reached'
            );
        END IF;
    END IF;

    -- Check 4: Duplicate appointment on same day for same service for same phone
    IF v_clean_phone != '' AND p_appointment_date IS NOT NULL AND p_service_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.appointments
            WHERE tenant_id = p_tenant_id
              AND regexp_replace(COALESCE(phone, ''), '\s+', '', 'g') = v_clean_phone
              AND service_id = p_service_id
              AND appointment_date = p_appointment_date
              AND status = 'confirmed'
        ) INTO v_duplicate_exists;

        IF v_duplicate_exists THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'duplicate_booking_same_day',
                'reasonCode', 'duplicate_booking_same_day',
                'detail', 'existing_confirmed_booking_on_same_service_and_date'
            );
        END IF;
    END IF;

    -- Record the attempt in the rate limit events ledger
    INSERT INTO public.public_booking_rate_limit_events (
        tenant_id,
        event_type,
        customer_phone,
        client_fingerprint,
        metadata
    ) VALUES (
        p_tenant_id,
        'booking_attempt',
        v_clean_phone,
        p_client_fingerprint,
        jsonb_build_object('service_id', p_service_id, 'appointment_date', p_appointment_date)
    );

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'ok', 'reasonCode', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_and_record_public_booking_rate_limit(uuid, text, text, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_record_public_booking_rate_limit(uuid, text, text, uuid, date) TO service_role;

-- 5. Public RPC: request_public_booking_otp
CREATE OR REPLACE FUNCTION public.request_public_booking_otp(
    p_slug               text,
    p_customer_phone     text,
    p_client_fingerprint text DEFAULT NULL,
    p_synthetic_otp_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id           uuid;
    v_tenant_status       text;
    v_onboarding_status   text;
    v_public_site_status  text;
    v_clean_phone         text;
    v_recent_challenge    RECORD;
    v_hourly_count        integer;
    v_raw_code            text;
    v_otp_hash            text;
    v_challenge_id        uuid;
    v_expires_at          timestamptz;
    v_cooldown_remaining  integer;
BEGIN
    -- Validate parameters
    IF p_slug IS NULL OR trim(p_slug) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters', 'reasonCode', 'invalid_parameters');
    END IF;

    IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters', 'reasonCode', 'invalid_parameters');
    END IF;

    v_clean_phone := regexp_replace(p_customer_phone, '\s+', '', 'g');
    IF length(v_clean_phone) < 7 THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_phone', 'reasonCode', 'invalid_phone');
    END IF;

    -- Tenant Resolution & Availability
    SELECT id, status, onboarding_status, public_site_status
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'reasonCode', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- 60-Second Cooldown Check (Status-agnostic: applies to all challenges created within 60s)
    SELECT created_at
    INTO v_recent_challenge
    FROM public.public_booking_otp_challenges
    WHERE tenant_id = v_tenant_id
      AND customer_phone = v_clean_phone
      AND created_at > (now() - interval '60 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        v_cooldown_remaining := 60 - EXTRACT(EPOCH FROM (now() - v_recent_challenge.created_at))::integer;
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'otp_rate_limited',
            'reasonCode', 'otp_rate_limited',
            'cooldown_remaining_seconds', GREATEST(v_cooldown_remaining, 1),
            'cooldownRemainingSeconds', GREATEST(v_cooldown_remaining, 1)
        );
    END IF;

    -- Hourly Rate Limit Check (Max 5 OTP requests per hour per phone per tenant)
    SELECT count(*)
    INTO v_hourly_count
    FROM public.public_booking_otp_challenges
    WHERE tenant_id = v_tenant_id
      AND customer_phone = v_clean_phone
      AND created_at > (now() - interval '1 hour');

    IF v_hourly_count >= 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'otp_rate_limited',
            'reasonCode', 'otp_rate_limited',
            'cooldown_remaining_seconds', 3600,
            'cooldownRemainingSeconds', 3600
        );
    END IF;

    -- OTP Generation (Synthetic Test Mode vs Production Pseudo-Random)
    IF p_synthetic_otp_hash IS NOT NULL AND trim(p_synthetic_otp_hash) != '' THEN
        -- Security Guard (FINDING-ADIM010-001): anon and authenticated roles must NOT pass synthetic hashes!
        IF current_setting('role', true) IN ('anon', 'authenticated')
           OR session_user IN ('anon', 'authenticated')
           OR coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') IN ('anon', 'authenticated') THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'synthetic_hash_forbidden_for_public',
                'reasonCode', 'synthetic_hash_forbidden_for_public',
                'message', 'Sentetik OTP hash parametresi genel istemciler tarafindan kullanilamaz.'
            );
        END IF;

        -- Validate synthetic hash format: exactly 64 lowercase hexadecimal characters
        IF trim(p_synthetic_otp_hash) !~ '^[0-9a-f]{64}$' THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'invalid_synthetic_otp_hash',
                'reasonCode', 'invalid_synthetic_otp_hash',
                'message', 'Gecersiz sentetik OTP hash formati (64 kucuk harfli hex karakter olmalidir).'
            );
        END IF;

        v_otp_hash := lower(trim(p_synthetic_otp_hash));
        v_raw_code := 'SYNTHETIC';
    ELSE
        -- Deterministic 6-digit number formatted as text
        v_raw_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
        v_otp_hash := encode(sha256(v_raw_code::bytea), 'hex');
    END IF;

    v_expires_at := now() + interval '5 minutes';

    -- Insert Challenge (Never store raw code in table, store SHA-256 hash only)
    INSERT INTO public.public_booking_otp_challenges (
        tenant_id,
        customer_phone,
        client_fingerprint,
        otp_code_hash,
        status,
        attempts_count,
        max_attempts,
        expires_at
    ) VALUES (
        v_tenant_id,
        v_clean_phone,
        p_client_fingerprint,
        v_otp_hash,
        'pending',
        0,
        3,
        v_expires_at
    ) RETURNING id INTO v_challenge_id;

    -- Record OTP request in rate limit events
    INSERT INTO public.public_booking_rate_limit_events (
        tenant_id,
        event_type,
        customer_phone,
        client_fingerprint,
        metadata
    ) VALUES (
        v_tenant_id,
        'otp_request',
        v_clean_phone,
        p_client_fingerprint,
        jsonb_build_object('challenge_id', v_challenge_id)
    );

    -- Queue into communication_outbox strictly with delivery_mode = 'synthetic_outbox_only'
    -- INVARIANT: LIVE SMS DISPATCH IS STRICTLY FORBIDDEN!
    INSERT INTO public.communication_outbox (
        tenant_id,
        recipient,
        channel,
        message,
        status,
        delivery_mode,
        metadata
    ) VALUES (
        v_tenant_id::text,
        v_clean_phone,
        'whatsapp',
        'Randevu dogrulama kodunuz: ' || v_raw_code,
        'queued',
        'synthetic_outbox_only',
        jsonb_build_object(
            'event_type', 'booking_otp_challenge',
            'channel', 'whatsapp',
            'delivery_mode', 'synthetic_outbox_only',
            'challenge_id', v_challenge_id,
            'synthetic_otp_code', v_raw_code,
            'notice', 'CANLI_WHATSAPP_VE_SMS_GONDERIMI_YASAK_SYNTHETIC_ONLY'
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'challenge_id', v_challenge_id,
        'challengeId', v_challenge_id,
        'expires_in_seconds', 300,
        'expiresInSeconds', 300,
        'reason_code', 'ok',
        'reasonCode', 'ok'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.request_public_booking_otp(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_public_booking_otp(text, text, text, text) TO anon, authenticated, service_role;

-- 6. Public RPC: verify_public_booking_otp
CREATE OR REPLACE FUNCTION public.verify_public_booking_otp(
    p_slug           text,
    p_challenge_id   uuid,
    p_otp_code       text,
    p_customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_tenant_id       uuid;
    v_clean_phone     text;
    v_challenge       RECORD;
    v_input_hash      text;
    v_new_attempts    integer;
    v_raw_token       text;
    v_token_hash      text;
BEGIN
    -- Validate parameters
    IF p_slug IS NULL OR p_challenge_id IS NULL OR p_otp_code IS NULL OR p_customer_phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_parameters', 'reasonCode', 'invalid_parameters');
    END IF;

    v_clean_phone := regexp_replace(p_customer_phone, '\s+', '', 'g');

    -- Tenant Resolution
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'reasonCode', 'invalid_tenant');
    END IF;

    -- Row Lock Challenge (Prevent race condition & concurrency tamper)
    SELECT *
    INTO v_challenge
    FROM public.public_booking_otp_challenges
    WHERE id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_challenge', 'reasonCode', 'invalid_challenge');
    END IF;

    -- Tenant Isolation Gate (Cross-tenant verification forbidden)
    IF v_challenge.tenant_id != v_tenant_id THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_mismatch', 'reasonCode', 'tenant_mismatch');
    END IF;

    -- Phone Identity Gate
    IF v_challenge.customer_phone != v_clean_phone THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'phone_mismatch', 'reasonCode', 'phone_mismatch');
    END IF;

    -- Brute-Force Locked Gate (Once locked, subsequent submissions, even if correct, remain locked!)
    IF v_challenge.status = 'locked' OR v_challenge.attempts_count >= v_challenge.max_attempts THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'otp_brute_force_locked',
            'reasonCode', 'otp_brute_force_locked',
            'attempts_remaining', 0,
            'attemptsRemaining', 0
        );
    END IF;

    -- Expiration Gate
    IF v_challenge.expires_at <= now() OR v_challenge.status = 'expired' THEN
        UPDATE public.public_booking_otp_challenges
        SET status = 'expired', updated_at = now()
        WHERE id = p_challenge_id;

        RETURN jsonb_build_object('success', false, 'reason_code', 'otp_expired', 'reasonCode', 'otp_expired');
    END IF;

    -- Single-Use State Check
    IF v_challenge.status = 'consumed' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'otp_already_consumed', 'reasonCode', 'otp_already_consumed');
    END IF;

    -- Verify Code Hash
    v_input_hash := encode(sha256(trim(p_otp_code)::bytea), 'hex');

    IF v_input_hash != v_challenge.otp_code_hash THEN
        v_new_attempts := v_challenge.attempts_count + 1;

        IF v_new_attempts >= v_challenge.max_attempts THEN
            UPDATE public.public_booking_otp_challenges
            SET attempts_count = v_new_attempts,
                status = 'locked',
                updated_at = now()
            WHERE id = p_challenge_id;

            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'otp_brute_force_locked',
                'reasonCode', 'otp_brute_force_locked',
                'attempts_remaining', 0,
                'attemptsRemaining', 0
            );
        ELSE
            UPDATE public.public_booking_otp_challenges
            SET attempts_count = v_new_attempts,
                updated_at = now()
            WHERE id = p_challenge_id;

            RETURN jsonb_build_object(
                'success', false,
                'reason_code', 'otp_invalid',
                'reasonCode', 'otp_invalid',
                'attempts_remaining', (v_challenge.max_attempts - v_new_attempts),
                'attemptsRemaining', (v_challenge.max_attempts - v_new_attempts)
            );
        END IF;
    END IF;

    -- Success: generate single-use verification token (32 bytes hex / 64 characters)
    v_raw_token  := encode(sha256((gen_random_uuid()::text || '-' || clock_timestamp()::text || '-' || random()::text)::bytea), 'hex');
    v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

    UPDATE public.public_booking_otp_challenges
    SET status = 'verified',
        verified_at = now(),
        verification_token_hash = v_token_hash,
        updated_at = now()
    WHERE id = p_challenge_id;

    RETURN jsonb_build_object(
        'success', true,
        'verification_token', v_raw_token,
        'verificationToken', v_raw_token,
        'reason_code', 'ok',
        'reasonCode', 'ok'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_public_booking_otp(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_public_booking_otp(text, uuid, text, text) TO anon, authenticated, service_role;

-- 7. Updated create_public_booking with rate-limit, spam, and OTP single-use token consumption
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.create_public_booking(text, uuid, uuid, date, time, text, text, text, text, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_slug                   text,
    p_service_id             uuid,
    p_staff_id               uuid,
    p_appointment_date       date,
    p_appointment_time       time,
    p_customer_name          text,
    p_customer_email         text,
    p_customer_phone         text,
    p_required_consent       boolean,
    p_marketing_consent      boolean DEFAULT false,
    p_reminder_consent       boolean DEFAULT false,
    p_idempotency_key        text    DEFAULT NULL,
    p_branch_id              uuid    DEFAULT NULL,
    p_otp_verification_token text    DEFAULT NULL,
    p_client_fingerprint     text    DEFAULT NULL
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
    v_lock_key              bigint;
    v_stage                 text := 'init';
    v_elig                  jsonb;
    v_action                jsonb;
    v_period_key            text;
    v_usage_res             jsonb;
    v_rl_res                jsonb;
    v_otp_tok_hash          text;
    v_otp_challenge         RECORD;
    v_require_otp           boolean := false;
    v_challenge_to_consume_id uuid := NULL;
BEGIN
    -- Gate 1: Consent
    v_stage := 'consent_validation';
    IF p_required_consent IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'consent_required', 'reasonCode', 'consent_required');
    END IF;

    -- Gate 2: Customer Data
    v_stage := 'customer_data_validation';
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data', 'reasonCode', 'invalid_customer_data');
    END IF;
    IF (p_customer_email IS NULL OR trim(p_customer_email) = '') AND (p_customer_phone IS NULL OR trim(p_customer_phone) = '') THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_customer_data', 'reasonCode', 'invalid_customer_data');
    END IF;

    -- Gate 3: Tenant Resolution
    v_stage := 'tenant_validation';
    SELECT id, status, onboarding_status, public_site_status, COALESCE(require_otp_for_booking, false)
    INTO v_tenant_id, v_tenant_status, v_onboarding_status, v_public_site_status, v_require_otp
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant', 'reasonCode', 'invalid_tenant');
    END IF;

    IF v_tenant_status IS DISTINCT FROM 'active' AND v_tenant_status IS DISTINCT FROM 'manual_active' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    IF v_onboarding_status IS DISTINCT FROM 'completed' OR v_public_site_status IS DISTINCT FROM 'published' THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 4: Commercial Eligibility (H1C)
    v_stage := 'commercial_eligibility';
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF NOT (v_elig->>'eligible')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 4b: Core Booking Feature Gate (H1C)
    v_action := public.assert_tenant_commercial_action_allowed(v_tenant_id, 'core_booking');
    IF NOT (v_action->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Gate 5: Server-Side Rate-Limit & Abuse Protection (V1-WQ-07)
    v_stage := 'rate_limit_evaluation';
    v_rl_res := public.evaluate_and_record_public_booking_rate_limit(
        v_tenant_id,
        p_customer_phone,
        p_client_fingerprint,
        p_service_id,
        p_appointment_date
    );

    IF NOT (v_rl_res->>'allowed')::boolean THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', v_rl_res->>'reason_code',
            'reasonCode', v_rl_res->>'reason_code',
            'detail', v_rl_res->>'detail'
        );
    END IF;

    -- Gate 6: Secure OTP Policy & Single-Use Token Verification (V1-WQ-07)
    v_stage := 'otp_policy_and_token_verification';
    IF v_require_otp AND (p_otp_verification_token IS NULL OR trim(p_otp_verification_token) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'otp_required',
            'reasonCode', 'otp_required',
            'message', 'Bu salon icin rezervasyon oncesi dogrulama kodu zorunludur.'
        );
    END IF;

    IF p_otp_verification_token IS NOT NULL AND trim(p_otp_verification_token) != '' THEN
        v_stage := 'otp_token_verification';
        v_otp_tok_hash := encode(sha256(trim(p_otp_verification_token)::bytea), 'hex');

        SELECT id, tenant_id, customer_phone, status, expires_at
        INTO v_otp_challenge
        FROM public.public_booking_otp_challenges
        WHERE verification_token_hash = v_otp_tok_hash
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'otp_token_invalid_or_consumed', 'reasonCode', 'otp_token_invalid_or_consumed');
        END IF;

        IF v_otp_challenge.tenant_id != v_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'tenant_mismatch', 'reasonCode', 'tenant_mismatch');
        END IF;

        IF v_otp_challenge.status != 'verified' OR v_otp_challenge.expires_at <= now() THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'otp_token_invalid_or_consumed', 'reasonCode', 'otp_token_invalid_or_consumed');
        END IF;

        IF regexp_replace(COALESCE(v_otp_challenge.customer_phone, ''), '\s+', '', 'g') != regexp_replace(COALESCE(p_customer_phone, ''), '\s+', '', 'g') THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'phone_mismatch', 'reasonCode', 'phone_mismatch');
        END IF;

        -- Retain FOR UPDATE lock, but DEFER consumption until appointment is inserted!
        v_challenge_to_consume_id := v_otp_challenge.id;
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
            RETURN jsonb_build_object('success', false, 'reason_code', 'branch_required', 'reasonCode', 'branch_required');
        ELSIF array_length(v_active_branches, 1) IS NULL OR array_length(v_active_branches, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'reasonCode', 'invalid_branch');
        END IF;
    ELSE
        IF NOT (v_effective_branch = ANY(v_active_branches)) THEN
            RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_branch', 'reasonCode', 'invalid_branch');
        END IF;
    END IF;

    -- Concurrency Advisory Lock
    v_stage := 'concurrency_lock';
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' || p_staff_id::text || ':' || p_appointment_date::text,
        0
    );
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Idempotency Replay
    v_stage := 'idempotency_replay';
    DELETE FROM public.public_booking_idempotency WHERE expires_at <= now();

    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
        SELECT appointment_id INTO v_existing_apt_id
        FROM public.public_booking_idempotency
        WHERE idempotency_key = p_idempotency_key AND tenant_id = v_tenant_id;

        IF FOUND THEN
            UPDATE public.appointment_access_tokens
            SET expires_at = now()
            WHERE appointment_id = v_existing_apt_id AND expires_at > now();

            v_token      := encode(sha256((gen_random_uuid()::text || '-' || clock_timestamp()::text || '-' || random()::text)::bytea), 'hex');
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
                'appointmentId',  v_existing_apt_id,
                'manage_token',   v_token,
                'manageToken',    v_token,
                'reason_code',    'ok',
                'reasonCode',     'ok'
            );
        END IF;
    END IF;

    -- Monthly Appointment Quota (H1C)
    v_stage := 'appointment_quota';
    v_period_key := public.resolve_quota_period_key(v_tenant_id, 'max_monthly_appointments');
    v_usage_res := public.consume_commercial_usage(v_tenant_id, 'max_monthly_appointments', v_period_key);
    IF NOT (v_usage_res->>'success')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'booking_unavailable', 'reasonCode', 'booking_unavailable');
    END IF;

    -- Slot Evaluator Engine Execution
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
        RETURN jsonb_build_object('success', false, 'reason_code', v_eval_res->>'reason_code', 'reasonCode', v_eval_res->>'reason_code');
    END IF;

    v_svc_duration := (v_eval_res->>'duration_minutes')::integer;

    -- Customer Upsert
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

    -- Consent Ledger Entries
    v_stage := 'consent_ledger_insert';
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES
        (v_tenant_id::text, v_customer_id::text, 'booking_terms', true, 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'marketing', COALESCE(p_marketing_consent, false), 'rpc_public_booking'),
        (v_tenant_id::text, v_customer_id::text, 'reminders', COALESCE(p_reminder_consent, false), 'rpc_public_booking');

    -- Appointment Creation
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

    -- Atomically consume the OTP verification token now that appointment is guaranteed
    IF v_challenge_to_consume_id IS NOT NULL THEN
        UPDATE public.public_booking_otp_challenges
        SET status = 'consumed',
            consumed_at = now(),
            updated_at = now()
        WHERE id = v_challenge_to_consume_id;
    END IF;

    -- Manage Token Generation
    v_stage := 'token_generation';
    v_token      := encode(sha256((gen_random_uuid()::text || '-' || clock_timestamp()::text || '-' || random()::text)::bytea), 'hex');
    v_token_hash := encode(sha256(v_token::bytea), 'hex');
    v_expires_at := now() + interval '30 days';

    INSERT INTO public.appointment_access_tokens (
        tenant_id, appointment_id, token_hash, expires_at
    ) VALUES (
        v_tenant_id::text, v_appointment_id, v_token_hash, v_expires_at
    );

    -- Idempotency Record
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
        'appointmentId',  v_appointment_id,
        'manage_token',   v_token,
        'manageToken',    v_token,
        'reason_code',    'ok',
        'reasonCode',     'ok'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'reason_code', 'temporary_failure',
        'reasonCode', 'temporary_failure',
        'debug_stage', v_stage,
        'debug_sqlerrm', SQLERRM
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid, text, text) TO anon, authenticated, service_role;
