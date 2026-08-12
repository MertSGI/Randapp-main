-- p2a_tenant_provisioning_static_test.sql
-- Static SQL Behavioral & Security Verification Suite for P2A Atomic Tenant Provisioning
-- Governance: STATIC TEST FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.

DO $$
DECLARE
    v_test_owner_id UUID := gen_random_uuid();
    v_result JSONB;
    v_tenant_id UUID;
    v_slug TEXT;
    v_owner_role TEXT;
    v_bound_tenant UUID;
    v_sub_count INT;
    v_onboarding_count INT;
BEGIN
    RAISE NOTICE '=== RUNNING P2A ATOMIC TENANT PROVISIONING STATIC SQL TESTS ===';

    -- 1. Test Unauthenticated Guard Exception
    BEGIN
        -- Without auth.uid(), should raise exception
        PERFORM public.provision_tenant_for_authenticated_owner('Test Salon', 'Test Salon Display');
        RAISE EXCEPTION 'TEST 1 FAIL: Unauthenticated execution did not throw exception.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%UNAUTHENTICATED%' THEN
            RAISE NOTICE 'TEST 1 PASS: Unauthenticated call correctly blocked.';
        ELSE
            RAISE EXCEPTION 'TEST 1 FAIL: Unexpected error message: %', SQLERRM;
        END IF;
    END;

    RAISE NOTICE '=== ALL P2A ATOMIC TENANT PROVISIONING STATIC TESTS COMPLETED SUCCESSFULLY ===';
END;
$$;
