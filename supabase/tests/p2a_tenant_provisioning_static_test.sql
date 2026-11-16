-- p2a_tenant_provisioning_static_test.sql
-- Static SQL Security, Integrity & Structural Verification Suite for P2A Atomic Tenant Provisioning (P2A.0-R1)
-- Governance: STATIC TEST FILE ONLY. DO NOT APPLY TO LIVE STAGING DATABASE.

DO $$
BEGIN
    RAISE NOTICE '=== RUNNING P2A.0-R1 ATOMIC TENANT PROVISIONING STATIC SQL INTEGRITY TESTS ===';

    -- Invariant A: Unauthenticated Call Guard
    BEGIN
        PERFORM public.provision_tenant_for_authenticated_owner(
            p_business_name => 'Static Check Salon',
            p_idempotency_key => 'static-key-1'
        );
        RAISE EXCEPTION 'TEST P2A-PROV-01 FAIL: Unauthenticated execution did not throw exception.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%UNAUTHENTICATED%' THEN
            RAISE NOTICE 'TEST P2A-PROV-01 PASS: Unauthenticated call correctly blocked.';
        ELSE
            RAISE EXCEPTION 'TEST P2A-PROV-01 FAIL: Unexpected error message: %', SQLERRM;
        END IF;
    END;

    RAISE NOTICE '=== ALL P2A.0-R1 STATIC SQL INTEGRITY CHECKS PASSED ===';
END;
$$;
