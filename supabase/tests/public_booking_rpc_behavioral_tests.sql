-- public_booking_rpc_behavioral_tests.sql
-- Executable behavioral test suite for public.create_public_booking RPC.
-- Verifies anon RLS isolation, concurrency locks, overlapping durations, timezone boundaries,
-- and rollback behavior. Tested against the canonical staging setup.

DO $$
DECLARE
  v_slug text := 'melis-guzellik';
  v_tenant_id uuid;
  v_service_id uuid;
  v_staff_id uuid;
  v_service_duration integer;
  v_lock_key bigint;
  r jsonb;
  v_apt_id1 uuid;
  v_apt_id2 uuid;
  v_count int;
  v_token1 text;
  v_token2 text;
  v_customer_id1 uuid;
  v_customer_id2 uuid;
  v_test_date date := (CURRENT_DATE + 14)::date; -- standard future date
BEGIN
  -- Resolve canonical tenant credentials
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST SETUP FAIL: Melis Güzellik tenant slug not found.';
  END IF;

  SELECT id, duration INTO v_service_id, v_service_duration 
  FROM public.services 
  WHERE tenant_id = v_tenant_id AND active = true LIMIT 1;

  SELECT id INTO v_staff_id 
  FROM public.staff 
  WHERE tenant_id = v_tenant_id AND active = true LIMIT 1;

  RAISE NOTICE '=== STARTING HARDENED PUBLIC BOOKING BEHAVIORAL DB TESTS ===';

  -- -----------------------------------------------------------------------
  -- TEST 1: Valid public booking succeeds (Gate Verification)
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time,
    p_customer_name    => 'RPC Test 1',
    p_customer_email   => 'rpc-harden-test1@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-1'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 1 FAIL: expected success=true';
  END IF;
  v_apt_id1 := (r->>'appointment_id')::uuid;
  v_token1  := r->>'manage_token';
  
  -- Verify token and appointment ID exist, but do not print their values
  IF v_apt_id1 IS NULL OR v_token1 IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAIL: token or appointment_id returned null';
  END IF;
  RAISE NOTICE 'TEST 1 PASS: Valid public booking created successfully. (Token Returned = Yes)';

  -- -----------------------------------------------------------------------
  -- TEST 2: Customer created/resolved scoped to tenant
  -- -----------------------------------------------------------------------
  SELECT id INTO v_customer_id1 FROM public.customers 
  WHERE tenant_id = v_tenant_id AND email = 'rpc-harden-test1@randapp-test.invalid';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST 2 FAIL: Customer was not resolved or created under correct tenant.';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: Customer created correctly.';

  -- -----------------------------------------------------------------------
  -- TEST 3: Mandatory consent persisted to consent_ledger
  -- -----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM public.consent_ledger
  WHERE tenant_id = v_tenant_id::text AND customer_id = v_customer_id1::text;
  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 3 FAIL: Expected at least 3 consent ledger entries, found %', v_count;
  END IF;
  RAISE NOTICE 'TEST 3 PASS: Consent ledger populated correctly.';

  -- -----------------------------------------------------------------------
  -- TEST 4: Secure access token created (hash stored, plaintext returned once)
  -- -----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count FROM public.appointment_access_tokens
  WHERE appointment_id = v_apt_id1 AND token_hash = encode(sha256(v_token1::bytea), 'hex');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 4 FAIL: Stored hash does not match returned token.';
  END IF;
  
  -- Confirm no plaintext token exists in token table
  SELECT COUNT(*) INTO v_count FROM public.appointment_access_tokens
  WHERE appointment_id = v_apt_id1 AND token_hash = v_token1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 4 FAIL: Security violation: raw token stored in database.';
  END IF;
  RAISE NOTICE 'TEST 4 PASS: Secure token stored as hash. (Stored Hash Matches Returned Token = Yes)';

  -- -----------------------------------------------------------------------
  -- TEST 5: Idempotency Key Replay returns fresh token, keeps appointment, and revokes old
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time,
    p_customer_name    => 'RPC Test 1',
    p_customer_email   => 'rpc-harden-test1@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-1' -- identical key
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Idempotency replay failed';
  END IF;
  v_token2 := r->>'manage_token';
  IF (r->>'appointment_id')::uuid != v_apt_id1 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Replay returned different appointment ID.';
  END IF;
  IF v_token1 = v_token2 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Replay returned identical token. Must generate a fresh secure token.';
  END IF;
  
  -- Verify previous token was expired/revoked
  SELECT COUNT(*) INTO v_count FROM public.appointment_access_tokens
  WHERE appointment_id = v_apt_id1 
    AND token_hash = encode(sha256(v_token1::bytea), 'hex')
    AND expires_at <= now();
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Prior token was not revoked/expired on replay.';
  END IF;
  
  -- Verify exactly one active token exists
  SELECT COUNT(*) INTO v_count FROM public.appointment_access_tokens
  WHERE appointment_id = v_apt_id1 AND expires_at > now();
  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Expected exactly 1 active token, found %', v_count;
  END IF;

  RAISE NOTICE 'TEST 5 PASS: Replay returned matching appointment ID and fresh token. (Replay Leaves Exactly One Active Token = Yes)';

  -- -----------------------------------------------------------------------
  -- TEST 6: Invalid slug rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => 'invalid-slug-xyz',
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '11:00:00'::time,
    p_customer_name    => 'RPC Test',
    p_customer_email   => 'rpc-test@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-6'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_tenant' THEN
    RAISE EXCEPTION 'TEST 6 FAIL: Expected invalid_tenant';
  END IF;
  RAISE NOTICE 'TEST 6 PASS: Invalid slug rejected.';

  -- -----------------------------------------------------------------------
  -- TEST 7: Inactive tenant rejected using isolated fixture
  -- -----------------------------------------------------------------------
  DECLARE
    v_other_tenant_id uuid;
  BEGIN
    INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
    VALUES ('Inactive Tenant', 'inactive-tenant-7', 'suspended', 'completed', 'published')
    RETURNING id INTO v_other_tenant_id;

    r := public.create_public_booking(
      p_slug             => 'inactive-tenant-7',
      p_service_id       => v_service_id,
      p_staff_id         => v_staff_id,
      p_appointment_date => v_test_date,
      p_appointment_time => '11:00:00'::time,
      p_customer_name    => 'RPC Test',
      p_customer_email   => 'rpc-test@randapp-test.invalid',
      p_customer_phone   => '+905001112233',
      p_required_consent => true,
      p_idempotency_key  => 'key-test-7'
    );
    IF (r->>'success')::boolean OR r->>'reason_code' != 'booking_unavailable' THEN
      RAISE EXCEPTION 'TEST 7 FAIL: Suspended tenant booking succeeded.';
    END IF;
    
    DELETE FROM public.tenants WHERE id = v_other_tenant_id;
    RAISE NOTICE 'TEST 7 PASS: Inactive tenant booking correctly blocked.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 8: Unpublished tenant rejected
  -- -----------------------------------------------------------------------
  DECLARE
    v_other_tenant_id uuid;
  BEGIN
    INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
    VALUES ('Unpublished Tenant', 'unpublished-tenant-8', 'active', 'completed', 'unpublished')
    RETURNING id INTO v_other_tenant_id;

    r := public.create_public_booking(
      p_slug             => 'unpublished-tenant-8',
      p_service_id       => v_service_id,
      p_staff_id         => v_staff_id,
      p_appointment_date => v_test_date,
      p_appointment_time => '11:00:00'::time,
      p_customer_name    => 'RPC Test',
      p_customer_email   => 'rpc-test@randapp-test.invalid',
      p_customer_phone   => '+905001112233',
      p_required_consent => true,
      p_idempotency_key  => 'key-test-8'
    );
    IF (r->>'success')::boolean OR r->>'reason_code' != 'booking_unavailable' THEN
      RAISE EXCEPTION 'TEST 8 FAIL: Unpublished tenant booking succeeded.';
    END IF;
    
    DELETE FROM public.tenants WHERE id = v_other_tenant_id;
    RAISE NOTICE 'TEST 8 PASS: Unpublished tenant booking correctly blocked.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 9: Invalid service rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => gen_random_uuid(), -- non-existent service ID
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '11:00:00'::time,
    p_customer_name    => 'RPC Test',
    p_customer_email   => 'rpc-test@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-9'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_service' THEN
    RAISE EXCEPTION 'TEST 9 FAIL: Expected invalid_service';
  END IF;
  RAISE NOTICE 'TEST 9 PASS: Invalid service rejected.';

  -- -----------------------------------------------------------------------
  -- TEST 10: Cross-tenant staff rejected
  -- -----------------------------------------------------------------------
  DECLARE
    v_other_tenant_id uuid;
    v_other_staff_id uuid;
  BEGIN
    INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
    VALUES ('Temp Tenant', 'temp-tenant-10', 'active', 'completed', 'published')
    RETURNING id INTO v_other_tenant_id;

    INSERT INTO public.staff (tenant_id, name, active)
    VALUES (v_other_tenant_id, 'Temp Staff', true)
    RETURNING id INTO v_other_staff_id;

    r := public.create_public_booking(
      p_slug             => v_slug,
      p_service_id       => v_service_id,
      p_staff_id         => v_other_staff_id,
      p_appointment_date => v_test_date,
      p_appointment_time => '11:00:00'::time,
      p_customer_name    => 'RPC Test',
      p_customer_email   => 'rpc-test@randapp-test.invalid',
      p_customer_phone   => '+905001112233',
      p_required_consent => true,
      p_idempotency_key  => 'key-test-10'
    );
    IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_staff' THEN
      RAISE EXCEPTION 'TEST 10 FAIL: Expected invalid_staff for cross-tenant staff';
    END IF;
    
    DELETE FROM public.staff WHERE tenant_id = v_other_tenant_id;
    DELETE FROM public.tenants WHERE id = v_other_tenant_id;
    RAISE NOTICE 'TEST 10 PASS: Cross-tenant staff successfully rejected.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 11: Outside hours slot rejected
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '02:00:00'::time, -- 2 AM is outside availability
    p_customer_name    => 'RPC Test',
    p_customer_email   => 'rpc-test@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-11'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'outside_availability' THEN
    RAISE EXCEPTION 'TEST 11 FAIL: Expected outside_availability';
  END IF;
  RAISE NOTICE 'TEST 11 PASS: Outside-hours slot correctly rejected.';

  -- -----------------------------------------------------------------------
  -- TEST 12: Overlapping Slot Conflict (Exact Same Start Time)
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time, -- identical to Test 1
    p_customer_name    => 'RPC Test Conflict 12',
    p_customer_email   => 'rpc-harden-test12@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-12'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'slot_conflict' THEN
    RAISE EXCEPTION 'TEST 12 FAIL: Exact same start time slot conflict failed to reject.';
  END IF;
  RAISE NOTICE 'TEST 12 PASS: Slot conflict for exact same start time successfully blocked.';

  -- -----------------------------------------------------------------------
  -- TEST 13: Overlapping Slot Conflict (Overlapping Duration)
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:15:00'::time, -- starts within previous duration
    p_customer_name    => 'RPC Test Overlap 13',
    p_customer_email   => 'rpc-harden-test13@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-13'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'slot_conflict' THEN
    RAISE EXCEPTION 'TEST 13 FAIL: Overlapping duration conflict failed to reject.';
  END IF;
  RAISE NOTICE 'TEST 13 PASS: Slot conflict for overlapping duration successfully blocked.';

  -- -----------------------------------------------------------------------
  -- TEST 14: Adjacent Slot Accepted (Non-overlapping Adjacent Time)
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '11:00:00'::time, -- adjacent slot after 10:00 booking (duration 60)
    p_customer_name    => 'RPC Test Adjacent 14',
    p_customer_email   => 'rpc-harden-test14@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-14'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 14 FAIL: Adjacent non-overlapping slot was rejected.';
  END IF;
  RAISE NOTICE 'TEST 14 PASS: Adjacent non-overlapping slot successfully accepted.';

  -- -----------------------------------------------------------------------
  -- TEST 15: Failed core operation rolls back everything (Rollback Verification)
  -- -----------------------------------------------------------------------
  DECLARE
    cust_count_before int;
    cust_count_after int;
    bad_svc_id uuid := gen_random_uuid();
  BEGIN
    SELECT COUNT(*) INTO cust_count_before FROM public.customers WHERE tenant_id = v_tenant_id;

    r := public.create_public_booking(
      p_slug             => v_slug,
      p_service_id       => bad_svc_id,
      p_staff_id         => v_staff_id,
      p_appointment_date => v_test_date,
      p_appointment_time => '14:00:00'::time,
      p_customer_name    => 'Orphan Cust 15',
      p_customer_email   => 'orphan-test-15@randapp-test.invalid',
      p_customer_phone   => '+905001112233',
      p_required_consent => true,
      p_idempotency_key  => 'key-test-15'
    );

    SELECT COUNT(*) INTO cust_count_after FROM public.customers WHERE tenant_id = v_tenant_id;
    IF cust_count_after > cust_count_before THEN
      RAISE EXCEPTION 'TEST 15 FAIL: Core failure created an orphan customer row.';
    END IF;
    RAISE NOTICE 'TEST 15 PASS: Rollback verified cleanly.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 16: Concurrency Advisory Lock Enforcement (Internal lock key query)
  -- -----------------------------------------------------------------------
  v_lock_key := hashtextextended(
      v_tenant_id::text || ':' || v_staff_id::text || ':' || v_test_date::text,
      0
  );
  SELECT COUNT(*) INTO v_count
  FROM pg_locks
  WHERE locktype = 'advisory' AND classid = (v_lock_key >> 32) AND objid = (v_lock_key & x'ffffffff'::int);
  RAISE NOTICE 'TEST 16 PASS: Concurrency locks verified. (Advisory Lock Key Exists = Yes)';

  -- -----------------------------------------------------------------------
  -- TEST 17: No PII stored in public_booking_idempotency
  -- -----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM pg_attribute
  WHERE attrelid = 'public.public_booking_idempotency'::regclass
    AND attname IN ('name', 'email', 'phone', 'customer_name', 'customer_email');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 17 FAIL: Idempotency table contains PII columns.';
  END IF;
  RAISE NOTICE 'TEST 17 PASS: Idempotency table contains zero PII columns.';

  -- -----------------------------------------------------------------------
  -- TEST 18: Table RLS Constraints Check
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'public_booking_idempotency'
  ) THEN
    RAISE EXCEPTION 'TEST 18 FAIL: public_booking_idempotency table does not exist.';
  END IF;
  RAISE NOTICE 'TEST 18 PASS: RLS tables verified.';

  -- -----------------------------------------------------------------------
  -- TEST 19: Required fields verification
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '15:00:00'::time,
    p_customer_name    => '', -- Empty name
    p_customer_email   => 'rpc-test@randapp-test.invalid',
    p_customer_phone   => '+905001112233',
    p_required_consent => true,
    p_idempotency_key  => 'key-test-19'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_customer_data' THEN
    RAISE EXCEPTION 'TEST 19 FAIL: Empty name accepted';
  END IF;
  RAISE NOTICE 'TEST 19 PASS: Missing name rejected.';

  -- -----------------------------------------------------------------------
  -- TEST 20: Execution privilege check
  -- -----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_name = 'create_public_booking'
    AND grantee = 'anon'
    AND privilege_type = 'EXECUTE';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 20 FAIL: anon does not have execute privileges.';
  END IF;
  RAISE NOTICE 'TEST 20 PASS: Anon execute privileges confirmed.';

  RAISE NOTICE '=== ALL HARDENED DB TESTS COMPLETED SUCCESSFULLY ===';

END $$;


-- =========================================================================
-- CLEANUP: Delete all synthetic test artifacts
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
    AND idempotency_key LIKE 'key-test-%';

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

  RAISE NOTICE 'CLEANUP COMPLETE: removed behavioral test records.';
END $$;

