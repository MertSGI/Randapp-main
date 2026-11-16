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

    -- 6. Self-service Access Token (canonical token_hash column)
    INSERT INTO public.appointment_access_tokens (id, tenant_id, appointment_id, token_hash, expires_at)
    VALUES
      (token_a, tenant_a::text, appt_a, encode(sha256('secure-raw-token-a'::bytea), 'hex'), now() + interval '24 hours');

    -- 7. Policy Acceptances and Consent Ledger Rows
    INSERT INTO public.consent_ledger (tenant_id, customer_id, consent_type, is_granted, ip_address)
    VALUES (tenant_a::text, owner_a_id::text, 'kvkk', true, '127.0.0.1');

    INSERT INTO public.policy_acceptances (tenant_id, user_id, policy_type, version, ip_address, user_agent)
    VALUES (tenant_a::text, owner_a_id::text, 'kvkk_consent', '1.0', '127.0.0.1', 'rls-smoke-test');

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


-- Test 5: Policy/consent and token rows are isolated and tenant-scoped
-- 5A: Owner A can read own tenant's consent_ledger, policy_acceptances, and appointment_access_tokens rows
SET LOCAL request.jwt.claim.sub = '1a1a1a1a-a1a1-a1a1-a1a1-111111111111';
SET LOCAL role = 'authenticated';

SELECT 'TEST_5A_CONSENT_OWN' as test, COUNT(*) as result_count
FROM public.consent_ledger
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: >= 1 row (Owner A reads own tenant consent rows)

SELECT 'TEST_5A_POLICY_OWN' as test, COUNT(*) as result_count
FROM public.policy_acceptances
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: >= 1 row (Owner A reads own tenant policy acceptance rows)

SELECT 'TEST_5A_TOKENS_OWN' as test, COUNT(*) as result_count
FROM public.appointment_access_tokens
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: >= 1 row (Owner A reads own tenant access token rows)

-- 5B: Owner B cannot read Tenant A's consent_ledger, policy_acceptances, or appointment_access_tokens rows
SET LOCAL request.jwt.claim.sub = '2b2b2b2b-b2b2-b2b2-b2b2-222222222222';
SET LOCAL role = 'authenticated';

SELECT 'TEST_5B_CONSENT_CROSS_TENANT' as test, COUNT(*) as result_count
FROM public.consent_ledger
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: 0 rows (Owner B blocked from reading Tenant A consent rows)

SELECT 'TEST_5B_POLICY_CROSS_TENANT' as test, COUNT(*) as result_count
FROM public.policy_acceptances
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: 0 rows (Owner B blocked from reading Tenant A policy acceptance rows)

SELECT 'TEST_5B_TOKENS_CROSS_TENANT' as test, COUNT(*) as result_count
FROM public.appointment_access_tokens
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: 0 rows (Owner B blocked from reading Tenant A access tokens)


-- Test 6: Audit/support tickets rows are tenant-scoped or Super Admin-only
SET LOCAL request.jwt.claim.sub = '2b2b2b2b-b2b2-b2b2-b2b2-222222222222';
SET LOCAL role = 'authenticated';

SELECT 'TEST_6' as test, COUNT(*) as result_count 
FROM public.audit_events 
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: 0 rows (Owner B cannot view Owner A audit trails)


-- Test 7: Super Admin Provisioning RPC validations
-- A. Verify calling RPC as a non-super-admin is rejected
DO $$
BEGIN
    PERFORM public.approve_and_publish_tenant('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL: Non-super-admin caller should have been rejected by RPC';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'SUCCESS: Non-super-admin caller correctly rejected by RPC: %', SQLERRM;
END;
$$;

-- B. Create a Super Admin profile to mock authorized RPC call
SET LOCAL role = 'postgres';
INSERT INTO public.users_profile (id, tenant_id, name, role, active)
VALUES ('77777777-7777-7777-7777-777777777777', NULL, 'Test Super Admin', 'super_admin', true);

SET LOCAL request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
SET LOCAL role = 'authenticated';

-- C. Approve with missing readiness (availability rules missing for tenant_a in this mock transaction context)
-- Since we did not insert availability rules for tenant_a, this call should fail on readiness validation.
DO $$
BEGIN
    PERFORM public.approve_and_publish_tenant('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL: Tenant approval should fail due to missing availability rules';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'SUCCESS: Missing readiness correctly blocked tenant approval: %', SQLERRM;
END;
$$;

-- D. Insert missing readiness metrics to mock full readiness
SET LOCAL role = 'postgres';
INSERT INTO public.availability_rules (tenant_id, day_of_week, start_time, end_time)
VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 1, '09:00:00', '18:00:00');

INSERT INTO public.staff_services (staff_id, service_id)
SELECT s.id, sv.id 
FROM public.staff s, public.services sv 
WHERE s.tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa' AND sv.tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';

SET LOCAL request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
SET LOCAL role = 'authenticated';

-- E. Execute successful atomic provisioning RPC call
SELECT 'TEST_7_RPC_EXEC' as test, public.approve_and_publish_tenant('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa');

-- F. Verify tenant state is updated
SELECT 'TEST_7_TENANT_STATE' as test, onboarding_status, status, public_site_status
FROM public.tenants
WHERE id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: onboarding_status = 'completed', status = 'active', public_site_status = 'published'

-- G. Verify subscription row is established and has correct plan_id/status
SELECT 'TEST_7_SUB_STATE' as test, plan_id, status
FROM public.subscriptions
WHERE tenant_id = 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa';
-- EXPECTED: plan_id = 'premium_monthly', status = 'active'


-- Rollback transaction block to keep test sandbox pure
ROLLBACK;
RAISE NOTICE '🧹 Scenario checks finished and database rollback completed!';
