-- ============================================================================
-- SLICE 4 E2 COMMERCIAL TEST FIXTURE HELPER
-- File: supabase/tests/fixtures/slice4_e2_commercial_fixture.sql
-- Purpose:
--   Seeds active canonical commercial subscriptions for all synthetic test tenants
--   to satisfy quota triggers (enforce_staff_quota, enforce_service_quota, etc.)
--   and resolve_tenant_commercial_eligibility.
-- ============================================================================

DO $$
DECLARE
    v_plan_code TEXT;
    v_plan_version_id UUID;
    v_tenant_rec RECORD;
    v_elig JSONB;
BEGIN
    -- 1. Select a published plan version with canonical plan code
    SELECT p.code, pv.id
    INTO v_plan_code, v_plan_version_id
    FROM public.plan_versions pv
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC
    LIMIT 1;

    IF v_plan_version_id IS NULL OR v_plan_code IS NULL THEN
        RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: No published plan_version found in database.';
    END IF;

    -- 2. Bootstrap subscriptions for all current tenants in public.tenants
    FOR v_tenant_rec IN SELECT id FROM public.tenants LOOP
        INSERT INTO public.subscriptions (
            tenant_id,
            plan_id,
            plan_version_id,
            status,
            billing_mode,
            current_period_start,
            current_period_end
        ) VALUES (
            v_tenant_rec.id,
            v_plan_code,
            v_plan_version_id,
            'active',
            'manual',
            now() - interval '1 day',
            now() + interval '1 year'
        ) ON CONFLICT (tenant_id) DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            plan_version_id = EXCLUDED.plan_version_id,
            status = 'active',
            billing_mode = 'manual',
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end;

        -- Prove Commercial Eligibility
        v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_rec.id);
        IF (v_elig->>'eligible')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_TEST_FIXTURE_FATAL: Tenant % eligibility resolved false: %', v_tenant_rec.id, v_elig;
        END IF;
    END LOOP;
END $$;
