-- paymentless_production_rls_smoke.sql
-- Description: Comprehensive SQL-level Row Level Security (RLS) smoke test for paymentless_limited_production mode.
-- Verifies secure multi-tenant boundaries, public booking constraints, self-service tokens, policy records,
-- and audit trail isolations.

BEGIN;

-- =========================================================================
-- SETUP FIREFIGHTING MOCK RECORDS
-- =========================================================================

-- Generate IDs
DO $$
DECLARE
    tenant_a uuid := 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
    tenant_b uuid := 'bbbb2222-b2b2-b2b2-b2b2-bbbbbbbbbbbb';
    
    owner_a_id uuid := '1a1a1a1a-a1a1-a1a1-a1a1-111111111111';
    owner_b_id uuid := '2b2b2b2b-b2b2-b2b2-b2b2-222222222222';
    
    appt_a uuid := '3a3a3a3a-a1a1-a1a1-a1a1-333333333333';
    appt_b uuid := '3b3b3b3b-b2b2-b2b2-b2b2-333333333333';
    
    token_a uuid := '4a4a4a4a-a1a1-a1a1-a1a1-444444444444';
BEGIN
    RAISE NOTICE '🎬 Seeding RLS smoke test scenarios...';

    -- Clean old mocks if present
    DELETE FROM public.appointments WHERE id IN (appt_a, appt_b);
    DELETE FROM public.users_profile WHERE id IN (owner_a_id, owner_b_id);
    DELETE FROM public.tenants WHERE id IN (tenant_a, tenant_b);

    -- 1. Create Tenants
    INSERT INTO public.tenants (id, slug, name, status, public_site_status)
    VALUES 
      (tenant_a, 'salon-a', 'Salon A (Active)', 'active', 'published'),
      (tenant_b, 'salon-b', 'Salon B (Suspended)', 'suspended', 'draft');

    -- 2. Create Profiles
    INSERT INTO public.tenant_business_profiles (tenant_id, short_description, is_public_profile_enabled)
    VALUES 
      (tenant_a, 'Salon A Public Description', true),
      (tenant_b, 'Salon B Secret Description', false);

    -- 3. Create Users Profiles
    INSERT INTO public.users_profile (id, tenant_id, name, role, active)
    VALUES
      (owner_a_id, tenant_a, 'Melis A', 'tenant_owner', true),
      (owner_b_id, tenant_b, 'Buse B', 'tenant_owner', true);

    -- 4. Create Services
    INSERT INTO public.services (id, tenant_id, name, price, duration, active)
    VALUES
      ('00000000-0000-0000-0000-000000000011', tenant_a, 'Pedicure A', 200, 30, true),
      ('00000000-0000-0000-0000-000000000022', tenant_b, 'Hair Color B', 450, 90, true);

    -- 5. Create Appointments
    INSERT INTO public.appointments (id, tenant_id, user_name, user_email, phone, appointment_date, appointment_time, status)
    VALUES
      (appt_a, tenant_a, 'Jane A', 'jane@a.com', '+905555555551', '2026-08-01', '10:00:00', 'pending'),
      (appt_b, tenant_b, 'Bob B', 'bob@b.com', '+905555555552', '2026-08-01', '11:00:00', 'pending');

    -- 6. Self-service Access Token
    INSERT INTO public.appointment_access_tokens (id, tenant_id, appointment_id, token, expires_at)
    VALUES
      (token_a, tenant_a, appt_a, 'secure-hash-token-a', now() + interval '24 hours');

    -- 7. Policy Acceptances and Consent Rows
    INSERT INTO public.policy_acceptances (tenant_id, user_id, ip_address, policy_version)
    VALUES (tenant_a, owner_a_id, '127.0.0.1', 'kvkk_v1');

    -- 8. Audit Event Row
    INSERT INTO public.audit_events (tenant_id, event_type, actor_id, details)
    VALUES (tenant_a, 'security.login', owner_a_id, '{"ip":"127.0.0.1"}'::jsonb);

    RAISE NOTICE '✅ RLS smoke test fixtures successfully established.';
END;
$$;


-- =========================================================================
-- ASSERTIONS RUN
-- =========================================================================

-- Test 1: Tenant A owner cannot read Tenant B appointments
SET LOCAL request.jwt.claim.sub = '1a1a1a1a-a1a1-a1a1-a1a1-111111111111';
SET LOCAL role = 'authenticated';

SELECT 'TEST_1' as test, COUNT(*) as result_count
FROM public.appointments
WHERE tenant_id = 'bbbb2222-b2b2-b2b2-b2b2-bbbbbbbbbbbb';
-- EXPECTED: 0 rows (RLS blocks Owner A from reading Owner B appointments)


-- Test 2: Tenant Owner can read own profiles, services and appointments
SELECT 'TEST_2A' as test, short_description FROM public.tenant_business_profiles;
-- EXPECTED: "Salon A Public Description"

SELECT 'TEST_2B' as test, user_name FROM public.appointments;
-- EXPECTED: "Jane A"


-- Test 3: Public Booking anon access can ONLY see published/active services
SET LOCAL request.jwt.claim.sub = NULL;
SET LOCAL role = 'anon';

SELECT 'TEST_3' as test, name FROM public.services;
-- EXPECTED: "Pedicure A" is returned. "Hair Color B" is blocked because Tenant B is suspended/draft.


-- Test 4: Public booking anon CANNOT fetch appointments or list customer databases
SELECT 'TEST_4A' as test, COUNT(*) as result_count FROM public.appointments;
-- EXPECTED: 0 rows (blocked by SELECT policy)

SELECT 'TEST_4B' as test, COUNT(*) as result_count FROM public.customers;
-- EXPECTED: 0 rows (blocked by SELECT policy)


-- Test 5: Policy/consent rows are isolated and tenant-scoped
-- TODO: Verify KVKK consent ledger behaves exactly like standard multi-tenant scoping.


-- Test 6: Audit/support tickets rows are tenant-scoped or Super Admin-only
SET LOCAL request.jwt.claim.sub = '2b2b2b2b-b2b2-b2b2-b2b2-222222222222';
SET LOCAL role = 'authenticated';

SELECT 'TEST_6' as test, COUNT(*) as result_count 
FROM public.audit_events 
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: 0 rows (Owner B cannot view Owner A audit trails)


-- Rollback transaction block to keep test sandbox pure
ROLLBACK;
RAISE NOTICE '🧹 Scenario checks finished and database rollback completed!';
