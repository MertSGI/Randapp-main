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
     WHERE token.token_hash = p_token
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

CREATE TABLE public.unrelated_permission_fixture (id integer PRIMARY KEY);
GRANT SELECT ON public.unrelated_permission_fixture TO anon;

INSERT INTO public.users_profile (id, tenant_id, role, active) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'tenant_owner', true),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'tenant_owner', true),
    ('10000000-0000-0000-0000-000000000003', NULL, 'super_admin', true);

INSERT INTO public.appointment_access_tokens (
    tenant_id,
    appointment_id,
    token_hash,
    expires_at
) VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        'fixture-manage-token-a-not-a-secret',
        now() + interval '1 day'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000002',
        'fixture-manage-token-b-not-a-secret',
        now() + interval '1 day'
    );
