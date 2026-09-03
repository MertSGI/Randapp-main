HANDOFF_PROTOCOL_VERSION=1
HANDOFF_KIND=EXECUTOR_CLAIM_ONLY
CONTROLLER_ACCEPTANCE_IMPLIED=NO
CORRECTION_AUTHORITY_ID=LARI-S4-R9-R1-8-10-TEST23-FIXTURE-FOUNDATION-ISOLATION-20260903-01
FAILED_HOSTED_RUN_ID=33778255089
PRIMARY_FAILURE=PUBLIC_BOOKING_TEST23_COMMERCIAL_FEATURE_DISABLED
SECONDARY_FAILURE=FOUNDATION_TEST32_CROSS_SUITE_APPOINTMENT_CONTAMINATION
SUBJECT_HEAD_UNCHANGED=56b58c9591ce0fd792fe78c10b1938a3e87c63cb
R9_R1_8_10_SUPPORT_SHA=5a38d6c7ac35aab15343e358822c6456d4d1292e
R9_R1_8_10_WORKFLOW_SHA=8a99588136b11910c9f58219926495b84f08f157
REVIEW_HEAD=8a99588136b11910c9f58219926495b84f08f157

## Summary of Changes

1. **Public Booking Test 23 Fixture Repair**: Added `PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_xt_tenant_id);` in `supabase/tests/public_booking_rpc_behavioral_tests.sql` immediately after temporary tenant creation to ensure commercial plan/subscription entitlement bootstrap occurs prior to cross-tenant staff insertion.
2. **Foundation Test 32 Scope Isolation**: Updated `supabase/tests/health_tourism_foundation_server_authority_tests.sql` to scope the appointments count assertion to Health Tourism fixture tenants (`'a1111111-1111-1111-1111-111111111111'` and `'b2222222-2222-2222-2222-222222222222'`), resolving cross-suite appointment count contamination.
3. **Selftest & Contract Guard Updates**: Updated `scripts/test-r9-contracts-selftest.mjs` with fail-closed markers and guards verifying Test 23 commercial bootstrap ordering/quota-bypass absence and Foundation Test 32 tenant scope isolation.
4. **Workflow Pinning**: Created `R9_R1_8_10_WORKFLOW_SHA` pinning checkout ref to `5a38d6c7ac35aab15343e358822c6456d4d1292e`.
