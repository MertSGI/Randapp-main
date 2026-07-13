-- 20260713_communication_outbox_rls_hardening.sql
-- Forward-only hardening for communication_outbox policies.
-- Removes broad USING (true) write access and replaces it with explicit tenant/role scoping.

DROP POLICY IF EXISTS "System/Admin can manage outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Tenant owner can read outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Owner/Admin view communication outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Full Access on communication_outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Tenant Owner/Staff - Read own communication_outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Manage communication_outbox" ON public.communication_outbox;

CREATE POLICY "Tenant Owner/Staff - Read own communication_outbox"
ON public.communication_outbox
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users_profile up
    WHERE up.id = auth.uid()
      AND up.active = true
      AND up.role IN ('tenant_owner', 'staff')
      AND up.tenant_id = communication_outbox.tenant_id::uuid
  )
);

CREATE POLICY "Super Admins - Manage communication_outbox"
ON public.communication_outbox
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Server-side delivery workers must use Supabase service-role credentials from Edge Functions or backend jobs.
-- The service role bypasses RLS; no public, anon, or general authenticated write policy is granted here.