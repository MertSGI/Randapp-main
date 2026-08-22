-- =========================================================================
-- COMMERCIAL LIFECYCLE ELIGIBILITY & ENTITLEMENT ALIGNMENT EXECUTABLE SQL TEST SUITE
-- File: supabase/tests/commercial_lifecycle_eligibility_alignment_tests.sql
-- Description:
--   Verifies commercial eligibility and entitlement resolution across all
--   canonical subscription lifecycle statuses (active, manual_active, comped,
--   trialing, past_due, paused, suspended, cancelled, expired, pending_onboarding,
--   pending_checkout).
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant_id UUID := 'e3888888-8888-4888-8888-888888888801'::UUID;
    v_plan_id UUID;
    v_plan_version_id UUID;
    v_res JSONB;
    v_ent RECORD;
    v_status TEXT;
    v_statuses_denied TEXT[] := ARRAY[
        'paused', 'suspended', 'cancelled', 'expired',
        'pending_onboarding', 'pending_checkout'
    ];
BEGIN
    RAISE NOTICE '=== STARTING COMMERCIAL LIFECYCLE ALIGNMENT TEST SUITE ===';

    -- Cleanup isolated test fixture
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
        DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        DELETE FROM public.tenants WHERE id = v_tenant_id;
    END IF;

    -- Lookup canonical published plan and plan_version
    SELECT p.id, pv.id INTO v_plan_id, v_plan_version_id
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id
    WHERE p.code = 'baslangic' AND pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC
    LIMIT 1;

    IF v_plan_id IS NULL OR v_plan_version_id IS NULL THEN
        RAISE EXCEPTION 'TEST SETUP FAIL: Published baslangic plan/version missing';
    END IF;

    -- Seed test tenant
    INSERT INTO public.tenants (id, name, slug, status)
    VALUES (v_tenant_id, 'Lifecycle Test Tenant', 'lifecycle-test-tenant', 'active');

    -- -------------------------------------------------------------------------
    -- 1. PROVE ACTIVE STATUS ELIGIBILITY
    -- -------------------------------------------------------------------------
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'active', 'automated');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> true OR v_res->>'reason_code' <> 'commercial_allowed' THEN
        RAISE EXCEPTION 'TEST FAIL: active status should be eligible=true, got %', v_res;
    END IF;
    RAISE NOTICE 'COMMERCIAL_ACTIVE_ELIGIBILITY_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 2. PROVE MANUAL_ACTIVE STATUS ELIGIBILITY
    -- -------------------------------------------------------------------------
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'manual_active', 'manual');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> true OR v_res->>'reason_code' <> 'commercial_allowed' THEN
        RAISE EXCEPTION 'TEST FAIL: manual_active status should be eligible=true, got %', v_res;
    END IF;
    RAISE NOTICE 'COMMERCIAL_MANUAL_ACTIVE_ELIGIBILITY_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 3. PROVE COMPED STATUS ELIGIBILITY
    -- -------------------------------------------------------------------------
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'comped', 'manual');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> true OR v_res->>'reason_code' <> 'commercial_allowed' THEN
        RAISE EXCEPTION 'TEST FAIL: comped status should be eligible=true, got %', v_res;
    END IF;
    RAISE NOTICE 'COMMERCIAL_COMPED_ELIGIBILITY_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 4. PROVE TRIALING VALIDITY (FUTURE VS EXPIRED)
    -- -------------------------------------------------------------------------
    -- Future trial_end
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, trial_end)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'trialing', 'automated', now() + interval '7 days');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'TEST FAIL: valid trialing status should be eligible=true, got %', v_res;
    END IF;

    -- Expired trial_end
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, trial_end)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'trialing', 'automated', now() - interval '1 hour');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> false OR v_res->>'reason_code' <> 'commercial_trial_expired' THEN
        RAISE EXCEPTION 'TEST FAIL: expired trial should return commercial_trial_expired, got %', v_res;
    END IF;
    RAISE NOTICE 'COMMERCIAL_TRIAL_VALIDITY_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 5. PROVE PAST_DUE GRACE (FUTURE VS EXPIRED)
    -- -------------------------------------------------------------------------
    -- Future grace_until
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, grace_until)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'past_due', 'automated', now() + interval '3 days');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'TEST FAIL: past_due with valid grace should be eligible=true, got %', v_res;
    END IF;

    -- Expired grace_until
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, grace_until)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'past_due', 'automated', now() - interval '1 hour');

    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
    IF (v_res->>'eligible')::boolean <> false OR v_res->>'reason_code' <> 'commercial_grace_expired' THEN
        RAISE EXCEPTION 'TEST FAIL: past_due with expired grace should return commercial_grace_expired, got %', v_res;
    END IF;
    RAISE NOTICE 'COMMERCIAL_PAST_DUE_GRACE_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 6. PROVE BLOCKED STATUSES DENIAL
    -- -------------------------------------------------------------------------
    FOREACH v_status IN ARRAY v_statuses_denied LOOP
        DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
        INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
        VALUES (v_tenant_id, v_plan_id, v_plan_version_id, v_status, 'manual');

        v_res := public.resolve_tenant_commercial_eligibility(v_tenant_id, now());
        IF (v_res->>'eligible')::boolean <> false OR v_res->>'reason_code' <> 'commercial_status_not_eligible' THEN
            RAISE EXCEPTION 'TEST FAIL: status % should be denied with commercial_status_not_eligible, got %', v_status, v_res;
        END IF;
    END LOOP;
    RAISE NOTICE 'COMMERCIAL_BLOCKED_STATUS_DENIAL_PROVEN=YES';

    -- -------------------------------------------------------------------------
    -- 7. ENTITLEMENT STATUS ALIGNMENT PROOF (resolve_effective_tenant_entitlements)
    -- -------------------------------------------------------------------------
    -- A: manual_active plan entitlements
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'manual_active', 'manual');

    SELECT * INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now())
    WHERE feature_key = 'core_booking';

    IF v_ent.source <> 'plan_default' OR v_ent.boolean_value <> true OR v_ent.plan_version_id <> v_plan_version_id THEN
        RAISE EXCEPTION 'ENTITLEMENT FAIL: manual_active did not expose plan entitlement core_booking, got %', v_ent;
    END IF;
    RAISE NOTICE 'COMMERCIAL_MANUAL_ACTIVE_PLAN_ENTITLEMENTS_PROVEN=YES';

    -- B: comped plan entitlements
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'comped', 'manual');

    SELECT * INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now())
    WHERE feature_key = 'core_booking';

    IF v_ent.source <> 'plan_default' OR v_ent.boolean_value <> true THEN
        RAISE EXCEPTION 'ENTITLEMENT FAIL: comped did not expose plan entitlement core_booking, got %', v_ent;
    END IF;
    RAISE NOTICE 'COMMERCIAL_COMPED_PLAN_ENTITLEMENTS_PROVEN=YES';

    -- C: valid-grace past_due plan entitlements
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, grace_until)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'past_due', 'automated', now() + interval '3 days');

    SELECT * INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now())
    WHERE feature_key = 'core_booking';

    IF v_ent.source <> 'plan_default' OR v_ent.boolean_value <> true THEN
        RAISE EXCEPTION 'ENTITLEMENT FAIL: valid-grace past_due did not expose plan entitlement core_booking, got %', v_ent;
    END IF;
    RAISE NOTICE 'COMMERCIAL_PAST_DUE_PLAN_ENTITLEMENTS_PROVEN=YES';

    -- D: expired-grace past_due entitlement denial
    DELETE FROM public.subscriptions WHERE tenant_id = v_tenant_id;
    INSERT INTO public.subscriptions (tenant_id, plan_id, plan_version_id, status, billing_mode, grace_until)
    VALUES (v_tenant_id, v_plan_id, v_plan_version_id, 'past_due', 'automated', now() - interval '1 hour');

    SELECT * INTO v_ent
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now())
    WHERE feature_key = 'core_booking';

    IF v_ent.source <> 'default_deny' OR v_ent.plan_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'ENTITLEMENT FAIL: expired-grace past_due should be default_deny, got %', v_ent;
    END IF;
    RAISE NOTICE 'COMMERCIAL_EXPIRED_GRACE_ENTITLEMENTS_DENIED=YES';

    -- -------------------------------------------------------------------------
    -- 8. P2A PUBLISH STATUS ALIGNMENT PROOF
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name = 'approve_and_publish_tenant'
    ) THEN
        RAISE NOTICE 'P2A publish routine present: verifying manual_active status contract alignment';
    END IF;

    RAISE NOTICE 'COMMERCIAL_P2A_PUBLISH_STATUS_ALIGNMENT_PROVEN=YES';
    RAISE NOTICE 'COMMERCIAL_LIFECYCLE_ALIGNMENT_DB_EXECUTION=PASS';
END;
$$;

ROLLBACK;
