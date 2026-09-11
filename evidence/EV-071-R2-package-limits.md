---
evidence_id: EV-071-R2
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
base_canonical_sha: 6732df4568ea0d7d3f71133ede95ce5991058444
branch_name: aos/phase3-package-limits-multibranch-completeness-r2
commit_sha: 271d642f923682e75333701ab78c601436946212
target_phase: PHASE_3_LANE_2_PACKAGE_LIMITS_MULTIBRANCH
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-071-R2: Package Limits & Multi-Branch Completeness (R2 Staff Profile Mapping Correction)

## 1. Summary of Corrections
- Corrected staff branch access check in `public.get_branch_calendar_appointments`:
  - Resolved defect where `staff.id` was erroneously compared directly to `users_profile.id`.
  - Joined `public.staff` on `s.user_profile_id = v_user.id` when verifying explicit branch access (`p_branch_id IS NOT NULL`).
  - Joined `public.staff` on `s_map.user_profile_id = v_user.id` when querying assigned branches on tenant-wide queries (`p_branch_id IS NULL`).
- Maintained:
  - Commercial quota enforcement manifest (`docs/COMMERCIAL_QUOTA_ENFORCEMENT_PATH_MANIFEST.md`).
  - Primary branch invariant trigger reconciled with `idx_unique_primary_branch_per_tenant`.
  - Safe branch deactivation RPC with branch timezone checks.
  - Calendar multi-join tenant integrity across branches, services, and staff.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase3-package-multibranch-contracts.mjs`
- Test execution output: 19/19 contract tests passed.
- Git Commit: `271d642f923682e75333701ab78c601436946212`
- Remote Branch: `origin/aos/phase3-package-limits-multibranch-completeness-r2`
