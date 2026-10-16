-- DISPOSABLE TEST FIXTURE ONLY. Never apply this file to a hosted project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ELSE
        ALTER ROLE service_role BYPASSRLS;
    END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.users_profile (
    id uuid PRIMARY KEY,
    tenant_id uuid,
    role text NOT NULL,
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.appointment_access_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    appointment_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used_at timestamptz
);

CREATE TABLE public.appointments (
    id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    status text NOT NULL DEFAULT 'confirmed',
    appointment_date date NOT NULL,
    appointment_time time NOT NULL,
    cancel_reason text,
    cancelled_at timestamptz
);

CREATE TABLE public.appointment_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL,
    appointment_id uuid NOT NULL REFERENCES public.appointments(id),
    request_type text NOT NULL,
    proposed_date date,
    proposed_time time,
    reason text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select by token hash"
    ON public.appointment_access_tokens
    FOR SELECT
    TO PUBLIC
    USING (true);

CREATE POLICY "Owner/Admin manage appointment tokens"
    ON public.appointment_access_tokens
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.users_profile profile
             WHERE profile.id = auth.uid()
               AND profile.active
               AND (
                    profile.role = 'super_admin'
                    OR (
                        profile.role = 'tenant_owner'
                        AND profile.tenant_id = appointment_access_tokens.tenant_id::uuid
                    )
               )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.users_profile profile
             WHERE profile.id = auth.uid()
               AND profile.active
               AND (
                    profile.role = 'super_admin'
                    OR (
                        profile.role = 'tenant_owner'
                        AND profile.tenant_id = appointment_access_tokens.tenant_id::uuid
                    )
               )
        )
    );

GRANT SELECT ON public.users_profile TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.appointment_access_tokens TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_appointment_by_manage_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_match record;
BEGIN
    SELECT token.appointment_id, token.tenant_id
      INTO v_match
      FROM public.appointment_access_tokens token
     WHERE token.token_hash = encode(digest(p_token, 'sha256'), 'hex')
       AND token.expires_at > now()
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment_id', v_match.appointment_id,
        'tenant_id', v_match.tenant_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_appointment_by_manage_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_manage_token(text)
    TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_manage_token(
    p_token text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token public.appointment_access_tokens%ROWTYPE;
BEGIN
    SELECT *
      INTO v_token
      FROM public.appointment_access_tokens token
     WHERE token.token_hash = encode(digest(p_token, 'sha256'), 'hex')
       AND token.expires_at > now()
       AND token.used_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    UPDATE public.appointments
       SET status = 'cancelled_by_customer',
           cancel_reason = p_reason,
           cancelled_at = now()
     WHERE id = v_token.appointment_id
       AND tenant_id = v_token.tenant_id;

    UPDATE public.appointment_access_tokens
       SET used_at = now()
     WHERE id = v_token.id;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment_id', v_token.appointment_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment_by_manage_token(text, text)
    TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_public_appointment_reschedule_by_manage_token(
    p_token text,
    p_requested_date date,
    p_requested_time time,
    p_reason text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_token public.appointment_access_tokens%ROWTYPE;
    v_request_id uuid;
BEGIN
    SELECT *
      INTO v_token
      FROM public.appointment_access_tokens token
     WHERE token.token_hash = encode(digest(p_token, 'sha256'), 'hex')
       AND token.expires_at > now()
       AND token.used_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_token');
    END IF;

    INSERT INTO public.appointment_change_requests (
        tenant_id,
        appointment_id,
        request_type,
        proposed_date,
        proposed_time,
        reason
    ) VALUES (
        v_token.tenant_id,
        v_token.appointment_id,
        'reschedule',
        p_requested_date,
        p_requested_time,
        p_reason
    )
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reason_code', 'ok',
        'appointment_id', v_token.appointment_id,
        'change_request_id', v_request_id,
        'idempotency_key_present', p_idempotency_key IS NOT NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, time, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_public_appointment_reschedule_by_manage_token(text, date, time, text, text)
    TO anon, authenticated, service_role;

CREATE TABLE public.unrelated_permission_fixture (id integer PRIMARY KEY);
GRANT SELECT ON public.unrelated_permission_fixture TO anon;

INSERT INTO public.users_profile (id, tenant_id, role, active) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'tenant_owner', true),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'tenant_owner', true),
    ('10000000-0000-0000-0000-000000000003', NULL, 'super_admin', true);

INSERT INTO public.appointments (id, tenant_id, status, appointment_date, appointment_time) VALUES
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'confirmed', current_date + 7, '10:00'),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'confirmed', current_date + 8, '11:00');

INSERT INTO public.appointment_access_tokens (
    tenant_id,
    appointment_id,
    token_hash,
    expires_at
) VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        encode(digest('fixture-manage-token-a-not-a-secret', 'sha256'), 'hex'),
        now() + interval '1 day'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000002',
        encode(digest('fixture-manage-token-b-not-a-secret', 'sha256'), 'hex'),
        now() + interval '1 day'
    );
