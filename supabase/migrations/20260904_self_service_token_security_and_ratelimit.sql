-- ==============================================================================
-- LARI PILOT 5: CANDIDATE MIGRATION (ADIM-012 / V1A-SEC-01)
-- File: 20260904_self_service_token_security_and_ratelimit.sql
-- Purpose: Self-Service Token Brute-Force Rate-Limiting, Lockout, and Token Expiry Security
-- Target: Real server-side enforcement of 5-attempt/15-minute brute-force lockout,
--         SHA-256 token matching, zero-PII leak on expired/used tokens, and tenant isolation.
-- Notice: CANDIDATE ONLY. Do NOT execute on live/remote production databases automatically.
-- ==============================================================================

-- 1. Self-Service Token Rate Limit and Lockout Tracking Ledger
CREATE TABLE IF NOT EXISTS public.self_service_token_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_identifier TEXT NOT NULL,
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'fingerprint')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_token_rl_identifier UNIQUE (identifier_type, client_identifier)
);

CREATE INDEX IF NOT EXISTS idx_token_rl_identifier_locked
    ON public.self_service_token_rate_limits (identifier_type, client_identifier, locked_until);

ALTER TABLE public.self_service_token_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.self_service_token_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.self_service_token_rate_limits TO service_role;

DROP POLICY IF EXISTS "Service role access on self_service_token_rate_limits" ON public.self_service_token_rate_limits;
CREATE POLICY "Service role access on self_service_token_rate_limits"
    ON public.self_service_token_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Trusted Client IP Resolution Helper
CREATE OR REPLACE FUNCTION public.resolve_self_service_client_ip(p_fallback_ip text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_raw_headers text;
    v_headers     jsonb;
    v_hdr_map     jsonb := '{}'::jsonb;
    v_key         text;
    v_val         text;
    v_candidate   text;
    v_xff         text;
    v_parts       text[];
    v_ip_text     text;
BEGIN
    BEGIN
        v_raw_headers := current_setting('request.headers', true);
        IF v_raw_headers IS NOT NULL AND trim(v_raw_headers) != '' THEN
            v_headers := v_raw_headers::jsonb;
            IF jsonb_typeof(v_headers) = 'object' THEN
                -- Build lowercased header map
                FOR v_key, v_val IN SELECT key, value#>>'{}' FROM jsonb_each(v_headers)
                LOOP
                    v_hdr_map := jsonb_set(v_hdr_map, ARRAY[lower(v_key)], to_jsonb(v_val));
                END LOOP;

                -- 1. cf-connecting-ip
                v_candidate := v_hdr_map->>'cf-connecting-ip';
                IF v_candidate IS NOT NULL AND trim(v_candidate) != '' THEN
                    BEGIN
                        v_ip_text := host(trim(v_candidate)::inet);
                        IF v_ip_text IS NOT NULL THEN RETURN v_ip_text; END IF;
                    EXCEPTION WHEN OTHERS THEN END;
                END IF;

                -- 2. true-client-ip
                v_candidate := v_hdr_map->>'true-client-ip';
                IF v_candidate IS NOT NULL AND trim(v_candidate) != '' THEN
                    BEGIN
                        v_ip_text := host(trim(v_candidate)::inet);
                        IF v_ip_text IS NOT NULL THEN RETURN v_ip_text; END IF;
                    EXCEPTION WHEN OTHERS THEN END;
                END IF;

                -- 3. fly-client-ip
                v_candidate := v_hdr_map->>'fly-client-ip';
                IF v_candidate IS NOT NULL AND trim(v_candidate) != '' THEN
                    BEGIN
                        v_ip_text := host(trim(v_candidate)::inet);
                        IF v_ip_text IS NOT NULL THEN RETURN v_ip_text; END IF;
                    EXCEPTION WHEN OTHERS THEN END;
                END IF;

                -- 4. x-real-ip
                v_candidate := v_hdr_map->>'x-real-ip';
                IF v_candidate IS NOT NULL AND trim(v_candidate) != '' THEN
                    BEGIN
                        v_ip_text := host(trim(v_candidate)::inet);
                        IF v_ip_text IS NOT NULL THEN RETURN v_ip_text; END IF;
                    EXCEPTION WHEN OTHERS THEN END;
                END IF;

                -- 5. x-forwarded-for: take the RIGHTMOST item
                v_xff := v_hdr_map->>'x-forwarded-for';
                IF v_xff IS NOT NULL AND trim(v_xff) != '' THEN
                    v_parts := string_to_array(v_xff, ',');
                    IF array_length(v_parts, 1) > 0 THEN
                        v_candidate := trim(v_parts[array_length(v_parts, 1)]);
                        BEGIN
                            v_ip_text := host(v_candidate::inet);
                            IF v_ip_text IS NOT NULL THEN RETURN v_ip_text; END IF;
                        EXCEPTION WHEN OTHERS THEN END;
                    END IF;
                END IF;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- If no header IP is found, check if a non-empty fallback IP was provided
    IF p_fallback_ip IS NOT NULL AND trim(p_fallback_ip) != '' THEN
        RETURN trim(lower(p_fallback_ip));
    END IF;

    -- If no fallback IP, check inet_client_addr()
    BEGIN
        IF inet_client_addr() IS NOT NULL THEN
            RETURN host(inet_client_addr());
        END IF;
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN '127.0.0.1';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_self_service_client_ip(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_self_service_client_ip(text) TO service_role;

-- 3. Function to atomically record failed lookup and lock on 5 failures for 15 minutes
-- Strictly internal to service_role and owner context (REVOKED from PUBLIC, anon, authenticated)
CREATE OR REPLACE FUNCTION public.record_self_service_token_lookup_failure(
    p_client_ip text DEFAULT NULL,
    p_client_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_ip text;
    v_clean_fp text;
    v_locked boolean := false;
    v_lock_until timestamptz;
BEGIN
    v_clean_ip := NULLIF(trim(lower(p_client_ip)), '');
    v_clean_fp := NULLIF(trim(lower(p_client_fingerprint)), '');

    IF v_clean_ip IS NOT NULL THEN
        INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type, failure_count, last_failed_at, updated_at)
        VALUES (v_clean_ip, 'ip', 1, now(), now())
        ON CONFLICT (identifier_type, client_identifier)
        DO UPDATE SET
            failure_count = CASE 
                WHEN self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now()
                    THEN self_service_token_rate_limits.failure_count + 1
                WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes'
                    THEN 1
                ELSE self_service_token_rate_limits.failure_count + 1
            END,
            locked_until = CASE
                WHEN (self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now())
                    THEN self_service_token_rate_limits.locked_until
                WHEN (CASE 
                    WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes' THEN 1
                    ELSE self_service_token_rate_limits.failure_count + 1
                END) >= 5
                    THEN now() + interval '15 minutes'
                ELSE NULL
            END,
            last_failed_at = now(),
            updated_at = now()
        RETURNING (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_locked, v_lock_until;
    END IF;

    IF v_clean_fp IS NOT NULL THEN
        INSERT INTO public.self_service_token_rate_limits (client_identifier, identifier_type, failure_count, last_failed_at, updated_at)
        VALUES (v_clean_fp, 'fingerprint', 1, now(), now())
        ON CONFLICT (identifier_type, client_identifier)
        DO UPDATE SET
            failure_count = CASE 
                WHEN self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now()
                    THEN self_service_token_rate_limits.failure_count + 1
                WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes'
                    THEN 1
                ELSE self_service_token_rate_limits.failure_count + 1
            END,
            locked_until = CASE
                WHEN (self_service_token_rate_limits.locked_until IS NOT NULL AND self_service_token_rate_limits.locked_until > now())
                    THEN self_service_token_rate_limits.locked_until
                WHEN (CASE 
                    WHEN self_service_token_rate_limits.last_failed_at < now() - interval '15 minutes' THEN 1
                    ELSE self_service_token_rate_limits.failure_count + 1
                END) >= 5
                    THEN now() + interval '15 minutes'
                ELSE NULL
            END,
            last_failed_at = now(),
            updated_at = now()
        RETURNING (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_locked, v_lock_until;
    END IF;

    RETURN jsonb_build_object(
        'locked', COALESCE(v_locked, false),
        'locked_until', v_lock_until
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_self_service_token_lookup_failure(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_self_service_token_lookup_failure(text, text) TO service_role;

-- 4. Function to check rate limit and lockout state
-- Strictly internal to service_role and owner context (REVOKED from PUBLIC, anon, authenticated)
CREATE OR REPLACE FUNCTION public.check_self_service_token_rate_limit(
    p_client_ip text DEFAULT NULL,
    p_client_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_clean_ip text;
    v_clean_fp text;
    v_is_locked boolean := false;
    v_lock_until timestamptz;
BEGIN
    v_clean_ip := NULLIF(trim(lower(p_client_ip)), '');
    v_clean_fp := NULLIF(trim(lower(p_client_fingerprint)), '');

    IF v_clean_ip IS NOT NULL THEN
        SELECT (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_is_locked, v_lock_until
        FROM public.self_service_token_rate_limits
        WHERE identifier_type = 'ip' AND client_identifier = v_clean_ip;

        IF v_is_locked THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED',
                'locked_until', v_lock_until
            );
        END IF;
    END IF;

    IF v_clean_fp IS NOT NULL THEN
        SELECT (locked_until IS NOT NULL AND locked_until > now()), locked_until
        INTO v_is_locked, v_lock_until
        FROM public.self_service_token_rate_limits
        WHERE identifier_type = 'fingerprint' AND client_identifier = v_clean_fp;

        IF v_is_locked THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED',
                'locked_until', v_lock_until
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason_code', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.check_self_service_token_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_self_service_token_rate_limit(text, text) TO service_role;

-- 5. Drop legacy function signatures to ensure clean signature upgrade
DROP FUNCTION IF EXISTS public.get_public_appointment_by_manage_token(text);
DROP FUNCTION IF EXISTS public.get_public_appointment_by_manage_token(text, text, text);

-- 6. Hardened get_public_appointment_by_manage_token with rate limiting, zero-PII leak and tenant isolation
CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token(
    p_token text,
    p_client_fingerprint text DEFAULT NULL,
    p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_server_ip         text;
    v_clean_fp          text;
    v_rate_check        jsonb;
    v_token_hash        text;
    v_token_record      record;
    v_appointment       record;
    v_service           record;
    v_staff             record;
    v_branch            record;
    v_tenant            record;
BEGIN
    -- Step 1: Derive trusted primary IP bucket server-side
    v_server_ip := public.resolve_self_service_client_ip(p_client_ip);
    v_clean_fp  := NULLIF(trim(lower(p_client_fingerprint)), '');

    -- Step 1.5: Acquire transaction-scoped advisory locks in deterministic order to prevent concurrency races & deadlocks
    IF v_server_ip IS NOT NULL AND v_clean_fp IS NOT NULL THEN
        IF hashtext('self_service_ip:' || v_server_ip) < hashtext('self_service_fp:' || v_clean_fp) THEN
            PERFORM pg_advisory_xact_lock(hashtext('self_service_ip:' || v_server_ip));
            PERFORM pg_advisory_xact_lock(hashtext('self_service_fp:' || v_clean_fp));
        ELSE
            PERFORM pg_advisory_xact_lock(hashtext('self_service_fp:' || v_clean_fp));
            PERFORM pg_advisory_xact_lock(hashtext('self_service_ip:' || v_server_ip));
        END IF;
    ELSIF v_server_ip IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('self_service_ip:' || v_server_ip));
    ELSIF v_clean_fp IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('self_service_fp:' || v_clean_fp));
    END IF;

    -- Step 2: Enforce Rate Limiting & Lockout
    v_rate_check := public.check_self_service_token_rate_limit(v_server_ip, v_clean_fp);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'TOKEN_LOOKUP_RATE_LIMITED');
    END IF;

    -- Step 3: Input hygiene
    IF p_token IS NULL OR length(trim(p_token)) < 32 OR length(trim(p_token)) > 128 THEN
        PERFORM public.record_self_service_token_lookup_failure(v_server_ip, v_clean_fp);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 4: Compute SHA-256 digest
    v_token_hash := encode(sha256(trim(p_token)::bytea), 'hex');

    -- Step 5: Match appointment_access_tokens
    SELECT id, tenant_id, appointment_id, expires_at, used_at
    INTO v_token_record
    FROM public.appointment_access_tokens
    WHERE token_hash = v_token_hash
    LIMIT 1;

    IF NOT FOUND THEN
        PERFORM public.record_self_service_token_lookup_failure(v_server_ip, v_clean_fp);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 6: Check expired or used (Zero-PII leakage, records lookup failure)
    IF v_token_record.used_at IS NOT NULL OR v_token_record.expires_at <= now() THEN
        PERFORM public.record_self_service_token_lookup_failure(v_server_ip, v_clean_fp);
        RETURN jsonb_build_object('success', false, 'reason_code', 'TOKEN_EXPIRED');
    END IF;

    -- Step 7: Resolve appointment record with strict tenant isolation
    SELECT id, tenant_id, branch_id, customer_id, service_id, staff_id,
           user_name, user_email, phone, appointment_date, appointment_time,
           duration_minutes, status, notes
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_token_record.appointment_id
      AND tenant_id::text = v_token_record.tenant_id;

    IF NOT FOUND THEN
        PERFORM public.record_self_service_token_lookup_failure(v_server_ip, v_clean_fp);
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    -- Step 8: Reset failure count on verified success
    IF v_server_ip IS NOT NULL THEN
        UPDATE public.self_service_token_rate_limits
        SET failure_count = 0, locked_until = NULL, updated_at = now()
        WHERE identifier_type = 'ip' AND client_identifier = v_server_ip
          AND (locked_until IS NULL OR locked_until <= now());
    END IF;
    IF v_clean_fp IS NOT NULL THEN
        UPDATE public.self_service_token_rate_limits
        SET failure_count = 0, locked_until = NULL, updated_at = now()
        WHERE identifier_type = 'fingerprint' AND client_identifier = v_clean_fp
          AND (locked_until IS NULL OR locked_until <= now());
    END IF;

    -- Step 9: Join service, staff, branch, tenant details
    SELECT id, name, name_tr, duration, price
    INTO v_service
    FROM public.services
    WHERE id = v_appointment.service_id;

    SELECT id, name, title
    INTO v_staff
    FROM public.staff
    WHERE id = v_appointment.staff_id;

    SELECT id, name, timezone
    INTO v_branch
    FROM public.branches
    WHERE id = v_appointment.branch_id;

    SELECT id, name, official_business_name
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_appointment.tenant_id;

    -- Step 10: Return sanitized response contract
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
    RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_appointment_by_manage_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text, text, text) TO anon, authenticated, service_role;
