-- h1e_c_dedicated_tenant_fixture.sql
-- Description: Staging-only deterministic fixture preparation for Stage H1E-C dedicated tenant.
-- Target Tenant: dddd1111-d1d1-d1d1-d1d1-dddddddddddd (Dedicated H1D/H1E Acceptance Tenant)
-- SAFETY RULES:
--   - Does NOT touch canonical tenant (aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa)
--   - Does NOT touch platform_global_release_control (release phase stays pre_pilot)
--   - Does NOT touch tenant_pilot_authorizations (pilot authorization stays empty / inactive)
--   - Does NOT enable payment collection, checkout, or iyzico flags
--   - Does NOT mutate payments or billing_transactions tables

BEGIN;

DO $fixture_block$
DECLARE
    v_plan_id UUID;
    v_plan_version_id UUID;
BEGIN
    -- 1. Resolve canonical Published Premium Version 1 plan_version_id
    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE code = 'premium';

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'CANONICAL_PLAN_PREMIUM_NOT_FOUND: Plan code premium not found in public.plans' USING ERRCODE = 'P0001';
    END IF;

    SELECT pv.id INTO v_plan_version_id
    FROM public.plan_versions pv
    WHERE pv.plan_id = v_plan_id
      AND pv.version_number = 1
      AND pv.lifecycle_status = 'published';

    IF v_plan_version_id IS NULL THEN
        RAISE EXCEPTION 'PUBLISHED_PREMIUM_V1_PLAN_VERSION_NOT_FOUND: Published version 1 for plan code premium not found' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Tenant record & public_site_status
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

    -- 3. Primary active branch (bddddddd-0000-0000-0000-000000000001)
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

    -- 4. Active manual subscription linked to resolved published plan_version_id
    INSERT INTO public.subscriptions (
      id,
      tenant_id,
      plan_id,
      plan_version_id,
      status,
      billing_mode,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    VALUES (
      'd9999999-9999-9999-9999-999999999999',
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'premium',
      v_plan_version_id,
      'active',
      'manual',
      NOW() - INTERVAL '5 days',
      NOW() + INTERVAL '25 days',
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_version_id = EXCLUDED.plan_version_id,
      status = EXCLUDED.status,
      billing_mode = EXCLUDED.billing_mode,
      current_period_end = EXCLUDED.current_period_end;

    -- 5. Idempotent Fixture Subscription Event
    INSERT INTO public.subscription_events (
      subscription_id,
      tenant_id,
      event_type,
      previous_state,
      new_state,
      internal_reason,
      idempotency_key,
      metadata
    )
    VALUES (
      'd9999999-9999-9999-9999-999999999999',
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'subscription_created',
      '{}'::jsonb,
      jsonb_build_object('plan_id', 'premium', 'plan_version_id', v_plan_version_id, 'status', 'active', 'billing_mode', 'manual'),
      'Stage H1E-C dedicated tenant manual subscription fixture creation',
      'h1e_c_dedicated_tenant_fixture_sub_event',
      '{"source": "h1e_c_dedicated_tenant_fixture.sql"}'::jsonb
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- 6. Active service (addddddd-0000-0000-0000-000000000001)
    INSERT INTO public.services (id, tenant_id, name, duration, price, active, category)
    VALUES (
      'addddddd-0000-0000-0000-000000000001',
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

    -- 7. Active staff (cddddddd-0000-0000-0000-000000000001)
    INSERT INTO public.staff (id, tenant_id, name, active, is_owner)
    VALUES (
      'cddddddd-0000-0000-0000-000000000001',
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'Dedicated Acceptance Specialist',
      true,
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      active = EXCLUDED.active;

    -- 8. Branch / Service / Staff relationships
    INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
    VALUES (
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'addddddd-0000-0000-0000-000000000001',
      'bddddddd-0000-0000-0000-000000000001'
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
    VALUES (
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'cddddddd-0000-0000-0000-000000000001',
      'bddddddd-0000-0000-0000-000000000001'
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.staff_services (tenant_id, staff_id, service_id)
    VALUES (
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'cddddddd-0000-0000-0000-000000000001',
      'addddddd-0000-0000-0000-000000000001'
    )
    ON CONFLICT DO NOTHING;

END $fixture_block$;

COMMIT;
