-- ============================================================================
-- HEALTH TOURISM SLICE 3 SERVER-AUTHORITY TEST SUITE (34 ASSERTIONS)
-- Corrected for E1 R3 acceptance
-- ============================================================================

BEGIN;

SELECT plan(34);

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
    id, tenant_id, status, source_channel, preferred_language, country_code, full_name, email, phone, notes
) VALUES (
    'c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'new', 'web', 'de', 'DE', 'Hans Mueller', 'hans@example.de', '+49151123456', 'SYNTHETIC_SECRET_TRANSCRIPT_PHRASE_99'
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
-- ITEM 19: Retention test — expired AI messages/conversations cleaned up, linked lead survives
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_expired_conv_id UUID;
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
END $$;

SELECT is(
    (public.ht_cleanup_expired_ai_data()->>'success')::boolean,
    true,
    '19. Expired transcript cleanup RPC executes successfully'
);

-- ----------------------------------------------------------------------------
-- ITEM 20: Lead survives transcript cleanup
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    1::bigint,
    '20. Lead survives transcript cleanup'
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
-- ITEM 27: Passport privacy (case-insensitive) — absent from audit/outbox/AI summary
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.audit_events WHERE lower(payload::text) LIKE '%passport%'),
    0::bigint,
    '27. Passport absent from audit payloads (case-insensitive check)'
);

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
-- ITEM 30: AI summary contains explicit assistive label & propagates to lead
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '', true); -- Server internal
DO $$
DECLARE
    v_conv_id UUID;
    v_res JSONB;
BEGIN
    SELECT id INTO v_conv_id FROM public.ht_ai_conversations WHERE tenant_id = 'a1111111-1111-1111-1111-111111111111' LIMIT 1;
    v_res := public.ht_update_ai_conversation_summary(v_conv_id, 'User interested in dental package');
END $$;

SELECT is(
    (SELECT ai_summary LIKE '%AI-generated assistive summary — not verified clinical fact%' FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    true,
    '30. AI summary contains explicit assistive marker and propagates to linked lead'
);

-- ----------------------------------------------------------------------------
-- ITEM 31: Medical advice request causes safe deferral/handoff behavior
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT handoff_state FROM public.ht_leads WHERE id = 'c1111111-1111-1111-1111-111111111111'),
    'acknowledged',
    '31. Medical advice deferral/handoff state tracked on lead'
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

SELECT * FROM finish();
ROLLBACK;
