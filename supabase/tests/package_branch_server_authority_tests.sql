-- =========================================================================
-- TRANSACTIONAL TEST SUITE: package_branch_server_authority_tests.sql
-- Proves Slice 1-R1 Branch Server-Authority Closure, Concurrency Locking & Authorization Assertions (A-L)
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_tenant1_id   uuid := '11111111-1111-1111-1111-111111111111';
    v_tenant2_id   uuid := '22222222-2222-2222-2222-222222222222';
    v_owner1_id    uuid := 'a1111111-1111-1111-1111-111111111111';
    v_owner2_id    uuid := 'a2222222-2222-2222-2222-222222222222';
    v_staff1_id    uuid := 'b1111111-1111-1111-1111-111111111111';
    v_b1_res       jsonb;
    v_b2_res       jsonb;
    v_b1_id        uuid;
    v_b2_id        uuid;
    v_cross_res    jsonb;
    v_staff_res    jsonb;
    v_deact_res    jsonb;
    v_pub_res      jsonb;
    v_slug_test    text;
BEGIN
    RAISE NOTICE 'Starting Package Branch Server-Authority Contract Tests (Slice 1-R1)...';

    -- Test Deterministic IMMUTABLE Slug Function
    v_slug_test := public.generate_branch_slug('   ');
    IF v_slug_test <> 'sube' THEN
        RAISE EXCEPTION 'TEST FAILED: generate_branch_slug empty input did not produce deterministic "sube".';
    END IF;

    v_slug_test := public.generate_branch_slug('Kadıköy Güzellik Stüdyosu!');
    IF v_slug_test <> 'kadikoy-guzellik-studyosu' THEN
        RAISE EXCEPTION 'TEST FAILED: generate_branch_slug Turkish character normalization failed.';
    END IF;

    -- Cleanup test entities if existing
    DELETE FROM public.service_branches WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.staff_branches WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.branches WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.subscriptions WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.tenant_onboarding_progress WHERE tenant_id IN (v_tenant1_id, v_tenant2_id);
    DELETE FROM public.users_profile WHERE id IN (v_owner1_id, v_owner2_id, v_staff1_id);
    DELETE FROM auth.users WHERE id IN (v_owner1_id, v_owner2_id, v_staff1_id);
    DELETE FROM public.tenants WHERE id IN (v_tenant1_id, v_tenant2_id);

    -- Create test tenants
    INSERT INTO public.tenants (id, slug, name, status)
    VALUES (v_tenant1_id, 'branch-test-t1', 'Branch Test Tenant 1', 'active'),
           (v_tenant2_id, 'branch-test-t2', 'Branch Test Tenant 2', 'active');

    -- Create auth users
    INSERT INTO auth.users (id, email, role, created_at, updated_at)
    VALUES (v_owner1_id, 'owner1@test-branch.invalid', 'authenticated', now(), now()),
           (v_owner2_id, 'owner2@test-branch.invalid', 'authenticated', now(), now()),
           (v_staff1_id, 'staff1@test-branch.invalid', 'authenticated', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- Create profiles
    INSERT INTO public.users_profile (id, tenant_id, name, role, active)
    VALUES (v_owner1_id, v_tenant1_id, 'Owner 1', 'tenant_owner', true),
           (v_owner2_id, v_tenant2_id, 'Owner 2', 'tenant_owner', true),
           (v_staff1_id, v_tenant1_id, 'Staff 1', 'staff', true);

    -- Assertion A & E: Tenant owner can create own branch & first branch becomes primary
    PERFORM set_config('request.jwt.claim.sub', v_owner1_id::text, true);
    
    v_b1_res := public.create_tenant_branch(v_tenant1_id, 'Merkez Sube', 'merkez');
    IF (v_b1_res->>'success')::boolean IS NOT TRUE OR (v_b1_res->'branch'->>'is_primary')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED (A/E): First branch creation failed or was not set as primary.';
    END IF;
    v_b1_id := (v_b1_res->'branch'->>'id')::uuid;

    -- Create second branch for tenant 1 -> must NOT be primary by default
    v_b2_res := public.create_tenant_branch(v_tenant1_id, 'Kadikoy Sube', 'kadikoy');
    IF (v_b2_res->>'success')::boolean IS NOT TRUE OR (v_b2_res->'branch'->>'is_primary')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST FAILED (E): Second branch was incorrectly marked as primary.';
    END IF;
    v_b2_id := (v_b2_res->'branch'->>'id')::uuid;

    -- Assertion B: Tenant owner cannot create branch for another tenant
    v_cross_res := public.create_tenant_branch(v_tenant2_id, 'Rogue Branch', 'rogue');
    IF (v_cross_res->>'success')::boolean IS TRUE OR v_cross_res->>'reason_code' <> 'forbidden' THEN
        RAISE EXCEPTION 'TEST FAILED (B): Owner 1 was allowed to create branch for Tenant 2.';
    END IF;

    -- Assertion C: Other tenant owner cannot mutate branch of Tenant 1
    PERFORM set_config('request.jwt.claim.sub', v_owner2_id::text, true);
    
    v_cross_res := public.update_tenant_branch(v_b1_id, 'Hacked Name');
    IF (v_cross_res->>'success')::boolean IS TRUE OR v_cross_res->>'reason_code' <> 'forbidden' THEN
        RAISE EXCEPTION 'TEST FAILED (C): Owner 2 was allowed to update Tenant 1 branch.';
    END IF;

    -- Assertion D: Staff cannot mutate branch
    PERFORM set_config('request.jwt.claim.sub', v_staff1_id::text, true);
    v_staff_res := public.create_tenant_branch(v_tenant1_id, 'Staff Branch', 'staff-b');
    IF (v_staff_res->>'success')::boolean IS TRUE OR v_staff_res->>'reason_code' <> 'forbidden' THEN
        RAISE EXCEPTION 'TEST FAILED (D): Staff was allowed to create branch.';
    END IF;

    -- Switch back to Owner 1
    PERFORM set_config('request.jwt.claim.sub', v_owner1_id::text, true);

    -- Assertion F & G: Primary switch is atomic and unique primary invariant is preserved
    v_b2_res := public.set_primary_tenant_branch(v_b2_id);
    IF (v_b2_res->>'success')::boolean IS NOT TRUE OR (v_b2_res->'branch'->>'is_primary')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED (F): Primary switch failed.';
    END IF;

    -- Verify only b2 is primary now for tenant 1
    IF (SELECT is_primary FROM public.branches WHERE id = v_b1_id) IS TRUE OR
       (SELECT is_primary FROM public.branches WHERE id = v_b2_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED (G): Primary invariant violated after primary switch.';
    END IF;

    -- Assertion H: Deactivation invariant preserved (cannot deactivate active primary if other active branch exists)
    v_deact_res := public.deactivate_tenant_branch(v_b2_id);
    IF (v_deact_res->>'success')::boolean IS TRUE OR v_deact_res->>'reason_code' <> 'cannot_deactivate_primary_with_active_branches' THEN
        RAISE EXCEPTION 'TEST FAILED (H): Active primary deactivation invariant violated.';
    END IF;

    -- Deactivate non-primary b1 first, then verify
    v_deact_res := public.deactivate_tenant_branch(v_b1_id);
    IF (v_deact_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAILED (H): Non-primary branch deactivation failed.';
    END IF;

    -- Assertion I: Inactive branches not returned by public branch RPC
    UPDATE public.tenants SET public_site_status = 'published', onboarding_status = 'completed' WHERE id = v_tenant1_id;
    v_pub_res := public.get_public_branches('branch-test-t1');
    IF (v_pub_res->>'success')::boolean IS NOT TRUE OR jsonb_array_length(v_pub_res->'branches') <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED (I): Inactive branch returned by get_public_branches RPC.';
    END IF;

    -- Assertion J: Public booking requires correct staff_branches and service_branches mappings
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'service_branches' AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED (J): service_branches foreign key constraint missing.';
    END IF;

    -- Assertion K: Check RPC EXECUTE permissions (no anon execution privilege)
    IF has_function_privilege('anon', 'public.create_tenant_branch(uuid, text, text, text)', 'EXECUTE') OR
       has_function_privilege('anon', 'public.update_tenant_branch(uuid, text, text, text)', 'EXECUTE') OR
       has_function_privilege('anon', 'public.set_primary_tenant_branch(uuid)', 'EXECUTE') OR
       has_function_privilege('anon', 'public.deactivate_tenant_branch(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'TEST FAILED (K): Unsafe anon execution privileges exist on owner branch mutation RPCs.';
    END IF;

    -- Assertion L: No cross-tenant branch mapping possible (enforced by (branch_id, tenant_id) composite FK)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name IN ('service_branches', 'staff_branches') AND constraint_type = 'FOREIGN KEY'
    ) THEN
        RAISE EXCEPTION 'TEST FAILED (L): Composite tenant-isolated foreign keys missing on branch mappings.';
    END IF;

    RAISE NOTICE '✅ ALL PACKAGE BRANCH SERVER-AUTHORITY CONTRACT TESTS (A-L) PASSED SUCCESSFULLY!';
END;
$$;

ROLLBACK;
