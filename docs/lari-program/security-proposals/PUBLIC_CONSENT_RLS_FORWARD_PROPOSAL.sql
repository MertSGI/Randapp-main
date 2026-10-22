-- ============================================================================
-- LARI SECURITY FORWARD PROPOSAL: GATED PUBLIC CONSENT & POLICY RLS REMEDIATION
-- Target Environment: Supabase Staging & Production (GATED - DO NOT EXECUTE)
-- Proposal Status: SOURCE_PROPOSED_ONLY / RLS_PROPOSAL_NOT_ACCEPTED / GATED_STAGING_REMEDIATION
-- Authority: LARI-B04-CORR-20261022-01 (C03 Remediation of WP-K)
-- Dependency Gate: Verified Offline Staging Backup + Staging Clone Parity Test + P0 Security Cutover + Trusted Server Legal Write Endpoint
--
-- DO NOT RUN DIRECTLY IN PRODUCTION OR LIVE STAGING UNTIL ALL GATES ARE MET.
-- ============================================================================

BEGIN;

-- 1. Row Level Security Enforcement & SECURITY DEFINER Compatibility
-- public.create_public_booking is a SECURITY DEFINER function (owned by postgres)
-- that atomically inserts consent rows into public.consent_ledger during anonymous
-- public booking checkout (where auth.uid() IS NULL).
-- Applying FORCE ROW LEVEL SECURITY without a bypass or owner insert policy would
-- cause create_public_booking to fail when its owner role does not hold BYPASSRLS.
-- Therefore, RLS is ENABLED for all untrusted client roles (anon, authenticated)
-- while NO FORCE ROW LEVEL SECURITY preserves trusted table-owner SECURITY DEFINER RPCs.
ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_ledger NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acceptances NO FORCE ROW LEVEL SECURITY;

-- 2. Revoke all direct client write grants (INSERT, UPDATE, DELETE)
-- Untrusted clients (public, anon, authenticated) must NEVER directly insert or modify legal records.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.consent_ledger FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.policy_acceptances FROM public, anon, authenticated;

-- Preserve SELECT grants for authorized reads (strictly filtered by RLS policies below)
GRANT SELECT ON TABLE public.consent_ledger TO anon, authenticated;
GRANT SELECT ON TABLE public.policy_acceptances TO anon, authenticated;

-- 3. Drop unsafe public INSERT policies and over-broad FOR ALL client policies
DROP POLICY IF EXISTS "Allow public insertion during checkout" ON public.consent_ledger;
DROP POLICY IF EXISTS "Allow public insert acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Allow anon insert consent_ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Allow anon insert policy_acceptances" ON public.policy_acceptances;

-- Drop over-broad FOR ALL policy from 20260622 so authenticated tenant owners cannot
-- directly UPDATE or DELETE immutable consent_ledger rows from the client
DROP POLICY IF EXISTS "Owner/Admin manage consent ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Owner/Admin view policy acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "tenant_scoped_policy_acceptances_read" ON public.policy_acceptances;
DROP POLICY IF EXISTS "tenant_scoped_consent_ledger_read" ON public.consent_ledger;

-- 4. Grounded Read Policies Using Verified Staging Schema Columns
-- Verified schema columns (20260620 & live staging metadata):
--   public.policy_acceptances: (id uuid, tenant_id text, user_id text, policy_type text, version text, ip_address text, user_agent text, accepted_at timestamptz)
--   public.consent_ledger:     (id uuid, tenant_id text, customer_id text, consent_type text, is_granted boolean, ip_address text, digital_signature text, created_at timestamptz)
-- Canonical tenant authorization authority (20260622): public.users_profile (NOT app_metadata.tenant_id).

-- 4a. policy_acceptances read policy:
-- Authenticated super_admin or active tenant_owner (via public.users_profile) may read their tenant's rows,
-- or an authenticated user may read rows where policy_acceptances.user_id matches auth.uid()::text.
CREATE POLICY tenant_scoped_policy_acceptances_read ON public.policy_acceptances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id::text = policy_acceptances.tenant_id
          )
        )
    )
    OR (
      policy_acceptances.user_id IS NOT NULL
      AND policy_acceptances.user_id = auth.uid()::text
    )
  );

-- 4b. consent_ledger read policy:
-- Authenticated super_admin or active tenant_owner (via public.users_profile) may read their tenant's rows.
-- UNRESOLVED_IDENTITY_BOUNDARY: public.consent_ledger.customer_id stores public.customers.id::text,
-- which has no verified 1:1 foreign-key binding to auth.uid()::text. Therefore, we do NOT map JWT sub
-- to consent_ledger.customer_id; customer-direct table SELECT on consent_ledger defaults to safe deny.
CREATE POLICY tenant_scoped_consent_ledger_read ON public.consent_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      WHERE up.id = auth.uid()
        AND up.active = true
        AND (
          up.role = 'super_admin'
          OR (
            up.role = 'tenant_owner'
            AND up.tenant_id::text = consent_ledger.tenant_id
          )
        )
    )
  );

-- 5. Scope Boundary Note for public.data_rights_requests
-- Per controller metadata audit, public.data_rights_requests policies are currently
-- owner/admin gated via public.users_profile. Customer self-service data rights requests
-- fail closed in the client until a dedicated server-verified submission RPC is deployed.

-- 6. Trusted Write Ingress Paths
-- (a) Public booking checkout consent capture continues through the existing
--     SECURITY DEFINER RPC public.create_public_booking(p_slug, ...).
-- (b) All other legal policy acceptances and standalone consent mutations remain
--     blocked (UNRESOLVED_IDENTITY_BOUNDARY / RLS_PROPOSAL_NOT_ACCEPTED) until a
--     dedicated server-authoritative RPC or Edge Function is implemented and verified.

COMMIT;
