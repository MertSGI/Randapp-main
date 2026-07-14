-- 20260714_tenants_update_rls_hardening.sql
-- Forward-only hardening for tenants table policies.
-- Removes broad UPDATE access from tenant owners and strips legacy owner_user_id checks.

DROP POLICY IF EXISTS "Tenant Owner UPDATE own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Tenant Owner/Admin SELECT own tenant" ON public.tenants;

-- Safe SELECT: Authenticated tenant users (owner/staff) can view their own tenant row
CREATE POLICY "Tenant Owner/Admin SELECT own tenant" 
ON public.tenants FOR SELECT TO authenticated 
USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND up.role IN ('tenant_owner', 'staff')
        AND up.tenant_id = tenants.id
    )
);

-- Note: No UPDATE policy is granted to tenant_owner or staff.
-- All platform-controlled fields (status, onboarding_status, public_site_status, plan/subscription, etc.)
-- remain writable exclusively by Super Admins via "Super Admins - Full Access on tenants" or backend service roles.
