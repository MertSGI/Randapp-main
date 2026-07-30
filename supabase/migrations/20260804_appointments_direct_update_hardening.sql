-- Migration 29: Appointments Direct-Write Database Policy Hardening (Stage D2B)
-- File: supabase/migrations/20260804_appointments_direct_update_hardening.sql
--
-- PURPOSE:
-- Enforces strict database-level hardening on public.appointments table.
-- Revokes broad direct UPDATE privileges from browser roles (anon, authenticated, PUBLIC).
-- Removes obsolete direct UPDATE RLS policies on public.appointments.
-- Ensures all status mutations MUST route through accepted SECURITY DEFINER RPCs:
--   1. public.admin_update_appointment_status
--   2. public.cancel_public_appointment_by_manage_token
--
-- COMPATIBILITY:
-- SECURITY DEFINER RPCs owned by postgres run with owner privileges and remain 100% functional.
-- SELECT and INSERT policies required for reading dashboard and public booking remain intact.

BEGIN;

-- 1. Explicitly REVOKE direct table UPDATE privileges from browser roles
REVOKE UPDATE ON public.appointments FROM PUBLIC;
REVOKE UPDATE ON public.appointments FROM anon;
REVOKE UPDATE ON public.appointments FROM authenticated;

-- 2. Explicitly REVOKE column-level UPDATE privileges if any exist
REVOKE UPDATE (
  id, tenant_id, branch_id, customer_id, service_id, staff_id,
  user_name, user_email, phone, appointment_date, appointment_time,
  duration_minutes, status, notes, created_at, updated_at
) ON public.appointments FROM PUBLIC, anon, authenticated;

-- 3. Drop obsolete direct UPDATE RLS policies on public.appointments if present
DROP POLICY IF EXISTS "tenant_isolation_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "tenant_isolation_appointments_update_policy" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update_policy" ON public.appointments;
DROP POLICY IF EXISTS "authenticated_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "anon_appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "allow_tenant_owner_update_appointments" ON public.appointments;

-- 4. Preserve existing SELECT and INSERT policies, ensuring RLS remains ENABLED
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

COMMIT;
