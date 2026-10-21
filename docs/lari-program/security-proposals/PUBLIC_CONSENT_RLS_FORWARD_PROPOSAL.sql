-- ============================================================================
-- LARI SECURITY FORWARD PROPOSAL: GATED PUBLIC CONSENT & POLICY RLS REMEDIATION
-- Target Environment: Supabase Staging & Production
-- Proposal Status: SOURCE_PROPOSED_ONLY / GATED_STAGING_REMEDIATION
-- Authority: LARI-AG-BATCH-20261021-03 (WP-K)
-- Dependency Gate: Verified Offline Staging Backup + Staging Clone Parity Test + P0 Security Cutover
-- 
-- DO NOT RUN DIRECTLY IN PRODUCTION OR LIVE STAGING UNTIL GATES ARE MET.
-- ============================================================================

BEGIN;

-- 1. Ensure Row Level Security is explicitly ENABLED and FORCED
-- Enforce RLS on public.consent_ledger
ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_ledger FORCE ROW LEVEL SECURITY;

-- Enforce RLS on public.policy_acceptances
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acceptances FORCE ROW LEVEL SECURITY;

-- 2. Revoke all direct client write grants (INSERT, UPDATE, DELETE)
-- Untrusted clients (public, anon, authenticated) must NEVER directly insert or modify legal records
REVOKE INSERT, UPDATE, DELETE ON TABLE public.consent_ledger FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.policy_acceptances FROM public, anon, authenticated;

-- Ensure SELECT grants are preserved for authorized reads (subject to RLS policies)
GRANT SELECT ON TABLE public.consent_ledger TO anon, authenticated;
GRANT SELECT ON TABLE public.policy_acceptances TO anon, authenticated;

-- 3. Drop unsafe and overly permissive public INSERT policies
-- Unsafe policy allowing anonymous client write during booking checkout:
DROP POLICY IF EXISTS "Allow public insertion during checkout" ON public.consent_ledger;
DROP POLICY IF EXISTS "Allow public insert acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Allow anon insert consent_ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Allow anon insert policy_acceptances" ON public.policy_acceptances;

-- 4. Preserve and enforce tenant/actor scoped read policy semantics
-- Policy acceptances read policy: authenticated users may only view records for their tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'policy_acceptances' AND policyname = 'tenant_scoped_policy_acceptances_read'
  ) THEN
    CREATE POLICY tenant_scoped_policy_acceptances_read ON public.policy_acceptances
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'sub') = actor_id
      );
  END IF;
END $$;

-- Consent ledger read policy: authenticated users may only view records for their tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'consent_ledger' AND policyname = 'tenant_scoped_consent_ledger_read'
  ) THEN
    CREATE POLICY tenant_scoped_consent_ledger_read ON public.consent_ledger
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'sub') = actor_id
      );
  END IF;
END $$;

-- 5. Scope Boundary Note for public.data_rights_requests
-- NOTE: Per controller metadata audit, public.data_rights_requests policies are currently
-- owner/admin gated. Future sensitive lifecycle changes require server auth validation,
-- but without explicit breaking evidence, we do NOT execute a blanket revoke on that table
-- to avoid breaking existing customer rights submission flows.

-- 6. Future Trusted Server Write Ingress (Service Role Only)
-- All future insertions must be performed exclusively via service_role-backed trusted RPC
-- (e.g., public.record_policy_acceptance_trusted() / public.record_consent_trusted())
-- verifying actor identity, server timestamp, document version from DB, and IP masking.

COMMIT;
