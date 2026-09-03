HANDOFF_PROTOCOL_VERSION=1
HANDOFF_KIND=EXECUTOR_CLAIM_ONLY
CONTROLLER_ACCEPTANCE_IMPLIED=NO
CORRECTION_AUTHORITY_ID=LARI-S4-R9-R1-8-10-1-SELFTEST-REGION-REPAIR-20260903-01
REPLACEMENT_FOR_REVIEW_HEAD=8a99588136b11910c9f58219926495b84f08f157
SUBJECT_HEAD_UNCHANGED=56b58c9591ce0fd792fe78c10b1938a3e87c63cb
R9_R1_8_10_1_SUPPORT_SHA=a200924a6f0dc946f60342de2b07d827ee256b56
R9_R1_8_10_1_WORKFLOW_SHA=6cb828065b814c866657a4c799af2a535455a8e9
REVIEW_HEAD=6cb828065b814c866657a4c799af2a535455a8e9

## Summary of Changes

1. **Restored Exact Test23 Comment Marker**: Retained `-- TEST 23: Cross-tenant staff returns invalid_staff` without alteration in `supabase/tests/public_booking_rpc_behavioral_tests.sql` while preserving `PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_xt_tenant_id);` commercial bootstrap prior to staff insertion.
2. **Region-Bounded Foundation Test32 Selftest Guard**: Updated `scripts/test-r9-contracts-selftest.mjs` to isolate the `foundationScopeRegion` between `-- 14. Verify Scope Isolation` and `SELECT finish();`, deriving `test32Region` around the single `No Core appointments created...` assertion message to verify tenant-scoped assertions.
3. **Workflow Pinning**: Created `R9_R1_8_10_1_WORKFLOW_SHA` (`6cb828065b814c866657a4c799af2a535455a8e9`) pinning checkout ref to `R9_R1_8_10_1_SUPPORT_SHA` (`a200924a6f0dc946f60342de2b07d827ee256b56`).
