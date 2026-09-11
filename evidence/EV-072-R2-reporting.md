---
evidence_id: EV-072-R2
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
base_canonical_sha: 7c4b2512a8f7baeb88732ace32b51a4f18a46915
branch_name: aos/phase3-reporting-analytics-foundation-r2
commit_sha: ed47a77a28a2c29991a13b22d428f838dba2e114
target_phase: PHASE_3_LANE_3_REPORTING
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-072-R2: Server Reporting Foundation (R2 Staff Profile-to-Staff Mapping Correction)

## 1. Summary of Corrections
- Corrected staff authorization check in reporting analytics RPCs:
  - Eliminated erroneous assumption that `staff.id = users_profile.id`.
  - Enforced canonical relationship: `staff.user_profile_id = v_user.id` (where `v_user.id = auth.uid()`).
- Applied across all staff-scoped branch access and staff performance queries:
  - Branch restriction check against `public.staff_branches` joins `public.staff` on `s.user_profile_id = v_user.id`.
  - Booking analytics branch filter for staff joins `public.staff` on `st.user_profile_id = v_user.id`.
  - Staff performance analytics restricts individual staff row views to `st.user_profile_id = v_user.id`.
- Retained:
  - Canonical `services.price` usage (zero `base_price` references).
  - Explicit `ESTIMATED_REVENUE` classifications with financial limitations disclosed.
  - Accurate metric naming (`occupied_minutes`, `appointment_load`).
  - Bounded pagination (`p_limit`, `p_offset`).
  - Classification of unpopulated attribution fields as `NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH`.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase3-reporting-analytics-contracts.mjs`
- Test execution output: 15/15 contract tests passed.
- Git Commit: `ed47a77a28a2c29991a13b22d428f838dba2e114`
- Remote Branch: `origin/aos/phase3-reporting-analytics-foundation-r2`
