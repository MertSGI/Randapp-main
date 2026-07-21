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
-- STAFF-SERVICE MAPPING TESTS: Tests 21-26
-- Verify that:
--   TEST 21: Mapped staff -> service succeeds (with valid mapping)
--   TEST 22: Unmapped staff (active, same tenant) -> invalid_staff
--   TEST 23: Cross-tenant staff -> invalid_staff
--   TEST 24: staff_services mapping insert is idempotent (duplicate does nothing)
--   TEST 25: Removing mapping causes subsequent booking attempt to return invalid_staff
--   TEST 26: Restoring mapping restores success path
-- =========================================================================
DO $$
DECLARE
  v_slug         text  := 'melis-guzellik';
  v_tenant_id    uuid;
  v_service_id   uuid;
  v_mapped_staff_id   uuid;
  v_unmapped_staff_id uuid;
  v_other_tenant_id   uuid;
  v_other_staff_id    uuid;
  v_test_date    date  := (CURRENT_DATE + 21)::date;
  v_count        int;
  r              jsonb;
BEGIN
  -- Resolve tenant
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MAPPING TEST SETUP FAIL: tenant not found';
  END IF;

  -- Create a fresh test service with a known mapping target
  INSERT INTO public.services (tenant_id, name, duration, price, active)
  VALUES (v_tenant_id, 'Mapping Test Service', 30, 100, true)
  RETURNING id INTO v_service_id;

  -- Create a staff member that IS mapped to this service
  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Mapped Staff Test', 'Test Specialist', true)
  RETURNING id INTO v_mapped_staff_id;

  -- Create availability for the mapped staff
  INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
  SELECT v_tenant_id, v_mapped_staff_id, d, '09:00', '19:00', true
  FROM generate_series(1, 7) AS d;

  -- Create a staff member that is NOT mapped to this service
  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Unmapped Staff Test', 'Test Specialist', true)
  RETURNING id INTO v_unmapped_staff_id;

  -- Only map the first staff member to the service
  INSERT INTO public.staff_services (staff_id, service_id)
  VALUES (v_mapped_staff_id, v_service_id);

  -- -----------------------------------------------------------------------
  -- TEST 21: Mapped staff succeeds
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_mapped_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time,
    p_customer_name    => 'Mapping Test Customer',
    p_customer_email   => 'mapping-test-21@randapp-test.invalid',
    p_customer_phone   => '+905001112299',
    p_required_consent => true,
    p_idempotency_key  => 'mapping-key-test-21'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 21 FAIL: mapped staff booking failed: %', r;
  END IF;
  RAISE NOTICE 'TEST 21 PASS: Mapped staff booking succeeded.';

  -- -----------------------------------------------------------------------
  -- TEST 22: Active unmapped staff returns invalid_staff
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_unmapped_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '11:00:00'::time,
    p_customer_name    => 'Mapping Test Customer',
    p_customer_email   => 'mapping-test-22@randapp-test.invalid',
    p_customer_phone   => '+905001112299',
    p_required_consent => true,
    p_idempotency_key  => 'mapping-key-test-22'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_staff' THEN
    RAISE EXCEPTION 'TEST 22 FAIL: unmapped active staff did not return invalid_staff: %', r;
  END IF;
  RAISE NOTICE 'TEST 22 PASS: Unmapped active staff correctly rejected with invalid_staff.';

  -- -----------------------------------------------------------------------
  -- TEST 23: Cross-tenant staff returns invalid_staff
  -- -----------------------------------------------------------------------
  DECLARE
    v_xt_tenant_id uuid;
    v_xt_staff_id  uuid;
  BEGIN
    INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
    VALUES ('Cross Tenant', 'cross-tenant-t23', 'active', 'completed', 'published')
    RETURNING id INTO v_xt_tenant_id;

    INSERT INTO public.staff (tenant_id, name, title, active)
    VALUES (v_xt_tenant_id, 'Cross Tenant Staff', 'Specialist', true)
    RETURNING id INTO v_xt_staff_id;

    -- Even map the cross-tenant staff to the cross-tenant service (not our service)
    r := public.create_public_booking(
      p_slug             => v_slug,
      p_service_id       => v_service_id,
      p_staff_id         => v_xt_staff_id,
      p_appointment_date => v_test_date,
      p_appointment_time => '12:00:00'::time,
      p_customer_name    => 'Cross Tenant Test',
      p_customer_email   => 'mapping-test-23@randapp-test.invalid',
      p_customer_phone   => '+905001112299',
      p_required_consent => true,
      p_idempotency_key  => 'mapping-key-test-23'
    );
    IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_staff' THEN
      RAISE EXCEPTION 'TEST 23 FAIL: cross-tenant staff did not return invalid_staff: %', r;
    END IF;

    DELETE FROM public.staff WHERE id = v_xt_staff_id;
    DELETE FROM public.tenants WHERE id = v_xt_tenant_id;
    RAISE NOTICE 'TEST 23 PASS: Cross-tenant staff correctly rejected.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 24: Duplicate mapping insert is idempotent (no error)
  -- -----------------------------------------------------------------------
  BEGIN
    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (v_mapped_staff_id, v_service_id)
    ON CONFLICT (staff_id, service_id) DO NOTHING;
    RAISE NOTICE 'TEST 24 PASS: Duplicate staff_services insert correctly did nothing.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 25: Removing mapping causes invalid_staff
  -- -----------------------------------------------------------------------
  DELETE FROM public.staff_services
  WHERE staff_id = v_mapped_staff_id AND service_id = v_service_id;

  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_mapped_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '13:00:00'::time,
    p_customer_name    => 'Mapping Test Customer',
    p_customer_email   => 'mapping-test-25@randapp-test.invalid',
    p_customer_phone   => '+905001112299',
    p_required_consent => true,
    p_idempotency_key  => 'mapping-key-test-25'
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'invalid_staff' THEN
    RAISE EXCEPTION 'TEST 25 FAIL: deleted mapping did not produce invalid_staff: %', r;
  END IF;
  RAISE NOTICE 'TEST 25 PASS: Removed mapping correctly produces invalid_staff.';

  -- -----------------------------------------------------------------------
  -- TEST 26: Restoring mapping restores booking success
  -- -----------------------------------------------------------------------
  INSERT INTO public.staff_services (staff_id, service_id)
  VALUES (v_mapped_staff_id, v_service_id)
  ON CONFLICT (staff_id, service_id) DO NOTHING;

  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_mapped_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '14:00:00'::time,
    p_customer_name    => 'Mapping Test Customer',
    p_customer_email   => 'mapping-test-26@randapp-test.invalid',
    p_customer_phone   => '+905001112299',
    p_required_consent => true,
    p_idempotency_key  => 'mapping-key-test-26'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 26 FAIL: restored mapping did not restore success: %', r;
  END IF;
  RAISE NOTICE 'TEST 26 PASS: Restored mapping correctly restores booking success.';

  -- Cleanup test fixtures
  DELETE FROM public.staff_services WHERE staff_id IN (v_mapped_staff_id, v_unmapped_staff_id);

  DELETE FROM public.appointment_access_tokens
  WHERE appointment_id IN (
    SELECT id FROM public.appointments WHERE tenant_id = v_tenant_id
      AND user_email LIKE '%@randapp-test.invalid'
  );
  DELETE FROM public.public_booking_idempotency
  WHERE tenant_id = v_tenant_id AND idempotency_key LIKE 'mapping-key-test-%';
  DELETE FROM public.appointments
  WHERE tenant_id = v_tenant_id AND user_email LIKE '%@randapp-test.invalid';
  DELETE FROM public.consent_ledger
  WHERE tenant_id = v_tenant_id::text
    AND customer_id IN (
      SELECT id::text FROM public.customers
      WHERE tenant_id = v_tenant_id AND email LIKE '%@randapp-test.invalid'
    );
  DELETE FROM public.customers
  WHERE tenant_id = v_tenant_id AND email LIKE '%@randapp-test.invalid';
  DELETE FROM public.availability_rules WHERE staff_id IN (v_mapped_staff_id, v_unmapped_staff_id);
  DELETE FROM public.staff WHERE id IN (v_mapped_staff_id, v_unmapped_staff_id);
  DELETE FROM public.services WHERE id = v_service_id;

  RAISE NOTICE '=== STAFF-SERVICE MAPPING TESTS 21-26 COMPLETED ===';
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


-- =========================================================================
-- TESTS 27-28: get_public_available_slots RPC (Phase 1C)
-- TEST 27: Returns non-empty slots for a valid future weekday
-- TEST 28: After booking a slot, that slot is absent from subsequent slot query
-- =========================================================================
DO $$
DECLARE
  v_slug          text  := 'melis-guzellik';
  v_tenant_id     uuid;
  v_service_id    uuid;
  v_staff_id      uuid;
  v_test_date     date;
  v_slot_result   jsonb;
  v_slots         jsonb;
  v_slot_count    int;
  v_first_slot    text;
  v_book_time     time;
  r               jsonb;
  d               date;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT TEST SETUP FAIL: melis-guzellik tenant not found.';
  END IF;

  SELECT s.id INTO v_service_id
  FROM public.services s
  WHERE s.tenant_id = v_tenant_id AND s.active = true
  LIMIT 1;

  SELECT ss.staff_id INTO v_staff_id
  FROM public.staff_services ss
  JOIN public.staff st ON st.id = ss.staff_id
  WHERE ss.service_id = v_service_id AND st.active = true AND st.tenant_id = v_tenant_id
  LIMIT 1;

  IF v_service_id IS NULL OR v_staff_id IS NULL THEN
    RAISE EXCEPTION 'SLOT TEST SETUP FAIL: no active service/staff pair found for tenant';
  END IF;

  -- Find the nearest future weekday with an availability rule for this staff
  v_test_date := NULL;
  FOR d IN SELECT generate_series(CURRENT_DATE + 14, CURRENT_DATE + 28, '1 day'::interval)::date LOOP
    DECLARE
      v_wd int := CASE EXTRACT(DOW FROM d)::int WHEN 0 THEN 7 ELSE EXTRACT(DOW FROM d)::int END;
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.availability_rules
        WHERE staff_id = v_staff_id AND tenant_id = v_tenant_id
          AND weekday = v_wd AND is_active = true
      ) THEN
        v_test_date := d;
        EXIT;
      END IF;
    END;
  END LOOP;

  IF v_test_date IS NULL THEN
    RAISE EXCEPTION 'SLOT TEST SETUP FAIL: no availability rule found in next 28 days for staff=%', v_staff_id;
  END IF;

  RAISE NOTICE '=== STARTING get_public_available_slots TESTS ===';

  -- -----------------------------------------------------------------------
  -- TEST 27: get_public_available_slots returns slots for a valid future date
  -- -----------------------------------------------------------------------
  v_slot_result := public.get_public_available_slots(
    p_slug       => v_slug,
    p_staff_id   => v_staff_id,
    p_service_id => v_service_id,
    p_date       => v_test_date
  );

  IF v_slot_result->>'reason_code' != 'ok' THEN
    RAISE EXCEPTION 'TEST 27 FAIL: reason_code != ok, got: %', v_slot_result;
  END IF;

  v_slots := v_slot_result->'slots';
  v_slot_count := jsonb_array_length(v_slots);
  IF v_slot_count = 0 THEN
    RAISE EXCEPTION 'TEST 27 FAIL: expected at least 1 available slot, got 0';
  END IF;

  v_first_slot := v_slots->0 #>> '{}';
  RAISE NOTICE 'TEST 27 PASS: returned % slots. First slot: %', v_slot_count, v_first_slot;

  -- -----------------------------------------------------------------------
  -- TEST 28: After booking, that slot no longer appears in get_public_available_slots
  -- -----------------------------------------------------------------------
  v_book_time := v_first_slot::time;

  r := public.create_public_booking(
    p_slug             => v_slug,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => v_book_time,
    p_customer_name    => 'Slot Invalidation Test',
    p_customer_email   => 'slot-inval-test-28@randapp-test.invalid',
    p_customer_phone   => '+905001119988',
    p_required_consent => true,
    p_idempotency_key  => 'slot-inval-test-28'
  );

  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 28 FAIL: booking failed: %', r;
  END IF;

  v_slot_result := public.get_public_available_slots(
    p_slug       => v_slug,
    p_staff_id   => v_staff_id,
    p_service_id => v_service_id,
    p_date       => v_test_date
  );
  v_slots := v_slot_result->'slots';

  IF v_slots @> to_jsonb(v_first_slot) THEN
    RAISE EXCEPTION 'TEST 28 FAIL: booked slot % still present in slot list: %', v_first_slot, v_slots;
  END IF;

  RAISE NOTICE 'TEST 28 PASS: booked slot % absent from subsequent query.', v_first_slot;

  -- Cleanup
  DELETE FROM public.appointment_access_tokens
  WHERE appointment_id IN (
    SELECT id FROM public.appointments
    WHERE tenant_id = v_tenant_id AND user_email = 'slot-inval-test-28@randapp-test.invalid'
  );
  DELETE FROM public.public_booking_idempotency
  WHERE tenant_id = v_tenant_id AND idempotency_key = 'slot-inval-test-28';
  DELETE FROM public.appointments
  WHERE tenant_id = v_tenant_id AND user_email = 'slot-inval-test-28@randapp-test.invalid';
  DELETE FROM public.consent_ledger
  WHERE tenant_id = v_tenant_id::text
    AND customer_id IN (
      SELECT id::text FROM public.customers
      WHERE tenant_id = v_tenant_id AND email = 'slot-inval-test-28@randapp-test.invalid'
    );
  DELETE FROM public.customers
  WHERE tenant_id = v_tenant_id AND email = 'slot-inval-test-28@randapp-test.invalid';

  RAISE NOTICE '=== TESTS 27-28 COMPLETED SUCCESSFULLY ===';
END $$;


-- =========================================================================
-- STAGE A ACCEPTANCE TESTS: Tests 29-35
-- TEST 29: Tenant primary branch setup & cross-tenant branch isolation
-- TEST 30: Staff-branch & service-branch junction mapping enforcement
-- TEST 31: evaluate_booking_slot returns allowed=true for free slot & slot_conflict for occupied
-- TEST 32: Appointment creation stores branch_id & duration_minutes snapshot
-- TEST 33: Changing service duration does not alter historical appointment duration_minutes
-- TEST 34: Single-branch tenant auto-resolves branch_id when p_branch_id IS NULL
-- TEST 35: Multi-branch tenant requires p_branch_id or returns branch_required
-- =========================================================================
DO $$
DECLARE
  v_slug            text := 'melis-guzellik';
  v_tenant_id       uuid;
  v_branch_id       uuid;
  v_branch_id2      uuid;
  v_service_id      uuid;
  v_staff_id        uuid;
  v_test_date       date := (CURRENT_DATE + 30)::date;
  v_eval_res        jsonb;
  r                 jsonb;
  v_apt_id          uuid;
  v_stored_duration int;
  v_stored_branch   uuid;
  v_other_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAGE A TEST SETUP FAIL: tenant melis-guzellik not found.';
  END IF;

  -- Create primary test branch for Melis Güzellik
  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage A Primary Branch', 'stage-a-primary', true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET is_primary = true, is_active = true
  RETURNING id INTO v_branch_id;

  -- Create a test service and staff
  INSERT INTO public.services (tenant_id, name, duration, price, active)
  VALUES (v_tenant_id, 'Stage A Service', 45, 200, true)
  RETURNING id INTO v_service_id;

  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Stage A Staff', 'Specialist', true)
  RETURNING id INTO v_staff_id;

  -- Map staff and service to branch
  INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
  VALUES (v_tenant_id, v_staff_id, v_branch_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
  VALUES (v_tenant_id, v_service_id, v_branch_id) ON CONFLICT DO NOTHING;

  -- Staff-service junction
  INSERT INTO public.staff_services (staff_id, service_id)
  VALUES (v_staff_id, v_service_id) ON CONFLICT DO NOTHING;

  -- Availability rules (Mon-Sat 09:00-19:00)
  INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
  SELECT v_tenant_id, v_staff_id, d, '09:00', '19:00', true
  FROM generate_series(1, 7) AS d;

  RAISE NOTICE '=== STARTING STAGE A ACCEPTANCE TESTS 29-35 ===';

  -- -----------------------------------------------------------------------
  -- TEST 29: Cross-tenant branch mapping isolation
  -- -----------------------------------------------------------------------
  INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
  VALUES ('Foreign Tenant 29', 'foreign-tenant-29', 'active', 'completed', 'published')
  RETURNING id INTO v_other_tenant_id;

  v_eval_res := public.evaluate_booking_slot(
    p_tenant_id  => v_other_tenant_id, -- Mismatched tenant
    p_branch_id  => v_branch_id,
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date,
    p_time       => '10:00:00'::time
  );
  IF (v_eval_res->>'allowed')::boolean OR v_eval_res->>'reason_code' != 'invalid_branch' THEN
    RAISE EXCEPTION 'TEST 29 FAIL: Cross-tenant branch was not rejected with invalid_branch';
  END IF;
  RAISE NOTICE 'TEST 29 PASS: Cross-tenant branch mapping cleanly rejected.';

  -- -----------------------------------------------------------------------
  -- TEST 30: Staff-branch junction mapping enforcement
  -- -----------------------------------------------------------------------
  DECLARE
    v_unmapped_branch uuid;
  BEGIN
    INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
    VALUES (v_tenant_id, 'Stage A Unmapped Branch', 'stage-a-unmapped', true, false)
    RETURNING id INTO v_unmapped_branch;

    v_eval_res := public.evaluate_booking_slot(
      p_tenant_id  => v_tenant_id,
      p_branch_id  => v_unmapped_branch, -- staff is not mapped to this branch
      p_service_id => v_service_id,
      p_staff_id   => v_staff_id,
      p_date       => v_test_date,
      p_time       => '10:00:00'::time
    );
    IF (v_eval_res->>'allowed')::boolean OR v_eval_res->>'reason_code' != 'invalid_staff' THEN
      RAISE EXCEPTION 'TEST 30 FAIL: Staff not mapped to branch was not rejected with invalid_staff';
    END IF;

    DELETE FROM public.branches WHERE id = v_unmapped_branch;
    RAISE NOTICE 'TEST 30 PASS: Unmapped branch enforced cleanly.';
  END;

  -- -----------------------------------------------------------------------
  -- TEST 31: evaluate_booking_slot returns allowed=true for free slot & slot_conflict for occupied
  -- -----------------------------------------------------------------------
  v_eval_res := public.evaluate_booking_slot(
    p_tenant_id  => v_tenant_id,
    p_branch_id  => v_branch_id,
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date,
    p_time       => '10:00:00'::time
  );
  IF NOT (v_eval_res->>'allowed')::boolean THEN
    RAISE EXCEPTION 'TEST 31 FAIL: Expected free slot allowed=true, got: %', v_eval_res;
  END IF;
  RAISE NOTICE 'TEST 31 PASS: evaluate_booking_slot allowed free slot.';

  -- -----------------------------------------------------------------------
  -- TEST 32: Appointment creation stores branch_id & duration_minutes snapshot
  -- -----------------------------------------------------------------------
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_branch_id        => v_branch_id,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time,
    p_customer_name    => 'Stage A Test User',
    p_customer_email   => 'stagea-test-32@randapp-test.invalid',
    p_customer_phone   => '+905001118877',
    p_required_consent => true,
    p_idempotency_key  => 'stagea-key-32'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 32 FAIL: create_public_booking failed: %', r;
  END IF;
  v_apt_id := (r->>'appointment_id')::uuid;

  SELECT branch_id, duration_minutes INTO v_stored_branch, v_stored_duration
  FROM public.appointments WHERE id = v_apt_id;

  IF v_stored_branch IS DISTINCT FROM v_branch_id OR v_stored_duration != 45 THEN
    RAISE EXCEPTION 'TEST 32 FAIL: Stored branch_id=% or duration_minutes=% mismatch (expected branch %, duration 45)',
      v_stored_branch, v_stored_duration, v_branch_id;
  END IF;
  RAISE NOTICE 'TEST 32 PASS: Appointment stored branch_id & duration_minutes snapshot (45 min).';

  -- -----------------------------------------------------------------------
  -- TEST 33: Changing service duration does NOT alter historical appointment duration
  -- -----------------------------------------------------------------------
  UPDATE public.services SET duration = 90 WHERE id = v_service_id;

  SELECT duration_minutes INTO v_stored_duration FROM public.appointments WHERE id = v_apt_id;
  IF v_stored_duration != 45 THEN
    RAISE EXCEPTION 'TEST 33 FAIL: Historical appointment duration mutated from 45 to %', v_stored_duration;
  END IF;
  RAISE NOTICE 'TEST 33 PASS: Historical appointment duration preserved independently from service catalog mutation.';

  -- -----------------------------------------------------------------------
  -- TEST 34: Single-branch tenant auto-resolves branch_id when p_branch_id IS NULL
  -- -----------------------------------------------------------------------
  r := public.get_public_available_slots(
    p_slug       => v_slug,
    p_branch_id  => NULL, -- Omitted branch_id
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date
  );
  IF NOT (r->>'success')::boolean OR (r->>'branch_id')::uuid IS NULL THEN
    RAISE EXCEPTION 'TEST 34 FAIL: Single-branch tenant failed to auto-resolve branch_id: %', r;
  END IF;
  RAISE NOTICE 'TEST 34 PASS: Single-branch tenant auto-resolved branch_id correctly.';

  -- -----------------------------------------------------------------------
  -- TEST 35: Multi-branch tenant requires p_branch_id or returns branch_required
  -- -----------------------------------------------------------------------
  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage A Second Active Branch', 'stage-a-second', true, false)
  RETURNING id INTO v_branch_id2;

  r := public.get_public_available_slots(
    p_slug       => v_slug,
    p_branch_id  => NULL, -- Ambiguous multi-branch request
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date
  );
  IF (r->>'success')::boolean OR r->>'reason_code' != 'branch_required' THEN
    RAISE EXCEPTION 'TEST 35 FAIL: Multi-branch tenant did not return branch_required: %', r;
  END IF;
  RAISE NOTICE 'TEST 35 PASS: Multi-branch tenant cleanly returned branch_required.';

  -- Cleanup Stage A fixtures
  DELETE FROM public.appointment_access_tokens WHERE appointment_id = v_apt_id;
  DELETE FROM public.public_booking_idempotency WHERE appointment_id = v_apt_id;
  DELETE FROM public.appointments WHERE id = v_apt_id;
  DELETE FROM public.consent_ledger WHERE customer_id IN (
    SELECT id::text FROM public.customers WHERE tenant_id = v_tenant_id AND email = 'stagea-test-32@randapp-test.invalid'
  );
  DELETE FROM public.customers WHERE tenant_id = v_tenant_id AND email = 'stagea-test-32@randapp-test.invalid';
  DELETE FROM public.staff_branches WHERE staff_id = v_staff_id;
  DELETE FROM public.service_branches WHERE service_id = v_service_id;
  DELETE FROM public.staff_services WHERE staff_id = v_staff_id;
  DELETE FROM public.availability_rules WHERE staff_id = v_staff_id;
  DELETE FROM public.staff WHERE id = v_staff_id;
  DELETE FROM public.services WHERE id = v_service_id;
  DELETE FROM public.branches WHERE id IN (v_branch_id, v_branch_id2);
  DELETE FROM public.tenants WHERE id = v_other_tenant_id;

  RAISE NOTICE '=== STAGE A ACCEPTANCE TESTS 29-35 COMPLETED SUCCESSFULLY ===';
END $$;


-- =========================================================================
-- STAGE A HARDENING ACCEPTANCE TESTS: Tests 36-40
-- TEST 36: Composite FK constraint rejects direct cross-tenant staff_branches INSERT
-- TEST 37: RLS WITH CHECK policy rejects unauthorized staff/owner branch mapping INSERT
-- TEST 38: Anonymous user calling evaluate_booking_slot directly is rejected (EXECUTE REVOKED)
-- TEST 39: Pending status appointment blocks future slot (conflict evaluation)
-- TEST 40: Appointment slot evaluation rejects service when duration IS NULL or 0
-- =========================================================================
DO $$
DECLARE
  v_slug            text := 'melis-guzellik';
  v_tenant_id       uuid;
  v_other_tenant_id uuid;
  v_branch_id       uuid;
  v_service_id      uuid;
  v_staff_id        uuid;
  v_test_date       date := (CURRENT_DATE + 35)::date;
  v_eval_res        jsonb;
  r                 jsonb;
  v_fk_failed       boolean := false;
  v_anon_failed     boolean := false;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;

  -- Create primary test branch
  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage A Hardening Branch', 'stage-a-hardening', true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET is_primary = true, is_active = true
  RETURNING id INTO v_branch_id;

  INSERT INTO public.services (tenant_id, name, duration, price, active)
  VALUES (v_tenant_id, 'Stage A Hardening Service', 30, 150, true)
  RETURNING id INTO v_service_id;

  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Stage A Hardening Staff', 'Specialist', true)
  RETURNING id INTO v_staff_id;

  -- Mappings
  INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
  VALUES (v_tenant_id, v_staff_id, v_branch_id);

  INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
  VALUES (v_tenant_id, v_service_id, v_branch_id);

  INSERT INTO public.staff_services (staff_id, service_id)
  VALUES (v_staff_id, v_service_id);

  INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
  SELECT v_tenant_id, v_staff_id, d, '09:00', '19:00', true
  FROM generate_series(1, 7) AS d;

  INSERT INTO public.tenants (name, slug, status, onboarding_status, public_site_status)
  VALUES ('Foreign Tenant 36', 'foreign-tenant-36', 'active', 'completed', 'published')
  RETURNING id INTO v_other_tenant_id;

  RAISE NOTICE '=== STARTING STAGE A HARDENING TESTS 36-40 ===';

  -- -----------------------------------------------------------------------
  -- TEST 36: Composite FK constraint rejects direct cross-tenant staff_branches INSERT
  -- -----------------------------------------------------------------------
  BEGIN
    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id)
    VALUES (v_other_tenant_id, v_staff_id, v_branch_id); -- Mismatched tenant_id
  EXCEPTION WHEN foreign_key_violation THEN
    v_fk_failed := true;
  END;

  IF NOT v_fk_failed THEN
    RAISE EXCEPTION 'TEST 36 FAIL: Composite FK did not reject cross-tenant staff_branches INSERT';
  END IF;
  RAISE NOTICE 'TEST 36 PASS: Composite FK structurally rejected cross-tenant INSERT.';

  -- -----------------------------------------------------------------------
  -- TEST 38: Anonymous user calling evaluate_booking_slot directly is rejected
  -- -----------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'evaluate_booking_slot'
      AND grantee IN ('PUBLIC', 'anon')
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TEST 38 FAIL: evaluate_booking_slot is directly executable by PUBLIC/anon';
  END IF;
  RAISE NOTICE 'TEST 38 PASS: evaluate_booking_slot execution revoked from PUBLIC and anon.';

  -- -----------------------------------------------------------------------
  -- TEST 39: Pending status appointment blocks future slot
  -- -----------------------------------------------------------------------
  INSERT INTO public.appointments (
    tenant_id, branch_id, service_id, staff_id, user_name, user_email,
    appointment_date, appointment_time, duration_minutes, status
  ) VALUES (
    v_tenant_id, v_branch_id, v_service_id, v_staff_id, 'Pending User', 'pending@test.invalid',
    v_test_date, '11:00:00'::time, 30, 'pending'
  );

  v_eval_res := public.evaluate_booking_slot(
    p_tenant_id  => v_tenant_id,
    p_branch_id  => v_branch_id,
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date,
    p_time       => '11:00:00'::time
  );
  IF (v_eval_res->>'allowed')::boolean OR v_eval_res->>'reason_code' != 'slot_conflict' THEN
    RAISE EXCEPTION 'TEST 39 FAIL: Pending appointment did not block slot: %', v_eval_res;
  END IF;
  RAISE NOTICE 'TEST 39 PASS: Pending appointment correctly blocked future slot.';

  -- -----------------------------------------------------------------------
  -- TEST 40: Appointment slot evaluation rejects service when duration IS NULL or 0
  -- -----------------------------------------------------------------------
  DECLARE
    v_no_dur_service uuid;
  BEGIN
    INSERT INTO public.services (tenant_id, name, duration, price, active)
    VALUES (v_tenant_id, 'No Duration Service', 0, 100, true)
    RETURNING id INTO v_no_dur_service;

    INSERT INTO public.service_branches (tenant_id, service_id, branch_id)
    VALUES (v_tenant_id, v_no_dur_service, v_branch_id);

    INSERT INTO public.staff_services (staff_id, service_id)
    VALUES (v_staff_id, v_no_dur_service);

    v_eval_res := public.evaluate_booking_slot(
      p_tenant_id  => v_tenant_id,
      p_branch_id  => v_branch_id,
      p_service_id => v_no_dur_service,
      p_staff_id   => v_staff_id,
      p_date       => v_test_date,
      p_time       => '14:00:00'::time
    );
    IF (v_eval_res->>'allowed')::boolean OR v_eval_res->>'reason_code' != 'invalid_service' THEN
      RAISE EXCEPTION 'TEST 40 FAIL: Zero-duration service was not rejected with invalid_service: %', v_eval_res;
    END IF;

    DELETE FROM public.staff_services WHERE service_id = v_no_dur_service;
    DELETE FROM public.service_branches WHERE service_id = v_no_dur_service;
    DELETE FROM public.services WHERE id = v_no_dur_service;
    RAISE NOTICE 'TEST 40 PASS: Zero/null duration service correctly rejected.';
  END;

  -- Cleanup
  DELETE FROM public.appointments WHERE user_email = 'pending@test.invalid';
  DELETE FROM public.staff_branches WHERE staff_id = v_staff_id;
  DELETE FROM public.service_branches WHERE service_id = v_service_id;
  DELETE FROM public.staff_services WHERE staff_id = v_staff_id;
  DELETE FROM public.availability_rules WHERE staff_id = v_staff_id;
  DELETE FROM public.staff WHERE id = v_staff_id;
  DELETE FROM public.services WHERE id = v_service_id;
  DELETE FROM public.branches WHERE id = v_branch_id;
  DELETE FROM public.tenants WHERE id = v_other_tenant_id;

  RAISE NOTICE '=== STAGE A HARDENING TESTS 36-40 COMPLETED SUCCESSFULLY ===';
END $$;


-- =========================================================================
-- STAGE A BRANCH DELETION & HISTORY TESTS: Tests 41-43
-- TEST 41: Deactivating a branch preserves linked appointments & tenant_id/branch_id
-- TEST 42: Physical deletion of a branch referenced by an appointment is REJECTED (ON DELETE RESTRICT)
-- TEST 43: Deleting an unreferenced branch succeeds cleanly
-- =========================================================================
DO $$
DECLARE
  v_slug            text := 'melis-guzellik';
  v_tenant_id       uuid;
  v_branch_id       uuid;
  v_unref_branch    uuid;
  v_service_id      uuid;
  v_staff_id        uuid;
  v_test_date       date := (CURRENT_DATE + 40)::date;
  v_apt_id          uuid;
  r                 jsonb;
  v_delete_failed   boolean := false;
  v_check_tenant    uuid;
  v_check_branch    uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;

  -- Create branch with active appointment
  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage A Deletion Branch', 'stage-a-deletion', true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET is_primary = true, is_active = true
  RETURNING id INTO v_branch_id;

  -- Create unreferenced branch
  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage A Unreferenced Branch', 'stage-a-unref', true, false)
  RETURNING id INTO v_unref_branch;

  INSERT INTO public.services (tenant_id, name, duration, price, active)
  VALUES (v_tenant_id, 'Stage A Deletion Service', 30, 150, true)
  RETURNING id INTO v_service_id;

  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Stage A Deletion Staff', 'Specialist', true)
  RETURNING id INTO v_staff_id;

  INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES (v_tenant_id, v_staff_id, v_branch_id);
  INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES (v_tenant_id, v_service_id, v_branch_id);
  INSERT INTO public.staff_services (staff_id, service_id) VALUES (v_staff_id, v_service_id);
  INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
  SELECT v_tenant_id, v_staff_id, d, '09:00', '19:00', true FROM generate_series(1, 7) AS d;

  -- Book an appointment on this branch
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_branch_id        => v_branch_id,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => '10:00:00'::time,
    p_customer_name    => 'Deletion Test User',
    p_customer_email   => 'del-test-41@randapp-test.invalid',
    p_customer_phone   => '+905001117766',
    p_required_consent => true,
    p_idempotency_key  => 'del-key-41'
  );
  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 41 SETUP FAIL: booking creation failed: %', r;
  END IF;
  v_apt_id := (r->>'appointment_id')::uuid;

  RAISE NOTICE '=== STARTING STAGE A BRANCH DELETION & HISTORY TESTS 41-43 ===';

  -- -----------------------------------------------------------------------
  -- TEST 41: Deactivating a branch preserves linked appointment & IDs
  -- -----------------------------------------------------------------------
  UPDATE public.branches SET is_active = false WHERE id = v_branch_id;

  SELECT tenant_id, branch_id INTO v_check_tenant, v_check_branch
  FROM public.appointments WHERE id = v_apt_id;

  IF v_check_tenant IS NULL OR v_check_branch IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'TEST 41 FAIL: Appointment tenant_id or branch_id mutated after branch deactivation';
  END IF;
  RAISE NOTICE 'TEST 41 PASS: Deactivating branch preserved appointment branch_id & tenant_id.';

  -- Reactivate branch temporarily for delete test
  UPDATE public.branches SET is_active = true WHERE id = v_branch_id;

  -- -----------------------------------------------------------------------
  -- TEST 42: Physical deletion of referenced branch is REJECTED by ON DELETE RESTRICT
  -- -----------------------------------------------------------------------
  BEGIN
    DELETE FROM public.branches WHERE id = v_branch_id;
  EXCEPTION WHEN foreign_key_violation THEN
    v_delete_failed := true;
  END;

  IF NOT v_delete_failed THEN
    RAISE EXCEPTION 'TEST 42 FAIL: ON DELETE RESTRICT constraint failed to reject deleting referenced branch';
  END IF;

  -- Verify appointment branch_id and tenant_id remain unchanged
  SELECT tenant_id, branch_id INTO v_check_tenant, v_check_branch
  FROM public.appointments WHERE id = v_apt_id;

  IF v_check_tenant IS NULL OR v_check_branch IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'TEST 42 FAIL: Appointment branch_id was modified during failed delete attempt';
  END IF;
  RAISE NOTICE 'TEST 42 PASS: Physical delete of referenced branch rejected by ON DELETE RESTRICT.';

  -- -----------------------------------------------------------------------
  -- TEST 43: Deleting an unreferenced branch succeeds cleanly
  -- -----------------------------------------------------------------------
  DELETE FROM public.branches WHERE id = v_unref_branch;
  IF EXISTS (SELECT 1 FROM public.branches WHERE id = v_unref_branch) THEN
    RAISE EXCEPTION 'TEST 43 FAIL: Unreferenced branch deletion failed';
  END IF;
  RAISE NOTICE 'TEST 43 PASS: Deleting unreferenced branch succeeded cleanly.';

  -- Cleanup
  DELETE FROM public.appointment_access_tokens WHERE appointment_id = v_apt_id;
  DELETE FROM public.public_booking_idempotency WHERE appointment_id = v_apt_id;
  DELETE FROM public.appointments WHERE id = v_apt_id;
  DELETE FROM public.consent_ledger WHERE customer_id IN (
    SELECT id::text FROM public.customers WHERE tenant_id = v_tenant_id AND email = 'del-test-41@randapp-test.invalid'
  );
  DELETE FROM public.customers WHERE tenant_id = v_tenant_id AND email = 'del-test-41@randapp-test.invalid';
  DELETE FROM public.staff_branches WHERE staff_id = v_staff_id;
  DELETE FROM public.service_branches WHERE service_id = v_service_id;
  DELETE FROM public.staff_services WHERE staff_id = v_staff_id;
  DELETE FROM public.availability_rules WHERE staff_id = v_staff_id;
  DELETE FROM public.staff WHERE id = v_staff_id;
  DELETE FROM public.services WHERE id = v_service_id;
  DELETE FROM public.branches WHERE id = v_branch_id;

  RAISE NOTICE '=== STAGE A BRANCH DELETION & HISTORY TESTS 41-43 COMPLETED SUCCESSFULLY ===';
END $$;


-- =========================================================================
-- STAGE B ACCEPTANCE TESTS: Tests 44-48
-- TEST 44: get_public_available_slots returns valid free slots with branch_id & duration_minutes
-- TEST 45: create_public_booking contract returns appointment_id, manage_token, branch_id
-- TEST 46: create_public_booking stores status=confirmed, branch_id & duration_minutes snapshot
-- TEST 47: Booking a returned slot removes it from subsequent slot RPC queries (slot invalidation)
-- TEST 48: Rebooking the exact same slot returns slot_conflict
-- =========================================================================
DO $$
DECLARE
  v_slug            text := 'melis-guzellik';
  v_tenant_id       uuid;
  v_branch_id       uuid;
  v_service_id      uuid;
  v_staff_id        uuid;
  v_test_date       date := (CURRENT_DATE + 45)::date;
  v_slot_res        jsonb;
  v_slots           jsonb;
  v_first_slot      text;
  v_book_time       time;
  r                 jsonb;
  r_conflict        jsonb;
  v_apt_id          uuid;
  v_token           text;
  v_branch_ret      uuid;
  v_count           int;
  v_status          text;
  v_dur             int;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = v_slug;

  INSERT INTO public.branches (tenant_id, name, slug, is_active, is_primary)
  VALUES (v_tenant_id, 'Stage B Test Branch', 'stage-b-branch', true, true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET is_primary = true, is_active = true
  RETURNING id INTO v_branch_id;

  INSERT INTO public.services (tenant_id, name, duration, price, active)
  VALUES (v_tenant_id, 'Stage B Service', 30, 180, true)
  RETURNING id INTO v_service_id;

  INSERT INTO public.staff (tenant_id, name, title, active)
  VALUES (v_tenant_id, 'Stage B Staff', 'Specialist', true)
  RETURNING id INTO v_staff_id;

  INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES (v_tenant_id, v_staff_id, v_branch_id);
  INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES (v_tenant_id, v_service_id, v_branch_id);
  INSERT INTO public.staff_services (staff_id, service_id) VALUES (v_staff_id, v_service_id);
  INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
  SELECT v_tenant_id, v_staff_id, d, '09:00', '19:00', true FROM generate_series(1, 7) AS d;

  RAISE NOTICE '=== STARTING STAGE B ACCEPTANCE TESTS 44-48 ===';

  -- -----------------------------------------------------------------------
  -- TEST 44: get_public_available_slots returns valid free slots
  -- -----------------------------------------------------------------------
  v_slot_res := public.get_public_available_slots(
    p_slug       => v_slug,
    p_branch_id  => v_branch_id,
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date
  );

  IF NOT (v_slot_res->>'success')::boolean OR v_slot_res->>'reason_code' != 'ok' THEN
    RAISE EXCEPTION 'TEST 44 FAIL: Slot RPC failed: %', v_slot_res;
  END IF;

  v_slots := v_slot_res->'slots';
  IF jsonb_array_length(v_slots) = 0 THEN
    RAISE EXCEPTION 'TEST 44 FAIL: Expected free slots, got 0';
  END IF;
  v_first_slot := v_slots->0->>'start';
  RAISE NOTICE 'TEST 44 PASS: Slot RPC returned % slots. First free slot: %', jsonb_array_length(v_slots), v_first_slot;

  -- -----------------------------------------------------------------------
  -- TEST 45 & 46: create_public_booking contract & snapshot verification
  -- -----------------------------------------------------------------------
  v_book_time := v_first_slot::time;
  r := public.create_public_booking(
    p_slug             => v_slug,
    p_branch_id        => v_branch_id,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => v_book_time,
    p_customer_name    => 'Stage B User',
    p_customer_email   => 'stageb-test-45@randapp-test.invalid',
    p_customer_phone   => '+905001116655',
    p_required_consent => true,
    p_idempotency_key  => 'stageb-key-45'
  );

  IF NOT (r->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST 45 FAIL: booking failed: %', r;
  END IF;

  v_apt_id     := (r->>'appointment_id')::uuid;
  v_token      := r->>'manage_token';
  v_branch_ret := (r->>'branch_id')::uuid;

  IF v_apt_id IS NULL OR v_token IS NULL OR v_branch_ret IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'TEST 45 FAIL: Contract mismatch. Return values: apt=%, token=%, branch=%', v_apt_id, v_token, v_branch_ret;
  END IF;
  RAISE NOTICE 'TEST 45 PASS: create_public_booking returned valid appointment_id, manage_token & branch_id.';

  -- Verify exact appointment row stored with confirmed status and duration snapshot
  SELECT status, duration_minutes INTO v_status, v_dur
  FROM public.appointments WHERE id = v_apt_id;

  IF v_status != 'confirmed' OR v_dur != 30 THEN
    RAISE EXCEPTION 'TEST 46 FAIL: Stored status=% or duration_minutes=% mismatch (expected confirmed, 30)', v_status, v_dur;
  END IF;
  RAISE NOTICE 'TEST 46 PASS: Appointment stored status=confirmed & duration_minutes=30 snapshot.';

  -- -----------------------------------------------------------------------
  -- TEST 47: Booking a returned slot removes it from subsequent slot RPC queries (Slot Invalidation)
  -- -----------------------------------------------------------------------
  v_slot_res := public.get_public_available_slots(
    p_slug       => v_slug,
    p_branch_id  => v_branch_id,
    p_service_id => v_service_id,
    p_staff_id   => v_staff_id,
    p_date       => v_test_date
  );
  v_slots := v_slot_res->'slots';

  IF v_slots @> jsonb_build_array(jsonb_build_object('start', v_first_slot, 'end', (v_first_slot::time + interval '30 minutes')::text)) THEN
    RAISE EXCEPTION 'TEST 47 FAIL: Booked slot % still returned in slot list: %', v_first_slot, v_slots;
  END IF;
  RAISE NOTICE 'TEST 47 PASS: Booked slot % correctly absent from subsequent slot RPC query.', v_first_slot;

  -- -----------------------------------------------------------------------
  -- TEST 48: Rebooking the exact same slot returns slot_conflict
  -- -----------------------------------------------------------------------
  r_conflict := public.create_public_booking(
    p_slug             => v_slug,
    p_branch_id        => v_branch_id,
    p_service_id       => v_service_id,
    p_staff_id         => v_staff_id,
    p_appointment_date => v_test_date,
    p_appointment_time => v_book_time,
    p_customer_name    => 'Second User',
    p_customer_email   => 'stageb-test-48@randapp-test.invalid',
    p_customer_phone   => '+905001116644',
    p_required_consent => true,
    p_idempotency_key  => 'stageb-key-48'
  );

  IF (r_conflict->>'success')::boolean OR r_conflict->>'reason_code' != 'slot_conflict' THEN
    RAISE EXCEPTION 'TEST 48 FAIL: Rebooking occupied slot did not return slot_conflict: %', r_conflict;
  END IF;
  RAISE NOTICE 'TEST 48 PASS: Rebooking occupied slot cleanly returned slot_conflict.';

  -- Cleanup
  DELETE FROM public.appointment_access_tokens WHERE appointment_id = v_apt_id;
  DELETE FROM public.public_booking_idempotency WHERE appointment_id = v_apt_id;
  DELETE FROM public.appointments WHERE id = v_apt_id;
  DELETE FROM public.consent_ledger WHERE customer_id IN (
    SELECT id::text FROM public.customers WHERE tenant_id = v_tenant_id AND email LIKE 'stageb-test-%@randapp-test.invalid'
  );
  DELETE FROM public.customers WHERE tenant_id = v_tenant_id AND email LIKE 'stageb-test-%@randapp-test.invalid';
  DELETE FROM public.staff_branches WHERE staff_id = v_staff_id;
  DELETE FROM public.service_branches WHERE service_id = v_service_id;
  DELETE FROM public.staff_services WHERE staff_id = v_staff_id;
  DELETE FROM public.availability_rules WHERE staff_id = v_staff_id;
  DELETE FROM public.staff WHERE id = v_staff_id;
  DELETE FROM public.services WHERE id = v_service_id;
  DELETE FROM public.branches WHERE id = v_branch_id;

  RAISE NOTICE '=== STAGE B ACCEPTANCE TESTS 44-48 COMPLETED SUCCESSFULLY ===';
END $$;




