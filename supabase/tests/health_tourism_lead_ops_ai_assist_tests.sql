-- ============================================================================
-- HEALTH TOURISM SLICE 3 SERVER-AUTHORITY TEST SUITE (36 ASSERTIONS)
-- Corrected for E1 R5 acceptance
-- ============================================================================

BEGIN;

SELECT plan(40);

-- ----------------------------------------------------------------------------
-- Setup Fixture Data (Tenants, Auth Users, Profiles, Staff)
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'HT Tenant Alpha', 'ht-alpha', 'active', 'completed', 'published'),
  ('b2222222-2222-2222-2222-222222222222', 'HT Tenant Beta', 'ht-beta', 'active', 'completed', 'published')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'owner@ht-alpha.example.invalid'),
  ('a2222222-2222-4222-8222-222222222222', 'manager@ht-alpha.example.invalid'),
  ('a3333333-3333-4333-8333-333333333333', 'viewonly@ht-alpha.example.invalid'),
  ('a4444444-4444-4444-8444-444444444444', 'staff@ht-beta.example.invalid'),
  ('a5555555-5555-4555-8555-555555555555', 'inactive@ht-alpha.example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'tenant_owner', 'Alpha Owner', true),
  ('a2222222-2222-4222-8222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Manager', true),
  ('a3333333-3333-4333-8333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha ViewOnly', true),
  ('a4444444-4444-4444-8444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'staff', 'Beta Staff', true),
  ('a5555555-5555-4555-8555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'staff', 'Alpha Inactive', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
  ('b2222222-2222-4222-8222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'Alpha Manager Staff', true),
  ('b3333333-3333-4333-8333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'a3333333-3333-4333-8333-333333333333', 'Alpha ViewOnly Staff', true),
  ('b4444444-4444-4444-8444-444444444444', 'b2222222-2222-2222-2222-222222222222', 'a4444444-4444-4444-8444-444444444444', 'Beta Staff', true),
  ('b5555555-5555-4555-8555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'a5555555-5555-4555-8555-555555555555', 'Alpha Inactive Staff', false)
ON CONFLICT (id) DO NOTHING;

-- Configure HT Staff Profiles
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT public.ht_set_staff_profile('b2222222-2222-4222-8222-222222222222', true, true);
SELECT public.ht_set_staff_profile('b3333333-3333-4333-8333-333333333333', false, true);
SELECT public.ht_set_staff_profile('b4444444-4444-4444-8444-444444444444', true, true);

-- Create Base Test Lead for Alpha
INSERT INTO public.ht_leads (
    id, tenant_id, status, source_channel, preferred_language, country_code, full_name, email, phone, passport_number, notes
) VALUES (
    'c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'new', 'web', 'de', 'DE', 'Hans Mueller', 'hans@example.de', '+49151123456', 'E3R5_PASSPORT_SENTINEL_DO_NOT_EXPOSE', 'SYNTHETIC_SECRET_TRANSCRIPT_PHRASE_99'
) ON CONFLICT (id) DO NOTHING;

-- Create Base Test Lead for Beta (for cross-tenant checks)
INSERT INTO public.ht_leads (
    id, tenant_id, status, source_channel, preferred_language, country_code, full_name, email, phone, notes
) VALUES (
    'c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'new', 'web', 'en', 'GB', 'John Doe', 'john@example.co.uk', '+447911123456', 'Beta lead notes'
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- ITEM 1: Migration 67 applied (table & column existence)
-- ----------------------------------------------------------------------------
SELECT has_table('public', 'ht_ai_conversations', '1. Migration 67 applied (ht_ai_conversations table exists)');

-- ----------------------------------------------------------------------------
-- ITEM 2: Unauthorized HT workspace denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true); -- Inactive staff has no HT profile
SELECT is(
    (public.ht_get_my_context()->>'success')::boolean,
    false,
    '2. Unauthorized HT workspace denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 3: View-only staff cannot mutate lead status
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true); -- ViewOnly staff
SELECT throws_ok(
    $$ SELECT public.ht_update_lead_status('c1111111-1111-1111-1111-111111111111', 'contacted') $$,
    'FORBIDDEN: Staff member lacks can_manage_ht_leads permission.',
    '3. View-only staff cannot mutate lead status'
);

-- ----------------------------------------------------------------------------
-- ITEM 4: Manager can mutate same-tenant lead
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true); -- Manager staff
SELECT is(
    (public.ht_update_lead_status('c1111111-1111-1111-1111-111111111111', 'contacted')->>'success')::boolean,
    true,
    '4. Manager can mutate same-tenant lead'
);

-- ----------------------------------------------------------------------------
-- ITEM 5: Cross-tenant lead read denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true); -- Beta staff
SELECT throws_ok(
    $$ SELECT public.ht_get_lead('c1111111-1111-1111-1111-111111111111') $$,
    'NOT_FOUND: Lead not found or cross-tenant access denied.',
    '5. Cross-tenant lead read denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 6: Cross-tenant assignment denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true); -- Alpha Manager
SELECT throws_ok(
    $$ SELECT public.ht_assign_coordinator('c1111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-8444-444444444444') $$,
    'FORBIDDEN: Cross-tenant coordinator assignment denied.',
    '6. Cross-tenant coordinator assignment denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 7: Inactive coordinator assignment denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_assign_coordinator('c1111111-1111-1111-1111-111111111111', 'b5555555-5555-4555-8555-555555555555') $$,
    'INVALID_STATE: Coordinator staff member is inactive.',
    '7. Inactive coordinator assignment denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 8: Valid lifecycle transition allowed (contacted -> qualified)
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_update_lead_status('c1111111-1111-1111-1111-111111111111', 'qualified')->>'success')::boolean,
    true,
    '8. Valid lifecycle transition allowed'
);

-- ----------------------------------------------------------------------------
-- ITEM 9: Invalid lifecycle transition denied (qualified -> new)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_update_lead_status('c1111111-1111-1111-1111-111111111111', 'new') $$,
    'INVALID_TRANSITION: Status transition from qualified to new is not permitted.',
    '9. Invalid lifecycle transition denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 10: Converted transition denied
-- ----------------------------------------------------------------------------
SELECT throws_ok(
    $$ SELECT public.ht_update_lead_status('c1111111-1111-1111-1111-111111111111', 'converted') $$,
    'INVALID_TRANSITION: The converted status is reserved for server-authoritative Clinic acceptance.',
    '10. Converted transition denied'
);

-- ----------------------------------------------------------------------------
-- ITEM 11: Score clamped 0..100
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_score_lead('c1111111-1111-1111-1111-111111111111', 100)->>'lead_score')::integer <= 100,
    true,
    '11. Score clamped to max 100'
);

-- ----------------------------------------------------------------------------
-- ITEM 12: Deterministic score reason codes
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_score_lead('c1111111-1111-1111-1111-111111111111', 0)->>'lead_score_reasons')::jsonb @> '["email_present"]'::jsonb,
    true,
    '12. Deterministic score reason codes generated'
);

-- ----------------------------------------------------------------------------
-- ITEM 13: AI contribution bounded
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_score_lead('c1111111-1111-1111-1111-111111111111', 99)->>'ai_intent_delta')::integer,
    10,
    '13. AI intent delta bounded to max 10'
);

-- ----------------------------------------------------------------------------
-- ITEM 14: No clinical severity scoring
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_score_lead('c1111111-1111-1111-1111-111111111111', 0)->>'lead_score_reasons')::jsonb @> '["clinical_severity"]'::jsonb,
    false,
    '14. No clinical severity scoring in reasons'
);

-- ----------------------------------------------------------------------------
-- ITEM 15: Public AI conversation tenant authority & link
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true); -- Service-role / Server authority
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.ht_create_ai_conversation('a1111111-1111-1111-1111-111111111111', 'de', 'c1111111-1111-1111-1111-111111111111');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'ht_create_ai_conversation failed: %', v_res;
    END IF;
END $$;
SELECT is(
    (SELECT count(*) FROM public.ht_ai_conversations WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111'),
    1::bigint,
    '15. AI conversation bound to exact tenant authority'
);

-- ----------------------------------------------------------------------------
-- ITEM 16: View-only staff handoff mutation denied & Cross-tenant handoff denied
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true); -- ViewOnly staff
DO $$
DECLARE
    v_conv_id UUID;
BEGIN
    SELECT id INTO v_conv_id FROM public.ht_ai_conversations WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
    BEGIN
        PERFORM public.ht_request_handoff(v_conv_id, 'test');
        RAISE EXCEPTION 'SHOULD_HAVE_FAILED';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%can_manage_ht_leads%' THEN
            RAISE EXCEPTION 'Unexpected error message: %', SQLERRM;
        END IF;
    END;
END $$;

-- Cross-tenant handoff mutation denial: Alpha manager cannot request handoff for Beta conversation
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true); -- Alpha manager
DO $$
DECLARE
    v_beta_conv_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO public.ht_ai_conversations (id, tenant_id, lead_id, session_token, preferred_language)
    VALUES (v_beta_conv_id, 'b2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'beta-conv-token', 'en');

    BEGIN
        PERFORM public.ht_request_handoff(v_beta_conv_id, 'cross_tenant_test');
        RAISE EXCEPTION 'SHOULD_HAVE_FAILED';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Cross-tenant%' THEN
            RAISE EXCEPTION 'Unexpected cross-tenant error: %', SQLERRM;
        END IF;
    END;
END $$;
SELECT is(true, true, '16. View-only staff and cross-tenant staff handoff mutation denied');

-- ----------------------------------------------------------------------------
-- ITEM 17: Executable Function Privileges Assertion
-- ----------------------------------------------------------------------------
SELECT is(
    has_function_privilege('anon', 'public.ht_create_ai_conversation(uuid, text, uuid)', 'EXECUTE'),
    false,
    '17. Executable privilege assertion: anon CANNOT execute ht_create_ai_conversation'
);

SELECT is(
    has_function_privilege('authenticated', 'public.ht_create_ai_conversation(uuid, text, uuid)', 'EXECUTE'),
    false,
    '17B. Executable privilege assertion: authenticated CANNOT execute ht_create_ai_conversation'
);

SELECT is(
    has_function_privilege('service_role', 'public.ht_create_ai_conversation(uuid, text, uuid)', 'EXECUTE'),
    true,
    '17C. Executable privilege assertion: service_role CAN execute ht_create_ai_conversation'
);

-- ----------------------------------------------------------------------------
-- ITEM 18: AI message retention timestamp exists on ht_ai_messages
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_session TEXT;
BEGIN
    SELECT session_token INTO v_session FROM public.ht_ai_conversations LIMIT 1;
    PERFORM public.ht_add_ai_message(v_session, 'user', 'Hello AI world');
END $$;

SELECT is(
    (SELECT expires_at IS NOT NULL FROM public.ht_ai_messages LIMIT 1),
    true,
    '18. AI message retention timestamp exists on ht_ai_messages'
);

-- ----------------------------------------------------------------------------
-- ITEM 19 & 20: Retention behavioral test — expired AI messages/conversations cleaned up, linked lead survives
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_msg_count_before INTEGER;
    v_conv_count_before INTEGER;
    v_msg_count_after INTEGER;
    v_conv_count_after INTEGER;
    v_lead_count_after INTEGER;
BEGIN
    -- Create expired conversation & message fixtures
    INSERT INTO public.ht_ai_conversations (
        id, tenant_id, lead_id, session_token, preferred_language, status, expires_at
    ) VALUES (
        'e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
        'expired-session-token-999', 'en', 'expired', now() - INTERVAL '1 day'
    );

    INSERT INTO public.ht_ai_messages (
        id, conversation_id, role, content, expires_at
    ) VALUES (
        'm1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'user', 'Expired message', now() - INTERVAL '1 day'
    );

    -- Assert fixture existence before cleanup
    SELECT count(*) INTO v_msg_count_before FROM public.ht_ai_messages WHERE id = 'm1111111-1111-1111-1111-111111111111';
    SELECT count(*) INTO v_conv_count_before FROM public.ht_ai_conversations WHERE id = 'e1111111-1111-1111-1111-111111111111';

    IF v_msg_count_before <> 1 OR v_conv_count_before <> 1 THEN
        RAISE EXCEPTION 'FIXTURE_FAILURE: Expired retention fixtures failed to record prior to cleanup';
    END IF;

    -- Run cleanup
    PERFORM public.ht_cleanup_expired_ai_data();

    -- Post-cleanup checks
    SELECT count(*) INTO v_msg_count_after FROM public.ht_ai_messages WHERE id = 'm1111111-1111-1111-1111-111111111111';
    SELECT count(*) INTO v_conv_count_after FROM public.ht_ai_conversations WHERE id = 'e1111111-1111-1111-1111-111111111111';
    SELECT count(*) INTO v_lead_count_after FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111';

    IF v_msg_count_after <> 0 OR v_conv_count_after <> 0 THEN
        RAISE EXCEPTION 'RETENTION_FAILURE: Expired data was not deleted by cleanup RPC';
    END IF;

    IF v_lead_count_after <> 1 THEN
        RAISE EXCEPTION 'RETENTION_FAILURE: Linked HT lead was illegally removed during cleanup';
    END IF;
END $$;

SELECT is(true, true, '19. Expired AI messages and conversations deleted by retention cleanup');
SELECT is(
    (SELECT count(*) FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    1::bigint,
    '20. Linked HT lead survives transcript retention cleanup'
);

-- ----------------------------------------------------------------------------
-- ITEM 21: Qualified lead handoff transitions status to handoff_pending
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_conv_id UUID;
BEGIN
    SELECT id INTO v_conv_id FROM public.ht_ai_conversations WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
    PERFORM public.ht_request_handoff(v_conv_id, 'medical_question');
END $$;
SELECT is(
    (SELECT status FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    'handoff_pending',
    '21. Qualified lead handoff transitions status to handoff_pending'
);

-- ----------------------------------------------------------------------------
-- ITEM 22: New/Contacted lead handoff does NOT illegally jump status to handoff_pending
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_new_lead_id UUID := gen_random_uuid();
    v_conv_res JSONB;
    v_conv_id UUID;
BEGIN
    INSERT INTO public.ht_leads (id, tenant_id, status, source_channel, preferred_language, full_name, email)
    VALUES (v_new_lead_id, 'a1111111-1111-1111-1111-111111111111', 'new', 'web', 'en', 'New Lead Handoff Test', 'newhandoff@example.com');

    v_conv_res := public.ht_create_ai_conversation('a1111111-1111-1111-1111-111111111111', 'en', v_new_lead_id);
    v_conv_id := (v_conv_res->>'conversation_id')::uuid;

    PERFORM public.ht_request_handoff(v_conv_id, 'new_lead_handoff');

    IF (SELECT status FROM public.ht_leads WHERE id = v_new_lead_id) <> 'new' THEN
        RAISE EXCEPTION 'STATUS_OVERWRITTEN: New lead status was illegally changed';
    END IF;
    IF (SELECT handoff_state FROM public.ht_leads WHERE id = v_new_lead_id) <> 'requested' THEN
        RAISE EXCEPTION 'HANDOFF_NOT_RECORDED: Handoff state requested was not recorded';
    END IF;
END $$;
SELECT is(true, true, '22. New lead handoff records handoff_state=requested without changing status to handoff_pending');

-- ----------------------------------------------------------------------------
-- ITEM 23: Acknowledgement authority works
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true); -- Manager
SELECT is(
    (public.ht_acknowledge_handoff('c1111111-1111-1111-1111-111111111111')->>'handoff_state'),
    'acknowledged',
    '23. Handoff acknowledgement authority works'
);

-- ----------------------------------------------------------------------------
-- ITEM 24: WhatsApp handoff queues communication_outbox only
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.ht_enqueue_whatsapp_handoff('c1111111-1111-1111-1111-111111111111', NULL, 'manual_whatsapp');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'ht_enqueue_whatsapp_handoff failed: %', v_res;
    END IF;
END $$;
SELECT is(
    (SELECT count(*) FROM public.communication_outbox WHERE channel = 'whatsapp' AND status = 'queued'),
    1::bigint,
    '24. WhatsApp handoff queues communication_outbox only'
);

-- ----------------------------------------------------------------------------
-- ITEM 25: No real provider send
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT (metadata->>'no_real_send')::boolean FROM public.communication_outbox WHERE channel = 'whatsapp' LIMIT 1),
    true,
    '25. Outbox entry explicitly flagged no_real_send (no provider send)'
);

-- ----------------------------------------------------------------------------
-- ITEM 26: Outbox metadata tenant/lead aligned
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT tenant_id FROM public.communication_outbox WHERE channel = 'whatsapp' LIMIT 1),
    'a1111111-1111-1111-1111-111111111111',
    '26. Outbox metadata aligned with lead tenant'
);

-- ----------------------------------------------------------------------------
-- ITEM 27: Multi-Surface Passport Privacy (case-insensitive)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_audit_leaks INTEGER;
    v_outbox_leaks INTEGER;
    v_conv_summary_leaks INTEGER;
    v_lead_summary_leaks INTEGER;
BEGIN
    SELECT count(*) INTO v_audit_leaks FROM public.audit_events
    WHERE lower(payload::text) LIKE '%passport%' OR lower(payload::text) LIKE '%e3r5_passport_sentinel_do_not_expose%';

    SELECT count(*) INTO v_outbox_leaks FROM public.communication_outbox
    WHERE lower(metadata::text) LIKE '%passport%' OR lower(metadata::text) LIKE '%e3r5_passport_sentinel_do_not_expose%';

    SELECT count(*) INTO v_conv_summary_leaks FROM public.ht_ai_conversations
    WHERE lower(coalesce(summary, '')) LIKE '%passport%' OR lower(coalesce(summary, '')) LIKE '%e3r5_passport_sentinel_do_not_expose%';

    SELECT count(*) INTO v_lead_summary_leaks FROM public.ht_leads
    WHERE lower(coalesce(ai_summary, '')) LIKE '%passport%' OR lower(coalesce(ai_summary, '')) LIKE '%e3r5_passport_sentinel_do_not_expose%';

    IF v_audit_leaks <> 0 OR v_outbox_leaks <> 0 OR v_conv_summary_leaks <> 0 OR v_lead_summary_leaks <> 0 THEN
        RAISE EXCEPTION 'PASSPORT_PRIVACY_LEAK: Passport value or key leaked across system surfaces';
    END IF;
END $$;
SELECT is(true, true, '27. Multi-surface passport privacy verified (case-insensitive across audit, outbox, and summaries)');

-- ----------------------------------------------------------------------------
-- ITEM 28: Unique synthetic transcript phrase absent from audit payload
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.audit_events WHERE payload::text LIKE '%SYNTHETIC_SECRET_TRANSCRIPT_PHRASE_99%'),
    0::bigint,
    '28. Synthetic raw transcript phrase absent from audit event payload'
);

-- ----------------------------------------------------------------------------
-- ITEM 29: Coordinator list pagination/filter
-- ----------------------------------------------------------------------------
SELECT is(
    (public.ht_list_leads('handoff_pending', 10, 0)->>'total')::integer,
    1,
    '29. Coordinator list pagination and status filter working'
);

-- ----------------------------------------------------------------------------
-- ITEM 30: AI summary contains explicit assistive label on BOTH conversation & lead
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true); -- Server internal
DO $$
DECLARE
    v_conv_id UUID;
    v_res JSONB;
    v_conv_has_marker BOOLEAN;
    v_lead_has_marker BOOLEAN;
BEGIN
    SELECT id INTO v_conv_id FROM public.ht_ai_conversations WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
    v_res := public.ht_update_ai_conversation_summary(v_conv_id, 'User interested in dental package');

    SELECT summary LIKE '%AI-generated assistive summary — not verified clinical fact%' INTO v_conv_has_marker FROM public.ht_ai_conversations WHERE id = v_conv_id;
    SELECT ai_summary LIKE '%AI-generated assistive summary — not verified clinical fact%' INTO v_lead_has_marker FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111';

    IF NOT v_conv_has_marker OR NOT v_lead_has_marker THEN
        RAISE EXCEPTION 'SUMMARY_MARKER_MISSING: Assistive summary marker missing from conversation or lead';
    END IF;
END $$;

SELECT is(true, true, '30. AI summary contains explicit assistive marker on BOTH ht_ai_conversations and ht_leads');

-- ----------------------------------------------------------------------------
-- ITEM 31: DB handoff state tracking mechanics for medical boundary handoffs
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT handoff_state FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    'acknowledged',
    '31. DB handoff state tracking mechanics for medical boundary handoffs'
);

-- ----------------------------------------------------------------------------
-- ITEM 32: Domain Isolation — No clinic_patient_profiles creation
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.clinic_patient_profiles WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111'),
    0::bigint,
    '32. Zero Clinic patient profiles created'
);

-- ----------------------------------------------------------------------------
-- ITEM 33: Domain Isolation — No clinic_encounters creation
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.clinic_encounters WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111'),
    0::bigint,
    '33. Zero Clinic encounters created'
);

-- ----------------------------------------------------------------------------
-- ITEM 34: Domain Isolation — No Core appointments creation
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.appointments WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111'),
    0::bigint,
    '34. Zero Core appointments created'
);

-- ----------------------------------------------------------------------------
-- ITEM 35 & 36: Anti-Abuse Rate Limiting Primitive Behavioral Assertions
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_res JSONB;
    i INTEGER;
BEGIN
    -- 5 allowed requests for test bucket
    FOR i IN 1..5 LOOP
        v_res := public.ht_check_rate_limit('ht:rl:test_bucket_99', 5, 3600);
        IF (v_res->>'allowed')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'RATE_LIMIT_FAILURE: Request % was illegally denied', i;
        END IF;
    END LOOP;

    -- 6th request must be denied
    v_res := public.ht_check_rate_limit('ht:rl:test_bucket_99', 5, 3600);
    IF (v_res->>'allowed')::boolean IS TRUE THEN
        RAISE EXCEPTION 'RATE_LIMIT_FAILURE: 6th request was illegally allowed';
    END IF;
    IF (v_res->>'retry_after_seconds')::integer <= 0 THEN
        RAISE EXCEPTION 'RATE_LIMIT_FAILURE: retry_after_seconds missing or invalid';
    END IF;
END $$;

SELECT is(
    (public.ht_check_rate_limit('ht:rl:test_bucket_allowed', 5, 3600)->>'allowed')::boolean,
    true,
    '35. Anti-Abuse rate limit permits under max limit'
);

SELECT is(
    (public.ht_check_rate_limit('ht:rl:test_bucket_99', 5, 3600)->>'allowed')::boolean,
    false,
    '36. Anti-Abuse rate limit rejects request exceeding max limit'
);

-- ----------------------------------------------------------------------------
-- ITEM 37: Rate Limit Bucket Expiry Cleanup & Privilege Assertions
-- ----------------------------------------------------------------------------
INSERT INTO public.ht_rate_limit_buckets (bucket_key, request_count, expires_at)
VALUES ('ht:rl:expired_test', 10, now() - INTERVAL '1 hour');

DO $$
BEGIN
    PERFORM public.ht_cleanup_expired_ai_data();
END $$;

SELECT is(
    (SELECT count(*) FROM public.ht_rate_limit_buckets WHERE bucket_key = 'ht:rl:expired_test'),
    0::bigint,
    '37. Expired rate limit buckets cleaned up by retention procedure'
);

-- ----------------------------------------------------------------------------
-- ITEM 38: Executable Privilege Assertion for ht_check_rate_limit
-- ----------------------------------------------------------------------------
SELECT is(
    (has_function_privilege('anon', 'public.ht_check_rate_limit(text, integer, integer)', 'EXECUTE') = false AND
     has_function_privilege('authenticated', 'public.ht_check_rate_limit(text, integer, integer)', 'EXECUTE') = false AND
     has_function_privilege('service_role', 'public.ht_check_rate_limit(text, integer, integer)', 'EXECUTE') = true),
    true,
    '38. Executable privilege assertion: ht_check_rate_limit REVOKED from anon/authenticated, GRANTED to service_role'
);

SELECT * FROM finish();
ROLLBACK;
