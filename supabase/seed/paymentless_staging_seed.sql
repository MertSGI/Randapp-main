-- paymentless_staging_seed.sql
-- Description: Transaction-safe, repeatable seeding script for LARİ paymentless_limited_production mode.
-- Sets up active pilot tenant Melis Güzellik & Nail Art with fictional catalog, staff, hours, and subscription.

BEGIN;

-- =========================================================================
-- 1. SEED TENANT & BUSINESS PROFILE
-- =========================================================================


INSERT INTO public.tenants (id, slug, name, status, public_site_status)
VALUES (
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 
  'melis-guzellik', 
  'Melis Güzellik & Nail Art', 
  'active',
  'published'
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  status = EXCLUDED.status,
  public_site_status = EXCLUDED.public_site_status;

INSERT INTO public.tenant_business_profiles (
  tenant_id, 
  short_description, 
  is_public_profile_enabled
)
VALUES (
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 
  'Professional Nail Art, Manicure, and Pedicure salon in Istanbul.', 
  true
)
ON CONFLICT (tenant_id) DO UPDATE SET 
  short_description = EXCLUDED.short_description,
  is_public_profile_enabled = EXCLUDED.is_public_profile_enabled;

-- Seed Canonical Primary Branch for Staging Tenant
INSERT INTO public.branches (
  id, tenant_id, name, slug, is_active, is_primary, timezone
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
  'Melis Güzellik Merkez Şube',
  'merkez',
  true,
  true,
  'Europe/Istanbul'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_primary = EXCLUDED.is_primary,
  is_active = EXCLUDED.is_active;

-- Map Staging Specialist (Selin Uzman) and Staging Blowdry Service to Primary Branch
INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
VALUES ('aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'fdc4b301-26ec-40c1-a521-5a864766fbc5', 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;


-- =========================================================================
-- 2. SEED MANUAL SUBSCRIPTION
-- =========================================================================


INSERT INTO public.subscriptions (
  id, 
  tenant_id, 
  plan_id, 
  status, 
  current_period_start, 
  current_period_end, 
  cancel_at_period_end
)
VALUES (
  '99999999-9999-9999-9999-999999999999',
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
  'premium_monthly',
  'active',
  NOW() - INTERVAL '5 days',
  NOW() + INTERVAL '25 days',
  false
)
ON CONFLICT (id) DO UPDATE SET 
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end;


-- =========================================================================
-- 3. SEED SERVICES CATALOG
-- =========================================================================


INSERT INTO public.services (id, tenant_id, name, duration, price, active, category)
VALUES 
  ('00000000-0000-0000-0000-000000000011', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Premium Nail Art', 60, 350, true, 'Nail Art'),
  ('00000000-0000-0000-0000-000000000022', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Klasik Manikür', 30, 180, true, 'Manicure'),
  ('00000000-0000-0000-0000-000000000033', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Spa Pedikür', 45, 250, true, 'Pedicure')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  duration = EXCLUDED.duration,
  price = EXCLUDED.price,
  active = EXCLUDED.active;


-- =========================================================================
-- 4. SEED STAFF
-- =========================================================================


INSERT INTO public.staff (id, tenant_id, name, title, active, is_owner)
VALUES 
  ('55555555-5555-5555-5555-555555555555', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Melis G.', 'Nail Specialist & Owner', true, true),
  ('66666666-6666-6666-6666-666666666666', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 'Buse S.', 'Esthetician', true, false)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  active = EXCLUDED.active;


-- =========================================================================
-- 5. SEED STAFF-SERVICES JUNCTIONS
-- =========================================================================
INSERT INTO public.staff_services (staff_id, service_id)
VALUES 
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000011'),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000022'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000022'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000033')
ON CONFLICT DO NOTHING;


-- =========================================================================
-- 6. SEED AVAILABILITY RULES
-- =========================================================================


-- Weekday business hours (Mon-Sat, 09:00 - 19:00)
INSERT INTO public.availability_rules (
  id, 
  tenant_id, 
  staff_id, 
  weekday, 
  start_time, 
  end_time, 
  is_active
)
VALUES 
  ('77777777-7777-7777-7777-777777777711', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 1, '09:00', '19:00', true),
  ('77777777-7777-7777-7777-777777777712', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 2, '09:00', '19:00', true),
  ('77777777-7777-7777-7777-777777777713', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 3, '09:00', '19:00', true),
  ('77777777-7777-7777-7777-777777777714', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 4, '09:00', '19:00', true),
  ('77777777-7777-7777-7777-777777777715', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 5, '09:00', '19:00', true),
  ('77777777-7777-7777-7777-777777777716', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 6, '09:00', '19:00', true),
  
  ('77777777-7777-7777-7777-777777777721', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 1, '10:00', '18:00', true),
  ('77777777-7777-7777-7777-777777777722', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 2, '10:00', '18:00', true),
  ('77777777-7777-7777-7777-777777777723', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 3, '10:00', '18:00', true),
  ('77777777-7777-7777-7777-777777777724', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 4, '10:00', '18:00', true),
  ('77777777-7777-7777-7777-777777777725', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 5, '10:00', '18:00', true),
  ('77777777-7777-7777-7777-777777777726', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 6, '10:00', '18:00', true)
ON CONFLICT (id) DO UPDATE SET 
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  is_active = EXCLUDED.is_active;



-- =========================================================================
-- 7. STAGING SPECIALIST: Selin Uzman
-- Tenant: aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa
-- These records were added after initial seed. All operations are idempotent.
-- =========================================================================

-- Staging Blowdry service (may already exist from prior setup, idempotent)
INSERT INTO public.services (id, tenant_id, name, name_tr, duration, price, active)
VALUES (
  'fdc4b301-26ec-40c1-a521-5a864766fbc5',
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
  'Staging Blowdry',
  'Staging Blowdry',
  30,
  120,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active;

-- Selin Uzman staff record (may already exist from prior setup, idempotent)
INSERT INTO public.staff (id, tenant_id, name, title, active, is_owner)
VALUES (
  '6234e7a1-9788-4f04-aa56-54d05c1fafb7',
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
  'Selin Uzman',
  'Staging Specialist',
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  active = EXCLUDED.active;

-- Canonical missing mapping: Selin Uzman -> Staging Blowdry
-- Guarded by pre-flight assertion that both records share the same tenant.
DO $$
DECLARE
  v_staff_tenant_id uuid;
  v_service_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_staff_tenant_id FROM public.staff WHERE id = '6234e7a1-9788-4f04-aa56-54d05c1fafb7';
  SELECT tenant_id INTO v_service_tenant_id FROM public.services WHERE id = 'fdc4b301-26ec-40c1-a521-5a864766fbc5';

  IF v_staff_tenant_id IS NULL OR v_service_tenant_id IS NULL THEN
    RAISE EXCEPTION 'SEED GUARD: staff or service not found for Selin Uzman / Staging Blowdry';
  END IF;

  IF v_staff_tenant_id <> v_service_tenant_id THEN
    RAISE EXCEPTION 'SEED GUARD: cross-tenant mapping rejected (staff_tenant=%, service_tenant=%)', v_staff_tenant_id, v_service_tenant_id;
  END IF;

  INSERT INTO public.staff_services (staff_id, service_id)
  VALUES ('6234e7a1-9788-4f04-aa56-54d05c1fafb7', 'fdc4b301-26ec-40c1-a521-5a864766fbc5')
  ON CONFLICT (staff_id, service_id) DO NOTHING;
END $$;

-- Availability rules for Selin Uzman (Mon-Sat 10:00-18:00), idempotent
INSERT INTO public.availability_rules (id, tenant_id, staff_id, weekday, start_time, end_time, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 1, '10:00', '18:00', true),
  ('a0000000-0000-0000-0000-000000000002', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 2, '10:00', '18:00', true),
  ('a0000000-0000-0000-0000-000000000003', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 3, '10:00', '18:00', true),
  ('a0000000-0000-0000-0000-000000000004', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 4, '10:00', '18:00', true),
  ('a0000000-0000-0000-0000-000000000005', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 5, '10:00', '18:00', true),
  ('a0000000-0000-0000-0000-000000000006', 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', '6234e7a1-9788-4f04-aa56-54d05c1fafb7', 6, '10:00', '18:00', true)
ON CONFLICT (id) DO UPDATE SET
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  is_active = EXCLUDED.is_active;


COMMIT;
