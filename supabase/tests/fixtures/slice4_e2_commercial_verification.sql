-- ============================================================================
-- HEALTH TOURISM SLICE 4 EXPLICIT COMMERCIAL VERIFICATION FIXTURE
-- File: supabase/tests/fixtures/slice4_e2_commercial_verification.sql
-- Purpose:
--   Creates a dedicated synthetic tenant, bootstraps its commercial subscription,
--   and explicitly verifies eligibility, 4 required boolean feature entitlements,
--   and 4 required unlimited integer quotas.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_tenant_id UUID := 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2';
    v_elig JSONB;
    v_bool_val BOOLEAN;
    v_quota JSONB;
    v_fk TEXT;
BEGIN
    -- 1. Insert dedicated synthetic test tenant
    INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
    VALUES (v_tenant_id, 'E2 Commercial Verification Tenant', 'e2-comm-verify', 'active', 'completed', 'published')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap commercial subscription using canonical helper
    PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_tenant_id);

    -- 3. Verify Commercial Eligibility
    v_elig := public.resolve_tenant_commercial_eligibility(v_tenant_id);
    IF (v_elig->>'eligible')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Tenant eligibility resolved false: %', v_elig;
    END IF;

    -- 4. Verify 4 Required Boolean Entitlements
    FOREACH v_fk IN ARRAY ARRAY['core_booking', 'staff_management', 'service_management', 'lari_minisite'] LOOP
        SELECT boolean_value INTO v_bool_val
        FROM public.resolve_effective_tenant_entitlements(v_tenant_id)
        WHERE feature_key = v_fk;

        IF v_bool_val IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Feature % resolved false', v_fk;
        END IF;
    END LOOP;

    -- 5. Verify 4 Required Unlimited Quotas
    FOREACH v_fk IN ARRAY ARRAY['max_staff', 'max_services', 'max_branches', 'max_monthly_appointments'] LOOP
        v_quota := public.resolve_commercial_quota(v_tenant_id, v_fk);
        IF (v_quota->>'is_unlimited')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'COMMERCIAL_VERIFY_FAIL: Quota % resolved not unlimited: %', v_fk, v_quota;
        END IF;
    END LOOP;

    RAISE NOTICE 'COMMERCIAL_FIXTURE_RESULT=PASS';
    RAISE NOTICE 'COMMERCIAL_ELIGIBILITY_RESULT=PASS';
    RAISE NOTICE 'COMMERCIAL_QUOTA_RESULT=PASS';
END $$;

ROLLBACK;
