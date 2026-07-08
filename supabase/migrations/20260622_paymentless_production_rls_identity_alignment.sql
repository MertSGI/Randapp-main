-- 20260622_paymentless_production_rls_identity_alignment.sql
-- Description: Align paymentless production core tables with users_profile lookup canonical RLS identity model.
-- Drops JWT claim dependent policies from 20260620 and implements users_profile checks + Super Admin bypass.

-- =========================================================================
-- 1. appointment_access_tokens
-- =========================================================================
DROP POLICY IF EXISTS "Allow tenant owner management" ON public.appointment_access_tokens;
DROP POLICY IF EXISTS "Super Admins - Full Access on appointment_access_tokens" ON public.appointment_access_tokens;

CREATE POLICY "Owner/Admin manage appointment tokens" ON public.appointment_access_tokens
    USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on appointment_access_tokens" ON public.appointment_access_tokens
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 2. appointment_change_requests
-- =========================================================================
DROP POLICY IF EXISTS "Allow tenant owner reads and writes" ON public.appointment_change_requests;
DROP POLICY IF EXISTS "Super Admins - Full Access on appointment_change_requests" ON public.appointment_change_requests;

CREATE POLICY "Owner/Admin manage change requests" ON public.appointment_change_requests
    USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on appointment_change_requests" ON public.appointment_change_requests
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 3. communication_outbox
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can read outbox" ON public.communication_outbox;
DROP POLICY IF EXISTS "Super Admins - Full Access on communication_outbox" ON public.communication_outbox;

CREATE POLICY "Owner/Admin view communication outbox" ON public.communication_outbox
    FOR SELECT USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on communication_outbox" ON public.communication_outbox
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 4. audit_events
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can read own audit logs" ON public.audit_events;
DROP POLICY IF EXISTS "Super Admins - Full Access on audit_events" ON public.audit_events;

CREATE POLICY "Owner/Admin view own audit events" ON public.audit_events
    FOR SELECT USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on audit_events" ON public.audit_events
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 5. support_tickets
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owner can manage tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Super Admins - Full Access on support_tickets" ON public.support_tickets;

CREATE POLICY "Owner/Admin manage support tickets" ON public.support_tickets
    USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on support_tickets" ON public.support_tickets
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 6. policy_acceptances
-- =========================================================================
DROP POLICY IF EXISTS "Allow select acceptances for reporting" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Super Admins - Full Access on policy_acceptances" ON public.policy_acceptances;

CREATE POLICY "Owner/Admin view policy acceptances" ON public.policy_acceptances
    FOR SELECT USING (
        tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')) 
        OR user_id = auth.uid()::text
    );

CREATE POLICY "Super Admins - Full Access on policy_acceptances" ON public.policy_acceptances
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 7. consent_ledger
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owners can read/write ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Super Admins - Full Access on consent_ledger" ON public.consent_ledger;

CREATE POLICY "Owner/Admin manage consent ledger" ON public.consent_ledger
    USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on consent_ledger" ON public.consent_ledger
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


-- =========================================================================
-- 8. data_rights_requests
-- =========================================================================
DROP POLICY IF EXISTS "Tenant owners can manage data rights requests" ON public.data_rights_requests;
DROP POLICY IF EXISTS "Super Admins - Full Access on data_rights_requests" ON public.data_rights_requests;

CREATE POLICY "Owner/Admin manage data rights requests" ON public.data_rights_requests
    USING (tenant_id::uuid IN (SELECT tenant_id FROM public.users_profile WHERE id = auth.uid() AND role IN ('tenant_owner', 'admin')));

CREATE POLICY "Super Admins - Full Access on data_rights_requests" ON public.data_rights_requests
    FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
