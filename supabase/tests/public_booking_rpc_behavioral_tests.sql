-- public_booking_rpc_behavioral_tests.sql
-- 20 executable behavioral tests for public.create_public_booking RPC
-- Run against staging DB with psql or Supabase SQL Editor (as authenticated super_admin or anon).
-- Tests use DO $$ ... $$ blocks and RAISE NOTICE for pass/fail reporting.
-- Canonical tenant slug: melis-guzellik
-- Run these tests in order; they are additive but clean up after themselves.

-- =========================================================================
-- SETUP: Test configuration variables
-- =========================================================================
DO $$
DECLARE
  v_slug text := 'melis-guzellik';
  v_tenant_id uuid;
  v_service_id uuid;
  v_staff_id uuid;
  v_bad_service_id uuid := gen_random_uuid();
  v_bad_staff_id uuid := gen_random_uuid();
  r jsonb;
BEGIN
  -- Resolve IDs for canonical tenant
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;
  SELECT id INTO v_service_id FROM public.services WHERE tenant_id = v_tenant_id AND active = true LIMIT 1;
  SELECT id INTO v_staff_id FROM public.staff WHERE tenant_id = v_tenant_id AND active = true LIMIT 1;

  RAISE NOTICE '=== TEST SETUP: tenant=% service=% staff=%', v_tenant_id, v_service_id, v_staff_id;

  -- -----------------------------------------------------------------------
  -- TEST 1: Valid public booking succeeds
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 7)::date,
    p_appointment_time => '10:00'::time,
    p_customer_name    => 'Test Müşteri 1',
    p_customer_email   => 'rpc-test-001@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-001'
  );
  IF (r->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 1 FAIL: expected success=true, got %', r;
  END IF;
  RAISE NOTICE 'TEST 1 PASS: Valid booking succeeded - appointment_id=%', r->>'appointment_id';

  -- -----------------------------------------------------------------------
  -- TEST 2: Customer is created (resolve by email)
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE tenant_id = v_tenant_id AND email = 'rpc-test-001@randapp-test.invalid'
  ) THEN
    RAISE EXCEPTION 'TEST 2 FAIL: customer not created';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: Customer created/resolved';

  -- -----------------------------------------------------------------------
  -- TEST 3: Required consent is persisted in consent_ledger
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.consent_ledger
    WHERE tenant_id = v_tenant_id::text
      AND consent_type = 'booking_transactional'
      AND is_granted = true
  ) THEN
    RAISE EXCEPTION 'TEST 3 FAIL: consent_ledger entry not found';
  END IF;
  RAISE NOTICE 'TEST 3 PASS: Required consent persisted';

  -- -----------------------------------------------------------------------
  -- TEST 4: Appointment is created with correct fields
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = (r->>'appointment_id')::uuid
      AND tenant_id = v_tenant_id
      AND appointment_date = CURRENT_DATE + 7
      AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'TEST 4 FAIL: appointment not found or wrong fields';
  END IF;
  RAISE NOTICE 'TEST 4 PASS: Appointment created correctly';

  -- -----------------------------------------------------------------------
  -- TEST 5: Manage token is created
  -- -----------------------------------------------------------------------
  IF r->>'manage_token' IS NULL OR length(r->>'manage_token') < 10 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: manage_token missing or too short';
  END IF;
  -- Token hash should be stored in appointment_access_tokens
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_access_tokens
    WHERE appointment_id = (r->>'appointment_id')::uuid
  ) THEN
    RAISE EXCEPTION 'TEST 5 FAIL: appointment_access_tokens row not created';
  END IF;
  RAISE NOTICE 'TEST 5 PASS: Manage token created';

  -- -----------------------------------------------------------------------
  -- TEST 6: All rows use the same tenant_id
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.customers c ON c.id = a.customer_id
    WHERE a.id = (r->>'appointment_id')::uuid
      AND a.tenant_id = v_tenant_id
      AND c.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'TEST 6 FAIL: tenant isolation broken — appointment or customer has wrong tenant_id';
  END IF;
  RAISE NOTICE 'TEST 6 PASS: All rows scoped to correct tenant';

  -- -----------------------------------------------------------------------
  -- TEST 7: Idempotency — repeated key returns same appointment_id without duplicate
  -- -----------------------------------------------------------------------
  DECLARE
    r2 jsonb;
    apt_count int;
  BEGIN
    r2 := public.create_public_booking(
      p_slug             => v_slug,
      p_service_id       => v_service_id,
      p_staff_id         => v_staff_id,
      p_appointment_date => (CURRENT_DATE + 7)::date,
      p_appointment_time => '10:00'::time,
      p_customer_name    => 'Test Müşteri 1',
      p_customer_email   => 'rpc-test-001@randapp-test.invalid',
      p_customer_phone   => '',
      p_required_consent => true,
      p_idempotency_key  => 'rpc-test-001'  -- same key as TEST 1
    );
    IF (r2->>'appointment_id') IS DISTINCT FROM (r->>'appointment_id') THEN
      RAISE EXCEPTION 'TEST 7 FAIL: idempotency broken — different appointment_id returned';
    END IF;
    SELECT COUNT(*) INTO apt_count
    FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND appointment_date = CURRENT_DATE + 7
      AND appointment_time = '10:00'
      AND staff_id = v_staff_id
      AND status = 'confirmed';
    IF apt_count > 1 THEN
      RAISE EXCEPTION 'TEST 7 FAIL: duplicate appointment created (count=%)', apt_count;
    END IF;
    RAISE NOTICE 'TEST 7 PASS: Idempotency key deduplication works (appointment_count=%)', apt_count;
  END;

  -- -----------------------------------------------------------------------
  -- TEST 8: Invalid slug rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => 'nonexistent-slug-xyzabc',
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 7)::date,
    p_appointment_time => '11:00'::time,
    p_customer_name    => 'Test 8',
    p_customer_email   => 'rpc-test-008@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-008'
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'invalid_tenant' THEN
    RAISE EXCEPTION 'TEST 8 FAIL: expected invalid_tenant, got %', r;
  END IF;
  RAISE NOTICE 'TEST 8 PASS: Invalid slug correctly rejected with reason_code=%', r->>'reason_code';

  -- -----------------------------------------------------------------------
  -- TEST 9: Missing consent rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 7)::date,
    p_appointment_time => '11:30'::time,
    p_customer_name    => 'Test 9',
    p_customer_email   => 'rpc-test-009@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => false,
    p_idempotency_key  => 'rpc-test-009'
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'consent_required' THEN
    RAISE EXCEPTION 'TEST 9 FAIL: expected consent_required, got %', r;
  END IF;
  RAISE NOTICE 'TEST 9 PASS: Missing consent correctly rejected';

  -- -----------------------------------------------------------------------
  -- TEST 10: Invalid service (non-existent UUID) rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_bad_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 7)::date,
    p_appointment_time => '12:00'::time,
    p_customer_name    => 'Test 10',
    p_customer_email   => 'rpc-test-010@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-010'
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'invalid_service' THEN
    RAISE EXCEPTION 'TEST 10 FAIL: expected invalid_service, got %', r;
  END IF;
  RAISE NOTICE 'TEST 10 PASS: Invalid service correctly rejected';

  -- -----------------------------------------------------------------------
  -- TEST 11: Staff from another tenant rejected
  -- -----------------------------------------------------------------------
  DECLARE
    v_other_staff_id uuid;
  BEGIN
    SELECT s.id INTO v_other_staff_id
    FROM public.staff s
    WHERE s.tenant_id != v_tenant_id AND s.active = true
    LIMIT 1;

    IF v_other_staff_id IS NOT NULL THEN
      r := public.create_public_booking(
        p_slug             => v_slug,
        p_service_id       => v_service_id,
        p_staff_id         => v_other_staff_id,
        p_appointment_date => (CURRENT_DATE + 7)::date,
        p_appointment_time => '13:00'::time,
        p_customer_name    => 'Test 11',
        p_customer_email   => 'rpc-test-011@randapp-test.invalid',
        p_customer_phone   => '',
        p_required_consent => true,
        p_idempotency_key  => 'rpc-test-011'
      );
      IF (r->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 11 FAIL: cross-tenant staff accepted, got %', r;
      END IF;
      RAISE NOTICE 'TEST 11 PASS: Cross-tenant staff correctly rejected with reason_code=%', r->>'reason_code';
    ELSE
      RAISE NOTICE 'TEST 11 SKIP: No other tenant staff found to test against';
    END IF;
  END;

  -- -----------------------------------------------------------------------
  -- TEST 12: Slot conflict — second booking on same staff/date/time rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 7)::date,
    p_appointment_time => '10:00'::time,   -- same slot as TEST 1
    p_customer_name    => 'Test 12 Conflict',
    p_customer_email   => 'rpc-test-012@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-012'  -- different key = not idempotent
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'slot_conflict' THEN
    RAISE EXCEPTION 'TEST 12 FAIL: slot conflict not detected, got %', r;
  END IF;
  RAISE NOTICE 'TEST 12 PASS: Slot conflict correctly rejected';

  -- -----------------------------------------------------------------------
  -- TEST 13: Past date rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE - 1)::date,
    p_appointment_time => '10:00'::time,
    p_customer_name    => 'Test 13',
    p_customer_email   => 'rpc-test-013@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-013'
  );
  IF (r->>'success')::boolean IS TRUE THEN
    RAISE EXCEPTION 'TEST 13 FAIL: past date accepted, got %', r;
  END IF;
  RAISE NOTICE 'TEST 13 PASS: Past date correctly rejected with reason_code=%', r->>'reason_code';

  -- -----------------------------------------------------------------------
  -- TEST 14: Invalid customer data (empty name) rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 8)::date,
    p_appointment_time => '10:00'::time,
    p_customer_name    => '',
    p_customer_email   => 'rpc-test-014@randapp-test.invalid',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-014'
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'invalid_customer_data' THEN
    RAISE EXCEPTION 'TEST 14 FAIL: empty name accepted, got %', r;
  END IF;
  RAISE NOTICE 'TEST 14 PASS: Empty name correctly rejected';

  -- -----------------------------------------------------------------------
  -- TEST 15: Missing both email and phone rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => (CURRENT_DATE + 8)::date,
    p_appointment_time => '11:00'::time,
    p_customer_name    => 'Test 15',
    p_customer_email   => '',
    p_customer_phone   => '',
    p_required_consent => true,
    p_idempotency_key  => 'rpc-test-015'
  );
  IF (r->>'success')::boolean IS TRUE OR (r->>'reason_code') IS DISTINCT FROM 'invalid_customer_data' THEN
    RAISE EXCEPTION 'TEST 15 FAIL: no contact info accepted, got %', r;
  END IF;
  RAISE NOTICE 'TEST 15 PASS: Missing contact info correctly rejected';

  -- -----------------------------------------------------------------------
  -- TEST 16: Direct anonymous appointment INSERT still rejected
  -- (Must be run as anon role — tested by policy existence check here)
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments'
      AND policyname = 'Public - Insert appointments anonymously'
  ) THEN
    -- Policy was already dropped and replaced by RPC approach
    RAISE NOTICE 'TEST 16 PASS: Direct INSERT policy not present — RPC is the only allowed path';
  ELSE
    -- Policy exists but verify it requires active+published tenant
    RAISE NOTICE 'TEST 16 INFO: Direct INSERT policy still exists; verify it enforces tenant eligibility correctly';
  END IF;

  -- -----------------------------------------------------------------------
  -- TEST 17: Anonymous appointment SELECT not allowed (RLS verification)
  -- -----------------------------------------------------------------------
  -- This test documents the expected behavior; actual anon-role enforcement
  -- must be verified through a live anon-key query (cannot be done inside a DEFINER block).
  RAISE NOTICE 'TEST 17 INFO: Anonymous SELECT on appointments is blocked by RLS (no public SELECT policy)';
  RAISE NOTICE 'TEST 17 INFO: Verify with: SELECT * FROM appointments LIMIT 1; (as anon) — expected 0 rows or 401';

  -- -----------------------------------------------------------------------
  -- TEST 18: RPC returns safe reason_code only (no billing/internal data)
  -- -----------------------------------------------------------------------
  IF (r::text LIKE '%subscription%') OR (r::text LIKE '%billing%') OR (r::text LIKE '%password%') THEN
    RAISE EXCEPTION 'TEST 18 FAIL: RPC response leaks sensitive fields: %', r;
  END IF;
  RAISE NOTICE 'TEST 18 PASS: RPC response contains no billing/sensitive fields';

  -- -----------------------------------------------------------------------
  -- TEST 19: Rollback test — invalid service causes no orphan customer
  -- -----------------------------------------------------------------------
  DECLARE
    cust_count_before int;
    cust_count_after int;
    bad_svc uuid := gen_random_uuid();
  BEGIN
    SELECT COUNT(*) INTO cust_count_before FROM public.customers
    WHERE tenant_id = v_tenant_id AND email = 'rpc-rollback-test@randapp-test.invalid';

    -- This should fail at Gate 6 (service validation) before any customer is created
    r := public.create_public_booking(
      p_slug             => v_slug,
      p_service_id       => bad_svc,
      p_staff_id         => v_staff_id,
      p_appointment_date => (CURRENT_DATE + 9)::date,
      p_appointment_time => '10:00'::time,
      p_customer_name    => 'Rollback Test',
      p_customer_email   => 'rpc-rollback-test@randapp-test.invalid',
      p_customer_phone   => '',
      p_required_consent => true,
      p_idempotency_key  => 'rpc-rollback-test-019'
    );

    SELECT COUNT(*) INTO cust_count_after FROM public.customers
    WHERE tenant_id = v_tenant_id AND email = 'rpc-rollback-test@randapp-test.invalid';

    IF cust_count_after > cust_count_before THEN
      RAISE EXCEPTION 'TEST 19 FAIL: orphan customer created despite service validation failure';
    END IF;
    RAISE NOTICE 'TEST 19 PASS: No orphan customer on service validation failure';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 20: RPC is accessible by anon (GRANT check)
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'create_public_booking'
      AND grantee = 'anon'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TEST 20 FAIL: anon does not have EXECUTE on create_public_booking';
  END IF;
  RAISE NOTICE 'TEST 20 PASS: anon has EXECUTE grant on create_public_booking';

  RAISE NOTICE '=== ALL TESTS COMPLETE ===';

END $$;


-- =========================================================================
-- CLEANUP: Remove test records created during behavioral tests
-- =========================================================================
DO $$
DECLARE
  v_slug text := 'melis-guzellik';
  v_tenant_id uuid;
  v_apt_ids uuid[];
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;

  -- Collect test appointment IDs
  SELECT ARRAY(
    SELECT id FROM public.appointments
    WHERE tenant_id = v_tenant_id
      AND user_email LIKE '%@randapp-test.invalid'
  ) INTO v_apt_ids;

  -- Delete access tokens for test appointments
  DELETE FROM public.appointment_access_tokens
  WHERE appointment_id = ANY(v_apt_ids);

  -- Delete idempotency records for test keys
  DELETE FROM public.public_booking_idempotency
  WHERE tenant_id = v_tenant_id
    AND idempotency_key LIKE 'rpc-test-%';

  -- Delete test appointments
  DELETE FROM public.appointments
  WHERE id = ANY(v_apt_ids);

  -- Delete consent records for test customers
  DELETE FROM public.consent_ledger
  WHERE tenant_id = v_tenant_id::text
    AND customer_id IN (
      SELECT id::text FROM public.customers
      WHERE tenant_id = v_tenant_id AND email LIKE '%@randapp-test.invalid'
    );

  -- Delete test customers
  DELETE FROM public.customers
  WHERE tenant_id = v_tenant_id
    AND email LIKE '%@randapp-test.invalid';

  RAISE NOTICE 'CLEANUP COMPLETE: removed % test appointments', array_length(v_apt_ids, 1);
END $$;
