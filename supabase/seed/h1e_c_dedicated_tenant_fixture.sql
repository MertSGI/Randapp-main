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
    v_plan_version_id UUID;
    v_count INTEGER;
    v_existing_tenant_id UUID;
    v_existing_slug VARCHAR;
    v_existing_tenant_id_for_branch UUID;
    v_existing_tenant_id_for_service UUID;
    v_existing_tenant_id_for_staff UUID;
    v_existing_tenant_id_for_sub UUID;
    v_existing_tenant_id_for_event UUID;
    v_existing_sub_id_for_event UUID;
    v_existing_event_type_for_event TEXT;
    v_existing_reason_for_event TEXT;
    v_existing_source_for_event TEXT;
    v_rel_conflict_count INTEGER;
    v_rel_staff_branch_conflict INTEGER;
    v_rel_staff_service_conflict INTEGER;
    v_release_phase TEXT;
    v_is_pay_enabled BOOLEAN;
    v_is_chk_enabled BOOLEAN;
    v_is_iyz_enabled BOOLEAN;
    v_pilot_auth_count INTEGER;
BEGIN
    -- 0. PRE-FLIGHT RELEASE CONTROL SINGLETON & NULL-SAFE SAFETY INVARIANT CHECK
    SELECT COUNT(*) INTO v_count
    FROM public.platform_global_release_control
    WHERE id = 1;

    IF v_count != 1 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_RELEASE_CONTROL_CARDINALITY_INVALID: Singleton row id = 1 missing or invalid' USING ERRCODE = 'P0001';
    END IF;

    SELECT release_phase, is_payment_collection_enabled, is_checkout_enabled, is_iyzico_enabled
    INTO v_release_phase, v_is_pay_enabled, v_is_chk_enabled, v_is_iyz_enabled
    FROM public.platform_global_release_control
    WHERE id = 1;

    SELECT COUNT(*) INTO v_pilot_auth_count
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd'
      AND revoked_at IS NULL;

    IF v_release_phase IS DISTINCT FROM 'pre_pilot'
       OR v_is_pay_enabled IS DISTINCT FROM false
       OR v_is_chk_enabled IS DISTINCT FROM false
       OR v_is_iyz_enabled IS DISTINCT FROM false
       OR v_pilot_auth_count IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION: Pre-check failed' USING ERRCODE = 'P0001';
    END IF;

    -- A. Dedicated Tenant Identity Guard (Null-Safe)
    SELECT id, slug INTO v_existing_tenant_id, v_existing_slug
    FROM public.tenants
    WHERE id = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd';

    IF v_existing_tenant_id IS NOT NULL AND v_existing_slug IS DISTINCT FROM 'h1d-contract-test' THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_TENANT_SLUG_CONFLICT: Dedicated tenant ID exists with unexpected slug %', v_existing_slug USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_existing_tenant_id
    FROM public.tenants
    WHERE slug = 'h1d-contract-test'
      AND id != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd';

    IF v_existing_tenant_id IS NOT NULL THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_TENANT_SLUG_CONFLICT: Dedicated slug already owned by tenant %', v_existing_tenant_id USING ERRCODE = 'P0001';
    END IF;

    -- B. Deterministic Branch ID Guard (bddddddd-0000-0000-0000-000000000001)
    SELECT tenant_id INTO v_existing_tenant_id_for_branch
    FROM public.branches
    WHERE id = 'bddddddd-0000-0000-0000-000000000001';

    IF v_existing_tenant_id_for_branch IS NOT NULL AND v_existing_tenant_id_for_branch != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_BRANCH_OWNERSHIP_CONFLICT: Branch ID owned by tenant %', v_existing_tenant_id_for_branch USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.branches
    WHERE tenant_id = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd'
      AND is_primary = true
      AND is_active = true
      AND id != 'bddddddd-0000-0000-0000-000000000001';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_UNEXPECTED_PRIMARY_BRANCH: Dedicated tenant has another active primary branch' USING ERRCODE = 'P0001';
    END IF;

    -- C. Deterministic Service ID Guard (addddddd-0000-0000-0000-000000000001)
    SELECT tenant_id INTO v_existing_tenant_id_for_service
    FROM public.services
    WHERE id = 'addddddd-0000-0000-0000-000000000001';

    IF v_existing_tenant_id_for_service IS NOT NULL AND v_existing_tenant_id_for_service != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SERVICE_OWNERSHIP_CONFLICT: Service ID owned by tenant %', v_existing_tenant_id_for_service USING ERRCODE = 'P0001';
    END IF;

    -- D. Deterministic Staff ID Guard (cddddddd-0000-0000-0000-000000000001)
    SELECT tenant_id INTO v_existing_tenant_id_for_staff
    FROM public.staff
    WHERE id = 'cddddddd-0000-0000-0000-000000000001';

    IF v_existing_tenant_id_for_staff IS NOT NULL AND v_existing_tenant_id_for_staff != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_STAFF_OWNERSHIP_CONFLICT: Staff ID owned by tenant %', v_existing_tenant_id_for_staff USING ERRCODE = 'P0001';
    END IF;

    -- E. Deterministic Subscription ID Guard (d9999999-9999-9999-9999-999999999999)
    SELECT tenant_id INTO v_existing_tenant_id_for_sub
    FROM public.subscriptions
    WHERE id = 'd9999999-9999-9999-9999-999999999999';

    IF v_existing_tenant_id_for_sub IS NOT NULL AND v_existing_tenant_id_for_sub != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SUBSCRIPTION_OWNERSHIP_CONFLICT: Subscription ID owned by tenant %', v_existing_tenant_id_for_sub USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.subscriptions
    WHERE tenant_id = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd'
      AND id != 'd9999999-9999-9999-9999-999999999999';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_UNEXPECTED_SUBSCRIPTION: Dedicated tenant has an unexpected subscription' USING ERRCODE = 'P0001';
    END IF;

    -- F. Premium Plan Version Cardinality Guard (Canonical Join)
    SELECT COUNT(*) INTO v_count
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'premium'
      AND pv.version_number = 1
      AND pv.lifecycle_status = 'published';

    IF v_count != 1 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_PREMIUM_V1_CARDINALITY_INVALID: Found % published premium v1 versions (expected exactly 1)', v_count USING ERRCODE = 'P0001';
    END IF;

    SELECT pv.id INTO v_plan_version_id
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE p.code = 'premium'
      AND pv.version_number = 1
      AND pv.lifecycle_status = 'published';

    -- G. Subscription Event Semantic Conflict Guard (h1e_c_dedicated_tenant_fixture_sub_event)
    SELECT tenant_id, subscription_id, event_type, internal_reason, metadata->>'source'
    INTO v_existing_tenant_id_for_event, v_existing_sub_id_for_event, v_existing_event_type_for_event, v_existing_reason_for_event, v_existing_source_for_event
    FROM public.subscription_events
    WHERE idempotency_key = 'h1e_c_dedicated_tenant_fixture_sub_event';

    IF v_existing_tenant_id_for_event IS NOT NULL AND (
       v_existing_tenant_id_for_event != 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR
       v_existing_sub_id_for_event != 'd9999999-9999-9999-9999-999999999999' OR
       v_existing_event_type_for_event != 'subscription_created' OR
       v_existing_reason_for_event != 'Stage H1E-C dedicated tenant manual subscription fixture creation' OR
       v_existing_source_for_event IS DISTINCT FROM 'h1e_c_dedicated_tenant_fixture.sql'
    ) THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SUBSCRIPTION_EVENT_CONFLICT: Event key owned by conflicting payload' USING ERRCODE = 'P0001';
    END IF;

    -- H. Relationship Ownership Guards (per-table, null-safe)
    -- H1. service_branches: HAS tenant_id column
    SELECT COUNT(*) INTO v_rel_conflict_count
    FROM public.service_branches sb
    JOIN public.branches b ON b.id = sb.branch_id
    JOIN public.services s ON s.id = sb.service_id
    WHERE (sb.service_id = 'addddddd-0000-0000-0000-000000000001' OR sb.branch_id = 'bddddddd-0000-0000-0000-000000000001')
      AND (sb.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR b.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR s.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd');

    IF v_rel_conflict_count > 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SERVICE_BRANCH_RELATIONSHIP_CONFLICT: service_branches entries conflict with another tenant' USING ERRCODE = 'P0001';
    END IF;

    -- H2. staff_branches: HAS tenant_id column
    SELECT COUNT(*) INTO v_rel_staff_branch_conflict
    FROM public.staff_branches stb
    JOIN public.branches b ON b.id = stb.branch_id
    JOIN public.staff st ON st.id = stb.staff_id
    WHERE (stb.staff_id = 'cddddddd-0000-0000-0000-000000000001' OR stb.branch_id = 'bddddddd-0000-0000-0000-000000000001')
      AND (stb.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR b.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR st.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd');

    IF v_rel_staff_branch_conflict > 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_STAFF_BRANCH_RELATIONSHIP_CONFLICT: staff_branches entries conflict with another tenant' USING ERRCODE = 'P0001';
    END IF;

    -- H3. staff_services: NO tenant_id column — derive ownership from joined parents only
    SELECT COUNT(*) INTO v_rel_staff_service_conflict
    FROM public.staff_services ss
    JOIN public.services s ON s.id = ss.service_id
    JOIN public.staff st ON st.id = ss.staff_id
    WHERE (ss.staff_id = 'cddddddd-0000-0000-0000-000000000001' OR ss.service_id = 'addddddd-0000-0000-0000-000000000001')
      AND (s.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd' OR st.tenant_id IS DISTINCT FROM 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd');

    IF v_rel_staff_service_conflict > 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_STAFF_SERVICE_RELATIONSHIP_CONFLICT: staff_services entries conflict with another tenant' USING ERRCODE = 'P0001';
    END IF;

    -- =========================================================================
    -- UPSERTS (SAFE SCOPED UPSERTS FOR DETERMINISTIC DEDICATED FIXTURE ROWS)
    -- =========================================================================

    -- Tenant record & public_site_status
    INSERT INTO public.tenants (id, slug, name, status, public_site_status)
    VALUES (
      'dddd1111-d1d1-d1d1-d1d1-dddddddddddd',
      'h1d-contract-test',
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

    -- Primary active branch (bddddddd-0000-0000-0000-000000000001)
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

    -- Active manual subscription linked to resolved published plan_version_id
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

    -- Idempotent Fixture Subscription Event
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

    -- Active service (addddddd-0000-0000-0000-000000000001)
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

    -- Active staff (cddddddd-0000-0000-0000-000000000001)
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

    -- Relationship mappings
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

    -- staff_services: NO tenant_id column — only (staff_id, service_id)
    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (
      'cddddddd-0000-0000-0000-000000000001',
      'addddddd-0000-0000-0000-000000000001'
    )
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- POST-FLIGHT RELEASE CONTROL SINGLETON & NULL-SAFE SAFETY INVARIANT RE-CHECK
    -- =========================================================================
    SELECT release_phase, is_payment_collection_enabled, is_checkout_enabled, is_iyzico_enabled
    INTO v_release_phase, v_is_pay_enabled, v_is_chk_enabled, v_is_iyz_enabled
    FROM public.platform_global_release_control
    WHERE id = 1;

    SELECT COUNT(*) INTO v_pilot_auth_count
    FROM public.tenant_pilot_authorizations
    WHERE tenant_id = 'dddd1111-d1d1-d1d1-d1d1-dddddddddddd'
      AND revoked_at IS NULL;

    IF v_release_phase IS DISTINCT FROM 'pre_pilot'
       OR v_is_pay_enabled IS DISTINCT FROM false
       OR v_is_chk_enabled IS DISTINCT FROM false
       OR v_is_iyz_enabled IS DISTINCT FROM false
       OR v_pilot_auth_count IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'H1E_C_FIXTURE_SAFETY_INVARIANT_VIOLATION: Post-check failed' USING ERRCODE = 'P0001';
    END IF;

END $fixture_block$;

COMMIT;
