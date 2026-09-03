HANDOFF_PROTOCOL_VERSION=1
HANDOFF_KIND=EXECUTOR_CLAIM_ONLY
CONTROLLER_ACCEPTANCE_IMPLIED=NO
CORRECTION_AUTHORITY_ID=LARI-S4-R9-R1-8-5-SELFTEST-NORMALIZATION-REPAIR-20260903-01
SUBJECT_HEAD_UNCHANGED=1891cf5d5f5eda5160790edbe359cb0076de0dcf
REVIEW_BRANCH=control/lari-controller-review/r9-r1-8-1-20260903-01
REVIEW_HEAD=1f9087ab4b366f9cb650a67731d649544cbdc12c
R9_R1_8_5_SUPPORT_SHA=23eb3414c8453f97a1fd0400e5416f9b323d743e
R9_R1_8_5_WORKFLOW_SHA=1f9087ab4b366f9cb650a67731d649544cbdc12c

SELF_REFERENTIAL_P_KVKK_CHECK_PRESENT=NO
P_KVKK_LITERAL_PRESENT_IN_SELFTEST=NO
NORMALIZE_SQL_CASE_NORMALIZATION_PRESENT=YES
TEST25_NORMALIZED_EXPECTATION_MATCHES_ACTUAL_SQL=YES
TEST26_NORMALIZED_EXPECTATION_MATCHES_ACTUAL_SQL=YES
PUBLIC_BOOKING_TEST_VS_CANONICAL_PRODUCT_CONTRACT=PASS
R9_SELFTEST_EXECUTION_RESULT=NOT_OBSERVED_ENVIRONMENT_UNAVAILABLE

# LARI R9-R1.8.5 Selftest Normalization Repair Report

Correction Authority: LARI-S4-R9-R1-8-5-SELFTEST-NORMALIZATION-REPAIR-20260903-01

## Execution Summary
- Removed self-referential p_kvkk_consent check from scripts/test-r9-contracts-selftest.mjs.
- Updated normalizeSql to normalize both whitespace and case (.toLowerCase()).
- Verified all string expectations in testPublicBookingSourceContract are compared using case-normalized strings.
- Preserved all canonical argument type identity guards, SECURITY DEFINER Guards, Test 66/67 regprocedure checks, and Test 21-26 causal guards.
- Pinned workflow checkout ref to R9_R1_8_5_SUPPORT_SHA (23eb3414c8453f97a1fd0400e5416f9b323d743e).
- Published exact 2 commits to REVIEW branch control/lari-controller-review/r9-r1-8-1-20260903-01.
