-- ============================================================================
-- HEALTH TOURISM FOUNDATION SERVER-AUTHORITY TEST SUITE (SLICE 1)
-- ============================================================================

BEGIN;

SELECT plan(32);

-- 1. Schema & Table Structure Tests
SELECT has_table('public', 'ht_referring_agencies', 'ht_referring_agencies table exists');
SELECT has_table('public', 'ht_staff_profiles', 'ht_staff_profiles table exists');
SELECT has_table('public', 'ht_leads', 'ht_leads table exists');

-- 2. RLS Enablement Tests
SELECT table_privs_are('public', 'ht_referring_agencies', 'authenticated', ARRAY['SELECT'], 'ht_referring_agencies accessible via SELECT for authenticated');
SELECT table_privs_are('public', 'ht_leads', 'authenticated', ARRAY['SELECT'], 'ht_leads accessible via SELECT for authenticated');

-- 3. RPC Existence Tests
SELECT has_function('public', 'ht_set_staff_profile', ARRAY['uuid', 'boolean', 'boolean'], 'ht_set_staff_profile RPC exists');
SELECT has_function('public', 'ht_create_referring_agency', ARRAY['text', 'text', 'text', 'text'], 'ht_create_referring_agency RPC exists');
SELECT has_function('public', 'ht_create_public_lead', ARRAY['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'], 'ht_create_public_lead RPC exists');
SELECT has_function('public', 'ht_update_lead_status', ARRAY['uuid', 'text', 'text'], 'ht_update_lead_status RPC exists');
SELECT has_function('public', 'ht_update_lead_agency_attribution', ARRAY['uuid', 'uuid'], 'ht_update_lead_agency_attribution RPC exists');
SELECT has_function('public', 'ht_get_lead', ARRAY['uuid'], 'ht_get_lead RPC exists');
SELECT has_function('public', 'ht_list_leads', ARRAY['text', 'integer', 'integer'], 'ht_list_leads RPC exists');
SELECT has_function('public', 'ht_list_referring_agencies', ARRAY['boolean'], 'ht_list_referring_agencies RPC exists');

-- 4. Create Fixture Tenants & Users
INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'HT Tenant Alpha', 'ht-alpha', 'active', 'completed', 'published'),
  ('b2222222-2222-2222-2222-222222222222', 'HT Tenant Beta', 'ht-beta', 'active', 'completed', 'published')
ON CONFLICT (id) DO NOTHING;

-- Owner Alpha
INSERT INTO public.users_profile (id, tenant_id, role, full_name, email, active)
VALUES ('u1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'tenant_owner', 'Alpha Owner', 'owner@alpha.com', true)
ON CONFLICT (id) DO NOTHING;

-- Staff Alpha
INSERT INTO public.users_profile (id, tenant_id, role, full_name, email, active)
VALUES ('u2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Staff', 'staff@alpha.com', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
VALUES ('s2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'u2222222-2222-2222-2222-222222222222', 'Alpha Staff', true)
ON CONFLICT (id) DO NOTHING;

-- Staff Beta
INSERT INTO public.users_profile (id, tenant_id, role, full_name, email, active)
VALUES ('u3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'staff', 'Beta Staff', 'staff@beta.com', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
VALUES ('s3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'u3333333-3333-3333-3333-333333333333', 'Beta Staff', true)
ON CONFLICT (id) DO NOTHING;


-- 5. Test Public Lead Capture RPC (ht_create_public_lead)
-- Create Referring Agency for Alpha
SELECT set_config('request.jwt.claim.sub', 'u1111111-1111-1111-1111-111111111111', true);
SELECT public.ht_set_staff_profile('s2222222-2222-2222-2222-222222222222', true, true);

SELECT set_config('request.jwt.claim.sub', 'u2222222-2222-2222-2222-222222222222', true);
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
    v_cross_res JSONB;
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
  'Passport number stored correctly in ht_leads table'
);


-- 6. Verify Cross-Tenant Agency Injection Blocked
DO $$
DECLARE
    v_alpha_agency_id UUID;
    v_err_caught BOOLEAN := false;
BEGIN
    SELECT id INTO v_alpha_agency_id FROM public.ht_referring_agencies WHERE name = 'Global Health Travel';

    BEGIN
        -- Attempt to assign Alpha agency to Beta lead
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


-- 7. Verify Audit Event Privacy Boundary (Passport number NOT in audit)
SELECT is(
  (SELECT count(*) FROM public.audit_events WHERE action = 'ht_lead_created' AND payload::text LIKE '%PASSPORT12345%'),
  0::bigint,
  'Audit log payload does NOT contain passport number'
);


-- 8. Verify List Lead Projection Privacy Boundary (Passport number NOT in list projection)
SELECT set_config('request.jwt.claim.sub', 'u2222222-2222-2222-2222-222222222222', true);
SELECT is(
  (public.ht_list_leads(NULL, 10, 0)::text LIKE '%passport_number%'),
  false,
  'ht_list_leads projection explicitly excludes passport_number'
);


-- 9. Verify Cross-Tenant Lead Read Denied
SELECT set_config('request.jwt.claim.sub', 'u3333333-3333-3333-3333-333333333333', true);
-- Beta staff has not been granted HT capability yet
DO $$
DECLARE
    v_err BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM public.ht_list_leads();
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
    END;
    IF NOT v_err THEN
        RAISE EXCEPTION 'Staff without HT capability was allowed to list leads!';
    END IF;
END $$;

SELECT pass('Staff without HT capability denied access to leads');


-- 10. Verify Unauthenticated Access Denied
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE
    v_err BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM public.ht_list_leads();
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
    END;
    IF NOT v_err THEN
        RAISE EXCEPTION 'Unauthenticated caller was allowed to list leads!';
    END IF;
END $$;

SELECT pass('Unauthenticated access to ht_list_leads strictly denied');


-- 11. Verify Lead Status Lifecycle Mutation
SELECT set_config('request.jwt.claim.sub', 'u2222222-2222-2222-2222-222222222222', true);
DO $$
DECLARE
    v_lead_id UUID;
    v_res JSONB;
BEGIN
    SELECT id INTO v_lead_id FROM public.ht_leads WHERE full_name = 'John International';
    v_res := public.ht_update_lead_status(v_lead_id, 'contacted', 'Initial phone call made');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Status update failed: %', v_res;
    END IF;
END $$;

SELECT is(
  (SELECT status FROM public.ht_leads WHERE full_name = 'John International'),
  'contacted',
  'Lead status successfully updated to contacted'
);


-- 12. Verify Invalid Status Rejected
DO $$
DECLARE
    v_lead_id UUID;
    v_err BOOLEAN := false;
BEGIN
    SELECT id INTO v_lead_id FROM public.ht_leads WHERE full_name = 'John International';
    BEGIN
        PERFORM public.ht_update_lead_status(v_lead_id, 'invalid_status_enum');
    EXCEPTION WHEN OTHERS THEN
        v_err := true;
    END;
    IF NOT v_err THEN
        RAISE EXCEPTION 'Invalid lead status transition was allowed!';
    END IF;
END $$;

SELECT pass('Invalid lead status transition rejected');


-- 13. Verify Scope Isolation (No Clinic appointments or encounters created)
SELECT is(
  (SELECT count(*) FROM public.clinic_encounters),
  0::bigint,
  'No Clinic encounters created by Health Tourism lead domain operations'
);

SELECT finish();

ROLLBACK;
