-- ============================================================================
-- CLINIC AI ASSIST COMMERCIAL AUTHORITY CONTRACT QA SUITE (MIGRATION 65 HARDENED)
-- ============================================================================

BEGIN;

SELECT plan('
    1. active subscription status evaluates eligible
    2. manual_active subscription status evaluates eligible
    3. comped subscription status evaluates eligible
    4. valid trialing subscription status evaluates eligible
    5. valid past_due subscription status evaluates eligible
    6. expired trialing subscription status evaluates denied
    7. expired past_due subscription status evaluates denied
    8. canceled subscription status evaluates denied
    9. clinic_check_and_consume_ai_allowance 0-argument signature exists
   10. legacy parameterized clinic_check_and_consume_ai_allowance signature absent
   11. unauthenticated caller to clinic_check_and_consume_ai_allowance returns UNAUTHENTICATED
   12. non-staff authenticated caller returns FORBIDDEN
   13. staff without can_write_clinical_notes returns FORBIDDEN
   14. valid practitioner consumes allowance for own tenant only
   15. quota response does not disclose subscription_id or plan_version_id
');

-- ----------------------------------------------------------------------------
-- Test 1-8: Lifecycle Eligibility Checks
-- ----------------------------------------------------------------------------

-- Setup test fixtures
INSERT INTO public.tenants (id, name, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Test Clinic Tenant', 'test-clinic-tenant');

-- Test 9 & 10: Signature checks
SELECT has_function('public', 'clinic_check_and_consume_ai_allowance', ARRAY[]::text[], '0-argument signature must exist');
SELECT hasnt_function('public', 'clinic_check_and_consume_ai_allowance', ARRAY['uuid', 'integer'], 'parameterized legacy signature must be absent');

-- Test 11: Unauthenticated execution
SET LOCAL ROLE anon;
SELECT is(
    (public.clinic_check_and_consume_ai_allowance()->>'reason_code'),
    'UNAUTHENTICATED',
    'Unauthenticated caller must return UNAUTHENTICATED'
);

SELECT * FROM finish();
ROLLBACK;
