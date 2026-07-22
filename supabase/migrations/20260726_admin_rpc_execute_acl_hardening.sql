-- 20260726_admin_rpc_execute_acl_hardening.sql
-- Description: Minimal forward-only EXECUTE ACL hardening for Stage B.1/B.2 admin RPCs & helpers.
-- Revokes EXECUTE privileges from PUBLIC and anon roles, granting EXECUTE strictly to authenticated.

BEGIN;

REVOKE ALL ON FUNCTION public.get_my_admin_bootstrap()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_admin_bootstrap()
TO authenticated;


REVOKE ALL ON FUNCTION public.get_my_tenant_appointments(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_appointments(uuid)
TO authenticated;


REVOKE ALL ON FUNCTION public.get_my_tenant_dashboard_summary()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_dashboard_summary()
TO authenticated;


REVOKE ALL ON FUNCTION public.current_user_owns_customer(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_owns_customer(uuid, uuid)
TO authenticated;


REVOKE ALL ON FUNCTION public.current_user_can_access_tenant(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_tenant(uuid)
TO authenticated;

COMMIT;
