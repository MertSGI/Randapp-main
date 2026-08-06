-- h1e_c_dedicated_tenant_fixture.sql
-- Description: Staging-only deterministic fixture preparation for Stage H1E-C dedicated tenant.
-- Target Tenant: dddd1111-d1d1-d1d1-d1d1-dddddddddddd (Dedicated H1D/H1E Acceptance Tenant)
-- SAFETY RULES:
--   - Does NOT touch canonical tenant (aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa)
--   - Does NOT touch platform_global_release_control (release phase stays pre_pilot)
--   - Does NOT touch tenant_pilot_authorizations (pilot authorization stays empty / inactive)
--   - Does NOT enable payment collection, checkout, or iyzico flags

BEGIN;

-- 1. Tenant record & public_site_status
INSERT INTO public.tenants (id, slug, name, status, public_site_status)
VALUES (
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'dedicated-h1d-tenant', 
  'Dedicated H1D Acceptance Tenant', 
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
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'Dedicated H1D Acceptance Test Salon Profile', 
  true
)
ON CONFLICT (tenant_id) DO UPDATE SET 
  short_description = EXCLUDED.short_description,
  is_public_profile_enabled = EXCLUDED.is_public_profile_enabled;

-- 2. Primary active branch
INSERT INTO public.branches (
  id, tenant_id, name, slug, is_active, is_primary, timezone
) VALUES (
  'bddddddd-0000-0000-0000-000000000001',
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
  'Dedicated Main Branch',
  'merkez',
  true,
  true,
  'Europe/Istanbul'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_primary = EXCLUDED.is_primary,
  is_active = EXCLUDED.is_active;

-- 3. Active subscription linked to commercial plan (premium_monthly)
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
  'd9999999-9999-9999-9999-999999999999',
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
  'premium_monthly',
  'active',
  NOW() - INTERVAL '5 days',
  NOW() + INTERVAL '25 days',
  false
)
ON CONFLICT (id) DO UPDATE SET 
  plan_id = EXCLUDED.plan_id,
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end;

-- 4. Active service
INSERT INTO public.services (id, tenant_id, name, duration, price, active, category)
VALUES (
  'sddddddd-0000-0000-0000-000000000001', 
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'Dedicated Acceptance Test Service', 
  30, 
  100, 
  true, 
  'General'
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  active = EXCLUDED.active;

-- 5. Active staff
INSERT INTO public.staff (id, tenant_id, name, active, role)
VALUES (
  'stdddddd-0000-0000-0000-000000000001', 
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'Dedicated Acceptance Specialist', 
  true, 
  'staff'
)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  active = EXCLUDED.active;

-- 6. Branch / Service / Staff relationships
INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
VALUES (
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'sddddddd-0000-0000-0000-000000000001', 
  'bddddddd-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
VALUES (
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'stdddddd-0000-0000-0000-000000000001', 
  'bddddddd-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.staff_services (tenant_id, staff_id, service_id)
VALUES (
  'dddd1111-d1d1-d1d1-d1d1-dddddddddddd', 
  'stdddddd-0000-0000-0000-000000000001', 
  'sddddddd-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

COMMIT;
