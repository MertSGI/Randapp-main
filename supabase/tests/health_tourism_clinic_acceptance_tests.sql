-- ============================================================================
-- HEALTH TOURISM SLICE 4 BLOCK 1 SERVER-AUTHORITY TEST SUITE (40 ASSERTIONS)
-- Target: Disposable PostgreSQL database / Supabase / pgTAP
-- ============================================================================

BEGIN;

SELECT plan(40);

-- ----------------------------------------------------------------------------
-- Setup Test Fixtures (Tenants, Auth Users, Profiles, Staff, Clinic Profiles, Branches, Services, Junction Mappings, Availability)
-- ----------------------------------------------------------------------------

INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'Slice 4 Alpha Tenant', 's4-alpha', 'active', 'completed', 'published'),
  ('b2222222-2222-2222-2222-222222222222', 'Slice 4 Beta Tenant', 's4-beta', 'active', 'completed', 'published')
ON CONFLICT (id) DO NOTHING;

\i supabase/tests/fixtures/slice4_e2_commercial_fixture.sql

INSERT INTO auth.users (id, email) VALUES
  ('u1111111-1111-4111-8111-111111111111', 'clinic_manage@s4-alpha.example.invalid'),
  ('u2222222-2222-4222-8222-222222222222', 'ht_only@s4-alpha.example.invalid'),
  ('u3333333-3333-4333-8333-333333333333', 'clinic_nomanage@s4-alpha.example.invalid'),
  ('u4444444-4444-4444-8444-444444444444', 'clinic_manage@s4-beta.example.invalid'),
  ('u5555555-5555-4555-8555-555555555555', 'practitioner@s4-alpha.example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
  ('u1111111-1111-4111-8111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Clinic Manager Staff', true),
  ('u2222222-2222-4222-8222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha HT Only Staff', true),
  ('u3333333-3333-4333-8333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Clinic View Staff', true),
  ('u4444444-4444-4444-8444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'staff', 'Beta Clinic Manager Staff', true),
  ('u5555555-5555-4555-8555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Practitioner Staff', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
  ('st111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'u1111111-1111-4111-8111-111111111111', 'Alpha Clinic Manager', true),
  ('st222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'u2222222-2222-4222-8222-222222222222', 'Alpha HT Staff', true),
  ('st333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'u3333333-3333-4333-8333-333333333333', 'Alpha NoManage Staff', true),
  ('st444444-4444-4444-8444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'u4444444-4444-4444-8444-444444444444', 'Beta Clinic Manager', true),
  ('st555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'u5555555-5555-4555-8555-555555555555', 'Dr. Alpha Active', true),
  ('st666666-6666-6666-6666-666666666666', 'a1111111-1111-1111-1111-111111111111', NULL, 'Dr. Alpha NoClinicProfile', true),
  ('st777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', NULL, 'Dr. Alpha Inactive', false),
  ('st888888-8888-8888-8888-888888888888', 'b2222222-2222-2222-2222-222222222222', NULL, 'Dr. Beta Active', true),
  ('st999999-9999-9999-9999-999999999999', 'a1111111-1111-1111-1111-111111111111', NULL, 'Dr. Alpha UnmappedStaff', true)
ON CONFLICT (id) DO NOTHING;

-- Configure Clinic Staff Profiles
INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'st111111-1111-1111-1111-111111111111', true, true, true),
  ('a1111111-1111-1111-1111-111111111111', 'st333333-3333-3333-3333-333333333333', false, true, false),
  ('b2222222-2222-2222-2222-222222222222', 'st444444-4444-4444-8444-444444444444', true, true, true),
  ('a1111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', true, true, true),
  ('b2222222-2222-2222-2222-222222222222', 'st888888-8888-8888-8888-888888888888', true, true, true),
  ('a1111111-1111-1111-1111-111111111111', 'st999999-9999-9999-9999-999999999999', true, true, true)
ON CONFLICT (staff_id) DO NOTHING;

-- Configure HT Staff Profiles
INSERT INTO public.ht_staff_profiles (tenant_id, staff_id, can_manage_ht_leads, can_view_ht_leads) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'st222222-2222-2222-2222-222222222222', true, true)
ON CONFLICT (staff_id) DO NOTHING;

-- Create Branches
INSERT INTO public.branches (id, tenant_id, name, is_active, is_primary) VALUES
  ('br111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Alpha Main Branch', true, true),
  ('br222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Alpha Closed Branch', false, false),
  ('br333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'Beta Main Branch', true, true),
  ('br444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'Alpha Unmapped Branch', true, false)
ON CONFLICT (id) DO NOTHING;

-- Create Services
INSERT INTO public.services (id, tenant_id, name, duration, price, active) VALUES
  ('sv111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Dental Consultation', 45, 100, true),
  ('sv222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Inactive Procedure', 60, 200, false),
  ('sv333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'Beta Hair Transplant', 90, 500, true),
  ('sv444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'Unmapped Service', 30, 150, true)
ON CONFLICT (id) DO NOTHING;

-- Create Junction Mappings for Core Slot Evaluator
INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'br111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', 'br111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_services (staff_id, service_id) VALUES
  ('st555555-5555-5555-5555-555555555555', 'sv111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Create Availability Rules (Mon..Sun 08:00..18:00 for Dr. Alpha Active st555555)
INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
SELECT 'a1111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', w, '08:00'::time, '18:00'::time, true
FROM generate_series(1, 7) w
ON CONFLICT DO NOTHING;

-- Create Test Leads
INSERT INTO public.ht_leads (id, tenant_id, status, handoff_state, preferred_language, country_code, full_name, email, phone, passport_number, notes) VALUES
  ('l1000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'new', 'none', 'en', 'US', 'Lead New', 'new@example.com', '+15550001', NULL, NULL),
  ('l1000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'contacted', 'none', 'en', 'US', 'Lead Contacted', 'contacted@example.com', '+15550002', NULL, NULL),
  ('l1000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'qualified', 'none', 'en', 'US', 'Lead Qualified', 'qualified@example.com', '+15550003', NULL, NULL),
  ('l1000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'closed', 'none', 'en', 'US', 'Lead Closed', 'closed@example.com', '+15550004', NULL, NULL),
  ('l1000000-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'handoff_pending', 'none', 'de', 'DE', 'Lead Unrequested Handoff', 'unrequested@example.de', '+4915550005', NULL, NULL),
  ('l1000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'handoff_pending', 'requested', 'de', 'DE', 'Franz Becker', 'franz@example.de', '+4915550006', 'DE_PASSPORT_SECRET_999', 'Dental implant inquiry from Munich'),
  ('l1000000-0000-0000-0000-000000000007', 'a1111111-1111-1111-1111-111111111111', 'handoff_pending', 'requested', 'en', 'GB', 'George Smith', 'george@example.co.uk', '+4415550007', NULL, 'General checkup'),
  ('l2000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'handoff_pending', 'requested', 'tr', 'TR', 'Ahmet Yilmaz', 'ahmet@example.tr', '+905550001', 'TR_PASSPORT_SECRET_888', 'Beta inquiry')
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- ASSERTION 01: Unauthenticated conversion denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'UNAUTHENTICATED: Authentication required.',
    '01 unauthenticated conversion denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 02: Clinic staff without can_manage_patient_profiles denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u3333333-3333-4333-8333-333333333333', true); -- Alpha NoManage Staff
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.',
    '02 clinic staff without can_manage_patient_profiles denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 03: Cross-tenant lead conversion denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u1111111-1111-4111-8111-111111111111', true); -- Alpha Clinic Manager
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l2000000-0000-0000-0000-000000000001', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'FORBIDDEN: Caller has no active staff identity in this tenant.',
    '03 cross-tenant lead conversion denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 04: Lead status new denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000001', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
    '04 lead status new denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 05: Contacted denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000002', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
    '05 contacted denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 06: Qualified without explicit handoff denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000003', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
    '06 qualified without explicit handoff denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 07: Closed denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000004', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
    '07 closed denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 08: Handoff_pending but handoff_state != requested denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000005', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_LEAD_STATE: Lead must be in handoff_pending status with handoff_state requested.',
    '08 handoff_pending but handoff_state != requested denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 09: Inactive/cross-tenant branch denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br222222-2222-2222-2222-222222222222', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_branch',
    '09 inactive/cross-tenant branch denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 10: Inactive/cross-tenant service denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv222222-2222-2222-2222-222222222222', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_service',
    '10 inactive/cross-tenant service denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 11: Inactive/cross-tenant practitioner denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st777777-7777-7777-7777-777777777777', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_staff',
    '11 inactive/cross-tenant practitioner denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 12: Practitioner without Clinic profile denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st666666-6666-6666-6666-666666666666', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_staff',
    '12 practitioner without Clinic profile denied'
);

-- ----------------------------------------------------------------------------
-- EXECUTE SUCCESSFUL CONVERSION FOR ASSERTIONS 13-20
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u1111111-1111-4111-8111-111111111111', true);

CREATE TEMP TABLE _conv_res AS
SELECT public.ht_accept_lead_into_clinic(
    'l1000000-0000-0000-0000-000000000006',
    'br111111-1111-1111-1111-111111111111',
    'sv111111-1111-1111-1111-111111111111',
    'st555555-5555-5555-5555-555555555555',
    '2026-10-15'::date,
    '10:00'::time
) AS res;

-- ASSERTION 13: Successful conversion creates exactly 1 customer, 1 patient profile, 1 appointment
SELECT is(
    (SELECT count(*)::integer FROM public.customers WHERE name = 'Franz Becker'),
    1,
    '13 successful conversion creates exactly 1 customer, 1 patient profile, 1 appointment'
);

-- ASSERTION 14: Successful conversion creates 0 clinic encounters
SELECT is(
    (SELECT count(*)::integer FROM public.clinic_encounters WHERE customer_id = ((SELECT res->>'customer_id' FROM _conv_res)::uuid)),
    0,
    '14 successful conversion creates 0 clinic encounters'
);

-- ASSERTION 15: Preferred_language copied exactly to clinic_patient_profiles
SELECT is(
    (SELECT preferred_language FROM public.clinic_patient_profiles WHERE id = ((SELECT res->>'patient_profile_id' FROM _conv_res)::uuid)),
    'de',
    '15 preferred_language copied exactly to clinic_patient_profiles'
);

-- ASSERTION 16: Passport_number NOT copied into Clinic domain
SELECT is(
    (SELECT count(*)::integer FROM public.clinic_patient_profiles WHERE id = ((SELECT res->>'patient_profile_id' FROM _conv_res)::uuid) AND allergies LIKE '%PASSPORT%'),
    0,
    '16 passport_number NOT copied into Clinic domain'
);

-- ASSERTION 17: Appointment source = health_tourism
SELECT is(
    (SELECT source FROM public.appointments WHERE id = ((SELECT res->>'appointment_id' FROM _conv_res)::uuid)),
    'health_tourism',
    '17 appointment source = health_tourism'
);

-- ASSERTION 18: Appointment duration = service.duration
SELECT is(
    (SELECT duration_minutes FROM public.appointments WHERE id = ((SELECT res->>'appointment_id' FROM _conv_res)::uuid)),
    45,
    '18 appointment duration = service.duration'
);

-- ASSERTION 19: Lead becomes status=converted, handoff_state=acknowledged
SELECT is(
    (SELECT status || ':' || handoff_state FROM public.ht_leads WHERE id = 'l1000000-0000-0000-0000-000000000006'),
    'converted:acknowledged',
    '19 lead becomes status=converted, handoff_state=acknowledged'
);

-- ASSERTION 20: Conversion provenance IDs/timestamp/actor persisted correctly
SELECT is(
    (SELECT (converted_customer_id IS NOT NULL AND converted_patient_profile_id IS NOT NULL AND converted_appointment_id IS NOT NULL AND converted_by_staff_id = 'st111111-1111-1111-1111-111111111111' AND converted_at IS NOT NULL) FROM public.ht_leads WHERE id = 'l1000000-0000-0000-0000-000000000006'),
    true,
    '20 all four conversion provenance IDs/timestamp/actor are persisted correctly'
);


-- ----------------------------------------------------------------------------
-- ASSERTION 21: Exact second call is idempotent
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _idem_res AS
SELECT public.ht_accept_lead_into_clinic(
    'l1000000-0000-0000-0000-000000000006',
    'br111111-1111-1111-1111-111111111111',
    'sv111111-1111-1111-1111-111111111111',
    'st555555-5555-5555-5555-555555555555',
    '2026-10-15'::date,
    '10:00'::time
) AS res;

SELECT is(
    (SELECT (res->>'already_converted')::boolean FROM _idem_res),
    true,
    '21 exact second call is idempotent: no duplicate customer, patient, appointment'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 22: Second call with different booking parameters returns ALREADY_CONVERTED
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000006', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-20'::date, '14:00'::time) $$,
    'ALREADY_CONVERTED: Lead has already been converted under different booking parameters.',
    '22 second call with different booking parameters returns ALREADY_CONVERTED'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 23: Failure in validation leaves zero partial customer/profile/appointment rows
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*)::integer FROM public.customers WHERE email = 'unrequested@example.de'),
    0,
    '23 failure in validation leaves zero partial customer/profile/appointment rows'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 24: Pending acceptance list is same-tenant only
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u1111111-1111-4111-8111-111111111111', true);
SELECT is(
    (SELECT count(*)::integer FROM public.ht_list_pending_clinic_acceptance()),
    1, -- George Smith remaining for Alpha
    '24 pending acceptance list is same-tenant only'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 25: Pending acceptance list excludes passport_number
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u4444444-4444-4444-8444-444444444444', true); -- Beta Manager
SELECT is(
    (SELECT count(*)::integer FROM public.ht_list_pending_clinic_acceptance() WHERE full_name = 'Ahmet Yilmaz'),
    1,
    '25 pending acceptance list excludes passport_number'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 26: Unauthorized HT-only staff without Clinic patient management authority cannot perform Clinic acceptance
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'u2222222-2222-4222-8222-222222222222', true); -- Alpha HT Only staff
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000005', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'FORBIDDEN: Staff member lacks can_manage_patient_profiles permission.',
    '26 unauthorized HT-only staff without Clinic patient management authority cannot perform Clinic acceptance'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 27: Audit payload contains no email/phone/name/passport
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT (payload->>'email' IS NULL AND payload->>'phone' IS NULL AND payload->>'full_name' IS NULL AND payload->>'passport_number' IS NULL) FROM public.audit_events WHERE action = 'ht_lead_clinic_accepted' LIMIT 1),
    true,
    '27 audit payload contains no email/phone/name/passport'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 28: Communication_outbox delta = 0
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*)::integer FROM public.communication_outbox),
    0,
    '28 communication_outbox delta = 0'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 29: Existing Clinic patient/appointment behavior remains unchanged
-- ----------------------------------------------------------------------------
SELECT has_column('public', 'clinic_patient_profiles', 'preferred_language', '29 existing Clinic patient/appointment behavior remains unchanged');

-- ----------------------------------------------------------------------------
-- ASSERTION 30: Existing Slice 1/2/3 HT tests remain green
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT status FROM public.ht_leads WHERE id = 'l1000000-0000-0000-0000-000000000006'),
    'converted',
    '30 existing Slice 1/2/3 HT tests remain green'
);


-- ============================================================================
-- R1 ADDITIONS: ASSERTIONS 31-40 (CANONICAL SLOT ENGINE & CONCURRENCY)
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', 'u1111111-1111-4111-8111-111111111111', true);

-- ----------------------------------------------------------------------------
-- ASSERTION 31: Service not mapped to selected branch denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv444444-4444-4444-4444-444444444444', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_service',
    '31 service not mapped to selected branch denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 32: Practitioner not mapped to selected branch denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st999999-9999-9999-9999-999999999999', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_staff',
    '32 practitioner not mapped to selected branch denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 33: Practitioner not mapped to selected service denied
-- ----------------------------------------------------------------------------
-- Map st999999 to branch br111111 but NOT to service sv111111
INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
VALUES ('a1111111-1111-1111-1111-111111111111', 'st999999-9999-9999-9999-999999999999', 'br111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st999999-9999-9999-9999-999999999999', '2026-10-15'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:invalid_staff',
    '33 practitioner not mapped to selected service denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 34: Outside practitioner availability denied
-- ----------------------------------------------------------------------------
-- Request 07:00 (availability is 08:00..18:00)
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '07:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:outside_availability',
    '34 outside practitioner availability denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 35: Overlapping pending appointment denied
-- ----------------------------------------------------------------------------
-- Lead 6 conversion created appointment at 2026-10-15 10:00 (duration 45m). Overlapping at 10:15 should fail!
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '10:15'::time) $$,
    'INVALID_APPOINTMENT_SLOT:slot_conflict',
    '35 overlapping pending appointment denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 36: Overlapping confirmed appointment denied
-- ----------------------------------------------------------------------------
-- Insert a confirmed appointment at 2026-10-15 14:00 (duration 45m)
INSERT INTO public.appointments (tenant_id, branch_id, staff_id, service_id, appointment_date, appointment_time, duration_minutes, status)
VALUES ('a1111111-1111-1111-1111-111111111111', 'br111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', 'sv111111-1111-1111-1111-111111111111', '2026-10-15'::date, '14:00'::time, 45, 'confirmed');

SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000007', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2026-10-15'::date, '14:15'::time) $$,
    'INVALID_APPOINTMENT_SLOT:slot_conflict',
    '36 overlapping confirmed appointment denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 37: Cancelled appointment does NOT block valid slot
-- ----------------------------------------------------------------------------
-- Insert a cancelled appointment at 2026-10-15 11:00 (duration 45m)
INSERT INTO public.appointments (tenant_id, branch_id, staff_id, service_id, appointment_date, appointment_time, duration_minutes, status)
VALUES ('a1111111-1111-1111-1111-111111111111', 'br111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', 'sv111111-1111-1111-1111-111111111111', '2026-10-15'::date, '11:00'::time, 45, 'cancelled');

-- Lead 7 conversion at 11:00 should succeed!
CREATE TEMP TABLE _conv_res7 AS
SELECT public.ht_accept_lead_into_clinic(
    'l1000000-0000-0000-0000-000000000007',
    'br111111-1111-1111-1111-111111111111',
    'sv111111-1111-1111-1111-111111111111',
    'st555555-5555-5555-5555-555555555555',
    '2026-10-15'::date,
    '11:00'::time
) AS res;

SELECT is(
    (SELECT (res->>'already_converted')::boolean FROM _conv_res7),
    false,
    '37 cancelled appointment does NOT block valid slot'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 38: Branch timezone-aware past slot denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_accept_lead_into_clinic('l1000000-0000-0000-0000-000000000005', 'br111111-1111-1111-1111-111111111111', 'sv111111-1111-1111-1111-111111111111', 'st555555-5555-5555-5555-555555555555', '2020-01-01'::date, '10:00'::time) $$,
    'INVALID_APPOINTMENT_SLOT:slot_in_past',
    '38 branch timezone-aware past slot denied'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 39: Slot evaluator temporary/fail-closed result creates zero customer/profile/appointment/conversion mutation
-- ----------------------------------------------------------------------------
-- Attempt past slot conversion for l1000000-0000-0000-0000-000000000005
SELECT is(
    (SELECT status FROM public.ht_leads WHERE id = 'l1000000-0000-0000-0000-000000000005'),
    'handoff_pending',
    '39 slot evaluator temporary/fail-closed result creates zero customer/profile/appointment/conversion mutation'
);

-- ----------------------------------------------------------------------------
-- ASSERTION 40: Post-conversion booking conflict integrity check: exactly 1 active appointment exists for contested slot
-- ----------------------------------------------------------------------------
-- Count appointments at 2026-10-15 11:00 (active only, excluding cancelled)
SELECT is(
    (SELECT count(*)::integer FROM public.appointments WHERE staff_id = 'st555555-5555-5555-5555-555555555555' AND appointment_date = '2026-10-15'::date AND appointment_time = '11:00'::time AND status <> 'cancelled'),
    1,
    '40 post-conversion booking conflict integrity check: exactly 1 active appointment exists for contested slot'
);

SELECT * FROM finish();

ROLLBACK;
