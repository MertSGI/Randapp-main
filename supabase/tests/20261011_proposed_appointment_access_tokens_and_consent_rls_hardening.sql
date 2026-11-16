-- =============================================================================
-- PROPOSAL ONLY — DO NOT DEPLOY TO LIVE/REMOTE WITHOUT EXPLICIT OWNER APPROVAL
-- =============================================================================
-- Proposed Migration: 20261011_proposed_appointment_access_tokens_and_consent_rls_hardening.sql
-- Scope: Isolated / Local PostgreSQL Verification & Restore-Aware Cutover Readiness (ADIM-024)
-- Governance:
--   - Issue #10 remains OPEN as a production blocker (PRODUCTION = NO_GO).
--   - Live / remote Supabase apply is NOT claimed or executed (NO_REMOTE_DB_WRITE).
--   - Canonical + candidate migrations 001..20260904 in supabase/migrations/ remain untouched.
--
-- Part A (PR #4 / 87ab596 — P0 appointment_access_tokens Direct Table Access Hardening):
--   - Drops the pre-hardening open RLS policy "Allow public select by token hash"
--     which used USING (true) on public.appointment_access_tokens.
--   - Revokes all direct table privileges from PUBLIC and anon on
--     public.appointment_access_tokens so anonymous clients cannot enumerate
--     token hashes, appointment_id, or tenant_id via PostgREST.
--   - Preserves all 5 accepted SECURITY DEFINER token RPCs:
--       1. public.create_public_booking
--       2. public.get_public_appointment_by_manage_token
--       3. public.cancel_public_appointment_by_manage_token
--       4. public.request_public_appointment_reschedule_by_manage_token
--       5. public.get_public_pending_reschedule_request_by_manage_token
--
-- Part B (PR #4 / 0ecb848 — consent_ledger & policy_acceptances Forward Hardening):
--   - Replaces broadauthenticated SELECT (auth.role() = 'authenticated') on
--     public.consent_ledger and public.policy_acceptances with tenant-scoped
--     SELECT policies using public.current_user_can_access_tenant(tenant_id::uuid).
--   - Revokes direct client INSERT, UPDATE, DELETE on public.consent_ledger and
--     public.policy_acceptances from PUBLIC, anon, and authenticated (writes
--     occur strictly via SECURITY DEFINER RPCs such as create_public_booking).
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART A: public.appointment_access_tokens Direct Table Access Hardening (P0)
-- =============================================================================

ALTER TABLE public.appointment_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select by token hash" ON public.appointment_access_tokens;
DROP POLICY IF EXISTS "Allow tenant owner management" ON public.appointment_access_tokens;
DROP POLICY IF EXISTS "Owner/Admin manage appointment tokens" ON public.appointment_access_tokens;

REVOKE ALL ON TABLE public.appointment_access_tokens FROM PUBLIC;
REVOKE ALL ON TABLE public.appointment_access_tokens FROM anon;

-- Ensure tenant-scoped read policy for authenticated salon staff/owners remains intact
DROP POLICY IF EXISTS "Tenant Staff - Read own tokens" ON public.appointment_access_tokens;
CREATE POLICY "Tenant Staff - Read own tokens" ON public.appointment_access_tokens
  FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_user_can_access_tenant(tenant_id::uuid)
      ELSE false
    END
  );

-- Direct client writes to appointment_access_tokens are prohibited; tokens are minted/consumed via SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.appointment_access_tokens FROM authenticated;
GRANT SELECT ON TABLE public.appointment_access_tokens TO authenticated;

-- =============================================================================
-- PART B: public.consent_ledger & public.policy_acceptances RLS Hardening
-- =============================================================================

ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;

-- Drop legacy overly broad policies on consent_ledger
DROP POLICY IF EXISTS "Allow public insert to consent ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Tenant Staff - Read own consents" ON public.consent_ledger;
DROP POLICY IF EXISTS "Tenant owners can read/write ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "Allow public insertion during checkout" ON public.consent_ledger;
DROP POLICY IF EXISTS "Owner/Admin manage consent ledger" ON public.consent_ledger;
DROP POLICY IF EXISTS "consent_ledger_tenant_select" ON public.consent_ledger;

-- Drop legacy overly broad policies on policy_acceptances
DROP POLICY IF EXISTS "Allow public insert to policy acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Tenant Staff - Read own policy acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Allow select acceptances for reporting" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Allow public insert acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "Owner/Admin view policy acceptances" ON public.policy_acceptances;
DROP POLICY IF EXISTS "policy_acceptances_tenant_select" ON public.policy_acceptances;

-- Revoke direct table mutations from browser roles (consent rows are written by SECURITY DEFINER RPCs)
REVOKE ALL ON TABLE public.consent_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.consent_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.consent_ledger FROM authenticated;
GRANT SELECT ON TABLE public.consent_ledger TO authenticated;

REVOKE ALL ON TABLE public.policy_acceptances FROM PUBLIC;
REVOKE ALL ON TABLE public.policy_acceptances FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.policy_acceptances FROM authenticated;
GRANT SELECT ON TABLE public.policy_acceptances TO authenticated;

-- Create strict tenant-scoped SELECT policies for authenticated tenant members & super_admin
CREATE POLICY "consent_ledger_tenant_select"
  ON public.consent_ledger
  FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_user_can_access_tenant(tenant_id::uuid)
      ELSE false
    END
  );

CREATE POLICY "policy_acceptances_tenant_select"
  ON public.policy_acceptances
  FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.current_user_can_access_tenant(tenant_id::uuid)
      ELSE false
    END
  );

COMMIT;
