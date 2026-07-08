-- paymentless_staging_seed.sql
-- Description: Transaction-safe, repeatable seeding script for LARİ paymentless_limited_production mode.
-- Sets up active pilot tenant Melis Güzellik & Nail Art with fictional catalog, staff, hours, and subscription.

BEGIN;

-- =========================================================================
-- 1. SEED TENANT & BUSINESS PROFILE
-- =========================================================================
RAISE NOTICE '🎬 Seeding pilot tenant...';

INSERT INTO public.tenants (id, slug, name, status)
VALUES (
  'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa', 
  'melis-guzellik', 
  'Melis Güzellik & Nail Art', 
  'active'
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  status = EXCLUDED.status;

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


-- =========================================================================
-- 2. SEED MANUAL SUBSCRIPTION
-- =========================================================================
RAISE NOTICE '🎬 Seeding manual billing structures...';

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
RAISE NOTICE '🎬 Seeding services catalog...';

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
RAISE NOTICE '🎬 Seeding salon staff...';

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
RAISE NOTICE '🎬 Seeding staff availability hours...';

-- Weekday business hours (Mon-Sat, 09:00 - 19:00)
INSERT INTO public.availability_rules (
  id, 
  tenant_id, 
  staff_id, 
  day_of_week, 
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

RAISE NOTICE '✅ Seeding completed. To hook up Owner Auth mappings, please refer to SUPABASE_AUTH_RLS_BOOTSTRAP_RUNBOOK.md.';

COMMIT;
