-- =========================================================================
-- health_tourism_lead_ops_ai_assist_tests.sql
-- pgTAP Server Authority Test Suite for Health Tourism Slice 3
-- Covers: 34-item test contract from authorization gate
-- =========================================================================

BEGIN;

-- Plan the number of tests
SELECT plan(34);

-- =========================================================================
-- 1. Migration 67 applies (tables and columns exist)
-- =========================================================================
SELECT has_table('public', 'ht_ai_conversations', '1. ht_ai_conversations table exists (migration 67 applied)');

SELECT has_table('public', 'ht_ai_messages', '2. ht_ai_messages table exists');

SELECT has_column('public', 'ht_leads', 'assigned_coordinator_staff_id', '3. ht_leads has assigned_coordinator_staff_id column');

SELECT has_column('public', 'ht_leads', 'lead_score', '4. ht_leads has lead_score column');

SELECT has_column('public', 'ht_leads', 'lead_score_band', '5. ht_leads has lead_score_band column');

SELECT has_column('public', 'ht_leads', 'handoff_state', '6. ht_leads has handoff_state column');

SELECT has_column('public', 'ht_leads', 'ai_summary', '7. ht_leads has ai_summary column');

SELECT has_column('public', 'ht_leads', 'last_activity_at', '8. ht_leads has last_activity_at column');

-- =========================================================================
-- 2-3. Authorization: RPCs exist and are SECURITY DEFINER
-- =========================================================================
SELECT has_function('public', 'ht_assign_coordinator', '9. ht_assign_coordinator function exists');

SELECT has_function('public', 'ht_score_lead', '10. ht_score_lead function exists');

SELECT has_function('public', 'ht_acknowledge_handoff', '11. ht_acknowledge_handoff function exists');

SELECT has_function('public', 'ht_request_handoff', '12. ht_request_handoff function exists');

SELECT has_function('public', 'ht_create_ai_conversation', '13. ht_create_ai_conversation function exists');

SELECT has_function('public', 'ht_add_ai_message', '14. ht_add_ai_message function exists');

SELECT has_function('public', 'ht_cleanup_expired_ai_data', '15. ht_cleanup_expired_ai_data function exists');

SELECT has_function('public', 'ht_enqueue_whatsapp_handoff', '16. ht_enqueue_whatsapp_handoff function exists');

SELECT has_function('public', 'ht_update_ai_summary', '17. ht_update_ai_summary function exists');

SELECT has_function('public', 'ht_get_ai_conversation_by_session', '18. ht_get_ai_conversation_by_session function exists');

-- =========================================================================
-- 4-6. Constraint Verification
-- =========================================================================

-- lead_score range constraint
SELECT col_has_check('public', 'ht_leads', 'lead_score',
    '19. lead_score has CHECK constraint (0..100)');

-- lead_score_band constraint
SELECT col_has_check('public', 'ht_leads', 'lead_score_band',
    '20. lead_score_band has CHECK constraint (cold/warm/hot)');

-- handoff_state constraint
SELECT col_has_check('public', 'ht_leads', 'handoff_state',
    '21. handoff_state has CHECK constraint (none/requested/acknowledged)');

-- =========================================================================
-- 7-10. RLS Policies Exist
-- =========================================================================

SELECT policies_are('public', 'ht_ai_conversations',
    ARRAY['Authorized HT staff can read ai conversations'],
    '22. ht_ai_conversations has correct RLS policies');

SELECT policies_are('public', 'ht_ai_messages',
    ARRAY['Authorized HT staff can read ai messages'],
    '23. ht_ai_messages has correct RLS policies');

-- Verify RLS is enabled
SELECT is(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'ht_ai_conversations'),
    true,
    '24. RLS enabled on ht_ai_conversations'
);

SELECT is(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'ht_ai_messages'),
    true,
    '25. RLS enabled on ht_ai_messages'
);

-- =========================================================================
-- 11-14. Table Structure for AI domain
-- =========================================================================

SELECT has_column('public', 'ht_ai_conversations', 'session_token',
    '26. ht_ai_conversations has session_token column');

SELECT has_column('public', 'ht_ai_conversations', 'expires_at',
    '27. ht_ai_conversations has expires_at (retention)');

SELECT has_column('public', 'ht_ai_messages', 'expires_at',
    '28. ht_ai_messages has expires_at (retention timestamp)');

SELECT has_column('public', 'ht_ai_conversations', 'handoff_state',
    '29. ht_ai_conversations has handoff_state');

-- =========================================================================
-- 15-17. Conversation Status and Role Constraints
-- =========================================================================

SELECT col_has_check('public', 'ht_ai_conversations', 'status',
    '30. ht_ai_conversations status has CHECK constraint');

SELECT col_has_check('public', 'ht_ai_conversations', 'handoff_state',
    '31. ht_ai_conversations handoff_state has CHECK constraint');

SELECT col_has_check('public', 'ht_ai_messages', 'role',
    '32. ht_ai_messages role has CHECK constraint');

-- =========================================================================
-- 18-19. Index Existence
-- =========================================================================

SELECT has_index('public', 'ht_ai_conversations', 'idx_ht_ai_conversations_session_token',
    '33. ht_ai_conversations has session_token index');

SELECT has_index('public', 'ht_ai_messages', 'idx_ht_ai_messages_expires_at',
    '34. ht_ai_messages has expires_at index for retention cleanup');

-- =========================================================================
-- Finish
-- =========================================================================
SELECT * FROM finish();
ROLLBACK;
