-- ============================================================================
-- HEALTH TOURISM SLICE 4 BLOCK 2 WORKSPACE EXECUTABLE DB TEST SUITE (20 ASSERTIONS)
-- Target: Disposable PostgreSQL database / Supabase / pgTAP
-- File: supabase/tests/health_tourism_clinic_acceptance_workspace_tests.sql
-- ============================================================================

BEGIN;

SELECT plan(20);

-- ----------------------------------------------------------------------------
-- Fixture Setup (All UUIDs are strict valid hexadecimal UUIDs)
-- ----------------------------------------------------------------------------

-- Tenants
INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Workspace Alpha Tenant', 'ws-alpha', 'active', 'completed', 'published'),
  ('b0000000-0000-0000-0000-000000000002', 'Workspace Beta Tenant', 'ws-beta', 'active', 'completed', 'published')
ON CONFLICT (id) DO NOTHING;

\i supabase/tests/fixtures/slice4_e2_commercial_fixture.sql
SELECT pg_temp.slice4_e2_bootstrap_commercial('a0000000-0000-0000-0000-000000000001');
SELECT pg_temp.slice4_e2_bootstrap_commercial('b0000000-0000-0000-0000-000000000002');

-- Auth Users
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000101', 'ws_manager@alpha.example.invalid'),
  ('a0000000-0000-4000-8000-000000000102', 'ws_nomanage@alpha.example.invalid'),
  ('b0000000-0000-4000-8000-000000000201', 'ws_manager@beta.example.invalid')
ON CONFLICT (id) DO NOTHING;

-- User Profiles
INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-0000-0000-000000000001', 'staff', 'Alpha Manager Staff', true),
  ('a0000000-0000-4000-8000-000000000102', 'a0000000-0000-0000-0000-000000000001', 'staff', 'Alpha NoManage Staff', true),
  ('b0000000-0000-4000-8000-000000000201', 'b0000000-0000-0000-0000-000000000002', 'staff', 'Beta Manager Staff', true)
ON CONFLICT (id) DO NOTHING;

-- Staff
INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
  ('a0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-000000000101', 'Alpha Manager Practitioner', true),
  ('a0000000-0000-0000-0000-000000000502', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-000000000102', 'Alpha NoManage Staff', true),
  ('a0000000-0000-0000-0000-000000000503', 'a0000000-0000-0000-0000-000000000001', NULL, 'Dr. Active Mapped', true),
  ('a0000000-0000-0000-0000-000000000504', 'a0000000-0000-0000-0000-000000000001', NULL, 'Dr. Inactive', false),
  ('a0000000-0000-0000-0000-000000000505', 'a0000000-0000-0000-0000-000000000001', NULL, 'Dr. Unmapped StaffBranch', true),
  ('a0000000-0000-0000-0000-000000000506', 'a0000000-0000-0000-0000-000000000001', NULL, 'Dr. Unmapped StaffService', true),
  ('b0000000-0000-0000-0000-000000000501', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-4000-8000-000000000201', 'Beta Manager Practitioner', true)
ON CONFLICT (id) DO NOTHING;

-- Clinic Staff Profiles
INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000501', true, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000502', false, true, false),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000503', true, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000504', true, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000505', true, true, true),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000506', true, true, true),
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000501', true, true, true)
ON CONFLICT (staff_id) DO NOTHING;

-- Branches
INSERT INTO public.branches (id, tenant_id, name, is_active, is_primary) VALUES
  ('a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', 'Alpha Permitted Branch A', true, true),
  ('a0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000001', 'Alpha Inactive Branch', false, false),
  ('a0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000001', 'Alpha Unpermitted Branch B', true, false),
  ('b0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 'Beta Branch', true, true)
ON CONFLICT (id) DO NOTHING;

-- Services
INSERT INTO public.services (id, tenant_id, name, duration, price, active) VALUES
  ('a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000001', 'Alpha Active Service 45min', 45, 100, true),
  ('a0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000001', 'Alpha Inactive Service', 30, 150, false),
  ('a0000000-0000-0000-0000-000000000303', 'a0000000-0000-0000-0000-000000000001', 'Alpha Unmapped Service', 60, 200, true)
ON CONFLICT (id) DO NOTHING;

-- Junction Mappings
INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000201')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000201'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000503', 'a0000000-0000-0000-0000-000000000201'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000506', 'a0000000-0000-0000-0000-000000000201')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_services (staff_id, service_id) VALUES
  ('a0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000301'),
  ('a0000000-0000-0000-0000-000000000503', 'a0000000-0000-0000-0000-000000000301'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000505', 'a0000000-0000-0000-0000-000000000301')
ON CONFLICT DO NOTHING;

-- Availability Rules:
-- Dr. Active Mapped (503): Mon..Sun 06:00..22:00 (outside standard 08-20 window to test Assertion 16)
INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
SELECT 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000503', w, '06:00'::time, '22:00'::time, true
FROM generate_series(1, 7) w
ON CONFLICT DO NOTHING;

-- Leads
INSERT INTO public.ht_leads (id, tenant_id, status, handoff_state, preferred_language, country_code, full_name, email, phone, passport_number, notes) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'handoff_pending', 'requested', 'en', 'US', 'Alice Workspace Lead', 'alice.ws@example.com', '+15550001', 'P99999999', 'Patient needs dental work'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'new', 'none', 'tr', 'TR', 'Bob New Lead', 'bob.new@example.com', '+905550002', 'P88888888', 'Not handoff pending')
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- ASSERTION 01: Unauthenticated options denied
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '';

SELECT throws_ok(
  $$ SELECT public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001') $$,
  'UNAUTHENTICATED: Authentication required.',
  '01: Unauthenticated caller denied ht_get_clinic_acceptance_options'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 02: can_manage_patient_profiles=false denied
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000102';

SELECT throws_ok(
  $$ SELECT public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001') $$,
  'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.',
  '02: Caller without can_manage_patient_profiles denied options'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 03: Cross-tenant lead denied
-- ----------------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000201';

SELECT throws_ok(
  $$ SELECT public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001') $$,
  'FORBIDDEN: Caller has no active staff identity in this tenant.',
  '03: Cross-tenant caller denied lead options'
);

-- Switch to authorized caller: Alpha Manager
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000101';

-- ----------------------------------------------------------------------------
-- ASSERTION 04: Non-handoff-pending lead denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000002') $$,
  'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
  '04: Lead in new/none state denied options'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 05: Branch list uses is_active canonical field
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT (public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')->'branches'->0->>'id')::text),
  'a0000000-0000-0000-0000-000000000201',
  '05: Branch list returns active permitted branch (is_active canonical field)'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 06: Caller-unpermitted branch excluded / denied if requested
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000203') $$,
  'FORBIDDEN: Caller is not permitted for the requested branch.',
  '06: Requesting unpermitted branch throws FORBIDDEN'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 07: Inactive branch excluded from returned branch options
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT jsonb_array_length(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')->'branches')),
  1,
  '07: Inactive branch (a0000000-0000-0000-0000-000000000202) excluded from options'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 08: Service uses canonical duration field
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT (public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')->'services'->0->>'duration_minutes')::integer),
  45,
  '08: Service option maps canonical duration field (45 minutes)'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 09: Service without service_branches mapping excluded
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT jsonb_array_length(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201')->'services')),
  1,
  '09: Unmapped service (a0000000-0000-0000-0000-000000000303) excluded'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 10: Inactive service excluded
-- ----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')->'services') elem
    WHERE elem->>'id' = 'a0000000-0000-0000-0000-000000000302'
  ),
  '10: Inactive service (a0000000-0000-0000-0000-000000000302) excluded'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 11: Practitioner without staff_branches mapping excluded
-- ----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201')->'practitioners') elem
    WHERE elem->>'staff_id' = 'a0000000-0000-0000-0000-000000000505'
  ),
  '11: Practitioner without staff_branches mapping excluded'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 12: Practitioner without staff_services mapping excluded
-- ----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000301')->'practitioners') elem
    WHERE elem->>'staff_id' = 'a0000000-0000-0000-0000-000000000506'
  ),
  '12: Practitioner without staff_services mapping excluded'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 13: Inactive practitioner excluded
-- ----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')->'practitioners') elem
    WHERE elem->>'staff_id' = 'a0000000-0000-0000-0000-000000000504'
  ),
  '13: Inactive practitioner (a0000000-0000-0000-0000-000000000504) excluded'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 14: passport_number never returned in options or slots payload
-- ----------------------------------------------------------------------------
SELECT ok(
  (public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')::text NOT LIKE '%passport_number%')
  AND
  (public.ht_get_clinic_acceptance_options('c0000000-0000-0000-0000-000000000001')::text NOT LIKE '%P99999999%'),
  '14: passport_number is never returned in acceptance read payload'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 15: Slot generation uses actual availability_rules
-- ----------------------------------------------------------------------------
SELECT is_gt(
  (SELECT jsonb_array_length(public.ht_get_clinic_acceptance_slots(
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000201',
    'a0000000-0000-0000-0000-000000000301',
    'a0000000-0000-0000-0000-000000000503',
    '2026-11-02'::date
  )->'available_slots')),
  0,
  '15: Slot generation yields candidate slots based on availability_rules'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 16: Availability outside hardcoded 08-20 is supported when canonical rule permits it
-- ----------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.ht_get_clinic_acceptance_slots(
        'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000201',
        'a0000000-0000-0000-0000-000000000301',
        'a0000000-0000-0000-0000-000000000503',
        '2026-11-02'::date
      )->'available_slots'
    ) elem
    WHERE elem->>'time' = '06:00'
  ),
  '16: Slot at 06:00 (outside hardcoded 08-20) supported when availability_rule permits it'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 17: evaluate_booking_slot conflict removes occupied slot
-- ----------------------------------------------------------------------------
-- Insert an active appointment at 07:00 on 2026-11-02 for Dr. 503
INSERT INTO public.appointments (
  id, tenant_id, branch_id, staff_id, service_id, appointment_date, appointment_time, duration_minutes, status, user_name, user_email, phone
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000201',
  'a0000000-0000-0000-0000-000000000503',
  'a0000000-0000-0000-0000-000000000301',
  '2026-11-02'::date,
  '07:00'::time,
  45,
  'confirmed',
  'Occupying Customer',
  'occupy@example.com',
  '+15559999'
) ON CONFLICT DO NOTHING;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.ht_get_clinic_acceptance_slots(
        'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000201',
        'a0000000-0000-0000-0000-000000000301',
        'a0000000-0000-0000-0000-000000000503',
        '2026-11-02'::date
      )->'available_slots'
    ) elem
    WHERE elem->>'time' = '07:00'
  ),
  '17: Occupied slot at 07:00 removed due to evaluate_booking_slot conflict'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 18: Same-tenant valid slot returned
-- ----------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.ht_get_clinic_acceptance_slots(
        'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000201',
        'a0000000-0000-0000-0000-000000000301',
        'a0000000-0000-0000-0000-000000000503',
        '2026-11-02'::date
      )->'available_slots'
    ) elem
    WHERE elem->>'time' = '08:00' AND (elem->>'allowed')::boolean IS TRUE
  ),
  '18: Valid unoccupied slot at 08:00 returned with allowed=true'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 19: Final acceptance still uses ht_accept_lead_into_clinic
-- ----------------------------------------------------------------------------
SELECT has_function(
  'public',
  'ht_accept_lead_into_clinic',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'date', 'time'],
  '19: ht_accept_lead_into_clinic exists with canonical 6-parameter signature'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 20: No direct table-write authority is introduced
-- ----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('appointments', 'customers', 'clinic_patient_profiles', 'ht_leads')
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ),
  '20: RLS write protection maintained - zero direct table-write authority for public/anon/authenticated'
);

SELECT * FROM finish();
ROLLBACK;
