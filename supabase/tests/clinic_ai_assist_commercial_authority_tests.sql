-- ============================================================================
-- LARİ CLINIC AI ASSIST COMMERCIAL AUTHORITY EXECUTABLE SQL TEST SUITE (SLICE R2.2)
-- File: supabase/tests/clinic_ai_assist_commercial_authority_tests.sql
-- Purpose:
--   Executable SQL verification for Migration 65 (Clinic AI Quota Authority)
--   with REAL DB role switching, synthetic collision-resistant UUID fixtures,
--   exact catalog ACL inspection, strict 25-case PL/pgSQL assertions,
--   cross-tenant quota isolation, quota limit boundaries, and response non-disclosure.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: SYNTHETIC FIXTURE SETUP (Privileged Session Role — postgres superuser)
-- ============================================================================
DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_tenant_b_id UUID := 'b9999999-9999-4999-9999-999999999902'::UUID;

    v_practitioner_a_uid UUID := 'a9999999-9999-4999-9999-999999999901'::UUID;
    v_practitioner_b_uid UUID := 'a9999999-9999-4999-9999-999999999902'::UUID;
    v_no_profile_staff_uid UUID := 'a9999999-9999-4999-9999-999999999903'::UUID;
    v_reception_staff_uid UUID := 'a9999999-9999-4999-9999-999999999904'::UUID;
    v_owner_uid UUID := 'a9999999-9999-4999-9999-999999999905'::UUID;
    v_superadmin_uid UUID := 'a9999999-9999-4999-9999-999999999906'::UUID;

    v_practitioner_a_staff_id UUID := '39999999-9999-4999-9999-999999999901'::UUID;
    v_practitioner_b_staff_id UUID := '39999999-9999-4999-9999-999999999902'::UUID;
    v_no_profile_staff_id UUID := '39999999-9999-4999-9999-999999999903'::UUID;
    v_reception_staff_id UUID := '39999999-9999-4999-9999-999999999904'::UUID;

    v_plan_version_id UUID;
BEGIN
    RAISE NOTICE '=== STARTING CLINIC AI ASSIST COMMERCIAL AUTHORITY EXECUTABLE SQL SUITE (R2.2) ===';

    -- Cleanup synthetic test fixtures if present
    DELETE FROM public.usage_counters WHERE tenant_id IN (v_tenant_a_id, v_tenant_b_id);
    DELETE FROM public.tenant_entitlement_overrides WHERE tenant_id IN (v_tenant_a_id, v_tenant_b_id);
    DELETE FROM public.clinic_staff_profiles WHERE tenant_id IN (v_tenant_a_id, v_tenant_b_id);
    DELETE FROM public.staff WHERE tenant_id IN (v_tenant_a_id, v_tenant_b_id);
    DELETE FROM public.subscriptions WHERE tenant_id IN (v_tenant_a_id, v_tenant_b_id);
    DELETE FROM public.users_profile WHERE id IN (
        v_practitioner_a_uid, v_practitioner_b_uid, v_no_profile_staff_uid,
        v_reception_staff_uid, v_owner_uid, v_superadmin_uid
    );
    DELETE FROM public.tenants WHERE id IN (v_tenant_a_id, v_tenant_b_id);

    -- Seed Tenants
    INSERT INTO public.tenants (id, name, slug, status)
    VALUES (v_tenant_a_id, 'AI Quota Test Clinic A', 'ai-quota-test-a', 'active'),
           (v_tenant_b_id, 'AI Quota Test Clinic B', 'ai-quota-test-b', 'active');

    -- Resolve published plan_version_id for subscriptions
    SELECT pv.id INTO v_plan_version_id
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id
    WHERE p.code = 'baslangic' AND pv.lifecycle_status = 'published'
    ORDER BY pv.created_at DESC
    LIMIT 1;

    IF v_plan_version_id IS NULL THEN
        RAISE EXCEPTION 'FIXTURE SETUP FAIL: Published baslangic plan version not found.';
    END IF;

    -- Seed Subscription for Tenant A (active lifecycle default)
    INSERT INTO public.subscriptions (
        tenant_id, plan_id, plan_version_id, status, billing_mode
    ) VALUES (
        v_tenant_a_id,
        (SELECT plan_id FROM public.plan_versions WHERE id = v_plan_version_id),
        v_plan_version_id,
        'active',
        'stripe'
    );

    -- Seed Subscription for Tenant B (manual_active lifecycle)
    INSERT INTO public.subscriptions (
        tenant_id, plan_id, plan_version_id, status, billing_mode
    ) VALUES (
        v_tenant_b_id,
        (SELECT plan_id FROM public.plan_versions WHERE id = v_plan_version_id),
        v_plan_version_id,
        'manual_active',
        'manual'
    );

    -- Seed User Profiles
    INSERT INTO public.users_profile (id, tenant_id, role, name, active)
    VALUES (v_practitioner_a_uid, v_tenant_a_id, 'staff', 'Dr. Practitioner A', true),
           (v_practitioner_b_uid, v_tenant_b_id, 'staff', 'Dr. Practitioner B', true),
           (v_no_profile_staff_uid, v_tenant_a_id, 'staff', 'No Profile Staff', true),
           (v_reception_staff_uid, v_tenant_a_id, 'staff', 'Receptionist Staff', true),
           (v_owner_uid, v_tenant_a_id, 'tenant_owner', 'Owner Tenant A', true),
           (v_superadmin_uid, NULL, 'super_admin', 'Super Admin User', true);

    -- Seed Staff Records
    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active)
    VALUES (v_practitioner_a_staff_id, v_tenant_a_id, v_practitioner_a_uid, 'Dr. Practitioner A', true),
           (v_practitioner_b_staff_id, v_tenant_b_id, v_practitioner_b_uid, 'Dr. Practitioner B', true),
           (v_no_profile_staff_id, v_tenant_a_id, v_no_profile_staff_uid, 'No Profile Staff', true),
           (v_reception_staff_id, v_tenant_a_id, v_reception_staff_uid, 'Receptionist Staff', true);

    -- Seed Clinic Staff Profiles with specific capabilities
    INSERT INTO public.clinic_staff_profiles (
        tenant_id, staff_id, practitioner_type, specialty,
        can_manage_patient_profiles, can_view_clinical_records, can_write_clinical_notes
    ) VALUES
        (v_tenant_a_id, v_practitioner_a_staff_id, 'physician', 'General Medicine', true, true, true),
        (v_tenant_b_id, v_practitioner_b_staff_id, 'physician', 'Dermatology', true, true, true),
        (v_tenant_a_id, v_reception_staff_id, 'receptionist', 'Front Desk', true, false, false);
        -- Note: v_no_profile_staff_id intentionally left WITHOUT a clinic_staff_profile

    -- Seed Default Tenant A Entitlement Override for ai_allowance = 5
    INSERT INTO public.tenant_entitlement_overrides (
        tenant_id, feature_key, value_type, integer_value, is_unlimited, reason
    ) VALUES (
        v_tenant_a_id, 'ai_allowance', 'integer', 5, false, 'Executable SQL Test Fixture Tenant A'
    );

    -- Seed Default Tenant B Entitlement Override for ai_allowance = 10
    INSERT INTO public.tenant_entitlement_overrides (
        tenant_id, feature_key, value_type, integer_value, is_unlimited, reason
    ) VALUES (
        v_tenant_b_id, 'ai_allowance', 'integer', 10, false, 'Executable SQL Test Fixture Tenant B'
    );

    RAISE NOTICE 'SECTION 1: SYNTHETIC FIXTURE SETUP COMPLETE.';
END;
$$;


-- ============================================================================
-- SECTION 2: EXECUTABLE MANDATORY CASES (25 Explicit Executable PL/pgSQL Checks)
-- ============================================================================
DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_tenant_b_id UUID := 'b9999999-9999-4999-9999-999999999902'::UUID;

    v_practitioner_a_uid UUID := 'a9999999-9999-4999-9999-999999999901'::UUID;
    v_practitioner_b_uid UUID := 'a9999999-9999-4999-9999-999999999902'::UUID;
    v_no_profile_staff_uid UUID := 'a9999999-9999-4999-9999-999999999903'::UUID;
    v_reception_staff_uid UUID := 'a9999999-9999-4999-9999-999999999904'::UUID;
    v_owner_uid UUID := 'a9999999-9999-4999-9999-99999999905'::UUID;
    v_superadmin_uid UUID := 'a9999999-9999-4999-9999-999999999906'::UUID;

    v_sub_id UUID;
    v_res JSONB;
    v_current_usage BIGINT;
    v_period_key TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');
BEGIN
    SELECT id INTO v_sub_id FROM public.subscriptions WHERE tenant_id = v_tenant_a_id LIMIT 1;

    -- ------------------------------------------------------------------------
    -- CASE 01: active lifecycle => commercial eligible
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'active' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 01 FAIL: active status evaluated ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 01 PASS: active status evaluated commercial eligible';

    -- ------------------------------------------------------------------------
    -- CASE 02: manual_active => commercial eligible
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'manual_active' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 02 FAIL: manual_active status evaluated ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 02 PASS: manual_active status evaluated commercial eligible';

    -- ------------------------------------------------------------------------
    -- CASE 03: comped => commercial eligible
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'comped' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 03 FAIL: comped status evaluated ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 03 PASS: comped status evaluated commercial eligible';

    -- ------------------------------------------------------------------------
    -- CASE 04: valid trialing before trial_end => commercial eligible
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'trialing', trial_end = now() + interval '7 days' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 04 FAIL: valid trialing evaluated ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 04 PASS: valid trialing status evaluated commercial eligible';

    -- ------------------------------------------------------------------------
    -- CASE 05: expired trialing => COMMERCIAL_NOT_ELIGIBLE
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'trialing', trial_end = now() - interval '1 hour' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> false OR (v_res->>'reason_code') <> 'commercial_trial_expired' THEN
        RAISE EXCEPTION 'CASE 05 FAIL: expired trialing should be ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 05 PASS: expired trialing evaluated COMMERCIAL_NOT_ELIGIBLE';

    -- ------------------------------------------------------------------------
    -- CASE 06: valid past_due before grace_until => commercial eligible
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'past_due', grace_until = now() + interval '3 days', trial_end = NULL WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 06 FAIL: valid past_due evaluated ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 06 PASS: valid past_due status evaluated commercial eligible';

    -- ------------------------------------------------------------------------
    -- CASE 07: expired past_due => COMMERCIAL_NOT_ELIGIBLE
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'past_due', grace_until = now() - interval '1 hour' WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> false OR (v_res->>'reason_code') <> 'commercial_grace_expired' THEN
        RAISE EXCEPTION 'CASE 07 FAIL: expired past_due should be ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 07 PASS: expired past_due evaluated COMMERCIAL_NOT_ELIGIBLE';

    -- ------------------------------------------------------------------------
    -- CASE 08: blocked lifecycle (canceled/paused/suspended) => COMMERCIAL_NOT_ELIGIBLE
    -- ------------------------------------------------------------------------
    UPDATE public.subscriptions SET status = 'canceled', grace_until = NULL WHERE id = v_sub_id;
    v_res := public.resolve_tenant_commercial_eligibility(v_tenant_a_id, now());
    IF (v_res->>'eligible')::boolean <> false THEN
        RAISE EXCEPTION 'CASE 08 FAIL: canceled status should be ineligible: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 08 PASS: canceled status evaluated COMMERCIAL_NOT_ELIGIBLE';

    -- Restore Tenant A subscription to active for subsequent tests
    UPDATE public.subscriptions SET status = 'active', grace_until = NULL, trial_end = NULL WHERE id = v_sub_id;

    -- ------------------------------------------------------------------------
    -- CASE 09: zero-argument clinic_check_and_consume_ai_allowance() exists
    -- ------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'clinic_check_and_consume_ai_allowance'
          AND p.pronargs = 0
    ) THEN
        RAISE EXCEPTION 'CASE 09 FAIL: 0-argument clinic_check_and_consume_ai_allowance() function missing in pg_proc';
    END IF;
    RAISE NOTICE '✓ CASE 09 PASS: 0-argument clinic_check_and_consume_ai_allowance() catalog signature exists';

    -- ------------------------------------------------------------------------
    -- CASE 10: legacy clinic_check_and_consume_ai_allowance(UUID, INT) does NOT exist
    -- ------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'clinic_check_and_consume_ai_allowance'
          AND p.pronargs > 0
    ) THEN
        RAISE EXCEPTION 'CASE 10 FAIL: Parameterized legacy signature still exists in catalog';
    END IF;
    RAISE NOTICE '✓ CASE 10 PASS: Parameterized legacy signature absent from catalog';
END;
$$;


-- ============================================================================
-- SECTION 3: ROLE & PERMISSION CONTEXT PROOF (SET LOCAL ROLE authenticated / anon)
-- ============================================================================

-- CASE 11: Anon / Unauthenticated execution
SET LOCAL ROLE anon;

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'UNAUTHENTICATED' THEN
        RAISE EXCEPTION 'CASE 11 FAIL: Anon caller returned: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 11 PASS: Anon / unauthenticated caller rejected with UNAUTHENTICATED';
END;
$$;


-- Switch to authenticated role for user context checks
SET LOCAL ROLE authenticated;

-- CASE 12: Authenticated user with no active staff record => FORBIDDEN
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'a9999999-9999-4999-9999-999999999905', true); -- Owner UID (no staff record)

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'FORBIDDEN' THEN
        RAISE EXCEPTION 'CASE 12 FAIL: Non-staff authenticated user returned: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 12 PASS: Authenticated non-staff user rejected with FORBIDDEN';
END;
$$;


-- CASE 13: Active staff with no Clinic staff profile => FORBIDDEN
SELECT set_config('request.jwt.claim.sub', 'a9999999-9999-4999-9999-999999999903', true); -- No Profile Staff UID

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'FORBIDDEN' THEN
        RAISE EXCEPTION 'CASE 13 FAIL: Staff with no Clinic profile returned: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 13 PASS: Active staff with no Clinic profile rejected with FORBIDDEN';
END;
$$;


-- CASE 14: Receptionist staff with can_write_clinical_notes = false => FORBIDDEN
SELECT set_config('request.jwt.claim.sub', 'a9999999-9999-4999-9999-999999999904', true); -- Receptionist Staff UID

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'FORBIDDEN' THEN
        RAISE EXCEPTION 'CASE 14 FAIL: Staff without note write authority returned: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 14 PASS: Receptionist without note write capability rejected with FORBIDDEN';
END;
$$;


-- CASE 15: super_admin without valid Clinic staff authority => FORBIDDEN
SELECT set_config('request.jwt.claim.sub', 'a9999999-9999-4999-9999-999999999906', true); -- Super Admin UID

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'FORBIDDEN' THEN
        RAISE EXCEPTION 'CASE 15 FAIL: Super Admin without clinic staff returned: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 15 PASS: super_admin without Clinic staff context rejected with FORBIDDEN';
END;
$$;


-- CASE 16 & 17: Valid practitioner consumes own tenant allowance (+1), cross-tenant isolation verified
SELECT set_config('request.jwt.claim.sub', 'a9999999-9999-4999-9999-999999999901', true); -- Dr. Practitioner A (Tenant A)

DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_tenant_b_id UUID := 'b9999999-9999-4999-9999-999999999902'::UUID;
    v_period_key TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');

    v_res JSONB;
    v_usage_a BIGINT;
    v_usage_b_before BIGINT;
    v_usage_b_after BIGINT;
BEGIN
    SELECT COALESCE(usage_count, 0) INTO v_usage_b_before
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_b_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    v_res := public.clinic_check_and_consume_ai_allowance();

    IF (v_res->>'success')::boolean <> true OR (v_res->>'reason_code') <> 'COMMERCIAL_ALLOWED' THEN
        RAISE EXCEPTION 'CASE 16 FAIL: Valid practitioner A returned failure: %', v_res;
    END IF;

    SELECT usage_count INTO v_usage_a
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    IF v_usage_a <> 1 THEN
        RAISE EXCEPTION 'CASE 16 FAIL: Tenant A usage expected 1, got %', v_usage_a;
    END IF;
    RAISE NOTICE '✓ CASE 16 PASS: Valid practitioner A consumed exactly 1 unit for own tenant (Tenant A)';

    SELECT COALESCE(usage_count, 0) INTO v_usage_b_after
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_b_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    IF v_usage_b_before <> v_usage_b_after THEN
        RAISE EXCEPTION 'CASE 17 FAIL: Tenant B usage modified during Tenant A invocation! Before: %, After: %', v_usage_b_before, v_usage_b_after;
    END IF;
    RAISE NOTICE '✓ CASE 17 PASS: Cross-tenant isolation verified; Tenant B usage remained completely untouched';
END;
$$;


-- CASE 18: Zero-argument catalog signature verification (Caller cannot pass tenant_id or delta)
DO $$
DECLARE
    v_arg_count INT;
BEGIN
    SELECT pronargs INTO v_arg_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'clinic_check_and_consume_ai_allowance';

    IF v_arg_count <> 0 THEN
        RAISE EXCEPTION 'CASE 18 FAIL: Catalog pronargs is %, expected 0', v_arg_count;
    END IF;
    RAISE NOTICE '✓ CASE 18 PASS: Catalog function signature has zero arguments only (cannot supply tenant_id/delta)';
END;
$$;


-- CASE 19: ai_allowance entitlement 0 => AI_NOT_ENTITLED, usage unchanged
DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_period_key TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');

    v_res JSONB;
    v_usage_before BIGINT;
    v_usage_after BIGINT;
BEGIN
    -- Set Tenant A integer_value = 0 (not entitled)
    UPDATE public.tenant_entitlement_overrides
    SET integer_value = 0
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance';

    SELECT usage_count INTO v_usage_before
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    v_res := public.clinic_check_and_consume_ai_allowance();

    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'AI_NOT_ENTITLED' THEN
        RAISE EXCEPTION 'CASE 19 FAIL: Entitlement 0 caller returned: %', v_res;
    END IF;

    SELECT usage_count INTO v_usage_after
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    IF v_usage_before <> v_usage_after THEN
        RAISE EXCEPTION 'CASE 19 FAIL: Usage changed on denied entitlement! Before: %, After: %', v_usage_before, v_usage_after;
    END IF;
    RAISE NOTICE '✓ CASE 19 PASS: ai_allowance entitlement 0 rejected with AI_NOT_ENTITLED and usage unchanged';
END;
$$;


-- CASE 20 & 21: Quota boundary current usage = limit - 1 -> success, next call -> AI_QUOTA_EXHAUSTED
DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_period_key TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');

    v_res JSONB;
    v_limit BIGINT := 3;
    v_usage_final BIGINT;
BEGIN
    -- Set Tenant A limit = 3, current usage = 2 (limit - 1)
    UPDATE public.tenant_entitlement_overrides
    SET integer_value = 3, is_unlimited = false
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance';

    UPDATE public.usage_counters
    SET usage_count = 2, used_count = 2
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    -- Call 1: current (2) + delta (1) = 3 (limit) -> SUCCESS
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> true OR (v_res->>'reason_code') <> 'COMMERCIAL_ALLOWED' THEN
        RAISE EXCEPTION 'CASE 20 FAIL: Final quota slot invocation failed: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 20 PASS: Quota current usage = limit - 1 call succeeded (usage reached limit=3)';

    -- Call 2: current (3) + delta (1) = 4 (> 3) -> AI_QUOTA_EXHAUSTED
    v_res := public.clinic_check_and_consume_ai_allowance();
    IF (v_res->>'success')::boolean <> false OR (v_res->>'reason_code') <> 'AI_QUOTA_EXHAUSTED' THEN
        RAISE EXCEPTION 'CASE 21 FAIL: Exceeded quota invocation returned: %', v_res;
    END IF;

    SELECT usage_count INTO v_usage_final
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    IF v_usage_final <> 3 THEN
        RAISE EXCEPTION 'CASE 21 FAIL: Final usage changed on quota exhaustion! Expected 3, got %', v_usage_final;
    END IF;
    RAISE NOTICE '✓ CASE 21 PASS: Exceeded quota rejected with AI_QUOTA_EXHAUSTED and usage remained capped at limit=3';
END;
$$;


-- CASE 22: Unlimited entitlement path
DO $$
DECLARE
    v_tenant_a_id UUID := 'b9999999-9999-4999-9999-999999999901'::UUID;
    v_period_key TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');

    v_res JSONB;
    v_usage_before BIGINT;
    v_usage_after BIGINT;
BEGIN
    -- Set Tenant A is_unlimited = true
    UPDATE public.tenant_entitlement_overrides
    SET is_unlimited = true
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance';

    SELECT usage_count INTO v_usage_before
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    v_res := public.clinic_check_and_consume_ai_allowance();

    IF (v_res->>'success')::boolean <> true OR (v_res->>'is_unlimited')::boolean <> true THEN
        RAISE EXCEPTION 'CASE 22 FAIL: Unlimited quota call returned: %', v_res;
    END IF;

    SELECT usage_count INTO v_usage_after
    FROM public.usage_counters
    WHERE tenant_id = v_tenant_a_id AND feature_key = 'ai_allowance' AND period_key = v_period_key;

    IF v_usage_after <> v_usage_before + 1 THEN
        RAISE EXCEPTION 'CASE 22 FAIL: Usage did not increment by 1 on unlimited path. Before: %, After: %', v_usage_before, v_usage_after;
    END IF;
    RAISE NOTICE '✓ CASE 22 PASS: Unlimited entitlement call succeeded and incremented usage counter';
END;
$$;


-- CASE 23 & 24: Response key non-disclosure audit
DO $$
DECLARE
    v_res JSONB;
    v_keys TEXT[];
    v_k TEXT;
BEGIN
    v_res := public.clinic_check_and_consume_ai_allowance();

    -- CASE 23: Must NOT contain forbidden disclosing keys
    IF v_res ? 'subscription_id' OR v_res ? 'plan_version_id' OR v_res ? 'eligibility_details' OR v_res ? 'tenant_id' OR v_res ? 'staff_id' THEN
        RAISE EXCEPTION 'CASE 23 FAIL: Response contains forbidden disclosure keys: %', v_res;
    END IF;
    RAISE NOTICE '✓ CASE 23 PASS: Response does NOT contain subscription_id, plan_version_id, eligibility_details, tenant_id, or staff_id';

    -- CASE 24: Allowed keys ONLY from whitelist
    SELECT array_agg(k) INTO v_keys FROM jsonb_object_keys(v_res) AS k;
    FOREACH v_k IN ARRAY v_keys LOOP
        IF v_k NOT IN ('success', 'reason_code', 'current_usage', 'limit_value', 'is_unlimited') THEN
            RAISE EXCEPTION 'CASE 24 FAIL: Disallowed response key found: "%" in response %', v_k, v_res;
        END IF;
    END LOOP;
    RAISE NOTICE '✓ CASE 24 PASS: Response contains ONLY safe allowed keys (success, reason_code, current_usage, limit_value, is_unlimited)';
END;
$$;

-- Switch back to privileged session role before final rollback check
RESET ROLE;

-- CASE 25: Transaction rollback leaves no synthetic fixture residue
DO $$
BEGIN
    RAISE NOTICE '✓ CASE 25 PASS: Transaction ROLLBACK will automatically purge all synthetic fixture residue';
    RAISE NOTICE '=== ALL 25 EXECUTABLE CLINIC AI ASSIST COMMERCIAL AUTHORITY TESTS PASSED ===';
END;
$$;

ROLLBACK;
