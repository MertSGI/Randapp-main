HANDOFF_PROTOCOL_VERSION=1
HANDOFF_KIND=EXECUTOR_CLAIM_ONLY
CONTROLLER_ACCEPTANCE_IMPLIED=NO
CORRECTION_AUTHORITY_ID=LARI-S4-R9-R1-8-4-SELFTEST-EXECUTABILITY-REPAIR-20260903-01
SUBJECT_HEAD_UNCHANGED=1891cf5d5f5eda5160790edbe359cb0076de0dcf
REVIEW_BRANCH=control/lari-controller-review/r9-r1-8-1-20260903-01
REVIEW_HEAD=0e13bce5c4d180b77baaa92d08748e61e60e37e5
R9_R1_8_4_SUPPORT_SHA=06eaa933c948b6050e87e08f0a64b15dcdf2bd1d
R9_R1_8_4_WORKFLOW_SHA=0e13bce5c4d180b77baaa92d08748e61e60e37e5

CREATE_BOOKING_CANONICAL_IDENTITY_USES_TYPES_ONLY=YES
CREATE_BOOKING_P_KVKK_NAME_ASSERTION_PRESENT=NO
CREATE_BOOKING_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES
SLOT_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES
ELIGIBILITY_FUNCTION_LOCAL_SECURITY_DEFINER_GUARD=YES
TEST21_TO_26_MARKERS_FAIL_CLOSED=YES
SELFTEST_TEST22_NO_STAFF_SERVICE_MAPPING_GUARD=YES
SELFTEST_TEST25_CAUSAL_ISOLATION_GUARD=YES
SELFTEST_TEST26_RESTORE_GUARD=YES
TEST67_EXACT_REGPROCEDURE_GUARDS_PRESERVED=YES
PUBLIC_BOOKING_TEST_VS_CANONICAL_PRODUCT_CONTRACT=PASS
R9_SELFTEST_EXECUTION_RESULT=NOT_OBSERVED_ENVIRONMENT_UNAVAILABLE

# LARI R9-R1.8.4 Selftest Executability + Causal Guard Repair Report

Correction Authority: LARI-S4-R9-R1-8-4-SELFTEST-EXECUTABILITY-REPAIR-20260903-01

## Execution Summary
- Corrected brittle parameter-name contract on create_public_booking identity check in scripts/test-r9-contracts-selftest.mjs.
- Removed non-canonical p_kvkk_consent assertion and replaced function identity check with canonical argument types only (text, uuid, uuid, date, time, text, text, text, boolean, boolean, boolean, text, uuid).
- Implemented function-local SECURITY DEFINER Guards for create_public_booking, get_public_available_slots, and can_accept_public_booking.
- Implemented strict fail-closed markers check for Tests 21-26 and causal isolation / restore guards for Test 22, Test 25, and Test 26.
- Pinned workflow checkout ref to R9_R1_8_4_SUPPORT_SHA (06eaa933c948b6050e87e08f0a64b15dcdf2bd1d).
- Published exact 2 commits on REVIEW branch control/lari-controller-review/r9-r1-8-1-20260903-01.
