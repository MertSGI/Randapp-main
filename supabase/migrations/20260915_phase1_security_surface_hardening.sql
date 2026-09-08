-- 20260915_phase1_security_surface_hardening.sql
-- Description: Program V2 Phase 1.1 Foundation Security Hardening.
-- Findings resolved:
--   S-01: Revoke direct public/anon privileges on public.ht_rate_limit_buckets, enable RLS, preserve internal SECURITY DEFINER access.
--   S-02: Fix search_path = pg_catalog, public and revoke public/anon EXECUTE on get_user_role and get_user_tenant_id.
--   S-03: Fix search_path = pg_catalog, public and revoke public/anon EXECUTE on is_super_admin.
--   S-04: Fix search_path = pg_catalog, public on update_updated_at_column and update_tenant_business_profiles_updated_at_column.

-- =========================================================================
-- Finding S-01: Hardening public.ht_rate_limit_buckets table & RLS
-- =========================================================================
-- Revoke all direct privileges on table from public and non-admin roles
REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets FROM authenticated;

-- Enable RLS to enforce no direct browser/REST access by default
ALTER TABLE public.ht_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Preserve service_role and postgres privileges for administration & maintenance
GRANT ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.ht_rate_limit_buckets TO postgres;

-- =========================================================================
-- Finding S-02: Identity Helper Metadata Disclosure Hardening
-- =========================================================================
-- Recreate get_user_role with fixed search_path = pg_catalog, public
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    u_role text;
BEGIN
    SELECT role INTO u_role FROM public.users_profile WHERE id = user_id AND active = true;
    RETURN u_role;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;

-- Recreate get_user_tenant_id with fixed search_path = pg_catalog, public
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    u_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO u_tenant_id FROM public.users_profile WHERE id = user_id AND active = true;
    RETURN u_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_tenant_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id(uuid) TO service_role;

-- =========================================================================
-- Finding S-03: Super Admin Validation Helper Hardening
-- =========================================================================
-- Recreate is_super_admin with fixed search_path = pg_catalog, public
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users_profile 
        WHERE id = user_id AND role = 'super_admin'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;

-- =========================================================================
-- Finding S-04: Trigger Helper search_path Hardening
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_business_profiles_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
