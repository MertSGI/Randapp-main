-- ============================================================================
-- HEALTH TOURISM FOUNDATION SERVER-AUTHORITY TEST SUITE (SLICE 1-R4)
-- ============================================================================

BEGIN;

SELECT plan(32);

-- 1. Schema & Table Structure Tests (3 assertions)
SELECT has_table('public', 'ht_referring_agencies', 'ht_referring_agencies table exists');
SELECT has_table('public', 'ht_staff_profiles', 'ht_staff_profiles table exists');
SELECT has_table('public', 'ht_leads', 'ht_leads table exists');

-- 2. RLS & Direct Table Access Isolation Tests (3 assertions)
-- Direct table SELECT on ht_leads is revoked for authenticated and anon to protect sensitive PII
SELECT table_privs_are('public', 'ht_referring_agencies', 'authenticated', ARRAY[]::text[], 'ht_referring_agencies direct table access revoked for authenticated');
SELECT table_privs_are('public', 'ht_leads', 'authenticated', ARRAY[]::text[], 'ht_leads direct table access revoked for authenticated');
SELECT table_privs_are('public', 'ht_leads', 'anon', ARRAY[]::text[], 'ht_leads direct table access revoked for anon');

-- 3. RPC Existence Tests (8 assertions)
SELECT has_function('public', 'ht_set_staff_profile', ARRAY['uuid', 'boolean', 'boolean'], 'ht_set_staff_profile RPC exists');
SELECT has_function('public', 'ht_create_referring_agency', ARRAY['text', 'text', 'text', 'text'], 'ht_create_referring_agency RPC exists');
SELECT has_function('public', 'ht_create_public_lead', ARRAY['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'], 'ht_create_public_lead RPC exists');
SELECT has_function('public', 'ht_update_lead_status', ARRAY['uuid', 'text', 'text'], 'ht_update_lead_status RPC exists');
SELECT has_function('public', 'ht_update_lead_agency_attribution', ARRAY['uuid', 'uuid'], 'ht_update_lead_agency_attribution RPC exists');
SELECT has_function('public', 'ht_get_lead', ARRAY['uuid'], 'ht_get_lead RPC exists');
SELECT has_function('public', 'ht_list_leads', ARRAY['text', 'integer', 'integer'], 'ht_list_leads RPC exists');
SELECT has_function('public', 'ht_list_referring_agencies', ARRAY['boolean'], 'ht_list_referring_agencies RPC exists');

-- 4. Create Fixture Tenants, Auth Users, Users Profiles, and Staff (RFC Hexadecimal UUIDs)
INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'HT Tenant Alpha', 'ht-alpha', 'active', 'completed', 'published'),
  ('b2222222-2222-2222-2222-222222222222', 'HT Tenant Beta', 'ht-beta', 'active', 'completed', 'published')
ON CONFLICT (id) DO NOTHING;

-- Materialize Synthetic Auth Users (auth.users)
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'owner@ht-alpha.example.invalid'),
  ('a2222222-2222-4222-8222-222222222222', 'staff@ht-alpha.example.invalid'),
  ('a3333333-3333-4333-8333-333333333333', 'staff@ht-beta.example.invalid')
ON CONFLICT (id) DO NOTHING;

-- Materialize Users Profiles (public.users_profile using canonical name column)
INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'tenant_owner', 'Alpha Owner', true),
  ('a2222222-2222-4222-8222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Staff', true),
  ('a3333333-3333-4333-8333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'staff', 'Beta Staff', true)
ON CONFLICT (id) DO NOTHING;

-- Materialize Staff Rows (public.staff)
INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
  ('b2222222-2222-4222-8222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'Alpha Staff', true),
  ('b3333333-3333-4333-8333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'a3333333-3333-4333-8333-333333333333', 'Beta Staff', true)
ON CONFLICT (id) DO NOTHING;


-- 5. Test Public Lead Capture RPC (ht_create_public_lead) (5 assertions)
-- Create Referring Agency for Alpha
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT public.ht_set_staff_profile('b2222222-2222-4222-8222-222222222222', true, true);

SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT is(
  (public.ht_create_referring_agency('Global Health Travel', 'GHT01', 'info@ght.com', '+1234567890')->>'success')::boolean,
  true,
  'Staff can create tenant referring agency'
);

-- Store agency_id
DO $$
DECLARE
    v_agency_id UUID;
    v_lead_res JSONB;
BEGIN
    SELECT id INTO v_agency_id FROM public.ht_referring_agencies WHERE name = 'Global Health Travel';

    -- Public lead creation with valid inputs
    v_lead_res := public.ht_create_public_lead(
        'ht-alpha',
        'John International',
        'john@example.com',
        '+447911123456',
        'de',
        'DE',
        'PASSPORT12345',
        'agency_referral',
        v_agency_id
    );

    IF (v_lead_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Public lead creation failed: %', v_lead_res;
    END IF;
END $$;

SELECT is(
  (SELECT count(*) FROM public.ht_leads WHERE full_name = 'John International'),
  1::bigint,
  'Public lead successfully inserted in ht_leads'
);

SELECT is(
  (SELECT preferred_language FROM public.ht_leads WHERE full_name = 'John International'),
  'de',
  'Preferred language stored correctly'
);

SELECT is(
  (SELECT country_code FROM public.ht_leads WHERE full_name = 'John International'),
  'DE',
  'Country code stored correctly'
);

SELECT is(
  (SELECT passport_number FROM public.ht_leads WHERE full_name = 'John International'),
  'PASSPORT12345',
  'Optional passport number successfully stored in DB by public intake'
);


-- 6. Verify Cross-Tenant Agency Injection Blocked (1 assertion)
DO $$
DECLARE
    v_alpha_agency_id UUID;
    v_err_caught BOOLEAN := false;
BEGIN
    SELECT id INTO v_alpha_agency_id FROM public.ht_referring_agencies WHERE name = 'Global Health Travel';

    BEGIN
        PERFORM public.ht_create_public_lead(
            'ht-beta',
            'Cross Tenant Lead',
            'cross@example.com',
            '+111111111',
            'en',
            'US',
            NULL,
            'web',
            v_alpha_agency_id
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CROSS_TENANT_VIOLATION%' THEN
            v_err_caught := true;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'Cross-tenant agency injection was NOT blocked!';
    END IF;
END $$;

SELECT pass('Cross-tenant agency injection rejected by ht_create_public_lead');


-- 7. Verify Audit Event Privacy Boundary (Passport number NOT in audit) (1 assertion)
SELECT is(
  (SELECT count(*) FROM public.audit_events WHERE action = 'ht_lead_created' AND payload::text LIKE '%PASSPORT12345%'),
  0::bigint,
  'Audit log payload does NOT contain passport number'
);


-- 8. Verify Read Projections Privacy Boundary (Passport number NOT in getLead or listLeads) (2 assertions)
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);

SELECT is(
  ((public.ht_get_lead((SELECT id FROM public.ht_leads WHERE full_name = 'John International'))->'lead') ? 'passport_number'),
  false,
  'ht_get_lead explicitly excludes passport_number from response'
);

SELECT is(
  (public.ht_list_leads(NULL, 10, 0)::text LIKE '%passport_number%'),
  false,
  'ht_list_leads projection explicitly excludes passport_number'
);


-- 9. Verify Unauthorized HT Staff Access Denied (1 assertion)
-- Beta staff (a3333333-3333-4333-8333-333333333333) has active staff identity but NO ht_staff_profiles row
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
DO $$
DECLARE
    v_err_caught BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM public.ht_list_leads();
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FORBIDDEN%' AND SQLERRM LIKE '%lacks HT lead view permission%' THEN
            v_err_caught := true;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'Staff without HT capability was allowed to call ht_list_leads or emitted unexpected error contract!';
    END IF;
END $$;

SELECT pass('Staff without HT capability denied access to ht_list_leads');


-- 10. Verify Status Audit Correctness (previous_status = new, new_status = contacted) (1 assertion)
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE
    v_lead_id UUID;
    v_res JSONB;
    v_audit RECORD;
BEGIN
    SELECT id INTO v_lead_id FROM public.ht_leads WHERE full_name = 'John International';
    v_res := public.ht_update_lead_status(v_lead_id, 'contacted', 'Initial call completed');

    SELECT payload INTO v_audit
    FROM public.audit_events
    WHERE action = 'ht_lead_status_updated' AND resource_id = v_lead_id::text
    ORDER BY created_at DESC LIMIT 1;

    IF v_audit.payload->>'previous_status' <> 'new' OR v_audit.payload->>'new_status' <> 'contacted' THEN
        RAISE EXCEPTION 'Status audit incorrect: previous_status=%, new_status=%', v_audit.payload->>'previous_status', v_audit.payload->>'new_status';
    END IF;
END $$;

SELECT pass('Lead status update records accurate previous_status=new and new_status=contacted in audit log');


-- 11. Verify Generic Status Update Denies Setting 'converted' (1 assertion)
DO $$
DECLARE
    v_lead_id UUID;
    v_err_caught BOOLEAN := false;
BEGIN
    SELECT id INTO v_lead_id FROM public.ht_leads WHERE full_name = 'John International';
    BEGIN
        PERFORM public.ht_update_lead_status(v_lead_id, 'converted');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INVALID_TRANSITION%' AND SQLERRM LIKE '%converted%' THEN
            v_err_caught := true;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'ht_update_lead_status allowed setting converted status directly!';
    END IF;
END $$;

SELECT pass('ht_update_lead_status denies setting converted status directly');


-- 12. Verify Real Row Pagination in ht_list_leads (1 assertion)
DO $$
DECLARE
    v_lead_a_id UUID;
    v_lead_b_id UUID;
    v_page1 JSONB;
    v_page2 JSONB;
    v_id1 TEXT;
    v_id2 TEXT;
BEGIN
    -- Create 2 additional leads for pagination testing
    PERFORM public.ht_create_public_lead('ht-alpha', 'Lead Alpha Second', 'lead2@example.com', NULL);
    PERFORM public.ht_create_public_lead('ht-alpha', 'Lead Alpha Third', 'lead3@example.com', NULL);

    -- Fetch page 1 (limit=1, offset=0) and page 2 (limit=1, offset=1)
    v_page1 := public.ht_list_leads(NULL, 1, 0);
    v_page2 := public.ht_list_leads(NULL, 1, 1);

    v_id1 := v_page1->'leads'->0->>'id';
    v_id2 := v_page2->'leads'->0->>'id';

    IF jsonb_array_length(v_page1->'leads') <> 1 OR jsonb_array_length(v_page2->'leads') <> 1 THEN
        RAISE EXCEPTION 'Pagination limit 1 did not return exactly 1 lead per page!';
    END IF;

    IF v_id1 = v_id2 THEN
        RAISE EXCEPTION 'Pagination offset 1 returned identical lead as offset 0!';
    END IF;
END $$;

SELECT pass('ht_list_leads handles real row pagination (limit 1 offset 0 vs limit 1 offset 1 differ)');


-- 13. Verify Direct Table Access Denials for Authenticated & Anon Roles (2 assertions)
-- A. Authenticated direct table SELECT attempt
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT set_config('role', 'authenticated', true);

DO $$
DECLARE
    v_err BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM count(*) FROM public.ht_leads;
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
    END;

    IF NOT v_err THEN
        RAISE EXCEPTION 'Direct SELECT on public.ht_leads was allowed for authenticated role!';
    END IF;
END $$;

SELECT pass('Direct table SELECT on public.ht_leads denied for authenticated role');

-- B. Anon direct table SELECT attempt
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('role', 'anon', true);

DO $$
DECLARE
    v_err BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM count(*) FROM public.ht_leads;
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
    END;

    IF NOT v_err THEN
        RAISE EXCEPTION 'Direct SELECT on public.ht_leads was allowed for anon role!';
    END IF;
END $$;

SELECT pass('Direct table SELECT on public.ht_leads denied for anon role');

-- Reset role to postgres superuser for remaining checks
RESET role;
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);


-- 14. Verify Scope Isolation (No Clinic patient/encounter or Core appointment creation) (3 assertions)
SELECT is(
  (SELECT count(*) FROM public.clinic_patient_profiles),
  0::bigint,
  'No Clinic patient profiles created by Health Tourism lead domain operations'
);

SELECT is(
  (SELECT count(*) FROM public.clinic_encounters),
  0::bigint,
  'No Clinic encounters created by Health Tourism lead domain operations'
);

SELECT is(
  (SELECT count(*) FROM public.appointments),
  0::bigint,
  'No Core appointments created by Health Tourism lead domain operations'
);

SELECT finish();

ROLLBACK;
