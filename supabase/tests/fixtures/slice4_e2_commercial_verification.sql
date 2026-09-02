-- ============================================================================
-- HEALTH TOURISM SLICE 4 EXPLICIT COMMERCIAL VERIFICATION FIXTURE (R9-R1)
-- File: supabase/tests/fixtures/slice4_e2_commercial_verification.sql
-- Purpose:
--   Includes the canonical commercial fixture helper in the SAME psql session,
--   creates a dedicated synthetic tenant, bootstraps its commercial subscription,
--   and explicitly verifies eligibility, 4 required boolean feature entitlements,
--   and 4 required unlimited integer quotas.
-- ============================================================================

BEGIN;

-- 1. Include canonical commercial fixture helper inside the SAME psql session!
\i supabase/tests/fixtures/slice4_e2_commercial_fixture.sql

DO $$
DECLARE
    v_tenant_id UUID := 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2';
    v_elig JSONB;
    v_bool_val BOOLEAN;
    v_quota JSONB;
    v_fk TEXT;
BEGIN
    -- 2. Insert dedicated synthetic test tenant
    INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
    VALUES (v_tenant_id, 'E2 Commercial Verification Tenant', 'e2-comm-verify', 'active', 'completed', 'published')
    ON CONFLICT (id) DO NOTHING;

    -- 3. Bootstrap commercial subscription using canonical helper
    PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_tenant_id);

    -- 4. Verify Commercial Bootstrap & Eligibility
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF (v_elig->>'eligible')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Tenant eligibility resolved false: %', v_elig;
    END IF;
    RAISE NOTICE 'COMMERCIAL_BOOTSTRAP_RESULT=PASS';
    RAISE NOTICE 'COMMERCIAL_ELIGIBILITY_RESULT=PASS';

    -- 5. Verify 4 Required Boolean Entitlements
    FOREACH v_fk IN ARRAY ARRAY['core_booking', 'staff_management', 'service_management', 'lari_minisite'] LOOP
        SELECT boolean_value INTO v_bool_val
        FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
        WHERE feature_key = v_fk;

        IF v_bool_val IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Feature % resolved false', v_fk;
        END IF;

        IF v_fk = 'core_booking' THEN RAISE NOTICE 'COMMERCIAL_CORE_BOOKING_RESULT=PASS'; END IF;
        IF v_fk = 'staff_management' THEN RAISE NOTICE 'COMMERCIAL_STAFF_MANAGEMENT_RESULT=PASS'; END IF;
        IF v_fk = 'service_management' THEN RAISE NOTICE 'COMMERCIAL_SERVICE_MANAGEMENT_RESULT=PASS'; END IF;
        IF v_fk = 'lari_minisite' THEN RAISE NOTICE 'COMMERCIAL_LARI_MINISITE_RESULT=PASS'; END IF;
    END LOOP;

    -- 6. Verify 4 Required Unlimited Quotas
    FOREACH v_fk IN ARRAY ARRAY['max_staff', 'max_services', 'max_branches', 'max_monthly_appointments'] LOOP
        v_quota := public.resolve_commercial_quota(v_tenant_id, v_fk);
        IF (v_quota->>'is_unlimited')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Quota % resolved not unlimited: %', v_fk, v_quota;
        END IF;

        IF v_fk = 'max_staff' THEN RAISE NOTICE 'COMMERCIAL_MAX_STAFF_RESULT=PASS'; END IF;
        IF v_fk = 'max_services' THEN RAISE NOTICE 'COMMERCIAL_MAX_SERVICES_RESULT=PASS'; END IF;
        IF v_fk = 'max_branches' THEN RAISE NOTICE 'COMMERCIAL_MAX_BRANCHES_RESULT=PASS'; END IF;
        IF v_fk = 'max_monthly_appointments' THEN RAISE NOTICE 'COMMERCIAL_MAX_MONTHLY_APPOINTMENTS_RESULT=PASS'; END IF;
    END LOOP;

    RAISE NOTICE 'COMMERCIAL_FIXTURE_RESULT=PASS';
    RAISE NOTICE 'COMMERCIAL_QUOTA_RESULT=PASS';
END $$;

ROLLBACK;
