-- p2a_managed_runtime_bootstrap.sql
-- DISPOSABLE TEST COMPATIBILITY FIXTURE ONLY.
-- THIS IS NOT A PRODUCTION MIGRATION AND IS NOT DEPLOYED TO STAGING OR PRODUCTION.
-- It creates only the minimal hosted-Supabase-like DB primitives (auth schema, auth.uid(), auth.jwt(), roles, extensions)
-- required to execute LARI repository SQL migrations and tests in an isolated disposable Postgres container.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
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
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  role text DEFAULT 'authenticated',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Managed Supabase auth.jwt() compatibility helper
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims_str text;
  sub_val text;
  role_val text;
  tenant_val text;
  fallback_json jsonb := '{}'::jsonb;
BEGIN
  claims_str := current_setting('request.jwt.claims', true);
  IF claims_str IS NOT NULL AND claims_str <> '' THEN
    BEGIN
      RETURN claims_str::jsonb;
    EXCEPTION WHEN OTHERS THEN
      -- Invalid JSON string, fall through to individual claim settings
    END;
  END IF;

  sub_val := current_setting('request.jwt.claim.sub', true);
  role_val := current_setting('request.jwt.claim.role', true);
  tenant_val := current_setting('request.jwt.claim.tenant_id', true);

  IF (sub_val IS NULL OR sub_val = '') AND (role_val IS NULL OR role_val = '') AND (tenant_val IS NULL OR tenant_val = '') THEN
    RETURN NULL;
  END IF;

  IF sub_val IS NOT NULL AND sub_val <> '' THEN
    fallback_json := jsonb_set(fallback_json, '{sub}', to_jsonb(sub_val));
  END IF;
  IF role_val IS NOT NULL AND role_val <> '' THEN
    fallback_json := jsonb_set(fallback_json, '{role}', to_jsonb(role_val));
  END IF;
  IF tenant_val IS NOT NULL AND tenant_val <> '' THEN
    fallback_json := jsonb_set(fallback_json, '{tenant_id}', to_jsonb(tenant_val));
  END IF;

  RETURN fallback_json;
END;
$$;

-- Managed Supabase auth.uid() compatibility helper
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt()->>'sub', '')::uuid,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
$$;

-- Managed Supabase auth.role() compatibility helper
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt()->>'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  );
$$;

-- Managed Supabase auth.email() compatibility helper
CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt()->>'email',
    NULLIF(current_setting('request.jwt.claim.email', true), '')
  );
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON TABLE auth.users TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated, service_role;

-- BOOTSTRAP SELF-TEST
DO $$
DECLARE
  v_uid uuid;
  v_jwt jsonb;
  v_test_sub text := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- A. No JWT context
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.tenant_id', '', true);

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Self-test failed: auth.uid() should be null when no claims are set';
  END IF;

  IF auth.jwt() IS NOT NULL THEN
    RAISE EXCEPTION 'Self-test failed: auth.jwt() should be null when no claims are set';
  END IF;

  -- B. Set test sub claim via individual setting
  PERFORM set_config('request.jwt.claim.sub', v_test_sub, true);
  v_uid := auth.uid();
  IF v_uid IS NULL OR v_uid::text <> v_test_sub THEN
    RAISE EXCEPTION 'Self-test failed: auth.uid() (%) does not match expected sub (%)', v_uid, v_test_sub;
  END IF;

  -- C. Set JSON JWT claims
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","tenant_id":"tenant_test_123"}', true);
  v_jwt := auth.jwt();
  IF v_jwt IS NULL OR v_jwt->>'sub' <> v_test_sub OR v_jwt->>'role' <> 'authenticated' OR v_jwt->>'tenant_id' <> 'tenant_test_123' THEN
    RAISE EXCEPTION 'Self-test failed: auth.jwt() claims invalid: %', v_jwt;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL OR v_uid::text <> v_test_sub THEN
    RAISE EXCEPTION 'Self-test failed: auth.uid() (%) under json claims does not match expected sub (%)', v_uid, v_test_sub;
  END IF;

  -- D. Clear claims and confirm no stale claim remains
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.tenant_id', '', true);

  IF auth.uid() IS NOT NULL OR auth.jwt() IS NOT NULL THEN
    RAISE EXCEPTION 'Self-test failed: stale claims remaining after clear';
  END IF;

  RAISE NOTICE 'AUTH HELPER BOOTSTRAP SELF-TEST PASSED';
END;
$$;
