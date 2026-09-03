HANDOFF_PROTOCOL_VERSION=1
HANDOFF_KIND=EXECUTOR_CLAIM_ONLY
CONTROLLER_ACCEPTANCE_IMPLIED=NO
CORRECTION_AUTHORITY_ID=LARI-S4-R9-R1-8-8-PUBLIC-BOOKING-TEST10-FIXTURE-REPAIR-20260903-01
FAILED_HOSTED_RUN_ID=33754172010
FAILED_FATAL_STEP=PUBLIC_BOOKING_SQL_EXECUTION_RESULT
FAILED_DATABASE_ERROR=commercial_feature_disabled
SUBJECT_HEAD_UNCHANGED=1402422aecba69a68838ac498bb50a329cafebe9
R9_R1_8_8_SUPPORT_SHA=5f79d96399ba5efdbed7ec1c127db4edb01dfa41
R9_R1_8_8_WORKFLOW_SHA=b86b3c910b4570cdc53518e3f3afb82ac9662c7b
REVIEW_HEAD=b86b3c910b4570cdc53518e3f3afb82ac9662c7b

PUBLIC_BOOKING_TEST10_MARKERS_FAIL_CLOSED=YES
TEST10_TEMP_TENANT_INSERT_PRESENT=YES
TEST10_COMMERCIAL_BOOTSTRAP_PRESENT=YES
TEST10_TEMP_STAFF_INSERT_PRESENT=YES
TEST10_INVALID_STAFF_ASSERTION_PRESENT=YES
TEST10_COMMERCIAL_BOOTSTRAP_BEFORE_STAFF=YES
TEST10_QUOTA_BYPASS_PRESENT=NO
COMMERCIAL_FIXTURE_UNCHANGED=YES
PRODUCT_MIGRATION_CHANGE_COUNT=0
R9_SELFTEST_EXECUTION_RESULT=NOT_OBSERVED_ENVIRONMENT_UNAVAILABLE
LOCAL_PUBLIC_BOOKING_DB_RESULT=NOT_OBSERVED_ENVIRONMENT_UNAVAILABLE

# LARI Final R9 R1.8.8 Public Booking Test10 Commercial Fixture Repair Report

Correction Authority: LARI-S4-R9-R1-8-8-PUBLIC-BOOKING-TEST10-FIXTURE-REPAIR-20260903-01

## Execution Summary
- Addressed hosted run 33754172010 failure where public booking Test 10 failed on staff insert due to `commercial_feature_disabled`.
- Added canonical commercial bootstrap `PERFORM pg_temp.slice4_e2_bootstrap_commercial(v_other_tenant_id);` in Test 10 after temp tenant insert and before temp staff insert.
- Preserved commercial quota enforcement and commercial fixture code intact.
- Updated `scripts/test-r9-contracts-selftest.mjs` with fail-closed regression guards verifying strict marker ordering and prohibiting quota bypass statements in Test 10.
- Pinned workflow checkout ref to R9_R1_8_8_SUPPORT_SHA (5f79d96399ba5efdbed7ec1c127db4edb01dfa41).
- Published exact 2 commits to review branch `control/lari-controller-review/r9-r1-8-8-public-booking-test10-20260903-01`.
